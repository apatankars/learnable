import { useEffect, useRef } from 'react';
import type { CountryEntry } from '../../types';

interface TeachingPanelProps {
  country: CountryEntry;
  promptType: 'country' | 'capital';
  score: number;
  streak: number;
  onAcknowledge: () => void;
}

export function TeachingPanel({ country, promptType, score, streak, onAcknowledge }: TeachingPanelProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { buttonRef.current?.focus(); }, [country, promptType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAcknowledge(); }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      padding: '24px 20px',
      background: 'rgba(58,92,140,0.08)',
      border: '1px solid rgba(58,92,140,0.22)',
      borderRadius: 3,
      animation: 'fade-up 0.36s ease forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(58,92,140,0.8)', fontWeight: 500,
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
              fontFamily: 'var(--ff-d)', fontSize: 26, fontWeight: 300,
              color: 'var(--gold-hi)', lineHeight: 1,
            }}>{score}</span>
            <span style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>pts</span>
          </div>
        </div>
      </div>
      <h3 style={{
        fontFamily: 'var(--ff-d)', fontSize: 24, fontWeight: 400,
        color: 'var(--t1)', lineHeight: 1.25, marginBottom: 8,
      }}>
        {promptType === 'country'
          ? `This is ${country.name}`
          : `${country.name}'s capital is ${country.capital}`}
      </h3>
      <p style={{
        fontSize: 13, color: 'var(--t2)', marginBottom: 22,
        fontFamily: 'var(--ff-u)', lineHeight: 1.5,
      }}>
        {promptType === 'country'
          ? `Located in ${country.region}. Study its position on the globe.`
          : `Take a moment to memorize it.`}
      </p>
      <button
        ref={buttonRef}
        onClick={onAcknowledge}
        onKeyDown={handleKeyDown}
        style={{
          padding: '10px 20px', borderRadius: 3, alignSelf: 'flex-start',
          background: 'rgba(58,92,140,0.12)', border: '1px solid rgba(58,92,140,0.30)',
          color: 'rgba(40,70,130,0.9)', fontSize: 13, fontWeight: 500,
          letterSpacing: '0.05em', cursor: 'pointer', fontFamily: 'var(--ff-u)',
          transition: 'background 0.14s', outline: 'none',
        }}
      >
        Got it →
      </button>
    </div>
  );
}
