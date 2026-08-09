// HOI4 tarzı tam ekran yönetim ekranları: İnşaat, Üretim, Araştırma,
// Lojistik, Diplomasi, Ticaret.
//
// Amaç her şeyi tek alt panele tıkıştırmaktan kurtulmak. Veri zaten oyunda
// mevcut olduğu için ekranlar gerçek sayılarla dolduruldu; etkileşimler de
// var olan fonksiyonlara bağlandı (yeni oyun mantığı yazılmadı).

import {
  UNIT_COSTS, canAfford, formatCost,
} from '../game/cities.js';
import { MIN_WAR_TURNS, atWar, nationStrength, relation, truceLeft } from '../game/diplomacy.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import {
  UNIT_TYPES, maxHpOf, organizationOf, soldiersOf,
} from '../game/units.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { HEGEMONY_TARGET, scoreboard } from '../game/hegemony.js';
import {
  CLASS_INFO, CLASS_PROFESSIONS, FACTORIES, GOODS, GOOD_IDS, MAX_FACTORY_LEVEL,
  MILITARY_EQUIPMENT, POPULATION_COHORT, PROFESSION_INFO,
  SOCIAL_PROGRAMS, buildFactory,
  canBuildFactory, canExpandFactory, expandFactory, expansionCost, factoryCost,
  factoryMargin, formatPopulation, setFiscalPolicy,
  setMilitaryProductionLine, socialSpendingCost, ensureProductionLine,
} from '../game/economy.js';
import { MAX_ROUNDS, battleSides, battlesFor } from '../game/battles.js';
import { canRecruit, equipmentCostLabel } from '../game/recruitment.js';
import { equipmentLogistics, reinforcementNeed } from '../game/reinforcement.js';
import {
  IDEOLOGIES, POLITICAL_POLICIES, factoryInvestmentRules, fiscalPolicyLimits,
  policyLabel, rulingParty,
} from '../game/politics.js';
import {
  CONSTRUCTION_TYPES, cancelConstruction, canQueueConstruction, constructionAtlas,
  constructionPower, constructionUpkeep, ensureConstruction, prioritizeConstruction,
  queueConstruction,
} from '../game/construction.js';

const TITLES = {
  nation: 'Nation Overview',
  construction: 'Construction',
  industry: 'Industry & Factories',
  production: 'Production',
  budget: 'Budget',
  population: 'Population',
  politics: 'Politics',
  logistics: 'Logistics',
  diplomacy: 'Diplomacy',
  trade: 'Trade',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export class Screens {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.previousMapMode = null;
    this.constructionType = null;
    this.el = {
      root: document.getElementById('screen'),
      title: document.getElementById('screen-title'),
      res: document.getElementById('screen-res'),
      body: document.getElementById('screen-body'),
    };

    for (const btn of document.querySelectorAll('#tab-bar button')) {
      btn.onclick = () => this.toggle(btn.dataset.screen);
    }
    document.getElementById('screen-close').onclick = () => this.close();

    // Tur ilerlediğinde ya da bir şey satın alındığında açık ekran tazelenir.
    game.on('turn', () => this.refresh());
    game.on('units', () => this.refresh());
    game.on('economy', () => this.refresh());
    game.on('battles', () => this.refresh());
    game.on('provinces', () => this.refresh());
    game.on('politics', () => this.refresh());
    game.on('construction', () => this.refresh());
    game.on('select', (tile) => {
      if (this.active !== 'construction') return;
      const me = this.me;
      if (this.constructionType && tile?.owner === me?.id) {
        const region = constructionAtlas(game.world, me.id).tileRegions.get(tile);
        if (region && queueConstruction(game, me.id, region.id, this.constructionType)) {
          game.turns.addLog(`${CONSTRUCTION_TYPES[this.constructionType].name} queued in ${region.name}.`);
        }
      }
      this.refresh();
    });
    game.on('world', () => {
      this.constructionType = null;
      this.close();
    });
  }

  get me() {
    return this.game.world?.nations[this.game.turns.playerNation];
  }

  toggle(name) {
    if (this.active === name) this.close();
    else this.open(name);
  }

  open(name) {
    if (this.active === 'construction' && name !== 'construction') {
      this.restoreMapMode();
    }
    this.active = name;
    this.el.root.dataset.screen = name;
    if (name === 'construction') {
      this.previousMapMode ??= this.game.renderer.mapMode === 'construction'
        ? 'political' : this.game.renderer.mapMode;
      this.game.renderer.setConstructionMode(this.game.turns.playerNation);
      this.game.requestRender();
    }
    document.body.classList.add('screen-open');
    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    for (const btn of document.querySelectorAll('#tab-bar button')) {
      btn.classList.toggle('active', btn.dataset.screen === name);
    }
    this.el.body.scrollTop = 0;
    this.refresh();
  }

  close() {
    if (this.active === 'construction') this.restoreMapMode();
    this.constructionType = null;
    this.active = null;
    delete this.el.root.dataset.screen;
    document.body.classList.remove('screen-open');
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    for (const btn of document.querySelectorAll('#tab-bar button')) {
      btn.classList.remove('active');
    }
  }

  restoreMapMode() {
    const mode = this.previousMapMode ?? 'political';
    this.previousMapMode = null;
    this.game.renderer.setMapMode(mode);
    for (const btn of document.querySelectorAll('.mode-btn[data-mode]')) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
    this.game.requestRender();
  }

  refresh() {
    if (!this.active || !this.game.world) return;
    const me = this.me;
    this.el.title.textContent = TITLES[this.active] ?? '—';
    // Construction artik eski sehir kaynaklariyla degil state-slot kapasitesiyle
    // calisir; eski gold/food/timber/iron seridi bu ekranda gosterilmez.
    this.el.res.innerHTML = me && this.active !== 'construction' ? this.resourceLine(me) : '';
    this.el.body.innerHTML = me
      ? (this[`render_${this.active}`]?.(me) ?? '')
      : '<p class="empty">Your nation has been eliminated.</p>';
    this.bind();
  }

  resourceLine(me) {
    const weekly = (me.budget?.net?.gold ?? 0) + (me.economy?.fiscalNet ?? 0);
    const sign = `${weekly >= 0 ? '+' : ''}${Math.round(weekly)}`;
    return `<span>¤ <b>${Math.round(me.gold)}</b> ${sign}</span>
      <span>GDP <b>¤${Math.round(me.economy?.gdp ?? 0)}</b></span>
      <span>STB <b>${Math.round((me.economy?.stability ?? 0) * 100)}%</b></span>
      <span>☠ <b>${Math.round(me.infamy ?? 0)}</b>/${INFAMY_COALITION}</span>`;
  }

  myCities(me) {
    return this.game.world.cities.filter((c) => c.nationId === me.id);
  }

  // --- Ülke özeti: bayrağa dokununca açılan stratejik durum ekranı ---
  render_nation(me) {
    const world = this.game.world;
    const cities = this.myCities(me);
    const units = world.units.filter((u) => u.nationId === me.id);
    const population = me.economy?.population ?? 0;
    const foreign = world.tiles.reduce((sum, tile) => (
      tile.owner === me.id && tile.culture !== me.culture
        ? sum + (tile.province?.population ?? 0) : sum
    ), 0);
    const culture = world.cultures[me.culture]?.name ?? 'Unknown';
    const capital = cities.find((city) => city.tile === me.capital) ?? cities[0];
    const wars = world.nations.filter(
      (nation) => nation.alive && nation.id !== me.id && atWar(world, me.id, nation.id),
    );
    const peace = world.nations.filter(
      (nation) => nation.alive && nation.id !== me.id && !atWar(world, me.id, nation.id),
    ).length;
    const board = scoreboard(world);
    const score = board.find((entry) => entry.nation.id === me.id);
    const rank = board.findIndex((entry) => entry.nation.id === me.id) + 1;
    const foreignPct = population ? Math.round((foreign / population) * 100) : 0;
    const atlas = constructionAtlas(world, me.id);
    const taxes = me.economy?.taxes ?? {};

    return `<div class="nation-hero card">
        <img class="nation-flag-large" src="${flagDataUrl(me)}" alt="">
        <div class="nation-identity">
          <h3>${esc(me.fullName)}</h3>
          <small>${esc(culture)} founding culture · ${me.coastal ? 'Maritime access' : 'Landlocked'}</small>
        </div>
        <button class="action focus-capital" data-focus-capital="1">Focus Capital</button>
      </div>
      <div class="overview-stats">
        <div><span>Hegemony</span><b>${score?.total ?? 0}/${HEGEMONY_TARGET}</b><small>Rank ${rank || '—'}</small></div>
        <div><span>Territory</span><b>${me.tiles}</b><small>provinces</small></div>
        <div><span>Population</span><b>${formatPopulation(population)}</b><small>${cities.length} cities</small></div>
        <div><span>Armed Forces</span><b>${units.length}</b><small>power ${nationStrength(world, me)}</small></div>
        <div><span>Internal Cohesion</span><b>${100 - foreignPct}%</b><small>${foreignPct}% foreign population</small></div>
        <div><span>Construction</span><b>${atlas.free}/${atlas.slots}</b><small>state slots available</small></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>National Economy</h3><small>current fiscal system</small></div>
        <div class="economy-ledger">
          <span><small>Treasury</small><b>¤${Math.round(me.gold)}</b></span>
          <span><small>GDP</small><b>¤${Math.round(me.economy?.gdp ?? 0)}</b></span>
          <span><small>Tax revenue</small><b>¤${(me.economy?.taxRevenue ?? 0).toFixed(1)}</b></span>
          <span><small>Weekly balance</small><b class="${(me.economy?.fiscalNet ?? 0) < 0 ? 'res-neg' : 'res-pos'}">${(me.economy?.fiscalNet ?? 0) >= 0 ? '+' : ''}¤${(me.economy?.fiscalNet ?? 0).toFixed(1)}</b></span>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Government & Society</h3><small>current systems</small></div>
        <div class="detail-list">
          <div><span>Capital</span><b>${esc(capital?.name ?? 'Lost')}</b></div>
          <div><span>Infamy</span><b>${Math.round(me.infamy ?? 0)}/${INFAMY_COALITION}</b></div>
          <div><span>Diplomatic Position</span><b>${wars.length ? `${wars.length} wars` : 'At peace'} · ${peace} peaceful relations</b></div>
          <div><span>Class Taxes</span><b>${taxes.lower ?? 0}% / ${taxes.middle ?? 0}% / ${taxes.upper ?? 0}%</b></div>
          <div><span>Stability</span><b>${Math.round((me.economy?.stability ?? 0) * 100)}%</b></div>
        </div>
      </div>`;
  }

  // --- İnşaat: şehir başına bina yuvaları ---
  render_construction(me) {
    const cities = this.myCities(me);
    if (!cities.length) return '<p class="empty">You have no cities.</p>';

    const atlas = constructionAtlas(this.game.world, me.id);
    const state = ensureConstruction(me);
    const selected = CONSTRUCTION_TYPES[this.constructionType] ?? null;
    const power = constructionPower(me);
    const upkeep = constructionUpkeep(me);
    const buildPalette = Object.values(CONSTRUCTION_TYPES).map((type) => `
      <button class="construction-build${this.constructionType === type.id ? ' selected' : ''}"
        data-construction-type="${type.id}" title="${esc(type.desc)}">
        <i>${type.icon}</i><span><b>${esc(type.name)}</b><small>${type.cost} points · −¤${type.upkeep}/week</small></span>
      </button>`).join('');
    const regions = [...atlas.regions]
      .sort((a, b) => b.free - a.free || a.name.localeCompare(b.name));
    const stateRows = regions.map((region) => {
      const status = region.status === 'full'
        ? 'Full'
        : region.status === 'partial' ? 'Partly occupied' : 'Open';
      const built = Object.values(CONSTRUCTION_TYPES).map((type) => {
        const count = region.buildings.filter((building) => building.typeId === type.id).length;
        return count ? `<span title="${esc(type.name)}">${type.icon} ${count}</span>` : '';
      }).join('');
      const allowed = selected
        ? canQueueConstruction(this.game.world, me, region.id, selected.id) : true;
      return `<button class="construction-state state-${region.status}${selected ? ' placement-ready' : ''}"
        data-construction-region="${region.id}" ${allowed ? '' : 'disabled'}>
        <i class="construction-state-color"></i>
        <span class="construction-state-name">
          <span><b>${esc(region.name)}</b><em>${esc(status)}</em></span>
          <small>${region.tiles.length} provinces · ${formatPopulation(region.population)} population</small>
          <span class="construction-state-buildings">${built || '<span>no buildings</span>'}</span>
        </span>
        <span class="construction-state-capacity">
          <span><small>Used capacity</small><b>${region.used} / ${region.slots}</b></span>
          <i class="construction-slot-bar"><i style="width:${Math.round((region.used / region.slots) * 100)}%"></i></i>
        </span>
        <strong><b>${region.free}</b><small>free</small></strong>
      </button>`;
    }).join('');
    let cumulative = 0;
    const queueRows = state.projects.map((project, index) => {
      const type = CONSTRUCTION_TYPES[project.typeId];
      const remaining = Math.max(0, type.cost - project.progress);
      cumulative += remaining;
      const eta = Math.max(1, Math.ceil(cumulative / Math.max(1, power)));
      const percent = Math.min(100, Math.round((project.progress / type.cost) * 100));
      return `<div class="construction-project">
        <strong>${index + 1}</strong><i>${type.icon}</i>
        <span><b>${esc(type.name)}</b><small>${esc(project.regionName)} · about ${eta} week${eta === 1 ? '' : 's'}</small>
          <span class="construction-project-bar"><i style="width:${percent}%"></i><em>${Math.round(project.progress)} / ${type.cost}</em></span>
        </span>
        <span class="construction-project-actions">
          <button data-project-up="${project.id}" ${index === 0 ? 'disabled' : ''} title="Move up">▲</button>
          <button data-project-down="${project.id}" ${index === state.projects.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
          <button data-project-cancel="${project.id}" title="Cancel">✕</button>
        </span>
      </div>`;
    }).join('');
    const constructionOverview = `<div class="construction-summary">
      <div class="construction-summary-title">
        <span><small>NATIONAL CAPACITY</small><b>State Construction</b></span>
        <em>MAP MODE ACTIVE</em>
      </div>
      <div class="construction-kpis">
        <span><small>Build power</small><b>${power}/wk</b></span>
        <span><small>Building upkeep</small><b>−¤${upkeep.toFixed(1)}</b></span>
        <span class="construction-free-total"><small>Available slots</small><b>${atlas.free}<em> / ${atlas.slots}</em></b></span>
      </div>
      <div class="construction-build-palette">${buildPalette}</div>
      <div class="construction-placement-hint ${selected ? 'active' : ''}">
        ${selected ? `<b>${selected.icon} ${esc(selected.name)} selected</b><span>Click a state row or one of your states on the map to add it to the queue.</span>`
    : '<b>Select a building icon</b><span>Then click a state row or the map to start construction.</span>'}
      </div>
      <div class="construction-legend">
        <span><i class="legend-green"></i><b>More free slots</b></span>
        <span><i class="legend-yellow"></i><b>Partly occupied</b></span>
        <span><i class="legend-blue"></i><b>Full state</b></span>
      </div>
    </div>`;
    const regionOverview = `<div class="construction-regions">
      <div class="construction-regions-head"><span><small>STATE OVERVIEW</small><b>Construction Regions</b></span>
        <em>${atlas.free} slots available</em></div>
      ${stateRows}
    </div>`;

    return `${constructionOverview}<div class="construction-queue">
        <div class="construction-queue-head"><span><small>NATIONAL PRIORITY</small><b>Construction Queue</b></span><em>${state.projects.length} active</em></div>
        ${queueRows || `<div class="construction-queue-empty"><b>No active projects</b><p>Select a building above, then choose a state.</p></div>`}
      </div>${regionOverview}`;
  }

  // --- Sanayi: şehir fabrikaları, istihdam ve dünya fiyatına bağlı kârlılık ---
  render_industry(me) {
    const world = this.game.world;
    const economy = me.economy;
    const cities = this.myCities(me);
    if (!economy || !cities.length) return '<p class="empty">Industry requires an incorporated city.</p>';

    const factoryCards = economy.factories.map((factory) => {
      const type = FACTORIES[factory.typeId];
      const city = world.cities.find((candidate) => candidate.id === factory.cityId);
      const capacity = factory.level * 18000;
      const employment = capacity ? (factory.employees / capacity) * 100 : 0;
      const inputs = Object.entries(type.inputs)
        .map(([id, amount]) => `${amount} ${GOODS[id].icon} ${GOODS[id].name}`).join(' · ');
      const outputs = Object.entries(type.outputs)
        .map(([id, amount]) => `${amount} ${GOODS[id].icon} ${GOODS[id].name}`).join(' · ');
      const profitable = factory.profit >= 0;
      return `<div class="card factory-card ${profitable ? 'profitable' : 'unprofitable'}">
        <div class="card-head"><h3>${type.icon} ${esc(type.name)}</h3>
          <small>${esc(city?.name ?? 'Lost city')} · level ${factory.level}</small></div>
        <div class="factory-kpis">
          <span><small>Employment</small><b>${formatPopulation(factory.employees)} / ${formatPopulation(capacity)}</b></span>
          <span><small>Weekly profit</small><b class="${profitable ? 'res-pos' : 'res-neg'}">${profitable ? '+' : ''}¤${factory.profit.toFixed(1)}</b></span>
          <span><small>Margin</small><b>${Math.round(factory.margin * 100)}%</b></span>
        </div>
        <div class="factory-chain"><span>buys ${esc(inputs)}</span><strong>→</strong><span>sells ${esc(outputs)}</span></div>
        <div class="meter"><i style="width:${Math.max(0, Math.min(100, employment))}%"></i></div>
        <button class="action" data-expand-factory="${esc(factory.id)}"
          ${!canExpandFactory(me, factory) ? 'disabled' : ''}>
          ${factory.level >= MAX_FACTORY_LEVEL ? 'Fully developed' : `Expand · ${formatCost(expansionCost(factory))}`}
        </button>
      </div>`;
    }).join('') || '<div class="card"><p class="empty">No factories. Choose an industry below.</p></div>';

    const buildCards = cities.map((city) => {
      const options = Object.values(FACTORIES).map((type) => {
        const margin = factoryMargin(world, type.id);
        const enabled = canBuildFactory(world, me, city, type.id);
        return `<button class="building-option category-industry" data-factory="${type.id}" data-city="${city.id}" ${enabled ? '' : 'disabled'}>
          <span class="building-icon">${type.icon}</span>
          <span><b>${esc(type.name)}</b><small>expected margin ${margin >= 0 ? '+' : ''}¤${margin.toFixed(1)} per level</small>
            <em>investment ${formatCost(factoryCost(me, type.id))}</em></span>
        </button>`;
      }).join('');
      return `<div class="card city-construction">
        <div class="card-head"><h3>Invest in ${esc(city.name)}</h3>
          <small>maximum 4 factories per city · investment cost rises with installed capacity</small></div>
        <div class="building-grid">${options}</div>
      </div>`;
    }).join('');

    return `<div class="card">
      <div class="card-head"><h3>National Industry</h3>
        <small>GDP ¤${Math.round(economy.gdp)} · factory balance ${economy.factoryProfit >= 0 ? '+' : ''}¤${economy.factoryProfit.toFixed(1)}</small></div>
    </div>${factoryCards}${buildCards}`;
  }

  // --- Üretim: birim satın alma + mevcut ordu dökümü ---
  render_production(me) {
    const world = this.game.world;
    const cities = this.myCities(me);
    const army = world.units.filter((u) => u.nationId === me.id);
    const byType = {};
    for (const u of army) byType[u.type.id] = (byType[u.type.id] ?? 0) + 1;

    const armyRows = Object.entries(UNIT_TYPES).map(([id, t]) => `
      <tr><td>${t.name}</td><td class="num">${byType[id] ?? 0}</td>
      <td class="num">${t.attack}</td><td class="num">${t.hp}</td></tr>`).join('');

    const cityCards = cities.length ? cities.map((city) => {
      const buttons = Object.entries(UNIT_COSTS)
        .filter(([id]) => UNIT_TYPES[id].domain !== 'sea' || city.tile.coastal)
        .map(([id, cost]) => {
          const off = canAfford(me, cost) && canRecruit(world, me, id) ? '' : 'disabled';
          return `<button class="action" data-buy="${id}" ${off}>${UNIT_TYPES[id].name} · ${formatPopulation(UNIT_TYPES[id].manpower)} men · ${formatCost(cost)} · ${equipmentCostLabel(id)}</button>`;
        }).join('');
      return `<div class="card">
        <div class="card-head"><h3>${esc(city.name)}</h3>
          <small>${city.tile.coastal ? 'coastal city' : 'inland city'}</small></div>
        <div class="row-buttons">${buttons}</div>
      </div>`;
    }).join('') : '<p class="empty">You have no cities.</p>';

    // TODO: Mobilization is intentionally disabled; its gameplay system is not implemented yet.
    const mobilizationCard = `<div class="card">
      <div class="card-head"><h3>Mobilization</h3>
        <small>reserved for the future manpower and wartime economy system</small></div>
      <div class="row-buttons">
        <button class="action wide" type="button" disabled title="Mobilization is not implemented yet">
          Mobilization &middot; Coming later
        </button>
      </div>
    </div>`;

    const militaryFactories = (me.economy?.factories ?? [])
      .filter((factory) => factory.typeId === 'ARMS_FACTORY')
      .map((factory) => ensureProductionLine(factory));
    const lineRows = militaryFactories.map((factory) => {
      const city = world.cities.find((candidate) => candidate.id === factory.cityId);
      const equipment = MILITARY_EQUIPMENT[factory.lineEquipment];
      const efficiency = Math.round(factory.lineEfficiency * 100);
      const inputs = Math.round((factory.inputFulfillment ?? 1) * 100);
      const choices = Object.values(MILITARY_EQUIPMENT).map((candidate) => `
        <button class="production-choice ${candidate.id === equipment.id ? 'active' : ''}"
          data-production-line="${factory.id}" data-equipment="${candidate.id}"
          ${candidate.id === equipment.id ? 'disabled' : ''}>${candidate.icon} ${esc(candidate.name)}</button>`).join('');
      return `<div class="production-line-row">
        <div class="production-line-head"><span><b>${equipment.icon} ${esc(equipment.name)}</b>
          <small>${esc(city?.name ?? 'Unknown city')} · level ${factory.level} · inputs ${inputs}%</small></span>
          <strong>${((factory.lineOutput ?? 0) / 7).toFixed(2)}/day</strong></div>
        <div class="line-efficiency"><i style="width:${efficiency}%"></i><span>efficiency ${efficiency}%</span></div>
        <div class="production-choices">${choices}</div>
      </div>`;
    }).join('');
    const armsCost = factoryCost(me, 'ARMS_FACTORY');
    const investmentRules = factoryInvestmentRules(me);
    const buildLineButtons = cities.map((city) => `
      <button class="action" data-factory="ARMS_FACTORY" data-city="${city.id}"
        ${canBuildFactory(world, me, city, 'ARMS_FACTORY') ? '' : 'disabled'}>
        Build in ${esc(city.name)} · ${formatCost(armsCost)}</button>`).join('');
    const productionLinesCard = `<div class="card production-lines-card">
      <div class="card-head"><h3>Military Production Lines</h3>
        <small>efficiency rises while a line stays on the same equipment</small></div>
      ${lineRows || '<p class="empty">No Arms Industry is producing military equipment.</p>'}
      <div class="row-buttons">${buildLineButtons}</div>
      <p class="hint">Switching equipment resets that factory line to 50% efficiency.</p>
      ${investmentRules.stateBuild ? '' : `<p class="hint res-warn">${esc(policyLabel('economy', investmentRules.policy))}: the state cannot open factories. Private investors act automatically when they have enough capital.</p>`}
    </div>`;

    const replacement = reinforcementNeed(world, me);
    const military = me.economy?.military ?? {};
    const reinforcementCard = `<div class="card">
      <div class="card-head"><h3>Reinforcement</h3>
        <small>organization recovers outside combat; strength requires people and equipment</small></div>
      <div class="stats-grid">
        <div><small>Small Arms stock</small><b>${(military.arms ?? 0).toFixed(1)} ⚔</b></div>
        <div><small>Artillery stock</small><b>${(military.artillery ?? 0).toFixed(1)} ●</b></div>
        <div><small>Recruitable population</small><b>${formatPopulation(replacement.availableManpower)}</b></div>
        <div><small>Missing strength</small><b>${formatPopulation(replacement.strength)}</b></div>
        <div><small>Equipment required</small><b>${replacement.arms.toFixed(1)} ⚔ · ${replacement.artillery.toFixed(1)} ●</b></div>
        <div><small>Reinforced this week</small><b>${formatPopulation(military.reinforced ?? 0)}</b></div>
      </div>
      <p class="hint">This week used ${formatPopulation(military.manpowerUsed ?? 0)} people, ${(military.armsUsed ?? 0).toFixed(2)} Small Arms and ${(military.artilleryUsed ?? 0).toFixed(2)} Artillery Equipment.</p>
    </div>`;

    const armyGold = Math.round(me.budget?.armyGold ?? army.length);
    // Recruitment stays first so the controls do not move down as the army table grows.
    return `<div class="card production-manpower-note"><p class="hint">Recruits leave their province RGO. Falling below its workforce capacity reduces output; only surviving soldiers return when a division is disbanded.</p></div>${cityCards}${mobilizationCard}${productionLinesCard}${reinforcementCard}<div class="card">
        <div class="card-head"><h3>Armed Forces</h3>
          <small>${army.length} units · upkeep ${armyGold} ⬤ / ${me.budget?.army ?? army.length} 🌾</small></div>
        <table class="data-table">
          <tr><th>unit</th><th style="text-align:right">count</th><th style="text-align:right">attack</th><th style="text-align:right">strength</th></tr>
          ${armyRows}
        </table>
      </div>`;
  }

  // --- Bütçe: üç sınıfın vergisi, gümrük ve askerî harcama ---
  render_budget(me) {
    const economy = me.economy;
    if (!economy) return '<p class="empty">Fiscal institutions are not initialized.</p>';
    const budget = me.budget ?? {};
    const saved = economy.ledger ?? {};
    const live = {
      cityRevenue: budget.production?.gold ?? 0,
      taxRevenue: economy.taxRevenue ?? 0,
      tariffRevenue: economy.tariffRevenue ?? 0,
      armyCost: budget.armyGold ?? 0,
      administrationCost: budget.administration ?? 0,
      socialCost: economy.socialCost ?? 0,
      importCost: economy.importCost ?? 0,
      constructionCost: economy.constructionUpkeep ?? 0,
    };
    live.income = live.cityRevenue + live.taxRevenue + Math.max(0, live.tariffRevenue);
    live.expenses = live.armyCost + live.administrationCost
      + live.socialCost + live.importCost + live.constructionCost
      + Math.max(0, -live.tariffRevenue);
    live.net = live.income - live.expenses;
    const ledger = saved.lastUpdated ? saved : live;
    const money = (value, forceSign = true) => `${forceSign && value >= 0 ? '+' : value < 0 ? '−' : ''}¤${Math.abs(value).toFixed(1)}`;
    const row = (name, value, total = false, tone = 'auto') => {
      const positive = tone === 'income' || (tone === 'auto' && value >= 0);
      const shown = tone === 'expense' ? `−¤${Math.abs(value).toFixed(1)}` : money(value);
      return `<div class="budget-row${total ? ' total' : ''}">
        <span>${esc(name)}</span><b class="${positive ? 'res-pos' : 'res-neg'}">${shown}</b>
      </div>`;
    };
    const taxControls = [
      ['lower', 'Lower class tax'], ['middle', 'Middle class tax'], ['upper', 'Upper class tax'],
    ].map(([id, label]) => `<label class="budget-policy">
      <span>${label}<b data-policy-value>${economy.taxes[id]}%</b></span>
      <input type="range" min="0" max="100" step="5" value="${economy.taxes[id]}" data-policy="tax" data-class="${id}">
    </label>`).join('');
    const socialControls = Object.values(SOCIAL_PROGRAMS).map((program) => {
      const level = economy.social[program.id] ?? 0;
      return `<label class="budget-policy"><span>${esc(program.name)}<b data-policy-value>${level}%</b></span>
        <input type="range" min="0" max="100" step="10" value="${level}" data-policy="social" data-class="${program.id}">
      </label>`;
    }).join('');
    const politicalLimits = fiscalPolicyLimits(me);

    // Hazine ve istikrar üst barda zaten duruyor; panelde tekrarlanmaz.
    // Panelin tek ana metriği haftalık bakiyedir ve ilk bakışta görülmelidir.
    return `<div class="budget-hero">
        <span>Weekly balance</span>
        <b class="${ledger.net >= 0 ? 'res-pos' : 'res-neg'}">${money(ledger.net)}</b>
      </div>
      <div class="budget-flow-grid">
        <section class="budget-flow">
          <h3>Income</h3>
          <div class="budget-rows">
            ${row('Cities & provinces', ledger.cityRevenue ?? 0, false, 'income')}
            ${row('Taxes', ledger.taxRevenue ?? 0, false, 'income')}
            ${row('Tariffs', ledger.tariffRevenue ?? 0)}
            ${row('Total', ledger.income ?? 0, true, 'income')}
          </div>
        </section>
        <section class="budget-flow">
          <h3>Expenses</h3>
          <div class="budget-rows">
            ${row('Army', ledger.armyCost ?? 0, false, 'expense')}
            ${row('Administration', ledger.administrationCost ?? 0, false, 'expense')}
            ${row('Construction', ledger.constructionCost ?? 0, false, 'expense')}
            ${row('Social programs', ledger.socialCost ?? 0, false, 'expense')}
            ${row('Strategic imports', ledger.importCost ?? 0, false, 'expense')}
            ${row('Total', ledger.expenses ?? 0, true, 'expense')}
          </div>
        </section>
      </div>
      <div class="budget-policy-grid">
        <section class="budget-policy-card">
          <h3>Tax Policy</h3>
          ${taxControls}
          <label class="budget-policy"><span>Tariffs<b data-policy-value>${economy.tariff}%</b></span>
            <input type="range" min="${politicalLimits.tariffMin}" max="${politicalLimits.tariffMax}" step="5" value="${economy.tariff}" data-policy="tariff">
          </label>
          <label class="budget-policy"><span>Army funding<b data-policy-value>${economy.armySpending}%</b></span>
            <input type="range" min="${politicalLimits.armySpendingMin}" max="${politicalLimits.armySpendingMax}" step="5" value="${economy.armySpending}" data-policy="armySpending">
          </label>
        </section>
        <section class="budget-policy-card">
          <h3>Public Spending</h3>
          <p class="section-note">−¤${socialSpendingCost(me).toFixed(1)} per week</p>
          ${socialControls}
        </section>
      </div>`;
  }

  // --- Nüfus: kişi başı nesne yerine 1.000 kişilik toplu sınıf kohortları ---
  render_population(me) {
    const economy = me.economy;
    if (!economy?.classes) return '<p class="empty">Population records are not initialized.</p>';
    const total = Math.max(1, economy.cohortPopulation
      ?? Object.values(economy.classes).reduce((sum, socialClass) => sum + socialClass.population, 0));
    const lower = economy.classes.lower.population;
    const middle = economy.classes.middle.population;
    const upper = economy.classes.upper.population;
    const lowerEnd = (lower / total) * 100;
    const middleEnd = lowerEnd + (middle / total) * 100;
    const pieStyle = `background:conic-gradient(${CLASS_INFO.lower.color} 0 ${lowerEnd.toFixed(2)}%, ${CLASS_INFO.middle.color} ${lowerEnd.toFixed(2)}% ${middleEnd.toFixed(2)}%, ${CLASS_INFO.upper.color} ${middleEnd.toFixed(2)}% 100%)`;
    const classRows = Object.entries(CLASS_INFO).map(([classId, info]) => {
      const socialClass = economy.classes[classId];
      const share = socialClass.population / total;
      const professions = CLASS_PROFESSIONS[classId]
        .map((id) => PROFESSION_INFO[id].name).join(' · ');
      return `<div class="population-class" style="--population-class:${info.color}">
        <div class="population-class-main">
          <span><i></i><b>${esc(info.name)}</b><small>${Math.round(share * 100)}%</small></span>
          <strong>${formatPopulation(socialClass.population)}</strong>
        </div>
        <div class="population-class-meta">
          <span>Tax <b>${economy.taxes[classId]}%</b></span>
          <span>Satisfaction <b>${Math.round((socialClass.satisfaction ?? 0) * 100)}%</b></span>
          <span>Needs <b class="${socialClass.canAffordNeeds ? 'res-pos' : 'res-neg'}">${socialClass.canAffordNeeds ? 'covered' : 'unmet'}</b></span>
        </div>
        <p>Automatic occupations: ${esc(professions)}</p>
      </div>`;
    }).join('');
    const mobility = economy.mobility ?? {};
    const movements = [];
    if (mobility.demotedUpper) movements.push(`${formatPopulation(mobility.demotedUpper)} Upper → Middle`);
    if (mobility.demotedMiddle) movements.push(`${formatPopulation(mobility.demotedMiddle)} Middle → Lower`);

    return `<div class="card population-overview">
        <div class="population-pie" style="${pieStyle}">
          <div><b>${formatPopulation(total)}</b><small>grouped population</small></div>
        </div>
        <div class="population-overview-copy">
          <div class="card-head"><h3>Social Classes</h3><small>${formatPopulation(economy.population)} exact population</small></div>
          <p>Population is processed in ${formatPopulation(POPULATION_COHORT)}-person cohorts. Individuals are never simulated.</p>
          <div class="population-mobility">
            <span>Class movement this week</span>
            <b>${movements.length ? movements.join(' · ') : 'No movement'}</b>
          </div>
          <div class="population-mobility">
            <span>Latest internal migration</span>
            <b>${formatPopulation(economy.lastInternalMigration ?? 0)} people found work in another province</b>
          </div>
        </div>
      </div>
      <div class="card population-classes">
        <div class="card-head"><h3>Class Population</h3><small>occupation assignment is automatic</small></div>
        ${classRows}
      </div>
      <div class="card population-rule">
        <b>Demotion rule</b>
        <p>If a class cannot cover its needs after taxes for four consecutive weeks, one ${formatPopulation(POPULATION_COHORT)} cohort moves down one class. Calculations are aggregated, so the cost does not grow per person.</p>
      </div>`;
  }

  // --- Politics: sınıf toplamlarından türetilen parti desteği ve politika paketleri ---
  render_politics(me) {
    const politics = me.politics;
    const ruler = rulingParty(me);
    if (!politics?.parties?.length || !ruler) return '<p class="empty">Political parties are not initialized.</p>';
    const ideology = IDEOLOGIES[ruler.ideology];
    const rules = factoryInvestmentRules(me);
    const electionIn = Math.max(0, politics.nextElectionTurn - this.game.world.turn);
    const policyRows = Object.entries(ruler.policies).map(([category, value]) => {
      const policy = POLITICAL_POLICIES[category]?.[value];
      // Açıklama satırda zaten görünüyor; aynı metni bir de tooltip'te tekrar
      // etmek kartın üstünü kapatıyordu. Tooltip yalnız yer olmayan yerde kalır.
      return `<div class="politics-policy-row">
        <span>${esc(category)}</span>
        <div><b>${esc(policy?.name ?? value)}</b><small>${esc(policy?.desc ?? '')}</small></div>
      </div>`;
    }).join('');
    const partyCards = [...politics.parties]
      .sort((a, b) => b.support - a.support)
      .map((party) => {
        const info = IDEOLOGIES[party.ideology];
        const policies = Object.entries(party.policies).map(([category, value]) => {
          const policy = POLITICAL_POLICIES[category]?.[value];
          return `<span tabindex="0" data-tooltip="${esc(policy?.desc ?? '')}">
            <small>${esc(category)}</small>
            <b>${esc(policyLabel(category, value))} <i class="politics-info" aria-hidden="true">?</i></b>
          </span>`;
        }).join('');
        return `<div class="politics-party ${party.id === ruler.id ? 'ruling' : ''}" style="--party-color:${info.color}">
          <div class="politics-party-head">
            <span><i></i><b>${esc(party.name)}</b><small>${esc(info.name)}</small></span>
            <strong>${party.support.toFixed(1)}%</strong>
          </div>
          <div class="politics-support"><i style="width:${Math.max(0, Math.min(100, party.support))}%"></i></div>
          <div class="politics-party-policies">${policies}</div>
        </div>`;
      }).join('');

    return `<div class="card politics-government" style="--party-color:${ideology.color}">
        <div class="politics-government-title">
          <span><small>Ruling party</small><b>${esc(ruler.name)}</b><em>${esc(ideology.name)}</em></span>
          <strong>${ruler.support.toFixed(1)}%</strong>
        </div>
        <div class="politics-government-stats">
          <span><small>Next election</small><b>${electionIn} weeks</b></span>
          <span><small>Private capital</small><b>¤${politics.privateCapital.toFixed(1)}</b></span>
          <span><small>State factories</small><b class="${rules.stateBuild ? 'res-pos' : 'res-neg'}">${rules.stateBuild ? 'allowed' : 'blocked'}</b></span>
          <span><small>Private factories</small><b class="${rules.privateBuild ? 'res-pos' : 'res-neg'}">${rules.privateBuild ? 'allowed' : 'blocked'}</b></span>
        </div>
      </div>
      <div class="card politics-platform">
        <div class="card-head"><h3>Government Platform</h3><small>active rules</small></div>
        ${policyRows}
      </div>
      <div class="card politics-parties">
        <div class="card-head"><h3>Political Parties</h3><small>support is calculated from the three social classes</small></div>
        ${partyCards}
      </div>
      <div class="card politics-note">
        <b>Aggregated politics</b>
        <p>No individual voters are simulated. Party support is recalculated from Lower, Middle and Upper Class cohorts; elections occur every ${politics.electionInterval} weeks.</p>
      </div>`;
  }

  // --- Diplomasi: ilişki listesi ve savaş/barış eylemleri ---
  render_logistics(me) {
    const equipment = equipmentLogistics(this.game.world, me);
    const amount = (value) => (Math.abs(value) < 1
      ? value.toFixed(2)
      : value.toFixed(1));
    const signed = (value) => `${value >= 0 ? '+' : ''}${amount(value)}`;
    const eta = (days) => {
      if (days == null) return 'no recovery at the current supply rate';
      if (days <= 14) return `about ${days} day${days === 1 ? '' : 's'}`;
      if (days <= 84) return `about ${(days / 7).toFixed(1)} weeks`;
      return `about ${(days / 30.4).toFixed(1)} months`;
    };
    const rows = equipment.map((item) => {
      const shortage = item.balance < -0.005;
      const tooltip = shortage
        ? `${amount(-item.balance)} ${item.name} missing. Average supply is ${amount(item.supplyPerDay)} per day (${amount(item.producedPerDay)} produced and ${amount(item.importedPerDay)} imported). The gap will close in ${eta(item.etaDays)} if supply and losses stay unchanged.`
        : `${amount(item.balance)} ${item.name} remain after all current replacement requirements are covered.`;
      return `<tr class="equipment-row ${shortage ? 'shortage' : 'surplus'}">
        <td><span class="equipment-name"><i>${item.icon}</i><b>${esc(item.name)}</b></span></td>
        <td class="num">${amount(item.stock)}</td>
        <td class="num">${amount(item.required)}</td>
        <td class="num logistics-balance ${shortage ? 'res-neg' : 'res-pos'}"
          tabindex="0" data-tooltip="${esc(tooltip)}">${signed(item.balance)}</td>
        <td class="num"><b>${amount(item.producedPerDay)}</b><small>${amount(item.importedPerDay)} imported</small></td>
      </tr>`;
    }).join('');
    const shortages = equipment.filter((item) => item.balance < -0.005);
    const dailyProduction = equipment.reduce((sum, item) => sum + item.producedPerDay, 0);
    const dailyImports = equipment.reduce((sum, item) => sum + item.importedPerDay, 0);

    return `<div class="card logistics-hero ${shortages.length ? 'has-shortage' : ''}">
        <div><small>Equipment status</small><b>${shortages.length ? `${shortages.length} shortage` : 'All requirements covered'}</b></div>
        <div><small>Average daily production</small><b>${amount(dailyProduction)}</b></div>
        <div><small>Average daily imports</small><b>${amount(dailyImports)}</b></div>
      </div>
      <div class="card logistics-card">
        <div class="card-head"><h3>Equipment Logistics</h3>
          <small>rolling average supply; red balances are active shortages</small></div>
        <div class="logistics-table-wrap"><table class="data-table logistics-table">
          <tr><th>equipment</th><th class="num">stock</th><th class="num">need</th>
            <th class="num">balance</th><th class="num">prod/day</th></tr>
          ${rows}
        </table></div>
        <p class="hint">Balance is stockpile minus the equipment needed to restore damaged divisions. Hover or focus a red balance to see the estimated time to close the gap.</p>
      </div>`;
  }

  render_diplomacy(me) {
    const world = this.game.world;
    const turn = this.game.turns.turn;
    const others = world.nations.filter((n) => n.alive && n.id !== me.id);
    if (!others.length) return '<p class="empty">No other nations remain.</p>';

    const myPower = nationStrength(world, me);
    const rows = others.map((n) => {
      const war = atWar(world, n.id, me.id);
      const rec = relation(world, n.id, me.id);
      const truce = truceLeft(world, n.id, me.id, turn);
      const locked = war && turn - rec.since < MIN_WAR_TURNS;
      const power = nationStrength(world, n);
      const ratio = power > 0 ? (myPower / power).toFixed(2) : '∞';
      const tag = war ? '<span class="tag war">war</span>'
        : truce ? `<span class="tag truce">truce ${truce}</span>`
          : '<span class="tag peace">peace</span>';
      const action = war
        ? `<button class="action" data-peace="${n.id}" ${locked ? 'disabled' : ''}>Offer Peace${locked ? ` (${MIN_WAR_TURNS - (turn - rec.since)})` : ''}</button>`
        : `<button class="action" data-war="${n.id}" ${truce ? 'disabled' : ''}>Declare War</button>`;

      return `<div class="card">
        <div class="rel-row">
          <img class="flag" src="${flagDataUrl(n)}" alt="">
          <div class="grow">
            <div class="name">${esc(n.name)} ${tag}</div>
            <div class="meta">${n.tiles} provinces · power ratio ${ratio} · infamy ${Math.round(n.infamy ?? 0)}</div>
          </div>
          ${action}
        </div>
      </div>`;
    }).join('');

    const forceStats = (armies) => {
      const soldiers = armies.reduce((sum, army) => sum + soldiersOf(army), 0);
      const maxStrength = armies.reduce((sum, army) => sum + maxHpOf(army), 0);
      const organization = soldiers > 0
        ? armies.reduce((sum, army) => sum + organizationOf(army) * soldiersOf(army), 0) / soldiers
        : 0;
      const strength = maxStrength > 0 ? soldiers / maxStrength : 0;
      return { soldiers, strength, organization, divisions: armies.length };
    };
    const battleRows = battlesFor(world, me.id).map((battle) => {
      const mineAttacks = battle.attackerNation === me.id;
      const { attackers, defenders } = battleSides(world, battle);
      const mine = forceStats(mineAttacks ? attackers : defenders);
      const enemy = forceStats(mineAttacks ? defenders : attackers);
      const enemyId = mineAttacks ? battle.defenderNation : battle.attackerNation;
      const organizationTotal = Math.max(1, mine.organization + enemy.organization);
      const position = Math.max(2, Math.min(98, (mine.organization / organizationTotal) * 100));
      return `<div class="front-card card">
        <div class="card-head"><h3>Battle of ${battle.q}, ${battle.r}</h3>
          <small>round ${battle.rounds}/${MAX_ROUNDS} · province terrain modifies the defender</small></div>
        <div class="front-numbers">
          <span><small>${esc(me.name)} · ${mine.divisions} divisions</small><b>${formatPopulation(mine.soldiers)} · STR ${Math.round(mine.strength * 100)}% · ORG ${Math.round(mine.organization)}%</b></span>
          <strong>VS</strong>
          <span><small>${esc(world.nations[enemyId].name)} · ${enemy.divisions} divisions</small><b>${formatPopulation(enemy.soldiers)} · STR ${Math.round(enemy.strength * 100)}% · ORG ${Math.round(enemy.organization)}%</b></span>
        </div>
        <div class="front-track"><i style="left:${position}%"></i></div>
        <p class="hint">losses: ${battle.attackerLosses} attacker / ${battle.defenderLosses} defender · the broken army retreats automatically</p>
      </div>`;
    }).join('');

    return `<div class="card">
        <div class="card-head"><h3>${esc(me.name)}</h3>
          <small>infamy ${Math.round(me.infamy ?? 0)}/${INFAMY_COALITION} · coalition at ${INFAMY_COALITION}</small></div>
      </div>
      <div class="card doctrine-card">
        <div class="card-head"><h3>How war works now</h3><small>one map, one combat system</small></div>
        <p class="hint">Select divisions and order a destination. Friendly divisions share provinces without merging. Entering an enemy army starts a weekly battle; low organization forces retreat and the winner occupies the province. Only a division with no connected retreat route surrenders.</p>
      </div>
      ${battleRows || '<div class="card"><p class="empty">No active province battles.</p></div>'}${rows}`;
  }

  // --- Ticaret: tek dünya pazarı, ülke bazlı haftalık mal akışı ---
  render_trade(me) {
    const world = this.game.world;
    const market = world.market;
    if (!market) return '<p class="empty">The world market is not initialized.</p>';
    const flowNumber = (value) => (value ?? 0).toFixed(value >= 100 ? 0 : 1);
    const trade = me.economy?.trade ?? {};
    const rows = GOOD_IDS.map((goodId) => {
      const good = GOODS[goodId];
      const state = market.goods[goodId];
      const flow = me.economy?.goodsFlow?.[goodId] ?? {};
      const trend = state.trend > 0.005 ? '▲' : state.trend < -0.005 ? '▼' : '—';
      const cls = state.trend > 0.005 ? 'res-neg' : state.trend < -0.005 ? 'res-pos' : '';
      const pressure = state.demand - state.supply;
      const netTrade = (flow.exports ?? 0) - (flow.imports ?? 0);
      const tradeQuantity = Math.abs(netTrade) < 0.05
        ? '&lt;0.1' : flowNumber(Math.abs(netTrade));
      const tradeLabel = netTrade > 0.005
        ? `EXP +${tradeQuantity}`
        : netTrade < -0.005 ? `IMP -${tradeQuantity}` : 'BALANCED';
      const tradeClass = netTrade > 0.005 ? 'res-pos' : netTrade < -0.005 ? 'res-neg' : '';
      const coverage = (flow.demand ?? 0) > 0
        ? Math.round(((flow.fulfilled ?? 0) / flow.demand) * 100) : 100;
      return `<tr title="World supply ${flowNumber(state.supply)} · demand ${flowNumber(state.demand)} · traded ${flowNumber(state.traded)}">
        <td><span class="good-name">${good.icon} ${esc(good.name)}</span><small>${good.category}</small></td>
        <td class="num trade-price"><b>¤${state.price.toFixed(2)}</b><small class="${cls}">${trend} ${Math.abs(state.trend).toFixed(2)}</small></td>
        <td class="num trade-flow-cell"><b>${flowNumber(flow.production)}</b><small>need ${flowNumber(flow.demand)}</small></td>
        <td class="num trade-flow-cell"><b class="${tradeClass}">${tradeLabel}</b><small class="${pressure > 0 ? 'res-neg' : 'res-pos'}">world ${pressure >= 0 ? '+' : ''}${flowNumber(pressure)}</small></td>
        <td class="num trade-flow-cell"><b class="${coverage < 99 ? 'res-neg' : 'res-pos'}">${coverage}%</b><small>${(flow.shortage ?? 0) > 0.005 ? `${flowNumber(flow.shortage)} short` : 'met'}</small></td>
      </tr>`;
    }).join('');
    const hottest = GOOD_IDS.map((id) => market.goods[id])
      .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply))[0];
    const balance = trade.balance ?? 0;

    return `${!(trade.lastUpdated > 0) ? '<p class="trade-awaiting">Market flow will populate after the next weekly tick.</p>' : ''}<div class="trade-hero card">
        <div><small>Trade balance</small><b class="${balance >= 0 ? 'res-pos' : 'res-neg'}">${balance >= 0 ? '+' : ''}¤${balance.toFixed(1)}</b></div>
        <div><small>Exports</small><b class="res-pos">¤${(trade.exportValue ?? 0).toFixed(1)}</b></div>
        <div><small>Imports</small><b class="res-neg">¤${(trade.importValue ?? 0).toFixed(1)}</b></div>
        <div><small>World trade</small><b>¤${Math.round(market.totalGdp)}</b></div>
        <div><small>Tariff</small><b>${me.economy?.tariff ?? 0}%</b></div>
      </div>
      <div class="card market-card">
        <div class="card-head"><h3>Goods Flow</h3>
          <small>${GOODS[hottest.id].icon} ${esc(GOODS[hottest.id].name)} has the highest world pressure</small></div>
        <div class="trade-table-wrap"><table class="data-table market-table">
          <tr><th>good</th><th class="num">price</th><th class="num">made / need</th>
            <th class="num">automatic trade</th><th class="num">need met</th></tr>
          ${rows}
        </table></div>
        <p class="trade-note">Surplus is sold and shortages are imported automatically. Trade balance belongs to the whole economy; only tariffs and military equipment purchases enter the state budget.</p>
      </div>`;
  }

  /** Ekranlardaki eylemleri oyunun mevcut fonksiyonlarına bağlar. */
  bind() {
    const { game } = this;
    const me = this.me;
    if (!me) return;

    for (const btn of this.el.body.querySelectorAll('[data-construction-type]')) {
      btn.onclick = () => {
        this.constructionType = this.constructionType === btn.dataset.constructionType
          ? null : btn.dataset.constructionType;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-construction-region]')) {
      btn.onclick = () => {
        if (!this.constructionType) return;
        if (queueConstruction(game, me.id, btn.dataset.constructionRegion, this.constructionType)) {
          const region = constructionAtlas(game.world, me.id).regions.find(
            (item) => item.id === btn.dataset.constructionRegion,
          );
          game.turns.addLog(`${CONSTRUCTION_TYPES[this.constructionType].name} queued in ${region?.name ?? 'state'}.`);
        }
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-project-up]')) {
      btn.onclick = () => {
        prioritizeConstruction(game, me.id, Number(btn.dataset.projectUp), -1);
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-project-down]')) {
      btn.onclick = () => {
        prioritizeConstruction(game, me.id, Number(btn.dataset.projectDown), 1);
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-project-cancel]')) {
      btn.onclick = () => {
        cancelConstruction(game, me.id, Number(btn.dataset.projectCancel));
        this.refresh();
      };
    }

    const focusCapital = this.el.body.querySelector('[data-focus-capital]');
    if (focusCapital) {
      focusCapital.onclick = () => {
        game.focusNation(me);
        this.close();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-buy]')) {
      btn.onclick = () => game.turns.buyUnit(me, btn.dataset.buy);
    }
    for (const btn of this.el.body.querySelectorAll('[data-factory]')) {
      btn.onclick = () => {
        if (buildFactory(game, me, Number(btn.dataset.city), btn.dataset.factory)) this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-expand-factory]')) {
      btn.onclick = () => {
        if (expandFactory(game, me, btn.dataset.expandFactory)) this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-production-line]')) {
      btn.onclick = () => {
        if (setMilitaryProductionLine(
          game, me, btn.dataset.productionLine, btn.dataset.equipment,
        )) this.refresh();
      };
    }
    for (const input of this.el.body.querySelectorAll('[data-policy]')) {
      input.oninput = () => {
        const label = input.closest('.policy-slider')?.querySelector('[data-policy-value]');
        if (label) label.textContent = `${input.value}%`;
      };
      input.onchange = () => {
        setFiscalPolicy(me, input.dataset.policy, Number(input.value), input.dataset.class);
        game.recomputeEconomy();
        game.emit('economy', me.economy);
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-war]')) {
      btn.onclick = () => { game.declareWarOn(Number(btn.dataset.war)); this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-peace]')) {
      btn.onclick = () => { game.proposePeaceTo(Number(btn.dataset.peace)); this.refresh(); };
    }
  }
}
