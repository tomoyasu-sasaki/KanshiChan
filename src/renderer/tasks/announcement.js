/**
 * タスクの読み上げ関連の処理を管理するモジュール。
 */
import { taskState, setLastAnnouncedDate } from './state.js';
import { DEFAULT_READING_SETTINGS } from './constants.js';
import { priorityJa, statusJa } from './utils.js';
import { queueVoicevoxSpeech } from '../services/tts-adapter.js';

let announcementHandles = { timeoutId: null, intervalId: null };

/**
 * 読み上げタイマーをクリアする。
 */
function clearAnnouncementTimers() {
  if (announcementHandles.timeoutId) {
    clearTimeout(announcementHandles.timeoutId);
  }
  if (announcementHandles.intervalId) {
    clearInterval(announcementHandles.intervalId);
  }
  announcementHandles = { timeoutId: null, intervalId: null };
}

/**
 * 読み上げタイマーを設定する。
 */
export function setupAnnouncementTimer() {
  clearAnnouncementTimers();
  try {
    const key = 'tasks.lastAnnouncedDate';
    const lastAnnouncedDate = localStorage.getItem(key) || null;
    setLastAnnouncedDate(lastAnnouncedDate);
    const readingSettings = taskState.readingSettings || { ...DEFAULT_READING_SETTINGS };
    const time = readingSettings.time || DEFAULT_READING_SETTINGS.time;
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const now = new Date();
    const next = new Date(now);
    next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    announcementHandles.timeoutId = setTimeout(async () => {
      await announceTasks(Date.now(), { force: true });
      announcementHandles.intervalId = setInterval(() => announceTasks(Date.now()), 24 * 60 * 60 * 1000);
    }, Math.max(0, delay));
  } catch (error) {
    console.warn('[Tasks] 読み上げタイマー設定に失敗:', error);
  }
}

/**
 * タスクを読み上げる。
 */
export async function announceTasks(referenceTime, options = {}) {
  try {
    const todayKey = new Date(referenceTime).toDateString();
    const key = 'tasks.lastAnnouncedDate';
    if (!options.force && localStorage.getItem(key) === todayKey) {
      return;
    }
    const res = await window.electronAPI.tasksList({ activeAt: referenceTime });
    if (!res?.success) return;
    let list = Array.isArray(res.items) ? res.items : [];
    const readingSettings = taskState.readingSettings || { ...DEFAULT_READING_SETTINGS };
    if (readingSettings.includeStatuses?.length) {
      const allowed = new Set(readingSettings.includeStatuses);
      list = list.filter((task) => allowed.has(task.status));
    }
    if (readingSettings.includeTags?.length) {
      const required = new Set(readingSettings.includeTags);
      list = list.filter((task) => {
        const tagNames = (task.tags || []).map((tag) => tag.name);
        return tagNames.some((name) => required.has(name));
      });
    }
    if (list.length === 0) {
      return;
    }

    if ((readingSettings.priorityMode || 'grouped') === 'grouped') {
      await speakGroupedTasks(list);
    } else {
      await speakFlatTasks(list);
    }

    localStorage.setItem(key, todayKey);
    setLastAnnouncedDate(todayKey);
  } catch (error) {
    console.error('[Tasks] 読み上げエラー:', error);
  }
}

/**
 * フラット形式でタスクを読み上げる。
 */
async function speakFlatTasks(list) {
  const lines = [];
  const counts = { low: 0, medium: 0, high: 0 };
  list.forEach((t) => {
    if (counts[t.priority] != null) counts[t.priority] += 1;
  });
  lines.push(`対象のタスクは${list.length}件です。`);
  const breakdown = [];
  if (counts.high) breakdown.push(`高${counts.high}件`);
  if (counts.medium) breakdown.push(`中${counts.medium}件`);
  if (counts.low) breakdown.push(`低${counts.low}件`);
  if (breakdown.length) lines.push(`内訳は、${breakdown.join('、')}です。`);
  list.slice(0, 20).forEach((t) => {
    lines.push(`${t.title}、優先度${priorityJa(t.priority)}、ステータス${statusJa(t.status)}。`);
  });
  const text = lines.join('\n');
  await queueVoicevoxSpeech(text, { speedScale: 1.05 });
}

/**
 * グループ化形式でタスクを読み上げる。
 */
async function speakGroupedTasks(list) {
  const groups = {
    high: list.filter((task) => task.priority === 'high'),
    medium: list.filter((task) => task.priority === 'medium'),
    low: list.filter((task) => task.priority === 'low'),
  };
  const priorityOrder = ['high', 'medium', 'low'];
  const speeds = { high: 1.15, medium: 1.05, low: 0.95 };
  const totalLines = [`対象のタスクは${list.length}件です。`];
  await queueVoicevoxSpeech(totalLines.join('\n'), { speedScale: 1.05 });

  for (const priority of priorityOrder) {
    const tasksInGroup = groups[priority];
    if (!tasksInGroup || tasksInGroup.length === 0) continue;
    const header = `優先度${priorityJa(priority)}のタスクは${tasksInGroup.length}件です。`;
    const lines = [header];
    tasksInGroup.slice(0, 20).forEach((task) => {
      lines.push(`【${priorityJa(priority)}】${task.title}、ステータス${statusJa(task.status)}。`);
    });
    await queueVoicevoxSpeech(lines.join('\n'), { speedScale: speeds[priority] ?? 1.0 });
  }
}

/**
 * 日次読み上げをスケジュールする。
 */
export function scheduleDailyAnnouncement() {
  try {
    const key = 'tasks.lastAnnouncedDate';
    const lastAnnouncedDate = localStorage.getItem(key) || null;
    setLastAnnouncedDate(lastAnnouncedDate);
    setupAnnouncementTimer();
  } catch (error) {
    console.warn('[Tasks] 読み上げスケジュール設定に失敗しました:', error);
  }
}

