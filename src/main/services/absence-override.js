/**
 * 不在許可 (absence override) 状態管理。
 * - 設定ストアと SQLite を同期し、イベント通知と期限切れ処理を担当する。
 */
const { EventEmitter } = require('events');
const { run } = require('../db');

/**
 * 不在許可の現在値を通知しつつ永続化するマネージャを生成する。
 * - configStore を真実のソースとし、SQLite ログは監査・ダッシュボード向けに記録する。
 * - clock はテスト注入を想定したオプションで、デフォルトは Date.now。
 * @param {Object} params
 * @param {ReturnType<typeof import('./config-store').createConfigStore>} params.configStore
 * @param {Function} [params.clock]
 * @returns {Object} API set (activateOverride / extendOverride / clearOverride / getState / on ...)
 */
function createAbsenceOverrideManager({ configStore, clock = () => Date.now() }) {
  if (!configStore) {
    throw new Error('configStore is required to create absence override manager');
  }

  const emitter = new EventEmitter();

  const initialPrune = configStore.pruneExpiredAbsenceOverride(clock());
  if (initialPrune.archived) {
    syncArchivedEntry(initialPrune.archived).catch((error) => {
      console.error('[AbsenceOverride] 初期同期失敗:', error);
    });
  }

  function isActive(entry, now) {
    if (!entry) {
      return false;
    }
    if (Number.isFinite(entry.endedAt)) {
      return false;
    }
    if (Number.isFinite(entry.expiresAt) && entry.expiresAt <= now) {
      return false;
    }
    return true;
  }

  function manualFlagToInt(flag) {
    if (flag === null || flag === undefined) {
      return null;
    }
    return flag ? 1 : 0;
  }

  /**
   * 履歴エントリを absence_override_events テーブルと同期する。
   * - configStore の履歴はメモリ上の参照を持つため、DB 側と差分が出た場合は UPDATE を優先する。
   * - DB 書き込みに失敗した場合でも処理全体は継続する（ログに記録して復帰）。
   * @param {Object|null} entry
   * @returns {Promise<Object|null>} eventId を補完した履歴エントリ
   */
  async function syncArchivedEntry(entry) {
    if (!entry) {
      return entry;
    }
    const now = clock();
    const payload = {
      startedAt: Number.isFinite(entry.startedAt) ? entry.startedAt : now,
      endedAt: Number.isFinite(entry.endedAt) ? entry.endedAt : null,
      expiresAt: Number.isFinite(entry.expiresAt) ? entry.expiresAt : null,
      reason: entry.reason || '一時的な不在',
      presetId: entry.presetId || null,
      durationMinutes: Number.isFinite(entry.durationMinutes) ? entry.durationMinutes : null,
      manualEnd: manualFlagToInt(entry.manualEnd),
      note: entry.note || null,
      createdBy: entry.createdBy || 'user',
      createdAt: Number.isFinite(entry.startedAt) ? entry.startedAt : now,
      eventId: Number.isInteger(entry.eventId) ? entry.eventId : null,
    };

    try {
      let eventId = payload.eventId;
      if (eventId) {
        const result = await run(
          `UPDATE absence_override_events
           SET started_at = COALESCE(started_at, ?),
               ended_at = ?,
               expires_at = ?,
               manual_end = ?,
               note = COALESCE(?, note),
               preset_id = COALESCE(?, preset_id),
               duration_minutes = COALESCE(?, duration_minutes),
               reason = COALESCE(?, reason),
               created_by = COALESCE(?, created_by)
           WHERE id = ?`,
          [
            payload.startedAt,
            payload.endedAt,
            payload.expiresAt,
            payload.manualEnd,
            payload.note,
            payload.presetId,
            payload.durationMinutes,
            payload.reason,
            payload.createdBy,
            eventId,
          ]
        );

        if (result.changes === 0) {
          eventId = null;
        }
      }

      if (!eventId) {
        const insertResult = await run(
          `INSERT INTO absence_override_events
             (started_at, ended_at, expires_at, reason, preset_id, duration_minutes, manual_end, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.startedAt,
            payload.endedAt,
            payload.expiresAt,
            payload.reason,
            payload.presetId,
            payload.durationMinutes,
            payload.manualEnd,
            payload.note,
            payload.createdBy,
            payload.createdAt,
          ]
        );
        eventId = insertResult?.lastID || null;
      }

      return {
        ...entry,
        eventId,
        endedAt: payload.endedAt,
        manualEnd: entry.manualEnd,
      };
    } catch (error) {
      console.error('[AbsenceOverride] イベント同期に失敗:', error);
      return entry;
    }
  }

  /**
   * 現在の許可状態を終了させ履歴へ移す。確定終了時にのみ呼び出す。
   * @param {Object} [options]
   * @param {boolean} [options.manualEnd]
   * @param {number} [options.endedAt]
   * @param {string|null} [options.note]
   * @returns {Promise<Object|null>} 同期済み履歴エントリ
   */
  async function archiveCurrentEntry(options = {}) {
    const now = clock();
    const current = configStore.getAbsenceOverride({ includeExpired: true });
    if (!current) {
      return null;
    }

    const endedAt = Number.isFinite(options.endedAt) ? options.endedAt : now;
    const manualEnd = options.manualEnd === undefined ? true : options.manualEnd;
    const note = options.note != null ? options.note : current.note;

    const archived = {
      ...current,
      endedAt,
      manualEnd,
      note,
    };

    const synced = await syncArchivedEntry(archived);
    configStore.appendAbsenceOverrideHistory(synced);
    configStore.clearAbsenceOverride();
    return synced;
  }

  /**
   * 現在の許可が期限切れになっていれば自動で終了させる。
   * @param {number} [now]
   * @returns {Promise<{expired:boolean,current:Object|null,archived:Object|null}>}
   */
  async function ensureExpiredState(now = clock()) {
    const current = configStore.getAbsenceOverride({ includeExpired: true });
    if (!current) {
      return { expired: false, current: null, archived: null };
    }

    if (isActive(current, now)) {
      return { expired: false, current, archived: null };
    }

    const endedAt = Number.isFinite(current.expiresAt) ? current.expiresAt : now;
    const archived = await archiveCurrentEntry({ manualEnd: false, endedAt });
    return { expired: true, current: null, archived };
  }

  /**
   * 現在の許可状態を取得する。必要に応じて期限切れを掃除する。
   * @returns {Promise<{active:boolean,current:Object|null,remainingMs:number|null,history:Array,timestamp:number}>}
   */
  async function getState() {
    const now = clock();
    await ensureExpiredState(now);
    const raw = configStore.getAbsenceOverride({ includeExpired: true });
    const active = isActive(raw, now);
    const remainingMs = active && Number.isFinite(raw?.expiresAt) ? Math.max(raw.expiresAt - now, 0) : null;

    return {
      active,
      current: active ? raw : null,
      raw,
      remainingMs,
      history: configStore.getAbsenceOverrideHistory(),
      timestamp: now,
    };
  }

  /**
   * 変更通知を購読者へ伝搬する。非同期 getState の結果を配信する。
   * @param {string|null} type 個別イベント名（activate / clear など）
   * @param {Object|null} context 追加メタ情報
   */
  function emitChange(type, context = null) {
    getState().then((state) => {
      emitter.emit('change', state, context);
      if (type) {
        emitter.emit(type, state, context);
      }
    });
  }

  /**
   * 新しい不在許可を開始する。既存の許可があれば明示的に履歴へ退避させる。
   * @param {Object} payload
   * @param {string} [payload.reason]
   * @param {number} [payload.durationMinutes]
   * @param {number} [payload.startedAt]
   * @param {number} [payload.expiresAt]
   * @param {string|null} [payload.presetId]
   * @returns {Promise<{active:boolean,current:Object|null}>}
   */
  async function activateOverride(payload = {}) {
    const now = clock();
    await ensureExpiredState(now);

    const startedAt = Number.isFinite(payload.startedAt) ? payload.startedAt : now;
    const durationMinutes = Number.isFinite(payload.durationMinutes) ? payload.durationMinutes : null;
    const expiresAt = Number.isFinite(payload.expiresAt)
      ? payload.expiresAt
      : durationMinutes != null
        ? startedAt + durationMinutes * 60 * 1000
        : null;

    await archiveCurrentEntry({ manualEnd: true, endedAt: now });

    let eventId = null;
    try {
      const insertResult = await run(
        `INSERT INTO absence_override_events
           (started_at, ended_at, expires_at, reason, preset_id, duration_minutes, manual_end, note, created_by, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          startedAt,
          expiresAt,
          payload.reason || '一時的な不在',
          payload.presetId || null,
          durationMinutes,
          payload.note || null,
          payload.createdBy || 'user',
          now,
        ]
      );
      eventId = insertResult?.lastID || null;
    } catch (error) {
      console.error('[AbsenceOverride] 新規イベント作成エラー:', error);
    }

    configStore.setAbsenceOverride({
      reason: payload.reason,
      startedAt,
      expiresAt,
      manualEnd: null,
      endedAt: null,
      presetId: payload.presetId || null,
      durationMinutes,
      note: payload.note || null,
      createdBy: payload.createdBy || 'user',
      eventId,
    });

    emitChange('activate');
    return getState();
  }

  /**
   * 現在の許可の終了予定を延長または再計算する。
   * @param {Object} payload
   * @param {number} [payload.durationMinutes]
   * @param {number} [payload.expiresAt]
   * @param {string|null} [payload.note]
   * @returns {Promise<{active:boolean,current:Object|null}>}
   */
  async function extendOverride(payload = {}) {
    const now = clock();
    const current = configStore.getAbsenceOverride({ includeExpired: true });
    if (!current || !isActive(current, now)) {
      await ensureExpiredState(now);
      return getState();
    }

    const durationMinutes = Number.isFinite(payload.durationMinutes) ? payload.durationMinutes : current.durationMinutes;
    const expiresAt = Number.isFinite(payload.expiresAt)
      ? payload.expiresAt
      : durationMinutes != null
        ? now + durationMinutes * 60 * 1000
        : current.expiresAt;
    const note = payload.note != null ? payload.note : current.note;

    if (current.eventId) {
      try {
        await run(
          `UPDATE absence_override_events
             SET expires_at = ?, duration_minutes = ?, note = COALESCE(?, note)
           WHERE id = ?`,
          [expiresAt, durationMinutes, note, current.eventId]
        );
      } catch (error) {
        console.error('[AbsenceOverride] 期限延長エラー:', error);
      }
    }

    configStore.updateAbsenceOverride((existing) => {
      if (!existing) {
        return current;
      }
      return {
        ...existing,
        expiresAt,
        durationMinutes,
        note,
      };
    });

    emitChange('extend');
    return getState();
  }

  /**
   * 現在の許可を手動で終了させる。終了理由は履歴に反映される。
   * @param {Object} [options]
  * @param {boolean} [options.manualEnd]
   * @param {number} [options.endedAt]
   * @param {string|null} [options.note]
   * @returns {Promise<{active:boolean,current:Object|null}>}
   */
  async function clearOverride(options = {}) {
    const manualEnd = options.manualEnd === undefined ? true : options.manualEnd;
    const endedAt = Number.isFinite(options.endedAt) ? options.endedAt : clock();
    const archived = await archiveCurrentEntry({ manualEnd, endedAt, note: options.note });
    emitChange('clear', { archived });
    return getState();
  }

  /**
   * 定期実行向けのヘルパー。期限切れを掃除して必要なら expire を投げる。
   * @returns {Promise<{active:boolean,current:Object|null}>}
   */
  async function sweepExpired() {
    const result = await ensureExpiredState(clock());
    if (result.expired) {
      emitChange('expire', { archived: result.archived });
    }
    return getState();
  }

  function getHistorySync() {
    return configStore.getAbsenceOverrideHistory();
  }

  function on(eventName, handler) {
    emitter.on(eventName, handler);
    return () => emitter.off(eventName, handler);
  }

  function dispose() {
    emitter.removeAllListeners();
  }

  return {
    getState,
    activateOverride,
    extendOverride,
    clearOverride,
    sweepExpired,
    getHistory: getHistorySync,
    on,
    dispose,
  };
}

module.exports = {
  createAbsenceOverrideManager,
};
