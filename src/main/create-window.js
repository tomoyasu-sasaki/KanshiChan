/**
 * BrowserWindow 構築ユーティリティ。
 * - レンダラ側で nodeIntegration を無効化し、preload スクリプト経由の API 公開に限定。
 * - path.join の組み立てだけを担当し、DOM ロードやイベントリスナーは呼び出し元で処理する。
 */
const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * メインウィンドウを生成する。
 * @param {Object} params 呼び出しパラメータ集合
 * @param {string} params.baseDir Electron アプリのルートディレクトリ
 * @param {Object} params.windowConfig ウィンドウ構成定数
 * @param {string} params.appTitle ウィンドウタイトル
 * @returns {BrowserWindow} 生成された BrowserWindow インスタンス
 */
function createMainWindow({ baseDir, windowConfig, appTitle }) {
  const {
    width,
    height,
    backgroundThrottling,
    contextIsolation,
    nodeIntegration,
    preloadPathSegments,
    entryHtmlPathSegments,
    iconRelativePath
  } = windowConfig;

  const mainWindow = new BrowserWindow({
    width,
    height,
    webPreferences: {
      nodeIntegration,
      contextIsolation,
      preload: path.join(baseDir, ...preloadPathSegments),
      backgroundThrottling
    },
    title: appTitle,
    icon: path.join(baseDir, iconRelativePath)
  });
  // mainWindow.webContents.openDevTools()

  mainWindow.loadFile(path.join(baseDir, ...entryHtmlPathSegments));
  return mainWindow;
}



module.exports = {
  createMainWindow
};
