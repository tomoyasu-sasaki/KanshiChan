/**
 * Whisper (音声認識) 設定定数
 */

const path = require('path');

/**
 * Whisper モデルファイルのデフォルトパス
 */
const DEFAULT_WHISPER_MODEL_PATH = path.join(__dirname, '../../models/ggml-base.bin');

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
};
