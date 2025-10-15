/**
 * 設定ドロワーのエントリーポイント。
 * - 各機能モジュールを DOMContentLoaded 後に順序制御付きで初期化する。
 */
import { initializeCoreSettings, loadSettings } from './settings/core.js';
import { initializeSlackReporterSection } from './settings/slack.js';
import { initializeTypingMonitorSection } from './settings/typing.js';
import { initializeVoiceCommandSection } from './settings/voice-commands.js';
import { initializeAbsenceOverrideSection } from './settings/absence-override.js';

document.addEventListener('DOMContentLoaded', () => {
  // 初期化順序を固定し、フォーム要素が揃った後に各セクションを起動する。
  initializeCoreSettings();

  initializeSlackReporterSection().catch((error) => {
    console.error('[Settings] Slack セクション初期化エラー:', error);
  });

  initializeTypingMonitorSection().catch((error) => {
    console.error('[Settings] タイピング監視セクション初期化エラー:', error);
  });

  initializeVoiceCommandSection();
  initializeAbsenceOverrideSection();

  window.getSettings = () => loadSettings();
});
