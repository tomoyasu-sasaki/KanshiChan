export const SCHEDULE_NOTIFICATION_LEAD_MINUTES = 5;
export const SCHEDULE_NOTIFICATION_COOLDOWN_MS = 60000;
export const SCHEDULE_NOTIFICATION_LEAD_MINUTES_MIN = 1;
export const SCHEDULE_NOTIFICATION_LEAD_MINUTES_MAX = 120;

export const DEFAULT_SCHEDULE_NOTIFICATION_SETTINGS = Object.freeze({
  preNotificationEnabled: true,
  leadMinutes: SCHEDULE_NOTIFICATION_LEAD_MINUTES,
});

/**
 * 許容範囲に収めたスケジュール事前通知のリードタイム（分）を返す。
 * @param {number|string} value ユーザー入力値
 * @returns {number} 正規化済みのリードタイム（分）
 */
export function sanitizeScheduleLeadMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.min(
      SCHEDULE_NOTIFICATION_LEAD_MINUTES_MAX,
      Math.max(SCHEDULE_NOTIFICATION_LEAD_MINUTES_MIN, parsed)
    );
  }
  return DEFAULT_SCHEDULE_NOTIFICATION_SETTINGS.leadMinutes;
}

export const SCHEDULE_MESSAGES = Object.freeze({
  addTitle: 'スケジュール追加',
  addBody: (title) => `${title} を追加しました`,
  leadTitle: (title) => `スケジュール: ${title}`,
  leadBody: (schedule, formattedDate, minutes = DEFAULT_SCHEDULE_NOTIFICATION_SETTINGS.leadMinutes) => `${minutes}分後に開始します\n${formattedDate} ${schedule.time}`,
  startTitle: (title) => `スケジュール: ${title}`,
  startBody: (description) => `開始時刻です\n${description || ''}`
});
