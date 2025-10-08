/**
 * 音声入力の進行状況と履歴を管理するストア。
 * - シンプルな pub/sub でコンポーネント間共有を行う（Redux ほどの重みは不要なため）。
 */

const MAX_HISTORY = 20;

class AudioInputStore {
  constructor() {
    this.state = {
      activeSession: null,
      sessions: [],
      status: 'idle',
      lastError: null,
    };
    this.listeners = new Set();
  }

  /**
   * 状態変更を購読する。
   * @param {(state:object)=>void} listener
   * @returns {() => void} unsubscribe 関数
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 状態を部分更新する。変更後に購読者へ通知する。
   * @param {object} patch
   */
  setState(patch) {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.emit();
  }

  /**
   * アクティブセッション情報を差し替える。
   * @param {object|null} session
   */
  setActiveSession(session) {
    this.setState({
      activeSession: session,
      status: session ? session.status : 'idle',
    });
  }

  /**
   * 履歴にセッション結果を追加し、最大保持件数を超えたら古いものを捨てる。
   * @param {object} entry
   */
  appendHistory(entry) {
    const nextSessions = [entry, ...this.state.sessions].slice(0, MAX_HISTORY);
    this.setState({
      sessions: nextSessions,
      lastError: entry.success ? null : entry.error,
    });
  }

  /**
   * 履歴を初期化する（UI からクリアボタンで利用）。
   */
  clearHistory() {
    this.setState({
      sessions: [],
    });
  }

  /**
   * 直近エラーを記録し、状態を `error` に遷移させる。
   * @param {string} error
   */
  setError(error) {
    this.setState({
      lastError: error,
      status: 'error',
    });
  }

  emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export const audioInputStore = new AudioInputStore();
