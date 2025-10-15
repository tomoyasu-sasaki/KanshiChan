import { AudioInputControl } from './components/audio-input-control.js';

/**
 * 音声チャットドロワー。
 * - 会話履歴の永続化と音声入力 UI の橋渡しを担当する。
 * - レンダラ単体で完結させ、メインとは IPC で疎結合に保つ。
 */

const HISTORY_KEY = 'kanshichan.chat.history';
const MAX_HISTORY = 20;

let chatHistory = [];
let historyContainer = null;
let clearButton = null;
let streamingTextEl = null;
let latestUserUtterance = '';

document.addEventListener('DOMContentLoaded', () => {
  historyContainer = document.getElementById('chatHistory');
  clearButton = document.getElementById('chatClearHistoryBtn');
  streamingTextEl = document.getElementById('chatStreamingText');

  loadHistory();
  renderHistory();
  setupClearButton();
  setupVoiceControl();
});

/**
 * 音声コントロールを初期化し、会話履歴をメタデータとして渡す。
 */
function setupVoiceControl() {
  const controlRoot = document.getElementById('chatVoiceControl');
  if (!controlRoot) {
    return;
  }

  new AudioInputControl(controlRoot, {
    promptProfile: 'chat',
    contextId: 'chat-drawer',
    title: '音声で話しかける',
    description: '例:「今日の予定を教えて」「集中するコツは？」など自由に話しかけてください。',
    metadata: () => ({ history: buildModelHistory() }),
    onTranscription: (text) => {
      latestUserUtterance = text || '';
    },
    onResult: (result) => {
      handleChatResult(result);
      updateStreamingText('');
    },
    onPartialResult: (segment) => {
      updateStreamingText(segment?.text || '');
    },
    onError: (error) => {
      appendSystemMessage(error?.message || 'チャット応答を取得できませんでした');
    },
  });
}

/**
 * ストリーミング表示テキストを更新する。
 * @param {string} text
 */
function updateStreamingText(text) {
  if (!streamingTextEl) {
    return;
  }
  streamingTextEl.textContent = text || '';
}

/**
 * チャット結果を履歴に追加し、ローカルストレージへ保存する。
 * @param {{reply?:string}} result
 */
function handleChatResult(result) {
  const reply = result?.reply || '返答を取得できませんでした。';
  const entry = {
    id: Date.now(),
    user: latestUserUtterance || '...',
    bot: reply,
    timestamp: new Date().toISOString(),
  };

  chatHistory = [entry, ...chatHistory].slice(0, MAX_HISTORY);
  saveHistory();
  renderHistory();
  latestUserUtterance = '';
}

/**
 * 履歴を localStorage から読み込む。
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      chatHistory = [];
      return;
    }
    const parsed = JSON.parse(raw);
    chatHistory = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[Chat] 履歴の読み込みに失敗しました:', error);
    chatHistory = [];
  }
}

/**
 * 履歴を localStorage へ保存する。
 */
function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
  } catch (error) {
    console.warn('[Chat] 履歴の保存に失敗しました:', error);
  }
}

/**
 * 履歴削除ボタンのイベントを登録する。
 */
function setupClearButton() {
  if (!clearButton) {
    return;
  }
  clearButton.addEventListener('click', () => {
    if (confirm('チャット履歴をすべて削除しますか？')) {
      chatHistory = [];
      saveHistory();
      renderHistory();
    }
  });
}

/**
 * 履歴一覧を UI に描画する。
 */
function renderHistory() {
  if (!historyContainer) {
    return;
  }

  historyContainer.innerHTML = '';

  if (chatHistory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = 'まだ会話はありません。音声で話しかけてみましょう！';
    historyContainer.appendChild(empty);
    return;
  }

  chatHistory
    .slice()
    .reverse()
    .forEach((entry) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chat-entry';

      const time = document.createElement('time');
      time.className = 'chat-timestamp';
      time.textContent = formatTimestamp(entry.timestamp);
      wrapper.appendChild(time);

      wrapper.appendChild(buildMessageBubble('user', entry.user));
      wrapper.appendChild(buildMessageBubble('bot', entry.bot));

      historyContainer.appendChild(wrapper);
    });

  historyContainer.scrollTop = historyContainer.scrollHeight;
}

/**
 * ロールに応じた吹き出し要素を生成する。
 * @param {'user'|'bot'|'system'} role
 * @param {string} text
 * @returns {HTMLElement}
 */
function buildMessageBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  return bubble;
}

function appendSystemMessage(message) {
  if (!historyContainer) {
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'chat-entry';
  wrapper.appendChild(buildMessageBubble('system', message));
  historyContainer.appendChild(wrapper);
}

/**
 * LLM に渡す履歴（上限 5 件）を生成する。
 * @returns {Array<{role:string, content:string}>}
 */
function buildModelHistory() {
  const turns = [];
  const recent = chatHistory.slice(0, 5).reverse();
  recent.forEach((entry) => {
    if (entry.user) {
      turns.push({ role: 'user', content: entry.user });
    }
    if (entry.bot) {
      turns.push({ role: 'assistant', content: entry.bot });
    }
  });
  return turns;
}

/**
 * ISO 文字列を YYYY/MM/DD HH:MM 形式へ整形する。
 * @param {string} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '';
  }
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${hh}:${mm}`;
  } catch {
    return '';
  }
}
