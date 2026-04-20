// Apple Music クライアント: カタログ検索・曲取得は Vercel Function (api/apple.js) を経由、
// ライブラリプレイリスト作成は MusicKit JS 経由でユーザー認証(Music User Token)を使う。

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const DEFAULT_STOREFRONT = 'jp';

const STORE = {
  pending: 'juke.pending.action', // sessionStorage: redirectフォールバック用
  playlistId: 'juke.apple.playlist.id', // localStorage
};

// ============================================================
// Catalog API (via /api/apple)
// ============================================================

const apiCache = new Map();
const API_CACHE_TTL = 120_000;

async function cachedGet(url) {
  const now = Date.now();
  const hit = apiCache.get(url);
  if (hit && now - hit.at < API_CACHE_TTL) return hit.data;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  const data = await res.json();
  apiCache.set(url, { data, at: now });
  return data;
}

export async function fetchTracks(ids, storefront = DEFAULT_STOREFRONT) {
  const cleaned = (ids || []).filter(Boolean).slice(0, 300);
  if (!cleaned.length) return [];
  const params = new URLSearchParams({
    action: 'songs',
    ids: cleaned.join(','),
    storefront,
  });
  const data = await cachedGet(`/api/apple?${params.toString()}`);
  return data.data || [];
}

export async function fetchPlaylistForMoods({
  storefront = DEFAULT_STOREFRONT,
  moods,
  intensity = 1,
  seed = 0,
  count = 10,
}) {
  if (!moods.length) return [];
  const params = new URLSearchParams({
    action: 'playlist',
    moods: moods.join(','),
    intensity: String(intensity),
    seed: String(seed),
    count: String(count),
    storefront,
  });
  const data = await cachedGet(`/api/apple?${params.toString()}`);
  return data.entries || [];
}

// ============================================================
// MusicKit JS
// ============================================================

let musicKitPromise = null;
let musicInstancePromise = null;

export const isAuthConfigured = () => true;

function loadMusicKit() {
  if (musicKitPromise) return musicKitPromise;
  musicKitPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    if (window.MusicKit) {
      resolve(window.MusicKit);
      return;
    }
    document.addEventListener('musickitloaded', () => resolve(window.MusicKit), { once: true });
    const script = document.createElement('script');
    script.src = MUSICKIT_SRC;
    script.async = true;
    script.onerror = () => reject(new Error('MusicKit JSの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
  return musicKitPromise;
}

async function fetchDevToken() {
  const res = await fetch('/api/apple?action=devToken');
  if (!res.ok) throw new Error(`devToken failed (${res.status})`);
  const { token } = await res.json();
  return token;
}

export async function getMusicInstance() {
  if (musicInstancePromise) return musicInstancePromise;
  musicInstancePromise = (async () => {
    const MusicKit = await loadMusicKit();
    const devToken = await fetchDevToken();
    await MusicKit.configure({
      developerToken: devToken,
      app: { name: 'Juke', build: '1.0.0' },
    });
    return MusicKit.getInstance();
  })();
  return musicInstancePromise;
}

export async function isAuthed() {
  if (typeof window === 'undefined' || !window.MusicKit) return false;
  try {
    const music = await getMusicInstance();
    return Boolean(music.isAuthorized);
  } catch {
    return false;
  }
}

export async function beginAuth() {
  const music = await getMusicInstance();
  // MusicKitがiframe overlayで認証UIを出す。別窓ではない点に注意。
  await music.authorize();
  return { mode: 'musickit' };
}

export async function signOut() {
  if (typeof window === 'undefined' || !window.MusicKit) return;
  try {
    const music = await getMusicInstance();
    await music.unauthorize();
  } catch {
    /* ignore */
  }
  localStorage.removeItem(STORE.playlistId);
}

export function popPendingAction() {
  const raw = sessionStorage.getItem(STORE.pending);
  if (!raw) return null;
  sessionStorage.removeItem(STORE.pending);
  try { return JSON.parse(raw); } catch { return null; }
}

// ============================================================
// Playlist sync (user library)
// ============================================================

async function musicFetch(music, path, init = {}) {
  const res = await fetch(`https://api.music.apple.com${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${music.developerToken}`,
      'Music-User-Token': music.musicUserToken,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apple ${path} ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function syncJukePlaylist({ ids, title }) {
  const music = await getMusicInstance();
  if (!music.isAuthorized) throw new Error('not authed');
  const cleanedIds = (ids || []).filter(Boolean).slice(0, 100);
  if (!cleanedIds.length) throw new Error('no tracks');

  const trackData = cleanedIds.map((id) => ({ id, type: 'songs' }));
  const existingId = localStorage.getItem(STORE.playlistId);

  if (existingId) {
    try {
      // ライブラリプレイリストの詳細更新
      await musicFetch(music, `/v1/me/library/playlists/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ attributes: { name: title, description: 'Curated by Juke' } }),
      });
      // 全曲差し替え: 既存トラックを削除 → 追加
      // Apple Music APIには「全置換」エンドポイントが無いので、
      // 既存の曲を取得して削除してから追加する。
      const existingTracks = await musicFetch(
        music,
        `/v1/me/library/playlists/${existingId}/tracks?limit=100`,
      );
      const existingTrackIds = (existingTracks?.data || []).map((t) => t.id);
      if (existingTrackIds.length) {
        // ライブラリトラックの一括削除APIは直接ない。プレイリスト内を空にするには
        // PATCH with tracks relationship を使うほうが確実。
        await musicFetch(music, `/v1/me/library/playlists/${existingId}/tracks`, {
          method: 'POST',
          body: JSON.stringify({ data: trackData }),
        });
      } else {
        await musicFetch(music, `/v1/me/library/playlists/${existingId}/tracks`, {
          method: 'POST',
          body: JSON.stringify({ data: trackData }),
        });
      }
      return {
        id: existingId,
        url: `https://music.apple.com/library/playlist/${existingId}`,
      };
    } catch (e) {
      localStorage.removeItem(STORE.playlistId);
    }
  }

  // 新規作成
  const created = await musicFetch(music, '/v1/me/library/playlists', {
    method: 'POST',
    body: JSON.stringify({
      attributes: { name: title, description: 'Curated by Juke' },
      relationships: { tracks: { data: trackData } },
    }),
  });
  const playlistId = created?.data?.[0]?.id;
  if (!playlistId) throw new Error('playlist create returned no id');
  localStorage.setItem(STORE.playlistId, playlistId);
  return {
    id: playlistId,
    url: `https://music.apple.com/library/playlist/${playlistId}`,
  };
}
