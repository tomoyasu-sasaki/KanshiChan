/**
 * タスクのドラッグ&ドロップ関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState, setDragState } from './state.js';
import { loadTasks } from './model.js';

/**
 * ドラッグイベントをバインドする。
 */
export function bindDragEvents(element) {
  element.addEventListener('dragstart', (event) => {
    const taskId = Number(element.dataset.taskId);
    setDragState({
      taskId,
      parentId: element.dataset.parentId ? Number(element.dataset.parentId) : null,
    });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(taskId));
    element.classList.add('dragging');
  });
  element.addEventListener('dragover', (event) => {
    if (!taskState.dragState) return;
    const targetParent = element.dataset.parentId ? Number(element.dataset.parentId) : null;
    if (taskState.dragState.parentId !== targetParent) return;
    event.preventDefault();
    element.classList.add('drag-over');
  });
  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over');
  });
  element.addEventListener('drop', async (event) => {
    if (!taskState.dragState) return;
    const targetParent = element.dataset.parentId ? Number(element.dataset.parentId) : null;
    if (taskState.dragState.parentId !== targetParent) return;
    const targetId = Number(element.dataset.taskId);
    const draggedId = taskState.dragState.taskId;
    if (draggedId === targetId) return;
    element.classList.remove('drag-over');
    event.preventDefault();
    try {
      await reorderWithinParent(targetParent, draggedId, targetId, event.offsetY, element.offsetHeight);
      setDragState(null);
    } catch (error) {
      console.error('[Tasks] 並び替えエラー:', error);
    }
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
    element.classList.remove('drag-over');
    setDragState(null);
  });
}

/**
 * 親タスク内でタスクを並び替える。
 */
async function reorderWithinParent(parentId, draggedId, targetId, offsetY, targetHeight) {
  const siblings = taskState.tasks
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

