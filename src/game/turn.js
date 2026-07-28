// Tur döngüsü: oyuncu hamlesini bitirir -> yapay zekâ oynar -> yeni tur başlar.

import { makeRng } from '../core/rng.js';
import { createUnit, removeUnit, UNIT_TYPES } from './units.js';
import { runNationAI } from './ai.js';

/** Kaç turda bir başkentte yeni birim çıkar. */
const PRODUCTION_INTERVAL = 4;

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
    world.forEach((t) => { t.unit = null; });
    this.turn = 1;
    this.log = [];
    this.rng = makeRng(`${world.seed}-turns`);

    for (const nation of world.nations) {
      nation.alive = nation.tiles > 0;
      if (!nation.alive) continue;
      this.spawnAt(nation, 'INFANTRY');
      this.spawnAt(nation, 'SCOUT');
    }
  }

  /** Başkentte ya da en yakın boş komşusunda birim üretir. */
  spawnAt(nation, typeId) {
    const world = this.world;
    const capital = nation.capital;
    let tile = capital.unit ? null : capital;
    if (!tile) {
      tile = world.neighbors(capital).find(
        (n) => n.terrain.passable && !n.unit && n.owner === nation.id,
      );
    }
    if (!tile) return null;
    const unit = createUnit(typeId, nation.id, tile);
    world.units.push(unit);
    return unit;
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
    this.produce();
    this.checkElimination();

    this.game.emit('turn', this.turn);
    this.game.requestRender();
  }

  produce() {
    if (this.turn % PRODUCTION_INTERVAL !== 0) return;
    for (const nation of this.world.nations) {
      if (!nation.alive) continue;
      // Büyük ülkeler daha pahalı birim çıkarabilir.
      const typeId = nation.tiles > 90 ? 'CAVALRY' : nation.tiles > 40 ? 'INFANTRY' : 'SCOUT';
      const unit = this.spawnAt(nation, typeId);
      if (unit && nation.id === this.playerNation) {
        this.addLog(`${UNIT_TYPES[typeId].name} üretildi.`);
      }
    }
  }

  checkElimination() {
    for (const nation of this.world.nations) {
      if (!nation.alive) continue;
      const hasUnits = this.world.units.some((u) => u.nationId === nation.id);
      if (nation.tiles <= 0 && !hasUnits) {
        nation.alive = false;
        this.addLog(`${nation.name} tarih sahnesinden silindi.`);
      }
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
