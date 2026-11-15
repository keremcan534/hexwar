// Earth haritasının kaynak verisini indirir (yalnız bir kez; depoya girmez).
//
//   node scripts/earth/fetch-earth.mjs <hedef-klasör>
//
// Her kaynak kendi alt klasörüne iner (ne/, etopo/, koppen/). İşleme betiği
// (build-earth.mjs) bu klasörü --src ile okur. Lisanslar:
//   Natural Earth 1:10m — kamu malı (naturalearthdata.com)
//   NOAA ETOPO1 Ice Surface — ABD kamu malı (Amante & Eakins 2009), ERDDAP alt örneği
//   Köppen-Geiger 1901–1930 — Beck vd. 2023, CC BY 4.0 (künyede atıf şart)

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const target = process.argv[2];
if (!target) {
  console.error('kullanım: node scripts/earth/fetch-earth.mjs <hedef-klasör>');
  process.exit(1);
}

const NE = 'https://naciscdn.org/naturalearth/10m/physical/';
// ERDDAP 1 açısal dakikalık ETOPO1'i sunucu tarafında 6'da bir örnekler: 0.1°.
// Aynı veri kümesi iki NOAA ERDDAP'ında: coastwatch yük altında 503 dönüyor
// (2026-11-15: küçük istek bile), upwell aynası tam isteği verdi.
const ETOPO_QUERY = '/erddap/griddap/etopo180.nc?altitude%5B(-90.0):6:(90.0)%5D%5B(-180.0):6:(180.0)%5D';
const ETOPO = [
  `https://upwell.pfeg.noaa.gov${ETOPO_QUERY}`,
  `https://coastwatch.pfeg.noaa.gov${ETOPO_QUERY}`,
];

export const SOURCES = [
  ['ne', 'ne_10m_land.zip', `${NE}ne_10m_land.zip`],
  ['ne', 'ne_10m_minor_islands.zip', `${NE}ne_10m_minor_islands.zip`],
  ['ne', 'ne_10m_lakes.zip', `${NE}ne_10m_lakes.zip`],
  ['ne', 'ne_10m_lakes_historic.zip', `${NE}ne_10m_lakes_historic.zip`],
  ['ne', 'ne_10m_rivers_lake_centerlines.zip', `${NE}ne_10m_rivers_lake_centerlines.zip`],
  ['ne', 'ne_10m_glaciated_areas.zip', `${NE}ne_10m_glaciated_areas.zip`],
  ['etopo', 'etopo1_0p1.nc', ETOPO],
  ['koppen', 'koppen_geiger_tif.zip', 'https://ndownloader.figshare.com/files/61012822'],
];

for (const [dir, name, url] of SOURCES) {
  const folder = join(target, dir);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, name);
  if (existsSync(file) && statSync(file).size > 0) {
    console.log(`var: ${dir}/${name} (${(statSync(file).size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  const t0 = Date.now();
  // Bilim sunucuları yük altında 503 döndürebiliyor: aynalar arasında,
  // kısa beklemeyle yeniden dene.
  const urls = Array.isArray(url) ? url : [url];
  let res = null;
  for (let attempt = 1; attempt <= 4 && !res?.ok; attempt++) {
    for (const u of urls) {
      res = await fetch(u, { redirect: 'follow' });
      if (res.ok) break;
      console.log(`${name}: HTTP ${res.status} (${new URL(u).host}), deneme ${attempt}/4`);
    }
    if (!res.ok) await new Promise((done) => setTimeout(done, attempt * 15000));
  }
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  console.log(`indi: ${dir}/${name} (${(statSync(file).size / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
