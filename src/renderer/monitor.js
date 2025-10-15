/**
 * 監視ダッシュボードのエントリーポイント。
 * - DOM 初期化、設定読み込み、各機能モジュールの起動シーケンスを統括する。
 */
import { initializeMonitorElements, setCanvasContext, getMonitorState, MONITOR_TIMING_CONSTANTS } from './monitor/context.js';
import { initializeSettings, reloadSettings } from './monitor/settings.js';
import { startRenderLoop } from './monitor/render.js';
import { performDetection } from './monitor/detection.js';
import { initializeAbsenceOverrideHandling } from './monitor/override.js';
import { trackActiveWindow, recordActiveWindowSession } from './monitor/active-window.js';
import { addLog } from './monitor/logs.js';

// DOM 要素の登録
initializeMonitorElements({
  videoElement: document.getElementById('videoElement'),
  canvasElement: document.getElementById('canvasElement'),
  logContainer: document.getElementById('logContainer'),
  overrideStatusBadge: document.getElementById('overrideStatusBadge'),
  overrideStatusText: document.getElementById('overrideStatusText'),
});

initializeSettings();
initializeAbsenceOverrideHandling();

document.addEventListener('DOMContentLoaded', () => {
  const { canvasElement } = getMonitorState().elements;
  if (canvasElement) {
    setCanvasContext(canvasElement.getContext('2d'));
  }
});

/**
 * 監視ループを開始する。
 * - 重複起動を避けつつ検知・描画・前面アプリ監視を同時に立ち上げる。
 */
window.startMonitoringProcess = function startMonitoringProcess() {
  const state = getMonitorState();
  if (state.isMonitoring) {
    return;
  }
  state.isMonitoring = true;

  if (!state.detectionInterval) {
    performDetection();
    state.detectionInterval = setInterval(performDetection, MONITOR_TIMING_CONSTANTS.detectionIntervalMs);
  }

  if (!state.activeWindowInterval) {
    state.activeWindowInterval = setInterval(trackActiveWindow, MONITOR_TIMING_CONSTANTS.activeWindowIntervalMs);
  }

  startRenderLoop();
};

/**
 * 設定を最新化するためのエクスポート。
 */
window.reloadMonitorSettings = function reloadMonitorSettings() {
  return reloadSettings();
};

/**
 * app.js から監視状態を参照するための簡易 API。
 */
window.getMonitorState = function exportMonitorState() {
  const state = getMonitorState();
  return {
    isMonitoring: state.isMonitoring,
    mediaStream: state.mediaStream,
  };
};

/**
 * カメラストリームをレンダラ側に保持する。
 */
window.setMediaStream = function setMediaStream(stream) {
  getMonitorState().mediaStream = stream;
};

window.addEventListener('beforeunload', () => {
  recordActiveWindowSession();
});

// app.js からも利用するためグローバル公開
window.addLog = addLog;
