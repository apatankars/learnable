interface ScoreBoardProps {
  score: number;
  streak: number;
  answered: number;
  total: number;
  personalBest?: number | null;
}

export function ScoreBoard({ score, streak, answered, total, personalBest }: ScoreBoardProps) {
  const streakIcon = streak >= 15 ? '🔥🔥🔥' : streak >= 10 ? '🔥🔥' : streak >= 5 ? '🔥' : '✦';
  const streakClass = streak >= 5 ? 'text-amber-500 animate-bounce-subtle' : 'text-bark-400';
  const isAheadOfPB = personalBest !== null && personalBest !== undefined && score > personalBest;

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-end">
        <span className="text-xs text-bark-400 font-dm uppercase tracking-wider">Score</span>
        <span className={`font-playfair font-bold text-2xl tabular-nums leading-tight ${isAheadOfPB ? 'text-leaf-600' : 'text-bark-800'}`}>
          {score.toLocaleString()}
        </span>
        {personalBest != null && (
          <span className="text-xs font-dm text-bark-400 leading-none">
            {isAheadOfPB
              ? <span className="text-leaf-500">↑ PB!</span>
              : <span>PB {personalBest.toLocaleString()}</span>
            }
          </span>
        )}
      </div>

      <div className="w-px h-8 bg-bark-200" />

      <div className={`flex items-center gap-1 ${streakClass}`}>
        <span className="text-lg">{streakIcon}</span>
        <span className="font-bold text-lg tabular-nums">{streak > 0 ? `×${streak}` : ''}</span>
      </div>

      <div className="w-px h-8 bg-bark-200" />

      <div className="flex flex-col items-start">
        <span className="text-xs text-bark-400 font-dm uppercase tracking-wider">Progress</span>
        <div className="flex items-baseline gap-1">
          <span className="font-playfair font-bold text-xl text-leaf-600 tabular-nums">{answered}</span>
          <span className="text-bark-400 text-sm">/</span>
          <span className="text-bark-500 text-sm tabular-nums">{total}</span>
        </div>
      </div>
    </div>
  );
}
