const test = require('node:test');
const assert = require('node:assert');
const { createTypingMonitor } = require('../typing-monitor');

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

test('typing monitor reports availability status', async () => {
  const configStore = createFakeConfigStore();
  const monitor = createTypingMonitor({ configStore });
  const status = monitor.getStatus();

  assert.strictEqual(typeof status.available, 'boolean', 'available は boolean で返る');

  await monitor.dispose();
});
