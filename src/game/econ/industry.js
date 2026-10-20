// SANAYİ — tüketim malı ihtiyacı ve askerî üretim hatları (TASARIM.md §5).
//
// Çıktının kendisi econ/output.js'tedir. Ekonomi yasası SANAYİNİN ne kadarını
// ordunun çekebileceğini söyler; hatlar ağırlıkla paylaşır, çekmedikleri pay
// halka ve kalkınmaya kalır. Halkın payı doyurma kolundan gelir (FEED).
// HOI4'ün asıl ikilemi budur: topyekûn savaş orduyu doyurur, halkı aç bırakır.

import {
  CONSUMER_ERA_GROWTH, CONSUMER_NEED, EQUIPMENT, EQUIPMENT_IDS, FEED, LINE_EFFICIENCY, POP_UNIT,
  UNIT_EQUIPMENT,
} from './defs.js';
import { mod } from '../modifiers.js';
import { resourceRatio } from './resources.js';
import { eraProgress } from '../calendar.js';
import { unitUnlocked } from '../technology.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Varsayılan hat ağırlıkları: tüfek önce, top sonra, gemi tersane varsa. */
const DEFAULT_WEIGHTS = { rifles: 3, guns: 1, ships: 1, tanks: 1, aircraft: 1 };

/**
 * Hat çalışabilir mi: gemi kıyı kalkınması (tersane kapasitesi), tank ve uçak
 * kolunu açan teknolojiyi ister. Kapalı hattın ağırlığı paya girmez (IC boşa bölünmez).
 */
function lineUsable(nation, id, dockyards) {
  if (id === 'ships' && dockyards <= 0) return false;
  const unit = EQUIPMENT[id]?.unit;
  return !unit || unitUnlocked(nation, unit);
}

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
  economy.ic ??= { raw: 0, total: 0, output: 0, hand: 0, civil: 0, military: 0 };
  economy.consumer ??= { need: 0, supply: 0, ratio: 1, feed: FEED.peace };
  economy.feed ??= { mode: 'auto', target: FEED.peace };
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
 * OTOMATİK HAT: depo ordunun ihtiyacını karşılıyorsa hat durur, eksikse açılır.
 * Yalnız 'auto' kipindeki hatlara yazar; dört haftada bir. YZ ulusları ve
 * oyuncunun Auto hatları aynı kural.
 *
 * `reserve.rifles`: seferberliğin depodan isteyeceği tüfek (çağıran
 * mobilization.mobilizationRifleReserve ile hesaplar; bu dosya seferberliği
 * import etmez). Barışta hattın işi yedeği silahlandırmaktır.
 */
export function autoLineWeights(world, nation, reserve = {}) {
  const economy = nation.economy;
  if (!economy) return;
  ensureIndustry(economy);
  const lines = economy.lines;
  if (!EQUIPMENT_IDS.some((id) => lines[id].mode === 'auto')) return;
  const war = (economy.warFronts ?? 0) > 0;
  let regiments = 0;
  let guns = 0;
  let warships = 0;
  let armour = 0;
  let air = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id) continue;
    regiments += unit.regiments?.length ?? 0;
    for (const regiment of unit.regiments ?? []) {
      if (regiment.typeId === 'ARTILLERY') guns++;
      else if (regiment.typeId === 'ARMOR') armour++;
      else if (regiment.typeId === 'AIRCRAFT') air++;
    }
  }
  // Gemiler haritada değil filodadır (navy.js).
  warships = nation.navy?.ships?.length ?? 0;
  // Depo doluysa hat durur: barışta yığılan tüfek demir yer ama kimseyi
  // silahlandırmaz (ölçüldü: 1900'de dünya demiri %40'ta, depolar taşkın).
  const rifles = equipmentStock(nation, 'rifles');
  const mobilization = Math.max(0, reserve.rifles ?? 0);
  const want = {
    rifles: rifles < regiments * 4 + 30 ? (war ? 5 : 3)
      : rifles < regiments * 10 + 80 + mobilization ? (war ? 3 : 1) : 0,
    guns: equipmentStock(nation, 'guns') < guns * 3 + 6 ? (war ? 2 : 1) : 0,
    // Gemi hattının da tavanı var: tavansızken filonun ihtiyacının 1000-1850
    // katı gemi yığılıyor, askerî IC'nin %33-50'sini ve (zırhlıyla) dünya
    // demirinin %93-98'ini yiyordu (ölçüldü 2026-10-11, 3 tohum + 160x96).
    ships: !economy.coastal || equipmentStock(nation, 'ships') >= warships * 10 + 30 ? 0
      : ((economy.blockade ?? 0) > 0 || nation.focus === 'military' ? 2 : 1),
    // Tank ve uçak: kol açıksa bir alaylık kit + alay başına üçte bir takım
    // takviye payı (tüfekle aynı oran). Eşik "2 × alay + 8" iken kit 8'den
    // 24'e çıktı (UNIT_EQUIPMENT ×3) ve eşik kitin altında kaldı: YZ alayı
    // ancak kit depodaysa kurduğu için 30 yılda dünyada 1 zırhlı, 0 hava
    // alayı vardı, depolarda ~240 tank ve ~250 uçak yatıyordu (ölçüldü).
    tanks: !unitUnlocked(nation, 'ARMOR')
      || equipmentStock(nation, 'tanks') >= armour * 8 + UNIT_EQUIPMENT.ARMOR.tanks ? 0
      : (war ? 3 : 1),
    aircraft: !unitUnlocked(nation, 'AIRCRAFT')
      || equipmentStock(nation, 'aircraft') >= air * 8 + UNIT_EQUIPMENT.AIRCRAFT.aircraft ? 0
      : (war ? 2 : 1),
  };
  for (const id of EQUIPMENT_IDS) {
    if (lines[id].mode === 'auto') lines[id].weight = clamp(want[id] ?? 0, 0, 10);
  }
}

/**
 * Tüketim malı İHTİYACI: nüfusla ve ÇAĞLA büyür (1900'de 1, 1945'te 2.7).
 * Arz halkın payıdır (doyurma kolu × ihtiyaç; econ/output.js çıktısından).
 * Sanayileşmeyen ülkenin çıktısı ihtiyacın büyümesine yetişmez.
 */
export function consumerNeed(nation, population, turn) {
  const era = 1 + CONSUMER_ERA_GROWTH * eraProgress(turn);
  const need = Math.max(0, population) / POP_UNIT * CONSUMER_NEED * era
    * Math.max(0.3, 1 + mod(nation, 'consumerNeed'));
  return { need, era };
}

/**
 * Halkın doyurulma hedefi (ihtiyacın katı). 'auto' kipinde YZ evresi yazar
 * (ai.autoFeed); 'manual' kipine hiçbir otomasyon dokunmaz.
 */
export function feedTarget(nation) {
  const feed = nation?.economy?.feed;
  const target = Number.isFinite(feed?.target) ? feed.target : FEED.peace;
  return clamp(target, FEED.min, FEED.max);
}

/** Oyuncunun doyurma seçimi: kol ya da 'auto'. */
export function setFeed(nation, target) {
  const economy = nation?.economy;
  if (!economy) return false;
  economy.feed ??= { mode: 'auto', target: FEED.peace };
  if (target === 'auto') {
    economy.feed.mode = 'auto';
    return true;
  }
  if (!Number.isFinite(target)) return false;
  economy.feed.mode = 'manual';
  economy.feed.target = clamp(Math.round(target / FEED.step) * FEED.step, FEED.min, FEED.max);
  return true;
}

/** Tüketim malının istikrara katkısı (puan/100). Eksik ağır, fazla hafif. */
export function consumerStability(ratio) {
  return clamp((ratio - 1) * 0.3, -0.2, 0.06);
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
    if (lineUsable(nation, id, dockyards)) weightSum += weightOf(id);
  }
  const out = {};
  for (const id of EQUIPMENT_IDS) {
    const line = lines[id];
    const equipment = EQUIPMENT[id];
    const usable = lineUsable(nation, id, dockyards);
    let ic = usable && weightSum > 0 ? militaryIC * weightOf(id) / weightSum : 0;
    // Tersane kapasitesi (kıyı kalkınması, econ/output.js): gemi hattına en
    // çok bu kadar IC girebilir.
    if (id === 'ships') ic = Math.min(ic, dockyards);
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

/**
 * Askerî payın hatlara giden kısmı. Kalanı (bütün hatlar durmuşken ya da
 * tersane tavanı aşılınca) HALKA DÖNER: tüketim malı üretir. Ekonomi yasası
 * böylece ordunun en çok ne kadar çekebileceğidir, boşa yakılan bir pay değil.
 *
 * Eskiden bu pay boşa gidiyordu (Factories ekranında taralı "Idle"): barışta
 * Auto depolar doluyken askerî IC dünyada ortanca %96-100 boştu (ölçüldü,
 * 3 tohum × 45 yıl, 160×96) — Kerem: "barışta askerî fabrikalara ihtiyaç yok".
 */
export function militaryDraw(nation, militaryIC, dockyards) {
  const allocation = lineAllocation(nation, militaryIC, dockyards);
  let used = 0;
  for (const id of EQUIPMENT_IDS) used += allocation[id].ic;
  return Math.max(0, Math.min(militaryIC, used));
}

/** Hat veriminin tavanı (teknolojiyle yükselir). Ekran da bunu okur. */
export function lineEfficiencyCap(nation) {
  return clamp(LINE_EFFICIENCY.cap + mod(nation, 'lineEfficiency'), 0.3, 1);
}

/** Çalışan hattın haftalık verim kazancı. */
export function lineEfficiencyGain(nation) {
  return LINE_EFFICIENCY.gain * (1 + mod(nation, 'lineGain'));
}

export function runLines(nation, militaryIC, dockyards, needs) {
  const economy = nation.economy;
  ensureIndustry(economy);
  const lines = economy.lines;
  const cap = lineEfficiencyCap(nation);
  const gain = lineEfficiencyGain(nation);
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
