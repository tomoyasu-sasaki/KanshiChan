/**
 * アプリ全体で共有するウィンドウ構成・タイトル・Chromium フラグ。
 * メインプロセス側での BrowserWindow 構築や Electron CLI フラグ指定に利用。
 */

export const APP_TITLE = '📹 Kanchichan';

// BrowserWindow の基本構成。パス関連は呼び出し側で解決する。
export const MAIN_WINDOW_CONFIG = Object.freeze({
  width: 1200,
  height: 800,
  backgroundThrottling: false,
  contextIsolation: true,
  nodeIntegration: false,
  preloadPathSegments: ['src', 'preload.js'],
  entryHtmlPathSegments: ['src', 'pages', 'index.html'],
  iconRelativePath: 'assets/logo.png'
});

// メインプロセスで無効化する Chromium スイッチ
export const BACKGROUND_BEHAVIOR_DISABLE_FLAGS = Object.freeze([
  'disable-renderer-backgrounding',
  'disable-background-timer-throttling',
  'disable-backgrounding-occluded-windows'
]);
