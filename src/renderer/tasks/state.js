/**
 * タスク機能のランタイム状態を集約するストア。
 * - レンダラ間で単一インスタンスとなるようシングルトンとして扱う。
 */
export const taskState = {
  tasks: [],
  tagOptions: [],
  tagFilters: new Set(),
  lastAnnouncedDate: null,
  dragState: null,
  scheduleOptionsCache: [],
  readingSettings: null,
  announcementHandles: { timeoutId: null, intervalId: null },
  taskNotificationInterval: null,
  notifiedTasks: new Set(),
};

/**
 * タスク配列を置き換える。
 * @param {Array} nextTasks 新しいタスク配列
 */
export function setTasks(nextTasks) {
  taskState.tasks = Array.isArray(nextTasks) ? nextTasks : [];
}

/**
 * タグオプションを置き換える。
 * @param {Array} nextTags 新しいタグ配列
 */
export function setTagOptions(nextTags) {
  taskState.tagOptions = Array.isArray(nextTags) ? nextTags : [];
}

/**
 * タグフィルタを追加/削除する。
 * @param {string} tagName タグ名
 * @param {boolean} enabled 有効化フラグ
 */
export function toggleTagFilter(tagName, enabled) {
  if (enabled) {
    taskState.tagFilters.add(tagName);
  } else {
    taskState.tagFilters.delete(tagName);
  }
}

/**
 * タグフィルタをクリアする。
 */
export function clearTagFilters() {
  taskState.tagFilters.clear();
}

/**
 * ドラッグ状態を設定する。
 * @param {object|null} state ドラッグ状態
 */
export function setDragState(state) {
  taskState.dragState = state;
}

/**
 * 読み上げ設定を設定する。
 * @param {object} settings 読み上げ設定
 */
export function setReadingSettings(settings) {
  taskState.readingSettings = settings;
}

/**
 * 最後に読み上げた日付を設定する。
 * @param {string|null} date 日付文字列
 */
export function setLastAnnouncedDate(date) {
  taskState.lastAnnouncedDate = date;
}

