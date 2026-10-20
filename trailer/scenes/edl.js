// KURGU KARAR LİSTESİ. Her zaman damgası audio/beatmap.json'daki ölçülmüş
// bir müzik olayına bağlıdır (yorumlarda olay adı). Tahmini BPM yok.
//
// Üç kamera dili:
//   İMPARATORLUK — yavaş, ağır, geniş (heavy / inOutQuint)
//   ANALİZ       — bir değere doğru kesin itiş (outQuart / outExpo)
//   KRİZ         — hızlı, yönlü, sert (whip, outExpo, sarsıntı)
import { W, H, frameRect } from '../motion/camera.js';
import { clamp, outQuart, outExpo, inOutCubic, inOutQuint, heavy, inCubic, linear, outCubic, shake, spring, inOutSine } from '../motion/easing.js';
import { title, brassLine, label, underline, IVORY, BRASS, BURGUNDY_HI, SERIF, SANS } from '../typography/type.js';
import * as fx from '../effects/fx.js';
import { warCard, logoCard, wavingFlag } from '../effects/cards.js';

export const DURATION = 72.0;

// Müzik olayları (beatmap.json -> fragman saniyesi)
export const B = {
  bar1: 1.00, swell: 4.97, rise: 6.95, tension: 8.94, phrase: 10.92,
  pulse: 11.92, accent1: 13.43, suspend: 14.94, bassIn: 19.45, rhythm: 19.94, bass2: 20.44,
  dropOut: 23.93, acc2: 25.95, acc3: 27.47, acc4: 27.97, swell2: 28.48, imp2: 28.98, acc5: 30.0,
  breath: 32.5, DROP: 34.03, final: 63.52, release: 64.03,
};
// Çift darbeler: 35.52 + 2k ve 36.02 + 2k
const P = (k, second = false) => +(35.52 + 2 * k + (second ? 0.5 : 0)).toFixed(2);

const R = (x, y, w, h) => ({ x, y, w, h });
const env = (t, a, b, fin = 0.3, fout = 0.3) => {
  if (t < a || t > b + fout) return 0;
  return outQuart(clamp((t - a) / fin)) * (t > b ? 1 - inCubic(clamp((t - b) / fout)) : 1);
};
// Odak dikdörtgeni anahtar kareleri arasında kayar (iki maske üst üste binmez).
const slide = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [ta, a] = keys[i - 1], [tb, b] = keys[i], k = inOutCubic(clamp((t - ta) / (tb - ta)));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
  }
  return keys[keys.length - 1][1];
};
// Kareyi doldurmayan bir dikdörtgene ANALİZ kamerası.
const look = (r, fill, t, ease = outQuart, bias) => ({ t, ...frameRect(r, fill, bias), ease });

export function buildEDL(meta) {
  const S = meta.stills ?? {};
  const rect = (still, key, fb) => S[still]?.rects?.[key] ?? fb;
  const tl = S.trade_coal?.rects?.labels ?? {};
  const tla = S.trade_coal_after?.rects?.labels ?? tl;
  const valR = (lab, k, fb) => lab[k]?.value ?? fb;
  const lblR = (lab, k, fb) => lab[k]?.label ?? fb;
  // Yurtiçi pazar bloğu: Produced etiketinden Coverage değerine.
  const dm = (lab) => {
    const a = lblR(lab, 'Produced', R(1343, 548, 46, 16)), z = valR(lab, 'Coverage', R(1701, 589, 22, 16));
    return R(a.x - 6, a.y - 6, z.x + z.w - a.x + 12, z.y + z.h - a.y + 12);
  };
  const rowR = (lab, k) => { const a = lblR(lab, k, R(1343, 548, 46, 16)), v = valR(lab, k, R(1506, 548, 21, 16)); return R(a.x - 4, a.y - 3, v.x + v.w - a.x + 8, v.h + 6); };
  const coalRow = rect('trade_coal', 'coalRow', R(761, 559, 280, 62));
  const why = rect('trade_coal', 'why', { r: R(1355, 676, 370, 15) }).r;
  const armsRow = rect('industry', 'arms', R(437, 480, 1034, 104));
  const coalIn = rect('industry', 'coal', [R(843, 496, 49, 18)])[0];
  const shortBy = rect('construction', 'short', { r: R(434, 568, 296, 18) }).r;
  const produces = rect('dossier', 'produces', R(210, 470, 170, 52));
  const strength = rect('dossier', 'strength', R(440, 309, 121, 98));
  const warBtn = rect('dossier_confirm', 'war', R(28, 615, 176, 90));
  const cede = rect('peace_offer', 'cede', { r: R(197, 375, 600, 20) })?.r ?? R(197, 375, 600, 20);
  const proposes = rect('peace_offer', 'proposes', { r: R(197, 332, 520, 18) })?.r ?? R(197, 332, 520, 18);
  const accept = rect('peace_offer', 'accept', R(197, 416, 760, 26)) ?? R(197, 416, 760, 26);
  const coalTrack = meta.shots?.coal_reveal?.track ?? [];
  const annexClick = meta.shots?.annex?.click ?? 120;
  const nums = {
    before: meta.coal?.prewar, after: meta.coal?.after16,
  };

  const clips = [];
  const add = (c) => { clips.push(c); return c; };

  // ============================================================ PERDE 1 — KONTROL
  // Siyahtan deniz. İmparatorluk kamerası: neredeyse durağan, ağır itiş.
  add({ type: 'seq', name: 'ocean_open', t0: 0, t1: 4.47, start: 0,
    cam: [{ t: 0, z: 1.0 }, { t: 5.2, z: 1.07, ease: inOutSine }],
    grade: { contrast: 1.12, saturate: 0.82, brightness: 0.95, tint: 'rgba(10,22,40,0.3)' },
    over: (c, t) => fx.dust(c, t, { count: 40, alpha: 0.22 }) });
  // Kara belirir (dalga parıltısıyla çözülme), geri çekilme sürer.
  add({ type: 'seq', name: 'land_reveal_geo', t0: 4.47, t1: B.tension, start: 0, in: { type: 'dissolve', dur: 1.1 },
    cam: [{ t: 4.47, z: 1.04 }, { t: 9, z: 1.0, ease: inOutSine }],
    grade: { contrast: 1.1, saturate: 0.8, brightness: 0.96, tint: 'rgba(10,22,40,0.28)' },
    over: (c, t) => fx.dust(c, t, { count: 30, alpha: 0.18 }) });
  // Sınırlar: Lorania'dan dışa açılan pirinç halkalı maske (sınır izi).
  add({ type: 'seq', name: 'land_reveal_pol', t0: B.tension, t1: B.pulse, start: Math.round((B.tension - 4.47) * 60),
    in: { type: 'iris', dur: 1.5, x: W * 0.56, y: H * 0.52 },
    cam: [{ t: B.tension, z: 1.0 }, { t: B.phrase, z: 1.02 }, { t: B.pulse, z: 1.09, ease: inCubic }],
    grade: { contrast: 1.1, saturate: 0.86, tint: 'rgba(10,22,40,0.22)' } });

  // ============================================================ PERDE 2 — BASKI
  // İLK NABIZ: kendi ülken. Kriz kamerası (hızlı itiş), oyunun kendi adı.
  add({ type: 'seq', name: 'lorania_intro', t0: B.pulse, t1: B.accent1, start: 0, rate: 95, in: { type: 'light', dur: 0.12, amount: 0.45 },
    cam: [{ t: B.pulse, z: 1.0 }, { t: B.accent1, z: 1.05, ease: outQuart }],
    grade: { contrast: 1.1, saturate: 0.92 },
    over: (c, t) => {
      brassLine(c, { x: 120, y: 868, w: 420, t, t0: B.pulse + 0.25, dur: 0.6, align: 'left', t1: B.accent1 - 0.25, outDur: 0.2 });
      label(c, 'LORANIA', { x: 120, y: 850, size: 58, font: SERIF, tracking: [0.45, 0.24], t, t0: B.pulse + 0.15, t1: B.accent1 - 0.25, outDur: 0.2 });
      label(c, '18 PROVINCES  ·  16.2M PEOPLE  ·  1837', { x: 122, y: 908, size: 21, t, t0: B.pulse + 0.4, t1: B.accent1 - 0.25, outDur: 0.2, color: '#cfc3a8' });
    } });
  // Fabrika: silah sanayisinin girdisi KÖMÜR.
  add({ type: 'still', name: 'industry', t0: B.accent1, t1: B.suspend,
    cam: [look(armsRow, 0.9, B.accent1), look(coalIn, 0.16, B.suspend, outQuart)],
    focus: [{ rect: armsRow, t0: B.accent1, t1: B.suspend, dim: 0.75, blur: 3, fin: 0.25 }],
    over: (c, t, v) => { fx.brackets(c, proj(v, coalIn), env(t, B.accent1 + 0.45, B.suspend, 0.3)); } });
  // Ticaret: Kömür — SHORTAGE — Import dependent; sonra rakam: 56%.
  const cov = valR(tl, 'Coverage', R(1701, 589, 22, 16));
  add({ type: 'still', name: 'trade_coal', t0: B.suspend, t1: B.bassIn,
    cam: [look(coalRow, 0.36, B.suspend, outQuart, [-440, 0]), look(coalRow, 0.33, 16.0, linear, [-440, 0]), look(dm(tl), 0.56, 16.9, inOutCubic, [-380, 0]), look(dm(tl), 0.6, 17.85, linear, [-380, 0]), look(dm(tl), 0.84, 18.3, inOutCubic),
      { t: 19.1, ...frameRect(cov, 0.05), ease: inOutCubic }, { t: B.bassIn, ...frameRect(cov, 0.09), ease: inCubic }],
    focus: [{ rect: slide([[16.2, coalRow], [16.9, dm(tl)], [17.95, dm(tl)], [18.35, R(cov.x - 4, cov.y - 3, cov.w + 8, cov.h + 6)]]), t0: B.suspend, t1: B.bassIn, dim: 0.74, blur: 4, fin: 0.2 }],
    over: (c, t, v) => {
      title(c, 'COAL', { x: 150, y: 520, size: 112, align: 'left', t, t0: 15.25, t1: 17.85, tracking: [0.5, 0.2] });
      title(c, 'SHORTAGE', { x: 154, y: 610, size: 56, align: 'left', t, t0: 15.6, t1: 17.85, tracking: [0.6, 0.34], color: BURGUNDY_HI, font: SANS });
      brassLine(c, { x: 152, y: 548, w: 360, align: 'left', t, t0: 15.45, t1: 17.85 });
      fx.brackets(c, proj(v, rowR(tl, 'Unmet demand')), env(t, 17.0, 17.95, 0.25, 0.2));
      fx.brackets(c, proj(v, cov), env(t, 18.05, 18.6, 0.25, 0.15), { pad: 8, len: 14 });
      bigNumber(c, t, v, cov, tl.Coverage?.text ?? '56%', 'COVERAGE', 18.45, B.bassIn);
    } });
  // Rakamın İÇİNDEN haritaya: kaynak haritası, komşunun kömürü.
  add({ type: 'seq', name: 'coal_reveal', t0: B.bassIn, t1: B.dropOut, start: 0, rate: 66, in: { type: 'light', dur: 0.2, amount: 0.45 },
    cam: [{ t: B.bassIn, z: 1.06 }, { t: B.rhythm, z: 1.0, ease: outExpo }, { t: B.dropOut, z: 1.03 }],
    grade: { contrast: 1.1, saturate: 0.95 },
    over: (c, t, v) => {
      const fi = clamp(Math.round((t - B.bassIn) * 66), 0, coalTrack.length - 1);
      const tr = coalTrack[fi];
      if (!tr) return;
      const k = env(t, 21.0, B.dropOut - 0.2, 0.5, 0.25);
      let sx = 0, sy = 0;
      for (const [x, y] of tr.hex) { const [px, py] = projXY(v, x, y); sx += px; sy += py; hexRing(c, px, py, tr.z * 20 * v.z, k, t); }
      if (tr.hex.length && k > 0) {
        sx /= tr.hex.length; sy /= tr.hex.length;
        label(c, 'COAL', { x: sx + 70, y: sy - 70, size: 46, t, t0: 21.3, t1: B.dropOut - 0.3, outDur: 0.2, color: '#ecd197' });
        label(c, 'ELDOR', { x: sx + 72, y: sy - 30, size: 22, t, t0: 21.55, t1: B.dropOut - 0.3, outDur: 0.2, color: '#cfc3a8' });
        fx.brassLineXY?.(c, sx, sy, sx + 64, sy - 64, k);
      }
    } });

  // ============================================================ PERDE 3 — KARAR
  // BUILD: yatırım gücü yok — hazine £100 açıkta. Kelime üstü çizilir.
  add({ type: 'still', name: 'construction', t0: B.dropOut, t1: B.acc2, in: { type: 'whip', dur: 0.2, dir: 1 },
    cam: [look(shortBy, 0.42, B.dropOut, outQuart, [-380, 0]), look(shortBy, 0.38, B.acc2, linear, [-380, 0])],
    focus: [{ rect: shortBy, t0: B.dropOut, t1: B.acc2, dim: 0.62, blur: 4, fin: 0.15 }],
    over: (c, t) => decision(c, t, 'BUILD', B.dropOut, B.acc2, true) });
  // TRADE: yurt dışına bağımlılık, tarife maliyeti.
  const abroad = R(why.x, why.y + 18, why.w, why.h);
  add({ type: 'still', name: 'trade_coal', t0: B.acc2, t1: B.acc3, in: { type: 'whip', dur: 0.2, dir: 1 },
    cam: [look(R(abroad.x, why.y - 4, abroad.w, 40), 0.42, B.acc2, outQuart, [-380, 0]), look(R(abroad.x, why.y - 4, abroad.w, 40), 0.38, B.acc3, linear, [-380, 0])],
    focus: [{ rect: R(abroad.x - 4, why.y - 4, abroad.w + 8, 40), t0: B.acc2, t1: B.acc3, dim: 0.62, blur: 4, fin: 0.15 }],
    over: (c, t) => decision(c, t, 'TRADE', B.acc2, B.acc3, true) });
  // TAKE: kamera komşuya kırılır — Eldor üretiyor: Kömür.
  add({ type: 'still', name: 'dossier', t0: B.acc3, t1: B.imp2, in: { type: 'whip', dur: 0.22, dir: -1, dist: 1300 },
    cam: [look(produces, 0.3, B.acc3, outQuart, [-380, 0]), look(produces, 0.3, B.acc4, linear, [-380, 0]), { t: B.acc4 + 0.18, ...frameRect(produces, 0.36, [-380, 0]), ease: outExpo }, look(produces, 0.37, B.imp2, linear, [-380, 0])],
    focus: [{ rect: produces, t0: B.acc3, t1: B.imp2, dim: 0.62, blur: 4, fin: 0.15 }],
    over: (c, t) => decision(c, t, 'TAKE', B.acc3, B.imp2, false) });
  // Güç karşılaştırması: "we are 2.4× their strength".
  add({ type: 'still', name: 'dossier', t0: B.imp2, t1: B.acc5,
    cam: [look(strength, 0.42, B.imp2, outExpo), look(strength, 0.46, B.acc5, linear)],
    focus: [{ rect: strength, t0: B.imp2, t1: B.acc5, dim: 0.8, blur: 4, fin: 0.12 }] });
  // İlan düğmesi. Nefeste hareket DURUR; yalnız düğme ışıkta kalır.
  add({ type: 'still', name: 'dossier_confirm', t0: B.acc5, t1: B.DROP, in: { type: 'dissolve', dur: 0.25 },
    cam: [look(warBtn, 0.36, B.acc5), look(warBtn, 0.5, B.breath, inOutCubic), look(warBtn, 0.5, B.DROP, linear)],
    focus: [{ rect: warBtn, t0: B.acc5, t1: B.DROP, dim: 0.78, blur: 5, fin: 0.3 },
      { rect: warBtn, t0: B.breath, t1: B.DROP, dim: 0.95, blur: 0, fin: 0.6 }],
    grade: { contrast: 1.1, saturate: 0.85 },
    over: (c, t, v) => {
      // Tık: düğmede kısa pirinç ışıma (33.88).
      const k = env(t, 33.86, 33.93, 0.03, 0.1);
      if (k > 0) { const r = proj(v, warBtn); c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = `rgba(236,209,151,${0.35 * k})`; c.fillRect(r.x, r.y, r.w, r.h); c.restore(); }
      fx.black(c, clamp((t - 33.2) / 0.83) * 0.5);
    } });

  // ============================================================ PERDE 4 — SAVAŞ
  add({ type: 'war', t0: B.DROP, t1: P(0), plate: 'war_sweep', plateFrame: 40, draw: (c, t, A, plate) => warCard(c, t, B.DROP, A, plate) });
  const warOver = (seed) => (c, t, v) => {
    fx.smoke(c, t, { alpha: 0.13, speed: 26 });
    fx.embers(c, t, { count: 22, seed, area: [0, H * 0.5, W, H * 0.6], rise: 90, alpha: 0.5 });
  };
  const hitShake = (hits) => (t) => { let s = [0, 0, 0]; for (const h of hits) { const k = shake(t - h, 6, 9); s = [s[0] + k[0], s[1] + k[1], s[2] + k[2]]; } return s; };
  // Cephe kurulur: emir okları (gerçek tümen rotaları).
  add({ type: 'seq', name: 'war_orders', t0: P(0), t1: P(1), start: 0, rate: 60, in: { type: 'whip', dur: 0.2, dir: 1 },
    cam: [{ t: P(0), z: 1.12 }, { t: P(1), z: 1.02, ease: outQuart }], grade: { contrast: 1.12, saturate: 0.9, warm: 0.05 },
    shake: hitShake([P(0, true)]), over: warOver(21) });
  // Kuvvetler ilerler: işgal hafta hafta yayılır, hareket sağa.
  add({ type: 'seq', name: 'war_sweep', t0: P(1), t1: P(2), start: 0, rate: 60,
    cam: [{ t: P(1), z: 1.0 }, { t: P(2), z: 1.04 }], grade: { contrast: 1.12, saturate: 0.9, warm: 0.05 },
    shake: hitShake([P(1, true)]), over: warOver(22) });
  // Çatışma: başkent Jorvale çevresi.
  add({ type: 'seq', name: 'war_close', t0: P(2), t1: P(3), start: 24, rate: 60, in: { type: 'whip', dur: 0.16, dir: 1, dist: 600 },
    cam: [{ t: P(2), z: 1.0 }, { t: P(3), z: 1.06 }], grade: { contrast: 1.14, saturate: 0.88, warm: 0.07 },
    shake: hitShake([P(2), P(2, true)]),
    over: (c, t, v) => { warOver(23)(c, t, v); artillery(c, t, [P(2) + 0.02, P(2, true) + 0.02]); } });
  // Baskı artar: geç haftalar, aynı yön.
  add({ type: 'seq', name: 'war_sweep', t0: P(3), t1: P(4), start: 140, rate: 60, in: { type: 'whip', dur: 0.16, dir: 1, dist: 600 },
    cam: [{ t: P(3), z: 1.06 }, { t: P(4), z: 1.12 }], grade: { contrast: 1.12, saturate: 0.9, warm: 0.05 },
    shake: hitShake([P(3, true)]), over: warOver(24) });

  // ============================================================ PERDE 5 — SONUÇ
  // Eldor barış istiyor; topraklar: Jorvale ★, Dornburg — iki kömür eyaleti.
  const offerR = R(192, 328, 345, 70), acceptR = R(498, 414, 164, 28);
  add({ type: 'still', name: 'peace_offer', t0: P(4), t1: P(5, true), in: { type: 'light', dur: 0.14, amount: 0.3 },
    cam: [look(offerR, 0.62, P(4), outExpo), look(offerR, 0.66, P(5) - 0.05, linear), look(acceptR, 0.3, P(5) + 0.14, outExpo), look(acceptR, 0.32, P(5, true), linear)],
    focus: [{ rect: slide([[P(5) - 0.05, offerR], [P(5) + 0.14, acceptR]]), t0: P(4), t1: P(5, true), dim: 0.6, blur: 3, fin: 0.12 }],
    over: (c, t, v) => {
      // Alt bant: etiket arayüz metninin üstüne binmesin.
      const kb = env(t, P(4) + 0.5, P(5) - 0.1, 0.3, 0.15);
      if (kb > 0) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); const g = c.createLinearGradient(0, H - 260, 0, H); g.addColorStop(0, 'rgba(3,6,10,0)'); g.addColorStop(0.45, `rgba(3,6,10,${0.85 * kb})`); g.addColorStop(1, `rgba(3,6,10,${0.9 * kb})`); c.fillStyle = g; c.fillRect(0, H - 260, W, 260); c.restore(); }
      label(c, 'THREE PROVINCES  ·  ALL THREE COAL', { x: W / 2, y: H - 110, align: 'center', size: 26, t, t0: P(4) + 0.6, t1: P(5) - 0.1, outDur: 0.15, color: '#ecd197' });
      const k = env(t, P(5, true) - 0.1, P(5, true) - 0.04, 0.03, 0.06);
      if (k > 0) { const r = proj(v, acceptR); c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = `rgba(236,209,151,${0.4 * k})`; c.fillRect(r.x, r.y, r.w, r.h); c.restore(); }
    } });
  // İlhak: aynı çekimde harita el değiştirir — tam darbede.
  const flipT = P(6);
  add({ type: 'seq', name: 'annex', t0: P(5, true), t1: P(6, true), start: annexClick - Math.round((flipT - P(5, true)) * 60), rate: 60, in: { type: 'dissolve', dur: 0.2 },
    cam: [{ t: P(5, true), z: 1.0 }, { t: flipT, z: 1.04 }, { t: flipT + 0.15, z: 1.1, ease: outExpo }, { t: P(6, true), z: 1.12 }],
    grade: { contrast: 1.1, saturate: 0.95 },
    shake: (t) => shake(t - flipT, 7, 7),
    over: (c, t) => { fx.ring(c, t, flipT, { x: W / 2 + 30, y: H / 2, max: 1100, dur: 1.2 }); fx.flash(c, env(t, flipT, flipT + 0.02, 0.01, 0.18) * 0.16); } });
  // Kömür artık bizim: aynı kaynak haritası.
  add({ type: 'seq', name: 'coal_after', t0: P(6, true), t1: P(7), start: 0, rate: 60, in: { type: 'whip', dur: 0.16, dir: 1, dist: 600 },
    cam: [{ t: P(6, true), z: 1.08 }, { t: P(7), z: 1.0, ease: outQuart }], grade: { contrast: 1.1, saturate: 0.95 } });
  // Önce/sonra: aynı panel, pirinç çizgi geçerken rakamlar değişir
  // (Şubat 1837 -> Şubat 1838, 16 hafta sonra).
  add({ type: 'still', name: 'trade_coal', t0: P(7), t1: P(7) + 0.5, in: { type: 'light', dur: 0.12, amount: 0.3 },
    cam: [look(dm(tl), 0.72, P(7)), look(dm(tl), 0.74, P(8), linear)],
    focus: [{ rect: dm(tl), t0: P(7), t1: P(8, true), dim: 0.72, blur: 5, fin: 0.1 }],
    over: (c, t) => label(c, 'FEB 1837', { x: 150, y: 860, size: 22, t, t0: P(7) + 0.05, t1: P(7) + 0.5, outDur: 0.15, color: '#cfc3a8' }) });
  add({ type: 'still', name: 'trade_coal_after', t0: P(7) + 0.5, t1: P(8, true), in: { type: 'wipe', dur: 0.8 },
    cam: [look(dm(tla), 0.72, P(7)), look(dm(tla), 0.74, P(8), linear), look(dm(tla), 0.8, P(8, true), outQuart)],
    focus: [{ rect: dm(tla), t0: P(7), t1: P(8, true), dim: 0.72, blur: 5, fin: 0.01 }],
    over: (c, t, v) => {
      for (const [k, d] of [['Produced', 0], ['Imported', 1], ['Unmet demand', 2], ['Coverage', 3]]) underline(c, proj(v, rowR(tla, k)), t, P(7) + 1.35 + d * 0.12);
      label(c, 'FEB 1838', { x: 150, y: 860, size: 22, t, t0: P(7) + 1.0, t1: P(8, true) - 0.15, outDur: 0.15, color: '#ecd197' });
      label(c, `COAL  ${tl.Produced?.text ?? '0.00'}  →  ${tla.Produced?.text ?? ''}`, { x: 150, y: 820, size: 30, t, t0: P(7) + 1.2, t1: P(8, true) - 0.15, outDur: 0.15, color: IVORY });
    } });
  // Sanayi büyür: fabrika, işçi, kâr (aynı ekranın iki tarihi).
  const indStrip = R(198, 307, 653, 74);
  add({ type: 'still', name: 'industry_after', t0: P(8, true), t1: P(9), in: { type: 'whip', dur: 0.16, dir: 1, dist: 700 },
    cam: [look(indStrip, 0.72, P(8, true), outExpo, [0, 150]), look(indStrip, 0.76, P(9), linear, [0, 150])],
    focus: [{ rect: indStrip, t0: P(8, true), t1: P(9), dim: 0.6, blur: 3, fin: 0.12 }],
    over: (c, t) => {
      brassLine(c, { x: W / 2, y: 690, w: 520, t, t0: P(8, true) + 0.1, t1: P(9) - 0.1, outDur: 0.12 });
      label(c, 'FACTORIES  7  →  9', { x: W / 2, y: 750, align: 'center', size: 34, t, t0: P(8, true) + 0.15, t1: P(9) - 0.1, outDur: 0.12 });
      label(c, 'WORKERS  120K  →  192K', { x: W / 2, y: 800, align: 'center', size: 34, t, t0: P(8, true) + 0.3, t1: P(9) - 0.1, outDur: 0.12 });
    } });

  // ============================================================ PERDE 6 — KREŞENDO
  // Her darbe bir kesme; uzun/kısa çekimler çift darbe desenini izler.
  const reaction = R(800, 12, 280, 160);
  const CR = [
    // DÜNYA TEPKİ VERİR: ilhakın bedeli — kötü şöhret 28.6, iki yeni savaş.
    { name: 'technology_after', type: 'still', a: P(9), b: P(10), in: { type: 'wipe', dur: 0.3 },
      cam: (a, b) => [look(reaction, 0.5, a, outExpo, [0, 170]), { t: P(9, true), ...frameRect(reaction, 0.5, [0, 170]) }, { t: P(9, true) + 0.2, ...frameRect(reaction, 0.56, [0, 170]), ease: outExpo }, look(reaction, 0.58, b, linear, [0, 170])],
      focus: [{ rect: reaction, t0: P(9), t1: P(10), dim: 0.62, blur: 3, fin: 0.1 }],
      text: ['THE WORLD REACTS.', P(9) + 0.1, P(10) - 0.2, H - 170] },
    { name: 'coast_fast', type: 'seq', a: P(10), b: P(10, true), start: 10, in: { type: 'whip', dur: 0.12, dir: 1, dist: 700 } },
    // SEN DE: emirler (oyuncunun tümen rotaları).
    { name: 'war_orders', type: 'seq', a: P(10, true), b: P(11), start: 66, in: { type: 'cut' },
      text: ['SO DO YOU.', P(10, true) + 0.12, P(11) - 0.2] },
    { name: 'technology_after', type: 'still', a: P(11), b: P(11, true), cam: (a, b) => [{ t: a, cx: 420, cy: 400, z: 2.4 }, { t: b, cx: 450, cy: 400, z: 2.6, ease: linear }] },
    { name: 'industry_after', type: 'still', a: P(11, true), b: P(12), in: { type: 'whip', dur: 0.14, dir: -1, dist: 700 },
      cam: (a, b) => [{ t: a, cx: 760, cy: 540, z: 1.6 }, { t: b, cx: 860, cy: 560, z: 1.9, ease: linear }] },
    { name: 'politics', type: 'still', a: P(12), b: P(12, true), cam: (a, b) => [{ t: a, cx: 1000, cy: 430, z: 2.0 }, { t: b, cx: 980, cy: 430, z: 2.2, ease: linear }] },
    { name: 'population_after', type: 'still', a: P(12, true), b: P(13), in: { type: 'cut' },
      cam: (a, b) => [{ t: a, cx: 1080, cy: 300, z: 2.2 }, { t: b, cx: 1140, cy: 300, z: 2.5, ease: linear }] },
    { name: 'annex', type: 'seq', a: P(13), b: P(13, true), start: 260 },
    { name: 'coal_after', type: 'seq', a: P(13, true), b: 62.52, start: 200 },
    { name: 'flag', type: 'flag', a: 62.52, b: 63.02 },
    { name: 'war_close', type: 'seq', a: 63.02, b: B.final, start: 130 },
  ];
  for (const s of CR) {
    const clip = { type: s.type, name: s.name, t0: s.a, t1: s.b, rate: 60, start: s.start ?? 0, in: s.in ?? { type: 'cut' },
      cam: s.cam ? s.cam(s.a, s.b) : [{ t: s.a, z: 1.1 }, { t: s.b, z: 1.0, ease: outQuart }],
      focus: s.focus, grade: { contrast: 1.12, saturate: 0.92 } };
    if (s.type === 'flag') Object.assign(clip, { type: 'war', draw: (c, t, A) => flagShot(c, t, s.a, A) });
    if (s.text) clip.over = (c, t) => sentence(c, t, s.text[0], s.text[1], s.text[2], s.text[3]);
    add(clip);
  }
  // SON DARBE -> bırakış: dünya geri çekilir, arayüz yok.
  add({ type: 'seq', name: 'final_world', t0: B.final, t1: DURATION, start: 0, rate: 72, in: { type: 'light', dur: 0.2, amount: 0.22 },
    hold: [69.5],
    cam: [{ t: B.final, z: 1.12 }, { t: B.release + 0.3, z: 1.0, ease: outExpo }],
    grade: { contrast: 1.06, saturate: 0.8, brightness: 0.9, tint: 'rgba(10,22,40,0.3)' },
    over: (c, t, v, A) => {
      fx.black(c, clamp((t - 65.2) / 1.6) * 0.62);
      logoCard(c, t, 65.6, A);
      fx.lightSweep(c, clamp((t - 67.4) / 1.6), { alpha: 0.14 });
      fx.dust(c, t, { count: 26, alpha: 0.2 });
    } });

  // ============================================================ küresel kaplamalar
  const globals = [
    // 1836 — kırılmanın ped kabarışında; sınırlardan önce söner.
    { t0: 6.0, t1: 11.0, draw: (c, t) => {
      // Yazının arkasında yerel, yumuşak karartma: parlak karada okunurluk.
      const k = env(t, B.rise - 0.2, B.tension + 0.9, 0.8, 0.6);
      if (k > 0) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 520); g.addColorStop(0, `rgba(4,8,14,${0.55 * k})`); g.addColorStop(1, 'rgba(4,8,14,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore(); }
      title(c, '1836', { x: W / 2, y: H / 2 + 40, size: 150, font: '"Times New Roman", serif', t, t0: B.rise - 0.15, dur: 1.0, t1: B.tension + 0.9, outDur: 0.6, tracking: [0.7, 0.32], color: 'brass', sweep: clamp((t - 7.6) / 1.4), out: 'fade' });
      brassLine(c, { x: W / 2, y: H / 2 + 86, w: 420, t, t0: B.rise + 0.2, dur: 1.0, t1: B.tension + 0.8, outDur: 0.6 });
    } },
    // Son darbe: kısa beyaz-sıcak flaş + kıvılcım.
    { t0: B.final - 0.05, t1: B.final + 1.2, draw: (c, t) => { fx.flash(c, env(t, B.final, B.final + 0.03, 0.01, 0.25) * 0.14); fx.sparks(c, t, B.final, { count: 70, speed: 900, seed: 41 }); } },
  ];

  return {
    clips, globals,
    vignette: (t) => (t < 4 ? 0.62 : t > 64 ? 0.66 : 0.44),
    fade: (t) => (t < 1.6 ? 1 - outQuart(clamp(t / 1.6)) * 1 : t > 70.6 ? clamp((t - 70.6) / 0.9) : 0),
  };
}

// ---------------------------------------------------------------- yardımcılar
export function proj(v, r) {
  return { x: W / 2 + (r.x - v.cx) * v.z, y: H / 2 + (r.y - v.cy) * v.z, w: r.w * v.z, h: r.h * v.z };
}
function projXY(v, x, y) { return [W / 2 + (x - v.cx) * v.z, H / 2 + (y - v.cy) * v.z]; }

function hexRing(c, x, y, r, k, t) {
  if (k <= 0) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  const pulse = 0.75 + 0.25 * Math.sin(t * 6 + x * 0.01);
  c.strokeStyle = `rgba(236,209,151,${0.85 * k * pulse})`; c.lineWidth = 2;
  c.shadowColor = 'rgba(236,190,110,0.9)'; c.shadowBlur = 14;
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const px = x + Math.cos(a) * r * 0.92, py = y + Math.sin(a) * r * 0.92; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath(); c.stroke();
  c.globalCompositeOperation = 'screen'; c.fillStyle = `rgba(236,180,90,${0.12 * k})`; c.fill();
  c.restore();
}

// BUILD / TRADE / TAKE: büyük sözcük solda; ilk ikisi pirinç çizgiyle
// üstü çizilir (seçenek kapalı), TAKE bordo-pirinç kalır.
function decision(c, t, word, a, b, strike) {
  title(c, word, { x: 140, y: 600, size: 132, align: 'left', t, t0: a + 0.02, dur: 0.35, t1: b - 0.12, outDur: 0.12, tracking: [0.35, 0.16], color: strike ? IVORY : 'brass', sweep: strike ? -1 : clamp((t - a - 0.2) / 0.8), from: 'left' });
  if (strike) {
    const k = clamp((t - (a + (b - a) * 0.55)) / 0.18);
    if (k > 0 && t < b) {
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      c.font = `132px ${SERIF}`; c.letterSpacing = `${0.16 * 132}px`;
      const w = c.measureText(word).width;
      c.fillStyle = BURGUNDY_HI; c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10;
      c.fillRect(132, 552, (w + 12) * outQuart(k), 6);
      c.restore();
    }
  }
}

// Arayüzdeki gerçek değer, kendi yerinden büyüyerek ekranı alır; sonra
// kamera onun içinden geçer. Değer meta.json'dan (oyunun gösterdiği metin).
function bigNumber(c, t, v, r, text, cap, a, b) {
  if (t < a || t > b + 0.05) return;
  const k = outExpo(clamp((t - a) / 0.55));
  const through = inCubic(clamp((t - (b - 0.28)) / 0.28));
  const [sx, sy] = [W / 2 + (r.x + r.w / 2 - v.cx) * v.z, H / 2 + (r.y + r.h / 2 - v.cy) * v.z];
  const x = sx + (W * 0.5 - sx) * k, y = sy + (H * 0.52 - sy) * k;
  const size = (r.h * v.z) + (230 - r.h * v.z) * k;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1 - through;
  c.translate(x, y); c.scale(1 + through * 2.2, 1 + through * 2.2);
  c.font = `${size}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.letterSpacing = `${size * 0.04}px`;
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 30;
  const g = c.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, '#e2737b'); g.addColorStop(1, '#9b2a36');
  c.fillStyle = g; c.fillText(text, 0, 0);
  c.restore();
  label(c, cap, { x: x, y: y + size * 0.62 + 10, align: 'center', size: 24, t, t0: a + 0.2, t1: b - 0.3, outDur: 0.2, color: '#d9cdb4' });
}

function sentence(c, t, text, a, b, y = H / 2 + 30) {
  title(c, text, { x: W / 2, y, size: 84, t, t0: a, dur: 0.45, t1: b, outDur: 0.18, tracking: [0.5, 0.2], from: 'below' });
}

function artillery(c, t, hits) {
  for (const [i, h] of hits.entries()) {
    const dt = t - h;
    if (dt < 0 || dt > 0.5) continue;
    const x = W * (0.35 + 0.3 * i), y = H * (0.45 + 0.1 * i);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'screen';
    const g = c.createRadialGradient(x, y, 0, x, y, 260);
    const a = Math.exp(-dt * 10) * 0.55;
    g.addColorStop(0, `rgba(255,220,170,${a})`); g.addColorStop(0.3, `rgba(255,120,50,${a * 0.5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - 260, y - 260, 520, 520); c.restore();
    fx.sparks(c, t, h, { x, y, count: 30, speed: 500, life: 0.5, seed: 50 + i });
  }
}

function flagShot(c, t, a, A) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#07090c'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, 'rgba(40,46,60,1)'); g.addColorStop(1, 'rgba(5,7,10,1)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const s = 1.15 + (t - a) * 0.1;
  if (A.flagMe) wavingFlag(c, A.flagMe, W / 2 - 420 * s, H / 2 - 280 * s, 840 * s, 560 * s, t, { cloth: A.cloth, amp: 0.08 });
  fx.embers(c, t, { count: 30, seed: 9, area: [0, H * 0.4, W, H * 0.7], rise: 120, alpha: 0.6 });
}
