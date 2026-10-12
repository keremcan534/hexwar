// DENİZ BÖLGELERİ (TASARIM.md §11 Donanma).
//
// Donanma gemi gemi değil deniz deniz yönetilir: oyuncu bölgeye öncelik
// verir, filo önceliğe göre bölünür; hâkimiyet, abluka ve geçiş riski
// bölgeye yazılır. Bölümleme dünyanın SAF fonksiyonudur: kayıt dünyayı
// tohumdan yeniden kurar, bölgeler de aynı çıkar (kayda girmez).
//
// Yöntem: bağlı su kütleleri bulunur; büyük kütle uzak-nokta tohumlarıyla
// (su üzerinden adım mesafesi) yaklaşık SEA_ZONE_SIZE hexlik parçalara
// bölünür, her hex en yakın tohuma gider (çok kaynaklı BFS). Tohumlar iki tur
// parçanın en derin hexine taşınır (parçalar toparlanır), bundan küçük
// artıklar en uzun ortak sınırlı komşuya katılır. Ad, bölgeye en çok kıyı
// veren province'ten gelir; biçimi kıyı oranına göre seçilir.
//
// Ölçüldü (160×96, 2 tohum): ~9.800 su hexi neredeyse tek okyanus; 300
// hexlik hedefle 34 bölge, bölge başına ortanca 3-4 kıyı devleti.

import { makeRng } from '../core/rng.js';

/** Hedef bölge boyu (hex). */
export const SEA_ZONE_SIZE = 320;
/** Bundan küçük su kütlesi bölge olmaz: göl donanma taşımaz. */
const MIN_BODY = 12;
/** Bölümlemenin bıraktığı bundan küçük artık komşusuna katılır. */
const MIN_ZONE = 70;
/** Tohumu parçanın en derin hexine taşıyan tur sayısı. */
const RELAX_ROUNDS = 2;

const FORMATS = {
  lake: ['Lake {P}', '{P} Mere', 'Inland Sea of {P}'],
  strait: ['Strait of {P}', 'Narrows of {P}', '{P} Sound'],
  gulf: ['Gulf of {P}', 'Bay of {P}', '{P} Bight'],
  sea: ['{P} Sea', 'Sea of {P}', '{P} Waters', '{P} Basin'],
  ocean: ['{P} Deep', '{P} Reach', 'Open Sea off {P}', '{P} Banks', 'The {P} Approaches'],
};

const isWater = (tile) => !!tile?.terrain?.water;

/**
 * Bölümlemeyi kurar ve dünyaya yazar: `world.seaZones` ve her su hexinde
 * `tile.seaZone` (bölgesiz göl -1).
 */
export function buildSeaZones(world) {
  const tiles = world.tiles;
  const count = tiles.length;
  const indexOf = (tile) => tile.row * world.cols + tile.col;

  // Su komşuluğu bir kez: bölümleme aynı grafı onlarca kez gezer.
  const adjacency = new Array(count);
  for (let i = 0; i < count; i++) {
    if (!isWater(tiles[i])) continue;
    adjacency[i] = world.neighbors(tiles[i]).filter(isWater).map(indexOf);
  }

  // 1. Bağlı su kütleleri (üyeler artan indeksle; ilk üye en küçük indeks).
  const body = new Int32Array(count).fill(-1);
  const bodies = [];
  for (let i = 0; i < count; i++) {
    if (body[i] >= 0 || !adjacency[i]) continue;
    const id = bodies.length;
    const members = [i];
    body[i] = id;
    for (let head = 0; head < members.length; head++) {
      for (const j of adjacency[members[head]]) {
        if (body[j] < 0) {
          body[j] = id;
          members.push(j);
        }
      }
    }
    members.sort((a, b) => a - b);
    bodies.push(members);
  }

  const label = new Int32Array(count).fill(-1);
  const depth = new Int32Array(count);
  const distance = new Int32Array(count);
  let nextLabel = 0;

  // Çok kaynaklı BFS: her hex ilk ulaşan tohumun etiketini alır. Kuyruk
  // tohum sırasıyla başlar: eşitlik deterministik bozulur.
  const grow = (members, seeds, base) => {
    for (const i of members) label[i] = -1;
    const queue = [];
    seeds.forEach((seed, k) => {
      label[seed] = base + k;
      queue.push(seed);
    });
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      for (const j of adjacency[i]) {
        if (label[j] < 0) {
          label[j] = label[i];
          queue.push(j);
        }
      }
    }
  };

  // Kara ya da başka etikete değen hex sınırdır (derinlik 0); derinlik
  // içeri doğru artar. Etiket başına en derin hex parçanın "orta"sıdır.
  const deepest = (members) => {
    const queue = [];
    for (const i of members) {
      depth[i] = -1;
      const edge = adjacency[i].length < 6 || adjacency[i].some((j) => label[j] !== label[i]);
      if (edge) {
        depth[i] = 0;
        queue.push(i);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      for (const j of adjacency[i]) {
        if (depth[j] < 0 && label[j] === label[i]) {
          depth[j] = depth[i] + 1;
          queue.push(j);
        }
      }
    }
    const best = new Map();
    for (const i of members) {
      const current = best.get(label[i]);
      if (current === undefined || depth[i] > depth[current]) best.set(label[i], i);
    }
    return best;
  };

  for (const members of bodies) {
    if (members.length < MIN_BODY) continue;
    const k = Math.max(1, Math.round(members.length / SEA_ZONE_SIZE));
    // 2. Uzak-nokta tohumları: her yeni tohum mevcutlara en uzak hex.
    for (const i of members) distance[i] = 0x7fffffff;
    const seeds = [];
    let seed = members[0];
    for (let s = 0; s < k; s++) {
      seeds.push(seed);
      const queue = [seed];
      distance[seed] = 0;
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        for (const j of adjacency[i]) {
          if (distance[j] > distance[i] + 1) {
            distance[j] = distance[i] + 1;
            queue.push(j);
          }
        }
      }
      let far = -1;
      for (const i of members) if (far < 0 || distance[i] > distance[far]) far = i;
      seed = far;
    }
    // 3. Büyüt, tohumu parçanın en derin hexine taşı, yeniden büyüt.
    const base = nextLabel;
    grow(members, seeds, base);
    for (let round = 0; round < RELAX_ROUNDS && seeds.length > 1; round++) {
      const centers = deepest(members);
      for (let s = 0; s < seeds.length; s++) seeds[s] = centers.get(base + s) ?? seeds[s];
      grow(members, seeds, base);
    }
    nextLabel = base + seeds.length;

    // 4. Küçük artıklar en uzun ortak sınırlı komşuya katılır (küçükten büyüğe).
    for (;;) {
      const sizes = new Map();
      for (const i of members) sizes.set(label[i], (sizes.get(label[i]) ?? 0) + 1);
      if (sizes.size < 2) break;
      const small = [...sizes.entries()].filter(([, size]) => size < MIN_ZONE)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
      if (!small) break;
      const shared = new Map();
      for (const i of members) {
        if (label[i] !== small[0]) continue;
        for (const j of adjacency[i]) {
          if (label[j] !== small[0]) shared.set(label[j], (shared.get(label[j]) ?? 0) + 1);
        }
      }
      const into = [...shared.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
      if (into === undefined) break;
      for (const i of members) if (label[i] === small[0]) label[i] = into;
    }
  }

  // 5. Etiketleri sıkıştır (bölge kimliği = ilk hexinin sırası).
  const remap = new Map();
  const zones = [];
  for (let i = 0; i < count; i++) {
    if (label[i] < 0) continue;
    if (!remap.has(label[i])) {
      remap.set(label[i], zones.length);
      zones.push({ id: zones.length, tiles: [] });
    }
    zones[remap.get(label[i])].tiles.push(i);
  }
  const byTile = new Int32Array(count).fill(-1);
  for (const zone of zones) for (const i of zone.tiles) byTile[i] = zone.id;
  for (let i = 0; i < count; i++) {
    if (isWater(tiles[i])) tiles[i].seaZone = byTile[i];
  }

  // 6. Komşular, kıyı, en derin hex (etiket ve işaret yeri), ad.
  for (let i = 0; i < count; i++) label[i] = byTile[i];
  const centers = deepest(zones.flatMap((zone) => zone.tiles));
  const usedNames = new Set();
  for (const zone of zones) {
    const neighbors = new Set();
    const coast = new Map();
    let coastal = 0;
    for (const i of zone.tiles) {
      let touchesLand = false;
      for (const near of world.neighbors(tiles[i])) {
        if (isWater(near)) {
          const other = byTile[indexOf(near)];
          if (other >= 0 && other !== zone.id) neighbors.add(other);
          continue;
        }
        touchesLand = true;
        if (near.provinceId >= 0) coast.set(near.provinceId, (coast.get(near.provinceId) ?? 0) + 1);
      }
      if (touchesLand) coastal++;
    }
    zone.size = zone.tiles.length;
    zone.anchor = centers.get(zone.id) ?? zone.tiles[0];
    zone.neighbors = [...neighbors].sort((a, b) => a - b);
    // Kıyı: province → kenar sayısı (sahiplik değişir; kimlik kalır).
    zone.coast = [...coast.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([provinceId, edges]) => ({ provinceId, edges }));
    zone.coastalShare = coastal / zone.size;
    zone.kind = kindOf(zone);
    zone.name = nameOf(world, zone, usedNames, byTile);
  }

  world.seaZones = { zones, byTile, distances: new Map() };
  return world.seaZones;
}

function kindOf(zone) {
  if (!zone.neighbors.length && zone.size < 150) return 'lake';
  if (zone.size < 110 && zone.coastalShare > 0.5) return 'strait';
  if (zone.coastalShare > 0.32 && zone.neighbors.length <= 2) return 'gulf';
  if (zone.coastalShare > 0.1) return 'sea';
  return 'ocean';
}

/**
 * Ad: bölgeye en çok kıyı veren province, yoksa en derin hexten su
 * üzerinden ilk varılan kıyının province'i. Aynı ad ikinci kez verilmez.
 */
function nameOf(world, zone, used, byTile) {
  const candidates = zone.coast.map((row) => world.provinces?.[row.provinceId]?.name).filter(Boolean);
  if (!candidates.length) {
    const nearest = nearestCoastProvince(world, zone, byTile);
    if (nearest) candidates.push(nearest);
  }
  const formats = FORMATS[zone.kind];
  const rng = makeRng(`${world.seed}-seazone-${zone.anchor}`);
  const start = Math.floor(rng() * formats.length);
  for (const place of candidates.slice(0, 3)) {
    for (let k = 0; k < formats.length; k++) {
      const format = formats[(start + k) % formats.length];
      // "Caldreach Reach" olmasın: yer adı kalıbın sözcüğüyle bitiyorsa atla.
      const word = format.replace('{P}', '').replace(/\b(of|off|the)\b/gi, '').trim().toLowerCase();
      if (word && place.toLowerCase().endsWith(word.split(' ').pop())) continue;
      const name = format.replace('{P}', place);
      if (!used.has(name)) {
        zone.place = place;
        used.add(name);
        return name;
      }
    }
  }
  const name = `${zone.kind === 'ocean' ? 'Open Sea' : 'Sea'} ${zone.id + 1}`;
  used.add(name);
  return name;
}

function nearestCoastProvince(world, zone, byTile) {
  const start = world.tiles[zone.anchor];
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const near of world.neighbors(queue[head])) {
      if (seen.has(near)) continue;
      seen.add(near);
      if (!isWater(near)) {
        const province = world.provinces?.[near.provinceId];
        if (province?.name) return province.name;
        continue;
      }
      queue.push(near);
    }
  }
  return null;
}

/** Dünyanın bölgeleri; ilk çağrıda kurulur. */
export function seaZonesOf(world) {
  return world.seaZones ?? buildSeaZones(world);
}

/** Bir su hexinin bölgesi (yoksa null). */
export function seaZoneAt(world, tile) {
  if (!isWater(tile)) return null;
  const zones = seaZonesOf(world);
  const id = tile.seaZone ?? zones.byTile[tile.row * world.cols + tile.col];
  return id >= 0 ? zones.zones[id] : null;
}

/**
 * Bölge grafında adım mesafeleri (geçiş süresi bunu okur). Bölge başına bir
 * kez hesaplanır; aynı kütlede olmayan bölge Infinity.
 */
export function zoneDistances(world, fromId) {
  const zones = seaZonesOf(world);
  const cached = zones.distances.get(fromId);
  if (cached) return cached;
  const out = new Array(zones.zones.length).fill(Infinity);
  if (fromId >= 0 && fromId < zones.zones.length) {
    out[fromId] = 0;
    const queue = [fromId];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      for (const next of zones.zones[id].neighbors) {
        if (out[next] === Infinity) {
          out[next] = out[id] + 1;
          queue.push(next);
        }
      }
    }
  }
  zones.distances.set(fromId, out);
  return out;
}

/** Bir province'in kıyısının değdiği bölgeler (kenar sayısıyla, çoktan aza). */
export function zonesOfProvince(world, provinceId) {
  const zones = seaZonesOf(world);
  zones.byProvince ??= buildProvinceIndex(zones);
  return zones.byProvince.get(provinceId) ?? [];
}

function buildProvinceIndex(zones) {
  const index = new Map();
  for (const zone of zones.zones) {
    for (const { provinceId, edges } of zone.coast) {
      if (!index.has(provinceId)) index.set(provinceId, []);
      index.get(provinceId).push({ zoneId: zone.id, edges });
    }
  }
  for (const list of index.values()) list.sort((a, b) => b.edges - a.edges || a.zoneId - b.zoneId);
  return index;
}
