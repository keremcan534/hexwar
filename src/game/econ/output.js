// ÇIKTI — ulusun haftalık ürettiği IC (TASARIM.md §5, "Tek Çubuk").
//
// Tek formül, iki parça: her 100 bin işçi ELLE çıktı üretir (tarla, tezgâh,
// zanaat), 1'in üstündeki her kalkınma kademesi SANAYİ ekler. Sanayi kömür,
// demir, kereste (ve rafineri teknolojisiyle petrol) ister, teknolojiyle
// büyür; askerî üretim hatları yalnız sanayiden çekebilir (ekonomi yasası
// sanayinin payıdır). Fabrika binası yoktur: sanayileşmek kalkınmaktır.
//
// Simülasyon ve ekran AYNI fonksiyonu okur (state kartı, Industry zinciri).

import {
  CROWN_OUTPUT, HAND_OUTPUT, INDUSTRY_INPUTS, INDUSTRY_PER_DEV, INPUT_ERA_SAVING, POP_UNIT,
  SHIPYARD_PER_DEV,
} from './defs.js';
import { lawOption } from '../laws.js';
import { mod } from '../modifiers.js';
import { resourceRatio, workforceShare } from './resources.js';
import { eraProgress } from '../calendar.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Bir state'in ham çıktısı (ulusal çarpanlardan önce). Silah altındaki
 * çalışmaz; statü (çekirdek/uyum/işgal) çarpar.
 */
export function provinceOutputBase(province) {
  const econ = province?.econ;
  const status = Math.max(0, econ?.status ?? 1);
  if (!econ || !(status > 0)) return { work: 0, hand: 0, industry: 0, status };
  const work = Math.max(0, econ.population ?? 0) / POP_UNIT * workforceShare(econ);
  return {
    work,
    status,
    // Rıza (provinces.js CONSENT): tebaa ve Home Rule halkının sakladığı pay.
    hand: HAND_OUTPUT * work * status * (econ.consent ?? 1),
    industry: INDUSTRY_PER_DEV * work * Math.max(0, (econ.development ?? 1) - 1) * status * (econ.consent ?? 1),
  };
}

/**
 * Ulusal çarpanlar. `N` el ve sanayinin ortak çarpanıdır (istikrar, askerlik
 * yasası, emek yasası, değiştiriciler); `energy` ve `tech` yalnız sanayiyi
 * çarpar. Kaynak oranları geçen haftanındır (mal bir haftada gelir).
 */
export function outputFactors(nation) {
  const coal = 0.6 + 0.4 * Math.min(1, resourceRatio(nation, 'COAL'));
  const iron = 0.85 + 0.15 * Math.min(1, resourceRatio(nation, 'IRON'));
  const timber = 0.9 + 0.1 * Math.min(1, resourceRatio(nation, 'TIMBER'));
  // Petrol bonusu karşılanan petrol oranındadır; rafinerisi olmayan ülke
  // petrol istemez.
  const oilBonus = Math.max(0, mod(nation, 'oilIc'));
  const oil = 1 + oilBonus * Math.min(1, resourceRatio(nation, 'OIL'));
  const stability = 0.85 + 0.3 * clamp(nation.stability ?? 0.5, 0, 1);
  const law = 1 + (lawOption(nation, 'conscription').ic ?? 0);
  const labour = lawOption(nation, 'labour').output ?? 1;
  const mods = Math.max(0.2, 1 + mod(nation, 'output'));
  const tech = 1 + mod(nation, 'ic');
  return {
    coal, iron, timber, oil, oilBonus, tech, stability, law, labour, mods,
    energy: coal * iron * timber * oil,
    common: stability * law * labour * mods,
  };
}

/**
 * Ulusun bu haftaki çıktısı. Alan adları eski IC kaydıyla uyumludur:
 * `total` SANAYİDİR (ordu ondan çeker, skor onu sayar), `output` el + sanayi
 * + taç toplamıdır (faturalar, halk ve kalkınma ondan pay alır).
 */
export function computeOutput(world, nation, turn = world.turn ?? 0) {
  let hand = 0;
  let raw = 0;
  let coastalDev = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const base = provinceOutputBase(province);
    hand += base.hand;
    raw += base.industry;
    if (province.coastal) coastalDev += (province.econ.development ?? 1) * base.status;
  }
  const factors = outputFactors(nation);
  const industry = raw * factors.energy * factors.tech * factors.common;
  const handTotal = hand * factors.common;
  const crown = nation.alive === false ? 0 : CROWN_OUTPUT;
  const share = lawOption(nation, 'economy').military;
  const era = eraProgress(turn);
  return {
    raw,
    hand: handTotal,
    crown,
    total: industry,
    output: handTotal + industry + crown,
    // Tersane: gemi hattının açılması ve tavanı, donanma onarımı (navy.js).
    dockyards: coastalDev * SHIPYARD_PER_DEV,
    coalNeed: raw * INDUSTRY_INPUTS.COAL * (1 - INPUT_ERA_SAVING.COAL * era),
    ironNeed: raw * INDUSTRY_INPUTS.IRON * (1 - INPUT_ERA_SAVING.IRON * era),
    timberNeed: raw * INDUSTRY_INPUTS.TIMBER * (1 - INPUT_ERA_SAVING.TIMBER * era),
    oilNeed: factors.oilBonus > 0 ? raw * INDUSTRY_INPUTS.OIL : 0,
    factors,
    share,
    military: industry * share,
  };
}

/** Bir state'in bu haftaki çıktısı ulusal çarpanlarla (state kartı, yatırım hedefi). */
export function provinceOutputOf(province, nation) {
  const base = provinceOutputBase(province);
  const f = outputFactors(nation);
  const industry = base.industry * f.energy * f.tech * f.common;
  const hand = base.hand * f.common;
  return { ...base, hand, industry, total: hand + industry };
}
