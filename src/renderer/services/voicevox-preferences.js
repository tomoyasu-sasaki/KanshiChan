import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../../constants/voicevox-config.js';
import { loadSettings } from '../settings/state.js';

let voicevoxPreferences = null;

export function getVoicevoxPreferences() {
  if (!voicevoxPreferences) {
    hydrateVoicevoxPreferences();
  }
  return { ...voicevoxPreferences };
}

export function setVoicevoxPreferences(preferences = {}) {
  voicevoxPreferences = {
    speakerId: normalizeSpeakerId(preferences.speakerId),
    speedScale: normalizeScale(preferences.speedScale, 1.0),
    pitchScale: normalizeScale(preferences.pitchScale, null),
    intonationScale: normalizeScale(preferences.intonationScale, null),
  };
  return getVoicevoxPreferences();
}

export function updateVoicevoxPreferencesFromSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return getVoicevoxPreferences();
  }
  return setVoicevoxPreferences({
    speakerId: settings.voicevoxSpeaker,
  });
}

export function hydrateVoicevoxPreferences() {
  try {
    const settings = loadSettings();
    return updateVoicevoxPreferencesFromSettings(settings);
  } catch (error) {
    console.warn('[voicevox-preferences] 設定の読み込みに失敗しました', error);
    return setVoicevoxPreferences({});
  }
}

function normalizeSpeakerId(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return DEFAULT_VOICEVOX_SPEAKER_ID;
}

function normalizeScale(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return fallback;
}

// 初期化
hydrateVoicevoxPreferences();
