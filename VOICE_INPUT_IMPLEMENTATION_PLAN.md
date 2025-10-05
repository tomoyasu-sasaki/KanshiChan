# 音声入力機能 実装計画

## 概要
Whisperを使用した音声入力により、音声からスケジュールを自動登録する機能を実装する。

### 技術スタック
- **STT (音声認識)**: `nodejs-whisper` (whisper.cpp Node.jsバインディング)
- **LLM (テキスト整形)**: `node-llama-cpp` (llama.cpp Node.jsバインディング)
- **音声録音**: MediaRecorder API (Web API)
- **IPC通信**: Electron IPC (既存パターン踏襲)

---

## フェーズ1: 環境準備 ✅

### 1.1 依存パッケージのインストール
- [x] `nodejs-whisper` をインストール
- [x] `node-llama-cpp` をインストール
- [x] package.json の dependencies を更新

### 1.2 Whisperモデルの準備
- [x] models/ ディレクトリに Whisper モデル配置場所を確認
- [x] Whisper モデルのダウンロード方法を README に記載
- [x] モデルパス定数を定義 (src/constants/whisper-config.js)

### 1.3 LLM プロンプト設計
- [x] スケジュール抽出用のシステムプロンプトを作成
- [x] JSON Schema 定義 (日時、タイトル、説明)
- [x] プロンプトテンプレートを定数ファイルに配置 (src/constants/llm-prompts.js)

---

## フェーズ2: バックエンド実装 (Main Process) ✅

### 2.1 Whisper サービス実装
- [x] `src/main/services/whisper.js` を作成
- [x] Whisper モデルロード関数を実装
  - [x] モデルパス解決
  - [x] モデルインスタンス初期化
  - [x] エラーハンドリング
- [x] 音声データから文字起こし関数を実装
  - [x] Base64 音声データをバッファに変換
  - [x] WAVフォーマット検証
  - [x] Whisper推論実行
  - [x] 文字起こし結果を返却

### 2.2 LLM サービス実装
- [x] `src/main/services/llm.js` を作成
- [x] LLM モデルロード関数を実装
  - [x] models/ 配下の GGUF モデルパス解決
  - [x] モデルインスタンス初期化
  - [x] コンテキストサイズ設定
- [x] テキスト整形関数を実装
  - [x] システムプロンプト適用
  - [x] JSON Schema 強制出力設定
  - [x] LLM推論実行
  - [x] JSON パース & バリデーション

### 2.3 音声入力統合サービス実装
- [x] `src/main/services/voice-input.js` を作成
- [x] エンドツーエンド処理関数を実装
  - [x] 音声データ受信
  - [x] Whisper でSTT
  - [x] LLM でテキスト整形
  - [x] スケジュール構造化データ返却
  - [x] エラーハンドリング & ロギング

### 2.4 IPC ハンドラ追加
- [x] `src/main/ipc/register-handlers.js` に新規ハンドラ追加
- [x] `voice-input-transcribe` ハンドラを実装
  - [x] 音声データバリデーション
  - [x] voice-input サービス呼び出し
  - [x] 結果/エラーレスポンス返却

---

## フェーズ3: フロントエンド実装 (Renderer Process) ✅

### 3.1 UI コンポーネント追加
- [x] `src/pages/index.html` ツールバーにマイクボタン追加
  - [x] マイクアイコン追加 (🎤)
  - [x] ボタンID: `voiceInputBtn`
  - [x] ツールチップ設定
- [x] 音声入力モーダル/ドロワーを追加
  - [x] 録音状態表示 (録音中/処理中/完了)
  - [x] 文字起こし結果プレビュー
  - [x] スケジュール確認 & 編集UI
  - [x] キャンセル/確定ボタン

### 3.2 音声録音機能実装
- [x] `src/renderer/voice-input.js` を作成
- [x] MediaRecorder セットアップ
  - [x] マイク権限リクエスト
  - [x] MediaStream 取得
  - [x] MediaRecorder インスタンス生成
- [x] 録音開始/停止機能
  - [x] 録音開始ボタンハンドラ
  - [x] 録音停止ボタンハンドラ
  - [x] 録音データ (Blob) 収集
- [x] 音声データ変換
  - [x] Blob → ArrayBuffer
  - [x] ArrayBuffer → Base64
  - [x] WAVフォーマット確認

### 3.3 IPC 通信実装
- [x] `src/preload.js` に API 露出
  - [x] `voiceInputTranscribe` メソッド追加
- [x] `src/renderer/voice-input.js` から IPC 呼び出し
  - [x] 音声データ送信
  - [x] レスポンス受信
  - [x] エラーハンドリング

### 3.4 スケジュール登録フロー統合
- [x] 文字起こし結果表示
  - [x] 認識されたテキストを表示
  - [x] LLM整形結果 (日時/タイトル/説明) を表示
- [x] スケジュール編集機能
  - [x] 日時の手動修正
  - [x] タイトルの手動修正
  - [x] 説明の手動修正
- [x] スケジュール確定処理
  - [x] 既存の `save-schedule` IPC ハンドラ呼び出し
  - [x] スケジュール一覧に反映
  - [x] モーダル/ドロワーを閉じる

---

## フェーズ4: スタイリング ✅

### 4.1 ボタンスタイル
- [x] `src/styles/style.css` にマイクボタンスタイル追加
- [x] ホバー効果
- [x] アクティブ状態 (録音中) の視覚フィードバック

### 4.2 モーダル/ドロワースタイル
- [x] 音声入力ドロワーのレイアウト
- [x] 録音中アニメーション (波形/ドット)
- [x] 処理中スピナー
- [x] プレビューセクションのスタイル

### 4.3 レスポンシブ対応
- [x] 小さいウィンドウサイズでの表示確認
- [x] ツールバーのアイコン配置調整

---

## フェーズ5: テスト & デバッグ

### 5.1 ユニットテスト
- [ ] Whisper サービスのテスト
  - [ ] モデルロード成功ケース
  - [ ] 音声データ変換テスト
  - [ ] 文字起こし結果検証
- [ ] LLM サービスのテスト
  - [ ] モデルロード成功ケース
  - [ ] JSON Schema 出力検証
  - [ ] プロンプト動作確認

### 5.2 統合テスト
- [ ] エンドツーエンドフロー
  - [ ] 録音 → STT → LLM → スケジュール登録
  - [ ] エラーケース (モデル未配置)
  - [ ] エラーケース (音声認識失敗)
  - [ ] エラーケース (LLM パース失敗)

### 5.3 UI/UX テスト
- [ ] マイクボタンクリック動作
- [ ] 録音開始/停止の視覚フィードバック
- [ ] モーダル開閉動作
- [ ] スケジュール編集 & 確定フロー

### 5.4 パフォーマンステスト
- [ ] 初回モデルロード時間計測
- [ ] 音声認識処理時間計測
- [ ] LLM推論時間計測
- [ ] メモリ使用量確認

---

## フェーズ6: ドキュメント整備

### 6.1 README 更新
- [ ] 音声入力機能の使い方を追加
- [ ] 必要なモデルファイルの説明
- [ ] モデルダウンロード手順
- [ ] トラブルシューティング

### 6.2 コメント & 型定義
- [ ] JSDoc コメント追加
- [ ] 関数の引数/戻り値を明記
- [ ] 定数ファイルに説明追加

---

## フェーズ7: 最適化 & 拡張

### 7.1 パフォーマンス最適化
- [ ] モデルの遅延ロード (初回使用時)
- [ ] モデルキャッシュ戦略
- [ ] 音声データ圧縮

### 7.2 機能拡張 (オプション)
- [ ] リアルタイム音声認識 (ストリーミング)
- [ ] 複数スケジュール一括登録
- [ ] 音声コマンド (スケジュール削除/編集)
- [ ] 認識精度の設定UI
- [ ] 言語選択 (日本語/英語)

---

## 完了条件

- [ ] すべてのフェーズ1-6のタスクが完了
- [ ] 音声入力からスケジュール登録までのフローが正常動作
- [ ] エラーハンドリングが適切に実装されている
- [ ] UI/UXが既存機能と統一されている
- [ ] ドキュメントが整備されている

---

## 備考

### モデルファイル配置
```
models/
├── ggml-base.bin              # Whisper モデル (例: base)
├── llmjp-3.1-1.8b-instruct4-q5.gguf  # 既存LLMモデル
└── README.md                  # モデル説明
```

### JSON Schema 例
```json
{
  "type": "object",
  "properties": {
    "schedules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "date": { "type": "string", "format": "date" },
          "time": { "type": "string", "pattern": "^([01]\\d|2[0-3]):([0-5]\\d)$" },
          "description": { "type": "string" }
        },
        "required": ["title", "date", "time"]
      }
    }
  }
}
```

### 参考実装パターン
- VOICEVOX 連携: `src/main/services/voicevox.js`
- IPC ハンドラ: `src/main/ipc/register-handlers.js`
- ドロワーUI: `src/pages/index.html` (スケジュール/設定ドロワー)
