// SAĞ PANEL — donanma (deniz haritası açıkken ya da haritada bir filo seçiliyken).
//
// Kerem: donanma "eğlenceli ama kanser olmayan" olsun; 2026-11-23: "gemi kısmı
// galiba full rework yiyecek". Oynanarak ölçülen sorunlar (NAVY1, 1536×864):
// panelin içinde iki ayrı kaydırma çubuğu, deniz listesi bir buçuk satıra
// sıkışıyordu; "filoyu oraya yolla" diye bir emir yoktu (High beş gemiden üçünü
// yolluyordu); haritadaki filo tıklanmıyordu; sessiz denize tıklamak katlı
// listede hiçbir şey göstermiyordu; savaşta kıyımız %89 ablukadayken bunun
// sebebi listenin dibindeydi.
//
// Yeni düzen tek bakışta dört soruyu cevaplar, yukarıdan aşağıya:
//   1. Savaş: kimle, güçler, kıyımız ve onların kıyısı (abluka) — tek şerit.
//   2. FİLOLAR: her filo nerede, ne yapıyor, gücü ne, emri ne (Auto / bir
//      denizi tut / limanda bekle), amirali kim. Böl, birleştir.
//   3. DENİZLER: ilgili denizler tek satır — hâkimiyet kimde, kaç gemi.
//      Satıra (ya da haritada denize) tıklamak denizin kartını açar: kim var,
//      ne etkiliyor, "Send <filo>" düğmeleri ve Auto'nun bu denizdeki ağırlığı.
//   4. Ticaret, tümenler, denizaltı; tersane (yeni gemi, hurda); son deniz olayı.
// Haritada: filonun sayacına tık = seç, sağ tık bir denize = emir (game.js).
//
// Panel sayı KURMAZ: hepsi navyView (navy.js) ve fleetForecast'ten gelir,
// cümleler navyText'te. Emirler orders.js'ten geçer (ev ödevi testi).

import {
  NAVY_PRIORITIES, NAVY_STEPS, SCRAP_REFUND, WITHDRAW_WEEKS, EVADE_RATIO, actionId, assignFleetAdmiral,
  dayMonth, fleetForecast, fleetShips, fleetsOf, mergeFleet, navalAction, navyView, scrapGroup,
  scrapObsolete, seaZoneMarks, setZonePriority, splitFleet, surfaceOf,
} from '../game/navy.js';
import { FLEET_ORDER, fleetsToAuto } from '../game/orders.js';
import { BRANCH, createGeneral, generalCost } from '../game/command.js';
import { pay } from '../game/cities.js';
import { subayPortresi } from './icons/subaylar.js';
import { linePriorityOf } from '../game/econ/industry.js';
import { laneCutsView } from '../game/seaLanes.js';
import { SHIP_CLASSES, UNIT_TYPES, shipClassOf } from '../game/units.js';
import { recruitBlockers, trainingQueue, weeksLeft } from '../game/recruitment.js';
import { destinationOf, etaWeeks } from '../game/movement.js';
import { isDelegated } from '../game/delegation.js';
import { dateOfTurn } from '../game/calendar.js';
import { glyph } from './icons/glyphs.js';
import { tipAttr } from './kit.js';
import { kitArt, navyArt } from './icons/art.js';
import { catAttr, BRANCH_CAT } from './catColors.js';
import { quietScroll } from './tooltip.js';
import { toLocal } from './uiScale.js';
import {
  BATTLE_RULE, BLOCKADE_RULE, TROOPS_RULE, forecastLine, forecastTip, memoLine, names, pct, plural, str1,
  strengthRule, whySentence,
} from './navyText.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const strip = (html) => String(html).replace(/<[^>]+>/g, '');
/** Donanma seçim grubunun kategorisi (komutan dalı "navy"): emaye rengi. */
const NAVY_CAT = catAttr(BRANCH_CAT.navy);

/** "12 Dec 1904": kartın tarihi (yıl dahil). */
function fullDate(turn) {
  const date = dateOfTurn(turn);
  return `${dayMonth(turn)} ${date.getUTCFullYear()}`;
}

/** Hâkimiyetin tonu: satırın kenar çizgisi ve çubuğu aynı rengi okur. */
function toneOf(row) {
  if (row.hostile > 0 && row.friendly > 0) return 'contested';
  if (row.hostile > 0) return 'enemy';
  if (row.friendly > 0) return 'ours';
  // 'empty' değil: styles.css'teki genel .empty kuralı (dolgu, ortalı metin)
  // satıra sızıyordu.
  return 'quiet';
}

/** DENİZLER bölümünün en çok satırı; sessizler ve fazlası tek düğmede açılır. */
const SEA_LINES = 6;

const MODE_LABEL = { auto: 'Auto', sea: 'Hold sea', port: 'Port' };

export class NavyDock {
  constructor(game) {
    this.game = game;
    this.focus = null;
    this.hoverZone = null;
    this.sea = null;          // açık deniz kartı (bölge kimliği)
    this.card = null;         // açık muharebe/kaçınma kartı
    this.picking = null;      // "Hold sea" seçimi açık filo
    this.seasOpen = false;
    this.confirmScrap = false;
    this.confirmTimer = 0;
    this.confirmKey = null;
    this.fleetOpen = false;
    this.wasOn = false;
    this.lastActionId = null;
    this.root = document.createElement('aside');
    this.root.className = 'navy-dock';
    this.root.id = 'navy-dock';
    this.root.setAttribute('aria-label', 'Navy');
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('pointerover', (event) => this.onOver(event));
    this.root.addEventListener('pointerleave', () => this.hover(null));
    this.root.addEventListener('change', (event) => this.onChange(event));
    for (const name of ['turn', 'mapmode', 'politics', 'units']) game.on?.(name, () => this.refresh());
    game.on?.('world', () => {
      this.sea = null;
      this.card = null;
      this.picking = null;
      game.selectFleet?.(null);
      this.refresh();
    });
    window.addEventListener('resize', () => this.fit());
    // Bildirim kartı (ui/notifications) deniz kaydını açar.
    game.on?.('navalReport', (id) => {
      this.card = id ?? null;
      this.sea = null;
      this.refresh();
    });
    // Haritada filo seçildi/bırakıldı: panel o filoyu öne alır (siyasi kipte de açılır).
    game.on?.('fleet', (id) => {
      this.picking = null;
      if (id != null) { this.card = null; this.sea = null; }
      this.setHoverZone(null);
      this.refresh();
      if (id != null) this.root.querySelector(`[data-nd-fleet="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    game.on?.('fleetOrder', ({ fleet, zone, mode }) => this.orderReceipt(fleet, zone, mode));
    // Deniz haritasında suya tıklamak: denizin kartını açar (son iki haftada
    // muharebe ya da kaçınma olduysa onun kartını).
    game.on?.('select', (tile) => this.onMapSelect(tile));
    // Esc: önce kart, sonra filo seçimi, sonra odak (yakalama evresinde:
    // HUD'ın Esc zinciri seçimi silmeden önce).
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape' || this.root.hidden) return;
      if (event.target?.closest?.('input, textarea, select')) return;
      if (this.card || this.sea != null) {
        this.card = null;
        this.sea = null;
      } else if (this.picking != null) {
        this.picking = null;
      } else if (this.game.selectedFleet != null) {
        this.game.selectFleet(null);
      } else if (this.focus != null) {
        this.focus = null;
      } else {
        return;
      }
      event.stopImmediatePropagation();
      event.preventDefault();
      this.refresh();
    }, true);
    this.refresh();
  }

  me() {
    const world = this.game.world;
    return world?.nations?.[this.game.turns?.playerNation] ?? null;
  }

  active() {
    return this.game.renderer?.mapMode === 'seas';
  }

  /** Panel deniz haritasında ya da bir filo seçiliyken açıktır. */
  shown() {
    return this.active() || this.game.selectedFleet != null;
  }

  view() {
    return navyView(this.game.world, this.me(), null, { pin: this.sea });
  }

  refresh() {
    const nation = this.me();
    const on = this.shown() && !!nation?.alive;
    this.root.hidden = !on;
    document.body.classList.toggle('navy-open', on);
    if (!on) {
      this.root.innerHTML = '';
      this.lastHtml = '';
      this.wasOn = false;
      this.mark(null);
      return;
    }
    if (!this.wasOn || this.nationId !== nation.id) {
      this.nationId = nation.id;
      this.wasOn = true;
    }
    const view = this.view();
    if (view.pinRefused) {
      this.flash(`${view.pinRefused.zone.name}: no water route from our ports — the fleet cannot reach it.`);
      this.sea = null;
    }
    // Aynı içerik yeniden yazılmaz; yazılırsa kaydırma korunur.
    const html = this.html(view);
    if (html !== this.lastHtml || !this.root.firstChild) {
      const keep = this.root.querySelector('.nd-body')?.scrollTop ?? 0;
      this.root.innerHTML = html;
      this.lastHtml = html;
      const box = this.root.querySelector('.nd-body');
      if (box) {
        quietScroll(box);
        if (keep) box.scrollTop = keep;
      }
    }
    this.mark(this.hoverZone);
    this.fit();
  }

  /**
   * Alt sınır harita kipleri şerididir: dar ekranda iki satıra iner ve CSS'in
   * sabit payını aşar (1366×768'de panelin altına biniyordu, ölçüldü).
   */
  fit() {
    if (this.root.hidden) return;
    // Taban yatayda çakışan en üst alt öğe: harita kipleri, bildirim tepsisi,
    // komuta rıhtımı. Yalnız kipler sayılınca 1366×768'de panel bildirim
    // zilini ve Assign kartının köşesini örtüyordu (ölçüldü).
    const me = this.root.getBoundingClientRect();
    let floor = window.innerHeight;
    for (const id of ['map-modes', 'notify-stack', 'command-dock']) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (r?.height && r.right > me.left && r.left < me.right && r.top > me.top) floor = Math.min(floor, r.top);
    }
    // Ölçüler pencere px'i, kök ise --ui ile yakınlaştırılmış: yazılan değer yerel px.
    this.root.style.maxHeight = `${Math.max(160, Math.floor(toLocal(floor - me.top) - 10))}px`;
  }

  /** Kısa onay (HUD'ın tek satırlık ipucu). */
  flash(text) {
    this.game.emit?.('navyOrder', { text });
  }

  // ------------------------------------------------------------- GÖVDE ---

  html(view) {
    const head = this.headHtml(view);
    if (this.card) {
      const card = this.cardHtml(view, this.card);
      if (card) return `${head}${card}`;
      this.card = null;
    }
    if (this.sea != null) {
      const card = this.seaCardHtml(view, this.sea);
      if (card) return `${head}${card}`;
      this.sea = null;
    }
    // Tek kaydırma alanı gövdedir (yalnız 1366×768 gibi kısa ekranda kayar);
    // içinde ayrıca kayan kutu yok (Kerem: "daracık alan, sinir bozucu").
    return `${head}<div class="nd-body">${this.warHtml(view)}${this.fleetsHtml(view)}${this.seasHtml(view)}${this.tradeHtml(view)}${this.yardHtml(view)}</div>${this.lastHtml_(view)}`;
  }

  headHtml(view) {
    const tip = `Navy\n${view.total} warships: ${view.ready} ready to sail, ${view.atSea} on station, ${view.sailing} under way, ${view.inPort} in port${view.repairing ? ` (${view.repairing} repairing)` : ''}${view.withdrawn ? `, ${view.withdrawn} withdrawn` : ''}.\n`
      + `Strength ${str1(view.strength)} (ready ${str1(view.readyStrength)}) — ${strengthRule(view)}`
      + `${view.classes.length ? `\n${view.classes.map((c) => plural(c.count, c.name.toLowerCase(), c.plural)).join(', ')}. New hulls are ${view.current.plural}.` : ''}`
      + `${view.subs ? `\n${plural(view.subs, 'submarine')} (${view.subsAtSea} hunting).` : ''}`;
    return `<header class="nd-head">
        <span class="nd-title">Navy</span>
        <span class="nd-sum"${tipAttr({ text: tip })}><b>${view.total}</b> ${view.total === 1 ? 'warship' : 'warships'} · <b>${view.ready}</b> ready · strength <b>${str1(view.strength)}</b>${view.total ? ` · hull <b>${pct(view.hull)}</b>` : ''}${view.subs ? ` · U×${view.subs}` : ''}</span>
        <button class="k-btn sm nd-close" type="button" data-nd-close aria-label="Close the naval panel"${tipAttr({ text: this.active() ? 'Close the naval map (M)' : 'Close the naval panel (Esc)' })}>Close <kbd>${this.active() ? 'M' : 'Esc'}</kbd></button>
      </header>`;
  }

  /**
   * SAVAŞ ŞERİDİ: düşman filoları ve iki kıyının ablukası. Abluka eskiden
   * TRADE bölümündeydi; savaşta oyuncunun ilk görmesi gereken sayıydı.
   */
  warHtml(view) {
    if (!view.atWar) {
      return '<section class="nd-war peace"><span class="nd-sec">At peace</span><span class="nd-war-sum">No enemy fleets. Auto fleets keep a watch on the home seas.</span></section>';
    }
    if (!view.enemies.length) {
      return '<section class="nd-war"><span class="nd-sec">At war</span><span class="nd-war-sum">No enemy has a coast our fleet can reach: the war is fought on land.</span></section>';
    }
    const world = this.game.world;
    const scale = Math.max(view.strength, view.enemyStrength, 1e-9);
    const shown = view.enemies.slice(0, 3);
    const more = view.enemies.slice(3);
    const cells = shown.map((enemy) => {
      const classes = enemy.classes.map((c) => plural(c.count, c.name.toLowerCase(), c.plural)).join(', ');
      const tip = `${enemy.name} — ${plural(enemy.ships, 'warship')}${classes ? ` (${classes})` : ''}, ${enemy.inPort} in port.\nStrength ${str1(enemy.strength)} (ours ${str1(view.strength)}).\n${enemy.name}'s coast is ${pct(enemy.coastBlockade)} blockaded.\nClick: show its main home sea.`;
      return `<button class="nd-enemy" type="button" data-nd-enemy="${enemy.mainSea ?? ''}"${tipAttr({ text: tip })}><b>${esc(enemy.name)}</b><span>${plural(enemy.ships, 'ship')}</span><span class="v">${str1(enemy.strength)}</span><i class="nd-ebar"><i style="width:${(enemy.strength / scale * 100).toFixed(1)}%"></i></i></button>`;
    }).join('');
    const extra = more.length
      ? `<span class="nd-more"${tipAttr({ text: more.map((e) => `${e.name}: ${plural(e.ships, 'ship')}, ${str1(e.strength)}`).join('\n') })}>+${more.length}</span>` : '';
    const ratio = view.enemyStrength > 0 ? view.strength / view.enemyStrength : Infinity;
    const tone = ratio >= 1.1 ? 'good' : ratio < 0.9 ? 'bad' : 'warn';
    // İki kıyı: bizimkinin ablukası (en ağır deniz ve tutan) ve bizim ablukamız.
    const blockers = view.trade.blockers;
    const usLine = view.trade.blockade > 0.01 && blockers.length
      ? `<button class="nd-coast bad" type="button" data-nd-sea="${blockers[0].zone.id}"${tipAttr({ text: `Our coast blockaded\n${BLOCKADE_RULE}\nClick: open ${blockers[0].zone.name}.` })}>Our coast −${pct(view.trade.blockade)} · ${esc(names(world, blockers[0].by) || 'the enemy')} holds ${esc(blockers[0].zone.name)}</button>`
      : `<span class="nd-coast good"${tipAttr({ text: `Our coast\nNo enemy fleet holds a sea off our coast.\n${BLOCKADE_RULE}` })}>Our coast open</span>`;
    const ours = view.ourBlockades.map((b) => `${esc(b.name)} −${pct(b.national)}`);
    const themTip = view.ourBlockades.length
      ? `Our blockade\n${view.ourBlockades.map((b) => `${b.seas.map((s) => `${s.zone.name}: ${pct(s.share)} of ${b.name}'s ${plural(s.coast, 'coastal state')} there`).join('\n')}\n${b.name}'s sea trade with partners it does not border loses ${pct(b.national)}.`).join('\n\n')}`
      : 'Our blockade\nNo enemy coast is held: send a fleet to a sea where an enemy has a coast.';
    const themLine = `<span class="nd-coast ${ours.length ? 'good' : 'dim'}"${tipAttr({ text: themTip })}>${ours.length ? `We blockade ${ours.join(', ')}` : 'No enemy coast blockaded'}</span>`;
    return `<section class="nd-war">
        <div class="nd-war-cells"><span class="nd-sec">At war</span>${cells}${extra}<span class="nd-ratio ${tone}"${tipAttr({ text: `Enemy fleets ${str1(view.enemyStrength)} against our ${str1(view.strength)}.` })}>${Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'} : 1</span></div>
        <div class="nd-coasts">${usLine}${themLine}</div>
      </section>`;
  }

  // ------------------------------------------------------------ FİLOLAR ---

  /**
   * FİLOLAR: filo başına kart. Varsayılan tek filo Auto'dadır (YZ'nin kuralı):
   * oyuncu hiçbir şey yapmadan donanma çalışır; emir vermek isterse filoya tıklar.
   */
  fleetsHtml(view) {
    const me = this.me();
    const admirals = view.admirals;
    const cost = Math.round(generalCost(me).ic);
    const create = `<button class="k-btn xs" type="button" data-nd-newadm${tipAttr({ text: `Create admiral\nTrains a new admiral for ${cost} IC from the development fund. Each addition to the staff costs more. Assign him to a fleet below; on Auto he takes the busiest sea.` })}>+ Admiral · ${cost} IC</button>`;
    const anyOrder = view.fleets.some((fleet) => fleet.order.mode !== 'auto');
    const toAuto = view.fleets.length > 1 || anyOrder
      ? `<button class="k-btn xs" type="button" data-nd-allauto${anyOrder ? '' : ' disabled'}${tipAttr({ text: 'All fleets to Auto\nThe admiralty takes every fleet back: home waters in peace; in war the shared home seas, the enemy coast when our fleet is at least 0.8 of his, escorts where U-boats sink our cargo, and a sea held by an enemy fleet only when our ready fleet is a third stronger.' })}>All to Auto</button>` : '';
    const hint = this.game.selectedFleet != null
      ? `<div class="nd-hint">${glyph('advance', 'ctl')}<span><b>${esc(view.fleets.find((f) => f.id === this.game.selectedFleet)?.name ?? 'Fleet')}</b>: <b>right-click a sea</b> or coast to send it · Esc cancels</span></div>`
      : '';
    if (!view.total) {
      return `<section class="nd-fleets"><div class="nd-sec-head"><h4 class="nd-sec">Fleets</h4>${create}</div><p class="nd-empty">No warships yet. ${this.buildButton('WARSHIP', 'Build warship')} — they join the Home Fleet on Auto.</p></section>`;
    }
    const cards = view.fleets.map((fleet) => this.fleetCard(view, fleet, admirals)).join('');
    return `<section class="nd-fleets">
        <div class="nd-sec-head"><h4 class="nd-sec">Fleets${hint ? '' : ' <small>click one on the map, right-click a sea to send it</small>'}</h4>${toAuto}${create}</div>
        ${hint}${cards}
      </section>`;
  }

  fleetCard(view, fleet, admirals) {
    const selected = this.game.selectedFleet === fleet.id;
    const classes = fleet.classes.map((c) => `${c.count} ${c.count === 1 ? c.name.toLowerCase() : c.plural}`).join(', ');
    const scale = Math.max(view.strength, 1e-9);
    const where = this.fleetWhere(view, fleet);
    const mode = fleet.order.mode;
    const modes = ['auto', 'sea', 'port'].map((id) => {
      const on = mode === id;
      const label = MODE_LABEL[id];
      const tip = {
        auto: 'Auto\nThe admiralty decides where these ships sail, by the same rule the AI uses: home waters in peace, the decisive seas in war. It never sails into a sea where the enemy is clearly stronger.',
        sea: `Hold a sea\nEvery ready ship of ${fleet.name} sails to one sea and holds it: control there blockades the enemy coast, covers our troops at sea and escorts the trade lanes.\nClick, then right-click the sea on the map (or pick it from the list).${mode === 'sea' && fleet.target ? `\nNow: ${fleet.target.name}.` : ''}`,
        port: 'Port\nThe fleet stays in port as a reserve (fleet in being): it neither fights nor blockades, and repairs.',
      }[id];
      return `<button class="k-seg-b${on ? ' on' : ''}" type="button" data-nd-mode="${fleet.id}:${id}"${NAVY_CAT}${tipAttr({ text: tip })}>${esc(label)}</button>`;
    }).join('');
    const picker = this.picking === fleet.id ? this.seaPicker(view, fleet) : '';
    const others = view.fleets.filter((f) => f.id !== fleet.id && !f.virtual);
    const merge = others.length && !fleet.virtual
      ? `<select class="nd-sel" data-nd-merge="${fleet.id}"${tipAttr({ text: `Merge\nAll ships of ${fleet.name} join another fleet and take its order.` })}><option value="">Merge…</option>${others.map((f) => `<option value="${f.id}">into ${esc(f.name)}</option>`).join('')}</select>` : '';
    const split = fleet.count > 1
      ? `<button class="k-btn xs" type="button" data-nd-split="${fleet.id}"${tipAttr({ text: `Split\nHalf of ${fleet.name} becomes a new fleet with the same order: nothing sails until you give it one. Ships in the same place stay together.` })}>Split</button>` : '';
    const adm = fleet.admiral;
    const admSelect = admirals.length
      ? `<select class="nd-sel" data-nd-fadm="${fleet.id}"${tipAttr({ text: 'Admiral\nAuto: the admiralty sends each free admiral to the busiest sea. Pick one to keep him with this fleet wherever it sails (+6% per skill in battle).' })}><option value="">Adm: Auto</option>${admirals.map((a) => `<option value="${a.id}"${adm?.id === a.id ? ' selected' : ''}>${esc(a.name.split(' ').pop())} · ${a.skill}★${a.fleetPin != null && a.fleetPin !== fleet.id ? ' (other fleet)' : ''}</option>`).join('')}</select>` : '';
    const face = adm ? `<span class="nd-fface"${tipAttr({ text: `Admiral ${adm.name}\nSkill ${adm.skill}${adm.seaZone != null ? ` · commands in ${this.seaName(adm.seaZone)}` : ' · no fleet at sea'}.` })}>${subayPortresi(adm)}</span>` : '';
    const hulls = fleet.ships.map((ship) => `${ship.name} — ${shipClassOf(ship).name.toLowerCase()}, hull ${pct(ship.hp)}`).join('\n');
    return `<div class="nd-fcard ${mode}${selected ? ' selected' : ''}" data-nd-fleet="${fleet.id}"${where.zone != null ? ` data-nd-hz="${where.zone}"` : ''}>
        <div class="nd-fc-head">
          <button class="nd-fc-name" type="button" data-nd-pick="${fleet.id}"${tipAttr({ text: `${fleet.name}\n${selected ? 'Selected: right-click a sea on the map to send it.' : 'Click: select it (then right-click a sea on the map) and show it on the map.'}` })}>${esc(fleet.name)}</button>
          <span class="nd-fc-ships"${tipAttr({ text: `${fleet.name} — ${plural(fleet.count, 'ship')}\n${hulls}` })}><b>${fleet.count}</b> ${fleet.count === 1 ? 'ship' : 'ships'}${classes ? ` · ${esc(classes)}` : ''}</span>
          <span class="nd-fc-str"${tipAttr({ text: `Strength ${str1(fleet.strength)} (ready ${str1(fleet.readyStrength)}), hull ${pct(fleet.hull)}.\n${strengthRule(view)}` })}><i class="nd-sbar"><i style="width:${(fleet.strength / scale * 100).toFixed(1)}%"></i></i><b>${str1(fleet.strength)}</b></span>
        </div>
        <div class="nd-fc-where ${where.tone}"${where.tip ? tipAttr({ text: where.tip }) : ''}><i class="nd-glyph" aria-hidden="true">${where.art}</i>${where.html}</div>
        <div class="nd-fc-ctl"><span class="k-seg nd-modes">${modes}</span>${face}${admSelect}${split}${merge}</div>
        ${picker}
      </div>`;
  }

  /** Filonun hâli tek satırda: nerede, ne yapıyor, ne etkiliyor (gruplardan). */
  fleetWhere(view, fleet) {
    const world = this.game.world;
    const groups = fleet.groups;
    const main = groups[0] ?? null;
    const rest = groups.slice(1);
    const extra = rest.length ? `<span class="dim"> · +${rest.map((g) => `${g.ships.length} ${{
      station: `at ${g.zone?.name ?? 'sea'}`, underway: `sailing to ${g.zone?.name ?? 'sea'}`, returning: 'returning',
      repairing: 'repairing', withdrawn: 'withdrawn', idle: 'in port',
    }[g.kind] ?? g.kind}`).join(', ')}</span>` : '';
    let art = navyArt('port');
    let tone = '';
    let html = '';
    let zone = null;
    let tip = '';
    if (!main) return { art, tone, html: '<span class="dim">no ships</span>', zone, tip };
    const row = main.row;
    switch (main.kind) {
      case 'station': {
        zone = main.zone?.id ?? null;
        art = navyArt('sea_control');
        const blockading = (row?.blockading ?? []).filter((b) => b.share > 0.01)
          .map((b) => `blockading ${esc(world.nations[b.nation]?.name ?? '?')} ${pct(b.share)}`);
        let doing = 'holds the sea';
        tone = 'good';
        if (blockading.length) { doing = blockading.join(', '); art = navyArt('blockade'); }
        else if (row?.hostile > 0) { doing = `contesting: ${str1(row.friendly)} vs ${str1(row.hostile)}`; tone = 'warn'; }
        else if (row?.why?.code === 'escort' || row?.raidedShare > 0.01) doing = 'escorting the trade lanes';
        if (row?.ourBlockade > 0.01 && !(row?.hostile > 0)) doing += ` · lifts our blockade`;
        const hull = main.hull < 0.85 ? ` · hull ${pct(main.hull)}` : '';
        html = `<button class="nd-place" type="button" data-nd-sea="${zone}">${esc(main.zone?.name ?? '')}</button><span>${doing}${hull}</span>`;
        tip = `${main.zone?.name} — ${plural(main.ships.length, 'ship')} on station.${row ? `\nControl ${row.hostile > 0 ? pct(row.control) : '100%'}: ours ${str1(row.friendly)} vs enemy ${str1(row.hostile)}.` : ''}\nClick the sea: open its card.`;
        break;
      }
      case 'underway':
        zone = main.zone?.id ?? null;
        art = glyph('advance', 'ctl');
        tone = 'warn';
        html = `<span>→ </span><button class="nd-place" type="button" data-nd-sea="${zone}">${esc(main.zone?.name ?? '')}</button><span>${main.assembling ? `assembling · enter together ${dayMonth(main.eta)}` : `arrives ${dayMonth(main.eta)} (${main.weeks <= 0 ? 'this week' : `${main.weeks} wk`})`}</span>`;
        break;
      case 'returning':
        art = glyph('return', 'ctl');
        html = `<span>returning to port · ${dayMonth(main.eta)} (${main.weeks} wk)</span>`;
        break;
      case 'repairing':
        art = navyArt('repair');
        tone = main.stalled ? 'bad' : '';
        html = main.stalled
          ? '<span class="bad">repairing STALLED: no ships equipment — raise the Ships line (Factories)</span>'
          : `<span>repairing in port · hull ${pct(main.hull)} · ready ~${dayMonth(main.readyAt)}</span>`;
        break;
      case 'withdrawn': {
        art = navyArt('withdrawal');
        tone = 'bad';
        const why = main.why === 'refused' ? 'refused battle' : main.why === 'beaten' ? 'beaten' : 'withdrew';
        html = `<span>${why}${main.zone ? ` in ${esc(main.zone.name)}` : ''} · in port until ${dayMonth(main.until)}${fleet.order.mode === 'sea' ? ', then sails again' : ''}</span>`;
        tip = `${WITHDRAW_WEEKS} weeks in port after a lost battle or a refusal.${fleet.order.mode === 'sea' ? `\nThe order stays: on ${dayMonth(main.until)} the fleet sails back to ${fleet.target?.name ?? 'its sea'}. A fleet less than half as strong as the enemy there refuses battle again.` : ''}`;
        break;
      }
      case 'idle':
      default:
        art = navyArt('port');
        html = `<span>${fleet.order.mode === 'port' ? 'in port — reserve (fleet in being)' : fleet.order.mode === 'sea' ? 'in port' : esc(this.idleText(view))}</span>`;
        break;
    }
    // Emrin bekleyen hâli ana satırı alır (öncelik: yol yok > toplanma > kalkış);
    // gemilerin şimdiki yeri ipucunda kalır.
    const target = fleet.target;
    const now = strip(html);
    if (fleet.stuck && target) {
      art = navyArt('port');
      tone = 'bad';
      html = `<span>no water route from our ports to ${esc(target.name)} — pick another sea</span>`;
      tip = [now, tip].filter(Boolean).join('\n');
    } else if (fleet.regroup && target) {
      const mend = groups.find((g) => g.kind === 'repairing');
      art = navyArt('repair');
      tone = 'warn';
      html = `<span>regrouping: waits for ${plural(fleet.mending, 'ship')} under repair${mend ? ` (~${dayMonth(mend.readyAt)})` : ''}, then enters ${esc(target.name)}</span>`;
      tip = [now, tip, 'A fleet enters a sea the enemy holds only as a whole: its ready ships wait in port until the damaged ones are repaired. Split the fleet to send the ready ships alone.'].filter(Boolean).join('\n');
    } else if (fleet.sending && fleet.order.mode === 'sea' && target && main.zone?.id !== target.id) {
      art = glyph('advance', 'ctl');
      tone = 'warn';
      zone = target.id;
      html = `<span>→ </span><button class="nd-place" type="button" data-nd-sea="${target.id}">${esc(target.name)}</button><span>~${fleet.weeks} wk</span>`;
      tip = [`Sails at the end of the week; the last ship arrives in ~${fleet.weeks} wk.`, `Now: ${now}`, tip].filter(Boolean).join('\n');
    }
    if (rest.length) tip = [tip, `Also ${strip(extra).replace(/^ · /, '')}.`].filter(Boolean).join('\n');
    // Emrin denizinde düşman varsa öngörü satırın sonundadır: kötü oran kırmızı,
    // oyuncu emri "kaybedeceği" bir denize verdiğini muharebeden önce görür.
    let odds = '';
    const fc = fleet.forecast;
    if (fc && fc.theirs > 0 && fc.reach) {
      const ratio = fc.ours / fc.theirs;
      const word = { refuse: 'will refuse battle', drive: 'enemy will flee', unfavourable: 'unfavourable', even: 'even', favourable: 'favourable', none: 'none ready' }[fc.verdict] ?? '';
      const cls = ['refuse', 'unfavourable', 'none'].includes(fc.verdict) ? 'bad' : fc.verdict === 'even' ? 'warn' : 'good';
      odds = ` <span class="${cls}">· ${ratio.toFixed(1)} : 1 ${word}</span>`;
      tip = [tip, forecastTip(fc)].filter(Boolean).join('\n\n');
    }
    return { art, tone, html: `${html}${odds}${odds ? '' : extra}`, zone, tip };
  }

  /** Limanda boşta bekleyen Auto gemilerinin sebebi. */
  idleText(view) {
    const idle = view.idle;
    if (!idle) return 'in port, ready';
    if (idle.why === 'next-week') return 'in port — Auto sails them next week';
    if (idle.why === 'all-off') return 'in port — every sea is Off for Auto';
    if (idle.why === 'fleet-in-being') {
      const sea = idle.seas[0];
      return sea ? `in port — Auto waits: the enemy in ${sea.zone.name} (${str1(sea.there)}) needs ${str1(sea.need)}` : 'in port — Auto waits (fleet in being)';
    }
    return 'in port — no sea within reach needs them';
  }

  /** "Hold sea": denizi listeden seçmek (haritada sağ tık da aynı emir). */
  seaPicker(view, fleet) {
    const rows = [...view.rows].sort((a, b) => (b.hostile > 0) - (a.hostile > 0) || b.blockading.length - a.blockading.length || b.home - a.home || a.zone.name.localeCompare(b.zone.name));
    const options = rows.map((row) => {
      const tag = row.hostile > 0 ? ` — enemy ${str1(row.hostile)}` : row.blockading.length ? ' — enemy coast' : row.home ? ' — home' : '';
      return `<option value="${row.zone.id}">${esc(row.zone.name)}${tag}</option>`;
    }).join('');
    return `<div class="nd-picker">${glyph('advance', 'ctl')}<span>Right-click a sea, or</span><select class="nd-sel" data-nd-hold="${fleet.id}"><option value="">pick a sea…</option>${options}</select></div>`;
  }

  // ------------------------------------------------------------ DENİZLER ---

  /** DENİZLER: tek satır deniz başına; tık kartı açar. Sessiz denizler katlıdır. */
  seasHtml(view) {
    const loud = view.rows.filter((row) => !row.quiet);
    const quiet = view.rows.filter((row) => row.quiet);
    let list = loud;
    let more = 0;
    if (!this.seasOpen && loud.length > SEA_LINES) {
      list = loud.slice(0, SEA_LINES - 1);
      more = loud.length - list.length;
    }
    const rows = list.map((row) => this.seaRowHtml(row));
    if (this.seasOpen) for (const row of quiet) rows.push(this.seaRowHtml(row));
    const hidden = more + (this.seasOpen ? 0 : quiet.length);
    if (hidden > 0 || this.seasOpen) {
      const label = this.seasOpen ? 'Fewer seas' : `+${hidden} more ${hidden === 1 ? 'sea' : 'seas'}${quiet.length && !more ? ' (quiet)' : ''}`;
      rows.push(`<button class="nd-more-seas" type="button" data-nd-seas${tipAttr({ text: this.seasOpen ? 'Fold the quiet seas.' : `Show every sea within reach: ${[...list.slice(SEA_LINES), ...quiet].map((r) => r.zone.name).slice(0, 12).join(', ')}${hidden > 12 ? '…' : ''}.` })}><i aria-hidden="true">${glyph(this.seasOpen ? 'chev-down' : 'chev-right', 'ctl')}</i><span>${label}</span></button>`);
    }
    if (!view.rows.length) rows.push('<p class="nd-empty">No sea within reach of our ports.</p>');
    return `<section class="nd-seas"><div class="nd-sec-head"><h4 class="nd-sec">Seas <small>click one (or any sea on the map) for its card</small></h4></div>${rows.join('')}</section>`;
  }

  seaRowHtml(row) {
    const world = this.game.world;
    const tone = toneOf(row);
    const enemyShips = row.enemyShips.reduce((sum, e) => sum + e.ships, 0);
    const label = row.hostile <= 0 ? (row.friendly > 0 ? 'ours' : '—') : row.friendly <= 0 ? 'lost' : pct(row.control);
    // Tek etiket (önem sırasıyla): adın yeri kalsın; hepsi denizin kartında.
    const tags = row.status?.state === 'held' ? '<em class="nd-tag enemy">closed</em>'
      : row.blockading.length ? '<em class="nd-tag enemy">enemy coast</em>'
        : row.home ? '<em class="nd-tag home">home</em>' : '';
    // Tek etki: en önemlisi (kıyımız, ablukamız, akın, düşman); fazlası kartta.
    let fx = '';
    if (row.ourBlockade > 0.01) fx = `<span class="bad">our coast here −${pct(row.ourBlockade)}</span>`;
    else if (row.blockading.some((b) => b.share > 0.01)) {
      const b = row.blockading.filter((x) => x.share > 0.01).sort((x, y) => y.share - x.share)[0];
      fx = `<span class="good">blockading ${esc(world.nations[b.nation]?.name ?? '?')} ${pct(b.share)}</span>`;
    } else if (row.raidedShare > 0.01) fx = `<span class="bad">U-boats: cargo −${pct(row.raidedShare)}</span>`;
    else if (row.pending > 0) fx = `<span class="warn">+${row.pending} next wk</span>`;
    const ships = enemyShips ? `<b>${row.present}</b><small>vs</small><b class="bad">${enemyShips}</b>` : `<b>${row.present}</b>`;
    const tip = `${row.zone.name}\nOurs ${str1(row.friendly)} (${plural(row.present, 'ship')}${row.sailing ? `, ${row.sailing} under way` : ''}) against ${str1(row.hostile)} enemy${enemyShips ? ` (${plural(enemyShips, 'ship')})` : ''}.\nClick: open the sea's card — who is there, what it does, and send a fleet.`;
    return `<button class="nd-sea ${tone}${this.focus === row.zone.id ? ' focus' : ''}" type="button" data-nd-sea="${row.zone.id}" data-nd-hz="${row.zone.id}"${tipAttr({ text: tip })}>
        <span class="nd-sea-name">${esc(row.zone.name)}</span>${tags}
        <span class="nd-sea-fx">${fx}</span>
        <span class="nd-ships">${ships}</span>
        <span class="nd-ctl ${row.friendly + row.hostile > 0 ? tone : 'quiet'}"><i style="width:${pct(row.friendly + row.hostile > 0 ? row.control : 0)}"></i></span>
        <b class="nd-ctlv${row.hostile <= 0 ? ' dim' : ''}">${label}</b>
      </button>`;
  }

  /**
   * DENİZ KARTI: kim var, ne etkiliyor, filoları buraya göndermenin öngörüsü
   * (Send düğmeleri) ve Auto'nun bu denizdeki ağırlığı (eski öncelik kademeleri:
   * yalnız Auto filolarını tartar, gemi göndermez).
   */
  seaCardHtml(view, zoneId) {
    const world = this.game.world;
    const me = this.me();
    const row = view.rows.find((r) => r.zone.id === zoneId);
    if (!row) return null;
    const zone = row.zone;
    const tone = toneOf(row);
    const enemyShips = row.enemyShips.reduce((sum, e) => sum + e.ships, 0);
    const verdict = row.hostile <= 0
      ? (row.friendly > 0 ? `Ours — ${plural(row.present, 'ship')} hold it` : 'Open sea — no warships at war with us')
      : row.friendly <= 0
        ? `Lost — ${esc(names(world, row.enemyShips.map((e) => e.nation)))} ${row.enemyShips.length === 1 ? 'holds' : 'hold'} it (${plural(enemyShips, 'ship')}, ${str1(row.hostile)})`
        : `Contested — we hold ${pct(row.control)} (${str1(row.friendly)} vs ${str1(row.hostile)})`;
    const tags = [
      row.home ? `<em class="nd-tag home"${tipAttr({ text: `Home waters\n${plural(row.ourCoast, 'coastal state')} of ours on this sea. Our warships fight 20% harder here.` })}>home</em>` : '',
      row.blockading.length ? `<em class="nd-tag enemy"${tipAttr({ text: 'Enemy coast\nA nation we are at war with has a coast on this sea: holding it blockades that coast.' })}>enemy coast</em>` : '',
      row.status?.state === 'held' ? `<em class="nd-tag enemy"${tipAttr({ text: 'Closed to our troops\nOver half of the warships here are the enemy\'s: our divisions cannot embark into it or sail through it.' })}>closed to troops</em>` : '',
    ].join('');
    const lines = [];
    for (const b of row.blockading) {
      const name = world.nations[b.nation]?.name ?? '?';
      lines.push(b.share > 0.01
        ? `<li class="good">Blockading ${esc(name)}: ${pct(b.share)} of its ${plural(b.coast, 'coastal state')} here.</li>`
        : `<li>${esc(name)}'s coast here (${plural(b.coast, 'state')}) is open: no fleet of ours holds the sea.</li>`);
    }
    if (row.ourBlockade > 0.01) lines.push(`<li class="bad">Our coast blockaded: ${pct(row.ourBlockade)} of our ${plural(row.ourCoast, 'coastal state')} here.</li>`);
    if (row.transportRisk > 0.005) lines.push(`<li class="bad">Our troops at sea here lose ${pct(row.transportRisk)} of their men a week.</li>`);
    if (row.raidedShare > 0.01) lines.push(`<li class="bad">${plural(row.enemySubs, 'enemy U-boat')} sink ${pct(row.raidedShare)} of our cargo passing here.</li>`);
    if (row.ourSubs) lines.push(`<li class="good">${plural(row.ourSubs, 'U-boat')} of ours hunting${row.raidingShare > 0.01 ? `: enemy cargo −${pct(row.raidingShare)}` : ''}.</li>`);
    for (const e of row.enemyShips) lines.push(`<li class="bad">${esc(world.nations[e.nation]?.name ?? '?')}: ${plural(e.ships, 'ship')}, strength ${str1(e.strength)}.</li>`);
    if (row.admiral) lines.push(`<li>Admiral ${esc(row.admiral.name)} (skill ${row.admiral.skill}) commands here.</li>`);
    if (row.memo) lines.push(`<li class="warn">${esc(memoLine(row.memo))}.</li>`);
    if (!lines.length) lines.push('<li class="dim">Quiet waters: no coast at war, no enemy, no U-boats.</li>');
    // Send: her filo için öngörü (aynı kural: kaçınma bandı, denk, üstün).
    const sends = view.fleets.filter((fleet) => fleet.count > 0).map((fleet) => {
      const here = fleet.order.mode === 'sea' && fleet.order.zone === zoneId;
      const there = fleet.ships.some((ship) => ship.at === zoneId);
      const ships = fleet.virtual ? surfaceOf(me) : fleetShips(me, fleet.id);
      const forecast = fleetForecast(world, me, ships, zoneId);
      const line = forecast.reach ? forecastLine(world, forecast) : null;
      const eta = Math.max(0, forecast.weeks);
      const note = !forecast.reach ? '<span class="bad">no ready ship can reach it</span>'
        : line ? `<span class="${line.tone}">${esc(line.text)}</span>`
          : `<span class="dim">${eta ? `~${eta} wk` : 'there now'} · ${str1(forecast.ours)} strength</span>`;
      const tip = forecast.theirs > 0 ? forecastTip(forecast) : `${fleet.name} to ${zone.name}: ${plural(forecast.ships, 'ready ship')}, ${eta ? `the last arrives in ~${eta} wk` : 'already there'}.`;
      return `<div class="nd-send">
          <button class="k-btn xs${here ? ' on' : ''}" type="button" data-nd-send="${fleet.id}:${zoneId}"${here || !forecast.reach ? ' disabled' : ''}${tipAttr({ text: `${here ? `${fleet.name} already holds ${zone.name}.` : `Send ${fleet.name}\nEvery ready ship sails to ${zone.name} and holds it until you give another order.`}\n\n${tip}` })}>${here ? `${esc(fleet.name)} ${there ? 'holds it' : 'ordered here'}` : `Send ${esc(fleet.name)}`}</button>${note}
        </div>`;
    }).join('');
    // Auto'nun ağırlığı (eski öncelikler): yalnız Auto filolarının bölüşümü.
    const auto = row.priority.mode !== 'manual';
    const current = linePriorityOf(auto ? row.weight : row.priority.weight);
    const autoWhy = whySentence(world, row.priority.mode === 'manual' ? row.why?.auto ?? null : row.why, zone.name);
    const steps = NAVY_STEPS.map((step) => {
      const level = NAVY_PRIORITIES.find((p) => p.id === step);
      const on = step === 'auto' ? auto : !auto && current.id === step;
      const at = auto && level && current.id === step;
      const tip = level
        ? { text: `${level.name} for Auto fleets on ${zone.name}\nThe admiralty splits the ships of Auto fleets by weight (Low 1, Normal 3, High 6). It does not touch a fleet with its own order — use Send for that.` }
        : { text: `${auto ? '' : 'Back to Auto\n'}${autoWhy}` };
      return `<button class="pl-pb${level ? '' : ' auto'}${on ? ' on' : ''}${at ? ' at' : ''}" type="button" data-nd-pri="${zone.id}:${step}"${tipAttr(tip)}>${level ? level.name : 'Auto'}</button>`;
    });
    const refusals = row.priority.mode === 'manual' && row.refusals.count
      ? `<p class="nd-card-note bad">Refused battle ${row.refusals.count}× here since ${dayMonth((row.refusals.first ?? row.refusals.last).turn)}.</p>` : '';
    return `<div class="nd-card nd-seacard">
        <div class="nd-card-nav">
          <button class="k-btn xs" type="button" data-nd-back>‹ Back</button>
          <div class="nd-card-title"><b>${esc(zone.name)}</b>${tags}</div>
          <button class="k-btn xs" type="button" data-nd-show="${zone.id}">Show on map</button>
        </div>
        <div class="nd-card-verdict ${tone === 'enemy' ? 'bad' : tone === 'contested' ? 'warn' : tone === 'ours' ? 'good' : ''}">${verdict}<span class="nd-ctl ${row.friendly + row.hostile > 0 ? tone : 'quiet'}"><i style="width:${pct(row.friendly + row.hostile > 0 ? row.control : 0)}"></i></span></div>
        <ul class="nd-card-list">${lines.join('')}</ul>
        <div class="nd-card-after"><h4 class="nd-sec">Send a fleet here</h4>${sends || '<p class="nd-card-note">No warships.</p>'}</div>
        <div class="nd-card-after"><h4 class="nd-sec"${tipAttr({ text: 'Admiralty weight\nOnly for fleets on Auto: how much of them the admiralty puts on this sea. Auto follows the rule in the tooltip of the Auto button.' })}>Auto fleets on this sea</h4>
          <span class="pl-pri nd-pri"${NAVY_CAT}>${steps[0]}<span class="pl-tiers">${steps.slice(1).join('')}</span></span>${refusals}
        </div>
      </div>`;
  }

  // -------------------------------------------------- TİCARET / TERSANE ---

  /** TİCARET VE TÜMENLER: yollarda kesilen ticaret, denizdeki tümenler, denizaltı. */
  tradeHtml(view) {
    const world = this.game.world;
    const me = this.me();
    const lines = [];
    const cuts = laneCutsView(world, me.id);
    if (cuts.length) {
      const top = cuts[0];
      const cause = top.cause[0];
      const partner = world.nations[top.partner]?.name ?? '?';
      const why = cause
        ? cause.kind === 'raid' ? `U-boats in ${this.seaName(cause.zone)}` : `${names(world, cause.by) || 'the enemy'} holds ${this.seaName(cause.zone)}`
        : 'enemy seas on the way';
      const trade = `trade with ${esc(partner)} −${pct(top.lostShare)}: ${esc(why)}${cuts.length > 1 ? ` · ${cuts.length - 1} more` : ''}`;
      const tradeTip = `Sea lanes\n${BLOCKADE_RULE}\nTrade between partners who do not border each other sails along the lanes on this map; an enemy-held sea on the way or U-boats on a lane sink the cargo that passes.${cuts.length ? `\n\nLanes cut now:\n${cuts.slice(0, 5).map((c) => `${world.nations[c.partner]?.name ?? '?'} −${pct(c.lostShare)} (${c.cause.map((x) => `${this.seaName(x.zone)}: ${x.kind === 'raid' ? 'U-boats' : 'held'} by ${names(world, x.by) || '?'}`).join('; ') || 'enemy seas'})`).join('\n')}` : ''}`;
      const worstZone = cuts[0]?.cause[0]?.zone ?? null;
      lines.push(this.tlHtml('Sea lanes', trade, 'warn', tradeTip, worstZone != null ? `data-nd-sea="${worstZone}"` : '', navyArt('convoy')));
    }
    const units = view.transports.reduce((sum, t) => sum + t.units.length, 0);
    let troops = 'none at sea';
    let troopTone = 'dim';
    if (units) {
      const first = view.transports[0];
      const lead = first.units[0];
      const target = lead.directive ? world.get(lead.directive.q, lead.directive.r) : destinationOf(lead);
      const where = target ? placeName(world, target) : null;
      const eta = etaWeeks(this.game, lead);
      const status = first.status.state === 'held'
        ? `<b class="bad">${esc(names(world, first.status.holders))} holds ${pct(first.status.share)}: −${pct(first.riskPerWeek)} men a week</b>`
        : first.status.state;
      troops = `${plural(units, 'division')} at sea · ${esc(first.zone.name)} (${status})${where ? ` → ${esc(where)}${eta ? ` ~${eta} wk` : ''}` : ''}${view.transports.length > 1 ? ` · ${view.transports.length - 1} more sea${view.transports.length === 2 ? '' : 's'}` : ''}`;
      troopTone = first.status.state === 'held' ? 'bad' : '';
    }
    const closed = view.atWar && view.closed.length
      ? ` · <span class="bad">closed: ${view.closed.map((c) => esc(c.zone.name)).join(', ')}</span>` : '';
    const troopRows = view.transports.map((t) => `${t.zone.name}: ${plural(t.units.length, 'division')} — ${t.status.state === 'held' ? `${names(world, t.status.holders)} holds ${pct(t.status.share)}, −${pct(t.riskPerWeek)} men a week` : t.status.state}`);
    // Söyleyecek bir şeyi olmayan satır gösterilmez (panel pencereye sığsın):
    // denizde tümen ya da kapalı deniz yoksa "Troops", denizaltı yoksa "U-boats".
    if (units || closed) {
      lines.push(this.tlHtml('Troops', `${troops}${closed}`, troopTone, `Troops at sea\n${troopRows.length ? `${troopRows.join('\n')}\n\n` : ''}${TROOPS_RULE}${view.closed.length ? '\nClosed seas are hatched on the map while an army is selected.' : ''}${units ? '\nClick: select them.' : ''}`, units ? 'data-nd-troops' : '', navyArt('landing')));
    }
    if (view.subs || view.rows.some((row) => row.raidedShare > 0.01 || row.enemySubs > 0)) lines.push(this.subsLine(view));
    return lines.length ? `<section class="nd-trade">${lines.join('')}</section>` : '';
  }

  tlHtml(label, value, tone, tip, attr = '', icon = '') {
    const tag = attr ? 'button' : 'div';
    return `<${tag} class="nd-tl${attr ? ' click' : ''}"${attr ? ` type="button" ${attr}` : ''}${tipAttr({ text: tip })}><span class="k">${icon}${esc(label)}</span><span class="v ${tone}">${value}</span></${tag}>`;
  }

  /** Denizaltı: tek satır (emir yok: tasarım gereği kendi başlarına giderler). */
  subsLine(view) {
    const world = this.game.world;
    const me = this.me();
    let text;
    if (!view.subs) {
      const era = recruitBlockers(this.game, me, 'SUBMARINE').find((b) => b.id === 'era');
      text = era ? `none — ${esc(era.text.replace(/^Requires /, '').replace(/\.$/, ''))} unlocks them` : 'none — build them in the shipyard';
    } else {
      const hunting = [];
      for (const [zoneId, here] of world.navyState?.subs ?? []) {
        if (here.has(me.id)) hunting.push({ zone: zoneId, ships: here.get(me.id).ships.length });
      }
      const best = view.rows.reduce((max, row) => Math.max(max, row.raidingShare ?? 0), 0);
      text = view.atWar
        ? `U×${view.subs} · ${hunting.reduce((s, h) => s + h.ships, 0)} hunting${hunting.length ? ` in ${esc(hunting.slice(0, 2).map((h) => this.seaName(h.zone)).join(', '))}${hunting.length > 2 ? '…' : ''}` : ''}${best > 0.01 ? ` · enemy cargo −${pct(best)}` : ''}`
        : `U×${view.subs} · in port (peace)`;
    }
    return this.tlHtml('U-boats', text, view.subs ? '' : 'dim', 'Submarines\nNo orders by design: in war they go by themselves where the enemy\'s trade lanes cross and his escorts are thin, and sink a share of the cargo that passes. Enemy warships in the same sea hunt them.', '', kitArt('submarine'));
  }

  /** Yeni gemi: Military ekranıyla aynı yol (buyUnit, Shift = 5). */
  buildButton(typeId, label) {
    const me = this.me();
    const blockers = recruitBlockers(this.game, me, typeId);
    const cost = UNIT_TYPES[typeId];
    const tip = blockers.length
      ? `${label}\nNot possible now:\n${blockers.map((b) => b.text).join('\n')}`
      : `${label}\n${cost?.manpower ?? '?'} men from a coastal state; ships equipment from the dockyards. Training queue like any regiment; new warships join the first fleet.\nShift-click: order 5.`;
    return `<button class="k-btn xs" type="button" data-nd-build="${typeId}"${blockers.length ? ' disabled aria-disabled="true"' : ''}${tipAttr({ text: tip })}>${label}</button>`;
  }

  /**
   * TERSANE: yeni gemi (her zaman görünür) ve gövde sınıfları (hurda). Gemi
   * gemi liste yok — hangi gövdenin gideceğini navy.scrapPicks seçer.
   */
  yardHtml(view) {
    const me = this.me();
    const button = (row, count) => {
      const key = `${row.group}:${count}`;
      const n = count === 'all' ? row.count : 1;
      const confirming = this.confirmKey === key;
      const what = n === 1 ? `one ${row.name.toLowerCase()}` : `all ${row.count} ${row.plural}`;
      return `<button class="k-btn xs${confirming ? ' confirm' : ''}" type="button" data-nd-scrapg="${key}"${tipAttr({ text: `Scrap ${what}\nShips in port go first, then the most damaged. The crew goes home, the upkeep stops and the yards take back ${Math.round(SCRAP_REFUND * 100)}% of the ships equipment.\nClick twice to confirm.` })}>${confirming ? `Confirm −${n}` : count === 'all' ? 'Scrap all' : 'Scrap 1'}</button>`;
    };
    const title = (row) => (row.count === 1 ? row.name : row.plural.charAt(0).toUpperCase() + row.plural.slice(1));
    const rows = view.fleet.map((row) => `<div class="nd-frow">
        <b>${row.count}</b><span>${esc(title(row))}${row.obsolete ? ' <em class="nd-tag">obsolete</em>' : ''}</span>
        <small>${row.inPort} in port · hull ${pct(row.hull)}${row.power ? ` · ${row.power} each` : ''}</small>
        <span class="nd-fbtn">${button(row, 1)}${row.count > 1 ? button(row, 'all') : ''}</span>
      </div>`).join('');
    const ratio = (cls) => Math.round(cls.power / view.current.power * 100);
    const oldest = view.classes[view.classes.length - 1];
    const scrap = view.obsolete
      ? `<button class="k-btn xs nd-scrap${this.confirmScrap ? ' confirm' : ''}" type="button" data-nd-scrap${tipAttr({ text: `Scrap obsolete ships\n${view.obsolete} of your warships are older than the ${view.current.name.toLowerCase()} you can now build: ${oldest ? `${oldest.plural} fight at ${ratio(oldest)}% of one` : 'they fight weaker'}, yet cost the same upkeep and crew. Scrapping sends the crews home and returns ${Math.round(SCRAP_REFUND * 100)}% of the ships equipment.\nClick twice to confirm.` })}>${this.confirmScrap ? `Confirm: scrap ${view.obsolete}` : `Scrap ${view.obsolete} obsolete`}</button>`
      : '';
    const queue = trainingQueue(me).filter((item) => UNIT_TYPES[item.typeId]?.domain === 'sea');
    const turn = this.game.world.turn ?? 0;
    const training = queue.length
      ? `<span class="nd-train"${tipAttr({ text: `In training: ${queue.map((item) => `${UNIT_TYPES[item.typeId]?.name ?? item.typeId} ready ${dayMonth(turn + weeksLeft(me, item))}`).join(', ')}.` })}>· ${queue.length} in training, first ${dayMonth(turn + weeksLeft(me, queue[0]))}${queue.some((item) => Object.keys(item.missing ?? {}).length) ? ' · <span class="bad">short of ships equipment</span>' : ''}</span>`
      : '';
    const auto = isDelegated(me, 'recruitment')
      ? `<span class="nd-train dim"${tipAttr({ text: 'Recruitment is on AUTO: the general staff also builds warships to its own target.' })}>· AUTO builds too</span>` : '';
    const hulls = view.fleet.reduce((sum, row) => sum + row.count, 0);
    const toggle = hulls
      ? `<button class="nd-yard-toggle" type="button" data-nd-yard${tipAttr({ text: `Hulls by class: scrap old or surplus ships (${plural(hulls, 'hull')}).` })}>${plural(hulls, 'hull')} · scrap ${glyph(this.fleetOpen ? 'chev-down' : 'chev-right', 'ctl')}</button>` : '';
    return `<section class="nd-yardline"><span class="k">${navyArt('port')}Shipyard</span>${this.buildButton('WARSHIP', 'Build warship')}${this.buildButton('SUBMARINE', 'Build submarine')}${toggle}${scrap}${training}${auto}</section>
      ${hulls && this.fleetOpen ? `<div class="nd-yard">${rows}</div>` : ''}`;
  }

  // ------------------------------------------------------- SON OLAYLAR ---

  /** LAST SEA ACTION: sabit yükseklik (jitter kuralı); iki son kayıt. */
  lastHtml_(view) {
    const actions = view.actions;
    const lines = actions.slice(0, 2).map((record) => `<button class="nd-act ${this.actionTone(record)}" type="button" data-nd-open="${esc(actionId(record))}">${esc(this.actionLine(record))}</button>`);
    while (lines.length < 2) lines.push(`<span class="nd-act dim">${lines.length ? '' : 'No sea battles or refusals in the last six months.'}</span>`);
    const older = actions.slice(2, 8).map((record) => this.actionLine(record)).join('\n');
    const fresh = actions[0] && actions[0].turn === (this.game.world.turn ?? 0) && actionId(actions[0]) !== this.lastActionId;
    if (actions[0]) this.lastActionId = actionId(actions[0]);
    return `<section class="nd-last${fresh ? ' fresh' : ''}"${older ? tipAttr({ text: `Earlier sea actions\n${older}` }) : ''}>
        <div class="nd-last-head"><h4 class="nd-sec">${navyArt('battle')}Last sea action${actions.length > 1 ? ` · ${actions.length} in six months` : ''}</h4>${actions.length ? `<button class="k-btn xs" type="button" data-nd-open="${esc(actionId(actions[0]))}">Open report</button>` : ''}</div>
        ${lines.join('')}
      </section>`;
  }

  actionTone(record) {
    const me = this.me()?.id;
    if (record.evaded) return record.sides[0].nations.includes(me) ? 'bad' : 'good';
    const mine = record.sides.findIndex((side) => side.nations.includes(me));
    return record.winner === mine ? 'good' : 'bad';
  }

  actionLine(record) {
    const world = this.game.world;
    const me = this.me()?.id;
    const sea = this.seaName(record.zone);
    if (record.evaded) {
      const [weak, strong] = record.sides;
      return weak.nations.includes(me)
        ? `${sea} · ${dayMonth(record.turn)} — no battle: our ${weak.ships} refused ${names(world, strong.nations)}'s ${strong.ships}`
        : `${sea} · ${dayMonth(record.turn)} — ${names(world, weak.nations)}'s ${weak.ships} refused our ${strong.ships}: the sea is ours`;
    }
    const mine = record.sides.findIndex((side) => side.nations.includes(me));
    const us = record.sides[mine];
    const them = record.sides[1 - mine];
    const won = record.winner === mine;
    const sunk = [
      them.sunk.length ? `sank ${them.sunk.map((s) => s.name).join(', ')}` : '',
      us.sunk.length ? `lost ${us.sunk.map((s) => s.name).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    return `${record.name} · ${dayMonth(record.turn)} — ${won ? 'victory' : 'defeat'} vs ${names(world, them.nations)}${sunk ? ` · ${sunk}` : ''}`;
  }

  // -------------------------------------------------------------- KART ---

  /** Muharebe ya da kaçınma kartı: panel gövdesinin yerine (§6.1). */
  cardHtml(view, id) {
    const world = this.game.world;
    const record = navalAction(world, id);
    if (!record) return null;
    const index = view.actions.findIndex((a) => actionId(a) === id);
    const earlier = index >= 0 && index < view.actions.length - 1 ? actionId(view.actions[index + 1]) : null;
    const later = index > 0 ? actionId(view.actions[index - 1]) : null;
    const sea = this.seaName(record.zone);
    const title = record.evaded ? `No battle in ${sea}` : record.name;
    const nav = `<div class="nd-card-nav">
        <button class="k-btn xs" type="button" data-nd-back>‹ Back</button>
        <div class="nd-card-title"><b>${navyArt(record.evaded ? 'withdrawal' : 'battle', 'sm')}${esc(title)}</b><small>${record.evaded ? '' : `${esc(sea)} · `}${fullDate(record.turn)}</small></div>
        <button class="k-btn xs" type="button" data-nd-step="${esc(earlier ?? '')}"${earlier ? '' : ' disabled'}>Earlier</button>
        <button class="k-btn xs" type="button" data-nd-step="${esc(later ?? '')}"${later ? '' : ' disabled'}>Later</button>
      </div>`;
    const body = record.evaded ? this.evasionCard(view, record) : this.battleCard(view, record);
    return `<div class="nd-card">${nav}${body}
        <div class="nd-card-foot"><span class="nd-rule"${tipAttr({ text: BATTLE_RULE })}>How sea battles work</span><button class="k-btn xs" type="button" data-nd-sea="${record.zone}">Open ${esc(sea)}</button><button class="k-btn xs" type="button" data-nd-show="${record.zone}">Show on map</button></div>
      </div>`;
  }

  battleCard(view, record) {
    const world = this.game.world;
    const me = this.me()?.id;
    let mine = record.sides.findIndex((side) => side.nations.includes(me));
    if (mine < 0) mine = 0;
    const us = record.sides[mine];
    const them = record.sides[1 - mine];
    const won = record.winner === mine;
    const until = dayMonth(record.turn + WITHDRAW_WEEKS);
    const loserName = names(world, (won ? them : us).nations);
    const verdict = won
      ? `Victory — ${esc(loserName)}'s fleet withdrew to port`
      : `Defeat — our squadron returned to port`;
    const scale = Math.max(us.before, them.before, 1e-9);
    const side = (s) => {
      const classes = (s.classes ?? []).map((c) => plural(c.count, SHIP_CLASSES[c.gen]?.name.toLowerCase() ?? 'ship', SHIP_CLASSES[c.gen]?.plural)).join(', ');
      const lost = s.hp && s.hp.before > 0 ? 1 - s.hp.after / s.hp.before : null;
      return `<div class="nd-cs">
          <b class="nd-cs-name">${esc(names(world, s.nations))}</b>
          <span>${plural(s.ships, 'ship')}${classes ? ` · ${esc(classes)}` : ''}</span>
          <span class="nd-cs-str">Strength ${str1(s.before)} → ${str1(s.after)}<i class="nd-sbar"><i class="lost" style="width:${(s.before / scale * 100).toFixed(1)}%"></i><i style="width:${(s.after / scale * 100).toFixed(1)}%"></i></i></span>
          <span>Hull lost ${lost != null ? pct(lost) : '—'}</span>
          <span>Sunk ${s.sunk.length ? esc(s.sunk.map((x) => x.name).join(', ')) : '—'}</span>
          <span>Damaged ${s.damaged ?? 0}${s.returned ? ` · ${s.returned} sent home for repair` : ''}</span>
        </div>`;
    };
    let why = '<p class="nd-card-note">Details were not recorded for this battle.</p>';
    if (us.factors && them.factors) {
      const a = us.factors;
      const b = them.factors;
      const mark = (x, y) => (x > y + 1e-6 ? ` ${glyph('up', 'ctl')}` : '');
      const adm = (f) => (f.admiral ? `${esc(f.admiral.name.split(' ').pop())}, skill ${f.admiral.skill} +${Math.round((f.admiral.mod - 1) * 100)}%` : 'none');
      const home = (f) => (f.home > 0.001 ? `+${Math.round(f.home * 20)}%` : '—');
      const rows = [
        ['Ship class (hull-weighted)', `×${a.cls.toFixed(2)}${mark(a.cls, b.cls)}`, `×${b.cls.toFixed(2)}${mark(b.cls, a.cls)}`],
        ['Naval technology', `×${a.naval.toFixed(2)}${mark(a.naval, b.naval)}`, `×${b.naval.toFixed(2)}${mark(b.naval, a.naval)}`],
        ['Home waters', `${home(a)}${mark(a.home, b.home)}`, `${home(b)}${mark(b.home, a.home)}`],
        ['Admiral', `${adm(a)}${mark(a.admiral?.mod ?? 1, b.admiral?.mod ?? 1)}`, `${adm(b)}${mark(b.admiral?.mod ?? 1, a.admiral?.mod ?? 1)}`],
      ];
      const ratio = mine === 0 ? record.ratio : 1 / record.ratio;
      why = `<table class="nd-why"><thead><tr><th>Why it went this way</th><th>${esc(names(world, us.nations))}</th><th>${esc(names(world, them.nations))}</th></tr></thead><tbody>
          ${rows.map(([k, x, y]) => `<tr><td>${k}</td><td>${x}</td><td>${y}</td></tr>`).join('')}
          <tr><td>Odds before the battle</td><td colspan="2">${Number.isFinite(ratio) ? ratio.toFixed(1) : '—'} : 1</td></tr>
        </tbody></table>`;
    }
    const now = view.rows.find((row) => row.zone.id === record.zone);
    const nowText = now
      ? `${this.seaName(record.zone)} now: ${now.hostile <= 0 ? (now.friendly > 0 ? 'we hold 100%' : 'no warships') : now.friendly <= 0 ? `${names(world, now.enemyShips.map((e) => e.nation))} ${now.enemyShips.length === 1 ? 'holds' : 'hold'} it` : `we hold ${pct(now.control)}`}${now.blockading.filter((x) => x.share > 0.01).map((x) => ` · blockading ${world.nations[x.nation]?.name ?? '?'} ${pct(x.share)}`).join('')}.`
      : '';
    return `<div class="nd-card-verdict ${won ? 'good' : 'bad'}">${verdict}</div>
      <div class="nd-card-sides">${side(us)}${side(them)}</div>
      ${why}
      <div class="nd-card-after"><h4 class="nd-sec">Aftermath</h4>
        <p>${won ? `${esc(loserName)}'s ships stay in port until ${until} (${WITHDRAW_WEEKS} weeks).` : `Our squadron stays in port until ${until} (${WITHDRAW_WEEKS} weeks).`}</p>
        ${nowText ? `<p>${esc(nowText)}</p>` : ''}
      </div>`;
  }

  evasionCard(view, record) {
    const world = this.game.world;
    const me = this.me();
    const [weak, strong] = record.sides;
    const weWithdrew = weak.nations.includes(me?.id);
    const until = dayMonth(record.until);
    const ratio = strong.before > 0 ? weak.before / strong.before : 0;
    const head = weWithdrew
      ? `Our squadron refused battle — in port until ${until}`
      : `${names(world, weak.nations)}'s fleet refused battle — ${this.seaName(record.zone)} is ours`;
    const vs = `<div class="nd-card-vs"><span><b>${esc(names(world, weak.nations))}</b> ${plural(weak.ships, 'ship')}${weWithdrew ? ` (${weak.sailing ? `${weak.sailing} still sailing` : 'none still sailing'})` : ''} · ${str1(weak.before)}</span><i>vs</i><span><b>${esc(names(world, strong.nations))}</b> ${plural(strong.ships, 'ship')} · ${str1(strong.before)}</span></div>`;
    const lines = [`${ratio.toFixed(2)} : 1 — a fleet less than half as strong as its enemy withdraws instead of fighting.`];
    if (weWithdrew) {
      lines.push(`To fight here the squadron needs ≥ ${str1(strong.before * EVADE_RATIO)}; to be favoured ≈ ${str1(strong.before * 1.1)}.`);
      const fleet = (fleetsOf(me) ?? []).find((f) => f.order?.mode === 'sea' && f.order.zone === record.zone);
      const manual = me?.navy?.zones?.[record.zone]?.mode === 'manual';
      if (fleet) {
        lines.push(`${fleet.name}'s order stays: it sails back to ${this.seaName(record.zone)} on ${until}. Merge another fleet into it, or set it to Auto.`);
      } else if (manual) {
        lines.push(`Your Auto weight stays: ${linePriorityOf(me.navy.zones[record.zone].weight).name} on ${this.seaName(record.zone)} — the ships sail again on ${until}.`);
      } else {
        const row = view.rows.find((r) => r.zone.id === record.zone);
        lines.push(row?.memo ? `Auto: ${memoLine(row.memo)}.` : 'Auto: the admiralty decides again each week.');
      }
    } else {
      lines.push(`${names(world, weak.nations)}'s ships cannot return before ${until}.`);
    }
    return `<div class="nd-card-verdict ${weWithdrew ? 'bad' : 'good'}">${esc(head)}</div>${vs}
      <div class="nd-card-after">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ İMLEÇ ---

  onOver(event) {
    const row = event.target.closest?.('[data-nd-hz]');
    const zone = row ? Number(row.dataset.ndHz) : null;
    this.hover(Number.isFinite(zone) ? zone : null);
  }

  hover(zoneId) {
    this.hoverZone = zoneId;
    this.mark(zoneId);
  }

  /** Bölgeyi haritada işaretler (seaLayer): üstünde durulan, yoksa açık kart, yoksa odak. */
  mark(zoneId) {
    const sea = this.game.renderer?.sea;
    if (!sea) return;
    const target = this.active() ? (zoneId ?? this.sea ?? this.focus) : null;
    if (sea.highlight === target) return;
    sea.highlight = target;
    this.game.requestRender?.();
  }

  /** Seçili filonun hedef halkası (imlecin altındaki deniz). */
  setHoverZone(zoneId) {
    const sea = this.game.renderer?.sea;
    if (!sea || sea.hoverZone === zoneId) return;
    sea.hoverZone = zoneId;
    this.game.requestRender?.();
  }

  // ------------------------------------------------------------ OLAYLAR ---

  onMapSelect(tile) {
    if (this.ownFocus) {
      this.ownFocus = false;
      return;
    }
    if (!this.active() || !tile?.terrain?.water || !(tile.seaZone >= 0)) return;
    const zoneId = tile.seaZone;
    this.focus = zoneId;
    const mark = seaZoneMarks(this.game.world, this.me()?.id ?? -1).get(zoneId);
    const recent = mark?.battle?.id ?? mark?.evaded?.id ?? null;
    this.card = recent;
    // Her deniz kartı açılır (eskiden katlı "sessiz" denize tık hiçbir şey göstermiyordu).
    this.sea = recent ? null : zoneId;
    this.refresh();
  }

  centerOn(zoneId) {
    const zone = this.game.world.seaZones?.zones?.[zoneId];
    const tile = zone ? this.game.world.tiles[zone.anchor] : null;
    if (tile) {
      this.ownFocus = true;
      this.game.focusTile?.(tile);
      this.ownFocus = false;
    }
    this.focus = zone?.id ?? null;
  }

  seaName(zoneId) {
    return this.game.world.seaZones?.zones?.[zoneId]?.name ?? 'the sea';
  }

  /** Filo emrinin tek cümlelik makbuzu (HUD): ne oldu, ne zaman, ne bekleniyor. */
  orderReceipt(fleetId, zoneId, mode) {
    const view = this.view();
    const fleet = view.fleets.find((f) => f.id === fleetId);
    this.picking = null;
    if (!fleet) { this.refresh(); return; }
    if (mode === FLEET_ORDER.SEA) {
      const row = view.rows.find((r) => r.zone.id === zoneId);
      const forecast = fleetForecast(this.game.world, this.me(), fleet.ships, zoneId);
      const line = forecast.reach ? forecastLine(this.game.world, forecast) : null;
      const going = fleet.ships.length && fleet.ships.every((ship) => ship.zone === zoneId);
      const sail = !forecast.reach ? 'no ready ship can reach it'
        : going && forecast.weeks > 0 ? `already on the way (~${forecast.weeks} wk)`
        : forecast.weeks > 0 ?`${plural(forecast.ships, 'ship')} ${forecast.ships === 1 ? 'sails' : 'sail'} at the end of the week (~${forecast.weeks} wk)` : 'already there';
      this.flash(`${fleet.name} → ${row?.zone.name ?? this.seaName(zoneId)}: ${sail}${line ? ` · ${line.text}` : ''}.`);
    } else if (mode === FLEET_ORDER.PORT) {
      this.flash(`${fleet.name}: back to port as a reserve.`);
    } else {
      this.flash(`${fleet.name}: on Auto — the admiralty decides each week.`);
    }
    this.refresh();
  }

  onChange(event) {
    const nation = this.me();
    if (!nation) return;
    const t = event.target;
    const hold = t.closest?.('[data-nd-hold]');
    if (hold && hold.value !== '') {
      this.game.orderFleet(Number(hold.dataset.ndHold), FLEET_ORDER.SEA, Number(hold.value));
      return;
    }
    const adm = t.closest?.('[data-nd-fadm]');
    if (adm) {
      const fleetId = this.realFleet(Number(adm.dataset.ndFadm));
      assignFleetAdmiral(nation, fleetId, adm.value === '' ? null : Number(adm.value));
      this.refresh();
      this.game.requestRender();
      return;
    }
    const merge = t.closest?.('[data-nd-merge]');
    if (merge && merge.value !== '') {
      const from = Number(merge.dataset.ndMerge);
      const into = Number(merge.value);
      const name = fleetsOf(nation)?.find((f) => f.id === into)?.name ?? 'the fleet';
      if (mergeFleet(nation, from, into)) {
        if (this.game.selectedFleet === from) this.game.selectFleet(into);
        this.flash(`Merged into ${name}: its order now applies to every ship.`);
      }
      this.game.renderer?.sea?.touchFleets?.();
      this.refresh();
      this.game.requestRender();
    }
  }

  /** Sanal filo (kimlik 0) ilk eylemde gerçek listeye çevrilir. */
  realFleet(fleetId) {
    if (fleetId !== 0) return fleetId;
    const id = this.game.orderFleet(0, FLEET_ORDER.AUTO);
    return id ?? fleetId;
  }

  onClick(event) {
    const nation = this.me();
    if (!nation) return;
    const t = event.target;
    if (t.closest?.('[data-nd-newadm]')) {
      if (!pay(nation, generalCost(nation))) {
        this.flash('The development fund cannot pay for another admiral yet.');
        return;
      }
      const admiral = createGeneral(this.game.world, nation, this.game.turns.rng, { branch: BRANCH.NAVY });
      this.game.turns?.addLog(`Admiral ${admiral.name} joined the staff.`, { kind: 'COMMANDER' });
      this.refresh();
      return;
    }
    const modeBtn = t.closest?.('[data-nd-mode]');
    if (modeBtn) {
      const [idText, mode] = modeBtn.dataset.ndMode.split(':');
      const fleetId = Number(idText);
      if (mode === 'sea') {
        // Deniz seçimi: filoyu seç (sağ tık haritada) ve listeyi aç.
        this.game.selectFleet(fleetId);
        this.picking = this.game.selectedFleet;
        this.refresh();
        return;
      }
      this.game.orderFleet(fleetId, mode);
      return;
    }
    const pick = t.closest?.('[data-nd-pick]');
    if (pick) {
      const fleetId = Number(pick.dataset.ndPick);
      const same = this.game.selectedFleet === fleetId;
      this.game.selectFleet(same ? null : fleetId);
      const card = this.root.querySelector(`[data-nd-fleet="${fleetId}"]`);
      const zone = card?.dataset.ndHz;
      if (!same && zone != null) this.centerOn(Number(zone));
      this.refresh();
      return;
    }
    const split = t.closest?.('[data-nd-split]');
    if (split) {
      const fleetId = this.realFleet(Number(split.dataset.ndSplit));
      const id = splitFleet(nation, fleetId);
      if (id != null) {
        const fleet = fleetsOf(nation).find((f) => f.id === id);
        this.flash(`${fleet.name} formed (${plural(fleetShips(nation, id).length, 'ship')}): select it and right-click a sea to send it.`);
        this.game.renderer?.sea?.touchFleets?.();
        this.game.selectFleet(id);
      }
      this.refresh();
      this.game.requestRender();
      return;
    }
    const send = t.closest?.('[data-nd-send]');
    if (send) {
      const [fleetText, zoneText] = send.dataset.ndSend.split(':');
      this.game.orderFleet(Number(fleetText), FLEET_ORDER.SEA, Number(zoneText));
      return;
    }
    if (t.closest?.('[data-nd-allauto]')) {
      const changed = fleetsToAuto(nation);
      this.game.renderer?.sea?.touchFleets?.();
      this.flash(changed ? `${plural(changed, 'fleet')} back on Auto — the admiralty re-plans at the end of the week.` : 'Every fleet is on Auto already.');
      this.refresh();
      this.game.requestRender();
      return;
    }
    const pri = t.closest?.('[data-nd-pri]');
    if (pri) {
      const [zoneText, step] = pri.dataset.ndPri.split(':');
      const zoneId = Number(zoneText);
      setZonePriority(nation, zoneId, step);
      const levelName = step === 'auto' ? 'Auto' : NAVY_PRIORITIES.find((p) => p.id === step)?.name ?? step;
      const row = this.view().rows.find((r) => r.zone.id === zoneId);
      this.flash(`${row?.zone.name ?? 'Sea'}: ${levelName} for Auto fleets — ${row ? `${plural(row.planned, 'ship')} planned there` : 'the admiralty re-plans'}.`);
      this.refresh();
      this.game.requestRender?.();
      return;
    }
    if (t.closest?.('[data-nd-yard]')) {
      this.fleetOpen = !this.fleetOpen;
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-seas]')) {
      this.seasOpen = !this.seasOpen;
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-scrap]')) {
      // Özet satırındaki düğme <details>'i açıp kapatmasın.
      event.preventDefault();
      // İki tık: ilki onay ister, dört saniye içinde ikincisi hurdaya ayırır.
      clearTimeout(this.confirmTimer);
      if (!this.confirmScrap) {
        this.confirmScrap = true;
        this.confirmTimer = setTimeout(() => { this.confirmScrap = false; this.refresh(); }, 4000);
        this.refresh();
        return;
      }
      this.confirmScrap = false;
      const count = scrapObsolete(this.game.world, nation);
      if (count) {
        this.game.turns?.addLog(`${count} obsolete warship${count === 1 ? '' : 's'} scrapped: the crews go home, the yards take back the steel.`, { kind: 'NAVAL', key: 'scrap' });
      }
      this.game.renderer?.sea?.touchFleets?.();
      this.refresh();
      this.game.emit?.('economy');
      this.game.requestRender?.();
      return;
    }
    const scrapPick = t.closest?.('[data-nd-scrapg]');
    if (scrapPick) {
      const key = scrapPick.dataset.ndScrapg;
      clearTimeout(this.confirmTimer);
      if (this.confirmKey !== key) {
        this.confirmKey = key;
        this.confirmTimer = setTimeout(() => { this.confirmKey = null; this.refresh(); }, 4000);
        this.refresh();
        return;
      }
      this.confirmKey = null;
      const [groupText, countText] = key.split(':');
      const group = groupText === 'sub' ? 'sub' : Number(groupText);
      const count = scrapGroup(this.game.world, nation, group, countText === 'all' ? Infinity : Number(countText));
      if (count) {
        const what = group === 'sub' ? `submarine${count === 1 ? '' : 's'}` : `warship${count === 1 ? '' : 's'}`;
        this.game.turns?.addLog(`${count} ${what} scrapped: the crews go home, the yards take back the steel.`, { kind: 'NAVAL', key: 'scrap' });
      }
      this.game.renderer?.sea?.touchFleets?.();
      this.refresh();
      this.game.emit?.('economy');
      this.game.requestRender?.();
      return;
    }
    const buildBtn = t.closest?.('[data-nd-build]');
    if (buildBtn) {
      const wanted = event.shiftKey ? 5 : 1;
      let ordered = 0;
      for (let i = 0; i < wanted; i++) {
        if (!this.game.turns.buyUnit(nation, buildBtn.dataset.ndBuild)) break;
        ordered++;
      }
      if (!ordered) {
        const why = recruitBlockers(this.game, nation, buildBtn.dataset.ndBuild)[0]?.text;
        if (why) this.flash(why);
      } else {
        this.flash(`${plural(ordered, UNIT_TYPES[buildBtn.dataset.ndBuild]?.name.toLowerCase() ?? 'ship')} ordered — see the shipyard line for the date.`);
      }
      this.refresh();
      return;
    }
    const enemy = t.closest?.('[data-nd-enemy]');
    if (enemy && enemy.dataset.ndEnemy !== '') {
      this.centerOn(Number(enemy.dataset.ndEnemy));
      this.refresh();
      return;
    }
    const seaBtn = t.closest?.('[data-nd-sea]');
    if (seaBtn) {
      const zoneId = Number(seaBtn.dataset.ndSea);
      this.card = null;
      this.sea = zoneId;
      this.focus = zoneId;
      this.refresh();
      return;
    }
    const show = t.closest?.('[data-nd-show]');
    if (show) {
      this.centerOn(Number(show.dataset.ndShow));
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-troops]')) {
      const units = (this.game.world.units ?? []).filter((u) => u.nationId === nation.id && u.embarked && u.hp > 0);
      if (units.length) {
        this.game.selectUnits(units);
        this.ownFocus = true;
        this.game.focusTile?.(units[0].tile);
        this.ownFocus = false;
      }
      return;
    }
    const open = t.closest?.('[data-nd-open]');
    if (open) {
      this.card = open.dataset.ndOpen;
      this.sea = null;
      this.refresh();
      return;
    }
    const step = t.closest?.('[data-nd-step]');
    if (step && step.dataset.ndStep) {
      this.card = step.dataset.ndStep;
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-back]')) {
      this.card = null;
      this.sea = null;
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-close]')) {
      this.game.selectFleet(null);
      this.card = null;
      this.sea = null;
      if (this.active()) document.querySelector('.mode-btn[data-mode="political"]')?.click();
      this.refresh();
    }
  }
}

/** Kara hedefinin adı: province (state) adı; deniz hedefinde bölge adı. */
function placeName(world, tile) {
  if (!tile) return null;
  if (tile.terrain?.water) return world.seaZones?.zones?.[tile.seaZone]?.name ?? 'the sea';
  return world.provinces?.[tile.provinceId]?.name ?? null;
}
