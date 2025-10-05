const test = require('node:test');
const assert = require('node:assert');
const { createSlackReporter } = require('../slack-reporter');

function createFakeConfigStore(initial = {}) {
  let store = { ...initial };
  return {
    get: (key, defaultValue) => (key ? store[key] ?? defaultValue : { ...store }),
    set: (key, value) => {
      store[key] = value;
      return value;
    },
  };
}

test('slack report includes system event summary', async (t) => {
  const configStore = createFakeConfigStore();
  const reporter = createSlackReporter(
    { configStore },
    {
      getDetectionStats: async () => ({
        summary: {
          totalCount: 5,
          byType: {
            phone_detection_end: { totalDurationSeconds: 180, count: 2 },
            absence_detection_end: { totalDurationSeconds: 60, count: 1 },
            phone_alert: { count: 1 },
          },
        },
        buckets: [],
      }),
      getAppUsageStats: async () => ({
        items: [
          { appName: 'Xcode', totalDurationSeconds: 300, sessions: 3 },
        ],
        totalDurationSeconds: 300,
      }),
      getSystemEvents: async () => ({
        summary: { lock_screen: 1, resume: 2 },
        events: [],
      }),
    }
  );

  await t.test('report summary contains system event counts', async () => {
    const report = await reporter.generateReportPreview();
    assert.match(report.text, /システムイベント: 🔒ロック1 \/ 💡復帰2/);
    assert.strictEqual(report.systemEvents.summary.lock_screen, 1);
  });

  await reporter.dispose();
});
