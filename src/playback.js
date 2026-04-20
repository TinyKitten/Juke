const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const PLAY_ENDPOINT = 'https://api.spotify.com/v1/me/player/play';

let sdkPromise = null;

export function loadSDK() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    const existing = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (typeof existing === 'function') existing();
      resolve(window.Spotify);
    };
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function createPlayer(name, getToken) {
  const Spotify = await loadSDK();
  return new Spotify.Player({
    name,
    getOAuthToken: (cb) => cb(getToken()),
    volume: 0.7,
  });
}

export async function startPlayback({ accessToken, deviceId, uris, offset = 0 }) {
  const url = `${PLAY_ENDPOINT}?device_id=${encodeURIComponent(deviceId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris, offset: { position: offset } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`play failed (${res.status}) ${text}`.trim());
  }
}
