# 画面監視プレビュー ON/OFF 機能 実装計画

## 1. 監視設定スキーマ拡張
- [x] `DEFAULT_MONITOR_SETTINGS` に `previewEnabled` (既定値 `true`) を追加する ✅  
- [x] `cloneDefaultSettings` / `loadSettings` / `saveSettings` で新プロパティを扱い、既存データのフォールバックを確認する ✅  
- [x] レンダラ初期化 (`initializeSettings`, `reloadSettings`) で `previewEnabled` を `monitorState.settings` に反映する ✅  
- [x] `window.reloadMonitorSettings` 実行時にプレビュー設定が同期されることを確認する ✅  

## 2. 設定ドロワー UI 追加
- [x] 「表示設定」セクションに「監視プレビューを表示」チェックボックスを追加する ✅  
- [x] `bindElements` / `collectSettingsFromForm` / `applySettings` へ新入力要素を組み込む ✅  
- [x] 設定保存 (`handleSaveSettings`) 後に `window.reloadMonitorSettings` がプレビュー状態を反映できることを手動確認する ✅  

## 3. モニタリング描画ロジック調整
- [x] `monitor/context.js` に `previewEnabled` の状態キャッシュを追加する（必要なら） ✅  
- [x] `startRenderLoop` / `renderLoop` で `previewEnabled` が `false` の場合は描画処理をスキップし、ハンドルをリセットする ✅  
- [x] プレビューが再度有効化された際に描画ループが再開するよう、設定リロード後に `startRenderLoop` を呼び直すフローを追加する ✅  
- [x] 検出ループ (`performDetection`) がプレビュー非表示でも継続することを確認する ✅  

## 4. プレビュー非表示時の UI 表現
- [x] `.camera-feed` または子要素へ `preview-hidden` などのクラスを付与し、CSS で `visibility: hidden` / 最小サイズ化を適用する ✅  
- [x] プレビュー停止中であることを示すステータスメッセージやインジケーターのトグル表示を検討し、必要なら実装する ✅  

## 5. 相互作用・副作用チェック
- [x] `showDetections` との組み合わせでボックス描画が正しく抑制されるか確認する ✅  
- [x] 音声コマンドやその他設定モジュールが `previewEnabled` を参照／更新する必要があるかを調査し、必要なら対応する ✅  
- [x] 既存の localStorage に新プロパティが無い場合でもアプリが壊れないか確認する ✅  

## 6. 検証
- [ ] `npm start` で手動確認し、プレビュー OFF 時でもスマホ検知・不在検知アラートが発火することを確認する  
- [ ] プレビュー ON/OFF を複数回切り替えても描画ループが重複開始しないことを確認する  
- [ ] UI が非表示の間もログ・ダッシュボード更新が継続することを確認し、必要ならログ出力で検証する  
