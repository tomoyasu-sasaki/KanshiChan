/**
 * スケジュール機能で共有するユーティリティ群。
 * - 日時計算や繰り返し判定など副作用を持たない処理のみを配置する。
 */
import { SCHEDULE_NOTIFICATION_LEAD_MINUTES } from '../../constants/schedule.js';
import {
  WEEKDAY_LABELS,
  REPEAT_TYPE_ALIASES,
  PRESET_REPEAT_DAYS,
} from './constants.js';

/**
 * 今日の日付を <input type="date"> 互換の ISO 形式で返す。
 * @returns {string} YYYY-MM-DD 形式
 */
export function getTodayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 今日の日付を UI 表示向けの "YYYY/MM/DD" 形式に変換する。
 * @returns {string} 表示用文字列
 */
export function getTodayDisplayDate() {
  return getTodayISODate().replaceAll('-', '/');
}

/**
 * 繰り返し設定を weekly 形式へ正規化する。
 * - daily/weekdayなどのエイリアスを補完し、曜日配列をソートする。
 * @param {object|null} repeat 保存された繰り返し設定
 * @returns {{type:'weekly',days:number[]}|null}
 */
export function normalizeRepeatConfig(repeat) {
  if (!repeat || typeof repeat !== 'object') {
    return null;
  }

  const normalizedTypeKey = typeof repeat.type === 'string' ? repeat.type.trim().toLowerCase() : '';
  const mappedType = REPEAT_TYPE_ALIASES[normalizedTypeKey] || 'weekly';

  let candidateDays = Array.isArray(repeat.days) ? repeat.days : [];
  if (candidateDays.length === 0 && PRESET_REPEAT_DAYS[mappedType]) {
    candidateDays = PRESET_REPEAT_DAYS[mappedType];
  }

  const uniqueDays = Array.from(
    new Set(
      candidateDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  if (uniqueDays.length === 0) {
    return null;
  }

  return {
    type: 'weekly',
    days: uniqueDays,
  };
}

/**
 * Date オブジェクトを "YYYY-MM-DD" キーへ変換する。
 * @param {Date} date 日付オブジェクト
 * @returns {string|null} 文字列表現 (無効な場合は null)
 */
export function getOccurrenceKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * weekly 繰り返しを「毎週 月・水...」表記に変換する。
 * @param {{type:string,days:number[]}|null} repeat 正規化済み設定
 * @returns {string} 表示ラベル
 */
export function formatRepeatLabel(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days) || repeat.days.length === 0) {
    return '';
  }

  const label = repeat.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day])
    .join('・');

  return `毎週 ${label}`;
}

/**
 * スケジュールが週次繰り返しを持つか判定する。
 * @param {object} schedule スケジュールエントリ
 * @returns {boolean} weekly 繰り返しの有無
 */
export function hasWeeklyRepeat(schedule) {
  return Boolean(
    schedule &&
      schedule.repeat &&
      schedule.repeat.type === 'weekly' &&
      Array.isArray(schedule.repeat.days) &&
      schedule.repeat.days.length > 0
  );
}

/**
 * スケジュールタイトルをトリムし、空文字の場合は既定値を返す。
 * @param {object} schedule スケジュールエントリ
 * @returns {string} Trim済みタイトル
 */
export function getScheduleTitle(schedule) {
  const rawTitle = typeof schedule?.title === 'string' ? schedule.title.trim() : '';
  return rawTitle || '予定';
}

/**
 * スケジュールの開始時刻文字列を取得する。
 * @param {object} schedule スケジュールエントリ
 * @returns {string|null} HH:MM 形式または null
 */
export function getScheduleTime(schedule) {
  const rawTime = typeof schedule?.time === 'string' ? schedule.time.trim() : '';
  return rawTime || null;
}

/**
 * 繰り返し情報を考慮した 5 分前通知の既定文面を生成する。
 * @param {object} schedule 通知対象スケジュール
 * @param {{isRepeat:boolean}|null} occurrenceInfo 次回発生情報
 * @param {number} leadMinutes リードタイム（分）
 * @returns {string} 読み上げ用テキスト
 */
export function buildRepeatAwareLeadFallback(schedule, occurrenceInfo = null, leadMinutes = SCHEDULE_NOTIFICATION_LEAD_MINUTES) {
  const title = getScheduleTitle(schedule);
  const timeText = getScheduleTime(schedule);
  const repeatLabel = formatRepeatLabel(schedule.repeat);
  const hasRepeat = hasWeeklyRepeat(schedule);
  const suffix = '準備をお願いします。';

  if (hasRepeat) {
    if (occurrenceInfo?.isRepeat && timeText) {
      return `今日も${timeText}から ${title} が始まります。あと${leadMinutes}分です。${suffix}`;
    }

    if (timeText) {
      return `${repeatLabel} の ${title} が${timeText}に始まります。あと${leadMinutes}分です。${suffix}`;
    }
    return `${repeatLabel} の ${title} が始まります。あと${leadMinutes}分です。${suffix}`;
  }

  if (timeText) {
    return `${title} が${timeText}に始まります。あと${leadMinutes}分です。${suffix}`;
  }

  return `あと${leadMinutes}分で ${title} が始まります。${suffix}`;
}

/**
 * 開始通知用の既定文面を生成する。
 * @param {object} schedule 通知対象スケジュール
 * @param {{isRepeat:boolean}|null} occurrenceInfo 次回発生情報
 * @returns {string} 読み上げ用テキスト
 */
export function buildRepeatAwareStartFallback(schedule, occurrenceInfo = null) {
  const title = getScheduleTitle(schedule);
  const timeText = getScheduleTime(schedule);
  const repeatLabel = formatRepeatLabel(schedule.repeat);
  const hasRepeat = hasWeeklyRepeat(schedule);

  if (hasRepeat) {
    if (occurrenceInfo?.isRepeat && timeText) {
      return `今日も${timeText}になりました。${title} を始めましょう。`;
    }

    if (timeText) {
      return `${repeatLabel} の ${title} の開始時刻です。${timeText}になりました。`;
    }
    return `${repeatLabel} の ${title} の開始時刻です。`;
  }

  if (timeText) {
    return `${title} の開始時刻です。${timeText}になりました。`;
  }

  return `${title} の時間です。`;
}

/**
 * 指定日時から見た次の発生タイミングを求める。
 * @param {object} schedule スケジュールエントリ
 * @param {Date} referenceDate 基準日時
 * @returns {{dateTime:Date,key:string,isRepeat:boolean}|null}
 */
export function getNextOccurrenceInfo(schedule, referenceDate = new Date()) {
  if (!schedule || !schedule.time) {
    return null;
  }

  const [hoursString, minutesString] = schedule.time.split(':');
  const hours = Number.parseInt(hoursString, 10) || 0;
  const minutes = Number.parseInt(minutesString, 10) || 0;

  if (!schedule.repeat) {
    const date = new Date(`${schedule.date}T${schedule.time}`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return {
      dateTime: date,
      key: getOccurrenceKeyFromDate(date),
      isRepeat: false,
    };
  }

  if (schedule.repeat.type === 'weekly' && Array.isArray(schedule.repeat.days) && schedule.repeat.days.length > 0) {
    const reference = new Date(referenceDate);
    reference.setSeconds(0, 0);

    const daysSet = new Set(schedule.repeat.days);

    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(reference);
      candidate.setDate(candidate.getDate() + offset);
      const candidateDay = candidate.getDay();

      if (!daysSet.has(candidateDay)) {
        continue;
      }

      candidate.setHours(hours, minutes, 0, 0);

      if (candidate >= reference) {
        return {
          dateTime: candidate,
          key: getOccurrenceKeyFromDate(candidate),
          isRepeat: true,
        };
      }
    }
  }

  return null;
}

/**
 * 数値配列同士が同じ順序で一致するか比較する軽量ヘルパー。
 * @param {number[]} a 配列A
 * @param {number[]} b 配列B
 * @returns {boolean} 完全一致なら true
 */
export function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * ISO 文字列を「YYYY年M月D日(曜)」表記へ整形する。
 * @param {string} dateString ISO 形式の日付
 * @returns {string} 表示用日付
 */
export function formatDateWithWeekday(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${year}年${month}月${day}日(${weekday})`;
}
