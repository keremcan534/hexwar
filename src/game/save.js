// Kayıt/yükleme. 300 turluk oyun tek oturumda bitmediği için zorunlu.
//
// Kaydın içine arazi **yazılmaz**: dünya seed'den birebir yeniden üretilebiliyor
// (aynı seed -> aynı yükseklik, iklim, kültür). Yalnız oyun sırasında değişen
// şeyler saklanır. Bu, kaydı küçük tutar ama bir bedeli var: worldgen
// değişirse eski kayıtlar geçersizleşir, o yüzden SAVE_VERSION var.

import {
  createUnit, refreshArmy, resetUnitIds, resolveTypeId, unitIdCursor,
} from './units.js';
import { createCity, englishCityName } from './cities.js';
import { ensureEconomy } from './economy.js';
import { ensureCommand, ensureCommandOptions } from './command.js';
import { ensureTraining } from './recruitment.js';
import { ensureBattles } from './battles.js';
import { ensureProvinces, refreshProvinceOwner } from './provinces.js';
import { ensurePolitics } from './politics.js';
import { refreshReformModifiers } from './reforms.js';
import { ensureConstruction, migrateConstructionV14 } from './construction.js';
import { ensureDelegation, restoreDelegation } from './delegation.js';

// Ordu sistemi yeniden yazıldı: cephe artık saklanmıyor (sınırdan türetiliyor),
// komuta tek listede toplandı ve muharebe kare anahtarlı oldu. v8'de kaldırılan
// yol ve şehir binası katmanları kare kaydından da çıktı.
// 9: silindirik sarmal dünya — worldgen çıktısı (falloff + periyodik gürültü)
// değişti, eski kayıtların dünyası aynı seed'den artık üretilemez.
// 10: ekonomi 2-7 hexlik province kümelerine taşındı — kare satırından
// province payload'ı çıktı, kümeler kendi bölümünde saklanıyor.
// 11: makro dünya şablonu — kıta iskeleti, bölge bazlı province boyları ve
// arketip ülke yerleşimi worldgen çıktısını kökten değiştirdi.
// 12: fiziksel coğrafya yeniden yazıldı (geography.js: omurga tabanlı kıtalar)
// ve standart dünya 160x96'ya sabitlendi — aynı seed başka bir dünya üretir.
// 13: alay artık anında belirmiyor, eğitim kuyruğuna giriyor (nation.training)
// ve subayların bir kolu var (general.branch). İkisi de türetilemez durumdur:
// yazılmazsa yüklemede sipariş edilmiş ordu ve amiraller buhar olur.
// 14: (önceki sürüm) dört yerleşik bina tipi.
// 15: bina donusumu — Construction Sector / University / Administration yerlesik
// binalari ulusal kurumlara cevrildi (nation.construction.capacity). v14
// kayitlari migrateConstructionV14 ile KAYIPSIZ yuklenir (bkz. construction.js).
// 16: butce yeniden yapilandirildi. economy.taxes -> taxRate,
// militaryWages/militaryProcurement -> armyFunding, adminFunding ve
// subsidyPolicy kaldirildi, social.health refaha katildi, defter satirlari
// yeniden adlandirildi (treasury.js LEDGER_LINES) ve on bir *Gold cizik alani
// silindi. Eski kayitlar TEMIZ REDDEDILIR — deneysel dalda karmasik goc
// yazmak, sessizce bozuk bir defterden iyidir.
// 17: vergi tek orandan UC SINIF ORANINA acildi. economy.taxRate ->
// economy.tax = { lower, middle, upper }. v16 kayitlari KAYIPSIZ yuklenir:
// eski tek oran, o kaydin hukumet yapisindaki agirliklarla uc orana bolunur
// (bkz. economy.js ensure + taxWeightsFor), yani yuklenen ulke ayni vergiyi
// ayni siniflardan toplamaya devam eder.
// 18: NUFUS OLCEGI. Butun nufus kaynaklari ve nufusa oranli butun sabitler
// POPULATION_SCALE ile carpildi (bkz. game/populationScale.js). Kayit
// dosyasindaki her nufus alani (province, sinif, alay insan gucu, tesis
// kadrosu, RGO kotasi) ESKI olcektedir; goc yazilsa on yerde bir alani
// atlamak yarim goc etmis bir kayit birakirdi ve yarim kayit reddedilen
// kayittan daha kotudur. v17 bilerek gocurulmez.
// 19: ASKER ARTIK NUFUSTAN SILINMIYOR. Askere alma province nufusundan adam
// cikariyordu; province.econ artik `soldiers` sayaciyla yalnizca "silah
// altinda" isaretler. v18 kayitlarinda nufus askerleri ICERMEZ ve `soldiers`
// alani yoktur; yuklenirse ulke nufusu oldugundan az gorunurdu.
export const SAVE_VERSION = 19;
/** Gocu bilinen eski surumler: deserialize bunlari da kabul eder. */
const MIGRATABLE_VERSIONS = new Set([14, 16]);
const STORAGE_KEY = 'hexwar.save';

/**
 * Bölümleme parmak izi. Kayıt, kümelerin seed'den birebir yeniden
 * üretileceğine güvenir; worldgen kayarsa econ satırları yanlış kümelere
 * oturur. Checksum uyuşmazsa yükleme sessiz bozulma yerine temiz reddeder.
 */
function partitionChecksum(world) {
  let h = 2166136261 >>> 0;
  for (const province of world.provinces ?? []) {
    h = Math.imul(h ^ province.id, 16777619) >>> 0;
    for (const idx of province.tileIdx) h = Math.imul(h ^ idx, 16777619) >>> 0;
  }
  return h;
}

/** Ulusun tur içinde değişen alanları. */
// `mobilization` kucuk bir nesnedir ({active, since, target}); yazilmazsa
// yuklenen oyunda seferber ordu "duzenli" sayilir ve baristа hic terhis olmaz.
const NATION_FIELDS = ['gold', 'infamy', 'alive', 'debt', 'mobilization'];

export function serialize(game) {
  const world = game.world;
  const turns = game.turns;

  // Sahiplik/kültür/işgal: yalnız üretilenden **farklı** olan kareler yazılır.
  // Küme ekonomisi kare satırında DEĞİL kendi bölümünde durur (aşağıda).
  const tiles = [];
  world.forEach((tile, index) => {
    if (
      tile.owner < 0
      && (tile.controller ?? tile.owner) === tile.owner
      && !tile.heldSince
      && tile.culture === tile.baseCulture
    ) return;
    tiles.push([
      index, tile.owner, tile.culture, tile.heldSince ?? 0,
      tile.controller ?? tile.owner,
    ]);
  });

  // Küme ekonomileri. Sanayi alanları da yazılır: runFactories her hafta
  // tazeler ama yüklemeden sonraki İLK hafta gelişim baskısı bu değerleri
  // okur — sıfırla başlatmak kaydet-yükle simülasyonunu dallandırıyordu.
  const provinces = (world.provinces ?? []).map((province) => (
    province.econ ? [province.id, { ...province.econ }] : null
  )).filter(Boolean);

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed: world.seed,
    options: world.genOptions ?? {},
    provinceChecksum: partitionChecksum(world),
    provinces,
    turn: turns.turn,
    playerNation: turns.playerNation,
    // Saatin gun sayaci. Yazilmazsa yuklemeden sonra takvim hafta icinde geri
    // kayar (bkz. hud.js gameDate notu); tur tabani artik korusa da dogru
    // gunu geri getirmenin tek yolu bunu kaydetmektir.
    clockDay: game?.clock?.day ?? 0,
    // Tur zarinin durumu. Yazilmazsa yukleme zari basa sarar; savas ilanlari,
    // muharebe zarlari ve koalisyon kontrolleri bastan baska sonuc verir.
    rngState: turns.rng.state(),
    log: turns.log.slice(0, 20),
    market: world.market,
    battleSystem: {
      nextId: world.battleSystem?.nextId ?? 1,
      // Aktif muharebeler ARTIK kayda girer. Eskiden bilerek dusuruluyordu
      // ("yuklemede iptal edilir") ve bu, muharebe ortasinda alinan kaydi
      // kesintisiz kosudan DALLANDIRIYORDU (save-audit bunu yakaladi: ayni
      // tohumda 100 hafta sonra hazine/fiyat farki). Muharebe nesnesi saf
      // veridir (kimlikler + sayaclar); birim kimlikleri kayittan aynen
      // dondugu icin uyelik yeniden baglanabilir (bkz. deserialize).
      battles: (world.battleSystem?.battles ?? []).map((battle) => ({ ...battle })),
    },
    commandSystem: { nextId: world.commandSystem?.nextId ?? 1 },
    // Birim kimlik sayaci (bkz. units.unitIdCursor).
    unitSystem: { nextId: unitIdCursor() },
    tiles,
    nations: world.nations.map((n) => {
      const out = {
        id: n.id, economy: n.economy, politics: n.politics,
        // Arastirma: biriken puan + tamamlanan teknolojiler. Kayit disi
        // kalirsa oyuncu yuzyillik teknoloji birikimini yuklemede kaybeder.
        research: n.research ?? null,
        // Haftalik butce uretim fazinda hesaplanir; yuklemede hafta SONU
        // durumundan yeniden kurmak baska bir sayi veriyordu (olculdu: bir
        // ulkede net erzak -3'e karsi -4) ve isci agirliklari o sayiyi
        // okudugu icin ilk hafta baska kareler isleniyordu (save-audit).
        budget: n.budget ?? null,
        construction: ensureConstruction(n),
        // Ulusal vakayiname ve olay durum makinesi. Turetilemez veri:
        // yazilmazsa yuklemeden sonra oyun ayni borcu/rejimi ikinci kez
        // duyurur ve kampanyanin tarihi silinir (bkz. chronicle.js).
        chronicle: (n.chronicle ?? []).map((entry) => ({ ...entry })),
        events: n.events
          ? {
            ...n.events,
            said: { ...(n.events.said ?? {}) },
            atWarWith: { ...(n.events.atWarWith ?? {}) },
          }
          : null,
        // Kampanya sayaclari: kapanis ekraninin savas/zirve/borc satirlari.
        tally: n.tally ? { ...n.tally } : null,
        // Acilis kesiti: kapanis ekraninin "nereden nereye" olcusu. Bir kez
        // yazilir; kayit disi kalirsa yuzyilin baslangici kaybolur.
        opening: n.opening ? { ...n.opening } : null,
        // Diplomatik kimlik: rakip + sinirli hafiza. Kayit disi kalirsa
        // yukleme sonrasi rakipler tazelenene kadar bos gorunur ve "kime
        // toprak kaybetti" tarihi silinirdi.
        rivalId: n.rivalId ?? null,
        memory: (n.memory ?? []).map((entry) => ({ ...entry })),
        rallyPoint: n.rallyPoint ?? null,
        // AUTO anahtarlari ve her alanin son otomatik eylemi. Turetilemez
        // veri: yazilmazsa yuklenen oyun butun devirleri kapali baslatir ve
        // oyuncu devrettigini sandigi bakanligi sessizce geri alir.
        delegation: ensureDelegation(n),
        // Eğitim kuyruğu: ödenmiş sipariş. Kayıt dışı kalırsa oyuncu parasını
        // ve teçhizatını yükleme ekranında kaybeder.
        training: {
          nextId: ensureTraining(n).nextId,
          queue: ensureTraining(n).queue.map((item) => ({
            ...item, equipment: { ...item.equipment },
          })),
        },
        command: { ...ensureCommandOptions(n) },
        // Barış masasında imzalanan süreli şartlar. Türetilebilir veri değil:
        // yazılmazsa tazminat, vassallık ve silahsızlanma yüklemede buhar olur.
        treaties: (n.treaties ?? []).map((t) => ({ ...t })),
        // Cephe kareleri yazılmaz: sınırdan türetilen veridir, ilk haftalık
        // işleyişte kendiliğinden geri gelir.
        generals: (n.generals ?? []).map(({ front, ...g }) => ({
          ...g,
          traits: [...g.traits],
          divisions: [...(g.divisions ?? [])],
        })),
      };
      for (const f of NATION_FIELDS) out[f] = n[f];
      return out;
    }),
    relations: world.relations.map((row, a) => row.map((rec, b) => (
      // Dorduncu alan savasin kayip defteri: warscore'un yipranma bileseni
      // ona bakar, kaydedilmezse yuklenen savas "hic kan dokulmemis" olur.
      // Besinci/altinci alan: tekrarlanan savas sayaci (repeatScale/ateskes
      // suresi buna bakar) ve savas-ilerleme zirveleri (stall olcumu).
      // Ikisi de dusurulunce yuklenen oyunda kazanan MASAYA BASKA HAFTA
      // oturuyordu — olculdu: +77. haftada tek seferlik £229 tazminat farki,
      // kaydet-yukle dallanmasinin son kaynagi buydu.
      // Yedinci alan: savas hedefleri (bkz. peace.js warGoalOf). Yazilmazsa
      // yuklenen savasin masasi "bu savas neydi" sorusunu cevaplayamaz.
      // Sekizinci/dokuzuncu/onuncu alan: ultimatom (savasin baslayacagi hafta),
      // ilan sebebi ve saldirgan. Yazilmazsa yuklenen ultimatom asla savasa
      // donusmez (warAt yok -> 0 -> hemen baslar) ve masa kimin actigini bilmez.
      b <= a || !rec ? null : [rec.state, rec.since, rec.truceUntil ?? 0, rec.losses ?? null,
        rec.wars ?? 0, rec.peaks ?? null, rec.goals ?? null, rec.warAt ?? 0,
        rec.reason ?? null, rec.aggressor ?? null]
    ))),
    cities: world.cities.map((c) => ({
      name: c.name,
      q: c.tile.q,
      r: c.tile.r,
      nationId: c.nationId,
      level: c.level,
      pop: c.pop,
      pops: c.pops,
      // Islenen kareler ve buyume sayaci kayda girer. Yuklemede yeniden
      // secilen kareler kesintisiz kosudan farkli cikiyordu (olculdu: 21 kare
      // yuklemenin ilk haftasinda baska sehre calisiyordu, bir hafta sonra
      // 25 ulkenin hazinesi ayrismisti); buyume sayaci sifirlaninca da
      // sehirler yuklemeden sonra bir donem gec buyuyordu.
      worked: (c.worked ?? []).map((t) => [t.q, t.r]),
      growth: c.growth ?? 0,
      manualWorkers: c.manualWorkers === true,
    })),
    units: world.units.map((u) => ({
      id: u.id,
      type: u.type.id,
      nationId: u.nationId,
      q: u.tile.q,
      r: u.tile.r,
      // Ayni karedeki yigin sirasi: tile.unit = yiginin ilk uyesi; savunmayi
      // ve ekranda gorunen tumeni o belirler. Yazilmazsa yukleme kimlik
      // sirasina dizer ve kesintisiz kosudan ayrilir (olculdu: 9 karede).
      stack: Math.max(0, (u.tile.units ?? []).indexOf(u)),
      hp: u.hp,
      maxHp: u.maxHp,
      path: u.path?.map((tile) => ({ q: tile.q, r: tile.r })) ?? null,
      progress: u.progress ?? 0,
      // Yeniden-yol sayaci. Turetilemez ve KAYIT DISI KALIRSA OYUNU
      // DALLANDIRIR: yuklenen birim taze bir yeniden-hesap butcesiyle
      // baslar, kapali yolu tekrar dener ve kesintisiz kosunun secmedigi
      // rotayi (orn. deniz gecisi) secer. Olculdu (tohum CO-8, 5. ulke,
      // 181. hafta): yuklenmis kosuda bir kara tumeni denize biniyor ve
      // haftalik konvoy tedariki £27 fazla yaziliyordu.
      reroutes: u.reroutes ?? 0,
      embarked: u.embarked,
      order: u.order
        ? { type: u.order.type, tq: u.order.target?.q, tr: u.order.target?.r }
        : null,
      regiments: u.regiments?.map((regiment) => ({ ...regiment })) ?? null,
      organization: u.organization,
      morale: u.morale,
      retreatUntil: u.retreatUntil ?? 0,
      attackReadyAt: u.attackReadyAt ?? 0,
      entrenchment: u.entrenchment ?? 0,
      // Cephede tuttuğu province: yüklemede tümenler yerlerinde kalsın.
      post: u.post ? { ...u.post } : null,
    })),
  };
}

/**
 * Kaydı oyuna geri yükler. Dünyayı seed'den yeniden üretip üstüne durumu yazar.
 * @returns {boolean} başarılı mı
 */
export function deserialize(game, data) {
  // Rework sirasinda dunya semasi degisti; eski surumler guvenle acilamaz.
  if (!data || (data.version !== SAVE_VERSION && !MIGRATABLE_VERSIONS.has(data.version))) {
    return false;
  }

  // 1) Aynı seed ve ayarlarla dünyayı yeniden kur (arazi, iklim, kültür aynı).
  game.newWorld(data.seed, data.options);
  const world = game.world;
  const turns = game.turns;

  // Bölümleme parmak izi tutmuyorsa worldgen kaymış demektir: econ satırları
  // yanlış kümelere oturacağına yükleme temiz reddedilir.
  if (Number.isFinite(data.provinceChecksum)
    && data.provinceChecksum !== partitionChecksum(world)) return false;

  // 2) Üretimden gelen durumu temizle: kayıt tam durumu taşır.
  world.units.length = 0;
  world.cities.length = 0;
  world.forEach((t) => {
    t.unit = null;
    t.units = [];
    t.city = null;
    t.workedBy = null;
    t.owner = -1;
    t.controller = -1;
  });

  // 3) Kareler
  for (const [index, owner, culture, heldSince, controller = owner] of data.tiles) {
    const tile = world.tiles[index];
    if (!tile) continue;
    tile.owner = owner;
    tile.controller = Number.isInteger(controller) ? controller : owner;
    tile.culture = culture;
    tile.heldSince = heldSince;
  }

  // 3b) Küme ekonomileri: taze üretilen econ'un üzerine kayıttaki durum yazılır.
  // Paylaşılan referans korunur — üye karelerin tile.province'i aynı nesne.
  for (const [id, econ] of data.provinces ?? []) {
    const province = world.provinces?.[id];
    if (!province?.econ || !econ) continue;
    Object.assign(province.econ, econ);
  }
  // Hukuki sahip üye çoğunluğundan: kayıt savaşın ortasında alınmış olabilir.
  for (const province of world.provinces ?? []) refreshProvinceOwner(world, province);

  // 4) Uluslar
  for (const saved of data.nations) {
    const nation = world.nations[saved.id];
    if (!nation) continue;
    for (const f of NATION_FIELDS) nation[f] = saved[f];
    nation.economy = saved.economy ?? nation.economy;
    // Politics eski kayıtlarda yoktur. Başlangıçta üretilen turn-1 verisini
    // taşımak yerine null bırakılır; ensurePolitics gerçek kayıt turuna göre
    // partileri ve bir sonraki seçimi yeniden kurar.
    nation.politics = saved.politics ?? null;
    // Eski kayitta yok: ensureResearch bos kayitla kurar (teknoloji sifirdan
    // baslar, takvim kapisi zaten calismaya devam eder).
    nation.research = saved.research ?? null;
    nation.construction = saved.construction ?? null;
    // v14 gocu ensure'dan ONCE: ensure eski bina tiplerini tanimayip atardi,
    // goc ham kayittan sayar (bkz. construction.migrateConstructionV14).
    if (data.version === 14 && nation.construction) migrateConstructionV14(nation);
    ensureConstruction(nation);
    // Eski kayitta yoktur: bos tarih ve bos durum makinesiyle baslar. Durum
    // makinesi bos oldugunda ilk hafta mevcut durumu "baslangic" sayar,
    // dolayisiyla yuklemeden sonra sahte olay uretmez.
    nation.chronicle = (saved.chronicle ?? []).map((entry) => ({ ...entry }));
    nation.events = saved.events
      ? { ...saved.events, said: { ...(saved.events.said ?? {}) } }
      : null;
    nation.opening = saved.opening ? { ...saved.opening } : null;
    nation.rivalId = saved.rivalId ?? null;
    nation.memory = (saved.memory ?? []).map((entry) => ({ ...entry }));
    nation.tally = saved.tally ? { ...saved.tally } : null;
    nation.rallyPoint = saved.rallyPoint ?? null;
    // Eski kayitta yok: butun alanlar kapali baslar (guvenli varsayilan).
    restoreDelegation(nation, saved.delegation);
    nation.budget = saved.budget ? JSON.parse(JSON.stringify(saved.budget)) : null;
    nation.treaties = (saved.treaties ?? []).map((t) => ({ ...t }));
    nation.training = saved.training
      ? {
        nextId: saved.training.nextId ?? 1,
        queue: (saved.training.queue ?? []).map((item) => ({
          ...item, equipment: { ...(item.equipment ?? {}) },
        })),
      }
      : null;
    ensureTraining(nation);
    nation.command = saved.command ? { ...saved.command } : null;
    ensureCommandOptions(nation);
    nation.generals = (saved.generals ?? []).map((g) => ({
      ...g,
      traits: [...(g.traits ?? [])],
      stance: g.stance ?? 'hold',
      target: g.target ?? null,
      planning: g.planning ?? 0,
      // Cephe kareleri kaydedilmez: ilk haftalik islemede sinirdan turetilir.
      front: [],
    }));
  }

  // 5) İlişkiler — simetrik nesne paylaşımı korunmalı.
  for (let a = 0; a < data.relations.length; a++) {
    for (let b = a + 1; b < data.relations.length; b++) {
      const entry = data.relations[a][b];
      if (!entry) continue;
      const rec = { state: entry[0], since: entry[1], truceUntil: entry[2] };
      if (entry[3]) rec.losses = { ...entry[3] };
      if (entry[4]) rec.wars = entry[4];
      if (entry[5]) rec.peaks = { ...entry[5] };
      if (entry[6]) rec.goals = { ...entry[6] };
      if (entry[7]) rec.warAt = entry[7];
      if (entry[8]) rec.reason = entry[8];
      if (entry[9] != null) rec.aggressor = entry[9];
      world.relations[a][b] = rec;
      world.relations[b][a] = rec;
    }
  }

  // 6) Şehirler
  for (const saved of data.cities) {
    const tile = world.get(saved.q, saved.r);
    if (!tile) continue;
    const city = createCity(
      world, tile, saved.nationId, englishCityName(saved.name), saved.level, saved.pop,
    );
    city.pops = { ...saved.pops };
    city.manualWorkers = saved.manualWorkers === true;
    city.growth = saved.growth ?? 0;
    // Eski kayitta kare listesi yok: ilk haftalik dagitim yeniden secer.
    city.worked = (saved.worked ?? [])
      .map(([q, r]) => world.get(q, r))
      .filter((t) => t && t.owner === city.nationId && !t.workedBy);
    for (const t of city.worked) t.workedBy = city;
  }

  // 7) Birimler
  const pendingOrders = [];
  const unitIds = new Map();
  for (const saved of data.units) {
    const tile = world.get(saved.q, saved.r);
    if (!tile) continue;
    // Kaldirilan birim tipleri (örn. Scout) yeni karşılıklarına çevrilir.
    const unit = createUnit(resolveTypeId(saved.type), saved.nationId, tile, world.nations[saved.nationId]);
    if (saved.maxHp) unit.maxHp = saved.maxHp;
    unit.hp = saved.hp;
    unit.path = saved.path?.map((step) => world.get(step.q, step.r)).filter(Boolean) ?? null;
    if (!unit.path?.length) unit.path = null;
    unit.progress = saved.progress ?? 0;
    unit.reroutes = saved.reroutes ?? 0;
    unit.embarked = saved.embarked;
    if (saved.regiments?.length) {
      unit.regiments = saved.regiments.map((regiment) => ({
        ...regiment,
        // Old starting armies were not deducted from province population.
        // An explicit empty draw list prevents disbanding them from creating
        // thousands of residents out of thin air.
        draws: Array.isArray(regiment.draws)
          ? regiment.draws.map((draw) => ({ ...draw })) : [],
      }));
      refreshArmy(unit);
    }
    unit.organization = saved.organization ?? saved.morale ?? unit.organization;
    unit.morale = unit.organization;
    unit.retreatUntil = saved.retreatUntil ?? 0;
    unit.attackReadyAt = saved.attackReadyAt ?? 0;
    unit.entrenchment = Math.max(0, Math.min(0.35, saved.entrenchment ?? 0));
    unit.post = saved.post ? { ...saved.post } : null;
    // Kimlik kayittan geri yazilir. Yeniden uretilen kimlikler cephe temposunu
    // kaydiriyordu: yuklenen oyun kesintisiz devam eden oyundan ayriliyordu
    // (olculdu: 100 hafta sonra nufus, birim, sehir ve savaslar farkli).
    if (saved.id != null) unit.id = saved.id;
    world.units.push(unit);
    if (saved.id != null) unitIds.set(saved.id, unit.id);
    if (saved.order) pendingOrders.push([unit, saved.order]);
  }
  // Yigin sirasi kayittan gelir: placeUnit yukleme sirasina (kimlik) dizmisti.
  const stackOf = new Map(data.units.filter((s) => s.id != null).map((s) => [s.id, s.stack ?? 0]));
  world.forEach((tile) => {
    if (!Array.isArray(tile.units) || tile.units.length < 2) return;
    tile.units.sort((a, b) => (stackOf.get(a.id) ?? 0) - (stackOf.get(b.id) ?? 0));
    tile.unit = tile.units[0] ?? null;
  });
  // Sayac kayittaki en buyuk kimligin uzerine kurulur ki yeni alaylar
  // yuklenmis olanlarla carpismasin.
  resetUnitIds(Math.max(
    data.unitSystem?.nextId ?? 0,
    world.units.reduce((max, unit) => Math.max(max, unit.id), 0) + 1,
  ));
  // Emirler birimler yerleştikten sonra: hedef karesi çözülebilsin.
  for (const [unit, order] of pendingOrders) {
    const target = order.tq === undefined ? null : world.get(order.tq, order.tr);
    unit.order = { type: order.type, target, blocked: 0 };
  }

  // Toprak sayaci kayitta tutulmaz ve turetilebilir bir sayidir; yeniden
  // sayilmazsa dunya uretiminden gelen 1. tur degeri kalir (olculdu: gercek
  // 126 kareye karsi sayacta 61). Bu sayac YZ'nin ordu/sehir hedefini ve
  // hegemonya puanini besledigi icin sessizce oyunun kazananini degistirir.
  for (const nation of world.nations) nation.tiles = 0;
  world.forEach((tile) => {
    if (tile.owner >= 0 && world.nations[tile.owner]) world.nations[tile.owner].tiles++;
  });

  // 8) Tur durumu
  turns.turn = data.turn;
  world.turn = data.turn;
  // Saatin gun sayaci geri gelmezse takvim hafta icinde geri kayar
  // (bkz. serialize `clockDay` ve hud.js gameDate).
  if (game.clock) game.clock.day = data.clockDay ?? (data.turn - 1) * 7;
  turns.playerNation = data.playerNation;
  // Eski kayitlarda bu alan yok: o zaman zar taze baslar, yani bugunku davranis.
  if (Number.isFinite(data.rngState)) turns.rng.seedState(data.rngState);
  turns.log = data.log ?? [];
  ensureEconomy(world);
  ensurePolitics(world);
  ensureProvinces(world);
  // Yasa carpanlari WeakMap'te yasar, kayda girmez (bkz. reforms.js
  // modsByNation). Yuklemede bos kalinca tasra fazi ilk hafta NOTR tavani
  // okuyordu (olculdu: azinlik tavani 70 olan province'te sadakat 70'te
  // duracakken 70.55'e cikti) ve ekonomi oradan ayriliyordu. Saf yeniden
  // hesap: sayaclara dokunmaz, sicak kosuyla ayni tabloyu kurar.
  for (const nation of world.nations) {
    if (nation.alive && nation.politics) refreshReformModifiers(nation);
  }
  if (data.market) {
    world.market = data.market;
    ensureEconomy(world);
  }
  ensureBattles(world);
  if (data.battleSystem) {
    world.battleSystem = data.battleSystem;
    // Muharebe uyeligini yeniden bagla: birimler kimlikleriyle dondu, ama
    // unit.battleId kayitta tasinmiyor. Kayipsiz kural: iki tarafi da hala
    // var olan muharebe surer, tek tarafi kalmayan dusurulur.
    const byId = new Map(world.units.map((unit) => [unit.id, unit]));
    // Kimlikler kayittakiyle AYNI DEGIL: createUnit surec sayacindan yeni
    // kimlik verir, `unitIds` eskiyi yeniye baglar (generaller icin asagida
    // ayni tablo kullaniliyor). Muharebe uyeligi ham kimlikle bakiyordu ve
    // dizide bosluk olunca (seferberlikle kurulup dagitilan alaylar) muharebe
    // yuklemede dusuyordu (save-audit: kayit 2, yukleme 1).
    const remap = (id) => unitIds.get(id) ?? id;
    world.battleSystem.battles = (world.battleSystem.battles ?? []).filter((battle) => {
      const attackers = (battle.attackers ?? []).map(remap);
      const defenders = (battle.defenders ?? []).map(remap);
      // Uyesi kayitta olmayan muharebe bozuktur, dusurulur. TEK TARAFI BOS
      // muharebe ise dusurulmez: canli simulasyon da onu bir hafta tasir ve
      // runBattles kapatir; yuklemede silmek kesintisiz kosudan dallandiriyordu
      // (save-audit: kayit 2 muharebe, yukleme 1).
      if (!attackers.every((id) => byId.has(id)) || !defenders.every((id) => byId.has(id))) return false;
      battle.attackers = attackers;
      battle.defenders = defenders;
      for (const id of [...battle.attackers, ...battle.defenders]) {
        byId.get(id).battleId = battle.id;
      }
      return true;
    });
  }
  if (data.commandSystem) world.commandSystem = data.commandSystem;
  else if (data.generalSystem) world.commandSystem = { ...data.generalSystem };
  ensureCommand(world);
  // createUnit kimlikleri süreç boyunca artar. Kayıttaki komuta bağlantılarını
  // yeni kimliklere taşımazsak yüklenen bütün komuta zinciri sessizce kopar.
  for (const nation of world.nations) {
    for (const general of nation.generals ?? []) {
      general.divisions = (general.divisions ?? [])
        .map((id) => unitIds.get(id))
        .filter((id) => id != null);
    }
  }
  game.setSpeed(0);

  game.selected = null;
  game.activeGeneral = null;
  game.selectUnit(null);
  // Eski kayitta kare listesi yoksa dagitim yeniden yapilir (tek secenek).
  game.recomputeEconomy({
    keepWorkers: (data.cities ?? []).some((c) => Array.isArray(c.worked)),
    keepBudgets: data.nations.some((n) => n.budget != null),
  });
  game.renderer.invalidateCache();
  game.emit('world', world);
  game.emit('turn', turns.turn);
  game.requestRender();
  return true;
}

export function saveToStorage(game, slot = STORAGE_KEY) {
  try {
    localStorage.setItem(slot, JSON.stringify(serialize(game)));
    return true;
  } catch (err) {
    // Kota dolabilir ya da gizli sekmede depolama kapalı olabilir.
    return false;
  }
}

export function loadFromStorage(game, slot = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(slot);
    if (!raw) return false;
    return deserialize(game, JSON.parse(raw));
  } catch (err) {
    return false;
  }
}


export function savedInfo(slot = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(slot);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { seed: data.seed, turn: data.turn, savedAt: data.savedAt };
  } catch (err) {
    return null;
  }
}
