const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI =
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ||
  (typeof window !== 'undefined' ? `${window.location.origin}/callback` : '');
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'streaming',
  'user-modify-playback-state',
  'user-read-playback-state',
];
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const ME_ENDPOINT = 'https://api.spotify.com/v1/me';
const SEARCH_ENDPOINT = 'https://api.spotify.com/v1/search';

// [低い, ふつう, 強め] の3段階でmood別に検索クエリを出し分け
const MOOD_INTENSITY_QUERIES = {
  happy:       ['soft acoustic happy',     'happy 楽しい',              'euphoric uplifting dance'],
  sad:         ['melancholic soft piano',  'sad 悲しい',                'heartbreak emotional ballad'],
  chill:       ['ambient slow calm',       'chill lofi',               'chillhop upbeat groove'],
  hype:        ['groovy funk upbeat',      'hype workout energetic',   'edm bass drop intense'],
  focus:       ['ambient study minimal',   'focus study instrumental', 'electronic focus drum'],
  nostalgic:   ['soft nostalgic acoustic', 'nostalgic 懐かしい',        '80s power ballad nostalgic'],
  romantic:    ['soft romantic acoustic',  'romantic love',            'passionate love ballad'],
  angry:       ['blues frustration slow',  'angry rock',               'metal hardcore rage'],
  sleepy:      ['deep sleep ambient',      'sleep ambient',            'lullaby dream'],
  lonely:      ['quiet solitude ambient',  'lonely alone',             'heartbreak alone ballad'],
  dreamy:      ['ethereal ambient dream',  'dreamy dreampop',          'dream pop shoegaze lush'],
  bittersweet: ['wistful acoustic quiet',  'bittersweet',              'bittersweet emotional ballad'],
};

const STORE = {
  verifier: 'juke.pkce.verifier',
  state: 'juke.pkce.state',
  token: 'juke.spotify.token',
};

export const isConfigured = () => Boolean(CLIENT_ID);
export const redirectUri = () => REDIRECT_URI;

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

export async function beginLogin() {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(STORE.verifier, verifier);
  sessionStorage.setItem(STORE.state, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await deriveChallenge(verifier),
    state,
  });
  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`);
}

let callbackPromise = null;

export function handleCallback() {
  if (!callbackPromise) callbackPromise = doHandleCallback();
  return callbackPromise;
}

async function doHandleCallback() {
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
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status})`);
  }
  const token = await res.json();
  token.acquired_at = Date.now();
  sessionStorage.setItem(STORE.token, JSON.stringify(token));
  return token;
}

function cleanUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, `${window.location.origin}/`);
}

export function loadToken() {
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

export function clearToken() {
  sessionStorage.removeItem(STORE.token);
}

export async function fetchMe(accessToken) {
  const res = await fetch(ME_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`/v1/me failed (${res.status})`);
  return res.json();
}

async function searchTracks(accessToken, market, query, limit, offset) {
  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: String(limit),
    offset: String(offset),
    market: market || 'JP',
  });
  const res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return data.tracks?.items || [];
}

export async function fetchPlaylistForMoods({
  accessToken,
  market = 'JP',
  moods,
  intensity = 1,
  seed = 0,
  count = 10,
}) {
  if (!moods.length) return [];
  const perMood = Math.max(4, Math.ceil(count / moods.length) + 2);
  const offset = (seed * 5) % 40;
  const level = Math.min(2, Math.max(0, intensity));

  const buckets = await Promise.all(
    moods.map((m) => {
      const q = MOOD_INTENSITY_QUERIES[m]?.[level] || m;
      return searchTracks(accessToken, market, q, perMood, offset);
    }),
  );

  const interleaved = [];
  const maxLen = Math.max(...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < buckets.length; j++) {
      if (buckets[j][i]) {
        interleaved.push({ track: buckets[j][i], mood: moods[j] });
      }
    }
  }

  const seen = new Set();
  const out = [];
  for (const entry of interleaved) {
    if (seen.has(entry.track.id)) continue;
    seen.add(entry.track.id);
    out.push(entry);
    if (out.length >= count) break;
  }
  return out;
}
