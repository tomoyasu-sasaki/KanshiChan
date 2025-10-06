/**
 * タイピングアクティビティセクションの状態取得と描画を担当するモジュール。
 * - 監視トグルや統計取得はIPC依存のため、失敗時はユーザーに明確なメッセージを返す。
 */
import { state } from './state.js';
import {
  typingMonitorPauseBtn,
  typingStatsRefreshBtn,
  typingMonitorStatusEl,
  typingTableBody,
  typeFilterSelect,
} from './dom.js';
import { renderTypingChart } from './charts.js';
import { formatDateTime, formatDuration } from './utils.js';

/**
 * タイピング統計ロード中に操作をロックするヘルパー。
 * @param {boolean} isBusy true の場合は操作を停止
 */
function setTypingBusy(isBusy) {
  state.typingBusy = isBusy;
  updateTypingControlsDisabled();
}

/**
 * 利用可能な API に応じてボタンの有効/無効を更新する。
 */
function updateTypingControlsDisabled() {
  const shouldDisable = state.typingBusy || !window.electronAPI?.typingActivityStats;
  if (typingStatsRefreshBtn) {
    typingStatsRefreshBtn.disabled = shouldDisable;
  }
  if (typingMonitorPauseBtn) {
    typingMonitorPauseBtn.disabled = shouldDisable || !window.electronAPI?.typingMonitorSetPaused;
  }
}

/**
 * 指定期間でタイピング統計を取得し、グラフと表を更新する。
 * @param {{start?:number,end?:number,showLoading?:boolean}} param0 取得条件
 */
export async function refreshTypingSection({ start = state.lastRange?.start, end = state.lastRange?.end, showLoading = false } = {}) {
  if (start == null || end == null) {
    return null;
  }
  if (!window.electronAPI?.typingActivityStats) {
    showTypingStatusMessage('タイピング統計は利用できません。', 'error');
    return null;
  }

  try {
    if (showLoading) {
      setTypingBusy(true);
      showTypingStatusMessage('タイピング統計を取得中...', 'info');
    }

    const response = await window.electronAPI.typingActivityStats({ start, end, limit: 500 });

    if (!response?.success) {
      throw new Error(response?.error || '統計の取得に失敗しました');
    }

    state.typingStats = response.data || null;
    renderTypingStatus();
    renderTypingTable();
    if (typeFilterSelect?.value === 'typing') {
      renderTypingChart();
    }
  } catch (error) {
    console.error('[Dashboard] タイピング統計エラー:', error);
    state.typingStats = null;
    renderTypingTable();
    if (typeFilterSelect?.value === 'typing') {
      renderTypingChart();
    }
    showTypingStatusMessage(error.message || 'タイピング統計の取得に失敗しました', 'error', { temporary: true });
  } finally {
    if (showLoading) {
      setTypingBusy(false);
    } else {
      updateTypingControlsDisabled();
    }
  }
}

/**
 * タイピング監視の稼働状況をステータス文として描画する。
 */
export function renderTypingStatus() {
  if (!typingMonitorStatusEl) {
    return;
  }

  if (!window.electronAPI?.typingMonitorStatus) {
    typingMonitorStatusEl.textContent = 'タイピング監視機能は利用できません。';
    typingMonitorStatusEl.className = 'typing-status error';
    updateTypingControlsDisabled();
    return;
  }

  const status = state.typingStatus;
  typingMonitorStatusEl.className = 'typing-status';

  if (!status) {
    typingMonitorStatusEl.textContent = 'タイピング監視の状態を取得中...';
    updateTypingControlsDisabled();
    return;
  }

  if (!status.available) {
    typingMonitorStatusEl.textContent = 'タイピング監視は利用できません（uiohook-napi が見つかりません）';
    typingMonitorStatusEl.classList.add('error');
  } else if (!status.enabled) {
    typingMonitorStatusEl.textContent = 'タイピング監視は無効です。';
  } else if (status.paused) {
    typingMonitorStatusEl.textContent = 'タイピング監視は休止中です。';
  } else if (!status.running) {
    typingMonitorStatusEl.textContent = 'タイピング監視は待機状態です。';
  } else {
    const lastKey = status.lastKeyAt ? formatDateTime(status.lastKeyAt) : '記録なし';
    const memoryMb = status.resourceUsage?.memory?.rss
      ? Math.round(status.resourceUsage.memory.rss / (1024 * 1024))
      : null;
    let message = `タイピング監視は稼働中（最終入力: ${lastKey}`;
    if (memoryMb != null) {
      message += ` / メモリ ${memoryMb}MB`;
    }
    message += '）';
    typingMonitorStatusEl.textContent = message;
    typingMonitorStatusEl.classList.add('active');
  }

  if (typingMonitorPauseBtn) {
    typingMonitorPauseBtn.textContent = status?.paused ? '再開' : '休止';
  }

  updateTypingControlsDisabled();
}

/**
 * タイピング統計テーブルを最新データで再描画する。
 */
export function renderTypingTable() {
  if (!typingTableBody) {
    return;
  }

  const buckets = state.typingStats?.buckets || [];
  if (buckets.length === 0) {
    typingTableBody.innerHTML = '<tr class="empty"><td colspan="4">データがありません</td></tr>';
    return;
  }

  const latestBuckets = buckets.slice(-120);
  const sortedBuckets = latestBuckets.slice().sort((a, b) => {
    const aTs = Number.isFinite(a.bucketStart) ? a.bucketStart : 0;
    const bTs = Number.isFinite(b.bucketStart) ? b.bucketStart : 0;
    return bTs - aTs;
  });

  typingTableBody.innerHTML = sortedBuckets
    .map((bucket) => {
      const startLabel = formatDateTime(bucket.bucketStart);
      const endLabel = formatDateTime(bucket.bucketEnd);
      const duration = formatDuration(bucket.longestStreakSeconds || 0);
      return `
        <tr>
          <td>${startLabel}</td>
          <td>${endLabel}</td>
          <td>${bucket.keyPresses ?? 0}</td>
          <td>${duration}</td>
        </tr>
      `;
    })
    .join('');
}

/**
 * 休止/再開ボタン押下時に監視状態を切り替える。
 */
export async function handleTypingPauseToggle() {
  if (state.typingBusy) {
    return;
  }
  if (!window.electronAPI?.typingMonitorSetPaused) {
    showTypingStatusMessage('休止制御が利用できません', 'error', { temporary: true });
    return;
  }
  if (!state.typingStatus) {
    return;
  }

  const nextPaused = !state.typingStatus.paused;

  try {
    setTypingBusy(true);
    showTypingStatusMessage(nextPaused ? 'タイピング監視を休止しています...' : 'タイピング監視を再開しています...', 'info');
    const response = await window.electronAPI.typingMonitorSetPaused(nextPaused);
    if (!response?.success) {
      throw new Error(response?.error || '休止切替に失敗しました');
    }
    state.typingStatus = response.status;
    await refreshTypingSection({ showLoading: false });
    showTypingStatusMessage(nextPaused ? 'タイピング監視を休止しました' : 'タイピング監視を再開しました', 'success', { temporary: true });
  } catch (error) {
    console.error('[Dashboard] タイピング休止切替エラー:', error);
    showTypingStatusMessage(error.message || 'タイピング監視の休止に失敗しました', 'error', { temporary: true });
  } finally {
    setTypingBusy(false);
  }
}

/**
 * 一時的なステータスメッセージを表示するヘルパー。
 * @param {string} message 表示内容
 * @param {'info'|'success'|'error'} type 表示スタイル
 * @param {{temporary?:boolean,duration?:number}} options 一時表示制御
 */
export function showTypingStatusMessage(message, type = 'info', options = {}) {
  if (!typingMonitorStatusEl) {
    return;
  }

  if (state.typingStatusResetHandle) {
    clearTimeout(state.typingStatusResetHandle);
    state.typingStatusResetHandle = null;
  }

  let className = 'typing-status';
  if (type === 'error') {
    className += ' error';
  } else if (type === 'success') {
    className += ' active';
  }
  typingMonitorStatusEl.className = className;
  typingMonitorStatusEl.textContent = message;

  if (options.temporary) {
    state.typingStatusResetHandle = setTimeout(() => {
      state.typingStatusResetHandle = null;
      renderTypingStatus();
    }, options.duration ?? 3000);
  }
}

/**
 * タイピングセクションのイベント初期化と初期レンダリングを実施する。
 */
export function initializeTypingSection() {
  if (typingStatsRefreshBtn && window.electronAPI?.typingActivityStats) {
    typingStatsRefreshBtn.addEventListener('click', () => {
      refreshTypingSection({ showLoading: true });
    });
  }

  if (typingMonitorPauseBtn && window.electronAPI?.typingMonitorSetPaused) {
    typingMonitorPauseBtn.addEventListener('click', handleTypingPauseToggle);
  }

  renderTypingStatus();
}

/**
 * 監視プロセスの現在状態を取得し、ステータス表示を更新する。
 */
export async function refreshTypingStatus() {
  if (!window.electronAPI?.typingMonitorStatus) {
    state.typingStatus = null;
    renderTypingStatus();
    return;
  }

  try {
    const status = await window.electronAPI.typingMonitorStatus();
    state.typingStatus = status?.success ? status.status : null;
  } catch (error) {
    console.error('[Dashboard] タイピング状態取得エラー:', error);
    state.typingStatus = null;
  } finally {
    renderTypingStatus();
    updateTypingControlsDisabled();
  }
}
