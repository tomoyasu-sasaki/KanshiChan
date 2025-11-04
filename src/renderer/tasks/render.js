/**
 * タスクのレンダリング関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState, toggleTagFilter } from './state.js';
import {
  formatPeriodBadge,
  formatRepeatLabel,
  getStatusIcon,
  buildTaskTreeForRender,
  priorityJa,
  statusJa,
} from './utils.js';
import { startEdit, startSubtask } from './form.js';
import { deleteTask, loadTasks } from './model.js';
import { bindDragEvents } from './drag.js';
import { groupTasks, formatGroupHeader } from './sort.js';

/**
 * タスクリストをレンダリングする。
 */
export function renderList(sourceTasks = null) {
  // ソート済みタスクがあれば優先的に使用
  const tasksToRender = sourceTasks || window.sortedTasks || (window.filteredTasks != null ? window.filteredTasks : taskState.tasks).slice();
  const groupBy = window.currentGroupBy || '';
  renderListWithGrouping(tasksToRender, groupBy);
}

/**
 * グループ化してタスクリストをレンダリングする。
 */
export function renderListWithGrouping(sourceTasks, groupBy) {
  const { items, hideDone } = getEls();
  if (!items) return;
  items.innerHTML = '';

  let visibleTasks = sourceTasks || taskState.tasks.slice();
  if (hideDone?.checked) {
    visibleTasks = visibleTasks.filter((t) => t.status !== 'done');
  }

  if (visibleTasks.length === 0) {
    const li = document.createElement('div');
    li.className = 'task-empty';
    li.textContent = 'タスクはありません';
    items.appendChild(li);
    return;
  }

  if (!groupBy) {
    const tree = buildTaskTreeForRender(visibleTasks);
    tree.forEach((task) => items.appendChild(renderTaskItem(task, 0)));
    return;
  }

  const groups = groupTasks(visibleTasks, groupBy);
  Object.keys(groups).forEach((groupKey) => {
    const header = document.createElement('div');
    header.className = 'tasks-group-header';
    header.textContent = formatGroupHeader(groupBy, groupKey);
    items.appendChild(header);

    const groupTasksList = groups[groupKey];
    const tree = buildTaskTreeForRender(groupTasksList);
    tree.forEach((task) => items.appendChild(renderTaskItem(task, 0)));
  });
}

/**
 * カンバンビューをレンダリングする。
 */
export function renderKanbanView() {
  const { items, hideDone } = getEls();
  if (!items) return;

  // フィルタリング済みタスクがあればそれを使い、なければ全タスクから開始
  let visibleTasks = (window.filteredTasks != null ? window.filteredTasks : taskState.tasks).slice();
  if (hideDone?.checked) {
    visibleTasks = visibleTasks.filter((t) => t.status !== 'done');
  }

  const columns = {
    todo: visibleTasks.filter((t) => t.status === 'todo'),
    in_progress: visibleTasks.filter((t) => t.status === 'in_progress'),
    done: visibleTasks.filter((t) => t.status === 'done'),
  };

  items.innerHTML = '';

  ['todo', 'in_progress', 'done'].forEach((status) => {
    const column = document.createElement('div');
    column.className = `tasks-kanban-column items-${status}`;

    const header = document.createElement('div');
    header.className = 'tasks-kanban-column-header';
    header.textContent = `${statusJa(status)} (${columns[status].length})`;
    column.appendChild(header);

    const columnItems = document.createElement('div');
    columnItems.className = 'tasks-kanban-column-items';

    const sorted = columns[status].slice().sort((a, b) => {
      const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

    sorted.forEach((task) => {
      columnItems.appendChild(renderTaskItem(task, 0));
    });

    if (sorted.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-empty';
      empty.textContent = 'タスクはありません';
      columnItems.appendChild(empty);
    }

    column.appendChild(columnItems);
    items.appendChild(column);
  });
}

/**
 * タスクアイテムをレンダリングする。
 */
export function renderTaskItem(task, depth) {
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

/**
 * 優先度バッジを作成する。
 */
function createPriorityBadge(priority) {
  const span = document.createElement('span');
  span.className = `badge priority-${priority}`;
  span.textContent = priorityJa(priority);
  return span;
}

/**
 * ステータスバッジを作成する。
 */
function createStatusBadge(status) {
  const span = document.createElement('span');
  span.className = `badge status-${status}`;
  span.textContent = statusJa(status);
  return span;
}

/**
 * タグフィルタをレンダリングする。
 */
export function renderTagFilters() {
  const { tagFilterContainer } = getEls();
  if (!tagFilterContainer) return;
  tagFilterContainer.innerHTML = '';
  if (!taskState.tagOptions.length) {
    tagFilterContainer.innerHTML = '<span class="tag-filter-empty">タグ未登録</span>';
    return;
  }
  taskState.tagOptions.forEach((tag) => {
    const label = document.createElement('label');
    label.className = 'tag-filter-item';
    label.style.setProperty('--tag-color', tag.color);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = tag.name;
    input.checked = taskState.tagFilters.has(tag.name);
    input.addEventListener('change', () => {
      toggleTagFilter(tag.name, input.checked);
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

