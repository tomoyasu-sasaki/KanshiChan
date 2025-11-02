/**
 * オーディオ統合サービス（メインプロセス）。
 * - Whisper / LLM / TTS を一元化し、レンダラからの IPC 呼び出しを整理する。
 * - 旧来の `processVoiceInput` 依存から段階的に移行する想定。
 */

const { transcribeAudio, validateWhisperEnvironment } = require('./whisper');
const { extractScheduleFromText, inferSettingsCommands, generateChatReply, inferTaskCommands } = require('./llm');

/**
 * 音声データを Whisper に渡して文字起こしする。
 * - Whisper CLI は外部プロセス呼び出しなので、エラー時は詳細メッセージを返す。
 * @param {{audioDataBase64:string, language?:string}} payload
 * @returns {Promise<{success:true, transcribedText:string}>}
 */
async function transcribe(payload) {
  const { audioDataBase64, language = 'ja' } = payload || {};
  if (!audioDataBase64 || typeof audioDataBase64 !== 'string') {
    throw new Error('音声データが指定されていません');
  }

  const transcription = await transcribeAudio(audioDataBase64, { language });
  return {
    success: true,
    transcribedText: transcription,
  };
}

/**
 * プロファイルごとに LLM / ルールベース推論を実行する。
 * - schedule: JSON構造化
 * - settings: ルールベース
 * - chat: カジュアル応答
 * @param {string} profileId
 * @param {string} text
 * @param {object} context
 * @returns {Promise<object>}
 */
async function infer(profileId, text, context = {}) {
  if (!profileId) {
    throw new Error('profileId が指定されていません');
  }
  if (!text || typeof text !== 'string') {
    throw new Error('テキストが空です');
  }

  const trimmed = text.trim();

  switch (profileId) {
    case 'schedule': {
      const schedules = await extractScheduleFromText(trimmed);
      return {
        success: true,
        transcribedText: trimmed,
        schedules,
      };
    }
    case 'tasks': {
      const tasks = Array.isArray(context.tasks) ? context.tasks : [];
      const schedules = Array.isArray(context.schedules) ? context.schedules : [];
      const { commands } = await inferTaskCommands(trimmed, { tasks, schedules });
      return {
        success: true,
        commands,
      };
    }
    case 'settings': {
      let warnings = [];
      try {
        const { commands, warnings: llmWarnings } = await inferSettingsCommands(trimmed, {
          availableSettings: Array.isArray(context.availableSettings) ? context.availableSettings : undefined,
        });
        if (commands.length > 0) {
          return {
            success: true,
            commands,
            warnings: llmWarnings || [],
          };
        }
        warnings = [
          ...(Array.isArray(llmWarnings) ? llmWarnings : []),
          'LLM が操作を特定できなかったため単純解析に切り替えました',
        ];
      } catch (error) {
        console.warn('[Audio] LLM 設定解析に失敗しました。フォールバックを使用します:', error);
        warnings = [`LLM 解析に失敗したためフォールバックを使用しました: ${error.message}`];
      }

      const commands = buildSettingsCommands(trimmed);
      return {
        success: true,
        commands,
        warnings,
      };
    }
    case 'chat': {
      const history = Array.isArray(context.history) ? context.history : [];
      const { reply, segments } = await generateChatReply(trimmed, { history });
      return {
        success: true,
        reply,
        segments,
      };
    }
    default:
      throw new Error(`未対応のプロファイルです: ${profileId}`);
  }
}

/**
 * Whisper / LLM の利用可否をまとめて返す。
 * - UI 側で初期セットアップの案内に使用。
 * @returns {Promise<{available:boolean, models:object, errors:string[]}>}
 */
async function checkAvailability() {
  const status = {
    available: false,
    models: {
      whisper: false,
      llm: false,
    },
    errors: [],
  };

  try {
    await validateWhisperEnvironment();
    status.models.whisper = true;
  } catch (error) {
    status.errors.push(`Whisper: ${error.message}`);
  }

  try {
    const { loadLLMModel } = require('./llm');
    await loadLLMModel();
    status.models.llm = true;
  } catch (error) {
    status.errors.push(`LLM: ${error.message}`);
  }

  status.available = status.models.whisper && status.models.llm;
  return status;
}

/**
 * 発話テキストから設定変更コマンドを抽出する。
 * - LLM を通さずシンプルな操作を高速に処理するためのフォールバック。
 * @param {string} text
 * @returns {Array<{key:string, action:string, value:any}>}
 */
function buildSettingsCommands(text) {
  const commands = [];
  const normalized = text.toLowerCase();

  SETTINGS_BOOLEAN_TARGETS.forEach((target) => {
    const match = target.matchAll
      ? target.keywords.every((keyword) => normalized.includes(keyword))
      : target.keywords.some((keyword) => normalized.includes(keyword));
    if (match) {
      const value = inferBooleanFromText(normalized);
      if (value !== null) {
        commands.push({ key: target.key, action: 'set', value });
      }
    }
  });

  SETTINGS_NUMBER_TARGETS.forEach((target) => {
    const match = target.matchAll
      ? target.keywords.every((keyword) => normalized.includes(keyword))
      : target.keywords.some((keyword) => normalized.includes(keyword));
    if (match) {
      const value = extractNumber(normalized);
      if (value !== null) {
        commands.push({ key: target.key, action: 'set', value });
      }
    }
  });

  return commands;
}

const SETTINGS_BOOLEAN_TARGETS = [
  { key: 'phoneAlertEnabled', keywords: ['スマホ', 'phone'] },
  { key: 'absenceAlertEnabled', keywords: ['離席', '不在'] },
  { key: 'soundEnabled', keywords: ['音', 'サウンド'] },
  { key: 'desktopNotification', keywords: ['通知'] },
  { key: 'showDetections', keywords: ['オーバーレイ', '検知表示'] },
  { key: 'previewEnabled', keywords: ['プレビュー', '画面表示'] },
  { key: 'yoloEnabled', keywords: ['yolo', '検知モデル'] },
];

const SETTINGS_NUMBER_TARGETS = [
  { key: 'phoneThreshold', keywords: ['スマホ', '秒'], matchAll: true },
  { key: 'phoneConfidence', keywords: ['スマホ', '感度'], matchAll: true },
  { key: 'absenceThreshold', keywords: ['離席', '秒'], matchAll: true },
  { key: 'absenceConfidence', keywords: ['離席', '感度'], matchAll: true },
];

/**
 * ON/OFF 指示を判定する。
 * @param {string} text 正規化済みテキスト
 * @returns {boolean|null}
 */
function inferBooleanFromText(text) {
  const positive = ['オン', 'on', '有効', 'enable', 'つけ', '開始'];
  const negative = ['オフ', 'off', '無効', 'disable', '止め', '消して', '切って'];
  const hasPositive = positive.some((token) => text.includes(token));
  const hasNegative = negative.some((token) => text.includes(token));
  if (hasPositive && !hasNegative) {
    return true;
  }
  if (hasNegative && !hasPositive) {
    return false;
  }
  return null;
}

/**
 * 音声に含まれる数値を抽出する。
 * @param {string} text
 * @returns {number|null}
 */
function extractNumber(text) {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

module.exports = {
  transcribe,
  infer,
  checkAvailability,
};
