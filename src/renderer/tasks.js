import { scheduleState } from './schedule/state.js';
import { AudioInputControl } from './components/audio-input-control.js';
import { queueVoicevoxSpeech } from './services/tts-adapter.js';

let tasks = [];
let tagOptions = [];
let tagFilters = new Set();
let lastAnnouncedDate = null;
let dragState = null;
let scheduleOptionsCache = [];

const DEFAULT_READING_SETTINGS = {
  time: '09:00',
  includeStatuses: ['todo', 'in_progress'],
  includeTags: [],
  priorityMode: 'grouped',
};

let readingSettings = loadReadingSettings();
let announcementHandles = { timeoutId: null, intervalId: null };

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

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
    parentId: document.getElementById('taskParentId'),
    tagsInput: document.getElementById('taskTagsInput'),
    repeatType: document.getElementById('taskRepeatType'),
    repeatInterval: document.getElementById('taskRepeatInterval'),
    repeatWeekdayContainer: document.getElementById('taskRepeatWeekdays'),
    repeatWeekdayInputs: document.querySelectorAll('#taskRepeatWeekdays input[type="checkbox"]'),
    submitBtn: document.getElementById('taskSubmitBtn'),
    cancelEditBtn: document.getElementById('taskCancelEditBtn'),
    items: document.getElementById('tasksItems'),
    showOnlyActive: document.getElementById('tasksShowOnlyActive'),
    hideDone: document.getElementById('tasksHideDone'),
    voiceMsg: document.getElementById('tasksVoiceMessage'),
    tagFilterContainer: document.getElementById('tasksTagFilters'),
  };
}

function loadReadingSettings() {
  try {
    const raw = localStorage.getItem('tasks.readingSettings');
    if (!raw) {
      return { ...DEFAULT_READING_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_READING_SETTINGS,
      ...(parsed || {}),
      includeStatuses: Array.isArray(parsed?.includeStatuses) && parsed.includeStatuses.length
        ? parsed.includeStatuses.filter((status) => ['todo', 'in_progress', 'done'].includes(status))
        : [...DEFAULT_READING_SETTINGS.includeStatuses],
      includeTags: Array.isArray(parsed?.includeTags) ? parsed.includeTags : [],
      priorityMode: typeof parsed?.priorityMode === 'string' ? parsed.priorityMode : DEFAULT_READING_SETTINGS.priorityMode,
    };
  } catch (error) {
    console.warn('[Tasks] 読み上げ設定の読み込みに失敗:', error);
    return { ...DEFAULT_READING_SETTINGS };
  }
}

function saveReadingSettings(nextSettings) {
  readingSettings = {
    ...DEFAULT_READING_SETTINGS,
    ...nextSettings,
    includeStatuses: Array.isArray(nextSettings?.includeStatuses) && nextSettings.includeStatuses.length
      ? nextSettings.includeStatuses
      : [...DEFAULT_READING_SETTINGS.includeStatuses],
    includeTags: Array.isArray(nextSettings?.includeTags) ? nextSettings.includeTags : [],
  };
  localStorage.setItem('tasks.readingSettings', JSON.stringify(readingSettings));
  setupAnnouncementTimer();
}

document.addEventListener('DOMContentLoaded', () => {
  setupForm();
  setupFilters();
  setupRepeatControls();
  setupVoice();
  void loadScheduleOptions();
  renderReadingSettingsUI();
  void loadTagOptions();
  void loadTasks();
  scheduleDailyAnnouncement();
  registerScheduleListeners();
});

function setupForm() {
  const { form, cancelEditBtn } = getEls();
  if (!form) return;
  form.addEventListener('submit', onSubmitForm);
  cancelEditBtn?.addEventListener('click', exitEdit);
}

function setupFilters() {
  const { showOnlyActive, hideDone } = getEls();
  showOnlyActive?.addEventListener('change', () => loadTasks());
  hideDone?.addEventListener('change', renderList);
}

function setupRepeatControls() {
  const { repeatType, repeatWeekdayContainer } = getEls();
  if (!repeatType) return;
  const toggleVisibility = () => {
    repeatWeekdayContainer.style.display = repeatType.value === 'weekly' ? 'flex' : 'none';
  };
  repeatType.addEventListener('change', toggleVisibility);
  toggleVisibility();
}

async function loadTagOptions() {
  try {
    const res = await window.electronAPI.tasksTagsList();
    if (!res?.success) throw new Error(res?.error || 'タグ取得に失敗しました');
    tagOptions = Array.isArray(res.items) ? res.items : [];
    renderTagFilters();
    renderReadingSettingsUI();
  } catch (error) {
    console.error('[Tasks] タグロードエラー:', error);
    tagOptions = [];
    renderTagFilters();
    renderReadingSettingsUI();
  }
}

function renderTagFilters() {
  const { tagFilterContainer } = getEls();
  if (!tagFilterContainer) return;
  tagFilterContainer.innerHTML = '';
  if (!tagOptions.length) {
    tagFilterContainer.innerHTML = '<span class="tag-filter-empty">タグ未登録</span>';
    return;
  }
  tagOptions.forEach((tag) => {
    const label = document.createElement('label');
    label.className = 'tag-filter-item';
    label.style.setProperty('--tag-color', tag.color);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = tag.name;
    input.checked = tagFilters.has(tag.name);
    input.addEventListener('change', () => {
      if (input.checked) tagFilters.add(tag.name); else tagFilters.delete(tag.name);
      loadTasks();
    });
    label.appendChild(input);
    const badge = document.createElement('span');
    badge.className = 'tag-filter-badge';
    badge.textContent = tag.name;
    label.appendChild(badge);
    tagFilterContainer.appendChild(label);
  });
}

function renderReadingSettingsUI() {
  const container = document.getElementById('tasksReadingSettings');
  if (!container) return;
  container.innerHTML = '';

  const heading = document.createElement('h4');
  heading.textContent = '読み上げ設定';
  heading.className = 'reading-heading';
  container.appendChild(heading);

  const timeRow = document.createElement('div');
  timeRow.className = 'reading-row';
  const timeLabel = document.createElement('label');
  timeLabel.textContent = '読み上げ時刻';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = readingSettings.time || DEFAULT_READING_SETTINGS.time;
  timeInput.addEventListener('change', () => {
    const nextTime = timeInput.value || DEFAULT_READING_SETTINGS.time;
    saveReadingSettings({ ...readingSettings, time: nextTime });
  });
  timeRow.append(timeLabel, timeInput);
  container.appendChild(timeRow);

  const statusRow = document.createElement('div');
  statusRow.className = 'reading-statuses';
  ['todo', 'in_progress', 'done'].forEach((status) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = readingSettings.includeStatuses.includes(status);
    input.addEventListener('change', () => {
      const next = new Set(readingSettings.includeStatuses);
      if (input.checked) {
        next.add(status);
      } else {
        next.delete(status);
      }
      const nextArray = Array.from(next);
      if (nextArray.length === 0) {
        nextArray.push('todo', 'in_progress');
      }
      saveReadingSettings({ ...readingSettings, includeStatuses: nextArray });
      renderReadingSettingsUI();
    });
    const text = document.createElement('span');
    text.textContent = statusJa(status);
    label.appendChild(input);
    label.appendChild(text);
    statusRow.appendChild(label);
  });
  container.appendChild(statusRow);

  const tagsRow = document.createElement('div');
  tagsRow.className = 'reading-tags';
  if (!tagOptions.length) {
    const span = document.createElement('span');
    span.className = 'tag-filter-empty';
    span.textContent = '読み上げ対象タグ: なし';
    tagsRow.appendChild(span);
  } else {
    tagOptions.forEach((tag) => {
      const label = document.createElement('label');
      label.style.setProperty('--tag-color', tag.color);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = readingSettings.includeTags.includes(tag.name);
      input.addEventListener('change', () => {
        const next = new Set(readingSettings.includeTags);
        if (input.checked) next.add(tag.name); else next.delete(tag.name);
        saveReadingSettings({ ...readingSettings, includeTags: Array.from(next) });
        renderReadingSettingsUI();
      });
      const text = document.createElement('span');
      text.textContent = tag.name;
      label.append(input, text);
      tagsRow.appendChild(label);
    });
  }
  container.appendChild(tagsRow);

  const priorityRow = document.createElement('div');
  priorityRow.className = 'reading-row';
  const priorityLabel = document.createElement('label');
  priorityLabel.textContent = '読み上げスタイル';
  const prioritySelect = document.createElement('select');
  [
    { value: 'grouped', label: '優先度別に強調' },
    { value: 'flat', label: 'すべて同じスタイル' },
  ].forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === (readingSettings.priorityMode || 'grouped')) {
      opt.selected = true;
    }
    prioritySelect.appendChild(opt);
  });
  prioritySelect.addEventListener('change', () => {
    saveReadingSettings({ ...readingSettings, priorityMode: prioritySelect.value });
  });
  priorityRow.append(priorityLabel, prioritySelect);
  container.appendChild(priorityRow);
}

function clearAnnouncementTimers() {
  if (announcementHandles.timeoutId) {
    clearTimeout(announcementHandles.timeoutId);
  }
  if (announcementHandles.intervalId) {
    clearInterval(announcementHandles.intervalId);
  }
  announcementHandles = { timeoutId: null, intervalId: null };
}

function setupAnnouncementTimer() {
  clearAnnouncementTimers();
  try {
    const key = 'tasks.lastAnnouncedDate';
    lastAnnouncedDate = localStorage.getItem(key) || null;
    const time = readingSettings.time || DEFAULT_READING_SETTINGS.time;
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const now = new Date();
    const next = new Date(now);
    next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    announcementHandles.timeoutId = setTimeout(async () => {
      await announceTasks(Date.now(), { force: true });
      announcementHandles.intervalId = setInterval(() => announceTasks(Date.now()), 24 * 60 * 60 * 1000);
    }, Math.max(0, delay));
  } catch (error) {
    console.warn('[Tasks] 読み上げタイマー設定に失敗:', error);
  }
}

async function loadTasks() {
  const { showOnlyActive } = getEls();
  try {
    const filter = {};
    if (showOnlyActive?.checked) {
      filter.activeAt = Date.now();
    }
    if (tagFilters.size > 0) {
      filter.tags = Array.from(tagFilters);
    }
    const res = await window.electronAPI.tasksList(filter);
    console.debug('[Tasks] loadTasks filter', filter, 'response', res);
    if (!res?.success) throw new Error(res?.error || 'tasksList 失敗');
    tasks = Array.isArray(res.items) ? res.items : [];
    console.debug('[Tasks] mapped tasks', tasks);
    populateParentOptions();
    renderList();
  } catch (error) {
    console.error('[Tasks] 読み込みエラー:', error);
    tasks = [];
    renderList();
  }
}

function registerScheduleListeners() {
  window.addEventListener('schedules-updated', () => {
    void loadScheduleOptions(true);
  });
  window.addEventListener('schedule-renderer-updated', () => {
    void loadScheduleOptions(true);
  });
}

async function loadScheduleOptions(forceRefresh = false) {
  const { scheduleId } = getEls();
  if (!scheduleId) return;

  let schedules = Array.isArray(scheduleState.schedules) ? scheduleState.schedules.slice() : [];

  if ((forceRefresh || schedules.length === 0) && window.electronAPI?.schedulesList) {
    try {
      const response = await window.electronAPI.schedulesList();
      if (response?.success && Array.isArray(response.items)) {
        schedules = response.items;
      } else if (response?.error) {
        console.warn('[Tasks] schedulesList error:', response.error);
      }
    } catch (error) {
      console.warn('[Tasks] スケジュール一覧の取得に失敗:', error);
    }
  }

  const uniqueById = new Map();
  schedules.forEach((entry) => {
    if (!entry || entry.id == null) return;
    const normalizedTitle = typeof entry.title === 'string' && entry.title.trim().length > 0
      ? entry.title.trim()
      : `予定 ${entry.id}`;
    uniqueById.set(Number(entry.id), { id: Number(entry.id), title: normalizedTitle });
  });

  scheduleOptionsCache = Array.from(uniqueById.values()).sort((a, b) => a.title.localeCompare(b.title));

  const selectedValue = scheduleId.value;
  scheduleId.innerHTML = '<option value=\"\">未指定</option>';
  scheduleOptionsCache.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = String(option.id);
    opt.textContent = option.title;
    scheduleId.appendChild(opt);
  });
  if (selectedValue && scheduleId.querySelector(`option[value=\"${selectedValue}\"]`)) {
    scheduleId.value = selectedValue;
  }
}

function populateParentOptions(excludeId = null) {
  const { parentId } = getEls();
  if (!parentId) return;
  const prev = parentId.value;
  parentId.innerHTML = '<option value="">未指定</option>';
  // 親候補はルート（親なし）タスクのみ。孫タスクを禁止するため
  const candidates = tasks
    .filter((task) => task.id !== excludeId && (task.parentTaskId ?? null) === null)
    .sort((a, b) => {
      const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  candidates.forEach((task) => {
    const option = document.createElement('option');
    option.value = String(task.id);
    option.textContent = task.title;
    parentId.appendChild(option);
  });
  if (prev && parentId.querySelector(`option[value="${prev}"]`)) {
    parentId.value = prev;
  }
}

function flattenHierarchyLabel(root) {
  const result = [{ id: root.id, label: root.label }];
  root.children?.forEach((child) => {
    result.push(...flattenHierarchyLabel(child));
  });
  return result;
}

function buildHierarchy(list) {
  const nodes = list.map((task) => ({ ...task, children: [] }));
  const map = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];
  nodes.forEach((node) => {
    const parentId = node.parentTaskId;
    if (parentId != null && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (arr, depth = 0) => {
    arr.sort((a, b) => {
      const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
    arr.forEach((node) => {
      node.label = `${' '.repeat(depth)}${depth > 0 ? '┗ ' : ''}${node.title}`;
      sortNodes(node.children, depth + 1);
    });
  };
  sortNodes(roots, 0);
  return roots;
}

function buildTaskTreeForRender(sourceTasks) {
  const nodes = (sourceTasks || tasks).map((task) => ({ ...task, children: [] }));
  const map = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];
  nodes.forEach((node) => {
    const parentId = node.parentTaskId;
    if (parentId != null && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (arr) => {
    arr.sort((a, b) => {
      const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
    arr.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function renderList() {
  const { items, hideDone } = getEls();
  if (!items) return;
  items.innerHTML = '';
  let visibleTasks = tasks.slice();
  if (hideDone?.checked) {
    visibleTasks = visibleTasks.filter((t) => t.status !== 'done');
  }
  console.debug('[Tasks] renderList total', tasks.length, 'visible', visibleTasks.length);
  if (visibleTasks.length === 0) {
    const li = document.createElement('div');
    li.className = 'task-empty';
    li.textContent = 'タスクはありません';
    items.appendChild(li);
    return;
  }
  const tree = buildTaskTreeForRender(visibleTasks);
  tree.forEach((task) => items.appendChild(renderTaskItem(task, 0)));
}

function renderTaskItem(task, depth) {
  const container = document.createElement('div');
  container.className = 'task-item';
  container.classList.add(`priority-${task.priority}`);
  container.classList.add(`status-${task.status}`);
  container.dataset.taskId = String(task.id);
  container.dataset.parentId = task.parentTaskId != null ? String(task.parentTaskId) : '';
  container.dataset.displayOrder = String(task.displayOrder ?? '');
  container.setAttribute('draggable', 'true');

  const header = document.createElement('div');
  header.className = 'task-item-header';
  const titleArea = document.createElement('div');
  titleArea.className = 'task-item-title-area';
  titleArea.style.setProperty('--task-depth', depth);
  const statusIcon = document.createElement('span');
  statusIcon.className = `task-status-icon status-${task.status}`;
  statusIcon.textContent = getStatusIcon(task.status);
  titleArea.appendChild(statusIcon);
  const titleEl = document.createElement('h4');
  titleEl.textContent = task.title;
  titleArea.appendChild(titleEl);
  header.appendChild(titleArea);

  const metaLine = document.createElement('div');
  metaLine.className = 'task-item-meta';
  metaLine.appendChild(createPriorityBadge(task.priority));
  metaLine.appendChild(createStatusBadge(task.status));
  const period = formatPeriodBadge(task.startDate, task.endDate);
  if (period) {
    const span = document.createElement('span');
    span.className = 'task-item-period';
    span.textContent = period;
    metaLine.appendChild(span);
  }
  if (task.repeatConfig) {
    const repeatBadge = document.createElement('span');
    repeatBadge.className = 'task-repeat-badge';
    repeatBadge.textContent = formatRepeatLabel(task.repeatConfig);
    metaLine.appendChild(repeatBadge);
  }
  header.appendChild(metaLine);

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
  // 孫タスク禁止: ルート（depth===0）のみサブタスク追加ボタンを表示
  if (depth === 0) {
    const subtaskBtn = document.createElement('button');
    subtaskBtn.className = 'btn-subtask';
    subtaskBtn.textContent = 'サブタスク';
    subtaskBtn.addEventListener('click', () => startSubtask(task));
    actions.append(editBtn, subtaskBtn, delBtn);
  } else {
    actions.append(editBtn, delBtn);
  }
  header.appendChild(actions);
  container.appendChild(header);

  if (Array.isArray(task.tags) && task.tags.length > 0) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'task-tags';
    task.tags.forEach((tag) => {
      const badge = document.createElement('span');
      badge.className = 'task-tag-badge';
      badge.textContent = tag.name;
      badge.style.setProperty('--tag-color', tag.color);
      tagsWrap.appendChild(badge);
    });
    container.appendChild(tagsWrap);
  }

  if (task.description) {
    const descEl = document.createElement('p');
    descEl.className = 'task-item-description';
    descEl.textContent = task.description;
    container.appendChild(descEl);
  }

  if (task.children && task.children.length > 0) {
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'task-children';
    task.children.forEach((child) => {
      childrenWrap.appendChild(renderTaskItem(child, depth + 1));
    });
    container.appendChild(childrenWrap);
  }

  bindDragEvents(container);
  return container;
}

function bindDragEvents(element) {
  element.addEventListener('dragstart', (event) => {
    const taskId = Number(element.dataset.taskId);
    dragState = {
      taskId,
      parentId: element.dataset.parentId ? Number(element.dataset.parentId) : null,
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(taskId));
    element.classList.add('dragging');
  });
  element.addEventListener('dragover', (event) => {
    if (!dragState) return;
    const targetParent = element.dataset.parentId ? Number(element.dataset.parentId) : null;
    if (dragState.parentId !== targetParent) return;
    event.preventDefault();
    element.classList.add('drag-over');
  });
  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over');
  });
  element.addEventListener('drop', async (event) => {
    if (!dragState) return;
    const targetParent = element.dataset.parentId ? Number(element.dataset.parentId) : null;
    if (dragState.parentId !== targetParent) return;
    const targetId = Number(element.dataset.taskId);
    const draggedId = dragState.taskId;
    if (draggedId === targetId) return;
    element.classList.remove('drag-over');
    event.preventDefault();
    try {
      await reorderWithinParent(targetParent, draggedId, targetId, event.offsetY, element.offsetHeight);
      dragState = null;
    } catch (error) {
      console.error('[Tasks] 並び替えエラー:', error);
    }
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
    element.classList.remove('drag-over');
    dragState = null;
  });
}

async function reorderWithinParent(parentId, draggedId, targetId, offsetY, targetHeight) {
  const siblings = tasks
    .filter((task) => (task.parentTaskId ?? null) === (parentId ?? null))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const draggedIndex = siblings.findIndex((task) => task.id === draggedId);
  const targetIndex = siblings.findIndex((task) => task.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return;
  }
  const [draggedTask] = siblings.splice(draggedIndex, 1);
  const insertBefore = offsetY < targetHeight / 2;
  const newIndex = insertBefore ? targetIndex : targetIndex + (draggedIndex < targetIndex ? 0 : 1);
  siblings.splice(newIndex, 0, draggedTask);
  const updates = siblings.map((task, index) => ({
    id: task.id,
    displayOrder: (index + 1) * 1000,
    parentTaskId: parentId,
  }));
  const res = await window.electronAPI.tasksReorder(updates);
  if (!res?.success) {
    throw new Error(res?.error || '並び替え更新に失敗しました');
  }
  await loadTasks();
}

function createPriorityBadge(priority) {
  const span = document.createElement('span');
  span.className = `badge priority-${priority}`;
  span.textContent = priorityJa(priority);
  return span;
}

function createStatusBadge(status) {
  const span = document.createElement('span');
  span.className = `badge status-${status}`;
  span.textContent = statusJa(status);
  return span;
}

function getStatusIcon(status) {
  switch (status) {
    case 'done': return '✓';
    case 'in_progress': return '▶';
    case 'todo':
    default: return '○';
  }
}

function formatPeriodBadge(start, end) {
  if (!start && !end) return '';
  const s = start ? formatDateLabel(start) : '—';
  const e = end ? formatDateLabel(end) : '—';
  return `${s} 〜 ${e}`;
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

function parseTagsInput(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, arr) => item && arr.indexOf(item) === index);
}

function gatherRepeatConfig() {
  const { repeatType, repeatInterval, repeatWeekdayInputs } = getEls();
  if (!repeatType || repeatType.value === 'none') {
    return null;
  }
  const interval = Number(repeatInterval?.value || '1');
  const base = { type: repeatType.value, interval: Number.isInteger(interval) && interval > 0 ? interval : 1 };
  if (repeatType.value === 'weekly') {
    const days = Array.from(repeatWeekdayInputs || [])
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((value) => Number.isInteger(value));
    if (days.length === 0) {
      return null;
    }
    return { ...base, weekdays: days };
  }
  return base;
}

function populateRepeatFields(repeatConfig) {
  const { repeatType, repeatInterval, repeatWeekdayInputs, repeatWeekdayContainer } = getEls();
  if (!repeatType) return;
  if (!repeatConfig) {
    repeatType.value = 'none';
    repeatInterval.value = '1';
    repeatWeekdayInputs?.forEach((input) => { input.checked = false; });
  } else {
    repeatType.value = repeatConfig.type;
    repeatInterval.value = String(repeatConfig.interval ?? 1);
    if (repeatConfig.type === 'weekly') {
      const set = new Set(repeatConfig.weekdays || []);
      repeatWeekdayInputs?.forEach((input) => {
        input.checked = set.has(Number(input.value));
      });
    } else {
      repeatWeekdayInputs?.forEach((input) => { input.checked = false; });
    }
  }
  repeatWeekdayContainer.style.display = repeatType.value === 'weekly' ? 'flex' : 'none';
}

function formatRepeatLabel(config) {
  if (!config || typeof config !== 'object') return '繰り返し';
  if (config.type === 'daily') {
    return config.interval === 1 ? '毎日' : `${config.interval}日ごと`;
  }
  if (config.type === 'weekly') {
    const days = (config.weekdays || []).map((day) => WEEKDAY_LABELS[day]).join('・');
    if (!days) return '毎週';
    return config.interval === 1 ? `毎週 ${days}` : `${config.interval}週間ごと (${days})`;
  }
  if (config.type === 'monthly') {
    return config.interval === 1 ? '毎月' : `${config.interval}か月ごと`;
  }
  return '繰り返し';
}

async function onSubmitForm(event) {
  event.preventDefault();
  const {
    id, title, description, priority, status,
    startDate, endDate, scheduleId, parentId,
    tagsInput, submitBtn,
  } = getEls();
  const payload = {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    priority: priority.value,
    status: status.value,
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
    scheduleId: scheduleId.value ? Number(scheduleId.value) : undefined,
    parentTaskId: parentId.value ? Number(parentId.value) : undefined,
    tags: parseTagsInput(tagsInput?.value || ''),
    repeatConfig: gatherRepeatConfig(),
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
    if (payload.tags.length) {
      await loadTagOptions();
    }
  } catch (error) {
    console.error('[Tasks] 送信エラー:', error);
  } finally {
    submitBtn.disabled = false;
  }
}

function startEdit(task) {
  const {
    id, title, description, priority, status,
    startDate, endDate, scheduleId, parentId,
    tagsInput, submitBtn, cancelEditBtn,
  } = getEls();
  populateParentOptions(task.id);
  id.value = String(task.id);
  title.value = task.title || '';
  description.value = task.description || '';
  priority.value = task.priority || 'medium';
  status.value = task.status || 'todo';
  startDate.value = task.startDate ? toDateInput(task.startDate) : '';
  endDate.value = task.endDate ? toDateInput(task.endDate) : '';
  scheduleId.value = task.scheduleId != null ? String(task.scheduleId) : '';
  parentId.value = task.parentTaskId != null ? String(task.parentTaskId) : '';
  tagsInput.value = (task.tags || []).map((tag) => tag.name).join(', ');
  populateRepeatFields(task.repeatConfig);
  submitBtn.textContent = '更新';
  cancelEditBtn.hidden = false;
}

function startSubtask(task) {
  const { parentId, title } = getEls();
  // サブタスク作成時は親候補から自身を除外しない（親として選択するため）
  populateParentOptions();
  parentId.value = String(task.id);
  title.focus();
}

function exitEdit() {
  const {
    id, title, description, priority, status,
    startDate, endDate, scheduleId, parentId,
    tagsInput, submitBtn, cancelEditBtn,
  } = getEls();
  id.value = '';
  title.value = '';
  description.value = '';
  priority.value = 'medium';
  status.value = 'todo';
  startDate.value = '';
  endDate.value = '';
  scheduleId.value = '';
  parentId.value = '';
  tagsInput.value = '';
  populateParentOptions();
  populateRepeatFields(null);
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
      tags: tagOptions.map((tag) => tag.name),
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

// 音声コマンドの日時フィールドを正規化（作成用）
function normalizeVoiceDateForCreate(value) {
  if (value == null) return undefined; // 未指定は送らない（メインで null 扱い）
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return undefined;
    const lower = t.toLowerCase();
    if (lower === 'null' || lower === 'none' || lower === 'nil' || lower === 'undefined' || lower === 'clear') return undefined;
    if (t === '未設定' || t === '未定' || t === 'なし' || t === '無し' || t === '消去' || t === 'クリア') return undefined;
    return t; // ISO 文字列などはそのまま
  }
  return undefined;
}

// 音声コマンドの日時フィールドを正規化（更新用）
function normalizeVoiceDateForUpdate(value) {
  if (value == null) return null; // 明示クリア
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null; // 空はクリア
    const lower = t.toLowerCase();
    if (lower === 'null' || lower === 'none' || lower === 'nil' || lower === 'undefined' || lower === 'clear') return null;
    if (t === '未設定' || t === '未定' || t === 'なし' || t === '無し' || t === '消去' || t === 'クリア') return null;
    return t;
  }
  return undefined; // 不明値は変更しない
}

async function applyVoiceCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return;
  const action = String(cmd.action || '').toLowerCase();
  switch (action) {
    case 'create': {
      const parentId = cmd.parentId ?? resolveTaskIdByTitle(cmd.parentTitle);
      const response = await window.electronAPI.tasksCreate({
        title: typeof cmd.title === 'string' ? cmd.title : undefined,
        description: typeof cmd.description === 'string' ? cmd.description : undefined,
        priority: typeof cmd.priority === 'string' ? cmd.priority : undefined,
        status: typeof cmd.status === 'string' ? cmd.status : undefined,
        startDate: normalizeVoiceDateForCreate(cmd.startDate),
        endDate: normalizeVoiceDateForCreate(cmd.endDate),
        scheduleId: cmd.scheduleId,
        parentTaskId: parentId ?? undefined,
        tags: Array.isArray(cmd.tags) ? cmd.tags : undefined,
      });
      console.debug('[Tasks] voice create response', response);
      if (!response?.success) {
        throw new Error(response?.error || 'タスク作成に失敗しました');
      }
      break;
    }
    case 'update': {
      let targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : null;
      if (!targetId && cmd.title) {
        targetId = resolveTaskIdByTitle(cmd.title) ?? null;
      }
      if (!targetId) return;
      const current = tasks.find((task) => task.id === targetId);
      const parentId = cmd.parentId ?? resolveTaskIdByTitle(cmd.parentTitle);
      const payload = {
        title: typeof cmd.title === 'string' ? cmd.title : undefined,
        description: typeof cmd.description === 'string' ? cmd.description : undefined,
        priority: typeof cmd.priority === 'string' ? cmd.priority : undefined,
        status: typeof cmd.status === 'string' ? cmd.status : undefined,
        startDate: normalizeVoiceDateForUpdate(cmd.startDate),
        endDate: normalizeVoiceDateForUpdate(cmd.endDate),
        scheduleId: cmd.scheduleId,
        parentTaskId: parentId ?? undefined,
      };
      if (Array.isArray(cmd.tags)) {
        const mode = String(cmd.tagMode || 'set').toLowerCase();
        const currentTags = current?.tags ? current.tags.map((tag) => tag.name) : [];
        let nextTags = cmd.tags;
        if (mode === 'add') {
          const merged = new Set([...currentTags, ...cmd.tags]);
          nextTags = Array.from(merged);
        } else if (mode === 'remove') {
          const removeSet = new Set(cmd.tags.map((tag) => tag.toLowerCase()));
          nextTags = currentTags.filter((tag) => !removeSet.has(tag.toLowerCase()));
        }
        payload.tags = nextTags;
      }
      const response = await window.electronAPI.tasksUpdate(targetId, payload);
      console.debug('[Tasks] voice update response', response);
      if (!response?.success) {
        throw new Error(response?.error || 'タスク更新に失敗しました');
      }
      break;
    }
    case 'delete': {
      const targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : resolveTaskIdByTitle(cmd.title);
      if (!targetId) return;
      const response = await window.electronAPI.tasksDelete(targetId);
      console.debug('[Tasks] voice delete response', response);
      if (!response?.success) {
        throw new Error(response?.error || 'タスク削除に失敗しました');
      }
      break;
    }
    case 'complete': {
      const targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : resolveTaskIdByTitle(cmd.title);
      if (!targetId) return;
      const response = await window.electronAPI.tasksUpdate(targetId, { status: 'done' });
      console.debug('[Tasks] voice complete response', response);
      if (!response?.success) {
        throw new Error(response?.error || 'タスク完了解除に失敗しました');
      }
      break;
    }
    case 'start': {
      const targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : resolveTaskIdByTitle(cmd.title);
      if (!targetId) return;
      const response = await window.electronAPI.tasksUpdate(targetId, { status: 'in_progress' });
      console.debug('[Tasks] voice start response', response);
      if (!response?.success) {
        throw new Error(response?.error || 'タスク更新に失敗しました');
      }
      break;
    }
    case 'bulk_delete':
      await handleBulkDelete(cmd.criteria);
      break;
    case 'bulk_complete':
      await handleBulkComplete(cmd.criteria);
      break;
    case 'search':
      await handleVoiceSearch(cmd.criteria);
      break;
    default:
      break;
  }
}

function scheduleDailyAnnouncement() {
  try {
    const key = 'tasks.lastAnnouncedDate';
    lastAnnouncedDate = localStorage.getItem(key) || null;
    setupAnnouncementTimer();
  } catch (error) {
    console.warn('[Tasks] 読み上げスケジュール設定に失敗しました:', error);
  }
}

async function announceTasks(referenceTime, options = {}) {
  try {
    const todayKey = new Date(referenceTime).toDateString();
    const key = 'tasks.lastAnnouncedDate';
    if (!options.force && localStorage.getItem(key) === todayKey) {
      return;
    }
    const res = await window.electronAPI.tasksList({ activeAt: referenceTime });
    if (!res?.success) return;
    let list = Array.isArray(res.items) ? res.items : [];
    if (readingSettings.includeStatuses?.length) {
      const allowed = new Set(readingSettings.includeStatuses);
      list = list.filter((task) => allowed.has(task.status));
    }
    if (readingSettings.includeTags?.length) {
      const required = new Set(readingSettings.includeTags);
      list = list.filter((task) => {
        const tagNames = (task.tags || []).map((tag) => tag.name);
        return tagNames.some((name) => required.has(name));
      });
    }
    if (list.length === 0) {
      return;
    }

    if ((readingSettings.priorityMode || 'grouped') === 'grouped') {
      await speakGroupedTasks(list);
    } else {
      await speakFlatTasks(list);
    }

    localStorage.setItem(key, todayKey);
    lastAnnouncedDate = todayKey;
  } catch (error) {
    console.error('[Tasks] 読み上げエラー:', error);
  }
}

function priorityJa(p) { return p === 'high' ? '高' : p === 'low' ? '低' : '中'; }
function statusJa(s) { return s === 'done' ? '完了' : s === 'in_progress' ? '進行中' : '未着手'; }

async function speakFlatTasks(list) {
  const lines = [];
  const counts = { low: 0, medium: 0, high: 0 };
  list.forEach((t) => { if (counts[t.priority] != null) counts[t.priority] += 1; });
  lines.push(`対象のタスクは${list.length}件です。`);
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
}

async function speakGroupedTasks(list) {
  const groups = {
    high: list.filter((task) => task.priority === 'high'),
    medium: list.filter((task) => task.priority === 'medium'),
    low: list.filter((task) => task.priority === 'low'),
  };
  const priorityOrder = ['high', 'medium', 'low'];
  const speeds = { high: 1.15, medium: 1.05, low: 0.95 };
  const totalLines = [`対象のタスクは${list.length}件です。`];
  await queueVoicevoxSpeech(totalLines.join('\n'), { speedScale: 1.05 });

  for (const priority of priorityOrder) {
    const tasksInGroup = groups[priority];
    if (!tasksInGroup || tasksInGroup.length === 0) continue;
    const header = `優先度${priorityJa(priority)}のタスクは${tasksInGroup.length}件です。`;
    const lines = [header];
    tasksInGroup.slice(0, 20).forEach((task) => {
      lines.push(`【${priorityJa(priority)}】${task.title}、ステータス${statusJa(task.status)}。`);
    });
    await queueVoicevoxSpeech(lines.join('\n'), { speedScale: speeds[priority] ?? 1.0 });
  }
}

function resolveTaskIdByTitle(title) {
  if (!title) return null;
  const lower = title.trim().toLowerCase();
  const match = tasks.find((task) => task.title.trim().toLowerCase() === lower);
  return match?.id ?? null;
}

function normalizeCriteriaForApi(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const criteria = {};
  if (typeof raw.status === 'string') {
    const normalized = raw.status.trim().toLowerCase();
    if (['todo', 'in_progress', 'done'].includes(normalized)) {
      criteria.status = normalized;
    }
  }
  if (typeof raw.timeframe === 'string') {
    criteria.timeframe = raw.timeframe.trim().toLowerCase();
  }
  if (typeof raw.tag === 'string' && raw.tag.trim()) {
    criteria.tag = raw.tag.trim();
  }
  if (Array.isArray(raw.tags) && raw.tags.length > 0) {
    criteria.tags = raw.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim());
  }
  return criteria;
}

async function handleBulkDelete(criteria) {
  try {
    const normalized = normalizeCriteriaForApi(criteria);
    const res = await window.electronAPI.tasksBulkDelete(normalized);
    if (!res?.success) throw new Error(res?.error || '一括削除に失敗しました');
    const count = res.result?.count ?? 0;
    const { voiceMsg } = getEls();
    if (voiceMsg) {
      voiceMsg.textContent = `一括削除: ${count}件のタスクを削除しました。`;
    }
  } catch (error) {
    console.error('[Tasks] 一括削除エラー:', error);
    const { voiceMsg } = getEls();
    if (voiceMsg) voiceMsg.textContent = '一括削除に失敗しました。';
  }
}

async function handleBulkComplete(criteria) {
  try {
    const normalized = normalizeCriteriaForApi(criteria);
    const res = await window.electronAPI.tasksBulkComplete(normalized);
    if (!res?.success) throw new Error(res?.error || '一括更新に失敗しました');
    const count = res.result?.count ?? 0;
    const { voiceMsg } = getEls();
    if (voiceMsg) {
      voiceMsg.textContent = `一括完了: ${count}件のタスクを完了にしました。`;
    }
  } catch (error) {
    console.error('[Tasks] 一括完了エラー:', error);
    const { voiceMsg } = getEls();
    if (voiceMsg) voiceMsg.textContent = '一括操作に失敗しました。';
  }
}

async function handleVoiceSearch(criteria) {
  try {
    const normalized = normalizeCriteriaForApi(criteria);
    const filter = {};
    if (normalized.status) {
      filter.status = normalized.status;
    }
    const res = await window.electronAPI.tasksList(filter);
    if (!res?.success) throw new Error(res?.error || '検索に失敗しました');
    let list = Array.isArray(res.items) ? res.items : [];
    list = filterTasksByCriteria(list, normalized);
    const { voiceMsg } = getEls();
    if (list.length === 0) {
      const summary = '条件に一致するタスクはありません。';
      if (voiceMsg) voiceMsg.textContent = summary;
      await queueVoicevoxSpeech(summary, { speedScale: 1.0 });
      return;
    }
    const timeframeLabel = describeTimeframe(normalized.timeframe);
    const summaryLines = [`${timeframeLabel}のタスクは${list.length}件です。`];
    list.slice(0, 10).forEach((task) => {
      summaryLines.push(`${task.title}、優先度${priorityJa(task.priority)}、ステータス${statusJa(task.status)}。`);
    });
    const summary = summaryLines.join('\n');
    if (voiceMsg) voiceMsg.textContent = summaryLines.join(' ');
    await queueVoicevoxSpeech(summary, { speedScale: 1.05 });
  } catch (error) {
    console.error('[Tasks] 検索コマンドエラー:', error);
    const { voiceMsg } = getEls();
    if (voiceMsg) voiceMsg.textContent = '検索に失敗しました。';
  }
}

function filterTasksByCriteria(list, criteria) {
  let filtered = list;
  if (criteria.tag) {
    const key = criteria.tag.trim().toLowerCase();
    filtered = filtered.filter((task) => (task.tags || []).some((tag) => tag.name.trim().toLowerCase() === key));
  }
  if (Array.isArray(criteria.tags) && criteria.tags.length > 0) {
    const set = new Set(criteria.tags.map((tag) => tag.trim().toLowerCase()));
    filtered = filtered.filter((task) => (task.tags || []).some((tag) => set.has(tag.name.trim().toLowerCase())));
  }
  if (criteria.timeframe) {
    const range = computeClientTimeframeRange(criteria.timeframe);
    if (range?.type === 'range') {
      filtered = filtered.filter((task) => {
        const start = Number.isFinite(task.startDate) ? task.startDate : null;
        const end = Number.isFinite(task.endDate) ? task.endDate : null;
        const overlaps = (start == null || start <= range.end) && (end == null || end >= range.start);
        return overlaps;
      });
    } else if (range?.type === 'overdue') {
      filtered = filtered.filter((task) => Number.isFinite(task.endDate) && task.endDate < range.before && task.status !== 'done');
    }
  }
  return filtered;
}

function startOfDayClient(timestamp) {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayClient(timestamp) {
  const d = new Date(timestamp);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfWeekClient(timestamp) {
  const d = new Date(timestamp);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfWeekClient(timestamp) {
  const start = startOfWeekClient(timestamp);
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function computeClientTimeframeRange(timeframe) {
  const now = Date.now();
  switch (timeframe) {
    case 'today':
      return { type: 'range', start: startOfDayClient(now), end: endOfDayClient(now) };
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { type: 'range', start: startOfDayClient(tomorrow), end: endOfDayClient(tomorrow) };
    }
    case 'this_week':
      return { type: 'range', start: startOfWeekClient(now), end: endOfWeekClient(now) };
    case 'next_week': {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return { type: 'range', start: startOfWeekClient(nextWeek), end: endOfWeekClient(nextWeek) };
    }
    case 'overdue':
      return { type: 'overdue', before: startOfDayClient(now) };
    default:
      return null;
  }
}

function describeTimeframe(timeframe) {
  switch (timeframe) {
    case 'today': return '今日の';
    case 'tomorrow': return '明日の';
    case 'this_week': return '今週の';
    case 'next_week': return '来週の';
    case 'overdue': return '期限切れの';
    default: return '対象の';
  }
}
