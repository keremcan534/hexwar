// SAĞ ÜST SAVAŞ PANELİ — HOI4'ün savaş kutuları (Kerem 2026-10-14: "HOI4
// usulü sağ üstte dünya ve savaşlardaki kaybı, savaş durumunu görebilmek").
//
// Eskiden savaşlar sekme şeridinin altında ortalı küçük çiplerdi ("Goralya
// +99"): kayıp, süre, işgal, hedef hiçbir yerde görünmüyordu. Panel her savaşı
// sabit boylu bir kutuda verir: düşman, savaş puanı çubuğu, iki tarafın
// kaybı, tutulan state'ler, süre. Başlık satırı dünyanın durumudur (kaç savaş
// sürüyor, barut fıçısı / büyük savaş etkin mi) ve Diplomasi düğmesidir.
//
// Sayıları panel kurmaz: game/warView.warOverview okunur (TASARIM ilke 2).
// Kutular sabit sırada ve sabit boyda durur: haftalık yeniden yazımda hiçbir
// kutu yer değiştirmez ya da boy değiştirmez (arayüz oynamaz kuralı).

import { warOverview } from '../game/warView.js';
import { formatPopulation } from '../game/economy.js';
import { hydrateFlags } from '../render/flagWave.js';
import { esc, tipAttr } from './kit.js';
import { refreshTooltipsWithin } from './tooltip.js';
import { conflictDetailHtml, conflictFocusTile } from './warDetail.js';

/**
 * Düşmanın savaş yorgunluğu (politics.exhaustion; TASARIM §9). Görünmezken
 * düşman imparatorluğun çözülmesi habersiz geliyordu (Kerem 2026-10-15:
 * "savaş yorgunluğu nerdeydi"). 0.60'tan sonra halkları kopar.
 */
function exhaustionTag(nation) {
  const value = nation?.politics?.exhaustion ?? 0;
  if (value < 0.05) return '';
  const tone = value >= 0.6 ? ' hi' : value >= 0.45 ? ' mid' : '';
  return ` · <span class="wd-exh${tone}" title="Their war exhaustion: from 60% their peoples start to break away; at 85% they capitulate.">exh ${Math.round(value * 100)}%</span>`;
}

const STORE_KEY = 'hexwar.warDock.collapsed';

export class WarDock {
  /**
   * @param {object} game
   * @param {{ openTalks(id), openDossier(id), openScreen(name) }} nav ekran
   *   açıcıları (HUD verir; panel ekran sınıfını tanımaz)
   */
  constructor(game, nav) {
    this.game = game;
    this.nav = nav;
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem(STORE_KEY) === '1'; } catch { /* özel pencere */ }
    this.root = document.createElement('aside');
    this.root.className = 'war-dock';
    this.root.id = 'war-dock';
    this.root.setAttribute('aria-label', 'Wars');
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.last = '';
    this.bottom = -1;
    // Açık ayrıntı kartının çatışma anahtarı (satıra tıklayınca panelin yanında).
    this.openKey = null;
    for (const name of ['turn', 'peace', 'diplomacy', 'world', 'player']) {
      game.on?.(name, () => {
        // Hafta kapanışı sürerken olaylar dilim dilim gelir; 'turn' sonda tazeler.
        if (game.turns?.turnJob && name !== 'turn') return;
        this.refresh();
      });
    }
    this.refresh();
  }

  onClick(event) {
    if (event.target.closest('[data-wd-toggle]')) {
      this.collapsed = !this.collapsed;
      try { localStorage.setItem(STORE_KEY, this.collapsed ? '1' : '0'); } catch { /* özel pencere */ }
      this.refresh(true);
      return;
    }
    if (event.target.closest('[data-wd-diplomacy]')) {
      this.nav.openScreen('diplomacy');
      return;
    }
    const crisis = event.target.closest('[data-wd-crisis]');
    if (crisis) {
      // Ültimatomda karar seferberliktir: Military ekranının yedek kartı.
      this.nav.openScreen('military');
      return;
    }
    // Ayrıntı kartının düğmeleri (ui/warDetail.js).
    if (event.target.closest('[data-cd-close]')) {
      this.closeDetail();
      return;
    }
    const look = event.target.closest('[data-cd-look]');
    if (look) {
      const c = (warOverview(this.game.world, this.game.turns?.playerNation, this.game.world.turn ?? 0).world.conflicts ?? [])
        .find((x) => x.key === look.dataset.cdLook);
      const tile = conflictFocusTile(this.game.world, c);
      if (tile) this.game.focusTile?.(tile);
      return;
    }
    const nation = event.target.closest('[data-cd-nation]');
    if (nation) {
      this.nav.openDossier(Number(nation.dataset.cdNation));
      return;
    }
    const elsewhere = event.target.closest('[data-wd-conflict]');
    if (elsewhere) {
      // Ayrıntı YERİNDE açılır (Kerem: "tıklayınca savaştaki taraflar ve
      // detaylar orada gözüksün"): panelin solunda kart; aynı satır kapatır.
      const key = elsewhere.dataset.wdConflict;
      this.openKey = this.openKey === key ? null : key;
      this.refresh(true);
      return;
    }
    const war = event.target.closest('[data-wd-war]');
    if (!war) return;
    const id = Number(war.dataset.wdWar);
    const me = this.game.turns.playerNation;
    // Bekleyen teklif masada değil diplomasi ekranında durur; masa açılmadan
    // (MIN_WAR_TURNS) ülkenin dosyası açılır.
    if (this.game.hasPeaceOffer?.(me, id)) this.nav.openScreen('diplomacy');
    else if (Number(war.dataset.wdTalks) === 0) this.nav.openTalks(id);
    else this.nav.openDossier(id);
  }

  /** Açık ayrıntı kartını kapatır; kapattıysa true (Escape sırası için). */
  closeDetail() {
    if (!this.openKey) return false;
    this.openKey = null;
    this.refresh(true);
    return true;
  }

  refresh(force = false) {
    const world = this.game.world;
    if (!world) return;
    const me = this.game.turns?.playerNation;
    const view = warOverview(world, me, world.turn ?? 0);
    const html = this.html(view, me);
    if (!force && html === this.last) return;
    this.last = html;
    this.root.innerHTML = html;
    hydrateFlags(this.root, world.nations);
    refreshTooltipsWithin(this.root);
    this.placeDetail();
    // Sağ sütunun altındaki ulusal hareketler paneli bu panelin altından
    // başlar; ölçü yalnız değişince yazılır (kutu sayısı haftada bir değişir).
    const bottom = Math.round(this.root.getBoundingClientRect().bottom);
    if (bottom !== this.bottom) {
      this.bottom = bottom;
      document.documentElement.style.setProperty('--war-dock-bottom', `${bottom}px`);
    }
  }

  html(view, me) {
    const count = view.wars.length;
    const conflicts = view.world.conflicts ?? [];
    const elsewhere = conflicts.length;
    const worldLine = `${elsewhere ? `${elsewhere} ${elsewhere === 1 ? 'war' : 'wars'} elsewhere` : 'no other wars'}${view.world.events.length ? ` · ${view.world.events.join(' · ')}` : ''}`;
    const head = `<header class="wd-head">
        <button type="button" class="wd-toggle" data-wd-toggle aria-expanded="${!this.collapsed}"${tipAttr({ text: `Wars\n${count ? `${count} ${count === 1 ? 'war' : 'wars'} with your nation.` : 'Your nation is at peace.'}\n${worldLine}.\nClick to ${this.collapsed ? 'open' : 'fold'} the panel.` })}>
          <i aria-hidden="true">${this.collapsed ? '▸' : '▾'}</i><b>${count ? `At war · ${count}` : 'At peace'}</b><small>${esc(worldLine)}</small></button>
        <button type="button" class="wd-dip" data-wd-diplomacy${tipAttr({ text: 'Diplomacy\nEvery nation, your treaties, wars and peace offers.\nShortcut: P' })}>Diplomacy <kbd>P</kbd></button>
      </header>`;
    if (this.collapsed || (!count && !view.crises.length && !elsewhere)) return head;
    const flag = (id) => `<span class="wd-flag" data-flag-nation="${id}" data-flag-w="30" data-flag-h="20" data-flag-style="crest"></span>`;
    const crises = view.crises.map((c) => `<button type="button" class="wd-row wd-crisis" data-wd-crisis="${c.enemyId}"${tipAttr({ text: `Ultimatum: ${c.name}\nWar begins in ${c.weeksLeft} ${c.weeksLeft === 1 ? 'week' : 'weeks'}. Mobilize the reserve from the Military screen before the deadline.` })}>
        ${flag(c.enemyId)}<b class="wd-name">${esc(c.name)}</b><em class="wd-score">${c.weeksLeft}w</em>
        <small class="wd-meta">ultimatum · war in ${c.weeksLeft} ${c.weeksLeft === 1 ? 'week' : 'weeks'}</small>
      </button>`).join('');
    const wars = view.wars.map((w) => {
      const tone = w.score > 8 ? 'winning' : w.score < -8 ? 'losing' : 'even';
      // Çubuk −100…+100: ortadan sağa bizim lehimize, sola aleyhimize.
      const half = Math.min(50, Math.abs(w.score) / 2);
      const bar = w.score >= 0
        ? `<i style="left:50%;width:${half.toFixed(1)}%"></i>` : `<i style="left:${(50 - half).toFixed(1)}%;width:${half.toFixed(1)}%"></i>`;
      const offered = this.game.hasPeaceOffer?.(me, w.enemyId);
      // Kayıpsız savaşta "−0" yazmasın.
      const loss = (n) => (n > 0 ? `−${formatPopulation(n)}` : '0');
      return `<button type="button" class="wd-row wd-war ${tone}${offered ? ' offered' : ''}" data-wd-war="${w.enemyId}" data-wd-talks="${w.talksIn}" data-tip="war" data-tip-arg="${w.enemyId}">
        ${flag(w.enemyId)}<b class="wd-name">${esc(w.name)}</b><em class="wd-score">${w.score > 0 ? '+' : ''}${w.score}</em>
        <span class="wd-bar" aria-hidden="true">${bar}</span>
        <small class="wd-meta"><span class="wd-loss">${loss(w.lossesOurs)}</span> / <span class="wd-kill">${loss(w.lossesTheirs)}</span> · ${w.weeks}w · ⚑ ${w.holdTheirs}/${w.holdOurs}${exhaustionTag(this.game.world.nations[w.enemyId])}${offered ? ' · <span class="wd-offer">offer</span>' : ''}</small>
      </button>`;
    }).join('');
    return `${head}<div class="wd-list">${crises}${wars}${this.worldHtml(conflicts, count + view.crises.length > 0)}</div>${this.detailHtml(conflicts)}`;
  }

  /** Seçili çatışmanın kartı; savaş bittiyse kart kendiliğinden kapanır. */
  detailHtml(conflicts) {
    const c = this.openKey ? conflicts.find((x) => x.key === this.openKey) : null;
    if (!c) {
      this.openKey = null;
      return '';
    }
    return `<section class="wd-detail" role="dialog" aria-label="War details">
        <header class="wd-detail-head"><b>${esc(c.attackers[0].name)} <i>vs</i> ${esc(c.defenders[0].name)}</b>
          <button type="button" class="wd-detail-x" data-cd-close aria-label="Close"${tipAttr({ text: 'Close (Esc)' })}>✕</button></header>
        ${conflictDetailHtml(this.game.world, c, { close: false })}
      </section>`;
  }

  /** Kart tıklanan satırın hizasına oturur, ekrandan taşmaz. */
  placeDetail() {
    const card = this.root.querySelector('.wd-detail');
    if (!card) return;
    const row = this.root.querySelector(`[data-wd-conflict="${this.openKey}"]`);
    const rootTop = this.root.getBoundingClientRect().top;
    const want = row ? row.getBoundingClientRect().top - rootTop : 0;
    const room = window.innerHeight - rootTop - card.offsetHeight - 12;
    card.style.top = `${Math.max(0, Math.min(want, room))}px`;
  }

  /**
   * DÜNYANIN SAVAŞLARI (Kerem: "dünyadaki savaşları hala göremiyorum").
   * Oyuncunun olmadığı çatışmalar, game/warView.worldConflicts'ten: iki
   * tarafın öncüsünün bayrağı, saldırgan gözüyle puan, kayıp, süre, işgal.
   * Tıklayınca Diplomasi ekranında savaşın ayrıntı paneli açılır. Sıra sabit;
   * en fazla WORLD_ROWS satır, fazlası adıyla yazılır (sessiz kesme yok).
   */
  worldHtml(conflicts, mine) {
    if (!conflicts.length) return '';
    const WORLD_ROWS = 8;
    const flag = (id) => `<span class="wd-flag" data-flag-nation="${id}" data-flag-w="24" data-flag-h="16" data-flag-style="crest"></span>`;
    const loss = (n) => (n > 0 ? `−${formatPopulation(n)}` : '0');
    const side = (list) => `${esc(list[0].name)}${list.length > 1 ? ` +${list.length - 1}` : ''}`;
    const rows = conflicts.slice(0, WORLD_ROWS).map((c) => {
      const half = Math.min(50, Math.abs(c.score) / 2);
      const bar = c.score >= 0
        ? `<i style="left:50%;width:${half.toFixed(1)}%"></i>` : `<i style="left:${(50 - half).toFixed(1)}%;width:${half.toFixed(1)}%"></i>`;
      const tip = `${c.attackers.map((n) => n.name).join(', ')}\nagainst ${c.defenders.map((n) => n.name).join(', ')}`
        + `\n\nWar score ${c.score > 0 ? '+' : ''}${c.score} for ${c.attackers[0].name} · ${c.weeks} weeks`
        + `\nLosses: ${c.attackers[0].name}'s side ${loss(c.lossesA)}, ${c.defenders[0].name}'s side ${loss(c.lossesB)} men`
        + `\nStates held: ${c.holdA} by the attackers, ${c.holdB} by the defenders`
        + `${c.reason === 'alliance' ? '\nAllies were called in.' : c.reason === 'coalition' ? '\nA coalition war.' : ''}`
        + '\n\nClick for the war details.';
      return `<button type="button" class="wd-row wd-world${this.openKey === c.key ? ' is-open' : ''}" data-wd-conflict="${c.key}"${tipAttr({ text: tip })}>
        <span class="wd-flags">${flag(c.lead[0])}${flag(c.lead[1])}</span><b class="wd-name">${side(c.attackers)} <i>vs</i> ${side(c.defenders)}</b><em class="wd-score">${c.score > 0 ? '+' : ''}${c.score}</em>
        <span class="wd-bar" aria-hidden="true">${bar}</span>
        <small class="wd-meta"><span class="wd-loss">${loss(c.lossesA)}</span> / <span class="wd-loss">${loss(c.lossesB)}</span> · ${c.weeks}w · ⚑ ${c.holdA}/${c.holdB}</small>
      </button>`;
    }).join('');
    const more = conflicts.length > WORLD_ROWS
      ? `<small class="wd-more">+${conflicts.length - WORLD_ROWS} more: ${esc(conflicts.slice(WORLD_ROWS).map((c) => `${c.attackers[0].name} vs ${c.defenders[0].name}`).join(', '))}</small>` : '';
    return `<div class="wd-sec${mine ? ' split' : ''}">Elsewhere in the world</div>${rows}${more}`;
  }
}
