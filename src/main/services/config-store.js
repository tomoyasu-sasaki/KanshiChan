/**
 * シンプルな JSON ベースの設定ストア。
 * - Electron の userData 配下に config.json を生成し、キー単位で読み書きする。
 */
const fs = require('fs');
const path = require('path');

function ensureDirExists(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createConfigStore(app) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  let cache = null;

  function load() {
    if (cache) {
      return cache;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      cache = JSON.parse(raw);
    } catch (error) {
      // 新規ファイル or 破損時は空オブジェクト扱い
      cache = {};
    }
    return cache;
  }

  function save(data) {
    cache = data;
    ensureDirExists(configPath);
    fs.writeFileSync(configPath, JSON.stringify(cache, null, 2), 'utf-8');
    return cache;
  }

  function getAll() {
    return { ...load() };
  }

  function get(key, defaultValue = undefined) {
    const data = load();
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaultValue;
  }

  function set(key, value) {
    const data = load();
    const next = { ...data, [key]: value };
    save(next);
    return next[key];
  }

  function update(partial = {}) {
    const data = load();
    const next = { ...data, ...partial };
    save(next);
    return next;
  }

  return {
    getAll,
    get,
    set,
    update,
    path: configPath,
  };
}

module.exports = {
  createConfigStore,
};
