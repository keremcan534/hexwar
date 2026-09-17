// HOI4 tarzı tam ekran yönetim ekranları: İnşaat, Üretim, Araştırma,
// Lojistik, Diplomasi, Ticaret.
//
// Amaç her şeyi tek alt panele tıkıştırmaktan kurtulmak. Veri zaten oyunda
// mevcut olduğu için ekranlar gerçek sayılarla dolduruldu; etkileşimler de
// var olan fonksiyonlara bağlandı (yeni oyun mantığı yazılmadı).

import { canAfford, formatCost, pay } from '../game/cities.js';
import {
  MIN_WAR_TURNS, atWar, crisisLeft, nationStrength, relation, truceLeft,
  ULTIMATUM_WEEKS,
} from '../game/diplomacy.js';
import {
  MAX_DEMAND_PROVINCES, PEACE_TERMS, concedeKeyForTile, demandKeyForTile,
  occupiedProvincesOf, offerCost, offerRefusal, provinceFromKey, provinceKeyOf,
  provinceWarCost, signPeace, termAvailable, warGoalOf, warScore,
} from '../game/peace.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { acceptCulture, expelCulture, releaseToKin } from '../game/culture.js';
import { maxHpOf, menUnderArms, organizationOf, soldiersOf } from '../game/units.js';
import { RGO_TYPES, provinceName } from '../game/provinces.js';
import { populationGroupDetail, populationOverview } from '../game/populationView.js';
import { populationScreen } from './populationScreen.js';
import {
  goodDossier, goodRows, tradeStructure, tradeSummary,
} from '../game/tradeLedger.js';
import { tradeScreen } from './tradeScreen.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { hydrateFlags } from '../render/flagWave.js';
import { hegemonyScore, scoreboard } from '../game/hegemony.js';
import { factoryEmblem, resourceGlyph } from './icons/index.js';
import {
  CLASS_INFO, FACTORIES, GOODS, GOOD_IDS,
  MILITARY_EQUIPMENT,
  SOCIAL_PROGRAMS, buildFactory, closeFactory, factoryAtlas, upgradeFactory,
  debtCapacity, debtInterestRate, formatPopulation, populationOf,
  applyTaxHolds, budgetBreakdown, setBudgetPolicy, setTaxHold, TAX_POLICY_CLASS, taxHold,
  weeklyBalanceOf,
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
  formGovernment, governmentType, governmentView, lawBoard, rulingParty, setLaw,
} from '../game/politics.js';
import { TIER, announce, chronicleYear, ensureChronicle, memoryOf } from '../game/chronicle.js';
import {
  allianceAppeal, alliesOf, breakAlliance, formAlliance, isAllied,
} from '../game/alliances.js';
import { characterLine, techStanding } from '../game/identity.js';
import { politicsScreen } from './politicsScreen.js';
import {
  DELEGATION_AREAS, DELEGATION_IDS, isDelegated, lastDelegatedAction, setDelegation,
} from '../game/delegation.js';
import { researchRateLines, technologyScreen } from './technologyScreen.js';
import { industryScreen } from './industryScreen.js';
import { factoryBuildOptions, industryOverview } from '../game/industryView.js';
import {
  dequeueResearch, effectiveTechCost, queueResearch, researchNow, researchPointsOf,
} from '../game/technology.js';
import {
  NATIONAL_INVESTMENTS, cancelConstruction, constructionPower, constructionView,
  divestInvestment, moveConstructionTo, prioritizeConstruction, queueInvestment,
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
  '.xch-list', '.xch-dossier', '.tech-tree',
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
 * Boyalı bütçe madalyonları. Mal ikonlarıyla aynı aile (pirinç halka, koyu
 * sahne) ama ayrı klasör: bunlar mal değil, defter kalemi. Boyası olmayan
 * kalem yukarıdaki çizgi PICTO'suna düşer — karışık set kazası olmasın diye
 * ikisi de aynı kutuya, aynı ölçüde oturur (bkz. .ledger-picto).
 */
const LEDGER_ART = (name) =>
  `<img class="ledger-art" src="assets/icons/budget/${name}.png" alt="" loading="lazy" decoding="async">`;

const LEDGER = {
  taxLower: LEDGER_ART('lower_class_tax'),
  taxMiddle: LEDGER_ART('middle_class_tax'),
  taxUpper: LEDGER_ART('upper_class_tax'),
  tariff: LEDGER_ART('tariff'),
  welfare: LEDGER_ART('welfare'),
  treasury: LEDGER_ART('treasury'),
  armyFunding: LEDGER_ART('army'),
  education: LEDGER_ART('education'),
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
    `Interest this week  =  £${interest.toFixed(1)}`,
    `Ledger net  =  ${net >= 0 ? '+' : ''}£${net.toFixed(1)}/wk`,
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
    // Siyaset ekraninin bekleyen onayi: `gov:<parti>` ya da `law:<yasa>:<kademe>`.
    this.politicsConfirm = null;
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
    // SURUKLEME SIRASINDA TAZELEME YOK. Haftalik tik ekrani bastan kurar ve
    // parmagin altindaki kaydiraci DOM'dan kaldirir: surukleme sessizce
    // kopuyor, oyuncu "kaydirac tutmuyor" sanip tekrar deniyordu (kor oyun
    // testi: egitim 0 -> 0 -> 50, ordu 100'de takili). Tazeleme birakilana
    // kadar bekletilir.
    this.dragging = false;
    this.refreshPending = false;
    this.el.body.addEventListener('pointerdown', (event) => {
      if (event.target?.matches?.('input[type="range"]')) this.dragging = true;
    });
    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.refreshPending) {
        this.refreshPending = false;
        // `change` olayi pointerup'tan sonra gelir; onun refresh'i onde olsun.
        setTimeout(() => this.scheduleRefresh(), 0);
      }
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // Haritada yabancı toprağa sağ tık: o ülkenin paneli açılır.
    game.on('nation', (nationId) => this.openDossier(nationId));
    // Haritayi secim yuzeyi yapan tek ekran baris masasidir.
    game.on('select', (tile) => {
      if (this.active === 'peace') this.pickPeaceTile(tile);
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
    // Baris kipi haritayi ele gecirir; ekrandan cikarken geri verilmeli.
    if (this.active === 'peace' && name !== this.active) this.restoreMapMode();
    this.active = name;
    this.el.root.dataset.screen = name;
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
    if (this.active === 'peace') this.restoreMapMode();
    // Bekleyen onaylar ekranla birlikte duser.
    this.politicsConfirm = null;
    this.warConfirm = null;
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
    // Yatay konum da tutulur: dar pencerede kaydirilmis teknoloji agaci her
    // tiklamada basa donuyordu.
    return SCROLL_KEEPERS.map((selector) => {
      const node = this.el.body.querySelector(selector);
      return node ? [selector, node.scrollTop, node.scrollLeft] : null;
    }).filter(Boolean);
  }

  restoreScroll(saved) {
    for (const [selector, top, left] of saved) {
      const node = this.el.body.querySelector(selector);
      if (!node) continue;
      node.scrollTop = top;
      node.scrollLeft = left ?? 0;
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
    if (this.dragging) {
      this.refreshPending = true;
      return;
    }
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
    // Gövde her tazelemede baştan kurulduğu için bayrak kapları da yenidir;
    // canvas'lar burada takılır (kopan eskiler kendi kendini siler).
    hydrateFlags(this.el.body, this.game.world.nations);
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
    const crisis = crisisLeft(world, me.id, target.id, turn);
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
        : crisis ? `<span class="tag crisis">war in ${crisis}w</span>`
          : truce ? `<span class="tag truce">truce ${truce}w</span>`
            : '<span class="tag peace">at peace</span>',
      allied ? '<span class="tag ally">ally</span>' : '',
      me.rivalId === target.id ? '<span class="tag rival">our rival</span>' : '',
      target.rivalId === me.id ? '<span class="tag rival">sees us as the rival</span>' : '',
    ].filter(Boolean).join(' ');

    return `<div class="card nation-dossier">
      <div class="dossier-head">
        <span class="flag-hero small" data-flag-nation="${target.id}" data-flag-w="96" data-flag-h="64"></span>
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
      : `<button class="action${this.warConfirm === target.id ? ' confirming' : ''}" data-war="${target.id}" ${truce ? 'disabled' : ''}>${
        this.warConfirm === target.id
          ? `Click again to declare war: ${ULTIMATUM_WEEKS}-week ultimatum, infamy per province taken`
          : 'Declare War'}</button>
         <button class="action" data-ally="${target.id}">Propose Alliance</button>`}
        <button class="action" data-locate="${target.id}">Show on map</button>
      </div>
    </div>`;
  }

  /**
   * Dosyanin kimlik seridi: kultur, rejim, teknolojik duruspozisyon ve
   * karakter cumlesi.
   *
   * Bu metot CAGRILIYORDU ama hic tanimlanmamisti (HEAD'de de yoktu): diplomasi
   * dosyasini her acis `TypeError` firlatiyor, ekran yarim kaliyordu. Sayilar
   * mevcut kaynaklardan gelir; burada hicbir sey uretilmez.
   */
  dossierIdentity(world, target) {
    const culture = world.cultures?.[target.culture]?.name ?? 'Unknown';
    const government = governmentType(target);
    const standing = techStanding(world, target);
    const line = characterLine(world, target);
    const cell = (label, value) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    return `<div class="dossier-facts">
      ${cell('Culture', culture)}
      ${cell('Government', government?.name ?? government ?? 'Unknown')}
      ${cell('Technology', standing?.label ?? standing ?? '—')}
      ${cell('Coast', target.coastal ? 'Maritime access' : 'Landlocked')}
    </div>
    ${line ? `<p class="dossier-character">${esc(line)}</p>` : ''}`;
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
    // NE URETIYOR? Masa il adi ve hex sayisi veriyordu; oyuncu sulfur kumesini
    // sigir kumesi sanip aldi (kor oyun testi: Zelfell/Norrfell). Kaynak
    // etiketi her satirda durur.
    const rgoOf = (province) => {
      const type = RGO_TYPES[province?.econ?.rgo];
      return type ? ` · ${type.icon} ${type.name}` : '';
    };
    const list = (keys, kind) => (keys.length ? keys.map((key) => {
      const province = provinceFromKey(world, key);
      if (!province) return '';
      const starred = province.tileIdx.some((idx) => world.tiles[idx].city);
      return `<div class="peace-tile ${kind}">
        <span>${esc(province.name)}${starred ? ' ★' : ''} · ${province.tileIdx.length} hex${esc(rgoOf(province))}</span>
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
          <span class="por-meta">${province.tileIdx.length} hex${esc(rgoOf(province))} · ${Math.round(share * 100)}% held${
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
        <b class="pg-name">${esc(goal.name)}${esc(rgoOf(goal))}</b>
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
    return `<span>£ <b>${Math.round(me.gold)}</b> ${sign}</span>
      <span>GDP <b>£${Math.round(me.economy?.gdp ?? 0)}</b></span>
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
    const taxes = me.economy?.taxes ?? {};

    return `<div class="nation-hero card">
        <span class="flag-hero" data-flag-nation="${me.id}" data-flag-w="210" data-flag-h="140"></span>
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
        <div><span>Construction</span><b>${constructionPower(me).toFixed(1)}/wk</b><small>build power</small></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>National Economy</h3><small>current fiscal system</small></div>
        <div class="economy-ledger">
          <span><small>Treasury</small><b>£${Math.round(me.gold)}</b></span>
          <span><small>GDP</small><b>£${Math.round(me.economy?.gdp ?? 0)}</b></span>
          <span><small>Tax revenue</small><b>£${(me.economy?.taxRevenue ?? 0).toFixed(1)}</b></span>
          <span><small>Weekly balance</small><b class="${weeklyBalanceOf(me) < 0 ? 'res-neg' : 'res-pos'}">${weeklyBalanceOf(me) >= 0 ? '+' : ''}£${weeklyBalanceOf(me).toFixed(1)}</b></span>
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
  /**
   * Insaat amblemleri. Kuyrukta duran sey cogunlukla bir FABRIKADIR, yani
   * kimligi urettigi maldir: boyali madalyon oradan gelir (bkz. icons/index).
   * Geriye kalan uc ulusal kalem icin cizgi glifi — emoji, sekme kunyeleri ve
   * defter madalyonlarinin yanina baska bir setten yapistirilmis duruyordu.
   */
  static BUILD_GLYPH = {
    CONSTRUCTION_CAPACITY: PICTO_SHELL('<path d="M2.5 13.5h11M4 13.5V6l4-2.5L12 6v7.5M6.5 13.5v-3.5h3v3.5M4 8.5h8"/>'),
  };

  /** Bir kuyruk satirinin amblemi: once urunun madalyonu, sonra cizgi glifi. */
  buildEmblem(typeId) {
    const factory = FACTORIES[typeId];
    if (factory) {
      const output = Object.keys(factory.outputs ?? {})[0] ?? null;
      return factoryEmblem(typeId, output);
    }
    return Screens.BUILD_GLYPH[typeId] ?? Screens.BUILD_GLYPH.CONSTRUCTION_CAPACITY;
  }

  /**
   * INSAAT — ozet seridi, kapasite karti, tek kuyruk.
   *
   * Kale ve Higher Education kalkinca ekranin anlatacagi iki sey kaldi: ne kadar
   * hizli insa ediyorsun (kapasite) ve sirada ne var (kuyruk). Bolge yuvalari
   * yalniz kaleyi saydigi icin onlarla gitti; harita secimi de. Butun sayilar
   * `construction.constructionView`dan hazir gelir.
   */
  render_construction(me) {
    const view = constructionView(me, {
      projectName: (project) => {
        if (project.kind === 'national') return NATIONAL_INVESTMENTS[project.typeId]?.name ?? project.typeId;
        const name = FACTORIES[project.typeId]?.name ?? project.typeId;
        return project.kind === 'upgrade' ? `${name} expansion` : name;
      },
    });
    const cap = view.capacity;
    const weeks = (n) => `${n} week${n === 1 ? '' : 's'}`;
    const kpi = (arg, label, value, sub) => `<div class="ui-kpi" data-tip="construction" data-tip-arg="${arg}">
      <small>${label}</small><b>${value}</b><span>${sub}</span></div>`;

    const kpis = `<div class="ui-kpis con-kpis">
      ${kpi('power', 'Build power', `${view.power.toFixed(1)}<em>/wk</em>`,
    `base ${view.basePower} · capacity +${(view.power - view.basePower).toFixed(1)}`)}
      ${kpi('queue', 'Queue', `${view.own.length}<em> ${view.own.length === 1 ? 'project' : 'projects'}</em>`,
    `${Math.round(view.workLeft)} work left`)}
      ${kpi('clears', 'Clears in', view.own.length ? `~${view.clearsIn}<em> wk</em>` : '—',
    view.own.length ? 'at current build power' : 'nothing queued')}
      ${kpi('upkeep', 'Upkeep', `<i class="res-neg">−£${view.upkeep.toFixed(1)}</i><em>/wk</em>`,
    `${cap.level} capacity ${cap.level === 1 ? 'level' : 'levels'}`)}
      ${kpi('investors', 'Investor sites', `${view.investors.length}`,
    `£${view.privateInflow.toFixed(1)}/wk raised`)}
    </div>`;

    const capped = cap.blocked === 'already at the highest level';
    const capacityCard = `<section class="ui-panel con-capacity">
      <header class="ui-panel-head"><h3>Construction Capacity</h3><em>investment</em></header>
      <div class="con-cap-level">
        <i class="build-emblem">${Screens.BUILD_GLYPH.CONSTRUCTION_CAPACITY}</i>
        <span><b>Level ${cap.level}${cap.pending ? `<em> +${cap.pending} queued</em>` : ''}</b>
          <small>+${cap.level * cap.perLevel} build power · −£${(cap.level * cap.upkeepPerLevel).toFixed(1)}/wk</small></span>
      </div>
      <dl class="ui-facts con-cap-next">
        <div><dt>Next level</dt><dd>£${cap.cost}</dd></div>
        <div><dt>Adds</dt><dd class="res-pos">+${cap.perLevel}/wk</dd></div>
        <div><dt>Upkeep</dt><dd class="res-neg">−£${cap.upkeepPerLevel}/wk</dd></div>
      </dl>
      <div class="ui-actions">
        <button class="ui-btn primary" data-invest="${cap.id}" ${cap.blocked ? 'disabled' : ''}
          data-tip="construction" data-tip-arg="invest">${capped ? 'Highest level' : `Invest · £${cap.cost}`}</button>
        <button class="ui-btn" data-divest="${cap.id}" ${cap.level > 0 ? '' : 'disabled'}
          data-tip="construction" data-tip-arg="divest">Dissolve a level</button>
      </div>
      ${cap.blocked && !capped ? `<p class="ui-note warn">Invest: ${esc(cap.blocked)}.</p>` : ''}
      ${cap.idle ? `<p class="ui-note warn">Build power is idle: nothing is queued, yet −£${(cap.level * cap.upkeepPerLevel).toFixed(1)}/wk upkeep still runs.</p>` : ''}
      <p class="ui-note">Factories are founded and expanded on the Factories screen; their sites join this queue.</p>
    </section>`;

    // KUYRUK KATLANIR. Seksen yedi projelik kuyrukta bes dugmeli satirlar ne
    // okunuyordu ne kullaniliyordu; ilk sekiz sira gorunur, gerisi istenirse.
    const QUEUE_HEAD = 8;
    const collapsed = !this.queueExpanded && view.own.length > QUEUE_HEAD;
    const shown = collapsed ? view.own.slice(0, QUEUE_HEAD) : view.own;
    // IKI EMIR YETER: "bunu simdi istiyorum" ya da "bunu istemiyorum". Bir sira
    // yukari/asagi dugmeleri kirk fabrikada kirk tik ile ayni cinsten yuktu.
    const row = (item, index) => `<li class="con-row${item.dormant ? ' dormant' : ''}">
      <strong>${item.private ? '' : index + 1}</strong>
      <i class="build-emblem">${this.buildEmblem(item.typeId)}</i>
      <span class="con-row-name"><b>${esc(item.name)}</b><small>${esc(item.place)}</small></span>
      <span class="con-row-progress">
        <i class="ui-bar"><i style="width:${item.private ? item.funded : item.percent}%"></i></i>
        <em>${item.private ? `${item.funded}% paid` : `${Math.round(item.progress)} / ${Math.round(item.work)}`}</em>
      </span>
      ${item.private
    ? `<span class="con-row-eta">${item.dormant ? 'dormant' : `${item.percent}% built`}</span>`
    : `<span class="con-row-eta">${weeks(item.eta)}</span>
      <span class="ui-actions compact">
        <button class="ui-btn sm" data-project-top="${item.id}" ${index === 0 ? 'disabled' : ''}>First</button>
        <button class="ui-btn sm danger" data-project-cancel="${item.id}">Drop</button>
      </span>`}
    </li>`;

    const queue = `<section class="ui-panel con-queue">
      <header class="ui-panel-head"><h3>Construction Queue</h3>
        <em>${view.own.length ? 'built top to bottom · capacity first' : 'empty'}</em></header>
      ${view.own.length
    ? `<ol class="con-rows">${shown.map(row).join('')}</ol>${view.own.length > QUEUE_HEAD
      ? `<button class="ui-btn ghost con-more" data-queue-toggle="1">${collapsed
        ? `Show the other ${view.own.length - QUEUE_HEAD} projects` : `Show only the next ${QUEUE_HEAD}`}</button>` : ''}`
    : `<div class="ui-empty"><b>Nothing is being built</b>
        <span>Invest in capacity on the left, or found a factory on the Factories screen.</span></div>`}
      ${view.investors.length ? `<header class="ui-subhead"><h4>Investor sites</h4>
        <em>private capital pays and orders these</em></header>
      <ol class="con-rows investors">${view.investors.map(row).join('')}</ol>` : ''}
    </section>`;

    return `<div class="con">${kpis}<div class="con-body">${capacityCard}${queue}</div></div>`;
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
    const mobilizeBtn = body.querySelector('[data-military-mobilize]');
    if (mobilizeBtn) {
      mobilizeBtn.onclick = () => {
        // Tek ulusal anahtar; sart ve engel game/mobilization.js'te.
        game.toggleMobilization();
        this.refresh();
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
    // Paranin isareti METIN degil, madalyondur. Satir ici kucuk sayilarda
    // '\u00a3' karakteri kalir (madalyon 13px'te okunmuyor); defterin
    // GORUNUR tutarlari kendi sikkesini tasir.
    const coin = '<img class="coin" src="assets/icons/budget/treasury.png" alt="\u00a3"'
      + ' loading="lazy" decoding="async">';
    const money = (v) => `${v >= 0 ? '+' : '\u2212'}${coin}${Math.abs(v).toFixed(1)}`;
    const vbox = (v, tone = null) => {
      const cls = tone ?? (v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : '');
      return `<span class="vbox ${cls}">${coin}${Math.abs(v).toFixed(1)}</span>`;
    };
    // `--fill` kaydiracin DOLU kismini boyar. Saf CSS ile bir range girdisinin
    // degerine gore yatak boyanamaz; oran burada yaziliir, boyama CSS'te kalir.
    /**
     * Kaydiracin uzerindeki iki esik isareti (yalniz vergi satirlarinda).
     *
     * Yesil: sinifin sepetinin TAMAMINI karsilayabildigi en yuksek oran.
     * Kirmizi: %60 gecim tabanini hala karsilayabildigi en yuksek oran; ustu
     * sinif dususu demektir. Ikisi de `classTaxThresholds` uretir.
     *
     * Isaretler TIKLANABILIR: mikro yonetimi olduren sey bu. Oyuncu her sinif
     * icin "acaba kac olmali" diye hesap yapmak yerine esige oturur (bkz.
     * VICTORIA_LITE "ev odevi testi").
     */
    const marks = (policy, cfg) => {
      const th = cfg.thresholds;
      if (!th || cfg.max <= cfg.min) return '';
      const at = (v) => (((v - cfg.min) / (cfg.max - cfg.min)) * 100).toFixed(1);
      const held = cfg.hold ?? null;
      const pin = (kind, value, title) => `<button class="tax-mark ${kind}${
  held === (kind === 'safe' ? 'safe' : 'edge') ? ' held' : ''}"
        style="left:${at(value)}%" data-tax-set="${policy}" data-tax-value="${value}"
        title="${esc(title)} — click to set ${value}%"></button>`;
      // Ulasilamayan esik CIZILMEZ: iki isaret de tabanda ust uste durunca
      // kaydirac "ne yaparsan yap acliktan oluyorlar" gibi okunuyordu.
      return (th.comfortReachable
        ? pin('safe', th.comfort, `${th.comfort}%: they still afford their whole basket`) : '')
        + (th.survivalReachable
          ? pin('edge', th.survival,
            `${th.survival}%: last rate before they fall below subsistence`) : '');
    };

    const hslider = (policy, current, min, max, step = 5, cfg = null) => {
      const fill = max > min ? ((current - min) / (max - min)) * 100 : 0;
      // Vergi kaydiraci matrahi tasir: suruklerken satir "x oran = tutar"
      // cumlesini canli yazabilsin (bkz. bindBudget oninput). Formul degil,
      // dokumun kendi matrahi x oyuncunun secmekte oldugu oran.
      const base = cfg && policy.startsWith('tax') ? ` data-base="${(cfg.base ?? 0).toFixed(2)}" data-population="${cfg.population ?? 0}"` : '';
      return `<span class="hslider"><i class="cap"></i><input type="range"
        min="${min}" max="${max}" step="${step}" value="${current}"
        style="--fill:${fill.toFixed(1)}%"
        data-policy="${policy}"${base}><i class="cap"></i>${cfg ? marks(policy, cfg) : ''}</span>`;
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
    /**
     * ESIGE KILITLE. Iki kucuk anahtar: yesilde tut / kirmizida tut.
     *
     * Esikler her hafta oynuyor (sepet fiyati, gelir, refah degisiyor), yani
     * elle kurulan bir oran birkac hafta sonra kirmizinin ustune kayabiliyor
     * ve oyuncu bunu ancak sinif dustugunde goruyordu. Kilit oyuncunun
     * NIYETINI korur: "beni geciminin altina dusurme" ya da "kar birakacak
     * kadar zorla, ama daha fazla degil".
     */
    const holdSwitch = (policy, cfg) => {
      const th = cfg.thresholds;
      if (!th) return '';
      const chip = (mode, on, label, title) => (on
        ? `<button class="tax-hold ${mode}${cfg.hold === mode ? ' on' : ''}"
            data-tax-hold="${policy}" data-hold-mode="${mode}"
            title="${esc(title)}">${label}</button>`
        : '');
      return `<span class="tax-hold-row">${
  chip('safe', th.comfortReachable, 'hold', `Keep this at ${th.comfort}% — the highest rate that still lets them afford their whole basket`)
}${
  chip('edge', th.survivalReachable, 'max', `Keep this at ${th.survival}% — the highest rate before they fall below subsistence`)
}</span>`;
    };

    // TEK DOGRU: harcama satiri defterin kapanmis tutarini basar (uyari da
    // onu okur). Kaydirac oynadiysa yeni maliyet notta "next week" olarak
    // durur; iki sayi ayni satirda, ikisi de adlandirilmis.
    const settled = (cfg) => (cfg.actual != null ? cfg.actual : cfg.cost);
    const projectedNote = (cfg) => {
      const next = cfg.projected ?? cfg.cost;
      return cfg.actual != null && Math.abs(cfg.actual - next) > 0.05
        ? ` <em class="ledger-projected">next week \u2248 \u00a3${next.toFixed(1)}</em>`
        : '';
    };

    const control = (policy, label, picto, cfg, amount, breakdown) => `
      <div class="ledger-row">
        <span class="ledger-picto">${picto}</span>
        <span class="ledger-mid">
          <span class="ledger-label">
            <span class="ledger-what" data-tip="budget" data-tip-arg="${esc(policy)}" tabindex="0"
              >${esc(label)}<i class="ledger-hint" aria-hidden="true">?</i></span>
            <b>${cfg.value}%</b>${holdSwitch(policy, cfg)}</span>
          ${hslider(policy, cfg.value, cfg.min, cfg.max, 5, cfg)}
          ${band(cfg.min, cfg.max)}
          <small class="ledger-note">${breakdown}</small>
        </span>
        ${vbox(amount)}
      </div>`;

    // Kaydiraci olmayan kalemlerin cumlesi. Iki oyuncu da iflasin en buyuk iki
    // kalemini ("Strategic imports", "External settlement") okuyamadi; sayi
    // vardi, anlami yoktu (Open Beta 4). Metin defter satirinin ne oldugunu
    // soyler, tutari yeniden hesaplamaz.
    // Yonetim gideri en buyuk kalemken tek satirla "otomatik buyur" diyordu;
    // dokum cities.administrationBreakdown'dan gelir, ekran yeniden hesaplamaz.
    const administrationNote = (nation) => {
      const parts = nation?.budget?.administrationParts;
      if (!parts) return LEDGER_NOTES.administration;
      const items = [
        ['cities beyond the capital', parts.cities],
        ['provinces', parts.provinces],
        ['distance from the capital', parts.distance],
        ['population', parts.people],
      ].filter(([, v]) => v >= 0.05)
        .sort((a, b) => b[1] - a[1])
        .map(([label, v]) => `${label} £${v.toFixed(1)}`);
      return items.length
        ? `automatic: ${items.join(' · ')}. Cities cost more each (power 1.6); far-flung ones add distance.`
        : 'automatic: the capital administers itself for free';
    };
    const LEDGER_NOTES = {
      state: 'what state-owned factories and provincial raw output pay the treasury',
      settlement: 'cash settled with the world market this week: goods sold abroad minus goods bought',
      treaty: 'indemnities and tribute owed or received under signed treaties',
      administration: 'automatic: grows with cities, provinces and population',
      construction: 'upkeep of construction capacity; one-off investment payments',
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
    // Üç satır tek `PICTO.lower`ı paylaşıyordu: sınıflar aynı simgeyle
    // çizilince kaydıraçların hangisi olduğu ancak yazıdan okunuyordu.
    const taxControls = TAX_POLICIES.map(([policy, label]) => {
      const cfg = c[policy];
      if (!cfg) return '';
      // Vergi o sinif icin kaldirac degilse satir bunu SOYLER; isaretin
      // yoklugu tek basina sessiz kalirdi.
      const th = cfg.thresholds;
      // UC DURUM, UC CUMLE: (a) vergi o sinifa yetismez,
      // (b) oran kirmizi isaretin USTUNDE — sinif geciminin altina duser ve
      //     dort hafta sonra KALICI olarak bir alt sinifa gecer,
      // (c) sorun yok, bir sey yazma.
      // Olculdu: tam vergiyle 400 haftada ust sinif 45.6K'dan 9.0K'ya dusuyor
      // ve haftalik net -89'a iniyor; ekran bunu hic soylemiyordu.
      const overEdge = th && th.survivalReachable && cfg.value > th.survival;
      const powerless = th && !th.survivalReachable
        ? ' \u00b7 tax cannot reach them: the basket alone outruns their income'
        : overEdge
          ? ` \u00b7 above ${th.survival}% they fall below subsistence — four weeks of that and they drop a class for good`
          : '';
      // KAYDIRAC OYNADIYSA SATIR YALAN SOYLEMESIN. `collected` gecen haftanin
      // oraniyla kapanmis tutardir; oran degistiyse "£83 x 10% = £16.6" gibi
      // yanlis bir aritmetik bir hafta ekranda kaliyordu (kor oyun testi).
      // Kapanmis oran matrahtan turer, formul degil: collected / base.
      const settledRate = cfg.base > 0 ? (cfg.collected / cfg.base) * 100 : cfg.value;
      const stale = Math.abs(settledRate - cfg.value) > 0.5;
      const projected = cfg.base * cfg.value / 100;
      const arithmetic = stale
        ? ` \u00d7 ${cfg.value}% \u2248 \u00a3${projected.toFixed(1)}`
          + ` <em class="ledger-projected">projected \u2014 last week \u00a3${cfg.collected.toFixed(1)}`
          + ` at ${Math.round(settledRate)}%</em>`
        : ` \u00d7 ${cfg.value}% = \u00a3${cfg.collected.toFixed(1)}`;
      return control(policy, label, LEDGER[policy], cfg, stale ? projected : cfg.collected,
        `${formatPopulation(cfg.population)} people \u00b7 income \u00a3${cfg.base.toFixed(1)}`
        + `${arithmetic}${powerless}`);
    }).join('');
    const taxSummary = c.taxSummary;

    return `<div class="ledger">
      <section class="ledger-col">
        <header class="ledger-head">Revenue</header>

        ${taxControls}
        <div class="tax-summary">
          <span>Tax system</span><b>${esc(taxSummary.structure)}</b>
          <small>\u00a3${taxSummary.collected.toFixed(1)} collected of \u00a3${taxSummary.base.toFixed(0)} income</small>
        </div>

        ${control('tariff', 'Tariff', LEDGER.tariff, c.tariff, c.tariff.revenue,
    `imports \u00a3${c.tariff.imports.toFixed(1)} \u00b7 revenue \u00a3${c.tariff.revenue.toFixed(1)}`
        + ` \u00b7 imported goods cost <b>+${c.tariff.priceEffect}%</b>`)}

        ${view.incomeRows.filter((r) => r.id !== 'tax' && r.id !== 'tariff')
    .map((r) => row(r.label, r.amount, LEDGER_NOTES[r.id] ?? '')).join('')}

        <div class="ledger-total"><span>Total income</span>
          <span class="vbox pos big">${coin}${view.income.toFixed(1)}</span></div>
      </section>

      <section class="ledger-col">
        <header class="ledger-head">Spending</header>

        ${control('armyFunding', 'Army', LEDGER.armyFunding, c.armyFunding, -c.armyFunding.cost,
    `combat power <b>\u00d7${c.armyFunding.combatPower.toFixed(2)}</b>`
        + ` \u00b7 reinforcement <b>\u00d7${c.armyFunding.reinforcement.toFixed(2)}</b>`
        + ` \u00b7 training <b>\u00d7${c.armyFunding.training.toFixed(2)}</b>`
        + ` \u00b7 supply ${Math.round(c.armyFunding.supply * 100)}%`)}

        ${control('education', 'Education', LEDGER.education, c.education, -settled(c.education),
    `literacy ${(c.education.literacy * 100).toFixed(1)}% \u2192 target`
        + ` <b>${(c.education.literacyTarget * 100).toFixed(0)}%</b>`
        + ` \u00b7 research <b>${c.education.researchPoints.toFixed(2)}</b>/wk${projectedNote(c.education)}`)}

        ${control('welfare', 'Welfare', LEDGER.welfare, c.welfare, -settled(c.welfare),
    `satisfaction <b>+${(c.welfare.satisfaction * 100).toFixed(1)}</b>`
        + ` \u00b7 population growth <b>\u00d7${c.welfare.growth.toFixed(2)}</b>`
        + (c.welfare.mandated > 0.05
          ? ` \u00b7 includes \u00a3${c.welfare.mandated.toFixed(1)} of entitlements set by law`
          : '')
        + projectedNote(c.welfare))}

        ${view.expenseRows.filter((r) => !['army', 'procurement', 'education', 'welfare'].includes(r.id))
    .map((r) => row(r.label, r.amount,
      r.id === 'administration' ? administrationNote(me) : (LEDGER_NOTES[r.id] ?? ''))).join('')}

        <div class="ledger-total"><span>Total spending</span>
          <span class="vbox neg big">${coin}${view.expenses.toFixed(1)}</span></div>

        <header class="ledger-head sub" data-tip="treasury" tabindex="0">
          <img class="head-coin" src="assets/icons/budget/treasury.png" alt="" decoding="async">National Bank</header>
        <div class="bank-rows">
          <div class="bank-line"><span>Treasury</span><b>\u00a3${Math.round(view.treasury)}</b>
            <span>Available credit</span><b>\u00a3${Math.round(Math.max(0, debtCapacity(me) - view.debt))}</b></div>
          <div class="bank-line"><span>Total debt</span>
            <b class="${view.debt > 0 ? 'neg' : ''}">\u00a3${Math.round(view.debt)}</b>
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
    // Secim yokken dosya bos kalmaz: en kalabalik grup acik gelir (bos panel
    // "Select a group" diyen olu bir kutuydu). Oyuncunun secimi kalicidir,
    // varsayilan secim degildir — kayit alani null kalir.
    const groupId = state.group ?? view.groups[0]?.id ?? null;
    const detail = groupId ? populationGroupDetail(view, groupId) : null;
    return populationScreen(view, { ...state, group: groupId }, detail);
  }

  /** Nufus ekraninin etkilesimleri. */
  bindPopulation() {
    const state = this.population;
    for (const btn of this.el.body.querySelectorAll('[data-pop-accept]')) {
      btn.onclick = () => {
        // Tek ulusal karar; butun sartlar game/culture.js'te (YZ ayni kapidan).
        if (acceptCulture(this.game, this.me, Number(btn.dataset.popAccept))) this.refresh();
      };
    }
    // Kirik kumenin diger iki cikisi. Ucu de HALK basinadir ve ucu de YZ'nin
    // kullandigi fonksiyonun ta kendisidir (bkz. culture.js manageBrokenProvinces).
    for (const btn of this.el.body.querySelectorAll('[data-pop-release]')) {
      btn.onclick = () => {
        if (releaseToKin(this.game, this.me, Number(btn.dataset.popRelease))) this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-pop-expel]')) {
      btn.onclick = () => {
        if (expelCulture(this.game, this.me, Number(btn.dataset.popExpel))) this.refresh();
      };
    }
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


  // --- Teknoloji: zaman cizelgeli agac (bkz. technologyScreen.js) ---
  render_technology(me) {
    const world = this.game.world;
    const turn = world.turn ?? 1;
    const year = 1836 + Math.floor((turn - 1) * 7 / 365);
    const standing = techStanding(world, me);
    return technologyScreen(me, {
      year,
      yearExact: 1836 + ((turn - 1) * 7) / 365,
      rate: researchPointsOf(me),
      rateLines: researchRateLines(me),
      rank: standing.rank,
      of: standing.of,
      // SERT KURAL: ekran ETKIN maliyeti gosterir (yayilim indirimi dahil).
      // Liste fiyati basmak, motorun dusecegi sayiyla celisir ve
      // UI_TRUTH_FIXES'in kapattigi hata sinifini yeniden acardi.
      costOf: (techId) => effectiveTechCost(world, me, techId, year),
    });
  }

  // --- Politics: hükûmet ve beş yasa (bkz. politicsScreen.js) ---
  render_politics(me) {
    if (!me.politics?.parties?.length || !rulingParty(me)) {
      return '<p class="empty">Political parties are not initialized.</p>';
    }
    const world = this.game.world;
    return politicsScreen(governmentView(world, me), lawBoard(world, me), this.politicsConfirm);
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
      const crisis = crisisLeft(world, n.id, me.id, turn);
      const rec = relation(world, n.id, me.id);
      const truce = truceLeft(world, n.id, me.id, turn);
      const locked = war && turn - rec.since < MIN_WAR_TURNS;
      const power = nationStrength(world, n);
      const tag = war ? '<span class="tag war">war</span>'
        : crisis ? `<span class="tag crisis">war in ${crisis}w</span>`
          : truce ? `<span class="tag truce">truce ${truce}</span>`
            : '<span class="tag peace">peace</span>';
      const action = war
        ? `<button class="action" data-peace="${n.id}" ${locked ? 'disabled' : ''}>Offer Peace${locked ? ` (${MIN_WAR_TURNS - (turn - rec.since)})` : ''}</button>`
        : crisis
          ? `<button class="action" disabled title="The ultimatum runs out in ${crisis} weeks; mobilize from the Military screen.">Ultimatum (${crisis}w)</button>`
          : `<button class="action${this.warConfirm === n.id ? ' confirming' : ''}" data-war="${n.id}" ${truce ? 'disabled' : ''}>${
            this.warConfirm === n.id ? 'Click again to declare war' : 'Declare War'}</button>`;

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
      // `soldiers` GUC PUANIDIR ve STR oraninin paydasidir; ekranda "kac
      // kisi" yazacaksak insan sayisi ayri okunur (units.menUnderArms).
      const men = armies.reduce((sum, army) => sum + menUnderArms(army), 0);
      const soldiers = armies.reduce((sum, army) => sum + soldiersOf(army), 0);
      const maxStrength = armies.reduce((sum, army) => sum + maxHpOf(army), 0);
      const organization = soldiers > 0
        ? armies.reduce((sum, army) => sum + organizationOf(army) * soldiersOf(army), 0) / soldiers
        : 0;
      const strength = maxStrength > 0 ? soldiers / maxStrength : 0;
      return { men, soldiers, strength, organization, divisions: armies.length };
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
          <span><small>${esc(me.name)} · ${mine.divisions} divisions</small><b>${formatPopulation(mine.men)} · STR ${Math.round(mine.strength * 100)}% · ORG ${Math.round(mine.organization)}%</b></span>
          <strong>VS</strong>
          <span><small>${esc(world.nations[enemyId].name)} · ${enemy.divisions} divisions</small><b>${formatPopulation(enemy.men)} · STR ${Math.round(enemy.strength * 100)}% · ORG ${Math.round(enemy.organization)}%</b></span>
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
    }, this.tradeGood, this.tradeFilter ?? 'all');
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
    for (const btn of this.el.body.querySelectorAll('[data-tech]')) {
      // Tik hemen arastirir (kilitliyse yolunu kurar), shift+tik kuyruga
      // ekler, sag tik kuyruktan cikarir: agacin uc fiili, ayri dugme yok.
      btn.onclick = (event) => {
        if (event.shiftKey) queueResearch(me, btn.dataset.tech);
        else researchNow(me, btn.dataset.tech);
        this.refresh();
      };
      btn.oncontextmenu = (event) => {
        event.preventDefault();
        if (dequeueResearch(me, btn.dataset.tech)) this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-dequeue]')) {
      btn.onclick = () => {
        dequeueResearch(me, btn.dataset.dequeue);
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
    // Hükûmet ve yasa. IKI TIK: ikisi de kilit baslatir (hukumet dort yil,
    // yasa bir yil); kor oyun testinde ilk deneme tiki bir yillik kilide
    // donusmustu. Ilk tik bedeli soyler, ikincisi uygular. Kapi kontrolu
    // politics.js'te; kapaliysa dugme zaten cizilmez.
    const confirmThen = (key, apply) => {
      if (this.politicsConfirm !== key) {
        this.politicsConfirm = key;
        this.refresh();
        return;
      }
      this.politicsConfirm = null;
      apply();
      this.refresh();
    };
    for (const btn of this.el.body.querySelectorAll('[data-form-government]')) {
      const partyId = btn.dataset.formGovernment;
      btn.onclick = () => confirmThen(`gov:${partyId}`, () => formGovernment(game, me, partyId));
    }
    for (const btn of this.el.body.querySelectorAll('[data-set-law]')) {
      const [lawId, levelId] = btn.dataset.setLaw.split(':');
      btn.onclick = () => confirmThen(`law:${lawId}:${levelId}`, () => setLaw(game, me, lawId, levelId));
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
    const lockedToggle = this.el.body.querySelector('[data-build-locked]');
    if (lockedToggle) {
      lockedToggle.onclick = () => { industry.buildShowLocked = !industry.buildShowLocked; this.refresh(); };
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
        const before = me.gold ?? 0;
        if (supportProject(game, me, Number(btn.dataset.support), { full: event.shiftKey })) {
          // Odeme makbuzu: eskiden hazine sessizce dusuyor, oyuncu ne
          // odedigini ancak ust cubuktan tahmin ediyordu (kor oyun testi).
          const paid = Math.max(0, before - (me.gold ?? 0));
          game.turns.addLog(`Treasury paid £${paid.toFixed(0)} toward ${btn.dataset.name ?? 'the site'}.`,
            { kind: 'INDUSTRY', key: `fund-${btn.dataset.support}` });
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
    for (const chip of this.el.body.querySelectorAll('[data-trade-filter]')) {
      chip.onclick = () => { this.tradeFilter = chip.dataset.tradeFilter; this.refresh(); };
    }
    const queueToggle = this.el.body.querySelector('[data-queue-toggle]');
    if (queueToggle) {
      queueToggle.onclick = () => { this.queueExpanded = !this.queueExpanded; this.refresh(); };
    }
    // Esik isaretine tiklamak orani oraya oturtur: ayni kapidan (setBudgetPolicy)
    // gecer, yani YZ ile oyuncunun yolu ayrilmaz.
    for (const chip of this.el.body.querySelectorAll('[data-tax-hold]')) {
      chip.onclick = () => {
        const classId = TAX_POLICY_CLASS[chip.dataset.taxHold];
        const mode = chip.dataset.holdMode;
        setTaxHold(me, classId, taxHold(me, classId) === mode ? null : mode);
        // Kilit ANINDA orani esige ceker; haftalik tiki beklerse oyuncu
        // "hicbir sey olmadi" sanip bir hafta sonra %78'i gorur (olcumlu:
        // kor oyun testi, MAX tiki -> 30% -> 78% -> 89% sessizce).
        applyTaxHolds(me);
        this.game.recomputeEconomy?.();
        this.game.emit?.('economy');
        this.refresh();
      };
    }
    for (const pin of this.el.body.querySelectorAll('[data-tax-set]')) {
      pin.onclick = (event) => {
        event.preventDefault();
        setBudgetPolicy(me, pin.dataset.taxSet, Number(pin.dataset.taxValue));
        this.game.emit?.('economy');
        this.refresh();
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
        // Vergi satirinin cumlesi de oynar: "£122 x 10% = £24.4" gibi yanlis
        // bir aritmetik bir hafta boyunca ekranda kaliyordu. Matrah dokumden,
        // oran kaydiractan; tutar "projected" diye isaretlenir cunku defter
        // haftalik kapanir.
        if (input.dataset.base != null) {
          const base = Number(input.dataset.base) || 0;
          const rate = Number(input.value) || 0;
          const projected = base * rate / 100;
          const note = input.closest('.ledger-mid')?.querySelector('.ledger-note');
          if (note) {
            note.innerHTML = `${formatPopulation(Number(input.dataset.population) || 0)} people \u00b7 income \u00a3${base.toFixed(1)}`
              + ` \u00d7 ${rate}% \u2248 \u00a3${projected.toFixed(1)} <em class="ledger-projected">projected \u2014 settles at the weekly tick</em>`;
          }
          const box = input.closest('.ledger-row')?.querySelector('.vbox');
          if (box) box.textContent = `\u2248\u00a3${projected.toFixed(1)}`;
        }
      };
      input.onchange = () => {
        // TEK AYAR KAPISI — YZ de ayni fonksiyonu cagirir (bkz. §23/§24).
        setBudgetPolicy(me, input.dataset.policy, Number(input.value));
        game.recomputeEconomy();
        game.emit('economy', me.economy);
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-war]')) {
      // Iki tik: ilki onay ister, ikincisi ilan eder (bkz. hud.bindActions).
      btn.onclick = () => {
        const id = Number(btn.dataset.war);
        if (this.warConfirm !== id) {
          this.warConfirm = id;
          clearTimeout(this.warConfirmTimer);
          this.warConfirmTimer = setTimeout(() => {
            if (this.warConfirm !== id) return;
            this.warConfirm = null;
            this.refresh();
          }, 8000);
          this.refresh();
          return;
        }
        this.warConfirm = null;
        clearTimeout(this.warConfirmTimer);
        game.declareWarOn(id);
        this.refresh();
      };
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
