// Kayıt/yükleme. 300 turluk oyun tek oturumda bitmediği için zorunlu.
//
// Kaydın içine arazi **yazılmaz**: dünya seed'den birebir yeniden üretilebiliyor
// (aynı seed -> aynı yükseklik, iklim, kültür). Yalnız oyun sırasında değişen
// şeyler saklanır. Bu, kaydı küçük tutar ama bir bedeli var: worldgen
// değişirse eski kayıtlar geçersizleşir, o yüzden SAVE_VERSION var.

import { UNIT_TYPES, createUnit } from './units.js';
import { createCity } from './cities.js';

export const SAVE_VERSION = 1;
const STORAGE_KEY = 'hexwar.save';

/** Ulusun tur içinde değişen alanları. */
const NATION_FIELDS = ['gold', 'food', 'timber', 'iron', 'infamy', 'alive'];

export function serialize(game) {
  const world = game.world;
  const turns = game.turns;

  // Sahiplik/kültür/işgal: yalnız üretilenden **farklı** olan kareler yazılır.
  const tiles = [];
  world.forEach((tile, index) => {
    if (tile.owner < 0 && !tile.heldSince && tile.culture === tile.baseCulture) return;
    tiles.push([index, tile.owner, tile.culture, tile.heldSince ?? 0]);
  });

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: world.seed,
    options: world.genOptions ?? {},
    turn: turns.turn,
    playerNation: turns.playerNation,
    log: turns.log.slice(0, 20),
    tiles,
    nations: world.nations.map((n) => {
      const out = { id: n.id };
      for (const f of NATION_FIELDS) out[f] = n[f];
      return out;
    }),
    relations: world.relations.map((row, a) => row.map((rec, b) => (
      b <= a || !rec ? null : [rec.state, rec.since, rec.truceUntil ?? 0]
    ))),
    cities: world.cities.map((c) => ({
      name: c.name,
      q: c.tile.q,
      r: c.tile.r,
      nationId: c.nationId,
      level: c.level,
      pop: c.pop,
      pops: c.pops,
      buildings: c.buildings.slice(),
      foodStore: c.foodStore,
      manualWorkers: c.manualWorkers,
    })),
    units: world.units.map((u) => ({
      type: u.type.id,
      nationId: u.nationId,
      q: u.tile.q,
      r: u.tile.r,
      hp: u.hp,
      movesLeft: u.movesLeft,
      embarked: u.embarked,
      order: u.order
        ? { type: u.order.type, tq: u.order.target?.q, tr: u.order.target?.r }
        : null,
    })),
  };
}

/**
 * Kaydı oyuna geri yükler. Dünyayı seed'den yeniden üretip üstüne durumu yazar.
 * @returns {boolean} başarılı mı
 */
export function deserialize(game, data) {
  if (!data || data.version !== SAVE_VERSION) return false;

  // 1) Aynı seed ve ayarlarla dünyayı yeniden kur (arazi, iklim, kültür aynı).
  game.newWorld(data.seed, data.options);
  const world = game.world;
  const turns = game.turns;

  // 2) Üretimden gelen durumu temizle: kayıt tam durumu taşır.
  world.units.length = 0;
  world.cities.length = 0;
  world.forEach((t) => {
    t.unit = null;
    t.city = null;
    t.workedBy = null;
    t.owner = -1;
  });

  // 3) Kareler
  for (const [index, owner, culture, heldSince] of data.tiles) {
    const tile = world.tiles[index];
    if (!tile) continue;
    tile.owner = owner;
    tile.culture = culture;
    tile.heldSince = heldSince;
  }

  // 4) Uluslar
  for (const saved of data.nations) {
    const nation = world.nations[saved.id];
    if (!nation) continue;
    for (const f of NATION_FIELDS) nation[f] = saved[f];
  }

  // 5) İlişkiler — simetrik nesne paylaşımı korunmalı.
  for (let a = 0; a < data.relations.length; a++) {
    for (let b = a + 1; b < data.relations.length; b++) {
      const entry = data.relations[a][b];
      if (!entry) continue;
      const rec = { state: entry[0], since: entry[1], truceUntil: entry[2] };
      world.relations[a][b] = rec;
      world.relations[b][a] = rec;
    }
  }

  // 6) Şehirler
  for (const saved of data.cities) {
    const tile = world.get(saved.q, saved.r);
    if (!tile) continue;
    const city = createCity(world, tile, saved.nationId, saved.name, saved.level, saved.pop);
    city.pops = { ...saved.pops };
    city.buildings = saved.buildings.slice();
    city.foodStore = saved.foodStore;
    city.manualWorkers = saved.manualWorkers;
  }

  // 7) Birimler
  const pendingOrders = [];
  for (const saved of data.units) {
    const tile = world.get(saved.q, saved.r);
    if (!tile || !UNIT_TYPES[saved.type]) continue;
    const unit = createUnit(saved.type, saved.nationId, tile);
    unit.hp = saved.hp;
    unit.movesLeft = saved.movesLeft;
    unit.embarked = saved.embarked;
    world.units.push(unit);
    if (saved.order) pendingOrders.push([unit, saved.order]);
  }
  // Emirler birimler yerleştikten sonra: hedef karesi çözülebilsin.
  for (const [unit, order] of pendingOrders) {
    const target = order.tq === undefined ? null : world.get(order.tq, order.tr);
    unit.order = { type: order.type, target, blocked: 0 };
  }

  // 8) Tur durumu
  turns.turn = data.turn;
  world.turn = data.turn;
  turns.playerNation = data.playerNation;
  turns.log = data.log ?? [];

  game.selected = null;
  game.selectUnit(null);
  game.recomputeEconomy();
  game.renderer.invalidateCache();
  game.emit('world', world);
  game.emit('turn', turns.turn);
  game.requestRender();
  return true;
}

export function saveToStorage(game, slot = STORAGE_KEY) {
  try {
    localStorage.setItem(slot, JSON.stringify(serialize(game)));
    return true;
  } catch (err) {
    // Kota dolabilir ya da gizli sekmede depolama kapalı olabilir.
    return false;
  }
}

export function loadFromStorage(game, slot = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(slot);
    if (!raw) return false;
    return deserialize(game, JSON.parse(raw));
  } catch (err) {
    return false;
  }
}

export function hasSave(slot = STORAGE_KEY) {
  try {
    return Boolean(localStorage.getItem(slot));
  } catch (err) {
    return false;
  }
}

export function savedInfo(slot = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(slot);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { seed: data.seed, turn: data.turn, savedAt: data.savedAt };
  } catch (err) {
    return null;
  }
}
