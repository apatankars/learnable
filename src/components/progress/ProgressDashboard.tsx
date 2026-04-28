import { useState, useMemo } from 'react';
import type { CountryProgress, GlobalStats } from '../../types';
import { getMastery } from '../../lib/progressStorage';
import countriesData from '../../data/countries.json';
import type { CountryEntry } from '../../types';
import { ProgressMap } from './ProgressMap';
import { BotanicalDivider } from '../ui/BotanicalDivider';

const countries = countriesData as CountryEntry[];

interface ProgressDashboardProps {
  progress: Record<string, CountryProgress>;
  globalStats: GlobalStats;
  onBack: () => void;
  onReset: () => void;
}

export function ProgressDashboard({ progress, globalStats, onBack, onReset }: ProgressDashboardProps) {
  const studied = countries.filter(c => {
    const p = progress[c.id];
    return p && (p.countryAttempts + p.capitalAttempts) > 0;
  });

  const [activeTab, setActiveTab] = useState<'all' | 'needs_improvement' | 'killing_it'>('all');

  const withMastery = useMemo(() => {
    return studied.map(c => {
      const p = progress[c.id];
      const cm = getMastery(p, 'country');
      const km = getMastery(p, 'capital');
      const avg = (cm + km) / 2;
      return { country: c, progress: p, cm, km, avg };
    });
  }, [studied, progress]);

  const masteryMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const { country, avg } of withMastery) {
      map[country.id] = avg;
    }
    return map;
  }, [withMastery]);

  const filteredCountries = useMemo(() => {
    let filtered = withMastery;
    if (activeTab === 'needs_improvement') {
      filtered = withMastery.filter(x => x.avg < 0.6).sort((a, b) => a.avg - b.avg);
    } else if (activeTab === 'killing_it') {
      filtered = withMastery.filter(x => x.avg >= 0.6).sort((a, b) => b.avg - a.avg);
    } else {
      filtered = [...withMastery].sort((a, b) => a.country.name.localeCompare(b.country.name));
    }
    return filtered;
  }, [withMastery, activeTab]);

  function masteryColor(m: number): string {
    if (m >= 0.8) return 'var(--olive-hi)';
    if (m >= 0.6) return 'var(--olive)';
    if (m >= 0.4) return 'var(--gold-hi)';
    if (m >= 0.2) return '#d97706';
    return 'var(--miss)';
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 20
      }}>
        <button
          onClick={onBack}
          style={{
            color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13,
            background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 80
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontFamily: 'var(--ff-d)', fontWeight: 300, fontSize: 24, letterSpacing: '0.04em', color: 'var(--t1)' }}>
          Your Progress
        </h1>
        <div style={{ width: 80, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onReset}
            style={{
              color: 'var(--miss)', fontFamily: 'var(--ff-u)', fontSize: 12,
              background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8
            }}
          >
            Reset All
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '32px 24px', maxWidth: 840, margin: '0 auto', width: '100%' }}>
        {/* Global stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
          <StatCard label="Sessions" value={String(globalStats.totalSessions)} />
          <StatCard label="Best Score" value={globalStats.bestScore.toLocaleString()} />
          <StatCard label="Best Streak" value={`×${globalStats.bestStreak}`} />
          <StatCard label="Days Played" value={String(globalStats.daysPlayed.length)} />
        </div>

        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <BotanicalDivider />
        </div>

        {studied.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--t3)', fontFamily: 'var(--ff-u)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
            <p>No progress yet. Start a game to begin tracking!</p>
          </div>
        ) : (
          <>
            <div style={{ height: '50vh', minHeight: 400, marginBottom: 32, borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <ProgressMap masteryMap={masteryMap} />
            </div>

            <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
              <BotanicalDivider />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', background: 'var(--s1)', borderRadius: 3, border: '1px solid var(--border)', padding: 4, fontFamily: 'var(--ff-u)' }}>
                {(['all', 'needs_improvement', 'killing_it'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, borderRadius: 3,
                      background: activeTab === tab ? 'var(--bg)' : 'transparent',
                      color: activeTab === tab ? (tab === 'needs_improvement' ? 'var(--miss)' : tab === 'killing_it' ? 'var(--olive)' : 'var(--t1)') : 'var(--t3)',
                      border: activeTab === tab ? '1px solid var(--border)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 0.14s',
                      textTransform: 'capitalize'
                    }}
                  >
                    {tab.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {filteredCountries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)', fontFamily: 'var(--ff-u)' }}>
                  <p>No countries match this filter.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredCountries.map(({ country, cm, km }) => (
                    <div key={country.id} style={{
                      background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)',
                      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16,
                      transition: 'border-color 0.14s'
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--ff-u)', fontWeight: 500, fontSize: 15, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {country.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {country.capital} <span style={{ color: 'var(--border-hi)', margin: '0 4px' }}>·</span> {country.region}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', textAlign: 'right' }}>
                        <MasteryPip label="Country" value={cm} color={masteryColor(cm)} />
                        <MasteryPip label="Capital" value={km} color={masteryColor(km)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)',
      padding: '16px', textAlign: 'center'
    }}>
      <div style={{ fontFamily: 'var(--ff-d)', fontWeight: 600, fontSize: 24, color: 'var(--t1)', marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--ff-u)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  );
}

function MasteryPip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 48 }}>
      <div style={{ width: '100%', background: 'var(--s1)', borderRadius: 4, height: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', borderRadius: 4, background: color, transition: 'width 0.5s', width: `${Math.round(value * 100)}%` }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--ff-u)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}
