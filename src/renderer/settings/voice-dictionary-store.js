const STORAGE_KEY = 'settingsVoiceDictionary';
const UNRESOLVED_STORAGE_KEY = 'settingsVoiceUnresolved';

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }
    return parsed;
  } catch (error) {
    console.warn('[VoiceDictionary] ストレージ読込に失敗:', error);
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[VoiceDictionary] ストレージ保存に失敗:', error);
  }
}

function normalizePhrase(phrase) {
  return String(phrase || '').trim().toLowerCase();
}

export function getVoiceDictionaryEntries() {
  const data = loadFromStorage(STORAGE_KEY, { entries: [] });
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries
    .map((entry) => ({
      id: entry.id || cryptoRandomId(),
      phrase: String(entry.phrase || ''),
      key: String(entry.key || ''),
      createdAt: entry.createdAt || Date.now(),
    }))
    .filter((entry) => entry.phrase && entry.key);
}

export function setVoiceDictionaryEntries(entries) {
  const sanitized = Array.isArray(entries)
    ? entries.map((entry) => ({
        id: entry.id || cryptoRandomId(),
        phrase: String(entry.phrase || ''),
        key: String(entry.key || ''),
        createdAt: entry.createdAt || Date.now(),
      })).filter((entry) => entry.phrase && entry.key)
    : [];
  saveToStorage(STORAGE_KEY, { entries: pruneVoiceDictionary(sanitized) });
}

export function addVoiceDictionaryEntry(phrase, key) {
  const normalizedPhrase = normalizePhrase(phrase);
  if (!normalizedPhrase || !key) {
    return getVoiceDictionaryEntries();
  }

  const entries = getVoiceDictionaryEntries();
  const existingIndex = entries.findIndex((entry) => normalizePhrase(entry.phrase) === normalizedPhrase);
  if (existingIndex >= 0) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      phrase,
      key,
      createdAt: Date.now(),
    };
  } else {
    entries.push({ id: cryptoRandomId(), phrase, key, createdAt: Date.now() });
  }

  const pruned = pruneVoiceDictionary(entries);
  saveToStorage(STORAGE_KEY, { entries: pruned });
  clearUnresolvedPhrase(normalizedPhrase);
  return pruned;
}

export function removeVoiceDictionaryEntry(entryId) {
  const entries = getVoiceDictionaryEntries().filter((entry) => entry.id !== entryId);
  saveToStorage(STORAGE_KEY, { entries });
  return entries;
}

export function findKeyForPhrase(phrase) {
  const normalized = normalizePhrase(phrase);
  if (!normalized) {
    return null;
  }
  const entries = getVoiceDictionaryEntries();
  const hit = entries.find((entry) => normalizePhrase(entry.phrase) === normalized);
  return hit ? hit.key : null;
}

export function recordUnresolvedPhrase(phrase) {
  const normalized = normalizePhrase(phrase);
  if (!normalized) {
    return;
  }
  const data = loadFromStorage(UNRESOLVED_STORAGE_KEY, { phrases: [] });
  const phrases = Array.isArray(data.phrases) ? data.phrases : [];
  if (!phrases.includes(normalized)) {
    phrases.push(normalized);
    saveToStorage(UNRESOLVED_STORAGE_KEY, { phrases: pruneUnresolvedPhrases(phrases) });
  }
}

export function getUnresolvedPhrases() {
  const data = loadFromStorage(UNRESOLVED_STORAGE_KEY, { phrases: [] });
  return Array.isArray(data.phrases) ? data.phrases : [];
}

export function clearUnresolvedPhrase(phrase) {
  const normalized = normalizePhrase(phrase);
  const phrases = getUnresolvedPhrases().filter((item) => item !== normalized);
  saveToStorage(UNRESOLVED_STORAGE_KEY, { phrases });
}

function pruneVoiceDictionary(entries, limit = 100) {
  const uniqueMap = new Map();
  entries.forEach((entry) => {
    const normalized = normalizePhrase(entry.phrase);
    if (!uniqueMap.has(normalized) || uniqueMap.get(normalized).createdAt < entry.createdAt) {
      uniqueMap.set(normalized, { ...entry, phrase: entry.phrase.trim() });
    }
  });
  return Array.from(uniqueMap.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

function pruneUnresolvedPhrases(phrases, limit = 50) {
  const unique = Array.from(new Set(phrases));
  if (unique.length <= limit) {
    return unique;
  }
  return unique.slice(unique.length - limit);
}

function cryptoRandomId() {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
