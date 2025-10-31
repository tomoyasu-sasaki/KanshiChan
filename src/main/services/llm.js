/**
 * LLM サービス（メインプロセス）。
 * - node-llama-cpp を介してローカル GGUF モデルを扱い、スケジュール抽出とチャット応答を担う。
 * - 毎回コンテキストを作り直し、推論間でトークンがリークしないようにしている。
 * - 依存: node-llama-cpp, models/swallow-8b-v0.5-q4.gguf
 */

const path = require('path');
const fs = require('fs').promises;
const {
  SCHEDULE_EXTRACTION_SYSTEM_PROMPT,
  buildScheduleExtractionUserPrompt,
  SCHEDULE_EXTRACTION_JSON_SCHEMA,
  SETTINGS_COMMAND_SYSTEM_PROMPT,
  buildSettingsCommandUserPrompt,
  SETTINGS_COMMAND_JSON_SCHEMA,
  buildChatPrompt,
} = require('../../constants/llm-prompts');

/**
 * LLM インスタンス（遅延初期化）
 */
let llama = null;
let llmModel = null;
let llmContext = null;

/**
 * デフォルトの LLM モデルパス
 */
const DEFAULT_LLM_MODEL_PATH = path.join(
  __dirname,
  '../../../models/swallow-8b-v0.5-q4.gguf'
);

/**
 * LLM モジュール（node-llama-cpp）を動的にインポート
 * - node-llama-cpp は ESM で top-level await を使用しているため、require() ではなく import() を使用
 */
let nodeLlamaCpp = null;

async function loadNodeLlamaCpp() {
  if (!nodeLlamaCpp) {
    nodeLlamaCpp = await import('node-llama-cpp');
  }
  return nodeLlamaCpp;
}

/**
 * LLM モデルをロードする。
 * - 初回呼び出し時のみモデルファイルを読み込み、インスタンスをキャッシュ。
 * - モデルパスが存在しない場合はエラーをスロー。
 * @param {string} modelPath モデルファイルパス（オプション）
 * @returns {Promise<Object>} LLM インスタンス { model, context }
 * @throws {Error} モデルファイルが存在しない、またはロード失敗時
 */
async function loadLLMModel(modelPath = DEFAULT_LLM_MODEL_PATH) {
  if (llmModel && llmContext) {
    return { model: llmModel, context: llmContext };
  }

  try {
    await fs.access(modelPath);
  } catch (error) {
    throw new Error(
      `LLM モデルが見つかりません: ${modelPath}\n` +
      `models/ ディレクトリに GGUF モデルを配置してください。`
    );
  }

  console.log(`[LLM] モデルをロード中: ${modelPath}`);

  try {
    const { getLlama } = await loadNodeLlamaCpp();

    // まず llama インスタンスを取得
    if (!llama) {
      llama = await getLlama();
    }

    // llama.loadModel() でモデルをロード
    llmModel = await llama.loadModel({
      modelPath,
    });

    // モデルからコンテキストを作成
    llmContext = await llmModel.createContext({
      contextSize: 2048,
    });

    console.log('[LLM] モデルのロードが完了しました');

    return { model: llmModel, context: llmContext };
  } catch (error) {
    console.error('[LLM] モデルロードエラー:', error);
    throw new Error(`LLM モデルのロードに失敗しました: ${error.message}`);
  }
}

const REPEAT_TYPE_ALIASES = Object.freeze({
  weekly: 'weekly',
  week: 'weekly',
  weekdays: 'weekdays',
  weekday: 'weekdays',
  平日: 'weekdays',
  daily: 'daily',
  everyday: 'daily',
  毎日: 'daily',
});

const PRESET_REPEAT_DAYS = Object.freeze({
  weekdays: [1, 2, 3, 4, 5],
  daily: [0, 1, 2, 3, 4, 5, 6],
});

function normalizeRepeatFromLLM(repeat) {
  if (!repeat || typeof repeat !== 'object') {
    return null;
  }

  const rawType = typeof repeat.type === 'string' ? repeat.type.trim().toLowerCase() : '';
  const mappedType = REPEAT_TYPE_ALIASES[rawType] || 'weekly';

  let candidateDays = Array.isArray(repeat.days) ? repeat.days : [];
  if (candidateDays.length === 0 && PRESET_REPEAT_DAYS[mappedType]) {
    candidateDays = PRESET_REPEAT_DAYS[mappedType];
  }

  const normalizedDays = Array.from(
    new Set(
      candidateDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  if (normalizedDays.length === 0) {
    return null;
  }

  return {
    type: 'weekly',
    days: normalizedDays,
  };
}

/**
 * 文字起こしテキストからスケジュール情報を抽出する。
 * - LLM を使用して、自然言語テキストを構造化された JSON に変換。
 * - JSON Schema を強制して、パース可能な形式で取得。
 * @param {string} transcribedText 文字起こしテキスト
 * @returns {Promise<Array<Object>>} スケジュール配列 [{ title, date, time, description }]
 * @throws {Error} LLM 推論失敗、または JSON パース失敗時
 */
async function extractScheduleFromText(transcribedText) {
  if (!transcribedText || typeof transcribedText !== 'string') {
    throw new Error('文字起こしテキストが不正です');
  }

  const { model } = await loadLLMModel();

  if (!model) {
    throw new Error('LLM モデルが初期化されていません');
  }

  console.log(`[LLM] スケジュール抽出開始: "${transcribedText.substring(0, 50)}..."`);

  try {
    const { LlamaChatSession } = await loadNodeLlamaCpp();

    // 毎回新しいコンテキストを作成（シーケンス再利用の問題を回避）
    const tempContext = await model.createContext({
      contextSize: 2048,
    });

    const session = new LlamaChatSession({
      contextSequence: tempContext.getSequence(),
    });

    const userPrompt = buildScheduleExtractionUserPrompt(transcribedText);

    const fullPrompt = `${SCHEDULE_EXTRACTION_SYSTEM_PROMPT}\n\n${userPrompt}`;

    const response = await session.prompt(fullPrompt, {
      maxTokens: 1512,
      temperature: 0.3,
      topP: 0.9,
      stopStrings: ['\n\n', '```'],
    });

    console.log('[LLM] 推論結果:', response);

    // コンテキストのクリーンアップ
    await tempContext.dispose();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM の出力から JSON を抽出できませんでした');
    }

    const parsedResult = JSON.parse(jsonMatch[0]);

    if (!parsedResult.schedules || !Array.isArray(parsedResult.schedules)) {
      throw new Error('LLM の出力に schedules 配列が含まれていません');
    }

    const schedules = parsedResult.schedules.map((item, index) => {
      if (!item) {
        throw new Error(`LLM 出力の schedules[${index}] が不正です`);
      }

      if (!item.ttsMessage || typeof item.ttsMessage !== 'string') {
        throw new Error('LLM の出力に ttsMessage が含まれていません');
      }

      return {
        title: item.title,
        date: item.date,
        time: item.time,
        description: item.description || '',
        ttsMessage: item.ttsMessage.trim(),
        repeat: normalizeRepeatFromLLM(item.repeat),
      };
    });

    console.log(`[LLM] スケジュール抽出完了: ${schedules.length}件`);

    return schedules;
  } catch (error) {
    console.error('[LLM] スケジュール抽出エラー:', error);
    const errorMessage = error?.message || error?.toString() || '不明なエラー';
    throw new Error(`スケジュール抽出に失敗しました: ${errorMessage}`);
  }
}

async function inferSettingsCommands(transcribedText, options = {}) {
  if (!transcribedText || typeof transcribedText !== 'string') {
    throw new Error('文字起こしテキストが不正です');
  }

  const trimmed = transcribedText.trim();
  if (!trimmed) {
    return { commands: [], warnings: ['入力が空のため、設定コマンドを生成できませんでした'] };
  }

  const { model } = await loadLLMModel();
  if (!model) {
    throw new Error('LLM モデルが初期化されていません');
  }

  const { LlamaChatSession } = await loadNodeLlamaCpp();
  const tempContext = await model.createContext({
    contextSize: 1536,
  });

  try {
    const session = new LlamaChatSession({
      contextSequence: tempContext.getSequence(),
    });

    const userPrompt = buildSettingsCommandUserPrompt(trimmed, options);
    const fullPrompt = `${SETTINGS_COMMAND_SYSTEM_PROMPT}\n\n${userPrompt}`;

    const response = await session.prompt(fullPrompt, {
      maxTokens: 768,
      temperature: 0.2,
      topP: 0.9,
      stopStrings: ['```'],
    });

    const jsonText = extractFirstJsonBlock(response);
    if (!jsonText) {
      throw new Error('LLM の出力から JSON を抽出できませんでした');
    }

    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('LLM の出力がオブジェクトではありません');
    }

    const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
    const normalizedCommands = commands
      .map((raw, index) => normalizeSettingsCommand(raw, index))
      .filter(Boolean);

    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
      : [];

    return { commands: normalizedCommands, warnings };
  } finally {
    await tempContext.dispose();
  }
}

function normalizeSettingsCommand(rawCommand, index) {
  if (!rawCommand || typeof rawCommand !== 'object') {
    console.warn('[LLM] settings command が不正です:', rawCommand);
    return null;
  }

  const key = typeof rawCommand.key === 'string' ? rawCommand.key.trim() : '';
  if (!key) {
    console.warn(`[LLM] settings command key が空です (index=${index})`);
    return null;
  }

  const actionRaw = typeof rawCommand.action === 'string' ? rawCommand.action.trim().toLowerCase() : '';
  const allowedActions = new Set(['set', 'toggle', 'increase', 'decrease']);
  if (!allowedActions.has(actionRaw)) {
    console.warn(`[LLM] 未対応の action "${rawCommand.action}" (index=${index})`);
    return null;
  }

  let value = rawCommand.value ?? null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      value = null;
    } else if (!Number.isNaN(Number(trimmed))) {
      value = Number(trimmed);
    }
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    value = null;
  }

  const reason = typeof rawCommand.reason === 'string' ? rawCommand.reason.trim() : null;

  return {
    key,
    action: actionRaw,
    value,
    reason,
  };
}

function extractFirstJsonBlock(text) {
  if (!text) {
    return null;
  }
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

/**
 * カジュアルな音声チャット応答を生成する。
 * - 会話履歴は最大6ターンを渡し、過去ログが長くなりすぎるのを防ぐ。
 * - LlamaChatSession は使い捨てで作成し、プロンプト間の状態共有を避ける。
 * @param {string} userText
 * @param {{history?:Array<{role:string, content:string}>}} options
 * @returns {Promise<{reply:string, segments:string[]}>}
 */
async function generateChatReply(userText, options = {}) {
  if (!userText || typeof userText !== 'string') {
    throw new Error('チャット入力が空です');
  }

  const trimmed = userText.trim();
  const { model } = await loadLLMModel();
  if (!model) {
    throw new Error('LLM モデルが初期化されていません');
  }

  const { LlamaChatSession } = await loadNodeLlamaCpp();
  const tempContext = await model.createContext({ contextSize: 2048 });
  try {
    const session = new LlamaChatSession({
      contextSequence: tempContext.getSequence(),
    });

    const history = Array.isArray(options.history) ? options.history : [];
    const prompt = buildChatPrompt(history, trimmed);
    const response = await session.prompt(prompt, {
      maxTokens: 256,
      temperature: 0.7,
      topP: 0.9,
      stopStrings: ['ユーザー:', 'アシスタント:'],
    });

    const reply = cleanChatReply(response);
    return {
      reply,
      segments: splitReplyIntoSegments(reply),
    };
  } finally {
    await tempContext.dispose();
  }
}

/**
 * Llama の出力から会話タグやノイズを除去する。
 * @param {string} text
 * @returns {string}
 */
function cleanChatReply(text) {
  if (!text) {
    return 'ごめんね、ちょっと言葉が出てこなかったよ。';
  }
  return text
    .replace(/アシスタント[:：]/g, '')
    .replace(/ユーザー[:：]/g, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * 応答文を文単位に分割し、ストリーミング表示用に整える。
 * @param {string} text
 * @returns {string[]}
 */
function splitReplyIntoSegments(text) {
  if (!text) {
    return [];
  }
  return text
    .split(/(?<=[。！？!?])/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}


/**
 * LLM モデルインスタンスをリセットする（テスト用）。
 */
function resetLLMInstance() {
  llama = null;
  llmModel = null;
  llmContext = null;
}

module.exports = {
  loadLLMModel,
  extractScheduleFromText,
  inferSettingsCommands,
  generateChatReply,
  resetLLMInstance,
};
