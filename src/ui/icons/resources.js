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
};

/**
 * Çizgi-SVG yedekler (24x24 stroke). İkinci paket bekleyen mallar:
 * cotton, sulphur, silk, tropical_wood, groceries, wine, liquor, lumber,
 * furniture, luxury_furniture, cement, clothes, luxuries, synthetic_oil,
 * fuel, explosives + pakette hiç anılmayan askeri/deniz malları.
 */
export const RESOURCE_PATHS = {
  cotton: '<circle cx="9" cy="10" r="3.2"/><circle cx="15" cy="10" r="3.2"/>'
    + '<circle cx="12" cy="7.5" r="3.2"/><path d="M12 13v8M12 17l3-2M12 15l-3-2"/>',
  sulphur: '<path d="M12 4l6 10H6z"/><path d="M9 18h6M10 21h4"/>',
  silk: '<path d="M5 7c4-3 10-3 14 0-4 3-4 7 0 10-4 3-10 3-14 0 4-3 4-7 0-10z"/>',
  tropical_wood: '<path d="M7 20V9M11 20V7M15 20V9"/><path d="M4 9c2-4 6-6 8-6M20 9c-2-4-6-6-8-6"/>',
  groceries: '<path d="M6 8h12l-1.5 12h-9z"/><path d="M9 8a3 3 0 0 1 6 0M8 12h8"/>',
  wine: '<path d="M8 3h8l-1 6a3 3 0 0 1-6 0z"/><path d="M12 12v7M8.5 21h7"/>',
  liquor: '<path d="M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3z"/><path d="M8 14h8"/>',
  lumber: '<path d="M4 9h16v4H4zM4 15h16v4H4z"/><path d="M8 9v4M14 9v4M11 15v4M17 15v4"/>',
  furniture: '<path d="M6 11V6h12v5M5 11h14v4H5z"/><path d="M6 15v4M18 15v4"/>',
  luxury_furniture: '<path d="M6 11V6h12v5M5 11h14v4H5z"/><path d="M6 15v4M18 15v4M9 6c1-2 5-2 6 0"/>',
  cement: '<path d="M5 20l2-12h10l2 12z"/><path d="M8 12h8M7 16h10"/>',
  clothes: '<path d="M9 4l3 2 3-2 4 4-3 2v10H8V10L5 8z"/>',
  luxuries: '<path d="M9 4l3 2 3-2 4 4-3 2v10H8V10L5 8z"/><path d="M10 15l2-2 2 2-2 2z"/>',
  synthetic_oil: '<path d="M9 3h6M10 3v5l-4 9a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-9V3"/><path d="M8 15h8"/>',
  fuel: '<path d="M6 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14zM6 20h10"/>'
    + '<path d="M16 9l3 2v6a1.5 1.5 0 0 1-3 0M8 7h6v4H8z"/>',
  explosives: '<path d="M8 10h8v10H8zM10 10V7h4v3"/><path d="M12 7V4M12 4l2-1"/>',
  arms: '<path d="M4 16l12-9 3 4-9 7H6z"/><path d="M13 18l4 3M6 13l-3 4"/>',
  tanks: '<path d="M5 14h14a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4z"/><path d="M9 14v-3h5l2 3M14 11l6-3"/>',
  airplane: '<path d="M12 4v16M12 9l-8 4v2l8-2 8 2v-2z"/><path d="M9 20l3-2 3 2"/>',
  artillery: '<path d="M5 17l10-10 3 3-10 10z"/><circle cx="7" cy="18" r="2.4"/>',
  clippers: '<path d="M4 17h16l-2 4H6z"/><path d="M12 17V4M12 5c4 1 6 4 6 8h-6M12 7c-3 1-4 3-4 6h4"/>',
  steamers: '<path d="M4 17h16l-2 4H6z"/><path d="M7 17v-5h10v5M10 12V9h4v3M15 9V6"/>',
  telephone: '<path d="M6 8a12 12 0 0 1 12 0l-2 3a8 8 0 0 0-8 0z"/><path d="M12 12v5M9 20h6M10 17h4"/>',
};
