// Coğrafya ölçümü ve kalite puanı.
//
// Üretici bu ölçümlerle KABUL/RET kararı verir: kötü dünya atılır, en iyi aday
// saklanır (bkz. geography.js). Ölçüm oyuncuya gösterilmez — yalnız üreticinin
// iç sağduyusudur.
//
// Katman notu: saf veri; DOM'suz, game'siz. Node'da test edilir.

/** odd-r offset komşu tabloları: [çift satır, tek satır]. Sıra core/hex DIRS ile aynı. */
export const ODD_R = [
  [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]],
  [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]],
];

/** Bağlı bileşenler (doğu-batı sarmalı açık, kutuplar kapalı). */
export function components(mask, cols, rows, want) {
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

/** Hex diski (yarıçap k) için satır pariteliğine göre offset tabloları. */
export function discOffsets(radius) {
  const tables = [[], []];
  for (let parity = 0; parity < 2; parity++) {
    for (let dq = -radius; dq <= radius; dq++) {
      const lo = Math.max(-radius, -dq - radius);
      const hi = Math.min(radius, -dq + radius);
      for (let dr = lo; dr <= hi; dr++) {
        // parity satırındaki (0,0) hexinin axial'ı (0,0) kabul edilir.
        const r = parity + dr;
        const dc = dq + ((r - (r & 1)) >> 1) - ((parity - (parity & 1)) >> 1);
        tables[parity].push([dc, dr]);
      }
    }
  }
  return tables;
}

/** Bir karenin çevresindeki disk içinde kara payı. Harita dışı su sayılır. */
function landShare(land, cols, rows, col, row, table) {
  const offsets = table[row & 1];
  let hit = 0;
  for (let i = 0; i < offsets.length; i++) {
    const nr = row + offsets[i][1];
    if (nr < 0 || nr >= rows) continue;
    const nc = ((col + offsets[i][0]) % cols + cols) % cols;
    if (land[nr * cols + nc]) hit++;
  }
  return hit / offsets.length;
}

/** Aynı özelliğin komşu kareleri tek bulguya iner: sayım kare değil, yer sayar. */
function clusterCount(flags, cols, rows, minSize = 1) {
  const { sizes } = components(flags, cols, rows, 1);
  return sizes.filter((s) => s >= minSize).length;
}

/**
 * Bir dünyanın fiziksel coğrafyasını ölçer.
 * land: Uint8Array (1 = kara), cols/rows: ızgara boyu.
 */
export function analyzeGeography(land, cols, rows) {
  const total = cols * rows;
  let landCount = 0;
  for (let i = 0; i < total; i++) landCount += land[i];
  const landRatio = landCount / total;

  const L = components(land, cols, rows, 1);
  const W = components(land, cols, rows, 0);

  // Kıyı kenarı: kara-su komşulukları. Kütle başına da tutulur (çevre endeksi).
  const coastPer = new Float64Array(L.sizes.length);
  let coastEdges = 0;
  for (let i = 0; i < total; i++) {
    if (!land[i]) continue;
    const row = (i / cols) | 0;
    const col = i - row * cols;
    let e = 0;
    for (const [dc, dr] of ODD_R[row & 1]) {
      const nr = row + dr;
      const nc = ((col + dc) % cols + cols) % cols;
      if (nr < 0 || nr >= rows || !land[nr * cols + nc]) e++;
    }
    coastEdges += e;
    coastPer[L.label[i]] += e;
  }

  // Kütleler büyükten küçüğe; "büyük" = toplam karanın %6'sı.
  const order = [...L.sizes.keys()].sort((a, b) => L.sizes[b] - L.sizes[a]);
  const majorMin = Math.max(60, landCount * 0.06);
  const masses = order.map((id) => {
    const size = L.sizes[id];
    return {
      id,
      size,
      share: landCount ? size / landCount : 0,
      // Mükemmel hex diski her boyutta ~6.93 verir (boyuttan bağımsız sabit);
      // gerçek kıta 9-20 arası. Düşük = patates, çok yüksek = saçak.
      perimIndex: coastPer[id] / Math.sqrt(size),
      major: size >= majorMin,
    };
  });
  const majors = masses.filter((m) => m.major);
  const islands = masses.filter((m) => !m.major);

  // Kapalı su: en büyük su bileşeni okyanustur, kalanı iç su.
  const waterOrder = [...W.sizes.keys()].sort((a, b) => W.sizes[b] - W.sizes[a]);
  const enclosed = waterOrder.slice(1).map((id) => W.sizes[id]);

  // Yarımada ucu: çevresi ağırlıkla su olan kara (disk r=4 içinde < %42 kara).
  // Kümelenir: bir yarımada tek bulgu sayılır, kaç kare tuttuğu değil.
  const disc4 = discOffsets(4);
  const disc2 = discOffsets(2);
  const tips = new Uint8Array(total);
  const necks = new Uint8Array(total);
  const chokes = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const row = (i / cols) | 0;
    const col = i - row * cols;
    if (land[i]) {
      if (L.sizes[L.label[i]] < majorMin) continue; // ada zaten "uç" görünür
      if (landShare(land, cols, rows, col, row, disc4) < 0.42) tips[i] = 1;
      // Boyun: iki yanı su olan ince kara (kıstak adayı).
      if (landShare(land, cols, rows, col, row, disc2) < 0.48) necks[i] = 1;
    } else if (landShare(land, cols, rows, col, row, disc2) > 0.55) {
      chokes[i] = 1; // dar su geçidi (boğaz adayı)
    }
  }

  return {
    cols, rows, total, landCount, landRatio,
    coastEdges,
    masses,
    majors,
    islands,
    largestShare: masses[0]?.share ?? 0,
    top3: masses.slice(0, 3).map((m) => m.share),
    islandCount: islands.length,
    tinyIslands: islands.filter((m) => m.size <= 3).length,
    oneHexIslands: islands.filter((m) => m.size === 1).length,
    enclosedWater: enclosed,
    smallHoles: enclosed.filter((s) => s < 10).length,
    lakes: enclosed.filter((s) => s >= 10).length,
    // Kümelenmiş sayımlar: "kaç ayrı yer", "kaç kare" değil.
    peninsulas: clusterCount(tips, cols, rows, 4),
    isthmuses: clusterCount(necks, cols, rows, 3),
    straits: clusterCount(chokes, cols, rows, 3),
  };
}

/**
 * İç deniz testi: verilen çapa çevresinde su havzası var mı ve havza karayla
 * çevrili mi? (world-audit ile aynı mantık; üretim de aynı ölçütü kullanır.)
 */
export function inlandSeaScore(land, cols, rows, anchor) {
  if (!anchor) return { basin: 0, ring: 0, ok: false };
  const cx = Math.floor(anchor.u * cols);
  const cy = Math.floor(anchor.v * rows);
  let basinWater = 0; let basinTotal = 0; let ringLand = 0; let ringTotal = 0;
  for (let dr = -13; dr <= 13; dr++) {
    const row = cy + dr;
    if (row < 0 || row >= rows) continue;
    for (let dc = -13; dc <= 13; dc++) {
      const d = Math.max(Math.abs(dc), Math.abs(dr));
      const col = ((cx + dc) % cols + cols) % cols;
      const isLand = land[row * cols + col];
      if (d <= 4) { basinTotal++; if (!isLand) basinWater++; }
      else if (d >= 10) { ringTotal++; if (isLand) ringLand++; }
    }
  }
  const basin = basinTotal ? basinWater / basinTotal : 0;
  const ring = ringTotal ? ringLand / ringTotal : 0;
  return { basin, ring, ok: basin >= 0.55 && ring >= 0.5 };
}

/**
 * Dikiş sağlığı. Ölçüt "dikişte az değişim olsun" DEĞİL — bir kıyı şeridi
 * dikişe denk gelirse orada da bol değişim olur, bu doğaldır. Doğru soru:
 * dikiş sütun sınırı, dünyadaki sıradan bir sütun sınırından ayırt edilebiliyor
 * mu? Bu yüzden dikiş, diğer 159 sınırın DAĞILIMIYLA karşılaştırılır.
 */
export function seamDeviation(land, cols, rows) {
  const diff = (a, b) => {
    let d = 0;
    for (let row = 0; row < rows; row++) {
      if (land[row * cols + a] !== land[row * cols + b]) d++;
    }
    return d;
  };
  const others = [];
  for (let c = 0; c < cols - 1; c++) others.push(diff(c, c + 1));
  const seam = diff(cols - 1, 0);
  const sorted = [...others].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  // Sıra: dikişten daha az değişimli sınırların payı. 1.0 = dünyanın en
  // hareketli sütun sınırı dikiştir (tek başına suç değil, p95 ile birlikte).
  const rank = sorted.filter((d) => d <= seam).length / sorted.length;
  return {
    seam, mean, p95, rank,
    ratio: mean > 0 ? seam / mean : 1,
    // Yalnız hem "hepsinden yüksek" hem de "p95'in belirgin üstünde" ise
    // dikiş gerçekten bir kenar gibi okunuyor demektir.
    broken: rank >= 1 && seam > p95 * 1.4,
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Bant içinde 1, kenarlarda 0'a inen yumuşak pencere. */
function band(value, lo, hi, soft) {
  if (value >= lo && value <= hi) return 1;
  const d = value < lo ? lo - value : value - hi;
  return clamp01(1 - d / soft);
}

/**
 * Coğrafya kalite puanı (0-100). Yalnız üreticinin iç sağduyusu: hangi aday
 * saklanacak, hangi aday atılacak. Oyuncuya gösterilmez.
 */
export function scoreGeography(stats, { targetLand = 0.36, sea } = {}) {
  const s = stats;
  let score = 0;
  // Kara oranı hedefte mi (en ağır terim: okyanus ölçeği bunun sonucudur).
  score += 20 * band(s.landRatio, targetLand - 0.006, targetLand + 0.006, 0.03);
  // Üç ayrı büyük kıtasal sistem.
  score += 16 * (s.majors.length === 3 ? 1 : s.majors.length === 4 ? 0.7 : 0.15);
  // Dengeli dağılım: en büyük %38-50, ikinci %22-32, üçüncü %14-24.
  score += 6 * band(s.top3[0] ?? 0, 0.36, 0.50, 0.12);
  score += 5 * band(s.top3[1] ?? 0, 0.20, 0.33, 0.10);
  score += 5 * band(s.top3[2] ?? 0, 0.12, 0.26, 0.10);
  // Kıyı karmaşıklığı: daire (6.93) da düz çizgi de kötü.
  const avgPerim = s.majors.length
    ? s.majors.reduce((a, m) => a + m.perimIndex, 0) / s.majors.length : 0;
  score += 14 * band(avgPerim, 9.5, 17, 4);
  // En yuvarlak büyük kütle bile patates olmamalı.
  const worst = s.majors.length ? Math.min(...s.majors.map((m) => m.perimIndex)) : 0;
  score += 6 * band(worst, 8.6, 99, 2);
  // İç deniz.
  if (sea) score += 10 * (clamp01((sea.basin - 0.35) / 0.3) * 0.5 + clamp01((sea.ring - 0.35) / 0.25) * 0.5);
  // Yarımadalar ve boğazlar.
  score += 7 * band(s.peninsulas, 7, 18, 6);
  score += 5 * band(s.straits, 2, 9, 4);
  // Ada denetimi: seyrek ve kasıtlı.
  score += 6 * band(s.islandCount, 8, 30, 14);
  // Cezalar.
  score -= 12 * clamp01(s.smallHoles / 3);
  score -= 10 * clamp01(s.tinyIslands / 6);
  score -= 20 * clamp01((s.largestShare - 0.52) / 0.2);
  return Math.max(0, score);
}

/**
 * Ret gerekçeleri (Faz 19). Boş dizi = dünya kabul edilebilir.
 * Tolerans üreticinin deneme sayısıyla değil, tasarım sözleşmesiyle belirlenir.
 */
export function rejectReasons(stats, { targetLand = 0.36, sea, seam } = {}) {
  const s = stats;
  const out = [];
  if (s.landRatio < targetLand - 0.02) out.push(`kara az (%${(s.landRatio * 100).toFixed(1)})`);
  if (s.landRatio > targetLand + 0.02) out.push(`kara çok (%${(s.landRatio * 100).toFixed(1)})`);
  if (s.majors.length < 3) out.push(`büyük sistem ${s.majors.length} (3 gerek)`);
  if (s.majors.length > 4) out.push(`büyük sistem ${s.majors.length} (parçalanma)`);
  if (s.largestShare > 0.52) out.push(`tek kütle karanın %${(s.largestShare * 100).toFixed(0)}'i (birleşme)`);
  if ((s.top3[2] ?? 0) < 0.10) out.push('üçüncü sistem cılız');
  if (s.tinyIslands > 4) out.push(`${s.tinyIslands} mikro ada`);
  if (s.oneHexIslands > 0) out.push(`${s.oneHexIslands} tek-hex ada`);
  if (s.smallHoles > 2) out.push(`${s.smallHoles} anlamsız iç delik`);
  if (s.islandCount > 40) out.push(`${s.islandCount} ada (spam)`);
  for (const m of s.majors) {
    if (m.perimIndex < 8.6) out.push(`kütle #${m.id} fazla yuvarlak (${m.perimIndex.toFixed(1)})`);
  }
  if (s.peninsulas < 5) out.push(`yarımada ${s.peninsulas}`);
  if (s.straits < 2) out.push(`boğaz ${s.straits}`);
  if (sea && !sea.ok) out.push(`iç deniz zayıf (havza %${(sea.basin * 100).toFixed(0)}, halka %${(sea.ring * 100).toFixed(0)})`);
  if (seam?.broken) out.push(`dikiş kopuk (${seam.seam} vs p95 ${seam.p95})`);
  return out;
}
