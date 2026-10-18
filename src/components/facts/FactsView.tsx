import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlobeMap } from '../game/GlobeMap';
import { PopBackdrop } from '../ui/PopBackdrop';
import { FactCard } from './FactCard';
import type { CountryColorState, CountryEntry, GameSettings } from '../../types';
import { getDataset } from '../../lib/dataset';
import { FACTS_ACCENT, hasFacts } from '../../lib/facts';
import { buildQuestion, questionsForCountry, type FactQuestion } from '../../lib/factQuiz';
import { factPriority, isFactKnown, loadFactsProgress, recordFactAttempt } from '../../lib/factsProgress';

interface FactsViewProps {
  settings: GameSettings;
  onBackToMenu: () => void;
}

type Step =
  | { type: 'card'; countryId: string }
  | { type: 'question'; q: FactQuestion; review?: boolean };

const SESSION_SIZE = 6;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Learn a few countries, then test them:
//   card → 2 quick questions (per country) … → a shuffled review round of
//   "which country is this fact about?" questions → missed questions once more.
function buildSession(pool: CountryEntry[]): { steps: Step[]; countryIds: string[] } {
  const progress = loadFactsProgress();
  const ordered = shuffle(pool).sort((a, b) => factPriority(progress[a.id]) - factPriority(progress[b.id]));
  const picked = ordered.slice(0, SESSION_SIZE);
  const steps: Step[] = [];
  for (const c of picked) {
    steps.push({ type: 'card', countryId: c.id });
    for (const q of questionsForCountry(c, pool)) steps.push({ type: 'question', q });
  }
  for (const c of shuffle(picked)) {
    const q = buildQuestion('which-country', c, pool, Math.floor(Math.random() * 3));
    if (q) steps.push({ type: 'question', q, review: true });
  }
  return { steps, countryIds: picked.map(c => c.id) };
}

export function FactsView({ settings, onBackToMenu }: FactsViewProps) {
  const dataset = getDataset('world');
  const pool = useMemo(
    () => dataset.entries.filter(c =>
      hasFacts(c.id) && (settings.regionFilter.length === 0 || settings.regionFilter.includes(c.region))),
    [dataset, settings.regionFilter],
  );

  // Explore ignores the study region filter: any country on the globe is fair game.
  const explorePool = useMemo(() => dataset.entries.filter(c => hasFacts(c.id)), [dataset]);
  const [exploreNotice, setExploreNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'study' | 'explore'>('study');
  const [session, setSession] = useState(() => buildSession(pool));
  const [stepIndex, setStepIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [missed, setMissed] = useState<FactQuestion[]>([]);
  const [requeued, setRequeued] = useState(false);
  const [exploreId, setExploreId] = useState<string>(() => explorePool[Math.floor(Math.random() * explorePool.length)]?.id ?? 'FRA');
  const [focusToken, setFocusToken] = useState(1);
  const [recenterToken, setRecenterToken] = useState(0);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  const steps = session.steps;
  const step = steps[stepIndex] as Step | undefined;
  const done = tab === 'study' && !step;
  const focusId = tab === 'explore' ? exploreId : step ? (step.type === 'card' ? step.countryId : step.q.countryId) : null;
  // Don't fly to (or highlight) the answer while a "which country?" question is open.
  const hideTarget = tab === 'study' && step?.type === 'question' && step.q.kind === 'which-country' && chosen === null;

  useEffect(() => { setFocusToken(t => t + 1); }, [focusId, hideTarget]);
  useEffect(() => { if (chosen !== null || step?.type === 'card') nextBtnRef.current?.focus(); }, [chosen, step]);

  const colorMap = useMemo(() => {
    const map: Record<string, CountryColorState> = {};
    if (tab === 'study') {
      const progress = loadFactsProgress();
      for (const id of session.countryIds) if (isFactKnown(progress[id])) map[id] = 'correct';
    }
    if (focusId && !hideTarget) map[focusId] = 'teaching';
    return map;
  }, [tab, session.countryIds, focusId, hideTarget, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    setChosen(null);
    if (stepIndex + 1 >= steps.length && !requeued && missed.length > 0) {
      // One more pass at whatever was missed, in a new order.
      setRequeued(true);
      setSession(s => ({ ...s, steps: [...s.steps, ...shuffle(missed).map(q => ({ type: 'question' as const, q, review: true }))] }));
    }
    setStepIndex(i => i + 1);
  }, [stepIndex, steps.length, requeued, missed]);

  function answer(option: string) {
    if (!step || step.type !== 'question' || chosen !== null) return;
    const correct = option === step.q.answer;
    setChosen(option);
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    recordFactAttempt(step.q.countryId, correct);
    if (!correct) setMissed(m => [...m, { ...step.q, options: shuffle(step.q.options) }]);
  }

  function restart() {
    setSession(buildSession(pool));
    setStepIndex(0);
    setChosen(null);
    setScore({ correct: 0, total: 0 });
    setMissed([]);
    setRequeued(false);
  }

  const handleGlobeClick = useCallback((id: string | null) => {
    if (!id) { setExploreNotice(null); return; }
    if (explorePool.some(c => c.id === id)) {
      setExploreId(id);
      setExploreNotice(null);
    } else {
      setExploreNotice(`No facts for ${dataset.byId.get(id)?.name ?? 'that place'} yet. Try another country.`);
    }
  }, [explorePool, dataset]);

  const progressPercent = steps.length ? Math.min(100, (stepIndex / steps.length) * 100) : 0;
  const tabBtn = (id: 'study' | 'explore', label: string) => (
    <button
      onClick={() => { setTab(id); if (id === 'explore') setRecenterToken(t => t + 1); }}
      style={{
        padding: '5px 14px', borderRadius: 999, fontSize: 13, fontFamily: 'var(--ff-u)',
        fontWeight: 800, cursor: 'pointer',
        border: '2px solid var(--ink)',
        background: tab === id ? 'var(--sun)' : 'var(--bg)',
        boxShadow: tab === id ? '2px 2px 0 var(--ink)' : 'none',
        color: 'var(--ink)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="responsive-split-shell gameplay-shell">
      <div className="responsive-side-panel" style={{
        flex: '0 0 38%', minWidth: 320, maxWidth: 480,
        display: 'flex', flexDirection: 'column',
        borderRight: '3px solid var(--ink)', background: 'var(--s1)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="game-top-bar" style={{
          alignItems: 'center', gap: 12, padding: '15px 20px',
          borderBottom: '2px solid var(--border)', background: 'var(--bg)', flexShrink: 0,
        }}>
          <button
            onClick={onBackToMenu}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--t3)',
              letterSpacing: '0.05em', padding: '4px 8px', borderRadius: 10, border: 'none',
              background: 'none', cursor: 'pointer', fontFamily: 'var(--ff-u)',
            }}
          >
            <svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M11,4 L6,9 L11,14" />
            </svg>
            Back
          </button>
          <div style={{
            flex: 1, textAlign: 'center', fontFamily: 'var(--ff-d)', fontSize: 15,
            letterSpacing: '0.09em', color: 'var(--t2)',
          }}>
            Facts
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {tabBtn('study', 'Study')}
            {tabBtn('explore', 'Explore')}
          </div>
        </div>

        {tab === 'study' && !done && (
          <div className="game-progress-strip" style={{
            alignItems: 'center', gap: 14, padding: '11px 20px',
            borderBottom: '2px solid var(--border)', flexShrink: 0,
          }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, overflow: 'hidden', background: FACTS_ACCENT.tint }}>
              <div style={{
                width: `${progressPercent}%`, height: '100%', borderRadius: 999,
                background: FACTS_ACCENT.text, opacity: 0.7, transition: 'width 0.25s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {score.correct}/{score.total} correct
            </div>
          </div>
        )}

        <div className="responsive-panel-body" style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '26px 28px 20px',
          display: 'flex', flexDirection: 'column',
        }}>
          {tab === 'explore' ? (
            <ExplorePanel
              country={dataset.byId.get(exploreId)!}
              notice={exploreNotice}
              onRandom={() => {
                setExploreId(explorePool[Math.floor(Math.random() * explorePool.length)].id);
                setExploreNotice(null);
                setRecenterToken(t => t + 1);
              }}
            />
          ) : done ? (
            <Summary
              countries={session.countryIds.map(id => dataset.byId.get(id)!)}
              score={score}
              onAgain={restart}
              onExplore={() => setTab('explore')}
              onBack={onBackToMenu}
            />
          ) : step?.type === 'card' ? (
            <>
              <div style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: FACTS_ACCENT.text, fontWeight: 700, fontFamily: 'var(--ff-u)', marginBottom: 12,
              }}>
                Study · {session.countryIds.indexOf(step.countryId) + 1} of {session.countryIds.length}
              </div>
              <FactCard country={dataset.byId.get(step.countryId)!} />
              <PrimaryButton ref={nextBtnRef} onClick={advance} style={{ marginTop: 22 }}>Quiz me →</PrimaryButton>
            </>
          ) : step ? (
            <QuestionPanel
              key={stepIndex}
              q={step.q}
              review={step.review}
              chosen={chosen}
              onAnswer={answer}
              onNext={advance}
              nextRef={nextBtnRef}
            />
          ) : null}
        </div>
      </div>

      <div className="responsive-globe-panel" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--s1)' }}>
        <PopBackdrop />
        <button
          onClick={() => setRecenterToken(v => v + 1)}
          title="Recenter globe"
          style={{
            position: 'absolute', top: 18, right: 18, zIndex: 12,
            padding: '8px 12px', borderRadius: 999,
            border: '2px solid var(--ink)', background: 'var(--bg)', color: 'var(--ink)', fontWeight: 800, boxShadow: 'var(--pop-shadow)', cursor: 'pointer',
            fontFamily: 'var(--ff-u)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          Recenter
        </button>
        <div style={{ position: 'absolute', inset: 0 }}>
          <GlobeMap
            colorMap={colorMap}
            currentId={hideTarget ? null : focusId}
            focusToken={focusToken}
            freezeFocus={tab === 'explore'}
            onLocateClick={tab === 'explore' ? handleGlobeClick : undefined}
            recenterToken={recenterToken}
            promptIndex={stepIndex}
          />
        </div>
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg)', border: '2px solid var(--ink)', borderRadius: 999, padding: '4px 14px', boxShadow: 'var(--pop-shadow)',
          fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--ink)', fontWeight: 800, pointerEvents: 'none', fontFamily: 'var(--ff-u)',
          whiteSpace: 'nowrap',
        }}>
          {tab === 'explore' ? 'Click any country to see its facts' : 'Drag to rotate · Scroll to zoom'}
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, style, ref }: {
  children: React.ReactNode; onClick: () => void; style?: React.CSSProperties; ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      style={{
        padding: '10px 22px 8px', borderRadius: 14, alignSelf: 'flex-start',
        background: 'var(--coral)', border: '2px solid var(--ink)', borderBottomWidth: 5,
        color: '#fff', fontSize: 15, fontWeight: 800,
        cursor: 'pointer', fontFamily: 'var(--ff-u)', outline: 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function QuestionPanel({ q, review, chosen, onAnswer, onNext, nextRef }: {
  q: FactQuestion; review?: boolean; chosen: string | null;
  onAnswer: (o: string) => void; onNext: () => void; nextRef: React.Ref<HTMLButtonElement>;
}) {
  const answered = chosen !== null;
  const correct = chosen === q.answer;

  // Number keys 1–4 pick an option.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= q.options.length) onAnswer(q.options[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, q, onAnswer]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', animation: 'fade-up 0.2s ease forwards' }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--t3)', fontWeight: 700, fontFamily: 'var(--ff-u)', marginBottom: 10,
      }}>
        {review ? 'Review' : 'Quick check'}
      </div>
      <div style={{ fontFamily: 'var(--ff-d)', fontSize: 24, color: 'var(--t1)', lineHeight: 1.25, marginBottom: q.clue ? 12 : 20 }}>
        {q.prompt}
      </div>
      {q.clue && (
        <div style={{
          fontSize: 14, color: 'var(--t2)', fontFamily: 'var(--ff-u)', lineHeight: 1.55,
          padding: '12px 14px', borderLeft: `2px solid ${FACTS_ACCENT.line}`,
          background: FACTS_ACCENT.tint, marginBottom: 20, fontStyle: 'italic',
        }}>
          {q.clue}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((o, i) => {
          const isAnswer = o === q.answer;
          const isChosen = o === chosen;
          const border = answered && isAnswer ? 'rgba(42,138,62,0.5)'
            : answered && isChosen ? 'rgba(217,43,58,0.45)' : 'var(--border-hi)';
          const bg = answered && isAnswer ? 'rgba(42,138,62,0.10)'
            : answered && isChosen ? 'rgba(217,43,58,0.08)' : 'var(--bg)';
          return (
            <button
              key={o}
              onClick={() => onAnswer(o)}
              disabled={answered}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '11px 14px', borderRadius: 10, border: `1px solid ${border}`, background: bg,
                color: answered && isAnswer ? 'var(--ok-hi)' : answered && isChosen ? 'var(--miss-hi)' : 'var(--t1)',
                fontSize: 14, fontFamily: 'var(--ff-u)', cursor: answered ? 'default' : 'pointer',
                opacity: answered && !isAnswer && !isChosen ? 0.55 : 1,
                transition: 'background 0.14s, border-color 0.14s',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--t3)', width: 12, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{o}</span>
              {answered && isAnswer && <span>✓</span>}
              {answered && isChosen && !isAnswer && <span>✗</span>}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <div style={{
            marginTop: 16, fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--ff-u)',
            color: correct ? 'var(--ok-hi)' : 'var(--miss-hi)',
          }}>
            <strong>{correct ? 'Correct! ' : 'Not quite. '}</strong>
            <span style={{ color: 'var(--t2)' }}>{q.explain}</span>
          </div>
          <PrimaryButton ref={nextRef} onClick={onNext} style={{ marginTop: 18 }}>Next →</PrimaryButton>
        </>
      )}
    </div>
  );
}

function ExplorePanel({ country, onRandom, notice }: { country: CountryEntry; onRandom: () => void; notice: string | null }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: FACTS_ACCENT.text, fontWeight: 700, fontFamily: 'var(--ff-u)',
        }}>
          Explore · click the globe
        </div>
        <button
          onClick={onRandom}
          style={{
            fontSize: 12, padding: '5px 11px', borderRadius: 10, cursor: 'pointer',
            border: '2px solid var(--border-hi)', background: 'var(--bg)', color: 'var(--t2)',
            fontFamily: 'var(--ff-u)',
          }}
        >
          🎲 Random
        </button>
      </div>
      {notice && (
        <div style={{
          marginBottom: 14, padding: '9px 13px', borderRadius: 12, fontSize: 13, fontWeight: 700,
          fontFamily: 'var(--ff-u)', color: 'var(--ink)', background: 'var(--sun-soft)', border: '2px solid var(--ink)',
        }}>
          {notice}
        </div>
      )}
      <FactCard key={country.id} country={country} />
    </>
  );
}

function Summary({ countries, score, onAgain, onExplore, onBack }: {
  countries: CountryEntry[]; score: { correct: number; total: number };
  onAgain: () => void; onExplore: () => void; onBack: () => void;
}) {
  const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;
  return (
    <div style={{ marginTop: 20, animation: 'fade-up 0.3s ease forwards' }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🧭</div>
      <div style={{ fontFamily: 'var(--ff-d)', fontSize: 24, color: 'var(--t1)', marginBottom: 6 }}>
        Session complete
      </div>
      <div style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--ff-u)', marginBottom: 18 }}>
        {score.correct} of {score.total} correct ({pct}%)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {countries.map(c => (
          <span key={c.id} style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 999, color: 'var(--ink)', fontWeight: 700,
            border: `2px solid ${FACTS_ACCENT.line}`, background: FACTS_ACCENT.tint, fontFamily: 'var(--ff-u)',
          }}>
            {c.name}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PrimaryButton onClick={onAgain}>Next {countries.length} countries →</PrimaryButton>
        <button onClick={onExplore} style={secondaryBtn}>Explore</button>
        <button onClick={onBack} style={secondaryBtn}>Menu</button>
      </div>
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
  border: '2px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontFamily: 'var(--ff-u)',
};
