import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { CountryColorState } from '../../types';
import { getDataset } from '../../lib/dataset';

interface UsStatesMapProps {
  colorMap?: Record<string, CountryColorState>;
  currentId?: string | null;
  focusToken?: number;
  // Locate mode: clicks on a state resolve to its id. When set, states get a
  // hover highlight and a pointer cursor.
  onLocateClick?: (id: string) => void;
  recenterToken?: number;
  onReady?: () => void;
  onTargetReady?: (token: number) => void;
  promptIndex?: number;
}

interface StateShape {
  id: string;
  name: string;
  d: string;
  bounds: [[number, number], [number, number]];
}

const VIEW_W = 975;
const VIEW_H = 610;
const FOCUS_MS = 520;

const FILL_STYLES: Record<CountryColorState, { fill: string; stroke: string; strokeWidth: number }> = {
  default:  { fill: 'rgba(132, 161, 118, 0.12)', stroke: 'rgba(244, 231, 205, 0.22)', strokeWidth: 0.5 },
  current:  { fill: 'rgba(255, 206, 64, 0.94)',  stroke: '#3c2a06', strokeWidth: 1.4 },
  correct:  { fill: 'rgba(86, 204, 116, 0.88)',  stroke: '#143d20', strokeWidth: 0.9 },
  skipped:  { fill: 'rgba(224, 168, 70, 0.88)',  stroke: '#5c3d12', strokeWidth: 0.9 },
  wrong:    { fill: 'rgba(226, 84, 84, 0.90)',   stroke: '#4d1717', strokeWidth: 0.9 },
  teaching: { fill: 'rgba(78, 178, 252, 0.90)',  stroke: '#0f3658', strokeWidth: 1.4 },
  // Unused for US states (no border dataset), but required by the color union.
  neighbor: { fill: 'rgba(96, 176, 168, 0.34)',  stroke: '#2f6a63', strokeWidth: 0.7 },
};

let topologyPromise: Promise<StateShape[]> | null = null;

function loadStateShapes(): Promise<StateShape[]> {
  if (!topologyPromise) {
    topologyPromise = fetch('/us-states-10m.json')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res) => res.json() as Promise<any>)
      .then((topo) => {
        const fc = feature(topo, topo.objects.states) as unknown as
          FeatureCollection<Geometry, { name: string }>;

        // Map full state names → our dataset ids (postal codes).
        const nameToId = new Map(
          getDataset('us-states').entries.map((s) => [s.name.toLowerCase(), s.id]),
        );

        const projection = geoAlbersUsa().fitSize([VIEW_W, VIEW_H], fc);
        const path = geoPath(projection);

        const shapes: StateShape[] = [];
        for (const f of fc.features) {
          const id = nameToId.get((f.properties?.name ?? '').toLowerCase());
          if (!id) continue; // skip DC / territories not in our dataset
          const d = path(f);
          const bounds = path.bounds(f);
          if (!d) continue;
          shapes.push({ id, name: f.properties.name, d, bounds });
        }
        return shapes;
      })
      .catch(() => [] as StateShape[]);
  }
  return topologyPromise;
}

export const UsStatesMap = memo(function UsStatesMap({
  colorMap = {},
  currentId = null,
  focusToken = 0,
  onLocateClick,
  recenterToken = 0,
  onReady,
  onTargetReady,
}: UsStatesMapProps) {
  const [shapes, setShapes] = useState<StateShape[] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const onReadyRef = useRef(onReady);
  const onTargetReadyRef = useRef(onTargetReady);
  const readyNotifiedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    onTargetReadyRef.current = onTargetReady;
  }, [onReady, onTargetReady]);

  useEffect(() => {
    let cancelled = false;
    loadStateShapes().then((s) => {
      if (!cancelled) setShapes(s);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const shapeById = useMemo(() => {
    const map = new Map<string, StateShape>();
    for (const s of shapes ?? []) map.set(s.id, s);
    return map;
  }, [shapes]);

  // Compute the SVG group transform that zooms toward the active state.
  const transform = useMemo(() => {
    const current = currentId ? shapeById.get(currentId) : null;
    if (!current) return 'translate(0 0) scale(1)';
    const [[x0, y0], [x1, y1]] = current.bounds;
    const dx = Math.max(x1 - x0, 1);
    const dy = Math.max(y1 - y0, 1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    // Make the focused state fill ~45% of the viewport, clamped so tiny states
    // (RI) don't zoom absurdly and huge ones (AK/TX) still get a slight push-in.
    const scale = Math.max(1, Math.min(7, 0.45 / Math.max(dx / VIEW_W, dy / VIEW_H)));
    const tx = VIEW_W / 2 - scale * cx;
    const ty = VIEW_H / 2 - scale * cy;
    return `translate(${tx} ${ty}) scale(${scale})`;
  }, [currentId, shapeById, recenterToken]);

  // Notify GameView once the focus animation settles (mirrors GlobeMap).
  useEffect(() => {
    if (!shapes) return;
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current);

    const token = focusToken;
    const duration = readyNotifiedRef.current ? FOCUS_MS : 0;
    settleTimerRef.current = window.setTimeout(() => {
      if (!readyNotifiedRef.current) {
        readyNotifiedRef.current = true;
        onReadyRef.current?.();
      }
      onTargetReadyRef.current?.(token);
    }, duration);
  }, [focusToken, shapes, currentId]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {shapes ? (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }}
        >
          <g style={{ transition: 'transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)' }} transform={transform}>
            {shapes.map((s) => {
              const state = colorMap[s.id] ?? 'default';
              const style = FILL_STYLES[state];
              const isActive = state === 'current' || state === 'teaching';
              const isHovered = Boolean(onLocateClick) && hoveredId === s.id && state === 'default';
              return (
                <path
                  key={s.id}
                  d={s.d}
                  fill={isHovered ? 'rgba(255, 226, 130, 0.45)' : style.fill}
                  stroke={isHovered ? 'rgba(255, 240, 200, 0.7)' : style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  onClick={onLocateClick ? () => onLocateClick(s.id) : undefined}
                  onMouseEnter={onLocateClick ? () => setHoveredId(s.id) : undefined}
                  onMouseLeave={onLocateClick ? () => setHoveredId((prev) => (prev === s.id ? null : prev)) : undefined}
                  style={{
                    transition: 'fill 0.2s ease',
                    cursor: onLocateClick ? 'pointer' : undefined,
                    filter: isActive ? 'drop-shadow(0 0 6px rgba(255, 213, 74, 0.55))' : undefined,
                  }}
                />
              );
            })}
          </g>
        </svg>
      ) : (
        <div
          style={{
            color: 'rgba(255,255,255,0.44)',
            fontFamily: 'var(--ff-u)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Preparing map
        </div>
      )}
    </div>
  );
});
