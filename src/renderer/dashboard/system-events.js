/**
 * システムイベント（ロック/スリープ等）の取得と表示を担当するモジュール。
 */
import { state } from './state.js';
import {
  systemEventsRefreshBtn,
  systemEventsTableBody,
} from './dom.js';
import { formatDateTime, formatSystemEventLabel, escapeHtml } from './utils.js';

/**
 * システムイベント取得中のボタン状態を更新する。
 * @param {boolean} isBusy true の場合はリロードを抑止
 */
function setSystemEventsBusy(isBusy) {
  state.systemEventsBusy = isBusy;
  if (systemEventsRefreshBtn) {
    systemEventsRefreshBtn.disabled = isBusy;
  }
}

/**
 * 指定期間内のシステムイベントを取得し、テーブルへ反映する。
 * @param {{start?:number,end?:number,showLoading?:boolean}} param0 取得条件
 */
export async function refreshSystemEvents({ start, end, showLoading = false } = {}) {
  if (!window.electronAPI?.systemEventsRecent) {
    renderSystemEventsTable('システムイベント機能は利用できません');
    return null;
  }

  const rangeStart = Number.isFinite(start) ? start : state.lastRange?.start;
  const rangeEnd = Number.isFinite(end) ? end : state.lastRange?.end;

  try {
    if (showLoading) {
      setSystemEventsBusy(true);
    }

    const response = await window.electronAPI.systemEventsRecent({
      start: rangeStart,
      end: rangeEnd,
      limit: 100,
    });

    if (response?.success) {
      state.systemEvents = response.data?.events || [];
    } else {
      state.systemEvents = [];
    }

    renderSystemEventsTable();
  } catch (error) {
    console.error('[Dashboard] システムイベント取得エラー:', error);
    state.systemEvents = [];
    renderSystemEventsTable('システムイベントの取得に失敗しました');
  } finally {
    if (showLoading) {
      setSystemEventsBusy(false);
    }
  }
}

/**
 * 取得済みイベントをテーブル表示へレンダリングする。
 * @param {string|null} errorMessage エラー発生時に表示するメッセージ
 */
export function renderSystemEventsTable(errorMessage = null) {
  if (!systemEventsTableBody) {
    return;
  }

  if (errorMessage) {
    systemEventsTableBody.innerHTML = `<tr class="empty"><td colspan="3">${escapeHtml(errorMessage)}</td></tr>`;
    return;
  }

  const events = state.systemEvents || [];
  if (events.length === 0) {
    systemEventsTableBody.innerHTML = '<tr class="empty"><td colspan="3">イベントはありません</td></tr>';
    return;
  }

  systemEventsTableBody.innerHTML = events
    .map((event) => {
      const when = formatDateTime(event.occurredAt);
      const label = formatSystemEventLabel(event.eventType);
      const meta = event.meta ? escapeHtml(JSON.stringify(event.meta)) : '-';
      return `
        <tr>
          <td>${when}</td>
          <td>${escapeHtml(label)}</td>
          <td>${meta}</td>
        </tr>
      `;
    })
    .join('');
}

/**
 * システムイベントセクションで使用するイベントリスナを登録する。
 */
export function initializeSystemEventsSection() {
  if (systemEventsRefreshBtn && window.electronAPI?.systemEventsRecent) {
    systemEventsRefreshBtn.addEventListener('click', () => {
      refreshSystemEvents({ showLoading: true });
    });
  }
}
