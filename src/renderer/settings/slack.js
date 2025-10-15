/**
 * Slack レポート設定セクションの UI 制御。
 * - electronAPI の有無に応じてトグルし、フォーム保存と履歴取得を扱う。
 */
import { DEFAULT_SLACK_SCHEDULE } from './state.js';
import { adjustAccordionHeight, escapeHtml } from './utils.js';

const dom = {
  reporterEnabled: null,
  webhookUrl: null,
  scheduleTimes: null,
  timezone: null,
  saveBtn: null,
  sendNowBtn: null,
  message: null,
  historyList: null,
};

let slackSettingsCache = null;
let slackControlsBusy = false;
let slackHistoryCache = [];

/**
 * Slack 設定 UI を初期化し、API が利用できない場合は即座にユーザーへ通知する。
 * - DOM 参照とイベント登録を一度に済ませ、他モジュールからの順序依存を避ける。
 */
export async function initializeSlackReporterSection() {
  bindDom();

  if (!dom.reporterEnabled) {
    return;
  }

  if (!window.electronAPI?.slackReporterGetSettings) {
    setSlackFieldsDisabled(true);
    showSlackMessage('Slack レポート機能を初期化できません (electronAPI 未接続)', 'error');
    return;
  }

  dom.saveBtn?.addEventListener('click', handleSlackSettingsSave);
  dom.sendNowBtn?.addEventListener('click', handleSlackSendNow);

  await refreshSlackSettings(false);
  renderSlackStatus();
}

/**
 * 利用する DOM 要素をキャッシュする。
 * - レンダリングごとの再取得を避け、連続操作時のラグを減らす。
 */
function bindDom() {
  dom.reporterEnabled = document.getElementById('slackReporterEnabled');
  dom.webhookUrl = document.getElementById('slackWebhookUrl');
  dom.scheduleTimes = document.getElementById('slackScheduleTimes');
  dom.timezone = document.getElementById('slackTimezone');
  dom.saveBtn = document.getElementById('slackSaveBtn');
  dom.sendNowBtn = document.getElementById('slackSendNowBtn');
  dom.message = document.getElementById('slackReporterMessage');
  dom.historyList = document.getElementById('slackHistoryList');
}

/**
 * Busy 状態に合わせて入力一式を有効/無効化する。
 * - 保存中にユーザーが値を変えて競合する問題を防止する。
 */
function setSlackFieldsDisabled(disabled) {
  [
    dom.reporterEnabled,
    dom.webhookUrl,
    dom.scheduleTimes,
    dom.timezone,
    dom.saveBtn,
    dom.sendNowBtn,
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

/**
 * Busy フラグを更新し、副作用として入力フォームの制御を行う。
 * - 外部からも状態を参照できるように shared state を保持する。
 */
function setSlackBusy(isBusy) {
  slackControlsBusy = isBusy;
  setSlackFieldsDisabled(isBusy);
}

/**
 * 取得した設定をフォームへ反映する。
 * - 設定が無効な場合でも schedule などのデフォルト値を明示的に表示する。
 */
function applySlackSettingsToInputs(settings) {
  if (!dom.reporterEnabled) {
    return;
  }

  slackSettingsCache = settings || null;
  const enabled = Boolean(slackSettingsCache?.enabled);

  dom.reporterEnabled.checked = enabled;
  if (dom.webhookUrl) {
    dom.webhookUrl.value = slackSettingsCache?.webhookUrl || '';
  }
  if (dom.scheduleTimes) {
    const schedule = slackSettingsCache?.scheduleTimes?.length
      ? slackSettingsCache.scheduleTimes.join(', ')
      : DEFAULT_SLACK_SCHEDULE.join(', ');
    dom.scheduleTimes.value = schedule;
  }
  if (dom.timezone) {
    dom.timezone.value = slackSettingsCache?.timezone || '';
  }

  renderSlackStatus();
}

/**
 * スケジュール入力を安全な配列へ正規化する。
 * - ユーザーが空文字や余分なカンマを入力しても既定値に戻す。
 */
function parseScheduleInput(value) {
  if (typeof value !== 'string') {
    return DEFAULT_SLACK_SCHEDULE;
  }
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : DEFAULT_SLACK_SCHEDULE;
}

/**
 * electronAPI から最新の Slack 設定を取得する。
 * - エラー時はユーザーへ通知しつつ Busy 状態を確実に解除する。
 */
async function refreshSlackSettings(showError = true) {
  if (!window.electronAPI?.slackReporterGetSettings) {
    return;
  }

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterGetSettings();
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 設定の取得に失敗しました');
    }
    applySlackSettingsToInputs(response.settings);
  } catch (error) {
    console.error('[Settings] Slack 設定取得エラー:', error);
    if (showError) {
      showSlackMessage(error.message || 'Slack 設定の取得に失敗しました', 'error');
    }
  } finally {
    setSlackBusy(false);
  }
}

/**
 * Slack 送信履歴を再取得して一覧に描画する。
 * - 一時的な API エラーでもフォーム操作を継続できるようにする。
 */
async function refreshSlackHistory(showMessageOnError = false) {
  if (!window.electronAPI?.slackReporterHistory || !dom.historyList) {
    return;
  }

  try {
    const response = await window.electronAPI.slackReporterHistory();
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 履歴の取得に失敗しました');
    }
    slackHistoryCache = Array.isArray(response.history) ? response.history : [];
    renderSlackHistory();
  } catch (error) {
    console.error('[Settings] Slack 履歴取得エラー:', error);
    if (showMessageOnError) {
      showSlackMessage(error.message || 'Slack 履歴の取得に失敗しました', 'error');
    }
  }
}

/**
 * 将来的なステータス表示拡張のためのプレースホルダー。
 * - 既存仕様が空実装であることを明文化しておき、レビュー時の混乱を避ける。
 */
function renderSlackStatus() {
  // 既存コードは未実装のため、ここでも空実装を維持する
}

/**
 * 履歴データを最新 10 件まで逆順で描画し、サニタイズを徹底する。
 * - 履歴なしのケースでは明示的な空表示を行う。
 */
function renderSlackHistory() {
  if (!dom.historyList) {
    return;
  }

  if (!slackHistoryCache.length) {
    dom.historyList.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  const latest = slackHistoryCache.slice(-10).reverse();
  dom.historyList.innerHTML = latest
    .map((entry) => {
      const date = entry?.sentAt ? new Date(entry.sentAt) : null;
      const timestamp = date && !Number.isNaN(date.getTime())
        ? date.toLocaleString('ja-JP', { hour12: false })
        : '-';
      return `
        <li>
          <div class="history-message">${escapeHtml(entry?.message || '')}</div>
          <div class="history-timestamp">${timestamp}</div>
        </li>
      `;
    })
    .join('');
}

/**
 * Slack 設定を保存し、成功時には履歴一覧も更新する。
 * - API 未提供環境では即座にエラーを返し、設定の齟齬を防ぐ。
 */
async function handleSlackSettingsSave() {
  if (slackControlsBusy) {
    return;
  }
  if (!window.electronAPI?.slackReporterUpdateSettings) {
    showSlackMessage('Slack 設定を保存できません (electronAPI 未接続)', 'error');
    return;
  }

  const payload = {
    enabled: dom.reporterEnabled?.checked ?? false,
    webhookUrl: dom.webhookUrl?.value?.trim() || '',
    scheduleTimes: parseScheduleInput(dom.scheduleTimes?.value || ''),
    timezone: dom.timezone?.value?.trim() || undefined,
  };

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterUpdateSettings(payload);
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 設定の保存に失敗しました');
    }
    applySlackSettingsToInputs(response.settings);
    showSlackMessage('Slack 設定を保存しました', 'success');
    await refreshSlackHistory(false);
  } catch (error) {
    console.error('[Settings] Slack 設定保存エラー:', error);
    showSlackMessage(error.message || 'Slack 設定の保存に失敗しました', 'error');
  } finally {
    setSlackBusy(false);
  }
}

/**
 * 手動送信ボタンを処理し、重複クリックを防ぐ。
 * - 送信 API が存在しない構成ではエラー文言を確実に出す。
 */
async function handleSlackSendNow() {
  if (slackControlsBusy) {
    return;
  }
  if (!window.electronAPI?.slackReporterSendNow) {
    showSlackMessage('Slack 送信 API が利用できません', 'error');
    return;
  }

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterSendNow();
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 送信に失敗しました');
    }
  } catch (error) {
    console.error('[Settings] Slack 手動送信エラー:', error);
    showSlackMessage(error.message || 'Slack 手動送信に失敗しました', 'error');
  } finally {
    setSlackBusy(false);
  }
}

/**
 * Slack セクション内のフィードバックメッセージを表示する。
 * - アコーディオン高さを調整して、レイアウト崩れを防止する。
 */
function showSlackMessage(text, type = 'info') {
  if (!dom.message) {
    return;
  }
  dom.message.textContent = text;
  dom.message.className = `slack-message show ${type}`;
  adjustAccordionHeight(dom.message);
  setTimeout(() => {
    if (!dom.message) {
      return;
    }
    dom.message.textContent = '';
    dom.message.className = 'slack-message';
    adjustAccordionHeight(dom.message);
  }, 4000);
}

/**
 * 外部コンポーネントが Slack 操作中かどうかを判定するためのヘルパー。
 * - 音声コマンドが競合操作を避けるために使用する。
 */
export function isSlackBusy() {
  return slackControlsBusy;
}
