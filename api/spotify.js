// Vercel Serverless Function — Client Credentialsでsearch/tracks/playlistを代行
// Client Secretはサーバー側にだけ置く

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

let tokenCache = { token: null, expiresAt: 0 };

async function getAppToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET is not set');
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`token failed (${res.status})`);
  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

function setCacheHeaders(res, maxAge = 60, swr = 600) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge * 5}, stale-while-revalidate=${swr}`,
  );
}

async function searchOne(token, { q, limit, offset, market }) {
  const params = new URLSearchParams({
    q,
    type: 'track',
    limit: String(limit),
    offset: String(offset),
    market,
  });
  const r = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const data = await r.json();
  return data.tracks?.items || [];
}

async function actionPlaylist(req, res, token) {
  const rawMoods = String(req.query.moods || '').split(',').filter(Boolean).slice(0, 3);
  const intensity = Math.min(2, Math.max(0, parseInt(req.query.intensity || '1', 10) || 0));
  const seed = Math.max(0, parseInt(req.query.seed || '0', 10) || 0);
  const count = Math.min(50, Math.max(1, parseInt(req.query.count || '10', 10) || 10));
  const market = req.query.market || 'JP';
  if (!rawMoods.length) return res.status(400).json({ error: 'moods is required' });

  const perMood = Math.max(4, Math.ceil(count / rawMoods.length) + 2);
  const offset = (seed * 5) % 40;

  const buckets = await Promise.all(
    rawMoods.map((m) => {
      const q = MOOD_INTENSITY_QUERIES[m]?.[intensity] || m;
      return searchOne(token, { q, limit: perMood, offset, market });
    }),
  );

  const interleaved = [];
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < buckets.length; j++) {
      if (buckets[j][i]) {
        interleaved.push({ track: buckets[j][i], mood: rawMoods[j] });
      }
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
    const token = await getAppToken();

    if (action === 'playlist') return actionPlaylist(req, res, token);

    let upstream;
    if (action === 'search') {
      const q = req.query.q;
      if (!q) return res.status(400).json({ error: 'q is required' });
      const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 50);
      const offset = Math.min(parseInt(req.query.offset || '0', 10) || 0, 100);
      const market = req.query.market || 'JP';
      const params = new URLSearchParams({
        q: String(q),
        type: 'track',
        limit: String(limit),
        offset: String(offset),
        market,
      });
      upstream = `https://api.spotify.com/v1/search?${params.toString()}`;
    } else if (action === 'tracks') {
      const ids = req.query.ids;
      if (!ids) return res.status(400).json({ error: 'ids is required' });
      const market = req.query.market || 'JP';
      const cleaned = String(ids).split(',').filter(Boolean).slice(0, 50).join(',');
      const params = new URLSearchParams({ ids: cleaned, market });
      upstream = `https://api.spotify.com/v1/tracks?${params.toString()}`;
    } else {
      return res.status(400).json({ error: 'unknown action' });
    }

    const r = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    setCacheHeaders(res, 120, 1200);
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('Content-Type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'unknown error' });
  }
}
