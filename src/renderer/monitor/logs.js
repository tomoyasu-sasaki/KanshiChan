/**
 * 監視画面のログおよびバックエンド記録へのブリッジ。
 * - UI表示用のログとelectronAPIへの送信を一箇所にまとめる。
 */
import { getMonitorState, MONITOR_UI_CONSTANTS } from './context.js';

/**
 * モニタリングログへ新しい行を追加する。
 * - 初回の空表示を除去し、最大件数を維持する。
 */
export function addLog(message, type = 'info') {
  const { logContainer } = getMonitorState().elements;
  if (!logContainer) {
    return;
  }

  if (logContainer.querySelector('.empty-message')) {
    logContainer.innerHTML = '';
  }

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;

  const timestamp = new Date().toLocaleTimeString('ja-JP');
  logEntry.innerHTML = `<span class="log-time">${timestamp}</span> ${message}`;

  logContainer.insertBefore(logEntry, logContainer.firstChild);

  while (logContainer.children.length > MONITOR_UI_CONSTANTS.maxLogEntries) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

/**
 * 検知/不在イベントを electronAPI 側に記録する。
 * - 成功時はダッシュボードへ通知するための CustomEvent を発火する。
 */
export function recordDetectionLogEntry({ type, detectedAt = Date.now(), durationSeconds = null, meta = null }) {
  if (!window.electronAPI || typeof window.electronAPI.recordDetectionLog !== 'function') {
    return;
  }

  window.electronAPI
    .recordDetectionLog({
      type,
      detectedAt,
      durationSeconds,
      meta,
    })
    .then(() => {
      window.dispatchEvent(new CustomEvent('detection-log-recorded'));
    })
    .catch((error) => {
      console.warn('[Monitor] 検知ログ送信に失敗:', error);
    });
}
