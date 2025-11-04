/**
 * 「直近の予定」セクションの計算と描画を担当するモジュール。
 * - メインプロセスから schedulesList IPC を介して予定を都度取得する。
 * - 24時間以内かつ上限件数までに絞ることで、Slack・ダッシュボード両方の視認性を確保する。
 */
import { state } from './state.js';
import {
  upcomingSchedulesListEl,
  upcomingSchedulesWrapper,
} from './dom.js';
import {
  SCHEDULE_WEEKDAY_LABELS,
  UPCOMING_SCHEDULE_LIMIT,
  UPCOMING_SCHEDULE_RANGE_HOURS,
} from './constants.js';
import { escapeHtml } from './utils.js';

async function fetchSchedulesForDashboard() {
  if (window.electronAPI?.schedulesList) {
    try {
      const response = await window.electronAPI.schedulesList();
      if (response?.success && Array.isArray(response.items)) {
        return response.items;
      }
      if (response?.error) {
        console.warn('[Dashboard] schedulesList error:', response.error);
      }
    } catch (error) {
      console.warn('[Dashboard] schedulesList invocation failed:', error);
    }
  }

  try {
    const raw = localStorage.getItem('schedules');
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[Dashboard] legacy schedule load failed:', error);
    return [];
  }
}

/**
 * 繰り返し設定をダッシュボード用の weekly 表現に正規化する。
 * @param {object|null} repeat 保存データの repeat オブジェクト
 * @returns {{type:'weekly',days:number[]}|null} ダッシュボード表示用 repeat
 */
function normalizeDashboardRepeat(repeat) {
  if (!repeat || typeof repeat !== 'object') {
    return null;
  }

  if (repeat.type === 'weekly' && Array.isArray(repeat.days)) {
    const days = Array.from(
      new Set(
        repeat.days
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      )
    ).sort((a, b) => a - b);

    if (days.length === 0) {
      return null;
    }

    return { type: 'weekly', days };
  }

  return null;
}

/**
 * weekly 繰り返し情報を「毎週 月・水...」形式の文字列へ変換する。
 * @param {{type:string,days:number[]}|null} repeat 正規化済みの繰り返し設定
 * @returns {string} 表示用ラベル
 */
function formatScheduleRepeat(repeat) {
  if (!repeat || repeat.type !== 'weekly' || !Array.isArray(repeat.days) || repeat.days.length === 0) {
    return '';
  }

  const label = repeat.days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => SCHEDULE_WEEKDAY_LABELS[day])
    .join('・');

  return `毎週 ${label}`;
}

/**
 * スケジュールタイトルをトリムし、空文字の場合は既定値を返す。
 * @param {object} schedule スケジュールエントリ
 * @returns {string} 表示用タイトル
 */
function getScheduleTitle(schedule) {
  const rawTitle = typeof schedule?.title === 'string' ? schedule.title.trim() : '';
  return rawTitle || '予定';
}

/**
 * ダッシュボード表示時点での次回発生日時を求める。
 * - weekly 繰り返しは最大 2 週間先まで探索。
 * @param {object} schedule スケジュールエントリ
 * @param {Date} referenceDate 判定基準の日時
 * @returns {{dateTime:Date,key:string,isRepeat:boolean}|null}
 */
function getDashboardNextOccurrence(schedule, referenceDate = new Date()) {
  if (!schedule || !schedule.time) {
    return null;
  }

  const [hoursString, minutesString] = schedule.time.split(':');
  const hours = Number.parseInt(hoursString, 10);
  const minutes = Number.parseInt(minutesString, 10);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (!schedule.repeat) {
    if (!schedule.date) {
      return null;
    }
    const date = new Date(`${schedule.date}T${schedule.time}`);
    if (Number.isNaN(date.getTime()) || date < referenceDate) {
      return null;
    }
    return {
      dateTime: date,
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
          isRepeat: true,
        };
      }
    }
  }

  return null;
}

/**
 * 予定発生までの残り時間を「あと〜分/時間」表現に変換する。
 * @param {number} minutes 残り分数
 * @returns {string} 表示用テキスト
 */
function formatUpcomingRelative(minutes) {
  if (!Number.isFinite(minutes)) {
    return '';
  }
  if (minutes <= 0) {
    return 'まもなく開始';
  }
  if (minutes < 60) {
    return `あと${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `あと${hours}時間`;
  }
  return `あと${hours}時間${mins}分`;
}

/**
 * 直近24時間以内の予定を抽出し、表示用メタ情報へ整形する。
 * @returns {Array<Object>} ソート済み予定リスト
 */
async function computeUpcomingSchedules() {
  const now = new Date();
  const rangeMs = UPCOMING_SCHEDULE_RANGE_HOURS * 60 * 60 * 1000;

  const rawSchedules = await fetchSchedulesForDashboard();
  const schedules = rawSchedules
    .map((item) => ({
      id: item.id,
      title: getScheduleTitle(item),
      date: item.date || null,
      time: typeof item.time === 'string' ? item.time : '',
      description: typeof item.description === 'string' ? item.description : '',
      repeat: normalizeDashboardRepeat(item.repeat),
    }))
    .filter((schedule) => schedule.time);

  const upcoming = [];

  schedules.forEach((schedule) => {
    const occurrence = getDashboardNextOccurrence(schedule, now);
    if (!occurrence) {
      return;
    }

    const diffMs = occurrence.dateTime - now;
    if (diffMs < 0 || diffMs > rangeMs) {
      return;
    }

    upcoming.push({ schedule, occurrence, diffMs });
  });

  upcoming.sort((a, b) => a.occurrence.dateTime - b.occurrence.dateTime);

  return upcoming.slice(0, UPCOMING_SCHEDULE_LIMIT).map(({ schedule, occurrence, diffMs }) => {
    const minutesLeft = Math.round(diffMs / 60000);
    const timeLabel = occurrence.dateTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const isToday = occurrence.dateTime.toDateString() === now.toDateString();
    const dayLabel = isToday
      ? '今日'
      : `${String(occurrence.dateTime.getMonth() + 1).padStart(2, '0')}/${String(occurrence.dateTime.getDate()).padStart(2, '0')}(${SCHEDULE_WEEKDAY_LABELS[occurrence.dateTime.getDay()]})`;
    const repeatLabel = schedule.repeat ? formatScheduleRepeat(schedule.repeat) : '';

    return {
      id: schedule.id,
      dayLabel,
      timeLabel,
      title: getScheduleTitle(schedule),
      repeatLabel,
      relative: formatUpcomingRelative(minutesLeft),
    };
  });
}

/**
 * 事前計算済みの予定リストを DOM に反映する。
 * @param {Array<Object>} list 表示対象の予定情報
 */
function renderUpcomingSchedules(list) {
  if (!upcomingSchedulesListEl) {
    return;
  }

  if (!list || list.length === 0) {
    upcomingSchedulesListEl.innerHTML = '<li class="empty">直近24時間の予定はありません</li>';
    return;
  }

  upcomingSchedulesListEl.innerHTML = list
    .map((item) => {
      const meta = [];
      if (item.repeatLabel) {
        meta.push(`<span class="repeat">${escapeHtml(item.repeatLabel)}</span>`);
      }
      if (item.relative) {
        meta.push(`<span class="relative">${escapeHtml(item.relative)}</span>`);
      }

      const metaLine = meta.length ? `<div class="upcoming-meta">${meta.join('')}</div>` : '';

      return `
        <li>
          <div class="upcoming-line">
            <span class="time">${escapeHtml(`${item.dayLabel} ${item.timeLabel}`)}</span>
            <span class="title">${escapeHtml(item.title)}</span>
          </div>
          ${metaLine}
        </li>
      `;
    })
    .join('');
}

/**
 * 最新の localStorage から予定を再計算し、UI を更新する。
 */
export function refreshUpcomingSchedules() {
  computeUpcomingSchedules()
    .then((upcoming) => {
      state.upcomingSchedules = upcoming;
      renderUpcomingSchedules(upcoming);
      if (upcomingSchedulesWrapper) {
        upcomingSchedulesWrapper.style.display = 'block';
      }
    })
    .catch((error) => {
      console.warn('[Dashboard] upcoming schedules refresh failed:', error);
    });
}
