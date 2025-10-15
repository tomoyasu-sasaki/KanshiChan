/**
 * 設定ドロワーの基礎 UI 制御。
 * - DOM から値を収集し、永続化レイヤー(state.js)との橋渡しを行う。
 * - 音声操作や外部セクションが呼び出す共通ロジックをここに集中的に置く。
 */
import { DEFAULT_MONITOR_SETTINGS } from '../../constants/monitor.js';
import { DEFAULT_VOICEVOX_SPEAKER_ID } from '../../constants/voicevox-config.js';
import { getSpeakerOptions } from '../../constants/voicevox-speakers.js';
import { YOLO_CATEGORIES, getClassesByCategory } from '../../constants/yolo-classes.js';
import { cloneDefaultSettings, loadSettings, saveSettings } from './state.js';

const elements = {
  phoneThreshold: null,
  phoneThresholdValue: null,
  phoneAlertEnabled: null,
  phoneConfidence: null,
  phoneConfidenceValue: null,
  absenceThreshold: null,
  absenceThresholdValue: null,
  absenceAlertEnabled: null,
  absenceConfidence: null,
  absenceConfidenceValue: null,
  soundEnabled: null,
  desktopNotification: null,
  showDetections: null,
  yoloEnabled: null,
  voicevoxSpeaker: null,
  saveSettingsBtn: null,
  resetSettingsBtn: null,
  saveMessage: null,
  detectionClassesContainer: null,
};

/**
 * 設定フォーム全体を初期化する。
 * - DOM の参照と初期表示をまとめて行い、他モジュールが順序を気にせず呼び出せるようにする。
 */
export function initializeCoreSettings() {
  bindElements();
  populateVoicevoxSpeakers();
  populateDetectionClasses();

  const settings = loadSettings();
  applySettings(settings);
  setupEventListeners();
  setupAccordion();
}

/**
 * 頻繁に参照する DOM 要素をキャッシュする。
 * - 毎回 querySelector しないことで音声コマンド等の再利用時にコストを抑える。
 */
function bindElements() {
  elements.phoneThreshold = document.getElementById('phoneThreshold');
  elements.phoneThresholdValue = document.getElementById('phoneThresholdValue');
  elements.phoneAlertEnabled = document.getElementById('phoneAlertEnabled');
  elements.phoneConfidence = document.getElementById('phoneConfidence');
  elements.phoneConfidenceValue = document.getElementById('phoneConfidenceValue');

  elements.absenceThreshold = document.getElementById('absenceThreshold');
  elements.absenceThresholdValue = document.getElementById('absenceThresholdValue');
  elements.absenceAlertEnabled = document.getElementById('absenceAlertEnabled');
  elements.absenceConfidence = document.getElementById('absenceConfidence');
  elements.absenceConfidenceValue = document.getElementById('absenceConfidenceValue');

  elements.soundEnabled = document.getElementById('soundEnabled');
  elements.desktopNotification = document.getElementById('desktopNotification');
  elements.showDetections = document.getElementById('showDetections');
  elements.yoloEnabled = document.getElementById('yoloEnabled');
  elements.voicevoxSpeaker = document.getElementById('voicevoxSpeaker');

  elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');
  elements.resetSettingsBtn = document.getElementById('resetSettingsBtn');
  elements.saveMessage = document.getElementById('saveMessage');

  elements.detectionClassesContainer = document.getElementById('detectionClassesContainer');
}

/**
 * VOICEVOX 話者のリストを最新の定義から再描画する。
 * - 設定保存で新しい話者が追加されても再読込なしで反映できる。
 */
function populateVoicevoxSpeakers() {
  const { voicevoxSpeaker } = elements;
  if (!voicevoxSpeaker) {
    return;
  }

  const speakerOptions = getSpeakerOptions();
  voicevoxSpeaker.innerHTML = '';
  speakerOptions.forEach((option) => {
    const optionElement = document.createElement('option');
    optionElement.value = option.id;
    optionElement.textContent = option.label;
    voicevoxSpeaker.appendChild(optionElement);
  });
}

/**
 * モニタリング対象クラスのチェックボックス群をカテゴリ単位で生成する。
 * - ユーザーがクラス追加分を見逃さないよう、定義変更時に自動で表示が拡張される。
 */
function populateDetectionClasses() {
  const container = elements.detectionClassesContainer;
  if (!container) {
    return;
  }
  const classesByCategory = getClassesByCategory();
  container.innerHTML = '';

  Object.keys(classesByCategory).forEach((categoryKey) => {
    const category = YOLO_CATEGORIES[categoryKey];
    const classes = classesByCategory[categoryKey];

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'class-category';

    const categoryTitle = document.createElement('h3');
    categoryTitle.textContent = `${category.emoji} ${category.label}`;
    categoryDiv.appendChild(categoryTitle);

    const classGrid = document.createElement('div');
    classGrid.className = 'class-grid';

    classes.forEach((cls) => {
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

/**
 * 入力イベントと保存/リセット操作を束ねる。
 * - displayText 等を即時反映し、設定保存前でも UI に現在値を示す。
 */
function setupEventListeners() {
  const {
    phoneThreshold,
    phoneThresholdValue,
    phoneConfidence,
    phoneConfidenceValue,
    absenceThreshold,
    absenceThresholdValue,
    absenceConfidence,
    absenceConfidenceValue,
    saveSettingsBtn,
    resetSettingsBtn,
  } = elements;

  phoneThreshold?.addEventListener('input', (event) => {
    if (phoneThresholdValue) {
      phoneThresholdValue.textContent = `${event.target.value}秒`;
    }
  });

  phoneConfidence?.addEventListener('input', (event) => {
    if (phoneConfidenceValue) {
      phoneConfidenceValue.textContent = event.target.value;
    }
  });

  absenceThreshold?.addEventListener('input', (event) => {
    if (absenceThresholdValue) {
      absenceThresholdValue.textContent = `${event.target.value}秒`;
    }
  });

  absenceConfidence?.addEventListener('input', (event) => {
    if (absenceConfidenceValue) {
      absenceConfidenceValue.textContent = event.target.value;
    }
  });

  saveSettingsBtn?.addEventListener('click', () => {
    handleSaveSettings().catch((error) => {
      console.error('[Settings] 設定保存エラー:', error);
    });
  });

  resetSettingsBtn?.addEventListener('click', handleResetSettings);
}

/**
 * 現在のフォーム値を保存し、モニタ画面へ反映する。
 * - 保存成功後に electron 通知を送ることでユーザーまで状態変化を伝える。
 */
export async function handleSaveSettings() {
  const settings = collectSettingsFromForm();
  saveSettings(settings);

  if (typeof window.reloadMonitorSettings === 'function') {
    window.reloadMonitorSettings();
  }

  showSaveMessage('設定を保存しました', 'success');

  if (window.electronAPI) {
    await window.electronAPI.sendNotification?.({
      title: '設定保存',
      body: '監視設定を保存しました',
    });
  }
}

/**
 * フォームから各設定値を収集し、型と下限値を整える。
 * - enabledClasses はチェック順に依存しないよう配列再生成する。
 */
function collectSettingsFromForm() {
  const {
    phoneThreshold,
    phoneAlertEnabled,
    phoneConfidence,
    absenceThreshold,
    absenceAlertEnabled,
    absenceConfidence,
    soundEnabled,
    desktopNotification,
    showDetections,
    yoloEnabled,
    voicevoxSpeaker,
  } = elements;

  const enabledClasses = [];
  document
    .querySelectorAll('.detection-class-checkbox:checked')
    .forEach((checkbox) => {
      enabledClasses.push(checkbox.value);
    });

  return {
    phoneThreshold: parseInt(phoneThreshold?.value ?? DEFAULT_MONITOR_SETTINGS.phoneThreshold, 10),
    phoneAlertEnabled: phoneAlertEnabled?.checked ?? DEFAULT_MONITOR_SETTINGS.phoneAlertEnabled,
    phoneConfidence: parseFloat(phoneConfidence?.value ?? DEFAULT_MONITOR_SETTINGS.phoneConfidence),
    absenceThreshold: parseInt(absenceThreshold?.value ?? DEFAULT_MONITOR_SETTINGS.absenceThreshold, 10),
    absenceAlertEnabled: absenceAlertEnabled?.checked ?? DEFAULT_MONITOR_SETTINGS.absenceAlertEnabled,
    absenceConfidence: parseFloat(absenceConfidence?.value ?? DEFAULT_MONITOR_SETTINGS.absenceConfidence),
    soundEnabled: soundEnabled?.checked ?? DEFAULT_MONITOR_SETTINGS.soundEnabled,
    desktopNotification: desktopNotification?.checked ?? DEFAULT_MONITOR_SETTINGS.desktopNotification,
    enabledClasses,
    showDetections: showDetections ? showDetections.checked : DEFAULT_MONITOR_SETTINGS.showDetections,
    yoloEnabled: yoloEnabled ? yoloEnabled.checked : DEFAULT_MONITOR_SETTINGS.yoloEnabled,
    voicevoxSpeaker: voicevoxSpeaker ? parseInt(voicevoxSpeaker.value, 10) : DEFAULT_VOICEVOX_SPEAKER_ID,
  };
}

/**
 * ユーザーに確認をとった上で、デフォルト設定へ戻す。
 * - 誤操作防止のため confirm を挟み、保存後も UI に即時反映する。
 */
function handleResetSettings() {
  if (!window.confirm('設定をデフォルトに戻しますか?')) {
    return;
  }
  const defaults = cloneDefaultSettings();
  applySettings(defaults);
  saveSettings(defaults);
  showSaveMessage('設定をデフォルトに戻しました', 'info');
}

/**
 * 保存系のトースト表示を制御する。
 * - メッセージ領域をクリアするまでのライフサイクルを統一する。
 */
function showSaveMessage(text, type) {
  const { saveMessage } = elements;
  if (!saveMessage) {
    return;
  }
  saveMessage.textContent = text;
  saveMessage.className = `save-message ${type}`;

  setTimeout(() => {
    if (!saveMessage) {
      return;
    }
    saveMessage.textContent = '';
    saveMessage.className = 'save-message';
  }, 3000);
}

/**
 * モニタ設定の値をフォームへ適用する。
 * - localStorage や音声操作から読み込んだ値を UI に同期させる。
 */
export function applySettings(settings) {
  const {
    phoneThreshold,
    phoneThresholdValue,
    phoneAlertEnabled,
    phoneConfidence,
    phoneConfidenceValue,
    absenceThreshold,
    absenceThresholdValue,
    absenceAlertEnabled,
    absenceConfidence,
    absenceConfidenceValue,
    soundEnabled,
    desktopNotification,
    showDetections,
    yoloEnabled,
    voicevoxSpeaker,
  } = elements;

  if (phoneThreshold) {
    phoneThreshold.value = settings.phoneThreshold;
  }
  if (phoneThresholdValue) {
    phoneThresholdValue.textContent = `${settings.phoneThreshold}秒`;
  }
  if (phoneAlertEnabled) {
    phoneAlertEnabled.checked = settings.phoneAlertEnabled;
  }
  if (phoneConfidence) {
    phoneConfidence.value = settings.phoneConfidence;
  }
  if (phoneConfidenceValue) {
    phoneConfidenceValue.textContent = settings.phoneConfidence;
  }

  if (absenceThreshold) {
    absenceThreshold.value = settings.absenceThreshold;
  }
  if (absenceThresholdValue) {
    absenceThresholdValue.textContent = `${settings.absenceThreshold}秒`;
  }
  if (absenceAlertEnabled) {
    absenceAlertEnabled.checked = settings.absenceAlertEnabled;
  }
  if (absenceConfidence) {
    absenceConfidence.value = settings.absenceConfidence;
  }
  if (absenceConfidenceValue) {
    absenceConfidenceValue.textContent = settings.absenceConfidence;
  }

  if (soundEnabled) {
    soundEnabled.checked = settings.soundEnabled;
  }
  if (desktopNotification) {
    desktopNotification.checked = settings.desktopNotification;
  }
  if (showDetections) {
    showDetections.checked = settings.showDetections !== false;
  }
  if (yoloEnabled) {
    yoloEnabled.checked = settings.yoloEnabled !== false;
  }
  if (voicevoxSpeaker) {
    voicevoxSpeaker.value = settings.voicevoxSpeaker ?? DEFAULT_VOICEVOX_SPEAKER_ID;
  }

  const enabledClasses = settings.enabledClasses || DEFAULT_MONITOR_SETTINGS.enabledClasses;
  document.querySelectorAll('.detection-class-checkbox').forEach((checkbox) => {
    checkbox.checked = enabledClasses.includes(checkbox.value);
  });
}

/**
 * スライダや数値入力に付随する表示を更新する。
 * - 音声コマンド・手動入力の両方から呼ばれるため、値のソースに依存しない。
 */
export function updateLinkedDisplays(key, value) {
  const {
    phoneThresholdValue,
    phoneConfidenceValue,
    absenceThresholdValue,
    absenceConfidenceValue,
  } = elements;

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
 * アコーディオンの開閉状態を制御する。
 * - 初期状態で最上段を展開し、DOMContentLoaded の順序に依存しない。
 */
function setupAccordion() {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach((header, index) => {
    if (index === 0) {
      header.classList.add('active');
      const content = header.nextElementSibling;
      if (content) {
        content.style.maxHeight = `${content.scrollHeight}px`;
      }
    }

    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      if (!content) {
        return;
      }
      const isActive = header.classList.contains('active');
      if (isActive) {
        header.classList.remove('active');
        content.style.maxHeight = null;
      } else {
        header.classList.add('active');
        content.style.maxHeight = `${content.scrollHeight}px`;
      }
    });
  });
}

export { loadSettings } from './state.js';
