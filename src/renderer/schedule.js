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

// TTS再生キュー
const ttsQueue = [];
let isTTSPlaying = false;

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

  // タブ切り替え
  setupTabs();

  // 一括追加ボタン
  const bulkAddBtn = document.getElementById('bulkAddBtn');
  if (bulkAddBtn) {
    bulkAddBtn.addEventListener('click', handleBulkAdd);
  }

  renderSchedules();
  startNotificationCheck();

  // 残り時間表示を30秒ごとに更新
  setInterval(() => {
    renderSchedules();
  }, 30000);

  // 外部からのスケジュール更新イベントをリッスン（音声入力など）
  window.addEventListener('schedules-updated', () => {
    console.log('[Schedule] スケジュール更新イベントを受信');
    // localStorageから最新のスケジュールを再読み込み
    schedules = JSON.parse(localStorage.getItem('schedules')) || [];
    renderSchedules();
    // 通知チェックを再起動（新しいスケジュールを認識させる）
    startNotificationCheck();
  });
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

  // クイック追加モード: タイトルと時刻のみクリア、フォーカスは時刻へ
  document.getElementById('title').value = '';
  document.getElementById('time').value = '';
  document.getElementById('time').focus();

  // 保存成功通知（サイレント版 - 連続登録時にうるさくならないように）
  // await window.electronAPI.sendNotification({
  //   title: SCHEDULE_MESSAGES.addTitle,
  //   body: SCHEDULE_MESSAGES.addBody(title)
  // });
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
  const now = new Date();
  const timeDiff = dateTime - now;
  const minutesLeft = Math.floor(timeDiff / 60000);

  // ステータス判定
  let status = '';
  let statusText = '';
  let statusIcon = '';

  if (timeDiff < 0) {
    // 過去
    div.classList.add('past');
    status = 'past';
    statusText = '終了';
    statusIcon = '✓';
  } else if (minutesLeft <= 5) {
    // 5分以内
    div.classList.add('in-progress');
    status = 'in-progress';
    statusText = `あと${minutesLeft}分`;
    statusIcon = '🔔';
  } else if (minutesLeft <= 30) {
    // 30分以内
    div.classList.add('upcoming');
    status = 'upcoming';
    statusText = `あと${minutesLeft}分`;
    statusIcon = '⏰';
  } else {
    // それ以上先
    div.classList.add('future');
    status = 'future';
    const hoursLeft = Math.floor(minutesLeft / 60);
    if (hoursLeft > 0) {
      statusText = `あと${hoursLeft}時間${minutesLeft % 60}分`;
    } else {
      statusText = `あと${minutesLeft}分`;
    }
    statusIcon = '📅';
  }

  // 通知状態
  const notificationStatus = schedule.startNotified ? '🔕' : (schedule.preNotified ? '🔔' : '');

  div.innerHTML = `
    <div class="schedule-header">
      <div class="schedule-title-area">
        <span class="schedule-status-icon">${statusIcon}</span>
        <h3>${schedule.title}</h3>
      </div>
      <button class="btn-delete" onclick="deleteSchedule(${schedule.id})">削除</button>
    </div>
    <div class="schedule-info">
      <div class="schedule-meta">
        <span class="schedule-datetime">🕐 ${schedule.time}</span>
        <span class="schedule-status ${status}">${statusText}</span>
        ${notificationStatus ? `<span class="notification-status">${notificationStatus}</span>` : ''}
      </div>
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

// スケジュール削除（グローバルスコープに公開）
window.deleteSchedule = function(id) {
  schedules = schedules.filter(s => s.id !== id);
  saveSchedules();
  renderSchedules();
};

// タブ切り替え設定
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // すべてのタブボタンとコンテンツから active を削除
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // クリックされたタブをアクティブに
      button.classList.add('active');
      const targetContent = document.querySelector(`[data-tab-content="${targetTab}"]`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// 一括追加処理
function handleBulkAdd() {
  const bulkInput = document.getElementById('bulkInput');
  const text = bulkInput.value.trim();

  if (!text) {
    alert('スケジュールを入力してください');
    return;
  }

  const lines = text.split('\n').filter(line => line.trim());
  const date = getTodayISODate();
  let addedCount = 0;
  let errorCount = 0;

  lines.forEach(line => {
    // 時刻とタイトルをパース（時刻 タイトル のフォーマット）
    const match = line.trim().match(/^(\d{1,2}):(\d{2})\s+(.+)$/);

    if (match) {
      const hours = match[1].padStart(2, '0');
      const minutes = match[2];
      const time = `${hours}:${minutes}`;
      const title = match[3].trim();

      const schedule = {
        id: Date.now() + addedCount, // ユニークIDを保証
        title,
        date,
        time,
        description: '',
        notified: false,
        preNotified: false,
        startNotified: false
      };

      schedules.push(schedule);
      addedCount++;
    } else {
      errorCount++;
      console.warn('パース失敗:', line);
    }
  });

  if (addedCount > 0) {
    saveSchedules();
    renderSchedules();
    bulkInput.value = '';
    alert(`${addedCount}件のスケジュールを追加しました${errorCount > 0 ? `\n（${errorCount}件のエラーをスキップ）` : ''}`);
  } else {
    alert('正しい形式で入力してください\n例: 10:00 朝会');
  }
}

/**
 * TTSキュー処理
 * 音声を順番に再生し、重複を防ぐ
 */
async function playTTS(text, options = {}) {
  ttsQueue.push({ text, options });
  if (!isTTSPlaying) {
    await processTTSQueue();
  }
}

async function processTTSQueue() {
  if (ttsQueue.length === 0) {
    isTTSPlaying = false;
    return;
  }

  isTTSPlaying = true;
  const { text, options } = ttsQueue.shift();

  try {
    if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
      const res = await window.electronAPI.speakText({
        text,
        engine: 'voicevox',
        options: {
          speakerId: options.speakerId || SCHEDULE_NOTIFICATION_SPEAKER_ID,
          speedScale: options.speedScale || 1.0
        }
      });

      if (res && res.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);

        // 再生終了後に次のキューを処理
        audio.onended = () => {
          processTTSQueue();
        };

        // エラー時も次へ進む
        audio.onerror = () => {
          processTTSQueue();
        };

        await audio.play();
      } else {
        // 音声生成失敗時は次へ
        processTTSQueue();
      }
    } else {
      processTTSQueue();
    }
  } catch (error) {
    console.error('TTS再生エラー:', error);
    processTTSQueue();
  }
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

      // 音声読み上げ（TTSキューに追加）
      await playTTS(
        `${SCHEDULE_NOTIFICATION_LEAD_MINUTES}分後に ${schedule.title} が始まります。`,
        { speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID, speedScale: 1.05 }
      );

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

      // 音声読み上げ（TTSキューに追加）
      await playTTS(
        `${schedule.title} の開始時刻です。`,
        { speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID, speedScale: 1.0 }
      );

      schedule.startNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      saveSchedules();
    }
  }
}
