// SANAT KAPISI — Uluslar Çağı ekranlarının bütün resimli ikonları.
//
// Veride emoji glif durur (defs.js `glyph`, laws.js `icon`); ekran onu basmaz,
// buradan resim ister. Emoji "AI ile yapıştırılmış" görüntünün bir numaralı
// kaynağıydı: her işletim sisteminde başka çizilir, boyu metinle oynar.
//
// İki sanat ailesi var ve sunumları bilinçli olarak ayrı:
//   - Eşya (kaynak, teçhizat, bütçe kalemi, yasa, bina): çerçevesiz nesne ya da
//     diorama, arkasında CSS'in yumuşak ışığı (`art-item`). Disk + halka her
//     ikonu aynı daireye çevirip nesneyi küçültüyordu; küçük boyda ayırt
//     edilemiyordu. Koyu plaka da bina listesinde çerçevesiz satırla çelişti.
//   - Amblemler (teknoloji dalı, üst çubuk göstergesi, general özelliği):
//     çerçevesiz nesne + gölge (`art-emblem`). Metin satırının içinde de
//     durdukları için disk ya da plaka onları satırdan taşırırdı.
//
// Katman notu: yalnız HTML dizgisi üretir; oyun durumu okumaz.

const BASE = 'assets/icons';

/**
 * Kaynak ikonları gerçek fotoğraftan çizilen sette (Kerem, 2026-10-22;
 * assets/incoming/kaynak-foto-1.webp, saydam zeminli 4x2). Kaynak yeniden
 * tasarımında demir ÇELİK, kereste ALÜMİNYUM olur (Kerem): ikonlar şimdiden
 * o kimliği taşır — külçe çelik, profil alüminyum.
 */
const RESOURCE_FILE = {
  FOOD: 'resources-photo/food',
  COAL: 'resources-photo/coal',
  IRON: 'resources-photo/steel',
  TIMBER: 'resources-photo/aluminium',
  HORSES: 'resources-photo/horses',
  SALTPETER: 'resources-photo/nitrates',
  OIL: 'resources-photo/oil',
  RUBBER: 'resources-photo/rubber',
};

/**
 * Teçhizat da fotoğraftan çizilen sette (assets/incoming/techizat-foto-1.webp).
 * Eski setin savaş gemisi YELKENLİ klipperdi (1900-1945'te); artık dretnot —
 * eski zırhlı da aynı gövdeyi taşır. Setin teçhizat OLMAYAN üç resmi
 * (denizaltı, milis, ikmal sandığı) KIT_FILE'da.
 */
const EQUIPMENT_FILE = {
  rifles: 'equipment-photo/rifles',
  guns: 'equipment-photo/guns',
  ships: 'equipment-photo/dreadnought',
  ironclads: 'equipment-photo/dreadnought',
  tanks: 'equipment-photo/tanks',
  aircraft: 'equipment-photo/aircraft',
};

/**
 * Aynı fotoğraf setinden, teçhizat hattı olmayan nesneler: denizaltı (donanma
 * panelinin Submarines satırı), milis (Call to Arms), ikmal sandığı (haftalık
 * ikmal faturası). Ordu amblemi ikmali "ordu" diye okutuyordu; sandık faturanın
 * kendisidir.
 */
const KIT_FILE = {
  submarine: 'equipment-photo/submarine',
  militia: 'equipment-photo/militia',
  supply: 'equipment-photo/supply',
};

/**
 * Defter satırları: bütçe madalyonları. Tek Çubuk'un fon defteri (treasury.js
 * LEDGER_LINES) ve çubuğun payları yeni kimliklerle gelir; eski kimlikler
 * (tax, maintenance, construction...) hâlâ okuyan ekran kalabilir diye durur.
 */
const LEDGER_FILE = {
  investment: 'buildings/factory',
  development: 'buildings/mine',
  grant: 'budget/upper_class_tax',
  schools: 'budget/education',
  martial: 'resources/small_arms',
  people: 'budget/welfare',
  bills: 'budget/army',
  tax: 'budget/treasury',
  exports: 'budget/tariff',
  treaty: 'budget/upper_class_tax',
  army: 'budget/army',
  navy: 'resources/clipper_convoy',
  education: 'budget/education',
  imports: 'budget/tariff',
  maintenance: 'buildings/factory',
  construction: 'buildings/mine',
  recruitment: 'resources/small_arms',
  inflation: 'budget/treasury',
  interest: 'budget/lower_class_tax',
  unrest: 'budget/welfare',
  outlay: 'budget/middle_class_tax',
};

function img(file, alt, cls) {
  return `<span class="art ${cls}"><img src="${BASE}/${file}.png" alt="${alt}" draggable="false" loading="lazy"></span>`;
}

/** Kaynak madalyonu. `size`: xs 18 · sm 26 · md 40 · lg 64. */
export function resourceArt(id, size = 'sm') {
  const file = RESOURCE_FILE[id];
  if (!file) return '';
  return img(file, id.toLowerCase(), `art-${size} art-item`);
}

/** Bina dioraması. */
export function buildingArt(id, size = 'md') {
  return img(`buildings/${id}`, id, `art-${size} art-item`);
}

/** Yasa nesnesi. */
export function lawArt(id, size = 'md') {
  return img(`laws/${id}`, id, `art-${size} art-item`);
}

/** Teçhizat madalyonu; zırhlı teknolojisiyle gemi buharlıya döner. */
export function equipmentArt(id, size = 'md', ironclad = false) {
  const file = EQUIPMENT_FILE[id === 'ships' && ironclad ? 'ironclads' : id];
  return file ? img(file, id, `art-${size} art-item`) : '';
}

/** Teçhizat setinin öbür nesneleri: 'submarine' | 'militia' | 'supply'. */
export function kitArt(id, size = 'xs') {
  const file = KIT_FILE[id];
  return file ? img(file, id, `art-${size} art-item`) : '';
}

/** Bütçe satırı madalyonu. */
export function ledgerArt(id, size = 'xs') {
  const file = LEDGER_FILE[id];
  if (!file) return '';
  return img(file, id, `art-${size} art-item`);
}

/** Amblem: teknoloji dalı (industry…society) ya da gösterge (power, stability, infamy). */
export function emblemArt(id, size = 'sm') {
  return img(`emblems/${id}`, id, `art-${size} art-emblem`);
}

/** General özelliği; `size` 'inline' metin satırına oturur. */
export function traitArt(id, size = 'inline') {
  return id ? img(`traits/${String(id).toLowerCase()}`, id, `art-${size} art-emblem`) : '';
}

/** Birim simgesi (assets/icons/units). */
export function unitArt(typeId, size = 'sm') {
  return img(`units/${String(typeId).toLowerCase()}`, typeId, `art-${size} art-unit`);
}
