/**
 * 不在許可 (Override) の監視と UI 連携を担当するモジュール。
 * - メインプロセスとのブリッジ、イベントハンドラ、PASS バッジ更新を包含する。
 */
import {
  ensureAbsenceOverrideBridge,
  subscribeAbsenceOverride,
  getAbsenceOverrideState,
  refreshAbsenceOverrideState,
  activateAbsenceOverride,
  clearAbsenceOverride,
} from '../services/absence-override.js';
import { getMonitorState } from './context.js';
import { addLog, recordDetectionLogEntry } from './logs.js';
import { formatRemainingDuration, updateOverrideBadge } from './render.js';
import { resetAbsenceTracking } from './detection.js';

let refreshTimerId = null;

/**
 * 不在許可状態の購読と初期同期を開始する。
 * - IPC ブロードキャストが欠落した場合でも再取得ループで整合を取る。
 */
export function initializeAbsenceOverrideHandling() {
  ensureAbsenceOverrideBridge();
  const state = getMonitorState();

  state.absenceOverrideState = getAbsenceOverrideState();
  state.previousAbsenceOverrideEntry = state.absenceOverrideState?.current || null;
  updateOverrideBadge(state.absenceOverrideState);

  refreshAbsenceOverrideState().catch((error) => {
    console.error('[Monitor] 不在許可状態の取得に失敗:', error);
  });

  if (!refreshTimerId) {
    refreshTimerId = setInterval(() => {
      refreshAbsenceOverrideState().catch(() => {});
    }, 60 * 1000);
  }

  subscribeAbsenceOverride((nextState) => {
    const previousState = state.absenceOverrideState;
    const previousEntry = state.previousAbsenceOverrideEntry;
    state.absenceOverrideState = nextState;

    if (!previousState?.active && nextState.active) {
      handleOverrideActivated(nextState);
    } else if (previousState?.active && !nextState.active) {
      handleOverrideCleared(previousEntry, nextState);
    } else if (nextState.active) {
      handleOverrideUpdated(previousEntry, nextState);
    }

    state.previousAbsenceOverrideEntry = nextState.current || previousEntry || null;
    updateOverrideBadge(nextState);
  });
}

/**
 * 不在許可が新たに有効化された際の処理。
 * - 既存の離席セッションを抑止ログとして記録し、タイマーをリセットする。
 */
function handleOverrideActivated(nextState) {
  const state = getMonitorState();
  const now = Date.now();
  if (state.absenceDetectionStartTime !== 0) {
    const durationSeconds = Math.max(Math.floor((now - state.absenceDetectionStartTime) / 1000), 0);
    recordDetectionLogEntry({
      type: 'absence_override_suppressed',
      detectedAt: now,
      durationSeconds: durationSeconds || null,
      meta: buildAbsenceOverrideMeta(nextState.current),
    });
  }

  resetAbsenceTracking();

  const reason = nextState.current?.reason || '一時的な不在許可';
  addLog(`✅ 不在検知を一時的にPASS: ${reason}`, 'info');

  recordDetectionLogEntry({
    type: 'absence_override_active',
    detectedAt: now,
    durationSeconds: null,
    meta: buildAbsenceOverrideMeta(nextState.current),
  });
}

/**
 * 不在許可が解除された際の処理。
 * - 直近の履歴をメタ情報に添えてログへ残す。
 */
function handleOverrideCleared(previousEntry, nextState) {
  const now = Date.now();
  resetAbsenceTracking();

  const latestHistory = getLatestHistoryEntry(nextState) || previousEntry;
  addLog('ℹ️ 不在許可が解除されました', 'info');

  recordDetectionLogEntry({
    type: 'absence_override_inactive',
    detectedAt: now,
    durationSeconds: null,
    meta: buildAbsenceOverrideMeta(latestHistory),
  });
}

/**
 * 許可が継続中に延長された場合の処理。
 * - 有効期限が変化した場合だけログと履歴を更新する。
 */
function handleOverrideUpdated(previousEntry, nextState) {
  if (!nextState.active || !nextState.current) {
    return;
  }

  const previous = previousEntry;
  const current = nextState.current;
  if (!previous) {
    getMonitorState().previousAbsenceOverrideEntry = current;
    return;
  }

  const prevExpires = Number.isFinite(previous.expiresAt) ? previous.expiresAt : null;
  const currentExpires = Number.isFinite(current.expiresAt) ? current.expiresAt : null;

  if (prevExpires === currentExpires) {
    return;
  }

  const now = Date.now();
  const remaining = Number.isFinite(nextState.remainingMs)
    ? nextState.remainingMs
    : currentExpires
      ? currentExpires - now
      : null;
  const remainingLabel = remaining != null ? formatRemainingDuration(remaining) : '時間指定なし';
  addLog(`⏱️ 不在許可が延長されました (残り ${remainingLabel})`, 'info');
  recordDetectionLogEntry({
    type: 'absence_override_extended',
    detectedAt: now,
    durationSeconds: null,
    meta: buildAbsenceOverrideMeta(current),
  });
}

/**
 * 不在許可のメタデータをログ用に整形する。
 */
function buildAbsenceOverrideMeta(entry) {
  if (!entry) {
    return { absenceOverride: true };
  }
  return {
    absenceOverride: true,
    reason: entry.reason || null,
    startedAt: entry.startedAt || null,
    endedAt: entry.endedAt || null,
    expiresAt: entry.expiresAt || null,
    manualEnd: entry.manualEnd ?? null,
    presetId: entry.presetId || null,
    note: entry.note || null,
    eventId: entry.eventId || null,
  };
}

/**
 * 最新の不在許可履歴を取得する。
 */
function getLatestHistoryEntry(stateSnapshot) {
  const history = stateSnapshot?.history;
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }
  return history[history.length - 1];
}

/**
 * 不在許可の開始 API をまとめて呼び出したい場合のヘルパー。
 */
export function startAbsenceOverride(params) {
  return activateAbsenceOverride(params);
}

/**
 * 不在許可を手動で終了させるヘルパー。
 */
export function clearAbsenceOverrideManual(options) {
  return clearAbsenceOverride(options);
}
