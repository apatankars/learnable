// Facts mode keeps its own lightweight, per-device progress (it works signed
// out, and fact questions don't fit the country/capital SRS schema).
const KEY = 'learnable_facts_progress';

export interface FactProgress {
  attempts: number;
  correct: number;
  lastSeen: number; // epoch ms
}

export function loadFactsProgress(): Record<string, FactProgress> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordFactAttempt(countryId: string, correct: boolean): void {
  const all = loadFactsProgress();
  const p = all[countryId] ?? { attempts: 0, correct: 0, lastSeen: 0 };
  all[countryId] = { attempts: p.attempts + 1, correct: p.correct + (correct ? 1 : 0), lastSeen: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full / blocked — progress is a convenience, not critical
  }
}

// A country counts as known once it has a solid record on its fact questions.
export function isFactKnown(p: FactProgress | undefined): boolean {
  return !!p && p.attempts >= 3 && p.correct / p.attempts >= 0.8;
}

// Lower = study sooner: unseen first, then weakest, then least recently seen.
export function factPriority(p: FactProgress | undefined): number {
  if (!p) return 0;
  const acc = p.correct / Math.max(p.attempts, 1);
  const daysAgo = (Date.now() - p.lastSeen) / 86_400_000;
  return 1 + acc * 2 - Math.min(daysAgo, 30) / 30;
}
