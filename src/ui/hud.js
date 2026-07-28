// DOM arayüzü: ayarlar, katman anahtarları, seçili hex paneli.
// Oyun mantığı burada yok; sadece Game'i sürer ve olaylarını dinler.

import { CITY_COST, UNIT_PRICES, canFoundCity } from '../game/cities.js';
import { UNIT_TYPES } from '../game/units.js';

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
      goldValue: $('gold-value'),
      incomeValue: $('income-value'),
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
    this.el.goldValue.textContent = String(me?.gold ?? 0);
    this.el.incomeValue.textContent = me
      ? `(${me.income >= 0 ? '+' : ''}${me.income} · bakım ${me.upkeep ?? 0})`
      : '';
    this.el.turnNation.textContent = me
      ? `${me.name} · ${me.tiles} hex · ${cities} şehir · ${alive} ülke ayakta`
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

    const stats = [
      ['Yükseklik', tile.elevation.toFixed(2)],
      ['Nem', tile.moisture.toFixed(2)],
      ['Sıcaklık', tile.temperature.toFixed(2)],
      ['Verim', String(tile.terrain.fertility)],
      ['Savunma', `%${Math.round(tile.terrain.defense * 100)}`],
      ['Geçiş', tile.terrain.passable ? `${tile.terrain.moveCost}` : 'yok'],
    ];
    if (nation) {
      stats.push(['Ülke Alanı', `${nation.tiles} hex`]);
      stats.push(['Nüfus', formatNumber(nation.population)]);
    }

    const unit = tile.unit;
    const unitBlock = unit ? `
      <div class="unit-row">
        <span class="unit-badge" style="background:${world.nations[unit.nationId].color}">${unit.type.glyph}</span>
        <div style="flex:1;min-width:0">
          <div class="tile-title">${escapeHtml(unit.type.name)}${unit.nationId === this.game.turns.playerNation ? '' : ' (düşman)'}</div>
          <div class="tile-sub">can ${unit.hp}/${unit.type.hp} · hareket ${unit.movesLeft}/${unit.type.moves} · saldırı ${unit.type.attack}</div>
          <div class="hp-bar"><i style="width:${Math.max(0, (unit.hp / unit.type.hp) * 100)}%"></i></div>
        </div>
      </div>` : '';

    body.innerHTML = unitBlock + this.actionsHtml(tile) + `
      <div class="tile-head">
        <span class="swatch" style="background:${color}"></span>
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
      const buttons = Object.entries(UNIT_PRICES).map(([id, price]) => {
        const disabled = me.gold < price ? 'disabled' : '';
        return `<button class="action" data-buy="${id}" ${disabled}>${UNIT_TYPES[id].name} · ${price}</button>`;
      }).join('');
      rows.push(`<div class="action-row"><div class="k">${escapeHtml(tile.city.name)} — birim al</div>${buttons}</div>`);
    }

    const unit = game.selectedUnit;
    if (unit && unit.tile === tile && unit.movesLeft > 0 && canFoundCity(game.world, tile, unit.nationId)) {
      const disabled = me.gold < CITY_COST ? 'disabled' : '';
      rows.push(`<div class="action-row"><button class="action wide" data-found="1" ${disabled}>Şehir Kur · ${CITY_COST} altın</button></div>`);
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
  }
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
