// CEPHE GÜCÜ — haritadaki cephe levhalarının (ui/frontPlates.js) dökümü.
//
// Tarih videolarındaki "123,345" cephe rakamı burada SAYILIR, çizimde değil.
// Bizim tarafın sayısı generalin tümenlerinin İNSAN toplamıdır: ordu
// paneliyle (armyPanel statsHtml) aynı fonksiyon, `menUnderArms`. Karşı
// tarafınki cephe kuşağındaki düşman tümenlerininki, aynı fonksiyonla.
//
// Kuşak: cephe karelerinden en çok ZONE_DEPTH kara adımı uzaktaki kareler.
// Birden çok cephe aynı düşman tümenine bakıyorsa tümen EN YAKIN cepheye
// sayılır (çok kaynaklı BFS, eşitlikte sıra): bitişik iki sektörün levhası
// aynı adamı iki kez saymasın, levhaların toplamı düşman ordusunu aşmasın.
//
// Salt okunur: cephe burada HESAPLANMAZ (refreshFront dünyayı yazar), zar
// çekilmez. Levha generalin son hesaplanan cephesini (general.front) okur;
// komuta adımı onu haftada bir, seçim ve çizim anında tazeler.

import { atWar } from './diplomacy.js';
import { isAllied } from './alliances.js';
import { controllerOf } from './control.js';
import { BRANCH, frontTilesOf, officersOf } from './command.js';
import { menUnderArms } from './units.js';
import { nodeNeighbors } from '../world/provinceGraph.js';

/**
 * Düşman kuşağının derinliği (kara adımı). Cephe hexinin hemen karşısı tek
 * adımdır; ikinci-üçüncü sıra yedekleri ve hücuma yığılan tümenleri de
 * kapsar. Daha derini cepheyle ilgisiz garnizonları saymaya başlıyordu.
 */
export const ZONE_DEPTH = 3;

function landNode(tile) {
  return Boolean(tile) && !tile.terrain.water && tile.terrain.passable;
}

/** Sarmal dünyada iki x arasındaki en kısa fark (a − b). */
function wrapDx(world, a, b) {
  const P = world.wrapWidth;
  let dx = a - b;
  if (P) dx -= P * Math.round(dx / P);
  return dx;
}

/** Ağırlık merkezine en yakın cephe karesi (renderer.frontAnchor ile aynı kural, sarmal farkıyla). */
function anchorOf(world, tiles) {
  const base = tiles[0];
  let sx = 0;
  let sy = 0;
  for (const tile of tiles) {
    sx += wrapDx(world, tile.x, base.x);
    sy += tile.y;
  }
  const cx = base.x + sx / tiles.length;
  const cy = sy / tiles.length;
  let best = base;
  let bestD = Infinity;
  for (const tile of tiles) {
    const d = wrapDx(world, tile.x, cx) ** 2 + (tile.y - cy) ** 2;
    if (d < bestD) { bestD = d; best = tile; }
  }
  return best;
}

/**
 * Cephenin BİZE bakan normali: her cephe karesinden, ona komşu düşman
 * karelerinden geriye doğru birim vektörlerin toplamı. Levha bu yönde
 * kendi tarafımıza, düşmanınki ters yönde onun tarafına kayar.
 * @returns {{ normal: {x:number,y:number}, enemyIds: Set<number> }}
 */
function facingOf(world, tiles, hostile) {
  let nx = 0;
  let ny = 0;
  const enemyIds = new Set();
  for (const tile of tiles) {
    for (const near of nodeNeighbors(world, tile)) {
      if (!landNode(near)) continue;
      const owner = controllerOf(near);
      if (owner < 0 || !hostile(owner)) continue;
      enemyIds.add(owner);
      const dx = wrapDx(world, tile.x, near.x);
      const dy = tile.y - near.y;
      const len = Math.hypot(dx, dy) || 1;
      nx += dx / len;
      ny += dy / len;
    }
  }
  const len = Math.hypot(nx, ny);
  // Dejenere cephe (iki yandan kuşatılmış dilim): yukarı bakan levha.
  return { normal: len > 1e-6 ? { x: nx / len, y: ny / len } : { x: 0, y: -1 }, enemyIds };
}

/**
 * Oyuncunun (ve ortak düşmana karşı savaşan müttefiklerinin) etkin kara
 * cepheleri: geometri, düşman kuşağı. Haftalık ya da komuta değişince kurulur.
 *
 * Etkin cephe = generalin tümeni var ve cephesi oyuncunun SAVAŞTIĞI bir
 * ulusun denetimindeki kareye bitişik. Barıştaki sınır cephesi levha almaz.
 *
 * @returns {{ playerId:number, fronts: object[], zone: Map<object, number> }}
 */
export function frontGeometry(world, playerId) {
  const me = world?.nations?.[playerId];
  const fronts = [];
  const zone = new Map();
  if (!me?.alive) return { playerId, fronts, zone };
  const enemiesOfPlayer = new Set(world.nations
    .filter((n) => n.alive && n.id !== playerId && atWar(world, playerId, n.id))
    .map((n) => n.id));
  if (!enemiesOfPlayer.size) return { playerId, fronts, zone };

  const collect = (nation, side, hostile) => {
    for (const general of officersOf(nation, BRANCH.ARMY)) {
      if (!general.divisions?.length) continue;
      const tiles = frontTilesOf(world, general).filter(landNode);
      if (!tiles.length) continue;
      const { normal, enemyIds } = facingOf(world, tiles, hostile);
      if (!enemyIds.size) continue;
      const anchor = anchorOf(world, tiles);
      fronts.push({
        key: `${side}:${nation.id}:${general.id}`,
        side,
        nationId: nation.id,
        general,
        tiles,
        anchor,
        normal,
        enemyIds: [...enemyIds].sort((a, b) => a - b),
        place: world.provinces?.[anchor.provinceId]?.name ?? null,
      });
    }
  };
  collect(me, 'own', (id) => enemiesOfPlayer.has(id));
  // Müttefik: yalnız ORTAK düşmana bakan cephesi (başka savaşı bizim değil).
  for (const nation of world.nations) {
    if (!nation.alive || nation.id === playerId || !isAllied(me, nation.id)) continue;
    collect(nation, 'ally', (id) => enemiesOfPlayer.has(id) && atWar(world, nation.id, id));
  }

  // Çok kaynaklı BFS: her kuşak karesi en yakın cepheye (eşitlikte önce
  // listelenene: oyuncu, sonra general kimliği) aittir.
  let frontier = [];
  fronts.forEach((front, index) => {
    for (const tile of front.tiles) {
      if (zone.has(tile)) continue;
      zone.set(tile, index);
      frontier.push(tile);
    }
  });
  for (let depth = 0; depth < ZONE_DEPTH && frontier.length; depth++) {
    const next = [];
    for (const tile of frontier) {
      const index = zone.get(tile);
      for (const near of nodeNeighbors(world, tile)) {
        if (!landNode(near) || zone.has(near)) continue;
        zone.set(near, index);
        next.push(near);
      }
    }
    frontier = next;
  }
  return { playerId, fronts, zone };
}

/**
 * Cephelerin İNSAN sayıları (her hafta, muharebe ve takviye sonrası).
 * Geometri değişmeden sayılar değişir: ikisi ayrı tutulur ki levha her
 * kayıpta cepheyi yeniden kurmasın.
 *
 * @returns {Array<{ key, ourMen, ourDivisions, enemyMen, enemyDivisions,
 *   enemies: Array<{ id, men, divisions }> }>} geometrinin sırasıyla
 */
export function frontCounts(world, geometry) {
  const { fronts, zone } = geometry;
  if (!fronts.length) return [];
  const unitById = new Map();
  for (const unit of world.units ?? []) unitById.set(unit.id, unit);
  const out = fronts.map((front) => {
    let men = 0;
    let divisions = 0;
    for (const id of front.general.divisions) {
      const unit = unitById.get(id);
      if (!unit || unit.hp <= 0 || unit.type?.domain !== 'land') continue;
      men += menUnderArms(unit);
      divisions++;
    }
    return { key: front.key, ourMen: men, ourDivisions: divisions, enemyMen: 0, enemyDivisions: 0, enemies: new Map() };
  });
  // Savaş durumu ulus çifti başına bir kez (birim başına atWar taraması değil).
  const war = new Map();
  for (const unit of world.units ?? []) {
    if (unit.hp <= 0 || unit.type?.domain !== 'land' || unit.tile?.terrain?.water) continue;
    const index = zone.get(unit.tile);
    if (index === undefined) continue;
    const front = fronts[index];
    const pair = front.nationId * 4096 + unit.nationId;
    let hostile = war.get(pair);
    if (hostile === undefined) {
      hostile = unit.nationId !== front.nationId && atWar(world, front.nationId, unit.nationId);
      war.set(pair, hostile);
    }
    if (!hostile) continue;
    const row = out[index];
    const men = menUnderArms(unit);
    row.enemyMen += men;
    row.enemyDivisions++;
    const by = row.enemies.get(unit.nationId) ?? { id: unit.nationId, men: 0, divisions: 0 };
    by.men += men;
    by.divisions++;
    row.enemies.set(unit.nationId, by);
  }
  for (const row of out) {
    row.enemies = [...row.enemies.values()].sort((a, b) => b.men - a.men || a.id - b.id);
  }
  return out;
}

/** Tek çağrıda geometri + sayılar (denetim ve konsol için). */
export function frontStrengths(world, playerId) {
  const geometry = frontGeometry(world, playerId);
  const counts = frontCounts(world, geometry);
  return geometry.fronts.map((front, index) => ({ ...front, ...counts[index] }));
}
