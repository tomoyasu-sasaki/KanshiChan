/**
 * 監視設定ドロワーの UI ロジック。
 * - localStorage とフォームを同期させ、monitor.js へ設定を再読み込みさせる。
 * - 定数は constants 配下から読み込み、重複定義を避ける。
 */
import { DEFAULT_MONITOR_SETTINGS } from '../constants/monitor.js';
import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../constants/voicevox-config.js';
import { getSpeakerOptions } from '../constants/voicevox-speakers.js';
import { YOLO_CLASSES, YOLO_CATEGORIES, getClassesByCategory } from '../constants/yolo-classes.js';
import { SETTINGS_VOICE_MAP, findSettingsKeyBySynonym } from '../constants/settingsVoiceMap.js';
import { AudioInputControl } from './components/audio-input-control.js';

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
let slackSaveBtn, slackSendNowBtn, slackReporterMessage;
let slackSettingsCache = null;
let slackControlsBusy = false;
let typingMonitorEnabledCheckbox, typingMonitorPauseSettingsBtn, typingMonitorSettingsStatus, typingMonitorSettingsMessage;
let typingStatusCache = null;
let typingSettingsBusy = false;
let settingsVoiceResultContainer = null;
let lastVoiceTranscription = '';
let voiceCommandBusy = false;

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
  slackReporterMessage = document.getElementById('slackReporterMessage');

  typingMonitorEnabledCheckbox = document.getElementById('typingMonitorEnabled');
  typingMonitorPauseSettingsBtn = document.getElementById('typingMonitorPauseSettingsBtn');
  typingMonitorSettingsStatus = document.getElementById('typingMonitorSettingsStatus');
  typingMonitorSettingsMessage = document.getElementById('typingMonitorSettingsMessage');
  settingsVoiceResultContainer = document.getElementById('settingsVoiceResult');

  // 動的にUI要素を生成
  populateVoicevoxSpeakers();
  populateDetectionClasses();

  const settings = loadSettings();
  applySettings(settings);
  setupEventListeners();
  setupAccordion();
  initializeSlackReporterSection();
  initializeTypingMonitorSection();
  setupVoiceCommandSection();
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

  await refreshSlackSettings(false);
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

  slackHistoryCache = [];
}

function renderSlackStatus() {
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
  adjustAccordionHeight(slackReporterMessage);
  setTimeout(() => {
    if (slackReporterMessage) {
      slackReporterMessage.textContent = '';
      slackReporterMessage.className = 'slack-message';
      adjustAccordionHeight(slackReporterMessage);
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

async function initializeTypingMonitorSection() {
  if (!typingMonitorEnabledCheckbox) {
    return;
  }

  if (!window.electronAPI?.typingMonitorStatus) {
    typingMonitorEnabledCheckbox.disabled = true;
    typingMonitorPauseSettingsBtn?.setAttribute('disabled', 'disabled');
    if (typingMonitorSettingsStatus) {
      typingMonitorSettingsStatus.textContent = 'タイピング監視機能は利用できません (electronAPI 未連携)';
    }
    return;
  }

  typingMonitorEnabledCheckbox.addEventListener('change', handleTypingMonitorEnabledChange);
  typingMonitorPauseSettingsBtn?.addEventListener('click', handleTypingMonitorPauseSettings);

  await refreshTypingMonitorStatus({ showBusy: true, showError: false });
}

function setTypingSettingsBusy(isBusy) {
  typingSettingsBusy = isBusy;
  updateTypingMonitorSettingsUI();
}

function updateTypingMonitorSettingsUI() {
  const status = typingStatusCache;
  const available = status?.available !== false;

  if (typingMonitorEnabledCheckbox) {
    typingMonitorEnabledCheckbox.checked = Boolean(available && status?.enabled);
    typingMonitorEnabledCheckbox.disabled = typingSettingsBusy || !available;
  }

  if (typingMonitorPauseSettingsBtn) {
    typingMonitorPauseSettingsBtn.disabled = typingSettingsBusy || !available || !status?.enabled;
    typingMonitorPauseSettingsBtn.textContent = status?.paused ? '再開' : '休止';
  }

  if (typingMonitorSettingsStatus) {
    let text = '状態取得中...';
    if (!status) {
      text = '状態取得中...';
    } else if (!available) {
      text = 'uiohook-napi が読み込めません。ビルド状態を確認してください。';
    } else if (!status.enabled) {
      text = 'タイピング監視は無効です。設定で有効化できます。';
    } else if (status.paused) {
      text = 'タイピング監視は休止中です。再開ボタンを押して復帰できます。';
    } else {
      const lastKeyText = status.lastKeyAt ? formatTypingSettingsTimestamp(status.lastKeyAt) : '記録なし';
      text = `タイピング監視は稼働中（最終入力: ${lastKeyText}）`;
    }
    typingMonitorSettingsStatus.textContent = text;
  }
}

async function refreshTypingMonitorStatus({ showBusy = false, showError = true } = {}) {
  if (!window.electronAPI?.typingMonitorStatus) {
    return;
  }

  try {
    if (showBusy) {
      setTypingSettingsBusy(true);
    }
    const response = await window.electronAPI.typingMonitorStatus();
    if (!response?.success) {
      throw new Error(response?.error || 'タイピング監視の状態取得に失敗しました');
    }
    typingStatusCache = response.status;
    updateTypingMonitorSettingsUI();
  } catch (error) {
    console.error('[Settings] タイピング監視状態取得エラー:', error);
    if (showError) {
      showTypingSettingsMessage(error.message || 'タイピング監視の状態取得に失敗しました', 'error');
    }
  } finally {
    if (showBusy) {
      setTypingSettingsBusy(false);
    } else {
      updateTypingMonitorSettingsUI();
    }
  }
}

async function handleTypingMonitorEnabledChange(event) {
  if (typingSettingsBusy) {
    event.target.checked = Boolean(typingStatusCache?.enabled);
    return;
  }
  if (!window.electronAPI?.typingMonitorSetEnabled) {
    showTypingSettingsMessage('タイピング監視の切替 API が利用できません', 'error');
    event.target.checked = Boolean(typingStatusCache?.enabled);
    return;
  }

  const enabled = Boolean(event.target.checked);

  try {
    setTypingSettingsBusy(true);
    showTypingSettingsMessage(enabled ? 'タイピング監視を有効化しています...' : 'タイピング監視を無効化しています...', 'info');
    const response = await window.electronAPI.typingMonitorSetEnabled(enabled);
    if (!response?.success) {
      throw new Error(response?.error || 'タイピング監視の切替に失敗しました');
    }
    typingStatusCache = response.status;
    updateTypingMonitorSettingsUI();
    showTypingSettingsMessage(enabled ? 'タイピング監視を有効化しました' : 'タイピング監視を無効化しました', 'success');
    window.dispatchEvent(new CustomEvent('typing-monitor-status-updated'));
  } catch (error) {
    console.error('[Settings] タイピング監視切替エラー:', error);
    showTypingSettingsMessage(error.message || 'タイピング監視の切替に失敗しました', 'error');
    event.target.checked = Boolean(typingStatusCache?.enabled);
  } finally {
    setTypingSettingsBusy(false);
    updateTypingMonitorSettingsUI();
  }
}

async function handleTypingMonitorPauseSettings() {
  if (typingSettingsBusy) {
    return;
  }
  if (!window.electronAPI?.typingMonitorSetPaused) {
    showTypingSettingsMessage('休止制御が利用できません', 'error');
    return;
  }

  if (!typingStatusCache) {
    await refreshTypingMonitorStatus({ showBusy: true });
  }

  const status = typingStatusCache;
  if (!status?.available) {
    showTypingSettingsMessage('uiohook-napi が読み込まれていないため操作できません', 'error');
    return;
  }
  if (!status.enabled) {
    showTypingSettingsMessage('監視が無効のため休止操作はできません', 'error');
    return;
  }

  const nextPaused = !status.paused;

  try {
    setTypingSettingsBusy(true);
    showTypingSettingsMessage(nextPaused ? 'タイピング監視を休止しています...' : 'タイピング監視を再開しています...', 'info');
    const response = await window.electronAPI.typingMonitorSetPaused(nextPaused);
    if (!response?.success) {
      throw new Error(response?.error || 'タイピング監視の休止切替に失敗しました');
    }
    typingStatusCache = response.status;
    updateTypingMonitorSettingsUI();
    showTypingSettingsMessage(nextPaused ? 'タイピング監視を休止しました' : 'タイピング監視を再開しました', 'success');
    window.dispatchEvent(new CustomEvent('typing-monitor-status-updated'));
  } catch (error) {
    console.error('[Settings] タイピング監視休止エラー:', error);
    showTypingSettingsMessage(error.message || 'タイピング監視の休止切替に失敗しました', 'error');
  } finally {
    setTypingSettingsBusy(false);
    updateTypingMonitorSettingsUI();
  }
}

function showTypingSettingsMessage(text, type = 'info') {
  if (!typingMonitorSettingsMessage) {
    return;
  }
  typingMonitorSettingsMessage.textContent = text;
  typingMonitorSettingsMessage.className = `slack-message show ${type}`;
  adjustAccordionHeight(typingMonitorSettingsMessage);
  setTimeout(() => {
    if (typingMonitorSettingsMessage) {
      typingMonitorSettingsMessage.textContent = '';
      typingMonitorSettingsMessage.className = 'slack-message';
      adjustAccordionHeight(typingMonitorSettingsMessage);
    }
  }, 4000);
}

function formatTypingSettingsTimestamp(value) {
  if (!value) {
    return '記録なし';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '記録なし';
  }
  return date.toLocaleString('ja-JP', { hour12: false });
}

function adjustAccordionHeight(innerElement) {
  if (!innerElement) {
    return;
  }
  const content = innerElement.closest('.accordion-content');
  if (!content) {
    return;
  }
  if (content.style.maxHeight) {
    requestAnimationFrame(() => {
      content.style.maxHeight = `${content.scrollHeight}px`;
    });
  }
}
/**
 * 設定ドロワーの音声入力 UI を初期化する。
 */
function setupVoiceCommandSection() {
  const controlRoot = document.getElementById('settingsVoiceControl');
  if (!controlRoot || !settingsVoiceResultContainer) {
    return;
  }

  new AudioInputControl(controlRoot, {
    promptProfile: 'settings',
    contextId: 'settings-drawer',
    title: '音声で設定変更',
    description: '例:「通知をオフ」「スマホアラートを70秒に」',
    onTranscription: (text) => {
      lastVoiceTranscription = text || '';
    },
    onResult: (result) => {
      handleVoiceCommandResult(result).catch((error) => {
        renderVoiceCommandResult([
          {
            success: false,
            label: 'エラー',
            message: error?.message || '音声コマンド処理中に問題が発生しました',
          },
        ]);
      });
    },
    onError: (error) => {
      renderVoiceCommandResult([
        {
          success: false,
          label: 'エラー',
          message: error?.message || '音声コマンドを処理できませんでした',
        },
      ]);
    },
  });
}

/**
 * 音声入力の推論結果を適用し、設定保存までをハンドリングする。
 * @param {object} result
 */
async function handleVoiceCommandResult(result) {
  if (voiceCommandBusy) {
    renderVoiceCommandResult([
      {
        success: false,
        label: '処理中',
        message: '前のコマンドを処理中です。少し待ってからもう一度お試しください。',
      },
    ]);
    return;
  }

  if (typingSettingsBusy || slackControlsBusy) {
    renderVoiceCommandResult([
      {
        success: false,
        label: '操作保留',
        message: '現在別の設定操作を処理中のため音声コマンドを受け付けませんでした。',
      },
    ]);
    return;
  }

  voiceCommandBusy = true;

  let commands = Array.isArray(result?.commands) ? [...result.commands] : [];
  if (commands.length === 0) {
    const fallback = extractFallbackCommands(lastVoiceTranscription);
    if (fallback.length > 0) {
      commands = fallback;
    }
  }

  if (commands.length === 0) {
    renderVoiceCommandResult([
      {
        success: false,
        label: '未検出',
        message: '変更対象の設定を特定できませんでした。別の言い回しで試してください。',
      },
    ]);
    voiceCommandBusy = false;
    return;
  }

  const results = commands.map((command) => applySingleVoiceCommand(command));
  const shouldPersist = results.some((entry) => entry.success);

  if (shouldPersist) {
    try {
      await handleSaveSettings();
    } catch (error) {
      results.push({
        success: false,
        label: '保存',
        message: error?.message || '設定の保存に失敗しました',
      });
    }
  }

  renderVoiceCommandResult(results);
  voiceCommandBusy = false;
}

/**
 * 音声コマンドの実行結果をカード表示する。
 * @param {Array<object>} entries
 */
function renderVoiceCommandResult(entries) {
  if (!settingsVoiceResultContainer) {
    return;
  }
  settingsVoiceResultContainer.innerHTML = '';

  entries.forEach((entry) => {
    const card = document.createElement('div');
    card.className = `result-card ${entry.success ? 'success' : 'error'}`;

    const title = document.createElement('strong');
    title.textContent = entry.label || '設定';
    card.appendChild(title);

    if (entry.message) {
      const messageEl = document.createElement('span');
      messageEl.textContent = entry.message;
      card.appendChild(messageEl);
    }

    settingsVoiceResultContainer.appendChild(card);
  });
}

/**
 * 単一の音声コマンドを UI 上の設定へ反映する。
 * @param {object} command
 * @returns {{success:boolean,label:string,message:string}}
 */
function applySingleVoiceCommand(command) {
  const key = command?.key || findSettingsKeyBySynonym(command?.target) || findSettingsKeyBySynonym(command?.label);
  const entry = SETTINGS_VOICE_MAP[key];
  if (!entry) {
    return {
      success: false,
      label: command?.key || '不明な設定',
      message: 'この設定は音声操作に対応していません',
    };
  }

  const element = document.getElementById(entry.elementId);
  if (!element) {
    return {
      success: false,
      label: entry.label,
      message: '該当する UI 要素が見つかりませんでした',
    };
  }

  try {
    if (entry.type === 'boolean') {
      const resolved = resolveBooleanValue(command, element);
      if (resolved === null) {
        return {
          success: false,
          label: entry.label,
          message: 'ON/OFF の意図を判別できませんでした',
        };
      }
      element.checked = resolved;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      updateLinkedDisplays(entry.key, resolved);
      return {
        success: true,
        label: entry.label,
        message: resolved ? 'オンに変更しました' : 'オフに変更しました',
      };
    }

    if (entry.type === 'number') {
      const value = resolveNumberValue(command, entry);
      if (value === null) {
        return {
          success: false,
          label: entry.label,
          message: '数値が認識できませんでした',
        };
      }
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      updateLinkedDisplays(entry.key, value);
      return {
        success: true,
        label: entry.label,
        message: `${value}${entry.unit || ''} に設定しました`,
      };
    }

    if (entry.type === 'select') {
      const matchedValue = resolveSelectValue(command, element);
      if (!matchedValue) {
        return {
          success: false,
          label: entry.label,
          message: '指定された値に一致する話者が見つかりませんでした',
        };
      }
      element.value = matchedValue;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        label: entry.label,
        message: `${element.selectedOptions[0]?.textContent || '選択肢'} を選びました`,
      };
    }
  } catch (error) {
    return {
      success: false,
      label: entry.label,
      message: error?.message || '操作に失敗しました',
    };
  }

  return {
    success: false,
    label: entry.label,
    message: '未対応の設定タイプです',
  };
}

/**
 * 真偽値コマンドを推論する。曖昧な場合は null を返す。
 */
function resolveBooleanValue(command, element) {
  if (command?.action === 'toggle') {
    return !element.checked;
  }

  const rawValue = command?.value;
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  const normalized = String(rawValue ?? '').trim().toLowerCase();
  if (!normalized && lastVoiceTranscription) {
    return inferBooleanFromText(lastVoiceTranscription);
  }

  if (!normalized) {
    return null;
  }

  if (['on', 'enable', 'enabled', 'true', '1', 'オン', '有効', 'つけて', '点けて', '開始'].some((word) => normalized.includes(word))) {
    return true;
  }
  if (['off', 'disable', 'disabled', 'false', '0', 'オフ', '無効', '止めて', '消して', '切って'].some((word) => normalized.includes(word))) {
    return false;
  }
  return null;
}

/**
 * 数値コマンドを正規化して範囲内に収める。
 */
function resolveNumberValue(command, entry) {
  let numeric = null;
  if (command && command.value !== undefined && command.value !== null) {
    numeric = Number(command.value);
  }

  if ((numeric === null || Number.isNaN(numeric)) && typeof lastVoiceTranscription === 'string') {
    const match = lastVoiceTranscription.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      numeric = Number(match[1]);
    }
  }

  if (numeric === null || Number.isNaN(numeric)) {
    return null;
  }

  const clamped = Math.min(entry.max, Math.max(entry.min, numeric));
  const stepped = Math.round(clamped / entry.step) * entry.step;
  return entry.step % 1 === 0 ? String(stepped) : stepped.toFixed(1);
}

/**
 * セレクトボックスで指定された話者を推測する。
 */
function resolveSelectValue(command, selectEl) {
  const raw = command?.value || '';
  if (!raw) {
    return null;
  }
  const normalized = String(raw).trim();
  const options = Array.from(selectEl.options);
  const directMatch = options.find((option) => option.value === normalized);
  if (directMatch) {
    return directMatch.value;
  }

  const partialMatch = options.find((option) => option.textContent && option.textContent.includes(normalized));
  return partialMatch ? partialMatch.value : null;
}

/**
 * スライダなどの補助表示を最新値に更新する。
 */
function updateLinkedDisplays(key, value) {
  switch (key) {
    case 'phoneThreshold':
      if (phoneThresholdValue) {
        phoneThresholdValue.textContent = `${value}秒`;
      }
      break;
    case 'phoneConfidence':
      if (phoneConfidenceValue) {
        phoneConfidenceValue.textContent = String(value);
      }
      break;
    case 'absenceThreshold':
      if (absenceThresholdValue) {
        absenceThresholdValue.textContent = `${value}秒`;
      }
      break;
    case 'absenceConfidence':
      if (absenceConfidenceValue) {
        absenceConfidenceValue.textContent = String(value);
      }
      break;
    default:
      break;
  }
}

/**
 * LLM なしで処理できる簡易コマンドを正規表現で抽出する。
 */
function extractFallbackCommands(text) {
  if (!text) {
    return [];
  }

  const commands = [];
  Object.values(SETTINGS_VOICE_MAP).forEach((entry) => {
    const hit = entry.synonyms?.find((synonym) => text.includes(synonym));
    if (!hit) {
      return;
    }

    if (entry.type === 'boolean') {
      const boolValue = inferBooleanFromText(text);
      if (boolValue !== null) {
        commands.push({ key: entry.key, action: 'set', value: boolValue });
      }
      return;
    }

    if (entry.type === 'number') {
      const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (match) {
        commands.push({ key: entry.key, action: 'set', value: Number(match[1]) });
      }
      return;
    }

    if (entry.type === 'select') {
      const options = getSpeakerOptions();
      const matched = options.find((option) => text.includes(option.label));
      if (matched) {
        commands.push({ key: entry.key, action: 'set', value: matched.id });
      }
    }
  });

  return commands;
}

/**
 * 日本語のオン/オフ表現から真偽値を推定する。
 */
function inferBooleanFromText(text) {
  if (!text) {
    return null;
  }
  const hasOn = ['オン', '有効', '付けて', 'つけて', '開始', 'enable'].some((word) => text.includes(word));
  const hasOff = ['オフ', '無効', '止めて', '消して', '切って', 'disable'].some((word) => text.includes(word));
  if (hasOn && !hasOff) {
    return true;
  }
  if (hasOff && !hasOn) {
    return false;
  }
  return null;
}
