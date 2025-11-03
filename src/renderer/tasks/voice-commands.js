/**
 * 音声コマンドのユーティリティ関数。
 */
import { computeClientTimeframeRange, describeTimeframe as describeTimeframeUtil, priorityJa, statusJa } from './utils.js';

/**
 * 音声コマンドの日時フィールドを正規化（作成用）
 */
export function normalizeVoiceDateForCreate(value) {
  if (value == null) return undefined; // 未指定は送らない（メインで null 扱い）
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return undefined;
    const lower = t.toLowerCase();
    if (lower === 'null' || lower === 'none' || lower === 'nil' || lower === 'undefined' || lower === 'clear') return undefined;
    if (t === '未設定' || t === '未定' || t === 'なし' || t === '無し' || t === '消去' || t === 'クリア') return undefined;
    return t; // ISO 文字列などはそのまま
  }
  return undefined;
}

/**
 * 音声コマンドの日時フィールドを正規化（更新用）
 */
export function normalizeVoiceDateForUpdate(value) {
  if (value == null) return null; // 明示クリア
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null; // 空はクリア
    const lower = t.toLowerCase();
    if (lower === 'null' || lower === 'none' || lower === 'nil' || lower === 'undefined' || lower === 'clear') return null;
    if (t === '未設定' || t === '未定' || t === 'なし' || t === '無し' || t === '消去' || t === 'クリア') return null;
    return t;
  }
  return undefined; // 不明値は変更しない
}

/**
 * 検索条件を正規化する。
 */
export function normalizeCriteriaForApi(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const criteria = {};
  if (typeof raw.status === 'string') {
    const normalized = raw.status.trim().toLowerCase();
    if (['todo', 'in_progress', 'done'].includes(normalized)) {
      criteria.status = normalized;
    }
  }
  if (typeof raw.timeframe === 'string') {
    criteria.timeframe = raw.timeframe.trim().toLowerCase();
  }
  if (typeof raw.tag === 'string' && raw.tag.trim()) {
    criteria.tag = raw.tag.trim();
  }
  if (Array.isArray(raw.tags) && raw.tags.length > 0) {
    criteria.tags = raw.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim());
  }
  return criteria;
}

/**
 * タスクを条件でフィルタリングする。
 */
export function filterTasksByCriteria(list, criteria) {
  let filtered = list;
  if (criteria.tag) {
    const key = criteria.tag.trim().toLowerCase();
    filtered = filtered.filter((task) => (task.tags || []).some((tag) => tag.name.trim().toLowerCase() === key));
  }
  if (Array.isArray(criteria.tags) && criteria.tags.length > 0) {
    const set = new Set(criteria.tags.map((tag) => tag.trim().toLowerCase()));
    filtered = filtered.filter((task) => (task.tags || []).some((tag) => set.has(tag.name.trim().toLowerCase())));
  }
  if (criteria.timeframe) {
    const range = computeClientTimeframeRange(criteria.timeframe);
    if (range?.type === 'range') {
      filtered = filtered.filter((task) => {
        const start = Number.isFinite(task.startDate) ? task.startDate : null;
        const end = Number.isFinite(task.endDate) ? task.endDate : null;
        const overlaps = (start == null || start <= range.end) && (end == null || end >= range.start);
        return overlaps;
      });
    } else if (range?.type === 'overdue') {
      filtered = filtered.filter((task) => Number.isFinite(task.endDate) && task.endDate < range.before && task.status !== 'done');
    }
  }
  return filtered;
}

/**
 * 時間範囲の説明を取得する。
 */
export function describeTimeframe(timeframe) {
  return describeTimeframeUtil(timeframe);
}

/**
 * 優先度を日本語に変換する。
 */
export { priorityJa };

/**
 * ステータスを日本語に変換する。
 */
export { statusJa };

