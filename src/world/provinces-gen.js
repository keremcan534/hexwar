// CK3 tarzı province bölümlemesi: geçilebilir kara, 2-7 hexlik bitişik ve
// kompakt kümelere ayrılır. Ordular hex hex yürümeye devam eder; nüfus, RGO
// ve binalar bu kümelerde yaşayacak (bkz. game/provinces.js geçişi).
//
// Kendi rng dalını kullanır (`${seed}-provinces`): ana üretim akışına tek
// çekim bile eklemez, arazi/kültür aynı tohumda birebir aynı kalır.
//
// Katman notu: world katmanıdır, DOM'a ve game'e dokunmaz.

import { makeRng } from '../core/rng.js';
import { DIRS } from '../core/hex.js';
import { growRegions } from './regions.js';
import { DEFAULT_ZONE, ZONE_RULES } from './macro.js';
import { riverFlowTable } from './rivers.js';

/**
 * Üreteç sürümü. Kayıt dünyayı tohumdan yeniden kurar ve province parmak
 * izini doğrular; sürüm `genOptions.provinceGen` ile saklanır, alanı olmayan
 * eski kayıt v1 ile açılır (bkz. save.deserialize). v1'e DOKUNMA: eski
 * kampanyaların bölümlemesi onun birebir çıktısıdır.
 *
 *   1: bölge kotası + jitter'lı büyüme (ızgara tohumları)
 *   2: tohum vadide, sınır nehir/sırt/kıyı boyunca, boy yerel verimle
 */
export const PROVINCE_GEN_LATEST = 2;

/**
 * Province boyu makro bölgeden gelir: yoğun-batı küçük (siyasi doku),
 * bozkır/kolonizasyon alanı iri (okunurluk + "büyük ama boş" hissi).
 * [kıyı, iç] hedef çifti; katılım toleransı hedef+4.
 */
function sizeTargetOf(tile) {
  const rule = ZONE_RULES[tile.zone ?? DEFAULT_ZONE] ?? ZONE_RULES[DEFAULT_ZONE];
  return tile.coastal ? rule.size[0] : rule.size[1];
}

/** Tohum ızgarası hücre kenarı (offset kolon/satır). 2x2 hücre ≈ 4 hex. */
const SEED_CELL = 2;

// Ad heceleri game/provinces.js'tekiyle aynı ailedendir; katman sırası gereği
// (game world'ü import eder, tersi yasak) tablolar burada yaşar.
const NAME_A = [
  'Aster', 'Bram', 'Cald', 'Dorn', 'Elm', 'Fen', 'Gar', 'Hald', 'Ilm', 'Jor',
  'Kesh', 'Lund', 'Mar', 'Norr', 'Oster', 'Pell', 'Quen', 'Rav', 'Sten', 'Tor',
  'Ulm', 'Vard', 'Wehr', 'Yar', 'Zel',
];
const NAME_B = [
  'mark', 'land', 'gau', 'thal', 'burg', 'stead', 'moor', 'vale', 'reach', 'holm',
  'wick', 'fell', 'heim', 'garde', 'ford',
];

/**
 * Izgara-jitter tohumlama. pickSeeds O(n·k) — 11k karada ~2.4k tohum için
 * pahalı; hücre başına tek rastgele aday hem O(n) hem de düzgün dağılımlı.
 */
function gridSeeds(world, rng) {
  const seeds = [];
  const cellRows = Math.ceil(world.rows / SEED_CELL);
  const cellCols = Math.ceil(world.cols / SEED_CELL);
  const bucket = [];
  for (let cr = 0; cr < cellRows; cr++) {
    for (let cc = 0; cc < cellCols; cc++) {
      bucket.length = 0;
      for (let dr = 0; dr < SEED_CELL; dr++) {
        const row = cr * SEED_CELL + dr;
        if (row >= world.rows) break;
        for (let dc = 0; dc < SEED_CELL; dc++) {
          const col = cc * SEED_CELL + dc;
          if (col >= world.cols) break;
          const t = world.tiles[row * world.cols + col];
          // Dağlık kare tohum olmaz (terrain.highland): province'i vadi kurar,
          // dağ ona katılır. Bütünüyle dağlık bir hücre tohumsuz kalır ve
          // repairOrphans onu komşu province'e bağlar; hiç komşusu yoksa
          // zaten kendi bileşeni olarak kurulur (izole masif).
          if (t.terrain.passable && !t.terrain.highland) bucket.push(t);
        }
      }
      if (!bucket.length) continue;
      const pick = rng.pick(bucket);
      // Tohum yoğunluğu bölge hedefiyle ölçeklenir: kota bir TAVANDIR, boyu
      // asıl belirleyen komşu tohum mesafesidir. Hücre ~4 hex; iri hedefli
      // bölgede tohumların çoğu atlanır ki kalanlar hedefe kadar büyüsün.
      if (rng.chance(Math.min(1, (SEED_CELL * SEED_CELL) / sizeTargetOf(pick)))) {
        seeds.push(pick);
      }
    }
  }
  return seeds;
}

/**
 * growRegions kota dolunca kareyi atar; atananlara bitişik artıklar en küçük
 * komşu province'e katılır (bitişiklik bozulmaz). Hiçbir province'e değmeyen
 * bileşenler (adalar, kapalı cepler) kendi province'lerini kurar.
 */
function repairOrphans(world, assignment, counts, caps, rng, targetOf = sizeTargetOf, joinPenalty = null) {
  // Katılım geçişi: province'li komşusu olan artık, en küçük komşuya bağlanır.
  const joinPass = () => {
    for (;;) {
      let changed = false;
      world.forEach((tile) => {
        if (!tile.terrain.passable || assignment.has(tile)) return;
        let best = -1;
        let bestCount = Infinity;
        for (const n of world.neighbors(tile)) {
          const region = assignment.get(n);
          if (region === undefined) continue;
          // Katılım toleransı bölge hedefine bağlı: iri sınır province'i
          // biraz daha şişebilir, yoğun-batı kümesi şişemez.
          if (counts[region] >= (caps[region] ?? 8) + 4) continue;
          // v2: nehir/sırt karşısındaki komşu ancak çok daha küçükse seçilir;
          // yoksa sırtta kalan dağ kareleri rastgele bir yakaya bağlanıyordu.
          const key = joinPenalty ? counts[region] + joinPenalty(tile, n) : counts[region];
          if (key < bestCount) {
            bestCount = key;
            best = region;
          }
        }
        if (best < 0) return;
        assignment.set(tile, best);
        counts[best]++;
        changed = true;
      });
      if (!changed) return;
    }
  };

  // Sabit nokta: katılım -> ilk sahipsiz bileşeni kur -> tekrar katılım.
  // Böylece alt bölmenin kendi artıkları da yeni kurulan province'lere
  // katılma şansı bulur; tek geçişte 1'lik kırıntılar kalıyordu.
  for (;;) {
    joinPass();
    let component = null;
    let componentSet = null;
    world.forEach((tile) => {
      if (component || !tile.terrain.passable || assignment.has(tile)) return;
      component = [tile];
      componentSet = new Set(component);
      for (let head = 0; head < component.length; head++) {
        for (const n of world.neighbors(component[head])) {
          if (componentSet.has(n) || !n.terrain.passable || assignment.has(n)) continue;
          componentSet.add(n);
          component.push(n);
        }
      }
    });
    if (!component) return;

    const componentTarget = targetOf(component[0]);
    if (component.length <= componentTarget) {
      // İzole ada ya da dolu komşulara sıkışmış cep: kendi province'i olur.
      const region = counts.length;
      counts.push(0);
      caps.push(componentTarget);
      for (const member of component) {
        assignment.set(member, region);
        counts[region]++;
      }
      continue;
    }
    // Büyük bileşen kendi içinde bölünür.
    const seedCount = Math.ceil(component.length / componentTarget);
    const stride = component.length / seedCount;
    const seeds = [];
    for (let i = 0; i < seedCount; i++) seeds.push(component[Math.floor(i * stride)]);
    const sub = growRegions(world, seeds, {
      canEnter: (t) => componentSet.has(t) && !assignment.has(t),
      stepCost: () => 1 + rng.range(0, 0.4),
      budget: (i) => targetOf(seeds[i]),
    });
    const offset = counts.length;
    for (const seed of seeds) {
      counts.push(0);
      caps.push(targetOf(seed));
    }
    for (const [member, sr] of sub.assignment) {
      assignment.set(member, offset + sr);
      counts[offset + sr]++;
    }
  }
}

// --- v2: doğal sınırlar ----------------------------------------------------
//
// Gerçek idari sınırlar nehirden, sırttan ve kıyıdan geçer; nüfus vadide
// toplanır, yoğun vadide birim küçülür. v2 bunu büyüme maliyetiyle kurar:
// tohum vadi tabanına düşer, büyüme yokuş yukarı ve nehir karşısına PAHALI
// ilerler. İki komşu vadiden büyüyen kümeler sırtta, nehrin iki yakasından
// büyüyenler nehirde buluşur — sınır oraya oturur.

/** Nehir geçişi: büyük kol ~RIVER_CROSS, kaynak yarısı. */
const RIVER_CROSS = 5;
/** Yükseklik farkı başına maliyet (kara yüksekliği 0.42..1, komşu farkı ~0.01-0.08). */
const UPHILL = 30;
/** Dağlık kareye adım: masif iki vadi arasında duvar olsun. */
const HIGHLAND_STEP = 1.2;
/**
 * Sırt geçişi. Yokuş maliyeti tek başına sırtı sınır yapmıyordu (ölçüldü:
 * sırt kenarlarının sınır payı genel paydan yalnız ~%3 fazla): kota sırta
 * varmadan doluyor. Sırt kenarını geçmek nehir gibi doğrudan pahalı.
 */
const RIDGE_CROSS = 4;

/**
 * Kenar başına sırt gücü (kare indeksi*6 + yön): kenarın iki yanı, kenarın
 * uçlarındaki iki kareden ne kadar yüksek. 0 = sırt değil; ~0.04 üstü tam.
 */
function ridgeTable(world) {
  const n = world.cols * world.rows;
  const table = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const t = world.tiles[i];
    if (t.terrain.water) continue;
    for (let d = 0; d < 6; d++) {
      const o = world.get(t.q + DIRS[d][0], t.r + DIRS[d][1]);
      const c1 = world.get(t.q + DIRS[(d + 5) % 6][0], t.r + DIRS[(d + 5) % 6][1]);
      const c2 = world.get(t.q + DIRS[(d + 1) % 6][0], t.r + DIRS[(d + 1) % 6][1]);
      if (!o || !c1 || !c2 || o.terrain.water) continue;
      const lift = Math.min(t.elevation, o.elevation) - Math.max(c1.elevation, c2.elevation);
      if (lift > 0.005) table[i * 6 + d] = Math.min(1, lift / 0.04);
    }
  }
  return table;
}

/** İki komşu kare arasındaki kenarın tablo değeri (0 = yok). */
function edgeValue(world, table, a, b) {
  const ai = a.row * world.cols + a.col;
  for (let d = 0; d < 6; d++) {
    const v = table[ai * 6 + d];
    if (v && world.get(a.q + DIRS[d][0], a.r + DIRS[d][1]) === b) return v;
  }
  return 0;
}

/** Yerel verim 0..1: besin verimi + nehir + kıyı. Yoğun nüfusun vekili. */
function fertilityOf(tile) {
  const food = tile.terrain.yields?.food ?? 0;
  return Math.min(1, food / 3 + (tile.river ? 0.35 : 0) + (tile.coastal ? 0.1 : 0));
}

/**
 * v2 boy hedefi: bölge hedefi × verim çarpanı (0.8-1.15). Bereketli vadide
 * province küçük, kıraç yaylada iri. Ortalama ~1: province sayısı ve ekonomi
 * dengesi v1 ile aynı mertebede kalır. Bölgenin en iri hedefini aşmaz: katılım
 * toleransıyla (+4) birlikte bölge tavanının içinde kalsın (audit:province).
 */
function targetV2(tile) {
  const rule = ZONE_RULES[tile.zone ?? DEFAULT_ZONE] ?? ZONE_RULES[DEFAULT_ZONE];
  const raw = Math.round(sizeTargetOf(tile) * (1.15 - 0.35 * fertilityOf(tile)));
  return Math.max(2, Math.min(Math.max(rule.size[0], rule.size[1]), raw));
}

/** İki komşu kare arasındaki kenarda nehir akışı (0 = nehir yok). */
function riverBetween(world, flow, a, b) {
  if (!a.riverMask || !b.riverMask) return 0;
  const ai = a.row * world.cols + a.col;
  for (let d = 0; d < 6; d++) {
    if (!(a.riverMask & (1 << d))) continue;
    if (world.get(a.q + DIRS[d][0], a.r + DIRS[d][1]) === b) return flow[ai * 6 + d];
  }
  return 0;
}

/** Izgara tohumları, hücre başına en ALÇAK aday (nehir kıyısı hafif önde). */
function seedsV2(world, rng) {
  const seeds = [];
  const cellRows = Math.ceil(world.rows / SEED_CELL);
  const cellCols = Math.ceil(world.cols / SEED_CELL);
  for (let cr = 0; cr < cellRows; cr++) {
    for (let cc = 0; cc < cellCols; cc++) {
      let pick = null;
      let pickScore = Infinity;
      for (let dr = 0; dr < SEED_CELL; dr++) {
        const row = cr * SEED_CELL + dr;
        if (row >= world.rows) break;
        for (let dc = 0; dc < SEED_CELL; dc++) {
          const col = cc * SEED_CELL + dc;
          if (col >= world.cols) break;
          const t = world.tiles[row * world.cols + col];
          if (!t.terrain.passable || t.terrain.highland) continue;
          const score = t.elevation - (t.river ? 0.015 : 0) + rng.range(0, 0.012);
          if (score < pickScore) {
            pickScore = score;
            pick = t;
          }
        }
      }
      if (!pick) continue;
      if (rng.chance(Math.min(1, (SEED_CELL * SEED_CELL) / targetV2(pick)))) seeds.push(pick);
    }
  }
  return seeds;
}

function partitionV2(world, rng) {
  const flow = riverFlowTable(world);
  const ridge = ridgeTable(world);
  const seeds = seedsV2(world, rng);
  const caps = seeds.map((seed) => targetV2(seed));
  const { assignment, counts } = growRegions(world, seeds, {
    canEnter: (tile) => tile.terrain.passable,
    edgeCost: (from, to, i) => {
      let c = (to.zone === seeds[i].zone ? 1 : 2.4) + rng.range(0, 0.3);
      const f = riverBetween(world, flow, from, to);
      if (f > 0) c += RIVER_CROSS * (0.5 + 0.5 * f);
      const up = to.elevation - from.elevation;
      if (up > 0) c += UPHILL * up;
      if (to.terrain.highland) c += HIGHLAND_STEP;
      const crest = edgeValue(world, ridge, from, to);
      if (crest > 0) c += RIDGE_CROSS * (0.4 + 0.6 * crest);
      return c;
    },
    budget: (i) => caps[i],
  });
  const crossing = (a, b) => {
    const f = riverBetween(world, flow, a, b);
    const crest = edgeValue(world, ridge, a, b);
    return (f > 0 ? 8 * (0.5 + 0.5 * f) : 0) + (crest > 0 ? 8 * (0.4 + 0.6 * crest) : 0);
  };
  repairOrphans(world, assignment, counts, caps, rng, targetV2, crossing);

  // Tek karelik artık: nehir maliyeti büyümeyi yakada durdurunca iki büyük
  // kümenin arasında kırıntı kalıyordu (tek hexlik province v1'in iki katıydı).
  // Komşusu olan tekli, tavanı dolmamış en küçük komşuya katılır; nehir
  // karşısındaki komşu son çaredir. Ada ve kapalı cep tek kalır.
  const sizes = counts;
  for (const [tile, region] of assignment) {
    if (sizes[region] !== 1) continue;
    let best = -1;
    let bestKey = Infinity;
    for (const n of world.neighbors(tile)) {
      const other = assignment.get(n);
      if (other === undefined || other === region) continue;
      if (sizes[other] >= (caps[other] ?? 8) + 4) continue;
      const key = sizes[other] + (riverBetween(world, flow, tile, n) > 0 ? 1000 : 0);
      if (key < bestKey) {
        bestKey = key;
        best = other;
      }
    }
    if (best < 0) continue;
    assignment.set(tile, best);
    sizes[region] = 0;
    sizes[best]++;
  }
  return assignment;
}

/** Üyelere toplam sarmal mesafesi en küçük üye: küçük kümelerde gerçek merkez. */
function centerOf(world, members) {
  let best = members[0];
  let bestSum = Infinity;
  for (const candidate of members) {
    let sum = 0;
    for (const other of members) {
      sum += world.wrapDistance(candidate.q, candidate.r, other.q, other.r);
    }
    if (sum < bestSum || (sum === bestSum && candidate.row * world.cols + candidate.col
      < best.row * world.cols + best.col)) {
      bestSum = sum;
      best = candidate;
    }
  }
  return best;
}

/**
 * Dünyayı province'lere bölümler. `world.provinces` dizisini kurar ve her
 * geçilebilir kareye `tile.provinceId` yazar (deniz/geçilemez: -1).
 */
export function generateProvinces(world, version = 1) {
  const rng = makeRng(version >= 2 ? `${world.seed}-provinces-v2` : `${world.seed}-provinces`);
  world.forEach((tile) => { tile.provinceId = -1; });

  let assignment;
  if (version >= 2) {
    assignment = partitionV2(world, rng);
  } else {
    const seeds = gridSeeds(world, rng);
    const caps = seeds.map((seed) => sizeTargetOf(seed));
    const grown = growRegions(world, seeds, {
      canEnter: (tile) => tile.terrain.passable,
      // Düşük jitter: kompakt ama tam altıgen olmayan, organik kümeler.
      // Bölge sınırında büyüme yavaşlar: iri bozkır kümesi yoğun-batıya taşmasın.
      stepCost: (tile, i) => (tile.zone === seeds[i].zone ? 1 : 2.4) + rng.range(0, 0.4),
      // Kota tohumun bölgesinden: yoğun-batı 4-5, bozkır/kolonizasyon 11-15.
      budget: (i) => caps[i],
    });
    assignment = grown.assignment;
    repairOrphans(world, assignment, grown.counts, caps, rng);
  }

  // Kümeleri topla; boşları at (kota yarışını tümden kaybeden tohumlar).
  const buckets = new Map();
  for (const [tile, region] of assignment) {
    let list = buckets.get(region);
    if (!list) {
      list = [];
      buckets.set(region, list);
    }
    list.push(tile);
  }
  // Kimlikler üyelerin en küçük kare indeksine göre sıralanır: id'ler tohum
  // sırasından bağımsız, dünyaya göre kararlı ve deterministik olur.
  const groups = [...buckets.values()];
  for (const list of groups) list.sort((a, b) => (a.row * world.cols + a.col) - (b.row * world.cols + b.col));
  groups.sort((a, b) => (a[0].row * world.cols + a[0].col) - (b[0].row * world.cols + b[0].col));

  // Ad benzersizligi: iki "Dornford" ayni ulkede yan yana duruyordu ve
  // Factories ekraninda ayirt edilemiyordu. Cakisan ad, ayni tohumlu
  // ureteci bir daha cekerek cozulur; kararlilik bozulmaz (cekim sirasi
  // kume sirasina baglidir, o da deterministik).
  const usedNames = new Set();
  const provinces = groups.map((members, id) => {
    const center = centerOf(world, members);
    let moveCost = 0;
    let coastal = false;
    const zoneVotes = new Map();
    for (const t of members) {
      t.provinceId = id;
      moveCost += t.terrain.moveCost;
      if (t.coastal) coastal = true;
      if (t.zone) zoneVotes.set(t.zone, (zoneVotes.get(t.zone) ?? 0) + 1);
    }
    let zone = DEFAULT_ZONE;
    let zoneBest = 0;
    for (const [z, votes] of zoneVotes) {
      if (votes > zoneBest || (votes === zoneBest && z < zone)) {
        zone = z;
        zoneBest = votes;
      }
    }
    const nameRng = makeRng(`${world.seed}-provname-${center.q}:${center.r}`);
    let name = nameRng.pick(NAME_A) + nameRng.pick(NAME_B);
    for (let attempt = 0; usedNames.has(name) && attempt < 12; attempt++) {
      name = nameRng.pick(NAME_A) + nameRng.pick(NAME_B);
    }
    usedNames.add(name);
    return {
      id,
      name,
      tileIdx: members.map((t) => t.row * world.cols + t.col),
      center,
      moveCost: moveCost / members.length,
      coastal,
      // Makro bölge (üye çoğunluğu): arketip yerleşimi ve ekonomi çarpanları.
      zone,
      culture: -1,
      owner: -1,
      // Çekirdek toprak: üretimde ev toprağı olan ülke; koloniler -1 kalır.
      coreOf: -1,
      // Ana yurt mixCultures'ta yazılır; şema burada tam dursun.
      homeland: -1,
      neighbors: [],
    };
  });

  // Komşuluk: üye karelerin 6 komşusu üzerinden; sarmal world.neighbors
  // sayesinde dikişi aşan komşuluk kendiliğinden doğru.
  const adjacency = provinces.map(() => new Set());
  for (const province of provinces) {
    for (const idx of province.tileIdx) {
      const tile = world.tiles[idx];
      for (const n of world.neighbors(tile)) {
        if (n.provinceId >= 0 && n.provinceId !== province.id) {
          adjacency[province.id].add(n.provinceId);
        }
      }
    }
  }
  provinces.forEach((province, id) => {
    province.neighbors = [...adjacency[id]].sort((a, b) => a - b);
    for (const other of province.neighbors) {
      console.assert(adjacency[other].has(id), 'province komşuluğu simetrik olmalı', id, other);
    }
  });

  attachImpassableFringe(world, provinces);

  // Kültür bileşimi. `culture` hâlâ ÇOĞUNLUKTUR (eşitlikte küçük id) ve bütün
  // oyun onu okur; yeni olan `cultures`, kümenin tam dağılımıdır.
  //
  // Eskiden oy sayımının yalnız kazananı saklanıyor, geri kalanı atılıyordu:
  // iki halkın sınırından geçen bir küme %51/%49 bile olsa haritada tek renk
  // görünüyordu. Dağılımı saklamak karışımı görünür kılar (bkz. cultures.js
  // mixCultures ve renderer.drawCultureMix).
  for (const province of provinces) {
    const votes = new Map();
    let total = 0;
    for (const idx of province.tileIdx) {
      const c = world.tiles[idx].culture;
      if (c < 0) continue;
      votes.set(c, (votes.get(c) ?? 0) + 1);
      total++;
    }
    const rows = total > 0
      ? [...votes]
        .map(([id, count]) => ({ id, share: count / total }))
        .sort((a, b) => b.share - a.share || a.id - b.id)
      : [];
    province.cultures = rows;
    province.culture = rows[0]?.id ?? -1;
    for (const idx of province.tileIdx) world.tiles[idx].culture = province.culture;
  }
  if (world.cultures?.length) {
    for (const culture of world.cultures) culture.tiles = 0;
    world.forEach((tile) => {
      if (tile.culture >= 0) world.cultures[tile.culture].tiles++;
    });
    world.cultureCounts = world.cultures.map((c) => c.tiles);
  }

  world.provinces = provinces;
  return provinces;
}

/**
 * Geçilmez kara (artık yalnız buz sahanlığı; dağ ve zirve province üyesidir)
 * hiçbir province'e üye olmaz: ne nüfus taşır ne işlenir ne de asker girer.
 * Ama SAHİPSİZ de görünmemeli — politik haritada ülkelerin ortasında gri
 * delikler açıyordu.
 *
 * Çözüm: her geçilmez kare en yakın province'e "etek" (fringe) olarak bağlanır.
 * Ekonomiye girmez (tileIdx'e eklenmez), yalnız boyama ve sınır çizimi onu
 * province'in sahibiyle gösterir. Fetihte otomatik doğru kalır: etek kendi
 * sahibini değil bağlı olduğu province'inkini izler.
 */
function attachImpassableFringe(world, provinces) {
  for (const province of provinces) province.fringeIdx = [];
  const owner = new Int32Array(world.tiles.length).fill(-1);
  let queue = [];
  world.forEach((tile, idx) => {
    tile.fringeOf = -1;
    if (tile.provinceId >= 0) { owner[idx] = tile.provinceId; queue.push(idx); }
  });
  while (queue.length) {
    const next = [];
    for (const idx of queue) {
      const tile = world.tiles[idx];
      for (const n of world.neighbors(tile)) {
        const at = n.row * world.cols + n.col;
        if (owner[at] >= 0 || n.terrain.water || n.terrain.passable) continue;
        owner[at] = owner[idx];
        n.fringeOf = owner[idx];
        provinces[owner[idx]].fringeIdx.push(at);
        next.push(at);
      }
    }
    queue = next;
  }
}
