// Tek bantlı GeoTIFF okuyucu: şerit ya da karo düzeni; sıkıştırma yok / LZW /
// deflate; yatay fark öngörüsü (predictor 2). Klasik TIFF ve BigTIFF.
// Coğrafi konum ModelPixelScale + ModelTiepoint'ten (enlem/boylam varsayılır).

import { inflateSync } from 'node:zlib';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

export function readTiff(buf) {
  const le = buf.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const u64 = (o) => Number(le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o));
  const magic = u16(2);
  const big = magic === 43;
  if (magic !== 42 && !big) throw new Error('tiff: imza yok');
  const ifd = big ? u64(8) : u32(4);

  const tags = new Map();
  const count = big ? u64(ifd) : u16(ifd);
  const entrySize = big ? 20 : 12;
  for (let i = 0; i < count; i++) {
    const e = ifd + (big ? 8 : 2) + i * entrySize;
    const tag = u16(e);
    const type = u16(e + 2);
    const n = big ? u64(e + 4) : u32(e + 4);
    const bytes = n * (TYPE_SIZE[type] ?? 1);
    const inline = big ? 8 : 4;
    const at = bytes <= inline ? e + (big ? 12 : 8) : (big ? u64(e + 12) : u32(e + 8));
    const vals = [];
    for (let k = 0; k < n; k++) {
      const o = at + k * TYPE_SIZE[type];
      if (type === 1 || type === 7) vals.push(buf[o]);
      else if (type === 2) { vals.push(buf.toString('latin1', at, at + n).replace(/\0+$/, '')); break; }
      else if (type === 3) vals.push(u16(o));
      else if (type === 4) vals.push(u32(o));
      else if (type === 8) vals.push(le ? buf.readInt16LE(o) : buf.readInt16BE(o));
      else if (type === 11) vals.push(le ? buf.readFloatLE(o) : buf.readFloatBE(o));
      else if (type === 12) vals.push(le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
      else if (type === 16 || type === 18) vals.push(u64(o));
      else vals.push(null);
    }
    tags.set(tag, vals);
  }
  const one = (tag, fallback) => (tags.has(tag) ? tags.get(tag)[0] : fallback);

  const width = one(256);
  const height = one(257);
  const bits = one(258, 8);
  const compression = one(259, 1);
  const predictor = one(317, 1);
  const sampleFormat = one(339, 1);
  const bytesPer = bits / 8;
  const Ctor = sampleFormat === 3 ? (bits === 64 ? Float64Array : Float32Array)
    : sampleFormat === 2 ? ({ 8: Int8Array, 16: Int16Array, 32: Int32Array }[bits])
      : ({ 8: Uint8Array, 16: Uint16Array, 32: Uint32Array }[bits]);
  const out = new Ctor(width * height);

  const tiled = tags.has(322);
  const tw = tiled ? one(322) : width;
  const th = tiled ? one(323) : one(278, height);
  const offsets = tags.get(tiled ? 324 : 273);
  const counts = tags.get(tiled ? 325 : 279);
  const across = Math.ceil(width / tw);

  const decode = (raw) => {
    if (compression === 1) return raw;
    if (compression === 8 || compression === 32946) return inflateSync(raw);
    if (compression === 5) return lzw(raw);
    throw new Error(`tiff: sıkıştırma ${compression} desteklenmiyor`);
  };
  const view = (data) => new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let b = 0; b < offsets.length; b++) {
    const data = decode(buf.subarray(offsets[b], offsets[b] + counts[b]));
    const dv = view(data);
    const x0 = tiled ? (b % across) * tw : 0;
    const y0 = tiled ? Math.floor(b / across) * th : b * th;
    const rowLen = tw;
    for (let y = 0; y < th; y++) {
      const gy = y0 + y;
      if (gy >= height) break;
      let prev = 0;
      for (let x = 0; x < rowLen; x++) {
        const o = (y * rowLen + x) * bytesPer;
        if (o + bytesPer > data.length) break;
        let v;
        if (sampleFormat === 3) v = bits === 64 ? dv.getFloat64(o, le) : dv.getFloat32(o, le);
        else if (bits === 8) v = sampleFormat === 2 ? dv.getInt8(o) : dv.getUint8(o);
        else if (bits === 16) v = sampleFormat === 2 ? dv.getInt16(o, le) : dv.getUint16(o, le);
        else v = sampleFormat === 2 ? dv.getInt32(o, le) : dv.getUint32(o, le);
        if (predictor === 2) {
          v = x === 0 ? v : wrap(prev + v, bits, sampleFormat);
          prev = v;
        }
        const gx = x0 + x;
        if (gx < width) out[gy * width + gx] = v;
      }
    }
  }

  const scale = tags.get(33550);
  const tie = tags.get(33922);
  const nodataTag = tags.get(42113)?.[0];
  return {
    width, height, data: out,
    // Sol üst köşe ve hücre boyu (derece). Hücre merkezi = köşe + (i + 0.5)·boy.
    lon0: tie ? tie[3] - tie[0] * scale[0] : -180,
    lat0: tie ? tie[4] + tie[1] * scale[1] : 90,
    dLon: scale ? scale[0] : 360 / width,
    dLat: scale ? scale[1] : 180 / height,
    nodata: nodataTag != null ? Number(nodataTag) : null,
  };
}

function wrap(v, bits, sampleFormat) {
  const m = 2 ** bits;
  let r = ((v % m) + m) % m;
  if (sampleFormat === 2 && r >= m / 2) r -= m;
  return r;
}

/** TIFF LZW (MSB önce, 9-12 bit, erken genişleme). */
function lzw(input) {
  const out = [];
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push(null, null); // 256 temizle, 257 son
  };
  reset();
  let width = 9;
  let bitPos = 0;
  const total = input.length * 8;
  const readCode = () => {
    if (bitPos + width > total) return 257;
    let code = 0;
    for (let i = 0; i < width; i++) {
      const byte = input[(bitPos + i) >> 3];
      code = (code << 1) | ((byte >> (7 - ((bitPos + i) & 7))) & 1);
    }
    bitPos += width;
    return code;
  };
  let prev = null;
  for (;;) {
    const code = readCode();
    if (code === 257) break;
    if (code === 256) {
      reset();
      width = 9;
      prev = null;
      continue;
    }
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = prev.concat(prev[0]);
    else throw new Error('tiff: LZW akışı bozuk');
    for (const b of entry) out.push(b);
    if (prev) dict.push(prev.concat(entry[0]));
    prev = entry;
    if (dict.length + 1 >= 1 << width && width < 12) width++;
  }
  return Buffer.from(out);
}
