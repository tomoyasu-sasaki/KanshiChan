import { queueVoicevoxSpeech, resolveVoicevoxOptions } from '../services/tts-adapter.js';
import { scheduleState } from './state.js';

/**
 * スケジュール通知で利用する TTS をキューへ登録する。
 * - `tts-adapter` の共通キューに委譲し、二重再生を防ぐ。
 * @param {string} text
 * @param {{speakerId?:number,speedScale?:number}} options
 */
export async function queueTts(text, options = {}) {
  const voiceOptions = resolveVoicevoxOptions({
    speakerId: options.speakerId,
    speedScale: options.speedScale ?? 1.0,
  });
  scheduleState.isTTSPlaying = true;
  try {
    const result = await queueVoicevoxSpeech(text, voiceOptions);
    return result;
  } finally {
    scheduleState.isTTSPlaying = false;
  }
}
