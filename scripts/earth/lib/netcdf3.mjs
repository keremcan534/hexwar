// NetCDF-3 (klasik ve 64 bit ofset) okuyucu. ERDDAP'ın .nc çıktısı bu biçimdedir.
// Kayıt boyutlu değişken desteklenmez: ızgara verisinde yoktur.

const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };

export function readNetcdf3(buf) {
  if (buf.toString('latin1', 0, 3) !== 'CDF') throw new Error('nc: imza yok');
  const version = buf[3];
  if (version !== 1 && version !== 2) throw new Error(`nc: sürüm ${version} desteklenmiyor`);
  let p = 4;
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const name = () => {
    const n = u32();
    const s = buf.toString('utf8', p, p + n);
    p += (n + 3) & ~3;
    return s;
  };
  const values = (type, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const o = p + i * SIZE[type];
      if (type === 1) out.push(buf.readInt8(o));
      else if (type === 3) out.push(buf.readInt16BE(o));
      else if (type === 4) out.push(buf.readInt32BE(o));
      else if (type === 5) out.push(buf.readFloatBE(o));
      else if (type === 6) out.push(buf.readDoubleBE(o));
    }
    const result = type === 2 ? buf.toString('utf8', p, p + n) : out;
    p += (n * SIZE[type] + 3) & ~3;
    return result;
  };
  const attrs = () => {
    const tag = u32();
    const n = u32();
    const out = {};
    if (tag === 0) return out;
    for (let i = 0; i < n; i++) {
      const key = name();
      const type = u32();
      out[key] = values(type, u32());
    }
    return out;
  };

  u32(); // numrecs
  const dims = [];
  {
    const tag = u32();
    const n = u32();
    if (tag !== 0) for (let i = 0; i < n; i++) dims.push({ name: name(), length: u32() });
  }
  const global = attrs();
  const vars = {};
  {
    const tag = u32();
    const n = u32();
    if (tag !== 0) {
      for (let i = 0; i < n; i++) {
        const vname = name();
        const nd = u32();
        const dimIds = [];
        for (let k = 0; k < nd; k++) dimIds.push(u32());
        const vattrs = attrs();
        const type = u32();
        u32(); // vsize
        const begin = version === 2 ? Number(buf.readBigUInt64BE((p += 8) - 8)) : u32();
        vars[vname] = { name: vname, dims: dimIds.map((d) => dims[d]), attrs: vattrs, type, begin };
      }
    }
  }

  return {
    dims, global, vars,
    /** Değişkenin tamamı; short/int Int16/Int32Array, float Float32Array. */
    read(vname) {
      const v = vars[vname];
      if (!v) throw new Error(`nc: ${vname} yok`);
      const count = v.dims.reduce((a, d) => a * d.length, 1);
      const Ctor = { 1: Int8Array, 3: Int16Array, 4: Int32Array, 5: Float32Array, 6: Float64Array }[v.type];
      const out = new Ctor(count);
      const size = SIZE[v.type];
      for (let i = 0; i < count; i++) {
        const o = v.begin + i * size;
        if (v.type === 1) out[i] = buf.readInt8(o);
        else if (v.type === 3) out[i] = buf.readInt16BE(o);
        else if (v.type === 4) out[i] = buf.readInt32BE(o);
        else if (v.type === 5) out[i] = buf.readFloatBE(o);
        else out[i] = buf.readDoubleBE(o);
      }
      return out;
    },
  };
}
