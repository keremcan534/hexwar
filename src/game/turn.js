// Tur döngüsü: oyuncu hamlesini bitirir -> yapay zekâ oynar -> yeni tur başlar.

import { makeRng } from '../core/rng.js';
import { createUnit, movesFor, removeUnit, UNIT_TYPES } from './units.js';
import { runNationAI } from './ai.js';
import { atWar, computeContacts, initRelations } from './diplomacy.js';
import { executeOrders } from './orders.js';
import {
  CITY_COST, UNIT_COSTS, assignAllWorkers, canAfford, canFoundCity, cityName,
  createCity, growthCost, nationBudget, pay, storageCap, UNIT_UPKEEP, WORK_RADIUS,
} from './cities.js';
import { BUILDINGS, canBuild } from './buildings.js';
import { RESOURCES } from '../world/terrain.js';

/** Başlangıç stoku: ilk birkaç turda bir birim alacak kadar. */
const STARTING_STOCK = { gold: 50, food: 0, timber: 5, iron: 5 };

export class TurnManager {
  constructor(game) {
    this.game = game;
    this.turn = 1;
    this.playerNation = 0;
    this.log = [];
    this.rng = makeRng('turn');
  }

  get world() {
    return this.game.world;
  }

  /** Yeni dünyada başlangıç birimlerini kurar. */
  start(world) {
    world.units = [];
    world.cities = [];
    world.forEach((t) => { t.unit = null; t.city = null; });
    this.turn = 1;
    this.log = [];
    this.rng = makeRng(`${world.seed}-turns`);
    initRelations(world);
    const usedNames = new Set();

    for (const nation of world.nations) {
      nation.alive = nation.tiles > 0;
      for (const r of RESOURCES) nation[r] = STARTING_STOCK[r];
      nation.budget = null;
      if (!nation.alive) continue;
      // Her ülke başkentinde bir şehirle başlar.
      createCity(world, nation.capital, nation.id, cityName(this.rng, usedNames), 2, 3);
      this.spawnAt(nation, 'INFANTRY', { fallbackToCapital: true });
      this.spawnAt(nation, 'SCOUT', { fallbackToCapital: true });
    }
    assignAllWorkers(world);
    for (const nation of world.nations) nation.budget = nationBudget(world, nation);
  }

  /** Şehirlerinden birinde boş kare bulup birim satın alır. */
  buyUnit(nation, typeId) {
    const cost = UNIT_COSTS[typeId];
    if (!nation.alive || !cost || !canAfford(nation, cost)) return null;
    const unit = this.spawnAt(nation, typeId);
    if (!unit) return null;
    pay(nation, cost);
    if (nation.id === this.playerNation) {
      this.addLog(`${UNIT_TYPES[typeId].name} satın alındı.`);
    }
    this.game.emit('units', this.game.selectedUnit);
    return unit;
  }

  /** Şehre bina kurar. Altının asıl gideri burasıdır. */
  build(city, buildingId) {
    const world = this.world;
    const nation = world.nations[city.nationId];
    const building = BUILDINGS[buildingId];
    if (!building || !nation.alive) return false;
    if (!canBuild(world, city, buildingId, WORK_RADIUS)) return false;
    if (!pay(nation, building.cost)) return false;

    city.buildings.push(buildingId);
    if (city.nationId === this.playerNation) {
      this.addLog(`${city.name}: ${building.name} yapıldı.`);
    }
    this.game.emit('units', this.game.selectedUnit);
    this.game.requestRender();
    return true;
  }

  /** Birimin durduğu karede yeni şehir kurar. */
  foundCity(unit) {
    const world = this.world;
    const nation = world.nations[unit.nationId];
    if (!canAfford(nation, CITY_COST)) return null;
    if (!canFoundCity(world, unit.tile, unit.nationId)) return null;
    pay(nation, CITY_COST);
    this.usedCityNames = this.usedCityNames ?? new Set(world.cities.map((c) => c.name));
    const city = createCity(world, unit.tile, unit.nationId, cityName(this.rng, this.usedCityNames));
    unit.movesLeft = 0;
    this.game.renderer.invalidateCache();
    if (unit.nationId === this.playerNation) this.addLog(`${city.name} kuruldu.`);
    this.game.emit('units', this.game.selectedUnit);
    this.game.requestRender();
    return city;
  }

  /**
   * Ulusun şehirlerinden birinde (ya da bitişiğinde) boş kare bulup birim yaratır.
   * Şehri kalmayan ülke birim üretemez — kurulum anı hariç (henüz şehir yok).
   */
  spawnAt(nation, typeId, { fallbackToCapital = false } = {}) {
    const world = this.world;
    const cities = world.cities.filter((c) => c.nationId === nation.id);
    if (!cities.length && !fallbackToCapital) return null;
    const spots = cities.length ? cities.map((c) => c.tile) : [nation.capital];

    const isSea = UNIT_TYPES[typeId].domain === 'sea';
    for (const spot of spots) {
      // Gemi şehrin kendisine değil, bitişik suya iner; şehir kıyıda değilse üretilemez.
      const tile = isSea
        ? world.neighbors(spot).find((n) => n.terrain.navigable && !n.unit)
        : (spot.unit
          ? world.neighbors(spot).find((n) => n.terrain.passable && !n.unit && n.owner === nation.id)
          : spot);
      if (!tile) continue;
      const unit = createUnit(typeId, nation.id, tile);
      world.units.push(unit);
      return unit;
    }
    return null;
  }

  /** Bir karenin sahibini değiştirir; sınırlar değiştiği için önbellek tazelenir. */
  claim(tile, nationId) {
    if (tile.owner === nationId || !tile.terrain.passable) return false;
    const world = this.world;
    // Barış içindeki komşunun toprağı alınamaz.
    if (tile.owner >= 0 && !atWar(world, tile.owner, nationId)) return false;
    if (tile.owner >= 0) world.nations[tile.owner].tiles--;
    tile.owner = nationId;
    world.nations[nationId].tiles++;
    this.game.renderer.invalidateCache();
    return true;
  }

  endTurn() {
    const world = this.world;
    if (!world) return;

    // Temas tablosu tur başında bir kez: her ülke için ayrı taramak pahalı.
    world.contacts = computeContacts(world);
    for (const nation of world.nations) {
      if (nation.id === this.playerNation || !nation.alive) continue;
      runNationAI(this.game, nation, this.rng);
    }

    this.turn++;
    for (const unit of world.units) unit.movesLeft = movesFor(unit);
    // Sıra önemli: sahiplik savaşta değişmiş olabilir, önce işçiler yeniden dağıtılır.
    assignAllWorkers(world);
    this.produce();
    this.checkElimination();
    // Oyuncunun sürekli emirleri yeni turun hakkıyla işlensin: tur açıldığında
    // otomatik ve yol emirli birimler hamlelerini yapmış olur.
    executeOrders(this.game, this.playerNation, this.rng);

    this.game.emit('turn', this.turn);
    this.game.requestRender();
  }

  /**
   * Üretim, tüketim ve büyüme. Erzak ulusta stoklanmaz: üretilir, işçiler ve
   * ordu yer, artan şehir ambarlarına gidip nüfusu büyütür. Açık verilirse
   * ordu beslenemez.
   */
  produce() {
    const world = this.world;
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const budget = nationBudget(world, nation);
      nation.budget = budget;

      const cap = storageCap(budget.cities);
      nation.gold = Math.max(0, nation.gold + budget.net.gold);
      // Ambar taşarsa fazlası ziyan: stok biriktirmek strateji olmasın.
      nation.timber = Math.min(cap, nation.timber + budget.net.timber);
      nation.iron = Math.min(cap, nation.iron + budget.net.iron);

      this.settleFood(nation);
    }
  }

  /**
   * Erzak bilançosunu kapatır. Fazla ambarlara gider ve nüfusu büyütür;
   * açık önce ambarlardan karşılanır. Ambarlar da boşsa ordu beslenemez.
   * Tampon önemli: yoksa kötü arazide doğan ülke ilk turda birim kaybediyor.
   */
  settleFood(nation) {
    const world = this.world;
    const cities = world.cities.filter((c) => c.nationId === nation.id);
    if (!cities.length) return;
    const net = nation.budget.net.food;

    if (net >= 0) {
      const share = net / cities.length;
      for (const city of cities) {
        city.foodStore += share;
        const cost = growthCost(city);
        if (city.foodStore >= cost) {
          city.foodStore -= cost;
          city.pop++;
          // Kalabalıklaşan şehir tahkimatını da güçlendirir (savunma ve çizim).
          city.level = Math.min(4, 1 + Math.floor(city.pop / 4));
          if (nation.id === this.playerNation) this.addLog(`${city.name} büyüdü (${city.pop} işçi).`);
        }
      }
      return;
    }

    let shortfall = -net;
    for (const city of cities) {
      const taken = Math.min(city.foodStore, shortfall);
      city.foodStore -= taken;
      shortfall -= taken;
      if (shortfall <= 0) break;
    }
    // Ambarlar boş ve hâlâ açık varsa: en zayıf birimler dağılır.
    while (shortfall > 0) {
      const units = world.units.filter((u) => u.nationId === nation.id);
      if (!units.length) break;
      units.sort((a, b) => a.type.attack - b.type.attack);
      this.killUnit(units[0]);
      shortfall -= UNIT_UPKEEP.food;
      if (nation.id === this.playerNation) this.addLog('Kıtlık: bir birim dağıldı.');
    }
    nation.budget = nationBudget(world, nation);
  }

  /**
   * Şehri ve birimi kalmayan ülke elenir. Sadece toprağa bakmak yetmiyordu:
   * şehirsiz ülke birim üretemediği için haritada ölü ağırlık olarak kalıyordu.
   */
  checkElimination() {
    const world = this.world;
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const hasUnits = world.units.some((u) => u.nationId === nation.id);
      const hasCities = world.cities.some((c) => c.nationId === nation.id);
      if (hasUnits || hasCities) continue;

      nation.alive = false;
      // Toprakları sahipsizleşir; komşular buraya doğru genişleyebilsin.
      world.forEach((t) => { if (t.owner === nation.id) t.owner = -1; });
      nation.tiles = 0;
      this.game.renderer.invalidateCache();
      this.addLog(`${nation.name} tarih sahnesinden silindi.`);
    }
  }

  addLog(text) {
    this.log.unshift(`T${this.turn}: ${text}`);
    if (this.log.length > 30) this.log.pop();
  }

  killUnit(unit) {
    removeUnit(this.world, unit);
  }
}
