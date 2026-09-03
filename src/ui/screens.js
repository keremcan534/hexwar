// HOI4 tarzı tam ekran yönetim ekranları: İnşaat, Üretim, Araştırma,
// Lojistik, Diplomasi, Ticaret.
//
// Amaç her şeyi tek alt panele tıkıştırmaktan kurtulmak. Veri zaten oyunda
// mevcut olduğu için ekranlar gerçek sayılarla dolduruldu; etkileşimler de
// var olan fonksiyonlara bağlandı (yeni oyun mantığı yazılmadı).

import { canAfford, formatCost, pay } from '../game/cities.js';
import { MIN_WAR_TURNS, atWar, nationStrength, relation, truceLeft } from '../game/diplomacy.js';
import {
  MAX_DEMAND_PROVINCES, PEACE_TERMS, concedeKeyForTile, demandKeyForTile,
  occupiedProvincesOf, offerCost, offerRefusal, provinceFromKey, provinceKeyOf,
  provinceWarCost, signPeace, termAvailable, warGoalOf, warScore,
} from '../game/peace.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { maxHpOf, organizationOf, soldiersOf } from '../game/units.js';
import { provinceName } from '../game/provinces.js';
import { populationGroupDetail, populationOverview } from '../game/populationView.js';
import { populationScreen } from './populationScreen.js';
import {
  goodDossier, goodRows, tradeStructure, tradeSummary,
} from '../game/tradeLedger.js';
import { tradeScreen } from './tradeScreen.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { hegemonyScore, scoreboard } from '../game/hegemony.js';
import { resourceGlyph } from './icons/index.js';
import {
  CLASS_INFO, FACTORIES, GOODS, GOOD_IDS,
  MILITARY_EQUIPMENT,
  SOCIAL_PROGRAMS, buildFactory, closeFactory, factoryAtlas, upgradeFactory,
  debtCapacity, debtInterestRate, formatPopulation, populationOf,
  budgetBreakdown, setBudgetPolicy, weeklyBalanceOf,
  setMilitaryProductionLine, socialSpendingCost, ensureProductionLine, supportProject,
} from '../game/economy.js';
import { MAX_ROUNDS, battleSides, battlesFor } from '../game/battles.js';
import { cancelTraining, moveTrainingTo, prioritizeTraining } from '../game/recruitment.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import {
  armyComposition, commandRoster, militaryStats, militarySummary, recruitOptions,
  trainingRows, unassignedDivisions,
} from '../game/military.js';
import {
  BRANCH, assignDivisions, createGeneral, generalCost, officersOf, setCommandOption, setStance,
  unassignGeneral,
} from '../game/command.js';
import { militaryScreen } from './militaryScreen.js';
import {
  EARLY_ELECTION_WINDOW, electionWindowOpen,
  fiscalPolicyLimits, holdElection, policyLabel, rulingParty,
} from '../game/politics.js';
import { TIER, announce, chronicleYear, ensureChronicle, memoryOf } from '../game/chronicle.js';
import {
  allianceAppeal, alliesOf, breakAlliance, formAlliance, isAllied,
} from '../game/alliances.js';
import { characterLine, techStanding } from '../game/identity.js';
import {
  electorate, enactReform, governmentType, reformBoard,
} from '../game/reforms.js';
import { politicsScreen } from './politicsScreen.js';
import {
  DELEGATION_AREAS, DELEGATION_IDS, isDelegated, lastDelegatedAction, setDelegation,
} from '../game/delegation.js';
import { technologyScreen } from './technologyScreen.js';
import { industryScreen } from './industryScreen.js';
import { factoryBuildOptions, industryOverview } from '../game/industryView.js';
import {
  PROGRAMMES, adoptProgramme, abandonProgramme, effectiveTechCost,
  researchPointsOf, startResearch,
} from '../game/technology.js';
import {
  CONSTRUCTION_TYPES, NATIONAL_INVESTMENTS, cancelConstruction, canQueueConstruction,
  constructionAtlas, constructionPower, constructionUpkeep, divestInvestment,
  ensureConstruction,
  investmentBlocker, investmentCost, investmentLevel, moveConstructionTo,
  prioritizeConstruction, queueConstruction, queueInvestment,
} from '../game/construction.js';

const TITLES = {
  nation: 'Nation Overview',
  construction: 'Construction',
  industry: 'Factories',
  military: 'Military',
  budget: 'Budget',
  population: 'Population',
  politics: 'Politics',
  peace: 'Peace Talks',
  diplomacy: 'Diplomacy',
  dossier: 'Foreign Power',
  trade: 'Trade',
  technology: 'Technology',
  chronicle: 'National Chronicle',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * `availableFrom` tur numarasini takvim yilina cevirir. Cag kapisi turla
 * saklanir ama oyuncu yil dusunur; recruitment.js ile ayni donusum.
 */
/**
 * Guc karsilastirmasini duz dille yazar.
 *
 * BUG-016: ekran `power ratio 0.18` diyordu ve testci hangi yone baktigini
 * cozemedi — dunyanin en buyuk ulkesi EN DUSUK sayiya, minik bir ulke yuksek
 * sayiya sahipti. Oran dogruydu (bizim gucumuz / onlarinki) ama savas ilani
 * ekranindaki tek "onu yenebilir miyim" gostergesi okunamiyordu.
 */
function strengthPhrase(myPower, theirPower) {
  if (!(theirPower > 0)) return 'no standing army';
  if (!(myPower > 0)) return 'we have no army';
  const ratio = myPower / theirPower;
  if (ratio >= 1.05) return `we are ${ratio.toFixed(1)}× their strength`;
  if (ratio <= 0.95) return `they are ${(1 / ratio).toFixed(1)}× our strength`;
  return 'evenly matched';
}

/** Yeniden çizimde kaydırma konumu korunacak iç listeler. */
const SCROLL_KEEPERS = [
  '.census-scroll', '.census-browser-list', '.trade-goods-scroll', '.trade-detail',
  '.pol-left', '.pol-panel', '.pol-issues-scroll',
  '.mil-leader-list', '.mil-build-list', '.mil-queue-list', '.mil-left',
  '.xch-list', '.xch-dossier',
];

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
/**
 * "Borc neden buyuyor?" dokumu — debtInterestRate'in GERCEK terimleri
 * (taban + doluluk + kredi cezasi) ve haftalik defter net'i.
 */
function debtWhy(me) {
  const debt = Math.max(0, me.debt ?? 0);
  const capacity = debtCapacity(me);
  const load = capacity > 0 ? Math.min(1, debt / capacity) : 0;
  const credit = Math.min(0.85, Math.max(0, me.economy?.creditPenalty ?? 0));
  const net = me.economy?.ledger?.net ?? 0;
  const interest = Math.abs(me.economy?.ledger?.interest ?? 0);
  return [
    `Base rate  =  4.0%`,
    `Capacity used ${(load * 100).toFixed(0)}% × 8  =  +${(load * 8).toFixed(1)}%`,
    credit > 0 ? `Default record × 10  =  +${(credit * 10).toFixed(1)}%` : 'Default record  =  +0.0%',
    `Interest this week  =  ¤${interest.toFixed(1)}`,
    `Ledger net  =  ${net >= 0 ? '+' : ''}¤${net.toFixed(1)}/wk`,
    net < 0 ? 'The deficit itself is what feeds the debt.' : 'The debt shrinks while the ledger stays positive.',
  ].join('\n');
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
    this.refreshHandle = 0;
    this.previousMapMode = null;
    this.constructionType = null;
    // Sanayi ekraninin butun durumu tek nesnede: secili state, iki suzgec,
    // arama, kategori sekmesi, acik ⋯ menusu, acik katalog ve kapatma onayi.
    this.industry = {
      selected: null,
      stateFilter: 'all',
      stateQuery: '',
      category: 'all',
      filter: 'all',
      menu: null,
      picker: null,
      buildCategory: 'all',
      confirm: null,
    };
    this.tradeGood = null;
    // Siyaset ekranının açık sekmesi (Reforms / Movements / Decisions / Release).
    this.politicsTab = 'reforms';
    // Askerî ekranın durumu: açık kol, seçili subay, birim kategorisi ve
    // tarihi gelmemiş kolların gösterilip gösterilmediği.
    this.military = { branch: 'army', leader: null, category: 'all', showLocked: false };
    this.peaceTarget = null;
    this.nationTarget = null;
    this.peaceTab = 'take';
    this.peaceSelection = { demands: new Set(), concessions: new Set(), terms: new Set() };
    // Nufus ekraninin butun durumu tek nesnede: acik sekme, secili state,
    // acik agac dugumleri, iki arama kutusu ve secili grup.
    this.population = {
      tab: 'overview',
      selected: null,
      expanded: new Set(),
      query: '',
      group: null,
      groupQuery: '',
      sort: { key: 'size', dir: -1 },
    };
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
    // Tek bir hafta bu olaylardan on üç tane yayar (ölçüldü); hepsi aynı
    // kareye toplanır, yoksa ekran haftada birkaç kez baştan kurulur.
    for (const event of [
      'turn', 'units', 'economy', 'battles', 'provinces', 'politics', 'peace', 'construction',
    ]) {
      game.on(event, () => this.scheduleRefresh());
    }
    // Haritada yabancı toprağa sağ tık: o ülkenin paneli açılır.
    game.on('nation', (nationId) => this.openDossier(nationId));
    game.on('select', (tile) => {
      if (this.active === 'peace') {
        this.pickPeaceTile(tile);
        return;
      }
      if (this.active !== 'construction') return;
      const me = this.me;
      if (this.constructionType && tile?.owner === me?.id) {
        const region = constructionAtlas(game.world, me.id).tileRegions.get(tile);
        // Tiklanan kare CAPA olur: kalenin etkisi artik o noktaya bagli
        // (bkz. construction.fortDefenseAt), yani haritadan yer secmek gercek
        // bir karardir — dag gecidine kale, ovaya kale ayni sey degil.
        if (region && queueConstruction(game, me.id, region.id, this.constructionType, tile)) {
          game.turns.addLog(`${CONSTRUCTION_TYPES[this.constructionType].name} queued at ${provinceName(tile)}.`);
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
    // Sanayi ekraninin gecici katmanlari da kapanir: katalog, ⋯ menusu ve
    // kapatma onayi. Kalsalardi Factories her acilista acik katalogla geliyor
    // ve Upgrade/Subsidise satirini ortuyordu (Open Beta 4, B-10). Secili
    // state ve suzgecler bilerek korunur; oyuncu kaldigi yere doner.
    this.industry.picker = null;
    this.industry.menu = null;
    this.industry.confirm = null;
    this.active = null;
    delete this.el.root.dataset.screen;
    document.body.classList.remove('screen-open');
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    // Kapalı ekranın gövdesi DOM'da BIRAKILMAZ. Ölçüldü: sekiz ekranı yirmişer
    // kez açıp kapatınca belge 406 düğümden 1049'a çıkıyor ve son bakılan
    // ekranın 635 düğümü (35 KB HTML) gizli hâlde asılı kalıyordu — nüfus
    // sayımı gibi büyük bir ekranda bu on binlerce düğüm demek. Açılış zaten
    // `refresh()` ile gövdeyi baştan kuruyor, yani temizlemenin görsel bedeli
    // yok; kazancı kalıcı bellek ve stil/erişilebilirlik ağacının küçülmesi.
    this.el.body.innerHTML = '';
    this.el.res.innerHTML = '';
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

  /**
   * Kaydırılan iç listelerin konumu. Ekran her hafta yeniden çizilir; konum
   * korunmazsa oyuncu uzun bir tabloda baktığı satırı her turda kaybeder.
   */
  captureScroll() {
    return SCROLL_KEEPERS.map((selector) => {
      const node = this.el.body.querySelector(selector);
      return node ? [selector, node.scrollTop] : null;
    }).filter(Boolean);
  }

  restoreScroll(saved) {
    for (const [selector, top] of saved) {
      const node = this.el.body.querySelector(selector);
      if (node) node.scrollTop = top;
    }
  }

  /**
   * Tazelemeyi bir kareye toplar. Tek bir hafta 'turn', 'economy', 'provinces'
   * ve 'politics' olaylarını arka arkaya yayar; her biri ayrı ayrı yeniden
   * çizince ekran dört kez baştan kuruluyordu. Etkileşimler doğrudan `refresh`
   * çağırmaya devam eder — tıklamanın yanıtı gecikmemeli.
   */
  scheduleRefresh() {
    if (!this.active || this.refreshHandle) return;
    this.refreshHandle = requestAnimationFrame(() => {
      this.refreshHandle = 0;
      this.refresh();
    });
  }

  refresh() {
    if (this.refreshHandle) {
      cancelAnimationFrame(this.refreshHandle);
      this.refreshHandle = 0;
    }
    if (!this.active || !this.game.world) return;
    // Ekran kurulumu büyük innerHTML yazımıdır; maliyeti ölçülür.
    const t0 = performance.now();
    const me = this.me;
    const scroll = this.captureScroll();
    this.el.title.textContent = TITLES[this.active] ?? '—';
    // Construction artik eski sehir kaynaklariyla degil state-slot kapasitesiyle
    // calisir; eski gold/food/timber/iron seridi bu ekranda gosterilmez.
    // Sanayi ekraninin alt sekmeleri de kalkti: santiyeler artik ayri bir
    // pencerede degil, ekranin sag rayinda duruyor (bkz. industryScreen).
    this.el.res.innerHTML = !me || this.active === 'construction' || this.active === 'industry'
      ? '' : this.resourceLine(me);
    // AUTO seridi TEK YERDEN eklenir: alti ekranin her birine ayri ayri
    // yazmak, birini unutmanin ve iki farkli kalip cikmasinin garantisiydi.
    const autoArea = DELEGATION_IDS.find((id) => DELEGATION_AREAS[id].screen === this.active);
    this.el.body.innerHTML = me
      ? (autoArea ? this.autoStrip(me, autoArea) : '')
        + (this[`render_${this.active}`]?.(me) ?? '')
      : '<p class="empty">Your nation has been eliminated.</p>';
    this.bind();
    this.restoreScroll(scroll);
    this.game.perf?.add('ui.screen', performance.now() - t0);
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
    const cities = world.cities.filter((city) => city.nationId === target.id).length;
    const factories = (target.economy?.factories ?? []).reduce((s, f) => s + f.level, 0);
    const party = rulingParty(target);
    const offer = this.game.peaceOffers.find(
      (entry) => entry.from === target.id && entry.to === me.id,
    );

    const allied = isAllied(me, target.id);
    const status = [
      war ? '<span class="tag war">at war</span>'
        : truce ? `<span class="tag truce">truce ${truce}w</span>`
          : '<span class="tag peace">at peace</span>',
      allied ? '<span class="tag ally">ally</span>' : '',
      me.rivalId === target.id ? '<span class="tag rival">our rival</span>' : '',
      target.rivalId === me.id ? '<span class="tag rival">sees us as the rival</span>' : '',
    ].filter(Boolean).join(' ');

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
        <span title="${strengthPhrase(myPower, power)}"><small>Relative strength</small><b class="${myPower >= power ? 'res-pos' : 'res-neg'}">${strengthPhrase(myPower, power)}</b></span>
      </div>
      <div class="dossier-facts">
        <div><span>Population</span><b>${formatPopulation(populationOf(world, target))}</b></div>
        <div><span>Territory</span><b>${target.tiles}</b><small>hexes</small></div>
        <div><span>Cities</span><b>${cities}</b></div>
        <div><span>Industry</span><b>${factories} levels</b></div>
      </div>
      ${this.dossierIdentity(world, target)}
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
    : allied
      ? `<button class="action" data-break-alliance="${target.id}">Break Alliance</button>`
      : `<button class="action" data-war="${target.id}" ${truce ? 'disabled' : ''}>Declare War</button>
         <button class="action" data-ally="${target.id}">Propose Alliance</button>`}
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
   * Haritadan seçim. Tıklanan hex hangi kümedeyse BÜTÜN küme masaya girer;
   * hangi listeye gireceğini açık sekme belirler; aynı kümeye tekrar
   * tıklamak seçimi kaldırır.
   */
  pickPeaceTile(tile) {
    const me = this.me;
    const world = this.game.world;
    if (!tile || !me || this.peaceTarget == null) return;
    const take = this.peaceTab !== 'give';
    const key = take
      ? demandKeyForTile(world, tile, this.peaceTarget)
      : concedeKeyForTile(world, tile, me.id);
    if (!key) return;
    const set = take ? this.peaceSelection.demands : this.peaceSelection.concessions;
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
  /**
   * Ulke panelinin kimlik blogu: karakter cumlesi, teknoloji duzeyi, urettigi
   * ve bagimli oldugu mallar, muttefik/rakip ve son hatiralar.
   *
   * Sirket katmani sokulurken bu metod da yanlisikla gitmisti; cagrisi
   * `render_dossier` icinde kaldigi icin yabanci province'e her sag tik
   * TypeError ile bos bir "Foreign Power" paneli aciyordu (Open Beta 4, B-1).
   * Maliye blogu (borsa kapisi) bilerek geri gelmedi: dayandigi katman yok.
   */
  dossierIdentity(world, target) {
    const flow = target.economy?.goodsFlow ?? {};
    const producers = Object.entries(flow)
      .filter(([, f]) => (f?.production ?? 0) > 0.5)
      .sort((a, b) => (b[1].production ?? 0) - (a[1].production ?? 0))
      .slice(0, 3)
      .map(([id]) => `${GOODS[id]?.icon ?? ''} ${GOODS[id]?.name ?? id}`);
    const imports = Object.entries(flow)
      .filter(([, f]) => (f?.imports ?? 0) > 0.2 && (f?.demand ?? 0) > 0)
      .sort((a, b) => (b[1].imports / Math.max(0.01, b[1].demand))
        - (a[1].imports / Math.max(0.01, a[1].demand)))
      .slice(0, 3)
      .map(([id, f]) => `${GOODS[id]?.icon ?? ''} ${GOODS[id]?.name ?? id} (${Math.round((f.imports / Math.max(0.01, f.demand)) * 100)}%)`);
    const standing = techStanding(world, target);
    const allies = alliesOf(target)
      .map((id) => world.nations[id])
      .filter((n) => n?.alive)
      .map((n) => esc(n.name));
    const rival = target.rivalId != null ? world.nations[target.rivalId] : null;
    const memoryRows = memoryOf(target).slice(-3).reverse().map((m) => {
      const year = 1836 + Math.floor(((m.turn ?? 1) - 1) * 7 / 365);
      const other = esc(world.nations[m.other]?.name ?? '?');
      const text = {
        war_with: `war with ${other}`,
        took_land_from: `took land from ${other}`,
        lost_land_to: `lost land to ${other}`,
        industry_seized_by: `industry seized by ${other}`,
        seized_industry_of: `seized ${other}'s industry`,
        allied: `allied with ${other}`,
        alliance_broken: `broke with ${other}`,
        honored_call: `honored the call of ${other}`,
      }[m.kind] ?? `${m.kind} ${other}`;
      return `<li><em>${year}</em> ${text}</li>`;
    }).join('');
    return `<p class="dossier-line">${esc(characterLine(world, target))}</p>
      <div class="dossier-identity">
        <div><span>Technology</span><b>${esc(standing.label)}</b><small>${standing.research} researched · #${standing.rank ?? '—'} of ${standing.of ?? '—'}</small></div>
        <div><span>Produces</span><b>${producers.length ? producers.join(' · ') : 'little of note'}</b></div>
        <div><span>Depends on</span><b>${imports.length ? imports.join(' · ') : 'no major imports'}</b></div>
        <div><span>Allies</span><b>${allies.length ? allies.join(', ') : 'none'}</b></div>
        <div><span>Rival</span><b>${rival?.alive ? esc(rival.name) : 'none declared'}</b></div>
      </div>
      ${memoryRows ? `<ul class="dossier-memory">${memoryRows}</ul>` : ''}`;
  }

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
    const cost0 = cost;
    const list = (keys, kind) => (keys.length ? keys.map((key) => {
      const province = provinceFromKey(world, key);
      if (!province) return '';
      const starred = province.tileIdx.some((idx) => world.tiles[idx].city);
      return `<div class="peace-tile ${kind}">
        <span>${esc(province.name)}${starred ? ' ★' : ''} · ${province.tileIdx.length} hex</span>
        <b>${provinceWarCost(world, province)}</b>
        <button class="peace-drop" data-drop-tile="${esc(key)}" data-drop-kind="${kind}" title="Remove">✕</button>
      </div>`;
    }).join('') : '');

    /**
     * ALINABILECEKLER LISTESI.
     *
     * Eski ekran yalnizca SECILENLERI gosteriyordu; secilecek bir sey yoksa
     * tek yazdigi "Click provinces on the map." idi. Yani oyuncuya masada ne
     * oldugu hic soylenmiyordu: 160x96'lik haritada kirmizi kume aramak,
     * hangisinin kac ettigini tek tek tiklayarak ogrenmek zorundaydi.
     * Isgal edilmis kumeler zaten hesaplanıyor (peace.js occupiedProvincesOf);
     * ekran artik onu basiyor.
     */
    const takeable = () => {
      const held = occupiedProvincesOf(world, me.id, target.id)
        .filter((entry) => !selection.demands.has(provinceKeyOf(entry.province)));
      if (!held.length) {
        return `<p class="empty">${offer.demands.length
          ? 'Every occupied province is already on the table.'
          : `Nothing to demand yet — occupy ${esc(target.name)}'s provinces first.`}</p>`;
      }
      // Kendi sinirima komsu olan kume once gelir: bitisik alinan toprak
      // haritayi temiz birakir (bkz. peace.js contiguousPick).
      const mineAdjacent = (province) => (province.neighbors ?? [])
        .some((id) => world.provinces[id]?.owner === me.id
          || selection.demands.has(provinceKeyOf(world.provinces[id] ?? {})));
      return held.map(({ province, cost, share }) => {
        const key = provinceKeyOf(province);
        const starred = province.tileIdx.some((idx) => world.tiles[idx].city);
        const near = mineAdjacent(province);
        const afford = cost <= budget - cost0;
        return `<button class="peace-offer-row${near ? ' adjacent' : ''}"
          data-take-tile="${esc(key)}" title="${esc(province.name)} — ${cost} war score">
          <span class="por-name">${esc(province.name)}${starred ? ' ★' : ''}</span>
          <span class="por-meta">${province.tileIdx.length} hex · ${Math.round(share * 100)}% held${
  near ? ' · borders you' : ''}</span>
          <b class="por-cost${afford ? '' : ' res-neg'}">${cost}</b>
        </button>`;
      }).join('');
    };

    const tab = ['give', 'terms'].includes(this.peaceTab) ? this.peaceTab : 'take';
    // SAVAS HEDEFI MASANIN BASINDA. Bu savas neden acildi, hedef elimde mi,
    // masaya koydum mu -- uc soru, tek satir. Hedefsiz savas (eski kayitlar,
    // cagriyla acilmis savas) bandi hic gostermez.
    const goal = warGoalOf(world, me.id, target.id);
    const goalBand = (() => {
      if (!goal) return '';
      const key = provinceKeyOf(goal);
      const onTable = selection.demands.has(key);
      const held = occupiedProvincesOf(world, me.id, target.id)
        .some((entry) => entry.province.id === goal.id);
      const lost = goal.owner !== target.id;
      const state = lost
        ? { cls: 'done', text: 'already yours' }
        : onTable ? { cls: 'done', text: 'on the table' }
          : held ? { cls: 'ready', text: 'occupied — demand it' }
            : { cls: 'open', text: 'not occupied yet' };
      return `<div class="peace-goal ${state.cls}">
        <span class="pg-label">War goal</span>
        <b class="pg-name">${esc(goal.name)}</b>
        <span class="pg-state">${state.text}</span>
        ${!onTable && held && !lost
    ? `<button class="pg-add" data-take-tile="${esc(key)}">Add</button>` : ''}
      </div>`;
    })();

    return `<div class="card peace-head">
      ${goalBand}
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
    ? `at most ${MAX_DEMAND_PROVINCES} provinces · click a row or the map`
    : tab === 'give' ? 'giving land lowers the price of the treaty'
      : 'terms that do not move borders'}</small></div>
      ${tab === 'terms' ? this.peaceTermList(world, me, target)
    : tab === 'give' ? (list(offer.concessions, 'give')
      || '<p class="empty">Click your own provinces on the map to offer them.</p>')
      : `${list(offer.demands, 'take')}
         <div class="peace-avail-head">Occupied — available to demand</div>
         ${takeable()}`}
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
    const province = provinceFromKey(world, key);
    if (!province) return '';
    const starred = province.tileIdx.some((idx) => world.tiles[idx].city);
    return `${esc(province.name)}${starred ? ' ★' : ''} (${provinceWarCost(world, province)})`;
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

  resourceLine(me) {
    const weekly = weeklyBalanceOf(me);
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
  /**
   * Ulusal vakayiname: kampanyanin hafizasi. Hizli oynayan oyuncu 11 saniyelik
   * bir toast'i kacirinca tarihini kaybediyordu (kor beta B-013). Burada
   * yalnizca ULUSAL (tier 2+) olaylar durur — her fabrika, her fiyat degil.
   */
  render_chronicle(me) {
    const entries = ensureChronicle(me);
    if (!entries.length) {
      return `<p class="empty">Nothing of national consequence has been recorded yet.
        Wars, treaties, debt, defaults and changes of government are written here.</p>`;
    }
    // En yeni ustte: oyuncu once "az once ne oldu" diye bakar.
    const rows = [...entries].reverse().map((entry) => `
      <li class="chron-row tier-${entry.tier ?? 2}">
        <b class="chron-year">${chronicleYear(entry.turn)}</b>
        <span class="chron-text">
          <b>${esc(entry.title)}</b>
          ${entry.detail ? `<small>${esc(entry.detail)}</small>` : ''}
        </span>
      </li>`).join('');
    return `<div class="chronicle"><ol class="chron-list">${rows}</ol></div>`;
  }

  render_nation(me) {
    const world = this.game.world;
    const cities = this.myCities(me);
    const units = world.units.filter((u) => u.nationId === me.id);
    const population = me.economy?.population ?? 0;
    // Küme döngüsü: tile.province paylaşılan econ, kare kare toplamak aynı
    // havuzu üye sayısı kadar sayardı.
    const foreign = (world.provinces ?? []).reduce((sum, province) => (
      province.owner === me.id && province.culture !== me.culture
        ? sum + (province.econ?.population ?? 0) : sum
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
        <div><span>Territory</span><b>${me.tiles}</b><small>hexes</small></div>
        <div><span>Population</span><b>${formatPopulation(population)}</b><small>${cities.length} ${cities.length === 1 ? 'city' : 'cities'}</small></div>
        <div><span>Armed Forces</span><b>${units.length}</b><small>power ${nationStrength(world, me).toFixed(1)}</small></div>
        <div><span>Internal Cohesion</span><b>${100 - foreignPct}%</b><small>${foreignPct}% foreign population</small></div>
        <div><span>Construction</span><b>${atlas.free}/${atlas.slots}</b><small>state slots available</small></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>National Economy</h3><small>current fiscal system</small></div>
        <div class="economy-ledger">
          <span><small>Treasury</small><b>¤${Math.round(me.gold)}</b></span>
          <span><small>GDP</small><b>¤${Math.round(me.economy?.gdp ?? 0)}</b></span>
          <span><small>Tax revenue</small><b>¤${(me.economy?.taxRevenue ?? 0).toFixed(1)}</b></span>
          <span><small>Weekly balance</small><b class="${weeklyBalanceOf(me) < 0 ? 'res-neg' : 'res-pos'}">${weeklyBalanceOf(me) >= 0 ? '+' : ''}¤${weeklyBalanceOf(me).toFixed(1)}</b></span>
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
        <i>${type.icon}</i><span><b>${esc(type.name)}</b><small>¤${type.cost} · −¤${type.upkeep}/week</small></span>
      </button>`).join('');
    // Ulusal yatirimlar: eski bina spam'inin kurum hali. Bir kart = bir
    // seviye + bir sonraki seviyenin bedeli + (kapaliysa) NEDENI.
    const investmentCards = Object.values(NATIONAL_INVESTMENTS).map((info) => {
      const level = investmentLevel(me, info.id);
      const pending = state.projects.filter(
        (project) => project.kind === 'national' && project.typeId === info.id,
      ).length;
      const blocked = investmentBlocker(me, info.id);
      const cost = investmentCost(me, info.id);
      const levelName = info.levels
        ? info.levels[Math.min(level, info.levels.length - 1)]
        : `level ${level}`;
      const capped = info.max != null && level + pending >= info.max;
      // Bos kuyrukla calisan insaat gucu para kuyusudur: sanayici 14 seviye
      // alip 12 yil bos kuyrukla bakim odedi, hicbir sey uyarmadi (Open Beta 4).
      const idlePower = info.id === 'CONSTRUCTION_CAPACITY' && level > 0
        && !state.projects.some((project) => project.kind !== 'national' || project.typeId !== info.id);
      return `<div class="construction-invest card" title="${esc(info.desc)}">
        <i>${info.icon}</i>
        <span class="grow"><b>${esc(info.name)}</b>
          <small>${esc(levelName)}${pending ? ` · ${pending} in queue` : ''}${
  info.id === 'CONSTRUCTION_CAPACITY' ? ` · +${5 * level}/wk` : ''}</small>
          ${blocked && !capped ? `<small class="res-warn">${esc(blocked)}</small>` : ''}
          ${idlePower ? `<small class="res-warn">Build power idle: nothing is queued, upkeep −¤${info.upkeep * level}/week still runs. Queue a project or dissolve a level.</small>` : ''}
        </span>
        <button class="action" data-invest="${info.id}" ${blocked ? 'disabled' : ''}
          title="${esc(blocked ?? `Invest ¤${cost}: enters the construction queue and adds −¤${info.upkeep}/week upkeep.`)}">
          ${capped ? 'Max' : `Invest · ¤${cost}`}</button>
        ${level > 0 ? `<button class="action" data-divest="${info.id}"
          title="Dissolve one level. No refund — you only shed the ¤${info.upkeep}/week upkeep.">−</button>` : ''}
      </div>`;
    }).join('');
    // Siralama KARARLI: ad alfabetik. Eski "bos yuvaya gore" siralama satirlari
    // her hafta yer degistirtiyordu ve oyuncu ayni state'e iki kez tiklayamiyordu
    // (P2-3'un insaat ekranindaki kardesi).
    const regions = [...atlas.regions]
      .sort((a, b) => a.name.localeCompare(b.name));
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
    // DEVLET KUYRUGU YALNIZ DEVLETIN ISIDIR. Ozel sermayenin santiyeleri de
    // ayni dizide duruyor ama oyuncunun verebilecegi bir emir yok: sirasini
    // degistiremez, iptal edemez, parasini o odemiyor. Ayni listede gosterilince
    // oyuncu kendi kuyrugunu okuyamiyordu (olculdu: alti satirin altisi ozel).
    // Ozel santiyeler asagida ayri, salt okunur bir seritte durur.
    const stateProjects = state.projects.filter((project) => project.actor !== 'private');
    const privateProjects = state.projects.filter((project) => project.actor === 'private');
    let cumulative = 0;
    const queueRows = stateProjects.map((project, index) => {
      // Kuyrukta bina, fabrika, seviye VE ulusal yatirim projeleri var; tip
      // aramasi uc tabloya birden bakmali, yoksa ekran cokertir.
      const type = CONSTRUCTION_TYPES[project.typeId] ?? NATIONAL_INVESTMENTS[project.typeId]
        ?? FACTORIES[project.typeId] ?? { name: project.typeId, icon: '🏭' };
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
          <button data-project-top="${project.id}" ${index === 0 ? 'disabled' : ''} title="Move to top of queue">⤒</button>
          <button data-project-up="${project.id}" ${index === 0 ? 'disabled' : ''} title="Move up one place">▲</button>
          <button data-project-down="${project.id}" ${index === stateProjects.length - 1 ? 'disabled' : ''} title="Move down one place">▼</button>
          <button data-project-bottom="${project.id}" ${index === stateProjects.length - 1 ? 'disabled' : ''} title="Move to bottom of queue">⤓</button>
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
        <span><small>Build power</small><b>${power.toFixed(1)}/wk</b></span>
        <span><small>Building upkeep</small><b>−¤${upkeep.toFixed(1)}</b></span>
        <span class="construction-free-total"><small>Available slots</small><b>${atlas.free}<em> / ${atlas.slots}</em></b></span>
      </div>
      <div class="construction-invest-row">${investmentCards}</div>
      <div class="construction-build-palette">${buildPalette}</div>
      <div class="construction-placement-hint ${selected ? 'active' : ''}">
        ${selected ? `<b>${selected.icon} ${esc(selected.name)} selected</b><span>Click one of your hexes on the map — the fort defends that hex and its 2-hex surroundings. A state row places it at the state centre.</span>`
    : '<b>National investments above; the fort is placed on the map</b><span>Select the fort, then click the hex it should defend — a pass, a capital approach, a border city.</span>'}
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

    // Ozel sermayenin santiyeleri: tek satir, emirsiz. Oyuncunun burada
    // yapabilecegi tek sey kendi hazinesinden destek vermek (Factories ekrani);
    // dolayisiyla burada yalniz "kim, nerede, ne kadari odendi" yazar.
    const privateStrip = privateProjects.length ? `<div class="construction-private">
      <div class="construction-private-head">
        <span><small>PRIVATE CAPITAL</small><b>Investor Sites</b></span>
        <em>${privateProjects.length} site${privateProjects.length === 1 ? '' : 's'}
          · ¤${(me.politics?.privateInflow ?? 0).toFixed(1)}/wk raised</em>
      </div>
      ${privateProjects.map((project) => {
    const type = FACTORIES[project.typeId] ?? { name: project.typeId, icon: '🏭' };
    const paid = project.cost > 0 ? Math.round((project.funded / project.cost) * 100) : 100;
    const label = project.kind === 'upgrade' ? `${type.name} expansion` : type.name;
    return `<div class="construction-private-row${project.dormant ? ' dormant' : ''}">
          <i>${type.icon}</i>
          <span><b>${esc(label)}</b><small>${esc(project.regionName ?? '')}</small></span>
          <span class="construction-private-bar"><i style="width:${paid}%"></i></span>
          <em>${paid}% paid</em>
        </div>`;
  }).join('')}
      <p class="hint">Investors pay for these themselves and choose their own order.
        The Factories screen can top one up from the treasury.</p>
    </div>` : '';

    return `${constructionOverview}<div class="construction-queue">
        <div class="construction-queue-head"><span><small>NATIONAL PRIORITY</small><b>Construction Queue</b></span><em>${stateProjects.length} active</em></div>
        ${queueRows || `<div class="construction-queue-empty"><b>No active projects</b><p>Select a building above, then choose a state.</p></div>`}
      </div>${privateStrip}${regionOverview}`;
  }

  /**
   * SANAYI EKRANI — uc sutun, tek kaynak.
   *
   * Ekran hicbir sey hesaplamaz: butun sayilar, uyari esikleri ve "kar neden
   * boyle" cumlesi `game/industryView.js`ten gelir (bkz. oradaki katman notu).
   * Cizim `ui/industryScreen.js`te; burasi yalnizca durumu tasir.
   */
  render_industry(me) {
    const world = this.game.world;
    if (!me.economy) return '<p class="empty">This nation has no economy.</p>';
    const view = industryOverview(world, me);
    if (!view) return '<p class="empty">This nation has no economy.</p>';
    const state = this.industry;
    // Secili state kaybolduysa (isgal, baris) en karli olana duser; ekran bos
    // kalmasin diye ilk acilista da secim yapilir.
    if (!state.selected || !view.states.some((row) => row.id === state.selected)) {
      state.selected = view.states[0]?.id ?? null;
    }
    const catalogue = state.picker
      ? factoryBuildOptions(world, me, state.picker) : null;
    return industryScreen(view, state, catalogue);
  }


  /**
   * Tesisin ULUSAL baglami — yalniz gercek akislardan (goodsFlow) turen
   * cumleler: girdinin ne kadari ithal, ciktinin ne kadari ihrac. Tesis
   * basina pay UYDURULMAZ (uretim tesise paylastirilamiyor; ulusal rakam
   * acikca "national" diye etiketlenir).
   */
  factoryContext(me, type) {
    const flow = me.economy?.goodsFlow ?? {};
    const parts = [];
    for (const id of Object.keys(type.inputs ?? {})) {
      const f = flow[id];
      if (!f || (f.demand ?? 0) <= 0.05) continue;
      const share = Math.round(((f.imports ?? 0) / f.demand) * 100);
      if (share >= 25) parts.push(`${GOODS[id]?.name ?? id} is ${share}% imported nationally`);
    }
    for (const id of Object.keys(type.outputs ?? {})) {
      const f = flow[id];
      if (!f || (f.production ?? 0) <= 0.05) continue;
      const share = Math.round(((f.exports ?? 0) / f.production) * 100);
      if (share >= 25) parts.push(`${share}% of national ${GOODS[id]?.name ?? id} is exported`);
    }
    return parts.length
      ? `<small class="factory-context">${esc(parts.slice(0, 2).join(' · '))}</small>` : '';
  }

  /**
   * Askerî üretim hatları: hangi silah fabrikası neyi yapıyor. Eskiden ayrı
   * bir Production ekranındaydı; o ekranın kalan her kalemi (asker alımı, ordu
   * dökümü, takviye özeti) Military ekranına taşındığı için hatlar da tükettiği
   * yere, teçhizat defterinin yanına geldi — seçim doğrudan aşağıdaki
   * "prod/day" sütununu değiştirir.
   */
  militaryLines(me) {
    const world = this.game.world;
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
    // Factories ekranında yapılır. Burası yalnız hattı yönlendirir.
    return `<div class="card production-lines-card">
      <div class="card-head"><h3>Military Production Lines</h3>
        <small>efficiency rises while a line stays on the same equipment</small></div>
      ${lineRows || '<p class="empty">No Arms Industry is producing military equipment. Build one from the Factories screen.</p>'}
      <p class="hint">Switching equipment resets that factory line to 50% efficiency.</p>
    </div>`;
  }

  // --- Askerî: komuta, asker alımı, eğitim kuyruğu (bkz. militaryScreen.js) ---
  /**
   * Ekranın bütün verisi TEK bir yerden toplanır ve çizim katmanına hazır
   * verilir: üç sütun ve alt bant aynı taramayı paylaşır, yoksa aynı hafta
   * dört kez ordu taranır ve sayılar birbirini tutmayabilir.
   */
  render_military(me) {
    const world = this.game.world;
    const cost = generalCost(me);
    const loose = unassignedDivisions(world, me);
    return militaryScreen(this.military, {
      summary: militarySummary(world, me),
      roster: commandRoster(world, me),
      options: recruitOptions(this.game, me),
      queue: trainingRows(this.game, me),
      stats: militaryStats(world, me),
      composition: armyComposition(world, me.id),
      logistics: equipmentLogistics(world, me),
      // Lojistik ekrani kaldirildi (Military'nin alt bandi ayni stok tablosunu
      // zaten gosteriyordu). Ekranin tek ozgun bilgisi buydu: denge tablosu
      // STOKU anlatir, bu satir AKISI — stok dusuyorsa sebebi budur.
      spent: {
        manpower: me.economy?.military?.manpowerUsed ?? 0,
        arms: me.economy?.military?.armsUsed ?? 0,
        artillery: me.economy?.military?.artilleryUsed ?? 0,
      },
      loose: {
        army: loose.filter((unit) => unit.type.domain !== 'sea').length,
        navy: loose.filter((unit) => unit.type.domain === 'sea').length,
      },
      trainCost: cost.gold,
      canTrain: canAfford(me, cost),
    });
  }

  /** Askerî ekranın etkileşimleri. Hepsi var olan oyun eylemlerine bağlanır. */
  bindMilitary() {
    const { game } = this;
    const me = this.me;
    if (!me) return;
    const body = this.el.body;

    for (const btn of body.querySelectorAll('[data-military-branch]')) {
      btn.onclick = () => {
        this.military.branch = btn.dataset.militaryBranch;
        // Kol değişince seçim de değişmeli: amiraller listesinde bir generalin
        // kimliği duruyorsa panel boş bir seçimle açılıyordu.
        this.military.leader = null;
        this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-leader]')) {
      btn.onclick = () => {
        this.military.leader = Number(btn.dataset.militaryLeader);
        this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-category]')) {
      btn.onclick = () => {
        this.military.category = btn.dataset.militaryCategory;
        this.refresh();
      };
    }
    const locked = body.querySelector('[data-military-locked]');
    if (locked) {
      locked.onchange = () => {
        this.military.showLocked = locked.checked;
        this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-build]')) {
      btn.onclick = (event) => {
        // buyUnit artık siparişi kuyruğa yazar (bkz. recruitment.js).
        // Shift = 5 siparis: "on iki alay, on iki tik" beta'nin en net tekrarli
        // is bulgusuydu — KARAR (egitim yuvasi/techizat kisiti) aynen duruyor,
        // yalniz AYNI tiklamanin tekrarina gerek kalmiyor. Kisit dolunca
        // dongü kendiliginden durur (buyUnit reddeder).
        const wanted = event.shiftKey ? 5 : 1;
        let ordered = 0;
        for (let i = 0; i < wanted; i++) {
          if (!game.turns.buyUnit(me, btn.dataset.militaryBuild)) break;
          ordered++;
        }
        if (ordered) this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-top]')) {
      btn.onclick = () => {
        if (moveTrainingTo(me, btn.dataset.militaryTop, 'top')) this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-all-stance]')) {
      btn.onclick = () => {
        // Tiyatro emri: tek tikla butun kara komutalari. Yedi generalin yedi
        // ayri "Start Offensive" dugmesi beta'nin 3 numarali mikro bulgusuydu.
        const stance = btn.dataset.militaryAllStance;
        let changed = 0;
        for (const general of officersOf(me, BRANCH.ARMY)) {
          if (general.divisions.length && setStance(game.world, general, stance) === stance) changed++;
        }
        if (changed) {
          game.turns.addLog(`${changed} command${changed === 1 ? '' : 's'} ordered to ${
            stance === 'advance' ? 'advance' : 'hold'}.`);
          game.emit('command', game.activeGeneral ?? null);
          game.requestRender();
        }
        this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-cancel]')) {
      btn.onclick = () => {
        if (cancelTraining(game, me, btn.dataset.militaryCancel)) this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-up]')) {
      btn.onclick = () => {
        if (prioritizeTraining(me, btn.dataset.militaryUp, -1)) this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-down]')) {
      btn.onclick = () => {
        if (prioritizeTraining(me, btn.dataset.militaryDown, 1)) this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-auto]')) {
      btn.onclick = () => {
        const key = btn.dataset.militaryAuto;
        setCommandOption(me, key, !me.command?.[key]);
        this.refresh();
      };
    }
    const train = body.querySelector('[data-military-train]');
    if (train) {
      train.onclick = () => {
        const branch = train.dataset.militaryTrain === 'navy' ? BRANCH.NAVY : BRANCH.ARMY;
        if (!pay(me, generalCost(me))) return;
        const general = createGeneral(game.world, me, game.turns.rng, { branch });
        game.turns.addLog(`${branch === BRANCH.NAVY ? 'Admiral' : 'General'} ${general.name}`
          + ' joined the staff.', { kind: 'COMMANDER' });
        this.military.leader = general.id;
        this.refresh();
      };
    }
    const assign = body.querySelector('[data-military-assign]');
    if (assign) {
      assign.onclick = () => {
        const general = officersOf(me, BRANCH.ARMY).concat(officersOf(me, BRANCH.NAVY))
          .find((candidate) => candidate.id === Number(assign.dataset.militaryAssign));
        if (!general) return;
        // Amiral gemi, general tümen alır: kollar karışmasın.
        const naval = general.branch === BRANCH.NAVY;
        assignDivisions(me, general.id, unassignedDivisions(game.world, me)
          .filter((unit) => (unit.type.domain === 'sea') === naval));
        game.emit('command', general);
        game.requestRender();
        this.refresh();
      };
    }
    const dismiss = body.querySelector('[data-military-dismiss]');
    if (dismiss) {
      dismiss.onclick = () => {
        unassignGeneral(game.world, me, Number(dismiss.dataset.militaryDismiss));
        game.emit('command', null);
        game.requestRender();
        this.refresh();
      };
    }
  }

  // --- Bütçe: üç sınıfın vergisi, gümrük ve askerî harcama ---
  /**
   * Bütçe — Vic2 defter düzeninin katı yeniden kuruluşu (yapı referans,
   * sanat bizim koyu/pirinç dilimiz). Sol sütun: gelir + ulusal banka.
   * Sağ sütun: gider + tarife/ticaret + öngörülen bakiye. Yoğunluk hedefi:
   * 1080p'de kaydırmasız tek pano. Kabuk aşaması — hesap değişmedi, bütün
   * değerler mevcut defterden okunur.
   */
  /**
   * BUTCE — bes kontrol, tek defter.
   *
   * Bu ekran HICBIR simulasyon formulunu yeniden kurmaz: butun sayilar
   * `budgetBreakdown()` uzerinden gelir. Eski surumde ekran uc formulu elle
   * kopyalamisti ve ikisi simulasyondan sapmisti (takviye notu 3.25 kat
   * yanlisti). Tek kaynak varsa sapma mumkun degildir.
   */
  render_budget(me) {
    const view = budgetBreakdown(this.game.world, me);
    if (!view) return '<p class="empty">Fiscal institutions are not initialized.</p>';
    const c = view.controls;
    const money = (v) => `${v >= 0 ? '+' : '\u2212'}\u00a4${Math.abs(v).toFixed(1)}`;
    const vbox = (v, tone = null) => {
      const cls = tone ?? (v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : '');
      return `<span class="vbox ${cls}">${Math.abs(v).toFixed(1)}\u00a4</span>`;
    };
    // `--fill` kaydiracin DOLU kismini boyar. Saf CSS ile bir range girdisinin
    // degerine gore yatak boyanamaz; oran burada yaziliir, boyama CSS'te kalir.
    const hslider = (policy, current, min, max, step = 5) => {
      const fill = max > min ? ((current - min) / (max - min)) * 100 : 0;
      return `<span class="hslider"><i class="cap"></i><input type="range"
        min="${min}" max="${max}" step="${step}" value="${current}"
        style="--fill:${fill.toFixed(1)}%"
        data-policy="${policy}"><i class="cap"></i></span>`;
    };

    const party = rulingParty(me);
    const band = (min, max, lo = 0, hi = 100) => (min <= lo && max >= hi ? ''
      : `<small class="ledger-limit">${esc(party?.name ?? 'The ruling party')} allows ${min}\u2013${max}%</small>`);

    /**
     * Bir kontrol satiri: kaydirac + GERCEK dokum + haftalik tutar.
     *
     * Baslik `data-tooltip` tasir: uzerine gelince (ya da dokununca —
     * bilesen :focus-within destekliyor) mekanigin ne yaptigi DUZ CUMLEYLE
     * cikar. Cumle de sayilar da `budgetBreakdown`dan gelir; ekran hicbirini
     * kendisi yazmaz, dolayisiyla anlatim simulasyondan sapamaz.
     */
    const control = (policy, label, picto, cfg, amount, breakdown) => `
      <div class="ledger-row">
        <span class="ledger-picto">${picto}</span>
        <span class="ledger-mid">
          <span class="ledger-label">
            <span class="ledger-what" data-tip="budget" data-tip-arg="${esc(policy)}" tabindex="0"
              >${esc(label)}<i class="ledger-hint" aria-hidden="true">?</i></span>
            <b>${cfg.value}%</b></span>
          ${hslider(policy, cfg.value, cfg.min, cfg.max)}
          ${band(cfg.min, cfg.max)}
          <small class="ledger-note">${breakdown}</small>
        </span>
        ${vbox(amount)}
      </div>`;

    // Kaydiraci olmayan kalemlerin cumlesi. Iki oyuncu da iflasin en buyuk iki
    // kalemini ("Strategic imports", "External settlement") okuyamadi; sayi
    // vardi, anlami yoktu (Open Beta 4). Metin defter satirinin ne oldugunu
    // soyler, tutari yeniden hesaplamaz.
    const LEDGER_NOTES = {
      state: 'what state-owned factories and provincial raw output pay the treasury',
      settlement: 'cash settled with the world market this week: goods sold abroad minus goods bought',
      treaty: 'indemnities and tribute owed or received under signed treaties',
      administration: 'automatic: grows with cities, provinces and population',
      construction: 'upkeep of construction capacity, forts, offices and universities',
      subsidy: 'treasury support paid to subsidised factories',
      imports: 'arms, shells and fuel bought abroad for the army; falls as your own plants make them',
      outlay: 'one-off state purchases this week: factories, regiments, officers',
      interest: 'interest on the national debt; rises with the credit penalty',
    };
    const row = (label, amount, note = '') => `
      <div class="ledger-row">
        <span class="ledger-mid">
          <span class="ledger-label">${esc(label)}</span>
          ${note ? `<small class="ledger-note">${note}</small>` : ''}
        </span>
        ${vbox(amount)}
      </div>`;

    // UC SINIF, UC KAYDIRAC. Her satir kendi kaydiracini, kendi matrahini ve
    // kendi tahsilatini gosterir; ekran hicbirini hesaplamaz (budgetBreakdown).
    const TAX_POLICIES = [
      ['taxLower', 'Lower class tax'],
      ['taxMiddle', 'Middle class tax'],
      ['taxUpper', 'Upper class tax'],
    ];
    const taxControls = TAX_POLICIES.map(([policy, label]) => {
      const cfg = c[policy];
      if (!cfg) return '';
      return control(policy, label, PICTO.lower, cfg, cfg.collected,
        `${formatPopulation(cfg.population)} people \u00b7 income \u00a4${cfg.base.toFixed(1)}`
        + ` \u00d7 ${cfg.value}% = \u00a4${cfg.collected.toFixed(1)}`);
    }).join('');
    const taxSummary = c.taxSummary;

    return `<div class="ledger">
      <section class="ledger-col">
        <header class="ledger-head">Revenue</header>

        ${taxControls}
        <div class="tax-summary">
          <span>Tax system</span><b>${esc(taxSummary.structure)}</b>
          <small>\u00a4${taxSummary.collected.toFixed(1)} collected of \u00a4${taxSummary.base.toFixed(0)} income</small>
        </div>

        ${control('tariff', 'Tariff', PICTO.crate, c.tariff, c.tariff.revenue,
    `imports \u00a4${c.tariff.imports.toFixed(1)} \u00b7 revenue \u00a4${c.tariff.revenue.toFixed(1)}`
        + ` \u00b7 imported goods cost <b>+${c.tariff.priceEffect}%</b>`)}

        ${view.incomeRows.filter((r) => r.id !== 'tax' && r.id !== 'tariff')
    .map((r) => row(r.label, r.amount, LEDGER_NOTES[r.id] ?? '')).join('')}

        <div class="ledger-total"><span>Total income</span>
          <span class="vbox pos big">${view.income.toFixed(1)}\u00a4</span></div>
      </section>

      <section class="ledger-col">
        <header class="ledger-head">Spending</header>

        ${control('armyFunding', 'Army', PICTO.soldier, c.armyFunding, -c.armyFunding.cost,
    `combat power <b>\u00d7${c.armyFunding.combatPower.toFixed(2)}</b>`
        + ` \u00b7 reinforcement <b>\u00d7${c.armyFunding.reinforcement.toFixed(2)}</b>`
        + ` \u00b7 training <b>\u00d7${c.armyFunding.training.toFixed(2)}</b>`
        + ` \u00b7 supply ${Math.round(c.armyFunding.supply * 100)}%`)}

        ${control('education', 'Education', PICTO.book, c.education, -c.education.cost,
    `literacy ${(c.education.literacy * 100).toFixed(1)}% \u2192 target`
        + ` <b>${(c.education.literacyTarget * 100).toFixed(0)}%</b>`
        + ` \u00b7 research <b>${c.education.researchPoints.toFixed(2)}</b>/wk`)}

        ${control('welfare', 'Welfare', PICTO.welfare, c.welfare, -c.welfare.cost,
    `satisfaction <b>+${(c.welfare.satisfaction * 100).toFixed(1)}</b>`
        + ` \u00b7 population growth <b>\u00d7${c.welfare.growth.toFixed(2)}</b>`)}

        ${view.expenseRows.filter((r) => !['army', 'procurement', 'education', 'welfare'].includes(r.id))
    .map((r) => row(r.label, r.amount, LEDGER_NOTES[r.id] ?? '')).join('')}

        <div class="ledger-total"><span>Total spending</span>
          <span class="vbox neg big">${view.expenses.toFixed(1)}\u00a4</span></div>

        <header class="ledger-head sub" data-tip="treasury" tabindex="0">National Bank</header>
        <div class="bank-rows">
          <div class="bank-line"><span>Treasury</span><b>\u00a4${Math.round(view.treasury)}</b>
            <span>Available credit</span><b>\u00a4${Math.round(Math.max(0, debtCapacity(me) - view.debt))}</b></div>
          <div class="bank-line"><span>Total debt</span>
            <b class="${view.debt > 0 ? 'neg' : ''}">\u00a4${Math.round(view.debt)}</b>
            <span>Interest</span><b>${(debtInterestRate(me) * 100).toFixed(1)}%/yr</b></div>
        </div>
        ${view.financingRows.length
    ? view.financingRows.map((r) => row(r.label, r.amount)).join('') : ''}

        <div class="ledger-balance">
          <span>Last week&rsquo;s balance<small>closed accounts, not a forecast</small></span>
          <span class="vbox ${view.balance >= 0 ? 'pos' : 'neg'} hero">${money(view.balance)}</span>
        </div>
        ${Math.abs(view.unreconciled) > 0.005
    ? `<div class="ledger-row"><span class="ledger-mid"><span class="ledger-label neg">Unreconciled</span>
           <small class="ledger-note">a treasury movement was not booked \u2014 this is a bug</small></span>
           ${vbox(view.unreconciled, 'neg')}</div>` : ''}
      </section>
    </div>`;
  }


  /**
   * NUFUS EKRANI — tesis panosu.
   *
   * Ekran hicbir sey hesaplamaz: butun sayilar, uyari esikleri ve "bu grup
   * neden mutsuz" cumlesi `game/populationView.js`ten gelir. Cizim
   * `ui/populationScreen.js`te; burasi yalnizca durumu tasir.
   */
  render_population(me) {
    if (!me.economy?.classes) return '<p class="empty">Population records are not initialized.</p>';
    const view = populationOverview(this.game.world, me);
    if (!view || !view.states.length) {
      return '<p class="empty">This nation holds no populated province.</p>';
    }
    const state = this.population;
    // Kaybedilen state secimden duser; oyuncu hic dokunmadiysa ulke geneli acilir.
    if (state.selected && !view.states.some((row) => row.id === state.selected)) {
      state.selected = null;
    }
    if (!state.expanded.size) {
      // Ilk acilista en kalabalik state acik gelir: sutun bos gorunmesin.
      state.expanded.add(view.states[0].id);
    }
    if (state.group && !view.groups.some((row) => row.id === state.group)) state.group = null;
    const detail = state.group ? populationGroupDetail(view, state.group) : null;
    return populationScreen(view, state, detail);
  }

  /** Nufus ekraninin etkilesimleri. */
  bindPopulation() {
    const state = this.population;
    for (const btn of this.el.body.querySelectorAll('[data-pop-tab]')) {
      btn.onclick = () => { state.tab = btn.dataset.popTab; this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-pop-expand]')) {
      btn.onclick = (event) => {
        // Ucgen state'i acar/kapatir ama SECMEZ: ikisi ayri niyet.
        event.stopPropagation();
        const id = btn.dataset.popExpand;
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        this.refresh();
      };
    }
    for (const el of this.el.body.querySelectorAll('[data-pop-state]')) {
      el.onclick = () => {
        state.selected = el.dataset.popState || null;
        if (state.selected) state.expanded.add(state.selected);
        this.refresh();
      };
    }
    for (const row of this.el.body.querySelectorAll('[data-pop-group]')) {
      const open = () => { state.group = row.dataset.popGroup; this.refresh(); };
      row.onclick = open;
      row.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-pop-alert]')) {
      btn.onclick = () => {
        // Uyari NEREYE goturecegini bilir: en cok etkilenen state secilir.
        const target = btn.dataset.popAlertState;
        if (target) {
          state.selected = target;
          state.expanded.add(target);
        }
        state.tab = 'states';
        this.refresh();
      };
    }
    for (const th of this.el.body.querySelectorAll('[data-pop-sort]')) {
      th.onclick = () => {
        // Ayni basliga ikinci tik yonu cevirir; yeni baslik metinde A→Z,
        // sayida buyukten kucuge baslar.
        const key = th.dataset.popSort;
        const numeric = th.classList.contains('num') || key === 'alert';
        state.sort = state.sort?.key === key
          ? { key, dir: -state.sort.dir }
          : { key, dir: numeric ? -1 : 1 };
        this.refresh();
      };
    }
    const search = this.el.body.querySelector('[data-pop-search]');
    if (search) {
      search.oninput = () => {
        state.query = search.value;
        this.refresh();
        this.el.body.querySelector('[data-pop-search]')?.focus();
      };
    }
    const groupSearch = this.el.body.querySelector('[data-pop-group-search]');
    if (groupSearch) {
      groupSearch.oninput = () => {
        state.groupQuery = groupSearch.value;
        this.refresh();
        this.el.body.querySelector('[data-pop-group-search]')?.focus();
      };
    }
  }


  // --- Teknoloji: arastirma merdiveni (bkz. technologyScreen.js) ---
  render_technology(me) {
    const world = this.game.world;
    const year = 1836 + Math.floor(((world.turn ?? 1) - 1) * 7 / 365);
    return technologyScreen(me, {
      category: this.techCategory ?? 'industry',
      selected: this.techSelected ?? null,
      confirm: this.techConfirm ?? null,
      year,
      turn: world.turn ?? 0,
      rate: researchPointsOf(me),
      // SERT KURAL: ekran ETKIN maliyeti gosterir (program indirimi +
      // yayilim). Liste fiyati basmak, motorun dusecegi sayiyla celisir ve
      // UI_TRUTH_FIXES'in kapattigi hata sinifini yeniden acardi.
      costOf: (techId) => effectiveTechCost(world, me, techId, year),
    });
  }

  // --- Politics: hükûmet, üst meclis ve yasa defteri (bkz. politicsScreen.js) ---
  render_politics(me) {
    if (!me.politics?.parties?.length || !rulingParty(me)) {
      return '<p class="empty">Political parties are not initialized.</p>';
    }
    // Yasa tahtası bir kez kurulur: sekme çubuğu, reform kapıları ve mesele
    // tablosu aynı hesabı paylaşır (üçü ayrı kurunca meclis üç kez sayılıyordu).
    const board = reformBoard(me);
    return politicsScreen(this.game.world, me, {
      tab: this.politicsTab,
      government: governmentType(me),
      electionWindow: electionWindowOpen(this.game.world, me),
      // Sandık yoksa seçim de yok: oy hakkı yasası kütüğü boşalttıysa düğme
      // "seçim yap" diyemez.
      hasElectorate: electorate(me).voters > 0,
      electionWindowWeeks: EARLY_ELECTION_WINDOW,
    }, board);
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
            <div class="meta">${n.tiles} hexes · ${strengthPhrase(myPower, power)} · infamy ${Math.round(n.infamy ?? 0)}</div>
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
  /**
   * Ticaret: Victoria 2'nin ticaret defteri düzeni — üstte ulusal künye, solda
   * kategori kategori mal kataloğu, sağda seçili malın dosyası, altta ticaret
   * yapısı. Bütün sayılar game/tradeLedger.js'ten hazır gelir; ekran yalnız
   * seçimi tutar. Sağ panel hiç boş açılmaz: seçim yoksa dünyanın en çok baskı
   * altındaki malı seçilir.
   */
  /**
   * AUTO seridi. Ekranin ustunde tek satir: alanin adi, anahtar ve hukumetin
   * son anlamli eylemi. Otomasyon gunlugu DEGILDIR — alan basina tek satir.
   */
  autoStrip(me, areaId) {
    const area = DELEGATION_AREAS[areaId];
    if (!area) return '';
    const on = isDelegated(me, areaId);
    const last = on ? lastDelegatedAction(me, areaId) : null;
    return `<div class="auto-strip${on ? ' on' : ''}">
      <span class="auto-label">${esc(area.name)}</span>
      <button class="auto-toggle${on ? ' on' : ''}" data-auto="${areaId}"
        aria-pressed="${on}">AUTO <b>${on ? 'ON' : 'OFF'}</b></button>
      <span class="auto-desc">${on ? esc(area.desc) : 'You hold this portfolio yourself.'}</span>
      ${last ? `<span class="auto-last"><b>${esc(last.text)}</b>
        <em>${esc(last.reason)}</em></span>` : ''}
    </div>`;
  }

  render_trade(me) {
    const world = this.game.world;
    if (!world.market?.goods) return '<p class="empty">The world market is not initialized.</p>';
    const rows = goodRows(world, me);
    const summary = tradeSummary(world, me, rows);
    if (!this.tradeGood || !world.market.goods[this.tradeGood]) {
      this.tradeGood = summary.pressure?.id
        ?? rows.find((row) => row.active)?.id ?? rows[0].id;
    }
    return tradeScreen({
      rows,
      summary,
      dossier: goodDossier(world, me, this.tradeGood),
      structure: tradeStructure(world, me, rows),
    }, this.tradeGood);
  }

  /** Ekranlardaki eylemleri oyunun mevcut fonksiyonlarına bağlar. */
  bind() {
    const { game } = this;
    const me = this.me;
    if (!me) return;

    if (this.active === 'population') this.bindPopulation();
    if (this.active === 'military') this.bindMilitary();

    // AUTO anahtarlari her ekranda ayni kalipla baglanir.
    for (const btn of this.el.body.querySelectorAll('[data-auto]')) {
      btn.onclick = () => {
        const areaId = btn.dataset.auto;
        const next = !isDelegated(me, areaId);
        if (setDelegation(game, me, areaId, next)) {
          game.turns.addLog(next
            ? `${DELEGATION_AREAS[areaId].name} delegated to the government.`
            : `${DELEGATION_AREAS[areaId].name} back under our own hand.`,
          { kind: 'POLITICS' });
        }
        this.refresh();
      };
    }

    for (const btn of this.el.body.querySelectorAll('[data-construction-type]')) {
      btn.onclick = () => {
        this.constructionType = this.constructionType === btn.dataset.constructionType
          ? null : btn.dataset.constructionType;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-invest]')) {
      btn.onclick = () => {
        if (queueInvestment(game, me.id, btn.dataset.invest)) {
          game.turns.addLog(`${NATIONAL_INVESTMENTS[btn.dataset.invest].name} investment queued.`);
        }
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-divest]')) {
      btn.onclick = () => {
        if (divestInvestment(game, me.id, btn.dataset.divest)) {
          game.turns.addLog(`${NATIONAL_INVESTMENTS[btn.dataset.divest].name} level dissolved.`);
        }
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
    for (const btn of this.el.body.querySelectorAll('[data-tech-category]')) {
      btn.onclick = () => {
        this.techCategory = btn.dataset.techCategory;
        this.techSelected = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-tech]')) {
      btn.onclick = () => {
        this.techSelected = btn.dataset.tech;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-start-research]')) {
      btn.onclick = () => {
        // Yon secimi OYUNCUNUN: bu cagri programin otomatik akisini ezer.
        startResearch(me, btn.dataset.startResearch);
        this.refresh();
      };
    }
    for (const el of this.el.body.querySelectorAll('[data-why-text]')) {
      // hud.toggleWhy'in ekran-ici esi: metni oge kendi tasir, ekran yalniz
      // acip kapatir (dokunmatikte hover yok — istikrar dokumleriyle ayni ders).
      const toggle = () => {
        if (this.whyPop?.isConnected && this.whyPop.dataset.anchor === el.dataset.why) {
          this.whyPop.remove();
          return;
        }
        this.whyPop?.remove();
        const pop = document.createElement('div');
        pop.className = 'why-pop';
        pop.dataset.anchor = el.dataset.why ?? '';
        pop.textContent = el.dataset.whyText;
        const rect = el.getBoundingClientRect();
        pop.style.top = `${Math.round(rect.bottom + 6)}px`;
        pop.style.left = `${Math.round(rect.left)}px`;
        document.body.append(pop);
        this.whyPop = pop;
        setTimeout(() => document.addEventListener('click', (ev) => {
          if (!pop.contains(ev.target) && this.whyPop === pop) pop.remove();
        }, { once: true }), 0);
      };
      el.onclick = toggle;
      el.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-proclaim]')) {
      btn.onclick = () => {
        const id = btn.dataset.proclaim;
        // Ilk tik onay ister, ikinci tik ilan eder (bkz. technologyScreen kart).
        if (this.techConfirm !== id) {
          this.techConfirm = id;
          this.refresh();
          return;
        }
        this.techConfirm = null;
        if (adoptProgramme(me, id, game.world.turn ?? 0)) {
          const programme = PROGRAMMES[id];
          // Taahhut ANINDA baglar: kart "egitim >= %25" diyorsa kaydirac o
          // hafta oraya cikar — sonraki dokunusa kadar 0'da kalmasi vaadi
          // bosa cikarirdi. setBudgetPolicy tabani zaten biliyor.
          setBudgetPolicy(me, 'education',
            Math.max(me.economy.social?.education ?? 0, programme.floor));
          // Ilan buyuk bir ulusal taahhuttur: vakayinameye girer (tier 2),
          // zaman DURMAZ — karari zaten oyuncu verdi.
          announce(game, me, {
            kind: 'POLITICS', tier: TIER.MAJOR, key: 'programme',
            title: `${programme.name} proclaimed`,
            detail: `${programme.line} Education bound at ${programme.floor}%.`,
          });
        }
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-abandon-programme]')) {
      btn.onclick = () => {
        if (abandonProgramme(me, game.world.turn ?? 0, 'abandoned')) {
          announce(game, me, {
            kind: 'POLITICS', tier: TIER.MAJOR, key: 'programme',
            title: 'The national programme is wound up',
            detail: 'Half the accumulated research bank is forfeit; no new proclamation for a year.',
          });
        }
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-project-top]')) {
      btn.onclick = () => {
        moveConstructionTo(game, me.id, Number(btn.dataset.projectTop), 'top');
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-project-bottom]')) {
      btn.onclick = () => {
        moveConstructionTo(game, me.id, Number(btn.dataset.projectBottom), 'bottom');
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
    for (const btn of this.el.body.querySelectorAll('[data-politics-tab]')) {
      btn.onclick = () => { this.politicsTab = btn.dataset.politicsTab; this.refresh(); };
    }
    // Yasa çıkarma. enactReform kapıyı kendi kontrol eder; burada yalnız
    // sonuç varsa ekran tazelenir (kapalıysa düğme zaten çizilmez).
    for (const btn of this.el.body.querySelectorAll('[data-reform]')) {
      btn.onclick = () => {
        if (enactReform(game, me, btn.dataset.reform)) this.refresh();
      };
    }
    const election = this.el.body.querySelector('[data-hold-election]');
    if (election) {
      election.onclick = () => {
        if (holdElection(game, me)) this.refresh();
      };
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
    // Listeden tek tikla masaya koy. Harita tiklamasi da duruyor; ikisi ayni
    // secim kumesine yazar, oyuncu hangisini isterse onu kullanir.
    for (const btn of this.el.body.querySelectorAll('[data-take-tile]')) {
      btn.onclick = () => {
        this.peaceSelection.demands.add(btn.dataset.takeTile);
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
    // Mal seçimi kapanmaz, değişir: sağ panel hiç boş kalmamalı (aynı karoya
    // ikinci tıklama seçimi düşürüyordu ve panel "mal seç" boşluğuna dönüyordu).
    for (const row of this.el.body.querySelectorAll('[data-trade-good]')) {
      row.onclick = () => {
        this.tradeGood = row.dataset.tradeGood;
        this.refresh();
      };
    }
    // --- Sanayi ekrani: state secimi, suzgecler, kart eylemleri -------------
    const industry = this.industry;
    for (const btn of this.el.body.querySelectorAll('[data-industry-state]')) {
      btn.onclick = () => {
        industry.selected = btn.dataset.industryState;
        industry.menu = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-state-filter]')) {
      btn.onclick = () => { industry.stateFilter = btn.dataset.stateFilter; this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-industry-filter]')) {
      btn.onclick = () => { industry.filter = btn.dataset.industryFilter; this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-industry-category]')) {
      btn.onclick = () => { industry.category = btn.dataset.industryCategory; this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-build-category]')) {
      btn.onclick = () => { industry.buildCategory = btn.dataset.buildCategory; this.refresh(); };
    }
    const search = this.el.body.querySelector('[data-state-search]');
    if (search) {
      // Yeniden cizim girdiyi degistirdigi icin imlec sona kayar; arama kutusu
      // kisa oldugundan bu kabul edilebilir, odak korunur.
      search.oninput = () => {
        industry.stateQuery = search.value;
        this.refresh();
        const next = this.el.body.querySelector('[data-state-search]');
        next?.focus();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-factory-menu]')) {
      btn.onclick = (event) => {
        event.stopPropagation();
        const id = btn.dataset.factoryMenu;
        industry.menu = industry.menu === id ? null : id;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-upgrade-factory]')) {
      btn.onclick = () => {
        const blocked = upgradeFactory(game, me, btn.dataset.upgradeFactory);
        // Reddin SEBEBI soylenir; sessizce olu duran dugme oyuncuya hicbir sey
        // ogretmez (bkz. exchange dosyasindaki ayni kural).
        if (blocked) game.turns.addLog(blocked, { kind: 'INDUSTRY' });
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-cancel-expansion]')) {
      btn.onclick = () => {
        // Iade muhasebesi construction.cancelConstruction'in kendisidir; ekran
        // ikinci bir hesap kurmaz.
        cancelConstruction(game, me.id, Number(btn.dataset.cancelExpansion));
        industry.menu = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-close-factory]')) {
      btn.onclick = () => {
        industry.confirm = btn.dataset.closeFactory;
        industry.menu = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-close-cancel]')) {
      btn.onclick = () => { industry.confirm = null; this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-close-confirm]')) {
      btn.onclick = () => {
        closeFactory(game, me, btn.dataset.closeConfirm);
        industry.confirm = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-add-region]')) {
      btn.onclick = () => {
        const region = btn.dataset.addRegion;
        if (!region) return;
        industry.picker = industry.picker === region ? null : region;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-close-picker]')) {
      btn.onclick = () => { industry.picker = null; this.refresh(); };
    }
    // Modalın dışına tıklamak da kapatır; içeriye tıklama kabarcıklanınca
    // hedef kontrolüyle ayrılır.
    for (const overlay of this.el.body.querySelectorAll('[data-picker-overlay], [data-close-overlay]')) {
      overlay.onclick = (event) => {
        if (event.target !== overlay) return;
        industry.picker = null;
        industry.confirm = null;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-factory]')) {
      btn.onclick = () => {
        if (!buildFactory(game, me, btn.dataset.region, btn.dataset.factory)) return;
        // Pencere ACIK KALIR: kurulan tur listeden zaten duser, oyuncu ayni
        // state'e pes pese birkac tesis kurabilir. Eski davranis (her alimda
        // kapanan modal) 75 fabrikalik bir kurulumu ~160 tika cikariyordu
        // (Beta 2 §7-4); karar sayisi ayni, tik sayisi tesise iner.
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
        this.industry.menu = null;
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
      // Sürüklerken sayı ANINDA oynar. Eski seçici (`.policy-slider` /
      // `[data-policy-value]`) defter tasarımıyla birlikte ölmüştü: kaydıraç
      // 40'a gidiyor, yanındaki rakam 30'da donuyordu — kör beta testçisi
      // bunu "görünmez bir tavan" sandı (B-022). Canlı rakam artık satırın
      // kendi etiketindedir.
      input.oninput = () => {
        const label = input.closest('.ledger-mid')?.querySelector('.ledger-label b');
        if (label) label.textContent = `${input.value}%`;
        // Dolgu da suruklerken oynar; yoksa yatak degeri bir kare geriden takip
        // ederdi (sayi ilerler, dolgu yerinde durur).
        const min = Number(input.min) || 0;
        const max = Number(input.max) || 100;
        const fill = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
        input.style.setProperty('--fill', `${fill.toFixed(1)}%`);
      };
      input.onchange = () => {
        // TEK AYAR KAPISI — YZ de ayni fonksiyonu cagirir (bkz. §23/§24).
        setBudgetPolicy(me, input.dataset.policy, Number(input.value));
        game.recomputeEconomy();
        game.emit('economy', me.economy);
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-war]')) {
      btn.onclick = () => { game.declareWarOn(Number(btn.dataset.war)); this.refresh(); };
    }
    for (const btn of this.el.body.querySelectorAll('[data-ally]')) {
      btn.onclick = () => {
        const targetId = Number(btn.dataset.ally);
        const target = game.world.nations[targetId];
        // YZ, oyuncunun teklifini KENDI olcusuyle tartar (allianceAppeal —
        // YZ-YZ taramasiyla birebir ayni fonksiyon; oyuncuya torpil yok).
        const appeal = allianceAppeal(game.world, target, me);
        if (appeal >= 1.5 && formAlliance(game.world, me.id, targetId, game.world.turn ?? 0)) {
          announce(game, me, {
            kind: 'PEACE', tier: TIER.MAJOR, key: `ally:${targetId}`,
            title: `Alliance with ${target.name}`,
            detail: 'An attack on one is a call to the other.',
          });
        } else {
          game.turns.addLog(`${target.name} declines the alliance.`, {
            kind: 'DIPLOMACY', key: `ally-no:${targetId}`,
          });
        }
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-break-alliance]')) {
      btn.onclick = () => {
        const targetId = Number(btn.dataset.break_alliance ?? btn.dataset.breakAlliance);
        const target = game.world.nations[targetId];
        if (breakAlliance(game.world, me.id, targetId, game.world.turn ?? 0)) {
          announce(game, me, {
            kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `ally:${targetId}`,
            title: `The alliance with ${target?.name ?? '?'} is dissolved`,
            detail: 'Former partners remember such things.',
          });
        }
        this.refresh();
      };
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
