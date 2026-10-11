// TAKVİM — oyunun tek zaman kaynağı.
//
// Bir tur bir haftadır; kampanya START_YEAR'ın 1 Ocak'ında başlar, END_YEAR
// yılının son haftasıyla biter. Eskiden "1836" yedi ayrı yerde elle yazılmıştı
// (HUD tarihi, kronik yılı, teknoloji takvimi, birim açılışı, teknoloji ekranı,
// ipuçları) ve çağ uzunluğu iki ayrı sabitteydi (3330 ve 3340 hafta). Dönem
// 1836-1900'den 1900-1945'e bu iki yılla taşındı.
//
// İki ayrı "yıl" bilerek var:
//   calendarYear  — ETİKET: gerçek takvim (artık yıllar dahil). HUD ve kronik.
//   yearOfTurn    — KURAL: 365 günlük sabit yıl. Teknolojinin erken araştırma
//                   cezası ve birim takvimi bunu okur; formülünü değiştirmek
//                   bütün teknoloji takvimini birkaç gün kaydırırdı.

export const START_YEAR = 1900;
/** Son oynanan yıl: "1900-1945" iki ucuyla birlikte. */
export const END_YEAR = 1945;
export const DAYS_PER_TURN = 7;
/** Çağın adı (ana menü, bitiş ekranı). */
export const ERA_NAME = 'The Age of Steel';

/**
 * Turun (ve hafta içindeki günün) tarihi, UTC. Tur 1 = START_YEAR-01-01.
 *
 * `day || (turn-1)*7` DEĞİL, ikisinin BÜYÜĞÜ: hafta sistemin adımı, gün
 * saatin adımı. Eski hali `day` sıfırdan farklı olunca tur sayacını devre dışı
 * bırakıyordu; `game.clock` kayda girmediği için yüklemeden sonra gün 0'dan,
 * tur 305'ten başlıyor ve oynat'a basılınca takvim 2 Ocak'a çöküyordu. Tur her
 * zaman bir TABAN verir; gün yalnız hafta içini ilerletir.
 */
export function dateOfTurn(turn, day = 0) {
  const date = new Date(Date.UTC(START_YEAR, 0, 1));
  date.setUTCDate(date.getUTCDate() + Math.max(0, day, (Math.max(1, turn ?? 1) - 1) * DAYS_PER_TURN));
  return date;
}

/** Etiket yılı: gerçek takvim. */
export function calendarYear(turn) {
  return dateOfTurn(turn).getUTCFullYear();
}

/** Kural yılı: 365 günlük sabit yıl (teknoloji ve birim takvimi). */
export function yearOfTurn(turn) {
  return START_YEAR + Math.floor((Math.max(1, turn ?? 1) - 1) * DAYS_PER_TURN / 365);
}

/** Kesirli kural yılı (teknoloji ağacındaki "bugün" çizgisi). */
export function exactYearOfTurn(turn) {
  return START_YEAR + ((Math.max(1, turn ?? 1) - 1) * DAYS_PER_TURN) / 365;
}

/**
 * Takvim yılının ilk turu: o yılın 1 Ocak'ı ya da onu izleyen ilk hafta.
 * Çağ kapıları (olay, birim) yılla yazılır, turla saklanır.
 */
export function turnOfYear(year) {
  const days = (Date.UTC(year, 0, 1) - Date.UTC(START_YEAR, 0, 1)) / 86400000;
  return 1 + Math.ceil(days / DAYS_PER_TURN);
}

/**
 * Kampanyanın tur sayısı: zafer END_YEAR'ın son haftasında ilan edilir
 * (hegemony.FINAL_TURN), bitiş ekranı "1900–1945" der. Eskiden elle 3340
 * yazılıydı; o tur 29 Aralık 1899'a düşüyordu. Çağ çarpanları (tüketim malı
 * beklentisi, milliyetçilik) 0'dan 1'e bu sürede yükselir.
 */
export const CAMPAIGN_TURNS = turnOfYear(END_YEAR + 1) - 1;

/** Çağın ilerleyişi 0..1: kampanya boyunca doğrusal. */
export function eraProgress(turn) {
  return Math.max(0, Math.min(1, (turn ?? 0) / CAMPAIGN_TURNS));
}
