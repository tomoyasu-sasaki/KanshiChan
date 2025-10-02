/**
 * 監視システム - 物体検知と状態管理
 * 
 * 責務:
 * - カメラ映像の描画ループ（60FPS）
 * - YOLOv11による物体検知ループ（0.1秒ごと）
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
const PHONE_INTERPOLATION_WINDOW = 2000; // 2秒（スマホ検知）
const PERSON_INTERPOLATION_WINDOW = 500; // 0.5秒（不在検知は素早く反応）

// 設定
let settings = loadSettings();

// 設定の読み込み
function loadSettings() {
  const saved = localStorage.getItem('monitorSettings');
  return saved ? JSON.parse(saved) : {
    phoneThreshold: 10,
    phoneAlertEnabled: true,
    phoneConfidence: 0.5,
    absenceThreshold: 30,
    absenceAlertEnabled: true,
    absenceConfidence: 0.5,
    soundEnabled: true,
    desktopNotification: true,
    enabledClasses: ['person', 'cell phone']
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
  
  // 検知ループ開始（0.5秒ごとに実行 - 素早く反応）
  if (!detectionInterval) {
    detectionInterval = setInterval(performDetection, 500);
  }

  // 最前面アプリ監視（1秒ごと）
  if (!activeWindowInterval) {
    activeWindowInterval = setInterval(trackActiveWindow, 1000);
  }

  // 描画ループは別で高頻度実行
  requestAnimationFrame(renderLoop);
};

// 監視プロセス停止（app.jsから呼ばれる）
window.stopMonitoringProcess = function() {
  stopMonitoring();
  addLog('監視を停止しました');
};

// 監視停止
function stopMonitoring() {
  // メディアストリームを停止
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  // 検知インターバルをクリア
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  if (activeWindowInterval) {
    clearInterval(activeWindowInterval);
    activeWindowInterval = null;
  }

  // ビデオをクリア
  if (videoElement.srcObject) {
    videoElement.srcObject = null;
  }

  // Canvasをクリア
  if (ctx) {
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  }

  // 状態をリセット
  isMonitoring = false;
  phoneDetectionTime = 0;
  absenceDetectionTime = 0;
  phoneDetectionStartTime = 0;
  absenceDetectionStartTime = 0;
  phoneAlertTriggered = false;
  absenceAlertTriggered = false;
  lastPhoneDetectedTime = 0;
  lastPersonDetectedTime = 0;
  lastDetectionTime = 0;

  updateTimers();
}

// 描画ループ（滑らかなビデオ表示用）
function renderLoop() {
  if (!isMonitoring) return;

  // ビデオフレームを描画
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  // 最新の検知結果を描画（1秒以内の結果のみ表示）
  const now = Date.now();
  if (lastDetectionTime && (now - lastDetectionTime) < 1000) {
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
 * - 0.1秒間隔で実行（高頻度）
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
      const enabledClasses = settings.enabledClasses || ['person', 'cell phone'];
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
      triggerPhoneAlert();
    }
  } else {
    if (phoneDetectionTime > 0) {
      phoneDetectionTime = 0;
      phoneDetectionStartTime = 0;
      phoneAlertTriggered = false;
      updateTimers();
    }
  }
}

// 不在検知処理
function handleAbsenceDetection(personDetected) {
  if (!personDetected) {
    // 初回検知時は開始時刻を記録
    if (absenceDetectionStartTime === 0) {
      absenceDetectionStartTime = Date.now();
    }

    // 経過時間を計算（秒）
    const elapsedMs = Date.now() - absenceDetectionStartTime;
    absenceDetectionTime = Math.floor(elapsedMs / 1000);

    updateTimers();

    // アラート閾値チェック
    if (
      settings.absenceAlertEnabled &&
      !absenceAlertTriggered &&
      absenceDetectionTime >= settings.absenceThreshold
    ) {
      triggerAbsenceAlert();
    }
  } else {
    if (absenceDetectionTime > 0) {
      absenceDetectionTime = 0;
      absenceDetectionStartTime = 0;
      absenceAlertTriggered = false;
      updateTimers();
    }
  }
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

  if (settings.soundEnabled) {
    playAlertSound();
  }

  if (settings.desktopNotification && window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '⚠️ スマホ検知アラート',
      body: `スマホが${settings.phoneThreshold}秒以上検知されています`
    });
  }
}

// 不在検知アラート
async function triggerAbsenceAlert() {
  absenceAlertTriggered = true;
  addLog('⚠️ 不在が検知されました！', 'alert');

  if (settings.soundEnabled) {
    playAlertSound();
  }

  if (settings.desktopNotification && window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '⚠️ 不在検知アラート',
      body: `${settings.absenceThreshold}秒以上不在です`
    });
  }
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
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// 最前面ウィンドウの前回状態（重複ログ抑止・滞在時間集計用）
let lastActiveWindowKey = null;
let lastActiveWindowStart = 0;

// 使用時間統計の読み書き
function readUsageStats() {
  try {
    return JSON.parse(localStorage.getItem('appUsageStats') || '{}');
  } catch {
    return {};
  }
}

function writeUsageStats(stats) {
  localStorage.setItem('appUsageStats', JSON.stringify(stats));
}

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
    const key = domain ? `${appName}::${domain}` : `${appName}::${title.slice(0, 60)}`;

    const now = Date.now();
    if (lastActiveWindowKey === null) {
      lastActiveWindowKey = key;
      lastActiveWindowStart = now;
      addLog(`前面: ${appName}${domain ? ` (${domain})` : title ? ` - ${title}` : ''}`);
      return;
    }

    if (key !== lastActiveWindowKey) {
      // 前のキーに滞在時間を加算
      const elapsedSec = Math.max(1, Math.floor((now - lastActiveWindowStart) / 1000));
      const stats = readUsageStats();
      stats[lastActiveWindowKey] = (stats[lastActiveWindowKey] || 0) + elapsedSec;
      writeUsageStats(stats);

      // 新しい前面ウィンドウをログ
      addLog(`前面: ${appName}${domain ? ` (${domain})` : title ? ` - ${title}` : ''}`);

      lastActiveWindowKey = key;
      lastActiveWindowStart = now;
    }
  } catch (e) {
    // 取得失敗は無視
  }
}

// 監視状態のエクスポート（app.jsから参照）
window.getMonitorState = function() {
  return { isMonitoring, mediaStream };
};

window.setMediaStream = function(stream) {
  mediaStream = stream;
};
