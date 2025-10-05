# Kanchichan

Web カメラ映像のリアルタイム監視と日次スケジュール管理を組み合わせた Electron デスクトップアプリです。YOLOv11 (ONNX Runtime) で人物 / スマホを検知し、時間経過によってアラートや VOICEVOX 読み上げを発火します。

## 主な機能
- **リアルタイム監視**: Web カメラ映像に対して YOLOv11 で人物 / スマホを検知し、バウンディングボックスを描画。
- **自動監視**: 起動後 0.5 秒で自動的にカメラを開始し、省電力スリープを抑止して監視継続。
- **スマホ / 不在アラート**: 閾値秒数を超えるとデスクトップ通知・ビープ音・VOICEVOX 読み上げを実施。
- **音声入力スケジュール登録**: マイクボタンから音声でスケジュールを登録。Whisper (STT) + LLM で日時を自動抽出。
- **スケジュール管理**: localStorage に予定を保持し、5 分前と開始時刻に通知。
- **ドロワー UI**: 監視画面、設定、スケジュール、ログを単一ページで切り替え。

## 必要環境
- Node.js 20 以上（`node-llama-cpp` の要件）
- macOS 13 以上を推奨（アクティブウィンドウ取得が AppleScript 依存）
- Xcode Command Line Tools または同等のビルドツール（`canvas` / `onnxruntime-node` がネイティブビルドを要求）
- **CMake** (音声入力機能を使用する場合、whisper.cpp のビルドに必要)
- **ffmpeg** (音声形式変換に使用)
- VOICEVOX エンジン (HTTP API) がローカルで起動済みであること（オプション: 読み上げ機能）

## セットアップ

### 基本セットアップ
```bash
npm install
# YOLO モデルを models/yolo11n.onnx として配置
npm start
```
起動時に macOS のカメラ許可ダイアログが表示されます。許可後、監視が自動開始されます。

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

Whisper モデル (`ggml-base.bin`) と LLM モデル (`llmjp-3.1-1.8b-instruct4-q5.gguf`) を `models/` ディレクトリに配置してください。

```bash
models/
├── ggml-base.bin                         # Whisper 音声認識モデル (約148MB)
├── llmjp-3.1-1.8b-instruct4-q5.gguf      # LLM スケジュール抽出モデル (約1.9GB)
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
# llmjp-3.1-1.8b-instruct4-q5.gguf をダウンロード
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
mkdir -p /path/to/kanchichan/bin
cp build/bin/whisper-cli /path/to/kanchichan/bin/

# whisper-cli へのパスを環境変数で指定（PATH に追加済みなら不要）
export WHISPER_CLI_PATH=/path/to/kanchichan/bin/whisper-cli
```

#### 4. マイク権限の許可

初めて音声入力を使用する際、macOS のマイク許可ダイアログが表示されます。「許可」を選択してください。

## ディレクトリ構成
```
kanchichan/
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
│  │      └─ voicevox.js
│  ├─ pages/
│  │  └─ index.html              # 監視 UI（単一ページ）
│  ├─ preload.js                 # contextBridge で安全な IPC API を公開
│  ├─ renderer/                  # レンダラロジック
│  │  ├─ app.js                  # ツールバー・ドロワー・時計などの UI 制御
│  │  ├─ monitor.js              # カメラストリーム、YOLO 検知、通知判定
│  │  ├─ schedule.js             # スケジュール CRUD と通知
│  │  └─ settings.js             # 閾値・通知設定の保存と UI 反映
│  ├─ styles/                    # 機能別に分割したスタイルシート
│  │  ├─ base.css
│  │  ├─ drawer.css
│  │  ├─ monitor.css
│  │  ├─ schedule.css
│  │  ├─ settings.css
│  │  └─ style.css               # 各 CSS を @import するエントリーポイント
│  └─ utils/
│      └─ yolo-detector.js       # ONNXRuntime を用いた YOLO 推論ユーティリティ
└─ docs/comment-guidelines.md    # コメント規約
```

## 実装ハイライト
### メインプロセス
- `main.js` でバックグラウンドスロットリングを停止し、`YOLODetector` を初期化。
- IPC ハンドラは `src/main/ipc/register-handlers.js` に集約。
- VOICEVOX との通信は `src/main/services/voicevox.js` で HTTP API をラップ。
- アクティブウィンドウ取得は AppleScript (`osascript`) を経由 (`active-window.js`)。

### レンダラ
- `monitor.js` がカメラストリーム読み込み、0.5 秒間隔の検知、タイマー更新、通知判定を担当。
- `settings.js` / `schedule.js` は constants 経由で既定値を取得し、localStorage 保存時に欠損を補完。
- VOICEVOX 読み上げや通知送信は `window.electronAPI` (preload 経由) を通じてメインプロセスに委譲。

### スタイル
- 旧 `style.css` を機能別に分割し、コメント規約に従ったファイル概要を付記。
- 監視ビュー・ドロワー・設定フォームなどは専用 CSS に切り出し、保守性を向上。

## 使い方

### 基本的な使い方
- **監視機能**: 起動すると自動的にカメラが開始され、人物/スマホを検知します
- **スケジュール登録**: スケジュールドロワーで予定を追加すると localStorage に保存され、5 分前と開始時刻に通知
- **設定**: 設定ドロワーでスマホ / 不在アラートの閾値・感度を調整可能

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

## トラブルシューティング

### 音声入力が動作しない場合

#### 「モデルが見つかりません」エラー
- `models/ggml-base.bin` と `models/llmjp-3.1-1.8b-instruct4-q5.gguf` が正しく配置されているか確認
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

#### スケジュールが通知されない
- ブラウザ/Electronの通知権限を確認してください
- スケジュール登録後、`schedules-updated` イベントが発火しているかコンソールログで確認
