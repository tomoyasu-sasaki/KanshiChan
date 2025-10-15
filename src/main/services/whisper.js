/**
 * Whisper (音声認識) サービス。
 * - whisper-cli (whisper.cpp) を直接呼び出して音声データを文字起こし。
 * - モデルファイル / CLI パスは初回利用時に検証し、以降はキャッシュして再利用。
 * - 依存: whisper-cli, models/ggml-base.bin, ffmpeg
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const { exec, execFile } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);
const {
  DEFAULT_WHISPER_MODEL_PATH,
  DEFAULT_WHISPER_OPTIONS,
  MAX_AUDIO_SIZE_BYTES,
  DEFAULT_WHISPER_CLI_PATH,
} = require('../../constants/whisper-config');

/**
 * Whisper モデルインスタンス（遅延初期化）
 */
let whisperInstance = null;
let tempWorkspacePromise = null;

/**
 * whisper-cli の実行パスを解決する。
 * - 絶対パス/相対パスが指定された場合は存在確認のみ
 * - コマンド名のみの場合は PATH から探索
 * @param {string} cliCandidate CLI パスまたはコマンド名
 * @returns {Promise<string>} 解決済み CLI パス
 */
async function resolveWhisperCliPath(cliCandidate = DEFAULT_WHISPER_CLI_PATH) {
  if (!cliCandidate || typeof cliCandidate !== 'string') {
    throw new Error('whisper-cli のパスが設定されていません');
  }

  const hasPathSeparator = cliCandidate.includes('/') || (process.platform === 'win32' && cliCandidate.includes('\\'));
  const isAbsolutePath = path.isAbsolute(cliCandidate);

  if (isAbsolutePath || hasPathSeparator) {
    try {
      await fsp.access(cliCandidate, fs.constants.X_OK);
      return cliCandidate;
    } catch (error) {
      // Windows では実行権限ビットが無いケースがあるため F_OK チェックを許容
      if (process.platform === 'win32') {
        await fsp.access(cliCandidate, fs.constants.F_OK);
        return cliCandidate;
      }
      throw new Error(`whisper-cli 実行ファイルにアクセスできません: ${cliCandidate}`);
    }
  }

  const whichCmd = process.platform === 'win32' ? 'where' : 'command -v';

  try {
    const { stdout } = await execPromise(`${whichCmd} ${cliCandidate}`);
    const resolvedPath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (!resolvedPath) {
      throw new Error();
    }

    return resolvedPath;
  } catch (error) {
    throw new Error(
      `whisper-cli が見つかりませんでした。PATH か WHISPER_CLI_PATH を確認してください: ${cliCandidate}`
    );
  }
}

async function ensureTempWorkspace() {
  if (!tempWorkspacePromise) {
    tempWorkspacePromise = (async () => {
      const workspace = path.join(os.tmpdir(), 'kanshichan-whisper');
      await fsp.mkdir(workspace, { recursive: true });
      return workspace;
    })();
  }

  return tempWorkspacePromise;
}

async function safeUnlink(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[Whisper] 一時ファイル削除エラー:', error);
    }
  }
}

/**
 * Whisper モデルをロードする。
 * - 初回呼び出し時のみモデルファイルを読み込み、インスタンスをキャッシュ。
 * - モデルパスが存在しない場合はエラーをスロー。
 * @param {string} modelPath モデルファイルパス（オプション、デフォルトは DEFAULT_WHISPER_MODEL_PATH）
 * @returns {Promise<Object>} Whisper インスタンス
 * @throws {Error} モデルファイルが存在しない場合
 */
async function validateWhisperEnvironment({
  modelPath = DEFAULT_WHISPER_MODEL_PATH,
  cliPathCandidate,
} = {}) {
  try {
    await fsp.access(modelPath);
  } catch (error) {
    throw new Error(
      `Whisper モデルが見つかりません: ${modelPath}\n` +
      `models/ ディレクトリに ggml-base.bin を配置してください。`
    );
  }

  const cliPath = await resolveWhisperCliPath(cliPathCandidate || DEFAULT_WHISPER_CLI_PATH);

  return {
    modelPath,
    cliPath,
  };
}

async function loadWhisperModel(modelPath = DEFAULT_WHISPER_MODEL_PATH) {
  if (whisperInstance) {
    return whisperInstance;
  }

  const { modelPath: resolvedModelPath, cliPath } = await validateWhisperEnvironment({ modelPath });

  console.log(`[Whisper] モデルをロード中: ${resolvedModelPath}`);

  whisperInstance = {
    modelPath: resolvedModelPath,
    cliPath,
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

  const workspaceDir = await ensureTempWorkspace();
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempInputPath = path.join(workspaceDir, `audio_input_${uniqueId}.dat`);
  const tempWavPath = path.join(workspaceDir, `audio_${uniqueId}.wav`);
  const tempOutputBase = path.join(workspaceDir, `whisper_output_${uniqueId}`);
  const tempOutputTextPath = `${tempOutputBase}.txt`;

  try {
    // まず元の音声データを書き込み
    await fsp.writeFile(tempInputPath, audioBuffer);
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

    const whisperArgs = [
      '-m',
      model.modelPath,
      '-f',
      tempWavPath,
      '-l',
      options.language || DEFAULT_WHISPER_OPTIONS.language,
      '-otxt',
      '-of',
      tempOutputBase,
    ];

    console.log('[Whisper] whisper-cli 実行:', `${model.cliPath} ${whisperArgs.join(' ')}`);

    try {
      await execFilePromise(model.cliPath, whisperArgs, {
        maxBuffer: 1024 * 1024 * 20, // 20MB まで stdout/stderr を許可
      });
    } catch (cliError) {
      console.error('[Whisper] whisper-cli 実行エラー:', cliError);
      throw new Error(
        `whisper-cli の実行に失敗しました。CLI のビルド状況とパスを確認してください: ${cliError.message}`
      );
    }

    const transcript = await fsp.readFile(tempOutputTextPath, 'utf8');
    const trimmedResult = transcript.trim();

    if (!trimmedResult) {
      throw new Error('whisper-cli の出力が空でした');
    }

    console.log(`[Whisper] 文字起こし完了: "${trimmedResult.substring(0, 50)}..."`);

    return trimmedResult;
  } catch (error) {
    console.error('[Whisper] 文字起こしエラー:', error);
    const errorMessage = error?.message || error?.toString() || '不明なエラー';
    throw new Error(`文字起こしに失敗しました: ${errorMessage}`);
  } finally {
    // 一時ファイルをクリーンアップ
    try {
      await safeUnlink(tempInputPath);
      await safeUnlink(tempWavPath);
      await safeUnlink(tempOutputTextPath);
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
  validateWhisperEnvironment,
  resetWhisperInstance,
};
