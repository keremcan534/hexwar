// TİCARET — tek eşleşme, tek ödeme yolu.
//
// Kural basit: açığı olan ithal eder, fazlası olan ihraç eder.
//
//   yurt içi   = min(pazara çıkan üretim, talep)
//   açık       = talep − yurt içi          → ithalat teklifi
//   fazla      = pazara çıkan üretim − yurt içi → ihracat arzı
//   dünya hacmi= min(Σfazla, Σteklif)
//
// Teklifi ve arzı yalnız *stratejik olarak anlamlı* katsayılar kısar: gümrük
// (ithalat iştahı ve ihracat erişimi) ve savaş yükü. Yönlendirme/muhasebe
// katmanı yoktur; her mal için tek geçiş, tek tahsis.
//
// PARA: mal bedelini hane ve firmalar öder (sepet ve girdi maliyeti içinde).
// Hazineden geçen iki şey vardır — gümrük geliri ve NET dış dengenin kapanışı.
// Dünya toplamında Σithalat == Σihracat olduğu için kapanış para yaratmaz.
//
// Katman notu: içerik, piyasa ve bütçe dışında hiçbir şey içe aktarmaz.

import { GOOD_IDS } from './content.js';
import { priceOf } from './market.js';
import { settle } from './budget.js';

/**
 * Gümrüğün ithalat iştahını kısma katsayısı. %10 tarife iştahı ~%14, %50
 * tarife ~%44 düşürür. 0 olsaydı tarife yalnız bir vergi olurdu; korumacılığın
 * "koruyan" kısmı bu katsayıdır.
 */
export const IMPORT_ELASTICITY = 1.6;

/**
 * Yüksek gümrüğün İHRACAT bedeli: kapalı ekonomiden kimse mal almak istemez.
 * Bu katsayı olmadan %100 tarife ölçülmüş bir bedava paraydı.
 */
export const EXPORT_RETALIATION = 0.5;

/**
 * Savaşın ticarete bedeli: cephe uzadıkça hem alıcı hem satıcı olarak dünya
 * pazarından kopulur (ablukanın tek satırlık karşılığı). Tam yükte ticaretin
 * ~üçte biri kesilir.
 */
export const WAR_TRADE_PENALTY = 0.35;

/**
 * Net dış dengenin hazineden geçen oranı. Devlet, ülkenin dış pozisyonunun
 * artık finansörüdür. Para yaratmaz/yok etmez: dünya ticareti sıfır toplamlı
 * olduğu için (Σithalat == Σihracat) her oranda toplam sıfırdır.
 */
export const EXTERNAL_SETTLEMENT = 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const emptySummary = () => ({
  imports: 0, exports: 0, importValue: 0, exportValue: 0,
  balance: 0, tariffRevenue: 0, settlement: 0, lastUpdated: 0,
});

export function ensureTradeSummary(nation) {
  const trade = nation.economy.trade ??= emptySummary();
  const defaults = emptySummary();
  for (const key in defaults) trade[key] ??= defaults[key];
  return trade;
}

function resetSummary(nation) {
  const trade = ensureTradeSummary(nation);
  trade.imports = 0;
  trade.exports = 0;
  trade.importValue = 0;
  trade.exportValue = 0;
  trade.balance = 0;
  trade.tariffRevenue = 0;
  trade.settlement = 0;
  return trade;
}

// Mal başına ülke sütunları; ömrü tur boyuncadır (haftada binlerce kısa
// ömürlü kayıt kurmamak için geri kullanılır).
let domesticCol = new Float64Array(0);
let surplusCol = new Float64Array(0);
let bidCol = new Float64Array(0);
let weightCol = new Float64Array(0);
let allocCol = new Float64Array(0);

function ensureColumns(count) {
  if (domesticCol.length >= count) return;
  domesticCol = new Float64Array(count);
  surplusCol = new Float64Array(count);
  bidCol = new Float64Array(count);
  weightCol = new Float64Array(count);
  allocCol = new Float64Array(count);
}

export function settleGlobalTrade(world) {
  const nations = world.nations.filter((nation) => nation.alive && nation.economy);
  const count = nations.length;
  ensureColumns(count);
  for (const nation of nations) resetSummary(nation);
  const priority = world.market.hasPriority === true;

  for (let g = 0; g < GOOD_IDS.length; g++) {
    const id = GOOD_IDS[g];
    let totalSurplus = 0;
    let totalBid = 0;
    let totalWeight = 0;

    for (let i = 0; i < count; i++) {
      const economy = nations[i].economy;
      const flow = economy.goodsFlow[id];
      const marketable = Math.max(0, flow.production - flow.retained);
      const domestic = Math.min(marketable, flow.demand);
      const tariff = (economy.tariff ?? 0) / 100;
      const war = clamp(economy.warStrain ?? 0, 0, 1) * WAR_TRADE_PENALTY;
      // Payda 0.05'in altına inemez: formül aşırı negatif tarifede sonsuza gider.
      const appetite = (1 - war) / Math.max(0.05, 1 + tariff * IMPORT_ELASTICITY);
      const access = (1 - war) / (1 + Math.max(0, tariff) * EXPORT_RETALIATION);
      domesticCol[i] = domestic;
      surplusCol[i] = Math.max(0, marketable - domestic) * access;
      bidCol[i] = Math.max(0, flow.demand - domestic) * appetite;
      // Yabancı şirkette hissesi olan ülke o malda sırada öne geçer. AYNI
      // hacmin yeniden dağıtımıdır: tek gram mal yaratılmaz.
      weightCol[i] = priority
        ? bidCol[i] * (1 + (economy.priorityAccess?.[id] ?? 0))
        : bidCol[i];
      totalSurplus += surplusCol[i];
      totalBid += bidCol[i];
      totalWeight += weightCol[i];
    }

    const volume = Math.min(totalSurplus, totalBid);

    // TAHSİS. Ağırlıklı pay kendi talebini aşamaz; kırpılan artık hâlâ açığı
    // olanlara boşlukları oranında dağıtılır. İki adım, Σtahsis === volume.
    if (volume > 0 && totalWeight > 0) {
      let allocated = 0;
      for (let i = 0; i < count; i++) {
        const raw = weightCol[i] * volume / totalWeight;
        allocCol[i] = raw < bidCol[i] ? raw : bidCol[i];
        allocated += allocCol[i];
      }
      let leftover = volume - allocated;
      if (leftover > 1e-12) {
        let headroom = 0;
        for (let i = 0; i < count; i++) headroom += bidCol[i] - allocCol[i];
        if (headroom > 1e-12) {
          if (leftover > headroom) leftover = headroom;
          for (let i = 0; i < count; i++) {
            allocCol[i] += leftover * (bidCol[i] - allocCol[i]) / headroom;
          }
        }
      }
    } else for (let i = 0; i < count; i++) allocCol[i] = 0;

    const price = priceOf(world, id);
    for (let i = 0; i < count; i++) {
      const economy = nations[i].economy;
      const flow = economy.goodsFlow[id];
      flow.domestic = domesticCol[i];
      flow.exports = totalSurplus > 0 ? surplusCol[i] * volume / totalSurplus : 0;
      flow.imports = allocCol[i];
      flow.fulfilled = Math.min(flow.demand, flow.domestic + flow.imports);
      flow.shortage = Math.max(0, flow.demand - flow.fulfilled);
      flow.importShare = flow.demand > 0 ? clamp(flow.imports / flow.demand, 0, 1) : 0;
      flow.fulfilledShare = flow.demand > 0 ? clamp(flow.fulfilled / flow.demand, 0, 1) : 1;
      const trade = economy.trade;
      trade.imports += flow.imports;
      trade.exports += flow.exports;
      trade.importValue += flow.imports * price;
      trade.exportValue += flow.exports * price;
    }
  }

  // ÖDEME — tek yol, iki satır.
  for (const nation of nations) {
    const economy = nation.economy;
    const trade = economy.trade;
    trade.balance = trade.exportValue - trade.importValue;
    trade.tariffRevenue = trade.importValue * ((economy.tariff ?? 0) / 100);
    trade.settlement = trade.balance * EXTERNAL_SETTLEMENT;
    trade.lastUpdated = world.turn;
    // Gümrük İŞARETLİ geçer: eksi tarife bir ithalat sübvansiyonudur ve
    // hazineden ödenir (bkz. econ/budget.js SIGNED_KEYS).
    settle(nation, 'tariffRevenue', trade.tariffRevenue);
    settle(nation, 'externalSettlement', trade.settlement);
  }
}

/** Ticaretin dökümü — ekranın ve raporun okuduğu açıklama. */
export function tradeBreakdown(nation) {
  const trade = nation?.economy?.trade ?? emptySummary();
  return {
    importValue: trade.importValue,
    exportValue: trade.exportValue,
    balance: trade.balance,
    tariff: nation?.economy?.tariff ?? 0,
    tariffRevenue: trade.tariffRevenue,
    settlement: trade.settlement,
  };
}
