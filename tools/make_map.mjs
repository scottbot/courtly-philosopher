#!/usr/bin/env node
/*
 * make_map.mjs — draws img/map-europe.svg, the small map in About › At a glance:
 * the places in the story of the game (court, author, the game's origin, the printers,
 * the surviving copies).
 *
 * Coastlines and borders: Natural Earth 1:50m (public domain, naturalearthdata.com),
 * as packaged in the npm module world-atlas. Projection and drawing: d3-geo and
 * topojson-client. None of these is needed by the site itself, and none is published:
 * install them anywhere outside the site and point MAP_DEPS at that folder.
 *
 *   npm install --prefix /tmp/fc-map --ignore-scripts world-atlas@2.0.2 d3-geo@3.1.1 topojson-client@3.1.0
 *   MAP_DEPS=/tmp/fc-map node tools/make_map.mjs
 *
 * or, with every dependency pinned by the lockfile in tools/map-deps/:
 *
 *   mkdir -p /tmp/fc-map && cp tools/map-deps/package*.json /tmp/fc-map/
 *   npm ci --prefix /tmp/fc-map --ignore-scripts
 *
 * (--ignore-scripts: none of these packages needs an install script, so none is run.
 * Without MAP_DEPS the modules are looked for in tools/node_modules; if you install
 * there, do not publish that folder.)  The output is deterministic: rerunning it with
 * the same package versions gives the same file (checked 2 October 2026 with the
 * versions above, Node 22). If they can no longer be installed, use current ones: the
 * map will differ in bytes, not in content.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DEPS = process.env.MAP_DEPS ? join(process.env.MAP_DEPS, 'node_modules') : join(HERE, 'node_modules');
const req = createRequire(join(DEPS, 'x.js'));
const load = async name => { const m = await import(pathToFileURL(req.resolve(name)).href); return m.default && !m.geoPath ? m.default : m; };

const d3 = await load('d3-geo');
const topojson = await load('topojson-client');
const world = JSON.parse(readFileSync(req.resolve('world-atlas/countries-50m.json'), 'utf8'));

// Places named in the edition, with what happened there (the caption in the content
// says so in words). [lon, lat], and where the label sits relative to the dot.
const PLACES = [
  ['Madrid', [-3.7038, 40.4168], 'right'],
  ['Segovia', [-4.1184, 40.9429], 'left'],
  ['Lisbon', [-9.1393, 38.7223], 'below'],
  ['Florence', [11.2558, 43.7696], 'right'],
  ['Rome', [12.4964, 41.9028], 'left'],
  ['Naples', [14.2681, 40.8518], 'right'],
  ['Vienna', [16.3738, 48.2082], 'below'],
  ['London', [-0.1276, 51.5072], 'left'],
  ['Cambridge', [0.1218, 52.2053], 'right'],
];

const W = 800, H = 640;
const frame = { type: 'MultiPoint', coordinates: [[-10.5, 36.2], [18.5, 36.2], [18.5, 54.2], [-10.5, 54.2]] };
const proj = d3.geoConicConformal().parallels([38, 52]).rotate([-4, 0]).fitExtent([[24, 24], [W - 24, H - 24]], frame);
proj.clipExtent([[0, 0], [W, H]]);
const path = d3.geoPath(proj).digits(1);

const land = topojson.feature(world, world.objects.land);
const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
const graticule = d3.geoGraticule().step([5, 5]).extent([[-20, 30], [30, 60]])();

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let labels = '';
for (const [name, ll, side] of PLACES) {
  const [x, y] = proj(ll).map(v => Math.round(v * 10) / 10);
  const dx = side === 'right' ? 9 : side === 'left' ? -9 : 0;
  const dy = side === 'below' ? 22 : side === 'above' ? -12 : 6;
  const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
  labels += `<circle cx="${x}" cy="${y}" r="5" class="dot"/>` +
    `<text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" class="lab">${esc(name)}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">Map of western Europe and the Mediterranean marking Madrid, Segovia, Lisbon, Florence, Rome, Naples, Vienna, London and Cambridge</title>
<style>
.sea{fill:#dde3df}.land{fill:#f3ecdc;stroke:#6b5d45;stroke-width:.7}.bord{fill:none;stroke:#6b5d45;stroke-width:.5;stroke-opacity:.45;stroke-dasharray:2 2}
.grat{fill:none;stroke:#6b5d45;stroke-opacity:.15;stroke-width:.5}.dot{fill:#8e2c1c;stroke:#f8f3e7;stroke-width:1.5}
.lab{font-family:"EB Garamond",Garamond,Georgia,"Times New Roman",serif;font-size:21px;fill:#2a2119;paint-order:stroke;stroke:#f3ecdc;stroke-width:4px;stroke-linejoin:round}
.cr{font-family:Georgia,"Times New Roman",serif;font-size:12px;fill:#4b3e2f;paint-order:stroke;stroke:#f3ecdc;stroke-width:3px;stroke-linejoin:round}
</style>
<rect class="sea" width="${W}" height="${H}"/>
<path class="grat" d="${path(graticule)}"/>
<path class="land" d="${path(land)}"/>
<path class="bord" d="${path(borders)}"/>
${labels}
<text x="${W - 10}" y="${H - 10}" text-anchor="end" class="cr">Coastlines and borders: Natural Earth (public domain); present-day borders</text>
</svg>
`;
writeFileSync(join(ROOT, 'img', 'map-europe.svg'), svg);
console.log(`img/map-europe.svg written, ${(svg.length / 1024).toFixed(1)} KB`);
