// TEKRAR OYNATICISI — kampanyanın sınır tarihi: oynat, durdur, sürükle, indir.
//
// Her şey tek tuvalde çizilir (harita, tarih, olay akışı): video ekranda görülenin
// aynısı olsun diye. Altındaki şerit ve düğmeler DOM'dur, videoya girmez.
//
// Döngü yalnız oynarken ya da parlama sönerken döner; duran oynatıcı kare harcamaz.

import { ERA_NAME, monthLabel, yearOfMonth } from '../game/calendar.js';
import { decodeReplay, replayHeadlines, replayRow } from '../game/replay.js';
import { ReplayMap } from '../render/replayMap.js';
import { FONT_DISPLAY, FONT_UI, whenFontsReady } from '../render/fonts.js';
import { recordCanvas, webmMimeType } from './webmVideo.js';
import { motionOn } from './motion.js';

const VIEW_W = 1280;
const VIEW_H = 720;
/** Yılı bir buçuk saniyede geçer: olay satırları okunabilsin, video bir dakikayı aşmasın. */
const MONTHS_PER_SECOND = 8;
const VIDEO_INTRO_MS = 1200;
const VIDEO_OUTRO_MS = 3000;
/** Satırın ekranda kaldığı ay sayısı: tam parlak + sönüş. */
const ROW_HOLD = 18;
const ROW_FADE = 8;
const PING_FRAMES = 14;
const HEAT_FADE_MS = 700;
const LABEL_COUNT = 10;
/** Tarih şeridinin en az yüksekliği; harita kalanı doldurur. */
const BAND_H = 54;

const KIND_COLOR = {
  war: '#ff6a4d', peace: '#e8dcb0', born: '#f2c14e', fall: '#a7b0b5',
};

const ICON = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>',
};

/** Harita tablosu dünya başına bir kez kurulur (pahalı kısım). */
const MAPS = new WeakMap();
function mapFor(world, height) {
  let map = MAPS.get(world);
  if (!map) {
    map = new ReplayMap(world, VIEW_W, height);
    MAPS.set(world, map);
  }
  return map;
}

const slug = (text) => String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

/** Tuvalde kullanılan yüzler: yüklenmeden çizilen metin yedek fontta kalır. */
const CANVAS_FACES = [`600 30px ${FONT_DISPLAY}`, `600 16px ${FONT_UI}`, `400 13px ${FONT_UI}`, `500 16px ${FONT_UI}`];

export class ReplayPlayer {
  /** @param {object} game @param {{autoplay?: boolean}} [options] */
  constructor(game, { autoplay = false } = {}) {
    this.game = game;
    this.world = game.world;
    this.autoplay = autoplay;
    this.position = 0;
    this.playing = false;
    this.handle = 0;
    this.lastTime = 0;
    this.paintedFrame = -1;
    this.heat = null;
    this.heatLive = false;
    this.anchorCache = new Map();
    this.labelAt = new Map();
    this.export = null;
    this.tick = this.tick.bind(this);
    this.buildDom();
    this.load();
    // Hareket kapalıysa baştan beklemek boş harita gösterirdi: son hâl açılır.
    const rolling = autoplay && motionOn() && this.lastFrame > 0;
    this.position = rolling ? 0 : this.lastFrame;
    this.syncControls();
    this.render();
    const repaint = () => { this.drawStrip(); this.render(); };
    whenFontsReady(repaint);
    document.fonts?.ready.then(() => Promise.all(CANVAS_FACES.map((face) => document.fonts.load(face))))
      .then(repaint, () => {});
    if (rolling) this.play();
  }

  get lastFrame() {
    return Math.max(0, (this.data?.frames ?? 1) - 1);
  }

  get frame() {
    return Math.min(this.lastFrame, Math.floor(this.position));
  }

  buildDom() {
    const root = document.createElement('section');
    root.className = 'replay';
    root.setAttribute('aria-label', 'Campaign replay');
    root.innerHTML = `
      <canvas class="replay-view" width="${VIEW_W}" height="${VIEW_H}"></canvas>
      <div class="replay-bar">
        <button type="button" class="action replay-play" data-replay-play aria-label="Play">${ICON.play}</button>
        <div class="replay-track">
          <canvas class="replay-strip" aria-hidden="true"></canvas>
          <i class="replay-head" aria-hidden="true"></i>
          <input id="replay-seek" class="replay-seek" type="range" min="0" max="0" step="1" value="0" aria-label="Month of the campaign">
        </div>
        <button type="button" class="action replay-save" data-replay-save>Download video</button>
      </div>
      <p class="replay-note" role="status" hidden></p>`;
    this.root = root;
    this.view = root.querySelector('.replay-view');
    this.ctx = this.view.getContext('2d');
    this.playBtn = root.querySelector('[data-replay-play]');
    this.saveBtn = root.querySelector('[data-replay-save]');
    this.seek = root.querySelector('#replay-seek');
    this.strip = root.querySelector('.replay-strip');
    this.head = root.querySelector('.replay-head');
    this.note = root.querySelector('.replay-note');

    this.playBtn.onclick = () => this.toggle();
    this.saveBtn.onclick = () => (this.export ? this.cancelExport() : this.startExport());
    if (!webmMimeType()) {
      this.saveBtn.disabled = true;
      this.saveBtn.dataset.tip = 'text';
      this.saveBtn.dataset.tipText = 'This browser cannot record video.';
    }

    // Sürüklerken oynatma durur, bırakınca kaldığı yerden sürer.
    this.seek.addEventListener('pointerdown', () => {
      this.resumeAfterSeek = this.playing;
      this.pause();
    });
    this.seek.addEventListener('input', () => this.seekTo(Number(this.seek.value)));
    const release = () => {
      if (this.resumeAfterSeek) this.play();
      this.resumeAfterSeek = false;
    };
    this.seek.addEventListener('pointerup', release);
    this.seek.addEventListener('pointercancel', release);

    // Tuşlar oynatıcıda kalır: Space oyunda saattir, kapanış sayfası da yutar.
    root.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const step = event.shiftKey ? 12 : 1;
      const act = {
        Space: () => this.toggle(),
        ArrowLeft: () => this.seekTo(this.frame - step),
        ArrowRight: () => this.seekTo(this.frame + step),
        Home: () => this.seekTo(0),
        End: () => this.seekTo(this.lastFrame),
      }[event.code];
      if (!act) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.export) return;
      if (event.code !== 'Space') this.pause();
      act();
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizer = new ResizeObserver(() => this.drawStrip());
      this.resizer.observe(this.strip);
    }
    this.onVisibility = () => {
      const job = this.export;
      if (!job) return;
      if (document.hidden) {
        job.recorder.pause();
        job.hiddenAt = performance.now();
      } else {
        job.recorder.resume();
        // Gizli geçen süre videonun saatinden düşer: görüntü kaldığı yerden sürer.
        const hiddenMs = performance.now() - (job.hiddenAt ?? performance.now());
        job.started += hiddenMs;
        if (job.doneAt != null) job.doneAt += hiddenMs;
        this.lastTime = performance.now();
        this.schedule();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Kaydı çözer. Kampanya sürerken yeni ay gelince yeniden çağrılır. */
  load() {
    const world = this.world;
    this.data = decodeReplay(world);
    this.loadedFrames = world.replay?.frames ?? 0;
    this.player = this.game.turns?.playerNation ?? -1;
    this.headlines = replayHeadlines(world, this.data, this.player);
    this.anchorCache.clear();
    this.seek.max = String(this.lastFrame);
    this.map = mapFor(world, VIEW_H - BAND_H);
    this.bandTop = this.map.height;
    this.heat = new Float32Array(this.map.count);
    const started = this.data && this.data.start > 0;
    this.setNote(started
      ? `Recorded from ${monthLabel(this.data.start)}: this campaign began before replays were kept.`
      : '');
    const empty = this.lastFrame < 1;
    this.playBtn.disabled = empty;
    this.seek.disabled = empty;
    if (empty && !started) this.setNote('The record opens with the first month of the campaign.');
    this.drawStrip();
  }

  /** Kampanya ilerlediyse yeni ayı alır; sondaki izleyici sonda kalır. */
  refresh() {
    if (this.export || this.world.replay?.frames === this.loadedFrames) return;
    const atEnd = this.position >= this.lastFrame;
    this.load();
    if (atEnd) this.position = this.lastFrame;
    this.paintedFrame = -1;
    this.syncControls();
    this.render();
  }

  setNote(text) {
    this.note.textContent = text;
    this.note.hidden = !text;
  }

  /** Oynatıcıyı yerine takar. Ekran gövdesi her hafta yeniden kurulur, tuval yaşar. */
  attach(mount) {
    if (mount.firstChild !== this.root) mount.replaceChildren(this.root);
    this.drawStrip();
  }

  /** Görünmez olurken: durur, süren videoyu bırakır. */
  suspend() {
    this.pause();
    if (this.export) this.cancelExport();
  }

  destroy() {
    this.suspend();
    cancelAnimationFrame(this.handle);
    this.handle = 0;
    this.resizer?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.root.remove();
  }

  // ------------------------------------------------------------- OYNATMA ---

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  play() {
    if (this.lastFrame < 1 || this.export) return;
    if (this.position >= this.lastFrame) this.seekTo(0);
    this.playing = true;
    this.lastTime = performance.now();
    this.syncControls();
    this.schedule();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.syncControls();
  }

  seekTo(frame) {
    this.position = Math.max(0, Math.min(this.lastFrame, frame));
    // Atlamada parlama yok: yalnız ay ay akarken değişen toprak yanar.
    this.heat?.fill(0);
    this.heatLive = false;
    this.labelAt.clear();
    this.paintedFrame = -1;
    this.syncControls();
    this.render();
  }

  syncControls() {
    const frame = this.frame;
    const label = this.data ? monthLabel(this.data.start + frame) : '';
    this.seek.value = String(frame);
    this.seek.setAttribute('aria-valuetext', label);
    const span = Math.max(1, this.lastFrame);
    this.head.style.left = `${(frame / span) * 100}%`;
    this.playBtn.innerHTML = this.playing ? ICON.pause : ICON.play;
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    this.playBtn.classList.toggle('on', this.playing);
  }

  schedule() {
    if (!this.handle) this.handle = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.handle = 0;
    if (!this.root.isConnected) {
      this.playing = false;
      return;
    }
    const dt = Math.min(250, now - this.lastTime);
    this.lastTime = now;
    if (this.export) this.stepExport(now, dt);
    else if (this.playing) {
      this.position += (dt / 1000) * MONTHS_PER_SECOND;
      if (this.position >= this.lastFrame) {
        this.position = this.lastFrame;
        this.playing = false;
      }
      this.syncControls();
    }
    this.coolHeat(dt);
    this.render();
    if (this.playing || this.export || this.heatLive) this.schedule();
  }

  coolHeat(dt) {
    if (!this.heatLive) return;
    const fade = dt / HEAT_FADE_MS;
    let live = false;
    for (let id = 0; id < this.heat.length; id++) {
      if (this.heat[id] <= 0) continue;
      this.heat[id] = Math.max(0, this.heat[id] - fade);
      if (this.heat[id] > 0) live = true;
    }
    this.heatLive = live;
    this.heatDirty = true;
  }

  // -------------------------------------------------------------- ÇİZİM ---

  render() {
    if (!this.data) return;
    const frame = this.frame;
    // Harita tablosu oynatıcılar arasında ortaktır: başkası boyadıysa yeniden boya.
    if (this.map.paintedBy !== this) this.paintedFrame = -1;
    this.map.paintedBy = this;
    if (frame !== this.paintedFrame) {
      const row = replayRow(this.data, frame);
      // Tam olarak bir sonraki ay ise değişen province yanar; atlamada yanmaz.
      if (frame === this.paintedFrame + 1 && frame > 0 && motionOn()) {
        const before = replayRow(this.data, frame - 1);
        for (let id = 0; id < row.length; id++) {
          if (row[id] !== before[id]) {
            this.heat[id] = 1;
            this.heatLive = true;
          }
        }
      }
      this.map.paint(row, this.heatLive ? this.heat : null);
      this.paintedFrame = frame;
      this.heatDirty = false;
    } else if (this.heatDirty) {
      this.map.paint(replayRow(this.data, frame), this.heat);
      this.heatDirty = false;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#0b1215';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.map.draw(ctx);
    this.drawLabels(ctx, frame);
    this.drawPings(ctx);
    this.drawTicker(ctx);
    this.drawCaption(ctx);
    this.drawBand(ctx, frame);
  }

  anchorsOf(frame) {
    let list = this.anchorCache.get(frame);
    if (!list) {
      list = this.map.anchors(replayRow(this.data, frame), LABEL_COUNT, this.player);
      this.anchorCache.set(frame, list);
    }
    return list;
  }

  drawLabels(ctx, frame) {
    const placed = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const anchor of this.anchorsOf(frame)) {
      const name = this.world.nations[anchor.id]?.name;
      if (!name) continue;
      const mine = anchor.id === this.player;
      const px = Math.max(13, Math.min(30, 10 + Math.sqrt(anchor.tiles) * 0.95));
      // Yer ay ay zıplamasın: ad hedefine yumuşakça kayar.
      const held = this.labelAt.get(anchor.id);
      const x = held ? held.x + (anchor.x - held.x) * 0.22 : anchor.x;
      const y = held ? held.y + (anchor.y - held.y) * 0.22 : anchor.y;
      this.labelAt.set(anchor.id, { x, y });
      ctx.font = `600 ${px.toFixed(1)}px ${FONT_DISPLAY}`;
      const width = ctx.measureText(name).width;
      const half = width / 2 + 6;
      const cx = Math.max(half, Math.min(VIEW_W - half, x));
      const cy = Math.max(px, Math.min(this.bandTop - px, y));
      const box = { x0: cx - half, x1: cx + half, y0: cy - px * 0.7, y1: cy + px * 0.7 };
      if (!mine && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      ctx.lineWidth = Math.max(3, px * 0.2);
      ctx.strokeStyle = 'rgba(8, 11, 13, 0.82)';
      ctx.strokeText(name, cx, cy);
      ctx.fillStyle = mine ? '#ffdf94' : '#f4efe2';
      ctx.fillText(name, cx, cy);
    }
  }

  /** Olayın yerinde genişleyen halka: gözü akıştan haritaya taşır. */
  drawPings(ctx) {
    for (const entry of this.headlines) {
      const age = this.position - entry.frame;
      if (age < 0 || age >= PING_FRAMES) continue;
      if (entry.anchor === undefined) {
        entry.anchor = this.map.anchors(replayRow(this.data, entry.frame), 0, entry.focus)[0] ?? null;
      }
      const anchor = entry.anchor;
      if (!anchor) continue;
      const t = age / PING_FRAMES;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 8 + t * 44, 0, Math.PI * 2);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = 3 - t * 1.5;
      ctx.strokeStyle = KIND_COLOR[entry.kind];
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawTicker(ctx) {
    const position = this.position;
    const rows = this.headlines
      .filter((h) => h.frame <= position && position < h.frame + ROW_HOLD + ROW_FADE)
      .slice(-4);
    let y = this.bandTop - 14;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const age = position - row.frame;
      const alpha = Math.max(0, Math.min(1, age < ROW_HOLD ? 1 : 1 - (age - ROW_HOLD) / ROW_FADE));
      const year = String(yearOfMonth(this.data.start + row.frame));
      ctx.font = `600 16px ${FONT_UI}`;
      const titleWidth = ctx.measureText(row.title).width;
      ctx.font = `400 13px ${FONT_UI}`;
      const detailWidth = row.detail ? ctx.measureText(row.detail).width + 14 : 0;
      const width = Math.min(VIEW_W - 40, 76 + titleWidth + detailWidth + 16);
      const height = 30;
      y -= height;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(8, 13, 16, 0.86)';
      ctx.fillRect(16, y, width, height);
      ctx.fillStyle = KIND_COLOR[row.kind];
      ctx.fillRect(16, y, 4, height);
      ctx.fillStyle = '#d9b873';
      ctx.font = `600 18px ${FONT_DISPLAY}`;
      ctx.fillText(year, 30, y + height / 2);
      ctx.fillStyle = row.mine ? '#ffdf94' : '#f4efe2';
      ctx.font = `600 16px ${FONT_UI}`;
      ctx.fillText(row.title, 84, y + height / 2);
      if (row.detail) {
        ctx.fillStyle = '#a9b1ad';
        ctx.font = `400 13px ${FONT_UI}`;
        ctx.fillText(row.detail, 84 + titleWidth + 14, y + height / 2 + 1);
      }
      ctx.globalAlpha = 1;
      y -= 4;
    }
  }

  drawCaption(ctx) {
    const nation = this.world.nations[this.player];
    const line = `Imperial Eye  ·  ${ERA_NAME}${nation ? `  ·  The campaign of ${nation.name}` : ''}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 15px ${FONT_DISPLAY}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8, 11, 13, 0.8)';
    ctx.strokeText(line, 18, 22);
    ctx.fillStyle = '#e8dcb0';
    ctx.fillText(line, 18, 22);
  }

  drawBand(ctx, frame) {
    const top = this.bandTop;
    const height = VIEW_H - top;
    ctx.fillStyle = '#0b1215';
    ctx.fillRect(0, top, VIEW_W, height);
    ctx.fillStyle = 'rgba(174, 139, 74, 0.35)';
    ctx.fillRect(0, top, VIEW_W, 2);
    ctx.fillStyle = '#e2c88a';
    ctx.fillRect(0, top, VIEW_W * (this.position / Math.max(1, this.lastFrame)), 2);
    const middle = top + height / 2 + 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffdf94';
    ctx.font = `600 30px ${FONT_DISPLAY}`;
    ctx.fillText(monthLabel(this.data.start + frame), 18, middle);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c9cfca';
    ctx.font = `500 16px ${FONT_UI}`;
    const nations = this.data.nations[frame];
    const wars = this.data.wars[frame];
    ctx.fillText(`${nations} nations  ·  ${wars} ${wars === 1 ? 'war' : 'wars'}`, VIEW_W - 18, middle);
  }

  /** Zaman şeridi: savaşın yoğunluğu, büyük olaylar ve on yıllar. */
  drawStrip() {
    const canvas = this.strip;
    if (!this.data || !canvas.isConnected) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = width / dpr;
    const h = height / dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.fillRect(0, 0, w, h);
    const span = Math.max(1, this.lastFrame);
    const xOf = (frame) => (frame / span) * w;
    const peak = Math.max(1, ...this.data.wars);
    ctx.fillStyle = 'rgba(214, 92, 64, 0.5)';
    const barWidth = Math.max(1, w / span);
    for (let frame = 0; frame <= this.lastFrame; frame++) {
      const bar = (this.data.wars[frame] / peak) * (h - 14);
      if (bar > 0) ctx.fillRect(xOf(frame), h - bar, barWidth, bar);
    }
    ctx.font = `500 10px ${FONT_UI}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let frame = 0; frame <= this.lastFrame; frame++) {
      const month = this.data.start + frame;
      const year = yearOfMonth(month);
      if (month % 12 !== 0 || year % 5 !== 0) continue;
      const x = xOf(frame);
      ctx.fillStyle = 'rgba(226, 200, 138, 0.28)';
      ctx.fillRect(x, 0, 1, h);
      if (x + 30 < w) {
        ctx.fillStyle = 'rgba(232, 220, 176, 0.72)';
        ctx.fillText(String(year), x + 3, 2);
      }
    }
    for (const entry of this.headlines) {
      ctx.fillStyle = KIND_COLOR[entry.kind];
      ctx.fillRect(xOf(entry.frame) - 1, h - 4, 2, 4);
    }
  }

  // -------------------------------------------------------------- VIDEO ---

  startExport() {
    if (this.export || this.lastFrame < 1) return;
    const recorder = recordCanvas(this.view);
    if (!recorder) {
      this.setNote('This browser cannot record video.');
      return;
    }
    this.pause();
    this.resumeNote = this.note.textContent;
    this.export = { recorder, started: performance.now(), held: 0, back: this.position };
    this.seekTo(0);
    this.playBtn.disabled = true;
    this.seek.disabled = true;
    this.saveBtn.classList.add('confirming');
    this.setNote('Recording the video in real time. Keep this window visible.');
    this.lastTime = performance.now();
    this.schedule();
  }

  /**
   * Video saati: giriş bekleyişi, ay ay akış, son karede bekleyiş. Kare başına
   * en çok bir ay ilerler: yavaş makinede video uzar ama hiçbir ay atlanmaz.
   */
  stepExport(now, dt) {
    const job = this.export;
    if (document.hidden) return;
    if (now - job.started >= VIDEO_INTRO_MS) {
      this.position = Math.min(this.lastFrame, this.position + Math.min(1, (dt / 1000) * MONTHS_PER_SECOND));
    }
    this.syncControls();
    this.saveBtn.textContent = `Cancel · ${Math.min(99, Math.floor((this.position / this.lastFrame) * 100))}%`;
    if (this.position < this.lastFrame) return;
    job.doneAt ??= now;
    if (now - job.doneAt >= VIDEO_OUTRO_MS && !job.closing) {
      job.closing = true;
      this.finishExport();
    }
  }

  async finishExport() {
    const job = this.export;
    const blob = await job.recorder.finish();
    this.endExport(job);
    if (!blob) return;
    const nation = this.world.nations[this.player];
    const from = yearOfMonth(this.data.start);
    const to = yearOfMonth(this.data.start + this.lastFrame);
    const name = `imperial-eye-${slug(nation?.name ?? 'campaign')}-${from}-${to}.webm`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    this.setNote(`Saved ${name} (${(blob.size / 1048576).toFixed(1)} MB).`);
  }

  cancelExport() {
    const job = this.export;
    if (!job || job.closing) return;
    job.recorder.cancel();
    this.endExport(job);
    this.setNote(this.resumeNote ?? '');
  }

  endExport(job) {
    this.export = null;
    this.saveBtn.classList.remove('confirming');
    this.saveBtn.textContent = 'Download video';
    this.playBtn.disabled = this.lastFrame < 1;
    this.seek.disabled = this.lastFrame < 1;
    this.seekTo(job.back);
  }
}

// ---------------------------------------------------------- CHRONICLE ÖRNEĞİ ---

let chronicleReplay = null;

/**
 * Chronicle ekranı her hafta gövdesini baştan kurar. Oynatıcı ekrandan bağımsız
 * yaşar, her kurulumda yeni yuvasına taşınır: oynayan tekrar haftalık tazelemede
 * başa sarmaz, süren video kopmaz. `mount` yoksa ekran kapanmıştır.
 */
export function syncChronicleReplay(game, mount) {
  if (!mount) {
    chronicleReplay?.suspend();
    return;
  }
  if (chronicleReplay && chronicleReplay.world !== game.world) {
    chronicleReplay.destroy();
    chronicleReplay = null;
  }
  chronicleReplay ??= new ReplayPlayer(game);
  chronicleReplay.attach(mount);
  chronicleReplay.refresh();
}
