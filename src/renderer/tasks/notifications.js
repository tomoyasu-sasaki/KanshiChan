/**
 * タスク通知関連の処理を管理するモジュール。
 */
import { taskState } from './state.js';

let taskNotificationInterval = null;
let notifiedTasks = new Set();

/**
 * タスク通知の初期化を行う。
 */
export function setupTaskNotifications() {
  const settings = loadNotificationSettings();
  if (!settings.enabled) return;

  checkTaskNotifications();
  taskNotificationInterval = setInterval(() => {
    checkTaskNotifications();
  }, 60 * 1000);
}

/**
 * 通知設定を読み込む。
 */
function loadNotificationSettings() {
  try {
    const raw = localStorage.getItem('tasks.notificationSettings');
    if (!raw) {
      return {
        enabled: true,
        startDateLeadMinutes: 60,
        overdueCheckEnabled: true,
        highPriorityReminderEnabled: true,
      };
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[Tasks] 通知設定の読み込みに失敗:', error);
    return {
      enabled: true,
      startDateLeadMinutes: 60,
      overdueCheckEnabled: true,
      highPriorityReminderEnabled: true,
    };
  }
}

/**
 * タスク通知をチェックする。
 */
async function checkTaskNotifications() {
  const now = Date.now();
  const settings = loadNotificationSettings();
  
  try {
    const res = await window.electronAPI.tasksList({});
    if (!res?.success || !Array.isArray(res.items)) return;
    
    const tasksList = res.items;

    // 開始日の事前通知
    if (settings.startDateLeadMinutes != null && settings.startDateLeadMinutes > 0) {
      const leadMs = settings.startDateLeadMinutes * 60 * 1000;
      tasksList.forEach((task) => {
        if (!task.startDate || task.status === 'done') return;
        const key = `start_${task.id}`;
        if (notifiedTasks.has(key)) return;
        const timeDiff = task.startDate - now;
        if (timeDiff > 0 && timeDiff <= leadMs) {
          notifiedTasks.add(key);
          window.electronAPI.sendNotification({
            title: `📅 タスクの開始予定`,
            body: `「${task.title}」が${settings.startDateLeadMinutes}分後に開始予定です`,
          }).catch((error) => {
            console.warn('[Tasks] 通知送信エラー:', error);
          });
        }
      });
    }

    // 期限切れタスクの警告
    if (settings.overdueCheckEnabled) {
      tasksList.forEach((task) => {
        if (!task.endDate || task.status === 'done') return;
        const key = `overdue_${task.id}`;
        if (notifiedTasks.has(key)) return;
        if (task.endDate < now) {
          notifiedTasks.add(key);
          window.electronAPI.sendNotification({
            title: `⚠️ 期限切れタスク`,
            body: `「${task.title}」の期限が過ぎています`,
          }).catch((error) => {
            console.warn('[Tasks] 通知送信エラー:', error);
          });
        }
      });
    }

    // 優先度高タスクの定期リマインダー
    if (settings.highPriorityReminderEnabled) {
      const highPriorityTasks = tasksList.filter(
        (task) => task.priority === 'high' && task.status !== 'done'
      );
      highPriorityTasks.forEach((task) => {
        const key = `reminder_${task.id}_${Math.floor(now / (4 * 60 * 60 * 1000))}`;
        if (notifiedTasks.has(key)) return;
        notifiedTasks.add(key);
        window.electronAPI.sendNotification({
          title: `🔔 優先度高タスク`,
          body: `「${task.title}」を進めていますか？`,
        }).catch((error) => {
          console.warn('[Tasks] 通知送信エラー:', error);
        });
      });
    }
  } catch (error) {
    console.error('[Tasks] 通知チェックエラー:', error);
  }
}

