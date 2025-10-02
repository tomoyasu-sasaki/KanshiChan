// デフォルト設定
const DEFAULT_SETTINGS = {
  phoneThreshold: 10,
  phoneAlertEnabled: true,
  phoneConfidence: 0.5,
  absenceThreshold: 30,
  absenceAlertEnabled: true,
  absenceConfidence: 0.5,
  soundEnabled: true,
  desktopNotification: true,
  enabledClasses: ['person', 'cell phone'], // デフォルトで有効なクラス
  showDetections: true
};

// 設定を読み込み
function loadSettings() {
  const saved = localStorage.getItem('monitorSettings');
  return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
}

// 設定を保存
function saveSettings(settings) {
  localStorage.setItem('monitorSettings', JSON.stringify(settings));
}

// UI要素取得
const phoneThreshold = document.getElementById('phoneThreshold');
const phoneThresholdValue = document.getElementById('phoneThresholdValue');
const phoneAlertEnabled = document.getElementById('phoneAlertEnabled');
const phoneConfidence = document.getElementById('phoneConfidence');
const phoneConfidenceValue = document.getElementById('phoneConfidenceValue');

const absenceThreshold = document.getElementById('absenceThreshold');
const absenceThresholdValue = document.getElementById('absenceThresholdValue');
const absenceAlertEnabled = document.getElementById('absenceAlertEnabled');
const absenceConfidence = document.getElementById('absenceConfidence');
const absenceConfidenceValue = document.getElementById('absenceConfidenceValue');

const soundEnabled = document.getElementById('soundEnabled');
const desktopNotification = document.getElementById('desktopNotification');
const showDetections = document.getElementById('showDetections');

const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const saveMessage = document.getElementById('saveMessage');

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  const settings = loadSettings();
  applySettings(settings);
  setupEventListeners();
});

// 設定をUIに適用
function applySettings(settings) {
  phoneThreshold.value = settings.phoneThreshold;
  phoneThresholdValue.textContent = `${settings.phoneThreshold}秒`;
  phoneAlertEnabled.checked = settings.phoneAlertEnabled;
  phoneConfidence.value = settings.phoneConfidence;
  phoneConfidenceValue.textContent = settings.phoneConfidence;

  absenceThreshold.value = settings.absenceThreshold;
  absenceThresholdValue.textContent = `${settings.absenceThreshold}秒`;
  absenceAlertEnabled.checked = settings.absenceAlertEnabled;
  absenceConfidence.value = settings.absenceConfidence;
  absenceConfidenceValue.textContent = settings.absenceConfidence;

  soundEnabled.checked = settings.soundEnabled;
  desktopNotification.checked = settings.desktopNotification;
  if (showDetections) {
    showDetections.checked = settings.showDetections !== false;
  }
}

// イベントリスナー設定
function setupEventListeners() {
  // スライダーの値変更
  phoneThreshold.addEventListener('input', (e) => {
    phoneThresholdValue.textContent = `${e.target.value}秒`;
  });

  phoneConfidence.addEventListener('input', (e) => {
    phoneConfidenceValue.textContent = e.target.value;
  });

  absenceThreshold.addEventListener('input', (e) => {
    absenceThresholdValue.textContent = `${e.target.value}秒`;
  });

  absenceConfidence.addEventListener('input', (e) => {
    absenceConfidenceValue.textContent = e.target.value;
  });

  // 保存ボタン
  saveSettingsBtn.addEventListener('click', handleSaveSettings);

  // リセットボタン
  resetSettingsBtn.addEventListener('click', handleResetSettings);
}

// 設定保存処理
async function handleSaveSettings() {
  const settings = {
    phoneThreshold: parseInt(phoneThreshold.value),
    phoneAlertEnabled: phoneAlertEnabled.checked,
    phoneConfidence: parseFloat(phoneConfidence.value),
    absenceThreshold: parseInt(absenceThreshold.value),
    absenceAlertEnabled: absenceAlertEnabled.checked,
    absenceConfidence: parseFloat(absenceConfidence.value),
    soundEnabled: soundEnabled.checked,
    desktopNotification: desktopNotification.checked,
    enabledClasses: ['person', 'cell phone'], // 固定
    showDetections: showDetections ? showDetections.checked : true
  };

  saveSettings(settings);

  // 監視設定を再読み込み
  if (typeof window.reloadMonitorSettings === 'function') {
    window.reloadMonitorSettings();
  }

  // 保存メッセージ表示
  showMessage('設定を保存しました', 'success');

  // 通知
  if (window.electronAPI) {
    await window.electronAPI.sendNotification({
      title: '設定保存',
      body: '監視設定を保存しました'
    });
  }
}

// リセット処理
function handleResetSettings() {
  if (confirm('設定をデフォルトに戻しますか?')) {
    applySettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    showMessage('設定をデフォルトに戻しました', 'info');
  }
}

// メッセージ表示
function showMessage(text, type) {
  saveMessage.textContent = text;
  saveMessage.className = `save-message ${type}`;

  setTimeout(() => {
    saveMessage.textContent = '';
    saveMessage.className = 'save-message';
  }, 3000);
}

// 設定をエクスポート（他のページから使用）
function getSettings() {
  return loadSettings();
}
