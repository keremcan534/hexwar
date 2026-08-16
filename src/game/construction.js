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

export const CONSTRUCTION_TYPES = {
  CONSTRUCTION_SECTOR: {
    id: 'CONSTRUCTION_SECTOR', name: 'Construction Sector', icon: '🏗',
    // Bakım 6'dan 4'e: fabrikalar da bu güçle kurulduğu için ülkeler artık çok
    // daha fazla şantiyeye ihtiyaç duyuyor, 6'da bütçe onları taşıyamıyordu.
    cost: 100, upkeep: 4, maxPerRegion: 3,
    desc: '+5 weekly construction power. Expensive to maintain.',
  },
  FORT: {
    id: 'FORT', name: 'Fort', icon: '🛡',
    cost: 70, upkeep: 1.5, maxPerRegion: 3,
    desc: '+8% defender power in this state per level.',
  },
  ADMINISTRATION: {
    id: 'ADMINISTRATION', name: 'Administration', icon: '⚖',
    cost: 80, upkeep: 2, maxPerRegion: 2,
    desc: '+4% national tax collection per building.',
  },
  UNIVERSITY: {
    id: 'UNIVERSITY', name: 'University', icon: '🎓',
    cost: 100, upkeep: 3, maxPerRegion: 2,
    desc: 'Improves education spending and industrial workforce.',
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
export const PROJECT_KIND = { BUILDING: 'building', FACTORY: 'factory', UPGRADE: 'upgrade' };

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
  return project.kind && project.kind !== PROJECT_KIND.BUILDING
    ? Number.isFinite(project.q)
    : Boolean(CONSTRUCTION_TYPES[project.typeId])
      && (typeof project.regionId === 'string' || Number.isFinite(project.q));
}

export function ensureConstruction(nation) {
  nation.construction ??= {
    nextId: 1, buildings: [], projects: [], completedFactories: [], lastCompleted: 0,
  };
  const state = nation.construction;
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
    nation.construction = { nextId: 1, buildings: [], projects: [], lastCompleted: 0 };
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

export function constructionPower(nation) {
  const sectorPower = constructionCount(nation, 'CONSTRUCTION_SECTOR') * 5;
  return BASE_CONSTRUCTION_POWER + sectorPower * upkeepFactor(nation);
}

export function constructionUpkeep(nation) {
  return ensureConstruction(nation).buildings.reduce(
    (sum, building) => sum + (CONSTRUCTION_TYPES[building.typeId]?.upkeep ?? 0), 0,
  );
}

export function constructionTaxMultiplier(nation) {
  return 1 + Math.min(0.24, constructionCount(nation, 'ADMINISTRATION') * 0.04)
    * upkeepFactor(nation);
}

export function universityWorkforceBonus(nation) {
  return Math.min(0.24, constructionCount(nation, 'UNIVERSITY') * 0.04) * upkeepFactor(nation);
}

export function fortDefenseAt(world, nationId, tile) {
  if (!tile || tile.owner !== nationId) return 0;
  const nation = world.nations[nationId];
  if (!nation) return 0;
  const region = constructionAtlas(world, nationId).tileRegions.get(tile);
  if (!region) return 0;
  return region.buildings.filter((building) => building.typeId === 'FORT').length
    * 0.08 * upkeepFactor(nation);
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

export function queueConstruction(game, nationId, regionId, typeId) {
  const nation = game.world.nations[nationId];
  if (!canQueueConstruction(game.world, nation, regionId, typeId)) return false;
  const state = ensureConstruction(nation);
  const region = constructionAtlas(game.world, nationId).regions.find((item) => item.id === regionId);
  const price = CONSTRUCTION_TYPES[typeId].cost;
  nation.gold -= price;
  // Insaat kalemine yazilir (bkz. economy.js updateLedger projectCost).
  if (nation.economy) nation.economy.projectGold = (nation.economy.projectGold ?? 0) + price;
  state.projects.push({
    id: state.nextId++, typeId, regionId, regionName: region.name,
    q: region.center.q, r: region.center.r,
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
export function planConstructionAI(game, nation) {
  const state = ensureConstruction(nation);
  if (nation.id === game.turns.playerNation || nation.gold < 180) return;
  // Yalnız bina projeleri sayılır: fabrika kuyruğu dolu diye ülke bir daha
  // hiç kışla ya da üniversite yapamaz hale gelmemeli.
  const pendingBuildings = state.projects.filter(
    (project) => project.kind === PROJECT_KIND.BUILDING,
  ).length;
  if (pendingBuildings) return;
  // Hazine şişiyorsa asıl darboğaz inşaat gücüdür: sanayi kuyrukta bekler,
  // para harcanacak yer bulamaz. Fazla altın yeni şantiyeye gider; bakım
  // gideri de biriken parayı geri emer.
  const sectors = constructionCount(nation, 'CONSTRUCTION_SECTOR');
  const queuedWork = state.projects.reduce(
    (sum, project) => sum + Math.max(0, project.work - project.progress), 0,
  );
  // Hazine şişmişse de yeni şantiye açılır: laissez-faire'de devlet fabrika
  // kuramadığı için kuyruğu hiç dolmaz, `starved` tetiklenmez ve para
  // harcanacak yer bulamazdı. Kapasite, kapitalistlerin projelerini de hızlandırır.
  const starved = queuedWork > constructionPower(nation) * 12 || nation.gold > 900;
  const desired = sectors < 1
    ? 'CONSTRUCTION_SECTOR'
    : constructionCount(nation, 'ADMINISTRATION') < 1
      ? 'ADMINISTRATION'
      : constructionCount(nation, 'UNIVERSITY') < 1
        ? 'UNIVERSITY'
        : (starved && nation.gold > 400)
          ? 'CONSTRUCTION_SECTOR'
          : constructionCount(nation, 'FORT') < 2 ? 'FORT' : null;
  if (!desired) return;
  const regions = constructionAtlas(game.world, nation.id).regions
    .sort((a, b) => b.free - a.free || b.population - a.population);
  const region = regions.find((candidate) => (
    canQueueConstruction(game.world, nation, candidate.id, desired)
  ));
  if (region) queueConstruction(game, nation.id, region.id, desired);
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
      (a, b) => (b.typeId === 'CONSTRUCTION_SECTOR') - (a.typeId === 'CONSTRUCTION_SECTOR'),
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
