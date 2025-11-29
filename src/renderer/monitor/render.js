/**
 * レンダリング関連の制御 (キャンバス描画・PASSバッジ・タイマー同期)。
 * - 描画ループはここで完結させ、検知ロジックとは疎結合に保つ。
 */
import { getMonitorState, MONITOR_TIMING_CONSTANTS, DEFAULT_MONITOR_SETTINGS } from './context.js';

/**
 * カメラ映像を左右反転補正して Canvas に描画する。
 * - 多くの内蔵カメラが鏡像でストリームを返すため、ここで補正して UI と検知の両方を正しい向きに揃える。
 */
export function drawCameraFrame(ctx, videoElement, canvasElement) {
  if (!ctx || !videoElement || !canvasElement) {
    return false;
  }
  const width = canvasElement.width || videoElement.videoWidth;
  const height = canvasElement.height || videoElement.videoHeight;
  if (!width || !height) {
    return false;
  }

  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(videoElement, -width, 0, width, height);
  ctx.restore();
  return true;
}

/**
 * 描画ループを開始する。
 * - 二重で requestAnimationFrame を発火させないようハンドルを保持する。
 */
export function startRenderLoop() {
  const state = getMonitorState();
  if (state.renderHandle) {
    return;
  }

  if (!state.isMonitoring) {
    return;
  }

  if (isPreviewDisabled(state)) {
    stopRenderLoop();
    return;
  }
  state.renderHandle = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  const state = getMonitorState();
  if (isPreviewDisabled(state)) {
    stopRenderLoop();
    return;
  }

  const { videoElement, canvasElement } = state.elements;
  const { ctx, isMonitoring } = state;

  if (!isMonitoring) {
    stopRenderLoop();
    return;
  }
  if (!ctx || !videoElement || !canvasElement) {
    state.renderHandle = requestAnimationFrame(renderLoop);
    return;
  }

  const frameDrawn = drawCameraFrame(ctx, videoElement, canvasElement);
  if (!frameDrawn) {
    state.renderHandle = requestAnimationFrame(renderLoop);
    return;
  }

  const now = Date.now();
  if (
    state.lastDetectionTime &&
    now - state.lastDetectionTime < MONITOR_TIMING_CONSTANTS.detectionResultStaleMs &&
    state.settings?.showDetections !== false
  ) {
    drawDetections(state.lastDetections);
  }

  state.renderHandle = requestAnimationFrame(renderLoop);
}

function stopRenderLoop() {
  const state = getMonitorState();
  if (state.renderHandle) {
    cancelAnimationFrame(state.renderHandle);
    state.renderHandle = null;
  }
}

function isPreviewDisabled(state) {
  const settings = state.settings || DEFAULT_MONITOR_SETTINGS;
  return settings.previewEnabled === false;
}

/**
 * YOLO の検知結果を Canvas 上に描画する。
 * - クラス別に色分けし、ラベルと信頼度を併記する。
 */
export function drawDetections(detections) {
  const state = getMonitorState();
  const { ctx } = state;
  if (!ctx) {
    return;
  }

  detections.forEach((detection) => {
    const [x, y, w, h] = detection.bbox;
    const isPhone = detection.class === 'cell phone';

    ctx.strokeStyle = isPhone ? '#ff6b6b' : '#51cf66';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = isPhone ? '#ff6b6b' : '#51cf66';
    ctx.fillRect(x, Math.max(y - 25, 0), w, 25);
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(
      `${detection.class} ${(detection.confidence * 100).toFixed(0)}%`,
      x + 5,
      Math.max(y - 7, 12),
    );
  });
}

/**
 * 不在許可バッジを最新状態に更新する。
 * - 残り時間が判明している場合はラベルに反映する。
 */
export function updateOverrideBadge(stateSnapshot) {
  const { overrideStatusBadge, overrideStatusText } = getMonitorState().elements;
  if (!overrideStatusBadge || !overrideStatusText) {
    return;
  }

  if (stateSnapshot?.active && stateSnapshot.current) {
    const label = stateSnapshot.current.reason || '一時的な不在';
    let suffix = '';
    const remainingMs = Number.isFinite(stateSnapshot.remainingMs)
      ? stateSnapshot.remainingMs
      : Number.isFinite(stateSnapshot.current.expiresAt)
        ? stateSnapshot.current.expiresAt - Date.now()
        : null;
    if (Number.isFinite(remainingMs) && remainingMs > 0) {
      suffix = ` (${formatRemainingDuration(remainingMs)})`;
    }
    overrideStatusText.textContent = `${label}${suffix}`;
    overrideStatusBadge.hidden = false;
    overrideStatusBadge.style.display = 'flex';
  } else {
    overrideStatusBadge.hidden = true;
    overrideStatusBadge.style.display = 'none';
    overrideStatusText.textContent = 'PASS';
  }
}

/**
 * タイマー表示を最新値へ同期する。
 * - renderer/settings.js 側が提供する UI 更新関数を再利用する。
 */
export function updateTimers() {
  const state = getMonitorState();
  if (typeof window.updateTimerDisplay === 'function') {
    window.updateTimerDisplay(state.phoneDetectionTime, state.absenceDetectionTime);
  }
}

/**
 * 残り時間を人が読みやすい形式へ変換する。
 */
export function formatRemainingDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'まもなく終了';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}

/**
 * UI 上のプレビュー可視状態を最新化する。
 */
export function syncPreviewVisibility(settings = null) {
  const state = getMonitorState();
  const effectiveSettings = settings || state.settings || DEFAULT_MONITOR_SETTINGS;
  const previewEnabled = effectiveSettings.previewEnabled !== false;
  state.previewEnabled = previewEnabled;

  const { cameraContainer, monitorIndicator } = state.elements;
  if (cameraContainer) {
    cameraContainer.classList.toggle('preview-hidden', !previewEnabled);
  }
  if (monitorIndicator) {
    monitorIndicator.classList.toggle('preview-off', !previewEnabled);
    const label = monitorIndicator.querySelector('span');
    if (label) {
      label.textContent = previewEnabled ? '監視中' : '監視中 (プレビューOFF)';
    }
  }
}

/**
 * 現在の設定に基づいて描画ループの開始/停止を調整する。
 */
export function ensureRenderLoopState() {
  const state = getMonitorState();
  if (isPreviewDisabled(state) || !state.isMonitoring) {
    stopRenderLoop();
    return;
  }
  startRenderLoop();
}
