// SANAYİ — IC, tüketim malı ve askerî üretim hatları (TASARIM.md §5).
//
// Tek kavram, iki kullanım: fabrikalar IC verir; ekonomi yasası IC'nin ne
// kadarının orduya gideceğini söyler. Sivil pay halkın TÜKETİM MALIDIR (eksikse
// istikrar düşer, fazlası vergiyi artırır), askerî pay üretim hatlarına akar.
// HOI4'ün asıl ikilemi budur: topyekûn savaş orduyu doyurur, halkı aç bırakır.

import {
  COAL_PER_IC, CONSUMER_ERA_GROWTH, CONSUMER_NEED, COTTAGE_OUTPUT,
  COTTAGE_PER_DEVELOPMENT, DOCKYARD_IC, EQUIPMENT, EQUIPMENT_IDS, ERA_TURNS, FACTORY_IC,
  LINE_EFFICIENCY, OIL_PER_IC,
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
      // 'auto' (varsayılan): ağırlığı autoLineWeights verir. 'manual': oyuncu
      // seçti, hiçbir otomasyon dokunmaz.
      mode: line.mode === 'manual' ? 'manual' : 'auto',
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

/** Hat ağırlığını değiştirir (0-10). Verim korunur. Kipe dokunmaz. */
export function setLineWeight(nation, id, weight) {
  const economy = nation?.economy;
  if (!economy || !EQUIPMENT[id]) return false;
  ensureIndustry(economy);
  economy.lines[id].weight = clamp(Math.round(weight), 0, 10);
  return true;
}

/**
 * Oyuncunun öncelik seçimi. Kademeler ağırlıktır; 'auto' hattı otomasyona
 * geri verir. Eski arayüz 0-10 ağırlıktı ve ekonomi otomasyonu (AUTO, ekranda
 * görünmeyen) dört haftada bir oyuncunun ağırlığının ÜSTÜNE yazıyordu
 * (Kerem: "weight kısmı çok düzgün çalışmıyor"). Elle seçilen hat artık
 * 'manual'dır ve hiçbir otomasyon ona dokunmaz.
 */
export const LINE_PRIORITIES = [
  { id: 'off', name: 'Off', weight: 0 },
  { id: 'low', name: 'Low', weight: 1 },
  { id: 'normal', name: 'Normal', weight: 3 },
  { id: 'high', name: 'High', weight: 6 },
];

export function setLinePriority(nation, id, priority) {
  const economy = nation?.economy;
  if (!economy || !EQUIPMENT[id]) return false;
  ensureIndustry(economy);
  const line = economy.lines[id];
  if (priority === 'auto') {
    line.mode = 'auto';
    return true;
  }
  const level = LINE_PRIORITIES.find((p) => p.id === priority);
  if (!level) return false;
  line.mode = 'manual';
  line.weight = level.weight;
  return true;
}

/** Ağırlığın okunur kademesi (otomasyonun seçtiği de dahil). */
export function linePriorityOf(weight) {
  let best = LINE_PRIORITIES[0];
  for (const level of LINE_PRIORITIES) if (weight >= level.weight) best = level;
  return best;
}

/**
 * OTOMATİK HAT: depo ordunun ihtiyacını karşılıyorsa hat durur, eksikse açılır
 * (eski economyAI kuralı, aynı eşikler). Yalnız 'auto' kipindeki hatlara
 * yazar; dört haftada bir. YZ ulusları ve oyuncunun Auto hatları aynı kural.
 */
export function autoLineWeights(world, nation) {
  const economy = nation.economy;
  if (!economy) return;
  ensureIndustry(economy);
  const lines = economy.lines;
  if (!EQUIPMENT_IDS.some((id) => lines[id].mode === 'auto')) return;
  const war = (economy.warFronts ?? 0) > 0;
  let regiments = 0;
  let guns = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id) continue;
    regiments += unit.regiments?.length ?? 0;
    for (const regiment of unit.regiments ?? []) if (regiment.typeId === 'ARTILLERY') guns++;
  }
  // Depo doluysa hat durur: barışta yığılan tüfek demir yer ama kimseyi
  // silahlandırmaz (ölçüldü: 1900'de dünya demiri %40'ta, depolar taşkın).
  const rifles = equipmentStock(nation, 'rifles');
  const want = {
    rifles: rifles < regiments * 4 + 30 ? (war ? 5 : 3) : rifles < regiments * 10 + 80 ? 1 : 0,
    guns: equipmentStock(nation, 'guns') < guns * 3 + 6 ? (war ? 2 : 1) : 0,
    ships: economy.coastal ? ((economy.blockade ?? 0) > 0 || nation.focus === 'military' ? 2 : 1) : 0,
  };
  for (const id of EQUIPMENT_IDS) {
    if (lines[id].mode === 'auto') lines[id].weight = clamp(want[id] ?? 0, 0, 10);
  }
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
  // Petrol bonusu karşılanan petrol oranındadır; rafinerisi olmayan ülke
  // petrol istemez (bkz. OIL_PER_IC).
  const oilBonus = Math.max(0, mod(nation, 'oilIc'));
  const oil = 1 + oilBonus * Math.min(1, resourceRatio(nation, 'OIL'));
  const total = raw * coal * stability * law * tech * oil;
  const share = lawOption(nation, 'economy').military;
  return {
    raw,
    dockyards,
    coalNeed: raw * COAL_PER_IC,
    oilNeed: oilBonus > 0 ? raw * OIL_PER_IC : 0,
    factors: { coal, stability, law, tech, oil },
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
export function consumerGoods(nation, { population, workforce = population, development, civil, turn }) {
  const units = Math.max(0, population) / 100000;
  const era = 1 + CONSUMER_ERA_GROWTH * clamp((turn ?? 0) / ERA_TURNS, 0, 1);
  const need = units * CONSUMER_NEED * era * Math.max(0.3, 1 + mod(nation, 'consumerNeed'));
  // Tezgâhı silah altındaki değil evdeki dokur; ihtiyaç ise bütün nüfusundur.
  const cottage = Math.max(0, workforce) / 100000 * COTTAGE_OUTPUT * (1 + COTTAGE_PER_DEVELOPMENT * development);
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
/**
 * Askerî IC'nin hatlara paylaşımı ve her hattın girdi/çıktısı — durum
 * değiştirmez. runLines bunu uygular; ekran ağırlık önizlemesi için `weights`
 * ile çağırır ("5'e çıkarsam ne olur"). Tek hesap: önizleme oyunla ayrışamaz.
 */
export function lineAllocation(nation, militaryIC, dockyards, weights = null) {
  const economy = nation.economy;
  ensureIndustry(economy);
  const lines = economy.lines;
  const ironclad = mod(nation, 'ironclad') > 0;
  const weightOf = (id) => weights?.[id] ?? lines[id].weight;
  let weightSum = 0;
  for (const id of EQUIPMENT_IDS) {
    const usable = id !== 'ships' || dockyards > 0;
    if (usable) weightSum += weightOf(id);
  }
  const out = {};
  for (const id of EQUIPMENT_IDS) {
    const line = lines[id];
    const equipment = EQUIPMENT[id];
    const usable = id !== 'ships' || dockyards > 0;
    let ic = usable && weightSum > 0 ? militaryIC * weightOf(id) / weightSum : 0;
    // Tersane kapasitesi: gemi hattına kademe başına DOCKYARD_IC girebilir.
    if (id === 'ships') ic = Math.min(ic, dockyards * DOCKYARD_IC);
    const recipe = id === 'ships' && ironclad ? equipment.ironclad : equipment.resources;
    const potential = ic > 0 ? ic * line.efficiency / equipment.ic : 0;
    let limit = 1;
    const inputs = {};
    for (const [res, amount] of Object.entries(recipe)) {
      inputs[res] = potential * amount;
      limit = Math.min(limit, resourceRatio(nation, res));
    }
    out[id] = { usable, ic, potential, limit, inputs, output: potential * clamp(limit, 0, 1) };
  }
  return out;
}

export function runLines(nation, militaryIC, dockyards, needs) {
  const economy = nation.economy;
  ensureIndustry(economy);
  const lines = economy.lines;
  const cap = clamp(LINE_EFFICIENCY.cap + mod(nation, 'lineEfficiency'), 0.3, 1);
  const gain = LINE_EFFICIENCY.gain * (1 + mod(nation, 'lineGain'));
  const allocation = lineAllocation(nation, militaryIC, dockyards);
  const produced = {};
  for (const id of EQUIPMENT_IDS) {
    const line = lines[id];
    const { ic, inputs, limit, output } = allocation[id];
    for (const [res, amount] of Object.entries(inputs)) needs[res] += amount;
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
