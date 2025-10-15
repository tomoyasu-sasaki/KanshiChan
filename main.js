/**
 * Kanshichan メインプロセスエントリ。
 * - BrowserWindow 構築や IPC 経由のサービス登録を委譲する。
 * - ONNX Runtime (onnxruntime-node) を介した YOLOv11 推論を事前初期化する。
 * - 電力節約モードの抑止など Electron 特有の OS 依存処理をまとめる。
 */
const { app, BrowserWindow, ipcMain, Notification, powerSaveBlocker, powerMonitor } = require('electron');
const path = require('path');
const YOLODetector = require('./src/utils/yolo-detector');
const { createMainWindow } = require('./src/main/create-window');
const { registerIpcHandlers } = require('./src/main/ipc/register-handlers');
const { initializeDatabase, closeDatabase } = require('./src/main/db');
const { createConfigStore } = require('./src/main/services/config-store');
const { createSlackReporter } = require('./src/main/services/slack-reporter');
const { createTypingMonitor } = require('./src/main/services/typing-monitor');
const { createSystemEventMonitor } = require('./src/main/services/system-events');
const { createAbsenceOverrideManager } = require('./src/main/services/absence-override');

let mainWindow = null;
let yoloDetector = null;
let powerSaveId = null;
let configStore = null;
let slackReporter = null;
let typingMonitor = null;
let systemEventMonitor = null;
let absenceOverrideManager = null;

const appConstantsPromise = import('./src/constants/app.js');

(async () => {
  const { BACKGROUND_BEHAVIOR_DISABLE_FLAGS } = await appConstantsPromise;
  BACKGROUND_BEHAVIOR_DISABLE_FLAGS.forEach(flag => app.commandLine.appendSwitch(flag));
})();

/**
 * バックグラウンド監視を継続させるため、省電力サスペンドを抑止する。
 * macOS/Windows の powerSaveBlocker API 依存。
 */
function ensurePowerSaveBlocker() {
  try {
    if (powerSaveId === null) {
      powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
    }
  } catch (error) {
    console.warn('powerSaveBlocker 初期化に失敗:', error);
  }
}

/**
 * powerSaveBlocker を安全に停止し、OS リソースを解放する。
 */
function stopPowerSaveBlocker() {
  if (powerSaveId !== null) {
    try {
      powerSaveBlocker.stop(powerSaveId);
    } catch {
      // noop
    }
    powerSaveId = null;
  }
}

app.whenReady().then(async () => {
  const { MAIN_WINDOW_CONFIG, APP_TITLE } = await appConstantsPromise;

  try {
    await initializeDatabase(app);
  } catch (dbError) {
    console.error('データベース初期化に失敗しました:', dbError);
  }

  configStore = createConfigStore(app);
  absenceOverrideManager = createAbsenceOverrideManager({ configStore });
  slackReporter = createSlackReporter({ configStore, absenceOverrideManager });
  typingMonitor = createTypingMonitor({ configStore });
  systemEventMonitor = createSystemEventMonitor({ powerMonitor });

  // macOSのDockアイコンを設定
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, 'assets', 'logo.png');
    try {
      app.dock.setIcon(iconPath);
    } catch (error) {
      console.warn('Dockアイコンの設定に失敗:', error);
    }
  }

  yoloDetector = new YOLODetector();
  const initialized = await yoloDetector.initialize();
  if (!initialized) {
    console.error('YOLOモデルの初期化に失敗しました');
  }

  /**
   * BrowserWindow を生成し、終了時のクリーンアップを設定する。
   * window の細かな構成は createMainWindow に委譲。
   */
  const createWindow = () => {
    mainWindow = createMainWindow({
      baseDir: __dirname,
      windowConfig: MAIN_WINDOW_CONFIG,
      appTitle: APP_TITLE
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  createWindow();
  ensurePowerSaveBlocker();

  registerIpcHandlers({
    ipcMain,
    Notification,
    yoloDetectorProvider: () => yoloDetector,
    slackReporter,
    configStore,
    typingMonitor,
    systemEventMonitor,
    absenceOverrideManager,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPowerSaveBlocker();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (slackReporter) {
    try {
      slackReporter.dispose();
    } catch (error) {
      console.warn('SlackReporter dispose でエラー:', error);
    }
  }
  if (typingMonitor) {
    typingMonitor.dispose().catch((error) => {
      console.warn('TypingMonitor dispose でエラー:', error);
    });
  }
  if (systemEventMonitor) {
    systemEventMonitor.dispose().catch((error) => {
      console.warn('SystemEventMonitor dispose でエラー:', error);
    });
  }
  if (absenceOverrideManager) {
    try {
      absenceOverrideManager.dispose();
    } catch (error) {
      console.warn('AbsenceOverrideManager dispose でエラー:', error);
    }
  }
  closeDatabase().catch((error) => {
    console.warn('データベースクローズ処理でエラーが発生しました:', error);
  });
});
