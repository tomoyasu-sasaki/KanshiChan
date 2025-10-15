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

let resultContainer = null;
let lastVoiceTranscription = '';
let voiceCommandBusy = false;

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
      handleVoiceCommandResult(result).catch((error) => {
        renderVoiceCommandResult([
          {
            success: false,
            label: 'エラー',
            message: error?.message || '音声コマンド処理中に問題が発生しました',
          },
        ]);
      });
    },
    onError: (error) => {
      renderVoiceCommandResult([
        {
          success: false,
          label: 'エラー',
          message: error?.message || '音声コマンドを処理できませんでした',
        },
      ]);
    },
  });
}

/**
 * 音声推論結果を解析し、設定へ適用・保存する。
 * - 他セクションが Busy の場合はコマンドを拒否し、競合を防ぐ。
 */
async function handleVoiceCommandResult(result) {
  if (voiceCommandBusy) {
    renderVoiceCommandResult([
      {
        success: false,
        label: '処理中',
        message: '前のコマンドを処理中です。少し待ってからもう一度お試しください。',
      },
    ]);
    return;
  }

  if (isTypingSettingsBusy() || isSlackBusy()) {
    renderVoiceCommandResult([
      {
        success: false,
        label: '操作保留',
        message: '現在別の設定操作を処理中のため音声コマンドを受け付けませんでした。',
      },
    ]);
    return;
  }

  voiceCommandBusy = true;

  let commands = Array.isArray(result?.commands) ? [...result.commands] : [];
  if (commands.length === 0) {
    const fallback = extractFallbackCommands(lastVoiceTranscription);
    if (fallback.length > 0) {
      commands = fallback;
    }
  }

  if (commands.length === 0) {
    renderVoiceCommandResult([
      {
        success: false,
        label: '未検出',
        message: '変更対象の設定を特定できませんでした。別の言い回しで試してください。',
      },
    ]);
    voiceCommandBusy = false;
    return;
  }

  const results = commands.map((command) => applySingleVoiceCommand(command));
  const shouldPersist = results.some((entry) => entry.success);

  if (shouldPersist) {
    try {
      await handleSaveSettings();
    } catch (error) {
      results.push({
        success: false,
        label: '保存',
        message: error?.message || '設定の保存に失敗しました',
      });
    }
  }

  renderVoiceCommandResult(results);
  voiceCommandBusy = false;
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
    card.className = `result-card ${entry.success ? 'success' : 'error'}`;

    const title = document.createElement('strong');
    title.textContent = entry.label || '設定';
    card.appendChild(title);

    if (entry.message) {
      const messageEl = document.createElement('span');
      messageEl.textContent = entry.message;
      card.appendChild(messageEl);
    }

    resultContainer.appendChild(card);
  });
}

/**
 * 単一の音声コマンドをフォーム上の要素へ反映する。
 * - シノニム検索や UI 要素の欠如など、失敗理由を詳細に返す。
 */
function applySingleVoiceCommand(command) {
  const key = command?.key || findSettingsKeyBySynonym(command?.target) || findSettingsKeyBySynonym(command?.label);
  const entry = SETTINGS_VOICE_MAP[key];
  if (!entry) {
    return {
      success: false,
      label: command?.key || '不明な設定',
      message: 'この設定は音声操作に対応していません',
    };
  }

  const element = document.getElementById(entry.elementId);
  if (!element) {
    return {
      success: false,
      label: entry.label,
      message: '該当する UI 要素が見つかりませんでした',
    };
  }

  try {
    if (entry.type === 'boolean') {
      const resolved = resolveBooleanValue(command, element);
      if (resolved === null) {
        return {
          success: false,
          label: entry.label,
          message: 'ON/OFF の意図を判別できませんでした',
        };
      }
      element.checked = resolved;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      updateLinkedDisplays(entry.key, resolved);
      return {
        success: true,
        label: entry.label,
        message: resolved ? 'オンに変更しました' : 'オフに変更しました',
      };
    }

    if (entry.type === 'number') {
      const value = resolveNumberValue(command, entry);
      if (value === null) {
        return {
          success: false,
          label: entry.label,
          message: '数値が認識できませんでした',
        };
      }
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      updateLinkedDisplays(entry.key, value);
      return {
        success: true,
        label: entry.label,
        message: `${value}${entry.unit || ''} に設定しました`,
      };
    }

    if (entry.type === 'select') {
      const matchedValue = resolveSelectValue(command, element);
      if (!matchedValue) {
        return {
          success: false,
          label: entry.label,
          message: '指定された値に一致する話者が見つかりませんでした',
        };
      }
      element.value = matchedValue;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        label: entry.label,
        message: `${element.selectedOptions[0]?.textContent || '選択肢'} を選びました`,
      };
    }
  } catch (error) {
    return {
      success: false,
      label: entry.label,
      message: error?.message || '操作に失敗しました',
    };
  }

  return {
    success: false,
    label: entry.label,
    message: '未対応の設定タイプです',
  };
}

/**
 * 真偽値の声コマンドを推論し、曖昧なら null で後続へ委ねる。
 * - toggle 指定時は現状の UI 状態をベースに反転させる。
 */
function resolveBooleanValue(command, element) {
  if (command?.action === 'toggle') {
    return !element.checked;
  }

  const rawValue = command?.value;
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  const normalized = String(rawValue ?? '').trim().toLowerCase();
  if (!normalized && lastVoiceTranscription) {
    return inferBooleanFromText(lastVoiceTranscription);
  }

  if (!normalized) {
    return null;
  }

  if (['on', 'enable', 'enabled', 'true', '1', 'オン', '有効', 'つけて', '点けて', '開始'].some((word) => normalized.includes(word))) {
    return true;
  }
  if (['off', 'disable', 'disabled', 'false', '0', 'オフ', '無効', '止めて', '消して', '切って'].some((word) => normalized.includes(word))) {
    return false;
  }
  return null;
}

/**
 * 数値入力の声コマンドを正規化し、設定範囲へ丸める。
 * - 音声認識の曖昧さを吸収するため、最後の生テキストからも抽出する。
 */
function resolveNumberValue(command, entry) {
  let numeric = null;
  if (command && command.value !== undefined && command.value !== null) {
    numeric = Number(command.value);
  }

  if ((numeric === null || Number.isNaN(numeric)) && typeof lastVoiceTranscription === 'string') {
    const match = lastVoiceTranscription.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      numeric = Number(match[1]);
    }
  }

  if (numeric === null || Number.isNaN(numeric)) {
    return null;
  }

  const clamped = Math.min(entry.max, Math.max(entry.min, numeric));
  const stepped = Math.round(clamped / entry.step) * entry.step;
  return entry.step % 1 === 0 ? String(stepped) : stepped.toFixed(1);
}

/**
 * セレクトボックスに対する音声指示を解決する。
 * - value, label の両方で照合し、日本語音声でもヒットするようにする。
 */
function resolveSelectValue(command, selectEl) {
  const raw = command?.value || '';
  if (!raw) {
    return null;
  }
  const normalized = String(raw).trim();
  const options = Array.from(selectEl.options);
  const directMatch = options.find((option) => option.value === normalized);
  if (directMatch) {
    return directMatch.value;
  }

  const partialMatch = options.find((option) => option.textContent && option.textContent.includes(normalized));
  return partialMatch ? partialMatch.value : null;
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
      const boolValue = inferBooleanFromText(text);
      if (boolValue !== null) {
        commands.push({ key: entry.key, action: 'set', value: boolValue });
      }
      return;
    }

    if (entry.type === 'number') {
      const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (match) {
        commands.push({ key: entry.key, action: 'set', value: Number(match[1]) });
      }
      return;
    }

    if (entry.type === 'select') {
      const options = getSpeakerOptions();
      const matched = options.find((option) => text.includes(option.label));
      if (matched) {
        commands.push({ key: entry.key, action: 'set', value: matched.id });
      }
    }
  });

  return commands;
}

/**
 * 日本語/英語の ON/OFF 表現から意図を推測する。
 * - 相反する語が同時に含まれている場合は null を返し、ユーザーに再指示を求める。
 */
function inferBooleanFromText(text) {
  if (!text) {
    return null;
  }
  const hasOn = ['オン', '有効', '付けて', 'つけて', '開始', 'enable'].some((word) => text.includes(word));
  const hasOff = ['オフ', '無効', '止めて', '消して', '切って', 'disable'].some((word) => text.includes(word));
  if (hasOn && !hasOff) {
    return true;
  }
  if (hasOff && !hasOn) {
    return false;
  }
  return null;
}
