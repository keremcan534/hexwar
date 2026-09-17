// "Bu hafta neyi ne oynatti": ust cubuktaki GSYH, hazine ve istikrar icin
// haftalik fark dokumu.
//
// Kaynak, economy.recordPulse'un tuttugu iki haftalik pencere. Burada hicbir
// simulasyon formulu yeniden kurulmaz; yalniz farklar alinir ve fiyat/hacim
// ayrimi icin reel GSYH kullanilir:
//   hacim etkisi = Δreel × (nominal/reel gecen hafta)   — gecen haftanin fiyatlariyla
//   fiyat etkisi = Δnominal − hacim etkisi
// Mal bazli fiyat hareketi ise ulkenin bu haftaki uretimi × (fiyat − onceki
// fiyat): ikisi de zaten kayitli alanlar (goodsFlow.production, previousPrice).
//
// Katman: game. DOM yok.

import { CLASS_INFO, GOODS, priceOf } from './economy.js';
import { LEDGER_LINES } from './treasury.js';

/** Nabiz penceresi; iki hafta yoksa null (ilk haftada anlatacak fark yok). */
export function pulseWindow(nation) {
  const pulse = nation?.economy?.pulse;
  if (!pulse?.cur || !pulse?.prev) return null;
  return pulse;
}

/** Ulkenin urettigi mallarda bu haftaki fiyat hareketinin degeri, buyukten kucuge. */
export function priceMovers(world, nation, limit = 3) {
  const flows = nation?.economy?.goodsFlow ?? {};
  const rows = [];
  for (const [id, flow] of Object.entries(flows)) {
    const production = flow?.production ?? 0;
    if (production <= 0.01) continue;
    const state = world.market?.goods?.[id];
    if (!state) continue;
    const price = priceOf(world, id);
    const previous = state.previousPrice ?? price;
    const value = (price - previous) * production;
    if (Math.abs(value) < 0.05) continue;
    rows.push({
      id, name: GOODS[id]?.name ?? id, icon: GOODS[id]?.icon ?? '',
      price, previous, production, value,
    });
  }
  return rows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
}

/** GSYH: toplam fark, fiyat/hacim ayrimi, RGO ve sanayi paylari, mal hareketleri. */
export function gdpAttribution(world, nation) {
  const pulse = pulseWindow(nation);
  if (!pulse) return null;
  const { prev, cur } = pulse;
  const delta = cur.gdp - prev.gdp;
  const level = prev.realGdp > 0 ? prev.gdp / prev.realGdp : 1;
  const volume = (cur.realGdp - prev.realGdp) * level;
  const price = delta - volume;
  return {
    now: cur.gdp,
    delta,
    price,
    volume,
    rgo: { now: cur.rgo, delta: cur.rgo - prev.rgo },
    industry: { now: cur.industry, delta: cur.industry - prev.industry },
    movers: priceMovers(world, nation),
  };
}

/** Hazine dengesi: net fark ve en cok oynayan defter satirlari. */
export function balanceAttribution(nation, limit = 4) {
  const pulse = pulseWindow(nation);
  if (!pulse) return null;
  const { prev, cur } = pulse;
  const lines = Object.keys(LEDGER_LINES)
    .filter((id) => LEDGER_LINES[id].kind !== 'financing')
    .map((id) => ({
      id,
      label: LEDGER_LINES[id].label,
      now: cur.ledger[id] ?? 0,
      delta: (cur.ledger[id] ?? 0) - (prev.ledger[id] ?? 0),
    }))
    .filter((row) => Math.abs(row.delta) >= 0.05)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
  return {
    now: cur.ledger.net,
    delta: cur.ledger.net - prev.ledger.net,
    income: { now: cur.ledger.income, delta: cur.ledger.income - prev.ledger.income },
    expenses: { now: cur.ledger.expenses, delta: cur.ledger.expenses - prev.ledger.expenses },
    lines,
  };
}

/** Istikrar: toplam fark ve dort bilesenin farklari (hepsi toplanabilir). */
export function stabilityAttribution(nation) {
  const pulse = pulseWindow(nation);
  if (!pulse) return null;
  const { prev, cur } = pulse;
  const part = (key, label) => ({ key, label, delta: (cur.stability[key] ?? 0) - (prev.stability[key] ?? 0) });
  return {
    now: cur.stability.total,
    delta: cur.stability.total - prev.stability.total,
    parts: [
      part('base', 'Household satisfaction'),
      part('occupation', 'Occupied territory'),
      part('war', 'War exhaustion'),
      part('unemployment', 'Unemployment'),
    ].filter((row) => Math.abs(row.delta) >= 0.0005),
  };
}

/** Sinif gelirleri: bu hafta / gecen hafta. Butce ekraninin vergi kartlari okur. */
export function classIncomeAttribution(nation) {
  const pulse = pulseWindow(nation);
  if (!pulse) return null;
  const { prev, cur } = pulse;
  const out = {};
  for (const id of Object.keys(CLASS_INFO)) {
    out[id] = {
      now: cur.classes[id]?.income ?? 0,
      delta: (cur.classes[id]?.income ?? 0) - (prev.classes[id]?.income ?? 0),
      needsMet: cur.classes[id]?.needsMet ?? 0,
      needsDelta: (cur.classes[id]?.needsMet ?? 0) - (prev.classes[id]?.needsMet ?? 0),
    };
  }
  return out;
}

/** Nufus: haftalik buyume ve sepet karsilanmasi (popHistory'nin son iki satiri). */
export function populationAttribution(nation) {
  const history = nation?.economy?.popHistory ?? [];
  if (history.length < 2) return null;
  const prev = history[history.length - 2];
  const cur = history[history.length - 1];
  return {
    now: cur.pop,
    delta: cur.pop - prev.pop,
    needs: cur.needs,
    needsDelta: cur.needs - prev.needs,
    literacy: cur.lit,
    literacyDelta: cur.lit - prev.lit,
  };
}
