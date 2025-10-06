/**
 * スケジュール機能で共通利用する定数群。
 * - 依存関係を減らすため値のみを定義し、処理ロジックは utils 側へ委譲する。
 */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const REPEAT_TYPE_ALIASES = Object.freeze({
  weekly: 'weekly',
  week: 'weekly',
  weekdays: 'weekdays',
  weekday: 'weekdays',
  平日: 'weekdays',
  daily: 'daily',
  everyday: 'daily',
  毎日: 'daily',
});

export const PRESET_REPEAT_DAYS = Object.freeze({
  weekdays: [1, 2, 3, 4, 5],
  daily: [0, 1, 2, 3, 4, 5, 6],
});

export const REPEAT_PRESET_CONFIG = Object.freeze({
  none: [],
  weekdays: [1, 2, 3, 4, 5],
  everyday: [0, 1, 2, 3, 4, 5, 6],
});

export const REPEAT_TOKEN_MAP = Object.freeze({
  sun: 0,
  sunday: 0,
  0: 0,
  日: 0,
  mon: 1,
  monday: 1,
  1: 1,
  月: 1,
  tue: 2,
  tuesday: 2,
  2: 2,
  火: 2,
  wed: 3,
  wednesday: 3,
  3: 3,
  水: 3,
  thu: 4,
  thursday: 4,
  4: 4,
  木: 4,
  fri: 5,
  friday: 5,
  5: 5,
  金: 5,
  sat: 6,
  saturday: 6,
  6: 6,
  土: 6,
});
