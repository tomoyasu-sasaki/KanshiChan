/**
 * レンダリング関連の制御 (キャンバス描画・PASSバッジ・タイマー同期)。
 * - 描画ループはここで完結させ、検知ロジックとは疎結合に保つ。
 */
import { getMonitorState, MONITOR_TIMING_CONSTANTS } from './context.js';

/**
 * 描画ループを開始する。
 * - 二重で requestAnimationFrame を発火させないようハンドルを保持する。
 */
export function startRenderLoop() {
  const state = getMonitorState();
  if (state.renderHandle) {
    return;
  }
  state.renderHandle = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  const state = getMonitorState();
  const { videoElement, canvasElement } = state.elements;
  const { ctx, isMonitoring } = state;

  if (!isMonitoring) {
    state.renderHandle = null;
    return;
  }
  if (!ctx || !videoElement || !canvasElement) {
    state.renderHandle = requestAnimationFrame(renderLoop);
    return;
  }

  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

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
