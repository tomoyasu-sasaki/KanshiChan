/**
 * Whisper (音声認識) サービス。
 * - nodejs-whisper を使用して音声データから文字起こしを実行。
 * - モデルロードは初回呼び出し時に遅延実行し、以降はインスタンスを再利用。
 * - 依存: nodejs-whisper, models/ggml-base.bin
 */

const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const fs = require('fs').promises;
const {
  DEFAULT_WHISPER_MODEL_PATH,
  DEFAULT_WHISPER_OPTIONS,
  MAX_AUDIO_SIZE_BYTES,
} = require('../../constants/whisper-config');

/**
 * Whisper モデルインスタンス（遅延初期化）
 */
let whisperInstance = null;

/**
 * Whisper モデルをロードする。
 * - 初回呼び出し時のみモデルファイルを読み込み、インスタンスをキャッシュ。
 * - モデルパスが存在しない場合はエラーをスロー。
 * @param {string} modelPath モデルファイルパス（オプション、デフォルトは DEFAULT_WHISPER_MODEL_PATH）
 * @returns {Promise<Object>} Whisper インスタンス
 * @throws {Error} モデルファイルが存在しない場合
 */
async function loadWhisperModel(modelPath = DEFAULT_WHISPER_MODEL_PATH) {
  if (whisperInstance) {
    return whisperInstance;
  }

  try {
    await fs.access(modelPath);
  } catch (error) {
    throw new Error(
      `Whisper モデルが見つかりません: ${modelPath}\n` +
      `models/ ディレクトリに ggml-base.bin を配置してください。`
    );
  }

  console.log(`[Whisper] モデルをロード中: ${modelPath}`);

  whisperInstance = {
    modelPath,
    isReady: true,
  };

  console.log('[Whisper] モデルのロードが完了しました');
  return whisperInstance;
}

/**
 * 音声データから文字起こしを実行する。
 * - Base64エンコードされた音声データを受け取り、一時ファイルに保存してWhisperで推論。
 * - 推論完了後、一時ファイルは削除。
 * @param {string} audioDataBase64 Base64エンコードされた音声データ
 * @param {Object} options Whisper 推論オプション
 * @param {string} options.language 言語コード（デフォルト: 'ja'）
 * @returns {Promise<string>} 文字起こし結果テキスト
 * @throws {Error} 音声データが不正、またはモデル未ロード、推論失敗時
 */
async function transcribeAudio(audioDataBase64, options = {}) {
  if (!audioDataBase64 || typeof audioDataBase64 !== 'string') {
    throw new Error('音声データが不正です');
  }

  const audioBuffer = Buffer.from(audioDataBase64, 'base64');

  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new Error(
      `音声データが大きすぎます (最大: ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB)`
    );
  }

  const model = await loadWhisperModel();
  if (!model || !model.isReady) {
    throw new Error('Whisper モデルが初期化されていません');
  }

  const tempDir = path.join(__dirname, '../../../temp');
  await fs.mkdir(tempDir, { recursive: true });

  const tempFilePath = path.join(tempDir, `audio_${Date.now()}.wav`);

  try {
    await fs.writeFile(tempFilePath, audioBuffer);
    console.log(`[Whisper] 文字起こし開始: ${tempFilePath}`);

    const whisperOptions = {
      modelName: model.modelPath,
      autoDownloadModelName: '',
      language: options.language || DEFAULT_WHISPER_OPTIONS.language,
      whisperOptions: {
        outputInText: true,
        outputInVtt: false,
        outputInSrt: false,
        outputInCsv: false,
        translateToEnglish: false,
        wordTimestamps: DEFAULT_WHISPER_OPTIONS.wordTimestamps,
        timestamps_length: DEFAULT_WHISPER_OPTIONS.timestamps_length,
      },
    };

    const result = await nodewhisper(tempFilePath, whisperOptions);

    if (!result || typeof result !== 'string') {
      throw new Error('Whisper の推論結果が不正です');
    }

    const trimmedResult = result.trim();
    console.log(`[Whisper] 文字起こし完了: "${trimmedResult.substring(0, 50)}..."`);

    return trimmedResult;
  } catch (error) {
    console.error('[Whisper] 文字起こしエラー:', error);
    throw new Error(`文字起こしに失敗しました: ${error.message}`);
  } finally {
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      console.warn('[Whisper] 一時ファイル削除エラー:', cleanupError);
    }
  }
}

/**
 * Whisper モデルインスタンスをリセットする（テスト用）。
 */
function resetWhisperInstance() {
  whisperInstance = null;
}

module.exports = {
  loadWhisperModel,
  transcribeAudio,
  resetWhisperInstance,
};
