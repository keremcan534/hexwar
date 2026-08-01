// Generaller. HOI4'teki komutan mantığı: bir general tek bir tümene değil, bir
// *ordu grubuna* komuta eder — altındaki bütün tümenler onun bonuslarını alır.
// Tümenler generaller arasında devredilebilir. General savaştıkça tecrübe
// kazanır ve yeteneği artar.
//
// Katman notu: burası saf veri + hesap. Atama ve tecrübe akışını turn/battles
// çağırır, çizim ve panel ui katmanında.

const FIRST = [
  'Aleron', 'Bertran', 'Casimir', 'Dorian', 'Edric', 'Faelan', 'Gideon', 'Halvard',
  'Ivor', 'Jorund', 'Kastor', 'Lucan', 'Merrick', 'Norvald', 'Osric', 'Perrin',
  'Quintus', 'Roderic', 'Stellan', 'Tancred', 'Ulric', 'Valen', 'Wystan', 'Yoren',
];
const LAST = [
  'Vance', 'Holt', 'Marsh', 'Thorne', 'Ashcroft', 'Bellamy', 'Carrow', 'Delacroix',
  'Ebert', 'Falkner', 'Grieve', 'Harrow', 'Ivanov', 'Jarnac', 'Kessler', 'Lindqvist',
  'Moreau', 'Novak', 'Oster', 'Pryce', 'Rennick', 'Sandoval', 'Varga', 'Weiss',
];

/**
 * Nitelikler. Her biri tek bir çarpanı etkiler; birleşimleri generali
 * "saldırgan piyade komutanı" ya da "temkinli müstahkem savunmacı" yapar.
 */
export const TRAITS = {
  OFFENSIVE: {
    id: 'OFFENSIVE', name: 'Offensive Doctrine', icon: '⚔',
    desc: 'Attacks harder, defends no better.', attack: 0.16,
  },
  DEFENSIVE: {
    id: 'DEFENSIVE', name: 'Defensive Doctrine', icon: '🛡',
    desc: 'Holds ground far better than it takes it.', defense: 0.2,
  },
  TRICKSTER: {
    id: 'TRICKSTER', name: 'Trickster', icon: '🎭',
    desc: 'Unpredictable: wider swing on every combat roll.', variance: 0.5,
  },
  LOGISTICIAN: {
    id: 'LOGISTICIAN', name: 'Logistician', icon: '📦',
    desc: 'Marches faster and recovers strength quicker.', march: 1, recovery: 0.5,
  },
  ENGINEER: {
    id: 'ENGINEER', name: 'Engineer', icon: '⚒',
    desc: 'Ignores part of the terrain and fortification bonus.', siege: 0.35,
  },
  CAVALRY_LEADER: {
    id: 'CAVALRY_LEADER', name: 'Cavalry Leader', icon: '🐎',
    desc: 'Cavalry regiments in the stack fight harder.', armBonus: 'CAVALRY', arm: 0.25,
  },
  GUNNER: {
    id: 'GUNNER', name: 'Master Gunner', icon: '💥',
    desc: 'Artillery regiments in the stack fight harder.', armBonus: 'ARTILLERY', arm: 0.3,
  },
  PLANNER: {
    id: 'PLANNER', name: 'Staff Planner', icon: '🗺',
    desc: 'Battle plans on this front mature faster.', planning: 0.5,
  },
};

export const TRAIT_IDS = Object.keys(TRAITS);

/** Yetenek tavanı. Tecrübe bu kademeleri doldurur. */
export const MAX_SKILL = 5;
const XP_PER_SKILL = 100;

export function initGenerals(world) {
  world.generalSystem = { nextId: 1 };
  for (const nation of world.nations) nation.generals = [];
}

export function ensureGenerals(world) {
  if (!world.generalSystem) world.generalSystem = { nextId: 1 };
  for (const nation of world.nations) {
    if (!Array.isArray(nation.generals)) nation.generals = [];
  }
  return world.generalSystem;
}

export function createGeneral(world, nation, rng) {
  const system = ensureGenerals(world);
  const skill = 1 + Math.floor(rng() * 3);
  // Nitelik sayısı yetenekle birlikte artar: iyi general hem güçlü hem renkli.
  const count = skill >= 3 ? 2 : 1;
  const pool = [...TRAIT_IDS];
  const traits = [];
  for (let i = 0; i < count && pool.length; i++) {
    traits.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const general = {
    id: system.nextId++,
    nationId: nation.id,
    name: `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`,
    skill,
    xp: 0,
    traits,
    // Komuta ettiği tümenlerin kimlikleri. Bir tümen yalnız tek generalde olur.
    divisions: [],
    aggression: 2,   // 1 temkinli · 2 dengeli · 3 saldırgan (bkz. fronts.js)
    battles: 0,
  };
  nation.generals.push(general);
  return general;
}

/** Kuruluşta her ülkeye bir çekirdek subay kadrosu. */
export function seedGenerals(world, rng, perNation = 3) {
  ensureGenerals(world);
  for (const nation of world.nations) {
    while (nation.generals.length < perNation) createGeneral(world, nation, rng);
  }
}

export function generalsOf(nation) {
  return nation?.generals ?? [];
}

export function generalById(nation, generalId) {
  return generalsOf(nation).find((candidate) => candidate.id === generalId) ?? null;
}

/** Bir tümenin bağlı olduğu general. */
export function generalOfArmy(nation, army) {
  if (!army) return null;
  return generalsOf(nation).find((general) => general.divisions.includes(army.id)) ?? null;
}

/** Generalin komuta ettiği tümenler. */
export function divisionsOf(world, general) {
  if (!general) return [];
  return general.divisions
    .map((id) => world.units.find((unit) => unit.id === id))
    .filter(Boolean);
}

export function commandSize(general) {
  return general?.divisions?.length ?? 0;
}

export function unassignedGenerals(nation) {
  return generalsOf(nation).filter((general) => general.divisions.length === 0);
}

/**
 * Tümenleri bir generalin komutasına verir. HOI4'teki devir budur: tümenler
 * eski komutanlarından düşer, hepsi yeni generalin altında toplanır.
 * @returns {number} devredilen tümen sayısı
 */
export function assignDivisions(nation, generalId, armies) {
  const general = generalById(nation, generalId);
  if (!general) return 0;
  const list = (Array.isArray(armies) ? armies : [armies])
    .filter((army) => army && army.nationId === nation.id);
  if (!list.length) return 0;
  const ids = new Set(list.map((army) => army.id));
  for (const other of generalsOf(nation)) {
    if (other.id === general.id) continue;
    other.divisions = other.divisions.filter((id) => !ids.has(id));
  }
  for (const id of ids) {
    if (!general.divisions.includes(id)) general.divisions.push(id);
  }
  return ids.size;
}

/** Geriye dönük tek tümenlik atama. */
export function assignGeneral(nation, generalId, army) {
  return assignDivisions(nation, generalId, [army]) > 0;
}

/** Generalin komutasını tamamen boşaltır. */
export function unassignGeneral(nation, generalId) {
  const general = generalById(nation, generalId);
  if (!general) return false;
  general.divisions = [];
  return true;
}

/** Belirli tümenleri komutadan çıkarır (dağılan/ölen tümen). */
export function releaseArmy(nation, armyId) {
  for (const general of generalsOf(nation)) {
    general.divisions = general.divisions.filter((id) => id !== armyId);
  }
}

/** Saldırganlık kademesi: 1 temkinli, 2 dengeli, 3 saldırgan. */
export function setAggression(general, level) {
  if (!general) return null;
  general.aggression = Math.max(1, Math.min(3, Math.round(level) || 2));
  return general.aggression;
}

function traitSum(general, key) {
  if (!general?.traits?.length) return 0;
  return general.traits.reduce((sum, id) => sum + (TRAITS[id]?.[key] ?? 0), 0);
}

/**
 * Generalin muharebe çarpanı. Yetenek her kademede %6, nitelikler kendi
 * alanlarında ekler. Generalsiz ordu 1.0 alır — ceza değil, sadece bonussuz.
 */
export function generalModifier(general, { defending = false, army = null } = {}) {
  if (!general) return 1;
  let bonus = general.skill * 0.06;
  bonus += defending ? traitSum(general, 'defense') : traitSum(general, 'attack');
  // Kol bonusu yığındaki o koldan alayların payı kadar etki eder.
  const armTrait = general.traits?.find((id) => TRAITS[id]?.armBonus);
  if (armTrait && army?.regiments?.length) {
    const wanted = TRAITS[armTrait].armBonus;
    const share = army.regiments.filter((r) => r.typeId === wanted).length / army.regiments.length;
    bonus += TRAITS[armTrait].arm * share;
  }
  return 1 + bonus;
}

/** Mühendis generalin görmezden geldiği arazi/tahkimat payı. */
export function generalSiegeRelief(general) {
  return Math.min(0.6, traitSum(general, 'siege'));
}

/** Muharebe zarındaki ek oynaklık (Trickster). */
export function generalVariance(general) {
  return traitSum(general, 'variance');
}

/** Yürüyüş hızına ek (Logistician). */
export function generalMarchBonus(general) {
  return traitSum(general, 'march');
}

/** Cephe planının olgunlaşma hızına ek (Staff Planner). */
export function generalPlanningBonus(general) {
  return traitSum(general, 'planning');
}

/** Muharebeden tecrübe: her raund bir miktar, kademe dolunca yetenek artar. */
export function addExperience(general, amount) {
  if (!general || general.skill >= MAX_SKILL) return false;
  general.xp += amount;
  let promoted = false;
  while (general.xp >= XP_PER_SKILL && general.skill < MAX_SKILL) {
    general.xp -= XP_PER_SKILL;
    general.skill++;
    promoted = true;
  }
  if (general.skill >= MAX_SKILL) general.xp = 0;
  return promoted;
}

/** Yeni subay yetiştirmenin bedeli; kadro büyüdükçe pahalanır. */
export function generalCost(nation) {
  return { gold: 60 + generalsOf(nation).length * 25 };
}

/**
 * İki ordu birleşirken komutayı çözer: yetenekli general yığının başında kalır,
 * diğeri boşta kadroya döner. Kaynağın generali serbest bırakılmazsa artık var
 * olmayan bir orduya bağlı kalıyordu.
 */
export function mergeCommand(nation, target, source) {
  if (!nation) return null;
  const keep = generalOfArmy(nation, target);
  const incoming = generalOfArmy(nation, source);
  // Kaynak tümen yok oluyor: her komutadan düşer.
  releaseArmy(nation, source.id);
  if (keep) return keep;
  // Hedefin komutanı yoksa kaynağınki yığını devralır.
  if (incoming) {
    if (!incoming.divisions.includes(target.id)) incoming.divisions.push(target.id);
    return incoming;
  }
  return null;
}

/**
 * Güvenlik süpürgesi: ordusu artık var olmayan generalleri boşta kadroya alır.
 * Ordu birden çok yoldan yok olabiliyor (muharebe, kıtlık, dağıtım); tek tek
 * kancalamak yerine haftada bir toparlamak daha sağlam.
 */
export function reconcileGenerals(world) {
  let released = 0;
  for (const nation of world.nations) {
    for (const general of generalsOf(nation)) {
      const before = general.divisions.length;
      general.divisions = general.divisions.filter(
        (id) => world.units.some((unit) => unit.id === id && unit.nationId === nation.id),
      );
      released += before - general.divisions.length;
    }
  }
  return released;
}
