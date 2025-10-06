/**
 * テキストエリアからの一括入力をスケジュールへ反映するモジュール。
 * - 時刻とタイトルをパースし、任意の繰り返し指定を解釈する。
 */
import { bulkAddBtn } from './dom.js';
import { formatRepeatLabel, getTodayISODate, normalizeRepeatConfig } from './utils.js';
import { REPEAT_TOKEN_MAP } from './constants.js';
import { bulkAddSchedules } from './model.js';

/**
 * 一括追加ボタンにクリックイベントを登録する。
 * @param {{onSchedulesChanged:Function}} param0 再描画コールバック
 */
export function initializeBulkAdd({ onSchedulesChanged }) {
  if (!bulkAddBtn) {
    return;
  }
  bulkAddBtn.addEventListener('click', () => {
    handleBulkAdd({ onSchedulesChanged });
  });
}

/**
 * テキストエリアから予定をパースし、確認後に追加する。
 * @param {{onSchedulesChanged:Function}} param0 コールバック
 */
function handleBulkAdd({ onSchedulesChanged }) {
  const bulkInput = document.getElementById('bulkInput');
  if (!bulkInput) {
    return;
  }

  const text = bulkInput.value.trim();

  if (!text) {
    alert('スケジュールを入力してください');
    return;
  }

  const lines = text.split('\n').filter((line) => line.trim());
  const date = getTodayISODate();
  const parsedSchedules = [];
  let errorCount = 0;

  lines.forEach((line) => {
    const match = line.trim().match(/^(\d{1,2}):(\d{2})\s+(.+)$/);

    if (!match) {
      errorCount += 1;
      console.warn('パース失敗:', line);
      return;
    }

    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    const time = `${hours}:${minutes}`;
    const rawContent = match[3].trim();
    const [titlePart, repeatPart] = rawContent.split('|');
    const title = titlePart.trim();
    const repeatDays = parseRepeatSpecification((repeatPart || '').trim());
    const repeat = repeatDays.length > 0 ? { type: 'weekly', days: repeatDays } : null;

    if (!title) {
      errorCount += 1;
      console.warn('タイトルが空のためスキップ:', line);
      return;
    }

    parsedSchedules.push({
      title,
      date,
      time,
      description: '',
      repeat,
    });
  });

  if (parsedSchedules.length === 0) {
    alert('正しい形式で入力してください\n例: 10:00 朝会 | mon,wed');
    return;
  }

  const previewList = parsedSchedules
    .map((item) => {
      const repeatLabel = item.repeat ? ` (${formatRepeatLabel(item.repeat)})` : '';
      return `・${item.time} ${item.title}${repeatLabel}`;
    })
    .join('\n');

  const confirmationMessage = `以下の予定を追加します:\n${previewList}\n\nよろしいですか？${errorCount > 0 ? `\n（${errorCount}件は形式不正のためスキップされます）` : ''}`;

  if (!window.confirm(confirmationMessage)) {
    return;
  }

  bulkAddSchedules(parsedSchedules);
  bulkInput.value = '';
  onSchedulesChanged?.();
  alert(`${parsedSchedules.length}件のスケジュールを追加しました${errorCount > 0 ? `\n（${errorCount}件のエラーをスキップ）` : ''}`);
}

/**
 * 一括入力の繰り返し指定を曜日配列へ変換する。
 * @param {string} rawSpec 入力文字列
 * @returns {number[]} 曜日インデックスの配列
 */
function parseRepeatSpecification(rawSpec) {
  if (!rawSpec || typeof rawSpec !== 'string') {
    return [];
  }

  const normalized = rawSpec.trim();
  if (!normalized) {
    return [];
  }

  const lower = normalized.toLowerCase();

  if (['weekday', 'weekdays', '平日'].includes(lower)) {
    const preset = normalizeRepeatConfig({ type: 'weekdays' });
    return Array.isArray(preset?.days) ? [...preset.days] : [];
  }

  if (['everyday', 'daily', '毎日'].includes(lower)) {
    const preset = normalizeRepeatConfig({ type: 'daily' });
    return Array.isArray(preset?.days) ? [...preset.days] : [];
  }

  const tokens = normalized
    .replace(/曜日|曜/g, '')
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const days = tokens
    .map((token) => {
      const key = token.toLowerCase();
      return REPEAT_TOKEN_MAP[key] ?? REPEAT_TOKEN_MAP[token] ?? null;
    })
    .filter((value) => value !== null);

  return Array.from(new Set(days)).sort((a, b) => a - b);
}
