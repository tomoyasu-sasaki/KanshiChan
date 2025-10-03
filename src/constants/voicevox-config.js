/**
 * VOICEVOX 関連の共有定数。
 * - ローカル HTTP API のホスト/ポートやデフォルト話者をここで集中管理する。
 */
// VOICEVOX 接続情報と既定設定

export const DEFAULT_VOICEVOX_HOST = '127.0.0.1';
export const DEFAULT_VOICEVOX_PORT = 50021;

// レンダラ側 UI でも使用する既定の話者 ID（ずんだもん ノーマル）
export const DEFAULT_VOICEVOX_SPEAKER_ID = 59;

// スケジュール通知などで利用する追加話者（四国めたん ノーマル）
// スケジュール通知などで利用する追加話者 ID。
export const NOTIFICATION_VOICE_SPEAKER_ID = 1;
