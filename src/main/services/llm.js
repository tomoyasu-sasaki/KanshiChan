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
} = require('../../constants/llm-prompts');

/**
 * LLM モデルインスタンス（遅延初期化）
 */
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
    const { LlamaModel, LlamaContext, LlamaChatSession } = require('node-llama-cpp');

    llmModel = new LlamaModel({
      modelPath,
    });

    llmContext = new LlamaContext({
      model: llmModel,
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

  const { model, context } = await loadLLMModel();

  if (!model || !context) {
    throw new Error('LLM モデルが初期化されていません');
  }

  console.log(`[LLM] スケジュール抽出開始: "${transcribedText.substring(0, 50)}..."`);

  try {
    const { LlamaChatSession } = require('node-llama-cpp');

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
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

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM の出力から JSON を抽出できませんでした');
    }

    const parsedResult = JSON.parse(jsonMatch[0]);

    if (!parsedResult.schedules || !Array.isArray(parsedResult.schedules)) {
      throw new Error('LLM の出力に schedules 配列が含まれていません');
    }

    console.log(`[LLM] スケジュール抽出完了: ${parsedResult.schedules.length}件`);

    return parsedResult.schedules;
  } catch (error) {
    console.error('[LLM] スケジュール抽出エラー:', error);
    throw new Error(`スケジュール抽出に失敗しました: ${error.message}`);
  }
}

/**
 * LLM モデルインスタンスをリセットする（テスト用）。
 */
function resetLLMInstance() {
  llmModel = null;
  llmContext = null;
}

module.exports = {
  loadLLMModel,
  extractScheduleFromText,
  resetLLMInstance,
};
