# 音声入力機能アーキテクチャ

## 全体フロー
```
マイク (MediaRecorder)
   │  startSession()
   ▼
Renderer: audio-input-manager
   │  ├─ STT 要求 `audio-transcribe`
   │  ├─ LLM 推論 `audio-infer`
   │  └─ TTS 合成 `tts-speak`
   ▼
Main Process: services/audio.js
   │  ├─ Whisper (whisper.cpp) で文字起こし
   │  ├─ Swallow 8B LLM で用途別推論
   │  └─ VOICEVOX HTTP API で音声合成
   ▼
Renderer: 各ドロワー (schedule / settings / chat)
```

## 主要モジュール
- `src/renderer/services/audio-input-manager.js`
  - 音声セッションの状態管理。録音・STT・LLM・TTS の逐次呼び出しと履歴保存を担当。
  - `onStatus` / `onTranscription` / `onPartialResult` / `onResult` コールバックで各 UI へ通知。
- `src/renderer/components/audio-input-control.js`
  - 共通マイク UI。用途別コンポーネント（スケジュール、設定、チャット）が再利用。
- `src/main/services/audio.js`
  - STT, LLM, TTS を束ねるエントリポイント。
  - Whisper を用いた `transcribe`、用途別 `infer`（スケジュール・設定・チャット）、`checkAvailability` を提供。
- `src/main/services/llm.js`
  - スケジュール抽出 (`extractScheduleFromText`) とチャット応答生成 (`generateChatReply`) を実装。
- `src/constants/audioProfiles.js`
  - プロファイル ID ごとの説明・システムプロンプト・TTS フィールド設定を定義。

## IPC チャネル
| Channel | Direction | Payload | 概要 |
| --- | --- | --- | --- |
| `audio-transcribe` | Renderer → Main | `{ audioDataBase64, language }` | Whisper で文字起こしを実行し `transcribedText` を返す |
| `audio-infer` | Renderer → Main | `{ profileId, text, context }` | プロファイルごとの LLM/ルール推論を実行 |
| `audio-check-availability` | Renderer → Main | `-` | Whisper/LLM 利用可否チェック |
| `tts-speak` | Renderer → Main | `{ text, engine, options }` | VOICEVOX で合成し data URL を返却 |
| `voice-input-transcribe` | Renderer → Main | legacy | 旧スケジュール音声入力との後方互換用 |

## プロンプトプロファイル
| プロファイル ID | 用途 | LLM モード | 出力 | TTS | 備考 |
| --- | --- | --- | --- | --- | --- |
| `schedule` | スケジュール登録 | Structured JSON | `schedules[]` | `ttsMessage` | 既存の抽出ロジックをファクト化 |
| `settings` | 監視設定の更新 | ルールベース + LLM 拡張予定 | `commands[]` | - | 不明時はレンダラで正規表現フォールバック |
| `chat` | 音声チャット | Conversational | `reply`, `segments` | `reply` | LlamaChatSession でカジュアル文を生成 |

`audio-input-manager` はプロファイルの `tts.defaultMessageField` を参照して自動読み上げ文を取得します。

## 履歴と永続化
- 音声入力履歴 (`audioInputStore`) はメモリ保持。開発者向けには `audio-input-manager` から購読可能（デフォルト UI では利用していません）。
- チャット履歴は `localStorage['kanshichan.chat.history']` に保存し、再起動後も復元。
- 設定音声操作は適用後に `handleSaveSettings()` を呼び出し、既存の保存フローを再利用。

## エラーハンドリング
- 各 IPC で例外は `{ success: false, error: message }` にラップして返却。
- `AudioInputControl` がエラーを控え目に表示し、ドロワーごとに追加の UI 告知を実装可能。
- Whisper / LLM 未設定時は `audio-check-availability` が詳細メッセージを提供。
