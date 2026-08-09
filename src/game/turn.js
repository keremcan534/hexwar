// Tur döngüsü: oyuncu hamlesini bitirir -> yapay zekâ oynar -> yeni tur başlar.

import { makeRng } from '../core/rng.js';
import {
  UNIT_TYPES, addRegiment, clearPath, createUnit, recoverArmy, refreshArmy,
  regimentCount, removeUnit, removeWeakestRegiment,
} from './units.js';
import { advanceMovement } from './movement.js';
import { recruit } from './recruitment.js';
import { runNationAI } from './ai.js';
import { atWar, computeContacts, initRelations } from './diplomacy.js';
import {
  INFAMY, addInfamy, checkCoalitions, decayInfamy, runAssimilation, tileInfamy,
} from './infamy.js';
import { runTrade } from './trade.js';
import { checkVictory } from './hegemony.js';
import { executeOrders } from './orders.js';
import {
  CITY_COST, IRON_UPKEEP_TYPES, UNIT_COSTS, assignAllWorkers, canAfford, canFoundCity,
  cityName, createCity, growPop, growthCost, nationBudget, pay, storageCap, UNIT_UPKEEP,
  WORK_RADIUS,
} from './cities.js';
import {
  BUILDINGS, buildingPlacementTiles, canBuild, placementCityFor,
} from './buildings.js';
import { RESOURCES } from '../world/terrain.js';
import { buildRoad, roadLabel } from './infrastructure.js';
import { initEconomy, runEconomy } from './economy.js';
import { initBattles, runBattles } from './battles.js';
import { initGenerals, reconcileGenerals, releaseArmy, seedGenerals } from './generals.js';
import { initFronts, removeArmy as removeArmyFromFront, runFronts } from './fronts.js';
import { initProvinces, runProvinces } from './provinces.js';

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
    world.forEach((t) => {
      t.unit = null;
      t.city = null;
      // Başlangıç sınırları işgal değildir; ilk beş haftayı sıfır üretimle açmasın.
      if (t.owner >= 0) t.heldSince = -100;
    });
    this.turn = 1;
    this.log = [];
    this.victory = null;
    this.rng = makeRng(`${world.seed}-turns`);
    world.turn = 1;
    initRelations(world);
    const usedNames = new Set();

    for (const nation of world.nations) {
      nation.alive = nation.tiles > 0;
      for (const r of RESOURCES) nation[r] = STARTING_STOCK[r];
      nation.budget = null;
      nation.infamy = 0;
      nation.techs = [];
      if (!nation.alive) continue;
      // Her ülke başkentinde bir şehirle başlar.
      createCity(world, nation.capital, nation.id, cityName(this.rng, usedNames), 2, 3);
      this.spawnAt(nation, 'INFANTRY', { fallbackToCapital: true });
      this.spawnAt(nation, 'CAVALRY', { fallbackToCapital: true });
    }
    initProvinces(world);
    initEconomy(world);
    initBattles(world);
    initGenerals(world);
    seedGenerals(world, this.rng);
    initFronts(world);
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
    const unit = recruit(this.game, nation, typeId);
    if (!unit) return null;
    pay(nation, cost);
    if (nation.id === this.playerNation) {
      this.addLog(
        `${UNIT_TYPES[typeId].name} raised (${UNIT_TYPES[typeId].manpower} men).`,
        { kind: 'ARMY', tile: unit.tile },
      );
    }
    this.game.emit('units', this.game.selectedUnit);
    return unit;
  }

  /** Şehre bina kurar. Altının asıl gideri burasıdır. */
  build(city, buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building || !city) return false;
    const placements = [...buildingPlacementTiles(
      this.world, city.nationId, buildingId, WORK_RADIUS,
    ).entries()].filter(([, placementCity]) => placementCity === city);
    placements.sort(([a], [b]) => {
      const score = (tile) => {
        if (buildingId === 'SAWMILL') return tile.terrain.yields.timber;
        if (buildingId === 'FORGE' || buildingId === 'MINE') return tile.terrain.yields.iron;
        if (buildingId === 'FARM_ESTATE') return tile.terrain.yields.food;
        return tile.coastal ? 1 : 0;
      };
      return score(b) - score(a);
    });
    return placements.length
      ? this.buildAt(placements[0][0], buildingId, city.nationId)
      : false;
  }

  /** Seçili binayı haritadaki province'e kurar ve en yakın şehre bağlar. */
  buildAt(tile, buildingId, nationId = this.playerNation) {
    const world = this.world;
    const nation = world.nations[nationId];
    const building = BUILDINGS[buildingId];
    const city = placementCityFor(world, nationId, tile, buildingId, WORK_RADIUS);
    if (!building || !nation?.alive || !city || !pay(nation, building.cost)) return false;

    city.buildings.push(buildingId);
    tile.structure = { buildingId, cityId: city.id };
    this.game.recomputeEconomy();
    if (nationId === this.playerNation) {
      this.addLog(
        `${building.name} completed in ${tile.q}, ${tile.r} (${city.name}).`,
        { kind: 'BUILDING', tile },
      );
    }
    this.game.renderer.invalidateCache();
    this.game.emit('units', this.game.selectedUnit);
    this.game.emit('provinces', tile);
    this.game.requestRender();
    return true;
  }

  /** Oyuncunun sahip olduğu kara karesindeki yol altyapısını bir kademe yükseltir. */
  buildRoad(tile, nationId = this.playerNation) {
    if (!buildRoad(this.game, tile, nationId)) return false;
    if (nationId === this.playerNation) {
      this.addLog(
        `${roadLabel(tile)} completed at ${tile.q}, ${tile.r}.`,
        { kind: 'INFRA', tile },
      );
    }
    this.game.emit('units', this.game.selectedUnit);
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
    clearPath(unit);
    this.game.renderer.invalidateCache();
    if (unit.nationId === this.playerNation) {
      this.addLog(`${city.name} founded.`, { kind: 'CITY', tile: city.tile });
    }
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
      const existing = spot.unit && spot.unit.nationId === nation.id
        && spot.unit.type.domain === UNIT_TYPES[typeId].domain
        && !spot.unit.battleId
        ? spot.unit
        : null;
      if (existing && addRegiment(existing, typeId, nation)) return existing;
      const tile = isSea
        ? world.neighbors(spot).find((n) => n.terrain.navigable && !n.unit)
        : (spot.unit
          ? world.neighbors(spot).find((n) => n.terrain.passable && !n.unit && n.owner === nation.id)
          : spot);
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
    if (tile.structure && tile.owner >= 0) {
      const structureCity = world.cities.find((city) => city.id === tile.structure.cityId);
      // Şehir zaten yeni sahibe geçtiyse ona bağlı yapı da devredilir. Tek başına
      // işgal edilen province yapısı ise yıkılır ve eski şehrin bonusundan çıkar.
      if (structureCity?.nationId !== nationId) {
        if (structureCity) {
          const index = structureCity.buildings.indexOf(tile.structure.buildingId);
          if (index >= 0) structureCity.buildings.splice(index, 1);
        }
        tile.structure = null;
      }
    }
    // Sahipli toprağı almak şöhret bedeli ister; boş toprağa yerleşmek istemez.
    if (tile.owner >= 0) addInfamy(nation, tileInfamy(tile, nation));
    // İşgal saati sıfırlanır: taze fetih bir süre üretmez, sonra asimile olur.
    tile.heldSince = this.turn;
    if (tile.province) tile.province.control = tile.owner < 0 ? 60 : 25;
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
      if (!unit.battleId && (unit.retreatUntil ?? 0) <= this.turn) recoverArmy(unit);
    }
    // Cephe emirleri yürüyüşten *önce* işlenir ki hatta atanan ordular aynı
    // hafta yola çıksın; sonra yürüyüş ilerler ve temas muharebe açar.
    reconcileGenerals(world);
    runFronts(this.game);
    advanceMovement(this.game);
    decayInfamy(world);
    // Asimilasyon kültür sınırını değiştirir; önbellek tazelenmeli.
    if (runAssimilation(world, this.turn)) this.game.renderer.invalidateCache();
    // Sıra önemli: sahiplik savaşta değişmiş olabilir, önce işçiler yeniden dağıtılır.
    runProvinces(this.game);
    assignAllWorkers(world);
    this.produce();
    // Ticaret üretimden sonra: bu turun fazlası satılabilsin.
    this.lastTrade = runTrade(world);
    // Sınıflar, fabrikalar ve küresel fiyatlar haftalık ekonomik kapanışta çözülür.
    runEconomy(this.game);
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
        this.addLog(
          `${result.nation.name} established hegemony (${result.score} points).`,
          { kind: 'HEGEMONY', tile: result.nation.capital },
        );
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

      const cap = storageCap(budget.cities, nation);
      nation.gold = Math.max(0, nation.gold + budget.net.gold);
      // Ambar taşarsa fazlası ziyan: stok biriktirmek strateji olmasın.
      const timberAfter = nation.timber + budget.net.timber;
      nation.timber = Math.max(0, Math.min(cap, timberAfter));
      const ironAfter = nation.iron + budget.net.iron;
      nation.iron = Math.max(0, Math.min(cap, ironAfter));

      // Onarım karşılanamıyorsa bina tam verimle çalışmaya devam edemez.
      if (timberAfter < 0) this.disrepairForTimber(nation);
      // Demir bitmişse ağır birlikler beslenemez: erzak kıtlığının karşılığı.
      if (ironAfter < 0) this.disbandForIron(nation, -ironAfter);

      this.settleFood(nation);
    }
  }

  /**
   * Kereste açığı: bütçe yeniden dengeye gelene kadar en yeni binalar kapanır.
   * İdare Merkezi yuva açtığı için, mümkünken önce başka bir bina seçilir.
   */
  disrepairForTimber(nation) {
    const world = this.world;
    let budget = nationBudget(world, nation);

    while (budget.net.timber < 0) {
      const cities = world.cities
        .filter((city) => city.nationId === nation.id && city.buildings?.length)
        .sort((a, b) => b.buildings.length - a.buildings.length);
      if (!cities.length) break;

      const city = cities[0];
      let index = city.buildings.length - 1;
      while (index >= 0 && city.buildings[index] === 'ADMIN_CENTER') index--;
      if (index < 0) index = city.buildings.length - 1;
      const [buildingId] = city.buildings.splice(index, 1);
      world.forEach((tile) => {
        if (
          tile.structure?.cityId === city.id
          && tile.structure.buildingId === buildingId
        ) tile.structure = null;
      });

      if (nation.id === this.playerNation) {
        this.addLog(
          `${BUILDINGS[buildingId]?.name ?? 'A building'} closed due to timber shortage.`,
          { kind: 'CRISIS', key: 'CRISIS:timber', tile: city.tile },
        );
      }
      budget = nationBudget(world, nation);
    }

    nation.budget = budget;
  }

  /**
   * Demir açığı: ağır birlikler (süvari, savaş gemisi) dağıtılır.
   * Erzak kıtlığıyla aynı mantık — kaynak bitince ordu küçülür.
   */
  disbandForIron(nation, shortfall) {
    const world = this.world;
    let missing = shortfall;
    while (missing > 0) {
      const heavy = world.units.filter((u) => (
        u.nationId === nation.id
        && u.regiments?.some((regiment) => IRON_UPKEEP_TYPES[regiment.typeId])
      ));
      if (!heavy.length) break;
      heavy.sort((a, b) => a.hp - b.hp);
      const removed = removeWeakestRegiment(heavy[0], Object.keys(IRON_UPKEEP_TYPES));
      if (!removed) break;
      missing -= IRON_UPKEEP_TYPES[removed.typeId] ?? 1;
      if (!heavy[0].regiments.length) this.killUnit(heavy[0]);
      if (nation.id === this.playerNation) {
        this.addLog('Iron shortage: a heavy unit was disbanded.', {
          kind: 'CRISIS', key: 'CRISIS:iron',
        });
      }
    }
    nation.budget = nationBudget(world, nation);
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
          growPop(city, this.rng);
          // Kalabalıklaşan şehir tahkimatını da güçlendirir (savunma ve çizim).
          city.level = Math.min(4, 1 + Math.floor(city.pop / 4));
          if (nation.id === this.playerNation) {
            this.addLog(`${city.name} grew to ${city.pop} workers.`, {
              kind: 'GROWTH', tile: city.tile,
            });
          }
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
      const removed = removeWeakestRegiment(units[0]);
      if (!removed || !units[0].regiments.length) this.killUnit(units[0]);
      shortfall -= UNIT_UPKEEP.food;
      if (nation.id === this.playerNation) {
        this.addLog('Famine: one unit disbanded.', { kind: 'CRISIS', key: 'CRISIS:food' });
      }
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
      // Oyuncunun elenmesi kaybolmayan kart açar; başkalarınınki tek kartta sayılır.
      this.addLog(`${nation.name} has been eliminated.`, {
        kind: 'NATION',
        tile: nation.capital,
        ttl: nation.id === this.playerNation ? 0 : undefined,
      });
    }
  }

  /**
   * Günlüğe yazar ve aynı olayı bildirim kartına çevirir. `meta` kartın türünü,
   * tıklanınca gidilecek kareyi ve gerekirse `silent` bayrağını taşır
   * (bkz. notifications.js).
   */
  addLog(text, meta) {
    this.log.unshift(`T${this.turn}: ${text}`);
    if (this.log.length > 30) this.log.pop();
    this.game.notify?.(text, meta);
  }

  killUnit(unit) {
    const battle = this.world.battleSystem?.battles?.find((item) => item.id === unit.battleId);
    if (battle) {
      const otherId = battle.attackerId === unit.id ? battle.defenderId : battle.attackerId;
      const other = this.world.units.find((army) => army.id === otherId);
      if (other) other.battleId = null;
      this.world.battleSystem.battles = this.world.battleSystem.battles.filter(
        (item) => item.id !== battle.id,
      );
    }
    // Komutan boşta kadroya döner, cephe ataması düşer.
    releaseArmy(this.world.nations[unit.nationId], unit.id);
    removeArmyFromFront(this.world, unit);
    removeUnit(this.world, unit);
  }
}
