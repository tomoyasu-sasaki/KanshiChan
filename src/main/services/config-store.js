/**
 * シンプルな JSON ベースの設定ストア。
 * - Electron の userData 配下に config.json を生成し、キー単位で読み書きする。
 */
const fs = require('fs');
const path = require('path');

function ensureDirExists(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 不在許可エントリのフォーマットを正規化する。
 * - 永続化データの前方互換を維持するため、欠落フィールドに既定値を補完する。
 * @param {Object} raw
 * @returns {Object|null}
 */
function sanitizeAbsenceOverride(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const now = Date.now();
  const normalized = {
    reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : '一時的な不在',
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : now,
    expiresAt: Number.isFinite(raw.expiresAt) ? raw.expiresAt : null,
    endedAt: Number.isFinite(raw.endedAt) ? raw.endedAt : null,
    manualEnd: typeof raw.manualEnd === 'boolean' ? raw.manualEnd : null,
    presetId: typeof raw.presetId === 'string' && raw.presetId.trim() ? raw.presetId.trim() : null,
    durationMinutes: Number.isFinite(raw.durationMinutes) ? raw.durationMinutes : null,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
    createdBy: typeof raw.createdBy === 'string' && raw.createdBy.trim() ? raw.createdBy.trim() : 'user',
    eventId: Number.isInteger(raw.eventId) ? raw.eventId : null,
  };

  if (normalized.endedAt && normalized.manualEnd === null) {
    normalized.manualEnd = true;
  }

  return normalized;
}

/**
 * 履歴配列を正規化し、時系列順に並び替える。
 * @param {Array} rawHistory
 * @returns {Array}
 */
function sanitizeAbsenceOverrideHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }
  return rawHistory
    .map(sanitizeAbsenceOverride)
    .filter(Boolean)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

function createConfigStore(app) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let cache = null;

  function load() {
    if (cache) {
      return cache;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      cache = JSON.parse(raw);
    } catch (error) {
      // 新規ファイル or 破損時は空オブジェクト扱い
      cache = {};
    }
    return cache;
  }

  function save(data) {
    cache = data;
    ensureDirExists(configPath);
    fs.writeFileSync(configPath, JSON.stringify(cache, null, 2), 'utf-8');
    return cache;
  }

  function getAll() {
    return { ...load() };
  }

  function get(key, defaultValue = undefined) {
    const data = load();
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaultValue;
  }

  function set(key, value) {
    const data = load();
    const next = { ...data, [key]: value };
    save(next);
    return next[key];
  }

  function update(partial = {}) {
    const data = load();
    const next = { ...data, ...partial };
    save(next);
    return next;
  }

  /**
   * 現在の不在許可状態を返す。期限切れは既定で除外する。
   * @param {{includeExpired?:boolean}} options
   * @returns {Object|null}
   */
  function getAbsenceOverride(options = {}) {
    const { includeExpired = false } = options;
    const data = load();
    const current = sanitizeAbsenceOverride(data.absenceOverride);
    if (!current) {
      return null;
    }

    const now = Date.now();
    const isExpired =
      (Number.isFinite(current.expiresAt) && current.expiresAt <= now) ||
      (Number.isFinite(current.endedAt) && current.endedAt <= now);

    if (isExpired && !includeExpired) {
      return null;
    }

    return current;
  }

  /**
   * 不在許可を上書き保存する。既存状態は呼び出し元で退避済みであることを想定。
   * @param {Object} overridePayload
   * @returns {Object}
   */
  function setAbsenceOverride(overridePayload) {
    const normalized = sanitizeAbsenceOverride({ ...overridePayload, endedAt: null });
    const data = load();
    const next = { ...data, absenceOverride: normalized };
    save(next);
    return normalized;
  }

  /**
   * 現在の不在許可を関数形式で更新する。null を返すと削除扱い。
   * @param {Function} updater
   * @returns {Object|null}
   */
  function updateAbsenceOverride(updater) {
    if (typeof updater !== 'function') {
      throw new Error('updateAbsenceOverride requires updater function');
    }
    const data = load();
    const current = sanitizeAbsenceOverride(data.absenceOverride);
    const updated = updater(current);
    if (!updated) {
      const next = { ...data, absenceOverride: null };
      save(next);
      return null;
    }
    const normalized = sanitizeAbsenceOverride(updated);
    const next = { ...data, absenceOverride: normalized };
    save(next);
    return normalized;
  }

  /**
   * 不在許可を削除する。存在しない場合は null を返す。
   * @returns {null}
   */
  function clearAbsenceOverride() {
    const data = load();
    if (!data.absenceOverride) {
      return null;
    }
    const next = { ...data, absenceOverride: null };
    save(next);
    return null;
  }

  /**
   * sanitize 済みの履歴配列を取得する。
   * @returns {Array}
   */
  function getAbsenceOverrideHistory() {
    const data = load();
    return sanitizeAbsenceOverrideHistory(data.absenceOverrideHistory);
  }

  /**
   * 履歴にエントリを追加（同一 startedAt は上書き）。
   * @param {Object} entry
   * @returns {Array}
   */
  function appendAbsenceOverrideHistory(entry) {
    const normalized = sanitizeAbsenceOverride(entry);
    if (!normalized) {
      return getAbsenceOverrideHistory();
    }
    const data = load();
    const history = sanitizeAbsenceOverrideHistory(data.absenceOverrideHistory);
    const nextHistory = [...history.filter((item) => item.startedAt !== normalized.startedAt), normalized];
    const next = { ...data, absenceOverrideHistory: nextHistory };
    save(next);
    return nextHistory;
  }

  /**
   * 現在の不在許可が期限切れなら履歴へ移行し、最新状態を返す。
   * @param {number} [referenceTime]
   * @returns {{current:Object|null, archived:Object|null}}
   */
  function pruneExpiredAbsenceOverride(referenceTime = Date.now()) {
    const data = load();
    const current = sanitizeAbsenceOverride(data.absenceOverride);
    if (!current) {
      return { current: null, archived: null };
    }

    const isActive =
      !Number.isFinite(current.endedAt) &&
      !(Number.isFinite(current.expiresAt) && current.expiresAt <= referenceTime);

    if (isActive) {
      return { current, archived: null };
    }

    const endedAt = Number.isFinite(current.endedAt)
      ? current.endedAt
      : Number.isFinite(current.expiresAt)
        ? current.expiresAt
        : referenceTime;

    const archived = {
      ...current,
      endedAt,
      manualEnd: current.manualEnd === null ? false : current.manualEnd,
    };

    appendAbsenceOverrideHistory(archived);
    clearAbsenceOverride();
    return { current: null, archived };
  }

  return {
    getAll,
    get,
    set,
    update,
    getAbsenceOverride,
    setAbsenceOverride,
    updateAbsenceOverride,
    clearAbsenceOverride,
    getAbsenceOverrideHistory,
    appendAbsenceOverrideHistory,
    pruneExpiredAbsenceOverride,
    path: configPath,
  };
}

module.exports = {
  createConfigStore,
};
