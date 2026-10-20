/**
 * FON DEFTERİ — kalkınma fonunun (eski hazine) tek geçiş noktası. Birim IC.
 *
 * Onceki mimaride 27 ayri cagri yeri `nation.gold`u dogrudan oynatiyor, sonra
 * ayri bir `economy.*Gold` cizik alanina tutar yaziyordu; `updateLedger` haftada
 * bir bu alanlari toplayip defteri YENIDEN KURUYORDU. Kurulum ile gercek
 * arasindaki her kopukluk sessiz bir muhasebe hatasiydi: iade eden iki yol
 * (cancelTraining, dropInvalidProjects) karsi kaydi hic yazmiyor, eski
 * ADMINISTRATION binasi donusumu (construction.js) hazineye defterSIZ para
 * ekliyordu.
 *
 * Burada tek kural var: PARA HAREKETI ILE DEFTER KAYDI AYNI ISLEMDIR.
 * `settle()` disinda hazineye dokunan kod yoktur; dokunursa defter tutmaz ve
 * `closeWeek` bunu yakalar.
 *
 * Bu dosya baska hicbir oyun modulunu import ETMEZ — cevrim riski yok, Node'da
 * tek basina test edilebilir.
 */

/**
 * Defter kalemleri. `kind` yalnizca SUNUM icindir (gelir mi gider mi diye
 * gosterilecek); isaret her zaman tutarin kendisinden gelir, cunku birkac kalem
 * iki yone de akar: gumruk negatif olabilir (ithalat subvansiyonu), anlasma
 * hem tazminat oder hem alir, hisse hem satar hem alir.
 */
export const LEDGER_LINES = {
  // TEK ÇUBUK (2026-10-15): stok artık KALKINMA FONUDUR (IC). Altın, vergi,
  // borç, enflasyon ve bina bakımı yoktur; faturalar (ikmal, okul,
  // sıkıyönetim) çıktının önünden düşer ve bu deftere girmez (econ/bills.js).
  investment: { kind: 'income', label: 'Invested output' },
  exports: { kind: 'income', label: 'Exports' },
  // Haraç ve tazminat iki yöne akar: alan için gelir, ödeyen için gider.
  treaty: { kind: 'income', label: 'Tribute & reparations' },
  // Tek seferlik kazanç (bereketli hasat, motor patlaması).
  grant: { kind: 'income', label: 'Windfalls' },

  imports: { kind: 'expense', label: 'Imports' },
  // Fondan alınan kalkınma kademeleri.
  development: { kind: 'expense', label: 'Development' },
  // Generaller, iskân, olay seçenekleri, gündem: tek seferlik devlet harcaması.
  outlay: { kind: 'expense', label: 'State purchases' },
};

export const LEDGER_LINE_IDS = Object.keys(LEDGER_LINES);

function emptyWeek() {
  const week = {};
  for (const id of LEDGER_LINE_IDS) week[id] = 0;
  return week;
}

/** Haftalik toplayici. Yoksa kurar; `openWeek` disinda SIFIRLAMAZ. */
export function ledgerWeekOf(nation) {
  const economy = nation?.economy;
  if (!economy) return null;
  if (!economy.ledgerWeek) economy.ledgerWeek = emptyWeek();
  else for (const id of LEDGER_LINE_IDS) economy.ledgerWeek[id] ??= 0;
  return economy.ledgerWeek;
}

/**
 * Haftayi acar: toplayiciyi sifirlar ve acilis hazinesini isaretler. Kapanista
 * `Δhazine === Σ islem` kimligi bu isaretle dogrulanir.
 */
export function openWeek(nation) {
  if (!nation?.economy) return;
  nation.economy.ledgerWeek = emptyWeek();
  nation.economy.ledgerOpenFund = nation.fund ?? 0;
}

/**
 * TEK PARA HAREKETI. Pozitif tutar hazineye girer, negatif cikar.
 *
 * @param {object} nation
 * @param {string} line  LEDGER_LINES anahtari
 * @param {number} amount  isaretli tutar
 * @returns {number} fiilen islenen tutar (gecersiz girdi 0 doner)
 */
export function settle(nation, line, amount) {
  if (!nation || !Number.isFinite(amount) || amount === 0) return 0;
  if (!LEDGER_LINES[line]) {
    // Sessiz yutma yok: tanimsiz kalem bir programlama hatasidir ve para
    // kaybolmasindansa gurultu yapmasi yeglenir.
    throw new Error(`settle(): unknown ledger line "${line}"`);
  }
  nation.fund = (nation.fund ?? 0) + amount;
  const week = ledgerWeekOf(nation);
  if (week) week[line] += amount;
  return amount;
}

/**
 * Haftayi kapatir ve defteri YAZAR — yeniden kurmaz, yalnizca toplar.
 *
 * gelir  = kalemlerin pozitif kismi (finansman haric)
 * gider  = kalemlerin negatif kismi (finansman haric)
 * net    = gelir - gider
 * delta  = butun islemlerin toplami (finansman DAHIL) = Δhazine
 */
export function closeWeek(nation, turn) {
  const economy = nation?.economy;
  if (!economy) return null;
  const week = ledgerWeekOf(nation);
  const lines = {};
  let income = 0;
  let expenses = 0;
  let financing = 0;
  for (const id of LEDGER_LINE_IDS) {
    const value = week[id] ?? 0;
    lines[id] = value;
    if (LEDGER_LINES[id].kind === 'financing') financing += value;
    else if (value >= 0) income += value;
    else expenses += -value;
  }
  const net = income - expenses;
  const delta = net + financing;

  // KIMLIK DENETIMI. Hazineye settle() disindan dokunulduysa burada yakalanir.
  const opened = economy.ledgerOpenFund;
  const drift = Number.isFinite(opened) ? (nation.fund ?? 0) - opened - delta : 0;

  economy.ledger = {
    lastUpdated: turn,
    ...lines,
    income,
    expenses,
    net,
    financing,
    delta,
    // Sifirdan farkliysa bir yerde kayitsiz para hareketi var demektir.
    unreconciled: Math.abs(drift) < 1e-6 ? 0 : drift,
  };

  // 52 haftalık fon izi: ekonomi ekranındaki grafik buradan çizilir.
  economy.fundHistory ??= [];
  economy.fundHistory.push(Number((nation.fund ?? 0).toFixed(1)));
  if (economy.fundHistory.length > 52) economy.fundHistory.shift();

  // Yeni hafta HEMEN acilir. Tur disinda yapilan alimlar (oyuncu duraklatmisken
  // birim satin alir) boylece bir sonraki kapanisin defterine duser; acilis
  // `produce()`a birakilsaydi o harcamalar hicbir haftaya yazilmazdi.
  openWeek(nation);
  return economy.ledger;
}

/** Bos defter: ekranin ve YZ'nin ilk hafta okuyabilecegi guvenli taban. */
export function emptyLedger() {
  return {
    lastUpdated: 0,
    ...emptyWeek(),
    income: 0,
    expenses: 0,
    net: 0,
    financing: 0,
    delta: 0,
    unreconciled: 0,
  };
}

/**
 * TEK BAKIYE TANIMI. Ekranin her yeri, YZ ve denetimler bunu okur.
 * Gecen haftanin KAPANMIS bakiyesidir; tahmin degildir.
 */
export function weeklyBalance(nation) {
  return nation?.economy?.ledger?.net ?? 0;
}
