// Ittifak, rakip ve diplomatik hafiza.
//
// Tasarim ilkesi: YENI mimari yok. Ittifak, baris sartlariyla ayni
// `nation.treaties` dizisinde SIMETRIK bir kayittir ({type:'ALLIANCE',
// partner, since} — iki tarafta da durur, suresiz). Savaslar ciftler arasi
// kalir: cagri-ile-savas, koalisyonla ayni kaliptir — muttefik saldirgana
// KENDI ciftler-arasi savasini acar (declareWar'in butun kapilarindan
// gecerek). Rakip tek bir alan (nation.rivalId), hafiza sinirli bir dizi.
//
// Ittifak artik iki ucunda da fiyati olan bir sozdur (TASARIM §12): cagriya
// gelmek bedava ve savunmadir, gelmemek ve bozmak iliski defterine yazilir
// (relations.js). YZ oyuncuya da ittifak teklif eder (bekleyen kayit:
// world.diplo, oyuncunun masasi).
//
// Katman: game — DOM yok. diplomacy/peace'e dayanir; onlar bunu import etmez.

import { IC_SCALE } from './econ/defs.js';
import { TIER, announce, remember } from './chronicle.js';
import { calendarYear } from './calendar.js';
import { atWar, attackerCount, declareWar, hostile, relation, warBlockers } from './diplomacy.js';
import { treatiesOf } from './peace.js';
import {
  ALLIANCE_RULES, CALL, DIP_AI, READ,
} from './dipDefs.js';
import {
  deed, defendersOf, grantPassage, guaranteeBond, guaranteeOf, lastDeedTurn, napOf, noteDiplomacy, overlordIdOf,
  proposalGate, pushPending, pushProposal, regardOf,
} from './relations.js';

export const ALLIANCE = 'ALLIANCE';
export const MAX_ALLIES = 2;
const REVIEW_EVERY = 13;          // YZ ittifak taramasi: ceyrekte bir
const RIVAL_EVERY = 52;           // rakip degerlendirmesi: yilda bir

// -------------------------------------------------------------- ITTIFAK ---

export function alliesOf(nation) {
  return treatiesOf(nation)
    .filter((t) => t.type === ALLIANCE)
    .map((t) => t.partner);
}

/** Ulus nesnesi + ORTAK ID'si (butun cagri yerleri boyle kullanir). */
export function isAllied(nation, partnerId) {
  return treatiesOf(nation).some((t) => t.type === ALLIANCE && t.partner === partnerId);
}

function addAllianceEntry(nation, partnerId, turn) {
  nation.treaties = (nation.treaties ?? []).filter(
    (t) => t.type !== ALLIANCE || t.partner !== partnerId,
  );
  // `until` YOK: ittifak bozulana kadar surer (expireTreaties Infinity sayar).
  nation.treaties.push({ type: ALLIANCE, partner: partnerId, since: turn });
}

export function formAlliance(world, a, b, turn) {
  const na = world.nations[a];
  const nb = world.nations[b];
  if (!na?.alive || !nb?.alive || a === b) return false;
  if (atWar(world, a, b)) return false;
  if (isAllied(na, b)) return false;
  addAllianceEntry(na, b, turn);
  addAllianceEntry(nb, a, turn);
  remember(na, turn, 'allied', b);
  remember(nb, turn, 'allied', a);
  // Müttefikler arası pakt gereksizdir: ittifak onu kapsar.
  na.treaties = na.treaties.filter((t) => !(t.type === 'NAP' && t.partner === b));
  nb.treaties = nb.treaties.filter((t) => !(t.type === 'NAP' && t.partner === a));
  return true;
}

export function breakAlliance(world, a, b, turn) {
  const na = world.nations[a];
  const nb = world.nations[b];
  if (!na || !nb || !isAllied(na, b)) return false;
  na.treaties = (na.treaties ?? []).filter((t) => t.type !== ALLIANCE || t.partner !== b);
  nb.treaties = (nb.treaties ?? []).filter((t) => t.type !== ALLIANCE || t.partner !== a);
  remember(na, turn, 'alliance_broken', b);
  remember(nb, turn, 'alliance_broken', a);
  return true;
}

/** Bu çift yakın zamanda (COOLDOWN) bozuştu mu — iki defterden biri. */
function brokeRecently(world, a, b, turn) {
  for (const [obs, subj] of [[a, b], [b, a]]) {
    const at = lastDeedTurn(world, obs, subj, 'broke_alliance');
    if (at != null && turn - at < ALLIANCE_RULES.COOLDOWN) return turn - at;
  }
  return null;
}

const isVassal = (world, nation, turn) => overlordIdOf(world, nation.id, turn) >= 0;

/**
 * YZ'nin bir ittifak teklifini degerlendirmesi — `evaluator` ulkesi `other`
 * ile ittifaki ister mi? Oyuncunun teklifine de AYNI olcu uygulanir: YZ'ye
 * ozel cömertlik yok, oyuncuya ozel ceza yok.
 *
 * Terimler (hepsi mevcut durumdan): ortak dusman, ortak rakip, guclu ortak
 * tehdit, guc dengesi, sohret, mevcut ittifak yuku, iliski defteri (en
 * sonda: kollar kapaliyken toplam bugunkuyle bit bit ayni kalsin).
 */
export function allianceAppeal(world, evaluator, other, turn = world.turn ?? 0) {
  if (!evaluator?.alive || !other?.alive) return -Infinity;
  if (evaluator.id === other.id) return -Infinity;
  if (atWar(world, evaluator.id, other.id)) return -Infinity;
  if (evaluator.rivalId === other.id || other.rivalId === evaluator.id) return -Infinity;
  if (alliesOf(evaluator).length >= MAX_ALLIES) return -Infinity;
  // DIP-03 sarkacı: bozma kuralının aynası (şöhret > 30 kurulmaz) ve
  // bozulan çift bir yıl yeniden kurulmaz.
  if (DIP_AI.alliances) {
    if ((other.infamy ?? 0) > ALLIANCE_RULES.BREAK_INFAMY) return -Infinity;
    if (brokeRecently(world, evaluator.id, other.id, turn) != null) return -Infinity;
  }
  // Vassalın dış siyaseti efendisinindir.
  if (DIP_AI.vassals && (isVassal(world, evaluator, turn) || isVassal(world, other, turn))) return -Infinity;

  let score = 0;
  // Ortak dusman: ikimizin de savasta oldugu ulke.
  for (const third of world.nations) {
    if (!third.alive || third.id === evaluator.id || third.id === other.id) continue;
    if (atWar(world, evaluator.id, third.id) && atWar(world, other.id, third.id)) score += 2;
  }
  // Ortak rakip (savasa donusmemis dusmanlik da sayilir).
  if (evaluator.rivalId != null && evaluator.rivalId === other.rivalId) score += 1.5;
  // Guclu ortak tehdit: ikimize de temas eden, ikimizden de belirgin guclu komsu.
  const contacts = world.contacts;
  const myPower = nationPowerOf(world, evaluator);
  const theirPower = nationPowerOf(world, other);
  if (contacts) {
    for (const third of world.nations) {
      if (!third.alive || third.id === evaluator.id || third.id === other.id) continue;
      if (!contacts[evaluator.id]?.[third.id] || !contacts[other.id]?.[third.id]) continue;
      const thirdPower = nationPowerOf(world, third);
      if (thirdPower > myPower * 1.3 && thirdPower > theirPower * 1.3) {
        score += 1.5;
        break;
      }
    }
  }
  // Guc dengesi: cok kucukle ittifak yuk, cok buyukle uyduluk.
  const ratio = theirPower / Math.max(1, myPower);
  if (ratio < 0.35 || ratio > 3) score -= 1;
  // Sohretli ortak koalisyonu uzerimize ceker.
  if ((other.infamy ?? 0) > 15) score -= 2;
  // Gecmis savaslar guveni asindirir (iliski kaydindaki sayac).
  const wars = relation(world, evaluator.id, other.id)?.wars ?? 0;
  score -= wars * 0.5;
  // İlişki defteri (R1): +40 elçi = +1.6.
  if (DIP_AI.relations) score += regardOf(world, evaluator.id, other.id, turn) / READ.ALLIANCE_DIV;
  return score;
}

function nationPowerOf(world, nation) {
  // ai.js nationStrength'i import etmek dongu riski tasir (ai -> alliances?);
  // basit ve deterministik bir vekil yeterli: alay sayisi + sanayi.
  let regiments = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId === nation.id) regiments += unit.regiments?.length ?? 0;
  }
  // Ham sanayi eski fabrika kademesinin ~IC_SCALE katı: alay ağırlığı korunsun.
  return regiments * 3 + (nation.economy?.ic?.raw ?? 0) / IC_SCALE;
}

/**
 * İttifakın engelleri, `proposer` (teklif eden) gözünden: değerlendiren
 * `evaluator` neden hiç düşünmez. allianceAppeal'in −∞ kapılarının aynası;
 * cümle oyuncuya basılır.
 */
export function allianceBlockers(world, evaluator, proposer, turn = world.turn ?? 0) {
  const out = [];
  if (!evaluator?.alive || !proposer?.alive || evaluator.id === proposer.id) return ['No such nation'];
  if (isAllied(proposer, evaluator.id)) return ['Already allied'];
  if (atWar(world, evaluator.id, proposer.id)) out.push('We are at war');
  if (evaluator.rivalId === proposer.id || proposer.rivalId === evaluator.id) out.push('Rivals never ally');
  if (alliesOf(proposer).length >= MAX_ALLIES) out.push(`We already have ${MAX_ALLIES} allies`);
  if (alliesOf(evaluator).length >= MAX_ALLIES) out.push(`They already have ${MAX_ALLIES} allies`);
  if (DIP_AI.alliances) {
    const infamy = proposer.infamy ?? 0;
    if (infamy > ALLIANCE_RULES.BREAK_INFAMY) {
      out.push(`Our infamy (${Math.round(infamy)}) exceeds what they will stand beside (${ALLIANCE_RULES.BREAK_INFAMY})`);
    }
    const ago = brokeRecently(world, evaluator.id, proposer.id, turn);
    if (ago != null) out.push(`The alliance was broken ${ago} weeks ago (${ALLIANCE_RULES.COOLDOWN} needed)`);
  }
  if (DIP_AI.vassals) {
    const lordOf = (n) => world.nations[overlordIdOf(world, n.id, turn)];
    if (isVassal(world, evaluator, turn)) out.push(`Their foreign policy belongs to ${lordOf(evaluator)?.name ?? 'their overlord'}`);
    if (isVassal(world, proposer, turn)) out.push(`Our foreign policy belongs to ${lordOf(proposer)?.name ?? 'our overlord'}`);
  }
  return out;
}

/**
 * İttifak hükmü parça parça — ekranın "They would accept: 2.4 ≥ 2 — ..."
 * satırı. Toplam allianceAppeal ile AYNI sırayla toplanır: audit:diplomacy
 * cümle testi |Δ| < 1e-9 ister (iki hesap ayrışamaz).
 */
export function allianceVerdict(world, evaluator, other, turn = world.turn ?? 0) {
  const threshold = ALLIANCE_RULES.APPEAL;
  const blockers = allianceBlockers(world, evaluator, other, turn);
  if (blockers.length) return { accept: false, sum: -Infinity, threshold, parts: [], blockers };
  const parts = [];
  const push = (label, value) => { if (value !== 0) parts.push({ label, value }); };
  const enemies = [];
  for (const third of world.nations) {
    if (!third.alive || third.id === evaluator.id || third.id === other.id) continue;
    if (atWar(world, evaluator.id, third.id) && atWar(world, other.id, third.id)) enemies.push(third.name);
  }
  if (enemies.length) push(`Shared enem${enemies.length === 1 ? 'y' : 'ies'} ${enemies.slice(0, 2).join(', ')}`, 2 * enemies.length);
  if (evaluator.rivalId != null && evaluator.rivalId === other.rivalId) {
    push(`Shared rival ${world.nations[evaluator.rivalId]?.name ?? ''}`.trim(), 1.5);
  }
  const contacts = world.contacts;
  const myPower = nationPowerOf(world, evaluator);
  const theirPower = nationPowerOf(world, other);
  if (contacts) {
    for (const third of world.nations) {
      if (!third.alive || third.id === evaluator.id || third.id === other.id) continue;
      if (!contacts[evaluator.id]?.[third.id] || !contacts[other.id]?.[third.id]) continue;
      const thirdPower = nationPowerOf(world, third);
      if (thirdPower > myPower * 1.3 && thirdPower > theirPower * 1.3) {
        push(`Common threat ${third.name}`, 1.5);
        break;
      }
    }
  }
  const ratio = theirPower / Math.max(1, myPower);
  if (ratio < 0.35) push('Too weak to be worth it', -1);
  else if (ratio > 3) push('Too strong: they fear becoming a satellite', -1);
  if ((other.infamy ?? 0) > 15) push('Infamy', -2);
  const wars = relation(world, evaluator.id, other.id)?.wars ?? 0;
  if (wars) push(`Past wars ×${wars}`, -wars * 0.5);
  if (DIP_AI.relations) push('Relations', regardOf(world, evaluator.id, other.id, turn) / READ.ALLIANCE_DIV);
  let sum = 0;
  for (const part of parts) sum += part.value;
  // Kayan nokta: parçalar appeal'deki sırayla eklendi; sıfır parçalar
  // atlandı (x + 0 = x), toplam bit bit aynı.
  return { accept: sum >= threshold, sum, threshold, parts, blockers };
}

/** Hükmün tek satırlık cümlesi: "2.4 ≥ 2 — Shared rival +1.5 · Relations +0.9". */
export function verdictSentence(verdict, { yes = 'They would accept', no = 'They would refuse' } = {}) {
  if (verdict.blockers?.length) return verdict.blockers[0];
  // Gösterimde ondalığın altındaki kırıntı "−0.0" yazmasın (toplam değişmez).
  const shown = (v) => (Math.abs(v) < 0.05 ? 0 : v);
  const fmt = (v) => `${shown(v) >= 0 ? '+' : '−'}${Math.abs(shown(v)).toFixed(1)}`;
  const visible = verdict.parts.filter((p) => Math.abs(p.value) >= 0.05);
  const parts = visible.length
    ? visible.map((p) => `${p.label} ${fmt(p.value)}`).join(' · ')
    : 'no reasons either way';
  const cmp = verdict.accept ? '≥' : '<';
  return `${verdict.accept ? yes : no}: ${shown(verdict.sum).toFixed(1)} ${cmp} ${verdict.threshold} — ${parts}`;
}

/**
 * Bozmanın SEBEBİ (yoksa null): ortağın şöhreti 30'u aştı, rakibimiz oldu ya
 * da son iki yılda bizi saldırı altında yalnız bıraktı. Sebepli bozma
 * bedavadır ve ilişkiyi az yaralar. Metin iki ağızdan: `ours` bozanın,
 * `theirs` bozulanın ekranına.
 */
export function breakCause(world, me, partner, turn = world.turn ?? 0) {
  if (!me || !partner) return null;
  const infamy = partner.infamy ?? 0;
  if (infamy > ALLIANCE_RULES.BREAK_INFAMY) {
    return {
      key: 'infamy',
      ours: `their infamy (${Math.round(infamy)}) exceeds what we will stand beside (${ALLIANCE_RULES.BREAK_INFAMY})`,
      theirs: `our infamy (${Math.round(infamy)}) exceeds what they will stand beside (${ALLIANCE_RULES.BREAK_INFAMY})`,
    };
  }
  if (me.rivalId === partner.id) {
    return { key: 'rival', ours: 'they are our rival', theirs: 'they now name us their rival' };
  }
  for (const kind of ['refused_call', 'abandoned']) {
    const at = lastDeedTurn(world, me.id, partner.id, kind);
    if (at != null && turn - at < ALLIANCE_RULES.CAUSE_WEEKS) {
      const year = calendarYear(at);
      return {
        key: kind,
        ours: `they left us alone when we were attacked in ${year}`,
        theirs: `we did not answer their call in ${year}`,
      };
    }
  }
  return null;
}

/**
 * İTTİFAKI BOZMAK — fiyatıyla. Sebepliyse bedava ve ortağın defterine −15;
 * sebepsizse 10 SG ve −40 (YZ yalnız sebeple bozar). Kart, tarih ve
 * bozulanın ekranında sebep cümlesi (DIP-04: oyuncuyu bırakan YZ artık
 * sessiz değil).
 * @returns {{ ok: boolean, reason?: string, cause?: object|null, cost?: number }}
 */
export function breakAllianceBy(game, me, partnerId, { ai = false, cause = null } = {}) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const partner = world.nations[partnerId];
  if (!me || !partner || !isAllied(me, partnerId)) return { ok: false, reason: 'Not allied' };
  const why = cause ?? breakCause(world, me, partner, turn);
  let cost = 0;
  if (!why) {
    if (ai) return { ok: false, reason: 'The AI breaks only with cause' };
    if ((me.power ?? 0) < ALLIANCE_RULES.BREAK_POWER) {
      return { ok: false, reason: `Needs ${ALLIANCE_RULES.BREAK_POWER} political power` };
    }
    cost = ALLIANCE_RULES.BREAK_POWER;
    me.power -= cost;
  }
  breakAlliance(world, me.id, partnerId, turn);
  deed(world, partnerId, me.id, 'broke_alliance', turn, why ? ALLIANCE_RULES.CAUSE_SCALE : 1);
  noteDiplomacy(game, {
    tier: 1, title: `${me.name} ends its alliance with ${partner.name}`,
    detail: why ? `Because ${why.ours}.` : 'Without cause.',
    actors: [me.id, partnerId], key: `alliance:${Math.min(me.id, partnerId)}:${Math.max(me.id, partnerId)}`,
  });
  const player = game.turns?.playerNation;
  if (me.id === player) {
    announce(game, me, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `ally:${partnerId}`,
      title: `The alliance with ${partner.name} is dissolved`,
      detail: why
        ? `We had cause: ${why.ours}. ${partner.name} takes it as a minor slight.`
        : `Without cause it cost ${cost} political power, and ${partner.name} will remember it (relations −40).`,
    });
  } else if (partnerId === player) {
    announce(game, partner, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `ally:${me.id}`,
      title: `${me.name} ends our alliance`,
      detail: why ? `Their reason: ${why.theirs}.` : 'They gave no reason.',
    });
  }
  game.emit?.('diplomacy');
  return { ok: true, cause: why, cost };
}

/**
 * YZ-YZ ittifak taramasi. Ceyrekte bir; deterministik sira (id artan).
 * Ittifak bozma: sohreti tasan, rakiplesen ya da iliskisi −25'in altina
 * dusen ortak birakilir (hep sebeple). Kurma: en cazip karsilikli aday;
 * oyuncu da aday olabilir — o zaman masaya teklif duser ve bu ceyrek
 * hicbir ittifak kurulmaz (oyuncu kendi karar verir).
 */
export function reviewAlliances(game) {
  const world = game.world;
  const turn = game.turns.turn ?? 0;
  if (turn % REVIEW_EVERY !== 0) return;
  const player = game.turns.playerNation;

  for (const nation of world.nations) {
    if (!nation.alive || nation.id === player) continue;
    // Once bozulacaklar: guven bitti mi?
    for (const partnerId of alliesOf(nation)) {
      const partner = world.nations[partnerId];
      if (!partner?.alive) { breakAlliance(world, nation.id, partnerId, turn); continue; }
      let cause = null;
      if ((partner.infamy ?? 0) > ALLIANCE_RULES.BREAK_INFAMY || nation.rivalId === partnerId) {
        cause = breakCause(world, nation, partner, turn);
      } else if (DIP_AI.relations) {
        const regard = regardOf(world, nation.id, partnerId, turn);
        if (regard < READ.BREAK) {
          cause = breakCause(world, nation, partner, turn) ?? {
            key: 'relations',
            ours: `our relations have soured (${Math.round(regard)})`,
            theirs: `their opinion of us has soured (${Math.round(regard)})`,
          };
        }
      }
      if (!cause) continue;
      breakAllianceBy(game, nation, partnerId, { ai: true, cause });
      if (partnerId !== player) notifyPlayerAllianceEvent(game, nation, partner, 'broke');
    }
    if (alliesOf(nation).length >= MAX_ALLIES) continue;
    // Sonra kurulacaklar: en cazip karsilikli aday.
    let best = null;
    let bestScore = 0;
    let playerScore = -Infinity;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (isAllied(nation, other.id)) continue;
      const isPlayer = other.id === player;
      if (isPlayer && !DIP_AI.proposals) continue;
      const mine = allianceAppeal(world, nation, other, turn);
      if (mine < ALLIANCE_RULES.APPEAL) continue;
      const theirs = allianceAppeal(world, other, nation, turn);
      // Oyuncu kendisi karar verir: onun gözünden makul olması yeter.
      if (theirs < (isPlayer ? ALLIANCE_RULES.PLAYER_PLAUSIBLE : ALLIANCE_RULES.APPEAL)) continue;
      const score = mine + theirs;
      if (isPlayer) { playerScore = score; continue; }
      if (score > bestScore || (score === bestScore && best && other.id < best.id)) {
        bestScore = score;
        best = other;
      }
    }
    const playerBest = playerScore > bestScore || (playerScore === bestScore && Number.isFinite(playerScore)
      && best && player < best.id) || (!best && Number.isFinite(playerScore) && playerScore > 0);
    if (playerBest && proposalGate(world, player, nation.id, ALLIANCE, turn)) {
      proposeAllianceToPlayer(game, nation, turn);
      continue;
    }
    if (best) {
      formAlliance(world, nation.id, best.id, turn);
      noteDiplomacy(game, {
        tier: 1, title: `${nation.name} and ${best.name} conclude an alliance`,
        actors: [nation.id, best.id], key: `alliance:${Math.min(nation.id, best.id)}:${Math.max(nation.id, best.id)}`,
      });
      notifyPlayerAllianceEvent(game, nation, best, 'formed');
    }
  }
}

/** YZ'nin oyuncuya ittifak teklifi: masaya düşer, durdurmaz, 13 hafta bekler. */
function proposeAllianceToPlayer(game, nation, turn) {
  const world = game.world;
  const player = world.nations[game.turns.playerNation];
  const rec = pushProposal(world, { treaty: ALLIANCE, from: nation.id, to: player.id }, turn);
  const verdict = allianceVerdict(world, nation, player, turn);
  const reasons = verdict.parts.filter((p) => p.value > 0)
    .map((p) => `${p.label} ${p.value >= 0 ? '+' : '−'}${Math.abs(p.value).toFixed(1)}`).join(', ');
  announce(game, player, {
    kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `dip-req:${rec.id}`, ttl: 0,
    title: `${nation.name} proposes an alliance`,
    detail: `${reasons ? `Their reasons: ${reasons}. ` : ''}An attack on one becomes a call to the other. Answer in Diplomacy (P) within ${rec.expires - turn} weeks.`,
  });
}

/** Oyuncunun rakibini/komsusunu ilgilendiren ittifak olaylari kisa satir. */
function notifyPlayerAllianceEvent(game, a, b, what) {
  const player = game.turns.playerNation;
  const playerNation = game.world.nations[player];
  if (!playerNation) return;
  // Yalniz oyuncunun DUNYASINA dokunanlar: komsusu, rakibi, muttefiki ya da
  // garanti ettigi taraf ise.
  const relevant = [a, b].some((n) => playerNation.rivalId === n.id
    || game.world.contacts?.[player]?.[n.id]
    || isAllied(playerNation, n.id)
    || guaranteeOf(playerNation, n.id));
  if (!relevant) return;
  game.turns.addLog(
    what === 'formed'
      ? `${a.name} and ${b.name} have concluded an alliance.`
      : `${a.name} has broken its alliance with ${b.name}.`,
    { kind: 'DIPLOMACY', key: `alliance:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}` },
  );
}

/** Çağrı metni: bağ türüne göre "kal" seçeneğinin bedeli. */
function stayOutCost(bond, defenderName) {
  if (bond === 'guarantor') return 'the guarantee ends, every partner of ours sees it (relations −10 each) and prestige −5';
  if (bond === 'vassal' || bond === 'overlord') return `${defenderName} −30 in relations, and the bond between us strains`;
  return `${defenderName} −30 in relations, and they may end the alliance`;
}

const BOND_TEXT = {
  ally: 'our alliance', guarantor: 'our guarantee of their independence',
  overlord: 'our bond as their overlord', vassal: 'our bond as their vassal',
};

/**
 * Cagri-ile-savas: b'ye savas ilan edildi; b'nin arkasindakiler
 * (relations.defendersOf: muttefik, garantor, vassal bagi) saldirgana KENDI
 * savaslarini acar. declareWar'in butun kapilari gecerli (cullanma tavani
 * dahil). Oyuncu OTOMATIK SOKULMAZ: masaya bekleyen cagri duser, katilmak
 * bedava ve savunmadir (DIP-01), kalmanin bedeli yazilidir (DIP-07). Zincir
 * yok: cagriyla acilan savas yeni cagri dogurmaz.
 */
export function callAlliesToWar(game, aggressorId, defenderId, warAt = undefined, reason = null) {
  const world = game.world;
  const turn = game.turns.turn ?? 0;
  const defender = world.nations[defenderId];
  if (!defender) return;
  const aggressor = world.nations[aggressorId];
  const player = game.turns.playerNation;
  for (const { id, bond } of defendersOf(world, defenderId, reason, turn)) {
    const ally = world.nations[id];
    if (!ally?.alive || id === aggressorId) continue;
    if (hostile(world, id, aggressorId)) continue;
    // Iki cephesi olan muttefik cagriya gelmez: ai.js ve koalisyonla ayni
    // kural; olculdu, altinci savas buradan geliyordu (audit:war-pressure).
    if (attackerCount(world, id) >= 2) {
      if (id === player) {
        game.turns.addLog(`${defender.name} was attacked by ${aggressor?.name ?? 'an aggressor'}; we already fight on two fronts and are not called.`,
          { kind: 'DIPLOMACY', key: `call:${aggressorId}`, tier: TIER.IMPORTANT });
      }
      continue;
    }
    if (id === player) {
      callPlayer(game, ally, defender, aggressor, bond, warAt, turn);
      continue;
    }
    // Muttefigin ultimatomu saldirganinkiyle ayni hafta biter: cephe birlikte acilir.
    if (declareWar(game, id, aggressorId, { reason: 'alliance', calledBy: defenderId, warAt })) {
      remember(ally, turn, 'honored_call', defenderId);
      deed(world, defenderId, id, 'honoured_call', turn);
      grantPassage(world, defenderId, id, aggressorId);
      grantPassage(world, id, defenderId, aggressorId);
      if (defenderId === player) {
        const weeks = Math.max(0, (relation(world, id, aggressorId)?.warAt ?? turn) - turn);
        announce(game, defender, {
          kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `ally-call:${id}`,
          title: `${ally.name} honours ${BOND_TEXT[bond]?.replace(/^our/, 'its') ?? 'its word'}`,
          detail: `Their armies march with ours against ${aggressor?.name ?? 'the aggressor'}${weeks ? ` in ${weeks} weeks` : ''}.`,
        });
      }
    } else if (defenderId === player) {
      const why = warBlockers(world, id, aggressorId, turn, 'alliance')[0] ?? 'they could not declare';
      announce(game, defender, {
        kind: 'DIPLOMACY', tier: TIER.IMPORTANT, key: `ally-call:${id}`,
        title: `${ally.name} cannot answer our call`,
        detail: `${why}.`,
      });
    }
  }
}

/** Oyuncuya düşen çağrı: bekleyen kayıt + durduran kart (cevap Diplomasi ekranında). */
function callPlayer(game, me, defender, aggressor, bond, warAt, turn) {
  const world = game.world;
  const start = Number.isFinite(warAt) ? warAt : turn;
  const rec = pushPending(world, {
    kind: 'call', to: me.id, defender: defender.id, aggressor: aggressor.id, warAt: start,
    via: bond, turn, expires: start + CALL.AFTER_WAR,
  });
  const delegated = Boolean(me.delegation?.diplomacy);
  announce(game, me, {
    kind: 'WAR', tier: TIER.MAJOR, key: `call:${aggressor.id}`, halt: !delegated,
    title: `${defender.name} calls us to arms against ${aggressor.name}`,
    detail: `Join free, as a defender: no political power, no war of aggression. Or stay out: ${stayOutCost(bond, defender.name)}. Answer in Diplomacy (P) — ${Math.max(1, rec.expires - turn)} weeks.`,
  });
  return rec;
}

// ---------------------------------------------------------------- RAKIP ---

/**
 * Rakip: bu ulkenin stratejik dusman saydigi devlet. Mana yok, sayac yok —
 * tek alan. Yilda bir, histerezisle: mevcut rakip ancak acik ara daha buyuk
 * bir tehdit cikarsa degisir (etiket sarkaci istemiyoruz; rejim etiketi
 * dersinden). Muttefik asla rakip olmaz. Oyuncunun ELLE ilan ettigi rakip
 * (rivalChosen) o rakip yasadikca yerinde kalir (DIP-05).
 */
export function refreshRivals(world, turn, game = null) {
  if (turn % RIVAL_EVERY !== 0) return;
  const contacts = world.contacts;
  if (!contacts) return;
  const player = game?.turns?.playerNation ?? -1;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    if (nation.rivalChosen != null) {
      if (world.nations[nation.rivalId]?.alive) continue;
      nation.rivalChosen = null;
    }
    const before = nation.rivalId ?? null;
    const myPower = nationPowerOf(world, nation);
    let best = null;
    let bestScore = 0;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (!contacts[nation.id]?.[other.id]) continue;
      if (isAllied(nation, other.id)) continue;
      // Saldırmazlık paktı ve garanti bağı olan devlet rakip seçilmez: pakt
      // imzalandığı yıl ortağı rakip ilan edip feshetmek tutarsızdı (oyuncu
      // testi: Ariia paktın 52. haftasında rakip seçip paktı bozdu).
      if (DIP_AI.pacts && napOf(nation, other.id, turn)) continue;
      if (DIP_AI.guarantees && guaranteeBond(world, nation.id, other.id)) continue;
      const wars = relation(world, nation.id, other.id)?.wars ?? 0;
      const power = nationPowerOf(world, other);
      // Tehdit = temas x gecmis savas yuku x goreli guc. Kucuk komsu rakip
      // olmaz; bizi yenmis ya da boyumuzdeki komsu olur.
      if (power < myPower * 0.6) continue;
      const score = Math.log(1 + contacts[nation.id][other.id])
        * (1 + wars * 0.6) * (power / Math.max(1, myPower));
      if (score > bestScore || (score === bestScore && best && other.id < best.id)) {
        bestScore = score;
        best = other;
      }
    }
    const current = nation.rivalId != null ? world.nations[nation.rivalId] : null;
    if (!current?.alive) {
      nation.rivalId = best?.id ?? null;
    } else if (best && best.id !== nation.rivalId) {
      const currentScore = (() => {
        if (!contacts[nation.id]?.[current.id]) return 0;
        const wars = relation(world, nation.id, current.id)?.wars ?? 0;
        return Math.log(1 + contacts[nation.id][current.id])
          * (1 + wars * 0.6) * (nationPowerOf(world, current) / Math.max(1, myPower));
      })();
      // Histerezis: yeni aday acik ara (1.5x) ustun degilse eski rakip kalir.
      if (bestScore > currentScore * 1.5) nation.rivalId = best.id;
    }
    // Bizi rakip ilan eden YZ artık sessiz değil.
    if (game && player >= 0 && nation.id !== player && nation.rivalId === player && before !== player) {
      announce(game, world.nations[player], {
        kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `rival:${nation.id}`,
        title: `${nation.name} now names us its rival`,
        detail: 'Rivals never ally; they will favour us as a target and seek friends against us.',
      });
    }
  }
}

// ------------------------------------------------------------ HAFTALIK ---

/**
 * Haftalik diplomasi YZ'si (turn.js, YZ evresinden sonra):
 * 1. Cagri kuyrugu bosaltilir — arkadakiler saldirgana kendi savasini acar.
 * 2. Ittifak taramasi (ceyrekte bir).
 * 3. Rakip tazeleme (yilda bir, histerezisli).
 */
export function runDiplomacyAI(game) {
  const world = game.world;
  const calls = world.pendingWarCalls;
  if (calls?.length) {
    world.pendingWarCalls = [];
    for (const { aggressor, defender, warAt, reason } of calls) {
      callAlliesToWar(game, aggressor, defender, warAt, reason ?? null);
    }
  }
  reviewAlliances(game);
  refreshRivals(world, game.turns.turn ?? 0, game);
}
