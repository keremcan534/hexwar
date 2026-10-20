// KAYNAKLAR — province üretimi ve ulusal ihtiyaç.
//
// Kaynaklar AKIŞTIR: her hafta üretilir, tüketilir, fazlası satılır, açığı
// alınır. Stok yoktur; böylece "ambar dolu mu" diye bir işletme sorusu
// doğmaz, yalnız "bu hafta yetiyor mu" sorusu kalır (TASARIM.md §3).
//
// Ticaret bu haftanın üretimi ve ihtiyacıyla kurulur (finishEconomy), oran ise
// bir SONRAKİ haftanın tüketicilerine (sanayi kömürü, hat demiri, yatırım
// kerestesi, muharebe barutu, süvari atı) yansır: "mal bir haftada gelir".

import {
  BATTLE_SALTPETER, DEPOSIT_DEV, DEPOSIT_DEV_BY, DEPOSIT_OUTPUT, FOOD_BASE, FOOD_FERTILITY, FOOD_NEED,
  RESOURCE_IDS, RUBBER_PER_REGIMENT, UNIT_RESOURCES,
} from './defs.js';
import { depositsOf, fertilityOf } from './deposits.js';
import { mod } from '../modifiers.js';
import { focusBonus } from '../focus.js';

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
 * SEFERBERLİĞİN BEDELİ: silah altındaki adam tarlada, madende, tezgâhta ve
 * vergi defterinde değildir (ama yemek yer: gıda ihtiyacı bütün nüfustur).
 * Eski ekonomide bu bedel rgoLaborScale'deydi; yeniden yazımda kaybolmuştu
 * ve kışlada tutulan ordunun evde hiçbir karşılığı kalmamıştı — "top mu
 * tereyağı mı" ikilemi yoktu.
 */
export function workforceShare(econ) {
  const people = Math.max(0, econ?.population ?? 0);
  if (!(people > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - Math.max(0, econ.soldiers ?? 0) / people));
}

/** Kaynağın kalkınma eğrisi: demir ve kereste sanayiyle daha dik büyür. */
export function depositDevOf(id) {
  return DEPOSIT_DEV_BY[id] ?? DEPOSIT_DEV;
}

/** Yatak çıktısının kalkınma çarpanı (maden ve demiryolu binalarının yerine). */
export function depositDevFactor(econ, id) {
  const curve = depositDevOf(id);
  return curve.base + curve.perDev * (econ?.development ?? 1);
}

/**
 * Province'in haftalık kaynak çıktısı. Statü (çekirdek/uyum/işgal) her
 * kaynağı çarpar; kalkınma yatakları büyütür. `out` verilirse içine yazar
 * (tahsis yok).
 */
export function provinceOutput(province, nation, out = emptyResourceMap()) {
  for (const id of RESOURCE_IDS) out[id] = 0;
  const econ = province?.econ;
  if (!econ) return out;
  const status = econ.status ?? 1;
  if (status <= 0) return out;
  const work = workforceShare(econ);
  const units = Math.max(0, econ.population ?? 0) / 100000 * work;
  const fertilizer = Math.max(0, mod(nation, 'saltpeterFood')) * resourceRatio(nation, 'SALTPETER');
  const food = units * (FOOD_BASE + FOOD_FERTILITY * fertilityOf(province))
    * (1 + mod(nation, 'food') + fertilizer);
  // Üretim odağı (focus.js) gıdayı ve yatakları birlikte çarpar.
  const focus = 1 + focusBonus(econ, 'output');
  out.FOOD = food * status * focus;
  const extra = 1 + mod(nation, 'resources');
  for (const line of depositsOf(province)) {
    out[line.id] += line.size * (DEPOSIT_OUTPUT[line.id] ?? 0.3) * depositDevFactor(econ, line.id)
      * extra * status * work * focus * (econ.consent ?? 1);
  }
  return out;
}

/**
 * provinceOutput'un DÖKÜMÜ — aynı formül, çarpan çarpan (state kartının
 * bilgi kartları: "Timber ×1.5 ne demek, fertility ne demek"). Üretimi bu
 * fonksiyon yapmaz; formül değişirse ikisi birlikte değişmeli.
 */
export function outputBreakdown(province, nation) {
  const econ = province?.econ;
  if (!econ) return null;
  const status = Math.max(0, econ.status ?? 1);
  const work = workforceShare(econ);
  const units = Math.max(0, econ.population ?? 0) / 100000 * work;
  const fertility = fertilityOf(province);
  const fertilizer = Math.max(0, mod(nation, 'saltpeterFood')) * resourceRatio(nation, 'SALTPETER');
  const focus = 1 + focusBonus(econ, 'output');
  const foodMods = 1 + mod(nation, 'food') + fertilizer;
  const perUnit = FOOD_BASE + FOOD_FERTILITY * fertility;
  const extra = 1 + mod(nation, 'resources');
  return {
    status, work, focus,
    food: {
      units, fertility, perUnit, mods: foodMods,
      need: foodNeed(econ.population ?? 0),
      total: status > 0 ? units * perUnit * foodMods * status * focus : 0,
    },
    deposits: depositsOf(province).map((line) => {
      const base = DEPOSIT_OUTPUT[line.id] ?? 0.3;
      const dev = depositDevFactor(econ, line.id);
      return {
        id: line.id, size: line.size, base, dev, extra,
        total: status > 0 ? line.size * base * dev * extra * status * work * focus * (econ.consent ?? 1) : 0,
      };
    }),
  };
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

/**
 * At sürüsü: süvari ve topçu alayları haftalık at yer. Kauçuk: muharebe
 * teknolojisi (`rubberArmy`) olan ülkede her kara alayı ister.
 */
export function unitResourceNeeds(world, nation, out) {
  const rubber = mod(nation, 'rubberArmy') > 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId !== nation.id) continue;
    const land = unit.type?.domain !== 'sea';
    for (const regiment of unit.regiments ?? []) {
      if (rubber && land) out.RUBBER += RUBBER_PER_REGIMENT;
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
