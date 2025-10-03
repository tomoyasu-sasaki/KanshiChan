# Kanchichan

Web カメラ映像のリアルタイム監視と日次スケジュール管理を組み合わせた Electron デスクトップアプリです。YOLOv11 (ONNX Runtime) で人物 / スマホを検知し、時間経過によってアラートや VOICEVOX 読み上げを発火します。

## 主な機能
- **リアルタイム監視**: Web カメラ映像に対して YOLOv11 で人物 / スマホを検知し、バウンディングボックスを描画。
- **自動監視**: 起動後 0.5 秒で自動的にカメラを開始し、省電力スリープを抑止して監視継続。
- **スマホ / 不在アラート**: 閾値秒数を超えるとデスクトップ通知・ビープ音・VOICEVOX 読み上げを実施。
- **スケジュール管理**: localStorage に予定を保持し、5 分前と開始時刻に通知。
- **ドロワー UI**: 監視画面、設定、スケジュール、ログを単一ページで切り替え。

## 必要環境
- Node.js 18 以上 (Electron v38 が依存)
- macOS 13 以上を推奨（アクティブウィンドウ取得が AppleScript 依存）
- Xcode Command Line Tools または同等のビルドツール（`canvas` / `onnxruntime-node` がネイティブビルドを要求）
- VOICEVOX エンジン (HTTP API) がローカルで起動済みであること（オプション: 読み上げ機能）

## セットアップ
```bash
npm install
# YOLO モデルを models/yolo11n.onnx として配置
npm start
```
起動時に macOS のカメラ許可ダイアログが表示されます。許可後、監視が自動開始されます。

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

## 使い方のヒント
- ツールバー中央の「⏸️ / ▶️」ボタンで監視の開始/停止を切り替え。
- スケジュールドロワーで予定を追加すると localStorage に保存され、5 分前と開始時刻に VOICEVOX / 通知が発火します。
- 設定ドロワーでスマホ / 不在アラートの閾値・感度を調整できます。変更後は自動で `monitor.js` に反映されます。

## よくある質問
- **VOICEVOX が起動していないときは？**
  - 読み上げリクエストはエラー扱いとなり、UI 側にはアラートが表示されません（ログのみに記録）。
- **Windows / Linux でアクティブウィンドウ取得は動く？**
  - 現状は macOS の AppleScript 依存です。Windows / Linux では空の結果が返ります。
