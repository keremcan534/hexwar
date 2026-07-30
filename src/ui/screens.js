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
  BUILDINGS, buildingSlots, buildingStatus,
} from '../game/buildings.js';
import {
  TECHS, canResearch, hasTech, research, researchCost,
} from '../game/tech.js';
import { MIN_WAR_TURNS, atWar, nationStrength, relation, truceLeft } from '../game/diplomacy.js';
import { GOOD_PRICE, TRADE_GOODS, canTrade } from '../game/trade.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { UNIT_TYPES } from '../game/units.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { HEGEMONY_TARGET, scoreboard } from '../game/hegemony.js';
import {
  ROAD_MAX_LEVEL, canBuildRoad, roadCost, roadLabel,
} from '../game/infrastructure.js';

const TITLES = {
  nation: 'Nation Overview',
  construction: 'Construction',
  production: 'Production',
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

const GOOD_NAMES = { timber: 'Timber', iron: 'Iron' };
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
    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    for (const btn of document.querySelectorAll('#tab-bar button')) {
      btn.classList.toggle('active', btn.dataset.screen === name);
    }
    this.refresh();
  }

  close() {
    this.active = null;
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
        <div><span>Territory</span><b>${me.tiles}</b><small>hexes</small></div>
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
          <div><span>Selected Hex</span><b>${selected.q}, ${selected.r}</b></div>
          <div><span>Road Network</span><b>${esc(roadLabel(selected))} · level ${selected.roadLevel ?? 0}/${ROAD_MAX_LEVEL}</b></div>
        </div>${roadButton || '<p class="hint">Maximum infrastructure reached.</p>'}`
    : '<p class="overview-copy">Select one of your land hexes on the map to construct or upgrade its road network.</p>'}
    </div>`;

    const cityCards = cities.map((city) => {
      const slots = buildingSlots(me, city);
      const built = city.buildings.map((id) => (
        `<span class="building-chip category-${BUILDINGS[id]?.category ?? 'state'}">${BUILDINGS[id]?.icon ?? '◆'} ${esc(BUILDINGS[id]?.name ?? id)}</span>`
      )).join('') || '<span class="building-chip empty-chip">Empty building queue</span>';
      const options = Object.values(BUILDINGS)
        .filter((building) => !city.buildings.includes(building.id))
        .map((building) => {
          const status = buildingStatus(this.game.world, city, building.id, WORK_RADIUS);
          const affordable = canAfford(me, building.cost);
          const disabled = status.ok && affordable ? '' : 'disabled';
          const note = status.ok ? 'Available for construction' : status.reason;
          return `<button class="building-option category-${building.category}" data-build="${building.id}" data-city="${city.id}" ${disabled}>
            <span class="building-icon">${building.icon ?? '◆'}</span>
            <span><b>${esc(building.name)}</b><small>${esc(note)}</small>
              <em>${BUILDING_CATEGORIES[building.category] ?? 'Building'} · investment ${formatCost(building.cost)}</em>
              <span class="building-ledger">
                <i class="ledger-gain">Effect · ${esc(building.desc)}</i>
                <i class="ledger-cost">Operations · ${operatingCost(building)} / turn</i>
              </span>
            </span>
          </button>`;
        }).join('');

      return `<div class="card city-construction">
        <div class="card-head">
          <h3>${esc(city.name)}</h3>
          <small>${city.buildings.length}/${slots} slots · ${city.pop} workers</small>
        </div>
        <div class="building-chips">${built}</div>
        <div class="building-grid">${options || '<span class="empty">Every available building has been constructed.</span>'}</div>
      </div>`;
    }).join('');
    return infrastructure + cityCards;
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

    return `<div class="card">
        <div class="card-head"><h3>Armed Forces</h3><small>${army.length} units · upkeep ${army.length} ⬤ / ${army.length} 🌾</small></div>
        <table class="data-table">
          <tr><th>unit</th><th style="text-align:right">count</th><th style="text-align:right">attack</th><th style="text-align:right">strength</th></tr>
          ${armyRows}
        </table>
      </div>${cityCards}`;
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
            <div class="meta">${n.tiles} hexes · power ratio ${ratio} · infamy ${Math.round(n.infamy ?? 0)}</div>
          </div>
          ${action}
        </div>
      </div>`;
    }).join('');

    return `<div class="card">
        <div class="card-head"><h3>${esc(me.name)}</h3>
          <small>infamy ${Math.round(me.infamy ?? 0)}/${INFAMY_COALITION} · coalition at ${INFAMY_COALITION}</small></div>
      </div>${rows}`;
  }

  // --- Ticaret: fazla/açık ve ortaklar ---
  render_trade(me) {
    const world = this.game.world;
    const partners = world.nations.filter((n) => n.alive && n.id !== me.id
      && !atWar(world, n.id, me.id) && canTrade(n) && canTrade(me));

    const balance = TRADE_GOODS.map((good) => {
      const mine = Math.round(me[good]);
      const state = mine > 12 ? 'surplus' : mine < 12 ? 'shortage' : 'balanced';
      return `<tr><td>${GOOD_NAMES[good]}</td><td class="num">${mine}</td>
        <td>${state}</td><td class="num">${GOOD_PRICE[good]} ⬤</td></tr>`;
    }).join('');

    const partnerRows = partners.length ? partners.map((n) => {
      const flows = TRADE_GOODS.map((good) => {
        const diff = Math.round(n[good]) - Math.round(me[good]);
        if (Math.abs(diff) < 4) return null;
        return diff > 0 ? `can supply ${GOOD_NAMES[good]}` : `can buy ${GOOD_NAMES[good]}`;
      }).filter(Boolean).join(' · ');
      return `<div class="card"><div class="rel-row">
        <img class="flag" src="${flagDataUrl(n)}" alt="">
        <div class="grow">
          <div class="name">${esc(n.name)}</div>
          <div class="meta">🪵 ${Math.round(n.timber)} · ⛏ ${Math.round(n.iron)}${flows ? ` · ${flows}` : ''}</div>
        </div>
      </div></div>`;
    }).join('') : `<p class="empty">${canTrade(me) ? 'No eligible trade partners at peace.' : `Your infamy is too high (${Math.round(me.infamy)}); no nation will trade with you.`}</p>`;

    return `<div class="card">
        <div class="card-head"><h3>Resource Balance</h3><small>trade flows automatically from surplus to shortage</small></div>
        <table class="data-table">
          <tr><th>good</th><th style="text-align:right">stock</th><th>status</th><th style="text-align:right">unit price</th></tr>
          ${balance}
        </table>
      </div>
      <div class="card"><div class="card-head"><h3>Trade Partners</h3><small>${partners.length} nations</small></div></div>
      ${partnerRows}`;
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
    for (const btn of this.el.body.querySelectorAll('[data-tech]')) {
      btn.onclick = () => {
        if (research(me, btn.dataset.tech)) {
          game.turns.addLog(`${TECHS[btn.dataset.tech].name} researched.`);
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
