// Ülke seçimi: dünya kurulduktan sonra, saat akmadan önce.
//
// Kör oyun testinin ilk on dakikadaki en büyük eksiği: oyun ülkeyi kendisi
// atıyordu. Oyuncu haritada bir ülkeye tıklar, alttaki büyük güç şeridinden
// ya da sağdaki listeden seçer; soldaki dosya o ülkeyi anlatır (nationBrief),
// "Play as" oyuncu ulusunu değiştirir (game.setPlayerNation). Önerilen ülke
// üreticinin seçtiğidir (world.playerNation): tek parçalı, en büyük.
//
// 2026-11-15 (Kerem: "sırada ülke seçme ekranı var"): sağdaki tek sütunlu
// yan panel bir seçim EKRANINA döndü — HOI4 kalıbı: harita ortada açık
// kalır, solda dosya, sağda aranabilir liste, altta büyük güçler. Tek
// sütunda dosya, komşular ve 64 satırlık liste üst üste biniyordu; ilk
// kararın "Play as" düğmesi listenin altında kayboluyordu.
//
// Katman: ui. Oyun durumuna yalnız game üzerinden erişir.

import { onEscape } from './hud.js';
import { emblemArt, gaugeArt, resourceArt } from './icons/art.js';
import { nationBrief, nationRoster } from '../game/nationBrief.js';
import { formatPopulation } from '../game/economy.js';
import { money } from '../game/money.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { mountFlag } from '../render/flagWave.js';
import { hidePanel, showPanel } from './motion.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Büyük güç = sıralamanın ilk sekizi: oyunun kendi tanımı (eventCards
 * GREAT_POWERS, pacts AI_GREAT_POWERS). Alt şerit bunları büyük bayrakla
 * sunar; kademe adı yalnız tarif eder, zorluk puanı UYDURMAZ.
 */
const GREAT_POWERS = 8;
const tierOf = (rank) => (rank <= GREAT_POWERS ? 'Great power' : rank <= 24 ? 'Middle power' : 'Minor nation');
const tierClass = (rank) => (rank <= GREAT_POWERS ? 'great' : rank <= 24 ? 'middle' : 'minor');

/** Komşu oranının çubuğu: 0.25× … 4× logaritmik, 1× ortada. */
const ratioShare = (ratio) => (Number.isFinite(ratio) && ratio > 0
  ? Math.max(0.04, Math.min(1, 0.5 + Math.log(ratio) / Math.log(16)))
  : 1);

export class NationPicker {
  constructor(game) {
    this.game = game;
    this.onBack = null;
    this.open_ = false;
    this.candidate = null;
    this.filter = '';
    this.root = document.createElement('section');
    this.root.className = 'nation-picker hidden';
    this.root.id = 'nation-picker';
    this.root.setAttribute('aria-label', 'Choose your nation');
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('input', (event) => {
      if (!event.target.matches('.np-search')) return;
      this.filter = event.target.value.trim().toLowerCase();
      this.applyFilter();
    });
    this.root.addEventListener('keydown', (event) => {
      // Aramada Enter listenin ilk görünen ülkesini aday yapar; Esc aramayı siler.
      if (!event.target.matches('.np-search')) return;
      if (event.key === 'Enter') {
        const first = this.root.querySelector('.np-row:not([hidden])');
        if (first) this.pick(Number(first.dataset.pick));
        event.preventDefault();
      } else if (event.key === 'Escape') {
        event.target.value = '';
        this.filter = '';
        this.applyFilter();
        event.stopPropagation();
      }
    });
    // Enter oynatır (düğmedeki rozet). Odak bir düğmedeyse Enter o düğmenin
    // işidir (satır seçmek); yazı alanında da arama kutusunun.
    document.addEventListener('keydown', (event) => {
      if (!this.open_ || event.key !== 'Enter' || event.repeat) return;
      if (event.target.closest?.('input, textarea, .nation-picker button:not([data-play])')) return;
      event.preventDefault();
      this.confirm();
    });
    // Haritada bir ülkeye tıklamak adayı değiştirir; boş deniz değiştirmez.
    game.on('select', (tile) => {
      if (!this.open_ || !tile || tile.owner < 0 || tile.owner === this.candidate) return;
      this.candidate = tile.owner;
      this.render();
    });
    // Saat akmaya baslarsa secim yapilmis sayilir: panel acikken oynatan
    // oyuncu o an kartta duran ulkeyle devam eder.
    game.on('clock', (clock) => {
      if (this.open_ && clock?.speed > 0) this.confirm();
    });
    onEscape(game, () => {
      if (!this.open_ || !this.onBack) return false;
      this.onBack();
      return true;
    });
  }

  get isOpen() { return this.open_; }

  open() {
    const world = this.game.world;
    if (!world) return;
    this.open_ = true;
    this.candidate = world.playerNation ?? this.game.turns.playerNation;
    this.roster = nationRoster(world);
    this.filter = '';
    this.buildShell();
    showPanel(this.root);
    document.body.classList.add('picker-open');
    this.render();
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    // Kart sağa çekilerek kapanır; başlık ve paneller aynı anda geri gelir.
    hidePanel(this.root);
    document.body.classList.remove('picker-open');
  }

  pick(id) {
    const nation = this.game.world.nations[id];
    if (!nation) return;
    this.candidate = id;
    // Kamera adaya gider; `select` olayı yeniden aynı adayı getirir, zararsız.
    this.game.focusNation(nation);
    this.render();
  }

  onClick(event) {
    const pick = event.target.closest('[data-pick]');
    if (pick) {
      this.pick(Number(pick.dataset.pick));
      return;
    }
    if (event.target.closest('[data-play]')) {
      this.confirm();
      return;
    }
    if (event.target.closest('[data-back]')) {
      this.onBack?.();
      return;
    }
    if (event.target.closest('[data-suggested]')) {
      this.pick(this.game.world.playerNation ?? this.game.turns.playerNation);
    }
  }

  confirm() {
    if (this.candidate == null) return;
    if (this.candidate !== this.game.turns.playerNation) this.game.setPlayerNation(this.candidate);
    this.close();
    // Kart artik secili ulkeyi anlatir; rehber karti da yeni ulkeye gore konussun.
    this.game.emit('select', null);
  }

  /**
   * Adaydan bağımsız iskelet: başlık, liste ve büyük güç şeridi bir kez
   * kurulur. Aday değişince yalnız dosya yeniden yazılır, liste ve şeritte
   * işaret taşınır — arama kutusu yazarken odağını ve imlecini yitirmez.
   */
  buildShell() {
    const world = this.game.world;
    const roster = this.roster ?? [];
    const powers = roster.slice(0, GREAT_POWERS).map((row) => {
      const nation = world.nations[row.id];
      return `<button class="np-power" data-pick="${row.id}" title="${esc(row.name)} · rank ${row.rank}">
        <img class="np-power-flag" src="${flagDataUrl(nation, 96, 64)}" alt="" draggable="false">
        <b>${esc(row.name)}</b>
        <small>#${row.rank}</small>
      </button>`;
    }).join('');
    const rows = roster.map((row) => {
      const nation = world.nations[row.id];
      return `<button class="np-row" data-pick="${row.id}" data-name="${esc(row.name.toLowerCase())}">
        <img class="np-row-flag" src="${flagDataUrl(nation, 30, 20)}" alt="" draggable="false">
        <span>${esc(row.name)}</span>
        <small>#${row.rank}</small>
        <em>${row.provinces} states${row.contiguous ? '' : ' · split'}</em>
      </button>`;
    }).join('');
    this.root.innerHTML = `
      <header class="np-title">
        <i aria-hidden="true"></i>
        <h2>Choose your nation</h2>
        <i aria-hidden="true"></i>
        <small>Click any nation on the map · ${roster.length} nations</small>
      </header>
      <aside class="np-dossier" aria-live="polite"></aside>
      <aside class="np-list">
        <header class="np-list-head">
          <h4>All nations</h4>
          <input class="np-search" type="search" placeholder="Search…" aria-label="Search nations" spellcheck="false" autocomplete="off">
        </header>
        <div class="np-roster">${rows}</div>
      </aside>
      <nav class="np-powers" aria-label="Great powers">
        <small>Great powers</small>
        <div class="np-power-row">${powers}</div>
      </nav>`;
  }

  applyFilter() {
    for (const row of this.root.querySelectorAll('.np-row')) {
      row.hidden = Boolean(this.filter) && !row.dataset.name.includes(this.filter);
    }
  }

  render() {
    const world = this.game.world;
    const nation = world?.nations[this.candidate];
    if (!nation || !this.root.querySelector('.np-dossier')) return;
    const brief = nationBrief(world, nation);
    const tile = (icon, label, value, sub = '') => `<div class="np-tile">
        <span class="np-tile-ico">${icon}</span>
        <span><small>${esc(label)}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</span>
      </div>`;
    const tiles = [
      tile(gaugeArt('output', 'sm'), 'Output', `${money(brief.output, 0)}`, 'a week'),
      tile(gaugeArt('population', 'sm'), 'People', formatPopulation(brief.population),
        `${brief.cities} ${brief.cities === 1 ? 'city' : 'cities'}`),
      tile(emblemArt('soldiers', 'sm'), 'Army', `${brief.divisions}`, `divisions · str ${brief.power.toFixed(0)}`),
      tile(emblemArt('navy', 'sm'), 'Fleet', `${brief.ships ?? 0}`, brief.coastal ? 'ships · coastal' : 'landlocked'),
      // Sanayi = 1'in üstündeki kalkınma kademeleri (nationBrief.industryOf).
      tile(emblemArt('industry', 'sm'), 'Industry', `${brief.industry.count}`,
        brief.industry.count ? 'levels above the first' : 'agrarian'),
      tile(emblemArt('infrastructure', 'sm'), 'States', `${brief.provinces}`,
        `${brief.hexes} hexes${brief.contiguous ? '' : ' · split'}`),
    ].join('');
    const goods = brief.goods.length
      ? brief.goods.map((g) => `<span class="np-good" title="${esc(g.name)} in ${g.provinces} states">${resourceArt(g.id, 'sm')}<b>${esc(g.name)}</b><small>${g.provinces}</small></span>`).join('')
      : '<span class="np-none">No deposits of note</span>';
    const neighbours = brief.neighbours.slice(0, 6).map((n) => {
      const other = world.nations[n.id];
      const tone = n.ratio >= 1.5 ? 'bad' : n.ratio <= 0.6 ? 'good' : '';
      return `<button class="np-nb" data-pick="${n.id}" title="Preview ${esc(n.name)}">
        ${other ? `<img src="${flagDataUrl(other, 30, 20)}" alt="" draggable="false">` : ''}
        <b>${esc(n.name)}</b>
        <span class="np-nb-bar ${tone}"><i style="width:${Math.round(ratioShare(n.ratio) * 100)}%"></i></span>
        <span class="np-nb-x ${tone}">${n.ratio === Infinity ? '—' : `${n.ratio.toFixed(1)}×`}</span>
      </button>`;
    }).join('');
    const notes = brief.notes.map((note) => `<li class="${note.tone}">${esc(note.text)}</li>`).join('');
    const tier = tierClass(brief.rank);

    const dossier = this.root.querySelector('.np-dossier');
    dossier.innerHTML = `
      <div class="np-hero tier-${tier}">
        <span class="np-flag-wave" aria-hidden="true"></span>
        <div class="np-id">
          <small class="np-tier">${tierOf(brief.rank)} · #${brief.rank} of ${brief.of}</small>
          <h3>${esc(brief.fullName)}</h3>
          <span>${esc(brief.government)} · ${esc(brief.party)}</span>
          <span>${esc(brief.culture)} founding culture${brief.suggested ? ' · <b class="np-suggested">suggested start</b>' : ''}</span>
        </div>
      </div>
      <p class="np-line">${esc(brief.line)}</p>
      <div class="np-scroll">
        <div class="np-tiles">${tiles}</div>
        <section class="np-sec"><h4>Resources</h4><div class="np-goods">${goods}</div></section>
        ${neighbours ? `<section class="np-sec"><h4>Neighbours <small>strength relative to yours</small></h4><div class="np-nbs">${neighbours}</div></section>` : ''}
        ${notes ? `<section class="np-sec"><h4>What awaits you</h4><ul class="np-notes">${notes}</ul></section>` : ''}
        <section class="np-sec np-policy"><h4>Policy at the start</h4>
          <p>${esc(brief.economicPolicy)} · ${esc(brief.tradePolicy)}</p></section>
      </div>
      <div class="np-actions">
        <button class="np-play" data-play="1">Play as ${esc(brief.name)}<kbd>Enter</kbd></button>
        <button class="np-alt" data-back="1">Back<kbd>Esc</kbd></button>
        ${brief.suggested ? '' : '<button class="np-alt" data-suggested="1">Back to suggested</button>'}
      </div>`;
    // Bayrak dalgalanır (künyedeki aynı bez: flagWave); kap her adayda yenidir.
    const wave = dossier.querySelector('.np-flag-wave');
    if (wave) mountFlag(wave, nation, wave.clientWidth || 132, wave.clientHeight || 88);

    for (const el of this.root.querySelectorAll('.np-row, .np-power')) {
      el.classList.toggle('on', Number(el.dataset.pick) === brief.id);
    }
    // Seçili satır listede görünür kalsın. scrollIntoView DEĞİL: o, bütün
    // kaydırılabilir ataları kaydırıp panelin başlığını ekran dışına itiyordu.
    const list = this.root.querySelector('.np-roster');
    const row = list?.querySelector('.np-row.on');
    if (list && row && !row.hidden) {
      const top = row.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - list.clientHeight / 2);
      }
    }
    // Aday değişince dosya süzülür. Sınıf kısa süre sonra sökülür: aynı
    // adayın yeniden çizimi animasyonu tekrar oynatmasın.
    if (this.shown !== nation.id) {
      this.shown = nation.id;
      dossier.classList.remove('is-swapping');
      void dossier.offsetWidth;
      dossier.classList.add('is-swapping');
      clearTimeout(this.swapTimer);
      this.swapTimer = setTimeout(() => dossier.classList.remove('is-swapping'), 320);
    }
  }
}
