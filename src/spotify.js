// Spotifyカタログ検索・曲取得はVercel関数経由(Client Credentials)
// プレイリスト作成のみユーザー認証(PKCE)を使用

// ============================================================
// Catalog (authenticated via backend proxy + in-memory cache)
// ============================================================

const apiCache = new Map();
const API_CACHE_TTL = 120_000; // 2min

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

export async function fetchTracks(ids, market = 'JP') {
  const cleaned = (ids || []).filter(Boolean).slice(0, 50);
  if (!cleaned.length) return [];
  const params = new URLSearchParams({
    action: 'tracks',
    ids: cleaned.join(','),
    market,
  });
  const data = await cachedGet(`/api/spotify?${params.toString()}`);
  return (data.tracks || []).filter(Boolean);
}

export async function fetchPlaylistForMoods({
  market = 'JP',
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
    market,
  });
  const data = await cachedGet(`/api/spotify?${params.toString()}`);
  return data.entries || [];
}

// ============================================================
// User Auth (PKCE) — only for playlist creation
// ============================================================

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}/callback`
  : '';
const AUTH_SCOPES = ['user-read-private', 'playlist-modify-private'];

const STORE = {
  token: 'juke.user.token',
  verifier: 'juke.pkce.verifier',
  state: 'juke.pkce.state',
  pending: 'juke.pending.action',
  playlistId: 'juke.playlist.id',
};

export const isAuthConfigured = () => Boolean(CLIENT_ID);

function base64url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function deriveChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(hash));
}

export async function beginAuth(pendingAction) {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set');
  if (pendingAction) {
    sessionStorage.setItem(STORE.pending, JSON.stringify(pendingAction));
  }
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(STORE.verifier, verifier);
  sessionStorage.setItem(STORE.state, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: AUTH_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await deriveChallenge(verifier),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

let callbackPromise = null;

export function handleAuthCallback() {
  if (!callbackPromise) callbackPromise = doHandleAuthCallback();
  return callbackPromise;
}

async function doHandleAuthCallback() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) {
    cleanUrl();
    throw new Error(`Spotify auth error: ${error}`);
  }
  if (!code) return null;

  const savedState = sessionStorage.getItem(STORE.state);
  const verifier = sessionStorage.getItem(STORE.verifier);
  if (!verifier || !savedState || state !== savedState) {
    cleanUrl();
    throw new Error('PKCE state mismatch');
  }
  sessionStorage.removeItem(STORE.verifier);
  sessionStorage.removeItem(STORE.state);
  cleanUrl();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const token = await res.json();
  token.acquired_at = Date.now();
  sessionStorage.setItem(STORE.token, JSON.stringify(token));
  return token;
}

function cleanUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, `${window.location.origin}/`);
}

export function loadUserToken() {
  const raw = sessionStorage.getItem(STORE.token);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    const expiresAt = t.acquired_at + (t.expires_in - 60) * 1000;
    if (Date.now() >= expiresAt) {
      sessionStorage.removeItem(STORE.token);
      return null;
    }
    return t;
  } catch {
    sessionStorage.removeItem(STORE.token);
    return null;
  }
}

export const isAuthed = () => Boolean(loadUserToken());

export function clearUserAuth() {
  sessionStorage.removeItem(STORE.token);
  localStorage.removeItem(STORE.playlistId);
}

export function popPendingAction() {
  const raw = sessionStorage.getItem(STORE.pending);
  if (!raw) return null;
  sessionStorage.removeItem(STORE.pending);
  try { return JSON.parse(raw); } catch { return null; }
}

// ============================================================
// Playlist sync (reuses one Juke playlist per user)
// ============================================================

async function spotifyFetch(accessToken, path, init = {}) {
  const res = await fetch(`https://api.spotify.com${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify ${path} ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function syncJukePlaylist({ uris, title }) {
  const token = loadUserToken();
  if (!token) throw new Error('not authed');
  const cleanedUris = (uris || []).filter(Boolean).slice(0, 100);
  if (!cleanedUris.length) throw new Error('no tracks');

  const existingId = localStorage.getItem(STORE.playlistId);
  if (existingId) {
    try {
      await spotifyFetch(token.access_token, `/v1/playlists/${existingId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: title, description: 'Curated by Juke' }),
      });
      await spotifyFetch(token.access_token, `/v1/playlists/${existingId}/tracks`, {
        method: 'PUT',
        body: JSON.stringify({ uris: cleanedUris }),
      });
      return {
        id: existingId,
        url: `https://open.spotify.com/playlist/${existingId}`,
      };
    } catch (e) {
      localStorage.removeItem(STORE.playlistId);
    }
  }

  const me = await spotifyFetch(token.access_token, '/v1/me');
  const playlist = await spotifyFetch(
    token.access_token,
    `/v1/users/${encodeURIComponent(me.id)}/playlists`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: title,
        description: 'Curated by Juke',
        public: false,
      }),
    },
  );
  await spotifyFetch(
    token.access_token,
    `/v1/playlists/${playlist.id}/tracks`,
    { method: 'PUT', body: JSON.stringify({ uris: cleanedUris }) },
  );
  localStorage.setItem(STORE.playlistId, playlist.id);
  return {
    id: playlist.id,
    url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
  };
}
