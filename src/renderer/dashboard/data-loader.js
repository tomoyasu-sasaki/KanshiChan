/**
 * ダッシュボード全体のデータ読み込みとフィルタ操作を司るモジュール。
 * - IPC 呼び出しと描画更新の順序を統制し、表示の一貫性を担保する。
 */
import { state } from './state.js';
import {
  rangeSelect,
  customRangeContainer,
  startInput,
  endInput,
  granularitySelect,
} from './dom.js';
import { toLocalDateTimeLocalString } from './utils.js';
import { renderKpis, renderChart } from './charts.js';
import {
  renderLogTable,
  renderAppUsageTable,
  renderChromeUsageTable,
} from './tables.js';
import { refreshSlackSection } from './slack.js';
import {
  refreshTypingSection,
  refreshTypingStatus,
} from './typing.js';
import { refreshSystemEvents } from './system-events.js';
import { refreshUpcomingSchedules } from './upcoming.js';
import { renderTaskStats } from './tasks.js';

/**
 * 現在の選択状態に基づき集計期間を算出する。
 * - カスタム指定が空の場合はフィールドを自動入力して UX を維持する。
 * @returns {{start:number,end:number}} 集計対象期間（UNIX ms）
 */
export function computeRange() {
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

  if (!startInput.value || !endInput.value) {
    startInput.value = toLocalDateTimeLocalString(start);
    endInput.value = toLocalDateTimeLocalString(end);
  }

  return { start, end };
}

/**
 * ダッシュボードに必要なデータをまとめて取得し、各セクションを再描画する。
 * - Slack/Typing/システムイベントは依存関係があるため await で逐次更新する。
 */
export async function loadDashboardData() {
  const { start, end } = computeRange();
  state.lastRange = { start, end };

  try {
    // overrideSummaryRes は absence_override_events の集計で、検知ログとは異なる SQL を叩くため個別に取得する。
    const [statsRes, recentRes, appUsageRes, overrideSummaryRes, taskStatsRes] = await Promise.all([
      window.electronAPI?.detectionLogStats?.({
        start,
        end,
        groupBy: granularitySelect?.value === 'hour' ? 'hour' : 'day',
      }) ?? Promise.resolve({ success: false }),
      window.electronAPI?.detectionLogRecent?.({ limit: 100 }) ?? Promise.resolve({ success: false }),
      window.electronAPI?.appUsageStats?.({ start, end, limit: 10 }) ?? Promise.resolve({ success: false }),
      window.electronAPI?.absenceOverrideSummary?.({ start, end }) ?? Promise.resolve({ success: false }),
      window.electronAPI?.tasksStats?.({ start, end }) ?? Promise.resolve({ success: false }),
    ]);

    if (statsRes?.success) {
      state.stats = statsRes.data;
    }

    if (recentRes?.success) {
      state.recentLogs = recentRes.items || [];
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

    if (overrideSummaryRes?.success) {
      state.absenceOverrideSummary = overrideSummaryRes.summary || null;
    } else {
      state.absenceOverrideSummary = null;
    }

    if (taskStatsRes?.success) {
      state.taskStats = taskStatsRes.data || null;
    } else {
      state.taskStats = null;
    }

    renderKpis();
    renderChart();
    renderLogTable();
    renderAppUsageTable();
    renderChromeUsageTable();
    renderTaskStats();
  } catch (error) {
    console.error('[Dashboard] データ取得エラー:', error);
  }

  await refreshSlackSection({ showLoadingIndicator: false });
  await refreshTypingStatus();
  await refreshTypingSection({ start, end, showLoading: false });
  await refreshSystemEvents({ start, end, showLoading: false });
  refreshUpcomingSchedules();
}

/**
 * 期間セレクタが custom のときに日付入力を表示する。
 */
export function updateCustomRangeVisibility() {
  if (!customRangeContainer) {
    return;
  }
  customRangeContainer.style.display = rangeSelect?.value === 'custom' ? 'flex' : 'none';
}

/**
 * 種別フィルタ変更時に再集計済みデータをチャートへ反映する。
 */
export function applyTypeFilter() {
  renderChart();
}
