// VASSALLAR — efendinin vassalıyla yapabileceği iki iş (TASARIM.md §10).
//
// Barış masasında VASSALIZE alınınca çift kalıcı barışa bağlanır
// (diplomacy.warBlockers): efendi vassalına savaş ilan edemez. Eskiden bu bir
// çıkmazdı — vassallığı bitirmenin de, vassalı yutmanın da yolu yoktu, düğme
// etkin görünüp ilan sessizce reddediliyordu (Kerem 2026-10-15, Ravoya).
//   BIRAK    anlaşma düşer; vassal bağımsızdır, istersen sonra savaşırsın.
//   İLHAK    HOI4'ün kuklayı yutması: SG bedeli, en az iki yıllık bağ, ikimiz
//            de barıştayken. Yabancı halkı içeri alır (hareketler büyür) ve
//            masadaki ilhakın dörtte biri kadar şöhret yazar.
// YZ bu iki kapıyı kullanmaz: sınır dinamiğine yeni kanal açmadan önce ölçmek
// gerekir (audit:borders). YZ efendi yalnız özerklik 90'ı aşınca savaşı göze
// almak yerine vassalını BIRAKIR.
//
// ÖZERKLİK (0-100, VASSALIZE anlaşmasında; TASARIM §12, DIP-11): vassal ve
// efendi birbirinin savunucusudur (relations.defendersOf), vassalın kendi dış
// siyaseti yoktur; özerklik 50'de ilhakı engeller, 80'de efendi sendelerse
// vassal kopar. Oyuncunun kaldıraçları yeni düğme değil: vassala elçi
// (ilişki), yorucu savaşlardan uzak durmak, bırakmak ya da 50'den önce ilhak.

import { atWar, declareWar, hostile, nationStrength, overlordOf, relation } from './diplomacy.js';
import { endVassalage } from './peace.js';
import { addInfamy, provinceAnnexInfamy } from './infamy.js';
import { disband } from './recruitment.js';
import { TIER, announce, remember } from './chronicle.js';
import { breakAlliance } from './alliances.js';
import {
  deed, guaranteesGiven, hostileWithAnyone, napsOf, noteDiplomacy, regardOf, removePair, removeTreaty,
} from './relations.js';
import { AUTONOMY, DIP_AI } from './dipDefs.js';

export const ANNEX = {
  POWER_BASE: 40,
  POWER_PER_PROVINCE: 4,
  /**
   * Bağ en az bu kadar sürmeli: yoksa masada 65 puanlık VASSALIZE alıp
   * ertesi hafta ilhak etmek, toprak taleplerinin şöhret ve puan bedelini
   * atlayan bir kestirme olurdu.
   */
  MIN_WEEKS: 104,
  /**
   * Masadaki ilhakın şöhret payı: diplomatik yutma fetihten az ürkütür ama
   * bedava değildir. 0.5'te 12 province'lik yabancı vassal tek başına 18
   * yazıyordu (eşik 22): bağı iki yıl sürmüş bir vassalı almak koalisyon
   * çağırmamalı.
   */
  INFAMY_SHARE: 0.25,
};

const turnOf = (game) => game.turns?.turn ?? game.world.turn ?? 0;

function treatyOf(vassal, overlordId) {
  return (vassal?.treaties ?? []).find((t) => t.type === 'VASSALIZE' && t.partner === overlordId) ?? null;
}

function provincesOf(world, nationId) {
  return (world.provinces ?? []).filter((p) => p.owner === nationId && p.econ && p.center);
}

/** Bu efendinin yaşayan vassalları (kimlik sırasıyla). */
export function vassalsOf(world, overlordId, turn = world.turn ?? 0) {
  return world.nations.filter((n) => n.alive && overlordOf(world, n.id, turn) === overlordId);
}

export function annexCost(world, vassal) {
  return ANNEX.POWER_BASE + ANNEX.POWER_PER_PROVINCE * provincesOf(world, vassal.id).length;
}

export function annexBlockers(world, overlord, vassal, turn = world.turn ?? 0) {
  if (!vassal?.alive || overlordOf(world, vassal.id, turn) !== overlord.id) return ['Not our vassal'];
  const out = [];
  const held = turn - (treatyOf(vassal, overlord.id)?.since ?? turn);
  if (held < ANNEX.MIN_WEEKS) out.push(`Bound for ${held} weeks: annexation needs ${ANNEX.MIN_WEEKS}`);
  // Birleşmeyle aynı kural: savaşın ortasında devlet el değiştirmez, yoksa
  // vassalın işgal ettiği ya da kaybettiği toprak ganimetsiz kayar.
  const fighting = (n) => world.nations.some((o) => o.alive && o.id !== n.id && atWar(world, n.id, o.id));
  if (fighting(overlord)) out.push('We are at war: annexation waits for the peace');
  if (fighting(vassal)) out.push('They are at war: annexation waits for the peace');
  const autonomy = treatyOf(vassal, overlord.id)?.autonomy ?? 0;
  if (autonomy >= AUTONOMY.NO_ANNEX) {
    out.push(`They resist annexation: autonomy ${Math.round(autonomy)} ≥ ${AUTONOMY.NO_ANNEX}`);
  }
  const cost = annexCost(world, vassal);
  if ((overlord.power ?? 0) < cost) out.push(`Needs ${cost} political power`);
  return out;
}

/** Vassallığı bitirir; bağımsız devlet kalır. Bedeli yoktur, şöhret de yazmaz. */
export function releaseVassal(game, overlord, vassalId) {
  const world = game.world;
  const vassal = world.nations[vassalId];
  if (!vassal?.alive || !treatyOf(vassal, overlord.id)) return false;
  vassal.treaties = vassal.treaties.filter((t) => !(t.type === 'VASSALIZE' && t.partner === overlord.id));
  const turn = turnOf(game);
  remember(overlord, turn, 'vassal_released', vassal.id);
  remember(vassal, turn, 'vassal_released', overlord.id);
  // Serbest bırakılan eski efendisini iyi anar (savaşsız ayrılık).
  deed(world, vassal.id, overlord.id, 'freed_us', turn);
  noteDiplomacy(game, {
    tier: 2, title: `${vassal.name} leaves ${overlord.name}'s rule`, detail: 'Released without a war.',
    actors: [vassal.id, overlord.id], key: `vassal-free:${vassal.id}`,
  });
  announce(game, overlord, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `vassal-free:${vassal.id}`,
    title: `${vassal.name} is no longer our vassal`,
    detail: 'The tribute stops; they answer to no one now.',
  });
  if (vassal.id === game.turns?.playerNation) {
    announce(game, vassal, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `vassal-free:${vassal.id}`,
      title: `${overlord.name} releases us`, detail: 'We answer to no one now.',
    });
  }
  game.emit?.('diplomacy');
  return true;
}

// ----------------------------------------------------------- ÖZERKLİK ---

/** Vassalın özerklik hedefi ve dökümü (ekranın göstergesi). */
export function autonomyBreakdown(world, vassal, turn = world.turn ?? 0) {
  const treaty = (vassal?.treaties ?? []).find((t) => t.type === 'VASSALIZE' && (t.until ?? Infinity) > turn);
  if (!treaty) return null;
  const overlord = world.nations[treaty.partner];
  const ratio = nationStrength(world, vassal) / Math.max(1, nationStrength(world, overlord));
  const regard = regardOf(world, vassal.id, treaty.partner, turn);
  const exhaustion = overlord?.politics?.exhaustion ?? 0;
  const parts = [
    { label: 'The tribute they pay', value: AUTONOMY.BASE },
    { label: `Their strength (×${ratio.toFixed(2)} of ours)`, value: AUTONOMY.POWER * Math.min(AUTONOMY.POWER_CAP, ratio) },
    { label: 'How they regard us', value: -AUTONOMY.REGARD * regard },
    { label: 'Our war exhaustion', value: AUTONOMY.EXHAUSTION * exhaustion },
  ].filter((p) => Math.abs(p.value) >= 0.05);
  let sum = 0;
  for (const part of parts) sum += part.value;
  const target = Math.max(0, Math.min(100, sum));
  return { value: treaty.autonomy ?? 0, target, parts, overlord: treaty.partner };
}

/** Vassalın kendi dış siyaseti yoktur: ittifak, pakt ve verdiği garanti dağılır. */
function sweepForeignPolicy(world, vassal, turn) {
  for (const t of [...(vassal.treaties ?? [])]) {
    if (t.type === 'ALLIANCE') breakAlliance(world, vassal.id, t.partner, turn);
  }
  for (const t of napsOf(vassal, turn)) removePair(world, vassal.id, t.partner, 'NAP');
  for (const t of guaranteesGiven(vassal)) removeTreaty(vassal, 'GUARANTEE', t.partner);
}

/** Vassal savaşsız ayrılır: anlaşma düşer, 52 haftalık ateşkes. */
function leavePeacefully(game, vassal, overlord, turn) {
  const world = game.world;
  removeTreaty(vassal, 'VASSALIZE', overlord.id);
  const rec = relation(world, vassal.id, overlord.id);
  if (rec && !hostile(world, vassal.id, overlord.id)) rec.truceUntil = Math.max(rec.truceUntil ?? 0, turn + 52);
  remember(overlord, turn, 'vassal_released', vassal.id);
  remember(vassal, turn, 'vassal_released', overlord.id);
  noteDiplomacy(game, {
    tier: 2, title: `${vassal.name} leaves ${overlord.name}'s rule`,
    detail: `Their autonomy reached ${AUTONOMY.BREAK} while ${overlord.name} faltered.`,
    actors: [vassal.id, overlord.id], key: `vassal-free:${vassal.id}`,
  });
  for (const [me, other, title] of [
    [overlord, vassal, `${vassal.name} breaks away from us`],
    [vassal, overlord, `We leave ${overlord.name}'s rule`],
  ]) {
    if (me.id !== game.turns?.playerNation) continue;
    announce(game, me, {
      kind: 'NATION', tier: TIER.MAJOR, key: `vassal-free:${vassal.id}`, title,
      detail: me === overlord
        ? `Their autonomy reached ${AUTONOMY.BREAK} and our exhaustion gave them the chance. The tribute stops.`
        : `${other.name} could no longer hold us.`,
    });
  }
}

/** Oyuncu vassalken bağımsızlık ilanı (özerklik ≥ 60): bedava, çağrısız. */
export function independenceBlockers(world, vassal, turn = world.turn ?? 0) {
  const treaty = (vassal?.treaties ?? []).find((t) => t.type === 'VASSALIZE' && (t.until ?? Infinity) > turn);
  if (!treaty) return ['We are not a vassal'];
  const autonomy = treaty.autonomy ?? 0;
  if (autonomy < AUTONOMY.PLAYER_INDEPENDENCE) {
    return [`Our autonomy is ${Math.round(autonomy)}: independence needs ${AUTONOMY.PLAYER_INDEPENDENCE}`];
  }
  return [];
}

export function declareIndependence(game, vassal, { manual = true } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  if (independenceBlockers(world, vassal, turn).length) return false;
  const overlordId = overlordOf(world, vassal.id, turn);
  const overlord = world.nations[overlordId];
  removeTreaty(vassal, 'VASSALIZE', overlordId);
  if (declareWar(game, vassal.id, overlordId, { reason: 'independence', manual })) return true;
  // Kapı reddettiyse (oyuncunun istemsiz cephe tavanı) savaşsız ayrılır.
  leavePeacefully(game, vassal, overlord, turn);
  return true;
}

/**
 * HAFTALIK VASSAL ADIMI (pacts.runForeignPolicy, kol `vassals`). Kimlik
 * sırasıyla: özerklik yarım puanlık adımla hedefe yaklaşır; eşik kartları;
 * 80'de sendeleyen efendiden kopuş; 90'da barıştaki YZ efendi bırakır;
 * vassalın dış siyaseti süpürülür.
 */
export function runVassals(game) {
  if (!DIP_AI.vassals) return;
  const world = game.world;
  const turn = turnOf(game);
  const player = game.turns?.playerNation ?? -1;
  for (const vassal of world.nations) {
    if (!vassal.alive) continue;
    const treaty = (vassal.treaties ?? []).find((t) => t.type === 'VASSALIZE' && (t.until ?? Infinity) > turn);
    if (!treaty) continue;
    const overlord = world.nations[treaty.partner];
    if (!overlord?.alive) continue;
    sweepForeignPolicy(world, vassal, turn);
    const breakdown = autonomyBreakdown(world, vassal, turn);
    const before = treaty.autonomy ?? 0;
    const after = Math.max(0, Math.min(100,
      before + Math.max(-AUTONOMY.STEP, Math.min(AUTONOMY.STEP, breakdown.target - before))));
    treaty.autonomy = after;
    const involved = vassal.id === player || overlord.id === player;
    if (before < AUTONOMY.WARN && after >= AUTONOMY.WARN && involved) {
      const me = overlord.id === player ? overlord : vassal;
      announce(game, me, {
        kind: 'POLITICS', tier: TIER.IMPORTANT, key: `autonomy:${vassal.id}`,
        title: me === overlord
          ? `${vassal.name} grows restless: autonomy ${AUTONOMY.WARN} — it now resists annexation`
          : `Our autonomy reaches ${AUTONOMY.WARN}: ${overlord.name} can no longer annex us`,
        detail: 'An envoy at their court, a lighter hand and a rested army calm a vassal.',
      });
    }
    if (before < AUTONOMY.BREAK && after >= AUTONOMY.BREAK) {
      noteDiplomacy(game, {
        tier: 1, title: `${vassal.name} strains against ${overlord.name}'s rule`,
        actors: [vassal.id, overlord.id], key: `autonomy:${vassal.id}`,
      });
      if (involved) {
        const me = overlord.id === player ? overlord : vassal;
        announce(game, me, {
          kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `autonomy:${vassal.id}`,
          title: me === overlord
            ? `${vassal.name} will break away if we falter: autonomy ${AUTONOMY.BREAK}`
            : `Our autonomy reaches ${AUTONOMY.BREAK}: we may break away`,
          detail: me === overlord
            ? `If our war exhaustion reaches ${Math.round(AUTONOMY.LEAVE_EXHAUSTION * 100)}% they leave; if we are at war they rise for independence.`
            : `At ${AUTONOMY.PLAYER_INDEPENDENCE}+ we may declare independence from ${overlord.name}'s dossier.`,
        });
      }
    }
    if (vassal.id === player) continue;
    // YZ vassal 80'de: efendi tükendiyse savaşsız, savaştaysa silahla kopar.
    if (after >= AUTONOMY.BREAK) {
      if ((overlord.politics?.exhaustion ?? 0) >= AUTONOMY.LEAVE_EXHAUSTION) {
        leavePeacefully(game, vassal, overlord, turn);
        continue;
      }
      if (hostileWithAnyone(world, overlord.id) && !hostile(world, vassal.id, overlord.id)) {
        removeTreaty(vassal, 'VASSALIZE', overlord.id);
        if (!declareWar(game, vassal.id, overlord.id, { reason: 'independence' })) {
          leavePeacefully(game, vassal, overlord, turn);
        } else {
          noteDiplomacy(game, {
            tier: 1, title: `${vassal.name} rises for independence from ${overlord.name}`,
            actors: [vassal.id, overlord.id], key: `vassal-free:${vassal.id}`,
          });
        }
        continue;
      }
    }
    // 90'da barıştaki YZ efendi savaşı göze almak yerine bırakır (YZ hiç ilhak etmez).
    if (after >= AUTONOMY.AI_RELEASE && overlord.id !== player && !hostileWithAnyone(world, overlord.id)) {
      releaseVassal(game, overlord, vassal.id);
    }
  }
}

/** Vassalı yutar: bütün province'leri devredilir, ordusu terhis olur. */
export function annexVassal(game, overlord, vassalId) {
  const world = game.world;
  const vassal = world.nations[vassalId];
  const turn = turnOf(game);
  if (annexBlockers(world, overlord, vassal, turn).length) return false;
  const provinces = provincesOf(world, vassal.id);
  // Şöhret devirden ÖNCE ölçülür: provinceAnnexInfamy halkı ve yurdu
  // yeni sahibin kabul ettikleriyle karşılaştırır.
  let infamy = 0;
  for (const province of provinces) infamy += provinceAnnexInfamy(world, province, overlord);
  overlord.power -= annexCost(world, vassal);
  // Vassalın kendi vassalları serbest kalır: zincir ilhakla devralınmaz.
  endVassalage(world, vassal.id);
  vassal.treaties = vassal.treaties.filter((t) => !(t.type === 'VASSALIZE' && t.partner === overlord.id));
  for (const province of provinces) game.turns.claimAtPeace(province.center, overlord.id);
  // Askerleri yeni devletin nüfusudur (birleşmedeki gibi).
  for (const unit of [...world.units]) {
    if (unit.nationId === vassal.id) disband(game, unit);
  }
  addInfamy(overlord, infamy * ANNEX.INFAMY_SHARE);
  remember(overlord, turn, 'took_land_from', vassal.id);
  announce(game, overlord, {
    kind: 'NATION', tier: TIER.MAJOR, key: `vassal-annex:${vassal.id}`,
    title: `${vassal.name} is annexed`,
    detail: `${provinces.length} provinces join us; their peoples are now ours to keep.`,
  });
  game.renderer?.invalidateCache?.();
  game.emit?.('diplomacy');
  return true;
}
