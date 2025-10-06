/**
 * スケジュールの CSV インポート/エクスポート機能を提供するモジュール。
 */
import {
  scheduleCsvExportBtn,
  scheduleCsvImportBtn,
  scheduleCsvInput,
} from './dom.js';
import { getSchedules, bulkAddSchedules } from './model.js';
import { getTodayISODate, normalizeRepeatConfig, formatRepeatLabel } from './utils.js';
import { WEEKDAY_KEYS, REPEAT_TOKEN_MAP } from './constants.js';

/**
 * CSV ボタンのイベントを登録する。
 * @param {{onSchedulesChanged:Function}} param0 更新時コールバック
 */
export function initializeCsvHandlers({ onSchedulesChanged }) {
  if (scheduleCsvExportBtn) {
    scheduleCsvExportBtn.addEventListener('click', () => {
      exportSchedulesToCsv();
    });
  }

  if (scheduleCsvImportBtn) {
    scheduleCsvImportBtn.addEventListener('click', () => {
      scheduleCsvInput?.click();
    });
  }

  if (scheduleCsvInput) {
    scheduleCsvInput.addEventListener('change', async (event) => {
      await handleCsvFileSelection(event, { onSchedulesChanged });
    });
  }
}

/**
 * 現在のスケジュールを CSV ファイルとしてダウンロードする。
 */
function exportSchedulesToCsv() {
  const schedules = getSchedules();
  if (!schedules.length) {
    alert('エクスポートするスケジュールがありません');
    return;
  }

  const headers = ['title', 'date', 'time', 'description', 'repeat_type', 'repeat_days'];
  const rows = schedules.map((schedule) => [
    schedule.title || '',
    schedule.date || getTodayISODate(),
    schedule.time || '',
    schedule.description || '',
    schedule.repeat ? schedule.repeat.type : '',
    formatRepeatDaysForCsv(schedule.repeat),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `schedules_${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * アップロードされた CSV を解析し、ユーザー確認後に一括追加する。
 * @param {Event} event changeイベント
 * @param {{onSchedulesChanged:Function}} param1 更新時コールバック
 */
async function handleCsvFileSelection(event, { onSchedulesChanged }) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const { schedules, errors } = parseSchedulesFromCsv(rows);

    if (!schedules.length) {
      alert(errors.length ? errors.join('\n') : '有効なスケジュールが見つかりませんでした');
      return;
    }

    const previewList = schedules
      .map((item) => {
        const repeatLabel = item.repeat ? ` (${formatRepeatLabel(item.repeat)})` : '';
        return `・${item.time} ${item.title}${repeatLabel}`;
      })
      .join('\n');

    const confirmationMessage = `以下の予定を取り込みます:\n${previewList}\n\nよろしいですか？${errors.length ? `\n（${errors.length}件は不正のためスキップされます）` : ''}`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    bulkAddSchedules(schedules);
    onSchedulesChanged?.();

    alert(`${schedules.length}件のスケジュールを取り込みました${errors.length ? `\n（${errors.length}件のエラーをスキップ）` : ''}`);
  } catch (error) {
    console.error('[Schedule] CSVインポートエラー:', error);
    alert('CSVの読み込み中にエラーが発生しました。ファイル形式を確認してください。');
  } finally {
    if (scheduleCsvInput) {
      scheduleCsvInput.value = '';
    }
  }
}

/**
 * CSV の行配列をスケジュールエントリへ変換する。
 * @param {string[][]} rows CSVの配列
 * @returns {{schedules:Array<object>,errors:Array<string>}}
 */
function parseSchedulesFromCsv(rows) {
  if (!rows || rows.length === 0) {
    return { schedules: [], errors: ['CSV が空です'] };
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const titleIdx = header.indexOf('title');
  const dateIdx = header.indexOf('date');
  const timeIdx = header.indexOf('time');
  const descriptionIdx = header.indexOf('description');
  const repeatTypeIdx = header.indexOf('repeat_type');
  const repeatDaysIdx = header.indexOf('repeat_days');

  if (titleIdx === -1 || timeIdx === -1) {
    return { schedules: [], errors: ['title と time 列は必須です'] };
  }

  const schedulesFromCsv = [];
  const errors = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];

    const title = (row[titleIdx] || '').trim();
    const time = (row[timeIdx] || '').trim();
    if (!title || !time) {
      errors.push(`行${i + 1}: title または time が空のためスキップしました`);
      continue;
    }

    const date = dateIdx !== -1 ? (row[dateIdx] || '').trim() : '';
    const description = descriptionIdx !== -1 ? (row[descriptionIdx] || '').trim() : '';
    const repeatType = repeatTypeIdx !== -1 ? (row[repeatTypeIdx] || '').trim() : '';
    const repeatDays = repeatDaysIdx !== -1 ? (row[repeatDaysIdx] || '').trim() : '';

    const repeat = parseRepeatFromTokens(repeatType, repeatDays);

    schedulesFromCsv.push({
      title,
      date: date || getTodayISODate(),
      time,
      description,
      repeat,
    });
  }

  return { schedules: schedulesFromCsv, errors };
}

/**
 * CSVの repeat_type / repeat_days を weekly days 配列へ変換する。
 * @param {string} type repeat_type 列
 * @param {string} tokens repeat_days 列
 * @returns {{type:'weekly',days:number[]}|null}
 */
function parseRepeatFromTokens(type, tokens) {
  if (!type) {
    return null;
  }

  const normalizedType = type.trim().toLowerCase();
  if (normalizedType !== 'weekly') {
    return null;
  }

  const days = (tokens || '')
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const lower = token.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(REPEAT_TOKEN_MAP, lower)) {
        return REPEAT_TOKEN_MAP[lower];
      }
      return null;
    })
    .filter((day) => day !== null);

  if (days.length === 0) {
    return null;
  }

  return normalizeRepeatConfig({ type: 'weekly', days });
}

/**
 * CSV 文字列を行×列の配列へ分割する。
 * @param {string} text CSV文字列
 * @returns {string[][]} パース結果
 */
function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map(splitCsvLine);
}

/**
 * 単一行の CSV 文字列をセル単位で分割する。
 * @param {string} line CSV行
 * @returns {string[]} 列配列
 */
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.replace(/\r/g, ''));
}

/**
 * CSV に書き出す文字列を必要に応じてクォートする。
 * @param {string} value セル値
 * @returns {string} エスケープ済み文字列
 */
function escapeCsvValue(value) {
  if (value == null) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * weekly 繰り返しを CSV 用のカンマ区切り曜日文字列へ変換する。
 * @param {{type:string,days:number[]}|null} repeat 繰り返し設定
 * @returns {string} repeat_days 列に書き出す値
 */
function formatRepeatDaysForCsv(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days)) {
    return '';
  }
  return repeat.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_KEYS[day] ?? String(day))
    .join(',');
}
