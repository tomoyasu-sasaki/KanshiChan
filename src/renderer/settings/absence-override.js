/**
 * 不在許可セクションの UI 制御。
 * - electronAPI と連携し、状態変化を即時にドロワーへ反映する。
 */
import {
  ensureAbsenceOverrideBridge,
  subscribeAbsenceOverride,
  activateAbsenceOverride,
  clearAbsenceOverride,
  getAbsenceOverrideState,
  refreshAbsenceOverrideState,
} from '../services/absence-override.js';
import { adjustAccordionHeight, escapeHtml, formatTimestamp } from './utils.js';

const dom = {
  statusText: null,
  countdownRow: null,
  countdown: null,
  reasonInput: null,
  minutesInput: null,
  startBtn: null,
  clearBtn: null,
  message: null,
  presetButtons: [],
  historyList: null,
};

let overrideCountdownTimer = null;

/**
 * 不在許可 UI を初期化し、状態購読を開始する。
 * - API が利用できない場合でもメッセージで検知できるようにする。
 */
export function initializeAbsenceOverrideSection() {
  bindDom();

  ensureAbsenceOverrideBridge();
  updateAbsenceOverrideStatus(getAbsenceOverrideState());
  subscribeAbsenceOverride(updateAbsenceOverrideStatus);
  refreshAbsenceOverrideState().catch((error) => {
    console.error('[Settings] 不在許可状態の取得に失敗:', error);
    setAbsenceOverrideMessage(error?.message || '不在許可の状態を取得できませんでした。', 'error');
  });

  dom.startBtn?.addEventListener('click', () => {
    const reasonValue = (dom.reasonInput?.value || '').trim();
    const minutesValue = Number.parseInt(dom.minutesInput?.value, 10);
    handleAbsenceOverrideStart({ reason: reasonValue, minutes: minutesValue, presetId: null });
  });

  if (dom.presetButtons?.length) {
    dom.presetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const minutes = Number.parseInt(button.dataset.minutes, 10);
        const reason = (button.dataset.reason || '').trim();
        const presetId = button.dataset.presetId || null;

        if (dom.reasonInput) {
          dom.reasonInput.value = reason;
        }
        if (dom.minutesInput && Number.isFinite(minutes)) {
          dom.minutesInput.value = minutes;
        }

        handleAbsenceOverrideStart({ reason, minutes, presetId });
      });
    });
  }

  dom.clearBtn?.addEventListener('click', async () => {
    if (dom.clearBtn.disabled) {
      return;
    }
    setAbsenceOverrideBusy(true);
    setAbsenceOverrideMessage('許可を終了しています…', 'info');
    try {
      const result = await clearAbsenceOverride({ manualEnd: true });
      if (result?.success === false) {
        throw new Error(result.error || '不在許可の終了に失敗しました');
      }
      setAbsenceOverrideMessage('不在許可を終了しました。', 'success');
    } catch (error) {
      console.error('[Settings] 不在許可終了エラー', error);
      setAbsenceOverrideMessage(error.message || '不在許可の終了に失敗しました。', 'error');
    } finally {
      setAbsenceOverrideBusy(false);
    }
  });
}

/**
 * セクション内で参照する DOM 要素をキャッシュする。
 * - NodeList はビヘイビア追加のため配列へ変換する。
 */
function bindDom() {
  dom.statusText = document.getElementById('absenceOverrideStatusText');
  dom.countdownRow = document.getElementById('absenceOverrideCountdownRow');
  dom.countdown = document.getElementById('absenceOverrideCountdown');
  dom.reasonInput = document.getElementById('absenceOverrideReason');
  dom.minutesInput = document.getElementById('absenceOverrideMinutes');
  dom.startBtn = document.getElementById('absenceOverrideStartBtn');
  dom.clearBtn = document.getElementById('absenceOverrideClearBtn');
  dom.message = document.getElementById('absenceOverrideMessage');
  dom.presetButtons = Array.from(document.querySelectorAll('.override-preset'));
  dom.historyList = document.getElementById('absenceOverrideHistoryList');
}

/**
 * 入力もしくはプリセットから不在許可を開始する。
 * - 最低 5 分の制約を守り、API 呼び出しが無効値で失敗しないようにする。
 */
function handleAbsenceOverrideStart({ reason, minutes, presetId }) {
  const trimmedReason = reason && reason.trim() ? reason.trim() : '一時的な不在';
  const durationMinutes = Number.isFinite(minutes) ? minutes : Number.parseInt(dom.minutesInput?.value, 10);

  if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
    setAbsenceOverrideMessage('5分以上の時間を入力してください。', 'error');
    dom.minutesInput?.focus();
    return;
  }

  setAbsenceOverrideBusy(true);
  setAbsenceOverrideMessage('不在許可を開始しています…', 'info');

  let promise;
  try {
    promise = activateAbsenceOverride({
      reason: trimmedReason,
      durationMinutes,
      presetId: presetId || null,
    });
  } catch (error) {
    console.error('[Settings] 不在許可開始エラー', error);
    setAbsenceOverrideMessage(error.message || '不在許可の開始に失敗しました。', 'error');
    setAbsenceOverrideBusy(false);
    return;
  }

  promise
    .then((result) => {
      if (result?.success === false) {
        throw new Error(result.error || '不在許可の開始に失敗しました');
      }
      setAbsenceOverrideMessage('不在許可を開始しました。', 'success');
    })
    .catch((error) => {
      console.error('[Settings] 不在許可開始エラー', error);
      setAbsenceOverrideMessage(error.message || '不在許可の開始に失敗しました。', 'error');
    })
    .finally(() => {
      setAbsenceOverrideBusy(false);
    });
}

/**
 * 不在許可状態を UI に反映し、必要に応じてカウントダウンを開始する。
 * - 既存タイマーは必ず停止し、重複計測を回避する。
 */
function updateAbsenceOverrideStatus(state) {
  const currentState = state || getAbsenceOverrideState();
  stopOverrideCountdown();

  if (!dom.statusText) {
    return;
  }

  if (currentState.active && currentState.current) {
    const current = currentState.current;
    dom.statusText.textContent = `${current.reason || '一時的な不在'} を許可中`;
    dom.clearBtn?.removeAttribute('disabled');

    if (Number.isFinite(current.expiresAt)) {
      if (dom.countdownRow) {
        dom.countdownRow.hidden = false;
      }
      startOverrideCountdown(current.expiresAt);
    } else if (dom.countdownRow) {
      dom.countdownRow.hidden = true;
    }
  } else {
    dom.statusText.textContent = '未許可';
    if (dom.countdownRow) {
      dom.countdownRow.hidden = true;
    }
    dom.clearBtn?.setAttribute('disabled', 'disabled');
  }

  renderAbsenceOverrideHistory(currentState.history);
}

/**
 * 残り時間を 1 秒間隔で更新するカウントダウンを開始する。
 * - expiresAt の非数値は即座に判定して UI を非表示にする。
 */
function startOverrideCountdown(expiresAt) {
  if (!dom.countdown) {
    return;
  }

  const tick = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      dom.countdown.textContent = '0分';
      stopOverrideCountdown();
      return;
    }
    dom.countdown.textContent = formatRemainingDuration(remaining);
  };

  tick();
  overrideCountdownTimer = setInterval(tick, 1000);
}

/**
 * カウントダウンを停止し、タイマー参照を解放する。
 */
function stopOverrideCountdown() {
  if (overrideCountdownTimer) {
    clearInterval(overrideCountdownTimer);
    overrideCountdownTimer = null;
  }
}

/**
 * 不在許可メッセージを更新し、アコーディオンの高さを調整する。
 * - 空文字の場合はクラスを初期状態に戻し、スタイルが残り続けないようにする。
 */
function setAbsenceOverrideMessage(text, type = 'info') {
  if (!dom.message) {
    return;
  }

  dom.message.textContent = text || '';
  dom.message.className = 'help-text';

  if (!text) {
    return;
  }

  dom.message.classList.add(type);
  adjustAccordionHeight(dom.message);
}

/**
 * 開始/終了ボタンの Busy 状態を切り替える。
 * - 操作中の多重クリックを防ぎ、API 呼び出しの整合性を保つ。
 */
function setAbsenceOverrideBusy(isBusy) {
  if (isBusy) {
    dom.startBtn?.setAttribute('disabled', 'disabled');
    dom.clearBtn?.setAttribute('disabled', 'disabled');
  } else {
    dom.startBtn?.removeAttribute('disabled');
    if (getAbsenceOverrideState().active) {
      dom.clearBtn?.removeAttribute('disabled');
    }
  }
}

/**
 * 残り時間を人が読みやすい単位に丸める。
 * - 秒単位の揺らぎを避け、UI の頻繁な再描画を抑える。
 */
function formatRemainingDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'まもなく終了';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}

/**
 * 不在許可履歴を最新 10 件に切り詰め、表示用 HTML を生成する。
 * - escapeHtml で理由文をサニタイズして XSS を防止する。
 */
function renderAbsenceOverrideHistory(history) {
  if (!dom.historyList) {
    return;
  }

  const entries = Array.isArray(history) ? [...history] : [];
  if (entries.length === 0) {
    dom.historyList.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  const latest = entries.slice(-10).reverse();
  dom.historyList.innerHTML = latest
    .map((entry) => {
      const startText = Number.isFinite(entry.startedAt) ? formatTimestamp(entry.startedAt) : '不明な開始';
      const endText = Number.isFinite(entry.endedAt) ? formatTimestamp(entry.endedAt) : '継続中';
      const reason = entry.reason || '一時的な不在';
      const manualLabel = entry.manualEnd === false ? '自動終了' : entry.manualEnd === true ? '手動終了' : '';
      return `
        <li>
          <div class="history-reason">${escapeHtml(reason)}</div>
          <div class="history-period">${startText} → ${endText}${manualLabel ? ` (${manualLabel})` : ''}</div>
        </li>
      `;
    })
    .join('');
}
