# 音声入力拡張 要件と現状整理

## 1. 現状の音声入力フロー
```
レンダラ(scheduler) ── MediaRecorder ──▶ base64 WebM
    │                                   │
    └─▶ `window.electronAPI.voiceInputTranscribe`
            │
            ▼
メイン `processVoiceInput` ──▶ Whisper CLI (bin/whisper-cli)
            │
            └─▶ 自然言語→スケジュール抽出 (OpenAI functions)
                    │
                    └─▶ スケジュール配列をレンダラへ返却
```
- UI: `src/renderer/voice-input.js` が単一ドロワーの制御を担当。
- 音声再生: 登録確認時のみ VOICEVOX (`src/main/services/voicevox.js`).
- IPC: `voice-input-transcribe` チャネルのみ。

## 2. 設定ドロワーで音声操作したい項目
| 設定キー | UI要素 | 想定音声コマンド | 備考 |
| --- | --- | --- | --- |
| `phoneAlert.enabled` | チェックボックス | 「スマホアラートをオンにして」「スマホ検知の通知を切って」 | boolean 切替 |
| `phoneAlert.threshold` | range | 「スマホアラートを70に」「スマホ検知の感度を下げて」 | 0–100 |
| `absenceAlert.enabled` | チェックボックス | 「離席アラートを有効化」「離席通知オフ」 | |
| `absenceAlert.threshold` | range | 「離席アラートしきい値80」 | |
| `soundEnabled` | チェックボックス | 「効果音を止めて」 | |
| `desktopNotification` | チェックボックス | 「デスクトップ通知をオン」 | |
| `voicevoxSpeaker` | select | 「声を四国めたんに変えて」 | スピーカー名辞書必要 |
| `slackReporter.enabled` | チェックボックス | 「Slack レポートを有効化」 | |
| `slackReporter.schedule` | テキスト配列 | 「Slack 通知を19時に追加」 | 場合により LLM 必須 |

優先度: boolean 切替 ＞ スライダー ＞ セレクト ＞ Slack 時刻編集。

## 3. 音声チャットドロワー UX 要件
- 入出力: STT→LLM→TTS のフローでキャラクター音声返信。
- UI 要素
  - 会話履歴リスト（テキスト＆音声再生ボタン）
  - マイクボタン（録音状態/処理状態のフィードバック）
  - システムステータス領域（マイク・LLM・VOICEVOX）
- 応答速度: STT 完了 5 秒以内、LLM 応答 8 秒以内を目標。
- 並列制御: 会話中の録音中に TTS を停止すると中断イベントを送る。
- 記録保持: 直近 20 セッションを IndexedDB 保存、アプリ再起動で復元。

## 4. 利用エンジンと設定管理
- STT: 現状 Whisper CLI。`WHISPER_MODEL_PATH`, `WHISPER_BIN_PATH` を `.env` で管理。
- LLM: OpenAI API を継続利用。`OPENAI_API_KEY`, `OPENAI_BASE_URL`。
- TTS: VOICEVOX ローカルエンジン (`VOICEVOX_BASE_URL`)、将来 Azure/ElevenLabs 対応を想定。
- 設定管理: `.env.local` → `src/main/config/env.js`（新設予定）で集約読込。

## 5. 共通ガード要件
- マイク権限未許可時はセッション開始前に `navigator.permissions.query` とアラートを表示。
- VOICEVOX に疎通できない場合は TTS をスキップし、ユーザーへトースト表示。
- API キー未設定時は該当プロファイルを無効化し、UI に警告を出す。
- 録音中にウィンドウ非アクティブになった場合は録音を停止する保護を入れる。

## 6. アクションアイテム
- `docs/audio-input-implementation-plan.md` のフェーズごとに進捗をチェックしながら進める。
