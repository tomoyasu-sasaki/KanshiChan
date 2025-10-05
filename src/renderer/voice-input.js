/**
 * 音声入力UI制御スクリプト（レンダラプロセス）
 * - MediaRecorder API で音声録音
 * - IPC 経由でメインプロセスの音声認識 & スケジュール抽出を呼び出し
 * - UI状態更新（録音中/処理中/完了/エラー）
 * - 抽出されたスケジュールの確認 & 編集 & 登録
 */

/**
 * 音声入力の状態管理
 */
const VoiceInputState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
};

let currentState = VoiceInputState.IDLE;
let mediaRecorder = null;
let audioChunks = [];
let extractedSchedules = [];

/**
 * DOM要素の取得
 */
const elements = {
  drawer: document.getElementById('voiceInputDrawer'),
  startRecordingBtn: document.getElementById('startRecordingBtn'),
  stopRecordingBtn: document.getElementById('stopRecordingBtn'),
  status: document.getElementById('voiceInputStatus'),
  statusIcon: document.querySelector('#voiceInputStatus .status-icon'),
  statusText: document.querySelector('#voiceInputStatus .status-text'),
  resultSection: document.getElementById('voiceInputResult'),
  transcribedText: document.getElementById('transcribedText'),
  schedulesSection: document.getElementById('voiceInputSchedules'),
  extractedSchedulesContainer: document.getElementById('extractedSchedules'),
  confirmBtn: document.getElementById('confirmSchedulesBtn'),
  cancelBtn: document.getElementById('cancelSchedulesBtn'),
  errorSection: document.getElementById('voiceInputError'),
  errorMessage: document.getElementById('voiceInputErrorMessage'),
};

/**
 * 状態を更新してUIに反映
 * @param {string} state VoiceInputState の値
 * @param {string} message 状態メッセージ
 */
function updateState(state, message = '') {
  currentState = state;

  const statusConfig = {
    [VoiceInputState.IDLE]: { icon: '⚪', text: '待機中' },
    [VoiceInputState.RECORDING]: { icon: '🔴', text: '録音中...' },
    [VoiceInputState.PROCESSING]: { icon: '⏳', text: '処理中...' },
    [VoiceInputState.COMPLETED]: { icon: '✅', text: '完了' },
    [VoiceInputState.ERROR]: { icon: '❌', text: 'エラー' },
  };

  const config = statusConfig[state] || statusConfig[VoiceInputState.IDLE];
  elements.statusIcon.textContent = config.icon;
  elements.statusText.textContent = message || config.text;

  elements.startRecordingBtn.style.display =
    state === VoiceInputState.IDLE ? 'flex' : 'none';
  elements.stopRecordingBtn.style.display =
    state === VoiceInputState.RECORDING ? 'flex' : 'none';
}

/**
 * エラーを表示
 * @param {string} errorMessage エラーメッセージ
 */
function showError(errorMessage) {
  updateState(VoiceInputState.ERROR, 'エラーが発生しました');
  elements.errorMessage.textContent = errorMessage;
  elements.errorSection.style.display = 'block';
  elements.resultSection.style.display = 'none';
  elements.schedulesSection.style.display = 'none';
}

/**
 * エラー表示をクリア
 */
function clearError() {
  elements.errorSection.style.display = 'none';
  elements.errorMessage.textContent = '';
}

/**
 * 録音を開始
 */
async function startRecording() {
  try {
    clearError();
    elements.resultSection.style.display = 'none';
    elements.schedulesSection.style.display = 'none';

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      await processRecording();
    };

    mediaRecorder.start();
    updateState(VoiceInputState.RECORDING, '録音中... (話してください)');
  } catch (error) {
    console.error('[VoiceInput] 録音開始エラー:', error);
    showError(
      'マイクへのアクセスが拒否されました。ブラウザの設定でマイクの権限を許可してください。'
    );
  }
}

/**
 * 録音を停止
 */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    updateState(VoiceInputState.PROCESSING, '音声を処理中...');
  }
}

/**
 * 録音データを処理（文字起こし & スケジュール抽出）
 */
async function processRecording() {
  try {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioDataBase64 = arrayBufferToBase64(arrayBuffer);

    console.log('[VoiceInput] 音声データサイズ:', audioBlob.size, 'bytes');

    const result = await window.electronAPI.voiceInputTranscribe(audioDataBase64);

    if (!result.success) {
      const errorMsg = typeof result.error === 'string' ? result.error : '音声認識に失敗しました';
      throw new Error(errorMsg);
    }

    const { transcribedText, schedules } = result;

    elements.transcribedText.textContent = transcribedText;
    elements.resultSection.style.display = 'block';

    extractedSchedules = schedules;
    renderExtractedSchedules(schedules);
    elements.schedulesSection.style.display = 'block';

    updateState(VoiceInputState.COMPLETED, 'スケジュール抽出完了');
  } catch (error) {
    console.error('[VoiceInput] 処理エラー:', error);
    const errorMessage = error?.message || error?.toString() || '処理中にエラーが発生しました';
    showError(errorMessage);
  }
}

/**
 * ArrayBuffer を Base64 に変換
 * @param {ArrayBuffer} buffer
 * @returns {string} Base64文字列
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 抽出されたスケジュールをUIに表示
 * @param {Array} schedules スケジュール配列
 */
function renderExtractedSchedules(schedules) {
  elements.extractedSchedulesContainer.innerHTML = '';

  if (!schedules || schedules.length === 0) {
    elements.extractedSchedulesContainer.innerHTML =
      '<p class="empty-message">スケジュールが抽出できませんでした</p>';
    return;
  }

  schedules.forEach((schedule, index) => {
    const scheduleCard = document.createElement('div');
    scheduleCard.className = 'schedule-card';
    scheduleCard.innerHTML = `
      <div class="schedule-card-header">
        <strong>${schedule.title}</strong>
      </div>
      <div class="schedule-card-body">
        <div class="form-group">
          <label>日付</label>
          <input type="date" class="schedule-date" data-index="${index}" value="${schedule.date}">
        </div>
        <div class="form-group">
          <label>時刻</label>
          <input type="time" class="schedule-time" data-index="${index}" value="${schedule.time}">
        </div>
        <div class="form-group">
          <label>説明</label>
          <textarea class="schedule-description" data-index="${index}" rows="2">${schedule.description || ''}</textarea>
        </div>
      </div>
    `;
    elements.extractedSchedulesContainer.appendChild(scheduleCard);
  });
}

/**
 * 編集されたスケジュールを収集
 * @returns {Array} 編集後のスケジュール配列
 */
function collectEditedSchedules() {
  const schedules = [];
  const cards = elements.extractedSchedulesContainer.querySelectorAll('.schedule-card');

  cards.forEach((card, index) => {
    const dateInput = card.querySelector('.schedule-date');
    const timeInput = card.querySelector('.schedule-time');
    const descriptionInput = card.querySelector('.schedule-description');

    schedules.push({
      title: extractedSchedules[index].title,
      date: dateInput.value,
      time: timeInput.value,
      description: descriptionInput.value.trim(),
    });
  });

  return schedules;
}

/**
 * スケジュールを登録
 */
async function confirmSchedules() {
  try {
    const newSchedules = collectEditedSchedules();

    // localStorage からスケジュール配列を取得
    let existingSchedules = JSON.parse(localStorage.getItem('schedules')) || [];

    // 新しいスケジュールを追加（IDと通知フラグを付与）
    for (const schedule of newSchedules) {
      const scheduleWithMeta = {
        id: Date.now() + Math.random(), // ユニークなID生成
        title: schedule.title,
        date: schedule.date,
        time: schedule.time,
        description: schedule.description || '',
        notified: false,
        preNotified: false,
        startNotified: false,
      };
      existingSchedules.push(scheduleWithMeta);
      console.log('[VoiceInput] スケジュール登録:', scheduleWithMeta);
    }

    // localStorage に保存
    localStorage.setItem('schedules', JSON.stringify(existingSchedules));

    await window.electronAPI.sendNotification({
      title: '音声入力',
      body: `${newSchedules.length}件のスケジュールを登録しました`,
    });

    resetVoiceInput();
    closeDrawer();

    // スケジュール一覧を更新するイベントを発火
    window.dispatchEvent(new Event('schedules-updated'));
  } catch (error) {
    console.error('[VoiceInput] スケジュール登録エラー:', error);
    showError('スケジュール登録に失敗しました');
  }
}

/**
 * 音声入力をリセット
 */
function resetVoiceInput() {
  audioChunks = [];
  extractedSchedules = [];
  elements.resultSection.style.display = 'none';
  elements.schedulesSection.style.display = 'none';
  clearError();
  updateState(VoiceInputState.IDLE);
}

/**
 * ドロワーを閉じる
 */
function closeDrawer() {
  elements.drawer.classList.remove('open');
  resetVoiceInput();
}

/**
 * イベントリスナー登録
 */
elements.startRecordingBtn.addEventListener('click', startRecording);
elements.stopRecordingBtn.addEventListener('click', stopRecording);
elements.confirmBtn.addEventListener('click', confirmSchedules);
elements.cancelBtn.addEventListener('click', resetVoiceInput);

console.log('[VoiceInput] スクリプトが読み込まれました');
