// Oyun kabuğu: dünya + kamera + giriş + çizimi birbirine bağlar.
// Çizim yalnızca bir şey değiştiğinde yapılır (mobil pil dostu).

import { generateWorld, HEX_SIZE } from '../world/worldgen.js';
import { generateNations } from '../world/nations.js';
import { Camera } from '../render/camera.js';
import { Renderer } from '../render/renderer.js';
import { PointerController } from '../input/pointer.js';
import { pixelToHex, hexDistance } from '../core/hex.js';
import { randomSeed } from '../core/rng.js';
import { reachable } from '../core/pathfind.js';
import { clearPath, placeUnit, speedOf } from './units.js';
import { orderMove } from './movement.js';
import { TurnManager } from './turn.js';
import { captureCity } from './cities.js';
import { atWar, considerPeaceOffer, declareWar } from './diplomacy.js';
import { INFAMY, addInfamy } from './infamy.js';
import { assignAllWorkers, nationBudget } from './cities.js';
import { loadFromStorage, saveToStorage } from './save.js';
import {
  ORDER, clearOrder, executeOrders, idleUnits, setOrder,
} from './orders.js';
import { roadMoveCost } from './infrastructure.js';
import { startBattle } from './battles.js';
import { BUILDINGS, buildingPlacementTiles } from './buildings.js';
import {
  PLAN, assignArmy, borderTiles, chainTiles, createFront, fillGaps, frontsOfGeneral,
  plannedPath, reconcileFronts, spanObjective,
} from './fronts.js';
import { assignDivisions, divisionsOf, generalOfArmy } from './generals.js';

/** Saat kademeleri: 0 duraklatma, gerisi gerçek zaman çarpanı. */
const SPEEDS = [0, 1, 2, 4];

/** Sınıra oturan cephe hattının bir seferde kapsadığı province sayısı. */
const BORDER_SEGMENT = 12;

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
    this.renderer = new Renderer(canvas, this.camera);
    this.world = null;
    this.selected = null;
    this.hovered = null;
    this.selectedUnit = null;
    this.buildingPlacement = null;
    this.frontDraw = null;   // sürüklenirken oluşan geçici cephe hattı
    this.marquee = null;     // sürüklenirken oluşan seçim kutusu
    this.drawMode = null;    // 'front' | 'fallback' | 'arrow' — sürükleme çizim kipi
    this.borderPreview = null;  // çizim kipinde vurgulanan sınır parçası
    this.activeGeneral = null;  // komuta arayüzünde seçili general
    this.selectedFront = null;
    this.selected_ = [];     // seçili ordular (bkz. selectUnits)
    this.reachable = null;   // { costs, prev } — seçili birimin menzili
    this.turns = new TurnManager(this);
    this.listeners = {
      select: [], world: [], turn: [], units: [], clock: [], economy: [],
      battles: [], provinces: [], placement: [], victory: [], fronts: [], selection: [],
      command: [],
    };
    this.dirty = false;
    this.frameHandle = 0;
    this.autosaveEnabled = true;
    this.clock = { speed: 0, accumulator: 0, lastTime: performance.now() };
    this.clockTimer = setInterval(() => this.updateClock(), 100);

    this.input = new PointerController(canvas, this.camera, {
      onTap: (x, y) => this.handleTap(x, y),
      onHover: (x, y) => this.handleHover(x, y),
      onChange: () => this.requestRender(),
      onRightDragStart: (x, y) => this.beginFrontDraw(x, y),
      onRightDragMove: (x, y) => this.extendFrontDraw(x, y),
      onRightDragEnd: () => this.finishFrontDraw(),
      onRightDragCancel: () => this.cancelFrontDraw(),
      onRightTap: (x, y) => this.handleRightTap(x, y),
      isDrawMode: () => Boolean(this.drawMode),
      onMarqueeStart: (x, y) => this.beginMarquee(x, y),
      onMarqueeMove: (rect) => this.updateMarquee(rect),
      onMarqueeEnd: (rect) => this.finishMarquee(rect),
    });

    this.onResize = () => {
      this.renderer.resize();
      this.camera.setBounds(this.world?.bounds ?? this.camera.bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 });
      this.requestRender();
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  on(event, fn) {
    this.listeners[event]?.push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] ?? []) fn(payload);
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
    this.buildingPlacement = null;
    this.frontDraw = null;
    this.marquee = null;
    this.drawMode = null;
    this.borderPreview = null;
    this.activeGeneral = null;
    this.selectedFront = null;
    this.reachable = null;
    this.turns.start(this.world);
    this.renderer.invalidateCache();
    this.renderer.resize();
    this.camera.setBounds(this.world.bounds);
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

  /**
   * Sol tık = seçim (HOI4). Üstünde ordu varsa onu seçer, yoksa seçimi bırakır.
   * Yürütme sağ tuşa taşındı; sol tık artık asla emir vermez.
   */
  handleTap(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    this.selected = tile;

    if (tile && this.buildingPlacement) {
      const buildingId = this.buildingPlacement.buildingId;
      const placed = this.buildingPlacement.tiles.has(tile)
        && this.turns.buildAt(tile, buildingId, this.turns.playerNation);
      if (placed) this.cancelBuildingPlacement();
      this.emit('select', tile);
      this.requestRender();
      return;
    }

    // Cephe/geri çekilme kipinde tıklamak vurgulanan sınıra hattı oturtur.
    if (['front', 'fallback'].includes(this.drawMode)) {
      const preview = this.borderPreview ?? this.borderPreviewAt(tile);
      if (preview) {
        this.commitBorderFront(preview);
        this.emit('select', tile);
        return;
      }
    }

    // Kendi ordumuza tıklamak onu seçer; başka her yere tıklamak seçimi iptal eder.
    const own = tile?.unit && tile.unit.nationId === this.turns.playerNation
      ? tile.unit
      : null;
    this.selectUnits(own ? [own] : []);
    this.emit('select', tile);
    this.requestRender();
  }

  /**
   * Sağ tık = seçili bütün ordulara yürüyüş emri. Bitişikteki düşmana denk
   * gelirse saldırıya döner; birden çok ordu aynı hedefe gönderildiğinde
   * hedefler yayılır, yoksa hepsi tek kareye tıkışıp birbirini bloklar.
   */
  handleRightTap(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    if (!tile || !this.selection.length) return false;

    const spread = spreadTargets(this.world, tile, this.selection.length);
    let issued = 0;
    this.selection.forEach((unit, index) => {
      if (!unit || unit.hp <= 0 || unit.battleId) return;
      const target = spread[index] ?? tile;
      const enemy = target.unit && target.unit.nationId !== unit.nationId;
      if (enemy && hexDistance(unit.tile.q, unit.tile.r, target.q, target.r) === 1) {
        if (this.attack(unit, target)) issued++;
        return;
      }
      if (target !== unit.tile && this.canEnterFor(unit)(target)) {
        if (orderMove(this, unit, target)) issued++;
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
      const p = this.camera.worldToScreen(unit.tile.x, unit.tile.y);
      if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
        picked.push(unit);
      }
    }
    this.selectUnits(picked);
    if (picked.length) {
      this.selected = picked[0].tile;
      this.emit('select', this.selected);
    }
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
    const allowed = (tile) => tile.owner < 0
      || tile.owner === unit.nationId
      || atWar(world, tile.owner, unit.nationId);

    const openOrFriendly = (tile) => !tile.unit || (
      tile.unit.nationId === unit.nationId
      && tile.unit.type.domain === unit.type.domain
      && !tile.unit.battleId
    );

    if (unit.type.domain === 'sea') {
      return (tile) => tile.terrain.navigable && openOrFriendly(tile);
    }
    return (tile) => (tile.terrain.passable || tile.terrain.navigable)
      && openOrFriendly(tile) && allowed(tile);
  }

  costForUnit() {
    return (tile) => (tile.terrain.water ? tile.terrain.seaCost : roadMoveCost(tile));
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
    placeUnit(unit, tile);
    this.turns.claim(tile, unit.nationId);
    const city = tile.city;
    if (city && city.nationId !== unit.nationId) {
      const old = this.world.nations[city.nationId];
      captureCity(this, city, unit.nationId);
      // Şehir almak en pahalı fetihtir: bir ülkeyi yutmak dünyayı üstüne çeker.
      addInfamy(this.world.nations[unit.nationId], INFAMY.CITY);
      this.turns.addLog(`${city.name} captured from ${old.name}.`);
    }
  }

  attack(unit, tile) {
    const defender = tile.unit;
    if (!defender || defender.nationId === unit.nationId) return false;
    if (hexDistance(unit.tile.q, unit.tile.r, tile.q, tile.r) !== 1) return false;
    // Denizdeki kara birimi savaşamaz; önce karaya çıkmalı.
    if (unit.embarked) return false;
    // Barış içindeki ülkeye saldırmak için önce savaş ilan edilmeli.
    if (!atWar(this.world, unit.nationId, defender.nationId)) return false;

    if (!startBattle(this, unit, defender)) return false;
    if (unit === this.selectedUnit) this.selectUnit(unit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return true;
  }

  // --- Cephe çizimi: sağ tuşu sürükleyerek hat kurulur ---

  beginFrontDraw(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    this.frontDraw = { tiles: tile ? [tile] : [] };
    this.requestRender();
  }

  extendFrontDraw(sx, sy) {
    if (!this.frontDraw) return;
    const tile = this.tileAtScreen(sx, sy);
    const tiles = this.frontDraw.tiles;
    // Aynı kareyi tekrar eklemeyiz; hat sürükleme sırasını korur.
    if (tile && tile !== tiles[tiles.length - 1] && !tiles.includes(tile)) {
      tiles.push(tile);
      this.requestRender();
    }
  }

  /**
   * Çizim biter ve plan kurulur. Plan tipi çizim kipinden gelir; kip yoksa
   * (masaüstünde düz sağ sürükleme) nerede çizildiğine bakılır — kendi
   * toprağımızın içi geri çekilme hattı, sınır/düşman cephe hattıdır.
   */
  finishFrontDraw() {
    const draw = this.frontDraw;
    const mode = this.drawMode;
    this.frontDraw = null;
    this.drawMode = null;
    if (!draw || draw.tiles.length < 2) {
      this.requestRender();
      return null;
    }
    const nation = this.world.nations[this.turns.playerNation];
    if (!nation?.alive) return null;

    let plan;
    if (mode === 'fallback') plan = PLAN.HOLD;
    else if (mode === 'arrow') plan = PLAN.ARROW;
    else if (mode === 'front') plan = PLAN.ADVANCE;
    else {
      const ownShare = draw.tiles.filter((tile) => tile.owner === nation.id).length
        / draw.tiles.length;
      plan = ownShare > 0.85 ? PLAN.HOLD : PLAN.ADVANCE;
    }

    // Plan seçili generalindir; yoksa seçili tümenlerin komutanı devralır.
    const general = this.activeGeneral
      ?? generalOfArmy(nation, this.selection[0])
      ?? null;

    const front = plan === PLAN.ARROW
      ? this.createOffensive(nation, general, draw.tiles)
      : createFront(this, nation, draw.tiles, plan, general?.id ?? null);

    if (front) {
      // Generalin bütün tümenleri, yoksa seçili tümenler hatta katılır.
      const armies = general ? divisionsOf(this.world, general) : this.selection;
      for (const unit of armies) assignArmy(this.world, front, unit);
    }
    this.selectedFront = front;
    this.emit('fronts', front);
    this.requestRender();
    return front;
  }

  /**
   * Taarruz planı: çizilen hat *hedeftir*, cephe değil. Başlangıç hattı ya
   * generalin mevcut cephesidir ya da hedefe bakan sınırımızdır. Kopuk çizilen
   * hedef hattının boşlukları doldurulur; tek kare seçilirse ondan bir hat
   * türetilir (HOI4'te olduğu gibi ok bir *hatta* ilerler).
   */
  createOffensive(nation, general, drawn) {
    const world = this.world;
    const objective = drawn.length > 1
      ? fillGaps(world, chainTiles(drawn))
      : null;

    // Başlangıç hattı: generalin mevcut cephesi, yoksa hedefe en yakın sınırımız.
    const existing = general
      ? frontsOfGeneral(world, general).find((item) => item.plan !== PLAN.ARROW)
      : null;
    const anchor = objective?.[Math.floor(objective.length / 2)] ?? drawn[0];
    let start = existing
      ? existing.tiles.map((point) => world.get(point.q, point.r)).filter(Boolean)
      : this.borderPreviewAt(anchor)?.tiles ?? [];
    if (!start.length) {
      // Sınır bulunamadıysa en yakın kendi karelerimizden bir hat kur.
      const own = borderTiles(world, nation.id, null);
      own.sort((a, b) => hexDistance(a.q, a.r, anchor.q, anchor.r)
        - hexDistance(b.q, b.r, anchor.q, anchor.r));
      start = chainTiles(own.slice(0, 6));
    }
    if (!start.length) return null;

    // Tek kare hedef: başlangıç hattının ortasından bakıp bir hedef hattı türet.
    const objectiveTiles = objective
      ?? spanObjective(world, drawn[0], start[Math.floor(start.length / 2)]);

    const front = createFront(this, nation, start, PLAN.ARROW, general?.id ?? null);
    if (front) {
      front.objective = objectiveTiles.map((tile) => ({ q: tile.q, r: tile.r }));
    }
    return front;
  }

  cancelFrontDraw() {
    this.frontDraw = null;
    this.requestRender();
  }

  /**
   * Çizim kipi: 'front' cephe hattı, 'fallback' geri çekilme hattı, 'arrow'
   * taarruz oku. Masaüstünde düz sağ sürükleme kipsiz de çizer.
   */
  setDrawMode(mode) {
    this.drawMode = ['front', 'fallback', 'arrow'].includes(mode) ? mode : null;
    if (!this.drawMode) this.frontDraw = null;
    this.borderPreview = null;
    this.emit('fronts', this.selectedFront);
    this.requestRender();
    return this.drawMode;
  }

  toggleDrawMode(mode = 'front') {
    return this.setDrawMode(this.drawMode === mode ? null : mode);
  }

  // --- Komuta: general seçimi ve tümen devri ---

  /** Generali seçer ve komuta ettiği bütün tümenleri seçili yapar. */
  selectGeneral(general) {
    this.activeGeneral = general ?? null;
    if (!general) {
      this.emit('command', null);
      return [];
    }
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
    reconcileFronts(this.world);
    this.activeGeneral = general;
    this.emit('command', general);
    this.emit('selection', this.selection);
    this.requestRender();
    return moved;
  }

  selectFront(front) {
    this.selectedFront = front ?? null;
    this.emit('fronts', this.selectedFront);
    this.requestRender();
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
    saveToStorage(this);
  }

  save() {
    return saveToStorage(this);
  }

  load() {
    return loadFromStorage(this);
  }

  /** İşçileri ve bütçeleri baştan hesaplar; kayıt yüklendikten sonra gerekir. */
  recomputeEconomy() {
    if (!this.world) return;
    assignAllWorkers(this.world);
    for (const nation of this.world.nations) {
      nation.budget = nationBudget(this.world, nation);
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

  declareWarOn(nationId) {
    const ok = declareWar(this, this.turns.playerNation, nationId);
    if (ok) {
      this.selectUnit(this.selectedUnit);
      this.emit('units', this.selectedUnit);
      this.requestRender();
    }
    return ok;
  }

  /** Barış teklifi: karşı taraf reddedebilir. */
  proposePeaceTo(nationId) {
    const accepted = considerPeaceOffer(this, this.turns.playerNation, nationId, this.turns.rng);
    if (!accepted) {
      this.turns.addLog(`${this.world.nations[nationId].name} rejected the peace offer.`);
    }
    this.selectUnit(this.selectedUnit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return accepted;
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

  beginBuildingPlacement(buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building || !this.world) return false;
    const tiles = buildingPlacementTiles(
      this.world, this.turns.playerNation, buildingId, 2,
    );
    if (!tiles.size) return false;
    this.selectUnit(null);
    this.buildingPlacement = { buildingId, tiles };
    this.emit('placement', this.buildingPlacement);
    this.requestRender();
    return true;
  }

  cancelBuildingPlacement() {
    if (!this.buildingPlacement) return;
    this.buildingPlacement = null;
    this.emit('placement', null);
    this.requestRender();
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
    if (!this.world || !this.clock.speed || this.turns.victory) return;
    this.clock.accumulator += elapsed;
    const stepMs = 1200 / this.clock.speed;
    let steps = 0;
    while (this.clock.accumulator >= stepMs && steps < 3) {
      this.clock.accumulator -= stepMs;
      this.endTurn();
      steps++;
    }
  }

  handleHover(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    const changed = tile !== this.hovered;
    this.hovered = tile;
    // Cephe/geri cekilme kipinde imlecin yakinindaki sinir parlar; tiklayinca
    // hat oraya oturur. Elle hex hex cizmek gerekmesin.
    const wanted = ['front', 'fallback'].includes(this.drawMode)
      ? this.borderPreviewAt(tile)
      : null;
    const same = wanted?.key === this.borderPreview?.key;
    if (changed || !same) {
      this.borderPreview = wanted;
      this.requestRender();
    }
  }

  /**
   * Imlecin altindaki/yakinindaki sinir hatti. Once o karenin komsusu olan
   * yabanci ulke bulunur, sonra o ulkeyle olan sinirin imlece yakin parcasi
   * dondurulur.
   */
  borderPreviewAt(tile) {
    if (!tile || !this.world) return null;
    const nationId = this.turns.playerNation;
    const nation = this.world.nations[nationId];
    if (!nation?.alive) return null;

    // İmlecin bulunduğu ya da bitişiğindeki yabancı ülke hedeftir. Komşuda
    // sahipli bir ülke yoksa (sınırımız boş araziye bakıyorsa) genel cephe
    // hattına düşeriz — erken oyunda sınırların çoğu böyledir.
    const candidates = [tile, ...this.world.neighbors(tile)];
    let foreignId = null;
    for (const candidate of candidates) {
      if (candidate.owner >= 0 && candidate.owner !== nationId) {
        foreignId = candidate.owner;
        break;
      }
    }
    const all = borderTiles(this.world, nationId, foreignId);
    if (all.length < 2) return null;
    // Uzun sinirin tamami degil, imlece en yakin parcasi secilir.
    const chain = chainTiles(all);
    let closest = 0;
    let bestDistance = Infinity;
    chain.forEach((candidate, index) => {
      const distance = hexDistance(candidate.q, candidate.r, tile.q, tile.r);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = index;
      }
    });
    const half = Math.floor(BORDER_SEGMENT / 2);
    const from = Math.max(0, closest - half);
    const tiles = chain.slice(from, from + BORDER_SEGMENT);
    return {
      foreignId,
      tiles,
      key: `${foreignId ?? 'frontier'}:${tiles[0]?.q}:${tiles[0]?.r}:${tiles.length}`,
    };
  }

  /** Vurgulanan sinira cephe/geri cekilme hatti kurar. */
  commitBorderFront(preview) {
    const nation = this.world.nations[this.turns.playerNation];
    if (!preview?.tiles?.length || !nation?.alive) return null;
    const plan = this.drawMode === 'fallback' ? PLAN.HOLD : PLAN.ADVANCE;
    const general = this.activeGeneral ?? generalOfArmy(nation, this.selection[0]) ?? null;
    const front = createFront(this, nation, preview.tiles, plan, general?.id ?? null);
    if (front) {
      const armies = general ? divisionsOf(this.world, general) : this.selection;
      for (const unit of armies) assignArmy(this.world, front, unit);
    }
    this.drawMode = null;
    this.borderPreview = null;
    this.selectedFront = front;
    this.emit('fronts', front);
    this.requestRender();
    return front;
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

  frame = () => {
    this.frameHandle = 0;
    const moving = this.input.update();
    if (this.dirty || moving) {
      this.dirty = false;
      if (this.world) {
        this.renderer.render(this.world, {
          selected: this.selected,
          hovered: this.hovered,
          selectedUnit: this.selectedUnit,
          playerNation: this.turns.playerNation,
          frontDraw: this.frontDraw,
          drawMode: this.drawMode,
          borderPreview: this.borderPreview,
          plannedPath: this.selectedFront?.plan === PLAN.ARROW
            ? plannedPath(this.world, this.selectedFront)
            : null,
          selectedFront: this.selectedFront,
          selection: this.selection,
          marquee: this.marquee,
          reachable: this.reachable,
          buildingPlacement: this.buildingPlacement,
        });
      }
    }
    if (moving) this.frameHandle = requestAnimationFrame(this.frame);
  };

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.input.destroy();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    if (this.clockTimer) clearInterval(this.clockTimer);
  }
}
