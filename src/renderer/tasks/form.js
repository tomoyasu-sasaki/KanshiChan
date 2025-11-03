/**
 * タスクフォーム関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { parseTagsInput, toDateInput } from './utils.js';
import { loadTasks } from './model.js';
import { populateParentOptions, populateRepeatFields, gatherRepeatConfig } from './repeat-controls.js';

/**
 * フォームの初期化を行う。
 */
export function setupForm() {
  const { form, cancelEditBtn } = getEls();
  if (!form) return;
  form.addEventListener('submit', onSubmitForm);
  cancelEditBtn?.addEventListener('click', exitEdit);
}

/**
 * フォーム送信処理。
 */
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
      const { loadTagOptions } = await import('./model.js');
      await loadTagOptions();
    }
    // タスク更新イベントを発行
    window.dispatchEvent(new CustomEvent('tasks-updated'));
  } catch (error) {
    console.error('[Tasks] 送信エラー:', error);
  } finally {
    submitBtn.disabled = false;
  }
}

/**
 * 編集モードを開始する。
 */
export function startEdit(task) {
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

/**
 * サブタスク作成を開始する。
 */
export function startSubtask(task) {
  const { parentId, title } = getEls();
  // サブタスク作成時は親候補から自身を除外しない（親として選択するため）
  populateParentOptions();
  parentId.value = String(task.id);
  title.focus();
}

/**
 * 編集モードを終了する。
 */
export function exitEdit() {
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

