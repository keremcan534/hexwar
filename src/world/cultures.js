// Kültür bölgeleri: makro bölge ailelerinden doğar (bkz. macro.ZONE_CULTURES).
// Yoğun-batı 3 kültür konuşur, güney kıtası 4 parçalı, doğu ovası 2 dev halk.
// Ülkeler bunların üstüne kurulduğu için sınırlar doğuştan "yapay" olur — bir
// ülkenin toprağında başka halkların yaşaması kuraldır, istisna değil.

import { makeRng } from '../core/rng.js';
import { growRegions, pickSeeds } from './regions.js';
import { DEFAULT_ZONE, ZONE_CULTURES, ZONE_FAMILY } from './macro.js';

const STEM = [
  'Ar', 'Ves', 'Kest', 'Morv', 'Dun', 'Sel', 'Tarn', 'Ilv', 'Gwen', 'Ozr',
  'Bask', 'Ren', 'Vol', 'Amr', 'Sirn', 'Kald', 'Hesh', 'Bran', 'Cor', 'Dral',
  'Eln', 'Fasq', 'Girn', 'Hald', 'Ith', 'Jarn', 'Kur', 'Lem', 'Mest', 'Nol',
  'Orv', 'Pesh', 'Quar', 'Rish', 'Serl', 'Thal', 'Urk', 'Varn', 'Wesh', 'Yrn',
];

/**
 * Ek dil ailesine bağlıdır: aynı ailenin halkları akraba duyulsun. Bir aileyi
 * haritada duymak, o bölgenin tek bir dil kuşağı olduğunu adlardan anlatır.
 */
const FAMILY_TAIL = {
  Valdic: ['en', 'ir', 'and', 'mar', 'eth'],
  Torvic: ['ov', 'sk', 'ur', 'yn', 'grad'],
  Sarnic: ['ani', 'esh', 'iya', 'ar', 'un'],
  Eshan: ['ai', 'shan', 'ur', 'ei', 'ang'],
  Meridic: ['ia', 'os', 'ene', 'ora', 'is'],
  Norric: ['heim', 'vik', 'fjor', 'ard', 'ness'],
  Aurenic: ['iel', 'aun', 'ore', 'ael', 'wyn'],
  Zanhari: ['ka', 'mbo', 'zai', 'ande', 'iri'],
  Kelani: ['lai', 'nu', 'tara', 'oa', 'sim'],
};
const DEFAULT_TAIL = ['en', 'ani', 'ir', 'oy', 'ash', 'uk', 'iel', 'ar', 'os', 'une'];

/**
 * Kültür renkleri ülke paletinden ayrı: harita kipinde karışmasınlar.
 * Ton adımı 97 yerine altın oran: kültür sayısı ikiye katlandığında 97'lik
 * adım 360'ta devrederken komşu indeksleri neredeyse aynı renge düşürüyordu.
 * Doygunluk ve açıklık aileye göre hafifçe kayar — akraba halklar akraba
 * tonlarda okunur ama birbirinden ayırt edilir.
 */
function cultureColor(index, family, rng) {
  const hue = (index * 137.508 + rng.range(0, 12)) % 360;
  // Ton TEK BAŞINA yetmez: 38 kültür 360 dereceye yayılınca iki halk ~10
  // derece yakınına düşebiliyor ve özellikle azınlık taramasında çizgi
  // zemine karışıyordu. Doygunluk ve açıklık ayrı çevrimlerde döner (4 ve 5
  // adım, aralarında ortak bölen yok): ton yakın çıksa bile değer farkı
  // ikisini ayırır.
  const sat = 34 + (index % 4) * 7;
  const light = 44 + (index % 5) * 6;
  return { color: `hsl(${hue.toFixed(0)} ${sat}% ${light}%)`, hue, sat, light };
}

function cultureName(rng, used, family) {
  const tails = FAMILY_TAIL[family] ?? DEFAULT_TAIL;
  for (let i = 0; i < 60; i++) {
    const name = rng.pick(STEM) + rng.pick(tails);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `Culture-${used.size + 1}`;
}

/**
 * Dünyaya kültür bölgeleri yerleştirir; her kara karesine `culture` yazar.
 * @returns {Array} cultures
 */
export function generateCultures(world, rng, options = {}) {
  const land = world.tiles.filter((t) => !t.terrain.water && t.terrain.passable);
  world.forEach((t) => { t.culture = -1; });
  if (!land.length) {
    world.cultures = [];
    return [];
  }

  // Tohumlar makro bölge ailelerinden: bölge başına ZONE_CULTURES kadar,
  // bölge içinde birbirinden uzak. Küçük haritada bölge cılız kalırsa
  // (kara payı düşükse) tohum sayısı bölge karesine göre kısılır.
  const seeds = [];
  const byZone = new Map();
  for (const tile of land) {
    const zone = tile.zone ?? DEFAULT_ZONE;
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(tile);
  }
  const zoneOrder = [...byZone.keys()].sort();
  for (const zone of zoneOrder) {
    const tiles = byZone.get(zone);
    const want = options.count != null
      ? 1
      : Math.max(1, Math.min(ZONE_CULTURES[zone] ?? 1, Math.floor(tiles.length / 30) || 1));
    seeds.push(...pickSeeds(
      tiles,
      want,
      rng,
      (a, b) => world.wrapDistance(a.q, a.r, b.q, b.r),
      Math.max(4, Math.floor(Math.sqrt(tiles.length / want))),
    ));
  }

  const { assignment, counts } = growRegions(world, seeds, {
    // Kültürler denizi aşar: yoksa her ada kendi başına kültürsüz kalıyor.
    canEnter: (tile) => tile.terrain.passable || tile.terrain.navigable,
    // Bölge dışına yayılmak pahalı: aileler kendi coğrafyasında kalır ama
    // sınır boylarında iç içe geçebilir (Vic2'nin karışık kuşakları).
    stepCost: (tile, i) => {
      const base = tile.terrain.water ? 3 : 1 + rng.range(0, 1.6);
      return tile.terrain.water || tile.zone === seeds[i].zone ? base : base + 2.2;
    },
  });

  const used = new Set();
  const cultures = seeds.map((tile, i) => {
    const family = ZONE_FAMILY[tile.zone ?? DEFAULT_ZONE] ?? 'Valdic';
    const palette = cultureColor(i, family, rng);
    return {
      id: i,
      name: cultureName(rng, used, family),
      // Dil ailesi: karışma kolaylığını belirler (bkz. mixCultures) ve akraba
      // halkların adlarını aynı ekle bitirir.
      family,
      color: palette.color,
      hue: palette.hue,
      sat: palette.sat,
      light: palette.light,
      origin: tile,
      tiles: 0,
    };
  });

  for (const [tile, id] of assignment) {
    if (tile.terrain.water) continue; // deniz sadece geçit, kültürü yok
    tile.culture = id;
    cultures[id].tiles++;
  }
  // Ulaşılamayan kara (kapalı iç bölge) en yakın kültüre yazılır.
  world.forEach((tile) => {
    if (tile.terrain.water || tile.culture >= 0 || !tile.terrain.passable) return;
    let bestId = 0;
    let bestDist = Infinity;
    for (const c of cultures) {
      const d = world.wrapDistance(c.origin.q, c.origin.r, tile.q, tile.r);
      if (d < bestDist) { bestDist = d; bestId = c.id; }
    }
    tile.culture = bestId;
    cultures[bestId].tiles++;
  });

  world.cultures = cultures;
  world.cultureCounts = counts;
  return cultures;
}

/* --------------------------------------------------------------------------
   KARIŞIM — province başına kültür bileşimi

   Kültür bölgeleri temiz bloklar hâlinde büyür; gerçek atlas öyle değildir.
   Aşağıdaki iki geçiş o temizliği BOZAR:

   1. Sızma: her province komşularının halkından pay alır. Aynı dil ailesi
      kolay karışır, yabancı aile zor — sınır kuşakları gradyan olur.
   2. Kırılmış kültür: bir zamanlar geniş olan birkaç halk seçilir, çoğunluğu
      yalnız iki-üç kümede bırakılır, eski menzilinin kalanında AZINLIĞA
      düşer. Haritada "burası eskiden onlarındı" hissi bundan gelir.

   İkisi de province düzeyinde çalışır: oyunun nüfus birimi odur ve kare
   düzeyinde karışım simülasyonda temsil edilemez.
   -------------------------------------------------------------------------- */

/** Payları toplamı 1 olacak şekilde normalize eder, cılızları atar. */
function normalizeMix(mix, floor = 0.04) {
  let total = 0;
  for (const share of mix.values()) total += share;
  if (total <= 0) return [];
  const rows = [];
  for (const [id, share] of mix) {
    const value = share / total;
    if (value >= floor) rows.push({ id, share: value });
  }
  if (!rows.length) return [];
  const kept = rows.reduce((sum, row) => sum + row.share, 0);
  for (const row of rows) row.share /= kept;
  // Çoğunluk başta; eşitlikte küçük id kazanır ki üretim deterministik kalsın.
  rows.sort((a, b) => b.share - a.share || a.id - b.id);
  return rows;
}

/** Kümenin bileşimini yazar ve kare rengini çoğunluğa çeker. */
function commitMix(world, province, rows) {
  province.cultures = rows;
  province.culture = rows[0]?.id ?? -1;
  for (const idx of province.tileIdx) world.tiles[idx].culture = province.culture;
}

/** Sınır sızması: komşunun halkı buraya da bulaşır. */
function diffuse(world, rng) {
  const provinces = world.provinces;
  const familyOf = (id) => world.cultures[id]?.family;
  // Bütün kümeler AYNI ANDA okunur: sırayla güncellenirse ilk işlenen
  // kümenin yeni bileşimi sonrakine girdi olur ve sızma haritanın bir
  // ucundan öbürüne akar.
  const next = provinces.map((province) => {
    if (province.culture < 0) return null;
    const mix = new Map();
    for (const row of province.cultures) mix.set(row.id, row.share);
    for (const neighborId of province.neighbors) {
      const neighbor = provinces[neighborId];
      if (!neighbor || neighbor.culture < 0) continue;
      for (const row of neighbor.cultures) {
        const kin = familyOf(row.id) === familyOf(province.culture);
        const bleed = row.share * (kin ? 0.30 : 0.11) * rng.range(0.45, 1.55);
        mix.set(row.id, (mix.get(row.id) ?? 0) + bleed);
      }
    }
    return normalizeMix(mix);
  });
  provinces.forEach((province, i) => {
    if (next[i]?.length) commitMix(world, province, next[i]);
  });
}

/**
 * Kırılmış kültürler: eskiden geniş, şimdi iki-üç kümede çoğunluk.
 *
 * Aday ne dev ne cılız olmalı — devi parçalamak haritayı boşaltır, cılızın
 * zaten dağılacak toprağı yoktur.
 */
function shatter(world, rng) {
  const provinces = world.provinces;
  const owned = new Map();
  for (const province of provinces) {
    if (province.culture < 0) continue;
    if (!owned.has(province.culture)) owned.set(province.culture, []);
    owned.get(province.culture).push(province);
  }
  const candidates = [...owned].filter(([, list]) => list.length >= 5 && list.length <= 26);
  if (!candidates.length) return [];
  rng.shuffle(candidates);
  const count = Math.max(1, Math.min(4, Math.round(world.cultures.length / 9)));
  const broken = [];

  for (const [id, list] of candidates.slice(0, count)) {
    const origin = world.cultures[id].origin;
    const byHome = [...list].sort((a, b) => (
      world.wrapDistance(origin.q, origin.r, a.center.q, a.center.r)
      - world.wrapDistance(origin.q, origin.r, b.center.q, b.center.r)
    ));
    const keep = 2 + rng.int(0, 1);
    const lost = byHome.slice(keep);
    if (!lost.length) continue;
    let demoted = 0;
    for (const province of lost) {
      // Yeni çoğunluk komşulardan gelir: fetheden halk yandaki halktır,
      // haritanın öbür ucundaki değil.
      const votes = new Map();
      for (const neighborId of province.neighbors) {
        const neighbor = provinces[neighborId];
        if (!neighbor || neighbor.culture < 0 || neighbor.culture === id) continue;
        for (const row of neighbor.cultures) {
          if (row.id === id) continue;
          votes.set(row.id, (votes.get(row.id) ?? 0) + row.share);
        }
      }
      if (!votes.size) continue;
      let winner = -1;
      let best = -1;
      for (const [candidate, weight] of votes) {
        if (weight > best || (weight === best && candidate < winner)) {
          winner = candidate;
          best = weight;
        }
      }
      if (winner < 0) continue;
      // Eski halk silinmez, azınlığa düşer — kalıntı payı yerden yere değişir.
      const residue = rng.range(0.16, 0.44);
      const mix = new Map();
      for (const row of province.cultures) {
        if (row.id !== id) mix.set(row.id, row.share * (1 - residue));
      }
      mix.set(winner, (mix.get(winner) ?? 0) + (1 - residue));
      mix.set(id, residue);
      commitMix(world, province, normalizeMix(mix));
      demoted++;
    }
    if (demoted) {
      broken.push({ culture: id, name: world.cultures[id].name, kept: keep, demoted });
    }
  }
  return broken;
}

/**
 * Province bileşimlerini karıştırır. `generateProvinces`ten SONRA çağrılır:
 * kümeler ve komşulukları kurulmuş olmalı. Kendi rng dalını kullanır, ana
 * üretim akışını kaydırmaz.
 */
export function mixCultures(world) {
  if (!world.provinces?.length || !world.cultures?.length) return;
  const rng = makeRng(`${world.seed}-culture-mix`);
  diffuse(world, rng);
  const broken = shatter(world, rng);
  // Sayaçlar bileşimden yeniden kurulur: bir kültürün "toprağı" artık yalnız
  // çoğunluk olduğu kareler değil, azınlık payının karşılığı da dahil.
  for (const culture of world.cultures) {
    culture.tiles = 0;
    culture.presence = 0;
  }
  for (const province of world.provinces) {
    const hexes = province.tileIdx.length;
    for (const row of province.cultures ?? []) {
      world.cultures[row.id].presence += hexes * row.share;
      if (row.id === province.culture) world.cultures[row.id].tiles += hexes;
    }
  }
  // ANA YURT. Kümenin DOĞUŞ çoğunluğu o halkın ana yurdudur ve oyun boyunca
  // değişmez: fetih bir halkın yurdunu taşımaz. Asimilasyon (bkz. game/culture.js)
  // yalnız DİASPORAYI eritir — kendi yurdunda kimse erimez.
  //
  // Ölçüm gerekçesi: bu alan yokken dünya 50 yılda homojenleşiyordu (yabancı
  // halk payı %41,3 → %6,0) ve yüzyılın sonunda kültür freni tutunacak hiçbir
  // şey bulamıyordu. Yani mekanik, oyuncunun EN ÇOK fethettiği dönemde en zayıf
  // oluyordu; milliyetçilik çağının tersi.
  for (const province of world.provinces) province.homeland = province.culture;
  world.cultureCounts = world.cultures.map((c) => c.tiles);
  // Üretim karnesi: denetim betikleri okur, oyun okumaz.
  world.cultureHistory = broken;
}
