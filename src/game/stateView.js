// STATE GÖRÜNÜMÜ — sol alttaki province kartının sayıları (DOM yok).
//
// Kart eskiden "Timber ×1.5", "Fertility 72%", "Unrest 4.2" gibi çıplak
// değerler basıyordu; oyuncu ne demek olduklarını ve state'in kendisine ne
// kazandırdığını göremiyordu (Kerem, 2026-10-14). Buradaki her sayı oyunun
// KENDİ formülünden okunur — ayrı bir tahmin formülü yazılmaz:
//   çıktı        → econ/output.provinceOutputOf (el + sanayi, ulusal çarpanlarla)
//   mal/gıda     → econ/resources.outputBreakdown (provinceOutput'un dökümü)
//   kalkınma     → econ/investment.levelCost / levelGain
//   kültür       → culture.projectCultureWeek (haftalık kaymanın önizlemesi)

import { provinceOutputOf } from './econ/output.js';
import { developmentCap, levelCost, levelGain } from './econ/investment.js';
import { outputBreakdown } from './econ/resources.js';
import { priceOf } from './econ/trade.js';
import { isAccepted, projectCultureWeek } from './culture.js';

/** Bir ay kaç hafta: takvim haftalık işler, kart "aylık" değişim söyler. */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * State'in sahibine haftalık getirisi. Çıktı (el + sanayi) çubuğa girer;
 * mallar dünya fiyatıyla DEĞERDİR (ihraç edilirse fona, içeride kullanılırsa
 * ithalattan kaçınılan IC) — ikisi ayrı satır, toplanmaz.
 */
export function stateYield(world, province) {
  const econ = province?.econ;
  const nation = world.nations?.[province?.owner];
  if (!econ || !nation) return null;
  const made = provinceOutputOf(province, nation);
  const out = outputBreakdown(province, nation);
  const goods = out.deposits
    .filter((row) => row.total > 0)
    .map((row) => ({ id: row.id, amount: row.total, price: priceOf(world, row.id), value: row.total * priceOf(world, row.id) }));
  const goodsValue = goods.reduce((sum, row) => sum + row.value, 0);
  const cap = developmentCap(nation);
  const next = (econ.development ?? 1) < cap ? {
    level: (econ.development ?? 1) + 1,
    cost: levelCost(province),
    gain: levelGain(world, nation, province),
  } : null;
  return {
    nationId: nation.id,
    hand: made.hand, industry: made.industry, total: made.total,
    development: econ.development ?? 1, cap, next,
    goods, goodsValue,
    food: out.food,
    output: out,
  };
}

/**
 * State'teki halklar: pay, kabul durumu ve AYLIK değişim (oyunun haftalık
 * kayma formülünün önizlemesi; asimilasyon, asimilasyon odağı, zorla
 * asimilasyon). Göç ve sürgün gibi tek seferlik olaylar dahil değildir.
 */
export function stateCultures(world, province) {
  const nation = world.nations?.[province?.owner];
  const rows = province?.cultures?.length ? province.cultures : (province?.culture >= 0 ? [{ id: province.culture, share: 1 }] : []);
  if (!rows.length) return [];
  const next = nation ? projectCultureWeek(world, province, nation) : null;
  const after = new Map((next ?? []).map((row) => [row.id, row.share]));
  return rows.map((row) => {
    const culture = world.cultures?.[row.id];
    const weekly = next ? (after.get(row.id) ?? 0) - row.share : 0;
    return {
      id: row.id,
      name: culture?.name ?? '?',
      color: culture?.color ?? '#888',
      share: row.share,
      monthly: weekly * WEEKS_PER_MONTH,
      primary: nation ? row.id === nation.culture : false,
      accepted: nation ? isAccepted(nation, row.id) : false,
      homeland: row.id === province.homeland,
    };
  });
}
