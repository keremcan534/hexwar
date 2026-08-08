// HOI4 tarzı tam ekran yönetim ekranları: İnşaat, Üretim, Araştırma,
// Lojistik, Diplomasi, Ticaret.
//
// Amaç her şeyi tek alt panele tıkıştırmaktan kurtulmak. Veri zaten oyunda
// mevcut olduğu için ekranlar gerçek sayılarla dolduruldu; etkileşimler de
// var olan fonksiyonlara bağlandı (yeni oyun mantığı yazılmadı).

import {
  UNIT_COSTS, WORK_RADIUS, canAfford, cityProduction, foreignPop, formatCost,
  growthCost, storageCap,
} from '../game/cities.js';
import {
  BUILDINGS, buildingPlacementTiles, buildingSlots,
} from '../game/buildings.js';
import {
  TECHS, canResearch, hasTech, research, researchCost,
} from '../game/tech.js';
import { MIN_WAR_TURNS, atWar, nationStrength, relation, truceLeft } from '../game/diplomacy.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import {
  MAX_TIER, UNIT_TYPES, armyTier, modernizeCost, moraleOf, regimentCount, soldiersOf, tierInfo,
} from '../game/units.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { HEGEMONY_TARGET, scoreboard } from '../game/hegemony.js';
import {
  ROAD_MAX_LEVEL, canBuildRoad, roadCost, roadLabel,
} from '../game/infrastructure.js';
import {
  CLASS_INFO, FACTORIES, GOODS, GOOD_IDS, MAX_FACTORY_LEVEL, SOCIAL_PROGRAMS, buildFactory,
  canBuildFactory, educationResearchDiscount, expandFactory, expansionCost, factoryCost,
  factoryMargin, formatPopulation, healthGrowthFactor, modernizeArmy, setFiscalPolicy,
  socialSpendingCost,
} from '../game/economy.js';
import { battlesFor } from '../game/battles.js';

const TITLES = {
  nation: 'Nation Overview',
  construction: 'Construction',
  industry: 'Industry & Factories',
  production: 'Production',
  budget: 'Budget & Society',
  research: 'Research',
  logistics: 'Logistics',
  diplomacy: 'Diplomacy',
  trade: 'Trade',
};

const BRANCHES = [
  ['economy', 'Economy'],
  ['military', 'Military'],
  ['admin', 'Administration'],
];

const BUILDING_CATEGORIES = {
  civilian: 'Civilian',
  industry: 'Industry',
  military: 'Military',
  naval: 'Naval',
  state: 'State',
};
const RESOURCE_ICONS = {
  gold: '⬤',
  food: '🌾',
  timber: '🪵',
  iron: '⛏',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatResources(resources) {
  return Object.entries(resources ?? {})
    .filter(([, amount]) => amount)
    .map(([resource, amount]) => `${amount}${RESOURCE_ICONS[resource] ?? esc(resource)}`)
    .join(' ');
}

function operatingCost(building) {
  return formatResources(building.maintenance ?? { gold: building.upkeep ?? 0 }) || 'none';
}

export class Screens {
  constructor(game) {
    this.game = game;
    this.active = null;
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
    game.on('select', () => {
      if (this.active === 'construction') this.refresh();
    });
    game.on('world', () => this.close());
  }

  get me() {
    return this.game.world?.nations[this.game.turns.playerNation];
  }

  toggle(name) {
    if (this.active === name) this.close();
    else this.open(name);
  }

  open(name) {
    this.active = name;
    document.body.classList.add('screen-open');
    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    for (const btn of document.querySelectorAll('#tab-bar button')) {
      btn.classList.toggle('active', btn.dataset.screen === name);
    }
    this.refresh();
  }

  close() {
    this.active = null;
    document.body.classList.remove('screen-open');
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    for (const btn of document.querySelectorAll('#tab-bar button')) {
      btn.classList.remove('active');
    }
  }

  refresh() {
    if (!this.active || !this.game.world) return;
    const me = this.me;
    this.el.title.textContent = TITLES[this.active] ?? '—';
    this.el.res.innerHTML = me ? this.resourceLine(me) : '';
    this.el.body.innerHTML = me
      ? (this[`render_${this.active}`]?.(me) ?? '')
      : '<p class="empty">Your nation has been eliminated.</p>';
    this.bind();
  }

  resourceLine(me) {
    const net = me.budget?.net ?? {};
    const sign = (v) => `${v >= 0 ? '+' : ''}${Math.round(v ?? 0)}`;
    return `<span>⬤ <b>${Math.round(me.gold)}</b> ${sign(net.gold)}</span>
      <span>🌾 ${sign(net.food)}</span>
      <span>🪵 <b>${Math.round(me.timber)}</b></span>
      <span>⛏ <b>${Math.round(me.iron)}</b></span>
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
    const population = cities.reduce((sum, city) => sum + city.pop, 0);
    const foreign = cities.reduce((sum, city) => sum + foreignPop(city, me.culture), 0);
    const culture = world.cultures[me.culture]?.name ?? 'Unknown';
    const capital = cities.find((city) => city.tile === me.capital) ?? cities[0];
    const wars = world.nations.filter(
      (nation) => nation.alive && nation.id !== me.id && atWar(world, me.id, nation.id),
    );
    const peace = world.nations.filter(
      (nation) => nation.alive && nation.id !== me.id && !atWar(world, me.id, nation.id),
    ).length;
    const roads = world.tiles.filter((tile) => tile.owner === me.id && (tile.roadLevel ?? 0) > 0);
    const roadLevels = roads.reduce((sum, tile) => sum + tile.roadLevel, 0);
    const built = {};
    for (const city of cities) {
      for (const id of city.buildings) built[id] = (built[id] ?? 0) + 1;
    }
    const buildingSummary = Object.entries(built)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${BUILDINGS[id]?.icon ?? '◆'} ${BUILDINGS[id]?.name ?? id} ×${count}`)
      .join(' · ') || 'No national construction yet';

    const board = scoreboard(world);
    const score = board.find((entry) => entry.nation.id === me.id);
    const rank = board.findIndex((entry) => entry.nation.id === me.id) + 1;
    const budget = me.budget;
    const techs = (me.techs ?? []).map((id) => TECHS[id]?.name ?? id).join(' · ') || 'None';
    const foreignPct = population ? Math.round((foreign / population) * 100) : 0;

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
        <div><span>Cities</span><b>${cities.length}</b><small>${population} workers</small></div>
        <div><span>Armed Forces</span><b>${units.length}</b><small>power ${nationStrength(world, me)}</small></div>
        <div><span>Internal Cohesion</span><b>${100 - foreignPct}%</b><small>${foreignPct}% foreign population</small></div>
        <div><span>Infrastructure</span><b>${roads.length}</b><small>${roadLevels} total road levels</small></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>National Economy</h3>
          <small>${budget?.buildings ?? 0} buildings · storage +${budget?.storageBonus ?? 0}</small></div>
        <div class="economy-ledger">
          <span><small>Building operations</small><b>${formatResources(budget?.buildingMaintenance) || 'none'}</b></span>
          <span><small>Road maintenance</small><b>${Math.round(budget?.roadMaintenance ?? 0)} gold</b></span>
          <span><small>Administration</small><b>${(budget?.administration ?? 0).toFixed(1)} gold</b></span>
          <span><small>Research efficiency</small><b>${Math.round((budget?.researchDiscount ?? 0) * 100)}%</b></span>
        </div>
        <table class="data-table">
          <tr><th>resource</th><th class="num">output</th><th class="num">upkeep</th><th class="num">net</th><th class="num">stock</th></tr>
          ${['gold', 'food', 'timber', 'iron'].map((key) => `<tr>
            <td>${key[0].toUpperCase() + key.slice(1)}</td>
            <td class="num">${Math.round(budget?.production?.[key] ?? 0)}</td>
            <td class="num">${Math.round(budget?.upkeep?.[key] ?? 0)}</td>
            <td class="num ${(budget?.net?.[key] ?? 0) < 0 ? 'res-neg' : 'res-pos'}">${(budget?.net?.[key] ?? 0) >= 0 ? '+' : ''}${Math.round(budget?.net?.[key] ?? 0)}</td>
            <td class="num">${key === 'food' ? '—' : Math.round(me[key] ?? 0)}</td>
          </tr>`).join('')}
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Government & Society</h3><small>strategic modifiers</small></div>
        <div class="detail-list">
          <div><span>Capital</span><b>${esc(capital?.name ?? 'Lost')}</b></div>
          <div><span>Infamy</span><b>${Math.round(me.infamy ?? 0)}/${INFAMY_COALITION}</b></div>
          <div><span>Diplomatic Position</span><b>${wars.length ? `${wars.length} wars` : 'At peace'} · ${peace} peaceful relations</b></div>
          <div><span>Research Efficiency</span><b>${Math.round((budget?.researchDiscount ?? 0) * 100)}% cost reduction</b></div>
          <div><span>Army Administration</span><b>−${budget?.armyUpkeepRelief ?? 0} gold upkeep</b></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Technology</h3><small>${(me.techs ?? []).length}/${Object.keys(TECHS).length}</small></div>
        <p class="overview-copy">${esc(techs)}</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>National Construction</h3><small>${roads.length ? (roadLevels / roads.length).toFixed(1) : '0.0'} average road level</small></div>
        <p class="overview-copy">${esc(buildingSummary)}</p>
      </div>`;
  }

  // --- İnşaat: şehir başına bina yuvaları ---
  render_construction(me) {
    const cities = this.myCities(me);
    if (!cities.length) return '<p class="empty">You have no cities.</p>';

    const selected = this.game.selected;
    const canRoad = canBuildRoad(selected, me.id);
    const roadButton = canRoad
      ? `<button class="action wide" data-road="1" ${canAfford(me, roadCost(selected)) ? '' : 'disabled'}>
          Upgrade to ${esc(roadLabel({ roadLevel: (selected.roadLevel ?? 0) + 1 }))} · ${formatCost(roadCost(selected))}
        </button>`
      : '';
    const infrastructure = `<div class="card infrastructure-card">
      <div class="card-head"><h3>Strategic Infrastructure</h3><small>roads reduce land movement cost</small></div>
      ${selected && selected.owner === me.id && selected.terrain.passable
    ? `<div class="detail-list">
          <div><span>Selected Province</span><b>${selected.q}, ${selected.r}</b></div>
          <div><span>Road Network</span><b>${esc(roadLabel(selected))} · level ${selected.roadLevel ?? 0}/${ROAD_MAX_LEVEL}</b></div>
        </div>${roadButton || '<p class="hint">Maximum infrastructure reached.</p>'}`
    : '<p class="overview-copy">Select one of your provinces on the map to construct or upgrade its road network.</p>'}
    </div>`;

    const placed = this.game.world.tiles
      .filter((tile) => tile.structure && tile.owner === me.id)
      .map((tile) => {
        const building = BUILDINGS[tile.structure.buildingId];
        const city = this.game.world.cities.find((item) => item.id === tile.structure.cityId);
        return `<span class="building-chip category-${building?.category ?? 'state'}">
          ${building?.icon ?? '◆'} ${esc(building?.name ?? tile.structure.buildingId)}
          · ${tile.q},${tile.r} · ${esc(city?.name ?? 'province')}
        </span>`;
      }).join('') || '<span class="building-chip empty-chip">No buildings placed on the map yet</span>';

    const options = Object.values(BUILDINGS).map((building) => {
      const placements = buildingPlacementTiles(
        this.game.world, me.id, building.id, WORK_RADIUS,
      );
      const affordable = canAfford(me, building.cost);
      const disabled = placements.size && affordable ? '' : 'disabled';
      const note = !placements.size
        ? 'No eligible province or city slot'
        : `${placements.size} highlighted province${placements.size === 1 ? '' : 's'}`;
      return `<button class="building-option category-${building.category}" data-place-building="${building.id}" ${disabled}>
        <span class="building-icon">${building.icon ?? '◆'}</span>
        <span><b>${esc(building.name)}</b><small>${esc(note)}</small>
          <em>${BUILDING_CATEGORIES[building.category] ?? 'Building'} · investment ${formatCost(building.cost)}</em>
          <span class="building-ledger">
            <i class="ledger-gain">Effect · ${esc(building.desc)}</i>
            <i class="ledger-cost">Operations · ${operatingCost(building)} / week</i>
          </span>
        </span>
      </button>`;
    }).join('');

    return `${infrastructure}
      <div class="card map-construction">
        <div class="card-head"><h3>Place Buildings on the Map</h3>
          <small>choose a building, then click a highlighted province</small></div>
        <div class="building-grid">${options}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Existing Buildings</h3>
          <small>${cities.reduce((sum, city) => sum + city.buildings.length, 0)} total</small></div>
        <div class="building-chips">${placed}</div>
      </div>`;
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
          ${factory.level >= MAX_FACTORY_LEVEL || !canAfford(me, expansionCost(factory)) ? 'disabled' : ''}>
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

  /**
   * Ordu modernizasyonu. Tek seferlik bedelin yanında bakım da kalıcı olarak
   * artar, o yüzden her satırda yeni haftalık gider de gösteriliyor.
   */
  modernizationCard(me, army) {
    const stacks = army.filter((unit) => unit.regiments?.length);
    if (!stacks.length) return '';
    const rows = stacks
      .sort((a, b) => armyTier(a) - armyTier(b) || regimentCount(b) - regimentCount(a))
      .map((unit) => {
        const tier = armyTier(unit);
        const info = tierInfo(tier);
        const cost = modernizeCost(unit);
        const next = tier < MAX_TIER ? tierInfo(tier + 1) : null;
        const action = !next
          ? '<span class="num">fully modern</span>'
          : `<button class="action" data-modernize="${unit.id}" ${canAfford(me, cost) ? '' : 'disabled'}>
              ${next.name} · ${formatCost(cost)}</button>`;
        return `<tr>
          <td>${esc(unit.type.name)} ×${regimentCount(unit)}<small> @${unit.tile.q},${unit.tile.r}</small></td>
          <td class="num">${info.name}</td>
          <td class="num">×${info.power.toFixed(2)}</td>
          <td class="num">${(info.upkeep * regimentCount(unit)).toFixed(1)} ⬤</td>
          <td class="num">${action}</td>
        </tr>`;
      }).join('');
    return `<div class="card">
      <div class="card-head"><h3>Modernization</h3>
        <small>better equipment costs gold up front and permanently raises upkeep</small></div>
      <table class="data-table">
        <tr><th>army</th><th class="num">equipment</th><th class="num">power</th>
          <th class="num">upkeep</th><th class="num">re-equip</th></tr>
        ${rows}
      </table>
    </div>`;
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
          const off = canAfford(me, cost) ? '' : 'disabled';
          return `<button class="action" data-buy="${id}" ${off}>${UNIT_TYPES[id].name} · ${formatCost(cost)}</button>`;
        }).join('');
      return `<div class="card">
        <div class="card-head"><h3>${esc(city.name)}</h3>
          <small>${city.tile.coastal ? 'coastal city' : 'inland city'}</small></div>
        <div class="row-buttons">${buttons}</div>
      </div>`;
    }).join('') : '<p class="empty">You have no cities.</p>';

    const armyGold = Math.round(me.budget?.armyGold ?? army.length);
    return `<div class="card">
        <div class="card-head"><h3>Armed Forces</h3>
          <small>${army.length} units · upkeep ${armyGold} ⬤ / ${me.budget?.army ?? army.length} 🌾</small></div>
        <table class="data-table">
          <tr><th>unit</th><th style="text-align:right">count</th><th style="text-align:right">attack</th><th style="text-align:right">strength</th></tr>
          ${armyRows}
        </table>
      </div>${this.modernizationCard(me, army)}${cityCards}`;
  }

  /**
   * Sosyal harcama kartı. Vergiden farklı olarak bunlar *sürekli* giderdir:
   * nüfusla birlikte büyür, geç oyunda hazinenin asıl çıkışıdır.
   */
  socialCard(me) {
    const economy = me.economy;
    const projected = socialSpendingCost(me);
    const effects = {
      education: `research −${Math.round(educationResearchDiscount(me) * 100)}% · workforce +${Math.round((economy.social.education ?? 0) * 0.25)}%`,
      health: `growth ×${healthGrowthFactor(me).toFixed(2)}`,
      welfare: `satisfaction +${Math.round((economy.social.welfare ?? 0) * 0.14)}%`,
    };
    const sliders = Object.values(SOCIAL_PROGRAMS).map((program) => {
      const level = economy.social[program.id] ?? 0;
      return `<label class="policy-slider"><span>${program.name} <b data-policy-value>${level}%</b></span>
        <input type="range" min="0" max="100" step="10" value="${level}"
          data-policy="social" data-class="${program.id}">
        <small>${esc(program.desc)} Current effect: ${effects[program.id]}.</small>
      </label>`;
    }).join('');
    return `<div class="card policy-card">
      <div class="card-head"><h3>Social Spending</h3>
        <small>projected ¤${projected.toFixed(1)} per week · scales with population</small></div>
      ${sliders}
    </div>`;
  }

  // --- Bütçe: üç sınıfın vergisi, gümrük ve askerî harcama ---
  render_budget(me) {
    const economy = me.economy;
    if (!economy) return '<p class="empty">Fiscal institutions are not initialized.</p>';
    const classCards = Object.entries(CLASS_INFO).map(([id, info]) => {
      const socialClass = economy.classes[id];
      const tax = economy.taxes[id];
      return `<div class="class-card" style="--class-color:${info.color}">
        <div class="card-head"><h3>${esc(info.name)}</h3><small>${formatPopulation(socialClass.population)}</small></div>
        <div class="detail-list">
          <div><span>Income</span><b>¤${socialClass.income.toFixed(1)}</b></div>
          <div><span>Tax paid</span><b>¤${socialClass.taxPaid.toFixed(1)}</b></div>
          <div><span>Satisfaction</span><b>${Math.round(socialClass.satisfaction * 100)}%</b></div>
        </div>
        <label class="policy-slider"><span>Tax rate <b data-policy-value>${tax}%</b></span>
          <input type="range" min="0" max="100" step="5" value="${tax}" data-policy="tax" data-class="${id}">
          <small>Higher tax raises revenue next week, but lowers satisfaction and national stability.</small>
        </label>
      </div>`;
    }).join('');

    return `<div class="fiscal-hero card">
        <div><small>Population</small><b>${formatPopulation(economy.population)}</b></div>
        <div><small>Standard of living</small><b>${economy.standardOfLiving.toFixed(1)}</b></div>
        <div><small>National stability</small><b>${Math.round((economy.stability ?? 0.6) * 100)}%</b></div>
        <div><small>Tax revenue</small><b>+¤${economy.taxRevenue.toFixed(1)}</b></div>
        <div><small>Tariffs</small><b>${economy.tariffRevenue >= 0 ? '+' : ''}¤${economy.tariffRevenue.toFixed(1)}</b></div>
        <div><small>Strategic imports</small><b class="res-neg">−¤${economy.importCost.toFixed(1)}</b></div>
        <div><small>Social spending</small><b class="res-neg">−¤${(economy.socialCost ?? 0).toFixed(1)}</b></div>
      </div>
      <div class="class-grid">${classCards}</div>
      ${this.socialCard(me)}
      <div class="card policy-card">
        <div class="card-head"><h3>National Budget</h3><small>policy changes settle at the next weekly tick</small></div>
        <label class="policy-slider"><span>Tariffs / import subsidies <b data-policy-value>${economy.tariff}%</b></span>
          <input type="range" min="-25" max="50" step="5" value="${economy.tariff}" data-policy="tariff">
          <small>Subsidies improve household affordability. Positive tariffs raise revenue but reduce satisfaction.</small>
        </label>
        <label class="policy-slider"><span>Army maintenance <b data-policy-value>${economy.armySpending}%</b></span>
          <input type="range" min="25" max="100" step="5" value="${economy.armySpending}" data-policy="armySpending">
          <small>Lower funding saves gold but directly reduces army battle strength and arms demand.</small>
        </label>
      </div>`;
  }

  // --- Araştırma: üç dal, dört kademe ---
  render_research(me) {
    const columns = BRANCHES.map(([branch, label]) => {
      const cards = Object.values(TECHS)
        .filter((t) => t.branch === branch)
        .sort((a, b) => a.tier - b.tier)
        .map((t) => {
          const owned = hasTech(me, t.id);
          const open = !owned && canResearch(me, t.id);
          const costValue = researchCost(me, t);
          const affordable = open && canAfford(me, costValue);
          const cls = owned ? 'owned' : affordable ? 'open' : open ? 'unaffordable' : 'locked';
          const cost = owned ? 'researched' : formatCost(costValue);
          const attr = affordable ? `data-tech="${t.id}"` : (!owned ? 'disabled' : '');
          return `<button class="tech-card ${cls}" ${attr}>
            <b>${t.name}</b><small>${esc(t.desc)}</small>
            <div class="tech-cost">${cost}</div>
          </button>`;
        }).join('');
      return `<div><div class="tech-col-head">${label}</div>${cards}</div>`;
    }).join('');

    const known = (me.techs ?? []).length;
    return `<div class="card">
        <div class="card-head"><h3>Technology</h3>
          <small>${known}/${Object.keys(TECHS).length} researched · green = owned, blue = affordable</small></div>
      </div>
      <div class="tech-grid">${columns}</div>`;
  }

  // --- Lojistik: üretim/gider dengesi ve şehir dökümü ---
  render_logistics(me) {
    const world = this.game.world;
    const b = me.budget;
    if (!b) return '<p class="empty">The balance sheet is not available yet.</p>';
    const cap = storageCap(b.cities, me);

    const rows = [
      ['Gold', 'gold', Math.round(me.gold), '—'],
      ['Food', 'food', '—', 'flow'],
      ['Timber', 'timber', Math.round(me.timber), cap],
      ['Iron', 'iron', Math.round(me.iron), cap],
    ].map(([label, key, stock, capText]) => `
      <tr>
        <td>${label}</td>
        <td class="num">${Math.round(b.production[key])}</td>
        <td class="num">${Math.round(b.upkeep[key])}</td>
        <td class="num ${b.net[key] < 0 ? 'res-neg' : ''}">${b.net[key] >= 0 ? '+' : ''}${Math.round(b.net[key])}</td>
        <td class="num">${stock}</td>
        <td class="num">${capText}</td>
      </tr>`).join('');

    const cityRows = this.myCities(me).map((city) => {
      const out = cityProduction(city, world);
      return `<tr>
        <td>${esc(city.name)}</td>
        <td class="num">${city.pop}</td>
        <td class="num">${Math.round(out.food)}</td>
        <td class="num">${Math.round(out.timber)}</td>
        <td class="num">${Math.round(out.iron)}</td>
        <td class="num">${Math.round(out.gold)}</td>
        <td class="num">${Math.floor(city.foodStore)}/${growthCost(city)}</td>
      </tr>`;
    }).join('');

    return `<div class="card">
        <div class="card-head"><h3>Balance Sheet</h3><small>${b.cities} cities · ${b.workers} workers · ${b.army} units</small></div>
        <table class="data-table">
          <tr><th>resource</th><th style="text-align:right">output</th><th style="text-align:right">upkeep</th>
              <th style="text-align:right">net</th><th style="text-align:right">stock</th><th style="text-align:right">capacity</th></tr>
          ${rows}
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Cities</h3><small>output from worked tiles</small></div>
        <table class="data-table">
          <tr><th>city</th><th style="text-align:right">workers</th><th style="text-align:right">🌾</th>
              <th style="text-align:right">🪵</th><th style="text-align:right">⛏</th><th style="text-align:right">⬤</th>
              <th style="text-align:right">growth</th></tr>
          ${cityRows || '<tr><td colspan="7">—</td></tr>'}
        </table>
      </div>`;
  }

  // --- Diplomasi: ilişki listesi ve savaş/barış eylemleri ---
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

    const battleRows = battlesFor(world, me.id).map((battle) => {
      const mineAttacks = battle.attackerNation === me.id;
      const myArmy = world.units.find((army) => army.id === (
        mineAttacks ? battle.attackerId : battle.defenderId
      ));
      const enemyArmy = world.units.find((army) => army.id === (
        mineAttacks ? battle.defenderId : battle.attackerId
      ));
      const enemyId = mineAttacks ? battle.defenderNation : battle.attackerNation;
      const moraleTotal = Math.max(1, moraleOf(myArmy) + moraleOf(enemyArmy));
      const position = Math.max(2, Math.min(98, (moraleOf(myArmy) / moraleTotal) * 100));
      return `<div class="front-card card">
        <div class="card-head"><h3>Battle of ${battle.q}, ${battle.r}</h3>
          <small>round ${battle.rounds}/${6} · province terrain modifies the defender</small></div>
        <div class="front-numbers">
          <span><small>${esc(me.name)}</small><b>${formatPopulation(soldiersOf(myArmy))} · ${Math.round(moraleOf(myArmy))}% morale</b></span>
          <strong>VS</strong>
          <span><small>${esc(world.nations[enemyId].name)}</small><b>${formatPopulation(soldiersOf(enemyArmy))} · ${Math.round(moraleOf(enemyArmy))}% morale</b></span>
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
        <p class="hint">Select an army and tap a destination. Friendly armies merge. Entering an enemy army starts a weekly battle; low morale forces retreat and the winner occupies the province.</p>
      </div>
      ${battleRows || '<div class="card"><p class="empty">No active province battles.</p></div>'}${rows}`;
  }

  // --- Ticaret: Stellaris mantığında küresel arz, talep ve dinamik fiyatlar ---
  render_trade(me) {
    const world = this.game.world;
    const market = world.market;
    if (!market) return '<p class="empty">The world market is not initialized.</p>';
    const rows = GOOD_IDS.map((goodId) => {
      const good = GOODS[goodId];
      const state = market.goods[goodId];
      const trend = state.trend > 0.005 ? '▲' : state.trend < -0.005 ? '▼' : '—';
      const cls = state.trend > 0.005 ? 'res-neg' : state.trend < -0.005 ? 'res-pos' : '';
      const pressure = state.demand - state.supply;
      return `<tr>
        <td><span class="good-name">${good.icon} ${esc(good.name)}</span><small>${good.category}</small></td>
        <td class="num"><b>¤${state.price.toFixed(2)}</b></td>
        <td class="num ${cls}">${trend} ${Math.abs(state.trend).toFixed(2)}</td>
        <td class="num">${state.supply.toFixed(1)}</td>
        <td class="num">${state.demand.toFixed(1)}</td>
        <td class="num ${pressure > 0 ? 'res-neg' : 'res-pos'}">${pressure >= 0 ? '+' : ''}${pressure.toFixed(1)}</td>
        <td class="num">${(me.economy?.inventory?.[goodId] ?? 0).toFixed(1)}</td>
      </tr>`;
    }).join('');
    const hottest = GOOD_IDS.map((id) => market.goods[id])
      .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply))[0];

    return `<div class="market-hero card">
        <div><small>World market GDP</small><b>¤${Math.round(market.totalGdp)}</b></div>
        <div><small>Tariff policy</small><b>${me.economy?.tariff ?? 0}%</b></div>
        <div><small>Highest pressure</small><b>${GOODS[hottest.id].icon} ${esc(GOODS[hottest.id].name)}</b></div>
      </div>
      <div class="card market-card">
        <div class="card-head"><h3>Global Prices</h3>
          <small>every purchase adds demand; scarcity raises the next weekly price</small></div>
        <table class="data-table market-table">
          <tr><th>good</th><th class="num">price</th><th class="num">week</th>
            <th class="num">sell</th><th class="num">buy</th><th class="num">pressure</th><th class="num">our output</th></tr>
          ${rows}
        </table>
      </div>`;
  }

  /** Ekranlardaki eylemleri oyunun mevcut fonksiyonlarına bağlar. */
  bind() {
    const { game } = this;
    const me = this.me;
    if (!me) return;

    for (const btn of this.el.body.querySelectorAll('[data-build]')) {
      btn.onclick = () => {
        const city = game.world.cities.find((c) => c.id === Number(btn.dataset.city));
        if (city) game.turns.build(city, btn.dataset.build);
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-place-building]')) {
      btn.onclick = () => {
        if (game.beginBuildingPlacement(btn.dataset.placeBuilding)) this.close();
      };
    }
    const road = this.el.body.querySelector('[data-road]');
    if (road) {
      road.onclick = () => {
        if (game.turns.buildRoad(game.selected, me.id)) this.refresh();
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
    for (const btn of this.el.body.querySelectorAll('[data-modernize]')) {
      btn.onclick = () => {
        const unit = game.world.units.find((u) => u.id === Number(btn.dataset.modernize));
        if (unit && modernizeArmy(game, me, unit)) this.refresh();
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
    for (const btn of this.el.body.querySelectorAll('[data-tech]')) {
      btn.onclick = () => {
        if (research(me, btn.dataset.tech)) {
          game.turns.addLog(`${TECHS[btn.dataset.tech].name} researched.`, { kind: 'RESEARCH' });
          game.recomputeEconomy();
          this.refresh();
        }
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
