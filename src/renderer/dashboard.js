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
const chartCanvas = document.getElementById('dashboardTrendChart');
const Chart = window.Chart;
let autoRefreshHandle = null;

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

const state = {
  stats: null,
  recentLogs: [],
  chart: null,
  appUsage: [],
  appUsageTotalDuration: 0,
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
      } else {
        state.appUsage = [];
        state.appUsageTotalDuration = 0;
      }

      renderAppUsageTable();
      renderKpis();
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
      label: 'スマホ滞在時間',
      value: formatDuration(phoneDuration),
      subtext: `${byType.phone_detection_end?.count || 0} 件のセッション`,
    },
    {
      label: '不在時間',
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
  if (!chartCanvas || !state.stats || !Chart) return;

  const groupKey = typeFilterSelect?.value || 'all';
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

function renderLogTable() {
  if (!logTableBody) return;

  const filter = typeFilterSelect?.value || 'all';

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

  logTableBody.innerHTML = filtered
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
        <td colspan="4">データがありません</td>
      </tr>
    `;
    return;
  }

  appUsageTableBody.innerHTML = state.appUsage
    .map((item) => {
      const detail = item.domain ? item.domain : (item.title || '-');
      return `
        <tr>
          <td>${escapeHtml(item.appName)}</td>
          <td>${escapeHtml(detail || '-')}</td>
          <td>${formatDuration(item.totalDurationSeconds)}</td>
          <td>${item.sessions ?? 0}</td>
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
