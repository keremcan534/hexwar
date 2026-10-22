// Örnek çalıcı: gerçek orkestra kayıtları (VSCO 2 CE, CC0), bkz.
// scripts/audio/build-orchestra.mjs. Her enstrümanda notalar 3-4 yarım seste
// birdir; istenen perde en yakın kökten `playbackRate` ile kaydırılır.
// Aynı nota art arda gelirse sıradaki kayıt (round robin) çalar — tek
// kaydı tekrarlamak "makineli tüfek" sesi verir, orkestrayı ele verir.
//
// Katman notu: tarayıcı ses API'si ister, oyun durumunu bilmez.

const BASE = 'assets/audio/orchestra/';

// Bellek: bütün örnekler çözülünce 44.1 kHz'de ~200 MB (Vorbis 8 MB). Bu yüzden
// tembel: banka bir kez okunur, ham dosya (sıkıştırılmış) enstrüman istenince
// bir kez indirilir, çözme bağlam başına ve yalnız istenen enstrümanlar için
// yapılır. Aynı bağlamdaki bütün parçalar tek Orchestra'yı (tek tampon kümesini)
// paylaşır; çözülmüş tampon o bağlamın örnek hızına bağlı olduğu için bağlamlar arası değil.
let bankPromise = null;
const rawFiles = new Map();
const perContext = new WeakMap();

function bankOf(base) {
  if (!bankPromise) {
    bankPromise = fetch(base + 'bank.json').then((r) => r.json());
    bankPromise.catch(() => { bankPromise = null; });
  }
  return bankPromise;
}

function rawFile(base, f) {
  let p = rawFiles.get(f);
  if (!p) {
    p = fetch(base + f).then((r) => r.arrayBuffer());
    rawFiles.set(f, p);
    p.catch(() => rawFiles.delete(f));
  }
  return p;
}

/** `insts` verilmezse bütün enstrümanlar (lab, atölye); verilirse yalnız onlar çözülür. */
export async function loadOrchestra(ctx, insts = null, base = BASE) {
  const bank = await bankOf(base);
  let orc = perContext.get(ctx);
  if (!orc) {
    orc = new Orchestra(ctx, bank, base);
    perContext.set(ctx, orc);
  }
  await orc.ensure(insts ?? Object.keys(bank));
  return orc;
}

export class Orchestra {
  constructor(ctx, bank, base = BASE) {
    this.ctx = ctx;
    this.bank = bank;
    this.base = base;
    this.buffers = new Map();
    this.loading = new Map();
    this.rr = new Map();
  }

  /** Enstrümanların bütün kayıtlarını bu bağlamda çöz (zaten çözülmüş olanı atlar). */
  ensure(insts) {
    return Promise.all(insts.filter((i) => this.bank[i]).map((inst) => {
      let p = this.loading.get(inst);
      if (!p) {
        p = Promise.all(this.bank[inst].map(async ({ f }) => {
          const ab = await rawFile(this.base, f);
          this.buffers.set(f, await this.ctx.decodeAudioData(ab.slice(0)));
        }));
        this.loading.set(inst, p);
        p.catch(() => this.loading.delete(inst));
      }
      return p;
    }));
  }

  /** Bu enstrümanın `midi`yi çalmak için en az kaç yarım ses kaydırması gerekir. */
  shift(inst, midi) {
    return Math.min(...this.bank[inst].map((e) => Math.abs(e.root - midi)));
  }

  /**
   * En yakın kök, sonra istenen katman, eşitler arasında sırayla. Birden çok
   * enstrüman verilirse perdeyi en az kaydıracak olan çalar: 3 yarım sesten
   * fazla kaydırılan pirinç tınısını yitirir ("sincap sesi"), kornonun
   * boşluğunu trombon doldurur.
   */
  pick(insts, midi, layer) {
    const inst = Array.isArray(insts) ? insts.reduce((a, b) => (this.shift(b, midi) < this.shift(a, midi) - 0.25 ? b : a)) : insts;
    const all = this.bank[inst];
    let pool = all;
    if (midi != null && all[0].root != null) {
      const best = Math.min(...all.map((e) => Math.abs(e.root - midi)));
      pool = all.filter((e) => Math.abs(e.root - midi) <= best + 0.5);
    }
    const near = Math.min(...pool.map((e) => Math.abs(e.layer - layer)));
    pool = pool.filter((e) => Math.abs(e.layer - layer) === near);
    const key = `${inst}:${pool[0].f}`;
    const n = this.rr.get(key) ?? 0;
    this.rr.set(key, n + 1);
    return pool[n % pool.length];
  }

  /**
   * @param inst   enstrüman ya da en az kaydırmayla seçilecek enstrüman listesi
   * @param out    hedef düğüm
   * @param t      başlangıç (ctx zamanı); `peak`li örnekte doruğun zamanı
   * @param o.midi perde (perdesizde yok sayılır)
   * @param o.vel  0..1 doğrusal kazanç
   * @param o.layer 0 hafif / 1 güçlü / 2 en güçlü
   * @param o.dur  nota süresi; yoksa kayıt kendi sönümüyle biter
   * @param o.jitter en çok bu kadar (sn) geç başla — ızgaraya kilitli nota makine gibidir
   * @param o.cents  ±bu kadar sent rastgele akort sapması (bölükte herkes aynı değildir)
   */
  play(inst, out, t, { midi = null, vel = 1, layer = 1, dur = null, release = 0.18, pan = 0, jitter = 0.008, cents = 0 } = {}) {
    const { ctx } = this;
    const e = this.pick(inst, midi, layer);
    const buf = this.buffers.get(e.f);
    // Enstrüman bu bağlamda çözülmemiş (parça INSTRUMENTS listesinde unutmuş):
    // sessiz geç, bir kez uyar — çökme müziği bütünüyle susturur.
    if (!buf) {
      if (!this.warned?.has(inst)) (this.warned ??= new Set()).add(String(inst)) && console.warn(`orkestra: '${inst}' çözülmemiş, nota atlandı`);
      return null;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bend = cents ? ((Math.random() * 2 - 1) * cents) / 100 : 0;
    if (midi != null && e.root != null) src.playbackRate.value = 2 ** ((midi - e.root + bend) / 12);
    const g = ctx.createGain();
    g.gain.value = vel;
    let tail = g;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(out);
    src.connect(g);
    const at = (e.peak ? t - e.peak : t) + Math.random() * jitter;
    const start = Math.max(at, 0);
    src.start(start, start - at);
    if (dur != null) {
      g.gain.setValueAtTime(vel, t + dur);
      g.gain.setTargetAtTime(0, t + dur, release / 3);
      src.stop(t + dur + release * 3);
    }
    return src;
  }
}

/** Salon yankısı: üretilmiş dürtü tepkisi. Kayıtlar kuru odada; bu onlara salon verir. */
export function makeReverb(ctx, seconds = 3.6, decay = 3.0) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // Tek kutuplu alçak geçiren: kuyruk zamanla kararır, salon gibi.
      const k = 0.5 - 0.38 * x;
      lp += k * ((Math.random() * 2 - 1) - lp);
      const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.015));
      d[i] = lp * (1 - x) ** decay * fadeIn;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}
