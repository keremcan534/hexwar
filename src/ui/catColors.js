// KATEGORİ RENKLERİ (Kerem 2026-11-20: "genel bu tek renk sevdası öldürmüş arayüzü resmen";
// "butonlarda renkleri kullanalım"). Seçili düğme, kart şeridi ve birlik işareti konusunun
// rengini taşır: yasa satırı, danışman koltuğu, karar, birlik kolu, komutan dalı. Tonlar sekme
// madalyonlarının emayesiyle aynı çarktadır (scripts/art/emboss-icons.py TAB_ENAMEL); seçili
// düğme dokuları scripts/art/accent-skin.py CATEGORIES ile üretilir, CSS bağı hud.css [data-cat].
// Yalnız görünüştür: oyun bu tabloyu okumaz.

/** Elemana kategori özniteliği; boş kimlik iz bırakmaz. */
export const catAttr = (id) => (id ? ` data-cat="${id}"` : '');

/** Yasa → kategori: emek sanayinin, askerlik ordunun, vatandaşlık halkların rengi. */
export const LAW_CAT = {
  labour: 'industry', conscription: 'military', economy: 'economy',
  trade: 'trade', citizenship: 'culture', education: 'research',
};

/** Danışman koltuğu (politics.js ADVISOR_SLOTS). */
export const ADVISOR_CAT = { economy: 'economy', military: 'military', political: 'politics' };

/** Karar → konusu (decisions.js DECISIONS). */
export const DECISION_CAT = {
  industrial_subsidies: 'economy', national_census: 'economy', requisition_economy: 'economy',
  war_bonds: 'military', requisition: 'military', military_drills: 'military',
  land_grants: 'people', research_grants: 'research',
  gendarmerie: 'politics', royal_amnesty: 'politics', patriotic_press: 'culture',
};

/**
 * Birlik kolu (military.js UNIT_CATEGORIES): yan yana kartlar birbirinden ayrılsın. Piyade
 * yeşil, zırh mor: zeytin ve kehribar düğmede sarı okunuyordu (Kerem: "arayüz sarımtırak").
 */
export const ARM_CAT = {
  line: 'economy', horse: 'industry', guns: 'military',
  armour: 'culture', support: 'research', naval: 'diplomacy',
};

/** Komutan dalı: kara generalleri ve amiraller. */
export const BRANCH_CAT = { army: 'military', navy: 'diplomacy' };
