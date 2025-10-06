/**
 * Slack レポートセクションの取得・描画・手動送信を担当するモジュール。
 * - IPC 経由の呼び出しに失敗した場合でも UI が不整合にならないよう防御的に扱う。
 */
import { state } from './state.js';
import {
  slackSummaryEl,
  slackHistoryListEl,
  slackSendNowBtn,
  slackRefreshBtn,
} from './dom.js';
import { DEFAULT_SLACK_SCHEDULE } from './constants.js';
import { escapeHtml, formatRange, formatDateTime } from './utils.js';

/**
 * Slack関連ボタンの有効/無効をまとめて切り替える。
 * @param {boolean} isBusy trueの場合は操作をブロックする
 */
function setSlackBusy(isBusy) {
  state.slackBusy = isBusy;
  const shouldDisable = isBusy || !window.electronAPI?.slackReporterGetSettings;
  if (slackSendNowBtn) {
    slackSendNowBtn.disabled = shouldDisable;
  }
  if (slackRefreshBtn) {
    slackRefreshBtn.disabled = shouldDisable;
  }
}

/**
 * Slack 設定と送信履歴を同時に取得し、表示を更新する。
 * @param {{showLoadingIndicator?:boolean}} param0 ローディング表示有無
 */
export async function refreshSlackSection({ showLoadingIndicator = false } = {}) {
  if (!window.electronAPI?.slackReporterGetSettings) {
    renderSlackSection();
    return Promise.resolve(null);
  }

  try {
    if (showLoadingIndicator) {
      setSlackBusy(true);
      showSlackSummaryMessage('Slack レポートを取得中...', 'info');
    }

    const [settingsRes, historyRes] = await Promise.all([
      window.electronAPI.slackReporterGetSettings(),
      window.electronAPI.slackReporterHistory({ limit: 5 }),
    ]);

    state.slackSettings = settingsRes?.success ? settingsRes.settings : null;
    state.slackHistory = historyRes?.success && Array.isArray(historyRes.history) ? historyRes.history : [];

    renderSlackSection();
  } catch (error) {
    console.error('[Dashboard] Slack セクション更新エラー:', error);
    showSlackSummaryMessage(error.message || 'Slack レポートの取得に失敗しました', 'error', { temporary: true });
  } finally {
    if (showLoadingIndicator) {
      setSlackBusy(false);
    }
  }
}

/**
 * 「今すぐ送信」ボタン押下時に即時レポートを送信する。
 * 送信後は履歴を再取得し、結果をバナーで通知する。
 */
export async function handleDashboardSlackSendNow() {
  if (state.slackBusy) {
    return;
  }
  if (!window.electronAPI?.slackReporterSendNow) {
    showSlackSummaryMessage('Slack レポート機能は利用できません', 'error', { temporary: true });
    return;
  }

  try {
    setSlackBusy(true);
    showSlackSummaryMessage('Slack にレポートを送信しています...', 'info');
    const response = await window.electronAPI.slackReporterSendNow();
    if (!response?.success) {
      throw new Error(response?.error || '送信に失敗しました');
    }
    await refreshSlackSection({ showLoadingIndicator: false });
    showSlackSummaryMessage('Slack レポートを送信しました', 'success', { temporary: true });
  } catch (error) {
    console.error('[Dashboard] Slack レポート送信エラー:', error);
    showSlackSummaryMessage(error.message || 'Slack レポートの送信に失敗しました', 'error', { temporary: true });
  } finally {
    setSlackBusy(false);
  }
}

/**
 * Slack レポート状況の概要テキストと履歴を描画する。
 */
export function renderSlackSection() {
  if (!slackSummaryEl || !slackHistoryListEl) {
    return;
  }

  if (!window.electronAPI?.slackReporterGetSettings) {
    slackSummaryEl.textContent = 'Slack レポート機能は利用できません。';
    slackSummaryEl.className = 'slack-summary error';
    slackHistoryListEl.innerHTML = '<li class="empty">機能が無効です</li>';
    if (slackSendNowBtn) slackSendNowBtn.disabled = true;
    if (slackRefreshBtn) slackRefreshBtn.disabled = true;
    return;
  }

  if (!state.slackSettings) {
    slackSummaryEl.textContent = 'Slack レポート設定を読み込み中...';
    slackSummaryEl.className = 'slack-summary';
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  if (!state.slackSettings.enabled || !state.slackSettings.webhookUrl) {
    slackSummaryEl.textContent = 'Slack レポートは無効です。設定から有効化してください。';
    slackSummaryEl.className = 'slack-summary';
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  if (!state.slackHistory?.length) {
    const scheduleText = state.slackSettings.scheduleTimes?.length
      ? state.slackSettings.scheduleTimes.join(', ')
      : DEFAULT_SLACK_SCHEDULE.join(', ');
    slackSummaryEl.textContent = `Slack レポートは有効です。送信予定: ${scheduleText}`;
    slackSummaryEl.className = 'slack-summary';
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がまだありません</li>';
    return;
  }

  const latest = state.slackHistory[0];
  const summary = latest.sentAt
    ? `最終送信: ${formatDateTime(latest.sentAt)}`
    : '最終送信時刻を取得できませんでした';
  slackSummaryEl.textContent = latest.error ? `${summary} - ${latest.error}` : summary;
  slackSummaryEl.className = `slack-summary ${latest.status === 'success' ? 'success' : 'error'}`;

  renderSlackHistory();
}

/**
 * 取得済み履歴をサマリ表示用のリストへ整形する。
 */
function renderSlackHistory() {
  if (!slackHistoryListEl) {
    return;
  }

  if (!state.slackHistory || state.slackHistory.length === 0) {
    slackHistoryListEl.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  slackHistoryListEl.innerHTML = state.slackHistory
    .map((entry) => {
      const sentAtLabel = formatDateTime(entry.sentAt);
      const icon = entry.status === 'success' ? '✅' : '⚠️';
      const statusClass = entry.status === 'success' ? 'success' : 'failure';
      const reason = entry.reason === 'schedule' ? '定期' : '手動';
      const messagePreview = entry.message
        ? escapeHtml(
            entry.message
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)[0] || ''
          )
        : '';
      const errorLine = entry.error ? `<div class="slack-history-error">${escapeHtml(entry.error)}</div>` : '';
      const messageLine = messagePreview
        ? `<div class="slack-history-message">${messagePreview}</div>`
        : '';
      return `
        <li class="slack-history-item ${statusClass}">
          <div class="slack-history-header">
            <span class="slack-history-icon">${icon}</span>
            <span class="slack-history-time">${sentAtLabel}</span>
            <span class="slack-history-status">${entry.status === 'success' ? '成功' : '失敗'}</span>
            <span class="slack-history-reason">${reason}</span>
          </div>
          ${messageLine}
          ${errorLine}
        </li>
      `;
    })
    .join('');
}

/**
 * Slack セクション上部のステータスメッセージを暫定表示する。
 * @param {string} message 表示する内容
 * @param {'info'|'success'|'error'} type 表示スタイル
 * @param {{temporary?:boolean,duration?:number}} options 一時表示オプション
 */
function showSlackSummaryMessage(message, type = 'info', options = {}) {
  if (!slackSummaryEl) {
    return;
  }

  if (state.slackSummaryResetHandle) {
    clearTimeout(state.slackSummaryResetHandle);
    state.slackSummaryResetHandle = null;
  }

  slackSummaryEl.textContent = message;
  slackSummaryEl.className = `slack-summary ${type}`;

  if (options.temporary) {
    state.slackSummaryResetHandle = setTimeout(() => {
      state.slackSummaryResetHandle = null;
      renderSlackSection();
    }, options.duration ?? 3000);
  }
}

/**
 * Slack セクションの初期イベントを登録し、初期描画を実行する。
 */
export function initializeSlackSection() {
  if (slackSendNowBtn && window.electronAPI?.slackReporterSendNow) {
    slackSendNowBtn.addEventListener('click', handleDashboardSlackSendNow);
  }

  if (slackRefreshBtn && window.electronAPI?.slackReporterHistory) {
    slackRefreshBtn.addEventListener('click', () => {
      refreshSlackSection({ showLoadingIndicator: true });
    });
  }
  renderSlackSection();
}
