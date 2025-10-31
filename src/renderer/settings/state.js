/**
 * 監視設定の永続化レイヤー。
 * - localStorage に依存し、レンダラのみで完結させる方針を明示する。
 * - 他モジュールへはシリアライズ済み設定の読み書きだけを公開する。
 */
import { DEFAULT_MONITOR_SETTINGS } from '../../constants/monitor.js';
import { sanitizeScheduleLeadMinutes } from '../../constants/schedule.js';
import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../../constants/voicevox-config.js';

export const DEFAULT_SLACK_SCHEDULE = ['13:00', '18:00'];
const STORAGE_KEY = 'monitorSettings';

/**
 * 監視設定の初期状態を複製する。
 * - デフォルト値を共有参照させないことで、フォーム操作による副作用を避ける。
 */
export function cloneDefaultSettings() {
  return {
    ...DEFAULT_MONITOR_SETTINGS,
    enabledClasses: [...DEFAULT_MONITOR_SETTINGS.enabledClasses],
    voicevoxSpeaker: DEFAULT_MONITOR_SETTINGS.voicevoxSpeaker ?? DEFAULT_VOICEVOX_SPEAKER_ID,
    previewEnabled: DEFAULT_MONITOR_SETTINGS.previewEnabled !== false,
  };
}

/**
 * localStorage から設定を復元し、欠損時は安全な初期値にフォールバックする。
 * - JSON パース失敗時はログのみ出して動作を継続し、ユーザー設定を失わないようにする。
 */
export function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return cloneDefaultSettings();
  }

  try {
    const parsed = JSON.parse(saved);
    const defaults = cloneDefaultSettings();
    const enabledClasses = Array.isArray(parsed.enabledClasses)
      ? parsed.enabledClasses
      : [...DEFAULT_MONITOR_SETTINGS.enabledClasses];
    const schedulePreNotificationEnabled = typeof parsed.schedulePreNotificationEnabled === 'boolean'
      ? parsed.schedulePreNotificationEnabled
      : defaults.schedulePreNotificationEnabled;
    const schedulePreNotificationLeadMinutes = sanitizeScheduleLeadMinutes(
      parsed.schedulePreNotificationLeadMinutes ?? defaults.schedulePreNotificationLeadMinutes
    );
    const previewEnabled = typeof parsed.previewEnabled === 'boolean'
      ? parsed.previewEnabled
      : defaults.previewEnabled;

    return {
      ...defaults,
      ...parsed,
      enabledClasses,
      schedulePreNotificationEnabled,
      schedulePreNotificationLeadMinutes,
      previewEnabled,
    };
  } catch (error) {
    console.warn('[Settings] Failed to parse stored monitor settings.', error);
    return cloneDefaultSettings();
  }
}

/**
 * 設定を localStorage に保存する。
 * - 書式は JSON 固定とし、メインプロセスとの齟齬が発生しないようにする。
 */
export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
