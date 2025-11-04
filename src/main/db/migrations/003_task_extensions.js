const TASK_PRIORITY_VALUES = "('low','medium','high')";
const TASK_STATUS_VALUES = "('todo','in_progress','done')";

async function recreateTasksTableWithExtensions(run) {
  await run('PRAGMA foreign_keys = OFF');
  try {
    await run(
      `CREATE TABLE IF NOT EXISTS tasks__v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ${TASK_PRIORITY_VALUES}),
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ${TASK_STATUS_VALUES}),
        start_date INTEGER,
        end_date INTEGER,
        schedule_id INTEGER,
        parent_task_id INTEGER,
        display_order INTEGER,
        repeat_config TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL ON UPDATE CASCADE
      )`
    );

    await run(
      `INSERT INTO tasks__v3 (
        id, title, description, priority, status, start_date, end_date,
        schedule_id, parent_task_id, display_order, repeat_config,
        created_at, updated_at
      )
      SELECT
        id,
        title,
        description,
        priority,
        status,
        start_date,
        end_date,
        schedule_id,
        NULL AS parent_task_id,
        COALESCE(updated_at, created_at, id) AS display_order,
        NULL AS repeat_config,
        created_at,
        updated_at
      FROM tasks`
    );

    await run('DROP TABLE tasks');
    await run('ALTER TABLE tasks__v3 RENAME TO tasks');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks(start_date, end_date)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_display_order ON tasks(parent_task_id, display_order)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(schedule_id)');
    // Prevent duplicate recurring task occurrences
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_unique_repeat_occurrence
      ON tasks(repeat_config, COALESCE(parent_task_id, 0), start_date)
      WHERE repeat_config IS NOT NULL AND start_date IS NOT NULL`);
  } finally {
    await run('PRAGMA foreign_keys = ON');
  }
}

async function dropTaskExtensions(run) {
  await run('PRAGMA foreign_keys = OFF');
  try {
    await run(
      `CREATE TABLE IF NOT EXISTS tasks__rollback_v3 (
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
      `INSERT INTO tasks__rollback_v3 (
        id, title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at)
       SELECT id, title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at FROM tasks`
    );

    await run('DROP TABLE tasks');
    await run('ALTER TABLE tasks__rollback_v3 RENAME TO tasks');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_period ON tasks(start_date, end_date)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)');
    await run('CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(schedule_id)');
  } finally {
    await run('PRAGMA foreign_keys = ON');
  }
}

async function createTagTables(run) {
  await run(
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`
  );
  await run('CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id)');
}

async function dropTagTables(run) {
  await run('DROP TABLE IF EXISTS task_tags');
  await run('DROP TABLE IF EXISTS tags');
}

module.exports = {
  id: '003_task_extensions',
  name: 'Task subtasks, tags, ordering, and recurrence support',
  async up({ run }) {
    await recreateTasksTableWithExtensions(run);
    await createTagTables(run);
  },
  async down({ run }) {
    await dropTagTables(run);
    await dropTaskExtensions(run);
  }
};
