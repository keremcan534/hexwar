// SAĞ PANEL — donanma (deniz haritası, Seas kipi, açıkken).
//
// Kerem: donanma "eğlenceli ama kanser olmayan" olsun. Gemi gemi değil deniz
// deniz yönetilir (game/navy.js): filo bir HAVUZDUR, oyuncu denizlere öncelik
// verir (Factories'teki üretim hatlarıyla aynı kademeler), amirallik gemileri
// böler. Panel ilk bakışta dört soruyu cevaplar, yukarıdan aşağıya: ne kadar
// güçlüyüm ve karşımda ne var (başlık + AT WAR), filom nerede ve ne yapıyor
// (WHERE THE FLEET IS), neyi emredebilirim (SEA ORDERS, Build), deniz
// ticaretime ve askerime ne yapıyor (TRADE & TRANSPORTS); en altta son deniz
// olayı. Muharebe ve kaçınma kartı aynı panelin gövdesinde açılır.
//
// Panel sayı KURMAZ: hepsi navyView'den (navy.js) gelir, cümleler navyText'te.
// Öncelik düğmesinin üstünde durmak yeni planı satırlarda yerinde önizler
// (aynı planlayıcı: ekran oyunla ayrışamaz).

import {
  NAVY_PRIORITIES, NAVY_STEPS, SCRAP_REFUND, WITHDRAW_WEEKS, EVADE_RATIO, actionId, dayMonth, navalAction,
  navyView, resetZonePriorities, scrapGroup, scrapObsolete, seaZoneMarks, setZonePriority,
} from '../game/navy.js';
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

/** WHERE bölümünün en çok satırı; fazlası son satırda toplanır. */
const WHERE_LINES = 6;

export class NavyDock {
  constructor(game) {
    this.game = game;
    this.preview = null;
    this.focus = null;
    this.hoverZone = null;
    this.pin = null;
    this.card = null;
    this.quietOpen = false;
    this.confirmScrap = false;
    this.confirmTimer = 0;
    this.confirmKey = null;
    this.fleetOpen = false;
    this.whereMax = 0;
    this.wasOn = false;
    this.lastActionId = null;
    this.root = document.createElement('aside');
    this.root.className = 'navy-dock';
    this.root.id = 'navy-dock';
    this.root.setAttribute('aria-label', 'Navy');
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
    // Önizleme ve harita işareti kalıcı kökte dinlenir: haftalık tazeleme
    // satırları yeniden kurar, imleç yerinde durdukça önizleme geri yazılır.
    this.root.addEventListener('pointerover', (event) => this.onOver(event));
    this.root.addEventListener('pointerleave', () => this.hover(null, null));
    // Filo katının açık/kapalı hâli tazelemeden sağ çıksın ('toggle' kabarmaz).
    this.root.addEventListener('toggle', (event) => {
      if (event.target.matches?.('.nd-fleet')) this.fleetOpen = event.target.open;
    }, true);
    for (const name of ['turn', 'world', 'mapmode', 'politics', 'units']) game.on?.(name, () => this.refresh());
    window.addEventListener('resize', () => this.fit());
    // Bildirim kartı (ui/notifications) deniz kaydını açar.
    game.on?.('navalReport', (id) => {
      this.card = id ?? null;
      this.refresh();
    });
    // Deniz haritasında suya tıklamak: bölgeyi odaklar; listede yoksa panelin
    // tepesine iğneler (NAVY-10: her deniz emir alabilir); bölgede son iki
    // haftanın muharebesi ya da kaçınması varsa kartını açar.
    game.on?.('select', (tile) => this.onMapSelect(tile));
    // Esc deniz haritasında önce kartı, sonra odağı kapatır (yakalama
    // evresinde: HUD'ın Esc zinciri seçimi silmeden önce).
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape' || !this.active() || this.root.hidden) return;
      if (event.target?.closest?.('input, textarea, select')) return;
      if (this.card) {
        this.card = null;
      } else if (this.focus != null || this.pin != null) {
        this.focus = null;
        this.pin = null;
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

  override() {
    if (!this.preview) return null;
    const [zoneId, step] = this.preview.split(':');
    const level = NAVY_PRIORITIES.find((p) => p.id === step);
    if (level) return { [zoneId]: level.weight };
    return null;
  }

  view(override = null) {
    return navyView(this.game.world, this.me(), override, { pin: this.pin });
  }

  refresh() {
    const nation = this.me();
    const on = this.active() && !!nation?.alive;
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
      // Kip yeniden açıldı ya da ülke değişti: sabit yuvalar sıfırdan ölçülür.
      this.whereMax = 0;
      this.nationId = nation.id;
      this.wasOn = true;
    }
    const view = this.view();
    if (view.pinRefused) {
      this.flash(`${view.pinRefused.zone.name}: no water route from our ports — the fleet cannot reach it.`);
      this.pin = null;
    }
    // Aynı içerik yeniden yazılmaz; yazılırsa kaydırma korunur.
    const html = this.html(view);
    if (html !== this.lastHtml || !this.root.firstChild) {
      const keepList = this.root.querySelector('.nd-list')?.scrollTop ?? 0;
      const keepBody = this.root.querySelector('.nd-body')?.scrollTop ?? 0;
      this.root.innerHTML = html;
      this.lastHtml = html;
      for (const [sel, keep] of [['.nd-list', keepList], ['.nd-body', keepBody]]) {
        const box = this.root.querySelector(sel);
        if (!box) continue;
        quietScroll(box);
        if (keep) box.scrollTop = keep;
      }
    }
    if (this.preview) this.paint();
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
    if (!view.total && !view.rows.length && !view.subs) {
      return `${head}<p class="nd-empty">No coast, no navy.</p>`;
    }
    return `${head}<div class="nd-body">${this.warHtml(view)}${this.whereHtml(view)}${this.ordersHtml(view)}${this.tradeHtml(view)}${this.subsHtml(view)}${this.fleetHtml(view)}</div>${this.lastHtml_(view)}`;
  }

  headHtml(view) {
    const tip = `Navy\n${view.total} warships: ${view.ready} ready to sail, ${view.atSea} on station, ${view.sailing} under way, ${view.inPort} in port${view.repairing ? ` (${view.repairing} repairing)` : ''}${view.withdrawn ? `, ${view.withdrawn} withdrawn` : ''}.\n`
      + `Strength ${str1(view.strength)} (ready ${str1(view.readyStrength)}) — ${strengthRule(view)}`
      + `${view.classes.length ? `\n${view.classes.map((c) => plural(c.count, c.name.toLowerCase(), c.plural)).join(', ')}. New hulls are ${view.current.plural}.` : ''}`
      + `${view.subs ? `\n${plural(view.subs, 'submarine')} (${view.subsAtSea} hunting).` : ''}`;
    return `<header class="nd-head">
        <span class="nd-title">Navy</span>
        <span class="nd-sum"${tipAttr({ text: tip })}><b>${view.total}</b> ${view.total === 1 ? 'warship' : 'warships'} · <b>${view.ready}</b> ready · strength <b>${str1(view.strength)}</b>${view.total ? ` · hull <b>${pct(view.hull)}</b>` : ''}${view.subs ? ` · U×${view.subs}` : ''}</span>
        <button class="k-btn sm nd-close" type="button" data-nd-close aria-label="Close the naval map"${tipAttr({ text: 'Close the naval map (M)' })}>Close <kbd>M</kbd></button>
      </header>`;
  }

  /** AT WAR: düşman filoları, güç ve tek oran satırı (barışta tek satır). */
  warHtml(view) {
    if (!view.atWar) {
      return '<section class="nd-war peace"><span class="nd-sec">At peace</span><span class="nd-war-sum">No enemy fleets. Auto keeps a watch on the home seas.</span></section>';
    }
    if (!view.enemies.length) {
      return '<section class="nd-war"><span class="nd-sec">At war</span><span class="nd-war-sum">No enemy has a coast our fleet can reach: the war is fought on land.</span><span class="nd-war-sum dim">Our fleet keeps the home seas.</span></section>';
    }
    const scale = Math.max(view.strength, view.enemyStrength, 1e-9);
    const shown = view.enemies.slice(0, 3);
    const more = view.enemies.slice(3);
    const cells = shown.map((enemy) => {
      const classes = enemy.classes.map((c) => plural(c.count, c.name.toLowerCase(), c.plural)).join(', ');
      const tip = `${enemy.name} — ${plural(enemy.ships, 'warship')}${classes ? ` (${classes})` : ''}, ${enemy.inPort} in port.\nStrength ${str1(enemy.strength)} (ours ${str1(view.strength)}).\n${enemy.name}'s coast is ${pct(enemy.coastBlockade)} blockaded.\nClick: show its main home sea.`;
      return `<button class="nd-enemy" type="button" data-nd-enemy="${enemy.mainSea ?? ''}"${tipAttr({ text: tip })}><b>${esc(enemy.name)}</b><span>${plural(enemy.ships, 'ship')}</span><span class="v">${str1(enemy.strength)}</span><i class="nd-ebar"><i style="width:${(enemy.strength / scale * 100).toFixed(1)}%"></i></i></button>`;
    }).join('');
    const extra = more.length
      ? `<span class="nd-more"${tipAttr({ text: more.map((e) => `${e.name}: ${plural(e.ships, 'ship')}, ${str1(e.strength)}`).join('\n') })}>+${more.length} more</span>` : '';
    const ratio = view.enemyStrength > 0 ? view.strength / view.enemyStrength : Infinity;
    const tone = ratio >= 1.1 ? 'good' : ratio < 0.9 ? 'bad' : 'warn';
    return `<section class="nd-war">
        <div class="nd-war-cells"><span class="nd-sec">At war</span>${cells}${extra}</div>
        <div class="nd-war-sum ${tone}">Enemy fleets ${str1(view.enemyStrength)} against our ${str1(view.strength)} — ${Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'} : 1</div>
      </section>`;
  }

  /** WHERE THE FLEET IS: grup grup (deniz ve hâl başına bir satır). */
  whereHtml(view) {
    const lines = view.squadrons.map((group) => this.squadronHtml(view, group));
    if (!view.total) lines.push('<div class="nd-sq dim"><span class="nd-sqs">No warships yet — build them below (Fleet → Build warship).</span></div>');
    let shown = lines;
    if (lines.length > WHERE_LINES) {
      const rest = view.squadrons.slice(WHERE_LINES - 1);
      shown = [...lines.slice(0, WHERE_LINES - 1), `<div class="nd-sq dim"><span class="nd-sqs">+${rest.length} more groups (${rest.reduce((sum, g) => sum + g.ships.length, 0)} ships)</span></div>`];
    }
    // Sabit yuva: satır sayısı haftadan haftaya inip çıkınca altındaki her şey
    // kayıyordu (jitter sondası). Kip açıkken görülen en çok satır kadar yer tutulur.
    this.whereMax = Math.min(WHERE_LINES, Math.max(this.whereMax, shown.length));
    while (shown.length < this.whereMax) shown.push('<div class="nd-sq pad" aria-hidden="true"></div>');
    return `<section class="nd-where"><h4 class="nd-sec">Where the fleet is</h4>${shown.join('')}</section>`;
  }

  squadronHtml(view, group) {
    const world = this.game.world;
    const count = group.ships.length;
    const hulls = group.ships.map((ship) => `${ship.name} — ${shipClassOf(ship).name.toLowerCase()}, hull ${pct(ship.hp)}`).join('\n');
    const lowHull = group.hull < 0.85 ? ` · hull ${pct(group.hull)}` : '';
    let sign = 'dot';
    // Hâlin resmi (navy-photo) glifin yerine oturur: nöbet = deniz hâkimiyeti,
    // abluka, onarım, çekilme, liman. Yoldaki/dönen filonun resmi yok; ok
    // glifi yönü daha iyi söyler.
    let art = { station: 'sea_control', repairing: 'repair', withdrawn: 'withdrawal', idle: 'port' }[group.kind] ?? '';
    let place = group.zone?.name ?? '';
    let status = '';
    let tone = '';
    const row = group.row;
    switch (group.kind) {
      case 'station': {
        const blockading = (row?.blockading ?? []).filter((b) => b.share > 0.01)
          .map((b) => `blockading ${world.nations[b.nation]?.name ?? '?'} ${pct(b.share)}`);
        // Yeşil ● zaten "nöbette" der: 220 px'lik sütunda abluka ve gövde
        // "on station · " önekiyle kesiliyordu (1920'de bile "hull 70%" yoktu).
        if (blockading.length) { status = blockading.join(', '); art = 'blockade'; }
        else if (row?.hostile > 0) { status = `on station · contesting: ${str1(row.friendly)} vs ${str1(row.hostile)}`; tone = 'warn'; }
        else if (row?.why?.code === 'escort') status = 'on station · escorting the lanes';
        else status = 'on station · holding the sea';
        status += lowHull;
        if (row?.relief?.length) {
          const r = row.relief[0];
          status += ` · ${r.by} relieves ${r.ship} (${pct(r.hp)}) next week`;
        }
        tone ||= 'good';
        break;
      }
      case 'underway':
        sign = 'advance';
        status = group.assembling
          ? `assembling · enter together ${dayMonth(group.eta)} (${group.weeks <= 0 ? 'this week' : `${group.weeks} wk`})`
          : `under way · arrives ${dayMonth(group.eta)} (${group.weeks <= 0 ? 'this week' : `${group.weeks} wk`})`;
        break;
      case 'returning':
        sign = 'return';
        place = 'Returning to port';
        status = `in port ${dayMonth(group.eta)} (${group.weeks} wk)`;
        break;
      case 'repairing':
        sign = 'anchor';
        place = 'Repairing';
        status = group.stalled
          ? `hull ${pct(group.hull)} · <b class="bad">STALLED: no ships equipment</b>`
          : `hull ${pct(group.hull)} · ready ~${dayMonth(group.readyAt)}`;
        tone = group.stalled ? 'bad' : '';
        break;
      case 'withdrawn': {
        sign = 'anchor';
        // Deniz adı ad sütununa: "Withdrawn … refused battle in Sea of Marburg"
        // dönüş tarihini kesiyordu; kırmızı ⚓ ve fiil "çekildi"yi söyler.
        place = group.zone?.name ?? 'Withdrawn';
        status = `${group.why === 'refused' ? 'refused battle' : group.why === 'beaten' ? 'beaten' : 'withdrawn'} · back ${dayMonth(group.until)}`;
        tone = 'bad';
        break;
      }
      case 'idle': {
        sign = 'anchor';
        place = 'In port';
        status = this.idleText(view);
        break;
      }
      default:
        break;
    }
    const zone = group.zone && ['station', 'underway'].includes(group.kind) ? group.zone : null;
    // Kesilen durum metni ipucunda tam okunur (dar ekranda sütun ~35 harf).
    const fix = group.kind === 'repairing' && group.stalled ? ' Raise the Ships line (Factories).' : '';
    const tip = `${place || 'Fleet'} — ${plural(count, 'ship')}\n${strip(status)}${fix}\n${hulls}${group.kind === 'repairing' ? `\nRepair ${pct(view.repairSpeed)} hull a week in port${view.repairSpeed < 0.05 ? ' (no dockyards: half speed)' : ''}; ships equipment in stock ${view.repairStock.toFixed(1)}.` : ''}${zone ? '\nClick the sea: show it on the map.' : ''}`;
    // Denizin adı haritada gösterir (satır adlarıyla aynı dil): ayrı "Show"
    // sütunu durum metnini yarıya kesiyordu.
    const placeHtml = zone
      ? `<button class="nd-place" type="button" data-nd-show="${zone.id}">${esc(place)}</button>`
      : `<span class="nd-place">${esc(place)}</span>`;
    return `<div class="nd-sq ${group.kind}${tone ? ` ${tone}` : ''}"${zone ? ` data-nd-hz="${zone.id}"` : ''}${tipAttr({ text: tip })}>
        <i class="nd-glyph" aria-hidden="true">${art ? navyArt(art) : glyph(sign, 'ctl')}</i>${placeHtml}<b class="nd-count">${group.kind === 'underway' ? `+${count}` : count}</b><span class="nd-sqs">${status}</span>
      </div>`;
  }

  /** Limanda boşta bekleyen gemilerin sebebi (NAVY-12). */
  idleText(view) {
    const idle = view.idle;
    if (!idle) return 'ready';
    if (idle.why === 'next-week') return 'sail next week';
    if (idle.why === 'all-off') return 'every sea is Off or kept by Auto for later — no orders';
    if (idle.why === 'fleet-in-being') {
      const sea = idle.seas[0];
      const row = sea ? view.rows.find((r) => r.zone.id === sea.zone.id) : null;
      const enemy = row?.enemyShips[0] ? this.game.world.nations[row.enemyShips[0].nation]?.name ?? '' : '';
      return sea
        ? `Auto keeps them in port: ${enemy ? `${esc(enemy)}'s fleet` : 'the enemy fleet'} in ${esc(sea.zone.name)} (${str1(sea.there)}) needs ${str1(sea.need)} — fleet in being`
        : 'Auto keeps them in port — fleet in being';
    }
    return 'no sea within reach needs them';
  }

  /** SEA ORDERS: denizler (yalnız bu bölüm kayar). */
  ordersHtml(view) {
    const loud = view.rows.filter((row) => !row.quiet);
    const quiet = view.rows.filter((row) => row.quiet);
    const rows = loud.map((row) => this.rowHtml(row, view));
    if (quiet.length) {
      const allHome = quiet.every((row) => row.home);
      const label = `${quiet.length} quiet ${allHome ? 'home ' : ''}${quiet.length === 1 ? 'sea' : 'seas'} on Auto — ${quiet.map((row) => row.zone.name).join(', ')}`;
      rows.push(`<button class="nd-quiet" type="button" data-nd-quiet${tipAttr({ text: `Quiet seas\nNo ships of ours, no enemy, no blockade and no U-boats here; Auto sends nothing. Click to ${this.quietOpen ? 'fold them' : 'list them and give them an order'}.` })}><i aria-hidden="true">${glyph(this.quietOpen ? 'chev-down' : 'chev-right', 'ctl')}</i><span>${esc(label)}</span></button>`);
      if (this.quietOpen) for (const row of quiet) rows.push(this.rowHtml(row, view));
    }
    if (!view.rows.length) rows.push('<p class="nd-empty">No sea within reach of our ports.</p>');
    // "Hepsini Auto'ya" emirlerin başında durur (başlıkta güç satırını kesiyordu).
    const manual = Object.keys(this.me()?.navy?.zones ?? {}).length > 0;
    const reset = `<button class="k-btn xs" type="button" data-nd-auto${manual
      ? tipAttr({ text: 'All seas to Auto\nThe admiralty takes every sea back: home waters in peace; in war the shared home seas, the enemy coast when our fleet is at least 0.8 of his, escorts where U-boats sink our cargo, and a sea held by an enemy fleet only when our ready fleet is a third stronger. It remembers a sea where its squadron had to refuse battle.' })
      : `${tipAttr({ text: 'All seas are on Auto already.' })} disabled`}>All to Auto</button>`;
    return `<section class="nd-orders"><div class="nd-orders-head"><h4 class="nd-sec">Sea orders <small>click any sea on the map to add it</small></h4>${reset}</div><div class="nd-list">${rows.join('')}</div></section>`;
  }

  rowHtml(row, view) {
    const world = this.game.world;
    const zone = row.zone;
    const auto = row.priority.mode !== 'manual';
    const current = linePriorityOf(auto ? row.weight : row.priority.weight);
    const autoWhy = whySentence(world, row.priority.mode === 'manual' ? row.why?.auto ?? null : row.why, zone.name);
    const steps = NAVY_STEPS.map((step) => {
      const level = NAVY_PRIORITIES.find((p) => p.id === step);
      const on = step === 'auto' ? auto : !auto && current.id === step;
      const at = auto && level && current.id === step;
      const tip = level
        ? { text: `${level.name} on ${zone.name}\nThe admiralty splits ready ships by weight (Low 1, Normal 3, High 6). Hover to preview, click to order.` }
        : { text: `${auto ? '' : 'Back to Auto\n'}${autoWhy}` };
      return `<button class="pl-pb${level ? '' : ' auto'}${on ? ' on' : ''}${at ? ' at' : ''}" type="button" data-nd-pri="${zone.id}:${step}"${tipAttr(tip)}>${level ? level.name : 'Auto'}</button>`;
    });
    const tags = [
      row.pinned ? `<em class="nd-tag pin">pinned</em><button class="nd-unpin" type="button" data-nd-unpin${tipAttr({ text: 'Unpin\nTake this sea off the top of the list. A sea with your own priority stays listed.' })}>Unpin</button>` : '',
      row.home ? `<em class="nd-tag home"${tipAttr({ text: `Home waters\n${plural(row.ourCoast, 'coastal state')} of ours on this sea. Our warships fight ${20}% harder here.` })}>home</em>` : '',
      row.blockading.length ? `<em class="nd-tag enemy"${tipAttr({ text: 'Enemy coast\nA nation we are at war with has a coast on this sea: holding it blockades that coast.' })}>enemy coast</em>` : '',
    ].join('');
    const enemyShips = row.enemyShips.reduce((sum, e) => sum + e.ships, 0);
    const effects = this.effects(row);
    const tone = toneOf(row);
    // Düşmansız denizde yüzde anlamsızdır (hep %100): "held"; deniz tamamen
    // düşmandaysa "lost"; çekişmede pay.
    const label = row.hostile <= 0 ? (row.friendly > 0 ? 'held' : '—') : row.friendly <= 0 ? 'lost' : pct(row.control);
    const control = `<span class="nd-ctl ${row.friendly + row.hostile > 0 ? tone : 'quiet'}"${tipAttr({ text: `Control ${row.friendly + row.hostile > 0 ? pct(row.control) : '—'}\nOur and allied strength ${str1(row.friendly)} against ${str1(row.hostile)} enemy. Whoever holds a sea blockades the coasts on it; over half for the enemy closes it to our troops.` })}><i style="width:${pct(row.friendly + row.hostile > 0 ? row.control : 0)}"></i></span><b class="nd-ctlv${row.hostile <= 0 ? ' dim' : ''}">${label}</b>`;
    const pending = row.pending !== 0
      ? `<em class="nd-pend ${row.pending > 0 ? 'up' : 'down'}">${row.pending > 0 ? '+' : '−'}${Math.abs(row.pending)} next wk</em>` : '';
    const shipsText = enemyShips ? `<b>${row.present}</b><small>vs</small><b class="bad">${enemyShips}</b>` : `<b>${row.present}</b><small>${row.present === 1 ? 'ship' : 'ships'}</small>`;
    const shipsTip = `${zone.name}\n${plural(row.present, 'ship')} of ours on station${row.sailing ? `, ${row.sailing} under way` : ''}${enemyShips ? `; ${plural(enemyShips, 'enemy ship')} (${str1(row.hostile)})` : ''}.\nNext week the admiralty plans ${plural(row.planned, 'ship')} here${row.pending > 0 && row.plannedWeeks ? ` (the farthest arrives in ~${row.plannedWeeks} wk)` : ''}.`;
    const line3 = this.line3(row);
    return `<div class="nd-row ${tone}${this.focus === zone.id ? ' focus' : ''}${row.pinned ? ' pinned' : ''}" data-nd-zone="${zone.id}">
      <div class="nd-row-head">
        <button class="nd-name" type="button" data-nd-focus="${zone.id}"${tipAttr({ text: `${zone.name}\nShow on the map.` })}>${esc(zone.name)}</button>${tags}
        <span class="nd-ships" data-nd-ships="${zone.id}"${tipAttr({ text: shipsTip })}>${shipsText}${pending}<em class="nd-pv" data-nd-pv="${zone.id}"></em></span>
        ${control}
      </div>
      <div class="nd-row-mid">
        <span class="pl-pri nd-pri">${steps[0]}<span class="pl-tiers">${steps.slice(1).join('')}</span></span>
        <div class="nd-fx" data-nd-fx="${zone.id}"${tipAttr({ text: `${zone.name}\n${effects.map(strip).join('\n') || 'Quiet waters.'}${auto ? `\n\n${autoWhy}` : ''}` })}>${effects.join('<i>·</i>') || `<span class="dim">${esc(this.quietNote(row))}</span>`}</div>
      </div>
      ${line3 ? `<div class="nd-fc ${line3.tone}" data-nd-fc="${zone.id}"${line3.tip ? tipAttr({ text: line3.tip }) : ''}>${esc(line3.text)}</div>` : ''}
    </div>`;
  }

  /** Etki satırı: abluka, kıyımız, nakliye, denizaltı, düşman, amiral. */
  effects(row) {
    const world = this.game.world;
    const effects = [];
    for (const b of row.blockading) {
      const name = world.nations[b.nation]?.name ?? '?';
      effects.push(b.share > 0.01
        ? `<span class="good">blockading ${esc(name)} ${pct(b.share)}</span>`
        : `<span>${esc(name)}'s coast open</span>`);
    }
    if (row.ourBlockade > 0.01) effects.push(`<span class="bad">our coast blockaded ${pct(row.ourBlockade)}</span>`);
    if (row.transportRisk > 0.005) effects.push(`<span class="bad">troops at sea −${pct(row.transportRisk)} men/wk</span>`);
    if (row.raidedShare > 0.01) effects.push(`<span class="bad">${plural(row.enemySubs, 'enemy U-boat')}: our cargo −${pct(row.raidedShare)}</span>`);
    if (row.ourSubs) effects.push(`<span class="good">our U-boats ${row.ourSubs}${row.raidingShare > 0.01 ? `: enemy cargo −${pct(row.raidingShare)}` : ''}</span>`);
    for (const e of row.enemyShips.slice(0, 2)) {
      effects.push(`<span class="bad">${esc(world.nations[e.nation]?.name ?? '?')} ${plural(e.ships, 'ship')} (${str1(e.strength)})</span>`);
    }
    if (row.admiral) effects.push(`<span>Adm. ${esc(row.admiral.name.split(' ').pop())}</span>`);
    if (row.priority.mode !== 'manual' && row.why?.code === 'pooled') effects.push('<span class="dim">Auto: no squadron free (pooled)</span>');
    return effects;
  }

  /** Sessiz satırın tek notu (Auto'nun kısa gerekçesi). */
  quietNote(row) {
    const code = row.why?.code;
    if (row.priority.mode === 'manual') return row.weight > 0 ? 'your order — no ships here yet' : 'Off — your order';
    if (code === 'gathered') return 'Auto: fleet gathered elsewhere in war';
    if (code === 'home') return 'Auto: home watch';
    if (code === 'outgunned' || code === 'refused') return 'Auto: kept in port — stronger enemy here';
    return 'quiet waters';
  }

  /** Üçüncü satır: öngörü, Auto'nun hafızası ya da elle emrin kaçınma geçmişi. */
  line3(row) {
    const world = this.game.world;
    if (row.hostile > 0 && row.forecast) {
      const line = forecastLine(world, row.forecast);
      if (line && row.forecast.verdict === 'none' && ['outgunned', 'refused'].includes(row.why?.code)) {
        // Boş deniz: Auto'nun neden gitmediği (fleet in being) aynı satırda.
        // Satır 400 px: tam cümle (neden + eşik) ipucunda.
        line.text = `${line.text.split(' — ')[0]} — Auto waits for ${str1(row.why.need)} ready (ours ${str1(row.why.ours)})`;
      }
      if (line) return { ...line, tip: `${forecastTip(row.forecast)}\n\n${whySentence(world, row.why, row.zone.name)}` };
    }
    if (row.memo) return { tone: 'warn', text: memoLine(row.memo), tip: whySentence(world, row.why, row.zone.name) };
    if (row.priority.mode === 'manual' && row.refusals.count) {
      const last = row.refusals.last;
      const strong = last.sides[1];
      return {
        tone: 'bad',
        text: `refused battle ${row.refusals.count}× here since ${dayMonth((row.refusals.first ?? last).turn)} — ${names(world, strong.nations)} ${str1(strong.before)} vs our ${str1(last.sides[0].before)}`,
        tip: `Your order stays on this sea: the squadron sails again each time its ${WITHDRAW_WEEKS}-week hold ends.\nA squadron less than half as strong as the enemy there refuses battle and returns to port.`,
      };
    }
    return null;
  }

  /** TRADE & TRANSPORTS: deniz ticareti, ablukamız, denizdeki tümenler, kapalı denizler. */
  tradeHtml(view) {
    const world = this.game.world;
    const me = this.me();
    const lines = [];
    const blockers = view.trade.blockers;
    const cuts = laneCutsView(world, me.id);
    let trade;
    let tradeTone = '';
    if (view.trade.blockade > 0.01 && blockers.length) {
      const worst = blockers[0];
      trade = `blockaded −${pct(view.trade.blockade)} — ${esc(names(world, worst.by) || 'the enemy')} holds ${esc(worst.zone.name)} (${plural(worst.coast, 'coastal state')} of ours)`;
      tradeTone = 'bad';
    } else if (cuts.length) {
      const top = cuts[0];
      const cause = top.cause[0];
      const partner = world.nations[top.partner]?.name ?? '?';
      const why = cause
        ? cause.kind === 'raid' ? `U-boats in ${seaName(world, cause.zone)}` : `${names(world, cause.by) || 'the enemy'} holds ${seaName(world, cause.zone)}`
        : 'enemy seas on the way';
      trade = `trade with ${esc(partner)} −${pct(top.lostShare)}: ${esc(why)}${cuts.length > 1 ? ` · ${cuts.length - 1} more lane${cuts.length === 2 ? '' : 's'} cut` : ''}`;
      tradeTone = 'warn';
    } else {
      trade = 'open — no blockade, no lane cut';
      tradeTone = 'good';
    }
    const tradeTip = `Sea trade\n${BLOCKADE_RULE}\nTrade between partners who do not border each other sails along the lanes on this map; an enemy-held sea on the way or U-boats on a lane sink the cargo that passes.${cuts.length ? `\n\nLanes cut now:\n${cuts.slice(0, 5).map((c) => `${world.nations[c.partner]?.name ?? '?'} −${pct(c.lostShare)} (${c.cause.map((x) => `${seaName(world, x.zone)}: ${x.kind === 'raid' ? 'U-boats' : 'held'} by ${names(world, x.by) || '?'}`).join('; ') || 'enemy seas'})`).join('\n')}` : ''}\nClick: show the worst sea.`;
    const worstZone = blockers[0]?.zone.id ?? cuts[0]?.cause[0]?.zone ?? null;
    lines.push(this.tlHtml('Sea trade', trade, tradeTone, tradeTip, worstZone != null ? `data-nd-show="${worstZone}"` : '', navyArt('convoy')));
    if (view.atWar) {
      const ours = view.ourBlockades.map((b) => (b.national >= 0.1
        ? `${esc(b.name)} ${pct(b.national)} of its coast` : `${esc(b.name)}: token blockade (${pct(b.national)})`));
      const tip = view.ourBlockades.length
        ? `Our blockade\n${view.ourBlockades.map((b) => `${b.seas.map((s) => `${s.zone.name}: ${pct(s.share)} of ${b.name}'s ${plural(s.coast, 'coastal state')} there (cover: our ${str1(s.strength)} strength vs ${str1(0.6 * s.coast)} needed = 0.6 per state)`).join('\n')}\n${b.name} has ${plural(b.coastal, 'coastal state')}: its sea trade with partners it does not border loses ${pct(b.national)}.`).join('\n\n')}\nEffective from 10% of the coast.`
        : 'Our blockade\nNo enemy coast is blockaded: send ships to a sea where an enemy has a coast (ENEMY COAST tag).';
      lines.push(this.tlHtml('Our blockade', ours.join(' · ') || 'none — no enemy coast is held', ours.length ? 'good' : 'dim', tip, '', navyArt('blockade')));
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
    const troopRows = view.transports.map((t) => `${t.zone.name}: ${plural(t.units.length, 'division')} — ${t.status.state === 'held' ? `${names(world, t.status.holders)} holds ${pct(t.status.share)}, −${pct(t.riskPerWeek)} men a week` : t.status.state}`);
    lines.push(this.tlHtml('Troops', troops, troopTone, `Troops at sea\n${troopRows.length ? `${troopRows.join('\n')}\n\n` : ''}${TROOPS_RULE}${units ? '\nClick: select them.' : ''}`, units ? 'data-nd-troops' : '', navyArt('landing')));
    if (view.atWar) {
      const closed = view.closed.map((c) => `${esc(c.zone.name)} (${esc(names(world, c.holders) || 'the enemy')} ${pct(c.share)})`);
      // Kapalı deniz = düşmanın deniz hâkimiyeti: aynı resim, kırmızı metin kimin
      // elinde olduğunu söyler. Resimsiz satır sütunu kaydırıyordu.
      lines.push(this.tlHtml('Closed', closed.length ? `${closed.join(', ')} — troops cannot enter` : 'none — every sea is open to our troops',
        closed.length ? 'bad' : 'dim',
        `Closed seas\nOver half of the warships in a sea are the enemy's: our divisions cannot embark into it or sail through it. Divisions already inside may still sail out and land, losing men every week.${closed.length ? '\nHatched on the map while an army is selected.' : ''}`,
        closed.length ? `data-nd-show="${view.closed[0].zone.id}"` : '', navyArt('sea_control')));
    }
    return `<section class="nd-trade"><h4 class="nd-sec">Trade &amp; transports</h4>${lines.join('')}</section>`;
  }

  tlHtml(label, value, tone, tip, attr = '', icon = '') {
    const tag = attr ? 'button' : 'div';
    return `<${tag} class="nd-tl${attr ? ' click' : ''}"${attr ? ` type="button" ${attr}` : ''}${tipAttr({ text: tip })}><span class="k">${icon}${esc(label)}</span><span class="v ${tone}">${value}</span></${tag}>`;
  }

  /** SUBMARINES: tek satır (emir yok: tasarım gereği kendi başlarına giderler). */
  subsHtml(view) {
    const world = this.game.world;
    const me = this.me();
    let text;
    if (!view.subs) {
      const era = recruitBlockers(this.game, me, 'SUBMARINE').find((b) => b.id === 'era');
      text = era ? `none — ${esc(era.text.replace(/^Requires /, '').replace(/\.$/, ''))} unlocks them` : 'none — build them under Fleet';
    } else {
      const hunting = [];
      for (const [zoneId, here] of world.navyState?.subs ?? []) {
        if (here.has(me.id)) hunting.push({ zone: zoneId, ships: here.get(me.id).ships.length });
      }
      const best = view.rows.reduce((max, row) => Math.max(max, row.raidingShare ?? 0), 0);
      text = view.atWar
        ? `U×${view.subs} · ${hunting.reduce((s, h) => s + h.ships, 0)} hunting${hunting.length ? ` in ${esc(hunting.slice(0, 2).map((h) => seaName(world, h.zone)).join(', '))}${hunting.length > 2 ? '…' : ''}` : ''}${best > 0.01 ? ` · enemy cargo −${pct(best)}` : ''}`
        : `U×${view.subs} · in port (peace)`;
    }
    // Emri olmayan tek satır: resim onu filonun emir satırlarından ayırır.
    return `<section class="nd-subs">${this.tlHtml('Submarines', text, view.subs ? '' : 'dim', 'Submarines\nNo orders by design: in war they go by themselves where the enemy\'s trade lanes cross and his escorts are thin, and sink a share of the cargo that passes. Enemy warships in the same sea hunt them.', '', kitArt('submarine'))}</section>`;
  }

  /**
   * FLEET: sınıf başına gövde, hurda, yeni gemi ve eğitimdekiler. Gemi gemi
   * liste yok — hangi gövdenin gideceğini navy.scrapPicks seçer.
   */
  fleetHtml(view) {
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
    // Yeni gemi: Military ekranıyla aynı yol (buyUnit, Shift = 5).
    const build = (typeId, label) => {
      const blockers = recruitBlockers(this.game, me, typeId);
      const cost = UNIT_TYPES[typeId];
      const tip = blockers.length
        ? `${label}\nNot possible now:\n${blockers.map((b) => b.text).join('\n')}`
        : `${label}\n${cost?.manpower ?? '?'} men from a coastal state; ships equipment from the dockyards. Training queue like any regiment.\nShift-click: order 5.`;
      return `<button class="k-btn xs" type="button" data-nd-build="${typeId}"${blockers.length ? ' disabled aria-disabled="true"' : ''}${tipAttr({ text: tip })}>${label}</button>`;
    };
    const queue = trainingQueue(me).filter((item) => UNIT_TYPES[item.typeId]?.domain === 'sea');
    const turn = this.game.world.turn ?? 0;
    const training = queue.length
      ? `<div class="nd-train">In training: ${plural(queue.filter((i) => i.typeId === 'WARSHIP').length, 'warship')}${queue.some((i) => i.typeId === 'SUBMARINE') ? `, ${plural(queue.filter((i) => i.typeId === 'SUBMARINE').length, 'submarine')}` : ''} · ready ${queue.slice(0, 3).map((item) => dayMonth(turn + weeksLeft(me, item))).join(', ')}${queue.length > 3 ? '…' : ''}${queue.some((item) => Object.keys(item.missing ?? {}).length) ? ' · <span class="bad">short of ships equipment</span>' : ''}</div>`
      : '';
    const auto = isDelegated(me, 'recruitment')
      ? '<div class="nd-train dim">Recruitment is on AUTO: the general staff also builds warships to its own target.</div>' : '';
    const hulls = view.fleet.reduce((sum, row) => sum + row.count, 0);
    const mix = view.classes.map((c) => `${c.count} ${c.count === 1 ? c.name.toLowerCase() : c.plural}${c.gen < SHIP_CLASSES.indexOf(view.current) ? ' (obsolete)' : ''}`).join(' · ');
    return `<details class="nd-fleet"${this.fleetOpen ? ' open' : ''}>
      <summary><span class="nd-fsum">Fleet · ${plural(hulls, 'hull')}${mix ? ` · ${esc(mix)}` : ''}</span>${scrap}</summary>
      ${rows}
      <div class="nd-build"><span class="k">Build</span>${build('WARSHIP', 'Build warship')}${build('SUBMARINE', 'Build submarine')}</div>
      ${training}${auto}
    </details>`;
  }

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
    const sea = seaName(world, record.zone);
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
    const sea = seaName(world, record.zone);
    const title = record.evaded ? `No battle in ${sea}` : record.name;
    const nav = `<div class="nd-card-nav">
        <button class="k-btn xs" type="button" data-nd-back>‹ Back</button>
        <div class="nd-card-title"><b>${navyArt(record.evaded ? 'withdrawal' : 'battle', 'sm')}${esc(title)}</b><small>${record.evaded ? '' : `${esc(sea)} · `}${fullDate(record.turn)}</small></div>
        <button class="k-btn xs" type="button" data-nd-step="${esc(earlier ?? '')}"${earlier ? '' : ' disabled'}>Earlier</button>
        <button class="k-btn xs" type="button" data-nd-step="${esc(later ?? '')}"${later ? '' : ' disabled'}>Later</button>
      </div>`;
    const body = record.evaded ? this.evasionCard(view, record) : this.battleCard(view, record);
    return `<div class="nd-card">${nav}${body}
        <div class="nd-card-foot"><span class="nd-rule"${tipAttr({ text: BATTLE_RULE })}>How sea battles work</span><button class="k-btn xs" type="button" data-nd-show="${record.zone}">Show on map</button></div>
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
      ? `${seaName(world, record.zone)} now: ${now.hostile <= 0 ? (now.friendly > 0 ? 'we hold 100%' : 'no warships') : now.friendly <= 0 ? `${names(world, now.enemyShips.map((e) => e.nation))} ${now.enemyShips.length === 1 ? 'holds' : 'hold'} it` : `we hold ${pct(now.control)}`}${now.blockading.filter((x) => x.share > 0.01).map((x) => ` · blockading ${world.nations[x.nation]?.name ?? '?'} ${pct(x.share)}`).join('')}.`
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
      : `${names(world, weak.nations)}'s fleet refused battle — ${seaName(world, record.zone)} is ours`;
    const vs = `<div class="nd-card-vs"><span><b>${esc(names(world, weak.nations))}</b> ${plural(weak.ships, 'ship')}${weWithdrew ? ` (${weak.sailing ? `${weak.sailing} still sailing` : 'none still sailing'})` : ''} · ${str1(weak.before)}</span><i>vs</i><span><b>${esc(names(world, strong.nations))}</b> ${plural(strong.ships, 'ship')} · ${str1(strong.before)}</span></div>`;
    const lines = [`${ratio.toFixed(2)} : 1 — a fleet less than half as strong as its enemy withdraws instead of fighting.`];
    if (weWithdrew) {
      lines.push(`To fight here the squadron needs ≥ ${str1(strong.before * EVADE_RATIO)}; to be favoured ≈ ${str1(strong.before * 1.1)}.`);
      const manual = me?.navy?.zones?.[record.zone]?.mode === 'manual';
      if (manual) {
        lines.push(`Your order stays: ${linePriorityOf(me.navy.zones[record.zone].weight).name} on ${seaName(world, record.zone)} — the ships sail again on ${until}.`);
      } else {
        const row = view.rows.find((r) => r.zone.id === record.zone);
        lines.push(row?.memo ? `Auto sea: ${memoLine(row.memo)}.` : 'Auto sea: the admiralty decides again each week.');
      }
    } else {
      lines.push(`${names(world, weak.nations)}'s ships cannot return before ${until}.`);
    }
    return `<div class="nd-card-verdict ${weWithdrew ? 'bad' : 'good'}">${esc(head)}</div>${vs}
      <div class="nd-card-after">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
  }

  // --------------------------------------------------------- ÖNİZLEME ---

  /**
   * Önizleme: öncelik düğmesinin üstünde durunca her satırın yeni planı
   * yerinde (→ n), boşalan deniz kırmızı ve sebebi etki satırında; üzerinde
   * durulan denizin öngörüsü üçüncü satırda. Satır yüksekliği değişmez.
   */
  paint() {
    const nation = this.me();
    if (!nation) return;
    const override = this.override();
    const base = this.view();
    const preview = override ? this.view(override) : null;
    const world = this.game.world;
    for (const row of base.rows) {
      const pv = this.root.querySelector(`[data-nd-pv="${row.zone.id}"]`);
      const fx = this.root.querySelector(`[data-nd-fx="${row.zone.id}"]`);
      if (!pv) continue;
      const next = preview?.rows.find((r) => r.zone.id === row.zone.id);
      const changed = next && next.planned !== row.planned;
      pv.textContent = changed ? `→ ${next.planned}` : '';
      pv.className = `nd-pv${changed ? (next.planned === 0 ? ' down' : ' up') : ''}`;
      if (fx) {
        if (changed && next.planned === 0 && next.previewWhy?.code === 'pooled') {
          fx.dataset.saved ??= fx.innerHTML;
          const why = next.previewWhy;
          const seas = (why.by ?? []).map((id) => seaName(world, id)).join(', ');
          const text = why.used > 0
            ? `pooled: your order on ${seas} takes this squadron (${why.ready} ready = ${why.slots} squadron${why.slots === 1 ? '' : 's'})`
            : `pooled: no squadron free (${why.ready} ready = ${why.slots} squadron${why.slots === 1 ? '' : 's'})`;
          fx.innerHTML = `<span class="bad">${esc(text)}</span>`;
        } else if (fx.dataset.saved != null) {
          fx.innerHTML = fx.dataset.saved;
          delete fx.dataset.saved;
        }
      }
    }
    // Üzerinde durulan denizin öngörüsü (satırında öngörü satırı varsa).
    const zoneId = override ? Number(Object.keys(override)[0]) : null;
    for (const fc of this.root.querySelectorAll('[data-nd-fc]')) {
      if (fc.dataset.saved != null && Number(fc.dataset.ndFc) !== zoneId) {
        fc.textContent = fc.dataset.saved;
        delete fc.dataset.saved;
      }
    }
    if (preview && zoneId != null) {
      const row = preview.rows.find((r) => r.zone.id === zoneId);
      const fc = this.root.querySelector(`[data-nd-fc="${zoneId}"]`);
      const line = row?.forecast ? forecastLine(world, row.forecast) : null;
      if (fc && line) {
        fc.dataset.saved ??= fc.textContent;
        fc.textContent = line.text;
      } else if (row?.forecast && row.forecast.theirs > 0) {
        const fx = this.root.querySelector(`[data-nd-fx="${zoneId}"]`);
        if (fx && line) {
          fx.dataset.saved ??= fx.innerHTML;
          fx.innerHTML = `<span class="${line.tone}">${esc(line.text)}</span>`;
        }
      }
    }
  }

  onOver(event) {
    const button = event.target.closest?.('[data-nd-pri]');
    const row = event.target.closest?.('[data-nd-zone], [data-nd-hz]');
    const zone = row ? Number(row.dataset.ndZone ?? row.dataset.ndHz) : null;
    this.hover(button?.dataset.ndPri ?? null, Number.isFinite(zone) ? zone : null);
  }

  hover(key, zoneId) {
    if (key !== this.preview) {
      this.preview = key;
      this.paint();
    }
    this.hoverZone = zoneId;
    this.mark(zoneId);
  }

  /** Bölgeyi haritada işaretler (seaLayer): üstünde durulan, yoksa odak. */
  mark(zoneId) {
    const sea = this.game.renderer?.sea;
    if (!sea) return;
    const target = this.active() ? (zoneId ?? this.focus) : null;
    if (sea.highlight === target) return;
    sea.highlight = target;
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
    const view = this.view();
    if (!view.rows.some((row) => row.zone.id === zoneId && !row.pinned)) this.pin = zoneId;
    const mark = seaZoneMarks(this.game.world, this.me()?.id ?? -1).get(zoneId);
    const recent = mark?.battle?.id ?? mark?.evaded?.id ?? null;
    this.card = recent;
    this.refresh();
    this.root.querySelector(`[data-nd-zone="${zoneId}"]`)?.scrollIntoView({ block: 'nearest' });
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

  /** Öncelik tıklamasının tek cümlelik onayı (HUD): plan neyi değiştirdi. */
  orderNote(before, after, zoneId, step) {
    const row = after.rows.find((r) => r.zone.id === zoneId);
    if (!row) return;
    const levelName = step === 'auto' ? 'Auto' : NAVY_PRIORITIES.find((p) => p.id === step)?.name ?? step;
    const others = after.rows.filter((r) => r.zone.id !== zoneId).map((r) => {
      const was = before.rows.find((b) => b.zone.id === r.zone.id)?.planned ?? 0;
      return r.planned !== was ? `${r.zone.name} ${r.planned - was > 0 ? '+' : '−'}${Math.abs(r.planned - was)}` : null;
    }).filter(Boolean);
    const sail = row.pending > 0
      ? `${plural(row.pending, 'ship')} ${row.pending === 1 ? 'sails' : 'sail'} next week${row.plannedWeeks ? ` (~${row.plannedWeeks} wk)` : ''}`
      : `${plural(row.planned, 'ship')} planned`;
    this.flash(`${row.zone.name}: ${levelName} — ${sail}; ${others.length ? others.join(', ') : 'other seas unchanged'}.`);
  }

  onClick(event) {
    const nation = this.me();
    if (!nation) return;
    const t = event.target;
    const pri = t.closest?.('[data-nd-pri]');
    if (pri) {
      const [zoneText, step] = pri.dataset.ndPri.split(':');
      const zoneId = Number(zoneText);
      const before = this.view();
      setZonePriority(nation, zoneId, step);
      if (this.pin === zoneId && step !== 'auto') this.pin = null;
      this.preview = null;
      const after = this.view();
      this.orderNote(before, after, zoneId, step);
      this.refresh();
      this.game.requestRender?.();
      return;
    }
    if (t.closest?.('[data-nd-quiet]')) {
      this.quietOpen = !this.quietOpen;
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-unpin]')) {
      this.pin = null;
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
      this.refresh();
      this.game.emit?.('economy');
      this.game.requestRender?.();
      return;
    }
    const pick = t.closest?.('[data-nd-scrapg]');
    if (pick) {
      const key = pick.dataset.ndScrapg;
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
      }
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-auto]')) {
      const before = this.view();
      resetZonePriorities(nation);
      const after = this.view();
      const changed = after.rows.filter((r) => (before.rows.find((b) => b.zone.id === r.zone.id)?.planned ?? 0) !== r.planned).length;
      this.flash(`All seas on Auto — the admiralty re-plans at the end of the week${changed ? ` (${plural(changed, 'sea')} change)` : ''}.`);
      this.refresh();
      return;
    }
    const enemy = t.closest?.('[data-nd-enemy]');
    if (enemy && enemy.dataset.ndEnemy !== '') {
      this.centerOn(Number(enemy.dataset.ndEnemy));
      this.refresh();
      return;
    }
    const show = t.closest?.('[data-nd-show]');
    if (show) {
      this.centerOn(Number(show.dataset.ndShow));
      this.refresh();
      return;
    }
    const focus = t.closest?.('[data-nd-focus]');
    if (focus) {
      this.centerOn(Number(focus.dataset.ndFocus));
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
      this.refresh();
      return;
    }
    if (t.closest?.('[data-nd-close]')) {
      document.querySelector('.mode-btn[data-mode="political"]')?.click();
    }
  }
}

function seaName(world, zoneId) {
  return world.seaZones?.zones?.[zoneId]?.name ?? 'the sea';
}

/** Kara hedefinin adı: province (state) adı; deniz hedefinde bölge adı. */
function placeName(world, tile) {
  if (!tile) return null;
  if (tile.terrain?.water) return seaName(world, tile.seaZone);
  return world.provinces?.[tile.provinceId]?.name ?? null;
}
