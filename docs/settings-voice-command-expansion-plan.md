# 設定ドロワー音声コマンド機能拡充 計画書

## 1. 辞書構造の拡張
- [x] ✅ `SETTINGS_VOICE_MAP` を階層化し、各設定に `intents`, `units`, `validation` などのメタ情報を追加する
- [x] ✅ 既存の boolean/number/select ハンドリングを新メタ情報に対応させる
- [x] ✅ 同義語・否定語・肯定語を `audio` プロフィール共通で再利用できるようユーティリティ化
- [x] ✅ 拡張辞書導入後の回帰テスト（主要設定コマンド）を手動で実施し記録

## 2. LLM プロンプト & スキーマ改善
- [x] ✅ `AUDIO_PROMPT_PROFILES.settings.llm.systemPrompt` に複数コマンド・増減操作の例を追加
- [x] ✅ 設定コマンド用 JSON Schema を `{ action: set|toggle|increase|decrease, value, reason }` に拡張
- [x] ✅ メインプロセスの LLM レスポンスパーサー（`settingsCommand`）を新スキーマへ対応
- [x] ✅ プロンプトとスキーマ変更後の音声テスト（最低 5 パターン）を実施・記録

## 3. コマンド処理パイプラインの柔軟化
- [x] ✅ `handleVoiceCommandResult` をステップ毎に分割（入力整形 → 実行 → 永続化 → フィードバック）
- [x] ✅ `applySingleVoiceCommand` の結果型を `success | retry | confirm` に拡張し、UI 側に選択肢を委譲
- [x] ✅ 結果表示コンポーネントを汎用化し、トースト表示や音声フィードバック呼び出しに対応
- [x] ✅ Slack/タイピング設定の Busy 状態と競合しないキューイング処理を追加

## 4. 学習的拡張（任意フェーズ）
- [x] ✅ 未解決コマンドの発話と設定候補を保存するローカル辞書を設計
- [x] ✅ 辞書エントリの追加・削除を UI から行える設定メニューを作成
- [x] ✅ 定期的な辞書クリーニングとエクスポート/インポート機能を検討

## 5. ドキュメント & リリース準備
- [x] ✅ `docs/development-guidelines.md` に音声コマンド辞書の更新手順を追記
- [x] ✅ 新機能のテスト項目と回帰手順を `docs/testing/` 配下に追加
- [x] ✅ リリースノート草案に音声コマンド機能拡充の概要と利用例を記載
