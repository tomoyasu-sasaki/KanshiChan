/**
 * ダッシュボード全体のレンダリング状態を保持するストア。
 * - Chart.js のインスタンスなど DOM/外部リソースを含むため、単純な JSON ではなく整合性に注意。
 * - フィルター変更時に lastRange を更新し、各セクションが参照できるよう共有する。
 */
export const state = {
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
  autoRefreshHandle: null,
  slackBusy: false,
  slackSummaryResetHandle: null,
  typingBusy: false,
  typingStatusResetHandle: null,
  lastRange: null,
  systemEventsBusy: false,
};
