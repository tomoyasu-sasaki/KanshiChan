# 監視ちゃん 紹介サイト

このディレクトリには、Kanshichan (監視ちゃん) Electronアプリケーションの公式紹介サイトが含まれています。

## 公開URL
https://tmys-sasaki.github.io/kanshichan/

## 構成
- `index.html` - メインページ
- `assets/css/` - スタイルシート
- `assets/js/` - JavaScriptファイル
- `assets/images/screenshots/` - アプリケーションのスクリーンショット

## ローカル開発
このサイトは純粋なHTML/CSS/JavaScriptで構築されています。ローカルで確認するには:

```bash
# シンプルなHTTPサーバーを起動
cd docs
python3 -m http.server 8000
# http://localhost:8000 にアクセス
```

## デプロイ
GitHub Pagesで自動デプロイされます。`develop` ブランチの `/docs` フォルダが公開されます。

