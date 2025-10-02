// スケジュール保存用配列
let schedules = JSON.parse(localStorage.getItem('schedules')) || [];

// フォーム要素取得
const scheduleForm = document.getElementById('scheduleForm');
const scheduleItems = document.getElementById('scheduleItems');

// 現在時刻チェック用タイマー
let notificationCheckInterval;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  renderSchedules();
  startNotificationCheck();
});

// スケジュール追加
scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value;
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;
  const description = document.getElementById('description').value;

  const schedule = {
    id: Date.now(),
    title,
    date,
    time,
    description,
    notified: false
  };

  schedules.push(schedule);
  saveSchedules();
  renderSchedules();
  scheduleForm.reset();

  // 保存成功通知
  await window.electronAPI.sendNotification({
    title: 'スケジュール追加',
    body: `${title} を追加しました`
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
  // 1分ごとにチェック
  notificationCheckInterval = setInterval(checkScheduleNotifications, 60000);
  // 起動時にも一度チェック
  checkScheduleNotifications();
}

// スケジュール通知チェック
async function checkScheduleNotifications() {
  const now = new Date();

  for (let schedule of schedules) {
    if (schedule.notified) continue;

    const scheduleDateTime = new Date(`${schedule.date}T${schedule.time}`);
    const timeDiff = scheduleDateTime - now;

    // 5分前に通知
    if (timeDiff > 0 && timeDiff <= 5 * 60 * 1000) {
      await window.electronAPI.sendNotification({
        title: `スケジュール: ${schedule.title}`,
        body: `5分後に開始します\n${formatDate(schedule.date)} ${schedule.time}`
      });

      schedule.notified = true;
      saveSchedules();
    }

    // 時刻になったら通知
    if (timeDiff > -60000 && timeDiff <= 0 && !schedule.notified) {
      await window.electronAPI.sendNotification({
        title: `スケジュール: ${schedule.title}`,
        body: `開始時刻です\n${schedule.description || ''}`
      });

      schedule.notified = true;
      saveSchedules();
    }
  }
}
