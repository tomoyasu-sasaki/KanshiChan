/**
 * 設定ドロワー共通の DOM ユーティリティ。
 * - レンダリング調整のみを担当し、副作用のある処理はここに集約しない。
 */
export function adjustAccordionHeight(innerElement) {
  if (!innerElement) {
    return;
  }
  const content = innerElement.closest('.accordion-content');
  if (!content) {
    return;
  }
  if (content.style.maxHeight) {
    requestAnimationFrame(() => {
      content.style.maxHeight = `${content.scrollHeight}px`;
    });
  }
}

/**
 * Slack/不在許可などの履歴表示で共通のタイムスタンプ表記を返す。
 * - ロケールは ja-JP 固定として、UI 文言と揃える。
 */
export function formatTimestamp(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('ja-JP', { hour12: false });
}

/**
 * 設定画面に描画するメッセージをサニタイズする。
 * - innerHTML を避けられない箇所で XSS を防ぐ目的。
 */
export function escapeHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
