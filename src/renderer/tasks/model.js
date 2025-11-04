/**
 * タスクのデータ操作を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState, setTasks, setTagOptions } from './state.js';
import { buildFilter } from './filters.js';
import { populateParentOptions } from './repeat-controls.js';
import { applyAdvancedFiltersToTasks } from './filter-apply.js';
import { renderList } from './render.js';
import { scheduleState } from '../schedule/state.js';

/**
 * タスクを読み込む。
 */
export async function loadTasks() {
  const { showOnlyActive } = getEls();
  try {
    const filter = buildFilter();
    const res = await window.electronAPI.tasksList(filter);
    console.debug('[Tasks] loadTasks filter', filter, 'response', res);
    if (!res?.success) throw new Error(res?.error || 'tasksList 失敗');
    setTasks(Array.isArray(res.items) ? res.items : []);
    console.debug('[Tasks] mapped tasks', taskState.tasks);
    populateParentOptions();
    // フィルタリング済みタスクをリセットして、最新のタスクリストから再計算
    window.filteredTasks = null;
    window.sortedTasks = null;
    applyAdvancedFiltersToTasks();
  } catch (error) {
    console.error('[Tasks] 読み込みエラー:', error);
    setTasks([]);
    window.filteredTasks = null;
    window.sortedTasks = null;
    renderList();
  }
}

/**
 * タスクを削除する。
 */
export async function deleteTask(id) {
  if (!confirm('このタスクを削除しますか？')) return;
  const deletedId = Number(id);
  try {
    const res = await window.electronAPI.tasksDelete(deletedId);
    if (!res?.success) throw new Error(res?.error || '削除に失敗しました');
    
    // 削除されたタスクを即座に配列から除外（最適化）
    setTasks(taskState.tasks.filter((task) => task.id !== deletedId));
    
    // フィルタリング済み/ソート済みタスクからも削除
    if (window.filteredTasks != null) {
      window.filteredTasks = window.filteredTasks.filter((task) => task.id !== deletedId);
    }
    if (window.sortedTasks != null) {
      window.sortedTasks = window.sortedTasks.filter((task) => task.id !== deletedId);
    }
    
    // 親タスクオプションを更新
    populateParentOptions();
    
    // UIを即座に更新（loadTasks()を呼ばずに直接描画）
    applyAdvancedFiltersToTasks();
    
    // バックエンドから最新データを取得して同期（非同期で実行）
    void loadTasks();
  } catch (error) {
    console.error('[Tasks] 削除エラー:', error);
    alert('タスクの削除に失敗しました: ' + (error.message || '不明なエラー'));
  }
}

/**
 * タグオプションを読み込む。
 */
export async function loadTagOptions() {
  try {
    const res = await window.electronAPI.tasksTagsList();
    if (!res?.success) throw new Error(res?.error || 'タグ取得に失敗しました');
    setTagOptions(Array.isArray(res.items) ? res.items : []);
    const { renderTagFilters } = await import('./render.js');
    const { renderReadingSettingsUI } = await import('./reading-settings.js');
    renderTagFilters();
    renderReadingSettingsUI();
  } catch (error) {
    console.error('[Tasks] タグロードエラー:', error);
    setTagOptions([]);
    const { renderTagFilters } = await import('./render.js');
    const { renderReadingSettingsUI } = await import('./reading-settings.js');
    renderTagFilters();
    renderReadingSettingsUI();
  }
}

/**
 * スケジュールオプションを読み込む。
 */
export async function loadScheduleOptions(forceRefresh = false) {
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

  const scheduleOptionsCache = Array.from(uniqueById.values()).sort((a, b) => a.title.localeCompare(b.title));

  const selectedValue = scheduleId.value;
  scheduleId.innerHTML = '<option value="">未指定</option>';
  scheduleOptionsCache.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = String(option.id);
    opt.textContent = option.title;
    scheduleId.appendChild(opt);
  });
  if (selectedValue && scheduleId.querySelector(`option[value="${selectedValue}"]`)) {
    scheduleId.value = selectedValue;
  }
}

