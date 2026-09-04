// EU5 tarzı AUTO devri: her yönetim alanı için tek bir açık/kapalı anahtar.
//
// NEDEN BU KADAR SADE: mikro yönetim mobilde en hızlı büyüyen maliyettir
// (bkz. CLAUDE.md). Ama doktrin ağacı / eşik tablosu / politika betiği eklemek
// maliyeti azaltmaz, YERİNİ DEĞİŞTİRİR — oyuncu artık bakanlığı ayarlamakla
// uğraşır. Bu yüzden tek karar var: bu alanı ben mi yönetiyorum, hükûmet mi.
//
// AUTO ON, YZ ülkelerinin kullandığı fonksiyonun TA KENDİSİNİ oyuncunun
// ülkesine bağlar. Ayrı bir "oyuncu otomasyonu" yazılmaz; yazılsaydı iki
// davranış sessizce ayrışır ve biri diğerinden avantajlı olurdu. Hazine,
// kaynak, yasa, inşaat gücü, teçhizat ve antlaşma sınırları aynıdır: devir
// bir kolaylıktır, bir bonus değil.

/** Devredilebilir alanlar. Sıra ekranda göründükleri sıradır. */
export const DELEGATION_AREAS = {
  budget: {
    id: 'budget',
    name: 'Budget',
    screen: 'budget',
    desc: 'The treasury sets class taxes, social spending and the war budget.',
  },
  trade: {
    id: 'trade',
    name: 'Trade',
    screen: 'trade',
    desc: 'The tariff follows the ruling party’s trade doctrine.',
  },
  construction: {
    id: 'construction',
    name: 'Construction',
    screen: 'construction',
    desc: 'State investment and public works are planned for you.',
  },
  research: {
    // ADI DAR TUTULDU. Bos arastirma kuyrugunu programa gore doldurmak zaten
    // OYUNCU ICIN DE calisiyor (bkz. economy.js nextTechFor — kor beta B-018'in
    // cozumu) ve AUTO'dan bagimsizdir. Devredilen tek sey PROGRAM ilanidir;
    // "Research AUTO" demek, kapaliyken hicbir sey secilmiyor sanmaya yol acardi.
    id: 'research',
    name: 'Research programme',
    screen: 'technology',
    desc: 'The eight-year national programme is declared and renewed for you. Individual technologies stay yours to steer.',
  },
  diplomacy: {
    id: 'diplomacy',
    name: 'Diplomacy',
    screen: 'diplomacy',
    desc: 'The foreign ministry answers peace offers and opens wars it can win.',
  },
  reforms: {
    id: 'reforms',
    name: 'Reforms',
    screen: 'politics',
    // Once bilerek DEVREDILMEZ birakilmisti ("oyunun asil kararlari").
    // Pratikte oyle cikmadi: merdiven bekleme suresi dolunca tek bir acik
    // basamak sunuyor ve oyuncu ne verdigini bilmeden tikliyor — yani karar
    // degil ayin. Devir bu ayini kaldirir; ONEMLI karar hala oyuncunun,
    // cunku istedigi an geri alip kendi merdivenini secebilir.
    desc: 'The cabinet enacts the ruling party’s programme as the chamber allows it.',
  },
  recruitment: {
    id: 'recruitment',
    name: 'Recruitment',
    screen: 'military',
    // Uyarı dürüst olsun: `spend()` temerrütteki barış ordusunu KÜÇÜLTÜR
    // (bkz. ai.js) ve oyuncunun elinde bir "terhis" düğmesi yok. Devir bu
    // yetkiyi de verir; yazmamak sürpriz olurdu.
    desc: 'The general staff orders regiments, founds cities, mobilizes the reserve when an enemy outweighs the army — and disbands regiments if the treasury defaults in peacetime.',
  },
};

export const DELEGATION_IDS = Object.keys(DELEGATION_AREAS);

/**
 * Devir açıldıktan sonraki koruma süresi. Oyuncunun elle kurduğu ayar bir
 * anda ezilmesin diye DEĞİL — devrin ilk haftasında YZ'nin "kriz" dalına
 * düşüp tek hafta içinde her kaldıracı oynatmasını engellemek için.
 *
 * Salınımın asıl freni zaten mevcut YZ'de: tarife haftada ±2 sürüklenir,
 * vergi ±5 ve yalnız "broke/rich" bandında oynar (bkz. adjustFiscalAI).
 * Bu pencere onun üstüne yalnız bir nefes payı koyar.
 */
export const DELEGATION_WARMUP = 4;

function emptyDelegation() {
  const state = { since: {}, last: {} };
  for (const id of DELEGATION_IDS) state[id] = false;
  return state;
}

export function ensureDelegation(nation) {
  if (!nation) return null;
  const state = nation.delegation ?? (nation.delegation = emptyDelegation());
  state.since ??= {};
  state.last ??= {};
  for (const id of DELEGATION_IDS) state[id] = Boolean(state[id]);
  return state;
}

/** Alan devredilmiş mi? Isınma penceresi burada değil, çağıranda okunur. */
export function isDelegated(nation, areaId) {
  return Boolean(nation?.delegation?.[areaId]);
}

/**
 * Devredilmiş VE ısınma penceresini geçmiş mi? Haftalık YZ çağrılarının
 * kapısı budur; anahtarın kendisi (`isDelegated`) ekran içindir.
 */
export function delegationActive(nation, areaId, turn) {
  if (!isDelegated(nation, areaId)) return false;
  const since = nation.delegation?.since?.[areaId] ?? 0;
  return (turn ?? 0) - since >= DELEGATION_WARMUP;
}

/**
 * Anahtarı çevirir. KAPATMAK anında etkilidir: aynı hafta içinde bile YZ
 * çağrısı bir daha koşmaz, oyuncu kaldıracı geri alır. AÇMAK ısınma
 * penceresini başlatır.
 */
export function setDelegation(game, nation, areaId, on) {
  if (!DELEGATION_AREAS[areaId]) return false;
  const state = ensureDelegation(nation);
  const next = Boolean(on);
  if (state[areaId] === next) return false;
  state[areaId] = next;
  state.since[areaId] = game?.world?.turn ?? 0;
  if (!next) delete state.last[areaId];
  game?.emit?.('delegation', state);
  return true;
}

/**
 * Otomasyonun son ANLAMLI eylemi. Alan başına TEK kayıt tutulur: bu bir
 * günlük değil, "hükûmet en son ne yaptı" satırıdır. Aynı eylem tekrar
 * yazılırsa yalnız turu tazelenir, yeni satır açılmaz.
 */
export function noteDelegated(game, nation, areaId, text, reason = '') {
  if (!isDelegated(nation, areaId)) return;
  const state = ensureDelegation(nation);
  const previous = state.last[areaId];
  if (previous && previous.text === text) {
    previous.turn = game?.world?.turn ?? previous.turn;
    return;
  }
  state.last[areaId] = { turn: game?.world?.turn ?? 0, text, reason };
}

export function lastDelegatedAction(nation, areaId) {
  return nation?.delegation?.last?.[areaId] ?? null;
}

/** Kayıttan dönen anahtar seti. Bilinmeyen alanlar sessizce düşer. */
export function restoreDelegation(nation, saved) {
  const state = emptyDelegation();
  if (saved) {
    for (const id of DELEGATION_IDS) state[id] = Boolean(saved[id]);
    state.since = { ...(saved.since ?? {}) };
    // Son eylem satırı sınırlıdır: alan başına bir kayıt, fazlası atılır.
    for (const id of DELEGATION_IDS) {
      const entry = saved.last?.[id];
      if (entry) state.last[id] = { turn: entry.turn ?? 0, text: String(entry.text ?? ''), reason: String(entry.reason ?? '') };
    }
  }
  nation.delegation = state;
  return state;
}
