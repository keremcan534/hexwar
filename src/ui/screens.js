// Ulusal ekranların kabuğu: sekme açma/kapama, yeniden çizim, ortak bağlama.
// Uluslar Çağı ekranları (Budget, Trade, Factories, Construction, Population,
// Politics) ui/stateScreens.js'tedir; burada dosya kartı, barış masası,
// diplomasi, ordu, teknoloji ve vakayiname kalır.

import { canAfford, pay } from '../game/cities.js';
import {
  MIN_WAR_TURNS, ULTIMATUM_WEEKS, atWar, crisisLeft, nationStrength, relation, truceLeft,
} from '../game/diplomacy.js';
import {
  MAX_DEMAND_PROVINCES, PEACE_TERMS, concedeKeyForTile, demandKeyForTile, occupiedProvincesOf,
  offerCost, offerRefusal, provinceFromKey, provinceKeyOf, provinceWarCost, signPeace,
  termAvailable, warGoalOf, warScore,
} from '../game/peace.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { maxHpOf, menUnderArms, organizationOf, soldiersOf } from '../game/units.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { hydrateFlags } from '../render/flagWave.js';
import { hegemonyScore, scoreboard, GOALS } from '../game/hegemony.js';
import { MAX_ROUNDS, battleSides, battlesFor } from '../game/battles.js';
import { cancelTraining, moveTrainingTo, prioritizeTraining } from '../game/recruitment.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import {
  armyComposition, commandRoster, militaryStats, militarySummary, recruitOptions, trainingRows,
  unassignedDivisions,
} from '../game/military.js';
import {
  BRANCH, assignDivisions, createGeneral, generalCost, officersOf, setCommandOption, setStance,
  unassignGeneral,
} from '../game/command.js';
import { militaryScreen } from './militaryScreen.js';
import { governmentType, rulingParty } from '../game/politics.js';
import { TIER, announce, chronicleYear, ensureChronicle, memoryOf } from '../game/chronicle.js';
import { allianceAppeal, alliesOf, breakAlliance, formAlliance, isAllied } from '../game/alliances.js';
import { characterLine, techStanding } from '../game/identity.js';
import {
  DELEGATION_AREAS, DELEGATION_IDS, isDelegated, lastDelegatedAction, setDelegation,
} from '../game/delegation.js';
import {
  dequeueResearch, effectiveTechCost, queueResearch, researchNow, researchPointsOf,
} from '../game/technology.js';
import {
  TECH_ZOOMS, researchRateLines, techInspector, technologyScreen,
} from './technologyScreen.js';
import { depositsOf } from '../game/econ/deposits.js';
import { motionOn } from './motion.js';
import { formatPopulation, populationOf, weeklyBalanceOf } from '../game/economy.js';
import { RESOURCES, RESOURCE_IDS } from '../game/econ/defs.js';
import {
  bindStateScreens, declareEmbargo, embargoBlockers, renderBudget, renderConstruction,
  renderIndustry, renderPolitics, renderPopulation, renderTrade,
} from './stateScreens.js';

/** Ekranın kapanış geçişi (styles.css §6 .screen.hidden) bitene kadar gövde kalır. */
const SCREEN_CLOSE_MS = 220;

const TITLES = {
  nation: 'Nation Overview',
  construction: 'Construction',
  industry: 'Industry & Production',
  military: 'Military',
  budget: 'Budget',
  population: 'Peoples',
  politics: 'Government',
  peace: 'Peace Talks',
  diplomacy: 'Diplomacy',
  dossier: 'Foreign Power',
  trade: 'Resources & Trade',
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

/**
 * Vergi satirinin aritmetigi — defter satiri da tooltip'i de (tooltipData
 * 'budget') BUNU okur; iki kopya ayrisinca kart satirla celisiyordu.
 * `collected` gecen haftanin oraniyla kapanmis tutardir: oran o haftadan beri
 * degistiyse (oyuncu ya da AUTO) "matrah x oran = tahsilat" yalan olur.
 * Kapanmis oran formulden degil matrahtan turer: collected / base.
 */
export function taxSettlement(cfg) {
  const settledRate = cfg.base > 0 ? (cfg.collected / cfg.base) * 100 : cfg.value;
  const stale = Math.abs(settledRate - cfg.value) > 0.5;
  const projected = cfg.base * cfg.value / 100;
  return { settledRate, stale, projected, amount: stale ? projected : cfg.collected };
}

/** Yeniden çizimde kaydırma konumu korunacak iç listeler. */
const SCROLL_KEEPERS = [
  '.census-scroll', '.census-browser-list', '.trade-goods-scroll', '.trade-detail',
  '.pol-left', '.pol-panel', '.pol-issues-scroll',
  '.mil-leader-list', '.mil-build-list', '.mil-queue-list', '.mil-left',
  '.xch-list', '.xch-dossier', '.tech-tree', '.tech-inspector',
];

const TECH_ZOOM_KEY = 'hexwar.techZoom';

/** Kayitli yakinlik; tarayici deposu kapaliysa (gizli pencere) %100. */
function readTechZoom() {
  try {
    const value = Number(localStorage.getItem(TECH_ZOOM_KEY));
    return TECH_ZOOMS.includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

function writeTechZoom(value) {
  try {
    localStorage.setItem(TECH_ZOOM_KEY, String(value));
  } catch {
    // Depo yoksa tercih yalniz bu oturumda yasar.
  }
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

export class Screens {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.refreshHandle = 0;
    this.previousMapMode = null;
    // Uluslar Çağı ekranlarının durumu (stateScreens.js): bekleyen iki-tık
    // onayı ve inşaat ekranında seçili province.
    this.uc = { confirm: null, province: null };
    // Askerî ekranın durumu: açık kol, seçili subay, birim kategorisi ve
    // tarihi gelmemiş kolların gösterilip gösterilmediği.
    this.military = { branch: 'army', leader: null, category: 'all', showLocked: false };
    this.peaceTarget = null;
    this.nationTarget = null;
    this.peaceTab = 'take';
    this.peaceSelection = { demands: new Set(), concessions: new Set(), terms: new Set() };
    // Teknoloji ekrani: inceleme panelindeki teknoloji ve agacin yakinligi.
    // Yakinlik izleyicinin tercihidir; kayda girmez, tarayicida kalir.
    this.tech = { inspect: null, zoom: readTechZoom() };
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
    const switching = this.active !== name;
    clearTimeout(this.closeTimer);
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
    if (switching) this.playEnter();
  }

  /**
   * Ekran girisi (styles.css §31). Sinif bir kez takilir ve animasyon bitince
   * sokulur: haftalik tazeleme govdeyi yeniden kurar, sinif kalsaydi her
   * hafta kartlar yeniden yukselirdi.
   */
  playEnter() {
    const targets = [this.el.root, this.el.body];
    for (const el of targets) {
      el.classList.remove('is-entering');
      void el.offsetWidth;
      el.classList.add('is-entering');
    }
    clearTimeout(this.enterTimer);
    this.enterTimer = setTimeout(() => {
      for (const el of targets) el.classList.remove('is-entering');
    // §32: son kart 180 ms gecikip 320 ms iner; sinif erken sokulurse
    // animasyon yarida kesilip yerine siçrar.
    }, 560);
  }

  close() {
    if (this.active === 'peace') this.restoreMapMode();
    // Bekleyen onaylar ekranla birlikte duser.
    this.uc.confirm = null;
    this.warConfirm = null;
    this.active = null;
    // Genişlik sınıfı (dar/geniş panel) kapanış hareketi bitene dek kalır;
    // yoksa dossier kapanırken bir anda tam boy panele dönüşüp kayardı.
    const closingScreen = this.el.root.dataset.screen;
    document.body.classList.remove('screen-open');
    this.el.root.classList.add('hidden');
    this.el.root.setAttribute('aria-hidden', 'true');
    // Kapalı ekranın gövdesi DOM'da BIRAKILMAZ. Ölçüldü: sekiz ekranı yirmişer
    // kez açıp kapatınca belge 406 düğümden 1049'a çıkıyor ve son bakılan
    // ekranın 635 düğümü (35 KB HTML) gizli hâlde asılı kalıyordu — nüfus
    // sayımı gibi büyük bir ekranda bu on binlerce düğüm demek. Açılış zaten
    // `refresh()` ile gövdeyi baştan kuruyor, yani temizlemenin görsel bedeli
    // yok; kazancı kalıcı bellek ve stil/erişilebilirlik ağacının küçülmesi.
    // Temizlik KAPANIŞ HAREKETİNDEN SONRA: panel boş bir kabuk olarak
    // kaymasın (styles.css §6 .screen.hidden geçişi ~200 ms).
    const clear = () => {
      if (this.active) return;
      if (this.el.root.dataset.screen === closingScreen) delete this.el.root.dataset.screen;
      this.el.body.innerHTML = '';
      this.el.res.innerHTML = '';
    };
    clearTimeout(this.closeTimer);
    if (motionOn()) this.closeTimer = setTimeout(clear, SCREEN_CLOSE_MS);
    else clear();
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
    // Odaktaki bütçe kaydıracı yeniden çizimden sonra geri gelir: okla her
    // adım `change` → `economy` → tazeleme demek; eski eleman DOM'dan kalkınca
    // odak gövdeye düşüyor, ikinci ok tuşu kaydıracı değil haritayı sürüyordu.
    const focused = document.activeElement;
    const refocus = focused?.dataset?.policy && this.el.body.contains(focused)
      ? `[data-policy="${focused.dataset.policy}"]` : null;
    this.el.title.textContent = TITLES[this.active] ?? '—';
    // Construction artik eski sehir kaynaklariyla degil state-slot kapasitesiyle
    // calisir; eski gold/food/timber/iron seridi bu ekranda gosterilmez.
    // Sanayi ekraninin alt sekmeleri de kalkti: santiyeler artik ayri bir
    // pencerede degil, ekranin sag rayinda duruyor (bkz. industryScreen).
    // Üst çubuk zaten bütün sayaçları gösterir; ekran başlığı tekrar etmez.
    this.el.res.innerHTML = '';
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
    if (refocus) this.el.body.querySelector(refocus)?.focus({ preventScroll: true });
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
    const factories = (target.economy?.ic?.total ?? 0).toFixed(1);
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
        <span><small>Industry</small><b>${score.industry}</b></span>
        <span><small>Prestige</small><b>${score.prestige}</b></span>
        <span title="${strengthPhrase(myPower, power)}"><small>Relative strength</small><b class="${myPower >= power ? 'res-pos' : 'res-neg'}">${strengthPhrase(myPower, power)}</b></span>
      </div>
      <div class="dossier-facts">
        <div><span>Population</span><b>${formatPopulation(populationOf(world, target))}</b></div>
        <div><span>Territory</span><b>${target.tiles}</b><small>hexes</small></div>
        <div><span>Cities</span><b>${cities}</b></div>
        <div><span>Industry</span><b>${factories} IC</b></div>
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
        ${(me.embargoes ?? []).includes(target.id) ? '' : `<button class="action" data-embargo="${target.id}"
          ${embargoBlockers(world, me, target).length ? `disabled title="${esc(embargoBlockers(world, me, target).join(' · '))}"` : ''}>Embargo · 25 PP</button>`}
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
    const records = target.economy?.resources ?? {};
    const producers = RESOURCE_IDS
      .filter((id) => (records[id]?.exported ?? 0) > 0.05)
      .sort((a, b) => (records[b].exported ?? 0) - (records[a].exported ?? 0))
      .slice(0, 3)
      .map((id) => `${RESOURCES[id].glyph} ${RESOURCES[id].name}`);
    const imports = RESOURCE_IDS
      .filter((id) => (records[id]?.imported ?? 0) > 0.05 && (records[id]?.need ?? 0) > 0)
      .sort((a, b) => records[b].imported / records[b].need - records[a].imported / records[a].need)
      .slice(0, 3)
      .map((id) => `${RESOURCES[id].glyph} ${RESOURCES[id].name} (${Math.round(records[id].imported / records[id].need * 100)}%)`);
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
        <div><span>Exports</span><b>${producers.length ? producers.join(' · ') : 'little of note'}</b></div>
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
    // Hex kaynaklari: kume birden cok mal cikarir; en cok hex tutan ikisi.
    const rgoOf = (province) => {
      if (!province?.econ) return '';
      const lines = depositsOf(province).slice(0, 2)
        .map((line) => (RESOURCES[line.id] ? `${RESOURCES[line.id].glyph} ${RESOURCES[line.id].name}` : null))
        .filter(Boolean);
      return lines.length ? ` · ${lines.join(', ')}` : '';
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
    return `<span>⬤ <b>${Math.round(me.gold)}</b> ${sign}</span>
      <span>PP <b>${Math.round(me.power ?? 0)}</b></span>
      <span>IC <b>${(me.economy?.ic?.total ?? 0).toFixed(1)}</b></span>
      <span>STB <b>${Math.round((me.stability ?? 0) * 100)}%</b></span>
      <span>WS <b>${Math.round((me.warSupport ?? 0) * 100)}%</b></span>`;
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
    const culture = world.cultures[me.culture]?.name ?? 'Unknown';
    const capital = cities.find((city) => city.tile === me.capital) ?? cities[0];
    const wars = world.nations.filter(
      (nation) => nation.alive && nation.id !== me.id && atWar(world, me.id, nation.id),
    );
    const board = scoreboard(world);
    const score = board.find((entry) => entry.nation.id === me.id);
    const rank = board.findIndex((entry) => entry.nation.id === me.id) + 1;
    const goal = GOALS[me.goal];
    const resources = RESOURCE_IDS.map((id) => {
      const record = me.economy?.resources?.[id];
      const ratio = record?.need > 0.01 ? Math.round(record.ratio * 100) : null;
      return `<span><small>${RESOURCES[id].glyph} ${RESOURCES[id].name}</small><b class="${ratio != null && ratio < 90 ? 'res-neg' : ''}">${ratio == null ? '—' : `${ratio}%`}</b></span>`;
    }).join('');
    return `<div class="nation-hero card">
        <span class="flag-hero" data-flag-nation="${me.id}" data-flag-w="210" data-flag-h="140"></span>
        <div class="nation-identity">
          <h3>${esc(me.fullName)}</h3>
          <small>${esc(culture)} · ${esc(governmentType(me))} · ${esc(rulingParty(me).name)}</small>
        </div>
        <button class="action focus-capital" data-focus-capital="1">Focus Capital</button>
      </div>
      <div class="overview-stats">
        <div><span>Score</span><b>${score?.total ?? 0}</b><small>Rank ${rank || '—'} · leader ${board[0]?.total ?? 0}</small></div>
        <div><span>Industry</span><b>${(me.economy?.ic?.total ?? 0).toFixed(1)}</b><small>IC · ${score?.industry ?? 0} points</small></div>
        <div><span>Population</span><b>${formatPopulation(population)}</b><small>${cities.length} ${cities.length === 1 ? 'city' : 'cities'}</small></div>
        <div><span>Armed Forces</span><b>${units.length}</b><small>power ${nationStrength(world, me).toFixed(1)}</small></div>
        <div><span>Prestige</span><b>${Math.round(me.prestige ?? 0)}</b><small>wars won, agenda, great nation</small></div>
        <div><span>Core provinces</span><b>${score?.land ?? 0}</b><small>${me.provinces ?? 0} provinces held</small></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Resources</h3><small>share of need covered</small></div>
        <div class="economy-ledger">${resources}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>State of the Nation</h3><small>${goal ? `goal: ${esc(goal.name)}` : ''}</small></div>
        <div class="detail-list">
          <div><span>Capital</span><b>${esc(capital?.name ?? 'Lost')}</b></div>
          <div><span>Treasury</span><b>${Math.round(me.gold)} · ${weeklyBalanceOf(me) >= 0 ? '+' : ''}${weeklyBalanceOf(me).toFixed(1)}/wk</b></div>
          <div><span>Stability · War support</span><b>${Math.round((me.stability ?? 0) * 100)}% · ${Math.round((me.warSupport ?? 0) * 100)}%</b></div>
          <div><span>Infamy</span><b>${Math.round(me.infamy ?? 0)}/${INFAMY_COALITION}</b></div>
          <div><span>Wars</span><b>${wars.length ? wars.map((w) => esc(w.name)).join(', ') : 'At peace'}</b></div>
          ${goal ? `<div><span>National goal</span><b>${esc(goal.desc)}</b></div>` : ''}
        </div>
      </div>`;
  }

  // --- İnşaat: şehir başına bina yuvaları ---


  render_construction(me) {
    return renderConstruction(this.game, me, this.uc);
  }

  render_industry(me) {
    return renderIndustry(this.game, me, this.uc);
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
        manpower: me.economy?.reinforcement?.manpowerUsed ?? 0,
        rifles: me.economy?.reinforcement?.equipmentUsed?.rifles ?? 0,
        guns: me.economy?.reinforcement?.equipmentUsed?.guns ?? 0,
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
  render_budget(me) {
    return renderBudget(this.game, me, this.uc);
  }


  render_population(me) {
    return renderPopulation(this.game, me, this.uc);
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
      inspect: this.tech.inspect,
      zoom: this.tech.zoom,
    });
  }

  /**
   * Fare gezinirken yalniz inceleme paneli ve vurgu degisir: butun ekrani
   * her dugumde yeniden kurmak hover'i takiltili yapardi.
   */
  inspectTech(me, techId) {
    if (!techId || this.tech.inspect === techId) return;
    this.tech.inspect = techId;
    const panel = this.el.body.querySelector('[data-tech-inspector]');
    if (panel) {
      panel.innerHTML = techInspector(me, techId);
      panel.classList.remove('is-swapping');
      void panel.offsetWidth;
      panel.classList.add('is-swapping');
    }
    for (const node of this.el.body.querySelectorAll('.tech-node.is-inspected')) {
      node.classList.remove('is-inspected');
    }
    this.el.body.querySelector(`.tech-node[data-tech="${CSS.escape(techId)}"]`)?.classList.add('is-inspected');
  }

  /**
   * Yakinlik kademesi. `anchor` verilirse (Ctrl+tekerlek) imlecin altindaki
   * nokta yerinde kalir; dugmeyle yakinlastirmada gorunur alanin sol ust
   * kosesi sabittir.
   */
  zoomTech(step, anchor = null) {
    const index = TECH_ZOOMS.indexOf(this.tech.zoom);
    const next = step === 0
      ? 1 : TECH_ZOOMS[Math.max(0, Math.min(TECH_ZOOMS.length - 1, (index < 0 ? 3 : index) + step))];
    if (next === this.tech.zoom) return;
    const tree = this.el.body.querySelector('.tech-tree');
    const inner = tree?.querySelector('.tech-tree-inner');
    const before = this.tech.zoom;
    this.tech.zoom = next;
    writeTechZoom(next);
    if (!tree || !inner) return;
    const box = tree.getBoundingClientRect();
    const offsetX = anchor ? anchor.x - box.left : 0;
    const offsetY = anchor ? anchor.y - box.top : 0;
    const contentX = (tree.scrollLeft + offsetX) / before;
    const contentY = (tree.scrollTop + offsetY) / before;
    inner.style.zoom = String(next);
    tree.scrollLeft = contentX * next - offsetX;
    tree.scrollTop = contentY * next - offsetY;
    const label = this.el.body.querySelector('.tech-zoom-level');
    if (label) label.textContent = `${Math.round(next * 100)}%`;
    const buttons = this.el.body.querySelectorAll('[data-tech-zoom]');
    for (const button of buttons) {
      const dir = Number(button.dataset.techZoom);
      if (dir < 0) button.disabled = next <= TECH_ZOOMS[0];
      if (dir > 0) button.disabled = next >= TECH_ZOOMS[TECH_ZOOMS.length - 1];
    }
  }

  // --- Politics: hükûmet ve beş yasa (bkz. politicsScreen.js) ---
  render_politics(me) {
    return renderPolitics(this.game, me, this.uc);
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
    return renderTrade(this.game, me, this.uc);
  }

  /** Ekranlardaki eylemleri oyunun mevcut fonksiyonlarına bağlar. */
  bind() {
    const { game } = this;
    const me = this.me;
    if (!me) return;

    if (this.active === 'military') this.bindMilitary();
    bindStateScreens(this);
    for (const btn of this.el.body.querySelectorAll('[data-embargo]')) {
      btn.onclick = () => {
        declareEmbargo(game, me, Number(btn.dataset.embargo));
        this.refresh();
      };
    }

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
      btn.onpointerenter = () => this.inspectTech(me, btn.dataset.tech);
      btn.onfocus = () => this.inspectTech(me, btn.dataset.tech);
    }
    for (const btn of this.el.body.querySelectorAll('[data-dequeue]')) {
      btn.onclick = () => {
        dequeueResearch(me, btn.dataset.dequeue);
        this.refresh();
      };
    }
    for (const chip of this.el.body.querySelectorAll('[data-tech-inspect]')) {
      chip.onpointerenter = () => this.inspectTech(me, chip.dataset.techInspect);
    }
    const inspector = this.el.body.querySelector('[data-tech-inspector]');
    if (inspector) {
      // Panelin icerigi fare gezindikce degisir: dugmeler tek tek degil
      // kaptan yakalanir.
      inspector.onclick = (event) => {
        const button = event.target.closest('[data-tech-now], [data-tech-queue], [data-tech-dequeue]');
        if (!button) return;
        if (button.dataset.techNow) researchNow(me, button.dataset.techNow);
        else if (button.dataset.techQueue) queueResearch(me, button.dataset.techQueue);
        else dequeueResearch(me, button.dataset.techDequeue);
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-tech-zoom]')) {
      btn.onclick = () => this.zoomTech(Number(btn.dataset.techZoom));
    }
    const techTree = this.el.body.querySelector('.tech-body > .tech-tree');
    if (techTree) {
      // Ctrl+tekerlek sayfayi degil agaci yakinlastirir; duz tekerlek kaydirir.
      techTree.onwheel = (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        this.zoomTech(event.deltaY < 0 ? 1 : -1, { x: event.clientX, y: event.clientY });
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
      // Yalniz Enter: Space saatindir (hud.bindKeys).
      el.onkeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        toggle();
      };
    }

    const focusCapital = this.el.body.querySelector('[data-focus-capital]');
    if (focusCapital) {
      focusCapital.onclick = () => {
        game.focusNation(me);
        this.close();
      };
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
        // Kart BURADAN BASILMAZ: barisin tek sahibi peace.js'tir (sartlari ve
        // devredilen kumeleri o biliyor). Ucuncu bir satir eklemek ayni baris
        // icin uc kart uretiyordu (Astra6 B5: peace-13 / PEACE / INFO).
        this.peaceTarget = null;
        this.close();
        game.emit('turn', game.turns.turn);
        game.requestRender();
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
          // Harita diplomasi kipindeyse rengi ilişki değişir değişmez tazelensin
          // (alliances.js `world` alır, oyunu görmez; olayı buradan yayıyoruz).
          game.emit('diplomacy');
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
          game.emit('diplomacy');
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
