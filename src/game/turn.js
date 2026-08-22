// Tur döngüsü: oyuncu hamlesini bitirir -> yapay zekâ oynar -> yeni tur başlar.

import { makeRng } from '../core/rng.js';
import {
  UNIT_TYPES, advanceEntrenchment, clearPath, createUnit, refreshArmy,
  removeUnit, resetUnitIds, stackFull,
} from './units.js';
import { advanceMovement } from './movement.js';
import { queueRecruit, recruit, runTraining } from './recruitment.js';
import { runReinforcements } from './reinforcement.js';
import { runDelegatedAI, runNationAI } from './ai.js';
import { runDiplomacyAI } from './alliances.js';
import { atWar, computeContacts, initRelations } from './diplomacy.js';
import {
  INFAMY, addInfamy, checkCoalitions, decayInfamy, tileInfamy,
} from './infamy.js';
import { checkVictory } from './hegemony.js';
import { executeOrders } from './orders.js';
import {
  CITY_COST, assignAllWorkers, canAfford, canFoundCity,
  cityName, collectProvinceTotals, createCity, growCities, nationBudget, pay,
} from './cities.js';
import {
  beginEconomy, finishEconomy, initEconomy, reconcilePopulation, runNationEconomy,
} from './economy.js';
import { initBattles, removeFromBattles, runBattles } from './battles.js';
import {
  beginCommand, finishCommand, initCommand, releaseArmy, runNationCommandSteps, seedGenerals,
} from './command.js';
import {
  initProvinces, provincePopulation, refreshProvinceOwner, runProvinces,
} from './provinces.js';
import { initPolitics, runPolitics } from './politics.js';
import { captureConstructionAt, initConstruction, runConstruction } from './construction.js';
import { controllerOf, setController } from './control.js';
import { runNationalEvents, runWorldStories } from './events.js';
import { expireTreaties, treatiesOf } from './peace.js';

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
    // Oyuncu, dünya kurulumunun seçtiği bitişik devlete oturur (bkz.
    // nations.pickContiguousPlayer); eski dünyalarda 0'a düşer.
    this.playerNation = world.playerNation ?? 0;
    // Kimlikler dunyaya ait olmali: sayac sifirlanmazsa ayni tohumla kurulan
    // ikinci dunya baska bir oyun olur (bkz. command.js advance faz notu).
    resetUnitIds(1);
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
      // Büyük güçler ikinci bir kent çekirdeğiyle başlar: sanayi/idare
      // asimetrisi ilk günden okunur (bkz. macro.archetypePlan extraCity).
      if (nation.extraCity) {
        const second = (world.provinces ?? [])
          .filter((p) => p.coreOf === nation.id && p.econ
            && !p.tileIdx.some((idx) => world.tiles[idx].city)
            && world.wrapDistance(p.center.q, p.center.r, nation.capital.q, nation.capital.r) >= 4)
          .sort((a, b) => b.econ.population - a.econ.population)[0];
        if (second) {
          createCity(world, second.center, nation.id, cityName(this.rng, usedNames), 1, 2);
        }
      }
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
    const totals = collectProvinceTotals(world);
    for (const nation of world.nations) nation.budget = nationBudget(world, nation, totals);
  }

  /**
   * Alayı EĞİTİM SIRASINA sokar. Altın ve teçhizat siparişte düşer, insan gücü
   * alay sahaya çıkarken toplanır (bkz. recruitment.js eğitim kuyruğu). Alay
   * artık düğmeye basılan hafta belirmez: ordu kurmak zaman ister.
   * @returns {object|null} kuyruk kaydı
   */
  buyUnit(nation, typeId) {
    if (!nation.alive) return null;
    const item = queueRecruit(this.game, nation, typeId);
    if (!item) return null;
    if (nation.id === this.playerNation) {
      this.addLog(`${UNIT_TYPES[item.typeId].name} ordered — ${item.weeks} weeks of training.`,
        { kind: 'ARMY' });
    }
    this.game.emit('units', this.game.selectedUnit);
    return item;
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

  /**
   * Toprak alımı KÜME bütünüyledir (CK3 kuralı): sınır hiçbir province'i
   * ikiye bölmez. Verilen kare kümenin herhangi bir üyesi olabilir; alınabilir
   * üyelerin tamamı (sahipsiz ya da savaşılan düşmanın) el değiştirir.
   */
  claim(tile, nationId) {
    const world = this.world;
    const province = world.provinces?.[tile?.provinceId];
    if (!province || !tile.terrain.passable) return false;
    const nation = world.nations[nationId];
    let taken = 0;
    const takenTiles = [];
    for (const idx of province.tileIdx) {
      const member = world.tiles[idx];
      if (member.owner === nationId) continue;
      // Barış içindeki komşunun toprağı alınamaz.
      if (member.owner >= 0 && !atWar(world, member.owner, nationId)) continue;
      // Sahipli toprağı almak şöhret bedeli ister; boş toprağa yerleşmek istemez.
      if (member.owner >= 0) {
        addInfamy(nation, tileInfamy(member, nation));
        world.nations[member.owner].tiles--;
      }
      // İşgal saati sıfırlanır: taze fetih bir süre üretmez, sonra asimile olur.
      member.heldSince = this.turn;
      member.owner = nationId;
      member.controller = nationId;
      world.nations[nationId].tiles++;
      captureConstructionAt(world, member, nationId);
      taken++;
      takenTiles.push(member);
    }
    if (!taken) return false;
    if (province.econ) {
      province.econ.control = province.owner < 0 ? 60 : 25;
    }
    refreshProvinceOwner(world, province);
    this.game.renderer.invalidateTiles(takenTiles);
    return true;
  }

  /**
   * Barış masasında el değişen toprak: KÜME bütünüyle devredilir. `claim`'den
   * ayrıdır çünkü o savaş kuralına bakar; burada devir imzalanmış anlaşmanın
   * sonucudur ve şöhret bedeli barışla ödenmiştir.
   */
  claimAtPeace(tile, nationId) {
    const world = this.world;
    const province = world.provinces?.[tile?.provinceId];
    if (!province?.econ || province.owner === nationId || province.owner < 0) return false;
    const members = [];
    for (const idx of province.tileIdx) {
      const member = world.tiles[idx];
      if (member.owner >= 0) {
        world.nations[member.owner].tiles = Math.max(0, world.nations[member.owner].tiles - 1);
      }
      captureConstructionAt(world, member, nationId);
      member.owner = nationId;
      member.controller = nationId;
      member.heldSince = this.turn;
      world.nations[nationId].tiles++;
      if (member.city) member.city.nationId = nationId;
      members.push(member);
    }
    province.owner = nationId;
    // Yeni tebaa hemen sadık olmaz; kontrol düşük başlar.
    province.econ.control = 25;
    this.game.renderer.invalidateTiles(members);
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
    // İşgal egemenlik değil kontrol değiştirir: etiket yerleşimi kaymaz.
    this.game.renderer.invalidateTiles([tile], false);
    return true;
  }

  /**
   * Senkron hafta kapanışı: tanılama betikleri, denetimler ve kayıt öncesi
   * boşaltma bunu kullanır. Canlı oyun döngüsü ise beginTurnJob/pumpTurn ile
   * aynı adımları KARE BÜTÇESİNE bölerek işler — 60+ uluslu dünyada atomik
   * kapanış ana thread'i 70-100 ms bloklayıp kaydırmayı donduruyordu
   * (ölçüldü). Mantık ve işlem sırası iki yolda da birebir aynıdır.
   */
  endTurn() {
    const steps = this.turnJob ?? this.turnSteps();
    this.turnJob = null;
    let step = steps.next();
    while (!step.done) step = steps.next();
  }

  /** Haftayı dilimli işlemeye başlar; pumpTurn kare başına ilerletir. */
  beginTurnJob() {
    if (!this.turnJob && !this.victory) this.turnJob = this.turnSteps();
  }

  /**
   * Turu en fazla `budgetMs` kadar ilerletir; iş bittiyse true döner.
   * Takvim (game.updateClock) iş sürerken yeni gün saymaz — hız, tur
   * maliyetine göre kendiliğinden ölçeklenir ama kare hızı asla düşmez.
   */
  pumpTurn(budgetMs = 5.5) {
    if (!this.turnJob) return true;
    const start = performance.now();
    // Adım süresi izlenir: bütçe aşımı hep TEK bir pahalı adımdan gelir;
    // hangi fazın böldüğü lastWorstStep'te okunur (F3 kaplaması/konsol).
    let stepStart = start;
    let step = this.turnJob.next();
    let worst = performance.now() - stepStart;
    let worstPhase = this.phase;
    while (!step.done && performance.now() - start < budgetMs) {
      stepStart = performance.now();
      step = this.turnJob.next();
      const ms = performance.now() - stepStart;
      if (ms > worst) {
        worst = ms;
        worstPhase = this.phase;
      }
    }
    if (!this.lastWorstStep || worst > this.lastWorstStep.ms) {
      this.lastWorstStep = { ms: worst, phase: worstPhase };
    }
    if (step.done) this.turnJob = null;
    return !this.turnJob;
  }

  * turnSteps() {
    const world = this.world;
    if (!world) return;

    // Faz profili: haftalık kapanışın nereye gittiği her turda ölçülür.
    // Donma şikayetleri "hangi faz?" sorusuna dönüşsün diye kalıcı —
    // maliyeti tur başına birkaç performance.now çağrısı.
    const profile = {};
    let markT = performance.now();
    const mark = (name) => {
      const now = performance.now();
      profile[name] = (profile[name] ?? 0) + (now - markT);
      markT = now;
    };
    // Kareler arası duvar süresi profile karışmasın diye her yield'den sonra
    // damga tazelenir.
    const stamp = () => {
      markT = performance.now();
    };
    /**
     * Dilim sınırı. `mark` + `yield` + `stamp` üçlüsünü TEK yerde birleştirir.
     *
     * Neden gerekli: eskiden dilim sınırları elle `yield; stamp();` yazılıyordu
     * ve `stamp` damgayı ilerlettiği için o dilimde YAPILAN İŞ hiçbir kovaya
     * yazılmıyordu. Yalnız süslemede değil ölçümün kendisinde hata: ulus başına
     * yield eden fazlar (ai, komuta, ekonomi) neredeyse tamamen görünmezdi —
     * profil komutayı 0.17 ms/hafta gösterirken tek bir generalin dilimi 25 ms
     * ölçülüyordu (ölçüldü). Hafta 112 ms sürerken profilin toplamı 9.6 ms'ti;
     * yani sıralama yanlış sistemi suçluyordu.
     */
    const pause = function* (name) {
      mark(name);
      yield;
      stamp();
    };

    // Temas tablosu tur başında bir kez: her ülke için ayrı taramak pahalı.
    this.phase = 'contacts';
    world.contacts = computeContacts(world);
    // Koalisyon YZ'den önce: şöhreti aşan ülke bu turda cephe bulsun.
    const joined = checkCoalitions(this.game, this.rng);
    if (joined) this.game.renderer.invalidateCache();
    yield* pause('contacts');

    // Devredilmis alanlar oyuncu icin AYNI evrede, AYNI sirada kosar: zar
    // dizisi degismesin diye ulke sirasinin basinda (oyuncu 0. ulkedir degil,
    // ama sira sabittir) — determinizm tek kurala baglidir: her hafta ayni
    // sirayla ayni sayida zar cekilir. runDelegatedAI zar cekmedigi haftalarda
    // hic dokunmaz (diplomacy kendi ic frekansini uygular).
    const delegate = world.nations[this.playerNation];
    if (delegate?.alive) runDelegatedAI(this.game, delegate, this.rng);

    let aiBatch = 0;
    for (const nation of world.nations) {
      if (nation.id === this.playerNation || !nation.alive) continue;
      this.phase = `ai:${nation.name}`;
      runNationAI(this.game, nation, this.rng);
      // YZ ulus başına bağımsız karar verir; 4'erli demetler 5 ms'lik kare
      // bütçesine sığar. Sıra dizisi değişmez, determinizm korunur.
      if (++aiBatch % 4 === 0) yield* pause('ai');
    }
    // Diplomasi YZ'si savas ilanlarindan SONRA: cagri-ile-savas kuyrugu
    // bosaltilir (muttefikler saldirgana kendi savaslarini acar), ittifak
    // taramasi ve rakip tazeleme kendi ic frekanslarinda kosar.
    this.phase = 'diplomacy';
    runDiplomacyAI(this.game);
    yield* pause('ai');

    this.turn++;
    world.turn = this.turn;
    for (const unit of world.units) {
      // Organization muharebe disinda toparlanir. Geri cekilen division da
      // duzenini yavasca kurar; strength ise asagida nufus ve ekipman harcayan
      // reinforcement sistemi olmadan bedava dolmaz.
      if (!unit.battleId) {
        // Toparlanma maaşa ve ikmale bağlıdır: parasız asker yavaş toplanır,
        // ikmalsiz ordu daha da yavaş. Tabanlar (0.6/0.7) kademeli tutar —
        // felaket cezası yok, süregiden ihmal hissedilir (bkz. supplyIndex).
        const economy = world.nations[unit.nationId]?.economy;
        const wages = (economy?.militaryWages ?? 100) / 100;
        const supply = economy?.military?.supplyIndex ?? 1;
        const fundingFactor = (0.6 + 0.4 * wages) * (0.7 + 0.3 * supply);
        const organizationRecovery = ((unit.retreatUntil ?? 0) > this.turn ? 6 : 10)
          * fundingFactor;
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
    mark('units');
    this.phase = 'reinforcements';
    runReinforcements(this.game);
    yield* pause('reinforcements');
    // Eğitim kuyruğu komutadan ÖNCE: bu hafta sahaya çıkan alay aynı hafta
    // bir komutana bağlanıp mevkisine yürüsün, bir hafta boşta beklemesin.
    this.phase = 'training';
    runTraining(this.game);
    yield* pause('training');
    // Komuta emirleri yürüyüşten *önce* işlenir ki cepheye atanan tümenler
    // aynı hafta yola çıksın; sonra yürüyüş ilerler ve temas muharebe açar.
    // Faz atomikken 12-20 ms tutup kare bütçesini aşıyordu (ölçüldü);
    // sınır taraması bir dilim, uluslar 4'erli demetlerde işlenir.
    // Ulus başına TEK dilim: savaş haftasında bir ulusun mevki dağıtımı
    // (assignPosts, cephe uzunluğunun karesi) tek başına ~8 ms tutabiliyor;
    // 3'lü demet 24 ms'lik dilim üretiyordu (lastWorstStep ile ölçüldü).
    this.phase = 'command:begin';
    const commandContext = beginCommand(this.game);
    for (const nation of world.nations) {
      this.phase = `command:${nation.name}`;
      // General başına bir dilim (bkz. command.runNationCommandSteps).
      for (const _ of runNationCommandSteps(this.game, nation, commandContext)) {
        yield* pause('command');
      }
    }
    finishCommand(this.game);
    yield* pause('command');
    // Fazlar ayrı dilimlerde: eskiden yürüyüş+province+işçi tek dilimdi ve
    // savaş haftalarında (yol bulma + sahiplik değişimi) tek başına 30-40 ms
    // tutabiliyordu (ölçüldü). Sıra aynen korunur, determinizm değişmez.
    this.phase = 'movement';
    advanceMovement(this.game);
    yield* pause('movement');
    this.phase = 'provinces';
    decayInfamy(world);
    // Sıra önemli: sahiplik savaşta değişmiş olabilir, önce işçiler yeniden dağıtılır.
    runProvinces(this.game);
    yield* pause('provinces');
    // Şehirler işçi dağıtımından önce büyür ki yeni nüfus aynı hafta bir kare işlesin.
    this.phase = 'workers';
    growCities(world);
    assignAllWorkers(world);
    yield* pause('workers');
    this.phase = 'produce';
    this.produce();
    mark('produce');
    // Ticaret üretimden sonra: bu turun fazlası satılabilsin.
    // Eski timber/iron takasi kaldirildi; tek kaynak gercegi economy.js pazari.
    this.lastTrade = [];
    // Sınıflar, fabrikalar ve küresel fiyatlar haftalık ekonomik kapanışta
    // çözülür. Ekonomi en pahalı fazdır ve maliyeti ulus sayısına yayılır:
    // 6'şarlı demetler halinde dilimlenir (bkz. economy.js begin/finish notu).
    const economyContext = beginEconomy(this.game);
    for (const nation of world.nations) {
      this.phase = `economy:${nation.name}`;
      runNationEconomy(this.game, nation, economyContext);
      // ULUS BAŞINA dilim. Eskiden üçerli demetlerdi ve tek demet 8.9 ms
      // tutabiliyordu (ölçüldü): 5 ms'lik kare bütçesi BÖLÜNEMEYEN bir adımı
      // bölemez, dolayısıyla demet ne kadar büyükse takılma o kadar kesindir.
      // Sıra ve işlem dizisi aynı — determinizm etkilenmez.
      mark('economy');
      yield;
      economyContext.stamp();
      stamp();
    }
    this.phase = 'economy:finish';
    finishEconomy(this.game, economyContext);
    yield* pause('economy');
    // Ulusal insaat gucu haftalik kapanista kuyrugun en ustundeki projeye akar.
    this.phase = 'construction';
    runConstruction(this.game);
    runPolitics(this.game);
    yield* pause('construction');
    // Haritadaki ordular çarpıştıkları province üzerinde haftalık muharebe çözer.
    this.phase = 'battles';
    runBattles(this.game);
    this.checkElimination();
    mark('battles');
    // Oyuncunun sürekli emirleri yeni turun hakkıyla işlensin: tur açıldığında
    // otomatik ve yol emirli birimler hamlelerini yapmış olur.
    this.phase = 'orders+tail';
    executeOrders(this.game, this.playerNation, this.rng);
    mark('orders');
    this.lastProfile = profile;
    // Ulusal donum noktalari HAFTANIN SONUNDA taranir: borc kapanmis, savas
    // cozulmus, sinirlar oturmus olur. Yalnizca oyuncunun ulkesi — YZ'nin ic
    // gecisleri oyuncunun ekranini bolmez (bkz. events.js).
    const player = world.nations[this.playerNation];
    if (player) runNationalEvents(this.game, player);
    // Dunya haberleri: buyuk guc giris/cikisi, sanayi liderligi, cokus.
    // Gecis tetikler; ic frekansi 13 hafta (bkz. events.runWorldStories).
    runWorldStories(this.game);
    // Bundan sonrası atomik kuyruk (zafer, autosave). İş kaydı burada
    // bırakılır ki kuyruktaki autosave → endTurn zinciri hâlâ çalışan
    // üretece yeniden girmeye kalkmasın (TypeError: already running).
    this.turnJob = null;

    if (!this.victory) {
      const result = checkVictory(world, this.turn);
      if (result) {
        this.victory = result;
        this.addLog(`${result.nation.name} established hegemony (${result.score} points).`,
          { kind: 'HEGEMONY' });
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
    const totals = collectProvinceTotals(world);
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const budget = nationBudget(world, nation, totals);
      nation.budget = budget;

      // Kelepçe yok: açık borçlanmayla kapanır (economy.js settleDebt).
      nation.gold += budget.net.gold;
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
    // Masada bekleyen teklifler de bayatlar: savaş bitmişse ya da oyuncu haftalarca
    // cevap vermediyse geri çekilir.
    this.game.expirePeaceOffers();
    // Ödenen ve alınan haraç bütçe ekranında görünsün: barış masasında
    // imzalanan tazminat hazineden çıkıyor ama hiçbir kalemde yazmıyordu,
    // "öngörülen bakiye" de bu yüzden gerçeğin üstünde kalıyordu.
    //
    // Sıfırlama ayrı geçiştir: alacaklı ülkeye yazılan geliri, ana döngü ona
    // sıra gelince silerdi.
    for (const nation of world.nations) {
      if (!nation.economy) continue;
      nation.economy.treatyCost = 0;
      nation.economy.treatyRevenue = 0;
    }
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
        nation.gold -= due;
        holder.gold += due;
        if (nation.economy) nation.economy.treatyCost += due;
        if (holder.economy) holder.economy.treatyRevenue = (holder.economy.treatyRevenue ?? 0) + due;
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
      nation.provinces = 0;
      for (const province of world.provinces ?? []) {
        if (province.owner === nation.id) refreshProvinceOwner(world, province);
      }
      this.game.renderer.invalidateCache();
      this.addLog(`${nation.name} has been eliminated.`, { kind: 'NATION' });
    }
  }

  /**
   * Günlüğe yazar ve olayı bildirim merkezine iletir.
   *
   * `meta` verilmezse kart türü INFO olur; yani her çağrı yeri güncellenmeden
   * de bildirim akar. Anlamlı olaylar (savaş, barış, fetih, kriz) kendi
   * türünü geçer — tür ikonu, tonu ve ekranda kalma süresini belirler
   * (bkz. game/notifications.js NOTIFY tablosu).
   *
   * `meta.silent` ile yalnız günlüğe yazılır: arka planda akan YZ olayları
   * oyuncunun ekranını doldurmasın.
   */
  addLog(text, meta = {}) {
    this.log.unshift(`T${this.turn}: ${text}`);
    if (this.log.length > 30) this.log.pop();
    this.game.notifications?.push(text, meta);
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
