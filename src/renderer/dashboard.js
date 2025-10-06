/**
 * 検知ダッシュボード UI 制御モジュール。
 * - IPC 経由で検知ログ / アプリ滞在時間を取得し、Chart.js とテーブルで可視化する。
 * - フィルター変更・自動更新・CSV エクスポートなどダッシュボード固有の振る舞いを管理。
 */

const modal = document.getElementById('dashboardModal');
const openBtn = document.getElementById('dashboardBtn');
const refreshBtn = document.getElementById('dashboardRefreshBtn');
const exportBtn = document.getElementById('dashboardExportCsvBtn');
const rangeSelect = document.getElementById('dashboardRange');
const customRangeContainer = document.getElementById('dashboardCustomRange');
const startInput = document.getElementById('dashboardStart');
const endInput = document.getElementById('dashboardEnd');
const granularitySelect = document.getElementById('dashboardGranularity');
const typeFilterSelect = document.getElementById('dashboardTypeFilter');
const kpiContainer = document.getElementById('dashboardKpis');
const logTableBody = document.querySelector('#dashboardLogTable tbody');
const appUsageTableBody = document.querySelector('#dashboardAppUsageTable tbody');
const chromeUsageTableBody = document.querySelector('#dashboardChromeUsageTable tbody');
const chartCanvas = document.getElementById('dashboardTrendChart');
const slackSummaryEl = document.getElementById('dashboardSlackSummary');
const slackHistoryListEl = document.getElementById('dashboardSlackHistory');
const slackSendNowBtn = document.getElementById('dashboardSlackSendNow');
const slackRefreshBtn = document.getElementById('dashboardSlackRefresh');
const upcomingSchedulesWrapper = document.getElementById('dashboardUpcomingSchedules');
const upcomingSchedulesListEl = document.getElementById('dashboardUpcomingSchedulesList');
const typingMonitorPauseBtn = document.getElementById('typingMonitorPauseBtn');
const typingStatsRefreshBtn = document.getElementById('typingStatsRefreshBtn');
const typingMonitorStatusEl = document.getElementById('typingMonitorStatus');
const typingTableBody = document.querySelector('#dashboardTypingTable tbody');
const systemEventsRefreshBtn = document.getElementById('systemEventsRefreshBtn');
const systemEventsTableBody = document.querySelector('#dashboardSystemEventsTable tbody');
const Chart = window.Chart;
let autoRefreshHandle = null;
let slackBusy = false;
let slackSummaryResetHandle = null;
let typingBusy = false;
let typingStatusResetHandle = null;
let lastRange = null;
let systemEventsBusy = false;

const DEFAULT_SLACK_SCHEDULE = ['13:00', '18:00'];
const UPCOMING_SCHEDULE_RANGE_HOURS = 24;
const UPCOMING_SCHEDULE_LIMIT = 5;
const SCHEDULE_WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const DATASET_GROUPS = {
  all: [
    { key: 'phone', label: 'スマホ関連', types: ['phone_detection_start', 'phone_detection_end', 'phone_alert'] },
    { key: 'absence', label: '不在関連', types: ['absence_detection_start', 'absence_detection_end', 'absence_alert'] },
  ],
  phone: [
    { key: 'phone', label: 'スマホ関連', types: ['phone_detection_start', 'phone_detection_end', 'phone_alert'] },
  ],
  absence: [
    { key: 'absence', label: '不在関連', types: ['absence_detection_start', 'absence_detection_end', 'absence_alert'] },
  ],
  alerts: [
    { key: 'alerts', label: 'アラート', types: ['phone_alert', 'absence_alert'] },
  ],
};

function getStoredSchedules() {
  try {
    const raw = localStorage.getItem('schedules');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[Dashboard] スケジュールの読み込みに失敗:', error);
    return [];
  }
}

function normalizeDashboardRepeat(repeat) {
  if (!repeat || typeof repeat !== 'object') {
    return null;
  }

  if (repeat.type === 'weekly' && Array.isArray(repeat.days)) {
    const days = Array.from(
      new Set(
        repeat.days
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      )
    ).sort((a, b) => a - b);

    if (days.length === 0) {
      return null;
    }

    return { type: 'weekly', days };
  }

  return null;
}

function formatScheduleRepeat(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days) || repeat.days.length === 0) {
    return '';
  }

  const label = repeat.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => SCHEDULE_WEEKDAY_LABELS[day])
    .join('・');

  return `毎週 ${label}`;
}

function getScheduleTitle(schedule) {
  const rawTitle = typeof schedule?.title === 'string' ? schedule.title.trim() : '';
  return rawTitle || '予定';
}

function getDashboardNextOccurrence(schedule, referenceDate = new Date()) {
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

function formatUpcomingRelative(minutes) {
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

function computeUpcomingSchedules() {
  const now = new Date();
  const rangeMs = UPCOMING_SCHEDULE_RANGE_HOURS * 60 * 60 * 1000;

  const schedules = getStoredSchedules()
    .map((item) => ({
      id: item.id,
      title: getScheduleTitle(item),
      date: item.date || null,
      time: typeof item.time === 'string' ? item.time : '',
      description: typeof item.description === 'string' ? item.description : '',
      repeat: normalizeDashboardRepeat(item.repeat),
    }))
    .filter((schedule) => schedule.time);

  const upcoming = [];

  schedules.forEach((schedule) => {
    const occurrence = getDashboardNextOccurrence(schedule, now);
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

  return upcoming.slice(0, UPCOMING_SCHEDULE_LIMIT).map(({ schedule, occurrence, diffMs }) => {
    const minutesLeft = Math.round(diffMs / 60000);
    const timeLabel = occurrence.dateTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const isToday = occurrence.dateTime.toDateString() === now.toDateString();
    const dayLabel = isToday
      ? '今日'
      : `${String(occurrence.dateTime.getMonth() + 1).padStart(2, '0')}/${String(occurrence.dateTime.getDate()).padStart(2, '0')}(${SCHEDULE_WEEKDAY_LABELS[occurrence.dateTime.getDay()]})`;
    const repeatLabel = schedule.repeat ? formatScheduleRepeat(schedule.repeat) : '';

    return {
      id: schedule.id,
      dayLabel,
      timeLabel,
      title: getScheduleTitle(schedule),
      repeatLabel,
      relative: formatUpcomingRelative(minutesLeft),
    };
  });
}

function renderUpcomingSchedules(list) {
  if (!upcomingSchedulesListEl) {
    return;
  }

  if (!list || list.length === 0) {
    upcomingSchedulesListEl.innerHTML = '<li class="empty">直近24時間の予定はありません</li>';
    return;
  }

  upcomingSchedulesListEl.innerHTML = list
    .map((item) => {
      const meta = [];
      if (item.repeatLabel) {
        meta.push(`<span class="repeat">${escapeHtml(item.repeatLabel)}</span>`);
      }
      if (item.relative) {
        meta.push(`<span class="relative">${escapeHtml(item.relative)}</span>`);
      }

      const metaLine = meta.length ? `<div class="upcoming-meta">${meta.join('')}</div>` : '';

      return `
        <li>
          <div class="upcoming-line">
            <span class="time">${escapeHtml(`${item.dayLabel} ${item.timeLabel}`)}</span>
            <span class="title">${escapeHtml(item.title)}</span>
          </div>
          ${metaLine}
        </li>
      `;
    })
    .join('');
}

function refreshUpcomingSchedules() {
  const upcoming = computeUpcomingSchedules();
  state.upcomingSchedules = upcoming;
  renderUpcomingSchedules(upcoming);

  if (upcomingSchedulesWrapper) {
    upcomingSchedulesWrapper.style.display = 'block';
  }
}

const state = {
  stats: null,
  recentLogs: [],
  chart: null,
  appUsage: [],
  appUsageTotalDuration: 0,
  chromeUsage: [],
  slackSettings: null,
  slackHistory: [],
  upcomingSchedules: [],
  typingStats: null,
  typingStatus: null,
  systemEvents: [],
};

function openModal() {
  if (!modal) return;
  modal.classList.add('open');
  document.body.classList.add('dashboard-modal-open');
  loadDashboardData();
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.classList.remove('dashboard-modal-open');
}

document.querySelectorAll('#dashboardModal .close-btn').forEach((btn) => {
  btn.addEventListener('click', closeModal);
});

document.querySelectorAll('#dashboardModal .modal-backdrop').forEach((backdrop) => {
  backdrop.addEventListener('click', closeModal);
});

if (openBtn) {
  openBtn.addEventListener('click', () => {
    if (modal?.classList.contains('open')) {
      closeModal();
    } else {
      openModal();
    }
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => loadDashboardData());
}

if (exportBtn) {
  exportBtn.addEventListener('click', exportCsv);
}

if (slackSendNowBtn && window.electronAPI?.slackReporterSendNow) {
  slackSendNowBtn.addEventListener('click', handleDashboardSlackSendNow);
}

if (slackRefreshBtn && window.electronAPI?.slackReporterHistory) {
  slackRefreshBtn.addEventListener('click', () => {
    refreshSlackSection({ showLoadingIndicator: true });
  });
}

if (typingMonitorPauseBtn && window.electronAPI?.typingMonitorSetPaused) {
  typingMonitorPauseBtn.addEventListener('click', handleTypingPauseToggle);
}

if (typingStatsRefreshBtn && window.electronAPI?.typingActivityStats) {
  typingStatsRefreshBtn.addEventListener('click', () => {
    refreshTypingSection({
      start: lastRange?.start,
      end: lastRange?.end,
      showLoading: true,
    });
  });
}

if (systemEventsRefreshBtn && window.electronAPI?.systemEventsRecent) {
  systemEventsRefreshBtn.addEventListener('click', () => {
    refreshSystemEvents({
      showLoading: true,
      start: lastRange?.start,
      end: lastRange?.end,
    });
  });
}

if (rangeSelect) {
  rangeSelect.addEventListener('change', () => {
    const isCustom = rangeSelect.value === 'custom';
    customRangeContainer.style.display = isCustom ? 'flex' : 'none';
    if (!isCustom) {
      loadDashboardData();
    }
  });
}

if (granularitySelect) {
  granularitySelect.addEventListener('change', () => loadDashboardData());
}

if (typeFilterSelect) {
  typeFilterSelect.addEventListener('change', () => {
    renderChart();
    renderLogTable();
  });
}

if (startInput && endInput) {
  [startInput, endInput].forEach((input) => {
    input.addEventListener('change', () => {
      if (rangeSelect.value === 'custom') {
        if (startInput.value && endInput.value) {
          loadDashboardData();
        }
      }
    });
  });
}

function loadDashboardData() {
  const { start, end } = computeRange();
  const groupBy = granularitySelect?.value === 'hour' ? 'hour' : 'day';
  lastRange = { start, end };

  refreshUpcomingSchedules();

  Promise.all([
    window.electronAPI?.detectionLogStats?.({ start, end, groupBy }) ?? Promise.resolve({ success: false }),
    window.electronAPI?.detectionLogRecent?.({ limit: 100 }) ?? Promise.resolve({ success: false }),
    window.electronAPI?.appUsageStats?.({ start, end, limit: 10 }) ?? Promise.resolve({ success: false }),
  ])
    .then(([statsRes, recentRes, appUsageRes]) => {
      if (statsRes?.success) {
        state.stats = statsRes.data;
        renderKpis();
        renderChart();
      }

      if (recentRes?.success) {
        state.recentLogs = recentRes.items || [];
        renderLogTable();
      }

      if (appUsageRes?.success) {
        state.appUsage = appUsageRes.data?.items || [];
        state.appUsageTotalDuration = appUsageRes.data?.totalDurationSeconds || 0;
        state.chromeUsage = appUsageRes.data?.chromeDetails || [];
      } else {
        state.appUsage = [];
        state.appUsageTotalDuration = 0;
        state.chromeUsage = [];
      }

      renderAppUsageTable();
      renderChromeUsageTable();
      renderKpis();
    })
    .then(() => {
      if (window.electronAPI?.slackReporterGetSettings) {
        return refreshSlackSection({ showLoadingIndicator: false });
      }
      return null;
    })
    .then(() => {
      if (window.electronAPI?.typingActivityStats) {
        return refreshTypingSection({ start, end, showLoading: false });
      }
      return null;
    })
    .then(() => {
      if (window.electronAPI?.systemEventsRecent) {
        return refreshSystemEvents({ start, end, showLoading: false });
      }
      return null;
    })
    .catch((error) => {
      console.error('[Dashboard] データ取得エラー:', error);
    });
}

function computeRange() {
  const now = Date.now();
  let start = now - 7 * 24 * 60 * 60 * 1000;
  let end = now;

  switch (rangeSelect?.value) {
    case '24h':
      start = now - 24 * 60 * 60 * 1000;
      break;
    case '30d':
      start = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case 'custom':
      if (startInput.value) {
        start = new Date(startInput.value).getTime();
      }
      if (endInput.value) {
        end = new Date(endInput.value).getTime();
      }
      break;
    case '7d':
    default:
      start = now - 7 * 24 * 60 * 60 * 1000;
      break;
  }

  // デフォルトで Custom フィールドを埋める
  if (!startInput.value || !endInput.value) {
    const startLocal = toLocalDateTimeLocalString(start);
    const endLocal = toLocalDateTimeLocalString(end);
    startInput.value = startLocal;
    endInput.value = endLocal;
  }

  return { start, end };
}

function renderKpis() {
  if (!kpiContainer || !state.stats) return;

  const summary = state.stats.summary || {};
  const byType = summary.byType || {};

  const phoneDuration = byType.phone_detection_end?.totalDurationSeconds || 0;
  const absenceDuration = byType.absence_detection_end?.totalDurationSeconds || 0;
  const alertCount = (byType.phone_alert?.count || 0) + (byType.absence_alert?.count || 0);

  const mostActiveBucket = (state.stats.buckets || []).reduce(
    (acc, bucket) => {
      if (!acc || bucket.totalCount > acc.totalCount) {
        return bucket;
      }
      return acc;
    },
    null
  );

  const topApp = state.appUsage?.[0];

  const cards = [
    {
      label: '総イベント数',
      value: summary.totalCount || 0,
      subtext: formatRange(state.stats.range),
    },
    {
      label: 'スマホ検知時間',
      value: formatDuration(phoneDuration),
      subtext: `${byType.phone_detection_end?.count || 0} 件のセッション`,
    },
    {
      label: '不在検知時間',
      value: formatDuration(absenceDuration),
      subtext: `${byType.absence_detection_end?.count || 0} 件のセッション`,
    },
    {
      label: 'アラート件数',
      value: alertCount,
      subtext: 'スマホ/不在アラート合計',
    },
    mostActiveBucket
      ? {
          label: '最多発生タイミング',
          value: `${mostActiveBucket.bucket}`,
          subtext: `${mostActiveBucket.totalCount} 件`,
      }
      : null,
    state.appUsageTotalDuration > 0 && topApp
      ? {
          label: '最も使用したアプリ',
          value: topApp.appName,
          subtext: `${formatDuration(topApp.totalDurationSeconds)} / ${topApp.sessions} セッション`,
        }
      : null,
    state.typingStats?.summary
      ? {
          label: '総キー入力数',
          value: state.typingStats.summary.totalKeyPresses || 0,
          subtext: `平均 ${state.typingStats.summary.averageKeyPressesPerMinute || 0} 回/分`,
        }
      : null,
    state.typingStats?.summary
      ? {
          label: '最長連続入力',
          value: formatDuration(state.typingStats.summary.longestStreakSeconds || 0),
          subtext: '休止なしで入力した最長時間',
        }
      : null,
  ].filter(Boolean);

  kpiContainer.innerHTML = cards
    .map(
      (card) => `
        <div class="dashboard-kpi-card">
          <div class="kpi-label">${card.label}</div>
          <div class="kpi-value">${card.value}</div>
          <div class="kpi-subtext">${card.subtext}</div>
        </div>
      `
    )
    .join('');
}

function renderChart() {
  if (!chartCanvas || !Chart) return;

  const groupKey = typeFilterSelect?.value || 'all';
  if (groupKey === 'typing') {
    renderTypingChart();
    return;
  }

  if (!state.stats) {
    return;
  }

  const datasetGroup = DATASET_GROUPS[groupKey] || DATASET_GROUPS.all;

  const labels = (state.stats.buckets || []).map((bucket) => bucket.bucket);

  const datasets = datasetGroup.map((group, index) => {
    const data = (state.stats.buckets || []).map((bucket) => {
      const counts = bucket.counts || {};
      return group.types.reduce((sum, type) => sum + (counts[type] || 0), 0);
    });

    const colors = ['#4dabf7', '#94d82d', '#fcc419'];

    return {
      label: group.label,
      data,
      fill: false,
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length],
      tension: 0.2,
    };
  });

  if (!state.chart) {
    state.chart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: 'rgba(255, 255, 255, 0.85)',
              font: {
                size: 12,
                weight: '600',
              },
              padding: 15,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: 'rgba(20, 20, 25, 0.95)',
            titleColor: 'rgba(255, 255, 255, 0.95)',
            bodyColor: 'rgba(255, 255, 255, 0.85)',
            borderColor: 'rgba(102, 126, 234, 0.5)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleFont: {
              size: 13,
              weight: '700',
            },
            bodyFont: {
              size: 12,
            },
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 11,
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
            ticks: {
              precision: 0,
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 11,
              },
            },
          },
        },
      },
    });
  } else {
    state.chart.data.labels = labels;
    state.chart.data.datasets = datasets;
    state.chart.update();
  }
}

function renderTypingChart() {
  if (!chartCanvas || !Chart) return;

  const typing = state.typingStats;
  if (!typing || !typing.buckets) {
    if (state.chart) {
      state.chart.data.labels = [];
      state.chart.data.datasets = [];
      state.chart.update();
    }
    return;
  }

  const labels = typing.buckets.map((bucket) => formatTypingBucketLabel(bucket));
  const data = typing.buckets.map((bucket) => bucket.keyPresses || 0);

  const dataset = {
    label: 'キー入力数/分',
    data,
    fill: false,
    borderColor: '#ff922b',
    backgroundColor: '#ff922b',
    tension: 0.2,
  };

  if (!state.chart) {
    state.chart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [dataset],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 11,
              },
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              color: 'rgba(255, 255, 255, 0.7)',
              font: {
                size: 11,
              },
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
          },
        },
      },
    });
  } else {
    state.chart.data.labels = labels;
    state.chart.data.datasets = [dataset];
    state.chart.update();
  }
}

function renderLogTable() {
  if (!logTableBody) return;

  const filter = typeFilterSelect?.value || 'all';

  if (filter === 'typing') {
    logTableBody.innerHTML = `
      <tr class="empty">
        <td colspan="4">タイピングログは「タイピングアクティビティ」セクションを参照してください。</td>
      </tr>
    `;
    return;
  }

  const filtered = state.recentLogs.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'alerts') return item.type && item.type.includes('alert');
    if (filter === 'phone') return item.type && item.type.includes('phone');
    if (filter === 'absence') return item.type && item.type.includes('absence');
    return true;
  });

  if (filtered.length === 0) {
    logTableBody.innerHTML = `
      <tr class="empty">
        <td colspan="4">ログがありません</td>
      </tr>
    `;
    return;
  }

  const sorted = filtered.slice().sort((a, b) => {
    const aTs = Number.isFinite(a.detectedAt) ? a.detectedAt : 0;
    const bTs = Number.isFinite(b.detectedAt) ? b.detectedAt : 0;
    return bTs - aTs;
  });

  logTableBody.innerHTML = sorted
    .map((item) => {
      const time = formatDateTime(item.detectedAt);
      const duration = item.durationSeconds != null ? formatDuration(item.durationSeconds) : '-';
      const detail = item.meta ? escapeHtml(JSON.stringify(item.meta)) : '';
      return `
        <tr>
          <td>${time}</td>
          <td>${formatTypeLabel(item.type)}</td>
          <td>${duration}</td>
          <td>${detail}</td>
        </tr>
      `;
    })
    .join('');
}

function renderAppUsageTable() {
  if (!appUsageTableBody) return;

  if (!state.appUsage || state.appUsage.length === 0) {
    appUsageTableBody.innerHTML = `
      <tr class="empty">
        <td colspan="3">データがありません</td>
      </tr>
    `;
    return;
  }

  appUsageTableBody.innerHTML = state.appUsage
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.appName)}</td>
          <td>${formatDuration(item.totalDurationSeconds)}</td>
          <td>${item.sessions ?? 0}</td>
        </tr>
      `;
    })
    .join('');
}

function renderChromeUsageTable() {
  if (!chromeUsageTableBody) {
    return;
  }

  if (!state.chromeUsage || state.chromeUsage.length === 0) {
    chromeUsageTableBody.innerHTML = `
      <tr class="empty">
        <td colspan="3">Chrome のデータがありません</td>
      </tr>
    `;
    return;
  }

  chromeUsageTableBody.innerHTML = state.chromeUsage
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.label || '(未記録)')}</td>
          <td>${formatDuration(item.totalDurationSeconds)}</td>
          <td>${item.sessions ?? 0}</td>
        </tr>
      `;
    })
    .join('');
}

function setSlackBusy(isBusy) {
  slackBusy = isBusy;
  const shouldDisable = isBusy || !window.electronAPI?.slackReporterGetSettings;
  if (slackSendNowBtn) {
    slackSendNowBtn.disabled = shouldDisable;
  }
  if (slackRefreshBtn) {
    slackRefreshBtn.disabled = shouldDisable;
  }
}

async function refreshSlackSection({ showLoadingIndicator = false } = {}) {
  if (!window.electronAPI?.slackReporterGetSettings) {
    renderSlackSection();
    return Promise.resolve(null);
  }

  try {
    if (showLoadingIndicator) {
      setSlackBusy(true);
      showSlackSummaryMessage('Slack 情報を更新中...', 'info');
    }

    const [settingsRes, historyRes] = await Promise.all([
      window.electronAPI.slackReporterGetSettings(),
      window.electronAPI.slackReporterHistory({ limit: 5 }),
    ]);

    state.slackSettings = settingsRes?.success ? settingsRes.settings : null;
    state.slackHistory = historyRes?.success && Array.isArray(historyRes.history) ? historyRes.history : [];
    renderSlackSection();
  } catch (error) {
    console.error('[Dashboard] Slack 情報更新エラー:', error);
    showSlackSummaryMessage(error.message || 'Slack 情報の取得に失敗しました', 'error', { temporary: true });
  } finally {
    if (showLoadingIndicator) {
      setSlackBusy(false);
    }
  }
}

async function handleDashboardSlackSendNow() {
  if (slackBusy) {
    return;
  }
  if (!window.electronAPI?.slackReporterSendNow) {
    showSlackSummaryMessage('Slack 送信機能が利用できません', 'error', { temporary: true });
    return;
  }

  try {
    setSlackBusy(true);
    showSlackSummaryMessage('Slack に送信中...', 'info');
    const response = await window.electronAPI.slackReporterSendNow();
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 送信に失敗しました');
    }
    await refreshSlackSection({ showLoadingIndicator: false });
    showSlackSummaryMessage('Slack に送信しました ✅', 'success', { temporary: true });
  } catch (error) {
    console.error('[Dashboard] Slack 手動送信エラー:', error);
    showSlackSummaryMessage(error.message || 'Slack 手動送信に失敗しました', 'error', { temporary: true });
  } finally {
    setSlackBusy(false);
  }
}

function renderSlackSection() {
  if (!slackSummaryEl || !slackHistoryListEl) {
    return;
  }

  if (!window.electronAPI?.slackReporterGetSettings) {
    slackSummaryEl.textContent = 'Slack レポート機能は利用できません。';
    slackSummaryEl.className = 'slack-summary error';
    slackHistoryListEl.innerHTML = '<li class="empty">機能が無効です</li>';
    if (slackSendNowBtn) slackSendNowBtn.disabled = true;
    if (slackRefreshBtn) slackRefreshBtn.disabled = true;
    return;
  }

  if (!state.slackSettings) {
    slackSummaryEl.textContent = 'Slack レポート設定を読み込み中...';
    slackSummaryEl.className = 'slack-summary';
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  if (!state.slackSettings.enabled || !state.slackSettings.webhookUrl) {
    slackSummaryEl.textContent = 'Slack レポートは無効です。設定から有効化してください。';
    slackSummaryEl.className = 'slack-summary';
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  if (!state.slackHistory?.length) {
    const scheduleText = state.slackSettings.scheduleTimes?.length
      ? state.slackSettings.scheduleTimes.join(', ')
      : DEFAULT_SLACK_SCHEDULE.join(', ');
    slackSummaryEl.textContent = `Slack レポートは有効です。送信予定: ${scheduleText}`;
    slackSummaryEl.className = 'slack-summary';
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がまだありません</li>';
    return;
  }

  const latest = state.slackHistory[0];
  const icon = latest.status === 'success' ? '✅' : '⚠️';
  const statusLabel = latest.status === 'success' ? '成功' : '失敗';
  const summary = `${icon} 最終送信: ${formatDateTime(latest.sentAt)} (${statusLabel}${latest.reason ? ` / ${latest.reason}` : ''})`;
  slackSummaryEl.textContent = latest.error ? `${summary} - ${latest.error}` : summary;
  slackSummaryEl.className = `slack-summary ${latest.status === 'success' ? 'success' : 'error'}`;

  renderSlackHistory();
}

function renderSlackHistory() {
  if (!slackHistoryListEl) {
    return;
  }

  if (!state.slackHistory || state.slackHistory.length === 0) {
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  slackHistoryListEl.innerHTML = state.slackHistory
    .map((entry) => {
      const icon = entry.status === 'success' ? '✅' : '⚠️';
      const reason = entry.reason === 'schedule' ? '定期' : '手動';
      const statusClass = entry.status === 'success' ? 'success' : 'failure';
      const errorLine = entry.error ? `<div class="slack-history-error">${escapeHtml(entry.error)}</div>` : '';
      return `
        <li class="slack-history-item ${statusClass}">
          <div class="slack-history-header">
            <span class="slack-history-icon">${icon}</span>
            <span class="slack-history-time">${formatDateTime(entry.sentAt)}</span>
            <span class="slack-history-status">${entry.status === 'success' ? '成功' : '失敗'}</span>
            <span class="slack-history-reason">${reason}</span>
          </div>
          ${errorLine}
        </li>
      `;
    })
    .join('');
}

function showSlackSummaryMessage(message, type = 'info', options = {}) {
  if (!slackSummaryEl) {
    return;
  }

  if (slackMessageResetHandle) {
    clearTimeout(slackMessageResetHandle);
    slackMessageResetHandle = null;
  }

  slackSummaryEl.textContent = message;
  slackSummaryEl.className = `slack-summary ${type}`;

  if (options.temporary) {
    slackMessageResetHandle = setTimeout(() => {
      slackMessageResetHandle = null;
      renderSlackSection();
    }, options.duration ?? 3000);
  }
}

function setTypingBusy(isBusy) {
  typingBusy = isBusy;
  updateTypingControlsDisabled();
}

function updateTypingControlsDisabled() {
  const status = state.typingStatus;
  const available = Boolean(window.electronAPI?.typingMonitorStatus) && status?.available !== false;
  if (typingMonitorPauseBtn) {
    typingMonitorPauseBtn.disabled = typingBusy || !available || !status?.enabled;
  }
  if (typingStatsRefreshBtn) {
    typingStatsRefreshBtn.disabled = typingBusy || !available;
  }
}

async function refreshTypingSection({ start, end, showLoading = false } = {}) {
  if (!window.electronAPI?.typingActivityStats) {
    renderTypingStatus();
    renderTypingTable();
    return null;
  }

  const rangeStart = Number.isFinite(start) ? start : lastRange?.start;
  const rangeEnd = Number.isFinite(end) ? end : lastRange?.end;

  try {
    if (showLoading) {
      setTypingBusy(true);
      showTypingStatusMessage('タイピング統計を更新中...', 'info');
    }

    const [statusRes, statsRes] = await Promise.all([
      window.electronAPI.typingMonitorStatus(),
      window.electronAPI.typingActivityStats({ start: rangeStart, end: rangeEnd }),
    ]);

    if (statusRes?.success) {
      state.typingStatus = statusRes.status;
    }

    if (statsRes?.success) {
      state.typingStats = statsRes.data;
    } else if (!statsRes?.success) {
      state.typingStats = null;
    }

    renderTypingStatus();
    renderTypingTable();
    renderKpis();

    if (typeFilterSelect?.value === 'typing') {
      renderTypingChart();
    }
  } catch (error) {
    console.error('[Dashboard] タイピング統計エラー:', error);
    showTypingStatusMessage(error.message || 'タイピング統計の取得に失敗しました', 'error', { temporary: true });
  } finally {
    if (showLoading) {
      setTypingBusy(false);
    } else {
      updateTypingControlsDisabled();
    }
  }
}

function renderTypingStatus() {
  if (!typingMonitorStatusEl) {
    return;
  }

  if (!window.electronAPI?.typingMonitorStatus) {
    typingMonitorStatusEl.textContent = 'タイピング監視機能は利用できません。';
    typingMonitorStatusEl.className = 'typing-status error';
    updateTypingControlsDisabled();
    return;
  }

  const status = state.typingStatus;
  typingMonitorStatusEl.className = 'typing-status';

  if (!status) {
    typingMonitorStatusEl.textContent = 'タイピング監視の状態を取得中...';
    updateTypingControlsDisabled();
    return;
  }

  if (!status.available) {
    typingMonitorStatusEl.textContent = 'タイピング監視は利用できません（uiohook-napi が見つかりません）';
    typingMonitorStatusEl.classList.add('error');
  } else if (!status.enabled) {
    typingMonitorStatusEl.textContent = 'タイピング監視は無効です。';
  } else if (status.paused) {
    typingMonitorStatusEl.textContent = 'タイピング監視は休止中です。';
  } else if (!status.running) {
    typingMonitorStatusEl.textContent = 'タイピング監視は待機状態です。';
  } else {
    const lastKey = status.lastKeyAt ? formatDateTime(status.lastKeyAt) : '記録なし';
    const memoryMb = status.resourceUsage?.memory?.rss
      ? Math.round(status.resourceUsage.memory.rss / (1024 * 1024))
      : null;
    let message = `タイピング監視は稼働中（最終入力: ${lastKey}`;
    if (memoryMb != null) {
      message += ` / メモリ ${memoryMb}MB`;
    }
    message += '）';
    typingMonitorStatusEl.textContent = message;
    typingMonitorStatusEl.classList.add('active');
  }

  if (typingMonitorPauseBtn) {
    typingMonitorPauseBtn.textContent = status?.paused ? '再開' : '休止';
  }

  updateTypingControlsDisabled();
}

function renderTypingTable() {
  if (!typingTableBody) {
    return;
  }

  const buckets = state.typingStats?.buckets || [];
  if (buckets.length === 0) {
    typingTableBody.innerHTML = '<tr class="empty"><td colspan="4">データがありません</td></tr>';
    return;
  }

  const latestBuckets = buckets.slice(-120);
  const sortedBuckets = latestBuckets.slice().sort((a, b) => {
    const aTs = Number.isFinite(a.bucketStart) ? a.bucketStart : 0;
    const bTs = Number.isFinite(b.bucketStart) ? b.bucketStart : 0;
    return bTs - aTs;
  });

  typingTableBody.innerHTML = sortedBuckets
    .map((bucket) => {
      const startLabel = formatDateTime(bucket.bucketStart);
      const endLabel = formatDateTime(bucket.bucketEnd);
      const duration = formatDuration(bucket.longestStreakSeconds || 0);
      return `
        <tr>
          <td>${startLabel}</td>
          <td>${endLabel}</td>
          <td>${bucket.keyPresses ?? 0}</td>
          <td>${duration}</td>
        </tr>
      `;
    })
    .join('');
}

async function handleTypingPauseToggle() {
  if (typingBusy) {
    return;
  }
  if (!window.electronAPI?.typingMonitorSetPaused) {
    showTypingStatusMessage('休止制御が利用できません', 'error', { temporary: true });
    return;
  }
  if (!state.typingStatus) {
    return;
  }

  const nextPaused = !state.typingStatus.paused;

  try {
    setTypingBusy(true);
    showTypingStatusMessage(nextPaused ? 'タイピング監視を休止しています...' : 'タイピング監視を再開しています...', 'info');
    const response = await window.electronAPI.typingMonitorSetPaused(nextPaused);
    if (!response?.success) {
      throw new Error(response?.error || '休止切替に失敗しました');
    }
    state.typingStatus = response.status;
    await refreshTypingSection({ start: lastRange?.start, end: lastRange?.end, showLoading: false });
    showTypingStatusMessage(nextPaused ? 'タイピング監視を休止しました' : 'タイピング監視を再開しました', 'success', { temporary: true });
  } catch (error) {
    console.error('[Dashboard] タイピング休止切替エラー:', error);
    showTypingStatusMessage(error.message || 'タイピング監視の休止に失敗しました', 'error', { temporary: true });
  } finally {
    setTypingBusy(false);
  }
}

function showTypingStatusMessage(message, type = 'info', options = {}) {
  if (!typingMonitorStatusEl) {
    return;
  }

  if (typingStatusResetHandle) {
    clearTimeout(typingStatusResetHandle);
    typingStatusResetHandle = null;
  }

  let className = 'typing-status';
  if (type === 'error') {
    className += ' error';
  } else if (type === 'success') {
    className += ' active';
  }
  typingMonitorStatusEl.className = className;
  typingMonitorStatusEl.textContent = message;

  if (options.temporary) {
    typingStatusResetHandle = setTimeout(() => {
      typingStatusResetHandle = null;
      renderTypingStatus();
    }, options.duration ?? 3000);
  }
}

function setSystemEventsBusy(isBusy) {
  systemEventsBusy = isBusy;
  if (systemEventsRefreshBtn) {
    systemEventsRefreshBtn.disabled = isBusy;
  }
}

async function refreshSystemEvents({ start, end, showLoading = false } = {}) {
  if (!window.electronAPI?.systemEventsRecent) {
    renderSystemEventsTable('システムイベント機能は利用できません');
    return null;
  }

  const rangeStart = Number.isFinite(start) ? start : lastRange?.start;
  const rangeEnd = Number.isFinite(end) ? end : lastRange?.end;

  try {
    if (showLoading) {
      setSystemEventsBusy(true);
    }

    const response = await window.electronAPI.systemEventsRecent({
      start: rangeStart,
      end: rangeEnd,
      limit: 100,
    });

    if (response?.success) {
      state.systemEvents = response.data?.events || [];
    } else {
      state.systemEvents = [];
    }

    renderSystemEventsTable();
  } catch (error) {
    console.error('[Dashboard] システムイベント取得エラー:', error);
    state.systemEvents = [];
    renderSystemEventsTable('システムイベントの取得に失敗しました');
  } finally {
    if (showLoading) {
      setSystemEventsBusy(false);
    }
  }
}

function renderSystemEventsTable(errorMessage = null) {
  if (!systemEventsTableBody) {
    return;
  }

  if (errorMessage) {
    systemEventsTableBody.innerHTML = `<tr class="empty"><td colspan="3">${escapeHtml(errorMessage)}</td></tr>`;
    return;
  }

  const events = state.systemEvents || [];
  if (events.length === 0) {
    systemEventsTableBody.innerHTML = '<tr class="empty"><td colspan="3">イベントはありません</td></tr>';
    return;
  }

  systemEventsTableBody.innerHTML = events
    .map((event) => {
      const when = formatDateTime(event.occurredAt);
      const label = formatSystemEventLabel(event.eventType);
      const meta = event.meta ? escapeHtml(JSON.stringify(event.meta)) : '-';
      return `
        <tr>
          <td>${when}</td>
          <td>${escapeHtml(label)}</td>
          <td>${meta}</td>
        </tr>
      `;
    })
    .join('');
}

function exportCsv() {
  if (!state.recentLogs?.length) return;

  const headers = ['detected_at', 'type', 'duration_seconds', 'meta'];
  const rows = state.recentLogs.map((item) => [
    formatDateTime(item.detectedAt),
    item.type,
    item.durationSeconds ?? '',
    item.meta ? JSON.stringify(item.meta) : '',
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `detection_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0秒';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}時間`);
  if (m > 0) parts.push(`${m}分`);
  if (s > 0 && h === 0) parts.push(`${s}秒`);
  return parts.join('') || `${s}秒`;
}

function formatTypingBucketLabel(bucket) {
  const start = bucket?.bucketStart ?? bucket?.start;
  if (!start) {
    return '-';
  }
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const day = date.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

function formatSystemEventLabel(eventType) {
  switch (eventType) {
    case 'lock_screen':
      return '画面ロック';
    case 'unlock_screen':
      return '画面解除';
    case 'suspend':
      return 'スリープ開始';
    case 'resume':
      return 'スリープ解除';
    case 'shutdown':
      return 'システム終了';
    default:
      return eventType || '-';
  }
}

function formatRange(range) {
  if (!range) return '';
  return `${formatDateTime(range.start)} 〜 ${formatDateTime(range.end)}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP')}`;
}

function formatTypeLabel(type) {
  switch (type) {
    case 'phone_detection_start':
      return 'スマホ検知開始';
    case 'phone_detection_end':
      return 'スマホ検知終了';
    case 'phone_alert':
      return 'スマホアラート';
    case 'absence_detection_start':
      return '不在検知開始';
    case 'absence_detection_end':
      return '不在検知終了';
    case 'absence_alert':
      return '不在アラート';
    default:
      return type || '-';
  }
}

function toLocalDateTimeLocalString(timestamp) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(value) {
  if (value == null) return '';
  const needsQuotes = /[",\n]/.test(value);
  let escaped = value.replace(/"/g, '""');
  if (needsQuotes) {
    escaped = `"${escaped}"`;
  }
  return escaped;
}

// 初期化
if (openBtn) {
  // 自動初期表示は行わず、ユーザーが開いたときにロード
}

refreshUpcomingSchedules();
renderSlackSection();
renderTypingStatus();

window.addEventListener('schedules-updated', () => {
  refreshUpcomingSchedules();
});

window.addEventListener('typing-monitor-status-updated', () => {
  refreshTypingSection({ start: lastRange?.start, end: lastRange?.end, showLoading: false });
});

window.addEventListener('detection-log-recorded', () => {
  if (!modal?.classList.contains('open')) return;
  if (autoRefreshHandle) {
    clearTimeout(autoRefreshHandle);
  }
  autoRefreshHandle = setTimeout(() => {
    loadDashboardData();
    autoRefreshHandle = null;
  }, 1000);
});

export {};
