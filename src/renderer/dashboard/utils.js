/**
 * ダッシュボード内で共通利用するフォーマッタ群。
 * - 出力はすべて表示用の文字列を返し、副作用を持たない。
 * - レンダラ以外からも流用できるよう、DOM 依存コードは置かない方針。
 */
/**
 * 指定秒数を人間可読な「〜時間〜分〜秒」表現へ正規化する。
 * - 1時間未満の場合は分秒のみを表示し、UIノイズを抑える。
 * @param {number} seconds 計測秒数
 * @returns {string} 形式化した時間文字列
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0秒';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}時間`);
  if (m > 0) parts.push(`${m}分`);
  if (s > 0 && h === 0) parts.push(`${s}秒`);
  return parts.join('') || `${s}秒`;
}

/**
 * タイピング統計のバケット開始時刻を日付+時刻ラベルに変換する。
 * - LLM出力では UNIX ms が想定されるため、NaN ガードを含める。
 * @param {object} bucket タイピング統計バケット
 * @returns {string} 「MM/DD HH:MM」形式のラベル
 */
export function formatTypingBucketLabel(bucket) {
  const start = bucket?.bucketStart ?? bucket?.start;
  if (!start) {
    return '-';
  }
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const day = date.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/**
 * システムイベント識別子を日本語の表示名へ解決する。
 * - UI 一覧と Slack レポートで同じ表記を使うため、変換を集中管理する。
 * @param {string} eventType 保存されたイベントキー
 * @returns {string} 表示用ラベル
 */
export function formatSystemEventLabel(eventType) {
  switch (eventType) {
    case 'lock_screen':
      return '画面ロック';
    case 'unlock_screen':
      return '画面解除';
    case 'suspend':
      return 'スリープ開始';
    case 'resume':
      return 'スリープ解除';
    case 'shutdown':
      return 'システム終了';
    default:
      return eventType || '-';
  }
}

/**
 * 数値/文字列のタイムスタンプを「YYYY/MM/DD HH:MM:SS」へ変換する。
 * - 変換失敗時はハイフンを返し、テーブルでの欠損扱いを統一する。
 * @param {number|string} value UNIXエポックまたはその文字列表現
 * @returns {string} 整形済み日時
 */
export function formatDateTime(value) {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP')}`;
}

/**
 * レポート期間オブジェクトを「開始〜終了」文字列に整形する。
 * @param {{start:number,end:number}} range 表示対象の期間
 * @returns {string} 期間文字列
 */
export function formatRange(range) {
  if (!range) return '';
  return `${formatDateTime(range.start)} 〜 ${formatDateTime(range.end)}`;
}

/**
 * 検知ログのイベント種別を日本語ラベルへ変換する。
 * - グラフの凡例とテーブル表示で同じ訳語を利用するためここで集中管理。
 * @param {string} type イベント種別キー
 * @returns {string} 表示ラベル
 */
export function formatTypeLabel(type) {
  switch (type) {
    case 'phone_detection_start':
      return 'スマホ検知開始';
    case 'phone_detection_end':
      return 'スマホ検知終了';
    case 'phone_alert':
      return 'スマホアラート';
    case 'absence_detection_start':
      return '不在検知開始';
    case 'absence_detection_end':
      return '不在検知終了';
    case 'absence_alert':
      return '不在アラート';
    default:
      return type || '-';
  }
}

/**
 * Date input (type=datetime-local) 用にローカライズ済み ISO 文字列を生成する。
 * - タイムゾーン補正済み文字列を返し、カスタム期間フィールドの初期値に利用する。
 * @param {number} timestamp UNIXエポック(ms)
 * @returns {string} datetime-local に適合した文字列
 */
export function toLocalDateTimeLocalString(timestamp) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * Slack 履歴などで表示する文字列をサニタイズする。
 * - UI崩れやXSSを防ぐため、限定的なエスケープを集中管理する。
 * @param {string} value HTMLへ埋め込む文字列
 * @returns {string} サニタイズ済み文字列
 */
export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CSV 出力時に必要なクォート処理を施す。
 * - 値にコンマ/改行/ダブルクォートが含まれる場合のみ囲む。
 * @param {string} value CSVセルに挿入する値
 * @returns {string} CSVエスケープ済み文字列
 */
export function csvEscape(value) {
  if (value == null) return '';
  const stringValue = String(value);
  const needsQuotes = /[",\n]/.test(stringValue);
  let escaped = stringValue.replace(/"/g, '""');
  if (needsQuotes) {
    escaped = `"${escaped}"`;
  }
  return escaped;
}
