/**
 * ダッシュボード内で共有する静的定数群。
 * - レンダラ初期化前に評価されるため、副作用を含めないこと。
 * - Chart.js や Slack セクションが参照する識別子を一元管理する。
 */
export const DEFAULT_SLACK_SCHEDULE = ['13:00', '18:00'];
export const UPCOMING_SCHEDULE_RANGE_HOURS = 24;
export const UPCOMING_SCHEDULE_LIMIT = 5;
export const SCHEDULE_WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const DATASET_GROUPS = {
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
