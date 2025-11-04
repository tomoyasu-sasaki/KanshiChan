/**
 * 繰り返し設定の制御を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState } from './state.js';

/**
 * 繰り返しコントロールの初期化を行う。
 */
export function setupRepeatControls() {
  const { repeatType, repeatWeekdayContainer } = getEls();
  if (!repeatType) return;
  const toggleVisibility = () => {
    repeatWeekdayContainer.style.display = repeatType.value === 'weekly' ? 'flex' : 'none';
  };
  repeatType.addEventListener('change', toggleVisibility);
  toggleVisibility();
}

/**
 * 繰り返し設定を収集する。
 */
export function gatherRepeatConfig() {
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

/**
 * 繰り返しフィールドに値を設定する。
 */
export function populateRepeatFields(repeatConfig) {
  const { repeatType, repeatInterval, repeatWeekdayInputs, repeatWeekdayContainer } = getEls();
  if (!repeatType) return;
  if (!repeatConfig) {
    repeatType.value = 'none';
    repeatInterval.value = '1';
    repeatWeekdayInputs?.forEach((input) => {
      input.checked = false;
    });
  } else {
    repeatType.value = repeatConfig.type;
    repeatInterval.value = String(repeatConfig.interval ?? 1);
    if (repeatConfig.type === 'weekly') {
      const set = new Set(repeatConfig.weekdays || []);
      repeatWeekdayInputs?.forEach((input) => {
        input.checked = set.has(Number(input.value));
      });
    } else {
      repeatWeekdayInputs?.forEach((input) => {
        input.checked = false;
      });
    }
  }
  repeatWeekdayContainer.style.display = repeatType.value === 'weekly' ? 'flex' : 'none';
}

/**
 * 繰り返しコントロールをリセットする。
 */
export function resetRepeatControls() {
  populateRepeatFields(null);
}

/**
 * 週次繰り返しの曜日選択を設定する。
 */
export function setRepeatSelection(days) {
  const { repeatType, repeatWeekdayInputs } = getEls();
  if (!repeatType || !repeatWeekdayInputs) return;
  repeatType.value = 'weekly';
  const set = new Set(Array.isArray(days) ? days : []);
  repeatWeekdayInputs.forEach((input) => {
    input.checked = set.has(Number(input.value));
  });
}

/**
 * 親タスクオプションを設定する。
 */
export function populateParentOptions(excludeId = null) {
  const { parentId } = getEls();
  if (!parentId) return;
  const prev = parentId.value;
  parentId.innerHTML = '<option value="">未指定</option>';
  // 親候補はルート（親なし）タスクのみ。孫タスクを禁止するため
  const candidates = taskState.tasks
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

