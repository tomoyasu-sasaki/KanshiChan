/**
 * フィルタ適用処理を管理するモジュール。
 */
import { taskState } from './state.js';
import { getAdvancedFilter, computeTimeframeRange } from './filters.js';
import { applySortingAndGrouping } from './sort.js';

/**
 * 高度なフィルタを適用する。
 */
export function applyAdvancedFilters() {
  const advancedFilter = getAdvancedFilter();
  let filtered = taskState.tasks.slice();

  if (advancedFilter.conditionMode === 'AND') {
    if (advancedFilter.status.length > 0) {
      filtered = filtered.filter((task) => advancedFilter.status.includes(task.status));
    }
    if (advancedFilter.priority.length > 0) {
      filtered = filtered.filter((task) => advancedFilter.priority.includes(task.priority));
    }
  } else {
    if (advancedFilter.status.length > 0 || advancedFilter.priority.length > 0) {
      filtered = filtered.filter((task) =>
        advancedFilter.status.includes(task.status) || advancedFilter.priority.includes(task.priority)
      );
    }
  }

  if (advancedFilter.timeframe) {
    const range = computeTimeframeRange(advancedFilter.timeframe, advancedFilter.customStartDate, advancedFilter.customEndDate);
    if (range) {
      filtered = filtered.filter((task) => {
        const start = task.startDate;
        const end = task.endDate;
        if (range.type === 'overdue') {
          return end != null && end < range.before && task.status !== 'done';
        }
        if (range.type === 'range') {
          return (start == null || start <= range.end) && (end == null || end >= range.start);
        }
        return true;
      });
    }
  }

  window.filteredTasks = filtered;
  window.sortedTasks = null;
  applySortingAndGrouping();
}

/**
 * タスクに対してフィルタを再適用する。
 */
export function applyAdvancedFiltersToTasks() {
  // 常に最新のtasks配列からフィルタリングを再計算
  window.filteredTasks = null;
  window.sortedTasks = null;
  applyAdvancedFilters();
}

