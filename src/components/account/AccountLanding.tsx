import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CountryProgress, GlobalStats, GameMode } from '../../types';
import { getMastery } from '../../lib/progressStorage';
import countriesData from '../../data/countries.json';
import type { CountryEntry } from '../../types';
import { ProgressMap } from '../progress/ProgressMap';
import { BotanicalDivider } from '../ui/BotanicalDivider';

const countries = countriesData as CountryEntry[];

const MODE_META: { id: GameMode; label: string; blurb: string }[] = [
  { id: 'country', label: 'Countries', blurb: 'Name the nation' },
  { id: 'capital', label: 'Capitals', blurb: 'Name the capital' },
  { id: 'both', label: 'Both', blurb: 'Countries & capitals' },
  { id: 'practice', label: 'Practice', blurb: 'Focus weak spots' },
  { id: 'learn', label: 'Learn', blurb: 'Spaced repetition' },
  { id: 'versus', label: 'Versus', blurb: 'Multiplayer duels' },
];

interface AccountLandingProps {
  user: User | null;
  progress: Record<string, CountryProgress>;
  globalStats: GlobalStats;
  personalBests: Record<string, number>;
  onBack: () => void;
  onReset: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function AccountLanding({
  user, progress, globalStats, personalBests, onBack, onReset, onSignIn, onSignOut,
}: AccountLandingProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'needs_improvement' | 'killing_it'>('all');

  const studied = useMemo(
    () => countries.filter(c => {
      const p = progress[c.id];
      return p && (p.countryAttempts + p.capitalAttempts) > 0;
    }),
    [progress],
  );

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
    for (const { country, avg } of withMastery) map[country.id] = avg;
    return map;
  }, [withMastery]);

  // Lifetime accuracy across every attempt
  const accuracy = useMemo(() => {
    let correct = 0;
    let attempts = 0;
    for (const p of Object.values(progress)) {
      correct += p.countryCorrect + p.capitalCorrect;
      attempts += p.countryAttempts + p.capitalAttempts;
    }
    return attempts > 0 ? correct / attempts : null;
  }, [progress]);

  const avgScore = globalStats.totalSessions > 0
    ? Math.round(globalStats.totalScore / globalStats.totalSessions)
    : 0;

  const bestForMode = useMemo(() => {
    // Highest personal-best across that mode's time variants (key = `${mode}_${timeMode}`)
    const map: Record<string, number> = {};
    for (const [key, score] of Object.entries(personalBests)) {
      const mode = key.split('_')[0];
      map[mode] = Math.max(map[mode] ?? 0, score);
    }
    return map;
  }, [personalBests]);

  const filteredCountries = useMemo(() => {
    if (activeTab === 'needs_improvement') {
      return withMastery.filter(x => x.avg < 0.6).sort((a, b) => a.avg - b.avg);
    }
    if (activeTab === 'killing_it') {
      return withMastery.filter(x => x.avg >= 0.6).sort((a, b) => b.avg - a.avg);
    }
    return [...withMastery].sort((a, b) => a.country.name.localeCompare(b.country.name));
  }, [withMastery, activeTab]);

  function masteryColor(m: number): string {
    if (m >= 0.8) return 'var(--olive-hi)';
    if (m >= 0.6) return 'var(--olive)';
    if (m >= 0.4) return 'var(--gold-hi)';
    if (m >= 0.2) return '#d97706';
    return 'var(--miss)';
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '🌍';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : null;

  const hasData = globalStats.totalSessions > 0 || studied.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 20,
      }} className="progress-header-row">
        <button
          onClick={onBack}
          style={{
            color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13,
            background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 80,
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontFamily: 'var(--ff-d)', fontWeight: 300, fontSize: 24, letterSpacing: '0.04em', color: 'var(--t1)' }}>
          Your Account
        </h1>
        <div style={{ width: 80, display: 'flex', justifyContent: 'flex-end' }}>
          {studied.length > 0 && (
            <button
              onClick={onReset}
              style={{
                color: 'var(--miss)', fontFamily: 'var(--ff-u)', fontSize: 12,
                background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8,
              }}
            >
              Reset All
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: '32px clamp(16px, 4vw, 24px)', maxWidth: 840, margin: '0 auto', width: '100%' }}>
        {/* Account details */}
        <div style={{
          background: 'var(--s1)', borderRadius: 3, border: '1px solid var(--border)',
          padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18, marginBottom: 32,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--olive)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--ff-u)', fontWeight: 700, fontSize: 18, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {user ? (
              <>
                <div style={{ fontFamily: 'var(--ff-u)', fontWeight: 600, fontSize: 16, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--ff-u)', marginTop: 2 }}>
                  {memberSince ? `Member since ${memberSince}` : 'Signed in'}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--ff-u)', fontWeight: 600, fontSize: 16, color: 'var(--t1)' }}>
                  Guest
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--ff-u)', marginTop: 2 }}>
                  Sign in to save your progress across devices.
                </div>
              </>
            )}
          </div>
          <button
            onClick={user ? onSignOut : onSignIn}
            style={{
              padding: '9px 16px', borderRadius: 3, fontFamily: 'var(--ff-u)', fontSize: 13, fontWeight: 500,
              border: '1px solid var(--border-hi)', cursor: 'pointer', whiteSpace: 'nowrap',
              color: user ? 'var(--miss)' : 'var(--olive)',
              background: 'var(--bg)',
            }}
          >
            {user ? 'Sign out' : 'Sign in'}
          </button>
        </div>

        {/* Lifetime stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Sessions" value={String(globalStats.totalSessions)} />
          <StatCard label="Best Score" value={globalStats.bestScore.toLocaleString()} />
          <StatCard label="Avg Score" value={avgScore.toLocaleString()} />
          <StatCard label="Best Streak" value={`×${globalStats.bestStreak}`} />
          <StatCard label="Days Played" value={String(globalStats.daysPlayed.length)} />
          <StatCard label="Countries Studied" value={String(studied.length)} />
          <StatCard label="Accuracy" value={accuracy !== null ? `${Math.round(accuracy * 100)}%` : '—'} />
          <StatCard label="Versus W / L" value={`${globalStats.versusWins} / ${globalStats.versusLosses}`} />
        </div>

        <div style={{ margin: '24px 0 28px', display: 'flex', justifyContent: 'center' }}>
          <BotanicalDivider />
        </div>

        {/* Game-mode breakdown */}
        <h2 style={{ fontFamily: 'var(--ff-d)', fontWeight: 400, fontSize: 18, color: 'var(--t1)', marginBottom: 14, letterSpacing: '0.03em' }}>
          By Game Mode
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 32 }}>
          {MODE_META.map(({ id, label, blurb }) => {
            const ms = globalStats.modeStats[id];
            const sessions = ms?.sessions ?? 0;
            const played = sessions > 0;
            const best = id === 'versus'
              ? globalStats.versusWins
              : (ms?.bestScore ?? bestForMode[id] ?? 0);
            const avg = ms && ms.sessions > 0 ? Math.round(ms.totalScore / ms.sessions) : 0;
            return (
              <div key={id} style={{
                background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)',
                padding: '14px 16px', opacity: played ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--ff-u)', fontWeight: 600, fontSize: 14, color: 'var(--t1)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--ff-u)', fontSize: 11, color: 'var(--t3)' }}>{blurb}</span>
                </div>
                {played ? (
                  <div style={{ display: 'flex', gap: 14 }}>
                    <ModeMetric label={id === 'versus' ? 'Games' : 'Sessions'} value={String(sessions)} />
                    <ModeMetric label={id === 'versus' ? 'Wins' : 'Best'} value={best.toLocaleString()} />
                    {id !== 'versus' && <ModeMetric label="Avg" value={avg.toLocaleString()} />}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--ff-u)', fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>
                    Not played yet
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ margin: '0 0 28px', display: 'flex', justifyContent: 'center' }}>
          <BotanicalDivider />
        </div>

        {!hasData ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)', fontFamily: 'var(--ff-u)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
            <p>No progress yet. Start a game to begin tracking!</p>
          </div>
        ) : (
          <>
            {/* Map progress */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'var(--ff-d)', fontWeight: 400, fontSize: 18, color: 'var(--t1)', letterSpacing: '0.03em' }}>
                Map Progress
              </h2>
              <span style={{ fontFamily: 'var(--ff-u)', fontSize: 12, color: 'var(--t3)' }}>
                {studied.length} / {countries.length} countries studied
              </span>
            </div>
            <div style={{ height: 'min(50vh, 560px)', minHeight: 280, marginBottom: 32, borderRadius: 3, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <ProgressMap masteryMap={masteryMap} />
            </div>

            <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}>
              <BotanicalDivider />
            </div>

            {/* Per-country list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="progress-tab-row" style={{ background: 'var(--s1)', borderRadius: 3, border: '1px solid var(--border)', padding: 4, fontFamily: 'var(--ff-u)', gap: 4 }}>
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
                      textTransform: 'capitalize',
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
                    <div key={country.id} className="progress-country-row" style={{
                      background: 'var(--bg)', borderRadius: 3, border: '1px solid var(--border)',
                      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16,
                      transition: 'border-color 0.14s',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--ff-u)', fontWeight: 500, fontSize: 15, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {country.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {country.capital} <span style={{ color: 'var(--border-hi)', margin: '0 4px' }}>·</span> {country.region}
                        </div>
                      </div>
                      <div className="progress-row-metrics" style={{ display: 'flex', gap: 16, alignItems: 'center', textAlign: 'right' }}>
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
      padding: '16px', textAlign: 'center',
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

function ModeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: 'var(--ff-d)', fontWeight: 600, fontSize: 18, color: 'var(--t1)', lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontFamily: 'var(--ff-u)', fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</span>
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
