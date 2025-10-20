/**
 * TTS 再生管理モジュール。
 * - VOICEVOX キューの facade として `tts-adapter` を利用する。
 */
import { queueVoicevoxSpeech, clearTtsQueue } from '../tts-adapter.js';

export function enqueuePlayback(text, options = {}) {
  return queueVoicevoxSpeech(text, options);
}

export function clearPlaybackQueue() {
  clearTtsQueue();
}
