import { useState, useEffect } from 'react';
import {
  fetchPlaylistForMoods,
  fetchTracks,
  isAuthConfigured,
  isAuthed,
  beginAuth,
  handleAuthCallback,
  popPendingAction,
  syncJukePlaylist,
} from './spotify.js';
import {
  fetchAppleSongsByIsrc,
  isAppleAuthed,
  beginAppleAuth,
  syncAppleJukePlaylist,
  getMusicInstance,
} from './apple.js';

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
    { title: '晴れのあとさき', artist: 'Aoi Tanimura', album: 'Open Window', dur: '3:12' },
    { title: 'Paper Planes, Blue', artist: 'The Midori Hours', album: 'Same Sky', dur: '2:48' },
    { title: 'うたかた', artist: 'Ren Hoshino', album: 'Drift', dur: '3:41' },
    { title: 'Morning Note', artist: 'Saya & Komachi', album: 'Brief Light', dur: '4:02' },
    { title: 'きみの分の朝', artist: 'lamp flower', album: 'Room 203', dur: '3:27' },
    { title: 'Tangerine Afternoon', artist: 'Nova Glass', album: '—', dur: '3:55' },
    { title: '花曜日', artist: 'Haruka Ono', album: 'Yellow Book', dur: '2:59' },
  ],
  sad: [
    { title: '雨のかたち', artist: 'Yuu Nishikawa', album: 'After the Silence', dur: '4:18' },
    { title: 'Half a Letter', artist: 'Cold Linen', album: 'Dim', dur: '3:50' },
    { title: '夜行', artist: 'Kaito Mori', album: 'Last Train', dur: '5:02' },
    { title: 'Pale Blue Room', artist: 'Sora Inoue', album: 'Untitled', dur: '4:35' },
    { title: 'ひとりぶん', artist: 'Mito Okabe', album: 'Shallow Sea', dur: '3:44' },
    { title: 'November Glass', artist: 'The Fold', album: 'Quiet Months', dur: '4:08' },
  ],
  chill: [
    { title: 'Slow Water', artist: 'Hana Morimoto', album: 'Still', dur: '4:11' },
    { title: 'うたた寝', artist: 'Shiro & the Hush', album: 'Shade', dur: '3:38' },
    { title: 'Sunday, lower', artist: 'Pillow Talk Radio', album: 'Off-white', dur: '4:24' },
    { title: '湯気', artist: 'Koji Nakamura', album: 'Warm Room', dur: '3:15' },
    { title: 'Linen', artist: 'Momo Aihara', album: 'Weekday', dur: '4:02' },
    { title: '縁側', artist: 'Yui Hashimoto', album: 'Veranda', dur: '3:55' },
  ],
  hype: [
    { title: 'FAST LIGHT', artist: 'KUROI', album: 'Overload', dur: '3:02' },
    { title: '夜通し', artist: 'Riko Sawa', album: 'Neon Street', dur: '2:48' },
    { title: 'Heart Machine', artist: 'The Signal', album: 'Runway', dur: '3:18' },
    { title: '走る', artist: 'Asuka Ide', album: 'Sprint', dur: '2:55' },
    { title: 'Mirror / Mirror', artist: 'NEON KAI', album: 'Glow', dur: '3:40' },
    { title: 'いま', artist: 'Takeru Ito', album: 'Raw', dur: '3:11' },
  ],
  focus: [
    { title: 'Low Desk', artist: 'Field Notes', album: 'Study A', dur: '5:20' },
    { title: '白紙', artist: 'Ayaka Miyazaki', album: 'Blank', dur: '4:55' },
    { title: 'Grid', artist: 'System No. 3', album: 'Stationery', dur: '6:02' },
    { title: '見出し', artist: 'Hikari Mori', album: 'Index', dur: '4:18' },
    { title: 'Margin', artist: 'Paper Cuts', album: 'Layout', dur: '5:44' },
    { title: '余白', artist: 'Taro Ueda', album: 'Quiet Office', dur: '4:30' },
  ],
  nostalgic: [
    { title: '夏の終わり', artist: 'Sora Yamashita', album: 'Old Postcards', dur: '4:12' },
    { title: 'Super 8', artist: 'The Evening Crew', album: 'Film', dur: '3:48' },
    { title: '小学校の坂', artist: 'Mei Kobayashi', album: 'Hometown', dur: '3:22' },
    { title: 'Polaroid', artist: 'Kaya Grove', album: 'Before', dur: '4:02' },
    { title: '夕方五時', artist: 'Reona Fujita', album: '17:00', dur: '3:55' },
    { title: 'Old Kitchen', artist: 'Home Tape', album: 'Rewind', dur: '4:18' },
  ],
  romantic: [
    { title: 'きみの輪郭', artist: 'Aki Hoshizora', album: 'Soft Edges', dur: '3:48' },
    { title: 'Low Candle', artist: 'Velvet Room', album: 'Near', dur: '4:22' },
    { title: '指先', artist: 'Nanako Aida', album: 'Touch', dur: '3:12' },
    { title: 'Hush', artist: 'Mori & Lina', album: 'Bedroom Light', dur: '4:05' },
    { title: '近づく', artist: 'Yuki Sasaki', album: 'Warm', dur: '3:38' },
    { title: 'Slow Slow', artist: 'After Hours', album: 'Two', dur: '4:48' },
  ],
  angry: [
    { title: 'Teeth', artist: 'BLACK INK', album: 'Grit', dur: '2:48' },
    { title: '噛む', artist: 'Ryu Kawamura', album: 'Steel', dur: '3:02' },
    { title: 'Loud Room', artist: 'The Static', album: 'Cracks', dur: '2:55' },
    { title: '痛い', artist: 'Mariko Kudo', album: 'Red', dur: '3:18' },
    { title: 'Split', artist: 'Heavy Sunday', album: 'Split', dur: '3:35' },
    { title: '壊す', artist: 'Yota Arai', album: 'Break', dur: '2:58' },
  ],
  sleepy: [
    { title: 'Pillow', artist: 'Lumen Low', album: 'Dim', dur: '5:48' },
    { title: '夜半', artist: 'Sen Okuda', album: 'Before Dawn', dur: '6:15' },
    { title: 'Soft Room', artist: 'Woolen', album: 'Under', dur: '5:02' },
    { title: '枕', artist: 'Rio Hasegawa', album: 'Night Cycle', dur: '4:48' },
    { title: 'Moon Fade', artist: 'Quiet Hotel', album: 'Late', dur: '5:30' },
  ],
  lonely: [
    { title: 'ひとり', artist: 'Nao Shirai', album: 'Window', dur: '4:22' },
    { title: 'Empty Station', artist: 'The Fold', album: 'Alone A', dur: '4:58' },
    { title: '部屋', artist: 'Yuu Nishikawa', album: 'Room 04', dur: '3:55' },
    { title: 'Long Walk', artist: 'Pale Hours', album: 'Alone', dur: '5:12' },
    { title: '誰もいない', artist: 'Kaito Mori', album: 'Echo', dur: '4:30' },
  ],
  dreamy: [
    { title: 'Float', artist: 'Cloud Letter', album: 'Pale', dur: '4:48' },
    { title: '羽', artist: 'Ao Nishimura', album: 'Feather', dur: '4:12' },
    { title: 'Light Room', artist: 'Glass Pool', album: 'Suspend', dur: '5:05' },
    { title: '夢の輪郭', artist: 'Noa Takagi', album: 'Outline', dur: '4:38' },
    { title: 'Silver', artist: 'Slow Mirror', album: 'Hover', dur: '4:22' },
  ],
  bittersweet: [
    { title: '帰り道', artist: 'Sora Inoue', album: 'Home Late', dur: '4:18' },
    { title: 'Almost', artist: 'The Nearly', album: 'Margin', dur: '3:55' },
    { title: '未完', artist: 'Ren Hoshino', album: 'Unfinished', dur: '4:02' },
    { title: 'Slow Goodbye', artist: 'Linen Post', album: 'End Pages', dur: '4:35' },
    { title: '半分', artist: 'Mei Kobayashi', album: 'Half', dur: '3:48' },
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

const PENDING_SHARE_KEY = 'juke.share.pending';
const BASE_TITLE = 'Juke — 気分で曲を見つける';
const VALID_MOODS = new Set(MOODS.map((m) => m.id));

// ============================================================
// UTIL
// ============================================================
function pickTracks(moods, intensity, count) {
  if (moods.length === 0) return [];
  const pool = [];
  moods.forEach((m) => (TRACK_POOL[m] || []).forEach((t) => pool.push({ ...t, mood: m })));
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
    uri: null,
    external_url: null,
    cover: null,
    reason: REASONS[t.mood][i % REASONS[t.mood].length],
  }));
}

function playlistTitle(moods) {
  if (moods.length === 0) return 'Today, for you';
  const labels = moods.map((m) => MOODS.find((x) => x.id === m)?.ja).filter(Boolean);
  if (labels.length === 1) return `${labels[0]}の日に`;
  if (labels.length === 2) return `${labels[0]}と${labels[1]}のあいだ`;
  return `${labels[0]}、${labels[1]}、${labels[2]}...`;
}

function todayStr() {
  const d = new Date();
  const days = ['日','月','火','水','木','金','土'];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${days[d.getDay()]})`;
}

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
    duration_ms: ms,
    uri: track.uri,
    external_url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
    cover: images[0]?.url,
    isrc: track.external_ids?.isrc || null,
    mood,
    reason: reasons[index % (reasons.length || 1)] || '',
  };
}

function openInSpotify(track) {
  if (!track?.external_url) return;
  window.open(track.external_url, '_blank', 'noopener,noreferrer');
}

function SpotifyLogo({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="12" opacity="0.08"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.6 14.4c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1-.4.1-.7-.1-.8-.5s.1-.7.5-.8c4-.9 7.5-.5 10.3 1.2.3.2.4.6.2.9zm1.2-2.7c-.2.4-.7.5-1.1.3-2.8-1.7-7.1-2.2-10.4-1.2-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.8-1.1 8.6-.6 11.8 1.4.4.2.5.7.2 1zm.1-2.8c-3.4-2-9-2.2-12.2-1.2-.5.2-1.1-.1-1.2-.6-.2-.5.1-1.1.6-1.2 3.7-1.1 9.9-.9 13.8 1.4.5.3.6.9.4 1.3-.3.5-.9.6-1.4.3z"/>
    </svg>
  );
}

function AppleMusicLogo({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M19.5 3H4.5C3.67 3 3 3.67 3 4.5v15C3 20.33 3.67 21 4.5 21h15c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zM15 15.7c0 1.27-1.03 2.3-2.3 2.3s-2.3-1.03-2.3-2.3 1.03-2.3 2.3-2.3c.29 0 .56.05.82.14V8.2l-4.85 1.04V17c0 1.27-1.03 2.3-2.3 2.3S3.77 18.27 3.77 17s1.03-2.3 2.3-2.3c.29 0 .56.05.82.14V7.3l7.92-1.66c.11-.02.19.06.19.17V15.7z"/>
    </svg>
  );
}

function ProviderPlayModal({ onSpotify, onApple, onSingle, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="j-confirm-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="j-confirm j-confirm-wide" onClick={(e) => e.stopPropagation()}>
        <div className="j-eyebrow j-confirm-eyebrow">PLAYBACK</div>
        <h2 className="j-confirm-title">どう再生しますか？</h2>
        <p className="j-confirm-body">
          1曲のリンクを開くだけなら<strong>その後はサービス側の自動再生</strong>になります。
          並び順通りに聴きたい場合は、ログインして<strong>非公開プレイリスト</strong>を自動作成できます。
        </p>
        <div className="j-confirm-choices">
          <button className="j-choice" onClick={onSingle}>
            <span className="j-choice-title">1曲目だけ開く</span>
            <span className="j-choice-sub">ログイン不要 · Spotifyで1曲目を再生して以降は自動再生に委ねる</span>
          </button>
          <button className="j-choice j-choice-primary" onClick={onSpotify}>
            <span className="j-choice-title">
              <SpotifyLogo size={14}/>
              Spotifyでログインして正確に再生
            </span>
            <span className="j-choice-sub">非公開プレイリストを作って並び通り再生</span>
          </button>
          {onApple && (
            <button className="j-choice j-choice-apple" onClick={onApple}>
              <span className="j-choice-title">
                <AppleMusicLogo size={14}/>
                Apple Musicでサインインして正確に再生
              </span>
              <span className="j-choice-sub">ライブラリにプレイリストを作って並び通り再生</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

// ============================================================
// COVER ART
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
  const key = String(seed || '');
  for (let i = 0; i < key.length; i++) s = (s * 131 + key.charCodeAt(i)) >>> 0;
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
  heart: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill={p.filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-7.5-4.5-9.5-9.5C1 7.5 4 4 7.5 4 9.5 4 11 5 12 6.5 13 5 14.5 4 16.5 4 20 4 23 7.5 21.5 11.5 19.5 16.5 12 21 12 21z"/></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4v6h6M20 20v-6h-6M20 8A8 8 0 006 6M4 16a8 8 0 0014 2"/></svg>,
  share: (p) => <svg viewBox="0 0 24 24" width={p.s||16} height={p.s||16} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14"/></svg>,
  arrow: (p) => <svg viewBox="0 0 24 24" width={p.s||14} height={p.s||14} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  back: (p) => <svg viewBox="0 0 24 24" width={p.s||14} height={p.s||14} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>,
  external: (p) => <svg viewBox="0 0 24 24" width={p.s||14} height={p.s||14} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 5h5v5M19 5l-9 9M10 5H5v14h14v-5"/></svg>,
};

// ============================================================
// COMPONENTS
// ============================================================

function AppHeader({ view, onBack }) {
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
        <span className="j-date">{todayStr()}</span>
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

function PlaylistResult({ moods, intensity, tracks, layout, onRegenerate, onBack, onPlay, syncing }) {
  const [liked, setLiked] = useState({});
  const [savedPlaylist, setSavedPlaylist] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleLike = (id) => setLiked(l => ({ ...l, [id]: !l[id] }));

  const title = playlistTitle(moods);
  const totalDur = tracks.reduce((s,t)=>{
    const [m,sec] = t.dur.split(':').map(Number);
    return s + m*60 + sec;
  }, 0);
  const totalMin = Math.floor(totalDur/60);

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
              onClick={onPlay}
              disabled={!tracks[0]?.external_url || syncing}
            >
              <Icon.play/>
              <span>{syncing ? 'プレイリストを準備中...' : 'プレイリストで聴く'}</span>
              {!syncing && <Icon.external s={12}/>}
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
        {tracks.map((t, i) => (
          <div
            key={t.id}
            className="j-track"
            onClick={() => openInSpotify(t)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') openInSpotify(t); }}
          >
            <div className="j-td j-td-num">
              <button
                className="j-track-play"
                onClick={(e) => { e.stopPropagation(); openInSpotify(t); }}
                aria-label="Spotifyで開く"
              >
                <span className="j-track-idx">{String(i+1).padStart(2,'0')}</span>
                <span className="j-track-playicon"><Icon.play s={12}/></span>
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
                onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}
              >
                <Icon.heart filled={liked[t.id]} s={14}/>
              </button>
              <span>{t.dur}</span>
            </div>
          </div>
        ))}
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
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App({ tweaks }) {
  const [view, setView] = useState('input');
  const [selected, setSelected] = useState([]);
  const [intensity, setIntensity] = useState(1);
  const [seed, setSeed] = useState(0);
  const trackCount = tweaks.trackCount;
  const [tracks, setTracks] = useState([]);
  const [processingAuth, setProcessingAuth] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.search.includes('code=');
  });
  const [spotifyPrompt, setSpotifyPrompt] = useState(null); // null | tracks[]
  const [syncing, setSyncing] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    const share = parseShareParams();
    if (share) {
      sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(share));
      stripShareParamsFromUrl();
    }
  }, []);

  useEffect(() => {
    // Apple Music の認証情報が設定されてるかを一度だけ確認
    fetch('/api/apple?action=status')
      .then((r) => r.json())
      .then((d) => setAppleAvailable(Boolean(d.available)))
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (!isAuthConfigured()) {
      setProcessingAuth(false);
      return;
    }
    (async () => {
      try {
        const token = await handleAuthCallback();
        if (token) {
          const pending = popPendingAction();
          if (pending?.type === 'playlist' && pending.uris?.length) {
            try {
              const result = await syncJukePlaylist({
                uris: pending.uris,
                title: pending.title || 'Juke',
              });
              const opened = window.open(result.url, '_blank', 'noopener,noreferrer');
              if (!opened) {
                // ポップアップブロック時は同タブフォールバック
                window.location.href = result.url;
                return;
              }
              // 以降のshare-restore効果がPENDING_SHARE_KEYを拾って
              // 結果画面(同じプレイリスト)を復元する
            } catch (e) {
              console.error('playlist sync failed', e);
            }
          }
        }
      } catch (e) {
        console.error('auth callback failed', e);
      } finally {
        setProcessingAuth(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (view === 'result' && selected.length) {
      document.title = `${playlistTitle(selected)} — Juke`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [view, selected]);

  const loadPlaylist = async (nextSeed) => {
    setView('loading');
    const minLoad = new Promise((r) => setTimeout(r, 350));
    try {
      const entries = await fetchPlaylistForMoods({
        moods: selected,
        intensity,
        seed: nextSeed,
        count: trackCount,
      });
      const list = entries.length
        ? entries.map(({ track, mood }, i) => normalizeSpotifyTrack(track, mood, i))
        : pickTracks(selected, intensity + ':' + nextSeed, trackCount);
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

  const playPlaylist = async () => {
    if (!tracks.length) return;
    // Spotifyログイン済なら直接同期、それ以外は毎回モーダルで選ばせる
    if (isAuthConfigured() && isAuthed()) {
      await runSpotifySync();
      return;
    }
    setSpotifyPrompt(true);
  };

  const runSpotifySync = async () => {
    setSyncing(true);
    try {
      const uris = tracks.map((t) => t.uri || `spotify:track:${t.id}`).filter(Boolean);
      const result = await syncJukePlaylist({
        uris,
        title: `${playlistTitle(selected)} — Juke`,
      });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error('Spotify playlist sync failed', e);
      openInSpotify(tracks[0]);
    } finally {
      setSyncing(false);
    }
  };

  const runAppleSync = async () => {
    setSyncing(true);
    try {
      // Apple Music にサインインしてなければ先に認証
      if (!(await isAppleAuthed())) {
        await beginAppleAuth();
      }
      if (!(await isAppleAuthed())) {
        throw new Error('Apple Musicサインインが完了しませんでした');
      }
      // Spotify トラックの ISRC → Apple Music カタログの曲ID に解決
      const isrcs = tracks.map((t) => t.isrc).filter(Boolean);
      if (!isrcs.length) throw new Error('ISRCが取得できませんでした');
      const songs = await fetchAppleSongsByIsrc(isrcs);
      const appleIds = songs.map((s) => s.id).filter(Boolean);
      if (!appleIds.length) {
        throw new Error('Apple Musicカタログに該当曲が見つかりませんでした');
      }
      const result = await syncAppleJukePlaylist({
        ids: appleIds,
        title: `${playlistTitle(selected)} — Juke`,
      });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error('Apple Music playlist sync failed', e);
      openInSpotify(tracks[0]);
    } finally {
      setSyncing(false);
    }
  };

  const handlePromptSpotify = () => {
    setSpotifyPrompt(false);
    if (isAuthed()) {
      runSpotifySync();
      return;
    }
    // 未ログイン: beginAuth経由 (popup)
    const uris = tracks.map((t) => t.uri || `spotify:track:${t.id}`).filter(Boolean);
    sessionStorage.setItem(
      PENDING_SHARE_KEY,
      JSON.stringify({
        moods: selected,
        intensity,
        tracks: tracks.map((t) => t.id),
      }),
    );
    beginAuth({
      type: 'playlist',
      uris,
      title: `${playlistTitle(selected)} — Juke`,
    }).catch((e) => console.error('beginAuth failed', e));
  };

  const handlePromptApple = () => {
    setSpotifyPrompt(false);
    runAppleSync();
  };

  const handlePromptSingle = () => {
    setSpotifyPrompt(false);
    openInSpotify(tracks[0]);
  };

  // 共有URL(track IDs)からの復元
  useEffect(() => {
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
      const minLoad = new Promise((r) => setTimeout(r, 350));
      try {
        const items = await fetchTracks(share.tracks, 'JP');
        const list = items.length
          ? items.map((t, i) => normalizeSpotifyTrack(t, share.moods[i % share.moods.length], i))
          : pickTracks(share.moods, share.intensity + ':0', share.tracks.length);
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
  }, []);

  if (processingAuth) {
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
              Spotifyを準備中<span className="j-loading-ellipsis">...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`j-app j-theme-${tweaks.theme} j-accent-${tweaks.accent}`}>
      <AppHeader view={view} onBack={back}/>
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
            onPlay={playPlaylist}
            syncing={syncing}
          />
        )}
      </div>
      {spotifyPrompt && (
        <ProviderPlayModal
          onSpotify={handlePromptSpotify}
          onApple={appleAvailable ? handlePromptApple : null}
          onSingle={handlePromptSingle}
          onClose={() => setSpotifyPrompt(false)}
        />
      )}
    </div>
  );
}
