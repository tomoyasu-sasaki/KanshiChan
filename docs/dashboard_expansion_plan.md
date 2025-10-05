# Dashboard Expansion Implementation Plan

## Context
- macOS 専用・個人利用を想定した Electron アプリ。
- 既存の検知ログとアプリ滞在ログが SQLite (`src/main/db/index.js`) に蓄積され、ダッシュボード (`src/renderer/dashboard.js`) で可視化されている。
- 新機能の主眼は (1) 13:00 / 18:00 に Slack へ統計を自動送信する定期レポート、(2) キータイピング監視の導入、(3) macOS 固有イベントの補助的な活用。
- 配布は考慮しない前提のため、ネイティブ依存や個人用設定ファイルの追加を許容できる。

## Phase 0 — 現状把握と準備
- [x] ✅ `src/main/ipc/register-handlers.js` と `src/preload.js` を読み、ダッシュボード関連 IPC と `window.electronAPI` のエクスポートを整理する。
- [x] ✅ `src/main/services` 配下の既存サービス構成と起動フロー（`main.js` → `src/main/create-window.js`）を確認し、常駐ジョブ追加地点を決める。
- [x] ✅ ローカル SQLite スキーマとメンテナンス方法を把握し、必要ならばマイグレーション用ユーティリティを用意する（`src/main/db/index.js`）。
- [x] ✅ Slack Webhook/API 利用のためのシークレット管理方式を決める（環境変数 or `~/Library/Application Support/kanchichan/config.json` 等）。
- [x] ✅ ネイティブモジュール（`iohook` など）をビルドできるよう `node-gyp` と Xcode CLT の環境を確認する。

## Phase 1 — Slack 定期レポート機能
- [x] ✅ 15秒ポーリングの自前スケジューラを実装し、定刻発火を管理。
- [x] ✅ `src/main/services/slack-reporter.js`（新規）を作成し、データ取得・レポート生成・送信の責務を分離：
  - [x] ✅ 13:00 / 18:00 のジョブ登録ロジックを実装し、タイムゾーン（macOS ローカル）を明示。
  - [x] ✅ `src/main/db` のヘルパーを使い、対象期間の統計（総イベント数、アラート件数、最多バケット、トップアプリなど）を集計。
  - [x] ✅ Slack 送信用ユーティリティ（Incoming Webhook or Bot Token + `@slack/web-api`）を実装し、メッセージテンプレートを JSON/Block Kit 形式で整備。
  - [x] ✅ 送信結果・失敗時の再試行をロギングし、必要ならば `slack_report_logs` テーブルを追加。
- [x] ✅ スケジューラ初期化を `main.js` 起動シーケンスに組み込み、アプリ終了時にクリーンアップ。
- [x] ✅ 設定 UI を `src/pages/settings`（既存があれば流用）に追加し、Webhook URL・送信時刻・手動送信ボタンを IPC 経由で保存/呼び出せるようにする。
- [x] ✅ ダッシュボードに最新送信時刻や失敗履歴の表示コンポーネントを追加。

## Phase 2 — キータイピング監視の導入
- [x] ✅ `iohook` などのグローバルキーフックを導入し、macOS ネイティブライブラリのビルドを確認。
- [x] ✅ `src/main/services/typing-monitor.js`（新規）を作成し、以下を実装：
  - [x] ✅ フックの開始/停止制御と、キー押下イベントから 1 分単位でカウントする集計バッファ。
  - [x] ✅ 個人利用前提でもキー内容を保存しないポリシーを徹底（キーコードと回数のみ保持）。
  - [x] ✅ 集計結果を SQLite に蓄積するためのテーブル `typing_activity_logs` を追加（マイグレーション）。
  - [x] ✅ 休止モード（ユーザー手動 or スリープ検知）切替 API を公開。
- [x] ✅ IPC ハンドラを整備し、ダッシュボードから監視トグルや最新統計を取得できるようにする。
- [x] ✅ バックグラウンドでの安定性を確認し、CPU/メモリ負荷を測定。

## Phase 3 — ダッシュボード UI の拡張
- [x] ✅ `src/renderer/dashboard.js` に Typing 系データセットを追加し、既存 `DATASET_GROUPS` に新しいグループ（`typing`）を組み入れる。
- [x] ✅ KPI カードに「総キー入力数」「平均キー入力/分」「最長連続入力時間」を追加し、Slack レポートと整合させる。
- [x] ✅ ログテーブルにタイピング専用タブ or フィルターを追加し、アクティブアプリ別・時間帯別の入力状況を表示。
- [x] ✅ 休憩ステータストグルや監視状態表示を UI に配置し、IPC と連携。
- [ ] メニューバー常駐ウィジェット（任意）を追加する場合は、`src/main/services` に MenuBar 管理を追加し、簡易 KPI を常時表示。

## Phase 4 — macOS 固有イベントの活用（オプション強化）
- [x] ✅ `NSWorkspace` 通知を Electron で受け取れるようにする（`powerMonitor` でロック/スリープを検知）。
- [x] ✅ 画面ロック・スリープ・ヘッドフォン接続などのイベントを取得し、Typing 監視と Slack レポートに反映。
- [ ] Screen Time やアクティブアプリ履歴 API を調査し、利用可能ならアプリ使用ログと突合。
- [x] ✅ 追加したイベントをダッシュボードにタイムライン表示し、レポートに含めるか選択可能にする。

## Phase 5 — テスト・運用フロー
- [x] ✅ Slack 送信機能のユニットテスト/モックテストを `src/main/services/__tests__/slack-reporter.test.js`（新規）に追加。
- [x] ✅ タイピング監視の集計ロジックを単体テストし、擬似イベントでバケット集計が正しいか検証。
- [ ] ダッシュボードのレンダリングについて `jest` + `@testing-library/dom` でスナップショット or 重要ロジックのテストを追加。
- [x] ✅ `docs/` にユーザー向け利用ガイド（設定手順、Slack テンプレート、プライバシーポリシー）を整備。
- [x] ✅ 動作確認チェックリスト（スケジュール送信、手動送信、監視トグル、macOS イベント反映）を作成し、リグレッション時にも再利用できるようにする。

## Deliverables
- 新規サービスモジュール：`src/main/services/slack-reporter.js`, `src/main/services/typing-monitor.js`。
- Slack/Typing 用マイグレーションとデータアクセス関数：`src/main/db` 配下。
- 設定 UI・ダッシュボード UI 更新：`src/renderer/dashboard.js` ほか。
- ドキュメント更新：`docs/` 配下ガイド類。
- 自動テストと検証スクリプト。

## Notes
- 個人利用前提でも、プライバシー保護（キー内容未保存）と Slack シークレット管理は明示。
- macOS ネイティブ API 利用は将来の OS アップデートで破綻し得るため、切り替えスイッチとフォールバック（無効化）を用意しておく。
- バックグラウンド常駐機能を増やすため、アプリ終了時のリソース解放とクラッシュ時の再起動戦略（`app.setLoginItemSettings` など）も検討する。
