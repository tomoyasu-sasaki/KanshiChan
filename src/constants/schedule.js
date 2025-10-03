/**
 * スケジュール機能の通知関連定数。
 * レンダラ (schedule.js) とメインの VOICEVOX サービスで共通利用する。
 */
import { NOTIFICATION_VOICE_SPEAKER_ID } from './voicevox-config.js';

export const SCHEDULE_NOTIFICATION_LEAD_MINUTES = 5;
export const SCHEDULE_NOTIFICATION_COOLDOWN_MS = 60000;
export const SCHEDULE_NOTIFICATION_SPEAKER_ID = NOTIFICATION_VOICE_SPEAKER_ID;

export const SCHEDULE_MESSAGES = Object.freeze({
  addTitle: 'スケジュール追加',
  addBody: (title) => `${title} を追加しました`,
  leadTitle: (title) => `スケジュール: ${title}`,
  leadBody: (schedule, formattedDate, minutes = SCHEDULE_NOTIFICATION_LEAD_MINUTES) => `${minutes}分後に開始します\n${formattedDate} ${schedule.time}`,
  startTitle: (title) => `スケジュール: ${title}`,
  startBody: (description) => `開始時刻です\n${description || ''}`
});
