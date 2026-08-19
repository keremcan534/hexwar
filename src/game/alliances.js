// Ittifak, rakip ve diplomatik hafiza.
//
// Tasarim ilkesi: YENI mimari yok. Ittifak, baris sartlariyla ayni
// `nation.treaties` dizisinde SIMETRIK bir kayittir ({type:'ALLIANCE',
// partner, since} — iki tarafta da durur, suresiz). Savaslar ciftler arasi
// kalir: cagri-ile-savas, koalisyonla ayni kaliptir — muttefik saldirgana
// KENDI ciftler-arasi savasini acar (declareWar'in butun kapilarindan
// gecerek). Rakip tek bir alan (nation.rivalId), hafiza sinirli bir dizi.
//
// Katman: game — DOM yok. diplomacy/peace'e dayanir; onlar bunu import etmez.

import { remember } from './chronicle.js';
import { atWar, declareWar, relation } from './diplomacy.js';
import { treatiesOf } from './peace.js';

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

/**
 * YZ'nin bir ittifak teklifini degerlendirmesi — `evaluator` ulkesi `other`
 * ile ittifaki ister mi? Oyuncunun teklifine de AYNI olcu uygulanir: YZ'ye
 * ozel cömertlik yok, oyuncuya ozel ceza yok.
 *
 * Terimler (hepsi mevcut durumdan): ortak dusman, ortak rakip, guclu ortak
 * tehdit, guc dengesi, sohret, mevcut ittifak yuku.
 */
export function allianceAppeal(world, evaluator, other) {
  if (!evaluator?.alive || !other?.alive) return -Infinity;
  if (evaluator.id === other.id) return -Infinity;
  if (atWar(world, evaluator.id, other.id)) return -Infinity;
  if (evaluator.rivalId === other.id || other.rivalId === evaluator.id) return -Infinity;
  if (alliesOf(evaluator).length >= MAX_ALLIES) return -Infinity;

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
  return score;
}

function nationPowerOf(world, nation) {
  // ai.js nationStrength'i import etmek dongu riski tasir (ai -> alliances?);
  // basit ve deterministik bir vekil yeterli: alay sayisi + sanayi.
  let regiments = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId === nation.id) regiments += unit.regiments?.length ?? 0;
  }
  return regiments * 3 + (nation.economy?.factories?.length ?? 0);
}

/**
 * YZ-YZ ittifak taramasi. Ceyrekte bir; deterministik sira (id artan).
 * Oyuncuya YZ teklif GONDERMEZ (bekleyen-teklif durumu gerektirirdi;
 * bilincli olarak oyuncu-baslatir — REMAINING_TECH_DEBT'e kayitli).
 * Ittifak bozma: sohreti tasan ya da rakiplesen ortak birakilir.
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
      if ((partner.infamy ?? 0) > 30 || nation.rivalId === partnerId) {
        breakAlliance(world, nation.id, partnerId, turn);
        notifyPlayerAllianceEvent(game, nation, partner, 'broke');
      }
    }
    if (alliesOf(nation).length >= MAX_ALLIES) continue;
    // Sonra kurulacaklar: en cazip karsilikli aday.
    let best = null;
    let bestScore = 0;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id || other.id === player) continue;
      if (isAllied(nation, other.id)) continue;
      const mine = allianceAppeal(world, nation, other);
      if (mine < 2) continue;
      const theirs = allianceAppeal(world, other, nation);
      if (theirs < 2) continue;
      const score = mine + theirs;
      if (score > bestScore || (score === bestScore && best && other.id < best.id)) {
        bestScore = score;
        best = other;
      }
    }
    if (best) {
      formAlliance(world, nation.id, best.id, turn);
      notifyPlayerAllianceEvent(game, nation, best, 'formed');
    }
  }
}

/** Oyuncunun rakibini/komsusunu ilgilendiren ittifak olaylari kisa satir. */
function notifyPlayerAllianceEvent(game, a, b, what) {
  const player = game.turns.playerNation;
  const playerNation = game.world.nations[player];
  if (!playerNation) return;
  // Yalniz oyuncunun DUNYASINA dokunanlar: rakibi ya da komsusu taraf ise.
  const relevant = [a, b].some((n) => playerNation.rivalId === n.id
    || game.world.contacts?.[player]?.[n.id]);
  if (!relevant) return;
  game.turns.addLog(
    what === 'formed'
      ? `${a.name} and ${b.name} have concluded an alliance.`
      : `${a.name} has broken its alliance with ${b.name}.`,
    { kind: 'DIPLOMACY', key: `alliance:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}` },
  );
}

/**
 * Cagri-ile-savas: b'ye savas ilan edildi; b'nin muttefikleri saldirgana
 * KENDI savaslarini acar. declareWar'in butun kapilari gecerli (cullanma
 * tavani dahil) — ittifak kapilari asmaz. Oyuncu muttefik OTOMATIK SOKULMAZ:
 * karar karti duser, ilan oyuncunun fiilidir (manual). Zincir yok: cagriyla
 * acilan savas yeni cagri dogurmaz.
 */
export function callAlliesToWar(game, aggressorId, defenderId) {
  const world = game.world;
  const turn = game.turns.turn ?? 0;
  const defender = world.nations[defenderId];
  if (!defender) return;
  const player = game.turns.playerNation;
  for (const allyId of [...alliesOf(defender)].sort((x, y) => x - y)) {
    const ally = world.nations[allyId];
    if (!ally?.alive || allyId === aggressorId) continue;
    if (atWar(world, allyId, aggressorId)) continue;
    if (allyId === player) {
      const aggressor = world.nations[aggressorId];
      game.turns.addLog(
        `${defender.name} calls us to war against ${aggressor?.name ?? 'the aggressor'}!`,
        { kind: 'WAR', key: `call:${aggressorId}` },
      );
      continue;
    }
    declareWar(game, allyId, aggressorId, { reason: 'alliance', calledBy: defenderId });
    remember(ally, turn, 'honored_call', defenderId);
  }
}

// ---------------------------------------------------------------- RAKIP ---

/**
 * Rakip: bu ulkenin stratejik dusman saydigi devlet. Mana yok, sayac yok —
 * tek alan. Yilda bir, histerezisle: mevcut rakip ancak acik ara daha buyuk
 * bir tehdit cikarsa degisir (etiket sarkaci istemiyoruz; rejim etiketi
 * dersinden). Muttefik asla rakip olmaz.
 */
export function refreshRivals(world, turn) {
  if (turn % RIVAL_EVERY !== 0) return;
  const contacts = world.contacts;
  if (!contacts) return;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const myPower = nationPowerOf(world, nation);
    let best = null;
    let bestScore = 0;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (!contacts[nation.id]?.[other.id]) continue;
      if (isAllied(nation, other.id)) continue;
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
      continue;
    }
    if (best && best.id !== nation.rivalId) {
      const currentScore = (() => {
        if (!contacts[nation.id]?.[current.id]) return 0;
        const wars = relation(world, nation.id, current.id)?.wars ?? 0;
        return Math.log(1 + contacts[nation.id][current.id])
          * (1 + wars * 0.6) * (nationPowerOf(world, current) / Math.max(1, myPower));
      })();
      // Histerezis: yeni aday acik ara (1.5x) ustun degilse eski rakip kalir.
      if (bestScore > currentScore * 1.5) nation.rivalId = best.id;
    }
  }
}

// ------------------------------------------------------------ HAFTALIK ---

/**
 * Haftalik diplomasi YZ'si (turn.js, YZ evresinden sonra):
 * 1. Cagri kuyrugu bosaltilir — muttefikler saldirgana kendi savasini acar.
 * 2. Ittifak taramasi (ceyrekte bir).
 * 3. Rakip tazeleme (yilda bir, histerezisli).
 */
export function runDiplomacyAI(game) {
  const world = game.world;
  const calls = world.pendingWarCalls;
  if (calls?.length) {
    world.pendingWarCalls = [];
    for (const { aggressor, defender } of calls) {
      callAlliesToWar(game, aggressor, defender);
    }
  }
  reviewAlliances(game);
  refreshRivals(world, game.turns.turn ?? 0);
}
