// Minimap (sağ alt): dünyanın tamamı, kameranın baktığı çerçeve ve başkent.
// Sürükleyerek gezilir; kaybolan oyuncu tek bakışta nerede olduğunu görür.
//
// Harita kare başına bir piksele indirilir ve seçili kipin renklerini taşır.
// Taban resim pahalı kısımdır (15 bin kare), o yüzden yalnız dünya ya da kip
// değişince ve akan oyunda en sık saniyede bir kurulur; kamera çerçevesi harita
// karesine bağlıdır, kendi döngüsü yoktur.
//
// Katman notu: ui katmanı; oyun durumunu okur, kamerayı oynatır.

const REPAINT_MS = 1000;
const WATER = [13, 32, 42];

export class Minimap {
  constructor(game, root = document.getElementById('minimap')) {
    this.game = game;
    this.root = root;
    if (!root) return;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d', { willReadFrequently: true });
    this.colors = new Map();
    this.probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    this.dirty = true;
    this.paintedAt = 0;
    this.view = '';

    const stale = () => { this.dirty = true; };
    // Kip ve dünya değişimi beklemez: duran oyunda bir sonraki kare gelmeyebilir.
    const now = () => {
      this.dirty = true;
      this.paintedAt = 0;
      game.requestRender();
    };
    for (const event of ['turn', 'peace']) game.on(event, stale);
    for (const event of ['world', 'mapmode']) game.on(event, now);
    game.on('frame', () => this.tick());
    root.querySelector('[data-minimap-home]').onclick = () => game.focusCapital();
    this.bindDrag();
  }

  bindDrag() {
    const { canvas, game } = this;
    const go = (event) => {
      const world = game.world;
      const box = canvas.getBoundingClientRect();
      if (!world || !box.width) return;
      const b = world.bounds;
      const u = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      const v = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      game.camera.centerOn(b.minX + u * (b.maxX - b.minX), b.minY + v * (b.maxY - b.minY));
      game.requestRender();
    };
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      go(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (canvas.hasPointerCapture(event.pointerId)) go(event);
    });
  }

  /** CSS rengi → [r, g, b]. Kipler sınırlı sayıda ton kullandığı için önbellek küçük kalır. */
  rgb(color) {
    let hit = this.colors.get(color);
    if (hit) return hit;
    this.probe.clearRect(0, 0, 1, 1);
    this.probe.fillStyle = color;
    this.probe.fillRect(0, 0, 1, 1);
    const data = this.probe.getImageData(0, 0, 1, 1).data;
    hit = [data[0], data[1], data[2]];
    this.colors.set(color, hit);
    return hit;
  }

  /** Karenin minimap rengi: siyasi ve kültür kipinde arazi gölgesiz düz renk. */
  tileRgb(tile, world, mode) {
    if (tile.terrain.water) return WATER;
    const renderer = this.game.renderer;
    if (mode === 'political' || mode === 'seas') {
      const nation = world.nations[tile.owner];
      return nation ? this.rgb(nation.color) : this.rgb(tile.terrain.color);
    }
    if (mode === 'cultures') {
      const culture = world.cultures?.[tile.culture];
      return culture ? this.rgb(culture.color) : this.rgb(tile.terrain.color);
    }
    return this.rgb(renderer.tileColor(tile, world));
  }

  paint() {
    const { game, base, baseCtx } = this;
    const world = game.world;
    const mode = game.renderer.mapMode;
    if (base.width !== world.cols || base.height !== world.rows) {
      base.width = world.cols;
      base.height = world.rows;
    }
    const image = baseCtx.createImageData(world.cols, world.rows);
    for (const tile of world.tiles) {
      if (!tile) continue;
      const [r, g, b] = this.tileRgb(tile, world, mode);
      const at = (tile.row * world.cols + tile.col) * 4;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = 255;
    }
    baseCtx.putImageData(image, 0, 0);
    this.dirty = false;
    this.paintedAt = performance.now();
    this.view = '';
  }

  tick() {
    const { game, canvas, ctx } = this;
    const world = game.world;
    if (!world || !canvas?.offsetParent) return;
    const now = performance.now();
    if (this.dirty && now - this.paintedAt >= REPAINT_MS) this.paint();
    const cam = game.camera;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * scale);
    const H = Math.round(canvas.clientHeight * scale);
    const key = `${cam.x.toFixed(1)}|${cam.y.toFixed(1)}|${cam.zoom.toFixed(3)}|${W}|${H}`;
    if (key === this.view || !W || !H) return;
    this.view = key;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.base, 0, 0, W, H);

    const b = world.bounds;
    const sx = W / (b.maxX - b.minX);
    const sy = H / (b.maxY - b.minY);
    // Başkent: kamera çerçevesinin altında kalmayan pirinç nokta.
    const capital = world.nations[game.turns.playerNation]?.capital;
    if (capital) {
      ctx.beginPath();
      ctx.arc((capital.x - b.minX) * sx, (capital.y - b.minY) * sy, 3.2 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#f6d98e';
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeStyle = '#120d06';
      ctx.fill();
      ctx.stroke();
    }
    const vw = Math.min(W, (cam.viewWidth / cam.zoom) * sx);
    const vh = Math.min(H, (cam.viewHeight / cam.zoom) * sy);
    const x = (cam.x - b.minX) * sx - vw / 2;
    const y = Math.max(0, Math.min(H - vh, (cam.y - b.minY) * sy - vh / 2));
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeStyle = '#fff3d6';
    // Sarmal dünya: çerçeve dikişi aşınca öbür kenardan devam eder.
    for (const dx of world.wrapWidth ? [-W, 0, W] : [0]) ctx.strokeRect(x + dx, y, vw, vh);
  }
}
