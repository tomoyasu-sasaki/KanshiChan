# Kanshichan

Web カメラ映像のリアルタイム監視と日次スケジュール管理を組み合わせた Electron デスクトップアプリです。YOLOv11 (ONNX Runtime) で人物 / スマホを検知し、時間経過によってアラートや VOICEVOX 読み上げを発火します。

## 主な機能
- **リアルタイム監視**: Web カメラ映像に対して YOLOv11 で人物 / スマホを検知し、バウンディングボックスを描画。
- **スマホ / 不在アラート**: 閾値秒数を超えるとデスクトップ通知・ビープ音・VOICEVOX 読み上げを実施。
- **一時的な不在許可 (PASS)**: 昼休憩や買い出しなど一時的に監視を止めたいとき、プリセットまたはカスタム時間で不在検知を一時停止。許可中の不在は統計・アラート・Slack レポートから除外され、履歴と差分もダッシュボードで確認できます。
- **Slack 定期レポート**: 毎日 13:00 / 18:00 に検知統計・前面アプリ滞在時間・macOS システムイベントを Slack Incoming Webhook に投稿。メッセージには「当日累積」と「直近送信以降の差分」の 2 セクションを同梱し、手動送信や時刻変更は設定ドロワーから操作できます。
- **タイピング監視**: `uiohook-napi` を用いたグローバルキーフックで 1 分単位の入力数・最長連続入力時間を記録。ダッシュボードと Slack レポートで可視化できます。
- **前面アプリ滞在ログ**: アプリごとの合計滞在時間に加え、Chrome についてはドメイン/タイトル単位のトップ10を表示。
- **システムイベント記録**: 画面ロック/解除・スリープ/復帰・シャットダウンなどのイベントを取得し、ダッシュボードに時間順で表示。
- **音声入力ショートカット**: スケジュール・設定ドロワーに音声ボタンを内蔵。Whisper (STT) + LLM/ルールベース処理で日時・しきい値・通知設定を抽出し、フォームへ自動反映します。
- **音声チャットドロワー**: STT→LLM→VOICEVOX のパイプラインでアプリに話しかけると、キャラクター音声で応答します。会話履歴はローカルに保存され、ストリーミングで途中生成も表示。
- **ドロワー UI とスケジュール管理**: 監視・設定・スケジュール・ログ・ダッシュボードを単一ページで切り替え。

## 必要環境
- Node.js 20 以上（`node-llama-cpp` の要件）
- macOS 13 以上を推奨（アクティブウィンドウ取得とシステムイベント検出が macOS API 依存）
- Xcode Command Line Tools / CMake / pkg-config（`canvas` や `uiohook-napi` などネイティブモジュールのビルドに必要）
- **ffmpeg** (音声形式変換に使用)
- VOICEVOX エンジン (HTTP API) がローカルで起動済みであること（オプション: 読み上げ機能）
- Slack Incoming Webhook URL（Slack 定期レポートを利用する場合）
- アクセシビリティ権限（タイピング監視を利用する場合）

## セットアップ

### 基本セットアップ
```bash
npm install
# YOLO モデルを models/yolo11n.onnx として配置
npm start
```
起動時に macOS のカメラ許可ダイアログが表示されます。許可後、監視が自動開始されます。

### タイピング監視を有効にする場合

1. `uiohook-napi` を Electron 用にビルドします。
   ```bash
   npm install uiohook-napi --build-from-source \
     --runtime=electron --target=38.2.0 \
     --disturl=https://electronjs.org/headers
   npx electron-rebuild -f -w uiohook-napi
   ```
2. macOS の「システム設定 > プライバシーとセキュリティ > アクセシビリティ」でアプリを追加し、チェックを入れます。
3. 設定ドロワーの「⌨️ タイピング監視設定」から監視を有効化できます。

### 音声入力機能のセットアップ（オプション）

音声入力機能を使用する場合は、以下の追加セットアップが必要です。

#### 1. 必要ツールのインストール
```bash
# macOS の場合
brew install cmake ffmpeg

# Ubuntu/Debian の場合
sudo apt install cmake ffmpeg

# Windows の場合
# CMake: https://cmake.org/download/
# ffmpeg: https://ffmpeg.org/download.html
```

#### 2. モデルファイルの配置

Whisper モデル (`ggml-base.bin`) と LLM モデル (`swallow-8b-v0.5-q4.gguf`) を `models/` ディレクトリに配置してください。

```bash
models/
├── ggml-base.bin                         # Whisper 音声認識モデル (約148MB)
├── swallow-8b-v0.5-q4.gguf      # LLM スケジュール抽出モデル (約1.9GB)
├── yolo11n.onnx                          # YOLO 物体検知モデル
└── README.md                             # モデル説明
```

**Whisper モデルのダウンロード:**
```bash
# models/ ディレクトリに移動
cd models

# base モデルをダウンロード
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ggml-base.bin
```

**LLM モデルのダウンロード:**
```bash
# swallow-8b-v0.5-q4.gguf をダウンロード
# Hugging Face などから取得して models/ に配置
```

#### 3. whisper-cli のビルド

whisper.cpp の公式リポジトリから CLI をビルドし、PATH に追加するか `WHISPER_CLI_PATH` 環境変数で場所を指定してください。

```bash
# 任意の作業ディレクトリで
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_EXAMPLES=ON
cmake --build build --config Release --target whisper-cli -j 4

# 例: プロジェクト直下の bin/ に配置
mkdir -p /path/to/kanshichan/bin
cp build/bin/whisper-cli /path/to/kanshichan/bin/

# whisper-cli へのパスを環境変数で指定（PATH に追加済みなら不要）
echo 'export WHISPER_CLI_PATH="$HOME/Projects/Public/kanshichan/bin/whisper-cli"' >> ~/.zshrc
```

#### 4. マイク権限の許可

初めて音声入力を使用する際、macOS のマイク許可ダイアログが表示されます。「許可」を選択してください。

## ディレクトリ構成
```
kanshichan/
├─ main.js                        # 電源管理 / IPC / YOLO 初期化を司るメインプロセスエントリ
├─ models/                        # YOLO ONNX モデル配置ディレクトリ
├─ src/
│  ├─ constants/                 # 各レイヤ共通の設定・定数
│  │  ├─ app.js
│  │  ├─ monitor.js
│  │  ├─ schedule.js
│  │  ├─ voicevox-config.js
│  │  └─ yolo-classes.js
│  ├─ main/                      # メインプロセスの補助モジュール
│  │  ├─ create-window.js
│  │  ├─ ipc/register-handlers.js
│  │  └─ services/
│  │      ├─ active-window.js
│  │      ├─ audio.js            # STT / LLM / TTS を束ねる音声サービス
│  │      ├─ absence-override.js # 不在許可の状態管理と SQLite 永続化
│  │      ├─ voice-input.js      # 後方互換用の音声入力統合
│  │      └─ voicevox.js
│  ├─ pages/
│  │  └─ index.html              # 監視 UI（単一ページ）
│  ├─ preload.js                 # contextBridge で安全な IPC API を公開
│  ├─ renderer/                  # レンダラロジック
│  │  ├─ app.js                  # ツールバー・ドロワー・時計などの UI 制御
│  │  ├─ monitor.js              # カメラストリーム、YOLO 検知、通知判定
│  │  ├─ schedule.js             # スケジュール CRUD と通知
│  │  ├─ settings.js             # 閾値・通知設定の保存と UI 反映
│  │  └─ chat.js                 # 音声チャットドロワーの状態管理
│  ├─ styles/                    # 機能別に分割したスタイルシート
│  │  ├─ base.css
│  │  ├─ drawer.css
│  │  ├─ monitor.css
│  │  ├─ schedule.css
│  │  ├─ settings.css
│  │  ├─ voice-input.css
│  │  ├─ chat.css
│  │  └─ style.css               # 各 CSS を @import するエントリーポイント
│  └─ utils/
│      └─ yolo-detector.js       # ONNXRuntime を用いた YOLO 推論ユーティリティ
├─ docs/comment-guidelines.md    # コメント規約
└─ docs/absence-override-guide.md# 不在許可 (PASS) の運用ガイドと検証手順
```

## 実装ハイライト
### メインプロセス
- `main.js` でバックグラウンドスロットリングを停止し、`YOLODetector` を初期化。
- IPC ハンドラは `src/main/ipc/register-handlers.js` に集約。
- VOICEVOX との通信は `src/main/services/voicevox.js` で HTTP API をラップ。
- アクティブウィンドウ取得は AppleScript (`osascript`) を経由 (`active-window.js`)。
- 不在許可は `services/absence-override.js` と SQLite (`absence_override_events` テーブル) で管理し、IPC から全ウィンドウへブロードキャストしています。

### レンダラ
- `monitor.js` がカメラストリーム読み込み、0.5 秒間隔の検知、タイマー更新、通知判定を担当。
- `settings.js` / `schedule.js` は constants 経由で既定値を取得し、localStorage 保存時に欠損を補完。
- VOICEVOX 読み上げや通知送信は `window.electronAPI` (preload 経由) を通じてメインプロセスに委譲。
- 不在許可の状態管理は `services/absence-override.js` で行い、監視ビューと設定ドロワーの両方に同期しています。

### スタイル
- 旧 `style.css` を機能別に分割し、コメント規約に従ったファイル概要を付記。
- 監視ビュー・ドロワー・設定フォームなどは専用 CSS に切り出し、保守性を向上。
- PASS バッジや不在許可カードは `monitor.css` / `settings.css` に定義し、デザインシステムのカラートークンと統一しています。

## 使い方

### 基本的な使い方
- **監視機能**: 起動すると自動的にカメラが開始され、人物/スマホを検知します
- **スケジュール登録**: スケジュールドロワーで予定を追加すると localStorage に保存され、5 分前と開始時刻に通知
- **設定**: 設定ドロワーでスマホ / 不在アラートの閾値・感度を調整可能
- **検知ダッシュボード**: ツールバーの 📊 ボタンから開くモーダルで、検知ログ・アラート件数・前面アプリ滞在時間を時系列に可視化できます

### 一時的な不在許可 (PASS)
- 設定ドロワー上部の「🚶‍♂️ 一時的な不在許可」でプリセット（昼休憩、トイレ、買い出し など）を押すと、その時間で即座に不在検知が PASS になります。
- 理由と滞在時間を自由に設定したい場合はカスタム入力を編集し「許可を開始」を押してください。
- 許可中は監視ビュー右上に緑色の `PASS` バッジが表示され、不在アラート・Slack レポート・統計から除外されます。
- 早めに戻った場合は「許可を終了」を押すと即時解除され、履歴に手動終了として記録されます。自動終了した場合は自動終了として履歴に残ります。
- 詳細な運用手順と検証ステップは `docs/absence-override-guide.md` にまとめています。

### 音声入力でスケジュール登録

1. **マイクボタンをクリック**: ツールバーのマイクアイコンをクリックして音声入力ドロワーを開く
2. **録音開始**: 「録音開始」ボタンをクリック（または自動で録音開始）
3. **音声入力**: 例: 「今日の15時に会議」「明日の10時に歯医者」など話す
4. **録音停止**: 「録音停止」ボタンをクリック
5. **自動処理**:
   - Whisper で音声を文字起こし
   - LLM でスケジュール情報（日時・タイトル・説明）を抽出
6. **確認・編集**: 抽出されたスケジュールを確認し、必要に応じて編集
7. **登録**: 「スケジュール登録」ボタンで確定

**音声入力のヒント:**
- 日時を明確に話す: 「今日の15時」「明日の午後3時」「10月10日の10時」
- タイトルを含める: 「〜に会議」「〜で打ち合わせ」「〜を食べる」
- 詳細も話せる: 「会議室Aで新規プロジェクトについて」など

### 検知ダッシュボードの使い方
1. ツールバーの 📊 ボタンをクリックするとダッシュボードモーダルが開きます
2. 期間・集計単位・イベント種別のフィルターを切り替えるとグラフとテーブルが更新されます
3. 「前面アプリ滞在時間」セクションでは、直近のアプリ別・ドメイン別滞在合計を確認できます（最短 5 秒以上の前面表示が対象）
4. 「最新ログ」テーブルは CSV にエクスポート可能です
5. 「最新を取得」ボタンで手動更新、モーダル表示中に新しい検知/アプリ記録が発生した場合は自動で再取得されます
6. 不在許可が有効な期間は KPI に「許可済み不在」「未許可の不在」として差分が表示され、ログタブには許可開始/延長/終了の履歴が追加されます

### Slack レポートの仕組み
- 設定ドロワーで Slack Webhook を登録し、送信時刻をカンマ区切りで指定します（例: `13:00,18:00`）。
- レポート本文の前半は当日 0:00 から送信時刻までの累積サマリー、後半は直近の成功送信以降に発生した差分サマリーを表示します。
- 差分セクションは履歴に成功送信が存在する場合のみ追加され、手動送信 (`今すぐ送信`) も同じロジックで生成されます。
- 送信結果は `slack_report_logs` テーブルに保存され、ダッシュボードの Slack 履歴リストから確認できます。

### データベース (SQLite)
- 検知ログと前面アプリ滞在時間は SQLite データベース `kanshichan.db` に保存されます
- ファイルの場所（macOS の例）: `~/Library/Application Support/kanshichan/kanshichan.db`
- バックアップしたい場合はアプリ終了後に上記ファイルをコピーしてください
- データをリセットしたい場合はファイルを削除すると再作成されます（既存データは失われます）

## トラブルシューティング

### 音声入力が動作しない場合

#### 「モデルが見つかりません」エラー
- `models/ggml-base.bin` と `models/swallow-8b-v0.5-q4.gguf` が正しく配置されているか確認
- モデルファイルのパーミッションを確認: `chmod 644 models/*.bin models/*.gguf`

#### 「whisper-cli executable not found」エラー
- whisper.cpp のビルドに失敗しているか、CLI へのパスが通っていない可能性があります
- `whisper-cli` を再ビルドし、PATH へ追加するか `WHISPER_CLI_PATH` を設定してください

#### 「音声ファイルの変換に失敗しました」エラー
- ffmpeg がインストールされているか確認: `which ffmpeg`
- インストール: `brew install ffmpeg` (macOS)

#### 「文字起こしに失敗しました」エラー
- マイクの権限が許可されているか確認（システム環境設定 > セキュリティとプライバシー > マイク）
- 録音した音声が短すぎる可能性があります（最低2-3秒話してください）

#### 「スケジュール抽出に失敗しました」エラー
- LLMモデルのメモリ不足の可能性があります（2GB以上の空きメモリが必要）
- 日時を明確に話してください（例: 「今日の15時」「明日の午前10時」）

### その他の問題

#### VOICEVOX が起動していないときは？
- 読み上げリクエストはエラー扱いとなり、UI 側にはアラートが表示されません（ログのみに記録）

#### Windows / Linux でアクティブウィンドウ取得は動く？
- 現状は macOS の AppleScript 依存です。Windows / Linux では空の結果が返ります

#### ダッシュボードに表示されるアプリ滞在時間が空
- 5 秒未満で切り替えたアプリは集計対象外です
- 監視開始後に前面アプリが変更されることで記録されるため、起動直後はデータが少ない場合があります

#### スケジュールが通知されない
- ブラウザ/Electronの通知権限を確認してください
- スケジュール登録後、`schedules-updated` イベントが発火しているかコンソールログで確認
