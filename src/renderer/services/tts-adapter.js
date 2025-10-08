/**
 * TTS (Text-To-Speech) アダプタ。
 * - 現状は VOICEVOX のみ対応だが、インターフェースを抽象化して差し替えを容易にする。
 */

const DEFAULT_ENGINE = 'voicevox';

/**
 * メインプロセスに合成を依頼し、結果の音声を再生する。
 * @param {string} text 読み上げたいテキスト
 * @param {{engine?:string, engineOptions?:object}} options
 * @returns {Promise<{success:boolean, dataUrl?:string}>}
 */
export async function synthesizeAndPlay(text, options = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('読み上げテキストが空です');
  }

  const engine = options.engine || DEFAULT_ENGINE;
  const request = {
    text,
    engine,
    options: options.engineOptions || {},
  };

  if (!window?.electronAPI?.speakText) {
    console.warn('[tts-adapter] speakText API が利用できません。読み上げをスキップします。');
    return { success: false };
  }

  const response = await window.electronAPI.speakText(request);
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
