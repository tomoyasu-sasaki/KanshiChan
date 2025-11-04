/**
 * 読み上げ設定関連の処理を管理するモジュール。
 */
import { taskState, setReadingSettings, setLastAnnouncedDate } from './state.js';
import { DEFAULT_READING_SETTINGS } from './constants.js';
import { statusJa } from './utils.js';
import { setupAnnouncementTimer } from './announcement.js';

/**
 * 読み上げ設定を読み込む。
 */
export function loadReadingSettings() {
  try {
    const raw = localStorage.getItem('tasks.readingSettings');
    if (!raw) {
      return { ...DEFAULT_READING_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_READING_SETTINGS,
      ...(parsed || {}),
      includeStatuses: Array.isArray(parsed?.includeStatuses) && parsed.includeStatuses.length
        ? parsed.includeStatuses.filter((status) => ['todo', 'in_progress', 'done'].includes(status))
        : [...DEFAULT_READING_SETTINGS.includeStatuses],
      includeTags: Array.isArray(parsed?.includeTags) ? parsed.includeTags : [],
      priorityMode: typeof parsed?.priorityMode === 'string' ? parsed.priorityMode : DEFAULT_READING_SETTINGS.priorityMode,
    };
  } catch (error) {
    console.warn('[Tasks] 読み上げ設定の読み込みに失敗:', error);
    return { ...DEFAULT_READING_SETTINGS };
  }
}

/**
 * 読み上げ設定を保存する。
 */
export function saveReadingSettings(nextSettings) {
  const settings = {
    ...DEFAULT_READING_SETTINGS,
    ...nextSettings,
    includeStatuses: Array.isArray(nextSettings?.includeStatuses) && nextSettings.includeStatuses.length
      ? nextSettings.includeStatuses
      : [...DEFAULT_READING_SETTINGS.includeStatuses],
    includeTags: Array.isArray(nextSettings?.includeTags) ? nextSettings.includeTags : [],
  };
  setReadingSettings(settings);
  localStorage.setItem('tasks.readingSettings', JSON.stringify(settings));
  setupAnnouncementTimer();
}

/**
 * 読み上げ設定UIをレンダリングする。
 */
export function renderReadingSettingsUI() {
  const container = document.getElementById('tasksReadingSettings');
  if (!container) return;
  container.innerHTML = '';

  const readingSettings = taskState.readingSettings || loadReadingSettings();
  if (!taskState.readingSettings) {
    setReadingSettings(readingSettings);
  }

  const heading = document.createElement('h4');
  heading.textContent = '読み上げ設定';
  heading.className = 'reading-heading';
  container.appendChild(heading);

  const timeRow = document.createElement('div');
  timeRow.className = 'reading-row';
  const timeLabel = document.createElement('label');
  timeLabel.textContent = '読み上げ時刻';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = readingSettings.time || DEFAULT_READING_SETTINGS.time;
  timeInput.addEventListener('change', () => {
    const nextTime = timeInput.value || DEFAULT_READING_SETTINGS.time;
    saveReadingSettings({ ...readingSettings, time: nextTime });
  });
  timeRow.append(timeLabel, timeInput);
  container.appendChild(timeRow);

  const statusRow = document.createElement('div');
  statusRow.className = 'reading-statuses';
  ['todo', 'in_progress', 'done'].forEach((status) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = readingSettings.includeStatuses.includes(status);
    input.addEventListener('change', () => {
      const next = new Set(readingSettings.includeStatuses);
      if (input.checked) {
        next.add(status);
      } else {
        next.delete(status);
      }
      const nextArray = Array.from(next);
      if (nextArray.length === 0) {
        nextArray.push('todo', 'in_progress');
      }
      saveReadingSettings({ ...readingSettings, includeStatuses: nextArray });
      renderReadingSettingsUI();
    });
    const text = document.createElement('span');
    text.textContent = statusJa(status);
    label.appendChild(input);
    label.appendChild(text);
    statusRow.appendChild(label);
  });
  container.appendChild(statusRow);

  const tagsRow = document.createElement('div');
  tagsRow.className = 'reading-tags';
  if (!taskState.tagOptions.length) {
    const span = document.createElement('span');
    span.className = 'tag-filter-empty';
    span.textContent = '読み上げ対象タグ: なし';
    tagsRow.appendChild(span);
  } else {
    taskState.tagOptions.forEach((tag) => {
      const label = document.createElement('label');
      label.style.setProperty('--tag-color', tag.color);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = readingSettings.includeTags.includes(tag.name);
      input.addEventListener('change', () => {
        const next = new Set(readingSettings.includeTags);
        if (input.checked) next.add(tag.name); else next.delete(tag.name);
        saveReadingSettings({ ...readingSettings, includeTags: Array.from(next) });
        renderReadingSettingsUI();
      });
      const text = document.createElement('span');
      text.textContent = tag.name;
      label.append(input, text);
      tagsRow.appendChild(label);
    });
  }
  container.appendChild(tagsRow);

  const priorityRow = document.createElement('div');
  priorityRow.className = 'reading-row';
  const priorityLabel = document.createElement('label');
  priorityLabel.textContent = '読み上げスタイル';
  const prioritySelect = document.createElement('select');
  [
    { value: 'grouped', label: '優先度別に強調' },
    { value: 'flat', label: 'すべて同じスタイル' },
  ].forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === (readingSettings.priorityMode || 'grouped')) {
      opt.selected = true;
    }
    prioritySelect.appendChild(opt);
  });
  prioritySelect.addEventListener('change', () => {
    saveReadingSettings({ ...readingSettings, priorityMode: prioritySelect.value });
  });
  priorityRow.append(priorityLabel, prioritySelect);
  container.appendChild(priorityRow);
}

