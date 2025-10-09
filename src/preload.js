/**
 * Preload スクリプト - IPC境界の定義
 *
 * 責務: レンダラプロセスへ安全なAPI公開（contextBridge経由）
 * セキュリティ設計: メインプロセスの機能を限定的に公開し、レンダラの権限を最小化
 *
 * 公開API:
 * - saveSchedule: スケジュール保存（現状はメモリ内処理のみ、将来的にファイル/DB保存拡張可）
 * - sendNotification: デスクトップ通知送信
 * - detectObjects: YOLOv11物体検知（メインプロセスで実行）
 * - speakText: VOICEVOXでテキスト読み上げ（メインプロセス経由）
 * - voiceInputTranscribe: 音声データから文字起こし & スケジュール抽出
 * - voiceInputCheckAvailability: 音声入力機能の利用可否をチェック
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveSchedule: (schedule) => ipcRenderer.invoke('save-schedule', schedule),
  sendNotification: (data) => ipcRenderer.invoke('send-notification', data),
  detectObjects: (imageDataUrl) => ipcRenderer.invoke('detect-objects', imageDataUrl),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  speakText: (payload) => ipcRenderer.invoke('tts-speak', payload),
  audioTranscribe: (payload) => ipcRenderer.invoke('audio-transcribe', payload),
  audioInfer: (payload) => ipcRenderer.invoke('audio-infer', payload),
  audioCheckAvailability: () => ipcRenderer.invoke('audio-check-availability'),
  voiceInputTranscribe: (audioDataBase64) => ipcRenderer.invoke('voice-input-transcribe', audioDataBase64),
  voiceInputCheckAvailability: () => ipcRenderer.invoke('voice-input-check-availability'),
  generateScheduleTts: (schedule) => ipcRenderer.invoke('schedule-generate-tts', schedule),
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
  syncSchedules: (schedules) => ipcRenderer.invoke('schedule-sync', schedules),
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
