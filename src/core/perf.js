// Performans ölçüm çekirdeği. DOM'a dokunmaz (katman kuralı: core).
//
// İki ayrı süre ölçülür ve ikisi de gerekir:
//   - dt  : ardışık rAF kareleri arasındaki duvar süresi (frame pacing —
//           oyuncunun gördüğü takılma budur, GPU/compositor dahil).
//   - cpu : kare geri çağrısının ana thread'de geçirdiği süre (suçlu avı
//           için; dt büyük ama cpu küçükse suç bizde değil demektir).
//
// Bölüm işaretleri (render/sim/...) kare içinde toplanır; kare kapandığında
// halka tampona düşer. Kare dışında (setInterval, olay dinleyici) geçen büyük
// işler `event` olarak ayrı kaydedilir — duraklatılmış oyundaki ani takılmayı
// rAF istatistiği hiç göremeyebilir, olay günlüğü görür.

/** Halka tampon boyu: ~4 sn @60fps. Yüzdelik hesabı için yeterli örnek. */
const RING = 240;
/** Uzun kare eşiği (ms): bunun üstü suç dosyasına bölüm dökümüyle yazılır. */
const LONG_FRAME_MS = 33;
/** Kare dışı iş bu süreyi aşarsa olay günlüğüne girer. */
const LONG_EVENT_MS = 8;
/** rAF zinciri kopuksa (boşta oyun) pacing örneği sayılmaz. */
const PACING_GAP_MS = 250;
/** Ölçü (gauge) halkası: ~2 sn @60fps. Yüzdelik için yeterli örnek. */
const GAUGE_RING = 120;

export class PerfMonitor {
  constructor() {
    this.enabled = true;
    this.dt = new Float32Array(RING);      // pacing örnekleri
    this.cpu = new Float32Array(RING);     // geri çağrı süreleri
    this.head = 0;                         // bir sonraki yazılacak yuva
    this.count = 0;                        // dolu yuva sayısı
    this.lastFrameAt = 0;                  // önceki karenin rAF damgası
    this.frameStart = 0;                   // aktif karenin başlangıcı
    this.inFrame = false;
    this.sections = {};                    // aktif karenin bölüm toplamları
    this.sectionStats = new Map();         // ad -> { sum, max, n } (kayan)
    this.longFrames = [];                  // son uzun kareler (bölüm dökümlü)
    this.events = [];                      // kare dışı büyük işler
    this.counters = {};                    // kare başına sayaçlar (hex, yol...)
    this.gauges = new Map();               // ad -> { ring, head, count }
    this.frameId = 0;
    // GC yaklaşımı: heap örnekleri arasında negatif sıçrama = toplama.
    this.lastHeap = 0;
    this.gcDrops = 0;
    this.gcDropBytes = 0;
  }

  now() {
    return performance.now();
  }

  beginFrame(ts) {
    if (!this.enabled) return;
    const t = this.now();
    this.inFrame = true;
    this.frameStart = t;
    this.frameId++;
    this.sections = {};
    this.counters = {};
    // Pacing: rAF damgaları arasındaki fark. Zincir kopuksa örnek alınmaz —
    // boşta bekleyen oyun "0.2 fps" gibi anlamsız bir istatistik üretmesin.
    if (this.lastFrameAt && ts - this.lastFrameAt < PACING_GAP_MS) {
      this.pendingDt = ts - this.lastFrameAt;
    } else this.pendingDt = -1;
    this.lastFrameAt = ts;
  }

  /** Bölüm süresi ekler; kare dışındaysa büyükse olay olarak günlüğe düşer. */
  add(name, ms) {
    if (!this.enabled) return;
    if (this.inFrame) this.sections[name] = (this.sections[name] ?? 0) + ms;
    else if (ms >= LONG_EVENT_MS) this.event(name, ms);
  }

  /** Sayaç (görünür hex, çizim çağrısı benzeri); kare kapanınca donar. */
  bump(name, n = 1) {
    if (!this.enabled || !this.inFrame) return;
    this.counters[name] = (this.counters[name] ?? 0) + n;
  }

  /**
   * Kareye BAĞLANMAYAN ölçü.
   *
   * GPU zamanlayıcı sorgusunun sonucu aynı karede okunamaz — sürücü işi
   * bitirene kadar birkaç kare geçer. Böyle bir değeri `add` ile yazmak onu
   * YANLIŞ karenin hanesine koyar ve profil suçluyu şaşırtır (bu depoda
   * tekrar eden kusur ailesi: iddia ettiğinden başka şeyi ölçen ölçüm).
   * Bu kanal kendi halkasını tutar, kare kapanışına bakmaz ve raporda
   * `gauges` altında AYRI durur.
   */
  gauge(name, value) {
    if (!this.enabled || !Number.isFinite(value)) return;
    let g = this.gauges.get(name);
    if (!g) {
      g = { ring: new Float32Array(GAUGE_RING), head: 0, count: 0 };
      this.gauges.set(name, g);
    }
    g.ring[g.head] = value;
    g.head = (g.head + 1) % GAUGE_RING;
    if (g.count < GAUGE_RING) g.count++;
  }

  /** Kare dışı iş: setInterval saat tiki, otomatik kayıt, olay dinleyicisi. */
  event(name, ms) {
    if (!this.enabled || ms < LONG_EVENT_MS) return;
    this.events.push({ at: this.now(), name, ms });
    if (this.events.length > 40) this.events.shift();
  }

  endFrame() {
    if (!this.enabled || !this.inFrame) return;
    this.inFrame = false;
    const cpu = this.now() - this.frameStart;
    const slot = this.head;
    this.head = (this.head + 1) % RING;
    if (this.count < RING) this.count++;
    this.cpu[slot] = cpu;
    this.dt[slot] = this.pendingDt >= 0 ? this.pendingDt : NaN;

    for (const name of Object.keys(this.sections)) {
      let s = this.sectionStats.get(name);
      if (!s) {
        s = { sum: 0, max: 0, n: 0 };
        this.sectionStats.set(name, s);
      }
      const v = this.sections[name];
      s.sum += v;
      s.n++;
      if (v > s.max) s.max = v;
      // Kayan pencere: toplamlar sınırsız büyümesin, kabaca son ~300 kare.
      if (s.n > 300) {
        s.sum *= 0.5;
        s.n = Math.round(s.n / 2);
        s.max *= 0.85;
      }
    }

    const paced = this.pendingDt >= 0 ? this.pendingDt : cpu;
    if (paced >= LONG_FRAME_MS) {
      this.longFrames.push({
        at: this.now(), dt: paced, cpu,
        sections: { ...this.sections }, counters: { ...this.counters },
      });
      if (this.longFrames.length > 30) this.longFrames.shift();
    }

    // Heap örneği (yalnız Chrome). Düşüş = muhtemel GC.
    const mem = performance.memory;
    if (mem) {
      const used = mem.usedJSHeapSize;
      if (this.lastHeap && used < this.lastHeap - 1e6) {
        this.gcDrops++;
        this.gcDropBytes += this.lastHeap - used;
      }
      this.lastHeap = used;
    }
  }

  /** Sıralı kopya üzerinden yüzdelik. NaN (kopuk pacing) örnekleri atılır. */
  percentiles(arr) {
    const vals = [];
    for (let i = 0; i < this.count; i++) {
      const v = arr[i];
      if (!Number.isNaN(v)) vals.push(v);
    }
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    const pick = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return {
      n: vals.length, avg, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99),
      max: vals[vals.length - 1],
    };
  }

  snapshot() {
    const dt = this.percentiles(this.dt);
    const cpu = this.percentiles(this.cpu);
    const gauges = {};
    for (const [name, g] of this.gauges) {
      const vals = Array.from(g.ring.subarray(0, g.count)).sort((a, b) => a - b);
      if (!vals.length) continue;
      gauges[name] = {
        n: vals.length,
        avg: vals.reduce((s2, v) => s2 + v, 0) / vals.length,
        p50: vals[Math.floor(0.5 * vals.length)],
        p99: vals[Math.min(vals.length - 1, Math.floor(0.99 * vals.length))],
        max: vals[vals.length - 1],
      };
    }
    const sections = {};
    for (const [name, s] of this.sectionStats) {
      sections[name] = { avg: s.n ? s.sum / s.n : 0, max: s.max };
    }
    return {
      fps: dt ? 1000 / dt.avg : 0,
      dt, cpu, sections, gauges,
      counters: { ...this.counters },
      longFrames: this.longFrames.slice(-8),
      events: this.events.slice(-8),
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
      gc: { drops: this.gcDrops, mb: this.gcDropBytes / 1048576 },
    };
  }

  /** Ölçüm oturumunu sıfırlar (senaryo başı). */
  reset() {
    this.head = 0;
    this.count = 0;
    this.lastFrameAt = 0;
    this.sectionStats.clear();
    this.gauges.clear();
    this.longFrames.length = 0;
    this.events.length = 0;
    this.gcDrops = 0;
    this.gcDropBytes = 0;
  }
}
