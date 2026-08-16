// Geliştirici performans kaplaması. F3 açar/kapar; ?perf=1 açık başlatır.
//
// Kaplamanın kendisi ölçümü kirletmemeli: 4 Hz'te tek textContent yazımı +
// küçük bir çizgi grafik. Kare döngüsüne katılmaz, kendi zamanlayıcısında
// koşar; kapalıyken maliyeti sıfırdır.

const REFRESH_MS = 250;
/** Çizgi grafikte gösterilen son kare sayısı. */
const SPARK_FRAMES = 180;

export class PerfOverlay {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.timer = 0;
    this.root = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
    if (new URLSearchParams(location.search).get('perf') === '1') this.toggle();

    // Otomasyon kancaları: tarayıcı konsolundan senaryo ölçümü.
    window.__perfReset = () => game.perf.reset();
    window.__perfReport = () => {
      const snap = game.perf.snapshot();
      snap.turnProfile = game.turns?.lastProfile ?? null;
      snap.economyProfile = game.turns?.lastEconomyProfile ?? null;
      snap.zoom = game.camera.zoom;
      snap.day = game.clock?.day;
      snap.speed = game.clock?.speed;
      return snap;
    };
  }

  toggle() {
    this.visible = !this.visible;
    if (this.visible) {
      this.build();
      this.timer = setInterval(() => this.update(), REFRESH_MS);
      this.update();
    } else {
      clearInterval(this.timer);
      this.timer = 0;
      this.root?.remove();
      this.root = null;
    }
  }

  build() {
    const root = document.createElement('div');
    root.id = 'perf-overlay';
    // Stil yerinde: styles.css'e geliştirici aracı sızmasın.
    root.style.cssText = [
      'position:fixed', 'top:8px', 'right:8px', 'z-index:9999',
      'background:rgba(8,12,15,0.88)', 'color:#cfe0d8',
      'font:10px/1.45 ui-monospace,Consolas,monospace',
      'padding:8px 10px', 'border:1px solid rgba(160,190,180,0.25)',
      'border-radius:6px', 'pointer-events:none', 'white-space:pre',
      'max-width:340px',
    ].join(';');
    this.spark = document.createElement('canvas');
    this.spark.width = 300;
    this.spark.height = 42;
    this.spark.style.cssText = 'display:block;margin-top:6px;width:300px;height:42px';
    this.text = document.createElement('div');
    root.appendChild(this.text);
    root.appendChild(this.spark);
    document.body.appendChild(root);
    this.root = root;
  }

  update() {
    if (!this.visible || !this.root) return;
    const game = this.game;
    const s = game.perf.snapshot();
    const f = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
    const dt = s.dt;
    const cpu = s.cpu;
    const lines = [];
    lines.push(`FPS ${f(s.fps, 0)}  frame ${f(dt?.avg)}ms  p95 ${f(dt?.p95)}  p99 ${f(dt?.p99)}  max ${f(dt?.max)}`);
    lines.push(`cpu ${f(cpu?.avg)}ms  p99 ${f(cpu?.p99)}  max ${f(cpu?.max)}   zoom ${game.camera.zoom.toFixed(2)}`);
    const sec = s.sections;
    const secLine = (names) => names
      .filter((n) => sec[n])
      .map((n) => `${n.replace(/^r\./, '')} ${f(sec[n].avg)}|${f(sec[n].max, 0)}`)
      .join('  ');
    lines.push(secLine(['render', 'sim', 'ui.hud', 'ui.screen']));
    lines.push(secLine(['r.static', 'r.water', 'r.far', 'r.farbake', 'r.actors', 'r.labels']));
    const hex = game.renderer.lastDrawn;
    lines.push(`hex ${hex}  heap ${s.heapMB ? `${f(s.heapMB, 1)}MB` : '—'}  gc ${s.gc.drops}×/${f(s.gc.mb, 0)}MB`);
    const tp = game.turns?.lastProfile;
    if (tp) {
      const total = Object.values(tp).reduce((a, b) => a + b, 0);
      const worst = Object.entries(tp).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ');
      lines.push(`turn ${total.toFixed(1)}ms  [${worst}]`);
    }
    if (s.events.length) {
      const ev = s.events.slice(-3)
        .map((e) => `${e.name} ${e.ms.toFixed(0)}ms`).join('  ');
      lines.push(`ev: ${ev}`);
    }
    if (s.longFrames.length) {
      const lf = s.longFrames[s.longFrames.length - 1];
      const parts = Object.entries(lf.sections).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' ');
      lines.push(`long ${lf.dt.toFixed(0)}ms (cpu ${lf.cpu.toFixed(0)}) ${parts}`);
    }
    this.text.textContent = lines.join('\n');
    this.drawSpark();
  }

  /** Son karelerin pacing çubukları; 16.7/33 ms kılavuz çizgileri. */
  drawSpark() {
    const perf = this.game.perf;
    const ctx = this.spark.getContext('2d');
    const W = this.spark.width;
    const H = this.spark.height;
    ctx.clearRect(0, 0, W, H);
    const n = Math.min(SPARK_FRAMES, perf.count);
    if (!n) return;
    const scale = H / 50; // 50 ms tavan
    const bw = W / SPARK_FRAMES;
    for (let i = 0; i < n; i++) {
      // Halkadan geriye doğru: en sağ çubuk en yeni kare.
      const idx = (perf.head - 1 - i + perf.dt.length * 4) % perf.dt.length;
      const v = perf.dt[idx];
      if (Number.isNaN(v)) continue;
      const h = Math.min(H, v * scale);
      ctx.fillStyle = v > 33 ? '#c66' : v > 17.5 ? '#cb4' : '#4a7';
      ctx.fillRect(W - (i + 1) * bw, H - h, Math.max(1, bw - 0.5), h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, H - 16.7 * scale, W, 1);
    ctx.fillRect(0, H - 33 * scale, W, 1);
  }
}
