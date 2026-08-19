// Ulusal vakayiname ve olay siniflandirmasi.
//
// Simulasyon zaten tarih uretiyor: borc, temerrut, rejim degisimi, baskent
// kaybi. Bu katman o tarihi YARATMAZ, yalnizca kayda gecirir ve onemine gore
// nasil duyurulacagina karar verir. Kart akip gitse de (hiz 8'de 11 saniyelik
// bir toast fark edilmez) vakayiname kalir.
//
// Katman kurali: burada DOM yok. Kartin nasil gorunecegine ui/ karar verir.

/**
 * Olayin sonucuna gore siniflandirma. Sunum bicimi buradan turer:
 * her olay modal olursa oyun bir bildirim cehennemine doner, hicbiri
 * olmazsa kor beta kampanyasindaki "sessiz oyun" geri gelir.
 */
export const TIER = {
  /** Gunluk isleyis: kucuk tesis, kucuk fiyat hareketi. Sadece akista. */
  AMBIENT: 0,
  /** Dikkat ister: arastirma bitti, kurum seviyesi degisti. Belirgin kart. */
  IMPORTANT: 1,
  /** Ulusal olay: savas, baris, temerrut, rejim. Vakayinameye girer. */
  MAJOR: 2,
  /** Varolussal: baskent kaybi, ordunun yok olusu, kampanya sonu. Durdurur. */
  EXISTENTIAL: 3,
};

/**
 * Yuzyillik kampanyada onda birkac girdi hedeflenir; tavan buyuk bir savas
 * caginda bile tasmayacak kadar genis, kaydi sisirmeyecek kadar dar.
 */
const MAX_ENTRIES = 240;

export function ensureChronicle(nation) {
  if (!Array.isArray(nation.chronicle)) nation.chronicle = [];
  return nation.chronicle;
}

/**
 * Tarihe bir satir yazar. Ayni hafta ayni basligi iki kez yazmaz: olay
 * saptayicisi ile yerinde duyurular ayni gecise iki yerden bakabilir.
 */
export function recordChronicle(nation, entry) {
  const list = ensureChronicle(nation);
  for (let i = list.length - 1; i >= 0 && list[i].turn === entry.turn; i--) {
    if (list[i].title === entry.title) return list[i];
  }
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  return entry;
}

/**
 * Olayi duyurur: onemliyse vakayinameye yazar, oyuncunun olayiysa karta
 * cevirir. Kart akisi `turns.addLog` uzerinden gecer — gunluk, bildirim ve
 * vakayiname boylece tek hunide bulusur.
 *
 * @param {object} spec `{ kind, tier, title, detail, tile, key, ttl, halt }`
 */
export function announce(game, nation, spec) {
  const tier = spec.tier ?? TIER.IMPORTANT;
  const turn = game.world?.turn ?? game.turns?.turn ?? 0;
  const player = nation.id === game.turns?.playerNation;
  if (tier >= TIER.MAJOR) {
    recordChronicle(nation, {
      turn,
      kind: spec.kind ?? 'INFO',
      tier,
      title: spec.title,
      detail: spec.detail ?? '',
    });
  }
  // Baska ulkenin ic olayi oyuncunun ekranini bolmez; yine de kendi
  // tarihine yazilmistir (dunya raporlari icin).
  if (!player || !game.turns) return null;
  const text = spec.detail ? `${spec.title} — ${spec.detail}` : spec.title;
  game.turns.addLog(text, {
    kind: spec.kind ?? 'INFO',
    tier,
    title: spec.title,
    body: spec.detail ?? '',
    tile: spec.tile ?? null,
    key: spec.key ?? null,
    ttl: spec.ttl,
    halt: spec.halt,
    actions: spec.actions ?? null,
  });
  return text;
}

/** Yil etiketi: 1836 baslangicli haftalik takvim. */
export function chronicleYear(turn) {
  return 1836 + Math.floor((turn ?? 0) / 52);
}

/**
 * Kampanyanin ilk haftasinda alinan kesit. Kapanis ekrani "nereden nereye"
 * diyebilsin diye acilis degerleri saklanir; sonradan turetilemezler.
 * Bir kez yazilir, bir daha degismez.
 */
export function captureOpening(world, nation, governmentLabel) {
  if (!nation || nation.opening) return nation?.opening ?? null;
  nation.opening = {
    turn: world?.turn ?? 1,
    population: Math.round(nation.economy?.population ?? 0),
    gdp: Math.round(nation.economy?.gdp ?? 0),
    literacy: Number((nation.economy?.literacy ?? 0).toFixed(4)),
    tiles: nation.tiles ?? 0,
    provinces: nation.provinces ?? 0,
    government: governmentLabel ?? '',
    factories: nation.economy?.factories?.length ?? 0,
  };
  return nation.opening;
}
