// HAZİNE — tek defter, tek kapanış.
//
// `nation.gold`u yazan TEK yer burasıdır. Her hareket bir kategoriye düşer;
// hafta sonunda defter o kategorilerin toplamıdır. Yani kimlik
//
//     Δhazine = Σgelir − Σgider + borçlanılan − ödenen + temerrüt
//
// yeniden hesaplanarak *doğrulanmaz*, yapı gereği **doğrudur**: defteri
// oluşturan hareketlerle hazineyi değiştiren hareketler aynı çağrılardır.
//
// Eski model altını 20 ayrı yerde değiştiriyor, `updateLedger` de bu
// hareketleri 19 ayrı biriktiriciden geri kurmaya çalışıyordu; yeni bir gider
// eklerken iki yere birden yazmayı unutmak kimliği sessizce kaydırıyordu.
//
// Katman notu: hiçbir şey içe aktarmaz. DOM bilmez, Node'da sınanabilir.

/** Gelir kalemleri — ekran bu adları okuyor, bilerek korundu. */
export const REVENUE_KEYS = [
  'cityRevenue', 'taxRevenue', 'tariffRevenue', 'treatyRevenue',
  'dividendRevenue', 'shareRevenue',
];

/** Gider kalemleri. */
export const EXPENSE_KEYS = [
  'armyCost', 'administrationCost', 'socialCost', 'importCost', 'constructionCost',
  'treatyCost', 'outlayCost', 'procurementCost', 'subsidyCost', 'projectCost',
  'interestCost', 'shareCost',
];

/**
 * Dış hesabın kapanışı işaretlidir: fazla gelirdir, açık giderdir. Tek satır
 * olarak durur çünkü oyuncunun görmesi gereken şey gayrisafi ithalat/ihracat
 * değil, ülkenin dış pozisyonunun hazineye ne yaptığıdır.
 */
const SIGNED_KEYS = ['externalSettlement'];

const ALL_KEYS = [...REVENUE_KEYS, ...EXPENSE_KEYS, ...SIGNED_KEYS];

export function emptyBook() {
  const book = {};
  for (const key of ALL_KEYS) book[key] = 0;
  book.borrowed = 0;
  book.repaid = 0;
  book.defaulted = 0;
  return book;
}

export function ensureBook(nation) {
  const economy = nation.economy;
  if (!economy.book) economy.book = emptyBook();
  else for (const key of ALL_KEYS) economy.book[key] ??= 0;
  return economy.book;
}

/** Haftanın başında sayaçlar sıfırlanır: her defter yalnız kendi haftasını gösterir. */
export function resetBook(nation) {
  const book = ensureBook(nation);
  for (const key of ALL_KEYS) book[key] = 0;
  book.borrowed = 0;
  book.repaid = 0;
  book.defaulted = 0;
  return book;
}

const finite = (value) => (Number.isFinite(value) ? value : 0);

/** Hazineye para girer. `amount` pozitif olmalı. */
export function earn(nation, key, amount) {
  const value = finite(amount);
  if (value <= 0 || !nation?.economy) return 0;
  ensureBook(nation)[key] += value;
  nation.gold += value;
  return value;
}

/** Hazineden para çıkar. `amount` pozitif olmalı. Hazine eksiye düşebilir —
 * kelepçe yok, açığı kapanışta borçlanma devralır (bkz. settleDebt). */
export function spend(nation, key, amount) {
  const value = finite(amount);
  if (value <= 0 || !nation?.economy) return 0;
  ensureBook(nation)[key] += value;
  nation.gold -= value;
  return value;
}

/**
 * Geri ödeme: iptal edilen proje, dağıtılan birim. Gideri AZALTIR — ayrı bir
 * gelir satırı açmak "100 harcadım, 20'sini geri aldım" hikâyesini bozar.
 */
export function refund(nation, key, amount) {
  const value = finite(amount);
  if (value <= 0 || !nation?.economy) return 0;
  ensureBook(nation)[key] -= value;
  nation.gold += value;
  return value;
}

/** İşaretli kalem (dış hesap kapanışı): artı gelir, eksi giderdir. */
export function settle(nation, key, amount) {
  const value = finite(amount);
  if (value === 0 || !nation?.economy) return 0;
  ensureBook(nation)[key] += value;
  nation.gold += value;
  return value;
}

/** Borçlanma ve geri ödeme gelir/gider DEĞİLDİR: bilanço hareketidir. */
export function borrow(nation, amount) {
  const value = finite(amount);
  if (value <= 0) return 0;
  ensureBook(nation).borrowed += value;
  nation.gold += value;
  nation.debt = (nation.debt ?? 0) + value;
  return value;
}

export function repay(nation, amount) {
  const value = finite(amount);
  if (value <= 0) return 0;
  ensureBook(nation).repaid += value;
  nation.gold -= value;
  nation.debt = Math.max(0, (nation.debt ?? 0) - value);
  return value;
}

/** Ödenemeyen açık: hazine sıfırlanır, fark beyan edilir (kayıp para değil). */
export function declareDefault(nation, amount) {
  const value = finite(amount);
  if (value <= 0) return 0;
  ensureBook(nation).defaulted += value;
  nation.gold += value;
  return value;
}

/**
 * Haftanın kapanışı. Defter kategorilerin toplamıdır; hiçbir kalem burada
 * yeniden hesaplanmaz.
 */
export function closeTreasury(nation, turn) {
  const economy = nation.economy;
  const book = ensureBook(nation);
  const settlement = book.externalSettlement;
  let income = 0;
  for (const key of REVENUE_KEYS) income += book[key];
  income += Math.max(0, settlement);
  let expenses = 0;
  for (const key of EXPENSE_KEYS) expenses += book[key];
  expenses += Math.max(0, -settlement);

  const ledger = economy.ledger ?? (economy.ledger = {});
  ledger.lastUpdated = turn;
  for (const key of ALL_KEYS) ledger[key] = book[key];
  ledger.borrowed = book.borrowed;
  ledger.repaid = book.repaid;
  ledger.defaulted = book.defaulted;
  ledger.creditPenalty = economy.creditPenalty ?? 0;
  ledger.debt = nation.debt ?? 0;
  ledger.income = income;
  ledger.expenses = expenses;
  ledger.net = income - expenses;

  // Kapanıştan SONRA sıfırlanır: bu andan sonraki her hareket (inşaat, savaş,
  // sonraki haftanın YZ alımları) bir sonraki deftere yazılır ve hiçbir altın
  // hareketi kayıtsız kalmaz.
  for (const key of ALL_KEYS) book[key] = 0;
  book.borrowed = 0;
  book.repaid = 0;
  book.defaulted = 0;

  // 52 haftalık hazine izi: bütçe ekranındaki grafik buradan çizilir.
  economy.treasuryHistory ??= [];
  economy.treasuryHistory.push(Number(nation.gold.toFixed(1)));
  if (economy.treasuryHistory.length > 52) economy.treasuryHistory.shift();
  return ledger;
}

/**
 * Bir kalemin haftalık dökümü — ekranın ve raporun okuduğu açıklama.
 * Sıra defterdeki sırayla aynıdır ki oyuncu satırı kolayca bulsun.
 */
export function ledgerBreakdown(nation) {
  const ledger = nation?.economy?.ledger ?? {};
  const rows = [];
  for (const key of REVENUE_KEYS) {
    if (ledger[key]) rows.push({ key, kind: 'revenue', amount: ledger[key] });
  }
  const settlement = ledger.externalSettlement ?? 0;
  if (settlement) {
    rows.push({ key: 'externalSettlement', kind: settlement >= 0 ? 'revenue' : 'expense', amount: settlement });
  }
  for (const key of EXPENSE_KEYS) {
    if (ledger[key]) rows.push({ key, kind: 'expense', amount: -ledger[key] });
  }
  return rows;
}
