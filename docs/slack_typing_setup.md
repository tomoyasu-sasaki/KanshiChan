# Slack & タイピング監視の設定ガイド

## Slack 定期レポート
1. Slack の Incoming Webhook URL を取得し、アプリの `設定 > Slack レポート設定` に貼り付けます。
2. 送信時刻を `HH:MM` 形式でカンマ区切り指定（例: `09:00,13:00,18:00`）。
3. `Slack設定を保存` を押して反映し、`今すぐ送信` で接続テストを行います。
4. 送信履歴と最新ステータスはダッシュボードの「Slack レポート状況」で確認できます。

## タイピング監視
1. 初回はアクセシビリティ許可が必要です。`設定 > セキュリティとプライバシー > アクセシビリティ` でアプリにチェックを入れます。
2. `uiohook-napi` を Electron 向けにビルドしておきます（例: `npm install uiohook-napi --build-from-source --runtime=electron --target=38.2.0 --disturl=https://electronjs.org/headers`）。失敗した場合は `npx electron-rebuild -f -w uiohook-napi` を試してください。
3. ダッシュボードの「タイピングアクティビティ」から監視トグルを有効にします。
4. 休止/再開ボタンで一時的に監視を停止できます。
5. 集計は 1 分単位で記録され、「タイピングアクティビティ」テーブルに反映されます。
6. Slack レポートにも総キー入力数と連続入力時間が含まれます。
