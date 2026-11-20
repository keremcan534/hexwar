// MUHAREBE PENCERESİ (HOI4'ün savaş penceresi). Haritadaki muharebe künyesine
// ya da muharebe bildirimine tıklayınca açılır, her hafta tazelenir, muharebe
// bitince sonucu gösterip açık kalır (oyuncu kapatır).
//
// Panel sayı kurmaz: her şey game/battleView.js'ten gelir — motorun kendi
// çarpanları ve kayıp sabitleri. "Kim kaç haftada kırılır" bir tahmindir ve
// öyle yazılır.

import { battleView } from '../game/battleView.js';
import { BREAK_ORGANIZATION, MAX_ROUNDS } from '../game/battles.js';
import { formatPopulation } from '../game/economy.js';
import { MAX_SKILL } from '../game/command.js';
import { glyph, stars } from './icons/glyphs.js';
import { esc, tipAttr } from './kit.js';
import { refreshTooltips } from './tooltip.js';
import { localRect, toLocal } from './uiScale.js';
import { subayPortresi } from './icons/subaylar.js';

/**
 * Güç oranı yazısı: bir taraf sıfıra inince "1000000.00 : 1" basıyordu.
 * Şerit ve pencere aynı biçimi kullanır.
 */
const fmtRatio = (r) => (!Number.isFinite(r) || r >= 99 ? '99+' : r < 0.01 ? '0' : r.toFixed(1));

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * Arazi şeridi (HOI4 penceresinin üstündeki manzara): dönem fotoğrafı araziye göre.
 * Ad eşleşmezse açık arazi.
 */
const TERRAIN_PHOTO = [
  [/mountain|peak|hill|snow/i, 'valley-town'],
  [/city|town|capital/i, 'burning-street'],
  [/beach|coast|marsh|island/i, 'coast-fort'],
];
const terrainPhoto = (name) => `assets/menu/${(TERRAIN_PHOTO.find(([re]) => re.test(name)) ?? [null, 'field-road'])[1]}.jpg`;
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

    // Başlıktan sürüklenir (Kerem: "savaş paneli sürüklenemiyor"); yeri oturum boyunca
    // kalır, haftalık tazeleme onu sıfırlamaz.
    this.pos = null;
    this.root.addEventListener('pointerdown', (event) => {
      const head = event.target.closest('.bp-head');
      if (!head || event.target.closest('button') || event.button !== 0) return;
      const box = this.root.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      this.root.setPointerCapture(event.pointerId);
      this.root.classList.add('dragging');
      const move = (e) => {
        const left = Math.max(0, Math.min(innerWidth - 80, start.left + e.clientX - start.x));
        const top = Math.max(0, Math.min(innerHeight - 40, start.top + e.clientY - start.y));
        this.pos = { left: toLocal(left), top: toLocal(top) };
        this.place();
      };
      const up = () => {
        this.root.classList.remove('dragging');
        this.root.removeEventListener('pointermove', move);
        this.root.removeEventListener('pointerup', up);
        this.root.removeEventListener('pointercancel', up);
      };
      this.root.addEventListener('pointermove', move);
      this.root.addEventListener('pointerup', up);
      this.root.addEventListener('pointercancel', up);
      event.preventDefault();
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
    // Şerit haritanın üstünü örtüyordu (Kerem); her muharebenin artık kendi iğnesi var.
    this.strip.hidden = true;
    if (this.strip) return;
    // Şerit savaş çubuğunun HEMEN altında: çubuk mutlak konumlu ve yüksekliği
    // çip sayısıyla değişir; sabit bir üst değer çiplerin üstüne biniyordu.
    const bar = document.getElementById('war-bar');
    const rect = bar && !bar.classList.contains('hidden') ? localRect(bar) : null;
    if (rect?.height) this.strip.style.top = `${Math.round(rect.bottom + 2)}px`;
    const world = this.game.world;
    const me = this.game.turns?.playerNation;
    const battles = (world?.battleSystem?.battles ?? [])
      .filter((b) => b.attackerNation === me || b.defenderNation === me);
    this.strip.hidden = !battles.length;
    if (!battles.length) { this.strip.innerHTML = ''; return; }
    const views = battles.map((b) => battleView(world, b, me)).filter(Boolean);
    const ours = (v) => (v.mine === 'attacker' ? v.ratio : 1 / Math.max(1e-6, v.ratio));
    // SIRA SABİT (muharebe kimliği): tehlikeye göre sıralama her hafta
    // değişiyor, çipler imlecin altından yer değiştiriyordu. Tehlike rengi
    // (good/even/bad) gözü yine doğru çipe götürür.
    views.sort((a, b) => a.id - b.id);
    const shown = views.slice(0, 6);
    const more = views.length - shown.length;
    this.strip.innerHTML = shown.map((v) => {
      const r = ours(v);
      const tone = r >= 1.3 ? 'good' : r >= 0.9 ? 'even' : 'bad';
      const verb = v.mine === 'attacker' ? 'Attacking' : 'Defending';
      return `<button class="bs-chip ${tone}" data-strip-battle="${v.id}"${tipAttr({ text: `Battle of ${v.name}\n${verb} · week ${v.round}/${v.maxRounds} · our power ${fmtRatio(r)} : 1\nClick to open the battle.` })}>
        <i class="bs-dir">${glyph(v.mine === 'attacker' ? 'advance' : 'shield', 'ctl')}</i><b>${esc(v.name)}</b><span>${fmtRatio(r)}:1</span>
      </button>`;
    }).join('') + (more > 0 ? `<span class="bs-more">+${more}</span>` : '');
    // Açık şerit kartı yeni çipe bağlansın; muharebe bittiyse kapansın.
    refreshTooltips();
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
    this.strip.style.maxWidth = '';
  }

  /**
   * Pencere ve şerit birbirine ve alttaki komuta araçlarına binmesin: sabit
   * `100vh - 170px` tavanı 1280×720'de Stance düğmelerini, açık pencere
   * 1366'da şerit çiplerini örtüyordu (ölçüldü). Taban, pencereyle yatayda
   * çakışan alt öğelerin (komuta rıhtımı, bildirim tepsisi, harita kipleri)
   * en üstüdür; şerit pencerenin soluna sığar.
   */
  fit() {
    if (this.root.hidden) return;
    const me = this.root.getBoundingClientRect();
    let floor = window.innerHeight;
    for (const id of ['command-dock', 'command-tools', 'notify-stack', 'map-modes']) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (r?.height && r.right > me.left && r.left < me.right && r.top > me.top) floor = Math.min(floor, r.top);
    }
    // Ölçüler görsel px, yazılan tavan yerel px (ui/uiScale.js).
    this.root.style.maxHeight = `${Math.max(180, Math.floor(toLocal(floor - me.top) - 8))}px`;
    const strip = this.strip.getBoundingClientRect();
    this.strip.style.maxWidth = strip.width ? `${Math.max(120, Math.floor(toLocal(me.left - strip.left) - 8))}px` : '';
  }

  /** Sürüklenmiş yer: sağdan değil soldan ve üstten konumlanır. */
  place() {
    if (!this.pos) return;
    this.root.style.left = `${this.pos.left}px`;
    this.root.style.top = `${this.pos.top}px`;
    this.root.style.right = 'auto';
  }

  refresh() {
    if (this.root.hidden || this.battleId == null) return;
    const world = this.game.world;
    const battle = world?.battleSystem?.battles?.find((item) => item.id === this.battleId);
    if (battle) this.last = battleView(world, battle, this.game.turns.playerNation);
    if (!this.last) { this.close(); return; }
    this.root.innerHTML = this.html(this.last, !battle);
    this.place();
    this.fit();
  }

  /** Komutan kartı: portre, bayrak şeridi, ad ve yıldız (HOI4'te pencerenin iki ucu). */
  commander(side, key) {
    const g = side.general;
    const face = g ? subayPortresi({ id: g.id, branch: g.branch }) : '<b class="bp-noface">?</b>';
    const tip = g ? `${g.name}\nSkill ${g.skill}/${MAX_SKILL}${g.traits.length ? ` · ${g.traits.join(', ')}` : ''}` : `${side.name}\nNo commander leads this side.`;
    return `<figure class="bp-cmd ${key}"${tipAttr({ text: tip })}>
        <span class="bp-face">${face}</span>
        <i class="bp-flagbar" style="background:${esc(side.color)}"></i>
        <figcaption><b>${esc(g ? g.name.split(' ').pop() : 'No commander')}</b>${g ? `<span class="bp-stars">${stars(g.skill, MAX_SKILL)}</span>` : ''}</figcaption>
      </figure>`;
  }

  /** Bir tarafın tümen listesi (HOI4'ün alt yarısı): her satır tür, insan, örgüt ve güç. */
  side(view, side, key) {
    const rows = side.divisions.map((d) => `<div class="bp-div"${tipAttr({ text: `${d.name} division\n${formatPopulation(d.men)} men · strength ${pct(d.strength)} · organisation ${Math.round(d.organization)}%${d.entrenchment ? ` · dug in ${Math.round(d.entrenchment * 100)}%` : ''}` })}>
        <i class="bp-glyph">${esc(d.glyph)}</i>
        <span class="bp-dname">${esc(d.name)}</span>
        <span class="bp-dmen">${formatPopulation(d.men)}</span>
        <span class="bp-bars"><b class="org" style="width:${Math.max(0, Math.min(100, d.organization)).toFixed(0)}%"></b><b class="str" style="width:${(d.strength * 100).toFixed(0)}%"></b></span>
      </div>`).join('');
    const factors = side.factors.map((f) => `<li${tipAttr({ text: `${f.label}\n${f.tip}` })}><span>${esc(f.label)}</span><b class="${f.value >= 1 ? 'pos' : 'neg'}">${mult(f.value)}</b></li>`).join('')
      || '<li class="none"><span>No modifiers</span></li>';
    return `<section class="bp-side ${key}${view.mine === key ? ' mine' : ''}">
      <h4>${side.divisions.length} ${side.divisions.length === 1 ? 'division' : 'divisions'}<small${tipAttr({ text: key === 'attacker' ? 'Divisions in the assault / combat width' : 'Divisions defending / stack limit' })}>${esc(side.width)}</small></h4>
      <div class="bp-divs">${rows}</div>
      <ul class="bp-factors">${factors}</ul>
      <p class="bp-loss">Lost <b>${formatPopulation(side.losses)}</b> men</p>
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
      forecast = `<p class="bp-forecast ${good == null ? '' : good ? 'good' : 'bad'}"${tipAttr({ text: 'Forecast\nIf the dice stay average: organisation lost per week against what each side has left.' })}>
        <b>${esc(nameOf(breaker))}'s line breaks in ~${Math.max(1, weeks)} ${weeks === 1 ? 'week' : 'weeks'}</b> · ${esc(nameOf(f.likely))} is likely to win</p>`;
    }
    // Başlık oyuncunun gözünden: HOI4'te "Attack" ya da "Defense".
    const title = we === 'attacker' ? 'Attack' : we === 'defender' ? 'Defense' : 'Battle';
    const orgA = Math.max(0, Math.min(100, a.organization));
    const orgD = Math.max(0, Math.min(100, d.organization));
    return `<header class="bp-head">
        <img class="bp-emb" src="assets/icons/war-map/attack.webp" alt="" draggable="false">
        <div class="bp-title"><h3>${title} · ${esc(view.name)}</h3><small>${over ? 'Over' : `Week ${view.round} of ${view.maxRounds}`}</small></div>
        <img class="bp-emb" src="assets/icons/war-map/defend.webp" alt="" draggable="false">
        <span class="bp-tools">
          <button class="bp-btn" data-battle-focus aria-label="Show on the map"${tipAttr({ text: 'Show on the map' })}>${glyph('locate', 'ctl')}</button>
          <button class="bp-btn" data-battle-close aria-label="Close"${tipAttr({ text: 'Close · Esc' })}>${glyph('close', 'ctl')}</button>
        </span>
      </header>
      <div class="bp-banner" style="background-image:url(${terrainPhoto(view.terrain)})">
        <span>${view.river ? '<b>River crossing</b> · ' : ''}${esc(view.terrain)} · defence +${pct(view.defense)}</span>
      </div>
      <div class="bp-duel">
        ${this.commander(a, 'attacker')}
        <div class="bp-mid">
          <div class="bp-names"><b>${esc(a.name)}</b><b>${esc(d.name)}</b></div>
          <div class="bp-power"${tipAttr({ text: `Combat power\nStrength × terrain × river × plan × commander × doctrine × supplies. ${view.ratio.toFixed(2)} : 1 for the attacker.` })}>
            <i class="att" style="width:${(share * 100).toFixed(1)}%;--side:${esc(a.color)}"></i><i class="def" style="width:${((1 - share) * 100).toFixed(1)}%;--side:${esc(d.color)}"></i>
            <em>${fmtRatio(view.ratio)} : 1</em>
          </div>
          <div class="bp-nums">
            <span${tipAttr({ text: 'Men in the attack' })}><small>Men</small><b>${formatPopulation(a.men)}</b></span>
            <span class="org"${tipAttr({ text: `Organisation: a division breaks and retreats at ${BREAK_ORGANIZATION}%` })}><small>Org</small><b>${Math.round(orgA)}% · ${Math.round(orgD)}%</b></span>
            <span${tipAttr({ text: 'Men in the defence' })}><small>Men</small><b>${formatPopulation(d.men)}</b></span>
          </div>
        </div>
        ${this.commander(d, 'defender')}
      </div>
      ${forecast}
      <div class="bp-sides">${this.side(view, a, 'attacker')}${this.side(view, d, 'defender')}</div>`;
  }
}
