// SANAT KAPISI — Uluslar Çağı ekranlarının bütün resimli ikonları.
//
// Veride emoji glif durur (defs.js `glyph`, laws.js `icon`); ekran onu basmaz,
// buradan resim ister. Emoji "AI ile yapıştırılmış" görüntünün bir numaralı
// kaynağıydı: her işletim sisteminde başka çizilir, boyu metinle oynar.
//
// İki sanat ailesi var ve sunumları bilinçli olarak ayrı:
//   - Kaynak madalyonları: eski boyalı set halkası sanatın İÇİNDE gelir;
//     gravür setinden gelen at ve güherçile halkasızdır. Halkasızlar CSS'te
//     aynı emaye diske ve pirinç halkaya oturtulur (`art-disc`) ki yan yana
//     iki ayrı setten yapıştırılmış durmasınlar.
//   - Bina ve yasa sahneleri (gravür): dikdörtgen "plaka" çerçeve (`art-plate`).
//   - Amblemler (teknoloji dalı, üst çubuk göstergesi, general özelliği):
//     çerçevesiz nesne + gölge (`art-emblem`). Metin satırının içinde de
//     durdukları için disk ya da plaka onları satırdan taşırırdı.
//
// Katman notu: yalnız HTML dizgisi üretir; oyun durumu okumaz.

const BASE = 'assets/icons';

const RESOURCE_FILE = {
  FOOD: 'resources/grain',
  COAL: 'resources/coal',
  IRON: 'resources/iron',
  TIMBER: 'resources/timber',
  HORSES: 'resources/horses',
  SALTPETER: 'resources/saltpeter',
  OIL: 'resources/oil',
  RUBBER: 'resources/rubber',
};
/** Halkası sanatın içinde gelenler: CSS ikinci halka çizmez. */
const RINGED = new Set(['FOOD', 'COAL', 'IRON', 'TIMBER', 'OIL', 'RUBBER']);

const EQUIPMENT_FILE = {
  rifles: 'resources/small_arms',
  guns: 'resources/artillery',
  ships: 'resources/clipper_convoy',
  ironclads: 'resources/steamer_convoy',
};

/** Bütçe satırları: eski bütçe madalyonları (halka içte). */
const LEDGER_FILE = {
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
  return img(file, id.toLowerCase(), `art-${size} art-disc${RINGED.has(id) ? ' ringed' : ''}`);
}

/** Bina sahnesi (gravür plaka). */
export function buildingArt(id, size = 'md') {
  return img(`buildings/${id}`, id, `art-${size} art-plate`);
}

/** Yasa amblemi (gravür plaka). */
export function lawArt(id, size = 'md') {
  return img(`laws/${id}`, id, `art-${size} art-plate`);
}

/** Teçhizat madalyonu; zırhlı teknolojisiyle gemi buharlıya döner. */
export function equipmentArt(id, size = 'md', ironclad = false) {
  const file = EQUIPMENT_FILE[id === 'ships' && ironclad ? 'ironclads' : id];
  return file ? img(file, id, `art-${size} art-disc ringed`) : '';
}

/** Bütçe satırı madalyonu. */
export function ledgerArt(id, size = 'xs') {
  const file = LEDGER_FILE[id];
  if (!file) return '';
  const plate = file.startsWith('buildings/');
  return img(file, id, `art-${size} ${plate ? 'art-plate' : 'art-disc ringed'}`);
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
