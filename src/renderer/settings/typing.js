/**
 * タイピング監視セクションの UI 制御。
 * - electronAPI の有無と監視状態を考慮し、ドロワーからの操作をまとめる。
 */
import { adjustAccordionHeight } from './utils.js';

const dom = {
  enabledCheckbox: null,
  pauseButton: null,
  statusLabel: null,
  messageContainer: null,
};

let typingStatusCache = null;
let typingSettingsBusy = false;

/**
 * タイピング監視 UI の初期化を行う。
 * - API が未連携な環境では即座にメッセージを表示してユーザーに伝える。
 */
export async function initializeTypingMonitorSection() {
  bindDom();

  if (!dom.enabledCheckbox) {
    return;
  }

  if (!window.electronAPI?.typingMonitorStatus) {
    dom.enabledCheckbox.disabled = true;
    dom.pauseButton?.setAttribute('disabled', 'disabled');
    if (dom.statusLabel) {
      dom.statusLabel.textContent = 'タイピング監視機能は利用できません (electronAPI 未連携)';
    }
    return;
  }

  dom.enabledCheckbox.addEventListener('change', handleTypingMonitorEnabledChange);
  dom.pauseButton?.addEventListener('click', handleTypingMonitorPauseSettings);

  await refreshTypingMonitorStatus({ showBusy: true, showError: false });
}

/**
 * 利用する DOM 要素をキャッシュする。
 * - 連続操作時の再計測を避けてレスポンスを向上させる。
 */
function bindDom() {
  dom.enabledCheckbox = document.getElementById('typingMonitorEnabled');
  dom.pauseButton = document.getElementById('typingMonitorPauseSettingsBtn');
  dom.statusLabel = document.getElementById('typingMonitorSettingsStatus');
  dom.messageContainer = document.getElementById('typingMonitorSettingsMessage');
}

/**
 * Busy 状態を更新し、UI の有効/無効を切り替える。
 * - 別操作の割り込みで状態が壊れないようキャッシュと連動させる。
 */
function setTypingSettingsBusy(isBusy) {
  typingSettingsBusy = isBusy;
  updateTypingMonitorSettingsUI();
}

/**
 * 取得済みステータスを元に UI を再描画する。
 * - available が false の場合に具体的な導線を示し、ユーザーが対処しやすくする。
 */
function updateTypingMonitorSettingsUI() {
  const status = typingStatusCache;
  const available = status?.available !== false;

  if (dom.enabledCheckbox) {
    dom.enabledCheckbox.checked = Boolean(available && status?.enabled);
    dom.enabledCheckbox.disabled = typingSettingsBusy || !available;
  }

  if (dom.pauseButton) {
    dom.pauseButton.disabled = typingSettingsBusy || !available || !status?.enabled;
    dom.pauseButton.textContent = status?.paused ? '再開' : '休止';
  }

  if (dom.statusLabel) {
    let text = '状態取得中...';
    if (!status) {
      text = '状態取得中...';
    } else if (!available) {
      text = 'uiohook-napi が読み込めません。ビルド状態を確認してください。';
    } else if (!status.enabled) {
      text = 'タイピング監視は無効です。設定で有効化できます。';
    } else if (status.paused) {
      text = 'タイピング監視は休止中です。再開ボタンを押して復帰できます。';
    } else {
      const lastKeyText = status.lastKeyAt ? formatTypingSettingsTimestamp(status.lastKeyAt) : '記録なし';
      text = `タイピング監視は稼働中（最終入力: ${lastKeyText}）`;
    }
    dom.statusLabel.textContent = text;
  }
}

/**
 * electronAPI から状態を取得し、必要に応じて Busy を伴う更新を行う。
 * - 指定フラグによってエラーメッセージ表示の有無を制御する。
 */
async function refreshTypingMonitorStatus({ showBusy = false, showError = true } = {}) {
  if (!window.electronAPI?.typingMonitorStatus) {
    return;
  }

  try {
    if (showBusy) {
      setTypingSettingsBusy(true);
    }
    const response = await window.electronAPI.typingMonitorStatus();
    if (!response?.success) {
      throw new Error(response?.error || 'タイピング監視の状態取得に失敗しました');
    }
    typingStatusCache = response.status;
    updateTypingMonitorSettingsUI();
  } catch (error) {
    console.error('[Settings] タイピング監視状態取得エラー:', error);
    if (showError) {
      showTypingSettingsMessage(error.message || 'タイピング監視の状態取得に失敗しました', 'error');
    }
  } finally {
    if (showBusy) {
      setTypingSettingsBusy(false);
    } else {
      updateTypingMonitorSettingsUI();
    }
  }
}

/**
 * 有効/無効トグル操作を処理し、API 失敗時は元の状態へ戻す。
 * - Busy 中の重複操作を防ぎ、イベント送出で他コンポーネントへ通知する。
 */
async function handleTypingMonitorEnabledChange(event) {
  if (typingSettingsBusy) {
    if (dom.enabledCheckbox) {
      dom.enabledCheckbox.checked = Boolean(typingStatusCache?.enabled);
    }
    return;
  }
  if (!window.electronAPI?.typingMonitorSetEnabled) {
    showTypingSettingsMessage('タイピング監視の切替 API が利用できません', 'error');
    if (dom.enabledCheckbox) {
      dom.enabledCheckbox.checked = Boolean(typingStatusCache?.enabled);
    }
    return;
  }

  const enabled = Boolean(event.target.checked);

  try {
    setTypingSettingsBusy(true);
    showTypingSettingsMessage(enabled ? 'タイピング監視を有効化しています...' : 'タイピング監視を無効化しています...', 'info');
    const response = await window.electronAPI.typingMonitorSetEnabled(enabled);
    if (!response?.success) {
      throw new Error(response?.error || 'タイピング監視の切替に失敗しました');
    }
    typingStatusCache = response.status;
    updateTypingMonitorSettingsUI();
    showTypingSettingsMessage(enabled ? 'タイピング監視を有効化しました' : 'タイピング監視を無効化しました', 'success');
    window.dispatchEvent(new CustomEvent('typing-monitor-status-updated'));
  } catch (error) {
    console.error('[Settings] タイピング監視切替エラー:', error);
    showTypingSettingsMessage(error.message || 'タイピング監視の切替に失敗しました', 'error');
    if (dom.enabledCheckbox) {
      dom.enabledCheckbox.checked = Boolean(typingStatusCache?.enabled);
    }
  } finally {
    setTypingSettingsBusy(false);
  }
}

/**
 * 休止/再開ボタンの操作を処理する。
 * - uiohook が無効な場合のエラーを即座に返し、利用者が原因を特定しやすくする。
 */
async function handleTypingMonitorPauseSettings() {
  if (typingSettingsBusy) {
    return;
  }
  if (!window.electronAPI?.typingMonitorSetPaused) {
    showTypingSettingsMessage('休止制御が利用できません', 'error');
    return;
  }

  if (!typingStatusCache) {
    await refreshTypingMonitorStatus({ showBusy: true });
  }

  const status = typingStatusCache;
  if (!status?.available) {
    showTypingSettingsMessage('uiohook-napi が読み込まれていないため操作できません', 'error');
    return;
  }
  if (!status.enabled) {
    showTypingSettingsMessage('監視が無効のため休止操作はできません', 'error');
    return;
  }

  const nextPaused = !status.paused;

  try {
    setTypingSettingsBusy(true);
    showTypingSettingsMessage(nextPaused ? 'タイピング監視を休止しています...' : 'タイピング監視を再開しています...', 'info');
    const response = await window.electronAPI.typingMonitorSetPaused(nextPaused);
    if (!response?.success) {
      throw new Error(response?.error || 'タイピング監視の休止切替に失敗しました');
    }
    typingStatusCache = response.status;
    updateTypingMonitorSettingsUI();
    showTypingSettingsMessage(nextPaused ? 'タイピング監視を休止しました' : 'タイピング監視を再開しました', 'success');
    window.dispatchEvent(new CustomEvent('typing-monitor-status-updated'));
  } catch (error) {
    console.error('[Settings] タイピング監視休止エラー:', error);
    showTypingSettingsMessage(error.message || 'タイピング監視の休止切替に失敗しました', 'error');
  } finally {
    setTypingSettingsBusy(false);
  }
}

/**
 * ステータスメッセージを一時表示し、アコーディオン高さを維持する。
 * - メッセージ消去タイミングを統一して UI のちらつきを抑える。
 */
function showTypingSettingsMessage(text, type = 'info') {
  if (!dom.messageContainer) {
    return;
  }
  dom.messageContainer.textContent = text;
  dom.messageContainer.className = `slack-message show ${type}`;
  adjustAccordionHeight(dom.messageContainer);
  setTimeout(() => {
    if (!dom.messageContainer) {
      return;
    }
    dom.messageContainer.textContent = '';
    dom.messageContainer.className = 'slack-message';
    adjustAccordionHeight(dom.messageContainer);
  }, 4000);
}

/**
 * ステータスの最終キー入力時刻を UI 用の表記に整える。
 * - invalid Date を避け、メッセージの整合性を維持する。
 */
function formatTypingSettingsTimestamp(value) {
  if (!value) {
    return '記録なし';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '記録なし';
  }
  return date.toLocaleString('ja-JP', { hour12: false });
}

/**
 * 外部コンポーネントへ Busy 状態を提供する。
 * - 音声コマンド処理が競合操作を控えるために使用する。
 */
export function isTypingSettingsBusy() {
  return typingSettingsBusy;
}
