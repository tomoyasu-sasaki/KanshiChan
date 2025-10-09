/**
 * KPIカードとグラフ描画ロジックを集約する。
 * - Chart.js のインスタンスは state.chart で共有し、複数箇所から再利用する。
 * - 「種別: タイピング」選択時は専用の折れ線へ切り替えるため、renderChart 内で分岐を持たせている。
 */
import { state } from './state.js';
import {
  kpiContainer,
  chartCanvas,
  typeFilterSelect,
  Chart,
} from './dom.js';
import { DATASET_GROUPS } from './constants.js';
import { formatDuration, formatTypingBucketLabel, formatRange } from './utils.js';

/**
 * KPIカードを現在の state から再生成する。
 * - 取得済み統計が未設定の場合はレンダリングをスキップする。
 */
export function renderKpis() {
  if (!kpiContainer || !state.stats) return;

  const summary = state.stats.summary || {};
  const byType = summary.byType || {};

  const phoneDuration = byType.phone_detection_end?.totalDurationSeconds || 0;
  const absenceDuration = byType.absence_detection_end?.totalDurationSeconds || 0;
  const alertCount = (byType.phone_alert?.count || 0) + (byType.absence_alert?.count || 0);
  // 許可済み不在は absence_override_events から別集計しており、統計の欠損と混同しないよう分離表示する。
  const overrideSummary = state.absenceOverrideSummary;
  const permittedDuration = overrideSummary?.totalSeconds || 0;
  const manualPermitted = overrideSummary?.manualSeconds || 0;
  const autoPermitted = overrideSummary?.autoSeconds || 0;
  const activePermits = overrideSummary?.activeCount || 0;

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
    overrideSummary
      ? {
          label: '許可済み不在',
          value: formatDuration(permittedDuration),
          subtext: `手動 ${formatDuration(manualPermitted)} / 自動 ${formatDuration(autoPermitted)}${activePermits > 0 ? ` · ${activePermits} 件進行中` : ''}`,
        }
      : null,
    overrideSummary
      ? {
          label: '未許可の不在',
          value: formatDuration(Math.max(absenceDuration - permittedDuration, 0)),
          subtext: '不在検知時間と許可済み不在の差分',
        }
      : null,
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

/**
 * 「検知トレンド」チャートを描画/更新する。
 * - 種別が typing の場合は専用描画へフォールバックする。
 */
export function renderChart() {
  if (!chartCanvas || !Chart) return;

  const groupKey = typeFilterSelect?.value || 'all';
  if (groupKey === 'typing') {
    // タイピング統計はバケット構成が異なるため、共通の集計グラフではなく専用描画に委譲する。
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

    const colors = ['#4dabf7', '#94d82d', '#fcc419', '#ffa8a8'];

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

/**
 * タイピング統計専用の折れ線グラフを描画する。
 * - 通常の検知グラフとはデータ構造が異なるため、別途 Chart インスタンスを再利用する。
 */
export function renderTypingChart() {
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
    state.chart.data.datasets = [dataset];
    state.chart.update();
  }
}
