/**
 * 音声入力プロファイル定義。
 * - 用途ごとに LLM のプロンプトと TTS 設定を切り替えるメタデータレイヤ。
 * - レンダラ/メインの両方から参照し、プロファイル未定義時には実装側で検知できるようにしている。
 */

export const AUDIO_PROMPT_PROFILES = Object.freeze({
  schedule: {
    id: 'schedule',
    label: 'スケジュール登録',
    description: '日時とタイトルを含む発話から予定を抽出し、登録用データを生成',
    llm: {
      mode: 'structured',
      schemaName: 'schedule',
      systemPrompt:
        'あなたはパーソナルアシスタントです。利用者の日本語の発話から' +
        '予定を読み取り、日時・タイトル・説明・繰り返し設定を JSON で返してください。' +
        '応答は常に JSON オブジェクトで、`schedules` 配列を含めること。',
    },
    tts: {
      defaultMessageField: 'ttsMessage',
    },
  },
  settings: {
    id: 'settings',
    label: '設定変更',
    description: '監視設定のオン/オフや数値変更を音声から操作',
    llm: {
      mode: 'structured',
      schemaName: 'settingsCommand',
      systemPrompt:
        'あなたはデスクトップアプリの設定操作アシスタントです。' +
        'ユーザーの日本語の指示から設定キーと変更内容を特定し、' +
        '以下の形式で JSON を返してください。\n' +
        '{"commands": [{"key": "設定キー", "action": "set|toggle", "value": 任意}]}\n' +
        '存在しない設定や不明確な指示の場合は `commands` を空配列にしてください。',
    },
    tts: {
      defaultMessageField: null,
    },
  },
  chat: {
    id: 'chat',
    label: '音声チャット',
    description: '利用者と会話しつつボイスレスポンスを返す雑談モード',
    llm: {
      mode: 'conversational',
      schemaName: null,
      systemPrompt:
        'あなたは Kanchichan のフレンドリーな会話パートナーです。' +
        '敬語ではなくカジュアルな日本語で、短く親しみやすい返答を返してください。',
    },
    tts: {
      defaultMessageField: 'reply',
    },
  },
});

/**
 * プロファイルを取得し、未定義なら明示的にエラーを出す。
 * @param {string} profileId 参照したいプロファイル ID
 * @returns {object}
 * @throws {Error} プロファイル未定義時
 */
export function getAudioPromptProfile(profileId) {
  const profile = AUDIO_PROMPT_PROFILES[profileId];
  if (!profile) {
    throw new Error(`未定義の音声プロンプトプロファイルです: ${profileId}`);
  }
  return profile;
}

/**
 * 利用可能なプロファイル一覧を返す（UI 表示用途など）。
 * @returns {Array<object>}
 */
export function listAudioPromptProfiles() {
  return Object.values(AUDIO_PROMPT_PROFILES);
}
