# Kanchichan デザインシステム

## 概要

Kanchichan アプリケーションの統一されたデザインシステム規約。すべての UI コンポーネント、カラーパレット、タイポグラフィ、スペーシング、アニメーションはこの規約に準拠する。

## カラーパレット

### プライマリカラー

```css
--primary-start: #488a99  /* Dark Aqua - メインアクセントカラー */
--primary-end: #DBAES8    /* Gold - グラデーション終点 */
--primary-gradient: linear-gradient(135deg, #488a99 0%, #DBAES8 100%)
```

### ニュートラルカラー

```css
--charcoal: #FBE9E7       /* Charcoal - ベースカラー */
--gray: #B4B4B4           /* Gray - 中間色 */
--bg-dark-1: rgba(251, 233, 231, 0.98)    /* メインコンテナ背景 */
--bg-dark-2: rgba(241, 223, 221, 0.96)    /* セカンダリ背景 */
--bg-overlay: rgba(0, 0, 0, 0.7)          /* モーダルオーバーレイ */
--bg-light: #f5f5f7                       /* ライトモード背景 */
--bg-muted: #f8f9fa                       /* 控えめな背景色 */
--bg-monitor-dark: #202124                /* 監視画面用ダーク背景 */
```

### テキスト & ボーダーカラー

**テキストカラー (明るい背景用):**
```css
--text-primary: rgba(30, 30, 35, 0.95)     /* 主要テキスト - 濃いグレー */
--text-secondary: rgba(50, 50, 60, 0.85)   /* 二次テキスト - 中間グレー */
--text-tertiary: rgba(80, 80, 90, 0.7)     /* 三次テキスト - 薄いグレー */
```

**ボーダーカラー (明るい背景用):**
```css
--border-light: rgba(0, 0, 0, 0.1)         /* 軽いボーダー */
--border-medium: rgba(0, 0, 0, 0.15)       /* 中間ボーダー */
--border-strong: rgba(0, 0, 0, 0.25)       /* 強調ボーダー */
```

### フィードバックカラー

```css
--success: #51cf66
--warning: #ffd43b
--error: #ff6b6b
--info: #488a99
```

## タイポグラフィ

### フォントファミリー

```css
--font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Helvetica Neue', Arial, sans-serif
```

### フォントサイズスケール

```css
--text-xs: 0.75rem     /* 12px */
--text-sm: 0.82rem     /* 13.12px */
--text-base: 0.88rem   /* 14.08px */
--text-md: 1rem        /* 16px */
--text-lg: 1.1rem      /* 17.6px */
--text-xl: 1.5rem      /* 24px */
--text-2xl: 2rem       /* 32px */
```

### フォントウェイト

```css
--font-normal: 400
--font-medium: 500
--font-semibold: 600
--font-bold: 700
--font-extrabold: 800
```

## スペーシング

8px ベースのスペーシングシステムを使用。

```css
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
```

## ボーダーラジウス

```css
--radius-sm: 8px
--radius-md: 12px
--radius-lg: 14px
--radius-xl: 16px
--radius-2xl: 20px
--radius-full: 9999px
```

## シャドウ

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08)
--shadow-md: 0 8px 24px rgba(72, 138, 153, 0.15)
--shadow-lg: 0 16px 48px rgba(72, 138, 153, 0.25)
--shadow-xl: 0 32px 64px rgba(0, 0, 0, 0.6)
--focus-shadow: 0 0 0 3px rgba(72, 138, 153, 0.1)  /* フォーカス時のシャドウ */
```

## コンポーネント規約

### ドロワー (Drawer)

右側からスライドインする UI パネル。

**構造:**
```html
<div class="drawer" id="xxxDrawer">
  <div class="drawer-content">
    <div class="drawer-header">
      <h2>タイトル</h2>
      <button class="close-btn">×</button>
    </div>
    <div class="drawer-body">
      <!-- コンテンツ -->
    </div>
  </div>
</div>
```

**スタイル仕様:**
- 幅: `450px` (モバイル: `100%`)
- 背景: `var(--bg-dark-1)` + グラデーション
- アニメーション: `cubic-bezier(0.4, 0, 0.2, 1)` 0.3s
- ヘッダー背景: プライマリグラデーション
- ボーダー: `1px solid var(--border-light)`

### モーダル (Modal)

中央に表示される全画面オーバーレイダイアログ。

**構造:**
```html
<div class="modal" id="xxxModal">
  <div class="modal-backdrop"></div>
  <div class="modal-content">
    <div class="modal-header">
      <h2>タイトル</h2>
      <button class="close-btn">×</button>
    </div>
    <div class="modal-body">
      <!-- コンテンツ -->
    </div>
  </div>
</div>
```

**スタイル仕様:**
- 最大幅: `1200px` (モバイル: `92vw`)
- 最大高さ: `92vh`
- 背景: `linear-gradient(135deg, var(--bg-dark-1), var(--bg-dark-2))`
- バックドロップ: `backdrop-filter: blur(8px)`
- アニメーション: フェードイン + スライドアップ
- ボーダーラジウス: `var(--radius-2xl)`

### ボタン

#### プライマリボタン (btn-primary)

```css
background: var(--primary-gradient)
padding: 12px 30px
border-radius: var(--radius-md)
font-weight: var(--font-semibold)
transition: transform 0.2s, box-shadow 0.2s
```

**ホバー:**
- `transform: translateY(-2px)`
- `box-shadow: var(--shadow-md)`

#### セカンダリボタン (btn-secondary)

```css
background: rgba(255, 255, 255, 0.08)
border: 1px solid var(--border-medium)
padding: 10px 20px
color: var(--text-primary)
```

#### コンパクトボタン (btn-compact)

```css
padding: 8px 14px
font-size: var(--text-sm)
background: rgba(72, 138, 153, 0.15)
border: 1px solid rgba(72, 138, 153, 0.3)
```

### カード (Card)

情報をグループ化する汎用コンテナ。

```css
background: rgba(255, 255, 255, 0.03)
border: 1px solid var(--border-light)
border-radius: var(--radius-lg)
padding: var(--space-4)
transition: all 0.2s ease
```

**ホバー:**
```css
background: rgba(255, 255, 255, 0.05)
border-color: var(--border-medium)
```

### テーブル

データを表形式で表示。

**ヘッダー:**
```css
background: linear-gradient(180deg, rgba(72, 138, 153, 0.12), rgba(219, 174, 88, 0.08))
position: sticky
top: 0
font-weight: var(--font-bold)
font-size: var(--text-sm)
text-transform: uppercase
letter-spacing: 0.5px
padding: 12px 14px
```

**セル:**
```css
padding: 11px 14px
border-bottom: 1px solid rgba(255, 255, 255, 0.04)
color: var(--text-secondary)
```

**行ホバー:**
```css
background: rgba(72, 138, 153, 0.08)
```

**ストライプ (偶数行):**
```css
background: rgba(255, 255, 255, 0.02)
```

### KPI カード

統計情報を強調表示するカード。

```css
background: linear-gradient(135deg, rgba(72, 138, 153, 0.1), rgba(219, 174, 88, 0.08))
border: 1px solid var(--border-light)
border-radius: var(--radius-lg)
padding: var(--space-4)
position: relative
overflow: hidden
```

**トップアクセントライン:**
```css
content: ''
position: absolute
top: 0
left: 0
right: 0
height: 3px
background: var(--primary-gradient)
opacity: 0 → 1 (hover)
```

**ラベル:**
```css
font-size: var(--text-base)
font-weight: var(--font-semibold)
color: var(--text-secondary)
text-transform: uppercase
letter-spacing: 0.5px
```

**値:**
```css
font-size: var(--text-2xl)
font-weight: var(--font-extrabold)
background: linear-gradient(135deg, #fff, rgba(255, 255, 255, 0.85))
-webkit-background-clip: text
-webkit-text-fill-color: transparent
```

## アニメーション

### トランジション基本値

```css
--transition-fast: 0.15s ease
--transition-base: 0.2s ease
--transition-smooth: 0.3s cubic-bezier(0.4, 0, 0.2, 1)
```

### フェードイン

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### スライドアップ

```css
@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### スライドイン (右から)

```css
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
```

## スクロールバー

### デフォルトスクロールバー

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
```

### コンパクトスクロールバー (テーブル内など)

```css
width: 6px;
height: 6px;
```

## レスポンシブブレークポイント

```css
--breakpoint-sm: 640px   /* モバイル */
--breakpoint-md: 768px   /* タブレット */
--breakpoint-lg: 1024px  /* デスクトップ */
--breakpoint-xl: 1280px  /* 大画面 */
```

## コンポーネント固有の値

```css
--drawer-width: 450px        /* ドロワーの幅 */
--table-max-height: 320px    /* テーブルの最大高さ */
--chart-height: 280px        /* チャートの高さ */
```

### モバイル対応

```css
@media (max-width: 768px) {
  .drawer {
    width: 100%;
  }

  .modal-content {
    width: 95vw;
    max-height: 95vh;
    padding: 16px;
  }
}
```

## アクセシビリティ

### フォーカス状態

すべてのインタラクティブ要素にフォーカスリングを提供:

```css
:focus-visible {
  outline: 2px solid var(--primary-start);
  outline-offset: 2px;
}
```

### コントラスト比

- テキストとバックグラウンド: 最低 4.5:1 (WCAG AA)
- 大きなテキスト (18px+): 最低 3:1

## 使用ガイドライン

### DO ✅

- すべてのカラー、スペーシング、タイポグラフィに CSS 変数を使用
- 一貫したアニメーション速度とイージングを維持
- モバイルファーストでレスポンシブデザイン
- セマンティックな HTML タグを使用
- アクセシビリティを常に考慮

### DON'T ❌

- 固定値のハードコーディング
- 規約外のカラーやフォントサイズの使用
- 過度なアニメーション効果
- 一貫性のないスペーシング
- アクセシビリティの無視

## 更新履歴

- 2025-10-05 (v2): 実装に基づく大規模更新
  - テキストカラーを明るい背景用に変更 (白 → ダークグレー系)
  - ボーダーカラーを明るい背景用に変更 (白系 → 黒系)
  - 追加の背景色変数を定義 (`--bg-light`, `--bg-muted`, `--bg-monitor-dark`)
  - フォーカスシャドウ変数を追加
  - コンポーネント固有の値を追加 (ドロワー幅、テーブル高さ、チャート高さ)
  - 重複定義の削除とCSS変数の統一化を実施
- 2025-10-05 (v1): 初版作成 - カラーパレット、タイポグラフィ、コンポーネント規約定義

## 実装状況

### ✅ 完了した改善

1. **重複定義の削除**
   - スクロールバースタイル: base.css でグローバル定義、個別ファイルから削除
   - `.slider-container`, `.slider-value`: drawer.css に統一
   - `.button-group`, `.save-message`: drawer.css に統一

2. **カラーの統一**
   - `#667eea` → `var(--primary-start)` (12箇所を置換)
   - `#333` → `var(--text-primary)` (グレー系を統一)
   - `#555` → `var(--text-secondary)`
   - `#999`, `#666` → `var(--text-tertiary)`

3. **CSS変数の拡充**
   - 背景色変数の追加
   - フォーカスシャドウ変数の追加
   - コンポーネント固有の値の追加

### 📋 今後の改善候補 (優先度低)

- ハードコードされたスペーシング値をCSS変数に置換 (78箇所)
- ハードコードされたフォントサイズをCSS変数に置換 (24箇所)
- アニメーション定義の base.css への統合
