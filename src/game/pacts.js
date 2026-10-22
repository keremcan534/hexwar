// SÖZLER VE BASKI — savaş kapısı, garanti, saldırmazlık paktı, toprak
// talebi, rakip ilanı, oyuncunun masası ve haftalık dış siyaset adımı
// (TASARIM §12; şartname scripts/audit/_tmp/pass/design/diplomacy.md).
//
// SAVAŞ KAPISI BURADA: YZ'nin "saldırayım mı" kararı (ai.js diplomacy) "kim
// kimin arkasında" sorusunun kimin kiminle savaştığını değiştirdiği TEK
// yerdir. YZ, Tehdit sütunu, garanti isteği ve talep aynı fonksiyonu okur;
// ekran ile karar ayrışamaz.
//
// OYUNCUNUN MASASI: oyuncuya düşen her kayıt (çağrı, teklif, talep) tek
// kapıdan çözülür (resolvePending): ekran, zaman aşımı, devredilmiş bakanlık
// ve denetim tezgâhı aynı fonksiyonu çağırır. İki değişmez: zaman aşımı
// oyuncuyu ASLA savaşa sokmaz ve ASLA yeni bir yükümlülük imzalamaz.
//
// Katman: game — DOM yok. Yeni zar YOK: her YZ kararı kayıtlı durum üstünde
// belirli bir eşiktir, ulus kimliği sırasıyla, sabit bir takvimde.

import {
  WAR_COST, atWar, attackerCount, declareWar, hasClaimOn, nationStrength, relation, truceLeft,
  truceLengthFor, warBlockers,
} from './diplomacy.js';
import { allianceAppeal, allianceVerdict, alliesOf, formAlliance, isAllied, MAX_ALLIES } from './alliances.js';
import { capitalProvinceOf, invalidateWarCosts, provinceValue, realmShare, warScore } from './peace.js';
import { INFAMY_COALITION, addInfamy, provinceAnnexInfamy } from './infamy.js';
import { isMilitia, regimentCount } from './units.js';
import { TIER, announce, remember } from './chronicle.js';
import { calendarYear } from './calendar.js';
import { scoreboard } from './hegemony.js';
import { worldWarTension } from './worldEvents.js';
import { noteDelegated } from './delegation.js';
import { runVassals } from './vassals.js';
import {
  alliedPair, cbOf, deed, defendersOf, dropPending, ensureDiplo, envoyBlockers, findPending, grantPassage,
  guaranteeBond, guaranteeOf, guaranteesGiven, guarantorsOf, hostilePair, hostileWithAnyone, markFaithless, napOf,
  napsOf, noteDiplomacy, overlordIdOf, pendingFor, postEnvoy, proposalGate, pushPending, pushProposal, recallEnvoy,
  regardOf, removePair, removeTreaty, tendEnvoys, vassalBond,
} from './relations.js';
import {
  ALLIANCE_RULES, DEMAND, DIP_AI, ENVOY, FAITHLESS, GUARANTEE, NAP, QUARTER, QUARTER_OFFSET, READ, RIVAL,
  WAR_GATE,
} from './dipDefs.js';

export { noteDiplomacy } from './relations.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const turnOf = (game) => game.turns?.turn ?? game.world.turn ?? 0;
const playerOf = (game) => game.turns?.playerNation ?? -1;
const nameOf = (world, id) => world.nations[id]?.name ?? '?';
const provinceLabel = (province) => province?.name ?? 'a province';
const centerOf = (province) => (province?.center ? { q: province.center.q, r: province.center.r } : null);
const signedText = (v, digits = 1) => {
  const r = Number(v.toFixed(digits));
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`;
};

/** Oyuncunun ekranına düşen kart (yalnız oyuncu bir tarafsa). */
function tellPlayer(game, nationId, spec) {
  if (nationId !== playerOf(game)) return;
  const nation = game.world.nations[nationId];
  if (nation) announce(game, nation, spec);
}

// ------------------------------------------------------- SAVAŞ KAPISI ---

/**
 * Zar SONRASI hazırlık kapıları (ai.js'in sırasıyla aynı). Saf okuma: zar
 * dizisini değiştirmez. Sebepler üçüncü şahısla yazılır: Tehdit sütunu
 * "able · not ready" altında ilkini basar.
 */
export function warReadiness(world, nation) {
  const reasons = [];
  // Milis savaş açtırmaz: yalnız kendi toprağını tutar (D6).
  let regiments = 0;
  for (const unit of world.units) {
    if (unit.nationId === nation.id && unit.type.domain === 'land' && !isMilitia(unit)) regiments += regimentCount(unit);
  }
  // İkmali sıkışık ülke savaş açmaz: faturalar çıktının %45'ini aşıyorsa
  // seferberlik onu krize iter.
  const bills = nation.economy?.bills;
  const strained = bills && (bills.s < 1
    || bills.owed > WAR_GATE.BILL_STRAIN * (nation.economy?.ic?.output ?? Infinity));
  if (regiments < WAR_GATE.MIN_REGIMENTS) reasons.push(`Fewer than ${WAR_GATE.MIN_REGIMENTS} regiments`);
  if (strained) reasons.push('Supply bills are strained');
  if ((nation.stability ?? 0.6) < WAR_GATE.MIN_STABILITY) reasons.push('Their government is unstable');
  if ((nation.warSupport ?? 0.5) < WAR_GATE.MIN_WAR_SUPPORT) reasons.push('Their people will not support a war');
  if ((nation.power ?? 0) < WAR_GATE.MIN_POWER) reasons.push('Too little political power to declare');
  if ((nation.politics?.exhaustion ?? 0) > WAR_GATE.NO_WAR_EXHAUSTION) reasons.push('They are war-weary');
  if ((nation.infamy ?? 0) > INFAMY_COALITION * WAR_GATE.INFAMY_SHARE) {
    reasons.push('Their infamy is too high to risk a coalition');
  }
  // İki cephesi olan devlet üçüncüsünü kendisi açmaz (audit:war-pressure).
  if (attackerCount(world, nation.id) >= WAR_GATE.MAX_ATTACKERS) reasons.push('They already fight on two fronts');
  return { ready: reasons.length === 0, reasons };
}

/**
 * SALDIRI ORANI. `myPower` dışarıdan gelir (ai.js haftada bir kez hesaplar)
 * ve güçler canlıdır: döngüde sonra gelen ulus aynı hafta kurulan alayı görür.
 *
 * BİT EŞLİĞİ: müttefik toplamı ANLAŞMA SIRASIYLA ve bugünkü reduce ile
 * toplanır (kayan noktada sıra önemlidir). Garantör ve vassal bağı yoksa
 * `extra === 0` ve `allied + 0 === allied`. Oran ve karşılaştırma bugünküyle
 * bayt bayt aynıdır (şartname §3.2, §18.1).
 *
 * İlişki EŞİĞİ YOK (R2a ölçüldü ve silindi): sevdiği komşuya saldırmak için
 * ×(1 + ilişki/100) üstünlük isteyen çarpan, 160×96 × 3 tohum × 20 yılda
 * tüm-YZ, büyük oyuncu-diplomat ve küçük oyuncu-diplomat koşularının (dokuz
 * koşu; elçi bizden güçlü en tehlikeli komşuda) HİÇBİRİNDE tek bir savaş
 * kararını döndürmedi. Kaldırılınca tüm kollar açıkken parmak izi aynı kaldı.
 * İlişki savaş kararını yalnız kin (R2b) olarak sıralar.
 */
export function aggressionOdds(world, attacker, target, { myPower, tension, turn = world.turn ?? 0 }) {
  const allied = alliesOf(target).reduce((sum, id) => {
    const ally = world.nations[id];
    return ally?.alive && ally.id !== attacker.id ? sum + nationStrength(world, ally) : sum;
  }, 0);
  let extra = 0;
  const guarantors = [];
  const bonds = [];
  for (const { id, bond } of defendersOf(world, target.id, null, turn)) {
    if (bond === 'ally' || id === attacker.id) continue;
    const strength = nationStrength(world, world.nations[id]);
    extra += strength;
    (bond === 'guarantor' ? guarantors : bonds).push({ id, bond, strength });
  }
  const own = nationStrength(world, target);
  const ratio = myPower / Math.max(1, own + WAR_GATE.ALLY_WEIGHT * (allied + extra));
  const regard = regardOf(world, attacker.id, target.id, turn);
  const needed = WAR_GATE.THRESHOLD * tension.threshold;
  return {
    ratio,
    needed,
    eligible: ratio >= needed,
    parts: { target: own, allied, guarantors, bonds, regard, threshold: tension.threshold },
  };
}

/** Hedef sıralamasının kin çarpanı (R2b): toprağımızı alan uygun hedefler arasında öne geçer. */
export function grudgeOf(odds) {
  return DIP_AI.relations ? 1 + Math.max(0, -(odds.parts.regard ?? 0)) / READ.GRUDGE_DIV : 1;
}

/**
 * KARAR SONDASI (audit:diplomacy "decision flips"). Varsayılan null; ai.js
 * hedef döngüsünde salt-okur çağırır. Oyunun kendisi asla kurmaz.
 */
let oddsProbe = null;
export function setOddsProbe(fn) {
  oddsProbe = typeof fn === 'function' ? fn : null;
}
export function hasOddsProbe() {
  return oddsProbe != null;
}
export function probeOdds(nation, other, odds, kind = 'odds') {
  if (oddsProbe) oddsProbe(nation, other, odds, kind);
}

/** S_b + 0.5 × arkasındakilerin gücü (a hariç): talebin ve izlemenin paydası. */
function backedStrength(world, b, excludeId, turn) {
  let sum = 0;
  for (const { id } of defendersOf(world, b, null, turn)) {
    if (id !== excludeId) sum += nationStrength(world, world.nations[id]);
  }
  return nationStrength(world, world.nations[b]) + WAR_GATE.ALLY_WEIGHT * sum;
}

/** YZ'nin bu hafta açtığı savaşları yürütme kuralı (ai.js ile aynı): meşgul mü? */
function busyAtWar(world, nation) {
  const wars = world.nations.filter((n) => n.alive && n.id !== nation.id && atWar(world, n.id, nation.id));
  if (!wars.length) return false;
  if (wars.length >= 2) return true;
  const committed = nationStrength(world, wars[0]);
  return !(nationStrength(world, nation) > committed * 2 && warScore(world, nation.id, wars[0].id) > 20);
}

/**
 * TEHDİT (yalnız görünüm): `them` bize saldırabilir mi? YZ'nin AYNI kapısı
 * (aggressionOdds + warReadiness + meşguliyet) cümleye çevrilir. "Could",
 * asla "will": zar ayda bir ve gerilimle çarpılı.
 */
export function threatView(world, them, me, turn = world.turn ?? 0, { voice = 'us' } = {}) {
  if (!them?.alive || !me?.alive || them.id === me.id) return null;
  if (hostilePair(world, them.id, me.id)) return null;
  // Bağlı çift birbirine saldıramaz (warBlockers): tehdit sorusu anlamsız.
  if (alliedPair(them, me.id) || vassalBond(world, them.id, me.id, turn)) return null;
  const our = voice === 'us' ? 'our' : 'their';
  const tension = worldWarTension(world, turn);
  const odds = aggressionOdds(world, them, me, { myPower: nationStrength(world, them), tension, turn });
  const ready = warReadiness(world, them);
  const busy = busyAtWar(world, them);
  const pact = napOf(them, me.id, turn);
  const truce = truceLeft(world, them.id, me.id, turn);
  const lines = [];
  const tensionNote = tension.threshold < 1 ? `, eased by world tension from ×${WAR_GATE.THRESHOLD.toFixed(1)}` : '';
  lines.push(`${them.name} has ×${odds.ratio.toFixed(1)} of the ×${odds.needed.toFixed(1)} it needs${tensionNote}.`);
  const behind = [
    ...alliesOf(me).filter((id) => world.nations[id]?.alive && id !== them.id).map((id) => `${our} ally ${nameOf(world, id)}`),
    ...odds.parts.guarantors.map((g) => `${our} guarantor ${nameOf(world, g.id)}`),
    ...odds.parts.bonds.map((b) => `${our} ${b.bond === 'overlord' ? 'overlord' : 'vassal'} ${nameOf(world, b.id)}`),
  ];
  if (behind.length) {
    const list = behind.join(', ');
    lines.push(`${list[0].toUpperCase()}${list.slice(1)} count${behind.length === 1 ? 's' : ''} at half ${behind.length === 1 ? 'its' : 'their'} strength.`);
  }
  let label = 'safe';
  if (pact) {
    lines.push(`A non-aggression pact binds them for ${Math.max(0, pact.until - turn)} more weeks.`);
  } else if (truce > 0) {
    lines.push(`A truce holds for ${truce} more weeks.`);
  } else if (odds.eligible) {
    if (ready.ready && !busy) {
      label = 'may attack';
      lines.push(`They are ready: each month they could roll for war (3 % × world tension ${tension.declare.toFixed(1)}).`);
    } else {
      label = 'able, not ready';
      lines.push(`Not ready: ${busy ? 'they are busy with another war' : ready.reasons[0]}.`);
    }
  }
  return {
    label, ratio: odds.ratio, needed: odds.needed, ready: ready.ready && !busy,
    reasons: ready.reasons, busy, pact: Boolean(pact), text: lines.join(' '), odds,
  };
}

// ---------------------------------------------- BAĞIMSIZLIK GARANTİSİ ---

/** Garanti neden verilemez (garantör `g`, korunan `p`). */
export function guaranteeBlockers(world, g, p, turn = world.turn ?? 0, { ai = false } = {}) {
  if (!g?.alive || !p?.alive || g.id === p.id) return ['No such nation'];
  const out = [];
  if (guaranteeOf(g, p.id)) return ['We already guarantee them'];
  if (alliedPair(g, p.id)) out.push('An alliance already defends them');
  if (hostilePair(world, g.id, p.id)) out.push('We are at war or under ultimatum with them');
  if (hostileWithAnyone(world, p.id)) out.push('A guarantee deters; it does not join a war in progress');
  if (g.rivalId === p.id || p.rivalId === g.id) out.push('Rivals guarantee nothing');
  const lord = overlordIdOf(world, p.id, turn);
  if (lord >= 0) out.push(`They are not independent: ${nameOf(world, lord)} is their overlord`);
  const myLord = overlordIdOf(world, g.id, turn);
  if (myLord >= 0) out.push(`Our foreign policy belongs to ${nameOf(world, myLord)}`);
  const ratio = nationStrength(world, g) / Math.max(1, nationStrength(world, p));
  if (ratio < GUARANTEE.RATIO) out.push(`Only a clearly stronger state can guarantee them (×${ratio.toFixed(1)} of ×${GUARANTEE.RATIO})`);
  const max = ai ? GUARANTEE.AI_MAX : GUARANTEE.MAX;
  if (guaranteesGiven(g).length >= max) out.push(`We already guarantee ${max} states`);
  if ((g.power ?? 0) < GUARANTEE.COST) out.push(`Needs ${GUARANTEE.COST} political power`);
  const regard = regardOf(world, p.id, g.id, turn);
  if (regard < READ.BREAK) out.push(`They distrust us (relations ${Math.round(regard)})`);
  return out;
}

/** Garanti ver: 20 SG + haftalık 0.15; korunanın defterine +20. */
export function giveGuarantee(game, g, pId, { ai = false, against = null } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  const p = world.nations[pId];
  if (guaranteeBlockers(world, g, p, turn, { ai }).length) return false;
  g.power -= GUARANTEE.COST;
  (g.treaties ??= []).push({ type: 'GUARANTEE', partner: pId, since: turn });
  deed(world, pId, g.id, 'guaranteed_us', turn);
  noteDiplomacy(game, {
    tier: 1, title: `${g.name} guarantees the independence of ${p.name}`,
    detail: against != null ? `Against ${nameOf(world, against)}.` : '',
    actors: [g.id, pId], key: `guar:${g.id}:${pId}`,
  });
  tellPlayer(game, pId, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `guar:${g.id}`,
    title: `${g.name} guarantees our independence${against != null ? ` against ${nameOf(world, against)}` : ''}`,
    detail: 'If anyone declares war on us, they are called to our side. Their strength now counts in every attacker\'s odds.',
  });
  tellPlayer(game, g.id, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `guar:${pId}`,
    title: `We guarantee ${p.name}'s independence`,
    detail: `Any attack on them calls us to arms. It costs ${GUARANTEE.UPKEEP} political power a week; abandoning them under threat would cost far more.`,
  });
  game.emit?.('diplomacy');
  return true;
}

/** Korunan şu an tehdit altında mı (savaş, ültimatom ya da bekleyen talep)? */
export function protegeThreatened(world, pId) {
  if (hostileWithAnyone(world, pId)) return true;
  return (world.diplo?.pending ?? []).some((rec) => rec.kind === 'demand' && rec.to === pId);
}

/**
 * Garantiyi geri çek. Sakin günde ufak bir kırgınlık (−15); tehdit altında
 * terk (−40, bütün ortaklar −10, prestij −5, vakayiname).
 */
export function revokeGuarantee(game, g, pId, { calm = false } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  const p = world.nations[pId];
  if (!guaranteeOf(g, pId)) return false;
  const threatened = !calm && protegeThreatened(world, pId);
  removeTreaty(g, 'GUARANTEE', pId);
  if (threatened) abandonBill(game, g, pId, turn);
  else deed(world, pId, g.id, 'revoked', turn);
  if (!threatened) {
    tellPlayer(game, g.id, {
      kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `guar:${pId}`,
      title: `We withdraw our guarantee of ${p?.name ?? '?'}`,
      detail: `${p?.name ?? 'They'} take it as a slight (relations −15).`,
    });
    tellPlayer(game, pId, {
      kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `guar:${g.id}`,
      title: `${g.name} withdraws its guarantee of our independence`,
      detail: 'They no longer answer for us.',
    });
  }
  game.emit?.('diplomacy');
  return true;
}

/** Terkin faturası: kurban −40, bütün ortaklar −10, prestij −5, tarih. */
function abandonBill(game, g, pId, turn) {
  const world = game.world;
  const p = world.nations[pId];
  deed(world, pId, g.id, 'abandoned', turn);
  markFaithless(world, g.id, pId, FAITHLESS.abandoned, turn);
  g.prestige = Math.max(0, (g.prestige ?? 0) - GUARANTEE.ABANDON_PRESTIGE);
  noteDiplomacy(game, {
    tier: 2, title: `${g.name} abandons ${p?.name ?? '?'}`,
    detail: 'The guarantee was withdrawn when it was needed.',
    actors: [g.id, pId], key: `guar:${g.id}:${pId}`,
  });
  tellPlayer(game, g.id, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `guar:${pId}`,
    title: `We abandoned ${p?.name ?? '?'}`,
    detail: `Prestige −${GUARANTEE.ABANDON_PRESTIGE}; ${p?.name ?? 'they'} will not forget (relations −40), and every partner of ours trusts us less (−10).`,
  });
  tellPlayer(game, pId, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `guar:${g.id}`,
    title: `${g.name} abandons us`,
    detail: 'Our guarantor walked away when we needed it.',
  });
}

/** Çeyreklik: amacını yitiren garanti sessizce düşer (deed yok). */
function lapseGuarantees(game, turn) {
  const world = game.world;
  for (const g of world.nations) {
    for (const t of guaranteesGiven(g)) {
      const p = world.nations[t.partner];
      let why = null;
      if (!g.alive || !p?.alive) why = 'one of us is gone';
      else if (nationStrength(world, p) > nationStrength(world, g)) why = `${p.name} is now the stronger state`;
      else if (overlordIdOf(world, p.id, turn) >= 0) why = `${p.name} is now a vassal`;
      else if (alliedPair(g, p.id)) why = 'our alliance supersedes it';
      if (!why) continue;
      removeTreaty(g, 'GUARANTEE', t.partner);
      for (const [me, other] of [[g.id, t.partner], [t.partner, g.id]]) {
        tellPlayer(game, me, {
          kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `guar:${other}`,
          title: `The guarantee between us and ${nameOf(world, other)} lapses`,
          detail: `${why[0].toUpperCase()}${why.slice(1)}.`,
        });
      }
    }
  }
}

// --------------------------------------------- SALDIRMAZLIK PAKTI ---

/** Pakt hükmü: `ev` gözünden, `other` ile beş yıl barış ister mi? Kabul ≥ 1. */
export function napVerdict(world, ev, other, turn = world.turn ?? 0) {
  const parts = [];
  const push = (label, value) => { if (value !== 0) parts.push({ label, value }); };
  push('Relations', regardOf(world, ev.id, other.id, turn) / READ.NAP_DIV);
  const ratio = nationStrength(world, other) / Math.max(1, nationStrength(world, ev));
  // Zayıf güçlüyle barış ister; güçlü elini bağlamakla bir şey kazanmaz.
  push('Their strength', clamp(Math.log2(Math.max(1e-6, ratio)), -1, 1.5));
  const busy = world.nations.some((n) => n.alive && n.id !== ev.id && n.id !== other.id && hostilePair(world, ev.id, n.id))
    || (ev.rivalId != null && ev.rivalId !== other.id && world.nations[ev.rivalId]?.alive);
  if (busy) push('Busy elsewhere', 1);
  if (hasClaimOn(world, ev.id, other.id)) push('We claim their land', -1.5);
  push('Their infamy', -clamp(((other.infamy ?? 0) - 8) / 7, 0, 2));
  let sum = 0;
  for (const part of parts) sum += part.value;
  return { accept: sum >= NAP.VERDICT, sum, threshold: NAP.VERDICT, parts };
}

/** Pakt neden imzalanamaz (`a` teklif eder). */
export function napBlockers(world, a, b, turn = world.turn ?? 0, { ai = false, renew = false, bCap = null } = {}) {
  if (!a?.alive || !b?.alive || a.id === b.id) return ['No such nation'];
  const out = [];
  if (hostilePair(world, a.id, b.id)) out.push('We are at war or under ultimatum');
  if (alliedPair(a, b.id)) out.push('Allies need no pact');
  const current = napOf(a, b.id, turn);
  if (current && !renew) out.push(`A pact is already in force: renew in its last ${NAP.RENEW_WINDOW} weeks`);
  if (renew) {
    if (!current) out.push('No pact to renew');
    else if (current.denounced != null) out.push('The pact has been denounced');
    else if (current.until - turn > NAP.RENEW_WINDOW) out.push(`Renewal opens in its last ${NAP.RENEW_WINDOW} weeks`);
  }
  if (vassalBond(world, a.id, b.id, turn)) out.push('A vassal bond already binds us');
  const lordA = overlordIdOf(world, a.id, turn);
  const lordB = overlordIdOf(world, b.id, turn);
  if (lordB >= 0 && lordB !== a.id) out.push(`Their foreign policy belongs to ${nameOf(world, lordB)}`);
  if (lordA >= 0 && lordA !== b.id) out.push(`Our foreign policy belongs to ${nameOf(world, lordA)}`);
  if (a.rivalId === b.id || b.rivalId === a.id) out.push('Rivals sign nothing');
  // Ev ödevi sınırı: oyuncu üç, YZ iki pakt tutar.
  const max = ai ? NAP.AI_MAX : NAP.MAX;
  const theirs = bCap ?? max;
  if (!renew && napsOf(a, turn).length >= max) out.push(`We already hold ${max} pacts`);
  if (!renew && napsOf(b, turn).length >= theirs) out.push(`They already hold ${theirs} pacts`);
  if ((a.power ?? 0) < NAP.COST) out.push(`Needs ${NAP.COST} political power`);
  return out;
}

/** Pakt imzalanır; teklif eden öder. İki listede aynı `until`. */
export function signNap(game, a, b) {
  const world = game.world;
  const turn = turnOf(game);
  a.power -= NAP.COST;
  const until = turn + NAP.WEEKS;
  removePair(world, a.id, b.id, 'NAP');
  (a.treaties ??= []).push({ type: 'NAP', partner: b.id, since: turn, until });
  (b.treaties ??= []).push({ type: 'NAP', partner: a.id, since: turn, until });
  deed(world, a.id, b.id, 'pact', turn);
  deed(world, b.id, a.id, 'pact', turn);
  noteDiplomacy(game, {
    tier: 1, title: `${a.name} and ${b.name} sign a non-aggression pact`,
    detail: `Neither may declare war on the other until ${calendarYear(until)}.`,
    actors: [a.id, b.id], key: `nap:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`,
  });
  for (const [me, other] of [[a, b], [b, a]]) {
    tellPlayer(game, me.id, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `nap:${other.id}`,
      title: `Non-aggression pact with ${other.name}`,
      detail: `For five years neither of us may declare war on the other (until ${calendarYear(until)}). A denunciation gives ${NAP.NOTICE} weeks' notice.`,
    });
  }
  game.emit?.('diplomacy');
  return true;
}

/** Oyuncunun pakt teklifi: karşı tarafın hükmü ≥ 1 ise imzalanır. */
export function proposeNap(game, a, bId) {
  const world = game.world;
  const turn = turnOf(game);
  const b = world.nations[bId];
  const blockers = napBlockers(world, a, b, turn);
  if (blockers.length) return { ok: false, reason: blockers[0] };
  const verdict = napVerdict(world, b, a, turn);
  if (!verdict.accept) return { ok: false, reason: refusalText(b, verdict) };
  signNap(game, a, b);
  return { ok: true };
}

/** Paktı yenile: son 26 haftada, karşı tarafın hükmü hâlâ geçiyorsa beş yıl daha. */
export function renewNap(game, a, bId) {
  const world = game.world;
  const turn = turnOf(game);
  const b = world.nations[bId];
  const blockers = napBlockers(world, a, b, turn, { renew: true });
  if (blockers.length) return { ok: false, reason: blockers[0] };
  const verdict = napVerdict(world, b, a, turn);
  if (!verdict.accept) return { ok: false, reason: refusalText(b, verdict) };
  a.power -= NAP.COST;
  for (const [x, y] of [[a, b], [b, a]]) {
    const t = napOf(x, y.id, turn);
    if (t) t.until += NAP.WEEKS;
  }
  tellPlayer(game, a.id, {
    kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `nap:${b.id}`,
    title: `Pact with ${b.name} renewed`, detail: `Five more years, until ${calendarYear(napOf(a, b.id, turn).until)}.`,
  });
  game.emit?.('diplomacy');
  return { ok: true };
}

/** Feshi bildir: 26 hafta sonra pakt düşer; ortak kırılır (−15). */
export function denounceNap(game, by, partnerId) {
  const world = game.world;
  const turn = turnOf(game);
  const partner = world.nations[partnerId];
  const mine = napOf(by, partnerId, turn);
  if (!mine || mine.denounced != null) return false;
  const until = Math.min(mine.until, turn + NAP.NOTICE);
  for (const [x, y] of [[by, partner], [partner, by]]) {
    const t = napOf(x, y?.id, turn);
    if (t) { t.until = until; t.denounced = by.id; }
  }
  deed(world, partnerId, by.id, 'denounced', turn);
  noteDiplomacy(game, {
    tier: 1, title: `${by.name} denounces its pact with ${partner?.name ?? '?'}`,
    detail: `The pact ends in ${until - turn} weeks.`,
    actors: [by.id, partnerId], key: `nap:${Math.min(by.id, partnerId)}:${Math.max(by.id, partnerId)}`,
  });
  tellPlayer(game, by.id, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `nap:${partnerId}`,
    title: `We denounce our pact with ${partner?.name ?? '?'}`,
    detail: `It ends in ${until - turn} weeks; ${partner?.name ?? 'they'} take it badly (relations −15).`,
  });
  tellPlayer(game, partnerId, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `nap:${by.id}`,
    title: `${by.name} denounces our pact`,
    detail: `The non-aggression pact ends in ${until - turn} weeks. After that they may declare war.`,
  });
  game.emit?.('diplomacy');
  return true;
}

function refusalText(nation, verdict) {
  const worst = [...verdict.parts].sort((x, y) => x.value - y.value)[0];
  return `${nation.name} declines${worst && worst.value < 0 ? `: ${worst.label} ${signedText(worst.value)}` : ''}`;
}

// -------------------------------------------------- TOPRAK TALEBİ ---

/**
 * Talep edilebilir province'ler: `b`nin, `a`ya bitişik, başkent olmayan ve
 * hakkımız olan (iddia, halkımız ya da yurdumuz) kümeleri; değerliden ucuza.
 */
export function demandCandidates(world, a, b) {
  const na = world.nations[a];
  if (!na) return [];
  const mine = new Set();
  for (const province of world.provinces ?? []) {
    if (province.owner === a) for (const id of province.neighbors ?? []) mine.add(id);
  }
  const claims = new Set(na.claims ?? []);
  const capital = capitalProvinceOf(world, b);
  const out = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== b || !province.econ || !province.center || province === capital) continue;
    if (!mine.has(province.id)) continue;
    if (!(claims.has(province.id) || province.culture === na.culture || province.homeland === na.culture)) continue;
    out.push(province);
  }
  return out
    .map((province) => ({ province, value: provinceValue(world, province) }))
    .sort((x, y) => y.value - x.value || x.province.id - y.province.id)
    .map((row) => row.province);
}

/** İkisi arasında bekleyen bir talep var mı (oyuncuya ya da oyuncudan)? */
export function pendingDemandBetween(world, a, b) {
  return (world.diplo?.pending ?? []).find((rec) => rec.kind === 'demand'
    && ((rec.from === a && rec.to === b) || (rec.from === b && rec.to === a))) ?? null;
}

/** Talep neden yapılamaz (`a` ister, `b` verir). */
export function demandBlockers(world, a, b, turn = world.turn ?? 0, { province = null } = {}) {
  if (!a?.alive || !b?.alive || a.id === b.id) return ['No such nation'];
  const out = [];
  const candidates = demandCandidates(world, a.id, b.id);
  if (!candidates.length) out.push('None of their provinces on our border is ours by right (a claim, our people or our homeland)');
  else if (province && !candidates.includes(province)) out.push('Not a province we can claim by right');
  if (hostilePair(world, a.id, b.id)) out.push('We are already at war or under ultimatum');
  const truce = truceLeft(world, a.id, b.id, turn);
  if (truce > 0) out.push(`Truce: ${truce} more weeks`);
  if (alliedPair(a, b.id)) out.push('We are allied');
  if (napOf(a, b.id, turn)) out.push('A non-aggression pact binds us');
  if (guaranteeBond(world, a.id, b.id)) out.push('A guarantee binds us');
  if (vassalBond(world, a.id, b.id, turn)) out.push('A vassal bond binds us');
  if (pendingDemandBetween(world, a.id, b.id)) out.push('A demand is already on the table');
  if (cbOf(a, b.id, turn)) out.push('We already hold a cause for war against them: use it or let it lapse');
  if ((a.power ?? 0) < DEMAND.COST) out.push(`Needs ${DEMAND.COST} political power`);
  if ((a.politics?.exhaustion ?? 0) > DEMAND.MAX_EXHAUSTION) out.push('Our people are too war-weary to threaten war');
  if (attackerCount(world, b.id) >= DEMAND.MAX_TARGET_ATTACKERS) out.push('Three nations are already at war with them');
  const fronts = world.nations.filter((n) => n.alive && n.id !== a.id && hostilePair(world, a.id, n.id)).length;
  if (fronts >= DEMAND.MAX_OWN_HOSTILE) out.push('We already fight on two fronts');
  return out;
}

/**
 * TALEBİN HÜKMÜ, hedefin gözünden: toplam ≥ 0 ise verir. Parçalar cümle
 * olarak basılır ("refuse −0.4: overmatch +0.1 · our will −0.4 · ...").
 */
export function demandVerdict(world, b, a, province, turn = world.turn ?? 0) {
  const parts = [];
  const push = (label, value) => { if (value !== 0) parts.push({ label, value }); };
  const overmatch = Math.log2(Math.max(1e-6, nationStrength(world, a) / Math.max(1, backedStrength(world, b.id, a.id, turn)))) - 1;
  push('Overmatch', overmatch);
  push('Their will', -2 * ((b.warSupport ?? 0.5) - 0.4));
  if (province) push(`${provinceLabel(province)} is ${Math.round(realmShare(world, province) * 100)}% of their realm`, -4 * realmShare(world, province));
  push('Their exhaustion', b.politics?.exhaustion ?? 0);
  push('Relations', regardOf(world, b.id, a.id, turn) / READ.DEMAND_DIV);
  if (province && province.culture === b.culture) push('Their own people live there', -1);
  let sum = 0;
  for (const part of parts) sum += part.value;
  return { yield: sum >= 0, sum, threshold: 0, parts };
}

/**
 * "Ver ya da savaş." 25 SG ve +2 şöhret peşin; YZ hedef hemen karar verir,
 * oyuncu hedefe dört haftalık durduran kart düşer.
 * @returns {'yielded'|'refused'|'pending'|'war'|'backed'|null}
 */
export function issueDemand(game, a, bId, provinceId) {
  const world = game.world;
  const turn = turnOf(game);
  const b = world.nations[bId];
  const province = world.provinces?.[provinceId] ?? null;
  if (!province || demandBlockers(world, a, b, turn, { province }).length) return null;
  a.power -= DEMAND.COST;
  addInfamy(a, DEMAND.ISSUE_INFAMY);
  noteDiplomacy(game, {
    tier: 1, title: `${a.name} demands ${provinceLabel(province)} from ${b.name}`,
    actors: [a.id, bId], at: centerOf(province), key: `demand:${a.id}:${province.id}`,
  });
  if (bId === playerOf(game)) {
    const verdict = demandVerdict(world, b, a, province, turn);
    const rec = pushPending(world, {
      kind: 'demand', from: a.id, to: bId, province: province.id, turn, expires: turn + DEMAND.WINDOW, answer: null,
    });
    const delegated = Boolean(b.delegation?.diplomacy);
    announce(game, b, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `demand:${rec.id}`, halt: !delegated, ttl: 0,
      tile: province.center ?? null,
      title: `${a.name} demands ${provinceLabel(province)}`,
      detail: `Yield it, or refuse and they hold a free cause for war for a year. Unanswered in ${DEMAND.WINDOW} weeks, the cabinet decides as ${a.name} expects: ${verdict.yield ? 'yield' : 'refuse'} (${verdictParts(verdict)}). Answer in Diplomacy (P).`,
    });
    game.emit?.('diplomacy');
    return 'pending';
  }
  const verdict = demandVerdict(world, b, a, province, turn);
  if (verdict.yield) {
    applyYield(game, a, b, province);
    return 'yielded';
  }
  return refuseDemand(game, a, b, province);
}

function verdictParts(verdict) {
  return verdict.parts.map((p) => `${p.label} ${signedText(p.value)}`).join(' · ') || 'nothing either way';
}

/** Province savaşsız el değiştirir: ilhak şöhretinin 3/4'ü, iki yıl ateşkes. */
function applyYield(game, a, b, province) {
  const world = game.world;
  const turn = turnOf(game);
  const rec = relation(world, a.id, b.id);
  const repeats = rec?.wars ?? 0;
  const repeatScale = Math.min(2.5, 1 + 0.5 * Math.max(0, repeats - 1));
  // Şöhret devirden ÖNCE ölçülür (vassals.annexVassal gibi): halk ve yurt
  // yeni sahibin kabul ettikleriyle karşılaştırılır.
  const infamy = DEMAND.YIELD_INFAMY_SHARE * provinceAnnexInfamy(world, province, a) * repeatScale;
  addInfamy(a, infamy);
  game.turns.claimAtPeace(province.center, a.id);
  if (rec) {
    rec.wars = (rec.wars ?? 0) + 1;
    rec.truceUntil = Math.max(rec.truceUntil ?? 0, turn + Math.max(DEMAND.TRUCE, truceLengthFor(rec.wars)));
  }
  a.prestige = (a.prestige ?? 0) + DEMAND.PRESTIGE;
  b.prestige = Math.max(0, (b.prestige ?? 0) - DEMAND.PRESTIGE);
  deed(world, b.id, a.id, 'took_land', turn);
  deed(world, b.id, a.id, 'yielded_to', turn);
  deed(world, b.id, a.id, 'demanded', turn);
  remember(a, turn, 'took_land_from', b.id);
  remember(b, turn, 'lost_land_to', a.id);
  invalidateWarCosts(world);
  game.renderer?.invalidateCache?.();
  noteDiplomacy(game, {
    tier: 2, title: `${b.name} cedes ${provinceLabel(province)} to ${a.name} without a war`,
    detail: `${Math.round(infamy * 10) / 10} infamy; a truce of ${Math.max(DEMAND.TRUCE, truceLengthFor(rec?.wars ?? 1))} weeks.`,
    actors: [a.id, b.id], at: centerOf(province), key: `demand:${a.id}:${province.id}`,
  });
  tellPlayer(game, a.id, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `demand-out:${b.id}`, tile: province.center ?? null,
    title: `${b.name} yields ${provinceLabel(province)}`,
    detail: `It is ours without a war: infamy +${infamy.toFixed(1)}, prestige +${DEMAND.PRESTIGE}, and a truce of ${Math.max(DEMAND.TRUCE, truceLengthFor(rec?.wars ?? 1))} weeks.`,
  });
  tellPlayer(game, b.id, {
    kind: 'PEACE', tier: TIER.MAJOR, key: `demand-in:${a.id}`, tile: province.center ?? null,
    title: `We yielded ${provinceLabel(province)} to ${a.name}`,
    detail: `No war; prestige −${DEMAND.PRESTIGE}. A truce now holds for ${Math.max(DEMAND.TRUCE, truceLengthFor(rec?.wars ?? 1))} weeks.`,
  });
  game.emit?.('diplomacy');
  game.emit?.('provinces', null);
}

/**
 * Ret: isteyen bir yıllık bedava savaş gerekçesi alır. YZ isteyen hemen
 * (taze oranla) savaşla izler ya da geri adım atar; oyuncu isteyen gerekçeyi
 * bir yıl elinde tutar.
 */
function refuseDemand(game, a, b, province) {
  const world = game.world;
  const turn = turnOf(game);
  deed(world, b.id, a.id, 'demanded', turn);
  removeTreaty(a, 'CB', b.id);
  (a.treaties ??= []).push({ type: 'CB', partner: b.id, since: turn, expires: turn + DEMAND.CB_WEEKS, province: province.id });
  if (a.id === playerOf(game)) {
    announce(game, a, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `demand-out:${b.id}`, tile: province.center ?? null,
      title: `${b.name} refuses to yield ${provinceLabel(province)}`,
      detail: `We hold a free cause for war against them for ${DEMAND.CB_WEEKS} weeks. If we let it lapse, we have backed down.`,
    });
    game.emit?.('diplomacy');
    return 'refused';
  }
  return followThrough(game, a, b, province);
}

/** YZ isteyen reddi izler (oran ≥ 1.5 ve kapı açık) ya da geri adım atar. */
function followThrough(game, a, b, province) {
  const world = game.world;
  const turn = turnOf(game);
  const ratio = nationStrength(world, a) / Math.max(1, backedStrength(world, b.id, a.id, turn));
  if (ratio >= DEMAND.FOLLOW_RATIO && !warBlockers(world, a.id, b.id, turn, 'demand').length
    && declareWar(game, a.id, b.id, { reason: 'demand', goal: province.id })) {
    removeTreaty(a, 'CB', b.id);
    return 'war';
  }
  backDown(game, a, b, province);
  return 'backed';
}

/** Geri adım: prestij el değiştirir, gerekçe düşer. */
function backDown(game, a, b, province) {
  const world = game.world;
  a.prestige = Math.max(0, (a.prestige ?? 0) - DEMAND.PRESTIGE);
  b.prestige = (b.prestige ?? 0) + DEMAND.PRESTIGE;
  removeTreaty(a, 'CB', b.id);
  noteDiplomacy(game, {
    tier: 1, title: `${a.name} backs down over ${provinceLabel(province)}`,
    actors: [a.id, b.id], at: centerOf(province), key: `demand:${a.id}:${province?.id ?? 'x'}`,
  });
  tellPlayer(game, a.id, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `demand-out:${b.id}`,
    title: `We backed down over ${provinceLabel(province)}`,
    detail: `Prestige −${DEMAND.PRESTIGE}; ${b.name} gains what we lost.`,
  });
  tellPlayer(game, b.id, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `demand-in:${a.id}`,
    title: `${a.name} backs down over ${provinceLabel(province)}`,
    detail: `Our refusal stood: prestige +${DEMAND.PRESTIGE}.`,
  });
  game.emit?.('diplomacy');
}

// ------------------------------------------------------- RAKİP İLANI ---

export function rivalBlockers(world, me, target, turn = world.turn ?? 0) {
  if (!me?.alive || !target?.alive || me.id === target.id) return ['No such nation'];
  const out = [];
  if (me.rivalId === target.id && me.rivalChosen != null) return ['Already our declared rival'];
  if (alliedPair(me, target.id)) out.push('They are our ally');
  if (vassalBond(world, me.id, target.id, turn)) out.push('A vassal bond binds us');
  if (napOf(me, target.id, turn)) out.push('A non-aggression pact binds us');
  if (guaranteeOf(me, target.id)) out.push('We guarantee their independence');
  const ratio = nationStrength(world, target) / Math.max(1, nationStrength(world, me));
  if (ratio < RIVAL.MIN_RATIO) out.push(`Too small to be a rival (×${ratio.toFixed(2)} of ×${RIVAL.MIN_RATIO})`);
  if ((me.rivalLockUntil ?? 0) > turn) out.push(`Rival locked until ${calendarYear(me.rivalLockUntil)}`);
  if ((me.power ?? 0) < RIVAL.COST) out.push(`Needs ${RIVAL.COST} political power`);
  return out;
}

/** Rakibi oyuncu seçer (DIP-05): 25 SG, iki yıl kilit, haklı savaş hedefi. */
export function declareRival(game, me, targetId) {
  const world = game.world;
  const turn = turnOf(game);
  const target = world.nations[targetId];
  const blockers = rivalBlockers(world, me, target, turn);
  if (blockers.length) return { ok: false, reason: blockers[0] };
  me.power -= RIVAL.COST;
  me.rivalId = targetId;
  me.rivalChosen = turn;
  me.rivalLockUntil = turn + RIVAL.LOCK;
  deed(world, targetId, me.id, 'named_rival', turn);
  noteDiplomacy(game, {
    tier: 1, title: `${me.name} declares ${target.name} its rival`, actors: [me.id, targetId], key: `rival:${me.id}`,
  });
  tellPlayer(game, me.id, {
    kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `rival:${targetId}`,
    title: `${target.name} is now our declared rival`,
    detail: `War on them is justified (${WAR_COST.justified} political power); nations that share this rival lean toward us. Locked until ${calendarYear(me.rivalLockUntil)}.`,
  });
  game.emit?.('diplomacy');
  return { ok: true };
}

/** Rakibi bırak: bedava, kilit sürer; yıllık tazeleme yeniden atar. */
export function clearRival(game, me) {
  if (me.rivalChosen == null) return false;
  me.rivalChosen = null;
  me.rivalId = null;
  game.emit?.('diplomacy');
  return true;
}

// ------------------------------------------- OYUNCUNUN ELLE EYLEMLERİ ---

/**
 * Oyuncunun ittifak teklifi: karşı taraf YZ'nin AYNI ölçüsüyle tartar
 * (allianceVerdict, eşik 2 — DIP-08). Ret, hükmün en büyük eksi parçasını söyler.
 */
export function proposeAlliance(game, me, targetId) {
  const world = game.world;
  const turn = turnOf(game);
  const target = world.nations[targetId];
  const verdict = allianceVerdict(world, target, me, turn);
  if (!verdict.accept) {
    const worst = [...verdict.parts].sort((x, y) => x.value - y.value)[0];
    const reason = verdict.blockers[0]
      ?? (worst && worst.value < 0 ? `${worst.label} ${signedText(worst.value)}` : `${verdict.sum.toFixed(1)} of ${verdict.threshold}: they see no reason`);
    game.turns?.addLog?.(`${target?.name ?? 'They'} decline the alliance: ${reason}.`, { kind: 'DIPLOMACY', key: `ally-no:${targetId}` });
    return { ok: false, reason };
  }
  if (!formAlliance(world, me.id, targetId, turn)) return { ok: false, reason: 'The alliance could not be formed' };
  announce(game, me, {
    kind: 'PEACE', tier: TIER.MAJOR, key: `ally:${targetId}`,
    title: `Alliance with ${target.name}`, detail: 'An attack on one is a call to the other.',
  });
  noteDiplomacy(game, {
    tier: 1, title: `${me.name} and ${target.name} conclude an alliance`,
    actors: [me.id, targetId], key: `alliance:${Math.min(me.id, targetId)}:${Math.max(me.id, targetId)}`,
  });
  game.emit?.('diplomacy');
  return { ok: true };
}

/** Elçi gönder: haftada 0.2 SG; ev sahibinin defterinde haftada +0.8, +40'a kadar. */
export function sendEnvoy(game, me, targetId) {
  const world = game.world;
  const blockers = envoyBlockers(world, me, targetId);
  if (blockers.length) return { ok: false, reason: blockers[0] };
  postEnvoy(world, me, targetId);
  tellPlayer(game, me.id, {
    kind: 'POLITICS', tier: TIER.AMBIENT, key: `envoy:${targetId}`,
    title: `Our envoy arrives at ${nameOf(world, targetId)}'s court`,
    detail: `Relations +${ENVOY.RATE} a week, up to +${ENVOY.CAP}; ${ENVOY.UPKEEP} political power a week.`,
  });
  game.emit?.('diplomacy');
  return { ok: true };
}

/** Elçiyi çağır: bedava; kazanılan ilişki kendi hızıyla söner. */
export function recallEnvoyFrom(game, me, targetId) {
  if (!recallEnvoy(me, targetId)) return { ok: false, reason: 'No envoy there' };
  game.emit?.('diplomacy');
  return { ok: true };
}

// ------------------------------------------------- OYUNCUNUN MASASI ---

/** Çağrıyı bu hafta cevaplayamamanın geçerli sebebi (cezasız). */
function callExcuse(world, rec, turn) {
  if (attackerCount(world, rec.to) >= 2) return 'we already fight on two fronts';
  const blockers = warBlockers(world, rec.to, rec.aggressor, turn, 'alliance');
  return blockers.length ? blockers[0].toLowerCase() : null;
}

function callStillValid(world, rec) {
  return world.nations[rec.defender]?.alive && world.nations[rec.aggressor]?.alive
    && hostilePair(world, rec.defender, rec.aggressor) && !hostilePair(world, rec.to, rec.aggressor);
}

/** Bekleyen kaydın bugünkü engeli (geçersizse cümle; geçerliyse null). */
function pendingInvalid(game, rec, turn) {
  const world = game.world;
  if (!world.nations[rec.to]?.alive) return 'the addressee is gone';
  if (rec.kind === 'call') {
    if (!world.nations[rec.defender]?.alive || !world.nations[rec.aggressor]?.alive) return 'a party is gone';
    if (!hostilePair(world, rec.defender, rec.aggressor)) return `${nameOf(world, rec.defender)} and ${nameOf(world, rec.aggressor)} are no longer at war`;
    return null;
  }
  if (rec.kind === 'proposal') {
    const from = world.nations[rec.from];
    const me = world.nations[rec.to];
    if (!from?.alive) return 'the sender is gone';
    if (hostilePair(world, rec.from, rec.to)) return 'we are now hostile';
    if (rec.treaty === 'ALLIANCE') {
      if (isAllied(me, rec.from)) return 'we are already allied';
      if (alliesOf(me).length >= MAX_ALLIES || alliesOf(from).length >= MAX_ALLIES) return 'no alliance seat is free';
      if (from.rivalId === me.id || me.rivalId === from.id) return 'we have become rivals';
    } else if (rec.treaty === 'NAP') {
      if (napBlockers(world, from, me, turn, { ai: true, bCap: NAP.MAX }).filter((b) => !/political power/.test(b)).length) return 'a pact is no longer possible';
    } else if (rec.treaty === 'GUARANTEE') {
      if (guaranteeBlockers(world, me, from, turn).filter((b) => !/political power/.test(b)).length) return 'a guarantee is no longer possible';
    }
    return null;
  }
  if (rec.kind === 'demand') {
    const province = world.provinces?.[rec.province];
    if (!world.nations[rec.from]?.alive) return 'the claimant is gone';
    if (!province || province.owner !== rec.to) return 'the province changed hands';
    if (hostilePair(world, rec.from, rec.to)) return 'we are already at war';
    return null;
  }
  return 'unknown record';
}

/**
 * MASANIN TEK KAPISI. `choice`: call 'join'|'stay', proposal 'accept'|'decline',
 * demand 'yield'|'refuse'. Ekran, zaman aşımı, bakanlık ve tezgâh bunu çağırır.
 * @returns {{ ok: boolean, text?: string, reason?: string }}
 */
export function resolvePending(game, id, choice, { via = 'player' } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  const rec = findPending(world, id);
  if (!rec) return { ok: false, reason: 'No such request' };
  const invalid = pendingInvalid(game, rec, turn);
  if (invalid) {
    dropPending(world, id);
    dismissFor(game, rec);
    game.turns?.addLog?.(`The request lapses: ${invalid}.`, { kind: 'DIPLOMACY', tier: TIER.AMBIENT });
    return { ok: false, reason: invalid };
  }
  if (rec.kind === 'call') return answerCall(game, rec, choice, turn, via);
  if (rec.kind === 'proposal') return answerProposal(game, rec, choice, turn, via);
  if (rec.kind === 'demand') return answerDemand(game, rec, choice, turn, via);
  return { ok: false, reason: 'Unknown request' };
}

function dismissFor(game, rec) {
  const keys = rec.kind === 'call' ? [`call:${rec.aggressor}`]
    : rec.kind === 'demand' ? [`demand:${rec.id}`] : [`dip-req:${rec.id}`];
  game.notifications?.dismissKeys?.(keys);
}

function answerCall(game, rec, choice, turn, via) {
  const world = game.world;
  const me = world.nations[rec.to];
  const defender = world.nations[rec.defender];
  const aggressor = world.nations[rec.aggressor];
  if (choice === 'join') {
    const ok = declareWar(game, me.id, aggressor.id, {
      reason: 'alliance', manual: via === 'player', delegated: via === 'ministry',
      calledBy: defender.id, warAt: Math.max(rec.warAt ?? turn, turn),
    });
    if (!ok) {
      const why = warBlockers(world, me.id, aggressor.id, turn, 'alliance')[0] ?? 'we cannot declare';
      return { ok: false, reason: why };
    }
    dropPending(world, rec.id);
    dismissFor(game, rec);
    deed(world, defender.id, me.id, 'honoured_call', turn);
    remember(me, turn, 'honored_call', defender.id);
    grantPassage(world, defender.id, me.id, aggressor.id);
    grantPassage(world, me.id, defender.id, aggressor.id);
    announce(game, me, {
      kind: 'WAR', tier: TIER.MAJOR, key: `call:${aggressor.id}`, halt: false,
      title: `We answered ${defender.name}'s call against ${aggressor.name}`,
      detail: 'We fight as a defender: no political power spent, no war of aggression, no occupation infamy.',
    });
    noteDelegatedIf(game, me, via, `Ministry: we joined ${defender.name}'s war — ${rec.via === 'ally' ? 'the alliance obliges us' : 'our word obliges us'}.`, 'A defender who is called and stays out loses the friend.');
    game.emit?.('diplomacy');
    return { ok: true, text: `We join ${defender.name} against ${aggressor.name}.` };
  }
  // Kalmak: geçerli bir sebep varsa cezasız; yoksa bedeli yazılı.
  const excuse = callExcuse(world, rec, turn);
  dropPending(world, rec.id);
  dismissFor(game, rec);
  if (excuse) {
    game.turns?.addLog?.(`We could not answer ${defender.name}'s call: ${excuse}.`, { kind: 'DIPLOMACY', tier: TIER.IMPORTANT });
    return { ok: true, text: `Excused: ${excuse}.` };
  }
  refuseCall(game, me, defender, aggressor, rec.via, turn);
  return { ok: true, text: `We stay out of ${defender.name}'s war.` };
}

/** Cağrıya gelmemenin faturası (bağ türüne göre). */
function refuseCall(game, me, defender, aggressor, via, turn) {
  const world = game.world;
  deed(world, defender.id, me.id, 'refused_call', turn);
  remember(defender, turn, 'refused_call', me.id);
  if (via === 'guarantor' && guaranteeOf(me, defender.id)) {
    removeTreaty(me, 'GUARANTEE', defender.id);
    abandonBill(game, me, defender.id, turn);
  }
  noteDiplomacy(game, {
    tier: 1, title: `${me.name} leaves ${defender.name} to fight alone`,
    detail: `${defender.name} was attacked by ${aggressor?.name ?? 'an aggressor'}.`,
    actors: [me.id, defender.id], key: `call:${me.id}:${defender.id}`,
  });
  announce(game, me, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `call:${aggressor?.id ?? 'x'}`,
    title: `We left ${defender.name} to fight alone`,
    detail: via === 'guarantor'
      ? 'Our guarantee is void, and every partner of ours has seen it.'
      : `${defender.name} will remember it (relations −30); they may end the alliance at their next review.`,
  });
  game.emit?.('diplomacy');
}

function answerProposal(game, rec, choice, turn, via) {
  const world = game.world;
  const me = world.nations[rec.to];
  const from = world.nations[rec.from];
  if (choice !== 'accept') {
    dropPending(world, rec.id);
    dismissFor(game, rec);
    deed(world, from.id, me.id, 'declined_offer', turn);
    if (via !== 'timeout') {
      game.turns?.addLog?.(`We declined ${from.name}'s proposal.`, { kind: 'DIPLOMACY', tier: TIER.AMBIENT });
    }
    return { ok: true, text: `Declined. ${from.name} takes it as a rebuff (relations −10).` };
  }
  if (rec.treaty === 'ALLIANCE') {
    if (!formAlliance(world, me.id, from.id, turn)) return { ok: false, reason: 'The alliance could not be formed' };
    dropPending(world, rec.id);
    dismissFor(game, rec);
    announce(game, me, {
      kind: 'PEACE', tier: TIER.MAJOR, key: `ally:${from.id}`,
      title: `Alliance with ${from.name}`, detail: 'An attack on one is a call to the other.',
    });
    noteDiplomacy(game, {
      tier: 1, title: `${me.name} and ${from.name} conclude an alliance`,
      actors: [me.id, from.id], key: `alliance:${Math.min(me.id, from.id)}:${Math.max(me.id, from.id)}`,
    });
    noteDelegatedIf(game, me, via, `Ministry: alliance concluded with ${from.name}.`, 'They had reasons of their own and we had ours.');
    game.emit?.('diplomacy');
    return { ok: true, text: `Allied with ${from.name}.` };
  }
  if (rec.treaty === 'NAP') {
    if ((from.power ?? 0) < NAP.COST) {
      dropPending(world, rec.id);
      dismissFor(game, rec);
      return { ok: false, reason: `${from.name} can no longer afford the pact` };
    }
    dropPending(world, rec.id);
    dismissFor(game, rec);
    signNap(game, from, me);
    noteDelegatedIf(game, me, via, `Ministry: non-aggression pact signed with ${from.name}.`, 'Five quiet years on that border.');
    return { ok: true, text: `Pact signed with ${from.name}.` };
  }
  if (rec.treaty === 'GUARANTEE') {
    const blockers = guaranteeBlockers(world, me, from, turn);
    if (blockers.length) return { ok: false, reason: blockers[0] };
    dropPending(world, rec.id);
    dismissFor(game, rec);
    giveGuarantee(game, me, from.id, { against: rec.threat ?? null });
    noteDelegatedIf(game, me, via, `Ministry: we guarantee ${from.name}'s independence.`, 'Our backing makes an attack on them unattractive.');
    return { ok: true, text: `We guarantee ${from.name}.` };
  }
  return { ok: false, reason: 'Unknown proposal' };
}

function answerDemand(game, rec, choice, turn, via) {
  const world = game.world;
  const me = world.nations[rec.to];
  const from = world.nations[rec.from];
  const province = world.provinces?.[rec.province];
  if (choice === 'yield') {
    dropPending(world, rec.id);
    dismissFor(game, rec);
    applyYield(game, from, me, province);
    noteDelegatedIf(game, me, via, `Ministry: we yielded ${provinceLabel(province)} to ${from.name}.`, 'A war over it would cost more than the province.');
    return { ok: true, text: `${provinceLabel(province)} goes to ${from.name}.` };
  }
  // Ret: izleme bir sonraki haftalık adımda TAZE oranla (araya giren
  // müttefik ya da garantör sonucu gerçekten değiştirir).
  rec.answer = 'refuse';
  deed(world, me.id, from.id, 'demanded', turn);
  dismissFor(game, rec);
  announce(game, me, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `demand-in:${from.id}`, tile: province?.center ?? null,
    title: `We refuse ${from.name}'s demand for ${provinceLabel(province)}`,
    detail: `They hold a free cause for war for ${DEMAND.CB_WEEKS} weeks. Within days they must decide: war, or back down.`,
  });
  noteDelegatedIf(game, me, via, `Ministry: we refused ${from.name}'s demand for ${provinceLabel(province)}.`, 'Their threat is weaker than they think.');
  game.emit?.('diplomacy');
  return { ok: true, text: 'Refused.' };
}

function noteDelegatedIf(game, nation, via, text, why) {
  if (via === 'ministry') noteDelegated(game, nation, 'diplomacy', text, why);
}

/**
 * DEVREDİLMİŞ BAKANLIK masayı cevaplar (YZ'nin kendi ölçüleri): çağrıya
 * gelir (geçerli sebep yoksa), ittifakı çekicilik ≥ 2, paktı hüküm ≥ 1,
 * garanti isteğini SG ≥ 60 ile kabul eder; talebi hükme göre. Bakanlık asla
 * elçi göndermez, kendiliğinden garanti vermez, pakt önermez, rakip ilan
 * etmez, pakt çiğnemez.
 */
export function answerPendingDelegated(game, nation) {
  const world = game.world;
  const turn = turnOf(game);
  for (const rec of [...pendingFor(world, nation.id)]) {
    if (rec.kind === 'demand' && rec.answer) continue;
    if (rec.kind === 'call') {
      if (callExcuse(world, rec, turn)) resolvePending(game, rec.id, 'stay', { via: 'ministry' });
      else resolvePending(game, rec.id, 'join', { via: 'ministry' });
    } else if (rec.kind === 'proposal') {
      const from = world.nations[rec.from];
      let accept = false;
      if (rec.treaty === 'ALLIANCE') accept = allianceAppeal(world, nation, from, turn) >= ALLIANCE_RULES.APPEAL;
      else if (rec.treaty === 'NAP') accept = napVerdict(world, nation, from, turn).accept;
      else if (rec.treaty === 'GUARANTEE') {
        accept = !guaranteeBlockers(world, nation, from, turn).length && (nation.power ?? 0) >= GUARANTEE.DELEGATED_MIN_POWER;
      }
      const result = resolvePending(game, rec.id, accept ? 'accept' : 'decline', { via: 'ministry' });
      if (!accept && result.ok) {
        noteDelegated(game, nation, 'diplomacy', `Ministry: ${from?.name ?? 'a'}'s proposal declined.`, 'It did not serve us.');
      }
    } else if (rec.kind === 'demand') {
      const from = world.nations[rec.from];
      const province = world.provinces?.[rec.province];
      const verdict = demandVerdict(world, nation, from, province, turn);
      resolvePending(game, rec.id, verdict.yield ? 'yield' : 'refuse', { via: 'ministry' });
    }
  }
}

/** Zaman aşımı: kural — zaman aşımı savaşa sokmaz, yükümlülük imzalamaz. */
function expirePending(game, rec, turn) {
  const world = game.world;
  if (rec.kind === 'call') {
    const me = world.nations[rec.to];
    const defender = world.nations[rec.defender];
    const aggressor = world.nations[rec.aggressor];
    const excuse = callExcuse(world, rec, turn);
    dropPending(world, rec.id);
    dismissFor(game, rec);
    if (excuse) {
      game.turns?.addLog?.(`We could not answer ${defender.name}'s call: ${excuse}.`, { kind: 'DIPLOMACY', tier: TIER.IMPORTANT });
    } else {
      refuseCall(game, me, defender, aggressor, rec.via, turn);
    }
    return;
  }
  if (rec.kind === 'proposal') {
    const from = world.nations[rec.from];
    resolvePending(game, rec.id, 'decline', { via: 'timeout' });
    game.turns?.addLog?.(`Unanswered: ${from?.name ?? 'the'} proposal lapses.`, { kind: 'DIPLOMACY', tier: TIER.AMBIENT });
    return;
  }
  if (rec.kind === 'demand') {
    const me = world.nations[rec.to];
    const from = world.nations[rec.from];
    const province = world.provinces?.[rec.province];
    const verdict = demandVerdict(world, me, from, province, turn);
    resolvePending(game, rec.id, verdict.yield ? 'yield' : 'refuse', { via: 'timeout' });
    if (me.id === playerOf(game)) {
      game.turns?.addLog?.(`The cabinet answered ${from.name}'s demand: ${verdict.yield ? 'we yield' : 'we refuse'}.`, { kind: 'DIPLOMACY', tier: TIER.IMPORTANT });
    }
  }
}

/** Haftalık masa: geçersiz düşer, cevaplanmış talep izlenir, süresi dolan kapanır. */
function runPending(game, turn) {
  const world = game.world;
  const diplo = ensureDiplo(world);
  for (const rec of [...diplo.pending].sort((x, y) => x.id - y.id)) {
    if (!findPending(world, rec.id)) continue;
    const invalid = pendingInvalid(game, rec, turn);
    if (invalid) {
      dropPending(world, rec.id);
      dismissFor(game, rec);
      if (rec.to === playerOf(game)) {
        game.turns?.addLog?.(`A request lapses: ${invalid}.`, { kind: 'DIPLOMACY', tier: TIER.AMBIENT });
      }
      continue;
    }
    if (rec.kind === 'demand' && rec.answer === 'refuse') {
      dropPending(world, rec.id);
      const from = world.nations[rec.from];
      const to = world.nations[rec.to];
      const province = world.provinces?.[rec.province];
      removeTreaty(from, 'CB', to.id);
      (from.treaties ??= []).push({ type: 'CB', partner: to.id, since: turn, expires: turn + DEMAND.CB_WEEKS, province: rec.province });
      followThrough(game, from, to, province);
      continue;
    }
    if (turn >= rec.expires) expirePending(game, rec, turn);
  }
}

/** Reddedilen talebin gerekçesi süresi dolunca: isteyen geri adım atmış sayılır. */
function expireCasusBelli(game, turn) {
  const world = game.world;
  for (const nation of world.nations) {
    for (const t of (nation.treaties ?? []).filter((x) => x.type === 'CB')) {
      if ((t.expires ?? Infinity) > turn) continue;
      const target = world.nations[t.partner];
      if (!nation.alive || !target?.alive) { removeTreaty(nation, 'CB', t.partner); continue; }
      backDown(game, nation, target, world.provinces?.[t.province]);
    }
  }
}

/** Pakt bitimi kartı (13 hafta kala). */
function napNotices(game, turn) {
  const world = game.world;
  const player = playerOf(game);
  const me = world.nations[player];
  if (!me?.alive) return;
  for (const t of napsOf(me, turn)) {
    if (t.until - turn !== NAP.EXPIRY_CARD) continue;
    announce(game, me, {
      kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `nap:${t.partner}`,
      title: `Our pact with ${nameOf(world, t.partner)} expires in ${NAP.EXPIRY_CARD} weeks`,
      detail: t.denounced != null ? 'It was denounced and will not be renewed.' : 'Renew it in Diplomacy (P) while the window is open.',
    });
  }
}

// ------------------------------------------------------- YZ ADIMLARI ---

/** (a) Pakt feshi: ilişki −25 altı, rakip ya da ortağın şöhreti ≥ 22. */
function aiDenounce(game, turn) {
  const world = game.world;
  const player = playerOf(game);
  for (const nation of world.nations) {
    if (!nation.alive || nation.id === player) continue;
    for (const t of napsOf(nation, turn)) {
      if (t.denounced != null) continue;
      const partner = world.nations[t.partner];
      if (!partner?.alive) continue;
      // Şöhretli oyuncunun paktların arkasına saklanma açığı kapanır: 26
      // hafta sonra koalisyon kurulabilir.
      if (regardOf(world, nation.id, partner.id, turn) < READ.BREAK || nation.rivalId === partner.id
        || (partner.infamy ?? 0) >= NAP.AI_DENOUNCE_INFAMY) {
        denounceNap(game, nation, partner.id);
      }
    }
  }
}

/** (c) YZ elçisi: önce huzursuz vassal, sonra soğuyan müttefik. */
function aiEnvoys(game) {
  const world = game.world;
  const player = playerOf(game);
  const turn = turnOf(game);
  for (const nation of world.nations) {
    if (!nation.alive || nation.id === player) continue;
    const envoys = nation.envoys ?? [];
    if ((nation.power ?? 0) < ENVOY.AI_RECALL_POWER) {
      if (envoys.length) nation.envoys = [];
      continue;
    }
    // Amacı kalmayan elçi döner (artık vassal ya da müttefik değil).
    for (const host of [...envoys]) {
      if (!alliedPair(nation, host) && overlordIdOf(world, host, turn) !== nation.id) recallEnvoy(nation, host);
    }
    if ((nation.power ?? 0) < ENVOY.AI_MIN_POWER) continue;
    const want = (nation.power ?? 0) >= ENVOY.AI_TWO_POWER ? 2 : 1;
    const candidates = [];
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id || (nation.envoys ?? []).includes(other.id)) continue;
      if (hostilePair(world, nation.id, other.id)) continue;
      const treaty = overlordIdOf(world, other.id, turn) === nation.id
        ? (other.treaties ?? []).find((t) => t.type === 'VASSALIZE' && t.partner === nation.id) : null;
      if (treaty && (treaty.autonomy ?? 0) >= ENVOY.AI_AUTONOMY) {
        candidates.push({ id: other.id, rank: 0, key: -(treaty.autonomy ?? 0) });
        continue;
      }
      if (alliedPair(nation, other.id)) {
        const regard = regardOf(world, other.id, nation.id, turn);
        if (regard < 0) candidates.push({ id: other.id, rank: 1, key: regard });
      }
    }
    candidates.sort((x, y) => x.rank - y.rank || x.key - y.key || x.id - y.id);
    for (const c of candidates) {
      if ((nation.envoys?.length ?? 0) >= want) break;
      (nation.envoys ??= []).push(c.id);
    }
  }
}

/** (d) Büyük güç, rakibiyle arasındaki küçük devleti garanti eder ("Belçika"). */
function aiGuarantee(game, turn) {
  const world = game.world;
  const player = playerOf(game);
  const contacts = world.contacts;
  if (!contacts) return;
  const great = scoreboard(world).slice(0, GUARANTEE.AI_GREAT_POWERS).map((row) => row.nation)
    .sort((x, y) => x.id - y.id);
  for (const g of great) {
    if (!g.alive || g.id === player) continue;
    const rival = g.rivalId != null ? world.nations[g.rivalId] : null;
    if (!rival?.alive) continue;
    if ((g.power ?? 0) < GUARANTEE.AI_MIN_POWER) continue;
    if (guaranteesGiven(g).length >= GUARANTEE.AI_MAX) continue;
    if (hostileWithAnyone(world, g.id)) continue;
    if ((g.politics?.exhaustion ?? 0) >= GUARANTEE.AI_MAX_EXHAUSTION) continue;
    const sRival = nationStrength(world, rival);
    let best = null;
    let bestScore = -Infinity;
    for (const x of world.nations) {
      if (!x.alive || x.id === g.id || x.id === rival.id) continue;
      if (!contacts[rival.id]?.[x.id] || !contacts[g.id]?.[x.id]) continue;
      if (alliedPair(x, rival.id)) continue;
      const sx = nationStrength(world, x);
      if (sx * WAR_GATE.THRESHOLD > sRival) {
        // rakip X'e saldıramaz: garanti gereksiz
        continue;
      }
      if (guaranteeBlockers(world, g, x, turn, { ai: true }).length) continue;
      const score = contacts[rival.id][x.id] * sx;
      if (score > bestScore || (score === bestScore && best && x.id < best.id)) { bestScore = score; best = x; }
    }
    if (best) giveGuarantee(game, g, best.id, { ai: true, against: rival.id });
  }
}

/**
 * (e) YZ OYUNCUYA pakt önerir, "arkayı güvenceye almak" için: savaştayken ya
 * da gözünü dikdiği bir rakibi varken (rakip pakt ortağı olamaz, napBlockers).
 *
 * YZ-YZ paktı ÖLÇÜLDÜ VE SİLİNDİ (TASARIM ilke 5, şartname §18.3 "pact
 * skip"): 160×96, 3 tohum × 20 yıl, 8 ve 19 pakt imzalandı, hiçbiri tek bir
 * savaş kararını değiştirmedi. Sebep yapısal: iki hüküm de karşı tarafın en
 * az kendisi kadar güçlü olmasını ister, yani yalnız denkler imzalar; denk
 * komşu zaten hedef değildir (eşik ×1.8). Pakt oyuncunun aracıdır: oyuncuyla
 * yapılan pakt YZ'nin hedef döngüsünde bağlar (ai.js napBetween).
 * Rakip kolu şartnamenin geri dönüşüdür (§18.7-6): yalnız savaş şartıyla
 * pasif oyuncunun masasına yılda 0.65-1.0 teklif düşüyordu, hedef ≥ 1.
 */
function aiPacts(game, turn) {
  const world = game.world;
  const player = playerOf(game);
  const contacts = world.contacts;
  const me = world.nations[player];
  if (!contacts || !me?.alive || !DIP_AI.proposals) return;
  for (const nation of world.nations) {
    if (!nation.alive || nation.id === player) continue;
    const rivalAlive = nation.rivalId != null && world.nations[nation.rivalId]?.alive;
    if (!hostileWithAnyone(world, nation.id) && !rivalAlive) continue;
    if (napsOf(nation, turn).length >= NAP.AI_MAX || (nation.power ?? 0) < NAP.AI_MIN_POWER) continue;
    if (!contacts[nation.id]?.[player] || hostilePair(world, nation.id, player)) continue;
    if (nationStrength(world, me) < NAP.AI_PEER * nationStrength(world, nation)) continue;
    if (napBlockers(world, nation, me, turn, { ai: true, bCap: NAP.MAX }).length) continue;
    if (!napVerdict(world, nation, me, turn).accept) continue;
    if (napVerdict(world, me, nation, turn).sum < NAP.PLAYER_PLAUSIBLE) continue;
    if (!proposalGate(world, player, nation.id, 'NAP', turn)) continue;
    const rec = pushProposal(world, { treaty: 'NAP', from: nation.id, to: player }, turn);
    const foes = world.nations.filter((n) => n.alive && n.id !== nation.id && hostilePair(world, n.id, nation.id))
      .map((n) => n.name);
    const why = foes.length ? ` They are at war with ${foes.slice(0, 2).join(', ')}.`
      : rivalAlive ? ` Their eyes are on their rival ${nameOf(world, nation.rivalId)}.` : '';
    announce(game, me, {
      kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `dip-req:${rec.id}`, ttl: 0,
      title: `${nation.name} proposes a non-aggression pact`,
      detail: `Five years in which neither of us may declare war.${why} Answer in Diplomacy (P) within ${rec.expires - turn} weeks.`,
    });
  }
}

/** (f) Küçük komşu oyuncudan garanti ister (garanti caydırıcı olacaksa). */
function guaranteeRequests(game, turn) {
  const world = game.world;
  const player = playerOf(game);
  const me = world.nations[player];
  if (!me?.alive || !world.contacts) return;
  const tension = worldWarTension(world, turn);
  for (const s of world.nations) {
    if (!s.alive || s.id === player || !world.contacts[player]?.[s.id]) continue;
    if (guarantorsOf(world, s.id).length || overlordIdOf(world, s.id, turn) >= 0 || alliedPair(s, player)) continue;
    if (regardOf(world, s.id, player, turn) < 0) continue;
    if (guaranteeBlockers(world, me, s, turn).filter((b) => !/political power/.test(b)).length) continue;
    // En güçlü uygun tehdit (oyuncu hariç).
    let threat = null;
    let threatOdds = null;
    let threatStrength = -Infinity;
    for (const t of world.nations) {
      if (!t.alive || t.id === s.id || t.id === player || !world.contacts[t.id]?.[s.id]) continue;
      if (hostilePair(world, t.id, s.id) || napOf(t, s.id, turn) || truceLeft(world, t.id, s.id, turn) > 0) continue;
      const odds = aggressionOdds(world, t, s, { myPower: nationStrength(world, t), tension, turn });
      if (!odds.eligible) continue;
      const strength = nationStrength(world, t);
      if (strength > threatStrength || (strength === threatStrength && threat && t.id < threat.id)) {
        threat = t; threatOdds = odds; threatStrength = strength;
      }
    }
    if (!threat) continue;
    // Oyuncu yarım ağırlıkla eklenince oran eşiğin altına iniyor mu?
    const own = threatOdds.parts.target;
    const behind = threatOdds.parts.allied + threatOdds.parts.guarantors.reduce((x, g) => x + g.strength, 0)
      + threatOdds.parts.bonds.reduce((x, b) => x + b.strength, 0);
    const withUs = nationStrength(world, threat)
      / Math.max(1, own + WAR_GATE.ALLY_WEIGHT * (behind + nationStrength(world, me)));
    if (withUs >= threatOdds.needed) continue;
    if (!DIP_AI.proposals || !proposalGate(world, player, s.id, 'GUARANTEE', turn)) continue;
    const rec = pushProposal(world, { treaty: 'GUARANTEE', from: s.id, to: player, threat: threat.id }, turn);
    announce(game, me, {
      kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `dip-req:${rec.id}`, ttl: 0,
      title: `${s.name} asks us to guarantee its independence`,
      detail: `${threat.name} has ×${threatOdds.ratio.toFixed(1)} of the ×${threatOdds.needed.toFixed(1)} it needs to attack them; with us behind them ×${withUs.toFixed(1)}. Cost ${GUARANTEE.COST} PP + ${GUARANTEE.UPKEEP} a week. Answer in Diplomacy (P) within ${rec.expires - turn} weeks.`,
    });
  }
}

/** Siyasi güç yetmezse en yeni elçi, sonra en yeni garanti (sakin) düşer. */
function settleUpkeep(game) {
  const world = game.world;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.politics?.upkeepShort) continue;
    nation.politics.upkeepShort = false;
    if (nation.envoys?.length) {
      const host = nation.envoys[nation.envoys.length - 1];
      recallEnvoy(nation, host);
      tellPlayer(game, nation.id, {
        kind: 'POLITICS', tier: TIER.IMPORTANT, key: `envoy:${host}`,
        title: `Our envoy to ${nameOf(world, host)} is recalled`,
        detail: 'No political power is left to keep the legation.',
      });
      continue;
    }
    const given = guaranteesGiven(nation);
    if (given.length) revokeGuarantee(game, nation, given[given.length - 1].partner, { calm: true });
  }
}

/**
 * HAFTALIK DIŞ SİYASET (turn.js, runDiplomacyAI'dan hemen sonra, aynı
 * 'diplomacy' evresinde). Sabit sıra: elçiler → masa → gerekçe bitimi →
 * pakt bildirimi → vassallar → çeyreklik YZ adımı (turn % 13 === 7).
 */
export function runForeignPolicy(game) {
  const world = game.world;
  const turn = turnOf(game);
  ensureDiplo(world);
  settleUpkeep(game);
  for (const [sender, host] of tendEnvoys(world, turn)) {
    tellPlayer(game, sender, {
      kind: 'POLITICS', tier: TIER.IMPORTANT, key: `envoy:${host}`,
      title: `Our envoy to ${nameOf(world, host)} returns home`,
      detail: world.nations[host]?.alive ? 'We are at war or under ultimatum with them.' : 'Their state is no more.',
    });
  }
  runPending(game, turn);
  expireCasusBelli(game, turn);
  napNotices(game, turn);
  runVassals(game);
  if (turn % QUARTER !== QUARTER_OFFSET) return;
  if (DIP_AI.pacts) aiDenounce(game, turn);
  lapseGuarantees(game, turn);
  if (DIP_AI.envoys) aiEnvoys(game);
  if (DIP_AI.guarantees) aiGuarantee(game, turn);
  if (DIP_AI.pacts) aiPacts(game, turn);
  if (DIP_AI.proposals) guaranteeRequests(game, turn);
}

// ---------------------------------------------------------- GÖRÜNÜM ---

/**
 * Savaş bilgi kartının sonuç satırları (oyuncu `a`, hedef `b`): kim çağrılır,
 * pakt bozulur mu, gerekçe bedava mı, çağrıya katılmak mı.
 */
export function warConsequences(world, a, b, turn = world.turn ?? 0) {
  const lines = [];
  const call = (world.diplo?.pending ?? []).find((rec) => rec.kind === 'call' && rec.to === a && rec.aggressor === b);
  if (call) lines.push(`Joins ${nameOf(world, call.defender)}'s call: free, as a defender`);
  const defenders = defendersOf(world, b, null, turn).filter((d) => d.id !== a);
  if (defenders.length && !call) {
    const BOND = { ally: 'ally', guarantor: 'guarantor', overlord: 'overlord', vassal: 'vassal' };
    lines.push(`Calls to their side: ${defenders.map((d) => `${nameOf(world, d.id)} (${BOND[d.bond]})`).join(', ')}`);
  }
  if (napOf(world.nations[a], b, turn)) lines.push(`Breaks our non-aggression pact: +${NAP.BREACH_INFAMY} infamy, ${nameOf(world, b)} −60, every partner −20`);
  if (cbOf(world.nations[a], b, turn)) lines.push('Our casus belli: free');
  return lines;
}

/** Bu hedefe karşı oyuncuya bekleyen çağrı (Savaş düğmesi "Join · free"). */
export function pendingCallAgainst(world, meId, aggressorId) {
  return (world.diplo?.pending ?? []).find((rec) => rec.kind === 'call' && rec.to === meId && rec.aggressor === aggressorId) ?? null;
}

export { verdictParts };
