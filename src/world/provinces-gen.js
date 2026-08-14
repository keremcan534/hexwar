// CK3 tarzı province bölümlemesi: geçilebilir kara, 2-7 hexlik bitişik ve
// kompakt kümelere ayrılır. Ordular hex hex yürümeye devam eder; nüfus, RGO
// ve binalar bu kümelerde yaşayacak (bkz. game/provinces.js geçişi).
//
// Kendi rng dalını kullanır (`${seed}-provinces`): ana üretim akışına tek
// çekim bile eklemez, arazi/kültür aynı tohumda birebir aynı kalır.
//
// Katman notu: world katmanıdır, DOM'a ve game'e dokunmaz.

import { makeRng } from '../core/rng.js';
import { growRegions } from './regions.js';

/** Hedef ortalama boy; growRegions kotası ve tohum yoğunluğu buna göre. */
const TARGET_SIZE = 4.5;
/** growRegions kotası: tek province bundan büyük büyüyemez. */
const GROW_CAP = 7;
/** Artık onarımı katılımlarıyla üst tolerans. */
const MAX_SIZE = 8;
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
          if (t.terrain.passable) bucket.push(t);
        }
      }
      if (bucket.length) seeds.push(rng.pick(bucket));
    }
  }
  return seeds;
}

/**
 * growRegions kota dolunca kareyi atar; atananlara bitişik artıklar en küçük
 * komşu province'e katılır (bitişiklik bozulmaz). Hiçbir province'e değmeyen
 * bileşenler (adalar, kapalı cepler) kendi province'lerini kurar.
 */
function repairOrphans(world, assignment, counts, rng) {
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
          if (counts[region] < bestCount) {
            bestCount = counts[region];
            best = region;
          }
        }
        if (best < 0 || bestCount >= MAX_SIZE) return;
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

    if (component.length <= GROW_CAP) {
      // İzole ada ya da dolu komşulara sıkışmış cep: kendi province'i olur.
      const region = counts.length;
      counts.push(0);
      for (const member of component) {
        assignment.set(member, region);
        counts[region]++;
      }
      continue;
    }
    // Büyük bileşen kendi içinde bölünür.
    const seedCount = Math.ceil(component.length / TARGET_SIZE);
    const stride = component.length / seedCount;
    const seeds = [];
    for (let i = 0; i < seedCount; i++) seeds.push(component[Math.floor(i * stride)]);
    const sub = growRegions(world, seeds, {
      canEnter: (t) => componentSet.has(t) && !assignment.has(t),
      stepCost: () => 1 + rng.range(0, 0.4),
      budget: () => GROW_CAP,
    });
    const offset = counts.length;
    for (let i = 0; i < seeds.length; i++) counts.push(0);
    for (const [member, sr] of sub.assignment) {
      assignment.set(member, offset + sr);
      counts[offset + sr]++;
    }
  }
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
export function generateProvinces(world) {
  const rng = makeRng(`${world.seed}-provinces`);
  world.forEach((tile) => { tile.provinceId = -1; });

  const seeds = gridSeeds(world, rng);
  const { assignment, counts } = growRegions(world, seeds, {
    canEnter: (tile) => tile.terrain.passable,
    // Düşük jitter: kompakt ama tam altıgen olmayan, organik kümeler.
    stepCost: () => 1 + rng.range(0, 0.4),
    budget: () => GROW_CAP,
  });
  repairOrphans(world, assignment, counts, rng);

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

  const provinces = groups.map((members, id) => {
    const center = centerOf(world, members);
    let moveCost = 0;
    let coastal = false;
    for (const t of members) {
      t.provinceId = id;
      moveCost += t.terrain.moveCost;
      if (t.coastal) coastal = true;
    }
    const nameRng = makeRng(`${world.seed}-provname-${center.q}:${center.r}`);
    return {
      id,
      name: nameRng.pick(NAME_A) + nameRng.pick(NAME_B),
      tileIdx: members.map((t) => t.row * world.cols + t.col),
      center,
      moveCost: moveCost / members.length,
      coastal,
      culture: -1,
      owner: -1,
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

  // Kültür snap: province tek kültür konuşur (çoğunluk; eşitlikte küçük id).
  // Sayaçlar yeniden kurulur ki cultureCounts gerçek dağılımı yansıtsın.
  for (const province of provinces) {
    const votes = new Map();
    for (const idx of province.tileIdx) {
      const c = world.tiles[idx].culture;
      if (c >= 0) votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    let winner = -1;
    let winnerVotes = -1;
    for (const [c, v] of votes) {
      if (v > winnerVotes || (v === winnerVotes && c < winner)) {
        winner = c;
        winnerVotes = v;
      }
    }
    province.culture = winner;
    for (const idx of province.tileIdx) world.tiles[idx].culture = winner;
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
