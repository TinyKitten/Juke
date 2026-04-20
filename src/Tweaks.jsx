export default function TweaksPanel({ value, onChange }) {
  const update = (k, v) => onChange({ ...value, [k]: v });

  return (
    <div className="j-tweaks">
      <div className="j-tweaks-title">Tweaks</div>

      <div className="j-tweaks-group">
        <div className="j-tweaks-label">THEME</div>
        <div className="j-tweaks-seg">
          {['auto','light','dark'].map(t => (
            <button key={t} className={value.theme === t ? 'active' : ''}
              onClick={() => update('theme', t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="j-tweaks-group">
        <div className="j-tweaks-label">ACCENT</div>
        <div className="j-tweaks-seg">
          {['mono','lime','coral'].map(a => (
            <button key={a} className={value.accent === a ? 'active' : ''}
              onClick={() => update('accent', a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="j-tweaks-group">
        <div className="j-tweaks-label">RESULT LAYOUT</div>
        <div className="j-tweaks-seg">
          {['default','compact','stacked'].map(l => (
            <button key={l} className={value.layout === l ? 'active' : ''}
              onClick={() => update('layout', l)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="j-tweaks-group">
        <div className="j-tweaks-label">TRACKS: <span className="j-tweaks-value">{value.trackCount}</span></div>
        <input
          type="range"
          min="5"
          max="10"
          value={value.trackCount}
          onChange={e => update('trackCount', +e.target.value)}
          className="j-tweaks-slider"
        />
      </div>
    </div>
  );
}
