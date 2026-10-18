import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { SettingsPanel } from "./SettingsPanel";
import { UserMenu } from "../auth/UserMenu";
import { PopBackdrop } from "../ui/PopBackdrop";
import { PopDivider } from "../ui/PopDivider";
import { getTimeMode } from "../../lib/leaderboard";
import { loadGlobeMapModule } from "../../lib/preload";
import { learnPoolCounts } from "../../lib/learnScope";
import type { CountryProgress, GameMode, GameSettings, GlobalStats, Topic } from "../../types";

const OrbisGlobe = lazy(() => loadGlobeMapModule().then((module) => ({ default: module.GlobeMap })));

interface HomeScreenProps {
  defaultSettings: GameSettings;
  globalStats: GlobalStats;
  personalBests: Record<string, number>;
  user: User | null;
  onStart: (settings: GameSettings) => void;
  onViewProgress: () => void;
  onViewLeaderboard: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onVersusMode: () => void;
  versusEmoji: string;
  onVersusEmojiChange: (emoji: string) => void;
  dueToday?: number;
  progressData?: Record<string, CountryProgress>;
}

const VERSUS_EMOJI_OPTIONS = [
  "🌍",
  "🦊",
  "🐼",
  "🦁",
  "🐸",
  "🦉",
  "🐙",
  "🐯",
  "🐻",
  "🦄",
  "🐱",
  "🐶",
  "🦋",
  "🐵",
];

function ModeIcon({ type }: { type: string }) {
  const s = {
    width: 20,
    height: 20,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (type === "globe")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3,12 Q7.5,9 12,12 Q16.5,15 21,12" />
        <path d="M12,3 Q9.5,7.5 12,12 Q14.5,16.5 12,21" />
      </svg>
    );
  if (type === "pin")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M12,21 C12,21 5,14 5,9.5 C5,6 8.1,3 12,3 C15.9,3 19,6 19,9.5 C19,14 12,21 12,21Z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    );
  if (type === "earth")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3,12 Q7.5,9 12,12 Q16.5,15 21,12" strokeWidth="0.9" />
        <path d="M12,3 Q9.5,7.5 12,12 Q14.5,16.5 12,21" strokeWidth="0.9" />
        <path
          d="M8,4.5 Q6.5,8.5 7.5,12 Q6.5,15.5 8,19.5"
          strokeWidth="0.7"
          opacity="0.5"
        />
      </svg>
    );
  if (type === "loop")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M3,12 C3,7 7,3 12,3 C17,3 21,7 21,12" />
        <path d="M18,12 L21,12 L21,9" />
        <path d="M21,12 C21,17 17,21 12,21 C7,21 3,17 3,12" />
        <path d="M6,12 L3,12 L3,15" />
      </svg>
    );
  if (type === "book")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M3,5 L12,3 L21,5 L12,8 Z" />
        <line x1="21" y1="5" x2="21" y2="17" />
        <path d="M6,8 L6,18 C6,18 9,21 12,21 C15,21 18,18 18,18 L18,8" />
      </svg>
    );
  if (type === "clock")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12,7 L12,12 L15.5,14" />
      </svg>
    );
  if (type === "spark")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M9,18 L15,18 M10,21 L14,21" />
        <path d="M12,3 C8.5,3 6,5.6 6,8.8 C6,11 7.2,12.6 8.6,13.8 C9.3,14.4 9.6,15.1 9.6,16 L14.4,16 C14.4,15.1 14.7,14.4 15.4,13.8 C16.8,12.6 18,11 18,8.8 C18,5.6 15.5,3 12,3 Z" />
      </svg>
    );
  if (type === "users")
    return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  return null;
}

const MODES: {
  id: GameMode;
  label: string;
  desc: string;
  icon: string;
  requiresLogin?: boolean;
}[] = [
  {
    id: "country",
    label: "Countries",
    desc: "Name the highlighted nation",
    icon: "globe",
  },
  {
    id: "capital",
    label: "Capitals",
    desc: "Identify world capitals",
    icon: "pin",
  },
  {
    id: "both",
    label: "Both",
    desc: "Countries & capitals combined",
    icon: "earth",
  },
  {
    id: "versus",
    label: "Versus",
    desc: "Real-time multiplayer match",
    icon: "users",
    requiresLogin: true,
  },
  {
    id: "practice",
    label: "Practice",
    desc: "Focus on your weak spots",
    icon: "loop",
    requiresLogin: true,
  },
  {
    id: "learn",
    label: "Learn",
    desc: "Spaced repetition learning",
    icon: "book",
    requiresLogin: true,
  },
  {
    id: "facts",
    label: "Facts",
    desc: "Key stats & fun facts for every country",
    icon: "spark",
  },
  {
    id: "review",
    label: "Daily Review",
    desc: "Catch items before you forget them",
    icon: "clock",
    requiresLogin: true,
  },
];

const TOPICS: { id: Topic; label: string; sub: string }[] = [
  { id: "world", label: "World", sub: "Countries & capitals" },
  { id: "us-states", label: "US States", sub: "States & capitals" },
];

const US_STATE_MODE_OVERRIDES: Partial<Record<GameMode, { label: string; desc: string }>> = {
  country: { label: "States", desc: "Name the highlighted state" },
  capital: { label: "Capitals", desc: "Identify state capitals" },
  both: { label: "Both", desc: "States & capitals combined" },
  facts: { label: "Facts", desc: "World countries only (for now)" },
};

function getModeMeta(
  m: { id: GameMode; label: string; desc: string },
  topic: Topic,
) {
  if (topic === "us-states") {
    return US_STATE_MODE_OVERRIDES[m.id] ?? { label: m.label, desc: m.desc };
  }
  return { label: m.label, desc: m.desc };
}

// Two clean groups instead of one uneven grid of 7:
//  • Quick Quiz  — pick what you're tested on (a segmented control)
//  • Study       — the structured, login-gated modes (an even 2×2)
const QUIZ_IDS: GameMode[] = ["country", "capital", "both"];
const STUDY_IDS: GameMode[] = ["learn", "practice", "review", "versus", "facts"];

// Each study mode owns one candy color: it floods the card when selected.
const STUDY_ACCENT: Record<string, { fill: string; soft: string }> = {
  learn: { fill: "#7ed957", soft: "var(--green-soft)" },
  practice: { fill: "#ffd23f", soft: "var(--sun-soft)" },
  review: { fill: "#ffb86b", soft: "#ffe6cc" },
  facts: { fill: "#5cc3f5", soft: "var(--sky-soft)" },
  versus: { fill: "#c78bff", soft: "var(--grape-soft)" },
};

function modeById(id: GameMode) {
  return MODES.find((m) => m.id === id)!;
}

const POP_SHADOW = "3px 3px 0 var(--ink)";

// Small bold label that names a group of choices.
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink)",
          fontFamily: "var(--ff-u)",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
      <span
        style={{
          flex: 1,
          height: 0,
          borderTop: "3px dotted var(--ink)",
          opacity: 0.35,
        }}
      />
    </div>
  );
}

// Row of chunky toggle buttons; the chosen one lights up sunshine-yellow.
function Segmented({
  options,
  value,
  onChange,
  big = false,
}: {
  options: { id: string; label: string; sub?: string }[];
  value: string | null;
  onChange: (id: string) => void;
  big?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 8,
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="pop-btn"
            style={{
              background: active ? "var(--sun)" : "var(--bg)",
              padding: big ? "11px 6px 9px" : "9px 6px 7px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              transform: active ? "translateY(2px)" : undefined,
              borderBottomWidth: active ? 3 : undefined,
            }}
          >
            <span
              style={{
                fontFamily: "var(--ff-d)",
                fontSize: big ? 18 : 15,
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
              }}
            >
              {o.label}
            </span>
            {o.sub && (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "var(--t2)",
                }}
              >
                {o.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function IconSquareButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="pop-btn"
      style={{
        width: 52,
        flexShrink: 0,
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  width: 22,
  height: 22,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeScreen({
  defaultSettings,
  globalStats,
  personalBests,
  user,
  onStart,
  onViewProgress,
  onViewLeaderboard,
  onSignIn,
  onSignOut,
  onVersusMode,
  versusEmoji,
  onVersusEmojiChange,
  dueToday = 0,
  progressData,
}: HomeScreenProps) {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showDecorativeGlobe, setShowDecorativeGlobe] = useState(false);
  const topic: Topic = settings.topic ?? "world";
  const versusPromptLabel =
    settings.versusPrompts === "country"
      ? "Countries"
      : settings.versusPrompts === "capital"
        ? "Capitals"
        : "Both";

  // Learn scope preview: how many countries in the current filter still need
  // learning. Shown as a Resume/From-scratch chooser when there's progress.
  const learnCounts = useMemo(
    () => (settings.mode === "learn" && progressData ? learnPoolCounts(settings, progressData) : null),
    [settings, progressData],
  );
  const showLearnScope = !!learnCounts && learnCounts.remaining < learnCounts.total;
  const placeNounFor = (n: number) =>
    topic === "us-states" ? (n === 1 ? "state" : "states") : (n === 1 ? "country" : "countries");

  const currentTimeMode = getTimeMode(
    settings.timeLimitSeconds,
    settings.noTimeLimit,
  );
  const modeKey = `${settings.mode}_${currentTimeMode}`;
  const personalBest =
    settings.mode !== "practice" && settings.mode !== "learn" && settings.mode !== "review" && settings.mode !== "facts"
      ? (personalBests[modeKey] ?? null)
      : null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowDecorativeGlobe(true);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const startLabel = (() => {
    const m = MODES.find((mm) => mm.id === settings.mode);
    return m ? getModeMeta(m, topic).label : settings.mode;
  })();

  return (
    <div className="responsive-split-shell home-shell">
      {/* ── LEFT PANEL ── */}
      <div
        className="responsive-side-panel"
        style={{
          flex: "0 0 44%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "safe center",
          padding: "40px clamp(20px, 4vw, 52px)",
          borderRight: "3px solid var(--ink)",
          position: "relative",
          overflowX: "hidden",
          overflowY: "auto",
          background: "var(--bg)",
          backgroundImage:
            "radial-gradient(rgba(31,26,46,0.08) 1.4px, transparent 1.6px)",
          backgroundSize: "22px 22px",
        }}
      >
        {/* Auth — top right of panel */}
        <div className="home-auth-slot">
          {user ? (
            <UserMenu user={user} onSignOut={onSignOut} />
          ) : (
            <button
              onClick={onSignIn}
              className="pop-btn"
              style={{
                fontSize: 13,
                padding: "6px 14px",
                background: "var(--sun)",
                borderBottomWidth: 4,
              }}
            >
              Sign in
            </button>
          )}
        </div>

        {/* Header */}
        <header
          className="home-header"
          style={{
            marginBottom: 22,
            paddingRight: user ? 0 : 96,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--ff-d)",
              fontWeight: 800,
              fontSize: "clamp(3.4rem, 9vw, 5.2rem)",
              letterSpacing: "-0.035em",
              lineHeight: 0.95,
              color: "var(--ink)",
              textShadow: "4px 4px 0 var(--coral)",
              marginBottom: 12,
            }}
          >
            orbis
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <PopDivider />
          </div>
          <div
            style={{
              fontFamily: "var(--ff-u)",
              fontWeight: 800,
              fontSize: 16,
              color: "var(--t2)",
            }}
          >
            Learn the world. Keep your streak.
          </div>
        </header>

        {/* Topic toggle — World vs US States */}
        <div style={{ marginBottom: 18 }}>
          <Segmented
            options={TOPICS.map((t) => ({
              id: t.id,
              label: t.label,
              sub: t.sub,
            }))}
            value={topic}
            onChange={(id) =>
              setSettings((s) => ({
                ...s,
                topic: id as Topic,
                regionFilter: [],
              }))
            }
          />
        </div>

        {/* Stats chips */}
        {user && globalStats.totalSessions > 0 && (
          <div
            className="home-stats-row"
            style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}
          >
            {[
              { label: "Best", value: globalStats.bestScore.toLocaleString(), bg: "var(--sun)" },
              { label: "Streak", value: `×${globalStats.bestStreak}`, bg: "var(--coral-soft)" },
              { label: "Days", value: String(globalStats.daysPlayed.length), bg: "var(--sky-soft)" },
            ].map((chip) => (
              <span
                key={chip.label}
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 6,
                  background: chip.bg,
                  border: "2px solid var(--ink)",
                  borderRadius: 999,
                  padding: "3px 12px",
                  fontFamily: "var(--ff-u)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--t2)",
                }}
              >
                {chip.label}
                <strong style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
                  {chip.value}
                </strong>
              </span>
            ))}
          </div>
        )}
        {user && personalBest !== null && (
          <div style={{ marginBottom: 16 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--ink)",
                background: "var(--green-soft)",
                border: "2px solid var(--ink)",
                borderRadius: 999,
                padding: "3px 12px",
              }}
            >
              Best in this mode: <strong>{personalBest.toLocaleString()}</strong>
            </span>
          </div>
        )}

        {/* ── Quick Quiz — pick what you're tested on ── */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Quick quiz</SectionLabel>
          <Segmented
            big
            options={QUIZ_IDS.map((id) => ({
              id,
              label: getModeMeta(modeById(id), topic).label,
            }))}
            value={QUIZ_IDS.includes(settings.mode) ? settings.mode : null}
            onChange={(id) =>
              setSettings((s) => ({ ...s, mode: id as GameMode }))
            }
          />
        </div>

        {/* ── Study — the structured modes ── */}
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Study</SectionLabel>
          <div className="home-mode-grid">
            {STUDY_IDS.map((id, i) => {
              const m = modeById(id);
              const locked = m.requiresLogin && !user;
              const selected = settings.mode === id;
              const meta = getModeMeta(m, topic);
              const accent = STUDY_ACCENT[id];
              return (
                <button
                  key={id}
                  disabled={locked}
                  onClick={() =>
                    !locked && setSettings((s) => ({ ...s, mode: id }))
                  }
                  className="pop-btn menu-card-in"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "11px 13px",
                    minHeight: 92,
                    background: selected ? accent.fill : "var(--bg)",
                    textAlign: "left",
                    opacity: locked ? 0.55 : 1,
                    position: "relative",
                    transform: selected ? "translateY(2px)" : undefined,
                    borderBottomWidth: selected ? 3 : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 11,
                        background: selected ? "var(--bg)" : accent.soft,
                        border: "2px solid var(--ink)",
                        color: "var(--ink)",
                      }}
                    >
                      <ModeIcon type={m.icon} />
                    </div>
                    {locked && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--ink)",
                          border: "2px solid var(--ink)",
                          borderRadius: 999,
                          padding: "1px 8px",
                          background: "var(--bg)",
                        }}
                      >
                        Login
                      </span>
                    )}
                    {id === "review" && !locked && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "var(--ink)",
                          border: "2px solid var(--ink)",
                          background: dueToday > 0 ? "var(--coral)" : "var(--bg)",
                          ...(dueToday > 0 ? { color: "#fff" } : {}),
                          borderRadius: 999,
                          padding: "1px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dueToday > 0 ? `${dueToday} due` : "All done"}
                      </span>
                    )}
                    {selected && !locked && !(id === "review" && dueToday > 0) && (
                      <span style={{ color: "var(--ink)", fontSize: 16, fontWeight: 800, lineHeight: 1 }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <div style={{ width: "100%", minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--ff-d)",
                        fontWeight: 800,
                        fontSize: 17,
                        color: "var(--ink)",
                        lineHeight: 1.15,
                        marginBottom: 2,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {meta.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: selected ? "var(--ink)" : "var(--t2)",
                        fontWeight: 700,
                        lineHeight: 1.3,
                      }}
                    >
                      {meta.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Learn scope: resume where you left off (with a preview of how many
            remain) or start over from scratch. Only shown once some of the
            current filter has been learned. */}
        {showLearnScope && learnCounts && (
          <div style={{ marginBottom: 14 }}>
            <SectionLabel>Session</SectionLabel>
            <Segmented
              options={[
                {
                  id: "resume",
                  label: "Resume",
                  sub:
                    learnCounts.remaining > 0
                      ? `${learnCounts.remaining} ${placeNounFor(learnCounts.remaining)} left`
                      : "all learned · refresher",
                },
                {
                  id: "scratch",
                  label: "From scratch",
                  sub: `all ${learnCounts.total} ${placeNounFor(learnCounts.total)}`,
                },
              ]}
              value={settings.learnScope ?? "resume"}
              onChange={(id) =>
                setSettings({ ...settings, learnScope: id as "resume" | "scratch" })
              }
            />
          </div>
        )}

        {/* Action buttons */}
        <div
          className="home-action-row"
          style={{ gap: 10, marginTop: showSettings ? 0 : 2 }}
        >
          {settings.mode === "versus" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  border: "2px solid var(--ink)",
                  borderRadius: 14,
                  background: "var(--grape-soft)",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "var(--ink)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Your emoji
                </span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    gap: 6,
                  }}
                >
                  {VERSUS_EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onVersusEmojiChange(emoji)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        border: "2px solid var(--ink)",
                        background:
                          versusEmoji === emoji ? "var(--sun)" : "var(--bg)",
                        boxShadow: versusEmoji === emoji ? "2px 2px 0 var(--ink)" : "none",
                        cursor: "pointer",
                        fontSize: 16,
                      }}
                      title={`Choose ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="home-action-row" style={{ gap: 10 }}>
                <button
                  onClick={() => onStart(settings)} // onStart handles hosting
                  className="pop-btn"
                  style={{
                    flex: 1,
                    padding: "13px 20px",
                    background: "var(--coral)",
                    color: "#fff",
                    fontSize: 15,
                  }}
                >
                  Host {versusPromptLabel} match
                </button>
                <button
                  onClick={onVersusMode} // onVersusMode handles joining
                  className="pop-btn"
                  style={{
                    flex: 1,
                    padding: "13px 20px",
                    background: "var(--bg)",
                    fontSize: 15,
                  }}
                >
                  Join match
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onStart(settings)}
              className="pop-btn home-start-btn"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "13px 20px 11px",
                background: "var(--coral)",
                color: "#fff",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--ff-u)",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.9,
                }}
              >
                Start
              </span>
              <span
                style={{
                  fontFamily: "var(--ff-d)",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                }}
              >
                {startLabel}
              </span>
              <span className="home-start-arrow" aria-hidden style={{ display: "inline-flex" }}>
                <svg {...iconProps} width={20} height={20} strokeWidth={2.6}>
                  <line x1="4" y1="12" x2="19" y2="12" />
                  <polyline points="13 6 19 12 13 18" />
                </svg>
              </span>
            </button>
          )}
          <IconSquareButton title="Leaderboard" onClick={onViewLeaderboard}>
            <svg {...iconProps}>
              <path d="M7 4h10l-1 9c0 2.2-1.8 4-4 4s-4-1.8-4-4Z" />
              <path d="M7.2 7c-2.2 0-3.2 1.5-2 3" />
              <path d="M16.8 7c2.2 0 3.2 1.5 2 3" />
              <line x1="12" y1="17" x2="12" y2="20" />
              <line x1="9" y1="20" x2="15" y2="20" />
            </svg>
          </IconSquareButton>
          <IconSquareButton title="Account" onClick={onViewProgress}>
            <svg {...iconProps}>
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
            </svg>
          </IconSquareButton>
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings((s) => !s)}
          style={{
            width: "100%",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 800,
            color: "var(--t2)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "10px 0 8px",
            fontFamily: "var(--ff-u)",
            cursor: "pointer",
            border: "none",
            background: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginTop: 12,
            marginBottom: showSettings ? 10 : 0,
          }}
        >
          <span>{showSettings ? "▲" : "▼"}</span>
          <span>{showSettings ? "Hide" : "Show"} settings</span>
        </button>

        {showSettings && (
          <div
            className="pop-card"
            style={{
              padding: "16px clamp(14px, 3vw, 18px)",
              marginBottom: 16,
            }}
          >
            <SettingsPanel settings={settings} onChange={setSettings} />
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL — globe ── */}
      <div
        className="responsive-globe-panel home-globe-panel"
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "var(--s1)",
        }}
      >
        <PopBackdrop />
        <div style={{ position: "absolute", inset: 0 }}>
          <Suspense fallback={null}>
            {showDecorativeGlobe ? <OrbisGlobe decorative /> : null}
          </Suspense>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink)",
            background: "var(--bg)",
            border: "2px solid var(--ink)",
            borderRadius: 999,
            padding: "5px 16px",
            boxShadow: POP_SHADOW,
            pointerEvents: "none",
            fontFamily: "var(--ff-u)",
            whiteSpace: "nowrap",
          }}
        >
          Drag to explore
        </div>
      </div>
    </div>
  );
}
