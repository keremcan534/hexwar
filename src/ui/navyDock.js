// SOL PANEL — donanma (deniz haritası, Seas kipi, açıkken).
//
// Kerem: donanma "eğlenceli ama kanser olmayan" olsun. Gemi gemi değil deniz
// deniz yönetilir (game/navy.js): her satır bir deniz bölgesi, tek karar
// öncelik (Factories'teki üretim hatlarıyla aynı kademeler ve aynı düğme
// dili). Panel sayı kurmaz; hepsi navyView'den gelir. Öncelik düğmesinin
// üstünde durmak yeni dağılımı (bölge başına gemi) satırlarda ve çubukta
// yerinde önizler; satırın üstünde durmak bölgeyi haritada işaretler.

import {
  NAVY_PRIORITIES, NAVY_STEPS, navyView, resetZonePriorities, setZonePriority,
} from '../game/navy.js';
import { linePriorityOf } from '../game/econ/industry.js';
import { tipAttr } from './kit.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;

/** Hâkimiyetin tonu: çubuk ve dağılım dilimi aynı rengi okur. */
function toneOf(row) {
  if (row.hostile > 0 && row.friendly > 0) return 'contested';
  if (row.hostile > 0) return 'enemy';
  if (row.friendly > 0) return 'ours';
  return 'empty';
}

export class NavyDock {
  constructor(game) {
    this.game = game;
    this.preview = null;
    this.focus = null;
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
    for (const name of ['turn', 'world', 'mapmode', 'politics']) game.on?.(name, () => this.refresh());
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
    if (!on) {
      this.root.innerHTML = '';
      this.mark(null);
      return;
    }
    const view = navyView(this.game.world, nation);
    this.root.innerHTML = this.html(view);
    if (this.preview) this.paint();
  }

  html(view) {
    const head = `<header class="nd-head">
        <span class="nd-title">Navy</span>
        <span class="nd-sum"${tipAttr({ text: `Fleet\n${view.total} warships: ${view.atSea} at sea, ${view.sailing} under way, ${view.inPort} in port${view.repairing ? ` (${view.repairing} repairing)` : ''}.\nShips are built on the Military screen (Naval) and need ships equipment from the dockyards.` })}>
          <b>${view.total}</b> ships · ${view.atSea} at sea${view.sailing ? ` · ${view.sailing} under way` : ''}${view.repairing ? ` · ${view.repairing} repairing` : ''}
        </span>
        <button class="k-btn sm" type="button" data-nd-auto${Object.keys(this.me()?.navy?.zones ?? {}).length
          ? tipAttr({ text: 'All seas to Auto\nThe admiralty guards your home waters and, in war, blockades the enemy coast where the fleet is strong enough.' })
          : ' disabled'}>All to Auto</button>
        <button class="nd-close" type="button" data-nd-close aria-label="Close the naval map"${tipAttr({ text: 'Close the naval map (M)' })}>✕</button>
      </header>`;
    const blockade = view.blockade > 0.01
      ? `<p class="nd-alert"${tipAttr({ text: 'Blockade\nEnemy warships hold the seas off your coast: trade by sea with partners you do not border is cut by this share. Win the sea back, or trade by land.' })}>Our coast is blockaded — sea trade −${pct(view.blockade)}</p>` : '';
    if (!view.total && !view.rows.length) {
      return `${head}<p class="nd-empty">No coast, no navy.</p>`;
    }
    const empty = !view.total
      ? `<p class="nd-empty">No warships yet. Build them on the Military screen (Naval): a coastal state supplies the crew, the dockyards the ships equipment.</p>` : '';
    const rows = view.rows.map((row) => this.rowHtml(row, view)).join('');
    const reports = view.reports.slice(-3).reverse().map((report) => this.reportHtml(report)).join('');
    return `${head}${blockade}${empty}
      <div class="nd-bar" data-nd-bar>${this.barHtml(view)}</div>
      <div class="nd-list">${rows}</div>
      ${reports ? `<div class="nd-reports"><small>Recent battles</small>${reports}</div>` : ''}`;
  }

  barHtml(view) {
    const total = Math.max(1, view.ready);
    return view.rows.filter((row) => row.target > 0).map((row) => `<i class="nd-seg ${toneOf(row)}" data-nd-seg="${row.zone.id}" style="width:${(row.target / total * 100).toFixed(1)}%"${tipAttr({ text: `${row.zone.name}\n${row.target} of ${view.ready} ready ships.` })}><span>${esc(row.zone.name)} <b data-nd-segv="${row.zone.id}">${row.target}</b></span></i>`).join('');
  }

  rowHtml(row, view) {
    const zone = row.zone;
    const auto = row.priority.mode !== 'manual';
    const current = linePriorityOf(auto ? row.autoWeight : row.priority.weight);
    const steps = NAVY_STEPS.map((step) => {
      const level = NAVY_PRIORITIES.find((p) => p.id === step);
      const on = step === 'auto' ? auto : !auto && current.id === step;
      const at = auto && level && current.id === step;
      const tip = level ? null : { text: `Auto${auto ? ` — now ${current.id === 'off' ? 'off' : current.name}` : ''}\nThe admiralty decides: home waters in peace, the enemy coast in war when the fleet is strong enough.` };
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
    if (enemy) effects.push(`<span class="bad">${enemy} enemy ${enemy === 1 ? 'ship' : 'ships'}</span>`);
    if (row.admiral) effects.push(`<span${tipAttr({ text: `Admiral ${row.admiral.name}\nSkill ${row.admiral.skill}: the fleet on this sea fights ${Math.round(row.admiral.skill * 6)}% harder.` })}>Adm. ${esc(row.admiral.name.split(' ').pop())}</span>`);
    const tone = toneOf(row);
    // Düşmansız denizde yüzde anlamsızdır (hep %100): "held"; deniz tamamen
    // düşmandaysa "lost"; çekişmede pay.
    const label = row.hostile <= 0 ? 'held' : row.friendly <= 0 ? 'lost' : pct(row.control);
    const control = row.friendly + row.hostile > 0
      ? `<span class="nd-ctl ${tone}"${tipAttr({ text: `Control ${pct(row.control)}\nOur and allied strength ${row.friendly.toFixed(1)} against ${row.hostile.toFixed(1)} enemy. Whoever holds a sea blockades the coasts on it and sinks transports crossing it.` })}><i style="width:${pct(row.control)}"></i></span><b class="nd-ctlv${row.hostile <= 0 ? ' dim' : ''}">${label}</b>`
      : '<span class="nd-ctl empty"><i style="width:0"></i></span><b class="nd-ctlv dim">—</b>';
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
      <div class="nd-fx">${effects.join('<i>·</i>') || '<span class="dim">quiet waters</span>'}</div>
    </div>`;
  }

  reportHtml(report) {
    const world = this.game.world;
    const me = this.game.turns?.playerNation;
    const mine = report.sides.findIndex((side) => side.nations.includes(me));
    const us = report.sides[mine];
    const them = report.sides[1 - mine];
    const won = report.winner === mine;
    const enemy = them.nations.map((id) => world.nations[id]?.name).filter(Boolean).join(', ');
    const sunk = [
      them.sunk.length ? `sank ${them.sunk.map((s) => esc(s.name)).join(', ')}` : '',
      us.sunk.length ? `lost ${us.sunk.map((s) => esc(s.name)).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="nd-report ${won ? 'won' : 'lost'}"><b>${esc(report.name)}</b><span>${won ? 'Victory' : 'Defeat'} vs ${esc(enemy)}${sunk ? ` — ${sunk}` : ''}</span></div>`;
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
