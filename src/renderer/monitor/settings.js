/**
 * 監視設定の読み込みとリロード機能。
 * - localStorage/DEFAULT_MONITOR_SETTINGS を統合し、モジュール間で共有する。
 */
import { getMonitorState, DEFAULT_MONITOR_SETTINGS } from './context.js';

const STORAGE_KEY = 'monitorSettings';

/**
 * 初期読み込みを行い、コンテキストへ設定値を反映する。
 * - ファイル分割後も既存の開始シーケンス (startMonitoringProcess) が変わらないようにする。
 */
export function initializeSettings() {
  getMonitorState().settings = readSettingsFromStorage();
}

/**
 * 最新設定を取得してコンテキストへ適用する。
 * - renderer/settings.js から呼び出されるリロードと同じ挙動を保つ。
 */
export function reloadSettings() {
  const state = getMonitorState();
  state.settings = readSettingsFromStorage();
  return state.settings;
}

/**
 * 現在の設定オブジェクトを参照する。
 * - 呼び出し側で null チェックを行う前提だが、初期化順序が崩れた場合でも undefined を返さない。
 */
export function getSettings() {
  const state = getMonitorState();
  if (!state.settings) {
    state.settings = readSettingsFromStorage();
  }
  return state.settings;
}

/**
 * localStorage から設定を復元し、欠損値を既定値で補完する。
 */
function readSettingsFromStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return createDefaultSettings();
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      ...createDefaultSettings(),
      ...parsed,
      enabledClasses: Array.isArray(parsed.enabledClasses)
        ? parsed.enabledClasses
        : [...DEFAULT_MONITOR_SETTINGS.enabledClasses],
    };
  } catch (error) {
    console.warn('[Monitor] Failed to parse monitor settings.', error);
    return createDefaultSettings();
  }
}

/**
 * DEFAULT_MONITOR_SETTINGS を浅くコピーし、副作用から保護する。
 */
export function createDefaultSettings() {
  return {
    ...DEFAULT_MONITOR_SETTINGS,
    enabledClasses: [...DEFAULT_MONITOR_SETTINGS.enabledClasses],
  };
}
