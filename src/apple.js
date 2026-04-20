// Apple Music クライアント: ISRC経由で Spotify トラックを Apple Music カタログにマップし、
// ユーザーの Apple Music ライブラリにプレイリストを作る。カタログ検索自体は spotify.js 側が担当。

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const DEFAULT_STOREFRONT = 'jp';

const STORE = {
  playlistId: 'juke.apple.playlist.id',
};

// ============================================================
// Catalog lookup via /api/apple
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

export async function fetchAppleSongsByIsrc(isrcs, storefront = DEFAULT_STOREFRONT) {
  const cleaned = (isrcs || []).filter(Boolean).slice(0, 25);
  if (!cleaned.length) return [];
  const params = new URLSearchParams({
    action: 'byIsrc',
    isrcs: cleaned.join(','),
    storefront,
  });
  const data = await cachedGet(`/api/apple?${params.toString()}`);
  return data.data || [];
}

// ============================================================
// MusicKit JS
// ============================================================

let musicKitPromise = null;
let musicInstancePromise = null;

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

export async function isAppleAuthed() {
  if (typeof window === 'undefined' || !window.MusicKit) return false;
  try {
    const music = await getMusicInstance();
    return Boolean(music.isAuthorized);
  } catch {
    return false;
  }
}

export async function beginAppleAuth() {
  const music = await getMusicInstance();
  await music.authorize();
  return Boolean(music.isAuthorized);
}

export async function signOutApple() {
  if (typeof window === 'undefined' || !window.MusicKit) return;
  try {
    const music = await getMusicInstance();
    await music.unauthorize();
  } catch {
    /* ignore */
  }
  localStorage.removeItem(STORE.playlistId);
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

export async function syncAppleJukePlaylist({ ids, title }) {
  const music = await getMusicInstance();
  if (!music.isAuthorized) throw new Error('not authed');
  const cleanedIds = (ids || []).filter(Boolean).slice(0, 100);
  if (!cleanedIds.length) throw new Error('no tracks');

  const trackData = cleanedIds.map((id) => ({ id, type: 'songs' }));
  const existingId = localStorage.getItem(STORE.playlistId);

  if (existingId) {
    try {
      await musicFetch(music, `/v1/me/library/playlists/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ attributes: { name: title, description: 'Curated by Juke' } }),
      });
      await musicFetch(music, `/v1/me/library/playlists/${existingId}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ data: trackData }),
      });
      return {
        id: existingId,
        url: 'https://music.apple.com/library/playlists',
      };
    } catch (e) {
      localStorage.removeItem(STORE.playlistId);
    }
  }

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
    url: 'https://music.apple.com/library/playlists',
  };
}
