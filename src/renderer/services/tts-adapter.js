/**
 * TTS (Text-To-Speech) アダプタ。
 * - VOICEVOX 再生をキューイングし、呼び出し側の API を統一する。
 */
import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../../constants/voicevox-config.js';
import { getVoicevoxPreferences } from './voicevox-preferences.js';

const DEFAULT_ENGINE = 'voicevox';
const playbackQueue = [];
let isProcessing = false;

export async function queueVoicevoxSpeech(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { success: false, error: '読み上げテキストが空です' };
  }

  return new Promise((resolve) => {
    playbackQueue.push({ text, options, resolve });
    if (!isProcessing) {
      processQueue();
    }
  });
}

export function clearTtsQueue() {
  playbackQueue.splice(0, playbackQueue.length);
}

export function resolveVoicevoxOptions(overrides = {}) {
  const base = getVoicevoxPreferences();
  const speakerId = overrides.speakerId != null
    ? Number(overrides.speakerId)
    : base.speakerId ?? DEFAULT_VOICEVOX_SPEAKER_ID;

  return {
    speakerId: Number.isFinite(speakerId) ? speakerId : DEFAULT_VOICEVOX_SPEAKER_ID,
    speedScale: overrides.speedScale ?? base.speedScale ?? 1.0,
    pitchScale: overrides.pitchScale ?? base.pitchScale ?? null,
    intonationScale: overrides.intonationScale ?? base.intonationScale ?? null,
  };
}

export async function synthesizeAndPlay(text, options = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('読み上げテキストが空です');
  }

  const { engine, engineOptions } = normalizeOptions(options);

  if (!window?.electronAPI?.speakText) {
    console.warn('[tts-adapter] speakText API が利用できません。読み上げをスキップします。');
    return { success: false };
  }

  const response = await window.electronAPI.speakText({
    text,
    engine,
    options: engineOptions,
  });

  if (!response || response.success === false) {
    throw new Error(response?.error || '音声合成に失敗しました');
  }

  if (!response.dataUrl) {
    console.warn('[tts-adapter] データURLが返却されませんでした');
    return { success: false };
  }

  const audio = new Audio(response.dataUrl);
  await audio.play().catch((error) => {
    console.error('[tts-adapter] 音声再生エラー:', error);
  });

  return {
    success: true,
    dataUrl: response.dataUrl,
  };
}

function normalizeOptions(options) {
  if (!options || typeof options !== 'object') {
    return {
      engine: DEFAULT_ENGINE,
      engineOptions: {},
    };
  }

  if (options.engine || options.engineOptions) {
    return {
      engine: options.engine || DEFAULT_ENGINE,
      engineOptions: { ...(options.engineOptions || {}) },
    };
  }

  const engineOptions = {};
  if (options.speakerId != null) {
    engineOptions.speakerId = options.speakerId;
  }
  if (options.speedScale != null) {
    engineOptions.speedScale = options.speedScale;
  }
  if (options.pitchScale != null) {
    engineOptions.pitchScale = options.pitchScale;
  }
  if (options.intonationScale != null) {
    engineOptions.intonationScale = options.intonationScale;
  }

  return {
    engine: DEFAULT_ENGINE,
    engineOptions,
  };
}

async function processQueue() {
  if (isProcessing) {
    return;
  }

  const job = playbackQueue.shift();
  if (!job) {
    return;
  }

  isProcessing = true;
  let result;
  try {
    result = await synthesizeAndPlay(job.text, job.options);
  } catch (error) {
    result = { success: false, error: error?.message || String(error) };
  }

  job.resolve(result);
  isProcessing = false;

  if (playbackQueue.length > 0) {
    processQueue();
  }
}
