import { useState, useEffect, useRef } from 'react';
import {
  isConfigured as spotifyConfigured,
  beginLogin,
  handleCallback,
  loadToken,
  clearToken,
  fetchMe,
  fetchPlaylistForMoods,
  fetchTracks,
} from './spotify.js';

const PENDING_SHARE_KEY = 'juke.share.pending';
const BASE_TITLE = 'Juke — 気分で曲を見つける';
const VALID_MOODS = new Set(['happy','sad','chill','hype','focus','nostalgic','romantic','angry','sleepy','lonely','dreamy','bittersweet']);

function parseShareParams() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const rawMoods = (p.get('moods') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const moods = rawMoods.filter((m) => VALID_MOODS.has(m)).slice(0, 3);
  const intensityRaw = parseInt(p.get('intensity') || '1', 10);
  const intensity = [0,1,2].includes(intensityRaw) ? intensityRaw : 1;
  const tracks = (p.get('tracks') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (!moods.length || !tracks.length) return null;
  return { moods, intensity, tracks };
}

function stripShareParamsFromUrl() {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  let changed = false;
  ['moods', 'intensity', 'tracks'].forEach((k) => {
    if (p.has(k)) { p.delete(k); changed = true; }
  });
  if (!changed) return;
  const q = p.toString();
  const newUrl = window.location.origin + window.location.pathname + (q ? `?${q}` : '');
  window.history.replaceState({}, document.title, newUrl);
}

function writeShareUrl(moods, intensity, tracks) {
  if (typeof window === 'undefined') return;
  if (!moods?.length || !tracks?.length) return;
  const params = new URLSearchParams({
    moods: moods.join(','),
    intensity: String(intensity),
    tracks: tracks.map((t) => t.id).join(','),
  });
  const newUrl = `${window.location.origin}/?${params.toString()}`;
  window.history.replaceState({}, document.title, newUrl);
}
import { createPlayer, startPlayback } from './playback.js';

// ============================================================
// DATA
// ============================================================
const MOODS = [
  { id: 'happy',     ja: '嬉しい',     en: 'Happy',        glyph: '+' },
  { id: 'sad',       ja: '悲しい',     en: 'Melancholy',   glyph: '~' },
  { id: 'chill',     ja: 'まったり',   en: 'Chill',        glyph: '—' },
  { id: 'hype',      ja: 'アガる',     en: 'Hype',         glyph: '↑' },
  { id: 'focus',     ja: '集中',       en: 'Focus',        glyph: '·' },
  { id: 'nostalgic', ja: '懐かしい',   en: 'Nostalgic',    glyph: '○' },
  { id: 'romantic',  ja: 'ロマンチック', en: 'Romantic',   glyph: '♥' },
  { id: 'angry',     ja: 'イライラ',   en: 'Restless',     glyph: '×' },
  { id: 'sleepy',    ja: '眠い',       en: 'Drowsy',       glyph: 'z' },
  { id: 'lonely',    ja: '孤独',       en: 'Alone',        glyph: '|' },
  { id: 'dreamy',    ja: '夢見心地',   en: 'Dreamy',       glyph: '*' },
  { id: 'bittersweet', ja: '切ない',   en: 'Bittersweet',  glyph: '/' },
];

const INTENSITIES = ['低い', 'ふつう', '強め'];

const TRACK_POOL = {
  happy: [
    { title: '晴れのあとさき',       artist: 'Aoi Tanimura',          album: 'Open Window',         dur: '3:12', bpm: 118 },
    { title: 'Paper Planes, Blue',   artist: 'The Midori Hours',      album: 'Same Sky',            dur: '2:48', bpm: 124 },
    { title: 'うたかた',             artist: 'Ren Hoshino',           album: 'Drift',               dur: '3:41', bpm: 110 },
    { title: 'Morning Note',         artist: 'Saya & Komachi',        album: 'Brief Light',         dur: '4:02', bpm: 102 },
    { title: 'きみの分の朝',         artist: 'lamp flower',           album: 'Room 203',            dur: '3:27', bpm: 96  },
    { title: 'Tangerine Afternoon',  artist: 'Nova Glass',            album: '—',                   dur: '3:55', bpm: 108 },
    { title: '花曜日',               artist: 'Haruka Ono',            album: 'Yellow Book',         dur: '2:59', bpm: 114 },
  ],
  sad: [
    { title: '雨のかたち',           artist: 'Yuu Nishikawa',         album: 'After the Silence',   dur: '4:18', bpm: 74  },
    { title: 'Half a Letter',        artist: 'Cold Linen',            album: 'Dim',                 dur: '3:50', bpm: 68  },
    { title: '夜行',                 artist: 'Kaito Mori',            album: 'Last Train',          dur: '5:02', bpm: 72  },
    { title: 'Pale Blue Room',       artist: 'Sora Inoue',            album: 'Untitled',            dur: '4:35', bpm: 64  },
    { title: 'ひとりぶん',           artist: 'Mito Okabe',            album: 'Shallow Sea',         dur: '3:44', bpm: 70  },
    { title: 'November Glass',       artist: 'The Fold',              album: 'Quiet Months',        dur: '4:08', bpm: 66  },
    { title: '残響',                 artist: 'Nao Shirai',            album: 'Low Light',           dur: '3:29', bpm: 76  },
  ],
  chill: [
    { title: 'Slow Water',           artist: 'Hana Morimoto',         album: 'Still',               dur: '4:11', bpm: 88  },
    { title: 'うたた寝',             artist: 'Shiro & the Hush',      album: 'Shade',               dur: '3:38', bpm: 82  },
    { title: 'Sunday, lower',        artist: 'Pillow Talk Radio',     album: 'Off-white',           dur: '4:24', bpm: 90  },
    { title: '湯気',                 artist: 'Koji Nakamura',         album: 'Warm Room',           dur: '3:15', bpm: 84  },
    { title: 'Linen',                artist: 'Momo Aihara',           album: 'Weekday',             dur: '4:02', bpm: 86  },
    { title: '縁側',                 artist: 'Yui Hashimoto',         album: 'Veranda',             dur: '3:55', bpm: 80  },
  ],
  hype: [
    { title: 'FAST LIGHT',           artist: 'KUROI',                 album: 'Overload',            dur: '3:02', bpm: 140 },
    { title: '夜通し',               artist: 'Riko Sawa',             album: 'Neon Street',         dur: '2:48', bpm: 136 },
    { title: 'Heart Machine',        artist: 'The Signal',            album: 'Runway',              dur: '3:18', bpm: 142 },
    { title: '走る',                 artist: 'Asuka Ide',             album: 'Sprint',              dur: '2:55', bpm: 148 },
    { title: 'Mirror / Mirror',      artist: 'NEON KAI',              album: 'Glow',                dur: '3:40', bpm: 128 },
    { title: 'いま',                 artist: 'Takeru Ito',            album: 'Raw',                 dur: '3:11', bpm: 132 },
  ],
  focus: [
    { title: 'Low Desk',             artist: 'Field Notes',           album: 'Study A',             dur: '5:20', bpm: 92  },
    { title: '白紙',                 artist: 'Ayaka Miyazaki',        album: 'Blank',               dur: '4:55', bpm: 88  },
    { title: 'Grid',                 artist: 'System No. 3',          album: 'Stationery',          dur: '6:02', bpm: 96  },
    { title: '見出し',               artist: 'Hikari Mori',           album: 'Index',               dur: '4:18', bpm: 94  },
    { title: 'Margin',               artist: 'Paper Cuts',            album: 'Layout',              dur: '5:44', bpm: 90  },
    { title: '余白',                 artist: 'Taro Ueda',             album: 'Quiet Office',        dur: '4:30', bpm: 92  },
  ],
  nostalgic: [
    { title: '夏の終わり',           artist: 'Sora Yamashita',        album: 'Old Postcards',       dur: '4:12', bpm: 86  },
    { title: 'Super 8',              artist: 'The Evening Crew',      album: 'Film',                dur: '3:48', bpm: 92  },
    { title: '小学校の坂',           artist: 'Mei Kobayashi',         album: 'Hometown',            dur: '3:22', bpm: 98  },
    { title: 'Polaroid',             artist: 'Kaya Grove',            album: 'Before',              dur: '4:02', bpm: 88  },
    { title: '夕方五時',             artist: 'Reona Fujita',          album: '17:00',               dur: '3:55', bpm: 90  },
    { title: 'Old Kitchen',          artist: 'Home Tape',             album: 'Rewind',              dur: '4:18', bpm: 84  },
  ],
  romantic: [
    { title: 'きみの輪郭',           artist: 'Aki Hoshizora',         album: 'Soft Edges',          dur: '3:48', bpm: 80  },
    { title: 'Low Candle',           artist: 'Velvet Room',           album: 'Near',                dur: '4:22', bpm: 76  },
    { title: '指先',                 artist: 'Nanako Aida',           album: 'Touch',               dur: '3:12', bpm: 82  },
    { title: 'Hush',                 artist: 'Mori & Lina',           album: 'Bedroom Light',       dur: '4:05', bpm: 78  },
    { title: '近づく',               artist: 'Yuki Sasaki',           album: 'Warm',                dur: '3:38', bpm: 84  },
    { title: 'Slow Slow',            artist: 'After Hours',           album: 'Two',                 dur: '4:48', bpm: 72  },
  ],
  angry: [
    { title: 'Teeth',                artist: 'BLACK INK',             album: 'Grit',                dur: '2:48', bpm: 156 },
    { title: '噛む',                 artist: 'Ryu Kawamura',          album: 'Steel',               dur: '3:02', bpm: 148 },
    { title: 'Loud Room',            artist: 'The Static',            album: 'Cracks',              dur: '2:55', bpm: 160 },
    { title: '痛い',                 artist: 'Mariko Kudo',           album: 'Red',                 dur: '3:18', bpm: 152 },
    { title: 'Split',                artist: 'Heavy Sunday',          album: 'Split',               dur: '3:35', bpm: 144 },
    { title: '壊す',                 artist: 'Yota Arai',             album: 'Break',               dur: '2:58', bpm: 150 },
  ],
  sleepy: [
    { title: 'Pillow',               artist: 'Lumen Low',             album: 'Dim',                 dur: '5:48', bpm: 62  },
    { title: '夜半',                 artist: 'Sen Okuda',             album: 'Before Dawn',         dur: '6:15', bpm: 58  },
    { title: 'Soft Room',            artist: 'Woolen',                album: 'Under',               dur: '5:02', bpm: 64  },
    { title: '枕',                   artist: 'Rio Hasegawa',          album: 'Night Cycle',         dur: '4:48', bpm: 60  },
    { title: 'Moon Fade',            artist: 'Quiet Hotel',           album: 'Late',                dur: '5:30', bpm: 66  },
  ],
  lonely: [
    { title: 'ひとり',               artist: 'Nao Shirai',            album: 'Window',              dur: '4:22', bpm: 72  },
    { title: 'Empty Station',        artist: 'The Fold',              album: 'Alone A',             dur: '4:58', bpm: 68  },
    { title: '部屋',                 artist: 'Yuu Nishikawa',         album: 'Room 04',             dur: '3:55', bpm: 74  },
    { title: 'Long Walk',            artist: 'Pale Hours',            album: 'Alone',               dur: '5:12', bpm: 70  },
    { title: '誰もいない',           artist: 'Kaito Mori',            album: 'Echo',                dur: '4:30', bpm: 66  },
  ],
  dreamy: [
    { title: 'Float',                artist: 'Cloud Letter',          album: 'Pale',                dur: '4:48', bpm: 84  },
    { title: '羽',                   artist: 'Ao Nishimura',          album: 'Feather',             dur: '4:12', bpm: 88  },
    { title: 'Light Room',           artist: 'Glass Pool',            album: 'Suspend',             dur: '5:05', bpm: 80  },
    { title: '夢の輪郭',             artist: 'Noa Takagi',            album: 'Outline',             dur: '4:38', bpm: 82  },
    { title: 'Silver',               artist: 'Slow Mirror',           album: 'Hover',               dur: '4:22', bpm: 86  },
  ],
  bittersweet: [
    { title: '帰り道',               artist: 'Sora Inoue',            album: 'Home Late',           dur: '4:18', bpm: 78  },
    { title: 'Almost',               artist: 'The Nearly',            album: 'Margin',              dur: '3:55', bpm: 82  },
    { title: '未完',                 artist: 'Ren Hoshino',           album: 'Unfinished',          dur: '4:02', bpm: 76  },
    { title: 'Slow Goodbye',         artist: 'Linen Post',            album: 'End Pages',           dur: '4:35', bpm: 74  },
    { title: '半分',                 artist: 'Mei Kobayashi',         album: 'Half',                dur: '3:48', bpm: 80  },
  ],
};

const REASONS = {
  happy: ['軽い足取りに合う', '朝の窓に', '外に出たくなる'],
  sad:   ['そのまま沈んでいい', '言葉にしなくていい', '雨の午後に'],
  chill: ['手を止めるための1曲', '火を弱めて', '何もしない時間に'],
  hype:  ['胸の音を合わせる', '走る前に', '体を起こす'],
  focus: ['邪魔をしない', '紙の上に', '長い時間用'],
  nostalgic: ['古い部屋の匂い', '10年前の夏', '帰り道に'],
  romantic:  ['近づく夜に', '二人の会話の隙間', '指先の温度'],
  angry:     ['吐き出す', '壁を叩かず', '夜更かし用'],
  sleepy:    ['目を閉じてから', '枕の下で', '朝までの距離'],
  lonely:    ['誰もいない部屋で', '窓を少し開けて', '静かに付き合う'],
  dreamy:    ['輪郭がぼやける', '浮いたまま', '天井を見ながら'],
  bittersweet: ['言い切れなかった夜に', '半分だけ覚えている', 'もう少しだけ'],
};

// ============================================================
// UTIL
// ============================================================
function normalizeSpotifyTrack(track, mood, index) {
  const ms = track.duration_ms || 0;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const images = track.album?.images || [];
  const reasons = REASONS[mood] || [];
  return {
    id: track.id,
    title: track.name,
    artist: (track.artists || []).map((a) => a.name).join(', '),
    album: track.album?.name || '—',
    dur: `${min}:${String(sec).padStart(2, '0')}`,
    bpm: null,
    preview_url: track.preview_url,
    external_url: track.external_urls?.spotify,
    cover: images[0]?.url,
    duration_ms: ms,
    uri: track.uri,
    mood,
    reason: reasons[index % (reasons.length || 1)] || '',
  };
}

function pickTracks(moods, intensity, count) {
  if (moods.length === 0) return [];
  const pool = [];
  moods.forEach(m => (TRACK_POOL[m] || []).forEach(t => pool.push({ ...t, mood: m })));
  const key = moods.join(',') + ':' + intensity;
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed / 0xffffffff);
  };
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count).map((t, i) => ({
    ...t,
    id: `${t.title}-${i}`,
    reason: REASONS[t.mood][i % REASONS[t.mood].length],
  }));
}

function playlistTitle(moods) {
  if (moods.length === 0) return 'Today, for you';
  const labels = moods.map(m => MOODS.find(x => x.id === m)?.ja).filter(Boolean);
  if (labels.length === 1) return `${labels[0]}の日に`;
  if (labels.length === 2) return `${labels[0]}と${labels[1]}のあいだ`;
  return `${labels[0]}、${labels[1]}、${labels[2]}...`;
}

function todayStr() {
  const d = new Date();
  const days = ['日','月','火','水','木','金','土'];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${days[d.getDay()]})`;
}

function durationMs(track) {
  if (!track) return 0;
  if (track.duration_ms) return track.duration_ms;
  const [m, s] = (track.dur || '0:00').split(':').map(Number);
  return ((m || 0) * 60 + (s || 0)) * 1000;
}

function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// COVER ART — generative, monochrome
// ============================================================
function Cover({ seed, size = 56, image }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ display: 'block', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 131 + seed.charCodeAt(i)) >>> 0;
  const r = (n) => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s / 0xffffffff) * n;
  };
  const v = Math.floor(r(5));
  const shade = 10 + Math.floor(r(18));
  const bg = `hsl(${Math.floor(r(40))}, 4%, ${shade}%)`;
  const fg = `hsla(0,0%,100%,${0.7 + r(0.25)})`;

  if (v === 0) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', background: bg, flexShrink: 0 }}>
        <circle cx={35 + r(30)} cy={35 + r(30)} r={18 + r(14)} fill="none" stroke={fg} strokeWidth="1" />
        <circle cx={35 + r(30)} cy={35 + r(30)} r={6 + r(10)} fill={fg} />
      </svg>
    );
  }
  if (v === 1) {
    const n = 4 + Math.floor(r(6));
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', background: bg, flexShrink: 0 }}>
        {Array.from({length:n}).map((_,i) => (
          <rect key={i} x={i*(100/n)+2} y={20+r(20)} width={100/n-4} height={40+r(30)} fill={fg} opacity={0.4 + (i/n)*0.6}/>
        ))}
      </svg>
    );
  }
  if (v === 2) {
    const n = 10;
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', background: bg, flexShrink: 0 }}>
        {Array.from({length:n}).map((_,i) => {
          const h = 20 + r(60);
          return <rect key={i} x={8+i*8.4} y={(100-h)/2} width="5" height={h} fill={fg}/>;
        })}
      </svg>
    );
  }
  if (v === 3) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', background: bg, flexShrink: 0 }}>
        {Array.from({length:25}).map((_,i) => {
          const cx = 20 + (i%5)*15, cy = 20 + Math.floor(i/5)*15;
          return <circle key={i} cx={cx} cy={cy} r={1 + r(2.5)} fill={fg}/>;
        })}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', background: bg, flexShrink: 0 }}>
      <line x1={r(50)} y1={0} x2={50+r(50)} y2={100} stroke={fg} strokeWidth={1.2}/>
      <line x1={r(50)} y1={30} x2={50+r(50)} y2={70} stroke={fg} strokeWidth={1.2} opacity={0.6}/>
      <circle cx={50+r(20)-10} cy={50} r={3+r(5)} fill={fg}/>
    </svg>
  );
}

// ============================================================
// ICONS
// ============================================================
const Icon = {
  play: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="currentColor"><path d="M7 5v14l12-7z"/></svg>,
  pause: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>,
  heart: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill={p.filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-7.5-4.5-9.5-9.5C1 7.5 4 4 7.5 4 9.5 4 11 5 12 6.5 13 5 14.5 4 16.5 4 20 4 23 7.5 21.5 11.5 19.5 16.5 12 21 12 21z"/></svg>,
  shuffle: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 3h5v5M4 20L20 4M4 4l6 6M14 14l4 4M21 16v5h-5"/></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4v6h6M20 20v-6h-6M20 8A8 8 0 006 6M4 16a8 8 0 0014 2"/></svg>,
  share: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14"/></svg>,
  arrow: (p) => <svg viewBox="0 0 24 24" width={p.s||14} height={p.s||14} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  back: (p) => <svg viewBox="0 0 24 24" width={p.s||14} height={p.s||14} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>,
  skipF: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="currentColor"><path d="M6 5l10 7-10 7zM17 5h2v14h-2z"/></svg>,
  skipB: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="currentColor"><path d="M18 5L8 12l10 7zM5 5h2v14H5z"/></svg>,
};

// ============================================================
// COMPONENTS
// ============================================================

function AppHeader({ view, onBack, user, onDisconnect }) {
  return (
    <div className="j-header">
      <div className="j-header-left">
        {view !== 'input' && (
          <button className="j-iconbtn" onClick={onBack} aria-label="戻る"><Icon.back s={14}/></button>
        )}
        <div className="j-logo">
          <div className="j-logo-mark">
            <span className="j-logo-dot"/>
            <span className="j-logo-line"/>
          </div>
          <div className="j-logo-text">JUKE</div>
        </div>
      </div>
      <div className="j-header-right">
        {user && (
          <div className="j-header-user" title="Spotify Premium接続中">
            <span className="j-header-user-dot"/>
            <span className="j-header-user-name">{user.display_name}</span>
            <span className="j-header-user-plan">PREMIUM</span>
            {onDisconnect && (
              <button className="j-header-user-x" onClick={onDisconnect} aria-label="切断">×</button>
            )}
          </div>
        )}
        <span className="j-date">{todayStr()}</span>
        <div className="j-avatar">{user ? user.display_name[0] : 'R'}</div>
      </div>
    </div>
  );
}

function MoodInput({ selected, setSelected, intensity, setIntensity, onSubmit }) {
  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : (s.length >= 3 ? s : [...s, id]));
  };
  const canSubmit = selected.length > 0;

  return (
    <div className="j-input">
      <div className="j-input-head">
        <div className="j-eyebrow">TODAY · {todayStr()}</div>
        <h1 className="j-h1">
          きょうの気分は<br/>
          <span className="j-h1-em">どのあたり？</span>
        </h1>
        <p className="j-sub">いま近いものを選んで。3つまで。</p>
      </div>

      <div className="j-moods">
        {MOODS.map(m => {
          const active = selected.includes(m.id);
          const idx = selected.indexOf(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`j-mood ${active ? 'is-active' : ''}`}
            >
              <span className="j-mood-glyph">{m.glyph}</span>
              <span className="j-mood-ja">{m.ja}</span>
              <span className="j-mood-en">{m.en}</span>
              {active && <span className="j-mood-num">{idx+1}</span>}
            </button>
          );
        })}
      </div>

      <div className="j-intensity">
        <div className="j-intensity-label">強さ</div>
        <div className="j-intensity-track">
          {INTENSITIES.map((lv, i) => (
            <button
              key={lv}
              className={`j-intensity-step ${intensity === i ? 'is-active' : ''}`}
              onClick={() => setIntensity(i)}
            >
              <span className="j-intensity-dot"/>
              <span className="j-intensity-text">{lv}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="j-cta">
        <button
          className="j-btn j-btn-primary"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          <span>プレイリストを作る</span>
          <Icon.arrow s={14}/>
        </button>
        <div className="j-cta-hint">
          {selected.length === 0 ? '気分を1つ以上選んでね' :
           `${selected.length}つ選択中 · ${INTENSITIES[intensity]}`}
        </div>
      </div>
    </div>
  );
}

function Loading({ moods }) {
  const labels = moods.map(m => MOODS.find(x => x.id === m)?.ja).filter(Boolean);
  const [step, setStep] = useState(0);
  const steps = [
    '気分を聴いています',
    '今日の空気を読んでいます',
    '曲を並べています',
  ];
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s+1, steps.length-1)), 700);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="j-loading">
      <div className="j-loading-mark">
        <div className="j-pulse"/>
        <div className="j-pulse j-pulse-2"/>
      </div>
      <div className="j-loading-tags">
        {labels.map((l,i) => <span key={i} className="j-loading-tag">{l}</span>)}
      </div>
      <div className="j-loading-step">{steps[step]}<span className="j-loading-ellipsis">...</span></div>
    </div>
  );
}

function PlaylistResult({
  moods,
  intensity,
  tracks,
  layout,
  onRegenerate,
  onBack,
  playingId,
  progress,
  paused,
  onTogglePlay,
  onNext,
  onPrev,
}) {
  const [liked, setLiked] = useState({});
  const [savedPlaylist, setSavedPlaylist] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const togglePlay = (id) => onTogglePlay(id);
  const toggleLike = (id) => setLiked(l => ({ ...l, [id]: !l[id] }));

  const title = playlistTitle(moods);
  const totalDur = tracks.reduce((s,t)=>{
    const [m,sec] = t.dur.split(':').map(Number);
    return s + m*60 + sec;
  }, 0);
  const totalMin = Math.floor(totalDur/60);

  const currentTrack = tracks.find(t => t.id === playingId);

  return (
    <div className={`j-result j-result-${layout}`}>
      <div className="j-result-hero">
        <div className="j-hero-cover">
          <div className="j-hero-cover-inner">
            {tracks.slice(0,4).map((t,i) => (
              <Cover key={i} seed={t.id} size={120} image={t.cover}/>
            ))}
          </div>
        </div>
        <div className="j-hero-meta">
          <div className="j-eyebrow">PLAYLIST FOR TODAY</div>
          <h1 className="j-hero-title">{title}</h1>
          <div className="j-hero-tags">
            {moods.map(m => {
              const mo = MOODS.find(x => x.id === m);
              return <span key={m} className="j-chip">{mo?.ja}</span>;
            })}
            <span className="j-chip j-chip-ghost">{INTENSITIES[intensity]}</span>
          </div>
          <div className="j-hero-stats">
            <span>{tracks.length}曲</span>
            <span className="j-sep">·</span>
            <span>約{totalMin}分</span>
            <span className="j-sep">·</span>
            <span>{todayStr().split(' ')[0]}</span>
          </div>
          <p className="j-hero-blurb">
            {intensity === 2 ? '強めに寄せて、'
             : intensity === 0 ? '控えめに、'
             : 'ちょうどいい濃さで、'}
            今日のあなたに合いそうな{tracks.length}曲。
          </p>
          <div className="j-hero-actions">
            <button
              className="j-btn j-btn-primary"
              onClick={() => togglePlay(playingId || tracks[0]?.id)}
              disabled={!tracks.length}
            >
              {!paused ? <Icon.pause/> : <Icon.play/>}
              <span>{!paused ? '一時停止' : '再生する'}</span>
            </button>
            <button className="j-iconbtn j-iconbtn-lg" onClick={onRegenerate} title="別の曲を">
              <Icon.refresh s={16}/>
            </button>
            <button
              className={`j-iconbtn j-iconbtn-lg ${savedPlaylist?'is-liked':''}`}
              onClick={() => setSavedPlaylist(s => !s)}
              title="保存"
            >
              <Icon.heart filled={savedPlaylist} s={16}/>
            </button>
            <button className="j-iconbtn j-iconbtn-lg" title="シェア" onClick={() => setShareOpen(true)}>
              <Icon.share s={16}/>
            </button>
          </div>
        </div>
      </div>

      <div className="j-tracks">
        <div className="j-tracks-head">
          <span className="j-th j-th-num">#</span>
          <span className="j-th j-th-title">TITLE</span>
          <span className="j-th j-th-album">ALBUM</span>
          <span className="j-th j-th-reason">NOTE</span>
          <span className="j-th j-th-dur">TIME</span>
        </div>
        {tracks.map((t, i) => {
          const isPlaying = playingId === t.id;
          return (
            <div key={t.id} className={`j-track ${isPlaying ? 'is-playing' : ''}`}>
              <div className="j-td j-td-num">
                <button className="j-track-play" onClick={() => togglePlay(t.id)}>
                  {isPlaying
                    ? <span className="j-bars"><i/><i/><i/></span>
                    : <>
                        <span className="j-track-idx">{String(i+1).padStart(2,'0')}</span>
                        <span className="j-track-playicon"><Icon.play s={12}/></span>
                      </>}
                </button>
              </div>
              <div className="j-td j-td-title">
                <Cover seed={t.id} size={40} image={t.cover}/>
                <div className="j-track-meta">
                  <div className="j-track-title">{t.title}</div>
                  <div className="j-track-artist">{t.artist}</div>
                </div>
              </div>
              <div className="j-td j-td-album">{t.album}</div>
              <div className="j-td j-td-reason">{t.reason}</div>
              <div className="j-td j-td-dur">
                <button
                  className={`j-track-like ${liked[t.id]?'is-liked':''}`}
                  onClick={() => toggleLike(t.id)}
                >
                  <Icon.heart filled={liked[t.id]} s={14}/>
                </button>
                <span>{t.dur}</span>
              </div>
              {isPlaying && (
                <div className="j-track-progress"><div style={{width: `${progress*100}%`}}/></div>
              )}
            </div>
          );
        })}
      </div>

      <div className="j-footer-cta">
        <button className="j-btn j-btn-ghost" onClick={onBack}>
          <Icon.back s={14}/>
          <span>気分を変える</span>
        </button>
        <button className="j-btn j-btn-outline" onClick={onRegenerate}>
          <Icon.refresh s={14}/>
          <span>別の{tracks.length}曲にする</span>
        </button>
      </div>

      {shareOpen && (
        <div className="j-share-backdrop" onClick={() => setShareOpen(false)}>
          <div className="j-share" onClick={e => e.stopPropagation()}>
            <div className="j-share-head">
              <div className="j-eyebrow">SHARE PLAYLIST</div>
              <button className="j-iconbtn" onClick={() => setShareOpen(false)} aria-label="閉じる">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <div className="j-share-card">
              <div className="j-share-card-covers">
                {tracks.slice(0,4).map((t,i) => (
                  <Cover key={i} seed={t.id} size={80} image={t.cover}/>
                ))}
              </div>
              <div className="j-share-card-meta">
                <div className="j-share-card-brand">JUKE · {todayStr().split(' ')[0]}</div>
                <div className="j-share-card-title">{title}</div>
                <div className="j-share-card-tags">
                  {moods.map(m => MOODS.find(x=>x.id===m)?.ja).filter(Boolean).join(' · ')} · {tracks.length}曲
                </div>
              </div>
            </div>
            <div className="j-share-options">
              <button
                className="j-share-opt"
                onClick={() => {
                  const params = new URLSearchParams({
                    moods: moods.join(','),
                    intensity: String(intensity),
                    tracks: tracks.map((t) => t.id).join(','),
                  });
                  const url = `${window.location.origin}/?${params.toString()}`;
                  navigator.clipboard?.writeText(url).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                <span className="j-share-opt-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>
                </span>
                <span className="j-share-opt-label">
                  {copied ? 'コピーしました' : 'リンクをコピー'}
                </span>
                <span className="j-share-opt-sub">
                  {typeof window !== 'undefined' ? new URL(window.location.origin).host : ''}
                </span>
              </button>
              <button className="j-share-opt" onClick={() => setShareOpen(false)}>
                <span className="j-share-opt-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
                </span>
                <span className="j-share-opt-label">メールで送る</span>
                <span className="j-share-opt-sub">連絡先から選択</span>
              </button>
              <button className="j-share-opt" onClick={() => setShareOpen(false)}>
                <span className="j-share-opt-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor"/></svg>
                </span>
                <span className="j-share-opt-label">画像として保存</span>
                <span className="j-share-opt-sub">ストーリー用 · 1080×1920</span>
              </button>
              <button className="j-share-opt" onClick={() => setShareOpen(false)}>
                <span className="j-share-opt-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.5 10.5l7-3M8.5 13.5l7 3"/></svg>
                </span>
                <span className="j-share-opt-label">他のアプリ</span>
                <span className="j-share-opt-sub">システム共有</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {currentTrack && (
        <div className="j-nowplaying">
          <div className="j-np-left">
            <Cover seed={currentTrack.id} size={44} image={currentTrack.cover}/>
            <div className="j-np-meta">
              <div className="j-np-title">{currentTrack.title}</div>
              <div className="j-np-artist">{currentTrack.artist}</div>
            </div>
          </div>
          <div className="j-np-center">
            <div className="j-np-controls">
              <button className="j-iconbtn" onClick={onPrev}><Icon.skipB s={14}/></button>
              <button className="j-iconbtn j-iconbtn-solid" onClick={() => togglePlay(currentTrack.id)}>
                {paused ? <Icon.play s={14}/> : <Icon.pause s={14}/>}
              </button>
              <button className="j-iconbtn" onClick={onNext}><Icon.skipF s={14}/></button>
            </div>
            <div className="j-np-progress">
              <span className="j-np-time">{formatMs(progress * durationMs(currentTrack))}</span>
              <div className="j-np-bar"><div style={{width:`${progress*100}%`}}/></div>
              <span className="j-np-time j-np-time-total">{currentTrack.dur}</span>
            </div>
          </div>
          <div className="j-np-right">
            <button className="j-iconbtn"><Icon.shuffle s={14}/></button>
            <button
              className={`j-iconbtn ${liked[currentTrack.id]?'is-liked':''}`}
              onClick={() => toggleLike(currentTrack.id)}
            >
              <Icon.heart filled={liked[currentTrack.id]} s={14}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpotifyLogo({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="12" opacity="0.08"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.6 14.4c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1-.4.1-.7-.1-.8-.5s.1-.7.5-.8c4-.9 7.5-.5 10.3 1.2.3.2.4.6.2.9zm1.2-2.7c-.2.4-.7.5-1.1.3-2.8-1.7-7.1-2.2-10.4-1.2-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.8-1.1 8.6-.6 11.8 1.4.4.2.5.7.2 1zm.1-2.8c-3.4-2-9-2.2-12.2-1.2-.5.2-1.1-.1-1.2-.6-.2-.5.1-1.1.6-1.2 3.7-1.1 9.9-.9 13.8 1.4.5.3.6.9.4 1.3-.3.5-.9.6-1.4.3z"/>
    </svg>
  );
}

const MOCK_SPOTIFY_API = {
  connect: () => new Promise(res => setTimeout(() => res({
    status: 200,
    token: 'BQD' + Math.random().toString(36).slice(2, 14),
    expires_in: 3600,
  }), 1400)),
  getMe: (plan) => new Promise(res => setTimeout(() => res({
    status: 200,
    data: {
      id: 'juke_user_' + Math.random().toString(36).slice(2, 8),
      display_name: 'Ren',
      email: 'ren@example.com',
      product: plan,
      country: 'JP',
    }
  }), 600)),
};

function SpotifyGate({ onConnect, accountPlan, error }) {
  const [step, setStep] = useState('idle');
  const [log, setLog] = useState(() => error ? [{ line: `✗ ${error}`, t: Date.now() }] : []);

  const pushLog = (line) => setLog(l => [...l, { line, t: Date.now() }]);
  const real = spotifyConfigured();
  const clientIdPreview = real
    ? (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').slice(0, 8) + '...'
    : 'juke_xxxxxxxxxxxx';

  const handleConnect = async () => {
    setStep('connecting');
    setLog([]);
    if (real) {
      pushLog('→ GET https://accounts.spotify.com/authorize');
      pushLog(`  client_id=${clientIdPreview}`);
      pushLog('  scope=user-read-private user-read-email');
      pushLog('  code_challenge_method=S256');
      await new Promise(r => setTimeout(r, 500));
      pushLog('← 302 Redirecting to Spotify...');
      await new Promise(r => setTimeout(r, 400));
      try {
        await beginLogin();
      } catch (e) {
        pushLog(`✗ ${e.message || 'auth failed'}`);
        setStep('idle');
      }
      return;
    }
    pushLog('→ GET https://accounts.spotify.com/authorize');
    pushLog(`  client_id=${clientIdPreview}`);
    pushLog('  scope=user-read-private user-read-email streaming');
    pushLog('  (mock mode · set VITE_SPOTIFY_CLIENT_ID for real auth)');
    await new Promise(r => setTimeout(r, 700));
    setStep('authorizing');
    pushLog('← 302 Redirect → OAuth consent');
    await new Promise(r => setTimeout(r, 800));
    pushLog('✓ User authorized');
    pushLog('→ POST /api/token (exchange code)');
    const tok = await MOCK_SPOTIFY_API.connect();
    pushLog(`← 200 OK · token=${tok.token.slice(0,14)}...`);
    setStep('fetching');
    pushLog('→ GET /v1/me');
    const me = await MOCK_SPOTIFY_API.getMe(accountPlan);
    pushLog(`← 200 OK · product="${me.data.product}"`);
    await new Promise(r => setTimeout(r, 500));
    onConnect(me.data);
  };

  return (
    <div className="j-gate">
      <div className="j-gate-inner">
        <div className="j-gate-brand">
          <div className="j-logo-mark">
            <span className="j-logo-dot"/>
            <span className="j-logo-line"/>
          </div>
          <div className="j-logo-text">JUKE</div>
        </div>
        <div className="j-eyebrow">STEP 1 / 2 · CONNECT</div>
        <h1 className="j-h1">
          Spotifyと<br/>
          <span className="j-h1-em">つなげる。</span>
        </h1>
        <p className="j-sub j-gate-sub">
          曲の再生と検索にSpotifyを使います。アカウントに安全に接続します。
        </p>

        <div className="j-gate-perms">
          <div className="j-perm"><span className="j-perm-dot"/>プロフィール情報の取得</div>
          <div className="j-perm"><span className="j-perm-dot"/>楽曲の再生と検索</div>
          <div className="j-perm"><span className="j-perm-dot"/>プレイリストの作成（あなたの許可のもと）</div>
        </div>

        <button
          className="j-btn j-btn-spotify"
          disabled={step !== 'idle'}
          onClick={handleConnect}
        >
          <SpotifyLogo size={16}/>
          <span>
            {step === 'idle' && 'Spotifyでログイン'}
            {step === 'connecting' && '認可ページへ移動中'}
            {step === 'authorizing' && '許可を確認中'}
            {step === 'fetching' && 'アカウントを取得中'}
          </span>
        </button>

        {log.length > 0 && (
          <div className="j-gate-log">
            <div className="j-gate-log-head">API handshake</div>
            {log.map((l,i) => (
              <div key={i} className="j-gate-log-line">{l.line}</div>
            ))}
          </div>
        )}

        <div className="j-gate-foot">
          <span>JUKE は曲の保存・購入はしません。</span>
          <span className="j-sep">·</span>
          <span>いつでも解除できます。</span>
        </div>
      </div>
    </div>
  );
}

function PremiumWall({ user, onRetry, onBack }) {
  return (
    <div className="j-wall">
      <div className="j-wall-inner">
        <div className="j-wall-status">
          <div className="j-wall-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="10" width="14" height="10" rx="1"/>
              <path d="M8 10V7a4 4 0 018 0v3"/>
            </svg>
          </div>
          <div>
            <div className="j-eyebrow">ACCESS BLOCKED · CODE 403</div>
            <div className="j-wall-status-text">Free plan detected</div>
          </div>
        </div>

        <h1 className="j-h1">
          JUKEは<br/>
          <span className="j-h1-em">Premiumでご利用ください。</span>
        </h1>
        <p className="j-sub j-wall-sub">
          プレビュー再生と完全な楽曲ライブラリへのアクセスには、<br/>
          Spotify Premiumが必要です。
        </p>

        <div className="j-wall-account">
          <div className="j-wall-account-line">
            <span className="j-wall-account-label">アカウント</span>
            <span className="j-wall-account-value">{user.display_name}</span>
          </div>
          <div className="j-wall-account-line">
            <span className="j-wall-account-label">メール</span>
            <span className="j-wall-account-value">{user.email}</span>
          </div>
          <div className="j-wall-account-line">
            <span className="j-wall-account-label">現在のプラン</span>
            <span className="j-wall-account-value j-wall-plan-free">Free</span>
          </div>
          <div className="j-wall-account-line">
            <span className="j-wall-account-label">必要なプラン</span>
            <span className="j-wall-account-value j-wall-plan-premium">Premium</span>
          </div>
        </div>

        <div className="j-wall-why">
          <div className="j-wall-why-head">なぜPremiumが必要？</div>
          <div className="j-wall-why-list">
            <div className="j-wall-why-item">
              <span className="j-wall-why-num">01</span>
              <span>Spotify APIは広告なしの連続再生をPremium会員のみに許可しています</span>
            </div>
            <div className="j-wall-why-item">
              <span className="j-wall-why-num">02</span>
              <span>気分に沿ったミックス再生は30秒プレビューでは成立しません</span>
            </div>
            <div className="j-wall-why-item">
              <span className="j-wall-why-num">03</span>
              <span>オフライン保存・高音質ストリーミングはPremium限定です</span>
            </div>
          </div>
        </div>

        <div className="j-wall-cta">
          <a className="j-btn j-btn-spotify" href="https://spotify.com/premium" target="_blank" rel="noopener noreferrer">
            <SpotifyLogo size={16}/>
            <span>Premiumにアップグレード</span>
          </a>
          <button className="j-btn j-btn-outline" onClick={onRetry}>
            <span>別のアカウントで接続</span>
          </button>
        </div>

        <button className="j-btn j-btn-ghost j-wall-signout" onClick={onBack}>
          ← 接続を解除して戻る
        </button>
      </div>
    </div>
  );
}

export default function App({ tweaks }) {
  const [auth, setAuth] = useState(() =>
    spotifyConfigured() ? 'restoring' : 'disconnected'
  );
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [view, setView] = useState('input');
  const [selected, setSelected] = useState([]);
  const [intensity, setIntensity] = useState(1);
  const [seed, setSeed] = useState(0);

  const trackCount = tweaks.trackCount;
  const [tracks, setTracks] = useState([]);

  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [sdkState, setSdkState] = useState(null);
  const playerRef = useRef(null);
  const [fakePlayingId, setFakePlayingId] = useState(null);
  const [fakeProgress, setFakeProgress] = useState(0);

  const usingSdk = spotifyConfigured() && sdkReady && !!deviceId;
  const sdkCurrentId = sdkState?.currentUri
    ? tracks.find((t) => sdkState.currentUri === (t.uri || `spotify:track:${t.id}`))?.id
    : null;
  const playingId = usingSdk ? sdkCurrentId || null : fakePlayingId;
  const progress = usingSdk
    ? (sdkState?.duration ? Math.min(sdkState.position / sdkState.duration, 1) : 0)
    : fakeProgress;
  const paused = usingSdk ? (sdkState?.paused ?? true) : !fakePlayingId;

  const loadPlaylist = async (nextSeed) => {
    setView('loading');
    const minLoad = new Promise((r) => setTimeout(r, 1400));
    const token = spotifyConfigured() ? loadToken() : null;
    try {
      let list;
      if (token) {
        const entries = await fetchPlaylistForMoods({
          accessToken: token.access_token,
          market: user?.country || 'JP',
          moods: selected,
          intensity,
          seed: nextSeed,
          count: trackCount,
        });
        list = entries.length
          ? entries.map(({ track, mood }, i) => normalizeSpotifyTrack(track, mood, i))
          : pickTracks(selected, intensity + ':' + nextSeed, trackCount);
      } else {
        list = pickTracks(selected, intensity + ':' + nextSeed, trackCount);
      }
      await minLoad;
      setTracks(list);
      setView('result');
      writeShareUrl(selected, intensity, list);
    } catch (e) {
      console.error('playlist fetch failed', e);
      const fallback = pickTracks(selected, intensity + ':' + nextSeed, trackCount);
      await minLoad;
      setTracks(fallback);
      setView('result');
      writeShareUrl(selected, intensity, fallback);
    }
  };

  const submit = () => loadPlaylist(seed);
  const back = () => {
    setView('input');
    stripShareParamsFromUrl();
  };
  const regenerate = () => {
    const next = seed + 1;
    setSeed(next);
    loadPlaylist(next);
  };

  const handleConnect = (userData) => {
    setUser(userData);
    setAuth('connected');
  };
  const handleDisconnect = () => {
    if (playerRef.current) {
      playerRef.current.pause().catch(() => {});
      playerRef.current.disconnect();
      playerRef.current = null;
    }
    setSdkReady(false);
    setDeviceId(null);
    setSdkState(null);
    clearToken();
    setAuth('disconnected');
    setUser(null);
    setAuthError(null);
    setView('input');
    setSelected([]);
    stripShareParamsFromUrl();
  };

  const requestDisconnect = () => setConfirmDisconnect(true);
  const cancelDisconnect = () => setConfirmDisconnect(false);
  const confirmDisconnectNow = () => {
    setConfirmDisconnect(false);
    handleDisconnect();
  };

  useEffect(() => {
    const share = parseShareParams();
    if (share) {
      sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(share));
      stripShareParamsFromUrl();
    }
  }, []);

  useEffect(() => {
    if (view === 'result' && selected.length) {
      document.title = `${playlistTitle(selected)} — Juke`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [view, selected]);

  useEffect(() => {
    if (!spotifyConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const newToken = await handleCallback();
        const token = newToken || loadToken();
        if (!token) {
          if (!cancelled) setAuth('disconnected');
          return;
        }
        const me = await fetchMe(token.access_token);
        if (cancelled) return;
        setUser(me);
        setAuth('connected');
      } catch (e) {
        if (cancelled) return;
        clearToken();
        setAuthError(e.message || 'Auth failed');
        setAuth('disconnected');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (auth !== 'connected') return;
    const raw = sessionStorage.getItem(PENDING_SHARE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_SHARE_KEY);
    let cancelled = false;
    (async () => {
      let share;
      try { share = JSON.parse(raw); } catch { return; }
      if (cancelled) return;
      setSelected(share.moods);
      setIntensity(share.intensity);
      setView('loading');
      const minLoad = new Promise((r) => setTimeout(r, 700));
      try {
        const token = spotifyConfigured() ? loadToken() : null;
        let list;
        if (token) {
          const items = await fetchTracks(token.access_token, user?.country || 'JP', share.tracks);
          if (items.length) {
            list = items.map((t, i) =>
              normalizeSpotifyTrack(t, share.moods[i % share.moods.length], i)
            );
          } else {
            list = pickTracks(share.moods, share.intensity + ':0', share.tracks.length);
          }
        } else {
          list = pickTracks(share.moods, share.intensity + ':0', share.tracks.length);
        }
        await minLoad;
        if (cancelled) return;
        setTracks(list);
        setView('result');
        writeShareUrl(share.moods, share.intensity, list);
      } catch (e) {
        console.error('share restore failed', e);
        if (cancelled) return;
        setView('input');
      }
    })();
    return () => { cancelled = true; };
  }, [auth, user]);

  useEffect(() => {
    if (auth !== 'connected' || !spotifyConfigured()) return;
    let active = true;
    let player;
    (async () => {
      try {
        player = await createPlayer('Juke', () => loadToken()?.access_token || '');
        player.addListener('ready', ({ device_id }) => {
          if (!active) return;
          setDeviceId(device_id);
          setSdkReady(true);
        });
        player.addListener('not_ready', () => { if (active) setSdkReady(false); });
        player.addListener('player_state_changed', (state) => {
          if (!active) return;
          if (!state) { setSdkState(null); return; }
          setSdkState({
            currentUri: state.track_window?.current_track?.uri || null,
            paused: state.paused,
            position: state.position,
            duration: state.duration,
          });
        });
        ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach((ev) => {
          player.addListener(ev, ({ message }) => console.warn(`sdk ${ev}:`, message));
        });
        await player.connect();
        if (active) playerRef.current = player;
        else player.disconnect();
      } catch (e) {
        console.error('sdk setup failed', e);
      }
    })();
    return () => {
      active = false;
      if (player) player.disconnect();
      playerRef.current = null;
      setDeviceId(null);
      setSdkReady(false);
      setSdkState(null);
    };
  }, [auth]);

  useEffect(() => {
    if (!usingSdk || !sdkState || sdkState.paused || !sdkState.duration) return;
    const iv = setInterval(() => {
      setSdkState((s) =>
        s ? { ...s, position: Math.min(s.position + 250, s.duration) } : s
      );
    }, 250);
    return () => clearInterval(iv);
  }, [usingSdk, sdkState?.paused, sdkState?.duration, sdkState?.currentUri]);

  useEffect(() => {
    if (usingSdk || !fakePlayingId) return;
    const iv = setInterval(() => {
      setFakeProgress((p) => {
        if (p >= 1) { setFakePlayingId(null); return 0; }
        return p + 0.003;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [usingSdk, fakePlayingId]);

  const togglePlay = async (trackId) => {
    if (!trackId) return;
    if (usingSdk) {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;
      const targetUri = track.uri || `spotify:track:${trackId}`;
      const player = playerRef.current;
      if (!player) return;
      if (sdkState?.currentUri === targetUri) {
        if (sdkState.paused) await player.resume().catch((e) => console.warn(e));
        else await player.pause().catch((e) => console.warn(e));
        return;
      }
      const token = loadToken();
      if (!token) return;
      const uris = tracks.map((t) => t.uri || `spotify:track:${t.id}`);
      const idx = tracks.findIndex((t) => t.id === trackId);
      try {
        await startPlayback({
          accessToken: token.access_token,
          deviceId,
          uris,
          offset: Math.max(0, idx),
        });
      } catch (e) {
        console.error('start playback', e);
      }
    } else {
      if (fakePlayingId === trackId) setFakePlayingId(null);
      else { setFakePlayingId(trackId); setFakeProgress(0); }
    }
  };

  const nextTrack = async () => {
    if (usingSdk) await playerRef.current?.nextTrack().catch(() => {});
  };
  const prevTrack = async () => {
    if (usingSdk) await playerRef.current?.previousTrack().catch(() => {});
  };

  if (auth === 'restoring') {
    return (
      <div className={`j-app j-theme-${tweaks.theme} j-accent-${tweaks.accent}`}>
        <AppHeader view="input" onBack={() => {}}/>
        <div className="j-stage">
          <div className="j-loading">
            <div className="j-loading-mark">
              <div className="j-pulse"/>
              <div className="j-pulse j-pulse-2"/>
            </div>
            <div className="j-loading-step">
              Spotifyと接続中<span className="j-loading-ellipsis">...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (auth === 'disconnected') {
    return (
      <div className={`j-app j-theme-${tweaks.theme} j-accent-${tweaks.accent}`}>
        <AppHeader view="input" onBack={() => {}}/>
        <div className="j-stage">
          <SpotifyGate
            onConnect={handleConnect}
            accountPlan={tweaks.accountPlan}
            error={authError}
          />
        </div>
      </div>
    );
  }

  if (user && user.product === 'free') {
    return (
      <div className={`j-app j-theme-${tweaks.theme} j-accent-${tweaks.accent}`}>
        <AppHeader view="input" onBack={() => {}}/>
        <div className="j-stage">
          <PremiumWall user={user} onRetry={handleDisconnect} onBack={handleDisconnect}/>
        </div>
      </div>
    );
  }

  return (
    <div className={`j-app j-theme-${tweaks.theme} j-accent-${tweaks.accent}`}>
      <AppHeader view={view} onBack={back} user={user} onDisconnect={requestDisconnect}/>
      <div className="j-stage">
        {view === 'input' && (
          <MoodInput
            selected={selected}
            setSelected={setSelected}
            intensity={intensity}
            setIntensity={setIntensity}
            onSubmit={submit}
          />
        )}
        {view === 'loading' && <Loading moods={selected}/>}
        {view === 'result' && (
          <PlaylistResult
            moods={selected}
            intensity={intensity}
            tracks={tracks}
            layout={tweaks.layout}
            onRegenerate={regenerate}
            onBack={back}
            playingId={playingId}
            progress={progress}
            paused={paused}
            onTogglePlay={togglePlay}
            onNext={nextTrack}
            onPrev={prevTrack}
          />
        )}
      </div>
      {confirmDisconnect && (
        <ConfirmDialog
          eyebrow="DISCONNECT · SPOTIFY"
          title="Spotifyとの接続を解除しますか？"
          body="再生中の曲は停止し、再び使うにはSpotifyでログインし直す必要があります。"
          confirmLabel="切断する"
          cancelLabel="キャンセル"
          onCancel={cancelDisconnect}
          onConfirm={confirmDisconnectNow}
        />
      )}
    </div>
  );
}

function ConfirmDialog({ eyebrow, title, body, confirmLabel, cancelLabel, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="j-confirm-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="j-confirm" onClick={(e) => e.stopPropagation()}>
        {eyebrow && <div className="j-eyebrow j-confirm-eyebrow">{eyebrow}</div>}
        <h2 className="j-confirm-title">{title}</h2>
        {body && <p className="j-confirm-body">{body}</p>}
        <div className="j-confirm-actions">
          <button className="j-btn j-btn-outline" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button className="j-btn j-btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
