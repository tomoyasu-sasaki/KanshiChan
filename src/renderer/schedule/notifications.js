/**
 * スケジュール通知のスケジューリングとトリガー処理を管理するモジュール。
 */
import {
  SCHEDULE_NOTIFICATION_LEAD_MINUTES,
  SCHEDULE_NOTIFICATION_COOLDOWN_MS,
  SCHEDULE_NOTIFICATION_SPEAKER_ID,
  SCHEDULE_MESSAGES,
} from '../../constants/schedule.js';
import { scheduleState, setNotificationInterval, clearNotificationInterval } from './state.js';
import {
  getNextOccurrenceInfo,
  buildRepeatAwareLeadFallback,
  buildRepeatAwareStartFallback,
  formatDateWithWeekday,
} from './utils.js';
import {
  ensureRepeatOccurrenceState,
  saveSchedules,
} from './model.js';
import { queueTts } from './tts.js';

/**
 * 通知チェックのタイマーを開始する。
 * - 直ちに一度実行し、その後は分境界に揃えて動かす。
 */
export function startNotificationCheck() {
  clearNotificationInterval();
  checkScheduleNotifications();

  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  const timeoutHandle = setTimeout(() => {
    checkScheduleNotifications();
    const intervalHandle = setInterval(checkScheduleNotifications, 60000);
    setNotificationInterval(intervalHandle);
  }, Math.max(0, msToNextMinute));

  setNotificationInterval(timeoutHandle);
}

/**
 * 通知チェックのタイマーを停止する。
 */
export function stopNotificationCheck() {
  clearNotificationInterval();
}

/**
 * スケジュールを走査し、条件を満たす通知を発火させる中核処理。
 */
async function checkScheduleNotifications() {
  const now = new Date();
  const seconds = now.getSeconds();
  const nowAligned = new Date(now);
  nowAligned.setSeconds(0, 0);

  let schedulesDirty = false;

  for (const schedule of scheduleState.schedules) {
    const occurrenceInfo = getNextOccurrenceInfo(schedule, now);
    if (!occurrenceInfo || !occurrenceInfo.dateTime) {
      continue;
    }

    if (schedule.repeat) {
      if (ensureRepeatOccurrenceState(schedule, occurrenceInfo.key)) {
        schedulesDirty = true;
      }
    } else if (!schedule.lastOccurrenceKey) {
      schedule.lastOccurrenceKey = schedule.date;
      schedulesDirty = true;
    }

    const scheduleDateTime = occurrenceInfo.dateTime;
    const timeDiff = scheduleDateTime - now;
    const minutesLeft = Math.floor((scheduleDateTime - nowAligned) / 60000);
    const formattedDate = formatDateWithWeekday(occurrenceInfo.key || schedule.date);

    if (schedule.preNotified === undefined) {
      schedule.preNotified = false;
      schedulesDirty = true;
    }
    if (schedule.startNotified === undefined) {
      schedule.startNotified = false;
      schedulesDirty = true;
    }
    if (schedule.notified === true && schedule.preNotified === false && schedule.startNotified === false) {
      if (timeDiff > 0) {
        schedule.preNotified = true;
      } else {
        schedule.preNotified = true;
        schedule.startNotified = true;
      }
      schedule.notified = schedule.preNotified || schedule.startNotified;
      schedulesDirty = true;
    }

    if (timeDiff < -SCHEDULE_NOTIFICATION_COOLDOWN_MS && (!schedule.preNotified || !schedule.startNotified)) {
      schedule.preNotified = true;
      schedule.startNotified = true;
      schedule.notified = true;
      schedulesDirty = true;
      continue;
    }

    if (seconds === 0 && minutesLeft === SCHEDULE_NOTIFICATION_LEAD_MINUTES && !schedule.preNotified) {
      schedule.preNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      schedulesDirty = true;

      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.leadTitle(schedule.title),
        body: SCHEDULE_MESSAGES.leadBody(schedule, formattedDate),
      });

      const leadMessage = (() => {
        if (typeof schedule.ttsLeadMessage === 'string' && schedule.ttsLeadMessage.trim().length > 0) {
          return schedule.ttsLeadMessage.trim();
        }
        return buildRepeatAwareLeadFallback(schedule, occurrenceInfo);
      })();

      await queueTts(leadMessage, {
        speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID,
        speedScale: 1.05,
      });
    }

    if (((seconds === 0 && minutesLeft === 0) || (timeDiff > -SCHEDULE_NOTIFICATION_COOLDOWN_MS && timeDiff <= 0)) && !schedule.startNotified) {
      schedule.startNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      schedulesDirty = true;

      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.startTitle(schedule.title),
        body: SCHEDULE_MESSAGES.startBody(schedule.description),
      });

      const startMessage = (() => {
        if (typeof schedule.ttsMessage === 'string' && schedule.ttsMessage.trim().length > 0) {
          return schedule.ttsMessage.trim();
        }
        return buildRepeatAwareStartFallback(schedule, occurrenceInfo);
      })();

      await queueTts(startMessage, {
        speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID,
        speedScale: 1.0,
      });
    }
  }

  if (schedulesDirty) {
    saveSchedules();
    window.dispatchEvent(new CustomEvent('schedule-renderer-updated', { detail: { scope: 'notifications' } }));
  }
}
