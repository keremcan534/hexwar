// YATIRIM — kalkınma fonu ve kademeler (TASARIM.md §7, "Tek Çubuk").
//
// Faturalar, ordu ve halk payını aldıktan sonra kalan çıktı KALKINMA FONUNA
// akar. Fon bir sonraki kademenin bedeline ulaştığında hedef state bir kademe
// kalkınır. Eski inşaat kuyruğunun yerine: bina türü, yuva, kuyruk, iptal
// yoktur — tek karar halkın ne kadar doyurulacağıdır (kalanı büyür) ve
// fonun önce nereye gideceği (Develop odağı).
//
// Fon ekonominin tek stoğudur. Tek seferlik alımlar (general, iskân, olay
// seçenekleri) ve ithalat da ondan ödenir; tabanı haftalık çıktının
// FUND_FLOOR_WEEKS katı kadar eksidir. Hedef seçimi herkes için aynı kuraldır
// (YZ değil simülasyon): oyuncu onu Develop odağıyla yönlendirir.

import {
  DEPOSIT_OUTPUT, DEVELOPMENT_CAP_BASE, DEVELOPMENT_CAP_LITERACY, DEVELOPMENT_MAX, FUND_FLOOR_WEEKS,
  INDUSTRY_PER_DEV, INPUT_ERA_SAVING, INVEST, INVEST_MATERIALS, POP_UNIT,
} from './defs.js';
import { eraProgress } from '../calendar.js';
import { mod } from '../modifiers.js';
import { lawOption } from '../laws.js';
import { settle } from '../treasury.js';
import { depositDevOf, resourceRatio, workforceShare } from './resources.js';
import { depositsOf } from './deposits.js';
import { outputFactors } from './output.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Kalkınma tavanı: taban + teknoloji + okuryazarlık, en yakın tama. Aşağı
 * yuvarlarken başlangıç okuryazarlığı (0.25 × 8 = 2.0) tavanı tam sınırda
 * kuruyordu: okulsuz ülkede binde bir düşüş tavanı ilk hafta 5'ten 4'e
 * indiriyordu. Yuvarlamayla aynı düşüş ~10 yıl sürer.
 */
export function developmentCap(nation) {
  const literacy = nation.economy?.literacy ?? 0;
  return clamp(Math.round(DEVELOPMENT_CAP_BASE + mod(nation, 'developmentCap')
    + literacy * DEVELOPMENT_CAP_LITERACY), 1, DEVELOPMENT_MAX);
}

/** State'in bir sonraki kademesinin bedeli (IC). */
export function levelCost(province, level = (province?.econ?.development ?? 1) + 1) {
  const econ = province?.econ;
  if (!econ) return Infinity;
  const units = Math.max(1, (econ.population ?? 0) / POP_UNIT);
  const focus = econ.focus === 'develop' ? INVEST.focusDiscount : 1;
  return INVEST.cost * units * level ** INVEST.exponent * focus;
}

/** Fona giren IC'nin verimi: teknoloji/danışman/yasa × kereste ve demir. */
export function investEfficiency(nation) {
  const materials = Math.min(resourceRatio(nation, 'TIMBER'), resourceRatio(nation, 'IRON'));
  const law = lawOption(nation, 'trade').investment ?? 0;
  return Math.max(0.1, 1 + mod(nation, 'investment') + law) * (0.5 + 0.5 * clamp(materials, 0, 1));
}

/**
 * Yatırılan IC'nin kaynak ihtiyacı (`needs` içine ekler). Malzeme de sanayi
 * girdisi gibi çağla azalır (kereste yerini çeliğe ve betona bırakır): kerestenin
 * yarısını kalkınma tüketiyordu ve yalnız sanayi tasarrufuyla 1945-46'da dünya
 * kereste arzı ihtiyacın 0.93-0.99'u, ulusların %34-49'u kıttı (STAT1).
 */
export function investmentNeeds(invested, needs, turn = 0) {
  if (!(invested > 0)) return needs;
  const era = eraProgress(turn);
  needs.TIMBER += invested * INVEST_MATERIALS.TIMBER * (1 - INPUT_ERA_SAVING.TIMBER * era);
  needs.IRON += invested * INVEST_MATERIALS.IRON * (1 - INPUT_ERA_SAVING.IRON * era);
  return needs;
}

/** Yatırıma açık mı: sahibinin, yeterince bağlı, tavanın altında. */
function eligible(province, nationId, cap) {
  const econ = province.econ;
  return province.owner === nationId && econ
    && (econ.status ?? 1) >= INVEST.minStatus
    && (econ.development ?? 1) < cap;
}

/**
 * Bir kademenin haftalık kazancı (IC): sanayi payı + yatakların büyümesi
 * (dünya fiyatıyla). Hedef seçimi ve ekran "geri dönüş" bunu okur.
 */
export function levelGain(world, nation, province, factors = outputFactors(nation)) {
  const econ = province.econ;
  const status = Math.max(0, econ.status ?? 1);
  const work = Math.max(0, econ.population ?? 0) / POP_UNIT * workforceShare(econ);
  let gain = INDUSTRY_PER_DEV * work * status * (econ.consent ?? 1) * factors.energy * factors.tech * factors.common;
  const share = workforceShare(econ);
  for (const line of depositsOf(province)) {
    const price = world.market?.prices?.[line.id] ?? 1;
    gain += line.size * (DEPOSIT_OUTPUT[line.id] ?? 0.3) * depositDevOf(line.id).perDev * status * share * price;
  }
  return gain;
}

/** Fona bir haftada giren (geçen haftanın yatırımı × verim). */
export function weeklyInvestment(nation) {
  const economy = nation?.economy;
  return Math.max(0, economy?.alloc?.invest ?? 0) * (economy?.investEfficiency ?? 1);
}

/**
 * Fonun gideceği state. Develop odaklı uygun state varsa yalnız onlar
 * arasından, yoksa bütün uygun state'lerden: ufkun (fon ya da INVEST.horizon
 * haftalık yatırım) içinde alınabilenlerin en yüksek kazanç ÷ bedeli; hiçbiri
 * ufukta değilse en ucuzu. Eşitlikte küçük id (determinizm). Uygun state
 * yoksa null: yatırım halka döner.
 */
export function investmentTarget(world, nation) {
  const cap = developmentCap(nation);
  const factors = outputFactors(nation);
  const budget = Math.max(nation.fund ?? 0, INVEST.horizon * weeklyInvestment(nation));
  let focusOnly = false;
  for (const province of world.provinces ?? []) {
    if (province.econ?.focus === 'develop' && eligible(province, nation.id, cap)) {
      focusOnly = true;
      break;
    }
  }
  let best = null;
  let bestScore = -Infinity;
  let cheapest = null;
  let cheapestCost = Infinity;
  for (const province of world.provinces ?? []) {
    if (!eligible(province, nation.id, cap)) continue;
    if (focusOnly && province.econ.focus !== 'develop') continue;
    const cost = levelCost(province);
    if (cost < cheapestCost - 1e-9) {
      cheapest = province;
      cheapestCost = cost;
    }
    if (cost > budget) continue;
    const score = levelGain(world, nation, province, factors) / cost;
    if (score > bestScore + 1e-12) {
      best = province;
      bestScore = score;
    }
  }
  return best ?? cheapest;
}

/** Fonun tabanı (eksi): haftalık çıktının FUND_FLOOR_WEEKS katı. */
export function fundFloor(nation) {
  return -FUND_FLOOR_WEEKS * Math.max(0, nation?.economy?.outputAvg ?? 0);
}

/** Tek seferlik alım yapılabilir mi: fon tabanın altına inmez. */
export function canSpend(nation, cost) {
  if (!(cost > 0)) return true;
  return (nation?.fund ?? 0) - cost >= fundFloor(nation) - 1e-9;
}

/** Tek seferlik alım (general, iskân, olay seçeneği): fondan, defterde 'outlay'. */
export function spend(nation, cost) {
  if (!canSpend(nation, cost)) return false;
  if (cost > 0) settle(nation, 'outlay', -cost);
  return true;
}

/**
 * Fon bedele yettikçe kademe alır (hafta sonu, ticaretten sonra). Kalkınan
 * state'leri döndürür (harita ipuçları yeniden çizilsin).
 */
export function buyDevelopment(world, nation) {
  const raised = [];
  let target = investmentTarget(world, nation);
  for (let guard = 0; target && guard < 24; guard++) {
    const cost = levelCost(target);
    if ((nation.fund ?? 0) < cost) break;
    settle(nation, 'development', -cost);
    target.econ.development = Math.min(DEVELOPMENT_MAX, (target.econ.development ?? 1) + 1);
    raised.push(target);
    target = investmentTarget(world, nation);
  }
  const economy = nation.economy;
  if (economy) {
    economy.investTarget = target
      ? { provinceId: target.id, level: target.econ.development + 1, cost: levelCost(target) }
      : null;
  }
  return raised;
}
