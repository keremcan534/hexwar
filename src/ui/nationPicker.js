// Ülke seçimi: dünya kurulduktan sonra, saat akmadan önce.
//
// Kör oyun testinin ilk on dakikadaki en büyük eksiği: oyun ülkeyi kendisi
// atıyordu. Bu panel haritanın sağında durur; oyuncu haritada bir ülkeye
// tıklar ya da listeden seçer, kart o ülkeyi anlatır (nationBrief), "Play as"
// oyuncu ulusunu değiştirir (game.setPlayerNation). Önerilen ülke
// üreticinin seçtiğidir (world.playerNation): tek parçalı, en büyük.
//
// Katman: ui. Oyun durumuna yalnız game üzerinden erişir.

import { nationBrief, nationRoster } from '../game/nationBrief.js';
import { formatPopulation } from '../game/economy.js';
import { flagDataUrl } from '../render/flagPainter.js';
import { hidePanel, showPanel } from './motion.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class NationPicker {
  constructor(game) {
    this.game = game;
    this.open_ = false;
    this.candidate = null;
    this.root = document.createElement('section');
    this.root.className = 'nation-picker hidden';
    this.root.id = 'nation-picker';
    this.root.setAttribute('aria-label', 'Choose your nation');
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
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
  }

  get isOpen() { return this.open_; }

  open() {
    const world = this.game.world;
    if (!world) return;
    this.open_ = true;
    this.candidate = world.playerNation ?? this.game.turns.playerNation;
    this.roster = nationRoster(world);
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

  onClick(event) {
    const pick = event.target.closest('[data-pick]');
    if (pick) {
      const id = Number(pick.dataset.pick);
      this.candidate = id;
      const nation = this.game.world.nations[id];
      // Kamera adaya gider; `select` olayı yeniden aynı adayı getirir, zararsız.
      if (nation) this.game.focusNation(nation);
      this.render();
      return;
    }
    if (event.target.closest('[data-play]')) {
      this.confirm();
      return;
    }
    if (event.target.closest('[data-suggested]')) {
      this.candidate = this.game.world.playerNation ?? this.game.turns.playerNation;
      const nation = this.game.world.nations[this.candidate];
      if (nation) this.game.focusNation(nation);
      this.render();
    }
  }

  confirm() {
    if (this.candidate == null) return;
    if (this.candidate !== this.game.turns.playerNation) this.game.setPlayerNation(this.candidate);
    this.close();
    // Kart artik secili ulkeyi anlatir; rehber karti da yeni ulkeye gore konussun.
    this.game.emit('select', null);
  }

  render() {
    const world = this.game.world;
    const nation = world?.nations[this.candidate];
    if (!nation) return;
    const brief = nationBrief(world, nation);
    const facts = [
      ['Rank', `${brief.rank} / ${brief.of}`],
      ['Provinces', `${brief.provinces} · ${brief.hexes} hexes`],
      ['People', `${formatPopulation(brief.population)} · ${brief.cities} ${brief.cities === 1 ? 'city' : 'cities'}`],
      ['Government', `${brief.government} · ${brief.party}`],
      ['Economy', `${brief.economicPolicy} · ${brief.tradePolicy}`],
      ['Raw goods', brief.goods.length
        ? brief.goods.map((g) => `${g.icon} ${g.name} (${g.provinces})`).join(' · ')
        : 'none of note'],
      ['Industry', brief.industry.count
        ? `${brief.industry.count} plants: ${brief.industry.types.join(', ')}`
        : 'no plants yet'],
      ['Army', `${brief.divisions} divisions · strength ${brief.power.toFixed(1)} · treasury £${brief.treasury}`],
      ['Coast', brief.coastal ? 'Maritime access' : 'Landlocked'],
    ];
    const neighbours = brief.neighbours.slice(0, 5).map((n) => {
      const tone = n.ratio >= 1.5 ? 'bad' : n.ratio <= 0.6 ? 'good' : '';
      return `<button class="np-neighbour" data-pick="${n.id}" title="Preview ${esc(n.name)}">
        <b>${esc(n.name)}</b>
        <span class="${tone}">${n.ratio === Infinity ? '—' : `${n.ratio.toFixed(1)}×`}</span>
        <small>${n.good ? `${n.good.icon} ${esc(n.good.name)}` : ''}</small>
      </button>`;
    }).join('');
    const notes = brief.notes.map((note) => `<li class="${note.tone}">${esc(note.text)}</li>`).join('');
    const roster = (this.roster ?? []).map((row) => `
      <button class="np-row${row.id === brief.id ? ' on' : ''}" data-pick="${row.id}">
        <i class="np-swatch" style="background:${esc(row.color)}"></i>
        <span>${esc(row.name)}</span>
        <small>#${row.rank} · ${row.provinces} prov.${row.contiguous ? '' : ' · split'}</small>
      </button>`).join('');

    this.root.innerHTML = `
      <header class="np-head">
        <small>Choose your nation</small>
        <span>Click any nation on the map, or pick from the list.</span>
      </header>
      <div class="np-hero">
        <img class="np-flag" src="${flagDataUrl(nation)}" alt="">
        <div>
          <h3>${esc(brief.fullName)}</h3>
          <small>${esc(brief.culture)} founding culture${brief.suggested ? ' · suggested start' : ''}</small>
        </div>
      </div>
      <p class="np-line">${esc(brief.line)}</p>
      <dl class="np-facts">
        ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}
      </dl>
      ${neighbours ? `<div class="np-block"><small>Neighbours · strength relative to yours</small><div class="np-neighbours">${neighbours}</div></div>` : ''}
      ${notes ? `<ul class="np-notes">${notes}</ul>` : ''}
      <div class="np-actions">
        <button class="np-play" data-play="1">Play as ${esc(brief.name)}</button>
        ${brief.suggested ? '' : '<button class="np-alt" data-suggested="1">Back to suggested</button>'}
      </div>
      <div class="np-block np-roster-block">
        <small>All nations, by rank</small>
        <div class="np-roster">${roster}</div>
      </div>`;
    // Secili satir listede gorunur kalsin. scrollIntoView DEGIL: o, butun
    // kaydirilabilir atalari kaydirip panelin basligini ekran disina itiyordu.
    const list = this.root.querySelector('.np-roster');
    const row = list?.querySelector('.np-row.on');
    if (list && row) {
      const top = row.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - list.clientHeight / 2);
      }
    }
    this.root.scrollTop = 0;
    // Aday degisince kart suzulur (styles.css §31). Sinif kisa sure sonra
    // sokulur: ayni adayin yeniden cizimi animasyonu tekrar oynatmasin.
    if (this.shown !== nation.id) {
      this.shown = nation.id;
      this.root.classList.add('is-swapping');
      clearTimeout(this.swapTimer);
      this.swapTimer = setTimeout(() => this.root.classList.remove('is-swapping'), 260);
    }
  }
}
