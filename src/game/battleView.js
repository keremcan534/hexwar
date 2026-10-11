// Muharebe penceresinin dökümü (HOI4'ün savaş penceresi). Ekran sayı üretmez:
// taraflar, tümenler, çarpanlar ve "kim kaç haftada kırılır" tahmini buradan
// gelir ve hepsi motorun kendi formülünü okur (battleUnitFactors,
// roundLosses) — pencere ile muharebe ayrışamaz.
//
// Motor bugün zaten HOI4'e yakın (örgütlenme/güç, genişlik, kuşatma, siper,
// nehir, planlama, generalin tecrübesi, cepte teslim). Eksik olan oyuncunun
// bunları GÖRMESİYDİ: savaş kör tıklamaydı.

import {
  BREAK_ORGANIZATION, MAX_ASSAULT_WIDTH, MAX_DEFENSE_DIVISIONS, MAX_ROUNDS, battleSides,
  battleUnitFactors, crossesRiver, leadGeneral, roundLosses, sidePower, tileDefense,
} from './battles.js';
import { generalSiegeRelief } from './command.js';
import { UNIT_TYPES, menUnderArms, organizationOf, strengthRatio } from './units.js';
import { provinceName } from './provinces.js';

/** Pencerede gösterilen çarpanlar: anahtar, ad, açıklama. */
const FACTORS = [
  ['terrain', 'Terrain & works', 'Terrain, city, fort and entrenchment of the defended province.'],
  ['river', 'River crossing', 'Attacking across a river costs a quarter of the strength.'],
  ['planning', 'Battle plan', 'A command that has prepared its plan attacks harder.'],
  ['general', 'Commander', 'The commander\'s skill and traits.'],
  ['doctrine', 'Doctrine', 'Attack or defence technology, advisors and ideas.'],
  ['powder', 'Gunpowder', 'Saltpeter supply: a shortage costs up to 30%.'],
  ['horses', 'Horses', 'Cavalry and artillery without horses are slowed.'],
  ['rubber', 'Rubber', 'Field telegraph and tyres, as far as rubber is met.'],
  ['support', 'Support arm', 'Artillery in a mixed stack +20%; alone it is brittle (−35%).'],
  ['supply', 'Encircled', 'Cut off with no way out: −25%. Close a pocket and it fights at three quarters.'],
];

/** Tarafın çarpanları: tümenlerin ham gücüyle ağırlıklı ortalama. */
function sideFactors(world, units, defending, relief, target) {
  const hasLine = units.some((unit) => !unit.type?.support);
  const sum = {};
  let weight = 0;
  for (const unit of units) {
    const f = battleUnitFactors(world, unit, defending, relief, target);
    const w = Math.max(1e-6, f.base);
    weight += w;
    const support = unit.type?.support ? (hasLine ? 1.2 : 0.65) : 1;
    for (const [key] of FACTORS) {
      const value = key === 'support' ? support : f[key];
      sum[key] = (sum[key] ?? 0) + value * w;
    }
  }
  return FACTORS.map(([key, label, tip]) => ({
    key, label, tip, value: weight > 0 ? sum[key] / weight : 1,
  })).filter((row) => Math.abs(row.value - 1) >= 0.005);
}

/** Kayıp defteri güç puanıdır; pencere insan yazar (alayın adam/güç oranı). */
function menPerStrength(units) {
  const regiment = units[0]?.regiments?.[0];
  if (regiment?.manpower && regiment.maxStrength) return regiment.manpower / regiment.maxStrength;
  return UNIT_TYPES.INFANTRY.manpower / 1000;
}

function sideOf(world, battle, units, defending, relief, target) {
  const nationId = defending ? battle.defenderNation : battle.attackerNation;
  const nation = world.nations[nationId];
  const general = leadGeneral(world, units);
  const men = units.reduce((sum, unit) => sum + menUnderArms(unit), 0);
  const strength = units.reduce((sum, unit) => sum + menUnderArms(unit) * strengthRatio(unit), 0);
  const organization = men > 0
    ? units.reduce((sum, unit) => sum + organizationOf(unit) * menUnderArms(unit), 0) / men : 0;
  return {
    nationId,
    name: nation?.name ?? '?',
    color: nation?.color ?? '#888',
    general: general ? { name: general.name, skill: general.skill, traits: [...(general.traits ?? [])] } : null,
    power: sidePower(world, units, defending, relief, target),
    men,
    strength: men > 0 ? strength / men : 0,
    organization,
    width: `${units.length} / ${defending ? MAX_DEFENSE_DIVISIONS : MAX_ASSAULT_WIDTH}`,
    losses: Math.round((defending ? battle.defenderLosses : battle.attackerLosses) * menPerStrength(units)),
    factors: sideFactors(world, units, defending, relief, target),
    divisions: units.map((unit) => ({
      id: unit.id,
      name: unit.type?.name ?? 'Division',
      glyph: unit.type?.glyph ?? '?',
      men: menUnderArms(unit),
      strength: strengthRatio(unit),
      organization: organizationOf(unit),
      entrenchment: unit.entrenchment ?? 0,
    })),
  };
}

/**
 * Bir muharebenin bütün penceresi. `playerNation` hangi tarafın "biz"
 * olduğunu söyler (tahmin cümlesi ona göre kurulur).
 */
export function battleView(world, battle, playerNation = -1) {
  if (!battle) return null;
  const tile = world.get(battle.q, battle.r);
  const { attackers, defenders } = battleSides(world, battle);
  const relief = generalSiegeRelief(leadGeneral(world, attackers));
  const attacker = sideOf(world, battle, attackers, false, relief, tile);
  const defender = sideOf(world, battle, defenders, true, relief, tile);
  const ratio = attacker.power / Math.max(1e-6, defender.power);

  // TAHMİN: zar ortalamasıyla (roll = 1) bir raundun örgütlenme kaybı; her
  // taraf kaç raundda kırılma eşiğine iner. Raunt = hafta.
  const loss = roundLosses(attacker.power, defender.power, attackers.length, defenders.length);
  const breaksIn = (org, perRound) => (org <= BREAK_ORGANIZATION ? 0
    : Math.ceil((org - BREAK_ORGANIZATION) / Math.max(0.1, perRound)));
  const left = Math.max(0, MAX_ROUNDS - battle.rounds);
  const attackerBreaks = breaksIn(attacker.organization, loss.attackerOrganizationLoss);
  const defenderBreaks = breaksIn(defender.organization, loss.defenderOrganizationLoss);
  let likely;
  if (Math.min(attackerBreaks, defenderBreaks) > left) likely = ratio > 1 ? 'attacker' : 'defender';
  else likely = defenderBreaks < attackerBreaks ? 'attacker'
    : attackerBreaks < defenderBreaks ? 'defender' : (ratio > 1 ? 'attacker' : 'defender');

  const river = attackers.some((unit) => crossesRiver(world, unit.tile, tile));
  return {
    id: battle.id,
    q: battle.q,
    r: battle.r,
    name: provinceName(tile),
    terrain: tile?.terrain?.name ?? '',
    defense: tile ? tileDefense(tile) : 0,
    river,
    round: battle.rounds,
    maxRounds: MAX_ROUNDS,
    started: battle.started,
    attacker,
    defender,
    ratio,
    forecast: { attackerBreaks, defenderBreaks, roundsLeft: left, likely },
    mine: battle.attackerNation === playerNation ? 'attacker'
      : battle.defenderNation === playerNation ? 'defender' : null,
  };
}
