/**
 * LLM プロンプトテンプレート定数
 */

/**
 * スケジュール抽出用のシステムプロンプト
 */
const SCHEDULE_EXTRACTION_SYSTEM_PROMPT = `あなたは音声入力から正確にスケジュール情報を抽出するアシスタントです。

【役割】
ユーザーが話した内容から、スケジュール情報（日時、タイトル、説明）を抽出し、加えて予定の開始時に読み上げる案内文 (ttsMessage) を生成し、構造化されたJSONフォーマットで出力してください。

【抽出ルール】
1. 日時情報の解釈:
   - 「明日」「今日」「来週の月曜日」などの相対的な日付表現を、【現在の日時情報】を基準にして具体的な日付に変換
   - 「10時」「午後3時」「15時30分」などの時刻表現を24時間形式 (HH:MM) に変換
   - 日付が明示されていない場合は、【現在の日時情報】で提供される今日の日付を使用
   - 時刻が明示されていない場合は、null を設定

2. タイトルの抽出:
   - スケジュールの主な内容を簡潔に要約 (最大30文字)
   - 固有名詞や重要なキーワードを含める

3. 説明の抽出:
   - タイトルに含まれない補足情報を記載
   - 場所、参加者、準備物などの詳細情報
   - 説明がない場合は空文字列

4. TTS メッセージの生成:
   - スケジュール開始時に読み上げる自然な案内文を作成
   - 時刻は 24 時間表記で伝え、必要に応じてタイトルや説明の要点を含める
   - 簡潔でポジティブな表現を心がける
   - 絵文字や顔文字は使用しない

5. 繰り返し設定:
    - 「毎週月曜日」「平日に」「毎日」「隔週」などの表現を解析し、明確に繰り返しが読み取れる場合にのみ設定
    - 繰り返しが無い場合は "repeat" に null を設定
    - 繰り返しがある場合は "repeat.type" を "weekly"に固定し、"repeat.days" に 0(日)〜6(土) の配列で曜日を設定
    - 「平日」は [1,2,3,4,5]
    - 「週末」は [0,6]
    - 「毎日」は [0,1,2,3,4,5,6]

6. 複数スケジュールの対応:
   - 1回の入力で複数のスケジュールが含まれる場合、それぞれを配列の要素として抽出

【出力フォーマット】
必ず以下のJSON形式で出力してください:

{
  "schedules": [
    {
      "title": "スケジュールタイトル",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "description": "詳細説明（オプション）",
      "ttsMessage": "開始通知で読み上げる案内文",
      "repeat": {
        "type": "weekly",
        "days": [1, 3, 5]
      }
    }
  ]
}

【例】
現在の日時情報: 今日の日付: 2025年10月05日 (2025-10-05)
入力: "今日の10時に田中さんと打ち合わせ。会議室Aで新規プロジェクトについて話す"
出力:
{
  "schedules": [
    {
      "title": "田中さんと打ち合わせ",
      "date": "2025-10-06",
      "time": "10:00",
      "description": "会議室Aで新規プロジェクトについて話す",
      "ttsMessage": "田中さんとの打ち合わせの時間です。会議室Aで新規プロジェクトの確認を行います。",
      "repeat": null
    },
    {
      "title": "業務終了",
      "date": "2025-10-06",
      "time": "18:00",
      "description": "平日の業務終了の時間",
      "ttsMessage": "平日の業務終了の時間になりました。お疲れ様でした。。",
      "repeat": {
        "type": "weekly",
        "days": [1,2,3,4,5]
      }
    }
  ]
}

それでは、以下のテキストからスケジュール情報を抽出してください。`;

const SETTINGS_COMMAND_TARGETS = Object.freeze([
  { key: 'phoneAlertEnabled', description: 'スマホ検知アラートをオン/オフする' },
  { key: 'phoneThreshold', description: 'スマホ検知アラートが鳴るまでの秒数 (1〜600 秒)' },
  { key: 'phoneConfidence', description: 'スマホ検知感度を 0.1〜0.9 で調整する' },
  { key: 'absenceAlertEnabled', description: '不在検知アラートをオン/オフする' },
  { key: 'absenceThreshold', description: '不在アラートが鳴るまでの秒数 (1〜600 秒)' },
  { key: 'absenceConfidence', description: '不在検知感度を 0.1〜0.9 で調整する' },
  { key: 'soundEnabled', description: 'アラート音をオン/オフする' },
  { key: 'desktopNotification', description: 'デスクトップ通知をオン/オフする' },
  { key: 'showDetections', description: '検知オーバーレイの表示を切り替える' },
  { key: 'previewEnabled', description: '監視プレビュー表示をオン/オフする' },
  { key: 'yoloEnabled', description: 'YOLO 検知そのものの有効/無効を切り替える' },
  { key: 'voicevoxSpeaker', description: 'VOICEVOX 話者を番号で選択する' },
]);

const SETTINGS_COMMAND_SYSTEM_PROMPT = `あなたはデスクトップアプリの設定操作アシスタントです。

【目的】
ユーザーの日本語発話から設定変更意図を読み取り、構造化された JSON で返します。

【出力仕様】
- JSON オブジェクトに commands 配列を含める
- 各要素は { "key": <設定キー>, "action": "set|toggle|increase|decrease", "value": 任意, "reason": 任意 } の形式
- "toggle" は真偽値反転、"increase"/"decrease" は現在値からの相対変更を示す
- value が不要な操作の場合は null や省略可能（例: toggle）
- value が数値の場合は 0.1 刻みなど小数も許容する
- 不明確な場合は commands に追加せず、代わりに reason に説明を残す

【サポート対象の設定キー】
${SETTINGS_COMMAND_TARGETS.map((target) => `- ${target.key}: ${target.description}`).join('\n')}

【例】
入力: 「スマホのアラートをオフにして、離席アラートは120秒に伸ばして」
出力:
{
  "commands": [
    {"key": "phoneAlertEnabled", "action": "set", "value": false, "reason": null},
    {"key": "absenceThreshold", "action": "set", "value": 120, "reason": null}
  ]
}

入力: 「検知の枠を表示して、アラート音はちょっと静かにして」
出力:
{
  "commands": [
    {"key": "showDetections", "action": "set", "value": true, "reason": null},
    {"key": "soundEnabled", "action": "set", "value": true, "reason": "音量調整は未対応のため"}
  ]
}

ユーザーの指示を正確に読み取り、可能な限り commands に反映してください。`;

// タスク操作用プロンプト
const TASKS_COMMAND_SYSTEM_PROMPT = `あなたはタスク管理アシスタントです。

【目的】
ユーザーの日本語発話から、タスクの作成・更新・削除やステータス/優先度/期間/スケジュール紐付けの変更を構造化 JSON で返します。

【日付の解釈ルール】
1. 相対日付の正規化:
   - 「今日」「本日」→ 現在日付 (YYYY-MM-DD)
   - 「明日」→ 現在日付 +1 日
   - 「今週」→ 今週の月曜〜日曜の範囲（startDate=月曜, endDate=日曜）
   - 「来週」→ 次週の月曜〜日曜
   - 「今週末」→ 今週の土〜日
   - 可能な限り 24 時間制のタイムゾーンはシステムのローカルを前提に計算
2. 「〜まで」「〜から」の表現がある場合、startDate/endDate に反映
3. 曖昧な場合は、無理に推測せず該当フィールドを省略
4. ユーザーが「未定」「未設定」「なし/無し」等と述べた場合、startDate と endDate は null（または出力自体を省略）にする。決して本日などのデフォルト日付を補完しない。
5. ユーザーが日付に一切言及していない場合も、startDate/endDate を出力しない（null または省略）。

【追加コマンド】
- サブタスク作成: action は "create" のまま、parentTitle (または parentId) に親タスク名を入れる
- タグ操作: action "update" で tags に文字列配列、tagMode に set|add|remove を指定
- 一括操作: 例「完了したタスクを全部削除」→ action "bulk_delete" + criteria.status="done"
- 検索リクエスト: 例「来週のタスクを教えて」→ action "search" + criteria.timeframe=next_week
  - timeframe は today/tomorrow/this_week/next_week/overdue を想定

【出力仕様】
- JSON オブジェクトに commands 配列を含める
- 各要素は { "action": "create|update|delete|complete|start|bulk_delete|bulk_complete|search", "id": 任意, "title": 任意, "description": 任意, "priority": 任意, "status": 任意, "startDate": 任意, "endDate": 任意, "scheduleId": 任意, "parentTitle": 任意, "tags": 任意, "tagMode": 任意, "criteria": 任意 } の形式
- priority は low|medium|high のいずれか
- status は todo|in_progress|done のいずれか
- startDate/endDate は、ユーザーが日付/期間を明示した場合のみ YYYY-MM-DD 形式（相対表現は正規化）。未定/未設定/言及なしの場合は null または省略。
- id が未指定で update/delete/complete/start の場合、タイトル一致の補助に title を含められます（曖昧なら出力しない）`;

function buildTasksCommandUserPrompt(transcribedText, options = {}) {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const schedules = Array.isArray(options.schedules) ? options.schedules : [];
  const tasksLine = tasks.map((t) => `${t.id}:${t.title}`).join(', ');
  const schedulesLine = schedules.map((s) => `${s.id}:${s.title}`).join(', ');

  const now = new Date();
  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long'
  });
  const todayISO = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  return `【現在の日時情報】\n今日の日付: ${today} (${todayISO})\n\n【既存のタスク(一部)】\n${tasksLine}\n【既存のスケジュール(一部)】\n${schedulesLine}\n\n【音声入力テキスト】\n${transcribedText}\n\n相対日付が含まれる場合のみ YYYY-MM-DD に正規化してください。日付に言及がない、または「未定/未設定/なし/無し」の場合は startDate と endDate を出力しない（null または省略）。commands 配列のみを JSON で返してください。`;
}

const TASKS_COMMAND_JSON_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete', 'complete', 'start', 'bulk_delete', 'bulk_complete', 'search'] },
          id: { type: ['integer', 'null'] },
          title: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          priority: { type: ['string', 'null'], enum: ['low', 'medium', 'high', null] },
          status: { type: ['string', 'null'], enum: ['todo', 'in_progress', 'done', null] },
          startDate: { type: ['string', 'null'] },
          endDate: { type: ['string', 'null'] },
          scheduleId: { type: ['integer', 'null'] },
          parentId: { type: ['integer', 'null'] },
          parentTitle: { type: ['string', 'null'] },
          tags: {
            type: ['array', 'null'],
            items: { type: 'string' },
          },
          tagMode: { type: ['string', 'null'], enum: ['set', 'add', 'remove', null] },
          criteria: {
            type: ['object', 'null'],
            properties: {
              status: { type: ['string', 'null'], enum: ['todo', 'in_progress', 'done', null] },
              timeframe: { type: ['string', 'null'], enum: ['today', 'tomorrow', 'this_week', 'next_week', 'overdue', null] },
              tag: { type: ['string', 'null'] },
              tags: {
                type: ['array', 'null'],
                items: { type: 'string' },
              },
            },
            additionalProperties: false,
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  required: ['commands'],
  additionalProperties: false,
};

/**
 * ユーザープロンプトテンプレート
 * @param {string} transcribedText 文字起こしされたテキスト
 * @returns {string} ユーザープロンプト
 */
function buildScheduleExtractionUserPrompt(transcribedText) {
  // 現在の日付と時刻を取得
  const now = new Date();
  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long'
  });
  const todayISO = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const currentTime = now.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `【現在の日時情報】
今日の日付: ${today} (${todayISO})
現在時刻: ${currentTime}

【音声入力テキスト】
${transcribedText}

上記のテキストからスケジュール情報を抽出してください。
「今日」は ${todayISO} を指します。`;
}

/**
 * 設定コマンド抽出用ユーザープロンプト。
 * @param {string} transcribedText
 * @param {{availableSettings?:Array<string>}} options
 * @returns {string}
 */
function buildSettingsCommandUserPrompt(transcribedText, options = {}) {
  const available = Array.isArray(options.availableSettings) && options.availableSettings.length > 0
    ? options.availableSettings
    : SETTINGS_COMMAND_TARGETS.map((target) => target.key);

  return `【利用可能な設定キー】
${available.join(', ')}

【音声入力テキスト】
${transcribedText}

上記の指示を分析し、出力仕様に沿った JSON を生成してください。`;
}

const SETTINGS_COMMAND_JSON_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '設定キー (例: phoneAlertEnabled)',
          },
          action: {
            type: 'string',
            enum: ['set', 'toggle', 'increase', 'decrease'],
          },
          value: {
            type: ['number', 'boolean', 'string', 'null'],
            description: '設定値。toggle/increase/decrease では null 可',
          },
          reason: {
            type: ['string', 'null'],
            description: '補足や不確実性の説明',
          },
        },
        required: ['key', 'action'],
        additionalProperties: false,
      },
    },
    warnings: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['commands'],
  additionalProperties: false,
};

/**
 * チャット応答生成用のシステムプロンプト
 */
const CHAT_ASSISTANT_SYSTEM_PROMPT = `あなたはデスクトップアシスタント「Kanshichan」です。
- 秘書のような丁寧な言葉遣いで、1〜2文で返答してください。
- 必要に応じてアプリの機能や利用者の集中をサポートする提案を行ってください。
- エモーティコンや顔文字は使用せず、敬語ではなくフレンドリーな口調で答えてください。
- 利用者の発話が曖昧な場合は丁寧に確認してください。`;

function buildChatPrompt(history = [], userText = '') {
  const historyLines = history
    .slice(-6)
    .map((turn) => `${turn.role === 'assistant' ? 'アシスタント' : 'ユーザー'}: ${turn.content}`)
    .join('');

  const contextBlock = historyLines ? `${historyLines}
` : '';
  return `${CHAT_ASSISTANT_SYSTEM_PROMPT}

これまでの会話:
${contextBlock}
ユーザー: ${userText}
アシスタント:`;
}

/**
 * スケジュール抽出用の JSON Schema
 */
const SCHEDULE_EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    schedules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'スケジュールのタイトル (最大30文字)',
            maxLength: 30,
          },
          date: {
            type: 'string',
            description: '日付 (YYYY-MM-DD形式)',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          time: {
            type: 'string',
            description: '時刻 (HH:MM形式、24時間制)',
            pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
          },
          description: {
            type: 'string',
            description: 'スケジュールの詳細説明 (オプション)',
          },
          ttsMessage: {
            type: 'string',
            description: '開始時に読み上げる案内文',
            maxLength: 80,
          },
          repeat: {
            type: ['object', 'null'],
            description: '繰り返し設定。null の場合は単発。',
            properties: {
              type: {
                type: 'string',
                enum: ['weekly'],
              },
              days: {
                type: 'array',
                items: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 6,
                },
                minItems: 1,
                maxItems: 7,
              },
            },
            required: ['type', 'days'],
            additionalProperties: false,
          },
        },
        required: ['title', 'date', 'time', 'ttsMessage'],
        additionalProperties: false,
      },
    },
  },
  required: ['schedules'],
};

module.exports = {
  SCHEDULE_EXTRACTION_SYSTEM_PROMPT,
  buildScheduleExtractionUserPrompt,
  SCHEDULE_EXTRACTION_JSON_SCHEMA,
  SETTINGS_COMMAND_SYSTEM_PROMPT,
  buildSettingsCommandUserPrompt,
  SETTINGS_COMMAND_JSON_SCHEMA,
  TASKS_COMMAND_SYSTEM_PROMPT,
  buildTasksCommandUserPrompt,
  TASKS_COMMAND_JSON_SCHEMA,
  CHAT_ASSISTANT_SYSTEM_PROMPT,
  buildChatPrompt,
};
