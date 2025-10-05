/**
 * macOS 系システムイベント監視サービス。
 * - Electron の powerMonitor を利用してスリープ/ロック/アンロック等を検知する。
 * - イベントを SQLite に書き込み、ダッシュボードや Slack レポートで再利用できるようにする。
 */
const { run, all } = require('../db');

function createSystemEventMonitor({ powerMonitor }) {
  if (!powerMonitor) {
    throw new Error('powerMonitor が提供されていません');
  }

  let listening = false;
  const subscriptions = [];

  async function recordEvent(eventType, meta = null) {
    try {
      await run(
        'INSERT INTO system_events (event_type, occurred_at, meta) VALUES (?, ?, ?)',
        [eventType, Date.now(), meta ? JSON.stringify(meta) : null]
      );
    } catch (error) {
      console.error('[SystemEvents] イベント書き込みエラー:', error);
    }
  }

  function addListener(eventName, handler) {
    powerMonitor.on(eventName, handler);
    subscriptions.push({ eventName, handler });
  }

  function start() {
    if (listening) {
      return;
    }
    addListener('suspend', () => recordEvent('suspend'));
    addListener('resume', () => recordEvent('resume'));
    addListener('lock-screen', () => recordEvent('lock_screen'));
    addListener('unlock-screen', () => recordEvent('unlock_screen'));
    addListener('shutdown', () => recordEvent('shutdown'));
    listening = true;
  }

  function stop() {
    if (!listening) {
      return;
    }
    subscriptions.forEach(({ eventName, handler }) => {
      powerMonitor.removeListener(eventName, handler);
    });
    subscriptions.length = 0;
    listening = false;
  }

  async function getRecent(limit = 50) {
    const rows = await all(
      `SELECT event_type, occurred_at, meta
       FROM system_events
       ORDER BY occurred_at DESC
       LIMIT ?`,
      [Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)]
    );

    return rows.map((row) => ({
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      meta: safeParseJson(row.meta),
    }));
  }

  function safeParseJson(value) {
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async function dispose() {
    stop();
  }

  start();

  return {
    start,
    stop,
    dispose,
    recordEvent,
    getRecent,
  };
}

module.exports = {
  createSystemEventMonitor,
};
