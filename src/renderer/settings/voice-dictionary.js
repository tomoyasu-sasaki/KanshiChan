import { SETTINGS_VOICE_MAP } from '../../constants/settingsVoiceMap.js';
import {
  getVoiceDictionaryEntries,
  setVoiceDictionaryEntries,
  addVoiceDictionaryEntry,
  removeVoiceDictionaryEntry,
  getUnresolvedPhrases,
  clearUnresolvedPhrase,
} from './voice-dictionary-store.js';

let phraseInput = null;
let targetSelect = null;
let addButton = null;
let listContainer = null;
let messageContainer = null;
let exportButton = null;
let importButton = null;
let unresolvedContainer = null;

export function initializeVoiceDictionarySection() {
  phraseInput = document.getElementById('voiceDictionaryPhrase');
  targetSelect = document.getElementById('voiceDictionaryTarget');
  addButton = document.getElementById('voiceDictionaryAddBtn');
  listContainer = document.getElementById('voiceDictionaryList');
  messageContainer = document.getElementById('voiceDictionaryMessage');
  exportButton = document.getElementById('voiceDictionaryExportBtn');
  importButton = document.getElementById('voiceDictionaryImportBtn');
  unresolvedContainer = document.getElementById('voiceDictionaryUnresolved');

  if (!phraseInput || !targetSelect || !addButton || !listContainer) {
    return;
  }

  populateTargetOptions();
  renderDictionaryEntries();
  renderUnresolvedPhrases();

  addButton.addEventListener('click', handleAddDictionaryEntry);
  targetSelect.addEventListener('change', () => clearMessage());

  if (exportButton) {
    exportButton.addEventListener('click', handleExportDictionary);
  }
  if (importButton) {
    importButton.addEventListener('click', handleImportDictionary);
  }
}

function populateTargetOptions() {
  targetSelect.innerHTML = '';
  const optionPlaceholder = document.createElement('option');
  optionPlaceholder.value = '';
  optionPlaceholder.textContent = '設定キーを選択してください';
  targetSelect.appendChild(optionPlaceholder);

  Object.values(SETTINGS_VOICE_MAP).forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.key;
    option.textContent = entry.label;
    targetSelect.appendChild(option);
  });
}

function renderDictionaryEntries() {
  const entries = getVoiceDictionaryEntries();
  listContainer.innerHTML = '';

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dictionary-empty';
    empty.textContent = '登録されたカスタムフレーズはありません';
    listContainer.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'dictionary-entry';

    const label = document.createElement('span');
    label.className = 'dictionary-phrase';
    label.textContent = entry.phrase;
    item.appendChild(label);

    const keyBadge = document.createElement('span');
    keyBadge.className = 'dictionary-key';
    keyBadge.textContent = entry.key;
    item.appendChild(keyBadge);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-secondary';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', () => {
      removeVoiceDictionaryEntry(entry.id);
      renderDictionaryEntries();
      renderUnresolvedPhrases();
      showMessage(`「${entry.phrase}」を削除しました`, 'info');
    });
    item.appendChild(removeBtn);

    listContainer.appendChild(item);
  });
}

function renderUnresolvedPhrases() {
  if (!unresolvedContainer) {
    return;
  }
  const unresolved = getUnresolvedPhrases();
  unresolvedContainer.innerHTML = '';
  if (unresolved.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'unresolved-empty';
    empty.textContent = '未解決のフレーズはありません';
    unresolvedContainer.appendChild(empty);
    return;
  }

  unresolved.forEach((phrase) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'unresolved-chip';
    chip.textContent = phrase;
    chip.addEventListener('click', () => {
      phraseInput.value = phrase;
      phraseInput.focus();
      clearUnresolvedPhrase(phrase);
      renderUnresolvedPhrases();
    });
    unresolvedContainer.appendChild(chip);
  });
}

function handleAddDictionaryEntry() {
  const phrase = phraseInput.value.trim();
  const key = targetSelect.value;
  if (!phrase || !key) {
    showMessage('フレーズと設定を選択してください', 'error');
    return;
  }
  const updated = addVoiceDictionaryEntry(phrase, key);
  renderDictionaryEntries();
  renderUnresolvedPhrases();
  phraseInput.value = '';
  targetSelect.value = '';
  showMessage(`「${phrase}」を ${key} に割り当てました`, 'success');
  return updated;
}

function handleExportDictionary() {
  const entries = getVoiceDictionaryEntries();
  const json = JSON.stringify(entries, null, 2);
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(() => {
      showMessage('辞書をクリップボードにコピーしました', 'success');
    }).catch(() => {
      showMessage(json, 'info');
    });
  } else {
    showMessage(json, 'info');
  }
}

function handleImportDictionary() {
  const currentEntries = getVoiceDictionaryEntries();
  const raw = window.prompt('インポートする JSON を貼り付けてください', JSON.stringify(currentEntries, null, 2));
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    setVoiceDictionaryEntries(parsed);
    renderDictionaryEntries();
    showMessage('辞書をインポートしました', 'success');
  } catch (error) {
    showMessage(error.message || 'JSON の読み込みに失敗しました', 'error');
  }
}

function showMessage(text, type) {
  if (!messageContainer) {
    return;
  }
  messageContainer.textContent = text;
  messageContainer.className = `voice-dictionary-message ${type}`;
  setTimeout(() => {
    if (messageContainer) {
      messageContainer.textContent = '';
      messageContainer.className = 'voice-dictionary-message';
    }
  }, 4000);
}

function clearMessage() {
  if (!messageContainer) {
    return;
  }
  messageContainer.textContent = '';
  messageContainer.className = 'voice-dictionary-message';
}
