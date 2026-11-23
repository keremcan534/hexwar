// Ulusal ekranların kabuğu: sekme açma/kapama, yeniden çizim, ortak bağlama.
// Uluslar Çağı ekranları (Economy, Trade, Factories, Development, Population,
// Politics) ui/stateScreens.js'tedir; burada dosya kartı, barış masası,
// diplomasi, ordu, teknoloji ve vakayiname kalır.

import { canAfford, pay } from '../game/cities.js';
import {
  MIN_WAR_TURNS, ULTIMATUM_WEEKS, atWar, crisisLeft, nationStrength, overlordOf, relation, truceLeft, warBlockers,
} from '../game/diplomacy.js';
import {
  LAND_FLOOR, PEACE_TERMS, buildOffer, capitalProvinceOf, concedeKeyForTile, crushingVictory, protectedCapital,
  demandKeyForTile, demandLimitFor, occupiedProvincesOf,
  offerCost, offerRefusal, provinceFromKey, provinceKeyOf, provinceWarCost, signPeace,
  termAvailable, warGoalOf, warScore,
} from '../game/peace.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { controllerOf } from '../game/control.js';
import { callToArms } from '../game/mobilization.js';
import { maxHpOf, menUnderArms, organizationOf, soldiersOf } from '../game/units.js';
import { provinceName } from '../game/provinces.js';
import { hydrateFlags } from '../render/flagWave.js';
import { hegemonyScore, scoreboard } from '../game/hegemony.js';
import { MAX_ROUNDS, battleSides, battlesFor } from '../game/battles.js';
import { cancelTraining, moveTrainingTo, prioritizeTraining, recruitBlockers } from '../game/recruitment.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import { billsOf } from '../game/econ/bills.js';
import { mod } from '../game/modifiers.js';
import {
  armyComposition, commandRoster, militaryStats, militarySummary, recruitOptions, trainingRows,
  unassignedDivisions,
} from '../game/military.js';
import {
  BRANCH, assignDivisions, borderNationIds, createGeneral, generalCost, officersOf, retireGeneral, setCommandOption,
  setStance, unassignGeneral,
} from '../game/command.js';
import { militaryScreen } from './militaryScreen.js';
import { pressArchivePanel } from './newspaperArchive.js';
import { levyView, setLevied } from '../game/levy.js';
import { rulingParty } from '../game/politics.js';
import { TIER, announce, chronicleYear, ensureChronicle, memoryOf } from '../game/chronicle.js';
import { allianceAppeal, alliesOf, breakAlliance, formAlliance, isAllied } from '../game/alliances.js';
import { annexBlockers, annexCost, annexVassal, releaseVassal } from '../game/vassals.js';
import { characterLine, techStanding } from '../game/identity.js';
import {
  DELEGATION_AREAS, headerAreaOf, isDelegated, lastDelegatedAction, setDelegation,
} from '../game/delegation.js';
import {
  dequeueResearch, effectiveTechCost, firstDiscoveryOpen, queueResearch, researchNow, researchPath, researchPointsOf,
} from '../game/technology.js';
import {
  TECH_ZOOMS, defaultInspect, researchRateLines, techGrid, techInspector, technologyScreen,
} from './technologyScreen.js';
import { depositsOf } from '../game/econ/deposits.js';
import { kpiArt, resourceArt } from './icons/art.js';
import { TAB_GLYPH, TERM_GLYPH, glyph } from './icons/glyphs.js';
import { motionOn } from './motion.js';
import { syncChronicleReplay } from './replayPlayer.js';
import { localRect, toLocal } from './uiScale.js';
import { formatPopulation, populationOf } from '../game/economy.js';
import { RESOURCES, RESOURCE_IDS } from '../game/econ/defs.js';
import {
  bindStateScreens, constructionKey, declareEmbargo, holdConstructionOrder, embargoBlockers, industryKey, renderBudget, renderConstruction,
  renderCultures, renderIndustry, renderPolitics, renderPopulation, renderTrade,
} from './stateScreens.js';
import { bindPolicyScreen, renderPolicies } from './policyScreen.js';
import { quietScroll, refreshTooltips } from './tooltip.js';
import { renderNationOverview, trackOverviewEvents } from './nationOverview.js';
import { autoPill as pillHtml, kpi as kitKpi, kpiRow as kitKpiRow, panel as kitPanel, spark as kitSpark, tipAttr } from './kit.js';
import { END_YEAR, dateOfTurn, exactYearOfTurn, yearOfTurn } from '../game/calendar.js';
import { SAVE_VERSION, exportSaveText, importSaveText, readableVersion } from '../game/save.js';
import { LEGACY_SLOT, MAX_MANUAL, deleteSave, listSaves, manualCount } from '../game/saveStore.js';
import { diplomacyView } from '../game/diplomacyView.js';
import { bindDiplomacyScreen, renderDiplomacyScreen, renderDossierScreen } from './diplomacyScreen.js';
import { leaderByline, leaderPhoto } from './leaderPortrait.js';
import { warOverview, worldConflicts } from '../game/warView.js';
import { conflictDetailHtml, conflictFocusTile } from './warDetail.js';

/** Ekranın kapanış geçişi (styles.css §6 .screen.hidden) bitene kadar gövde kalır. */
const SCREEN_CLOSE_MS = 220;
/** AUTO kartının alt satırı: anahtar NEYİ devrediyor (tam tarif ipucunda). */
const AUTO_SCOPE = {
  economy: 'Feeding & bills',
  trade: 'Trade law',
  reforms: 'Laws & advisors',
  recruitment: 'Regiments',
  research: 'Next research',
  diplomacy: 'Foreign ministry',
};
/**
 * Sekme kısayolları: künyelerin soldan sağa sırası, on sekme F1-F10.
 * Cultures sonradan eklenince tablo dokuz tuşta kalmıştı: F7 yedinci sekmeyi
 * (Cultures) değil Politics'i açıyordu, Cultures'ın tuşu yoktu. Diplomasi
 * (sekmesi yok) P'ye geçti; F11/F12 tarayıcınındır. Kimlikler eski adlarını
 * taşır (kayıt, devir tablosu, ekran kancaları onlara bağlı): 'construction'
 * künyede Development, 'budget' Economy yazar (Tek Çubuk, 2026-10-15).
 * Sekme karesinin köşesinde tuşu yazılıdır (Kerem 2026-11-20: "F1-F5 tuşlarına atanabilir";
 * atanmışlardı ama hiçbir yerde görünmüyordu).
 */
export const TAB_KEYS = {
  F1: 'construction', F2: 'industry', F3: 'trade', F4: 'budget', F5: 'military',
  F6: 'population', F7: 'cultures', F8: 'politics', F9: 'technology', F10: 'chronicle',
};

// Diplomasinin tuşu P'dir (hud.js), F tablosunda değil.
const KEY_OF_TAB = { ...Object.fromEntries(Object.entries(TAB_KEYS).map(([key, screen]) => [screen, key])), diplomacy: 'P' };

/** Sekme karesinin fotoğrafı (assets/kpi; ekranın kendi gösterge kartlarından). */
const TAB_PHOTOS = {
  construction: 'invested', industry: 'industry', trade: 'exports', budget: 'bills',
  military: 'standing-army', population: 'population', cultures: 'peoples',
  politics: 'government', technology: 'researching', chronicle: 'entries',
  diplomacy: 'allies', policies: 'commitments',
};

/**
 * Sekme yüzü olan ekranlar: assets/icons/tabs-flat (2026-11-20, tek nesne dökme pirinç;
 * eski alçı figürlü madalyonlar assets/icons/tabs-medal'da duruyor, Kerem: "AI gibi").
 */
const TAB_MEDALS = new Set([
  'construction', 'industry', 'trade', 'budget', 'military', 'population',
  'cultures', 'politics', 'technology', 'chronicle', 'diplomacy', 'navy', 'policies',
]);

/** İki-tık onayının ömrü (bkz. Screens.armConfirm). */
export const CONFIRM_MS = 8000;

const TITLES = {
  policies: 'State Policies',
  nation: 'Nation Overview',
  construction: 'Development',
  industry: 'Industry & Production',
  military: 'Military',
  budget: 'Economy',
  population: 'Population',
  cultures: 'Cultures',
  politics: 'Government',
  peace: 'Peace Talks',
  diplomacy: 'Diplomacy',
  dossier: 'Foreign Power',
  trade: 'Resources & Trade',
  technology: 'Technology',
  chronicle: 'National Chronicle',
  saves: 'Save & Load',
};

/** Kayıt satırındaki oyun tarihi (hud.gameDate ile aynı biçim; hud bu dosyayı içe aldığı için kopya). */
const saveDate = (turn) => dateOfTurn(turn).toLocaleDateString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Yönetim ekranının ARKASINDA kalan harita araçları (LS-10). Hepsi ekran
 * açıkken zaten gizlidir (styles.css body.screen-open); `inert` onları
 * klavye ve erişilebilirlik ağacından da çıkarır. Harita kipleri bilerek
 * listede yok: ekranın altında görünür kalır ve fareyle haritayı çevirir;
 * Tab'ı hud.windowTab pencerede tutar.
 */
const MAP_TOOLS = '#command-dock, #sheet, #layer-menu, .rgo-map-legend, #movement-dock, #war-dock, #navy-dock, .battle-panel, .battle-strip';
function setMapToolsInert(on) {
  for (const el of document.querySelectorAll(MAP_TOOLS)) el.inert = on;
}

/** Odak geri gelince imleci de geri isteyen denetimler (yazı alanları). */
const CARET_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', 'email', 'number']);

/**
 * Gövde yeniden kurulmadan önce odaktaki denetimin kimliği: id ya da ilk
 * data-* özniteliği, yazı alanında imleç ve seçim. Yalnız yazı alanı, seçim
 * kutusu, kaydıraç ve onay kutusu ile KLAVYEYLE odaklanmış düğme geri gelir:
 * fareyle tıklanmış düğmeye odak geri verilseydi sonraki Enter onu ikinci kez
 * basardı (Development'ta Enter imleçteki satırın odağıdır).
 */
function focusMemo(el, body) {
  if (!el || el === document.body || !body.contains(el)) return null;
  const field = el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
  if (!field && !el.matches(':focus-visible')) return null;
  // Bütün data-* öznitelikleri birlikte: Order ile ×5 aynı data-military-build'i taşır.
  const selector = el.id ? `#${CSS.escape(el.id)}` : [...el.attributes]
    .filter((a) => a.name.startsWith('data-') && !a.name.startsWith('data-tip'))
    .map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  if (!selector) return null;
  const caret = (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && CARET_TYPES.has(el.type)))
    ? { start: el.selectionStart, end: el.selectionEnd, dir: el.selectionDirection, left: el.scrollLeft } : null;
  return { selector, caret };
}

function restoreFocus(memo, body) {
  const el = body.querySelector(memo.selector);
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  if (memo.caret && el.setSelectionRange) {
    try {
      el.setSelectionRange(memo.caret.start, memo.caret.end, memo.caret.dir ?? 'none');
      el.scrollLeft = memo.caret.left;
    } catch {
      // number gibi seçim taşımayan türler: odak yeter.
    }
  }
}

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
  '.xch-list', '.xch-dossier', '.tech-tree', '.tech-inspector',
  // Kalkınma ekranının state listesi kendi kaydıracıdır: her tık ve her hafta
  // listeyi başa atıyordu (ölçüldü: scrollTop 674 → 0).
  '.k-wtable',
  // Diplomasi ulus tablosu da kendi kaydıracıdır.
  '.dip-table',
  // Pencere kipindeki ekranların sütunları (styles.css §68).
  '.screen-body > .k-split > :nth-child(1)', '.screen-body > .k-split > :nth-child(2)',
];

const TECH_ZOOM_KEY = 'hexwar.techZoom';

/** Serbest metinli bilgi kartı özniteliği (yerel `title` yerine; bkz. tooltip.js). */
const tipAttrText = (text) => tipAttr({ text });

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
      auto: document.getElementById('screen-auto'),
      body: document.getElementById('screen-body'),
    };

    for (const btn of document.querySelectorAll('#tab-bar [data-screen]')) {
      btn.onclick = () => this.toggle(btn.dataset.screen);
      // Sekme yüzü: ekranın madalyonu + ad (Kerem'in madalyon seti,
      // assets/incoming/sekme-madalyonlari.png). 12 px'lik çizgi glif
      // şeritte "boş" okunuyordu ("bu kısım içinde birşeyler lazım").
      // Madalyonu olmayan ekran eski glifini taşır.
      if (!btn.querySelector('.tab-ico')) {
        const screen = btn.dataset.screen;
        const face = TAB_MEDALS.has(screen)
          ? `<img class="tab-medal" src="assets/icons/tabs-flat/${screen}.webp" alt="" draggable="false">`
          : glyph(TAB_GLYPH[screen] ?? 'info');
        btn.insertAdjacentHTML('afterbegin', `<i class="tab-ico">${face}</i>`);
        // Sekme fotoğraflı bir karedir (Kerem 2026-11-20: "kare içine arka plan tarzında"):
        // ekranın gösterge kartlarıyla aynı resim seti, madalyon önünde durur.
        const photo = TAB_PHOTOS[screen];
        if (photo) btn.insertAdjacentHTML('afterbegin', `<span class="tab-photo" style="background-image:url(assets/kpi/${photo}.webp)" aria-hidden="true"></span>`);
        if (KEY_OF_TAB[screen]) btn.insertAdjacentHTML('beforeend', `<kbd class="tab-key" aria-hidden="true">${KEY_OF_TAB[screen]}</kbd>`);
        // Üzerine gelince inen cam levha (hud.css "SEKME KAROSU: CAM"): sözde öğe değil, çünkü
        // ::before AUTO lambasının, ::after etkin sekme hattının.
        btn.insertAdjacentHTML('beforeend', '<i class="tab-glass" aria-hidden="true"></i>');
      }
    }
    document.getElementById('screen-close').onclick = () => this.close();
    // Pencere boyu değişince kartların şeritteki yeri de değişir: panorama
    // (mountKpiPanorama) kare başına bir kez yeniden hizalanır.
    let kpiFrame = 0;
    window.addEventListener('resize', () => {
      if (kpiFrame || !this.active) return;
      kpiFrame = requestAnimationFrame(() => { kpiFrame = 0; this.mountKpiPanorama(); });
    });

    // Tur ilerlediğinde ya da bir şey satın alındığında açık ekran tazelenir.
    // Tek bir hafta bu olaylardan on üç tane yayar (ölçüldü); hepsi aynı
    // kareye toplanır, yoksa ekran haftada birkaç kez baştan kurulur.
    // 'construction' olayı kalktı (TEK ÇUBUK): kalkınma 'economy' ile gelir.
    for (const event of [
      'turn', 'units', 'economy', 'battles', 'provinces', 'politics', 'peace',
    ]) {
      game.on(event, () => {
        // Canlı oyunda hafta kapanışı kareler arasına dilimlenir (turn.js
        // pumpTurn) ve olaylar farklı karelerde gelir: kare başına toplamak
        // yetmiyordu, açık ekran 8x'te haftada ~6 kez baştan kuruluyor, oyuncu
        // sekmede "git gel" görüyordu (Kerem 2026-10-15; ölçüldü: 4 sn'de 30
        // gövde yazımı). Kapanış sürerken gelen olay beklenir; iş bitince
        // yayılan 'turn' tek tazeleme yapar (tabLedger.js ile aynı bekçi).
        if (game.turns?.turnJob && event !== 'turn') return;
        this.scheduleRefresh();
      });
    }
    // SURUKLEME SIRASINDA TAZELEME YOK. Haftalik tik ekrani bastan kurar ve
    // parmagin altindaki kaydiraci DOM'dan kaldirir: surukleme sessizce
    // kopuyor, oyuncu "kaydirac tutmuyor" sanip tekrar deniyordu (kor oyun
    // testi: egitim 0 -> 0 -> 50, ordu 100'de takili). Tazeleme birakilana
    // kadar bekletilir.
    // Aynı bekçi her BASIŞI da kapsar: basma ile bırakma arasında gövde
    // yeniden kurulursa tıklama ölü düğmede kalır ve hiç gelmez. 8x'te insan
    // tıkının (120 ms) altıda biri kayboluyordu (ölçüldü: Military çipleri ve
    // Factories öncelikleri 60 tıkta 10'ar). AUTO hapı gövdenin dışındadır
    // ama o da tazelemede yeniden yazılır.
    this.dragging = false;
    this.refreshPending = false;
    const startPress = () => { this.dragging = true; };
    this.el.body.addEventListener('pointerdown', startPress);
    this.el.auto?.addEventListener('pointerdown', startPress);
    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.refreshPending) {
        // `change` ve `click` pointerup'tan sonra gelir; onların refresh'i
        // önde olsun. Tıklama zaten tazelediyse bekleyen iş düşer (refresh
        // bayrağı siler), gövde ikinci kez kurulmaz.
        setTimeout(() => {
          if (!this.refreshPending) return;
          this.refreshPending = false;
          this.scheduleRefresh();
        }, 0);
      }
    };
    // Yakalama evresinde: bırakışı yutan bir öğe ekranı donmuş bırakmasın.
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    // Pencere odağı giderken pointerup gelmeyebilir: ekran donmuş kalmasın.
    window.addEventListener('blur', endDrag);
    // Haritada yabancı toprağa sağ tık: o ülkenin paneli açılır.
    game.on('nation', (nationId) => this.openDossier(nationId));
    // Haritayi secim yuzeyi yapan tek ekran baris masasidir.
    game.on('select', (tile) => {
      if (this.active === 'peace') this.pickPeaceTile(tile);
    });
    game.on('world', () => this.close());
    trackOverviewEvents(game);
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
    // Kurulu "Confirm" başka sekmeye taşınmaz: Cultures'ta kurulup Politics'e
    // geçip dönen oyuncunun tek tıkı zorla asimilasyonu yürürlüğe koyuyordu.
    if (switching) this.dropConfirms();
    clearTimeout(this.closeTimer);
    // Odak pencereye geçer (LS-10); kapanınca açanına döner.
    const opening = !this.active;
    if (opening) this.returnFocus = document.activeElement;
    this.active = name;
    this.el.root.dataset.screen = name;
    // Sekmesi olan ekranın başlığı sekmenin kendisidir: başlık satırı gizlenir.
    this.el.root.dataset.tabbed = document.querySelector(`#tab-bar [data-screen="${name}"]`) ? '1' : '0';
    document.body.classList.add('screen-open');
    this.el.root.classList.remove('hidden');
    this.el.root.setAttribute('aria-hidden', 'false');
    for (const btn of document.querySelectorAll('#tab-bar [data-screen]')) {
      btn.classList.toggle('active', btn.dataset.screen === name);
    }
    this.el.body.scrollTop = 0;
    this.refresh();
    if (switching) this.playEnter();
    if (opening) setMapToolsInert(true);
    // Kök odaklanır, ilk denetim değil: F-tuşuyla açılan ekranda rastgele bir
    // düğmenin halkası yanmasın; Tab oradan gövdenin ilk denetimine gider.
    if (switching && !this.el.root.contains(document.activeElement)) this.el.root.focus({ preventScroll: true });
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
    // Araştırma ağacının açılışı daha uzun sürer (düğümler yıllarına göre
    // ~0.8 sn'de belirir; bkz. styles.css .is-intro). Ayrı sınıf: 560 ms'lik
    // giriş sınıfı onu yarıda keserdi. Haftalık tazelemede takılmaz.
    this.el.body.classList.remove('is-intro');
    void this.el.body.offsetWidth;
    this.el.body.classList.add('is-intro');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => this.el.body.classList.remove('is-intro'), 1500);
  }

  /**
   * YÜKSEKLİK KİLİDİ. Ekran içeriği kadar uzar (boş panel haritadan çalınmış
   * yerdir), ama AÇIKKEN yalnız büyüyebilir, küçülemez: haftalık tazelemede
   * bir liste kısalınca alt kenar yukarı-aşağı oynuyordu (ölçüldü: Population
   * 75 haftada 3 kez, 920 → 863 → 881 px). Kilit ekran değişince ve kapanınca
   * çözülür. offsetHeight dönüşümü (açılış ölçeği) saymaz.
   */
  lockHeight() {
    const root = this.el.root;
    if (this.heightFor !== this.active) {
      root.style.minHeight = '';
      this.heightFor = this.active;
    }
    // Kilit tavanı geçemez: min-height max-height'i ezer ve ekran pencereden
    // taşıyordu (1920'de alt kenar 1089 px, ölçüldü).
    const cap = parseFloat(getComputedStyle(root).maxHeight) || Infinity;
    const height = Math.min(root.offsetHeight, cap);
    if (height > (parseFloat(root.style.minHeight) || 0)) root.style.minHeight = `${height}px`;
  }

  /** Bekleyen iki-tık onaylarının hepsi ve süre sayaçları. */
  dropConfirms() {
    this.uc.confirm = null;
    this.warConfirm = null;
    this.vassalConfirm = null;
    this.dipConfirm = null;
    this.saveConfirm = null;
    this.military.retireConfirm = null;
    this.military.leveeConfirm = false;
    for (const timer of ['ucConfirmTimer', 'warConfirmTimer', 'vassalConfirmTimer', 'dipConfirmTimer', 'saveConfirmTimer', 'retireTimer', 'leveeTimer']) {
      clearTimeout(this[timer]);
    }
  }

  /**
   * İki-tık onayının süresi. İlk tık onayı kurar; CONFIRM_MS içinde ikinci tık
   * gelmezse söner. Bütün ekranlar aynı süreyi kullanır: eskiden kayıt/savaş
   * 8 sn, emeklilik 4 sn, Cultures/Politics hiç sönmüyordu.
   */
  armConfirm(timer, still, drop) {
    clearTimeout(this[timer]);
    this[timer] = setTimeout(() => {
      if (!still()) return;
      drop();
      this.refresh();
    }, CONFIRM_MS);
  }

  close() {
    syncChronicleReplay(this.game, null);
    this.heightFor = null;
    this.el.root.style.minHeight = '';
    if (this.active === 'peace') this.restoreMapMode();
    // Bekleyen onaylar, hat önizlemesi ve klavye vurgusu ekranla birlikte duser.
    this.dropConfirms();
    this.uc.linePreview = null;
    this.uc.lineKeyboard = false;
    this.saveNote = null;
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
    for (const btn of document.querySelectorAll('#tab-bar [data-screen]')) {
      btn.classList.remove('active');
    }
    setMapToolsInert(false);
    const back = this.returnFocus;
    this.returnFocus = null;
    if (this.el.root.contains(document.activeElement)) {
      if (back?.isConnected && back.getClientRects().length && !this.el.root.contains(back)) back.focus({ preventScroll: true });
      else document.activeElement.blur();
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
      if (!node || (!top && !left)) continue;
      // Geri yükleme oyuncunun kaydırması değil: açık ipucu kartları kapanmasın.
      quietScroll(node);
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
    this.refreshPending = false;
    // Ekran kurulumu büyük innerHTML yazımıdır; maliyeti ölçülür.
    const t0 = performance.now();
    const me = this.me;
    // Kaydırma yalnız AYNI ekranın tazelemesinde geri gelir: sütun seçicileri
    // ortaktır, Politics'te kaydırılan sol sütun Cultures'a taşınıyordu.
    const scroll = this.renderedFor === this.active ? this.captureScroll() : [];
    // Development satırları imlecin altında yer değiştirmez (stateScreens.js).
    if (this.active === 'construction' && this.renderedFor === this.active) holdConstructionOrder(this.el.body, this.uc);
    else this.uc.devHold = null;
    this.renderedFor = this.active;
    // Odaktaki denetim yeniden çizimden sonra geri gelir: eski eleman DOM'dan
    // kalkınca odak gövdeye düşüyordu. Bütçe kaydıracında ikinci ok tuşu
    // haritayı sürüyordu; saat akarken kayıt adı yazan oyuncunun kalan
    // harfleri kısayola gidiyordu ("p" Diplomacy'yi açtı, ölçüldü).
    const refocus = focusMemo(document.activeElement, this.el.body);
    this.el.title.textContent = TITLES[this.active] ?? '—';
    // Eski sehir kaynak seridi (altin/gida/kereste/demir) hicbir ekranda yok.
    // Sanayi ekraninin alt sekmeleri de kalkti: santiyeler artik ayri bir
    // pencerede degil, ekranin sag rayinda duruyor (bkz. industryScreen).
    // Üst çubuk zaten bütün sayaçları gösterir; ekran başlığı tekrar etmez.
    this.el.res.innerHTML = '';
    // AUTO TEK YERDEN eklenir: alti ekranin her birine ayri ayri yazmak,
    // birini unutmanin ve iki farkli kalip cikmasinin garantisiydi.
    const autoArea = me ? headerAreaOf(this.active) : null;
    this.el.body.innerHTML = me
      ? (this[`render_${this.active}`]?.(me) ?? '')
      : '<p class="empty">Your nation has been eliminated.</p>';
    this.mountAuto(me, autoArea);
    this.mountKpiPanorama();
    this.bind();
    // Gövde her tazelemede baştan kurulduğu için bayrak kapları da yenidir;
    // canvas'lar burada takılır (kopan eskiler kendi kendini siler).
    hydrateFlags(this.el.body, this.game.world.nations);
    syncChronicleReplay(this.game, this.el.body.querySelector('[data-replay-mount]'));
    this.restoreScroll(scroll);
    this.lockHeight();
    refreshTooltips();
    if (refocus) restoreFocus(refocus, this.el.body);
    this.onRefresh?.();
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
    return renderDossierScreen(this, me);
  }


  /** Kayıt ekranının düğmeleri. Yükle, üstüne yaz ve sil geri alınmaz: ilk tık onay ister. */
  bindSaves(game) {
    const body = this.el.body;
    const note = (text) => { this.saveNote = text; this.refresh(); };
    const confirmThen = (key, act) => {
      if (this.saveConfirm !== key) {
        this.saveConfirm = key;
        this.armConfirm('saveConfirmTimer', () => this.saveConfirm === key, () => { this.saveConfirm = null; });
        this.refresh();
        return;
      }
      this.saveConfirm = null;
      clearTimeout(this.saveConfirmTimer);
      act();
    };
    const nameInput = body.querySelector('#save-name');
    if (nameInput) nameInput.oninput = () => { this.saveName = nameInput.value; };
    const saveNew = body.querySelector('[data-save-new]');
    if (saveNew) {
      saveNew.onclick = async () => {
        const name = (this.saveName ?? '').trim() || nameInput?.placeholder || null;
        note('Saving…');
        const result = await game.save(name);
        if (result.ok) this.saveName = '';
        note(result.ok ? `Saved “${name}”.` : `Could not save: ${result.reason}.`);
      };
    }
    for (const btn of body.querySelectorAll('[data-save-load]')) {
      const slot = btn.dataset.saveLoad;
      btn.onclick = () => confirmThen(`load:${slot}`, async () => {
        note('Loading…');
        const result = await game.load(slot);
        // Başarılı yükleme 'world' yayar ve ekran kapanır; not yalnız rette kalır.
        this.saveNote = result.ok ? null : `Could not load: ${result.reason}.`;
        if (!result.ok) this.refresh();
      });
    }
    for (const btn of body.querySelectorAll('[data-save-over]')) {
      const slot = btn.dataset.saveOver;
      btn.onclick = () => confirmThen(`over:${slot}`, async () => {
        const old = listSaves().find((row) => row.slot === slot);
        note('Saving…');
        const result = await game.save(old?.name ?? null, slot);
        note(result.ok ? `Overwrote “${old?.name ?? 'save'}”.` : `Could not save: ${result.reason}.`);
      });
    }
    for (const btn of body.querySelectorAll('[data-save-del]')) {
      const slot = btn.dataset.saveDel;
      btn.onclick = () => confirmThen(`del:${slot}`, async () => {
        await deleteSave(slot);
        note('Save deleted.');
      });
    }
    for (const btn of body.querySelectorAll('[data-save-export]')) {
      btn.onclick = async () => {
        const slot = btn.dataset.saveExport;
        const text = await exportSaveText(slot);
        if (!text) { note('That save is missing from browser storage.'); return; }
        const save = listSaves().find((row) => row.slot === slot);
        const stem = `${save?.name || (slot === LEGACY_SLOT ? 'autosave' : 'campaign')}`
          .toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        link.download = `imperial-eye-${stem || 'campaign'}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        note(`Exported ${link.download}.`);
      };
    }
    const importBtn = body.querySelector('[data-save-import]');
    const importFile = body.querySelector('#save-import-file');
    if (importBtn && importFile) {
      importBtn.onclick = () => importFile.click();
      importFile.onchange = async () => {
        const file = importFile.files?.[0];
        if (!file) return;
        const result = await importSaveText(await file.text(), file.name.replace(/\.json$/i, ''));
        note(result.ok ? `Imported “${result.info.name}”: load it from the list.` : `Could not import: ${result.reason}.`);
      };
    }
  }

  /** Vassal satırı: bırak ya da ilhak et (ikisi de geri alınmaz, iki tık). */
  vassalButtons(world, target, annexWhy, cls) {
    const confirming = (kind) => this.vassalConfirm === `${kind}:${target.id}`;
    // İkisi de geri alınmaz: tehlike rolü (styles.css §69).
    const release = `<button class="${cls} danger${confirming('release') ? ' confirming' : ''}" data-release-vassal="${target.id}"${tipAttrText(`Release ${target.name}\nThe tribute stops and they become fully independent. Only then can you declare war on them.`)}>${confirming('release') ? 'Confirm release?' : 'Release'}</button>`;
    const annex = `<button class="${cls} danger${confirming('annex') ? ' confirming' : ''}" data-annex-vassal="${target.id}"${annexWhy.length
      ? ` disabled${tipAttrText(`Annex ${target.name}\n${annexWhy.join('\n')}`)}`
      : tipAttrText(`Annex ${target.name}\nTheir provinces join us and their army disbands. Their peoples become our subjects, and it costs a quarter of a conquest's infamy.`)}>${confirming('annex') ? 'Confirm annex?' : `Annex · ${annexCost(world, target)} PP`}</button>`;
    return `${release}${annex}`;
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
      ? demandKeyForTile(world, tile, this.peaceTarget, me.id)
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
      .map((id) => `${resourceArt(id, 'xs')} ${RESOURCES[id].name}`);
    const imports = RESOURCE_IDS
      .filter((id) => (records[id]?.imported ?? 0) > 0.05 && (records[id]?.need ?? 0) > 0)
      .sort((a, b) => records[b].imported / records[b].need - records[a].imported / records[a].need)
      .slice(0, 3)
      .map((id) => `${resourceArt(id, 'xs')} ${RESOURCES[id].name} (${Math.round(records[id].imported / records[id].need * 100)}%)`);
    const standing = techStanding(world, target);
    const allies = alliesOf(target)
      .map((id) => world.nations[id])
      .filter((n) => n?.alive)
      .map((n) => esc(n.name));
    const rival = target.rivalId != null ? world.nations[target.rivalId] : null;
    const memoryRows = memoryOf(target).slice(-3).reverse().map((m) => {
      const year = chronicleYear(m.turn);
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
        refused_call: `left to fight alone by ${other}`,
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
    // Masanın iki sınırı: bütçe (fiyatlar toplamı skoru aşamaz) ve küme
    // tavanı; ekran ikisini de peace.js'ten okur, kendisi hesap kurmaz.
    const crushing = crushingVictory(world, me.id, target.id);
    const limit = demandLimitFor(world, me.id, target.id, score);
    // NE URETIYOR? Masa il adi ve hex sayisi veriyordu; oyuncu sulfur kumesini
    // sigir kumesi sanip aldi (kor oyun testi: Zelfell/Norrfell). Kaynak
    // etiketi her satirda durur.
    // Hex kaynaklari: kume birden cok mal cikarir; en cok hex tutan ikisi.
    const rgoOf = (province) => {
      if (!province?.econ) return '';
      const lines = depositsOf(province).slice(0, 2)
        .map((line) => (RESOURCES[line.id] ? `${resourceArt(line.id, 'xs')} ${RESOURCES[line.id].name}` : null))
        .filter(Boolean);
      return lines.length ? ` · ${lines.join(', ')}` : '';
    };
    const list = (keys, kind) => (keys.length ? keys.map((key) => {
      const province = provinceFromKey(world, key);
      if (!province) return '';
      const starred = province.tileIdx.some((idx) => world.tiles[idx].city);
      return `<div class="peace-tile ${kind}">
        <span>${esc(province.name)}${starred ? ` ${glyph('star-on', 'ctl')}` : ''} · ${province.tileIdx.length} hex${rgoOf(province)}</span>
        <b>${provinceWarCost(world, province)}</b>
        <button class="peace-drop" data-drop-tile="${esc(key)}" data-drop-kind="${kind}" title="Remove">${glyph('close', 'ctl')}</button>
      </div>`;
    }).join('') : '');

    /**
     * ALINABILECEKLER LISTESI.
     *
     * Eski ekran yalnizca SECILENLERI gosteriyordu; secilecek bir sey yoksa
     * tek yazdigi "Click states on the map." idi. Yani oyuncuya masada ne
     * oldugu hic soylenmiyordu: 160x96'lik haritada kirmizi kume aramak,
     * hangisinin kac ettigini tek tek tiklayarak ogrenmek zorundaydi.
     * Isgal edilmis kumeler zaten hesaplanıyor (peace.js occupiedProvincesOf);
     * ekran artik onu basiyor.
     */
    const takeable = () => {
      const held = occupiedProvincesOf(world, me.id, target.id)
        .filter((entry) => !selection.demands.has(provinceKeyOf(entry.province)));
      // İşgal edilmiş başkent listede yoksa oyuncu nedenini görmeli; ezici
      // zaferde listededir ve sonucu da yazılır (peace.protectedCapital).
      const capital = capitalProvinceOf(world, target.id);
      const capitalHeld = capital && capital.tileIdx.some((idx) => controllerOf(world.tiles[idx]) === me.id);
      const capitalNote = !capitalHeld ? ''
        : !protectedCapital(world, me.id, target.id)
          ? `<p class="empty">Crushing victory: ${esc(capital.name)}, ${esc(target.name)}'s capital, is on the table. Take everything and the state is annexed; leave land and its capital moves there.</p>`
          : `<p class="empty">${esc(capital.name)} is ${esc(target.name)}'s capital: a peace treaty does not erase a state. Hold it and half their land for a crushing victory, or vassalize them (Terms).</p>`;
      if (!held.length) {
        return `<p class="empty">${offer.demands.length
          ? 'Every occupied state is already on the table.'
          : `Nothing to demand yet — occupy ${esc(target.name)}'s provinces first.`}</p>${capitalNote}`;
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
        // Satın alınabilir: kalan bütçeye sığar VE küme tavanı dolmadı.
        const afford = cost <= budget - cost0 && offer.demands.length < limit;
        return `<button class="peace-offer-row${near ? ' adjacent' : ''}"
          data-take-tile="${esc(key)}" title="${esc(province.name)} — ${cost} war score">
          <span class="por-name">${esc(province.name)}${starred ? ` ${glyph('star-on', 'ctl')}` : ''}</span>
          <span class="por-meta">${province.tileIdx.length} hex${rgoOf(province)} · ${Math.round(share * 100)}% held${
  near ? ' · borders you' : ''}</span>
          <b class="por-cost${afford ? '' : ' res-neg'}">${cost}</b>
        </button>`;
      }).join('') + capitalNote;
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
        <b class="pg-name">${esc(goal.name)}${rgoOf(goal)}</b>
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
      <div class="ldr-table">${leaderPhoto(target.leader, 'sm')}${leaderByline(target.leader)}</div>
      <div class="row-buttons">
        <button class="k-btn primary" data-sign-peace="1" ${acceptable ? '' : 'disabled'}>
          ${offer.demands.length || offer.concessions.length ? 'Sign treaty' : 'Sign white peace'}</button>
        <button class="k-btn" data-fill-peace="1" ${budget > 0 ? '' : 'disabled'}
          ${tipAttrText('Best deal\nFill the war score: occupied states first, borders yours before islands, the rest as terms — the same rule the AI uses.')}>Best deal</button>
        <button class="k-btn" data-clear-peace="1">Clear</button>
      </div>
    </div>
    <div class="sub-tabs peace-tabs">
      <button data-peace-tab="take" class="${tab === 'take' ? 'active' : ''}">Demand<em>${offer.demands.length}</em></button>
      <button data-peace-tab="give" class="${tab === 'give' ? 'active' : ''}">Concede<em>${offer.concessions.length}</em></button>
      <button data-peace-tab="terms" class="${tab === 'terms' ? 'active' : ''}">Terms<em>${offer.terms.length}</em></button>
    </div>
    <div class="card">
      <div class="card-head"><h3>${tab === 'take' ? `Demands from ${esc(target.name)}`
    : tab === 'give' ? 'States you offer' : 'Additional terms'}</h3>
        <small>${tab === 'take'
    ? (limit > 0
      ? `${Math.max(0, budget - cost)} of ${budget} war score left · up to ${limit} ${limit === 1 ? 'state' : 'states'}${crushing ? ' (crushing victory)' : ''} · click a row or the map`
      : `war score ${LAND_FLOOR} lets you demand a state — terms only for now`)
    : tab === 'give' ? 'giving land lowers the price of the treaty'
      : 'terms that do not move borders'}</small></div>
      ${tab === 'terms' ? this.peaceTermList(world, me, target)
    : tab === 'give' ? (list(offer.concessions, 'give')
      || '<p class="empty">Click your own states on the map to offer them.</p>')
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
        ? 'They are not weak enough to vassalise: be 2.5 times stronger, or hold their capital and half their land.'
        : 'They have no foreign-culture provinces.';
      return `<button class="peace-term ${picked ? 'picked' : ''}" data-peace-term="${term.id}"
        ${usable ? '' : 'disabled'} title="${esc(usable ? term.desc : why)}">
        <span class="peace-term-icon">${glyph(TERM_GLYPH[term.id])}</span>
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
    return `${esc(province.name)}${starred ? ` ${glyph('star-on', 'ctl')}` : ''} (${provinceWarCost(world, province)})`;
  }).join(' · ')}</span></div>` : '');
    const terms = offer.terms?.length ? `<div class="offer-line"><small>Terms</small>
      <span>${offer.terms.map((id) => `${glyph(TERM_GLYPH[id], 'inline')} ${esc(PEACE_TERMS[id].name)}`)
    .join(' · ')}</span></div>` : '';
    const white = !offer.demands?.length && !offer.concessions?.length && !terms;
    // Teklifin bedeli oyuncunun gözünden: pozitif sayı "bu kadarını veriyorum".
    const cost = offerCost(world, offer);
    return `<div class="card peace-offer">
      <div class="card-head"><h3>${esc(from.name)} proposes peace</h3>
        <small>their war score ${warScore(world, entry.from, this.me.id)} · costs you ${cost}</small></div>
      <div class="ldr-table">${leaderPhoto(from.leader, 'sm')}${leaderByline(from.leader)}</div>
      ${white ? '<p class="hint">A white peace: the borders stay exactly where they are.</p>' : ''}
      ${tileLine(offer.demands, 'They annex')}
      ${tileLine(offer.concessions, 'They cede to us')}
      ${terms}
      <div class="row-buttons">
        <button class="k-btn primary" data-accept-offer="${entry.id}">Accept terms</button>
        <button class="k-btn" data-reject-offer="${entry.id}">Fight on</button>
      </div>
    </div>`;
  }

  // --- Ülke özeti: bayrağa dokununca açılan stratejik durum ekranı ---
  /**
   * Ulusal vakayiname: kampanyanin hafizasi. Hizli oynayan oyuncu 11 saniyelik
   * bir toast'i kacirinca tarihini kaybediyordu (kor beta B-013). Burada
   * yalnizca ULUSAL (tier 2+) olaylar durur — her fabrika, her fiyat degil.
   */
  /**
   * KRONİK: solda ulusun tarihi (zaman çizelgesi, yıl başlıkları), sağda
   * büyük güçlerin sıralaması ve son iki yılın eğrileri. Eskiden yalnız liste
   * vardı ve oyunun ilk yılında ekran tek cümlelik boş bir kutuydu.
   */
  render_chronicle(me) {
    const world = this.game.world;
    const entries = ensureChronicle(me);
    const board = scoreboard(world);
    const rank = board.findIndex((row) => row.nation.id === me.id) + 1;
    const mine = board[rank - 1];
    const history = me.economy?.history ?? [];
    const year = chronicleYear(this.game.turns.turn);

    const kpis = kitKpiRow([
      kitKpi({ label: 'Year', value: String(year), sub: `${Math.max(0, END_YEAR - Number(year))} years to ${END_YEAR}`, cls: 'hero' }),
      kitKpi({ label: 'Rank', value: rank ? `${rank}<small> / ${board.length}</small>` : '—', sub: '', tip: { text: `Rank\nBy hegemony score: industry, population, land, prestige and the national goal. The leader in ${END_YEAR} wins.` } }),
      kitKpi({ label: 'Score', value: String(mine?.total ?? 0), sub: board[0] && board[0].nation.id !== me.id ? `leader ${board[0].total}` : 'you lead', meter: board[0] ? (mine?.total ?? 0) / Math.max(1, board[0].total) : 0 }),
      kitKpi({ label: 'Entries', value: String(entries.length), sub: '' }),
    ]);

    // Zaman çizelgesi: en yeni üstte, yıl değişince yıl başlığı.
    let lastYear = null;
    const rows = [...entries].reverse().map((entry) => {
      const y = chronicleYear(entry.turn);
      const head = y !== lastYear ? `<li class="chron-yearhead">${y}</li>` : '';
      lastYear = y;
      return `${head}<li class="chron-row tier-${entry.tier ?? 2}">
        <i class="chron-dot" aria-hidden="true"></i>
        <span class="chron-text"><b>${esc(entry.title)}</b>${entry.detail ? `<small>${esc(entry.detail)}</small>` : ''}</span>
      </li>`;
    }).join('');
    // Boş kronik "boş kutu" değil kitabın İLK SAYFASI: ulusun bayrağı ve
    // tarih. Oyunun ilk aylarında bu ekran tek cümleden ibaretti.
    const timeline = rows ? `<ol class="chron-list">${rows}</ol>`
      : `<div class="chron-empty chron-opening">
          <span class="chron-opening-flag" data-flag-nation="${me.id}" data-flag-w="84" data-flag-h="56"></span>
          <small>${esc(saveDate(this.game.turns.turn))}</small>
          <b>The chronicle of ${esc(me.name)} opens.</b>
          <p>Wars and treaties, supply crises, new governments, great proclamations and lost provinces will be written here as they happen.</p></div>`;

    // Büyük güçler.
    const top = board.slice(0, 10);
    if (rank > 10) top.push(mine);
    const leader = Math.max(1, board[0]?.total ?? 1);
    const powers = top.map((row) => {
      const at = board.indexOf(row) + 1;
      // Rakibin satırı dosyasını açar (Screens.bind [data-nation]).
      return `<li class="chron-power${row.nation.id === me.id ? ' me' : ''}"${row.nation.id === me.id ? '' : ` data-nation="${row.nation.id}" role="button" tabindex="0"`} data-tip="text" data-tip-text="${esc(`${row.nation.name}\nScore ${row.total}: economy ${row.economy ?? '—'}, land and prestige the rest`)}">
        <em>${at}</em><span class="chron-flag" data-flag-nation="${row.nation.id}" data-flag-w="30" data-flag-h="20"></span>
        <b>${esc(row.nation.name)}</b><span class="chron-bar"><i style="width:${(row.total / leader * 100).toFixed(1)}%"></i></span><span>${row.total}</span></li>`;
    }).join('');

    // Son iki yıl.
    const series = (key) => history.map((h) => h[key]).filter(Number.isFinite);
    const fmt = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(0)}K` : Math.round(v * 10) / 10);
    const trend = (label, key) => {
      const list = series(key);
      // Geçmiş yokken "0 · +0%" yazmak 12 milyonluk ülkeye sıfır nüfus
      // dedirtiyordu: ilk hafta kapanana dek değer yerine tire.
      if (!list.length) {
        return `<div class="chron-trend"><small>${label}</small><b>—</b>${kitSpark(list, { width: 160, height: 30, zero: false })}</div>`;
      }
      const last = list[list.length - 1];
      const first = list[0];
      const change = first ? (last - first) / Math.abs(first) : 0;
      return `<div class="chron-trend"><small>${label}</small><b>${fmt(last)}</b><em class="${change >= 0 ? 'pos' : 'neg'}">${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}%</em>
        ${kitSpark(list, { width: 160, height: 30, zero: false })}</div>`;
    };
    // Geçmiş kaydı { population, fund, ic, output } taşır (altın ve gelir kalktı).
    const trends = `<div class="chron-trends">${trend('Population', 'population')}${trend('Output', 'output')}${trend('Industry', 'ic')}${trend('Development fund', 'fund')}</div>`;

    return `${kpis}
      <div class="k-split chron-split chron3">
        <div class="k-stack">
          ${kitPanel('The age in motion', '<div class="replay-mount" data-replay-mount></div>', { sub: 'the borders, month by month' })}
        </div>
        <div class="k-stack">
          ${pressArchivePanel(world)}
          ${kitPanel('Chronicle', timeline, { sub: '' })}
        </div>
        <div class="k-stack">
          ${kitPanel('Great powers', `<ol class="chron-powers">${powers}</ol>`, { sub: `hegemony score · the leader in ${END_YEAR} wins` })}
          ${kitPanel('The last two years', trends, { sub: `${history.length} weeks` })}
        </div>
      </div>`;
  }

  render_nation(me) {
    return renderNationOverview(this.game, me);
  }

  // --- Kalkınma (sekme kimliği eski: 'construction') ---

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
    const summary = militarySummary(world, me);
    // İlk hafta kapanmadan fatura yazılmamıştır ve ikmal "0.0 IC/wk" görünüyordu;
    // ordu ilk günden fatura keser. Kapanışın kullandığı billsOf bugünkü
    // orduyla aynı sayıyı verir (Economy ekranı da onu basar).
    if (!me.economy?.bills && (me.economy?.ic?.output ?? 0) > 0) {
      const bills = billsOf(world, me, me.economy.ic.output, this.game.turns.turn);
      Object.assign(summary, { supply: bills.army + bills.navy, armyCost: bills.army, navyCost: bills.navy, supplyShare: bills.s });
    }
    return militaryScreen(this.military, {
      summary,
      roster: commandRoster(world, me),
      options: recruitOptions(this.game, me),
      queue: trainingRows(this.game, me),
      stats: militaryStats(world, me),
      composition: armyComposition(world, me.id),
      logistics: equipmentLogistics(world, me),
      // Zırhlı teknolojisiyle gemi buharlıya döner; Factories ekranıyla aynı resim.
      ironclad: mod(me, 'ironclad') > 0,
      levy: levyView(world, me),
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
      // Subay komisyonu tek seferlik bir alımdır: kalkınma fonundan, IC.
      trainCost: cost.ic,
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
    for (const btn of body.querySelectorAll('[data-military-view]')) {
      btn.onclick = () => {
        this.military.view = btn.dataset.militaryView;
        this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-category]')) {
      btn.onclick = () => {
        this.military.category = btn.dataset.militaryCategory;
        this.refresh();
      };
    }
    for (const box of body.querySelectorAll('[data-military-levy]')) {
      box.onchange = () => {
        setLevied(me, Number(box.dataset.militaryLevy), box.checked);
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
        const wanted = Number(btn.dataset.count) || (event.shiftKey ? 5 : 1);
        let ordered = 0;
        for (let i = 0; i < wanted; i++) {
          if (!game.turns.buyUnit(me, btn.dataset.militaryBuild)) break;
          ordered++;
        }
        // Kısıt dolunca kalan siparişler sessizce düşüyordu: ×5 iki alay
        // verip susuyordu (ölçüldü). Kalanın sebebi günlüğe yazılır.
        if (ordered < wanted) {
          const why = recruitBlockers(game, me, btn.dataset.militaryBuild)[0]?.text ?? 'The order was refused.';
          game.turns.addLog(wanted > 1 ? `${ordered} of ${wanted} ordered. ${why}` : why, { kind: 'ARMY' });
        }
        this.refresh();
      };
    }
    for (const btn of body.querySelectorAll('[data-military-top]')) {
      btn.onclick = () => {
        if (moveTrainingTo(me, btn.dataset.militaryTop, 'top')) this.refresh();
      };
    }
    const leveeBtn = body.querySelector('[data-military-levee]');
    if (leveeBtn) {
      leveeBtn.onclick = () => {
        // Iki tik: son umut geri alinmaz (savas ilani ile ayni kalip). Onay
        // durumu ekranda tutulur: dugmenin kendi ozniteligindeyken haftalik
        // tazeleme onu sessizce siliyor, ikinci tik yeniden "kur" oluyordu.
        if (!this.military.leveeConfirm) {
          this.military.leveeConfirm = true;
          this.armConfirm('leveeTimer', () => this.military.leveeConfirm, () => { this.military.leveeConfirm = false; });
          this.refresh();
          return;
        }
        this.military.leveeConfirm = false;
        clearTimeout(this.leveeTimer);
        callToArms(game, me);
        this.refresh();
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
    // Subayı emekli et: iki tık (ilk tık kurar, CONFIRM_MS sonra söner).
    const retire = body.querySelector('[data-military-retire]');
    if (retire) {
      retire.onclick = () => {
        const id = Number(retire.dataset.militaryRetire);
        if (this.military.retireConfirm !== id) {
          this.military.retireConfirm = id;
          this.armConfirm('retireTimer', () => this.military.retireConfirm === id, () => { this.military.retireConfirm = null; });
          this.refresh();
          return;
        }
        clearTimeout(this.retireTimer);
        this.military.retireConfirm = null;
        const general = retireGeneral(game.world, me, id);
        if (general) {
          game.turns.addLog(`${general.branch === BRANCH.NAVY ? 'Admiral' : 'General'} ${general.name} retired from the staff.`,
            { kind: 'COMMANDER' });
          if (game.activeGeneral?.id === id) game.activeGeneral = null;
          this.military.leader = null;
          game.emit('command', null);
          game.requestRender();
        }
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


  render_cultures(me) {
    return renderCultures(this.game, me, this.uc);
  }

  render_policies(me) {
    return renderPolicies(this.game, me, this.uc);
  }

  render_population(me) {
    return renderPopulation(this.game, me, this.uc);
  }

  // --- Teknoloji: zaman cizelgeli agac (bkz. technologyScreen.js) ---
  render_technology(me) {
    const world = this.game.world;
    const turn = world.turn ?? 1;
    const year = yearOfTurn(turn);
    const standing = techStanding(world, me);
    // Görünüm saklanır: inceleme paneli fare/klavyeyle tek başına yenilenirken
    // aynı fiyat ve hız dökümünü okur.
    return technologyScreen(me, this.techView = {
      year,
      yearExact: exactYearOfTurn(turn),
      rate: researchPointsOf(me),
      rateLines: researchRateLines(me),
      rank: standing.rank,
      of: standing.of,
      // SERT KURAL: ekran ETKIN maliyeti gosterir (yayilim indirimi dahil).
      // Liste fiyati basmak, motorun dusecegi sayiyla celisir ve
      // UI_TRUTH_FIXES'in kapattigi hata sinifini yeniden acardi.
      costOf: (techId) => effectiveTechCost(world, me, techId, year),
      // Henüz kimse bulmadıysa ilk bulan prestij alır (technology.js).
      firstOpen: (techId) => firstDiscoveryOpen(world, techId),
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
      panel.innerHTML = techInspector(me, techId, this.techView);
      panel.classList.remove('is-swapping');
      void panel.offsetWidth;
      panel.classList.add('is-swapping');
    }
    for (const node of this.el.body.querySelectorAll('.tech-node.is-inspected')) {
      node.classList.remove('is-inspected');
    }
    this.el.body.querySelector(`.tech-node[data-tech="${CSS.escape(techId)}"]`)?.classList.add('is-inspected');
    this.lightTechPath(me, techId);
  }

  /**
   * Yol ışığı: incelenen teknolojiye giden araştırılmamış önkoşullar ve
   * aralarındaki bağlantılar yanar. Önkoşul hep aynı satırdadır (bkz.
   * technology.researchPath); "bunu almak için önce ne lazım" tek bakışta
   * görünür, tıklayınca kurulacak yol da tam olarak budur.
   */
  lightTechPath(me, techId) {
    for (const el of this.el.body.querySelectorAll('.tech-tree .is-path')) el.classList.remove('is-path');
    const path = techId ? researchPath(me, techId) : [];
    if (path.length < 2) return;
    for (const id of path) {
      this.el.body.querySelector(`.tech-node[data-tech="${CSS.escape(id)}"]`)?.classList.add('is-path');
      this.el.body.querySelector(`.tech-link[data-link="${CSS.escape(id)}"]`)?.classList.add('is-path');
    }
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
    // İmleç görsel px, kaydırma yerel px (ui/uiScale.js).
    const box = tree.getBoundingClientRect();
    const offsetX = anchor ? toLocal(anchor.x - box.left) : 0;
    const offsetY = anchor ? toLocal(anchor.y - box.top) : 0;
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
  /**
   * KAYITLAR. Eskiden World Settings'te tek yuvaya yazan iki düğme vardı:
   * otomatik kayıt elle alınanı eziyor, yükleme onaysız kampanyayı
   * değiştiriyor, ret "no compatible save" diye geçiştiriliyordu. Şimdi
   * yuvalar (saveStore: IndexedDB), onaylı yükle/üstüne yaz/sil, dosyaya
   * aktarma ve ret nedeni.
   */
  render_saves(me) {
    const rows = listSaves();
    const manual = manualCount();
    const full = manual >= MAX_MANUAL;
    const confirming = (key) => this.saveConfirm === key;
    const defaultName = `${me.name} · ${saveDate(this.game.turns.turn)}`;
    const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
    const button = (key, attr, label, confirmLabel, extra = '') => `<button class="k-btn sm${confirming(key) ? ' confirming' : ''}" ${attr}${extra}>${confirming(key) ? confirmLabel : label}</button>`;
    const row = (save) => {
      const readable = readableVersion(save.version);
      const title = save.name || (save.auto ? 'Autosave' : 'Saved game');
      const stale = readable ? '' : ` disabled${tipAttrText(`Made by another version (save v${save.version}); this build reads v${SAVE_VERSION}.`)}`;
      const actions = [
        button(`load:${save.slot}`, `data-save-load="${save.slot}"`, 'Load', 'Confirm load?', stale
          || tipAttrText('Load this campaign. Progress since your last save is lost.\nClick twice to confirm.')),
        save.auto ? '' : button(`over:${save.slot}`, `data-save-over="${save.slot}"`, 'Overwrite', 'Confirm overwrite?',
          tipAttrText('Save the current campaign into this slot, replacing it.\nClick twice to confirm.')),
        `<button class="k-btn sm" data-save-export="${save.slot}"${tipAttrText('Download this save as a file.')}>Export</button>`,
        button(`del:${save.slot}`, `data-save-del="${save.slot}"`, 'Delete', 'Confirm delete?'),
      ].join('');
      const facts = [save.nation, Number.isFinite(save.turn) ? saveDate(save.turn) : null, save.seed != null ? `seed ${save.seed}` : null]
        .filter(Boolean).join(' · ');
      return `<div class="save-row${readable ? '' : ' stale'}">
        <div class="save-main"><span class="save-title"><b>${esc(title)}</b>${save.auto ? '<span class="tag">auto</span>' : ''}</span><small>${esc(facts)}</small></div>
        <div class="save-when"><small>${esc(when(save.savedAt))}</small><small>${save.chars ? `${(save.chars / 1e6).toFixed(1)} MB` : ''}</small></div>
        <div class="save-actions">${actions}</div>
      </div>`;
    };
    return `<div class="card">
      <div class="card-head"><h3>Save campaign</h3><small>${manual}/${MAX_MANUAL} slots · the game also autosaves every ten weeks into its own slot</small></div>
      <div class="save-new">
        <input type="text" id="save-name" maxlength="60" placeholder="${esc(defaultName)}" value="${esc(this.saveName ?? '')}" />
        <button class="action" data-save-new${full ? ` disabled title="All ${MAX_MANUAL} slots are used: overwrite or delete one"` : ''}>Save</button>
      </div>
      ${this.saveNote ? `<p class="save-note">${esc(this.saveNote)}</p>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h3>Saved games</h3><small>kept in this browser · export a save to move it to another window</small></div>
      ${rows.length ? `<div class="save-list">${rows.map(row).join('')}</div>` : '<p class="empty">No saves yet.</p>'}
      <div class="row-buttons"><button class="action" data-save-import>Import from file…</button>
        <input type="file" id="save-import-file" accept=".json,application/json" hidden /></div>
    </div>`;
  }

  render_diplomacy(me) {
    return renderDiplomacyScreen(this, me);
  }

  /** Savaşın ayrıntı paneli: gövde ui/warDetail.js'te (sağ üst panelle ortak). */
  conflictPanel(c) {
    return kitPanel(`${c.attackers[0].name} vs ${c.defenders[0].name}`, conflictDetailHtml(this.game.world, c), { sub: 'war details', cls: 'dip-cpanel' });
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
   * AUTO hapı: başlıkta, ekran adının yanında. Alanın tarifi ve hükûmetin son
   * eylemi bilgi kartındadır; hapın yanında yalnız son eylemin tek satırı
   * durur. Eskiden gövdenin tepesinde üç satırlık şeritti ve her ekranın asıl
   * içeriğini aşağı itiyordu. Kısayol: A.
   */
  autoPill(me, areaId) {
    const area = DELEGATION_AREAS[areaId];
    if (!area) return '';
    const on = isDelegated(me, areaId);
    return pillHtml(area, { on, last: on ? lastDelegatedAction(me, areaId) : null, key: 'Shift+A' });
  }

  /**
   * AUTO anahtarı ekranın GÖSTERGE ŞERİDİNİN son kartıdır: ekran açılınca
   * gözün ilk düştüğü sıra. Eskiden sekme çubuğunun sağ ucunda küçük bir
   * haptı (Kerem 2026-11-15: "auto tuşunu daha görünür bir yere al").
   * Kart neyi devrettiğini de söyler ("Trade law"); bir anahtar artık yalnız
   * kendi ekranının kaldıracını yönetir. Şeridi olmayan bir ekran gelirse
   * sekme çubuğundaki eski hap yedek olarak çıkar.
   */
  mountAuto(me, areaId) {
    const kpis = areaId ? this.el.body.querySelector('.k-kpis') : null;
    if (kpis) {
      kpis.insertAdjacentHTML('beforeend', this.autoCard(me, areaId));
      kpis.classList.add('has-auto');
    }
    if (this.el.auto) this.el.auto.innerHTML = areaId && !kpis ? this.autoPill(me, areaId) : '';
  }

  /**
   * PANORAMA: görseli gelmemiş kartlar ekranın fotoğrafını taşır, ama her
   * kart aynı kırpımı gösterseydi şerit beş kez tekrar eden bir resim olurdu.
   * Fotoğraf şeridin tamamına yayılır; her kart onun kendi altına düşen
   * dilimini gösterir (pencereden bakılan tek sahne). Kartın şeritteki yeri
   * yalnız JS'te bilinir: sol ofset ve şerit genişliği değişken olarak yazılır.
   */
  mountKpiPanorama() {
    for (const row of this.el.body.querySelectorAll('.k-kpis')) {
      const width = row.clientWidth;
      if (!width) continue;
      row.style.setProperty('--kw', `${width}px`);
      for (const card of row.children) {
        const art = card.querySelector(':scope > .k-kpi-art.is-pano');
        if (!art) continue;
        art.style.setProperty('--kx', `${-(card.offsetLeft + art.offsetLeft)}px`);
      }
    }
  }

  autoCard(me, areaId) {
    const area = DELEGATION_AREAS[areaId];
    if (!area) return '';
    const on = isDelegated(me, areaId);
    const last = on ? lastDelegatedAction(me, areaId) : null;
    const tip = [
      `${area.name} · ${on ? 'run by the government' : 'in your hands'}`,
      on ? area.desc : 'You hold this yourself. Turn AUTO on to hand it to the government; your own orders always come first.',
      on && last ? `\nLast: ${last.text}\n${last.reason}` : '',
      '\nShortcut: Shift+A',
    ].filter(Boolean).join('\n');
    return `<button type="button" class="k-kpi auto-card${on ? ' is-on' : ''}" data-kpi="automation" data-auto="${areaId}" aria-pressed="${on}"${tipAttr({ text: tip })}>
      ${kpiArt('automation')}
      <span class="auto-switch" aria-hidden="true"><i></i></span>
      <span class="k-kpi-body"><small>Automation</small><b>${on ? 'On' : 'Off'}</b><em>${AUTO_SCOPE[areaId] ?? area.name}</em></span>
      <kbd class="auto-key">⇧A</kbd>
    </button>`;
  }

  /**
   * Açık ekranın klavyesi. HUD her tuşu önce buraya sorar; true dönerse tuş
   * tüketilmiştir (harita kaymaz). Space ve +/− saatindir, buraya gelmez.
   */
  handleKey(event) {
    const me = this.me;
    if (!me || !this.active) return false;
    // Shift+A: düz A kameranın sola kaydırma tuşudur (hud PAN_KEYS). Ekran
    // açıkken haritayı WASD ile kaydıran oyuncu her A'da AUTO'yu
    // değiştiriyordu (Kerem: "auto tuşu bozulmuş").
    if (event.code === 'KeyA' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const pill = this.el.body.querySelector('.auto-card[data-auto]') ?? this.el.auto?.querySelector('[data-auto]');
      if (!pill) return false;
      pill.click();
      return true;
    }
    if (this.active === 'construction') return constructionKey(this, event);
    if (this.active === 'industry') return industryKey(this, event);
    if (this.active === 'technology') return this.techKey(event);
    return false;
  }

  /**
   * Teknoloji klavyesi: oklar ağaçta gezer (aşağı/yukarı en yakın yıla atlar),
   * Enter araştırır, Q kuyruğa ekler ya da çıkarır, [ ] yakınlaştırır.
   */
  techKey(event) {
    const me = this.me;
    const rows = techGrid();
    if (!rows.length) return false;
    // İlk tuş vurgunun görünmesini sağlar, atlamaz: incelenen yoksa önce
    // varsayılan düğüm (technologyScreen.defaultInspect) seçilir.
    if (!this.tech.inspect && /^Arrow|^Enter$|^NumpadEnter$|^KeyQ$/.test(event.code)
      && !event.target?.closest?.('#screen-body button, #screen-body input, #screen-body select')) {
      const first = defaultInspect(me) ?? rows[0][0].id;
      this.inspectTech(me, first);
      this.el.body.querySelector(`.tech-node[data-tech="${CSS.escape(first)}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    }
    const current = this.tech.inspect ?? defaultInspect(me) ?? rows[0][0].id;
    let r = rows.findIndex((row) => row.some((t) => t.id === current));
    if (r < 0) r = 0;
    const c = Math.max(0, rows[r].findIndex((t) => t.id === current));
    const go = (id) => {
      this.inspectTech(me, id);
      this.el.body.querySelector(`.tech-node[data-tech="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    switch (event.code) {
      case 'ArrowRight':
        if (c < rows[r].length - 1) go(rows[r][c + 1].id);
        return true;
      case 'ArrowLeft':
        if (c > 0) go(rows[r][c - 1].id);
        return true;
      case 'ArrowDown':
      case 'ArrowUp': {
        const next = r + (event.code === 'ArrowDown' ? 1 : -1);
        if (next < 0 || next >= rows.length) return true;
        const year = rows[r][c].year;
        const best = rows[next].reduce((a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a));
        go(best.id);
        return true;
      }
      case 'Enter':
      case 'NumpadEnter':
        // Odaktaki düğme kendi Enter'ını kullanır.
        // Yalnız ekranın İÇİNDEKİ odaklı denetim kendi Enter'ını kullanır:
        // fareyle tıklanan sekme düğmesi odakta kalınca Enter o düğmeyi
        // çalıştırıp ekranı KAPATIYORDU.
        if (event.target?.closest?.('#screen-body button, #screen-body input, #screen-body select')) return false;
        researchNow(me, current);
        this.refresh();
        return true;
      case 'KeyQ':
        if ((me.research?.queue ?? []).includes(current)) dequeueResearch(me, current);
        else queueResearch(me, current);
        this.refresh();
        return true;
      case 'BracketLeft':
        this.zoomTech(-1);
        return true;
      case 'BracketRight':
        this.zoomTech(1);
        return true;
      default:
        return false;
    }
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
    bindPolicyScreen(this);
    if (this.active === 'diplomacy' || this.active === 'dossier') bindDiplomacyScreen(this);
    for (const btn of this.el.body.querySelectorAll('[data-embargo]')) {
      btn.onclick = () => {
        declareEmbargo(game, me, Number(btn.dataset.embargo));
        this.refresh();
      };
    }

    // AUTO anahtari sekme seridinde (#screen-auto, #screen'in DISINDA): kok
    // altinda aranirsa hic baglanmaz ve hap tiklamaya cevap vermez. Panel
    // ici anahtarlar (Agenda) govdededir; ikisi de ayni yoldan baglanir.
    const pills = [...(this.el.auto?.querySelectorAll('[data-auto]') ?? []), ...this.el.body.querySelectorAll('[data-auto]')];
    for (const btn of pills) {
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
    // Haftalık tazeleme ağacı yeniden kurar: incelenen düğümün yolu yanık kalsın.
    if (this.active === 'technology') this.lightTechPath(me, this.tech.inspect);
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
        const rect = localRect(el);
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
    // EN İYİ TEKLİF: YZ'nin kendi kuralıyla (peace.buildOffer) bütçe dolar —
    // önce bitişik işgal, kalan puan şartlara. Toprağı tek tek eklemek
    // savaş başına onlarca tıktı (ev ödevi testi).
    const fillPeace = this.el.body.querySelector('[data-fill-peace]');
    if (fillPeace) {
      fillPeace.onclick = () => {
        const me = game.world.nations[game.turns.playerNation];
        const best = buildOffer(game.world, me.id, this.peaceTarget, { appetite: 1 });
        this.peaceSelection = {
          demands: new Set(best.demands),
          concessions: new Set(),
          terms: new Set(best.terms),
        };
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
          this.armConfirm('warConfirmTimer', () => this.warConfirm === id, () => { this.warConfirm = null; });
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
    this.bindSaves(game);
    // Vassal: bırakma ve ilhak geri alınmaz; ilk tık onay ister (savaşla aynı kalıp).
    const vassalAction = (btn, kind, act) => {
      btn.onclick = () => {
        const id = Number(kind === 'release' ? btn.dataset.releaseVassal : btn.dataset.annexVassal);
        const key = `${kind}:${id}`;
        if (this.vassalConfirm !== key) {
          this.vassalConfirm = key;
          this.armConfirm('vassalConfirmTimer', () => this.vassalConfirm === key, () => { this.vassalConfirm = null; });
          this.refresh();
          return;
        }
        this.vassalConfirm = null;
        clearTimeout(this.vassalConfirmTimer);
        if (act(game, me, id)) game.requestRender();
        this.refresh();
      };
    };
    for (const btn of this.el.body.querySelectorAll('[data-release-vassal]')) vassalAction(btn, 'release', releaseVassal);
    for (const btn of this.el.body.querySelectorAll('[data-annex-vassal]')) vassalAction(btn, 'annex', annexVassal);
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
    // State'i haritada göster (Kerem 2026-11-23: "province'lere bir şey yapma ekranlarında, mesela
    // penal states, o province'i görebilelim; menüden yönetme olmasın sadece"). Ekran kapanır,
    // kamera state'in merkezine iner ve onu seçer: sol panel state'in kartını açar.
    for (const btn of this.el.body.querySelectorAll('[data-goto-state]')) {
      btn.onclick = (event) => {
        event.stopPropagation();
        const tile = game.world.provinces?.[Number(btn.dataset.gotoState)]?.center;
        if (!tile) return;
        this.close();
        // Development tablosundaki state adıyla aynı yol (stateScreens data-uc-focus).
        game.focusTile(tile);
      };
    }
    // State araması: aynı paneldeki tablonun satırlarını adla süzer (yeniden kurmadan).
    for (const input of this.el.body.querySelectorAll('[data-state-search]')) {
      const apply = () => {
        const q = input.value.trim().toLowerCase();
        this.stateQuery = { ...(this.stateQuery ?? {}), [input.dataset.stateSearch]: input.value };
        const table = input.closest('.k-panel, section, div')?.querySelector(`[data-state-table="${input.dataset.stateSearch}"]`);
        for (const row of table?.querySelectorAll('.k-pol-tr:not(.head)') ?? []) {
          row.hidden = Boolean(q) && !row.textContent.toLowerCase().includes(q);
        }
      };
      input.value = this.stateQuery?.[input.dataset.stateSearch] ?? '';
      input.oninput = apply;
      // Arama kutusunda yazılan harfler oyunun kısayolları değildir (WASD, Space, F tuşları).
      input.onkeydown = (event) => { if (event.key !== 'Escape') event.stopPropagation(); };
      if (input.value) apply();
    }
    for (const btn of this.el.body.querySelectorAll('[data-nation]')) {
      btn.onclick = () => this.openDossier(Number(btn.dataset.nation));
    }
    // Düğme gibi görünen, klavyeye düğme diye kendini tanıtan satırlar
    // (Kronik'teki güçler) Enter'a da yanıt verir; <li> bunu kendisi yapmaz.
    // Yalnız Enter: Space bütün düğmelerde saattir (hud.bindKeys).
    for (const el of this.el.body.querySelectorAll('[role="button"]:not(button)')) {
      el.onkeydown = (event) => {
        if (event.key !== 'Enter' || event.repeat) return;
        event.preventDefault();
        el.click();
      };
    }
    // Dünya savaşının ayrıntı paneli (Wars süzgeci, World wars listesi, sağ üst panel).
    for (const btn of this.el.body.querySelectorAll('[data-dip-conflict]')) {
      btn.onclick = () => {
        this.warFocus = this.warFocus === btn.dataset.dipConflict ? null : btn.dataset.dipConflict;
        this.refresh();
        if (this.warFocus) this.el.body.querySelector('.dip-cpanel')?.scrollIntoView({ block: 'nearest' });
      };
    }
    const closeConflict = this.el.body.querySelector('.dip-cpanel [data-cd-close]');
    if (closeConflict) closeConflict.onclick = () => { this.warFocus = null; this.refresh(); };
    for (const btn of this.el.body.querySelectorAll('.dip-cpanel [data-cd-nation]')) {
      btn.onclick = () => this.openDossier(Number(btn.dataset.cdNation));
    }
    const look = this.el.body.querySelector('.dip-cpanel [data-cd-look]');
    if (look) {
      look.onclick = () => {
        const c = worldConflicts(game.world, game.turns.playerNation).find((x) => x.key === look.dataset.cdLook);
        const tile = conflictFocusTile(game.world, c);
        this.close();
        if (tile) game.focusTile(tile);
      };
    }
    // Diplomasi tablosunun süzgeci (Hepsi · Komşular · Savaşlar · Müttefikler).
    for (const btn of this.el.body.querySelectorAll('[data-dip-filter]')) {
      btn.onclick = () => {
        this.dipFilter = btn.dataset.dipFilter;
        this.refresh();
      };
    }
    for (const btn of this.el.body.querySelectorAll('[data-open-screen]')) {
      btn.onclick = () => this.open(btn.dataset.openScreen);
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
