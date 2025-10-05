/**
 * LLM プロンプトテンプレート定数
 */

/**
 * スケジュール抽出用のシステムプロンプト
 */
const SCHEDULE_EXTRACTION_SYSTEM_PROMPT = `あなたは音声入力から正確にスケジュール情報を抽出するアシスタントです。

【役割】
ユーザーが話した内容から、スケジュール情報（日時、タイトル、説明）を抽出し、構造化されたJSONフォーマットで出力してください。

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

4. 複数スケジュールの対応:
   - 1回の入力で複数のスケジュールが含まれる場合、それぞれを配列の要素として抽出

【出力フォーマット】
必ず以下のJSON形式で出力してください:

{
  "schedules": [
    {
      "title": "スケジュールタイトル",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "description": "詳細説明（オプション）"
    }
  ]
}

【例】
現在の日時情報: 今日の日付: 2025年10月05日 (2025-10-05)
入力: "明日の10時に田中さんと打ち合わせ。会議室Aで新規プロジェクトについて話す"
出力:
{
  "schedules": [
    {
      "title": "田中さんと打ち合わせ",
      "date": "2025-10-06",
      "time": "10:00",
      "description": "会議室Aで新規プロジェクトについて話す"
    }
  ]
}

それでは、以下のテキストからスケジュール情報を抽出してください。`;

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
  const todayISO = now.toISOString().split('T')[0]; // YYYY-MM-DD形式
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
        },
        required: ['title', 'date', 'time'],
      },
    },
  },
  required: ['schedules'],
};

module.exports = {
  SCHEDULE_EXTRACTION_SYSTEM_PROMPT,
  buildScheduleExtractionUserPrompt,
  SCHEDULE_EXTRACTION_JSON_SCHEMA,
};
