/**
 * STT (Speech-To-Text) クライアント。
 * - IPC 呼び出しの窓口を統一し、メイン側の API 移行に追従しやすくしている。
 */

/**
 * Whisper に音声データを渡して文字起こしする。
 * @param {string} audioDataBase64
 * @param {{language?:string}} options
 * @returns {Promise<{success:boolean, transcribedText:string, raw:object}>}
 */
export async function transcribeAudio(audioDataBase64, options = {}) {
  if (!audioDataBase64 || typeof audioDataBase64 !== 'string') {
    throw new Error('音声データが空です');
  }

  const payload = {
    audioDataBase64,
    language: options.language || 'ja',
  };

  if (window?.electronAPI?.audioTranscribe) {
    const response = await window.electronAPI.audioTranscribe(payload);
    if (!response || response.success === false) {
      throw new Error(response?.error || '音声認識に失敗しました');
    }
    return {
      success: true,
      transcribedText: response.transcribedText,
      raw: response,
    };
  }

  throw new Error('音声認識 API が利用できません');
}

/**
 * Whisper/LLM の可用性を問い合わせる。
 * @returns {Promise<object>}
 */
export async function checkSttAvailability() {
  if (window?.electronAPI?.audioCheckAvailability) {
    return window.electronAPI.audioCheckAvailability();
  }
  return { available: false, models: {} };
}
