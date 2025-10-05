/**
 * SQLite データベース初期化・アクセスユーティリティ。
 * - Electron の userData 配下に `kanchichan.db` を生成し、スキーマを維持する。
 * - 検知ログと前面アプリ滞在ログを扱うため、テーブル作成と簡易 query ヘルパーを提供する。
 * - 呼び出し元は必ず `initializeDatabase(app)` を通じて接続を確立すること。
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

let dbInstance = null;
let dbPath = null;

/**
 * アプリのユーザーデータディレクトリに DB ファイルを作成する。
 * @param {import('electron').App} app
 * @returns {string}
 */
function resolveDatabasePath(app) {
  if (dbPath) {
    return dbPath;
  }

  const userDataDir = app.getPath('userData');
  dbPath = path.join(userDataDir, 'kanchichan.db');
  return dbPath;
}

/**
 * SQLite データベースを初期化する。
 * - DB が未生成の場合は作成し、テーブルを整備する。
 * - 2回目以降の呼び出しは既存インスタンスを返す。
 * @param {import('electron').App} app
 * @returns {Promise<sqlite3.Database>}
 */
function initializeDatabase(app) {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  const targetPath = resolveDatabasePath(app);

  // ユーザーデータディレクトリが無い場合は作成
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(
      targetPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (openErr) => {
        if (openErr) {
          reject(openErr);
          return;
        }

        db.serialize(() => {
          db.run(
            `CREATE TABLE IF NOT EXISTS detection_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              detected_at INTEGER NOT NULL,
              type TEXT NOT NULL,
              duration_seconds INTEGER,
              meta TEXT
            )`,
            (err) => {
              if (err) {
                reject(err);
                return;
              }

          db.run(
            'CREATE INDEX IF NOT EXISTS idx_detection_logs_detected_at ON detection_logs(detected_at)',
            (indexErr) => {
              if (indexErr) {
                reject(indexErr);
                return;
              }

              db.run(
                `CREATE TABLE IF NOT EXISTS app_usage_logs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  app_name TEXT NOT NULL,
                  title TEXT,
                  domain TEXT,
                  started_at INTEGER NOT NULL,
                  ended_at INTEGER NOT NULL,
                  duration_seconds INTEGER NOT NULL
                )`,
                (usageErr) => {
                  if (usageErr) {
                    reject(usageErr);
                    return;
                  }

                  db.run(
                    'CREATE INDEX IF NOT EXISTS idx_app_usage_logs_started_at ON app_usage_logs(started_at)',
                    (usageIdxErr) => {
                      if (usageIdxErr) {
                        reject(usageIdxErr);
                        return;
                      }

                      db.run(
                        'CREATE INDEX IF NOT EXISTS idx_app_usage_logs_app_name ON app_usage_logs(app_name)',
                        (usageNameIdxErr) => {
                          if (usageNameIdxErr) {
                            reject(usageNameIdxErr);
                            return;
                          }

                          dbInstance = db;
                          resolve(dbInstance);
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
        });
      }
    );
  });
}

/**
 * DB インスタンスを取得する。
 * initializeDatabase 呼び出し済みであることが前提。
 * @returns {sqlite3.Database}
 */
function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database has not been initialized yet. Call initializeDatabase(app) first.');
  }
  return dbInstance;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

/**
 * アプリ終了時に DB をクローズする。
 * @returns {Promise<void>}
 */
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
  closeDatabase,
};
