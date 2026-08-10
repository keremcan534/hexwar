// Tur döngüsü: oyuncu hamlesini bitirir -> yapay zekâ oynar -> yeni tur başlar.

import { makeRng } from '../core/rng.js';
import {
  UNIT_TYPES, advanceEntrenchment, clearPath, createUnit, refreshArmy,
  removeUnit, stackFull, unitAvailable,
} from './units.js';
import { advanceMovement } from './movement.js';
import { recruit } from './recruitment.js';
import { runReinforcements } from './reinforcement.js';
import { runNationAI } from './ai.js';
import { atWar, computeContacts, initRelations } from './diplomacy.js';
import {
  INFAMY, addInfamy, checkCoalitions, decayInfamy, tileInfamy,
} from './infamy.js';
import { checkVictory } from './hegemony.js';
import { executeOrders } from './orders.js';
import {
  CITY_COST, UNIT_COSTS, assignAllWorkers, canAfford, canFoundCity,
  cityName, createCity, growCities, nationBudget, pay,
} from './cities.js';
import { initEconomy, reconcilePopulation, runEconomy } from './economy.js';
import { initBattles, removeFromBattles, runBattles } from './battles.js';
import { initCommand, releaseArmy, runCommand, seedGenerals } from './command.js';
import { initProvinces, provincePopulation, runProvinces } from './provinces.js';
import { initPolitics, runPolitics } from './politics.js';
import { captureConstructionAt, initConstruction, runConstruction } from './construction.js';
import { controllerOf, setController } from './control.js';
import { expireTreaties, treatiesOf, underTreaty } from './peace.js';

/** Başlangıç stoku: ilk birkaç turda bir birim alacak kadar. */
const STARTING_GOLD = 50;

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
    world.forEach((t) => {
      t.unit = null;
      t.units = [];
      t.city = null;
      t.controller = t.owner;
      // Başlangıç sınırları işgal değildir; ilk beş haftayı sıfır üretimle açmasın.
      if (t.owner >= 0) t.heldSince = -100;
    });
    this.turn = 1;
    this.log = [];
    this.victory = null;
    this.rng = makeRng(`${world.seed}-turns`);
    world.turn = 1;
    initRelations(world);
    // Province population must exist before the standing army is raised:
    // starting regiments are real residents too, not free abstract manpower.
    initProvinces(world);
    const usedNames = new Set();

    for (const nation of world.nations) {
      nation.alive = nation.tiles > 0;
      nation.gold = STARTING_GOLD;
      delete nation.food;
      delete nation.timber;
      delete nation.iron;
      nation.budget = null;
      nation.infamy = 0;
      if (!nation.alive) continue;
      // Her ülke başkentinde bir şehirle başlar.
      createCity(world, nation.capital, nation.id, cityName(this.rng, usedNames), 2, 3);
    }
    initEconomy(world);
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      for (const typeId of ['INFANTRY', 'CAVALRY']) {
        const unit = recruit(this.game, nation, typeId)
          ?? this.spawnAt(nation, typeId, { fallbackToCapital: true });
        // Only an emergency fallback can lack province draws. Mark it
        // explicitly so disbanding can never create population from nothing.
        if (unit?.regiments?.[0] && !unit.regiments[0].draws) unit.regiments[0].draws = [];
      }
      nation.economy.population = provincePopulation(world, nation.id);
      reconcilePopulation(nation, nation.economy.population);
    }
    initPolitics(world);
    initConstruction(world);
    initBattles(world);
    initCommand(world);
    seedGenerals(world, this.rng);
    assignAllWorkers(world);
    for (const nation of world.nations) nation.budget = nationBudget(world, nation);
  }

  /**
   * Alay kurar. Altın *ve* insan gücü ister: asker en kalabalık province'in
   * nüfusundan çıkar, toplanma noktası varsa oraya yürür (bkz. recruitment.js).
   */
  buyUnit(nation, typeId) {
    const cost = UNIT_COSTS[typeId];
    if (!nation.alive || !cost || !canAfford(nation, cost)) return null;
    // Askersizleştirme anlaşması süresince yeni tümen kurulamaz.
    if (underTreaty(nation, 'DEMILITARIZE', this.turn)) return null;
    // Tank ve uçak yüzyılın ortasında açılır; 1836'da kurulamaz.
    if (!unitAvailable(typeId, this.turn)) return null;
    const unit = recruit(this.game, nation, typeId);
    if (!unit) return null;
    pay(nation, cost);
    if (nation.id === this.playerNation) {
      this.addLog(`${UNIT_TYPES[typeId].name} raised (${UNIT_TYPES[typeId].manpower} men).`);
    }
    this.game.emit('units', this.game.selectedUnit);
    return unit;
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
    clearPath(unit);
    this.game.renderer.invalidateCache();
    if (unit.nationId === this.playerNation) this.addLog(`${city.name} founded.`);
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
    const cities = world.cities.filter(
      (c) => c.nationId === nation.id && controllerOf(c.tile) === nation.id,
    );
    if (!cities.length && !fallbackToCapital) return null;
    const spots = cities.length ? cities.map((c) => c.tile) : [nation.capital];

    const isSea = UNIT_TYPES[typeId].domain === 'sea';
    for (const spot of spots) {
      // Tümenler birleşmez: aynı province'te ayrı ayrı dururlar. Şehir karesi
      // doluysa bitişik boş/az dolu bir kareye inilir.
      const tile = isSea
        ? world.neighbors(spot).find((n) => n.terrain.navigable && !stackFull(n))
        : (!stackFull(spot)
          ? spot
          : world.neighbors(spot).find(
            (n) => n.terrain.passable && !stackFull(n)
              && controllerOf(n) === nation.id,
          ));
      if (!tile) continue;
      const unit = createUnit(typeId, nation.id, tile, nation);
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

    const nation = world.nations[nationId];
    captureConstructionAt(world, tile, nationId);
    // Sahipli toprağı almak şöhret bedeli ister; boş toprağa yerleşmek istemez.
    if (tile.owner >= 0) addInfamy(nation, tileInfamy(tile, nation));
    // İşgal saati sıfırlanır: taze fetih bir süre üretmez, sonra asimile olur.
    tile.heldSince = this.turn;
    if (tile.province) tile.province.control = tile.owner < 0 ? 60 : 25;
    if (tile.owner >= 0) world.nations[tile.owner].tiles--;
    tile.owner = nationId;
    tile.controller = nationId;
    world.nations[nationId].tiles++;
    this.game.renderer.invalidateCache();
    return true;
  }

  /**
   * Barış masasında el değişen toprak. `claim`'den ayrıdır çünkü o savaş
   * kuralına bakar (savaşta olmayanın toprağı alınamaz); burada devir zaten
   * imzalanmış bir anlaşmanın sonucudur ve şöhret bedeli barışla ödenmiştir.
   */
  claimAtPeace(tile, nationId) {
    const world = this.world;
    if (!tile?.terrain.passable || tile.owner === nationId || tile.owner < 0) return false;
    captureConstructionAt(world, tile, nationId);
    world.nations[tile.owner].tiles = Math.max(0, world.nations[tile.owner].tiles - 1);
    tile.owner = nationId;
    tile.controller = nationId;
    tile.heldSince = this.turn;
    world.nations[nationId].tiles++;
    // Yeni tebaa hemen sadık olmaz; kontrol düşük başlar.
    if (tile.province) tile.province.control = 25;
    if (tile.city) tile.city.nationId = nationId;
    this.game.renderer.invalidateCache();
    return true;
  }

  /**
   * Savas sirasinda egemenlik degismez; yalniz askeri kontrol el degistirir.
   * Sahipsiz province ise isgal degil yerlesimdir ve dogrudan claim edilir.
   */
  occupy(tile, nationId) {
    if (!tile?.terrain.passable) return false;
    if (tile.owner < 0) return this.claim(tile, nationId);
    const previousController = controllerOf(tile);
    if (previousController === nationId) return false;
    if (!atWar(this.world, previousController, nationId)
      && !atWar(this.world, tile.owner, nationId)) return false;

    const occupier = this.world.nations[nationId];
    if (tile.owner !== nationId) {
      addInfamy(occupier, tileInfamy(tile, occupier) + (tile.city ? INFAMY.CITY : 0));
    }
    setController(tile, nationId, this.turn);
    if (tile.province) tile.province.control = tile.owner === nationId ? 70 : 10;
    this.game.renderer.invalidateCache();
    return true;
  }

  endTurn() {
    const world = this.world;
    if (!world) return;

    // Temas tablosu tur başında bir kez: her ülke için ayrı taramak pahalı.
    world.contacts = computeContacts(world);
    // Koalisyon YZ'den önce: şöhreti aşan ülke bu turda cephe bulsun.
    const joined = checkCoalitions(this.game, this.rng);
    if (joined) this.game.renderer.invalidateCache();

    for (const nation of world.nations) {
      if (nation.id === this.playerNation || !nation.alive) continue;
      runNationAI(this.game, nation, this.rng);
    }

    this.turn++;
    world.turn = this.turn;
    for (const unit of world.units) {
      // Organization muharebe disinda toparlanir. Geri cekilen division da
      // duzenini yavasca kurar; strength ise asagida nufus ve ekipman harcayan
      // reinforcement sistemi olmadan bedava dolmaz.
      if (!unit.battleId) {
        const organizationRecovery = (unit.retreatUntil ?? 0) > this.turn ? 6 : 10;
        for (const regiment of unit.regiments ?? []) {
          regiment.organization = Math.min(
            100,
            (regiment.organization ?? regiment.morale ?? 100) + organizationRecovery,
          );
          regiment.morale = regiment.organization;
        }
        refreshArmy(unit);
      }
      advanceEntrenchment(unit, this.turn);
    }
    runReinforcements(this.game);
    // Komuta emirleri yürüyüşten *önce* işlenir ki cepheye atanan tümenler
    // aynı hafta yola çıksın; sonra yürüyüş ilerler ve temas muharebe açar.
    runCommand(this.game);
    advanceMovement(this.game);
    decayInfamy(world);
    // Sıra önemli: sahiplik savaşta değişmiş olabilir, önce işçiler yeniden dağıtılır.
    runProvinces(this.game);
    // Şehirler işçi dağıtımından önce büyür ki yeni nüfus aynı hafta bir kare işlesin.
    growCities(world);
    assignAllWorkers(world);
    this.produce();
    // Ticaret üretimden sonra: bu turun fazlası satılabilsin.
    // Eski timber/iron takasi kaldirildi; tek kaynak gercegi economy.js pazari.
    this.lastTrade = [];
    // Sınıflar, fabrikalar ve küresel fiyatlar haftalık ekonomik kapanışta çözülür.
    runEconomy(this.game);
    // Ulusal insaat gucu haftalik kapanista kuyrugun en ustundeki projeye akar.
    runConstruction(this.game);
    runPolitics(this.game);
    // Haritadaki ordular çarpıştıkları province üzerinde haftalık muharebe çözer.
    runBattles(this.game);
    this.checkElimination();
    // Oyuncunun sürekli emirleri yeni turun hakkıyla işlensin: tur açıldığında
    // otomatik ve yol emirli birimler hamlelerini yapmış olur.
    executeOrders(this.game, this.playerNation, this.rng);

    if (!this.victory) {
      const result = checkVictory(world, this.turn);
      if (result) {
        this.victory = result;
        this.addLog(`${result.nation.name} established hegemony (${result.score} points).`);
        this.game.emit('victory', result);
      }
    }

    this.game.emit('turn', this.turn);
    this.game.requestRender();
    if (this.turn % 10 === 0) this.game.autosave();
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

      nation.gold = Math.max(0, nation.gold + budget.net.gold);
    }
    this.payTreaties();
  }

  /**
   * Anlaşma yükümlülükleri. Tazminat ve vassal haracı gelirin bir payıdır:
   * sabit bir rakam olsaydı zengin ülke için anlamsız, fakir için yıkıcı olurdu.
   */
  payTreaties() {
    const world = this.world;
    expireTreaties(world, this.turn);
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      for (const treaty of treatiesOf(nation)) {
        const holder = world.nations[treaty.partner];
        if (!holder?.alive) continue;
        const share = treaty.type === 'VASSALIZE' ? 0.15
          : treaty.type === 'REPARATIONS' ? 0.2 : 0;
        if (!share) continue;
        const due = Math.max(0, (nation.budget?.net?.gold ?? 0)) * share;
        if (due <= 0) continue;
        nation.gold = Math.max(0, nation.gold - due);
        holder.gold += due;
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
      world.forEach((t) => {
        if (t.owner === nation.id) {
          t.owner = -1;
          t.controller = -1;
        } else if (controllerOf(t) === nation.id) {
          t.controller = t.owner;
        }
      });
      nation.tiles = 0;
      this.game.renderer.invalidateCache();
      this.addLog(`${nation.name} has been eliminated.`);
    }
  }

  addLog(text) {
    this.log.unshift(`T${this.turn}: ${text}`);
    if (this.log.length > 30) this.log.pop();
  }

  killUnit(unit) {
    // Muharebe kare anahtarlıdır: ölen tümen taraf listelerinden düşer, muharebe
    // kendisi sürer. Tarafı boşalırsa bir sonraki raund onu kapatır.
    removeFromBattles(this.world, unit);
    // Komutası boşalır; mevkisi de gider.
    releaseArmy(this.world.nations[unit.nationId], unit.id);
    unit.post = null;
    removeUnit(this.world, unit);
  }
}
