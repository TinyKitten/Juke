# Claude Code 向け作業メモ

このリポジトリで作業する時に踏まないでほしい地雷と、既に検討して見送った方針のメモ。詳細仕様は `README.md` を読むこと。

## 最重要：再追加しないで欲しいもの

これらは**意図的に外してある**。再導入の依頼が来たら、まず下記の理由を確認すること。

- **Spotify Web Playback SDK** — Safari で DRM(FairPlay) 非対応、Premium 必須、SDKが重い。代わりに `https://open.spotify.com/track/<id>` か `/playlist/<id>` に別窓で飛ばす。
- **`/v1/recommendations`** — 2024年11月に新規アプリ向け廃止。使えない。
- **`/v1/audio-features` / `/v1/audio-analysis`** — 同上、新規廃止。気分/強さは `MOOD_INTENSITY_QUERIES`（`api/spotify.js`）の検索クエリ文字列で実現している。
- ~~**Apple Music / MusicKit JS**~~ — 2択→3択モーダルとして復活済。検索は Spotify、Apple Music は ISRC経由でライブラリプレイリスト作成の追加オプション。`src/apple.js`, `api/apple.js` 参照。
- **`preview_url` を使った30秒プレビュー再生** — 新規 Client ID では大半のトラックで `null` が返るので依存できない。

## Spotify API の二階建てを混同しないこと

1. **Client Credentials（アプリトークン）**
   - Secret をサーバ(Vercel Function)でだけ使う。`api/spotify.js` が代行。
   - 用途: `/v1/search`, `/v1/tracks`, `/v1/tracks?ids=...`
   - クライアントが直接 Spotify を叩くのは禁止（Secret 露出するため）。

2. **Authorization Code + PKCE（ユーザートークン）**
   - `src/spotify.js` でブラウザから直接。`VITE_SPOTIFY_CLIENT_ID` のみ必要（Secret 不要）。
   - scope: `user-read-private`, `playlist-modify-private`
   - 用途: プレイリスト作成・更新だけ。
   - トークンは `sessionStorage`。リフレッシュトークン未対応（セッション毎再ログイン）。

環境変数の `VITE_` prefix 有無を間違えないこと：
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — サーバ専用、ブラウザには渡らない
- `VITE_SPOTIFY_CLIENT_ID` — ビルド時にバンドルに埋め込まれる（Client ID は公開OK）

## 既知の落とし穴

- **React StrictMode による useEffect 二重呼び出し**で OAuth の `code` を二度交換しようとして `Token exchange failed (400)`。`handleCallback()` は module-level Promise でメモ化して対策済み。同じ問題を他の箇所に作らないこと。

- **`cleanUrl()` は `/` に `replaceState` する**。以前は `pathname` を保持していて `/callback` が残る問題があった。戻すなら別の方法を考える。

- **OAuth 経由でページが再読み込みされると、URL の `?moods=...&tracks=...` が消える**。ログインボタン押下時に `sessionStorage.juke.share.pending` と `juke.pending.action` の両方に状態を退避していて、コールバック後の effect が拾って復元する。どちらか片方だけ触ると復元が壊れる。

- **`vercel.json` の SPA rewrite は `/api/`, `/src/`, `/@`, `/node_modules/`, `/assets/` を除外している**。これを単純な `/(.*)` に戻すと `vercel dev` で Vite の内部 import が HTML を受け取って死ぬ。

- **`localStorage.juke.playlist.id` に1つだけ ID を保持**してプレイリストを使い回している。毎回作るとユーザーの Spotify が Juke だらけになる。`spotifyFetch` は空ボディを安全に処理する必要がある（`PUT /v1/playlists/{id}` は 200 + 空ボディを返す）。

- **Spotify Developer は Development Mode 25人制限**。OAuthログイン機能は Dashboard の Users and Access に登録されたアカウントしか通らない。Extended Quota は別途申請。

- **Apple Music は別カタログ**。Spotify で見つかる曲が Apple Music にない/ISRC不一致のケースあり。`fetchAppleSongsByIsrc` は見つからない曲をスキップ、結果 10曲→7曲などになる。UI上は警告していないので、必要なら counter を表示。

- **Apple Music 選択肢の表示制御** — 起動時に `/api/apple?action=status` を叩いて `APPLE_*` env の有無を確認し、未設定なら Apple Music の選択肢をモーダルから外す。新しい action を追加するときは status で露出判定も忘れず。

## ローカル開発

- `npm run dev` は Vite だけ。API が 404 になりモックトラックにフォールバック。モックには `external_url` が無いので「Spotifyで聴く」はdisabled。
- API 込みで確認したいなら `npx vercel dev`。初回に `vercel link` が走る。

## ドキュメント種別

- `README.md` — 全体のセットアップ・アーキテクチャ・制限事項（人間向け、AIもここから読む）
- `CLAUDE.md`（このファイル）— AIが作業するときの注意点だけ
- `.env.example` — 環境変数のテンプレート
