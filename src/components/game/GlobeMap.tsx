import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import type { CountryColorState } from '../../types';
import { loadGlobeGeometry } from '../../lib/globeGeometry';
import type { GlobeGeometryData } from '../../lib/globeGeometry';

type GlobeModule = typeof import('react-globe.gl');

interface GlobeMapProps {
  colorMap?: Record<string, CountryColorState>;
  currentId?: string | null;
  decorative?: boolean;
  focusToken?: number;
  recenterToken?: number;
  onReady?: () => void;
  onTargetReady?: (token: number) => void;
  promptIndex?: number;
  size?: number;
}

interface RingDatum {
  id: string;
  lat: number;
  lng: number;
  state: CountryColorState;
  overlayScale: number;
}

interface PathDatum {
  id: string;
  points: Array<{ lat: number; lng: number; alt: number }>;
  state: CountryColorState;
}

const VIEWPOINTS = {
  decorative: { altitude: 2.2, lat: 18, lng: -24 },
  focus: { altitude: 1.45 },
  overview: { altitude: 2.05, lat: 14, lng: -18 },
};

const FOCUS_TRANSITION_MS = 120;
const OVERVIEW_TRANSITION_MS = 90;
const DECORATIVE_TRANSITION_MS = 1400;
const SETTLE_PADDING_MS = 0;

const COLOR_STYLES: Record<CountryColorState, {
  altitude: number;
  cap: string;
  point: string;
  ring: string;
  side: string;
  stroke: string;
  border: string;
  borderWidth: number;
}> = {
  default: {
    altitude: 0.002,
    cap: 'rgba(132, 161, 118, 0.14)',
    point: 'rgba(0,0,0,0)',
    ring: 'rgba(0,0,0,0)',
    side: 'rgba(82, 101, 72, 0.05)',
    stroke: 'rgba(244, 231, 205, 0.12)',
    border: '#59684f',
    borderWidth: 0.075,
  },
  current: {
    altitude: 0.055,
    cap: 'rgba(247, 210, 92, 0.96)',
    point: 'rgba(255, 243, 174, 0.98)',
    ring: 'rgba(247, 210, 92, 0.82)',
    side: 'rgba(196, 145, 38, 0.48)',
    stroke: 'rgba(255, 245, 199, 0.92)',
    border: '#6f4f12',
    borderWidth: 0.12,
  },
  correct: {
    altitude: 0.024,
    cap: 'rgba(102, 196, 124, 0.84)',
    point: 'rgba(192, 248, 202, 0.9)',
    ring: 'rgba(102, 196, 124, 0.54)',
    side: 'rgba(58, 118, 69, 0.28)',
    stroke: 'rgba(210, 255, 222, 0.66)',
    border: '#2c6a3c',
    borderWidth: 0.1,
  },
  skipped: {
    altitude: 0.018,
    cap: 'rgba(214, 162, 74, 0.74)',
    point: 'rgba(248, 224, 181, 0.88)',
    ring: 'rgba(214, 162, 74, 0.44)',
    side: 'rgba(150, 106, 39, 0.22)',
    stroke: 'rgba(248, 224, 181, 0.58)',
    border: '#8e6221',
    borderWidth: 0.095,
  },
  wrong: {
    altitude: 0.024,
    cap: 'rgba(214, 93, 93, 0.84)',
    point: 'rgba(255, 218, 218, 0.94)',
    ring: 'rgba(214, 93, 93, 0.58)',
    side: 'rgba(128, 48, 48, 0.32)',
    stroke: 'rgba(255, 220, 220, 0.68)',
    border: '#7f2f2f',
    borderWidth: 0.1,
  },
  teaching: {
    altitude: 0.048,
    cap: 'rgba(92, 177, 247, 0.88)',
    point: 'rgba(217, 238, 255, 0.96)',
    ring: 'rgba(92, 177, 247, 0.68)',
    side: 'rgba(44, 108, 171, 0.32)',
    stroke: 'rgba(214, 240, 255, 0.8)',
    border: '#235e96',
    borderWidth: 0.11,
  },
};

let globeModulePromise: Promise<GlobeModule> | null = null;

function loadGlobeModule(): Promise<GlobeModule> {
  if (!globeModulePromise) {
    globeModulePromise = import('react-globe.gl');
  }

  return globeModulePromise;
}

function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function GlobeShell({ decorative, size }: { decorative?: boolean; size?: number }) {
  const shellSize = size ?? 420;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: shellSize,
          height: shellSize,
          maxWidth: '82%',
          maxHeight: '82%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 32%, rgba(113,160,203,0.98) 0%, rgba(33,68,112,0.96) 38%, rgba(8,17,31,0.98) 78%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 24px 70px rgba(0,0,0,0.38), inset -34px -44px 90px rgba(0,0,0,0.42)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '8%',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.08)',
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: decorative ? '12%' : '14%',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 34%, rgba(255,255,255,0.22), rgba(255,255,255,0) 52%)',
          }}
        />
      </div>
    </div>
  );
}

function afterPaint(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

function getFeatureBoundaryPaths(
  feature: GlobeGeometryData['features'][number],
  altitude: number,
): PathDatum['points'][] {
  if (feature.geometry.type === 'Polygon') {
    return feature.geometry.coordinates.map((ring) => (
      ring.map(([lng, lat]) => ({ lat, lng, alt: altitude }))
    ));
  }

  return feature.geometry.coordinates.flatMap((polygon) => (
    polygon.map((ring) => ring.map(([lng, lat]) => ({ lat, lng, alt: altitude })))
  ));
}

function getWrappedLngSpan(longitudes: number[]): number {
  if (longitudes.length <= 1) {
    return 0;
  }

  const normalized = longitudes
    .map((lng) => ((lng % 360) + 360) % 360)
    .sort((a, b) => a - b);

  let maxGap = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[(index + 1) % normalized.length] + (index === normalized.length - 1 ? 360 : 0);
    maxGap = Math.max(maxGap, next - current);
  }

  return 360 - maxGap;
}

function getFeatureOverlayScale(
  feature: GlobeGeometryData['features'][number],
): number {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const polygonCount = polygons.length;
  const latitudes: number[] = [];
  const longitudes: number[] = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        latitudes.push(lat);
        longitudes.push(lng);
      }
    }
  }

  if (latitudes.length === 0 || longitudes.length === 0) {
    return 1;
  }

  const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const lngSpan = getWrappedLngSpan(longitudes);
  const maxSpan = Math.max(latSpan, lngSpan);

  if (polygonCount >= 20 && maxSpan <= 12) {
    return 0.22;
  }

  if (polygonCount >= 12 && maxSpan <= 18) {
    return 0.34;
  }

  if (polygonCount >= 8 && maxSpan <= 24) {
    return 0.48;
  }

  if (polygonCount >= 4 && maxSpan <= 12) {
    return 0.62;
  }

  return 1;
}

export const GlobeMap = memo(function GlobeMap({
  colorMap = {},
  currentId = null,
  decorative = false,
  focusToken = 0,
  recenterToken = 0,
  onReady,
  onTargetReady,
  promptIndex = 0,
  size,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const readyRef = useRef(false);
  const readyNotifiedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const latestFocusTokenRef = useRef(focusToken);
  const onReadyRef = useRef(onReady);
  const onTargetReadyRef = useRef(onTargetReady);
  const [globeModule, setGlobeModule] = useState<GlobeModule | null>(null);
  const [globeGeometry, setGlobeGeometry] = useState<GlobeGeometryData | null>(null);
  const [dimensions, setDimensions] = useState(() => ({
    height: size ?? 0,
    width: size ?? 0,
  }));

  useEffect(() => {
    let cancelled = false;

    loadGlobeModule().then((module) => {
      if (!cancelled) {
        setGlobeModule(module);
      }
    }).catch(() => undefined);

    loadGlobeGeometry().then((geometry) => {
      if (!cancelled) {
        setGlobeGeometry(geometry);
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
    }
  }, []);

  useEffect(() => {
    onReadyRef.current = onReady;
    onTargetReadyRef.current = onTargetReady;
  }, [onReady, onTargetReady]);

  useEffect(() => {
    if (size) {
      setDimensions((prev) => (
        prev.width === size && prev.height === size
          ? prev
          : { width: size, height: size }
      ));
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    const updateDimensions = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      setDimensions((prev) => (
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      ));
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(node);

    return () => observer.disconnect();
  }, [size]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) {
      return;
    }

    const controls = globe.controls();
    controls.enableDamping = true;
    controls.dampingFactor = decorative ? 0.06 : 0.08;
    controls.enablePan = false;
    controls.autoRotate = decorative;
    controls.autoRotateSpeed = decorative ? 0.35 : 0;
    controls.minDistance = globe.getGlobeRadius() * 1.1;
    controls.maxDistance = globe.getGlobeRadius() * 3.6;
    controls.zoomSpeed = 0.85;
    controls.rotateSpeed = decorative ? 0.55 : 0.95;
  }, [decorative, globeModule, globeGeometry]);

  const scheduleSettled = useCallback((token: number, duration: number) => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
    }

    latestFocusTokenRef.current = token;
    settleTimerRef.current = window.setTimeout(() => {
      afterPaint(() => {
        if (!readyNotifiedRef.current) {
          readyNotifiedRef.current = true;
          onReadyRef.current?.();
        }

        if (!decorative && latestFocusTokenRef.current === token) {
          onTargetReadyRef.current?.(token);
        }
      });
    }, Math.max(0, duration) + SETTLE_PADDING_MS);
  }, [decorative]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !globeGeometry || !readyRef.current) {
      return;
    }

    const centroid = currentId ? globeGeometry.centroids[currentId] : null;
    const duration = decorative ? DECORATIVE_TRANSITION_MS : FOCUS_TRANSITION_MS;

    if (centroid) {
      globe.pointOfView(
        {
          altitude: VIEWPOINTS.focus.altitude,
          lat: Math.max(-85, Math.min(85, centroid.lat)),
          lng: normalizeLng(centroid.lng),
        },
        duration,
      );
      scheduleSettled(focusToken, duration);
      return;
    }

    const overviewDuration = readyNotifiedRef.current
      ? (decorative ? DECORATIVE_TRANSITION_MS : OVERVIEW_TRANSITION_MS)
      : 0;
    globe.pointOfView(decorative ? VIEWPOINTS.decorative : VIEWPOINTS.overview, overviewDuration);
    scheduleSettled(focusToken, overviewDuration);
  }, [currentId, decorative, focusToken, globeGeometry, scheduleSettled]);

  useEffect(() => {
    if (!recenterToken) {
      return;
    }

    const globe = globeRef.current;
    if (!globe || !globeGeometry || !readyRef.current) {
      return;
    }

    const centroid = currentId ? globeGeometry.centroids[currentId] : null;
    const duration = decorative ? DECORATIVE_TRANSITION_MS : OVERVIEW_TRANSITION_MS;

    if (centroid) {
      globe.pointOfView(
        {
          altitude: VIEWPOINTS.focus.altitude,
          lat: Math.max(-85, Math.min(85, centroid.lat)),
          lng: normalizeLng(centroid.lng),
        },
        duration,
      );
      return;
    }

    globe.pointOfView(decorative ? VIEWPOINTS.decorative : VIEWPOINTS.overview, duration);
  }, [currentId, decorative, globeGeometry, recenterToken]);

  const polygonsData = globeGeometry?.features ?? [];

  const boundaryPathsData = useMemo<PathDatum[]>(() => {
    if (!globeGeometry || decorative) {
      return [];
    }

    return globeGeometry.features.flatMap((feature) => {
      const alpha3 = feature.properties.alpha3;
      const state = colorMap[alpha3] ?? 'default';
      if (state === 'default') {
        return [];
      }

      const altitude = COLOR_STYLES[state].altitude + 0.0015;

      return getFeatureBoundaryPaths(feature, altitude).map((points, index) => ({
        id: `${alpha3}:${index}`,
        points,
        state,
      }));
    });
  }, [colorMap, decorative, globeGeometry]);

  const featureById = useMemo(() => {
    if (!globeGeometry) {
      return new Map<string, GlobeGeometryData['features'][number]>();
    }

    return new Map(globeGeometry.features.map((feature) => [feature.properties.alpha3, feature]));
  }, [globeGeometry]);

  const ringsData = useMemo<RingDatum[]>(() => {
    if (!currentId || !globeGeometry) {
      return [];
    }

    const centroid = globeGeometry.centroids[currentId];
    const feature = featureById.get(currentId);
    if (!centroid || !feature) {
      return [];
    }

    return [{
      id: `${currentId}:${promptIndex}:${focusToken}`,
      lat: centroid.lat,
      lng: centroid.lng,
      state: colorMap[currentId] ?? 'current',
      overlayScale: getFeatureOverlayScale(feature),
    }];
  }, [colorMap, currentId, featureById, focusToken, globeGeometry, promptIndex]);

  const GlobeRenderer = globeModule?.default;
  const isRenderable = Boolean(GlobeRenderer && globeGeometry && dimensions.width > 0 && dimensions.height > 0);

  const handleGlobeReady = () => {
    readyRef.current = true;

    const globe = globeRef.current;
    if (!globe) {
      return;
    }

    if (currentId && globeGeometry?.centroids[currentId]) {
      const centroid = globeGeometry.centroids[currentId];
      globe.pointOfView({
        altitude: VIEWPOINTS.focus.altitude,
        lat: Math.max(-85, Math.min(85, centroid.lat)),
        lng: normalizeLng(centroid.lng),
      }, 0);
      scheduleSettled(focusToken, 0);
      return;
    }

    globe.pointOfView(decorative ? VIEWPOINTS.decorative : VIEWPOINTS.overview, 0);
    scheduleSettled(focusToken, 0);
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: size ? `${size}px` : '100%',
        height: size ? `${size}px` : '100%',
        position: 'relative',
      }}
    >
      {isRenderable && GlobeRenderer ? (
        <GlobeRenderer
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          rendererConfig={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="/earth-day.jpg"
          bumpImageUrl="/earth-day.jpg"
          showAtmosphere
          atmosphereAltitude={0.16}
          atmosphereColor="#8cbef1"
          enablePointerInteraction={!decorative}
          polygonsData={polygonsData}
          polygonAltitude={(feature) => {
            const alpha3 = (feature as { properties?: { alpha3?: string } }).properties?.alpha3 ?? '';
            const state = colorMap[alpha3] ?? 'default';
            return COLOR_STYLES[state].altitude;
          }}
          polygonCapColor={(feature) => {
            const alpha3 = (feature as { properties?: { alpha3?: string } }).properties?.alpha3 ?? '';
            const state = colorMap[alpha3] ?? 'default';
            return COLOR_STYLES[state].cap;
          }}
          polygonSideColor={(feature) => {
            const alpha3 = (feature as { properties?: { alpha3?: string } }).properties?.alpha3 ?? '';
            const state = colorMap[alpha3] ?? 'default';
            return COLOR_STYLES[state].side;
          }}
          polygonStrokeColor={(feature) => {
            const alpha3 = (feature as { properties?: { alpha3?: string } }).properties?.alpha3 ?? '';
            const state = colorMap[alpha3] ?? 'default';
            return COLOR_STYLES[state].stroke;
          }}
          polygonCapCurvatureResolution={3}
          polygonsTransitionDuration={120}
          pathsData={boundaryPathsData}
          pathPoints="points"
          pathPointLat="lat"
          pathPointLng="lng"
          pathPointAlt="alt"
          pathColor={(path: object) => COLOR_STYLES[(path as PathDatum).state].border}
          pathStroke={(path: object) => COLOR_STYLES[(path as PathDatum).state].borderWidth}
          pathResolution={1}
          pathTransitionDuration={0}
          ringsData={ringsData}
          ringLat="lat"
          ringLng="lng"
          ringColor={(ring: object) => {
            const style = COLOR_STYLES[(ring as RingDatum).state];
            return [style.ring, 'rgba(255,255,255,0.02)'];
          }}
          ringMaxRadius={(ring: object) => decorative ? 10 : 14 * (ring as RingDatum).overlayScale}
          ringPropagationSpeed={() => decorative ? 1.8 : 2.4}
          ringRepeatPeriod={() => decorative ? 1700 : 1300}
          onGlobeReady={handleGlobeReady}
        />
      ) : (
        <GlobeShell decorative={decorative} size={size} />
      )}

      {!decorative && !isRenderable && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.44)',
            fontFamily: 'var(--ff-u)',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          Preparing globe
        </div>
      )}
    </div>
  );
});
