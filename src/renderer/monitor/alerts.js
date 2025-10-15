/**
 * アラート通知（スマホ/不在）の集約モジュール。
 * - サウンド・デスクトップ通知・VOICEVOX 読み上げを一箇所にまとめる。
 */
import { getMonitorState } from './context.js';
import { addLog, recordDetectionLogEntry } from './logs.js';

/**
 * スマホ検知アラートを発火させる。
 * - クールダウンや音声通知などの副作用もここで一括処理する。
 */
export async function triggerPhoneAlert() {
  const state = getMonitorState();
  const { settings } = state;
  state.phoneAlertTriggered = true;
  addLog('⚠️ スマホが検知されました！', 'alert');
  recordDetectionLogEntry({
    type: 'phone_alert',
    detectedAt: Date.now(),
    durationSeconds: state.phoneDetectionTime || null,
    meta: { threshold: settings.phoneThreshold },
  });

  if (settings.soundEnabled) {
    playAlertSound();
  }

  if (settings.desktopNotification && window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '⚠️ スマホ検知アラート',
      body: `スマホが${settings.phoneThreshold}秒以上検知されています`,
    });
  }

  if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
    try {
      const res = await window.electronAPI.speakText({
        text: 'スマホが検知されています。作業に集中しましょう。',
        engine: 'voicevox',
        options: { speakerId: settings.voicevoxSpeaker, speedScale: 1.05 },
      });
      if (res?.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);
        audio.play().catch(() => {});
      }
    } catch {}
  }

  state.lastPhoneAlertAt = Date.now();
}

/**
 * 不在検知アラートを発火させる。
 * - 不在許可中は抑止し、VOICEVOX 読み上げを実行する。
 */
export async function triggerAbsenceAlert() {
  const state = getMonitorState();
  if (state.absenceOverrideState?.active) {
    return;
  }
  const { settings } = state;

  state.absenceAlertTriggered = true;
  addLog('⚠️ 不在が検知されました！', 'alert');
  recordDetectionLogEntry({
    type: 'absence_alert',
    detectedAt: Date.now(),
    durationSeconds: state.absenceDetectionTime || null,
    meta: { threshold: settings.absenceThreshold },
  });

  if (settings.soundEnabled) {
    playAlertSound();
  }

  if (settings.desktopNotification && window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '⚠️ 不在検知アラート',
      body: `${settings.absenceThreshold}秒以上不在です`,
    });
  }

  if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
    try {
      const res = await window.electronAPI.speakText({
        text: '離席が続いています。席に戻りましょう。',
        engine: 'voicevox',
        options: { speakerId: settings.voicevoxSpeaker, speedScale: 1.0 },
      });
      if (res?.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);
        audio.play().catch(() => {});
      }
    } catch {}
  }

  state.lastAbsenceAlertAt = Date.now();
}

/**
 * Web Audio API を用いたビープ音生成。
 * - OS 依存の音源に頼らず、即時に注意喚起できるようにする。
 */
export function playAlertSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return;
  }
  const audioContext = new AudioCtx();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.value = 0.3;

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.5);
}
