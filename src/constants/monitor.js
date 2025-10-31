import { DEFAULT_SCHEDULE_NOTIFICATION_SETTINGS } from './schedule.js';
import { DEFAULT_VOICEVOX_SPEAKER_ID } from './voicevox-config.js';

/**
 * 監視機能 (monitor.js 等) の既定設定とタイミング定義。
 * レンダラ側で複数モジュールが共有するため、変更は慎重に行う。
 */
export const DEFAULT_ENABLED_CLASSES = Object.freeze(['person', 'cell phone']);

export const DEFAULT_MONITOR_SETTINGS = Object.freeze({
  phoneThreshold: 10,
  phoneAlertEnabled: true,
  phoneConfidence: 0.5,
  absenceThreshold: 30,
  absenceAlertEnabled: true,
  absenceConfidence: 0.5,
  soundEnabled: true,
  desktopNotification: true,
  enabledClasses: DEFAULT_ENABLED_CLASSES,
  showDetections: true,
  previewEnabled: true,
  yoloEnabled: true,
  voicevoxSpeaker: DEFAULT_VOICEVOX_SPEAKER_ID,
  schedulePreNotificationEnabled: DEFAULT_SCHEDULE_NOTIFICATION_SETTINGS.preNotificationEnabled,
  schedulePreNotificationLeadMinutes: DEFAULT_SCHEDULE_NOTIFICATION_SETTINGS.leadMinutes
});

export const MONITOR_TIMING_CONSTANTS = Object.freeze({
  detectionIntervalMs: 500,
  activeWindowIntervalMs: 1000,
  detectionResultStaleMs: 1000,
  phoneInterpolationWindowMs: 2000,
  personInterpolationWindowMs: 500,
  phoneClearStableMs: 2000,
  absenceClearStableMs: 2000,
  phoneAlertCooldownMs: 120000,
  absenceAlertCooldownMs: 300000
});

export const MONITOR_UI_CONSTANTS = Object.freeze({
  maxLogEntries: 50
});
