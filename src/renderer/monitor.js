/**
 * 監視ロジックのメイン実装。
 * - カメラストリーム処理、YOLO 結果のフィルタリング、通知発火までを担当する。
 * - 設定は constants/monitor から取り込み、monitor.js 内でのみ状態を保持する。
 */
import { DEFAULT_MONITOR_SETTINGS, MONITOR_TIMING_CONSTANTS, MONITOR_UI_CONSTANTS } from '../constants/monitor.js';
import {
  ensureAbsenceOverrideBridge,
  subscribeAbsenceOverride,
  getAbsenceOverrideState,
  refreshAbsenceOverrideState,
} from './services/absence-override.js';

/**
 * 監視システム - 物体検知と状態管理
 * 
 * 責務:
 * - カメラ映像の描画ループ（60FPS）
 * - YOLOv11による物体検知ループ（設定値に基づく間隔）
 * - 検知結果の処理（スマホ・人物の検知判定、フレーム補完）
 * - タイマー計算（スマホ検知時間・不在時間）
 * - アラート発火（閾値超過時の通知・音）
 * 
 * 設計判断:
 * - ローカル変数で状態管理: ページ遷移がなくなったためグローバル汚染を回避
 * - フレーム補完: 検知のちらつき防止（スマホ1秒・人物0.5秒の時間窓）
 * - 検知頻度: 0.1秒間隔で高頻度実行し、不在検知の反応速度を向上
 * - 描画とは独立: 検知ループ（低頻度）と描画ループ（高頻度）を分離
 */

// UI要素
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const logContainer = document.getElementById('logContainer');
const overrideStatusBadge = document.getElementById('overrideStatusBadge');
const overrideStatusText = document.getElementById('overrideStatusText');

// Canvas描画コンテキスト
let ctx = null;

// 監視状態
let isMonitoring = false;
let mediaStream = null;
let detectionInterval = null;
let activeWindowInterval = null;

// 検知結果
let lastDetections = [];
let lastDetectionTime = 0;

// タイマー状態
let phoneDetectionTime = 0;
let absenceDetectionTime = 0;
let phoneDetectionStartTime = 0;
let absenceDetectionStartTime = 0;
let phoneAlertTriggered = false;
let absenceAlertTriggered = false;

/**
 * 不在許可の状態を監視するためのブリッジを初期化する。
 * - 起動直後はメインプロセスのステートと同期が取れていないため、明示的に再取得を行う。
 */
ensureAbsenceOverrideBridge();
let absenceOverrideState = getAbsenceOverrideState();
let previousAbsenceOverrideEntry = absenceOverrideState.current;
updateOverrideBadge(absenceOverrideState);
refreshAbsenceOverrideState().catch((error) => {
  console.error('[Monitor] 不在許可状態の取得に失敗:', error);
});

setInterval(() => {
  refreshAbsenceOverrideState().catch(() => {});
  // IPC ブロードキャストが途中で欠落した場合でも 1 分以内に整合を回復させる。
}, 60 * 1000);

subscribeAbsenceOverride((nextState) => {
  const wasActive = Boolean(absenceOverrideState?.active);
  const wasEntry = absenceOverrideState?.current;
  absenceOverrideState = nextState;

  if (!wasActive && nextState.active) {
    onAbsenceOverrideActivated(nextState);
  } else if (wasActive && !nextState.active) {
    onAbsenceOverrideCleared(wasEntry, nextState);
  } else if (nextState.active) {
    onAbsenceOverrideUpdated(nextState);
  }

  previousAbsenceOverrideEntry = nextState.current || wasEntry || previousAbsenceOverrideEntry;
  updateOverrideBadge(nextState);
});

// クリア判定と再通知クールダウン
let phoneClearCandidateSince = 0;       // スマホ未検知が続いてからの経過測定
let absenceClearCandidateSince = 0;     // 人物検知（復帰）が続いてからの経過測定
let absenceRecoveryDetectedAt = 0;      // 復帰を初めて検知したタイムスタンプ
let lastPhoneAlertAt = 0;               // 直近のスマホアラート時刻
let lastAbsenceAlertAt = 0;             // 直近の不在アラート時刻

/**
 * フレーム補完の時間窓
 * 
 * 背景: YOLOv11は検知のちらつきがあり、一瞬だけ検知漏れすることがある
 * 対策: 最後に検知された時刻から一定時間は「検知中」とみなす
 * 
 * パラメータ調整:
 * - スマホ: 2秒（誤検知防止を重視）
 * - 人物: 0.5秒（不在検知の反応速度を重視）
 */
let lastPhoneDetectedTime = 0;
let lastPersonDetectedTime = 0;
const PHONE_INTERPOLATION_WINDOW = MONITOR_TIMING_CONSTANTS.phoneInterpolationWindowMs;
const PERSON_INTERPOLATION_WINDOW = MONITOR_TIMING_CONSTANTS.personInterpolationWindowMs;

// クリア安定化ウィンドウ（この時間連続で反対状態が続いたらリセット）
const PHONE_CLEAR_STABLE_MS = MONITOR_TIMING_CONSTANTS.phoneClearStableMs;
const ABSENCE_CLEAR_STABLE_MS = MONITOR_TIMING_CONSTANTS.absenceClearStableMs;

// 連続通知を抑止するクールダウン
const PHONE_ALERT_COOLDOWN_MS = MONITOR_TIMING_CONSTANTS.phoneAlertCooldownMs;
const ABSENCE_ALERT_COOLDOWN_MS = MONITOR_TIMING_CONSTANTS.absenceAlertCooldownMs;

// 設定
let settings = loadSettings();

// 設定の読み込み
/**
 * localStorage から最新設定を取り出し、欠落フィールドを既定値で補完する。
 */
function loadSettings() {
  const saved = localStorage.getItem('monitorSettings');
  if (!saved) {
    return createDefaultSettings();
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      ...createDefaultSettings(),
      ...parsed,
      enabledClasses: Array.isArray(parsed.enabledClasses) ? parsed.enabledClasses : [...DEFAULT_MONITOR_SETTINGS.enabledClasses]
    };
  } catch {
    return createDefaultSettings();
  }
}

/**
 * DEFAULT_MONITOR_SETTINGS を浅いコピーに変換し、副作用から保護する。
 */
function createDefaultSettings() {
  return {
    ...DEFAULT_MONITOR_SETTINGS,
    enabledClasses: [...DEFAULT_MONITOR_SETTINGS.enabledClasses]
  };
}

// 設定の再読み込み（設定変更時に呼ばれる）
window.reloadMonitorSettings = function() {
  settings = loadSettings();
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  ctx = canvasElement.getContext('2d');
});

// 監視プロセス開始（app.jsから呼ばれる）
window.startMonitoringProcess = function() {
  isMonitoring = true;
  
  // 検知ループ開始（設定値に基づき実行）
  if (!detectionInterval) {
    detectionInterval = setInterval(performDetection, MONITOR_TIMING_CONSTANTS.detectionIntervalMs);
  }

  // 最前面アプリ監視（1秒ごと）
  if (!activeWindowInterval) {
    activeWindowInterval = setInterval(trackActiveWindow, MONITOR_TIMING_CONSTANTS.activeWindowIntervalMs);
  }

  // 描画ループは別で高頻度実行
  requestAnimationFrame(renderLoop);
};

// 描画ループ（滑らかなビデオ表示用）
function renderLoop() {
  if (!isMonitoring) return;

  // ビデオフレームを描画
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  // 最新の検知結果を描画（1秒以内の結果のみ表示）
  const now = Date.now();
  if (lastDetectionTime && (now - lastDetectionTime) < MONITOR_TIMING_CONSTANTS.detectionResultStaleMs) {
    // 設定で描画が有効な場合のみ描画
    if (settings.showDetections !== false) {
      drawDetections(lastDetections);
    }
  }

  requestAnimationFrame(renderLoop);
}

/**
 * 検知実行（YOLOv11を使用した物体検知）
 * 
 * 処理フロー:
 * 1. Canvas から JPEG 画像を Base64 エンコード（品質0.8で軽量化）
 * 2. IPC経由でメインプロセスに送信
 * 3. YOLOv11で検知実行（ONNX Runtime）
 * 4. 検知結果をフィルタリング（有効クラスのみ）
 * 5. フレーム補完を適用して検知判定
 * 6. タイマー更新とアラート判定
 * 
 * パフォーマンス:
 * - 設定値（既定 0.5秒）間隔で実行
 * - JPEG品質0.8: 検知精度とデータサイズのバランス
 */
async function performDetection() {
  if (!isMonitoring) return;

  try {
    // 非最前面・バックグラウンドでも最新フレームで検知するため、
    // 検知ループ側でも直前フレームをCanvasへ描画してからエンコードする
    if (ctx && videoElement && canvasElement) {
      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    }

    // Canvas上の画像をBase64に変換
    const imageDataUrl = canvasElement.toDataURL('image/jpeg', 0.8);

    // YOLOv11で検知（メインプロセスで実行）
    const result = await window.electronAPI.detectObjects(imageDataUrl);

    if (result.success) {
      // 有効なクラスのみフィルタリング
      const enabledClasses = settings.enabledClasses || DEFAULT_MONITOR_SETTINGS.enabledClasses;
      const filteredDetections = result.detections.filter(d =>
        enabledClasses.includes(d.class)
      );

      // 検出結果を保持（滑らかな表示のため）
      lastDetections = filteredDetections;
      lastDetectionTime = Date.now();
      
      processDetections(filteredDetections);
    } else {
      console.error('検知失敗:', result.error);
    }
  } catch (error) {
    console.error('検知エラー:', error);
  }
}

/**
 * 検知結果処理
 * 
 * フレーム補完アルゴリズム:
 * 1. 生の検知結果で信頼度閾値チェック
 * 2. 検知された場合、最終検知時刻を更新
 * 3. 最終検知時刻から時間窓内なら「検知中」とみなす
 * 4. 時間窓を超えたら「未検知」に遷移
 * 
 * 効果: 一瞬の検知漏れによるタイマーリセットを防ぐ
 */
function processDetections(detections) {
  // スマホ検知（生の検知結果）
  const phoneDetectedRaw = detections.some(d =>
    d.class === 'cell phone' && d.confidence >= settings.phoneConfidence
  );

  // 人検知（生の検知結果）
  const personDetectedRaw = detections.some(d =>
    d.class === 'person' && d.confidence >= settings.absenceConfidence
  );

  // 検知された場合は時刻を更新
  if (phoneDetectedRaw) {
    lastPhoneDetectedTime = Date.now();
  }
  if (personDetectedRaw) {
    lastPersonDetectedTime = Date.now();
  }

  // フレーム補完を適用した検知判定
  const now = Date.now();
  const phoneDetected = (now - lastPhoneDetectedTime) < PHONE_INTERPOLATION_WINDOW;
  const personDetected = (now - lastPersonDetectedTime) < PERSON_INTERPOLATION_WINDOW;

  // スマホ検知処理
  handlePhoneDetection(phoneDetected);

  // 不在検知処理
  handleAbsenceDetection(personDetected);
}

// スマホ検知処理
function handlePhoneDetection(detected) {
  if (detected) {
    // 初回検知時は開始時刻を記録
    if (phoneDetectionStartTime === 0) {
      phoneDetectionStartTime = Date.now();
      recordDetectionLogEntry({
        type: 'phone_detection_start',
        detectedAt: phoneDetectionStartTime,
      });
    }

    // 経過時間を計算（秒）
    const elapsedMs = Date.now() - phoneDetectionStartTime;
    phoneDetectionTime = Math.floor(elapsedMs / 1000);

    updateTimers();

    // アラート閾値チェック
    if (
      settings.phoneAlertEnabled &&
      !phoneAlertTriggered &&
      phoneDetectionTime >= settings.phoneThreshold
    ) {
      const nowTs = Date.now();
      if (nowTs - lastPhoneAlertAt >= PHONE_ALERT_COOLDOWN_MS) {
        lastPhoneAlertAt = nowTs;
        triggerPhoneAlert();
      }
    }

    // クリア判定候補は破棄（検知継続中）
    phoneClearCandidateSince = 0;
  } else {
    // 未検知が安定して一定時間続いたら完全リセット
    const nowTs = Date.now();
    if (phoneDetectionTime > 0) {
      if (phoneClearCandidateSince === 0) phoneClearCandidateSince = nowTs;
      if (nowTs - phoneClearCandidateSince >= PHONE_CLEAR_STABLE_MS) {
        phoneDetectionTime = 0;
        if (phoneDetectionStartTime !== 0) {
          const durationSeconds = Math.floor((nowTs - phoneDetectionStartTime) / 1000);
          recordDetectionLogEntry({
            type: 'phone_detection_end',
            detectedAt: nowTs,
            durationSeconds: durationSeconds > 0 ? durationSeconds : null,
          });
        }
        phoneDetectionStartTime = 0;
        phoneAlertTriggered = false;
        phoneClearCandidateSince = 0;
        updateTimers();
      }
    } else {
      // 既に0の場合は候補だけクリア
      phoneClearCandidateSince = 0;
    }
  }
}

// 不在検知処理
function handleAbsenceDetection(personDetected) {
  if (absenceOverrideState?.active) {
    resetAbsenceTracking();
    return;
  }

  const nowTs = Date.now();

  if (!personDetected) {
    // 復帰監視用の状態は破棄（離席継続中）
    absenceClearCandidateSince = 0;
    absenceRecoveryDetectedAt = 0;

    // 初回検知時は開始時刻を記録
    if (absenceDetectionStartTime === 0) {
      absenceDetectionStartTime = nowTs;
      recordDetectionLogEntry({
        type: 'absence_detection_start',
        detectedAt: absenceDetectionStartTime,
      });
    }

    // 経過時間を計算（秒）
    const elapsedMs = nowTs - absenceDetectionStartTime;
    absenceDetectionTime = Math.floor(elapsedMs / 1000);

    updateTimers();

    // アラート閾値チェック
    if (
      settings.absenceAlertEnabled &&
      !absenceAlertTriggered &&
      absenceDetectionTime >= settings.absenceThreshold
    ) {
      if (nowTs - lastAbsenceAlertAt >= ABSENCE_ALERT_COOLDOWN_MS) {
        lastAbsenceAlertAt = nowTs;
        triggerAbsenceAlert();
      }
    }

    return;
  }

  // 人物検知（復帰）
  if (absenceDetectionStartTime === 0) {
    // 離席セッションが存在しない場合は状態だけ整理
    absenceDetectionTime = 0;
    absenceClearCandidateSince = 0;
    absenceRecoveryDetectedAt = 0;
    return;
  }

  if (absenceClearCandidateSince === 0) {
    absenceClearCandidateSince = nowTs;
    absenceRecoveryDetectedAt = nowTs;
  } else if (absenceRecoveryDetectedAt === 0 || nowTs < absenceRecoveryDetectedAt) {
    // 最初に復帰を検知したタイムスタンプを維持
    absenceRecoveryDetectedAt = nowTs;
  }

  if (nowTs - absenceClearCandidateSince >= ABSENCE_CLEAR_STABLE_MS) {
    const resolvedAt = absenceRecoveryDetectedAt || nowTs;
    const durationSecondsRaw = Math.floor((resolvedAt - absenceDetectionStartTime) / 1000);
    const durationSeconds = durationSecondsRaw > 0 ? durationSecondsRaw : null;

    recordDetectionLogEntry({
      type: 'absence_detection_end',
      detectedAt: resolvedAt,
      durationSeconds,
    });

    // セッションリセット
    absenceDetectionTime = 0;
    absenceDetectionStartTime = 0;
    absenceAlertTriggered = false;
    absenceClearCandidateSince = 0;
    absenceRecoveryDetectedAt = 0;
    lastAbsenceAlertAt = 0; // 新しい離席を即時に評価できるようクールダウンを初期化

    updateTimers();
  }
}

/**
 * 不在検知用の内部タイマーをリセットする。
 */
function resetAbsenceTracking() {
  absenceDetectionTime = 0;
  absenceDetectionStartTime = 0;
  absenceAlertTriggered = false;
  absenceClearCandidateSince = 0;
  absenceRecoveryDetectedAt = 0;
  lastAbsenceAlertAt = 0;
  updateTimers();
}

/**
 * 監視画面の PASS バッジ表示を現在の許可状態に合わせて更新する。
 * @param {Object} state
 */
function updateOverrideBadge(state) {
  if (!overrideStatusBadge || !overrideStatusText) {
    return;
  }

  if (state?.active && state.current) {
    const label = state.current.reason || '一時的な不在';
    let suffix = '';
    const remainingMs = Number.isFinite(state.remainingMs)
      ? state.remainingMs
      : Number.isFinite(state.current.expiresAt)
        ? state.current.expiresAt - Date.now()
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

function buildAbsenceOverrideMeta(entry) {
  if (!entry) {
    return { absenceOverride: true };
  }
  return {
    absenceOverride: true,
    reason: entry.reason || null,
    startedAt: entry.startedAt || null,
    endedAt: entry.endedAt || null,
    expiresAt: entry.expiresAt || null,
    manualEnd: entry.manualEnd ?? null,
    presetId: entry.presetId || null,
    note: entry.note || null,
    eventId: entry.eventId || null,
  };
}

function getLatestAbsenceOverrideHistoryEntry(state) {
  const history = state?.history;
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }
  return history[history.length - 1];
}

function formatRemainingDuration(ms) {
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
 * 不在許可が新規に開始された際の後処理。
 * - 継続中の不在セッションがあれば抑制ログを記録し、PASS バッジに切り替える。
 */
function onAbsenceOverrideActivated(nextState) {
  const now = Date.now();
  if (absenceDetectionStartTime !== 0) {
    const durationSeconds = Math.max(Math.floor((now - absenceDetectionStartTime) / 1000), 0);
    recordDetectionLogEntry({
      type: 'absence_override_suppressed',
      detectedAt: now,
      durationSeconds: durationSeconds || null,
      meta: buildAbsenceOverrideMeta(nextState.current),
    });
  }

  resetAbsenceTracking();

  const reason = nextState.current?.reason || '一時的な不在許可';
  addLog(`✅ 不在検知を一時的にPASS: ${reason}`, 'info');

  recordDetectionLogEntry({
    type: 'absence_override_active',
    detectedAt: now,
    durationSeconds: null,
    meta: buildAbsenceOverrideMeta(nextState.current),
  });
}

/**
 * 不在許可が終了した際の後処理。履歴をもとにログへ残す。
 */
function onAbsenceOverrideCleared(previousEntry, nextState) {
  const now = Date.now();
  resetAbsenceTracking();

  const latestHistory = getLatestAbsenceOverrideHistoryEntry(nextState) || previousEntry;
  addLog('ℹ️ 不在許可が解除されました', 'info');

  recordDetectionLogEntry({
    type: 'absence_override_inactive',
    detectedAt: now,
    durationSeconds: null,
    meta: buildAbsenceOverrideMeta(latestHistory),
  });
}

/**
 * 許可が継続中に延長された場合の処理。
 * - 延長時のみログを追加し、バッジへ残り時間を反映する。
 */
function onAbsenceOverrideUpdated(nextState) {
  if (!nextState.active || !nextState.current) {
    return;
  }
  const previous = previousAbsenceOverrideEntry;
  const current = nextState.current;
  if (!previous) {
    previousAbsenceOverrideEntry = current;
    return;
  }

  const prevExpires = Number.isFinite(previous.expiresAt) ? previous.expiresAt : null;
  const currentExpires = Number.isFinite(current.expiresAt) ? current.expiresAt : null;

  if (prevExpires !== currentExpires) {
    const now = Date.now();
    const remaining = Number.isFinite(nextState.remainingMs) ? nextState.remainingMs : (currentExpires ? currentExpires - now : null);
    const remainingLabel = remaining != null ? formatRemainingDuration(remaining) : '時間指定なし';
    addLog(`⏱️ 不在許可が延長されました (残り ${remainingLabel})`, 'info');
    recordDetectionLogEntry({
      type: 'absence_override_extended',
      detectedAt: now,
      durationSeconds: null,
      meta: buildAbsenceOverrideMeta(current),
    });
  }

  previousAbsenceOverrideEntry = current;
}

// タイマーUI更新
function updateTimers() {
  if (typeof window.updateTimerDisplay === 'function') {
    window.updateTimerDisplay(phoneDetectionTime, absenceDetectionTime);
  }
}

// スマホ検知アラート
async function triggerPhoneAlert() {
  phoneAlertTriggered = true;
  addLog('⚠️ スマホが検知されました！', 'alert');
  recordDetectionLogEntry({
    type: 'phone_alert',
    detectedAt: Date.now(),
    durationSeconds: phoneDetectionTime || null,
    meta: {
      threshold: settings.phoneThreshold,
    },
  });

  if (settings.soundEnabled) {
    playAlertSound();
  }

  if (settings.desktopNotification && window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '⚠️ スマホ検知アラート',
      body: `スマホが${settings.phoneThreshold}秒以上検知されています`
    });
  }

  // 音声読み上げ（VOICEVOX）
  if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
    try {
      const res = await window.electronAPI.speakText({
        text: 'スマホが検知されています。作業に集中しましょう。',
        engine: 'voicevox',
        options: { speakerId: settings.voicevoxSpeaker, speedScale: 1.05 }
      });
      if (res && res.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);
        audio.play().catch(() => {});
      }
    } catch {}
  }

  // 直後の再発火抑止: 軽いクールダウンを再設定
  lastPhoneAlertAt = Date.now();
}

// 不在検知アラート
async function triggerAbsenceAlert() {
  if (absenceOverrideState?.active) {
    return;
  }
  absenceAlertTriggered = true;
  addLog('⚠️ 不在が検知されました！', 'alert');
  recordDetectionLogEntry({
    type: 'absence_alert',
    detectedAt: Date.now(),
    durationSeconds: absenceDetectionTime || null,
    meta: {
      threshold: settings.absenceThreshold,
    },
  });

  if (settings.soundEnabled) {
    playAlertSound();
  }

  if (settings.desktopNotification && window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '⚠️ 不在検知アラート',
      body: `${settings.absenceThreshold}秒以上不在です`
    });
  }

  // 音声読み上げ（VOICEVOX）
  if (window.electronAPI && typeof window.electronAPI.speakText === 'function') {
    try {
      const res = await window.electronAPI.speakText({
        text: '離席が続いています。席に戻りましょう。',
        engine: 'voicevox',
        options: { speakerId: settings.voicevoxSpeaker, speedScale: 1.0 }
      });
      if (res && res.success && res.dataUrl) {
        const audio = new Audio(res.dataUrl);
        audio.play().catch(() => {});
      }
    } catch {}
  }

  // 直後の再発火抑止: 軽いクールダウンを再設定
  lastAbsenceAlertAt = Date.now();
}

// アラート音再生
function playAlertSound() {
  // Web Audio APIでビープ音を生成
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.value = 0.3;

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.5);
}

// 検知結果描画
function drawDetections(detections) {
  detections.forEach(detection => {
    const [x, y, w, h] = detection.bbox;

    // バウンディングボックス描画
    ctx.strokeStyle = detection.class === 'cell phone' ? '#ff6b6b' : '#51cf66';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    // ラベル描画
    ctx.fillStyle = detection.class === 'cell phone' ? '#ff6b6b' : '#51cf66';
    ctx.fillRect(x, y - 25, w, 25);
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(
      `${detection.class} ${(detection.confidence * 100).toFixed(0)}%`,
      x + 5,
      y - 7
    );
  });
}

// ログ追加
function addLog(message, type = 'info') {
  if (logContainer.querySelector('.empty-message')) {
    logContainer.innerHTML = '';
  }

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;

  const timestamp = new Date().toLocaleTimeString('ja-JP');
  logEntry.innerHTML = `<span class="log-time">${timestamp}</span> ${message}`;

  logContainer.insertBefore(logEntry, logContainer.firstChild);

  // ログを最大50件に制限
  while (logContainer.children.length > MONITOR_UI_CONSTANTS.maxLogEntries) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

function recordDetectionLogEntry({ type, detectedAt = Date.now(), durationSeconds = null, meta = null }) {
  if (!window.electronAPI || typeof window.electronAPI.recordDetectionLog !== 'function') {
    return;
  }

  window.electronAPI
    .recordDetectionLog({
      type,
      detectedAt,
      durationSeconds,
      meta,
    })
    .then(() => {
      window.dispatchEvent(new CustomEvent('detection-log-recorded'));
    })
    .catch((error) => {
      console.warn('[Monitor] 検知ログ送信に失敗:', error);
    });
}

// 最前面ウィンドウの前回状態（重複ログ抑止・滞在時間集計用）
let lastActiveWindowInfo = null;
let lastActiveWindowStart = 0;
const APP_USAGE_MIN_DURATION_SECONDS = 5;

// 最前面ウィンドウを取得してログ + 使用時間集計
async function trackActiveWindow() {
  if (!window.electronAPI || typeof window.electronAPI.getActiveWindow !== 'function') return;
  try {
    const res = await window.electronAPI.getActiveWindow();
    if (!res || !res.success) return;
    const w = res.window;
    const appName = (w && w.app) || 'Unknown';
    const title = (w && w.title) || '';
    const url = (w && w.url) || null;

    // 集計キー: アプリ + (URLドメインがあるならドメイン、それ以外はタイトル先頭部分)
    let domain = null;
    if (url) {
      try {
        const u = new URL(url);
        domain = u.hostname;
      } catch {}
    }
    const keySource = domain || title.slice(0, 60);
    const key = `${appName}::${keySource}`;

    const now = Date.now();
    if (!lastActiveWindowInfo) {
      lastActiveWindowInfo = { key, appName, title, domain };
      lastActiveWindowStart = now;
      addLog(`前面: ${appName}${domain ? ` (${domain})` : title ? ` - ${title}` : ''}`);
      return;
    }

    if (key !== lastActiveWindowInfo.key) {
      recordActiveWindowSession(now);

      addLog(`前面: ${appName}${domain ? ` (${domain})` : title ? ` - ${title}` : ''}`);

      lastActiveWindowInfo = { key, appName, title, domain };
      lastActiveWindowStart = now;
    }
  } catch (e) {
    // 取得失敗は無視
  }
}

function recordActiveWindowSession(endTimestamp = Date.now()) {
  if (!lastActiveWindowInfo || !lastActiveWindowStart) {
    return;
  }

  const durationSeconds = Math.floor((endTimestamp - lastActiveWindowStart) / 1000);
  if (durationSeconds < APP_USAGE_MIN_DURATION_SECONDS) {
    return;
  }

  if (!window.electronAPI || typeof window.electronAPI.recordAppUsage !== 'function') {
    return;
  }

  window.electronAPI
    .recordAppUsage({
      appName: lastActiveWindowInfo.appName,
      title: lastActiveWindowInfo.title,
      domain: lastActiveWindowInfo.domain,
      startedAt: lastActiveWindowStart,
      endedAt: endTimestamp,
      durationSeconds,
    })
    .catch((error) => {
      console.warn('[Monitor] アプリ使用時間送信に失敗:', error);
    });

  lastActiveWindowStart = endTimestamp;
}

window.addEventListener('beforeunload', () => {
  recordActiveWindowSession();
});

// 監視状態のエクスポート（app.jsから参照）
window.getMonitorState = function() {
  return { isMonitoring, mediaStream };
};

window.setMediaStream = function(stream) {
  mediaStream = stream;
};
