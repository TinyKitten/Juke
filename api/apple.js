// Vercel Serverless Function — Apple Music API
// Developer Token (JWT, ES256) を生成し、catalog 検索と曲取得を代行。
// Music User Tokenはクライアント(MusicKit JS)側で取得するためここでは扱わない。

import { SignJWT, importPKCS8 } from 'jose';

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

const DEFAULT_STOREFRONT = 'jp';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days (max 180 allowed by Apple)

let devTokenCache = { token: null, expiresAt: 0 };

async function getDevToken() {
  if (devTokenCache.token && Date.now() < devTokenCache.expiresAt) {
    return devTokenCache.token;
  }
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const rawKey = process.env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !rawKey) {
    throw new Error('APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY is not set');
  }
  // 環境変数で改行がエスケープされてる場合(\nリテラル)を正規化
  const pem = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
  const privateKey = await importPKCS8(pem, 'ES256');

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(privateKey);

  devTokenCache = {
    token,
    expiresAt: Date.now() + (TOKEN_TTL_SECONDS - 60 * 60) * 1000, // -1h 余裕
  };
  return token;
}

function setCacheHeaders(res, maxAge = 60, swr = 600) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge * 5}, stale-while-revalidate=${swr}`,
  );
}

async function appleFetch(path, params, devToken) {
  const url = new URL(`https://api.music.apple.com${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${devToken}` },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function actionSearch(req, res, devToken) {
  const term = req.query.term;
  if (!term) return res.status(400).json({ error: 'term is required' });
  const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 25);
  const offset = Math.min(parseInt(req.query.offset || '0', 10) || 0, 200);
  const storefront = req.query.storefront || DEFAULT_STOREFRONT;
  const r = await appleFetch(`/v1/catalog/${encodeURIComponent(storefront)}/search`, {
    term: String(term),
    types: 'songs',
    limit,
    offset,
  }, devToken);
  setCacheHeaders(res, 120, 1200);
  return res.status(r.status).json(r.body);
}

async function actionSongs(req, res, devToken) {
  const ids = req.query.ids;
  if (!ids) return res.status(400).json({ error: 'ids is required' });
  const storefront = req.query.storefront || DEFAULT_STOREFRONT;
  const cleaned = String(ids).split(',').filter(Boolean).slice(0, 300).join(',');
  const r = await appleFetch(`/v1/catalog/${encodeURIComponent(storefront)}/songs`, {
    ids: cleaned,
  }, devToken);
  setCacheHeaders(res, 120, 1200);
  return res.status(r.status).json(r.body);
}

async function actionByIsrc(req, res, devToken) {
  const isrcs = req.query.isrcs;
  if (!isrcs) return res.status(400).json({ error: 'isrcs is required' });
  const storefront = req.query.storefront || DEFAULT_STOREFRONT;
  const cleaned = String(isrcs).split(',').filter(Boolean).slice(0, 25).join(',');
  const r = await appleFetch(`/v1/catalog/${encodeURIComponent(storefront)}/songs`, {
    'filter[isrc]': cleaned,
  }, devToken);
  setCacheHeaders(res, 120, 1200);
  return res.status(r.status).json(r.body);
}

async function actionPlaylist(req, res, devToken) {
  const rawMoods = String(req.query.moods || '').split(',').filter(Boolean).slice(0, 3);
  const intensity = Math.min(2, Math.max(0, parseInt(req.query.intensity || '1', 10) || 0));
  const seed = Math.max(0, parseInt(req.query.seed || '0', 10) || 0);
  const count = Math.min(25, Math.max(1, parseInt(req.query.count || '10', 10) || 10));
  const storefront = req.query.storefront || DEFAULT_STOREFRONT;
  if (!rawMoods.length) return res.status(400).json({ error: 'moods is required' });

  const perMood = Math.max(4, Math.ceil(count / rawMoods.length) + 2);
  const offset = (seed * 5) % 40;

  const buckets = await Promise.all(
    rawMoods.map(async (m) => {
      const term = MOOD_INTENSITY_QUERIES[m]?.[intensity] || m;
      const r = await appleFetch(`/v1/catalog/${encodeURIComponent(storefront)}/search`, {
        term,
        types: 'songs',
        limit: perMood,
        offset,
      }, devToken);
      if (!r.ok) return [];
      const songs = r.body?.results?.songs?.data || [];
      return songs.map((s) => ({ track: s, mood: m }));
    }),
  );

  const interleaved = [];
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < buckets.length; j++) {
      if (buckets[j][i]) interleaved.push(buckets[j][i]);
    }
  }

  const seen = new Set();
  const entries = [];
  for (const entry of interleaved) {
    if (seen.has(entry.track.id)) continue;
    seen.add(entry.track.id);
    entries.push(entry);
    if (entries.length >= count) break;
  }

  setCacheHeaders(res, 120, 1200);
  return res.status(200).json({ entries });
}

export default async function handler(req, res) {
  try {
    const action = req.query.action;
    if (action === 'status') {
      const available = Boolean(
        process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID &&
        process.env.APPLE_PRIVATE_KEY,
      );
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ available });
    }
    if (action === 'devToken') {
      const token = await getDevToken();
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.status(200).json({ token });
    }
    const token = await getDevToken();
    if (action === 'search') return actionSearch(req, res, token);
    if (action === 'songs') return actionSongs(req, res, token);
    if (action === 'byIsrc') return actionByIsrc(req, res, token);
    if (action === 'playlist') return actionPlaylist(req, res, token);
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'unknown error' });
  }
}
