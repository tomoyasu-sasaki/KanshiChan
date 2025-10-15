/**
 * 最前面アプリの監視と使用時間記録。
 * - 1秒間隔で取得し、アプリ切り替え時にログと使用時間を送信する。
 */
import { getMonitorState } from './context.js';
import { addLog } from './logs.js';

const APP_USAGE_MIN_DURATION_SECONDS = 5;

/**
 * 最前面ウィンドウを取得し、切り替わりを検知したらログに残す。
 */
export async function trackActiveWindow() {
  if (!window.electronAPI || typeof window.electronAPI.getActiveWindow !== 'function') {
    return;
  }

  try {
    const response = await window.electronAPI.getActiveWindow();
    if (!response?.success) {
      return;
    }

    const w = response.window || {};
    const appName = w.app || 'Unknown';
    const title = w.title || '';
    const url = w.url || null;

    let domain = null;
    if (url) {
      try {
        domain = new URL(url).hostname;
      } catch {}
    }
    const keySource = domain || title.slice(0, 60);
    const key = `${appName}::${keySource}`;

    const state = getMonitorState();
    const now = Date.now();

    if (!state.lastActiveWindowInfo) {
      state.lastActiveWindowInfo = { key, appName, title, domain };
      state.lastActiveWindowStart = now;
      addLog(`前面: ${appName}${domain ? ` (${domain})` : title ? ` - ${title}` : ''}`);
      return;
    }

    if (key === state.lastActiveWindowInfo.key) {
      return;
    }

    recordActiveWindowSession(now);
    addLog(`前面: ${appName}${domain ? ` (${domain})` : title ? ` - ${title}` : ''}`);
    state.lastActiveWindowInfo = { key, appName, title, domain };
    state.lastActiveWindowStart = now;
  } catch {
    // 取得失敗は無視（OS によっては拒否される可能性がある）
  }
}

/**
 * 一定時間以上フォーカスされていたアプリを electronAPI へ送信する。
 */
export function recordActiveWindowSession(endTimestamp = Date.now()) {
  const state = getMonitorState();
  if (!state.lastActiveWindowInfo || !state.lastActiveWindowStart) {
    return;
  }

  const durationSeconds = Math.floor((endTimestamp - state.lastActiveWindowStart) / 1000);
  if (durationSeconds < APP_USAGE_MIN_DURATION_SECONDS) {
    return;
  }

  if (!window.electronAPI || typeof window.electronAPI.recordAppUsage !== 'function') {
    return;
  }

  window.electronAPI
    .recordAppUsage({
      appName: state.lastActiveWindowInfo.appName,
      title: state.lastActiveWindowInfo.title,
      domain: state.lastActiveWindowInfo.domain,
      startedAt: state.lastActiveWindowStart,
      endedAt: endTimestamp,
      durationSeconds,
    })
    .catch((error) => {
      console.warn('[Monitor] アプリ使用時間送信に失敗:', error);
    });

  state.lastActiveWindowStart = endTimestamp;
}
