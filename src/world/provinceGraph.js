// ASKERI HAREKET GRAFI — hex (HOI4'ün province'i) ve deniz kareleri.
//
// HOI4 modeli: ekonominin, binaların ve kültürün birimi province KÜMESİDİR
// (oyuncunun gözünde "state"); ordu ise HEX hex yürür — her organik hücre
// bir HOI4 province'idir. Ordu bir hexten komşu hexe geçer, girdiği hexi
// işgal eder; kümenin sahipliği yalnız barış masasında değişir, işgal payı
// ise kümenin üretimini düşürür (provinces.occupiedShareOf).
//
// Önceki adımda (65eceae) ordu küme merkezinden küme merkezine yürüyordu;
// Kerem "askerler state bazlı değil province bazlı yürüsün" dedi: ~7 hexlik
// küme adımı haritada state atlaması gibi görünüyordu.
//
// Düğüm bir KAREDİR (geçilebilir kara ya da deniz): birim, yığın, muharebe
// ve çizim kodu `unit.tile` üzerinden aynen çalışır; komşuluk ve mesafe bu
// graftan sorulur. API küme modeliyle aynıdır (nodeOf, nodeNeighbors...).
//
// Katman notu: world katmanıdır, DOM'a ve game'e dokunmaz.

import { DIRS } from '../core/hex.js';

/** Ordunun durabileceği ya da yüzebileceği kare. */
function walkable(tile) {
  return Boolean(tile) && (tile.terrain.water || tile.terrain.passable);
}

/** Karenin düğümü: hex modelinde karenin kendisi. */
export function nodeOf(world, tile) {
  return tile ?? null;
}

/** Bu kare bir hareket düğümü mü? (geçilmez dağ değil) */
export function isNode(world, tile) {
  return walkable(tile);
}

const GRAPH_CACHE = new WeakMap();

/**
 * Düğüm → komşu düğümler. Dünya başına bir kez kurulur: arazi oyun boyunca
 * değişmez. world.neighbors her çağrıda dizi kurar ve haftalık cephe
 * taraması onu milyonlarca kez çağırırdı; önbellek tek dizi verir.
 */
function graphOf(world) {
  let graph = GRAPH_CACHE.get(world);
  if (graph) return graph;
  graph = new Map();
  for (const tile of world.tiles) {
    if (!walkable(tile)) continue;
    const list = [];
    for (let d = 0; d < DIRS.length; d++) {
      const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
      if (walkable(near)) list.push(near);
    }
    graph.set(tile, list);
  }
  GRAPH_CACHE.set(world, graph);
  return graph;
}

/** Düğümün komşu düğümleri; sıra deterministiktir (hex yön sırası). */
export function nodeNeighbors(world, tile) {
  if (!tile) return [];
  return graphOf(world).get(tile) ?? [];
}

/** İki düğüm komşu mu (bir adımda yürünür / saldırılır)? */
export function nodesAdjacent(world, a, b) {
  if (!a || !b || a === b) return false;
  return nodeNeighbors(world, a).includes(b);
}

/**
 * Gemiye binme / gemiden inme bedeli (bir haftalık yürüyüşün yarısı kadar).
 * Bedelsizken kıyıdan denize atlamak kara yolundan ucuz geliyordu: YZ kıyı
 * boyunca sürekli bindirip indiriyordu (ölçüldü: military-strategy, 213 vaka).
 */
const EMBARK_COST = 4;

/** Düğümler arası adım maliyeti: hedef karenin arazisi, binme/inmede ek bedel. */
export function nodeStepCost(world, from, to) {
  if (to.terrain.water) {
    return to.terrain.seaCost + (from && !from.terrain.water ? EMBARK_COST : 0);
  }
  return to.terrain.moveCost + (from?.terrain.water ? EMBARK_COST : 0);
}

/**
 * İki komşu hex arasındaki kenar NEHİR mi? Muharebe nehir aşarak saldırana
 * ceza keser (battles.js). Province üreteci v2 küme sınırlarını nehirlere
 * oturtur, yani nehir hatları doğal savunma hattıdır.
 */
export function riverBetween(world, a, b) {
  if (!a || !b || a === b) return false;
  for (let d = 0; d < DIRS.length; d++) {
    if (world.get(a.q + DIRS[d][0], a.r + DIRS[d][1]) === b) return Boolean((a.riverMask ?? 0) & (1 << d));
  }
  return false;
}
