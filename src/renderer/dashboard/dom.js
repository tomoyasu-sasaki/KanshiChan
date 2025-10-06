/**
 * ダッシュボードで利用する主要DOM要素の参照をまとめる。
 * - クエリは一度だけ実行し、各セクションから import して使う。
 * - SSR やテスト環境では null になり得るため、呼び出し側で存在確認を行うこと。
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

export {
  modal,
  openBtn,
  refreshBtn,
  exportBtn,
  rangeSelect,
  customRangeContainer,
  startInput,
  endInput,
  granularitySelect,
  typeFilterSelect,
  kpiContainer,
  logTableBody,
  appUsageTableBody,
  chromeUsageTableBody,
  chartCanvas,
  slackSummaryEl,
  slackHistoryListEl,
  slackSendNowBtn,
  slackRefreshBtn,
  upcomingSchedulesWrapper,
  upcomingSchedulesListEl,
  typingMonitorPauseBtn,
  typingStatsRefreshBtn,
  typingMonitorStatusEl,
  typingTableBody,
  systemEventsRefreshBtn,
  systemEventsTableBody,
  Chart,
};
