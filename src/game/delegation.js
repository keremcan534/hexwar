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
  economy: {
    id: 'economy',
    name: 'Economy',
    screen: 'economy',
    desc: 'The ministry weighs the production lines toward what the army lacks and opens or closes trade to fit the balance of resources.',
  },
  construction: {
    id: 'construction',
    name: 'Construction',
    screen: 'construction',
    desc: 'Factories where consumer goods run short, farms where food does, mines on scarce deposits, railways and development for the populous heartland.',
  },
  reforms: {
    id: 'reforms',
    name: 'Government',
    screen: 'politics',
    // Hükûmet biçimi kararları devredilmez: rejimi oyuncu seçer.
    desc: 'The cabinet passes laws the situation demands, hires advisors, and settles restless minorities. Regime changes stay yours.',
  },
  agenda: {
    id: 'agenda',
    name: 'Agenda',
    screen: 'politics',
    desc: 'The cabinet picks the national agenda that fits the country best when the last one completes.',
  },
  recruitment: {
    id: 'recruitment',
    name: 'Recruitment',
    screen: 'military',
    desc: 'The general staff orders regiments, mobilises the reserve when an enemy outweighs the army — and disbands regiments if the state goes bankrupt in peacetime.',
  },
  research: {
    id: 'research',
    name: 'Research',
    screen: 'technology',
    desc: 'When your queue runs dry the academy picks what the country needs most. Your own queue always comes first.',
  },
  diplomacy: {
    id: 'diplomacy',
    name: 'Diplomacy',
    screen: 'diplomacy',
    desc: 'The foreign ministry answers peace offers and opens wars it can win.',
  },
};

export const DELEGATION_IDS = Object.keys(DELEGATION_AREAS);

/**
 * Yeni kampanyada hükûmete devredilmiş BAŞLAYAN alanlar: üst sekme
 * şeridindeki bütün portföyler (Kerem: "barlarımız hepsi otomatikte
 * başlayacak"). DİPLOMASİ BİLEREK DIŞARIDA: sekmesi yok ve devri oyuncu adına
 * savaş ilan eder — ilk haftada habersiz bir savaş başlatmak "kolaylık" değil.
 */
export const DEFAULT_AUTO_AREAS = [
  'economy', 'construction', 'reforms', 'agenda', 'recruitment', 'research',
];

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
 * Oyuncunun yeni ulusu için varsayılan devir. Isınma penceresi GERİYE
 * yazılır: ısınma, oyuncunun elle kurduğu ayarın üstüne binen ilk haftayı
 * yumuşatmak içindir; kuruluşta ezilecek bir ayar yok, YZ ülkeleri de ilk
 * haftadan yönetiyor. Zaten devir kaydı olan ulusa dokunulmaz (yüklenen
 * kayıt, oyun içinde yeniden seçilen ulus).
 */
export function applyDefaultDelegation(nation, turn = 0) {
  if (!nation || nation.delegation) return null;
  const state = ensureDelegation(nation);
  for (const id of DEFAULT_AUTO_AREAS) {
    state[id] = true;
    state.since[id] = (turn ?? 0) - DELEGATION_WARMUP;
  }
  return state;
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
