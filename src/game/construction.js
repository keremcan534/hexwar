// State construction: deterministik planlama bolgeleri (oyunun tek "state"
// tanimi) ve Victoria 3 benzeri ulusal insaat gucuyle ilerleyen tek bir
// oncelik kuyrugu.
//
// SADELESTIRME (2026-09). Kuyrukta artik yalniz iki cins is var: ulusal
// insaat kapasitesi yatirimi ve fabrika kurulum/genisleme projeleri. Kale
// (haritaya yerlesen tek bina) ve Higher Education (eski universitenin ulusal
// kurum hali) kaldirildi: Insaat ekrani "kapasite + kuyruk" disinda bir sey
// anlatmamali. Kalenin savunma katkisi ve yuksekogretimin okuryazarlik/ise
// alim carpani onlarla gitti; bolge yuvalari (yalniz kaleyi sayiyordu) ve
// insaat harita kipi de. Eski kayitta kalan bu projelerin insa edilmemis payi
// iade edilir (bkz. ensureConstruction).

import { occupiedShareOf } from './provinces.js';
import { delegationActive, noteDelegated } from './delegation.js';
import { settle } from './treasury.js';

// Birim artık 2-7 hexlik province KÜMESİDİR (bkz. world/provinces-gen.js):
// state başına ~3 küme ≈ eski 14 karelik hedefle aynı yüzölçümü.
const TARGET_PROVINCES_PER_REGION = 3;
const MIN_REGIONS = 1;
const MAX_REGIONS = 12;

export const BASE_CONSTRUCTION_POWER = 5;

/**
 * ULUSAL YATIRIM: insaat gucunun kendisi. Iki kural:
 *   1. Yatirim da insaat kuyruguna girer ve ayni insaat gucunu tuketir —
 *      "kapasiteye mi, fabrikaya mi" firsat maliyeti aynen korunur.
 *   2. Maliyet seviyeyle buyur: sinirsiz kapasite yigmak dogru cevap olamaz
 *      (artan fiyat + seviye basina bakim).
 */
export const NATIONAL_INVESTMENTS = {
  CONSTRUCTION_CAPACITY: {
    id: 'CONSTRUCTION_CAPACITY', name: 'Construction Capacity',
    field: 'construction',
    baseCost: 100, costGrowth: 0.35, upkeep: 4, max: null,
    power: 5,
    desc: '+5 weekly construction power per level. Each level costs more and adds upkeep.',
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
 * Kuyrukta iki cins is var: ulusal yatirim (bolgesiz) ve sanayi (fabrika
 * kurulumu, seviye atlamasi). "Kim insa edebilir" (politika), "parayi kim
 * veriyor" (hazine/ozel sermaye) ve "ne kadar hizli" (insaat gucu) tek bir
 * zincire baglanir. Sanayi projeleri odenmemis kismin otesine ilerleyemez.
 */
export const PROJECT_KIND = {
  FACTORY: 'factory', UPGRADE: 'upgrade',
  /** Ulusal yatirim: bolgesiz proje, tamamlaninca kapasite seviyesi artar. */
  NATIONAL: 'national',
};

/**
 * Yerinde düzeltir, kopya üretmez. Kopyalasaydı ensureConstruction'ın her
 * çağrısı proje nesnelerini tazeler ve dışarıda tutulan bir referansa yapılan
 * ödeme (bkz. fundProject) sessizce kaybolurdu.
 */
function normalizeProject(project) {
  // Yazim yalniz deger degisince: degismeyen ondalik alani her cagrida geri
  // yazmak V8'de yeni HeapNumber kutulamasi demek (bkz. ensureConstruction).
  const work = Math.max(1, Number.isFinite(project.work) ? project.work : 0);
  if (project.work !== work) project.work = work;
  const cost = Math.max(0, Number(project.cost) || 0);
  if (project.cost !== cost) project.cost = cost;
  const funded = Math.max(0, Number(project.funded) || 0);
  if (project.funded !== funded) project.funded = funded;
  const progress = Math.max(0, Number(project.progress) || 0);
  if (project.progress !== progress) project.progress = progress;
  return project;
}

function validProject(project) {
  if (project.kind === PROJECT_KIND.NATIONAL) return Boolean(NATIONAL_INVESTMENTS[project.typeId]);
  return (project.kind === PROJECT_KIND.FACTORY || project.kind === PROJECT_KIND.UPGRADE)
    && Number.isFinite(project.q);
}

/** Yapilan is batiktir; iade yalniz henuz insa EDILMEMIS paydir. */
function unbuiltShare(project) {
  const done = project.work > 0 ? clamp((project.progress ?? 0) / project.work, 0, 1) : 1;
  return Math.max(0, (project.funded ?? 0) * (1 - done));
}

export function ensureConstruction(nation) {
  nation.construction ??= {
    nextId: 1,
    projects: [],
    completedFactories: [],
    lastCompleted: 0,
    capacity: { construction: 0 },
  };
  const state = nation.construction;
  state.capacity ??= { construction: 0 };
  if (!Number.isFinite(state.capacity.construction)) state.capacity.construction = 0;
  if (!Number.isFinite(state.nextId) || state.nextId < 1) {
    state.nextId = Math.max(1, Number(state.nextId) || 1);
  }
  // Kaldirilan kale ve yuksekogretim kalintilari (kayit v21 ve oncesi).
  if (state.buildings) delete state.buildings;
  if ('education' in state.capacity) delete state.capacity.education;
  // Bu fonksiyon her insaat okumasinda kosar; filtre yalniz gercekten dusecek
  // kayit varken calisir (olculdu: her cagrida kopya ~0.4 MB/hafta).
  state.projects ??= [];
  if (!state.projects.every(validProject)) {
    for (const project of state.projects) {
      if (validProject(project)) continue;
      // Eski kale/yuksekogretim projesi: parasi hazineden pesin odenmisti,
      // insa edilmemis payi geri doner (cancelConstruction ile ayni kural).
      const refund = unbuiltShare(project);
      if (refund > 0 && project.actor !== 'private') settle(nation, 'construction', refund);
    }
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
      projects: [],
      lastCompleted: 0,
      capacity: { construction: 0 },
    };
  }
}

/**
 * Binalarin ne kadarinin calistigi. Eskiden `nation.gold > 0` ikili kapisiydi:
 * hazine 1 altindan 0 altina inince ulke butun altyapisini bir anda
 * kaybediyordu (olculdu: insaat gucu 125 -> 5). Olcut artik borcunu
 * odeyebilmek: temerrude dusen devletin kapasitesi kademeli korelir (bkz.
 * economy.js settleDebt creditPenalty).
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
export function pendingInvestments(nation, investmentId) {
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
  const capacity = investmentLevel(nation, 'CONSTRUCTION_CAPACITY')
    * NATIONAL_INVESTMENTS.CONSTRUCTION_CAPACITY.power;
  // Demiryolu teknolojileri insaat gucunu buyutur (Infrastructure klasoru).
  // Duz alan okumasi: `economy.techMods` haftada bir kez kurulur, burasi
  // sicak yoldur (bkz. technology.js refreshTechModifiers).
  const tech = 1 + (nation.economy?.techMods?.constructionPower ?? 0);
  return (BASE_CONSTRUCTION_POWER + capacity * upkeepFactor(nation)) * tech;
}

export function constructionUpkeep(nation) {
  const state = ensureConstruction(nation);
  let upkeep = 0;
  for (const info of Object.values(NATIONAL_INVESTMENTS)) {
    upkeep += (state.capacity[info.field] ?? 0) * info.upkeep;
  }
  return upkeep;
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
    return { nationId, regions: [], tileRegions: new Map() };
  }

  // HAFTA imzaya girer: atlas bolge nufusunu kurulus aninda donduruyor; imza
  // haftasiz olunca icerik CAGRI GECMISINE bagliydi — kesintisiz kosu eski
  // nufus goruntusuyle, yuklenen kosu taze goruntuyle siralama yapiyor ve
  // yatirim bolgesi secimi dallaniyordu (save-audit'in son kacagi). Haftalik
  // yeniden kurulum iki yolda da ayni goruntuyu garanti eder; hafta icinde
  // onbellek aynen calisir.
  const signature = `${territorySignature(owned)}:${world.turn ?? 0}`;
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
  }

  const atlas = { nationId, regions, tileRegions };
  perWorld.set(nationId, { signature, atlas });
  return atlas;
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
  const cost = investmentCost(nation, investmentId);
  if ((nation.gold ?? 0) < cost) {
    return `treasury short by £${Math.ceil(cost - (nation.gold ?? 0))}`;
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
  settle(nation, 'construction', -price);
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
  const project = state.projects[index];
  const refund = unbuiltShare(project);
  if (refund > 0) {
    if (project.actor === 'private' && nation.politics) {
      // Tavan yalniz BU iadenin kendisine uygulanir (politics.collectPrivateCapital
      // ile ayni kural): havuz zaten tavani asmissa `min` farki YOK EDERDI ve
      // para kaybetmek de bir korunum ihlalidir.
      const pool = Math.max(0, nation.politics.privateCapital ?? 0);
      nation.politics.privateCapital = pool + Math.min(refund, Math.max(0, 1200 - pool));
    } else {
      settle(nation, 'construction', refund);
    }
  }
  state.projects.splice(index, 1);
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

/**
 * Kare el degistirince o kareye capalanmis tamamlanmamis sanayi projesi iptal
 * olur (yapilmis is batiktir). Ulusal yatirimlarin capasi yoktur, etkilenmez.
 */
export function captureConstructionAt(world, tile, newNationId) {
  if (!tile || tile.owner < 0 || tile.owner === newNationId) return 0;
  const oldNation = world.nations[tile.owner];
  if (!oldNation || !world.nations[newNationId]) return 0;
  const oldState = ensureConstruction(oldNation);
  const before = oldState.projects.length;
  oldState.projects = oldState.projects.filter(
    (project) => project.q !== tile.q || project.r !== tile.r,
  );
  return before - oldState.projects.length;
}

/**
 * Biten projeyi karşılar. Fabrika ve seviye projeleri economy.js'e devredilir —
 * bu dosya FACTORIES'i tanımaz, tanısa iki modül birbirine düğümlenirdi (bkz.
 * CLAUDE.md katman kuralı).
 */
function completeProject(game, nation, project) {
  const state = ensureConstruction(nation);
  if (project.kind !== PROJECT_KIND.NATIONAL) {
    state.completedFactories.push(project);
    return;
  }
  const info = NATIONAL_INVESTMENTS[project.typeId];
  // Tavanli yatirim tavani asamaz (gocten gelen fazla proje sessizce biter).
  if (!info || (info.max != null && (state.capacity[info.field] ?? 0) >= info.max)) return;
  state.capacity[info.field] = (state.capacity[info.field] ?? 0) + 1;
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`${info.name} reached level ${state.capacity[info.field]}.`, { kind: 'BUILDING' });
  }
}

/**
 * YZ'nin kapasite karari. runEconomy icinden, defter yazilmadan ONCE cagrilir:
 * yatirim bedeli pesin odendigi icin harcanan altin ayni haftanin defterine
 * girmeli (olculdu: runConstruction icinden cagrildiginda haftalik muhasebe
 * kimligi tam bedel kadar sapiyordu).
 */
export function planConstructionAI(game, nation) {
  const state = ensureConstruction(nation);
  if (nation.gold < 180) return;
  // Oyuncunun ulkesi yalniz insaat devredildiyse buradan gecer. Kapilar ayni:
  // hazine esigi, kredi cezasi, borc tavani ve `canQueueInvestment` hepsi
  // oyuncu icin de birebir uygulanir (bkz. delegation.js).
  const player = nation.id === game.turns.playerNation;
  if (player && !delegationActive(nation, 'construction', game.world.turn ?? 0)) return;
  // Mali sagligi bozuk ulke yeni bakim yuku ALMAZ: temerrut izi tasiyan ya da
  // yarim yillik gelirinden fazla borcu olan YZ once toparlanir.
  const ledger = nation.economy?.ledger;
  if ((nation.economy?.creditPenalty ?? 0) > 0.05) return;
  if ((nation.debt ?? 0) > Math.max(50, (ledger?.income ?? 0) * 13)) return;
  // Kuyrukta zaten bir kapasite yatirimi varsa ikincisi beklenir.
  if (state.projects.some((project) => project.kind === PROJECT_KIND.NATIONAL)) return;
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
  // para harcanacak yer bulamaz. "Para birikiyor" sinyali tek basina akis
  // saglikliysa gecerli: haftalik net eksideyken kapasite almak bakim tuzagi.
  const starved = queuedWork > constructionPower(nation) * 12
    || (nation.gold > 900 && (ledger?.net ?? 0) > 0);
  const capacity = investmentLevel(nation, 'CONSTRUCTION_CAPACITY');
  // YZ tavani: kapasite sanayinin OLCEGIYLE buyur — sinirsiz birakinca zengin
  // YZ bakim bataryasi kuruyordu.
  const capacityCeiling = 2 + Math.floor((nation.economy?.factories?.length ?? 0) / 3);

  // 1) Ilk kapasite seviyesi her seyden once: taban 5/hafta ile ulke yasayamaz.
  // 2) Kuyruk bogulduysa (ya da para birikiyorsa) kapasite buyur — tavana dek.
  const first = capacity < 1;
  if (!first && !(starved && capacity < capacityCeiling && nation.gold > 400)) return;
  if (!canQueueInvestment(nation, 'CONSTRUCTION_CAPACITY')) return;
  queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
  if (player) {
    noteDelegated(game, nation, 'construction', 'Construction capacity expansion queued.',
      first ? 'The nation had no construction capacity of its own.'
        : 'The build queue was outrunning national construction power.');
  }
}

/**
 * v14 -> v15 kayit gocu: yerlesik bina spam'i ulusal kurumlara cevrilir.
 *   - Construction Sector sayisi -> Construction Capacity seviyesi (1:1).
 *   - Administration binalari ve insa edilmemis University/Administration
 *     projeleri geri odenir. University'nin v15'teki karsiligi (Higher
 *     Education) 2026-09'da kaldirildi; seviyesi tasinmaz.
 */
export function migrateConstructionV14(nation) {
  // DIKKAT: ensureConstruction'dan ONCE kosmali. ensure, tabloda olmayan
  // tipleri filtreleyip atar — goc once HAM kayittan saymali.
  const state = nation.construction ?? (nation.construction = {});
  const buildings = Array.isArray(state.buildings) ? state.buildings : [];
  const projects = Array.isArray(state.projects) ? state.projects : [];
  state.capacity ??= { construction: 0 };
  const count = (typeId) => buildings.filter((b) => b.typeId === typeId).length;
  state.capacity.construction = (state.capacity.construction ?? 0) + count('CONSTRUCTION_SECTOR');
  // Eski ADMINISTRATION binasinin kayit donusumu: deftere yazilarak iade.
  const administrations = count('ADMINISTRATION');
  if (administrations > 0) settle(nation, 'construction', administrations * 80);

  const converted = [];
  for (const project of projects) {
    if (project.typeId === 'CONSTRUCTION_SECTOR') {
      converted.push({
        ...project,
        kind: PROJECT_KIND.NATIONAL,
        typeId: 'CONSTRUCTION_CAPACITY',
        regionId: undefined,
        q: undefined,
        r: undefined,
        regionName: 'Construction Capacity',
      });
      continue;
    }
    // Geri kalani oldugu gibi gecer: gecersiz olanlar (University,
    // Administration, kale) ensureConstruction'da iade edilerek duser.
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
    // Yatirim karari runEconomy icinde verildi (bkz. planConstructionAI);
    // burada yalniz kuyruktaki is ilerletilir.
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
    // Finansmanı bekleyen proje kuyruğu tıkamaz, sıradakine geçilir.
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
    game.emit('construction', null);
    game.requestRender();
  }
  return changed;
}

/**
 * EKRAN VERISI — Insaat ekrani yalniz cizer. Kuyrugun sirasi, kalan is,
 * tahmini bitis ve odenen pay burada bir kez hesaplanir.
 */
export function constructionView(nation, { projectName = (project) => project.typeId } = {}) {
  const state = ensureConstruction(nation);
  const power = constructionPower(nation);
  const info = NATIONAL_INVESTMENTS.CONSTRUCTION_CAPACITY;
  const level = investmentLevel(nation, info.id);
  const pending = pendingInvestments(nation, info.id);
  let cumulative = 0;
  const rows = state.projects.map((project) => {
    const funded = projectFundingRatio(project);
    // Ozel projenin odenmemis payi guc tuketemez: tahmin yalniz devletin
    // (tam odenmis) kuyrugu icin yapilir; eski ekranin hesabiyla ayni.
    if (project.actor !== 'private') cumulative += Math.max(0, project.work - project.progress);
    return {
      id: project.id,
      kind: project.kind,
      typeId: project.typeId,
      name: projectName(project),
      place: project.kind === PROJECT_KIND.NATIONAL ? 'National' : (project.regionName ?? ''),
      private: project.actor === 'private',
      dormant: Boolean(project.dormant),
      progress: project.progress,
      work: project.work,
      percent: Math.min(100, Math.round((project.progress / Math.max(1, project.work)) * 100)),
      funded: Math.round(funded * 100),
      eta: project.actor === 'private' ? null : Math.max(1, Math.ceil(cumulative / Math.max(1, power))),
    };
  });
  const own = rows.filter((row) => !row.private);
  const investors = rows.filter((row) => row.private);
  const idle = level > 0 && !state.projects.some(
    (project) => project.kind !== PROJECT_KIND.NATIONAL || project.typeId !== info.id,
  );
  return {
    power,
    basePower: BASE_CONSTRUCTION_POWER,
    upkeep: constructionUpkeep(nation),
    workLeft: own.reduce((sum, row) => sum + Math.max(0, row.work - row.progress), 0),
    clearsIn: own.length ? own[own.length - 1].eta : 0,
    own,
    investors,
    privateInflow: nation.politics?.privateInflow ?? 0,
    capacity: {
      id: info.id,
      name: info.name,
      level,
      pending,
      perLevel: info.power,
      upkeepPerLevel: info.upkeep,
      cost: investmentCost(nation, info.id),
      blocked: investmentBlocker(nation, info.id),
      idle,
    },
  };
}
