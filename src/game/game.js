// Oyun kabuğu: dünya + kamera + giriş + çizimi birbirine bağlar.
// Çizim yalnızca bir şey değiştiğinde yapılır (mobil pil dostu).

import { generateWorld, HEX_SIZE } from '../world/worldgen.js';
import { generateNations } from '../world/nations.js';
import { Camera } from '../render/camera.js';
import { CACHE_ZOOM, Renderer } from '../render/renderer.js';
import { PointerController } from '../input/pointer.js';
import { pixelToHex } from '../core/hex.js';
import { randomSeed } from '../core/rng.js';
import { reachable } from '../core/pathfind.js';
import { armyPower, clearPath, placeUnit, speedOf, stackFull, unitsOn } from './units.js';
import { orderMove } from './movement.js';
import { TurnManager } from './turn.js';
import { atWar, declareWar } from './diplomacy.js';
import {
  signPeace, suggestWarGoal,
} from './peace.js';
import { NotificationCenter } from './notifications.js';
import { PerfMonitor } from '../core/perf.js';

/** Masadaki teklif bu kadar hafta cevapsız kalırsa geri çekilir. */
const PEACE_OFFER_TTL = 6;
import { assignAllWorkers, collectProvinceTotals, nationBudget } from './cities.js';
import { controllerOf } from './control.js';
import { loadFromStorage, saveToStorage } from './save.js';
import {
  ORDER, clearOrder, executeOrders, idleUnits, setOrder,
} from './orders.js';
import { MAX_ASSAULT_DIVISIONS, battleAt, startBattle } from './battles.js';
import {
  STANCE, assignDivisions, divisionsOf, frontTilesOf, generalOfArmy, refreshFront, setTarget,
  toggleStance,
} from './command.js';

/**
 * Oyunun yayınladığı bütün olaylar. Liste tek yerde durur ki `on`/`emit`
 * yanlış bir ada karşı sessiz kalmasın.
 *
 * Neden gerekli: kayıt eskiden elle yazılmış bir nesneydi ve `on` içindeki
 * `this.listeners[event]?.push(fn)` olmayan bir olaya abone olmayı hiç hata
 * vermeden yutuyordu. Üç özellik bu yüzden ölü kalmıştı: politika ekranı hiç
 * tazelenmiyor, bildirim kartları hiç çizilmiyordu (`notify`, `notify-clear`).
 */
const EVENTS = [
  'select', 'world', 'turn', 'units', 'clock', 'economy', 'battles',
  'provinces', 'construction', 'victory', 'selection', 'command', 'peace',
  'nation', 'politics', 'notify', 'notify-clear', 'notify-dismiss',
  // Sirket/borsa katmani ve AUTO devri (bkz. companies.js, delegation.js).
  'companies', 'delegation',
];

/** Saat kademeleri: 0 duraklatma, gerisi gerçek zaman çarpanı. */
const SPEEDS = [0, 1, 2, 4, 8];

/**
 * Bir oyun günü kaç ms sürer (1x hızda) ve haftada kaç gün var.
 *
 * 120 ms yüzyılı 8x'te 10 dakikaya indiriyordu: bir asır, bir kahve molası
 * kadar sürüyordu. Grand strategy'de asıl mesele tarihin ağırlığıdır; 1000 ms
 * ile yüzyıl 1x'te 11, 2x'te 5.5, 4x'te 2.8, 8x'te 1.4 saat sürer.
 *
 * Tempoyu değiştirmek isteyen tek yeri burasıdır. Ölçüldü: haftalık tur 30 ms,
 * yani simülasyon saniyede ~235 gün kaldırabiliyor — darboğaz hesap değil,
 * bu sabit.
 *
 * Not: sekme arka plandayken tarayıcı `setInterval`i saniyede bire kısar ve
 * `elapsed` 500 ms'de sınırlı olduğu için oyun yavaşlar. Bu kasıtlıdır:
 * oyuncu bakmıyorken yüzyıl akıp gitmez.
 */
const DAY_MS = 1000;
const DAYS_PER_WEEK = 7;
/** Dusman province'i alindiktan sonra yeni taarruzdan once ikmal suresi. */
const CONSOLIDATION_WEEKS = 2;

/**
 * Çok sayıda ordu tek kareye gönderilirse hepsi aynı hexe tıkışır ve
 * birbirini bloklar. Hedefi merkez alıp dışa doğru genişleyen halkalardan
 * boş kareler toplayıp her orduya ayrı bir varış noktası veririz.
 */
function spreadTargets(world, center, count) {
  if (count <= 1) return [center];
  const targets = [center];
  const seen = new Set([center]);
  const queue = [center];
  for (let head = 0; head < queue.length && targets.length < count; head++) {
    for (const near of world.neighbors(queue[head])) {
      if (seen.has(near) || !near.terrain.passable) continue;
      seen.add(near);
      queue.push(near);
      targets.push(near);
      if (targets.length >= count) break;
    }
  }
  return targets;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera();
    // Ölçüm çekirdeği kare döngüsünden ÖNCE kurulur; renderer bölüm
    // işaretlerini buraya yazar (bkz. core/perf.js).
    this.perf = new PerfMonitor();
    this.renderer = new Renderer(canvas, this.camera);
    this.renderer.perf = this.perf;
    this.world = null;
    this.selected = null;
    this.hovered = null;
    this.selectedUnit = null;
    this.marquee = null;     // sürüklenirken oluşan seçim kutusu
    this.activeGeneral = null;  // komuta arayüzünde seçili general
    this.selected_ = [];     // seçili ordular (bkz. selectUnits)
    this.reachable = null;   // { costs, prev } — seçili birimin menzili
    this.turns = new TurnManager(this);
    this.listeners = Object.fromEntries(EVENTS.map((name) => [name, []]));
    // Bildirim merkezi: günlüğe düşen olayı karta çevirir (bkz. notifications.js).
    this.notifications = new NotificationCenter(this);
    // YZ'den gelip oyuncunun cevabını bekleyen barış teklifleri.
    this.peaceOffers = [];
    this.nextPeaceOfferId = 1;
    this.dirty = false;
    this.frameHandle = 0;
    this.waterTimer = 0;     // su animasyonunun kısılmış zamanlayıcısı
    this.autosaveEnabled = true;
    // Saat gün gün akar; oyunun sistemleri (ekonomi, muharebe, cephe) haftalık
    // çözülür. Böylece tarih akıcı ilerlerken denge haftalık kalır.
    this.clock = { speed: 0, accumulator: 0, lastTime: performance.now(), day: 0 };
    // Saat tiki rAF dışında koşar: pahalıya kaçarsa kare istatistiği görmez,
    // olay günlüğü görür (paused takılma avı bunun üzerinden yürür).
    this.clockTimer = setInterval(() => {
      const t0 = performance.now();
      this.updateClock();
      this.perf?.event('clock-tick', performance.now() - t0);
    }, 100);

    this.input = new PointerController(canvas, this.camera, {
      onTap: (x, y) => this.handleTap(x, y),
      onHover: (x, y) => this.handleHover(x, y),
      onChange: () => this.requestRender(),
      onRightTap: (x, y) => this.handleRightTap(x, y),
      // Sağ sürükleme de yürüyüş emridir: bırakılan yer hedeftir. Cephe artık
      // elle çizilmiyor (bkz. command.js), sürüklemenin başka bir işi yok.
      onRightDragEnd: (points) => {
        const last = points?.[points.length - 1];
        if (last) this.handleRightTap(last.x, last.y);
      },
      onMarqueeStart: (x, y) => this.beginMarquee(x, y),
      onMarqueeMove: (rect) => this.updateMarquee(rect),
      onMarqueeEnd: (rect) => this.finishMarquee(rect),
    });

    this.onResize = () => {
      this.renderer.resize();
      this.camera.setBounds(
        this.world?.bounds ?? this.camera.bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        this.world?.wrapWidth ?? null,
      );
      this.requestRender();
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  /**
   * Bilinmeyen ad programlama hatasıdır ve açılışta patlamalı. Sessizce
   * yutulduğunda özellik hiç çalışmaz ama kimse fark etmez — bu dosyanın
   * EVENTS notuna bakınız.
   */
  on(event, fn) {
    if (!this.listeners[event]) throw new Error(`Bilinmeyen olay: ${event}`);
    this.listeners[event].push(fn);
    return this;
  }

  emit(event, payload) {
    const list = this.listeners[event];
    if (!list) throw new Error(`Bilinmeyen olay: ${event}`);
    for (const fn of list) fn(payload);
  }

  /** Yeni dünya üret. seed verilmezse rastgele. */
  newWorld(seed = randomSeed(), options = {}) {
    this.setSpeed(0);
    const t0 = performance.now();
    this.world = generateWorld(seed, options);
    generateNations(this.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
    this.world.genTime = performance.now() - t0;

    this.selected = null;
    this.hovered = null;
    this.selectedUnit = null;
    this.selected_ = [];
    this.marquee = null;
    this.activeGeneral = null;
    this.reachable = null;
    this.turns.start(this.world);
    this.renderer.invalidateCache();
    this.renderer.resize();
    this.camera.setBounds(this.world.bounds, this.world.wrapWidth);
    this.camera.fit();
    this.emit('world', this.world);
    this.emit('turn', this.turns.turn);
    this.requestRender();
    return this.world;
  }

  tileAtScreen(sx, sy) {
    if (!this.world) return null;
    const w = this.camera.screenToWorld(sx, sy);
    const { q, r } = pixelToHex(w.x, w.y, HEX_SIZE);
    return this.world.get(q, r) ?? null;
  }

  /** Gorunen amblemin kenari komsu province sayilmasin. */
  unitAtScreen(sx, sy) {
    if (!this.world || !this.camera?.worldToScreen) return null;
    const hitRadius = Math.max(9, HEX_SIZE * 0.92 * this.camera.zoom);
    let best = null;
    let bestDistance = Infinity;
    for (const unit of this.world.units) {
      if (!unit?.tile || unit.hp <= 0) continue;
      const y = unit.tile.y + (unit.tile.city ? HEX_SIZE * 0.22 : 0);
      // Sarmal temsilci: dikişin öbür yanında görünen kopya da tıklanabilsin.
      const point = this.camera.worldToScreenWrapped(unit.tile.x, y);
      const distance = Math.hypot(point.x - sx, point.y - sy);
      if (distance <= hitRadius && distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Sol tık = seçim (HOI4). Üstünde ordu varsa onu seçer, yoksa seçimi bırakır.
   * Yürütme sağ tuşa taşındı; sol tık artık asla emir vermez.
   */
  handleTap(sx, sy) {
    const hitUnit = this.unitAtScreen(sx, sy);
    const tile = hitUnit?.tile ?? this.tileAtScreen(sx, sy);
    this.selected = tile;

    // Kendi ordumuza tıklamak o province'teki bütün tümenlerini seçer
    // (tümenler birleşmiyor, bir karede birkaçı olabilir); başka her yere
    // tıklamak seçimi iptal eder.
    const own = unitsOn(tile).filter((u) => u.nationId === this.turns.playerNation);
    this.selectUnits(own);
    this.emit('select', tile);
    this.requestRender();
  }

  /**
   * Sağ tık = seçili bütün ordulara yürüyüş emri. Bitişikteki düşmana denk
   * gelirse saldırıya döner; birden çok ordu aynı hedefe gönderildiğinde
   * hedefler yayılır, yoksa hepsi tek kareye tıkışıp birbirini bloklar.
   */
  handleRightTap(sx, sy) {
    const hitUnit = this.unitAtScreen(sx, sy);
    const tile = hitUnit?.tile ?? this.tileAtScreen(sx, sy);
    if (!tile) return false;
    // Seçili birim yokken sağ tık boştaydı. Yabancı toprakta o ülkenin
    // panelini açar: diplomasi ekranı menüde aranmak yerine haritadan gelir.
    // Katman kuralı gereği ekranı buradan açmayız, olayı duyururuz (ui dinler).
    if (!this.selection.length) {
      const owner = tile.owner;
      if (owner >= 0 && owner !== this.turns.playerNation) {
        this.emit('nation', owner);
        return true;
      }
      return false;
    }

    const selected = [...this.selection];
    const controller = controllerOf(tile);
    const foreignOwner = controller >= 0 && controller !== this.turns.playerNation;
    const hostileUnits = unitsOn(tile).filter((unit) => (
      unit.nationId !== this.turns.playerNation
      && atWar(this.world, unit.nationId, this.turns.playerNation)
    ));
    const hostileTarget = hostileUnits.length > 0 || (
      foreignOwner && atWar(this.world, controller, this.turns.playerNation)
    );
    if (hostileTarget) {
      const defenders = hostileUnits;
      let issued = 0;
      if (defenders.length) {
        // Tek sag tik tek province operasyonudur. Bitişik secili tumenler ayni
        // muharebeye katilir; battles.js combat width fazlasini reddeder.
        const participants = selected.filter((unit) => (
          unit && unit.hp > 0 && !unit.battleId && !unit.embarked
        )).sort((a, b) => (
          this.world.wrapDistance(a.tile.q, a.tile.r, tile.q, tile.r)
          - this.world.wrapDistance(b.tile.q, b.tile.r, tile.q, tile.r)
          || armyPower(b) - armyPower(a) || a.id - b.id
        )).slice(0, MAX_ASSAULT_DIVISIONS);
        for (const unit of participants) {
          const adjacent = this.world.wrapDistance(unit.tile.q, unit.tile.r, tile.q, tile.r) === 1;
          if (adjacent && this.attack(unit, tile)) issued++;
          else if (orderMove(this, unit, tile)) issued++;
        }
      } else {
        // Bos dusman province'i bir tikla yalniz bir tumen alir; toplu secim
        // cevredeki birden cok province'i ayni anda yutamaz.
        const candidates = selected.filter((unit) => (
          unit && unit.hp > 0 && !unit.battleId && this.canEnterFor(unit)(tile)
        )).sort((a, b) => (
          this.world.wrapDistance(a.tile.q, a.tile.r, tile.q, tile.r)
          - this.world.wrapDistance(b.tile.q, b.tile.r, tile.q, tile.r)
          || armyPower(b) - armyPower(a) || a.id - b.id
        ));
        if (candidates[0] && orderMove(this, candidates[0], tile)) issued = 1;
      }
      this.selected = tile;
      this.emit('select', tile);
      this.emit('units', this.selectedUnit);
      this.requestRender();
      return issued > 0;
    }

    const spread = spreadTargets(this.world, tile, this.selection.length);
    let issued = 0;
    this.selection.forEach((unit, index) => {
      if (!unit || unit.hp <= 0 || unit.battleId) return;
      const choices = [spread[index], tile, ...spread].filter(Boolean);
      const tried = new Set();
      for (const target of choices) {
        if (tried.has(target) || target === unit.tile) continue;
        tried.add(target);
        const enemy = unitsOn(target).find((other) => (
          other.nationId !== unit.nationId
          && atWar(this.world, other.nationId, unit.nationId)
        ));
        if (enemy && this.world.wrapDistance(unit.tile.q, unit.tile.r, target.q, target.r) === 1) {
          if (this.attack(unit, target)) issued++;
          break;
        }
        if (this.canEnterFor(unit)(target) && orderMove(this, unit, target)) {
          issued++;
          break;
        }
      }
    });

    this.selected = tile;
    this.emit('select', tile);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return issued > 0;
  }

  /** Seçili ordular. `selectedUnit` ilk seçilendir; tekil kullanan kod bozulmasın. */
  get selection() {
    return this.selected_ ?? [];
  }

  /**
   * Seçimi değiştirir. Yalnız oyuncunun, sağ ve muharebede olmayan orduları
   * seçilebilir. Tek kaynak burasıdır; `selectedUnit` buradan türetilir.
   */
  selectUnits(units) {
    const mine = (units ?? []).filter(
      (unit) => unit && unit.hp > 0 && unit.nationId === this.turns.playerNation,
    );
    this.selected_ = mine;
    this.selectedUnit = mine[0] ?? null;
    // Menzil vurgusu kalktı: ordu artık haftalık bütçeyle değil, yol boyunca
    // sürekli yürüyor. Seçili orduya sağ tıklanan her yer geçerli bir hedeftir.
    this.reachable = null;
    this.emit('units', this.selectedUnit);
    this.emit('selection', mine);
    return mine;
  }

  /** Tek birim seçimi: eski çağrı yerleri bozulmasın diye korunuyor. */
  selectUnit(unit) {
    return this.selectUnits(unit ? [unit] : []);
  }

  // --- Kutu (marquee) seçimi: masaüstünde klasör seçer gibi ---

  beginMarquee(sx, sy) {
    this.marquee = { x: sx, y: sy, w: 0, h: 0 };
  }

  updateMarquee(rect) {
    this.marquee = rect;
    this.requestRender();
  }

  /** Kutunun içinde kalan kendi ordularımızı seçer. */
  finishMarquee(rect) {
    this.marquee = null;
    if (!this.world || !rect) {
      this.requestRender();
      return [];
    }
    const picked = [];
    for (const unit of this.world.units) {
      if (unit.nationId !== this.turns.playerNation || unit.hp <= 0) continue;
      const p = this.camera.worldToScreenWrapped(unit.tile.x, unit.tile.y);
      if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
        picked.push(unit);
      }
    }
    // Kutu seçimi *yalnızca* tümen seçer. Seçili province'i değiştirmez:
    // değiştirince altındaki province paneli (bina yerleştirme dahil) açılıyor,
    // oyuncu sadece birlik seçmek isterken şehir ekranıyla karşılaşıyordu.
    this.selectUnits(picked);
    this.requestRender();
    return picked;
  }

  /**
   * Birimin girebileceği kareler. Kara birimi denize girebilir ("bindirilmiş"),
   * gemi karaya çıkamaz.
   */
  canEnterFor(unit) {
    const world = this.world;
    // Barış içindeki ülkenin toprağına girilmez: sınırlar ancak savaşla aşılır.
    const allowed = (tile) => {
      const controller = controllerOf(tile);
      return controller < 0 || controller === unit.nationId
        || atWar(world, controller, unit.nationId);
    };

    // Dost tümenler aynı province'te yan yana durabilir (birleşmezler).
    // Muharebe varsa gelen dost takviye hareket katmanında o savaşa yazılır.
    const openOrFriendly = (tile) => !tile.unit || (
      tile.unit.nationId === unit.nationId
      && tile.unit.type.domain === unit.type.domain
      && !stackFull(tile)
    );

    if (unit.type.domain === 'sea') {
      return (tile) => tile.terrain.navigable && openOrFriendly(tile);
    }
    return (tile) => (tile.terrain.passable || tile.terrain.navigable)
      && openOrFriendly(tile) && allowed(tile);
  }

  costForUnit() {
    return (tile) => (tile.terrain.water ? tile.terrain.seaCost : tile.terrain.moveCost);
  }

  /**
   * Bir haftada kabaca nereye varılabileceğinin önizlemesi. Artık bir kural
   * değil, yalnızca çizim ipucu: hareketin kendisi `movement.js`te sürüyor.
   */
  getReachable(unit) {
    return reachable(this.world, unit.tile, speedOf(unit), {
      canEnter: this.canEnterFor(unit),
      costOf: this.costForUnit(unit),
    });
  }

  /** Orduya yürüyüş emri verir; yol haftalar içinde kat edilir. */
  moveUnit(unit, tile) {
    if (unit.battleId || (unit.retreatUntil ?? 0) > this.turns.turn) return false;
    if (!orderMove(this, unit, tile)) return false;
    this.emit('units', unit);
    this.requestRender();
    return true;
  }

  /** Bir birimin kareye girişi: yerleş, toprağı al, şehirse ele geçir. */
  enterTile(unit, tile) {
    const previousController = controllerOf(tile);
    placeUnit(unit, tile);
    const occupied = this.turns.occupy(tile, unit.nationId);
    const conquered = occupied && previousController >= 0
      && previousController !== unit.nationId;
    if (conquered) {
      unit.attackReadyAt = Math.max(
        unit.attackReadyAt ?? 0, this.turns.turn + CONSOLIDATION_WEEKS,
      );
    }
    const city = tile.city;
    if (conquered && city && city.nationId !== unit.nationId) {
      // Sehir hukuken eski ulkede kalir; baris antlasmasi devri kesinlestirir.
      this.turns.addLog(`${city.name} occupied; sovereignty will be decided at peace.`,
        { kind: 'CONQUEST', tile: city.tile });
    }
    return conquered;
  }

  attack(unit, tile) {
    const defender = unitsOn(tile).find((other) => other.nationId !== unit.nationId);
    if (!defender) return false;
    if (this.world.wrapDistance(unit.tile.q, unit.tile.r, tile.q, tile.r) !== 1) return false;
    // Denizdeki kara birimi savaşamaz; önce karaya çıkmalı.
    if (unit.embarked) return false;
    if ((unit.attackReadyAt ?? 0) > this.turns.turn) return false;
    // Barış içindeki ülkeye saldırmak için önce savaş ilan edilmeli.
    if (!atWar(this.world, unit.nationId, defender.nationId)) return false;

    // Ayni general yeni bir province taarruzunu cadence dolmadan acamaz.
    // Mevcut muharebeye combat-width icinde takviye girmek serbesttir.
    const existing = battleAt(this.world, tile);
    const general = generalOfArmy(this.world.nations[unit.nationId], unit);
    if (!existing && general && this.turns.turn < (general.nextAssaultAt ?? 0)) return false;

    // Muharebe kareye aittir: o province'teki bütün savunanlar aynı savaşa girer.
    if (!startBattle(this, unit, tile)) return false;
    if (unit === this.selectedUnit) this.selectUnit(unit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return true;
  }

  // --- Komuta duruşu: cephe çizilmez, generale verilir ---

  /**
   * Taarruz aç/kapa. Cephe artık elle çizilmiyor: seçili generalin ordu grubu
   * ya hattını tutar ya da önündeki province'lere yürür (bkz. command.js).
   *
   * Çizim kalktı çünkü çizilen hat sınırla çelişiyordu — sınır değişince hat
   * yeniden kuruluyor, tümenler her hafta baştan diziliyordu.
   */
  toggleOffensive() {
    const general = this.activeGeneral;
    if (!general) return null;
    const stance = toggleStance(this.world, general);
    this.emit('command', general);
    this.requestRender();
    return stance;
  }

  /** Seçili generalin taarruzu yürüyor mu? */
  offensiveActive() {
    return this.activeGeneral?.stance === STANCE.ADVANCE;
  }

  /** Ordu grubunun izleyeceği düşman; null = savaşta olduğumuz herkes. */
  setCommandTarget(nationId) {
    const general = this.activeGeneral;
    if (!general) return null;
    const target = setTarget(this.world, general, nationId);
    this.emit('command', general);
    this.requestRender();
    return target;
  }

  /** Seçili generalin cephe kareleri (çizim ve panel için). */
  frontTiles(general = this.activeGeneral) {
    return general ? frontTilesOf(this.world, general) : [];
  }

  // --- Komuta: general seçimi ve tümen devri ---

  /** Generali seçer ve komuta ettiği bütün tümenleri seçili yapar. */
  selectGeneral(general) {
    this.activeGeneral = general ?? null;
    if (!general) {
      this.emit('command', null);
      this.requestRender();
      return [];
    }
    // Cephesi çizim için tazelenir: hedefi ya da sınırı değişmiş olabilir.
    refreshFront(this.world, general);
    const divisions = divisionsOf(this.world, general);
    this.selectUnits(divisions);
    if (divisions.length) {
      this.selected = divisions[0].tile;
      this.emit('select', this.selected);
    }
    this.emit('command', general);
    this.requestRender();
    return divisions;
  }

  /** Seçili tümenleri bu generalin komutasına devreder. */
  transferSelection(general) {
    const nation = this.world.nations[this.turns.playerNation];
    if (!general || !nation || !this.selection.length) return 0;
    const moved = assignDivisions(nation, general.id, this.selection);
    refreshFront(this.world, general);
    this.activeGeneral = general;
    this.emit('command', general);
    this.emit('selection', this.selection);
    this.requestRender();
    return moved;
  }

  // --- Sürekli emirler: mikro yönetimi azaltan katman ---

  setUnitOrder(unit, type) {
    if (!unit) return;
    setOrder(unit, type);
    if (type === ORDER.AUTO) executeOrders(this, unit.nationId, this.turns.rng);
    if (type === ORDER.HOLD) clearPath(unit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
  }

  clearUnitOrder(unit) {
    if (!unit) return;
    clearOrder(unit);
    clearPath(unit);
    this.selectUnit(unit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
  }

  /**
   * Her turun sonunda otomatik kayıt. Mobilde uygulama arka planda kapanabilir;
   * oyuncunun 200. turda her şeyi kaybetmesi kabul edilemez.
   * Simülasyon ölçümlerinde kapatılabilsin diye anahtarlı.
   */
  autosave() {
    if (!this.autosaveEnabled || !this.world) return;
    // Anında yazılmaz: tüm dünyayı serileştirmek 100+ ms sürüyor ve turun
    // kuyruğunda çağrıldığı için 10 haftada bir kaydırmayı donduruyordu.
    // Bayrak bırakılır; oyuncu ~yarım saniye dinlenince yazılır
    // (bkz. flushAutosave).
    if (!this.pendingAutosave) this.pendingAutosaveAt = performance.now();
    this.pendingAutosave = true;
  }

  /** Bekleyen otomatik kaydı oyuncu boştayken diske yazar. */
  flushAutosave() {
    if (!this.pendingAutosave || !this.world || this.turns.turnJob) return;
    // Zaman akarken yazmak 16-21 ms'lik tekrar eden takılmaydı (ölçüldü).
    // Kayıt duraklamaya, sekmenin gizlenmesine ya da 60 sn'lik tavana
    // ertelenir — hızlı oynatma sırasında dakikada en fazla bir yazım.
    const pendingFor = performance.now() - (this.pendingAutosaveAt ?? 0);
    if (this.clock.speed && document.visibilityState !== 'hidden'
      && pendingFor < 60000) return;
    const r = this.renderer;
    const idleFor = performance.now()
      - Math.max(r.zoomStamp?.at ?? 0, r.moveStamp?.at ?? 0);
    if (idleFor < 600) return;
    this.pendingAutosave = false;
    const t0 = performance.now();
    saveToStorage(this);
    this.perf?.event('autosave', performance.now() - t0);
  }

  save() {
    if (this.turns.turnJob) this.turns.endTurn();
    return saveToStorage(this);
  }

  load() {
    return loadFromStorage(this);
  }

  /** İşçileri ve bütçeleri baştan hesaplar; kayıt yüklendikten sonra gerekir. */
  recomputeEconomy() {
    if (!this.world) return;
    assignAllWorkers(this.world);
    const totals = collectProvinceTotals(this.world);
    for (const nation of this.world.nations) {
      nation.budget = nationBudget(this.world, nation, totals);
    }
  }

  idleUnits() {
    return idleUnits(this.world, this.turns.playerNation);
  }

  /**
   * Hareket hakkı olan bir sonraki emirsiz birime geçer ve kamerayı oraya taşır.
   * Turu bitirmeden önce "unuttuğum birim var mı?" derdini ortadan kaldırır.
   */
  selectNextIdle() {
    const idle = this.idleUnits();
    if (!idle.length) return null;
    const current = idle.indexOf(this.selectedUnit);
    const next = idle[(current + 1) % idle.length];
    this.camera.zoom = Math.max(this.camera.zoom, 0.8);
    this.camera.centerOn(next.tile.x, next.tile.y);
    this.selected = next.tile;
    this.selectUnit(next);
    this.emit('select', next.tile);
    this.requestRender();
    return next;
  }

  declareWarOn(nationId, goalProvinceId = undefined) {
    // Oyuncunun kendi karari: merkezi kapi bunu istemsiz ilandan ayirir.
    // Hedef verilmezse makul bir tane onerilir (sinira komsu, en degerli
    // kume) -- boylece hicbir savas hedefsiz baslamaz ve baris masasi her
    // zaman "bu savas neydi" sorusunu cevaplayabilir.
    const goal = goalProvinceId !== undefined
      ? goalProvinceId
      : suggestWarGoal(this.world, this.turns.playerNation, nationId)?.id ?? null;
    const ok = declareWar(this, this.turns.playerNation, nationId, { manual: true, goal });
    if (ok) {
      this.selectUnit(this.selectedUnit);
      this.emit('units', this.selectedUnit);
      this.requestRender();
    }
    return ok;
  }

  /**
   * Bekleyen teklif kuyruğu. Tembel kurulur: tanılama betikleri Game'i
   * kurucusuz örnekliyor (`Object.create(Game.prototype)`), orada alan yok.
   */
  pendingPeace() {
    this.peaceOffers ??= [];
    return this.peaceOffers;
  }

  /** Bu savaş için oyuncunun önünde bekleyen bir teklif var mı? */
  hasPeaceOffer(a, b) {
    return this.pendingPeace().some(
      (item) => (item.from === a && item.to === b) || (item.from === b && item.to === a),
    );
  }

  /**
   * YZ'den gelen barış teklifi. Otomatik uygulanmaz: masaya düşer, kararı
   * oyuncu verir. Eskiden YZ tarafında barış tek yönlüydü ve işgalleri
   * kendiliğinden devrediyordu (bkz. peace.js başlığı).
   */
  receivePeaceOffer(fromId, toId, offer) {
    if (!atWar(this.world, fromId, toId) || this.hasPeaceOffer(fromId, toId)) return null;
    this.nextPeaceOfferId ??= 1;
    const entry = {
      id: this.nextPeaceOfferId++, from: fromId, to: toId, offer, turn: this.turns.turn,
    };
    this.pendingPeace().push(entry);
    this.turns.addLog(`${this.world.nations[fromId].name} proposes terms of peace.`,
      { kind: 'DIPLOMACY', key: `peace-offer-${fromId}` });
    this.emit('peace', this.peaceOffers);
    return entry;
  }

  /**
   * Oyuncunun cevabı. Kabul edilirse anlaşma oyuncunun kendi masasıyla aynı
   * yoldan (`signPeace`) uygulanır; reddedilirse savaş sürer.
   */
  resolvePeaceOffer(offerId, accept) {
    const index = this.pendingPeace().findIndex((item) => item.id === offerId);
    if (index < 0) return false;
    const [entry] = this.peaceOffers.splice(index, 1);
    const from = this.world.nations[entry.from];
    const done = accept ? signPeace(this, entry.from, entry.to, entry.offer) : false;
    this.turns.addLog(accept && done
      ? `Treaty signed with ${from.name}.`
      : `We rejected ${from.name}'s terms; the war goes on.`,
    { kind: accept && done ? 'PEACE' : 'DIPLOMACY' });
    this.emit('peace', this.peaceOffers);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return done;
  }

  /** Savaş bittiyse ya da teklif bayatladıysa masadan kalkar. */
  expirePeaceOffers() {
    const before = this.pendingPeace().length;
    this.peaceOffers = this.peaceOffers.filter((item) => (
      atWar(this.world, item.from, item.to)
      && this.turns.turn - item.turn <= PEACE_OFFER_TTL
    ));
    if (this.peaceOffers.length !== before) this.emit('peace', this.peaceOffers);
  }

  endTurn() {
    this.turns.endTurn();
    // Seçim haftalık olarak *silinmez*: saat gerçek zamanlı akıyor, silinseydi
    // oyuncunun seçimi saniyede birkaç kez uçardı. Yalnız ölenler ayıklanır.
    this.pruneSelection();
  }

  /** Artık var olmayan orduları seçimden düşürür. */
  pruneSelection() {
    if (!this.selection.length) return;
    const alive = this.selection.filter(
      (unit) => unit.hp > 0 && this.world.units.includes(unit),
    );
    if (alive.length !== this.selection.length) this.selectUnits(alive);
    else this.emit('selection', alive);
  }

  /** 0 = duraklat, 1/2/4 = gerçek zaman hızları. Bir simülasyon adımı bir haftadır. */
  setSpeed(speed) {
    const next = SPEEDS.includes(Number(speed)) ? Number(speed) : 0;
    // Duraklatmadan önceki hız hatırlanır: boşluk tuşu oyuncuyu 1x'e düşürmesin.
    if (this.clock.speed) this.clock.lastSpeed = this.clock.speed;
    this.clock.speed = next;
    this.clock.accumulator = 0;
    this.clock.lastTime = performance.now();
    this.emit('clock', this.clock);
    return this.clock.speed;
  }

  togglePause() {
    return this.setSpeed(this.clock.speed ? 0 : (this.clock.lastSpeed ?? 1));
  }

  /** Hız kademesini bir basamak kaydırır (+ / − tuşları). */
  stepSpeed(delta) {
    const index = SPEEDS.indexOf(this.clock.speed);
    const next = Math.max(0, Math.min(SPEEDS.length - 1, index + delta));
    return this.setSpeed(SPEEDS[next]);
  }

  updateClock() {
    const now = performance.now();
    const elapsed = Math.min(500, now - this.clock.lastTime);
    this.clock.lastTime = now;
    // Bekleyen otomatik kayıt duraklatılmış oyunda da yazılabilsin diye
    // hız kontrolünden önce denenir.
    this.flushAutosave();
    if (!this.world || !this.clock.speed || this.turns.victory) return;
    this.clock.accumulator += elapsed;
    // Bir gün bu kadar sürer; hafta yedi günde bir kapanır.
    const stepMs = DAY_MS / this.clock.speed;
    let steps = 0;
    while (this.clock.accumulator >= stepMs && steps < 14) {
      // Hafta hâlâ dilim dilim işleniyorsa takvim bekler: turlar üst üste
      // binmez, yüksek hızda tempo tur maliyetine göre kendiliğinden ölçülür.
      if (this.turns.turnJob) {
        // Sekme gizliyken rAF donar; dilimler burada boşaltılır ki oyun
        // zamanı (kısılmış tempoda) akmaya devam etsin. Görünürken pompayı
        // YALNIZ kare zinciri yapar — setInterval içinde pompalamak kare
        // zamanlamasından bağımsız 7-20 ms'lik stall üretiyordu (ölçüldü).
        if (document.visibilityState === 'hidden') this.pumpTurnFrame();
        break;
      }
      this.clock.accumulator -= stepMs;
      this.clock.day++;
      if (this.clock.day % DAYS_PER_WEEK === 0) {
        // Atomik endTurn ana thread'i 70-100 ms kilitliyordu; kapanış artık
        // kare bütçeli dilimlerle işlenir (bkz. TurnManager.pumpTurn) ve
        // dilimler bir sonraki rAF karesinde başlar.
        this.turns.beginTurnJob();
        this.requestRender();
      } else this.emit('clock', this.clock);
      steps++;
    }
  }

  /** Tur işini kare zincirine bağlar: her rAF karesi bir dilim işler. */
  pumpTurnFrame() {
    if (!this.turns.turnJob) return;
    const t0 = performance.now();
    // 5 ms: 144 Hz'te kare bütçesi ~7 ms; 7 ms'lik dilim + çizim kareyi
    // aşırıyordu (ölçüldü: sim dilimi p99 16.5 ms). Tur biraz daha çok
    // kareye yayılır, hiçbir kare bütçeyi aşmaz.
    const done = this.turns.pumpTurn(5);
    this.perf?.add('sim', performance.now() - t0);
    // Dilim dünya durumunu değiştirmiş olabilir; kare taze çizilsin ve
    // zincir iş bitene dek sürsün.
    this.dirty = true;
    this.requestRender();
    if (done) this.emit('clock', this.clock);
  }

  handleHover(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    if (tile === this.hovered) return;
    this.hovered = tile;
    this.requestRender();
  }

  /**
   * Bildirim kartına tıklayınca olayın geçtiği yere gider (bkz.
   * ui/notifications.js). Kart bir kareyi işaret ediyorsa kamerayı oraya alır.
   */
  focusTile(tile) {
    if (!tile) return;
    this.camera.zoom = Math.max(this.camera.zoom, 1);
    this.camera.centerOn(tile.x, tile.y);
    this.selected = tile;
    this.emit('select', tile);
    this.requestRender();
  }

  focusNation(nation) {
    if (!nation) return;
    this.camera.zoom = Math.max(this.camera.zoom, 1);
    this.camera.centerOn(nation.capital.x, nation.capital.y);
    this.selected = nation.capital;
    this.emit('select', nation.capital);
    this.requestRender();
  }

  requestRender() {
    this.dirty = true;
    if (this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  frame = (ts = performance.now()) => {
    this.frameHandle = 0;
    this.perf?.beginFrame(ts);
    const moving = this.input.update();
    if (this.dirty || moving) {
      this.dirty = false;
      if (this.world) {
        const t0 = performance.now();
        this.renderer.render(this.world, {
          selected: this.selected,
          hovered: this.hovered,
          selectedUnit: this.selectedUnit,
          playerNation: this.turns.playerNation,
          activeGeneral: this.activeGeneral,
          front: this.frontTiles(),
          selection: this.selection,
          marquee: this.marquee,
          reachable: this.reachable,
        });
        this.perf?.add('render', performance.now() - t0);
      }
    }
    // Bekleyen hafta dilimi bu karenin bütçesinden payını alır; zincir iş
    // bitene dek tam kare hızında sürer, kaydırma/zoom akıcı kalır.
    if (this.turns?.turnJob) this.pumpTurnFrame();
    this.perf?.endFrame();
    if (moving) this.frameHandle = requestAnimationFrame(this.frame);
    // Dilimli arka plan işi (statik katman, uzak önbellek) kaldıysa zincir
    // sürsün: iş birkaç karede biter, yoksa bir sonraki etkileşime dek yarım
    // kalıp kenarlarda boşluk bırakıyordu.
    else if (this.renderer.hasPendingJobs()) this.requestRender();
    else if (this.renderer.waterActive()) this.scheduleWaterFrame();
  };

  /**
   * Deniz animasyonu sürekli rAF döngüsü AÇMAZ: kısılmış bir zamanlayıcı
   * requestRender'ı dürter (yakında ~25, uzak zoomda ~12 kare/sn — yavaş su
   * için yeterli, tam kare hızının maliyetinin yarısından azı). Sekme
   * gizliyken çizilmez; su çizmeyen kiplerde (inşaat/barış) waterActive
   * false döner ve zincir kendiliğinden durur, ilk requestRender'da yeniden
   * kurulur.
   */
  scheduleWaterFrame() {
    if (this.waterTimer || this.frameHandle) return;
    // Eşik önbellek zoom'uyla senkron: uzak dalda su daha seyrek dürtülür.
    // Not: bu kadans yalnız DURAĞAN haritanın su tazelemesidir; etkileşim
    // (pan/zoom/sim) kareleri rAF'ta sınırsız akar (144 Hz+). PC hedefi
    // için boşta 25→30 fps'e çekildi; tam kare hızında boşta su, ambiyans
    // için ölçüsüz CPU/pil maliyeti olur (bkz. CLAUDE.md rAF kuralı).
    const interval = this.camera.zoom < CACHE_ZOOM ? 66 : 33;
    // Faz kilidi: gecikme son su karesine GÖRE hesaplanır. Sabit "kare biti
    // + interval" zamanlaması kare süresi ve zamanlayıcı sapmasıyla toplanıp
    // 40 ms hedefte 33-104 ms arası düzensiz adımlar üretiyordu (ölçüldü);
    // duraklatılmış oyunda hissedilen mikro takılmanın bir bileşeni buydu.
    const since = performance.now() - (this.lastWaterAt ?? 0);
    const delay = Math.max(0, interval - since);
    this.waterTimer = setTimeout(() => {
      this.waterTimer = 0;
      // Sekme gizliyken ya da ana menü haritayı örterken çizim boşa gider;
      // zamanlayıcı ucuz olduğundan zincir canlı tutulur, görünürlük dönünce
      // ilk tikte kaldığı yerden akar.
      const covered = document.visibilityState === 'hidden'
        || document.body.classList.contains('menu-open');
      if (covered) this.scheduleWaterFrame();
      else {
        this.lastWaterAt = performance.now();
        this.requestRender();
      }
    }, delay);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.input.destroy();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    if (this.waterTimer) clearTimeout(this.waterTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
  }
}
