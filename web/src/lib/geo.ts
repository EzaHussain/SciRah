// Server-side map geometry: country outlines are projected to SVG paths here, so the browser only
// receives finished path strings (no map data or projection library in the client bundle).
import { geoMercator, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import countriesLib from "i18n-iso-countries";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world110 from "world-atlas/countries-110m.json";
import world50 from "world-atlas/countries-50m.json";

type CountryFeature = Feature<Geometry, { name: string }> & { id?: string };

export interface CountryShape {
  /** ISO 3166-1 alpha-2, lower-case. */
  code: string;
  name: string;
  d: string;
}

export const WORLD_VIEWBOX = { width: 960, height: 470 };

function features(topo: unknown): CountryFeature[] {
  const t = topo as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  return (feature(t, t.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as CountryFeature[];
}

const alpha2 = (numeric?: string) => (numeric ? countriesLib.numericToAlpha2(numeric)?.toLowerCase() : undefined);

let worldCache: CountryShape[] | null = null;

/** Every country (except Antarctica) as an SVG path in a 960×470 Natural Earth projection. */
export function worldShapes(): CountryShape[] {
  if (worldCache) return worldCache;
  const fs = features(world110).filter((f) => f.id !== "010");
  const projection = geoNaturalEarth1().fitExtent(
    [
      [4, 4],
      [WORLD_VIEWBOX.width - 4, WORLD_VIEWBOX.height - 4],
    ],
    { type: "FeatureCollection", features: fs },
  );
  const path = geoPath(projection);
  worldCache = fs
    .map((f) => ({ code: alpha2(f.id) ?? "", name: f.properties.name, d: path(f) ?? "" }))
    .filter((s) => s.code && s.d);
  return worldCache;
}

export interface CountryMapGeometry {
  width: number;
  height: number;
  outline: string;
  /** Neighbouring countries, drawn faintly for context. */
  neighbours: string[];
  project: (lng: number, lat: number) => [number, number] | null;
}

/** One country, zoomed in (Mercator), with a projector for institution pins. */
export function countryGeometry(code: string, width = 640, height = 520): CountryMapGeometry | null {
  const fs = features(world50);
  const target = fs.find((f) => alpha2(f.id) === code.toLowerCase());
  if (!target) return null;
  const projection = geoMercator().fitExtent(
    [
      [24, 24],
      [width - 24, height - 24],
    ],
    target,
  );
  const path = geoPath(projection);
  // Only countries whose bounds overlap the visible area (the rest would be off-screen page weight).
  const neighbours = fs
    .filter((f) => {
      if (f === target) return false;
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      return x1 > 0 && y1 > 0 && x0 < width && y0 < height && x1 - x0 < width * 40;
    })
    .map((f) => path(f) ?? "")
    .filter(Boolean);
  return {
    width,
    height,
    outline: path(target) ?? "",
    neighbours,
    project: (lng, lat) => {
      const p = projection([lng, lat]);
      return p && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height ? [p[0], p[1]] : null;
    },
  };
}
