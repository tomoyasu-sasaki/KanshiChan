/**
 * スケジュール通知で利用する TTS 再生キューを管理するモジュール。
 */
import { scheduleState } from './state.js';

/**
 * 読み上げ要求をキューに追加し、必要なら再生を開始する。
 * @param {string} text 読み上げ内容
 * @param {{speakerId?:number,speedScale?:number}} options VOICEVOX オプション
 */
export async function queueTts(text, options = {}) {
  scheduleState.ttsQueue.push({ text, options });
  if (!scheduleState.isTTSPlaying) {
    await processTtsQueue();
  }
}

/**
 * キューから順番に TTS を生成・再生する内部処理。
 */
async function processTtsQueue() {
  if (scheduleState.ttsQueue.length === 0) {
    scheduleState.isTTSPlaying = false;
    return;
  }

  scheduleState.isTTSPlaying = true;
  const { text, options } = scheduleState.ttsQueue.shift();

  try {
    if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
      const res = await window.electronAPI.speakText({
        text,
        engine: 'voicevox',
        options: {
          speakerId: options.speakerId,
          speedScale: options.speedScale || 1.0,
        },
      });

      if (res && res.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);
        audio.onended = () => {
          processTtsQueue();
        };
        audio.onerror = () => {
          processTtsQueue();
        };
        await audio.play();
        return;
      }
    }
  } catch (error) {
    console.error('TTS再生エラー:', error);
  }

  processTtsQueue();
}
