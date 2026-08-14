// Fiziksel dünya coğrafyası: kıta iskeleti → deformasyon → kıyı → temizlik.
//
// TASARIM KURALI: gürültü kıtayı TANIMLAMAZ, kıtayı BOZAR. Silüet elle çizilmiş
// bir omurgadan (spine) ve omurga boyunca değişen kalınlıktan çıkar; gürültü
// yalnız örnekleme noktasını büker (domain warp) ve kıyıya mikro pürüz ekler.
// Eşiklenmiş fBm ile kıta üretmek yuvarlak patates verir — bkz. docs/cografya.md.
//
// Boru hattı:
//   şablon (rol atanmış omurgalar)
//     → tohum başına döndürme/jitter/aynalama
//     → alan: kara omurgaları ∪ , deniz oymaları −
//     → domain warp (makro + mezo): körfez, burun, yarımada
//     → kıyıya sınırlı mikro gürültü
//     → yarıçap ölçeği kalibrasyonu (kara oranı hedefe kilitlenir)
//     → temizlik (diken, çentik, mikro ada, anlamsız delik)
//     → ölçüm + kabul/ret; en iyi aday saklanır
//
// Katman notu: saf matematik/veri; DOM'suz, game'siz. Node'da test edilir.

import { makeRng } from '../core/rng.js';
import { makeNoise2D, fbm } from '../core/noise.js';
import { SQRT3 } from '../core/hex.js';
import {
  ODD_R, analyzeGeography, inlandSeaScore, rejectReasons, scoreGeography, seamDeviation,
} from './geoscore.js';

/** Dairesel boylam farkı: en kısa yay, [-0.5, 0.5]. */
export function wrapDelta(du) {
  return du - Math.round(du);
}

// --- Tasarım uzayı --------------------------------------------------------
// Şablon (u, v) ile yazılır: u boylam kesri (sarmalı), v enlem kesri (0 kuzey).
// Yarıçaplar dünya YÜKSEKLİĞİ birimindedir; alan hesabı x = u·tx ile yapılır
// (tx = ızgaranın gerçek en/boy oranı). Böylece "yarıçap 0.05" iki eksende de
// aynı sayıda hex eder — aksi halde her şey yatay ezilir. Şablon 5:3 oranına
// (160x96) göre çizildi.

/**
 * Küresel kalınlık katsayısı: şablon yarıçapları buradan topluca ölçeklenir.
 * Amaç kalibrasyon ölçeğini 1.0 civarında tutmak — çalışma anındaki düzeltme
 * ne kadar küçükse kıtalar arası boşluklar o kadar tasarlandığı gibi kalır.
 */
const TEMPLATE_BULK = 1.20;

/**
 * ŞABLON. Her düğüm [u, v, yarıçap]; ardışık düğümler kapsül (capsule) bir
 * kemik kurar. Dal zincirleri ilk düğümü ana gövdenin İÇİNDE seçer — böylece
 * yarımada gövdeye yapışır ama kendi kalınlık profilini taşır.
 *
 * Roller bölge (zone) kimliğiyle taşınır; siyaset katmanı bu kimlikleri arar
 * (bkz. macro.js ZONE_RULES / archetypePlan). Coğrafya değişir, roller kalır.
 */
const TEMPLATE = {
  bodies: [
    {
      id: 'eski-dunya', bulk: 0.96, // Avrupa+Asya işlevli süper kıta: uzun doğu-batı ekseni
      chains: [
        {
          nodes: [
            [0.058, 0.344, 0.046, 'yogun-bati'],
            [0.096, 0.280, 0.064, 'yogun-bati'],
            [0.136, 0.234, 0.055, 'yogun-bati'],
            [0.176, 0.208, 0.034, 'kuzey-bozkiri', true], // geçit: dar kara köprüsü
            [0.230, 0.182, 0.108, 'kuzey-bozkiri'],
            [0.302, 0.170, 0.126, 'kuzey-bozkiri'],
            [0.380, 0.186, 0.118, 'kuzey-bozkiri'],
            [0.446, 0.226, 0.114, 'dogu-ovasi'],
            [0.492, 0.314, 0.112, 'dogu-ovasi'],
            [0.504, 0.402, 0.092, 'dogu-ovasi'],
            [0.490, 0.464, 0.040, 'dogu-ovasi'], // güneydoğu burnu
          ],
        },
        { // kavşak kolu: iç denizin kuzey-doğu duvarı
          nodes: [
            [0.144, 0.274, 0.045, 'yogun-bati'],
            [0.174, 0.336, 0.052, 'kavsak'],
            [0.214, 0.388, 0.048, 'kavsak'],
            [0.254, 0.416, 0.032, 'kavsak'],
          ],
        },
        { // güney yarımadası: dar boyun, geniş gövde, sivri uç
          nodes: [
            [0.404, 0.286, 0.048, 'guney-yarimada'],
            [0.392, 0.350, 0.046, 'guney-yarimada'],
            [0.384, 0.422, 0.092, 'guney-yarimada'],
            [0.374, 0.498, 0.074, 'guney-yarimada'],
            [0.362, 0.568, 0.028, 'guney-yarimada'],
          ],
        },
        { // kuzey kutup yarımadaları: kuzey kıyısı düz kalmasın
          nodes: [
            [0.266, 0.116, 0.036, 'kuzey-bozkiri'],
            [0.254, 0.078, 0.018, 'kuzey-bozkiri'],
          ],
        },
        {
          chance: 0.6,
          nodes: [
            [0.370, 0.118, 0.034, 'kuzey-bozkiri'],
            [0.382, 0.080, 0.016, 'kuzey-bozkiri'],
          ],
        },
        { // batının iki güney yarımadası: iç denizin kuzey kıyı dokusu
          nodes: [
            [0.074, 0.360, 0.036, 'yogun-bati'],
            [0.084, 0.418, 0.024, 'yogun-bati'],
          ],
        },
        {
          chance: 0.7,
          nodes: [
            [0.112, 0.328, 0.032, 'yogun-bati'],
            [0.124, 0.380, 0.022, 'yogun-bati'],
          ],
        },
      ],
    },
    {
      id: 'bati-takimadalari', follow: 'eski-dunya', // Britanya işlevli ada devleti: kanal onu ayırır
      chains: [
        { nodes: [[0.026, 0.252, 0.046, 'yogun-bati'], [0.016, 0.208, 0.034, 'yogun-bati']] },
        { chance: 0.6, nodes: [[0.010, 0.298, 0.020, 'yogun-bati']] },
      ],
    },
    {
      id: 'dogu-adalari', follow: 'eski-dunya', // Japonya işlevli ada modernleşicisi
      chains: [
        {
          nodes: [
            [0.594, 0.254, 0.030, 'dogu-adalari'],
            [0.608, 0.312, 0.036, 'dogu-adalari'],
            [0.600, 0.370, 0.024, 'dogu-adalari'],
          ],
        },
      ],
    },
    {
      id: 'guney-kita', bulk: 1.10, shift: 0.45, // Afrika işlevli güney kıtası: geniş iç, az yarımada
      mirror: true,
      chains: [
        { // kuzey kuşağı: iç denizin güney duvarı, uzun düz kıyı bandı
          nodes: [
            [0.052, 0.500, 0.042, 'guney-kita'],
            [0.092, 0.546, 0.046, 'guney-kita'],
            [0.136, 0.578, 0.062, 'guney-kita'],
            [0.192, 0.566, 0.082, 'guney-kita'],
            [0.242, 0.588, 0.080, 'guney-kita'],
            [0.284, 0.634, 0.052, 'guney-kita'],
          ],
        },
        { // güney kolu: iç plato, güney burnu
          nodes: [
            [0.274, 0.646, 0.098, 'guney-kita'],
            [0.264, 0.734, 0.098, 'guney-kita'],
            [0.252, 0.818, 0.070, 'guney-kita'],
            [0.238, 0.870, 0.032, 'guney-kita'],
          ],
        },
        { // batı çıkıntısı: büyük batı körfezini o kurar
          nodes: [
            [0.162, 0.626, 0.062, 'guney-kita'],
            [0.140, 0.688, 0.042, 'guney-kita'],
          ],
        },
      ],
    },
    {
      id: 'guney-adasi', follow: 'guney-kita', // kıta sahanlığı adası (Madagaskar işlevi)
      chains: [
        { nodes: [[0.352, 0.752, 0.028, 'guney-kita'], [0.360, 0.796, 0.020, 'guney-kita']] },
      ],
    },
    {
      // Yeni Dünya TEK gövdedir: kuzey ve güney ayrı gövde olsaydı gövde
      // başına dönüş/kayma bağımsız olur ve kıstak ikisini birbirine hiç
      // değdiremezdi (ölçüldü: iki ayrı kütle). Kıstak sistemin içindedir.
      id: 'yeni-dunya', bulk: 0.78, mirror: true,
      chains: [
        { // kuzey kıtası: geniş iç, uzun kıyı
          nodes: [
            [0.715, 0.156, 0.056, 'yeni-kuzey'],
            [0.767, 0.188, 0.096, 'yeni-kuzey'],
            [0.827, 0.220, 0.106, 'yeni-kuzey'],
            [0.863, 0.280, 0.098, 'yeni-kuzey'],
            [0.851, 0.352, 0.082, 'yeni-kuzey'],
            [0.812, 0.402, 0.054, 'yeni-kuzey'],
          ],
        },
        { // batı kolu: kordilyer kıyısı ve güneybatı burnu
          nodes: [
            [0.757, 0.252, 0.084, 'yeni-kuzey'],
            [0.731, 0.326, 0.066, 'yeni-kuzey'],
            [0.719, 0.392, 0.040, 'yeni-kuzey'],
          ],
        },
        { // kuzey yarımadası
          chance: 0.75,
          nodes: [
            [0.801, 0.128, 0.036, 'yeni-kuzey'],
            [0.811, 0.086, 0.018, 'yeni-kuzey'],
          ],
        },
        { // kıstak + güney kıtası: ince köprü stratejik kapıdır (bridge düğümleri)
          bulk: 1.15,
          nodes: [
            [0.739, 0.430, 0.028, 'kistak', true],
            [0.765, 0.482, 0.022, 'kistak', true],
            [0.791, 0.524, 0.026, 'kistak', true],
            [0.819, 0.572, 0.068, 'yeni-guney'],
            [0.841, 0.646, 0.086, 'yeni-guney'],
            [0.835, 0.726, 0.066, 'yeni-guney'],
            [0.819, 0.798, 0.042, 'yeni-guney'],
            [0.805, 0.848, 0.022, 'yeni-guney'],
          ],
        },
        { // doğu şişkinliği
          bulk: 1.15,
          nodes: [
            [0.887, 0.622, 0.062, 'yeni-guney'],
            [0.895, 0.686, 0.044, 'yeni-guney'],
          ],
        },
      ],
    },
  ],

  /** Deniz oymaları: karadan ÇIKARILIR. Kapalı havzalar ve kesin körfezler. */
  seas: [
    { // iç deniz: batıda geniş havza, doğuya doğru daralan iki ağızlı deniz
      zone: 'ic-deniz',
      nodes: [
        [0.014, 0.436, 0.022],
        [0.064, 0.452, 0.028],
        [0.128, 0.470, 0.052],
        [0.186, 0.462, 0.050],
        [0.240, 0.452, 0.036],
        [0.286, 0.462, 0.024],
      ],
    },
    { // sıcak körfez: bozkırın altını oyan derin girinti
      zone: 'sicak-korfez',
      nodes: [
        [0.320, 0.330, 0.040],
        [0.312, 0.272, 0.026],
        [0.306, 0.238, 0.018],
      ],
    },
  ],

  /** Körfezler: siluete girinti verir; deniz gibi oyar ama çapa üretmez. */
  bays: [
    // Yeni Dünya kuzeyinin iki büyük körfezi: kuzeyden ve güneyden ısırır
    { nodes: [[0.795, 0.188, 0.038], [0.802, 0.146, 0.024]] },
    { nodes: [[0.828, 0.396, 0.040], [0.836, 0.352, 0.024]] },
    // Afrika'nın büyük batı körfezi
    { nodes: [[0.212, 0.702, 0.042], [0.202, 0.652, 0.028]] },
    // Bozkırın kuzey kıyısını kıran iç körfez
    { nodes: [[0.286, 0.104, 0.034], [0.296, 0.148, 0.022]] },
  ],

  /**
   * Boğazlar: iki su kütlesini birleştiren dar kanallar. Gürültü kapatmasın
   * diye ayrıca oyulur; uçları sivrildiği için cetvelle çizilmiş görünmez.
   */
  straits: [
    { name: 'bati-kanali', body: 'eski-dunya', nodes: [[0.056, 0.272, 0.014], [0.032, 0.312, 0.012]] },
    { name: 'dogu-bogazi', body: 'eski-dunya', nodes: [[0.576, 0.240, 0.015], [0.581, 0.312, 0.016], [0.576, 0.380, 0.013]] },
    { name: 'kavsak-bogazi', nodes: [[0.284, 0.460, 0.020], [0.310, 0.500, 0.019], [0.332, 0.548, 0.018], [0.352, 0.604, 0.020], [0.372, 0.660, 0.022]] },
  ],

  /** Sıradağ şeritleri: YALNIZ yükseklik alanını besler, kara maskesini değil. */
  ridges: [
    { body: 'eski-dunya', h: 1.20, width: 0.016, nodes: [[0.390, 0.300], [0.424, 0.284], [0.452, 0.266]] },
    { body: 'eski-dunya', h: 0.62, width: 0.011, nodes: [[0.174, 0.172], [0.188, 0.238]] },
    { body: 'eski-dunya', h: 0.55, width: 0.011, nodes: [[0.412, 0.182], [0.434, 0.254]] },
    { body: 'yeni-guney', h: 1.00, width: 0.013, nodes: [[0.803, 0.556], [0.799, 0.650], [0.791, 0.750], [0.785, 0.826]] },
    { body: 'yeni-kuzey', h: 0.85, width: 0.015, nodes: [[0.729, 0.192], [0.719, 0.292], [0.713, 0.372]] },
    { body: 'guney-kita', h: 0.58, width: 0.014, nodes: [[0.290, 0.632], [0.278, 0.734], [0.268, 0.812]] },
  ],

  /**
   * Ada sahaları: her biri okyanus olduğu bilinen bir yol. Adalar burada doğar
   * — kıyıya serpilen gürültü konfetisi değil, sayısı ve boyu sınırlı kasıtlı
   * takımadalar.
   */
  islandFields: [
    { // baharat zinciri: Eski Dünya güneydoğusu ↔ kıstak arası basamaklar
      zone: 'baharat-adalari', count: [5, 7], radius: [0.019, 0.032],
      path: [[0.556, 0.492], [0.610, 0.530], [0.664, 0.560], [0.710, 0.596]], jitter: 0.022,
    },
    { // volkanik yay: dikişi geçer, "harita kenarı" hissini siler
      zone: 'acik-deniz', count: [5, 7], radius: [0.016, 0.028],
      path: [[0.930, 0.740], [0.976, 0.790], [0.030, 0.812], [0.084, 0.766]], jitter: 0.020,
    },
    { // korsan adaları: kıstağın doğusunda kapalı deniz kümesi
      zone: 'korsan-adalari', count: [3, 5], radius: [0.016, 0.026],
      path: [[0.848, 0.492], [0.884, 0.474], [0.918, 0.496]], jitter: 0.014,
    },
    { // ayrım okyanusunun ortasında yalnız üsler
      zone: 'acik-deniz', count: [2, 3], radius: [0.018, 0.028],
      path: [[0.640, 0.200], [0.664, 0.140]], jitter: 0.028,
    },
    { // güney okyanusu: uzun deniz yolunun tek durağı
      zone: 'acik-deniz', count: [2, 4], radius: [0.017, 0.026],
      path: [[0.480, 0.760], [0.545, 0.822], [0.615, 0.782]], jitter: 0.026,
    },
    { // doğu ovası açıklarında sahanlık adaları
      zone: 'dogu-adalari', count: [1, 2], radius: [0.016, 0.024],
      path: [[0.532, 0.436], [0.514, 0.484]], jitter: 0.016,
    },
  ],
};

/**
 * Şablon düğümünü tasarım uzayına taşır (u sarmalı korunur).
 * Beşinci alan `bridge`: kasıtlı kara köprüsü — gürültü onu koparamaz.
 */
function nodeToDesign(node, tx) {
  return { x: node[0] * tx, y: node[1], r: node[2] ?? 0, zone: node[3], bridge: node[4] === true };
}

/**
 * Gövde dönüşümü: kaydırma + ölçek + döndürme + (istenirse) aynalama.
 * `bulk` alan bütçesi kolu: gövdenin kalınlığını topluca oynatır, biçimini
 * değiştirmez. Kıtalar arası pay dağılımı buradan ayarlanır.
 */
function makeTransform(body, rng, tx) {
  // Merkez: gövdenin tüm düğümlerinin ortalaması (sarmal dert değil, gövdeler
  // dikişe oturacak kadar geniş değil — dikişi ada zinciri geçer).
  let sx = 0; let sy = 0; let n = 0;
  for (const chain of body.chains) {
    for (const node of chain.nodes) { sx += node[0] * tx; sy += node[1]; n++; }
  }
  const cx = sx / n; const cy = sy / n;
  // Uydu gövdeler (ada devletleri) `drift: 0` alır: kanal oymaları şablonda
  // sabit, gövde kayarsa boğaz ıskalar ve ada anakaraya yapışır.
  const drift = body.drift ?? 1;
  const angle = rng.range(-0.17, 0.17) * drift;  // ~±10°: iskelet tanınır kalsın
  const scale = rng.range(0.90, 1.10);
  const mirror = body.mirror && rng.chance(0.5) ? -1 : 1;
  const shift = (body.shift ?? 1) * drift;
  const du = rng.range(-0.030, 0.030) * tx * shift;
  const dv = rng.range(-0.024, 0.024) * shift;
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  return (x, y) => {
    const px = (x - cx) * mirror * scale;
    const py = (y - cy) * scale;
    return {
      x: cx + du + px * cos - py * sin,
      y: cy + dv + px * sin + py * cos,
    };
  };
}

/** Şablonu tohuma göre kişiselleştirir: döndürme, jitter, aynalama. */
function instantiate(rng, tx, fixedRotate) {
  // Küresel boylam döndürmesi: dikiş her dünyada başka bir okyanusa düşer.
  const rotate = (fixedRotate ?? rng.range(0, 1)) * tx;
  const bones = [];      // kara kemikleri
  const carves = [];     // deniz/boğaz oymaları
  const ridges = [];
  const anchors = {};
  const transforms = new Map();

  const push = (list, a, b, zone, flags) => {
    list.push({
      ax: a.x, ay: a.y, bx: b.x, by: b.y, ra: a.r, rb: b.r, zone,
      bridge: flags?.bridge === true || a.bridge === true || b.bridge === true,
      islandOnly: ISLAND_ONLY_ZONES.has(zone),
      ymin: Math.min(a.y, b.y) - Math.max(a.r, b.r),
      ymax: Math.max(a.y, b.y) + Math.max(a.r, b.r),
    });
  };

  for (const body of TEMPLATE.bodies) {
    // `follow`: uydu gövde anakaranın dönüşümünü AYNEN paylaşır. Kendi
    // dönüşümü olsaydı anakara kayarken ada yerinde kalır ve aradaki kanal
    // ya kapanır ya da anakaranın içine düşerdi (ölçüldü: doğu adaları 20
    // tohumun 14'ünde anakaraya kaynıyordu).
    const tf = body.follow ? transforms.get(body.follow) : makeTransform(body, rng, tx);
    transforms.set(body.id, tf);
    // Gövde başına kalınlık sapması: kıtaların BİRBİRİNE göre payı her tohumda
    // biraz oynar (düğüm başına jitter ortalamada birbirini götürür, bu gitmez).
    const bodyBulk = (body.bulk ?? 1) * rng.range(0.92, 1.08);
    for (const chain of body.chains) {
      // İsteğe bağlı halka: bazı yarımadalar/adacıklar her dünyada doğmaz.
      if (chain.chance != null && !rng.chance(chain.chance)) continue;
      const pts = chain.nodes.map((node) => {
        const d = nodeToDesign(node, tx);
        const p = tf(d.x, d.y);
        // Düğüm başına küçük jitter: aynı iskelet, farklı kıyı temposu.
        return {
          x: p.x + rng.range(-0.008, 0.008) * tx,
          y: p.y + rng.range(-0.007, 0.007),
          r: d.r * (chain.bulk ?? 1) * bodyBulk * TEMPLATE_BULK * rng.range(0.9, 1.1),
          zone: d.zone,
          bridge: d.bridge,
        };
      });
      if (pts.length === 1) push(bones, pts[0], pts[0], pts[0].zone, chain);
      for (let i = 0; i < pts.length - 1; i++) {
        push(bones, pts[i], pts[i + 1], pts[i].zone, chain);
      }
    }
  }

  for (const sea of TEMPLATE.seas) {
    const pts = sea.nodes.map((node) => {
      const d = nodeToDesign(node, tx);
      return { x: d.x + rng.range(-0.01, 0.01) * tx, y: d.y + rng.range(-0.008, 0.008), r: d.r * TEMPLATE_BULK * rng.range(0.92, 1.08) };
    });
    for (let i = 0; i < pts.length - 1; i++) push(carves, pts[i], pts[i + 1], sea.zone);
    const mid = pts[Math.floor(pts.length / 2)];
    anchors[sea.zone] = { u: ((mid.x + rotate) / tx) % 1, v: mid.y };
  }

  for (const bay of TEMPLATE.bays) {
    const pts = bay.nodes.map((node) => {
      const d = nodeToDesign(node, tx);
      return {
        x: d.x + rng.range(-0.012, 0.012) * tx,
        y: d.y + rng.range(-0.010, 0.010),
        r: d.r * TEMPLATE_BULK * rng.range(0.85, 1.15),
      };
    });
    for (let i = 0; i < pts.length - 1; i++) push(carves, pts[i], pts[i + 1], 'korfez');
  }

  for (const strait of TEMPLATE.straits) {
    // Kanal, ayırdığı gövdeyle birlikte taşınır: yoksa kıta kayınca kanal
    // boğazdan çıkıp anakaranın ortasını yarıyor.
    const tf = strait.body ? transforms.get(strait.body) : ((x, y) => ({ x, y }));
    const pts = strait.nodes.map((node) => {
      const d = nodeToDesign(node, tx);
      const p = tf(d.x, d.y);
      return { x: p.x + rng.range(-0.006, 0.006) * tx, y: p.y + rng.range(-0.006, 0.006), r: d.r * TEMPLATE_BULK * rng.range(0.9, 1.1) };
    });
    for (let i = 0; i < pts.length - 1; i++) push(carves, pts[i], pts[i + 1], strait.name);
  }

  for (const ridge of TEMPLATE.ridges) {
    const tf = transforms.get(ridge.body) ?? ((x, y) => ({ x, y }));
    const pts = ridge.nodes.map((node) => tf(node[0] * tx, node[1]));
    for (let i = 0; i < pts.length - 1; i++) {
      ridges.push({
        ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y,
        width: ridge.width, h: ridge.h,
        ymin: Math.min(pts[i].y, pts[i + 1].y) - ridge.width * 4,
        ymax: Math.max(pts[i].y, pts[i + 1].y) + ridge.width * 4,
      });
    }
  }

  // Adalar: saha yolunun üzerinde, sayısı ve boyu sınırlı.
  for (const field of TEMPLATE.islandFields) {
    const count = rng.int(field.count[0], field.count[1]);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const p = alongPath(field.path, t, tx);
      const node = {
        x: p.x + rng.range(-field.jitter, field.jitter) * tx,
        y: p.y + rng.range(-field.jitter, field.jitter),
        r: rng.range(field.radius[0], field.radius[1]) * TEMPLATE_BULK,
        zone: field.zone,
      };
      // Zincir adaları: bazıları iki düğümlü olsun, hepsi nokta olmasın.
      if (rng.chance(0.35)) {
        const tail = {
          x: node.x + rng.range(-0.018, 0.018) * tx,
          y: node.y + rng.range(0.012, 0.030) * (rng.chance(0.5) ? 1 : -1),
          r: node.r * rng.range(0.6, 0.9),
          zone: field.zone,
        };
        push(bones, node, tail, field.zone);
      } else {
        push(bones, node, node, field.zone);
      }
    }
  }

  // Boylam döndürmesi en sonda: şablon okunur kalsın, dünya kaysın.
  const slide = (o) => { o.ax += rotate; o.bx += rotate; };
  bones.forEach(slide);
  carves.forEach(slide);
  ridges.forEach(slide);

  return { bones, carves, ridges, anchors, rotate };
}

/** Yol üzerinde t∈[0,1] noktası (parça uzunlukları eşit varsayılır). */
function alongPath(path, t, tx) {
  const seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
  const local = t * (path.length - 1) - seg;
  const a = path[seg]; const b = path[seg + 1];
  // Yol dikişi geçebilir: en kısa yay üzerinden ilerlenir.
  const du = wrapDelta(b[0] - a[0]);
  return { x: (a[0] + du * local) * tx, y: a[1] + (b[1] - a[1]) * local };
}

/** Nokta–parça mesafesi ve yarıçap enterpolasyonu (x sarmalı). */
function boneField(bone, x, y, tx) {
  let dx = x - bone.ax;
  dx -= Math.round(dx / tx) * tx;
  const sx = bone.bx - bone.ax - Math.round((bone.bx - bone.ax) / tx) * tx;
  const sy = bone.by - bone.ay;
  const dy = y - bone.ay;
  const len2 = sx * sx + sy * sy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (dx * sx + dy * sy) / len2)) : 0;
  const px = dx - sx * t;
  const py = dy - sy * t;
  return {
    r: bone.ra + (bone.rb - bone.ra) * t,
    d: Math.sqrt(px * px + py * py),
  };
}

/**
 * Fiziksel coğrafya üretir. Birden çok aday dener; ilk kabul edileni,
 * hiçbiri kabul edilmezse en yüksek puanlıyı döndürür (Faz 19).
 */
export function buildGeography(seed, cols, rows, options = {}) {
  const targetLand = Math.min(0.55, Math.max(0.15, options.targetLand ?? 0.36));
  const attempts = Math.max(1, options.attempts ?? 6);
  let best = null;
  for (let i = 0; i < attempts; i++) {
    const candidate = candidateWorld(`${seed}-geo${i}`, cols, rows, targetLand, options);
    candidate.attempt = i + 1;
    if (!candidate.reasons.length) return candidate;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function candidateWorld(seed, cols, rows, targetLand, options) {
  const rng = makeRng(seed);
  const tx = (cols * SQRT3) / (rows * 1.5);
  const plan = instantiate(rng, tx, options.rotate);
  const total = cols * rows;

  const warpA = makeNoise2D(rng);
  const warpB = makeNoise2D(rng);
  const warpC = makeNoise2D(rng);
  const warpD = makeNoise2D(rng);
  const micro = makeNoise2D(rng);
  const heightNoise = makeNoise2D(rng);
  const passNoise = makeNoise2D(rng);

  // Bükme genlikleri tasarım birimindedir (dünya yüksekliğinin kesri).
  // Makro bükme silüeti yeniden yazar; mezo körfez/burun üretir.
  const AMP_MACRO = 0.072 * rng.range(0.82, 1.24);
  const AMP_MESO = 0.034 * rng.range(0.85, 1.20);
  const AMP_MICRO = 0.019 + (0.5 - Math.min(1, Math.max(0, options.continentality ?? 0.5))) * 0.012;
  const P_MACRO = 2;
  const P_MESO = 7;
  const P_MICRO = 29;

  // Kemikler satır bandına göre süzülür: her kare için 100+ mesafe hesabı
  // yerine yalnız o enlemi görebilecek olanlar taranır.
  const margin = AMP_MACRO + AMP_MESO + 0.02;
  const bucketOf = (list, v) => {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (v >= list[i].ymin - margin && v <= list[i].ymax + margin) out.push(i);
    }
    return out;
  };
  const rowBuckets = new Array(rows);
  const carveBuckets = new Array(rows);
  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    rowBuckets[row] = bucketOf(plan.bones, v);
    carveBuckets[row] = bucketOf(plan.carves, v);
  }

  // --- 1. geçiş: kemik/oyma alanları (yarıçap ölçeği s=1) ---
  const landR = new Float32Array(total);
  const landD = new Float32Array(total);
  const carveR = new Float32Array(total);
  const carveD = new Float32Array(total);
  const boneOf = new Int32Array(total).fill(-1);
  // Ada rollerini dışlayan ikinci kanal: anakara karesi bölgesini buradan alır.
  const mainBoneOf = new Int32Array(total).fill(-1);
  // Köprü kanalı ayrı tutulur: kıstak/geçit gürültüyle kopmasın diye maskeye
  // en sonda geri damgalanır (bkz. aşağıdaki "köprü damgası").
  const bridgeVal = new Float32Array(total).fill(-9);
  const microVal = new Float32Array(total);
  const warpX = new Float32Array(total);
  const warpY = new Float32Array(total);

  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    const bucket = rowBuckets[row];
    const carveBucket = carveBuckets[row];
    for (let col = 0; col < cols; col++) {
      // Tek satır kaydırması hesaba katılır; yoksa kıyı satır satır testere olur.
      const u = (col + ((row & 1) ? 0.5 : 0)) / cols;
      const idx = row * cols + col;

      const mx = (fbm(warpA, u * P_MACRO, v * (P_MACRO / tx), { octaves: 2, periodX: P_MACRO }) - 0.5) * 2;
      const my = (fbm(warpB, u * P_MACRO, v * (P_MACRO / tx), { octaves: 2, periodX: P_MACRO }) - 0.5) * 2;
      const ex = (fbm(warpC, u * P_MESO, v * (P_MESO / tx), { octaves: 2, periodX: P_MESO }) - 0.5) * 2;
      const ey = (fbm(warpD, u * P_MESO, v * (P_MESO / tx), { octaves: 2, periodX: P_MESO }) - 0.5) * 2;
      const x = u * tx + mx * AMP_MACRO + ex * AMP_MESO;
      const y = v + my * AMP_MACRO + ey * AMP_MESO;
      warpX[idx] = x;
      warpY[idx] = y;
      microVal[idx] = (fbm(micro, u * P_MICRO, v * (P_MICRO / tx), { octaves: 2, periodX: P_MICRO }) - 0.5) * 2;

      let bestVal = -Infinity; let bestR = 0; let bestD = 9; let bestBone = -1;
      let mainVal = -Infinity; let mainBone = -1;
      let bridgeBest = -9;
      for (let i = 0; i < bucket.length; i++) {
        const bone = plan.bones[bucket[i]];
        const f = boneField(bone, x, y, tx);
        const val = f.r - f.d;
        if (val > bestVal) { bestVal = val; bestR = f.r; bestD = f.d; bestBone = bucket[i]; }
        if (!bone.islandOnly && val > mainVal) { mainVal = val; mainBone = bucket[i]; }
        // Köprü kemiği çekirdeği: yarıçapın %60'ı, gürültünün altında kalan öz.
        if (bone.bridge && f.r * 0.6 - f.d > bridgeBest) bridgeBest = f.r * 0.6 - f.d;
      }
      bridgeVal[idx] = bridgeBest;
      landR[idx] = bestR;
      landD[idx] = bestD;
      boneOf[idx] = bestBone;
      mainBoneOf[idx] = mainBone >= 0 ? mainBone : bestBone;

      let carveVal = -Infinity; let cr = 0; let cd = 9;
      for (let i = 0; i < carveBucket.length; i++) {
        const f = boneField(plan.carves[carveBucket[i]], x, y, tx);
        const val = f.r - f.d;
        if (val > carveVal) { carveVal = val; cr = f.r; cd = f.d; }
      }
      carveR[idx] = cr;
      carveD[idx] = cd;
    }
  }

  // --- Kalibrasyon: kara oranını yarıçap ÖLÇEĞİ tutturur, eşik değil ---
  // Eşiği kaydırmak bütün kıyıyı aynı miktarda şişirir; küçük adalar önce
  // boğulur. Yarıçapı ölçeklemek orantıyı korur.
  const ratioAt = (s) => {
    let n = 0;
    for (let i = 0; i < total; i++) {
      const f = Math.min(landR[i] * s - landD[i], carveD[i] - carveR[i] * s);
      if (f > 0) n++;
    }
    return n / total;
  };
  let lo = 0.60; let hi = 1.45;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (ratioAt(mid) < targetLand) lo = mid; else hi = mid;
  }
  const scale = (lo + hi) / 2;

  // --- 2. geçiş: alanı topla, kıyıya mikro pürüz ekle ---
  const field = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const base = Math.min(landR[i] * scale - landD[i], carveD[i] - carveR[i] * scale);
    // Mikro gürültü yalnız kıyı bandında yaşar: iç bölgede delik açmaz,
    // açık denizde konfeti üretmez.
    const gate = Math.exp(-((base / 0.030) ** 2));
    field[i] = base + microVal[i] * AMP_MICRO * gate;
  }

  // Kalan sapmayı küçük bir eşikle kapat (±1 hex mertebesi).
  const sorted = Float32Array.from(field).sort();
  const cut = sorted[Math.min(total - 1, Math.floor((1 - targetLand) * total))];
  const threshold = Math.max(-0.012, Math.min(0.012, cut));

  const land = new Uint8Array(total);
  for (let i = 0; i < total; i++) land[i] = field[i] > threshold ? 1 : 0;

  // Köprü damgası: kıstak ve geçit TASARIM gereği vardır. Gürültü kıyısını
  // yontabilir ama çekirdeğini koparamaz — kopan köprü kıtasal sistemi ikiye
  // böler ve dünyayı reddettirir (ölçüldü: Yeni Dünya iki ayrı kütleye
  // düşüyordu). Oyma (boğaz) damganın üstündedir: kanal kapanmaz.
  const protectedLand = new Uint8Array(total);
  const protectedWater = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const carved = carveR[i] * scale - carveD[i] > 0;
    if (bridgeVal[i] * scale > 0 && !carved) { land[i] = 1; protectedLand[i] = 1; }
    // Oymanın derinindeki su boğazdır: çentik doldurma onu kapatmasın.
    if (!land[i] && carveR[i] * scale - carveD[i] > 0.004) protectedWater[i] = 1;
  }

  cleanup(land, cols, rows, protectedLand, protectedWater);

  // --- Ölçüm ve karar ---
  const stats = analyzeGeography(land, cols, rows);
  const sea = inlandSeaScore(land, cols, rows, plan.anchors['ic-deniz']);
  const seam = seamDeviation(land, cols, rows);
  const score = scoreGeography(stats, { targetLand, sea });
  const reasons = rejectReasons(stats, { targetLand, sea, seam });

  const height = buildHeight(land, cols, rows, plan, {
    tx, warpX, warpY, heightNoise, passNoise, cols, rows,
  });

  return {
    land, cols, rows,
    height: height.height,
    toWater: height.toWater,
    toLand: height.toLand,
    zones: assignZones(land, cols, rows, boneOf, mainBoneOf, plan),
    anchors: { ...plan.anchors },
    stats, sea, seam, score, reasons, scaleUsed: scale,
  };
}

/**
 * Temizlik (Faz 15). Diken ve çentikleri siler, mikro adaları ve anlamsız
 * delikleri kaldırır; kasıtlı boğaz/köprüye dokunmaz. Agresif yumuşatma YOK:
 * amaç patates üretmek değil, kazayı silmek.
 */
function cleanup(land, cols, rows, protectedLand, protectedWater) {
  const total = cols * rows;
  const neighborsLand = (col, row) => {
    let n = 0;
    for (const [dc, dr] of ODD_R[row & 1]) {
      const nr = row + dr;
      if (nr < 0 || nr >= rows) continue;
      const nc = ((col + dc) % cols + cols) % cols;
      if (land[nr * cols + nc]) n++;
    }
    return n;
  };

  for (let pass = 0; pass < 3; pass++) {
    const next = Uint8Array.from(land);
    let changed = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const n = neighborsLand(col, row);
        if (land[idx]) {
          // Diken: bir tek komşuya tutunan kara.
          if (n <= 1 && !protectedLand[idx]) { next[idx] = 0; changed++; }
        } else if (n >= 5 && !protectedWater[idx]) {
          // Çentik/tek-hex delik: karanın içindeki anlamsız gözenek.
          next[idx] = 1; changed++;
        }
      }
    }
    land.set(next);
    if (!changed) break;
  }

  // Mikro adalar (≤3 hex) ve küçük iç delikler (<10 hex) kaldırılır.
  const { label, sizes } = componentsLocal(land, cols, rows, 1);
  for (let i = 0; i < total; i++) {
    if (land[i] && sizes[label[i]] <= 3) land[i] = 0;
  }
  const water = componentsLocal(land, cols, rows, 0);
  let ocean = -1; let oceanSize = -1;
  for (let i = 0; i < water.sizes.length; i++) {
    if (water.sizes[i] > oceanSize) { oceanSize = water.sizes[i]; ocean = i; }
  }
  for (let i = 0; i < total; i++) {
    if (!land[i] && water.label[i] !== ocean && water.sizes[water.label[i]] < 10) land[i] = 1;
  }
}

function componentsLocal(mask, cols, rows, want) {
  const label = new Int32Array(cols * rows).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== want || label[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const idx = stack.pop();
      size++;
      const row = (idx / cols) | 0;
      const col = idx - row * cols;
      for (const [dc, dr] of ODD_R[row & 1]) {
        const nr = row + dr;
        if (nr < 0 || nr >= rows) continue;
        const nc = ((col + dc) % cols + cols) % cols;
        const n = nr * cols + nc;
        if (mask[n] !== want || label[n] >= 0) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/** Çok kaynaklı BFS: her kareye karşı kütleye olan hex mesafesi. */
function distanceField(land, cols, rows, fromLand) {
  const total = cols * rows;
  const dist = new Int16Array(total).fill(-1);
  let queue = [];
  for (let i = 0; i < total; i++) {
    if ((land[i] === 1) === fromLand) { dist[i] = 0; queue.push(i); }
  }
  let d = 0;
  while (queue.length) {
    const next = [];
    for (const idx of queue) {
      const row = (idx / cols) | 0;
      const col = idx - row * cols;
      for (const [dc, dr] of ODD_R[row & 1]) {
        const nr = row + dr;
        if (nr < 0 || nr >= rows) continue;
        const nc = ((col + dc) % cols + cols) % cols;
        const n = nr * cols + nc;
        if (dist[n] >= 0) continue;
        dist[n] = d + 1;
        next.push(n);
      }
    }
    queue = next;
    d++;
  }
  return dist;
}

/**
 * Yükseklik alanı. Kara: kıyıdan uzaklık + sıradağ + doku. Deniz: kıyıdan
 * uzaklığa göre sahanlık→derin bantları. Arazi sınıflandırması bu alanın
 * SIRALAMASINI kullanır (bkz. worldgen), böylece biyom oranları sabit kalır
 * ama dağlar artık zincir, ovalar artık iç bölge olur.
 */
function buildHeight(land, cols, rows, plan, ctx) {
  const total = cols * rows;
  const toWater = distanceField(land, cols, rows, false); // kara karesi -> en yakın su
  const toLand = distanceField(land, cols, rows, true);    // su karesi -> en yakın kara
  const height = new Float32Array(total);
  const P = 11;
  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (!land[idx]) { height[idx] = 0; continue; }
      const u = (col + ((row & 1) ? 0.5 : 0)) / cols;
      const dw = toWater[idx];
      let h = 0.19 * (1 - Math.exp(-dw / 5.0));
      const x = ctx.warpX[idx]; const y = ctx.warpY[idx];
      // Geçit gürültüsü: zincir boyunca yükseklik dalgalanır. Kesintisiz bir
      // sıradağ dağ karesi geçilmez olduğu için kıtayı ikiye böler; ordular
      // dolaşacak yol bulamaz. Dalga bazı bölümleri tepeye indirir = geçit.
      const pass = 0.55 + 0.75 * fbm(ctx.passNoise, u * 13, v * (13 / ctx.tx), { octaves: 2, periodX: 13 });
      for (const ridge of plan.ridges) {
        if (y < ridge.ymin || y > ridge.ymax) continue;
        const f = boneField(
          { ax: ridge.ax, ay: ridge.ay, bx: ridge.bx, by: ridge.by, ra: 0, rb: 0 },
          x, y, ctx.tx,
        );
        const t = f.d / ridge.width;
        h += ridge.h * pass * Math.exp(-(t * t));
      }
      h += (fbm(ctx.heightNoise, u * P, v * (P / ctx.tx), { octaves: 4, periodX: P }) - 0.5) * 0.55;
      height[idx] = h;
    }
  }
  return { height, toWater, toLand };
}

/**
 * Yalnız ADA kütlelerinde geçerli bölgeler. Bu roller (ada modernleşicisi,
 * korsan kümesi, baharat zinciri) küçük kara kütlesi varsayar: province boyu,
 * kültür sayısı ve arketip yerleşimi buna göre ayarlıdır.
 */
const ISLAND_ONLY_ZONES = new Set(['dogu-adalari', 'korsan-adalari', 'baharat-adalari', 'acik-deniz']);
/** Bu boyun üstündeki kara kütlesi anakara sayılır. */
const MAINLAND_MIN = 300;

/**
 * Kara karesinin bölgesi: alanı kazanan kemiğin rolü — ama ada rolleri
 * anakaraya SIZAMAZ. Küçük bir ada kemiği, anakaranın uzak kıyısında en
 * yüksek alanı verebiliyor ve o kıyıyı "ada devleti" ilan ediyordu (ölçüldü:
 * dogu-adalari etiketli karelerin %79'u anakaradaydı). Ada kütleleri ayrıca
 * TEK bölgeye oturur: bir ada iki role bölünmez.
 */
function assignZones(land, cols, rows, boneOf, mainBoneOf, plan) {
  const zones = new Array(cols * rows).fill(null);
  const { label, sizes } = componentsLocal(land, cols, rows, 1);
  for (let i = 0; i < zones.length; i++) {
    if (!land[i]) continue;
    const mainland = sizes[label[i]] >= MAINLAND_MIN;
    const bone = mainland ? mainBoneOf[i] : boneOf[i];
    zones[i] = bone >= 0 ? plan.bones[bone].zone : null;
  }
  // Ada kütlesi tek rol taşır: üye çoğunluğu neyse ada odur.
  const votes = new Map();
  for (let i = 0; i < zones.length; i++) {
    if (!land[i] || sizes[label[i]] >= MAINLAND_MIN || !zones[i]) continue;
    let bucket = votes.get(label[i]);
    if (!bucket) { bucket = new Map(); votes.set(label[i], bucket); }
    bucket.set(zones[i], (bucket.get(zones[i]) ?? 0) + 1);
  }
  const winner = new Map();
  for (const [id, bucket] of votes) {
    let best = null; let bestVotes = -1;
    for (const [zone, v] of bucket) {
      if (v > bestVotes || (v === bestVotes && zone < best)) { best = zone; bestVotes = v; }
    }
    winner.set(id, best);
  }
  for (let i = 0; i < zones.length; i++) {
    if (!land[i] || sizes[label[i]] >= MAINLAND_MIN) continue;
    zones[i] = winner.get(label[i]) ?? zones[i];
  }
  return zones;
}

/** Bölge çapaları: gerçek kara ağırlık merkezi (silindirde dairesel ortalama). */
export function zoneAnchors(zones, cols, rows, seed = {}) {
  const acc = new Map();
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (!zone) continue;
    const row = (i / cols) | 0;
    const col = i - row * cols;
    const u = (col + 0.5) / cols;
    const angle = u * Math.PI * 2;
    let a = acc.get(zone);
    if (!a) { a = { sx: 0, sy: 0, sv: 0, n: 0 }; acc.set(zone, a); }
    a.sx += Math.cos(angle);
    a.sy += Math.sin(angle);
    a.sv += (row + 0.5) / rows;
    a.n++;
  }
  const out = { ...seed };
  for (const [zone, a] of acc) {
    const angle = Math.atan2(a.sy / a.n, a.sx / a.n);
    out[zone] = { u: ((angle / (Math.PI * 2)) % 1 + 1) % 1, v: a.sv / a.n };
  }
  return out;
}
