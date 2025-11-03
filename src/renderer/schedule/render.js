/**
 * スケジュール一覧の描画ロジックを担当するモジュール。
 * - DOM 操作を集約し、仮想DOMなしでも更新差分を最小化する。
 */
import { scheduleItems } from './dom.js';
import { formatRepeatLabel, formatDateWithWeekday } from './utils.js';

// スケジュールIDごとのタスク一覧のキャッシュ
const tasksCache = new Map();

/**
 * スケジュールカードを再生成して DOM に反映する。
 * @param {object} params 描画に必要なパラメータ群
 */
export async function renderSchedules({ schedules, occurrences, editingId, onEdit, onDelete }) {
  if (!scheduleItems) {
    return;
  }

  scheduleItems.innerHTML = '';

  if (!Array.isArray(schedules) || schedules.length === 0) {
    scheduleItems.innerHTML = '<p class="empty-message">スケジュールがありません</p>';
    return;
  }

  const enriched = schedules
    .map((schedule) => ({
      schedule,
      occurrence: occurrences.get(schedule.id) ?? null,
    }))
    .filter(({ occurrence }) => occurrence && occurrence.dateTime);

  if (enriched.length === 0) {
    scheduleItems.innerHTML = '<p class="empty-message">スケジュールがありません</p>';
    return;
  }

  enriched.sort((a, b) => a.occurrence.dateTime - b.occurrence.dateTime);

  // タスク一覧を事前取得
  await loadTasksForSchedules(enriched.map((e) => e.schedule.id));

  enriched.forEach(({ schedule, occurrence }) => {
    scheduleItems.appendChild(createScheduleElement({
      schedule,
      occurrence,
      isEditing: schedule.id === editingId,
      onEdit,
      onDelete,
    }));
  });
}

/**
 * スケジュールIDのリストに対して紐付きタスクを取得してキャッシュに保存する。
 */
async function loadTasksForSchedules(scheduleIds) {
  if (!scheduleIds || scheduleIds.length === 0) {
    return;
  }

  try {
    if (window.electronAPI?.tasksList) {
      // 各スケジュールIDに対してタスクを取得
      const tasksPromises = scheduleIds.map(async (scheduleId) => {
        const response = await window.electronAPI.tasksList({ scheduleId });
        return {
          scheduleId,
          tasks: response?.success && Array.isArray(response.items) ? response.items : [],
        };
      });

      const results = await Promise.all(tasksPromises);
      results.forEach(({ scheduleId, tasks }) => {
        tasksCache.set(scheduleId, tasks);
      });
    }
  } catch (error) {
    console.warn('[Schedule] タスク取得エラー:', error);
  }
}

/**
 * タスクキャッシュをクリアする。
 */
export function clearTasksCache() {
  tasksCache.clear();
}

/**
 * 単一スケジュールのカード DOM を構築する。
 * @param {object} param0 描画に必要な情報
 * @returns {HTMLElement} スケジュールDOMノード
 */
function createScheduleElement({ schedule, occurrence, isEditing, onEdit, onDelete }) {
  const div = document.createElement('div');
  div.className = 'schedule-item';
  if (isEditing) {
    div.classList.add('editing');
  }

  const dateTime = occurrence?.dateTime ? new Date(occurrence.dateTime) : new Date(`${schedule.date}T${schedule.time}`);
  const now = new Date();
  const timeDiff = dateTime - now;
  const minutesLeft = Math.floor(timeDiff / 60000);

  let status = '';
  let statusText = '';
  let statusIcon = '';

  if (timeDiff < 0) {
    div.classList.add('past');
    status = 'past';
    statusText = '終了';
    statusIcon = '✓';
  } else if (minutesLeft <= 5) {
    div.classList.add('in-progress');
    status = 'in-progress';
    statusText = `あと${minutesLeft}分`;
    statusIcon = '🔔';
  } else if (minutesLeft <= 30) {
    div.classList.add('upcoming');
    status = 'upcoming';
    statusText = `あと${minutesLeft}分`;
    statusIcon = '⏰';
  } else {
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

  const notificationStatus = schedule.startNotified ? '🔕' : (schedule.preNotified ? '🔔' : '');
  const repeatLabel = schedule.repeat ? formatRepeatLabel(schedule.repeat) : '';
  const occurrenceKey = occurrence?.key || schedule.date;
  const occurrenceDateLabel = formatDateWithWeekday(occurrenceKey);

  const header = document.createElement('div');
  header.className = 'schedule-header';

  const titleArea = document.createElement('div');
  titleArea.className = 'schedule-title-area';
  titleArea.innerHTML = `
    <span class="schedule-status-icon">${statusIcon}</span>
    <h3>${schedule.title}</h3>
  `;

  const actions = document.createElement('div');
  actions.className = 'schedule-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit';
  if (isEditing) {
    editBtn.textContent = '編集中';
    editBtn.disabled = true;
  } else {
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => onEdit?.(schedule.id));
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete';
  deleteBtn.textContent = '削除';
  deleteBtn.addEventListener('click', () => onDelete?.(schedule.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  header.appendChild(titleArea);
  header.appendChild(actions);

  const info = document.createElement('div');
  info.className = 'schedule-info';

  const meta = document.createElement('div');
  meta.className = 'schedule-meta';
  meta.innerHTML = `
    <span class="schedule-datetime">🗓 ${occurrenceDateLabel} / 🕐 ${schedule.time}</span>
    <span class="schedule-status ${status}">${statusText}</span>
    ${notificationStatus ? `<span class="notification-status">${notificationStatus}</span>` : ''}
  `;

  info.appendChild(meta);

  if (schedule.description) {
    const descriptionEl = document.createElement('p');
    descriptionEl.className = 'schedule-description';
    descriptionEl.textContent = schedule.description;
    info.appendChild(descriptionEl);
  }

  if (repeatLabel) {
    const repeatEl = document.createElement('p');
    repeatEl.className = 'schedule-repeat';
    repeatEl.textContent = repeatLabel;
    info.appendChild(repeatEl);
  }

  // 紐付きタスク一覧を表示
  const linkedTasks = tasksCache.get(schedule.id) || [];
  if (linkedTasks.length > 0) {
    const tasksSection = document.createElement('div');
    tasksSection.className = 'schedule-linked-tasks';
    const tasksHeader = document.createElement('div');
    tasksHeader.className = 'schedule-linked-tasks-header';
    tasksHeader.textContent = `📋 関連タスク (${linkedTasks.length})`;
    tasksSection.appendChild(tasksHeader);

    const tasksList = document.createElement('ul');
    tasksList.className = 'schedule-linked-tasks-list';
    linkedTasks.slice(0, 5).forEach((task) => {
      const taskItem = document.createElement('li');
      taskItem.className = `schedule-linked-task-item status-${task.status || 'todo'}`;
      
      const taskTitle = document.createElement('span');
      taskTitle.className = 'schedule-linked-task-title';
      taskTitle.textContent = task.title || 'タスク';
      
      const taskStatus = document.createElement('span');
      taskStatus.className = 'schedule-linked-task-status';
      const statusLabels = { todo: '未着手', in_progress: '進行中', done: '完了' };
      taskStatus.textContent = statusLabels[task.status] || '未着手';
      
      taskItem.appendChild(taskTitle);
      taskItem.appendChild(taskStatus);
      tasksList.appendChild(taskItem);
    });

    if (linkedTasks.length > 5) {
      const moreItem = document.createElement('li');
      moreItem.className = 'schedule-linked-task-more';
      moreItem.textContent = `他 ${linkedTasks.length - 5} 件...`;
      tasksList.appendChild(moreItem);
    }

    tasksSection.appendChild(tasksList);
    info.appendChild(tasksSection);
  }

  div.appendChild(header);
  div.appendChild(info);

  return div;
}
