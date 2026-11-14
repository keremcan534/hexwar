// KEŞİF KARTI — oyuncunun araştırması bitince ekranın üstünde beliren
// resimli kart.
//
// Neden: araştırma bitişi bildirim tepsisine tek satır düşüyordu. 56
// teknolojinin çoğu oyunun büyük anlarından biri (dretnot, tank, uçak), ama
// oyuncu onu çoğu zaman görmüyordu. Kart oyunu DURDURMAZ (seçenekli olay
// kartından farkı): birkaç saniye kalır, üstüne gelince bekler, tıklayınca
// araştırma ekranını açar. Aynı haftada birden çok biterse sıraya girer.
//
// Katman notu: ui; oyunun 'discovery' olayını dinler (technology.runResearch),
// oyuna yazmaz.

import { FIRST_TECH_PRESTIGE, TECH_CATEGORIES, techById } from '../game/technology.js';
import { describeEffects } from '../game/modifiers.js';
import { UNIT_TYPES } from '../game/units.js';
import { hasTechArt, techArt } from './icons/art.js';
import { glyph } from './icons/glyphs.js';
import { esc } from './kit.js';

/** Kartın ekranda kalma süresi; üstüne gelinince sayaç durur. */
const SHOW_MS = 7000;
/** Kuyruk tavanı: 8x hızda üst üste biten teknolojiler ekranı kaplamasın. */
const QUEUE_MAX = 3;
/** Çıkış geçişi (styles.css .discovery.is-leaving) bitene kadar kart durur. */
const LEAVE_MS = 260;

export class DiscoveryCard {
  constructor(game, { screens = null, sound = null } = {}) {
    this.game = game;
    this.screens = screens;
    this.sound = sound;
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.left = SHOW_MS;
    this.shownAt = 0;

    this.root = document.createElement('aside');
    this.root.className = 'discovery hidden';
    this.root.setAttribute('aria-live', 'polite');
    document.body.append(this.root);

    this.root.addEventListener('pointerenter', () => this.pause());
    this.root.addEventListener('pointerleave', () => this.resume());
    this.root.addEventListener('click', (event) => {
      if (!event.target.closest('[data-discovery-close]')) this.screens?.open('technology');
      this.dismiss();
    });
    game.on('discovery', (found) => this.push(found));
    // Yeni dünya ya da kayıt: eski kampanyanın kartı kalmasın.
    game.on('world', () => {
      this.queue = [];
      this.dismiss(true);
    });
  }

  push(found) {
    if (!found?.techId || !techById(found.techId)) return;
    this.queue.push(found);
    if (this.queue.length > QUEUE_MAX) this.queue.shift();
    if (!this.current) this.next();
  }

  next() {
    const found = this.queue.shift();
    if (!found) return;
    this.current = found;
    this.root.innerHTML = this.render(found);
    this.root.classList.remove('hidden', 'is-leaving');
    void this.root.offsetWidth;
    this.root.classList.add('is-entering');
    this.sound?.play('discovery');
    this.left = SHOW_MS;
    this.resume();
  }

  render({ techId, first }) {
    const entry = techById(techId);
    const { tech } = entry;
    const category = TECH_CATEGORIES[entry.categoryId];
    const unlock = tech.unlocks ? UNIT_TYPES[tech.unlocks]?.name : null;
    const effects = [
      ...(unlock ? [`Unlocks ${unlock}`] : []),
      ...describeEffects(tech.effects),
    ].slice(0, 2);
    return `<span class="discovery-art${hasTechArt(techId) ? ' has-art' : ''}" aria-hidden="true">${techArt(techId, entry.categoryId)}</span>
      <div class="discovery-body">
        <small>Discovery · ${esc(category?.name ?? '')}</small>
        <h3>${esc(tech.name)}</h3>
        ${tech.desc ? `<p>${esc(tech.desc)}</p>` : ''}
        ${effects.length ? `<span class="discovery-eff">${effects.map(esc).join(' · ')}</span>` : ''}
        ${first ? `<span class="discovery-first">First in the world · +${FIRST_TECH_PRESTIGE} prestige</span>` : ''}
      </div>
      <button type="button" class="icon-btn discovery-x" data-discovery-close aria-label="Close">${glyph('close', 'ctl')}</button>`;
  }

  pause() {
    if (!this.current || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = 0;
    this.left = Math.max(1200, this.left - (performance.now() - this.shownAt));
  }

  resume() {
    if (!this.current || this.timer) return;
    this.shownAt = performance.now();
    this.timer = setTimeout(() => this.dismiss(), this.left);
  }

  dismiss(instant = false) {
    clearTimeout(this.timer);
    this.timer = 0;
    if (!this.current) return;
    this.current = null;
    const done = () => {
      // Çıkış sürerken yeni kart geldiyse onu gizleme.
      if (this.current) return;
      this.root.classList.add('hidden');
      this.root.classList.remove('is-entering', 'is-leaving');
      this.next();
    };
    if (instant) { done(); return; }
    this.root.classList.add('is-leaving');
    setTimeout(done, LEAVE_MS);
  }
}
