/**
 * タスクフィルタ関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState, toggleTagFilter, clearTagFilters } from './state.js';
import { computeClientTimeframeRange } from './utils.js';
import { applyAdvancedFilters } from './filter-apply.js';
import { renderTagFilters } from './render.js';
import { loadTasks } from './model.js';
import { renderList } from './render.js';

/**
 * 基本フィルタの初期化を行う。
 */
export function setupFilters() {
  const { showOnlyActive, hideDone } = getEls();
  showOnlyActive?.addEventListener('change', () => loadTasks());
  hideDone?.addEventListener('change', renderList);
}

/**
 * 高度なフィルタの初期化を行う。
 */
export function setupAdvancedFilters() {
  const {
    advancedFiltersToggle,
    advancedFiltersPanel,
    filterDateRange,
    filterCustomDates,
    filterStatus,
    filterPriority,
    filterStartDate,
    filterEndDate,
    filterConditionMode,
    saveFilterBtn,
    loadFilterBtn,
    clearFilterBtn,
  } = getEls();

  if (!advancedFiltersToggle) return;

  advancedFiltersToggle.addEventListener('click', () => {
    const isOpen = !advancedFiltersPanel.hidden;
    advancedFiltersPanel.hidden = !isOpen;
    const container = advancedFiltersPanel.closest('.tasks-advanced-filters');
    if (container) {
      container.setAttribute('data-open', String(!isOpen));
    }
  });

  filterDateRange?.addEventListener('change', () => {
    if (filterCustomDates) {
      filterCustomDates.hidden = filterDateRange.value !== 'custom';
    }
    applyAdvancedFilters();
  });

  [filterStatus, filterPriority, filterStartDate, filterEndDate, filterConditionMode].forEach((el) => {
    el?.addEventListener('change', applyAdvancedFilters);
  });

  saveFilterBtn?.addEventListener('click', saveCurrentFilter);
  loadFilterBtn?.addEventListener('click', () => {
    const name = prompt('保存済みフィルタの名前を入力してください:');
    if (name) loadSavedFilter(name);
  });
  clearFilterBtn?.addEventListener('click', clearAdvancedFilters);

  loadSavedFiltersList();
}

/**
 * 現在のフィルタ設定を取得する。
 */
export function getAdvancedFilter() {
  const {
    filterStatus,
    filterPriority,
    filterDateRange,
    filterStartDate,
    filterEndDate,
    filterConditionMode,
  } = getEls();

  const filter = {
    status: filterStatus ? Array.from(filterStatus.selectedOptions).map((opt) => opt.value) : [],
    priority: filterPriority ? Array.from(filterPriority.selectedOptions).map((opt) => opt.value) : [],
    timeframe: null,
    customStartDate: null,
    customEndDate: null,
    conditionMode: filterConditionMode?.value || 'AND',
  };

  if (filterDateRange?.value) {
    if (filterDateRange.value === 'custom') {
      filter.customStartDate = filterStartDate?.value ? new Date(filterStartDate.value).getTime() : null;
      filter.customEndDate = filterEndDate?.value ? new Date(filterEndDate.value).getTime() : null;
      if (filter.customStartDate || filter.customEndDate) {
        filter.timeframe = 'custom';
      }
    } else {
      filter.timeframe = filterDateRange.value;
    }
  }

  return filter;
}

/**
 * フィルタを構築する。
 */
export function buildFilter() {
  const { showOnlyActive } = getEls();
  const filter = {};
  if (showOnlyActive?.checked) {
    filter.activeAt = Date.now();
  }
  if (taskState.tagFilters.size > 0) {
    filter.tags = Array.from(taskState.tagFilters);
  }
  const advancedFilter = getAdvancedFilter();
  if (advancedFilter.status && advancedFilter.status.length > 0) {
    filter.status = advancedFilter.status[0];
  }
  if (advancedFilter.priority && advancedFilter.priority.length > 0) {
    filter.priority = advancedFilter.priority[0];
  }
  if (advancedFilter.timeframe) {
    filter.timeframe = advancedFilter.timeframe;
  }
  return filter;
}

/**
 * 時間範囲を計算する。
 */
export function computeTimeframeRange(timeframe, customStartDate, customEndDate) {
  if (timeframe === 'custom') {
    if (customStartDate || customEndDate) {
      return {
        type: 'range',
        start: customStartDate || 0,
        end: customEndDate || Date.now() + 365 * 24 * 60 * 60 * 1000,
      };
    }
    return null;
  }
  return computeClientTimeframeRange(timeframe);
}

/**
 * 現在のフィルタを保存する。
 */
export function saveCurrentFilter() {
  const name = prompt('フィルタの名前を入力してください:');
  if (!name || !name.trim()) return;
  const filter = getAdvancedFilter();
  const saved = JSON.parse(localStorage.getItem('tasks.savedFilters') || '{}');
  saved[name.trim()] = filter;
  localStorage.setItem('tasks.savedFilters', JSON.stringify(saved));
  loadSavedFiltersList();
  alert(`フィルタ「${name}」を保存しました。`);
}

/**
 * 保存済みフィルタを読み込む。
 */
export function loadSavedFilter(name) {
  const saved = JSON.parse(localStorage.getItem('tasks.savedFilters') || '{}');
  const filter = saved[name];
  if (!filter) {
    alert(`フィルタ「${name}」が見つかりません。`);
    return;
  }
  applySavedFilter(filter);
  applyAdvancedFilters();
}

/**
 * 保存済みフィルタを適用する。
 */
function applySavedFilter(filter) {
  const {
    filterStatus,
    filterPriority,
    filterDateRange,
    filterStartDate,
    filterEndDate,
    filterConditionMode,
    filterCustomDates,
  } = getEls();

  if (filterStatus && Array.isArray(filter.status)) {
    Array.from(filterStatus.options).forEach((opt) => {
      opt.selected = filter.status.includes(opt.value);
    });
  }
  if (filterPriority && Array.isArray(filter.priority)) {
    Array.from(filterPriority.options).forEach((opt) => {
      opt.selected = filter.priority.includes(opt.value);
    });
  }
  if (filterDateRange) {
    filterDateRange.value = filter.timeframe === 'custom' ? 'custom' : (filter.timeframe || '');
  }
  if (filterConditionMode) {
    filterConditionMode.value = filter.conditionMode || 'AND';
  }
  if (filterCustomDates) {
    filterCustomDates.hidden = filter.timeframe !== 'custom';
  }
  if (filterStartDate && filter.customStartDate) {
    const d = new Date(filter.customStartDate);
    filterStartDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (filterEndDate && filter.customEndDate) {
    const d = new Date(filter.customEndDate);
    filterEndDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/**
 * 保存済みフィルタのリストを読み込む。
 */
function loadSavedFiltersList() {
  const savedFiltersEl = getEls().savedFilters;
  if (!savedFiltersEl) return;
  const saved = JSON.parse(localStorage.getItem('tasks.savedFilters') || '{}');
  savedFiltersEl.innerHTML = '<option value="">保存済みフィルタを選択...</option>';
  Object.keys(saved).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    savedFiltersEl.appendChild(option);
  });
  savedFiltersEl.addEventListener('change', () => {
    if (savedFiltersEl.value) {
      loadSavedFilter(savedFiltersEl.value);
    }
  });
}

/**
 * 高度なフィルタをクリアする。
 */
export function clearAdvancedFilters() {
  const {
    filterStatus,
    filterPriority,
    filterDateRange,
    filterStartDate,
    filterEndDate,
    filterConditionMode,
    filterCustomDates,
  } = getEls();

  if (filterStatus) {
    Array.from(filterStatus.options).forEach((opt) => {
      opt.selected = false;
    });
  }
  if (filterPriority) {
    Array.from(filterPriority.options).forEach((opt) => {
      opt.selected = false;
    });
  }
  if (filterDateRange) filterDateRange.value = '';
  if (filterStartDate) filterStartDate.value = '';
  if (filterEndDate) filterEndDate.value = '';
  if (filterConditionMode) filterConditionMode.value = 'AND';
  if (filterCustomDates) filterCustomDates.hidden = true;
  window.filteredTasks = null;
  loadTasks();
}

