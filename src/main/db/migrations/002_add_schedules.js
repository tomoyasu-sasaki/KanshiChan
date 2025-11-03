const fs = require('fs');
const path = require('path');

const TASK_PRIORITY_VALUES = "('low','medium','high')";
const TASK_STATUS_VALUES = "('todo','in_progress','done')";

function boolToInt(value) {
  return value ? 1 : 0;
}

function sanitizeText(input, { fallback = '' } = {}) {
  if (typeof input !== 'string') {
    return fallback;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeNullableText(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTodayISODate(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  return `${y}-${m}-${d}`;
}

function normalizeDate(value, now = new Date()) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return getTodayISODate(parsed);
    }
  }
  return getTodayISODate(now);
}

function normalizeTime(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(`1970-01-01T${trimmed}`);
    if (!Number.isNaN(parsed.getTime())) {
      const hours = pad2(parsed.getHours());
      const minutes = pad2(parsed.getMinutes());
      return `${hours}:${minutes}`;
    }
  }
  return '00:00';
}

function normalizeSchedule(raw, index = 0, now = Date.now()) {
  const numericId = Number(raw?.id);
  const id = Number.isFinite(numericId) ? numericId : now + index;
  const nowDate = new Date(now);

  return {
    id,
    title: sanitizeText(raw?.title, { fallback: '予定' }),
    description: sanitizeNullableText(raw?.description),
    date: normalizeDate(raw?.date, nowDate),
    time: normalizeTime(raw?.time),
    repeatConfig: raw?.repeat ? JSON.stringify(raw.repeat) : null,
    notified: boolToInt(Boolean(raw?.notified)),
    preNotified: boolToInt(Boolean(raw?.preNotified)),
    startNotified: boolToInt(Boolean(raw?.startNotified)),
    ttsMessage: sanitizeNullableText(raw?.ttsMessage),
    ttsLeadMessage: sanitizeNullableText(raw?.ttsLeadMessage),
    lastOccurrenceKey: sanitizeNullableText(raw?.lastOccurrenceKey),
    createdAt: Number.isFinite(raw?.createdAt) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(raw?.updatedAt) ? Number(raw.updatedAt) : now,
  };
}

async function migrateScheduleCache(app, run) {
  if (!app?.getPath) {
    return;
  }

  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (!fs.existsSync(configPath)) {
    return;
  }

  let data;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    data = JSON.parse(raw);
  } catch (error) {
    console.warn('[Migration] Failed to read config.json for schedule migration:', error);
    return;
  }

  const rawSchedules = Array.isArray(data?.scheduleCache) ? data.scheduleCache : [];
  if (rawSchedules.length === 0) {
    return;
  }

  const now = Date.now();
  for (let i = 0; i < rawSchedules.length; i += 1) {
    const normalized = normalizeSchedule(rawSchedules[i], i, now);
    await run(
      `INSERT INTO schedules (
        id, title, description, date, time, repeat_config, notified, pre_notified, start_notified,
        tts_message, tts_lead_message, last_occurrence_key, created_at, updated_at
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
        updated_at = excluded.updated_at`,
      [
        normalized.id,
        normalized.title,
        normalized.description,
        normalized.date,
        normalized.time,
        normalized.repeatConfig,
        normalized.notified,
        normalized.preNotified,
        normalized.startNotified,
        normalized.ttsMessage,
        normalized.ttsLeadMessage,
        normalized.lastOccurrenceKey,
        normalized.createdAt,
        normalized.updatedAt,
      ]
    );
  }

  try {
    const nextData = { ...data, scheduleCache: [], scheduleCacheMigratedAt: now };
    fs.writeFileSync(configPath, JSON.stringify(nextData, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Migration] Failed to update config.json after schedule migration:', error);
  }
}

async function ensureTaskForeignKey(run, all) {
  const foreignKeys = await all("PRAGMA foreign_key_list('tasks')");
  const hasScheduleFk = foreignKeys.some((row) => row?.table === 'schedules');
  if (hasScheduleFk) {
    return;
  }

  await run(
    'UPDATE tasks SET schedule_id = NULL WHERE schedule_id IS NOT NULL AND schedule_id NOT IN (SELECT id FROM schedules)'
  );

  await run('PRAGMA foreign_keys = OFF');
  try {
    await run(
      `CREATE TABLE IF NOT EXISTS tasks__migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ${TASK_PRIORITY_VALUES}),
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ${TASK_STATUS_VALUES}),
        start_date INTEGER,
        end_date INTEGER,
        schedule_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL ON UPDATE CASCADE
      )`
    );

    await run(
      `INSERT INTO tasks__migration (id, title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at)
       SELECT id, title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at FROM tasks`
    );

    await run('DROP TABLE tasks');
    await run('ALTER TABLE tasks__migration RENAME TO tasks');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks(start_date, end_date)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)');
  } finally {
    await run('PRAGMA foreign_keys = ON');
  }
}

module.exports = {
  id: '002_add_schedules',
  name: 'Add schedules table and tasks->schedules foreign key',
  async up({ app, run, all }) {
    await run(
      `CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        repeat_config TEXT,
        notified INTEGER NOT NULL DEFAULT 0,
        pre_notified INTEGER NOT NULL DEFAULT 0,
        start_notified INTEGER NOT NULL DEFAULT 0,
        tts_message TEXT,
        tts_lead_message TEXT,
        last_occurrence_key TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    );

    await run('CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date, time)');
    await run('CREATE INDEX IF NOT EXISTS idx_schedules_last_occurrence ON schedules(last_occurrence_key)');

    await migrateScheduleCache(app, run);
    await ensureTaskForeignKey(run, all);
  },
  async down({ run, all }) {
    await run('PRAGMA foreign_keys = OFF');
    try {
      await run(
        `CREATE TABLE IF NOT EXISTS tasks__rollback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ${TASK_PRIORITY_VALUES}),
          status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ${TASK_STATUS_VALUES}),
          start_date INTEGER,
          end_date INTEGER,
          schedule_id INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      );

      await run(
        `INSERT INTO tasks__rollback (id, title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at)
         SELECT id, title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at FROM tasks`
      );

      await run('DROP TABLE tasks');
      await run('ALTER TABLE tasks__rollback RENAME TO tasks');
      await run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      await run('CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks(start_date, end_date)');
      await run('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)');
    } finally {
      await run('PRAGMA foreign_keys = ON');
    }

    await run('DROP INDEX IF EXISTS idx_schedules_last_occurrence');
    await run('DROP INDEX IF EXISTS idx_schedules_date');
    await run('DROP TABLE IF EXISTS schedules');
  }
};
