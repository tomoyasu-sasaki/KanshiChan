/**
 * Preload スクリプト - IPC境界の定義
 *
 * 責務: レンダラプロセスへ安全なAPI公開（contextBridge経由）
 * セキュリティ設計: メインプロセスの機能を限定的に公開し、レンダラの権限を最小化
 *
 * 公開API:
 * - schedulesList / schedulesReplace: スケジュールの取得・一括同期
 * - sendNotification: デスクトップ通知送信
 * - detectObjects: YOLOv11物体検知（メインプロセスで実行）
 * - speakText: VOICEVOXでテキスト読み上げ（メインプロセス経由）
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  schedulesList: () => ipcRenderer.invoke('schedules-list'),
  schedulesReplace: (payload) => ipcRenderer.invoke('schedules-replace', payload),
  schedulesUpsert: (payload) => ipcRenderer.invoke('schedules-upsert', payload),
  schedulesUpsertMany: (payload) => ipcRenderer.invoke('schedules-upsert-many', payload),
  schedulesDelete: (id) => ipcRenderer.invoke('schedules-delete', id),
  sendNotification: (data) => ipcRenderer.invoke('send-notification', data),
  detectObjects: (imageDataUrl) => ipcRenderer.invoke('detect-objects', imageDataUrl),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  speakText: (payload) => ipcRenderer.invoke('tts-speak', payload),
  audioTranscribe: (payload) => ipcRenderer.invoke('audio-transcribe', payload),
  audioInfer: (payload) => ipcRenderer.invoke('audio-infer', payload),
  audioCheckAvailability: () => ipcRenderer.invoke('audio-check-availability'),
  recordDetectionLog: (payload) => ipcRenderer.invoke('detection-log-record', payload),
  detectionLogStats: (options) => ipcRenderer.invoke('detection-log-stats', options),
  detectionLogRecent: (options) => ipcRenderer.invoke('detection-log-recent', options),
  recordAppUsage: (payload) => ipcRenderer.invoke('app-usage-record', payload),
  appUsageStats: (options) => ipcRenderer.invoke('app-usage-stats', options),
  slackReporterGetSettings: () => ipcRenderer.invoke('slack-reporter-get-settings'),
  slackReporterUpdateSettings: (payload) => ipcRenderer.invoke('slack-reporter-update-settings', payload),
  slackReporterSendNow: () => ipcRenderer.invoke('slack-reporter-send-now'),
  slackReporterHistory: (options) => ipcRenderer.invoke('slack-reporter-history', options),
  typingMonitorStatus: () => ipcRenderer.invoke('typing-monitor-status'),
  typingMonitorSetEnabled: (enabled) => ipcRenderer.invoke('typing-monitor-set-enabled', enabled),
  typingMonitorSetPaused: (paused) => ipcRenderer.invoke('typing-monitor-set-paused', paused),
  typingActivityStats: (options) => ipcRenderer.invoke('typing-activity-stats', options),
  systemEventsRecent: (options) => ipcRenderer.invoke('system-events-recent', options),
  syncSchedules: (schedules) => ipcRenderer.invoke('schedules-replace', schedules),
  // Tasks API
  tasksCreate: (payload) => ipcRenderer.invoke('tasks-create', payload),
  tasksUpdate: (id, fields) => ipcRenderer.invoke('tasks-update', id, fields),
  tasksDelete: (id) => ipcRenderer.invoke('tasks-delete', id),
  tasksList: (filter) => ipcRenderer.invoke('tasks-list', filter),
  tasksReorder: (updates) => ipcRenderer.invoke('tasks-reorder', updates),
  tasksTagsList: () => ipcRenderer.invoke('tasks-tags-list'),
  tasksBulkDelete: (criteria) => ipcRenderer.invoke('tasks-bulk-delete', criteria),
  tasksBulkComplete: (criteria) => ipcRenderer.invoke('tasks-bulk-complete', criteria),
  absenceOverrideGetState: () => ipcRenderer.invoke('absence_override_get_state'),
  absenceOverrideActivate: (payload) => ipcRenderer.invoke('absence_override_activate', payload),
  absenceOverrideExtend: (payload) => ipcRenderer.invoke('absence_override_extend', payload),
  absenceOverrideClear: (payload) => ipcRenderer.invoke('absence_override_clear', payload),
  absenceOverrideHistory: () => ipcRenderer.invoke('absence_override_history'),
  absenceOverrideSummary: (options) => ipcRenderer.invoke('absence_override_summary', options),
  absenceOverrideEvents: (options) => ipcRenderer.invoke('absence_override_events', options),
  onAbsenceOverrideStateChanged: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const channel = 'absence_override_state_changed';
    const wrapped = (_event, state) => handler(state);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
