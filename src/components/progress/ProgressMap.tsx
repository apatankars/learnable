import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Map as MapGL, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef, MapMouseEvent } from 'react-map-gl/maplibre';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { numericToId } from '../../lib/geoIds';
import type { CountryEntry } from '../../types';
import countriesData from '../../data/countries.json';
import 'maplibre-gl/dist/maplibre-gl.css';

const countries = countriesData as CountryEntry[];
const countryMap = new Map(countries.map(c => [c.id, c]));
const GEO_URL = '/countries-50m.json';

type CountryFeatureProperties = GeoJSON.GeoJsonProperties & {
  alpha3?: string;
  mastery?: number;
};

type CountryGeoFeature = GeoJSON.Feature<GeoJSON.Geometry, CountryFeatureProperties> & {
  id?: string | number;
};

// Blank MapLibre style — just a background, no tiles needed
const MAP_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background' as const,
      paint: { 'background-color': '#c8dff0' }, // soft ocean blue
    },
  ],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

interface ProgressMapProps {
  masteryMap: Record<string, number>;
}

interface TooltipState {
  country: CountryEntry;
  mastery: number | null;
  x: number;
  y: number;
}

export function ProgressMap({ masteryMap }: ProgressMapProps) {
  const mapRef   = useRef<MapRef>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);

  // Load + annotate TopoJSON → GeoJSON on mount
  useEffect(() => {
    fetch(GEO_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        const geo = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
        // Attach alpha3 to each feature's properties for MapLibre expressions
        const annotated: GeoJSON.FeatureCollection = {
          ...geo,
          features: geo.features.map(f => {
            const geoFeature = f as CountryGeoFeature;
            const alpha3 = numericToId(String(geoFeature.id ?? '')) ?? '';
            return {
              ...f,
              properties: { ...(f.properties ?? {}), alpha3 },
            };
          }),
        };
        setGeojson(annotated);
      });
  }, []);

  // Rebuild GeoJSON features with mastery embedded whenever masteryMap changes
  const annotatedGeojson = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!geojson) return null;
    return {
      ...geojson,
      features: geojson.features.map(f => {
        const alpha3 = (f.properties as CountryFeatureProperties | null)?.alpha3 ?? '';
        const mastery = masteryMap[alpha3] ?? -1;   // -1 = not studied
        return {
          ...f,
          properties: { ...(f.properties ?? {}), alpha3, mastery },
        };
      }),
    };
  }, [geojson, masteryMap]);

  // Hover → tooltip
  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    if (!mapRef.current) return;
    const features = mapRef.current.queryRenderedFeatures(e.point, {
      layers: ['countries-fill'],
    });
    if (!features.length) {
      setTooltip(null);
      return;
    }
    const props = (features[0] as CountryGeoFeature).properties ?? {};
    const alpha3 = typeof props.alpha3 === 'string' ? props.alpha3 : '';
    const country = alpha3 ? countryMap.get(alpha3) : undefined;
    const masteryValue = typeof props.mastery === 'number' ? props.mastery : Number(props.mastery);
    const mastery = Number.isFinite(masteryValue) && masteryValue >= 0 ? masteryValue : null;
    if (country) {
      setTooltip({ country, mastery, x: e.originalEvent.clientX, y: e.originalEvent.clientY });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-bark-200">
      <MapGL
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{ longitude: 10, latitude: 20, zoom: 1.2 }}
        style={{ width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={['countries-fill']}
        // Disable attribution (clean look)
        attributionControl={false}
      >
        {annotatedGeojson && (
          <Source id="countries" type="geojson" data={annotatedGeojson}>
            {/* Filled polygons — mastery colour */}
            <Layer
              id="countries-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'case',
                  ['<', ['get', 'mastery'], 0],
                  '#d4c9a8',                // not studied
                  [
                    'interpolate',
                    ['linear'],
                    ['get', 'mastery'],
                    0,   '#f87171',          // 0% → red
                    0.4, '#fbbf24',          // 40% → amber
                    0.7, '#6fb55a',          // 70% → light green
                    1,   '#4a9a36',          // 100% → green
                  ],
                ],
                'fill-opacity': [
                  'case',
                  ['<', ['get', 'mastery'], 0],
                  0.65,
                  0.82,
                ],
              }}
            />
            {/* Borders */}
            <Layer
              id="countries-stroke"
              type="line"
              paint={{
                'line-color': '#b8a882',
                'line-width': 0.6,
                'line-opacity': 0.7,
              }}
            />
          </Source>
        )}
      </MapGL>

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
                    backgroundColor:
                      tooltip.mastery >= 0.8 ? '#4a9a36'
                      : tooltip.mastery >= 0.6 ? '#6fb55a'
                      : tooltip.mastery >= 0.4 ? '#fbbf24'
                      : tooltip.mastery >= 0.2 ? '#fb923c'
                      : '#f87171',
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
