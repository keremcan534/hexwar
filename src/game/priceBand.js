// Fiyat bandı — iki sayı ve bandın içindeki yer; hiçbir şey import etmez.
//
// Dünya fiyatı taban fiyatın PRICE_FLOOR…PRICE_CEILING katında kalır. Eski
// bant 0.12–8 idi ve malların yarısı iki uçtan birine çakılı yaşıyordu
// (2026-08-22: 520. haftada 42 malın 24'ü); 8 kat fiyattaki likör alt sınıf
// sepetinin %77.8'ini yiyordu. Bant ±%50'ye daraldı (Kerem: "dünya
// çökmesin"). Kıtlık ve bolluk artık fiyatın büyüklüğünden çok miktardan
// okunur: rafta olmayan mal alınamaz, satılamayan fazla pazarda kaybolur.
//
// Dosya ayrı durmak zorunda: `economy.js` `provinces.js`i import ediyor ve arz
// tepkisi (provinces.js) de bandı bilmek zorunda; sabiti ikisinden birine
// koymak modül döngüsü yaratırdı.
//
// Bağlı olanlar: economy.updatePrices (kırpma), provinces.rgoPriceDrive ve
// updateDemandScale (arz tepkisi bant içindeki yeri okur), tradeLedger
// (tavan/taban etiketi), denetim betikleri (çakılı mal sayımı).
export const PRICE_FLOOR = 0.5;
export const PRICE_CEILING = 1.5;

/**
 * Fiyatın bandın içindeki yeri: tabanda −1, taban fiyatta 0, tavanda +1.
 * Arz tepkisi ham oranı değil bunu okur: bant daraldıkça "çakılı mal" oranın
 * kendisinde 0.5'e karşılık gelir ve eski eşikler (0.25'te tam fren, 2.5'te
 * tam gaz) bir daha hiç tetiklenmezdi.
 */
export function bandPosition(ratio) {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 1) return Math.max(-1, (ratio - 1) / (1 - PRICE_FLOOR));
  return Math.min(1, (ratio - 1) / (PRICE_CEILING - 1));
}
