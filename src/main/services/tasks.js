/**
 * タスク管理サービス（メインプロセス）。
 * - SQLite テーブル tasks, tags, task_tags の CRUD を提供する。
 * - サブタスク、タグ、ドラッグ&ドロップ順序、繰り返しタスクを扱う。
 */

const { run, all, transaction } = require('../db');

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);
const ALLOWED_STATUS = new Set(['todo', 'in_progress', 'done']);
const REPEAT_TYPES = new Set(['daily', 'weekly', 'monthly']);

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
    if (Number.isNaN(d.getTime())) {
      throw new Error(`不正な日付です: ${value}`);
    }
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`不正な日付形式です: ${value}`);
    }
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return null;
}

function parseDateToDayEndMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`不正な日付です: ${value}`);
    }
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`不正な日付形式です: ${value}`);
    }
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  return null;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(color * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0; // 32bit
  }
  const hue = Math.abs(hash) % 360;
  const saturation = 0.6;
  const lightness = 0.55;
  return hslToHex(hue, saturation, lightness);
}

function normalizeRepeatConfigInput(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!REPEAT_TYPES.has(type)) {
    return null;
  }
  const interval = Number(raw.interval);
  const normalized = {
    type,
    interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
  };
  if (type === 'weekly') {
    const days = Array.isArray(raw.weekdays) ? raw.weekdays : [];
    const uniqueDays = Array.from(
      new Set(
        days
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      )
    ).sort((a, b) => a - b);
    if (uniqueDays.length === 0) {
      return null;
    }
    normalized.weekdays = uniqueDays;
  }
  return normalized;
}

function stringifyRepeatConfig(config) {
  const normalized = normalizeRepeatConfigInput(config);
  if (!normalized) {
    return null;
  }
  // 安定した JSON 出力のため、キー順を固定する
  const payload = normalized.type === 'weekly'
    ? { type: normalized.type, interval: normalized.interval, weekdays: normalized.weekdays }
    : { type: normalized.type, interval: normalized.interval };
  return JSON.stringify(payload);
}

function parseRepeatConfigString(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return normalizeRepeatConfigInput(parsed);
  } catch (error) {
    console.warn('[Tasks] repeat_config のパースに失敗:', error);
    return null;
  }
}

function mapRow(row, tagMap = new Map()) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    status: row.status,
    startDate: toNumberOrNull(row.start_date),
    endDate: toNumberOrNull(row.end_date),
    scheduleId: toNumberOrNull(row.schedule_id),
    parentTaskId: toNumberOrNull(row.parent_task_id),
    displayOrder: toNumberOrNull(row.display_order),
    repeatConfig: parseRepeatConfigString(row.repeat_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: tagMap.get(row.id) || [],
  };
}

async function assertScheduleExists(scheduleId) {
  if (scheduleId == null || scheduleId <= 0) {
    return;
  }
  const rows = await all('SELECT id FROM schedules WHERE id = ? LIMIT 1', [scheduleId]);
  if (!rows || rows.length === 0) {
    throw new Error(`schedule_id ${scheduleId} が存在しません`);
  }
}

async function assertParentTaskValid(parentId, taskId = null) {
  if (parentId == null || parentId <= 0) {
    return;
  }
  const parentRows = await all('SELECT id, parent_task_id FROM tasks WHERE id = ? LIMIT 1', [parentId]);
  if (!parentRows || parentRows.length === 0) {
    throw new Error(`parent_task_id ${parentId} が存在しません`);
  }
  // 孫タスク禁止: 親候補に既に親がある場合は不可
  if (parentRows[0].parent_task_id != null) {
    throw new Error('親タスクには子タスクを指定できません（孫タスクは未対応）');
  }
  if (taskId == null) {
    return;
  }
  if (parentId === taskId) {
    throw new Error('タスク自身を親に設定することはできません');
  }
  // 循環参照防止: 親チェーンを辿って taskId が現れればエラー
  let currentParent = parentRows[0].parent_task_id;
  while (currentParent != null) {
    if (currentParent === taskId) {
      throw new Error('サブタスクの親設定が循環参照になります');
    }
    const rows = await all('SELECT parent_task_id FROM tasks WHERE id = ? LIMIT 1', [currentParent]);
    if (!rows || !rows[0]) {
      break;
    }
    currentParent = rows[0].parent_task_id;
  }
}

async function getNextDisplayOrder(parentId) {
  let rows;
  if (parentId == null) {
    rows = await all('SELECT MAX(display_order) AS maxOrder FROM tasks WHERE parent_task_id IS NULL');
  } else {
    rows = await all('SELECT MAX(display_order) AS maxOrder FROM tasks WHERE parent_task_id = ?', [parentId]);
  }
  const maxOrder = Number(rows?.[0]?.maxOrder);
  if (!Number.isFinite(maxOrder)) {
    return 1000;
  }
  return maxOrder + 1000;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfWeek(date) {
  const start = startOfWeek(date);
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function computeTimeframeRange(timeframe) {
  const now = Date.now();
  switch (timeframe) {
    case 'today':
      return { type: 'range', start: startOfDay(now), end: endOfDay(now) };
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { type: 'range', start: startOfDay(tomorrow), end: endOfDay(tomorrow) };
    }
    case 'this_week':
      return { type: 'range', start: startOfWeek(now), end: endOfWeek(now) };
    case 'next_week': {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return { type: 'range', start: startOfWeek(nextWeek), end: endOfWeek(nextWeek) };
    }
    case 'overdue':
      return { type: 'overdue', before: startOfDay(now) };
    default:
      return null;
  }
}

function normalizeTagNames(rawNames) {
  if (!Array.isArray(rawNames)) {
    return [];
  }
  const result = [];
  const seen = new Set();
  rawNames.forEach((name) => {
    if (typeof name !== 'string') {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push({ key, label: trimmed });
  });
  return result;
}

function buildCriteriaWhere(criteria = {}) {
  if (!criteria || typeof criteria !== 'object') {
    return { clause: '', params: [] };
  }
  const where = [];
  const params = [];

  if (criteria.status && ALLOWED_STATUS.has(criteria.status)) {
    where.push('status = ?');
    params.push(criteria.status);
  }

  if (typeof criteria.tag === 'string' && criteria.tag.trim()) {
    where.push(`id IN (
      SELECT task_id FROM task_tags tt
      JOIN tags t ON t.id = tt.tag_id
      WHERE LOWER(t.name) = ?
    )`);
    params.push(criteria.tag.trim().toLowerCase());
  }

  if (Array.isArray(criteria.tags) && criteria.tags.length > 0) {
    const normalized = normalizeTagNames(criteria.tags);
    if (normalized.length > 0) {
      const placeholders = normalized.map(() => '?').join(', ');
      where.push(`id IN (
        SELECT DISTINCT task_id FROM task_tags tt
        JOIN tags t ON t.id = tt.tag_id
        WHERE LOWER(t.name) IN (${placeholders})
      )`);
      params.push(...normalized.map((item) => item.key));
    }
  }

  if (typeof criteria.timeframe === 'string') {
    const range = computeTimeframeRange(criteria.timeframe);
    if (range?.type === 'range') {
      where.push('((start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?))');
      params.push(range.end, range.start);
    } else if (range?.type === 'overdue') {
      where.push('(end_date IS NOT NULL AND end_date < ? AND status != ?)');
      params.push(range.before, 'done');
    }
  }

  const clause = where.length > 0 ? where.join(' AND ') : '';
  return { clause, params };
}

async function ensureTags(tagNames) {
  const normalized = normalizeTagNames(tagNames);
  if (normalized.length === 0) {
    return [];
  }
  const keys = normalized.map((entry) => entry.key);
  const placeholders = keys.map(() => '?').join(', ');
  const existingRows = await all(
    `SELECT id, name, color FROM tags WHERE LOWER(name) IN (${placeholders})`,
    keys
  );
  const existingMap = new Map(existingRows.map((row) => [row.name.toLowerCase(), row]));
  const now = Date.now();
  const ensured = [];

  for (const entry of normalized) {
    const existing = existingMap.get(entry.key);
    if (existing) {
      ensured.push(existing);
      continue;
    }
    const color = generateColorFromName(entry.label);
    const insert = await run(
      'INSERT INTO tags (name, color, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [entry.label, color, now, now]
    );
    ensured.push({ id: insert.lastID, name: entry.label, color });
  }

  return ensured;
}

async function applyTaskTags(taskId, tagNames) {
  const tags = await ensureTags(tagNames);
  await run('DELETE FROM task_tags WHERE task_id = ?', [taskId]);
  if (tags.length === 0) {
    return [];
  }
  const now = Date.now();
  // 挿入は順番を維持するために 1 件ずつ実行
  for (const tag of tags) {
    await run(
      'INSERT INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, ?)',
      [taskId, tag.id, now]
    );
  }
  return tags;
}

async function fetchTagsForTasks(taskIds) {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return new Map();
  }
  const placeholders = taskIds.map(() => '?').join(', ');
  const rows = await all(
    `SELECT tt.task_id, t.name, t.color
     FROM task_tags tt
     JOIN tags t ON t.id = tt.tag_id
     WHERE tt.task_id IN (${placeholders})
     ORDER BY t.name COLLATE NOCASE`,
    taskIds
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.task_id)) {
      map.set(row.task_id, []);
    }
    map.get(row.task_id).push({ name: row.name, color: row.color });
  });
  return map;
}

async function recalcParentStatus(parentId) {
  if (parentId == null) {
    return;
  }
  const children = await all('SELECT id, status FROM tasks WHERE parent_task_id = ?', [parentId]);
  if (children.length === 0) {
    return;
  }
  const statuses = children.map((child) => child.status);
  let nextStatus = 'todo';
  if (statuses.every((status) => status === 'done')) {
    nextStatus = 'done';
  } else if (statuses.some((status) => status === 'in_progress' || status === 'done')) {
    nextStatus = 'in_progress';
  }
  const parentRows = await all('SELECT status, parent_task_id FROM tasks WHERE id = ? LIMIT 1', [parentId]);
  if (!parentRows || !parentRows[0]) {
    return;
  }
  if (parentRows[0].status !== nextStatus) {
    await run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, Date.now(), parentId]);
    await recalcParentStatus(parentRows[0].parent_task_id);
  }
}

function calculateDurationMs(startDate, endDate) {
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
    return null;
  }
  return endDate - startDate;
}

function addDays(ms, days) {
  const date = new Date(ms);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function computeNextOccurrenceDates(task) {
  const config = task.repeatConfig;
  if (!config) {
    return null;
  }
  const baseStart = Number.isFinite(task.startDate) ? task.startDate : task.endDate;
  if (!Number.isFinite(baseStart)) {
    return null;
  }
  const duration = calculateDurationMs(task.startDate, task.endDate);
  if (config.type === 'daily') {
    const nextStart = addDays(baseStart, config.interval);
    const nextEnd = duration != null ? nextStart + duration : null;
    return { startDate: nextStart, endDate: nextEnd };
  }
  if (config.type === 'weekly') {
    const weekdays = Array.isArray(config.weekdays) ? config.weekdays : [];
    if (weekdays.length === 0) {
      return null;
    }
    const baseDate = new Date(baseStart);
    // 開始日の翌日から探索し、interval 週間分まで探索する
    for (let offsetWeek = 0; offsetWeek < config.interval * 2; offsetWeek += 1) {
      for (let day = 0; day < 7; day += 1) {
        const candidate = new Date(baseDate);
        candidate.setDate(candidate.getDate() + 1 + offsetWeek * 7 + day);
        const weekday = candidate.getDay();
        if (!weekdays.includes(weekday)) {
          continue;
        }
        candidate.setHours(0, 0, 0, 0);
        const nextStart = candidate.getTime();
        const nextEnd = duration != null ? nextStart + duration : null;
        return { startDate: nextStart, endDate: nextEnd };
      }
    }
  }
  if (config.type === 'monthly') {
    const baseDate = new Date(baseStart);
    baseDate.setMonth(baseDate.getMonth() + config.interval);
    const targetDay = Number.isFinite(task.startDate) ? new Date(task.startDate).getDate() : baseDate.getDate();
    baseDate.setDate(Math.min(targetDay, daysInMonth(baseDate.getFullYear(), baseDate.getMonth())));
    baseDate.setHours(0, 0, 0, 0);
    const nextStart = baseDate.getTime();
    const nextEnd = duration != null ? nextStart + duration : null;
    return { startDate: nextStart, endDate: nextEnd };
  }
  return null;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

async function maybeGenerateNextOccurrence(task) {
  if (!task.repeatConfig || task.status !== 'done') {
    return;
  }
  const next = computeNextOccurrenceDates(task);
  if (!next) {
    return;
  }
  const repeatConfigString = stringifyRepeatConfig(task.repeatConfig);
  if (!repeatConfigString) {
    return;
  }
  const parentCondition = task.parentTaskId == null ? 'parent_task_id IS NULL' : 'parent_task_id = ?';
  const params = task.parentTaskId == null
    ? [repeatConfigString, next.startDate]
    : [repeatConfigString, task.parentTaskId, next.startDate];
  const existing = await all(
    `SELECT id FROM tasks
     WHERE repeat_config = ?
       AND ${parentCondition}
       AND start_date IS NOT NULL
       AND start_date = ?
     LIMIT 1`,
    params
  );
  if (existing.length > 0) {
    return;
  }
  const now = Date.now();
  const displayOrder = await getNextDisplayOrder(task.parentTaskId);
  const insert = await run(
    `INSERT INTO tasks (
      title, description, priority, status,
      start_date, end_date, schedule_id,
      parent_task_id, display_order, repeat_config,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.title,
      task.description || null,
      task.priority,
      next.startDate,
      next.endDate,
      task.scheduleId,
      task.parentTaskId,
      displayOrder,
      repeatConfigString,
      now,
      now,
    ]
  );
  const newTaskId = insert?.lastID;
  if (newTaskId && task.tags?.length) {
    await applyTaskTags(newTaskId, task.tags.map((tag) => tag.name));
  }
}

async function getTaskById(taskId) {
  const rows = await all('SELECT * FROM tasks WHERE id = ? LIMIT 1', [taskId]);
  if (!rows || !rows[0]) {
    return null;
  }
  const tagMap = await fetchTagsForTasks([taskId]);
  return mapRow(rows[0], tagMap);
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
  const scheduleCandidate = Number(payload.scheduleId);
  const scheduleId = Number.isInteger(scheduleCandidate) && scheduleCandidate > 0 ? scheduleCandidate : null;
  const parentCandidate = Number(payload.parentTaskId);
  const parentTaskId = Number.isInteger(parentCandidate) && parentCandidate > 0 ? parentCandidate : null;
  const displayOrderInput = Number(payload.displayOrder);
  const repeatConfigString = stringifyRepeatConfig(payload.repeatConfig);
  const tagNames = Array.isArray(payload.tags) ? payload.tags : [];

  return transaction(async () => {
    await assertScheduleExists(scheduleId);
    await assertParentTaskValid(parentTaskId);

    const displayOrder = Number.isFinite(displayOrderInput)
      ? displayOrderInput
      : await getNextDisplayOrder(parentTaskId);

    const result = await run(
      `INSERT INTO tasks (
        title, description, priority, status,
        start_date, end_date, schedule_id,
        parent_task_id, display_order, repeat_config,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description || null,
        priority,
        status,
        startDate,
        endDate,
        scheduleId,
        parentTaskId,
        displayOrder,
        repeatConfigString,
        now,
        now,
      ]
    );

    const id = result?.lastID;
    if (!id) {
      throw new Error('タスクの作成に失敗しました');
    }

    const tags = await applyTaskTags(id, tagNames);
    const rows = await all('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!rows || !rows[0]) {
      throw new Error('作成したタスクの取得に失敗しました');
    }
    const mapped = mapRow(rows[0], new Map([[id, tags]]));
    await recalcParentStatus(mapped.parentTaskId);
    return mapped;
  });
}

async function updateTask(id, fields = {}) {
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    throw new Error('id が不正です');
  }

  const now = Date.now();

  return transaction(async () => {
    const existingRows = await all('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!existingRows || !existingRows[0]) {
      throw new Error(`タスク ID ${taskId} が見つかりません`);
    }
    const existingTask = mapRow(existingRows[0]);

    const sets = [];
    const params = [];

    if (fields.title != null) {
      const v = String(fields.title || '').trim();
      if (!v) {
        throw new Error('title は空にできません');
      }
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
    let nextStatus = existingTask.status;
    if (fields.status !== undefined) {
      nextStatus = normalizeStatus(fields.status);
      sets.push('status = ?');
      params.push(nextStatus);
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
      const candidate = Number(fields.scheduleId);
      const v = Number.isInteger(candidate) && candidate > 0 ? candidate : null;
      await assertScheduleExists(v);
      sets.push('schedule_id = ?');
      params.push(v);
    }

    let parentTaskId = existingTask.parentTaskId;
    if (fields.parentTaskId !== undefined) {
      const candidateRaw = Number(fields.parentTaskId);
      const candidate = Number.isInteger(candidateRaw) && candidateRaw > 0 ? candidateRaw : null;
      await assertParentTaskValid(candidate, taskId);
      parentTaskId = candidate;
      sets.push('parent_task_id = ?');
      params.push(parentTaskId);
    }

    if (fields.displayOrder !== undefined) {
      const order = Number(fields.displayOrder);
      const normalizedOrder = Number.isFinite(order) ? order : await getNextDisplayOrder(parentTaskId);
      sets.push('display_order = ?');
      params.push(normalizedOrder);
    } else if (fields.parentTaskId !== undefined) {
      // 親が変更された場合は末尾へ移動
      const normalizedOrder = await getNextDisplayOrder(parentTaskId);
      sets.push('display_order = ?');
      params.push(normalizedOrder);
    }

    if (fields.repeatConfig !== undefined) {
      sets.push('repeat_config = ?');
      params.push(stringifyRepeatConfig(fields.repeatConfig));
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(taskId);

    if (sets.length > 1) {
      const result = await run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
      if (!result || result.changes === 0) {
        throw new Error('タスクの更新に失敗しました');
      }
    }

    if (fields.tags !== undefined) {
      await applyTaskTags(taskId, Array.isArray(fields.tags) ? fields.tags : []);
    }

    const updatedTask = await getTaskById(taskId);
    if (!updatedTask) {
      throw new Error('更新したタスクの取得に失敗しました');
    }

    await recalcParentStatus(updatedTask.parentTaskId);
    if (existingTask.parentTaskId !== updatedTask.parentTaskId) {
      await recalcParentStatus(existingTask.parentTaskId);
    }

    await maybeGenerateNextOccurrence(updatedTask);

    return updatedTask;
  });
}

async function deleteTask(id) {
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    throw new Error('id が不正です');
  }
  const rows = await all('SELECT parent_task_id FROM tasks WHERE id = ? LIMIT 1', [taskId]);
  const parentId = rows?.[0]?.parent_task_id ?? null;
  await run('DELETE FROM tasks WHERE id = ?', [taskId]);
  await recalcParentStatus(parentId);
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
  if (Array.isArray(filter.tags) && filter.tags.length > 0) {
    const normalizedTags = normalizeTagNames(filter.tags);
    if (normalizedTags.length > 0) {
      const placeholders = normalizedTags.map(() => '?').join(', ');
      where.push(`id IN (
        SELECT task_id FROM task_tags tt
        JOIN tags t ON t.id = tt.tag_id
        WHERE LOWER(t.name) IN (${placeholders})
        GROUP BY task_id
        HAVING COUNT(DISTINCT LOWER(t.name)) = ${normalizedTags.length}
      )`);
      params.push(...normalizedTags.map((tag) => tag.key));
    }
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await all(
    `SELECT * FROM tasks ${clause}
     ORDER BY CASE WHEN parent_task_id IS NULL THEN 0 ELSE 1 END,
              parent_task_id,
              display_order ASC,
              updated_at DESC`,
    params
  );
  const tagMap = await fetchTagsForTasks(rows.map((row) => row.id));
  return rows.map((row) => mapRow(row, tagMap));
}

async function listActiveTasks(referenceTime = Date.now()) {
  const t = Number(referenceTime);
  const rows = await all(
    `SELECT * FROM tasks
     WHERE start_date IS NOT NULL
       AND start_date <= ?
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY CASE WHEN parent_task_id IS NULL THEN 0 ELSE 1 END,
              parent_task_id,
              display_order ASC,
              updated_at DESC`,
    [t, t]
  );
  const tagMap = await fetchTagsForTasks(rows.map((row) => row.id));
  return rows.map((row) => mapRow(row, tagMap));
}

async function listTags() {
  const rows = await all('SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE');
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

async function updateTaskOrders(updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return [];
  }
  const sanitized = updates
    .map((entry) => ({
      id: Number(entry.id),
      displayOrder: Number(entry.displayOrder),
      // ルートは null 扱い。0 や空文字は FK 違反になるため null に正規化
      parentTaskId: (() => {
        const v = entry?.parentTaskId;
        if (v == null || v === '' || v === false) return null;
        const n = Number(v);
        return Number.isInteger(n) && n > 0 ? n : null;
      })(),
    }))
    .filter((entry) => Number.isFinite(entry.id));

  if (sanitized.length === 0) {
    return [];
  }

  const now = Date.now();
  const parentChanges = [];
  await transaction(async () => {
    for (const entry of sanitized) {
      await assertParentTaskValid(entry.parentTaskId, entry.id);
      const currentParent = await all('SELECT parent_task_id FROM tasks WHERE id = ? LIMIT 1', [entry.id]);
      const oldParentId = currentParent?.[0]?.parent_task_id ?? null;
      parentChanges.push({ oldParentId, newParentId: entry.parentTaskId });
      const order = Number.isFinite(entry.displayOrder)
        ? entry.displayOrder
        : await getNextDisplayOrder(entry.parentTaskId);
      if (entry.parentTaskId == null) {
        await run(
          'UPDATE tasks SET parent_task_id = NULL, display_order = ?, updated_at = ? WHERE id = ?',
          [order, now, entry.id]
        );
      } else {
        await run(
          'UPDATE tasks SET parent_task_id = ?, display_order = ?, updated_at = ? WHERE id = ?',
          [entry.parentTaskId, order, now, entry.id]
        );
      }
    }
  });

  const affectedIds = sanitized.map((entry) => entry.id);
  const rows = await all(
    `SELECT * FROM tasks WHERE id IN (${affectedIds.map(() => '?').join(', ')})`,
    affectedIds
  );
  const tagMap = await fetchTagsForTasks(affectedIds);
  const parentSet = new Set();
  parentChanges.forEach((change) => {
    if (change.oldParentId != null) parentSet.add(change.oldParentId);
    if (change.newParentId != null) parentSet.add(change.newParentId);
  });
  for (const parentId of parentSet) {
    await recalcParentStatus(parentId);
  }
  return rows.map((row) => mapRow(row, tagMap));
}

async function bulkDeleteTasks(criteria = {}) {
  const { clause, params } = buildCriteriaWhere(criteria);
  const parentQuery = clause
    ? `SELECT DISTINCT parent_task_id AS parentId FROM tasks WHERE parent_task_id IS NOT NULL AND ${clause}`
    : 'SELECT DISTINCT parent_task_id AS parentId FROM tasks WHERE parent_task_id IS NOT NULL';
  const parentRows = await all(parentQuery, params);
  const sql = clause ? `DELETE FROM tasks WHERE ${clause}` : 'DELETE FROM tasks';
  const result = await run(sql, params);
  const affected = new Set(parentRows.map((row) => row.parentId).filter((id) => id != null));
  for (const parentId of affected) {
    await recalcParentStatus(parentId);
  }
  return { count: result?.changes ?? 0 };
}

async function bulkUpdateStatus(criteria = {}, nextStatus) {
  const normalizedStatus = normalizeTaskStatus(nextStatus);
  if (!normalizedStatus) {
    throw new Error('status が不正です');
  }
  const { clause, params } = buildCriteriaWhere(criteria);
  const parentQuery = clause
    ? `SELECT DISTINCT parent_task_id AS parentId FROM tasks WHERE parent_task_id IS NOT NULL AND ${clause}`
    : 'SELECT DISTINCT parent_task_id AS parentId FROM tasks WHERE parent_task_id IS NOT NULL';
  const parentRows = await all(parentQuery, params);
  const sql = clause
    ? `UPDATE tasks SET status = ?, updated_at = ? WHERE ${clause}`
    : 'UPDATE tasks SET status = ?, updated_at = ?';
  const now = Date.now();
  const result = await run(sql, [normalizedStatus, now, ...params]);
  const affected = new Set(parentRows.map((row) => row.parentId).filter((id) => id != null));
  for (const parentId of affected) {
    await recalcParentStatus(parentId);
  }
  return { count: result?.changes ?? 0 };
}

module.exports = {
  createTask,
  updateTask,
  deleteTask,
  listTasks,
  listActiveTasks,
  listTags,
  updateTaskOrders,
  bulkDeleteTasks,
  bulkUpdateStatus,
};
