// ORTAK BİRİM — TEK ÇUBUK (2026-10-15): ekonominin tek birimi IC'dir.
//
// Altın kalktı (Kerem: "sadece IC ile devam ederiz"): çıktı, faturalar,
// kalkınma fonu, ticaret ve tek seferlik alımlar hep aynı birimle yazılır.
// Birim TEK yerden yazılır: oyun katmanının cümleleri (günlük, engel, olay
// kartı) ve arayüz (kit.js yeniden dışa aktarır) aynı biçimi okur. Fonksiyon
// adları (`money`, `signedMoney`) eski çağıranlar için korunur.

export const CURRENCY = { symbol: '', unit: 'IC', name: 'industrial capacity', label: 'Development fund' };

/** Değer: `money(12.34)` → "12.3 IC", `money(-5, 0)` → "−5 IC". */
export function money(value, digits = 1) {
  const n = Number(value) || 0;
  return `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)} ${CURRENCY.unit}`;
}

/** İşaretli değer (defter satırı): "+12.3 IC" / "−4.0 IC". */
export function signedMoney(value, digits = 1) {
  const n = Number(value) || 0;
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(digits)} ${CURRENCY.unit}`;
}
