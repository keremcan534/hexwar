// ALTI KAYNAK — province üretimi ve ulusal ihtiyaç.
//
// Kaynaklar AKIŞTIR: her hafta üretilir, tüketilir, fazlası satılır, açığı
// alınır. Stok yoktur; böylece "ambar dolu mu" diye bir işletme sorusu
// doğmaz, yalnız "bu hafta yetiyor mu" sorusu kalır (TASARIM.md §3).
//
// Ticaret bu haftanın üretimi ve ihtiyacıyla kurulur (finishEconomy), oran ise
// bir SONRAKİ haftanın tüketicilerine (IC kömürü, hat demiri, inşaat
// kerestesi, muharebe barutu, süvari atı) yansır: "mal bir haftada gelir".

import {
  BATTLE_SALTPETER, DEPOSIT_OUTPUT, FOOD_BASE, FOOD_FERTILITY, FOOD_NEED,
  RESOURCE_IDS, UNIT_RESOURCES,
} from './defs.js';
import { depositsOf, fertilityOf } from './deposits.js';
import { mod } from '../modifiers.js';

export function emptyResourceMap(value = 0) {
  const out = {};
  for (const id of RESOURCE_IDS) out[id] = value;
  return out;
}

/** Kaynak kaydı (ulus başına, haftalık). */
export function emptyResourceRecord() {
  return {
    produced: 0, need: 0, imported: 0, exported: 0, offered: 0, wanted: 0,
    ratio: 1, balance: 0, price: 0, topPartner: -1, topShare: 0,
  };
}

/**
 * Province'in haftalık kaynak çıktısı. Statü (çekirdek/uyum/işgal) her
 * kaynağı çarpar; demiryolu yatakları büyütür, çiftlik gıdayı, maden yatağı.
 * `out` verilirse içine yazar (tahsis yok).
 */
export function provinceOutput(province, nation, out = emptyResourceMap()) {
  for (const id of RESOURCE_IDS) out[id] = 0;
  const econ = province?.econ;
  if (!econ) return out;
  const status = econ.status ?? 1;
  if (status <= 0) return out;
  const buildings = econ.buildings ?? {};
  const units = Math.max(0, econ.population ?? 0) / 100000;
  const food = units * (FOOD_BASE + FOOD_FERTILITY * fertilityOf(province))
    * (1 + 0.25 * (buildings.farm ?? 0)) * (1 + mod(nation, 'food'));
  out.FOOD = food * status;
  const rail = 1 + 0.1 * (buildings.railway ?? 0);
  const mine = 1 + 0.5 * (buildings.mine ?? 0);
  const extra = 1 + mod(nation, 'resources');
  for (const line of depositsOf(province)) {
    out[line.id] += line.size * (DEPOSIT_OUTPUT[line.id] ?? 0.3) * mine * rail * extra * status;
  }
  return out;
}

const scratch = emptyResourceMap();

/** Ulusun bu haftaki toplam üretimi. */
export function nationProduction(world, nation) {
  const total = emptyResourceMap();
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    provinceOutput(province, nation, scratch);
    for (const id of RESOURCE_IDS) total[id] += scratch[id];
  }
  return total;
}

/** Gıda ihtiyacı: nüfus. Asker nüfusun içindedir, ayrıca yemez. */
export function foodNeed(population) {
  return Math.max(0, population) / 100000 * FOOD_NEED;
}

/** At sürüsü: süvari ve topçu alayları haftalık at yer. */
export function unitResourceNeeds(world, nation, out) {
  for (const unit of world.units ?? []) {
    if (unit.nationId !== nation.id) continue;
    for (const regiment of unit.regiments ?? []) {
      const need = UNIT_RESOURCES[regiment.typeId];
      if (!need) continue;
      for (const [id, amount] of Object.entries(need)) out[id] += amount;
    }
  }
  return out;
}

/** Barut: bu hafta muharebedeki her alay güherçile yakar. */
export function battleSaltpeterNeed(world, nation) {
  let regiments = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId !== nation.id || !unit.battleId) continue;
    regiments += unit.regiments?.length ?? 1;
  }
  return regiments * BATTLE_SALTPETER;
}

/** Kaynağın karşılanma oranı (geçen haftanın ticareti dahil); kayıt yoksa 1. */
export function resourceRatio(nation, id) {
  const record = nation?.economy?.resources?.[id];
  return record ? record.ratio : 1;
}
