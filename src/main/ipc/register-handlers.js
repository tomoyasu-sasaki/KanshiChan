/**
 * メインプロセスでの IPC ハンドラ登録。
 * - レンダラへ露出するメイン機能（通知、検知、VOICEVOX、音声入力）を一元的に定義する。
 * - 依存オブジェクトを DI することでテストや将来の差し替えを容易にする。
 */
const { synthesizeWithVoiceVox } = require('../services/voicevox');
const { getActiveWindowInfo } = require('../services/active-window');
const { processVoiceInput, checkVoiceInputAvailability } = require('../services/voice-input');

/**
 * IPC チャネルを初期化する。
 * @param {Object} deps Electron 依存をまとめた引数
 * @param {Electron.IpcMain} deps.ipcMain IPC メインエンドポイント
 * @param {typeof Notification} deps.Notification デスクトップ通知 API
 * @param {Function} deps.yoloDetectorProvider YOLODetector インスタンスを返す関数
 */
function registerIpcHandlers({ ipcMain, Notification, yoloDetectorProvider }) {
  ipcMain.handle('save-schedule', async (_event, schedule) => {
    return { success: true, schedule };
  });

  ipcMain.handle('send-notification', async (_event, { title, body }) => {
    if (!Notification.isSupported()) {
      return { success: false };
    }
    const notification = new Notification({ title, body });
    notification.show();
    return { success: true };
  });

  ipcMain.handle('detect-objects', async (_event, imageDataUrl) => {
    const detector = yoloDetectorProvider();
    if (!detector) {
      return { success: false, error: 'YOLO検知器が初期化されていません' };
    }

    try {
      const detections = await detector.detect(imageDataUrl);
      return { success: true, detections };
    } catch (error) {
      console.error('検知エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-active-window', async () => {
    try {
      const windowInfo = await getActiveWindowInfo();
      return { success: true, window: windowInfo };
    } catch (error) {
      console.error('アクティブウィンドウ取得エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tts-speak', async (_event, payload) => {
    try {
      const { text, engine = 'voicevox', options = {} } = payload || {};
      if (!text || typeof text !== 'string') {
        return { success: false, error: 'text が空です' };
      }

      if (engine !== 'voicevox') {
        return { success: false, error: `未対応のエンジン: ${engine}` };
      }

      if (typeof fetch !== 'function') {
        return { success: false, error: 'fetch が利用できません（Node v18+ が必要）' };
      }

      const dataUrl = await synthesizeWithVoiceVox(text, options);
      return { success: true, dataUrl };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('voice-input-transcribe', async (_event, audioDataBase64) => {
    try {
      if (!audioDataBase64 || typeof audioDataBase64 !== 'string') {
        return { success: false, error: '音声データが不正です' };
      }

      const result = await processVoiceInput(audioDataBase64);
      return result;
    } catch (error) {
      console.error('[IPC] 音声入力エラー:', error);
      console.error('[IPC] エラースタック:', error.stack);
      const errorMessage = error?.message || error?.toString() || '不明なエラー';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('voice-input-check-availability', async () => {
    try {
      const status = await checkVoiceInputAvailability();
      return status;
    } catch (error) {
      console.error('[IPC] 音声入力モデルチェックエラー:', error);
      return {
        available: false,
        models: { whisper: false, llm: false },
        errors: [error.message],
      };
    }
  });
}

module.exports = {
  registerIpcHandlers
};
