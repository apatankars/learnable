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
  alpha3: string;
  points: Array<{ lat: number; lng: number }>;
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
    altitude: 0.07,
    cap: 'rgba(255, 206, 64, 1)',
    point: 'rgba(255, 243, 174, 0.98)',
    ring: 'rgba(255, 213, 74, 0.92)',
    side: 'rgba(196, 145, 38, 0.62)',
    stroke: 'rgba(255, 248, 214, 0.98)',
    border: '#3c2a06',
    borderWidth: 0.2,
  },
  correct: {
    altitude: 0.03,
    cap: 'rgba(86, 204, 116, 0.95)',
    point: 'rgba(192, 248, 202, 0.9)',
    ring: 'rgba(102, 210, 130, 0.7)',
    side: 'rgba(46, 120, 64, 0.42)',
    stroke: 'rgba(224, 255, 230, 0.82)',
    border: '#143d20',
    borderWidth: 0.15,
  },
  skipped: {
    altitude: 0.024,
    cap: 'rgba(224, 168, 70, 0.92)',
    point: 'rgba(248, 224, 181, 0.88)',
    ring: 'rgba(228, 174, 78, 0.66)',
    side: 'rgba(150, 106, 39, 0.4)',
    stroke: 'rgba(252, 232, 196, 0.78)',
    border: '#5c3d12',
    borderWidth: 0.14,
  },
  wrong: {
    altitude: 0.03,
    cap: 'rgba(226, 84, 84, 0.95)',
    point: 'rgba(255, 218, 218, 0.94)',
    ring: 'rgba(232, 96, 96, 0.74)',
    side: 'rgba(132, 44, 44, 0.46)',
    stroke: 'rgba(255, 226, 226, 0.84)',
    border: '#4d1717',
    borderWidth: 0.15,
  },
  teaching: {
    altitude: 0.058,
    cap: 'rgba(78, 178, 252, 0.94)',
    point: 'rgba(217, 238, 255, 0.96)',
    ring: 'rgba(92, 190, 255, 0.78)',
    side: 'rgba(40, 104, 168, 0.46)',
    stroke: 'rgba(224, 244, 255, 0.9)',
    border: '#0f3658',
    borderWidth: 0.16,
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


interface SharpenableTexture {
  anisotropy?: number;
  generateMipmaps?: boolean;
  needsUpdate?: boolean;
}

interface SharpenableMaterial {
  map?: SharpenableTexture | null;
  bumpMap?: SharpenableTexture | null;
  emissiveMap?: SharpenableTexture | null;
  emissive?: { setHex: (hex: number) => void };
  emissiveIntensity?: number;
  needsUpdate?: boolean;
}

// Apply render-quality settings to the live globe. In high-quality mode we crank
// texture anisotropy (keeps the existing earth texture sharp at grazing angles,
// where countries otherwise go blurry) and use the device pixel ratio (clamped
// at 2). Performance mode drops both — anisotropy to 1 and pixel ratio to 1 —
// which is the real FPS lever. No extra assets are loaded either way.
// Returns true once the globe texture exists (so callers can stop polling).
function applyGlobeQuality(globe: GlobeMethods, highQuality: boolean): boolean {
  const renderer = globe.renderer?.();
  // globeMaterial() exists at runtime but isn't in react-globe.gl's typings.
  const material = (globe as unknown as { globeMaterial?: () => SharpenableMaterial })
    .globeMaterial?.();
  if (!renderer || !material) {
    return false;
  }

  const maxAnisotropy = renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
  const targetAnisotropy = highQuality ? maxAnisotropy : 1;
  const targetPixelRatio = highQuality ? Math.min(2, window.devicePixelRatio || 1) : 1;

  if (renderer.getPixelRatio?.() !== targetPixelRatio) {
    renderer.setPixelRatio(targetPixelRatio);

    // react-globe.gl renders through an EffectComposer, which holds its own
    // render targets — its pixel ratio/size must be updated too or the change
    // is invisible.
    const composer = globe.postProcessingComposer?.() as
      | { setPixelRatio?: (ratio: number) => void; setSize?: (w: number, h: number) => void }
      | undefined;
    composer?.setPixelRatio?.(targetPixelRatio);

    const el = renderer.domElement;
    if (el) {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      composer?.setSize?.(el.clientWidth, el.clientHeight);
    }
  }

  let textureReady = false;
  for (const texture of [material.map, material.bumpMap]) {
    if (texture) {
      textureReady = true;
      if (texture.anisotropy !== targetAnisotropy) {
        texture.anisotropy = targetAnisotropy;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
      }
    }
  }

  // Lift overall brightness so the oceans and shaded hemisphere don't read as
  // dark/muddy. Re-using the base color texture as an emissive map makes the
  // globe partly self-lit, which guarantees a brightness floor everywhere —
  // even the night side shows its imagery, so small island nations stay
  // visible no matter how the globe is rotated. Idempotent — only set once.
  if (material.map && material.emissiveMap !== material.map) {
    material.emissiveMap = material.map;
    material.emissive?.setHex(0xffffff);
    material.emissiveIntensity = 0.62;
    material.needsUpdate = true;
  }

  return textureReady;
}

interface TunableLight {
  intensity?: number;
  isAmbientLight?: boolean;
  isDirectionalLight?: boolean;
}

// Flatten the globe's lighting so there is no dark "night" hemisphere. By
// default react-globe.gl uses a dim ambient plus a strong directional light,
// which leaves half the globe in shadow — exactly where small island nations
// disappear. We boost the ambient (uniform, all-sides) light and soften the
// directional one to a gentle highlight, so the whole sphere reads evenly while
// keeping a little dimensionality. Combined with the emissive floor above, the
// imagery stays legible at every rotation. We scale the existing intensities
// rather than set absolute values, so this stays correct regardless of the
// three.js light-unit convention react-globe.gl ships with.
function tuneGlobeLighting(globe: GlobeMethods): void {
  const lights = (globe as unknown as { lights?: () => TunableLight[] }).lights?.();
  if (!lights) {
    return;
  }

  for (const light of lights) {
    if (typeof light.intensity !== 'number') {
      continue;
    }
    if (light.isAmbientLight) {
      light.intensity *= 2.6;
    } else if (light.isDirectionalLight) {
      light.intensity *= 0.35;
    }
  }
}

function getFeatureBoundaryPaths(
  feature: GlobeGeometryData['features'][number],
): PathDatum['points'][] {
  if (feature.geometry.type === 'Polygon') {
    return feature.geometry.coordinates.map((ring) => (
      ring.map(([lng, lat]) => ({ lat, lng }))
    ));
  }

  return feature.geometry.coordinates.flatMap((polygon) => (
    polygon.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })))
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
  const sharpenTimerRef = useRef<number | null>(null);
  const latestFocusTokenRef = useRef(focusToken);
  const onReadyRef = useRef(onReady);
  const onTargetReadyRef = useRef(onTargetReady);
  const [globeModule, setGlobeModule] = useState<GlobeModule | null>(null);
  const [globeGeometry, setGlobeGeometry] = useState<GlobeGeometryData | null>(null);
  const highQualityRef = useRef(true);
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
  }, [decorative]);

  useEffect(() => () => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
    }
    if (sharpenTimerRef.current != null) {
      window.clearInterval(sharpenTimerRef.current);
    }
  }, []);

  const scheduleSharpen = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) {
      return;
    }

    if (applyGlobeQuality(globe, highQualityRef.current)) {
      return;
    }

    // Texture may still be loading — poll briefly until it lands, then stop.
    let attempts = 0;
    if (sharpenTimerRef.current != null) {
      window.clearInterval(sharpenTimerRef.current);
    }
    sharpenTimerRef.current = window.setInterval(() => {
      attempts += 1;
      const current = globeRef.current;
      if ((current && applyGlobeQuality(current, highQualityRef.current)) || attempts > 40) {
        if (sharpenTimerRef.current != null) {
          window.clearInterval(sharpenTimerRef.current);
          sharpenTimerRef.current = null;
        }
      }
    }, 50);
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

  // Only render the highlighted countries as extruded polygons. Drawing all
  // ~195 default polygons (caps + side walls) every frame was the main FPS
  // sink, and their fill is nearly invisible anyway — political definition now
  // comes from the dedicated border-line layer instead.
  const polygonsData = useMemo(() => {
    if (!globeGeometry || decorative) {
      return [];
    }

    return globeGeometry.features.filter((feature) => {
      const alpha3 = feature.properties.alpha3;
      return alpha3 === currentId || (colorMap[alpha3] ?? 'default') !== 'default';
    });
  }, [colorMap, currentId, decorative, globeGeometry]);

  const boundaryPathsData = useMemo<PathDatum[]>(() => {
    if (!globeGeometry || decorative) {
      return [];
    }

    return globeGeometry.features.flatMap((feature) => {
      const alpha3 = feature.properties.alpha3;
      return getFeatureBoundaryPaths(feature).map((points, index) => ({
        id: `${alpha3}:${index}`,
        alpha3,
        points,
      }));
    });
  }, [decorative, globeGeometry]);

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

    scheduleSharpen();
    tuneGlobeLighting(globe);

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
          pathPointAlt={(path: object) => {
            const alpha3 = (path as PathDatum).alpha3;
            const state = colorMap[alpha3] ?? 'default';
            return state === 'default' ? 0.001 : COLOR_STYLES[state].altitude + 0.0015;
          }}
          pathColor={(path: object) => {
            const alpha3 = (path as PathDatum).alpha3;
            const state = colorMap[alpha3] ?? 'default';
            return state === 'default' ? 'rgba(255, 255, 255, 0.55)' : COLOR_STYLES[state].border;
          }}
          pathStroke={(path: object) => {
            const alpha3 = (path as PathDatum).alpha3;
            const state = colorMap[alpha3] ?? 'default';
            return state === 'default' ? 0.35 : COLOR_STYLES[state].borderWidth;
          }}
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
