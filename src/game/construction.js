// State construction: deterministik planlama bolgeleri, kalici binalar ve
// Victoria 3 benzeri ulusal insaat gucuyle ilerleyen tek bir oncelik kuyrugu.

import { occupiedShareOf, provinceName } from './provinces.js';
import { controllerOf } from './control.js';

// Birim artık 2-7 hexlik province KÜMESİDİR (bkz. world/provinces-gen.js):
// state başına ~3 küme ≈ eski 14 karelik hedefle aynı yüzölçümü.
const TARGET_PROVINCES_PER_REGION = 3;
const MIN_REGIONS = 1;
const MAX_REGIONS = 12;

export const BASE_CONSTRUCTION_POWER = 5;

/**
 * YERLESIK YAPI TABLOSUNDA YALNIZ KALE KALDI.
 *
 * Eski dort yapinin ucu (Construction Sector, Administration, University)
 * KONUM TESTINI gecemiyordu: etkileri `constructionCount` uzerinden ULUSAL
 * birer sayacti, secilen bolgenin hicbir onemi yoktu ve iki beta boyunca
 * tek bir oyuncu bile Sector disinda bir sey kurmadi. Ucu de ulusal kurum/
 * kapasite olarak devam ediyor (bkz. NATIONAL_INVESTMENTS ve economy.js
 * taxEfficiency): kavram duruyor, harita spam'i gitti.
 *
 * Kale kaliyor cunku konum GERCEKTEN fark yaratabilir — ve artik yaratiyor:
 * etkisi bolge geneli bir yuzde degil, CAPA KARESI cevresindeki yerel bir
 * savunma katkisi (bkz. fortDefenseAt). "Nereye kale?" ilk kez bir karar.
 */
export const CONSTRUCTION_TYPES = {
  FORT: {
    id: 'FORT', name: 'Fort', icon: '🛡',
    cost: 70, upkeep: 1.5, maxPerRegion: 3,
    desc: '+10% defender power on and around the fort hex (2-hex radius).',
  },
};

/**
 * ULUSAL YATIRIMLAR: eski bina spam'inin kurum hali. Iki kural:
 *   1. Yatirim da insaat kuyruguna girer ve ayni insaat gucunu tuketir —
 *      "kapasiteye mi, fabrikaya mi" firsat maliyeti aynen korunur.
 *   2. Maliyet seviyeyle buyur: sinirsiz kapasite yigmak dogru cevap olamaz
 *      (eski bolge-yuvasi freninin ulusal karsiligi artan fiyat + bakim).
 */
export const NATIONAL_INVESTMENTS = {
  CONSTRUCTION_CAPACITY: {
    id: 'CONSTRUCTION_CAPACITY', name: 'Construction Capacity', icon: '🏗',
    field: 'construction',
    baseCost: 100, costGrowth: 0.35, upkeep: 4, max: null,
    desc: '+5 weekly construction power per level. Each level costs more and adds upkeep.',
  },
  HIGHER_EDUCATION: {
    id: 'HIGHER_EDUCATION', name: 'Higher Education', icon: '🎓',
    field: 'education',
    baseCost: 120, costGrowth: 0.6, upkeep: 3, max: 4,
    // Seviye adlari ekranda: kurum bir sayac degil, ulkenin egitim iskeleti.
    levels: ['No organised higher education', 'Limited Academies',
      'Regional Colleges', 'National University Network', 'Research Institutions'],
    // Bir sonraki seviyeye YATIRIM YAPABILMEK icin gereken egitim butcesi:
    // universite okulsuz olmaz. Kaydiraca ilk kez max-disi bir anlami olan
    // gercek bir esik baglanmis oluyor.
    educationFloor: [0, 25, 40, 55, 70],
    desc: 'Qualifies the industrial workforce and raises the literacy ceiling; feeds research through literacy.',
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function tileOrder(a, b) {
  return a.r - b.r || a.q - b.q;
}

/** Küme sıralaması: merkez karesinin satır-major konumu (deterministik). */
function clusterOrder(a, b) {
  return a.center.r - b.center.r || a.center.q - b.center.q;
}

function chooseSeeds(world, clusters, capitalCluster, count) {
  const ordered = [...clusters].sort(clusterOrder);
  const first = capitalCluster && clusters.includes(capitalCluster) ? capitalCluster : ordered[0];
  const seeds = [first];
  while (seeds.length < count) {
    let best = null;
    let bestDistance = -1;
    for (const cluster of ordered) {
      if (seeds.includes(cluster)) continue;
      // Ic dongu tahsissiz: map + spread aday basina dizi kuruyordu ve bu
      // fonksiyon atlas her tazelendiginde kosuyor.
      let distance = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const next = world.wrapDistance(
          cluster.center.q, cluster.center.r, seeds[i].center.q, seeds[i].center.r,
        );
        if (next < distance) distance = next;
      }
      if (distance > bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }
    if (!best) break;
    seeds.push(best);
  }
  return seeds;
}

function nearestSeed(world, cluster, seeds) {
  let winner = 0;
  let distance = Infinity;
  for (let index = 0; index < seeds.length; index++) {
    const next = world.wrapDistance(
      cluster.center.q, cluster.center.r, seeds[index].center.q, seeds[index].center.r,
    );
    if (next < distance) {
      winner = index;
      distance = next;
    }
  }
  return winner;
}

function displayCenter(world, tiles) {
  const q = tiles.reduce((sum, tile) => sum + tile.q, 0) / Math.max(1, tiles.length);
  const r = tiles.reduce((sum, tile) => sum + tile.r, 0) / Math.max(1, tiles.length);
  return [...tiles].sort((a, b) => (
    world.wrapDistance(a.q, a.r, q, r) - world.wrapDistance(b.q, b.r, q, r)
  ) || tileOrder(a, b))[0];
}

/**
 * Kuyruk artik yalniz bina tasimaz: fabrika kurulumu ve seviye atlamasi da
 * ayni ulusal insaat gucunu paylasir. Boylece "kim insa edebilir" (politika),
 * "parayi kim veriyor" (hazine/ozel sermaye) ve "ne kadar hizli" (insaat gucu)
 * tek bir zincire baglanir.
 *
 * Bina projeleri yalniz is ister; fabrika projeleri hem is hem para ister ve
 * odenmemis kismin otesine ilerleyemez.
 */
export const PROJECT_KIND = {
  BUILDING: 'building', FACTORY: 'factory', UPGRADE: 'upgrade',
  /** Ulusal yatirim: bolgesiz proje, tamamlaninca kapasite seviyesi artar. */
  NATIONAL: 'national',
};

/**
 * Yerinde düzeltir, kopya üretmez. Kopyalasaydı ensureConstruction'ın her
 * çağrısı proje nesnelerini tazeler ve dışarıda tutulan bir referansa yapılan
 * ödeme (bkz. fundProject) sessizce kaybolurdu.
 */
function normalizeProject(project) {
  project.kind ??= PROJECT_KIND.BUILDING;
  const work = Number.isFinite(project.work)
    ? project.work
    : CONSTRUCTION_TYPES[project.typeId]?.cost ?? 0;
  // Yazim yalniz deger degisince: degismeyen ondalik alani her cagrida geri
  // yazmak V8'de yeni HeapNumber kutulamasi demek (bkz. ensureConstruction).
  const boundedWork = Math.max(1, work);
  if (project.work !== boundedWork) project.work = boundedWork;
  const cost = Math.max(0, Number(project.cost) || 0);
  if (project.cost !== cost) project.cost = cost;
  const funded = Math.max(0, Number(project.funded) || 0);
  if (project.funded !== funded) project.funded = funded;
  const progress = Math.max(0, Number(project.progress) || 0);
  if (project.progress !== progress) project.progress = progress;
  return project;
}

function validBuilding(building) {
  return Boolean(CONSTRUCTION_TYPES[building.typeId])
    && (typeof building.regionId === 'string' || Number.isFinite(building.q));
}

function validProject(project) {
  if (project.kind === PROJECT_KIND.NATIONAL) {
    return Boolean(NATIONAL_INVESTMENTS[project.typeId]);
  }
  return project.kind && project.kind !== PROJECT_KIND.BUILDING
    ? Number.isFinite(project.q)
    : Boolean(CONSTRUCTION_TYPES[project.typeId])
      && (typeof project.regionId === 'string' || Number.isFinite(project.q));
}

export function ensureConstruction(nation) {
  nation.construction ??= {
    nextId: 1,
    buildings: [],
    projects: [],
    completedFactories: [],
    lastCompleted: 0,
    capacity: { construction: 0, education: 0 },
  };
  const state = nation.construction;
  state.capacity ??= { construction: 0, education: 0 };
  if (!Number.isFinite(state.capacity.construction)) state.capacity.construction = 0;
  if (!Number.isFinite(state.capacity.education)) state.capacity.education = 0;
  if (!Number.isFinite(state.nextId) || state.nextId < 1) {
    state.nextId = Math.max(1, Number(state.nextId) || 1);
  }
  // Bu fonksiyon her insaat okumasinda kosar; filtre/map her cagrida yeni
  // dizi kuruyordu (olculdu: ~0.4 MB/hafta). Kopya yalniz gercekten dusecek
  // kayit varken alinir; normalizeProject zaten yerinde duzeltir.
  state.buildings ??= [];
  if (!state.buildings.every(validBuilding)) {
    state.buildings = state.buildings.filter(validBuilding);
  }
  state.projects ??= [];
  if (!state.projects.every(validProject)) {
    state.projects = state.projects.filter(validProject);
  }
  for (let i = 0; i < state.projects.length; i++) normalizeProject(state.projects[i]);
  state.completedFactories ??= [];
  state.lastCompleted ??= 0;
  return state;
}

/** Fabrika/seviye projesini kuyruga ekler. Parasi ayri akar (bkz. fundProject). */
export function queueIndustryProject(game, nation, project) {
  const state = ensureConstruction(nation);
  const queued = normalizeProject({ ...project, id: state.nextId++, started: game.world.turn });
  state.projects.push(queued);
  game.emit('construction', state);
  return queued;
}

/**
 * Projeye para koyar. Kapitalistler kendi sermayelerinden, oyuncu hazineden
 * destek verir; ilerleme odenen orani asamaz.
 */
export function fundProject(project, amount) {
  const paid = Math.max(0, Math.min(amount, Math.max(0, project.cost - project.funded)));
  project.funded += paid;
  return paid;
}

export function projectFundingRatio(project) {
  return project.cost > 0 ? Math.min(1, project.funded / project.cost) : 1;
}

export function initConstruction(world) {
  for (const nation of world.nations) {
    nation.construction = {
      nextId: 1,
      buildings: [],
      projects: [],
      lastCompleted: 0,
      capacity: { construction: 0, education: 0 },
    };
  }
}

export function constructionCount(nation, typeId, regionId = null) {
  const state = ensureConstruction(nation);
  let count = 0;
  for (const building of state.buildings) {
    if (building.typeId === typeId
      && (regionId == null || building.regionId === regionId)) count++;
  }
  return count;
}

/**
 * Binalarin ne kadarinin calistigi. Eskiden `nation.gold > 0` ikili kapisiydi:
 * hazine 1 altindan 0 altina inince ulke butun altyapisini bir anda
 * kaybediyordu (olculdu: insaat gucu 125 -> 5, vergi carpani 1.04 -> 1.00).
 * Olcut artik borcunu odeyebilmek: temerrude dusen devletin binalari kademeli
 * korelir (bkz. economy.js settleDebt creditPenalty).
 */
function upkeepFactor(nation) {
  return 1 - clamp(nation.economy?.creditPenalty ?? 0, 0, 0.85);
}

/** Ulusal yatirim seviyesi (bkz. NATIONAL_INVESTMENTS). */
export function investmentLevel(nation, investmentId) {
  const info = NATIONAL_INVESTMENTS[investmentId];
  if (!info) return 0;
  return ensureConstruction(nation).capacity[info.field] ?? 0;
}

/** Kuyruktaki (tamamlanmamis) ayni yatirim sayisi: ust uste seviye pahalanir. */
function pendingInvestments(nation, investmentId) {
  return ensureConstruction(nation).projects.filter(
    (project) => project.kind === PROJECT_KIND.NATIONAL && project.typeId === investmentId,
  ).length;
}

/** Bir sonraki seviyenin bedeli. Kuyruktakiler de sayilir: fiyat kacirilamaz. */
export function investmentCost(nation, investmentId) {
  const info = NATIONAL_INVESTMENTS[investmentId];
  if (!info) return Infinity;
  const level = investmentLevel(nation, investmentId) + pendingInvestments(nation, investmentId);
  return Math.round(info.baseCost * (1 + level * info.costGrowth));
}

export function constructionPower(nation) {
  const capacity = investmentLevel(nation, 'CONSTRUCTION_CAPACITY') * 5;
  // Demiryolu teknolojileri insaat gucunu buyutur (Infrastructure klasoru).
  // Duz alan okumasi: `economy.techMods` haftada bir kez kurulur, burasi
  // sicak yoldur (bkz. technology.js refreshTechModifiers).
  const tech = 1 + (nation.economy?.techMods?.constructionPower ?? 0);
  return (BASE_CONSTRUCTION_POWER + capacity * upkeepFactor(nation)) * tech;
}

export function constructionUpkeep(nation) {
  const state = ensureConstruction(nation);
  const buildings = state.buildings.reduce(
    (sum, building) => sum + (CONSTRUCTION_TYPES[building.typeId]?.upkeep ?? 0), 0,
  );
  let capacity = 0;
  for (const info of Object.values(NATIONAL_INVESTMENTS)) {
    capacity += (state.capacity[info.field] ?? 0) * info.upkeep;
  }
  return buildings + capacity;
}

/**
 * Yuksekogretim kurumunun isgucu/okuryazarlik katkisi. Eski universite
 * binasinin ulusal sayaci (6 bina x %4 = %24 tavan) seviye esdegerine
 * cevrildi: 4. seviye ayni %24 tavani verir — gocte deger kaybi yok.
 */
export function higherEducationBonus(nation) {
  return Math.min(0.24, investmentLevel(nation, 'HIGHER_EDUCATION') * 0.06)
    * upkeepFactor(nation);
}

/** Kale etki yaricapi (hex) ve kale basina savunma katkisi. */
export const FORT_RADIUS = 2;
export const FORT_DEFENSE = 0.10;
const FORT_DEFENSE_CAP = 0.24;

/**
 * Karedeki tahkimat katkisi: capa karesine FORT_RADIUS icindeki kaleler.
 *
 * IKI KASITLI DEGISIKLIK:
 *   1. Etki artik bolge-geneli bir sayac degil, kalenin DIKILDIGI yere bagli.
 *      "Nereye kale?" sorusunun cevabi ilk kez haritada okunuyor.
 *   2. Atlas kullanilmiyor. Eski yol `constructionAtlas` uzerinden gidiyordu
 *      ve isgalli bolge atlastan dustugu icin kalenin bonusu TAM kendi bolgesi
 *      istila edildiginde buharlasiyordu — kale en cok gerektigi anda yok
 *      oluyordu (denetim bulgusu). Capa dogrudan cozulur; kale ancak capa
 *      karesi fiilen dusman eline gecince (captureConstructionAt) el degistirir.
 */
export function fortDefenseAt(world, nationId, tile) {
  if (!tile || tile.owner !== nationId) return 0;
  const nation = world.nations[nationId];
  if (!nation) return 0;
  const state = ensureConstruction(nation);
  let defense = 0;
  for (const building of state.buildings) {
    if (building.typeId !== 'FORT' || !Number.isFinite(building.q)) continue;
    if (world.wrapDistance(building.q, building.r, tile.q, tile.r) > FORT_RADIUS) continue;
    defense += FORT_DEFENSE;
  }
  return Math.min(FORT_DEFENSE_CAP, defense) * upkeepFactor(nation);
}

/**
 * Bölge hesabı O(bölge² × kare) tutar ve sanayi ekranı bunu tip × state başına
 * sorar. Sonuç yalnız *hangi karelerin* bize ait olduğuna bağlı olduğu için
 * ucuz bir imzayla önbelleğe alınır: sınır değişmediyse aynı atlas döner.
 */
const atlasCache = new WeakMap();

function territorySignature(owned) {
  let signature = owned.length;
  for (const cluster of owned) signature = (signature * 31 + cluster.id * 73 + 7) % 2147483647;
  return signature;
}

export function constructionAtlas(world, nationId) {
  const nation = world?.nations?.[nationId];
  // Planlama birimi küme: yalnız hukuken sahip olunan VE tamamen huzurlu
  // (işgalsiz) kümeler. Savaş bölgesinde şantiye açılmaz.
  const owned = (world?.provinces ?? []).filter(
    (cluster) => cluster.owner === nationId && cluster.econ
      && occupiedShareOf(world, cluster) === 0,
  );
  if (!nation || !owned.length) {
    return { nationId, regions: [], tileRegions: new Map(), slots: 0, used: 0, free: 0 };
  }

  // Bina/proje listeleri atlas içinde okunduğu için imzaya onlar da girer.
  const state = ensureConstruction(nation);
  const signature = `${territorySignature(owned)}:${state.buildings.length}:${state.projects.length}`;
  if (!atlasCache.has(world)) atlasCache.set(world, new Map());
  const perWorld = atlasCache.get(world);
  const cached = perWorld.get(nationId);
  if (cached?.signature === signature) return cached.atlas;

  const regionCount = clamp(
    Math.ceil(owned.length / TARGET_PROVINCES_PER_REGION),
    MIN_REGIONS,
    MAX_REGIONS,
  );
  const capitalCluster = nation.capital?.provinceId >= 0
    ? world.provinces[nation.capital.provinceId] : null;
  const seeds = chooseSeeds(world, owned, owned.includes(capitalCluster) ? capitalCluster : null, regionCount);
  const regions = seeds.map((seed, index) => ({
    id: `${nationId}:${index}`,
    index,
    seed,
    provinces: [],
    tiles: [],
    cities: [],
    population: 0,
    development: 0,
  }));
  const tileRegions = new Map();

  for (const cluster of owned) {
    const region = regions[nearestSeed(world, cluster, seeds)];
    region.provinces.push(cluster);
    region.population += cluster.econ.population;
    region.development += cluster.econ.agriculture
      + cluster.econ.extraction + cluster.econ.commerce;
    for (const idx of cluster.tileIdx) {
      const tile = world.tiles[idx];
      region.tiles.push(tile);
      tileRegions.set(tile, region);
    }
  }

  for (const city of world.cities.filter((candidate) => candidate.nationId === nationId)) {
    tileRegions.get(city.tile)?.cities.push(city);
  }

  for (const region of regions) {
    region.center = displayCenter(world, region.tiles);
    region.name = region.cities[0]?.name ?? region.seed.name;
    const capacity = 3 + Math.floor(region.tiles.length / 6)
      + Math.floor(region.population / 70000) + Math.floor(region.development / 12);
    region.slots = clamp(capacity, 4, 12);
    const state = ensureConstruction(nation);
    const inRegion = (item) => {
      if (Number.isFinite(item.q) && Number.isFinite(item.r)) {
        const anchor = world.get(item.q, item.r);
        return anchor?.owner === nationId && controllerOf(anchor) === nationId
          && tileRegions.get(anchor)?.id === region.id;
      }
      return item.regionId === region.id;
    };
    region.buildings = state.buildings.filter(inRegion);
    region.projects = state.projects.filter(inRegion);
    // Yuva sayımı yalnız binaları kapsar. Fabrikanın kendi kuralı var (state
    // başına tür başına bir tesis); sanayi projesi kuyruğa girdi diye kışla
    // yeri işgal etmemeli.
    region.industryProjects = region.projects.filter(
      (project) => project.kind && project.kind !== PROJECT_KIND.BUILDING,
    );
    region.used = region.buildings.length
      + (region.projects.length - region.industryProjects.length);
    region.free = Math.max(0, region.slots - region.used);
    region.freeRatio = region.slots ? region.free / region.slots : 0;
    region.status = region.free === 0 ? 'full' : region.used > 0 ? 'partial' : 'open';
  }

  const atlas = {
    nationId,
    regions,
    tileRegions,
    slots: regions.reduce((sum, region) => sum + region.slots, 0),
    used: regions.reduce((sum, region) => sum + region.used, 0),
    free: regions.reduce((sum, region) => sum + region.free, 0),
  };
  perWorld.set(nationId, { signature, atlas });
  return atlas;
}

export function canQueueConstruction(world, nation, regionId, typeId) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!nation?.alive || !type) return false;
  // Bina bedeli PESIN odenir. Eskiden `cost` yalniz `work` (insaat isi) olarak
  // okunuyordu ve dort bina turu de hazineden sifir altin cikariyordu: sinirsiz
  // bedava santiye, bedava vergi carpani, bedava kale (olculdu).
  if ((nation.gold ?? 0) < type.cost) return false;
  const region = constructionAtlas(world, nation.id).regions.find((item) => item.id === regionId);
  if (!region || region.free <= 0) return false;
  const sameType = region.buildings.filter((building) => building.typeId === typeId).length
    + region.projects.filter((project) => project.typeId === typeId).length;
  return sameType < type.maxPerRegion;
}

/**
 * @param {object|null} anchor Kale icin secilen kare. Kalenin etkisi capaya
 *   bagli oldugu icin (bkz. fortDefenseAt) oyuncu haritada gercek bir kare
 *   secebilir; verilmezse bolge merkezine oturur (ekran satirindan kuyruk).
 */
export function queueConstruction(game, nationId, regionId, typeId, anchor = null) {
  const nation = game.world.nations[nationId];
  if (!canQueueConstruction(game.world, nation, regionId, typeId)) return false;
  const state = ensureConstruction(nation);
  const atlas = constructionAtlas(game.world, nationId);
  const region = atlas.regions.find((item) => item.id === regionId);
  // Capa ancak o bolgenin kendi karesi olabilir; yoksa merkez.
  const anchorTile = anchor && atlas.tileRegions.get(anchor)?.id === regionId
    ? anchor : region.center;
  const price = CONSTRUCTION_TYPES[typeId].cost;
  nation.gold -= price;
  // Insaat kalemine yazilir (bkz. economy.js updateLedger projectCost).
  if (nation.economy) nation.economy.projectGold = (nation.economy.projectGold ?? 0) + price;
  state.projects.push({
    id: state.nextId++, typeId, regionId, regionName: region.name,
    q: anchorTile.q, r: anchorTile.r,
    // Is ve para ayri iki sayidir: `work` haftalik insaat gucuyle, `cost`
    // hazineyle odenir. Pesin odendigi icin `funded` bastan doludur.
    work: price, cost: price, funded: price,
    progress: 0, started: game.turns.turn,
  });
  // Kuyruk değişimi harita görselini yalnız inşaat kipinde etkiler; tam
  // geçersizleme YZ kuyruğu oynadıkça her tur tüm önbelleği yakıyordu.
  game.renderer.invalidateConstruction?.();
  game.emit('construction', state);
  game.requestRender();
  return true;
}

/**
 * Ulusal yatirimin kuyruga girememe nedeni; null = girebilir. Ekran nedeni
 * yazar (kapali dugme sebepsiz olmaz — bu oyunun tek sert UI kuralidir).
 */
export function investmentBlocker(nation, investmentId) {
  const info = NATIONAL_INVESTMENTS[investmentId];
  if (!nation?.alive || !info) return 'unavailable';
  const level = investmentLevel(nation, investmentId) + pendingInvestments(nation, investmentId);
  if (info.max != null && level >= info.max) return 'already at the highest level';
  if (info.educationFloor) {
    const need = info.educationFloor[Math.min(level + 1, info.educationFloor.length - 1)];
    const education = nation.economy?.social?.education ?? 0;
    if (education < need) {
      return `needs the education budget at ${need}% (now ${education}%)`;
    }
  }
  const cost = investmentCost(nation, investmentId);
  if ((nation.gold ?? 0) < cost) {
    return `treasury short by ¤${Math.ceil(cost - (nation.gold ?? 0))}`;
  }
  return null;
}

export function canQueueInvestment(nation, investmentId) {
  return investmentBlocker(nation, investmentId) === null;
}

/** Ulusal yatirimi kuyruga sokar: bedel pesin, is insaat gucunden. */
export function queueInvestment(game, nationId, investmentId) {
  const nation = game.world.nations[nationId];
  if (!nation || !canQueueInvestment(nation, investmentId)) return false;
  const info = NATIONAL_INVESTMENTS[investmentId];
  const state = ensureConstruction(nation);
  const price = investmentCost(nation, investmentId);
  nation.gold -= price;
  if (nation.economy) nation.economy.projectGold = (nation.economy.projectGold ?? 0) + price;
  state.projects.push({
    id: state.nextId++,
    kind: PROJECT_KIND.NATIONAL,
    typeId: investmentId,
    regionName: info.name,
    work: price, cost: price, funded: price,
    progress: 0, started: game.turns.turn,
  });
  game.emit('construction', state);
  game.requestRender();
  return true;
}

/**
 * Bir yatirim seviyesini LAGVEDER: iade yok, yalniz bakim yuku duser.
 * Kurumu dagitmak paranin geri gelmesi degildir — ama tek yonlu bir tuzak
 * da degildir: mali kriz kapasiteyi tasfiye ederek asilabilmeli (hem YZ'nin
 * temerrut sarmalindan cikisi hem oyuncunun "yanlis yatirdim" pismanligi).
 */
export function dropInvestmentLevel(nation, investmentId) {
  const info = NATIONAL_INVESTMENTS[investmentId];
  if (!nation || !info) return false;
  const state = ensureConstruction(nation);
  if ((state.capacity[info.field] ?? 0) <= 0) return false;
  state.capacity[info.field] -= 1;
  return true;
}

/** Ayni tasfiye, UI yolu: olay + kare istegiyle. */
export function divestInvestment(game, nationId, investmentId) {
  const nation = game.world.nations[nationId];
  if (!nation || !dropInvestmentLevel(nation, investmentId)) return false;
  game.emit('construction', ensureConstruction(nation));
  game.requestRender();
  return true;
}

export function cancelConstruction(game, nationId, projectId) {
  const nation = game.world.nations[nationId];
  if (!nation) return false;
  const state = ensureConstruction(nation);
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return false;
  // Harcanmamis para geri doner. Eskiden iptal edilen projenin pesin odenen
  // bedeli tamamen kayboluyordu (olculdu: 434 altin odendi, 0 altin dondu).
  // Yapilan is batiktir; iade yalniz henuz insa EDILMEMIS kisim icindir.
  const project = state.projects[index];
  const done = project.work > 0 ? clamp(project.progress / project.work, 0, 1) : 1;
  const refund = Math.max(0, (project.funded ?? 0) * (1 - done));
  if (refund > 0) {
    if (project.actor === 'private' && nation.politics) {
      nation.politics.privateCapital = Math.min(1200, (nation.politics.privateCapital ?? 0) + refund);
    } else {
      nation.gold += refund;
      if (nation.economy) {
        nation.economy.projectGold = Math.max(0, (nation.economy.projectGold ?? 0) - refund);
      }
    }
  }
  state.projects.splice(index, 1);
  game.renderer.invalidateConstruction?.();
  game.emit('construction', state);
  game.requestRender();
  return true;
}

/**
 * Projeyi kuyrugun basina ya da sonuna tasir.
 *
 * NEDEN AYRI BIR FIIL: tek adimlik ▲ ile 8 kalemlik kuyrugun basina cikmak
 * ~20 tik ediyor ve satirlar her tiktan sonra imlecin altinda yeniden
 * numaralaniyor. Beta testcisi bunu iki kez yanlis yapti — bir keresinde
 * yukseltmeye calistigi kalemi DUSURDU — ve bunu oyundaki en kotu etkilesim
 * olarak isaretledi (§7-1 SEVERE). Karar iyi, arac kotuydu; degisen yalniz
 * arac.
 */
export function moveConstructionTo(game, nationId, projectId, edge) {
  const nation = game.world.nations[nationId];
  if (!nation) return false;
  const state = ensureConstruction(nation);
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return false;
  const [project] = state.projects.splice(index, 1);
  if (edge === 'top') state.projects.unshift(project);
  else state.projects.push(project);
  game.emit('construction', state);
  return true;
}

export function prioritizeConstruction(game, nationId, projectId, direction) {
  const nation = game.world.nations[nationId];
  if (!nation) return false;
  const state = ensureConstruction(nation);
  const index = state.projects.findIndex((project) => project.id === projectId);
  const target = index + Math.sign(direction);
  if (index < 0 || target < 0 || target >= state.projects.length) return false;
  [state.projects[index], state.projects[target]] = [state.projects[target], state.projects[index]];
  game.emit('construction', state);
  return true;
}

export function captureConstructionAt(world, tile, newNationId) {
  if (!tile || tile.owner < 0 || tile.owner === newNationId) return 0;
  const oldNation = world.nations[tile.owner];
  const newNation = world.nations[newNationId];
  if (!oldNation || !newNation) return 0;
  const oldState = ensureConstruction(oldNation);
  const newState = ensureConstruction(newNation);
  const captured = oldState.buildings.filter(
    (building) => building.q === tile.q && building.r === tile.r,
  );
  oldState.buildings = oldState.buildings.filter(
    (building) => building.q !== tile.q || building.r !== tile.r,
  );
  // Tamamlanmamis proje province kaybedildiginde iptal olur; bitmis bina devredilir.
  oldState.projects = oldState.projects.filter(
    (project) => project.q !== tile.q || project.r !== tile.r,
  );
  for (const building of captured) {
    newState.buildings.push({
      ...building,
      id: `captured-${newNationId}-${newState.nextId++}`,
      regionId: `${newNationId}:captured`,
    });
  }
  return captured.length;
}

/**
 * Biten projeyi karşılar. Bina burada doğar; fabrika ve seviye projeleri
 * economy.js'e devredilir — bu dosya FACTORIES'i tanımaz, tanısa iki modül
 * birbirine düğümlenirdi (bkz. CLAUDE.md katman kuralı).
 */
function completeProject(game, nation, project) {
  const state = ensureConstruction(nation);
  if (project.kind === PROJECT_KIND.NATIONAL) {
    const info = NATIONAL_INVESTMENTS[project.typeId];
    // Tavanli yatirim tavani asamaz (gocten gelen fazla proje sessizce biter).
    if (info && (info.max == null || (state.capacity[info.field] ?? 0) < info.max)) {
      state.capacity[info.field] = (state.capacity[info.field] ?? 0) + 1;
      if (nation.id === game.turns.playerNation) {
        const level = state.capacity[info.field];
        const name = info.levels?.[Math.min(level, (info.levels?.length ?? 1) - 1)] ?? `level ${level}`;
        game.turns.addLog(`${info.name} reached ${info.levels ? name : `level ${level}`}.`,
          { kind: 'BUILDING' });
      }
    }
    return;
  }
  if (project.kind !== PROJECT_KIND.BUILDING) {
    state.completedFactories.push(project);
    return;
  }
  state.buildings.push({
    id: `building-${nation.id}-${project.id}`,
    typeId: project.typeId,
    regionId: project.regionId,
    regionName: project.regionName,
    q: project.q,
    r: project.r,
    completed: game.turns.turn,
  });
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`${CONSTRUCTION_TYPES[project.typeId].name} completed in ${project.regionName}.`,
      { kind: 'BUILDING' });
  }
}

/**
 * YZ'nin bina karari. runEconomy icinden, defter yazilmadan ONCE cagrilir:
 * bina bedeli artik pesin odendigi icin (bkz. queueConstruction) burada
 * harcanan altin ayni haftanin defterine girmeli. runConstruction'in icinden
 * cagrildiginda harcama updateLedger'dan sonra oluyor ve haftalik muhasebe
 * kimligi tam bina bedeli kadar sapiyordu (olculdu: en kotu sapma 100.00).
 */
/**
 * YZ'nin kale yeri: savastigi (yoksa herhangi bir yabanci) sinira bakan kendi
 * karesi; sehir yakini one gecer. Tam dunya taramasi bilerek burada — yalniz
 * kale kararina gelindiginde kosar, haftalik sicak yolda degil.
 */
function frontierFortAnchor(game, nation) {
  const world = game.world;
  let best = null;
  let bestScore = -Infinity;
  world.forEach((tile) => {
    if (tile.owner !== nation.id || !tile.terrain.passable) return;
    let border = 0;
    let hostile = 0;
    for (const near of world.neighbors(tile)) {
      const owner = controllerOf(near);
      if (owner < 0 || owner === nation.id || !near.terrain.passable) continue;
      border++;
      // atWar import edilmez: diplomacy.js bu dosyayi import ediyor, ters yon
      // dongu olurdu. Iliski kaydi dogrudan okunur (ayni tanim: state==='war').
      if (world.relations?.[nation.id]?.[owner]?.state === 'war') hostile++;
    }
    if (!border) return;
    // Var olan kalenin yaricapina ikinci kale dikilmez: etki zaten tavanli.
    const covered = fortDefenseAt(world, nation.id, tile) > 0;
    const score = hostile * 40 + border * 10 + (tile.city ? 25 : 0) - (covered ? 100 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  });
  return bestScore > 0 ? best : null;
}

export function planConstructionAI(game, nation) {
  const state = ensureConstruction(nation);
  if (nation.id === game.turns.playerNation || nation.gold < 180) return;
  // Mali sagligi bozuk ulke yeni bakim yuku ALMAZ: temerrut izi tasiyan ya da
  // yarim yillik gelirinden fazla borcu olan YZ once toparlanir. Hazine stogu
  // tek basina yaniltici — savas kasasi biriktiren ulke "zengin" gorunuyordu,
  // yeni seviyenin bakimi baris gelirini asiyordu (bkz. adjustWarFiscalAI
  // tasfiye notu: ayni sarmalin onleyici yuzu).
  const ledger = nation.economy?.ledger;
  if ((nation.economy?.creditPenalty ?? 0) > 0.05) return;
  if ((nation.debt ?? 0) > Math.max(50, (ledger?.income ?? 0) * 13)) return;
  // Yalniz bina/yatirim projeleri sayilir: fabrika kuyrugu dolu diye ulke
  // kapasiteye yatirim yapamaz hale gelmemeli.
  const pendingBuildings = state.projects.filter(
    (project) => project.kind === PROJECT_KIND.BUILDING
      || project.kind === PROJECT_KIND.NATIONAL,
  ).length;
  if (pendingBuildings) return;
  // Yalniz FONLANMIS is sayilir: kapitalistin parasiz projesi guc TUKETEMEZ
  // (runConstruction odenmemis payi atlar). Fonlanmamis isi saymak YZ'yi
  // surekli "bogulmus" gosterdi ve kapasite yigmasina yol acti (olculdu:
  // 520 haftada seviye 26-33, bakim bataryasi 19/30 ulkeyi iflasa surdu).
  const queuedWork = state.projects.reduce(
    (sum, project) => sum + Math.max(
      0, Math.min(project.work, project.work * projectFundingRatio(project)) - project.progress,
    ), 0,
  );
  // Hazine sisiyorsa asil darbogaz insaat gucudur: sanayi kuyrukta bekler,
  // para harcanacak yer bulamaz. Fazla altin kapasiteye gider; artan bakim
  // gideri de biriken parayi geri emer.
  // "Para birikiyor" sinyali tek basina akis saglikliysa gecerli: haftalik
  // net eksideyken hazine stoguna bakip kapasite almak bakim tuzagi kurmakti.
  const starved = queuedWork > constructionPower(nation) * 12
    || (nation.gold > 900 && (ledger?.net ?? 0) > 0);
  const capacity = investmentLevel(nation, 'CONSTRUCTION_CAPACITY');
  // YZ tavani: kapasite sanayinin OLCEGIYLE buyur. Eski bolge-yuvasi freninin
  // ulusal karsiligi — sinirsiz birakinca zengin YZ bakim bataryasi kuruyordu.
  const capacityCeiling = 2 + Math.floor((nation.economy?.factories?.length ?? 0) / 3);

  // 1) Ilk kapasite seviyesi her seyden once: taban 5/hafta ile ulke yasayamaz.
  if (capacity < 1 && canQueueInvestment(nation, 'CONSTRUCTION_CAPACITY')) {
    queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
    return;
  }
  // 2) Kuyruk bogulduysa (ya da para birikiyorsa) kapasite buyur — tavana dek.
  if (starved && capacity < capacityCeiling && nation.gold > 400
    && canQueueInvestment(nation, 'CONSTRUCTION_CAPACITY')) {
    queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
    return;
  }
  // 3) Zengin ve okullu ulke yuksekogretime yatirir (YZ mutevazi: 2 seviye).
  if (nation.gold > 500 && investmentLevel(nation, 'HIGHER_EDUCATION') < 2
    && canQueueInvestment(nation, 'HIGHER_EDUCATION')) {
    queueInvestment(game, nation.id, 'HIGHER_EDUCATION');
    return;
  }
  // 4) Kale: siniri olan ulke iki kaleye kadar tahkim eder — ve artik yerini
  //    SECEREK: dusman sinirina, sehre yakin (bkz. frontierFortAnchor).
  if (constructionCount(nation, 'FORT') < 2) {
    const anchor = frontierFortAnchor(game, nation);
    if (!anchor) return;
    const regionId = constructionAtlas(game.world, nation.id).tileRegions.get(anchor)?.id;
    if (regionId && canQueueConstruction(game.world, nation, regionId, 'FORT')) {
      queueConstruction(game, nation.id, regionId, 'FORT', anchor);
    }
  }
}

/**
 * v14 -> v15 kayit gocu: yerlesik bina spam'i ulusal kurumlara cevrilir.
 * OYUNCUNUN YATIRIMI KAYBOLMAZ:
 *   - Construction Sector sayisi -> Construction Capacity seviyesi (1:1 —
 *     guc esdegeri birebir: sektor basina +5, seviye basina +5).
 *   - University sayisi -> Higher Education seviyesi (6 bina %24 tavani
 *     4. seviyenin %24 tavanina esner: level = ceil(uni * 2/3), tavan 4).
 *   - Administration binalari geri odenir (bedelin tamami hazineye):
 *     etkisi (+%4 vergi) taxEfficiency'ye katildigi icin ayri kurum yok;
 *     tipik 1 binali ulkede bakim tasarrufu kaybi asagi yukari karsilar.
 *   - Kuyruktaki eski tip projeler ayni kurala gore ya ulusal yatirima
 *     cevrilir ya iade edilir. Kaleler ve fabrika projeleri aynen kalir.
 */
export function migrateConstructionV14(nation) {
  // DIKKAT: ensureConstruction'dan ONCE kosmali. ensure, tabloda olmayan
  // tipleri (eski Sector/University/Administration kayitlari) filtreleyip
  // atar — goc once HAM kayittan saymali, temizlik sonra gelmeli.
  const state = nation.construction ?? (nation.construction = {});
  const buildings = Array.isArray(state.buildings) ? state.buildings : [];
  const projects = Array.isArray(state.projects) ? state.projects : [];
  state.capacity ??= { construction: 0, education: 0 };
  const count = (typeId) => buildings.filter((b) => b.typeId === typeId).length;
  const sectors = count('CONSTRUCTION_SECTOR');
  const universities = count('UNIVERSITY');
  const administrations = count('ADMINISTRATION');
  state.capacity.construction = (state.capacity.construction ?? 0) + sectors;
  state.capacity.education = Math.min(4,
    (state.capacity.education ?? 0) + Math.ceil((universities * 2) / 3));
  if (administrations > 0) nation.gold = (nation.gold ?? 0) + administrations * 80;
  state.buildings = buildings.filter((b) => CONSTRUCTION_TYPES[b.typeId]);

  const converted = [];
  for (const project of projects) {
    if (project.kind && project.kind !== PROJECT_KIND.BUILDING) {
      converted.push(project);
      continue;
    }
    if (project.typeId === 'CONSTRUCTION_SECTOR' || project.typeId === 'UNIVERSITY') {
      converted.push({
        ...project,
        kind: PROJECT_KIND.NATIONAL,
        typeId: project.typeId === 'UNIVERSITY' ? 'HIGHER_EDUCATION' : 'CONSTRUCTION_CAPACITY',
        regionId: undefined,
        q: undefined,
        r: undefined,
        regionName: project.typeId === 'UNIVERSITY' ? 'Higher Education' : 'Construction Capacity',
      });
      continue;
    }
    if (project.typeId === 'ADMINISTRATION') {
      // Insa edilmemis pay iade edilir (cancelConstruction ile ayni kural).
      const done = project.work > 0 ? clamp(project.progress / project.work, 0, 1) : 1;
      nation.gold += Math.max(0, (project.funded ?? 0) * (1 - done));
      continue;
    }
    converted.push(project);
  }
  state.projects = converted;
  ensureConstruction(nation);
  return state;
}

export function runConstruction(game) {
  let changed = false;
  for (const nation of game.world.nations) {
    if (!nation.alive) continue;
    // Bina karari runEconomy icinde verildi (bkz. planConstructionAI); burada
    // yalniz kuyruktaki is ilerletilir.
    const state = ensureConstruction(nation);
    let power = constructionPower(nation);
    let completed = 0;
    const finished = new Set();
    // Kapasite yatırımı, o kapasiteyi tüketen işin arkasında bekleyemez. Yeni
    // şantiye fabrika kuyruğunun sonuna eklenince inşaat gücü hiç artmıyor,
    // kuyruk erimiyor ve hazine harcanamayan altın biriktiriyordu (ölçüldü:
    // 2600 altın, 5 bekleyen proje, 6 fabrika). Sıralama kararlıdır; geri kalan
    // projeler oyuncunun verdiği öncelik sırasını korur.
    const ordered = [...state.projects].sort(
      (a, b) => (b.typeId === 'CONSTRUCTION_CAPACITY') - (a.typeId === 'CONSTRUCTION_CAPACITY'),
    );
    // Finansmanı bekleyen proje kuyruğu tıkamaz, sıradakine geçilir: kapitalist
    // parasını toplayana kadar devletin kışlası beklemek zorunda değil.
    for (const project of ordered) {
      if (power <= 0) break;
      const payable = project.work * projectFundingRatio(project);
      const remaining = Math.max(0, payable - project.progress);
      if (remaining <= 1e-6) continue;
      const spent = Math.min(power, remaining);
      project.progress += spent;
      power -= spent;
      if (project.progress + 1e-6 < project.work) continue;
      finished.add(project.id);
      completeProject(game, nation, project);
      completed++;
    }
    if (finished.size) {
      state.projects = state.projects.filter((project) => !finished.has(project.id));
    }
    state.lastCompleted = completed;
    if (completed || state.projects.length) changed = true;
  }
  if (changed) {
    // `changed` kuyruğu olan her ulus için doğru — yani pratikte her tur.
    // Tam geçersizleme buradan haftada bir tüm dünyayı yeniden pişirtiyordu;
    // inşaatın harita izi yalnız inşaat kipindeki atlas/rozetlerdir.
    game.renderer.invalidateConstruction?.();
    game.emit('construction', null);
    game.requestRender();
  }
  return changed;
}
