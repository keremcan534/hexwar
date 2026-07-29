// DOM arayüzü: ayarlar, katman anahtarları, seçili hex paneli.
// Oyun mantığı burada yok; sadece Game'i sürer ve olaylarını dinler.

import {
  CITY_COST, UNIT_COSTS, canAfford, canFoundCity, cityProduction, formatCost, growthCost,
} from '../game/cities.js';
import { UNIT_TYPES, movesFor } from '../game/units.js';
import { MIN_WAR_TURNS, atWar, relation } from '../game/diplomacy.js';
import { ORDER } from '../game/orders.js';
import { flagDataUrl } from '../render/flagPainter.js';

const ORDER_LABELS = {
  [ORDER.AUTO]: 'otomatik (YZ sürüyor)',
  [ORDER.GOTO]: 'hedefe yürüyor',
  [ORDER.HOLD]: 'bekliyor',
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
      turnNation: $('turn-nation'),
      resources: $('resources'),
    };
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

    $('opt-owners').onchange = (e) => this.setLayer('showOwners', e.target.checked);
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

    $('btn-end-turn').onclick = () => game.endTurn();
    $('btn-next-unit').onclick = () => game.selectNextIdle();

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
    el.lblNations.textContent = n > 0 ? String(n) : 'otomatik';
  }

  onWorld(world) {
    this.el.seedValue.textContent = world.seed;
    this.el.inSeed.value = world.seed;
    const landPct = Math.round((world.landCount / world.tiles.length) * 100);
    this.el.genStats.textContent =
      `${world.tiles.length} hex · %${landPct} kara · ${world.nations.length} ülke · ${world.genTime.toFixed(0)} ms`;
    this.el.sheetBody.innerHTML = '<p class="placeholder">Birimini seç, sonra gideceği hex\'e dokun.</p>';
    this.onTurn();
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
    btn.textContent = idle ? `Sıradaki (${idle})` : 'Sıradaki';
    btn.disabled = idle === 0;

    const wars = world.nations.filter(
      (n) => n.alive && atWar(world, n.id, turns.playerNation),
    ).length;
    this.el.turnNation.innerHTML = me
      ? `<img class="flag flag-sm" src="${flagDataUrl(me)}" alt="">${escapeHtml(me.name)} · ${me.tiles} hex · ${cities} şehir · ${wars ? `${wars} savaş` : 'barış'} · ${alive} ülke`
      : '—';
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
      body.innerHTML = '<p class="placeholder">Birimini seç, sonra gideceği hex\'e dokun.</p>';
      return;
    }
    const world = this.game.world;
    const nation = tile.owner >= 0 ? world.nations[tile.owner] : null;
    const color = nation ? nation.color : tile.terrain.color;
    const title = nation ? nation.fullName : 'Sahipsiz Bölge';
    const sub = `${tile.terrain.name} · ${tile.q}, ${tile.r}${tile.coastal ? ' · kıyı' : ''}`;

    // Karenin ne ürettiği artık en önemli bilgi: başa alındı.
    const yields = tile.terrain.yields;
    const stats = [
      ['Erzak', String(yields.food)],
      ['Kereste', String(yields.timber)],
      ['Demir', String(yields.iron)],
      ['Altın', String(yields.gold)],
      ['Savunma', `%${Math.round(tile.terrain.defense * 100)}`],
      ['Geçiş', tile.terrain.passable ? `${tile.terrain.moveCost}` : 'yok'],
    ];
    if (tile.workedBy) stats.push(['İşleyen', tile.workedBy.name]);
    if (nation) stats.push(['Ülke Alanı', `${nation.tiles} hex`]);

    const unit = tile.unit;
    const unitBlock = unit ? `
      <div class="unit-row">
        <span class="unit-badge" style="background:${world.nations[unit.nationId].color}">${unit.type.glyph}</span>
        <div style="flex:1;min-width:0">
          <div class="tile-title">${escapeHtml(unit.type.name)}${unit.nationId === this.game.turns.playerNation ? '' : ' (düşman)'}</div>
          <div class="tile-sub">can ${unit.hp}/${unit.type.hp} · hareket ${unit.movesLeft}/${movesFor(unit)} · saldırı ${unit.type.attack}${unit.embarked ? ' · denizde (saldıramaz)' : ''}</div>
          <div class="hp-bar"><i style="width:${Math.max(0, (unit.hp / unit.type.hp) * 100)}%"></i></div>
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
      const out = cityProduction(city);
      const buttons = Object.entries(UNIT_COSTS).filter(
        // Gemi ancak kıyı şehrinde üretilebilir.
        ([id]) => UNIT_TYPES[id].domain !== 'sea' || tile.coastal,
      ).map(([id, cost]) => {
        const disabled = canAfford(me, cost) ? '' : 'disabled';
        return `<button class="action" data-buy="${id}" ${disabled}>${UNIT_TYPES[id].name} · ${formatCost(cost)}</button>`;
      }).join('');
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(city.name)} — ${city.pop} işçi · üretim
          ${out.food}🌾 ${out.timber}🪵 ${out.iron}⛏ ${out.gold}⬤
          · büyüme ${Math.floor(city.foodStore)}/${growthCost(city)}</div>
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
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(other.name)} — ${war ? 'savaştayız' : 'barış içindeyiz'}</div>
        ${war
    ? `<button class="action wide" data-peace="${foreign}" ${locked ? 'disabled' : ''}>Barış Teklif Et${locked ? ` (${MIN_WAR_TURNS - (game.turns.turn - rec.since)} tur)` : ''}</button>`
    : `<button class="action wide" data-war="${foreign}">Savaş İlan Et</button>`}
      </div>`);
    }

    // Birim emirleri: mikro yönetimden kaçış.
    const own = tile.unit && tile.unit.nationId === game.turns.playerNation ? tile.unit : null;
    if (own) {
      const label = ORDER_LABELS[own.order?.type];
      rows.push(`<div class="action-row">
        <div class="k">emir — ${label ?? 'yok'}</div>
        ${own.order
    ? '<button class="action" data-order="clear">Emri İptal Et</button>'
    : `<button class="action" data-order="${ORDER.AUTO}">Otomatik</button>
           <button class="action" data-order="${ORDER.HOLD}">Bekle</button>`}
      </div>`);
    }

    const unit = game.selectedUnit;
    if (unit && unit.tile === tile && unit.movesLeft > 0 && canFoundCity(game.world, tile, unit.nationId)) {
      const disabled = canAfford(me, CITY_COST) ? '' : 'disabled';
      rows.push(`<div class="action-row"><button class="action wide" data-found="1" ${disabled}>Şehir Kur · ${formatCost(CITY_COST)}</button></div>`);
    }
    return rows.join('');
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
  return `
    <span>⬤ <b>${Math.round(nation.gold)}</b> ${flow(net.gold)}</span>
    <span>🌾 ${flow(net.food)}</span>
    <span>🪵 <b>${Math.round(nation.timber)}</b> ${flow(net.timber)}</span>
    <span>⛏ <b>${Math.round(nation.iron)}</b> ${flow(net.iron)}</span>`;
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
