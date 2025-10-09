/**
 * 監視ビューの UI 全体制御。
 * - ドロワーや監視開始/停止トグルなどのトップレベル操作を集約する。
 * - monitor.js との境界で状態取得/更新を行い、設定値は constants から取得する。
 */
import { DEFAULT_MONITOR_SETTINGS } from '../constants/monitor.js';

/**
 *  UI統合管理
 * 
 * 責務:
 * - ツールバー操作（監視開始/停止、ドロワー開閉）
 * - 自動監視開始（起動後0.5秒でカメラ起動）
 * - タイマー表示更新（スマホ検知・不在検知の経過時間）
 * - 時計表示更新
 * 
 * 設計判断:
 * - 単一ページアプリ: ページ遷移なし、全機能をドロワーで提供
 * - 自動開始の遅延: カメラ権限ダイアログが表示されやすいため0.5秒待機
 */

let currentDrawer = null;
let currentDialog = null;
let autoStarted = false;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  updateClock();
  setInterval(updateClock, 1000);

  // 自動監視開始（少し遅延させてカメラ権限取得をスムーズに）
  setTimeout(() => {
    if (!autoStarted) {
      autoStartMonitoring();
      autoStarted = true;
    }
  }, 500);
});

// UI初期化
function initializeUI() {
  // ツールバーボタン
  const scheduleBtn = document.getElementById('scheduleBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const logsBtn = document.getElementById('logsBtn');
  const chatBtn = document.getElementById('chatBtn');
  const exitBtn = document.getElementById('exitBtn');

  // イベントリスナー設定
  scheduleBtn.addEventListener('click', () => toggleDialog('scheduleDialog'));
  settingsBtn.addEventListener('click', () => toggleDrawer('settingsDrawer'));
  logsBtn.addEventListener('click', () => toggleDrawer('logsDrawer'));
  chatBtn.addEventListener('click', () => toggleDrawer('chatDrawer'));
  exitBtn.addEventListener('click', exitApp);

  // ドロワーの閉じるボタン
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const drawerId = e.target.getAttribute('data-drawer');
      const dialogId = e.target.getAttribute('data-dialog');
      if (drawerId) {
        closeDrawer(drawerId);
      } else if (dialogId) {
        closeDialog(dialogId);
      }
    });
  });

  // オーバーレイクリックで閉じる
  const overlay = createOverlay();
  overlay.addEventListener('click', () => {
    if (currentDrawer) {
      closeDrawer(currentDrawer);
    }
    if (currentDialog) {
      closeDialog(currentDialog);
    }
  });
}

// オーバーレイ作成
function createOverlay() {
  let overlay = document.querySelector('.drawer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
}

// ドロワー開閉
function toggleDrawer(drawerId) {
  const drawer = document.getElementById(drawerId);
  const overlay = document.querySelector('.drawer-overlay');

  if (currentDrawer && currentDrawer !== drawerId) {
    // 別のドロワーが開いている場合は閉じる
    closeDrawer(currentDrawer);
  }

  if (drawer.classList.contains('open')) {
    closeDrawer(drawerId);
  } else {
    drawer.classList.add('open');
    overlay.classList.add('show');
    currentDrawer = drawerId;
  }
}

function closeDrawer(drawerId) {
  const drawer = document.getElementById(drawerId);
  const overlay = document.querySelector('.drawer-overlay');

  if (drawer) {
    drawer.classList.remove('open');
  }
  overlay.classList.remove('show');
  currentDrawer = null;
}

// ダイアログ開閉
function toggleDialog(dialogId) {
  const dialog = document.getElementById(dialogId);
  const overlay = document.querySelector('.drawer-overlay');

  if (currentDrawer) {
    // ドロワーが開いている場合は閉じる
    closeDrawer(currentDrawer);
  }

  if (currentDialog && currentDialog !== dialogId) {
    // 別のダイアログが開いている場合は閉じる
    closeDialog(currentDialog);
  }

  if (dialog.classList.contains('open')) {
    closeDialog(dialogId);
  } else {
    dialog.classList.add('open');
    overlay.classList.add('show');
    currentDialog = dialogId;
  }
}

function closeDialog(dialogId) {
  const dialog = document.getElementById(dialogId);
  const overlay = document.querySelector('.drawer-overlay');

  if (dialog) {
    dialog.classList.remove('open');
  }

  // ドロワーもダイアログも開いていない場合のみオーバーレイを閉じる
  if (!currentDrawer) {
    overlay.classList.remove('show');
  }
  currentDialog = null;
}

/**
 * 自動監視開始
 * 起動後に自動的にカメラを起動して監視開始
 * エラー時も起動を継続し、手動開始を促す
 */
async function autoStartMonitoring() {
  try {
    // カメラアクセス
    await startMonitoringFromApp();
    if (typeof addLog === 'function') {
      addLog('自動的に監視を開始しました');
    }
  } catch (error) {
    console.error('自動監視開始エラー:', error);
    if (typeof addLog === 'function') {
      addLog('⚠️ カメラへのアクセスに失敗しました。', 'alert');
    }
  }
}

/**
 * 監視開始
 * 
 * カメラ設定:
 * - 1280x720 (HD): 広い視野角を確保、検知精度向上
 * - 30fps: リアルタイム性と処理負荷のバランス
 * 
 * 処理フロー:
 * 1. カメラストリーム取得
 * 2. ビデオ要素にバインド
 * 3. Canvas サイズをビデオに合わせて設定
 * 4. 監視プロセス開始（monitor.js）
 * 5. UI更新
 */
async function startMonitoringFromApp() {
  const videoElement = document.getElementById('videoElement');
  const canvasElement = document.getElementById('canvasElement');
  
  // カメラアクセス（HD解像度で広い視野を取得）
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    }
  });

  videoElement.srcObject = stream;

  // ビデオがロードされてから設定
  await new Promise((resolve) => {
    videoElement.onloadedmetadata = () => {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      resolve();
    };
  });

  // ストリームを設定
  if (typeof window.setMediaStream === 'function') {
    window.setMediaStream(stream);
  }

  // monitor.jsの機能を利用
  if (typeof window.startMonitoringProcess === 'function') {
    window.startMonitoringProcess();
  }
}

// 時計更新
function updateClock() {
  const timeDisplay = document.getElementById('currentTime');
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  timeDisplay.textContent = `${hours}:${minutes}`;
}

// アプリ終了
function exitApp() {
  if (confirm('アプリケーションを終了しますか?')) {
    window.close();
  }
}

// ログ追加（グローバル関数として公開）
window.addAppLog = function(message, type = 'info') {
  if (typeof addLog === 'function') {
    addLog(message, type);
  }
};

/**
 * localStorage に保存された監視設定を読み取り、破損時は既定値へ復旧する。
 */
const FALLBACK_MONITOR_SETTINGS_JSON = JSON.stringify(DEFAULT_MONITOR_SETTINGS);

function getStoredMonitorSettings() {
  try {
    return JSON.parse(localStorage.getItem('monitorSettings') || FALLBACK_MONITOR_SETTINGS_JSON);
  } catch {
    return DEFAULT_MONITOR_SETTINGS;
  }
}

// タイマー更新（グローバル関数として公開）
window.updateTimerDisplay = function(phoneTime, absenceTime) {
  const phoneTimer = document.getElementById('phoneTimer');
  const absenceTimer = document.getElementById('absenceTimer');
  const phoneStatusBadge = document.getElementById('phoneStatusBadge');
  const presenceStatusBadge = document.getElementById('presenceStatusBadge');

  // 時間をフォーマット（分:秒）
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  phoneTimer.textContent = formatTime(phoneTime);
  absenceTimer.textContent = formatTime(absenceTime);

  // 設定を取得
  const settings = getStoredMonitorSettings();

  // ステータスバッジのスタイル更新
  if (phoneTime > 0) {
    phoneStatusBadge.classList.add('warning');
    if (phoneTime >= settings.phoneThreshold) {
      phoneStatusBadge.classList.add('alert');
      phoneStatusBadge.classList.remove('warning');
    }
  } else {
    phoneStatusBadge.classList.remove('warning', 'alert');
  }

  if (absenceTime > 0) {
    presenceStatusBadge.classList.add('warning');
    if (absenceTime >= settings.absenceThreshold) {
      presenceStatusBadge.classList.add('alert');
      presenceStatusBadge.classList.remove('warning');
    }
  } else {
    presenceStatusBadge.classList.remove('warning', 'alert');
  }
};

