const TASK_PRIORITY_VALUES = "('low','medium','high')";
const TASK_STATUS_VALUES = "('todo','in_progress','done')";

function toLowerMessage(error) {
  return (error?.message || '').toLowerCase();
}

async function runStatements(run, statements) {
  for (const sql of statements) {
    await run(sql);
  }
}

async function ensureTaskColumns(run, all) {
  const rows = await all('PRAGMA table_info(tasks)');
  const columnNames = new Set(rows.map((row) => row.name));
  const alters = [];

  if (!columnNames.has('schedule_id')) alters.push('ALTER TABLE tasks ADD COLUMN schedule_id INTEGER');
  if (!columnNames.has('created_at')) alters.push('ALTER TABLE tasks ADD COLUMN created_at INTEGER');
  if (!columnNames.has('updated_at')) alters.push('ALTER TABLE tasks ADD COLUMN updated_at INTEGER');
  if (!columnNames.has('priority')) alters.push("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'");
  if (!columnNames.has('status')) alters.push("ALTER TABLE tasks ADD COLUMN status TEXT DEFAULT 'todo'");
  if (!columnNames.has('start_date')) alters.push('ALTER TABLE tasks ADD COLUMN start_date INTEGER');
  if (!columnNames.has('end_date')) alters.push('ALTER TABLE tasks ADD COLUMN end_date INTEGER');

  for (const alter of alters) {
    try {
      await run(alter);
    } catch (error) {
      if (!toLowerMessage(error).includes('duplicate column name')) {
        throw error;
      }
    }
  }
}

module.exports = {
  id: '001_initial_schema',
  name: 'Initial analytics and tasks schema',
  async up({ run, all }) {
    await runStatements(run, [
      `CREATE TABLE IF NOT EXISTS detection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        detected_at INTEGER NOT NULL,
        type TEXT NOT NULL,
        duration_seconds INTEGER,
        meta TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS idx_detection_logs_detected_at ON detection_logs(detected_at)',
      `CREATE TABLE IF NOT EXISTS app_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        title TEXT,
        domain TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_app_usage_logs_started_at ON app_usage_logs(started_at)',
      'CREATE INDEX IF NOT EXISTS idx_app_usage_logs_app_name ON app_usage_logs(app_name)',
      `CREATE TABLE IF NOT EXISTS slack_report_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scheduled_for INTEGER,
        sent_at INTEGER,
        status TEXT NOT NULL,
        reason TEXT,
        message TEXT,
        error TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS idx_slack_report_logs_sent_at ON slack_report_logs(sent_at DESC)',
      `CREATE TABLE IF NOT EXISTS typing_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start INTEGER NOT NULL,
        bucket_end INTEGER NOT NULL,
        key_presses INTEGER NOT NULL,
        longest_streak_seconds INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_typing_activity_bucket ON typing_activity_logs(bucket_start)',
      `CREATE TABLE IF NOT EXISTS system_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        meta TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS idx_system_events_occurred_at ON system_events(occurred_at DESC)',
      `CREATE TABLE IF NOT EXISTS absence_override_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        expires_at INTEGER,
        reason TEXT,
        preset_id TEXT,
        duration_minutes INTEGER,
        manual_end INTEGER,
        note TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_absence_override_started_at ON absence_override_events(started_at)',
      'CREATE INDEX IF NOT EXISTS idx_absence_override_ended_at ON absence_override_events(ended_at)',
      `CREATE TABLE IF NOT EXISTS tasks (
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
      )`,
      'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks(start_date, end_date)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)'
    ]);

    await ensureTaskColumns(run, all);
  },
  async down({ run }) {
    await run('DROP TABLE IF EXISTS tasks');
    await run('DROP TABLE IF EXISTS absence_override_events');
    await run('DROP TABLE IF EXISTS system_events');
    await run('DROP TABLE IF EXISTS typing_activity_logs');
    await run('DROP TABLE IF EXISTS slack_report_logs');
    await run('DROP TABLE IF EXISTS app_usage_logs');
    await run('DROP TABLE IF EXISTS detection_logs');
  }
};
