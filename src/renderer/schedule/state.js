/**
 * スケジュール機能のランタイム状態を集約するストア。
 * - レンダラ間で単一インスタンスとなるようシングルトンとして扱う。
 */
export const scheduleState = {
  schedules: [],
  editingScheduleId: null,
  notificationCheckInterval: null,
  isTTSPlaying: false,
  voiceDraft: null,
};

/**
 * スケジュール配列を置き換える（normalize 済み想定）。
 * @param {Array} nextSchedules 新しいスケジュール配列
 */
export function setSchedules(nextSchedules) {
  scheduleState.schedules = Array.isArray(nextSchedules) ? nextSchedules : [];
}

/**
 * 現在編集中のスケジュールIDを更新する。
 * @param {number|null} id 編集対象ID
 */
export function setEditingSchedule(id) {
  scheduleState.editingScheduleId = id;
}

/**
 * 通知チェック用のタイマーを登録する。既存タイマーは先に破棄する。
 * @param {number|null} handle setTimeout/setInterval のハンドル
 */
export function setNotificationInterval(handle) {
  clearNotificationInterval();
  scheduleState.notificationCheckInterval = handle;
}

/**
 * 作成済みの通知タイマーをクリアする。
 */
export function clearNotificationInterval() {
  if (scheduleState.notificationCheckInterval) {
    clearTimeout(scheduleState.notificationCheckInterval);
    clearInterval(scheduleState.notificationCheckInterval);
    scheduleState.notificationCheckInterval = null;
  }
}

/**
 * TTS の再生状態を初期化する。
 */
export function resetTtsQueue() {
  scheduleState.isTTSPlaying = false;
}

/**
 * 音声抽出からフォームへ適用したドラフトを保存する。
 * @param {object|null} draft
 */
export function setVoiceDraft(draft) {
  scheduleState.voiceDraft = draft || null;
}

/**
 * 現在保持している音声ドラフトを取得する。
 * @returns {object|null}
 */
export function getVoiceDraft() {
  return scheduleState.voiceDraft || null;
}

/**
 * 音声ドラフトを破棄する。
 */
export function clearVoiceDraft() {
  scheduleState.voiceDraft = null;
}
