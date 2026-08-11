// Kayıt/yükleme. 300 turluk oyun tek oturumda bitmediği için zorunlu.
//
// Kaydın içine arazi **yazılmaz**: dünya seed'den birebir yeniden üretilebiliyor
// (aynı seed -> aynı yükseklik, iklim, kültür). Yalnız oyun sırasında değişen
// şeyler saklanır. Bu, kaydı küçük tutar ama bir bedeli var: worldgen
// değişirse eski kayıtlar geçersizleşir, o yüzden SAVE_VERSION var.

import { createUnit, refreshArmy, resolveTypeId } from './units.js';
import { createCity, englishCityName } from './cities.js';
import { ensureEconomy } from './economy.js';
import { ensureCommand } from './command.js';
import { ensureBattles } from './battles.js';
import { ensureProvinces } from './provinces.js';
import { ensurePolitics } from './politics.js';
import { ensureConstruction } from './construction.js';

// Ordu sistemi yeniden yazıldı: cephe artık saklanmıyor (sınırdan türetiliyor),
// komuta tek listede toplandı ve muharebe kare anahtarlı oldu. v8'de kaldırılan
// yol ve şehir binası katmanları kare kaydından da çıktı.
export const SAVE_VERSION = 8;
const STORAGE_KEY = 'hexwar.save';

/** Ulusun tur içinde değişen alanları. */
const NATION_FIELDS = ['gold', 'infamy', 'alive', 'debt'];

export function serialize(game) {
  const world = game.world;
  const turns = game.turns;

  // Sahiplik/kültür/işgal: yalnız üretilenden **farklı** olan kareler yazılır.
  const tiles = [];
  world.forEach((tile, index) => {
    if (
      tile.owner < 0
      && (tile.controller ?? tile.owner) === tile.owner
      && !tile.heldSince
      && tile.culture === tile.baseCulture
    ) return;
    tiles.push([
      index, tile.owner, tile.culture, tile.heldSince ?? 0,
      tile.province ? { ...tile.province } : null,
      tile.controller ?? tile.owner,
    ]);
  });

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: world.seed,
    options: world.genOptions ?? {},
    turn: turns.turn,
    playerNation: turns.playerNation,
    log: turns.log.slice(0, 20),
    market: world.market,
    battleSystem: {
      nextId: world.battleSystem?.nextId ?? 1,
      // Aktif muharebeler yüklemede iptal edilir; ordu kimlikleri yeniden üretilir.
      battles: [],
    },
    commandSystem: { nextId: world.commandSystem?.nextId ?? 1 },
    tiles,
    nations: world.nations.map((n) => {
      const out = {
        id: n.id, economy: n.economy, politics: n.politics,
        construction: ensureConstruction(n),
        rallyPoint: n.rallyPoint ?? null,
        // Barış masasında imzalanan süreli şartlar. Türetilebilir veri değil:
        // yazılmazsa tazminat, vassallık ve silahsızlanma yüklemede buhar olur.
        treaties: (n.treaties ?? []).map((t) => ({ ...t })),
        // Cephe kareleri yazılmaz: sınırdan türetilen veridir, ilk haftalık
        // işleyişte kendiliğinden geri gelir.
        generals: (n.generals ?? []).map(({ front, ...g }) => ({
          ...g,
          traits: [...g.traits],
          divisions: [...(g.divisions ?? [])],
        })),
      };
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
    })),
    units: world.units.map((u) => ({
      id: u.id,
      type: u.type.id,
      nationId: u.nationId,
      q: u.tile.q,
      r: u.tile.r,
      hp: u.hp,
      maxHp: u.maxHp,
      path: u.path?.map((tile) => ({ q: tile.q, r: tile.r })) ?? null,
      progress: u.progress ?? 0,
      embarked: u.embarked,
      order: u.order
        ? { type: u.order.type, tq: u.order.target?.q, tr: u.order.target?.r }
        : null,
      regiments: u.regiments?.map((regiment) => ({ ...regiment })) ?? null,
      organization: u.organization,
      morale: u.morale,
      retreatUntil: u.retreatUntil ?? 0,
      attackReadyAt: u.attackReadyAt ?? 0,
      entrenchment: u.entrenchment ?? 0,
      // Cephede tuttuğu province: yüklemede tümenler yerlerinde kalsın.
      post: u.post ? { ...u.post } : null,
    })),
  };
}

/**
 * Kaydı oyuna geri yükler. Dünyayı seed'den yeniden üretip üstüne durumu yazar.
 * @returns {boolean} başarılı mı
 */
export function deserialize(game, data) {
  // Rework sirasinda dunya semasi degisti; eski surumler guvenle acilamaz.
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
    t.units = [];
    t.city = null;
    t.workedBy = null;
    t.owner = -1;
    t.controller = -1;
  });

  // 3) Kareler
  for (const [index, owner, culture, heldSince, province = null, controller = owner] of data.tiles) {
    const tile = world.tiles[index];
    if (!tile) continue;
    tile.owner = owner;
    tile.controller = Number.isInteger(controller) ? controller : owner;
    tile.culture = culture;
    tile.heldSince = heldSince;
    if (province) tile.province = { ...province };
  }

  // 4) Uluslar
  for (const saved of data.nations) {
    const nation = world.nations[saved.id];
    if (!nation) continue;
    for (const f of NATION_FIELDS) nation[f] = saved[f];
    nation.economy = saved.economy ?? nation.economy;
    // Politics eski kayıtlarda yoktur. Başlangıçta üretilen turn-1 verisini
    // taşımak yerine null bırakılır; ensurePolitics gerçek kayıt turuna göre
    // partileri ve bir sonraki seçimi yeniden kurar.
    nation.politics = saved.politics ?? null;
    nation.construction = saved.construction ?? null;
    ensureConstruction(nation);
    nation.rallyPoint = saved.rallyPoint ?? null;
    nation.treaties = (saved.treaties ?? []).map((t) => ({ ...t }));
    nation.generals = (saved.generals ?? []).map((g) => ({
      ...g,
      traits: [...(g.traits ?? [])],
      stance: g.stance ?? 'hold',
      target: g.target ?? null,
      planning: g.planning ?? 0,
      // Cephe kareleri kaydedilmez: ilk haftalik islemede sinirdan turetilir.
      front: [],
    }));
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
    const city = createCity(
      world, tile, saved.nationId, englishCityName(saved.name), saved.level, saved.pop,
    );
    city.pops = { ...saved.pops };
    city.foodStore = 0;
    city.manualWorkers = false;
  }

  // 7) Birimler
  const pendingOrders = [];
  const unitIds = new Map();
  for (const saved of data.units) {
    const tile = world.get(saved.q, saved.r);
    if (!tile) continue;
    // Kaldirilan birim tipleri (örn. Scout) yeni karşılıklarına çevrilir.
    const unit = createUnit(resolveTypeId(saved.type), saved.nationId, tile, world.nations[saved.nationId]);
    if (saved.maxHp) unit.maxHp = saved.maxHp;
    unit.hp = saved.hp;
    unit.path = saved.path?.map((step) => world.get(step.q, step.r)).filter(Boolean) ?? null;
    if (!unit.path?.length) unit.path = null;
    unit.progress = saved.progress ?? 0;
    unit.embarked = saved.embarked;
    if (saved.regiments?.length) {
      unit.regiments = saved.regiments.map((regiment) => ({
        ...regiment,
        // Old starting armies were not deducted from province population.
        // An explicit empty draw list prevents disbanding them from creating
        // thousands of residents out of thin air.
        draws: Array.isArray(regiment.draws)
          ? regiment.draws.map((draw) => ({ ...draw })) : [],
      }));
      refreshArmy(unit);
    }
    unit.organization = saved.organization ?? saved.morale ?? unit.organization;
    unit.morale = unit.organization;
    unit.retreatUntil = saved.retreatUntil ?? 0;
    unit.attackReadyAt = saved.attackReadyAt ?? 0;
    unit.entrenchment = Math.max(0, Math.min(0.35, saved.entrenchment ?? 0));
    unit.post = saved.post ? { ...saved.post } : null;
    world.units.push(unit);
    if (saved.id != null) unitIds.set(saved.id, unit.id);
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
  ensureEconomy(world);
  ensurePolitics(world);
  ensureProvinces(world);
  if (data.market) {
    world.market = data.market;
    ensureEconomy(world);
  }
  ensureBattles(world);
  if (data.battleSystem) world.battleSystem = data.battleSystem;
  if (data.commandSystem) world.commandSystem = data.commandSystem;
  else if (data.generalSystem) world.commandSystem = { ...data.generalSystem };
  ensureCommand(world);
  // createUnit kimlikleri süreç boyunca artar. Kayıttaki komuta bağlantılarını
  // yeni kimliklere taşımazsak yüklenen bütün komuta zinciri sessizce kopar.
  for (const nation of world.nations) {
    for (const general of nation.generals ?? []) {
      general.divisions = (general.divisions ?? [])
        .map((id) => unitIds.get(id))
        .filter((id) => id != null);
    }
  }
  game.setSpeed(0);

  game.selected = null;
  game.activeGeneral = null;
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
