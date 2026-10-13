// ATLAS MÜREKKEBİ — gravür katmanı (Canvas2D, statik katmana ve uzak
// önbelleğe pişer; kare başına maliyeti yok).
//
//   uzak/orta zoom : dağ ve tepe SİMGELERİ (gölge yanı taranmış), ağaç
//                    simgesi, kum noktası, saz, tundra işareti
//   yakın zoom     : dağ/tepe simgesi yerine sürekli TARAMA (hachure):
//                    eğim yönünde kısa çizgiler, eş yükselti basamaklarında
//                    sıralı (Lehmann), kalınlık eğimle, gölge yanı kalın
//   siyasi kip     : ülke kenarının iç yanında ince pigment birikmesi
//
// Yerleşim kuralları (Kerem: "fitilli kumaş", hex kimliği ızgarayı geri
// getirir):
//   - Her simge DÜNYA koordinatlı, titreşimli bir ızgaradan doğar; ızgara
//     hexlerle hizalı değildir ve x'te dünya enine tam sayı hücreyle sarılır
//     (dikiş yok). Karar sürekli alanlardan (biyom/yükseklik dokusu) gelir,
//     hex tipinden değil.
//   - Deterministik: aynı zoom + aynı dünya = aynı simge. Statik katman
//     şerit şerit pişse de şeritler birbirini tutar.
//   - Yoğunluk zoomla ölçeklenir: simgenin EKRAN boyu ve aralığı neredeyse
//     sabit kalır, yakınlaştıkça hex başına simge sayısı artar.
//
// Katman notu: DOM'a dokunmaz; yalnız verilen ctx'e çizer.

import { HEX_SIZE } from '../../world/worldgen.js';
import { LINE_COAST } from '../borderMesh.js';

const HEX_W = Math.sqrt(3) * HEX_SIZE;
// Işık yönü (deniz ve GL ile ortak): ekran düzleminde IŞIĞA doğru birim vektör.
const LXY = Math.hypot(0.55, 0.68);
const LX = -0.55 / LXY;
const LY = -0.68 / LXY;

/** Tarama simgeye bu zoomda devreder (statik katman; uzak önbellek hep simge). */
const HACHURE_ZOOM = 1.0;

// ------------------------------------------------------------------ pişirme

/**
 * Stilin ek pişirmesi: MÜREKKEP YÜKSEKLİĞİ, eğim alanı ve yayla eğim
 * dağılımı. Eşikler sabit sayı değil, bu dünyanın ölçülmüş dağılımından
 * (Kerem kuralı: eşikler ölçülmüş dağılımdan).
 *
 * Neden ayrı bir yükseklik: temel alan hex merkezlerinin Gauss'u; her dağ
 * hexi kendi kubbesi. Tarama eş yükselti basamaklarına dizildiği için ilk
 * denemede her kubbenin çevresinde iç içe halkalar çıktı — hex ızgarası
 * mürekkepte geri geldi ("fitilli kumaş"). Burada taban (G) yarım hex
 * Gauss'la bir kez daha süzülür (kubbeler kütleye kaynar) ve AYRINTI (R − G:
 * sırtlı gürültü, oluklar) olduğu gibi geri eklenir: sırt ve vadi kalır,
 * hex kubbesi gider.
 */
export function* atlasBake(world, terrain) {
  const H = terrain.height;
  const W = H.w;
  const Hh = H.h;
  const d = H.data;
  const [tw, th] = H.texel;
  const n = W * Hh;
  const base = new Float32Array(n);
  for (let i = 0; i < n; i++) base[i] = d[i * 4 + 1];
  // Üç geçişli kutu ≈ Gauss (σ ≈ √(r(r+1)) teksel); x sarmal, y kenetli.
  const tmp = new Float32Array(Math.max(W, Hh));
  const r = 6;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < Hh; y++) {
      const row = y * W;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += base[row + ((k % W) + W) % W];
      for (let x = 0; x < W; x++) {
        tmp[x] = acc / (2 * r + 1);
        acc += base[row + ((x + r + 1) % W)] - base[row + ((x - r) % W + W) % W];
      }
      base.set(tmp.subarray(0, W), row);
      if ((y & 255) === 255) yield 'atlas-blur';
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += base[Math.min(Hh - 1, Math.max(0, k)) * W + x];
      for (let y = 0; y < Hh; y++) {
        tmp[y] = acc / (2 * r + 1);
        acc += base[Math.min(Hh - 1, y + r + 1) * W + x] - base[Math.max(0, y - r) * W + x];
      }
      for (let y = 0; y < Hh; y++) base[y * W + x] = tmp[y];
      if ((x & 255) === 255) yield 'atlas-blur';
    }
  }
  // Mürekkep yüksekliği: süzülmüş taban + ayrıntı; kıyı rampası korunur
  // (taban kıyıda sıfıra iner, süzme onu denize taşırmasın diye kıyı payıyla).
  const hInk = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = d[i * 4 + 1];
    const ramp = Math.min(1, Math.max(0, d[i * 4 + 3] / 0.85));
    hInk[i] = Math.max(0, base[i] * ramp + (d[i * 4] - g) * 0.75);
    if ((i & 262143) === 262143) yield 'atlas-ink';
  }
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let y = 0; y < Hh; y++) {
    const yu = y > 0 ? y - 1 : 0;
    const yd = y < Hh - 1 ? y + 1 : Hh - 1;
    const ky = 1 / Math.max(1e-6, (yd - yu) * th);
    for (let x = 0; x < W; x++) {
      const xl = x === 0 ? W - 1 : x - 1;
      const xr = x === W - 1 ? 0 : x + 1;
      const i = y * W + x;
      gx[i] = (hInk[y * W + xr] - hInk[y * W + xl]) / (2 * tw);
      gy[i] = (hInk[yd * W + x] - hInk[yu * W + x]) * ky;
    }
    if ((y & 127) === 127) yield 'atlas-grad';
  }
  const s = [];
  for (let i = 0; i < n; i += 5) {
    if (d[i * 4 + 2] > 0.45 && d[i * 4] > 0.05) s.push(Math.hypot(gx[i], gy[i]));
  }
  s.sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0.005);
  yield 'atlas-stats';
  const sym = yield* symbolField(terrain);
  return { hInk, gx, gy, sym, sMed: q(0.5), s90: q(0.9), s25: q(0.25) };
}

/**
 * SİMGE ALANI: biyom çözünürlüğünde, teksel başına 8 bayt — her simge
 * ailesinin kabul olasılığı (0-255) önceden hesaplı. Mürekkep hücre başına
 * tek bayt okuyup reddeder; biyomun on iki kanalını her hücrede okumak
 * statik dilimin en pahalı işiydi.
 *   0 kum/tundra noktası  1 kumsal  2 saz  3 çayır tutamı  4 kumul
 *   5 ağaç  6 ağaç türü (0 iğne, 1 yaprak, 2 cangıl)  7 kar
 */
function* symbolField(terrain) {
  const B = terrain.biome;
  const n = B.w * B.h;
  const L = n * 4;
  const d = B.data;
  const out = new Uint8Array(n * 8);
  const c255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    const forest = d[k] / 255;
    const jungle = d[k + 1] / 255;
    const grass = d[k + 2] / 255;
    const steppe = d[k + 3] / 255;
    const desert = d[L + k] / 255;
    const tundra = d[L + k + 1] / 255;
    const snow = d[L + k + 2] / 255;
    const marsh = d[2 * L + k] / 255;
    const beach = d[2 * L + k + 1] / 255;
    const temp = d[2 * L + k + 2] / 255;
    const o = i * 8;
    out[o] = c255(desert * 0.85 + tundra * 0.22);
    out[o + 1] = c255(beach * 0.75);
    out[o + 2] = c255(marsh * 1.4);
    out[o + 3] = c255(grass * 0.30 + steppe * 0.45);
    out[o + 4] = c255((desert - 0.45) * 1.6);
    out[o + 5] = c255(smooth(0.32, 0.82, forest + jungle) * (1 - snow));
    out[o + 6] = jungle > forest ? 2 : temp < 0.40 ? 0 : 1;
    out[o + 7] = c255(snow);
    if ((i & 32767) === 32767) yield 'atlas-sym';
  }
  return out;
}

// ------------------------------------------------------------------ örnekleyici

/**
 * Ayırmasız çift doğrusal örnekleyici (GL'deki gfxTerrain ile aynı süzme):
 * mürekkep binlerce nokta sorar, terrainBake.sampleTerrain her çağrıda nesne
 * ayırıyordu. Sonuç `o`ya yazılır.
 */
function fieldOf(terrain, extra) {
  const H = terrain.height;
  const f = terrain.field;
  const W = H.w;
  const Hh = H.h;
  const d = H.data;
  const sx = W / f.spanX;
  const sy = Hh / f.spanY;
  const x0 = f.x0;
  const y0 = f.y0;
  const GX = extra.gx;
  const GY = extra.gy;
  const HI = extra.hInk;
  const B = terrain.biome;
  const Bw = B.w;
  const Bh = B.h;
  const bsx = Bw / f.spanX;
  const bsy = Bh / f.spanY;
  const layer = Bw * Bh * 4;
  const bd = B.data;
  const o = { h: 0, gate: 0, coast: 0, gx: 0, gy: 0 };
  const SYM = extra.sym;
  const bio = {
    forest: 0, jungle: 0, grass: 0, steppe: 0, desert: 0, tundra: 0,
    snow: 0, rock: 0, marsh: 0, beach: 0, temperature: 0, moisture: 0,
  };
  return {
    o,
    bio,
    sym: SYM,
    /** Simge alanında teksel başlangıç indeksi (8 bayt; bkz. symbolField). */
    symAt(x, y) {
      let i = Math.floor((x - x0) * bsx);
      i %= Bw;
      if (i < 0) i += Bw;
      let j = Math.floor((y - y0) * bsy);
      j = j < 0 ? 0 : j >= Bh ? Bh - 1 : j;
      return (j * Bw + i) * 8;
    },
    /** Tam kayıt: h, kapı, kıyı, eğim. */
    at(x, y) {
      const u = (x - x0) * sx - 0.5;
      const v = (y - y0) * sy - 0.5;
      let iu = Math.floor(u);
      const iv = Math.floor(v);
      const fu = u - iu;
      const fv = v - iv;
      iu %= W;
      if (iu < 0) iu += W;
      const iu1 = iu + 1 === W ? 0 : iu + 1;
      const r0 = (iv < 0 ? 0 : iv >= Hh ? Hh - 1 : iv) * W;
      const r1 = (iv + 1 < 0 ? 0 : iv + 1 >= Hh ? Hh - 1 : iv + 1) * W;
      const a = r0 + iu;
      const b = r0 + iu1;
      const c = r1 + iu;
      const e = r1 + iu1;
      const wa = (1 - fu) * (1 - fv);
      const wb = fu * (1 - fv);
      const wc = (1 - fu) * fv;
      const we = fu * fv;
      o.h = HI[a] * wa + HI[b] * wb + HI[c] * wc + HI[e] * we;
      o.gate = d[a * 4 + 2] * wa + d[b * 4 + 2] * wb + d[c * 4 + 2] * wc + d[e * 4 + 2] * we;
      o.coast = d[a * 4 + 3] * wa + d[b * 4 + 3] * wb + d[c * 4 + 3] * wc + d[e * 4 + 3] * we;
      o.gx = GX[a] * wa + GX[b] * wb + GX[c] * wc + GX[e] * we;
      o.gy = GY[a] * wa + GY[b] * wb + GY[c] * wc + GY[e] * we;
      return o;
    },
    /** En yakın teksel: ucuz ön eleme (kapı ve kıyı). */
    near(x, y) {
      let i = Math.floor((x - x0) * sx);
      i %= W;
      if (i < 0) i += W;
      let j = Math.floor((y - y0) * sy);
      j = j < 0 ? 0 : j >= Hh ? Hh - 1 : j;
      const k = (j * W + i) * 4;
      o.h = HI[j * W + i];
      o.gate = d[k + 2];
      o.coast = d[k + 3];
      return o;
    },
    /** Biyom ağırlıkları, en yakın teksel (simge yerleşimine yeter). */
    biome(x, y) {
      let i = Math.floor((x - x0) * bsx);
      i %= Bw;
      if (i < 0) i += Bw;
      let j = Math.floor((y - y0) * bsy);
      j = j < 0 ? 0 : j >= Bh ? Bh - 1 : j;
      const k = (j * Bw + i) * 4;
      bio.forest = bd[k] / 255;
      bio.jungle = bd[k + 1] / 255;
      bio.grass = bd[k + 2] / 255;
      bio.steppe = bd[k + 3] / 255;
      bio.desert = bd[layer + k] / 255;
      bio.tundra = bd[layer + k + 1] / 255;
      bio.snow = bd[layer + k + 2] / 255;
      bio.rock = bd[layer + k + 3] / 255;
      bio.marsh = bd[2 * layer + k] / 255;
      bio.beach = bd[2 * layer + k + 1] / 255;
      bio.temperature = bd[2 * layer + k + 2] / 255;
      bio.moisture = bd[2 * layer + k + 3] / 255;
      return bio;
    },
  };
}

// ------------------------------------------------------------------ yardımcı

/** Tam sayı karması → [0,1). Tuz alan başına sabit: yeni simge eskileri kaydırmaz. */
function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Titreşimli dünya ızgarası: x'te dünya enine TAM SAYI hücre (sarmalda dikiş
 * yok), tek satırlar yarım hücre kaydırılır (kare ızgara yerine petek dizilim;
 * kare dizilim satır satır "ekin tarlası" gibi okunuyordu). fn(i, j, x, y)
 * hücre merkezini açılmış koordinatta alır; i sarmala indirgenmiştir.
 */
function eachCell(rect, cellX, cellY, P, x0, fn) {
  const nX = Math.max(1, Math.round(P / cellX));
  const cw = P / nX;
  const j0 = Math.floor(rect.minY / cellY) - 1;
  const j1 = Math.floor(rect.maxY / cellY) + 1;
  for (let j = j0; j <= j1; j++) {
    const shift = (j & 1) * 0.5;
    const i0 = Math.floor((rect.minX - x0) / cw - shift) - 1;
    const i1 = Math.floor((rect.maxX - x0) / cw - shift) + 1;
    for (let i = i0; i <= i1; i++) {
      const iw = ((i % nX) + nX) % nX;
      fn(iw, j, x0 + (i + 0.5 + shift) * cw, (j + 0.5) * cellY, cw);
    }
  }
}

function appendPts(path, pts, closed, dx) {
  const m = pts.length / 2;
  if (m < 2) return;
  path.moveTo(pts[0] + dx, pts[1]);
  for (let k = 1; k < m; k++) path.lineTo(pts[k * 2] + dx, pts[k * 2 + 1]);
  if (closed) path.closePath();
}

function modeKind(mode) {
  if (mode === 'political') return 'pol';
  if (mode === 'cultures') return 'cult';
  if (mode === 'terrain' || mode === 'geography') return 'geo';
  return 'data';
}

/** Mürekkep tonu: demir-safra sepyası. Siyasi kipte biraz geri çekilir ki yıkama okunsun. */
const INK = [52, 40, 28];
const ink = (a) => `rgba(${INK[0]}, ${INK[1]}, ${INK[2]}, ${a.toFixed(3)})`;

// ------------------------------------------------------------------ simgeler

/**
 * Örten simgeler (ağaç, tepe, dağ) ARKADAN ÖNE çizilir: her simgenin silueti
 * önce önceki mürekkebi siler (destination-out), sonra gölge dolgusu ve
 * çizgisi biner — gravür atlaslarındaki sıra sıra dağ dizisi. Tek tek çizim
 * binlerce çağrı ederdi; y'de ince bantlar halinde toplu çizilir (bant içinde
 * simgeler yan yana, birbirini örtmez).
 *
 * Gölge dolgusu (shade) soluk mürekkep: yalnız çizgiyle simge "kabarcık" ya da
 * "tel kafes" gibi okunuyordu; sağ-alt yanın hafif koyuluğu ona hacim verir.
 */
class Occluders {
  constructor() {
    this.items = [];
  }
  add(y, draw) {
    this.items.push({ y, draw });
  }
  flush(ctx, scale, band, erase, alpha) {
    const items = this.items.sort((a, b) => a.y - b.y);
    let k = 0;
    const lw = [1.15, 0.85, 0.6];
    while (k < items.length) {
      const y0 = items[k].y;
      const sil = new Path2D();
      const shade = new Path2D();
      // 0-2 dağ/tepe (kalın, orta, ince), 3 ağaç: ağaç dağdan bir kademe
      // soluk — orman dokudur, dağ ise okunan bir biçim.
      const lines = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      let n = 0;
      while (k < items.length && items[k].y < y0 + band) {
        items[k].draw(sil, lines, shade);
        k++;
        n++;
      }
      if (!n) continue;
      if (erase) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fill(sil);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = ink(alpha * 0.38);
      ctx.fill(shade);
      const am = Math.min(1, alpha * 1.25);
      for (let b = 0; b < 3; b++) {
        ctx.lineWidth = lw[b] / scale;
        ctx.strokeStyle = ink(am * (b === 2 ? 0.9 : 1));
        ctx.stroke(lines[b]);
      }
      ctx.lineWidth = 0.8 / scale;
      ctx.strokeStyle = ink(alpha * 0.9);
      ctx.stroke(lines[3]);
    }
    this.items = [];
  }
}

/**
 * DAĞ SİMGESİ: sivri tepe, ışık sol-üstten (GL ile aynı yön) — sağ yamaç
 * gölgede: soluk dolgu + sol yamaca paralel kısa tarama. Taban merkezi
 * (x, y), en w, boy hgt (dünya birimi). Silüet tabanın biraz altına uzanır:
 * arkadaki simgenin eteği öndekinin arkasında kaybolur.
 */
function mountainGlyph(x, y, w, hgt, r1, r2, snowy) {
  const ax = x + (r1 - 0.5) * w * 0.22;
  const ay = y - hgt;
  const lx = x - w * 0.5;
  const rx = x + w * 0.5;
  // Omuzlar: yamaç düz çizgi olmasın, gravürde kırık bir sırt gibi dursun.
  const lsx = x - w * (0.22 + r2 * 0.06);
  const lsy = y - hgt * (0.50 + r2 * 0.12);
  const rsx = x + w * (0.20 + r1 * 0.06);
  const rsy = y - hgt * (0.44 + r1 * 0.10);
  // Sırt çizgisi: tepeden tabana inen iç kırık (aydınlık ile gölgeyi ayırır).
  const kx = ax + w * 0.06;
  const ky = y - hgt * 0.02;
  return (sil, lines, shade) => {
    sil.moveTo(lx, y + hgt * 0.10);
    sil.lineTo(lsx, lsy);
    sil.lineTo(ax, ay);
    sil.lineTo(rsx, rsy);
    sil.lineTo(rx, y + hgt * 0.10);
    sil.closePath();
    if (!snowy) {
      shade.moveTo(ax, ay);
      shade.lineTo(rsx, rsy);
      shade.lineTo(rx, y);
      shade.lineTo(kx, ky);
      shade.closePath();
    }
    const L = lines[0];
    L.moveTo(lx, y);
    L.lineTo(lsx, lsy);
    L.lineTo(ax, ay);
    L.lineTo(rsx, rsy);
    L.lineTo(rx, y);
    lines[2].moveTo(ax, ay);
    lines[2].lineTo(ax + (kx - ax) * 0.55 - w * 0.03, ay + (ky - ay) * 0.55);
    // Gölge taraması: sağ yamaçtan aşağı-sola, sol yamaca paralel kısa çizgiler.
    const n = Math.max(2, Math.min(7, Math.round(w / 2.2)));
    const H = lines[snowy ? 2 : 1];
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      let px;
      let py;
      if (t < 0.5) {
        const u = t / 0.5;
        px = ax + (rsx - ax) * u;
        py = ay + (rsy - ay) * u;
      } else {
        const u = (t - 0.5) / 0.5;
        px = rsx + (rx - rsx) * u;
        py = rsy + (y - rsy) * u;
      }
      const len = (y - py) * (snowy ? 0.4 : 0.75);
      H.moveTo(px - w * 0.03, py + hgt * 0.04);
      H.lineTo(px - len * 0.55, py + len);
    }
    if (snowy) {
      // Kar çizgisi: tepenin altında kısa, kırık bir sınır.
      lines[2].moveTo(ax - w * 0.16, ay + hgt * 0.34);
      lines[2].lineTo(ax - w * 0.04, ay + hgt * 0.26);
      lines[2].lineTo(ax + w * 0.06, ay + hgt * 0.36);
      lines[2].lineTo(ax + w * 0.16, ay + hgt * 0.30);
    }
  };
}

/** TEPE SİMGESİ: alçak kubbe; sağ yarısı soluk gölgeli, iki-üç kısa çizgi. */
function hillGlyph(x, y, w, hgt) {
  return (sil, lines, shade) => {
    sil.moveTo(x - w * 0.5, y + hgt * 0.12);
    sil.quadraticCurveTo(x, y - hgt * 2.0, x + w * 0.5, y + hgt * 0.12);
    sil.closePath();
    shade.moveTo(x + w * 0.04, y - hgt * 0.98);
    shade.quadraticCurveTo(x + w * 0.36, y - hgt * 0.8, x + w * 0.5, y);
    shade.lineTo(x + w * 0.12, y);
    shade.closePath();
    lines[1].moveTo(x - w * 0.5, y);
    lines[1].quadraticCurveTo(x, y - hgt * 2.0, x + w * 0.5, y);
    for (let k = 0; k < 3; k++) {
      const px = x + w * (0.14 + k * 0.12);
      const top = y - hgt * (0.85 - k * 0.25);
      lines[2].moveTo(px, top);
      lines[2].lineTo(px - w * 0.06, y - hgt * 0.05);
    }
  };
}

/**
 * AĞAÇ SİMGESİ. Sıcaklığa göre üç biçim: soğukta iğne yapraklı (dar üçgen),
 * ılıkta yaprak döken (yuvarlak taç), sıcak-nemlide cangıl (iri, loblu taç).
 * Taç düz daire değil dalgalı bir kontur; sağ-alt yarısı soluk gölgeli ve
 * gövde çizgili. Yalnız çember çizilince orman "kabarcık naylonu" gibi
 * okunuyordu. Çok küçükken gövde atılır (piksel altı ayrıntı gürültüdür).
 */
function treeGlyph(x, y, r, kind, small, seed) {
  return (sil, lines, shade) => {
    if (kind === 0) {
      // İğne yapraklı: dar üçgen, sağ yarı gölgeli.
      const top = y - r * 2.8;
      const by = y - r * 0.3;
      sil.moveTo(x, top - r * 0.2);
      sil.lineTo(x - r * 0.95, by + r * 0.25);
      sil.lineTo(x + r * 0.95, by + r * 0.25);
      sil.closePath();
      shade.moveTo(x, top);
      shade.lineTo(x + r * 0.82, by);
      shade.lineTo(x + r * 0.05, by);
      shade.closePath();
      lines[3].moveTo(x - r * 0.82, by);
      lines[3].lineTo(x - r * 0.1, top + r * 0.15);
      lines[3].lineTo(x, top);
      lines[3].lineTo(x + r * 0.82, by);
      if (!small) {
        lines[3].moveTo(x, by);
        lines[3].lineTo(x, y + r * 0.25);
      }
      return;
    }
    const rr = kind === 2 ? r * 1.18 : r;
    const cy = y - rr * 1.25;
    sil.moveTo(x + rr * 1.1, cy);
    sil.arc(x, cy, rr * 1.1, 0, Math.PI * 2);
    // Dalgalı taç: N tümsek; yarıçap tohumla oynar, tümsekler arası
    // ikinci derece eğri — yaprak kümesi gibi bir kenar.
    const N = kind === 2 ? 6 : 5;
    const L = lines[3];
    const a0 = seed * 6.283;
    const sd = Math.floor(seed * 9973);
    let fx = 0;
    let fy = 0;
    for (let k = 0; k <= N; k++) {
      const a = a0 + (k / N) * Math.PI * 2;
      const j = 0.78 + 0.16 * hash(k % N, sd, 91);
      const ex = x + Math.cos(a) * rr * j;
      const ey = cy + Math.sin(a) * rr * j;
      if (k === 0) {
        L.moveTo(ex, ey);
        fx = ex;
        fy = ey;
      } else {
        const am = a0 + ((k - 0.5) / N) * Math.PI * 2;
        const cx = x + Math.cos(am) * rr * 1.32;
        const cyy = cy + Math.sin(am) * rr * 1.32;
        if (k === N) L.quadraticCurveTo(cx, cyy, fx, fy);
        else L.quadraticCurveTo(cx, cyy, ex, ey);
      }
    }
    // Gölge: sağ-alt hilal (dış yay sağ-alt, iç yay sol-üste kaymış).
    shade.moveTo(x + Math.cos(-0.5) * rr, cy + Math.sin(-0.5) * rr);
    shade.arc(x, cy, rr, -0.5, 2.3);
    shade.arc(x - rr * 0.32, cy - rr * 0.3, rr * 0.92, 2.15, -0.35, true);
    shade.closePath();
    if (!small) {
      lines[3].moveTo(x, cy + rr * 0.9);
      lines[3].lineTo(x, y + r * 0.15);
    }
  };
}

// ------------------------------------------------------------------ geçişler

/**
 * Zemin işaretleri (örtmeyen): kum noktası, kumsal noktası, tundra, saz,
 * çayır tutamı, kumul. Hepsi dünya ızgarasından, yoğunluk SİMGE ALANINDAN
 * (bkz. atlasBake: biyom ağırlıklarından önceden kurulmuş bayt kanalları) —
 * hücre başına biyomun on iki kanalını okumak, yakın zoomda statik dilimin
 * en pahalı işiydi (ölçüldü: z3.5'te dilim başına ~9 ms).
 */
function groundMarks(ctx, info, F, z, alpha) {
  const { area: rect, world } = info;
  const P = world.wrapWidth;
  const x0 = info.terrain.field.x0;
  const px = 1 / z;
  const S = F.sym;
  // Noktalar: kum (çöl), kumsal, tundra. Kare küçük dikdörtgen: yay
  // çizmekten ucuz, 1 pikselde aynı görünür.
  const dots = new Path2D();
  const dotCell = (4.6 * Math.pow(z / 0.45, 0.12)) * px;
  const ds = Math.max(0.55, 0.62 * Math.pow(z, 0.15)) * px;
  eachCell(rect, dotCell, dotCell * 0.87, P, x0, (i, j, cx, cy, cw) => {
    const x = cx + (hash(i, j, 11) - 0.5) * cw * 0.9;
    const y = cy + (hash(i, j, 12) - 0.5) * cw * 0.9;
    const k = F.symAt(x, y);
    const dp = S[k];
    const bp = S[k + 1];
    if (dp + bp === 0) return;
    const r = hash(i, j, 13) * 255;
    if (r > dp + bp) return;
    const t = F.near(x, y);
    if (t.coast <= 0.02) return;
    const p = dp + bp * smooth(0.55, 0.15, t.coast);
    if (r > p) return;
    dots.rect(x - ds * 0.5, y - ds * 0.5, ds, ds);
  });
  ctx.fillStyle = ink(alpha * 0.8);
  ctx.fill(dots);

  const marks = new Path2D();
  const fine = new Path2D();
  // Saz (bataklık): su çizgisi + üç kısa sap.
  const mCell = 11 * Math.pow(z / 0.45, 0.15) * px;
  eachCell(rect, mCell, mCell * 0.8, P, x0, (i, j, cx, cy, cw) => {
    const x = cx + (hash(i, j, 21) - 0.5) * cw * 0.7;
    const y = cy + (hash(i, j, 22) - 0.5) * cw * 0.6;
    if (hash(i, j, 23) * 255 >= S[F.symAt(x, y) + 2]) return;
    if (F.near(x, y).coast <= 0.05) return;
    const s = 3.1 * Math.pow(z / 0.45, 0.2) * px;
    marks.moveTo(x - s, y);
    marks.lineTo(x + s, y);
    fine.moveTo(x - s * 0.55, y + s * 0.45);
    fine.lineTo(x + s * 0.45, y + s * 0.45);
    fine.moveTo(x - s * 0.5, y);
    fine.lineTo(x - s * 0.62, y - s * 0.75);
    fine.moveTo(x, y);
    fine.lineTo(x, y - s * 1.05);
    fine.moveTo(x + s * 0.5, y);
    fine.lineTo(x + s * 0.62, y - s * 0.75);
  });
  // Çayır/bozkır tutamı ve çöl kumulu: yalnız yakında (uzakta kıl gibi kalır).
  if (z >= 0.9) {
    const gCell = 15 * Math.pow(z, 0.2) * px;
    eachCell(rect, gCell, gCell * 0.85, P, x0, (i, j, cx, cy, cw) => {
      const x = cx + (hash(i, j, 31) - 0.5) * cw * 0.9;
      const y = cy + (hash(i, j, 32) - 0.5) * cw * 0.9;
      if (hash(i, j, 33) * 255 >= S[F.symAt(x, y) + 3]) return;
      const t = F.near(x, y);
      if (t.coast <= 0.05 || t.gate > 0.5) return;
      const s = 2.4 * Math.pow(z, 0.2) * px;
      fine.moveTo(x - s * 0.6, y - s * 0.8);
      fine.lineTo(x - s * 0.15, y);
      fine.moveTo(x, y - s * 1.05);
      fine.lineTo(x + s * 0.05, y);
      fine.moveTo(x + s * 0.6, y - s * 0.8);
      fine.lineTo(x + s * 0.2, y);
    });
    const dCell = 26 * Math.pow(z, 0.15) * px;
    eachCell(rect, dCell, dCell * 0.7, P, x0, (i, j, cx, cy, cw) => {
      const x = cx + (hash(i, j, 41) - 0.5) * cw * 0.8;
      const y = cy + (hash(i, j, 42) - 0.5) * cw * 0.8;
      if (hash(i, j, 43) * 255 >= S[F.symAt(x, y) + 4]) return;
      const s = 6 * Math.pow(z, 0.2) * px;
      // Kumul: rüzgâr batıdan; yay + gölge yanında kısa iç çizgi.
      marks.moveTo(x - s, y);
      marks.quadraticCurveTo(x - s * 0.1, y - s * 0.55, x + s * 0.9, y - s * 0.05);
      fine.moveTo(x + s * 0.05, y - s * 0.22);
      fine.quadraticCurveTo(x + s * 0.45, y - s * 0.05, x + s * 0.55, y + s * 0.18);
    });
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.85 / z;
  ctx.strokeStyle = ink(alpha * 0.85);
  ctx.stroke(marks);
  ctx.lineWidth = 0.6 / z;
  ctx.strokeStyle = ink(alpha * 0.7);
  ctx.stroke(fine);
}

/**
 * Örten simgeler: ağaçlar ve (uzak/orta zoomda) dağ-tepe simgeleri, tek
 * sıralı geçişte. `want`: hangi aileler (yakında dağı tarama devralır).
 *
 * Yoğunluk ölçüsü: ilk denemede orman ve sıradağ HALI gibi doluyordu —
 * simge değil desen. Atlasta simge nefes alır: hücre simgenin ~1.6 katı,
 * kabul olasılığı biyom ağırlığının ancak çekirdeğinde tama yaklaşır.
 */
function occluders(ctx, info, F, z, alpha, want, erase) {
  const { area: rect, world } = info;
  const P = world.wrapWidth;
  const x0 = info.terrain.field.x0;
  const px = 1 / z;
  const occ = new Occluders();
  const ex = info.extra;
  const far = info.far;
  const S = F.sym;

  if (want.trees) {
    // Taç ekranda 5-12 px: daha küçüğü "o o o" noktalamasına dönüyordu.
    const r = (far ? 2.4 : 2.5 * Math.pow(z / 0.45, 0.42)) * px;
    const small = r * z < 2.6;
    const cell = r * (far ? 4.4 : 3.9);
    const pk = (far ? 0.5 : 0.74) * 255;
    eachCell(rect, cell, cell * 0.74, P, x0, (i, j, cx, cy, cw) => {
      const x = cx + (hash(i, j, 51) - 0.5) * cw * 0.75;
      const y = cy + (hash(i, j, 52) - 0.5) * cw * 0.5;
      const k = F.symAt(x, y);
      // Kenar seyrelir: orman lekesinin kıyısı doğal dağılsın.
      if (hash(i, j, 53) * 255 >= S[k + 5] * (pk / 255)) return;
      if (F.near(x, y).coast <= 0.08) return;
      const rr = r * (0.8 + hash(i, j, 54) * 0.4);
      occ.add(y, treeGlyph(x, y, rr, S[k + 6], small, hash(i, j, 55)));
    });
  }

  if (want.mountains) {
    // Sıradağ: büyük doruk sırtta, küçük doruk etekte. Izgara kaba ve
    // titreşim güçlü — ikinci denemede düzenli kafes (elmas örgü) okunuyordu.
    const mw = (far ? 16 : 19 * Math.pow(z / 0.45, 0.42)) * px;
    const cell = mw * 0.9;
    const cellY = cell * 0.6;
    eachCell(rect, cell, cellY, P, x0, (i, j, cx, cy, cw) => {
      const x = cx + (hash(i, j, 61) - 0.5) * cw * 0.85;
      const y = cy + (hash(i, j, 62) - 0.5) * cellY * 0.8;
      if (F.near(x, y).gate < 0.5) return;
      const t = F.at(x, y);
      if (t.coast <= 0.12 || t.gate < 0.6) return;
      const r1 = hash(i, j, 63);
      const r2 = hash(i, j, 64);
      const hk = smooth(0.18, 0.9, t.h);
      const p = smooth(0.6, 0.9, t.gate) * (0.22 + 0.58 * hk);
      if (r2 > p) return;
      const snowy = S[F.symAt(x, y) + 7] > 115;
      const w = mw * (0.55 + 0.7 * hk) * (0.85 + r1 * 0.3);
      occ.add(y, mountainGlyph(x, y, w, w * (0.52 + 0.24 * hk + (r1 - 0.5) * 0.12), r1, r2, snowy));
    });
  }

  if (want.hills) {
    // Tepe: kubbe. Dağ çekirdeğinde değil, tepe kuşağında (kapı ~0.3-0.6).
    const hw = (far ? 10 : 12 * Math.pow(z / 0.45, 0.5)) * px;
    const cell = hw * 1.7;
    eachCell(rect, cell, cell * 0.7, P, x0, (i, j, cx, cy, cw) => {
      const x = cx + (hash(i, j, 81) - 0.5) * cw * 0.8;
      const y = cy + (hash(i, j, 82) - 0.5) * cw * 0.5;
      const g0 = F.near(x, y).gate;
      if (g0 < 0.2 || g0 > 0.78) return;
      const t = F.at(x, y);
      if (t.coast <= 0.15 || t.gate < 0.26 || t.gate > 0.7) return;
      if (Math.hypot(t.gx, t.gy) < ex.s25 * 0.6) return;
      const p = smooth(0.26, 0.45, t.gate) * (1 - smooth(0.6, 0.7, t.gate)) * 0.55;
      if (hash(i, j, 83) > p) return;
      const w = hw * (0.8 + hash(i, j, 84) * 0.4);
      occ.add(y, hillGlyph(x, y, w, w * 0.2));
    });
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  occ.flush(ctx, z, (far ? 3 : 2.2) * px, erase, alpha);
}

/**
 * Periyodik değer gürültüsü (x'te dünya enine tam sayı hücre), 0..1.
 * Tarama basamaklarının evresini bükmek için: sabit evrede basamak sınırları
 * her tümseğin çevresinde kusursuz halka çiziyordu.
 */
function vnoise(x, y, cell, P, x0, salt) {
  const nX = Math.max(1, Math.round(P / cell));
  const cw = P / nX;
  const u = (x - x0) / cw;
  const v = y / cell;
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  let fu = u - iu;
  let fv = v - iv;
  fu = fu * fu * (3 - 2 * fu);
  fv = fv * fv * (3 - 2 * fv);
  const a = ((iu % nX) + nX) % nX;
  const b = (a + 1) % nX;
  const h00 = hash(a, iv, salt);
  const h10 = hash(b, iv, salt);
  const h01 = hash(a, iv + 1, salt);
  const h11 = hash(b, iv + 1, salt);
  return (h00 + (h10 - h00) * fu) * (1 - fv) + (h01 + (h11 - h01) * fu) * fv;
}

/**
 * TARAMA (yakın zoom). Lehmann düzeni: yamaç eş yükselti basamaklarına
 * bölünür (yükseklik aralığı dh); her basamakta eğim yönünde kısa çizgiler,
 * basamak sınırında ince bir boşluk.
 *
 * Tohumlar basamağın ORTA KONTURU boyunca EŞİT ARALIKLA yürünerek dizilir:
 * bir başlangıç noktası kontura itilir, sonra kontur teğeti yönünde d
 * adımlarla iki yana yürünür (her adımda yeniden kontura itilerek). Çizgiler
 * tarak dişi gibi düzenli durur — gravürün asıl görüntüsü bu. Tohumları
 * rastgele ızgaradan alıp kontura itmek aralığı düzensiz bırakıyor, tarama
 * "yağmur" gibi okunuyordu.
 *
 * DÜNYAYA SABİT PARÇALAR: yürüyüş ve en az aralık sırası çizim
 * dikdörtgenine bağlı olursa statik katmanın iki şeridi aynı yamaçta farklı
 * tarama üretir ve şerit sınırında dikiş kalır. Bu yüzden tarama dünyaya
 * hizalı ~360 px'lik parçalarda kurulur (yürüyüş parça içinde kalır), her
 * parça zoom başına önbelleğe girer: kaydırmada yeni şerit hazır parçayı
 * yeniden çizer, hesaplamaz.
 *
 * Önceki denemelerin dersleri de duruyor:
 *   - kubbe halkası: yükseklik mürekkep alanından (kubbesiz, bkz. atlasBake),
 *     basamak evresi yavaş bir gürültüyle bükülür;
 *   - vadide yığılma: en az aralık ızgarası; yürüyüş dolu bölgeye girince durur;
 *   - hafif tepede "kürk": yalnız gerçek yamaç (kapı + ölçülmüş eğim).
 * Işık sol-üstten: aydınlık yamaçta çizgi incelir ya da hiç çizilmez,
 * gölgede kalınlaşır (Dufour) — kütle tonla değil mürekkeple okunur.
 */
const HACH_NB = 7;
const hachCache = { terrain: null, extra: null, z: 0, map: new Map() };

function hachureParams(z, ex) {
  const sp = 4.4 + 0.6 * Math.log2(z);
  const T = 13 + 4 * Math.log2(z);
  const d = sp / z;
  const Tw = T / z;
  const dh = ex.sMed * Tw;
  return { d, Tw, dh, gap: 0.14 * dh, sMin: ex.sMed * 0.7 };
}

/** Bir dünya parçasının tarama yolları (kalınlık kovası başına Path2D). */
function hachureChunk(F, ex, P, x0, prm, cr) {
  const { d, Tw, dh, gap, sMin } = prm;
  const buckets = [];
  for (let b = 0; b < HACH_NB; b++) buckets.push(new Path2D());
  const pts = new Float64Array(48);
  const up = new Float64Array(16);
  const dmin = d * 0.78;
  const gx0 = cr.minX - dmin * 2;
  const gy0 = cr.minY - dmin * 2;
  const gw = Math.ceil((cr.maxX - cr.minX) / dmin) + 5;
  const gh = Math.ceil((cr.maxY - cr.minY) / dmin) + 5;
  const occ = new Int32Array(gw * gh).fill(-1);
  const sx = [];
  const sy = [];
  const S = F.sym;
  const free = (x, y) => {
    const ci = Math.floor((x - gx0) / dmin);
    const cj = Math.floor((y - gy0) / dmin);
    if (ci < 1 || cj < 1 || ci >= gw - 1 || cj >= gh - 1) return -1;
    for (let jj = cj - 1; jj <= cj + 1; jj++) {
      for (let ii = ci - 1; ii <= ci + 1; ii++) {
        const k = occ[jj * gw + ii];
        if (k >= 0 && (sx[k] - x) * (sx[k] - x) + (sy[k] - y) * (sy[k] - y) < dmin * dmin) return -1;
      }
    }
    return cj * gw + ci;
  };
  const inside = (x, y) => x >= cr.minX && x < cr.maxX && y >= cr.minY && y < cr.maxY;
  const eligible = (t) => t.gate >= 0.45 && t.coast >= 0.2 && t.gx * t.gx + t.gy * t.gy >= sMin * sMin;

  /** Tohumdan basamak içinde yukarı ve aşağı eğim çizgisi. t: tohumdaki örnek. */
  const emit = (x, y, top, bot, tg, tgx, tgy, th) => {
    const s = Math.hypot(tgx, tgy);
    const gX = tgx / s;
    const gY = tgy / s;
    const lit = -(gX * LX + gY * LY);
    let w = 0.3 + 1.3 * Math.pow(Math.min(1.8, s / ex.s90), 1.2);
    w *= (lit > 0 ? 1 - 0.7 * lit : 1 - 0.4 * lit) * (0.45 + 0.55 * smooth(0.45, 0.8, tg));
    // Aydınlık ve yumuşak yamaç beyaz kalır (Dufour): kıl gibi çizgi gürültüdür.
    if (w < 0.34) return;
    if (S[F.symAt(x, y) + 7] > 128) w *= 0.5;
    let n = 0;
    let m = 0;
    let ux = x;
    let uy = y;
    let qh = th;
    let qx = tgx;
    let qy = tgy;
    for (let st = 0; st < 4 && qh < top; st++) {
      const qs = Math.hypot(qx, qy);
      if (qs < sMin * 0.5) break;
      const step = Math.min(Tw * 0.4, Math.max(d * 0.35, (top - qh) / qs));
      ux += (qx / qs) * step;
      uy += (qy / qs) * step;
      up[m++] = ux;
      up[m++] = uy;
      const q = F.at(ux, uy);
      qh = q.h;
      qx = q.gx;
      qy = q.gy;
    }
    for (let q = m - 2; q >= 0; q -= 2) {
      pts[n++] = up[q];
      pts[n++] = up[q + 1];
    }
    pts[n++] = x;
    pts[n++] = y;
    let dx = x;
    let dy = y;
    qh = th;
    qx = tgx;
    qy = tgy;
    for (let st = 0; st < 4 && qh > bot; st++) {
      const qs = Math.hypot(qx, qy);
      if (qs < sMin * 0.5) break;
      const step = Math.min(Tw * 0.4, Math.max(d * 0.35, (qh - bot) / qs));
      dx -= (qx / qs) * step;
      dy -= (qy / qs) * step;
      pts[n++] = dx;
      pts[n++] = dy;
      const q = F.at(dx, dy);
      if (q.coast < 0.12) break;
      qh = q.h;
      qx = q.gx;
      qy = q.gy;
    }
    if (n < 4) return;
    const bi = Math.max(0, Math.min(HACH_NB - 1, Math.round((w - 0.3) / 0.25)));
    const path = buckets[bi];
    path.moveTo(pts[0], pts[1]);
    for (let q = 2; q < n; q += 2) path.lineTo(pts[q], pts[q + 1]);
  };
  const mark = (slot, x, y) => {
    occ[slot] = sx.length;
    sx.push(x);
    sy.push(y);
  };
  /** Kontura bir Newton adımı; dönüş: yeni noktadaki örnek (F.o) ya da null. */
  let px = 0;
  let py = 0;
  const project = (hk, t) => {
    const qs2 = t.gx * t.gx + t.gy * t.gy;
    if (qs2 < 1e-12) return null;
    const off = (t.h - hk) / qs2;
    px -= t.gx * off;
    py -= t.gy * off;
    return F.at(px, py);
  };

  eachCell(cr, d * 2.2, d * 2.2, P, x0, (i, j, cx, cy, cw) => {
    px = cx + (hash(i, j, 71) - 0.5) * cw * 0.8;
    py = cy + (hash(i, j, 72) - 0.5) * cw * 0.8;
    if (!inside(px, py)) return;
    let t = F.near(px, py);
    if (t.gate < 0.45 || t.coast < 0.2) return;
    t = F.at(px, py);
    if (!eligible(t)) return;
    const phase = vnoise(px, py, HEX_W * 2.2, P, x0, 77);
    const k = Math.floor(t.h / dh + phase);
    const hk = (k + 0.5 - phase) * dh;
    const top = hk + dh * 0.5 - gap;
    const bot = hk - dh * 0.5 + gap;
    t = project(hk, t);
    if (!t || !inside(px, py) || !eligible(t)) return;
    const slot0 = free(px, py);
    if (slot0 < 0) return;
    const s0x = px;
    const s0y = py;
    const s0 = [t.gate, t.gx, t.gy, t.h];
    mark(slot0, px, py);
    emit(px, py, top, bot, t.gate, t.gx, t.gy, t.h);
    // İki yana kontur yürüyüşü (parça içinde).
    for (let dir = -1; dir <= 1; dir += 2) {
      px = s0x;
      py = s0y;
      let qgx = s0[1];
      let qgy = s0[2];
      for (let st = 0; st < 200; st++) {
        const qs = Math.hypot(qgx, qgy);
        if (qs < sMin * 0.8) break;
        px += (-qgy / qs) * dir * d;
        py += (qgx / qs) * dir * d;
        const a = F.at(px, py);
        const r = project(hk, a);
        if (!r || !inside(px, py) || !eligible(r)) break;
        const slot = free(px, py);
        if (slot < 0) break;
        mark(slot, px, py);
        // emit F.at'in ortak çıktı nesnesini ezer: eğim ÖNCE alınır.
        qgx = r.gx;
        qgy = r.gy;
        emit(px, py, top, bot, r.gate, qgx, qgy, r.h);
      }
    }
  });
  return buckets;
}

function hachures(ctx, info, F, z, alpha) {
  const { area, world, extra: ex } = info;
  const P = world.wrapWidth;
  const x0 = info.terrain.field.x0;
  const prm = hachureParams(z, ex);
  const C = hachCache;
  if (C.terrain !== info.terrain || C.extra !== ex || C.z !== z || C.map.size > 900) {
    C.terrain = info.terrain;
    C.extra = ex;
    C.z = z;
    C.map.clear();
  }
  const nC = Math.max(1, Math.round(P / (360 / z)));
  const cw = P / nC;
  const chh = 360 / z;
  const all = [];
  for (let b = 0; b < HACH_NB; b++) all.push(new Path2D());
  const i0 = Math.floor((area.minX - x0) / cw);
  const i1 = Math.floor((area.maxX - x0) / cw);
  const j0 = Math.floor(area.minY / chh);
  const j1 = Math.floor(area.maxY / chh);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const iw = ((i % nC) + nC) % nC;
      const key = iw * 65536 + (j + 32768);
      let paths = C.map.get(key);
      if (!paths) {
        const cr = { minX: x0 + iw * cw, maxX: x0 + (iw + 1) * cw, minY: j * chh, maxY: (j + 1) * chh };
        paths = hachureChunk(F, ex, P, x0, prm, cr);
        C.map.set(key, paths);
      }
      const shift = ((i - iw) / nC) * P;
      const m = shift ? new DOMMatrix([1, 0, 0, 1, shift, 0]) : undefined;
      for (let b = 0; b < HACH_NB; b++) all[b].addPath(paths[b], m);
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink(alpha);
  // Orta-yakın zoomda (z ~1-2) aynı çizgi ekranda daha ince bir doku olur;
  // kütle okunsun diye kalınlık o bantta biraz açılır.
  const kz = 1 + 0.3 * (1 - smooth(1.0, 2.2, z));
  for (let b = 0; b < HACH_NB; b++) {
    ctx.lineWidth = ((0.3 + b * 0.25) * kz) / z;
    ctx.stroke(all[b]);
  }
}

/**
 * PİGMENT BİRİKMESİ: suluboya kurudukça pigment lekenin kenarına göç eder.
 * Ülkenin yumuşak çokgenine kırpılmış darbe — yalnız iç yarısı görünür, her
 * yan kendi tonunda (kültür kipindeki iç hat ile aynı kırpma). İki ince
 * kademe: dış 1.2 px koyu, iç 2.8 px soluk. Çizgi gibi okunur, alan gibi değil.
 */
function pigmentRim(ctx, info) {
  const r = info.renderer;
  const world = info.world;
  const rect = info.rect;
  const z = info.scale;
  const mesh = r.borderMeshFor(world);
  const index = r.meshIndex(mesh);
  const P = world.wrapWidth || 0;
  const a = [];
  const b = [];
  const k = info.far ? 1.25 : 1;
  for (const [g, entry] of index.groupList) {
    if (g < 0 || !entry.chains.length) continue;
    const nation = world.nations[g];
    if (!nation || !r.copyShifts(entry.bbox, rect, P, a).length) continue;
    const edge = new Path2D();
    let any = false;
    for (const cid of entry.chains) {
      const ch = mesh.chains[cid];
      for (const dx of r.copyShifts(ch.bbox, rect, P, b)) {
        appendPts(edge, r.chainPts(ch), ch.closed, dx);
        any = true;
      }
    }
    if (!any) continue;
    const clip = new Path2D();
    for (const rid of entry.regions) {
      const region = mesh.regions[rid];
      for (const dx of r.copyShifts(region.bbox, rect, P, b)) {
        for (const loop of r.regionLoops(region)) appendPts(clip, loop, true, dx);
      }
    }
    const h = Math.round(((nation.hue % 360) + 360) % 360);
    const s = Math.round(Math.max(30, Math.min(62, nation.sat * 1.1 + 10)));
    const l = Math.round(Math.max(30, Math.min(52, 46 + (nation.light - 50) * 0.5)));
    ctx.save();
    ctx.clip(clip);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = `hsl(${h} ${s}% ${l}%)`;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = (2 * 2.8 * k) / z;
    ctx.stroke(edge);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = (2 * 1.2 * k) / z;
    ctx.stroke(edge);
    ctx.restore();
  }
}

/** Siyasetsiz kiplerde kıyı: oyun orada kıyı çizmiyor; atlas kıyısı ince sepya. */
function coastInk(ctx, info) {
  const r = info.renderer;
  const world = info.world;
  const mesh = r.borderMeshFor(world);
  const P = world.wrapWidth || 0;
  const shifts = [];
  const path = new Path2D();
  let any = false;
  for (const ch of mesh.chains) {
    if (ch.cls !== LINE_COAST) continue;
    for (const dx of r.copyShifts(ch.bbox, info.rect, P, shifts)) {
      appendPts(path, r.chainPts(ch), ch.closed, dx);
      any = true;
    }
  }
  if (!any) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink(0.85);
  ctx.lineWidth = (info.far ? 1.6 : 1.3) / info.scale;
  ctx.stroke(path);
}

// ------------------------------------------------------------------ giriş

function part(name, t0) {
  const st = (globalThis.__atlasInk ??= { calls: 0, ms: 0, max: 0, far: 0 });
  st.parts ??= {};
  st.parts[name] = (st.parts[name] ?? 0) + (performance.now() - t0);
}

/** Sınır çizgilerinin ALTINDA: simgeler, tarama, birikme, kıyı. */
export function atlasInkUnder(ctx, info) {
  const kind = modeKind(info.mode);
  if (kind === 'data' || !info.terrain || !info.extra) return;
  const t0 = performance.now();
  const tune = info.tune ?? {};
  const z = info.scale;
  // Üretim alanı: statik şeridin kırpması + simge payı (en iri simge ~48 px).
  // rect şeridin 2.5 hex yakalı halidir; yaka boyunca simge üretmek dilim
  // başına işi ~iki katına çıkarıyordu.
  const c = info.clip;
  const m = 48 / z;
  info.area = c
    ? { minX: Math.max(info.rect.minX, c.minX - m), maxX: Math.min(info.rect.maxX, c.maxX + m),
        minY: Math.max(info.rect.minY, c.minY - m), maxY: Math.min(info.rect.maxY, c.maxY + m) }
    : info.rect;
  const F = fieldOf(info.terrain, info.extra);
  const pol = kind !== 'geo';
  const alpha = (pol ? 0.58 : 0.8) * (tune.symbols ?? 1);
  // Silme (destination-out) yalnız katmanda bizden önce mürekkep yoksa:
  // kültür taraması ve ızgara silinmesin.
  const erase = kind !== 'cult' && !info.renderer.showGrid;
  ctx.save();
  if (alpha > 0) {
    if (info.far) {
      occluders(ctx, info, F, z, alpha, { trees: true, mountains: true, hills: true }, erase);
    } else {
      let tp = performance.now();
      groundMarks(ctx, info, F, z, alpha);
      part('ground', tp);
      tp = performance.now();
      const near = z >= HACHURE_ZOOM;
      if (near && (tune.hachure ?? 1) > 0) hachures(ctx, info, F, z, (pol ? 0.78 : 0.88) * (tune.hachure ?? 1));
      part('hachure', tp);
      tp = performance.now();
      occluders(ctx, info, F, z, alpha, { trees: true, mountains: !near, hills: true }, erase);
      part('occ', tp);
    }
  }
  ctx.restore();
  const tr = performance.now();
  if (kind === 'pol' && (tune.rim ?? 1) > 0) pigmentRim(ctx, info);
  part('rim', tr);
  if (kind === 'geo') coastInk(ctx, info);
  // Ölçüm: statik katman / uzak önbellek pişirmesinde mürekkebin payı
  // (perf kaplaması 'r.atlasink'; başsız ölçüm için __atlasInk).
  const dt = performance.now() - t0;
  info.renderer.perf?.add('r.atlasink', dt);
  const st = (globalThis.__atlasInk ??= { calls: 0, ms: 0, max: 0, far: 0 });
  st.calls++;
  st.ms += dt;
  st.max = Math.max(st.max, dt);
  if (info.far) st.far = dt;
}

/** Sınır çizgilerinin ÜSTÜNDE: şimdilik yok (etiketler oyunun). */
export function atlasInkOver() {}

/**
 * Nehir: oyunun mavi bant yerine sivrilen mürekkep çizgisi. Akış arttıkça
 * kalınlaşır (kaynakta kıl gibi, ağızda dolgun), ton koyu mürekkep-mavisi:
 * açık yıkama üstünde mavi bant soluk kalıyordu.
 */
export function atlasRiverStyle(ctx, info, geo) {
  const { rect, world, scale, far } = info;
  const P = world.wrapWidth || 0;
  const r = info.renderer;
  const NB = 6;
  const paths = [];
  for (let b = 0; b < NB; b++) paths.push(new Path2D());
  const shifts = [];
  for (const g of geo) {
    if (far && g.flow < 0.18) continue;
    if (!r.copyShifts(g.bbox, rect, P, shifts).length) continue;
    const b = Math.max(0, Math.min(NB - 1, Math.floor(Math.sqrt(g.flow) * NB)));
    for (const dx of shifts) appendPts(paths[b], g.pts, false, dx);
  }
  const zz = far ? 0.3 : Math.max(0, Math.min(1, (scale - 0.45) / 1.5));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let b = 0; b < NB; b++) {
    const w = (0.7 + b * 0.45) * (1 + zz * 0.9);
    ctx.lineWidth = w / scale;
    ctx.strokeStyle = `rgba(38, 72, 104, ${(0.78 + b * 0.03).toFixed(2)})`;
    ctx.stroke(paths[b]);
  }
  ctx.restore();
}

export const ATLAS_HEX_W = HEX_W;
