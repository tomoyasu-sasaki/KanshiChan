/**
 * モニタリング処理全体で共有する状態コンテキスト。
 * - DOM要素や一時的な検知・アラート状態を集約し、各モジュール間で共有する。
 * - 直接代入ではなく本モジュールのセッターを通すことで、初期化順序の不整合を避ける。
 */
import { DEFAULT_MONITOR_SETTINGS, MONITOR_TIMING_CONSTANTS, MONITOR_UI_CONSTANTS } from '../../constants/monitor.js';

const monitorState = {
  elements: {
    videoElement: null,
    canvasElement: null,
    logContainer: null,
    overrideStatusBadge: null,
    overrideStatusText: null,
    cameraContainer: null,
    monitorIndicator: null,
  },
  ctx: null,
  renderHandle: null,
  isMonitoring: false,
  mediaStream: null,
  detectionInterval: null,
  activeWindowInterval: null,
  lastDetections: [],
  lastDetectionTime: 0,
  phoneDetectionTime: 0,
  absenceDetectionTime: 0,
  phoneDetectionStartTime: 0,
  absenceDetectionStartTime: 0,
  phoneAlertTriggered: false,
  absenceAlertTriggered: false,
  phoneClearCandidateSince: 0,
  absenceClearCandidateSince: 0,
  absenceRecoveryDetectedAt: 0,
  lastPhoneAlertAt: 0,
  lastAbsenceAlertAt: 0,
  lastPhoneDetectedTime: 0,
  lastPersonDetectedTime: 0,
  settings: null,
  previewEnabled: true,
  absenceOverrideState: null,
  previousAbsenceOverrideEntry: null,
  lastActiveWindowInfo: null,
  lastActiveWindowStart: 0,
};

/**
 * レンダラの主要要素を登録する。
 * - 事前に取得した DOM を渡し、他モジュールがクエリ不要で利用できるようにする。
 */
export function initializeMonitorElements(elements) {
  monitorState.elements = {
    ...monitorState.elements,
    ...elements,
  };
}

/**
 * Canvas コンテキストをキャッシュする。
 * - 描画ループのたびに getContext を呼ばないようにする。
 */
export function setCanvasContext(ctx) {
  monitorState.ctx = ctx;
}

export function getMonitorState() {
  return monitorState;
}

/**
 * レンダリングハンドルを無効化する（停止処理向けのフック）。
 */
export function resetRenderHandle() {
  monitorState.renderHandle = null;
}

export {
  DEFAULT_MONITOR_SETTINGS,
  MONITOR_TIMING_CONSTANTS,
  MONITOR_UI_CONSTANTS,
};
