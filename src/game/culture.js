// Kultur: huzursuzluk, asimilasyon, ayrilikci isyan.
//
// NEDEN VAR. Kultur bu depoda uzun sure BES yere bagliydi ve hicbiri halkin
// KENDI iradesini temsil etmiyordu: verim -%30, sadakat hizi/tavani, sabit
// bir asker carpani, sohret carpani, baris masasinda LIBERATE. Yani yabanci halk
// bir ceza tablosuydu, bir aktor degil. Ekranda da oyle goruluyordu:
// "foreign culture -30%".
//
// Uc mekanik, tek dongude:
//
//   HUZURSUZLUK  kabul edilmemis halkin payi x vatandaslik x milliyetcilik
//                cagi, + taze fetih, + savas yorgunlugu, - refah.
//                Sadakat kazancini yer: huzursuz kume once URETIMI keser.
//   ASIMILASYON  yillar icinde paylari ana kulture kaydirir. Okuryazarlik,
//                tam vatandaslik, sehir ve sadakat hizlandirir; huzursuzluk
//                durdurur. Oyuncunun uzun vadeli cikis yolu budur.
//   ISYAN        huzursuzluk esigi ALTI AY degil ALTI MEVSIM asarsa kume
//                ayaklanir. Ayni kulturden komsu varsa ona KATILIR
//                (irredentizm). Yoksa toprak EL DEGISTIRMEZ: ayaklanma
//                bastirilir ama kume KIRILIR — sadakat sifirlanir ve
//                uretim/vergi sadakatle olcekli oldugu icin kume calismaz.
//
// ANA YURT. Kumenin dogus cogunlugu o halkin ana yurdudur (world/cultures.js
// `province.homeland`) ve degismez. Asimilasyon yalniz DIASPORAYI eritir:
// bir halk kendi yurdunda erimez. Fethedilen yurdun bedeli kalicidir ve
// milliyetcilik cagiyla buyur — mekanik oyuncunun en cok fethettigi donemde
// en guclu olur, tersi degil.
//
// UC CIKIS. Kirik kume bir duvar degil bir SORUDUR; her zaman en az bir
// cikisi vardir: ORTAK ET (kabul), BIRAK (akraba ulusa devret), SUR
// (halki cikar). Ucu de KULTUR basinadir, kume basina degil.
//
// NEDEN BOYLE. Olculdu (50 yil x 3 tohum): eski surumde mirascisiz ayaklanma
// kumeyi SAHIPSIZ birakiyor, sahipsiz toprak savassiz ve sohretsiz
// yerlesiliyordu. Sahiplik olaylarinin %78'i bu donguydu — 206 bedava
// yerlesme, 301 isyan, bir kume 50 yilda 24 kez el degistirdi. Ayni dongu
// dunyayi da temizliyordu: yabanci halk payi %41,3'ten %6,0'a dusuyordu,
// yani fethin kalici bedeli kalmiyordu. Yeni surumde el degisen kume orani
// %40,8 -> %32,8, bedava yerlesme 206 -> 7, 1886 yabanci payi %6 -> %14.
//
// GUVENLIK KILIDI: isyan yalnizca kabul edilmemis halkin cogunlukta oldugu
// kumede olur (REVOLT_FOREIGN_MIN). Tek kulturlu ulusal devlet bu mekanikten
// TOPRAK KAYBEDEMEZ — savas yorgunlugu huzursuzlugu yukseltse bile. Mekanigin
// oyunu bozmamasinin sarti budur ve testi `audit:culture-unrest`tir.
//
// Katman: game. DOM yok. provinces.js bu dosyayi cagirir, tersi olmaz —
// gerekli baglam (isgal payi, sadakat) parametre olarak gecer.

import { policyOf } from './politics.js';
import { reformModifiers } from './reforms.js';
import { TIER, announce } from './chronicle.js';
import { addInfamy } from './infamy.js';
import { POPULATION_SCALE } from './populationScale.js';

export const CULTURE = {
  /** Huzursuzluk olcegi 0-10 (nufus ekranindaki militanlikla ayni dil). */
  MAX_UNREST: 10,
  /** Yabanci payin huzursuzluga cevrilme katsayisi (bkz. unrestBreakdown). */
  CULTURE_WEIGHT: 6,
  /** Haftalik yaklasma: huzursuzluk zirvelemez, birikir (~yarilanma 34 hafta). */
  APPROACH: 0.02,
  /** Bu esigin ustunde gecen her hafta isyan sayacini buyutur. */
  REVOLT_UNREST: 7,
  /** Sayac bu kadar haftaya ulasinca kume kopar (~alti mevsim). */
  REVOLT_WEEKS: 26,
  /** Isyan icin kabul EDILMEYEN halkin asgari payi. Tek kulturlu devlet muaf. */
  REVOLT_FOREIGN_MIN: 0.5,
  /** Kopan kume bu huzursuzlukla devralinir: geri alan hemen ayni sorunu bulur. */
  AFTER_REVOLT_UNREST: 3,
  /**
   * Ayaklanan kume bu kadar hafta yeniden ayaklanamaz. Sogumasiz surumde
   * olculdu: kume ~66 haftada bir yeniden kopuyor, 520 haftada dunya capinda
   * 107 isyan cikiyor ve sinirlar titriyordu. Iki yil, yeni sahibin (ya da
   * geri alanin) haklari tanimasina ve asimilasyonun tutmasina yeter.
   */
  REVOLT_COOLDOWN: 104,
  /** Sadakat kazancindan huzursuzluk basina dusen pay. */
  CONTROL_DRAG: 0.15,

  /** Haftalik asimilasyon tabani: notr kosulda tam donusum ~60 yil. */
  ASSIMILATE_BASE: 0.0008,
  /** Paylar bu esigin altina duserse satir silinir (normalizeMix ile ayni). */
  SHARE_FLOOR: 0.02,

  /** Kirik kume bu sadakatin ustune cikinca yeniden calisiyor sayilir. */
  BROKEN_RECOVERED: 50,
  /** Surgunun sohret bedeli: bu kadar insan basina bir puan. */
  EXPEL_INFAMY_PER_POP: 40000 * POPULATION_SCALE,
  /** Surgun en az bu kadar sohret uretir: kucuk halki surmek de ucuz degildir. */
  EXPEL_INFAMY_MIN: 8,

  /** Kulturu kabul etmek icin gereken asgari ulusal nufus payi. */
  ACCEPT_MIN_SHARE: 0.08,
  /** Kabulun bedeli: ana kulturlu kumelerde bu kadar hafta suren tepki. */
  BACKLASH_WEEKS: 104,
  BACKLASH_UNREST: 2.5,
};

/**
 * Milliyetcilik cagi. 1836'da imparatorluk bir hanedandir, 1900'de bir ulus
 * olmak zorundadir: ayni yabanci pay yuzyilin sonunda 1.8 kat huzursuzluk
 * uretir. Takvime bagli, teknolojiye degil — herkes ayni cagi yasar.
 */
export function nationalismEra(turn) {
  const progress = Math.max(0, Math.min(1, (turn ?? 0) / 3330));
  return 1 + progress * 0.8;
}

/** Vatandaslik politikasinin huzursuzluk agirligi. */
function rightsWeight(nation) {
  const policy = policyOf(nation, 'citizenship');
  if (policy === 'full_citizenship') return 0.45;
  if (policy === 'limited_citizenship') return 0.7;
  return 1;
}

/**
 * Kabul EDILMEYEN halkin verdigi asker payi. Vic2'nin accepted-culture
 * mantigi: imparatorlugun ordusu ana kulturden kurulur, yabanci tebaa
 * gonulsuzdur. Deger 0,35'te sabitti; artik vatandaslik yasasina baglidir
 * cunku sorunun tam karsiligi odur — halki devlete ortak etmeyen devlet
 * onlardan asker de alamaz.
 *
 * Kartopu freninin SUREKLI kalemi budur: yabanci halktan kurulu imparatorlugun
 * ordusu buyumez, yani fetih kendini beslemez. Olculdu — tek basina hicbir sey
 * yapmiyordu (%40,6 vs %40,8) cunku dunyada ceza kesecek yabanci kalmamisti;
 * ana yurt ve bastirilan isyan onarildiktan SONRA calisiyor (%32,8 -> %30,5).
 */
export function foreignManpowerShare(nation) {
  const policy = policyOf(nation, 'citizenship');
  if (policy === 'full_citizenship') return 0.5;
  if (policy === 'limited_citizenship') return 0.3;
  return 0.15;
}

/** Vatandaslik politikasinin asimilasyon hizi: haklar eritir, dislama korur. */
function assimilationRights(nation) {
  const policy = policyOf(nation, 'citizenship');
  if (policy === 'full_citizenship') return 1.4;
  if (policy === 'limited_citizenship') return 1;
  return 0.6;
}

/** Ulusun kabul ettigi kulturler (ana kultur her zaman dahil). */
export function acceptedCultures(nation) {
  const list = nation?.accepted?.length ? nation.accepted : [nation?.culture];
  return list.filter((id) => id >= 0);
}

export function isAccepted(nation, cultureId) {
  if (cultureId == null || cultureId < 0) return false;
  return acceptedCultures(nation).includes(cultureId);
}

/**
 * Kumede kabul edilen halkin payi. `province.cultures` yoksa (eski kayit ya
 * da uretilmemis kume) cogunluga bakilir — davranis eskisiyle ayni kalir.
 */
export function acceptedShareOf(province, nation) {
  const rows = province?.cultures;
  if (!rows?.length) return isAccepted(nation, province?.culture) ? 1 : 0;
  let share = 0;
  for (const row of rows) if (isAccepted(nation, row.id)) share += row.share;
  return Math.max(0, Math.min(1, share));
}

/** Kabul edilmeyen halkin payi — huzursuzlugun ana kaynagi. */
export function foreignShareOf(province, nation) {
  return 1 - acceptedShareOf(province, nation);
}

/** Kabulun ardindan gelen milliyetci tepki hala suruyor mu? */
function backlashOf(nation, turn) {
  const until = nation?.cultureBacklashUntil ?? 0;
  if (turn >= until) return 0;
  // Tepki soner: ilk yil sert, ikinci yil kalintisi.
  const left = (until - turn) / CULTURE.BACKLASH_WEEKS;
  return CULTURE.BACKLASH_UNREST * Math.max(0, Math.min(1, left));
}

/**
 * Kumenin huzursuzluk HEDEFI (0-10). Mevcut deger buna yaklasir, ziplamaz.
 * Dokum ekran icin ayrica doner: "neden huzursuz" sorusu cevaplanabilsin.
 */
export function unrestBreakdown(world, province, nation, { occupied = 0, turn = 0 } = {}) {
  const econ = province.econ;
  const foreign = foreignShareOf(province, nation);
  const era = nationalismEra(turn);
  // ANA KAYNAK: yabanci pay x haklar x cag. Tek kulturlu kumede sifirdir.
  //
  // Katsayi MAX_UNREST (10) degil CULTURE_WEIGHT (6). 10 ile olculdu ve iki
  // sey birden bozuluyordu: (a) residency altinda hedef 10'a, yani TAVANA
  // dayaniyor ve refah/haklar/cag hicbir sey degistiremiyordu — vatandaslik
  // kaldiraci olculemedi (4.56 vs 4.64); (b) tamamen yabanci her kume
  // esigi ~60 haftada asiyor, ~86. haftada kopuyor ve isyandan sonra 66
  // haftada bir yeniden kopuyordu (520 haftada 203 isyan / 263 kume).
  // 6 ile taban durum ESIGIN ALTINDA kalir: yabanci tasra pahalidir ama
  // ayaklanmaz. Onu esigin USTUNE tasiyan sey taze fetih, savas, ya da
  // milliyetcilik cagi olur — yani bir OLAY, bir sabit degil.
  const culture = foreign * CULTURE.CULTURE_WEIGHT * rightsWeight(nation) * era;
  // TAZE FETIH: sadakati oturmamis toprak. Kendi halkini kurtarmak neredeyse
  // bedava (0.3), yabanci halki fethetmek pahali (1.0).
  const conquest = (1 - Math.max(0, Math.min(1, (econ.control ?? 100) / 100)))
    * 3 * (0.3 + 0.7 * foreign);
  // SAVAS YORGUNLUGU: her kumeye biner ama tek basina isyan cikaramaz
  // (REVOLT_FOREIGN_MIN kapisi). Katsayilar 1.5/2.0 denendi ve dusuruldu:
  // uzun savasta KENDI kumelerinin huzursuzlugu yabanci kumeleri geciyordu
  // (olculdu: kendi zirvesi 6.7, yabanci ortalamasi 6.2) — mekanigin adi
  // kultur ama en buyuk kaynagi savas oluyordu.
  const war = Math.max(0, Math.min(1, nation.economy?.warStrain ?? 0));
  const occupation = Math.max(0, Math.min(1, occupied)) * 1.5;
  const backlash = backlashOf(nation, turn) * (1 - foreign);
  // REFAH: sosyal harcama huzursuzlugu satin alir. Azinlik haklari yasasi da
  // yatistirir (minorityCeiling 0.7-1.0 arasi).
  const welfare = Math.max(0, Math.min(100, nation.economy?.social?.welfare ?? 0)) / 100 * 2;
  const rights = ((reformModifiers(nation).minorityCeiling ?? 1) - 0.7) / 0.3 * foreign;
  const target = Math.max(0, Math.min(
    CULTURE.MAX_UNREST,
    culture + conquest + war + occupation + backlash - welfare - rights,
  ));
  return { target, culture, conquest, war, occupation, backlash, welfare, rights, foreign, era };
}

/**
 * Asimilasyon: kabul edilmeyen paylari ana kulture kaydirir.
 * @returns {boolean} cogunluk degisti mi (harita rengi tazelenmeli)
 */
function assimilate(world, province, nation, { unrest, turn }) {
  const rows = province.cultures;
  const primary = nation.culture;
  if (!rows?.length || primary < 0) return false;
  const econ = province.econ;
  const control = Math.max(0, Math.min(1, (econ.control ?? 0) / 100));
  if (control < 0.5) return false;
  // Huzursuz halk erimez: isyan esigine yaklasan kumede asimilasyon durur.
  const calm = Math.max(0, 1 - (unrest / CULTURE.MAX_UNREST) * 1.3);
  if (calm <= 0) return false;
  const literacy = Math.max(0, Math.min(1, nation.economy?.literacy ?? 0));
  const urban = province.tileIdx?.some((idx) => world.tiles[idx]?.city) ? 1.5 : 1;
  const rate = CULTURE.ASSIMILATE_BASE
    * (0.5 + literacy) * assimilationRights(nation) * control * urban * calm;
  if (!(rate > 0)) return false;

  let moved = 0;
  const next = [];
  for (const row of rows) {
    // Kabul edilen halk erimez: imparatorluk onlari zaten kendinden sayiyor.
    //
    // ANA YURDUNDA da erimez (bkz. world/cultures.js homeland). Asimilasyon
    // yalniz DIASPORAYI eritir: bir halkin kendi yurdunda azalmasi icin ya
    // surulmesi ya da yurdun elden cikmasi gerekir. Bu kilit olmadan dunya
    // 50 yilda homojenlesiyordu (yabanci halk payi %41,3 -> %6,0) ve kultur
    // freni tam da oyuncunun en cok fethettigi cagda tutunacak yer bulamiyordu.
    if (row.id === primary || isAccepted(nation, row.id)
      || row.id === province.homeland) {
      next.push({ ...row });
      continue;
    }
    const give = row.share * rate;
    moved += give;
    const left = row.share - give;
    if (left >= CULTURE.SHARE_FLOOR) next.push({ id: row.id, share: left });
    else moved += left;
  }
  if (moved <= 0) return false;
  const host = next.find((row) => row.id === primary);
  if (host) host.share += moved;
  else next.push({ id: primary, share: moved });
  // Toplam 1'de tutulur: yuvarlama artigi cogunluga yazilir.
  const total = next.reduce((sum, row) => sum + row.share, 0);
  for (const row of next) row.share /= total;
  next.sort((a, b) => b.share - a.share || a.id - b.id);

  const before = province.culture;
  province.cultures = next;
  province.culture = next[0]?.id ?? before;
  econ.assimilated = (econ.assimilated ?? 0) + moved;
  if (province.culture === before) return false;
  for (const idx of province.tileIdx ?? []) world.tiles[idx].culture = province.culture;
  return true;
}

/**
 * Bir kumenin haftalik kultur isleyisi. `runProvinces` icinden, sahiplik ve
 * isgal payi zaten hesaplanmisken cagrilir.
 *
 * @returns {{ recolored: boolean, revolt: boolean }}
 */
export function runProvinceCulture(world, province, nation, { occupied, turn }) {
  const econ = province.econ;
  if (!econ) return { recolored: false, revolt: false };
  const { target } = unrestBreakdown(world, province, nation, { occupied, turn });
  // ILK DOKUNUSTA SIFIRDAN BASLA, HEDEFTEN DEGIL. Once `?? target` yaziliydi
  // ve 1836 dunyasi ilk haftada tam huzursuzlukla aciliyordu: tarayicida
  // olculdu, 31. haftada dunya capinda 106 kume ayaklanmisti. Imparatorluk
  // oyunun basinda oturmustur; huzursuzluk BIRIKIR — hedefe ~60 haftada
  // yaklasir, isyan sayaci ondan sonra isler, yani ilk kopus en erken
  // 1838-40 civaridir.
  const current = Number.isFinite(econ.unrest) ? econ.unrest : 0;
  econ.unrest = Math.max(0, Math.min(
    CULTURE.MAX_UNREST,
    current + (target - current) * CULTURE.APPROACH,
  ));

  // Kume yeniden calisiyorsa kirik degildir: isaret sadakatle silinir, boylece
  // "duzeldi mi" sorusunun tek bir cevabi olur.
  if (econ.brokenSince != null && (econ.control ?? 0) >= CULTURE.BROKEN_RECOVERED) {
    econ.brokenSince = null;
    econ.brokenCulture = null;
  }

  const foreign = foreignShareOf(province, nation);
  const boiling = econ.unrest >= CULTURE.REVOLT_UNREST
    && foreign >= CULTURE.REVOLT_FOREIGN_MIN
    && occupied <= 0
    && turn >= (econ.revoltCooldown ?? 0);
  // Sayac iki yonlu: bastirilan huzursuzluk iki kat hizli soner, yoksa tek
  // bir kotu yil kalici bir isyan borcu birakirdi.
  econ.revoltWeeks = boiling
    ? (econ.revoltWeeks ?? 0) + 1
    : Math.max(0, (econ.revoltWeeks ?? 0) - 2);

  const recolored = occupied <= 0
    ? assimilate(world, province, nation, { unrest: econ.unrest, turn })
    : false;
  return { recolored, revolt: econ.revoltWeeks >= CULTURE.REVOLT_WEEKS };
}

/**
 * Ayaklanan kumeyi cozer. Iki cikis var ve ikisi de mevcut mekanizmayi
 * kullanir:
 *   1. IRREDENTIZM — ayni kulturden canli bir komsu varsa kume ona katilir.
 *   2. BAGIMSIZLIK — yoksa sahipsiz kalir (peace.js LIBERATE ile ayni sonuc).
 * Yeni ulus dogurmaz: ulus dogurmak iliski tablosunu, YZ'yi ve kaydi
 * buyutur; bu mekanigin bedeli toprak kaybi olmali, yeni bir sistem degil.
 */
/**
 * AYAKLANAN HALK. Kumenin cogunlugu DEGIL, kabul edilmeyenlerin en buyugu.
 *
 * Ayrim gercek: bilesim %45 bizimkiler + %30 X + %25 Y olabilir. Cogunluk
 * bizim halkimizdir ama ayaklanan X'tir (isyan kapisi zaten yabanci payin
 * %50'yi gecmesini ister). `province.culture` kullanildiginda kirik kume
 * "bizim halkimiz" diye etiketleniyor, surgun kapisi "kendi halkimiz"
 * gerekcesiyle kapaniyor ve halk uc kapisi da kapali kaliyordu — denetim
 * bunu yakaladi (audit:homeland TEST 4).
 */
function rebelCultureOf(province, nation) {
  let best = -1;
  let share = 0;
  for (const row of province.cultures ?? []) {
    if (isAccepted(nation, row.id)) continue;
    if (row.share > share || (row.share === share && row.id < best)) {
      best = row.id;
      share = row.share;
    }
  }
  return best >= 0 ? best : province.culture;
}

function secede(game, province, nation) {
  const world = game.world;
  const econ = province.econ;
  const target = rebelCultureOf(province, nation);
  let heir = -1;
  for (const neighborId of province.neighbors ?? []) {
    const neighbor = world.provinces?.[neighborId];
    if (!neighbor || neighbor.owner < 0 || neighbor.owner === nation.id) continue;
    const other = world.nations[neighbor.owner];
    if (!other?.alive || other.culture !== target) continue;
    heir = other.id;
    break;
  }

  // MIRASCISIZ AYAKLANMA TOPRAK DEVRETMEZ, KUMEYI KIRAR.
  //
  // Eskiden mirascisi olmayan kume SAHIPSIZ kaliyordu ve sahipsiz toprak
  // savassiz, sohretsiz yerlesilebiliyor (bkz. turn.js occupy -> canSettle).
  // Olculdu: 50 yilda sahiplik olaylarinin %78'i bu donguydu — 3 tohumda
  // ortalama 206 bedava yerlesme ve 301 isyan, bir kume 24 kez el degistirdi.
  // Sinir degisimi %40,8'e ciktigi icin `audit:borders` "kartopu" veriyordu,
  // ama kartopu fetih degil TITREMEYDI.
  //
  // Artik bastirilan ayaklanma kumeyi calisamaz halde birakir: sadakat sifira
  // duser, uretim ve vergi zaten sadakatle olcekli oldugu icin kume kendini
  // odemez. Bedel kalicidir ama HARITA OYNAMAZ. Cikis yolu ayri: halki ortak
  // et, akrabasina birak ya da sur (bkz. releaseToKin / expelCulture).
  if (heir < 0) {
    econ.control = 0;
    econ.unrest = CULTURE.MAX_UNREST;
    econ.revoltWeeks = 0;
    econ.revoltCooldown = (game.turns?.turn ?? world.turn ?? 0) + CULTURE.REVOLT_COOLDOWN;
    // KIRIK ISARETI. Turetilmis bir kosul yerine acik bir alan: ekran, YZ ve
    // cikis yollari ayni gercege baksin (bir kavramin tek dogrusu olur).
    econ.brokenSince = game.turns?.turn ?? world.turn ?? 0;
    // AYAKLANAN HALK ayrica yazilir. Kume `homeland` ile gruplanamaz: ana
    // yurdun sahibi ile bugun ayaklanan cogunluk ayni olmak zorunda degil
    // (goc, surgun ve asimilasyon bilesimi kaydirir). Cikis yollari kime
    // karsi acildigini bilmeli.
    econ.brokenCulture = target;
    world.suppressedRevolts = (world.suppressedRevolts ?? 0) + 1;
    if (nation.id === game.turns?.playerNation) {
      const rebels = world.cultures?.[target]?.name ?? 'a foreign people';
      announce(game, nation, {
        kind: 'CRISIS', tier: TIER.MAJOR, key: `uprising-${province.id}`,
        title: `${rebels} rise in ${province.name ?? 'the province'}`,
        detail: 'The rising was put down, but the province no longer works for us:'
          + ' no taxes, no goods, no recruits. Share the state with them, hand the'
          + ' land to their kin, or drive them out.',
      });
    }
    return -1;
  }

  // Buradan asagisi yalniz MIRASCILI yol: kume sahipsiz kalmaz, akrabasina
  // katilir. `heir >= 0` kapilari kaldirildi — yukaridaki erken donus onlari
  // olu dala cevirmisti.
  const tiles = (province.tileIdx ?? []).map((idx) => world.tiles[idx]);
  for (const tile of tiles) {
    if (!tile) continue;
    nation.tiles = Math.max(0, nation.tiles - 1);
    tile.owner = heir;
    tile.controller = heir;
    tile.heldSince = game.turns.turn;
    if (tile.city) tile.city.nationId = heir;
    world.nations[heir].tiles++;
  }
  province.owner = heir;
  nation.provinces = Math.max(0, (nation.provinces ?? 0) - 1);
  world.nations[heir].provinces = (world.nations[heir].provinces ?? 0) + 1;
  // Yeni sahip de sorunu devralir: sadakat dusuk, huzursuzluk esigin altinda
  // ama yakin. Hicbir sey degismezse ayni kume yeniden kopar.
  econ.control = 55;
  econ.unrest = CULTURE.AFTER_REVOLT_UNREST;
  econ.revoltWeeks = 0;
  econ.revoltCooldown = (game.turns?.turn ?? world.turn ?? 0) + CULTURE.REVOLT_COOLDOWN;
  // Kosu sayaci: denetim "isyan gercekten oluyor mu" sorusunu savas kaynakli
  // sahiplik degisiminden ayirabilsin. Kayda girmez, bir istatistiktir.
  world.cultureRevolts = (world.cultureRevolts ?? 0) + 1;
  game.renderer.invalidateTiles(tiles.filter(Boolean));

  const player = game.turns.playerNation;
  const name = world.cultures?.[target]?.name ?? 'a foreign people';
  if (nation.id === player) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `revolt-${province.id}`,
      title: `${name} rises in revolt`,
      detail: `The province has joined ${world.nations[heir].name}.`
        + ' Rights, welfare or assimilation would have held it.',
    });
  } else if (heir === player) {
    // `player` bassiz kosuda -1'dir; `heir` artik hep >= 0 oldugu icin bu
    // karsilastirma guvenlidir.
    announce(game, world.nations[player], {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `irredenta-${province.id}`,
      title: `Our kin in ${nation.name} have joined us`,
      detail: 'A province of our culture revolted against its ruler and swore to us.',
    });
  }
  return heir;
}

/**
 * Haftalik isyan cozumu. `runProvinces` sahiplik dongusunu bitirdikten SONRA
 * cagrilir: donguden cikarken sahiplik degistirmek ayni tarama icinde okunan
 * kume durumunu bozardi.
 */
export function resolveRevolts(game, pending) {
  if (!pending?.length) return 0;
  const world = game.world;
  let count = 0;
  for (const provinceId of pending) {
    const province = world.provinces?.[provinceId];
    if (!province?.econ || province.owner < 0) continue;
    const nation = world.nations[province.owner];
    if (!nation?.alive) continue;
    // Kapi son anda yeniden sorulur: bu hafta baris imzalanmis ya da kultur
    // kabul edilmis olabilir.
    if ((province.econ.revoltWeeks ?? 0) < CULTURE.REVOLT_WEEKS) continue;
    if (foreignShareOf(province, nation) < CULTURE.REVOLT_FOREIGN_MIN) {
      province.econ.revoltWeeks = 0;
      continue;
    }
    secede(game, province, nation);
    count++;
  }
  return count;
}

/* --------------------------------------------------------------------------
   KULTUR KABULU — oyuncunun ve YZ'nin ayni kapisi
   -------------------------------------------------------------------------- */

/** Ulusun nufusunun kultur dagilimi (kume paylari x kume nufusu). */
export function cultureMix(world, nation) {
  const mix = new Map();
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const people = Math.max(0, province.econ.population ?? 0);
    if (people <= 0) continue;
    total += people;
    const rows = province.cultures?.length
      ? province.cultures
      : (province.culture >= 0 ? [{ id: province.culture, share: 1 }] : []);
    for (const row of rows) {
      mix.set(row.id, (mix.get(row.id) ?? 0) + people * row.share);
    }
  }
  if (total <= 0) return [];
  return [...mix.entries()]
    .map(([id, people]) => ({
      id,
      name: world.cultures?.[id]?.name ?? 'Stateless',
      people,
      share: people / total,
      accepted: isAccepted(nation, id),
      primary: id === nation.culture,
    }))
    .sort((a, b) => b.share - a.share || a.id - b.id);
}

/** Kabulu engelleyen ne varsa, sirayla. Bos dizi = kabul edilebilir. */
export function acceptBlockers(world, nation, cultureId, turn = world.turn ?? 0) {
  const out = [];
  if (isAccepted(nation, cultureId)) return ['Already an accepted culture.'];
  if (policyOf(nation, 'citizenship') === 'residency') {
    out.push('Residency law grants political rights to the national culture only.');
  }
  const row = cultureMix(world, nation).find((item) => item.id === cultureId);
  const share = row?.share ?? 0;
  if (share < CULTURE.ACCEPT_MIN_SHARE) {
    out.push(`Too few of them: ${(share * 100).toFixed(1)}% of the population,`
      + ` ${(CULTURE.ACCEPT_MIN_SHARE * 100).toFixed(0)}% needed.`);
  }
  if ((nation.cultureBacklashUntil ?? 0) > turn) {
    out.push('The last enfranchisement is still being digested.');
  }
  return out;
}

/**
 * Bir kulturu kabul eder. Kazanc anlik ve buyuktur (tam verim, tam asker
 * havuzu, sonen huzursuzluk); bedel ana kulturde iki yil suren milliyetci
 * tepkidir (bkz. unrestBreakdown backlash).
 */
export function acceptCulture(game, nation, cultureId) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (acceptBlockers(world, nation, cultureId, turn).length) return false;
  nation.accepted = [...acceptedCultures(nation), cultureId];
  nation.cultureBacklashUntil = turn + CULTURE.BACKLASH_WEEKS;
  // ORTAK ETMEK KIRIGI KAPATIR. Halk artik yabanci sayilmadigi icin
  // huzursuzluk hedefi duser ve sadakat geri gelir; isaret hemen silinir ki
  // "hala kirik" gorunup ucuncu bir cikis aranmasin.
  for (const province of brokenProvinces(world, nation, cultureId)) {
    province.econ.brokenSince = null;
    province.econ.brokenCulture = null;
    province.econ.unrest = Math.min(province.econ.unrest ?? 0, CULTURE.AFTER_REVOLT_UNREST);
    province.econ.control = Math.max(province.econ.control ?? 0, 25);
  }
  const name = world.cultures?.[cultureId]?.name ?? 'a people';
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.MAJOR, key: `accept-${cultureId}`,
      title: `${name} are now an accepted culture`,
      detail: 'They pay full taxes, fill the ranks and calm down — but the old'
        + ' nation resents sharing the state for the next two years.',
    });
  }
  game.emit?.('provinces', null);
  return true;
}

/* --------------------------------------------------------------------------
   KIRIK KUME VE UC CIKIS

   Bastirilan ayaklanma kumeyi calisamaz halde birakir (bkz. secede). Bu bir
   duvar degil, bir SORU olmali: kirik kumenin her zaman en az bir cikisi var.

     ORTAK ET  halki kabul et — anlik ve tam cozum, ama nufusun %8'i olmali
               ve ana kulturde iki yil surecek bir tepki dogurur.
     BIRAK     kumeyi ayni kulturden komsu bir ulusa devret — toprak gider,
               sohret duser. Akraba ulus yoksa bu kapi kapalidir.
     SUR       halki cikar — kume temizlenir ama nufusu gider ve dunya bunu
               hatirlar. Her zaman aciktir; son caredir ve oyle fiyatlanir.

   Ucu de KULTUR basinadir, kume basina degil: kirk kirik kumesi olan oyuncu
   kirk tik yapmaz, bir karar verir (VICTORIA_LITE ev odevi testi).
   -------------------------------------------------------------------------- */

/** Bir ulusun kirik kumeleri; `cultureId` verilirse yalniz o halkinkiler. */
export function brokenProvinces(world, nation, cultureId = null) {
  const out = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || province.econ?.brokenSince == null) continue;
    if (cultureId != null && province.econ.brokenCulture !== cultureId) continue;
    out.push(province);
  }
  return out;
}

/** Kirik kumeleri halk halk toplar — ekranin ve YZ'nin ortak listesi. */
export function brokenByCulture(world, nation) {
  const groups = new Map();
  for (const province of brokenProvinces(world, nation)) {
    const id = province.econ.brokenCulture ?? province.homeland;
    if (id < 0) continue;
    if (!groups.has(id)) {
      groups.set(id, {
        id, name: world.cultures?.[id]?.name ?? 'a foreign people', provinces: [], people: 0,
      });
    }
    const row = groups.get(id);
    row.provinces.push(province);
    row.people += Math.max(0, province.econ?.population ?? 0);
  }
  const mix = cultureMix(world, nation);
  return [...groups.values()].map((row) => ({
    ...row,
    share: mix.find((item) => item.id === row.id)?.share ?? 0,
    accept: acceptBlockers(world, nation, row.id),
    release: releaseBlockers(world, nation, row.id),
    expel: expelBlockers(world, nation, row.id),
  })).sort((a, b) => b.provinces.length - a.provinces.length || a.id - b.id);
}

/** Kumeyi devralabilecek, ayni kulturden ve BITISIK bir ulus. */
function kinHeirFor(world, nation, cultureId) {
  for (const province of brokenProvinces(world, nation, cultureId)) {
    for (const neighborId of province.neighbors ?? []) {
      const neighbor = world.provinces?.[neighborId];
      if (!neighbor || neighbor.owner < 0 || neighbor.owner === nation.id) continue;
      const other = world.nations[neighbor.owner];
      if (other?.alive && other.culture === cultureId) return other.id;
    }
  }
  return -1;
}

/** Birakmayi engelleyen ne varsa. Bos dizi = birakilabilir. */
export function releaseBlockers(world, nation, cultureId) {
  const out = [];
  if (!brokenProvinces(world, nation, cultureId).length) {
    out.push('No broken province of theirs to hand over.');
  }
  if (kinHeirFor(world, nation, cultureId) < 0) {
    out.push('No neighbouring state of their people to receive it.');
  }
  return out;
}

/**
 * Kirik kumeleri akraba bir ulusa devreder. Toprak gider ama sorun da gider:
 * dunya toprak IADESINI hatirlar, sohret duser.
 */
export function releaseToKin(game, nation, cultureId) {
  const world = game.world;
  if (releaseBlockers(world, nation, cultureId).length) return 0;
  const heir = kinHeirFor(world, nation, cultureId);
  const list = brokenProvinces(world, nation, cultureId);
  const tiles = [];
  for (const province of list) {
    for (const idx of province.tileIdx ?? []) {
      const tile = world.tiles[idx];
      if (!tile) continue;
      nation.tiles = Math.max(0, nation.tiles - 1);
      tile.owner = heir;
      tile.controller = heir;
      tile.heldSince = game.turns?.turn ?? 0;
      if (tile.city) tile.city.nationId = heir;
      world.nations[heir].tiles++;
      tiles.push(tile);
    }
    province.owner = heir;
    nation.provinces = Math.max(0, (nation.provinces ?? 0) - 1);
    world.nations[heir].provinces = (world.nations[heir].provinces ?? 0) + 1;
    // Yeni sahip kendi halkini devraliyor: sorun onunla birlikte gitmez.
    province.econ.control = 55;
    province.econ.unrest = CULTURE.AFTER_REVOLT_UNREST;
    province.econ.revoltWeeks = 0;
    province.econ.brokenSince = null;
    province.econ.brokenCulture = null;
  }
  // Iade sohreti ODER: ilhak sohretinin tersi (bkz. infamy.js INFAMY_ANNEX).
  addInfamy(nation, -list.length * 2);
  world.cultureReleases = (world.cultureReleases ?? 0) + list.length;
  game.renderer?.invalidateTiles(tiles);
  const name = world.cultures?.[cultureId]?.name ?? 'a foreign people';
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `release-${cultureId}`,
      title: `${list.length} province${list.length > 1 ? 's' : ''} handed to the ${name}`,
      detail: `Their kin in ${world.nations[heir].name} now rule them. We lose the`
        + ' land and the trouble with it; the world thinks better of us.',
    });
  }
  game.emit?.('provinces', null);
  return list.length;
}

/** Surgunu engelleyen ne varsa. Bos dizi = surulebilir. */
export function expelBlockers(world, nation, cultureId) {
  if (!brokenProvinces(world, nation, cultureId).length) {
    return ['No broken province of theirs to clear.'];
  }
  if (cultureId === nation.culture) return ['They are our own people.'];
  if (isAccepted(nation, cultureId)) return ['They are an accepted culture of this state.'];
  return [];
}

/**
 * SURGUN. Halki butun topraklarimizdan cikarir: paylari silinir, o paya
 * denk gelen nufus GIDER. Kume temizlenir ama bos kalir — surgun toprak
 * kazandirmaz, yalniz sorunu kaldirir.
 *
 * Bedeli sohrettir ve surulen insan sayisiyla olculur. Kucuk bir halki
 * surmek de ucuz degildir (EXPEL_INFAMY_MIN): olcek degil, eylem cezalidir.
 */
export function expelCulture(game, nation, cultureId) {
  const world = game.world;
  if (expelBlockers(world, nation, cultureId).length) return 0;
  let expelled = 0;
  const recolored = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const rows = province.cultures;
    if (!rows?.length) continue;
    const row = rows.find((item) => item.id === cultureId);
    if (!row || row.share <= 0) continue;
    const gone = Math.round((province.econ.population ?? 0) * row.share);
    expelled += gone;
    province.econ.population = Math.max(0, (province.econ.population ?? 0) - gone);
    const kalan = rows.filter((item) => item.id !== cultureId);
    if (!kalan.length) {
      // Bastan asagi o halkin oldugu kume bos kalir: yonetenin kulturu yazilir.
      province.cultures = [{ id: nation.culture, share: 1 }];
    } else {
      const total = kalan.reduce((sum, item) => sum + item.share, 0);
      province.cultures = kalan.map((item) => ({ id: item.id, share: item.share / total }));
    }
    province.cultures.sort((a, b) => b.share - a.share || a.id - b.id);
    const before = province.culture;
    province.culture = province.cultures[0]?.id ?? before;
    if (province.culture !== before) {
      for (const idx of province.tileIdx ?? []) world.tiles[idx].culture = province.culture;
      recolored.push(province);
    }
    // Halk gitti, ana yurt kaydi da gitti: burasi artik kimsenin yurdu degil.
    if (province.homeland === cultureId) province.homeland = -1;
    province.econ.brokenSince = null;
    province.econ.brokenCulture = null;
    province.econ.unrest = Math.min(province.econ.unrest ?? 0, CULTURE.AFTER_REVOLT_UNREST);
  }
  if (!expelled) return 0;
  const cost = Math.max(
    CULTURE.EXPEL_INFAMY_MIN, expelled / CULTURE.EXPEL_INFAMY_PER_POP,
  );
  addInfamy(nation, cost);
  world.cultureExpulsions = (world.cultureExpulsions ?? 0) + 1;
  if (recolored.length) {
    const tiles = [];
    for (const province of recolored) {
      for (const idx of province.tileIdx ?? []) tiles.push(world.tiles[idx]);
    }
    game.renderer?.invalidateTiles(tiles.filter(Boolean));
  }
  const name = world.cultures?.[cultureId]?.name ?? 'a foreign people';
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `expel-${cultureId}`,
      title: `The ${name} are driven out`,
      detail: `${Math.round(expelled / POPULATION_SCALE).toLocaleString('en-US')} people`
        + ' are gone and their provinces are quiet — and empty. The world has'
        + ' taken note of what we did.',
    });
  }
  game.emit?.('provinces', null);
  return expelled;
}

/**
 * YZ karari: kirik kume ne olacak? Oyuncu ile AYNI kapilardan gecer.
 * Sira ucuzdan pahaliya: ortak et, birak, sur. Surgun son caredir ve
 * ancak kume yillardir kirikken denenir.
 */
export function manageBrokenProvinces(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if ((turn + nation.id) % 26 !== 0) return null;
  const groups = brokenByCulture(world, nation);
  if (!groups.length) return null;
  for (const group of groups) {
    if (!group.accept.length && acceptCulture(game, nation, group.id)) {
      return { action: 'accept', culture: group.id };
    }
  }
  for (const group of groups) {
    if (!group.release.length && releaseToKin(game, nation, group.id)) {
      return { action: 'release', culture: group.id };
    }
  }
  // Surgun: yalniz uzun suredir kirik ve baska kapisi olmayan halk icin.
  for (const group of groups) {
    if (group.expel.length) continue;
    const eldest = Math.min(...group.provinces.map((p) => p.econ.brokenSince ?? turn));
    if (turn - eldest < CULTURE.REVOLT_COOLDOWN * 2) continue;
    if (expelCulture(game, nation, group.id)) return { action: 'expel', culture: group.id };
  }
  return null;
}

/**
 * YZ karari. Oyuncu ile ayni kapidan gecer. Kural basit ve savunulabilir:
 * huzursuzlugun en buyuk kaynagi olan halki, esigi asiyorsa kabul et.
 * Yilda bir, ulus basina farkli haftada.
 */
export function manageAcceptance(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if ((turn + nation.id) % 52 !== 0) return false;
  const mix = cultureMix(world, nation);
  const candidate = mix.find((row) => !row.accepted
    && row.share >= CULTURE.ACCEPT_MIN_SHARE * 1.5);
  if (!candidate) return false;
  // Kabul, isyan riski gercekse alinir: sakin bir imparatorluk kimseyi
  // ortak etmez (bedeli var, kazanci soyut).
  let pressure = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    if ((province.econ.unrest ?? 0) < CULTURE.REVOLT_UNREST - 2) continue;
    if (province.culture === candidate.id) pressure++;
  }
  if (pressure < 2) return false;
  return acceptCulture(game, nation, candidate.id);
}

/** Ulusun huzursuzluk kesiti — ekran ve denetim icin. */
export function unrestSummary(world, nation) {
  let weighted = 0;
  let people = 0;
  let worst = null;
  let boiling = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const size = Math.max(0, province.econ.population ?? 0);
    const unrest = province.econ.unrest ?? 0;
    weighted += unrest * size;
    people += size;
    if (unrest >= CULTURE.REVOLT_UNREST) boiling++;
    if (!worst || unrest > worst.unrest) {
      worst = { id: province.id, unrest, weeks: province.econ.revoltWeeks ?? 0 };
    }
  }
  return {
    unrest: people > 0 ? weighted / people : 0,
    boiling,
    worst,
    accepted: acceptedCultures(nation).length,
  };
}
