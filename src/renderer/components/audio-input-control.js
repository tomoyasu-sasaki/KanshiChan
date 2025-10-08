import { audioInputManager } from '../services/audio-input-manager.js';

/**
 * 共通音声入力コントロール。
 * - 各ドロワーに組み込みやすいよう、UI とセッション管理の橋渡しを行う。
 */
export class AudioInputControl {
  constructor(rootElement, options = {}) {
    if (!rootElement) {
      throw new Error('AudioInputControl: rootElement が必要です');
    }
    this.root = rootElement;
    this.options = {
      promptProfile: 'schedule',
      contextId: 'schedule',
      title: '音声入力',
      description: '',
      onResult: null,
      onTranscription: null,
      onPartialResult: null,
      onError: null,
      ...options,
    };

    this.statusEl = null;
    this.transcriptionEl = null;
    this.errorEl = null;
    this.startBtn = null;
    this.stopBtn = null;

    this.render();
  }

  /**
   * 初期 DOM を描画する。
   */
  render() {
    this.root.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'audio-input-control';

    const header = document.createElement('div');
    header.className = 'audio-input-header';

    const title = document.createElement('h3');
    title.textContent = this.options.title;
    header.appendChild(title);

    if (this.options.description) {
      const desc = document.createElement('p');
      desc.className = 'audio-input-description';
      desc.textContent = this.options.description;
      header.appendChild(desc);
    }

    container.appendChild(header);

    const buttons = document.createElement('div');
    buttons.className = 'audio-input-buttons';

    this.startBtn = document.createElement('button');
    this.startBtn.type = 'button';
    this.startBtn.className = 'btn-primary btn-large audio-start-btn';
    this.startBtn.innerHTML = '<span class="icon">🎤</span><span>録音開始</span>';
    this.startBtn.addEventListener('click', () => this.handleStart());

    this.stopBtn = document.createElement('button');
    this.stopBtn.type = 'button';
    this.stopBtn.className = 'btn-danger btn-large audio-stop-btn';
    this.stopBtn.innerHTML = '<span class="icon">⏹️</span><span>録音停止</span>';
    this.stopBtn.style.display = 'none';
    this.stopBtn.addEventListener('click', () => this.handleStop());

    buttons.appendChild(this.startBtn);
    buttons.appendChild(this.stopBtn);
    container.appendChild(buttons);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'audio-input-status';
    this.statusEl.innerHTML = '<span class="status-icon">⚪</span><span class="status-text">待機中</span>';
    container.appendChild(this.statusEl);

    this.transcriptionEl = document.createElement('div');
    this.transcriptionEl.className = 'audio-input-transcription';
    container.appendChild(this.transcriptionEl);

    this.errorEl = document.createElement('div');
    this.errorEl.className = 'audio-input-error';
    container.appendChild(this.errorEl);

    this.root.appendChild(container);
  }

  /**
   * 録音開始をトリガーし、UI を更新する。
   */
  async handleStart() {
    this.clearError();
    this.toggleRecordingUI(true);

    try {
      const metadata = typeof this.options.metadata === 'function'
        ? this.options.metadata()
        : this.options.metadata || {};

      await audioInputManager.startSession({
        promptProfile: this.options.promptProfile,
        contextId: this.options.contextId,
        metadata,
        callbacks: {
          onStatus: (status) => this.updateStatus(status),
          onTranscription: (text) => this.handleTranscription(text),
          onResult: (result) => this.handleResult(result),
          onPartialResult: (segment) => this.handlePartial(segment),
          onError: (error) => this.handleError(error),
        },
      });
    } catch (error) {
      this.toggleRecordingUI(false);
      this.handleError(error);
    }
  }

  async handleStop() {
    await audioInputManager.stopRecording();
  }

  handleTranscription(text) {
    if (!this.transcriptionEl) {
      return;
    }
    this.transcriptionEl.textContent = text || '';
    if (typeof this.options.onTranscription === 'function') {
      this.options.onTranscription(text);
    }
  }

  handlePartial(segment) {
    if (typeof this.options.onPartialResult === 'function') {
      this.options.onPartialResult(segment);
    }
  }

  handleResult(result) {
    this.toggleRecordingUI(false);
    if (this.transcriptionEl) {
      this.transcriptionEl.textContent = formatResultSummary(result);
    }
    if (typeof this.options.onResult === 'function') {
      this.options.onResult(result);
    }
  }

  handleError(error) {
    this.toggleRecordingUI(false);
    if (!this.errorEl) {
      return;
    }
    const message = error?.message || String(error);
    this.errorEl.textContent = message;
    this.errorEl.style.display = 'block';
    this.updateStatus('error');
    if (typeof this.options.onError === 'function') {
      this.options.onError(error);
    }
  }

  /**
   * ステータス表示のアイコンと文言を更新する。
   * @param {string} status
   */
  updateStatus(status) {
    if (!this.statusEl) {
      return;
    }
    const iconEl = this.statusEl.querySelector('.status-icon');
    const textEl = this.statusEl.querySelector('.status-text');

    let icon = '⚪';
    let text = '待機中';

    switch (status) {
      case 'recording':
        icon = '🔴';
        text = '録音中';
        break;
      case 'transcribing':
        icon = '⏳';
        text = '文字起こし中';
        break;
      case 'thinking':
        icon = '🧠';
        text = '解析中';
        break;
      case 'speaking':
        icon = '🔊';
        text = '音声生成中';
        break;
      case 'completed':
        icon = '✅';
        text = '完了';
        break;
      case 'error':
        icon = '⚠️';
        text = 'エラー';
        break;
      default:
        icon = '⚪';
        text = '待機中';
    }

    if (iconEl) {
      iconEl.textContent = icon;
    }
    if (textEl) {
      textEl.textContent = text;
    }
  }

  /**
   * 録音中/待機中でボタン表示を切り替える。
   * @param {boolean} isRecording
   */
  toggleRecordingUI(isRecording) {
    if (this.startBtn) {
      this.startBtn.style.display = isRecording ? 'none' : 'inline-flex';
    }
    if (this.stopBtn) {
      this.stopBtn.style.display = isRecording ? 'inline-flex' : 'none';
    }
  }

  clearError() {
    if (this.errorEl) {
      this.errorEl.textContent = '';
      this.errorEl.style.display = 'none';
    }
  }
}

/**
 * プロファイル結果を UI 表示向けに整形する。
 * @param {object} result
 * @returns {string}
 */
function formatResultSummary(result) {
  if (!result) {
    return '';
  }

  if (result.type === 'schedule') {
    const schedules = Array.isArray(result.schedules) ? result.schedules : [];
    if (schedules.length === 0) {
      return '予定を抽出できませんでした';
    }
    return schedules
      .map((item) => {
        const title = (item.title || '').trim();
        const date = (item.date || '').trim();
        const time = (item.time || '').trim();
        return [date, time, title].filter(Boolean).join(' ');
      })
      .join('\n');
  }

  if (result.type === 'settings') {
    const commands = Array.isArray(result.commands) ? result.commands : [];
    if (commands.length === 0) {
      return '変更対象は見つかりませんでした';
    }
    return commands
      .map((cmd) => {
        const valuePart = cmd.value !== undefined ? ` -> ${cmd.value}` : '';
        return `${cmd.key}: ${cmd.action}${valuePart}`;
      })
      .join('\n');
  }

  if (result.type === 'chat') {
    return result.reply || '';
  }

  return '';
}
