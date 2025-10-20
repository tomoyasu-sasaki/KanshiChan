/**
 * STT → LLM パイプライン。
 * - Whisper 文字起こしとプロファイル別 LLM 推論をまとめて実行する。
 */
import { transcribeAudio } from '../stt-client.js';
import { runLlm } from '../llm-client.js';

export async function runAudioPipeline(profileId, audioBase64, metadata = {}) {
  if (!profileId) {
    throw new Error('profileId が指定されていません');
  }
  if (!audioBase64) {
    throw new Error('音声データが空です');
  }

  const transcription = await transcribeAudio(audioBase64, {
    language: metadata.language || 'ja',
  });

  const llmResult = await runLlm(profileId, transcription.transcribedText, {
    context: {
      metadata,
      history: metadata?.history || [],
    },
  });

  return {
    transcription,
    llmResult,
  };
}
