// EARTH coğrafya denetimi (npm run audit:geography -- --earth).
//
// Prosedürel denetimin ret kuralları (üç kıtasal sistem, iç deniz halkası…)
// gerçek Dünya'ya uymaz; burada "harita gerçek Dünya'yı doğru taşıyor mu"
// sorulur ve oyunun gördüğü dünyada (generateWorld) ölçülür:
//   1. kara oranı ve mercek payı (Avrupa, Anadolu)
//   2. dar geçitler: deniz yolları açık, kıstaklar bağlı, adalar ayrı
//   3. tanınırlık: bilinen kara noktaları kara, deniz noktaları deniz
//   4. adalar: büyük adaların her biri haritada
//   5. iklim: bilinen yerlerin arazisi (Sahra çöl, Amazon orman…)
//   6. nehirler: büyük nehirler yerinde
//   7. determinizm: aynı tohum aynı dünya; tohum yalnız siyaseti değiştirir

import { generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import { earthFrame } from '../../src/world/earthGrid.js';
import { DIRS } from '../../src/core/hex.js';
import { LAND_LINKS, LAND_SPLITS, SEA_LINKS } from '../earth/curation.mjs';
import { finding, n0, section, sub } from './harness.mjs';

const LAND_POINTS = [
  ['Londra', -0.1, 51.5], ['Paris', 2.3, 48.9], ['Berlin', 13.4, 52.5], ['Viyana', 16.4, 48.2],
  ['Roma', 12.5, 41.9], ['Madrid', -3.7, 40.4], ['Varşova', 21.0, 52.2], ['Stockholm', 18.1, 59.3],
  ['Moskova', 37.6, 55.8], ['Kiev', 30.5, 50.5], ['İstanbul', 28.9, 41.0], ['Ankara', 32.9, 39.9],
  ['Atina', 23.7, 38.0], ['Bükreş', 26.1, 44.4], ['Tahran', 51.4, 35.7], ['Bağdat', 44.4, 33.3],
  ['Kahire', 31.2, 30.0], ['Lagos', 3.4, 6.5], ['Kinşasa', 15.3, -4.3], ['Nairobi', 36.8, -1.3],
  ['Kap', 18.4, -33.9], ['Delhi', 77.2, 28.6], ['Kalküta', 88.4, 22.6], ['Pekin', 116.4, 39.9],
  ['Şanghay', 121.5, 31.2], ['Tokyo', 139.7, 35.7], ['Seul', 127.0, 37.6], ['Bangkok', 100.5, 13.8],
  ['Cakarta', 106.8, -6.2], ['Sidney', 151.2, -33.9], ['New York', -74.0, 40.7], ['Chicago', -87.6, 41.9],
  ['Meksiko', -99.1, 19.4], ['Rio', -43.2, -22.9], ['Buenos Aires', -58.4, -34.6], ['Lima', -77.0, -12.0],
  ['Ottawa', -75.7, 45.4], ['San Francisco', -122.4, 37.8], ['Taşkent', 69.2, 41.3], ['Irkutsk', 104.3, 52.3],
];
const SEA_POINTS = [
  ['Orta Atlas', -35, 35], ['Akdeniz', 18, 35], ['Karadeniz', 34, 43.3], ['Hazar', 51, 41],
  ['Baltık', 18.5, 55.5], ['Kuzey Denizi', 3, 56], ['Kızıldeniz', 38, 20], ['Basra Körfezi', 51, 27],
  ['Meksika Körfezi', -90, 25], ['Karayip', -75, 15], ['Hudson Körfezi', -85, 60], ['Bengal Körfezi', 88, 15],
  ['Güney Çin Denizi', 113, 13], ['Japon Denizi', 135, 40], ['Pasifik', -150, 0], ['Hint Okyanusu', 75, -15],
];
const ISLANDS = [
  ['Britanya', -2.0, 53.0], ['İrlanda', -8.0, 53.3], ['İzlanda', -19.0, 64.9], ['Sicilya', 14.2, 37.5],
  ['Sardinya', 9.0, 40.0], ['Girit', 24.9, 35.2], ['Kıbrıs', 33.2, 35.0], ['Seylan', 80.7, 7.8],
  ['Madagaskar', 46.9, -19.0], ['Honşu', 138.5, 36.5], ['Tayvan', 121.0, 23.7], ['Luzon', 121.0, 16.0],
  ['Borneo', 114.0, 1.0], ['Sumatra', 101.5, -0.5], ['Cava', 110.0, -7.4], ['Yeni Gine', 143.0, -6.0],
  ['Tazmanya', 146.6, -42.0], ['Yeni Zelanda', 175.5, -39.0], ['Küba', -79.0, 21.8], ['Hispaniola', -71.0, 19.0],
  ['Newfoundland', -56.0, 48.6], ['Grönland', -42.0, 72.0], ['Spitsbergen', 16.0, 78.8], ['Sahalin', 142.8, 50.5],
];
// Kabul edilen arazi tipleri: hex 250 km'lik bir ortalamadır, tek doğru yok.
const CLIMATE_POINTS = [
  ['Libya çölü', 25, 25, ['DESERT']], ['Tassili (Sahra dağları)', 9, 25, ['HILLS', 'MOUNTAIN', 'DESERT']], ['Arabistan', 47, 22, ['DESERT']], ['Gobi', 105, 43, ['DESERT', 'PLAINS']],
  ['Avustralya içi', 133, -25, ['DESERT', 'PLAINS']], ['Amazon', -62, -4, ['JUNGLE']], ['Kongo', 22, 0, ['JUNGLE']],
  ['Sibirya taygası', 100, 62, ['FOREST', 'HILLS']], ['Kanada kalkanı', -80, 52, ['FOREST']],
  ['Grönland içi', -40, 75, ['ICE']], ['Himalaya', 85, 29, ['SNOW_PEAK', 'MOUNTAIN']],
  ['Tibet', 88, 33, ['TUNDRA', 'MOUNTAIN', 'SNOW_PEAK', 'HILLS']], ['Alpler', 10, 46.5, ['MOUNTAIN', 'HILLS', 'SNOW_PEAK']],
  ['And', -70, -20, ['MOUNTAIN', 'SNOW_PEAK', 'HILLS']], ['Ganj ovası', 82, 26, ['GRASSLAND', 'PLAINS']],
  ['Pampa', -62, -35, ['GRASSLAND', 'PLAINS']], ['Büyük Ovalar', -100, 40, ['PLAINS', 'GRASSLAND']],
  // 72°K'de Taymır'ın güneyi hâlâ ormandır (Ary-Mas, dünyanın en kuzey ormanı).
  ['Taymır tundrası', 100, 75, ['TUNDRA', 'ICE']], ['Paris havzası', 2.5, 48, ['GRASSLAND', 'PLAINS', 'FOREST', 'BEACH']],
];
const RIVER_POINTS = [
  ['Nil', 32.5, 24.0], ['Tuna', 22.0, 44.0], ['Volga', 46.0, 50.0], ['Ren', 7.5, 50.5], ['Mississippi', -90.5, 35.0],
  ['Amazon', -60.0, -3.0], ['Yangtze', 112.0, 30.0], ['Ganj', 83.0, 25.5], ['Ob', 70.0, 61.0], ['Fırat', 41.0, 35.0],
];

export function runEarthGeography() {
  const frame = earthFrame();
  const t0 = Date.now();
  const world = generateWorld('earth-audit', { map: 'earth' });
  const ms = Date.now() - t0;
  const n = world.cols * world.rows;
  section(`EARTH COĞRAFYASI — ${world.cols}x${world.rows} · üretim ${ms} ms`);

  const tileAt = (lon, lat) => world.tiles[frame.tileOf(lon, lat)];
  const ring = (t) => [t, ...DIRS.map(([dq, dr]) => world.get(t.q + dq, t.r + dr)).filter(Boolean)];
  const isLand = (t) => t && !t.terrain.water;

  sub('1. kara oranı ve mercek');
  const ratio = world.landCount / n;
  const zones = new Map();
  world.forEach((t) => { if (t.zone) zones.set(t.zone, (zones.get(t.zone) ?? 0) + 1); });
  console.log(`  kara ${n0(world.landCount)} / ${n0(n)} = %${(ratio * 100).toFixed(1)} · Avrupa ${zones.get('yogun-bati')} · kavşak ${zones.get('kavsak')}`);
  if (ratio < 0.27 || ratio > 0.34) finding('HIGH', 'kara oranı', '%27-34 (Miller, Antarktika yok)', `%${(ratio * 100).toFixed(1)}`);
  if ((zones.get('yogun-bati') ?? 0) < 380) finding('HIGH', 'Avrupa merceği', '>= 380 kara hexi', String(zones.get('yogun-bati')));
  if ((zones.get('kavsak') ?? 0) < 220) finding('HIGH', 'Anadolu merceği', 'kavşak >= 220 kara hexi', String(zones.get('kavsak')));

  sub('2. dar geçitler');
  const near = ([lon, lat], want) => ring(tileAt(lon, lat)).find((t) => isLand(t) === want) ?? null;
  const reach = (start, want) => {
    const seen = new Set([start]);
    const queue = [start];
    for (let h = 0; h < queue.length; h++) {
      for (const nb of world.neighbors(queue[h])) {
        if (seen.has(nb) || isLand(nb) !== want) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
    return seen;
  };
  let bad = 0;
  const check = (kind, name, ok) => {
    if (!ok) { bad++; finding('HIGH', 'dar geçit', `${kind}: ${name}`, 'tutmuyor'); }
  };
  for (const [an, a, bn, b] of SEA_LINKS) {
    const ta = near(a, false); const tb = near(b, false);
    check('deniz yolu', `${an} ↔ ${bn}`, ta && tb && reach(ta, false).has(tb));
  }
  for (const [an, a, bn, b] of LAND_LINKS) {
    const ta = near(a, true); const tb = near(b, true);
    check('kara yolu', `${an} ↔ ${bn}`, ta && tb && reach(ta, true).has(tb));
  }
  for (const [an, a, bn, b] of LAND_SPLITS) {
    const ta = near(a, true); const tb = near(b, true);
    check('ayrı kara', `${an} ✕ ${bn}`, ta && tb && !reach(ta, true).has(tb));
  }
  console.log(`  ${SEA_LINKS.length + LAND_LINKS.length + LAND_SPLITS.length} denetim, ${bad} hata`);

  sub('3. tanınırlık');
  const landMiss = LAND_POINTS.filter(([, lon, lat]) => !ring(tileAt(lon, lat)).some(isLand)).map(([name]) => name);
  const seaMiss = SEA_POINTS.filter(([, lon, lat]) => isLand(tileAt(lon, lat))).map(([name]) => name);
  console.log(`  kara noktası ${LAND_POINTS.length - landMiss.length}/${LAND_POINTS.length} · deniz noktası ${SEA_POINTS.length - seaMiss.length}/${SEA_POINTS.length}`);
  if (landMiss.length) finding('HIGH', 'tanınırlık', 'kentin hexi ya da komşusu kara', landMiss.join(', '));
  if (seaMiss.length) finding('HIGH', 'tanınırlık', 'deniz noktası su', seaMiss.join(', '));

  sub('4. adalar');
  const islandMiss = ISLANDS.filter(([, lon, lat]) => !ring(tileAt(lon, lat)).some(isLand)).map(([name]) => name);
  console.log(`  ${ISLANDS.length - islandMiss.length}/${ISLANDS.length} ada haritada`);
  if (islandMiss.length) finding('MEDIUM', 'adalar', 'büyük adanın en az bir hexi', islandMiss.join(', '));

  sub('5. iklim');
  const climateMiss = [];
  for (const [name, lon, lat, ok] of CLIMATE_POINTS) {
    const t = tileAt(lon, lat);
    if (!t || !ok.includes(t.terrain.id)) climateMiss.push(`${name}=${t?.terrain.id}`);
  }
  console.log(`  ${CLIMATE_POINTS.length - climateMiss.length}/${CLIMATE_POINTS.length} yer beklenen arazide`);
  if (climateMiss.length) finding('MEDIUM', 'iklim', 'bilinen yer beklenen arazide', climateMiss.join(', '));
  const terr = new Map();
  world.forEach((t) => { if (!t.terrain.water) terr.set(t.terrain.id, (terr.get(t.terrain.id) ?? 0) + 1); });
  console.log(`  arazi: ${[...terr].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} %${((v / world.landCount) * 100).toFixed(0)}`).join(' ')}`);

  sub('6. nehirler');
  const riverMiss = RIVER_POINTS.filter(([, lon, lat]) => {
    const t = tileAt(lon, lat);
    return !t || !ring(t).some((x) => x.river);
  }).map(([name]) => name);
  console.log(`  ${world.rivers.edges.length} kenar · ${world.rivers.systems} sistem · büyük nehir ${RIVER_POINTS.length - riverMiss.length}/${RIVER_POINTS.length}`);
  if (riverMiss.length) finding('MEDIUM', 'nehirler', 'büyük nehir yerinde', riverMiss.join(', '));

  sub('7. determinizm');
  const hashOf = (w) => {
    let h = 0;
    w.forEach((t) => {
      const s = `${t.terrain.id}${t.zone}${t.riverMask}`;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647;
    });
    return h;
  };
  const again = generateWorld('earth-audit', { map: 'earth' });
  const other = generateWorld('earth-audit-2', { map: 'earth' });
  generateNations(again, { seed: 'earth-audit-nations' });
  generateNations(other, { seed: 'earth-audit-2-nations' });
  const sameGeo = hashOf(world) === hashOf(again) && hashOf(world) === hashOf(other);
  const owners = (w) => w.tiles.map((t) => t.owner).join(',');
  const differs = owners(again) !== owners(other);
  console.log(`  coğrafya üç tohumda aynı: ${sameGeo ? 'evet' : 'HAYIR'} · siyaset tohumla değişiyor: ${differs ? 'evet' : 'HAYIR'}`);
  if (!sameGeo) finding('CRITICAL', 'determinizm', 'Earth coğrafyası tohumdan bağımsız', 'farklı');
  if (!differs) finding('HIGH', 'tohum', 'tohum siyaseti değiştirmeli', 'aynı sınırlar');
}
