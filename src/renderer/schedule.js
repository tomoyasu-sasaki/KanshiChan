/**
 * スケジュール管理ドロワー。
 * - localStorage に予定を保持し、Electron 通知と VOICEVOX 読み上げのトリガーを担う。
 * - 通知タイミングやメッセージは constants/schedule に集約。
 */
import { SCHEDULE_NOTIFICATION_LEAD_MINUTES, SCHEDULE_NOTIFICATION_COOLDOWN_MS, SCHEDULE_NOTIFICATION_SPEAKER_ID, SCHEDULE_MESSAGES } from '../constants/schedule.js';

// スケジュール保存用配列
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const REPEAT_TYPE_ALIASES = Object.freeze({
  weekly: 'weekly',
  week: 'weekly',
  weekdays: 'weekdays',
  weekday: 'weekdays',
  平日: 'weekdays',
  daily: 'daily',
  everyday: 'daily',
  毎日: 'daily',
});

const PRESET_REPEAT_DAYS = Object.freeze({
  weekdays: [1, 2, 3, 4, 5],
  daily: [0, 1, 2, 3, 4, 5, 6],
});

function normalizeRepeatConfig(repeat) {
  if (!repeat || typeof repeat !== 'object') {
    return null;
  }

  const normalizedTypeKey = typeof repeat.type === 'string' ? repeat.type.trim().toLowerCase() : '';
  const mappedType = REPEAT_TYPE_ALIASES[normalizedTypeKey] || 'weekly';

  let candidateDays = Array.isArray(repeat.days) ? repeat.days : [];
  if (candidateDays.length === 0 && PRESET_REPEAT_DAYS[mappedType]) {
    candidateDays = PRESET_REPEAT_DAYS[mappedType];
  }

  const uniqueDays = Array.from(
    new Set(
      candidateDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  if (uniqueDays.length === 0) {
    return null;
  }

  return {
    type: 'weekly',
    days: uniqueDays,
  };
}

function getOccurrenceKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeScheduleEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const repeat = normalizeRepeatConfig(entry.repeat);
  const normalized = {
    id: entry.id ?? Date.now(),
    title: entry.title ?? '',
    date: entry.date ?? getTodayISODate(),
    time: entry.time ?? '00:00',
    description: entry.description || '',
    notified: Boolean(entry.notified),
    preNotified: Boolean(entry.preNotified),
    startNotified: Boolean(entry.startNotified),
    ttsMessage: null,
    ttsLeadMessage: null,
    repeat,
    lastOccurrenceKey: entry.lastOccurrenceKey || (repeat ? null : entry.date ?? getTodayISODate()),
  };

  const existingTtsMessage = typeof entry.ttsMessage === 'string' ? entry.ttsMessage.trim() : '';
  normalized.ttsMessage = existingTtsMessage || buildRepeatAwareStartFallback(normalized);

  const existingLeadMessage = typeof entry.ttsLeadMessage === 'string' ? entry.ttsLeadMessage.trim() : '';
  normalized.ttsLeadMessage = existingLeadMessage || null;

  return normalized;
}

let schedules = (JSON.parse(localStorage.getItem('schedules')) || [])
  .map(normalizeScheduleEntry)
  .filter(Boolean);

function ensureRepeatStateInitialization() {
  const now = new Date();
  let updated = false;

  schedules.forEach((schedule) => {
    if (schedule.repeat && !schedule.lastOccurrenceKey) {
      const occurrence = getNextOccurrenceInfo(schedule, now);
      if (occurrence?.key) {
        schedule.lastOccurrenceKey = occurrence.key;
        updated = true;
      }
    }
  });

  if (updated) {
    saveSchedules();
  }
}

ensureRepeatStateInitialization();

// フォーム要素取得
const scheduleForm = document.getElementById('scheduleForm');
const scheduleItems = document.getElementById('scheduleItems');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');
const descriptionInput = document.getElementById('description');
const scheduleFormContainer = document.querySelector('.schedule-form-container');
const scheduleHeading = scheduleFormContainer ? scheduleFormContainer.querySelector('h3') : null;
const scheduleSubmitBtn = document.getElementById('scheduleSubmitBtn');
const scheduleCancelEditBtn = document.getElementById('scheduleCancelEditBtn');
const scheduleEditHint = document.getElementById('scheduleEditHint');
const scheduleCsvExportBtn = document.getElementById('scheduleCsvExportBtn');
const scheduleCsvImportBtn = document.getElementById('scheduleCsvImportBtn');
const scheduleCsvInput = document.getElementById('scheduleCsvInput');
let repeatPresetButtons = [];
let repeatDayCheckboxes = [];
let repeatSummaryEl = null;
let editingScheduleId = null;

// 現在時刻チェック用タイマー
let notificationCheckInterval;

// TTS再生キュー
const ttsQueue = [];
let isTTSPlaying = false;

// 日付ユーティリティ
function getTodayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // <input type="date"> 用
}

function getTodayDisplayDate() {
  const iso = getTodayISODate();
  // yyyy-mm-dd -> yyyy/mm/dd
  return iso.replaceAll('-', '/');
}

function getNextOccurrenceInfo(schedule, referenceDate = new Date()) {
  if (!schedule || !schedule.time) {
    return null;
  }

  const [hoursString, minutesString] = schedule.time.split(':');
  const hours = Number.parseInt(hoursString, 10) || 0;
  const minutes = Number.parseInt(minutesString, 10) || 0;

  if (!schedule.repeat) {
    const date = new Date(`${schedule.date}T${schedule.time}`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return {
      dateTime: date,
      key: getOccurrenceKeyFromDate(date),
      isRepeat: false,
    };
  }

  if (schedule.repeat.type === 'weekly' && Array.isArray(schedule.repeat.days) && schedule.repeat.days.length > 0) {
    const reference = new Date(referenceDate);
    reference.setSeconds(0, 0);

    const daysSet = new Set(schedule.repeat.days);

    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(reference);
      candidate.setDate(candidate.getDate() + offset);
      const candidateDay = candidate.getDay();

      if (!daysSet.has(candidateDay)) {
        continue;
      }

      candidate.setHours(hours, minutes, 0, 0);

      // 未来 (現在含む) の最初の occurrence を採用
      if (candidate >= reference) {
        return {
          dateTime: candidate,
          key: getOccurrenceKeyFromDate(candidate),
          isRepeat: true,
        };
      }
    }
  }

  return null;
}

function formatRepeatLabel(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days) || repeat.days.length === 0) {
    return '';
  }

  const label = repeat.days
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day])
    .join('・');

  return `毎週 ${label}`;
}

function hasWeeklyRepeat(schedule) {
  return Boolean(
    schedule &&
      schedule.repeat &&
      schedule.repeat.type === 'weekly' &&
      Array.isArray(schedule.repeat.days) &&
      schedule.repeat.days.length > 0
  );
}

function getScheduleTitle(schedule) {
  const rawTitle = typeof schedule?.title === 'string' ? schedule.title.trim() : '';
  return rawTitle || '予定';
}

function getScheduleTime(schedule) {
  const rawTime = typeof schedule?.time === 'string' ? schedule.time.trim() : '';
  return rawTime || null;
}

function buildRepeatAwareLeadFallback(schedule, occurrenceInfo = null, leadMinutes = SCHEDULE_NOTIFICATION_LEAD_MINUTES) {
  const title = getScheduleTitle(schedule);
  const timeText = getScheduleTime(schedule);
  const hasRepeat = hasWeeklyRepeat(schedule);
  const suffix = '準備をお願いします。';

  if (hasRepeat) {
    if (occurrenceInfo?.isRepeat && timeText) {
      return `今日も${timeText}から ${title} が始まります。あと${leadMinutes}分です。${suffix}`;
    }

    const repeatLabel = formatRepeatLabel(schedule.repeat);
    if (timeText) {
      return `${repeatLabel} の ${title} が${timeText}に始まります。あと${leadMinutes}分です。${suffix}`;
    }
    return `${repeatLabel} の ${title} が始まります。あと${leadMinutes}分です。${suffix}`;
  }

  if (timeText) {
    return `${title} が${timeText}に始まります。あと${leadMinutes}分です。${suffix}`;
  }

  return `あと${leadMinutes}分で ${title} が始まります。${suffix}`;
}

function buildRepeatAwareStartFallback(schedule, occurrenceInfo = null) {
  const title = getScheduleTitle(schedule);
  const timeText = getScheduleTime(schedule);
  const hasRepeat = hasWeeklyRepeat(schedule);

  if (hasRepeat) {
    if (occurrenceInfo?.isRepeat && timeText) {
      return `今日も${timeText}になりました。${title} を始めましょう。`;
    }

    const repeatLabel = formatRepeatLabel(schedule.repeat);
    if (timeText) {
      return `${repeatLabel} の ${title} の開始時刻です。${timeText}になりました。`;
    }
    return `${repeatLabel} の ${title} の開始時刻です。`;
  }

  if (timeText) {
    return `${title} の開始時刻です。${timeText}になりました。`;
  }

  return `${title} の時間です。`;
}

const REPEAT_PRESET_CONFIG = Object.freeze({
  none: [],
  weekdays: [1, 2, 3, 4, 5],
  everyday: [0, 1, 2, 3, 4, 5, 6],
});

const REPEAT_TOKEN_MAP = Object.freeze({
  sun: 0,
  sunday: 0,
  0: 0,
  日: 0,
  mon: 1,
  monday: 1,
  1: 1,
  月: 1,
  tue: 2,
  tuesday: 2,
  2: 2,
  火: 2,
  wed: 3,
  wednesday: 3,
  3: 3,
  水: 3,
  thu: 4,
  thursday: 4,
  4: 4,
  木: 4,
  fri: 5,
  friday: 5,
  5: 5,
  金: 5,
  sat: 6,
  saturday: 6,
  6: 6,
  土: 6,
});

function ensureRepeatOccurrenceState(schedule, occurrenceKey) {
  if (!schedule || !schedule.repeat || !occurrenceKey) {
    return false;
  }

  if (schedule.lastOccurrenceKey !== occurrenceKey) {
    schedule.lastOccurrenceKey = occurrenceKey;
    schedule.preNotified = false;
    schedule.startNotified = false;
    schedule.notified = false;
    return true;
  }

  return false;
}

function getSelectedRepeatDays() {
  return repeatDayCheckboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);
}

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

function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

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

function setRepeatSelection(days = []) {
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

function setRepeatPreset(presetKey) {
  const presetDays = REPEAT_PRESET_CONFIG[presetKey] ?? [];
  setRepeatSelection(presetDays);
}

function setupRepeatControls() {
  repeatPresetButtons = Array.from(document.querySelectorAll('.repeat-preset'));
  repeatDayCheckboxes = Array.from(document.querySelectorAll('.repeat-day-checkbox'));
  repeatSummaryEl = document.getElementById('repeatSummary');

  repeatPresetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const presetKey = button.dataset.repeat || 'none';
      setRepeatPreset(presetKey);
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

function resetRepeatControls() {
  setRepeatSelection([]);
}

function setEditModeUI(isEditing) {
  if (scheduleFormContainer) {
    scheduleFormContainer.classList.toggle('editing', Boolean(isEditing));
  }
  if (scheduleHeading) {
    scheduleHeading.textContent = isEditing ? 'スケジュール編集' : 'スケジュール追加';
  }
  if (scheduleSubmitBtn) {
    scheduleSubmitBtn.textContent = isEditing ? '更新' : '追加';
  }
  if (scheduleCancelEditBtn) {
    scheduleCancelEditBtn.hidden = !isEditing;
  }
  if (scheduleEditHint) {
    scheduleEditHint.hidden = !isEditing;
  }
}

function populateFormForSchedule(schedule) {
  if (!schedule) {
    return;
  }

  if (titleInput) {
    titleInput.value = schedule.title || '';
  }
  if (dateInput) {
    dateInput.value = schedule.date || getTodayISODate();
  }
  if (timeInput) {
    timeInput.value = schedule.time || '';
  }
  if (descriptionInput) {
    descriptionInput.value = schedule.description || '';
  }
  setRepeatSelection(schedule.repeat?.days || []);
}

function enterEditMode(schedule) {
  if (!schedule || !scheduleForm) {
    return;
  }

  editingScheduleId = schedule.id;
  scheduleForm.dataset.mode = 'edit';
  setEditModeUI(true);
  populateFormForSchedule(schedule);

  const singleTabButton = document.querySelector('.tab-button[data-tab="single"]');
  if (singleTabButton && !singleTabButton.classList.contains('active')) {
    singleTabButton.click();
  }

  if (titleInput) {
    titleInput.focus();
  }
}

function exitEditMode() {
  editingScheduleId = null;
  if (scheduleForm) {
    delete scheduleForm.dataset.mode;
  }
  setEditModeUI(false);

  if (titleInput) {
    titleInput.value = '';
  }
  if (descriptionInput) {
    descriptionInput.value = '';
  }
  if (timeInput) {
    timeInput.value = '';
  }
  if (dateInput) {
    dateInput.value = getTodayISODate();
  }
  setRepeatSelection([]);

  if (timeInput) {
    timeInput.focus();
  }
}

if (scheduleCancelEditBtn) {
  scheduleCancelEditBtn.addEventListener('click', () => {
    exitEditMode();
    renderSchedules();
  });
}

function parseRepeatSpecification(rawSpec) {
  if (!rawSpec || typeof rawSpec !== 'string') {
    return [];
  }

  const normalized = rawSpec.trim();
  if (!normalized) {
    return [];
  }

  const lower = normalized.toLowerCase();

  if (['weekday', 'weekdays', '平日'].includes(lower)) {
    return [...REPEAT_PRESET_CONFIG.weekdays];
  }

  if (['weekend', '週末'].includes(lower)) {
    return [0, 6];
  }

  if (['everyday', 'daily', 'all', '毎日'].includes(lower)) {
    return [...REPEAT_PRESET_CONFIG.everyday];
  }

  const tokens = normalized
    .split(/[,/\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/曜日|曜/g, ''));

  const days = tokens
    .map((token) => {
      const key = token.toLowerCase();
      return REPEAT_TOKEN_MAP[key] ?? REPEAT_TOKEN_MAP[token] ?? null;
    })
    .filter((value) => value !== null);

  return Array.from(new Set(days)).sort((a, b) => a - b);
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // yyyy/mm/dd のスケジュール」ヘッダーを追加
  try {
    const container = document.querySelector('.schedule-form-container');
    const heading = container ? container.querySelector('h3') : null;
    if (container && heading) {
      const info = document.createElement('div');
      info.className = 'today-schedule-header';
      info.textContent = `${getTodayDisplayDate()} のスケジュール`;
      container.insertBefore(info, heading);
    }
  } catch {}

  // 日付入力は本日固定にして非表示
  try {
    const dateInput = document.getElementById('date');
    if (dateInput) {
      dateInput.value = getTodayISODate();
      const group = dateInput.closest('.form-group');
      if (group) group.style.display = 'none';
    }
  } catch {}

  // タブ切り替え
  setupTabs();

  // 繰り返し設定の初期化
  setupRepeatControls();
  setEditModeUI(false);

  if (scheduleCsvExportBtn) {
    scheduleCsvExportBtn.addEventListener('click', exportSchedulesToCsv);
  }

  if (scheduleCsvImportBtn) {
    scheduleCsvImportBtn.addEventListener('click', () => {
      scheduleCsvInput?.click();
    });
  }

  if (scheduleCsvInput) {
    scheduleCsvInput.addEventListener('change', handleCsvFileSelection);
  }

  // 一括追加ボタン
  const bulkAddBtn = document.getElementById('bulkAddBtn');
  if (bulkAddBtn) {
    bulkAddBtn.addEventListener('click', handleBulkAdd);
  }

  renderSchedules();
  startNotificationCheck();

  // 残り時間表示を30秒ごとに更新
  setInterval(() => {
    renderSchedules();
  }, 30000);

  // 外部からのスケジュール更新イベントをリッスン（音声入力など）
  window.addEventListener('schedules-updated', (event) => {
    if (event?.detail?.source === 'schedule-renderer') {
      return;
    }
    console.log('[Schedule] スケジュール更新イベントを受信');
    // localStorageから最新のスケジュールを再読み込み
    schedules = (JSON.parse(localStorage.getItem('schedules')) || [])
      .map(normalizeScheduleEntry)
      .filter(Boolean);
    ensureRepeatStateInitialization();
    renderSchedules();
    // 通知チェックを再起動（新しいスケジュールを認識させる）
    startNotificationCheck();
  });
});

// スケジュール追加/更新
scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = titleInput ? titleInput.value : '';
  const date = dateInput?.value || getTodayISODate();
  const time = timeInput ? timeInput.value : '';
  const description = descriptionInput ? descriptionInput.value : '';
  const normalizedTitleForMessage = title.trim() || title;

  const selectedRepeatDays = getSelectedRepeatDays();
  const repeat = selectedRepeatDays.length > 0 ? { type: 'weekly', days: selectedRepeatDays } : null;

  const isEditing = editingScheduleId !== null;
  const existingSchedule = isEditing ? schedules.find((item) => item.id === editingScheduleId) : null;
  const draftSchedule = {
    title,
    time,
    date,
    description,
    repeat,
  };
  let ttsMessage = typeof existingSchedule?.ttsMessage === 'string' ? existingSchedule.ttsMessage.trim() : '';
  if (!ttsMessage) {
    ttsMessage = buildRepeatAwareStartFallback(draftSchedule);
  }

  if (title && date && time && window.electronAPI?.generateScheduleTts) {
    try {
      const result = await window.electronAPI.generateScheduleTts({
        title: normalizedTitleForMessage || title,
        date,
        time,
        description,
        repeat,
      });

      if (result?.success && typeof result.message === 'string' && result.message.trim().length > 0) {
        ttsMessage = result.message.trim();
      }
    } catch (error) {
      console.warn('[Schedule] TTS メッセージ生成に失敗:', error);
    }
  }

  if (isEditing) {
    if (existingSchedule) {
      const index = schedules.findIndex((item) => item.id === editingScheduleId);
      if (index !== -1) {
        const updated = normalizeScheduleEntry({
          ...existingSchedule,
          id: existingSchedule.id,
          title,
          date,
          time,
          description,
          repeat,
          notified: false,
          preNotified: false,
          startNotified: false,
          ttsMessage,
          lastOccurrenceKey: null,
        });
        schedules.splice(index, 1, updated);
      } else {
        console.warn('[Schedule] 編集対象のスケジュールが見つかりません:', editingScheduleId);
      }
    } else {
      console.warn('[Schedule] 編集対象のスケジュール情報が取得できませんでした');
    }
  } else {
    const schedule = normalizeScheduleEntry({
      id: Date.now(),
      title,
      date,
      time,
      description,
      notified: false,
      preNotified: false,
      startNotified: false,
      ttsMessage,
      repeat,
      lastOccurrenceKey: null,
    });
    schedules.push(schedule);
  }

  ensureRepeatStateInitialization();
  saveSchedules();

  if (isEditing) {
    exitEditMode();
  } else {
    if (titleInput) {
      titleInput.value = '';
    }
    if (timeInput) {
      timeInput.value = '';
      timeInput.focus();
    }
    resetRepeatControls();
  }

  renderSchedules();

  // 保存成功通知（サイレント版 - 連続登録時にうるさくならないように）
  // await window.electronAPI.sendNotification({
  //   title: SCHEDULE_MESSAGES.addTitle,
  //   body: SCHEDULE_MESSAGES.addBody(title)
  // });
});

// スケジュールを保存
function saveSchedules() {
  localStorage.setItem('schedules', JSON.stringify(schedules));
  syncSchedulesWithMain();
  notifyScheduleUpdate();
}

function getSerializableSchedules() {
  return schedules.map((schedule) => ({
    id: schedule.id,
    title: schedule.title,
    date: schedule.date,
    time: schedule.time,
    description: schedule.description,
    repeat: schedule.repeat,
  }));
}

function syncSchedulesWithMain() {
  if (!window.electronAPI?.syncSchedules) {
    return;
  }

  const payload = getSerializableSchedules();
  window.electronAPI.syncSchedules(payload).catch((error) => {
    console.warn('[Schedule] スケジュール同期に失敗:', error);
  });
}

function notifyScheduleUpdate() {
  try {
    window.dispatchEvent(new CustomEvent('schedules-updated', { detail: { source: 'schedule-renderer' } }));
  } catch (error) {
    console.warn('[Schedule] スケジュール更新イベント送出に失敗:', error);
  }
}

function escapeCsvValue(value) {
  if (value == null) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function formatRepeatDaysForCsv(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days)) {
    return '';
  }
  return repeat.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_KEYS[day] ?? String(day))
    .join(',');
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.replace(/\r/g, ''));
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map(splitCsvLine);
}

function parseRepeatFromTokens(type, tokens) {
  if (!type) {
    return null;
  }

  const normalizedType = type.trim().toLowerCase();
  if (normalizedType !== 'weekly') {
    return null;
  }

  const days = (tokens || '')
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const lower = token.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(REPEAT_TOKEN_MAP, lower)) {
        return REPEAT_TOKEN_MAP[lower];
      }
      return null;
    })
    .filter((day) => day !== null);

  if (days.length === 0) {
    return null;
  }

  return normalizeRepeatConfig({ type: 'weekly', days });
}

function parseSchedulesFromCsv(rows) {
  if (!rows || rows.length === 0) {
    return { schedules: [], errors: ['CSV が空です'] };
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const titleIdx = header.indexOf('title');
  const dateIdx = header.indexOf('date');
  const timeIdx = header.indexOf('time');
  const descriptionIdx = header.indexOf('description');
  const repeatTypeIdx = header.indexOf('repeat_type');
  const repeatDaysIdx = header.indexOf('repeat_days');

  if (titleIdx === -1 || timeIdx === -1) {
    return { schedules: [], errors: ['title と time 列は必須です'] };
  }

  const schedulesFromCsv = [];
  const errors = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];

    const title = (row[titleIdx] || '').trim();
    const time = (row[timeIdx] || '').trim();
    if (!title || !time) {
      errors.push(`行${i + 1}: title または time が空のためスキップしました`);
      continue;
    }

    const date = dateIdx !== -1 ? (row[dateIdx] || '').trim() : '';
    const description = descriptionIdx !== -1 ? (row[descriptionIdx] || '').trim() : '';
    const repeatType = repeatTypeIdx !== -1 ? (row[repeatTypeIdx] || '').trim() : '';
    const repeatDays = repeatDaysIdx !== -1 ? (row[repeatDaysIdx] || '').trim() : '';

    const repeat = parseRepeatFromTokens(repeatType, repeatDays);

    schedulesFromCsv.push({
      title,
      date: date || getTodayISODate(),
      time,
      description,
      repeat,
    });
  }

  return { schedules: schedulesFromCsv, errors };
}

async function handleCsvFileSelection(event) {
  const file = event?.target?.files?.[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const { schedules: parsedSchedules, errors } = parseSchedulesFromCsv(rows);

    if (!parsedSchedules.length) {
      alert(errors.length ? errors.join('\n') : '有効なスケジュールが見つかりませんでした');
      return;
    }

    const previewList = parsedSchedules
      .map((item) => {
        const repeatLabel = item.repeat ? formatRepeatLabel(item.repeat) : '';
        return `・${item.time} ${item.title}${repeatLabel ? ` (${repeatLabel})` : ''}`;
      })
      .join('\n');

    const confirmationMessage = `以下の予定を取り込みます:\n${previewList}\n\nよろしいですか？${errors.length ? `\n（${errors.length}件は不正のためスキップされます）` : ''}`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    const baseId = Date.now();

    parsedSchedules.forEach((item, index) => {
      const schedule = normalizeScheduleEntry({
        id: baseId + index,
        title: item.title,
        date: item.date,
        time: item.time,
        description: item.description,
        repeat: item.repeat,
        notified: false,
        preNotified: false,
        startNotified: false,
        ttsMessage: '',
        lastOccurrenceKey: null,
      });
      schedules.push(schedule);
    });

    ensureRepeatStateInitialization();
    saveSchedules();
    renderSchedules();

    alert(`${parsedSchedules.length}件のスケジュールを取り込みました${errors.length ? `\n（${errors.length}件のエラーをスキップ）` : ''}`);
  } catch (error) {
    console.error('[Schedule] CSVインポートエラー:', error);
    alert('CSVの読み込み中にエラーが発生しました。ファイル形式を確認してください。');
  } finally {
    if (scheduleCsvInput) {
      scheduleCsvInput.value = '';
    }
  }
}

function exportSchedulesToCsv() {
  if (!schedules.length) {
    alert('エクスポートするスケジュールがありません');
    return;
  }

  const headers = ['title', 'date', 'time', 'description', 'repeat_type', 'repeat_days'];
  const rows = schedules.map((schedule) => [
    schedule.title || '',
    schedule.date || getTodayISODate(),
    schedule.time || '',
    schedule.description || '',
    schedule.repeat ? schedule.repeat.type : '',
    formatRepeatDaysForCsv(schedule.repeat),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `schedules_${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// スケジュール一覧を表示
function renderSchedules() {
  scheduleItems.innerHTML = '';

  if (schedules.length === 0) {
    scheduleItems.innerHTML = '<p class="empty-message">スケジュールがありません</p>';
    return;
  }

  // 次回発生日時順にソート
  const enriched = schedules
    .map((schedule) => ({
      schedule,
      occurrence: getNextOccurrenceInfo(schedule),
    }))
    .filter(({ occurrence }) => occurrence && occurrence.dateTime);

  enriched.sort((a, b) => a.occurrence.dateTime - b.occurrence.dateTime);

  if (enriched.length === 0) {
    scheduleItems.innerHTML = '<p class="empty-message">スケジュールがありません</p>';
    return;
  }

  enriched.forEach(({ schedule, occurrence }) => {
    const scheduleElement = createScheduleElement(schedule, occurrence);
    scheduleItems.appendChild(scheduleElement);
  });
}

// スケジュール要素を作成
function createScheduleElement(schedule, occurrenceInfo) {
  const div = document.createElement('div');
  div.className = 'schedule-item';
  const isEditing = schedule.id === editingScheduleId;
  if (isEditing) {
    div.classList.add('editing');
  }

  const dateTime = occurrenceInfo?.dateTime ? new Date(occurrenceInfo.dateTime) : new Date(`${schedule.date}T${schedule.time}`);
  const now = new Date();
  const timeDiff = dateTime - now;
  const minutesLeft = Math.floor(timeDiff / 60000);

  // ステータス判定
  let status = '';
  let statusText = '';
  let statusIcon = '';

  if (timeDiff < 0) {
    // 過去
    div.classList.add('past');
    status = 'past';
    statusText = '終了';
    statusIcon = '✓';
  } else if (minutesLeft <= 5) {
    // 5分以内
    div.classList.add('in-progress');
    status = 'in-progress';
    statusText = `あと${minutesLeft}分`;
    statusIcon = '🔔';
  } else if (minutesLeft <= 30) {
    // 30分以内
    div.classList.add('upcoming');
    status = 'upcoming';
    statusText = `あと${minutesLeft}分`;
    statusIcon = '⏰';
  } else {
    // それ以上先
    div.classList.add('future');
    status = 'future';
    const hoursLeft = Math.floor(minutesLeft / 60);
    if (hoursLeft > 0) {
      statusText = `あと${hoursLeft}時間${minutesLeft % 60}分`;
    } else {
      statusText = `あと${minutesLeft}分`;
    }
    statusIcon = '📅';
  }

  // 通知状態
  const notificationStatus = schedule.startNotified ? '🔕' : (schedule.preNotified ? '🔔' : '');

  const repeatLabel = schedule.repeat ? formatRepeatLabel(schedule.repeat) : '';
  const occurrenceDateLabel = occurrenceInfo?.key ? formatDate(occurrenceInfo.key) : formatDate(schedule.date);
  const editButton = isEditing
    ? '<button class="btn-edit" disabled>編集中</button>'
    : `<button class="btn-edit" onclick="editSchedule(${schedule.id})">編集</button>`;

  div.innerHTML = `
    <div class="schedule-header">
      <div class="schedule-title-area">
        <span class="schedule-status-icon">${statusIcon}</span>
        <h3>${schedule.title}</h3>
      </div>
      <div class="schedule-actions">
        ${editButton}
        <button class="btn-delete" onclick="deleteSchedule(${schedule.id})">削除</button>
      </div>
    </div>
    <div class="schedule-info">
      <div class="schedule-meta">
        <span class="schedule-datetime">🗓 ${occurrenceDateLabel} / 🕐 ${schedule.time}</span>
        <span class="schedule-status ${status}">${statusText}</span>
        ${notificationStatus ? `<span class="notification-status">${notificationStatus}</span>` : ''}
      </div>
      ${schedule.description ? `<p class="schedule-description">${schedule.description}</p>` : ''}
      ${repeatLabel ? `<p class="schedule-repeat">${repeatLabel}</p>` : ''}
    </div>
  `;

  return div;
}

// 日付フォーマット
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];

  return `${year}年${month}月${day}日(${weekday})`;
}

// 編集開始（グローバルスコープに公開）
window.editSchedule = function(id) {
  const schedule = schedules.find((item) => item.id === id);
  if (!schedule) {
    console.warn('[Schedule] 編集対象が見つかりません:', id);
    return;
  }
  enterEditMode(schedule);
  renderSchedules();
};

// スケジュール削除（グローバルスコープに公開）
window.deleteSchedule = function(id) {
  if (editingScheduleId === id) {
    exitEditMode();
  }
  schedules = schedules.filter((s) => s.id !== id);
  saveSchedules();
  renderSchedules();
};

// タブ切り替え設定
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // すべてのタブボタンとコンテンツから active を削除
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // クリックされたタブをアクティブに
      button.classList.add('active');
      const targetContent = document.querySelector(`[data-tab-content="${targetTab}"]`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// 一括追加処理
function handleBulkAdd() {
  const bulkInput = document.getElementById('bulkInput');
  const text = bulkInput.value.trim();

  if (!text) {
    alert('スケジュールを入力してください');
    return;
  }

  const lines = text.split('\n').filter(line => line.trim());
  const date = getTodayISODate();
  const parsedSchedules = [];
  let errorCount = 0;

  lines.forEach((line) => {
    const match = line.trim().match(/^(\d{1,2}):(\d{2})\s+(.+)$/);

    if (!match) {
      errorCount += 1;
      console.warn('パース失敗:', line);
      return;
    }

    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    const time = `${hours}:${minutes}`;
    const rawContent = match[3].trim();
    const [titlePart, repeatPart] = rawContent.split('|');
    const title = titlePart.trim();
    const repeatDays = parseRepeatSpecification((repeatPart || '').trim());
    const repeat = repeatDays.length > 0 ? { type: 'weekly', days: repeatDays } : null;

    if (!title) {
      errorCount += 1;
      console.warn('タイトルが空のためスキップ:', line);
      return;
    }

    parsedSchedules.push({
      title,
      date,
      time,
      description: '',
      repeat,
    });
  });

  if (parsedSchedules.length === 0) {
    alert('正しい形式で入力してください\n例: 10:00 朝会 | mon,wed');
    return;
  }

  const previewList = parsedSchedules
    .map((item) => {
      const repeatLabel = item.repeat ? ` (${formatRepeatLabel(item.repeat)})` : '';
      return `・${item.time} ${item.title}${repeatLabel}`;
    })
    .join('\n');

  const confirmationMessage = `以下の予定を追加します:\n${previewList}\n\nよろしいですか？${errorCount > 0 ? `\n（${errorCount}件は形式不正のためスキップされます）` : ''}`;

  if (!window.confirm(confirmationMessage)) {
    return;
  }

  const baseId = Date.now();
  parsedSchedules.forEach((item, index) => {
    const schedule = normalizeScheduleEntry({
      id: baseId + index,
      ...item,
      notified: false,
      preNotified: false,
      startNotified: false,
      lastOccurrenceKey: null,
    });
    schedules.push(schedule);
  });

  ensureRepeatStateInitialization();
  saveSchedules();
  renderSchedules();
  bulkInput.value = '';
  alert(`${parsedSchedules.length}件のスケジュールを追加しました${errorCount > 0 ? `\n（${errorCount}件のエラーをスキップ）` : ''}`);
}

/**
 * TTSキュー処理
 * 音声を順番に再生し、重複を防ぐ
 */
async function playTTS(text, options = {}) {
  ttsQueue.push({ text, options });
  if (!isTTSPlaying) {
    await processTTSQueue();
  }
}

async function processTTSQueue() {
  if (ttsQueue.length === 0) {
    isTTSPlaying = false;
    return;
  }

  isTTSPlaying = true;
  const { text, options } = ttsQueue.shift();

  try {
    if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
      const res = await window.electronAPI.speakText({
        text,
        engine: 'voicevox',
        options: {
          speakerId: options.speakerId || SCHEDULE_NOTIFICATION_SPEAKER_ID,
          speedScale: options.speedScale || 1.0
        }
      });

      if (res && res.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);

        // 再生終了後に次のキューを処理
        audio.onended = () => {
          processTTSQueue();
        };

        // エラー時も次へ進む
        audio.onerror = () => {
          processTTSQueue();
        };

        await audio.play();
      } else {
        // 音声生成失敗時は次へ
        processTTSQueue();
      }
    } else {
      processTTSQueue();
    }
  } catch (error) {
    console.error('TTS再生エラー:', error);
    processTTSQueue();
  }
}

// 通知チェック開始
function startNotificationCheck() {
  // 既存タイマーがあればクリア
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }

  // 起動直後は一度だけ実行（開始時刻直前の救済用。5分前通知は発火させない）
  checkScheduleNotifications();

  // 分境界にアラインしてから、以後は60秒ごとにチェック
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    checkScheduleNotifications();
    notificationCheckInterval = setInterval(checkScheduleNotifications, 60000);
  }, Math.max(0, msToNextMinute));
}

// スケジュール通知チェック
/**
 * 通知条件を評価し、Electron 通知と VOICEVOX 読み上げを必要に応じて実行する。
 */
async function checkScheduleNotifications() {
  const now = new Date();
  const seconds = now.getSeconds();
  const nowAligned = new Date(now);
  nowAligned.setSeconds(0, 0);

  let schedulesDirty = false;

  for (let schedule of schedules) {
    const occurrenceInfo = getNextOccurrenceInfo(schedule, now);
    if (!occurrenceInfo || !occurrenceInfo.dateTime) {
      continue;
    }

    if (schedule.repeat) {
      if (ensureRepeatOccurrenceState(schedule, occurrenceInfo.key)) {
        schedulesDirty = true;
      }
    } else if (!schedule.lastOccurrenceKey) {
      schedule.lastOccurrenceKey = schedule.date;
      schedulesDirty = true;
    }

    const scheduleDateTime = occurrenceInfo.dateTime;
    const timeDiff = scheduleDateTime - now;
    const minutesLeft = Math.floor((scheduleDateTime - nowAligned) / 60000);
    const formattedDate = formatDate(occurrenceInfo.key || schedule.date);

    // 既存データ互換（notified の意味を分割）
    // - 未来の予定で notified=true: 5分前通知済とみなす
    // - 過去/開始時刻付近で notified=true: 両方通知済とみなす
    if (schedule.preNotified === undefined) {
      schedule.preNotified = false;
      schedulesDirty = true;
    }
    if (schedule.startNotified === undefined) {
      schedule.startNotified = false;
      schedulesDirty = true;
    }
    if (schedule.notified === true && schedule.preNotified === false && schedule.startNotified === false) {
      if (timeDiff > 0) {
        schedule.preNotified = true;
      } else {
        schedule.preNotified = true;
        schedule.startNotified = true;
      }
      schedule.notified = schedule.preNotified || schedule.startNotified;
      schedulesDirty = true;
    }

    // 時刻が過ぎた古い予定は自動的に両方通知済み扱いにして二重発火を防止
    if (timeDiff < -SCHEDULE_NOTIFICATION_COOLDOWN_MS && (!schedule.preNotified || !schedule.startNotified)) {
      schedule.preNotified = true;
      schedule.startNotified = true;
      schedule.notified = true;
      schedulesDirty = true;
      continue;
    }

    // 5分前通知: 分境界（秒=0）のときに分差がちょうど5のみ発火
    if (seconds === 0 && minutesLeft === SCHEDULE_NOTIFICATION_LEAD_MINUTES && !schedule.preNotified) {
      schedule.preNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      schedulesDirty = true;

      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.leadTitle(schedule.title),
        body: SCHEDULE_MESSAGES.leadBody(schedule, formattedDate)
      });

      // 音声読み上げ（TTSキューに追加）
      const leadMessage = (() => {
        if (typeof schedule.ttsLeadMessage === 'string' && schedule.ttsLeadMessage.trim().length > 0) {
          return schedule.ttsLeadMessage.trim();
        }
        return buildRepeatAwareLeadFallback(schedule, occurrenceInfo);
      })();
      await playTTS(
        leadMessage,
        { speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID, speedScale: 1.05 }
      );
    }

    // 開始時通知: 分境界で分差0 または 直前60秒以内の救済
    if (((seconds === 0 && minutesLeft === 0) || (timeDiff > -SCHEDULE_NOTIFICATION_COOLDOWN_MS && timeDiff <= 0)) && !schedule.startNotified) {
      schedule.startNotified = true;
      schedule.notified = schedule.preNotified || schedule.startNotified;
      schedulesDirty = true;

      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.startTitle(schedule.title),
        body: SCHEDULE_MESSAGES.startBody(schedule.description)
      });

      // 音声読み上げ（TTSキューに追加）
      const startMessage = (() => {
        if (typeof schedule.ttsMessage === 'string' && schedule.ttsMessage.trim().length > 0) {
          return schedule.ttsMessage.trim();
        }
        return buildRepeatAwareStartFallback(schedule, occurrenceInfo);
      })();
      await playTTS(
        startMessage,
        { speakerId: SCHEDULE_NOTIFICATION_SPEAKER_ID, speedScale: 1.0 }
      );
    }
  }

  if (schedulesDirty) {
    saveSchedules();
  }
}
