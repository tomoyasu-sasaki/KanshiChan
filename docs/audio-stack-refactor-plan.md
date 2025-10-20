# 音声処理スタック再編 実装計画

## 1. レガシー音声入力経路の整理
- [x] `preload.js` から `voiceInputTranscribe` / `voiceInputCheckAvailability` を削除し、新 API のみ公開
- [x] `src/renderer/services/stt-client.js` からレガシーフォールバック（`voiceInputTranscribe` 分岐・`legacyRawResult`）を除去
- [x] `src/renderer/services/audio-input-manager.js` で `legacyRawResult` 依存を排除し、新レスポンス形式に一本化
- [x] `src/main/services/voice-input.js` と関連 IPC (`voice-input-*`) を削除し、呼び出し側が新 API に移行済みであることを確認
- [x] 旧 API の削除に伴うドキュメント更新（`docs/audio-input-architecture.md` からレガシー経路の記述を削除）

## 2. STT/LLM/TTS パイプラインの責務分離
- [x] `AudioInputManager` を Recorder / Pipeline / Playback の 3 モジュールに分割し、状態保持はストア経由に整理
- [x] 新 Recorder モジュールで MediaRecorder と Permission チェックを担当し、テストしやすい I/F を定義
- [x] Pipeline モジュールで STT→LLM の直列処理と結果正規化を集約し、例外ハンドリングを一本化
- [x] Playback モジュールで TTS 再生キューとエラー処理を担当し、他モジュールが直接 `Audio` を扱わないようにする
- [x] 分割後のエントリーポイントとして軽量な `audioInputManager` ファサードを用意し、既存コンポーネントの I/F を維持

## 3. TTS 呼び出しの統一
- [x] `src/renderer/services/tts-adapter.js` に読み上げキュー機能と VOICEVOX オプション適用ロジックを拡張
- [x] `src/renderer/monitor/alerts.js` と `src/renderer/schedule/tts.js` を `tts-adapter` 利用に書き換え、重複コードを削除
- [x] スケジュール通知の VOICEVOX 話者 ID を設定ストアから取得するヘルパを `tts-adapter` 側に用意
- [x] エラー・再生終了イベントのログ出力ポリシーを統一し、再試行戦略（例: ドロップ）を決定

## 4. VOICEVOX 設定の一貫適用
- [x] 設定保存時に VOICEVOX 話者・速度などを共有ストアへ反映する仕組みを追加
- [x] `AudioInputControl` の `metadata` 生成で現在の VOICEVOX 設定を参照し、`session.metadata.ttsOptions` に `engineOptions` を格納
- [x] Pipeline が生成した応答を再生する際、`ttsOptions` から VOICEVOX オプションを適用することをテスト
- [x] スケジュール作成 UI と音声チャットの双方で設定変更が即時反映されることを手動検証

## 5. スケジュール TTS メッセージ生成の整理
- [x] `audioService.infer('schedule')` のレスポンスに TTS メッセージを含めるよう拡張し、重複プロンプト呼び出しを排除
- [x] `ipcMain.handle('schedule-generate-tts')` を削除し、`renderer/schedule/form.js` からの個別リクエストを廃止
- [x] LLM プロンプト定義（`constants/llm-prompts.js`）を一本化し、重複メンテナンスを防止

## 6. ドキュメント・テスト・移行作業
- [x] `docs/audio-input-architecture.md` と `docs/audio-input-requirements.md` を新構成に合わせて更新
- [x] 手動テストチェックリスト（音声入力・スケジュール通知・モニタアラート・チャット）を追記
- [x] 主要モジュール分割後の ESLint/型チェック（存在すれば）と動作確認 (`npm start`) を実施
- [x] 既存ログ・設定ストレージに互換性があることを確認し、必要ならマイグレーション手順を追記
