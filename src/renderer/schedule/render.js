/**
 * スケジュール一覧の描画ロジックを担当するモジュール。
 * - DOM 操作を集約し、仮想DOMなしでも更新差分を最小化する。
 */
import { scheduleItems } from './dom.js';
import { formatRepeatLabel, formatDateWithWeekday } from './utils.js';

/**
 * スケジュールカードを再生成して DOM に反映する。
 * @param {object} params 描画に必要なパラメータ群
 */
export function renderSchedules({ schedules, occurrences, editingId, onEdit, onDelete }) {
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

  div.appendChild(header);
  div.appendChild(info);

  return div;
}
