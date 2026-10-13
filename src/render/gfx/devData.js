// GELİŞMİŞLİK VERİSİ — stillerin hex başına (uGfxHex, birim 13) okuyacağı
// yerleşim/tarla/sanayi bilgisi.
//
// Neden burada: yerleşim ve tarla deseni çizmek isteyen her stil aynı soruyu
// soruyor (nerede kalabalık, nerede tarla, nerede fabrika) ve cevap province
// ekonomisinde. Her stil kendi okuyucusunu yazarsa üçü üç ayrı "kalkınma"
// tanımı kurar. Veri province başınadır (tile.province paylaşılan nesne):
// toplayıcılar world.provinces üzerinden döner, kare döngüsüyle değil.
//
// Kullanım (stil tanımında):
//   import { devHexData, devHexKey } from './devData.js';
//   hexData: (world) => devHexData(world),
//   hexDataKey: (world) => devHexKey(world),   // değişince yeniden kurulur
// GLSL: GfxDev d = gfxDev(L.fill);  (bkz. terrainGLSL.js)
//
// Katman notu: DOM'a dokunmaz.

import { DEVELOPMENT_MAX, BUILDINGS } from '../../game/econ/defs.js';

/**
 * Province merkezleri: dünya konumu ve ekonomi. Yerleşim, yol ya da etiket
 * gibi nokta tabanlı Canvas2D mürekkep geçişleri için.
 * @returns {{id:number, x:number, y:number, tile:object, econ:object|null, tiles:number}[]}
 */
export function provinceCenters(world) {
  const out = [];
  for (const p of world.provinces ?? []) {
    const c = p.center;
    if (!c) continue;
    out.push({ id: p.id, x: c.x, y: c.y, tile: c, econ: p.econ ?? null, tiles: p.tileIdx?.length ?? 0 });
  }
  return out;
}

/**
 * Hex başına RGBA8 (cols×rows×4), deniz ve province'siz kara 0:
 *   R kalkınma / DEVELOPMENT_MAX (province düzeyi)
 *   G nüfus yoğunluğu: log2(kare başı nüfus / dünya medyanı), 0.5 = medyan,
 *     ±1 oktav = ±0.25 (0..1'e kenetli)
 *   B sanayi: fabrika kademesi / azami
 *   A bayraklar: 128 province merkezi, 64 demiryolu var, 16×tarla kademesi (0..3)
 */
export function devHexData(world) {
  const cols = world.cols;
  const rows = world.rows;
  const out = new Uint8Array(cols * rows * 4);
  const provinces = world.provinces ?? [];
  const per = [];
  for (const p of provinces) {
    const n = p.tileIdx?.length ?? 0;
    if (n && p.econ) per.push(p.econ.population / n);
  }
  per.sort((a, b) => a - b);
  const median = per.length ? Math.max(1, per[per.length >> 1]) : 1;
  const factoryMax = BUILDINGS.factory.max;
  const farmMax = BUILDINGS.farm.max;
  for (const p of provinces) {
    const e = p.econ;
    const idx = p.tileIdx;
    if (!e || !idx?.length) continue;
    const b = e.buildings ?? {};
    const r = Math.round(Math.min(1, (e.development ?? 0) / DEVELOPMENT_MAX) * 255);
    const dens = Math.log2(Math.max(1, e.population / idx.length) / median);
    const g = Math.round(Math.max(0, Math.min(1, 0.5 + dens * 0.25)) * 255);
    const bl = Math.round(Math.min(1, (b.factory ?? 0) / factoryMax) * 255);
    const farm = Math.max(0, Math.min(farmMax, b.farm ?? 0));
    const flags = ((b.railway ?? 0) > 0 ? 64 : 0) + farm * 16;
    const centre = p.center ? p.center.row * cols + p.center.col : -1;
    for (const i of idx) {
      const o = i * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = bl;
      out[o + 3] = flags + (i === centre ? 128 : 0);
    }
  }
  return out;
}

/**
 * Ucuz imza: kalkınma, nüfus ve bina değişince değişir. İnşaat ve nüfus
 * artışı renderer'a haber vermez (agenda.grantBuilding, tur sonu); stil bu
 * imzayı hexDataKey olarak verirse veri kendiliğinden tazelenir.
 */
export function devHexKey(world) {
  let h = 0;
  for (const p of world.provinces ?? []) {
    const e = p.econ;
    if (!e) continue;
    const b = e.buildings ?? {};
    h = (Math.imul(h, 31) + (e.development ?? 0) * 7 + (b.factory ?? 0) * 13 + (b.farm ?? 0) * 17
      + (b.railway ?? 0) * 19 + Math.round((e.population ?? 0) / 20000)) | 0;
  }
  return h;
}
