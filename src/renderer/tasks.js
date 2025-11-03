/**
 * タスク管理機能のエントリーポイント。
 * - モジュール化されたサブルーチンを組み合わせて初期化とイベント配線を行う。
 */
import { getEls } from './tasks/dom.js';
import { taskState, setReadingSettings } from './tasks/state.js';
import { DEFAULT_READING_SETTINGS } from './tasks/constants.js';
import { setupForm } from './tasks/form.js';
import { setupFilters, setupAdvancedFilters } from './tasks/filters.js';
import { setupSortControls } from './tasks/sort.js';
import { setupViewToggle } from './tasks/view-toggle.js';
import { setupRepeatControls } from './tasks/repeat-controls.js';
import { setupVoice } from './tasks/voice.js';
import { loadTagOptions, loadScheduleOptions, loadTasks } from './tasks/model.js';
import { renderTagFilters } from './tasks/render.js';
import { renderReadingSettingsUI, loadReadingSettings } from './tasks/reading-settings.js';
import { scheduleDailyAnnouncement } from './tasks/announcement.js';
import { setupTaskNotifications } from './tasks/notifications.js';
import { scheduleState } from './schedule/state.js';

/**
 * スケジュール更新イベントのリスナーを登録する。
 */
function registerScheduleListeners() {
  window.addEventListener('schedules-updated', () => {
    void loadScheduleOptions(true);
  });
  window.addEventListener('schedule-renderer-updated', () => {
    void loadScheduleOptions(true);
  });
}

/**
 * タスク機能全体を初期化する。
 */
function initializeTasks() {
  // 読み上げ設定を初期化
  const readingSettings = loadReadingSettings();
  setReadingSettings(readingSettings);

  // 各機能の初期化
  setupForm();
  setupFilters();
  setupAdvancedFilters();
  setupSortControls();
  setupViewToggle();
  setupRepeatControls();
  setupVoice();
  
  // データの読み込み
  void loadScheduleOptions();
  renderReadingSettingsUI();
  void loadTagOptions();
  void loadTasks();
  
  // 読み上げと通知のスケジュール
  scheduleDailyAnnouncement();
  setupTaskNotifications();
  
  // イベントリスナーの登録
  registerScheduleListeners();
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
  initializeTasks();
});
