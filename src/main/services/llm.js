/**
 * LLM (Large Language Model) サービス。
 * - node-llama-cpp を使用して GGUF モデルからテキスト整形を実行。
 * - JSON Schema を強制して構造化されたスケジュール情報を抽出。
 * - モデルロードは初回呼び出し時に遅延実行し、以降はインスタンスを再利用。
 * - 依存: node-llama-cpp, models/llmjp-3.1-1.8b-instruct4-q5.gguf
 */

const path = require('path');
const fs = require('fs').promises;
const {
  SCHEDULE_EXTRACTION_SYSTEM_PROMPT,
  buildScheduleExtractionUserPrompt,
  SCHEDULE_EXTRACTION_JSON_SCHEMA,
  buildScheduleTtsPrompt,
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
  '../../../models/llmjp-3.1-1.8b-instruct4-q5.gguf'
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
      maxTokens: 512,
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

/**
 * スケジュール情報から TTS 用案内文を生成する。
 * @param {{ title: string, date: string, time: string, description?: string }} schedule
 * @returns {Promise<string>}
 */
async function generateTtsMessageForSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    throw new Error('スケジュール情報が不正です');
  }

  const { title, date, time, description = '' } = schedule;

  if (!title || !date || !time) {
    throw new Error('title, date, time を指定してください');
  }

  const { model } = await loadLLMModel();

  if (!model) {
    throw new Error('LLM モデルが初期化されていません');
  }

  console.log('[LLM] TTSメッセージ生成開始:', title, date, time);

  const { LlamaChatSession } = await loadNodeLlamaCpp();
  const tempContext = await model.createContext({
    contextSize: 1024,
  });

  try {
    const session = new LlamaChatSession({
      contextSequence: tempContext.getSequence(),
    });

    const prompt = buildScheduleTtsPrompt({ title, date, time, description });
    const response = await session.prompt(prompt, {
      maxTokens: 160,
      temperature: 0.4,
      topP: 0.9,
      stopStrings: ['\n\n'],
    });

    const message = (response || '').trim().replace(/^['\"]|['\"]$/g, '');

    if (!message) {
      throw new Error('TTS メッセージを生成できませんでした');
    }

    console.log('[LLM] TTSメッセージ生成完了:', message);
    return message;
  } catch (error) {
    console.error('[LLM] TTSメッセージ生成エラー:', error);
    const message = error?.message || error?.toString() || '不明なエラー';
    throw new Error(`TTS メッセージ生成に失敗しました: ${message}`);
  } finally {
    await tempContext.dispose();
  }
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
  generateTtsMessageForSchedule,
  resetLLMInstance,
};
