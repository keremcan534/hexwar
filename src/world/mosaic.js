// ETNİK MOZAİK — halk haritasının karmaşası (cultureGen 2, 2026-11-23).
//
// NEDEN. Kerem: "büyük maplerde kültür mapi aşırı az kültürle doğuyor, tek
// kültür onlarca ülkeyi içine alıyor, karmaşıklık ve etnik kaos yok". Ölçüm
// (culture-diversity-audit, 3 tohum): 240×144'te 55 halk 103 ulusa düşüyor, bir
// halk 11-14 ulusun state'lerinde çoğunluk; azınlık payı %8.9, yama %7.5.
// Kültür tohumu alanla çoğalır (cultures.cultureScale); bu dosya tohumun
// veremediği DOKUYU ekler:
//
//   ulustan önce  yama kuşağı (Balkan/Kafkas: üç halkın buluştuğu engebede iki-
//                 üç kümelik küçük halklar), diaspora (uzak liman ve büyük
//                 kümelerde tüccar halk satırı), ada azınlığı (karşı kıyının halkı)
//   ulustan sonra kardeş halklar (dörtten çok ulusun ana halkı olan halk 1-4
//                 ulusluk lehçe halklarına bölünür, sınırda karışık şerit) ve
//                 imparatorluk cepleri (kalpte tebaa halkı adacığı)
//
// Ulus-devlet KORUNUR: kardeş halk bölmesi ulus sınırını izler, ana halkı
// değiştirmez, yalnız adını. Kültür sayısını her yerde artırmak ulus-
// devletleri yıkıyordu (peoples.js başlığı: ×2 tohumda ≥ %85 tek halklı ulus
// 27-30 → 13); burada çeşitlilik sınırda, kuşakta ve cepte birikir.
//
// Her geçişin kendi zar dalı var: ana üretim, bölümleme ve ulus yerleşimi
// kaymaz. Katman: world. DOM yok, game yok.

import { makeRng } from '../core/rng.js';
import { cultureName, normalizeMix } from './cultures.js';
import { paint, recountCultures, separateStripes, SUBJECT_PEOPLES } from './peoples.js';
import { ZONE_FAMILY } from './macro.js';

export const MOSAIC = {
  /** Standart dünyanın alanı: aşağıdaki sayılar bu boyda ayarlandı. */
  STANDARD_AREA: 160 * 96,
  /** Yama kuşağı sayısı standart boyda; alanla çoğalır, en az bir. */
  BELTS: 2,
  BELT_SIZE: [9, 13],
  /** Kuşakta halk başına küme: iki-üç kümelik halk (tek kümelik halkın hareketi anlamsız). */
  BELT_PER_PEOPLE: 2.6,
  /**
   * Kuşak halkının kendi kümesindeki payı; eski halk kalanı taşır. 0.52-0.72
   * ve komşu payıyla eski halk kümenin %28-48'inde kalıyordu: küme yeni halkın
   * yurdu olarak değil yarı yarıya bölünmüş okunuyordu.
   */
  BELT_SHARE: [0.62, 0.80],
  BELT_BLEED: [0.06, 0.14],
  /** İki kuşağın merkezleri arası en az hex: ikisi aynı dağa düşmesin. */
  BELT_SPACING: 16,
  /** Kuşak engebeli ve geniş karada doğar (Balkan yarımadası, Kafkas kıstağı). */
  BELT_MIN_LAND: 150,
  /** Kuşak halklarının bu payı uzak bir dil ailesinden gelir (Türk/Macar adacığı). */
  BELT_FOREIGN: 0.25,
  /** Diaspora halkı sayısı standart boyda; alanla çoğalır, en az bir. */
  DIASPORA_PEOPLES: 2,
  DIASPORA_HOSTS: [6, 9],
  DIASPORA_SHARE: [0.06, 0.16],
  /** Diaspora yurdundan en az bu kadar hex uzakta: komşu sızması zaten var. */
  DIASPORA_MIN_DIST: 10,
  /** Kaynak halkın yurdu (çoğunluk kümesi): ne dev ne cılız. */
  DIASPORA_HOME: [3, 30],
  /**
   * Ada = en çok bu kadar kümelik kara kütlesi. Hex sınırı (80) Earth'te
   * Britanya'yı da ada sayıp ona karşı kıyının halkından %12-30 veriyordu; 3
   * küme ise prosedürel dünyada hiç ada bırakmıyordu (160×96: 0).
   */
  ISLAND_PROVINCES: 5,
  ISLAND_CHANCE: 0.6,
  ISLAND_SHARE: [0.12, 0.30],
  /** Karşı kıyı bu kadar hexten uzaksa ada kendi başınadır. */
  ISLAND_REACH: 16,
  /**
   * Bir halk en çok bu kadar ulusun ana halkı kalır (kardeş halk bölmesi) ve
   * grubun hedef ulus sayısı (uçlar dahil; komşusu yoksa 1'e düşer). 3 ve 2-3
   * ile 160×96'da 45 yılda ulus sayısı tohum başına ~6 fazla bitiyordu: soydaş
   * bağı koptukça barışçıl birleşme ve soydaşa bırakma azalıyor
   * (border-change-audit, bölmesiz koluna karşı).
   */
  KIN_MAX: 4,
  KIN_GROUP: [3, 4],
  /** Kardeş halkların sınırında komşunun payı (lehçe sürekliliği). */
  KIN_BLEED_CHANCE: 0.6,
  KIN_BLEED: [0.08, 0.20],
  /** İmparatorluk cebi: kalpte tebaa halkının adacığı. */
  POCKETS: [1, 3],
  POCKET_SHARE: [0.22, 0.40],
  FLOOR: 0.04,
};

const rowsOf = (province) => (province.cultures?.length
  ? province.cultures
  : (province.culture >= 0 ? [{ id: province.culture, share: 1 }] : []));

const areaRatio = (world) => (world.cols * world.rows) / MOSAIC.STANDARD_AREA;
const countFor = (world, base) => Math.max(1, Math.round(base * areaRatio(world)));
const distOf = (world) => (a, b) => world.wrapDistance(a.center.q, a.center.r, b.center.q, b.center.r);

/** Bileşimi yazar; kare kültürü ve üretim tabanı çoğunluğa çekilir. */
function commit(world, province, rows, homeland) {
  if (!rows.length) return;
  province.cultures = rows;
  province.culture = rows[0].id;
  if (homeland) province.homeland = province.culture;
  for (const idx of province.tileIdx) {
    const tile = world.tiles[idx];
    tile.culture = province.culture;
    tile.baseCulture = province.culture;
  }
}

/** Kümeye `share` payında `people` satırı açar, diğerleri orantılı küçülür. */
function blend(province, people, share) {
  const mix = new Map();
  for (const row of rowsOf(province)) mix.set(row.id, row.share * (1 - share));
  mix.set(people, (mix.get(people) ?? 0) + share);
  return normalizeMix(mix, MOSAIC.FLOOR);
}

/** Yeni halk kaydı: ad aileden, renk komşulardan ayrık (peoples.paint). */
function addPeople(world, family, origin, rng, used, nearIds) {
  const cultures = world.cultures;
  const id = cultures.length;
  const near = [...nearIds].map((c) => cultures[c]).filter(Boolean);
  const palette = paint(id, family, rng, near);
  cultures.push({
    id,
    name: cultureName(rng, used, family),
    family,
    color: palette.color,
    hue: palette.hue,
    sat: palette.sat,
    light: palette.light,
    origin,
    tiles: 0,
    presence: 0,
  });
  return id;
}

/** Kümenin ve komşularının bütün halkları (renk ayrımının komşu listesi). */
function nearPeoples(world, list, extra = []) {
  const provinces = world.provinces;
  const near = new Set(extra);
  for (const p of list) {
    for (const row of rowsOf(p)) near.add(row.id);
    for (const i of p.neighbors) for (const row of rowsOf(provinces[i])) near.add(row.id);
  }
  return near;
}

/**
 * Küme listesini k bitişik gruba böler: en uzak nokta tohumları, sonra her
 * turda en küçük grup bitişik en ucuz boş kümeyi alır (peoples.groupRest'in
 * sade hâli; burada liste tek parçadır). İki kümenin altındaki grup komşusuna
 * katılır.
 */
function partition(world, list, k, rng) {
  const provinces = world.provinces;
  const dist = distOf(world);
  const inList = new Set(list);
  const seeds = [list[0]];
  while (seeds.length < k) {
    let best = null;
    let bestD = -1;
    for (const p of list) {
      if (seeds.includes(p)) continue;
      const d = Math.min(...seeds.map((s) => dist(s, p)));
      if (d > bestD || (d === bestD && p.id < best.id)) {
        bestD = d;
        best = p;
      }
    }
    if (!best) break;
    seeds.push(best);
  }
  const groups = seeds.map((s) => [s]);
  const groupOf = new Map(seeds.map((s, i) => [s, i]));
  const jitter = new Map(list.map((p) => [p, p.moveCost + rng.range(0, 1.6)]));
  for (;;) {
    let moved = false;
    const turn = groups.map((_, i) => i).sort((x, y) => groups[x].length - groups[y].length || x - y);
    for (const gi of turn) {
      let best = null;
      for (const p of groups[gi]) {
        for (const i of p.neighbors) {
          const n = provinces[i];
          if (!inList.has(n) || groupOf.has(n)) continue;
          if (!best || jitter.get(n) < jitter.get(best)
            || (jitter.get(n) === jitter.get(best) && n.id < best.id)) best = n;
        }
      }
      if (!best) continue;
      groups[gi].push(best);
      groupOf.set(best, gi);
      moved = true;
    }
    if (!moved) break;
  }
  for (let gi = 0; gi < groups.length; gi++) {
    if (groups[gi].length >= 2) continue;
    let target = -1;
    for (const p of groups[gi]) {
      for (const i of p.neighbors) {
        const other = groupOf.get(provinces[i]);
        if (other === undefined || other === gi || !groups[other].length) continue;
        if (target < 0 || groups[other].length < groups[target].length) target = other;
      }
    }
    if (target < 0) continue;
    for (const p of groups[gi]) {
      groups[target].push(p);
      groupOf.set(p, target);
    }
    groups[gi] = [];
  }
  return groups.filter((g) => g.length >= 2);
}

/* ---------------------------------------------------------- ULUSTAN ÖNCE --- */

/**
 * YAMA KUŞAĞI. Üç ve daha çok halkın iki komşuluk halkasında buluştuğu,
 * engebeli ve kavşak bölgesine yakın kümede doğar. Kuşak iki-üç kümelik
 * halklara bölünür; her küme kendi halkında çoğunluk ama komşu kuşak halkından
 * belirgin pay taşır. Halkların çoğu kuşağın eski halkının dil ailesinden,
 * dörtte biri uzak bir aileden (kuşağa göçmüş halk).
 */
function patchwork(world, rng, used) {
  const provinces = world.provinces;
  const cultures = world.cultures;
  const want = countFor(world, MOSAIC.BELTS);
  const scored = [];
  for (const p of provinces) {
    if (p.culture < 0 || p.neighbors.length < 2) continue;
    if ((world.continentSizes?.[p.center.continent] ?? 0) < MOSAIC.BELT_MIN_LAND) continue;
    const ring = new Set([p.culture]);
    for (const i of p.neighbors) {
      const n = provinces[i];
      if (n.culture >= 0) ring.add(n.culture);
      for (const j of n.neighbors) if (provinces[j].culture >= 0) ring.add(provinces[j].culture);
    }
    if (ring.size < 3) continue;
    const rough = Math.min(1.5, Math.max(0, p.moveCost - 1));
    scored.push({ p, score: ring.size + (p.zone === 'kavsak' ? 1.5 : 0) + rough + rng.range(0, 1.2) });
  }
  scored.sort((a, b) => b.score - a.score || a.p.id - b.p.id);
  const dist = distOf(world);
  const taken = new Set();
  const centers = [];
  const report = [];
  const families = [...new Set(Object.values(ZONE_FAMILY))].sort();
  for (const { p } of scored) {
    if (report.length >= want) break;
    if (taken.has(p) || centers.some((c) => dist(c, p) < MOSAIC.BELT_SPACING)) continue;
    // Kuşak: kavşaktan dışa, engebeye ve zara göre en ucuz kümeler.
    const size = rng.int(MOSAIC.BELT_SIZE[0], MOSAIC.BELT_SIZE[1]);
    const belt = [p];
    const inBelt = new Set(belt);
    const cost = new Map([[p, 0]]);
    while (belt.length < size) {
      let best = null;
      let bestCost = Infinity;
      for (const q of belt) {
        for (const i of q.neighbors) {
          const n = provinces[i];
          if (inBelt.has(n) || taken.has(n) || n.culture < 0) continue;
          const c = cost.get(q) + 1 + rng.range(0, 1.2) - Math.min(0.6, Math.max(0, n.moveCost - 1) * 0.4);
          if (c < bestCost || (c === bestCost && n.id < best.id)) {
            bestCost = c;
            best = n;
          }
        }
      }
      if (!best) break;
      belt.push(best);
      inBelt.add(best);
      cost.set(best, bestCost);
    }
    if (belt.length < 6) continue;
    const k = Math.max(3, Math.round(belt.length / MOSAIC.BELT_PER_PEOPLE));
    const groups = partition(world, belt, k, rng);
    if (groups.length < 2) continue;
    centers.push(p);
    for (const q of belt) taken.add(q);
    // Grupların yarısı yeni halk, yarısı eski halkın adacığı (tek-çift sırayla,
    // kavşak grubu yeni). Hepsi yeni halk olunca kuşak başına 4-5 küçük ayrılıkçı
    // halk doğuyordu: 160×96'da 45 yılda kuşaklar ulus sayısına tohum başına ~7
    // ekliyordu (border-change-audit, kuşaksız koluna karşı). Eski halkın adacığı
    // yine yamadır: komşu yeni halktan pay alır.
    const made = [];
    const kept = [];
    groups.forEach((group, gi) => {
      if (gi % 2 === 1) {
        kept.push(group);
        return;
      }
      // Grubun eski çoğunluk halkı ailesini verir; uzak aile kuşağa göçmüştür.
      const weight = new Map();
      for (const q of group) for (const row of rowsOf(q)) weight.set(row.id, (weight.get(row.id) ?? 0) + row.share * q.tileIdx.length);
      let old = -1;
      for (const [id, w] of weight) if (old < 0 || w > weight.get(old) || (w === weight.get(old) && id < old)) old = id;
      const own = cultures[old]?.family ?? ZONE_FAMILY[p.zone] ?? 'Valdic';
      const family = gi > 0 && rng.chance(MOSAIC.BELT_FOREIGN)
        ? rng.pick(families.filter((f) => f !== own)) ?? own
        : own;
      const origin = [...group].sort((a, b) => b.tileIdx.length - a.tileIdx.length || a.id - b.id)[0];
      const people = addPeople(world, family, origin.center, rng, used,
        nearPeoples(world, group, made.map((m) => m.people)));
      made.push({ people, provinces: group });
    });
    // Bileşim: kendi halkı çoğunluk, eski halk kalıntı, bitişik yeni halk pay.
    const groupOf = new Map();
    made.forEach((m, gi) => { for (const q of m.provinces) groupOf.set(q, gi); });
    const bleedInto = (q, mix, own) => {
      const touch = new Set();
      for (const i of q.neighbors) {
        const other = groupOf.get(provinces[i]);
        if (other !== undefined && made[other].people !== own) touch.add(made[other].people);
      }
      for (const other of [...touch].sort((a, b) => a - b)) {
        mix.set(other, (mix.get(other) ?? 0) + rng.range(MOSAIC.BELT_BLEED[0], MOSAIC.BELT_BLEED[1]));
      }
    };
    for (const m of made) {
      for (const q of m.provinces) {
        const share = rng.range(MOSAIC.BELT_SHARE[0], MOSAIC.BELT_SHARE[1]);
        const mix = new Map();
        for (const row of rowsOf(q)) mix.set(row.id, row.share * (1 - share));
        mix.set(m.people, share);
        bleedInto(q, mix, m.people);
        let rows = normalizeMix(mix, MOSAIC.FLOOR);
        // Kendi halkı her kümede çoğunluk kalmalı: bitişik pay onu geçerse kırpılır.
        if (rows[0].id !== m.people) {
          const fixed = new Map(rows.map((row) => [row.id, row.share]));
          fixed.set(m.people, rows[0].share + 0.05);
          rows = normalizeMix(fixed, MOSAIC.FLOOR);
        }
        commit(world, q, rows, true);
      }
    }
    for (const group of kept) {
      for (const q of group) {
        const mix = new Map(rowsOf(q).map((row) => [row.id, row.share]));
        bleedInto(q, mix, -1);
        const rows = normalizeMix(mix, MOSAIC.FLOOR);
        // Adacık eski halkın yurdu kalır: pay çoğunluğu çevirirse dokunulmaz.
        if (rows[0]?.id === q.culture) commit(world, q, rows, false);
      }
    }
    report.push({ center: p.id, provinces: belt.length, peoples: made.map((m) => m.people) });
  }
  return report;
}

/**
 * DİASPORA. Orta boy bir halk (yurdu 3-30 küme) uzak limanlarda ve büyük
 * kümelerde satır bulur: tüccar ve göçmen halklar. Pay çoğunluğu çevirmez,
 * ana yurt yerinde kalır; asimilasyon (game/culture.js) yalnız diasporayı
 * eritir, yani bu satırlar kampanya boyunca yavaşça söner.
 */
function scatter(world, rng) {
  const provinces = world.provinces;
  const cultures = world.cultures;
  const homes = new Map();
  for (const p of provinces) {
    if (p.culture < 0) continue;
    if (!homes.has(p.culture)) homes.set(p.culture, []);
    homes.get(p.culture).push(p);
  }
  const pool = [...homes]
    .filter(([, list]) => list.length >= MOSAIC.DIASPORA_HOME[0] && list.length <= MOSAIC.DIASPORA_HOME[1])
    .sort((a, b) => a[0] - b[0]);
  rng.shuffle(pool);
  const want = countFor(world, MOSAIC.DIASPORA_PEOPLES);
  const dist = distOf(world);
  const hostsPer = Math.max(1, Math.sqrt(areaRatio(world)));
  const report = [];
  const families = new Set();
  for (const [id, home] of pool) {
    if (report.length >= want) break;
    // Aynı aileden iki tüccar halk seçilmez: diaspora dünyaya yayılsın.
    if (families.has(cultures[id].family) && pool.length > want * 2) continue;
    const candidates = provinces.filter((p) => p.culture >= 0 && p.culture !== id
      && !rowsOf(p).some((row) => row.id === id)
      && home.every((h) => dist(h, p) >= MOSAIC.DIASPORA_MIN_DIST));
    if (!candidates.length) continue;
    // Liman ve büyük küme önce: diaspora şehirde yaşar.
    const weight = (p) => p.tileIdx.length * (p.coastal ? 2 : 1);
    const hosts = [];
    const count = Math.round(rng.int(MOSAIC.DIASPORA_HOSTS[0], MOSAIC.DIASPORA_HOSTS[1]) * hostsPer);
    let total = candidates.reduce((sum, p) => sum + weight(p), 0);
    while (hosts.length < count && candidates.length) {
      let roll = rng() * total;
      let index = 0;
      while (index < candidates.length - 1 && roll >= weight(candidates[index])) {
        roll -= weight(candidates[index]);
        index++;
      }
      const host = candidates.splice(index, 1)[0];
      total -= weight(host);
      hosts.push(host);
    }
    for (const host of hosts) {
      const top = rowsOf(host)[0]?.share ?? 1;
      const share = Math.min(rng.range(MOSAIC.DIASPORA_SHARE[0], MOSAIC.DIASPORA_SHARE[1]), 0.9 * top / (1 + top));
      commit(world, host, blend(host, id, share), false);
    }
    families.add(cultures[id].family);
    report.push({ culture: id, hosts: hosts.map((h) => h.id) });
  }
  return report;
}

/**
 * ADA AZINLIĞI. Küçük kara kütlesi karşı kıyının (en yakın başka kütle, başka
 * halk) halkından pay alır: yerleşimci ya da eski halkın kalıntısı. Kültür
 * büyümesi denizi aştığı için adalar çoğu zaman kıyının halkındaydı ve yalnız
 * renk olarak "aynı ülkenin parçası" okunuyordu.
 */
function islands(world, rng) {
  const provinces = world.provinces;
  const byIsland = new Map();
  const landmass = new Map();
  for (const p of provinces) {
    const c = p.center.continent;
    landmass.set(c, (landmass.get(c) ?? 0) + 1);
    if (p.culture < 0 || c < 0) continue;
    if (!byIsland.has(c)) byIsland.set(c, []);
    byIsland.get(c).push(p);
  }
  for (const [c] of byIsland) if (landmass.get(c) > MOSAIC.ISLAND_PROVINCES) byIsland.delete(c);
  const dist = distOf(world);
  const report = [];
  for (const [continent, list] of [...byIsland].sort((a, b) => a[0] - b[0])) {
    if (!rng.chance(MOSAIC.ISLAND_CHANCE)) continue;
    const own = list[0].culture;
    let best = null;
    let bestD = Infinity;
    for (const p of provinces) {
      if (p.culture < 0 || p.culture === own || p.center.continent === continent) continue;
      for (const q of list) {
        const d = dist(p, q);
        if (d < bestD || (d === bestD && p.id < best.id)) {
          bestD = d;
          best = p;
        }
      }
    }
    if (!best || bestD > MOSAIC.ISLAND_REACH) continue;
    const people = best.culture;
    for (const q of list) {
      if (rowsOf(q).some((row) => row.id === people)) continue;
      const top = rowsOf(q)[0]?.share ?? 1;
      const share = Math.min(rng.range(MOSAIC.ISLAND_SHARE[0], MOSAIC.ISLAND_SHARE[1]), 0.9 * top / (1 + top));
      commit(world, q, blend(q, people, share), false);
    }
    report.push({ continent, provinces: list.length, people });
  }
  return report;
}

/**
 * Ulustan önceki doku. mixCultures'tan SONRA çağrılır (ana yurtlar yazılmış
 * olmalı: kuşak halkının yurdu kendi kümeleridir, diaspora ve ada payı yurt
 * değiştirmez). Karne `world.cultureMosaic` (denetim okur, oyun okumaz).
 */
export function mosaicBeforeNations(world) {
  if (!world.provinces?.length || !world.cultures?.length) return null;
  const rng = makeRng(`${world.seed}-mosaic`);
  const used = new Set(world.cultures.map((c) => c.name));
  const report = {
    belts: patchwork(world, rng, used),
    diaspora: scatter(world, rng),
    islands: islands(world, rng),
  };
  recountCultures(world);
  world.cultureMosaic = report;
  return report;
}

/* ---------------------------------------------------------- ULUSTAN SONRA --- */

/** Ulus listesindeki halk kimliğini yeniden adlar (ana, kabul, özerk, hareket). */
function renameIn(nation, from, to) {
  if (nation.culture === from) nation.culture = to;
  nation.accepted = (nation.accepted ?? []).map((c) => (c === from ? to : c));
  nation.homeRule = (nation.homeRule ?? []).map((c) => (c === from ? to : c));
  if (nation.movements?.[from]) {
    nation.movements[to] = nation.movements[from];
    delete nation.movements[from];
  }
}

/**
 * KARDEŞ HALKLAR. Dörtten çok düzenli ulusun ana halkı olan halk, ulus
 * gruplarına (bitişik 3-4 ulus, komşusuz olan tek) bölünür: en büyük grup adı
 * taşır, diğerleri aynı aileden yeni ad alır (aynı ek: akraba duyulur). Halkın
 * bütün satırları en yakın grubun halkına geçer; ulusun kendi kümesi kendi
 * grubunundur. Ulus-devlet aynı kalır (ana halk yalnız ad değiştirir), "tek
 * halk on ulus" biter; birleşme ve soydaş bağı grup içinde sürer.
 */
function kinSplit(world, nations, rng, used) {
  const provinces = world.provinces;
  const cultures = world.cultures;
  const dist = distOf(world);
  const owns = new Map();
  for (const p of provinces) {
    if (p.owner < 0) continue;
    if (!owns.has(p.owner)) owns.set(p.owner, []);
    owns.get(p.owner).push(p);
  }
  const adjacency = new Map();
  for (const p of provinces) {
    if (p.owner < 0) continue;
    for (const i of p.neighbors) {
      const other = provinces[i].owner;
      if (other < 0 || other === p.owner) continue;
      const box = adjacency.get(p.owner) ?? adjacency.set(p.owner, new Map()).get(p.owner);
      box.set(other, (box.get(other) ?? 0) + 1);
    }
  }
  const byPeople = new Map();
  for (const nation of nations) {
    if (nation.culture < 0 || !owns.has(nation.id)) continue;
    if (!byPeople.has(nation.culture)) byPeople.set(nation.culture, []);
    byPeople.get(nation.culture).push(nation);
  }
  const report = [];
  for (const [people, list] of [...byPeople].sort((a, b) => a[0] - b[0])) {
    if (list.length <= MOSAIC.KIN_MAX) continue;
    const presence = new Map(list.map((n) => [n.id, 0]));
    for (const n of list) {
      for (const p of owns.get(n.id)) {
        presence.set(n.id, presence.get(n.id) + p.tileIdx.length * (rowsOf(p).find((r) => r.id === people)?.share ?? 0));
      }
    }
    const order = [...list].sort((a, b) => presence.get(b.id) - presence.get(a.id) || a.id - b.id);
    const inList = new Set(list.map((n) => n.id));
    const groupOf = new Map();
    const groups = [];
    for (const head of order) {
      if (groupOf.has(head.id)) continue;
      const gi = groups.length;
      const group = [head];
      groupOf.set(head.id, gi);
      const target = rng.int(MOSAIC.KIN_GROUP[0], MOSAIC.KIN_GROUP[1]);
      while (group.length < target) {
        let best = -1;
        let bestBorder = 0;
        for (const member of group) {
          for (const [other, border] of adjacency.get(member.id) ?? []) {
            if (!inList.has(other) || groupOf.has(other)) continue;
            if (border > bestBorder || (border === bestBorder && other < best)) {
              bestBorder = border;
              best = other;
            }
          }
        }
        if (best < 0) break;
        group.push(nations[best]);
        groupOf.set(best, gi);
      }
      groups.push(group);
    }
    // İlk grup (en büyük yurt) adı taşır; diğerleri kardeş halk olur.
    const family = cultures[people].family;
    const ids = [people];
    for (let gi = 1; gi < groups.length; gi++) {
      const held = groups[gi].flatMap((n) => owns.get(n.id));
      const origin = held.filter((p) => p.culture === people)
        .sort((a, b) => b.tileIdx.length - a.tileIdx.length || a.id - b.id)[0] ?? held[0];
      ids.push(addPeople(world, family, origin.center, rng, used, nearPeoples(world, held, ids)));
    }
    // Satırın grubu: sahibi listedeyse onun grubu, değilse en yakın grup toprağı
    // (province grafında çok kaynaklı arama; ulaşılamayan ada düz uzaklıkla).
    const label = new Map();
    const queue = [];
    for (const p of provinces) {
      if (p.owner >= 0 && groupOf.has(p.owner)) {
        label.set(p, groupOf.get(p.owner));
        queue.push(p);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head];
      for (const i of p.neighbors) {
        const n = provinces[i];
        if (label.has(n)) continue;
        label.set(n, label.get(p));
        queue.push(n);
      }
    }
    const nearestGroup = (p) => {
      let best = 0;
      let bestD = Infinity;
      for (const q of queue) {
        const d = dist(p, q);
        if (d < bestD) {
          bestD = d;
          best = label.get(q);
        }
      }
      return best;
    };
    const touched = [];
    for (const p of provinces) {
      const rows = rowsOf(p);
      if (!rows.some((row) => row.id === people)) continue;
      const gi = label.get(p) ?? nearestGroup(p);
      if (gi === 0) continue;
      const to = ids[gi];
      const wasHome = p.homeland === people;
      const mix = new Map();
      for (const row of rows) mix.set(row.id === people ? to : row.id, (mix.get(row.id === people ? to : row.id) ?? 0) + row.share);
      commit(world, p, normalizeMix(mix, MOSAIC.FLOOR), false);
      if (wasHome) p.homeland = to;
      touched.push(p);
    }
    // Ulus listeleri: grubun ulusları kendi halkını alır; başka ulusun kabul ve
    // hareket kaydı, o halkın kendi topraklarındaki satırının yeni adına geçer.
    groups.forEach((group, gi) => { if (gi > 0) for (const n of group) renameIn(n, people, ids[gi]); });
    for (const nation of nations) {
      if (groupOf.has(nation.id) || nation.culture === people && !owns.has(nation.id)) continue;
      const mentions = nation.accepted?.includes(people) || nation.homeRule?.includes(people) || nation.movements?.[people];
      if (!mentions) continue;
      const weight = new Map();
      for (const p of owns.get(nation.id) ?? []) {
        for (const row of rowsOf(p)) if (ids.includes(row.id)) weight.set(row.id, (weight.get(row.id) ?? 0) + row.share * p.tileIdx.length);
      }
      let to = people;
      for (const [id, w] of weight) if (w > (weight.get(to) ?? 0) || (w === (weight.get(to) ?? 0) && id < to)) to = id;
      if (to !== people) renameIn(nation, people, to);
    }
    // Kardeş sınırında lehçe kuşağı: komşu grubun halkı sınır kümesine pay verir.
    const sisterOf = (p) => (p.owner >= 0 && groupOf.has(p.owner) ? ids[groupOf.get(p.owner)] : -1);
    for (const p of touched.sort((a, b) => a.id - b.id)) {
      const mine = sisterOf(p);
      if (mine < 0 || p.culture !== mine) continue;
      let across = -1;
      for (const i of p.neighbors) {
        const other = sisterOf(provinces[i]);
        if (other >= 0 && other !== mine && provinces[i].culture === other && (across < 0 || other < across)) across = other;
      }
      if (across < 0 || !rng.chance(MOSAIC.KIN_BLEED_CHANCE)) continue;
      commit(world, p, blend(p, across, rng.range(MOSAIC.KIN_BLEED[0], MOSAIC.KIN_BLEED[1])), false);
    }
    // Adı taşıyan halkın kökü (uyuyan Özgür Devletinin başkenti) kendi yurdunda kalsın.
    const root = world.tiles[cultures[people].origin.row * world.cols + cultures[people].origin.col];
    if (provinces[root?.provinceId]?.culture !== people) {
      const home = provinces.filter((p) => p.culture === people)
        .sort((a, b) => b.tileIdx.length - a.tileIdx.length || a.id - b.id)[0];
      if (home) cultures[people].origin = home.center;
    }
    report.push({ people, nations: list.length, groups: groups.map((g) => g.map((n) => n.id)), peoples: ids });
  }
  return report;
}

/**
 * İMPARATORLUK CEPLERİ. Alt halk geçişi (peoples.js) tebaa halklarını
 * çevreye yerleştirir; tarih bunları kalbe de serpmişti (Transilvanya
 * Saksonları, Volga Almanları). Kalpte başkent dışı bir-üç küme, imparatorluğun
 * bir tebaa halkından belirgin pay alır. Yurt değişmez.
 */
function pockets(world, nations, rng) {
  const provinces = world.provinces;
  const report = [];
  for (const made of world.subjectPeoples ?? []) {
    const nation = nations[made.nation];
    if (!nation || !SUBJECT_PEOPLES[nation.archetype]) continue;
    const subjects = made.peoples.map((m) => m.people).filter((id) => id !== nation.culture);
    if (!subjects.length) continue;
    const capital = nation.capital?.provinceId;
    const heart = provinces.filter((p) => p.owner === nation.id && p.coreOf === nation.id
      && p.id !== capital && p.culture === nation.culture && rowsOf(p).length <= 2);
    if (!heart.length) continue;
    rng.shuffle(heart.sort((a, b) => a.id - b.id));
    const count = Math.min(heart.length, rng.int(MOSAIC.POCKETS[0], MOSAIC.POCKETS[1]));
    for (const p of heart.slice(0, count)) {
      const people = rng.pick(subjects);
      const top = rowsOf(p)[0]?.share ?? 1;
      const share = Math.min(rng.range(MOSAIC.POCKET_SHARE[0], MOSAIC.POCKET_SHARE[1]), 0.9 * top / (1 + top));
      commit(world, p, blend(p, people, share), false);
      report.push({ nation: nation.id, province: p.id, people });
    }
  }
  return report;
}

/**
 * Ulustan sonraki doku. generateNations'ta alt halk geçişinden SONRA,
 * isyancı yuvalarından ÖNCE koşar: her kardeş halkın uyuyan Özgür Devleti olsun.
 * `settle` ana halkı yeniden oylar (nations.assignPrimaryCultures).
 */
export function mosaicAfterNations(world, nations, rng, settle = () => {}) {
  if (!world.provinces?.length || !world.cultures?.length) return null;
  const used = new Set(world.cultures.map((c) => c.name));
  const kin = kinSplit(world, nations, rng, used);
  const pocketRows = pockets(world, nations, rng);
  settle();
  // Yeniden oylamada (cep, lehçe kuşağı) küçük bir ulus kardeş halka geçip onu
  // dördüncü ulusa taşıyabiliyordu (240×144, 200 ulus, bir tohumda): ikinci tur
  // kalan taşmayı böler. Taşma yoksa zar çekmez.
  const late = kinSplit(world, nations, rng, used);
  if (late.length) settle();
  separateStripes(world);
  recountCultures(world);
  return { kin: [...kin, ...late], pockets: pocketRows };
}
