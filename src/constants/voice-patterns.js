/**
 * 音声コマンドで用いる共通トークン群。
 * - 設定/スケジュールなど複数プロファイルで再利用しやすくする。
 */

export const VOICE_POSITIVE_TOKENS = Object.freeze([
  'オン',
  '有効',
  '開始',
  '付けて',
  'つけて',
  '点けて',
  'enable',
  'on',
  'true',
]);

export const VOICE_NEGATIVE_TOKENS = Object.freeze([
  'オフ',
  '無効',
  '停止',
  '止めて',
  '消して',
  '切って',
  'disable',
  'off',
  'false',
]);

export const VOICE_TOGGLE_TOKENS = Object.freeze([
  '切り替え',
  'トグル',
  '反転',
  'toggle',
]);

export const VOICE_INCREASE_TOKENS = Object.freeze([
  '上げて',
  '増やして',
 '長く',
  '遅く',
  '延長',
  '増加',
  'アップ',
  'increase',
  'more',
]);

export const VOICE_DECREASE_TOKENS = Object.freeze([
  '下げて',
  '減らして',
  '短く',
  '早く',
  '短縮',
  '減少',
  'ダウン',
  'decrease',
  'less',
]);

/**
 * テキスト中に指定トークンのいずれかが含まれるか判定する。
 * @param {string} text 判定対象
 * @param {Array<string>} tokens トークン配列
 * @returns {boolean}
 */
export function includesVoiceToken(text, tokens) {
  if (!text || !Array.isArray(tokens) || tokens.length === 0) {
    return false;
  }
  const normalizedText = String(text || '').toLowerCase();
  return tokens.some((token) => normalizedText.includes(String(token || '').toLowerCase()));
}

/**
 * 文字列配列を正規化（空文字除去・重複排除）する。
 * @param {Array<string>} tokens トークン配列
 * @returns {Array<string>}
 */
export function normalizeVoiceTokens(tokens = []) {
  if (!Array.isArray(tokens)) {
    return [];
  }
  return Array.from(
    new Set(
      tokens
        .map((token) => String(token || '').trim())
        .filter((token) => token.length > 0)
    )
  );
}
