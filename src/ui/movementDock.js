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
  MOVEMENT, crackdown, declareMartialLaw, grantConcessions, grantDominion, grantHomeRule,
  movementView, nationalitiesStance, refuseDemand,
} from '../game/movements.js';
import { acceptCulture, acceptPrice } from '../game/culture.js';
import { releasePeople } from '../game/nationBirth.js';
import { deport } from '../game/culturePolicy.js';
import { formatPopulation } from '../game/economy.js';
import { money } from './kit.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const STORE_KEY = 'hexwar.movementDock.collapsed';

/** Yikici eylemler iki tik ister (savas ilani ile ayni kalip). */
const CONFIRM = new Set(['crackdown', 'vassal', 'expel', 'refuse', 'dominion']);

/** Talep izlerinin aşama adları (yalnız gösterim; eşikler TASARIM D1). */
const TRACK_STAGES = {
  citizen: [[0, 'Cultural revival'], [40, 'Home Rule League'], [70, 'Crisis looming']],
  homeRule: [[0, 'Self-rule'], [50, 'Separatism']],
};
const trackStage = (track, progress) => (TRACK_STAGES[track] ?? [])
  .filter(([at]) => progress >= at).at(-1)?.[1] ?? '';

const STANCES = [
  ['accommodate', 'Accommodate', 'Grant rights early and say yes to their demands.'],
  ['balance', 'Balance', 'Grant rights at Insurgency, buy time with concessions, say yes when it must.'],
  ['repress', 'Repress', 'Rights only for the largest peoples; martial law early; refuse demands while the state is strong.'],
];

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
    const stance = nationalitiesStance(nation);
    // Kabinenin halklara cevabı tek bir duruştur: oyuncu her krizi elle
    // cevaplamak zorunda değil (ev ödevi testi); 13 hafta içinde cevaplamazsa
    // kabine bu duruşla cevaplar (ama asla reddetmez, toprak vermez).
    const policy = `<div class="md-policy" title="Nationalities policy — how your cabinet answers your peoples' demands when you don't.">
        ${STANCES.map(([id, label, tip]) => `<button type="button" class="md-stance${id === stance ? ' on' : ''}"
          data-md-stance="${id}" title="${esc(tip)}">${label}</button>`).join('')}
      </div>`;
    this.root.innerHTML = head + (this.collapsed ? '' : `${policy}<div class="md-list">${
      live.map((row) => this.rowHtml(row)).join('')}</div>`);
  }

  rowHtml(row) {
    const stage = row.stage;
    const subject = row.track === 'subject';
    const ticks = subject
      ? MOVEMENT.STAGES.slice(1).map((s) => `<i class="md-tick" style="left:${s.at}%"></i>`).join('')
        + `<i class="md-tick brink" style="left:${MOVEMENT.BRINK}%"></i>`
      : (TRACK_STAGES[row.track] ?? []).slice(1).map(([at]) => `<i class="md-tick" style="left:${at}%"></i>`).join('');
    const ask = row.track === 'homeRule' ? 'a state of their own' : 'Home Rule';
    const pace = row.crisis ? `answer within ${row.crisis.left}w`
      : row.atBrink ? 'at the brink — they rise the moment the state falters'
        : row.martialLeft > 0 ? `martial law · ${row.martialLeft}w`
          : row.calmLeft > 0 ? `exhausted · ${row.calmLeft}w`
            : row.eta != null ? (subject ? `rises in ~${row.eta}w` : `asks for ${ask} in ~${row.eta}w`)
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
    const chip = { subject: 'Subjects', citizen: 'Citizens', homeRule: 'Home Rule' }[row.track] ?? '';
    const stageName = subject ? stage.name : trackStage(row.track, row.progress);
    const barTip = subject
      ? `${Math.round(row.progress)}% — they rise at 100% (in peace they wait at the brink, ${MOVEMENT.BRINK}%, until the state falters); ${where} break away to ${row.heir?.name ?? 'their own state'}`
      : `${Math.round(row.progress)}% — at 100% they demand ${ask}. Peoples always want more: each grant buys years of calm and starts the next demand.`;
    let acts;
    if (row.crisis) {
      const c = row.crisis;
      const homeRuleCrisis = c.kind === 'homeRule';
      acts = `${button(homeRuleCrisis ? 'homerule' : 'dominion', c.grant.label, c.grant,
        homeRuleCrisis
          ? 'They govern themselves: half their recruits, and in time they will want a state of their own.'
          : 'Their provinces become our Dominion: permanent peace, 7.5% of their output as tribute.')}
        ${button('concessions', `Concede · ${c.concessions.cost.toFixed(0)} PP`, c.concessions,
    `Buys time: −${a.concessions.drop}% demand, once a year, dearer every time.`)}
        ${button('refuse', 'Refuse', c.refuse,
    homeRuleCrisis
      ? 'They lose their citizenship; their movement returns at Resistance.'
      : 'They lose self-rule and rights; they will rise the moment the state falters.')}`;
    } else if (!subject) {
      acts = button('concessions', `Concede · ${a.concessions.cost.toFixed(0)} PP`, a.concessions,
        `Buys time: −${a.concessions.drop}% demand, once a year, dearer every time.`);
    } else {
      acts = `${button('concessions', `Concede · ${a.concessions.cost.toFixed(0)} PP`, a.concessions,
    `Temporary: −${a.concessions.drop}% progress and calmer states, once a year, dearer every time.`)}
        ${button('martial', `Martial law · ${money(a.martial.cost, 1)}/wk`, a.martial,
    `Temporary: for ${a.martial.weeks} weeks the movement loses ground; costs money every week and some stability.`)}
        ${button('accept', `Grant citizenship · ${acceptPrice(this.me())} PP`, a.accept,
    'They get equal rights: full recruits and calmer provinces — but the old nation resents it for two years, and they will start asking for Home Rule.')}
        ${button('vassal', `Dominion · ${a.vassal.provinces}`, a.vassal,
    'Permanent: their provinces become our Dominion — the land is gone, the war never comes, and they pay us 7.5% of their output.')}
        ${button('crackdown', `Crush · ${formatPopulation(a.crackdown.dead)}`, a.crackdown,
    `Permanent: ${formatPopulation(a.crackdown.dead)} of them die. −${a.crackdown.drop}% progress, heavy infamy, lost stability, and our other peoples grow bolder.`)}
        ${button('expel', 'Expel', a.expel,
    `Permanent: drive all ${formatPopulation(a.expel.people)} of them across the border to their kin or a neighbour. The movement ends with them; the world will not forget it.`)}`;
    }
    return `<section class="md-row stage-${subject ? stage.index : 0}${row.crisis ? ' crisis' : ''}" ${swatch}>
      <header class="md-row-head">
        <i class="md-swatch" aria-hidden="true"></i>
        <button type="button" class="md-name" data-md-focus="${row.cultureId}"
          title="Show their states on the map">${esc(row.name)}</button>
        <span class="md-stage">${esc(chip)} · ${esc(stageName)}</span>
      </header>
      <div class="md-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(row.progress)}" title="${esc(barTip)}">
        <i class="md-fill" style="width:${row.progress.toFixed(1)}%"></i>${ticks}
      </div>
      <p class="md-meta"><b class="md-trend">${trend}</b> ${pace}
        · ${where} · ${formatPopulation(row.people)}${subject
    ? ` · unrest ${row.pressure.toFixed(1)}<small>/grows above ${row.calm}</small>` : ''}</p>
      <div class="md-acts">${acts}</div>
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
    const stance = event.target.closest('[data-md-stance]');
    if (stance) {
      const nation = this.me();
      if (nation?.politics) nation.politics.nationalities = stance.dataset.mdStance;
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
      vassal: () => releasePeople(game, nation, cultureId, { dominion: true }),
      homerule: () => grantHomeRule(game, nation, cultureId),
      dominion: () => grantDominion(game, nation, cultureId),
      refuse: () => refuseDemand(game, nation, cultureId),
      crackdown: () => crackdown(game, nation, cultureId),
      expel: () => deport(game, nation, cultureId),
    }[id];
    if (run?.()) {
      game.emit?.('economy', nation.economy);
      game.requestRender?.();
    }
    this.refresh();
  }
}
