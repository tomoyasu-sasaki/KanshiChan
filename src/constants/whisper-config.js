/**
 * Whisper (音声認識) 設定定数
 */

const path = require('path');

/**
 * Whisper モデルファイルのデフォルトパス
 */
const DEFAULT_WHISPER_MODEL_PATH = path.join(__dirname, '../../models/ggml-base.bin');

/**
 * Whisper CLI 実行ファイルのデフォルトパス
 * - 環境変数 WHISPER_CLI_PATH があればそれを優先
 * - 未指定時は PATH 上の whisper-cli (Windows は whisper-cli.exe) を探索
 */
const DEFAULT_WHISPER_CLI_PATH =
  process.env.WHISPER_CLI_PATH || (process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');

/**
 * Whisper 推論オプションのデフォルト値
 */
const DEFAULT_WHISPER_OPTIONS = {
  modelPath: DEFAULT_WHISPER_MODEL_PATH,
  language: 'ja',           // 日本語
  withTimestamps: false,    // タイムスタンプ不要
  wordTimestamps: false,    // 単語レベルのタイムスタンプ不要
  // translate: false,      // 翻訳しない (文字起こしのみ)
};

/**
 * サポートする音声フォーマット
 */
const SUPPORTED_AUDIO_FORMATS = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
];

/**
 * 音声データの最大サイズ (10MB)
 */
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;

module.exports = {
  DEFAULT_WHISPER_MODEL_PATH,
  DEFAULT_WHISPER_OPTIONS,
  SUPPORTED_AUDIO_FORMATS,
  MAX_AUDIO_SIZE_BYTES,
  DEFAULT_WHISPER_CLI_PATH,
};
