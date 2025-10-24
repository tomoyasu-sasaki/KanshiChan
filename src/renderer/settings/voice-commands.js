/**
 * 設定ドロワーの音声コマンド制御。
 * - 音声 UI からの結果を設定フォームへ適用し、保存までを一括で担う。
 */
import { AudioInputControl } from '../components/audio-input-control.js';
import { SETTINGS_VOICE_MAP, findSettingsKeyBySynonym } from '../../constants/settingsVoiceMap.js';
import { getSpeakerOptions } from '../../constants/voicevox-speakers.js';
import { handleSaveSettings, updateLinkedDisplays } from './core.js';
import { isSlackBusy } from './slack.js';
import { isTypingSettingsBusy } from './typing.js';
import { findKeyForPhrase, recordUnresolvedPhrase } from './voice-dictionary-store.js';
import {
  VOICE_POSITIVE_TOKENS,
  VOICE_NEGATIVE_TOKENS,
  VOICE_TOGGLE_TOKENS,
  VOICE_INCREASE_TOKENS,
  VOICE_DECREASE_TOKENS,
  includesVoiceToken,
  normalizeVoiceTokens,
} from '../../constants/voice-patterns.js';

let resultContainer = null;
let lastVoiceTranscription = '';
const commandQueue = [];
let isProcessingQueue = false;
const QUEUE_RETRY_DELAY_MS = 600;

/**
 * 音声入力コンポーネントを初期化し、結果ハンドラを束ねる。
 * - Busy 状態やエラー表示の統一制御をここに閉じ込める。
 */
export function initializeVoiceCommandSection() {
  resultContainer = document.getElementById('settingsVoiceResult');
  const controlRoot = document.getElementById('settingsVoiceControl');

  if (!controlRoot || !resultContainer) {
    return;
  }

  new AudioInputControl(controlRoot, {
    promptProfile: 'settings',
    contextId: 'settings-drawer',
    title: '音声で設定変更',
    description: '例:「通知をオフ」「スマホアラートを70秒に」',
    onTranscription: (text) => {
      lastVoiceTranscription = text || '';
    },
    onResult: (result) => {
      enqueueVoiceCommand(result);
    },
    onError: (error) => {
      renderVoiceCommandResult([
        {
          status: 'error',
          label: 'エラー',
          message: error?.message || '音声コマンドを処理できませんでした',
        },
      ]);
    },
  });
}

function enqueueVoiceCommand(result) {
  commandQueue.push({ result, transcription: lastVoiceTranscription, enqueuedAt: Date.now() });
  processVoiceCommandQueue().catch((error) => {
    console.error('[Settings] 音声コマンドキュー実行エラー:', error);
    renderVoiceCommandResult([
      {
        status: 'error',
        label: 'エラー',
        message: error?.message || '音声コマンドキューの処理中に問題が発生しました',
      },
    ]);
  });
}

async function processVoiceCommandQueue() {
  if (isProcessingQueue || commandQueue.length === 0) {
    return;
  }
  isProcessingQueue = true;

  while (commandQueue.length > 0) {
    const job = commandQueue[0];
    const result = await executeVoiceCommandJob(job);
    if (!result.processed) {
      if (result.requeue) {
        setTimeout(() => {
          processVoiceCommandQueue().catch((error) => {
            console.error('[Settings] 音声コマンド再実行エラー:', error);
          });
        }, QUEUE_RETRY_DELAY_MS);
      }
      break;
    }
    commandQueue.shift();
  }

  isProcessingQueue = false;

  if (commandQueue.length > 0) {
    setTimeout(() => {
      processVoiceCommandQueue().catch((error) => {
        console.error('[Settings] 音声コマンド継続処理エラー:', error);
      });
    }, 0);
  }
}

async function executeVoiceCommandJob(job) {
  if (isTypingSettingsBusy() || isSlackBusy()) {
    renderVoiceCommandResult([
      {
        status: 'retry',
        label: '操作保留',
        message: '別の設定操作を処理中のため少し待ってから再実行します…',
      },
    ]);
    return { processed: false, requeue: true };
  }

  const commands = prepareCommandList(job.result, job.transcription);
  if (commands.length === 0) {
    renderVoiceCommandResult([
      {
        status: 'error',
        label: '未検出',
        message: '変更対象の設定を特定できませんでした。別の言い回しで試してください。',
      },
    ]);
    return { processed: true };
  }

  const outcomes = commands.map((command) => applySingleVoiceCommand(command));
  const shouldPersist = outcomes.some((entry) => entry.status === 'success');

  if (shouldPersist) {
    try {
      await handleSaveSettings();
    } catch (error) {
      outcomes.push({
        status: 'error',
        label: '保存',
        message: error?.message || '設定の保存に失敗しました',
      });
    }
  }

  renderVoiceCommandResult(outcomes);
  return { processed: true };
}

function prepareCommandList(result, transcriptionText) {
  let commands = Array.isArray(result?.commands) ? [...result.commands] : [];
  if (commands.length === 0) {
    const fallback = extractFallbackCommands(transcriptionText);
    if (fallback.length > 0) {
      commands = fallback;
    }
  }
  return commands.map((command) => ({
    ...command,
    sourceText: command?.sourceText || transcriptionText || lastVoiceTranscription || '',
    phrase: command?.phrase || command?.label || command?.target || command?.value || '',
  }));
}

/**
 * 音声結果カードを描画し、成功/失敗の要因を示す。
 * - 複数コマンドの結果を一覧化してユーザーが追跡しやすくする。
 */
function renderVoiceCommandResult(entries) {
  if (!resultContainer) {
    return;
  }
  resultContainer.innerHTML = '';

  entries.forEach((entry) => {
    const card = document.createElement('div');
    const status = entry.status || (entry.success ? 'success' : 'error');
    card.className = `result-card result-${status}`;

    const title = document.createElement('strong');
    title.textContent = entry.label || '設定';
    card.appendChild(title);

    if (entry.message) {
      const messageEl = document.createElement('span');
      messageEl.textContent = entry.message;
      card.appendChild(messageEl);
    }

    if (Array.isArray(entry.suggestions) && entry.suggestions.length > 0) {
      const list = document.createElement('ul');
      list.className = 'result-suggestions';
      entry.suggestions.forEach((suggestion) => {
        const li = document.createElement('li');
        li.textContent = suggestion;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    resultContainer.appendChild(card);
  });
}

/**
 * 単一の音声コマンドをフォーム上の要素へ反映する。
 * - シノニム検索や UI 要素の欠如など、失敗理由を詳細に返す。
 */
function applySingleVoiceCommand(command) {
  const key = resolveVoiceCommandKey(command);
  const entry = key ? SETTINGS_VOICE_MAP[key] : null;
  if (!entry) {
    noteUnresolvedCommand(command);
    return {
      status: 'error',
      label: command?.key || '不明な設定',
      message: 'この設定は音声操作に対応していません',
    };
  }

  const element = document.getElementById(entry.elementId);
  if (!element) {
    noteUnresolvedCommand(command);
    return {
      status: 'error',
      label: entry.label,
      message: '該当する UI 要素が見つかりませんでした',
    };
  }

  try {
    if (entry.type === 'boolean') {
      const resolved = resolveBooleanValue(command, element, entry);
      if (resolved === null) {
        noteUnresolvedCommand(command);
        return {
          status: 'confirm',
          label: entry.label,
          message: 'ON/OFF の意図を判別できませんでした。もう一度指示してください。',
        };
      }
      element.checked = resolved;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      updateLinkedDisplays(entry.key, resolved);
      return {
        status: 'success',
        label: entry.label,
        message: resolved ? 'オンに変更しました' : 'オフに変更しました',
      };
    }

    if (entry.type === 'number') {
      const value = resolveNumberValue(command, entry, element);
      if (value === null) {
        noteUnresolvedCommand(command);
        return {
          status: 'confirm',
          label: entry.label,
          message: '数値が認識できませんでした。具体的な値を指定してください。',
        };
      }
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      updateLinkedDisplays(entry.key, value);
      return {
        status: 'success',
        label: entry.label,
        message: `${value}${getNumericUnit(entry)} に設定しました`,
      };
    }

    if (entry.type === 'select') {
      const selectResolution = resolveSelectValue(command, element);
      if (!selectResolution.value) {
        if (!selectResolution.suggestions?.length) {
          noteUnresolvedCommand(command);
        }
        return {
          status: selectResolution.suggestions?.length ? 'confirm' : 'error',
          label: entry.label,
          message: selectResolution.suggestions?.length
            ? '候補が複数見つかりました。希望する話者を選んでください。'
            : '指定された値に一致する話者が見つかりませんでした',
          suggestions: selectResolution.suggestions || [],
        };
      }
      element.value = selectResolution.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        status: 'success',
        label: entry.label,
        message: `${element.selectedOptions[0]?.textContent || '選択肢'} を選びました`,
      };
    }
  } catch (error) {
    noteUnresolvedCommand(command);
    return {
      status: 'error',
      label: entry.label,
      message: error?.message || '操作に失敗しました',
    };
  }

  return {
    status: 'error',
    label: entry.label,
    message: '未対応の設定タイプです',
  };
}

/**
 * 真偽値の声コマンドを推論し、曖昧なら null で後続へ委ねる。
 * - toggle 指定時は現状の UI 状態をベースに反転させる。
 */
function resolveBooleanValue(command, element, entry) {
  const transcriptValue = normalizeTranscript(command?.value);
  const toggleTokens = collectIntentTokens(entry, 'toggle', VOICE_TOGGLE_TOKENS);
  const onTokens = collectIntentTokens(entry, 'on', VOICE_POSITIVE_TOKENS);
  const offTokens = collectIntentTokens(entry, 'off', VOICE_NEGATIVE_TOKENS);

  if (command?.action === 'toggle' || includesVoiceToken(transcriptValue, toggleTokens)) {
    return !element.checked;
  }

  if (typeof command?.value === 'boolean') {
    return command.value;
  }

  if (transcriptValue) {
    if (includesVoiceToken(transcriptValue, onTokens)) {
      return true;
    }
    if (includesVoiceToken(transcriptValue, offTokens)) {
      return false;
    }
  }

  if (typeof command?.value === 'number') {
    if (command.value > 0) {
      return true;
    }
    if (command.value === 0) {
      return false;
    }
  }

  const fallbackTranscript = transcriptValue || normalizeTranscript(lastVoiceTranscription);
  if (!fallbackTranscript) {
    return null;
  }
  return inferBooleanFromText(fallbackTranscript, entry);
}

/**
 * 数値入力の声コマンドを正規化し、設定範囲へ丸める。
 * - 音声認識の曖昧さを吸収するため、最後の生テキストからも抽出する。
 */
function resolveNumberValue(command, entry, element) {
  const numericMeta = getNumericMeta(entry);
  if (!numericMeta) {
    return null;
  }

  const currentValue = parseNumericValue(element?.value) ?? numericMeta.min ?? 0;
  const transcript = normalizeTranscript(lastVoiceTranscription);
  const commandTranscript = normalizeTranscript(command?.value);
  let action = command?.action || detectNumericIntent(commandTranscript, entry, transcript);

  if (action === 'toggle') {
    action = null;
  }

  if (action === 'increase' || action === 'decrease') {
    const delta = numericMeta.defaultDelta ?? numericMeta.step ?? 1;
    const nextValue = action === 'increase' ? currentValue + delta : currentValue - delta;
    return formatNumericValue(nextValue, numericMeta);
  }

  let numeric = parseNumericValue(command?.value);
  if (numeric === null) {
    numeric = extractNumericFromText(commandTranscript) ?? extractNumericFromText(transcript);
  }

  if (numeric === null) {
    return null;
  }

  return formatNumericValue(numeric, numericMeta);
}

/**
 * セレクトボックスに対する音声指示を解決する。
 * - value, label の両方で照合し、日本語音声でもヒットするようにする。
 */
function resolveSelectValue(command, selectEl) {
  const raw = command?.value || '';
  if (!raw) {
    return { value: null, suggestions: [] };
  }
  const normalized = String(raw).trim();
  const options = Array.from(selectEl.options);
  const directMatch = options.find((option) => option.value === normalized);
  if (directMatch) {
    return { value: directMatch.value, suggestions: [] };
  }

  const partialMatches = options.filter((option) => {
    const label = option.textContent || '';
    return label.includes(normalized);
  });

  if (partialMatches.length === 1) {
    return { value: partialMatches[0].value, suggestions: [] };
  }

  if (partialMatches.length > 1) {
    return {
      value: null,
      suggestions: partialMatches.map((option) => option.textContent || option.value),
    };
  }

  return { value: null, suggestions: [] };
}

/**
 * LLM が結果を返さなかった場合のフォールバックコマンドを抽出する。
 * - シノニムベースでのヒットのみを対象にし、誤検知を抑える。
 */
function extractFallbackCommands(text) {
  if (!text) {
    return [];
  }

  const commands = [];
  Object.values(SETTINGS_VOICE_MAP).forEach((entry) => {
    const hit = entry.synonyms?.find((synonym) => text.includes(synonym));
    if (!hit) {
      return;
    }

    if (entry.type === 'boolean') {
      const boolValue = inferBooleanFromText(text, entry);
      if (boolValue !== null) {
        commands.push({ key: entry.key, action: 'set', value: boolValue, phrase: text });
      }
      return;
    }

    if (entry.type === 'number') {
      const action = detectNumericIntent(null, entry, text);
      if (action === 'increase' || action === 'decrease') {
        commands.push({ key: entry.key, action, phrase: text });
        return;
      }
      const numeric = extractNumericFromText(text);
      if (numeric !== null) {
        commands.push({ key: entry.key, action: 'set', value: numeric, phrase: text });
      }
      return;
    }

    if (entry.type === 'select') {
      const options = getSpeakerOptions();
      const matched = options.find((option) => text.includes(option.label));
      if (matched) {
        commands.push({ key: entry.key, action: 'set', value: matched.id, phrase: text });
      }
    }
  });

  return commands;
}

/**
 * 日本語/英語の ON/OFF 表現から意図を推測する。
 * - 相反する語が同時に含まれている場合は null を返し、ユーザーに再指示を求める。
 */
function inferBooleanFromText(text, entry) {
  if (!text) {
    return null;
  }
  const onTokens = collectIntentTokens(entry, 'on', VOICE_POSITIVE_TOKENS);
  const offTokens = collectIntentTokens(entry, 'off', VOICE_NEGATIVE_TOKENS);
  const hasOn = includesVoiceToken(text, onTokens);
  const hasOff = includesVoiceToken(text, offTokens);
  if (hasOn && !hasOff) {
    return true;
  }
  if (hasOff && !hasOn) {
    return false;
  }
  return null;
}

function normalizeTranscript(value) {
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function collectIntentTokens(entry, intentKey, defaults = []) {
  const intentTokens = Array.isArray(entry?.intents?.[intentKey]) ? entry.intents[intentKey] : [];
  return normalizeVoiceTokens([...intentTokens, ...defaults]);
}

function getNumericMeta(entry) {
  if (!entry?.numeric) {
    return null;
  }
  return entry.numeric;
}

function getNumericUnit(entry) {
  return entry?.numeric?.unit || entry?.unit || '';
}

function detectNumericIntent(commandTranscript, entry, fallbackText = '') {
  const increaseTokens = collectIntentTokens(entry, 'increase', VOICE_INCREASE_TOKENS);
  const decreaseTokens = collectIntentTokens(entry, 'decrease', VOICE_DECREASE_TOKENS);
  const setTokens = collectIntentTokens(entry, 'set', []);

  const aggregatedText = [commandTranscript, fallbackText].filter(Boolean).join(' ');
  if (!aggregatedText) {
    return null;
  }

  if (includesVoiceToken(aggregatedText, increaseTokens) && !includesVoiceToken(aggregatedText, decreaseTokens)) {
    return 'increase';
  }
  if (includesVoiceToken(aggregatedText, decreaseTokens) && !includesVoiceToken(aggregatedText, increaseTokens)) {
    return 'decrease';
  }
  if (includesVoiceToken(aggregatedText, setTokens)) {
    return 'set';
  }
  return null;
}

function parseNumericValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function extractNumericFromText(text) {
  if (!text) {
    return null;
  }
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function formatNumericValue(value, meta) {
  const clamped = Math.min(meta.max, Math.max(meta.min, value));
  const step = meta.step ?? 1;
  const stepped = Math.round(clamped / step) * step;
  if (Number.isInteger(step)) {
    return String(Math.round(stepped));
  }
  return stepped.toFixed(step % 1 === 0 ? 0 : step.toString().split('.')[1]?.length || 1);
}

function resolveVoiceCommandKey(command) {
  const directKey = typeof command?.key === 'string' && SETTINGS_VOICE_MAP[command.key] ? command.key : null;
  if (directKey) {
    return directKey;
  }

  const candidates = [command?.target, command?.label, command?.phrase, command?.value];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const synonymHit = findSettingsKeyBySynonym(candidate);
    if (synonymHit && SETTINGS_VOICE_MAP[synonymHit]) {
      return synonymHit;
    }
    const customHit = findKeyForPhrase(candidate);
    if (customHit && SETTINGS_VOICE_MAP[customHit]) {
      return customHit;
    }
  }

  const transcriptHit = findKeyForPhrase(command?.sourceText || lastVoiceTranscription);
  if (transcriptHit && SETTINGS_VOICE_MAP[transcriptHit]) {
    return transcriptHit;
  }

  return null;
}

function noteUnresolvedCommand(command) {
  const candidate = command?.sourceText || command?.phrase || lastVoiceTranscription;
  if (candidate) {
    recordUnresolvedPhrase(candidate);
  }
}
