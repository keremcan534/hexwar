// EARTH ızgarası: Miller silindirik projeksiyonu + Avrupa merceği ↔ odd-r hex ızgarası.
//
// Yatay sarmal ancak silindirik projeksiyonla dikişsiz kapanır; Miller, kutup
// şişmesini Mercator'dan az, orta enlem biçimini eşit alandan iyi tutar.
// 160×96'nın hex en/boy oranı Miller'da 83.6°K–63.1°G aralığına denk gelir:
// sütun genişliği boylam olarak 2π/cols, satır aralığı onun 1.5/√3 katıdır.
//
// MERCEK (Kerem 2026-11-15: "Avrupa küçük kalırsa sıkıcı olur"): Miller'da
// Avrupa karanın %5'i, Sibirya ve Kanada ise kutup şişmesiyle dev. Avrupa'nın
// üstüne yumuşak bir büyüteç konur: merkezde iki yönde de aynı büyütme (biçim
// bozulmaz), kenara doğru söner; kazanılan alanı halkadaki az değerli yerler
// (Kuzey Atlantik, Arktik, Sahra'nın güneyi, Batı Sibirya) öder. Paradox
// haritalarının yaptığı hile; satır/sütun sayısı değişmez.
//
// İşleme betiği (scripts/earth/build-earth.mjs) ve oyun aynı dönüşümü kullanır;
// biri değişirse veri yeniden üretilmeden çapalar kayar.
//
// Katman notu: saf matematik; DOM'suz.

import { SQRT3, pixelToHex } from '../core/hex.js';

const D2R = Math.PI / 180;

/**
 * Dikiş Bering'de: −169° boylamı 0. sütunun merkezi, Avrupa-Afrika ortada.
 * Mercek: merkez (enlem/boylam), yarı eksenler a/b (Miller pikseli, 1 = hex
 * dış yarıçapı), merkez büyütmesi m. m < 2.25 olmalı: üstü dönüşümü katlar.
 */
export const EARTH_GRID = {
  cols: 160, rows: 96, lon0: -169, latTop: 83.6,
  lenses: [
    { lon: 16, lat: 49, a: 56, b: 42, m: 1.55 }, // Avrupa
    // Anadolu (Kerem: "Türkiye de önemli"): Avrupa merceğinin çekirdeğinde
    // zaten ×1.43; bu küçük mercek Boğazlar ve yaylayı ~×1.8'e taşır. Doğu-batı
    // uzun elips: sönüm Karadeniz'e ve Suriye çölüne düşer, Yunanistan'a değil.
    { lon: 34.5, lat: 39.2, a: 24, b: 14, m: 1.28 },
    // Hindistan ve Doğu Asya: rol tasarımının iki nüfus devi. Saf Miller'da
    // Hindistan 86, Japonya 10 hexti; denizci imparatorluğun kolonisi 2-4
    // province kalıyor (audit:world ≥ 8 ister), doğu devi Avrupa'nın 1.5
    // katı nüfusa ulaşamıyordu. Halka Hint Okyanusu, Tibet ve Pasifik'e düşer.
    { lon: 79, lat: 21, a: 22, b: 22, m: 1.65 },
    // Çin, Mançurya, Kore ve Japonya birlikte çekirdekte: merkez 122°D iken
    // Tokyo sönüm halkasına düşüp doğu-batı ×0.86 sıkışıyordu (ölçüldü).
    { lon: 125.5, lat: 37.5, a: 32, b: 28, m: 1.5 },
  ],
};

export const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * D2R));
export const millerLat = (y) => (2.5 * Math.atan(Math.exp(0.8 * y)) - 0.625 * Math.PI) / D2R;

/**
 * Mercek profili: normalize yarıçap ρ → ρ·s(ρ), s = 1 + (m−1)(1−ρ²)².
 * Türev en az 1 − 0.8(m−1): m < 2.25 iken her ışın boyunca tekdüze artar,
 * dönüşüm bire birdir; ρ = 1'de s = 1, mercek dışı kıpırdamaz.
 */
const lensScale = (rho, m) => 1 + (m - 1) * (1 - rho * rho) ** 2;
function lensInverseRho(target, m) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (mid * lensScale(mid, m) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Izgara çerçevesi. Piksel birimi hex dış yarıçapıdır (size = 1): oyunun
 * hexToPixel/pixelToHex dönüşümleriyle aynı uzay.
 */
export function earthFrame(cols = EARTH_GRID.cols, rows = EARTH_GRID.rows, grid = EARTH_GRID) {
  const { lon0, latTop } = grid;
  const W = (2 * Math.PI) / cols;
  const H = 1.5 * (W / SQRT3);
  const y0 = millerY(latTop) - H / 2;
  const period = cols * SQRT3;
  const wrapX = (x) => ((x % period) + period) % period;
  const baseX = (lon) => wrapX((((lon - lon0) * D2R) / W) * SQRT3);
  const baseY = (lat) => ((y0 - millerY(lat)) / H) * 1.5;
  const lenses = [];
  const warpWith = (list, x, y) => {
    for (const l of list) {
      let dx = x - l.cx;
      dx -= Math.round(dx / period) * period;
      const dy = y - l.cy;
      const rho = Math.hypot(dx / l.a, dy / l.b);
      if (rho >= 1 || rho === 0) continue;
      const s = lensScale(rho, l.m);
      x = wrapX(l.cx + dx * s);
      y = l.cy + dy * s;
    }
    return { x, y };
  };
  // Mercekler sırayla uygulanır; sonrakinin merkezi öncekilerin bükülmüş
  // uzayındadır, yoksa ikinci mercek kaymış haritada yanlış yere oturur.
  for (const l of grid.lenses ?? []) {
    const c = warpWith(lenses, baseX(l.lon), baseY(l.lat));
    lenses.push({ ...l, cx: c.x, cy: c.y });
  }
  const warp = (x, y) => warpWith(lenses, x, y);
  const unwarp = (x, y) => {
    for (let i = lenses.length - 1; i >= 0; i--) {
      const l = lenses[i];
      let dx = x - l.cx;
      dx -= Math.round(dx / period) * period;
      const dy = y - l.cy;
      const rho = Math.hypot(dx / l.a, dy / l.b);
      if (rho >= 1 || rho === 0) continue;
      const k = lensInverseRho(rho, l.m) / rho;
      x = wrapX(l.cx + dx * k);
      y = l.cy + dy * k;
    }
    return { x, y };
  };

  return {
    cols, rows, lon0, latTop, period,
    latBottom: millerLat(y0 - (rows - 0.5) * H),
    // Parçalar ayrı da açık: işleme betiği milyonlarca hücrede Miller'ı
    // satır/sütun başına bir kez hesaplar, yalnız merceği hücre başına uygular.
    baseX, baseY, warp, unwarp,
    /** Boylam/enlem → piksel (x sarmal [0, period)). */
    toPixel(lon, lat) {
      return warp(baseX(lon), baseY(lat));
    },
    /** Piksel → boylam/enlem (merceğin tersi + Miller'ın tersi). */
    lonLatAt(px, py) {
      const p = unwarp(wrapX(px), py);
      const lon = lon0 + ((p.x / SQRT3) * W) / D2R;
      return { lon: ((((lon + 180) % 360) + 360) % 360) - 180, lat: millerLat(y0 - (p.y / 1.5) * H) };
    },
    /** Boylam/enlem → kare indeksi; ızgara dışıysa −1. */
    tileOf(lon, lat) {
      const p = this.toPixel(lon, lat);
      return this.tileAtPixel(p.x, p.y);
    },
    tileAtPixel(px, py) {
      const { q, r } = pixelToHex(px, py, 1);
      if (r < 0 || r >= rows) return -1;
      const col = q + ((r - (r & 1)) >> 1);
      return r * cols + (((col % cols) + cols) % cols);
    },
    /** Kare merkezinin boylam/enlemi. */
    centerOf(col, row) {
      return this.lonLatAt(SQRT3 * (col + 0.5 * (row & 1)), 1.5 * row);
    },
  };
}
