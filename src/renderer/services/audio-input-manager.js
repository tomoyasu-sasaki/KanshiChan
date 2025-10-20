/**
 * 音声入力マネージャ（レンダラ）。
 * - 録音・STT・LLM・TTS の責務を分割モジュールへ委譲し、ここではセッション制御のみを担当する。
 */
import { audioInputStore } from '../stores/audio-input-store.js';
import { getAudioPromptProfile } from '../../constants/audioProfiles.js';
import { AudioRecorder } from './audio-input/recorder.js';
import { runAudioPipeline } from './audio-input/pipeline.js';
import { enqueuePlayback, clearPlaybackQueue } from './audio-input/playback.js';
import { resolveVoicevoxOptions } from './tts-adapter.js';

let sessionIdCounter = 0;

class AudioInputManager {
  constructor() {
    this.activeSession = null;
    this.recorder = null;
  }

  get isRecording() {
    return Boolean(this.recorder?.isRecording);
  }

  /**
   * 音声セッションを開始し、録音のライフサイクルを制御する。
   * - 既存セッションがあればキャンセルしてリソースを解放する。
   * @param {{promptProfile:string, contextId?:string, metadata?:object, callbacks?:object}} options
   * @returns {Promise<object>} セッションメタデータ
   */
  async startSession(options) {
    const profile = getAudioPromptProfile(options.promptProfile);

    if (this.activeSession) {
      await this.cancelSession('new-session');
    }

    const session = {
      id: ++sessionIdCounter,
      profileId: profile.id,
      contextId: options.contextId || profile.id,
      startedAt: Date.now(),
      status: 'recording',
      callbacks: options.callbacks || {},
      metadata: options.metadata || {},
    };

    this.recorder = new AudioRecorder({
      onStop: (base64, error) => {
        if (error) {
          console.error('[audio-input-manager] 録音停止エラー', error);
          this.failSession(error);
          return;
        }
        this.handleRecordingComplete(profile, base64).catch((pipelineError) => {
          console.error('[audio-input-manager] パイプラインエラー', pipelineError);
          this.failSession(pipelineError);
        });
      },
    });

    this.activeSession = session;
    audioInputStore.setActiveSession({ ...session });
    this.emitStatus('recording');

    await this.recorder.start();
    return session;
  }

  /**
   * 録音を停止する。
   */
  async stopRecording() {
    if (!this.recorder) {
      return;
    }
    await this.recorder.stop();
  }

  /**
   * 進行中のセッションをキャンセルする。
   * @param {string} reason
   */
  async cancelSession(reason = 'cancelled') {
    if (!this.activeSession) {
      return;
    }

    await this.stopRecording();
    this.cleanupRecorder();
    clearPlaybackQueue();

    audioInputStore.setActiveSession(null);
    audioInputStore.appendHistory({
      id: this.activeSession.id,
      profileId: this.activeSession.profileId,
      status: 'cancelled',
      success: false,
      error: reason,
      finishedAt: Date.now(),
    });
    this.activeSession = null;
  }

  /**
   * 録音完了後に STT → LLM → TTS を順番に実行する。
   * @param {object} profile
   * @param {string} audioBase64
   */
  async handleRecordingComplete(profile, audioBase64) {
    const session = this.activeSession;
    if (!session) {
      return;
    }

    this.emitStatus('transcribing');

    try {
      const { transcription, llmResult } = await runAudioPipeline(profile.id, audioBase64, session.metadata);
      this.emitTranscription(transcription.transcribedText);
      this.emitStatus('thinking');

      if (Array.isArray(llmResult?.segments)) {
        llmResult.segments.forEach((segment) => {
          this.invokeCallback('onPartialResult', segment);
        });
      }

      this.emitLlmResult(llmResult);
      let ttsResult = null;
      const ttsText = pickTtsText(profile, llmResult);

      if (ttsText) {
        this.emitStatus('speaking');
        const voiceOptions = resolveVoicevoxOptions(session.metadata.ttsOptions || {});
        ttsResult = await enqueuePlayback(ttsText, voiceOptions);
      }

      const historyEntry = {
        id: session.id,
        profileId: session.profileId,
        status: 'completed',
        success: true,
        finishedAt: Date.now(),
        transcription: transcription.transcribedText,
        result: llmResult,
        audio: ttsResult,
      };

      audioInputStore.appendHistory(historyEntry);
      this.emitStatus('completed');
      audioInputStore.setActiveSession(null);
      this.activeSession = null;
    } catch (error) {
      this.failSession(error);
    } finally {
      this.cleanupRecorder();
    }
  }

  /**
   * 異常終了時の後処理。
   * @param {Error} error
   */
  failSession(error) {
    const session = this.activeSession;
    this.cleanupRecorder();
    clearPlaybackQueue();
    this.activeSession = null;

    audioInputStore.setError(error?.message || String(error));
    audioInputStore.appendHistory({
      id: session ? session.id : Date.now(),
      profileId: session ? session.profileId : 'unknown',
      status: 'error',
      success: false,
      error: error?.message || String(error),
      finishedAt: Date.now(),
    });
    this.emitStatus('error');
    this.emitError(error);
  }

  cleanupRecorder() {
    if (this.recorder) {
      this.recorder.dispose();
      this.recorder = null;
    }
  }

  emitStatus(status) {
    if (this.activeSession) {
      this.activeSession.status = status;
      audioInputStore.setActiveSession({ ...this.activeSession, status });
    } else {
      audioInputStore.setState({ status });
    }
    this.invokeCallback('onStatus', status);
  }

  emitTranscription(text) {
    this.invokeCallback('onTranscription', text);
  }

  emitLlmResult(result) {
    this.invokeCallback('onResult', result);
  }

  emitError(error) {
    this.invokeCallback('onError', error);
  }

  invokeCallback(name, payload) {
    const callback = this.activeSession?.callbacks?.[name];
    if (typeof callback === 'function') {
      callback(payload);
    }
  }
}

function pickTtsText(profile, llmResult) {
  if (!profile.tts || !profile.tts.defaultMessageField) {
    return null;
  }

  if (profile.id === 'schedule') {
    const first = Array.isArray(llmResult.schedules) ? llmResult.schedules[0] : null;
    if (first && typeof first.ttsMessage === 'string' && first.ttsMessage.trim().length > 0) {
      return first.ttsMessage.trim();
    }
  } else {
    const field = profile.tts.defaultMessageField;
    if (field && typeof llmResult?.[field] === 'string') {
      const text = llmResult[field].trim();
      if (text.length > 0) {
        return text;
      }
    }
  }

  return null;
}

export const audioInputManager = new AudioInputManager();
