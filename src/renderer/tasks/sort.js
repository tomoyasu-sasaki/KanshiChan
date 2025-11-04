/**
 * タスクのソート・グループ化関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState } from './state.js';
import { renderKanbanView, renderListWithGrouping } from './render.js';
import { priorityJa, statusJa } from './utils.js';

/**
 * ソートコントロールの初期化を行う。
 */
export function setupSortControls() {
  const {
    sortBy1,
    sortOrder1,
    sortBy2,
    sortOrder2,
    groupBy,
    saveSortBtn,
    resetSortBtn,
  } = getEls();

  if (!sortBy1) return;

  const applySort = () => {
    applySortingAndGrouping();
  };

  [sortBy1, sortOrder1, sortBy2, sortOrder2, groupBy].forEach((el) => {
    el?.addEventListener('change', applySort);
  });

  saveSortBtn?.addEventListener('click', saveCurrentSort);
  resetSortBtn?.addEventListener('click', resetSort);

  loadSavedSort();
}

/**
 * ソートとグループ化を適用する。
 */
export function applySortingAndGrouping() {
  const { items } = getEls();
  if (!items) return;
  const view = localStorage.getItem('tasks.view') || 'list';
  if (view === 'kanban') {
    renderKanbanView();
    return;
  }

  const { sortBy1, sortOrder1, sortBy2, sortOrder2, groupBy } = getEls();
  // フィルタリング済みタスクがあればそれを使い、なければ全タスクから開始
  let tasksToRender = (window.filteredTasks != null ? window.filteredTasks : taskState.tasks).slice();

  const sort1 = sortBy1?.value || 'displayOrder';
  const order1 = sortOrder1?.value || 'asc';
  const sort2 = sortBy2?.value || '';
  const order2 = sortOrder2?.value || 'desc';
  const group = groupBy?.value || '';

  tasksToRender.sort((a, b) => {
    let diff1 = compareTasks(a, b, sort1);
    if (diff1 !== 0) {
      return order1 === 'asc' ? diff1 : -diff1;
    }
    if (sort2) {
      let diff2 = compareTasks(a, b, sort2);
      return order2 === 'asc' ? diff2 : -diff2;
    }
    return 0;
  });

  window.sortedTasks = tasksToRender;
  window.currentGroupBy = group;
  renderListWithGrouping(tasksToRender, group);
}

/**
 * タスクを比較する。
 */
function compareTasks(a, b, field) {
  switch (field) {
    case 'displayOrder':
      return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    case 'updatedAt':
      return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
    case 'createdAt':
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    case 'title':
      return (a.title || '').localeCompare(b.title || '', 'ja');
    case 'priority':
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
    case 'status':
      const statusOrder = { todo: 1, in_progress: 2, done: 3 };
      return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    case 'startDate':
      return (a.startDate ?? 0) - (b.startDate ?? 0);
    case 'endDate':
      return (a.endDate ?? 0) - (b.endDate ?? 0);
    default:
      return 0;
  }
}

/**
 * タスクをグループ化する。
 */
export function groupTasks(tasks, groupBy) {
  const groups = {};
  tasks.forEach((task) => {
    let key = '';
    switch (groupBy) {
      case 'priority':
        key = task.priority || 'unknown';
        break;
      case 'status':
        key = task.status || 'unknown';
        break;
      case 'parentTaskId':
        key = task.parentTaskId ? `parent_${task.parentTaskId}` : 'root';
        break;
      default:
        key = 'all';
    }
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(task);
  });
  return groups;
}

/**
 * グループヘッダーをフォーマットする。
 */
export function formatGroupHeader(groupBy, key) {
  switch (groupBy) {
    case 'priority':
      return `優先度: ${priorityJa(key)}`;
    case 'status':
      return `ステータス: ${statusJa(key)}`;
    case 'parentTaskId':
      if (key === 'root') return '親タスクなし';
      const parentId = Number(key.replace('parent_', ''));
      const parent = taskState.tasks.find((t) => t.id === parentId);
      return parent ? `親タスク: ${parent.title}` : `親タスク: ID ${parentId}`;
    default:
      return key;
  }
}

/**
 * 現在のソート設定を保存する。
 */
function saveCurrentSort() {
  const { sortBy1, sortOrder1, sortBy2, sortOrder2, groupBy } = getEls();
  const sortConfig = {
    sortBy1: sortBy1?.value || 'displayOrder',
    sortOrder1: sortOrder1?.value || 'asc',
    sortBy2: sortBy2?.value || '',
    sortOrder2: sortOrder2?.value || 'desc',
    groupBy: groupBy?.value || '',
  };
  localStorage.setItem('tasks.sortConfig', JSON.stringify(sortConfig));
  alert('ソート設定を保存しました。');
}

/**
 * 保存済みソート設定を読み込む。
 */
function loadSavedSort() {
  try {
    const saved = localStorage.getItem('tasks.sortConfig');
    if (!saved) return;
    const config = JSON.parse(saved);
    const { sortBy1, sortOrder1, sortBy2, sortOrder2, groupBy } = getEls();
    if (sortBy1) sortBy1.value = config.sortBy1 || 'displayOrder';
    if (sortOrder1) sortOrder1.value = config.sortOrder1 || 'asc';
    if (sortBy2) sortBy2.value = config.sortBy2 || '';
    if (sortOrder2) sortOrder2.value = config.sortOrder2 || 'desc';
    if (groupBy) groupBy.value = config.groupBy || '';
    applySortingAndGrouping();
  } catch (error) {
    console.warn('[Tasks] ソート設定の読み込みに失敗:', error);
  }
}

/**
 * ソート設定をリセットする。
 */
function resetSort() {
  const { sortBy1, sortOrder1, sortBy2, sortOrder2, groupBy } = getEls();
  if (sortBy1) sortBy1.value = 'displayOrder';
  if (sortOrder1) sortOrder1.value = 'desc';
  if (sortBy2) sortBy2.value = 'updatedAt';
  if (sortOrder2) sortOrder2.value = 'desc';
  if (groupBy) groupBy.value = '';
  localStorage.removeItem('tasks.sortConfig');
  applySortingAndGrouping();
}

