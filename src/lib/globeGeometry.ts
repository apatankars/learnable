import { geoCentroid, geoCircle } from 'd3-geo';
import { feature as topojsonFeature } from 'topojson-client';
import countriesData from '../data/countries.json';
import type { CountryEntry } from '../types';

const countries = countriesData as CountryEntry[];
const countryMap = new Map(countries.map((country) => [country.id, country]));

const ANCHOR_URL = '/capital-anchors.geojson';
const SURFACE_URL = '/country-surfaces.geojson';
const TOPO_FALLBACK_URL = '/countries-10m.json';

const MANUAL_ANCHORS: Record<string, { lat: number; lng: number }> = {
  NRU: { lat: -0.5477, lng: 166.9209 },
};

const TOPO_PREFERRED_IDS = new Set([
  'BHS',
  'FJI',
]);

const TOPO_NAME_ALIASES: Record<string, string[]> = {
  ATG: ['Antigua and Barb.'],
  BIH: ['Bosnia and Herz.'],
  CAF: ['Central African Rep.'],
  COG: ['Congo'],
  COD: ['Dem. Rep. Congo'],
  DOM: ['Dominican Rep.'],
  GNQ: ['Eq. Guinea'],
  KNA: ['St. Kitts and Nevis'],
  MHL: ['Marshall Is.'],
  SLB: ['Solomon Is.'],
  SSD: ['S. Sudan'],
  STP: ['Sao Tome and Principe', 'São Tomé and Principe'],
  VAT: ['Vatican'],
  VCT: ['St. Vin. and Gren.'],
};

export interface GlobeCentroid {
  lat: number;
  lng: number;
}

export interface GlobeFeatureProperties {
  alpha3: string;
  name: string;
  synthetic?: boolean;
}

export type GlobeCountryFeature =
  GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, GlobeFeatureProperties>;

export interface GlobeGeometryData {
  centroids: Record<string, GlobeCentroid>;
  features: GlobeCountryFeature[];
}

interface AnchorProperties {
  adm0_a3?: string;
  featurecla?: string;
  name?: string;
  pop_max?: number;
}

type AnchorFeature = GeoJSON.Feature<GeoJSON.Point, AnchorProperties>;

interface SurfaceProperties {
  ADMIN?: string;
  ISO_A3?: string;
  ADM0_A3?: string;
}

type SurfaceFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, SurfaceProperties>;

interface FallbackTopology {
  type: 'Topology';
  objects: Record<string, unknown>;
}

interface TopologyNameProperties {
  name?: string;
}

type TopologyCountryFeature =
  GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, TopologyNameProperties>;

let globeGeometryPromise: Promise<GlobeGeometryData> | null = null;

function normalizeAlpha3(...values: Array<string | undefined>): string {
  for (const rawValue of values) {
    const value = rawValue?.trim();
    if (!value) {
      continue;
    }

    if (value === 'KOS') {
      return 'XKX';
    }

    if (value !== '-99') {
      return value;
    }
  }

  return '';
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function scoreAnchor(feature: AnchorFeature, country: CountryEntry): number {
  const props = feature.properties ?? {};
  const names = [country.capital, ...country.altCapitals].map(normalizeName);
  const anchorName = normalizeName(props.name ?? '');
  let score = props.featurecla === 'Admin-0 capital' ? 100 : 60;

  if (names.includes(anchorName)) {
    score += 1000;
  }

  return score + Math.min(props.pop_max ?? 0, 20_000_000) / 100_000;
}

function buildAnchorMap(features: AnchorFeature[]): Record<string, GlobeCentroid> {
  const grouped = new Map<string, AnchorFeature[]>();

  for (const feature of features) {
    const [lng, lat] = feature.geometry.coordinates;
    const alpha3 = normalizeAlpha3(feature.properties?.adm0_a3);

    if (!alpha3 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    const existing = grouped.get(alpha3);
    if (existing) {
      existing.push(feature);
    } else {
      grouped.set(alpha3, [feature]);
    }
  }

  const centroids: Record<string, GlobeCentroid> = { ...MANUAL_ANCHORS };

  for (const [alpha3, anchors] of grouped.entries()) {
    const country = countryMap.get(alpha3);
    const selected = country
      ? anchors.reduce((best, current) => (
        scoreAnchor(current, country) > scoreAnchor(best, country) ? current : best
      ))
      : anchors[0];

    const [lng, lat] = selected.geometry.coordinates;
    centroids[alpha3] = { lat, lng };
  }

  return centroids;
}

function createSyntheticFeature(country: CountryEntry, centroid: GlobeCentroid): GlobeCountryFeature {
  const radius = country.id === 'VAT' ? 0.4 : country.id === 'SGP' ? 0.55 : 0.85;
  const geometry = geoCircle().center([centroid.lng, centroid.lat]).radius(radius)() as GeoJSON.Polygon;

  return {
    type: 'Feature',
    properties: {
      alpha3: country.id,
      name: country.name,
      synthetic: true,
    },
    geometry,
  };
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }

  return response.json() as Promise<T>;
}

function buildCountryFeature(
  alpha3: string,
  name: string,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GlobeCountryFeature {
  return {
    type: 'Feature',
    properties: {
      alpha3,
      name,
    },
    geometry,
  };
}

function countGeometryPolygons(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  return geometry.type === 'Polygon' ? 1 : geometry.coordinates.length;
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

function getGeometryMaxSpan(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  const latitudes: number[] = [];
  const longitudes: number[] = [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        latitudes.push(lat);
        longitudes.push(lng);
      }
    }
  }

  if (latitudes.length === 0 || longitudes.length === 0) {
    return 0;
  }

  const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const lngSpan = getWrappedLngSpan(longitudes);

  return Math.max(latSpan, lngSpan);
}

function shouldPreferTopologyGeometry(
  alpha3: string,
  surfaceGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  topologyGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  if (TOPO_PREFERRED_IDS.has(alpha3)) {
    return true;
  }

  const surfacePolygonCount = countGeometryPolygons(surfaceGeometry);
  const topologyPolygonCount = countGeometryPolygons(topologyGeometry);
  const topologySpan = getGeometryMaxSpan(topologyGeometry);

  return (
    topologyPolygonCount >= 20 &&
    surfacePolygonCount <= 4 &&
    topologyPolygonCount >= surfacePolygonCount * 4 &&
    topologySpan <= 18
  );
}

function shouldUseSyntheticFallbackGeometry(
  topologyGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  const polygonCount = countGeometryPolygons(topologyGeometry);
  const maxSpan = getGeometryMaxSpan(topologyGeometry);

  return (
    polygonCount >= 20 ||
    (polygonCount >= 8 && maxSpan <= 12)
  );
}

function buildFallbackFeatureMap(
  rawTopology: FallbackTopology,
): Map<string, GlobeCountryFeature> {
  const topologyObject = rawTopology.objects.countries;

  if (!topologyObject) {
    return new Map();
  }

  const fallbackGeoJson = topojsonFeature(
    rawTopology as never,
    topologyObject as never,
  ) as unknown;

  if (!fallbackGeoJson || typeof fallbackGeoJson !== 'object' || !('features' in fallbackGeoJson)) {
    return new Map();
  }

  const fallbackCollection = fallbackGeoJson as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    TopologyNameProperties
  >;

  const features = fallbackCollection.features as TopologyCountryFeature[];
  const featureByName = new Map<string, TopologyCountryFeature>();

  for (const fallbackFeature of features) {
    const name = fallbackFeature.properties?.name?.trim();

    if (!name) {
      continue;
    }

    featureByName.set(normalizeName(name), fallbackFeature);
  }

  const fallbackFeatureMap = new Map<string, GlobeCountryFeature>();

  for (const country of countries) {
    const candidateNames = [
      country.name,
      ...country.altNames,
      ...(TOPO_NAME_ALIASES[country.id] ?? []),
    ];

    for (const candidateName of candidateNames) {
      const matchedFeature = featureByName.get(normalizeName(candidateName));

      if (!matchedFeature) {
        continue;
      }

      fallbackFeatureMap.set(
        country.id,
        buildCountryFeature(country.id, country.name, matchedFeature.geometry),
      );
      break;
    }
  }

  return fallbackFeatureMap;
}

async function loadGeometry(): Promise<GlobeGeometryData> {
  const [rawSurfaces, rawAnchors, rawTopology] = await Promise.all([
    loadJson<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, SurfaceProperties>>(SURFACE_URL),
    loadJson<GeoJSON.FeatureCollection<GeoJSON.Point, AnchorProperties>>(ANCHOR_URL),
    loadJson<FallbackTopology>(TOPO_FALLBACK_URL),
  ]);

  const anchorMap = buildAnchorMap(rawAnchors.features as AnchorFeature[]);
  const fallbackFeatureMap = buildFallbackFeatureMap(rawTopology);
  const features: GlobeCountryFeature[] = [];
  const seen = new Set<string>();

  for (const surface of rawSurfaces.features as SurfaceFeature[]) {
    const alpha3 = normalizeAlpha3(surface.properties?.ISO_A3, surface.properties?.ADM0_A3);

    if (!alpha3) {
      continue;
    }

    const country = countryMap.get(alpha3);
    const topologyFeature = fallbackFeatureMap.get(alpha3);
    const geometry = topologyFeature && shouldPreferTopologyGeometry(alpha3, surface.geometry, topologyFeature.geometry)
      ? topologyFeature.geometry
      : surface.geometry;
    const feature = buildCountryFeature(
      alpha3,
      country?.name ?? surface.properties?.ADMIN ?? alpha3,
      geometry,
    );

    features.push(feature);
    seen.add(alpha3);

    if (!anchorMap[alpha3]) {
      const [lng, lat] = geoCentroid(feature);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        anchorMap[alpha3] = { lat, lng };
      }
    }
  }

  for (const country of countries) {
    if (seen.has(country.id)) {
      continue;
    }

    const fallbackFeature = fallbackFeatureMap.get(country.id);

    if (fallbackFeature) {
      if (shouldUseSyntheticFallbackGeometry(fallbackFeature.geometry)) {
        const centroid = anchorMap[country.id];

        if (centroid) {
          features.push(createSyntheticFeature(country, centroid));
          seen.add(country.id);
          continue;
        }
      }

      features.push(fallbackFeature);
      seen.add(country.id);

      if (!anchorMap[country.id]) {
        const [lng, lat] = geoCentroid(fallbackFeature);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          anchorMap[country.id] = { lat, lng };
        }
      }

      continue;
    }

    const centroid = anchorMap[country.id];
    if (!centroid) {
      continue;
    }

    features.push(createSyntheticFeature(country, centroid));
  }

  return {
    centroids: anchorMap,
    features,
  };
}

export function loadGlobeGeometry(): Promise<GlobeGeometryData> {
  if (!globeGeometryPromise) {
    globeGeometryPromise = loadGeometry();
  }

  return globeGeometryPromise;
}
