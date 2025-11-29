/**
 * YOLO 推論および検知状態の更新を担当するモジュール。
 * - Canvas エンコード、electronAPI 呼び出し、各種タイマー更新をここに集約する。
 */
import { getMonitorState, MONITOR_TIMING_CONSTANTS, DEFAULT_MONITOR_SETTINGS } from './context.js';
import { recordDetectionLogEntry } from './logs.js';
import { triggerPhoneAlert, triggerAbsenceAlert } from './alerts.js';
import { updateTimers, drawCameraFrame } from './render.js';

const PHONE_INTERPOLATION_WINDOW = MONITOR_TIMING_CONSTANTS.phoneInterpolationWindowMs;
const PERSON_INTERPOLATION_WINDOW = MONITOR_TIMING_CONSTANTS.personInterpolationWindowMs;
const PHONE_CLEAR_STABLE_MS = MONITOR_TIMING_CONSTANTS.phoneClearStableMs;
const ABSENCE_CLEAR_STABLE_MS = MONITOR_TIMING_CONSTANTS.absenceClearStableMs;
const PHONE_ALERT_COOLDOWN_MS = MONITOR_TIMING_CONSTANTS.phoneAlertCooldownMs;
const ABSENCE_ALERT_COOLDOWN_MS = MONITOR_TIMING_CONSTANTS.absenceAlertCooldownMs;

/**
 * YOLOv11 を用いた検知処理を実行する。
 * - Canvas を JPEG 化し、メインプロセスで推論した結果を受け取る。
 */
export async function performDetection() {
  const state = getMonitorState();
  if (!state.isMonitoring) {
    return;
  }

  const { ctx } = state;
  const { videoElement, canvasElement } = state.elements;
  if (!ctx || !videoElement || !canvasElement) {
    return;
  }

  try {
    const frameDrawn = drawCameraFrame(ctx, videoElement, canvasElement);
    if (!frameDrawn) {
      return;
    }
    const imageDataUrl = canvasElement.toDataURL('image/jpeg', 0.8);
    const result = await window.electronAPI.detectObjects(imageDataUrl);

    if (!result?.success) {
      console.error('検知失敗:', result?.error);
      return;
    }

    const enabledClasses = state.settings?.enabledClasses || DEFAULT_MONITOR_SETTINGS.enabledClasses;
    const filtered = result.detections.filter((detection) => enabledClasses.includes(detection.class));

    state.lastDetections = filtered;
    state.lastDetectionTime = Date.now();

    processDetections(filtered);
  } catch (error) {
    console.error('検知エラー:', error);
  }
}

/**
 * 検知結果をもとに補間付きの状態判定を行う。
 * - スマホ/人物それぞれの時系列判定を更新する。
 */
function processDetections(detections) {
  const state = getMonitorState();
  const settings = state.settings || DEFAULT_MONITOR_SETTINGS;

  const phoneDetectedRaw = detections.some(
    (detection) => detection.class === 'cell phone' && detection.confidence >= settings.phoneConfidence,
  );
  const personDetectedRaw = detections.some(
    (detection) => detection.class === 'person' && detection.confidence >= settings.absenceConfidence,
  );

  const now = Date.now();
  if (phoneDetectedRaw) {
    state.lastPhoneDetectedTime = now;
  }
  if (personDetectedRaw) {
    state.lastPersonDetectedTime = now;
  }

  const phoneDetected = now - state.lastPhoneDetectedTime < PHONE_INTERPOLATION_WINDOW;
  const personDetected = now - state.lastPersonDetectedTime < PERSON_INTERPOLATION_WINDOW;

  handlePhoneDetection(phoneDetected);
  handleAbsenceDetection(personDetected);
}

function handlePhoneDetection(detected) {
  const state = getMonitorState();
  const settings = state.settings || DEFAULT_MONITOR_SETTINGS;

  if (detected) {
    if (state.phoneDetectionStartTime === 0) {
      state.phoneDetectionStartTime = Date.now();
      recordDetectionLogEntry({
        type: 'phone_detection_start',
        detectedAt: state.phoneDetectionStartTime,
      });
    }

    state.phoneDetectionTime = Math.floor((Date.now() - state.phoneDetectionStartTime) / 1000);
    updateTimers();

    if (
      settings.phoneAlertEnabled &&
      !state.phoneAlertTriggered &&
      state.phoneDetectionTime >= settings.phoneThreshold
    ) {
      const nowTs = Date.now();
      if (nowTs - state.lastPhoneAlertAt >= PHONE_ALERT_COOLDOWN_MS) {
        state.lastPhoneAlertAt = nowTs;
        triggerPhoneAlert();
      }
    }

    state.phoneClearCandidateSince = 0;
    return;
  }

  if (state.phoneDetectionTime <= 0) {
    state.phoneClearCandidateSince = 0;
    return;
  }

  const nowTs = Date.now();
  if (state.phoneClearCandidateSince === 0) {
    state.phoneClearCandidateSince = nowTs;
    return;
  }

  if (nowTs - state.phoneClearCandidateSince < PHONE_CLEAR_STABLE_MS) {
    return;
  }

  const durationSeconds = Math.floor((nowTs - state.phoneDetectionStartTime) / 1000);
  recordDetectionLogEntry({
    type: 'phone_detection_end',
    detectedAt: nowTs,
    durationSeconds: durationSeconds > 0 ? durationSeconds : null,
  });

  state.phoneDetectionTime = 0;
  state.phoneDetectionStartTime = 0;
  state.phoneAlertTriggered = false;
  state.phoneClearCandidateSince = 0;
  updateTimers();
}

function handleAbsenceDetection(personDetected) {
  const state = getMonitorState();
  const settings = state.settings || DEFAULT_MONITOR_SETTINGS;
  const nowTs = Date.now();

  if (state.absenceOverrideState?.active) {
    resetAbsenceTracking();
    return;
  }

  if (!personDetected) {
    state.absenceClearCandidateSince = 0;
    state.absenceRecoveryDetectedAt = 0;

    if (state.absenceDetectionStartTime === 0) {
      state.absenceDetectionStartTime = nowTs;
      recordDetectionLogEntry({
        type: 'absence_detection_start',
        detectedAt: state.absenceDetectionStartTime,
      });
    }

    state.absenceDetectionTime = Math.floor((nowTs - state.absenceDetectionStartTime) / 1000);
    updateTimers();

    if (
      settings.absenceAlertEnabled &&
      !state.absenceAlertTriggered &&
      state.absenceDetectionTime >= settings.absenceThreshold
    ) {
      if (nowTs - state.lastAbsenceAlertAt >= ABSENCE_ALERT_COOLDOWN_MS) {
        state.lastAbsenceAlertAt = nowTs;
        triggerAbsenceAlert();
      }
    }

    return;
  }

  if (state.absenceDetectionStartTime === 0) {
    state.absenceDetectionTime = 0;
    state.absenceClearCandidateSince = 0;
    state.absenceRecoveryDetectedAt = 0;
    return;
  }

  if (state.absenceClearCandidateSince === 0) {
    state.absenceClearCandidateSince = nowTs;
    state.absenceRecoveryDetectedAt = nowTs;
  } else if (!state.absenceRecoveryDetectedAt || nowTs < state.absenceRecoveryDetectedAt) {
    state.absenceRecoveryDetectedAt = nowTs;
  }

  if (nowTs - state.absenceClearCandidateSince < ABSENCE_CLEAR_STABLE_MS) {
    return;
  }

  const resolvedAt = state.absenceRecoveryDetectedAt || nowTs;
  const durationSecondsRaw = Math.floor((resolvedAt - state.absenceDetectionStartTime) / 1000);
  const durationSeconds = durationSecondsRaw > 0 ? durationSecondsRaw : null;

  recordDetectionLogEntry({
    type: 'absence_detection_end',
    detectedAt: resolvedAt,
    durationSeconds,
  });

  state.absenceDetectionTime = 0;
  state.absenceDetectionStartTime = 0;
  state.absenceAlertTriggered = false;
  state.absenceClearCandidateSince = 0;
  state.absenceRecoveryDetectedAt = 0;
  state.lastAbsenceAlertAt = 0;
  updateTimers();
}

/**
 * 不在検知カウンタを初期化する。
 * - 不在許可や別イベントで明示的にリセットしたい場合に使用する。
 */
export function resetAbsenceTracking() {
  const state = getMonitorState();
  state.absenceDetectionTime = 0;
  state.absenceDetectionStartTime = 0;
  state.absenceAlertTriggered = false;
  state.absenceClearCandidateSince = 0;
  state.absenceRecoveryDetectedAt = 0;
  state.lastAbsenceAlertAt = 0;
  updateTimers();
}
