import { useMemo, type CSSProperties } from 'react';

const STAR_LAYOUT = [
  { left: '8%', top: '12%', size: 2, delay: '0s', duration: '3.6s', opacity: 0.56 },
  { left: '14%', top: '28%', size: 1.5, delay: '0.8s', duration: '4.4s', opacity: 0.42 },
  { left: '18%', top: '62%', size: 2.2, delay: '1.4s', duration: '4.9s', opacity: 0.5 },
  { left: '24%', top: '18%', size: 1.6, delay: '2.3s', duration: '4.1s', opacity: 0.48 },
  { left: '28%', top: '42%', size: 1.8, delay: '0.6s', duration: '5s', opacity: 0.4 },
  { left: '32%', top: '74%', size: 1.4, delay: '1.9s', duration: '4.7s', opacity: 0.38 },
  { left: '38%', top: '22%', size: 2.4, delay: '0.2s', duration: '3.9s', opacity: 0.6 },
  { left: '42%', top: '56%', size: 1.5, delay: '1.2s', duration: '4.6s', opacity: 0.46 },
  { left: '48%', top: '10%', size: 1.8, delay: '2.8s', duration: '5.2s', opacity: 0.42 },
  { left: '52%', top: '34%', size: 1.3, delay: '0.5s', duration: '4.3s', opacity: 0.34 },
  { left: '58%', top: '70%', size: 2.1, delay: '1.6s', duration: '4.8s', opacity: 0.44 },
  { left: '64%', top: '16%', size: 1.7, delay: '2.2s', duration: '4s', opacity: 0.58 },
  { left: '68%', top: '48%', size: 2.2, delay: '0.3s', duration: '5.1s', opacity: 0.52 },
  { left: '72%', top: '80%', size: 1.4, delay: '1.1s', duration: '4.2s', opacity: 0.34 },
  { left: '78%', top: '26%', size: 1.9, delay: '2.6s', duration: '4.9s', opacity: 0.48 },
  { left: '84%', top: '58%', size: 1.6, delay: '0.9s', duration: '4.5s', opacity: 0.42 },
  { left: '88%', top: '14%', size: 2.4, delay: '1.7s', duration: '3.8s', opacity: 0.62 },
  { left: '91%', top: '38%', size: 1.5, delay: '2.1s', duration: '4.7s', opacity: 0.36 },
  { left: '10%', top: '84%', size: 1.8, delay: '1.3s', duration: '5.3s', opacity: 0.32 },
  { left: '56%', top: '88%', size: 1.6, delay: '0.7s', duration: '4.9s', opacity: 0.28 },
];

interface CometLayout {
  angle: number;
  delay: string;
  duration: string;
  endX: string;
  endY: string;
  opacity: number;
  startX: string;
  startY: string;
  width: number;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createCometLayout(): CometLayout {
  const startsLeft = Math.random() >= 0.5;
  const startX = startsLeft ? randomRange(-10, 12) : randomRange(88, 110);
  const endX = startsLeft ? randomRange(88, 108) : randomRange(-8, 12);
  const startY = randomRange(6, 72);
  const endY = Math.min(92, Math.max(4, startY + randomRange(-22, 22)));
  const deltaX = endX - startX;
  const deltaY = endY - startY;

  return {
    angle: Math.atan2(deltaY, deltaX) * (180 / Math.PI),
    delay: `${randomRange(0.5, 10).toFixed(2)}s`,
    duration: `${randomRange(11, 18).toFixed(2)}s`,
    endX: `${endX.toFixed(2)}%`,
    endY: `${endY.toFixed(2)}%`,
    opacity: Number(randomRange(0.36, 0.62).toFixed(2)),
    startX: `${startX.toFixed(2)}%`,
    startY: `${startY.toFixed(2)}%`,
    width: Math.round(randomRange(86, 132)),
  };
}

export function SpaceBackdrop() {
  const cometLayout = useMemo(
    () => Array.from({ length: 2 }, () => createCometLayout()),
    [],
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div className="space-backdrop-base" />
      <div className="space-backdrop-haze" />

      {STAR_LAYOUT.map((star, index) => (
        <span
          key={`star-${index}`}
          className="space-star"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}

      {cometLayout.map((comet, index) => {
        const cometPathStyle: CSSProperties = {
          animationDelay: comet.delay,
          animationDuration: comet.duration,
          '--comet-start-x': comet.startX,
          '--comet-start-y': comet.startY,
          '--comet-end-x': comet.endX,
          '--comet-end-y': comet.endY,
        } as CSSProperties;

        return (
          <span
            key={`comet-path-${index}`}
            className="space-comet-path"
            style={cometPathStyle}
          >
            <span
              className="space-comet"
              style={{
                width: comet.width,
                opacity: comet.opacity,
                transform: `rotate(${comet.angle}deg)`,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
