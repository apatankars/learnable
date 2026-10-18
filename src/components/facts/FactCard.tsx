import type { CountryEntry } from '../../types';
import { FACTS_ACCENT, formatArea, formatPopulation, getFunFacts, getStats } from '../../lib/facts';

const eyebrow = {
  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' as const,
  fontWeight: 800, fontFamily: 'var(--ff-u)',
};

// The headline facts, in a fixed order so they become familiar: population and
// government first, then capital, size, languages and money.
export function KeyStats({ country, compact = false }: { country: CountryEntry; compact?: boolean }) {
  const s = getStats(country.id);
  if (!s) return null;
  const rows: [string, string][] = [
    ['Population', formatPopulation(s.population)],
    ['Government', s.government],
    ['Capital', country.capital],
    ['Area', `${formatArea(s.area)}${s.landlocked ? ' · landlocked' : ''}`],
    ['Language' + (s.languages.length > 1 ? 's' : ''), s.languages.slice(0, 4).join(', ') + (s.languages.length > 4 ? ` +${s.languages.length - 4} more` : '')],
    ['Currency', s.currency ?? '—'],
  ];
  const shown = compact ? rows.slice(0, 2) : rows;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(2, minmax(0, 1fr))',
      gap: compact ? 8 : '12px 14px',
    }}>
      {shown.map(([label, value]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div style={{ ...eyebrow, fontSize: 9.5, color: 'var(--t3)', marginBottom: 3 }}>{label}</div>
          <div style={{
            fontSize: compact ? 12.5 : 13.5, color: 'var(--t1)', fontFamily: 'var(--ff-u)',
            lineHeight: 1.35, overflowWrap: 'anywhere',
          }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// "Did you know?" — one fun fact, used to sprinkle facts through other modes.
export function DidYouKnow({ country, fact, style }: { country: CountryEntry; fact: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '10px 13px', borderRadius: 10,
      background: FACTS_ACCENT.tint, border: `2px solid ${FACTS_ACCENT.line}`,
      animation: 'fade-up 0.3s ease forwards',
      ...style,
    }}>
      <div style={{ ...eyebrow, color: FACTS_ACCENT.text, marginBottom: 5 }}>
        Did you know? · {country.name}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t2)', fontFamily: 'var(--ff-u)', lineHeight: 1.5 }}>
        {fact}
      </div>
    </div>
  );
}

export function FactCard({ country }: { country: CountryEntry }) {
  const s = getStats(country.id);
  const facts = getFunFacts(country.id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'fade-up 0.3s ease forwards' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {country.alpha2 && (
          <img
            src={`/flags/${country.alpha2}.svg`}
            alt={`Flag of ${country.name}`}
            width={52}
            height={52}
            style={{ flexShrink: 0, borderRadius: '50%', border: '2px solid var(--ink)', objectFit: 'cover' }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--ff-d)', fontSize: 26, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.15 }}>
            {country.name}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--ff-u)', marginTop: 3 }}>
            {s?.subregion ?? country.region}{s?.demonym ? ` · people are ${s.demonym}` : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 15px', border: '2px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
        <div style={{ ...eyebrow, color: 'var(--t3)', marginBottom: 11 }}>Key facts</div>
        <KeyStats country={country} />
      </div>

      {facts.length > 0 && (
        <div>
          <div style={{ ...eyebrow, color: FACTS_ACCENT.text, marginBottom: 9 }}>Interesting facts</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {facts.map(f => (
              <li key={f} style={{
                display: 'flex', gap: 9, fontSize: 13, color: 'var(--t2)',
                fontFamily: 'var(--ff-u)', lineHeight: 1.5,
              }}>
                <span style={{ color: FACTS_ACCENT.text, flexShrink: 0 }}>✦</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
