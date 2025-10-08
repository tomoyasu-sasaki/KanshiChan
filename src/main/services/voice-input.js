/**
 * 旧音声入力 API（スケジュール専用）の互換レイヤ。
 * - 新しい audio サービスを内部で呼び出し、既存のレンダラコードとの互換性を維持する。
 * - 既存の IPC 名称 `voice-input-*` の利用者向けに残している。
 */

const audioService = require('./audio');

/**
 * 音声データからスケジュール情報を抽出するレガシー API。
 * @param {string} audioDataBase64 Base64 エンコードされた音声データ
 * @param {{language?:string}} options Whisper 言語設定
 * @returns {Promise<{success:boolean, transcribedText?:string, schedules?:Array, error?:string}>}
 */
async function processVoiceInput(audioDataBase64, options = {}) {
  console.log('[VoiceInput] 音声入力処理を開始');

  let transcribedText = '';
  let schedules = [];

  try {
    const transcription = await audioService.transcribe({
      audioDataBase64,
      language: options.language || 'ja',
    });

    transcribedText = transcription.transcribedText;
    if (!transcribedText || transcribedText.trim().length === 0) {
      throw new Error('音声が認識できませんでした。もう一度お試しください。');
    }

    const inference = await audioService.infer('schedule', transcribedText);
    schedules = inference.schedules;

    if (!schedules || schedules.length === 0) {
      throw new Error('スケジュール情報を抽出できませんでした。日時とタイトルを含めて話してください。');
    }

    console.log(`[VoiceInput] スケジュール抽出完了: ${schedules.length}件`);

    return {
      success: true,
      transcribedText,
      schedules,
    };
  } catch (error) {
    console.error('[VoiceInput] 処理エラー:', error);
    const errorMessage = error?.message || error?.toString() || '不明なエラー';

    return {
      success: false,
      error: errorMessage,
      transcribedText,
      schedules,
    };
  }
}

/**
 * 旧 API 向けの可用性チェック。
 * - 実体は新しい audio サービスの `checkAvailability` をそのまま返す。
 * @returns {Promise<{available:boolean, models:object, errors?:string[]}>}
 */
async function checkVoiceInputAvailability() {
  return audioService.checkAvailability();
}

module.exports = {
  processVoiceInput,
  checkVoiceInputAvailability,
};
