import type { GameMode } from '../../types';

interface ModeCardProps {
  mode: GameMode;
  selected: boolean;
  onClick: () => void;
}

const modeInfo: Record<GameMode, { icon: string; title: string; desc: string; color: string }> = {
  country: {
    icon: '🗺',
    title: 'Countries',
    desc: 'Name the highlighted country on the map',
    color: 'from-leaf-400 to-leaf-600',
  },
  capital: {
    icon: '🏛',
    title: 'Capitals',
    desc: 'Name the capital of each country shown',
    color: 'from-moss-400 to-moss-600',
  },
  both: {
    icon: '🌍',
    title: 'Both',
    desc: 'Mix of countries and capitals — the real challenge',
    color: 'from-bark-400 to-bark-600',
  },
  versus: {
    icon: '⚔️',
    title: 'Versus',
    desc: 'Race another player live on the same question set',
    color: 'from-soil-400 to-bark-600',
  },
  practice: {
    icon: '🌱',
    title: 'Practice',
    desc: 'Focus on your weak spots with smart repetition',
    color: 'from-amber-400 to-amber-600',
  },
  learn: {
    icon: '🎓',
    title: 'Learn',
    desc: 'Learn new countries before you are tested on them',
    color: 'from-blue-400 to-blue-600',
  },
  review: {
    icon: '⏳',
    title: 'Daily Review',
    desc: 'Revisit what you learned, right before you forget it',
    color: 'from-petal-400 to-petal-600',
  },
};

export function ModeCard({ mode, selected, onClick }: ModeCardProps) {
  const info = modeInfo[mode];
  return (
    <button
      onClick={onClick}
      className={`
        relative rounded-2xl p-5 text-left cursor-pointer transition-all duration-200
        border-2 group
        ${selected
          ? `border-transparent bg-gradient-to-br ${info.color} text-white shadow-xl scale-105`
          : 'border-bark-200 bg-white hover:border-leaf-300 hover:shadow-lg hover:-translate-y-1 text-bark-700'}
      `}
    >
      <div className="text-3xl mb-3">{info.icon}</div>
      <div className={`font-playfair font-semibold text-xl mb-1 ${selected ? 'text-white' : 'text-bark-800'}`}>
        {info.title}
      </div>
      <div className={`font-dm text-sm leading-snug ${selected ? 'text-white/80' : 'text-bark-500'}`}>
        {info.desc}
      </div>
      {selected && (
        <div className="absolute top-3 right-3 w-5 h-5 bg-white/30 rounded-full flex items-center justify-center text-xs">✓</div>
      )}
    </button>
  );
}
