/**
 * SQLite データベース初期化・アクセスユーティリティ。
 * - Electron の userData 配下に `kanshichan.db` を生成し、スキーマを維持する。
 * - 検知ログと前面アプリ滞在ログを扱うため、テーブル作成と簡易 query ヘルパーを提供する。
 * - 呼び出し元は必ず `initializeDatabase(app)` を通じて接続を確立すること。
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

let dbInstance = null;
let dbPath = null;

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
      if (!migrated) {
        continue;
      }
      console.info(`[DB] migrated legacy database from ${candidate} to ${targetPath}`);
      return;
    } catch (migrationErr) {
      console.warn('[DB] legacy database migration failed:', migrationErr);
    }
  }
}

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
  dbPath = path.join(userDataDir, 'kanshichan.db');
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
  migrateLegacyDatabaseIfNeeded(app, targetPath);

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

                      db.run(
                        `CREATE TABLE IF NOT EXISTS slack_report_logs (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          scheduled_for INTEGER,
                          sent_at INTEGER,
                          status TEXT NOT NULL,
                          reason TEXT,
                          message TEXT,
                          error TEXT
                        )`,
                        (slackTableErr) => {
                          if (slackTableErr) {
                            reject(slackTableErr);
                            return;
                          }

                          db.run(
                            'CREATE INDEX IF NOT EXISTS idx_slack_report_logs_sent_at ON slack_report_logs(sent_at DESC)',
                            (slackIndexErr) => {
                              if (slackIndexErr) {
                                reject(slackIndexErr);
                                return;
                              }

                              db.run(
                                `CREATE TABLE IF NOT EXISTS typing_activity_logs (
                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                  bucket_start INTEGER NOT NULL,
                                  bucket_end INTEGER NOT NULL,
                                  key_presses INTEGER NOT NULL,
                                  longest_streak_seconds INTEGER NOT NULL,
                                  created_at INTEGER NOT NULL
                                )`,
                                (typingTableErr) => {
                                  if (typingTableErr) {
                                    reject(typingTableErr);
                                    return;
                                  }

                                  db.run(
                                    'CREATE INDEX IF NOT EXISTS idx_typing_activity_bucket ON typing_activity_logs(bucket_start)',
                                    (typingIndexErr) => {
                                      if (typingIndexErr) {
                                        reject(typingIndexErr);
                                        return;
                                      }

                                      db.run(
                                        `CREATE TABLE IF NOT EXISTS system_events (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          event_type TEXT NOT NULL,
                                          occurred_at INTEGER NOT NULL,
                                          meta TEXT
                                        )`,
                                        (systemTableErr) => {
                                          if (systemTableErr) {
                                            reject(systemTableErr);
                                            return;
                                          }

                                          db.run(
                                            'CREATE INDEX IF NOT EXISTS idx_system_events_occurred_at ON system_events(occurred_at DESC)',
                                            (systemIndexErr) => {
                                              if (systemIndexErr) {
                                                reject(systemIndexErr);
                                                return;
                                              }

                                              db.run(
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
                                                (overrideTableErr) => {
                                                  if (overrideTableErr) {
                                                    reject(overrideTableErr);
                                                    return;
                                                  }

                                                  db.run(
                                                    'CREATE INDEX IF NOT EXISTS idx_absence_override_started_at ON absence_override_events(started_at)',
                                                    (overrideStartedIdxErr) => {
                                                      if (overrideStartedIdxErr) {
                                                        reject(overrideStartedIdxErr);
                                                        return;
                                                      }

                                                      db.run(
                                                        'CREATE INDEX IF NOT EXISTS idx_absence_override_ended_at ON absence_override_events(ended_at)',
                                                        (overrideEndedIdxErr) => {
                                                          if (overrideEndedIdxErr) {
                                                            reject(overrideEndedIdxErr);
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
