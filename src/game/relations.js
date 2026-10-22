// İLİŞKİ DEFTERİ, ANLAŞMA OKUMALARI VE OYUNCUNUN MASASI (TASARIM §12).
//
// Bu dosya bir YAPRAKTIR: yalnız dipDefs.js'i ve (tarih satırı için) kendisi
// de yaprak olan chronicle.js'i import eder. diplomacy.js,
// alliances.js, politics.js, econ/trade.js ve vassals.js buradan okur; tersi
// olsaydı (bu dosya alliances'ı import etseydi) diplomacy → relations →
// alliances → diplomacy döngüsü kurulurdu. Anlaşmalar bu yüzden doğrudan
// `nation.treaties`ten okunur (ALLIANCE, VASSALIZE, GUARANTEE, NAP, CB).
//
// DEFTER: `nation.regard[subjectId] = [[kind, d, t], ...]` — gözlemcinin bir
// başka ulus hakkında hatırladıkları, çift başına tür başına tek kayıt. Değer
// TEMBEL söner: haftalık döngü yoktur, okuma anında d × 0.99^(T − t). Kayıt
// yalnız (d, t) taşıdığı için yüklenen oyun aynı değeri okur.

import {
  AUTONOMY, DEEDS, DESK, DIP_AI, ENVOY, GUARANTEE, REGARD,
} from './dipDefs.js';
// chronicle.js yalnız calendar.js'i import eder: yaprağın yaprağı, döngü kurmaz.
import { HISTORY_KIND, recordHistory } from './chronicle.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ------------------------------------------------------- DÜNYA TARİHİ ---

/**
 * Diplomasinin tarih satırı (Faz 3 kaydedicisi). Taban kademe + oyuncu
 * taraflardan biriyse 1 (en çok 2): diplomasi asla 3 (çağ manşeti) yazmaz,
 * o dünya savaşlarınındır. `at` verilmezse ikinci tarafın başkenti.
 */
export function noteDiplomacy(game, { tier = 1, title, detail = '', actors = [], at, key = null }) {
  const world = game?.world;
  if (!world || !title) return null;
  const player = game.turns?.playerNation ?? -1;
  const level = Math.min(2, tier + (actors.includes(player) ? 1 : 0));
  let where = at;
  if (where === undefined) {
    const capital = world.nations[actors[1]]?.capital ?? null;
    where = capital ? { q: capital.q, r: capital.r } : null;
  }
  return recordHistory(world, {
    turn: world.turn ?? game.turns?.turn ?? 0,
    kind: HISTORY_KIND.DIPLOMACY, tier: level, title, detail, actors, at: where, key,
  });
}

// ---------------------------------------------------------------- DEFTER ---

/** Tek kaydın T haftasındaki katkısı. */
export function contribution(entry, T) {
  return entry[1] * REGARD.DECAY ** Math.max(0, T - entry[2]);
}

function ledgerOf(world, obsId, subjId) {
  return world.nations[obsId]?.regard?.[subjId] ?? null;
}

/** `obsId`nin `subjId` hakkındaki görüşü (−100..100). Kayıt yoksa 0: bugünkü dünya. */
export function regardOf(world, obsId, subjId, T = world.turn ?? 0) {
  const list = ledgerOf(world, obsId, subjId);
  if (!list?.length) return 0;
  let sum = 0;
  for (const entry of list) sum += contribution(entry, T);
  return clamp(sum, REGARD.MIN, REGARD.MAX);
}

/**
 * Defterin tek yazıcısı. Aynı türden yeni olay eskisinin sönmüş değerine
 * eklenir ve tarihi yenilenir (kayıt sayısı çift başına tür sayısıyla
 * sınırlı kalır). Sönüp eşiğin altına inen kayıtlar burada budanır.
 */
export function deed(world, obsId, subjId, kind, T = world.turn ?? 0, scale = 1) {
  if (obsId === subjId || obsId == null || subjId == null || obsId < 0 || subjId < 0) return;
  const observer = world.nations[obsId];
  const subject = world.nations[subjId];
  if (!observer?.alive || !subject?.alive) return;
  const base = DEEDS[kind]?.d;
  if (!Number.isFinite(base)) return;
  const delta = base * scale;
  const ledger = (observer.regard ??= {});
  const list = (ledger[subjId] ??= []);
  const entry = list.find((e) => e[0] === kind);
  if (entry) {
    entry[1] = contribution(entry, T) + delta;
    entry[2] = T;
  } else {
    list.push([kind, delta, T]);
  }
  pruneList(ledger, subjId, T);
}

function pruneList(ledger, subjId, T) {
  const list = ledger[subjId];
  if (!list) return;
  const kept = list.filter((e) => Math.abs(contribution(e, T)) >= REGARD.PRUNE);
  if (kept.length) ledger[subjId] = kept;
  else delete ledger[subjId];
}

/** Bu türden son kaydın haftası (yoksa null): bekleme süreleri ve "sebep" okur. */
export function lastDeedTurn(world, obsId, subjId, kind) {
  const entry = ledgerOf(world, obsId, subjId)?.find((e) => e[0] === kind);
  return entry ? entry[2] : null;
}

/** |değer| FADE'in altına kaç haftada iner (gösterim: "fades by 1911"). */
export function fadesIn(value) {
  const abs = Math.abs(value);
  if (abs < REGARD.FADE) return 0;
  return Math.ceil(Math.log(REGARD.FADE / abs) / Math.log(REGARD.DECAY));
}

/**
 * Defterin dökümü: toplam ve parçalar (büyükten küçüğe). Parçaların toplamı
 * kıstırılmamış değere eşittir; audit:diplomacy cümle testi bunu sınar.
 */
export function relationsBreakdown(world, obsId, subjId, T = world.turn ?? 0) {
  const list = ledgerOf(world, obsId, subjId) ?? [];
  const parts = list
    .map((entry) => {
      const value = contribution(entry, T);
      return { kind: entry[0], label: DEEDS[entry[0]]?.label ?? entry[0], value, fadesIn: fadesIn(value) };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || (a.kind < b.kind ? -1 : 1));
  return { value: regardOf(world, obsId, subjId, T), parts };
}

// ------------------------------------------------------ ANLAŞMA OKUMALARI ---

const treaties = (nation) => nation?.treaties ?? [];
const live = (t, turn) => (t.until ?? Infinity) > turn;

/** Savaş ya da ültimatom (diplomacy.hostile'ın yaprak kopyası). */
export function hostilePair(world, a, b) {
  if (a === b) return false;
  const state = world.relations?.[a]?.[b]?.state;
  return state === 'war' || state === 'crisis';
}

/** Bu ulusla savaşta ya da ültimatomda olan biri var mı? */
export function hostileWithAnyone(world, id) {
  for (const other of world.nations) {
    if (other.alive && other.id !== id && hostilePair(world, id, other.id)) return true;
  }
  return false;
}

export function alliedPair(nation, partnerId) {
  return treaties(nation).some((t) => t.type === 'ALLIANCE' && t.partner === partnerId);
}

/** Vassalın VASSALIZE anlaşması (vassalın listesinde durur). */
export function vassalTreatyOf(nation, turn) {
  return treaties(nation).find((t) => t.type === 'VASSALIZE' && live(t, turn)) ?? null;
}

/** Efendinin kimliği; yoksa −1 (diplomacy.overlordOf ile aynı kural). */
export function overlordIdOf(world, vassalId, turn = world.turn ?? 0) {
  return vassalTreatyOf(world.nations[vassalId], turn)?.partner ?? -1;
}

/** Vassal ↔ efendi bağı var mı (iki yönden biri)? */
export function vassalBond(world, a, b, turn = world.turn ?? 0) {
  return overlordIdOf(world, a, turn) === b || overlordIdOf(world, b, turn) === a;
}

/** Vassalın özerkliği (0-100); vassal değilse null. */
export function autonomyOf(world, vassalId, turn = world.turn ?? 0) {
  const treaty = vassalTreatyOf(world.nations[vassalId], turn);
  return treaty ? (treaty.autonomy ?? 0) : null;
}

/** Yürürlükteki saldırmazlık paktı (iki listede de durur). */
export function napOf(nation, otherId, turn) {
  return treaties(nation).find((t) => t.type === 'NAP' && t.partner === otherId && live(t, turn)) ?? null;
}

export function napBetween(world, a, b, turn = world.turn ?? 0) {
  return napOf(world.nations[a], b, turn);
}

export function napsOf(nation, turn) {
  return treaties(nation).filter((t) => t.type === 'NAP' && live(t, turn));
}

/** `guarantor` ulusu `protegeId`yi garanti ediyor mu? Garanti garantörün listesinde durur. */
export function guaranteeOf(nation, protegeId) {
  return treaties(nation).find((t) => t.type === 'GUARANTEE' && t.partner === protegeId) ?? null;
}

/** Bu ulusun verdiği garantiler (anlaşma sırasıyla). */
export function guaranteesGiven(nation) {
  return treaties(nation).filter((t) => t.type === 'GUARANTEE');
}

/** `protegeId`yi garanti eden yaşayan uluslar (kimlik sırası). */
export function guarantorsOf(world, protegeId) {
  const out = [];
  for (const nation of world.nations) {
    if (nation.alive && nation.id !== protegeId && guaranteeOf(nation, protegeId)) out.push(nation.id);
  }
  return out;
}

/** Bir ulusun listesinden tek anlaşma türünü (bir ortakla) siler. */
export function removeTreaty(nation, type, partnerId) {
  if (!nation?.treaties?.length) return false;
  const before = nation.treaties.length;
  nation.treaties = nation.treaties.filter((t) => !(t.type === type && t.partner === partnerId));
  return nation.treaties.length !== before;
}

/** Simetrik anlaşmayı (ALLIANCE, NAP) iki listeden birden siler. */
export function removePair(world, a, b, type) {
  const one = removeTreaty(world.nations[a], type, b);
  const two = removeTreaty(world.nations[b], type, a);
  return one || two;
}

/** Garanti bağı iki yönden biri. */
export function guaranteeBond(world, a, b) {
  return Boolean(guaranteeOf(world.nations[a], b) || guaranteeOf(world.nations[b], a));
}

/** `nation`ın `targetId` üzerindeki savaş gerekçesi (reddedilen talepten). */
export function cbOf(nation, targetId, turn) {
  return treaties(nation).find((t) => t.type === 'CB' && t.partner === targetId
    && (t.expires ?? Infinity) > turn) ?? null;
}

/**
 * SALDIRIYA UĞRAYAN X'İN ARKASINDA KİM DURUR — tek liste. YZ'nin savaş
 * oranı, çağrının kime gideceği, talebin hükmü ve Savaş bilgi kartı bunu
 * okur: dördü asla ayrışamaz. Kimlik sırası, tek kayıt; bir ulus iki
 * sebeple katılıyorsa öncelik müttefik > garantör > efendi > vassal.
 */
const BOND_RANK = { ally: 0, guarantor: 1, overlord: 2, vassal: 3 };

export function defendersOf(world, xId, reason = null, turn = world.turn ?? 0) {
  const x = world.nations[xId];
  if (!x) return [];
  const bonds = new Map();
  const put = (id, bond) => {
    if (id === xId || id == null || id < 0) return;
    if (!world.nations[id]?.alive) return;
    const current = bonds.get(id);
    if (current == null || BOND_RANK[bond] < BOND_RANK[current]) bonds.set(id, bond);
  };
  for (const t of treaties(x)) if (t.type === 'ALLIANCE') put(t.partner, 'ally');
  // Garanti bağımsızlığı korur, şöhretin bedelini (koalisyon) ya da bir
  // vassalın kopuşunu değil.
  if (reason !== 'coalition' && reason !== 'independence') {
    for (const id of guarantorsOf(world, xId)) put(id, 'guarantor');
  }
  if (DIP_AI.vassals && reason !== 'independence') {
    put(overlordIdOf(world, xId, turn), 'overlord');
    for (const other of world.nations) {
      if (!other.alive) continue;
      const treaty = vassalTreatyOf(other, turn);
      if (treaty?.partner === xId && (treaty.autonomy ?? 0) < AUTONOMY.BREAK) put(other.id, 'vassal');
    }
  }
  return [...bonds].sort((p, q) => p[0] - q[0]).map(([id, bond]) => ({ id, bond }));
}

/**
 * Sözünden dönenin TANIKLARI: kurban dışında onunla ittifak, pakt ya da
 * garanti (iki yönden biri) bağı olan herkes, kimlik sırasıyla. Söz bozmak
 * yalnız kurbanla değil bütün ortaklarla ilişkiyi aşındırır.
 */
export function witnessesOf(world, breakerId, victimId) {
  const breaker = world.nations[breakerId];
  const ids = new Set();
  for (const t of treaties(breaker)) {
    if (t.type === 'ALLIANCE' || t.type === 'NAP' || t.type === 'GUARANTEE') ids.add(t.partner);
  }
  for (const id of guarantorsOf(world, breakerId)) ids.add(id);
  ids.delete(victimId);
  ids.delete(breakerId);
  return [...ids].filter((id) => world.nations[id]?.alive).sort((a, b) => a - b);
}

/** Tanıkların defterine "Broke faith with others" (terk ×1, pakt ihlali ×2). */
export function markFaithless(world, breakerId, victimId, scale, T = world.turn ?? 0) {
  for (const id of witnessesOf(world, breakerId, victimId)) deed(world, id, breakerId, 'faithless', T, scale);
}

// --------------------------------------------------------- SİYASİ FATURA ---

/** Elçi ve verilen garantilerin haftalık SG faturası (politics.runPolitics düşer). */
export function diplomaticUpkeep(nation) {
  if (!nation) return 0;
  return (nation.envoys?.length ?? 0) * ENVOY.UPKEEP + guaranteesGiven(nation).length * GUARANTEE.UPKEEP;
}

// ------------------------------------------------------------------ ELÇİ ---

/** Elçi neden gönderilemez (boş = gönderilebilir). */
export function envoyBlockers(world, nation, targetId) {
  const target = world.nations[targetId];
  if (!nation?.alive || !target?.alive || nation.id === targetId) return ['No such nation'];
  const out = [];
  if (hostilePair(world, nation.id, targetId)) out.push('We are at war or under ultimatum');
  const envoys = nation.envoys ?? [];
  if (envoys.includes(targetId)) out.push('Our envoy is already at their court');
  else if (envoys.length >= ENVOY.SLOTS) out.push(`Both envoy posts are filled: recall one`);
  if ((nation.power ?? 0) < ENVOY.UPKEEP) out.push(`Needs ${ENVOY.UPKEEP} political power a week`);
  return out;
}

export function postEnvoy(world, nation, targetId) {
  if (envoyBlockers(world, nation, targetId).length) return false;
  (nation.envoys ??= []).push(targetId);
  return true;
}

export function recallEnvoy(nation, targetId) {
  const envoys = nation?.envoys ?? [];
  const index = envoys.indexOf(targetId);
  if (index < 0) return false;
  envoys.splice(index, 1);
  return true;
}

/**
 * Elçinin haftalık işi: ev sahibinin defterinde elçi kaydı +0.8 büyür, +40'ta
 * durur. Elçi geri çağrılınca kayıt yerinde kalır ve olağan hızla söner
 * (ilişkiler kalır). Ölü ya da düşman ev sahibindeki elçi döner; dönenler
 * `[sender, host]` olarak bildirilir.
 */
export function tendEnvoys(world, T) {
  const recalled = [];
  for (const nation of world.nations) {
    if (!nation.envoys?.length) continue;
    if (!nation.alive) { nation.envoys = []; continue; }
    for (const hostId of [...nation.envoys]) {
      const host = world.nations[hostId];
      if (!host?.alive || hostilePair(world, nation.id, hostId)) {
        recallEnvoy(nation, hostId);
        recalled.push([nation.id, hostId]);
        continue;
      }
      const ledger = (host.regard ??= {});
      const list = (ledger[nation.id] ??= []);
      let entry = list.find((e) => e[0] === 'envoy');
      if (!entry) {
        entry = ['envoy', 0, T];
        list.push(entry);
      }
      entry[1] = Math.min(ENVOY.CAP, contribution(entry, T) + ENVOY.RATE);
      entry[2] = T;
    }
  }
  return recalled;
}

/** Ev sahibinin defterindeki elçi kaydının bugünkü değeri. */
export function envoyStanding(world, hostId, senderId, T = world.turn ?? 0) {
  const entry = ledgerOf(world, hostId, senderId)?.find((e) => e[0] === 'envoy');
  return entry ? contribution(entry, T) : 0;
}

// ---------------------------------------------------------- GEÇİŞ İZNİ ---

/**
 * Aynı cephedekilere askerî geçiş (nationBirth'ün kurtarıcı geçişiyle aynı
 * kayıt). Burada durur ki alliances.js nationBirth'ü import etmesin.
 */
export function grantPassage(world, granterId, granteeId, enemyId) {
  if (!DIP_AI.passage) return false;
  const granter = world.nations[granterId];
  if (!granter?.alive || granterId === granteeId) return false;
  granter.passage ??= {};
  const current = granter.passage[granteeId];
  if (current && current.until == null) return false;
  granter.passage[granteeId] = { from: enemyId, until: null };
  return true;
}

// ------------------------------------------------- OYUNCUNUN MASASI ---

/**
 * Oyuncuyu ilgilendiren bekleyen kayıtlar (çağrı, teklif, talep). YZ-YZ
 * kararları aynı çağrıda çözülür; burada yalnız cevabı oyuncudan gelecek
 * olanlar durur. Kayda girer (save.js `diplo`).
 */
export function ensureDiplo(world) {
  world.diplo ??= { nextId: 1, pending: [], cooldown: {}, lastProposal: -9999 };
  world.diplo.pending ??= [];
  world.diplo.cooldown ??= {};
  world.diplo.nextId ??= 1;
  world.diplo.lastProposal ??= -9999;
  return world.diplo;
}

export function pushPending(world, record) {
  const diplo = ensureDiplo(world);
  const entry = { id: diplo.nextId++, ...record };
  diplo.pending.push(entry);
  return entry;
}

export function pendingFor(world, nationId) {
  return (world.diplo?.pending ?? []).filter((rec) => rec.to === nationId);
}

export function findPending(world, id) {
  return (world.diplo?.pending ?? []).find((rec) => rec.id === id) ?? null;
}

export function dropPending(world, id) {
  const diplo = world.diplo;
  if (!diplo?.pending) return null;
  const index = diplo.pending.findIndex((rec) => rec.id === id);
  if (index < 0) return null;
  return diplo.pending.splice(index, 1)[0];
}

/**
 * YZ'nin oyuncuya teklif kapısı (yalnız durdurmayan teklifler; çağrı ve talep
 * sonuçtur, kapıya takılmaz). Kapı oyuncunun GÖRDÜĞÜNÜ sınırlar, YZ'nin
 * yapabileceğini değil: kapalıysa YZ oyuncu aday değilmiş gibi devam eder.
 */
export function proposalGate(world, playerId, fromId, treaty, turn = world.turn ?? 0) {
  const player = world.nations[playerId];
  if (!player?.alive || !world.nations[fromId]?.alive) return false;
  if (hostilePair(world, playerId, fromId)) return false;
  const diplo = ensureDiplo(world);
  const open = diplo.pending.filter((rec) => rec.kind === 'proposal' && rec.to === playerId);
  if (open.length >= DESK.MAX_OPEN) return false;
  if (turn - diplo.lastProposal < DESK.GAP) return false;
  if (turn - (diplo.cooldown[`${treaty}:${fromId}`] ?? -9999) < DESK.SENDER_COOLDOWN) return false;
  if (open.some((rec) => rec.treaty === treaty && rec.from === fromId)) return false;
  // Geri çevrilen gönderen, kırgınlığı sönmeden yeniden sormaz ("Rebuffed our
  // proposal" −10, |değer| < FADE: 69 hafta). Yalnız yıllık bekleme yetmedi:
  // census'ta (160×96, 3 tohum × 20 yıl, pasif oyuncu) tek bir komşu 20
  // yılda 18 pakt teklifi yolladı. Oyuncu nedenini ilişki dökümünde görür.
  const snub = ledgerOf(world, fromId, playerId)?.find((e) => e[0] === 'declined_offer');
  if (snub && Math.abs(contribution(snub, turn)) >= REGARD.FADE) return false;
  return true;
}

/** Teklifi masaya koyar; kapının sayaçları burada ilerler. */
export function pushProposal(world, record, turn = world.turn ?? 0) {
  const diplo = ensureDiplo(world);
  diplo.lastProposal = turn;
  diplo.cooldown[`${record.treaty}:${record.from}`] = turn;
  return pushPending(world, {
    kind: 'proposal', ...record, turn, expires: turn + DESK.ANSWER,
  });
}

/** Kaydın tam kopyası (save.js ve kaydet-yükle denetimi). */
export function copyDiplo(diplo) {
  if (!diplo) return null;
  return {
    nextId: diplo.nextId ?? 1,
    pending: (diplo.pending ?? []).map((rec) => ({ ...rec })),
    cooldown: { ...(diplo.cooldown ?? {}) },
    lastProposal: diplo.lastProposal ?? -9999,
  };
}

/** Defterin tam kopyası: nesne → dizi → 3'lü. */
export function copyRegard(regard) {
  if (!regard || typeof regard !== 'object') return {};
  const out = {};
  for (const key of Object.keys(regard)) {
    const list = regard[key];
    if (Array.isArray(list) && list.length) out[key] = list.map((entry) => [...entry]);
  }
  return out;
}
