# Claude Code 向け作業メモ

このリポジトリで作業する時に踏まないでほしい地雷と、既に検討して見送った方針のメモ。詳細仕様は `README.md` を読むこと。

## 最重要：再追加しないで欲しいもの

これらは**意図的に外してある**。再導入の依頼が来たら、まず下記の理由を確認すること。

- **Spotify 連携（全撤去済）** — 以前は Spotify PKCE + Web Playback SDK + Client Credentials を使っていたが、Development Mode の 25人制限と Safari DRM 問題で Apple Music に全面移行済み。
- **MusicKit JS の in-app Player 再生** — 実装可能だが体感UXの都合で `music.apple.com/.../song/<id>` に別窓で飛ばす方式。
- **`preview_url` を使った30秒プレビュー** — Juke内で再生はしない方針。

## Apple Music API の二階建てを混同しないこと

1. **Developer Token（JWT ES256）**
   - Apple Developer の .p8 秘密鍵でサーバ(Vercel Function)側でだけ署名する。`api/apple.js` が発行。
   - クライアントも `GET /api/apple?action=devToken` で取得するが、MusicKit JS の初期化にしか使わない（カタログAPIはVercel Function経由）。
   - 最長6ヶ月だが、このアプリでは30日で再発行。

2. **Music User Token（MusicKit JS）**
   - ブラウザ上で `music.authorize()` を呼ぶと Apple の認証UIが出てユーザートークンを取得。
   - OAuth ではないので redirect_uri は不要。
   - MusicKit JS が Cookie ベースでセッション管理するので、リフレッシュ処理の実装は不要。

環境変数：
- `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` — サーバ専用、絶対に VITE_ prefix にしない
- クライアント側に渡す環境変数は無し（Developer Token は /api/apple 経由で取得）

## 既知の落とし穴

- **`APPLE_PRIVATE_KEY` の改行処理** — Vercel の環境変数は改行を `\n` リテラルで保存することがある。`api/apple.js` の getDevToken で `\\n` を実改行に置換してから `importPKCS8` に渡している。

- **MusicKit JS の読み込みイベント** — `<script>` の `onload` ではなく `document.addEventListener('musickitloaded', ...)` を待つ必要がある。`src/apple.js` の `loadMusicKit()` でこれを処理。

- **Apple Music 曲ID の形式** — Spotifyと違い純粋な数字列（例: `1234567890`）。URL: `https://music.apple.com/jp/song/<id>`。

- **Apple Music ライブラリ プレイリスト ID** — `p.xxxxxxxxx` 形式。URLは `https://music.apple.com/library/playlist/<id>`。catalog playlist (`pl.`) と別物。

- **`localStorage.juke.apple.playlist.id` に1つだけ ID を保持**してプレイリストを使い回している。毎回作るとユーザーの Apple Music ライブラリが Juke だらけになる。

- **Storefront** — Apple Music API は storefront (`jp`, `us`, 等) が必須。このアプリは `jp` 固定。他国の曲を検索したい場合はユーザーの storefront を `/v1/me/storefront` から取得して可変化する必要あり。

- **`vercel.json` の SPA rewrite は `/api/`, `/src/`, `/@`, `/node_modules/`, `/assets/` を除外している**。これを単純な `/(.*)` に戻すと `vercel dev` で Vite の内部 import が HTML を受け取って死ぬ。

## ローカル開発

- `npm run dev` は Vite だけ。API が 404 になりモックトラックにフォールバック。モックには `external_url` が無いので「Apple Musicで聴く」はdisabled。
- API 込みで確認したいなら `npx vercel dev`。初回に `vercel link` が走る。`.env` がそのまま読まれる。

## ドキュメント種別

- `README.md` — 全体のセットアップ・アーキテクチャ・制限事項（人間向け、AIもここから読む）
- `CLAUDE.md`（このファイル）— AIが作業するときの注意点だけ
- `.env.example` — 環境変数のテンプレート
