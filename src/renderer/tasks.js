import { scheduleState } from './schedule/state.js';
import { AudioInputControl } from './components/audio-input-control.js';
import { queueVoicevoxSpeech } from './services/tts-adapter.js';

let tasks = [];
let lastAnnouncedDate = null;

document.addEventListener('DOMContentLoaded', () => {
  setupForm();
  setupVoice();
  setupFilters();
  populateScheduleOptions();
  loadTasks();
  scheduleDailyAnnouncement();
});

function getEls() {
  return {
    form: document.getElementById('taskForm'),
    id: document.getElementById('taskId'),
    title: document.getElementById('taskTitle'),
    description: document.getElementById('taskDescription'),
    priority: document.getElementById('taskPriority'),
    status: document.getElementById('taskStatus'),
    startDate: document.getElementById('taskStartDate'),
    endDate: document.getElementById('taskEndDate'),
    scheduleId: document.getElementById('taskScheduleId'),
    submitBtn: document.getElementById('taskSubmitBtn'),
    cancelEditBtn: document.getElementById('taskCancelEditBtn'),
    items: document.getElementById('tasksItems'),
    showOnlyActive: document.getElementById('tasksShowOnlyActive'),
    hideDone: document.getElementById('tasksHideDone'),
    voiceMsg: document.getElementById('tasksVoiceMessage'),
  };
}

async function loadTasks() {
  try {
    const { showOnlyActive, hideDone } = getEls();
    const filter = {};
    if (showOnlyActive?.checked) filter.activeAt = Date.now();
    const res = await window.electronAPI.tasksList(filter);
    if (!res?.success) throw new Error(res?.error || 'tasksList 失敗');
    tasks = Array.isArray(res.items) ? res.items : [];
    if (hideDone?.checked) {
      tasks = tasks.filter((t) => t.status !== 'done');
    }
    renderList();
  } catch (error) {
    console.error('[Tasks] 読み込みエラー:', error);
  }
}

function renderList() {
  const { items } = getEls();
  if (!items) return;
  items.innerHTML = '';
  if (tasks.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'タスクはありません';
    items.appendChild(li);
    return;
  }
  tasks.forEach((task) => items.appendChild(renderTaskItem(task)));
}

function renderTaskItem(task) {
  const div = document.createElement('div');
  div.className = 'task-item';
  div.classList.add(`priority-${task.priority}`);
  div.classList.add(`status-${task.status}`);

  const header = document.createElement('div');
  header.className = 'task-item-header';

  const titleArea = document.createElement('div');
  titleArea.className = 'task-item-title-area';
  const statusIcon = getStatusIcon(task.status);
  const titleEl = document.createElement('h4');
  titleEl.textContent = task.title;
  titleArea.innerHTML = `<span class="task-status-icon">${statusIcon}</span>`;
  titleArea.appendChild(titleEl);

  const actions = document.createElement('div');
  actions.className = 'task-item-actions';
  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit';
  editBtn.textContent = '編集';
  editBtn.addEventListener('click', () => startEdit(task));
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-delete';
  delBtn.textContent = '削除';
  delBtn.addEventListener('click', () => deleteTask(task.id));
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  header.appendChild(titleArea);
  header.appendChild(actions);

  const info = document.createElement('div');
  info.className = 'task-item-info';

  const meta = document.createElement('div');
  meta.className = 'task-item-meta';
  meta.innerHTML = [
    `<span class="badge priority-${task.priority}">${priorityJa(task.priority)}</span>`,
    `<span class="badge status-${task.status}">${statusJa(task.status)}</span>`,
    formatPeriodBadge(task.startDate, task.endDate),
  ].filter(Boolean).join('');

  info.appendChild(meta);

  if (task.description) {
    const descEl = document.createElement('p');
    descEl.className = 'task-item-description';
    descEl.textContent = task.description;
    info.appendChild(descEl);
  }

  div.appendChild(header);
  div.appendChild(info);
  return div;
}

function getStatusIcon(status) {
  switch (status) {
    case 'done': return '✓';
    case 'in_progress': return '▶';
    case 'todo': return '○';
    default: return '○';
  }
}

function formatPeriodBadge(start, end) {
  if (!start && !end) return '';
  const s = start ? formatDateLabel(start) : '—';
  const e = end ? formatDateLabel(end) : '—';
  return `<span class="task-item-period">📅 ${s} 〜 ${e}</span>`;
}

function formatDateLabel(ms) {
  try {
    const d = new Date(Number(ms));
    if (Number.isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}`;
  } catch { return ''; }
}

function toDateInput(ms) {
  try {
    const d = new Date(Number(ms));
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}

function setupForm() {
  const { form, cancelEditBtn } = getEls();
  if (!form) return;
  form.addEventListener('submit', onSubmitForm);
  cancelEditBtn?.addEventListener('click', exitEdit);
}

async function onSubmitForm(e) {
  e.preventDefault();
  const { id, title, description, priority, status, startDate, endDate, scheduleId, submitBtn } = getEls();
  const payload = {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    priority: priority.value,
    status: status.value,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
    scheduleId: scheduleId.value ? Number(scheduleId.value) : undefined,
  };
  submitBtn.disabled = true;
  try {
    if (id.value) {
      const res = await window.electronAPI.tasksUpdate(Number(id.value), payload);
      if (!res?.success) throw new Error(res?.error || '更新に失敗しました');
    } else {
      const res = await window.electronAPI.tasksCreate(payload);
      if (!res?.success) throw new Error(res?.error || '追加に失敗しました');
    }
    exitEdit();
    await loadTasks();
  } catch (error) {
    console.error('[Tasks] 送信エラー:', error);
  } finally {
    submitBtn.disabled = false;
  }
}

function startEdit(task) {
  const { id, title, description, priority, status, startDate, endDate, scheduleId, submitBtn, cancelEditBtn } = getEls();
  id.value = String(task.id);
  title.value = task.title || '';
  description.value = task.description || '';
  priority.value = task.priority || 'medium';
  status.value = task.status || 'todo';
  startDate.value = task.startDate ? toDateInput(task.startDate) : '';
  endDate.value = task.endDate ? toDateInput(task.endDate) : '';
  scheduleId.value = task.scheduleId != null ? String(task.scheduleId) : '';
  submitBtn.textContent = '更新';
  cancelEditBtn.hidden = false;
}

function exitEdit() {
  const { id, title, description, priority, status, startDate, endDate, scheduleId, submitBtn, cancelEditBtn } = getEls();
  id.value = '';
  title.value = '';
  description.value = '';
  priority.value = 'medium';
  status.value = 'todo';
  startDate.value = '';
  endDate.value = '';
  scheduleId.value = '';
  submitBtn.textContent = '追加';
  cancelEditBtn.hidden = true;
}

async function deleteTask(id) {
  if (!confirm('このタスクを削除しますか？')) return;
  try {
    const res = await window.electronAPI.tasksDelete(Number(id));
    if (!res?.success) throw new Error(res?.error || '削除に失敗しました');
    await loadTasks();
  } catch (error) {
    console.error('[Tasks] 削除エラー:', error);
  }
}

function setupFilters() {
  const { showOnlyActive, hideDone } = getEls();
  showOnlyActive?.addEventListener('change', loadTasks);
  hideDone?.addEventListener('change', loadTasks);
}

function populateScheduleOptions() {
  const { scheduleId } = getEls();
  if (!scheduleId) return;
  // 直近ロード済みの scheduleState から簡易でリスト化
  const items = (scheduleState.schedules || []).slice();
  items.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  items.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = String(s.id);
    opt.textContent = s.title || `予定 ${s.id}`;
    scheduleId.appendChild(opt);
  });
}

function setupVoice() {
  const root = document.getElementById('tasksVoiceControl');
  const { voiceMsg } = getEls();
  if (!root) return;
  new AudioInputControl(root, {
    promptProfile: 'tasks',
    contextId: 'tasks-dialog',
    title: '音声でタスク操作',
    description: '例:「新しいタスク」「ステータスを完了に」',
    metadata: () => ({
      tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
      schedules: (scheduleState.schedules || []).map((s) => ({ id: s.id, title: s.title })),
    }),
    onResult: async (result) => {
      try {
        if (!result || !Array.isArray(result.commands)) {
          voiceMsg.textContent = '操作を抽出できませんでした。';
          return;
        }
        for (const cmd of result.commands) {
          await applyVoiceCommand(cmd);
        }
        voiceMsg.textContent = '音声コマンドを適用しました。';
        await loadTasks();
      } catch (error) {
        console.error('[Tasks] 音声コマンド適用エラー:', error);
        voiceMsg.textContent = '音声コマンドの適用に失敗しました。';
      }
    },
    onError: (err) => {
      console.warn('[Tasks] 音声入力エラー:', err);
      voiceMsg.textContent = '音声入力に失敗しました。';
    },
  });
}

async function applyVoiceCommand(cmd) {
  const { action, id, title, description, priority, status, startDate, endDate, scheduleId } = cmd || {};
  switch (action) {
    case 'create':
      await window.electronAPI.tasksCreate({ title, description, priority, status, startDate, endDate, scheduleId });
      break;
    case 'update':
      if (!id) return;
      await window.electronAPI.tasksUpdate(id, { title, description, priority, status, startDate, endDate, scheduleId });
      break;
    case 'delete':
      if (!id) return;
      await window.electronAPI.tasksDelete(id);
      break;
    case 'complete':
      if (!id) return;
      await window.electronAPI.tasksUpdate(id, { status: 'done' });
      break;
    case 'start':
      if (!id) return;
      await window.electronAPI.tasksUpdate(id, { status: 'in_progress' });
      break;
    default:
      break;
  }
}

function scheduleDailyAnnouncement() {
  try {
    const key = 'tasks.lastAnnouncedDate';
    lastAnnouncedDate = localStorage.getItem(key) || null;

    const now = new Date();
    const next = new Date(now);
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
      await announceTasks(Date.now());
      localStorage.setItem(key, new Date().toDateString());
      setInterval(() => announceTasks(Date.now()), 24 * 60 * 60 * 1000);
    }, Math.max(0, delay));
  } catch (error) {
    console.warn('[Tasks] 9時アナウンスの設定に失敗しました:', error);
  }
}

async function announceTasks(referenceTime) {
  try {
    const todayKey = new Date(referenceTime).toDateString();
    const key = 'tasks.lastAnnouncedDate';
    if (localStorage.getItem(key) === todayKey) {
      // 同日の重複読み上げを避ける
      return;
    }
    const res = await window.electronAPI.tasksList({ activeAt: referenceTime });
    if (!res?.success) return;
    const list = Array.isArray(res.items) ? res.items : [];
    if (list.length === 0) return;

    const lines = [];
    const counts = { low: 0, medium: 0, high: 0 };
    list.forEach((t) => { if (counts[t.priority] != null) counts[t.priority] += 1; });
    lines.push(`期間中のタスクは${list.length}件です。`);
    const breakdown = [];
    if (counts.high) breakdown.push(`高${counts.high}件`);
    if (counts.medium) breakdown.push(`中${counts.medium}件`);
    if (counts.low) breakdown.push(`低${counts.low}件`);
    if (breakdown.length) lines.push(`内訳は、${breakdown.join('、')}です。`);
    list.slice(0, 20).forEach((t) => {
      lines.push(`${t.title}、優先度${priorityJa(t.priority)}、ステータス${statusJa(t.status)}。`);
    });
    const text = lines.join('\n');
    await queueVoicevoxSpeech(text, { speedScale: 1.05 });
    localStorage.setItem(key, todayKey);
  } catch (error) {
    console.error('[Tasks] 読み上げエラー:', error);
  }
}

function priorityJa(p) { return p === 'high' ? '高' : p === 'low' ? '低' : '中'; }
function statusJa(s) { return s === 'done' ? '完了' : s === 'in_progress' ? '進行中' : '未着手'; }

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


