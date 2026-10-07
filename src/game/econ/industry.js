// SANAYİ — IC, tüketim malı ve askerî üretim hatları (TASARIM.md §5).
//
// Tek kavram, iki kullanım: fabrikalar IC verir; ekonomi yasası IC'nin ne
// kadarının orduya gideceğini söyler. Sivil pay halkın TÜKETİM MALIDIR (eksikse
// istikrar düşer, fazlası vergiyi artırır), askerî pay üretim hatlarına akar.
// HOI4'ün asıl ikilemi budur: topyekûn savaş orduyu doyurur, halkı aç bırakır.

import {
  COAL_PER_IC, CONSUMER_ERA_GROWTH, CONSUMER_NEED, COTTAGE_OUTPUT,
  COTTAGE_PER_DEVELOPMENT, DOCKYARD_IC, EQUIPMENT, EQUIPMENT_IDS, ERA_TURNS, FACTORY_IC,
  LINE_EFFICIENCY,
} from './defs.js';
import { lawOption } from '../laws.js';
import { mod } from '../modifiers.js';
import { resourceRatio } from './resources.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Varsayılan hat ağırlıkları: tüfek önce, top sonra, gemi tersane varsa. */
const DEFAULT_WEIGHTS = { rifles: 3, guns: 1, ships: 1 };

export function ensureIndustry(economy) {
  economy.stock ??= {};
  for (const id of EQUIPMENT_IDS) {
    if (!Number.isFinite(economy.stock[id])) economy.stock[id] = 0;
  }
  economy.lines ??= {};
  for (const id of EQUIPMENT_IDS) {
    const line = economy.lines[id] ?? {};
    economy.lines[id] = {
      weight: Number.isFinite(line.weight) ? clamp(line.weight, 0, 10) : DEFAULT_WEIGHTS[id],
      efficiency: Number.isFinite(line.efficiency) ? line.efficiency : LINE_EFFICIENCY.start,
      ic: line.ic ?? 0,
      output: line.output ?? 0,
      limit: line.limit ?? 1,
    };
  }
  economy.ic ??= { raw: 0, total: 0, civil: 0, military: 0 };
  economy.consumer ??= { need: 0, cottage: 0, civil: 0, supply: 0, ratio: 1 };
  return economy;
}

/** Hat ağırlığını oyuncu/YZ değiştirir (0-10). Verim korunur. */
export function setLineWeight(nation, id, weight) {
  const economy = nation?.economy;
  if (!economy || !EQUIPMENT[id]) return false;
  ensureIndustry(economy);
  economy.lines[id].weight = clamp(Math.round(weight), 0, 10);
  return true;
}

/**
 * Ulusun bu haftaki IC'si. `raw` fabrika kademesi × statü; çarpanlar kömür
 * (geçen haftanın oranı), istikrar, askerlik yasası ve teknoloji.
 */
export function computeIC(world, nation) {
  let raw = 0;
  let dockyards = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const status = province.econ.status ?? 1;
    raw += (province.econ.buildings?.factory ?? 0) * FACTORY_IC * status;
    dockyards += (province.econ.buildings?.dockyard ?? 0) * status;
  }
  const coal = 0.6 + 0.4 * Math.min(1, resourceRatio(nation, 'COAL'));
  const stability = 0.85 + 0.3 * clamp(nation.stability ?? 0.5, 0, 1);
  const law = 1 + (lawOption(nation, 'conscription').ic ?? 0);
  const tech = 1 + mod(nation, 'ic');
  const total = raw * coal * stability * law * tech;
  const share = lawOption(nation, 'economy').military;
  return {
    raw,
    dockyards,
    coalNeed: raw * COAL_PER_IC,
    factors: { coal, stability, law, tech },
    total,
    military: total * share,
    civil: total * (1 - share),
    share,
  };
}

/**
 * Tüketim malı. İhtiyaç nüfusla ve ÇAĞLA büyür; el tezgâhı nüfus ve
 * kalkınmayla. Fabrikasız ülke 1836'da idare eder, 1880'de etmez.
 */
export function consumerGoods(nation, { population, development, civil, turn }) {
  const units = Math.max(0, population) / 100000;
  const era = 1 + CONSUMER_ERA_GROWTH * clamp((turn ?? 0) / ERA_TURNS, 0, 1);
  const need = units * CONSUMER_NEED * era * Math.max(0.3, 1 + mod(nation, 'consumerNeed'));
  const cottage = units * COTTAGE_OUTPUT * (1 + COTTAGE_PER_DEVELOPMENT * development);
  const supply = cottage + civil;
  return { need, cottage, civil, supply, ratio: need > 0 ? supply / need : 1, era };
}

/** Tüketim malının istikrara katkısı (puan/100). Eksik ağır, fazla hafif. */
export function consumerStability(ratio) {
  return clamp((ratio - 1) * 0.3, -0.2, 0.06);
}

/** Tüketim malı fazlasının vergiye katkısı (kesir). */
export function consumerTaxBonus(ratio) {
  return clamp((ratio - 1) * 0.5, 0, 0.2);
}

/**
 * Askerî IC'yi hatlara dağıtır ve teçhizat üretir. Kaynak eksikliği hattın
 * çıktısını oranında keser (geçen haftanın ticaret sonucu). Hat başına kaynak
 * İHTİYACI kısılmamış potansiyelden yazılır: ithalat açığı onu doldurmaya
 * çalışır. `needs` içine ekler.
 */
export function runLines(nation, militaryIC, dockyards, needs) {
  const economy = nation.economy;
  ensureIndustry(economy);
  const lines = economy.lines;
  const ironclad = mod(nation, 'ironclad') > 0;
  let weightSum = 0;
  for (const id of EQUIPMENT_IDS) {
    const usable = id !== 'ships' || dockyards > 0;
    if (usable) weightSum += lines[id].weight;
  }
  const cap = clamp(LINE_EFFICIENCY.cap + mod(nation, 'lineEfficiency'), 0.3, 1);
  const gain = LINE_EFFICIENCY.gain * (1 + mod(nation, 'lineGain'));
  const produced = {};
  for (const id of EQUIPMENT_IDS) {
    const line = lines[id];
    const equipment = EQUIPMENT[id];
    const usable = id !== 'ships' || dockyards > 0;
    let ic = usable && weightSum > 0 ? militaryIC * line.weight / weightSum : 0;
    // Tersane kapasitesi: gemi hattına kademe başına DOCKYARD_IC girebilir.
    if (id === 'ships') ic = Math.min(ic, dockyards * DOCKYARD_IC);
    const recipe = id === 'ships' && ironclad ? equipment.ironclad : equipment.resources;
    const potential = ic > 0 ? ic * line.efficiency / equipment.ic : 0;
    let limit = 1;
    for (const [res, amount] of Object.entries(recipe)) {
      needs[res] += potential * amount;
      limit = Math.min(limit, resourceRatio(nation, res));
    }
    const output = potential * clamp(limit, 0, 1);
    economy.stock[id] += output;
    produced[id] = output;
    line.ic = ic;
    line.output = output;
    line.limit = limit;
    line.efficiency = ic > 0
      ? Math.min(cap, line.efficiency + gain)
      : Math.max(LINE_EFFICIENCY.floor, line.efficiency - LINE_EFFICIENCY.decay);
  }
  return produced;
}

/** Stoktaki teçhizat. */
export function equipmentStock(nation, id) {
  return nation?.economy?.stock?.[id] ?? 0;
}

/** Stoğa ekler (iade, başlangıç deposu, olay ödülü). */
export function addEquipment(nation, id, amount) {
  const economy = nation?.economy;
  if (!economy || !(amount > 0)) return;
  ensureIndustry(economy);
  economy.stock[id] += amount;
}

/**
 * Bir ihtiyaç listesini (`{rifles: 10, guns: 6}`) stoktan çeker. Tamamı yoksa
 * `partial` ise eldekinin karşıladığı ORANI (0-1) en kıt kalemde keser ve o
 * oranda çeker; değilse hiçbir şey çekmez ve 0 döner.
 */
export function takeEquipment(nation, needs, { partial = false } = {}) {
  const economy = nation?.economy;
  if (!economy) return 0;
  ensureIndustry(economy);
  let fraction = 1;
  for (const [id, amount] of Object.entries(needs ?? {})) {
    if (!(amount > 0)) continue;
    fraction = Math.min(fraction, economy.stock[id] / amount);
  }
  fraction = clamp(fraction, 0, 1);
  if (fraction < 1 && !partial) return 0;
  for (const [id, amount] of Object.entries(needs ?? {})) {
    if (amount > 0) economy.stock[id] = Math.max(0, economy.stock[id] - amount * fraction);
  }
  return fraction;
}

/** Bir ihtiyaç listesinin eksik kalemleri (`{guns: 2.5}`); hepsi varsa boş. */
export function equipmentShortfall(nation, needs) {
  const missing = {};
  for (const [id, amount] of Object.entries(needs ?? {})) {
    const lack = amount - equipmentStock(nation, id);
    if (lack > 1e-9) missing[id] = lack;
  }
  return missing;
}
