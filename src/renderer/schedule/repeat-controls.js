/**
 * 繰り返し設定UI（プリセット/曜日トグル）の状態管理を担当するモジュール。
 */
import { REPEAT_PRESET_CONFIG } from './constants.js';
import { arraysEqual, formatRepeatLabel } from './utils.js';

let repeatPresetButtons = [];
let repeatDayCheckboxes = [];
let repeatSummaryEl = null;

/**
 * 繰り返し設定UIのイベント登録と初期状態のクリアを行う。
 */
export function setupRepeatControls() {
  repeatPresetButtons = Array.from(document.querySelectorAll('.repeat-preset'));
  repeatDayCheckboxes = Array.from(document.querySelectorAll('.repeat-day-checkbox'));
  repeatSummaryEl = document.getElementById('repeatSummary');

  repeatPresetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const presetKey = button.dataset.repeat || 'none';
      setRepeatSelection(REPEAT_PRESET_CONFIG[presetKey] ?? []);
    });
  });

  repeatDayCheckboxes.forEach((checkbox) => {
    const wrapper = checkbox.closest('.repeat-day');
    const syncState = () => {
      if (wrapper) {
        wrapper.classList.toggle('active', checkbox.checked);
      }
      updateRepeatSummary();
    };

    checkbox.addEventListener('change', syncState);
    syncState();
  });

  setRepeatSelection([]);
}

/**
 * 繰り返し選択を空に戻す。
 */
export function resetRepeatControls() {
  setRepeatSelection([]);
}

/**
 * 現在チェックされている曜日を取得する。
 * @returns {number[]} ソート済み曜日配列
 */
export function getSelectedRepeatDays() {
  return repeatDayCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);
}

/**
 * 指定された曜日の選択状態をUIへ反映する。
 * @param {number[]} days 曜日インデックス配列
 */
export function setRepeatSelection(days = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(days) ? days : [])
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  repeatDayCheckboxes.forEach((checkbox) => {
    const shouldCheck = normalized.includes(Number(checkbox.value));
    checkbox.checked = shouldCheck;
    const wrapper = checkbox.closest('.repeat-day');
    if (wrapper) {
      wrapper.classList.toggle('active', shouldCheck);
    }
  });

  updateRepeatSummary();
}

/**
 * 現在の選択がプリセットに一致する場合は該当ボタンを強調する。
 * @param {number[]} days 選択中の曜日
 */
function syncPresetHighlightToSelection(days) {
  const matchedEntry = Object.entries(REPEAT_PRESET_CONFIG).find(([, presetDays]) => {
    const sortedPreset = [...presetDays].sort((a, b) => a - b);
    return arraysEqual(sortedPreset, days);
  });

  const presetKey = matchedEntry ? matchedEntry[0] : null;

  repeatPresetButtons.forEach((button) => {
    button.classList.toggle('active', presetKey !== null && button.dataset.repeat === presetKey);
  });
}

/**
 * UI 下部のサマリテキストを更新する。
 */
function updateRepeatSummary() {
  if (!repeatSummaryEl) {
    return;
  }

  const days = getSelectedRepeatDays();
  syncPresetHighlightToSelection(days);

  if (days.length === 0) {
    repeatSummaryEl.textContent = '繰り返しなし';
    return;
  }

  repeatSummaryEl.textContent = formatRepeatLabel({ type: 'weekly', days });
}
