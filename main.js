/**
 * Kanchichan - Electron メインプロセス
 * 
 * 責務:
 * - ウィンドウ管理とセキュアなレンダラ設定（contextIsolation/nodeIntegration制御）
 * - YOLOv11モデルの初期化と物体検知（メインプロセスで実行しレンダラの負荷を軽減）
 * - IPC経由でのデスクトップ通知・スケジュール保存
 * 
 * 依存:
 * - onnxruntime-node（ネイティブモジュール、ビルド環境必須）
 * - models/yolo11n.onnx（配置必須）
 */
const { app, BrowserWindow, ipcMain, Notification, powerSaveBlocker } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const YOLODetector = require('./src/utils/yolo-detector');

let mainWindow;
let yoloDetector = null;
let powerSaveId = null;

// バックグラウンドスロットリング無効化（ウィンドウが背後/非アクティブでもタイマー・RAFを維持）
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

/**
 * メインウィンドウ作成
 * セキュリティ要件: nodeIntegration無効 + contextIsolation有効でレンダラを隔離
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js'),
      backgroundThrottling: false,
    },
    title: '📹 Kanchichan',
    icon: "/Users/tmys-sasaki/Projects/Public/kanchichan/assets/logo.png"
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'pages', 'index.html'));
}

app.whenReady().then(async () => {
  // YOLO検知器を初期化（メインプロセスで実行することでレンダラの負荷を軽減）
  // 初期化失敗時も起動を継続（検知機能のみ無効化）
  yoloDetector = new YOLODetector();
  const initialized = await yoloDetector.initialize();

  if (!initialized) {
    console.error('YOLOモデルの初期化に失敗しました');
  }

  createWindow();

  // スリープ/省電力によるサスペンドを防止（バックグラウンドでも検知継続）
  try {
    if (powerSaveId === null) {
      powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
    }
  } catch (e) {
    console.warn('powerSaveBlocker 初期化に失敗:', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (powerSaveId !== null) {
    try {
      powerSaveBlocker.stop(powerSaveId);
    } catch (e) {
      // noop
    }
    powerSaveId = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// スケジュール保存
ipcMain.handle('save-schedule', async (event, schedule) => {
  return { success: true, schedule };
});

// 通知送信
ipcMain.handle('send-notification', async (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title,
      body: body
    });
    notification.show();
    return { success: true };
  }
  return { success: false };
});

/**
 * 物体検知 IPC ハンドラ
 * レンダラから Base64 画像を受け取り、YOLOv11 で検知して結果を返す
 * メインプロセスで実行する理由: ONNX Runtime はネイティブモジュールのためレンダラで直接実行不可
 * 
 * @param {string} imageDataUrl - Base64エンコードされた画像データ
 * @returns {Promise<{success:boolean, detections?:Array, error?:string}>}
 */
ipcMain.handle('detect-objects', async (event, imageDataUrl) => {
  if (!yoloDetector) {
    return { success: false, error: 'YOLO検知器が初期化されていません' };
  }

  try {
    const detections = await yoloDetector.detect(imageDataUrl);
    return { success: true, detections };
  } catch (error) {
    console.error('検知エラー:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 最前面ウィンドウ情報取得
 * 戻り値例: { app: 'Google Chrome', title: 'Example - https://example.com', url?: 'https://example.com' }
 */
ipcMain.handle('get-active-window', async () => {
  try {
    // AppleScript 実行ヘルパ
    const runOsa = (script) => new Promise((resolve) => {
      execFile('/usr/bin/osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
        if (err) return resolve('');
        resolve(String(stdout || '').trim());
      });
    });

    // 前面アプリ名
    const appName = await runOsa('tell application "System Events" to get name of first application process whose frontmost is true');

    // 前面ウィンドウのタイトル（取得できない場合は空）
    const title = await runOsa('tell application "System Events" to tell (first application process whose frontmost is true) to try return name of window 1 on error return "" end try end tell');

    // ブラウザ別にURL取得を試行
    let url = '';
    if (appName === 'Google Chrome') {
      url = await runOsa('tell application "Google Chrome" to try if (count of windows) > 0 then return URL of active tab of front window on error return "" end try');
    } else if (appName === 'Microsoft Edge') {
      url = await runOsa('tell application "Microsoft Edge" to try if (count of windows) > 0 then return URL of active tab of front window on error return "" end try');
    } else if (appName === 'Brave Browser') {
      url = await runOsa('tell application "Brave Browser" to try if (count of windows) > 0 then return URL of active tab of front window on error return "" end try');
    } else if (appName === 'Arc') {
      url = await runOsa('tell application "Arc" to try return URL of active tab of front window on error return "" end try');
    } else if (appName === 'Safari') {
      url = await runOsa('tell application "Safari" to try if exists (front document) then return URL of front document on error return "" end try');
    }

    return {
      success: true,
      window: {
        app: appName || null,
        title: title || null,
        url: url || null
      }
    };
  } catch (e) {
    console.error('アクティブウィンドウ取得エラー:', e);
    return { success: false, error: e.message };
  }
});
