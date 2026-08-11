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
import {
  MAX_DEMAND_TILES, PEACE_TERMS, canConcedeTile, canDemandTile, offerCost,
  offerRefusal, signPeace, termAvailable, tileKey, tileWarCost, warScore,
} from '../game/peace.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import {
  UNIT_TYPES, maxHpOf, organizationOf, soldiersOf, unitAvailable,
} from '../game/units.js';
import { provinceName } from '../game/provinces.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { hegemonyScore, scoreboard } from '../game/hegemony.js';
import { factoryOptionCard } from './factoryCard.js';
import { factoryEmblem, resourceGlyph } from './icons/index.js';
import {
  CLASS_INFO, CLASS_PROFESSIONS, FACTORIES, GOODS, GOOD_IDS, MAX_FACTORY_LEVEL,
  MILITARY_EQUIPMENT, POPULATION_COHORT, PROFESSION_INFO,
  SOCIAL_PROGRAMS, buildFactory,
  canBuildFactory, factoriesInRegion, factoryAtlas, factoryCost, factoryJobs,
  debtCapacity, debtInterestRate, factoryMargin, formatPopulation, populationOf,
  setFiscalPolicy, taxEfficiency,
  setMilitaryProductionLine, socialSpendingCost, ensureProductionLine, supportProject, upgradeOutlook,
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

/** Victoria 2'nin mal blokları. GOODS[].category ile eşleşir. */
const GOOD_CATEGORIES = {
  raw: 'Raw Materials',
  industrial: 'Industrial Goods',
  consumer: 'Consumer Goods',
  military: 'Military Goods',
  luxury: 'Luxury Goods',
};

const TITLES = {
  nation: 'Nation Overview',
  construction: 'Construction',
  industry: 'Factories',
  production: 'Production',
  budget: 'Budget',
  population: 'Population',
  politics: 'Politics',
  peace: 'Peace Talks',
  logistics: 'Logistics',
  diplomacy: 'Diplomacy',
  dossier: 'Foreign Power',
  trade: 'Trade',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Defter piktogramları: tek renk, 16px, sekme çubuğuyla aynı çizgi dili.
 * Emoji değil — referans ekrandaki küçük sınıf/kurum figürlerinin karşılığı.
 */
const PICTO_SHELL = (inner) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const PICTO = {
  lower: PICTO_SHELL('<circle cx="6" cy="4.5" r="1.8"/><path d="M3.5 13v-3.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5V13M11 4l2 9M10 6.5l3-1"/>'),
  middle: PICTO_SHELL('<circle cx="8" cy="5" r="1.8"/><path d="M5.5 3.2h5M5 13v-3c0-1.7 1.3-3 3-3s3 1.3 3 3v3M8 8.5v3"/>'),
  upper: PICTO_SHELL('<path d="M5.5 4.5V2.5h5v2M4.5 4.5h7M5 13v-3c0-1.7 1.3-3 3-3s3 1.3 3 3v3M11.5 9.5l1.5 3.5"/>'),
  soldier: PICTO_SHELL('<circle cx="8" cy="5" r="1.8"/><path d="M5.5 3h5M5 13v-3c0-1.7 1.3-3 3-3s3 1.3 3 3v3M12 4v9"/>'),
  stockpile: PICTO_SHELL('<path d="M2.5 9h5v4.5h-5zM8.5 9h5v4.5h-5zM5.5 4.5h5V9h-5z"/><path d="M8 4.5V9M5 11h0M11 11h0"/>'),
  document: PICTO_SHELL('<path d="M4.5 2.5h5l2.5 2.5v8.5h-7.5z"/><path d="M9.5 2.5V5H12M6 8h4M6 10.5h4"/>'),
  book: PICTO_SHELL('<path d="M8 4c-1.2-1-3-1.2-5-1v9c2-.2 3.8 0 5 1 1.2-1 3-1.2 5-1V3c-2-.2-3.8 0-5 1z"/><path d="M8 4v9"/>'),
  health: PICTO_SHELL('<path d="M8 13.5S3 10 3 6.4C3 4.5 4.4 3 6.2 3 7 3 7.6 3.4 8 4c.4-.6 1-1 1.8-1C11.6 3 13 4.5 13 6.4c0 3.6-5 7.1-5 7.1z"/>'),
  welfare: PICTO_SHELL('<path d="M2.5 9.5c2 0 3-1 4.5-1s2.5.8 4 .8M11 9.3l2.5-1.1M4 13h8M7 4a1.6 1.6 0 1 0 2 0l-1-1z"/>'),
  construction: PICTO_SHELL('<path d="M2.5 13.5h11M4 13.5V8l4-3 4 3v5.5M6.5 13.5v-3h3v3"/>'),
  factory: PICTO_SHELL('<path d="M2 13.5h12M3 13.5V7l3 2V7l3 2V4.5h3v9M5 11h1M8 11h1"/>'),
  city: PICTO_SHELL('<path d="M2 13.5h12M3.5 13.5V6l3-2.5L9.5 6v7.5M11 13.5V8h2.5v5.5M5.5 8.5h2M5.5 11h2"/>'),
  crate: PICTO_SHELL('<path d="M3 5.5h10v7.5H3z"/><path d="M3 5.5l1.5-2h7l1.5 2M8 5.5V13M3 9h10"/>'),
};

/**
 * Sosyal programın defterdeki payı. Toplam socialCost gerçek; program başına
 * bölüşüm seviye oranıyla yapılır (ayrı ayrı ölçülmüyor). Kabuk aşaması için
 * yeterli — üç kaydıraç da aynı gerçek toplamı paylaşır.
 */
function socialShare(me, programId) {
  const social = me.economy?.social ?? {};
  const total = Object.values(SOCIAL_PROGRAMS)
    .reduce((sum, program) => sum + (social[program.id] ?? 0), 0);
  if (total <= 0) return 0;
  return (me.economy.ledger?.socialCost ?? 0) * ((social[programId] ?? 0) / total);
}

/** Bütçe: bu hafta ithal edilen askeri mallar — "ammunition 4.2 · fuel 2.0". */
function strategicImportNote(me) {
  const military = me.economy?.military ?? {};
  const items = Object.entries(MILITARY_EQUIPMENT)
    .map(([id, type]) => ({ name: type.name, amount: military[`${id}Imported`] ?? 0 }))
    .filter((row) => row.amount > 0.05)
    .map((row) => `${row.name.toLowerCase()} ${row.amount.toFixed(1)}`);
  return items.length
    ? `this week: ${items.join(' · ')}`
    : 'buys critical equipment abroad when stock runs short';
}

/** Bütçe: sübvanse edilen tesisler — "3 plants: Steel Mill −3.7 …". */
function subsidyNote(me) {
  const rows = (me.economy?.factories ?? [])
    .filter((factory) => factory.subsidized)
    .map((factory) => ({
      name: FACTORIES[factory.typeId]?.name ?? factory.typeId,
      paid: factory.subsidyPaid ?? 0,
    }))
    .sort((a, b) => b.paid - a.paid);
  if (!rows.length) return '';
  const top = rows.slice(0, 3)
    .map((row) => `${row.name} −${row.paid.toFixed(1)}`).join(' · ');
  return `${rows.length} subsidised ${rows.length === 1 ? 'plant' : 'plants'}: ${top}`;
}

export class Screens {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.previousMapMode = null;
    this.constructionType = null;
    this.industryTab = 'plants';
    this.industryPicker = null;
    this.tradeGood = null;
    this.peaceTarget = null;
    this.nationTarget = null;
    this.peaceTab = 'take';
    this.peaceSelection = { demands: new Set(), concessions: new Set(), terms: new Set() };
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
    game.on('peace', () => this.refresh());
    // Haritada yabancı toprağa sağ tık: o ülkenin paneli açılır.
    game.on('nation', (nationId) => this.openDossier(nationId));
    game.on('construction', () => this.refresh());
    game.on('select', (tile) => {
      if (this.active === 'peace') {
        this.pickPeaceTile(tile);
        return;
      }
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
    // Baris kipi de haritayi ele gecirir; ekrandan cikarken geri verilmeli.
    if ((this.active === 'construction' || this.active === 'peace') && name !== this.active) {
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
    if (this.active === 'construction' || this.active === 'peace') this.restoreMapMode();
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
    // Sanayi ekranı Victoria 2 gibi alt sekmelidir: başlık şeridi kaynak
    // satırı yerine sekmeleri taşır, böylece tesisler ve şantiyeler tek uzun
    // sayfada alt alta kaydırılmak yerine ayrı pencerelerde durur.
    this.el.res.innerHTML = !me ? ''
      : this.active === 'industry' ? this.industryTabs(me)
        : this.active !== 'construction' ? this.resourceLine(me) : '';
    this.el.body.innerHTML = me
      ? (this[`render_${this.active}`]?.(me) ?? '')
      : '<p class="empty">Your nation has been eliminated.</p>';
    this.bind();
    for (const btn of this.el.res.querySelectorAll('[data-industry-tab]')) {
      btn.onclick = () => {
        this.industryTab = btn.dataset.industryTab;
        this.refresh();
      };
    }
  }

  /**
   * Seçili malın dünya tablosu: kim üretiyor, biz neredeyiz. Fiyatın neden
   * tavanda ya da tabanda olduğunu ancak üretimin kimde toplandığını görerek
   * anlayabiliyorsun; bu panel o soruyu cevaplar.
   */
  goodDetail(me, world) {
    const goodId = this.tradeGood;
    const good = GOODS[goodId];
    if (!good) {
      return `<aside class="good-detail empty-detail">
        <p class="empty">Select a good to see who produces it.</p></aside>`;
    }
    const state = world.market.goods[goodId];
    const rows = world.nations
      .filter((nation) => nation.alive && nation.economy?.goodsFlow?.[goodId])
      .map((nation) => ({
        nation,
        production: nation.economy.goodsFlow[goodId].production ?? 0,
        demand: nation.economy.goodsFlow[goodId].demand ?? 0,
      }))
      .sort((a, b) => b.production - a.production);
    const worldProduction = rows.reduce((sum, row) => sum + row.production, 0);
    const mineIndex = rows.findIndex((row) => row.nation.id === me.id);
    const mine = rows[mineIndex];
    const share = (value) => (worldProduction > 0
      ? `${((value / worldProduction) * 100).toFixed(1)}%` : '—');
    const line = (row, rank) => `<div class="good-rank ${row.nation.id === me.id ? 'me' : ''}">
      <span class="rank-no">${rank}</span>
      <span class="rank-name">${esc(row.nation.name)}</span>
      <span class="rank-out">${row.production.toFixed(1)}</span>
      <span class="rank-share">${share(row.production)}</span>
    </div>`;
    const top = rows.slice(0, 5).map((row, index) => line(row, index + 1)).join('');
    // Oyuncu ilk beşte değilse kendi satırı ayrıca en alta eklenir.
    const own = mine && mineIndex >= 5 ? line(mine, mineIndex + 1) : '';
    const flow = me.economy?.goodsFlow?.[goodId] ?? {};
    const ratio = state.price / good.basePrice;
    const pinned = ratio >= 7.9 ? 'at the price ceiling — severe shortage'
      : ratio <= 0.13 ? 'at the price floor — nobody wants it' : '';
    return `<aside class="good-detail">
      <div class="good-detail-head"><b>${good.icon} ${esc(good.name)}</b>
        <span>¤${state.price.toFixed(2)} <small>${ratio.toFixed(2)}× base</small></span></div>
      ${pinned ? `<p class="res-warn good-pinned">${pinned}</p>` : ''}
      ${this.priceChart(state, good)}
      <div class="good-detail-kpis">
        <span><small>World supply</small><b>${state.supply.toFixed(1)}</b></span>
        <span><small>World demand</small><b>${state.demand.toFixed(1)}</b></span>
        <span><small>Your output</small><b>${(flow.production ?? 0).toFixed(1)}</b></span>
        <span><small>Your need</small><b>${(flow.demand ?? 0).toFixed(1)}</b></span>
        <span><small>Your share</small><b>${share(mine?.production ?? 0)}</b></span>
        <span><small>Your rank</small><b>${mineIndex >= 0 ? `${mineIndex + 1}/${rows.length}` : '—'}</b></span>
      </div>
      <div class="good-rank-head"><span>#</span><span>Top producers</span><span>out</span><span>share</span></div>
      ${top || '<p class="empty">Nobody produces this yet.</p>'}
      ${own}
    </aside>`;
  }

  /**
   * Fiyat grafiği. Tek bir anlık fiyat "pahalı mı ucuz mu" sorusunu cevaplar
   * ama "yükseliyor mu düşüyor mu" sorusunu cevaplamaz; karar için gereken
   * ikincisidir. Taban fiyat kesikli çizgi olarak referans verir.
   */
  priceChart(state, good) {
    const history = state.history ?? [];
    if (history.length < 2) return '<p class="empty price-chart-empty">Price history builds up as weeks pass.</p>';
    const base = good.basePrice;
    const max = Math.max(base, ...history);
    const min = Math.min(base, ...history);
    const span = Math.max(1e-6, max - min);
    const w = 240;
    const h = 46;
    const x = (i) => (i / (history.length - 1)) * w;
    const y = (value) => h - ((value - min) / span) * h;
    const line = history.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    const rising = history[history.length - 1] >= history[0];
    return `<svg class="price-chart ${rising ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}"
      role="img" aria-label="Price over the last ${history.length} weeks">
      <line class="price-base" x1="0" x2="${w}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}"></line>
      <path class="price-area" d="${area}"></path>
      <path class="price-line" d="${line}"></path>
    </svg>
    <div class="price-chart-foot"><small>${history.length} weeks</small>
      <small>base ¤${base}</small></div>`;
  }

  /**
   * Tek ülkenin paneli. Haritada yabancı toprağa sağ tıklayınca (ya da kare
   * bilgi kartındaki düğmeyle) açılır: diplomasi artık menüde aranmıyor,
   * ilgilendiğin ülkeye dokunarak geliyor.
   */
  openDossier(nationId) {
    this.nationTarget = nationId;
    this.open('dossier');
  }

  /**
   * Ülke paneli. Vic2'nin ülke kartındaki bilgi düzenini izler: kimlik,
   * sıralamalı puanlar, nüfus, ilişki durumu, sonra eylemler. Eylem listesi
   * oyunda gerçekten var olan diplomasi kadardır — ittifak/nüfuz alanı gibi
   * mekanikler henüz yok, olmayan düğme koymuyoruz.
   */
  render_dossier(me) {
    const world = this.game.world;
    const target = world.nations[this.nationTarget];
    if (!target?.alive) {
      return '<p class="empty">Right-click a foreign province on the map to open its dossier.</p>';
    }
    const turn = this.game.turns.turn;
    const war = atWar(world, me.id, target.id);
    const truce = truceLeft(world, me.id, target.id, turn);
    const rec = relation(world, me.id, target.id);
    const locked = war && turn - rec.since < MIN_WAR_TURNS;
    const board = scoreboard(world);
    const rankOf = (id) => board.findIndex((row) => row.nation.id === id) + 1;
    const score = hegemonyScore(world, target);
    const myPower = nationStrength(world, me);
    const power = nationStrength(world, target);
    const ratio = power > 0 ? (myPower / power).toFixed(2) : '∞';
    const cities = world.cities.filter((city) => city.nationId === target.id).length;
    const factories = (target.economy?.factories ?? []).reduce((s, f) => s + f.level, 0);
    const party = rulingParty(target);
    const offer = this.game.peaceOffers.find(
      (entry) => entry.from === target.id && entry.to === me.id,
    );

    const status = war ? '<span class="tag war">at war</span>'
      : truce ? `<span class="tag truce">truce ${truce}w</span>`
        : '<span class="tag peace">at peace</span>';

    return `<div class="card nation-dossier">
      <div class="dossier-head">
        <img class="nation-flag-large" src="${flagDataUrl(target)}" alt="">
        <div class="grow">
          <h2>${esc(target.name)} ${status}</h2>
          <div class="dossier-sub">${esc(party?.name ?? 'No government')}
            · infamy ${Math.round(target.infamy ?? 0)}/${INFAMY_COALITION}</div>
        </div>
        <div class="dossier-rank"><small>rank</small><b>#${rankOf(target.id)}</b></div>
      </div>
      <div class="dossier-scores">
        <span><small>Total</small><b>${score.total}</b></span>
        <span><small>Economy</small><b>${score.economy}</b></span>
        <span><small>Prestige</small><b>${score.prestige}</b></span>
        <span><small>Power ratio</small><b class="${myPower >= power ? 'res-pos' : 'res-neg'}">${ratio}</b></span>
      </div>
      <div class="dossier-facts">
        <div><span>Population</span><b>${formatPopulation(populationOf(world, target))}</b></div>
        <div><span>Provinces</span><b>${target.tiles}</b></div>
        <div><span>Cities</span><b>${cities}</b></div>
        <div><span>Industry</span><b>${factories} levels</b></div>
      </div>
    </div>
    ${offer ? this.peaceOfferCard(offer) : ''}
    <div class="card">
      <div class="card-head"><h3>Diplomacy</h3>
        <small>${war ? 'a treaty is negotiated province by province at the peace table'
    : truce ? 'a truce forbids a new declaration until it lapses'
      : 'declaring war costs infamy for every province you take'}</small></div>
      <div class="row-buttons dossier-actions">
        ${war
    ? `<button class="action" data-peace="${target.id}" ${locked ? 'disabled' : ''}>Peace Talks${locked ? ` (${MIN_WAR_TURNS - (turn - rec.since)}w)` : ''}</button>`
    : `<button class="action" data-war="${target.id}" ${truce ? 'disabled' : ''}>Declare War</button>`}
        <button class="action" data-locate="${target.id}">Show on map</button>
      </div>
    </div>`;
  }

  /** Barış görüşmesini açar ve haritayı seçim kipine alır. */
  openPeaceTalks(targetId) {
    this.peaceTarget = targetId;
    this.peaceTab = 'take';
    this.peaceSelection = { demands: new Set(), concessions: new Set(), terms: new Set() };
    this.previousMapMode ??= this.game.renderer.mapMode;
    this.game.renderer.setPeaceMode(
      this.game.turns.playerNation, targetId, this.peaceSelection,
    );
    this.game.requestRender();
    this.open('peace');
  }

  /**
   * Haritadan kare seçimi. Hangi listeye gireceğini açık sekme belirler;
   * aynı kareye tekrar tıklamak seçimi kaldırır.
   */
  pickPeaceTile(tile) {
    const me = this.me;
    if (!tile || !me || this.peaceTarget == null) return;
    const key = tileKey(tile);
    const take = this.peaceTab !== 'give';
    const set = take ? this.peaceSelection.demands : this.peaceSelection.concessions;
    const allowed = take
      ? canDemandTile(tile, this.peaceTarget)
      : canConcedeTile(tile, me.id);
    if (!allowed) return;
    if (set.has(key)) set.delete(key);
    else set.add(key);
    this.game.renderer.updatePeaceSelection(this.peaceSelection);
    this.game.requestRender();
    this.refresh();
  }

  /**
   * Barış masası. Harita bir seçim yüzeyine döner: karşı tarafın toprağı
   * kırmızı, istediklerin yeşil, verdiklerin turuncu. Her karenin bir bedeli
   * vardır ve toplam bedel warscore'unu aşamaz (bkz. peace.js).
   */
  render_peace(me) {
    const world = this.game.world;
    const target = world.nations[this.peaceTarget];
    if (!target || !atWar(world, me.id, target.id)) {
      return '<p class="empty">Select an active war from the war bar to open peace talks.</p>';
    }
    const selection = this.peaceSelection;
    const offer = {
      demands: [...selection.demands],
      concessions: [...selection.concessions],
      terms: [...selection.terms],
    };
    const score = warScore(world, me.id, target.id);
    const cost = offerCost(world, offer);
    const refusal = offerRefusal(world, me.id, target.id, offer);
    const acceptable = refusal === null;
    const budget = Math.max(0, score);
    const list = (keys, kind) => (keys.length ? keys.map((key) => {
      const [q, r] = key.split(':').map(Number);
      const tile = world.get(q, r);
      return `<div class="peace-tile ${kind}">
        <span>${esc(provinceName(tile))}${tile?.city ? ' ★' : ''}</span>
        <b>${tileWarCost(tile)}</b>
        <button class="peace-drop" data-drop-tile="${esc(key)}" data-drop-kind="${kind}" title="Remove">✕</button>
      </div>`;
    }).join('') : '<p class="empty">Click provinces on the map.</p>');

    const tab = ['give', 'terms'].includes(this.peaceTab) ? this.peaceTab : 'take';
    return `<div class="card peace-head">
      <div class="peace-score">
        <span><small>War score against ${esc(target.name)}</small>
          <b class="${score >= 0 ? 'res-pos' : 'res-neg'}">${score >= 0 ? '+' : ''}${score}</b></span>
        <span><small>Demanded</small><b>${cost}</b></span>
        <span><small>Budget</small><b>${budget}</b></span>
      </div>
      <div class="meter peace-meter"><i class="${cost > budget ? 'over' : ''}"
        style="width:${budget > 0 ? Math.min(100, (cost / budget) * 100).toFixed(1) : (cost > 0 ? 100 : 0)}%"></i></div>
      <p class="hint ${acceptable ? '' : 'res-warn'}">${acceptable
    ? 'They will sign this treaty.' : esc(refusal)}</p>
      <div class="row-buttons">
        <button class="action" data-sign-peace="1" ${acceptable ? '' : 'disabled'}>
          ${offer.demands.length || offer.concessions.length ? 'Sign treaty' : 'Sign white peace'}</button>
        <button class="action" data-clear-peace="1">Clear</button>
      </div>
    </div>
    <div class="sub-tabs peace-tabs">
      <button data-peace-tab="take" class="${tab === 'take' ? 'active' : ''}">Demand<em>${offer.demands.length}</em></button>
      <button data-peace-tab="give" class="${tab === 'give' ? 'active' : ''}">Concede<em>${offer.concessions.length}</em></button>
      <button data-peace-tab="terms" class="${tab === 'terms' ? 'active' : ''}">Terms<em>${offer.terms.length}</em></button>
    </div>
    <div class="card">
      <div class="card-head"><h3>${tab === 'take' ? `Demands from ${esc(target.name)}`
    : tab === 'give' ? 'Provinces you offer' : 'Additional terms'}</h3>
        <small>${tab === 'take'
    ? `click their red provinces on the map · at most ${MAX_DEMAND_TILES} provinces per treaty`
    : tab === 'give' ? 'giving land lowers the price of the treaty'
      : 'terms that do not move borders'}</small></div>
      ${tab === 'terms' ? this.peaceTermList(world, me, target)
    : tab === 'take' ? list(offer.demands, 'take') : list(offer.concessions, 'give')}
    </div>`;
  }

  /** Toprak dışı şartlar. Uygulanamayanlar sebebiyle birlikte kapalı görünür. */
  peaceTermList(world, me, target) {
    return Object.values(PEACE_TERMS).map((term) => {
      const picked = this.peaceSelection.terms.has(term.id);
      const usable = termAvailable(world, me.id, target.id, term.id);
      const why = term.id === 'VASSALIZE'
        ? 'They are not weak enough to vassalise.'
        : 'They have no foreign-culture provinces.';
      return `<button class="peace-term ${picked ? 'picked' : ''}" data-peace-term="${term.id}"
        ${usable ? '' : 'disabled'} title="${esc(usable ? term.desc : why)}">
        <span class="peace-term-icon">${term.icon}</span>
        <span class="peace-term-body"><b>${esc(term.name)}</b>
          <small>${esc(usable ? term.desc : why)}</small></span>
        <span class="peace-term-cost">${term.cost}</span>
      </button>`;
    }).join('');
  }

  /**
   * Masaya düşen YZ teklifi. Oyuncunun kendi masasında gördüğü bilgilerin
   * aynısını gösterir — ne alınıyor, ne veriliyor, karşılığında hangi şartlar —
   * yoksa "kabul et" kör bir bahis olur.
   */
  peaceOfferCard(entry) {
    const world = this.game.world;
    const from = world.nations[entry.from];
    const offer = entry.offer;
    const tileLine = (keys, label) => (keys?.length ? `<div class="offer-line">
      <small>${label}</small><span>${keys.map((key) => {
    const [q, r] = key.split(':').map(Number);
    const tile = world.get(q, r);
    return `${esc(provinceName(tile))}${tile?.city ? ' ★' : ''} (${tileWarCost(tile)})`;
  }).join(' · ')}</span></div>` : '');
    const terms = offer.terms?.length ? `<div class="offer-line"><small>Terms</small>
      <span>${offer.terms.map((id) => `${PEACE_TERMS[id].icon} ${esc(PEACE_TERMS[id].name)}`)
    .join(' · ')}</span></div>` : '';
    const white = !offer.demands?.length && !offer.concessions?.length && !terms;
    // Teklifin bedeli oyuncunun gözünden: pozitif sayı "bu kadarını veriyorum".
    const cost = offerCost(world, offer);
    return `<div class="card peace-offer">
      <div class="card-head"><h3>${esc(from.name)} proposes peace</h3>
        <small>their war score ${warScore(world, entry.from, this.me.id)} · costs you ${cost}</small></div>
      ${white ? '<p class="hint">A white peace: the borders stay exactly where they are.</p>' : ''}
      ${tileLine(offer.demands, 'They annex')}
      ${tileLine(offer.concessions, 'They cede to us')}
      ${terms}
      <div class="row-buttons">
        <button class="action" data-accept-offer="${entry.id}">Accept terms</button>
        <button class="action" data-reject-offer="${entry.id}">Fight on</button>
      </div>
    </div>`;
  }

  /** Sanayi ekranının alt sekmeleri. Vic2'deki gibi sayı rozetiyle. */
  industryTabs(me) {
    const building = ensureConstruction(me).projects.filter(
      (project) => project.kind && project.kind !== 'building',
    ).length;
    const tabs = [
      ['plants', 'Factories', me.economy?.factories?.length ?? 0],
      ['projects', 'Under Construction', building],
    ];
    return `<div class="sub-tabs">${tabs.map(([id, label, count]) => `
      <button data-industry-tab="${id}" class="${this.industryTab === id ? 'active' : ''}">
        ${label}<em>${count}</em></button>`).join('')}</div>`;
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
        <div><span>Hegemony</span><b>${score?.total ?? 0}</b><small>Rank ${rank || '—'} · leader ${board[0]?.total ?? 0}</small></div>
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
      // Kuyrukta artık fabrika ve seviye projeleri de var; tip araması iki
      // tabloya birden bakmalı, yoksa sanayi projesi ekranı çökertir.
      const type = CONSTRUCTION_TYPES[project.typeId] ?? FACTORIES[project.typeId]
        ?? { name: project.typeId, icon: '🏭' };
      const work = project.work ?? type.cost ?? 1;
      const remaining = Math.max(0, work - project.progress);
      cumulative += remaining;
      const eta = Math.max(1, Math.ceil(cumulative / Math.max(1, power)));
      const percent = Math.min(100, Math.round((project.progress / work) * 100));
      const label = project.kind === 'upgrade' ? `${type.name} expansion` : type.name;
      return `<div class="construction-project">
        <strong>${index + 1}</strong><i>${type.icon}</i>
        <span><b>${esc(label)}</b><small>${esc(project.regionName ?? '')} · about ${eta} week${eta === 1 ? '' : 's'}</small>
          <span class="construction-project-bar"><i style="width:${percent}%"></i><em>${Math.round(project.progress)} / ${Math.round(work)}</em></span>
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

  /**
   * Sanayi ekranı state eksenlidir: her state'te türü başına tek tesis olur ve
   * o tesis kadrosunu doldurdukça kendi kendine seviye atlar. Oyuncunun tek
   * kararı nereye ne dikeceği; büyüme kararı ekonomiye aittir.
   */
  render_industry(me) {
    const world = this.game.world;
    const economy = me.economy;
    if (!economy) return '<p class="empty">This nation has no economy.</p>';
    const { atlas, regions } = factoryAtlas(world, me.id);
    const byRegion = new Map(atlas.regions.map((region) => [region.id, []]));
    for (const [factory, region] of regions) byRegion.get(region.id)?.push(factory);
    // İşgal altındaki state atlasa girmez; oradaki tesis yok sayılmamalı, yoksa
    // ülke toprağını geri alana kadar sanayisini ekranda hiç göremez.
    // İşgal altındaki state atlasa girmez. Oradaki tesisleri ayrı bir bölüme
    // sürmek yerine aynı tabloda kırmızı isimle göster: sanayi tek listede kalsın.
    const stranded = economy.factories.filter((factory) => !regions.has(factory));
    const occupied = new Map();
    for (const factory of stranded) {
      const tile = world.get(factory.q, factory.r);
      const name = tile ? provinceName(tile) : 'Lost territory';
      if (!occupied.has(name)) occupied.set(name, []);
      occupied.get(name).push(factory);
    }
    if (!atlas.regions.length && !stranded.length) {
      return '<p class="empty">No industry yet, and no state is under your control.</p>';
    }

    const totalLevels = economy.factories.reduce((sum, factory) => sum + factory.level, 0);
    const employed = economy.factories.reduce((sum, factory) => sum + factory.employees, 0);
    const lower = economy.classes.lower.population;
    const rules = factoryInvestmentRules(me);
    // Tek şerit özet: rakamlar yan yana, açıklama hover'da. Ayrı kart + başlık
    // + paragraf, ekranın üçte birini tek cümle için harcıyordu.
    const summary = `<div class="industry-summary"
      title="Factories hire once a month from the lower class. A plant that fills every post and turns a profit upgrades itself; an unprofitable one sheds workers.">
      <span><small>levels</small><b>${totalLevels}</b></span>
      <span><small>workers</small><b>${formatPopulation(employed)}</b></span>
      <span><small>of lower class</small><b>${lower ? ((employed / lower) * 100).toFixed(1) : '0.0'}%</b></span>
      <span><small>hired/month</small><b class="res-pos">+${formatPopulation(economy.industrialHiring ?? 0)}</b></span>
      <span><small>¤/week</small><b class="${economy.factoryProfit >= 0 ? 'res-pos' : 'res-neg'}">${economy.factoryProfit >= 0 ? '+' : ''}${(economy.factoryProfit ?? 0).toFixed(1)}</b></span>
      <span class="industry-policy">${esc(policyLabel('economy', rules.policy))} · upgrades by ${
  rules.privateExpand && rules.stateExpand ? 'private capital, then treasury'
    : rules.privateExpand ? 'private capital' : rules.stateExpand ? 'treasury' : 'nobody'
}</span>
    </div>`;

    // Victoria 2 düzeni: her state tek bir satırdır — solda adı ve sayıları,
    // sağda o state'teki tesisler yan yana kutucuklar halinde.
    const slots = Object.keys(FACTORIES).length;
    const stateRows = atlas.regions.map((region) => {
      const built = byRegion.get(region.id) ?? [];
      const staff = built.reduce((sum, factory) => sum + factory.employees, 0);
      const profit = built.reduce((sum, factory) => sum + factory.profit, 0);
      const tiles = built.map((factory) => this.factoryTile(me, factory)).join('');
      // Tür sayısı 29'a çıkınca her satıra yirmi küsur soluk boş kutu dizmek
      // satırı okunmaz hale getiriyordu. Yerine tek bir "+" durur; seçim
      // ayrı bir pencerede, zinciri ve maliyeti okunur şekilde yapılır.
      const free = Object.values(FACTORIES).filter(
        (type) => !built.some((factory) => factory.typeId === type.id),
      );
      const options = free.length
        ? `<button class="factory-slot add" data-add-region="${esc(region.id)}"
            title="Build a new industry in ${esc(region.name)} — ${free.length} types available">+</button>`
        : '';
      // Sütun başlıkları satırın üstünde bir kez duruyor; hücrede birim
      // tekrarlamak satır yüksekliğini iki katına çıkarıyordu.
      return `<div class="state-row">
        <div class="state-cell state-name">${esc(region.name)}</div>
        <div class="state-cell num dim">${formatPopulation(region.population)}</div>
        <div class="state-cell num">${built.length}/${slots}</div>
        <div class="state-cell num">${formatPopulation(staff)}</div>
        <div class="state-cell num ${profit >= 0 ? 'res-pos' : 'res-neg'}">${profit >= 0 ? '+' : ''}${profit.toFixed(1)}</div>
        <div class="state-slots">${tiles}${options}</div>
      </div>`;
    }).join('');

    const occupiedRows = [...occupied].map(([name, built]) => {
      const staff = built.reduce((sum, factory) => sum + factory.employees, 0);
      const profit = built.reduce((sum, factory) => sum + factory.profit, 0);
      return `<div class="state-row" title="Occupied — these plants keep producing, but you cannot invest here until the state is back under your control.">
        <div class="state-cell state-name res-neg">${esc(name)}</div>
        <div class="state-cell num dim">—</div>
        <div class="state-cell num">${built.length}</div>
        <div class="state-cell num">${formatPopulation(staff)}</div>
        <div class="state-cell num ${profit >= 0 ? 'res-pos' : 'res-neg'}">${profit >= 0 ? '+' : ''}${profit.toFixed(1)}</div>
        <div class="state-slots">${built.map((factory) => this.factoryTile(me, factory)).join('')}</div>
      </div>`;
    }).join('');

    const stateCards = `<div class="industry-states">
      <div class="state-row state-head">
        <div class="state-cell">State</div>
        <div class="state-cell num">Pop</div>
        <div class="state-cell num">Plants</div>
        <div class="state-cell num">Workers</div>
        <div class="state-cell num">¤/week</div>
        <div class="state-slots">Industry</div>
      </div>
      ${stateRows}${occupiedRows}
    </div>`;

    // Özet her sekmede kalır; altında yalnız seçili panel çizilir.
    if (this.industryTab === 'projects') return summary + this.industryProjects(me);
    return summary + this.factoryPicker(me, world) + stateCards;
  }

  /**
   * "+" ile açılan tesis seçimi. Izgaradaki kutucuk yalnız ikon taşıyabilir;
   * hangi tesisin ne tükettiğine burada, tam adı ve zinciriyle bakılır.
   */
  factoryPicker(me, world) {
    if (!this.industryPicker) return '';
    const region = constructionAtlas(world, me.id).regions
      .find((candidate) => candidate.id === this.industryPicker);
    if (!region) return '';
    const existing = factoriesInRegion(world, me.id, region.id).map((f) => f.typeId);
    const stateMayBuild = factoryInvestmentRules(me).stateBuild;
    // Oyun verisi kart sözleşmesine burada çevrilir; görsel tamamen
    // factoryCard.js'te yaşar (bkz. oradaki sözleşme notu).
    const options = Object.values(FACTORIES)
      .filter((type) => !existing.includes(type.id))
      .map((type) => {
        const enabled = canBuildFactory(world, me, region.id, type.id);
        const cost = factoryCost(me, type.id);
        // Gri bir düğme sebebini söylemezse oyuncu neyi bekleyeceğini bilemez.
        const blocked = enabled ? '' : !stateMayBuild ? 'policy forbids state industry'
          : me.gold < (cost.gold ?? 0) ? `treasury short by ¤${Math.ceil((cost.gold ?? 0) - me.gold)}`
            : 'unavailable';
        const io = (table) => Object.entries(table)
          .map(([id, amount]) => ({ id, name: GOODS[id].name, amount }));
        return factoryOptionCard({
          typeId: type.id,
          name: type.name,
          cost: cost.gold ?? 0,
          inputs: io(type.inputs),
          outputs: io(type.outputs),
          perLevel: factoryMargin(world, type.id),
          blocked,
          region: region.id,
        });
      }).join('');
    // Popup: "+" ekranın üstünde açılınca sürekli kaydırmak gerekiyordu.
    // Kaplama tıklaması da kapatır (bkz. bindScreenActions).
    return `<div class="picker-overlay" data-picker-overlay="1">
      <div class="card factory-picker">
        <div class="card-head"><h3>Build in ${esc(region.name)}</h3>
          <small>treasury ¤${Math.round(me.gold)} · ${esc(policyLabel('economy', factoryInvestmentRules(me).policy))}</small>
          <button class="action" data-close-picker="1">Close</button></div>
        <div class="fcard-grid">${options || '<p class="empty">Every industry is already present here.</p>'}</div>
      </div>
    </div>`;
  }

  /**
   * Kurulmakta olan tesisler. Kapitalist projeleri Victoria 2'deki gibi para
   * biriktirerek ilerler; oyuncu hazineden destek vererek hızlandırabilir.
   */
  industryProjects(me) {
    const projects = ensureConstruction(me).projects.filter(
      (project) => project.kind && project.kind !== 'building',
    );
    if (!projects.length) {
      return `<div class="card"><p class="empty">Nothing under construction.
        Start a plant from the Factories tab, or wait for private investors.</p></div>`;
    }
    const rows = projects.map((project) => {
      const type = FACTORIES[project.typeId];
      const built = Math.round((project.progress / project.work) * 100);
      const paid = project.cost > 0 ? Math.round((project.funded / project.cost) * 100) : 100;
      const owed = Math.max(0, project.cost - project.funded);
      const isPrivate = project.actor === 'private';
      // Para bekleyen proje inşaat gücü alsa da ilerleyemez; oyuncuya neyi
      // beklediğini söylemek, boşuna kuyruk sırası değiştirmesini önler.
      const waiting = owed > 0 && project.progress >= project.work * (project.funded / Math.max(1, project.cost));
      return `<div class="industry-project ${waiting ? 'stalled' : ''}">
        <span class="project-icon">${factoryEmblem(project.typeId, Object.keys(type?.outputs ?? {})[0] ?? null)}</span>
        <span class="project-name"><b>${esc(type?.name ?? project.typeId)}</b>
          <small>${project.kind === 'upgrade' ? 'expansion' : 'new plant'} · ${esc(project.regionName ?? '')} · ${isPrivate ? 'private' : 'state'}</small></span>
        <span class="project-meters">
          <span class="meter" title="Construction ${built}%"><i style="width:${Math.min(100, built)}%"></i></span>
          <span class="meter funding" title="Funding ${paid}%"><i style="width:${Math.min(100, paid)}%"></i></span>
        </span>
        <span class="project-owed">${owed > 0 ? `¤${owed.toFixed(0)} short` : 'fully funded'}</span>
        ${owed > 0 && isPrivate ? `<button class="action project-support" data-support="${project.id}"
          ${me.gold <= 0 ? 'disabled' : ''}
          title="Click to contribute a quarter of what is missing. Shift+click to pay as much of it as the treasury allows.">¤ support</button>` : '<span></span>'}
      </div>`;
    }).join('');
    return `<div class="card industry-projects">
      <div class="card-head"><h3>Under construction</h3>
        <small>national construction power ${constructionPower(me).toFixed(0)}/week</small></div>
      ${rows}
    </div>`;
  }

  /**
   * Victoria 2'nin fabrika kutucuğu: ikon, köşede seviye, altında istihdam
   * çubuğu ve haftalık kâr. Ayrıntı hover'daki başlıkta durur — ızgara tek
   * bakışta "hangi tesis dolu, hangisi para kaybediyor" sorusunu cevaplar.
   */
  factoryTile(me, factory) {
    const type = FACTORIES[factory.typeId];
    const jobs = factoryJobs(factory);
    const employment = jobs ? (factory.employees / jobs) * 100 : 0;
    const outlook = upgradeOutlook(me, factory);
    const profitable = factory.profit >= 0;
    const chain = `${Object.entries(type.inputs).map(([id, amount]) => `${amount} ${GOODS[id].name}`).join(' + ') || 'nothing'} → ${Object.entries(type.outputs).map(([id, amount]) => `${amount} ${GOODS[id].name}`).join(' + ')}`;
    const status = outlook.maxed ? 'Fully developed'
      : factory.profit < 0 ? 'Losing money, sheds workers'
        : !outlook.profitable ? 'Idle'
          : !outlook.ready ? 'Hiring'
            : outlook.funded ? `Upgrading to level ${factory.level + 1}`
              : `Full staff, waiting for ${formatCost(outlook.cost)}`;
    // Victoria 2 kutucuğunun düzeni: üstte seviye + ürettiği mal, altında
    // tükettiği malların ikonları, onun altında her girdinin tedarik çubuğu,
    // en altta haftalık kâr. Çubuk kısaysa o girdi bulunamıyor demektir.
    // Emoji yerine birleşik ikon sistemi: silah fabrikası seçili hattın
    // ekipman ikonunu, digerleri ürünün madalyonunu/glifini gösterir.
    const outputs = factory.typeId === 'ARMS_FACTORY'
      ? [resourceGlyph(factory.lineEquipment ?? 'arms')]
      : Object.keys(type.outputs).map((id) => resourceGlyph(id));
    const inputs = Object.keys(type.inputs);
    const supplyOf = (goodId) => {
      const flow = me.economy?.goodsFlow?.[goodId];
      if (!flow || !(flow.demand > 0)) return 1;
      return Math.max(0, Math.min(1, (flow.fulfilled ?? 0) / flow.demand));
    };
    const inputIcons = inputs.map((id) => `<i>${resourceGlyph(id)}</i>`).join('') || '<i>·</i>';
    const inputBars = inputs.map((id) => {
      const supply = supplyOf(id);
      return `<i class="${supply < 0.75 ? 'short' : ''}" style="height:${Math.round(supply * 100)}%"
        title="${esc(GOODS[id].name)} supply ${Math.round(supply * 100)}%"></i>`;
    }).join('') || '<i style="height:100%"></i>';
    return `<div class="factory-slot ${profitable ? 'profitable' : 'unprofitable'}"
      title="${esc(type.name)} · level ${factory.level}/${MAX_FACTORY_LEVEL} · ${formatPopulation(factory.employees)}/${formatPopulation(jobs)} workers&#10;${esc(chain)}&#10;${esc(status)}">
      <span class="factory-slot-head"><i class="factory-level">${factory.level}</i>
        <b>${outputs.join('')}</b></span>
      <span class="factory-goods">${inputIcons}</span>
      <span class="factory-supply">${inputBars}</span>
      <span class="meter"><i style="width:${Math.max(0, Math.min(100, employment))}%"></i></span>
      <span class="factory-slot-profit ${profitable ? 'res-pos' : 'res-neg'}">${profitable ? '+' : ''}${factory.profit.toFixed(1)}</span>
      <button class="factory-subsidy${factory.subsidized ? ' on' : ''}"
        data-subsidize="${esc(factory.id)}"
        title="${factory.subsidized
    ? `Subsidised — treasury covered −¤${(factory.subsidyPaid ?? 0).toFixed(1)} this week. Click to stop.`
    : 'Subsidise: the treasury covers this plant’s losses so it keeps its workers.'}">¤</button>
    </div>`;
  }

  factoryRow(me, factory) {
    const type = FACTORIES[factory.typeId];
    const jobs = factoryJobs(factory);
    const employment = jobs ? (factory.employees / jobs) * 100 : 0;
    const outlook = upgradeOutlook(me, factory);
    const profitable = factory.profit >= 0;
    const inputs = Object.entries(type.inputs)
      .map(([id, amount]) => `${amount} ${GOODS[id].icon}`).join(' ') || '—';
    const outputs = Object.entries(type.outputs)
      .map(([id, amount]) => `${amount} ${GOODS[id].icon}`).join(' ');
    // Tesisin bir sonraki adımı: neyi beklediğini açıkça söyle ki oyuncu
    // büyümeyen fabrikanın sebebini ekranda görsün.
    const status = outlook.maxed ? 'Fully developed'
      : factory.profit < 0 ? 'Losing money — no investor will expand it'
        : !outlook.profitable ? 'Idle — no output priced yet'
          : !outlook.ready ? `Hiring · ${formatCost(outlook.cost)} needed at full staff`
            : outlook.funded ? `Upgrading to level ${factory.level + 1} this month`
              : `Full staff · waiting for ${formatCost(outlook.cost)}`;
    return `<div class="factory-card ${profitable ? 'profitable' : 'unprofitable'}">
      <div class="factory-head"><span>${type.icon} <b>${esc(type.name)}</b></span>
        <em>level ${factory.level}${outlook.maxed ? '' : `/${MAX_FACTORY_LEVEL}`}</em></div>
      <div class="factory-kpis">
        <span><small>Workers</small><b>${formatPopulation(factory.employees)} / ${formatPopulation(jobs)}</b></span>
        <span><small>Weekly profit</small><b class="${profitable ? 'res-pos' : 'res-neg'}">${profitable ? '+' : ''}¤${factory.profit.toFixed(1)}</b></span>
        <span><small>Margin</small><b>${Math.round(factory.margin * 100)}%</b></span>
      </div>
      <div class="factory-chain"><span>${esc(inputs)}</span><strong>→</strong><span>${esc(outputs)}</span></div>
      <div class="meter"><i style="width:${Math.max(0, Math.min(100, employment))}%"></i></div>
      <small class="factory-status">${esc(status)}</small>
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

    // Tek seferrar liste. Eskiden bu butonlar her şehir için ayrı ayrı
    // basılıyordu — oysa `buyUnit` şehir almaz, alayın çıkacağı province'i
    // recruitment kendisi seçer. Aynı beş düğmeyi on kez göstermek ekranı
    // bitmeyen bir kaydırmaya çeviriyordu.
    const hasCoast = cities.some((city) => city.tile.coastal);
    const recruitButtons = Object.entries(UNIT_COSTS).map(([id, cost]) => {
      const type = UNIT_TYPES[id];
      if (type.domain === 'sea' && !hasCoast) return '';
      const locked = !unitAvailable(id, this.game.turns.turn);
      const off = !locked && canAfford(me, cost) && canRecruit(world, me, id) ? '' : 'disabled';
      // Kilitli kol neden kurulamadığını söylesin: yıl gelmemiş demektir.
      const note = locked
        ? `<small class="res-warn">unlocked in ${1836 + Math.floor((type.availableFrom - 1) * 7 / 365)}</small>`
        : `<small>${formatCost(cost)} · ${equipmentCostLabel(id)}</small>`;
      return `<button class="action recruit-option" data-buy="${id}" ${off}>
        <b>${esc(type.name)}</b><small>${formatPopulation(type.manpower)} men</small>${note}
      </button>`;
    }).join('');
    const cityCards = cities.length ? `<div class="card">
      <div class="card-head"><h3>Mobilization</h3>
        <small>recruits are drawn from the most populous province; naval units need a coastal city</small></div>
      <div class="recruit-grid">${recruitButtons}</div>
    </div>` : '<p class="empty">You have no cities.</p>';
    const mobilizationCard = '';

    const militaryFactories = (me.economy?.factories ?? [])
      .filter((factory) => factory.typeId === 'ARMS_FACTORY')
      .map((factory) => ensureProductionLine(factory));
    const armsRegions = factoryAtlas(world, me.id).regions;
    const lineRows = militaryFactories.map((factory) => {
      const region = armsRegions.get(factory);
      const equipment = MILITARY_EQUIPMENT[factory.lineEquipment];
      const efficiency = Math.round(factory.lineEfficiency * 100);
      const inputs = Math.round((factory.inputFulfillment ?? 1) * 100);
      const choices = Object.values(MILITARY_EQUIPMENT).map((candidate) => `
        <button class="production-choice ${candidate.id === equipment.id ? 'active' : ''}"
          data-production-line="${factory.id}" data-equipment="${candidate.id}"
          ${candidate.id === equipment.id ? 'disabled' : ''}>${candidate.icon} ${esc(candidate.name)}</button>`).join('');
      return `<div class="production-line-row">
        <div class="production-line-head"><span><b>${equipment.icon} ${esc(equipment.name)}</b>
          <small>${esc(region?.name ?? 'Unassigned state')} · level ${factory.level} · inputs ${inputs}%</small></span>
          <strong>${((factory.lineOutput ?? 0) / 7).toFixed(2)}/day</strong></div>
        <div class="line-efficiency"><i style="width:${efficiency}%"></i><span>efficiency ${efficiency}%</span></div>
        <div class="production-choices">${choices}</div>
      </div>`;
    }).join('');
    // Fabrika kurmak buradan kaldırıldı: sanayi yatırımı artık tek bir yerde,
    // Factories ekranında yapılır. Bu ekran orduyu toplar ve silahlandırır.
    const productionLinesCard = `<div class="card production-lines-card">
      <div class="card-head"><h3>Military Production Lines</h3>
        <small>efficiency rises while a line stays on the same equipment</small></div>
      ${lineRows || '<p class="empty">No Arms Industry is producing military equipment. Build one from the Factories screen.</p>'}
      <p class="hint">Switching equipment resets that factory line to 50% efficiency.</p>
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
  /**
   * Bütçe — Vic2 defter düzeninin katı yeniden kuruluşu (yapı referans,
   * sanat bizim koyu/pirinç dilimiz). Sol sütun: gelir + ulusal banka.
   * Sağ sütun: gider + tarife/ticaret + öngörülen bakiye. Yoğunluk hedefi:
   * 1080p'de kaydırmasız tek pano. Kabuk aşaması — hesap değişmedi, bütün
   * değerler mevcut defterden okunur.
   */
  render_budget(me) {
    const economy = me.economy;
    if (!economy) return '<p class="empty">Fiscal institutions are not initialized.</p>';
    const ledger = economy.ledger?.lastUpdated ? economy.ledger : { net: 0 };
    const limits = fiscalPolicyLimits(me);
    const money = (value) => `${value >= 0 ? '+' : '−'}¤${Math.abs(value).toFixed(1)}`;

    // Değer kutusu: gömme parşömen alan, tabular rakam.
    const vbox = (value, tone = null) => {
      const cls = tone ?? (value > 0.05 ? 'pos' : value < -0.05 ? 'neg' : '');
      return `<span class="vbox ${cls}">${Math.abs(value).toFixed(1)}¤</span>`;
    };

    // Tarihi kaydıraç: pirinç ray + uç kapaklarını sarmalayıcı çizer,
    // data-policy mevcut bağlayıcıya aynen gider.
    const hslider = (policy, current, min, max, step = 5, classId = null) => `
      <span class="hslider"><i class="cap"></i><input type="range"
        min="${min}" max="${max}" step="${step}" value="${current}"
        data-policy="${policy}" ${classId ? `data-class="${classId}"` : ''}><i class="cap"></i></span>`;

    // Sınıf vergi satırı: pasta + piktogram + kaydıraç + değer kutusu.
    const taxRow = (classId, label, picto) => {
      const socialClass = economy.classes[classId];
      const total = Math.max(1, Object.values(economy.classes)
        .reduce((sum, c) => sum + c.population, 0));
      const share = (socialClass.population / total) * 100;
      const info = CLASS_INFO[classId];
      return `<div class="ledger-row tax">
        <i class="ledger-pie" style="background:conic-gradient(${info.color} 0 ${share.toFixed(1)}%, #10181c ${share.toFixed(1)}% 100%)"
          title="${share.toFixed(1)}% of population"></i>
        <span class="ledger-picto">${picto}</span>
        <span class="ledger-mid">
          <span class="ledger-label">${esc(label)}<b>${economy.taxes[classId]}%</b></span>
          ${hslider('tax', economy.taxes[classId], 0, 100, 5, classId)}
        </span>
        ${vbox(socialClass.taxPaid ?? 0, 'pos')}
      </div>`;
    };

    // Gider satırı: piktogram + kaydıraç (varsa) + bağlam notu + değer kutusu.
    const expRow = (label, value, options = {}) => {
      const { policy = null, current = 0, min = 0, max = 100, classId = null,
        note = '', picto = '' } = options;
      return `<div class="ledger-row">
        <span class="ledger-picto">${picto}</span>
        <span class="ledger-mid">
          <span class="ledger-label">${esc(label)}${policy ? `<b>${current}%</b>` : ''}</span>
          ${policy ? hslider(policy, current, min, max, 5, classId) : ''}
          ${note ? `<small class="ledger-note">${note}</small>` : ''}
        </span>
        ${vbox(-Math.abs(value), value > 0.05 ? 'neg' : '')}
      </div>`;
    };

    const supply = Math.round((economy.military?.supplyIndex ?? 1) * 100);
    const trade = economy.trade ?? {};

    return `<div class="ledger">
      <section class="ledger-col">
        <header class="ledger-head">Weekly Income</header>
        ${taxRow('lower', 'Tax (Lower)', PICTO.lower)}
        ${taxRow('middle', 'Tax (Middle)', PICTO.middle)}
        ${taxRow('upper', 'Tax (Upper)', PICTO.upper)}
        <div class="ledger-row">
          <span class="ledger-picto">${PICTO.city}</span>
          <span class="ledger-mid"><span class="ledger-label">Provinces &amp; Cities</span>
            <small class="ledger-note">crown land, customs houses, city trade</small></span>
          ${vbox(ledger.cityRevenue ?? 0, 'pos')}
        </div>
        ${(ledger.treatyRevenue ?? 0) > 0 ? `<div class="ledger-row">
          <span class="ledger-picto">${PICTO.document}</span>
          <span class="ledger-mid"><span class="ledger-label">War reparations</span></span>
          ${vbox(ledger.treatyRevenue, 'pos')}
        </div>` : ''}
        <div class="ledger-total"><span>Total income</span>
          <span class="vbox pos big">${(ledger.income ?? 0).toFixed(1)}¤</span></div>

        <header class="ledger-head sub">National Bank</header>
        <div class="bank-rows">
          <div class="bank-line"><span>Treasury</span><b>¤${Math.round(me.gold)}</b>
            <span>Available credit</span><b>¤${Math.round(Math.max(0, debtCapacity(me) - (me.debt ?? 0)))}</b></div>
          <div class="bank-line"><span>Total debt</span>
            <b class="${(me.debt ?? 0) > 0 ? 'neg' : ''}">¤${Math.round(me.debt ?? 0)}</b>
            <span>Interest</span><b>${(debtInterestRate(me) * 100).toFixed(1)}%</b></div>
          <table class="bank-table">
            <tr><th>Creditor</th><th>Amount</th></tr>
            ${(me.debt ?? 0) > 0
    ? `<tr><td>National bond issue</td><td>¤${Math.round(me.debt)}</td></tr>`
    : '<tr><td class="dim" colspan="2">No outstanding loans</td></tr>'}
          </table>
          <div class="bank-buttons">
            <button class="action" disabled title="Borrowing is automatic: deficits draw on credit, surpluses repay.">Take Loan</button>
            <button class="action" disabled title="Repayment is automatic from surplus above the cushion.">Repay Loan</button>
          </div>
        </div>
      </section>

      <section class="ledger-col">
        <header class="ledger-head">Weekly Expenses</header>
        ${expRow('Industrial Subsidies', ledger.subsidyCost ?? 0, {
    picto: PICTO.factory,
    note: subsidyNote(me) || 'mark plants on the Factories screen to cover their losses',
  })}
        ${expRow('Military Procurement', ledger.procurementCost ?? 0, {
    policy: 'militaryProcurement',
    current: economy.militaryProcurement ?? 100,
    min: limits.armySpendingMin,
    max: limits.armySpendingMax,
    picto: PICTO.stockpile,
    note: `army supply ${supply}% · reinforcement ${Math.round(Math.max(25, economy.militaryProcurement ?? 100) * Math.max(0.4, (economy.military?.supplyIndex ?? 1)))}%`,
  })}
        ${expRow('Military Wages', ledger.armyCost ?? 0, {
    policy: 'militaryWages',
    current: economy.militaryWages ?? 100,
    min: limits.armySpendingMin,
    max: limits.armySpendingMax,
    picto: PICTO.soldier,
    note: `combat power ${Math.round(55 + (economy.militaryWages ?? 100) * 0.45)}% · recovery ${Math.round((0.6 + 0.4 * (economy.militaryWages ?? 100) / 100) * 100)}%`,
  })}
        ${expRow('Administration', ledger.administrationCost ?? 0, {
    policy: 'adminFunding',
    current: economy.adminFunding ?? 100,
    min: 30,
    max: 100,
    picto: PICTO.document,
    note: `tax efficiency ${Math.round(taxEfficiency(me) * 100)}%`,
  })}
        ${expRow('Education', socialShare(me, 'education'), {
    policy: 'social',
    classId: 'education',
    current: economy.social.education ?? 0,
    picto: PICTO.book,
    note: 'schools qualify workers; universities amplify it',
  })}
        ${expRow('Public Health', socialShare(me, 'health'), {
    policy: 'social',
    classId: 'health',
    current: economy.social.health ?? 0,
    picto: PICTO.health,
    note: 'supports population growth',
  })}
        ${expRow('Welfare', socialShare(me, 'welfare'), {
    policy: 'social',
    classId: 'welfare',
    current: economy.social.welfare ?? 0,
    picto: PICTO.welfare,
    note: 'subsidises the household basket of the poor',
  })}
        ${expRow('Construction', (ledger.constructionCost ?? 0) + (ledger.projectCost ?? 0), {
    picto: PICTO.construction,
    note: (ledger.projectCost ?? 0) > 0
      ? `sectors −${(ledger.constructionCost ?? 0).toFixed(1)} · projects −${ledger.projectCost.toFixed(1)}`
      : 'sector upkeep of the build queue',
  })}
        ${expRow('Strategic Imports', ledger.importCost ?? 0, {
    picto: PICTO.crate, note: strategicImportNote(me),
  })}
        ${(ledger.outlayCost ?? 0) > 0 ? expRow('State purchases', ledger.outlayCost, {
    picto: PICTO.crate, note: 'units raised, cities founded this week',
  }) : ''}
        ${(ledger.interestCost ?? 0) > 0 ? expRow('Debt Interest', ledger.interestCost, {
    picto: PICTO.document,
    note: `debt ¤${Math.round(ledger.debt ?? 0)} at ${(debtInterestRate(me) * 100).toFixed(1)}%/year`,
  }) : ''}
        ${(ledger.treatyCost ?? 0) > 0 ? expRow('Treaty obligations', ledger.treatyCost, {
    picto: PICTO.document, note: 'reparations imposed at a peace table',
  }) : ''}
        <div class="ledger-total"><span>Total expenses</span>
          <span class="vbox neg big">${(ledger.expenses ?? 0).toFixed(1)}¤</span></div>

        <header class="ledger-head sub">Tariffs</header>
        <div class="ledger-row">
          <span class="ledger-picto">${PICTO.crate}</span>
          <span class="ledger-mid">
            <span class="ledger-label">Tariffs<b>${economy.tariff}%</b></span>
            ${hslider('tariff', economy.tariff, limits.tariffMin, limits.tariffMax)}
            <small class="ledger-note">${economy.tariff >= 0
    ? `import prices +${economy.tariff}% · protects domestic industry`
    : `treasury subsidises imports by ${-economy.tariff}%`}</small>
          </span>
          ${vbox(ledger.tariffRevenue ?? 0)}
        </div>
        <div class="trade-mini">
          <span>Imports <b class="neg">−¤${(trade.importValue ?? 0).toFixed(1)}</b></span>
          <span>Exports <b class="pos">+¤${(trade.exportValue ?? 0).toFixed(1)}</b></span>
          <span>Net <b class="${(trade.balance ?? 0) >= 0 ? 'pos' : 'neg'}">${money(trade.balance ?? 0)}</b></span>
        </div>
        ${this.warBudgetPanel(me, ledger)}
        <div class="ledger-balance">
          <span>Projected weekly balance</span>
          <span class="vbox ${ledger.net >= 0 ? 'pos' : 'neg'} hero">${money(ledger.net ?? 0)}</span>
        </div>
      </section>
    </div>`;
  }

  warBudgetPanel(me, ledger) {
    const economy = me.economy;
    const limits = fiscalPolicyLimits(me);
    if (!this.warBudgetOpen) {
      return `<div class="row-buttons fiscal-war-row">
        <button class="action" data-war-budget-open="1">War Budget…</button>
      </div>`;
    }
    const proposal = {
      militaryWages: limits.armySpendingMax,
      militaryProcurement: limits.armySpendingMax,
      welfare: Math.min(economy.social.welfare ?? 0, 30),
      education: Math.min(economy.social.education ?? 0, 60),
      tariff: Math.max(economy.tariff, Math.min(limits.tariffMax, 25)),
    };
    // Gercek degisiklik listesi. "Apply hicbir sey yapmadi" en sik sikayetti:
    // maas/tedarik zaten tavandaysa ve sosyal zaten sifirsa oneri no-op olur —
    // bunu soylemek yerine sessiz kalmak "calismiyor" hissi veriyordu.
    const current = {
      militaryWages: economy.militaryWages ?? 100,
      militaryProcurement: economy.militaryProcurement ?? 100,
      welfare: economy.social.welfare ?? 0,
      education: economy.social.education ?? 0,
      tariff: economy.tariff,
    };
    const labels = {
      militaryWages: 'Military wages',
      militaryProcurement: 'Military procurement',
      welfare: 'Welfare',
      education: 'Education',
      tariff: 'Tariffs',
    };
    const changes = Object.keys(proposal)
      .filter((key) => proposal[key] !== current[key]);

    // Tahmin: mevcut defter kalemleri yeni orana dogrusal olceklenir; savas
    // temposu (0.35 -> 1) tedarige uygulanir. Bu bir niyet tahminidir.
    const scaleOr = (cost, from, to) => (from > 0 ? cost * (to / from) : cost);
    const wagesCost = scaleOr(ledger.armyCost ?? 0, current.militaryWages, proposal.militaryWages);
    const procurementCost = scaleOr(ledger.procurementCost ?? 0,
      current.militaryProcurement, proposal.militaryProcurement)
      / (this.atWarNow(me) ? 1 : 0.35);
    const socialNow = ledger.socialCost ?? 0;
    const socialScale = ((proposal.welfare + proposal.education + (economy.social.health ?? 0))
      / Math.max(1, current.welfare + current.education + (economy.social.health ?? 0)));
    const socialThen = socialNow * Math.min(1, socialScale);
    const tariffThen = (ledger.tariffRevenue ?? 0)
      * (current.tariff !== 0 ? proposal.tariff / current.tariff : 1);
    const projected = (ledger.net ?? 0)
      - (wagesCost - (ledger.armyCost ?? 0))
      - (procurementCost - (ledger.procurementCost ?? 0))
      - (socialThen - socialNow)
      + (tariffThen - (ledger.tariffRevenue ?? 0));
    const weeks = projected < -0.05
      ? Math.max(1, Math.floor((me.gold + Math.max(0, debtCapacity(me) - (me.debt ?? 0)))
        / -projected))
      : null;

    const row = (key) => `<div class="warbudget-row${changes.includes(key) ? '' : ' unchanged'}">
      <span>${esc(labels[key])}</span>
      <em>${current[key]}% ${changes.includes(key) ? `→ <b>${proposal[key]}%</b>` : '· unchanged'}</em>
    </div>`;
    return `<div class="warbudget">
      <div class="card-head"><h3>War Budget proposal</h3>
        <small>estimate at wartime consumption — market prices will move</small></div>
      ${Object.keys(proposal).map(row).join('')}
      <div class="fiscal-balance">
        <span>Projected weekly balance (wartime)</span>
        <b class="${projected >= 0 ? 'res-pos' : 'res-neg'}">${projected >= 0 ? '+' : ''}¤${projected.toFixed(1)}</b>
      </div>
      <p class="hint">${weeks
    ? `Treasury and borrowing could sustain this for about <b>${weeks} weeks</b> of war.`
    : 'This allocation pays for itself even at wartime tempo.'}</p>
      ${changes.length === 0
    ? '<p class="hint res-warn">Already at war footing — every slider is at its proposed value; the party caps the rest.</p>'
    : ''}
      <div class="row-buttons">
        <button class="action" data-war-budget-apply="1" ${changes.length ? '' : 'disabled'}>Apply War Budget</button>
        <button class="action" data-war-budget-close="1">Cancel</button>
      </div>
    </div>`;
  }

  /** Şu an herhangi bir savaşta mıyız? (tempo tahmini için) */
  atWarNow(me) {
    const world = this.game.world;
    return world.nations.some(
      (other) => other.alive && other.id !== me.id && atWar(world, me.id, other.id),
    );
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
      // Vergiden sonra geçim masrafını karşılayınca elde kalan. Üst sınıfta bu
      // artık, yatırım sermayesine dönüşen paradır (bkz. collectPrivateCapital).
      const surplus = (socialClass.needsBudget ?? 0) - (socialClass.needsCost ?? 0);
      return `<div class="population-class" style="--population-class:${info.color}">
        <div class="population-class-main">
          <span><i></i><b>${esc(info.name)}</b><small>${(share * 100).toFixed(1)}% of nation</small></span>
          <strong>${formatPopulation(socialClass.population)}</strong>
        </div>
        <div class="population-class-meta">
          <span>Tax <b>${economy.taxes[classId]}%</b></span>
          <span>Satisfaction <b>${Math.round((socialClass.satisfaction ?? 0) * 100)}%</b></span>
          <span>Needs <b class="${socialClass.canAffordNeeds ? 'res-pos' : 'res-neg'}">${socialClass.canAffordNeeds ? 'covered' : 'unmet'}</b></span>
        </div>
        <div class="population-class-meta">
          <span>Income <b>¤${(socialClass.income ?? 0).toFixed(1)}</b></span>
          <span>Tax paid <b>¤${(socialClass.taxPaid ?? 0).toFixed(1)}</b></span>
          <span>Cost of living <b>¤${(socialClass.needsCost ?? 0).toFixed(1)}</b></span>
          <span>Left over <b class="${surplus >= 0 ? 'res-pos' : 'res-neg'}">${surplus >= 0 ? '+' : ''}¤${surplus.toFixed(1)}</b></span>
        </div>
        ${classId === 'upper' ? `<p class="class-capital">Accumulated investment capital
          <b>¤${(me.politics?.privateCapital ?? 0).toFixed(1)}</b> — this is what capitalists
          spend on factory projects. Heavy taxation drains it.</p>` : ''}
        <div class="profession-bars">${CLASS_PROFESSIONS[classId].map((id) => {
    const count = economy.professionCounts?.[id] ?? 0;
    const within = socialClass.population > 0 ? (count / socialClass.population) * 100 : 0;
    return `<div class="profession-row" title="${esc(PROFESSION_INFO[id].name)}: ${formatPopulation(count)} (${within.toFixed(1)}% of class)">
            <span class="profession-name">${esc(PROFESSION_INFO[id].name)}</span>
            <span class="meter"><i style="width:${Math.min(100, within).toFixed(1)}%"></i></span>
            <span class="profession-count">${formatPopulation(count)}</span>
            <span class="profession-share">${within.toFixed(0)}%</span>
          </div>`;
  }).join('')}</div>
      </div>`;
    }).join('');
    const mobility = economy.mobility ?? {};
    const movements = [];
    if (mobility.promotedLower) movements.push(`<b class="res-pos">${formatPopulation(mobility.promotedLower)} Lower → Middle</b>`);
    if (mobility.promotedMiddle) movements.push(`<b class="res-pos">${formatPopulation(mobility.promotedMiddle)} Middle → Upper</b>`);
    if (mobility.demotedUpper) movements.push(`<b class="res-neg">${formatPopulation(mobility.demotedUpper)} Upper → Middle</b>`);
    if (mobility.demotedMiddle) movements.push(`<b class="res-neg">${formatPopulation(mobility.demotedMiddle)} Middle → Lower</b>`);

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
          <button class="grow rel-open" data-nation="${n.id}" title="Open dossier">
            <div class="name">${esc(n.name)} ${tag}</div>
            <div class="meta">${n.tiles} provinces · power ratio ${ratio} · infamy ${Math.round(n.infamy ?? 0)}</div>
          </button>
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

    const offers = (this.game.peaceOffers ?? [])
      .filter((entry) => entry.to === me.id)
      .map((entry) => this.peaceOfferCard(entry)).join('');

    return `<div class="card">
        <div class="card-head"><h3>${esc(me.name)}</h3>
          <small>infamy ${Math.round(me.infamy ?? 0)}/${INFAMY_COALITION} · coalition at ${INFAMY_COALITION}</small></div>
      </div>
      ${offers}
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
    const netTradeOf = (goodId) => {
      const flow = me.economy?.goodsFlow?.[goodId] ?? {};
      return (flow.exports ?? 0) - (flow.imports ?? 0);
    };
    // Bütün mallar tek ölçeği paylaşır, yoksa çubuk boyları kıyaslanamaz.
    const scale = Math.max(0.1, ...GOOD_IDS.map((id) => Math.abs(netTradeOf(id))));
    const goodRows = GOOD_IDS.map((goodId) => {
      const good = GOODS[goodId];
      const state = market.goods[goodId];
      const flow = me.economy?.goodsFlow?.[goodId] ?? {};
      const trend = state.trend > 0.005 ? '▲' : state.trend < -0.005 ? '▼' : '—';
      const cls = state.trend > 0.005 ? 'res-neg' : state.trend < -0.005 ? 'res-pos' : '';
      const netTrade = netTradeOf(goodId);
      const magnitude = (Math.abs(netTrade) / scale) * 50;
      const exporting = netTrade > 0.005;
      const importing = netTrade < -0.005;
      const quantity = Math.abs(netTrade) < 0.05 ? '<0.1' : flowNumber(Math.abs(netTrade));
      const label = exporting ? `sells ${quantity}`
        : importing ? `buys ${quantity}` : 'balanced';
      const coverage = (flow.demand ?? 0) > 0
        ? Math.round(((flow.fulfilled ?? 0) / flow.demand) * 100) : 100;
      // Yön tek başına yeterli bir işarettir: renk körlüğünde de sağ/sol okunur.
      const side = exporting ? 'pos' : importing ? 'neg' : 'flat';
      return { category: good.category, html: `<div class="market-row ${this.tradeGood === goodId ? 'selected' : ''}"
        data-good="${goodId}" title="World supply ${flowNumber(state.supply)} · demand ${flowNumber(state.demand)} · made ${flowNumber(flow.production)} · needs ${flowNumber(flow.demand)}">
        <div class="market-row-head">
          <span class="good-name">${good.icon} ${esc(good.name)}</span>
          <span class="market-price">¤${state.price.toFixed(2)}
            <small class="${cls}">${trend} ${Math.abs(state.trend).toFixed(2)}</small></span>
        </div>
        <div class="trade-bar">
          <div class="trade-bar-track">
            ${importing ? `<i class="trade-bar-fill neg" style="width:${magnitude.toFixed(2)}%"></i>` : ''}
            ${exporting ? `<i class="trade-bar-fill pos" style="width:${magnitude.toFixed(2)}%"></i>` : ''}
          </div>
          <span class="trade-bar-label ${side}">${esc(label)}</span>
        </div>
        ${coverage < 99 ? `<small class="trade-shortfall">only ${coverage}% of demand met · ${flowNumber(flow.shortage)} short</small>` : ''}
      </div>` };
    });
    // Victoria 2 mallari kategori bloklari halinde gosterir; ham madde ile
    // askeri mal ayni listede karisinca goz neyi aradigini bulamiyordu.
    const rows = Object.entries(GOOD_CATEGORIES).map(([id, name]) => {
      const inCategory = goodRows.filter((row) => row.category === id);
      if (!inCategory.length) return '';
      return `<section class="market-group">
        <h4 class="market-group-head">${esc(name)}</h4>
        <div class="market-grid">${inCategory.map((row) => row.html).join('')}</div>
      </section>`;
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
        <div class="trade-legend">
          <span><i class="swatch neg"></i>bought abroad</span>
          <span><i class="swatch pos"></i>sold abroad</span>
        </div>
        <div class="trade-columns">
          <div class="trade-goods">${rows}</div>
          ${this.goodDetail(me, world)}
        </div>
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
    for (const btn of this.el.body.querySelectorAll('[data-peace-term]')) {
      btn.onclick = () => {
        const set = this.peaceSelection.terms;
        const id = btn.dataset.peaceTerm;
        if (set.has(id)) set.delete(id); else set.add(id);
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-peace-tab]')) {
      btn.onclick = () => { this.peaceTab = btn.dataset.peaceTab; this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-drop-tile]')) {
      btn.onclick = () => {
        const set = btn.dataset.dropKind === 'give'
          ? this.peaceSelection.concessions : this.peaceSelection.demands;
        set.delete(btn.dataset.dropTile);
        game.renderer.updatePeaceSelection(this.peaceSelection);
        game.requestRender();
        this.refresh();
      };
    }
    const clearPeace = this.el.body.querySelector('[data-clear-peace]');
    if (clearPeace) {
      clearPeace.onclick = () => {
        this.peaceSelection = { demands: new Set(), concessions: new Set(), terms: new Set() };
        game.renderer.updatePeaceSelection(this.peaceSelection);
        game.requestRender();
        this.refresh();
      };
    }
    const sign = this.el.body.querySelector('[data-sign-peace]');
    if (sign) {
      sign.onclick = () => {
        const offer = {
          demands: [...this.peaceSelection.demands],
          concessions: [...this.peaceSelection.concessions],
          terms: [...this.peaceSelection.terms],
        };
        if (!signPeace(game, me.id, this.peaceTarget, offer)) return;
        game.turns.addLog(`Peace signed with ${game.world.nations[this.peaceTarget].name}.`);
        this.peaceTarget = null;
        this.close();
        game.emit('turn', game.turns.turn);
        game.requestRender();
      };
    }
    for (const row of this.el.body.querySelectorAll('[data-good]')) {
      row.onclick = () => {
        this.tradeGood = this.tradeGood === row.dataset.good ? null : row.dataset.good;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-add-region]')) {
      btn.onclick = () => {
        this.industryPicker = this.industryPicker === btn.dataset.addRegion
          ? null : btn.dataset.addRegion;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-close-picker]')) {
      btn.onclick = () => { this.industryPicker = null; this.refresh(); };
    }
    // Modalın dışına tıklamak da kapatır; içeriye tıklama kabarcıklanınca
    // hedef kontrolüyle ayrılır.
    const overlay = this.el.body.querySelector('[data-picker-overlay]');
    if (overlay) {
      overlay.onclick = (event) => {
        if (event.target !== overlay) return;
        this.industryPicker = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-factory]')) {
      btn.onclick = () => {
        if (!buildFactory(game, me, btn.dataset.region, btn.dataset.factory)) return;
        // Kurulunca pencere kapanır: aynı state'e ikinci kez aynı tür zaten girmez.
        this.industryPicker = null;
        this.refresh();
      };
    }
    const warOpen = this.el.body.querySelector('[data-war-budget-open]');
    if (warOpen) warOpen.onclick = () => { this.warBudgetOpen = true; this.refresh(); };
    const warClose = this.el.body.querySelector('[data-war-budget-close]');
    if (warClose) warClose.onclick = () => { this.warBudgetOpen = false; this.refresh(); };
    const warApply = this.el.body.querySelector('[data-war-budget-apply]');
    if (warApply) {
      warApply.onclick = () => {
        const limits = fiscalPolicyLimits(me);
        setFiscalPolicy(me, 'militaryWages', limits.armySpendingMax);
        setFiscalPolicy(me, 'militaryProcurement', limits.armySpendingMax);
        setFiscalPolicy(me, 'social', Math.min(me.economy.social.welfare ?? 0, 30), 'welfare');
        setFiscalPolicy(me, 'social', Math.min(me.economy.social.education ?? 0, 60), 'education');
        setFiscalPolicy(me, 'tariff', Math.max(me.economy.tariff, Math.min(limits.tariffMax, 25)));
        this.warBudgetOpen = false;
        game.recomputeEconomy?.();
        game.emit('economy', me.economy);
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-subsidize]')) {
      btn.onclick = (event) => {
        // Kutucuk tıklaması başka işler de yapabilir; düğme kendi başına.
        event.stopPropagation();
        const factory = (me.economy?.factories ?? [])
          .find((candidate) => candidate.id === btn.dataset.subsidize);
        if (!factory) return;
        factory.subsidized = !factory.subsidized;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-support]')) {
      // Shift ile tam destek: Vic2'de olduğu gibi kalanın tamamı, hazine yettiği kadar.
      btn.onclick = (event) => {
        if (supportProject(game, me, Number(btn.dataset.support), { full: event.shiftKey })) {
          this.refresh();
        }
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
    // Eskiden bu düğme tek tıkla işgalleri devreden otomatik barışı yapıyordu.
    // Artık oyuncunun tek barış yolu var: masa.
    for (const btn of this.el.body.querySelectorAll('[data-peace]')) {
      btn.onclick = () => this.openPeaceTalks(Number(btn.dataset.peace));
    }
    for (const btn of this.el.body.querySelectorAll('[data-locate]')) {
      btn.onclick = () => {
        game.focusNation(game.world.nations[Number(btn.dataset.locate)]);
        this.close();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-nation]')) {
      btn.onclick = () => this.openDossier(Number(btn.dataset.nation));
    }
    for (const btn of this.el.body.querySelectorAll('[data-accept-offer]')) {
      btn.onclick = () => {
        game.resolvePeaceOffer(Number(btn.dataset.acceptOffer), true);
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-reject-offer]')) {
      btn.onclick = () => {
        game.resolvePeaceOffer(Number(btn.dataset.rejectOffer), false);
        this.refresh();
      };
    }
  }
}
