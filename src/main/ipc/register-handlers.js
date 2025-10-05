/**
 * メインプロセスでの IPC ハンドラ登録。
 * - レンダラへ露出するメイン機能（通知、検知、VOICEVOX、音声入力）を一元的に定義する。
 * - 依存オブジェクトを DI することでテストや将来の差し替えを容易にする。
 */
const { synthesizeWithVoiceVox } = require('../services/voicevox');
const { getActiveWindowInfo } = require('../services/active-window');
const { processVoiceInput, checkVoiceInputAvailability } = require('../services/voice-input');
const { generateTtsMessageForSchedule } = require('../services/llm');
const { run, all } = require('../db');

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

  ipcMain.handle('schedule-generate-tts', async (_event, schedule) => {
    try {
      if (!schedule || typeof schedule !== 'object') {
        throw new Error('スケジュール情報が不正です');
      }

      const message = await generateTtsMessageForSchedule(schedule);
      return { success: true, message };
    } catch (error) {
      console.error('[IPC] スケジュールTTS生成エラー:', error);
      return { success: false, error: error.message };
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
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 500) : 50;
      const rows = await all(
        'SELECT id, detected_at, type, duration_seconds, meta FROM detection_logs ORDER BY detected_at DESC LIMIT ?',
        [limit]
      );

      const result = rows.map((row) => ({
        id: row.id,
        detectedAt: row.detected_at,
        type: row.type,
        durationSeconds: row.duration_seconds,
        meta: safeParseJson(row.meta),
      }));

      return { success: true, items: result };
    } catch (error) {
      console.error('[IPC] 検知ログ取得エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('detection-log-stats', async (_event, options = {}) => {
    try {
      const now = Date.now();
      const defaultStart = now - 7 * 24 * 60 * 60 * 1000;
      const start = Number.isFinite(options.start) ? options.start : defaultStart;
      const end = Number.isFinite(options.end) ? options.end : now;
      const groupBy = options.groupBy === 'hour' ? 'hour' : 'day';

      const groupExpr = groupBy === 'hour'
        ? "strftime('%Y-%m-%d %H:00:00', detected_at / 1000, 'unixepoch', 'localtime')"
        : "strftime('%Y-%m-%d', detected_at / 1000, 'unixepoch', 'localtime')";

      const rows = await all(
        `SELECT ${groupExpr} AS bucket,
                type,
                COUNT(*) AS count,
                AVG(duration_seconds) AS avg_duration,
                SUM(duration_seconds) AS total_duration
         FROM detection_logs
         WHERE detected_at BETWEEN ? AND ?
         GROUP BY bucket, type
         ORDER BY bucket ASC`,
        [start, end]
      );

      const summaryByType = {};
      const buckets = {};

      rows.forEach((row) => {
        const bucketKey = row.bucket || 'unknown';
        if (!buckets[bucketKey]) {
          buckets[bucketKey] = {
            bucket: bucketKey,
            counts: {},
            totalCount: 0,
            totalDurationSeconds: 0,
          };
        }

        const bucket = buckets[bucketKey];
        bucket.counts[row.type] = row.count;
        bucket.totalCount += row.count;
        if (row.total_duration) {
          bucket.totalDurationSeconds += row.total_duration;
        }

        if (!summaryByType[row.type]) {
          summaryByType[row.type] = {
            count: 0,
            totalDurationSeconds: 0,
          };
        }
        summaryByType[row.type].count += row.count;
        if (row.total_duration) {
          summaryByType[row.type].totalDurationSeconds += row.total_duration;
        }
      });

      const bucketList = Object.values(buckets).sort((a, b) => (a.bucket > b.bucket ? 1 : -1));
      const totalCount = bucketList.reduce((sum, bucket) => sum + bucket.totalCount, 0);
      const totalDurationSeconds = bucketList.reduce((sum, bucket) => sum + (bucket.totalDurationSeconds || 0), 0);

      return {
        success: true,
        data: {
          buckets: bucketList,
          summary: {
            totalCount,
            totalDurationSeconds,
            byType: summaryByType,
          },
          range: { start, end, groupBy },
        },
      };
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
      const now = Date.now();
      const defaultStart = now - 7 * 24 * 60 * 60 * 1000;
      const start = Number.isFinite(options.start) ? options.start : defaultStart;
      const end = Number.isFinite(options.end) ? options.end : now;
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 50) : 10;

      const rows = await all(
        `SELECT app_name,
                COALESCE(domain, '') AS domain,
                SUM(duration_seconds) AS total_duration,
                COUNT(*) AS sessions
         FROM app_usage_logs
         WHERE started_at BETWEEN ? AND ?
         GROUP BY app_name, domain
         ORDER BY total_duration DESC
         LIMIT ?`,
        [start, end, limit]
      );

      const totalDuration = rows.reduce((sum, row) => sum + (row.total_duration || 0), 0);

      return {
        success: true,
        data: {
          range: { start, end },
          totalDurationSeconds: totalDuration,
          items: rows.map((row) => ({
            appName: row.app_name,
            domain: row.domain || null,
            totalDurationSeconds: row.total_duration || 0,
            sessions: row.sessions || 0,
          })),
        },
      };
    } catch (error) {
      console.error('[IPC] アプリ使用時間集計エラー:', error);
      return { success: false, error: error.message };
    }
  });
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  registerIpcHandlers
};
