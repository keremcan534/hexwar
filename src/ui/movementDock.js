// SAG PANEL — ulusal hareketler.
//
// Kerem: "isyanlar giderek ilerleyecekler, sagda bir UI'miz olacak; sagda
// cikan popuplari kaldirabiliriz." Bildirim kartlari artik sag altta tek bir
// sayaca toplanir (ui/notifications.js); sag ust bu panelindir.
//
// Panel hicbir sayiyi kendisi kurmaz: satirlar, asamalar, bedeller ve
// engeller `movements.movementView`dan gelir (TASARIM.md ilke 2: sayi ureten
// gosterendir). Eylemler ayni kapilari cagirir — YZ de onlardan gecer.

import {
  MOVEMENT, crackdown, declareMartialLaw, grantConcessions, movementView, releaseAsVassal,
} from '../game/movements.js';
import { acceptCulture, expelCulture } from '../game/culture.js';
import { formatPopulation } from '../game/economy.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const STORE_KEY = 'hexwar.movementDock.collapsed';

/** Yikici eylemler iki tik ister (savas ilani ile ayni kalip). */
const CONFIRM = new Set(['crackdown', 'vassal', 'expel']);

export class MovementDock {
  constructor(game) {
    this.game = game;
    this.confirm = null;
    this.confirmTimer = 0;
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem(STORE_KEY) === '1'; } catch { /* bos */ }

    this.root = document.createElement('aside');
    this.root.className = 'movement-dock';
    this.root.id = 'movement-dock';
    this.root.setAttribute('aria-label', 'National movements');
    document.body.appendChild(this.root);

    // Tek dinleyici: panel her tazelemede bastan yazilir.
    this.root.addEventListener('click', (event) => this.onClick(event));
    for (const name of ['turn', 'provinces', 'world', 'economy']) {
      game.on?.(name, () => this.refresh());
    }
    this.refresh();
  }

  me() {
    const world = this.game.world;
    return world?.nations?.[this.game.turns?.playerNation] ?? null;
  }

  refresh() {
    const nation = this.me();
    const rows = nation ? movementView(this.game.world, nation) : [];
    // Esigin altindaki sessiz satirlar (ilerleme 0, buyumuyor) panel acmaz:
    // tek kulturlu devlet bu paneli hic gormez.
    const live = rows.filter((row) => row.progress > 0.5 || row.trend > 0);
    this.root.hidden = !live.length;
    if (!live.length) { this.root.innerHTML = ''; return; }
    const worst = live[0];
    const head = `<button class="md-head" data-md-toggle type="button"
        title="${this.collapsed ? 'Show' : 'Hide'} the national movements">
        <span class="md-title">National movements</span>
        <span class="md-count stage-${worst.stage.index}">${live.length}</span>
        <i class="md-chevron" aria-hidden="true">${this.collapsed ? '▸' : '▾'}</i>
      </button>`;
    this.root.classList.toggle('collapsed', this.collapsed);
    this.root.innerHTML = head + (this.collapsed ? '' : `<div class="md-list">${
      live.map((row) => this.rowHtml(row)).join('')}</div>`);
  }

  rowHtml(row) {
    const stage = row.stage;
    const ticks = MOVEMENT.STAGES.slice(1).map((s) => `<i class="md-tick" style="left:${s.at}%"></i>`).join('');
    const pace = row.martialLeft > 0
      ? `martial law · ${row.martialLeft}w`
      : row.calmLeft > 0 ? `exhausted · ${row.calmLeft}w`
        : row.eta != null ? `rises in ~${row.eta}w`
          : 'fading';
    const trend = row.trend > 0.05 ? '▲' : row.trend < -0.05 ? '▼' : '■';
    const swatch = row.color ? `style="--md-color:${esc(row.color)}"` : '';
    const where = row.provinces.length === 1
      ? esc(row.provinces[0].name ?? '1 state') : `${row.provinces.length} states`;
    const a = row.actions;
    const button = (id, label, cfg, tip) => {
      const blocked = cfg.blockers?.length;
      const arming = this.confirm === `${id}:${row.cultureId}`;
      const title = blocked ? cfg.blockers.join(' ') : tip;
      return `<button type="button" class="md-act act-${id}${arming ? ' arming' : ''}"
        data-md-act="${id}" data-md-culture="${row.cultureId}" ${blocked ? 'disabled' : ''}
        title="${esc(title)}">${arming ? 'Confirm?' : label}</button>`;
    };
    return `<section class="md-row stage-${stage.index}" ${swatch}>
      <header class="md-row-head">
        <i class="md-swatch" aria-hidden="true"></i>
        <button type="button" class="md-name" data-md-focus="${row.cultureId}"
          title="Show their states on the map">${esc(row.name)}</button>
        <span class="md-stage">${esc(stage.name)}</span>
      </header>
      <div class="md-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(row.progress)}"
        title="${Math.round(row.progress)}% — at 100% ${esc(where)} break away and ${esc(row.heir?.name ?? 'their people')} goes to war with us">
        <i class="md-fill" style="width:${row.progress.toFixed(1)}%"></i>${ticks}
      </div>
      <p class="md-meta"><b class="md-trend">${trend}</b> ${pace}
        · ${where} · ${formatPopulation(row.people)}
        · unrest ${row.pressure.toFixed(1)}<small>/grows above ${row.calm}</small></p>
      <div class="md-acts">
        ${button('concessions', `Concede · ${a.concessions.cost.toFixed(0)} PP`, a.concessions,
    `Temporary: −${a.concessions.drop}% progress and calmer states, once a year.`)}
        ${button('martial', `Martial law · ${a.martial.cost.toFixed(1)} gold/wk`, a.martial,
    `Temporary: for ${a.martial.weeks} weeks the movement loses ground; costs money every week and some stability.`)}
        ${button('accept', 'Accept', a.accept,
    'Permanent: they become an accepted culture — full taxes and recruits, and the movement dies down. The old nation resents it for two years.')}
        ${button('vassal', `Release · ${a.vassal.provinces}`, a.vassal,
    'Permanent: their states become a vassal — the land is gone, the war never comes, and they pay us 15% of their income.')}
        ${button('crackdown', `Crush · ${formatPopulation(a.crackdown.dead)}`, a.crackdown,
    `Permanent: ${formatPopulation(a.crackdown.dead)} of them die. −${a.crackdown.drop}% progress, heavy infamy, lost stability, and our other peoples grow bolder.`)}
        ${button('expel', 'Expel', a.expel,
    `Permanent: drive all ${formatPopulation(a.expel.people)} of them out of our lands. The movement ends with them; the world will not forget it.`)}
      </div>
    </section>`;
  }

  onClick(event) {
    const toggle = event.target.closest('[data-md-toggle]');
    if (toggle) {
      this.collapsed = !this.collapsed;
      try { localStorage.setItem(STORE_KEY, this.collapsed ? '1' : '0'); } catch { /* bos */ }
      this.refresh();
      return;
    }
    const focus = event.target.closest('[data-md-focus]');
    if (focus) {
      const nation = this.me();
      const row = nation && movementView(this.game.world, nation)
        .find((item) => item.cultureId === Number(focus.dataset.mdFocus));
      const center = row?.provinces?.[0]?.center;
      if (center) this.game.focusTile?.(center);
      return;
    }
    const act = event.target.closest('[data-md-act]');
    if (!act || act.disabled) return;
    const nation = this.me();
    if (!nation) return;
    const id = act.dataset.mdAct;
    const cultureId = Number(act.dataset.mdCulture);
    const key = `${id}:${cultureId}`;
    if (CONFIRM.has(id) && this.confirm !== key) {
      this.confirm = key;
      clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => { this.confirm = null; this.refresh(); }, 6000);
      this.refresh();
      return;
    }
    this.confirm = null;
    clearTimeout(this.confirmTimer);
    const game = this.game;
    const run = {
      concessions: () => grantConcessions(game, nation, cultureId),
      martial: () => declareMartialLaw(game, nation, cultureId),
      accept: () => acceptCulture(game, nation, cultureId),
      vassal: () => releaseAsVassal(game, nation, cultureId),
      crackdown: () => crackdown(game, nation, cultureId),
      expel: () => expelCulture(game, nation, cultureId),
    }[id];
    if (run?.()) {
      game.emit?.('economy', nation.economy);
      game.requestRender?.();
    }
    this.refresh();
  }
}
