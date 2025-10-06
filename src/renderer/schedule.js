/**
 * スケジュール管理ドロワーのエントリーポイント。
 * - モジュール化されたサブルーチンを組み合わせて初期化とイベント配線を行う。
 */
import {
  scheduleForm,
  dateInput,
  titleInput,
  timeInput,
} from './schedule/dom.js';
import { scheduleState } from './schedule/state.js';
import {
  initializeSchedules,
  getSchedules,
  getScheduleById,
  deleteScheduleById,
} from './schedule/model.js';
import {
  getTodayISODate,
  getTodayDisplayDate,
  getNextOccurrenceInfo,
} from './schedule/utils.js';
import { setupRepeatControls, resetRepeatControls } from './schedule/repeat-controls.js';
import { renderSchedules } from './schedule/render.js';
import { initializeForm, enterEditMode, exitEditMode } from './schedule/form.js';
import { initializeCsvHandlers } from './schedule/csv.js';
import { initializeBulkAdd } from './schedule/bulk.js';
import { setupTabs } from './schedule/tabs.js';
import { startNotificationCheck, stopNotificationCheck } from './schedule/notifications.js';

/**
 * スケジュールドロワー全体を初期化するエントリーポイント。
 */
function initializeScheduleDrawer() {
  initializeSchedules();
  setupTodayHeader();
  setupDateInput();
  setupTabs();
  setupRepeatControls();
  setupCsv();
  setupBulkAdd();
  setupForm();
  renderAll();
  startNotificationCheck();
  registerGlobalListeners();
}

/**
 * 当日のヘッダー表示を挿入する。
 * 既に挿入済みの場合は警告なくスキップ。
 */
function setupTodayHeader() {
  try {
    const container = document.querySelector('.schedule-form-container');
    const heading = container ? container.querySelector('h3') : null;
    if (container && heading) {
      const info = document.createElement('div');
      info.className = 'today-schedule-header';
      info.textContent = `${getTodayDisplayDate()} のスケジュール`;
      container.insertBefore(info, heading);
    }
  } catch (error) {
    console.warn('[Schedule] 今日のヘッダー生成に失敗:', error);
  }
}

/**
 * 日付入力を今日に固定し、UI から非表示にする。
 */
function setupDateInput() {
  try {
    if (dateInput) {
      dateInput.value = getTodayISODate();
      const group = dateInput.closest('.form-group');
      if (group) group.style.display = 'none';
    }
  } catch (error) {
    console.warn('[Schedule] 日付入力の初期化に失敗:', error);
  }
}

/**
 * CSV ボタンのハンドラを初期化する。
 */
function setupCsv() {
  initializeCsvHandlers({
    onSchedulesChanged: renderAll,
  });
}

/**
 * 一括追加ボタンのハンドラを初期化する。
 */
function setupBulkAdd() {
  initializeBulkAdd({
    onSchedulesChanged: renderAll,
  });
}

/**
 * 個別追加フォームのバリデーション・送信処理を登録する。
 */
function setupForm() {
  initializeForm({
    onSchedulesChanged: renderAll,
  });
}

/**
 * スケジュール更新通知に反応して再初期化・再描画を行う。
 */
function registerGlobalListeners() {
  window.addEventListener('schedules-updated', (event) => {
    if (event?.detail?.source === 'schedule-renderer') {
      return;
    }
    stopNotificationCheck();
    initializeSchedules();
    renderAll();
    startNotificationCheck();
  });

  window.addEventListener('schedule-renderer-updated', () => {
    renderAll();
  });
}

/**
 * 表示用に各スケジュールの次回発生情報を事前計算する。
 * @returns {Map<number,object>} schedule.id -> occurrence
 */
function computeOccurrences() {
  const map = new Map();
  const now = new Date();
  getSchedules().forEach((schedule) => {
    const occurrence = getNextOccurrenceInfo(schedule, now);
    if (occurrence?.dateTime) {
      map.set(schedule.id, occurrence);
    }
  });
  return map;
}

/**
 * スケジュール一覧の再描画を実行する。
 */
function renderAll() {
  const occurrences = computeOccurrences();
  renderSchedules({
    schedules: getSchedules(),
    occurrences,
    editingId: scheduleState.editingScheduleId,
    onEdit: handleEditSchedule,
    onDelete: handleDeleteSchedule,
  });
}

/**
 * 編集ボタン押下時に対象スケジュールをフォームへロードする。
 * @param {number} id 対象スケジュールID
 */
function handleEditSchedule(id) {
  const schedule = getScheduleById(id);
  if (!schedule) {
    console.warn('[Schedule] 編集対象が見つかりません:', id);
    return;
  }
  enterEditMode(schedule);
  renderAll();
}

/**
 * 削除ボタン押下時の処理をまとめる。
 * @param {number} id 対象スケジュールID
 */
function handleDeleteSchedule(id) {
  if (scheduleState.editingScheduleId === id) {
    exitEditMode();
  }
  deleteScheduleById(id);
  resetRepeatControls();
  renderAll();
}

// 初期化
initializeScheduleDrawer();
