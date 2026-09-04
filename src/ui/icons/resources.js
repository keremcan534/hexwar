// Mal ikonları.
//
// İki katman var ve öncelik sırası bilinçli:
//   1. RESOURCE_ART   — kanonik boyalı set (assets/icons/resources/*.png).
//      Kaynak sprite sheet'ten scripts tarafında dilimlendi; dosya adları
//      pakete aittir, oyun kimliğine eşleme burada yapılır (grain -> food).
//   2. RESOURCE_PATHS — boyası henüz olmayan mallar için çizgi-SVG yedek.
//      İkinci paket geldiğinde buradaki giriş silinip ART'a taşınır; kod
//      başka hiçbir yerde değişmez.

/** goodId -> assets/icons/resources altındaki dosya adı (uzantısız). */
export const RESOURCE_ART = {
  // Paket 1: pirinç halkalı madalyonlar.
  food: 'grain',
  fish: 'fish',
  cattle: 'cattle',
  fruit: 'fruit',
  timber: 'timber',
  paper: 'paper',
  coal: 'coal',
  iron: 'iron',
  steel: 'steel',
  fabric: 'fabric',
  dye: 'dye',
  glass: 'glass',
  fertilizer: 'fertilizer',
  ammunition: 'ammunition',
  oil: 'oil',
  rubber: 'rubber',
  tools: 'machine_parts',
  electric_gear: 'electric_gear',
  radio: 'radio',
  automobile: 'automobile',
  // Paket 2: halkasız nesneler; dairesel maskeyle paket 1'in biçimine
  // getirildi, pirinç halkayı amblemde CSS çizer.
  cotton: 'cotton',
  sulphur: 'sulphur',
  silk: 'silk',
  tropical_wood: 'tropical_wood',
  groceries: 'canned_food',
  wine: 'wine',
  liquor: 'liquor',
  lumber: 'lumber',
  furniture: 'furniture',
  luxury_furniture: 'luxury_furniture',
  cement: 'cement',
  clothes: 'regular_clothes',
  luxuries: 'luxury_clothes',
  fuel: 'fuel',
  explosives: 'explosives',
  // Paket 3: askerî ve deniz malları; halkası sanatın içinde (paket 1 gibi).
  arms: 'small_arms',
  artillery: 'artillery',
  tanks: 'tanks',
  airplane: 'aeroplane',
  clippers: 'clipper_convoy',
  steamers: 'steamer_convoy',
};

/**
 * Halkası sanatın içinde olan mallar (paket 1). Amblemde CSS pirinç halka
 * yalnız bu kümenin DIŞINDAKİLERE çizilir; yoksa çift çerçeve görünür.
 */
export const RINGED_ART = new Set([
  'food', 'fish', 'cattle', 'fruit', 'timber', 'paper', 'coal', 'iron',
  'steel', 'fabric', 'dye', 'glass', 'fertilizer', 'ammunition', 'oil',
  'rubber', 'tools', 'electric_gear', 'radio', 'automobile',
  'arms', 'artillery', 'tanks', 'airplane', 'clippers', 'steamers',
]);

/**
 * Çizgi-SVG yedekler (24x24 stroke). Boyası gelen mal bu tablodan silinip
 * RESOURCE_ART'a taşınır; geriye yalnız telefon kaldı.
 */
export const RESOURCE_PATHS = {
  telephone: '<path d="M6 8a12 12 0 0 1 12 0l-2 3a8 8 0 0 0-8 0z"/><path d="M12 12v5M9 20h6M10 17h4"/>',
};
