import { useEffect, useRef } from 'react';
import type { CountryEntry } from '../../types';
import { DidYouKnow, KeyStats } from '../facts/FactCard';
import { pickFunFact } from '../../lib/facts';

interface TeachingPanelProps {
  country: CountryEntry;
  promptType: 'country' | 'capital';
  score: number;
  streak: number;
  confusedWith?: string; // name of the country this is most often mixed up with
  borders?: string[];    // names of bordering countries, for context
  showFacts?: boolean;   // world topic: key stats + a fun fact alongside the lesson
  onAcknowledge: () => void;
}

export function TeachingPanel({ country, promptType, score, streak, confusedWith, borders, showFacts, onAcknowledge }: TeachingPanelProps) {
  const fact = showFacts ? pickFunFact(country.id, promptType === 'country' ? 0 : 1) : undefined;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { buttonRef.current?.focus(); }, [country, promptType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAcknowledge(); }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '24px 20px',
      background: 'var(--sky-soft)',
      border: '3px solid var(--ink)',
      boxShadow: 'var(--pop-shadow-lg)',
      borderRadius: 18,
      animation: 'fade-up 0.36s ease forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--ink)', fontWeight: 800,
          fontFamily: 'var(--ff-u)',
        }}>
          Learn
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, minWidth: 96, paddingTop: 2 }}>
          <div style={{ fontSize: 12, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>
            {streak >= 5 ? '🔥 ' : '✦ '}x{Math.max(streak, 1)}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4, lineHeight: 1 }}>
            <span style={{
              fontFamily: 'var(--ff-d)', fontSize: 26, fontWeight: 700,
              color: 'var(--gold-hi)', lineHeight: 1,
            }}>{score}</span>
            <span style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>pts</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        {country.alpha2 && (
          <img
            src={`/flags/${country.alpha2}.svg`}
            alt={`Flag of ${country.name}`}
            width={44}
            height={44}
            loading="lazy"
            style={{ flexShrink: 0, borderRadius: '50%', border: '2px solid var(--ink)', objectFit: 'cover' }}
          />
        )}
        <h3 style={{
          fontFamily: 'var(--ff-d)', fontSize: 24, fontWeight: 700,
          color: 'var(--t1)', lineHeight: 1.25,
        }}>
          {promptType === 'country'
            ? `This is ${country.name}`
            : `${country.name}'s capital is ${country.capital}`}
        </h3>
      </div>
      <p style={{
        fontSize: 13, color: 'var(--t2)', marginBottom: 22,
        fontFamily: 'var(--ff-u)', lineHeight: 1.5,
      }}>
        {promptType === 'country'
          ? `Located in ${country.region}. Study its position on the globe.`
          : `Take a moment to memorize it.`}
      </p>
      {confusedWith && (
        <p style={{
          fontSize: 12.5, color: 'var(--miss)', marginTop: -12, marginBottom: 22,
          fontFamily: 'var(--ff-u)', lineHeight: 1.5, opacity: 0.9,
        }}>
          ⚠ You often mix this up with <strong>{confusedWith}</strong> — look closely.
        </p>
      )}
      {promptType === 'country' && borders && borders.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9,
            fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase',
            color: 'var(--ink)', fontWeight: 800, fontFamily: 'var(--ff-u)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: '#c9a6ff', border: '2px solid var(--ink)',
            }} />
            Borders {borders.length} {borders.length === 1 ? 'country' : 'countries'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {borders.map(name => (
              <span
                key={name}
                style={{
                  fontSize: 12, color: 'var(--t2)', fontFamily: 'var(--ff-u)',
                  padding: '3px 9px', borderRadius: 10, lineHeight: 1.4,
                  background: 'var(--grape-soft)', fontWeight: 700,
                  border: '2px solid var(--ink)',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
      {promptType === 'country' && borders && borders.length === 0 && (
        <p style={{
          fontSize: 12, color: 'var(--t3)', marginTop: -8, marginBottom: 22,
          fontFamily: 'var(--ff-u)', lineHeight: 1.5, fontStyle: 'italic',
        }}>
          No land borders — it's an island nation.
        </p>
      )}
      {showFacts && (
        <div style={{ marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <KeyStats country={country} compact />
          {fact && <DidYouKnow country={country} fact={fact} />}
        </div>
      )}
      <button
        ref={buttonRef}
        onClick={onAcknowledge}
        onKeyDown={handleKeyDown}
        style={{
          padding: '10px 22px 8px', borderRadius: 14, alignSelf: 'flex-start',
          background: 'var(--coral)', border: '2px solid var(--ink)', borderBottomWidth: 5,
          color: '#fff', fontSize: 15, fontWeight: 800,
          cursor: 'pointer', fontFamily: 'var(--ff-u)', outline: 'none',
        }}
      >
        Got it →
      </button>
    </div>
  );
}
