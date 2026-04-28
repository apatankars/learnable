import type { GameSettings } from '../../types';

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

interface SettingsPanelProps {
  settings: GameSettings;
  onChange: (s: GameSettings) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  function update(patch: Partial<GameSettings>) {
    onChange({ ...settings, ...patch });
  }

  function toggleRegion(r: string) {
    const current = settings.regionFilter;
    const next = current.includes(r) ? current.filter(x => x !== r) : [...current, r];
    update({ regionFilter: next });
  }

  const TIME_OPTIONS = [
    { label: '⚡ Blitz', sub: '1 min', seconds: 60, noLimit: false },
    { label: '⏱ Standard', sub: '5 min', seconds: 300, noLimit: false },
    { label: '∞ Infinite', sub: 'no limit', seconds: 300, noLimit: true },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'var(--ff-u)' }}>
      {/* Time limit */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Time Limit</div>
        <div className="settings-option-row" style={{ gap: 8 }}>
          {TIME_OPTIONS.map(opt => {
            const active = opt.noLimit
              ? settings.noTimeLimit
              : !settings.noTimeLimit && settings.timeLimitSeconds === opt.seconds;
            return (
              <button
                key={opt.label}
                onClick={() => update({ timeLimitSeconds: opt.seconds, noTimeLimit: opt.noLimit })}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 3, border: active ? '1px solid var(--gold)' : '1px solid var(--border)',
                  background: active ? 'var(--bg)' : 'var(--s1)', color: active ? 'var(--gold-hi)' : 'var(--t2)',
                  fontSize: 13, fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  cursor: 'pointer', transition: 'all 0.14s'
                }}
              >
                <span>{opt.label}</span>
                <span style={{ fontSize: 11, color: active ? 'var(--gold)' : 'var(--t3)', fontWeight: 400 }}>{opt.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Blind mode */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--s1)', borderRadius: 3, border: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)' }}>🙈 Blind Mode</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Hide the map — rely purely on memory</div>
        </div>
        <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
            checked={settings.blindMode}
            onChange={e => update({ blindMode: e.target.checked })}
          />
          <div style={{ width: 44, height: 24, background: settings.blindMode ? 'var(--olive)' : 'var(--border)', borderRadius: 12, position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ width: 20, height: 20, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, left: settings.blindMode ? 22 : 2, transition: 'left 0.2s' }} />
          </div>
        </label>
      </div>

      {/* Region filter */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Regions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            onClick={() => update({ regionFilter: [] })}
            style={{
              padding: '6px 12px', borderRadius: 16, fontSize: 13, border: settings.regionFilter.length === 0 ? '1px solid var(--gold)' : '1px solid var(--border)',
              background: settings.regionFilter.length === 0 ? 'var(--bg)' : 'var(--s1)', color: settings.regionFilter.length === 0 ? 'var(--gold-hi)' : 'var(--t2)',
              cursor: 'pointer', transition: 'all 0.14s'
            }}
          >
            🌍 All
          </button>
          {REGIONS.map(r => (
            <button
              key={r}
              onClick={() => toggleRegion(r)}
              style={{
                padding: '6px 12px', borderRadius: 16, fontSize: 13, border: settings.regionFilter.includes(r) ? '1px solid var(--gold)' : '1px solid var(--border)',
                background: settings.regionFilter.includes(r) ? 'var(--bg)' : 'var(--s1)', color: settings.regionFilter.includes(r) ? 'var(--gold-hi)' : 'var(--t2)',
                cursor: 'pointer', transition: 'all 0.14s'
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Include territories */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={settings.includeDependent}
          onChange={e => update({ includeDependent: e.target.checked })}
          style={{ width: 16, height: 16, accentColor: 'var(--olive)' }}
        />
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>Include dependent territories</span>
      </label>

      {/* Practice/Learn Content */}
      {(settings.mode === 'practice' || settings.mode === 'learn') && (
        <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Learn Content</div>
          <div className="settings-option-row" style={{ gap: 8 }}>
            {(['both', 'country', 'capital'] as const).map(p => (
              <button
                key={p}
                onClick={() => update({ practicePrompts: p })}
                style={{
                  flex: 1, padding: '8px', borderRadius: 3, fontSize: 13, textTransform: 'capitalize',
                  border: (settings.practicePrompts || 'both') === p ? '1px solid var(--gold)' : '1px solid var(--border)',
                  background: (settings.practicePrompts || 'both') === p ? 'var(--bg)' : 'var(--s1)',
                  color: (settings.practicePrompts || 'both') === p ? 'var(--gold-hi)' : 'var(--t2)',
                  cursor: 'pointer', transition: 'all 0.14s'
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
