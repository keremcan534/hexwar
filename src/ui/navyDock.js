// SOL PANEL — donanma (deniz haritası, Seas kipi, açıkken).
//
// Kerem: donanma "eğlenceli ama kanser olmayan" olsun. Gemi gemi değil deniz
// deniz yönetilir (game/navy.js): her satır bir deniz bölgesi, tek karar
// öncelik (Factories'teki üretim hatlarıyla aynı kademeler ve aynı düğme
// dili). Panel sayı kurmaz; hepsi navyView'den gelir. Öncelik düğmesinin
// üstünde durmak yeni dağılımı (bölge başına gemi) satırlarda ve çubukta
// yerinde önizler; satırın üstünde durmak bölgeyi haritada işaretler.

import {
  NAVY_PRIORITIES, NAVY_STEPS, SCRAP_REFUND, SQUADRON, navyView, resetZonePriorities, scrapGroup, scrapObsolete,
  setZonePriority,
} from '../game/navy.js';
import { linePriorityOf } from '../game/econ/industry.js';
import { seaTradeLoss } from '../game/seaLanes.js';
import { tipAttr } from './kit.js';
import { quietScroll } from './tooltip.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;

/** Hâkimiyetin tonu: çubuk ve dağılım dilimi aynı rengi okur. */
function toneOf(row) {
  if (row.hostile > 0 && row.friendly > 0) return 'contested';
  if (row.hostile > 0) return 'enemy';
  if (row.friendly > 0) return 'ours';
  // 'empty' değil: styles.css'teki genel .empty kuralı (dolgu, ortalı metin)
  // satıra ve çubuğa sızıyor, boş denizde kocaman siyah kutu çiziyordu.
  return 'quiet';
}

export class NavyDock {
  constructor(game) {
    this.game = game;
    this.preview = null;
    this.focus = null;
    this.confirmScrap = false;
    this.confirmTimer = 0;
    this.confirmKey = null;
    this.fleetOpen = false;
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
    for (const name of ['turn', 'world', 'mapmode', 'politics']) game.on?.(name, () => this.refresh());
    window.addEventListener('resize', () => this.fit());
    // Deniz haritasında suya tıklamak bölgesini panelde öne çıkarır.
    game.on?.('select', (tile) => {
      if (!this.active() || !tile?.terrain?.water || !(tile.seaZone >= 0)) return;
      this.focus = tile.seaZone;
      this.refresh();
      this.root.querySelector(`[data-nd-zone="${tile.seaZone}"]`)?.scrollIntoView({ block: 'nearest' });
    });
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
    return level ? { [zoneId]: level.weight } : null;
  }

  refresh() {
    const nation = this.me();
    const on = this.active() && !!nation?.alive;
    this.root.hidden = !on;
    document.body.classList.toggle('navy-open', on);
    if (!on) {
      this.root.innerHTML = '';
      this.mark(null);
      return;
    }
    const view = navyView(this.game.world, nation);
    // Aynı içerik yeniden yazılmaz; yazılırsa bölge listesinin kaydırması
    // korunur — haftalık tazeleme listeyi her hafta başa atıyordu.
    const html = this.html(view);
    if (html !== this.lastHtml || !this.root.firstChild) {
      const keep = this.root.querySelector('.nd-list')?.scrollTop ?? 0;
      this.root.innerHTML = html;
      this.lastHtml = html;
      const list = keep ? this.root.querySelector('.nd-list') : null;
      if (list) {
        quietScroll(list);
        list.scrollTop = keep;
      }
    }
    if (this.preview) this.paint();
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
    this.root.style.maxHeight = `${Math.max(160, Math.floor(floor - me.top - 10))}px`;
  }

  html(view) {
    const head = `<header class="nd-head">
        <span class="nd-title">Navy</span>
        <span class="nd-sum"${tipAttr({ text: `Fleet\n${view.total} warships: ${view.atSea} at sea, ${view.sailing} under way, ${view.inPort} in port${view.repairing ? ` (${view.repairing} repairing)` : ''}${view.withdrawn ? `, ${view.withdrawn} withdrawn after a defeat or to avoid a stronger fleet (back in a few weeks)` : ''}.${view.classes.length ? `\n${view.classes.map((c) => `${c.count} ${c.count === 1 ? c.name.toLowerCase() : c.plural}`).join(', ')}. New hulls are ${view.current.plural}.` : ''}${view.subs ? `\n${view.subs} submarine${view.subs === 1 ? '' : 's'} (${view.subsAtSea} hunting): in war they go by themselves where the enemy's trade lanes cross and his escorts are thin.` : ''}\nShips are built on the Military screen (Naval) and need ships equipment from the dockyards.` })}>
          <b>${view.total}</b> ships · ${view.atSea} at sea${view.sailing ? ` · ${view.sailing} under way` : ''}${view.repairing ? ` · ${view.repairing} repairing` : ''}${view.withdrawn ? ` · ${view.withdrawn} withdrawn` : ''}${view.subs ? ` · U×${view.subs}` : ''}
        </span>
        <button class="k-btn sm" type="button" data-nd-auto${Object.keys(this.me()?.navy?.zones ?? {}).length
          ? tipAttr({ text: 'All seas to Auto\nThe admiralty guards your home waters. In war it gathers the fleet: shared waters first, the enemy coast when the fleet is strong enough to blockade, and it stays in port rather than meet a stronger fleet.' })
          : ' disabled'}>All to Auto</button>
        <button class="nd-close" type="button" data-nd-close aria-label="Close the naval map"${tipAttr({ text: 'Close the naval map (M)' })}>✕</button>
      </header>`;
    // Durum satırı HEP vardır: abluka başlayıp bitince gelip giden satır
    // altındaki çubuğu ve listeyi 30 piksel oynatıyordu (8x jitter sondası).
    const blockaded = view.blockade > 0.01;
    // Eskimiş gövde (dretnot anı): hurdaya ayırma iki tık ister, yıkıcıdır.
    const ratio = (cls) => Math.round(cls.power / view.current.power * 100);
    const oldest = view.classes[view.classes.length - 1];
    const scrap = view.obsolete
      ? `<button class="k-btn xs nd-scrap${this.confirmScrap ? ' confirm' : ''}" type="button" data-nd-scrap${tipAttr({ text: `Scrap obsolete ships\n${view.obsolete} of your warships are older than the ${view.current.name.toLowerCase()} you can now build: ${oldest ? `${oldest.plural} fight at ${ratio(oldest)}% of one` : 'they fight weaker'}, yet cost the same upkeep and crew. Scrapping sends the crews home and returns ${Math.round(SCRAP_REFUND * 100)}% of the ships equipment.` })}>${this.confirmScrap ? `Confirm: scrap ${view.obsolete}` : `Scrap ${view.obsolete} obsolete`}</button>`
      : '';
    // Yollarda kesilen pay (seaLanes): düşmanın tuttuğu ara deniz ve akın.
    const laneLoss = seaTradeLoss(this.game.world, this.me()?.id ?? -1);
    const cut = !blockaded && laneLoss > 0.02;
    const blockade = `<div class="nd-status${blockaded || cut ? ' bad' : ''}"><span${tipAttr({ text: 'Sea trade\nTrade with partners you do not border sails along the lanes on the naval map. Enemy warships holding the seas off your coast blockade it; an enemy sea on the way, or submarines on a lane, sink the cargo that passes. Win those seas, or send warships to escort the lanes.' })}>${blockaded
      ? `Our coast is blockaded — sea trade −${pct(view.blockade)}`
      : cut ? `Raiders and enemy seas cut our sea trade −${pct(laneLoss)}`
        : 'Our coasts are open — sea trade flows'}</span>${scrap}</div>`;
    if (!view.total && !view.rows.length) {
      return `${head}<p class="nd-empty">No coast, no navy.</p>`;
    }
    const fleet = view.fleet.length ? this.fleetHtml(view) : '';
    const empty = !view.total
      ? `<p class="nd-empty">No warships yet. Build them on the Military screen (Naval): a coastal state supplies the crew, the dockyards the ships equipment.</p>` : '';
    const rows = view.rows.map((row) => this.rowHtml(row, view)).join('');
    // Son muharebe tek, sabit yükseklikte bir yuvadır; öncekiler ipucunda.
    // Değişken sayıda rapor paneli boyuna oynatıyordu.
    const recent = view.reports.slice(-4).reverse();
    const older = recent.slice(1).map((report) => `${report.name}: ${this.outcome(report).text}`).join('\n');
    const reports = `<div class="nd-reports"${older ? tipAttr({ text: `Earlier battles\n${older}` }) : ''}><small>Last sea battle${view.reports.length > 1 ? ` · ${view.reports.length} in six months` : ''}</small>${recent.length
      ? this.reportHtml(recent[0])
      : '<div class="nd-report quiet"><b>—</b><span>No sea battles in the last six months.</span></div>'}</div>`;
    return `${head}${blockade}${fleet}${empty}
      <div class="nd-bar" data-nd-bar>${this.barHtml(view)}</div>
      <div class="nd-list">${rows}</div>
      ${reports}`;
  }

  /**
   * Filo katı: sınıf (ve denizaltı) başına gövde sayısı ve hurda. Gemi gemi
   * liste yok — denizler gibi grup grup; hangi gövdenin gideceğini
   * navy.scrapPicks seçer (önce limandaki, sonra en hasarlı).
   */
  fleetHtml(view) {
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
        <small>${row.inPort} in port</small>
        <span class="nd-fbtn">${button(row, 1)}${row.count > 1 ? button(row, 'all') : ''}</span>
      </div>`).join('');
    const hulls = view.fleet.reduce((sum, row) => sum + row.count, 0);
    return `<details class="nd-fleet"${this.fleetOpen ? ' open' : ''}>
      <summary>Fleet · ${hulls} ${hulls === 1 ? 'hull' : 'hulls'}<small>scrap ships</small></summary>${rows}</details>`;
  }

  barHtml(view) {
    const total = Math.max(1, view.ready);
    return view.rows.filter((row) => row.target > 0).map((row) => `<i class="nd-seg ${toneOf(row)}" data-nd-seg="${row.zone.id}" style="width:${(row.target / total * 100).toFixed(1)}%"${tipAttr({ text: `${row.zone.name}\n${row.target} of ${view.ready} ready ships.` })}><span>${esc(row.zone.name)} <b data-nd-segv="${row.zone.id}">${row.target}</b></span></i>`).join('');
  }

  rowHtml(row, view) {
    const zone = row.zone;
    const auto = row.priority.mode !== 'manual';
    const current = linePriorityOf(auto ? row.weight : row.priority.weight);
    // Kol kuralı (navy.SQUADRON): Auto'nun istediği ama küçük filoda ana
    // filoya kattığı deniz "kept with the fleet" diye açıklanır.
    const pooled = auto && row.autoWeight > 0 && row.weight <= 0;
    const steps = NAVY_STEPS.map((step) => {
      const level = NAVY_PRIORITIES.find((p) => p.id === step);
      const on = step === 'auto' ? auto : !auto && current.id === step;
      const at = auto && level && current.id === step;
      const why = pooled
        ? `\nAuto keeps warships together in squadrons of at least ${SQUADRON}: ${view.ready} ready ${view.ready === 1 ? 'ship holds' : 'ships hold'} ${Math.max(1, Math.floor(view.ready / SQUADRON))} ${Math.max(1, Math.floor(view.ready / SQUADRON)) === 1 ? 'sea' : 'seas'}, so this one waits for a bigger fleet.`
        : '\nThe admiralty decides: home waters in peace; in war the shared waters, the enemy coast when the fleet is strong enough, never a sea held by a stronger fleet.';
      const tip = level ? null : { text: `Auto${auto ? ` — now ${current.id === 'off' ? 'off' : current.name}` : ''}${why}` };
      return `<button class="pl-pb${level ? '' : ' auto'}${on ? ' on' : ''}${at ? ' at' : ''}" type="button" data-nd-pri="${zone.id}:${step}"${tipAttr(tip)}>${level ? level.name : 'Auto'}</button>`;
    });
    const tags = [
      row.home ? `<em class="nd-tag home"${tipAttr({ text: `Home waters\n${row.ourCoast} of our coastal states lie on this sea. Your warships fight 20% harder here.` })}>home</em>` : '',
      row.blockading.length ? `<em class="nd-tag enemy"${tipAttr({ text: 'Enemy coast\nA nation we are at war with has a coast on this sea.' })}>enemy coast</em>` : '',
    ].join('');
    const enemy = row.enemyShips.reduce((sum, e) => sum + e.ships, 0);
    const effects = [];
    for (const b of row.blockading) {
      const name = this.game.world.nations[b.nation]?.name ?? '?';
      effects.push(b.share > 0.01
        ? `<span class="good">blockading ${esc(name)} ${pct(b.share)}</span>`
        : `<span>${esc(name)}'s coast open</span>`);
    }
    if (row.ourBlockade > 0.01) effects.push(`<span class="bad">our coast blockaded ${pct(row.ourBlockade)}</span>`);
    if (row.transportRisk > 0.005) effects.push(`<span class="bad">transports lose ${pct(row.transportRisk)}/wk</span>`);
    if (row.raidedShare > 0.01) effects.push(`<span class="bad">${row.enemySubs} enemy U-boat${row.enemySubs === 1 ? '' : 's'}: our cargo −${pct(row.raidedShare)}</span>`);
    if (row.ourSubs) effects.push(`<span class="good">our U-boats ${row.ourSubs}${row.raidingShare > 0.01 ? `: enemy cargo −${pct(row.raidingShare)}` : ''}</span>`);
    if (enemy) effects.push(`<span class="bad">${enemy} enemy ${enemy === 1 ? 'ship' : 'ships'}</span>`);
    if (row.admiral) effects.push(`<span${tipAttr({ text: `Admiral ${row.admiral.name}\nSkill ${row.admiral.skill}: the fleet on this sea fights ${Math.round(row.admiral.skill * 6)}% harder.` })}>Adm. ${esc(row.admiral.name.split(' ').pop())}</span>`);
    const tone = toneOf(row);
    // Düşmansız denizde yüzde anlamsızdır (hep %100): "held"; deniz tamamen
    // düşmandaysa "lost"; çekişmede pay.
    const label = row.hostile <= 0 ? 'held' : row.friendly <= 0 ? 'lost' : pct(row.control);
    const control = row.friendly + row.hostile > 0
      ? `<span class="nd-ctl ${tone}"${tipAttr({ text: `Control ${pct(row.control)}\nOur and allied strength ${row.friendly.toFixed(1)} against ${row.hostile.toFixed(1)} enemy. Whoever holds a sea blockades the coasts on it and sinks transports crossing it.` })}><i style="width:${pct(row.control)}"></i></span><b class="nd-ctlv${row.hostile <= 0 ? ' dim' : ''}">${label}</b>`
      : '<span class="nd-ctl quiet"><i style="width:0"></i></span><b class="nd-ctlv dim">—</b>';
    const ships = `<span class="nd-ships"${tipAttr({ text: `${zone.name}\n${row.present} of our ships on station${row.sailing ? `, ${row.sailing} under way` : ''}. The current priorities send ${row.target}.` })}><b data-nd-target="${zone.id}">${row.present}</b>${row.sailing ? `<small>+${row.sailing}</small>` : ''}<small>ships</small></span>`;
    return `<div class="nd-row ${tone}${this.focus === zone.id ? ' focus' : ''}" data-nd-zone="${zone.id}">
      <div class="nd-row-head">
        <button class="nd-name" type="button" data-nd-focus="${zone.id}"${tipAttr({ text: `${zone.name}\nShow on the map.` })}>${esc(zone.name)}</button>${tags}
        ${ships}
      </div>
      <div class="nd-row-mid">
        <span class="pl-pri nd-pri">${steps[0]}<span class="pl-tiers">${steps.slice(1).join('')}</span></span>
        ${control}
      </div>
      <div class="nd-fx"${effects.length > 2 ? tipAttr({ text: `${zone.name}\n${effects.map((e) => e.replace(/<[^>]+>/g, '')).join('\n')}` }) : ''}>${effects.join('<i>·</i>') || '<span class="dim">quiet waters</span>'}</div>
    </div>`;
  }

  /** Raporun oyuncu açısından özeti (ham metin). */
  outcome(report) {
    const world = this.game.world;
    const me = this.game.turns?.playerNation;
    const mine = report.sides.findIndex((side) => side.nations.includes(me));
    const us = report.sides[mine];
    const them = report.sides[1 - mine];
    const won = report.winner === mine;
    const enemy = them.nations.map((id) => world.nations[id]?.name).filter(Boolean).join(', ');
    const sunk = [
      them.sunk.length ? `sank ${them.sunk.map((s) => s.name).join(', ')}` : '',
      us.sunk.length ? `lost ${us.sunk.map((s) => s.name).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    return { won, text: `${won ? 'Victory' : 'Defeat'} vs ${enemy}${sunk ? ` — ${sunk}` : ''}` };
  }

  reportHtml(report) {
    const { won, text } = this.outcome(report);
    return `<div class="nd-report ${won ? 'won' : 'lost'}"><b>${esc(report.name)}</b><span>${esc(text)}</span></div>`;
  }

  /** Önizleme: dağılım çubuğu ve satırların gemi sayısı yerinde. */
  paint() {
    const nation = this.me();
    if (!nation) return;
    const view = navyView(this.game.world, nation, this.override());
    const bar = this.root.querySelector('[data-nd-bar]');
    if (bar) bar.innerHTML = this.barHtml(view);
    for (const row of view.rows) {
      const cell = this.root.querySelector(`[data-nd-target="${row.zone.id}"]`);
      if (!cell) continue;
      const preview = this.preview != null;
      cell.textContent = preview ? String(row.target) : String(row.present);
      cell.classList.toggle('pv-up', preview && row.target > row.present);
      cell.classList.toggle('pv-down', preview && row.target < row.present);
    }
    bar?.classList.toggle('preview', this.preview != null);
  }

  onOver(event) {
    const button = event.target.closest?.('[data-nd-pri]');
    const row = event.target.closest?.('[data-nd-zone]');
    this.hover(button?.dataset.ndPri ?? null, row ? Number(row.dataset.ndZone) : null);
  }

  hover(key, zoneId) {
    if (key !== this.preview) {
      this.preview = key;
      this.paint();
    }
    this.mark(zoneId);
  }

  /** Satırın bölgesini haritada işaretler (seaLayer). */
  mark(zoneId) {
    const sea = this.game.renderer?.sea;
    if (!sea || sea.highlight === zoneId) return;
    sea.highlight = zoneId;
    this.game.requestRender?.();
  }

  onClick(event) {
    const nation = this.me();
    if (!nation) return;
    const pri = event.target.closest?.('[data-nd-pri]');
    if (pri) {
      const [zoneId, step] = pri.dataset.ndPri.split(':');
      setZonePriority(nation, Number(zoneId), step);
      this.refresh();
      this.game.requestRender?.();
      return;
    }
    if (event.target.closest?.('[data-nd-scrap]')) {
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
    const pick = event.target.closest?.('[data-nd-scrapg]');
    if (pick) {
      // İki tık: ilki onay ister, dört saniye içinde ikincisi hurdaya ayırır.
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
    if (event.target.closest?.('[data-nd-auto]')) {
      resetZonePriorities(nation);
      this.refresh();
      return;
    }
    const focus = event.target.closest?.('[data-nd-focus]');
    if (focus) {
      const zone = this.game.world.seaZones?.zones?.[Number(focus.dataset.ndFocus)];
      const tile = zone ? this.game.world.tiles[zone.anchor] : null;
      if (tile) this.game.focusTile?.(tile);
      this.focus = zone?.id ?? null;
      this.refresh();
      return;
    }
    if (event.target.closest?.('[data-nd-close]')) {
      document.querySelector('.mode-btn[data-mode="political"]')?.click();
    }
  }
}
