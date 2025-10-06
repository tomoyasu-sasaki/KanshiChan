/**
 * Slack 定期レポート送信サービス。
 * - ユーザーデータ配下の設定を読み込み、指定時刻に統計を送信する。
 * - 手動送信、履歴取得、設定更新を IPC 経由で提供する。
 */
const { run, all } = require('../db');
const {
  getDetectionStats,
  getAppUsageStats,
  getSystemEvents,
} = require('./statistics');

const DEFAULT_SETTINGS = {
  enabled: false,
  webhookUrl: '',
  scheduleTimes: ['13:00', '18:00'],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

function formatTimeKey(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateLabel(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0分';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}

function normalizeScheduleTimes(times) {
  if (!Array.isArray(times)) {
    return DEFAULT_SETTINGS.scheduleTimes;
  }
  const unique = new Set();
  times.forEach((time) => {
    if (typeof time !== 'string') {
      return;
    }
    const trimmed = time.trim();
    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
      return;
    }
    const [h, m] = trimmed.split(':').map((v) => parseInt(v, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) {
      return;
    }
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      return;
    }
    unique.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  });
  return unique.size > 0 ? Array.from(unique).sort() : DEFAULT_SETTINGS.scheduleTimes;
}

function createSlackReporter({ configStore }, dependencies = {}) {
  let settings = {
    ...DEFAULT_SETTINGS,
    ...(configStore.get('slackReporter', {})),
  };

  settings.scheduleTimes = normalizeScheduleTimes(settings.scheduleTimes);

  let intervalHandle = null;
  let lastTriggered = new Set();

  function clearScheduler() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    lastTriggered = new Set();
  }

  function shouldRunScheduled(now) {
    if (!settings.enabled || !settings.webhookUrl) {
      return false;
    }
    const currentKey = formatTimeKey(now);
    if (!settings.scheduleTimes.includes(currentKey)) {
      return false;
    }
    const dateKey = `${formatDateLabel(now)}-${currentKey}`;
    if (lastTriggered.has(dateKey)) {
      return false;
    }
    // 秒単位で 30 秒以内に限定して誤発火を防ぐ
    if (now.getSeconds() > 30) {
      return false;
    }
    lastTriggered.add(dateKey);
    // 古いキーを除去
    if (lastTriggered.size > 100) {
      const keep = new Set();
      for (const key of lastTriggered) {
        if (key.startsWith(formatDateLabel(now))) {
          keep.add(key);
        }
      }
      lastTriggered = keep;
    }
    return true;
  }

  function ensureScheduler() {
    clearScheduler();
    if (!settings.enabled || !settings.webhookUrl) {
      return;
    }
    intervalHandle = setInterval(async () => {
      const now = new Date();
      if (shouldRunScheduled(now)) {
        try {
          await sendReport({
            reason: 'schedule',
            scheduledFor: formatTimeKey(now),
            scheduledTimestamp: now.getTime(),
          });
        } catch (error) {
          console.error('[SlackReporter] 定期送信失敗:', error);
        }
      }
    }, 15 * 1000);
  }

  async function logResult(entry) {
    const { scheduledFor, sentAt, status, reason, message, error } = entry;
    await run(
      'INSERT INTO slack_report_logs (scheduled_for, sent_at, status, reason, message, error) VALUES (?, ?, ?, ?, ?, ?)',
      [
        scheduledFor ?? null,
        sentAt ?? Date.now(),
        status,
        reason || null,
        message || null,
        error || null,
      ]
    );
  }

  async function getLastSuccessfulSentAt() {
    const rows = await all(
      'SELECT sent_at FROM slack_report_logs WHERE status = ? ORDER BY sent_at DESC LIMIT 1',
      ['success']
    );
    if (!rows || rows.length === 0) {
      return null;
    }
    const value = Number(rows[0]?.sent_at);
    return Number.isFinite(value) ? value : null;
  }

  const detectionStatsFn = dependencies.getDetectionStats || getDetectionStats;
  const appUsageStatsFn = dependencies.getAppUsageStats || getAppUsageStats;
  const systemEventsFn = dependencies.getSystemEvents || getSystemEvents;

  async function buildReport(options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const endTimestamp = now.getTime();
    let startTimestamp = Number.isFinite(options.start) ? Number(options.start) : null;

    if (!Number.isFinite(startTimestamp)) {
      const rangeStart = new Date(now);
      rangeStart.setHours(0, 0, 0, 0);
      startTimestamp = rangeStart.getTime();
    }

    const rangeStartDate = new Date(startTimestamp);

    const detectionStats = await detectionStatsFn({
      start: startTimestamp,
      end: endTimestamp,
      groupBy: 'hour',
    });
    const appUsageStats = await appUsageStatsFn({
      start: startTimestamp,
      end: endTimestamp,
      limit: 5,
    });
    const systemEvents = await systemEventsFn({
      start: startTimestamp,
      end: endTimestamp,
      limit: 50,
    });

    const summary = detectionStats.summary || {};
    const byType = summary.byType || {};
    const buckets = detectionStats.buckets || [];

    const phoneDuration = byType.phone_detection_end?.totalDurationSeconds || 0;
    const absenceDuration = byType.absence_detection_end?.totalDurationSeconds || 0;
    const alertCount = (byType.phone_alert?.count || 0) + (byType.absence_alert?.count || 0);

    const mostActiveBucket = buckets.reduce((acc, bucket) => {
      if (!acc || bucket.totalCount > acc.totalCount) {
        return bucket;
      }
      return acc;
    }, null);

    const systemSummary = systemEvents.summary || {};
    const topApps = (appUsageStats.items || []).slice(0, 5);
    const topChromeDomains = (appUsageStats.chromeDetails || []).slice(0, 5);

    const rangeText = `${formatDateLabel(rangeStartDate)} ${formatTimeKey(rangeStartDate)} 〜 ${formatDateLabel(now)} ${formatTimeKey(now)}`;

    const header = options.title || ':bar_chart: 監視ちゃんサマリー';
    const lines = [
      `${header} (${rangeText})`,
      `• 総イベント数: ${summary.totalCount || 0}`,
      `• アラート件数: ${alertCount}`,
      `• スマホ検知時間: ${formatDuration(phoneDuration)} (${byType.phone_detection_end?.count || 0} 件)`,
      `• 不在検知時間: ${formatDuration(absenceDuration)} (${byType.absence_detection_end?.count || 0} 件)`,
    ];

    if (mostActiveBucket) {
      lines.push(`• 最多発生タイミング: ${mostActiveBucket.bucket} (${mostActiveBucket.totalCount} 件)`);
    }

    if (topApps.length > 0) {
      const ranking = topApps
        .map((app, index) => `${index + 1}. ${app.appName} ${formatDuration(app.totalDurationSeconds)}`)
        .join(' / ');
      lines.push(`• 利用アプリ上位5: ${ranking}`);
    }

    if (topChromeDomains.length > 0) {
      const chromeRanking = topChromeDomains
        .map((item, index) => `${index + 1}. ${item.label} ${formatDuration(item.totalDurationSeconds)}`)
        .join(' / ');
      lines.push(`• Chromeドメイン上位5: ${chromeRanking}`);
    }

    const systemEventSummary = [
      { key: 'lock_screen', label: '🔒ロック' },
      { key: 'unlock_screen', label: '🔓解除' },
      { key: 'suspend', label: '🌙スリープ' },
      { key: 'resume', label: '💡復帰' },
      { key: 'shutdown', label: '⛔️終了' },
    ]
      .map((item) => ({ ...item, count: systemSummary[item.key] || 0 }))
      .filter((item) => item.count > 0);

    if (systemEventSummary.length > 0) {
      const summaryText = systemEventSummary
        .map((item) => `${item.label}${item.count}`)
        .join(' / ');
      lines.push(`• システムイベント: ${summaryText}`);
    }

    return {
      text: lines.join('\n'),
      detectionStats,
      appUsageStats,
      systemEvents,
      range: {
        start: startTimestamp,
        end: endTimestamp,
      },
    };
  }

  async function postToSlack(payload) {
    if (!settings.webhookUrl) {
      throw new Error('Slack Webhook URL が設定されていません');
    }

    if (typeof fetch !== 'function') {
      throw new Error('fetch API が利用できません (Node.js 18 以降が必要)');
    }

    const response = await fetch(settings.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: payload.text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Slack 送信に失敗しました: ${response.status} ${body}`);
    }
  }

  async function sendReport({ reason = 'manual', scheduledFor = null, scheduledTimestamp = null } = {}) {
    const now = new Date();
    const sentAt = now.getTime();

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const cumulativeReport = await buildReport({
      now,
      start: dayStart.getTime(),
      title: ':bar_chart: 監視ちゃんサマリー',
    });

    let deltaReport = null;
    const lastSuccess = await getLastSuccessfulSentAt();
    if (Number.isFinite(lastSuccess) && lastSuccess < sentAt) {
      const deltaStart = lastSuccess + 1;
      if (deltaStart < sentAt) {
        deltaReport = await buildReport({
          now,
          start: deltaStart,
          title: ':hourglass_flowing_sand: 直近送信以降',
        });
      }
    }

    const messageParts = [cumulativeReport.text];
    if (deltaReport) {
      messageParts.push(deltaReport.text);
    }
    const messageText = messageParts.join('\n\n');
    const payload = { text: messageText };

    try {
      await postToSlack(payload);
      await logResult({
        scheduledFor: scheduledTimestamp,
        sentAt,
        status: 'success',
        reason,
        message: messageText,
      });

      return {
        status: 'success',
        sentAt,
        scheduledFor,
        reason,
      };
    } catch (error) {
      await logResult({
        scheduledFor: scheduledTimestamp,
        sentAt,
        status: 'failure',
        reason,
        message: messageText,
        error: error.message,
      });
      throw error;
    }
  }

  async function getHistory(limit = 10) {
    const rows = await all(
      'SELECT id, scheduled_for, sent_at, status, reason, message, error FROM slack_report_logs ORDER BY sent_at DESC LIMIT ?',
      [Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100)]
    );
    return rows.map((row) => ({
      id: row.id,
      scheduledFor: row.scheduled_for,
      sentAt: row.sent_at,
      status: row.status,
      reason: row.reason,
      message: row.message,
      error: row.error,
    }));
  }

  async function updateSettings(partial = {}) {
    const next = {
      ...settings,
      ...partial,
    };
    next.scheduleTimes = normalizeScheduleTimes(next.scheduleTimes);
    next.enabled = Boolean(next.enabled);
    next.webhookUrl = typeof next.webhookUrl === 'string' ? next.webhookUrl.trim() : '';
    next.timezone = next.timezone || DEFAULT_SETTINGS.timezone;

    settings = next;
    configStore.set('slackReporter', settings);
    ensureScheduler();
    return settings;
  }

  async function getSettings() {
    return { ...settings };
  }

  function dispose() {
    clearScheduler();
  }

  // 初期スケジューラを起動
  ensureScheduler();

  return {
    getSettings,
    updateSettings,
    sendReport,
    getHistory,
    dispose,
    generateReportPreview: () => buildReport({ now: new Date() }),
  };
}

module.exports = {
  createSlackReporter,
};
