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
 * 不在許可ログのメタ情報を表示用に整形する。
 * @param {Object} meta
 * @returns {{reason:string, expiresAtText:string, endedLabel:string}}
 */
function describeOverrideMeta(meta = {}) {
  const reason = meta.reason || '一時的な不在';
  const expiresAtText = Number.isFinite(meta.expiresAt) ? formatDateTime(meta.expiresAt) : '時間指定なし';
  const manualEnd = meta.manualEnd;
  const endedLabel = manualEnd === false ? '自動終了' : manualEnd === true ? '手動終了' : '';
  return { reason, expiresAtText, endedLabel };
}

/**
 * ログの meta を用途に応じた一文へ整形する。未対応タイプは JSON 文字列を返す。
 * @param {Object} item
 * @returns {string}
 */
function formatLogDetail(item) {
  if (!item) {
    return '';
  }
  const meta = item.meta || {};

  switch (item.type) {
    case 'absence_override_active': {
      const { reason, expiresAtText } = describeOverrideMeta(meta);
      return `${reason} を許可 (終了予定: ${expiresAtText})`;
    }
    case 'absence_override_inactive': {
      const { reason, endedLabel } = describeOverrideMeta(meta);
      return endedLabel ? `${reason} の許可を終了 (${endedLabel})` : `${reason} の許可を終了`;
    }
    case 'absence_override_extended': {
      const { reason, expiresAtText } = describeOverrideMeta(meta);
      return `${reason} を延長 (終了予定: ${expiresAtText})`;
    }
    case 'absence_override_suppressed': {
      const { reason } = describeOverrideMeta(meta);
      const durationText = item.durationSeconds ? formatDuration(item.durationSeconds) : 'N/A';
      return `${reason} 許可中に不在セッションを終了 (経過 ${durationText})`;
    }
    default:
      return item.meta ? JSON.stringify(item.meta) : '';
  }
}

function formatPlainLogDetail(item) {
  return formatLogDetail(item);
}

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
      const detail = escapeHtml(formatLogDetail(item));
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

  const headers = ['detected_at', 'type', 'duration_seconds', 'detail'];
  const rows = filteredLogs.map((item) => [
    formatDateTime(item.detectedAt),
    item.type,
    item.durationSeconds ?? '',
    formatPlainLogDetail(item),
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
