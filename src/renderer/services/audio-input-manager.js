/**
 * 音声入力マネージャ（レンダラ）。
 * - MediaRecorder で録音し、メインプロセスの STT/LLM/TTS パイプラインを逐次呼び出す。
 * - 1 セッションずつ直列実行し、履歴ストアへ結果を通知する役割を持つ。
 */

import { audioInputStore } from '../stores/audio-input-store.js';
import { getAudioPromptProfile } from '../../constants/audioProfiles.js';
import { transcribeAudio } from './stt-client.js';
import { runLlm } from './llm-client.js';
import { synthesizeAndPlay } from './tts-adapter.js';

let sessionIdCounter = 0;

class AudioInputManager {
  constructor() {
    this.activeSession = null;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.audioChunks = [];
  }

  get isRecording() {
    return Boolean(this.mediaRecorder && this.mediaRecorder.state === 'recording');
  }

  /**
   * 音声セッションを開始し、録音のライフサイクルを管理する。
   * - 既存セッションがあればキャンセルしてリソースを解放する。
   * @param {{promptProfile:string, contextId?:string, metadata?:object, callbacks?:object}} options
   * @returns {Promise<object>} セッションメタデータ
   */
  async startSession(options) {
    const profile = getAudioPromptProfile(options.promptProfile);

    if (this.activeSession) {
      await this.cancelSession('new-session');
    }

    await this.ensureMicrophonePermission();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    const session = {
      id: ++sessionIdCounter,
      profileId: profile.id,
      contextId: options.contextId || profile.id,
      startedAt: Date.now(),
      status: 'recording',
      callbacks: options.callbacks || {},
      metadata: options.metadata || {},
    };

    this.mediaStream = stream;
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    this.audioChunks = [];
    this.activeSession = session;

    audioInputStore.setActiveSession({ ...session });
    this.emitStatus('recording');

    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    });

    this.mediaRecorder.addEventListener('stop', () => {
      this.handleRecordingComplete(profile).catch((error) => {
        console.error('[audio-input-manager] 処理エラー', error);
        this.failSession(error);
      });
    });

    this.mediaRecorder.start();
    return session;
  }

  /**
   * 録音を停止する。MediaRecorder の状態が inactive なら無視する。
   */
  async stopRecording() {
    if (!this.mediaRecorder) {
      return;
    }
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * 進行中のセッションを強制終了し、履歴にキャンセルとして記録する。
   * @param {string} reason キャンセル理由
   */
  async cancelSession(reason = 'cancelled') {
    if (!this.activeSession) {
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.disposeStream();

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
   * 録音完了後に STT→LLM→TTS を順番に実行する。
   * - 録音データは dispose 前にコピーして空参照を防いでいる。
   * @param {object} profile 音声プロファイル
   */
  async handleRecordingComplete(profile) {
    const session = this.activeSession;
    if (!session) {
      return;
    }

    const recordedChunks = this.audioChunks.slice();
    this.disposeStream();
    this.emitStatus('transcribing');

    if (recordedChunks.length === 0) {
      throw new Error('録音データを取得できませんでした。マイクが有効か確認してください。');
    }

    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    const audioDataBase64 = arrayBufferToBase64(arrayBuffer);

    try {
      const transcription = await transcribeAudio(audioDataBase64, {
        language: session.metadata.language || 'ja',
      });
      this.emitTranscription(transcription.transcribedText);
      this.emitStatus('thinking');

      const llmResult = await runLlm(profile.id, transcription.transcribedText, {
        context: {
          metadata: session.metadata,
          history: session.metadata?.history || [],
        },
        legacyRawResult: transcription.raw,
      });

      if (Array.isArray(llmResult?.segments)) {
        llmResult.segments.forEach((segment) => {
          this.invokeCallback('onPartialResult', segment);
        });
      }

      this.emitLlmResult(llmResult);
      this.emitStatus('speaking');

      let ttsResult = null;
      if (profile.tts && profile.tts.defaultMessageField) {
        const text = pickTtsText(profile, llmResult);
        if (text) {
          ttsResult = await synthesizeAndPlay(text, session.metadata.ttsOptions || {});
        }
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
      this.activeSession = null;
    } catch (error) {
      this.failSession(error);
    }
  }

  /**
   * 異常終了時に履歴へ記録し、UI にエラーを伝える。
   * @param {Error} error
   */
  failSession(error) {
    const session = this.activeSession;
    this.disposeStream();
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

  /**
   * MediaStream と MediaRecorder を開放する共通処理。
   */
  disposeStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }
    this.audioChunks = [];
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

  /**
   * コールバックを安全に起動するヘルパ。
   * @param {string} name コールバック名
   * @param {*} payload イベントデータ
   */
  invokeCallback(name, payload) {
    const callback = this.activeSession?.callbacks?.[name];
    if (typeof callback === 'function') {
      callback(payload);
    }
  }

  /**
   * マイク権限が拒否されていないかを事前確認する。
   * - macOS の permissions API は例外を投げることがあるため try/catch で握りつぶす。
   */
  async ensureMicrophonePermission() {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('マイク入力がサポートされていません');
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'microphone' });
        if (permission.state === 'denied') {
          throw new Error('マイクの利用が拒否されています。ブラウザ設定で許可してください。');
        }
      } catch (error) {
        console.warn('[audio-input-manager] permissions API チェックに失敗', error);
      }
    }
  }
}

/**
 * プロファイルごとに読み上げメッセージを抽出する。
 * @param {object} profile
 * @param {object} llmResult
 * @returns {string|null}
 */
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

/**
 * MediaRecorder 出力を Base64 へ変換するユーティリティ。
 * @param {ArrayBuffer} arrayBuffer
 * @returns {string}
 */
function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export const audioInputManager = new AudioInputManager();
