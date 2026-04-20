import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import App from './App.jsx';
import TweaksPanel from './Tweaks.jsx';

const TWEAK_DEFAULTS = {
  theme: 'auto',
  accent: 'mono',
  layout: 'default',
  trackCount: 10,
};

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // 長時間開きっぱなしのタブでも1時間ごとに更新チェック
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(err) {
      console.warn('SW registration failed', err);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="j-update-prompt" role="status">
      <span className="j-update-prompt-text">新しいバージョンが利用可能です</span>
      <button
        className="j-update-prompt-btn j-update-prompt-primary"
        onClick={() => updateServiceWorker(true)}
      >
        更新
      </button>
      <button
        className="j-update-prompt-btn"
        onClick={() => setNeedRefresh(false)}
        aria-label="あとで"
      >
        あとで
      </button>
    </div>
  );
}

export default function Root() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [showTweaks, setShowTweaks] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setShowTweaks(s => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <App tweaks={tweaks} />
      {showTweaks && <TweaksPanel value={tweaks} onChange={setTweaks} />}
      <UpdatePrompt />
    </>
  );
}
