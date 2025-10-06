/**
 * ダッシュボード内テーブル（最新ログ・アプリ滞在・Chrome利用）の描画を担当。
 * - latest logs は state.lastRange で期間フィルタを掛けており、CSV 書き出しも同じ条件に揃える。
 */
import { state } from './state.js';
import {
  logTableBody,
  appUsageTableBody,
  chromeUsageTableBody,
} from './dom.js';
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
  formatTypeLabel,
  csvEscape,
} from './utils.js';

/**
 * 最新ログテーブルを現在の期間フィルタに合わせて再描画する。
 */
export function renderLogTable() {
  if (!logTableBody) return;

  const { start, end } = state.lastRange || {};
  const filteredLogs = Array.isArray(state.recentLogs)
    ? state.recentLogs.filter((item) => {
        if (!item || !Number.isFinite(item.detectedAt)) {
          return false;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return true;
        }
        return item.detectedAt >= start && item.detectedAt <= end;
      })
    : [];

  if (filteredLogs.length === 0) {
    logTableBody.innerHTML = '<tr class="empty"><td colspan="4">データがありません</td></tr>';
    return;
  }

  logTableBody.innerHTML = filteredLogs
    .map((item) => {
      const time = formatDateTime(item.detectedAt);
      const duration = item.durationSeconds ? formatDuration(item.durationSeconds) : '-';
      const detail = item.meta ? escapeHtml(JSON.stringify(item.meta)) : '';
      return `
        <tr>
          <td>${time}</td>
          <td>${formatTypeLabel(item.type)}</td>
          <td>${duration}</td>
          <td>${detail}</td>
        </tr>
      `;
    })
    .join('');
}

/**
 * アプリ使用時間テーブルを state.appUsage に基づきレンダリングする。
 */
export function renderAppUsageTable() {
  if (!appUsageTableBody) return;

  if (!state.appUsage || state.appUsage.length === 0) {
    appUsageTableBody.innerHTML = `
      <tr class="empty">
        <td colspan="3">データがありません</td>
      </tr>
    `;
    return;
  }

  appUsageTableBody.innerHTML = state.appUsage
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.appName)}</td>
          <td>${formatDuration(item.totalDurationSeconds)}</td>
          <td>${item.sessions ?? 0}</td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Chrome ドメイン別使用時間テーブルを更新する。
 */
export function renderChromeUsageTable() {
  if (!chromeUsageTableBody) {
    return;
  }

  if (!state.chromeUsage || state.chromeUsage.length === 0) {
    chromeUsageTableBody.innerHTML = `
      <tr class="empty">
        <td colspan="3">Chrome のデータがありません</td>
      </tr>
    `;
    return;
  }

  chromeUsageTableBody.innerHTML = state.chromeUsage
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.label || '(未記録)')}</td>
          <td>${formatDuration(item.totalDurationSeconds)}</td>
          <td>${item.sessions ?? 0}</td>
        </tr>
      `;
    })
    .join('');
}

/**
 * 現在表示中の最新ログを CSV ダウンロードとして提供する。
 */
export function exportLogsCsv() {
  const { start, end } = state.lastRange || {};
  const filteredLogs = Array.isArray(state.recentLogs)
    ? state.recentLogs.filter((item) => {
        if (!item || !Number.isFinite(item.detectedAt)) {
          return false;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return true;
        }
        return item.detectedAt >= start && item.detectedAt <= end;
      })
    : [];

  if (filteredLogs.length === 0) {
    return;
  }

  const headers = ['detected_at', 'type', 'duration_seconds', 'meta'];
  const rows = filteredLogs.map((item) => [
    formatDateTime(item.detectedAt),
    item.type,
    item.durationSeconds ?? '',
    item.meta ? JSON.stringify(item.meta) : '',
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `detection_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
