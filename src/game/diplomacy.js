// Diplomasi: ülkeler arası savaş/barış durumu.
// Herkesin doğuştan savaşta olması haritayı erken mop-up'a çeviriyordu;
// barış varsayılan, savaş bir karar.

import { DIRS } from '../core/hex.js';
import { armyPower } from './units.js';
import { captureConstructionAt } from './construction.js';
import { controllerOf } from './control.js';
import { TIER, announce, remember } from './chronicle.js';

export const WAR = 'war';
export const PEACE = 'peace';
/**
 * ÜLTİMATOM: savaş ilan edilmiş ama ordular henüz sınırı geçemez. Vic2'nin
 * "ilan → seferberlik → ilk çatışma" gövdesi. İlan anında savaşa girmek
 * ölçüldü (bully senaryosu, 3 tohum): 2.5-3.4× üstün komşu ilk haftadan
 * saldırıyor, kurbanın ordusu savaş boyunca HİÇ büyümüyordu (3→3 alay). İki
 * tarafa da hazırlık süresi verilir; seferberlik tam bu pencereye sığar
 * (bkz. mobilization.js RAISE_WEEKS).
 */
export const CRISIS = 'crisis';
export const ULTIMATUM_WEEKS = 8;

/**
 * Barış görüşmesi için savaşın en az sürmesi gereken tur sayısı.
 *
 * 8'den 16'ya. Open Beta 3'te ölçüldü: savaşların ORTANCASI 12 hafta, %69'u
 * 16 haftanın altındaydı — oyuncunun 25 savaşının ortalaması 11,4 hafta ve
 * 4 muharebeydi. Bunlar savaş değil baskındı; masa açılana kadar cephe diye
 * bir şey kurulmuyordu. Dört ay, seferberliğin ve ilk kuşatmanın sığdığı
 * asgari gövdedir.
 */
export const MIN_WAR_TURNS = 16;

/**
 * Barıştan sonra yeniden savaş ilan edilemeyen tur sayısı. Ateşkes olmadan
 * barış yapıp ertesi tur yeniden saldırmak serbestti; tempoyu bu tutuyor.
 */
// 40 -> 52: ayni ciftin bir yil icinde yeniden savasmasi kartopunu
// besliyordu (audit:borders).
export const TRUCE_TURNS = 52;

/**
 * Ateşkes, AYNI kurbana tekrarlanan her savaşla uzar.
 *
 * NEDEN: Open Beta 3'te salam taktiği baskın stratejiydi ve ölçüldü — oyuncu
 * aynı komşuya her yıl saldırıp 1-3 küme aldı (Turesh 1855-56-57-58, Kazyldor
 * 1859-60-61-62-64-65), YZ de aynısını yaptı (bir çift 64 yılda 14 kez
 * savaştı). Sabit 40 haftalık ateşkes bir yıllık döngüye tam oturuyordu.
 *
 * Artık ilk savaş 40 hafta, ikincisi 72, üçüncüsü 104... dört yılda tavanlanır.
 * İlk savaşın temposu değişmez; tekrarlayan yağma pahalılaşır.
 */
export const TRUCE_REPEAT_STEP = 0.8;
export const TRUCE_MAX_TURNS = 208;

export function truceLengthFor(repeats) {
  const previous = Math.max(0, (repeats ?? 1) - 1);
  return Math.min(
    TRUCE_MAX_TURNS,
    Math.round(TRUCE_TURNS * (1 + previous * TRUCE_REPEAT_STEP)),
  );
}

/**
 * Simetrik ilişki tablosu: world.relations[a][b] ile [b][a] *aynı* nesnedir.
 * Kopyalarsak bir yönü güncelleyip diğerini unutmak mümkün olur.
 */
export function initRelations(world) {
  const n = world.nations.length;
  world.relations = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = { state: PEACE, since: 1 };
      world.relations[a][b] = rec;
      world.relations[b][a] = rec;
    }
  }
}

export function relation(world, a, b) {
  if (a === b) return null;
  return world.relations?.[a]?.[b] ?? null;
}

export function atWar(world, a, b) {
  return relation(world, a, b)?.state === WAR;
}

export function atPeace(world, a, b) {
  return a !== b && !atWar(world, a, b);
}

/** İlan edilmiş ama henüz başlamamış savaş. */
export function inCrisis(world, a, b) {
  return relation(world, a, b)?.state === CRISIS;
}

/** Savaş YA DA ültimatom: ordu hazırlığı isteyen her ilişki. */
export function hostile(world, a, b) {
  const state = relation(world, a, b)?.state;
  return state === WAR || state === CRISIS;
}

/** Ültimatomun bitmesine kaç hafta var; ültimatom yoksa 0. */
export function crisisLeft(world, a, b, turn) {
  const rec = relation(world, a, b);
  if (!rec || rec.state !== CRISIS) return 0;
  return Math.max(0, (rec.warAt ?? 0) - turn);
}

/** Bu ulusla savaşta ya da ültimatomda olan canlı ülkeler. */
export function hostileNations(world, nationId) {
  return world.nations.filter(
    (other) => other.alive && other.id !== nationId && hostile(world, nationId, other.id),
  );
}

function setState(world, a, b, state, turn, extra = {}) {
  const rec = { state, since: turn, ...extra };
  world.relations[a][b] = rec;
  world.relations[b][a] = rec;
}

/**
 * Bu savaşta iki tarafın kaybettiği asker. Kayıt ilişki kaydında durur: savaş
 * ilanı yeni bir kayıt kurduğu için sayaç her savaşta kendiliğinden sıfırlanır
 * ve barıştan sonra geçmiş savaşın kanı yeni savaşa taşınmaz.
 */
export function recordWarCasualties(world, a, b, aLoss, bLoss) {
  const rec = relation(world, a, b);
  if (!rec || rec.state !== WAR) return;
  const losses = rec.losses ?? (rec.losses = {});
  losses[a] = (losses[a] ?? 0) + Math.max(0, aLoss);
  losses[b] = (losses[b] ?? 0) + Math.max(0, bLoss);
}

/** Savaşın kayıp defteri; savaş yoksa boş. */
export function warLossesOf(world, a, b) {
  return relation(world, a, b)?.losses ?? {};
}

/**
 * `a`nın bu savaştaki en iyi skoru ne zamandır kımıldamıyor?
 *
 * Savaşa bir gövde vermek için gerekli: kazanan taraf cephe hâlâ ilerlerken
 * masaya oturmamalı. Dönen sayı, skorun son anlamlı iyileşmesinden bu yana
 * geçen hafta sayısıdır.
 */
export function recordWarProgress(world, a, b, score) {
  const rec = relation(world, a, b);
  if (!rec || rec.state !== WAR) return 0;
  const turn = world.turn ?? 0;
  const peaks = rec.peaks ?? (rec.peaks = {});
  const entry = peaks[a] ?? (peaks[a] = { best: score, turn });
  // Gürültü eşiği: bir-iki puanlık salınım "ilerleme" sayılmaz.
  if (score > entry.best + 2) {
    entry.best = score;
    entry.turn = turn;
  }
  return Math.max(0, turn - entry.turn);
}

/** Bu ulusa şu an kaç ayrı ülke saldırıyor? Çullanma sınırının ölçütü. */
export function attackerCount(world, nationId) {
  let count = 0;
  for (const other of world.nations) {
    // Ültimatom da sayılır: ilan edilmiş cephe, açılmış cephedir. Sayılmasa
    // çullanma tavanı sekiz haftalık pencerede delinirdi.
    if (other.alive && other.id !== nationId && hostile(world, other.id, nationId)) count++;
  }
  return count;
}

/** Ateşkes sürüyorsa savaş ilan edilemez. */
export function truceLeft(world, a, b, turn) {
  const rec = relation(world, a, b);
  if (!rec || rec.state === WAR) return 0;
  return Math.max(0, (rec.truceUntil ?? 0) - turn);
}

/**
 * Bir ulusa aynı anda binebilecek azami saldırgan — MERKEZÎ TAVAN.
 *
 * NEDEN BURADA: tavan önce yalnız `ai.js`'in hedef seçme döngüsündeydi ve
 * `checkCoalitions` o kapıdan geçmiyordu. Ölçüldü (tohum OB3-1836, tur 755):
 * oyuncu üç cephedeyken koalisyon dördüncüyü ekledi. Kural, kuralı çiğneyecek
 * her yolun ORTAK geçtiği yerde durmalı — o yer burasıdır.
 */
export const MAX_ATTACKERS_ON_TARGET = 3;

/**
 * Oyuncunun İSTEMSİZ taşıyabileceği azami cephe. Kendi ilan ettiği savaşlar
 * bu tavana takılmaz: oyuncu kendi mezarını kazabilir, ama dünya oyuncuyu
 * haberi olmadan dört cepheye sokamaz.
 */
export const MAX_PLAYER_INVOLUNTARY_FRONTS = 2;

/**
 * Savaş ilanı. `manual: true` yalnız OYUNCUNUN kendi kararı için geçilir;
 * YZ ve koalisyon bu bayrağı asla kullanmaz.
 *
 * Buradaki üç kapı nihai kapılardır — `ai.js`'teki kontroller ucuz erken
 * çıkışlardır, güvenlik onlara emanet değildir.
 */
export function declareWar(game, a, b, options = {}) {
  const world = game.world;
  const manual = options.manual === true;
  if (a === b || hostile(world, a, b)) return false;
  if (truceLeft(world, a, b, game.turns.turn) > 0) return false;
  // Ittifak/vasallik ciftler arasinda ilan YOK — once bozmak gerekir.
  // (VASSALIZE kartinin "kalici baris" vaadi bu satira kadar SAHTEYDI:
  // hicbir sey baris tarafini uygulamiyordu, yalniz haraci.)
  const boundTo = (n, pid) => (n?.treaties ?? []).some((t) =>
    (t.type === 'ALLIANCE' || t.type === 'VASSALIZE') && t.partner === pid
    && (t.until ?? Infinity) > game.turns.turn);
  if (boundTo(world.nations[a], b) || boundTo(world.nations[b], a)) return false;

  const player = game.turns?.playerNation;
  // 1) Oyuncu ADINA otomatik savaş ilan edilemez. Koalisyon oyuncuya KARŞI
  //    kurulabilir; oyuncuyu üye yapamaz.
  //    TEK ISTISNA: oyuncu diplomasiyi KENDI ELIYLE devrettiyse (AUTO ON,
  //    bkz. delegation.js) disisleri bakanligi onun adina ilan verebilir.
  //    Bayrak ayri tutuldu — `manual` "oyuncu dugmeye basti" demektir ve iki
  //    yolun karistirilmasi izni sessizce genisletirdi.
  if (a === player && !manual && options.delegated !== true) return false;
  // 2) Çullanma tavanı: hiçbir ulusun üstüne üçten fazla saldırgan binmez.
  if (attackerCount(world, b) >= MAX_ATTACKERS_ON_TARGET) return false;
  // 3) Oyuncuya istemsiz açılan cephe sayısı ayrıca dardır.
  if (b === player && !manual
    && attackerCount(world, player) >= MAX_PLAYER_INVOLUNTARY_FRONTS) return false;

  // Kaçıncı savaş: ateşkes uzunluğu buna bakar, o yüzden barış kaydından
  // savaş kaydına taşınmalı (setState yeni bir nesne kurar).
  const wars = (relation(world, a, b)?.wars ?? 0) + 1;
  // İlan savaşı BAŞLATMAZ, ültimatomu başlatır: ordular ULTIMATUM_WEEKS
  // boyunca sınırı geçemez, iki taraf da seferber olabilir. Çağrıyla açılan
  // savaş (müttefik) saldırganla aynı takvime biner ki cephe birlikte açılsın.
  const warAt = options.reason === 'alliance' && Number.isFinite(options.warAt)
    ? options.warAt
    : game.turns.turn + ULTIMATUM_WEEKS;
  setState(world, a, b, CRISIS, game.turns.turn, {
    wars, warAt, reason: options.reason ?? null, aggressor: a,
  });
  // SAVAS HEDEFI. Bir savasin NEDEN acildigi hicbir yerde yazmiyordu; masada
  // "ne istiyordum?" sorusunun cevabi yoktu. Hedef kume ilan aninda saklanir
  // ve baris masasinda birinci sirada gosterilir (bkz. peace.js warGoalOf).
  // Alan burada yaziliyor cunku peace.js bu dosyayi import ediyor -- ters
  // yon dongu olurdu. peace.js yalnizca OKUR.
  if (options.goal != null) {
    const rec = relation(world, a, b);
    if (rec) (rec.goals ??= {})[a] = options.goal;
  }
  remember(world.nations[a], game.turns.turn, 'war_with', b);
  remember(world.nations[b], game.turns.turn, 'war_with', a);
  // Cagri-ile-savas KUYRUGA yazilir, burada cozulmez: alliances.js bu
  // dosyayi import eder, ters yon dongu olurdu. turn.js kuyrugu YZ evresi
  // sonunda bosaltir. Cagriyla acilan savas yeni cagri dogurmaz (zincir yok).
  // Müttefikler ilanla birlikte çağrılır ki ültimatom süresince onlar da
  // hazırlansın; kendi ültimatomları saldırganınkiyle aynı hafta biter.
  if (options.reason !== 'alliance') {
    (world.pendingWarCalls ??= []).push({ aggressor: a, defender: b, warAt });
  }
  // Savaş ilanının anlık harita izi yok (sınır rengi değişmez; işgal
  // taraması ancak kareler el değiştirince başlar) — tam geçersizleme
  // YZ'nin her ilanında tüm önbelleği boşuna yakıyordu.
  if (a === game.turns.playerNation || b === game.turns.playerNation) {
    const other = world.nations[a === game.turns.playerNation ? b : a];
    // İlan kartı kendiliğinden kapanmaz (NOTIFY.CRISIS ttl 0): görülmeden
    // geçmemeli. Ulusal olay olarak duyurulur ki VAKAYINAMEYE girsin (Open
    // Beta 4'te ilk savaş vakayinamede yoktu). Savaşın fiilen başlaması ayrı
    // bir kart alır (bkz. resolveCrises).
    const me = world.nations[game.turns.playerNation];
    const attacked = b === game.turns.playerNation;
    announce(game, me, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `crisis-${other.id}`, ttl: 0,
      title: attacked
        ? `${other.name} declares war on us — ${ULTIMATUM_WEEKS} weeks to prepare`
        : `War declared on ${other.name} — armies march in ${ULTIMATUM_WEEKS} weeks`,
      detail: attacked
        ? 'Mobilize now: the reserve arms within the ultimatum. Their armies cross once it expires.'
        : 'Both sides may mobilize. The border opens when the ultimatum runs out; taken provinces cost infamy.',
    });
  }
  return true;
}

/**
 * Ültimatomsuz savaş: ilan ve aynı hafta açık cephe. Denetim ve tanılama
 * betikleri içindir ("bu savaşın masası ne verir" sorusu sekiz hafta
 * beklemeden sorulabilsin); oyunun kendisi her ilanı ültimatomdan geçirir
 * (YZ, koalisyon, oyuncu — hepsi `declareWar`).
 */
export function declareWarNow(game, a, b, options = {}) {
  if (!declareWar(game, a, b, options)) return false;
  const rec = relation(game.world, a, b);
  if (rec) rec.warAt = game.turns.turn;
  resolveCrises(game);
  return atWar(game.world, a, b);
}

/**
 * Süresi dolan ültimatomları savaşa çevirir. Kayıt YERİNDE değişir: `wars`,
 * `goals`, `aggressor` savaşa taşınır; `since` savaşın gerçek başlangıcıdır
 * (MIN_WAR_TURNS ve savaş yükü buna bakar).
 * @returns {number} bu hafta başlayan savaş sayısı
 */
export function resolveCrises(game) {
  const world = game.world;
  const turn = game.turns.turn;
  const n = world.nations.length;
  let started = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = world.relations[a]?.[b];
      if (!rec || rec.state !== CRISIS || turn < (rec.warAt ?? 0)) continue;
      // Ölen taraf: ültimatom sessizce düşer, savaş hiç başlamaz.
      if (!world.nations[a]?.alive || !world.nations[b]?.alive) {
        setState(world, a, b, PEACE, turn, { wars: rec.wars ?? 0 });
        continue;
      }
      rec.state = WAR;
      rec.since = turn;
      delete rec.warAt;
      started++;
      const player = game.turns.playerNation;
      if (a === player || b === player) {
        const me = world.nations[player];
        const other = world.nations[a === player ? b : a];
        const attacked = rec.aggressor !== player;
        announce(game, me, {
          kind: 'WAR', tier: TIER.MAJOR, key: `war-${other.id}`, ttl: 0,
          title: attacked ? `${other.name}'s armies cross the border` : `War with ${other.name} begins`,
          detail: attacked
            ? 'The ultimatum has expired; hold the line or take theirs.'
            : 'The peace table opens once provinces are held; each taken province costs infamy.',
        });
      }
    }
  }
  return started;
}

/** Baris masasi: yalniz karsi taraftan fiilen isgal edilen province'ler devredilir. */
export function settleOccupations(game, a, b) {
  const world = game.world;
  let transferred = 0;
  let aTook = 0;
  let bTook = 0;
  const changedTiles = [];
  for (const tile of world.tiles) {
    const controller = controllerOf(tile);
    const validTransfer = (tile.owner === a && controller === b)
      || (tile.owner === b && controller === a);
    if (!validTransfer) continue;
    const oldOwner = tile.owner;
    captureConstructionAt(world, tile, controller);
    world.nations[oldOwner].tiles = Math.max(0, world.nations[oldOwner].tiles - 1);
    world.nations[controller].tiles++;
    tile.owner = controller;
    tile.controller = controller;
    tile.heldSince = game.turns.turn;
    if (tile.province) tile.province.control = 25;
    if (tile.city) tile.city.nationId = controller;
    changedTiles.push(tile);
    if (controller === a) aTook++; else bTook++;
    transferred++;
  }
  // Toprak devri diplomatik hafizaya gecer: ulke paneli "kime toprak
  // kaybetti, kimden aldi" diyebilsin (yalniz NET yon, iki uc da yazilmaz).
  if (aTook > bTook) {
    remember(world.nations[a], game.turns.turn, 'took_land_from', b);
    remember(world.nations[b], game.turns.turn, 'lost_land_to', a);
  } else if (bTook > aTook) {
    remember(world.nations[b], game.turns.turn, 'took_land_from', a);
    remember(world.nations[a], game.turns.turn, 'lost_land_to', b);
  }
  // Yalnız el değiştiren kareler mürekkeplenir; küme 512'yi aşarsa
  // invalidateTiles kendisi tam pişirmeye düşer.
  if (changedTiles.length) game.renderer.invalidateTiles(changedTiles);
  return transferred;
}

/**
 * Barisi imzalar. `settle: false` ile cagrildiginda isgalleri otomatik
 * devretmez: toprak degisimini peace.js'teki anlasma belirler (bkz. signPeace).
 */
export function makePeace(game, a, b, options = {}) {
  const world = game.world;
  if (!atWar(world, a, b)) return false;
  const transferred = options.settle === false ? 0 : settleOccupations(game, a, b);
  const wars = relation(world, a, b)?.wars ?? 1;
  setState(world, a, b, PEACE, game.turns.turn, {
    truceUntil: game.turns.turn + truceLengthFor(wars),
    wars,
  });
  // Toprak devri settleOccupations/claimAtPeace içinde nokta geçersizleme
  // ile işaretlendi; barışın kendisinin ayrıca harita izi yok.
  if (a === game.turns.playerNation || b === game.turns.playerNation) {
    const other = world.nations[a === game.turns.playerNation ? b : a];
    // `settle: false` geldiginde toprak devrini anlasma yapar; isgal sayisini
    // burada bildirmek yaniltici olur (her zaman 0 yazardi).
    game.turns.addLog(options.settle === false
      ? `Peace signed with ${other.name}.`
      : `Peace signed with ${other.name}; ${transferred} occupied provinces changed sovereignty.`,
    { kind: 'PEACE' });
  }
  return true;
}

/** Kaba askerî güç: ordu + şehir gücü. Savaş/barış kararlarının ölçütü. */
export function nationStrength(world, nation) {
  let power = 0;
  for (const unit of world.units) {
    if (unit.nationId === nation.id) power += armyPower(unit);
  }
  for (const city of world.cities) {
    if (city.nationId === nation.id) power += 3;
  }
  return power;
}

/**
 * Ülkelerin kaç kareden temas ettiği. Savaş ilanı ancak komşuya yapılır,
 * yoksa YZ haritanın öbür ucundaki ülkeye savaş açıyor.
 */
export function computeContacts(world) {
  const n = world.nations.length;
  const contacts = Array.from({ length: n }, () => new Int32Array(n));
  // world.neighbors kare basina yeni dizi kurar; 15k+ hexlik haftalik tam
  // taramada bu tek basina ~0.8 MB coptu (olculdu). Yon tablosuyla dogrudan
  // gezilir, ziyaret sirasi birebir ayni.
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    for (let d = 0; d < DIRS.length; d++) {
      const nb = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
      if (nb && nb.owner >= 0 && nb.owner !== tile.owner) contacts[tile.owner][nb.owner]++;
    }
  });
  return contacts;
}
