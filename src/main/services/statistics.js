/**
 * 集計系ユーティリティ。
 * - 検知ログ / アプリ滞在時間の統計をメインプロセス側で再利用できるようにする。
 */
const { all } = require('../db');

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

/**
 * 検知ログの統計情報を取得する。
 * @param {Object} options
 * @param {number} options.start
 * @param {number} options.end
 * @param {'hour'|'day'} [options.groupBy]
 * @returns {Promise<{buckets: Array, summary: Object, range: Object}>}
 */
async function getDetectionStats(options = {}) {
  const now = Date.now();
  const defaultStart = now - 7 * 24 * 60 * 60 * 1000;
  const start = Number.isFinite(options.start) ? options.start : defaultStart;
  const end = Number.isFinite(options.end) ? options.end : now;
  const groupBy = options.groupBy === 'hour' ? 'hour' : 'day';

  const groupExpr =
    groupBy === 'hour'
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
    buckets: bucketList,
    summary: {
      totalCount,
      totalDurationSeconds,
      byType: summaryByType,
    },
    range: { start, end, groupBy },
  };
}

/**
 * 直近の検知ログ一覧を取得する。
 * @param {Object} options
 * @param {number} [options.limit]
 * @returns {Promise<Array>}
 */
async function getRecentDetectionLogs(options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 500) : 50;
  const rows = await all(
    'SELECT id, detected_at, type, duration_seconds, meta FROM detection_logs ORDER BY detected_at DESC LIMIT ?',
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    detectedAt: row.detected_at,
    type: row.type,
    durationSeconds: row.duration_seconds,
    meta: safeParseJson(row.meta),
  }));
}

/**
 * アプリ使用時間の統計を取得する。
 * @param {Object} options
 * @param {number} [options.start]
 * @param {number} [options.end]
 * @param {number} [options.limit]
 * @returns {Promise<{range: Object, totalDurationSeconds: number, items: Array}>}
 */
async function getAppUsageStats(options = {}) {
  const now = Date.now();
  const defaultStart = now - 7 * 24 * 60 * 60 * 1000;
  const start = Number.isFinite(options.start) ? options.start : defaultStart;
  const end = Number.isFinite(options.end) ? options.end : now;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 50) : 10;

  const aggregatedRows = await all(
    `SELECT app_name,
            SUM(duration_seconds) AS total_duration,
            COUNT(*) AS sessions
     FROM app_usage_logs
     WHERE started_at BETWEEN ? AND ?
     GROUP BY app_name
     ORDER BY total_duration DESC
     LIMIT ?`,
    [start, end, limit]
  );

  const chromeDetailRows = await all(
    `SELECT COALESCE(NULLIF(domain, ''), NULLIF(title, ''), '(未記録)') AS label,
            SUM(duration_seconds) AS total_duration,
            COUNT(*) AS sessions
     FROM app_usage_logs
     WHERE started_at BETWEEN ? AND ?
       AND app_name = 'Google Chrome'
     GROUP BY COALESCE(NULLIF(domain, ''), NULLIF(title, ''), '(未記録)')
     ORDER BY total_duration DESC
     LIMIT 10`,
    [start, end]
  );

  const totalDuration = aggregatedRows.reduce((sum, row) => sum + (row.total_duration || 0), 0);

  return {
    range: { start, end },
    totalDurationSeconds: totalDuration,
    items: aggregatedRows.map((row) => ({
      appName: row.app_name,
      totalDurationSeconds: row.total_duration || 0,
      sessions: row.sessions || 0,
    })),
    chromeDetails: chromeDetailRows.map((row) => ({
      label: row.label,
      totalDurationSeconds: row.total_duration || 0,
      sessions: row.sessions || 0,
    })),
  };
}

async function getTypingStats(options = {}) {
  const now = Date.now();
  const defaultStart = now - 24 * 60 * 60 * 1000;
  const start = Number.isFinite(options.start) ? options.start : defaultStart;
  const end = Number.isFinite(options.end) ? options.end : now;

  const rows = await all(
    `SELECT bucket_start,
            bucket_end,
            key_presses,
            longest_streak_seconds
     FROM typing_activity_logs
     WHERE bucket_start BETWEEN ? AND ?
     ORDER BY bucket_start ASC`,
    [start, end]
  );

  const buckets = rows.map((row) => ({
    bucketStart: row.bucket_start,
    bucketEnd: row.bucket_end,
    keyPresses: row.key_presses || 0,
    longestStreakSeconds: row.longest_streak_seconds || 0,
  }));

  const totalKeyPresses = buckets.reduce((sum, bucket) => sum + (bucket.keyPresses || 0), 0);
  const longestStreak = buckets.reduce((max, bucket) => Math.max(max, bucket.longestStreakSeconds || 0), 0);
  const bucketCount = buckets.length || 1;
  const averagePerMinute = Math.round(totalKeyPresses / bucketCount);

  return {
    range: { start, end },
    buckets,
    summary: {
      totalKeyPresses,
      longestStreakSeconds: longestStreak,
      averageKeyPressesPerMinute: averagePerMinute,
    },
  };
}

function normalizeManualFlag(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value === 1;
}

function calculateOverlapSeconds(windowStart, windowEnd, rangeStart, rangeEnd) {
  const start = Math.max(windowStart, rangeStart);
  const end = Math.min(windowEnd, rangeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  if (end <= start) {
    return 0;
  }
  return Math.floor((end - start) / 1000);
}

/**
 * absence_override_events テーブルを期間で抽出する。
 * - 監視ダッシュボードでは直近 200 件以内に制限し、期間外は含めない。
 * @param {{start?:number,end?:number,limit?:number}} options
 */
async function getAbsenceOverrideEvents(options = {}) {
  const now = Date.now();
  const defaultStart = now - 7 * 24 * 60 * 60 * 1000;
  const start = Number.isFinite(options.start) ? options.start : defaultStart;
  const end = Number.isFinite(options.end) ? options.end : now;
  const limit = Number.isInteger(options.limit) ? Math.max(Math.min(options.limit, 200), 1) : 200;

  const rows = await all(
    `SELECT id,
            started_at,
            ended_at,
            expires_at,
            reason,
            preset_id,
            duration_minutes,
            manual_end,
            note,
            created_by,
            created_at
       FROM absence_override_events
       WHERE started_at <= ?
         AND COALESCE(ended_at, expires_at, ?) >= ?
       ORDER BY started_at DESC
       LIMIT ?`,
    [end, end, start, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    expiresAt: row.expires_at,
    reason: row.reason,
    presetId: row.preset_id,
    durationMinutes: row.duration_minutes,
    manualEnd: normalizeManualFlag(row.manual_end),
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

/**
 * 不在許可と不許可の重なり時間を算出する。
 * - オーバーラップする秒数のみ加算し、未終了の許可は activeCount でレポートする。
 * @param {{start?:number,end?:number,limit?:number}} options
 */
async function getAbsenceOverrideSummary(options = {}) {
  const now = Date.now();
  const defaultStart = now - 7 * 24 * 60 * 60 * 1000;
  const start = Number.isFinite(options.start) ? options.start : defaultStart;
  const end = Number.isFinite(options.end) ? options.end : now;

  const events = await getAbsenceOverrideEvents({ start, end, limit: options.limit });

  let totalSeconds = 0;
  let manualSeconds = 0;
  let autoSeconds = 0;
  let activeCount = 0;

  events.forEach((event) => {
    const eventEnd = Number.isFinite(event.endedAt)
      ? event.endedAt
      : Number.isFinite(event.expiresAt)
        ? event.expiresAt
        : end;
    const overlap = calculateOverlapSeconds(event.startedAt, eventEnd, start, end);
    if (overlap > 0) {
      totalSeconds += overlap;
      if (event.manualEnd === false) {
        autoSeconds += overlap;
      } else if (event.manualEnd === true) {
        manualSeconds += overlap;
      }
    }
    if (!Number.isFinite(event.endedAt)) {
      activeCount += 1;
    }
  });

  return {
    range: { start, end },
    events,
    totalSeconds,
    manualSeconds,
    autoSeconds,
    activeCount,
  };
}

async function getSystemEvents(options = {}) {
  const now = Date.now();
  const defaultStart = now - 24 * 60 * 60 * 1000;
  const start = Number.isFinite(options.start) ? options.start : defaultStart;
  const end = Number.isFinite(options.end) ? options.end : now;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 200) : 100;

  const rows = await all(
    `SELECT event_type, occurred_at, meta
     FROM system_events
     WHERE occurred_at BETWEEN ? AND ?
     ORDER BY occurred_at DESC
     LIMIT ?`,
    [start, end, limit]
  );

  const events = rows.map((row) => ({
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    meta: safeParseJson(row.meta),
  }));

  const summaryByType = events.reduce((acc, event) => {
    const key = event.eventType || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    range: { start, end },
    events,
    summary: summaryByType,
  };
}

module.exports = {
  getDetectionStats,
  getRecentDetectionLogs,
  getAppUsageStats,
  getTypingStats,
  getSystemEvents,
  getAbsenceOverrideEvents,
  getAbsenceOverrideSummary,
};
