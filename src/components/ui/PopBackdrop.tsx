const CLOUDS = [
  { top: '9%', scale: 1, duration: 70, delay: -12, opacity: 0.95 },
  { top: '74%', scale: 0.75, duration: 95, delay: -50, opacity: 0.9 },
  { top: '38%', scale: 0.55, duration: 120, delay: -80, opacity: 0.8 },
];

const SPARKLES = [
  { left: '12%', top: '20%', size: 22, color: '#ffffff', delay: '0s' },
  { left: '86%', top: '14%', size: 28, color: '#ff5a5f', delay: '1.2s' },
  { left: '8%', top: '68%', size: 26, color: '#5cc3f5', delay: '0.6s' },
  { left: '90%', top: '70%', size: 20, color: '#ffffff', delay: '2s' },
  { left: '76%', top: '88%', size: 16, color: '#c78bff', delay: '1.6s' },
];

function Cloud({ scale }: { scale: number }) {
  return (
    <svg
      viewBox="0 0 120 60"
      width={120 * scale}
      height={60 * scale}
      style={{ display: 'block' }}
    >
      <path
        d="M24 50 C8 50 4 32 20 28 C20 12 42 8 50 22 C58 6 84 10 86 28 C104 26 112 48 94 50 Z"
        fill="#fff"
        stroke="#1f1a2e"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M12 1 C13 8 16 11 23 12 C16 13 13 16 12 23 C11 16 8 13 1 12 C8 11 11 8 12 1 Z"
        fill={color}
        stroke="#1f1a2e"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Sunny dotted backdrop for the globe stage: drifting clouds and sparkles.
export function PopBackdrop() {
  return (
    <div aria-hidden="true" className="pop-backdrop">
      {CLOUDS.map((c, i) => (
        <div
          key={`cloud-${i}`}
          className="pop-cloud"
          style={{
            top: c.top,
            opacity: c.opacity,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          <Cloud scale={c.scale} />
        </div>
      ))}
      {SPARKLES.map((s, i) => (
        <div
          key={`sparkle-${i}`}
          className="pop-sparkle"
          style={{ left: s.left, top: s.top, animationDelay: s.delay }}
        >
          <Sparkle size={s.size} color={s.color} />
        </div>
      ))}
    </div>
  );
}
