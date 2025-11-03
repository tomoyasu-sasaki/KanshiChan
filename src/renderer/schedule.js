/**
 * スケジュール管理ドロワーのエントリーポイント。
 * - モジュール化されたサブルーチンを組み合わせて初期化とイベント配線を行う。
 */
import {
  scheduleForm,
  dateInput,
  titleInput,
  timeInput,
  descriptionInput,
} from './schedule/dom.js';
import { scheduleState, setVoiceDraft, clearVoiceDraft } from './schedule/state.js';
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
  normalizeRepeatConfig,
  formatRepeatLabel,
} from './schedule/utils.js';
import { setupRepeatControls, resetRepeatControls, setRepeatSelection } from './schedule/repeat-controls.js';
import { renderSchedules, clearTasksCache } from './schedule/render.js';
import { initializeForm, enterEditMode, exitEditMode } from './schedule/form.js';
import { initializeCsvHandlers } from './schedule/csv.js';
import { initializeBulkAdd } from './schedule/bulk.js';
import { setupTabs } from './schedule/tabs.js';
import { startNotificationCheck, stopNotificationCheck } from './schedule/notifications.js';
import { AudioInputControl } from './components/audio-input-control.js';

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
  setupVoiceIntegration();
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
  window.addEventListener('schedules-updated', async (event) => {
    if (event?.detail?.source === 'schedule-renderer') {
      return;
    }
    stopNotificationCheck();
    if (event?.detail?.source !== 'schedule-model') {
      initializeSchedules();
    }
    await renderAll();
    startNotificationCheck();
  });

  window.addEventListener('schedule-renderer-updated', async () => {
    await renderAll();
  });

  // タスク更新時にキャッシュをクリア
  window.addEventListener('tasks-updated', () => {
    clearTasksCache();
    void renderAll();
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
async function renderAll() {
  const occurrences = computeOccurrences();
  await renderSchedules({
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

// 音声入力統合
let latestVoiceSchedules = [];

/**
 * 音声入力で抽出した予定候補を UI に統合する。
 */
function setupVoiceIntegration() {
  const controlRoot = document.getElementById('scheduleVoiceControl');
  const resultsRoot = document.getElementById('scheduleVoiceResults');
  if (!controlRoot || !resultsRoot) {
    return;
  }

  new AudioInputControl(controlRoot, {
    promptProfile: 'schedule',
    contextId: 'schedule-drawer',
    title: '音声で予定を提案',
    description: '例:「明日の10時にチームミーティングを追加して」',
    onResult: (result) => handleVoiceResult(result, resultsRoot),
    onError: () => {
      resultsRoot.innerHTML = '';
    },
  });
}

/**
 * LLM 応答から予定候補を整形して表示する。
 * @param {object} result
 * @param {HTMLElement} container
 */
function handleVoiceResult(result, container) {
  if (!result || result.type !== 'schedule') {
    latestVoiceSchedules = [];
    container.innerHTML = buildVoiceMessage('予定を抽出できませんでした。もう一度お試しください。');
    clearVoiceDraft();
    return;
  }

  const normalized = (Array.isArray(result.schedules) ? result.schedules : [])
    .map(normalizeVoiceSchedule)
    .filter(Boolean);

  latestVoiceSchedules = normalized;
  clearVoiceDraft();
  renderVoiceSchedules(container, normalized);
}

/**
 * 候補カードを生成してユーザーに選択させる。
 * @param {HTMLElement} container
 * @param {Array<object>} schedules
 */
function renderVoiceSchedules(container, schedules) {
  container.innerHTML = '';

  if (!schedules.length) {
    container.innerHTML = buildVoiceMessage('予定候補は見つかりませんでした');
    return;
  }

  schedules.forEach((schedule, index) => {
    const card = document.createElement('article');
    card.className = 'schedule-voice-card';
    card.dataset.index = String(index);

    const header = document.createElement('header');
    header.innerHTML = `<h5>${escapeHtml(schedule.title || '予定')}</h5>`;
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'schedule-voice-meta';
    const dateTime = [schedule.date, schedule.time].filter(Boolean).join(' ');
    if (dateTime) {
      const span = document.createElement('span');
      span.textContent = dateTime;
      meta.appendChild(span);
    }
    if (schedule.repeatLabel) {
      const repeatEl = document.createElement('span');
      repeatEl.textContent = schedule.repeatLabel;
      meta.appendChild(repeatEl);
    }
    if (meta.children.length > 0) {
      card.appendChild(meta);
    }

    if (schedule.description) {
      const desc = document.createElement('p');
      desc.textContent = schedule.description;
      desc.className = 'schedule-voice-description';
      card.appendChild(desc);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'フォームにセット';
    button.addEventListener('click', () => applyVoiceSchedule(index, button, card));
    card.appendChild(button);

    container.appendChild(card);
  });
}

/**
 * 選択した候補をフォームに反映し、編集しやすくする。
 * @param {number} index
 * @param {HTMLElement} buttonEl
 * @param {HTMLElement} cardEl
 */
function applyVoiceSchedule(index, buttonEl, cardEl) {
  const schedule = latestVoiceSchedules[index];
  if (!schedule) {
    return;
  }

  exitEditMode();
  if (titleInput) {
    titleInput.value = schedule.title || '';
  }
  if (timeInput) {
    timeInput.value = schedule.time || '';
  }
  if (descriptionInput) {
    descriptionInput.value = schedule.description || '';
  }
  if (dateInput && schedule.date) {
    dateInput.value = schedule.date;
  }

  if (schedule.repeat && Array.isArray(schedule.repeat.days) && schedule.repeat.days.length > 0) {
    setRepeatSelection(schedule.repeat.days);
  } else {
    resetRepeatControls();
  }

  setVoiceDraft(schedule);

  if (cardEl) {
    cardEl.classList.add('applied');
  }
  if (buttonEl) {
    buttonEl.textContent = '適用済み';
    buttonEl.classList.add('applied');
    buttonEl.disabled = true;
  }
}

/**
 * LLM から返る候補をフォーム互換の構造に正規化する。
 * @param {object} candidate
 * @returns {object|null}
 */
function normalizeVoiceSchedule(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const normalizedDate = normalizeDateString(candidate.date) || getTodayISODate();
  const normalizedTime = normalizeTimeString(candidate.time);
  const repeat = normalizeRepeatConfig(candidate.repeat);

  return {
    title: (candidate.title || '').trim(),
    date: normalizedDate,
    time: normalizedTime,
    description: (candidate.description || '').trim(),
    repeat,
    repeatLabel: repeat ? formatRepeatLabel(repeat) : '',
    ttsMessage: candidate.ttsMessage || '',
  };
}

/**
 * 日付文字列を YYYY-MM-DD 形式に統一する。
 * @param {string} value
 * @returns {string|null}
 */
function normalizeDateString(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  } catch (error) {
    console.warn('[Schedule] 日付の正規化に失敗:', error);
  }
  return null;
}

/**
 * 時刻文字列を 24 時間表記へ整形する。
 * @param {string} value
 * @returns {string}
 */
function normalizeTimeString(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hh, mm] = trimmed.split(':');
    return `${String(Number(hh)).padStart(2, '0')}:${mm}`;
  }
  return '';
}

/**
 * 音声候補が無い場合のメッセージを HTML として返す。
 * @param {string} message
 * @returns {string}
 */
function buildVoiceMessage(message) {
  return `<p class="schedule-voice-helper">${escapeHtml(message)}</p>`;
}

/**
 * 単純な HTML エスケープを行うユーティリティ。
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 初期化
initializeScheduleDrawer();

window.reloadScheduleNotifications = function reloadScheduleNotifications() {
  stopNotificationCheck();
  startNotificationCheck();
};
