/**
 * Slack 定期レポート送信サービス。
 * - ユーザーデータ配下の設定を読み込み、指定時刻に統計を送信する。
 * - 手動送信、履歴取得、設定更新を IPC 経由で提供する。
 */
const { run, all } = require('../db');
const schedulesService = require('./schedules');
const {
  getDetectionStats,
  getAppUsageStats,
  getSystemEvents,
  getAbsenceOverrideSummary,
} = require('./statistics');

const DEFAULT_SETTINGS = {
  enabled: false,
  webhookUrl: '',
  scheduleTimes: ['13:00', '18:00'],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

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

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ms) {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const REPEAT_TYPE_ALIASES = Object.freeze({
  weekly: 'weekly',
  week: 'weekly',
  weekdays: 'weekdays',
  weekday: 'weekdays',
  平日: 'weekdays',
  daily: 'daily',
  everyday: 'daily',
  毎日: 'daily',
});

const PRESET_REPEAT_DAYS = Object.freeze({
  weekdays: [1, 2, 3, 4, 5],
  daily: [0, 1, 2, 3, 4, 5, 6],
});

function normalizeRepeatConfig(repeat) {
  if (!repeat || typeof repeat !== 'object') {
    return null;
  }

  const rawType = typeof repeat.type === 'string' ? repeat.type.trim().toLowerCase() : '';
  const mappedType = REPEAT_TYPE_ALIASES[rawType] || 'weekly';

  let candidateDays = Array.isArray(repeat.days) ? repeat.days : [];
  if (candidateDays.length === 0 && PRESET_REPEAT_DAYS[mappedType]) {
    candidateDays = PRESET_REPEAT_DAYS[mappedType];
  }

  const days = Array.from(
    new Set(
      candidateDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  if (days.length === 0) {
    return null;
  }

  return { type: 'weekly', days };
}

function formatRepeatLabel(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days) || repeat.days.length === 0) {
    return '';
  }

  const label = repeat.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day])
    .join('・');

  return `毎週 ${label}`;
}

function getScheduleTitle(schedule) {
  const rawTitle = typeof schedule?.title === 'string' ? schedule.title.trim() : '';
  return rawTitle || '予定';
}

async function fetchScheduleSummaries() {
  try {
    const items = await schedulesService.listSchedules({ withoutMeta: true });
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) => ({
        id: item.id,
        title: getScheduleTitle(item),
        date: item.date || null,
        time: typeof item.time === 'string' ? item.time : '',
        description: typeof item.description === 'string' ? item.description : '',
        repeat: normalizeRepeatConfig(item.repeat),
      }))
      .filter((item) => item.time);
  } catch (error) {
    console.warn('[SlackReporter] failed to load schedules:', error);
    return [];
  }
}

function getNextOccurrence(schedule, referenceDate = new Date()) {
  if (!schedule || !schedule.time) {
    return null;
  }

  const [hoursString, minutesString] = schedule.time.split(':');
  const hours = Number.parseInt(hoursString, 10);
  const minutes = Number.parseInt(minutesString, 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (!schedule.repeat) {
    if (!schedule.date) {
      return null;
    }
    const date = new Date(`${schedule.date}T${schedule.time}`);
    if (Number.isNaN(date.getTime()) || date < referenceDate) {
      return null;
    }
    return {
      dateTime: date,
      isRepeat: false,
    };
  }

  if (schedule.repeat.type === 'weekly' && Array.isArray(schedule.repeat.days) && schedule.repeat.days.length > 0) {
    const reference = new Date(referenceDate);
    reference.setSeconds(0, 0);

    const daysSet = new Set(schedule.repeat.days);

    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(reference);
      candidate.setDate(candidate.getDate() + offset);
      const candidateDay = candidate.getDay();

      if (!daysSet.has(candidateDay)) {
        continue;
      }

      candidate.setHours(hours, minutes, 0, 0);

      if (candidate >= reference) {
        return {
          dateTime: candidate,
          isRepeat: true,
        };
      }
    }
  }

  return null;
}

function formatRelativeMinutes(minutes) {
  if (!Number.isFinite(minutes)) {
    return '';
  }

  if (minutes <= 0) {
    return 'まもなく開始';
  }

  if (minutes < 60) {
    return `あと${minutes}分`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `あと${hours}時間`;
  }
  return `あと${hours}時間${mins}分`;
}

async function buildUpcomingScheduleLines(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const limit = Number.isInteger(options.limit) ? options.limit : 5;
  const rangeHours = Number.isFinite(options.rangeHours) ? options.rangeHours : 24;
  const rangeMs = rangeHours * 60 * 60 * 1000;

  const schedules = await fetchScheduleSummaries();
  const upcoming = [];

  schedules.forEach((schedule) => {
    const occurrence = getNextOccurrence(schedule, now);
    if (!occurrence) {
      return;
    }

    const diffMs = occurrence.dateTime - now;
    if (diffMs < 0 || diffMs > rangeMs) {
      return;
    }

    upcoming.push({ schedule, occurrence, diffMs });
  });

  upcoming.sort((a, b) => a.occurrence.dateTime - b.occurrence.dateTime);

  return upcoming.slice(0, limit).map(({ schedule, occurrence, diffMs }) => {
    const minutesLeft = Math.round(diffMs / 60000);
    const relative = formatRelativeMinutes(minutesLeft);
    const timeLabel = occurrence.dateTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const isToday = occurrence.dateTime.toDateString() === now.toDateString();
    const dayLabel = isToday
      ? '今日'
      : `${String(occurrence.dateTime.getMonth() + 1).padStart(2, '0')}/${String(occurrence.dateTime.getDate()).padStart(2, '0')}(${WEEKDAY_LABELS[occurrence.dateTime.getDay()]})`;
    const repeatLabel = schedule.repeat ? `（${formatRepeatLabel(schedule.repeat)}）` : '';
    const title = getScheduleTitle(schedule);
    return `${dayLabel} ${timeLabel} ${title}${repeatLabel} - ${relative}`;
  });
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

function createSlackReporter({ configStore, absenceOverrideManager }, dependencies = {}) {
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
  const absenceOverrideSummaryFn = dependencies.getAbsenceOverrideSummary || getAbsenceOverrideSummary;

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
    const absenceOverrideSummary = await absenceOverrideSummaryFn({
      start: startTimestamp,
      end: endTimestamp,
    });

    const summary = detectionStats.summary || {};
    const byType = summary.byType || {};
    const buckets = detectionStats.buckets || [];

    const phoneDuration = byType.phone_detection_end?.totalDurationSeconds || 0;
    const absenceDuration = byType.absence_detection_end?.totalDurationSeconds || 0;
    const alertCount = (byType.phone_alert?.count || 0) + (byType.absence_alert?.count || 0);
    const permittedAbsenceSeconds = absenceOverrideSummary.totalSeconds || 0;

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
      `<@U08ECCRRHGB>`,
      `${header} (${rangeText})`,
      `• 総イベント数: ${summary.totalCount || 0}`,
      `• アラート件数: ${alertCount}`,
      `• スマホ検知時間: ${formatDuration(phoneDuration)} (${byType.phone_detection_end?.count || 0} 件)`,
      `• 不在検知時間: ${formatDuration(absenceDuration)} (${byType.absence_detection_end?.count || 0} 件)`,
    ];

    if (permittedAbsenceSeconds > 0) {
      lines.push(
        `• 許可済み不在: ${formatDuration(permittedAbsenceSeconds)} ` +
          `(手動 ${formatDuration(absenceOverrideSummary.manualSeconds || 0)}, 自動 ${formatDuration(absenceOverrideSummary.autoSeconds || 0)})`
      );
    }

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

    // タスク統計情報を追加
    if (options.includeTasks !== false && dependencies.tasksService) {
      try {
        const taskStats = await dependencies.tasksService.getTaskStats({
          start: startTimestamp,
          end: endTimestamp,
        });
        const summary = taskStats?.summary || {};
        if (summary.total > 0) {
          lines.push(`• タスク統計:`);
          lines.push(`  総タスク数: ${summary.total}`);
          lines.push(`  完了率: ${summary.completionRate || 0}% (完了: ${summary.completedCount || 0}件)`);
          lines.push(`  ステータス内訳: 未着手${summary.byStatus?.todo || 0} / 進行中${summary.byStatus?.in_progress || 0} / 完了${summary.byStatus?.done || 0}`);
          if (summary.averageCompletionDays != null) {
            lines.push(`  平均完了日数: ${summary.averageCompletionDays}日`);
          }

          // 期限切れタスクと今日開始予定タスクの情報
          const todayTasks = await dependencies.tasksService.listTasks({
            activeAt: now,
          });
          const overdueTasks = todayTasks.filter((task) => {
            return task.status !== 'done' && task.endDate != null && task.endDate < now;
          });
          const startingTodayTasks = todayTasks.filter((task) => {
            return task.status !== 'done' && task.startDate != null && 
                   task.startDate >= startOfDay(now) && task.startDate < endOfDay(now);
          });

          if (overdueTasks.length > 0) {
            lines.push(`  期限切れタスク: ${overdueTasks.length}件`);
            overdueTasks.slice(0, 3).forEach((task) => {
              lines.push(`    - ${task.title}`);
            });
            if (overdueTasks.length > 3) {
              lines.push(`    ...他${overdueTasks.length - 3}件`);
            }
          }

          if (startingTodayTasks.length > 0) {
            lines.push(`  今日開始予定: ${startingTodayTasks.length}件`);
            startingTodayTasks.slice(0, 3).forEach((task) => {
              lines.push(`    - ${task.title}`);
            });
            if (startingTodayTasks.length > 3) {
              lines.push(`    ...他${startingTodayTasks.length - 3}件`);
            }
          }
        }
      } catch (error) {
        console.warn('[SlackReporter] タスク統計取得エラー:', error);
      }
    }

    if (options.includeSchedules !== false) {
      const scheduleLines = await buildUpcomingScheduleLines({ now, limit: 5, rangeHours: 24 });
      if (scheduleLines.length > 0) {
        lines.push('• 直近の予定:');
        scheduleLines.forEach((entry) => {
          lines.push(`  - ${entry}`);
        });
      } else {
        lines.push('• 直近の予定: なし');
      }
    }

    if (absenceOverrideManager) {
      try {
        const overrideState = await absenceOverrideManager.getState();
        if (overrideState.active && overrideState.current) {
          const remainingText = (() => {
            if (Number.isFinite(overrideState.remainingMs)) {
              return formatDuration(Math.floor((overrideState.remainingMs || 0) / 1000));
            }
            return '時間指定なし';
          })();
          lines.push(
            `• 現在許可中: ${overrideState.current.reason || '不在'} (開始 ${new Date(overrideState.current.startedAt).toLocaleString()}, 残り ${remainingText})`
          );
        }
      } catch (error) {
        console.error('[SlackReporter] 不在許可状態取得エラー:', error);
      }
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
          includeSchedules: false,
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
