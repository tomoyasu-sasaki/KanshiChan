/**
 * タスク機能で使用するユーティリティ関数。
 */
import { WEEKDAY_LABELS } from './constants.js';

/**
 * 優先度を日本語に変換する。
 */
export function priorityJa(p) {
  return p === 'high' ? '高' : p === 'low' ? '低' : '中';
}

/**
 * ステータスを日本語に変換する。
 */
export function statusJa(s) {
  return s === 'done' ? '完了' : s === 'in_progress' ? '進行中' : '未着手';
}

/**
 * 日付をラベル形式にフォーマットする。
 */
export function formatDateLabel(ms) {
  try {
    const d = new Date(Number(ms));
    if (Number.isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}`;
  } catch {
    return '';
  }
}

/**
 * 日付をinput[type="date"]用の形式に変換する。
 */
export function toDateInput(ms) {
  try {
    const d = new Date(Number(ms));
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

/**
 * タグ入力文字列をパースする。
 */
export function parseTagsInput(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, arr) => item && arr.indexOf(item) === index);
}

/**
 * 繰り返し設定をラベル形式にフォーマットする。
 */
export function formatRepeatLabel(config) {
  if (!config || typeof config !== 'object') return '繰り返し';
  if (config.type === 'daily') {
    return config.interval === 1 ? '毎日' : `${config.interval}日ごと`;
  }
  if (config.type === 'weekly') {
    const days = (config.weekdays || []).map((day) => WEEKDAY_LABELS[day]).join('・');
    if (!days) return '毎週';
    return config.interval === 1 ? `毎週 ${days}` : `${config.interval}週間ごと (${days})`;
  }
  if (config.type === 'monthly') {
    return config.interval === 1 ? '毎月' : `${config.interval}か月ごと`;
  }
  return '繰り返し';
}

/**
 * 期間バッジをフォーマットする。
 */
export function formatPeriodBadge(start, end) {
  if (!start && !end) return '';
  const s = start ? formatDateLabel(start) : '—';
  const e = end ? formatDateLabel(end) : '—';
  return `${s} 〜 ${e}`;
}

/**
 * ステータスアイコンを取得する。
 */
export function getStatusIcon(status) {
  switch (status) {
    case 'done':
      return '✓';
    case 'in_progress':
      return '▶';
    case 'todo':
    default:
      return '○';
  }
}

/**
 * タスクの階層構造を構築する。
 */
export function buildTaskTreeForRender(sourceTasks) {
  const nodes = (sourceTasks || []).map((task) => ({ ...task, children: [] }));
  const map = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];
  nodes.forEach((node) => {
    const parentId = node.parentTaskId;
    if (parentId != null && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (arr) => {
    arr.sort((a, b) => {
      const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
    arr.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

/**
 * タイトルからタスクIDを解決する。
 */
export function resolveTaskIdByTitle(title, tasks) {
  if (!title) return null;
  const lower = title.trim().toLowerCase();
  const match = tasks.find((task) => task.title.trim().toLowerCase() === lower);
  return match?.id ?? null;
}

/**
 * 日付の開始時刻を取得する。
 */
export function startOfDayClient(timestamp) {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 日付の終了時刻を取得する。
 */
export function endOfDayClient(timestamp) {
  const d = new Date(timestamp);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * 週の開始時刻を取得する。
 */
export function startOfWeekClient(timestamp) {
  const d = new Date(timestamp);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 週の終了時刻を取得する。
 */
export function endOfWeekClient(timestamp) {
  const start = startOfWeekClient(timestamp);
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * 月の開始時刻を取得する。
 */
export function startOfMonthClient(timestamp) {
  const d = new Date(timestamp);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 月の終了時刻を取得する。
 */
export function endOfMonthClient(timestamp) {
  const d = new Date(timestamp);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * 四半期の開始時刻を取得する。
 */
export function startOfQuarterClient(timestamp) {
  const d = new Date(timestamp);
  const quarter = Math.floor(d.getMonth() / 3);
  d.setMonth(quarter * 3, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 四半期の終了時刻を取得する。
 */
export function endOfQuarterClient(timestamp) {
  const d = new Date(timestamp);
  const quarter = Math.floor(d.getMonth() / 3);
  d.setMonth((quarter + 1) * 3, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * 時間範囲を計算する。
 */
export function computeClientTimeframeRange(timeframe) {
  const now = Date.now();
  switch (timeframe) {
    case 'today':
      return { type: 'range', start: startOfDayClient(now), end: endOfDayClient(now) };
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { type: 'range', start: startOfDayClient(tomorrow), end: endOfDayClient(tomorrow) };
    }
    case 'this_week':
      return { type: 'range', start: startOfWeekClient(now), end: endOfWeekClient(now) };
    case 'next_week': {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return { type: 'range', start: startOfWeekClient(nextWeek), end: endOfWeekClient(nextWeek) };
    }
    case 'this_month':
      return { type: 'range', start: startOfMonthClient(now), end: endOfMonthClient(now) };
    case 'next_month': {
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return { type: 'range', start: startOfMonthClient(nextMonth), end: endOfMonthClient(nextMonth) };
    }
    case 'this_quarter':
      return { type: 'range', start: startOfQuarterClient(now), end: endOfQuarterClient(now) };
    case 'overdue':
      return { type: 'overdue', before: startOfDayClient(now) };
    default:
      return null;
  }
}

/**
 * 時間範囲の説明を取得する。
 */
export function describeTimeframe(timeframe) {
  switch (timeframe) {
    case 'today':
      return '今日の';
    case 'tomorrow':
      return '明日の';
    case 'this_week':
      return '今週の';
    case 'next_week':
      return '来週の';
    case 'this_month':
      return '今月の';
    case 'next_month':
      return '来月の';
    case 'this_quarter':
      return '今四半期の';
    case 'overdue':
      return '期限切れの';
    default:
      return '対象の';
  }
}

