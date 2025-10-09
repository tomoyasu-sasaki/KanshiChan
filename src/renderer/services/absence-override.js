/**
 * レンダラ側の不在許可ストア。
 * - メインプロセスから push される状態を受信し、各画面へイベント配信する。
 * - electronAPI が未初期化なケースでも UI が固まらないよう防御的に扱う。
 */
const defaultState = {
  active: false,
  current: null,
  remainingMs: null,
  history: [],
  timestamp: Date.now(),
};

let state = { ...defaultState };
const listeners = new Set();
let initialized = false;

/**
 * 現在の状態を購読者へ通知する（try/catch で UI 側の例外を隔離）。
 */
function notify() {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.error('[AbsenceOverride] listener error', error);
    }
  });
}

/**
 * メインプロセスから受け取った最新状態をマージし、変化があれば配信する。
 * @param {Object} nextState
 */
function applyState(nextState) {
  if (!nextState || typeof nextState !== 'object') {
    return;
  }
  state = {
    ...state,
    ...nextState,
    history: Array.isArray(nextState.history) ? nextState.history : state.history,
  };
  notify();
}

/**
 * 起動時に一度だけ現在状態をポーリングで取得する。
 */
async function fetchInitialState() {
  try {
    const result = await window.electronAPI.absenceOverrideGetState();
    if (result?.success !== false && result?.state) {
      applyState(result.state);
    }
  } catch (error) {
    console.error('[AbsenceOverride] 初期状態取得エラー', error);
  }
}

/**
 * 一度だけ IPC イベント購読をセットアップする。
 */
export function ensureAbsenceOverrideBridge() {
  if (initialized) {
    return;
  }
  initialized = true;
  if (window.electronAPI && typeof window.electronAPI.onAbsenceOverrideStateChanged === 'function') {
    window.electronAPI.onAbsenceOverrideStateChanged((next) => {
      applyState(next);
    });
  } else {
    console.warn('[AbsenceOverride] state changeイベントを購読できませんでした');
  }
  fetchInitialState();
}

/**
 * 状態が変化した際に呼び出されるコールバックを登録する。
 * @param {Function} callback
 * @returns {Function} unsubscribe 関数
 */
export function subscribeAbsenceOverride(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  listeners.add(callback);
  callback(state);
  return () => listeners.delete(callback);
}

/**
 * 現在キャッシュしている状態スナップショットを返す。
 */
export function getAbsenceOverrideState() {
  return state;
}

function ensureApi(methodName) {
  if (!window.electronAPI || typeof window.electronAPI[methodName] !== 'function') {
    throw new Error('不在許可 API に接続できませんでした');
  }
  return window.electronAPI[methodName];
}

/**
 * 不在許可の開始をメインプロセスへ依頼する。
 * @param {Object} payload
 */
export function activateAbsenceOverride(payload) {
  const fn = ensureApi('absenceOverrideActivate');
  return fn(payload);
}

/**
 * 現在の許可の終了時間を更新する。
 * @param {Object} payload
 */
export function extendAbsenceOverride(payload) {
  const fn = ensureApi('absenceOverrideExtend');
  return fn(payload);
}

/**
 * 手動終了をメインプロセスに依頼する。
 * @param {Object} options
 */
export function clearAbsenceOverride(options) {
  const fn = ensureApi('absenceOverrideClear');
  return fn(options);
}

/**
 * 状態を即時に再取得し、キャッシュを更新する。
 * @returns {Promise<Object>}
 */
export function refreshAbsenceOverrideState() {
  try {
    const fn = ensureApi('absenceOverrideGetState');
    return fn().then((result) => {
      if (result?.success !== false && result?.state) {
        applyState(result.state);
      }
      return result;
    });
  } catch (error) {
    return Promise.reject(error);
  }
}
