/**
 * スケジュールデータの永続化と正規化を担うドメイン層。
 * - localStorage 同期と IPC 連携を一元管理し、UI 層から直接触らせない。
 */
import { scheduleState, setSchedules } from './state.js';
import {
  normalizeRepeatConfig,
  getTodayISODate,
  buildRepeatAwareStartFallback,
  getNextOccurrenceInfo,
  getOccurrenceKeyFromDate,
} from './utils.js';

/**
 * 他コンポーネントへスケジュール更新を通知する。
 * レンダラ自身が発火した場合は detail.source で識別する。
 */
function notifyScheduleUpdate(reason = 'state-changed', source = 'schedule-renderer') {
  try {
    const detail = { source, reason };
    window.dispatchEvent(new CustomEvent('schedules-updated', { detail }));
    window.dispatchEvent(new CustomEvent('schedule-renderer-updated', { detail }));
  } catch (error) {
    console.warn('[Schedule] スケジュール更新イベント送出に失敗:', error);
  }
}

/**
 * メインプロセスへ最新スケジュールを同期する。
 * エラー時はログのみ出し、UI を止めない。
 */
async function syncSchedulesWithMain() {
  if (!window.electronAPI) {
    return;
  }

  const payload = getSerializableSchedules();
  try {
    if (typeof window.electronAPI.schedulesReplace === 'function') {
      const response = await window.electronAPI.schedulesReplace(payload);
      if (response?.success && Array.isArray(response.items)) {
        const normalized = response.items.map(normalizeScheduleEntry).filter(Boolean);
        setSchedules(normalized);
        notifyScheduleUpdate('synced', 'schedule-model');
        return;
      }
      if (response?.error) {
        throw new Error(response.error);
      }
    }

    if (typeof window.electronAPI.syncSchedules === 'function') {
      await window.electronAPI.syncSchedules(payload);
    }
  } catch (error) {
    console.warn('[Schedule] スケジュール同期に失敗:', error);
  }
}

/**
 * スケジュール配列を永続化し、メインプロセスと他ビューへ同期する。
 */
export function saveSchedules() {
  void syncSchedulesWithMain();
  notifyScheduleUpdate('local-change');
}

/**
 * メインプロセスへ渡せるシリアライズ済みオブジェクトを生成する。
 * @returns {Array<Object>} 互換フォーマットの配列
 */
export function getSerializableSchedules() {
  return scheduleState.schedules.map((schedule) => ({
    id: schedule.id,
    title: schedule.title,
    date: schedule.date,
    time: schedule.time,
    description: schedule.description,
    repeat: schedule.repeat,
    notified: Boolean(schedule.notified),
    preNotified: Boolean(schedule.preNotified),
    startNotified: Boolean(schedule.startNotified),
    ttsMessage: schedule.ttsMessage,
    ttsLeadMessage: schedule.ttsLeadMessage,
    lastOccurrenceKey: schedule.lastOccurrenceKey,
    createdAt: Number.isFinite(schedule.createdAt) ? schedule.createdAt : null,
    updatedAt: Number.isFinite(schedule.updatedAt) ? schedule.updatedAt : null,
  }));
}

/**
 * 任意の入力オブジェクトを内部スキーマへ正規化する。
 * @param {object} entry 生データ
 * @returns {object|null} 正規化結果
 */
export function normalizeScheduleEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const repeat = normalizeRepeatConfig(entry.repeat);
  const now = Date.now();
  const numericId = Number(entry.id);
  const normalizedId = Number.isFinite(numericId) ? numericId : now;
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  const date = typeof entry.date === 'string' && entry.date.trim() ? entry.date.trim() : getTodayISODate();
  const time = typeof entry.time === 'string' && entry.time.trim() ? entry.time.trim() : '00:00';
  const description = typeof entry.description === 'string' ? entry.description : '';
  const createdAtCandidate = Number(entry.createdAt);
  const updatedAtCandidate = Number(entry.updatedAt);

  const normalized = {
    id: normalizedId,
    title,
    date,
    time,
    description,
    notified: entry.notified === true || entry.notified === 1,
    preNotified: entry.preNotified === true || entry.preNotified === 1,
    startNotified: entry.startNotified === true || entry.startNotified === 1,
    ttsMessage: null,
    ttsLeadMessage: null,
    repeat,
    createdAt: Number.isFinite(createdAtCandidate) ? createdAtCandidate : now,
    updatedAt: Number.isFinite(updatedAtCandidate) ? updatedAtCandidate : now,
    lastOccurrenceKey: typeof entry.lastOccurrenceKey === 'string' && entry.lastOccurrenceKey.trim()
      ? entry.lastOccurrenceKey.trim()
      : (repeat ? null : date),
  };

  const existingTtsMessage = typeof entry.ttsMessage === 'string' ? entry.ttsMessage.trim() : '';
  normalized.ttsMessage = existingTtsMessage || buildRepeatAwareStartFallback(normalized);

  const existingLeadMessage = typeof entry.ttsLeadMessage === 'string' ? entry.ttsLeadMessage.trim() : '';
  normalized.ttsLeadMessage = existingLeadMessage || null;

  return normalized;
}

async function fetchSchedulesFromMain() {
  if (!window.electronAPI?.schedulesList) {
    return null;
  }
  try {
    const response = await window.electronAPI.schedulesList();
    if (response?.success && Array.isArray(response.items)) {
      return response.items;
    }
    if (response?.error) {
      console.warn('[Schedule] schedulesList error:', response.error);
    }
  } catch (error) {
    console.warn('[Schedule] schedulesList invocation failed:', error);
  }
  return null;
}

function readLegacySchedules() {
  try {
    const raw = localStorage.getItem('schedules');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[Schedule] legacy schedule load failed:', error);
    return [];
  }
}

async function loadSchedules() {
  const fromMain = await fetchSchedulesFromMain();
  if (Array.isArray(fromMain) && fromMain.length > 0) {
    const normalized = fromMain.map(normalizeScheduleEntry).filter(Boolean);
    setSchedules(normalized);
    ensureRepeatStateInitialization();
    notifyScheduleUpdate('initial-load', 'schedule-model');
    return;
  }

  const legacy = readLegacySchedules();
  const normalized = legacy.map(normalizeScheduleEntry).filter(Boolean);
  setSchedules(normalized);
  ensureRepeatStateInitialization();

  if (normalized.length > 0) {
    await syncSchedulesWithMain();
    try {
      localStorage.removeItem('schedules');
    } catch {
      // noop
    }
  }
  notifyScheduleUpdate('legacy-load', 'schedule-model');
}

/**
 * 起動時にスケジュールを読み込み、必要に応じてメインプロセスへ同期する。
 */
export function initializeSchedules() {
  void loadSchedules();
}

/**
 * weekly 繰り返しの lastOccurrenceKey が初期化されていない場合に補完する。
 */
export function ensureRepeatStateInitialization() {
  const now = new Date();
  let updated = false;

  scheduleState.schedules.forEach((schedule) => {
    if (schedule.repeat && !schedule.lastOccurrenceKey) {
      const occurrence = getNextOccurrenceInfo(schedule, now);
      if (occurrence?.key) {
        schedule.lastOccurrenceKey = occurrence.key;
        updated = true;
      }
    }
  });

  if (updated) {
    saveSchedules();
  }
}

/**
 * 単一スケジュールを追加するヘルパー。
 * @param {object} scheduleInput 追加対象
 */
export function addSchedule(scheduleInput) {
  const schedule = normalizeScheduleEntry(scheduleInput);
  if (!schedule) {
    return;
  }
  scheduleState.schedules.push(schedule);
  ensureRepeatStateInitialization();
  saveSchedules();
}

/**
 * 複数のスケジュールをまとめて追加する。
 * @param {Array<object>} scheduleInputs 追加するスケジュール群
 */
export function bulkAddSchedules(scheduleInputs = []) {
  if (!Array.isArray(scheduleInputs) || scheduleInputs.length === 0) {
    return;
  }

  const baseId = Date.now();
  const additions = scheduleInputs
    .map((input, index) => normalizeScheduleEntry({ id: baseId + index, ...input }))
    .filter(Boolean);

  if (additions.length === 0) {
    return;
  }

  scheduleState.schedules.push(...additions);
  ensureRepeatStateInitialization();
  saveSchedules();
}

/**
 * 既存スケジュールを更新し、通知状態を初期化する。
 * @param {number} id 対象ID
 * @param {object} nextValues 上書きする値
 */
export function updateSchedule(id, nextValues) {
  const index = scheduleState.schedules.findIndex((item) => item.id === id);
  if (index === -1) {
    console.warn('[Schedule] 更新対象のスケジュールが見つかりません:', id);
    return;
  }

  const normalized = normalizeScheduleEntry({
    ...scheduleState.schedules[index],
    ...nextValues,
    id,
    notified: false,
    preNotified: false,
    startNotified: false,
    lastOccurrenceKey: null,
  });

  scheduleState.schedules.splice(index, 1, normalized);
  ensureRepeatStateInitialization();
  saveSchedules();
}

/**
 * 指定IDのスケジュールを削除する。
 * @param {number} id 削除対象
 */
export function deleteScheduleById(id) {
  scheduleState.schedules = scheduleState.schedules.filter((schedule) => schedule.id !== id);
  saveSchedules();
}

/**
 * 指定IDのスケジュールを取得する。
 * @param {number} id 検索対象
 * @returns {object|null} 見つからない場合は null
 */
export function getScheduleById(id) {
  return scheduleState.schedules.find((schedule) => schedule.id === id) || null;
}

/**
 * 現在のスケジュール配列を返す（参照共有に注意）。
 * @returns {Array<object>} スケジュール配列
 */
export function getSchedules() {
  return scheduleState.schedules;
}

/**
 * スケジュールの通知フラグをリセットするヘルパー。
 * @param {object} schedule 対象スケジュール
 */
export function resetNotificationState(schedule) {
  schedule.preNotified = false;
  schedule.startNotified = false;
  schedule.notified = false;
}

/**
 * weekly 繰り返しの lastOccurrenceKey を更新し、通知フラグをリセットする。
 * @param {object} schedule 対象スケジュール
 * @param {string} occurrenceKey 次回発生キー
 * @returns {boolean} 更新が行われたか
 */
export function ensureRepeatOccurrenceState(schedule, occurrenceKey) {
  if (!schedule || !schedule.repeat || !occurrenceKey) {
    return false;
  }

  if (schedule.lastOccurrenceKey !== occurrenceKey) {
    schedule.lastOccurrenceKey = occurrenceKey;
    resetNotificationState(schedule);
    return true;
  }

  return false;
}

/**
 * スケジュールに最新の occurrence キーをセットする。
 * @param {object} schedule 対象スケジュール
 * @param {string} key 最終発生キー
 */
export function updateLastOccurrenceKey(schedule, key) {
  schedule.lastOccurrenceKey = key;
}

/**
 * 通知済みフラグを更新し、事前/開始の状態を整合させる。
 * @param {object} schedule 対象スケジュール
 * @param {{preNotified?:boolean,startNotified?:boolean}} param1 更新するフラグ
 */
export function markScheduleAsNotified(schedule, { preNotified, startNotified }) {
  if (typeof preNotified === 'boolean') {
    schedule.preNotified = preNotified;
  }
  if (typeof startNotified === 'boolean') {
    schedule.startNotified = startNotified;
  }
  schedule.notified = schedule.preNotified || schedule.startNotified;
}

/**
 * 次回発生情報から lastOccurrenceKey を算出して保持する。
 * @param {object} schedule 対象スケジュール
 * @param {{dateTime:Date,key?:string}|null} occurrenceInfo 発生情報
 */
export function setScheduleOccurrenceKey(schedule, occurrenceInfo) {
  if (!occurrenceInfo?.dateTime) {
    return;
  }
  const key = occurrenceInfo.key || getOccurrenceKeyFromDate(occurrenceInfo.dateTime);
  if (key) {
    schedule.lastOccurrenceKey = key;
  }
}
