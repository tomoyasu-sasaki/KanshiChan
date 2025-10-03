/**
 * 監視設定ドロワーの UI ロジック。
 * - localStorage とフォームを同期させ、monitor.js へ設定を再読み込みさせる。
 * - 定数は constants 配下から読み込み、重複定義を避ける。
 */
import { DEFAULT_MONITOR_SETTINGS } from '../constants/monitor.js';
import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../constants/voicevox-config.js';
import { getSpeakerOptions } from '../constants/voicevox-speakers.js';
import { YOLO_CLASSES, YOLO_CATEGORIES, getClassesByCategory } from '../constants/yolo-classes.js';

// 設定を読み込み
function loadSettings() {
  const saved = localStorage.getItem('monitorSettings');
  if (!saved) {
    return cloneDefaultSettings();
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      ...cloneDefaultSettings(),
      ...parsed,
      enabledClasses: Array.isArray(parsed.enabledClasses) ? parsed.enabledClasses : [...DEFAULT_MONITOR_SETTINGS.enabledClasses]
    };
  } catch {
    return cloneDefaultSettings();
  }
}

// 設定を保存
function saveSettings(settings) {
  localStorage.setItem('monitorSettings', JSON.stringify(settings));
}

/**
 * DEFAULT_MONITOR_SETTINGS を UI 編集用に複製する (参照共有を避ける)。
 */
function cloneDefaultSettings() {
  return {
    ...DEFAULT_MONITOR_SETTINGS,
    enabledClasses: [...DEFAULT_MONITOR_SETTINGS.enabledClasses],
    voicevoxSpeaker: DEFAULT_MONITOR_SETTINGS.voicevoxSpeaker ?? DEFAULT_VOICEVOX_SPEAKER_ID
  };
}

// UI要素取得
let phoneThreshold, phoneThresholdValue, phoneAlertEnabled, phoneConfidence, phoneConfidenceValue;
let absenceThreshold, absenceThresholdValue, absenceAlertEnabled, absenceConfidence, absenceConfidenceValue;
let soundEnabled, desktopNotification, showDetections;
let yoloEnabled, voicevoxSpeaker;
let saveSettingsBtn, resetSettingsBtn, saveMessage;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // UI要素を取得
  phoneThreshold = document.getElementById('phoneThreshold');
  phoneThresholdValue = document.getElementById('phoneThresholdValue');
  phoneAlertEnabled = document.getElementById('phoneAlertEnabled');
  phoneConfidence = document.getElementById('phoneConfidence');
  phoneConfidenceValue = document.getElementById('phoneConfidenceValue');

  absenceThreshold = document.getElementById('absenceThreshold');
  absenceThresholdValue = document.getElementById('absenceThresholdValue');
  absenceAlertEnabled = document.getElementById('absenceAlertEnabled');
  absenceConfidence = document.getElementById('absenceConfidence');
  absenceConfidenceValue = document.getElementById('absenceConfidenceValue');

  soundEnabled = document.getElementById('soundEnabled');
  desktopNotification = document.getElementById('desktopNotification');
  showDetections = document.getElementById('showDetections');
  yoloEnabled = document.getElementById('yoloEnabled');
  voicevoxSpeaker = document.getElementById('voicevoxSpeaker');

  saveSettingsBtn = document.getElementById('saveSettingsBtn');
  resetSettingsBtn = document.getElementById('resetSettingsBtn');
  saveMessage = document.getElementById('saveMessage');

  // 動的にUI要素を生成
  populateVoicevoxSpeakers();
  populateDetectionClasses();

  const settings = loadSettings();
  applySettings(settings);
  setupEventListeners();
  setupAccordion();
});

// VOICEVOX話者選択を動的に生成
function populateVoicevoxSpeakers() {
  const speakerOptions = getSpeakerOptions();
  voicevoxSpeaker.innerHTML = '';
  speakerOptions.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.id;
    optionElement.textContent = option.label;
    voicevoxSpeaker.appendChild(optionElement);
  });
}

// 検知対象クラスを動的に生成
function populateDetectionClasses() {
  const container = document.getElementById('detectionClassesContainer');
  const classesByCategory = getClassesByCategory();

  container.innerHTML = '';

  Object.keys(classesByCategory).forEach(categoryKey => {
    const category = YOLO_CATEGORIES[categoryKey];
    const classes = classesByCategory[categoryKey];

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'class-category';

    const categoryTitle = document.createElement('h3');
    categoryTitle.textContent = `${category.emoji} ${category.label}`;
    categoryDiv.appendChild(categoryTitle);

    const classGrid = document.createElement('div');
    classGrid.className = 'class-grid';

    classes.forEach(cls => {
      const label = document.createElement('label');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = cls.name;
      checkbox.dataset.classId = cls.id;
      checkbox.className = 'detection-class-checkbox';

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(cls.label));
      classGrid.appendChild(label);
    });

    categoryDiv.appendChild(classGrid);
    container.appendChild(categoryDiv);
  });
}

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
  if (yoloEnabled) {
    yoloEnabled.checked = settings.yoloEnabled !== false;
  }
  if (voicevoxSpeaker) {
    voicevoxSpeaker.value = settings.voicevoxSpeaker ?? DEFAULT_VOICEVOX_SPEAKER_ID;
  }

  // 検知クラスのチェックボックスを設定
  const enabledClasses = settings.enabledClasses || DEFAULT_MONITOR_SETTINGS.enabledClasses;
  document.querySelectorAll('.detection-class-checkbox').forEach(checkbox => {
    checkbox.checked = enabledClasses.includes(checkbox.value);
  });
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
  // 有効化された検知クラスを取得
  const enabledClasses = [];
  document.querySelectorAll('.detection-class-checkbox:checked').forEach(checkbox => {
    enabledClasses.push(checkbox.value);
  });

  const settings = {
    phoneThreshold: parseInt(phoneThreshold.value),
    phoneAlertEnabled: phoneAlertEnabled.checked,
    phoneConfidence: parseFloat(phoneConfidence.value),
    absenceThreshold: parseInt(absenceThreshold.value),
    absenceAlertEnabled: absenceAlertEnabled.checked,
    absenceConfidence: parseFloat(absenceConfidence.value),
    soundEnabled: soundEnabled.checked,
    desktopNotification: desktopNotification.checked,
    enabledClasses: enabledClasses,
    showDetections: showDetections ? showDetections.checked : DEFAULT_MONITOR_SETTINGS.showDetections,
    yoloEnabled: yoloEnabled ? yoloEnabled.checked : DEFAULT_MONITOR_SETTINGS.yoloEnabled,
    voicevoxSpeaker: voicevoxSpeaker ? parseInt(voicevoxSpeaker.value, 10) : DEFAULT_VOICEVOX_SPEAKER_ID
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
    const defaults = cloneDefaultSettings();
    applySettings(defaults);
    saveSettings(defaults);
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

// アコーディオン機能のセットアップ
function setupAccordion() {
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach((header, index) => {
    // 最初のアイテムは開いた状態にする
    if (index === 0) {
      header.classList.add('active');
      header.nextElementSibling.style.maxHeight = header.nextElementSibling.scrollHeight + 'px';
    }

    header.addEventListener('click', () => {
      const isActive = header.classList.contains('active');
      const content = header.nextElementSibling;

      if (isActive) {
        // 閉じる
        header.classList.remove('active');
        content.style.maxHeight = null;
      } else {
        // 開く
        header.classList.add('active');
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    });
  });
}

// 設定をエクスポート（他のページから使用）
window.getSettings = function() {
  return loadSettings();
};
