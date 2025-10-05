/**
 * グローバルキーボード入力の監視サービス。
 * - uiohook-napi を利用して macOS 上のキー押下をフックし、1分バケットごとに SQLite へ保存する。
 * - 個人利用前提のため、キー内容は保持せず回数と最長連続入力時間のみを収集する。
 */
const { run } = require('../db');

let hookInstance = null;
let hookAvailable = false;
try {
  // eslint-disable-next-line global-require
  const { uIOhook } = require('uiohook-napi');
  hookInstance = uIOhook;
  hookAvailable = Boolean(hookInstance);
} catch (error) {
  console.warn('[TypingMonitor] uiohook-napi の読み込みに失敗しました:', error.message);
}

const DEFAULT_CONFIG = {
  enabled: false,
  streakGapMs: 2000,
};

function createTypingMonitor({ configStore }) {
  const storedConfig = configStore.get('typingMonitor', {});
  const config = {
    ...DEFAULT_CONFIG,
    ...(storedConfig && typeof storedConfig === 'object' ? storedConfig : {}),
  };

  let running = false;
  let paused = false;
  let flushTimer = null;
  let currentBucket = null;
  let lastKeyAt = null;
  let lastFlushAt = null;
  let flushingChain = Promise.resolve();

  function persistConfig(nextConfig) {
    configStore.set('typingMonitor', nextConfig);
  }

  function queueFlush(bucket) {
    if (!bucket || bucket.keyPresses <= 0) {
      return;
    }

    const record = {
      bucketStart: bucket.start,
      bucketEnd: bucket.end,
      keyPresses: bucket.keyPresses,
      longestStreakSeconds: bucket.longestStreakSeconds || 0,
    };

    flushingChain = flushingChain
      .catch(() => {})
      .then(async () => {
        try {
          await run(
            `INSERT INTO typing_activity_logs (bucket_start, bucket_end, key_presses, longest_streak_seconds, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              record.bucketStart,
              record.bucketEnd,
              record.keyPresses,
              record.longestStreakSeconds,
              Date.now(),
            ]
          );
          lastFlushAt = Date.now();
        } catch (error) {
          console.error('[TypingMonitor] フラッシュエラー:', error);
        }
      });
  }

  function clearFlushTimer() {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }

  function startFlushTimer() {
    clearFlushTimer();
    flushTimer = setInterval(() => {
      if (!currentBucket) {
        return;
      }
      const now = Date.now();
      if (now - currentBucket.start >= 60 * 1000) {
        const finishedBucket = currentBucket;
        currentBucket = null;
        queueFlush(finishedBucket);
      }
    }, 15 * 1000);
  }

  function ensureBucket(now) {
    const bucketStart = now - (now % (60 * 1000));
    if (currentBucket && currentBucket.start === bucketStart) {
      return currentBucket;
    }

    if (currentBucket && currentBucket.keyPresses > 0) {
      queueFlush(currentBucket);
    }

    currentBucket = {
      start: bucketStart,
      end: bucketStart + 60 * 1000,
      keyPresses: 0,
      longestStreakSeconds: 0,
      currentStreakDurationMs: 0,
      lastKeyTs: null,
    };

    return currentBucket;
  }

  function handleKeydown() {
    if (!running || paused) {
      return;
    }

    const now = Date.now();
    const bucket = ensureBucket(now);
    bucket.keyPresses += 1;

    if (bucket.lastKeyTs != null) {
      const delta = now - bucket.lastKeyTs;
      if (delta <= config.streakGapMs) {
        bucket.currentStreakDurationMs += delta;
      } else {
        bucket.currentStreakDurationMs = 0;
      }
    } else {
      bucket.currentStreakDurationMs = 0;
    }

    bucket.lastKeyTs = now;

    const streakSeconds = Math.max(1, Math.round(bucket.currentStreakDurationMs / 1000));
    if (streakSeconds > bucket.longestStreakSeconds) {
      bucket.longestStreakSeconds = streakSeconds;
    }

    lastKeyAt = now;
  }

  function detachHookListener() {
    if (!hookInstance) {
      return;
    }
    if (typeof hookInstance.off === 'function') {
      hookInstance.off('keydown', handleKeydown);
    } else if (typeof hookInstance.removeListener === 'function') {
      hookInstance.removeListener('keydown', handleKeydown);
    }
  }

  async function flushPending() {
    if (currentBucket && currentBucket.keyPresses > 0) {
      const bucketToFlush = currentBucket;
      currentBucket = null;
      queueFlush(bucketToFlush);
    } else {
      currentBucket = null;
    }
    await flushingChain.catch(() => {});
  }

  async function start() {
    if (!hookAvailable) {
      return false;
    }
    if (running) {
      return true;
    }

    try {
      hookInstance.on('keydown', handleKeydown);
      hookInstance.start();
      running = true;
      paused = false;
      startFlushTimer();
      return true;
    } catch (error) {
      console.error('[TypingMonitor] uiohook 起動エラー:', error);
      hookAvailable = false;
      try {
        detachHookListener();
      } catch {
        // noop
      }
      return false;
    }
  }

  async function stop() {
    if (!running) {
      return;
    }
    running = false;
    paused = false;
    clearFlushTimer();
    if (hookAvailable && hookInstance) {
      try {
        detachHookListener();
        hookInstance.stop();
      } catch (error) {
        console.warn('[TypingMonitor] uiohook 停止エラー:', error.message);
      }
    }
    await flushPending();
  }

  async function setEnabled(enabled) {
    const nextConfig = { ...config, enabled: Boolean(enabled) };
    persistConfig(nextConfig);
    config.enabled = nextConfig.enabled;

    if (config.enabled) {
      if (!running) {
        await start();
      }
    } else {
      await stop();
    }
    return getStatus();
  }

  async function setPaused(nextPaused) {
    const willPause = Boolean(nextPaused);
    if (willPause) {
      await flushPending();
    } else {
      currentBucket = null;
    }
    paused = willPause;
    return getStatus();
  }

  function getStatus() {
    return {
      available: hookAvailable,
      enabled: Boolean(config.enabled),
      running,
      paused,
      lastKeyAt,
      lastFlushAt,
      currentBucket: currentBucket
        ? {
            start: currentBucket.start,
            keyPresses: currentBucket.keyPresses,
            longestStreakSeconds: currentBucket.longestStreakSeconds,
          }
        : null,
      resourceUsage: {
        cpu: typeof process.getCPUUsage === 'function' ? process.getCPUUsage() : null,
        memory: process.memoryUsage?.() ?? null,
      },
    };
  }

  async function dispose() {
    await stop();
  }

  if (config.enabled) {
    start().catch((error) => {
      console.error('[TypingMonitor] 自動起動に失敗しました:', error);
    });
  }

  return {
    start,
    stop,
    dispose,
    getStatus,
    setEnabled,
    setPaused,
    flushPending,
  };
}

module.exports = {
  createTypingMonitor,
};
