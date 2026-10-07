// ASKERI HAREKET GRAFI — kara province'lerinden ve deniz karelerinden.
//
// Harita birimi province'tir: ordu karada yalnız province MERKEZ karesinde
// durur ve bir province'ten komşu province'e yürür. Deniz province'siz kalır;
// filolar ve bindirilmiş ordular hex hex gider, kıyı province'ine kıyıdaki
// deniz karesinden çıkılır.
//
// Düğüm bir KAREDİR (province merkezi ya da deniz karesi): birim, yığın,
// muharebe ve çizim kodu `unit.tile` üzerinden aynen çalışır; yalnız komşuluk
// ve mesafe bu graftan sorulur.
//
// Katman notu: world katmanıdır, DOM'a ve game'e dokunmaz.

/** Kara karesinin bağlı olduğu province (geçilmez etek de bağlı olduğu province). */
function provinceOfTile(world, tile) {
  const id = tile.provinceId >= 0 ? tile.provinceId : (tile.fringeOf ?? -1);
  return id >= 0 ? world.provinces?.[id] ?? null : null;
}

/**
 * Karenin düğümü: kara → province merkezi, deniz → kendisi. Province'i
 * olmayan kara (üretimden kalmış artık) kendisi olarak kalır.
 */
export function nodeOf(world, tile) {
  if (!tile) return null;
  if (tile.terrain.water) return tile;
  return provinceOfTile(world, tile)?.center ?? tile;
}

/** Bu kare bir hareket düğümü mü? */
export function isNode(world, tile) {
  return Boolean(tile) && nodeOf(world, tile) === tile;
}

const GRAPH_CACHE = new WeakMap();

/**
 * Düğüm → komşu düğümler. Dünya başına bir kez kurulur: province bölümlemesi
 * oyun boyunca değişmez (sahiplik değişir, kümeler değişmez).
 */
function graphOf(world) {
  let graph = GRAPH_CACHE.get(world);
  if (graph) return graph;
  graph = new Map();
  const link = (a, b) => {
    if (a === b) return;
    let list = graph.get(a);
    if (!list) graph.set(a, (list = []));
    if (!list.includes(b)) list.push(b);
  };
  // Kara: province komşuluğu (province.neighbors) + üyelerine değen deniz.
  for (const province of world.provinces ?? []) {
    const center = province.center;
    if (!center) continue;
    graph.set(center, graph.get(center) ?? []);
    for (const id of province.neighbors ?? []) {
      const other = world.provinces[id]?.center;
      if (other) link(center, other);
    }
    for (const idx of province.tileIdx ?? []) {
      for (const near of world.neighbors(world.tiles[idx])) {
        if (!near.terrain.water) continue;
        link(center, near);
        link(near, center);
      }
    }
  }
  // Deniz: hex komşuluğu (yalnız su).
  for (const tile of world.tiles) {
    if (!tile.terrain.water) continue;
    for (const near of world.neighbors(tile)) {
      if (near.terrain.water) link(tile, near);
    }
  }
  GRAPH_CACHE.set(world, graph);
  return graph;
}

/**
 * Düğümün komşu düğümleri. Düğüm olmayan kare verilirse önce düğümüne
 * çekilir; graftaki sıra deterministiktir (province id, sonra kare sırası).
 */
export function nodeNeighbors(world, tile) {
  const node = nodeOf(world, tile);
  if (!node) return [];
  return graphOf(world).get(node) ?? world.neighbors(node);
}

/** İki düğüm komşu mu (bir adımda yürünür / saldırılır)? */
export function nodesAdjacent(world, a, b) {
  const na = nodeOf(world, a);
  const nb = nodeOf(world, b);
  if (!na || !nb || na === nb) return false;
  return nodeNeighbors(world, na).includes(nb);
}

/**
 * Gemiye binme / gemiden inme bedeli (bir haftalık yürüyüşün yarısı kadar).
 * Bedelsizken kıyı province merkezinden denize atlamak kara yolundan ucuz
 * geliyordu: YZ kıyı boyunca sürekli bindirip indiriyor, varış merkezi
 * dolunca tümen koyda kalıyordu (ölçüldü: military-strategy, 213 vaka).
 */
const EMBARK_COST = 4;

/**
 * Düğümler arası adım maliyeti: merkezler arası hex mesafesi × hedefin arazi
 * maliyeti. Hex hex yürüyüşün temposu korunur — province'i boydan boya
 * geçmek eskisi kadar sürer, yalnız ara karelerde durulmaz. Kıyıya inişte
 * merkezden kıyıya olan kara kısmı kara maliyetiyle ödenir; binme ve inme
 * ayrıca EMBARK_COST tutar.
 */
export function nodeStepCost(world, from, to) {
  const hexes = Math.max(1, world.wrapDistance(from.q, from.r, to.q, to.r));
  if (to.terrain.water) {
    if (from.terrain.water) return hexes * to.terrain.seaCost;
    const origin = provinceOfTile(world, from);
    return hexes * Math.max(to.terrain.seaCost, origin?.moveCost ?? 1) + EMBARK_COST;
  }
  const province = provinceOfTile(world, to);
  const land = hexes * (province?.moveCost ?? to.terrain.moveCost);
  return from.terrain.water ? land + EMBARK_COST : land;
}
