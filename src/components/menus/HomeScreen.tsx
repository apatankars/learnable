import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { SettingsPanel } from "./SettingsPanel";
import { UserMenu } from "../auth/UserMenu";
import { BotanicalCorner } from "../ui/BotanicalCorner";
import { BotanicalDivider } from "../ui/BotanicalDivider";
import { SpaceBackdrop } from "../ui/SpaceBackdrop";
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
    strokeWidth: 1.35,
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
  const [hoveredMode, setHoveredMode] = useState<GameMode | null>(null);
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
    settings.mode !== "practice" && settings.mode !== "learn" && settings.mode !== "review"
      ? (personalBests[modeKey] ?? null)
      : null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowDecorativeGlobe(true);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const vineBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='72' viewBox='0 0 22 72'%3E%3Cpath d='M11,0 C10,18 12,36 11,54 C10,62 11,72 11,72' stroke='rgba(74,110,36,0.32)' stroke-width='0.9' fill='none'/%3E%3Cpath d='M11,18 C8,11 13,4 20,3 C13,7 9,13 11,18Z' fill='rgba(74,110,36,0.22)'/%3E%3Cpath d='M11,49 C14,42 9,35 2,34 C9,37 13,44 11,49Z' fill='rgba(74,110,36,0.20)'/%3E%3Ccircle cx='11' cy='17' r='1.6' fill='rgba(74,110,36,0.26)'/%3E%3Ccircle cx='11' cy='48' r='1.3' fill='rgba(74,110,36,0.20)'/%3E%3C/svg%3E")`;

  return (
    <div className="responsive-split-shell">
      {/* ── LEFT PANEL ── */}
      <div
        className="responsive-side-panel"
        style={{
          flex: "0 0 44%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "52px clamp(20px, 4vw, 56px) 52px clamp(18px, 4vw, 52px)",
          borderRight: "1px solid var(--border)",
          position: "relative",
          overflowX: "hidden",
          overflowY: "auto",
          background: "var(--s1)",
        }}
      >
        {/* Vine border */}
        <div
          style={{
            position: "absolute",
            top: "8%",
            bottom: "8%",
            right: -11,
            width: 22,
            zIndex: 10,
            pointerEvents: "none",
            backgroundRepeat: "repeat-y",
            backgroundPosition: "center top",
            backgroundImage: vineBg,
          }}
        />

        <BotanicalCorner />

        {/* Auth — top right of panel */}
        <div className="home-auth-slot">
          {user ? (
            <UserMenu user={user} onSignOut={onSignOut} />
          ) : (
            <button
              onClick={onSignIn}
              style={{
                fontSize: 12,
                letterSpacing: "0.04em",
                color: "var(--t3)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "5px 12px",
                background: "var(--bg)",
                cursor: "pointer",
                transition: "color 0.14s, border-color 0.14s",
                fontFamily: "var(--ff-u)",
              }}
            >
              Sign in
            </button>
          )}
        </div>

        {/* Header */}
        <header
          style={{
            marginBottom: 40,
            paddingRight: user ? 0 : 96,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--ff-d)",
              fontWeight: 300,
              fontSize: "clamp(3rem, 9vw, 4.75rem)",
              letterSpacing: "0.14em",
              lineHeight: 1,
              color: "var(--t1)",
              marginBottom: 16,
            }}
          >
            ORBIS
          </div>
          <div
            style={{
              marginBottom: 13,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <BotanicalDivider />
          </div>
          {/* <div
            style={{
              fontFamily: "var(--ff-d)",
              fontWeight: 300,
              fontStyle: "italic",
              fontSize: 17,
              color: "var(--t2)",
              letterSpacing: "0.04em",
            }}
          >
            Know the World
          </div> */}
        </header>

        {/* Topic toggle — World vs US States */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {TOPICS.map((t) => {
            const active = topic === t.id;
            return (
              <button
                key={t.id}
                onClick={() =>
                  setSettings((s) => ({ ...s, topic: t.id, regionFilter: [] }))
                }
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 3,
                  border: active
                    ? "1px solid var(--gold)"
                    : "1px solid var(--border)",
                  background: active ? "var(--bg)" : "var(--s1)",
                  color: active ? "var(--gold-hi)" : "var(--t2)",
                  cursor: "pointer",
                  transition: "all 0.14s",
                  fontFamily: "var(--ff-u)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--ff-d)",
                    fontSize: 15,
                    fontWeight: 400,
                    color: active ? "var(--gold-hi)" : "var(--t1)",
                  }}
                >
                  {t.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: active ? "var(--gold)" : "var(--t3)",
                    fontWeight: 300,
                  }}
                >
                  {t.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Stats bar */}
        {user && globalStats.totalSessions > 0 && (
          <div
            className="home-stats-row"
            style={{
              gap: 12,
              marginBottom: 16,
              fontSize: 12,
              color: "var(--t3)",
              fontFamily: "var(--ff-u)",
            }}
          >
            <span>
              Best:{" "}
              <strong style={{ color: "var(--gold-hi)" }}>
                {globalStats.bestScore.toLocaleString()}
              </strong>
            </span>
            <span style={{ color: "var(--border-hi)" }}>·</span>
            <span>
              Streak:{" "}
              <strong style={{ color: "var(--gold)" }}>
                ×{globalStats.bestStreak}
              </strong>
            </span>
            <span style={{ color: "var(--border-hi)" }}>·</span>
            <span>{globalStats.daysPlayed.length} days played</span>
          </div>
        )}
        {user && personalBest !== null && (
          <div style={{ marginBottom: 16 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--olive)",
                letterSpacing: "0.04em",
                background: "rgba(86,116,40,0.08)",
                border: "1px solid rgba(86,116,40,0.22)",
                borderRadius: 3,
                padding: "3px 9px",
              }}
            >
              Best in this mode:{" "}
              <strong>{personalBest.toLocaleString()}</strong>
            </span>
          </div>
        )}

        {/* Mode grid */}
        <div className="home-mode-grid" style={{ marginBottom: 28 }}>
          {MODES.map((m) => {
            const locked = m.requiresLogin && !user;
            const selected = settings.mode === m.id;
            const hovered = hoveredMode === m.id;
            const meta = getModeMeta(m, topic);
            return (
              <button
                key={m.id}
                disabled={locked}
                onMouseEnter={() => !locked && setHoveredMode(m.id)}
                onMouseLeave={() => setHoveredMode(null)}
                onClick={() =>
                  !locked && setSettings((s) => ({ ...s, mode: m.id }))
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "13px 15px",
                  background: selected
                    ? "var(--bg)"
                    : hovered
                      ? "var(--s1)"
                      : "var(--bg)",
                  border: selected
                    ? "1px solid var(--gold)"
                    : hovered
                      ? "1px solid var(--border-hi)"
                      : "1px solid var(--border)",
                  borderRadius: 3,
                  textAlign: "left",
                  color: "var(--t2)",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.45 : 1,
                  transition:
                    "background 0.16s, border-color 0.16s, box-shadow 0.16s, transform 0.16s",
                  transform: hovered && !locked ? "translateY(-1px)" : "none",
                  boxShadow:
                    hovered && !locked ? "0 2px 12px rgba(0,0,0,0.08)" : "none",
                  fontFamily: "var(--ff-u)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: selected
                      ? "var(--gold)"
                      : hovered
                        ? "var(--gold)"
                        : "var(--olive)",
                  }}
                >
                  <ModeIcon type={m.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--ff-d)",
                      fontWeight: 400,
                      fontSize: 15,
                      color: "var(--t1)",
                      lineHeight: 1.2,
                      marginBottom: 2,
                    }}
                  >
                    {meta.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--t3)",
                      fontWeight: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.desc}
                  </div>
                </div>
                {locked && (
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      border: "1px solid var(--border)",
                      borderRadius: 2,
                      padding: "2px 5px",
                      flexShrink: 0,
                    }}
                  >
                    Login
                  </div>
                )}
                {m.id === "review" && !locked && (
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: dueToday > 0 ? "var(--gold)" : "var(--t3)",
                      border: `1px solid ${dueToday > 0 ? "var(--gold)" : "var(--border)"}`,
                      borderRadius: 2,
                      padding: "2px 5px",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dueToday > 0 ? `${dueToday} due` : "All done"}
                  </div>
                )}
                {selected && !locked && (
                  <div
                    style={{
                      color: "var(--gold)",
                      flexShrink: 0,
                      fontSize: 12,
                    }}
                  >
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Learn scope: resume where you left off (with a preview of how many
            remain) or start over from scratch. Only shown once some of the
            current filter has been learned. */}
        {showLearnScope && learnCounts && (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "var(--t3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 6,
                fontFamily: "var(--ff-u)",
              }}
            >
              Session
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(
                [
                  {
                    id: "resume" as const,
                    label: "⟳ Resume",
                    sub: learnCounts.remaining > 0
                      ? `${learnCounts.remaining} ${placeNounFor(learnCounts.remaining)} left`
                      : "all learned · refresher",
                  },
                  {
                    id: "scratch" as const,
                    label: "✦ From scratch",
                    sub: `all ${learnCounts.total} ${placeNounFor(learnCounts.total)}`,
                  },
                ]
              ).map((opt) => {
                const active = (settings.learnScope ?? "resume") === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSettings({ ...settings, learnScope: opt.id })}
                    style={{
                      flex: 1,
                      padding: "9px 8px",
                      borderRadius: 3,
                      border: active ? "1px solid var(--gold)" : "1px solid var(--border)",
                      background: active ? "var(--bg)" : "var(--s1)",
                      color: active ? "var(--gold-hi)" : "var(--t2)",
                      fontSize: 13,
                      fontWeight: 500,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      cursor: "pointer",
                      transition: "all 0.14s",
                      fontFamily: "var(--ff-u)",
                    }}
                  >
                    <span>{opt.label}</span>
                    <span style={{ fontSize: 11, color: active ? "var(--gold)" : "var(--t3)", fontWeight: 400 }}>
                      {opt.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div
          className="home-action-row"
          style={{ gap: 8, marginTop: showSettings ? 0 : 4 }}
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
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  background: "var(--bg)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--t3)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Versus Emoji
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
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        border:
                          versusEmoji === emoji
                            ? "1px solid var(--gold)"
                            : "1px solid var(--border)",
                        background:
                          versusEmoji === emoji
                            ? "rgba(135,100,24,0.08)"
                            : "var(--s1)",
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
              <div className="home-action-row" style={{ gap: 8 }}>
                <button
                  onClick={() => onStart(settings)} // onStart handles hosting
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    borderRadius: 3,
                    background: "rgba(135,100,24,0.12)",
                    border: "1px solid rgba(135,100,24,0.32)",
                    color: "var(--gold-hi)",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    fontFamily: "var(--ff-u)",
                    transition: "background 0.14s, border-color 0.14s",
                  }}
                >
                  Host {versusPromptLabel} Match
                </button>
                <button
                  onClick={onVersusMode} // onVersusMode handles joining
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    borderRadius: 3,
                    background: "var(--s1)",
                    border: "1px solid var(--border)",
                    color: "var(--t2)",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    fontFamily: "var(--ff-u)",
                    transition: "background 0.14s, border-color 0.14s",
                  }}
                >
                  Join Match
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onStart(settings)}
              style={{
                flex: 1,
                padding: "12px 20px",
                borderRadius: 3,
                background: "rgba(135,100,24,0.12)",
                border: "1px solid rgba(135,100,24,0.32)",
                color: "var(--gold-hi)",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.06em",
                cursor: "pointer",
                fontFamily: "var(--ff-u)",
                transition: "background 0.14s, border-color 0.14s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.background =
                  "rgba(135,100,24,0.22)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background =
                  "rgba(135,100,24,0.12)";
              }}
            >
              Start — {(() => {
                const m = MODES.find((mm) => mm.id === settings.mode);
                return m ? getModeMeta(m, topic).label : settings.mode;
              })()}
            </button>
          )}
          <button
            onClick={onViewLeaderboard}
            title="Leaderboard"
            style={{
              padding: "12px 14px",
              borderRadius: 3,
              border: "1px solid var(--border-hi)",
              color: "var(--t2)",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--ff-u)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.14s, color 0.14s",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.35}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 4h10l-1 9c0 2.2-1.8 4-4 4s-4-1.8-4-4Z" />
              <path d="M7.2 7c-2.2 0-3.2 1.5-2 3" />
              <path d="M16.8 7c2.2 0 3.2 1.5 2 3" />
              <line x1="12" y1="17" x2="12" y2="20" />
              <line x1="9" y1="20" x2="15" y2="20" />
            </svg>
          </button>
          <button
            onClick={onViewProgress}
            title="Account"
            style={{
              padding: "12px 14px",
              borderRadius: 3,
              border: "1px solid var(--border-hi)",
              color: "var(--t2)",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--ff-u)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 0.14s, color 0.14s",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.35}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
            </svg>
          </button>
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings((s) => !s)}
          style={{
            width: "100%",
            textAlign: "center",
            fontSize: 11,
            color: "var(--t3)",
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
            transition: "color 0.14s",
            marginTop: 14,
            marginBottom: showSettings ? 10 : 0,
          }}
        >
          <span>{showSettings ? "▲" : "▼"}</span>
          <span>{showSettings ? "Hide" : "Show"} Settings</span>
        </button>

        {showSettings && (
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "16px clamp(14px, 3vw, 18px)",
              marginBottom: 16,
            }}
          >
            <SettingsPanel settings={settings} onChange={setSettings} />
          </div>
        )}

        {/* Footer */}
        {/* <footer className="home-footer-row" style={{
          alignItems: 'center', gap: 10,
          fontSize: 11, color: 'var(--t3)', letterSpacing: '0.05em',
          marginTop: 20, fontFamily: 'var(--ff-u)',
        }}>
          <span>{(countriesData as CountryEntry[]).length}+ countries</span>
          <span style={{ color: 'var(--border-hi)' }}>·</span>
          <span>5 game modes</span>
          <span style={{ color: 'var(--border-hi)' }}>·</span>
          <span>Drag the globe</span>
        </footer> */}
      </div>

      {/* ── RIGHT PANEL — globe ── */}
      <div
        className="responsive-globe-panel"
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "#05080d",
        }}
      >
        <SpaceBackdrop />
        <BotanicalCorner flip />
        <div
          style={{
            position: "absolute",
            inset: 0,
            filter: "drop-shadow(0 10px 64px rgba(0,0,0,0.28))",
          }}
        >
          <Suspense fallback={null}>
            {showDecorativeGlobe ? <OrbisGlobe decorative /> : null}
          </Suspense>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 11,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.30)",
            pointerEvents: "none",
            fontFamily: "var(--ff-u)",
          }}
        >
          drag to explore
        </div>
      </div>
    </div>
  );
}
