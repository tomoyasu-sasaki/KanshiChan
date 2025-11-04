/**
 * スケジュール永続化サービス（メインプロセス）。
 * - schedules テーブルの CRUD を提供し、レンダラからの同期要求を処理する。
 */
const { run, all, transaction } = require('../db');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeDate(value, reference = new Date()) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = pad2(parsed.getMonth() + 1);
      const d = pad2(parsed.getDate());
      return `${y}-${m}-${d}`;
    }
  }
  const y = reference.getFullYear();
  const m = pad2(reference.getMonth() + 1);
  const d = pad2(reference.getDate());
  return `${y}-${m}-${d}`;
}

function normalizeTime(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(`1970-01-01T${trimmed}`);
    if (!Number.isNaN(parsed.getTime())) {
      return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
    }
  }
  return '00:00';
}

function sanitizeNullableText(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeTitle(input) {
  if (typeof input !== 'string') {
    return '予定';
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : '予定';
}

function coerceScheduleId(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return fallback;
}

function prepareScheduleForWrite(input, offset = 0) {
  const now = Date.now();
  const referenceDate = new Date(now);
  const id = coerceScheduleId(input?.id, now + offset);
  const updatedAt = now;
  const createdAtCandidate = Number(input?.createdAt);
  const createdAt = Number.isFinite(createdAtCandidate) ? createdAtCandidate : updatedAt;

  return {
    id,
    title: sanitizeTitle(input?.title),
    description: sanitizeNullableText(input?.description),
    date: normalizeDate(input?.date, referenceDate),
    time: normalizeTime(input?.time),
    repeatConfig: input?.repeat ? JSON.stringify(input.repeat) : null,
    notified: Boolean(input?.notified) ? 1 : 0,
    preNotified: Boolean(input?.preNotified) ? 1 : 0,
    startNotified: Boolean(input?.startNotified) ? 1 : 0,
    ttsMessage: sanitizeNullableText(input?.ttsMessage),
    ttsLeadMessage: sanitizeNullableText(input?.ttsLeadMessage),
    lastOccurrenceKey: sanitizeNullableText(input?.lastOccurrenceKey),
    createdAt,
    updatedAt,
  };
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    date: row.date,
    time: row.time,
    repeat: row.repeat_config ? safeJsonParse(row.repeat_config) : null,
    notified: Boolean(row.notified),
    preNotified: Boolean(row.pre_notified),
    startNotified: Boolean(row.start_notified),
    ttsMessage: row.tts_message || null,
    ttsLeadMessage: row.tts_lead_message || null,
    lastOccurrenceKey: row.last_occurrence_key || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJsonParse(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('[Schedules] failed to parse repeat_config JSON:', error);
    return null;
  }
}

async function listSchedules(options = {}) {
  const rows = await all(
    `SELECT * FROM schedules
     ORDER BY date ASC, time ASC, id ASC`
  );
  const items = rows.map(mapRow);
  if (options.withoutMeta) {
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date,
      time: item.time,
      description: item.description,
      repeat: item.repeat,
      notified: item.notified,
      preNotified: item.preNotified,
      startNotified: item.startNotified,
      ttsMessage: item.ttsMessage,
      ttsLeadMessage: item.ttsLeadMessage,
      lastOccurrenceKey: item.lastOccurrenceKey,
    }));
  }
  return items;
}

const UPSERT_SQL = `
  INSERT INTO schedules (
    id, title, description, date, time, repeat_config,
    notified, pre_notified, start_notified,
    tts_message, tts_lead_message, last_occurrence_key,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    date = excluded.date,
    time = excluded.time,
    repeat_config = excluded.repeat_config,
    notified = excluded.notified,
    pre_notified = excluded.pre_notified,
    start_notified = excluded.start_notified,
    tts_message = excluded.tts_message,
    tts_lead_message = excluded.tts_lead_message,
    last_occurrence_key = excluded.last_occurrence_key,
    updated_at = excluded.updated_at
`;

async function replaceAllSchedules(schedules = []) {
  const prepared = schedules.map((schedule, index) => prepareScheduleForWrite(schedule, index));
  await transaction(async () => {
    for (const record of prepared) {
      await run(UPSERT_SQL, [
        record.id,
        record.title,
        record.description,
        record.date,
        record.time,
        record.repeatConfig,
        record.notified,
        record.preNotified,
        record.startNotified,
        record.ttsMessage,
        record.ttsLeadMessage,
        record.lastOccurrenceKey,
        record.createdAt,
        record.updatedAt,
      ]);
    }

    if (prepared.length === 0) {
      await run('DELETE FROM schedules');
      return;
    }

    const ids = prepared.map((record) => record.id);
    const placeholders = ids.map(() => '?').join(', ');
    await run(`DELETE FROM schedules WHERE id NOT IN (${placeholders})`, ids);
  });

  return listSchedules();
}

async function upsertSchedule(schedule) {
  const [saved] = await upsertSchedules([schedule]);
  return saved;
}

async function upsertSchedules(schedules = []) {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return listSchedules();
  }
  const prepared = schedules.map((schedule, index) => prepareScheduleForWrite(schedule, index));
  await transaction(async () => {
    for (const record of prepared) {
      await run(UPSERT_SQL, [
        record.id,
        record.title,
        record.description,
        record.date,
        record.time,
        record.repeatConfig,
        record.notified,
        record.preNotified,
        record.startNotified,
        record.ttsMessage,
        record.ttsLeadMessage,
        record.lastOccurrenceKey,
        record.createdAt,
        record.updatedAt,
      ]);
    }
  });

  const ids = prepared.map((record) => record.id);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await all(
    `SELECT * FROM schedules WHERE id IN (${placeholders})
     ORDER BY date ASC, time ASC, id ASC`,
    ids
  );
  return rows.map(mapRow);
}

async function deleteSchedule(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    throw new Error('schedule id が不正です');
  }
  await run('DELETE FROM schedules WHERE id = ?', [numericId]);
  return { id: numericId };
}

module.exports = {
  listSchedules,
  replaceAllSchedules,
  upsertSchedule,
  upsertSchedules,
  deleteSchedule,
};
