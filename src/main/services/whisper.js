/**
 * Whisper (音声認識) サービス。
 * - nodejs-whisper を使用して音声データから文字起こしを実行。
 * - モデルロードは初回呼び出し時に遅延実行し、以降はインスタンスを再利用。
 * - 依存: nodejs-whisper, models/ggml-base.bin
 */

const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);
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

  const timestamp = Date.now();
  const tempInputPath = path.join(tempDir, `audio_input_${timestamp}.dat`);
  const tempWavPath = path.join(tempDir, `audio_${timestamp}.wav`);

  try {
    // まず元の音声データを書き込み
    await fs.writeFile(tempInputPath, audioBuffer);
    console.log(`[Whisper] 音声ファイル保存: ${tempInputPath} (${audioBuffer.length} bytes)`);

    // ffmpeg で任意の音声形式から WAV (16kHz, mono, 16-bit PCM) に変換
    console.log(`[Whisper] 音声データを WAV 形式に変換中...`);
    try {
      const ffmpegCmd = `ffmpeg -i "${tempInputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempWavPath}" -y`;
      await execPromise(ffmpegCmd);
      console.log(`[Whisper] WAV 変換完了: ${tempWavPath}`);
    } catch (ffmpegError) {
      console.error('[Whisper] ffmpeg変換エラー:', ffmpegError.message);
      throw new Error('音声ファイルの変換に失敗しました。ffmpegがインストールされているか確認してください。');
    }

    console.log(`[Whisper] 文字起こし開始: ${tempWavPath}`);

    // nodejs-whisper は 'base', 'tiny', 'small' などのモデル名を期待
    // モデルファイルは node_modules/nodejs-whisper/cpp/whisper.cpp/models/ に配置済み
    const whisperOptions = {
      modelName: 'base', // 短いモデル名を指定
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

    console.log('[Whisper] Whisper推論オプション:', JSON.stringify(whisperOptions, null, 2));

    const result = await nodewhisper(tempWavPath, whisperOptions);

    console.log('[Whisper] Whisper推論完了。結果型:', typeof result);

    if (!result || typeof result !== 'string') {
      throw new Error('Whisper の推論結果が不正です');
    }

    const trimmedResult = result.trim();
    console.log(`[Whisper] 文字起こし完了: "${trimmedResult.substring(0, 50)}..."`);

    return trimmedResult;
  } catch (error) {
    console.error('[Whisper] 文字起こしエラー:', error);
    const errorMessage = error?.message || error?.toString() || '不明なエラー';
    throw new Error(`文字起こしに失敗しました: ${errorMessage}`);
  } finally {
    // 一時ファイルをクリーンアップ
    try {
      await fs.unlink(tempInputPath);
      await fs.unlink(tempWavPath);
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
