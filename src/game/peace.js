// Barış görüşmesi. EU4'teki gibi: savaş bir yerde biter, ama *neyin* el
// değiştireceği pazarlıkla belirlenir.
//
// Eskiden `makePeace` işgal altındaki her kareyi otomatik devrediyordu; oyuncu
// ne isteyeceğini seçemiyor, karşı taraf da hiçbir şey teklif edemiyordu.
// Burada iki şey var: savaşın kim tarafından kazanıldığını ölçen **warscore**
// ve o puanın satın alabileceği kadar toprak isteyen bir **teklif**.
//
// Katman notu: saf hesap. DOM'a dokunmaz, çizim bilmez.

import { atWar, makePeace, nationStrength } from './diplomacy.js';
import { controllerOf } from './control.js';

/** Warscore 0-100 arasıdır; 100 tam teslimiyet demektir. */
export const MAX_WAR_SCORE = 100;

/**
 * Bir barışta alınabilecek azami province (küme) sayısı. Victoria'da savaşlar
 * ülke yutmaz, sınır düzeltir: tam zafer bile birkaç eyalet getirir. Birim
 * artık 2-7 hexlik kümedir; 3 küme ≈ eski 6 karelik tavanla aynı yüzölçümü.
 */
export const MAX_DEMAND_PROVINCES = 3;

/** Toprak dışı talepler. Hepsinin gerçek bir oyun etkisi vardır. */
export const PEACE_TERMS = {
  REPARATIONS: {
    id: 'REPARATIONS', name: 'War Reparations', icon: '¤', cost: 18, turns: 260,
    desc: 'They pay you a share of their treasury income for five years.',
  },
  DEMILITARIZE: {
    id: 'DEMILITARIZE', name: 'Demilitarisation', icon: '⚔', cost: 24, turns: 208,
    desc: 'They cannot raise new divisions for four years.',
  },
  CONCESSION: {
    id: 'CONCESSION', name: 'Resource Concession', icon: '⛏', cost: 20, turns: 312,
    desc: 'A fifth of their raw production is shipped to you for six years.',
  },
  FACTORY_RIGHTS: {
    id: 'FACTORY_RIGHTS', name: 'Industrial Rights', icon: '🏭', cost: 14, turns: 312,
    desc: 'Your capital may open factories in their states for six years.',
  },
  LIBERATE: {
    id: 'LIBERATE', name: 'Liberate Minorities', icon: '⚑', cost: 35,
    desc: 'Provinces of a culture foreign to them break away and become independent.',
  },
  VASSALIZE: {
    id: 'VASSALIZE', name: 'Vassalise', icon: '👑', cost: 65,
    desc: 'They become your vassal: permanent peace and a tribute of their income.',
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Bir province'in barış masasındaki bedeli. Kalabalık ve şehirli toprak
 * pahalıdır; kimsenin yaşamadığı kenar province ucuz. Böylece "warscore'um 40,
 * ne alabilirim" sorusunun cevabı haritaya bakarak verilir.
 */
/**
 * Bir province KÜMESİNİN barış masasındaki bedeli. Kalabalık, gelişmiş ve
 * şehirli küme pahalıdır; kimsenin yaşamadığı sınır kümesi ucuz. Böylece
 * "warscore'um 40, ne alabilirim" sorusunun cevabı haritaya bakarak verilir.
 */
export function provinceWarCost(world, province) {
  const econ = province?.econ;
  if (!econ || province.owner < 0) return 0;
  let cities = 0;
  for (const idx of province.tileIdx) {
    if (world.tiles[idx].city) cities++;
  }
  const development = (econ.agriculture ?? 0) + (econ.extraction ?? 0) + (econ.commerce ?? 0);
  return Math.max(1, Math.round(
    2 * econ.hexes + econ.population / 3000 + development * 0.6 * econ.hexes + cities * 12,
  ));
}

/** Küme anahtarı: barış teklifi listeleri bu kimlikle taşınır. */
export function provinceKeyOf(province) {
  return `p${province.id}`;
}

/** Anahtardan küme kaydı; tanınmayan anahtar null döner. */
export function provinceFromKey(world, key) {
  if (typeof key !== 'string' || !key.startsWith('p')) return null;
  return world.provinces?.[Number(key.slice(1))] ?? null;
}

/**
 * Savaşın gidişatı. Üç kaynaktan beslenir: işgal ettiğin toprak, işgal edilen
 * toprağın ve kaba askerî üstünlük. Pozitif değer `a` önde demektir.
 */
export function warScore(world, a, b) {
  if (!atWar(world, a, b)) return 0;
  let held = 0;
  let lost = 0;
  let theirTotal = 0;
  let ourTotal = 0;
  // Küme döngüsü; kısmi işgal payı kadar puan kımıldatır — savaş temposu
  // "son kareyi de al" şartına kilitlenmez, cephe ilerledikçe skor akar.
  const shareControlledBy = (province, nationId) => {
    let count = 0;
    for (const idx of province.tileIdx) {
      if (controllerOf(world.tiles[idx]) === nationId) count++;
    }
    return count / Math.max(1, province.tileIdx.length);
  };
  for (const province of world.provinces ?? []) {
    if (province.owner === b) {
      const cost = provinceWarCost(world, province);
      theirTotal += cost;
      held += cost * shareControlledBy(province, a);
    } else if (province.owner === a) {
      const cost = provinceWarCost(world, province);
      ourTotal += cost;
      lost += cost * shareControlledBy(province, b);
    }
  }
  // İşgal payı asıl belirleyicidir: toprak tutmadan savaş kazanılmış sayılmaz.
  const occupation = (held / Math.max(1, theirTotal)) - (lost / Math.max(1, ourTotal));
  const mine = nationStrength(world, world.nations[a]);
  const theirs = nationStrength(world, world.nations[b]);
  const edge = (mine - theirs) / Math.max(1, mine + theirs);
  return clamp(Math.round((occupation * 0.75 + edge * 0.25) * MAX_WAR_SCORE),
    -MAX_WAR_SCORE, MAX_WAR_SCORE);
}

/** Teklifin toplam bedeli: istenen kümeler + talepler eksi verilen kümeler. */
export function offerCost(world, offer) {
  const provinces = (list) => (list ?? []).reduce((sum, key) => (
    sum + provinceWarCost(world, provinceFromKey(world, key))
  ), 0);
  const terms = (offer?.terms ?? []).reduce(
    (sum, id) => sum + (PEACE_TERMS[id]?.cost ?? 0), 0,
  );
  return provinces(offer?.demands) + terms - provinces(offer?.concessions);
}

/** Vassallik yalnız açık ara zayıf düşmandan istenebilir. */
export function canVassalize(world, a, b) {
  const mine = nationStrength(world, world.nations[a]);
  const theirs = nationStrength(world, world.nations[b]);
  return mine > theirs * 2.5 && world.nations[b].tiles > 0;
}

export function termAvailable(world, a, b, termId) {
  if (termId === 'VASSALIZE') return canVassalize(world, a, b);
  if (termId === 'LIBERATE') {
    const target = world.nations[b];
    return (world.provinces ?? []).some(
      (province) => province.owner === b && province.econ
        && province.culture !== target.culture,
    );
  }
  return true;
}

/**
 * Haritadaki kareden masadaki küme: barış ekranı hexe tıklatır, teklif
 * kümeyi taşır. Yalnız karşı tarafın *egemenliğindeki* kümeler istenebilir.
 */
export function demandKeyForTile(world, tile, targetId) {
  const province = world.provinces?.[tile?.provinceId];
  if (!province || province.owner !== targetId) return null;
  return provinceKeyOf(province);
}

export function concedeKeyForTile(world, tile, ownId) {
  const province = world.provinces?.[tile?.provinceId];
  if (!province || province.owner !== ownId) return null;
  return provinceKeyOf(province);
}

/**
 * Karşı taraf bu teklifi kabul eder mi? Kural basit ve okunur: istediğin
 * toprağın bedeli, elindeki warscore'u aşamaz. Verdiğin toprak bedeli düşürür,
 * yani kaybeden taraf da masaya bir şey koyarak anlaşma satın alabilir.
 */
/**
 * Teklifi ALAN tarafin masadan kalkma esigi. Kazanan taraf bedava imzalamaz;
 * ikinci cephe, coken istikrar ve uzayan savas esigi gevsetir.
 *
 * Yorgunluk tavani 15 puan / 312 hafta (6 yil): boylece gercek bir tikanma
 * eninde sonunda beyaz barisla kapanabilir (donmus savas gec oyunun en buyuk
 * karar bosluguydu) ama TAZE bir zafer asla bedavaya geri verilmez.
 */
export function acceptanceTolerance(world, receiverId, proposerId) {
  const receiver = world.nations[receiverId];
  let fronts = 0;
  for (const other of world.nations) {
    if (other.alive && other.id !== receiverId && atWar(world, other.id, receiverId)) fronts++;
  }
  const rec = world.relations?.[receiverId]?.[proposerId];
  const weeks = Math.max(0, (world.turn ?? 0) - (rec?.since ?? 0));
  const weariness = clamp(weeks / 312, 0, 1) * 15;
  const raw = 10 + Math.max(0, fronts - 1) * 15
    + ((receiver?.economy?.stability ?? 0.6) < 0.4 ? 15 : 0)
    + weariness;
  // TAVAN: tolerans, kazanilan ustunlugun tamamini silemez.
  //
  // Bu kapi canli oyunda yakalandi (seed BETA1836, 1840, Vasheim-Draesh):
  // Draesh 37-0 ondeydi ama iki cephede savasiyor ve istikrari %40'in
  // altindaydi; tolerans 45.9'a cikip 37'lik ustunlugu tamamen yutuyor ve
  // BEDAVA BEYAZ BARIS yine kabul ediliyordu — BUG-009 baska bir yoldan geri
  // gelmisti. Yorgunluk talebi ucuzlatmali, SIFIRLAMAMALI.
  //
  // Kazanan taraf ustunlugunun en az %40'ini masada ister.
  const lead = warScore(world, receiverId, proposerId);
  return lead > 0 ? Math.min(raw, lead * 0.6) : raw;
}

/**
 * Teklif, ALICININ beklentisini karsiliyor mu? Tek dogruluk kaynagi budur:
 * oyuncu masasi ve YZ karari ayni fonksiyondan gecer.
 *
 * NEDEN TEK KAYNAK: iki ayri yol vardi. `ai.js` zaten "kazanan beyaz barisi
 * reddeder" kuralini isletiyordu, ama YALNIZ YZ-YZ arasinda; oyuncunun
 * masasindaki `offerRefusal` bedeli sifir olan her teklifi kosulsuz kabul
 * ediyordu (`if (cost <= 0) return null`). Beta bunu tam olarak boyle yakaladi:
 * -25 skorla, iki sehri isgal altindayken bedava beyaz baris.
 */
export function offerMeetsExpectation(world, receiverId, proposerId, offer) {
  const hope = warScore(world, receiverId, proposerId);
  const tolerance = acceptanceTolerance(world, receiverId, proposerId);
  return offerValueFor(world, offer) >= hope - tolerance;
}

/** Teklifin neden reddedildiği; kabul edilirse null. */
export function offerRefusal(world, a, b, offer) {
  const demands = offer?.demands ?? [];
  if (demands.length > MAX_DEMAND_PROVINCES) {
    return `No treaty may transfer more than ${MAX_DEMAND_PROVINCES} provinces.`;
  }
  for (const termId of offer?.terms ?? []) {
    if (!termAvailable(world, a, b, termId)) {
      return `${PEACE_TERMS[termId]?.name ?? 'That demand'} cannot be imposed on them.`;
    }
  }
  const cost = offerCost(world, offer);
  const score = Math.max(0, warScore(world, a, b));
  if (cost > score) return `They refuse: the demand exceeds your war score by ${cost - score}.`;
  if (!offerMeetsExpectation(world, b, a, offer)) {
    const shortfall = Math.max(1, Math.ceil(
      warScore(world, b, a) - acceptanceTolerance(world, b, a) + cost,
    ));
    return `They are winning and will not sign for nothing — they expect about ${shortfall} more at the table.`;
  }
  return null;
}

export function offerAcceptable(world, a, b, offer) {
  return offerRefusal(world, a, b, offer) === null;
}

/**
 * Masada istenebilecek şey, cephede tutulan şeydir: `a`nın TAMAMEN işgal
 * ettiği `b` kümeleri, değerlisinden ucuzuna. Kuşatma tamamlama kuralı
 * (CK3): yarım işgal skora sayılır ama masada bütün küme istenir.
 */
export function occupiedProvincesOf(world, a, b) {
  const held = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== b || !province.econ) continue;
    const fully = province.tileIdx.every(
      (idx) => controllerOf(world.tiles[idx]) === a,
    );
    if (!fully) continue;
    held.push({ province, cost: provinceWarCost(world, province) });
  }
  return held.sort((x, y) => y.cost - x.cost);
}

/**
 * Şartların istenme sırası. Kalıcı olanlar (vassallık, bağımsızlık) önce
 * denenir; bütçe yetmezse süreli olanlara düşülür.
 */
const TERM_PRIORITY = [
  'VASSALIZE', 'LIBERATE', 'REPARATIONS', 'CONCESSION', 'FACTORY_RIGHTS', 'DEMILITARIZE',
];

/**
 * Warscore bütçesiyle bir teklif kurar. Oyuncunun masada elle yaptığının
 * aynısı: önce tutulan toprak, kalan bütçe şartlara. Bütçe yoksa sonuç beyaz
 * barıştır — "savaşı bitirelim, kimse bir şey almasın".
 *
 * `appetite` bütçenin ne kadarının harcanacağını söyler; YZ her seferinde
 * son kuruşuna kadar dayatmasın diye vardır.
 */
export function buildOffer(world, a, b, options = {}) {
  const { appetite = 1, maxTiles = MAX_DEMAND_PROVINCES, termShare = 0 } = options;
  const offer = { demands: [], concessions: [], terms: [] };
  const budget = Math.floor(Math.max(0, warScore(world, a, b)) * clamp(appetite, 0, 1));
  if (budget <= 0) return offer;

  // Toprak her zaman önce gelirse şartlar hiç alınmaz: en ucuz şart bile birkaç
  // province ediyor. `termShare` bütçenin bir kısmını masada tutar, böylece
  // "toprak yerine tazminat" diyen bir barış da mümkün olur.
  const reserved = Math.floor(budget * clamp(termShare, 0, 1));
  let left = budget - reserved;
  for (const { province, cost } of occupiedProvincesOf(world, a, b)) {
    if (offer.demands.length >= maxTiles) break;
    if (cost > left) continue;
    offer.demands.push(provinceKeyOf(province));
    left -= cost;
  }
  // Toprağa harcanmayan bütçe de şartlara akar; hiçbir puan boşa gitmez.
  left += reserved;
  for (const termId of TERM_PRIORITY) {
    const term = PEACE_TERMS[termId];
    if (!term || term.cost > left) continue;
    if (!termAvailable(world, a, b, termId)) continue;
    offer.terms.push(termId);
    left -= term.cost;
  }
  return offer;
}

/**
 * Teklifin *alıcı* için net değeri. Negatif sayı "bu kadarını kaybediyorum"
 * demektir. `offerCost` teklifi verenin gözünden bakar; masanın iki tarafı
 * olduğu için karşı tarafın hesabı da gerekli.
 */
export function offerValueFor(world, offer) {
  return -offerCost(world, offer);
}

/**
 * Süreli anlaşma şartını kaydeder. Etkiler tek yerde tutulur ki hangi ülkenin
 * neye tabi olduğu tek bakışta okunsun ve süre dolunca temizlenebilsin.
 */
function addTreaty(nation, treaty) {
  nation.treaties = (nation.treaties ?? []).filter(
    (existing) => existing.type !== treaty.type || existing.partner !== treaty.partner,
  );
  nation.treaties.push(treaty);
}

export function treatiesOf(nation) {
  return nation?.treaties ?? [];
}

/** Bir ülke şu an bu şarta tabi mi? */
export function underTreaty(nation, type, turn) {
  return treatiesOf(nation).some(
    (treaty) => treaty.type === type && (treaty.until ?? Infinity) > turn,
  );
}

/** Süresi dolan şartlar temizlenir; her tur bir kez çağrılır. */
export function expireTreaties(world, turn) {
  for (const nation of world.nations) {
    if (!nation.treaties?.length) continue;
    nation.treaties = nation.treaties.filter((treaty) => (treaty.until ?? Infinity) > turn);
  }
}

/** Toprak dışı şartların uygulanması. */
function applyTerms(game, a, b, terms) {
  const world = game.world;
  const turn = game.turns.turn;
  const winner = world.nations[a];
  const loser = world.nations[b];
  for (const termId of terms ?? []) {
    const term = PEACE_TERMS[termId];
    if (!term || !termAvailable(world, a, b, termId)) continue;
    if (termId === 'LIBERATE') {
      // Yabancı kültürlü kümeler bağımsızlaşır: imparatorluk küçülür ama
      // toprak fatihe geçmez — Victoria'daki "ulus serbest bırakma" bunu yapar.
      // Küme bütün olarak çözülür; sınır hiçbir kümeyi ikiye bölmez.
      for (const province of world.provinces ?? []) {
        if (province.owner !== b || !province.econ) continue;
        if (province.culture === loser.culture) continue;
        province.owner = -1;
        loser.provinces = Math.max(0, (loser.provinces ?? 0) - 1);
        for (const idx of province.tileIdx) {
          const tile = world.tiles[idx];
          loser.tiles = Math.max(0, loser.tiles - 1);
          tile.owner = -1;
          tile.controller = -1;
        }
        province.econ.control = 60;
        game.renderer.invalidateTiles(province.tileIdx.map((idx) => world.tiles[idx]));
      }
      continue;
    }
    if (termId === 'VASSALIZE') {
      addTreaty(loser, { type: 'VASSALIZE', partner: a, since: turn });
      continue;
    }
    addTreaty(loser, {
      type: termId, partner: a, since: turn, until: turn + (term.turns ?? 0),
    });
  }
  game.turns.addLog?.(`${winner.name} imposed terms on ${loser.name}.`);
}

/**
 * Anlaşmayı uygular. `settleOccupations` yerine *yalnız anlaşılan* kareler el
 * değiştirir; geri kalan işgaller barışla birlikte kalkar.
 */
export function signPeace(game, a, b, offer) {
  const world = game.world;
  if (!atWar(world, a, b)) return false;
  if (!offerAcceptable(world, a, b, offer)) return false;

  const transfer = (keys, from, to) => {
    for (const key of keys ?? []) {
      const province = provinceFromKey(world, key);
      if (!province || province.owner !== from) continue;
      // Devir küme bütünüyle: sınır hiçbir kümeyi ikiye bölmez.
      game.turns.claimAtPeace(province.center, to);
    }
  };
  transfer(offer?.demands, b, a);
  transfer(offer?.concessions, a, b);
  applyTerms(game, a, b, offer?.terms);
  // Anlaşma dışında kalan işgaller sahibine döner: barış cepheyi siler.
  for (const tile of world.tiles) {
    const controller = controllerOf(tile);
    if (controller === tile.owner) continue;
    if ((tile.owner === a && controller === b) || (tile.owner === b && controller === a)) {
      tile.controller = tile.owner;
    }
  }
  return makePeace(game, a, b, { settle: false });
}
