# Juke

> 気分を選ぶと、今日あなたに合いそうな10曲を並べるWebアプリ。

気分タグを最大3つ選ぶと Apple Music からキュレートして、そのまま Apple Music で聴ける。Apple Music にサインインすれば、ライブラリに並び通りのプレイリストを自動作成。

## 主要機能

- 気分タグ（12種）× 強さ（3段階）で 5〜10曲のプレイリスト生成
- 結果のURLはブックマーク可能（`?moods=...&intensity=N&tracks=id1,id2,...`）
- Apple Music に別窓で遷移して再生
    - サインインしない → 1曲目だけ開く（Apple Music の自動再生に委ねる）
    - Apple Music サインイン → ユーザーのライブラリにプレイリストを作成して並び通り再生
- PWA対応（iOS/Androidでホーム画面に追加可）
- ライト/ダーク/OS追従の3テーマ

## 技術スタック

- **React 18** + **Vite 6** (JSX, no TypeScript)
- **Vercel Serverless Functions** (`api/apple.js`) — MusicKit Developer Token (JWT ES256) 発行と Apple Music API 代行
- **MusicKit JS v3** — Music User Token 取得 + プレイリスト操作
- **jose** — ES256 で JWT 署名
- **vite-plugin-pwa** + Workbox — Manifest / Service Worker / ランタイムキャッシュ

## アーキテクチャ

### Apple Music API の使い分け

2種類のトークンを使い分けている：

| 用途 | フロー | トークン保持場所 | 用途範囲 |
|---|---|---|---|
| カタログ検索・曲取得 | Developer Token (ES256 JWT) | Vercel 関数で生成・キャッシュ (30日) | `/v1/catalog/{storefront}/search`, `/v1/catalog/{storefront}/songs` |
| プレイリスト作成 | Music User Token | MusicKit JS が Cookie 管理 | `/v1/me/library/playlists` |

**Developer Token は Apple の .p8 秘密鍵で JWT 署名する必要がある**。これを絶対にクライアントに露出させないため、Vercel Function (`api/apple.js`) で生成する。

**Music User Token はブラウザ上で MusicKit JS が `music.authorize()` を通じて取得**する。OAuth のリダイレクトは発生せず、Apple の認証UIが同じページ上にオーバーレイで出る。

### 画面遷移

```
input (気分選択)
  └─ submit → loading → result
                          ├─ 「気分を変える」 → input
                          ├─ 「別の10曲にする」 → loading → result
                          └─ 「Apple Musicで聴く」
                               ├─ サインイン済 → プレイリスト同期 → 別窓でApple Music
                               └─ 未サインイン → モーダル2択
                                     ├─ 1曲目だけ開く → 別窓で song URL
                                     └─ Apple Musicでサインイン → MusicKit認証 → プレイリスト作成 → 別窓
```

### 共有URL復元

プレイリスト生成時に `history.replaceState` で URL を `?moods=...&intensity=N&tracks=id1,...` に更新。
ブックマーク等で再訪すると `parseShareParams` がURLから読み取り、`fetchTracks`（`/v1/catalog/jp/songs?ids=...`）で曲を復元して結果画面にジャンプ。

### キャッシュ層

1. **Vercel Function の in-memory Developer Token キャッシュ** — 30日分の JWT を再利用
2. **HTTP キャッシュヘッダ** — `public, max-age=120, s-maxage=600, stale-while-revalidate=1200`
3. **Service Worker (Workbox)** — `/api/apple` を StaleWhileRevalidate、30分TTL
4. **クライアント in-memory Map** — 2分TTL（`src/apple.js`）

## ディレクトリ構成

```
api/
  apple.js             Vercel Function: Developer Token発行 + search/songs/playlist 代行
public/
  icon-512.png         PWA用マスクアイコン (512x512)
  icon-apple.png       apple-touch-icon 専用 (角丸)
src/
  main.jsx             ReactDOM.createRoot エントリ
  Root.jsx             Appラッパー、Tweaksパネルのキーボード切替 (` キー)
  App.jsx              全UI・状態管理・Share URL
  apple.js             API client + MusicKit JS + プレイリスト同期
  Tweaks.jsx           開発者向けテーマ/レイアウト切替パネル
  styles.css           全スタイル
index.html             PWA metaタグ・favicon設定
vite.config.js         Vite + PWA plugin設定
vercel.json            SPAリライト (/api, /src, /@ 等を除外)
```

## セットアップ

### 1. Apple Developer Program

1. [https://developer.apple.com](https://developer.apple.com) でApple Developer Programに登録（$99/年）
2. [Identifiers](https://developer.apple.com/account/resources/identifiers) で **MusicKit Identifier** を作成
3. [Keys](https://developer.apple.com/account/resources/authkeys) で新しいキーを作成し、**MusicKit**を有効化
4. `.p8` ファイルをダウンロード（1回のみ可能、保管注意）
5. 画面から **Team ID** と **Key ID** をメモ

### 2. 環境変数

`.env.example` をコピーして `.env` を作成：

```bash
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIG...\n-----END PRIVATE KEY-----"
```

`.p8` ファイルの改行を `\n` エスケープするか、複数行リテラルでそのまま貼る。本番(Vercel)にも同じ3つの環境変数を追加。

### 3. 依存関係

```bash
npm install
```

## 開発

```bash
# APIなし(モック曲にフォールバック) - 見た目確認用
npm run dev

# API込みで実動作確認 (推奨)
npx vercel dev
```

`npm run dev` は Vite のみ起動するため `api/apple.js` が404になり、アプリは `pickTracks` のモック曲にフォールバックする。モック曲には `external_url` が無いので「Apple Musicで聴く」ボタンはdisabledになる。

**実際の挙動を確認するなら `vercel dev` を使う**（初回は `vercel link` でプロジェクト紐付け）。`.env` がそのまま読まれる。

### キーボードショートカット

- `` ` `` （バッククォート）— Tweaks パネル表示切替

## デプロイ (Vercel)

1. GitHub リポジトリを Vercel に接続
2. Environment Variables に `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` を追加
3. Framework Preset: Vite（自動検出）
4. デプロイ

`vercel.json` がAPIルート保護 + SPAリライトを設定済み。

## URLスキーム

| URL | 意味 |
|---|---|
| `/` | 入力画面 |
| `/?moods=happy,chill&intensity=1&tracks=<id1>,<id2>,...` | 特定プレイリスト復元（ブックマーク用途） |

Apple Music の song IDは数字列(`1234567890`)なので共有URLは Spotify 時代より短い。

## 既知の制限

### Apple Music サブスクリプション

- **曲の全編再生には Apple Music 加入が必要**。未加入ユーザーは 30秒プレビューのみ聴ける（Apple Music アプリ/サイト側で制御）。
- **ライブラリ プレイリスト作成は加入不要** と思われるが、サインインは必要。

### ブラウザ互換性

MusicKit JS v3 は全主要ブラウザで動くが、Safariが最もスムーズ。Chrome/Firefox/Edge も基本OK。

### Developer Token の扱い

- `.p8` 秘密鍵は絶対に Git に commit しない・ブラウザに露出しない
- Developer Token は最大6ヶ月有効だが、このアプリでは30日で再発行して余裕を持たせている

## トラブルシューティング

### `MusicKit JSの読み込みに失敗しました`
→ ネットワーク or CSP がCDN (`js-cdn.music.apple.com`) をブロックしてる。

### Apple の認証UIが出ない
→ ブラウザの third-party cookie がブロックされてる場合に起きる。Safariは比較的緩い。

### プレイリストを再利用せず新規作成される
→ `localStorage.juke.apple.playlist.id` がクリアされた or 既存プレイリストが削除済み。次回同期時に新規作成される（正常動作）。

## 設計で検討して見送ったこと

- **完全な in-app 再生** — MusicKit JS の Player を使えば埋め込み再生可能だが、DRM や体感UXの都合で別窓遷移にしている
- **Apple Music 以外の音楽プロバイダ** — Spotify版もあったが、Development Mode 25人制限 + Web Playback SDK の制約でApple Music に全面移行
