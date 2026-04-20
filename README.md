# Juke

> 気分を選ぶと、今日あなたに合いそうな10曲を並べるWebアプリ。

[https://juke.tinykitten.dev](https://juke.tinykitten.dev)

気分タグを最大3つ選ぶと Spotify から曲をキュレートし、**Spotify または Apple Music** で聴ける。非公開プレイリストを自動作成する機能もあり（要ログイン）。

## 主要機能

- 気分タグ（12種）× 強さ（3段階）で 5〜10曲のプレイリスト生成
- 結果のURLはブックマーク可能（`?moods=...&intensity=N&tracks=id1,id2,...`）
- 再生時にモーダルで3択：
    - **1曲目だけ開く**（ログイン不要、Spotifyの自動再生に委ねる）
    - **Spotifyログイン** → 非公開プレイリストを作って並び通り再生
    - **Apple Musicサインイン** → ISRC で Apple Music カタログに解決し、ライブラリにプレイリスト作成
- PWA対応（iOS/Androidでホーム画面に追加可）
- ライト/ダーク/OS追従の3テーマ

**検索は Spotify を使用**し、Apple Music はプレイリスト作成の代替オプション。`APPLE_*` 環境変数が未設定なら Apple Music 選択肢はモーダルに表示されない。

## 技術スタック

- **React 18** + **Vite 6** (JSX, no TypeScript)
- **Vercel Serverless Functions**
  - `api/spotify.js` — Client Credentialsでの Spotify API 代行
  - `api/apple.js` — Apple Music Developer Token (JWT ES256) 発行 + ISRC lookup
- **MusicKit JS v3** — Apple Music User Token 取得とライブラリ操作
- **jose** — Apple Developer キーで ES256 JWT 署名
- **vite-plugin-pwa** + Workbox — Manifest / Service Worker / ランタイムキャッシュ

## アーキテクチャ

### Spotify API の使い分け

2種類のトークンを使い分けている：

| 用途 | フロー | トークン保持場所 | 用途範囲 |
|---|---|---|---|
| 検索・トラック取得 | Client Credentials | Vercel関数の in-memory キャッシュ | `/v1/search`, `/v1/tracks` |
| プレイリスト作成 | Authorization Code + PKCE | ブラウザ `sessionStorage` | `/v1/me`, `/v1/users/{id}/playlists`, `/v1/playlists/{id}/*` |

**Client Credentials は Client Secret が必須**。これを絶対にクライアントに露出させないため、検索系は Vercel Function (`api/spotify.js`) で代理実行する。

**PKCE はユーザーの Spotify アカウントに対するもの**で、プレイリスト作成(`playlist-modify-private` scope)のみに必要。Client Secretは使わない。Redirect URI に `<origin>/callback` を登録する必要あり。

### 画面遷移

```
input (気分選択)
  └─ submit → loading → result
                          ├─ 「気分を変える」 → input
                          ├─ 「別の10曲にする」 → loading → result
                          └─ 「プレイリストで聴く」
                               ├─ Spotifyログイン済 → 同期 → 別窓でSpotifyプレイリスト
                               └─ 未ログイン → モーダル3択
                                     ├─ 1曲目だけ開く → 別窓でSpotify track URL
                                     ├─ Spotifyでログイン → popup/OAuth → 同期 → 別窓でSpotify
                                     └─ Apple Musicでサインイン → MusicKit authorize
                                          → ISRCでAppleカタログ解決 → ライブラリにプレイリスト作成
                                          → 「Apple Musicで開く」モーダル → クリックで別窓
```

### 共有URL復元

プレイリスト生成時に `history.replaceState` で URL を `?moods=...&intensity=N&tracks=id1,...` に更新。
ブックマーク等で再訪すると `parseShareParams` がURLから読み取り、`fetchTracks` で曲を復元して結果画面にジャンプ。
OAuth リダイレクト中に URL のクエリが失われる問題があるため、**ログインボタン押下時に `sessionStorage` にも同じデータを退避**して、コールバック後に復元している。

### キャッシュ層

1. **Vercel Function のメモリ内トークンキャッシュ**
   - Spotify app token を `expires_in` まで再利用
   - Apple Music Developer Token (JWT) を30日再利用
2. **HTTP キャッシュヘッダ** — `public, max-age=120, s-maxage=600, stale-while-revalidate=1200`
3. **Service Worker (Workbox)** — `/api/spotify` を StaleWhileRevalidate、30分TTL（`/api/apple`は未キャッシュ）
4. **クライアント in-memory Map** — 2分TTL、`src/spotify.js` と `src/apple.js` それぞれで保持

## ディレクトリ構成

```
api/
  spotify.js           Vercel Function: Spotify search/tracks/playlist 代行 + token cache
  apple.js             Vercel Function: Apple Music Developer Token発行 + search/songs/byIsrc/playlist 代行
public/
  icon-512.png         PWA用マスクアイコン (512x512)
  icon-apple.png       apple-touch-icon 専用 (角丸)
src/
  main.jsx             ReactDOM.createRoot エントリ
  Root.jsx             Appラッパー、Tweaksパネルのキーボード切替 (` キー)
  App.jsx              全UI・状態管理・Share URL・OAuth callback・3択モーダル
  spotify.js           Spotify API client + PKCE + プレイリスト同期
  apple.js             Apple Music MusicKit JS wrapper + ISRC lookup + ライブラリ同期
  Tweaks.jsx           開発者向けテーマ/レイアウト切替パネル
  styles.css           全スタイル (CSS変数、`j-` prefix)
index.html             PWA metaタグ・favicon設定
vite.config.js         Vite + PWA plugin設定
vercel.json            SPAリライト (/api, /src, /@ 等を除外)
```

## セットアップ

### 1. Spotify Developer App の作成

1. [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) でアプリを作成
2. **Client ID と Client Secret を控える**
3. Redirect URIs に以下を登録：
   - `http://127.0.0.1:5173/callback` （ローカル開発用）
   - `https://<your-vercel-domain>/callback` （本番用）
4. Development Mode のままなら **Users and Access** でログインを許可するユーザーを追加（最大25人）

### 2. Apple Developer（オプション: Apple Music対応する場合のみ）

1. [https://developer.apple.com](https://developer.apple.com) で Apple Developer Program 加入 ($99/年)
2. [Identifiers](https://developer.apple.com/account/resources/identifiers) で **Media IDs → Music** を作成
3. [Keys](https://developer.apple.com/account/resources/authkeys) で **MusicKit** を有効にした Key を作成、`.p8` をダウンロード（1回のみ）
4. Team ID (右上) と Key ID をメモ

`APPLE_*` 環境変数が未設定の場合、Apple Music 選択肢はモーダルに出ない（Spotifyのみで動作）。

### 3. 環境変数

`.env.example` をコピーして `.env` を作成：

```bash
# Spotify (検索・プレイリスト作成)
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # ブラウザに埋め込まれる

# Apple Music (任意)
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

本番(Vercel)にも同じキーを Environment Variables に追加。`VITE_` prefix の有無に注意。

### 4. 依存関係

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

`npm run dev` は Vite のみ起動するため `api/spotify.js` が404になり、アプリは `pickTracks` のモック曲にフォールバックする。モック曲には `external_url` が無いので「Spotifyで聴く」ボタンはdisabledになる。

**実際の挙動を確認するなら `vercel dev` を使う**（初回は `vercel link` でプロジェクト紐付け）。`.env` がそのまま読まれる。

### キーボードショートカット

- `` ` `` （バッククォート）— Tweaks パネル表示切替（テーマ/アクセント/レイアウト/曲数）

## デプロイ (Vercel)

1. GitHub リポジトリを Vercel に接続
2. Environment Variables を追加:
   - Spotify: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `VITE_SPOTIFY_CLIENT_ID`
   - Apple Music (任意): `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
3. Framework Preset: Vite（自動検出されるはず）
4. デプロイ

`vercel.json` がAPIルート保護 + SPAリライトを設定済み。追加設定は不要。

## URLスキーム

| URL | 意味 |
|---|---|
| `/` | 入力画面 |
| `/?moods=happy,chill&intensity=1&tracks=<id1>,<id2>,...` | 特定プレイリスト復元（ブックマーク用途） |
| `/callback?code=...&state=...` | OAuth コールバック（即座にクリーンアップ） |

## 既知の制限

### Spotify Development Mode の 25人制限

Client Credentials (検索) は**誰でも使える**が、**OAuth ログインは Dashboard の "Users and Access" に登録された Spotify アカウント（最大25人）だけ**。解除するには **Extended Quota Mode** を申請する必要がある（数日〜数週間のレビュー、プライバシーポリシー・利用規約・デモ動画等が必要）。

### Spotify API の制限

以下は新規作成の Client ID では使えないため利用しない：

- `/v1/recommendations`（2024年11月廃止）
- `/v1/audio-features` / `/v1/audio-analysis`（新規廃止）
- `preview_url`（大半のトラックで `null`）

気分→曲マッピングは検索クエリ `MOOD_INTENSITY_QUERIES`（`api/spotify.js`）のキーワード組み合わせで実現。audio features でのソートは不可能。

### Web Playback SDK は使わない

一時期実装していたが撤去済み：

- Safari で DRM(FairPlay) 非対応のため動作しない
- Spotify Premium が必要
- SDK バンドルが重い

代わりに `https://open.spotify.com/track/<id>` or `/playlist/<id>` に別窓で飛ばす方式。

### プレイリストの再利用

ログインユーザーの "Juke" プレイリストは `localStorage.juke.playlist.id` に ID を保存して使い回す。ユーザーが Spotify 側で削除すると ID が404になり、次回同期時に新しく作り直す。

## トラブルシューティング

### OAuth で `User not registered in the Developer Dashboard`
→ Spotify Dashboard の Users and Access にアカウントを追加。またはExtended Quota申請。

### `Token exchange failed (400)` がたまに出る
→ React StrictMode の useEffect 二重呼び出しで認可コードが二度交換されるのが原因。`handleCallback` は Promise memoization で対策済み。それでも出る場合は認可コードの有効期限切れ(10分)の可能性。

### Spotify で「お探しの曲が見つかりませんでした」
→ モックトラック（`npm run dev`のフォールバック）の偽IDを開いている。`vercel dev` に切り替えるか本番で確認。

### `/callback` がアドレスバーに残る
→ `cleanUrl()` で `/` に `replaceState` するが、Service Worker が旧版のまま動いていると古い挙動のまま。Hard reload で SW 更新。

### プレイリストが複数作られる
→ `spotifyFetch` が空ボディレスポンスを JSON parse に失敗して既存IDをクリアしてたバグ。修正済みだが、既存の重複は手動で Spotify から削除。

### `vercel dev` で Vite 内部のimport analysisエラー
→ `vercel.json` の SPA リライトが `/src/main.jsx` などに適用されて HTML を返してた問題。`/src/`, `/@`, `/node_modules/` などの除外済み。

## Apple Music 統合の補足

- 検索は Spotify を使い、曲の ISRC (International Standard Recording Code) を取得。Apple Music のカタログ検索には使っていない。
- ユーザーが Apple Music 側で再生したいと選んだとき、`/v1/catalog/{storefront}/songs?filter[isrc]=...` で同じ曲の Apple Music ID を取得してライブラリに追加。
- 別カタログなので **見つからない曲は除外**される。10曲が7曲になるケースあり。
- MusicKit JS の `authorize()` はオーバーレイ/ポップアップで認証（OAuth redirect ではない）。
- プレイリスト作成後、async 後の `window.open` は popup blocker にかかりやすいので、**「Apple Musicで開く」モーダル**を表示してユーザーの直クリックで新窓を開く。

## 設計で検討して見送ったこと

- **Web Playback SDK** — Safari で DRM(FairPlay) 非対応、Premium必須、SDKが重い
- **Vercel KV でスラッグ付き共有URL** — URL 自体に track IDs を埋めればバックエンド不要なので KV は不採用
- **ユーザー毎に新規プレイリスト作成** — サービス側のプレイリスト一覧がゴミ溜めになるので、1ユーザー1 Juke プレイリストで使い回し
- **Apple Music を検索にも使う** — 別カタログとの同期が煩雑なので、検索は Spotify 一本化
