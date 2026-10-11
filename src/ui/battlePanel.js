// MUHAREBE PENCERESİ (HOI4'ün savaş penceresi). Haritadaki muharebe künyesine
// ya da muharebe bildirimine tıklayınca açılır, her hafta tazelenir, muharebe
// bitince sonucu gösterip açık kalır (oyuncu kapatır).
//
// Panel sayı kurmaz: her şey game/battleView.js'ten gelir — motorun kendi
// çarpanları ve kayıp sabitleri. "Kim kaç haftada kırılır" bir tahmindir ve
// öyle yazılır.

import { battleView } from '../game/battleView.js';
import { formatPopulation } from '../game/economy.js';
import { esc, tipAttr } from './kit.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `×${v.toFixed(2)}`;

export class BattlePanel {
  constructor(game) {
    this.game = game;
    this.battleId = null;
    this.last = null;      // son görünüm: muharebe bitince sonucu bununla yazar
    this.result = null;    // { winner: 'attacker'|'defender' }

    this.root = document.createElement('aside');
    this.root.className = 'battle-panel';
    this.root.id = 'battle-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Battle');
    document.body.appendChild(this.root);
    // SÜREN MUHAREBELER ŞERİDİ: savaş çiplerinin altında oyuncunun bütün
    // muharebeleri; tıklayınca kamera gider, pencere açılır. Muharebeyi
    // haritada aramak gerekmesin.
    this.strip = document.createElement('div');
    this.strip.className = 'battle-strip';
    this.strip.id = 'battle-strip';
    this.strip.hidden = true;
    this.strip.setAttribute('aria-label', 'Battles in progress');
    document.body.appendChild(this.strip);
    this.strip.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-strip-battle]');
      if (!chip) return;
      const id = Number(chip.dataset.stripBattle);
      const battle = this.game.world?.battleSystem?.battles?.find((item) => item.id === id);
      if (!battle) return;
      const tile = this.game.world.get(battle.q, battle.r);
      if (tile) this.game.focusTile(tile);
      this.open(id);
    });

    this.root.addEventListener('click', (event) => {
      if (event.target.closest('[data-battle-close]')) this.close();
      const focus = event.target.closest('[data-battle-focus]');
      if (focus && this.last) {
        const tile = this.game.world.get(this.last.q, this.last.r);
        if (tile) this.game.focusTile(tile);
      }
    });

    game.on('inspect', (battleId) => this.open(battleId));
    game.on('battles', (battle) => {
      if (battle?.id === this.battleId && battle.result) this.result = { winner: battle.result };
      this.refresh();
      this.refreshStrip();
    });
    game.on('turn', () => { this.refresh(); this.refreshStrip(); });
    game.on('world', () => { this.close(); this.refreshStrip(); });
    // Esc önce açık pencereyi kapatır (hud.js Esc sırası).
    game.inspectorClose = () => {
      if (this.root.hidden) return false;
      this.close();
      return true;
    };
  }

  /** Oyuncunun süren muharebeleri: en çok altı çip, gerisi "+N". */
  refreshStrip() {
    // Şerit savaş çubuğunun HEMEN altında: çubuk mutlak konumlu ve yüksekliği
    // çip sayısıyla değişir; sabit bir üst değer çiplerin üstüne biniyordu.
    const bar = document.getElementById('war-bar');
    const rect = bar && !bar.classList.contains('hidden') ? bar.getBoundingClientRect() : null;
    if (rect?.height) this.strip.style.top = `${Math.round(rect.bottom + 2)}px`;
    const world = this.game.world;
    const me = this.game.turns?.playerNation;
    const battles = (world?.battleSystem?.battles ?? [])
      .filter((b) => b.attackerNation === me || b.defenderNation === me);
    this.strip.hidden = !battles.length;
    if (!battles.length) { this.strip.innerHTML = ''; return; }
    const views = battles.map((b) => battleView(world, b, me)).filter(Boolean);
    // Önce kaybetme tehlikesi olanlar: oyuncunun gözü oraya gitmeli.
    const ours = (v) => (v.mine === 'attacker' ? v.ratio : 1 / Math.max(1e-6, v.ratio));
    views.sort((a, b) => ours(a) - ours(b) || a.id - b.id);
    const shown = views.slice(0, 6);
    const more = views.length - shown.length;
    this.strip.innerHTML = shown.map((v) => {
      const r = ours(v);
      const tone = r >= 1.3 ? 'good' : r >= 0.9 ? 'even' : 'bad';
      const verb = v.mine === 'attacker' ? 'Attacking' : 'Defending';
      return `<button class="bs-chip ${tone}" data-strip-battle="${v.id}"${tipAttr({ text: `Battle of ${v.name}\n${verb} · week ${v.round}/${v.maxRounds} · our power ${r.toFixed(2)} : 1\nClick to open the battle.` })}>
        <i class="bs-dir">${v.mine === 'attacker' ? '➤' : '⛨'}</i><b>${esc(v.name)}</b><span>${r.toFixed(1)}:1</span>
      </button>`;
    }).join('') + (more > 0 ? `<span class="bs-more">+${more}</span>` : '');
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(battleId) {
    this.battleId = battleId;
    this.result = null;
    this.last = null;
    this.root.hidden = false;
    this.refresh();
  }

  close() {
    this.root.hidden = true;
    this.battleId = null;
    this.last = null;
  }

  refresh() {
    if (this.root.hidden || this.battleId == null) return;
    const world = this.game.world;
    const battle = world?.battleSystem?.battles?.find((item) => item.id === this.battleId);
    if (battle) this.last = battleView(world, battle, this.game.turns.playerNation);
    if (!this.last) { this.close(); return; }
    this.root.innerHTML = this.html(this.last, !battle);
  }

  side(view, side, key) {
    const general = side.general
      ? `<span class="bp-gen"${tipAttr({ text: `${side.general.name}\nSkill ${side.general.skill}/5${side.general.traits.length ? ` · ${side.general.traits.join(', ')}` : ''}` })}>${esc(side.general.name)} <em>${'★'.repeat(side.general.skill)}</em></span>`
      : '<span class="bp-gen none">no commander</span>';
    const divisions = side.divisions.map((d) => `<div class="bp-div"${tipAttr({ text: `${d.name} division\n${formatPopulation(d.men)} men · strength ${pct(d.strength)} · organisation ${Math.round(d.organization)}%${d.entrenchment > 0.005 ? ` · dug in +${pct(d.entrenchment)}` : ''}` })}>
        <i class="bp-glyph">${esc(d.glyph)}</i>
        <span class="bp-bars"><b class="org" style="width:${Math.max(0, Math.min(100, d.organization)).toFixed(0)}%"></b><b class="str" style="width:${(d.strength * 100).toFixed(0)}%"></b></span>
      </div>`).join('');
    const factors = side.factors.map((f) => `<li${tipAttr({ text: `${f.label}\n${f.tip}` })}><span>${esc(f.label)}</span><b class="${f.value >= 1 ? 'pos' : 'neg'}">${mult(f.value)}</b></li>`).join('')
      || '<li class="none"><span>No modifiers</span></li>';
    return `<section class="bp-side ${key}${view.mine === key ? ' mine' : ''}">
      <header><i class="bp-flag" style="background:${esc(side.color)}"></i><b>${esc(side.name)}</b><small>${key === 'attacker' ? 'attacking' : 'defending'}${view.mine === key ? ' · you' : ''}</small></header>
      ${general}
      <div class="bp-stats">
        <span${tipAttr({ text: 'Men in the battle' })}><small>Men</small><b>${formatPopulation(side.men)}</b></span>
        <span${tipAttr({ text: 'Organisation: a division breaks and retreats at 15%' })}><small>Org</small><b>${Math.round(side.organization)}%</b></span>
        <span${tipAttr({ text: 'Strength left' })}><small>Str</small><b>${pct(side.strength)}</b></span>
        <span${tipAttr({ text: key === 'attacker' ? 'Divisions in the assault / combat width (more with attacks from several sides)' : 'Divisions defending / stack limit' })}><small>Width</small><b>${esc(side.width)}</b></span>
      </div>
      <div class="bp-divs">${divisions}</div>
      <ul class="bp-factors">${factors}</ul>
      <p class="bp-loss">Losses so far <b>${formatPopulation(side.losses)}</b></p>
    </section>`;
  }

  html(view, over) {
    const a = view.attacker;
    const d = view.defender;
    const share = a.power / Math.max(1e-6, a.power + d.power);
    const f = view.forecast;
    const we = view.mine;
    const nameOf = (key) => (key === 'attacker' ? a.name : d.name);
    let forecast;
    if (over) {
      const winner = this.result?.winner ?? f.likely;
      const ours = we && winner === we;
      forecast = `<p class="bp-forecast ${we ? (ours ? 'good' : 'bad') : ''}"><b>${esc(nameOf(winner))} won.</b> ${winner === 'attacker' ? 'The defenders were driven out.' : 'The assault was thrown back.'}</p>`;
    } else {
      const breaker = f.likely === 'attacker' ? 'defender' : 'attacker';
      const weeks = Math.min(breaker === 'defender' ? f.defenderBreaks : f.attackerBreaks, f.roundsLeft);
      const good = we ? f.likely === we : null;
      forecast = `<p class="bp-forecast ${good == null ? '' : good ? 'good' : 'bad'}"${tipAttr({ text: 'Forecast\nIf the dice stay average: organisation lost per week against what each side has left. A division breaks and retreats at 15%. The battle ends by week 20 at the latest.' })}>
        <b>${esc(nameOf(breaker))}'s line breaks in ~${Math.max(1, weeks)} ${weeks === 1 ? 'week' : 'weeks'}</b>
        · ${esc(nameOf(f.likely))} is likely to win</p>`;
    }
    return `<header class="bp-head">
        <div><small>${view.river ? 'River crossing · ' : ''}${esc(view.terrain)} · defence +${pct(view.defense)}</small>
          <h3>Battle of ${esc(view.name)}</h3></div>
        <span class="bp-round"${tipAttr({ text: 'One round a week; the battle ends after 20 at most.' })}>${over ? 'Over' : `Week ${view.round} / ${view.maxRounds}`}</span>
        <button class="bp-btn" data-battle-focus title="Show on the map">⌖</button>
        <button class="bp-btn" data-battle-close title="Close (Esc)">✕</button>
      </header>
      <div class="bp-balance"${tipAttr({ text: `Combat power\nThe battle's own scales: strength × terrain × river × plan × commander × doctrine × supplies. ${view.ratio.toFixed(2)} : 1 for the attacker.` })}>
        <span class="bp-ratio">${view.ratio.toFixed(1)} : 1</span>
        <span class="bp-power"><i style="width:${(share * 100).toFixed(1)}%;background:${esc(a.color)}"></i><i style="width:${((1 - share) * 100).toFixed(1)}%;background:${esc(d.color)}"></i></span>
      </div>
      ${forecast}
      <div class="bp-sides">${this.side(view, a, 'attacker')}${this.side(view, d, 'defender')}</div>`;
  }
}
