/**
 * マイク録音管理モジュール。
 * - MediaRecorder をラップし、録音データの収集と権限チェックを集約する。
 */

const DEFAULT_MIME_TYPE = 'audio/webm';

export class AudioRecorder {
  constructor({ mimeType = DEFAULT_MIME_TYPE, onStop } = {}) {
    this.mimeType = mimeType;
    this.onStop = typeof onStop === 'function' ? onStop : null;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.chunks = [];
  }

  get isRecording() {
    return Boolean(this.mediaRecorder && this.mediaRecorder.state === 'recording');
  }

  async start() {
    await ensureMicrophonePermission();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: this.mimeType });
    this.chunks = [];

    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    if (this.onStop) {
      this.mediaRecorder.addEventListener('stop', async () => {
        try {
          const base64 = await this.exportBase64();
          this.onStop(base64);
        } catch (error) {
          this.onStop(null, error);
        }
      });
    }

    this.mediaRecorder.start();
    return this.mediaRecorder;
  }

  async stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return;
    }

    await new Promise((resolve) => {
      this.mediaRecorder.addEventListener('stop', () => resolve(), { once: true });
      this.mediaRecorder.stop();
    });
  }

  dispose() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }

  async exportBase64() {
    if (!this.chunks.length) {
      throw new Error('録音データが空です');
    }
    const blob = new Blob(this.chunks, { type: this.mimeType });
    const arrayBuffer = await blob.arrayBuffer();
    return arrayBufferToBase64(arrayBuffer);
  }
}

async function ensureMicrophonePermission() {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('マイク入力がサポートされていません');
  }

  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      if (status.state === 'denied') {
        throw new Error('マイクの利用が拒否されています。システム設定で許可してください。');
      }
    } catch (error) {
      console.warn('[audio-recorder] permissions API チェックに失敗', error);
    }
  }
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
