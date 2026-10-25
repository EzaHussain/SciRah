// Generates src/lib/world-shapes.json: every country (except Antarctica) as an SVG path in a 960×470
// Natural Earth projection. Run once (`node scripts/build-world-shapes.mjs`) and commit the result —
// the world map then ships as a static, CDN-cached file instead of inside every search page.
import { writeFileSync, readFileSync } from "node:fs";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import { feature } from "topojson-client";

const topo = JSON.parse(readFileSync(new URL("../node_modules/world-atlas/countries-110m.json", import.meta.url), "utf8"));
const features = feature(topo, topo.objects.countries).features.filter((f) => f.id !== "010");
const projection = geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [956, 466],
  ],
  { type: "FeatureCollection", features },
);
const path = geoPath(projection).digits(1);
const shapes = features
  .map((f) => ({ code: countries.numericToAlpha2(f.id)?.toLowerCase() ?? "", name: f.properties.name, d: path(f) ?? "" }))
  .filter((s) => s.code && s.d);
writeFileSync(new URL("../src/lib/world-shapes.json", import.meta.url), JSON.stringify(shapes));
console.log(`${shapes.length} countries, ${Math.round(JSON.stringify(shapes).length / 1024)} KB`);
