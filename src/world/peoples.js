// ALT HALKLAR — büyük imparatorluklar birçok halk derinliğinde doğar
// (redesign D3, 2026-10-15).
//
// NEDEN. Kültürler ülkelerden önce ve bölge bölge doğar (cultures.js) ve bir
// ulusun ~iki katı boydadır (ölçüldü, 4 tohum 160×96: kültür medyanı 92-118
// hex, ulus 47-58). Arketip imparatorluklar bölgeye kilitli büyüdüğü için tek
// dil ailesinin alanına oturuyordu: etkin halk sayısı (ENC) kuzey 1.5-2.3,
// bileşik 1.7-2.9 (Avusturya-Macaristan ~7.3, Rusya ~4.2). Kültür sayısını her
// yerde artırmak ulus-devletleri yıkıyordu (×2: en büyük halkı ≥%85 olan ulus
// 27-30 → 13). Bu geçiş o yüzden yalnız İMPARATORLUKLARI böler: başkent
// çevresi ana halkta kalır, kalan çekirdek k gruba ayrılır ve her grup kendi
// halkının ana yurdu olur. Ulus-devletlere dokunulmaz (yalnız diaspora satırı).
//
// Kendi zar akışı vardır (`${seed}-peoples`): ana üretim akışından çekmez,
// bölümlemeyi ve sahipliği değiştirmez; düzenli ulusların adı, rengi ve
// sınırı bit bit aynı kalır (peoples-audit kimlik izi). appendRebelStates'ten
// ÖNCE koşar ki her yeni halkın uyuyan Özgür Devleti olsun.
//
// Katman: world. DOM yok, game yok.

import { makeRng } from '../core/rng.js';
import { cultureColor, cultureName, normalizeMix } from './cultures.js';
import { ZONE_FAMILY } from './macro.js';

/**
 * Arketip başına alt halk planı (macro.archetypePlan'dan ayrı: yerleşim ve
 * etnik doku iki ayrı ayar).
 *   peoples   k aralığı (grup sayısı, uçlar dahil)
 *   heartland çekirdek hexlerin ana halkta kalan payı (başkentten dışa)
 *   homeRule  1900'de zaten özerk olan halk: Macaristan (bileşiğin en büyük
 *             tebaası) ve Finlandiya (kuzeyin en küçük çevre halkı) örnekleri
 *   keep      grubun çoğunluğu zaten başka bir halksa o halk ne zaman KALIR:
 *             'local'  yurdu tamamen bizim çekirdeğimizde (başka devlette
 *                      çoğunluğu yok) — sınır ötesi bir halkın bizdeki parçası
 *                      kendi halkı olur (Rutenler/Ukraynalılar gibi)
 *             'established' ayrıca çekirdekte ≥ ESTABLISHED kümede çoğunluk
 *                      olan büyük halk da kalır: doğu devi iki-üç kadim halkın
 *                      ülkesidir, onu bölmek ENC'yi 3.1-3.3'e çıkarıyordu
 *                      (hedef 1.6-2.8; ölçüldü, 4 dünya)
 *
 * Kalp payları tasarım tablosundan ölçümle saptı (2026-10-15, STAT1-3 +
 * BORDER1 160×96): pay HEX'tir ama nüfus kalpte yoğundur (STAT3 kuzey: hexin
 * %36'sı nüfusun %46'sı). Kuzey 0.45 iken ana halk nüfusun %52-58'i, ENC
 * 2.8-3.4 (hedef ≥ 3.5) → 0.35: ENC 3.6-4.7. Kavşak 0.45 iken 2-3 halk
 * doğuyordu → 0.40: 3-4 halk, ENC 3.9-6.1.
 */
export const SUBJECT_PEOPLES = {
  'kuzey-imparatorlugu': { peoples: [6, 8], heartland: 0.35, homeRule: 'smallest-peripheral', keep: 'local' },
  'bilesik-monarsi': { peoples: [6, 8], heartland: 0.30, homeRule: 'largest', keep: 'local' },
  'kavsak-imparatorlugu': { peoples: [4, 5], heartland: 0.40, homeRule: null, keep: 'local' },
  'dogu-devi': { peoples: [2, 3], heartland: 0.65, homeRule: null, keep: 'established' },
};

export const PEOPLES = {
  /** Halkın ana yurdu en az iki küme: tek kümelik halkın hareketi de devleti de anlamsız. */
  MIN_GROUP: 2,
  /** Yeni halkın kendi yurdundaki payı ve ana halkın yönetici azınlık kalıntısı. */
  SHARE: [0.55, 0.80],
  RESIDUE: [0.08, 0.20],
  /** İki yeni halkın sınırındaki küme komşu halka bu payı verir (karışık kuşak). */
  BLEED: 0.15,
  /** Yurt dışındaki soydaş: komşu ülkenin bir kümesine satır. */
  DIASPORA_CHANCE: 0.5,
  DIASPORA: [0.15, 0.30],
  /** cultures.normalizeMix tabanı: üretimdeki diğer karışımlarla aynı. */
  FLOOR: 0.04,
  /**
   * Renk: komşu halkın tonuna 25°'den yakınsa altın açıyla en çok 3 kez
   * döndürülür. Ek olarak culture-audit'in çizgi ölçüsü (ton/3 + doygunluk
   * + açıklık farkı, eşik 14) 16'nın altındaysa da döndürülür: ton tek başına
   * ayrık olsa bile aynı doygunluk/açıklık kademesindeki iki halkın azınlık
   * taraması zemine karışıyordu.
   */
  HUE_GAP: 25,
  HUE_TURN: 137.5,
  HUE_TRIES: 3,
  STRIPE_GAP: 16,
  /** 'established' kuralında büyük halkın çekirdekteki asgari çoğunluk kümesi. */
  ESTABLISHED: 5,
  /**
   * İrredenta kolu (A/B sabiti). 'border': komşu ulusun ana halkının çoğunluk
   * olduğu ve o komşuya sınır olan küme gruplanmaz (D3 b). 'off': gruplanır.
   * Ölçüm (STAT1-3 + BORDER1, 160×96): 'border' bileşik monarşinin
   * çekirdeğinin 4-9/17-20 kümesini dışarıda bırakıyor, 2-3 halk doğuyor
   * (ENC 3.6-4.7, hedef ≥ 5.0; kültür 44-52, hedef 54-62). 'off' ile ENC
   * 6.4-7.2. Bedeli komşuların soydaş talebi: 160×96'da 130/141/135/133
   * (taban 132/146/146/133), 78×62 BORDER1-6'da −0…−6 çift.
   */
  IRREDENTA: 'off',
  /** Başlangıçta özerk halkın talebi (D1 Home Rule izi). */
  HOME_RULE_DEMAND: 20,
  /**
   * Küçük harita (78×62 denetim dünyası): grup sayısı çekirdeğin üçte birini
   * geçmez, yoksa 12 kümelik bir imparatorluk tamamen dağılırdı.
   */
  SMALL_MAP_AREA: (160 * 96) / 2,
};

const rowsOf = (province) => (province.cultures?.length
  ? province.cultures
  : (province.culture >= 0 ? [{ id: province.culture, share: 1 }] : []));

const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
/** culture-audit / peoples-audit "zayıf çift" ölçüsüyle aynı. */
const stripe = (a, b) => hueGap(a.hue, b.hue) / 3 + Math.abs(a.sat - b.sat) + Math.abs(a.light - b.light);

/**
 * Halkın rengi: komşu halklardan ayrılana dek altın açıyla döner. Üç turda
 * ayrılamazsa denenenlerin en ayrığı kalır.
 */
function paint(id, family, rng, neighbours) {
  let palette = cultureColor(id, family, rng);
  const clash = (p) => neighbours.some(
    (o) => hueGap(p.hue, o.hue) < PEOPLES.HUE_GAP || stripe(p, o) < PEOPLES.STRIPE_GAP,
  );
  const score = (p) => Math.min(Infinity, ...neighbours.map((o) => stripe(p, o)));
  let best = palette;
  for (let turn = 0; turn < PEOPLES.HUE_TRIES && clash(palette); turn++) {
    const hue = (palette.hue + PEOPLES.HUE_TURN) % 360;
    palette = { ...palette, hue, color: `hsl(${hue.toFixed(0)} ${palette.sat}% ${palette.light}%)` };
    if (score(palette) > score(best)) best = palette;
  }
  return clash(palette) ? best : palette;
}

/** Bileşimi yazar; kare kültürü ve üretim tabanı (kayıt farkı) çoğunluğa çekilir. */
function commit(world, province, rows, homeland) {
  province.cultures = rows;
  province.culture = rows[0]?.id ?? -1;
  if (homeland) province.homeland = province.culture;
  for (const idx of province.tileIdx) {
    const tile = world.tiles[idx];
    tile.culture = province.culture;
    tile.baseCulture = province.culture;
  }
}

/** Kümeyi `share` payında `people` halkına açar, diğer satırlar orantılı küçülür. */
function blend(province, people, share) {
  const mix = new Map();
  for (const row of rowsOf(province)) mix.set(row.id, row.share * (1 - share));
  mix.set(people, (mix.get(people) ?? 0) + share);
  return normalizeMix(mix, PEOPLES.FLOOR);
}

/**
 * Grup kümesinin yeni bileşimi (D3 e). Eski azınlıklar kalan paya ölçeklenir
 * ama BÜYÜTÜLMEZ: %98 ana halklı kümedeki %2'lik bir kalıntı kalanın hepsini
 * alıp %37'lik bir halka dönüşmesin; boşta kalan pay yeni halka gider.
 */
function peopleRows(province, people, primary, rng) {
  const share = rng.range(PEOPLES.SHARE[0], PEOPLES.SHARE[1]);
  const residue = rng.range(PEOPLES.RESIDUE[0], PEOPLES.RESIDUE[1]);
  const remainder = Math.max(0, 1 - share - residue);
  const old = rowsOf(province).filter((row) => row.id !== people && row.id !== primary);
  const oldTotal = old.reduce((sum, row) => sum + row.share, 0);
  const keep = oldTotal > 0 ? Math.min(1, remainder / oldTotal) : 0;
  const mix = new Map([[primary, residue]]);
  let given = 0;
  for (const row of old) {
    mix.set(row.id, row.share * keep);
    given += row.share * keep;
  }
  mix.set(people, share + (remainder - given));
  return normalizeMix(mix, PEOPLES.FLOOR);
}

/**
 * Çekirdeğin kalp dışındaki kümelerini k gruba böler (D3 c). Bileşen başına
 * tohum dağıtılır: kalp çıkınca halka kopabilir ve tek tohumlu büyüme kopuk
 * parçaya ulaşamazdı. Tohumlar en uzak nokta kuralıyla seçilir (ilki başkente
 * en uzak küme).
 */
function groupRest(world, rest, k, far, dist, rng) {
  const provinces = world.provinces;
  const inRest = new Set(rest);
  const seen = new Set();
  const comps = [];
  for (const start of rest) {
    if (seen.has(start)) continue;
    const comp = [start];
    seen.add(start);
    for (let head = 0; head < comp.length; head++) {
      for (const i of comp[head].neighbors) {
        const n = provinces[i];
        if (inRest.has(n) && !seen.has(n)) {
          seen.add(n);
          comp.push(n);
        }
      }
    }
    comps.push(comp);
  }
  const minId = (list) => list.reduce((m, p) => Math.min(m, p.id), Infinity);
  comps.sort((a, b) => b.length - a.length || minId(a) - minId(b));

  // Tohum payı: önce her (≥2 kümelik) bileşene bir, kalan en kalabalık yüke.
  const seeds = comps.map(() => 0);
  let left = k;
  for (let i = 0; i < comps.length && left > 0; i++) {
    if (comps[i].length >= PEOPLES.MIN_GROUP) {
      seeds[i] = 1;
      left--;
    }
  }
  while (left > 0) {
    let best = -1;
    let bestLoad = 0;
    for (let i = 0; i < comps.length; i++) {
      if (!seeds[i] || seeds[i] >= Math.floor(comps[i].length / PEOPLES.MIN_GROUP)) continue;
      const load = comps[i].length / (seeds[i] + 1);
      if (load > bestLoad) {
        bestLoad = load;
        best = i;
      }
    }
    if (best < 0) break;
    seeds[best]++;
    left--;
  }

  const groups = [];
  const groupOf = new Map();
  const join = (p, gi) => {
    groups[gi].push(p);
    groupOf.set(p, gi);
  };
  comps.forEach((comp, ci) => {
    if (!seeds[ci]) return;
    let first = comp[0];
    for (const p of comp) if (far(p, first) > 0) first = p;
    const picks = [first];
    while (picks.length < seeds[ci]) {
      let best = null;
      let bestD = -1;
      for (const p of comp) {
        if (picks.includes(p)) continue;
        const d = Math.min(...picks.map((s) => dist(s, p)));
        if (d > bestD || (d === bestD && p.id < best.id)) {
          bestD = d;
          best = p;
        }
      }
      if (!best) break;
      picks.push(best);
    }
    const inComp = new Set(comp);
    const base = groups.length;
    for (let i = 0; i < picks.length; i++) groups.push([]);
    picks.forEach((seed, i) => join(seed, base + i));
    // Sırayla büyüme: her turda EN KÜÇÜK grup kendine bitişik en ucuz boş
    // kümeyi alır. Kotalı Dijkstra denendi: hızlı tohum komşusunu kuşatıyor,
    // tek kümelik grup birleşmeye düşüyordu (ölçüldü, BORDER1 kuzey: k=7,
    // 6 tohum → 4 halk). Pürüz zarı küme başına bir kez çekilir.
    const jitter = new Map(comp.map((p) => [p, p.moveCost + rng.range(0, 1.6)]));
    for (;;) {
      let moved = false;
      const turn = picks.map((_, i) => base + i)
        .sort((x, y) => groups[x].length - groups[y].length || x - y);
      for (const gi of turn) {
        let best = null;
        for (const p of groups[gi]) {
          for (const i of p.neighbors) {
            const n = provinces[i];
            if (!inComp.has(n) || groupOf.has(n)) continue;
            if (!best || jitter.get(n) < jitter.get(best)
              || (jitter.get(n) === jitter.get(best) && n.id < best.id)) best = n;
          }
        }
        if (!best) continue;
        join(best, gi);
        moved = true;
      }
      if (!moved) break;
    }
  });
  if (!groups.length) return { groups, groupOf };

  // Tohumsuz bileşenler (tek kümelik kopuk parça ya da k'dan fazla bileşen)
  // en yakın gruba katılır: halkın yurdunda ana halka dönen ada kalmasın.
  const assigned = groups.map((g) => [...g]);
  for (const p of rest) {
    if (groupOf.has(p)) continue;
    let target = -1;
    let bestD = Infinity;
    assigned.forEach((list, gi) => {
      for (const q of list) {
        const d = dist(p, q);
        if (d < bestD) {
          bestD = d;
          target = gi;
        }
      }
    });
    if (target >= 0) join(p, target);
  }

  // İki kümenin altındaki grup komşusuna (yoksa en yakın gruba) karışır.
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (!group.length || group.length >= PEOPLES.MIN_GROUP) continue;
    let target = -1;
    for (const p of group) {
      for (const i of p.neighbors) {
        const other = groupOf.get(provinces[i]);
        if (other === undefined || other === gi || !groups[other].length) continue;
        if (target < 0 || groups[other].length < groups[target].length
          || (groups[other].length === groups[target].length && other < target)) target = other;
      }
    }
    if (target < 0) {
      let bestD = Infinity;
      groups.forEach((list, other) => {
        if (other === gi || !list.length) return;
        for (const q of list) {
          for (const p of group) {
            const d = dist(p, q);
            if (d < bestD) {
              bestD = d;
              target = other;
            }
          }
        }
      });
    }
    if (target < 0) continue;
    for (const p of group) join(p, target);
    group.length = 0;
  }
  const kept = groups.filter((g) => g.length >= PEOPLES.MIN_GROUP);
  const finalOf = new Map();
  kept.forEach((g, gi) => { for (const p of g) finalOf.set(p, gi); });
  return { groups: kept, groupOf: finalOf };
}

/** Grubun en yakınındaki BAŞKA dil ailesi (uzak çevre halkları: Fin, Türk...). */
function nearestForeignFamily(world, group, family, dist) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.provinces) {
    const other = ZONE_FAMILY[p.zone];
    if (!other || other === family) continue;
    for (const q of group) {
      const d = dist(p, q);
      if (d < bestD || (d === bestD && other < best)) {
        bestD = d;
        best = other;
      }
    }
  }
  return best;
}

/**
 * Bir imparatorluğun alt halk geçişi (D3 a-g). Rapor döner; dünya yerinde
 * değişir. Ulus nesnesine yalnız Home Rule başlangıcı yazılır.
 */
function splitEmpire(world, nations, nation, spec, rng, ctx) {
  const provinces = world.provinces;
  const cultures = world.cultures;
  const primary = nation.culture;
  const core = provinces.filter((p) => p.coreOf === nation.id && p.owner === nation.id);
  if (core.length < PEOPLES.MIN_GROUP * 2) return null;
  const coreSet = new Set(core);
  const capital = provinces[nation.capital?.provinceId] ?? core[0];
  const dist = (a, b) => world.wrapDistance(a.center.q, a.center.r, b.center.q, b.center.r);

  // (a) Başkentten province grafı uzaklığı (çekirdek içinde; kopuk parça en sona).
  const hops = new Map([[capital, 0]]);
  const queue = [capital];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (const i of p.neighbors) {
      const n = provinces[i];
      if (!coreSet.has(n) || hops.has(n)) continue;
      hops.set(n, hops.get(p) + 1);
      queue.push(n);
    }
  }
  const away = (p) => hops.get(p) ?? Infinity;
  /** >0: a başkente b'den uzak (graf, sonra düz uzaklık; eşitlikte büyük id uzak). */
  const far = (a, b) => {
    if (away(a) !== away(b)) return away(a) > away(b) ? 1 : -1;
    const da = dist(capital, a);
    const db = dist(capital, b);
    if (da !== db) return da > db ? 1 : -1;
    return a.id - b.id;
  };
  const order = [...core].sort((a, b) => far(a, b));
  const size = (p) => p.tileIdx.length;
  const totalHexes = core.reduce((sum, p) => sum + size(p), 0);
  const target = totalHexes * spec.heartland;
  const heartland = new Set();
  let held = 0;
  // KALP: başkentten dışa, ana halkın çoğunluk olduğu kümeler payına kadar
  // ana halkta kalır ("payına kadar": aşmaz). Başkent kümesi her durumda
  // dokunulmazdır (§2.0: hiçbir halk başkentten ayrılamaz). Ana halkı
  // olmayan yakın küme kalbe sayılmaz: kültürler ulusun iki katı boyda
  // olduğundan başkent çoğu zaman iki-üç halkın kesişiminde durur ve
  // mesafe tek başına kalbi başka bir halka verirdi; geçiş ana halkın
  // çevresini alt halklara çevirince kalbin halkı ana halkı geçiyordu
  // (ölçüldü, 16 imparatorluğun 7'sinde ana halk en büyük değildi).
  heartland.add(capital);
  held += capital.culture === primary ? size(capital) : 0;
  for (const p of order) {
    if (p === capital || p.culture !== primary) continue;
    if (held + size(p) > target) break;
    heartland.add(p);
    held += size(p);
  }

  // (b) İrredenta (A/B kolu, bkz. PEOPLES.IRREDENTA): komşu ulusun ana
  // halkının çoğunluk olduğu ve o komşuya SINIR olan küme o komşunun
  // davasıdır. Sınıra değmeyen iç küme hiçbir kolda irredenta sayılmaz:
  // kültürler ulusun iki katı boyda olduğundan "komşunun halkı" iç bölgede de
  // çoğunluktu ve bileşik monarşinin çekirdeğinin 10/17'si böyle dışarıda
  // kalıyordu (ölçüldü, BORDER1).
  const irredenta = (p) => p.culture !== primary && p.neighbors.some((i) => {
    const owner = provinces[i].owner;
    return owner >= 0 && owner !== nation.id && nations[owner]?.culture === p.culture;
  });
  const rest = order.filter((p) => !heartland.has(p) && (PEOPLES.IRREDENTA === 'off' || !irredenta(p)));

  // (c) k grup, en az iki kümelik.
  let k = rng.int(spec.peoples[0], spec.peoples[1]);
  k = Math.min(k, Math.floor(rest.length / PEOPLES.MIN_GROUP));
  if (ctx.small) k = Math.min(k, Math.floor(core.length / 3));
  if (k < 1) return null;
  const { groups: raw, groupOf } = groupRest(world, rest, k, far, dist, rng);
  if (!raw.length) return null;

  // Gruplar uzaktan yakına: en uzak üçte bir başka dil ailesinden olur.
  const meanDist = (g) => g.reduce((sum, p) => sum + dist(capital, p), 0) / g.length;
  const groups = raw.map((list, index) => ({ list, index, far: meanDist(list), minId: Math.min(...list.map((p) => p.id)) }))
    .sort((a, b) => b.far - a.far || a.minId - b.minId);
  const rank = new Map(groups.map((g, i) => [g.index, i]));
  const ownFamily = ZONE_FAMILY[capital.zone] ?? cultures[primary]?.family ?? 'Valdic';
  const foreignCount = Math.floor(groups.length / 3);

  // (d)+(e) Grubun halkı ve satırları. "Zaten başka bir halk" sınaması
  // (bkz. SUBJECT_PEOPLES.keep) yeniden yazımdan ÖNCEKİ yurtlarla yapılır.
  const homeIn = new Map();
  const homeOut = new Map();
  for (const p of provinces) {
    if (p.culture < 0) continue;
    const box = p.coreOf === nation.id ? homeIn : homeOut;
    box.set(p.culture, (box.get(p.culture) ?? 0) + 1);
  }
  const keeps = (c) => c >= 0 && c !== primary && (
    !homeOut.has(c)
    || (spec.keep === 'established' && (homeIn.get(c) ?? 0) >= PEOPLES.ESTABLISHED));
  const claimed = new Set([primary]);
  const made = [];
  groups.forEach((group, gi) => {
    const weight = new Map();
    for (const p of group.list) {
      for (const row of rowsOf(p)) weight.set(row.id, (weight.get(row.id) ?? 0) + p.tileIdx.length * row.share);
    }
    let majority = -1;
    let most = -1;
    for (const [id, w] of weight) {
      if (w > most || (w === most && id < majority)) {
        most = w;
        majority = id;
      }
    }
    let people = majority;
    // Bir halk yalnız BİR grupta kalır; aynı halkın ikinci grubu kendi halkı
    // olur (paylaşımlı kalış denendi: kuzeyde 5 grubun 4'ü aynı halka düşüp
    // yeni halk doğmuyordu, BORDER1). İstisna doğu devinin büyük kadim
    // halkıdır ('established'): onu ikiye bölmek STAT3'te ENC'yi 2.43'ten
    // 2.82'ye çıkarıyordu (hedef ≤ 2.8).
    const big = spec.keep === 'established' && (homeIn.get(majority) ?? 0) >= PEOPLES.ESTABLISHED;
    const kept = keeps(majority) && (big || !claimed.has(majority));
    if (!kept) {
      const family = gi < foreignCount
        ? (nearestForeignFamily(world, group.list, ownFamily, dist) ?? ownFamily)
        : ownFamily;
      // Komşu halklar: grubun ve çevresinin bütün satırları + bu imparatorluğun
      // önceki grupları (sınır kuşağında yan yana taranacaklar).
      const near = new Set([primary, ...made.map((m) => m.people)]);
      for (const p of group.list) {
        for (const row of rowsOf(p)) near.add(row.id);
        for (const i of p.neighbors) {
          for (const row of rowsOf(provinces[i])) near.add(row.id);
        }
      }
      people = cultures.length;
      const palette = paint(people, family, rng, [...near].map((id) => cultures[id]).filter(Boolean));
      const origin = [...group.list].sort((a, b) => b.tileIdx.length - a.tileIdx.length || a.id - b.id)[0];
      cultures.push({
        id: people,
        name: cultureName(rng, ctx.used, family),
        family,
        color: palette.color,
        hue: palette.hue,
        sat: palette.sat,
        light: palette.light,
        origin: origin.center,
        tiles: 0,
        presence: 0,
      });
    }
    claimed.add(people);
    for (const p of group.list) {
      // Kalan halkın grubunda yalnız ANA HALKIN kümeleri o halka geçer.
      // Kalan halkın kendi kümesi olduğu gibi kalır ("onu korur"; yeniden
      // yazmak o halkı şişirip ana halkı geçiriyordu, STAT1 kavşak %35'e
      // %33); üçüncü bir eski halkın kümesi de kalır (doğu devinde iki kadim
      // halkın sınırını kaydırıp ENC'yi 2.71'den 2.81'e çıkarıyordu, STAT2).
      if (kept && p.culture !== primary) continue;
      commit(world, p, peopleRows(p, people, primary, rng), true);
    }
    made.push({ people, kept, far: group.far, provinces: group.list.map((p) => p.id) });
  });

  // (f) Sınır kuşağı: iki YENİ halkın sınırındaki küme komşu halka pay verir.
  // Kalan (eski) halkların sınırı üretimin karışımından zaten gradyandır.
  groups.forEach((group, gi) => {
    if (made[gi].kept) return;
    for (const p of group.list) {
      const touch = new Map();
      for (const i of p.neighbors) {
        const other = rank.get(groupOf.get(provinces[i]));
        if (other === undefined || other === gi || made[other].kept) continue;
        touch.set(other, (touch.get(other) ?? 0) + 1);
      }
      let pick = -1;
      for (const [other, count] of touch) {
        if (pick < 0 || count > touch.get(pick) || (count === touch.get(pick) && other < pick)) pick = other;
      }
      if (pick >= 0) commit(world, p, blend(p, made[pick].people, PEOPLES.BLEED), false);
    }
  });

  // (g) Diaspora: yeni halk yarı olasılıkla komşu ülkenin bir kümesinde
  // soydaş satırı bulur (eski halkın soydaşı zaten üretimden gelir). Pay o
  // kümenin çoğunluğunu çevirmeyecek kadar kırpılır: komşunun ana yurdu ve
  // ana halkı yerinde kalır.
  groups.forEach((group, gi) => {
    if (made[gi].kept || !rng.chance(PEOPLES.DIASPORA_CHANCE)) return;
    const people = made[gi].people;
    const seenIds = new Set();
    const candidates = [];
    for (const p of group.list) {
      for (const i of p.neighbors) {
        const n = provinces[i];
        if (n.owner < 0 || n.owner === nation.id || seenIds.has(n.id) || n.culture === people) continue;
        if (n.culture < 0 || stripe(cultures[n.culture], cultures[people]) < PEOPLES.STRIPE_GAP) continue;
        seenIds.add(n.id);
        candidates.push(n);
      }
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.id - b.id);
    const host = rng.pick(candidates);
    const rows = rowsOf(host);
    const top = rows[0]?.share ?? 1;
    const already = rows.find((row) => row.id === people)?.share ?? 0;
    const room = Math.max(0, top - already);
    const share = Math.min(rng.range(PEOPLES.DIASPORA[0], PEOPLES.DIASPORA[1]), 0.9 * room / (1 + room));
    if (share < PEOPLES.FLOOR) return;
    commit(world, host, blend(host, people, share), false);
    made[gi].diaspora = host.id;
  });

  return {
    nation: nation.id,
    heartland: heartland.size,
    core: core.length,
    rest: rest.length,
    irredenta: order.length - heartland.size - rest.length,
    k,
    peoples: made,
    homeRule: startHomeRule(world, nation, spec, made, capital),
  };
}

/**
 * 1900'de zaten özerk halk (D1 başlangıcı). Home Rule kabulün alt kümesidir:
 * halk hem `accepted`e hem `homeRule`a girer, talebi 20'den başlar.
 */
function startHomeRule(world, nation, spec, made, capital) {
  if (!spec.homeRule || !made.length) return null;
  const weight = new Map();
  const majorities = new Map();
  for (const p of world.provinces) {
    if (p.owner !== nation.id) continue;
    for (const row of rowsOf(p)) weight.set(row.id, (weight.get(row.id) ?? 0) + p.tileIdx.length * row.share);
    if (p !== capital && p.culture >= 0) majorities.set(p.culture, (majorities.get(p.culture) ?? 0) + 1);
  }
  let chosen = -1;
  if (spec.homeRule === 'largest') {
    // En büyük tebaa halkı; yurdu (≥2 çoğunluk kümesi) olmayan dağınık satır sayılmaz.
    for (const [id, w] of weight) {
      if (id === nation.culture || (majorities.get(id) ?? 0) < PEOPLES.MIN_GROUP) continue;
      if (chosen < 0 || w > weight.get(chosen) || (w === weight.get(chosen) && id < chosen)) chosen = id;
    }
  } else {
    // En küçük ÇEVRE halkı: uzak yarıdaki grupların en küçüğü (eşitlikte daha uzak).
    const peripheral = made.slice(0, Math.ceil(made.length / 2));
    for (const m of peripheral) {
      if (chosen < 0 || (weight.get(m.people) ?? 0) < (weight.get(chosen) ?? 0)) chosen = m.people;
    }
  }
  if (chosen < 0 || chosen === nation.culture) return null;
  if (!nation.accepted.includes(chosen)) nation.accepted.push(chosen);
  if (!nation.homeRule.includes(chosen)) nation.homeRule.push(chosen);
  (nation.movements ??= {})[chosen] = { progress: PEOPLES.HOME_RULE_DEMAND };
  return chosen;
}

/**
 * Azınlık taraması okunur kalsın: çoğunluk ile ilk azınlığı (≥ %15) çizgi
 * ölçüsünde 14'ün altında kalan çiftte büyük kimlikli halkın tonu altın açıyla
 * döner (en çok 3 tur, en ayrık deneme kalır). Üretimdeki eski bir çift de
 * düzelir (ölçüldü: CULTURE-C'de iki eski halk 13.3, culture-audit tabanda
 * kırmızıydı). Zar çekmez; yalnız renk değişir.
 */
function separateStripes(world) {
  const cultures = world.cultures;
  const pairs = new Map();
  for (const p of world.provinces) {
    const minority = p.cultures?.[1];
    if (!minority || minority.share < 0.15 || p.culture < 0) continue;
    const a = Math.min(p.culture, minority.id);
    const b = Math.max(p.culture, minority.id);
    pairs.set(`${a}:${b}`, [a, b]);
  }
  const partners = new Map();
  for (const [a, b] of pairs.values()) {
    (partners.get(a) ?? partners.set(a, []).get(a)).push(b);
    (partners.get(b) ?? partners.set(b, []).get(b)).push(a);
  }
  const weakest = (id, palette) => Math.min(Infinity, ...(partners.get(id) ?? [])
    .map((other) => stripe(palette, cultures[other])));
  const sorted = [...pairs.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (const [a, b] of sorted) {
    if (stripe(cultures[a], cultures[b]) >= 14) continue;
    const c = cultures[b];
    let best = { hue: c.hue, sat: c.sat, light: c.light };
    let palette = best;
    for (let turn = 0; turn < PEOPLES.HUE_TRIES; turn++) {
      palette = { ...palette, hue: (palette.hue + PEOPLES.HUE_TURN) % 360 };
      if (weakest(b, palette) > weakest(b, best)) best = palette;
    }
    c.hue = best.hue;
    c.color = `hsl(${best.hue.toFixed(0)} ${c.sat}% ${c.light}%)`;
  }
}

/** Kültür sayaçları bileşimden yeniden kurulur (cultures.mixCultures ile aynı tanım). */
function recountCultures(world) {
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
  world.cultureCounts = world.cultures.map((c) => c.tiles);
}

/**
 * ALT HALK GEÇİŞİ (D3). generateNations'ta ana halk düzeltmesinden sonra ve
 * appendRebelStates'ten önce koşar; zar akışı yalnız buradan çekilir.
 * @returns {Array} imparatorluk başına rapor (denetim okur, oyun okumaz)
 */
export function subjectPeoples(world, nations, rng) {
  const report = [];
  if (!world.provinces?.length || !world.cultures?.length) return report;
  const ctx = {
    used: new Set(world.cultures.map((c) => c.name)),
    small: world.cols * world.rows < PEOPLES.SMALL_MAP_AREA,
  };
  // İmparatorluk başına ayrı alt akış, hepsi baştan ve sırayla çekilir: bir
  // imparatorluğun zar sayısı (grup, renk denemesi) sonrakinin halklarını
  // kaydırmasın (ölçüldü: kuzeyin kalp payını oynatmak bileşiğin en büyük
  // halkını %22'den %39'a atıyordu).
  const streams = new Map(nations.map((nation) => [nation.id, null]));
  for (const nation of nations) {
    if (SUBJECT_PEOPLES[nation.archetype]) streams.set(nation.id, makeRng(Math.floor(rng() * 4294967296)));
  }
  for (const nation of nations) {
    const spec = SUBJECT_PEOPLES[nation.archetype];
    if (!spec || nation.culture < 0) continue;
    const made = splitEmpire(world, nations, nation, spec, streams.get(nation.id), ctx);
    if (made) report.push(made);
  }
  separateStripes(world);
  recountCultures(world);
  return report;
}

/**
 * Kültür parmak izi (kayıt v28). Bölümleme izi (save.partitionChecksum)
 * kültür yerleşimine kördür: bu geçiş değişirse eski kaydın halk satırları,
 * ana yurtları ve isyancı yuvaları yanlış halklara otururdu. Üretim anında
 * hesaplanır (world.cultureChecksum); kayıt onu taşır ve yükleme ayrı
 * üretilen dünyayla karşılaştırır. Sürgün yurdu sildiği için oyun içindeki
 * değer değil, ÜRETİMİN değeri saklanır.
 */
export function cultureChecksum(world) {
  let h = 2166136261 >>> 0;
  const mix = (value) => { h = Math.imul(h ^ (value | 0), 16777619) >>> 0; };
  mix(world.cultures?.length ?? 0);
  for (const province of world.provinces ?? []) {
    mix(province.id);
    mix(province.homeland ?? -1);
    mix(province.culture ?? -1);
  }
  return h;
}
