import { useState, useEffect } from 'react';
import App from './App.jsx';
import TweaksPanel from './Tweaks.jsx';

const TWEAK_DEFAULTS = {
  theme: 'auto',
  accent: 'mono',
  layout: 'default',
  trackCount: 10,
};

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
    </>
  );
}
