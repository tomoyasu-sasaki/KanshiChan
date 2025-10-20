/**
 * 単一追加フォームの制御・編集モード切り替えを担うモジュール。
 */
import {
  scheduleForm,
  titleInput,
  dateInput,
  timeInput,
  descriptionInput,
  scheduleFormContainer,
  scheduleHeading,
  scheduleSubmitBtn,
  scheduleCancelEditBtn,
  scheduleEditHint,
} from './dom.js';
import { SCHEDULE_MESSAGES } from '../../constants/schedule.js';
import { scheduleState, setEditingSchedule } from './state.js';
import {
  getTodayISODate,
  buildRepeatAwareStartFallback,
} from './utils.js';
import {
  getSchedules,
  addSchedule,
  updateSchedule,
  getScheduleById,
} from './model.js';
import {
  getSelectedRepeatDays,
  resetRepeatControls,
  setRepeatSelection,
} from './repeat-controls.js';

/**
 * 追加フォームの submit/cancel イベントを登録する。
 * @param {{onSchedulesChanged:Function}} param0 再描画コールバック
 */
export function initializeForm({ onSchedulesChanged }) {
  if (!scheduleForm) {
    return;
  }

  scheduleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleFormSubmit({ onSchedulesChanged });
  });

  if (scheduleCancelEditBtn) {
    scheduleCancelEditBtn.addEventListener('click', () => {
      exitEditMode();
      onSchedulesChanged?.();
    });
  }
}

/**
 * 指定スケジュールをフォームへロードし、編集モードへ遷移する。
 * @param {object} schedule 対象スケジュール
 */
export function enterEditMode(schedule) {
  if (!schedule || !scheduleForm) {
    return;
  }

  setEditingSchedule(schedule.id);
  scheduleForm.dataset.mode = 'edit';
  setEditModeUI(true);
  populateForm(schedule);

  const singleTabButton = document.querySelector('.tab-button[data-tab="single"]');
  if (singleTabButton && !singleTabButton.classList.contains('active')) {
    singleTabButton.click();
  }

  titleInput?.focus();
}

/**
 * 編集モードを解除し、フォームを初期状態に戻す。
 */
export function exitEditMode() {
  setEditingSchedule(null);
  if (scheduleForm) {
    delete scheduleForm.dataset.mode;
  }
  setEditModeUI(false);

  if (titleInput) {
    titleInput.value = '';
  }
  if (descriptionInput) {
    descriptionInput.value = '';
  }
  if (timeInput) {
    timeInput.value = '';
  }
  if (dateInput) {
    dateInput.value = getTodayISODate();
  }
  resetRepeatControls();
  timeInput?.focus();
}

function setEditModeUI(isEditing) {
  scheduleFormContainer?.classList.toggle('editing', Boolean(isEditing));
  if (scheduleHeading) {
    scheduleHeading.textContent = isEditing ? 'スケジュール編集' : 'スケジュール追加';
  }
  if (scheduleSubmitBtn) {
    scheduleSubmitBtn.textContent = isEditing ? '更新' : '追加';
  }
  if (scheduleCancelEditBtn) {
    scheduleCancelEditBtn.hidden = !isEditing;
  }
  if (scheduleEditHint) {
    scheduleEditHint.hidden = !isEditing;
  }
}

function populateForm(schedule) {
  if (titleInput) {
    titleInput.value = schedule.title || '';
  }
  if (dateInput) {
    dateInput.value = schedule.date || getTodayISODate();
  }
  if (timeInput) {
    timeInput.value = schedule.time || '';
  }
  if (descriptionInput) {
    descriptionInput.value = schedule.description || '';
  }
  setRepeatSelection(schedule.repeat?.days || []);
}

/**
 * 追加/更新フォームの送信処理を実行する。
 * TTS 再生成とバナー通知の発火を担当する。
 * @param {{onSchedulesChanged:Function}} param0 再描画コールバック
 */
async function handleFormSubmit({ onSchedulesChanged }) {
  const title = titleInput?.value.trim() || '';
  const date = dateInput?.value || getTodayISODate();
  const time = timeInput?.value || '';
  const description = descriptionInput?.value || '';
  const selectedRepeatDays = getSelectedRepeatDays();
  const repeat = selectedRepeatDays.length > 0 ? { type: 'weekly', days: selectedRepeatDays } : null;

  if (!title || !time) {
    alert('タイトルと時刻を入力してください');
    return;
  }

  const isEditing = Boolean(scheduleState.editingScheduleId);
  const existingSchedule = isEditing ? getScheduleById(scheduleState.editingScheduleId) : null;
  const draftSchedule = {
    title,
    time,
    date,
    description,
    repeat,
  };
  let ttsMessage = typeof existingSchedule?.ttsMessage === 'string' ? existingSchedule.ttsMessage.trim() : '';
  if (!ttsMessage) {
    ttsMessage = buildRepeatAwareStartFallback(draftSchedule);
  }

  if (isEditing) {
    if (!existingSchedule) {
      console.warn('[Schedule] 編集対象のスケジュールが見つかりません:', scheduleState.editingScheduleId);
      exitEditMode();
      return;
    }
    updateSchedule(scheduleState.editingScheduleId, {
      title,
      date,
      time,
      description,
      repeat,
      ttsMessage,
    });
    exitEditMode();
  } else {
    addSchedule({
      title,
      date,
      time,
      description,
      repeat,
      ttsMessage,
    });
    if (titleInput) {
      titleInput.value = '';
    }
    if (timeInput) {
      timeInput.value = '';
      timeInput.focus();
    }
    resetRepeatControls();
  }

  onSchedulesChanged?.();

  if (window.electronAPI?.sendNotification) {
    try {
      await window.electronAPI.sendNotification({
        title: SCHEDULE_MESSAGES.addTitle,
        body: SCHEDULE_MESSAGES.addBody(title),
      });
    } catch (error) {
      console.warn('[Schedule] 追加通知の送信に失敗:', error);
    }
  }
}
