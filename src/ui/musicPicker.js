// Müzik seçici: üst çubukta saat biriminin yanında küçük düğme, altında
// parça listesi. Auto = yönetmen (ui/soundtrack.js) hâle göre seçer; parçaya
// basınca o parça baştan çalar ve bitince listede sıradakine geçer; Off susar.
//
// Neden ayrı yüzer levha: üst çubuk taşmaya karşı kendi içinde kırpar
// (overflow), açılır liste onun içinde kalsaydı kesilirdi. Levha gövdeye
// asılır, düğmenin altına hizalanır.
//
// Malzeme yeni değil: levha `.k-panel`, düğmeler `.k-btn` ailesi (skin.css);
// burada yalnız yerleşim sınıfları var (hud.css "MÜZİK SEÇİCİ").
//
// Lisans: parçalar Scott Buckley, CC BY 4.0 — atıf listede görünür kalır.
//
// Katman notu: ui katmanı; oyuna yazmaz, yalnız müzik çalarını yönetir.

import { PLAYLIST } from './soundtrack.js';

const NOTE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 12.2V3.4l7-1.6v8.6"/><ellipse cx="4.4" cy="12.3" rx="1.9" ry="1.5"/><ellipse cx="11.4" cy="10.5" rx="1.9" ry="1.5"/></svg>';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const MOOD_LABEL = {
  peace: 'peace', uneasy: 'unease', tension: 'tension', war: 'war',
  warWinning: 'war, winning', warLosing: 'war, losing', epilogue: 'epilogue',
};

export class MusicPicker {
  constructor(music) {
    this.music = music;
    this.open = false;
    const anchor = document.getElementById('btn-settings');
    if (!music || !anchor) return;
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.id = 'btn-music';
    btn.setAttribute('aria-label', 'Music');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Music';
    btn.innerHTML = NOTE_SVG;
    anchor.before(btn);
    this.btn = btn;

    const pop = document.createElement('div');
    pop.className = 'k-panel music-pop';
    pop.id = 'music-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Music');
    pop.innerHTML = `
      <div class="mp-head"><b>Music</b><small class="mp-now" id="mp-now"></small></div>
      <div class="mp-controls">
        <button class="k-btn mp-ctl" data-act="prev" aria-label="Previous track" title="Previous track">&#9664;&#9664;</button>
        <button class="k-btn mp-ctl mp-auto" data-act="auto" title="The score follows the campaign: peace, tension, war, defeat, victory.">Auto</button>
        <button class="k-btn mp-ctl" data-act="off" title="Silence the music. The volume stays in Settings → Audio.">Off</button>
        <button class="k-btn mp-ctl" data-act="next" aria-label="Next track" title="Next track">&#9654;&#9654;</button>
      </div>
      <div class="mp-list" role="list">
        ${PLAYLIST.map((t) => `<button class="k-btn mp-track" role="listitem" data-track="${t.id}"><span>${t.title}</span><small>${fmtTime(t.duration)}</small></button>`).join('')}
      </div>
      <p class="mp-credit">Music by Scott Buckley — released under CC BY 4.0. www.scottbuckley.com.au</p>`;
    document.body.append(pop);
    this.pop = pop;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.track) music.playTrack(b.dataset.track);
      else if (b.dataset.act === 'auto') music.setAuto();
      else if (b.dataset.act === 'off') music.stop();
      else if (b.dataset.act === 'prev') music.step(-1);
      else if (b.dataset.act === 'next') music.step(1);
    });
    // Dışarı tık ve Esc kapatır; Esc yalnız levha açıkken yakalanır ki
    // pencereleri kapatan Esc'nin yolu değişmesin.
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !pop.contains(e.target) && !btn.contains(e.target)) this.toggle(false);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        this.toggle(false);
      }
    }, true);
    window.addEventListener('resize', () => this.open && this.place());
    music.onChange(() => this.paint());
    this.paint();
  }

  toggle(force = !this.open) {
    this.open = force;
    this.pop.hidden = !force;
    this.btn.setAttribute('aria-expanded', force ? 'true' : 'false');
    this.btn.classList.toggle('on', force);
    if (force) {
      this.place();
      this.paint();
    }
  }

  /** Düğmenin altına, sağ kenarı düğmenin sağıyla hizalı; pencereden taşmaz. */
  place() {
    const r = this.btn.getBoundingClientRect();
    const w = this.pop.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    this.pop.style.left = `${Math.round(left)}px`;
    this.pop.style.top = `${Math.round(r.bottom + 10)}px`;
  }

  paint() {
    if (!this.pop) return;
    const d = this.music.describe();
    const playing = d.track;
    let now;
    if (d.mode === 'off') now = 'Off';
    else if (d.mode === 'auto') now = playing ? `Auto · ${title(playing)} (${MOOD_LABEL[d.mood] ?? d.mood ?? '…'})` : 'Auto · between pieces';
    else now = playing ? `Playing · ${title(playing)}` : `Next · ${title(d.choice)}`;
    if (!d.active) now = `${now} · starts with the campaign`;
    this.pop.querySelector('#mp-now').textContent = now;
    for (const b of this.pop.querySelectorAll('[data-act]')) {
      const on = (b.dataset.act === 'auto' && d.mode === 'auto') || (b.dataset.act === 'off' && d.mode === 'off');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const b of this.pop.querySelectorAll('[data-track]')) {
      const id = b.dataset.track;
      const chosen = d.mode === 'track' && id === d.choice;
      b.classList.toggle('on', chosen);
      b.classList.toggle('mp-playing', id === playing && d.mode !== 'off');
      b.setAttribute('aria-pressed', chosen ? 'true' : 'false');
    }
    this.btn.classList.toggle('mp-silent', d.mode === 'off');
    this.btn.title = d.mode === 'off' ? 'Music (off)' : 'Music';
  }
}

function title(id) {
  return PLAYLIST.find((t) => t.id === id)?.title ?? id;
}
