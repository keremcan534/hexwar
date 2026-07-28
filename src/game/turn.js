// Tur döngüsü: oyuncu hamlesini bitirir -> yapay zekâ oynar -> yeni tur başlar.

import { makeRng } from '../core/rng.js';
import { createUnit, removeUnit, UNIT_TYPES } from './units.js';
import { runNationAI } from './ai.js';
import {
  CITY_COST, UNIT_PRICES, UNIT_UPKEEP, canFoundCity, cityName, createCity, nationBudget,
} from './cities.js';

/** Başlangıç hazinesi: ilk birkaç turda bir birim alacak kadar. */
const STARTING_GOLD = 60;

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
    const usedNames = new Set();

    for (const nation of world.nations) {
      nation.alive = nation.tiles > 0;
      nation.gold = STARTING_GOLD;
      nation.income = 0;
      if (!nation.alive) continue;
      // Her ülke başkentinde bir şehirle başlar.
      createCity(world, nation.capital, nation.id, cityName(this.rng, usedNames), 2);
      this.spawnAt(nation, 'INFANTRY', { fallbackToCapital: true });
      this.spawnAt(nation, 'SCOUT', { fallbackToCapital: true });
    }
    for (const nation of world.nations) {
      const budget = nationBudget(world, nation);
      nation.gross = budget.gross;
      nation.upkeep = budget.upkeep;
      nation.income = budget.net;
    }
  }

  /** Şehirlerinden birinde boş kare bulup birim satın alır. */
  buyUnit(nation, typeId) {
    const price = UNIT_PRICES[typeId];
    if (!nation.alive || price === undefined || nation.gold < price) return null;
    const unit = this.spawnAt(nation, typeId);
    if (!unit) return null;
    nation.gold -= price;
    if (nation.id === this.playerNation) {
      this.addLog(`${UNIT_TYPES[typeId].name} satın alındı (${price} altın).`);
    }
    this.game.emit('units', this.game.selectedUnit);
    return unit;
  }

  /** Birimin durduğu karede yeni şehir kurar. */
  foundCity(unit) {
    const world = this.world;
    const nation = world.nations[unit.nationId];
    if (nation.gold < CITY_COST) return null;
    if (!canFoundCity(world, unit.tile, unit.nationId)) return null;
    nation.gold -= CITY_COST;
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

    for (const spot of spots) {
      const tile = spot.unit
        ? world.neighbors(spot).find((n) => n.terrain.passable && !n.unit && n.owner === nation.id)
        : spot;
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
    if (tile.owner >= 0) world.nations[tile.owner].tiles--;
    tile.owner = nationId;
    world.nations[nationId].tiles++;
    this.game.renderer.invalidateCache();
    return true;
  }

  endTurn() {
    const world = this.world;
    if (!world) return;

    for (const nation of world.nations) {
      if (nation.id === this.playerNation || !nation.alive) continue;
      runNationAI(this.game, nation, this.rng);
    }

    this.turn++;
    for (const unit of world.units) unit.movesLeft = unit.type.moves;
    this.collectIncome();
    this.checkElimination();

    this.game.emit('turn', this.turn);
    this.game.requestRender();
  }

  collectIncome() {
    const world = this.world;
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const budget = nationBudget(world, nation);
      nation.gross = budget.gross;
      nation.upkeep = budget.upkeep;
      nation.income = budget.net;
      nation.gold += budget.net;

      // Hazine tükendiyse ordu beslenemez: en ucuz birim dağılır.
      while (nation.gold < 0) {
        const units = world.units.filter((u) => u.nationId === nation.id);
        if (!units.length) {
          nation.gold = 0;
          break;
        }
        units.sort((a, b) => a.type.attack - b.type.attack);
        this.killUnit(units[0]);
        nation.gold += UNIT_UPKEEP * 3; // dağıtılan birimin bir süre yükü kalkar
        if (nation.id === this.playerNation) this.addLog('Hazine boş: bir birim dağıldı.');
      }
    }
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
