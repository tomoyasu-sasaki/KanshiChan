/**
 * メインプロセスでの IPC ハンドラ登録。
 * - レンダラへ露出するメイン機能（通知、検知、VOICEVOX、音声入力）を一元的に定義する。
 * - 依存オブジェクトを DI することでテストや将来の差し替えを容易にする。
 */
const { BrowserWindow } = require('electron');

/**
 * エラーメッセージをサニタイズし、機密情報の漏洩を防ぐ。
 * - パス情報の除去
 * - スタックトレースの除去
 * @param {Error|string} error エラーオブジェクトまたはメッセージ
 * @returns {string} サニタイズされたエラーメッセージ
 */
function sanitizeErrorMessage(error) {
  let message = typeof error === 'string' ? error : (error?.message || '不明なエラーが発生しました');

  // ファイルパスを除去
  message = message.replace(/\/[^\s]+\.(js|ts|json)/gi, '[ファイルパス]');
  message = message.replace(/[A-Z]:\\[^\s]+/gi, '[ファイルパス]');

  // スタックトレースを除去
  message = message.split('\n')[0];

  // SQLクエリを除去
  message = message.replace(/SELECT .* FROM .*/gi, '[SQLクエリ]');
  message = message.replace(/INSERT INTO .*/gi, '[SQLクエリ]');
  message = message.replace(/UPDATE .* SET .*/gi, '[SQLクエリ]');
  message = message.replace(/DELETE FROM .*/gi, '[SQLクエリ]');

  return message;
}

/**
 * タスクペイロードを検証する。
 * @param {any} payload 検証対象
 * @returns {{valid: boolean, error?: string}}
 */
function validateTaskPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'payload はオブジェクトである必要があります' };
  }

  if (payload.title !== undefined && typeof payload.title !== 'string') {
    return { valid: false, error: 'title は文字列である必要があります' };
  }

  if (payload.description !== undefined && typeof payload.description !== 'string') {
    return { valid: false, error: 'description は文字列である必要があります' };
  }

  if (payload.priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high'];
    if (typeof payload.priority !== 'string' || !validPriorities.includes(payload.priority.toLowerCase())) {
      return { valid: false, error: 'priority は low, medium, high のいずれかである必要があります' };
    }
  }

  if (payload.status !== undefined) {
    const validStatuses = ['todo', 'in_progress', 'done'];
    if (typeof payload.status !== 'string' || !validStatuses.includes(payload.status.toLowerCase())) {
      return { valid: false, error: 'status は todo, in_progress, done のいずれかである必要があります' };
    }
  }

  return { valid: true };
}
const { synthesizeWithVoiceVox } = require('../services/voicevox');
const { getActiveWindowInfo } = require('../services/active-window');
const audioService = require('../services/audio');
const { run } = require('../db');
const tasksService = require('../services/tasks');
const {
  getDetectionStats,
  getRecentDetectionLogs,
  getAppUsageStats,
  getTypingStats,
  getSystemEvents,
  getAbsenceOverrideSummary,
  getAbsenceOverrideEvents,
} = require('../services/statistics');

/**
 * IPC チャネルを初期化する。
 * @param {Object} deps Electron 依存をまとめた引数
 * @param {Electron.IpcMain} deps.ipcMain IPC メインエンドポイント
 * @param {typeof Notification} deps.Notification デスクトップ通知 API
 * @param {Function} deps.yoloDetectorProvider YOLODetector インスタンスを返す関数
 */
function registerIpcHandlers({
  ipcMain,
  Notification,
  yoloDetectorProvider,
  slackReporter,
  configStore,
  typingMonitor,
  systemEventMonitor,
  absenceOverrideManager,
}) {
  if (!absenceOverrideManager) {
    throw new Error('absenceOverrideManager is required to register IPC handlers');
  }

  /**
   * メインプロセスでの状態変化をすべての BrowserWindow へブロードキャストする。
   * - レンダラ側は state をキャッシュしているため、最小限の差分のみ送ればよい。
   */
  function broadcastAbsenceOverrideState(state = null) {
    const promise = state ? Promise.resolve(state) : absenceOverrideManager.getState();
    promise
      .then((snapshot) => {
        BrowserWindow.getAllWindows().forEach(window => {
          if (!window?.webContents?.isDestroyed()) {
            window.webContents.send('absence_override_state_changed', snapshot);
          }
        });
      })
      .catch((error) => {
        console.error('[IPC] absence_override state broadcast error:', error);
      });
  }

  absenceOverrideManager.on('change', broadcastAbsenceOverrideState);

  /**
   * 不在許可の操作イベントを system_events テーブルへ記録する。
   * - Slack など他サービスが後段で利用するため、メタ情報を JSON として保存する。
   */
  function logAbsenceOverrideEvent(entry, status) {
    if (!systemEventMonitor?.recordEvent || !entry) {
      return;
    }
    const meta = {
      status,
      reason: entry.reason,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt ?? null,
      expiresAt: entry.expiresAt ?? null,
      manualEnd: entry.manualEnd,
      presetId: entry.presetId ?? null,
      note: entry.note ?? null,
      eventId: entry.eventId ?? null,
    };
    Promise.resolve(systemEventMonitor.recordEvent(`absence_override_${status}`, meta)).catch((error) => {
      console.error('[IPC] absence_override system event log error:', error);
    });
  }

  absenceOverrideManager.on('activate', (state) => {
    logAbsenceOverrideEvent(state?.current || state?.raw, 'activated');
  });

  absenceOverrideManager.on('extend', (state) => {
    logAbsenceOverrideEvent(state?.current || state?.raw, 'extended');
  });

  absenceOverrideManager.on('clear', (_state, context) => {
    const entry = context?.archived;
    logAbsenceOverrideEvent(entry, 'cleared');
  });

  absenceOverrideManager.on('expire', (_state, context) => {
    const entry = context?.archived;
    logAbsenceOverrideEvent(entry, 'expired');
  });
  ipcMain.handle('save-schedule', async (_event, schedule) => {
    return { success: true, schedule };
  });

  ipcMain.handle('schedule-sync', async (_event, payload = []) => {
    try {
      if (!Array.isArray(payload)) {
        throw new Error('スケジュール配列が不正です');
      }
      if (configStore) {
        configStore.set('scheduleCache', payload);
      }
      return { success: true };
    } catch (error) {
      console.error('[IPC] スケジュール同期エラー:', error);
      return { success: false, error: error.message };
    }
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

  ipcMain.handle('audio-transcribe', async (_event, payload = {}) => {
    try {
      const result = await audioService.transcribe(payload);
      return result;
    } catch (error) {
      console.error('[IPC] audio-transcribe エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('audio-infer', async (_event, payload = {}) => {
    try {
      const { profileId, text, context } = payload;
      const result = await audioService.infer(profileId, text, context);
      return result;
    } catch (error) {
      console.error('[IPC] audio-infer エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('audio-check-availability', async () => {
    try {
      return await audioService.checkAvailability();
    } catch (error) {
      console.error('[IPC] audio-check-availability エラー:', error);
      return { success: false, error: error.message };
    }
  });

  // Tasks CRUD
  ipcMain.handle('tasks-create', async (_event, payload = {}) => {
    try {
      // ペイロードの検証
      const validation = validateTaskPayload(payload);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const task = await tasksService.createTask(payload || {});
      return { success: true, task };
    } catch (error) {
      console.error('[IPC] tasks-create エラー:', error);
      return { success: false, error: sanitizeErrorMessage(error) };
    }
  });

  ipcMain.handle('tasks-update', async (_event, id, fields = {}) => {
    try {
      // IDの検証
      if (!Number.isFinite(Number(id))) {
        return { success: false, error: 'タスク ID が不正です' };
      }

      // フィールドの検証
      if (fields && typeof fields === 'object') {
        const validation = validateTaskPayload(fields);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }
      }

      const task = await tasksService.updateTask(id, fields || {});
      return { success: true, task };
    } catch (error) {
      console.error('[IPC] tasks-update エラー:', error);
      return { success: false, error: sanitizeErrorMessage(error) };
    }
  });

  ipcMain.handle('tasks-delete', async (_event, id) => {
    try {
      // IDの検証
      if (!Number.isFinite(Number(id))) {
        return { success: false, error: 'タスク ID が不正です' };
      }

      const result = await tasksService.deleteTask(id);
      return { success: true, result };
    } catch (error) {
      console.error('[IPC] tasks-delete エラー:', error);
      return { success: false, error: sanitizeErrorMessage(error) };
    }
  });

  ipcMain.handle('tasks-list', async (_event, filter = {}) => {
    try {
      // フィルタの検証
      if (filter && typeof filter !== 'object') {
        return { success: false, error: 'filter はオブジェクトである必要があります' };
      }

      const items = await tasksService.listTasks(filter || {});
      return { success: true, items };
    } catch (error) {
      console.error('[IPC] tasks-list エラー:', error);
      return { success: false, error: sanitizeErrorMessage(error) };
    }
  });

  ipcMain.handle('detection-log-record', async (_event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('payload が不正です');
      }

      const { type, detectedAt, durationSeconds = null, meta = null } = payload;

      if (!type || typeof type !== 'string') {
        throw new Error('type を指定してください');
      }

      if (typeof detectedAt !== 'number') {
        throw new Error('detectedAt は UNIX 時刻 (ms) の数値で指定してください');
      }

      const metaText = meta ? JSON.stringify(meta) : null;

      await run(
        'INSERT INTO detection_logs (detected_at, type, duration_seconds, meta) VALUES (?, ?, ?, ?)',
        [detectedAt, type, durationSeconds, metaText]
      );

      return { success: true };
    } catch (error) {
      console.error('[IPC] 検知ログ書き込みエラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('detection-log-recent', async (_event, options = {}) => {
    try {
      const items = await getRecentDetectionLogs(options);
      return { success: true, items };
    } catch (error) {
      console.error('[IPC] 検知ログ取得エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('detection-log-stats', async (_event, options = {}) => {
    try {
      const data = await getDetectionStats(options);
      return { success: true, data };
    } catch (error) {
      console.error('[IPC] 検知ログ統計エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('app-usage-record', async (_event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('payload が不正です');
      }

      const { appName, title = null, domain = null, startedAt, endedAt, durationSeconds } = payload;

      if (!appName || typeof appName !== 'string') {
        throw new Error('appName を指定してください');
      }

      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
        throw new Error('startedAt / endedAt は数値で指定してください');
      }

      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error('durationSeconds は正の数値で指定してください');
      }

      await run(
        'INSERT INTO app_usage_logs (app_name, title, domain, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)',
        [appName, title, domain, startedAt, endedAt, durationSeconds]
      );

      return { success: true };
    } catch (error) {
      console.error('[IPC] アプリ使用時間書き込みエラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('app-usage-stats', async (_event, options = {}) => {
    try {
      const data = await getAppUsageStats(options);
      return { success: true, data };
    } catch (error) {
      console.error('[IPC] アプリ使用時間集計エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('typing-activity-stats', async (_event, options = {}) => {
    try {
      if (typingMonitor?.flushPending) {
        await typingMonitor.flushPending();
      }
      const data = await getTypingStats(options);
      return { success: true, data };
    } catch (error) {
      console.error('[IPC] タイピング統計エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('system-events-recent', async (_event, options = {}) => {
    try {
      const data = await getSystemEvents(options);
      return { success: true, data };
    } catch (error) {
      console.error('[IPC] システムイベント取得エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_get_state', async () => {
    try {
      const state = await absenceOverrideManager.getState();
      return { success: true, state };
    } catch (error) {
      console.error('[IPC] absence_override_get_state エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_activate', async (_event, payload = {}) => {
    try {
      const state = await absenceOverrideManager.activateOverride(payload || {});
      return { success: true, state };
    } catch (error) {
      console.error('[IPC] absence_override_activate エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_extend', async (_event, payload = {}) => {
    try {
      const state = await absenceOverrideManager.extendOverride(payload || {});
      return { success: true, state };
    } catch (error) {
      console.error('[IPC] absence_override_extend エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_clear', async (_event, options = {}) => {
    try {
      const state = await absenceOverrideManager.clearOverride(options || {});
      return { success: true, state };
    } catch (error) {
      console.error('[IPC] absence_override_clear エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_history', async () => {
    try {
      const history = absenceOverrideManager.getHistory();
      return { success: true, history };
    } catch (error) {
      console.error('[IPC] absence_override_history エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_summary', async (_event, options = {}) => {
    try {
      const summary = await getAbsenceOverrideSummary(options || {});
      return { success: true, summary };
    } catch (error) {
      console.error('[IPC] absence_override_summary エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('absence_override_events', async (_event, options = {}) => {
    try {
      const events = await getAbsenceOverrideEvents(options || {});
      return { success: true, events };
    } catch (error) {
      console.error('[IPC] absence_override_events エラー:', error);
      return { success: false, error: error.message };
    }
  });

  if (slackReporter && configStore) {
    ipcMain.handle('slack-reporter-get-settings', async () => {
      try {
        const settings = await slackReporter.getSettings();
        return { success: true, settings };
      } catch (error) {
        console.error('[IPC] Slack 設定取得エラー:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('slack-reporter-update-settings', async (_event, payload) => {
      try {
        const settings = await slackReporter.updateSettings(payload || {});
        return { success: true, settings };
      } catch (error) {
        console.error('[IPC] Slack 設定更新エラー:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('slack-reporter-send-now', async () => {
      try {
        const result = await slackReporter.sendReport({ reason: 'manual' });
        return { success: true, result };
      } catch (error) {
        console.error('[IPC] Slack 手動送信エラー:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('slack-reporter-history', async (_event, options = {}) => {
      try {
        const history = await slackReporter.getHistory(options.limit || 10);
        return { success: true, history };
      } catch (error) {
        console.error('[IPC] Slack 履歴取得エラー:', error);
        return { success: false, error: error.message };
      }
    });
  }

  if (typingMonitor) {
    ipcMain.handle('typing-monitor-status', async () => {
      try {
        const status = typingMonitor.getStatus();
        return { success: true, status };
      } catch (error) {
        console.error('[IPC] タイピング状態取得エラー:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('typing-monitor-set-enabled', async (_event, enabled) => {
      try {
        const status = await typingMonitor.setEnabled(Boolean(enabled));
        return { success: true, status };
      } catch (error) {
        console.error('[IPC] タイピング監視切替エラー:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('typing-monitor-set-paused', async (_event, paused) => {
      try {
        const status = await typingMonitor.setPaused(Boolean(paused));
        return { success: true, status };
      } catch (error) {
        console.error('[IPC] タイピング監視一時停止エラー:', error);
        return { success: false, error: error.message };
      }
    });
  }
}

module.exports = {
  registerIpcHandlers
};
