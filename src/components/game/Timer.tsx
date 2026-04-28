interface TimerProps {
  timeRemaining: number;
  totalSeconds: number;
  noLimit: boolean;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function Timer({ timeRemaining, totalSeconds, noLimit }: TimerProps) {
  if (noLimit) {
    return (
      <div className="flex items-center gap-1 text-bark-500 font-dm text-sm font-medium">
        <span className="text-lg">∞</span>
        <span>No limit</span>
      </div>
    );
  }

  const pct = totalSeconds > 0 ? timeRemaining / totalSeconds : 0;
  const radius = 20;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  const isLow = timeRemaining <= 30;
  const isCritical = timeRemaining <= 10;

  const color = isCritical ? '#d95f5f' : isLow ? '#e8a020' : '#4a9a36';

  return (
    <div className={`flex items-center gap-2 ${isCritical ? 'animate-pulse' : ''}`}>
      <svg width="52" height="52" className="rotate-[-90deg]">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="#e8e0d0" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}
        />
      </svg>
      <span
        className={`font-playfair font-bold text-xl tabular-nums min-w-[3.5rem] ${
          isCritical ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-bark-700'
        }`}
      >
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
}
