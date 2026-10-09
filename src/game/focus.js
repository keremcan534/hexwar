// STATE FOCUS — Victoria 2'nin ulusal odağı, state başına.
//
// Oyuncu bir state'e odak koyar; o state'te tek bir şey hızlanır. Yuva sayısı
// okuryazarlıkla büyür (her %25'e bir, artı bir): 1836'da bir-iki odak,
// eğitimli bir ülkede beş. Ev ödevi testi: odak sayısı state sayısıyla değil
// okuryazarlıkla büyür, yani imparatorluk büyüdükçe iş artmaz.
//
// Etkiler oyunun kendi formüllerine çarpan olarak girer (vergi economy.js,
// çıktı econ/resources.js, insan gücü levy.js, uyum provinces.js, huzursuzluk
// ve asimilasyon culture.js); ekran önizlemesi aynı formülleri geçici odakla
// okur — önizleme oyunla ayrışamaz.
//
// Bu dosya hiçbir şey içe aktarmaz: vergi, çıktı ve huzursuzluk formülleri
// buradan okur, döngü olmasın. Eylemler ve önizleme stateFocus.js'tedir.


export const FOCUSES = [
  {
    id: 'production', name: 'Production', art: 'industry', output: 0.25,
    desc: 'Food and resource output +25%.',
  },
  {
    id: 'tax', name: 'Taxation', art: 'gold', tax: 0.3,
    desc: 'Tax from this state +30%.',
  },
  {
    id: 'recruit', name: 'Recruitment', art: 'recruits', manpower: 0.3,
    desc: 'Manpower from this state +30%.',
  },
  {
    id: 'integrate', name: 'Integration', art: 'stability', control: 2, ceiling: 15, unrest: 1,
    desc: 'Compliance grows twice as fast and its ceiling rises by 15; unrest −1.',
  },
  {
    id: 'assimilate', name: 'Assimilation', art: 'people',
    desc: 'Each year 1% of the people (2% at full literacy) take up your culture — even in a people\'s homeland.',
  },
];

export const FOCUS_BY_ID = Object.fromEntries(FOCUSES.map((focus) => [focus.id, focus]));

export const FOCUS = {
  /** Asimilasyon odağı: yılda nüfusun bu payı, okuryazarlıkla iki katına kadar. */
  ASSIMILATE_YEAR: 0.01,
  /** Her bu kadar okuryazarlık bir yuva daha açar (taban bir yuva). */
  LITERACY_PER_SLOT: 0.25,
  MAX_SLOTS: 5,
};

/** State'in odağı (tanım) ya da null. */
export function focusOf(econ) {
  return FOCUS_BY_ID[econ?.focus] ?? null;
}

/** Odağın bir etki anahtarı (output/tax/manpower/control/ceiling/unrest); yoksa 0. */
export function focusBonus(econ, key) {
  return focusOf(econ)?.[key] ?? 0;
}

/** Yuva sayısı: 1 + okuryazarlığın her %25'i. */
export function focusSlots(nation) {
  const literacy = Math.max(0, Math.min(1, nation?.economy?.literacy ?? 0));
  return Math.min(FOCUS.MAX_SLOTS, 1 + Math.floor(literacy / FOCUS.LITERACY_PER_SLOT + 1e-9));
}

/** Okuryazarlık bir sonraki yuvaya ne kadar uzak (yüzde puanı), tavandaysa null. */
export function nextSlotAt(nation) {
  const slots = focusSlots(nation);
  if (slots >= FOCUS.MAX_SLOTS) return null;
  return slots * FOCUS.LITERACY_PER_SLOT;
}

/**
 * Asimilasyon odağının bu haftaki payı (kümenin nüfus payı olarak). Huzursuz
 * halk erimez: sakinlik çarpanı culture.js assimilate ile aynıdır (huzursuzluk
 * ~7.7'de durur).
 */
export function assimilationFocusWeekly(nation, unrest, foreign) {
  const calm = Math.max(0, 1 - (Math.max(0, unrest ?? 0) / 10) * 1.3);
  return Math.max(0, Math.min(foreign, assimilationFocusRate(nation) / 52 * calm));
}

/** Asimilasyon odağının yıllık oranı (nüfus payı). */
export function assimilationFocusRate(nation) {
  const literacy = Math.max(0, Math.min(1, nation?.economy?.literacy ?? 0));
  return FOCUS.ASSIMILATE_YEAR * (1 + literacy);
}
