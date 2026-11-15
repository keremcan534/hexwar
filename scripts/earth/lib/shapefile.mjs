// ESRI shapefile (.shp + .dbf) okuyucu: çokgen ve çizgi kayıtları, öznitelikler.
// Yalnız XY okunur; Z/M dizileri (13, 15) atlanır.

const POLYLINE = new Set([3, 13, 23]);
const POLYGON = new Set([5, 15, 25]);

/** @returns {{ type: number, parts: Float64Array[] }[]} parts: x,y sırayla */
export function readShp(buf) {
  if (buf.readInt32BE(0) !== 9994) throw new Error('shp: dosya kodu yanlış');
  const shapes = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const contentBytes = buf.readInt32BE(p + 4) * 2;
    const c = p + 8;
    const type = buf.readInt32LE(c);
    if (POLYLINE.has(type) || POLYGON.has(type)) {
      const numParts = buf.readInt32LE(c + 36);
      const numPoints = buf.readInt32LE(c + 40);
      const partStart = [];
      for (let i = 0; i < numParts; i++) partStart.push(buf.readInt32LE(c + 44 + i * 4));
      const pts = c + 44 + numParts * 4;
      const parts = [];
      for (let i = 0; i < numParts; i++) {
        const a = partStart[i];
        const b = i + 1 < numParts ? partStart[i + 1] : numPoints;
        const arr = new Float64Array((b - a) * 2);
        for (let k = a; k < b; k++) {
          arr[(k - a) * 2] = buf.readDoubleLE(pts + k * 16);
          arr[(k - a) * 2 + 1] = buf.readDoubleLE(pts + k * 16 + 8);
        }
        parts.push(arr);
      }
      shapes.push({ type: POLYGON.has(type) ? 5 : 3, parts });
    } else {
      shapes.push({ type: 0, parts: [] });
    }
    p = c + contentBytes;
  }
  return shapes;
}

/** dBase III öznitelik tablosu: kayıt başına { alan: değer }. */
export function readDbf(buf, encoding = 'utf8') {
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields = [];
  for (let p = 32; p < headerLen - 1 && buf[p] !== 0x0d; p += 32) {
    const name = buf.toString('latin1', p, p + 11).replace(/\0.*$/, '');
    fields.push({ name, type: String.fromCharCode(buf[p + 11]), length: buf[p + 16] });
  }
  const rows = [];
  for (let i = 0; i < count; i++) {
    let p = headerLen + i * recordLen + 1;
    const row = {};
    for (const f of fields) {
      // Natural Earth alanları boşlukla değil NUL ile doldurur.
      const raw = buf.toString(encoding, p, p + f.length).replace(/\0+/g, '').trim();
      p += f.length;
      row[f.name] = (f.type === 'N' || f.type === 'F') ? (raw === '' ? null : Number(raw)) : raw;
    }
    rows.push(row);
  }
  return rows;
}
