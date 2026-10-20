// DOM arayüzü: ayarlar, katman anahtarları, seçili hex paneli.
// Oyun mantığı burada yok; sadece Game'i sürer ve olaylarını dinler.

import {
  UNIT_COSTS, canAfford, formatCost, pay,
} from '../game/cities.js';
import { UNIT_TYPES, menUnderArms } from '../game/units.js';
import {
  MIN_WAR_TURNS, ULTIMATUM_WEEKS, atWar, crisisLeft, inCrisis, overlordOf, relation, truceLeft, warBlockers,
} from '../game/diplomacy.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import {
  CULTURE, foreignShareOf, rebelCultureOf, unrestBreakdown,
} from '../game/culture.js';
import { stageOf } from '../game/movements.js';
import { savedInfo } from '../game/save.js';
import { areasOfScreen, isDelegated } from '../game/delegation.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { mountFlag } from '../render/flagWave.js';
import {
  DATA_MODES, DIPLOMACY_COLORS, INFAMY_RAMP, UNREST_RAMP, developmentShade, diplomacyStanding, rampColor,
} from '../render/renderer.js';
import { bindMacroCards } from './macroCard.js';
import { armDisband, armyPanelHtml, commandCardsHtml, generalPickerHtml } from './armyPanel.js';
import { LEAVE_MS, hidePanel, motionOn, panelOpen, togglePanel } from './motion.js';
import { Screens } from './screens.js';
import { TabLedger } from './tabLedger.js';
import { showEndScreen } from './endScreen.js';
import { formatPopulation } from '../game/economy.js';
import { RESOURCES, RESOURCE_IDS, DEVELOPMENT_MAX } from '../game/econ/defs.js';
import { developmentCap, fundFloor, investmentTarget, levelCost } from '../game/econ/investment.js';
import { inSupplyCrisis } from '../game/econ/bills.js';
import { emblemArt, resourceArt } from './icons/art.js';
import { glyph } from './icons/glyphs.js';
import { provideTooltip, quietScroll, refreshTooltips } from './tooltip.js';
import { CURRENCY, meter as kitMeter, money, pips as kitPips, tipAttr } from './kit.js';
import { stateCultures, stateYield } from '../game/stateView.js';
import { depositsOf, fertilityOf } from '../game/econ/deposits.js';
import { workforceShare } from '../game/econ/resources.js';
import { FOCUSES, FOCUS_BY_ID, focusSlots, nextSlotAt } from '../game/focus.js';
import { focusBlockers, focusPreview, focusedStates, setFocus } from '../game/stateFocus.js';
import { powerIncome } from '../game/politics.js';
import {
  canRecruit, disband, equipmentCostLabel, nationManpower, rallyTile, setRallyPoint,
  trainingWeeks,
} from '../game/recruitment.js';
import {
  BRANCH, assignDivisions, createGeneral, generalById,
  borderNationIds, generalCost, refreshFront, retireGeneral, setAggression, unassignGeneral,
} from '../game/command.js';
import { controllerOf, isOccupied } from '../game/control.js';
import { tileDefense } from '../game/battles.js';
import { POPULATION_SCALE } from '../game/populationScale.js';
import { worldRows } from '../world/worldgen.js';
import { dateOfTurn } from '../game/calendar.js';
import { WarDock } from './warDock.js';

const $ = (id) => document.getElementById(id);

/** Katmanlar → Hex grid tercihi (tarayıcıda; varsayılan kapalı). */
const GRID_KEY = 'hexwar.map.hexGrid';
/** Sınır katmanları; anahtar yoksa açık (varsayılan görünüm). */
const BORDER_KEYS = { showCountryBorders: 'hexwar.map.countryBorders', showProvinceBorders: 'hexwar.map.provinceBorders' };


/** Saat durum satırında hızın adı (düğmelerin aria-label'ıyla aynı). */
const SPEED_NAMES = { 1: 'Normal speed', 2: 'Fast', 4: 'Very fast', 6: 'Rapid', 8: 'Fastest' };

/**
 * ÜST ÇUBUK GÖSTERGESİ: oyuk yuvada simge (madalyon ya da çizgi ikon),
 * çevresinde isteğe bağlı dolum halkası (istikrar, savaş desteği, SG,
 * şöhret), yanında versal etiket ve değer. Eski hücre etiket+sayıdan ibaretti
 * ve çubuk "web dashboard" okunuyordu (Kerem: "üst taraf hiç hoşuma gitmedi").
 */
function ringSvg(share, tone = '') {
  const r = 17.5;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, share ?? 0));
  return `<svg class="tb-ring ${tone}" viewBox="0 0 40 40" aria-hidden="true">
    <circle class="trk" cx="20" cy="20" r="${r}"/>
    <circle class="val" cx="20" cy="20" r="${r}" stroke-dasharray="${(f * c).toFixed(2)} ${c.toFixed(2)}"/></svg>`;
}

/**
 * DEĞİŞİM İZİ: hücre bir anahtar, sayısal değer ve eşik taşır; HUD bir önceki
 * değerle karşılaştırıp hücreyi bir kez parlatır, halkayı eski dolumdan yeniye
 * kaydırır (animateTopChanges). Eşik gürültüyü keser: çıktı her hafta oynar,
 * her hafta parlarsa 8x hızda çubuk sürekli yanıp söner. `pol` -1: artışı kötü
 * (şöhret).
 */
function track(key, value, eps, pol = 1) {
  return `data-k="${key}" data-v="${Number(value) || 0}" data-eps="${eps}" data-pol="${pol}"`;
}

/** Yüzen farkın metni: hücrenin kendi biriminde, işaretli. */
function deltaLabel(key, delta) {
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(delta);
  if (key === 'stab' || key === 'ws') return `${sign}${Math.round(abs)}%`;
  if (key === 'inf' || key === 'ic' || key === 'out') return `${sign}${abs.toFixed(1)}`;
  if (key === 'power') return `${sign}${Math.round(abs)}`;
  if (key === 'pop' || key === 'army' || key === 'mp') return `${sign}${formatPopulation(abs)}`;
  if (key.startsWith('r-')) return `${sign}${Math.round(abs * 100)}%`;
  return '';
}

/** İkincil gösterge (nüfus, ordu, havuz, sanayi): küçük ikon, değer, etiket. */
function miniCell(icon, label, value, attrs = '', cls = '') {
  return `<span class="tb-mini${cls ? ` ${cls}` : ''}" tabindex="0" ${attrs}>
      <span class="tb-mini-ico">${icon}</span><b>${value}</b><small>${label}</small></span>`;
}

/** `extra`: değerin altına giren ek satır (Output hücresinin çubuğu). */
function statCell(icon, label, value, attrs = '', cls = '', ring = null, extra = '') {
  return `<span class="tb-gauge${cls ? ` ${cls}` : ''}" tabindex="0" ${attrs}>
      <span class="tb-socket">${ring ? ringSvg(ring.share, ring.tone) : ''}<span class="tb-ico">${icon}</span></span>
      <span class="tb-gv"><small>${label}</small><b>${value}</b>${extra}</span>
    </span>`;
}

/**
 * TEK ÇUBUK (TASARIM.md §1): haftanın çıktısı dört paya bölünür — faturalar,
 * ordu, halk, kalkınma (economy.alloc; toplamı çıktıya birebir eşit). Hücrenin
 * altındaki ince şerit bu bölüşümü ekran açmadan okutur. Stil satır içidir:
 * styles.css başka bir elde; `tb-bar` sınıfı CSS'e taşınabilsin diye durur.
 * Renkler sabit ve soluk: gri fatura, kırmızı ordu, yeşil halk, mavi kalkınma.
 */
const BAR_SEGMENTS = [
  ['bills', 'hsl(40 6% 52%)'],
  ['army', 'hsl(8 50% 48%)'],
  ['people', 'hsl(95 32% 46%)'],
  ['invest', 'hsl(208 42% 52%)'],
];
function outputBar(alloc, crisis) {
  const total = Math.max(1e-6, alloc?.output ?? 0);
  const segments = alloc ? BAR_SEGMENTS.map(([key, color]) => {
    const share = Math.max(0, alloc[key] ?? 0) / total;
    return share > 0.002 ? `<i style="flex:${share.toFixed(4)} 1 0;background:${color}"></i>` : '';
  }).join('') : '';
  // Kriz nabzı mevcut kare dizilerinden kurulur: kaynak çipinin kıtlık
  // parıltısı (tb-pulse, kırmızı gölge) + duraklatma satırının soluklaşması
  // (turn-paused-pulse): değer sütunu taşmayı kırptığı için (.tb-gv overflow)
  // gölge tek başına yarım kalır. Hareket kapalıysa yalnız kırmızı değer kalır.
  const pulse = crisis && motionOn()
    ? ';animation:tb-pulse 1.8s ease-in-out infinite,turn-paused-pulse 1.8s ease-in-out infinite' : '';
  return `<span class="tb-bar" aria-hidden="true" style="display:flex;gap:1px;height:3px;margin-top:2px;overflow:hidden;border-radius:1px;background:rgba(0,0,0,.5)${pulse}">${segments}</span>`;
}

/**
 * Sekme kısayolları: künyelerin soldan sağa sırası, on sekme F1-F10.
 * Cultures sonradan eklenince tablo dokuz tuşta kalmıştı: F7 yedinci sekmeyi
 * (Cultures) değil Politics'i açıyordu, Cultures'ın tuşu yoktu. Diplomasi
 * (sekmesi yok) P'ye geçti; F11/F12 tarayıcınındır. Kimlikler eski adlarını
 * taşır (kayıt, devir tablosu, ekran kancaları onlara bağlı): 'construction'
 * künyede Development, 'budget' Economy yazar (Tek Çubuk, 2026-10-15).
 */
const TAB_KEYS = {
  F1: 'construction', F2: 'industry', F3: 'trade', F4: 'budget', F5: 'military',
  F6: 'population', F7: 'cultures', F8: 'politics', F9: 'technology', F10: 'chronicle',
};

/** Klavyeyle kamera kaydirma. Sol surukleme kutu secimine ayrildi. */
const PAN_STEP = 90;
const PAN_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [1, 0], ArrowLeft: [1, 0],
  KeyD: [-1, 0], ArrowRight: [-1, 0],
};

/**
 * Yazi alani: orada her tus yaziya aittir, kisayol calismaz. Kaydirac, onay
 * kutusu ve dugme yazi alani DEGILDIR — eskiden butun <input>'lar sayiliyordu
 * ve fareyle bir kaydiraca ya da kutuya dokunan oyuncunun Space/Esc/+/-
 * tuslari, odak baska yere gecene kadar olu kaliyordu.
 */
const NON_TEXT_INPUTS = new Set([
  'range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image',
]);
function takesText(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !NON_TEXT_INPUTS.has(el.type);
}

/** Ok tuslarini kendisi kullanan denetim: odakli kaydirac ve secim kutusu. */
function ownsArrows(el) {
  return el?.tagName === 'SELECT' || (el?.tagName === 'INPUT' && el.type === 'range');
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      seedChip: $('seed-chip'),
      seedValue: $('seed-value'),
      layers: $('layer-menu'),
      rgoLegend: $('rgo-map-legend'),
      populationLegend: $('population-map-legend'),
      modeLegend: $('mode-legend'),
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
      turnStatus: $('turn-status'),
      topFlag: $('top-flag'),
      topNation: $('top-nation'),
      topSub: $('top-sub'),
      resources: $('resources'),
      macroStats: $('macro-stats'),
      saveInfo: $('save-info'),
      commandBar: $('command-bar'),
      commandTools: $('command-tools'),
      warBar: $('war-bar'),
    };
    this.screens = new Screens(game);
    // Sağ üst savaş paneli (bkz. ui/warDock.js); ekranları HUD açar.
    this.warDock = new WarDock(game, {
      openTalks: (id) => this.screens.openPeaceTalks(id),
      openDossier: (id) => this.screens.openDossier(id),
      openScreen: (name) => this.screens.open(name),
    });
    // Vic2 üst menüsü: her sekme kendi alanının canlı satırını taşır. Ekran
    // içindeki bazı eylemler (araştırmayı başlat, kuyruğa ekle) olay yaymaz;
    // ekranın her tazelemesi sekmeleri de tazeler ki satır bir hafta gecikmesin.
    this.tabLedger = new TabLedger(game);
    this.screens.onRefresh = () => this.tabLedger.schedule();
    this.buildRgoLegend();
    this.buildPopulationLegend();
    this.registerOutputTip();
    this.bind();
  }

  /**
   * Output hücresinin bilgi kartı: haftanın çıktısı nereden geldi, nereye
   * gitti, fonda ne var. Kart hücreyle birlikte burada durur (eski 'treasury'
   * kartı altın defteriydi); sayılar yalnız economy.ic / alloc / bills /
   * consumer alanlarından okunur, formül kurulmaz.
   */
  registerOutputTip() {
    const { game } = this;
    provideTooltip('topbar-output', () => {
      const nation = game.world?.nations[game.turns.playerNation];
      const economy = nation?.economy;
      if (!economy?.ic) return null;
      const { ic, alloc, bills, consumer } = economy;
      const n = (v) => (v ?? 0).toFixed(1);
      const crisis = inSupplyCrisis(nation);
      const summary = alloc
        ? `${n(alloc.output)} IC: ${n(alloc.bills)} bills · ${n(alloc.army)} army · ${n(alloc.people)} people · ${n(alloc.invest)} development.`
        : 'The first week has not closed yet.';
      const crisisLine = crisis && bills
        ? ` <b>Supply crisis:</b> the bills (${money(bills.owed, 1)}) are above the ceiling of ${money(bills.room, 1)};`
          + ` only ${Math.round((bills.s ?? 0) * 100)}% is paid, so reinforcement, training and order suffer.`
        : '';
      const efficiency = economy.investEfficiency ?? 1;
      const rows = [
        { label: 'Handwork', value: `+${n(ic.hand)}` },
        { label: 'Industry', value: `+${n(ic.total)}` },
        { label: 'Crown', value: `+${n(ic.crown)}` },
        alloc ? { label: crisis ? `Bills (${Math.round((bills?.s ?? 0) * 100)}% paid)` : 'Bills: supply, schools', value: `−${n(alloc.bills)}`, tone: crisis ? 'bad' : '' } : null,
        alloc ? { label: `Army (cap ${n(alloc.armyCap)})`, value: `−${n(alloc.army)}` } : null,
        alloc ? { label: `People (fed ×${(consumer?.feed ?? 1).toFixed(2)})`, value: `−${n(alloc.people)}` } : null,
        alloc ? { label: efficiency !== 1 ? `Development (×${efficiency.toFixed(2)} into the fund)` : 'Development', value: n(alloc.invest), tone: alloc.invest > 0 ? 'good' : '' } : null,
      ].filter(Boolean);
      // Fonun hedefi canlı: Develop odağı hafta ortasında değişebilir.
      const target = investmentTarget(game.world, nation);
      return {
        type: 'breakdown',
        title: 'Output',
        value: `${n(ic.output)} IC / week`,
        text: `${summary}${crisisLine}`,
        rowsLabel: 'This week',
        rows,
        footer: `${CURRENCY.label}: ${money(nation.fund ?? 0, 0)} (it may dip to ${money(fundFloor(nation), 0)})`
          + (target ? ` · saving for ${escapeHtml(target.name)}, level ${(target.econ.development ?? 1) + 1} at ${money(levelCost(target), 0)}.` : '.'),
      };
    });
  }

  /**
   * Kaynak lejandi RGO tablosundan uretilir. Elle yazilmis liste tabloya yeni
   * kaynak eklendikce geride kaliyordu: harita 14 kaynagi dogru boyuyor ama
   * lejand yalniz 4'unu acikliyordu.
   */
  buildRgoLegend() {
    const legend = this.el.rgoLegend;
    if (!legend) return;
    legend.innerHTML = Object.values(RESOURCES).filter((type) => type.id !== 'FOOD').map((type) => (
      `<span style="--rgo-color:hsl(${type.hue} ${type.sat}% 40%)">${resourceArt(type.id, 'xs')} ${type.name}</span>`
    )).join('');
  }


  /**
   * Nufus lejandi haritanin KENDI olceginden uretilir. Elle yazilan "1K-8K"
   * bantlari nufus olcegi on kat buyuyunce haritadan kopmustu: her province
   * "8K+" okunuyordu, harita ise onlari dort ayri tonda boyuyordu. Renk
   * dogrudan renderer.populationTint'ten gelir; bant uclari onun log bandidir
   * (1.5K-150K x POPULATION_SCALE) — orada degisirse burada da degismeli.
   */
  buildPopulationLegend() {
    const legend = this.el.populationLegend;
    const renderer = this.game.renderer;
    if (!legend || !renderer?.populationTint) return;
    const low = 1500 * POPULATION_SCALE;
    const high = 150000 * POPULATION_SCALE;
    // Iki anlamli basamak: ara duraklar "~69.6K" degil "~70K" okunsun.
    const round = (value) => {
      const step = 10 ** (Math.floor(Math.log10(value)) - 1);
      return Math.round(value / step) * step;
    };
    const stops = [0, 1 / 3, 2 / 3, 1].map((t) => round(low * (high / low) ** t));
    legend.innerHTML = stops.map((population, index) => {
      const label = index === 0 ? `${formatPopulation(population)} or less`
        : index === stops.length - 1 ? `${formatPopulation(population)}+`
          : `~${formatPopulation(population)}`;
      const color = renderer.populationTint({ province: { population } });
      return `<span style="--rgo-color:${color}">${label}</span>`;
    }).join('');
  }

  /**
   * Aktif savaslar. Savas bir menu icinde gizli kalmamali: EU4'te oldugu gibi
   * ustte, kirmizi parlayan bir kutucuk olarak durur ve tiklaninca dogrudan
   * baris masasini acar.
   */
  showWars() {
    const bar = this.el.warBar;
    const world = this.game.world;
    const me = world?.nations[this.game.turns.playerNation];
    if (!bar || !me?.alive) { if (bar) bar.innerHTML = ''; return; }
    const wars = world.nations.filter(
      (other) => other.alive && other.id !== me.id && atWar(world, me.id, other.id),
    );
    // Ültimatomlar: savaş henüz yok ama geri sayım var (bildirimi aşağıda düşer).
    const crises = world.nations.filter(
      (other) => other.alive && other.id !== me.id && inCrisis(world, me.id, other.id),
    );
    // Savaşların GÖSTERİMİ sağ üst panelde (ui/warDock.js, HOI4 savaş
    // kutuları): sekme şeridinin altındaki ortalı çipler kayıp, süre, işgal
    // ve hedef göstermiyordu. Şerit boş kalır (muharebe şeridi onun altına
    // yerleşiyordu); burada yalnız savaş/ültimatom bildirimlerinin temizliği.
    bar.classList.add('hidden');
    bar.innerHTML = '';
    // Savaş bittiyse savaş kartı da biter. Kart `ttl: 0` ile kalıcıdır ve
    // kendiliğinden kapanmaz; barış onu geçersiz kılan tek olaydır. İlan
    // kartı da ültimatom bitince düşer (anahtar `crisis-<id>`; CRISIS türü
    // borç kartlarıyla paylaşıldığından türe göre değil anahtara göre).
    if (!wars.length) this.game.notifications?.dismissKind('WAR');
    const openCrisis = new Set(crises.map((other) => `crisis-${other.id}`));
    const staleCrisis = (this.game.notifications?.active ?? [])
      .filter((entry) => entry.key?.startsWith('crisis-') && !openCrisis.has(entry.key))
      .map((entry) => entry.key);
    if (staleCrisis.length) this.game.notifications.dismissKeys(staleCrisis);
  }

  bind() {
    const { game, el } = this;

    // Paneller motion.js üzerinden açılıp kapanır: kapanış da bir hareket.
    $('btn-layers').onclick = () => {
      togglePanel(el.layers);
      hidePanel(el.settings);
    };
    $('btn-settings').onclick = () => {
      togglePanel(el.settings);
      hidePanel(el.layers);
      // Etiket yalniz dunya kurulunca yaziliyordu: 65 hafta sonra panel hala
      // "No save yet" diyordu, oysa otomatik kayit coktan yazilmisti.
      this.refreshSaveInfo();
    };
    $('btn-close-settings').onclick = () => hidePanel(el.settings);

    // Kültür dağılımı çipi kip ve vurgu değişince eşitlenir.
    game.on('mapmode', () => this.syncCultureChip());
    // Harita modları: sağ alt köşedeki düğme kümesi
    for (const btn of document.querySelectorAll('.mode-btn[data-mode]')) {
      btn.onclick = () => {
        game.renderer.setMapMode(btn.dataset.mode);
        for (const other of document.querySelectorAll('.mode-btn[data-mode]')) {
          other.classList.toggle('active', other === btn);
        }
        // Kültür dağılımı yalnız kültür kipindedir: başka kipe geçince söner.
        if (btn.dataset.mode !== 'cultures') game.renderer.cultureHighlight = null;
        // Donanma paneli (navyDock) deniz haritasıyla açılıp kapanır.
        game.emit('mapmode', btn.dataset.mode);
        togglePanel(el.rgoLegend, btn.dataset.mode === 'resources');
        togglePanel(el.populationLegend, btn.dataset.mode === 'population');
        this.showModeLegend();
        game.requestRender();
      };
    }
    // Diplomasi lejantındaki "kendi ilişkilerime dön" düğmesi.
    el.modeLegend.addEventListener('click', (event) => {
      if (!event.target.closest?.('[data-focus-reset]')) return;
      game.renderer.setDiplomacyFocus(null);
      this.showModeLegend();
      game.requestRender();
    });

    // Hex ızgarası isteğe bağlı bir veri katmanı: harita birimi province.
    // Açan oyuncunun tercihi oturumlar arasında kalır.
    const gridBox = $('opt-grid');
    let gridOn = false;
    try {
      gridOn = localStorage.getItem(GRID_KEY) === '1';
    } catch {
      // Depo kapalıysa varsayılan (kapalı) geçerli.
    }
    gridBox.checked = gridOn;
    game.renderer.showGrid = gridOn;
    gridBox.onchange = (e) => {
      this.setLayer('showGrid', e.target.checked);
      try {
        localStorage.setItem(GRID_KEY, e.target.checked ? '1' : '0');
      } catch {
        // Tercih yalnız bu oturumda yaşar.
      }
    };
    // Ülke ve province sınırları ayrı kapatılabilir: biri temiz arazi ya da
    // kaynak okumak, öteki ülke dolgusunu sınırsız görmek ister.
    for (const [flag, id] of [['showCountryBorders', 'opt-country-borders'], ['showProvinceBorders', 'opt-province-borders']]) {
      const box = $(id);
      let on = true;
      try {
        on = localStorage.getItem(BORDER_KEYS[flag]) !== '0';
      } catch {
        // Depo kapalıysa varsayılan (açık) geçerli.
      }
      box.checked = on;
      game.renderer[flag] = on;
      box.onchange = (e) => {
        this.setLayer(flag, e.target.checked);
        try {
          localStorage.setItem(BORDER_KEYS[flag], e.target.checked ? '1' : '0');
        } catch {
          // Tercih yalnız bu oturumda yaşar.
        }
      };
    }
    $('opt-labels').onchange = (e) => this.setLayer('showLabels', e.target.checked);
    // CANLI DENIZ — kare suresinin tek en buyuk kalemi.
    //
    // Olculdu: uzak zoomda kare suresinin %97'si su katmani (47 ms; hedef 2 ms),
    // ve duraklatilmis oyunda bile ana thread'in %64'u denizi ciziyordu.
    // Kalite anahtari `WaterLayer` icinde zaten vardi ama yalnizca konsoldan
    // erisiliyordu (water.js: "Gelistirici anahtarlari; oyuncu arayuzunde yok"),
    // yani yavas makinedeki oyuncunun eline hicbir zaman gecmiyordu.
    // 'low' taban + kabarmayi birakir, kirisik/parilti/kopugu keser.
    const water = game.renderer?.water;
    if (water) {
      $('opt-live-sea').onchange = (e) => {
        water.quality = e.target.checked ? 'high' : 'low';
        // `swell` DE kapanmali. Uzak zoomun pahali yolu (`drawFar`) yalnizca
        // `debug.swell`e bakar, `quality`ye DEGIL: kalite 'low' yapilsa bile
        // desen dolgusu -- maliyetin tamami -- yine calisiyordu. `base` acik
        // kalir, yani deniz duruyor; yalnizca canlanmiyor.
        for (const key of ['swell', 'ripple', 'shimmer', 'foam']) {
          water.debug[key] = e.target.checked;
        }
        game.renderer.invalidateCache();
        game.requestRender();
      };
    }

    el.seedChip.onclick = () => this.copySeed();

    const sync = () => this.syncLabels();
    el.inSize.oninput = sync;
    el.inCont.oninput = sync;
    el.inLand.oninput = sync;
    el.inNations.oninput = sync;
    sync();

    $('btn-generate').onclick = () => {
      const cols = Number(el.inSize.value);
      const rows = worldRows(cols);
      const nations = Number(el.inNations.value);
      game.newWorld(el.inSeed.value.trim() || undefined, {
        cols,
        rows,
        continentality: Number(el.inCont.value),
        landBias: Number(el.inLand.value),
        nationCount: nations > 0 ? nations : null,
      });
      hidePanel(el.settings);
      this.picker?.open();
    };

    // Hızlı kayıt yeni yuvaya yazar; liste, yükleme ve dosya işleri kayıt
    // ekranındadır (screens.render_saves). Ekran açılınca saat durur: kayıt
    // seçerken kampanya akmasın.
    $('btn-save').onclick = async () => {
      this.el.saveInfo.textContent = 'Saving…';
      const result = await game.save(`${game.world.nations[game.turns.playerNation]?.name ?? 'Campaign'} · ${gameDate(game.turns.turn)}`);
      this.el.saveInfo.textContent = result.ok ? 'Saved to a new slot. Saves… lists, loads and exports them.' : `Could not save: ${result.reason}.`;
    };
    $('btn-load').onclick = () => {
      hidePanel(el.settings);
      game.setSpeed(0);
      this.screens.open('saves');
    };

    for (const btn of document.querySelectorAll('.time-btn[data-speed]')) {
      btn.onclick = () => game.setSpeed(Number(btn.dataset.speed));
    }
    // Saat biriminin yuvarlak düğmesi Space'in aynısı: duraklatıkken oynatır.
    $('btn-pause').onclick = () => game.togglePause();
    this.bindKeys();
    // Ordu paneline basılı fare: tıklama sürerken panel yeniden yazılmaz
    // (bkz. showTile, armyOnly). Bırakınca bekleyen tazeleme koşar.
    this.el.sheetBody.addEventListener('pointerdown', () => { this.sheetPressed = true; });
    // Province panelinin ✕'i (ordu panelinde vardı, bunda yoktu: panel yalnız
    // Esc ya da haritaya tıkla kapanıyordu). Esc ile aynı yol: seçim düşer.
    this.el.sheetBody.addEventListener('click', (event) => {
      if (!event.target.closest('[data-tile-close]')) return;
      this.game.selected = null;
      this.game.emit('select', null);
      this.game.requestRender();
    });
    // Komutan şeridinin kaydırma çubuğu gizli: taşan kartlara fare tekerleğiyle
    // ulaşılır (dikey tekerlek yatay kaydırır; harita yakınlaşmaz).
    this.el.commandBar?.addEventListener('wheel', (event) => {
      const bar = this.el.commandBar;
      if (!event.deltaY || bar.scrollWidth <= bar.clientWidth) return;
      event.preventDefault();
      bar.scrollLeft += event.deltaY;
    }, { passive: false });
    const release = () => {
      if (!this.sheetPressed) return;
      this.sheetPressed = false;
      if (this.armyRewritePending) {
        this.armyRewritePending = false;
        requestAnimationFrame(() => this.showTile(this.game.selected));
      }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.bindCommandDock();
    this.trackHeaderHeight();
    // HOI4'teki ülke bayrağı gibi ulusal durum panelini açar.
    $('nation-badge').onclick = () => this.screens.toggle('nation');

    game.on('world', (world) => { this.onWorld(world); this.showWars(); });
    game.on('select', (tile) => {
      this.showTile(tile);
      // Diplomasi kipinde bir ülkeye tıklamak haritayı ONUN gözünden boyar
      // (Paradox'un diplomasi haritası): kimle savaşta, kimin müttefiki.
      if (tile && game.renderer.mapMode === 'diplomacy') {
        const owner = tile.owner >= 0 ? tile.owner
          : (tile.fringeOf >= 0 ? (game.world.provinces?.[tile.fringeOf]?.owner ?? -1) : -1);
        if (owner >= 0) {
          game.renderer.setDiplomacyFocus(owner === game.turns.playerNation ? null : owner);
          this.showModeLegend();
          game.requestRender();
        }
      }
    });
    // Hafta damgasi yalniz gercek tur olayinda: onTurn ekonomi/insaat
    // olaylarinda da kosar, oradan sayilsaydi efektif hiz sisiyordu.
    game.on('turn', () => {
      (this.weekStamps ??= []).push(performance.now());
      this.onTurn();
      this.showWars();
      this.refreshDataMode();
    });
    // Barıştan sonra seçili kare paneli de tazelenir: "At war / Offer peace"
    // satırı bir sonraki haftalık yenilemeye kadar ekranda kalıyordu (Astra6 B5).
    game.on('peace', () => {
      this.showWars();
      this.refreshDataMode();
      if (game.selected) this.showTile(game.selected);
    });
    // Hafta içinde değişen ilişki: duraklatılmış oyunda da harita hemen yenilenir.
    game.on('diplomacy', () => {
      this.showWars();
      this.refreshDataMode();
      if (game.selected) this.showTile(game.selected);
    });
    // Otomatik kayit da elle kayit da ayni satiri tazeler (bkz. game.flushAutosave).
    game.on('save', (event) => {
      this.refreshSaveInfo();
      // Başarısız otomatik kayıt söylenir: eskiden kota dolunca kampanya
      // kaydedilmeden akıyor, oyuncu kaydı olduğunu sanıyordu.
      if (event?.error) {
        this.el.saveInfo.textContent = `Autosave failed: ${event.error}.`;
        game.turns.addLog(`Autosave failed: ${event.error}. Export or overwrite a save from Saves….`, {
          kind: 'INFO', key: 'autosave-failed',
        });
      }
    });
    // Gün tiki yalnız tarihi oynatır. Eskiden her gün tam onTurn koşuyordu:
    // hız 8'de saniyede 8 kez skorbord + ordu toplamı + üç innerHTML bloğu
    // (ölçüldü: tik başına ~1-2.4 ms + DOM çöpü). Haftalık kapanış zaten
    // 'turn'/'economy' olaylarıyla tam tazeliyor.
    game.on('clock', () => this.onDay());
    // Fondan ANINDA düşen alım (general, olay seçeneği) ve doyurma kolu
    // 'economy' yayar; haftalık tiki beklerse oyuncu eski rakamla karar
    // veriyordu (kör beta B-006). Eski 'construction' olayı artık yok.
    game.on('economy', () => this.queueTurn());
    // Ekran düğmeleri (yasa, danışman, karar, olay kartı) SG'yi anında harcar.
    game.on('politics', () => this.queueTurn());
    // Kampanya sonu (1945) tek satirlik bir metinle geciyordu; 'victory'
    // olayinin hicbir dinleyicisi yoktu. Artik yuzyilin kapanis sayfasi acilir.
    game.on('victory', (result) => showEndScreen(game, result));
    // "WHY THE PRICE MOVES" kalibi istikrara: dokum vardi ama YALNIZ hover
    // tooltip'inde duruyordu — kor beta testcisi 80 yil boyunca bulamadi
    // (B-003). Tiklama da ayni metni acar; tooltip ikincil yol olarak kalir.
    this.el.resources.addEventListener('click', (event) => {
      const cell = event.target.closest?.('[data-why="stability"]');
      if (cell) this.toggleWhy(cell, stabilityWhy(this.game.world?.nations[this.game.turns.playerNation]));
    });
    // Yalniz Enter: Space saatindir (bkz. bindKeys). Ikisi birden dinlenince
    // odakli hucrede Space hem balonu acip kapatiyor hem oyunu durduruyordu.
    this.el.resources.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const cell = event.target.closest?.('[data-why="stability"]');
      if (!cell) return;
      event.preventDefault();
      this.toggleWhy(cell, stabilityWhy(this.game.world?.nations[this.game.turns.playerNation]));
    });
    game.on('battles', () => {
      if (game.selected) this.showTile(game.selected);
      this.queueTurn();
    });
    game.on('provinces', () => {
      if (game.selected) this.showTile(game.selected);
      this.queueTurn();
    });
    game.on('selection', (units) => this.showSelection(units));
    game.on('command', () => this.showCommand());
    // AUTO anahtarı çevrilince künyenin ışığı hemen yanar/söner.
    game.on('delegation', () => this.syncTabAuto());
    game.on('orderRefused', ({ text }) => this.flashHint(text));
    game.on('units', () => {
      this.showTile(this.game.selected);
      this.queueTurn();
    });
  }

  /**
   * Hafta içi olaylardan gelen üst çubuk tazelemesini birleştirir. Bu olaylar
   * (units, battles, provinces, economy...) hafta kapanışında YZ ulusları için
   * de ateşleniyor: 8x'te üst çubuk haftada ~48 kez baştan innerHTML
   * yazılıyordu (ölçüldü), imlecin altındaki hücre her seferinde yenilenip
   * hover/bilgi kartı zamanlayıcısı sıfırlanıyordu.
   *   - Kapanış sürerken hiç tazelenmez: 'turn' olayı en sonda tam tazeler.
   *   - Duraklatılmışken oyuncunun eylemi bir sonraki karede görünür
   *     (fondan yapılan alım anında görünmeli, kör beta B-006).
   *   - Saat akarken en fazla 250 ms'de bir.
   */
  queueTurn() {
    if (this.game.turns?.turnJob || this.turnQueued) return;
    this.turnQueued = true;
    const since = performance.now() - (this.lastTurnAt ?? 0);
    const wait = this.game.clock?.speed ? Math.max(0, 250 - since) : 0;
    setTimeout(() => requestAnimationFrame(() => {
      this.turnQueued = false;
      this.onTurn();
    }), wait);
  }

  /**
   * Üst çubuğun gerçek yüksekliğini `--hud-top` değişkenine yazar; sekme
   * şeridi ve yönetim paneli konumlarını buradan okur.
   *
   * Neden ölçüyoruz: yükseklik sabit değil — göstergeler geniş ekranda tek,
   * dar ekranda iki ya da üç satıra diziliyor. Bunu CSS'te sabit bir
   * `--topbar-height` ile tahmin etmek iki türlü kırılıyordu: tahmin gerçek
   * yüksekliği tutmayınca şeritler üst üste biniyor, ve media query pencere
   * yeniden boyutlandırılarak değiştiğinde `calc()` içindeki değişkenler
   * tarayıcıda yeniden hesaplanmadığı için düzen ancak sayfa yenilenince
   * toparlanıyordu. ResizeObserver ölçüyü her durumda doğru tutar.
   */
  trackHeaderHeight() {
    const header = document.querySelector('.hud-header');
    const screen = document.querySelector('.screen');
    if (!header || !screen) return;
    // Üst bar ve sekme şeridi artık aynı akışta olduğu için birbirlerine
    // binemezler; ölçülmesi gereken tek şey yönetim panelinin nereden
    // başlayacağı. Ölçü doğrudan elemanın `style`'ına yazılır — CSS değişkeni
    // üzerinden yapılan güncelleme bu tarayıcıda her zaman yerleşimi yeniden
    // hesaplatmıyor.
    // Bildirim yığını da aynı ölçüye bağlanır: sabit bir CSS değeriyle
    // konumlandırıldığında sekme şeridinin üstüne biniyor ve Economy/Politics
    // sekmelerini kapatıyordu.
    const notify = document.getElementById('notify-stack');
    const apply = () => {
      const top = Math.round(header.getBoundingClientRect().height) + 16;
      screen.style.top = `${top}px`;
      // Alttaki 52 px bildirim tepsisinindir: ekran açıkken tepsi o şeride
      // iner (styles.css, body.screen-open .notify-stack). Eskiden tepsi
      // ekranın sağ alt köşesine biniyor, Military'de teçhizat değerlerini,
      // Diplomacy'de Declare War düğmelerini örtüyordu (ölçüldü).
      screen.style.maxHeight = `calc(100vh - ${top}px - 52px)`;
      if (notify) notify.style.top = `${top}px`;
      // Tumen listesi de baslik yuksekligine gore yer bulur: sabit 140px
      // tahmini, savas seridi acilinca listeyi cipin ustune bindiriyordu
      // (1280x720, Open Beta 4 B-14).
      document.documentElement.style.setProperty('--header-bottom', `${top}px`);
      // Künye kırılım eşiğinde küçülür: bayrak tuvali yeni kutuya göre takılır.
      this.mountTopFlag();
    };
    apply();
    if (typeof ResizeObserver === 'function') {
      this.headerObserver = new ResizeObserver(() => apply());
      this.headerObserver.observe(header);
    }
    window.addEventListener('resize', apply);
  }

  /**
   * Paradox tarzi saat kisayollari ve kamera tuslari. Sol surukleme kutu
   * secimine ayrildigi icin kamera WASD/ok tuslariyla da gezer.
   */
  /**
   * Ana menüyü ayarlar panelindeki düğmeye bağlar. Menü `main.js`te kurulur;
   * HUD onu yalnız açabilsin diye referansı burada tutulur.
   * (Arayüz metni İngilizce; Türkçe olan yalnız kod ve yorumlar.)
   */
  /** Ulke secim paneli (main.js kurar); yeni dunya uretince acilir. */
  bindPicker(picker) {
    this.picker = picker;
  }

  bindMenu(menu) {
    this.menu = menu;
    const btn = document.getElementById('btn-menu');
    if (!btn) return;
    btn.onclick = () => {
      hidePanel(this.el.settings);
      menu.reopen();
    };
  }

  bindKeys() {
    window.addEventListener('keydown', (event) => {
      if (takesText(event.target)) return;
      // Ctrl+1..9: seçimi kontrol grubuna yaz (tarayıcının sekme kısayolundan önce).
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
      if (digit && (event.ctrlKey || event.metaKey) && !event.altKey
        && !document.body.classList.contains('menu-open') && this.game.selection.length) {
        event.preventDefault();
        const count = this.game.assignControlGroup(Number(digit));
        this.flashHint(`Group ${digit}: ${count} ${count === 1 ? 'division' : 'divisions'}`);
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      // Perde açıkken boşluk/ok tuşları arkadaki haritayı sürmesin.
      if (document.body.classList.contains('menu-open')) return;

      if (event.code === 'Space') {
        // Space HER ZAMAN saattir. preventDefault odaktaki düğmenin ya da onay
        // kutusunun kendi Space tıklamasını da iptal eder: tek tuş, tek eylem
        // (kutu hem dönüp hem oyunu durdurmasın). Odaktaki denetimi Enter sürer.
        event.preventDefault();
        this.game.togglePause();
        return;
      }
      if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
        event.preventDefault();
        this.game.stepSpeed(1);
        return;
      }
      if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
        event.preventDefault();
        this.game.stepSpeed(-1);
        return;
      }
      if (event.code === 'KeyM') {
        // Deniz haritası: aç/kapa (N sıradaki boştaki birimdir).
        event.preventDefault();
        const mode = this.game.renderer?.mapMode === 'seas' ? 'political' : 'seas';
        document.querySelector(`.mode-btn[data-mode="${mode}"]`)?.click();
        return;
      }
      if (event.code === 'KeyN') {
        // "Siradaki bosta birim": fonksiyon bastan beri vardi (selectNextIdle),
        // hicbir tus/dugme cagirmiyordu. HOLD emirli birimler dongude gorunmez.
        event.preventDefault();
        this.game.selectNextIdle();
        return;
      }
      if (event.code === 'Escape') {
        // BUG-023: Escape hicbir seyi kapatmiyordu; oyuncu ✕'i aramak
        // zorundaydi. Sira onemli — once ACIK PANEL kapanir, panel yoksa
        // secim temizlenir. Tersi olsaydi panel acikken Escape sessizce
        // secimi silip paneli birakirdi.
        // Ayar ve katman panelleri de "acik panel"dir: kor oyun testinde
        // Escape yonetim ekranini kapatiyor ama World Settings'i birakiyordu.
        if (this.game.inspectorClose?.()) return;
        // Açık hat çizim aracı her şeyden önce bırakılır.
        if (this.game.drawTool) {
          this.game.setDrawTool(null);
          this.showCommand();
          return;
        }
        if (this.warDock?.closeDetail()) return;
        const openPanel = [this.el.settings, this.el.layers].find((panel) => panelOpen(panel));
        if (openPanel) {
          hidePanel(openPanel);
          return;
        }
        if (this.screens?.active) {
          this.screens.close();
          return;
        }
        // Komutan seçicisinde Esc "geri" demektir (✕ gibi); seçimi silmez.
        if (this.el.sheetBody.querySelector('.army-panel.is-picker')) {
          this.sheetPicker = null;
          this.showTile(this.game.selected);
          return;
        }
        this.game.selectGeneral(null);
        this.game.selectUnits([]);
        // Province secimi de kalkar: kalmasaydi sol alttaki rehber karti ilk
        // harita tikindan sonra bir daha hic gorunmuyordu (Open Beta 4, B-9).
        // `select` olayi null ile yayinlanir; HUD sol alt paneli bosaltir.
        if (this.game.selected) {
          this.game.selected = null;
          this.game.emit('select', null);
          this.game.requestRender();
        }
        return;
      }
      // F1-F10: sekme künyeleri soldan sağa. Sekme gizliyse (ekran kapalı)
      // tuş hiçbir şey yapmaz ama tarayıcıya da gitmez (F5 sayfayı yenilerdi).
      // P: diplomasi ve savaşlar (sekmesi yok; muharebe listesi, savaş
      // açıklaması ve barış teklifleri orada). Açık ekran tuşu önce alamaz:
      // P hiçbir ekranda kullanılmıyor.
      if (event.code === 'KeyP' && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        if (this.screens?.active === 'diplomacy') this.screens.close();
        else this.screens?.open('diplomacy');
        return;
      }
      const tab = TAB_KEYS[event.code];
      if (tab && !event.shiftKey) {
        event.preventDefault();
        const button = document.querySelector(`#tab-bar [data-screen="${tab}"]`);
        if (button?.offsetParent) this.screens?.toggle(tab);
        return;
      }
      // Açık ekran tuşu önce alır (her ekranda A = AUTO, ekranın kendi
      // kısayolları). Kullanmadığı tuş haritaya düşer.
      if (this.screens?.active && this.screens.handleKey(event)) {
        event.preventDefault();
        return;
      }
      // 1..9: kontrol grubunu çağır; aynı tuşa hemen tekrar basmak kamerayı oraya götürür.
      if (digit && this.game.controlGroups?.[digit]?.length) {
        event.preventDefault();
        const now = performance.now();
        const again = this.lastGroupKey?.digit === digit && now - this.lastGroupKey.t < 450;
        this.lastGroupKey = { digit, t: now };
        this.game.recallControlGroup(Number(digit), { focus: again });
        return;
      }
      // H: bekle aç/kapa · X / Delete: dur (yürüyüş ve emir düşer) · O: taarruz.
      if (event.code === 'KeyH' && this.game.selection.length) {
        event.preventDefault();
        const hold = this.game.toggleHoldSelection();
        this.flashHint(hold ? 'Holding position' : 'Hold lifted');
        this.showTile(this.game.selected);
        return;
      }
      if ((event.code === 'KeyX' || event.code === 'Delete') && this.game.selection.length) {
        event.preventDefault();
        const stopped = this.game.stopSelection();
        this.flashHint(`${stopped} ${stopped === 1 ? 'division stops' : 'divisions stop'}`);
        this.showTile(this.game.selected);
        return;
      }
      if (event.code === 'KeyO' && this.game.activeGeneral) {
        event.preventDefault();
        const stance = this.game.toggleOffensive();
        this.flashHint(stance === 'advance' ? `${this.game.activeGeneral.name}: offensive` : `${this.game.activeGeneral.name}: holding the line`);
        this.showCommand();
        this.showTile(this.game.selected);
        return;
      }
      // B: haritada seçili kendi state'inde Develop odağını aç/kapat (eski
      // hızlı inşa tuşu; inşa kalktı, kalkınmayı yönlendiren tek kol bu odak).
      if (event.code === 'KeyB' && !event.ctrlKey && this.el.sheetBody.querySelector('[data-develop]')) {
        event.preventDefault();
        const area = this.game.world?.provinces?.[this.game.selected?.provinceId];
        if (area) this.toggleDevelop(area);
        return;
      }
      const pan = PAN_KEYS[event.code];
      if (pan) {
        // Odaktaki kaydıraç/seçim kutusu okları kendisi kullanır (ince ayar);
        // WASD kamerada kalır.
        if (event.code.startsWith('Arrow') && ownsArrows(event.target)) return;
        event.preventDefault();
        this.game.camera.panByScreen(pan[0] * PAN_STEP, pan[1] * PAN_STEP);
        this.game.requestRender();
      }
    });
  }

  /** Komuta panelinin sabit dugmeleri: plan araclari ve durus kademesi. */
  bindCommandDock() {
    const { game } = this;
    $('btn-offensive').onclick = () => {
      game.toggleOffensive();
      this.showCommand();
    };
    // Hat araçları (HOI4): araç açıkken haritada sol sürükleme çizer.
    const tool = (kind) => () => {
      game.setDrawTool(game.drawTool === kind ? null : kind);
      if (game.drawTool) this.flashHint(kind === 'front' ? 'Drag along the border to draw the front' : 'Drag inside your territory to draw the fallback line');
      this.showCommand();
    };
    $('btn-draw-front').onclick = tool('front');
    $('btn-draw-fallback').onclick = tool('fallback');
    $('btn-fall-back').onclick = () => {
      const on = game.toggleFallBack();
      if (on != null) this.flashHint(on ? `${game.activeGeneral.name}: falling back` : `${game.activeGeneral.name}: back to the front`);
      this.showCommand();
      this.showTile(game.selected);
    };
    $('btn-clear-lines').onclick = () => {
      game.clearCommandLines();
      this.showCommand();
      this.showTile(game.selected);
    };
    $('command-target').onchange = (event) => {
      const value = event.target.value;
      game.setCommandTarget(value === '' ? null : Number(value));
      this.showCommand();
    };
    for (const btn of document.querySelectorAll('#command-tools [data-stance]')) {
      btn.onclick = () => {
        const general = game.activeGeneral;
        if (!general) return;
        setAggression(general, Number(btn.dataset.stance));
        game.emit('command', general);
        game.requestRender();
        this.showCommand();
      };
    }
  }

  /**
   * Seçim değişti. Liste artık AYRI bir sol üst panel değil, sol alttaki
   * ordu panelinin parçasıdır (armyPanel.js): iki panel birbirini sıkıştırıyor,
   * alttaki yalnız ilk tümeni anlatıyordu. Yalnız 'selection' yayan emirler
   * (Stop, Hold, devir) paneli de tazelesin diye burada yeniden çizilir.
   */
  showSelection() {
    if (this.game.selectedUnit) this.showTile(this.game.selected);
    this.showCommand();
  }

  /**
   * Komuta paneli: her zaman ekranin orta altinda. Portreye sol tik o generalin
   * butun tumenlerini secer, sag tik secili tumenleri ona devreder.
   */
  showCommand() {
    const { el, game } = this;
    const me = game.world?.nations[game.turns.playerNation];
    if (!me || !el.commandBar) return;
    // Yalniz kara kadrosu: bu serit cephe yonetimi icindir ve amiralin cephesi
    // yoktur. Filo komutasi Military ekranindan verilir (bkz. militaryScreen).
    const active = game.activeGeneral;
    const selected = game.selection.length;

    // Kartlar armyPanel.commandCardsHtml'de: madalyon portre, tam ad,
    // yıldız, tümen sayısı, duruş ve plan çubuğu (eski 58 px kutuda portre
    // 26 px'lik köşeye sıkışıp rozetin altında kalıyordu).
    const retireArm = this.retireArm && this.retireArm.until > performance.now() ? this.retireArm.id : null;
    el.commandBar.innerHTML = commandCardsHtml(game, me, { active, selected, retireArm });

    // Boolean sart: togglePanel `force ?? !acik` okur ve null "cevir" demektir.
    // General secili degilken arac cubugu her showCommand'da gorunup kayboluyordu.
    togglePanel(el.commandTools, Boolean(active));
    if (active) {
      const offensive = $('btn-offensive');
      const running = game.offensiveActive();
      offensive.classList.toggle('active', running);
      offensive.textContent = running ? '■ Halt' : '➤ Offensive';
      const target = $('command-target');
      const borderIds = new Set(borderNationIds(game.world, me.id));
      if (active.target != null) borderIds.add(active.target);
      const options = game.world.nations
        .filter((nation) => nation.alive && nation.id !== me.id && borderIds.has(nation.id))
        .sort((a, b) => Number(atWar(game.world, me.id, b.id))
          - Number(atWar(game.world, me.id, a.id)) || a.name.localeCompare(b.name));
      target.innerHTML = `<option value="">All active fronts</option>${options.map((nation) => (
        `<option value="${nation.id}">${escapeHtml(nation.name)}${atWar(game.world, me.id, nation.id) ? ' — at war' : ''}</option>`
      )).join('')}`;
      target.value = active.target == null ? '' : String(active.target);
      for (const btn of el.commandTools.querySelectorAll('[data-stance]')) {
        btn.classList.toggle('active', Number(btn.dataset.stance) === (active.aggression ?? 2));
      }
      $('btn-draw-front').classList.toggle('active', game.drawTool === 'front');
      $('btn-draw-front').classList.toggle('has-line', Boolean(active.line));
      $('btn-draw-fallback').classList.toggle('active', game.drawTool === 'fallback');
      $('btn-draw-fallback').classList.toggle('has-line', Boolean(active.fallback?.length));
      const fallBack = $('btn-fall-back');
      fallBack.disabled = !active.fallback?.length;
      fallBack.classList.toggle('active', Boolean(active.fallingBack));
      fallBack.textContent = active.fallingBack ? '↑ To front' : '⤺ Fall back';
      $('btn-clear-lines').disabled = !active.line && !active.fallback?.length;
    }

    for (const btn of el.commandBar.querySelectorAll('[data-general]')) {
      const general = generalById(me, Number(btn.dataset.general));
      btn.onclick = () => game.selectGeneral(general);
      // Kartın köşesindeki ✕: iki tıkla emeklilik (Kerem: "aşağıda generalleri
      // silme yok"). İlk tık 3 sn ✓'ye döner; ikincisi emekli eder, tümenleri
      // komutasız kalır. Kart düğmesine geçmesin diye yayılma kesilir.
      const x = btn.querySelector('[data-cmd-retire]');
      if (x) {
        x.onclick = (event) => {
          event.stopPropagation();
          if (this.retireArm?.id !== general.id || this.retireArm.until < performance.now()) {
            this.retireArm = { id: general.id, until: performance.now() + 3000 };
            clearTimeout(this.retireTimer);
            this.retireTimer = setTimeout(() => { this.retireArm = null; this.showCommand(); }, 3000);
            this.showCommand();
            return;
          }
          clearTimeout(this.retireTimer);
          this.retireArm = null;
          const gone = retireGeneral(game.world, me, general.id);
          if (gone) {
            game.turns.addLog(`General ${gone.name} retired from the staff.`, { kind: 'COMMANDER' });
            if (game.activeGeneral?.id === general.id) game.activeGeneral = null;
            game.emit('command', null);
            game.requestRender();
          }
          this.showCommand();
        };
      }
      btn.oncontextmenu = (event) => {
        event.preventDefault();
        if (!game.selection.length) return;
        const moved = game.transferSelection(general);
        if (moved) {
          game.turns.addLog(`${moved} divisions transferred to ${general.name}.`);
        }
        this.showSelection();
      };
    }
    const create = el.commandBar.querySelector('[data-new-command]');
    if (create) create.onclick = () => { if (game.selection.length) this.openGeneralPicker(game.selection); };
  }

  /**
   * Kısayolun tek satırlık onayı: komuta şeridinin üstünde belirir ve söner.
   * Klavyeyle verilen emir görünmezdi; oyuncu tuşun tuttuğunu bilmeliydi.
   */
  flashHint(text) {
    let el = this.el.flashHint;
    if (!el) {
      el = document.createElement('div');
      el.className = 'flash-hint';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
      this.el.flashHint = el;
    }
    el.textContent = text;
    // Komuta şeridinin hemen üstü: araç satırı açıkken sabit 132 px satırın
    // üstüne biniyordu (hat çizim ipucu düğmeleri örtüyordu).
    const dock = document.getElementById('command-dock')?.getBoundingClientRect();
    el.style.bottom = dock && dock.height ? `${Math.round(window.innerHeight - dock.top + 10)}px` : '';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }

  setLayer(flag, value) {
    this.game.renderer[flag] = value;
    this.game.renderer.invalidateCache();
    this.game.requestRender();
  }

  syncLabels() {
    const { el } = this;
    const cols = Number(el.inSize.value);
    el.lblSize.textContent = `${cols} × ${worldRows(cols)}`;
    el.lblCont.textContent = Number(el.inCont.value).toFixed(2);
    el.lblLand.textContent = Number(el.inLand.value).toFixed(2);
    const n = Number(el.inNations.value);
    el.lblNations.textContent = n > 0 ? String(n) : 'automatic';
  }

  onWorld(world) {
    this.el.seedValue.textContent = world.seed;
    this.el.inSeed.value = world.seed;
    const landPct = Math.round((world.landCount / world.tiles.length) * 100);
    this.el.genStats.textContent =
      `${world.tiles.length} hexes · ${landPct}% land · ${world.nations.length} nations · ${world.genTime.toFixed(0)} ms`;
    this.clearSheet();
    this.showSelection([]);
    this.onTurn();
    this.refreshSaveInfo();
    this.showModeLegend();
  }

  /**
   * Kucuk "neden" balonu. Yeni bir gosterge tahtasi degil: ayni metni
   * tiklamayla da erisilir kilar (dokunmatik ve hizli oyunda hover yoktur).
   */
  toggleWhy(anchor, text) {
    if (this.whyPop?.isConnected && this.whyPop.dataset.anchor === anchor.dataset.why) {
      this.closeWhy();
      return;
    }
    this.closeWhy();
    if (!text) return;
    const pop = document.createElement('div');
    pop.className = 'why-pop';
    pop.dataset.anchor = anchor.dataset.why;
    pop.textContent = text;
    document.body.append(pop);
    this.whyPop = pop;
    this.placeWhy(anchor);
    // Disaridaki bir tik kapatir; balon kendi tiklamasiyla kapanmaz. Hucrenin
    // KENDI tiki de disari sayilmaz, onu click -> toggleWhy kapatir: eskiden
    // pointerdown balonu siliyor, hemen ardindaki click yeniden aciyordu ve
    // hucreye ikinci tik balonu hic kapatamiyordu.
    this.whyClose = (event) => {
      if (pop.contains(event.target)) return;
      if (event.target.closest?.('[data-why]')?.dataset.why === pop.dataset.anchor) return;
      this.closeWhy();
    };
    document.addEventListener('pointerdown', this.whyClose);
  }

  closeWhy() {
    this.whyPop?.remove();
    this.whyPop = null;
    if (this.whyClose) document.removeEventListener('pointerdown', this.whyClose);
    this.whyClose = null;
  }

  /** Balonu kaynagin altina oturtur; hucre her tazelemede yeniden cizilir. */
  placeWhy(anchor) {
    const rect = anchor.getBoundingClientRect();
    this.whyPop.style.top = `${Math.round(rect.bottom + 6)}px`;
    this.whyPop.style.left = `${Math.round(rect.left)}px`;
  }

  /**
   * Sabitlenen istikrar dokumu ust cubukla birlikte tazelenir: acildigi anin
   * kopyasi olarak kaliyordu ve sekiz hafta sonra "= Stability 22.4%" derken
   * yanindaki hucre 33% gosteriyordu.
   */
  refreshWhy(me) {
    if (this.whyPop?.dataset.anchor !== 'stability') return;
    const anchor = this.el.resources.querySelector('[data-why="stability"]');
    if (!me || !anchor) {
      this.closeWhy();
      return;
    }
    const text = stabilityWhy(me);
    if (this.whyPop.textContent !== text) this.whyPop.textContent = text;
    this.placeWhy(anchor);
  }

  refreshSaveInfo() {
    const info = savedInfo();
    // Otomatik kayit VAR ama kendini hic tanitmiyordu: ilk kayittan sonra
    // "autosave" kelimesi bir daha ekranda gecmiyor, oyuncu 80 yil boyunca
    // kaydi olmadigini saniyordu (kor beta B-029). Tarih ve "autosave"
    // kelimesi artik satirda kaliyor.
    this.el.saveInfo.textContent = info
      ? `Last save · ${info.name ?? (info.auto ? 'autosave' : info.seed)} · ${gameDate(info.turn)}`
      : 'No save yet. The game autosaves every ten weeks.';
  }

  /** Gün tiki: yalnız tarih yazısı ve (değiştiyse) hız düğmeleri. */
  onDay() {
    const { turns, world, clock } = this.game;
    if (!world) return;
    const label = gameDate(turns.turn, clock.day);
    if (label !== this.lastDateLabel) {
      this.lastDateLabel = label;
      this.el.turnValue.textContent = label;
    }
    if (clock.speed !== this.lastSpeedShown) {
      this.lastSpeedShown = clock.speed;
      this.speedSince = performance.now();
      this.weekStamps = [];
      this.syncSpeed(clock.speed);
    }
    this.showClockStatus();
  }

  /**
   * Tarihin altındaki TEK durum satırı — künyedeki özet satırının aynası.
   *
   * DURAKLATMA GORUNUR OLSUN. Kart saati durdurunca (bkz. notifications.push
   * halt) tek iz duraklat dugmesinin dolu hali idi; kor oyun testinde oyuncu
   * 40 saniye bekleyip "oyun yavas" sonucuna vardi. Satir sebebi de yazar.
   *
   * Yuksek hizda saat kendini tur maliyetine gore kisar (game.js pumpTurnFrame:
   * hafta 5 ms'lik dilimlerle islenir) ve bunu kimseye soylemiyordu: 8x'te
   * 8 saniyede 2 hafta gecince oyuncu 2x sandi (Open Beta 4). Son on saniyede
   * kapanan hafta sayisindan efektif carpan turetilir; nominalin %80'inin
   * altina dusunce ayni satira eklenir.
   */
  /** Seçili hız düğmesi `active`; ona kadar olan çentikler `lit` (sinyal çubuğu). */
  syncSpeed(speed) {
    for (const btn of document.querySelectorAll('.time-btn[data-speed]')) {
      const value = Number(btn.dataset.speed);
      btn.classList.toggle('active', value === speed);
      btn.classList.toggle('lit', value > 0 && value <= speed);
    }
  }

  /**
   * Üst çubukta değeri eşiği aşan hücre bir kez parlar (iyi yön yeşil, kötü
   * kırmızı) ve halkası eski dolumdan yenisine kayar. Hücreler her tazelemede
   * innerHTML ile yeniden doğar; bu yüzden önceki değer DOM'da değil burada
   * tutulur. Sürekli döngü yok: yalnız CSS geçişi ve tek seferlik animasyon.
   */
  animateTopChanges(root) {
    const prev = (this.topPrev ??= new Map());
    // Fark yalnız SAKİN hızda (≤2x) uçar. 4x/8x'te hafta ~1 sn: her hafta
    // yeşil/kırmızı bir fark etiketin yerine geçiyor, ana hücrenin etiketi
    // hiç görünmüyor, War Support'unki zamanın %70'inde gizli kalıyordu
    // (ölçüldü). Hızlı akışta değerin kendisi yeter; halka geçişi kalır.
    const calm = (this.game.clock?.speed ?? 0) <= 2;
    for (const cell of root.querySelectorAll('[data-k]')) {
      const key = cell.dataset.k;
      const value = Number(cell.dataset.v);
      const ring = cell.querySelector('.tb-ring .val');
      const dash = ring?.getAttribute('stroke-dasharray');
      const old = prev.get(key);
      prev.set(key, { value, dash });
      // Yeniden doğan hücrenin etiketi, havadaki fark sönene dek gizli kalır;
      // yoksa 8x hızda yeni hafta etiketi farkın altına geri getiriyordu.
      if (this.topDeltas?.has(key)) cell.classList.add('tb-hold');
      if (!old) continue;
      if (ring && old.dash && old.dash !== dash) {
        ring.style.transition = 'none';
        ring.style.strokeDasharray = old.dash;
        ring.getBoundingClientRect();
        ring.style.transition = '';
        ring.style.strokeDasharray = dash;
      }
      const delta = value - old.value;
      if (!calm || Math.abs(delta) < Number(cell.dataset.eps || 0) || delta === 0) continue;
      const good = delta * Number(cell.dataset.pol || 1) > 0;
      cell.classList.add(good ? 'tb-good' : 'tb-bad');
      this.floatDelta(cell, key, delta, good);
    }
  }

  /**
   * Yüzen fark: "+900" hücrenin üstünden yükselip söner. Hücrenin içine
   * değil üst çubuğa takılır — hücreler her tazelemede yeniden doğduğundan
   * 8x hızda etiket yarıda silinirdi. Hareket kapalıysa hiç doğmaz.
   */
  floatDelta(cell, key, delta, good) {
    const bar = cell.closest('.topbar');
    if (!bar || document.documentElement.dataset.motion !== 'on') return;
    const label = deltaLabel(key, delta);
    if (!label) return;
    const host = bar.getBoundingClientRect();
    // Hücre başına tek etiket: hızlı haftalarda üst üste binmesin.
    const live = (this.topDeltas ??= new Map());
    live.get(key)?.remove();
    const tag = document.createElement('i');
    tag.textContent = label;
    // Etiketin yerine oturur (CSS etiketi o sürede söndürür); etiketi
    // olmayan kaynak madalyonunda madalyonun üstünde ortalanır.
    const slot = cell.querySelector('.tb-gv small, :scope > small');
    const anchor = (slot ?? cell).getBoundingClientRect();
    tag.className = `tb-delta ${good ? 'good' : 'bad'} ${slot ? 'at-label' : 'at-top'}`;
    tag.style.left = `${Math.round(anchor.left - host.left + (slot ? 0 : anchor.width / 2))}px`;
    tag.style.top = `${Math.round(anchor.top - host.top + (slot ? anchor.height / 2 : 0))}px`;
    tag.addEventListener('animationend', () => {
      tag.remove();
      if (live.get(key) !== tag) return;
      live.delete(key);
      bar.querySelector(`[data-k="${key}"]`)?.classList.remove('tb-hold');
    }, { once: true });
    live.set(key, tag);
    bar.append(tag);
  }

  showClockStatus() {
    const { clock } = this.game;
    const control = document.getElementById('turn-control');
    const status = this.el.turnStatus;
    if (!control || !status) return;
    const paused = !clock.speed && Boolean(this.game.world);
    control.classList.toggle('is-paused', paused);
    let text;
    let title;
    if (paused) {
      const reason = clock.haltedBy;
      text = reason ? `Paused · ${reason}` : 'Paused';
      title = reason
        ? 'An event stopped the clock. Press play or Space to continue.'
        : 'Press play or Space to continue.';
    } else {
      const now = performance.now();
      // On saniyelik pencere: 8x'te bile hafta 0.9 s surer, bes saniyede
      // yalniz bir-iki hafta kapanir ve olcum gurultuye bogulur.
      const stamps = (this.weekStamps ??= []).filter((t) => now - t <= 10000);
      this.weekStamps = stamps;
      const nominal = clock.speed / 7;           // hafta/sn: gun = 1000 ms / hiz
      const effective = stamps.length / 10;
      const running = clock.speed >= 2 && now - (this.speedSince ?? 0) > 10000;
      const throttled = running && effective < nominal * 0.8;
      text = `${SPEED_NAMES[clock.speed] ?? `Speed ×${clock.speed}`}`
        + (throttled ? ` · effective ×${(effective * 7).toFixed(1)}` : '');
      title = throttled
        ? 'Effective speed: the simulation could not keep up with the clock.'
        : 'Space pauses; + and − change the speed.';
    }
    if (status.textContent !== text) status.textContent = text;
    if (status.title !== title) status.title = title;
  }

  onTurn() {
    const { turns, world } = this.game;
    if (!world) return;
    // Üst bar tazelemesi hem kare içinde (tur dilimi) hem kare dışında
    // (saat tiki) tetiklenir; maliyeti iki durumda da ölçülür.
    const t0 = performance.now();
    this.lastTurnAt = t0;
    this.lastDateLabel = gameDate(turns.turn, this.game.clock.day);
    this.lastSpeedShown = this.game.clock.speed;
    this.el.turnValue.textContent = gameDate(turns.turn, this.game.clock.day);
    const me = world.nations[turns.playerNation];
    const alive = world.nations.filter((n) => n.alive).length;
    const cities = world.cities.filter((c) => c.nationId === turns.playerNation).length;
    // Elenen oyuncuda gösterge yok: çıplak bir "—" metni ortadaki ızgaranın
    // içinde hücresiz kalıyordu (şeritler `display: contents`).
    this.el.resources.innerHTML = me ? resourcesHtml(me) : '';
    this.animateTopChanges(this.el.resources);
    this.refreshWhy(me);
    // Bekleyen birim sayısı düğmede: turu bitirmeden önce ne kaldığı görünsün.
    this.syncSpeed(this.game.clock.speed);
    this.showClockStatus();
    this.syncTabAuto();

    const wars = world.nations.filter(
      (n) => n.alive && atWar(world, n.id, turns.playerNation),
    ).length;

    // Sol üst künye: bayrak + ülke adı + tek satır özet (HOI4'ün ülke kutusu).
    if (me) {
      // INSAN sayisi, guc puani degil (bkz. units.menUnderArms). Yanindaki
      // Manpower satiri da insan; ikisi ayni birimde olmazsa oyuncu ordusunu
      // oldugundan bir buyukluk kucuk okuyor.
      const army = world.units
        .filter((unit) => unit.nationId === me.id && unit.type.domain === 'land')
        .reduce((sum, unit) => sum + menUnderArms(unit), 0);
      const ic = me.economy?.ic ?? { total: 0, military: 0 };
      // Ordunun bu hafta fiilen çektiği / yasanın izin verdiği tavan: tavanın
      // altında kalan pay halka ve kalkınmaya döner (economy.splitOutput).
      const drawn = me.economy?.alloc?.army ?? ic.drawn ?? 0;
      const armyCap = me.economy?.alloc?.armyCap ?? ic.military ?? 0;
      const people = me.economy?.population ?? 0;
      const recruits = nationManpower(world, me.id);
      this.el.macroStats.innerHTML = `<span class="tb-minis">${miniCell(emblemArt('people', 'xs'), 'People',
        formatPopulation(people), `data-macro="population" ${track('pop', people, people * 0.01)}`, 'macro-live')
        + miniCell(emblemArt('soldiers', 'xs'), 'Army', formatPopulation(army), `data-tip="army" ${track('army', army, army * 0.03 + 1)}`)
        + miniCell(emblemArt('recruits', 'xs'), 'Recruits', formatPopulation(recruits), `data-tip="manpower" ${track('mp', recruits, recruits * 0.05 + 1)}`)
        + miniCell(emblemArt('factory', 'xs'), 'Industry', `${ic.total.toFixed(1)}<em class="stat-flow">${drawn.toFixed(1)}/${armyCap.toFixed(1)}${glyph('swords', 'inline')}</em>`,
          `data-macro="ic" ${track('ic', ic.total, 0.2)}`, 'macro-live')}</span>`
        + resourceChips(me);
      this.animateTopChanges(this.el.macroStats);
      this.ensureMacroCards();
      this.mountTopFlag();
      this.el.topNation.textContent = me.name;
      // Savaş durumu künyedeki tek renkli öğe; gerisi soluk kalır. Ayraç
      // elmas: orta nokta tarihî künyede fazla "web" duruyordu.
      const state = wars
        ? `<span class="at-war">At war</span>`
        : 'At peace';
      const sep = '<i class="sep">◆</i>';
      // Gerçek province sayısı üretimden gelir; savaşta kare kare işgal
      // sürerken sayaç Faz E'ye dek üretim anındaki değeri gösterir.
      const provinceCount = me.provinces || null;
      this.el.topSub.innerHTML =
        `${provinceCount ? `${provinceCount} ${provinceCount === 1 ? 'state' : 'states'}`
          : `${me.tiles} ${me.tiles === 1 ? 'hex' : 'hexes'}`} ${sep} `
        + `${cities} ${cities === 1 ? 'city' : 'cities'} ${sep} ${state}`;
    } else {
      this.el.macroStats.innerHTML = '';
      this.el.topNation.textContent = '—';
      this.el.topSub.textContent = 'eliminated';
    }
    // Kutu seçimi ve kontrol grubu kare SEÇMEZ (game.finishMarquee): ordu
    // seçiliyken panel ordunundur; üst çubuk tazelemesi onu silmemeli —
    // kutuyla seçilen tümenlerin paneli 0.3-0.6 sn sonra kayboluyordu.
    if (!this.game.selected && !this.game.selectedUnit) this.clearSheet();
    refreshTooltips();
    this.game.perf?.add('ui.hud', performance.now() - t0);
  }

  /**
   * Veri kipi haftalık tazelenir: renk simülasyondan gelir (huzursuzluk,
   * kalkınma, şöhret, savaş) ve kip açıkken hafta kapanınca eskir; kalkınma
   * kademeleri hafta kapanışında alındığı için 'turn' tazelemesi yeter
   * (refreshModeColors önbelleği düşürür). Nüfus kipi de
   * aynı yoldan tazelenir — eskiden ilk açıldığı haftanın nüfusunda kalıyordu.
   */
  refreshDataMode() {
    const renderer = this.game.renderer;
    const mode = renderer?.mapMode;
    if (!DATA_MODES.has(mode) && mode !== 'population') return;
    renderer.refreshModeColors();
    if (DATA_MODES.has(mode)) this.showModeLegend();
    this.game.requestRender();
  }

  /**
   * Veri kipinin lejantı. Renkler renderer.js tablolarından okunur (harita
   * ile lejant aynı dizeden boyanır); sayılar canlı dünyadan sayılır.
   */
  showModeLegend() {
    const { game, el } = this;
    const legend = el.modeLegend;
    const world = game.world;
    const mode = game.renderer?.mapMode;
    if (!legend) return;
    if (!world || !DATA_MODES.has(mode)) {
      togglePanel(legend, false);
      return;
    }
    const chip = (color, label, count = null) => `<span style="--rgo-color:${color}">${escapeHtml(label)}${
      count != null ? `<em>${count}</em>` : ''}</span>`;
    const me = world.nations[game.turns.playerNation];
    let html = '';
    if (mode === 'diplomacy') {
      const focus = game.renderer.diplomacyFocusId(world);
      const nation = world.nations[focus];
      const standing = diplomacyStanding(world, focus);
      const counts = {};
      for (const other of world.nations) {
        if (other?.alive && other.id !== focus) counts[standing[other.id]] = (counts[standing[other.id]] ?? 0) + 1;
      }
      const LABELS = {
        focus: nation?.name ?? '—', war: 'At war', crisis: 'Ultimatum', ally: 'Allies', truce: 'Truce',
        rival: 'Rivals', elsewhere: 'Fighting others', neutral: 'At peace',
      };
      const own = focus === game.turns.playerNation;
      html = `<header><b>Relations of ${escapeHtml(nation?.name ?? '—')}</b>${!own && me?.alive
        ? `<button type="button" data-focus-reset>Back to ${escapeHtml(me.name)}</button>`
        : '<small>click a nation to see its relations</small>'}</header>`
        + Object.entries(DIPLOMACY_COLORS)
          .filter(([key]) => key === 'focus' || counts[key])
          .map(([key, color]) => chip(color, LABELS[key], key === 'focus' ? null : counts[key]))
          .join('');
    } else if (mode === 'unrest') {
      const boiling = (world.provinces ?? []).filter(
        (province) => province.owner === me?.id && (province.econ?.unrest ?? 0) >= CULTURE.REVOLT_UNREST,
      ).length;
      html = `<header><b>Provincial unrest</b><small>${boiling
        ? `${boiling} of your states boiling` : 'national movements grow above 6'}</small></header>`
        + [[0, 'Calm'], [0.35, 'Restless'], [0.7, 'Boiling'], [1, 'Revolt']]
          .map(([t, label]) => chip(rampColor(UNREST_RAMP, t), label)).join('');
    } else if (mode === 'industry') {
      // Sanayi kipi kalkınma kademesini boyar (fabrika binası yok; sanayi
      // 1'in üstündeki her kademeden gelir). Çipin sayısı oyuncunun o banttaki
      // state sayısıdır; renk bandın orta kademesinin harita rengi.
      const bands = [[1, 1], [2, 3], [4, 5], [6, 7], [8, DEVELOPMENT_MAX]];
      const counts = bands.map(() => 0);
      for (const province of world.provinces ?? []) {
        if (province.owner !== me?.id || !province.econ) continue;
        const level = province.econ.development ?? 1;
        const at = bands.findIndex(([lo, hi]) => level >= lo && level <= hi);
        if (at >= 0) counts[at]++;
      }
      html = `<header><b>Development</b><small>by state, every nation · numbers are yours${me ? ` · your cap ${developmentCap(me)}` : ''}</small></header>`
        + bands.map(([lo, hi], index) => chip(
          developmentShade(Math.ceil((lo + hi) / 2)), lo === hi ? `Level ${lo}` : `${lo}–${hi}`, me ? counts[index] : null,
        )).join('');
    } else if (mode === 'infamy') {
      html = `<header><b>Infamy</b><small>coalitions form at ${INFAMY_COALITION}</small></header>`
        + [[0, 'Clean'], [0.3, `${Math.round(INFAMY_COALITION * 0.3)}`], [0.65, `${Math.round(INFAMY_COALITION * 0.65)}`],
          [1, `${INFAMY_COALITION}+`]]
          .map(([t, label]) => chip(rampColor(INFAMY_RAMP, t), label)).join('');
    }
    if (legend.innerHTML !== html) legend.innerHTML = html;
    togglePanel(legend, true);
  }

  /**
   * Künyedeki bayrak canlı bez: kaynak bir kez pişer, şeritler kayar. Ölçü
   * kabın CSS kutusundan okunur — dar pencerede künye küçülür ve sabit 60×40
   * bir tuval kabından taşardı. Aynı ölçü ve ulusta mountFlag hiçbir şey yapmaz.
   */
  mountTopFlag() {
    const me = this.game.world?.nations[this.game.turns.playerNation];
    const host = this.el.topFlag;
    if (!me || !host) return;
    const box = host.getBoundingClientRect();
    mountFlag(host, me, Math.round(box.width) || 60, Math.round(box.height) || 40);
  }

  /**
   * Sekme künyesinin AUTO ışığı. Portföyü hükûmete devredilmiş ekranın
   * künyesi yanar (styles.css §5 .is-auto); eşleme delegation.areasOfScreen
   * alanından okunur, elle yazılmış ikinci bir tablo tutulmaz.
   */
  syncTabAuto() {
    const me = this.game.world?.nations[this.game.turns.playerNation];
    for (const btn of document.querySelectorAll('#tab-bar button[data-screen]')) {
      // Ekranın HERHANGİ bir alanı devredilmişse lamba yanar (Politics:
      // Government ya da Agenda); hangisinin açık olduğu sekme kartındadır.
      const on = me?.alive && areasOfScreen(btn.dataset.screen).some((area) => isDelegated(me, area));
      btn.classList.toggle('is-auto', Boolean(on));
    }
  }

  /**
   * Hicbir sey secili degilken sol alt panel BOS kalir ve CSS onu gizler
   * (.sheet:has(.sheet-body:empty)). Eskiden burada hegemonya seridi ve
   * "NEXT MEANINGFUL DECISION" rehberi dururdu; oyuncu ikisini de gereksiz
   * buldu (Kerem, ulke secim ekrani goruntusu): harita tertemiz kalir.
   */
  clearSheet() {
    const body = this.el.sheetBody;
    this.sheetSubject = null;
    if (!body.innerHTML) return;
    // Panel kapanırken de hareket eder: içerik ancak çıkış bitince silinir
    // (boş gövde CSS'te paneli anında gizler, hareket başlamadan biterdi).
    if (!motionOn()) {
      body.innerHTML = '';
      return;
    }
    if (this.sheetLeave) return;
    const sheet = body.parentElement;
    sheet.classList.add('is-leaving');
    this.sheetLeave = setTimeout(() => {
      this.sheetLeave = 0;
      sheet.classList.remove('is-leaving');
      if (this.sheetSubject == null) body.innerHTML = '';
    }, LEAVE_MS);
  }

  /** Kapanmakta olan panele yeni içerik geldi: çıkış iptal. */
  cancelSheetLeave() {
    if (!this.sheetLeave) return;
    clearTimeout(this.sheetLeave);
    this.sheetLeave = 0;
    this.el.sheetBody.parentElement.classList.remove('is-leaving');
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
    // Ordu seciliyken panel ORDUNUN bulundugu kareyi anlatir: ordu yurudukce
    // baslangic karesinde kalan panel, oyuncuya eyalet seciliymis gibi
    // gorunuyordu (Kerem: asker seciliyken state secme bugu).
    const lead = this.game.selectedUnit;
    const armyOnly = Boolean(lead?.tile && lead.hp > 0);
    if (armyOnly) tile = lead.tile;
    const body = this.el.sheetBody;
    if (!tile) {
      this.clearSheet();
      return;
    }
    this.cancelSheetLeave();
    // Panelin KONUSU degisince icerik suzulur (styles.css §31); ayni karenin
    // haftalik tazelenmesi oynatmaz.
    const subject = armyOnly ? `u${lead.id}` : `t${tile.q},${tile.r}`;
    const sameSubject = subject === this.sheetSubject;
    if (subject !== this.sheetSubject) {
      this.sheetSubject = subject;
      body.classList.remove('is-swapping');
      void body.offsetWidth;
      body.classList.add('is-swapping');
    }
    // ORDU SECILIYKEN YALNIZ ORDU. Eyalet kunyesi, RGO ve nufus satirlari
    // orduyla ilgili degil ve paneli ikiye boluyordu (Kerem: askerleri
    // sectigimde province ya da hex statlarini gormek istemiyorum).
    if (armyOnly) {
      // Ordu paneli 'units'/'battles'/'provinces' olaylarıyla saniyede 2-3
      // kez baştan yazılıyordu: 8x'te Hold'a 10 gerçek tıkın 3'ü kayboldu,
      // tümen listesi her seferinde başa döndü, komutan seçicisi 0.1 sn'de
      // ordu paneline geri döndü (ölçüldü). Üç kural:
      //   - seçici açıkken ve seçim aynıyken dokunma (seçimi oyuncu kapatır);
      //   - içerik aynıysa yazma; fare panelde basılıyken yazma (bırakınca);
      //   - aynı orduda liste kaydırması korunur.
      const selKey = this.game.selection.map((unit) => unit.id).join(',');
      if (this.sheetPicker === selKey && body.querySelector('.army-panel.is-picker')) return;
      this.sheetPicker = null;
      const html = armyPanelHtml(this.game, this.game.selection);
      if (sameSubject && html === this.lastArmyHtml && body.querySelector('.army-panel:not(.is-picker)')) return;
      if (this.sheetPressed) {
        this.armyRewritePending = true;
        return;
      }
      const keep = sameSubject ? (body.querySelector('.ap-list')?.scrollTop ?? 0) : 0;
      body.innerHTML = html;
      this.lastArmyHtml = html;
      const list = keep ? body.querySelector('.ap-list') : null;
      if (list) {
        quietScroll(list);
        list.scrollTop = keep;
      }
      this.bindActions();
      return;
    }
    const world = this.game.world;
    // Buz eteği bağlı olduğu kümenin sahibindedir (provinces-gen
    // attachImpassableFringe) ve harita onu o ülkenin rengiyle boyar; panelin
    // "Unclaimed Territory" demesi sahipsiz toprak varmış gibi okunuyordu.
    const fringeOwner = tile.owner < 0 && tile.fringeOf >= 0
      ? (world.provinces?.[tile.fringeOf]?.owner ?? -1) : -1;
    const ownerId = tile.owner >= 0 ? tile.owner : fringeOwner;
    const nation = ownerId >= 0 ? world.nations[ownerId] : null;
    const controller = controllerOf(tile) >= 0 ? world.nations[controllerOf(tile)] : null;
    const color = nation ? nation.color : tile.terrain.color;
    // DENİZ SAHİPSİZ DEĞİL, DENİZDİR. Panel her su karesinde "Unclaimed
    // Territory · Defense 0%" yazıyordu (Kerem'in ekran görüntüsü): kimsenin
    // almadığı bir toprak varmış gibi okunuyordu. Suyun künyesi kendi adıdır.
    const water = tile.terrain.water;
    // Deniz bölgesinin adı (navy.js, Seas kipi): donanma bölge bölge yönetilir.
    const seaZone = water && tile.seaZone >= 0 ? world.seaZones?.zones?.[tile.seaZone] : null;
    // BAŞLIK STATE'İN ADIDIR, ülke alt satırda: kart bir state'i anlatıyor
    // ama başlıkta ülkenin uzun adı, state adı en altta duruyordu.
    const area = water ? null : world.provinces?.[tile.provinceId];
    const title = seaZone ? seaZone.name : water ? tile.terrain.name
      : (area?.name ?? (nation ? nation.fullName : 'Unclaimed Territory'));
    const sub = water
      ? `${seaZone ? `${tile.terrain.name} · ` : ''}${tile.terrain.navigable ? 'Navigable water' : 'Impassable water'} · ${tile.q}, ${tile.r}`
      : `${area && nation ? `${nation.fullName} · ` : ''}${tile.terrain.name}${tile.coastal ? ' · coast' : ''}`;

    const stats = water ? [] : [
      ['Defense', `${Math.round(tileDefense(tile) * 100)}%`],
      ['Terrain', tile.terrain.name],
    ];
    if (tile.culture >= 0) {
      // Kümenin tam bileşimi: haritadaki çizgili tarama burada sayıya döner.
      // Tek ad yazmak yanıltıcıydı — %51 çoğunluk da %100 gibi okunuyordu.
      const mix = world.provinces?.[tile.provinceId]?.cultures ?? [];
      const label = mix.length > 1
        ? mix.filter((row) => row.share >= 0.05)
          .map((row) => `${world.cultures[row.id]?.name ?? '?'} ${Math.round(row.share * 100)}%`)
          .join(' · ')
        : world.cultures[tile.culture].name;
      stats.push(['Culture', label]);
      // Dil satırı kalktı (Kerem: "language önemsiz"); dil ailesi kültür
      // kartının ipucunda kalabilir, panelde yer kaplamaz.
    }
    // DURUM yalnız GERÇEK durumu söyler. "foreign culture −30%" ve "postwar
    // integration (N weeks)" satırları eski hex modelinden kalmaydı: simülasyon
    // o cezaları hiçbir yerde uygulamıyordu (infamy.tileEfficiency yalnız bu
    // panelde okunuyordu). Yabancı halkın gerçek bedeli huzursuzluk ve kuradır
    // (aşağıdaki satır ve ipucu); fethin bedeli uyumdur (Compliance çubuğu).
    if (nation && tile.culture >= 0) {
      const acceptedCulture = tile.culture === nation.culture
        || nation.accepted?.includes(tile.culture);
      if (isOccupied(tile)) stats.push(['Status', `occupied by ${controller?.name ?? '?'}`]);
      else if (acceptedCulture && tile.culture !== nation.culture) {
        stats.push(['Status', 'accepted culture']);
      }
      // HUZURSUZLUK. "foreign culture −30%" bir ceza etiketiydi; halkın ne
      // yaptığını söylemiyordu. Artık satır bir cümle: kaç, neden, ne zaman
      // patlar (bkz. culture.js unrestBreakdown).
      const cluster = world.provinces?.[tile.provinceId];
      const unrest = cluster?.econ?.unrest ?? 0;
      // Satır HER ZAMAN durur (sakin state'te 0.0): eşikte belirip kaybolan
      // satır kartı 24 px oynatıyordu (jitter-probe, 8x savaş).
      if (cluster?.econ) {
        // Isyan artik halkin HAREKETIDIR (movements.js): kumenin sayaci yok.
        const rebels = foreignShareOf(cluster, nation) >= CULTURE.REVOLT_FOREIGN_MIN
          ? rebelCultureOf(cluster, nation) : null;
        const movement = rebels != null ? nation.movements?.[rebels] : null;
        const parts = unrestBreakdown(world, cluster, nation, {
          occupied: 0, turn: world.turn ?? 0,
        });
        const why = [
          parts.culture > 0.5 ? `${Math.round(parts.foreign * 100)}% not accepted` : null,
          parts.grievance > 0.5 ? 'years of foreign rule' : null,
          parts.conquest > 0.5 ? 'recent conquest' : null,
          parts.war > 0.5 ? 'war weariness' : null,
          parts.backlash > 0.3 ? 'nationalist backlash' : null,
          parts.levy > 0.3 ? 'unequal levy' : null,
        ].filter(Boolean).join(', ');
        stats.push(['Unrest', `${unrest.toFixed(1)}/10${why ? ` · ${why}` : ''}`
          + (movement?.progress > 0.5
            ? ` · ${world.cultures?.[rebels]?.name ?? 'their'} movement ${Math.round(movement.progress)}%`
              + ` (${stageOf(movement.progress).name})`
            : '')]);
      }
    }
    // "Nation · 27 states" satırı kalktı (Kerem: o ekranda gereksiz); ülke
    // künyesi başlıkta, ölçüsü üst çubukta.
    // STATE KARTI (HOI4 modeli: küme = state, hex = province). Ekonomi not
    // satırlarına dökülünce hiyerarşisiz bir metin yığını oluyordu; kart
    // kaynağı, çıktıyı, kalkınmayı, kaleyi ve uyumu simgeyle tek bakışta verir.
    // Bina yuvası ve hızlı inşa şeridi kalktı (Tek Çubuk, 2026-10-15): state'in
    // tek ekonomik ölçüsü kalkınma kademesidir, kalkınmayı fon alır.
    let stateHtml = '';
    if (tile.province) {
      const econ = tile.province;
      const area = world.provinces?.[tile.provinceId];
      const deposits = area ? depositsOf(area) : [];
      const y = area ? stateYield(world, area) : null;
      const own = Boolean(area) && area.owner === this.game.turns.playerNation;
      stats.unshift(['Population', formatPopulation(econ.population)]);
      // Seferberliğin bedeli state'te okunsun: silah altındaki çalışmaz
      // (econ/resources.js workforceShare) — çıktı, gıda ve maden o oranda düşer.
      const away = 1 - workforceShare(econ);
      // Her zaman: asker gelip gittikçe belirip kaybolmasın (yalnız değer değişir).
      stats.splice(1, 0, ['Under arms', away >= 0.0005
        ? `${formatPopulation(econ.soldiers)} · output −${(away * 100).toFixed(1)}%` : 'none']);
      stateHtml = `<div class="pv-state"${area ? tipAttr('state', area.id) : ''}>
        <div class="pv-state-res">${deposits.map((line) => `<span${tipAttr('deposit', `${area.id}:${line.id}`)}>${resourceArt(line.id, 'sm')}<b>${escapeHtml(RESOURCES[line.id].name)}</b><small>×${line.size.toFixed(1)}</small></span>`).join('')}
          ${area ? `<span class="pv-fert"${tipAttr('fertility', area.id)}><small>Fertility</small><b>${Math.round(fertilityOf(area) * 100)}%</b></span>` : ''}</div>
        ${area ? this.incomeRowHtml(area, y) : ''}
        ${this.developmentRowHtml(econ, y)}
        ${own && y ? this.nextLevelRowHtml(area, y) : ''}
        ${this.fortRowHtml(econ)}
        <div class="pv-state-row"><small>Compliance</small>${kitMeter((econ.control ?? 0) / 100, { tone: econ.core === false ? 'warn' : 'pos', wide: true })}<b>${Math.round(econ.control)}%</b>${econ.core === false ? `<em class="neg">counts at ${Math.round((econ.status ?? 0) * 100)}%</em>` : '<em>core</em>'}</div>
        ${own ? this.focusRowHtml(area) : ''}
      </div>`;
    }
    // Küme kimliği en üstte: hangi province'in parçası olduğu ilk bakışta okunsun.
    const cluster = world.provinces?.[tile.provinceId];
    if (cluster) {
      const occupiedMembers = cluster.tileIdx.filter(
        (idx) => controllerOf(world.tiles[idx]) !== cluster.owner,
      ).length;
      if (cluster.owner >= 0 && occupiedMembers > 0) {
        stats.unshift(['Occupation', `${occupiedMembers}/${cluster.tileIdx.length} hexes lost`]);
      }
      // Çekirdek dışı toprak: çıktı, asker ve mal uyum oranında gelir.
      if (cluster.owner >= 0 && cluster.econ?.core === false) {
        stats.unshift(['Territory', 'non-core: yields by compliance']);
      }
      // State adı artık başlıkta; burada yalnız kaç province'ten oluştuğu.
      const hexes = cluster.tileIdx.length;
      stats.unshift(['State', `${hexes} ${hexes === 1 ? 'province' : 'provinces'}`]);
    }

    // Province kartı birim GÖSTERMEZ: karedeki tümen her hafta gelip gidiyor,
    // kart 147 px uzayıp kısalıyordu (jitter-probe, 8x savaş). Birimi imleç
    // künyesi (ui/unitHover.js) ve seçim kartı gösterir.
    const unitBlock = '';

    // Ülke varsa bayrağı, yoksa arazi rengi göster.
    const emblem = nation
      ? `<img class="flag" src="${flagDataUrl(nation)}" alt="">`
      : `<span class="swatch" style="background:${color}"></span>`;

    // KUTU KAYDIRILMAZ. Eski dizilim on iki eşit kutucuktu; uzun değerler üç
    // satıra sarıyor, kutu `--sheet-max`ı aşıyor ve yanında bir kaydırma
    // çubuğu beliriyordu. Bilgi artık ÖNEME göre üç kademeye ayrılır:
    //   1. üç ana ölçü      — nüfus, denetim, savunma
    //   2. RGO bloğu        — tek satır: ne, ne kadar, kaç kişiyle
    //   3. künye satırı     — kültür/dil/boyut gibi bağlam, tam satır metin
    // Aynı bilgi, üçte bir yükseklik.
    const take = (key) => {
      const at = stats.findIndex(([k]) => k === key);
      return at < 0 ? null : stats.splice(at, 1)[0][1];
    };
    const province = take('State');
    const population = take('Population');
    const control = take('Control');
    const defense = take('Defense');
    const rgoName = take('RGO');
    const rgoOut = take('RGO Output');
    const rgoWork = take('RGO Workforce');
    const unemployed = take('Unemployed');
    // Arazi zaten baslik alt satirinda yaziyor (bkz. `sub`); ikinci kez
    // basmak "Hills - 97,63 - Hills" gibi bir tekrar uretiyordu.
    take('Terrain');
    const culture = take('Culture');
    const migration = take('Migration');

    // `tip` verilirse olcu gecikmeli bilgi karti tasir (bkz. ui/tooltip.js).
    const metric = (label, value, tip = '') => (value == null ? ''
      : `<span class="pv-metric"${tip ? ` data-tip="${tip}" tabindex="0"` : ''}
          ><small>${label}</small><b>${value}</b></span>`);
    const line = (label, value) => (value == null ? ''
      : `<span class="pv-line"><small>${label}</small><b>${escapeHtml(String(value))}</b></span>`);

    // Artakalan durum bilgileri (Status, Territory, Occupation, Worked By):
    // seyrek ama önemli — kendi uyarı satırlarında durur.
    // Değerler düz metin; şehir adı kayıttan aynen döner (içe aktarılan kayıt).
    // Değer TEK SATIR (tamamı başlıkta): uzayan sebep listesi satırı ikiye
    // kırıp kartı oynatmasın.
    // Huzursuzluk satırı dökümünü bilgi kartında taşır (neyden geliyor).
    const noteTip = (k, v) => (k === 'Unrest' && cluster
      ? tipAttr('unrest', cluster.id)
      : ` data-tip="text" data-tip-text="${escapeHtml(`${k}: ${v}`)}"`);
    const notes = stats.map(([k, v]) => `<span class="pv-note"${noteTip(k, v)}><small>${k}</small><span class="pv-val">${escapeHtml(String(v))}</span></span>`).join('');

    body.innerHTML = unitBlock + this.actionsHtml(tile) + `
      <div class="province-view">
        <div class="tile-head">
          ${emblem}
          <div>
            <div class="tile-title">${escapeHtml(title)}</div>
            <div class="tile-sub">${escapeHtml(sub)}</div>
          </div>
          <button class="ap-x pv-x" type="button" data-tile-close aria-label="Close" data-tip="text" data-tip-text="Close · Esc">✕</button>
        </div>

        ${stateHtml}

        <div class="pv-metrics">
          ${metric('Population', population)}
          ${metric('Control', control, 'control')}
          ${metric('Defense', defense, 'defense')}
        </div>

        ${rgoName ? `<div class="pv-rgo" data-tip="rgo" tabindex="0">
          <span class="pv-rgo-name">${rgoName}</span>
          <span class="pv-rgo-out">${rgoOut ?? '—'}</span>
          <span class="pv-rgo-work">${rgoWork ?? '—'}</span>
          ${unemployed && unemployed !== '0' ? `<em>${unemployed} unemployed</em>` : ''}
        </div>` : ''}

        ${notes ? `<div class="pv-notes">${notes}</div>` : ''}

        ${culture == null || !cluster ? '' : this.cultureBlockHtml(cluster)}

        <div class="pv-lines">
          ${line('State', province)}
          ${migration ? line('Migration', migration) : ''}
        </div>
      </div>`;

    this.bindActions();
  }

  /**
   * KALKINMA SATIRI: 1..10 pul, sahibinin tavanının üstü kilitli (kit.pips
   * `cap`). Tavanı araştırma ve okuryazarlık açar (investment.developmentCap);
   * kilitli pul oyuncuya "neden burada duruyor" sorusunun cevabını gösterir.
   */
  developmentRowHtml(econ, y) {
    const level = econ.development ?? 1;
    const cap = y?.cap ?? DEVELOPMENT_MAX;
    const tip = [
      `Development ${level} of ${DEVELOPMENT_MAX}`,
      'Every level above the first adds industry here; industry needs coal and grows with technology.',
      'The development fund buys levels state by state, the best gain for the cost first.',
      y ? `The owner's cap is level ${cap}: research and literacy raise it.` : '',
    ].filter(Boolean).join('\n');
    return `<div class="pv-state-row"${tipAttr({ text: tip })}><small>Development</small>${kitPips(level, DEVELOPMENT_MAX, cap)}<b>${level}</b><em>cap ${cap}</em></div>`;
  }

  /**
   * SONRAKİ KADEME + DEVELOP ANAHTARI (eski hızlı inşa şeridinin yerine).
   * İnşa kuyruğu yok: fon kademeyi kendisi alır, oyuncunun tek kolu fonu bu
   * state'e öncelikle yollayan Develop odağıdır. Anahtar stateFocus.setFocus'un
   * kendisidir (B aynı kapıdan geçer); sayılar stateView.stateYield'den.
   */
  nextLevelRowHtml(area, y) {
    const world = this.game.world;
    const me = world.nations[this.game.turns.playerNation];
    if (!me) return '';
    const develop = FOCUS_BY_ID.develop;
    const on = area.econ.focus === 'develop';
    const blockers = on ? [] : focusBlockers(world, me, area, 'develop');
    // Hedef CANLI okunur (economy.investTarget hafta kapanışının kaydıdır):
    // odak az önce konduysa kart "fon başka yerde" demesin.
    const target = investmentTarget(world, me);
    const next = y.next;
    const saving = target?.id === area.id;
    const targetName = target?.name ?? null;
    const rowTip = next ? [
      `Level ${next.level} costs ${money(next.cost, 0)} from the development fund`,
      `It adds about ${money(next.gain, 2)} a week: industry, and deposits at today's prices.`,
      saving
        ? `The fund is saving for it now: ${money(Math.max(0, me.fund ?? 0), 0)} of ${money(next.cost, 0)}.`
        : targetName ? `The fund is saving for ${targetName} first.` : 'The fund has no state to develop yet.',
    ] : [`At the cap (level ${y.cap})`, 'Research and literacy raise the cap.'];
    const current = !on && area.econ.focus ? FOCUS_BY_ID[area.econ.focus]?.name : null;
    const buttonTip = on
      ? [`${develop.name} focus — active`, develop.desc, 'Click or B: remove it.']
      : blockers.length
        ? [`${develop.name} focus`, 'Not possible now', ...blockers]
        : [`${develop.name} focus`, develop.desc, ...(focusPreview(world, me, area, 'develop')?.lines ?? []),
          current ? `Replaces the ${current} focus.` : '', 'Click or B: set it.'].filter(Boolean);
    const button = `<button type="button" class="pv-focus-count${on ? ' on' : ''}" data-develop aria-pressed="${on}"${
      blockers.length ? ' aria-disabled="true" style="opacity:.45"' : ''} data-tip="text" data-tip-text="${escapeHtml(buttonTip.join('\n'))}">${develop.name} <i aria-hidden="true">B</i></button>`;
    const value = next
      ? `<b>${money(next.cost, 0)}</b><em>+${money(next.gain, 2)}/wk</em>`
      : `<b>At cap</b><em>level ${y.cap}</em>`;
    return `<div class="pv-state-row pv-develop"${tipAttr({ text: rowTip.join('\n') })}><small>Next level</small>${value}${button}</div>`;
  }

  /**
   * KALE: haritanın sabit özelliği (0-3), inşa edilmez; savunma ölçüsü onu
   * zaten içerir (battles.tileDefense). Satır yalnız kademeyi söyler — oranı
   * burada yeniden yazmak savaş formülünün ikinci kopyası olurdu.
   */
  fortRowHtml(econ) {
    const fort = Math.max(0, Math.min(3, econ.fort ?? 0));
    const tip = `${fort ? `Fort level ${fort} of 3` : 'No fort'}\n`
      + `${fort ? 'Every hex of the state defends better (see Defense). ' : ''}`
      + 'Forts come with the map and a few national programmes; they cannot be built.';
    return `<div class="pv-state-row"${tipAttr({ text: tip })}><small>Fort</small>${kitPips(fort, 3)}<b>${fort}</b><em>${fort ? 'raises defense' : 'none'}</em></div>`;
  }

  /**
   * Develop odağını çevirir (karttaki anahtar ve B). Konamazsa sebebi kısa
   * ipucuyla söylenir: tuş sessizce hiçbir şey yapmasın (focusBlockers).
   */
  toggleDevelop(area) {
    const { game } = this;
    const me = game.world?.nations[game.turns.playerNation];
    if (!me || !area?.econ || area.owner !== me.id) return false;
    const on = area.econ.focus === 'develop';
    if (!on) {
      const blockers = focusBlockers(game.world, me, area, 'develop');
      if (blockers.length) {
        this.flashHint(blockers[0]);
        return false;
      }
    }
    if (!setFocus(game.world, me, area, on ? null : 'develop')) return false;
    game.emit('politics', me.id);
    this.flashHint(on ? `${area.name}: Develop focus removed` : `${area.name}: the development fund comes here first`);
    this.showTile(game.selected);
    return true;
  }

  /**
   * STATE FOCUS (Vic2 ulusal odağı, state başına; game/focus.js). Kartta tek
   * satır: beş madalyon, seçili olan yanık; tooltip o state'teki getiriyi
   * oyunun formülüyle söyler (stateFocus.focusPreview). Aynı odağa tık kaldırır.
   */
  focusRowHtml(area) {
    const world = this.game.world;
    const me = world.nations[this.game.turns.playerNation];
    if (!me || !area.econ) return '';
    const current = area.econ.focus ?? null;
    const used = focusedStates(world, me).length;
    const slots = focusSlots(me);
    const next = nextSlotAt(me);
    const buttons = FOCUSES.map((focus) => {
      const on = current === focus.id;
      const blockers = on ? [] : focusBlockers(world, me, area, focus.id);
      const preview = blockers.length ? null : focusPreview(world, me, area, focus.id);
      const tip = [
        `${focus.name}${on ? ' — active (click to remove)' : ''}`,
        focus.desc,
        ...(preview?.lines ?? []),
        ...(blockers.length ? ['', 'Not possible now', ...blockers] : []),
      ].join('\n');
      return `<button class="pv-focus-btn${on ? ' on' : ''}${blockers.length ? ' off' : ''}" data-focus="${focus.id}"${blockers.length ? ' aria-disabled="true"' : ''} data-tip="text" data-tip-text="${escapeHtml(tip)}" aria-pressed="${on}">${emblemArt(focus.art, 'xs')}</button>`;
    }).join('');
    // Odak yoksa ad yazılmaz: dar kartta "none" sayaca sıkışıp "n…" oluyordu.
    const name = current ? FOCUSES.find((f) => f.id === current)?.name : '';
    const slotTip = `Focus slots: ${used} of ${slots} in use.\nOne slot, plus one for every 25% literacy${next != null ? ` — the next at ${Math.round(next * 100)}%` : ''}.\nClick: every focused state in one list.`;
    const open = this.focusListOpen ?? false;
    return `<div class="pv-state-row pv-focus"><small>Focus</small><span class="pv-focus-btns">${buttons}</span><b>${escapeHtml(name)}</b><button type="button" class="pv-focus-count${open ? ' on' : ''}" data-focus-list aria-expanded="${open}" data-tip="text" data-tip-text="${escapeHtml(slotTip)}">${used}/${slots} <i aria-hidden="true">${open ? '▴' : '▾'}</i></button></div>${open ? this.focusListHtml(me) : ''}`;
  }

  /**
   * BÜTÜN ODAKLAR tek listede (Kerem: "hepsini tek tek silmek için aramak
   * istemiyorum"). Satır: state (tık → oraya git), odak, getirisi, kaldır.
   * Varsayılan AUTO'da kabine boş yuvayı çeyrekte bir doldurur; anahtar onu
   * durdurur, yoksa silinen odak geri geliyordu.
   */
  focusListHtml(me) {
    const world = this.game.world;
    const states = focusedStates(world, me)
      .sort((a, b) => (a.econ.focus ?? '').localeCompare(b.econ.focus ?? '') || a.name.localeCompare(b.name));
    const free = Math.max(0, focusSlots(me) - states.length);
    const rows = states.map((state) => {
      const focus = FOCUSES.find((f) => f.id === state.econ.focus);
      const line = focusPreview(world, me, state, focus.id)?.lines?.[0] ?? focus.desc;
      return `<div class="pv-fl-row">
        <span class="pv-fl-art">${emblemArt(focus.art, 'xs')}</span>
        <button type="button" class="pv-fl-name" data-focus-go="${state.id}" data-tip="text" data-tip-text="${escapeHtml(`${state.name}\nShow this state.`)}">${escapeHtml(state.name)}</button>
        <span class="pv-fl-what"><b>${escapeHtml(focus.name)}</b> ${escapeHtml(line)}</span>
        <button type="button" class="pv-fl-x" data-focus-clear="${state.id}" aria-label="Remove the ${escapeHtml(focus.name)} focus from ${escapeHtml(state.name)}" data-tip="text" data-tip-text="${escapeHtml(`Remove the focus from ${state.name}`)}">✕</button>
      </div>`;
    }).join('');
    const cabinet = me.focusAuto !== false;
    const delegated = isDelegated(me, 'reforms');
    const autoTip = delegated
      ? 'The cabinet (AUTO) puts a focus in every empty slot each quarter.\nTurn it off to keep the slots you clear empty.'
      : 'Government is not on AUTO: empty slots stay empty either way.';
    return `<div class="pv-focus-list">
      ${rows || '<p class="pv-fl-empty">No state has a focus.</p>'}
      <div class="pv-fl-foot">
        <span>${free ? `${free} free slot${free === 1 ? '' : 's'}` : 'All slots in use'}</span>
        <button type="button" class="pv-fl-auto${cabinet && delegated ? ' on' : ''}" data-focus-auto${delegated ? '' : ' disabled'} data-tip="text" data-tip-text="${escapeHtml(autoTip)}">Cabinet fills: ${cabinet && delegated ? 'on' : 'off'}</button>
        <button type="button" class="pv-fl-all" data-focus-clear-all${states.length ? '' : ' disabled'}>Clear all</button>
      </div>
    </div>`;
  }

  /**
   * Kültür satırı tıklanır: halkın adına basınca kültür haritası o halkın
   * bütün dünyadaki dağılımını gösterir (renderer.drawCultureHighlight).
   */
  /**
   * STATE ÇIKTISI (Kerem: "kazandığımız state'e gelir kaç"). Vergi yok:
   * state'in katkısı haftalık çıktısıdır, el emeği + sanayi (ulusal
   * çarpanlarla, stateView.stateYield → econ/output.provinceOutputOf). Mallar
   * dünya fiyatıyla ayrıca değerlidir; döküm bilgi kartında
   * (tooltipState 'state-income').
   */
  incomeRowHtml(area, y = stateYield(this.game.world, area)) {
    if (!y) return '';
    return `<div class="pv-state-row pv-income"${tipAttr('state-income', area.id)}><small>Output</small>
      <b>${money(y.total, 2)}<i>/wk</i></b><em>Hand ${y.hand.toFixed(2)} · Industry ${y.industry.toFixed(2)}</em></div>`;
  }

  /**
   * KÜLTÜR PASTASI (Kerem: "kültür için pasta, kültürün aylık değişimi").
   * Dilim = pay; satırda aylık değişim oyunun haftalık kayma formülünden
   * (stateView.stateCultures → culture.projectCultureWeek). Ad tıklanınca
   * kültür haritası o halkı gösterir (data-culture-hi).
   */
  cultureBlockHtml(area) {
    const rows = stateCultures(this.game.world, area).filter((row) => row.share >= 0.005);
    if (!rows.length) return '';
    let at = 0;
    const stops = rows.map((row) => {
      const from = at;
      at += row.share * 100;
      return `${row.color} ${from.toFixed(2)}% ${at.toFixed(2)}%`;
    }).join(', ');
    const change = (m) => (Math.abs(m) < 0.0005 ? '<em class="flat">±0</em>'
      : `<em class="${m > 0 ? 'up' : 'down'}">${m > 0 ? '+' : '−'}${Math.abs(m * 100).toFixed(1)}%/mo</em>`);
    const tag = (row) => (row.primary ? 'primary' : row.accepted ? 'accepted' : 'not accepted');
    const legend = rows.map((row) => `<li${tipAttr('culture-row', `${area.id}:${row.id}`)}>
        <i style="background:${row.color}"></i>
        <button type="button" class="pv-cult" data-culture-hi="${row.id}">${escapeHtml(row.name)}</button>
        <small class="${row.primary || row.accepted ? '' : 'neg'}">${tag(row)}</small>
        <b>${(row.share * 100).toFixed(row.share < 0.1 ? 1 : 0)}%</b>${change(row.monthly)}
      </li>`).join('');
    return `<div class="pv-cultures"><span class="pv-pie" style="background:conic-gradient(${stops})" aria-hidden="true"></span><ul>${legend}</ul></div>`;
  }

  cultureLinks(tile) {
    const world = this.game.world;
    const mix = (world.provinces?.[tile?.provinceId]?.cultures ?? []).filter((row) => row.share >= 0.05);
    if (!mix.length) return null;
    return mix.map((row) => `<button type="button" class="pv-cult" data-culture-hi="${row.id}">${escapeHtml(world.cultures[row.id]?.name ?? '?')}</button>${mix.length > 1 ? ` ${Math.round(row.share * 100)}%` : ''}`).join(' · ');
  }

  /** Kültür haritasında bir halkın dağılımını açar (çip ✕ ile kapanır). */
  showCulture(id) {
    const game = this.game;
    game.renderer.cultureHighlight = id;
    const btn = document.querySelector('.mode-btn[data-mode="cultures"]');
    if (game.renderer.mapMode !== 'cultures' && btn) btn.click();
    else game.emit('mapmode', 'cultures');
    game.requestRender();
  }

  /** Dağılım çipi: hangi halk gösteriliyor, kapat. */
  syncCultureChip() {
    const game = this.game;
    let chip = document.getElementById('culture-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'culture-chip';
      chip.className = 'culture-chip';
      chip.hidden = true;
      document.body.appendChild(chip);
      chip.addEventListener('click', (event) => {
        if (!event.target.closest('[data-culture-clear]')) return;
        game.renderer.cultureHighlight = null;
        this.syncCultureChip();
        game.requestRender();
      });
    }
    const id = game.renderer.cultureHighlight;
    const culture = id != null ? game.world?.cultures?.[id] : null;
    const on = Boolean(culture) && game.renderer.mapMode === 'cultures';
    chip.hidden = !on;
    if (on) {
      chip.innerHTML = `<i style="background:${culture.color}"></i><b>${escapeHtml(culture.name)}</b><span>share in every province, ours and abroad</span><button type="button" data-culture-clear aria-label="Clear">✕</button>`;
    }
  }

  /** Ordu karti: tip, mevcut, STR/ORG, bilesim, dagitma. */
  /**
   * Karede yapılabilecek eylemler: şehirde birim al, savaş/barış, toplanma
   * noktası. Ordu seçiliyken panel ordunundur (armyPanel.js), bu satırlar
   * çizilmez.
   */
  actionsHtml(tile) {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    const rows = [];

    if (tile.city && tile.city.nationId === game.turns.playerNation) {
      const city = tile.city;
      const buttons = Object.entries(UNIT_COSTS).filter(
        // Gemi ancak kıyı şehrinde üretilebilir.
        ([id]) => UNIT_TYPES[id].domain !== 'sea' || tile.coastal,
      ).map(([id, cost]) => {
        const disabled = canAfford(me, cost) && canRecruit(game.world, me, id) ? '' : 'disabled';
        // Alay artik siparistir: kac hafta egitildigi dugmede yazmali, yoksa
        // oyuncu tikladiktan sonra haritada birim arar (bkz. recruitment.js).
        // Peşin bedel yok (cities.UNIT_COSTS boş, formatCost ''): boş parça
        // düğmede "Infantry ·  · ..." diye çift ayraç bırakmasın.
        const label = [UNIT_TYPES[id].name, formatCost(cost), equipmentCostLabel(id), `${trainingWeeks(id)}w`]
          .filter(Boolean).join(' · ');
        return `<button class="action" data-buy="${id}" ${disabled}
          title="Ordered into training. No up-front cost: men, equipment and a weekly supply bill. The full order book with reasons is on the Military screen.">${label}</button>`;
      }).join('');
      // Alim listesi KATLI acilir. Alti alay dugmesi kutuyu tek basina ~180px
      // sisiriyor ve baskent karesinde bilgi kismini ekranin disina itiyordu;
      // buyruk kutusunun asil isi "burada ne var" demektir, siparis vermek
      // Military ekraninin isidir. Islev duruyor, yalnizca katlanmis.
      // Sehrin eski "population: 3 Ammar" satiri kalkti: eski pop birimini
      // sayiyordu ve hemen altindaki 2.55M nufus ve kultur payiyla celisiyordu.
      rows.push(`<details class="sheet-fold">
        <summary>Recruit in ${escapeHtml(city.name)}</summary>
        <div class="action-row">${buttons}</div>
      </details>`);
    }

    // Yabancı toprak/birim: savaş ilanı ya da barış teklifi.
    const foreign = tile.owner >= 0 && tile.owner !== game.turns.playerNation
      ? tile.owner
      : (tile.unit && tile.unit.nationId !== game.turns.playerNation ? tile.unit.nationId : -1);
    // Onay bekleyen ilan baska bir ulkeye ait ise duser: iki tik ayni hedefe.
    if (this.warConfirm != null && this.warConfirm !== foreign) this.warConfirm = null;
    if (foreign >= 0 && game.world.nations[foreign].alive) {
      const other = game.world.nations[foreign];
      const war = atWar(game.world, foreign, game.turns.playerNation);
      const crisis = crisisLeft(game.world, foreign, game.turns.playerNation, game.turns.turn);
      const rec = relation(game.world, foreign, game.turns.playerNation);
      const locked = war && game.turns.turn - rec.since < MIN_WAR_TURNS;
      const truce = truceLeft(game.world, foreign, game.turns.playerNation, game.turns.turn);
      const vassal = overlordOf(game.world, foreign, game.turns.turn) === game.turns.playerNation;
      // Engel varsa düğme kapanır ve nedeni ipucunda: eskiden ilan sessizce
      // reddediliyordu (vassal Ravoya, 2026-10-15).
      const warWhy = war || crisis ? [] : warBlockers(game.world, game.turns.playerNation, foreign, game.turns.turn);
      const state = war ? 'at war'
        : crisis ? `war in ${crisis} weeks`
          : truce ? `truce (${truce} turns)` : vassal ? 'our vassal' : 'at peace';
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(other.name)} — ${state}</div>
        <button class="action wide" data-dossier="${foreign}">Open ${escapeHtml(other.name)} Dossier</button>
        ${war
    ? `<button class="action wide" data-peace="${foreign}" ${locked ? 'disabled' : ''}>Offer Peace${locked ? ` (${MIN_WAR_TURNS - (game.turns.turn - rec.since)} weeks)` : ''}</button>`
    : crisis
      ? `<button class="action wide" disabled title="The ultimatum runs out in ${crisis} weeks; mobilize from the Military screen.">Ultimatum (${crisis} weeks)</button>`
      : `<button class="action wide${this.warConfirm === foreign ? ' confirming' : ''}" data-war="${foreign}" ${warWhy.length ? `disabled title="${escapeHtml(warWhy.join(' · '))}"` : ''}>${
        this.warConfirm === foreign
          ? `Click again to declare war: ${ULTIMATUM_WEEKS}-week ultimatum, infamy for every state taken`
          : truce ? `Declare War (${truce} turns)`
            : warWhy.length ? `Declare War · ${escapeHtml(vassal ? 'release or annex in their dossier' : warWhy[0])}` : 'Declare War'}</button>`}
      </div>`);
    }

    // Province kartında ordu satırı YOK: karedeki tümen her hafta gelip
    // gidiyor, komutan/cephe/emir satırları (123 px) kartı oynatıyordu
    // (jitter-probe, 8x savaş). Ordu satırları ordu SEÇİLİYKEN, ordu panelinde.

    // Toplanma noktasi: yeni kurulan alaylar cikis province'inden buraya yurur.
    if (tile.owner === game.turns.playerNation && tile.terrain.passable) {
      const rally = rallyTile(game.world, me);
      const here = rally === tile;
      const where = rally
        ? `${rally.city ? escapeHtml(rally.city.name) : `${rally.q}, ${rally.r}`}`
        : 'none';
      // Her kendi karemizde gorunur ama seyrek kullanilir: tam satir aciklama
      // + tam genislik dugme yerine tek satir; aciklama ipucunda.
      rows.push(`<div class="action-row rally-row"
          title="Rally point: new regiments march here from where they are raised. Without one they stay put.">
        <div class="k">Rally point · <b>${where}</b></div>
        ${here
    ? '<button class="action" data-rally="clear">Clear</button>'
    : '<button class="action" data-rally="set">Set here</button>'}
      </div>`);
    }

    return rows.join('');
  }

  /** HOI4 tarzi komutan secme listesi. `armies` tek tumen ya da dizi olabilir. */
  openGeneralPicker(armies) {
    const game = this.game;
    const me = game.world.nations[game.turns.playerNation];
    const list = (Array.isArray(armies) ? armies : [armies]).filter(Boolean);
    const cost = generalCost(me);
    // Secim tamamen gemiyse amiral listesi acilir; karisik secimde kara kadrosu.
    const branch = list.length && list.every((army) => army.type.domain === 'sea')
      ? BRANCH.NAVY : BRANCH.ARMY;
    // Kart dili ordu panelinin (armyPanel.js): portre, yıldız, özellik.
    this.el.sheetBody.innerHTML = generalPickerHtml(game, me, list, {
      branch, costLabel: formatCost(cost), affordable: canAfford(me, cost),
    });
    // Seçici bu seçim için açık kalır; zaman akarken showTile onu ezmez.
    this.sheetPicker = game.selection.map((unit) => unit.id).join(',');

    for (const btn of this.el.sheetBody.querySelectorAll('[data-pick-general]')) {
      btn.onclick = () => {
        assignDivisions(me, Number(btn.dataset.pickGeneral), list);
        this.sheetPicker = null;
        game.activeGeneral = generalById(me, Number(btn.dataset.pickGeneral));
        refreshFront(game.world, game.activeGeneral);
        this.showTile(game.selected);
        this.showSelection();
        game.requestRender();
      };
    }
    for (const back of this.el.sheetBody.querySelectorAll('[data-close-generals]')) {
      back.onclick = () => {
        this.sheetPicker = null;
        this.showTile(game.selected);
      };
    }
    const train = this.el.sheetBody.querySelector('[data-train-general]');
    if (train) {
      train.onclick = () => {
        if (!pay(me, generalCost(me))) return;
        const general = createGeneral(game.world, me, game.turns.rng, { branch });
        game.turns.addLog(`${general.name} joined the officer staff.`);
        this.openGeneralPicker(list);
        this.showCommand();
      };
    }
  }

  /**
   * Ust cubuktaki Population/GDP olculerini gecikmeli bilgi kartina baglar.
   * BIR KEZ baglanir: serit her hafta yeniden cizilir ama olay dinleyicisi
   * seridin KENDISINDE degil, kapsayicisindadir (olay delegasyonu).
   */
  ensureMacroCards() {
    if (this.macroCards) return;
    const { game } = this;
    const valueOf = (nation, metric) => (metric === 'ic'
      ? (nation?.economy?.ic?.total ?? 0) : (nation?.economy?.population ?? 0));
    this.macroCards = bindMacroCards(this.el.macroStats, {
      playerId: () => game.turns.playerNation,
      /** Geçmiş izi: `economy.history` (economy.finishEconomy, 104 hafta). */
      series: (metric) => {
        const me = game.world.nations[game.turns.playerNation];
        const history = me?.economy?.history ?? [];
        const key = metric === 'ic' ? 'ic' : 'population';
        return { samples: history.map((row) => row[key] ?? 0), current: valueOf(me, metric) };
      },
      /** "Bu hafta": geçen haftaya göre fark (economy.history'den okunur). */
      pulse: (metric) => {
        const me = game.world.nations[game.turns.playerNation];
        const history = me?.economy?.history ?? [];
        const key = metric === 'ic' ? 'ic' : 'population';
        const delta = history.length >= 2 ? history.at(-1)[key] - history.at(-2)[key] : null;
        const year = history.length >= 53 ? history.at(-1)[key] - history.at(-53)[key] : null;
        const fmt = metric === 'ic'
          ? (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`
          : (v) => `${v >= 0 ? '+' : '−'}${formatPopulation(Math.abs(v))}`;
        const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
        // IC hücresinde İKİ kart üst üste açılıyordu (data-tip="ic" bilgi
        // kartı + bu geçmiş kartı, iki farklı sayıyla). Döküm buraya taşındı:
        // tek kart, eğri + kırılım. Dar ekranda gizlenen askerî pay da burada.
        const ic = metric === 'ic' ? me?.economy?.ic : null;
        const factor = (label, f) => ({ label, value: `×${(f ?? 1).toFixed(2)}`, tone: (f ?? 1) < 1 ? 'down' : '' });
        return [
          delta != null ? { label: 'Change vs last week', value: fmt(delta), tone: tone(delta) } : null,
          year != null ? { label: 'Change over a year', value: fmt(year), tone: tone(year) } : null,
          // Ordu sanayiden çeker; tavanın çekilmeyen kısmı halka ve kalkınmaya
          // döner (economy.splitOutput), o yüzden iki sayı yan yana.
          ic ? { label: 'Army draws · cap', value: `${(me.economy.alloc?.army ?? ic.drawn ?? 0).toFixed(1)} · ${(me.economy.alloc?.armyCap ?? ic.military ?? 0).toFixed(1)}` } : null,
          ic ? factor('Coal', ic.factors?.coal) : null,
          ic ? factor('Technology', ic.factors?.tech) : null,
          ic ? factor('Stability', ic.factors?.stability) : null,
        ].filter(Boolean);
      },
      ranking: (metric) => game.world.nations
        .filter((nation) => nation.alive && nation.economy)
        .map((nation) => ({ id: nation.id, name: nation.name, value: valueOf(nation, metric) }))
        .sort((a, b) => b.value - a.value)
        .map((row, index) => ({ ...row, rank: index + 1 })),
    });
  }


  bindActions() {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    // Develop anahtarı: engelliyse de tıklanır ki sebep ipucuyla söylensin.
    const develop = this.el.sheetBody.querySelector('[data-develop]');
    if (develop) {
      develop.onclick = () => {
        const area = game.world.provinces?.[game.selected?.provinceId];
        if (area) this.toggleDevelop(area);
      };
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-culture-hi]')) {
      btn.onclick = (event) => {
        event.stopPropagation();
        this.showCulture(Number(btn.dataset.cultureHi));
      };
    }
    const focusList = this.el.sheetBody.querySelector('[data-focus-list]');
    if (focusList) {
      focusList.onclick = () => {
        this.focusListOpen = !this.focusListOpen;
        this.showTile(game.selected);
      };
    }
    const clearFocus = (states) => {
      if (!me || !states.length) return;
      for (const state of states) setFocus(game.world, me, state, null);
      game.emit('politics', me.id);
      this.showTile(game.selected);
    };
    for (const btn of this.el.sheetBody.querySelectorAll('[data-focus-clear]')) {
      btn.onclick = () => clearFocus([game.world.provinces?.[Number(btn.dataset.focusClear)]].filter(Boolean));
    }
    const clearAll = this.el.sheetBody.querySelector('[data-focus-clear-all]');
    if (clearAll) clearAll.onclick = () => clearFocus(me ? focusedStates(game.world, me) : []);
    const focusAuto = this.el.sheetBody.querySelector('[data-focus-auto]');
    if (focusAuto && me) {
      focusAuto.onclick = () => {
        me.focusAuto = me.focusAuto === false ? true : false;
        this.showTile(game.selected);
      };
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-focus-go]')) {
      btn.onclick = () => {
        const state = game.world.provinces?.[Number(btn.dataset.focusGo)];
        if (state?.center) game.focusTile(state.center);
      };
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-focus]')) {
      btn.onclick = () => {
        if (btn.getAttribute('aria-disabled') === 'true') return;
        const area = game.world.provinces?.[game.selected?.provinceId];
        if (!area || !me) return;
        if (setFocus(game.world, me, area, btn.dataset.focus)) {
          game.emit('politics', me.id);
          this.showTile(game.selected);
        }
      };
    }
    // ORDUYU DAGIT. `disband()` zaten vardi ve hayatta kalanlarin insan gucunu
    // TOPLANDIKLARI province'lere iade ediyordu — eksik olan sadece dugmeydi,
    // yani oyuncunun elinde ordu kucultme araci hic yoktu (kullanici bildirimi).
    for (const btn of this.el.sheetBody.querySelectorAll('[data-disband]')) {
      btn.onclick = () => {
        // Düğme kimlik LİSTESİ taşır (tek ya da çoklu seçim; bkz. armyPanel).
        // `dataset` dize döndürür; birim kimliği sayı olabilir.
        const ids = btn.dataset.disband;
        const wanted = new Set(ids.split(',').filter(Boolean));
        const units = game.world.units.filter((u) => wanted.has(String(u.id)) && !u.battleId);
        if (!units.length) return;
        // İlk tık kurar, ikincisi siler (bkz. armyPanel.armDisband); kurulu
        // düğme 4 sn sonra kendiliğinden söner.
        if (this.disbandArmed !== ids) {
          this.disbandArmed = ids;
          armDisband(ids);
          clearTimeout(this.disbandTimer);
          this.disbandTimer = setTimeout(() => {
            this.disbandArmed = null;
            armDisband(null);
            this.showTile(game.selected);
          }, 4000);
          this.showTile(game.selected);
          return;
        }
        clearTimeout(this.disbandTimer);
        this.disbandArmed = null;
        armDisband(null);
        const gone = new Set(units.filter((unit) => disband(game, unit)));
        if (gone.size) {
          // Seçimden de düşsünler: yalnız selectedUnit sıfırlanınca ölü birlik
          // seçili listede kalıyor, sağ tık ona yürüyüş emri veriyordu.
          game.selectUnits(game.selection.filter((u) => !gone.has(u)));
          if (gone.size > 1) this.flashHint(`${gone.size} divisions disbanded`);
          this.showTile(game.selected);
          game.requestRender();
        }
      };
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-buy]')) {
      // Shift = 5 siparis (askeri ekranla ayni kural); kisitlar durdurunca biter.
      btn.onclick = (event) => {
        const wanted = event.shiftKey ? 5 : 1;
        for (let i = 0; i < wanted; i++) {
          if (!game.turns.buyUnit(me, btn.dataset.buy)) break;
        }
      };
    }
    const war = this.el.sheetBody.querySelector('[data-war]');
    // IKI TIK. Tek tikla savas ilan etmek, "Open Dossier"in hemen altinda
    // duran bir dugme icin fazla ucuzdu (kor oyun testi). Program kartiyla
    // ayni kalip: ilk tik niyeti sorar, ikincisi ilan eder; sekiz saniyede
    // cevap gelmezse dugme eski haline doner.
    if (war) {
      war.onclick = () => {
        const id = Number(war.dataset.war);
        if (this.warConfirm !== id) {
          this.warConfirm = id;
          clearTimeout(this.warConfirmTimer);
          this.warConfirmTimer = setTimeout(() => {
            if (this.warConfirm !== id) return;
            this.warConfirm = null;
            if (game.selected) this.showTile(game.selected);
          }, 8000);
          this.showTile(game.selected);
          return;
        }
        this.warConfirm = null;
        clearTimeout(this.warConfirmTimer);
        game.declareWarOn(id);
      };
    }
    const peace = this.el.sheetBody.querySelector('[data-peace]');
    // Otomatik barış kalktı: bu düğme de masayı açar (bkz. screens.openPeaceTalks).
    if (peace) peace.onclick = () => this.screens.openPeaceTalks(Number(peace.dataset.peace));
    // Sağ tık masaüstünde kısayol; dokunmatikte panele buradan girilir.
    const dossier = this.el.sheetBody.querySelector('[data-dossier]');
    if (dossier) dossier.onclick = () => this.screens.openDossier(Number(dossier.dataset.dossier));
    // ORDU PANELİ (armyPanel.js): satır yalnız o tümeni seçer, Shift/Ctrl ile
    // seçimden düşer; komutan atama bütün seçime uygulanır.
    for (const btn of this.el.sheetBody.querySelectorAll('[data-ap-unit]')) {
      btn.onclick = (event) => {
        const unit = game.world.units.find((u) => u.id === Number(btn.dataset.apUnit));
        if (!unit) return;
        if (event.shiftKey || event.ctrlKey) {
          game.selectUnits(game.selection.filter((u) => u !== unit));
          game.requestRender();
          return;
        }
        game.camera.centerOn(unit.tile.x, unit.tile.y);
        game.selected = unit.tile;
        game.selectUnits([unit]);
        game.emit('select', unit.tile);
        game.requestRender();
      };
    }
    const assign = this.el.sheetBody.querySelector('[data-ap-assign]');
    if (assign) assign.onclick = () => { if (game.selection.length) this.openGeneralPicker(game.selection); };
    const clear = this.el.sheetBody.querySelector('[data-ap-clear]');
    if (clear) {
      clear.onclick = () => {
        game.selectGeneral(null);
        game.selectUnits([]);
        game.requestRender();
      };
    }
    const dismiss = this.el.sheetBody.querySelector('[data-unassign]');
    if (dismiss) {
      dismiss.onclick = () => {
        unassignGeneral(game.world, me, Number(dismiss.dataset.unassign));
        this.showTile(game.selected);
        this.showCommand();
      };
    }
    const stance = this.el.sheetBody.querySelector('[data-command-stance]');
    if (stance) stance.onclick = () => {
      const general = generalById(me, Number(stance.dataset.commandStance));
      if (!general) return;
      game.activeGeneral = general;
      game.toggleOffensive();
      this.showTile(game.selected);
      this.showCommand();
    };
    const rally = this.el.sheetBody.querySelector('[data-rally]');
    if (rally) {
      rally.onclick = () => {
        setRallyPoint(me, rally.dataset.rally === 'set' ? game.selected : null);
        this.showTile(game.selected);
        game.requestRender();
      };
    }
    for (const btn of this.el.sheetBody.querySelectorAll('[data-order]')) {
      btn.onclick = () => {
        // Emir SECIME uygulanir, tek kareye degil: bes tumen sectiysen bes
        // tumen devredilir. Secim bossa karedeki birim esas alinir.
        const units = game.selection.length ? game.selection
          : (game.selected?.unit ? [game.selected.unit] : []);
        const order = btn.dataset.order;
        // Yanan Hold/Auto düğmesi anahtar gibi görünüyordu ama ikinci tık
        // hiçbir şey yapmıyordu (H tuşu ise çeviriyordu): hepsi zaten bu
        // emirdeyse ikinci tık emri kaldırır.
        const allSame = order !== 'clear' && units.length && units.every((unit) => unit.order?.type === order);
        for (const unit of units) {
          if (order === 'clear' || allSame) game.clearUnitOrder(unit);
          else game.setUnitOrder(unit, order);
        }
        if (allSame) this.flashHint(order === 'hold' ? 'Hold lifted' : 'Auto lifted');
        this.showTile(game.selected);
      };
    }
  }
}

/** Üst çubuk: oyunun bütün ekonomisi (TASARIM.md §1). */
function resourcesHtml(nation) {
  const infamy = nation.infamy ?? 0;
  const infamyClass = infamy >= INFAMY_COALITION ? 'res-neg'
    : infamy >= INFAMY_COALITION * 0.6 ? 'res-warn' : '';
  const stability = Math.round((nation.stability ?? 0) * 100);
  const warSupport = Math.round((nation.warSupport ?? 0) * 100);
  const exhaustion = Math.round((nation.politics?.exhaustion ?? 0) * 100);
  const power = powerIncome(nation);
  const stabilityClass = stability < 30 ? 'res-neg' : stability < 45 ? 'res-warn' : '';
  // Sakin halka: yolunda giden gösterge pirinçtir, renk yalnız uyarıda çıkar.
  // Yeşil "her şey yolunda" çubuğun en bağıran öğesiydi (Kerem, 2026-10-08).
  const tone = (v, warn, bad) => (v < bad ? 'neg' : v < warn ? 'warn' : 'brass');
  // TEK ÇUBUK: ana gösterge haftanın çıktısıdır (hazine yok). Altındaki şerit
  // çıktının dört paya bölünüşü; faturalar tavanı aşınca (ikmal krizi) değer
  // kırmızıya döner ve şerit nabız atar — krizin bedeli takviye, eğitim ve
  // düzendir (econ/bills.supplyFactor), oyuncu onu ekran açmadan görmeli.
  const output = nation.economy?.ic?.output ?? 0;
  const crisis = inSupplyCrisis(nation);
  const cells = statCell(emblemArt('industry'), 'Output',
    `<span class="${crisis ? 'res-neg' : ''}">${outputLabel(output)}</span><em class="stat-flow">IC</em>`,
    `data-tip="topbar-output" ${track('out', output, Math.max(0.5, output * 0.02))}`, `tb-hero${crisis ? ' tb-crisis' : ''}`,
    null, outputBar(nation.economy?.alloc, crisis))
    + statCell(emblemArt('power'), 'Power', `${Math.round(nation.power ?? 0)}<em class="stat-flow res-pos">+${power.total.toFixed(1)}</em>`,
      `data-tip="power" ${track('power', nation.power ?? 0, 25)}`, '', { share: (nation.power ?? 0) / 500, tone: 'gold' })
    + statCell(emblemArt('stability'), 'Stability', `<span class="${stabilityClass}">${stability}%</span>`,
      `role="button" data-why="stability" data-tip="stability" ${track('stab', stability, 1)}`, 'stat-why',
      { share: stability / 100, tone: tone(stability, 45, 30) })
    // Yorgunluk iradenin yanında: savaşın bedeli ekran açmadan okunsun
    // (0.60'tan sonra halklarımız kopmaya başlar; TASARIM §9-10).
    + statCell(emblemArt('war_support'), 'War Sup.', `${warSupport}%${exhaustion >= 5
      ? `<em class="stat-flow ${exhaustion >= 60 ? 'res-neg' : exhaustion >= 45 ? 'res-warn' : ''}" title="War exhaustion">exh ${exhaustion}%</em>` : ''}`,
    `data-tip="warsupport" ${track('ws', warSupport, 1)}`, '',
      { share: warSupport / 100, tone: 'war' })
    + statCell(emblemArt('infamy'), 'Infamy', `<span class="${infamyClass}">${infamy.toFixed(1)}</span>`,
      `data-tip="infamy" ${track('inf', infamy, 0.5, -1)}`, '',
      { share: infamy / INFAMY_COALITION, tone: infamy >= INFAMY_COALITION ? 'neg' : infamy >= INFAMY_COALITION * 0.6 ? 'warn' : 'dim' });
  // KARTUŞ: beş ana gösterge sekme künyeleriyle aynı pirinç çerçevede.
  return `<span class="tb-cartouche">${cells}</span>`;
}

/** Kaynak çipleri: karşılanma oranı; eksik olan kırmızı yanar, talebi olmayan (1836'da petrol) çizgi. */
function resourceChips(nation) {
  const records = nation.economy?.resources ?? {};
  // KAYNAK TEPSİSİ: her madalyonun çevresinde karşılanma halkası; talebi
  // olmayan (1836'da petrol) soluk, eksik olan kırmızı halka, ihracatçı ▲.
  return `<span class="tb-res">${RESOURCE_IDS.map((id) => {
    const record = records[id];
    const need = (record?.need ?? 0) > 0.01;
    const ratio = need ? record.ratio : 1;
    const cls = !need ? 'idle' : ratio < 0.8 ? 'short' : ratio < 0.98 ? 'tight' : 'ok';
    const ringTone = { short: 'neg', tight: 'warn', ok: 'brass', idle: 'dim' }[cls];
    const surplus = (record?.exported ?? 0) > 0.05;
    return `<span class="tb-resi ${cls}" data-tip="resource" data-tip-arg="${id}" tabindex="0" ${track(`r-${id}`, need ? ratio : 1, 0.05)}>
      ${ringSvg(need ? ratio : 0, ringTone)}${resourceArt(id, 'sm')}${surplus ? '<em>▲</em>' : ''}
      <b>${need ? `${Math.round(ratio * 100)}%` : '—'}</b></span>`;
  }).join('')}</span>`;
}

/** Çıktı: 100'ün altında bir ondalık, üstü tam sayı, on binden sonra K. */
function outputLabel(value) {
  const v = value ?? 0;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1);
}

/**
 * "WHY STABILITY IS WHAT IT IS" — ticaret ekranindaki "WHY THE PRICE MOVES"
 * kalibinin istikrara uygulanmis hali.
 *
 * Eski ipucu tam olarak sunu diyordu: "national stability". Yani etiketin
 * kendisini. Beta bunu en yuksek deger/saat oranli eksiklik olarak isaretledi:
 * oyuncu 60 yil boyunca istikrari neyin tuttugunu ogrenemedi.
 *
 * Sayilar UYDURULMAZ: hepsi `economy.stabilityBreakdown` icindeki gercek
 * simulasyon kalemleridir ve toplamlari istikrara esittir.
 */
function stabilityWhy(nation) {
  const parts = nation?.politics?.stabilityParts;
  if (!parts?.length) return 'national stability';
  const pt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}`;
  const lines = parts.map((part) => `${part.label.padEnd(30)} ${pt(part.value)}`);
  lines.push(`= Target ${(nation.politics.stabilityTarget * 100).toFixed(1)}% (now ${(nation.stability * 100).toFixed(1)}%)`);
  return lines.join('\n');
}

export function gameDate(turn, day = 0) {
  return dateOfTurn(turn, day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).toUpperCase();
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
