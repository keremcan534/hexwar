// DOM arayüzü: ayarlar, katman anahtarları, seçili hex paneli.
// Oyun mantığı burada yok; sadece Game'i sürer ve olaylarını dinler.

import {
  UNIT_COSTS, canAfford, formatCost, pay,
} from '../game/cities.js';
import {
  UNIT_TYPES, isMoving, maxHpOf, menUnderArms, organizationOf, regimentCount,
  speedOf, strengthRatio,
} from '../game/units.js';
import {
  MIN_WAR_TURNS, ULTIMATUM_WEEKS, atWar, crisisLeft, inCrisis, relation, truceLeft,
} from '../game/diplomacy.js';
import { warScore } from '../game/peace.js';
import { INFAMY_COALITION, OCCUPATION_TURNS, tileEfficiency } from '../game/infamy.js';
import {
  CULTURE, foreignShareOf, rebelCultureOf, unrestBreakdown,
} from '../game/culture.js';
import { stageOf } from '../game/movements.js';
import { savedInfo } from '../game/save.js';
import { ORDER } from '../game/orders.js';
import { DELEGATION_AREAS, DELEGATION_IDS, isDelegated } from '../game/delegation.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { mountFlag } from '../render/flagWave.js';
import {
  DATA_MODES, DIPLOMACY_COLORS, INDUSTRY_RAMP, INFAMY_RAMP, UNREST_RAMP, diplomacyStanding, rampColor,
} from '../render/renderer.js';
import { bindMacroCards } from './macroCard.js';
import { subayPortresi } from './icons/subaylar.js';
import { LEAVE_MS, hidePanel, motionOn, panelOpen, togglePanel } from './motion.js';
import { Screens } from './screens.js';
import { showEndScreen } from './endScreen.js';
import { formatPopulation, weeklyBalanceOf } from '../game/economy.js';
import { RESOURCES, RESOURCE_IDS, BUILDINGS, BUILDING_IDS, DEVELOPMENT_MAX } from '../game/econ/defs.js';
import { buildingArt, emblemArt, resourceArt, traitArt } from './icons/art.js';
import { glyph } from './icons/glyphs.js';
import { meter as kitMeter, pips as kitPips, tipAttr } from './kit.js';
import { depositsOf, fertilityOf } from '../game/econ/deposits.js';
import { powerIncome } from '../game/politics.js';
import { buildingLevels, buildingSlots } from '../game/provinces.js';
import {
  canRecruit, disband, equipmentCostLabel, nationManpower, rallyTile, setRallyPoint,
  trainingWeeks,
} from '../game/recruitment.js';
import {
  BRANCH, MAX_SKILL, TRAITS, assignDivisions, commandSize, createGeneral, generalById,
  aggressionInfo, borderNationIds, frontTilesOf, generalCost, generalOfArmy,
  officersOf, refreshFront, setAggression, unassignGeneral,
} from '../game/command.js';
import { controllerOf, isOccupied } from '../game/control.js';
import { tileDefense } from '../game/battles.js';
import { POPULATION_SCALE } from '../game/populationScale.js';
import { worldRows } from '../world/worldgen.js';

const ORDER_LABELS = {
  [ORDER.AUTO]: 'automatic (AI controlled)',
  [ORDER.HOLD]: 'holding position',
};

const $ = (id) => document.getElementById(id);

/** Katmanlar → Hex grid tercihi (tarayıcıda; varsayılan kapalı). */
const GRID_KEY = 'hexwar.map.hexGrid';
/** Sınır katmanları; anahtar yoksa açık (varsayılan görünüm). */
const BORDER_KEYS = { showCountryBorders: 'hexwar.map.countryBorders', showProvinceBorders: 'hexwar.map.provinceBorders' };

/** Sekme ekranı → devir alanı (Military → recruitment, Politics → reforms…). */
const AREA_OF_SCREEN = Object.fromEntries(
  DELEGATION_IDS.map((id) => [DELEGATION_AREAS[id].screen, id]),
);

/** Saat durum satırında hızın adı (düğmelerin aria-label'ıyla aynı). */
const SPEED_NAMES = { 1: 'Normal speed', 2: 'Fast', 4: 'Very fast', 8: 'Fastest' };

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
 * kaydırır (animateTopChanges). Eşik gürültüyü keser: altın her hafta oynar,
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
  if (key === 'gold') return `${sign}${abs >= 10000 ? `${(abs / 1000).toFixed(1)}K` : Math.round(abs)}`;
  if (key === 'stab' || key === 'ws') return `${sign}${Math.round(abs)}%`;
  if (key === 'inf' || key === 'ic') return `${sign}${abs.toFixed(1)}`;
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

function statCell(icon, label, value, attrs = '', cls = '', ring = null) {
  return `<span class="tb-gauge${cls ? ` ${cls}` : ''}" tabindex="0" ${attrs}>
      <span class="tb-socket">${ring ? ringSvg(ring.share, ring.tone) : ''}<span class="tb-ico">${icon}</span></span>
      <span class="tb-gv"><small>${label}</small><b>${value}</b></span>
    </span>`;
}

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
      divisions: $('divisions'),
      divisionsBody: $('divisions-body'),
      divisionsCount: $('divisions-count'),
      commandBar: $('command-bar'),
      commandTools: $('command-tools'),
      warBar: $('war-bar'),
    };
    this.screens = new Screens(game);
    this.buildRgoLegend();
    this.buildPopulationLegend();
    this.bind();
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
    // Ültimatomlar da çubukta durur: savaş henüz yok ama geri sayım var ve
    // seferberlik kararı bu pencerede verilir.
    const crises = world.nations.filter(
      (other) => other.alive && other.id !== me.id && inCrisis(world, me.id, other.id),
    );
    bar.classList.toggle('hidden', wars.length + crises.length === 0);
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
    const crisisChips = crises.map((other) => {
      const left = crisisLeft(world, me.id, other.id, this.game.turns.turn);
      return `<button class="war-chip crisis" data-crisis-target="${other.id}"
        title="Ultimatum: war with ${escapeHtml(other.name)} begins in ${left} weeks. Mobilize from the Military screen.">
        <span class="war-name">${glyph('hourglass', 'inline')} ${escapeHtml(other.name)}</span>
        <b class="war-score">${left}w</b>
      </button>`;
    }).join('');
    bar.innerHTML = crisisChips + wars.map((other) => {
      const score = warScore(world, me.id, other.id);
      const tone = score > 8 ? 'winning' : score < -8 ? 'losing' : 'even';
      // Bekleyen teklif menude kaybolmamali: savas kutucugu zaten ustte duruyor.
      const offered = this.game.hasPeaceOffer(me.id, other.id);
      return `<button class="war-chip ${tone}${offered ? ' offered' : ''}" data-war-target="${other.id}"
        title="${offered ? `${escapeHtml(other.name)} has proposed terms`
    : `Open peace talks with ${escapeHtml(other.name)}`}">
        <span class="war-name">${offered ? `${glyph('dove', 'inline')} ` : ''}${escapeHtml(other.name)}</span>
        <b class="war-score">${score >= 0 ? '+' : ''}${score}</b>
      </button>`;
    }).join('');
    for (const chip of bar.querySelectorAll('[data-war-target]')) {
      const id = Number(chip.dataset.warTarget);
      // Teklif bekleyen savasta masa degil, teklifin durdugu diplomasi ekrani acilir.
      chip.onclick = () => (this.game.hasPeaceOffer(me.id, id)
        ? this.screens.open('diplomacy')
        : this.screens.openPeaceTalks(id));
    }
    for (const chip of bar.querySelectorAll('[data-crisis-target]')) {
      chip.onclick = () => this.screens.open('military');
    }
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

    // Harita modları: sağ alt köşedeki düğme kümesi
    for (const btn of document.querySelectorAll('.mode-btn[data-mode]')) {
      btn.onclick = () => {
        game.renderer.setMapMode(btn.dataset.mode);
        for (const other of document.querySelectorAll('.mode-btn[data-mode]')) {
          other.classList.toggle('active', other === btn);
        }
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

    $('btn-save').onclick = () => {
      this.el.saveInfo.textContent = game.save() ? 'Game saved.' : 'Could not save (storage may be disabled).';
    };
    $('btn-load').onclick = () => {
      this.el.saveInfo.textContent = game.load() ? 'Game loaded.' : 'No compatible save found.';
      this.refreshSaveInfo();
    };

    for (const btn of document.querySelectorAll('.time-btn[data-speed]')) {
      btn.onclick = () => game.setSpeed(Number(btn.dataset.speed));
    }
    // Saat biriminin yuvarlak düğmesi Space'in aynısı: duraklatıkken oynatır.
    $('btn-pause').onclick = () => game.togglePause();
    this.bindKeys();
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
    game.on('save', () => this.refreshSaveInfo());
    // Gün tiki yalnız tarihi oynatır. Eskiden her gün tam onTurn koşuyordu:
    // hız 8'de saniyede 8 kez skorbord + ordu toplamı + üç innerHTML bloğu
    // (ölçüldü: tik başına ~1-2.4 ms + DOM çöpü). Haftalık kapanış zaten
    // 'turn'/'economy' olaylarıyla tam tazeliyor.
    game.on('clock', () => this.onDay());
    game.on('economy', () => this.onTurn());
    // Ekran düğmeleri (yasa, danışman, karar, olay kartı) SG ve altını anında harcar.
    game.on('politics', () => this.onTurn());
    // İnşaat/yatırım kararı hazineden ANINDA para düşer ama haftalık tik
    // gelene kadar üst çubuk eski rakamı gösteriyordu: oyuncu £220 sanıp
    // £0 ile karar veriyordu (kör beta B-006). Ekonomi ekranı bu olayı zaten
    // dinliyordu; üst çubuk dinlemiyordu.
    game.on('construction', () => this.onTurn());
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
      this.onTurn();
    });
    game.on('provinces', () => {
      if (game.selected) this.showTile(game.selected);
      this.onTurn();
    });
    game.on('selection', (units) => this.showSelection(units));
    game.on('command', () => this.showCommand());
    // AUTO anahtarı çevrilince künyenin ışığı hemen yanar/söner.
    game.on('delegation', () => this.syncTabAuto());
    game.on('units', () => {
      this.showTile(this.game.selected);
      this.onTurn();
    });
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
    // konumlandırıldığında sekme şeridinin üstüne biniyor ve Budget/Politics
    // sekmelerini kapatıyordu.
    const notify = document.getElementById('notify-stack');
    const apply = () => {
      const top = Math.round(header.getBoundingClientRect().height) + 16;
      screen.style.top = `${top}px`;
      screen.style.maxHeight = `calc(100vh - ${top}px - 12px)`;
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
        const openPanel = [this.el.settings, this.el.layers].find((panel) => panelOpen(panel));
        if (openPanel) {
          hidePanel(openPanel);
          return;
        }
        if (this.screens?.active) {
          this.screens.close();
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
    $('divisions-clear').onclick = () => {
      game.selectGeneral(null);
      game.selectUnits([]);
    };
    $('btn-offensive').onclick = () => {
      game.toggleOffensive();
      this.showCommand();
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

  /** Soldaki tumen listesi. Secim bosken gizlenir. */
  showSelection(units = this.game.selection) {
    const { el, game } = this;
    const me = game.world?.nations[game.turns.playerNation];
    const list = units ?? [];
    togglePanel(el.divisions, list.length > 0);
    if (!me) return;

    if (list.length) {
      el.divisionsCount.textContent =
        `${list.length} ${list.length === 1 ? 'division' : 'divisions'} selected`;
      el.divisionsBody.innerHTML = list.map((unit) => {
        const general = generalOfArmy(me, unit);
        // Denizdeki tumen SAVASAMAZ ve konvoy tuketir — bu iki gercek
        // ekranda hic soylenmiyordu (survey: SURFACE karari).
        const state = unit.embarked ? 'at sea — cannot fight, consumes convoys'
          : unit.battleId ? 'in battle'
            : (unit.retreatUntil ?? 0) > game.turns.turn ? 'retreating'
              : (unit.attackReadyAt ?? 0) > game.turns.turn ? 'reorganizing'
                : isMoving(unit) ? `marching (${unit.path.length} left)`
                  : 'holding';
        return `<div class="division-row">
          <button class="division-main" data-focus-unit="${unit.id}">
            <span class="unit-badge" style="background:${me.color}">${unit.type.glyph}</span>
            <span class="division-text">
              <b>${regimentCount(unit)}× ${escapeHtml(unit.type.name)} · ${formatPopulation(menUnderArms(unit))} men</b>
              <small>${state} · STR ${Math.round(strengthRatio(unit) * 100)}% · ORG ${Math.round(organizationOf(unit))}%
                · ${general ? escapeHtml(general.name) : 'no commander'}</small>
            </span>
          </button>
        </div>`;
      }).join('');

      for (const btn of el.divisionsBody.querySelectorAll('[data-focus-unit]')) {
        btn.onclick = () => {
          const unit = game.world.units.find((u) => u.id === Number(btn.dataset.focusUnit));
          if (!unit) return;
          game.camera.centerOn(unit.tile.x, unit.tile.y);
          game.selected = unit.tile;
          game.emit('select', unit.tile);
          game.requestRender();
        };
      }
    }
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
    const generals = officersOf(me, BRANCH.ARMY);
    const active = game.activeGeneral;
    const selected = game.selection.length;

    el.commandBar.innerHTML = `${generals.map((general) => {
    const size = commandSize(general);
    const hint = `${general.name} - skill ${general.skill} - ${size} divisions`
      + ` (left click selects the command, right click transfers ${selected} selected)`;
    // PORTRE YUVANIN KENDISIDIR. 58px'lik kutuda portre + ad + yildiz alt
    // alta durunca resme 24px kaliyordu ve yuz kaybolup pirinc bir noktaya
    // donuyordu (olculdu). Resim kutuyu kaplar, ad ve yildiz uzerine binen
    // koyu seritte okunur — HOI4'un komutan portresi kalibi.
    return `<button class="command-slot has-art ${active?.id === general.id ? 'active' : ''}"
        data-general="${general.id}" title="${escapeHtml(hint)}">
        <span class="portrait">${subayPortresi(general)}</span>
        <span class="command-name">
          <b>${escapeHtml(general.name.split(' ')[0])}</b>
          <small>${'★'.repeat(general.skill)} · ${size}</small>
        </span>
      </button>`;
  }).join('')}
    <button class="command-slot empty" data-new-command="1"
      title="Assign the selected divisions to a commander">
      <span class="portrait">+</span><b>Assign</b></button>`;

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
    }

    for (const btn of el.commandBar.querySelectorAll('[data-general]')) {
      const general = generalById(me, Number(btn.dataset.general));
      btn.onclick = () => game.selectGeneral(general);
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
    if (create) create.onclick = () => this.openGeneralPicker(game.selection);
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
      ? `Autosave · ${info.seed} · ${gameDate(info.turn)}`
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
      if (Math.abs(delta) < Number(cell.dataset.eps || 0) || delta === 0) continue;
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
      const ic = me.economy?.ic ?? { total: 0, civil: 0, military: 0 };
      const people = me.economy?.population ?? 0;
      const recruits = nationManpower(world, me.id);
      this.el.macroStats.innerHTML = `<span class="tb-minis">${miniCell(emblemArt('people', 'xs'), 'People',
        formatPopulation(people), `data-macro="population" ${track('pop', people, people * 0.01)}`, 'macro-live')
        + miniCell(emblemArt('soldiers', 'xs'), 'Army', formatPopulation(army), `data-tip="army" ${track('army', army, army * 0.03 + 1)}`)
        + miniCell(emblemArt('recruits', 'xs'), 'Recruits', formatPopulation(recruits), `data-tip="manpower" ${track('mp', recruits, recruits * 0.05 + 1)}`)
        + miniCell(emblemArt('factory', 'xs'), 'IC', `${ic.total.toFixed(1)}<em class="stat-flow">${ic.military.toFixed(1)}${glyph('swords', 'inline')}</em>`,
          `data-macro="ic" data-tip="ic" ${track('ic', ic.total, 0.2)}`, 'macro-live')}</span>`
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
    if (!this.game.selected) this.clearSheet();
    this.game.perf?.add('ui.hud', performance.now() - t0);
  }

  /**
   * Veri kipi haftalık tazelenir: renk simülasyondan gelir (huzursuzluk,
   * işçi, şöhret, savaş) ve kip açıkken hafta kapanınca eskir. Nüfus kipi de
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
      html = '<header><b>Industry</b><small>factory levels by state, every nation</small></header>'
        + chip(rampColor(INDUSTRY_RAMP, 0), 'None')
        + [[1000, '1K'], [10000, '10K'], [100000, '100K+']]
          .map(([workers, label]) => chip(
            rampColor(INDUSTRY_RAMP, 0.08 + 0.92 * (Math.log10(workers) - 3) / 2.3), label,
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
   * künyesi yanar (styles.css §5 .is-auto); eşleme DELEGATION_AREAS.screen
   * alanından okunur, elle yazılmış ikinci bir tablo tutulmaz.
   */
  syncTabAuto() {
    const me = this.game.world?.nations[this.game.turns.playerNation];
    for (const btn of document.querySelectorAll('#tab-bar button[data-screen]')) {
      const area = AREA_OF_SCREEN[btn.dataset.screen];
      btn.classList.toggle('is-auto', Boolean(me?.alive && area && isDelegated(me, area)));
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
      body.innerHTML = this.unitBlockHtml(lead) + this.actionsHtml(tile, { armyOnly: true });
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
    const title = water ? tile.terrain.name : (nation ? nation.fullName : 'Unclaimed Territory');
    const sub = water
      ? `${tile.terrain.navigable ? 'Navigable water' : 'Impassable water'} · ${tile.q}, ${tile.r}`
      : `${tile.terrain.name} · ${tile.q}, ${tile.r}${tile.coastal ? ' · coast' : ''}`;

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
      const family = world.cultures[tile.culture].family;
      if (family) stats.push(['Language', family]);
    }
    // Fethin bedeli karede görünsün: işgal süresi ve verim kaybı.
    if (nation && tile.culture >= 0) {
      const held = (world.turn ?? 0) - (tile.heldSince ?? 0);
      const eff = tileEfficiency(tile, nation, world.turn ?? 0);
      const acceptedCulture = tile.culture === nation.culture
        || nation.accepted?.includes(tile.culture);
      if (isOccupied(tile)) stats.push(['Status', `occupied by ${controller?.name ?? '?'}`]);
      else if (eff === 0) stats.push(['Status', `postwar integration (${OCCUPATION_TURNS - held} weeks)`]);
      else if (eff < 1) stats.push(['Status', `foreign culture −${Math.round((1 - eff) * 100)}%`]);
      else if (acceptedCulture && tile.culture !== nation.culture) {
        stats.push(['Status', 'accepted culture']);
      }
      // HUZURSUZLUK. "foreign culture −30%" bir ceza etiketiydi; halkın ne
      // yaptığını söylemiyordu. Artık satır bir cümle: kaç, neden, ne zaman
      // patlar (bkz. culture.js unrestBreakdown).
      const cluster = world.provinces?.[tile.provinceId];
      const unrest = cluster?.econ?.unrest ?? 0;
      if (cluster?.econ && unrest >= 0.5) {
        // Isyan artik halkin HAREKETIDIR (movements.js): kumenin sayaci yok.
        const rebels = foreignShareOf(cluster, nation) >= CULTURE.REVOLT_FOREIGN_MIN
          ? rebelCultureOf(cluster, nation) : null;
        const movement = rebels != null ? nation.movements?.[rebels] : null;
        const parts = unrestBreakdown(world, cluster, nation, {
          occupied: 0, turn: world.turn ?? 0,
        });
        const why = [
          parts.culture > 0.5 ? `${Math.round(parts.foreign * 100)}% not accepted` : null,
          parts.conquest > 0.5 ? 'recent conquest' : null,
          parts.war > 0.5 ? 'war weariness' : null,
          parts.backlash > 0.3 ? 'nationalist backlash' : null,
        ].filter(Boolean).join(', ');
        stats.push(['Unrest', `${unrest.toFixed(1)}/10${why ? ` · ${why}` : ''}`
          + (movement?.progress > 0.5
            ? ` · ${world.cultures?.[rebels]?.name ?? 'their'} movement ${Math.round(movement.progress)}%`
              + ` (${stageOf(movement.progress).name})`
            : '')]);
      }
    }
    if (nation) stats.push(['Nation Size', `${nation.provinces ?? 0} states`]);
    // STATE KARTI (HOI4 modeli: küme = state, hex = province). Ekonomi not
    // satırlarına dökülünce hiyerarşisiz bir metin yığını oluyordu; kart
    // kaynağı, kalkınmayı, binaları ve uyumu simgeyle tek bakışta verir.
    let stateHtml = '';
    if (tile.province) {
      const econ = tile.province;
      const area = world.provinces?.[tile.provinceId];
      const deposits = area ? depositsOf(area) : [];
      const levels = buildingLevels(econ);
      const slots = buildingSlots(econ);
      const built = BUILDING_IDS.filter((id) => (econ.buildings?.[id] ?? 0) > 0);
      stats.unshift(['Population', formatPopulation(econ.population)]);
      stateHtml = `<div class="pv-state"${area ? tipAttr('state', area.id) : ''}>
        <div class="pv-state-res">${deposits.map((line) => `<span${tipAttr('resource', line.id)}>${resourceArt(line.id, 'sm')}<b>${escapeHtml(RESOURCES[line.id].name)}</b><small>×${line.size.toFixed(1)}</small></span>`).join('')}
          ${area ? `<span class="pv-fert"><small>Fertility</small><b>${Math.round(fertilityOf(area) * 100)}%</b></span>` : ''}</div>
        <div class="pv-state-row"><small>Development</small>${kitPips(econ.development, DEVELOPMENT_MAX)}<b>${econ.development}</b><em>${levels}/${slots} slots</em></div>
        <div class="pv-state-blds">${built.length ? built.map((id) => `<span${tipAttr('building', id)}>${buildingArt(id, 'sm')}<i>${econ.buildings[id]}</i></span>`).join('') : '<small class="k-dim">No buildings</small>'}</div>
        <div class="pv-state-row"><small>Compliance</small>${kitMeter((econ.control ?? 0) / 100, { tone: econ.core === false ? 'warn' : 'pos', wide: true })}<b>${Math.round(econ.control)}%</b>${econ.core === false ? `<em class="neg">counts at ${Math.round((econ.status ?? 0) * 100)}%</em>` : '<em>core</em>'}</div>
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
      // Çekirdek dışı toprak: vergi, asker ve sanayi uyum oranında gelir.
      if (cluster.owner >= 0 && cluster.econ?.core === false) {
        stats.unshift(['Territory', 'non-core: yields by compliance']);
      }
      const hexes = cluster.tileIdx.length;
      stats.unshift(['State', `${cluster.name} · ${hexes} ${hexes === 1 ? 'province' : 'provinces'}`]);
    }

    const unitBlock = this.unitBlockHtml(tile.unit);

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
    const language = take('Language');
    const size = take('Nation Size');
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
    const notes = stats.map(([k, v]) => `<span class="pv-note"><small>${k}</small>${escapeHtml(String(v))}</span>`).join('');

    body.innerHTML = unitBlock + this.actionsHtml(tile) + `
      <div class="province-view">
        <div class="tile-head">
          ${emblem}
          <div>
            <div class="tile-title">${escapeHtml(title)}</div>
            <div class="tile-sub">${escapeHtml(sub)}</div>
          </div>
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

        <div class="pv-lines">
          ${line('State', province)}
          ${culture == null ? '' : `<span class="pv-line" data-tip="culture" tabindex="0">
            <small>Culture</small><b>${escapeHtml(String(culture))}</b></span>`}
          ${line('Language', language)}
          ${migration ? line('Migration', migration) : ''}
          ${line('Nation', size)}
        </div>
      </div>`;

    this.bindActions();
  }

  /** Ordu karti: tip, mevcut, STR/ORG, bilesim, dagitma. */
  unitBlockHtml(unit) {
    if (!unit) return '';
    const world = this.game.world;
    return `
      <div class="unit-row">
        <span class="unit-badge" style="background:${world.nations[unit.nationId].color}">${unit.type.glyph}</span>
        <div style="flex:1;min-width:0">
          <div class="tile-title">${regimentCount(unit)}-regiment Army${unit.nationId === this.game.turns.playerNation ? '' : ' (enemy)'}${
  this.game.selection.length > 1 ? `<small class="tile-more"> · ${this.game.selection.length} divisions selected, showing the first</small>` : ''}</div>
          <div class="tile-sub">${formatPopulation(menUnderArms(unit))} men · STR ${Math.round(strengthRatio(unit) * 100)}% · ORG ${Math.round(organizationOf(unit))}% · speed ${speedOf(unit)}${isMoving(unit) ? ` · MARCHING (${unit.path.length} left)` : ''}${unit.battleId ? ' · IN BATTLE' : ''}${(unit.retreatUntil ?? 0) > this.game.turns.turn ? ' · RETREATING' : ''}</div>
          <div class="army-composition">${Object.entries(unit.regiments?.reduce((out, regiment) => {
            out[regiment.typeId] = (out[regiment.typeId] ?? 0) + 1;
            return out;
          }, {}) ?? { [unit.type.id]: 1 }).map(([id, count]) => `${count}× ${UNIT_TYPES[id].name}`).join(' · ')}</div>
          <div class="hp-bar"><i style="width:${Math.max(0, (unit.hp / maxHpOf(unit)) * 100)}%"></i></div>
        </div>
        ${unit.nationId === this.game.turns.playerNation ? `<button class="unit-disband"
          data-disband="${unit.id}" ${unit.battleId ? 'disabled' : ''}
          title="${unit.battleId ? 'A division in battle cannot be disbanded.'
    : 'Disband this army. Survivors walk home: their manpower returns to the provinces that raised them, and the upkeep stops. The dead do not come back.'}"
          >Disband</button>` : ''}
      </div>`;
  }

  /**
   * Karede yapılabilecek eylemler: şehirde birim al, orduya emir ver.
   * `armyOnly`: ordu seçiliyken yalnız ordunun eylemleri (komutan, cephe,
   * emir); karenin şehir/diplomasi/toplanma satırları düşer.
   */
  actionsHtml(tile, { armyOnly = false } = {}) {
    const { game } = this;
    const me = game.world.nations[game.turns.playerNation];
    const rows = [];

    if (!armyOnly && tile.city && tile.city.nationId === game.turns.playerNation) {
      const city = tile.city;
      const buttons = Object.entries(UNIT_COSTS).filter(
        // Gemi ancak kıyı şehrinde üretilebilir.
        ([id]) => UNIT_TYPES[id].domain !== 'sea' || tile.coastal,
      ).map(([id, cost]) => {
        const disabled = canAfford(me, cost) && canRecruit(game.world, me, id) ? '' : 'disabled';
        // Alay artik siparistir: kac hafta egitildigi dugmede yazmali, yoksa
        // oyuncu tikladiktan sonra haritada birim arar (bkz. recruitment.js).
        return `<button class="action" data-buy="${id}" ${disabled}
          title="Ordered into training; the full order book with reasons is on the Military screen.">${UNIT_TYPES[id].name} · ${formatCost(cost)} · ${equipmentCostLabel(id)} · ${trainingWeeks(id)}w</button>`;
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
    if (!armyOnly && foreign >= 0 && game.world.nations[foreign].alive) {
      const other = game.world.nations[foreign];
      const war = atWar(game.world, foreign, game.turns.playerNation);
      const crisis = crisisLeft(game.world, foreign, game.turns.playerNation, game.turns.turn);
      const rec = relation(game.world, foreign, game.turns.playerNation);
      const locked = war && game.turns.turn - rec.since < MIN_WAR_TURNS;
      const truce = truceLeft(game.world, foreign, game.turns.playerNation, game.turns.turn);
      const state = war ? 'at war'
        : crisis ? `war in ${crisis} weeks`
          : truce ? `truce (${truce} turns)` : 'at peace';
      rows.push(`<div class="action-row">
        <div class="k">${escapeHtml(other.name)} — ${state}</div>
        <button class="action wide" data-dossier="${foreign}">Open ${escapeHtml(other.name)} Dossier</button>
        ${war
    ? `<button class="action wide" data-peace="${foreign}" ${locked ? 'disabled' : ''}>Offer Peace${locked ? ` (${MIN_WAR_TURNS - (game.turns.turn - rec.since)} weeks)` : ''}</button>`
    : crisis
      ? `<button class="action wide" disabled title="The ultimatum runs out in ${crisis} weeks; mobilize from the Military screen.">Ultimatum (${crisis} weeks)</button>`
      : `<button class="action wide${this.warConfirm === foreign ? ' confirming' : ''}" data-war="${foreign}" ${truce ? 'disabled' : ''}>${
        this.warConfirm === foreign
          ? `Click again to declare war: ${ULTIMATUM_WEEKS}-week ultimatum, infamy for every state taken`
          : `Declare War${truce ? ` (${truce} turns)` : ''}`}</button>`}
      </div>`);
    }

    // Secili ordunun komutani ve cephesi. Ordu kipinde karenin ilk birimi
    // degil SECILI ordu esas alinir: yigindaki baska tumen paneli ele gecirmesin.
    const army = armyOnly && game.selectedUnit ? game.selectedUnit
      : tile.unit && tile.unit.nationId === game.turns.playerNation ? tile.unit : null;
    if (army) {
      rows.push(this.commanderRow(me, army));
      rows.push(this.frontRow(me, army));
    }

    // Toplanma noktasi: yeni kurulan alaylar cikis province'inden buraya yurur.
    if (!armyOnly && tile.owner === game.turns.playerNation && tile.terrain.passable) {
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

    // Ordu emri: uzun yürüyüş devam eder; savaş ve geri çekilme otomatik çözülür.
    // AUTO/HOLD ILK KEZ ERISILEBILIR: orders.js bastan beri devretme katmani
    // olarak duruyordu (CLAUDE.md'nin cekirdek mobil kurali) ama hicbir dugme
    // ORDER.AUTO/HOLD gondermiyordu — katman olu UI'ydi. Secili TUM tumenlere
    // uygulanir; donanma icin ozellikle degerli (filonun baska devir yolu yok).
    const own = army;
    if (own) {
      const label = ORDER_LABELS[own.order?.type];
      const selectedCount = Math.max(1, game.selection.length);
      rows.push(`<div class="action-row">
        <div class="k">army orders — ${own.battleId ? 'fighting'
    : (own.retreatUntil ?? 0) > game.turns.turn ? 'retreating'
      : (own.attackReadyAt ?? 0) > game.turns.turn ? 'reorganizing'
        : label ?? 'awaiting destination'}</div>
        <button class="action" data-order="${ORDER.AUTO}"
          title="Delegate the ${selectedCount} selected unit(s) to the AI: they pick targets and fight on their own until you cancel.">Delegate (AUTO)</button>
        <button class="action" data-order="${ORDER.HOLD}"
          title="Hold position: the selected unit(s) stand fast and leave the next-idle cycle.">Hold</button>
        ${own.order
    ? '<button class="action" data-order="clear">Cancel Orders</button>'
    : ''}
      </div>`);
    }

    return rows.join('');
  }

  /** Ordunun komutan satiri. */
  commanderRow(me, army) {
    const general = generalOfArmy(me, army);
    if (!general) {
      return `<div class="action-row">
        <div class="k">commander — none assigned</div>
        <button class="action wide" data-generals="${army.id}">Appoint Commander</button>
      </div>`;
    }
    const traits = general.traits
      .map((id) => `${traitArt(id)} ${escapeHtml(TRAITS[id].name)}`).join(' · ') || 'no traits';
    const stance = aggressionInfo(general.aggression);
    return `<div class="action-row">
      <div class="k">commander — ${escapeHtml(general.name)} · skill ${general.skill}/${MAX_SKILL}
        · ${commandSize(general)} divisions · ${stance.label}</div>
      <div class="general-traits">${traits}</div>
      <button class="action" data-generals="${army.id}">Change</button>
      <button class="action" data-unassign="${general.id}">Dismiss</button>
    </div>`;
  }

  /** Ordunun komutasindan turetilen cephe ve plan durumu. */
  frontRow(me, army) {
    const general = generalOfArmy(me, army);
    if (!general) {
      return `<div class="action-row">
        <div class="k">front — unassigned</div>
        <span class="order-help">Assign a commander; the front is derived from the border automatically.</span>
      </div>`;
    }
    const front = frontTilesOf(this.game.world, general);
    const ready = Math.round((general.planning ?? 0) * 100);
    const attack = general.stance === 'advance';
    const target = general.target == null
      ? 'all active borders'
      : this.game.world.nations[general.target]?.name ?? 'unknown nation';
    // Saldiri temposu GORUNUR olsun: aggression kadansi manuel taarruzu da
    // kitliyordu ve hicbir yer soylemiyordu (olculdu — sahte-yokluk hissi).
    const nextAssault = Math.max(0, (general.nextAssaultAt ?? 0) - this.game.turns.turn);
    const cadence = nextAssault > 0 ? ` · next assault in ${nextAssault}w` : '';
    return `<div class="action-row">
      <div class="k">front — ${attack ? 'advancing' : 'holding'} against ${escapeHtml(target)} ·
        ${front.length} provinces · ${commandSize(general)} divisions · planning ${ready}%${cadence}</div>
      <div class="meter"><i style="width:${ready}%"></i></div>
      <button class="action" data-command-stance="${general.id}"
        title="${attack ? 'Halting resets accumulated planning — the army regroups.' : 'Planning accumulated while holding carries into the offensive.'}">
        ${attack ? 'Halt Offensive' : 'Start Offensive'}</button>
    </div>`;
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
    const cards = officersOf(me, branch).map((general) => {
      const size = commandSize(general);
      const traits = general.traits
        .map((id) => `<em title="${escapeHtml(TRAITS[id].desc)}">${traitArt(id)} ${escapeHtml(TRAITS[id].name)}</em>`)
        .join('') || '<em>no traits</em>';
      return `<button class="general-card" data-pick-general="${general.id}">
        <b>${escapeHtml(general.name)}</b>
        <span class="general-skill">${'★'.repeat(general.skill)}${'☆'.repeat(MAX_SKILL - general.skill)}</span>
        <div class="general-traits">${traits}</div>
        <small>${size} divisions · ${general.battles ?? 0} battles</small>
      </button>`;
    }).join('') || '<p class="placeholder">No officers in the staff.</p>';

    this.el.sheetBody.innerHTML = `
      <div class="action-row">
        <div class="k">officer staff — assign ${list.length} selected division(s)</div>
        <button class="action" data-close-generals="1">Back</button>
      </div>
      <div class="general-grid">${cards}</div>
      <div class="action-row">
        <button class="action wide" data-train-general="1"
          ${canAfford(me, cost) ? '' : 'disabled'}>Train New Officer · ${formatCost(cost)}</button>
      </div>`;

    for (const btn of this.el.sheetBody.querySelectorAll('[data-pick-general]')) {
      btn.onclick = () => {
        assignDivisions(me, Number(btn.dataset.pickGeneral), list);
        game.activeGeneral = generalById(me, Number(btn.dataset.pickGeneral));
        refreshFront(game.world, game.activeGeneral);
        this.showTile(game.selected);
        this.showSelection();
        game.requestRender();
      };
    }
    const back = this.el.sheetBody.querySelector('[data-close-generals]');
    if (back) back.onclick = () => this.showTile(game.selected);
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
        if (history.length < 2) return null;
        const key = metric === 'ic' ? 'ic' : 'population';
        const delta = history.at(-1)[key] - history.at(-2)[key];
        const year = history.length >= 53 ? history.at(-1)[key] - history.at(-53)[key] : null;
        const fmt = metric === 'ic'
          ? (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`
          : (v) => `${v >= 0 ? '+' : '−'}${formatPopulation(Math.abs(v))}`;
        const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
        return [
          { label: 'Change vs last week', value: fmt(delta), tone: tone(delta) },
          year != null ? { label: 'Change over a year', value: fmt(year), tone: tone(year) } : null,
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
    // ORDUYU DAGIT. `disband()` zaten vardi ve hayatta kalanlarin insan gucunu
    // TOPLANDIKLARI province'lere iade ediyordu — eksik olan sadece dugmeydi,
    // yani oyuncunun elinde ordu kucultme araci hic yoktu (kullanici bildirimi).
    for (const btn of this.el.sheetBody.querySelectorAll('[data-disband]')) {
      btn.onclick = () => {
        // `dataset` her zaman DIZE dondurur; birim kimligi sayi olabilir.
        const unit = game.world.units.find((u) => String(u.id) === btn.dataset.disband);
        if (!unit || unit.battleId) return;
        if (disband(game, unit)) {
          // Seçimden de düşsün: yalnız selectedUnit sıfırlanınca ölü birlik
          // seçili listede kalıyor, sağ tık ona yürüyüş emri veriyordu.
          game.selectUnits(game.selection.filter((u) => u !== unit));
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
    for (const btn of this.el.sheetBody.querySelectorAll('[data-generals]')) {
      btn.onclick = () => {
        const army = game.world.units.find((u) => u.id === Number(btn.dataset.generals));
        if (army) this.openGeneralPicker([army]);
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
        for (const unit of units) {
          if (btn.dataset.order === 'clear') game.clearUnitOrder(unit);
          else game.setUnitOrder(unit, btn.dataset.order);
        }
        this.showTile(game.selected);
      };
    }
  }
}

/** Üst çubuk: oyunun bütün ekonomisi (TASARIM.md §1). */
function resourcesHtml(nation) {
  // TEK BAKIYE: kapanmış defterin net'i (treasury.closeWeek).
  const weekly = weeklyBalanceOf(nation);
  const flowClass = weekly < 0 ? 'res-neg' : weekly > 0 ? 'res-pos' : '';
  const flowValue = Math.abs(weekly) >= 1000 ? `${(weekly / 1000).toFixed(1)}K` : `${Math.round(weekly)}`;
  const flow = `<em class="stat-flow ${flowClass}">${weekly >= 0 ? '+' : ''}${flowValue}</em>`;
  const infamy = nation.infamy ?? 0;
  const infamyClass = infamy >= INFAMY_COALITION ? 'res-neg'
    : infamy >= INFAMY_COALITION * 0.6 ? 'res-warn' : '';
  const stability = Math.round((nation.stability ?? 0) * 100);
  const warSupport = Math.round((nation.warSupport ?? 0) * 100);
  const power = powerIncome(nation);
  const stabilityClass = stability < 30 ? 'res-neg' : stability < 45 ? 'res-warn' : '';
  // Sakin halka: yolunda giden gösterge pirinçtir, renk yalnız uyarıda çıkar.
  // Yeşil "her şey yolunda" çubuğun en bağıran öğesiydi (Kerem, 2026-10-08).
  const tone = (v, warn, bad) => (v < bad ? 'neg' : v < warn ? 'warn' : 'brass');
  const gold = nation.gold ?? 0;
  const cells = statCell(emblemArt('gold'), 'Gold', `${treasuryLabel(gold)}${flow}`,
    `data-tip="treasury" ${track('gold', gold, Math.max(25, Math.abs(gold) * 0.08))}`, 'tb-hero')
    + statCell(emblemArt('power'), 'Power', `${Math.round(nation.power ?? 0)}<em class="stat-flow res-pos">+${power.total.toFixed(1)}</em>`,
      `data-tip="power" ${track('power', nation.power ?? 0, 25)}`, '', { share: (nation.power ?? 0) / 500, tone: 'gold' })
    + statCell(emblemArt('stability'), 'Stability', `<span class="${stabilityClass}">${stability}%</span>`,
      `role="button" data-why="stability" data-tip="stability" ${track('stab', stability, 1)}`, 'stat-why',
      { share: stability / 100, tone: tone(stability, 45, 30) })
    + statCell(emblemArt('war_support'), 'War Sup.', `${warSupport}%`, `data-tip="warsupport" ${track('ws', warSupport, 1)}`, '',
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

/** Hazine: altı haneye kadar ayraçlı tam sayı, üstü K/M. */
function treasuryLabel(value) {
  const n = Math.round(value ?? 0);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e3).toFixed(0)}K`;
  return grouped(n);
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

/** Binlik ayraçlı tam sayı: 3847 → 3,847. */
function grouped(value) {
  return Math.round(value ?? 0).toLocaleString('en-US');
}

export function gameDate(turn, day = 0) {
  const date = new Date(Date.UTC(1836, 0, 1));
  // Hafta sistemin adımı, gün ise saatin adımı: tarih gün gün ilerler.
  //
  // `day || (turn-1)*7` DEGIL, ikisinin BUYUGU. Eski hali `day` sifirdan
  // farkli olur olmaz tur sayacini tamamen devre disi birakiyordu ve
  // `game.clock` kayda girmedigi icin (save.js) yuklemeden sonra day 0'dan,
  // turn 305'ten basliyordu: oyuncu oynat'a bastigi ilk saniyede day 1 olunca
  // takvim 2 OCAK 1836'ya cokuyor ve oturumun sonuna kadar orada kaliyordu.
  // Tur her zaman bir TABAN verir; gun yalnizca hafta icini ilerletir.
  date.setUTCDate(date.getUTCDate() + Math.max(0, day, (turn - 1) * 7));
  return date.toLocaleDateString('en-GB', {
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
