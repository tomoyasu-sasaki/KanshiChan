/**
 * SQLite データベース初期化・アクセスユーティリティ。
 * - Electron の userData 配下に `kanshichan.db` を生成し、バージョン付きマイグレーションを適用する。
 * - `src/main/db/migrations/` に定義された up/down を順次実行し、db_version (schema_migrations) で追跡する。
 */
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const migrations = require('./migrations');

let dbInstance = null;
let dbPath = null;
let appContext = null;
let transactionDepth = 0;

function ensureDirExists(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function migrateLegacyDatabaseIfNeeded(app, targetPath) {
  if (fs.existsSync(targetPath)) {
    return;
  }

  const userDataDir = app.getPath('userData');
  const legacyDir = path.join(path.dirname(userDataDir), 'kanchichan');
  const candidates = new Set([
    path.join(userDataDir, 'kanchichan.db'),
    path.join(legacyDir, 'kanchichan.db'),
    path.join(legacyDir, 'kanshichan.db'),
  ]);

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }
    try {
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      let migrated = false;
      try {
        fs.renameSync(candidate, targetPath);
        migrated = true;
      } catch (renameErr) {
        if (renameErr?.code === 'EXDEV') {
          fs.copyFileSync(candidate, targetPath);
          migrated = true;
          try {
            fs.unlinkSync(candidate);
          } catch (unlinkErr) {
            console.warn('[DB] legacy database cleanup skipped:', unlinkErr);
          }
        } else {
          throw renameErr;
        }
      }
      if (migrated) {
        console.info(`[DB] migrated legacy database from ${candidate} to ${targetPath}`);
        return;
      }
    } catch (migrationErr) {
      console.warn('[DB] legacy database migration failed:', migrationErr);
    }
  }
}

function resolveDatabasePath(app) {
  if (dbPath) {
    return dbPath;
  }
  const userDataDir = app.getPath('userData');
  dbPath = path.join(userDataDir, 'kanshichan.db');
  return dbPath;
}

function openDatabase(targetPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(
      targetPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(db);
      }
    );
  });
}

function createDbHelpers(db) {
  return {
    run: (sql, params = []) => new Promise((resolve, reject) => {
      db.run(sql, params, function runCallback(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this);
      });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    }),
    get: (sql, params = []) => new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    }),
    exec: (sql) => new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }),
  };
}

function createMigrationContext(db, helpers, app) {
  return {
    db,
    app,
    run: helpers.run,
    all: helpers.all,
    get: helpers.get,
    exec: helpers.exec,
  };
}

async function applyMigrations(app) {
  const db = getDatabase();
  const helpers = createDbHelpers(db);
  await helpers.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )`
  );

  const appliedRows = await helpers.all('SELECT id FROM schema_migrations ORDER BY applied_at');
  const appliedSet = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (appliedSet.has(migration.id)) {
      continue;
    }
    await helpers.run('BEGIN');
    try {
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${migration.id} does not implement up()`);
      }
      const context = createMigrationContext(db, helpers, app);
      await migration.up(context);
      await helpers.run(
        'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
        [migration.id, migration.name || migration.id, Date.now()]
      );
      await helpers.run('COMMIT');
      console.info(`[DB] migration applied: ${migration.id}`);
    } catch (error) {
      await helpers.run('ROLLBACK').catch((rollbackErr) => {
        console.error(`[DB] migration rollback failed (${migration.id}):`, rollbackErr);
      });
      throw error;
    }
  }
}

async function rollbackTo(targetId = null) {
  if (!dbInstance) {
    throw new Error('Database has not been initialized yet');
  }
  const db = getDatabase();
  const helpers = createDbHelpers(db);
  const appliedRows = await helpers.all('SELECT id FROM schema_migrations ORDER BY applied_at DESC');
  if (appliedRows.length === 0) {
    return;
  }

  for (const row of appliedRows) {
    if (targetId && row.id === targetId) {
      break;
    }
    const migration = migrations.find((m) => m.id === row.id);
    if (!migration || typeof migration.down !== 'function') {
      throw new Error(`Migration ${row.id} does not support rollback`);
    }

    await helpers.run('BEGIN');
    try {
      const context = createMigrationContext(db, helpers, appContext);
      await migration.down(context);
      await helpers.run('DELETE FROM schema_migrations WHERE id = ?', [row.id]);
      await helpers.run('COMMIT');
      console.info(`[DB] migration rolled back: ${row.id}`);
    } catch (error) {
      await helpers.run('ROLLBACK').catch((rollbackErr) => {
        console.error(`[DB] rollback failure (${row.id}):`, rollbackErr);
      });
      throw error;
    }

    if (!targetId) {
      break;
    }
  }
}

async function initializeDatabase(app) {
  if (dbInstance) {
    return dbInstance;
  }

  const targetPath = resolveDatabasePath(app);
  migrateLegacyDatabaseIfNeeded(app, targetPath);
  ensureDirExists(targetPath);

  const db = await openDatabase(targetPath);
  dbInstance = db;
  appContext = app;

  const helpers = createDbHelpers(dbInstance);
  await helpers.run('PRAGMA foreign_keys = ON');

  await applyMigrations(app);
  return dbInstance;
}

function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database has not been initialized yet. Call initializeDatabase(app) first.');
  }
  return dbInstance;
}

function run(sql, params = []) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function transaction(callback) {
  if (transactionDepth > 0) {
    transactionDepth += 1;
    try {
      return await callback();
    } finally {
      transactionDepth = Math.max(0, transactionDepth - 1);
    }
  }

  const db = getDatabase();
  const helpers = createDbHelpers(db);
  transactionDepth = 1;
  try {
    await helpers.run('BEGIN');
    const result = await callback();
    await helpers.run('COMMIT');
    return result;
  } catch (error) {
    await helpers.run('ROLLBACK').catch((rollbackErr) => {
      console.error('[DB] ROLLBACK エラー:', rollbackErr);
    });
    throw error;
  } finally {
    transactionDepth = 0;
  }
}

function closeDatabase() {
  return new Promise((resolve) => {
    if (!dbInstance) {
      resolve();
      return;
    }

    dbInstance.close(() => {
      dbInstance = null;
      resolve();
    });
  });
}

module.exports = {
  resolveDatabasePath,
  initializeDatabase,
  getDatabase,
  run,
  all,
  transaction,
  closeDatabase,
  rollbackTo,
};
