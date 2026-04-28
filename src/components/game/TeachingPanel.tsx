import { useEffect, useRef } from 'react';
import type { CountryEntry } from '../../types';

interface TeachingPanelProps {
  country: CountryEntry;
  promptType: 'country' | 'capital';
  onAcknowledge: () => void;
}

export function TeachingPanel({ country, promptType, onAcknowledge }: TeachingPanelProps) {
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
      <div style={{
        fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(58,92,140,0.8)', marginBottom: 10, fontWeight: 500,
        fontFamily: 'var(--ff-u)',
      }}>
        Learn
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
