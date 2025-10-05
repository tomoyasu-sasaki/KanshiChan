/**
 * 監視設定ドロワーの UI ロジック。
 * - localStorage とフォームを同期させ、monitor.js へ設定を再読み込みさせる。
 * - 定数は constants 配下から読み込み、重複定義を避ける。
 */
import { DEFAULT_MONITOR_SETTINGS } from '../constants/monitor.js';
import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../constants/voicevox-config.js';
import { getSpeakerOptions } from '../constants/voicevox-speakers.js';
import { YOLO_CLASSES, YOLO_CATEGORIES, getClassesByCategory } from '../constants/yolo-classes.js';

const DEFAULT_SLACK_SCHEDULE = ['13:00', '18:00'];

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
let slackReporterEnabled, slackWebhookUrlInput, slackScheduleTimesInput, slackTimezoneInput;
let slackSaveBtn, slackSendNowBtn, slackRefreshBtn, slackReporterStatus, slackHistoryList, slackReporterMessage;
let slackSettingsCache = null;
let slackHistoryCache = [];
let slackControlsBusy = false;

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

  slackReporterEnabled = document.getElementById('slackReporterEnabled');
  slackWebhookUrlInput = document.getElementById('slackWebhookUrl');
  slackScheduleTimesInput = document.getElementById('slackScheduleTimes');
  slackTimezoneInput = document.getElementById('slackTimezone');
  slackSaveBtn = document.getElementById('slackSaveBtn');
  slackSendNowBtn = document.getElementById('slackSendNowBtn');
  slackRefreshBtn = document.getElementById('slackRefreshStatusBtn');
  slackReporterStatus = document.getElementById('slackReporterStatus');
  slackHistoryList = document.getElementById('slackHistoryList');
  slackReporterMessage = document.getElementById('slackReporterMessage');

  // 動的にUI要素を生成
  populateVoicevoxSpeakers();
  populateDetectionClasses();

  const settings = loadSettings();
  applySettings(settings);
  setupEventListeners();
  setupAccordion();
  initializeSlackReporterSection();
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

async function initializeSlackReporterSection() {
  if (!slackReporterEnabled) {
    return;
  }

  if (!window.electronAPI?.slackReporterGetSettings) {
    setSlackFieldsDisabled(true);
    showSlackMessage('Slack レポート機能を初期化できません (electronAPI 未接続)', 'error');
    return;
  }

  slackSaveBtn?.addEventListener('click', handleSlackSettingsSave);
  slackSendNowBtn?.addEventListener('click', handleSlackSendNow);
  slackRefreshBtn?.addEventListener('click', () => refreshSlackHistory(true));

  await refreshSlackSettings(false);
  await refreshSlackHistory(false);
  renderSlackStatus();
}

function setSlackFieldsDisabled(disabled) {
  [
    slackReporterEnabled,
    slackWebhookUrlInput,
    slackScheduleTimesInput,
    slackTimezoneInput,
    slackSaveBtn,
    slackSendNowBtn,
    slackRefreshBtn,
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

function setSlackBusy(isBusy) {
  slackControlsBusy = isBusy;
  setSlackFieldsDisabled(isBusy);
}

function applySlackSettingsToInputs(settings) {
  if (!slackReporterEnabled) return;
  slackSettingsCache = settings || null;

  const enabled = Boolean(slackSettingsCache?.enabled);
  slackReporterEnabled.checked = enabled;
  if (slackWebhookUrlInput) {
    slackWebhookUrlInput.value = slackSettingsCache?.webhookUrl || '';
  }
  if (slackScheduleTimesInput) {
    const schedule = slackSettingsCache?.scheduleTimes?.length
      ? slackSettingsCache.scheduleTimes.join(', ')
      : DEFAULT_SLACK_SCHEDULE.join(', ');
    slackScheduleTimesInput.value = schedule;
  }
  if (slackTimezoneInput) {
    slackTimezoneInput.value = slackSettingsCache?.timezone || '';
  }

  renderSlackStatus();
}

function parseScheduleInput(value) {
  if (typeof value !== 'string') {
    return DEFAULT_SLACK_SCHEDULE;
  }
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : DEFAULT_SLACK_SCHEDULE;
}

async function refreshSlackSettings(showError = true) {
  if (!window.electronAPI?.slackReporterGetSettings) {
    return;
  }

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterGetSettings();
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 設定の取得に失敗しました');
    }
    applySlackSettingsToInputs(response.settings);
  } catch (error) {
    console.error('[Settings] Slack 設定取得エラー:', error);
    if (showError) {
      showSlackMessage(error.message || 'Slack 設定の取得に失敗しました', 'error');
    }
  } finally {
    setSlackBusy(false);
  }
}

async function refreshSlackHistory(showMessageOnError = false) {
  if (!window.electronAPI?.slackReporterHistory || !slackHistoryList) {
    return;
  }

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterHistory({ limit: 10 });
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 履歴の取得に失敗しました');
    }
    slackHistoryCache = Array.isArray(response.history) ? response.history : [];
    renderSlackHistoryList();
    renderSlackStatus();
  } catch (error) {
    console.error('[Settings] Slack 履歴取得エラー:', error);
    if (showMessageOnError) {
      showSlackMessage(error.message || 'Slack 履歴の取得に失敗しました', 'error');
    }
  } finally {
    setSlackBusy(false);
  }
}

function renderSlackStatus() {
  if (!slackReporterStatus) {
    return;
  }

  if (!slackSettingsCache?.enabled || !slackSettingsCache?.webhookUrl) {
    slackReporterStatus.textContent = 'Slack レポートは無効です。Webhook URL を設定して有効化してください。';
    return;
  }

  if (!slackHistoryCache.length) {
    const scheduleText = slackSettingsCache.scheduleTimes?.join(', ') || DEFAULT_SLACK_SCHEDULE.join(', ');
    slackReporterStatus.textContent = `Slack レポートは有効です。送信予定: ${scheduleText}`;
    return;
  }

  const latest = slackHistoryCache[0];
  const icon = latest.status === 'success' ? '✅' : '⚠️';
  const statusLabel = latest.status === 'success' ? '成功' : '失敗';
  const base = `${icon} 最終送信: ${formatSlackTimestamp(latest.sentAt)} (${statusLabel}${latest.reason ? ` / ${latest.reason}` : ''})`;
  slackReporterStatus.textContent = latest.error ? `${base} - ${latest.error}` : base;
}

function renderSlackHistoryList() {
  if (!slackHistoryList) {
    return;
  }

  if (!slackHistoryCache.length) {
    slackHistoryList.innerHTML = '<li class="empty">履歴がありません</li>';
    return;
  }

  slackHistoryList.innerHTML = slackHistoryCache
    .map((entry) => {
      const icon = entry.status === 'success' ? '✅' : '⚠️';
      const reason = entry.reason === 'schedule' ? '定期' : '手動';
      const statusClass = entry.status === 'success' ? 'success' : 'failure';
      const errorLine = entry.error ? `<div class="slack-history-error">${escapeHtml(entry.error)}</div>` : '';
      return `
        <li class="slack-history-item ${statusClass}">
          <div class="slack-history-header">
            <span class="slack-history-icon">${icon}</span>
            <span class="slack-history-time">${formatSlackTimestamp(entry.sentAt)}</span>
            <span class="slack-history-status">${entry.status === 'success' ? '成功' : '失敗'}</span>
            <span class="slack-history-reason">${reason}</span>
          </div>
          ${errorLine}
        </li>
      `;
    })
    .join('');
}

async function handleSlackSettingsSave() {
  if (slackControlsBusy) {
    return;
  }
  if (!window.electronAPI?.slackReporterUpdateSettings) {
    showSlackMessage('Slack 設定を保存できません (electronAPI 未接続)', 'error');
    return;
  }

  const payload = {
    enabled: slackReporterEnabled?.checked ?? false,
    webhookUrl: slackWebhookUrlInput?.value?.trim() || '',
    scheduleTimes: parseScheduleInput(slackScheduleTimesInput?.value || ''),
    timezone: slackTimezoneInput?.value?.trim() || undefined,
  };

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterUpdateSettings(payload);
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 設定の保存に失敗しました');
    }
    applySlackSettingsToInputs(response.settings);
    showSlackMessage('Slack 設定を保存しました', 'success');
    await refreshSlackHistory(false);
  } catch (error) {
    console.error('[Settings] Slack 設定保存エラー:', error);
    showSlackMessage(error.message || 'Slack 設定の保存に失敗しました', 'error');
  } finally {
    setSlackBusy(false);
  }
}

async function handleSlackSendNow() {
  if (slackControlsBusy) {
    return;
  }
  if (!window.electronAPI?.slackReporterSendNow) {
    showSlackMessage('Slack 送信 API が利用できません', 'error');
    return;
  }

  try {
    setSlackBusy(true);
    const response = await window.electronAPI.slackReporterSendNow();
    if (!response?.success) {
      throw new Error(response?.error || 'Slack 送信に失敗しました');
    }
    showSlackMessage('Slack に送信しました', 'success');
    await refreshSlackHistory(false);
  } catch (error) {
    console.error('[Settings] Slack 手動送信エラー:', error);
    showSlackMessage(error.message || 'Slack 手動送信に失敗しました', 'error');
  } finally {
    setSlackBusy(false);
  }
}

function showSlackMessage(text, type = 'info') {
  if (!slackReporterMessage) {
    return;
  }
  slackReporterMessage.textContent = text;
  slackReporterMessage.className = `slack-message show ${type}`;
  setTimeout(() => {
    if (slackReporterMessage) {
      slackReporterMessage.textContent = '';
      slackReporterMessage.className = 'slack-message';
    }
  }, 4000);
}

function formatSlackTimestamp(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('ja-JP', { hour12: false });
}

function escapeHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
