import { useEffect, useMemo, useState, useCallback } from 'react';
import { geoEqualEarth, geoPath, geoGraticule10 } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { numericToId } from '../../lib/geoIds';
import type { CountryEntry } from '../../types';
import countriesData from '../../data/countries.json';

const countries = countriesData as CountryEntry[];
const countryMap = new Map(countries.map(c => [c.id, c]));
const GEO_URL = '/countries-50m.json';

// SVG canvas — Equal Earth has a ~2.05:1 aspect ratio
const VB_W = 1000;
const VB_H = 488;

interface RenderedCountry {
  id: string;
  alpha3: string;
  d: string;
}

interface MapData {
  countries: RenderedCountry[];
  borders: string;
  sphere: string;
  graticule: string;
}

interface ProgressMapProps {
  masteryMap: Record<string, number>;
}

interface TooltipState {
  country: CountryEntry;
  mastery: number | null;
  x: number;
  y: number;
}

// Mastery → fill colour. Mirrors the ramp used across the dashboard.
function masteryFill(m: number | undefined): string {
  if (m === undefined) return '#d4c9a8';        // not studied
  if (m >= 0.85) return '#4a9a36';
  if (m >= 0.7) return '#6fb55a';
  if (m >= 0.55) return '#a7c34a';
  if (m >= 0.4) return '#fbbf24';
  if (m >= 0.2) return '#fb923c';
  return '#f87171';
}

export function ProgressMap({ masteryMap }: ProgressMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);

  // Load TopoJSON once, project to SVG paths with d3-geo.
  useEffect(() => {
    let cancelled = false;
    fetch(GEO_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        if (cancelled) return;
        const fc = feature(
          topo,
          topo.objects.countries as GeometryCollection,
        ) as unknown as GeoJSON.FeatureCollection;

        const projection = geoEqualEarth().fitExtent(
          [[8, 8], [VB_W - 8, VB_H - 8]],
          { type: 'Sphere' },
        );
        const path = geoPath(projection);

        const rendered: RenderedCountry[] = [];
        for (const f of fc.features) {
          const numericId = (f as { id?: string | number }).id;
          const alpha3 = numericToId(String(numericId ?? '')) ?? '';
          const d = path(f);
          if (!d) continue;
          rendered.push({ id: String(numericId ?? alpha3), alpha3, d });
        }

        setMapData({
          countries: rendered,
          borders: path(mesh(topo, topo.objects.countries as GeometryCollection, (a, b) => a !== b)) ?? '',
          sphere: path({ type: 'Sphere' }) ?? '',
          graticule: path(geoGraticule10()) ?? '',
        });
      });
    return () => { cancelled = true; };
  }, []);

  const handleEnter = useCallback((alpha3: string, e: React.MouseEvent) => {
    const country = alpha3 ? countryMap.get(alpha3) : undefined;
    if (!country) {
      setTooltip(null);
      return;
    }
    const raw = masteryMap[alpha3];
    const mastery = typeof raw === 'number' && raw >= 0 ? raw : null;
    setTooltip({ country, mastery, x: e.clientX, y: e.clientY });
  }, [masteryMap]);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setTooltip(prev => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
  }, []);

  const handleLeave = useCallback(() => setTooltip(null), []);

  const paths = useMemo(() => {
    if (!mapData) return null;
    return mapData.countries.map(c => (
      <path
        key={c.id}
        d={c.d}
        fill={masteryFill(c.alpha3 ? masteryMap[c.alpha3] : undefined)}
        fillOpacity={c.alpha3 && masteryMap[c.alpha3] !== undefined ? 0.92 : 0.7}
        stroke="none"
        style={{ cursor: countryMap.has(c.alpha3) ? 'pointer' : 'default', transition: 'fill 0.4s ease' }}
        onMouseEnter={(e) => handleEnter(c.alpha3, e)}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      />
    ));
  }, [mapData, masteryMap, handleEnter, handleMove, handleLeave]);

  return (
    <div className="w-full h-full relative" style={{ background: '#c8dff0' }}>
      {mapData ? (
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* Ocean sphere */}
          <path d={mapData.sphere} fill="#c8dff0" stroke="#a9c6dd" strokeWidth={0.8} />
          {/* Graticule */}
          <path d={mapData.graticule} fill="none" stroke="#b3cde0" strokeWidth={0.4} opacity={0.7} />
          {/* Country fills */}
          {paths}
          {/* Crisp internal borders, drawn once on top */}
          <path d={mapData.borders} fill="none" stroke="#8a7c5c" strokeWidth={0.5} strokeOpacity={0.7} pointerEvents="none" />
        </svg>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13 }}>
          Loading map…
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 bg-white/95 border border-bark-200 shadow-lg rounded-xl p-3 text-sm"
          style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}
        >
          <div className="font-dm font-bold text-bark-800">{tooltip.country.name}</div>
          <div className="text-xs text-bark-500 mb-2">
            {tooltip.country.capital} · {tooltip.country.region}
          </div>
          {tooltip.mastery !== null ? (
            <div className="flex items-center gap-2">
              <div className="text-xs font-dm font-medium text-bark-700">Mastery:</div>
              <div className="w-24 bg-bark-100 rounded-full h-2 overflow-hidden flex-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(tooltip.mastery * 100)}%`,
                    backgroundColor: masteryFill(tooltip.mastery),
                  }}
                />
              </div>
              <div className="text-xs text-bark-600 font-medium">
                {Math.round(tooltip.mastery * 100)}%
              </div>
            </div>
          ) : (
            <div className="text-xs text-bark-400 italic">Not studied yet</div>
          )}
        </div>
      )}
    </div>
  );
}
