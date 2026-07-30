// DOM arayüzü: ayarlar, katman anahtarları, seçili hex paneli.
// Oyun mantığı burada yok; sadece Game'i sürer ve olaylarını dinler.

import {
  CITY_COST, UNIT_COSTS, WORK_RADIUS, canAfford, canFoundCity, cityProduction,
  formatCost, growthCost,
} from '../game/cities.js';
import { BUILDINGS, buildingSlots, canBuild } from '../game/buildings.js';
import { UNIT_TYPES, maxHpOf, movesFor } from '../game/units.js';
import { MIN_WAR_TURNS, atWar, relation, truceLeft } from '../game/diplomacy.js';
import { INFAMY_COALITION, OCCUPATION_TURNS, tileEfficiency } from '../game/infamy.js';
import { canTrade } from '../game/trade.js';
import { savedInfo } from '../game/save.js';
import { HEGEMONY_TARGET, scoreboard } from '../game/hegemony.js';
import {
  TECHS, availableTechs, research, researchCost,
} from '../game/tech.js';
import { ORDER } from '../game/orders.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { Screens } from './screens.js';
import {
  ROAD_MAX_LEVEL, canBuildRoad, roadCost, roadLabel, roadMoveCost,
} from '../game/infrastructure.js';

const ORDER_LABELS = {
  [ORDER.AUTO]: 'automatic (AI controlled)',
  [ORDER.GOTO]: 'moving to target',
  [ORDER.HOLD]: 'holding position',
};

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      seedChip: $('seed-chip'),
      seedValue: $('seed-value'),
      layers: $('layer-menu'),
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
      saveInfo: $('save-info'),
      hegemony: $('hegemony'),
    };
    this.screens = new Screens(game);
    this.bind();
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
        game.renderer.setMapMode(btn.dataset.mode);
        for (const other of document.querySelectorAll('.mode-btn[data-mode]')) {
          other.classList.toggle('active', other === btn);
        }
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

    $('btn-end-turn').onclick = () => game.endTurn();
    $('btn-next-unit').onclick = () => game.selectNextIdle();
    // HOI4'teki ülke bayrağı gibi ulusal durum panelini açar.
    $('nation-badge').onclick = () => this.screens.toggle('nation');

    game.on('world', (world) => this.onWorld(world));
    game.on('select', (tile) => this.showTile(tile));
    game.on('turn', () => this.onTurn());
    game.on('units', () => {
      this.showTile(this.game.selected);
      this.onTurn();
    });
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
    this.el.sheetBody.innerHTML = '<p class="placeholder">Select a unit, then choose its destination.</p>';
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
    el.innerHTML = `hegemony <b>${me.total}</b>/${HEGEMONY_TARGET}
      · rank ${rank} · economy ${me.economy} technology ${me.technology} prestige ${me.prestige}
      ${leader.nation.id === me.nation.id ? '' : `· leader ${escapeHtml(leader.nation.name)} ${leader.total}`}
      <span class="bar"><i style="width:${Math.min(100, (me.total / HEGEMONY_TARGET) * 100)}%"></i></span>`;
  }

  refreshSaveInfo() {
    const info = savedInfo();
    this.el.saveInfo.textContent = info
      ? `Save: ${info.seed} · turn ${info.turn}`
      : 'No save found. The game autosaves after every turn.';
  }

  onTurn() {
    const { turns, world } = this.game;
    if (!world) return;
    this.el.turnValue.textContent = String(turns.turn);
    const me = world.nations[turns.playerNation];
    const alive = world.nations.filter((n) => n.alive).length;
    const cities = world.cities.filter((c) => c.nationId === turns.playerNation).length;
    this.el.resources.innerHTML = me ? resourcesHtml(me) : '—';
    // Bekleyen birim sayısı düğmede: turu bitirmeden önce ne kaldığı görünsün.
    const idle = this.game.idleUnits().length;
    const btn = $('btn-next-unit');
    btn.textContent = idle ? `Next Unit (${idle})` : 'Next Unit';
    btn.disabled = idle === 0;

    const wars = world.nations.filter(
      (n) => n.alive && atWar(world, n.id, turns.playerNation),
    ).length;
    this.refreshHegemony();

    // Sol üst künye: bayrak + ülke adı + tek satır özet (HOI4'ün ülke kutusu).
    if (me) {
      this.el.topFlag.src = flagDataUrl(me);
      this.el.topNation.textContent = me.name;
      this.el.topSub.textContent =
        `${me.tiles} ${me.tiles === 1 ? 'hex' : 'hexes'} · `
        + `${cities} ${cities === 1 ? 'city' : 'cities'} · `
        + `${wars ? `${wars} ${wars === 1 ? 'war' : 'wars'}` : 'at peace'} · `
        + `${alive} ${alive === 1 ? 'nation' : 'nations'}`;
    } else {
      this.el.topNation.textContent = '—';
      this.el.topSub.textContent = 'eliminated';
    }
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
      body.innerHTML = '<p class="placeholder">Select a unit, then choose its destination.</p>';
      return;
    }
    const world = this.game.world;
    const nation = tile.owner >= 0 ? world.nations[tile.owner] : null;
    const color = nation ? nation.color : tile.terrain.color;
    const title = nation ? nation.fullName : 'Unclaimed Territory';
    const sub = `${tile.terrain.name} · ${tile.q}, ${tile.r}${tile.coastal ? ' · coast' : ''}`;

    // Karenin ne ürettiği artık en önemli bilgi: başa alındı.
    const yields = tile.terrain.yields;
    const stats = [
      ['Food', String(yields.food)],
      ['Timber', String(yields.timber)],
      ['Iron', String(yields.iron)],
      ['Gold', String(yields.gold)],
      ['Defense', `${Math.round(tile.terrain.defense * 100)}%`],
      ['Move Cost', tile.terrain.passable ? `${Number(roadMoveCost(tile).toFixed(2))}` : 'impassable'],
    ];
    if (tile.culture >= 0) stats.push(['Culture', world.cultures[tile.culture].name]);
    if (!tile.terrain.water) {
      stats.push(['Infrastructure', `${roadLabel(tile)} · ${tile.roadLevel ?? 0}/${ROAD_MAX_LEVEL}`]);
    }
    // Fethin bedeli karede görünsün: işgal süresi ve verim kaybı.
    if (nation && tile.culture >= 0) {
      const held = (world.turn ?? 0) - (tile.heldSince ?? 0);
      const eff = tileEfficiency(tile, nation.culture, world.turn ?? 0);
      if (eff === 0) stats.push(['Status', `occupied (${OCCUPATION_TURNS - held} turns)`]);
      else if (eff < 1) stats.push(['Status', `foreign culture −${Math.round((1 - eff) * 100)}%`]);
      else if (tile.culture !== nation.culture) stats.push(['Status', 'foreign culture']);
    }
    if (tile.workedBy) stats.push(['Worked By', tile.workedBy.name]);
    if (nation) stats.push(['Nation Size', `${nation.tiles} hexes`]);

    const unit = tile.unit;
    const unitBlock = unit ? `
      <div class="unit-row">
        <span class="unit-badge" style="background:${world.nations[unit.nationId].color}">${unit.type.glyph}</span>
        <div style="flex:1;min-width:0">
          <div class="tile-title">${escapeHtml(unit.type.name)}${unit.nationId === this.game.turns.playerNation ? '' : ' (enemy)'}</div>
          <div class="tile-sub">strength ${unit.hp}/${maxHpOf(unit)} · movement ${unit.movesLeft}/${movesFor(unit)} · attack ${unit.type.attack}${unit.embarked ? ' · embarked (cannot attack)' : ''}</div>
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
      const out = cityProduction(city, game.world);
      const buttons = Object.entries(UNIT_COSTS).filter(
        // Gemi ancak kıyı şehrinde üretilebilir.
        ([id]) => UNIT_TYPES[id].domain !== 'sea' || tile.coastal,
      ).map(([id, cost]) => {
        const disabled = canAfford(me, cost) ? '' : 'disabled';
        return `<button class="action" data-buy="${id}" ${disabled}>${UNIT_TYPES[id].name} · ${formatCost(cost)}</button>`;
      }).join('');
      const built = city.buildings.map((id) => BUILDINGS[id].name).join(', ') || 'none';
      const buildButtons = Object.values(BUILDINGS)
        .filter((b) => canBuild(game.world, city, b.id, WORK_RADIUS))
        .map((b) => {
          const off = canAfford(me, b.cost) ? '' : 'disabled';
          return `<button class="action" data-build="${b.id}" title="${b.desc}" ${off}>${b.name} · ${formatCost(b.cost)}</button>`;
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
        <div class="k">${escapeHtml(city.name)} — ${city.pop} workers · output
          ${Math.round(out.food)}🌾 ${Math.round(out.timber)}🪵 ${Math.round(out.iron)}⛏ ${Math.round(out.gold)}⬤
          · growth ${Math.floor(city.foodStore)}/${growthCost(city)}</div>
        ${buttons}
      </div>
      <div class="action-row">
        <div class="k">buildings (${city.buildings.length}/${buildingSlots(me, city)}) — ${escapeHtml(built)}</div>
        ${buildButtons}
      </div>
      <div class="action-row">
        <div class="k">technology — ${escapeHtml((me.techs ?? []).map((id) => TECHS[id].name).join(', ') || 'none')}</div>
        ${availableTechs(me).slice(0, 4).map((t) => {
    const cost = researchCost(me, t);
    const off = canAfford(me, cost) ? '' : 'disabled';
    return `<button class="action" data-tech="${t.id}" title="${t.desc}" ${off}>${t.name} · ${formatCost(cost)}</button>`;
  }).join('')}
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
      const trade = !war && canTrade(other) && canTrade(me) ? 'trade available' : 'no trade';
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(other.name)} — ${war ? 'at war' : truce ? `truce (${truce} turns)` : 'at peace'} · ${trade}</div>
        ${war
    ? `<button class="action wide" data-peace="${foreign}" ${locked ? 'disabled' : ''}>Offer Peace${locked ? ` (${MIN_WAR_TURNS - (game.turns.turn - rec.since)} turns)` : ''}</button>`
    : `<button class="action wide" data-war="${foreign}" ${truce ? 'disabled' : ''}>Declare War${truce ? ` (${truce} turns)` : ''}</button>`}
      </div>`);
    }

    if (canBuildRoad(tile, game.turns.playerNation)) {
      const cost = roadCost(tile);
      rows.push(`<div class="action-row">
        <div class="k">infrastructure — ${roadLabel(tile)} (${tile.roadLevel ?? 0}/${ROAD_MAX_LEVEL})</div>
        <button class="action wide" data-road="1" ${canAfford(me, cost) ? '' : 'disabled'}>
          Upgrade to ${roadLabel({ roadLevel: (tile.roadLevel ?? 0) + 1 })} · ${formatCost(cost)}
        </button>
      </div>`);
    }

    // Birim emirleri: mikro yönetimden kaçış.
    const own = tile.unit && tile.unit.nationId === game.turns.playerNation ? tile.unit : null;
    if (own) {
      const label = ORDER_LABELS[own.order?.type];
      rows.push(`<div class="action-row">
        <div class="k">orders — ${label ?? 'none'}</div>
        ${own.order
    ? '<button class="action" data-order="clear">Cancel Orders</button>'
    : `<button class="action" data-order="${ORDER.AUTO}">Automate</button>
           <button class="action" data-order="${ORDER.HOLD}">Hold</button>`}
      </div>`);
    }

    const unit = game.selectedUnit;
    if (unit && unit.tile === tile && unit.movesLeft > 0 && canFoundCity(game.world, tile, unit.nationId)) {
      const disabled = canAfford(me, CITY_COST) ? '' : 'disabled';
      rows.push(`<div class="action-row"><button class="action wide" data-found="1" ${disabled}>Found City · ${formatCost(CITY_COST)}</button></div>`);
    }
    return rows.join('');
  }

  bindActions() {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    for (const btn of this.el.sheetBody.querySelectorAll('[data-buy]')) {
      btn.onclick = () => game.turns.buyUnit(me, btn.dataset.buy);
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-build]')) {
      btn.onclick = () => game.turns.build(game.selected.city, btn.dataset.build);
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-tech]')) {
      btn.onclick = () => {
        if (research(me, btn.dataset.tech)) {
          game.turns.addLog(`${TECHS[btn.dataset.tech].name} researched.`);
          game.recomputeEconomy();
          game.emit('units', game.selectedUnit);
        }
      };
    }
    const found = this.el.sheetBody.querySelector('[data-found]');
    if (found) found.onclick = () => game.turns.foundCity(game.selectedUnit);
    const road = this.el.sheetBody.querySelector('[data-road]');
    if (road) road.onclick = () => game.turns.buildRoad(game.selected, me.id);
    const war = this.el.sheetBody.querySelector('[data-war]');
    if (war) war.onclick = () => game.declareWarOn(Number(war.dataset.war));
    const peace = this.el.sheetBody.querySelector('[data-peace]');
    if (peace) peace.onclick = () => game.proposePeaceTo(Number(peace.dataset.peace));
    for (const btn of this.el.sheetBody.querySelectorAll('[data-order]')) {
      const unit = game.selected?.unit;
      btn.onclick = () => (btn.dataset.order === 'clear'
        ? game.clearUnitOrder(unit)
        : game.setUnitOrder(unit, btn.dataset.order));
    }
  }
}

/** Dört kaynağın stok ve net akışı; erzak akışı stoktan önemli olduğu için öne alındı. */
function resourcesHtml(nation) {
  const net = nation.budget?.net ?? { gold: 0, food: 0, timber: 0, iron: 0 };
  const flow = (v) => `<b class="${v < 0 ? 'res-neg' : v > 0 ? 'res-pos' : ''}">${v >= 0 ? '+' : ''}${Math.round(v)}</b>`;
  // Şöhret eşiğe yaklaşırsa kırmızıya döner: koalisyon habersiz gelmesin.
  const infamy = Math.round(nation.infamy ?? 0);
  const infamyClass = infamy >= INFAMY_COALITION ? 'res-neg'
    : infamy >= INFAMY_COALITION * 0.6 ? 'res-warn' : '';
  // Akış göstergesi yalnız altın ve erzakta: 375 pikselde beşinin de akışı
  // sığmıyor, kereste/demir için stok yeterli bilgi.
  return `
    <span title="gold">⬤<b>${Math.round(nation.gold)}</b>${flow(net.gold)}</span>
    <span title="food balance">🌾${flow(net.food)}</span>
    <span title="timber">🪵<b>${Math.round(nation.timber)}</b></span>
    <span title="iron">⛏<b>${Math.round(nation.iron)}</b></span>
    <span title="infamy — a coalition forms at ${INFAMY_COALITION}">☠<b class="${infamyClass}">${infamy}</b></span>`;
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
