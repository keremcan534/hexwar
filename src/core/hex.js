// Hex matematiği: sivri-tepe (pointy-top) hexler, eksenel (axial) q/r koordinatları.
// Depolama dikdörtgen "odd-r offset" ızgara, mantık hep axial üzerinden yürür.
//
//        _____
//       /     \        +q -> sağ
//  ____/  q,r  \____   +r -> sağ-aşağı
//      \       /
//       \_____/

/** Komşu yönleri. Sıra, HEX_CORNERS'daki kenar sırasıyla birebir eşleşir. */
export const DIRS = [
  [1, 0],   // 0: doğu
  [0, 1],   // 1: güneydoğu
  [-1, 1],  // 2: güneybatı
  [-1, 0],  // 3: batı
  [0, -1],  // 4: kuzeybatı
  [1, -1],  // 5: kuzeydoğu
];

export const SQRT3 = Math.sqrt(3);

/** Birim hexin köşeleri (size=1). Köşe i ile i+1 arasındaki kenar = DIRS[i]. */
export const HEX_CORNERS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [Math.cos(a), Math.sin(a)];
});

/** Axial -> piksel (hex merkezi). size = dış yarıçap. */
export function hexToPixel(q, r, size) {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r,
  };
}

/** Piksel -> axial (kesirli). */
export function pixelToHexFractional(x, y, size) {
  const r = (y * 2) / (3 * size);
  const q = x / (SQRT3 * size) - r / 2;
  return { q, r };
}

/** Kesirli axial -> en yakın hex (küp yuvarlama). */
export function hexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

export function pixelToHex(x, y, size) {
  const f = pixelToHexFractional(x, y, size);
  return hexRound(f.q, f.r);
}

export function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export function neighbor(q, r, dir) {
  const d = DIRS[dir];
  return { q: q + d[0], r: r + d[1] };
}

/** Merkezden `radius` mesafedeki tüm hexler (merkez dahil). */
export function hexesInRange(cq, cr, radius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: cq + dq, r: cr + dr });
  }
  return out;
}

// --- Offset (odd-r) <-> axial dönüşümleri: dikdörtgen harita depolaması için ---

export function offsetToAxial(col, row) {
  return { q: col - ((row - (row & 1)) >> 1), r: row };
}

export function axialToOffset(q, r) {
  return { col: q + ((r - (r & 1)) >> 1), row: r };
}

/** Sütunu doğu-batı sarmalına oturtur: dünya silindir, col mod cols. */
export function wrapCol(col, cols) {
  return ((col % cols) + cols) % cols;
}
