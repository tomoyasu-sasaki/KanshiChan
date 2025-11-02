/**
 * タスク管理サービス（メインプロセス）。
 * - SQLite テーブル tasks の CRUD を提供する。
 */

const { run, all } = require('../db');

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);
const ALLOWED_STATUS = new Set(['todo', 'in_progress', 'done']);

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePriority(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_PRIORITIES.has(v) ? v : 'medium';
}

function normalizeStatus(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_STATUS.has(v) ? v : 'todo';
}

function parseDateToDayStartMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
  }
  return null;
}

function parseDateToDayEndMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    }
  }
  return null;
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    status: row.status,
    startDate: toNumberOrNull(row.start_date),
    endDate: toNumberOrNull(row.end_date),
    scheduleId: toNumberOrNull(row.schedule_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createTask(payload = {}) {
  const now = Date.now();
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!title) {
    throw new Error('title は必須です');
  }

  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const priority = normalizePriority(payload.priority);
  const status = normalizeStatus(payload.status);
  const startDate = parseDateToDayStartMs(payload.startDate);
  const endDate = parseDateToDayEndMs(payload.endDate);
  const scheduleId = Number.isFinite(Number(payload.scheduleId)) ? Number(payload.scheduleId) : null;

  const result = await run(
    `INSERT INTO tasks (title, description, priority, status, start_date, end_date, schedule_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, description || null, priority, status, startDate, endDate, scheduleId, now, now]
  );

  const id = result?.lastID;
  const rows = await all('SELECT * FROM tasks WHERE id = ?', [id]);
  return rows && rows[0] ? mapRow(rows[0]) : null;
}

async function updateTask(id, fields = {}) {
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    throw new Error('id が不正です');
  }

  const now = Date.now();

  const sets = [];
  const params = [];

  if (fields.title != null) {
    const v = String(fields.title || '').trim();
    sets.push('title = ?');
    params.push(v);
  }
  if (fields.description !== undefined) {
    const v = typeof fields.description === 'string' ? fields.description.trim() : null;
    sets.push('description = ?');
    params.push(v);
  }
  if (fields.priority !== undefined) {
    sets.push('priority = ?');
    params.push(normalizePriority(fields.priority));
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    params.push(normalizeStatus(fields.status));
  }
  if (fields.startDate !== undefined) {
    sets.push('start_date = ?');
    params.push(parseDateToDayStartMs(fields.startDate));
  }
  if (fields.endDate !== undefined) {
    sets.push('end_date = ?');
    params.push(parseDateToDayEndMs(fields.endDate));
  }
  if (fields.scheduleId !== undefined) {
    const v = Number.isFinite(Number(fields.scheduleId)) ? Number(fields.scheduleId) : null;
    sets.push('schedule_id = ?');
    params.push(v);
  }

  sets.push('updated_at = ?');
  params.push(now);
  params.push(taskId);

  if (sets.length === 1) {
    // updated_at のみ → 実質変更なし
    return (await all('SELECT * FROM tasks WHERE id = ?', [taskId]))[0] || null;
  }

  await run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
  const rows = await all('SELECT * FROM tasks WHERE id = ?', [taskId]);
  return rows && rows[0] ? mapRow(rows[0]) : null;
}

async function deleteTask(id) {
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    throw new Error('id が不正です');
  }
  await run('DELETE FROM tasks WHERE id = ?', [taskId]);
  return { id: taskId };
}

async function listTasks(filter = {}) {
  const where = [];
  const params = [];

  if (filter.status) {
    where.push('status = ?');
    params.push(normalizeStatus(filter.status));
  }
  if (filter.priority) {
    where.push('priority = ?');
    params.push(normalizePriority(filter.priority));
  }
  if (filter.scheduleId != null) {
    where.push('schedule_id = ?');
    params.push(Number(filter.scheduleId));
  }
  if (filter.activeAt != null) {
    const t = Number(filter.activeAt);
    if (Number.isFinite(t)) {
      where.push('(start_date IS NOT NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?))');
      params.push(t, t);
    }
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await all(`SELECT * FROM tasks ${clause} ORDER BY priority DESC, updated_at DESC`, params);
  return rows.map(mapRow);
}

async function listActiveTasks(referenceTime = Date.now()) {
  const t = Number(referenceTime);
  const rows = await all(
    `SELECT * FROM tasks WHERE start_date IS NOT NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?) ORDER BY priority DESC, updated_at DESC`,
    [t, t]
  );
  return rows.map(mapRow);
}

module.exports = {
  createTask,
  updateTask,
  deleteTask,
  listTasks,
  listActiveTasks,
};


