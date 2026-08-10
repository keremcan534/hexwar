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
import { ORDER } from '../game/orders.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { Screens } from './screens.js';
import { formatPopulation } from '../game/economy.js';
import {
  canRecruit, equipmentCostLabel, nationManpower, rallyTile, setRallyPoint,
} from '../game/recruitment.js';
import {
  MAX_SKILL, TRAITS, assignDivisions, commandSize, createGeneral, generalById,
  aggressionInfo, borderNationIds, frontTilesOf, generalCost, generalOfArmy, generalsOf,
  refreshFront, setAggression, unassignGeneral,
} from '../game/command.js';
import {
  RGO_TYPES, provinceOutput, provinceRgoStatus,
} from '../game/provinces.js';
import { controllerOf, isOccupied } from '../game/control.js';

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

    el.seedChip.onclick = () => this.copySeed();

    const sync = () => this.syncLabels();
    el.inSize.oninput = sync;
    el.inCont.oninput = sync;
    el.inLand.oninput = sync;
    el.inNations.oninput = sync;
    sync();

    $('btn-generate').onclick = () => {
      const cols = Number(el.inSize.value);
      const rows = Math.round(cols * 0.8);
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
    game.on('turn', () => { this.onTurn(); this.showWars(); });
    game.on('peace', () => this.showWars());
    game.on('clock', () => this.onTurn());
    game.on('economy', () => this.onTurn());
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
  bindKeys() {
    window.addEventListener('keydown', (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

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
      if (event.code === 'Escape') {
        this.game.selectGeneral(null);
        this.game.selectUnits([]);
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
        const state = unit.battleId ? 'in battle'
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
    const generals = generalsOf(me);
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
    el.lblSize.textContent = `${cols} × ${Math.round(cols * 0.8)}`;
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
        <span><small>Hegemony</small><b>${me.total}<em>/${leader.total}</em></b></span>
        <span><small>Rank</small><b>${rank}<em>/${board.length}</em></b></span>
        <span><small>Economy</small><b>${me.economy}</b></span>
        <span><small>Prestige</small><b>${me.prestige}</b></span>
      </div>
      <span class="bar"><i style="width:${Math.min(100, (me.total / Math.max(1, leader.total)) * 100)}%"></i></span>
      ${leader.nation.id === me.nation.id
        ? '<p class="hegemony-leader">You lead the world.</p>'
        : `<p class="hegemony-leader">Leader: <b>${escapeHtml(leader.nation.name)}</b> ${leader.total}</p>`}`;
  }

  refreshSaveInfo() {
    const info = savedInfo();
    this.el.saveInfo.textContent = info
      ? `Save: ${info.seed} · week ${info.turn}`
      : 'No save found. The game autosaves every ten weeks.';
  }

  onTurn() {
    const { turns, world } = this.game;
    if (!world) return;
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
        <span title="Population"><small>Population</small><b>${formatPopulation(me.economy?.population ?? 0)}</b></span>
        <span title="Standing army"><small>Army</small><b>${formatNumber(army)}</b></span>
        <span title="Recruitable population left in your provinces"><small>Manpower</small><b>${formatPopulation(nationManpower(world, me.id))}</b></span>
        <span title="Gross domestic product"><small>GDP</small><b>¤${formatNumber(Math.round(me.economy?.gdp ?? 0))}</b></span>`;
      this.el.topFlag.src = flagDataUrl(me);
      this.el.topNation.textContent = me.name;
      // Savaş durumu künyedeki tek renkli öğe; gerisi soluk kalır. Ayraç
      // elmas: orta nokta tarihî künyede fazla "web" duruyordu.
      const state = wars
        ? `<span class="at-war">At war</span>`
        : 'At peace';
      const sep = '<i class="sep">◆</i>';
      this.el.topSub.innerHTML =
        `${me.tiles} ${me.tiles === 1 ? 'province' : 'provinces'} ${sep} `
        + `${cities} ${cities === 1 ? 'city' : 'cities'} ${sep} ${state}`;
    } else {
      this.el.macroStats.textContent = '—';
      this.el.topNation.textContent = '—';
      this.el.topSub.textContent = 'eliminated';
    }
    if (!this.game.selected) this.showGuidance();
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
    const net = me.budget?.net ?? {};
    let next = 'Review Production, Logistics or Construction before unpausing.';
    if (battles.length) next = 'A battle is active: select its army to inspect strength and organization.';
    else if (wars.length) next = 'Move an army onto an enemy army or province; defeated armies retreat.';
    this.el.sheetBody.innerHTML = `
      <div class="decision-card">
        <small>NEXT MEANINGFUL DECISION</small>
        <h3>${escapeHtml(next)}</h3>
        <p>Province → population and raw goods → factories and taxes → army and world prices.</p>
        <div class="decision-kpis">
          <span><b>${net.gold >= 0 ? '+' : ''}${Math.round(net.gold ?? 0)}</b><small>weekly gold</small></span>
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
    if (tile.culture >= 0) stats.push(['Culture', world.cultures[tile.culture].name]);
    // Fethin bedeli karede görünsün: işgal süresi ve verim kaybı.
    if (nation && tile.culture >= 0) {
      const held = (world.turn ?? 0) - (tile.heldSince ?? 0);
      const eff = tileEfficiency(tile, nation.culture, world.turn ?? 0);
      if (isOccupied(tile)) stats.push(['Status', `occupied by ${controller?.name ?? '?'}`]);
      else if (eff === 0) stats.push(['Status', `postwar integration (${OCCUPATION_TURNS - held} weeks)`]);
      else if (eff < 1) stats.push(['Status', `foreign culture −${Math.round((1 - eff) * 100)}%`]);
      else if (tile.culture !== nation.culture) stats.push(['Status', 'foreign culture']);
    }
    if (tile.workedBy) stats.push(['Worked By', tile.workedBy.name]);
    if (nation) stats.push(['Nation Size', `${nation.tiles} provinces`]);
    if (tile.province) {
      const rgo = provinceRgoStatus(tile);
      const rgoOutput = rgo.type ? (provinceOutput(tile)[rgo.type.goodId] ?? 0) : 0;
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

    const unit = tile.unit;
    const unitBlock = unit ? `
      <div class="unit-row">
        <span class="unit-badge" style="background:${world.nations[unit.nationId].color}">${unit.type.glyph}</span>
        <div style="flex:1;min-width:0">
          <div class="tile-title">${regimentCount(unit)}-regiment Army${unit.nationId === this.game.turns.playerNation ? '' : ' (enemy)'}</div>
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

    body.innerHTML = unitBlock + this.actionsHtml(tile) + `
      <div class="tile-head">
        ${emblem}
        <div>
          <div class="tile-title">${escapeHtml(title)}</div>
          <div class="tile-sub">${escapeHtml(sub)}</div>
        </div>
      </div>
      <div class="stats">
        ${stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
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
        return `<button class="action" data-buy="${id}" ${disabled}>${UNIT_TYPES[id].name} · ${formatCost(cost)} · ${equipmentCostLabel(id)}</button>`;
      }).join('');
      // Nüfusun etnik bileşimi: yabancı halk payı ileride hoşnutsuzluğun ölçütü.
      const composition = Object.entries(city.pops)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${n} ${escapeHtml(game.world.cultures[id]?.name ?? '?')}`)
        .join(' · ');

      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(city.name)} — population: ${composition}</div>
      </div>
      <div class="action-row">
        <div class="k">Recruitment · ${escapeHtml(city.name)}</div>
        ${buttons}
      </div>`);
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
    const own = tile.unit && tile.unit.nationId === game.turns.playerNation ? tile.unit : null;
    if (own) {
      const label = ORDER_LABELS[own.order?.type];
      rows.push(`<div class="action-row">
        <div class="k">army orders — ${own.battleId ? 'fighting'
    : (own.retreatUntil ?? 0) > game.turns.turn ? 'retreating'
      : (own.attackReadyAt ?? 0) > game.turns.turn ? 'reorganizing'
        : label ?? 'awaiting destination'}</div>
        ${own.order
    ? '<button class="action" data-order="clear">Cancel Orders</button>'
    : '<span class="order-help">Select the division, then tap a province. Friendly divisions share the province; enemy divisions start a battle.</span>'}
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
    return `<div class="action-row">
      <div class="k">front — ${attack ? 'advancing' : 'holding'} against ${escapeHtml(target)} ·
        ${front.length} provinces · ${commandSize(general)} divisions · planning ${ready}%</div>
      <div class="meter"><i style="width:${ready}%"></i></div>
      <button class="action" data-command-stance="${general.id}">
        ${attack ? 'Halt Offensive' : 'Start Offensive'}</button>
    </div>`;
  }

  /** HOI4 tarzi komutan secme listesi. `armies` tek tumen ya da dizi olabilir. */
  openGeneralPicker(armies) {
    const game = this.game;
    const me = game.world.nations[game.turns.playerNation];
    const list = (Array.isArray(armies) ? armies : [armies]).filter(Boolean);
    const cost = generalCost(me);
    const cards = generalsOf(me).map((general) => {
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
        const general = createGeneral(game.world, me, game.turns.rng);
        game.turns.addLog(`${general.name} joined the officer staff.`);
        this.openGeneralPicker(list);
        this.showCommand();
      };
    }
  }

  bindActions() {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    for (const btn of this.el.sheetBody.querySelectorAll('[data-buy]')) {
      btn.onclick = () => game.turns.buyUnit(me, btn.dataset.buy);
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
      const unit = game.selected?.unit;
      btn.onclick = () => (btn.dataset.order === 'clear'
        ? game.clearUnitOrder(unit)
        : game.setUnitOrder(unit, btn.dataset.order));
    }
  }
}

/** Üst çubuk yalnız yeni makro ekonomiyi gösterir; eski ham stoklar kaldırıldı. */
function resourcesHtml(nation) {
  const weekly = (nation.budget?.net?.gold ?? 0) + (nation.economy?.fiscalNet ?? 0);
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
    <span title="national stability"><small>Stability</small><b>${stability}%</b></span>
    <span title="infamy — a coalition forms at ${INFAMY_COALITION}"><small>Infamy</small><b class="${infamyClass}">${infamy.toFixed(1)}</b></span>`;
}

/** Binlik ayraçlı tam sayı: 3847 → 3,847. */
function grouped(value) {
  return Math.round(value ?? 0).toLocaleString('en-US');
}

function gameDate(turn, day = 0) {
  const date = new Date(Date.UTC(1836, 0, 1));
  // Hafta sistemin adımı, gün ise saatin adımı: tarih gün gün ilerler.
  date.setUTCDate(date.getUTCDate() + Math.max(0, day || (turn - 1) * 7));
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
