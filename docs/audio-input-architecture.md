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
  - セッション制御のエントリーポイント。Recorder / Pipeline / Playback モジュールを束ね、`audioInputStore` を更新。
  - `onStatus` / `onTranscription` / `onPartialResult` / `onResult` コールバックで各 UI へ通知。
- `src/renderer/services/audio-input/recorder.js`
  - MediaRecorder とマイク権限チェックをラップし、録音完了時に Base64 音声をコールバックで返却。
- `src/renderer/services/audio-input/pipeline.js`
  - `audio-transcribe` → `audio-infer` の直列呼び出しを行い、文字起こしと LLM 結果をまとめて返す。
- `src/renderer/services/tts-adapter.js`
  - VOICEVOX 向けの再生キュー (`queueVoicevoxSpeech`) と設定解決 (`resolveVoicevoxOptions`) を提供。
- `src/renderer/services/voicevox-preferences.js`
  - 設定ドロワーの保存結果をキャッシュし、最新の話者/速度をレンダラ全体で共有。
- `src/renderer/components/audio-input-control.js`
  - 共通マイク UI。用途別コンポーネント（スケジュール、設定、チャット）が再利用し、音声入力開始時に VOICEVOX 設定を自動注入。
- `src/main/services/audio.js`
  - STT, LLM, TTS を束ねるメインプロセス側の統合サービス。`transcribe` / `infer` / `checkAvailability` を公開。
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

## 手動テストチェックリスト
- 音声入力ドロワーで録音 → 文字起こし → LLM 応答 → VOICEVOX 再生が順番に実行されること。
- 設定ドロワーで話者を変更し、即座に音声入力・スケジュール通知・モニタアラートの読み上げが切り替わること。
- スケジュール通知（リード/開始）が重複再生せず、キューで順番に読み上げられること。
- 音声チャットで連続セッションを実行しても履歴とストアが正しく更新されること。
