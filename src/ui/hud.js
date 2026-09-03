// DOM arayüzü: ayarlar, katman anahtarları, seçili hex paneli.
// Oyun mantığı burada yok; sadece Game'i sürer ve olaylarını dinler.

import {
  CITY_COST, UNIT_COSTS, canAfford, canFoundCity, formatCost, pay,
} from '../game/cities.js';
import {
  UNIT_TYPES, isMoving, maxHpOf, organizationOf, regimentCount, soldiersOf, speedOf,
  strengthRatio,
} from '../game/units.js';
import { MIN_WAR_TURNS, atWar, relation, truceLeft } from '../game/diplomacy.js';
import { warScore } from '../game/peace.js';
import { INFAMY_COALITION, OCCUPATION_TURNS, tileEfficiency } from '../game/infamy.js';
import { savedInfo } from '../game/save.js';
import { scoreboard } from '../game/hegemony.js';
import { ORDER, idleUnits } from '../game/orders.js';
import { ensureConstruction, investmentLevel } from '../game/construction.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { bindMacroCards } from './macroCard.js';
import { Screens } from './screens.js';
import { showEndScreen } from './endScreen.js';
import { formatPopulation, weeklyBalanceOf } from '../game/economy.js';
import {
  canRecruit, equipmentCostLabel, nationManpower, rallyTile, setRallyPoint, trainingWeeks,
} from '../game/recruitment.js';
import {
  BRANCH, MAX_SKILL, TRAITS, assignDivisions, commandSize, createGeneral, generalById,
  aggressionInfo, borderNationIds, frontTilesOf, generalCost, generalOfArmy,
  officersOf, refreshFront, setAggression, unassignGeneral,
} from '../game/command.js';
import {
  RGO_TYPES, provinceOutput, provinceRgoStatus,
} from '../game/provinces.js';
import { controllerOf, isOccupied } from '../game/control.js';
import { worldRows } from '../world/worldgen.js';

const ORDER_LABELS = {
  [ORDER.AUTO]: 'automatic (AI controlled)',
  [ORDER.HOLD]: 'holding position',
};

const $ = (id) => document.getElementById(id);

/** Klavyeyle kamera kaydirma. Sol surukleme kutu secimine ayrildi. */
const PAN_STEP = 90;
const PAN_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [1, 0], ArrowLeft: [1, 0],
  KeyD: [-1, 0], ArrowRight: [-1, 0],
};

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      seedChip: $('seed-chip'),
      seedValue: $('seed-value'),
      layers: $('layer-menu'),
      rgoLegend: $('rgo-map-legend'),
      populationLegend: $('population-map-legend'),
      settings: $('settings'),
      sheetBody: $('sheet-body'),
      genStats: $('gen-stats'),
      inSeed: $('in-seed'),
      inSize: $('in-size'),
      inCont: $('in-cont'),
      inLand: $('in-land'),
      inNations: $('in-nations'),
      lblSize: $('lbl-size'),
      lblCont: $('lbl-cont'),
      lblLand: $('lbl-land'),
      lblNations: $('lbl-nations'),
      turnValue: $('turn-value'),
      topFlag: $('top-flag'),
      topNation: $('top-nation'),
      topSub: $('top-sub'),
      resources: $('resources'),
      macroStats: $('macro-stats'),
      saveInfo: $('save-info'),
      hegemony: $('hegemony'),
      divisions: $('divisions'),
      divisionsBody: $('divisions-body'),
      divisionsCount: $('divisions-count'),
      commandBar: $('command-bar'),
      commandTools: $('command-tools'),
      warBar: $('war-bar'),
    };
    this.screens = new Screens(game);
    this.buildRgoLegend();
    this.bind();
  }

  /**
   * Kaynak lejandi RGO tablosundan uretilir. Elle yazilmis liste tabloya yeni
   * kaynak eklendikce geride kaliyordu: harita 14 kaynagi dogru boyuyor ama
   * lejand yalniz 4'unu acikliyordu.
   */
  buildRgoLegend() {
    const legend = this.el.rgoLegend;
    if (!legend) return;
    legend.innerHTML = Object.values(RGO_TYPES).map((type) => (
      `<span style="--rgo-color:hsl(${type.hue} 30% 38%)">${type.icon} ${type.name}</span>`
    )).join('');
  }

  /**
   * Aktif savaslar. Savas bir menu icinde gizli kalmamali: EU4'te oldugu gibi
   * ustte, kirmizi parlayan bir kutucuk olarak durur ve tiklaninca dogrudan
   * baris masasini acar.
   */
  showWars() {
    const bar = this.el.warBar;
    const world = this.game.world;
    const me = world?.nations[this.game.turns.playerNation];
    if (!bar || !me?.alive) { if (bar) bar.innerHTML = ''; return; }
    const wars = world.nations.filter(
      (other) => other.alive && other.id !== me.id && atWar(world, me.id, other.id),
    );
    bar.classList.toggle('hidden', wars.length === 0);
    // Savaş bittiyse savaş kartı da biter. Kart `ttl: 0` ile kalıcıdır ve
    // kendiliğinden kapanmaz; barış onu geçersiz kılan tek olaydır.
    if (!wars.length) this.game.notifications?.dismissKind('WAR');
    bar.innerHTML = wars.map((other) => {
      const score = warScore(world, me.id, other.id);
      const tone = score > 8 ? 'winning' : score < -8 ? 'losing' : 'even';
      // Bekleyen teklif menude kaybolmamali: savas kutucugu zaten ustte duruyor.
      const offered = this.game.hasPeaceOffer(me.id, other.id);
      return `<button class="war-chip ${tone}${offered ? ' offered' : ''}" data-war-target="${other.id}"
        title="${offered ? `${escapeHtml(other.name)} has proposed terms`
    : `Open peace talks with ${escapeHtml(other.name)}`}">
        <span class="war-name">${offered ? '🕊 ' : ''}${escapeHtml(other.name)}</span>
        <b class="war-score">${score >= 0 ? '+' : ''}${score}</b>
      </button>`;
    }).join('');
    for (const chip of bar.querySelectorAll('[data-war-target]')) {
      const id = Number(chip.dataset.warTarget);
      // Teklif bekleyen savasta masa degil, teklifin durdugu diplomasi ekrani acilir.
      chip.onclick = () => (this.game.hasPeaceOffer(me.id, id)
        ? this.screens.open('diplomacy')
        : this.screens.openPeaceTalks(id));
    }
  }

  bind() {
    const { game, el } = this;

    $('btn-layers').onclick = () => {
      el.layers.classList.toggle('hidden');
      el.settings.classList.add('hidden');
    };
    $('btn-settings').onclick = () => {
      el.settings.classList.toggle('hidden');
      el.layers.classList.add('hidden');
    };
    $('btn-close-settings').onclick = () => el.settings.classList.add('hidden');

    // Harita modları: sağ alt köşedeki düğme kümesi
    for (const btn of document.querySelectorAll('.mode-btn[data-mode]')) {
      btn.onclick = () => {
        if (this.screens.active === 'construction') this.screens.close();
        game.renderer.setMapMode(btn.dataset.mode);
        for (const other of document.querySelectorAll('.mode-btn[data-mode]')) {
          other.classList.toggle('active', other === btn);
        }
        el.rgoLegend.classList.toggle('hidden', btn.dataset.mode !== 'resources');
        el.populationLegend.classList.toggle('hidden', btn.dataset.mode !== 'population');
        game.requestRender();
      };
    }

    $('opt-grid').onchange = (e) => this.setLayer('showGrid', e.target.checked);
    $('opt-labels').onchange = (e) => this.setLayer('showLabels', e.target.checked);
    // CANLI DENIZ — kare suresinin tek en buyuk kalemi.
    //
    // Olculdu: uzak zoomda kare suresinin %97'si su katmani (47 ms; hedef 2 ms),
    // ve duraklatilmis oyunda bile ana thread'in %64'u denizi ciziyordu.
    // Kalite anahtari `WaterLayer` icinde zaten vardi ama yalnizca konsoldan
    // erisiliyordu (water.js: "Gelistirici anahtarlari; oyuncu arayuzunde yok"),
    // yani yavas makinedeki oyuncunun eline hicbir zaman gecmiyordu.
    // 'low' taban + kabarmayi birakir, kirisik/parilti/kopugu keser.
    const water = game.renderer?.water;
    if (water) {
      $('opt-live-sea').onchange = (e) => {
        water.quality = e.target.checked ? 'high' : 'low';
        // `swell` DE kapanmali. Uzak zoomun pahali yolu (`drawFar`) yalnizca
        // `debug.swell`e bakar, `quality`ye DEGIL: kalite 'low' yapilsa bile
        // desen dolgusu -- maliyetin tamami -- yine calisiyordu. `base` acik
        // kalir, yani deniz duruyor; yalnizca canlanmiyor.
        for (const key of ['swell', 'ripple', 'shimmer', 'foam', 'disturbance']) {
          water.debug[key] = e.target.checked;
        }
        game.renderer.invalidateCache();
        game.requestRender();
      };
    }

    el.seedChip.onclick = () => this.copySeed();

    const sync = () => this.syncLabels();
    el.inSize.oninput = sync;
    el.inCont.oninput = sync;
    el.inLand.oninput = sync;
    el.inNations.oninput = sync;
    sync();

    $('btn-generate').onclick = () => {
      const cols = Number(el.inSize.value);
      const rows = worldRows(cols);
      const nations = Number(el.inNations.value);
      game.newWorld(el.inSeed.value.trim() || undefined, {
        cols,
        rows,
        continentality: Number(el.inCont.value),
        landBias: Number(el.inLand.value),
        nationCount: nations > 0 ? nations : null,
      });
      el.settings.classList.add('hidden');
    };

    $('btn-save').onclick = () => {
      this.el.saveInfo.textContent = game.save() ? 'Game saved.' : 'Could not save (storage may be disabled).';
    };
    $('btn-load').onclick = () => {
      this.el.saveInfo.textContent = game.load() ? 'Game loaded.' : 'No compatible save found.';
      this.refreshSaveInfo();
    };

    for (const btn of document.querySelectorAll('.time-btn[data-speed]')) {
      btn.onclick = () => game.setSpeed(Number(btn.dataset.speed));
    }
    this.bindKeys();
    this.bindCommandDock();
    this.trackHeaderHeight();
    // HOI4'teki ülke bayrağı gibi ulusal durum panelini açar.
    $('nation-badge').onclick = () => this.screens.toggle('nation');

    game.on('world', (world) => { this.onWorld(world); this.showWars(); });
    game.on('select', (tile) => this.showTile(tile));
    // Hafta damgasi yalniz gercek tur olayinda: onTurn ekonomi/insaat
    // olaylarinda da kosar, oradan sayilsaydi efektif hiz sisiyordu.
    game.on('turn', () => { (this.weekStamps ??= []).push(performance.now()); this.onTurn(); this.showWars(); });
    game.on('peace', () => this.showWars());
    // Gün tiki yalnız tarihi oynatır. Eskiden her gün tam onTurn koşuyordu:
    // hız 8'de saniyede 8 kez skorbord + ordu toplamı + üç innerHTML bloğu
    // (ölçüldü: tik başına ~1-2.4 ms + DOM çöpü). Haftalık kapanış zaten
    // 'turn'/'economy' olaylarıyla tam tazeliyor.
    game.on('clock', () => this.onDay());
    game.on('economy', () => this.onTurn());
    // İnşaat/yatırım kararı hazineden ANINDA para düşer ama haftalık tik
    // gelene kadar üst çubuk eski rakamı gösteriyordu: oyuncu ¤220 sanıp
    // ¤0 ile karar veriyordu (kör beta B-006). Ekonomi ekranı bu olayı zaten
    // dinliyordu; üst çubuk dinlemiyordu.
    game.on('construction', () => this.onTurn());
    // Kampanya sonu (1945) tek satirlik bir metinle geciyordu; 'victory'
    // olayinin hicbir dinleyicisi yoktu. Artik yuzyilin kapanis sayfasi acilir.
    game.on('victory', (result) => showEndScreen(game, result));
    // "WHY THE PRICE MOVES" kalibi istikrara: dokum vardi ama YALNIZ hover
    // tooltip'inde duruyordu — kor beta testcisi 80 yil boyunca bulamadi
    // (B-003). Tiklama da ayni metni acar; tooltip ikincil yol olarak kalir.
    this.el.resources.addEventListener('click', (event) => {
      const cell = event.target.closest?.('[data-why="stability"]');
      if (cell) this.toggleWhy(cell, stabilityWhy(this.game.world?.nations[this.game.turns.playerNation]));
    });
    this.el.resources.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const cell = event.target.closest?.('[data-why="stability"]');
      if (!cell) return;
      event.preventDefault();
      this.toggleWhy(cell, stabilityWhy(this.game.world?.nations[this.game.turns.playerNation]));
    });
    game.on('battles', () => {
      if (game.selected) this.showTile(game.selected);
      this.onTurn();
    });
    game.on('provinces', () => {
      if (game.selected) this.showTile(game.selected);
      this.onTurn();
    });
    game.on('selection', (units) => this.showSelection(units));
    game.on('command', () => this.showCommand());
    game.on('units', () => {
      this.showTile(this.game.selected);
      this.onTurn();
    });
  }

  /**
   * Üst çubuğun gerçek yüksekliğini `--hud-top` değişkenine yazar; sekme
   * şeridi ve yönetim paneli konumlarını buradan okur.
   *
   * Neden ölçüyoruz: yükseklik sabit değil — göstergeler geniş ekranda tek,
   * dar ekranda iki ya da üç satıra diziliyor. Bunu CSS'te sabit bir
   * `--topbar-height` ile tahmin etmek iki türlü kırılıyordu: tahmin gerçek
   * yüksekliği tutmayınca şeritler üst üste biniyor, ve media query pencere
   * yeniden boyutlandırılarak değiştiğinde `calc()` içindeki değişkenler
   * tarayıcıda yeniden hesaplanmadığı için düzen ancak sayfa yenilenince
   * toparlanıyordu. ResizeObserver ölçüyü her durumda doğru tutar.
   */
  trackHeaderHeight() {
    const header = document.querySelector('.hud-header');
    const screen = document.querySelector('.screen');
    if (!header || !screen) return;
    // Üst bar ve sekme şeridi artık aynı akışta olduğu için birbirlerine
    // binemezler; ölçülmesi gereken tek şey yönetim panelinin nereden
    // başlayacağı. Ölçü doğrudan elemanın `style`'ına yazılır — CSS değişkeni
    // üzerinden yapılan güncelleme bu tarayıcıda her zaman yerleşimi yeniden
    // hesaplatmıyor.
    // Bildirim yığını da aynı ölçüye bağlanır: sabit bir CSS değeriyle
    // konumlandırıldığında sekme şeridinin üstüne biniyor ve Budget/Politics
    // sekmelerini kapatıyordu.
    const notify = document.getElementById('notify-stack');
    const apply = () => {
      const top = Math.round(header.getBoundingClientRect().height) + 16;
      screen.style.top = `${top}px`;
      screen.style.maxHeight = `calc(100vh - ${top}px - 12px)`;
      if (notify) notify.style.top = `${top}px`;
      // Tumen listesi de baslik yuksekligine gore yer bulur: sabit 140px
      // tahmini, savas seridi acilinca listeyi cipin ustune bindiriyordu
      // (1280x720, Open Beta 4 B-14).
      document.documentElement.style.setProperty('--header-bottom', `${top}px`);
    };
    apply();
    if (typeof ResizeObserver === 'function') {
      this.headerObserver = new ResizeObserver(() => apply());
      this.headerObserver.observe(header);
    }
    window.addEventListener('resize', apply);
  }

  /**
   * Paradox tarzi saat kisayollari ve kamera tuslari. Sol surukleme kutu
   * secimine ayrildigi icin kamera WASD/ok tuslariyla da gezer.
   */
  /**
   * Ana menüyü ayarlar panelindeki düğmeye bağlar. Menü `main.js`te kurulur;
   * HUD onu yalnız açabilsin diye referansı burada tutulur.
   * (Arayüz metni İngilizce; Türkçe olan yalnız kod ve yorumlar.)
   */
  bindMenu(menu) {
    this.menu = menu;
    const btn = document.getElementById('btn-menu');
    if (!btn) return;
    btn.onclick = () => {
      this.el.settings.classList.add('hidden');
      menu.reopen();
    };
  }

  bindKeys() {
    window.addEventListener('keydown', (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      // Perde açıkken boşluk/ok tuşları arkadaki haritayı sürmesin.
      if (document.body.classList.contains('menu-open')) return;

      if (event.code === 'Space') {
        event.preventDefault();
        this.game.togglePause();
        return;
      }
      if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
        event.preventDefault();
        this.game.stepSpeed(1);
        return;
      }
      if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
        event.preventDefault();
        this.game.stepSpeed(-1);
        return;
      }
      if (event.code === 'KeyN') {
        // "Siradaki bosta birim": fonksiyon bastan beri vardi (selectNextIdle),
        // hicbir tus/dugme cagirmiyordu. HOLD emirli birimler dongude gorunmez.
        event.preventDefault();
        this.game.selectNextIdle();
        return;
      }
      if (event.code === 'Escape') {
        // BUG-023: Escape hicbir seyi kapatmiyordu; oyuncu ✕'i aramak
        // zorundaydi. Sira onemli — once ACIK PANEL kapanir, panel yoksa
        // secim temizlenir. Tersi olsaydi panel acikken Escape sessizce
        // secimi silip paneli birakirdi.
        if (this.screens?.active) {
          this.screens.close();
          return;
        }
        this.game.selectGeneral(null);
        this.game.selectUnits([]);
        // Province secimi de kalkar: kalmasaydi sol alttaki rehber karti ilk
        // harita tikindan sonra bir daha hic gorunmuyordu (Open Beta 4, B-9).
        // `select` olayi null ile yayinlanir; HUD onu showGuidance'a cevirir.
        if (this.game.selected) {
          this.game.selected = null;
          this.game.emit('select', null);
          this.game.requestRender();
        }
        return;
      }
      const pan = PAN_KEYS[event.code];
      if (pan) {
        event.preventDefault();
        this.game.camera.panByScreen(pan[0] * PAN_STEP, pan[1] * PAN_STEP);
        this.game.requestRender();
      }
    });
  }

  /** Komuta panelinin sabit dugmeleri: plan araclari ve durus kademesi. */
  bindCommandDock() {
    const { game } = this;
    $('divisions-clear').onclick = () => {
      game.selectGeneral(null);
      game.selectUnits([]);
    };
    $('btn-offensive').onclick = () => {
      game.toggleOffensive();
      this.showCommand();
    };
    $('command-target').onchange = (event) => {
      const value = event.target.value;
      game.setCommandTarget(value === '' ? null : Number(value));
      this.showCommand();
    };
    for (const btn of document.querySelectorAll('#command-tools [data-stance]')) {
      btn.onclick = () => {
        const general = game.activeGeneral;
        if (!general) return;
        setAggression(general, Number(btn.dataset.stance));
        game.emit('command', general);
        game.requestRender();
        this.showCommand();
      };
    }
  }

  /** Soldaki tumen listesi. Secim bosken gizlenir. */
  showSelection(units = this.game.selection) {
    const { el, game } = this;
    const me = game.world?.nations[game.turns.playerNation];
    const list = units ?? [];
    el.divisions.classList.toggle('hidden', list.length === 0);
    if (!me) return;

    if (list.length) {
      el.divisionsCount.textContent =
        `${list.length} ${list.length === 1 ? 'division' : 'divisions'} selected`;
      el.divisionsBody.innerHTML = list.map((unit) => {
        const general = generalOfArmy(me, unit);
        // Denizdeki tumen SAVASAMAZ ve konvoy tuketir — bu iki gercek
        // ekranda hic soylenmiyordu (survey: SURFACE karari).
        const state = unit.embarked ? 'at sea — cannot fight, consumes convoys'
          : unit.battleId ? 'in battle'
            : (unit.retreatUntil ?? 0) > game.turns.turn ? 'retreating'
              : (unit.attackReadyAt ?? 0) > game.turns.turn ? 'reorganizing'
                : isMoving(unit) ? `marching (${unit.path.length} left)`
                  : 'holding';
        return `<div class="division-row">
          <button class="division-main" data-focus-unit="${unit.id}">
            <span class="unit-badge" style="background:${me.color}">${unit.type.glyph}</span>
            <span class="division-text">
              <b>${regimentCount(unit)}× ${escapeHtml(unit.type.name)} · ${formatPopulation(soldiersOf(unit))}</b>
              <small>${state} · STR ${Math.round(strengthRatio(unit) * 100)}% · ORG ${Math.round(organizationOf(unit))}%
                · ${general ? escapeHtml(general.name) : 'no commander'}</small>
            </span>
          </button>
        </div>`;
      }).join('');

      for (const btn of el.divisionsBody.querySelectorAll('[data-focus-unit]')) {
        btn.onclick = () => {
          const unit = game.world.units.find((u) => u.id === Number(btn.dataset.focusUnit));
          if (!unit) return;
          game.camera.centerOn(unit.tile.x, unit.tile.y);
          game.selected = unit.tile;
          game.emit('select', unit.tile);
          game.requestRender();
        };
      }
    }
    this.showCommand();
  }

  /**
   * Komuta paneli: her zaman ekranin orta altinda. Portreye sol tik o generalin
   * butun tumenlerini secer, sag tik secili tumenleri ona devreder.
   */
  showCommand() {
    const { el, game } = this;
    const me = game.world?.nations[game.turns.playerNation];
    if (!me || !el.commandBar) return;
    // Yalniz kara kadrosu: bu serit cephe yonetimi icindir ve amiralin cephesi
    // yoktur. Filo komutasi Military ekranindan verilir (bkz. militaryScreen).
    const generals = officersOf(me, BRANCH.ARMY);
    const active = game.activeGeneral;
    const selected = game.selection.length;

    el.commandBar.innerHTML = `${generals.map((general) => {
    const size = commandSize(general);
    const icon = general.traits.length ? TRAITS[general.traits[0]].icon : '✵';
    const hint = `${general.name} - skill ${general.skill} - ${size} divisions`
      + ` (left click selects the command, right click transfers ${selected} selected)`;
    return `<button class="command-slot ${active?.id === general.id ? 'active' : ''}"
        data-general="${general.id}" title="${escapeHtml(hint)}">
        <span class="portrait">${icon}</span>
        <b>${escapeHtml(general.name.split(' ')[0])}</b>
        <small>${'★'.repeat(general.skill)} · ${size}</small>
      </button>`;
  }).join('')}
    <button class="command-slot empty" data-new-command="1"
      title="Assign the selected divisions to a commander">
      <span class="portrait">+</span><b>Assign</b></button>`;

    el.commandTools.classList.toggle('hidden', !active);
    if (active) {
      const offensive = $('btn-offensive');
      const running = game.offensiveActive();
      offensive.classList.toggle('active', running);
      offensive.textContent = running ? '■ Halt' : '➤ Offensive';
      const target = $('command-target');
      const borderIds = new Set(borderNationIds(game.world, me.id));
      if (active.target != null) borderIds.add(active.target);
      const options = game.world.nations
        .filter((nation) => nation.alive && nation.id !== me.id && borderIds.has(nation.id))
        .sort((a, b) => Number(atWar(game.world, me.id, b.id))
          - Number(atWar(game.world, me.id, a.id)) || a.name.localeCompare(b.name));
      target.innerHTML = `<option value="">All active fronts</option>${options.map((nation) => (
        `<option value="${nation.id}">${atWar(game.world, me.id, nation.id) ? '⚔ ' : ''}${escapeHtml(nation.name)}</option>`
      )).join('')}`;
      target.value = active.target == null ? '' : String(active.target);
      for (const btn of el.commandTools.querySelectorAll('[data-stance]')) {
        btn.classList.toggle('active', Number(btn.dataset.stance) === (active.aggression ?? 2));
      }
    }

    for (const btn of el.commandBar.querySelectorAll('[data-general]')) {
      const general = generalById(me, Number(btn.dataset.general));
      btn.onclick = () => game.selectGeneral(general);
      btn.oncontextmenu = (event) => {
        event.preventDefault();
        if (!game.selection.length) return;
        const moved = game.transferSelection(general);
        if (moved) {
          game.turns.addLog(`${moved} divisions transferred to ${general.name}.`);
        }
        this.showSelection();
      };
    }
    const create = el.commandBar.querySelector('[data-new-command]');
    if (create) create.onclick = () => this.openGeneralPicker(game.selection);
  }

  setLayer(flag, value) {
    this.game.renderer[flag] = value;
    this.game.renderer.invalidateCache();
    this.game.requestRender();
  }

  syncLabels() {
    const { el } = this;
    const cols = Number(el.inSize.value);
    el.lblSize.textContent = `${cols} × ${worldRows(cols)}`;
    el.lblCont.textContent = Number(el.inCont.value).toFixed(2);
    el.lblLand.textContent = Number(el.inLand.value).toFixed(2);
    const n = Number(el.inNations.value);
    el.lblNations.textContent = n > 0 ? String(n) : 'automatic';
  }

  onWorld(world) {
    this.el.seedValue.textContent = world.seed;
    this.el.inSeed.value = world.seed;
    const landPct = Math.round((world.landCount / world.tiles.length) * 100);
    this.el.genStats.textContent =
      `${world.tiles.length} hexes · ${landPct}% land · ${world.nations.length} nations · ${world.genTime.toFixed(0)} ms`;
    this.showGuidance();
    this.showSelection([]);
    this.onTurn();
    this.refreshSaveInfo();
  }

  /** Hegemonya çubuğu: oyunun amacı her an görünür olsun. */
  refreshHegemony() {
    const { game } = this;
    const el = this.el.hegemony;
    if (!game.world) return;

    if (game.turns.victory) {
      const v = game.turns.victory;
      el.classList.add('won');
      el.innerHTML = `${escapeHtml(v.nation.name)} established hegemony — ${v.score} points
        (${v.reason === 'hegemony' ? 'target reached' : 'time expired'},
        ${v.byConquest ? 'largest nation' : 'non-conquest victory'})`;
      return;
    }

    el.classList.remove('won');
    const board = scoreboard(game.world);
    const me = board.find((b) => b.nation.id === game.turns.playerNation);
    const leader = board[0];
    if (!me) {
      el.innerHTML = 'Your nation has been eliminated.';
      return;
    }
    const rank = board.indexOf(me) + 1;
    // Etiket/değer düzeni: tek satır serbest metin yerine taranabilir hücreler.
    el.innerHTML = `
      <div class="hegemony-row">
        <span title="Economy + Prestige. The nation with the highest score on the last turn (1900) wins; there is no early victory.">
          <small>Hegemony</small><b>${me.total}<em>/${leader.total}</em></b></span>
        <span title="Your place among ${board.length} living nations. The leader's score is the denominator on the left.">
          <small>Rank</small><b>${rank}<em>/${board.length}</em></b></span>
        <span title="Raw production (gold, food, timber, iron) × 1.2, plus every factory level weighted by the era: industry counts for more as the century advances. Build and expand factories to move it.">
          <small>Economy</small><b>${me.economy}</b></span>
        <span title="Cities (2 each, plus size), nations at peace with you (2 each) and territory (0.04 per hex). Found cities, keep the peace, hold land.">
          <small>Prestige</small><b>${me.prestige}</b></span>
      </div>
      <span class="bar"><i style="width:${Math.min(100, (me.total / Math.max(1, leader.total)) * 100)}%"></i></span>
      ${leader.nation.id === me.nation.id
        ? '<p class="hegemony-leader">You lead the world.</p>'
        : `<p class="hegemony-leader">Leader: <b>${escapeHtml(leader.nation.name)}</b> ${leader.total}</p>`}`;
  }

  /**
   * Kucuk "neden" balonu. Yeni bir gosterge tahtasi degil: ayni metni
   * tiklamayla da erisilir kilar (dokunmatik ve hizli oyunda hover yoktur).
   */
  toggleWhy(anchor, text) {
    if (this.whyPop?.isConnected && this.whyPop.dataset.anchor === anchor.dataset.why) {
      this.whyPop.remove();
      return;
    }
    this.whyPop?.remove();
    if (!text) return;
    const pop = document.createElement('div');
    pop.className = 'why-pop';
    pop.dataset.anchor = anchor.dataset.why;
    pop.textContent = text;
    const rect = anchor.getBoundingClientRect();
    pop.style.top = `${Math.round(rect.bottom + 6)}px`;
    pop.style.left = `${Math.round(rect.left)}px`;
    document.body.append(pop);
    this.whyPop = pop;
    // Bir sonraki tiklama kapatir; balon kendi tiklamasiyla kapanmaz.
    setTimeout(() => {
      const close = (event) => {
        if (pop.contains(event.target)) return;
        pop.remove();
        document.removeEventListener('pointerdown', close);
      };
      document.addEventListener('pointerdown', close);
    }, 0);
  }

  refreshSaveInfo() {
    const info = savedInfo();
    // Otomatik kayit VAR ama kendini hic tanitmiyordu: ilk kayittan sonra
    // "autosave" kelimesi bir daha ekranda gecmiyor, oyuncu 80 yil boyunca
    // kaydi olmadigini saniyordu (kor beta B-029). Tarih ve "autosave"
    // kelimesi artik satirda kaliyor.
    this.el.saveInfo.textContent = info
      ? `Autosave · ${info.seed} · ${gameDate(info.turn)}`
      : 'No save yet. The game autosaves every ten weeks.';
  }

  /** Gün tiki: yalnız tarih yazısı ve (değiştiyse) hız düğmeleri. */
  onDay() {
    const { turns, world, clock } = this.game;
    if (!world) return;
    const label = gameDate(turns.turn, clock.day);
    if (label !== this.lastDateLabel) {
      this.lastDateLabel = label;
      this.el.turnValue.textContent = label;
    }
    this.showEffectiveSpeed();
    if (clock.speed !== this.lastSpeedShown) {
      this.lastSpeedShown = clock.speed;
      this.speedSince = performance.now();
      this.weekStamps = [];
      for (const btn of document.querySelectorAll('.time-btn[data-speed]')) {
        btn.classList.toggle('active', Number(btn.dataset.speed) === clock.speed);
      }
    }
  }

  /**
   * Yuksek hizda saat kendini tur maliyetine gore kisar (game.js pumpTurnFrame:
   * hafta 5 ms'lik dilimlerle islenir) ve bunu kimseye soylemiyordu: 8x'te
   * 8 saniyede 2 hafta gecince oyuncu 2x sandi (Open Beta 4). Son bes saniyede
   * kapanan hafta sayisindan efektif carpan turetilir; nominalin %80'inin
   * altina dusunce tarih rozetinin yaninda yazar.
   */
  showEffectiveSpeed() {
    const { clock } = this.game;
    if (!this.effEl) {
      this.effEl = document.createElement('small');
      this.effEl.className = 'turn-effective';
      this.effEl.title = 'Effective speed: the simulation could not keep up with the clock this second.';
      this.el.turnValue.after(this.effEl);
    }
    const now = performance.now();
    // On saniyelik pencere: 8x'te bile hafta 0.9 s surer, bes saniyede
    // yalniz bir-iki hafta kapanir ve olcum gurultuye bogulur.
    const stamps = (this.weekStamps ??= []).filter((t) => now - t <= 10000);
    this.weekStamps = stamps;
    const nominal = clock.speed / 7;           // hafta/sn: gun = 1000 ms / hiz
    const effective = stamps.length / 10;
    const running = clock.speed >= 2 && now - (this.speedSince ?? 0) > 10000;
    const throttled = running && effective < nominal * 0.8;
    const text = throttled ? `effective ×${(effective * 7).toFixed(1)}` : '';
    if (this.effEl.textContent !== text) this.effEl.textContent = text;
  }

  onTurn() {
    const { turns, world } = this.game;
    if (!world) return;
    // Üst bar tazelemesi hem kare içinde (tur dilimi) hem kare dışında
    // (saat tiki) tetiklenir; maliyeti iki durumda da ölçülür.
    const t0 = performance.now();
    this.lastDateLabel = gameDate(turns.turn, this.game.clock.day);
    this.lastSpeedShown = this.game.clock.speed;
    this.el.turnValue.textContent = gameDate(turns.turn, this.game.clock.day);
    const me = world.nations[turns.playerNation];
    const alive = world.nations.filter((n) => n.alive).length;
    const cities = world.cities.filter((c) => c.nationId === turns.playerNation).length;
    this.el.resources.innerHTML = me ? resourcesHtml(me) : '—';
    // Bekleyen birim sayısı düğmede: turu bitirmeden önce ne kaldığı görünsün.
    for (const btn of document.querySelectorAll('.time-btn[data-speed]')) {
      btn.classList.toggle('active', Number(btn.dataset.speed) === this.game.clock.speed);
    }

    const wars = world.nations.filter(
      (n) => n.alive && atWar(world, n.id, turns.playerNation),
    ).length;
    this.refreshHegemony();

    // Sol üst künye: bayrak + ülke adı + tek satır özet (HOI4'ün ülke kutusu).
    if (me) {
      const army = world.units
        .filter((unit) => unit.nationId === me.id && unit.type.domain === 'land')
        .reduce((sum, unit) => sum + soldiersOf(unit), 0);
      this.el.macroStats.innerHTML = `
        <span class="macro-live" data-macro="population"><small>Population</small><b>${formatPopulation(me.economy?.population ?? 0)}</b></span>
        <span title="Standing army"><small>Army</small><b>${formatNumber(army)}</b></span>
        <span title="Recruitable population left in your provinces"><small>Manpower</small><b>${formatPopulation(nationManpower(world, me.id))}</b></span>
        <span class="macro-live" data-macro="gdp"><small>GDP</small><b>¤${formatNumber(Math.round(me.economy?.gdp ?? 0))}</b></span>`;
      this.ensureMacroCards();
      this.el.topFlag.src = flagDataUrl(me);
      this.el.topNation.textContent = me.name;
      // Savaş durumu künyedeki tek renkli öğe; gerisi soluk kalır. Ayraç
      // elmas: orta nokta tarihî künyede fazla "web" duruyordu.
      const state = wars
        ? `<span class="at-war">At war</span>`
        : 'At peace';
      const sep = '<i class="sep">◆</i>';
      // Gerçek province sayısı üretimden gelir; savaşta kare kare işgal
      // sürerken sayaç Faz E'ye dek üretim anındaki değeri gösterir.
      const provinceCount = me.provinces || null;
      this.el.topSub.innerHTML =
        `${provinceCount ? `${provinceCount} ${provinceCount === 1 ? 'province' : 'provinces'}`
          : `${me.tiles} ${me.tiles === 1 ? 'hex' : 'hexes'}`} ${sep} `
        + `${cities} ${cities === 1 ? 'city' : 'cities'} ${sep} ${state}`;
    } else {
      this.el.macroStats.textContent = '—';
      this.el.topNation.textContent = '—';
      this.el.topSub.textContent = 'eliminated';
    }
    if (!this.game.selected) this.showGuidance();
    this.game.perf?.add('ui.hud', performance.now() - t0);
  }

  /** Oyuncunun boşta kaldığında okuyacağı tek, öncelikli karar özeti. */
  showGuidance() {
    const { world, turns } = this.game;
    if (!world) return;
    const me = world.nations[turns.playerNation];
    if (!me) return;
    const wars = world.nations.filter((nation) => (
      nation.alive && atWar(world, nation.id, me.id)
    ));
    const battles = world.battleSystem?.battles?.filter((battle) => (
      battle.attackerNation === me.id || battle.defenderNation === me.id
    )) ?? [];
    // Kart devletin O ANKI haline gore konusur. Eskiden uc cumlesi vardi
    // (baris/savas/muharebe) ve temerrutteki devlete alti yil boyunca
    // "Review Military..." diyordu (Open Beta 4). Sira onemli: muharebe >
    // savas > ilk hafta > butce acigi > egitim > program > bos tumen >
    // bos insaat gucu > kitlik > rutin. Sayilar simulasyonun kendi
    // alanlaridir, kart hicbir seyi yeniden hesaplamaz.
    const balance = weeklyBalanceOf(me);
    const education = me.economy?.social?.education ?? 0;
    const research = me.research;
    const idle = idleUnits(world, me.id);
    const capacityIdle = investmentLevel(me, 'CONSTRUCTION_CAPACITY') > 0
      && !ensureConstruction(me).projects.some((p) => p.kind !== 'national');
    const flow = me.economy?.goodsFlow ?? {};
    const shortages = Object.values(flow).filter((f) => (f?.demand ?? 0) > 0.005
      && (f.fulfilled ?? 0) / f.demand < 0.925).length;
    let next;
    let why = 'Province → population and raw goods → factories and taxes → army and world prices.';
    if (battles.length) {
      next = 'A battle is active: select its army to inspect strength and organization.';
    } else if (wars.length) {
      next = 'Move an army onto an enemy army or province; defeated armies retreat.';
      why = 'Set a general\'s target and posture in the command dock; Aggressive assaults at even odds.';
    } else if (turns.turn <= 1) {
      next = 'Unpause for one week: the books open after the first weekly tick.';
      why = 'Income, prices and factory output all read zero until the market clears once.';
    } else if ((me.debt ?? 0) > 0 || balance < 0) {
      next = `Spending exceeds revenue (${balance >= 0 ? '+' : ''}${Math.round(balance)}/week): open Budget.`;
      why = 'Raise a class tax or the tariff, or lower army funding; every ledger line says what it is.';
    } else if (education < 25) {
      next = `Education is at ${education}%: raise it past 25% in Budget to unlock a National Programme.`;
      why = 'Literacy feeds research; the programme sets its direction for eight years.';
    } else if (research && !research.programme && (world.turn ?? 0) >= (research.programmeCooldown ?? 0)) {
      next = 'Proclaim a National Programme on the Technology screen.';
      why = 'Direction, price and an education floor for eight years; click a card twice.';
    } else if (idle.length) {
      next = `${idle.length} ${idle.length === 1 ? 'division has' : 'divisions have'} no orders: press N to cycle through them.`;
      why = 'A division under a general holds the border by itself; loose ones stand still.';
    } else if (capacityIdle) {
      next = 'Construction power is idle: queue a project on the Construction screen or dissolve a level.';
      why = 'Capacity upkeep runs every week whether or not anything is being built.';
    } else if (shortages) {
      next = `${shortages} goods are in shortage: the Trade screen shows which plant would pay.`;
      why = 'A plant covering an import bill earns from the first week.';
    } else {
      next = 'Books balanced, programme set, army posted: expand a profitable factory or review Trade.';
    }
    this.el.sheetBody.innerHTML = `
      <div class="decision-card">
        <small>NEXT MEANINGFUL DECISION</small>
        <h3>${escapeHtml(next)}</h3>
        <p>${escapeHtml(why)}</p>
        <div class="decision-kpis">
          <span><b>${weeklyBalanceOf(me) >= 0 ? '+' : ''}${Math.round(weeklyBalanceOf(me))}</b><small>weekly balance</small></span>
          <span><b>${battles.length}</b><small>active battles</small></span>
        </div>
      </div>`;
  }

  async copySeed() {
    const seed = this.game.world?.seed;
    if (!seed) return;
    try {
      await navigator.clipboard.writeText(seed);
      this.el.seedChip.classList.add('copied');
      setTimeout(() => this.el.seedChip.classList.remove('copied'), 900);
    } catch {
      /* pano izni yoksa sessiz geç */
    }
  }

  showTile(tile) {
    const body = this.el.sheetBody;
    if (!tile) {
      this.showGuidance();
      return;
    }
    const world = this.game.world;
    const nation = tile.owner >= 0 ? world.nations[tile.owner] : null;
    const controller = controllerOf(tile) >= 0 ? world.nations[controllerOf(tile)] : null;
    const color = nation ? nation.color : tile.terrain.color;
    const title = nation ? nation.fullName : 'Unclaimed Territory';
    const sub = `${tile.terrain.name} · ${tile.q}, ${tile.r}${tile.coastal ? ' · coast' : ''}`;

    const stats = [
      ['Defense', `${Math.round(tile.terrain.defense * 100)}%`],
      ['Terrain', tile.terrain.name],
    ];
    if (tile.culture >= 0) {
      // Kümenin tam bileşimi: haritadaki çizgili tarama burada sayıya döner.
      // Tek ad yazmak yanıltıcıydı — %51 çoğunluk da %100 gibi okunuyordu.
      const mix = world.provinces?.[tile.provinceId]?.cultures ?? [];
      const label = mix.length > 1
        ? mix.filter((row) => row.share >= 0.05)
          .map((row) => `${world.cultures[row.id]?.name ?? '?'} ${Math.round(row.share * 100)}%`)
          .join(' · ')
        : world.cultures[tile.culture].name;
      stats.push(['Culture', label]);
      const family = world.cultures[tile.culture].family;
      if (family) stats.push(['Language', family]);
    }
    // Fethin bedeli karede görünsün: işgal süresi ve verim kaybı.
    if (nation && tile.culture >= 0) {
      const held = (world.turn ?? 0) - (tile.heldSince ?? 0);
      const eff = tileEfficiency(tile, nation, world.turn ?? 0);
      const acceptedCulture = tile.culture === nation.culture
        || nation.accepted?.includes(tile.culture);
      if (isOccupied(tile)) stats.push(['Status', `occupied by ${controller?.name ?? '?'}`]);
      else if (eff === 0) stats.push(['Status', `postwar integration (${OCCUPATION_TURNS - held} weeks)`]);
      else if (eff < 1) stats.push(['Status', `foreign culture −${Math.round((1 - eff) * 100)}%`]);
      else if (acceptedCulture && tile.culture !== nation.culture) {
        stats.push(['Status', 'accepted culture']);
      }
    }
    if (tile.workedBy) stats.push(['Worked By', tile.workedBy.name]);
    if (nation) stats.push(['Nation Size', `${nation.tiles} hexes`]);
    if (tile.province) {
      const rgo = provinceRgoStatus(tile);
      const clusterRec = world.provinces?.[tile.provinceId];
      const rgoOutput = rgo.type && clusterRec
        ? (provinceOutput(world, clusterRec)[rgo.type.goodId] ?? 0) : 0;
      stats.unshift(
        ['Population', formatPopulation(tile.province.population)],
        ['RGO', rgo.type ? `${rgo.type.icon} ${rgo.type.name}` : '—'],
        ['RGO Workforce', `${formatPopulation(rgo.employed)}/${formatPopulation(rgo.jobs)} · ${Math.round(rgo.efficiency * 100)}%`],
        ['RGO Output', rgo.type ? `${rgoOutput.toFixed(2)}/week` : '—'],
        ['Unemployed', formatPopulation(rgo.unemployed)],
        ['Control', `${Math.round(tile.province.control)}%`],
      );
      if (tile.province.migration) {
        stats.splice(5, 0, [
          'Migration',
          `${tile.province.migration > 0 ? '+' : ''}${formatPopulation(tile.province.migration)}`,
        ]);
      }
    }
    // Küme kimliği en üstte: hangi province'in parçası olduğu ilk bakışta okunsun.
    const cluster = world.provinces?.[tile.provinceId];
    if (cluster) {
      const occupiedMembers = cluster.tileIdx.filter(
        (idx) => controllerOf(world.tiles[idx]) !== cluster.owner,
      ).length;
      if (cluster.owner >= 0 && occupiedMembers > 0) {
        stats.unshift(['Occupation', `${occupiedMembers}/${cluster.tileIdx.length} hexes lost`]);
      }
      // Koloni/fetih toprakları çekirdek değildir: eksik vergi, gönülsüz asker.
      if (cluster.owner >= 0 && cluster.coreOf !== cluster.owner) {
        stats.unshift(['Territory', 'non-core (colonial)']);
      }
      stats.unshift(['Province', `${cluster.name} · ${cluster.tileIdx.length} hexes`]);
    }

    const unit = tile.unit;
    const unitBlock = unit ? `
      <div class="unit-row">
        <span class="unit-badge" style="background:${world.nations[unit.nationId].color}">${unit.type.glyph}</span>
        <div style="flex:1;min-width:0">
          <div class="tile-title">${regimentCount(unit)}-regiment Army${unit.nationId === this.game.turns.playerNation ? '' : ' (enemy)'}${
  this.game.selection.length > 1 ? `<small class="tile-more"> · ${this.game.selection.length} divisions selected, showing the first</small>` : ''}</div>
          <div class="tile-sub">${formatPopulation(soldiersOf(unit))} soldiers · STR ${Math.round(strengthRatio(unit) * 100)}% · ORG ${Math.round(organizationOf(unit))}% · speed ${speedOf(unit)}${isMoving(unit) ? ` · MARCHING (${unit.path.length} left)` : ''}${unit.battleId ? ' · IN BATTLE' : ''}${(unit.retreatUntil ?? 0) > this.game.turns.turn ? ' · RETREATING' : ''}</div>
          <div class="army-composition">${Object.entries(unit.regiments?.reduce((out, regiment) => {
            out[regiment.typeId] = (out[regiment.typeId] ?? 0) + 1;
            return out;
          }, {}) ?? { [unit.type.id]: 1 }).map(([id, count]) => `${count}× ${UNIT_TYPES[id].name}`).join(' · ')}</div>
          <div class="hp-bar"><i style="width:${Math.max(0, (unit.hp / maxHpOf(unit)) * 100)}%"></i></div>
        </div>
      </div>` : '';

    // Ülke varsa bayrağı, yoksa arazi rengi göster.
    const emblem = nation
      ? `<img class="flag" src="${flagDataUrl(nation)}" alt="">`
      : `<span class="swatch" style="background:${color}"></span>`;

    // KUTU KAYDIRILMAZ. Eski dizilim on iki eşit kutucuktu; uzun değerler üç
    // satıra sarıyor, kutu `--sheet-max`ı aşıyor ve yanında bir kaydırma
    // çubuğu beliriyordu. Bilgi artık ÖNEME göre üç kademeye ayrılır:
    //   1. üç ana ölçü      — nüfus, denetim, savunma
    //   2. RGO bloğu        — tek satır: ne, ne kadar, kaç kişiyle
    //   3. künye satırı     — kültür/dil/boyut gibi bağlam, tam satır metin
    // Aynı bilgi, üçte bir yükseklik.
    const take = (key) => {
      const at = stats.findIndex(([k]) => k === key);
      return at < 0 ? null : stats.splice(at, 1)[0][1];
    };
    const province = take('Province');
    const population = take('Population');
    const control = take('Control');
    const defense = take('Defense');
    const rgoName = take('RGO');
    const rgoOut = take('RGO Output');
    const rgoWork = take('RGO Workforce');
    const unemployed = take('Unemployed');
    // Arazi zaten baslik alt satirinda yaziyor (bkz. `sub`); ikinci kez
    // basmak "Hills - 97,63 - Hills" gibi bir tekrar uretiyordu.
    take('Terrain');
    const culture = take('Culture');
    const language = take('Language');
    const size = take('Nation Size');
    const migration = take('Migration');

    // `tip` verilirse olcu gecikmeli bilgi karti tasir (bkz. ui/tooltip.js).
    const metric = (label, value, tip = '') => (value == null ? ''
      : `<span class="pv-metric"${tip ? ` data-tip="${tip}" tabindex="0"` : ''}
          ><small>${label}</small><b>${value}</b></span>`);
    const line = (label, value) => (value == null ? ''
      : `<span class="pv-line"><small>${label}</small><b>${escapeHtml(String(value))}</b></span>`);

    // Artakalan durum bilgileri (Status, Territory, Occupation, Worked By):
    // seyrek ama önemli — kendi uyarı satırlarında durur.
    const notes = stats.map(([k, v]) => `<span class="pv-note"><small>${k}</small>${v}</span>`).join('');

    body.innerHTML = unitBlock + this.actionsHtml(tile) + `
      <div class="province-view">
        <div class="tile-head">
          ${emblem}
          <div>
            <div class="tile-title">${escapeHtml(title)}</div>
            <div class="tile-sub">${escapeHtml(sub)}</div>
          </div>
        </div>

        <div class="pv-metrics">
          ${metric('Population', population)}
          ${metric('Control', control, 'control')}
          ${metric('Defense', defense, 'defense')}
        </div>

        ${rgoName ? `<div class="pv-rgo" data-tip="rgo" tabindex="0">
          <span class="pv-rgo-name">${rgoName}</span>
          <span class="pv-rgo-out">${rgoOut ?? '—'}</span>
          <span class="pv-rgo-work">${rgoWork ?? '—'}</span>
          ${unemployed && unemployed !== '0' ? `<em>${unemployed} unemployed</em>` : ''}
        </div>` : ''}

        ${notes ? `<div class="pv-notes">${notes}</div>` : ''}

        <div class="pv-lines">
          ${line('Province', province)}
          ${culture == null ? '' : `<span class="pv-line" data-tip="culture" tabindex="0">
            <small>Culture</small><b>${escapeHtml(String(culture))}</b></span>`}
          ${line('Language', language)}
          ${migration ? line('Migration', migration) : ''}
          ${line('Nation', size)}
        </div>
      </div>`;

    this.bindActions();
  }

  /** Karede yapılabilecek eylemler: şehirde birim al, birimle şehir kur. */
  actionsHtml(tile) {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    const rows = [];

    if (tile.city && tile.city.nationId === game.turns.playerNation) {
      const city = tile.city;
      const buttons = Object.entries(UNIT_COSTS).filter(
        // Gemi ancak kıyı şehrinde üretilebilir.
        ([id]) => UNIT_TYPES[id].domain !== 'sea' || tile.coastal,
      ).map(([id, cost]) => {
        const disabled = canAfford(me, cost) && canRecruit(game.world, me, id) ? '' : 'disabled';
        // Alay artik siparistir: kac hafta egitildigi dugmede yazmali, yoksa
        // oyuncu tikladiktan sonra haritada birim arar (bkz. recruitment.js).
        return `<button class="action" data-buy="${id}" ${disabled}
          title="Ordered into training; the full order book with reasons is on the Military screen.">${UNIT_TYPES[id].name} · ${formatCost(cost)} · ${equipmentCostLabel(id)} · ${trainingWeeks(id)}w</button>`;
      }).join('');
      // Nüfusun etnik bileşimi: yabancı halk payı ileride hoşnutsuzluğun ölçütü.
      const composition = Object.entries(city.pops)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${n} ${escapeHtml(game.world.cultures[id]?.name ?? '?')}`)
        .join(' · ');

      // Alim listesi KATLI acilir. Alti alay dugmesi kutuyu tek basina ~180px
      // sisiriyor ve baskent karesinde bilgi kismini ekranin disina itiyordu;
      // buyruk kutusunun asil isi "burada ne var" demektir, siparis vermek
      // Military ekraninin isidir. Islev duruyor, yalnizca katlanmis.
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(city.name)} — population: ${composition}</div>
      </div>
      <details class="sheet-fold">
        <summary>Recruit in ${escapeHtml(city.name)}</summary>
        <div class="action-row">${buttons}</div>
      </details>`);
    }

    // Yabancı toprak/birim: savaş ilanı ya da barış teklifi.
    const foreign = tile.owner >= 0 && tile.owner !== game.turns.playerNation
      ? tile.owner
      : (tile.unit && tile.unit.nationId !== game.turns.playerNation ? tile.unit.nationId : -1);
    if (foreign >= 0 && game.world.nations[foreign].alive) {
      const other = game.world.nations[foreign];
      const war = atWar(game.world, foreign, game.turns.playerNation);
      const rec = relation(game.world, foreign, game.turns.playerNation);
      const locked = war && game.turns.turn - rec.since < MIN_WAR_TURNS;
      const truce = truceLeft(game.world, foreign, game.turns.playerNation, game.turns.turn);
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(other.name)} — ${war ? 'at war' : truce ? `truce (${truce} turns)` : 'at peace'}</div>
        <button class="action wide" data-dossier="${foreign}">Open ${escapeHtml(other.name)} Dossier</button>
        ${war
    ? `<button class="action wide" data-peace="${foreign}" ${locked ? 'disabled' : ''}>Offer Peace${locked ? ` (${MIN_WAR_TURNS - (game.turns.turn - rec.since)} weeks)` : ''}</button>`
    : `<button class="action wide" data-war="${foreign}" ${truce ? 'disabled' : ''}>Declare War${truce ? ` (${truce} turns)` : ''}</button>`}
      </div>`);
    }

    // Secili ordunun komutani ve cephesi.
    const army = tile.unit && tile.unit.nationId === game.turns.playerNation ? tile.unit : null;
    if (army) {
      rows.push(this.commanderRow(me, army));
      rows.push(this.frontRow(me, army));
    }

    // Toplanma noktasi: yeni kurulan alaylar cikis province'inden buraya yurur.
    if (tile.owner === game.turns.playerNation && tile.terrain.passable) {
      const rally = rallyTile(game.world, me);
      const here = rally === tile;
      const where = rally
        ? `${rally.city ? escapeHtml(rally.city.name) : `${rally.q}, ${rally.r}`}`
        : 'none — new regiments stay where they are raised';
      rows.push(`<div class="action-row">
        <div class="k">rally point — ${where}</div>
        ${here
    ? '<button class="action wide" data-rally="clear">Clear Rally Point</button>'
    : '<button class="action wide" data-rally="set">Set Rally Point Here</button>'}
      </div>`);
    }

    // Ordu emri: uzun yürüyüş devam eder; savaş ve geri çekilme otomatik çözülür.
    // AUTO/HOLD ILK KEZ ERISILEBILIR: orders.js bastan beri devretme katmani
    // olarak duruyordu (CLAUDE.md'nin cekirdek mobil kurali) ama hicbir dugme
    // ORDER.AUTO/HOLD gondermiyordu — katman olu UI'ydi. Secili TUM tumenlere
    // uygulanir; donanma icin ozellikle degerli (filonun baska devir yolu yok).
    const own = tile.unit && tile.unit.nationId === game.turns.playerNation ? tile.unit : null;
    if (own) {
      const label = ORDER_LABELS[own.order?.type];
      const selectedCount = Math.max(1, game.selection.length);
      rows.push(`<div class="action-row">
        <div class="k">army orders — ${own.battleId ? 'fighting'
    : (own.retreatUntil ?? 0) > game.turns.turn ? 'retreating'
      : (own.attackReadyAt ?? 0) > game.turns.turn ? 'reorganizing'
        : label ?? 'awaiting destination'}</div>
        <button class="action" data-order="${ORDER.AUTO}"
          title="Delegate the ${selectedCount} selected unit(s) to the AI: they pick targets and fight on their own until you cancel.">Delegate (AUTO)</button>
        <button class="action" data-order="${ORDER.HOLD}"
          title="Hold position: the selected unit(s) stand fast and leave the next-idle cycle.">Hold</button>
        ${own.order
    ? '<button class="action" data-order="clear">Cancel Orders</button>'
    : ''}
      </div>`);
    }

    const unit = game.selectedUnit;
    if (unit && unit.tile === tile && !isMoving(unit) && canFoundCity(game.world, tile, unit.nationId)) {
      const disabled = canAfford(me, CITY_COST) ? '' : 'disabled';
      rows.push(`<div class="action-row"><button class="action wide" data-found="1" ${disabled}>Found City · ${formatCost(CITY_COST)}</button></div>`);
    }
    return rows.join('');
  }

  /** Ordunun komutan satiri. */
  commanderRow(me, army) {
    const general = generalOfArmy(me, army);
    if (!general) {
      return `<div class="action-row">
        <div class="k">commander — none assigned</div>
        <button class="action wide" data-generals="${army.id}">Appoint Commander</button>
      </div>`;
    }
    const traits = general.traits
      .map((id) => `${TRAITS[id].icon} ${escapeHtml(TRAITS[id].name)}`).join(' · ') || 'no traits';
    const stance = aggressionInfo(general.aggression);
    return `<div class="action-row">
      <div class="k">commander — ${escapeHtml(general.name)} · skill ${general.skill}/${MAX_SKILL}
        · ${commandSize(general)} divisions · ${stance.label}</div>
      <div class="general-traits">${traits}</div>
      <button class="action" data-generals="${army.id}">Change</button>
      <button class="action" data-unassign="${general.id}">Dismiss</button>
    </div>`;
  }

  /** Ordunun komutasindan turetilen cephe ve plan durumu. */
  frontRow(me, army) {
    const general = generalOfArmy(me, army);
    if (!general) {
      return `<div class="action-row">
        <div class="k">front — unassigned</div>
        <span class="order-help">Assign a commander; the front is derived from the border automatically.</span>
      </div>`;
    }
    const front = frontTilesOf(this.game.world, general);
    const ready = Math.round((general.planning ?? 0) * 100);
    const attack = general.stance === 'advance';
    const target = general.target == null
      ? 'all active borders'
      : this.game.world.nations[general.target]?.name ?? 'unknown nation';
    // Saldiri temposu GORUNUR olsun: aggression kadansi manuel taarruzu da
    // kitliyordu ve hicbir yer soylemiyordu (olculdu — sahte-yokluk hissi).
    const nextAssault = Math.max(0, (general.nextAssaultAt ?? 0) - this.game.turns.turn);
    const cadence = nextAssault > 0 ? ` · next assault in ${nextAssault}w` : '';
    return `<div class="action-row">
      <div class="k">front — ${attack ? 'advancing' : 'holding'} against ${escapeHtml(target)} ·
        ${front.length} provinces · ${commandSize(general)} divisions · planning ${ready}%${cadence}</div>
      <div class="meter"><i style="width:${ready}%"></i></div>
      <button class="action" data-command-stance="${general.id}"
        title="${attack ? 'Halting resets accumulated planning — the army regroups.' : 'Planning accumulated while holding carries into the offensive.'}">
        ${attack ? 'Halt Offensive' : 'Start Offensive'}</button>
    </div>`;
  }

  /** HOI4 tarzi komutan secme listesi. `armies` tek tumen ya da dizi olabilir. */
  openGeneralPicker(armies) {
    const game = this.game;
    const me = game.world.nations[game.turns.playerNation];
    const list = (Array.isArray(armies) ? armies : [armies]).filter(Boolean);
    const cost = generalCost(me);
    // Secim tamamen gemiyse amiral listesi acilir; karisik secimde kara kadrosu.
    const branch = list.length && list.every((army) => army.type.domain === 'sea')
      ? BRANCH.NAVY : BRANCH.ARMY;
    const cards = officersOf(me, branch).map((general) => {
      const size = commandSize(general);
      const traits = general.traits
        .map((id) => `<em title="${escapeHtml(TRAITS[id].desc)}">${TRAITS[id].icon} ${escapeHtml(TRAITS[id].name)}</em>`)
        .join('') || '<em>no traits</em>';
      return `<button class="general-card" data-pick-general="${general.id}">
        <b>${escapeHtml(general.name)}</b>
        <span class="general-skill">${'★'.repeat(general.skill)}${'☆'.repeat(MAX_SKILL - general.skill)}</span>
        <div class="general-traits">${traits}</div>
        <small>${size} divisions · ${general.battles ?? 0} battles</small>
      </button>`;
    }).join('') || '<p class="placeholder">No officers in the staff.</p>';

    this.el.sheetBody.innerHTML = `
      <div class="action-row">
        <div class="k">officer staff — assign ${list.length} selected division(s)</div>
        <button class="action" data-close-generals="1">Back</button>
      </div>
      <div class="general-grid">${cards}</div>
      <div class="action-row">
        <button class="action wide" data-train-general="1"
          ${canAfford(me, cost) ? '' : 'disabled'}>Train New Officer · ${formatCost(cost)}</button>
      </div>`;

    for (const btn of this.el.sheetBody.querySelectorAll('[data-pick-general]')) {
      btn.onclick = () => {
        assignDivisions(me, Number(btn.dataset.pickGeneral), list);
        game.activeGeneral = generalById(me, Number(btn.dataset.pickGeneral));
        refreshFront(game.world, game.activeGeneral);
        this.showTile(game.selected);
        this.showSelection();
        game.requestRender();
      };
    }
    const back = this.el.sheetBody.querySelector('[data-close-generals]');
    if (back) back.onclick = () => this.showTile(game.selected);
    const train = this.el.sheetBody.querySelector('[data-train-general]');
    if (train) {
      train.onclick = () => {
        if (!pay(me, generalCost(me))) return;
        const general = createGeneral(game.world, me, game.turns.rng, { branch });
        game.turns.addLog(`${general.name} joined the officer staff.`);
        this.openGeneralPicker(list);
        this.showCommand();
      };
    }
  }

  /**
   * Ust cubuktaki Population/GDP olculerini gecikmeli bilgi kartina baglar.
   * BIR KEZ baglanir: serit her hafta yeniden cizilir ama olay dinleyicisi
   * seridin KENDISINDE degil, kapsayicisindadir (olay delegasyonu).
   */
  ensureMacroCards() {
    if (this.macroCards) return;
    const { game } = this;
    this.macroCards = bindMacroCards(this.el.macroStats, {
      playerId: () => game.turns.playerNation,
      /** Gecmis izi: `economy.popHistory` (bkz. economy.recordPopulationTrend). */
      series: (metric) => {
        const me = game.world.nations[game.turns.playerNation];
        const history = me?.economy?.popHistory ?? [];
        const key = metric === 'gdp' ? 'gdp' : 'pop';
        return {
          samples: history.map((row) => row[key] ?? 0),
          current: metric === 'gdp' ? (me?.economy?.gdp ?? 0) : (me?.economy?.population ?? 0),
        };
      },
      /** Siralama CANLI durumdan turer; ayri bir tablo saklanmaz. */
      ranking: (metric) => game.world.nations
        .filter((nation) => nation.alive && nation.economy)
        .map((nation) => ({
          id: nation.id,
          name: nation.name,
          value: metric === 'gdp' ? (nation.economy.gdp ?? 0) : (nation.economy.population ?? 0),
        }))
        .sort((a, b) => b.value - a.value)
        .map((row, index) => ({ ...row, rank: index + 1 })),
    });
  }

  bindActions() {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    for (const btn of this.el.sheetBody.querySelectorAll('[data-buy]')) {
      // Shift = 5 siparis (askeri ekranla ayni kural); kisitlar durdurunca biter.
      btn.onclick = (event) => {
        const wanted = event.shiftKey ? 5 : 1;
        for (let i = 0; i < wanted; i++) {
          if (!game.turns.buyUnit(me, btn.dataset.buy)) break;
        }
      };
    }
    const found = this.el.sheetBody.querySelector('[data-found]');
    if (found) found.onclick = () => game.turns.foundCity(game.selectedUnit);
    const war = this.el.sheetBody.querySelector('[data-war]');
    if (war) war.onclick = () => game.declareWarOn(Number(war.dataset.war));
    const peace = this.el.sheetBody.querySelector('[data-peace]');
    // Otomatik barış kalktı: bu düğme de masayı açar (bkz. screens.openPeaceTalks).
    if (peace) peace.onclick = () => this.screens.openPeaceTalks(Number(peace.dataset.peace));
    // Sağ tık masaüstünde kısayol; dokunmatikte panele buradan girilir.
    const dossier = this.el.sheetBody.querySelector('[data-dossier]');
    if (dossier) dossier.onclick = () => this.screens.openDossier(Number(dossier.dataset.dossier));
    for (const btn of this.el.sheetBody.querySelectorAll('[data-generals]')) {
      btn.onclick = () => {
        const army = game.world.units.find((u) => u.id === Number(btn.dataset.generals));
        if (army) this.openGeneralPicker([army]);
      };
    }
    const dismiss = this.el.sheetBody.querySelector('[data-unassign]');
    if (dismiss) {
      dismiss.onclick = () => {
        unassignGeneral(game.world, me, Number(dismiss.dataset.unassign));
        this.showTile(game.selected);
        this.showCommand();
      };
    }
    const stance = this.el.sheetBody.querySelector('[data-command-stance]');
    if (stance) stance.onclick = () => {
      const general = generalById(me, Number(stance.dataset.commandStance));
      if (!general) return;
      game.activeGeneral = general;
      game.toggleOffensive();
      this.showTile(game.selected);
      this.showCommand();
    };
    const rally = this.el.sheetBody.querySelector('[data-rally]');
    if (rally) {
      rally.onclick = () => {
        setRallyPoint(me, rally.dataset.rally === 'set' ? game.selected : null);
        this.showTile(game.selected);
        game.requestRender();
      };
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-order]')) {
      btn.onclick = () => {
        // Emir SECIME uygulanir, tek kareye degil: bes tumen sectiysen bes
        // tumen devredilir. Secim bossa karedeki birim esas alinir.
        const units = game.selection.length ? game.selection
          : (game.selected?.unit ? [game.selected.unit] : []);
        for (const unit of units) {
          if (btn.dataset.order === 'clear') game.clearUnitOrder(unit);
          else game.setUnitOrder(unit, btn.dataset.order);
        }
        this.showTile(game.selected);
      };
    }
  }
}

/** Üst çubuk yalnız yeni makro ekonomiyi gösterir; eski ham stoklar kaldırıldı. */
function resourcesHtml(nation) {
  // TEK BAKIYE: kapanmis defterin net'i. Eskiden bu satir ile karar
  // kartindaki "weekly gold" ve butce ekranindaki iki sayi birbirini
  // tutmuyordu — dort farkli tanim vardi.
  const weekly = weeklyBalanceOf(nation);
  // Akış ayrı bir <em>: değerin içine ikinci bir <b> koymak geçersiz iç içe
  // yapıydı ve akışı ana rakamla aynı ağırlıkta gösteriyordu.
  const flowClass = weekly < 0 ? 'res-neg' : weekly > 0 ? 'res-pos' : '';
  const flow = `<em class="stat-flow ${flowClass}">${weekly >= 0 ? '+' : ''}${Math.round(weekly)}</em>`;
  // Şöhret eşiğe yaklaşırsa kırmızıya döner: koalisyon habersiz gelmesin.
  const infamy = nation.infamy ?? 0;
  const infamyClass = infamy >= INFAMY_COALITION ? 'res-neg'
    : infamy >= INFAMY_COALITION * 0.6 ? 'res-warn' : '';
  const stability = Math.round((nation.economy?.stability ?? 0) * 100);
  // Etiketler Title Case: her şeyin versal olması üst barı bağırtıyordu.
  // Hazine binlik ayraçla okunur — dört haneden sonra ayraçsız sayı taranmıyor.
  return `
    <span title="treasury"><small>Treasury</small><b>¤${grouped(nation.gold)}${flow}</b></span>
    <span class="stat-why" role="button" tabindex="0" data-why="stability"
      title="${(nation.budget ? stabilityWhy(nation) : 'Measured after the first weekly tick; the opening value is a placeholder.')}"><small>Stability</small><b>${nation.budget ? `${stability}%` : '—'}</b></span>
    <span title="infamy — a coalition forms at ${INFAMY_COALITION}"><small>Infamy</small><b class="${infamyClass}">${infamy.toFixed(1)}</b></span>`;
}

/**
 * "WHY STABILITY IS WHAT IT IS" — ticaret ekranindaki "WHY THE PRICE MOVES"
 * kalibinin istikrara uygulanmis hali.
 *
 * Eski ipucu tam olarak sunu diyordu: "national stability". Yani etiketin
 * kendisini. Beta bunu en yuksek deger/saat oranli eksiklik olarak isaretledi:
 * oyuncu 60 yil boyunca istikrari neyin tuttugunu ogrenemedi.
 *
 * Sayilar UYDURULMAZ: hepsi `economy.stabilityBreakdown` icindeki gercek
 * simulasyon kalemleridir ve toplamlari istikrara esittir.
 */
function stabilityWhy(nation) {
  const bd = nation.economy?.stabilityBreakdown;
  if (!bd) return 'national stability';
  const pt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}`;
  const lines = [`Household satisfaction  ${pt(bd.base)}`];
  if (bd.occupation < -0.0005) {
    lines.push(`Occupied territory      ${pt(bd.occupation)}  (${Math.round(bd.occupiedShare * 100)}% of ${bd.occupiedTiles} hexes)`);
  }
  if (bd.war < -0.0005) {
    lines.push(`War exhaustion          ${pt(bd.war)}  (${bd.warFronts} front${bd.warFronts === 1 ? '' : 's'})`);
  }
  if (bd.unemployment < -0.0005) {
    lines.push(`Unemployment            ${pt(bd.unemployment)}  (${grouped(bd.unemployed)} without work)`);
  }
  lines.push(`= Stability             ${(bd.total * 100).toFixed(1)}%`);
  return lines.join('\n');
}

/** Binlik ayraçlı tam sayı: 3847 → 3,847. */
function grouped(value) {
  return Math.round(value ?? 0).toLocaleString('en-US');
}

export function gameDate(turn, day = 0) {
  const date = new Date(Date.UTC(1836, 0, 1));
  // Hafta sistemin adımı, gün ise saatin adımı: tarih gün gün ilerler.
  //
  // `day || (turn-1)*7` DEGIL, ikisinin BUYUGU. Eski hali `day` sifirdan
  // farkli olur olmaz tur sayacini tamamen devre disi birakiyordu ve
  // `game.clock` kayda girmedigi icin (save.js) yuklemeden sonra day 0'dan,
  // turn 305'ten basliyordu: oyuncu oynat'a bastigi ilk saniyede day 1 olunca
  // takvim 2 OCAK 1836'ya cokuyor ve oturumun sonuna kadar orada kaliyordu.
  // Tur her zaman bir TABAN verir; gun yalnizca hafta icini ilerletir.
  date.setUTCDate(date.getUTCDate() + Math.max(0, day, (turn - 1) * 7));
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).toUpperCase();
}

function formatNumber(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
