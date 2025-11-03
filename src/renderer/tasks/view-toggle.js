/**
 * ビュートグル関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { renderKanbanView } from './render.js';
import { applySortingAndGrouping } from './sort.js';

/**
 * ビュートグルの初期化を行う。
 */
export function setupViewToggle() {
  const { viewToggles, items } = getEls();
  if (!viewToggles || !items) return;

  const savedView = localStorage.getItem('tasks.view') || 'list';
  viewToggles.forEach((toggle) => {
    if (toggle.value === savedView) {
      toggle.checked = true;
    }
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        const view = toggle.value;
        localStorage.setItem('tasks.view', view);
        items.className = `tasks-items tasks-view-${view}`;
        applyCurrentView();
      }
    });
  });

  items.className = `tasks-items tasks-view-${savedView}`;
  applyCurrentView();
}

/**
 * 現在のビューを適用する。
 */
export function applyCurrentView() {
  const { items } = getEls();
  if (!items) return;
  const view = localStorage.getItem('tasks.view') || 'list';
  if (view === 'kanban') {
    renderKanbanView();
  } else {
    applySortingAndGrouping();
  }
}

