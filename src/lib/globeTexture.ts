import { geoEquirectangular, geoPath } from 'd3-geo';
import countriesData from '../data/countries.json';
import type { CountryEntry } from '../types';
import type { GlobeGeometryData } from './globeGeometry';

// Pop Atlas globe skin: instead of a satellite photo, paint the world once into
// a canvas — sky-blue ocean, one candy color per region, thick ink outlines —
// and wrap it around the sphere as an unlit texture.

const WIDTH = 4096;
const HEIGHT = 2048;

export const INK = '#1f1a2e';
export const OCEAN = '#5cc3f5';

const REGION_FILL: Record<string, string> = {
  Americas: '#b9ec9a',
  Europe: '#dcc2ff',
  Africa: '#ffd2a1',
  Asia: '#ffc0d3',
  Oceania: '#fff0a6',
};
const FALLBACK_FILL = '#fff6e0';

const regionById = new Map(
  (countriesData as CountryEntry[]).map((country) => [country.id, country.region]),
);

let textureCanvasPromise: Promise<HTMLCanvasElement> | null = null;

function paint(geometry: GlobeGeometryData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  const projection = geoEquirectangular()
    .scale(WIDTH / (2 * Math.PI))
    .translate([WIDTH / 2, HEIGHT / 2])
    .precision(0.2);
  const path = geoPath(projection, ctx);

  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.4;

  for (const feature of geometry.features) {
    const region = regionById.get(feature.properties.alpha3);
    ctx.fillStyle = (region && REGION_FILL[region]) || FALLBACK_FILL;
    ctx.beginPath();
    path(feature);
    ctx.fill();
    ctx.stroke();
  }

  return canvas;
}

export function loadGlobeTextureCanvas(geometry: GlobeGeometryData): Promise<HTMLCanvasElement> {
  if (!textureCanvasPromise) {
    // Defer one frame so the ocean shell can paint before the heavy draw.
    textureCanvasPromise = new Promise((resolve) => {
      requestAnimationFrame(() => resolve(paint(geometry)));
    });
  }
  return textureCanvasPromise;
}
