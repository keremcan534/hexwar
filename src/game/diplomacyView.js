// DİPLOMASİ GÖRÜNÜMÜ — diplomasi ekranının ve ülke dosyasının sayıları (DOM yok).
//
// Ekran eskiden 63 ulusluk bir isim listesiydi ve her satırda tek bir şey
// söylüyordu: savaş mı barış mı (Kerem: "diplomasi ekranı çok zayıf"). Bu
// döküm her ulus için oyuncunun kararını besleyen soruları oyunun KENDİ
// fonksiyonlarıyla cevaplar: ilişki defteri (ne düşünüyorlar, neden), tehdit
// (YZ'nin kendi savaş kapısı), ittifaka yanaşır mı (allianceVerdict — YZ'nin
// kendi ölçüsü), savaş gerekçesi ve bedeli, sözler (pakt, garanti, vassal,
// elçi, gerekçe) ve masada bekleyen kayıtlar. Ekran hiçbir sayı ÜRETMEZ;
// burada hesaplananı basar (TASARIM ilke 2).

import {
  MIN_WAR_TURNS, atWar, crisisLeft, hasClaimOn, hostile, inCrisis, nationStrength, overlordOf, relation, truceLeft,
  warBlockers, warDeclarationCost,
} from './diplomacy.js';
import { annexBlockers, annexCost, autonomyBreakdown, independenceBlockers, vassalsOf } from './vassals.js';
import {
  MAX_ALLIES, allianceVerdict, alliesOf, breakCause, isAllied, verdictSentence,
} from './alliances.js';
import { warScore } from './peace.js';
import { INFAMY_COALITION } from './infamy.js';
import { borderNationIds } from './command.js';
import { embargoBlockers, embargoed, EMBARGO_POWER } from './econ/trade.js';
import { unionBlockers, unionCandidates, UNION_POWER } from './unification.js';
import { calendarYear } from './calendar.js';
import {
  autonomyOf, cbOf, envoyBlockers, envoyStanding, guaranteeOf, guaranteesGiven, guarantorsOf, napOf, napsOf,
  pendingFor, regardOf, relationsBreakdown,
} from './relations.js';
import {
  demandBlockers, demandCandidates, demandVerdict, guaranteeBlockers, napBlockers, napVerdict, pendingCallAgainst,
  protegeThreatened, rivalBlockers, threatView, warConsequences,
} from './pacts.js';
import {
  ALLIANCE_RULES, AUTONOMY, DEMAND, ENVOY, GUARANTEE, NAP, READ, RIVAL,
} from './dipDefs.js';

/** İttifak teklifini YZ'nin kabul ettiği eşik: oyuncu ve YZ-YZ aynı (DIP-08). */
export const ALLY_APPEAL = ALLIANCE_RULES.APPEAL;

/** İlişki sırası: önce ilgilendiğin ülkeler (ekran grupları bu sırayla). */
export const STANDINGS = ['war', 'crisis', 'ally', 'vassal', 'overlord', 'truce', 'rival', 'neighbour', 'other'];

// Yuvarlanmış değere göre işaret: −0.04 "−0.0" değil "+0.0" yazar.
const fmt = (v, digits = 1) => {
  const r = Number(v.toFixed(digits));
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`;
};
const yearsWeeks = (weeks) => {
  const w = Math.max(0, Math.round(weeks));
  if (w < 52) return `${w}w`;
  const y = Math.floor(w / 52);
  const m = Math.round((w % 52) / 52 * 12);
  return m ? `${y}y ${m}m` : `${y}y`;
};

/**
 * İlişkinin oyundaki etkisi (cümle): ittifak çekiciliği, koalisyon zarı,
 * kin, bozma çizgisi. Her biri gerçek bir okuyucudur (şartname §4.3; savaş
 * eşiği ölçülüp silindi, bkz. pacts.aggressionOdds).
 */
export function relationEffects(value) {
  const appeal = value / READ.ALLIANCE_DIV;
  const coalition = Math.max(0, Math.min(READ.COALITION_CAP, value)) / READ.COALITION_DIV;
  const parts = [`alliance appeal ${fmt(appeal)}`];
  if (value > 0) parts.push(`their coalition chance −${Math.round(coalition * 100)}%`);
  if (value < 0) parts.push(`a grudge: they favour us as a target ×${(1 + -value / READ.GRUDGE_DIV).toFixed(2)}`);
  if (value < READ.BREAK) parts.push('below −25 they end alliances and pacts with us');
  return { appeal, coalition, text: parts.join(' · ') };
}

/** İlişkinin dökümü, oyuncunun okuyacağı biçimde (parçalar + etkiler). */
function relationsOf(world, observerId, subjectId, turn) {
  const breakdown = relationsBreakdown(world, observerId, subjectId, turn);
  return {
    value: breakdown.value,
    // Yarım puanın altındaki kırıntı satır olarak yazılmaz (toplam değişmez).
    parts: breakdown.parts.filter((p) => Math.abs(p.value) >= 0.5).map((p) => ({
      ...p, fadesBy: p.fadesIn > 0 ? calendarYear(turn + p.fadesIn) : null,
    })),
    effects: relationEffects(breakdown.value),
  };
}

/** Bir satırın etiketleri (adın altında). */
function tagsFor(world, me, other, turn, { neighbour, claim, infamyCap }) {
  const tags = [];
  if (neighbour) tags.push('neighbour');
  if (claim) tags.push('claim');
  const pact = napOf(me, other.id, turn);
  if (pact) {
    tags.push(pact.denounced != null ? `pact ends ${pact.until - turn}w` : `pact ${yearsWeeks(pact.until - turn)}`);
  }
  if (guaranteeOf(me, other.id)) tags.push('guaranteed by us');
  if (guaranteeOf(other, me.id)) tags.push('guarantees us');
  if ((me.envoys ?? []).includes(other.id)) tags.push('our envoy');
  if (overlordOf(world, other.id, turn) === me.id) tags.push(`vassal ${Math.round(autonomyOf(world, other.id, turn) ?? 0)}%`);
  const cb = cbOf(me, other.id, turn);
  if (cb) tags.push(`casus belli ${Math.max(0, cb.expires - turn)}w`);
  if ((me.embargoes ?? []).includes(other.id)) tags.push('embargoed');
  else if ((other.embargoes ?? []).includes(me.id)) tags.push('embargoes us');
  if ((other.infamy ?? 0) >= infamyCap) tags.push('infamous');
  return tags;
}

/** Savaş düğmesinin etiketi, engelleri ve bilgi kartı. */
function warAction(world, me, other, turn) {
  const call = pendingCallAgainst(world, me.id, other.id);
  const cb = cbOf(me, other.id, turn);
  const pact = napOf(me, other.id, turn);
  const reason = call ? 'alliance' : cb ? 'demand' : null;
  const cost = warDeclarationCost(world, me.id, other.id, reason);
  const blockers = warBlockers(world, me.id, other.id, turn, reason, { allowBreach: true });
  const label = call ? 'Join · free' : cb ? 'War · free' : pact ? `War · ${cost} · breaks pact` : `War · ${cost}`;
  const lines = [];
  if (call) {
    lines.push(`Answer ${world.nations[call.defender]?.name ?? 'our partner'}'s call: we join as a defender — no political power, no war of aggression.`);
  } else {
    lines.push(cb
      ? `Casus belli from their refused demand: free, the war goal is ${world.provinces?.[cb.province]?.name ?? 'the demanded province'}.`
      : `${hasClaimOn(world, me.id, other.id) || (me.rivalChosen != null && me.rivalId === other.id) ? 'Justified' : 'Unjustified: no claim, kin or declared rivalry'}. Costs ${cost} political power.`);
    lines.push('Starts an 8-week ultimatum; every state you take adds infamy.');
  }
  lines.push(...warConsequences(world, me.id, other.id, turn));
  return { cost, label, blockers, tip: lines.join('\n'), pact: Boolean(pact), call: Boolean(call), cb: Boolean(cb) };
}

/** Masadaki kaydın ekran biçimi: başlık, gövde, kalan hafta, zaman aşımında ne olur, seçenekler. */
function requestView(world, me, rec, turn) {
  const from = world.nations[rec.kind === 'call' ? rec.defender : rec.from];
  const weeksLeft = Math.max(0, rec.expires - turn);
  // `topic`: kaydın konusu (ekran onu resimle gösterir; sayı değil, ad).
  // Çağrı garantörden gelebilir, öneri üç antlaşmadan biridir.
  const topic = rec.kind === 'call' ? ({ guarantor: 'guarantee', overlord: 'vassal', vassal: 'vassal' }[rec.via] ?? 'alliance')
    : rec.kind === 'proposal' ? ({ ALLIANCE: 'alliance', NAP: 'pact' }[rec.treaty] ?? 'guarantee')
      : 'demand';
  const base = {
    id: rec.id, kind: rec.kind, topic, flag: from?.id ?? null, weeksLeft, leader: from?.leader ?? null,
  };
  if (rec.kind === 'call') {
    const aggressor = world.nations[rec.aggressor];
    const startsIn = Math.max(0, (rec.warAt ?? turn) - turn);
    const excuseRow = warBlockers(world, me.id, rec.aggressor, turn, 'alliance');
    const excused = excuseRow.length ? excuseRow[0] : null;
    const stayCost = rec.via === 'guarantor'
      ? 'the guarantee ends, every partner of ours −10, prestige −5'
      : `${from?.name} −30: they will likely end ${rec.via === 'ally' ? 'the alliance' : 'our bond'} at their next review`;
    return {
      ...base,
      title: `${from?.name} calls us against ${aggressor?.name}`,
      body: startsIn ? `War begins in ${startsIn} weeks.` : 'The war has begun.',
      onTimeout: excused ? 'excused' : 'we stay out',
      options: [
        { choice: 'join', label: 'Join · free', enabled: !excused, tip: excused ? `Cannot join: ${excused}` : 'Declare as a defender: no political power, no war of aggression, no occupation infamy; our ultimatum ends with theirs.' },
        { choice: 'stay', label: 'Stay out', enabled: true, tip: excused ? `Excused: ${excused}. No penalty.` : `Staying out costs: ${stayCost}.` },
      ],
    };
  }
  if (rec.kind === 'proposal') {
    if (rec.treaty === 'ALLIANCE') {
      const verdict = allianceVerdict(world, from, me, turn);
      const reasons = verdict.parts.filter((p) => p.value > 0).map((p) => `${p.label} ${fmt(p.value)}`).join(' · ');
      return {
        ...base,
        title: `${from?.name} proposes an alliance`,
        body: reasons ? `Their reasons: ${reasons}.` : 'They see a common cause.',
        onTimeout: 'lapses (they take it as a rebuff, −10)',
        options: [
          { choice: 'accept', label: 'Accept', enabled: alliesOf(me).length < MAX_ALLIES, tip: alliesOf(me).length >= MAX_ALLIES ? `We already have ${MAX_ALLIES} allies` : 'An attack on one becomes a call to the other. Free; breaking it later costs 10 political power without cause.' },
          { choice: 'decline', label: 'Decline', enabled: true, tip: `${from?.name} takes it as a rebuff (relations −10).` },
        ],
      };
    }
    if (rec.treaty === 'NAP') {
      const theirs = napVerdict(world, from, me, turn);
      const ours = napVerdict(world, me, from, turn);
      return {
        ...base,
        title: `${from?.name} proposes a non-aggression pact`,
        body: `Five years in which neither of us may declare war. Our own counsel: ${verdictSentence(ours, { yes: 'it suits us', no: 'it does not suit us' })}.`,
        onTimeout: 'lapses (−10)',
        options: [
          { choice: 'accept', label: 'Sign', enabled: true, tip: `They pay the ${NAP.COST} political power. Their reasons: ${theirs.parts.map((p) => `${p.label} ${fmt(p.value)}`).join(' · ')}. Breaking it later: +${NAP.BREACH_INFAMY} infamy, them −60, every partner −20.` },
          { choice: 'decline', label: 'Decline', enabled: true, tip: `${from?.name} takes it as a rebuff (relations −10).` },
        ],
      };
    }
    const blockers = guaranteeBlockers(world, me, from, turn);
    const threat = world.nations[rec.threat];
    const odds = threat ? threatView(world, threat, from, turn) : null;
    return {
      ...base,
      title: `${from?.name} asks us to guarantee its independence`,
      body: threat && odds ? odds.text : 'They fear a stronger neighbour.',
      onTimeout: 'lapses (−10)',
      options: [
        { choice: 'accept', label: `Guarantee · ${GUARANTEE.COST} PP`, enabled: !blockers.length, tip: blockers.length ? blockers.join('\n') : `Costs ${GUARANTEE.COST} political power and ${GUARANTEE.UPKEEP} a week. Any attack on them calls us; abandoning them under threat costs prestige and every partner's trust.` },
        { choice: 'decline', label: 'Decline', enabled: true, tip: `${from?.name} takes it as a rebuff (relations −10).` },
      ],
    };
  }
  // Talep
  const province = world.provinces?.[rec.province];
  const verdict = demandVerdict(world, me, from, province, turn);
  const behind = guarantorsOf(world, me.id).concat(alliesOf(me)).map((id) => world.nations[id]?.name).filter(Boolean);
  return {
    ...base,
    title: `${from?.name} demands ${province?.name ?? 'a province'}`,
    body: `${behind.length ? `Behind us: ${behind.join(', ')}. ` : 'Nobody stands behind us. '}If we refuse, ${from?.name} holds a free cause for war for ${DEMAND.CB_WEEKS} weeks.`,
    onTimeout: `the cabinet would ${verdict.yield ? 'yield' : 'refuse'} (${fmt(verdict.sum)})`,
    tile: province?.center ? { q: province.center.q, r: province.center.r } : null,
    options: [
      { choice: 'yield', label: 'Yield', enabled: true, tip: `${province?.name} goes to ${from?.name} without a war. Prestige −${DEMAND.PRESTIGE}; a truce of two years.` },
      { choice: 'refuse', label: 'Refuse', enabled: true, tip: `The cabinet's verdict: ${verdict.yield ? 'yield' : 'refuse'} ${fmt(verdict.sum)} — ${verdict.parts.map((p) => `${p.label} ${fmt(p.value)}`).join(' · ')}.` },
    ],
  };
}

/** İttifakı bozmanın düğme bilgisi: sebep varsa bedava, yoksa 10 SG ve −40. */
function allyBreakInfo(world, me, n, turn) {
  const cause = breakCause(world, me, n, turn);
  return {
    id: n.id, name: n.name, cause: cause?.ours ?? null,
    breakLabel: cause ? 'Break (they gave cause)' : `Break · ${ALLIANCE_RULES.BREAK_POWER} PP`,
    breakTip: cause
      ? `We have cause: ${cause.ours}. Free; ${n.name} takes it as a minor slight (−15).`
      : `Without cause: ${ALLIANCE_RULES.BREAK_POWER} political power and ${n.name} −40 (no new alliance for ${ALLIANCE_RULES.COOLDOWN} weeks).`,
    breakEnabled: Boolean(cause) || (me.power ?? 0) >= ALLIANCE_RULES.BREAK_POWER,
  };
}

/** Taahhütler paneli: müttefikler, vassallar, garantiler, paktlar, gerekçeler, elçiler. */
function commitmentsOf(world, me, turn) {
  const allies = alliesOf(me).map((id) => world.nations[id]).filter((n) => n?.alive)
    .map((n) => allyBreakInfo(world, me, n, turn));
  const vassals = vassalsOf(world, me.id, turn).map((n) => {
    const breakdown = autonomyBreakdown(world, n, turn);
    return {
      id: n.id, name: n.name, autonomy: breakdown?.value ?? 0, target: breakdown?.target ?? 0,
      parts: breakdown?.parts ?? [], annexBlockers: annexBlockers(world, me, n, turn), annexCost: annexCost(world, n),
    };
  });
  const guaranteesGivenRows = guaranteesGiven(me).map((t) => {
    const p = world.nations[t.partner];
    const threatened = protegeThreatened(world, t.partner);
    return {
      id: t.partner, name: p?.name ?? '?', since: t.since, threatened,
      revokeTip: threatened
        ? `${p?.name} is under threat: revoking now is abandonment — prestige −${GUARANTEE.ABANDON_PRESTIGE}, them −40, every partner −10. Click twice.`
        : `Withdraw the guarantee: free, ${p?.name} −15. Saves ${GUARANTEE.UPKEEP} political power a week.`,
    };
  });
  const guaranteesHeld = guarantorsOf(world, me.id).map((id) => ({ id, name: world.nations[id]?.name ?? '?' }));
  const pacts = napsOf(me, turn).map((t) => {
    const partner = world.nations[t.partner];
    const left = t.until - turn;
    const renewOpen = t.denounced == null && left <= NAP.RENEW_WINDOW;
    const renewBlockers = renewOpen ? napBlockers(world, me, partner, turn, { renew: true }) : [];
    const verdict = renewOpen ? napVerdict(world, partner, me, turn) : null;
    return {
      id: t.partner, name: partner?.name ?? '?', left, until: t.until, denounced: t.denounced ?? null,
      leftText: t.denounced != null ? `ends in ${left}w` : `${yearsWeeks(left)} left`,
      renewOpen, renewEnabled: renewOpen && !renewBlockers.length && verdict?.accept,
      renewTip: renewOpen
        ? (renewBlockers.length ? renewBlockers.join('\n') : `${verdictSentence(verdict, { yes: 'They would renew', no: 'They would not renew' })}. Costs ${NAP.COST} political power.`)
        : `Renewal opens in the last ${NAP.RENEW_WINDOW} weeks.`,
    };
  });
  const cbs = (me.treaties ?? []).filter((t) => t.type === 'CB' && (t.expires ?? Infinity) > turn).map((t) => ({
    id: t.partner, name: world.nations[t.partner]?.name ?? '?', province: world.provinces?.[t.province]?.name ?? '?',
    left: t.expires - turn,
  }));
  const envoys = (me.envoys ?? []).map((id) => ({
    id, name: world.nations[id]?.name ?? '?', standing: envoyStanding(world, id, me.id, turn), cap: ENVOY.CAP,
  }));
  const overlord = overlordOf(world, me.id, turn);
  return { allies, vassals, guaranteesGiven: guaranteesGivenRows, guaranteesHeld, pacts, cbs, envoys, overlord: overlord >= 0 ? { id: overlord, name: world.nations[overlord]?.name } : null };
}

function rivalInfoOf(world, me, turn) {
  const rival = me.rivalId != null ? world.nations[me.rivalId] : null;
  if (!rival?.alive) return { name: null, declared: null, lockedUntil: null, assigned: false };
  const declared = me.rivalChosen != null;
  return {
    id: rival.id, name: rival.name, declared: declared ? calendarYear(me.rivalChosen) : null,
    lockedUntil: (me.rivalLockUntil ?? 0) > turn ? calendarYear(me.rivalLockUntil) : null,
    assigned: !declared,
  };
}

export function diplomacyView(world, me, turn = world.turn ?? 0) {
  if (!me?.alive) return null;
  const myPower = Math.max(1, nationStrength(world, me));
  const neighbours = new Set(borderNationIds(world, me.id));
  const rows = [];
  for (const other of world.nations) {
    if (!other.alive || other.id === me.id) continue;
    const war = atWar(world, me.id, other.id);
    const crisis = !war && inCrisis(world, me.id, other.id);
    const truce = truceLeft(world, me.id, other.id, turn);
    const ally = isAllied(me, other.id);
    const rival = me.rivalId === other.id || other.rivalId === me.id;
    const neighbour = neighbours.has(other.id);
    const vassal = overlordOf(world, other.id, turn) === me.id;
    const overlord = overlordOf(world, me.id, turn) === other.id;
    const standing = war ? 'war' : crisis ? 'crisis' : ally ? 'ally' : vassal ? 'vassal' : overlord ? 'overlord'
      : truce > 0 ? 'truce' : rival ? 'rival' : neighbour ? 'neighbour' : 'other';
    // Karşı tarafın gözünden: bizimle ittifaka ne kadar yanaşır (YZ'nin AYNI ölçüsü).
    const allyVerdict = allianceVerdict(world, other, me, turn);
    const power = nationStrength(world, other);
    const claim = hasClaimOn(world, me.id, other.id);
    const relationsRow = relationsOf(world, other.id, me.id, turn);
    const envoyBlocked = envoyBlockers(world, me, other.id);
    const posted = (me.envoys ?? []).includes(other.id);
    const warRow = war || crisis ? null : warAction(world, me, other, turn);
    rows.push({
      id: other.id,
      name: other.name,
      color: other.color,
      standing,
      neighbour,
      rival,
      rivalOfUs: other.rivalId === me.id,
      ratio: power / myPower,
      claim,
      warCost: warRow?.cost ?? warDeclarationCost(world, me.id, other.id),
      warLabel: warRow?.label ?? null,
      warTip: warRow?.tip ?? '',
      // İlanı ne engelliyor: düğme sessizce reddetmesin, nedenini söylesin.
      warBlockers: warRow?.blockers ?? [],
      warBreaksPact: warRow?.pact ?? false,
      warJoinsCall: warRow?.call ?? false,
      annexCost: vassal ? annexCost(world, other) : null,
      annexBlockers: vassal ? annexBlockers(world, me, other, turn) : null,
      truce,
      crisis: crisis ? crisisLeft(world, me.id, other.id, turn) : 0,
      score: war ? warScore(world, me.id, other.id) : null,
      // Barış masası savaşın ilk MIN_WAR_TURNS haftasında açılmaz.
      talksIn: war ? Math.max(0, MIN_WAR_TURNS - (turn - (relation(world, me.id, other.id)?.since ?? turn))) : null,
      appeal: Number.isFinite(allyVerdict.sum) ? allyVerdict.sum : null,
      allyVerdict,
      allyBlocker: ally || war ? null : allyVerdict.blockers[0]
        ?? (allyVerdict.accept ? null : allianceRefusalText(me, allyVerdict)),
      allyTip: verdictSentence(allyVerdict),
      relations: relationsRow,
      envoy: { posted, can: !envoyBlocked.length, blockers: envoyBlocked },
      threat: neighbour && !war && !crisis ? threatView(world, other, me, turn) : null,
      tags: tagsFor(world, me, other, turn, { neighbour, claim, infamyCap: INFAMY_COALITION }),
      embargoByUs: (me.embargoes ?? []).includes(other.id),
      embargoByThem: (other.embargoes ?? []).includes(me.id),
      trades: !embargoed(world, me.id, other.id),
      infamy: other.infamy ?? 0,
      tiles: other.tiles ?? 0,
      commitment: Boolean(napOf(me, other.id, turn) || guaranteeOf(me, other.id) || guaranteeOf(other, me.id)
        || cbOf(me, other.id, turn) || ally || vassal || overlord || (me.envoys ?? []).includes(other.id)),
    });
  }
  // Grup sırası, grup içinde güçlüden zayıfa; eşitlikte kimlik (sabit sıra).
  rows.sort((a, b) => STANDINGS.indexOf(a.standing) - STANDINGS.indexOf(b.standing)
    || b.ratio - a.ratio || a.id - b.id);
  const count = (standing) => rows.filter((row) => row.standing === standing).length;
  const requests = pendingFor(world, me.id)
    .filter((rec) => !(rec.kind === 'demand' && rec.answer))
    .sort((a, b) => a.expires - b.expires || a.id - b.id)
    .map((rec) => requestView(world, me, rec, turn));
  const commitments = commitmentsOf(world, me, turn);
  const upkeep = me.politics?.diplomaticUpkeep ?? 0;
  return {
    infamy: me.infamy ?? 0,
    infamyCap: INFAMY_COALITION,
    wars: count('war'),
    crises: count('crisis'),
    allies: alliesOf(me).length,
    maxAllies: MAX_ALLIES,
    truces: count('truce'),
    embargoes: (me.embargoes ?? []).length,
    rival: me.rivalId != null ? world.nations[me.rivalId]?.name ?? null : null,
    rivalInfo: rivalInfoOf(world, me, turn),
    rivalsOfUs: rows.filter((row) => row.rivalOfUs).map((row) => row.name),
    neighbours: neighbours.size,
    envoys: { used: (me.envoys ?? []).length, slots: ENVOY.SLOTS, rate: ENVOY.RATE, cap: ENVOY.CAP },
    upkeep,
    upkeepParts: {
      envoys: (me.envoys ?? []).length, guarantees: guaranteesGiven(me).length,
      pacts: napsOf(me, turn).length,
    },
    power: me.power ?? 0,
    requests,
    commitments,
    rows,
  };
}

function allianceRefusalText(me, verdict) {
  if ((me.infamy ?? 0) > 15) return 'Your infamy frightens them.';
  return `They see no reason (${verdict.sum.toFixed(1)} of ${verdict.threshold}): a shared enemy, a shared rival or a stronger neighbour of you both would change that — or an envoy at their court (+1.6 within a year).`;
}

// ----------------------------------------------------------- DOSYA ---

/**
 * ÜLKE DOSYASI: ilişki kartı (nasıl görüyorlar, neden, ne işe yarar),
 * onlar için tehlike (en tehlikeli iki komşu, YZ'nin kendi kapısıyla),
 * vassal özerkliği, her eylemin hükmü ya da engeli ve talep satırları.
 */
export function dossierView(world, me, target, turn = world.turn ?? 0) {
  if (!me?.alive || !target?.alive || me.id === target.id) return null;
  const relations = relationsOf(world, target.id, me.id, turn);
  const ourView = regardOf(world, me.id, target.id, turn);
  // Onlar için tehlike: temas eden en tehlikeli iki komşu (biz hariç).
  const dangers = [];
  if (world.contacts) {
    for (const other of world.nations) {
      if (!other.alive || other.id === target.id || other.id === me.id || !world.contacts[other.id]?.[target.id]) continue;
      if (hostile(world, other.id, target.id)) continue;
      const view = threatView(world, other, target, turn, { voice: 'them' });
      if (view) dangers.push({ id: other.id, name: other.name, ...view, odds: undefined });
    }
  }
  dangers.sort((a, b) => b.ratio / b.needed - a.ratio / a.needed || a.id - b.id);
  const vassal = overlordOf(world, target.id, turn) === me.id;
  const overlord = overlordOf(world, me.id, turn) === target.id;
  const autonomy = vassal ? autonomyBreakdown(world, target, turn) : null;
  const ourAutonomy = overlord ? autonomyBreakdown(world, me, turn) : null;
  const independence = overlord ? independenceBlockers(world, me, turn) : null;
  const allyVerdict = allianceVerdict(world, target, me, turn);
  const napNow = napOf(me, target.id, turn);
  const napVerdictTheirs = napVerdict(world, target, me, turn);
  const napBlocked = napBlockers(world, me, target, turn, { renew: Boolean(napNow) });
  const guaranteeBlocked = guaranteeBlockers(world, me, target, turn);
  const guaranteed = Boolean(guaranteeOf(me, target.id));
  const rivalBlocked = rivalBlockers(world, me, target, turn);
  const kindred = unionCandidates(world, me).some((n) => n.id === target.id);
  const unionBlocked = kindred ? unionBlockers(world, me, target, turn) : null;
  const candidates = demandCandidates(world, me.id, target.id).slice(0, DEMAND.SHOWN);
  const demands = candidates.map((province) => {
    const verdict = demandVerdict(world, target, me, province, turn);
    return {
      provinceId: province.id, name: province.name,
      tile: province.center ? { q: province.center.q, r: province.center.r } : null,
      verdict, blockers: demandBlockers(world, me, target, turn, { province }),
      text: `${verdict.yield ? 'they would yield' : 'they would refuse'} (${fmt(verdict.sum)}): ${verdict.parts.map((p) => `${p.label} ${fmt(p.value)}`).join(' · ')}`,
    };
  });
  const demandWhy = candidates.length ? null : demandBlockers(world, me, target, turn)[0] ?? null;
  const envoyBlocked = envoyBlockers(world, me, target.id);
  return {
    relations,
    ourView,
    allyBreak: isAllied(me, target.id) ? allyBreakInfo(world, me, target, turn) : null,
    annexBlockers: vassal ? annexBlockers(world, me, target, turn) : null,
    dangers: dangers.slice(0, 2),
    autonomy,
    ourAutonomy,
    independence,
    guaranteed,
    guaranteesUs: Boolean(guaranteeOf(target, me.id)),
    pact: napNow ? { until: napNow.until, left: napNow.until - turn, denounced: napNow.denounced ?? null } : null,
    cb: cbOf(me, target.id, turn),
    envoy: { posted: (me.envoys ?? []).includes(target.id), blockers: envoyBlocked, standing: envoyStanding(world, target.id, me.id, turn) },
    verdicts: {
      ally: { ...allyVerdict, sentence: verdictSentence(allyVerdict) },
      nap: {
        blockers: napBlocked, verdict: napVerdictTheirs,
        sentence: napBlocked.length ? napBlocked[0] : verdictSentence(napVerdictTheirs, { yes: 'They would sign', no: 'They would refuse' }),
      },
      guarantee: { blockers: guaranteeBlocked, guaranteed, threatened: guaranteed && protegeThreatened(world, target.id) },
      rival: { blockers: rivalBlocked, declared: me.rivalChosen != null && me.rivalId === target.id, assigned: me.rivalId === target.id && me.rivalChosen == null },
      union: kindred ? { blockers: unionBlocked, cost: UNION_POWER } : null,
      embargo: { blockers: embargoBlockers(world, me, target), active: (me.embargoes ?? []).includes(target.id), cost: EMBARGO_POWER },
    },
    demands,
    demandWhy,
    costs: {
      nap: NAP.COST, guarantee: GUARANTEE.COST, guaranteeUpkeep: GUARANTEE.UPKEEP, rival: RIVAL.COST,
      demand: DEMAND.COST, demandInfamy: DEMAND.ISSUE_INFAMY, envoyUpkeep: ENVOY.UPKEEP,
      independenceAt: AUTONOMY.PLAYER_INDEPENDENCE,
    },
    war: warAction(world, me, target, turn),
  };
}
