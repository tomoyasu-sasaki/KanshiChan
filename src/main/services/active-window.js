/**
 * macOS AppleScript を利用した前面ウィンドウ情報取得サービス。
 * - /usr/bin/osascript への依存があるため macOS 専用。
 * - Google Chrome の場合のみアクティブタブの URL/TITLE を追加取得する。
 */
const { execFile } = require('child_process');

/**
 * AppleScript を同期的に実行し、出力文字列を取得する。
 * @param {string} script 実行する AppleScript コード
 * @returns {Promise<string>} 実行結果（失敗時は空文字）
 */
function runOsaScript(script) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
      if (err) return resolve('');
      resolve(String(stdout || '').trim());
    });
  });
}

/**
 * 最前面アプリの名称・タイトル・URL を取得する。
 * @returns {Promise<{app:string|null,title:string|null,url:string|null}>}
 */
async function getActiveWindowInfo() {
  const appName = await runOsaScript('tell application "System Events" to get name of first application process whose frontmost is true');
  let title = await runOsaScript('tell application "System Events" to tell (first application process whose frontmost is true) to try return name of window 1 on error return "" end try end tell');

  let url = '';
  if (appName === 'Google Chrome') {
    const chromeOut = await runOsaScript(`
      tell application "Google Chrome"
        if (count of windows) is 0 then return ""
        tell front window
          if (count of tabs) is 0 then return ""
          set theTab to active tab
          set theURL to URL of theTab
          set theTitle to title of theTab
          return theURL & "\n" & theTitle
        end tell
      end tell`);
    const raw = (chromeOut || '').trim();
    if (raw) {
      const lines = raw.split(/\r?\n/);
      url = (lines[0] || '').trim();
      const tabTitle = lines.slice(1).join('\n').trim();
      if (tabTitle) {
        title = tabTitle;
      }
    }
  }

  return {
    app: appName || null,
    title: title || null,
    url: url || null
  };
}

module.exports = {
  getActiveWindowInfo
};
