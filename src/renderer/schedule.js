/**
 * スケジュール管理ドロワー。
 * - localStorage に予定を保持し、Electron 通知と VOICEVOX 読み上げのトリガーを担う。
 * - 通知タイミングやメッセージは constants/schedule に集約。
 */
import { SCHEDULE_NOTIFICATION_LEAD_MINUTES, SCHEDULE_NOTIFICATION_COOLDOWN_MS, SCHEDULE_NOTIFICATION_SPEAKER_ID, SCHEDULE_MESSAGES } from '../constants/schedule.js';

// スケジュール保存用配列
let schedules = JSON.parse(localStorage.getItem('schedules')) || [];

// フォーム要素取得
const scheduleForm = document.getElementById('scheduleForm');
const scheduleItems = document.getElementById('scheduleItems');

// 現在時刻チェック用タイマー
let notificationCheckInterval;

// 日付ユーティリティ
function getTodayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // <input type="date"> 用
}

function getTodayDisplayDate() {
  const iso = getTodayISODate();
  // yyyy-mm-dd -> yyyy/mm/dd
  return iso.replaceAll('-', '/');
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // yyyy/mm/dd のスケジュール」ヘッダーを追加
  try {
    const container = document.querySelector('.schedule-form-container');
    const heading = container ? container.querySelector('h3') : null;
    if (container && heading) {
      const info = document.createElement('div');
      info.className = 'today-schedule-header';
      info.textContent = `${getTodayDisplayDate()} のスケジュール`;
      container.insertBefore(info, heading);
    }
  } catch {}

  // 日付入力は本日固定にして非表示
  try {
    const dateInput = document.getElementById('date');
    if (dateInput) {
      dateInput.value = getTodayISODate();
      const group = dateInput.closest('.form-group');
      if (group) group.style.display = 'none';
    }
  } catch {}

  renderSchedules();
  startNotificationCheck();
});

// スケジュール追加
scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value;
  // 日付は本日固定
  const date = getTodayISODate();
  const time = document.getElementById('time').value;
  const description = document.getElementById('description').value;

  const schedule = {
    id: Date.now(),
    title,
    date,
    time,
    description,
    notified: false,
    preNotified: false,
    startNotified: false
  };

  schedules.push(schedule);
  saveSchedules();
  renderSchedules();
  scheduleForm.reset();

  // 保存成功通知
  await window.electronAPI.sendNotification({
    title: SCHEDULE_MESSAGES.addTitle,
    body: SCHEDULE_MESSAGES.addBody(title)
  });
});

// スケジュールを保存
function saveSchedules() {
  localStorage.setItem('schedules', JSON.stringify(schedules));
}

// スケジュール一覧を表示
function renderSchedules() {
  scheduleItems.innerHTML = '';

  if (schedules.length === 0) {
    scheduleItems.innerHTML = '<p class="empty-message">スケジュールがありません</p>';
    return;
  }

  // 日時順にソート
  const sortedSchedules = [...schedules].sort((a, b) => {
    const dateTimeA = new Date(`${a.date}T${a.time}`);
    const dateTimeB = new Date(`${b.date}T${b.time}`);
    return dateTimeA - dateTimeB;
  });

  sortedSchedules.forEach(schedule => {
    const scheduleElement = createScheduleElement(schedule);
    scheduleItems.appendChild(scheduleElement);
  });
}

// スケジュール要素を作成
function createScheduleElement(schedule) {
  const div = document.createElement('div');
  div.className = 'schedule-item';

  const dateTime = new Date(`${schedule.date}T${schedule.time}`);
  const isPast = dateTime < new Date();

  if (isPast) {
    div.classList.add('past');
  }

  div.innerHTML = `
    <div class="schedule-header">
      <h3>${schedule.title}</h3>
      <button class="btn-delete" onclick="deleteSchedule(${schedule.id})">削除</button>
    </div>
    <div class="schedule-info">
      <p class="schedule-datetime">📆 ${formatDate(schedule.date)} ${schedule.time}</p>
      ${schedule.description ? `<p class="schedule-description">${schedule.description}</p>` : ''}
    </div>
  `;

  return div;
}

// 日付フォーマット
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[date.getDay()];

  return `${year}年${month}月${day}日(${weekday})`;
}

// スケジュール削除
function deleteSchedule(id) {
  schedules = schedules.filter(s => s.id !== id);
  saveSchedules();
  renderSchedules();
}

// 通知チェック開始
function startNotificationCheck() {
  // 既存タイマーがあればクリア
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }

  // 起動直後は一度だけ実行（開始時刻直前の救済用。5分前通知は発火させない）
  checkScheduleNotifications();

  // 分境界にアラインしてから、以後は60秒ごとにチェック
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    checkScheduleNotifications();
    notificationCheckInterval = setInterval(checkScheduleNotifications, 60000);
  }, Math.max(0, msToNextMinute));
}

// スケジュール通知チェック
/**
 * 通知条件を評価し、Electron 通知と VOICEVOX 読み上げを必要に応じて実行する。
 */
async function checkScheduleNotifications() {
  const now = new Date();
  const seconds = now.getSeconds();
  const nowAligned = new Date(now);
  nowAligned.setSeconds(0, 0);

  for (let schedule of schedules) {
    const scheduleDateTime = new Date(`${schedule.date}T${schedule.time}`);
    if (isNaN(scheduleDateTime.getTime())) continue; // 無効な日時は無視
    const timeDiff = scheduleDateTime - now;
    const minutesLeft = Math.floor((scheduleDateTime - nowAligned) / 60000);

    // 既存データ互換（notified の意味を分割）
    // - 未来の予定で notified=true: 5分前通知済とみなす
    // - 過去/開始時刻付近で notified=true: 両方通知済とみなす
    if (schedule.preNotified === undefined) schedule.preNotified = false;
    if (schedule.startNotified === undefined) schedule.startNotified = false;
    if (schedule.notified === true && schedule.preNotified === false && schedule.startNotified === false) {
      if (timeDiff > 0) {
        schedule.preNotified = true;
      } else {
        schedule.preNotified = true;
        schedule.startNotified = true;
      }
      schedule.notified = schedule.preNotified || schedule.startNotified;
      saveSchedules();
    }

    // 時刻が過ぎた古い予定は自動的に両方通知済み扱いにして二重発火を防止
    if (timeDiff < -SCHEDULE_NOTIFICATION_COOLDOWN_MS && (!schedule.preNotified || !schedule.startNotified)) {
      schedule.preNotified = true;
      schedule.startNotified = true;
      schedule.notified = true;
      saveSchedules();
      continue;
    }

    // 5分前通知: 分境界（秒=0）のときに分差がちょうど5のみ発火
    if (seconds === 0 && minutesLeft === SCHEDULE_NOTIFICATION_LEAD_MINUTES && !schedule.preNotified) {
      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.leadTitle(schedule.title),
        body: SCHEDULE_MESSAGES.leadBody(schedule, formatDate(schedule.date))
      });

      // 音声読み上げ（VOICEVOX）
      if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
        try {
          const res = await window.electronAPI.speakText({
            text: `${SCHEDULE_NOTIFICATION_LEAD_MINUTES}分後に ${schedule.title} が始まります。`,
            engine: 'voicevox',
            options: { speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID, speedScale: 1.05 }
          });
          if (res && res.success && res.dataUrl && seconds === 0) {
            const audio = new Audio(res.dataUrl);
            audio.play().catch(() => {});
          }
        } catch {}
      }

      schedule.preNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      saveSchedules();
    }

    // 開始時通知: 分境界で分差0 または 直前60秒以内の救済
    if (((seconds === 0 && minutesLeft === 0) || (timeDiff > -SCHEDULE_NOTIFICATION_COOLDOWN_MS && timeDiff <= 0)) && !schedule.startNotified) {
      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.startTitle(schedule.title),
        body: SCHEDULE_MESSAGES.startBody(schedule.description)
      });

      // 音声読み上げ（VOICEVOX）
      if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
        try {
          const res = await window.electronAPI.speakText({
            text: `${schedule.title} の開始時刻です。`,
            engine: 'voicevox',
            options: { speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID, speedScale: 1.0 }
          });
          if (res && res.success && res.dataUrl) {
            const audio = new Audio(res.dataUrl);
            audio.play().catch(() => {});
          }
        } catch {}
      }

      schedule.startNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      saveSchedules();
    }
  }
}
