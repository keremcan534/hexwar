// Rastgele ülkeler: tohum seçimi + ağırlıklı yayılma (Dijkstra) ile organik sınırlar.

import { makeRng } from '../core/rng.js';
import { makeFlag } from './flags.js';
import { growRegions } from './regions.js';
import { archetypePlan } from './macro.js';

const SYL_START = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gor', 'Hal', 'Ir', 'Kaz', 'Lor', 'Mar', 'Nor', 'Oss', 'Pra', 'Quen', 'Rav', 'Sar', 'Tur', 'Ul', 'Vas', 'Wyn', 'Yar', 'Zen'];
const SYL_MID = ['a', 'e', 'i', 'o', 'an', 'en', 'ir', 'or', 'al', 'ath', 'esh', 'ov', 'ur', 'yl'];
const SYL_END = ['ya', 'ia', 'land', 'mark', 'stan', 'grad', 'heim', 'dor', 'ria', 'nia', 'gard', 'vik', 'esh', 'ov'];
const TITLES = ['Kingdom', 'Empire', 'Republic', 'Principality', 'Duchy', 'Confederation', 'Khanate', 'Emirate'];

// Politik harita paleti. Renkler yalniz genel olarak farkli degil, asagidaki
// komsuluk boyamasinda birbirine siniri olan ulkeler icin ozellikle ayrilir.
const NATION_PALETTE = [
  { hue: 4, sat: 74, light: 52 },
  { hue: 211, sat: 72, light: 55 },
  { hue: 111, sat: 58, light: 47 },
  { hue: 48, sat: 80, light: 56 },
  { hue: 282, sat: 64, light: 59 },
  { hue: 174, sat: 64, light: 44 },
  { hue: 326, sat: 70, light: 58 },
  { hue: 27, sat: 84, light: 55 },
  { hue: 239, sat: 58, light: 66 },
  { hue: 84, sat: 64, light: 49 },
  { hue: 195, sat: 82, light: 46 },
  { hue: 350, sat: 52, light: 68 },
];

function makeName(rng, used) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let base = rng.pick(SYL_START);
    if (rng.chance(0.55)) base += rng.pick(SYL_MID);
    base += rng.pick(SYL_END);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
  }
  return `Nation-${used.size + 1}`;
}

/** Altın oran açısıyla dağıtılan ton: 20+ ülkede bile renkler karışmaz. */
function makeColor(index, rng) {
  const hue = (index * 137.508 + rng.range(0, 40)) % 360;
  const sat = 62 + ((index * 17) % 20);
  const light = 48 + ((index * 11) % 16);
  return { color: `hsl(${hue.toFixed(0)} ${sat}% ${light}%)`, hue, sat, light };
}

function colorDistance(a, b) {
  const hue = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue));
  return hue + Math.abs(a.light - b.light) * 2.4 + Math.abs(a.sat - b.sat) * 0.25;
}

/**
 * Ulke kimligi haritadaki konumu bilmeden renk uretemez: altin-oran tonlari
 * genel olarak daginik olsa da iki benzer ton yan yana gelebiliyordu. Sinir
 * grafigini cikarip en cok komsusu olan ulkeden baslayarak, atanmis komsularina
 * en uzak palet rengini seceriz. Ayni renk yalniz siniri olmayanlarda tekrarlar.
 */
function separateNeighborColors(world, nations, rng) {
  const adjacent = nations.map(() => new Set());
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    for (const near of world.neighbors(tile)) {
      if (near.owner < 0 || near.owner === tile.owner) continue;
      adjacent[tile.owner].add(near.owner);
    }
  });

  const assigned = new Array(nations.length).fill(-1);
  const usage = new Array(NATION_PALETTE.length).fill(0);
  const order = nations.map((nation) => nation.id)
    .sort((a, b) => adjacent[b].size - adjacent[a].size || a - b);

  for (const nationId of order) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < NATION_PALETTE.length; i++) {
      let nearest = 240;
      for (const otherId of adjacent[nationId]) {
        const other = assigned[otherId];
        if (other >= 0) nearest = Math.min(
          nearest, colorDistance(NATION_PALETTE[i], NATION_PALETTE[other]),
        );
      }
      // Esitlikte haritanin tamaminin ayni ilk renkle baslamamasi icin daha az
      // kullanilmis renk kazanir; son terim yalniz deterministik bag kiricidir.
      const score = nearest - usage[i] * 8 + ((nationId * 7 + i * 3) % 13) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    assigned[nationId] = best;
    usage[best]++;
  }

  for (const nation of nations) {
    const base = NATION_PALETTE[assigned[nation.id]];
    nation.hue = base.hue;
    nation.sat = base.sat;
    nation.light = base.light;
    nation.color = `hsl(${base.hue} ${base.sat}% ${base.light}%)`;
    nation.flag = makeFlag(rng, base);
  }
}

/**
 * Dünyaya ülkeler yerleştirir. world.tiles[].owner alanını doldurur.
 * @returns {Array} nations
 */
export function generateNations(world, options = {}) {
  const {
    seed = world.seed + '-nations',
    count = null,
  } = options;

  const rng = makeRng(seed);
  world.forEach((t) => { t.owner = -1; });
  for (const province of world.provinces ?? []) {
    province.owner = -1;
    province.coreOf = -1;
  }

  if (!world.provinces?.length) {
    world.nations = [];
    return [];
  }

  // Arketip planı: her ülkenin ROLÜ, bölgesi ve province hedefi şablondan
  // gelir (bkz. macro.archetypePlan + docs/makro-dunya.md). Plan yalnız BÜYÜK
  // güçleri kurar; artan toprak sahipsiz bırakılmaz, doldurma geçişinde sınır
  // devletlerine ve kabile birliklerine bağlanır (bkz. fillRemaining).
  // `count` (menü kaydıracı) plan listesini kırpar: büyükler önce doğar.
  const plan = archetypePlan(rng);
  const specs = count != null ? plan.slice(0, Math.max(1, count)) : plan;
  const anchors = world.macroAnchors ?? {};
  const graph = {
    neighbors: (province) => province.neighbors.map((i) => world.provinces[i]),
  };
  const anchorTileOf = (zone) => {
    const anchor = anchors[zone];
    if (!anchor) return world.tiles[Math.floor(world.tiles.length / 2)];
    const col = Math.min(world.cols - 1, Math.max(0, Math.floor(anchor.u * world.cols)));
    const row = Math.min(world.rows - 1, Math.max(0, Math.floor(anchor.v * world.rows)));
    return world.tileAt(col, row);
  };
  const distanceToAnchor = (province, anchorTile) => world.wrapDistance(
    province.center.q, province.center.r, anchorTile.q, anchorTile.r,
  );
  const zoneAllowed = (province, spec) => province.zone === spec.zone
    || province.zone === 'acik-deniz';

  // Yerleşim: sırayla, bölge içinde çapaya en yakın uygun kümeden büyüme.
  const usedNames = new Set();
  const nations = [];
  const claimCluster = (province, nationId, core) => {
    province.owner = nationId;
    province.coreOf = core ? nationId : -1;
    for (const idx of province.tileIdx) world.tiles[idx].owner = nationId;
  };
  /** Ortak ülke kaydı: hem arketip güçler hem doldurma devletleri buradan doğar. */
  const makeNation = (seedProvince, role, dev, extraCity) => {
    const id = nations.length;
    const name = makeName(rng, usedNames);
    const palette = makeColor(id, rng);
    const nation = {
      id,
      name,
      fullName: `${name} ${rng.pick(TITLES)}`,
      color: palette.color,
      // Politik harita kipi ülke rengini arazi parlaklığıyla oynatabilsin.
      hue: palette.hue,
      sat: palette.sat,
      light: palette.light,
      flag: makeFlag(rng, palette),
      capital: seedProvince.center,
      culture: seedProvince.culture ?? -1,
      // Kabul edilen kültürler: birincil + (bileşik monarşi gibi) komşu halklar.
      accepted: [],
      archetype: role,
      devTier: dev ?? 0,
      extraCity: Boolean(extraCity),
      tiles: 0,
      provinces: 0,
      population: 0,
      coastal: false,
      aggression: rng.range(0.7, 1.4),
      focus: rng.pick(['economy', 'military', 'admin']),
    };
    nations.push(nation);
    return nation;
  };
  const growHome = (spec, seedProvince, nationId) => {
    const { assignment } = growRegions(graph, [seedProvince], {
      canEnter: (province) => province.owner === -1 && zoneAllowed(province, spec),
      stepCost: (province) => province.moveCost + rng.range(0, 2.2),
      budget: () => spec.provinces,
    });
    for (const [province] of assignment) claimCluster(province, nationId, true);
  };

  for (const spec of specs) {
    const anchorTile = anchorTileOf(spec.zone);
    const candidates = world.provinces.filter((province) => (
      province.owner === -1
      && province.zone === spec.zone
      && (!spec.coastal || province.coastal)
      && (province.tileIdx.length >= 3 || spec.zone.includes('adalar'))
    ));
    // Bölge doluysa (küçük harita, kırpılmış plan) ülke doğmaz; plan esnektir.
    if (!candidates.length) continue;
    candidates.sort((a, b) => distanceToAnchor(a, anchorTile) - distanceToAnchor(b, anchorTile));
    const seedProvince = candidates[0];
    const nation = makeNation(seedProvince, spec.role, spec.dev, spec.extraCity);
    const id = nation.id;
    growHome(spec, seedProvince, id);

    // Deniz aşırı koloni: Hindistan-benzeri yarımadanın büyük payı — çekirdek
    // DEĞİL, kültürü kabul edilmemiş, ama ekonomik olarak değerli.
    if (spec.colony) {
      const colonyAnchor = anchorTileOf(spec.colony.zone);
      const pool = world.provinces.filter(
        (province) => province.owner === -1 && province.zone === spec.colony.zone,
      );
      const target = Math.round(pool.length * spec.colony.share);
      if (target > 0 && pool.length) {
        pool.sort((a, b) => distanceToAnchor(a, colonyAnchor) - distanceToAnchor(b, colonyAnchor));
        const { assignment } = growRegions(graph, [pool[0]], {
          canEnter: (province) => province.owner === -1
            && province.zone === spec.colony.zone,
          stepCost: (province) => province.moveCost + rng.range(0, 1.4),
          budget: () => target,
        });
        for (const [province] of assignment) claimCluster(province, id, false);
      }
    }
    // Ada üsleri: deniz yolunun basamak taşları (tek küme, çekirdek değil).
    if (spec.bases) {
      const baseAnchor = anchorTileOf(spec.bases.zone);
      const pool = world.provinces.filter(
        (province) => province.owner === -1 && province.zone === spec.bases.zone,
      ).sort((a, b) => distanceToAnchor(a, baseAnchor) - distanceToAnchor(b, baseAnchor));
      for (const province of pool.slice(0, spec.bases.provinces)) {
        claimCluster(province, id, false);
      }
    }
    // Kabul edilen kültürler: ev topraklarında en yaygın yabancı halklar.
    const votes = new Map();
    for (const province of world.provinces) {
      if (province.coreOf !== id || province.culture < 0) continue;
      if (province.culture === nation.culture) continue;
      votes.set(province.culture, (votes.get(province.culture) ?? 0) + 1);
    }
    const acceptedNeighbors = [...votes.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, spec.acceptNeighbors ?? 0)
      .map(([cultureId]) => cultureId);
    nation.accepted = [nation.culture, ...acceptedNeighbors].filter((c) => c >= 0);
  }

  fillRemaining(world, nations, rng, { graph, makeNation, claimCluster });

  separateNeighborColors(world, nations, rng);
  computeStats(world, nations);

  world.nations = nations;
  return nations;
}

/**
 * Bölge başına tipik sınır devleti boyu (province). Doldurma kaç devlet
 * kuracağını buradan bilir: bozkırda gevşek ve iri hanlıklar, yoğun batıda
 * küçük prenslikler. Üst sınır denetimin bandını (<= 35 çekirdek) korur.
 */
const FILL_SIZE = {
  'yogun-bati': 10,
  'kavsak': 13,
  'dogu-ovasi': 18,
  'guney-yarimada': 15,
  'dogu-adalari': 12,
  'kuzey-bozkiri': 28,
  'guney-kita': 26,
  'yeni-kuzey': 26,
  'yeni-guney': 20,
  'kistak': 10,
  'korsan-adalari': 12,
  'baharat-adalari': 12,
  'acik-deniz': 12,
};
const FILL_SIZE_DEFAULT = 18;

/** Boyların ayarlandığı referans dünya: standart 160x96 ~700 province eder. */
const FILL_REFERENCE_PROVINCES = 700;
/** Doldurma devleti için üst sınır: denetimin okunurluk bandını korur. */
const FILL_MAX = 24;

/**
 * Bu boya kadar izole ada kümesi DEVLET kurmaz: en yakın kıyı ülkesinin deniz
 * aşırı toprağı olur. Eşik düşükken okyanus mikro devletlerle doluyordu
 * (ölçüldü: 20 ada beyliği, 15 ülke <= 2 province).
 */
const ISLAND_ABSORB = 12;
/** Bu boya kadar kara cebi de devlet kurmaz; komşusuna katılır. */
const POCKET_ABSORB = 3;

/** Doldurma devletinin rolü: bölge karakterine göre ad ve davranış çerçevesi. */
const FILL_ROLE = {
  'kuzey-bozkiri': 'bozkir-boyu',
  'guney-kita': 'kabile-birligi',
  'yeni-kuzey': 'sinir-konfederasyonu',
  'yeni-guney': 'sinir-konfederasyonu',
  'kistak': 'kistak-beyligi',
  'yogun-bati': 'bati-prensligi',
  'kavsak': 'kavsak-beyligi',
  'dogu-ovasi': 'dogu-beyligi',
  'guney-yarimada': 'yarimada-beyligi',
};
const FILL_ROLE_ISLAND = 'ada-beyligi';

/**
 * DOLDURMA GEÇİŞİ — sahipsiz toprak bırakmaz.
 *
 * Önceki tasarım dünyanın yarısından fazlasını boş bırakıyordu (ölçüldü:
 * karanın yalnız %35-38'i sahipli); politik harita gri bir levhaya dönüyordu.
 * Kolonizasyon gerilimi artık BOŞLUKLA değil ZAYIFLIKLA kurulur: sınır boyları
 * gelişmemiş, tek kültürlü, düşük gelişimli devletlerle dolar — büyük güç için
 * hâlâ av alanıdır ama harita yaşıyor görünür.
 *
 * Küçük ve izole ada kümeleri devlet kurmaz; en yakın kıyı ülkesinin deniz
 * aşırı toprağı olur (çekirdek değil) — yoksa okyanus tek province'lik
 * mikro devletlerle dolardı.
 */
function fillRemaining(world, nations, rng, { graph, makeNation, claimCluster }) {
  const provinces = world.provinces;
  const free = provinces.filter((p) => p.owner === -1);
  if (!free.length) return;
  const sizeFactor = (provinces.length / FILL_REFERENCE_PROVINCES) ** 0.6;
  // Devlet başına province sayacı: cep dağıtımı bandı bozmasın diye lazım.
  const size = new Map();
  for (const p of provinces) {
    if (p.owner >= 0) size.set(p.owner, (size.get(p.owner) ?? 0) + 1);
  }
  const give = (province, nationId, core) => {
    claimCluster(province, nationId, core);
    size.set(nationId, (size.get(nationId) ?? 0) + 1);
  };

  // Sahipsiz province'lerin bitişik kümeleri (kara komşuluğu; adalar ayrı düşer).
  const seen = new Set();
  const clusters = [];
  for (const start of free) {
    if (seen.has(start.id)) continue;
    const cluster = [start];
    seen.add(start.id);
    for (let head = 0; head < cluster.length; head++) {
      for (const n of graph.neighbors(cluster[head])) {
        if (n.owner !== -1 || seen.has(n.id)) continue;
        seen.add(n.id);
        cluster.push(n);
      }
    }
    clusters.push(cluster);
  }
  // Büyükten küçüğe: iri kütleler renk paletinin başını alsın. Eşitlikte
  // en küçük province kimliği — sıra tohumdan bağımsız ve kararlı kalır.
  clusters.sort((a, b) => b.length - a.length
    || Math.min(...a.map((p) => p.id)) - Math.min(...b.map((p) => p.id)));

  const dominantZone = (cluster) => {
    const votes = new Map();
    for (const p of cluster) votes.set(p.zone, (votes.get(p.zone) ?? 0) + 1);
    let best = null; let bestVotes = -1;
    for (const [zone, v] of votes) {
      if (v > bestVotes || (v === bestVotes && String(zone) < String(best))) {
        best = zone; bestVotes = v;
      }
    }
    return best;
  };
  const isIsland = (cluster) => cluster.every((p) => p.neighbors.every(
    (i) => provinces[i].owner === -1 || cluster.includes(provinces[i]),
  )) && cluster.every((p) => p.coastal);

  for (const cluster of clusters) {
    const zone = dominantZone(cluster);
    // Küçük ada kümesi: devlet değil, en yakın kıyı ülkesinin deniz aşırı toprağı.
    if (cluster.length <= ISLAND_ABSORB && isIsland(cluster)) {
      const host = nearestCoastalNation(world, cluster[0]);
      if (host >= 0) {
        for (const p of cluster) give(p, host, false);
        continue;
      }
    }
    // Karaya bitişik küçük cep: komşu devlete katılır, yeni bayrak açmaz.
    if (cluster.length <= POCKET_ABSORB) {
      const host = adjacentOwner(provinces, cluster, size);
      if (host >= 0) {
        for (const p of cluster) give(p, host, true);
        continue;
      }
    }
    // Devlet boyu harita boyuyla büyür (üsse 0.6): büyük dünya daha ÇOK değil
    // daha İRİ devlet doğurur. Aksi halde 200x160'ta ülke sayısı üçe katlanıp
    // tur maliyetini de üçe katlıyordu (ölçüldü: 124 ülke, 71 ms/hafta).
    const target = (FILL_SIZE[zone] ?? FILL_SIZE_DEFAULT) * sizeFactor;
    // Tavan da var: yayılma Voronoi olduğu için tek devlet kümenin yarısını
    // kapabiliyordu (ölçüldü: 49 province'lik sınır konfederasyonu).
    const states = Math.max(
      1,
      Math.round(cluster.length / target),
      Math.ceil(cluster.length / FILL_MAX),
    );
    const seeds = pickSpreadSeeds(world, cluster, states);
    const inCluster = new Set(cluster);
    // Kota şart: yayılma maliyet tabanlı olduğu için ova üzerindeki tohum
    // dağ üzerindekinin iki katını yutuyordu (ölçüldü: 8 devletlik kümede biri
    // 48 province). Kota tavanı koyar, artıklar aşağıda dengeli dağıtılır.
    // Kota şart: yayılma maliyet tabanlı olduğu için ova üzerindeki tohum dağ
    // üzerindekinin iki katını yutuyordu (ölçüldü: 8 devletlik kümede biri 48
    // province). Kotayı gevşetmek çare değil — kotayı büyütünce tek erişim
    // yolu olan uzantılar yine tek devlete akıyor; artıklar aşağıda en küçük
    // komşuya dağıtılır.
    const quota = Math.ceil(cluster.length / states) + 2;
    const { assignment } = growRegions(graph, seeds, {
      canEnter: (p) => p.owner === -1 && inCluster.has(p),
      stepCost: (p) => p.moveCost + rng.range(0, 2.0),
      budget: () => quota,
    });
    const role = (zone && FILL_ROLE[zone]) ?? FILL_ROLE_ISLAND;
    const born = seeds.map((seed) => makeNation(seed, role, 0, false));
    const counts = born.map(() => 0);
    for (const [province, region] of assignment) {
      claimCluster(province, born[region].id, true);
      counts[region]++;
    }
    // Kota yüzünden dışarıda kalanlar: her artık, komşu devletlerin EN KÜÇÜĞÜNE
    // katılır. Böylece küme tamamen dolar ve boylar birbirine yakın kalır.
    const index = new Map(born.map((n, i) => [n.id, i]));
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const p of cluster) {
        if (p.owner !== -1) continue;
        let best = -1; let bestCount = Infinity;
        for (const i of p.neighbors) {
          const owner = provinces[i].owner;
          const region = index.get(owner);
          if (region === undefined || counts[region] >= bestCount) continue;
          bestCount = counts[region];
          best = region;
        }
        if (best < 0) continue;
        claimCluster(p, born[best].id, true);
        counts[best]++;
        changed = true;
      }
      if (!changed) break;
    }
    // Hiçbir komşusu doldurulmamış artık (kopuk cep) ilk devlete yazılır.
    for (const p of cluster) {
      if (p.owner === -1) claimCluster(p, born[0].id, true);
    }
    for (const nation of born) nation.accepted = [nation.culture].filter((c) => c >= 0);
  }
}

/** Kümenin içinde birbirinden uzak `count` tohum: devletler üst üste doğmasın. */
function pickSpreadSeeds(world, cluster, count) {
  if (count <= 1) return [cluster[0]];
  const distance = (a, b) => world.wrapDistance(
    a.center.q, a.center.r, b.center.q, b.center.r,
  );
  const seeds = [cluster[0]];
  while (seeds.length < count) {
    let best = null; let bestDist = -1;
    for (const p of cluster) {
      if (seeds.includes(p)) continue;
      const d = Math.min(...seeds.map((s) => distance(s, p)));
      if (d > bestDist) { bestDist = d; best = p; }
    }
    if (!best) break;
    seeds.push(best);
  }
  return seeds;
}

/**
 * Kümeye komşu devletlerden EN KÜÇÜĞÜ. En çok temas edeni seçmek, zaten büyük
 * olan komşuyu daha da şişiriyordu (ölçüldü: planı 34 olan kuzey imparatorluğu
 * ceplerle 39'a çıkıyordu). Cep küçüğe gider: bant korunur.
 */
function adjacentOwner(provinces, cluster, size) {
  const seen = new Set();
  for (const p of cluster) {
    for (const i of p.neighbors) {
      const owner = provinces[i].owner;
      if (owner >= 0) seen.add(owner);
    }
  }
  let best = -1; let bestSize = Infinity;
  for (const owner of seen) {
    const n = size.get(owner) ?? 0;
    if (n < bestSize || (n === bestSize && owner < best)) { best = owner; bestSize = n; }
  }
  return best;
}

/** Ada kümesini sahiplenecek en yakın kıyı ülkesi (yoksa -1). */
function nearestCoastalNation(world, province) {
  let best = -1; let bestDist = Infinity;
  for (const other of world.provinces) {
    if (other.owner < 0 || !other.coastal) continue;
    const d = world.wrapDistance(
      province.center.q, province.center.r, other.center.q, other.center.r,
    );
    if (d < bestDist) { bestDist = d; best = other.owner; }
  }
  return best;
}

function computeStats(world, nations) {
  for (const n of nations) {
    n.tiles = 0;
    n.provinces = 0;
    n.population = 0;
    n.coastal = false;
  }
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    const n = nations[tile.owner];
    n.tiles++;
    n.population += Math.round(tile.terrain.yields.food * 2200 + tile.moisture * 400);
    if (tile.coastal) n.coastal = true;
  });
  for (const province of world.provinces ?? []) {
    if (province.owner >= 0) nations[province.owner].provinces++;
  }
  // Başkent nüfusu ayrıca ağırlıklı.
  for (const n of nations) n.population = Math.round(n.population * 1.15);
}
