// PERFORMANS YÜRÜYÜŞÜ — tarayıcı içi ölçüm tezgâhı (GELİŞTİRME ARACI).
//
// Oyun kodu bunu ASLA içe aktarmaz; konsoldan yüklenir:
//
//   await import('/scripts/perf-walk.js');
//   await __walk.run('A-paused-idle', { seconds: 30 });
//   __walk.table();
//
// Neden ayrı bir tezgâh: `core/perf.js` yalnız oyunun ÇİZDİĞİ kareleri örnekler.
// Duraklatılmış oyun su kadansında (33/66 ms) çizer, yani oyunun kendi dt'si
// "kadans" ölçer, "takılma" ölçmez. Oyuncunun hissettiği mikro takılma ise ana
// thread'in bloke olduğu andır — onu görmek için kareden BAĞIMSIZ bir rAF
// gözcüsü ve longtask gözlemcisi gerekir. Üçü birlikte suçluyu verir:
//
//   watchdog dt  → oyuncunun gördüğü pacing
//   longtask     → ana thread'i kim kaç ms bloke etti (tarayıcı ölçüsü)
//   game.perf    → o kare hangi bölümde ne kadar harcadı (bizim ölçümüz)

const NOW = () => performance.now();

function percentiles(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const pick = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return {
    n: v.length,
    avg: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2),
    p50: +pick(0.5).toFixed(2),
    p95: +pick(0.95).toFixed(2),
    p99: +pick(0.99).toFixed(2),
    max: +v[v.length - 1].toFixed(2),
  };
}

class PerfWalk {
  constructor(game) {
    this.game = game;
    this.results = {};
    this.busy = false;
    // Uzun kare günlüğü: eşik kovaları + o anda hangi bölümün koştuğu.
    this.longFrames = [];
    this.thresholds = [20, 33, 50, 100];
  }

  /** Bütün senaryolar aynı yerden başlasın: ekran kapalı, sabit zoom/merkez. */
  reset({ zoom = 0.85 } = {}) {
    const g = this.game;
    document.getElementById('screen-close')?.click();
    g.setSpeed(0);
    const me = g.world.nations[g.turns.playerNation] ?? g.world.nations[0];
    if (me?.capital) g.camera.centerOn(me.capital.x, me.capital.y);
    g.camera.zoom = zoom;
    g.camera.clamp();
    g.requestRender();
    return { zoom: g.camera.zoom, x: +g.camera.x.toFixed(1), y: +g.camera.y.toFixed(1) };
  }

  /**
   * Bir senaryoyu koşar. Kamera sürücüleri gerçek giriş yollarını kullanır
   * (`panByScreen` / `zoomAt`), yani input.js'in yaptığı işin aynısı.
   */
  run(name, {
    seconds = 12, speed = 0, pan = 0, zoom = 0, zoomRange = [0.45, 1.35],
  } = {}) {
    if (this.busy) return Promise.resolve({ error: 'busy' });
    this.busy = true;
    const g = this.game;
    const perf = g.perf;
    perf.reset();
    this.longFrames = [];

    const dts = [];
    const heap = [];
    const longtasks = [];
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longtasks.push(+e.duration.toFixed(1));
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch { observer = null; }

    g.setSpeed(speed);
    const t0 = NOW();
    const heap0 = performance.memory?.usedJSHeapSize ?? 0;
    let last = t0;
    let dir = 1;
    let zoomDir = 1;
    let frames = 0;

    return new Promise((resolve) => {
      const tick = () => {
        const now = NOW();
        const dt = now - last;
        last = now;
        frames++;
        // İlk kare ölçüye girmez: senaryo kurulumunun maliyeti değil,
        // sürekli rejimin pacing'i ölçülüyor.
        if (frames > 1) {
          dts.push(dt);
          if (dt >= this.thresholds[0]) {
            // O anda oyunun kendi bölüm dökümü (son kapanan kare).
            const lf = perf.longFrames[perf.longFrames.length - 1];
            this.longFrames.push({
              at: +(now - t0).toFixed(0),
              dt: +dt.toFixed(1),
              sections: lf && Math.abs(lf.dt - dt) < 6 ? { ...lf.sections } : null,
            });
          }
        }
        if (frames % 20 === 0 && performance.memory) heap.push(performance.memory.usedJSHeapSize);

        // --- kamera sürücüleri: gerçek giriş yollarıyla ---
        if (pan) {
          // 40 karede bir yön değiştir: sürekli tek yöne gidip dünyayı
          // dolaşmak yerine gerçek oyuncu gibi ileri-geri tarama.
          if (frames % 40 === 0) dir = -dir;
          g.camera.panByScreen(pan * dir, pan * dir * 0.35);
          g.requestRender();
        }
        if (zoom) {
          const z = g.camera.zoom;
          if (z >= zoomRange[1]) zoomDir = -1;
          else if (z <= zoomRange[0]) zoomDir = 1;
          g.camera.zoomAt(
            g.camera.viewWidth / 2, g.camera.viewHeight / 2,
            zoomDir > 0 ? 1 + zoom : 1 / (1 + zoom),
          );
          g.requestRender();
        }

        if (now - t0 < seconds * 1000) {
          requestAnimationFrame(tick);
          return;
        }
        observer?.disconnect();
        const snap = perf.snapshot();
        const heapEnd = performance.memory?.usedJSHeapSize ?? 0;
        const sections = {};
        for (const [k, v] of Object.entries(snap.sections)) {
          sections[k] = { avg: +v.avg.toFixed(2), max: +v.max.toFixed(2) };
        }
        const buckets = {};
        for (const t of this.thresholds) buckets[`>${t}ms`] = dts.filter((d) => d >= t).length;
        const result = {
          name,
          seconds,
          config: { speed, pan, zoom },
          frames,
          fps: +(frames / seconds).toFixed(1),
          // Oyuncunun gördüğü pacing (kareden bağımsız gözcü).
          watchdog: percentiles(dts),
          buckets,
          // Oyunun kendi ölçüsü: yalnız ÇİZİLEN karelerin cpu maliyeti.
          gameCpu: snap.cpu && {
            avg: +snap.cpu.avg.toFixed(2), p95: +snap.cpu.p95.toFixed(2),
            p99: +snap.cpu.p99.toFixed(2), max: +snap.cpu.max.toFixed(2), n: snap.cpu.n,
          },
          sections,
          counters: snap.counters,
          longtasks: {
            count: longtasks.length,
            total: +longtasks.reduce((s, x) => s + x, 0).toFixed(0),
            max: longtasks.length ? Math.max(...longtasks) : 0,
          },
          gc: { drops: snap.gc.drops, mb: +snap.gc.mb.toFixed(1) },
          heapMB: {
            start: +(heap0 / 1048576).toFixed(1),
            end: +(heapEnd / 1048576).toFixed(1),
            peak: heap.length ? +(Math.max(...heap) / 1048576).toFixed(1) : null,
            // Toplam ayrılan ≈ büyüme + toplanan (GC düşüşleri).
            allocatedMB: +((heapEnd - heap0) / 1048576 + snap.gc.mb).toFixed(1),
          },
          allocPerSec: +(((heapEnd - heap0) / 1048576 + snap.gc.mb) / seconds).toFixed(2),
          longFrames: this.longFrames.slice(0, 12),
          events: snap.events,
        };
        this.results[name] = result;
        g.setSpeed(0);
        this.busy = false;
        resolve(result);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Sonuç tablosu: tek bakışta karşılaştırma. */
  table() {
    return Object.values(this.results).map((r) => ({
      test: r.name,
      fps: r.fps,
      p50: r.watchdog?.p50,
      p95: r.watchdog?.p95,
      p99: r.watchdog?.p99,
      max: r.watchdog?.max,
      '>33': r.buckets['>33ms'],
      '>50': r.buckets['>50ms'],
      '>100': r.buckets['>100ms'],
      cpuAvg: r.gameCpu?.avg,
      cpuMax: r.gameCpu?.max,
      lt: r.longtasks.count,
      ltMax: r.longtasks.max,
      allocMBs: r.allocPerSec,
      gc: r.gc.drops,
    }));
  }

  /** Bölüm maliyetleri: hangi alt sistem kaç ms (senaryo başına). */
  sections(name) {
    const r = this.results[name];
    if (!r) return null;
    return Object.entries(r.sections)
      .sort((a, b) => b[1].avg - a[1].avg)
      .map(([k, v]) => ({ section: k, avg: v.avg, max: v.max }));
  }
}

const game = window.game;
window.__walk = new PerfWalk(game);
export default window.__walk;
