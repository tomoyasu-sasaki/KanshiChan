/**
 * 音声入力統合サービス。
 * - Whisper (STT) と LLM (テキスト整形) を組み合わせてエンドツーエンド処理。
 * - 音声データ → 文字起こし → スケジュール抽出 の一連のフローを実行。
 * - エラーハンドリングとロギングを含む。
 * - 依存: src/main/services/whisper.js, src/main/services/llm.js
 */

const { transcribeAudio } = require('./whisper');
const { extractScheduleFromText } = require('./llm');

/**
 * 音声データからスケジュール情報を抽出する（エンドツーエンド処理）。
 * - Step 1: Whisper で音声データを文字起こし
 * - Step 2: LLM でテキストからスケジュール情報を抽出
 * @param {string} audioDataBase64 Base64エンコードされた音声データ
 * @param {Object} options オプション
 * @param {string} options.language Whisper の言語設定（デフォルト: 'ja'）
 * @returns {Promise<Object>} 処理結果 { transcribedText, schedules }
 * @throws {Error} 音声認識またはスケジュール抽出が失敗した場合
 */
async function processVoiceInput(audioDataBase64, options = {}) {
  console.log('[VoiceInput] 音声入力処理を開始');

  let transcribedText = '';
  let schedules = [];

  try {
    // Step 1: Whisper で文字起こし
    console.log('[VoiceInput] Step 1: 音声認識中...');
    transcribedText = await transcribeAudio(audioDataBase64, {
      language: options.language || 'ja',
    });

    if (!transcribedText || transcribedText.trim().length === 0) {
      throw new Error('音声が認識できませんでした。もう一度お試しください。');
    }

    console.log(`[VoiceInput] 文字起こし結果: "${transcribedText}"`);

    // Step 2: LLM でスケジュール抽出
    console.log('[VoiceInput] Step 2: スケジュール抽出中...');
    schedules = await extractScheduleFromText(transcribedText);

    if (!schedules || schedules.length === 0) {
      throw new Error(
        'スケジュール情報を抽出できませんでした。' +
        '日時とタイトルを含めて話してください。'
      );
    }

    console.log(`[VoiceInput] スケジュール抽出完了: ${schedules.length}件`);

    return {
      success: true,
      transcribedText,
      schedules,
    };
  } catch (error) {
    console.error('[VoiceInput] 処理エラー:', error);

    return {
      success: false,
      error: error.message,
      transcribedText,
      schedules,
    };
  }
}

/**
 * 音声入力処理の状態を検証する。
 * - Whisper と LLM のモデルが利用可能かチェック。
 * @returns {Promise<Object>} { available: boolean, models: { whisper, llm } }
 */
async function checkVoiceInputAvailability() {
  const status = {
    available: false,
    models: {
      whisper: false,
      llm: false,
    },
    errors: [],
  };

  try {
    const { loadWhisperModel } = require('./whisper');
    await loadWhisperModel();
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

module.exports = {
  processVoiceInput,
  checkVoiceInputAvailability,
};
