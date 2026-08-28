// Province katmanı: nüfus, kontrol ve uzmanlaşma artık tek hex değil,
// world.provinces'teki 2-7 hexlik KÜMELER üzerinde yaşar (CK3 modeli).
// Ordular hex hex yürür ve işgal eder; ekonomi kümeyi okur.
//
// Temsil: her kümenin tek `econ` nesnesi vardır ve üye karelerin
// `tile.province` alanı AYNI nesneye işaret eder (paylaşılan referans).
// Böylece kare üzerinden okuyan eski kod (hud, denetimler) kırılmaz; ama
// kare döngüsüyle TOPLAYAN her yer üye sayısı kadar çift sayar — o yüzden
// bütün toplayıcılar bu dosyayla birlikte küme döngüsüne taşındı
// (cities.collectProvinceTotals, economy.rawProduction, population, census,
// recruitment). Yenisini yazarken world.provinces üzerinden dolaş.

import { makeRng } from '../core/rng.js';
import { policyOf } from './politics.js';
import { controllerOf } from './control.js';
import { DEFAULT_ZONE, ZONE_RULES } from '../world/macro.js';

/**
 * Province kaynakları. Tahıl kasten baskın tutuldu: ordunun erzağı ve nüfusun
 * temel gıdası buradan gelir, egzotik kaynaklar onu ezerse ülkeler açlıktan
 * çöker. Kauçuk/tropik ağaç/ipek gibi kalemler nadirdir ve araziye bağlıdır —
 * kıtlıkları ticaretin ve sömürge hırsının asıl sebebidir.
 *
 * Verimler zincir derinleşince ~1.8 katına çıkarıldı: kömür artık sekiz ayrı
 * tesisin girdisi ve eski 0.16'lık province verimi toplam fabrika talebinin
 * otuzda birini karşılıyordu — bütün ham mallar fiyat tavanına yapışıyordu.
 */
export const RGO_TYPES = {
  GRAIN: {
    id: 'GRAIN', goodId: 'food', name: 'Grain Farms', icon: '🌾', hue: 91,
    track: 'agriculture', baseOutput: 0.54,
  },
  CATTLE: {
    id: 'CATTLE', goodId: 'cattle', name: 'Cattle Ranches', icon: '🐄', hue: 74,
    track: 'agriculture', baseOutput: 0.324,
  },
  FISH: {
    id: 'FISH', goodId: 'fish', name: 'Fishing Wharfs', icon: '🐟', hue: 195,
    track: 'agriculture', baseOutput: 0.54,
  },
  FRUIT: {
    id: 'FRUIT', goodId: 'fruit', name: 'Orchards', icon: '🍇', hue: 300,
    track: 'agriculture', baseOutput: 0.396,
  },
  COTTON: {
    id: 'COTTON', goodId: 'cotton', name: 'Cotton Plantations', icon: '🌱', hue: 52,
    track: 'agriculture', baseOutput: 0.54,
  },
  SILK: {
    id: 'SILK', goodId: 'silk', name: 'Silk Farms', icon: '🕸', hue: 330,
    track: 'agriculture', baseOutput: 0.144,
  },
  DYE: {
    id: 'DYE', goodId: 'dye', name: 'Dye Plantations', icon: '🎨', hue: 275,
    track: 'agriculture', baseOutput: 0.396,
  },
  TIMBER: {
    id: 'TIMBER', goodId: 'timber', name: 'Logging Camps', icon: '🪵', hue: 139,
    track: 'extraction', baseOutput: 0.396,
  },
  TROPICAL_WOOD: {
    id: 'TROPICAL_WOOD', goodId: 'tropical_wood', name: 'Tropical Logging', icon: '🌴', hue: 158,
    track: 'extraction', baseOutput: 0.18,
  },
  RUBBER: {
    id: 'RUBBER', goodId: 'rubber', name: 'Rubber Plantations', icon: '⬤', hue: 120,
    track: 'extraction', baseOutput: 0.198,
  },
  IRON: {
    id: 'IRON', goodId: 'iron', name: 'Iron Mines', icon: '⛏', hue: 211,
    track: 'extraction', baseOutput: 0.324,
  },
  COAL: {
    id: 'COAL', goodId: 'coal', name: 'Coal Mines', icon: '◆', hue: 28,
    track: 'extraction', baseOutput: 0.288,
  },
  SULPHUR: {
    id: 'SULPHUR', goodId: 'sulphur', name: 'Sulphur Mines', icon: '🜍', hue: 48,
    track: 'extraction', baseOutput: 0.18,
  },
  OIL: {
    id: 'OIL', goodId: 'oil', name: 'Oil Derricks', icon: '🛢', hue: 12,
    track: 'extraction', baseOutput: 0.162,
  },
};

export const MIGRATION_INTERVAL = 4;
export const MIGRATION_COHORT = 100;
export const MIGRATION_RATE = 0.04;


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Tek karenin RGO ağırlık vektörü; küme seçimi üyelerin toplamından yapılır. */
function rgoWeightsOf(tile) {
  const yields = tile.terrain.yields;
  const terrain = tile.terrain.id;
  const rugged = terrain === 'HILLS' || terrain === 'MOUNTAIN';
  const tropical = terrain === 'JUNGLE';
  const open = terrain === 'PLAINS' || terrain === 'GRASSLAND';
  const arid = terrain === 'DESERT' || terrain === 'TUNDRA';
  // Tahılın ağırlığı bilerek yüksek: erzak çökerse ordular dağılır. Egzotik
  // kaynaklar yalnız kendi arazilerinde ve düşük ağırlıkla çıkar.
  return [
    ['GRAIN', 2.5 + yields.food * 5 + (open ? 2 : 0)],
    ['CATTLE', 0.5 + (open ? 2 : 0) + (terrain === 'TUNDRA' ? 0.8 : 0)],
    ['FISH', tile.coastal ? 3 : 0],
    ['FRUIT', 0.3 + (open ? 1 : 0) + (tropical ? 1.2 : 0)],
    ['COTTON', 0.2 + (open ? 1.2 : 0) + (terrain === 'BEACH' ? 0.6 : 0)],
    ['SILK', 0.15 + (tropical ? 0.7 : 0)],
    ['DYE', 0.2 + (tropical ? 0.6 : 0) + (open ? 0.3 : 0)],
    ['TIMBER', 0.6 + yields.timber * 5.5],
    ['TROPICAL_WOOD', tropical ? 2.2 : 0],
    ['RUBBER', tropical ? 2 : 0],
    ['IRON', 0.6 + yields.iron * 5 + (rugged ? 1.5 : 0)],
    ['COAL', 0.35 + (rugged ? 4 : 0) + (terrain === 'FOREST' ? 0.5 : 0)],
    ['SULPHUR', 0.15 + (rugged ? 1.2 : 0) + (terrain === 'DESERT' ? 0.5 : 0)],
    ['OIL', 0.1 + (arid ? 1.4 : 0)],
  ];
}

/**
 * Kümenin TEK RGO'su (Vic2 kuralı). Zar, rastgele seçilen bir ÜYENİN eski
 * kare ağırlıklarıyla atılır — ağırlıkları toplamak çoğunluk arazisini
 * kayırıyor, dağınık azınlık kaynakları (tepe kömürü, karışık orman) dünya
 * genelinde eksiliyor du (ölçüldü: kömür −%30, kereste −%22). Üye örneklemesi
 * beklenen dağılımı kare-tabanlı eski dağılıma birebir oturtur. Zar kümenin
 * merkez koordinatına bağlı dalla atılır: kayıt/yükleme arasında kaymaz.
 */
function weightedRgo(world, province) {
  const rng = makeRng(`${world.seed}-rgo-${province.center.q}:${province.center.r}`);
  const sample = world.tiles[province.tileIdx[rng.int(0, province.tileIdx.length - 1)]];
  const weights = rgoWeightsOf(sample);
  let roll = rng() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  let rgo = 'GRAIN';
  for (const [id, weight] of weights) {
    roll -= weight;
    if (roll <= 0) { rgo = id; break; }
  }
  return { id: rgo, quality: rng.range(0.85, 1.15), jobsRatio: rng.range(0.72, 0.88) };
}

/**
 * Kümenin başlangıç ekonomisi. Nüfus, eski kare formülünün üye toplamıdır —
 * dünya toplam nüfusu hex-tabanlı sürümle birebir aynı kalır. Gelişim
 * kademeleri üye verim ORTALAMASINA eşiklenir (küme tek karar alanıdır).
 */
function initialProvinceEcon(world, province) {
  const members = province.tileIdx.map((idx) => world.tiles[idx]);
  let population = 0;
  let foodSum = 0;
  let timberSum = 0;
  let ironSum = 0;
  let goldSum = 0;
  let coastal = false;
  for (const tile of members) {
    const yields = tile.terrain.yields;
    const tileAg = yields.food >= 3 ? 2 : yields.food > 0 ? 1 : 0;
    const tileEx = Math.max(yields.timber, yields.iron) >= 2 ? 2
      : Math.max(yields.timber, yields.iron) > 0 ? 1 : 0;
    const tileCom = tile.coastal || yields.gold > 0 ? 1 : 0;
    population += 1800 + yields.food * 1200 + (tile.coastal ? 900 : 0)
      + (tileAg + tileEx + tileCom) * 450;
    foodSum += yields.food;
    timberSum += yields.timber;
    ironSum += yields.iron;
    goldSum += yields.gold;
    if (tile.coastal) coastal = true;
  }
  const n = Math.max(1, members.length);
  const avgFood = foodSum / n;
  const avgOre = Math.max(timberSum / n, ironSum / n);
  const agriculture = avgFood >= 3 ? 2 : avgFood > 0 ? 1 : 0;
  const extraction = avgOre >= 2 ? 2 : avgOre > 0 ? 1 : 0;
  // Makro asimetri: nüfus ve gelişim bölgeden gelir. Doğu ovası nüfus devi,
  // yoğun-batı ticaret/sanayi çekirdeği, sınır bölgeleri seyrek başlar.
  const rule = ZONE_RULES[province.zone ?? DEFAULT_ZONE] ?? ZONE_RULES[DEFAULT_ZONE];
  let commerce = coastal || goldSum > 0 ? 1 : 0;
  if (rule.dev >= 1) commerce = Math.max(commerce, 1);
  if (rule.dev >= 2 && coastal) commerce = 2;
  population *= rule.popMul;
  const selected = weightedRgo(world, province);
  const track = RGO_TYPES[selected.id].track;
  return {
    population: Math.round(population),
    // Kaç hexlik küme: kare başına pay isteyen eski okuyucular (barış bedeli
    // gibi) toplamı buna böler.
    hexes: members.length,
    baseGold: goldSum / n,
    agriculture,
    extraction,
    commerce,
    control: province.owner >= 0 ? 100 : 0,
    lastInvestment: 0,
    rgo: selected.id,
    rgoQuality: selected.quality,
    rgoBaseJobs: Math.max(1000, Math.round(population * selected.jobsRatio / 100) * 100),
    rgoBaseDevelopment: track === 'agriculture' ? agriculture : extraction,
    migration: 0,
    industrialEmployees: 0,
    industrialJobs: 0,
  };
}

function ensureProvinceRgo(world, province) {
  const econ = province.econ;
  if (!econ) return null;
  const selected = weightedRgo(world, province);
  if (!RGO_TYPES[econ.rgo]) econ.rgo = selected.id;
  if (!Number.isFinite(econ.rgoQuality)) econ.rgoQuality = selected.quality;
  if (!Number.isFinite(econ.rgoBaseJobs)) {
    econ.rgoBaseJobs = Math.max(
      1000,
      Math.round(econ.population * selected.jobsRatio / 100) * 100,
    );
  }
  const type = RGO_TYPES[econ.rgo];
  if (!Number.isFinite(econ.rgoBaseDevelopment)) {
    econ.rgoBaseDevelopment = econ[type.track] ?? 0;
  }
  if (!Number.isFinite(econ.migration)) econ.migration = 0;
  if (!Number.isFinite(econ.hexes)) econ.hexes = province.tileIdx.length;
  return econ;
}

/**
 * Bir RGO turunun dunyada bulunmasi gereken asgari kume sayisi.
 *
 * NEDEN: `weightedRgo` her kume icin BAGIMSIZ zar atar ve nadir kaynaklarin
 * agirligi cok dusuktur (SULPHUR 0.15 taban, SILK 0.15). Zar kotu giderse bir
 * mal butun dunyada TEK kumeye duser — ama o mala olan talep yapisaldir ve
 * sanayilesmeyle buyur.
 *
 * Olculdu (260. hafta, 255 kume): kukurt **1 kume / 1 hex**, arz 0.2, talep
 * 7.1, fiyat tabanin 8 kati; ipek **1 kume / 1 hex**. Buna karsilik tahil 123
 * kume / 691 hex. Gelisim hizi bunu KURTARAMAZ: gelisim tavaninda bile tek
 * hex 0.56 uretir, talep 7.1'dir. Beta'nin "dunya 70 yil sonra basindan daha
 * cok kitliga sahip" bulgusunun yapisal kaynagi budur.
 *
 * Sayilar taleple orantili: kukurt/ipek gibi girdiler birkac tesisi besler,
 * kauçuk ve tropik agac daha genis kullanilir.
 */
/**
 * Deger = dunyadaki kumelerin ORANI, mutlak sayi degil.
 *
 * Mutlak sayi ilk denemede yaziliydi ve denetim haritasinda (255 kume) dogru
 * calisti; sonra URUN haritasinda (160x96, ~1000 kume) olculunce komur ve
 * kukurt yine 8 kata cikti — 11 kume 255'in %4.3'u ama 1000'in %1.1'i, oysa
 * TALEP dunya buyuklugu ile birlikte buyuyor. Kitlik tabani da olcekle
 * buyumeli.
 *
 * Oranlar denetim haritasindaki calisan degerlerden turetildi.
 */
const RGO_WORLD_MINIMUM_SHARE = {
  SULPHUR: 0.043, SILK: 0.012, RUBBER: 0.020, DYE: 0.020,
  OIL: 0.031, TROPICAL_WOOD: 0.024, COAL: 0.063,
};

/** Cok kucuk dunyada oran sifira yuvarlanmasin. */
const RGO_MINIMUM_FLOOR = 2;

/**
 * Zarin ac biraktigi kaynaklari onarir: asgarinin altinda kalan her RGO turu
 * icin, o kaynagin ARAZI OLARAK mumkun oldugu ve halihazirda BOL bir turden
 * olan kumeler devralinir.
 *
 * Kural CLAUDE.md'deki cografya kuralinin ayni ruhu: sekli sablon belirler,
 * gurultu bozar. Burada da dagilimi talep belirler, zar yalnizca yerini secer.
 * Secim tamamen deterministiktir (kume merkezine bagli siralama).
 */
function repairRgoScarcity(world) {
  const byType = new Map();
  for (const province of world.provinces ?? []) {
    if (!province.econ) continue;
    const list = byType.get(province.econ.rgo);
    if (list) list.push(province);
    else byType.set(province.econ.rgo, [province]);
  }
  // Devralinabilir turler: asgarisi olmayan ve bol olanlar.
  const total = (world.provinces ?? []).filter((p) => p.econ).length;
  const minimumOf = (typeId) => {
    const share = RGO_WORLD_MINIMUM_SHARE[typeId];
    return share ? Math.max(RGO_MINIMUM_FLOOR, Math.round(share * total)) : 0;
  };
  const donorScore = (province) => {
    const list = byType.get(province.econ.rgo) ?? [];
    return list.length - minimumOf(province.econ.rgo);
  };
  for (const typeId of Object.keys(RGO_WORLD_MINIMUM_SHARE)) {
    const have = byType.get(typeId) ?? [];
    let missing = minimumOf(typeId) - have.length;
    if (missing <= 0) continue;
    // Aday: arazisi bu kaynaga uygun (agirligi > 0) ve verici turu bol olan.
    const candidates = [];
    for (const province of world.provinces ?? []) {
      if (!province.econ || province.econ.rgo === typeId) continue;
      if (donorScore(province) <= 1) continue;
      const sample = world.tiles[province.tileIdx[0]];
      const weight = rgoWeightsOf(sample).find(([id]) => id === typeId)?.[1] ?? 0;
      if (weight <= 0) continue;
      candidates.push({ province, weight });
    }
    // Deterministik siralama: once arazi uygunlugu, sonra verici bolluğu,
    // sonra kume merkezi (kararli tie-break).
    candidates.sort((a, b) => b.weight - a.weight
      || donorScore(b.province) - donorScore(a.province)
      || a.province.center.q - b.province.center.q
      || a.province.center.r - b.province.center.r);
    for (const { province } of candidates) {
      if (missing <= 0) break;
      const from = byType.get(province.econ.rgo);
      if (from) from.splice(from.indexOf(province), 1);
      province.econ.rgo = typeId;
      const track = RGO_TYPES[typeId].track;
      province.econ.rgoBaseDevelopment = track === 'agriculture'
        ? province.econ.agriculture : province.econ.extraction;
      (byType.get(typeId) ?? byType.set(typeId, []).get(typeId)).push(province);
      missing--;
    }
  }
}

export function initProvinces(world) {
  world.forEach((tile) => { tile.province = null; });
  for (const province of world.provinces ?? []) {
    province.econ = initialProvinceEcon(world, province);
  }
  // Zar atildiktan SONRA: dunyayi yapisal kitliga mahkum eden dagilimlari onar.
  repairRgoScarcity(world);
  for (const province of world.provinces ?? []) {
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

export function ensureProvinces(world) {
  for (const province of world.provinces ?? []) {
    if (!province.econ) {
      province.econ = initialProvinceEcon(world, province);
    }
    ensureProvinceRgo(world, province);
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

/**
 * Kümenin hukuki sahibi üye çoğunluğundan türetilir. Savaşta kareler tek tek
 * el değiştirebildiği için (hex hex işgal) küme geçici olarak karışık
 * kalabilir; ekonomi çoğunluğun devletine akar.
 */
// Oy sayimi karalamasi: kume en cok 7 uyeli, Map kurmak haftada 658 kez
// gereksiz tahsisti. Omru tek cagridir.
const voteOwnersScratch = [];
const voteCountsScratch = [];

export function refreshProvinceOwner(world, province) {
  const owners = voteOwnersScratch;
  const counts = voteCountsScratch;
  let distinct = 0;
  for (let t = 0; t < province.tileIdx.length; t++) {
    const owner = world.tiles[province.tileIdx[t]].owner;
    let at = -1;
    for (let i = 0; i < distinct; i++) {
      if (owners[i] === owner) { at = i; break; }
    }
    if (at < 0) {
      owners[distinct] = owner;
      counts[distinct] = 1;
      distinct++;
    } else {
      counts[at]++;
    }
  }
  // Ilk gorulme sirasi Map yineleme sirasiyla ayni: esitlik kirilimi degismez.
  let winner = -1;
  let winnerVotes = -1;
  for (let i = 0; i < distinct; i++) {
    if (counts[i] > winnerVotes || (counts[i] === winnerVotes && owners[i] < winner)) {
      winner = owners[i];
      winnerVotes = counts[i];
    }
  }
  province.owner = winner;
  return winner;
}

/** İşgal payı: sahibinden başkasının fiilen kontrol ettiği üye oranı. */
export function occupiedShareOf(world, province) {
  if (province.owner < 0) return 0;
  let occupied = 0;
  for (let t = 0; t < province.tileIdx.length; t++) {
    if (controllerOf(world.tiles[province.tileIdx[t]]) !== province.owner) occupied++;
  }
  return occupied / Math.max(1, province.tileIdx.length);
}

// State adları için hece tabloları. "Forest 18:15" bir ad değil, koordinattı;
// yönetim ekranlarında ilk sütun olduğu için okunur bir şey olmalı.
const LAND_NAME_A = [
  'Aster', 'Bram', 'Cald', 'Dorn', 'Elm', 'Fen', 'Gar', 'Hald', 'Ilm', 'Jor',
  'Kesh', 'Lund', 'Mar', 'Norr', 'Oster', 'Pell', 'Quen', 'Rav', 'Sten', 'Tor',
  'Ulm', 'Vard', 'Wehr', 'Yar', 'Zel',
];
const LAND_NAME_B = [
  'mark', 'land', 'gau', 'thal', 'burg', 'stead', 'moor', 'vale', 'reach', 'holm',
  'wick', 'fell', 'heim', 'garde', 'ford',
];

/**
 * Kareye bağlı, deterministik ad. Aynı kare her zaman aynı adı verir; dünya
 * yeniden üretilmedikçe kayıt ile ekran arasında ad kayması olmaz.
 */
export function provinceName(tile) {
  if (tile.city) return `${tile.city.name} Province`;
  const rng = makeRng(`province-name-${tile.q}:${tile.r}`);
  return rng.pick(LAND_NAME_A) + rng.pick(LAND_NAME_B);
}

export function provincePopulation(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ) total += province.econ.population;
  }
  return Math.round(total);
}

/** Küme econ'unun RGO kadrosu; gelişim kadroyu 500'lük adımlarla açar. */
export function rgoJobsOf(econ) {
  const type = RGO_TYPES[econ?.rgo];
  if (!econ || !type) return 0;
  const developed = Math.max(0, (econ[type.track] ?? 0) - (econ.rgoBaseDevelopment ?? 0));
  return Math.max(1000, Math.round((econ.rgoBaseJobs + developed * 500) / 100) * 100);
}

/** Kare üzerinden okuma: tile.province paylaşılan küme econ'udur. */
export function provinceRgoJobs(tile) {
  return rgoJobsOf(tile?.province);
}

/**
 * RGO gelişimi: tarla ve maden kendiliğinden verimlenmez, barış ve istikrar
 * ister. Bu olmadan `agriculture`/`extraction` dünya üretiminde bir kez atanıp
 * bir daha hiç değişmiyor, dolayısıyla `provinceRgoJobs`teki `developed * 500`
 * terimi yapısal olarak hep 0 kalıyordu. Sonucu ölçüldü: 40 yılda hammadde
 * arzı +%14, sanayi talebi +%489, bütün hammaddeler fiyat tavanında ve alt
 * zincirler ölü (bkz. market-diagnostic).
 *
 * Hız, iyi yönetilen bir province'in yüzyılda ~6 kademe kazanacağı şekilde
 * seçildi: kapasite ~1.8, verim ~1.8 kat artar. Oyuncuya iş çıkarmaz —
 * mikro yönetim mobilde en pahalı maliyet (bkz. CLAUDE.md).
 */
const RGO_DEVELOPMENT_PER_WEEK = 0.0011;
const RGO_DEVELOPMENT_CAP = 10;

/**
 * FIYAT SINYALI: sermaye karli cikarima akar.
 *
 * Onceki gecis gelisimi zamana bagladi (baris + istikrar + nufus baskisi) ama
 * FIYATA baglamadi: 8 kat fiyattaki kukurt madeni ile taban fiyattaki bugday
 * tarlasi tam ayni hizda gelisiyordu. Sonucu olculdu (supply-response-audit,
 * 520 hafta): kukurt %89.8, gubre %95.4, cimento %95.2 hafta boyunca fiyat
 * TAVANINDA — gubre tesisi 34 tane kurulu ve marji %100 hafta pozitif oldugu
 * halde arz 0.1'e karsi talep 37.6. Yani sorun yatirim istahi degildi;
 * zincirin en ustundeki hammadde hic buyumuyordu.
 *
 * Beta raporunun istegi tam olarak buydu: *"coal at price ceiling for years +
 * huge global unmet demand should eventually encourage more coal extraction."*
 *
 * Egri kasten ilimli: taban fiyatta carpan 1.0 (onceki davranis birebir
 * korunur), tavanda 2.5, dip fiyatta 0.56 — yani ucuz mal yavaslar, pahali mal
 * hizlanir ama hicbiri anlik denge kurmaz. Kitlik ve patlama iyidir; KALICI
 * tavan degildir.
 */
const RGO_PRICE_DRIVE_MIN = 0.5;
const RGO_PRICE_DRIVE_MAX = 2.5;

function rgoPriceDrive(world, econ) {
  const goodId = RGO_TYPES[econ.rgo]?.goodId;
  const state = goodId ? world.market?.goods?.[goodId] : null;
  if (!state) return 1;
  // Eski kayitlarda basePrice yok: oran 1 kabul edilir (notr, eski davranis).
  const base = state.basePrice ?? state.price;
  if (!(base > 0)) return 1;
  return clamp(0.5 + (state.price / base) * 0.5, RGO_PRICE_DRIVE_MIN, RGO_PRICE_DRIVE_MAX);
}

/**
 * Sepetinin bu oranindan azini alabilen nufus aclik cekmeye baslar. %50 bilerek
 * comert: eksik luks tuketim olum demek degildir, asil kirilma temel gidanin
 * alinamamasidir.
 */
const FAMINE_THRESHOLD = 0.5;
/**
 * Tam aclikta haftalik nufus kaybi. 0.0012 ile bes yillik (260 hafta) toplam
 * aclik nufusu ~%27 eritir: gorunur ve geri donulebilir bir felaket, anlik
 * cokus degil.
 */
const FAMINE_DECLINE = 0.0012;

/**
 * Fazla nüfusun RGO çıktısını ne kadar büyütebileceğinin tavanı. Sınırsız
 * olsaydı kalabalık province tek başına dünya arzını karşılardı.
 */
const RGO_LABOR_CAP = 3;

/** Fazla işgücünün azalan getirisi; 1 doğrusal, 0 hiç katkı yok demektir. */
const RGO_LABOR_FALLOFF = 0.75;

/**
 * RGO işgücü ölçeği. Kadro dolana kadar doluluk oranıdır — yani eksik nüfuslu
 * province eskisi gibi az üretir. Kadro dolduktan sonrası yeni: gelen fazla
 * nüfus azalan getiriyle çıktıyı büyütmeye devam eder.
 *
 * Bu bağ yokken çıktı `development`e çakılıydı ve development dünya üretiminde
 * bir kez atanıp bir daha hiç artmıyordu. Sonuç ölçüldü: 40 yılda hammadde
 * arzı +%14, sanayi talebi +%489; bütün hammaddeler fiyat tavanına yapışıyor,
 * girdisi 8 katına çıkan fabrikalar işçi alamıyordu (bkz. market-diagnostic).
 */
/**
 * Kırsal (RGO'da çalışabilecek) nüfus. Fabrikada çalışan tarlada çalışmaz.
 *
 * `industrialEmployees` artık kümenin ULUSAL sanayi işgücündeki payıdır
 * (economy.js her hafta nüfus oranıyla yazar), yani tanım gereği kümenin
 * kendi nüfusundan küçüktür. Eski model kadroyu fabrikanın bulunduğu kümeye
 * yazıyor, taşan kısmı "banliyöcülük" diye komşu kümelere dağıtıyordu —
 * 40 satırlık bir onarım. Payla yazınca taşma YAPISAL olarak imkânsız.
 */
export function ruralPopulation(econ) {
  const population = Math.max(0, econ?.population ?? 0);
  const industrial = Math.min(Math.max(0, econ?.industrialEmployees ?? 0), population);
  return Math.max(0, population - industrial);
}

export function rgoLaborScale(province, jobs) {
  if (!province || jobs <= 0) return 0;
  // Fabrikada çalışan tarlada çalışmıyor. Bu ayrım olmadan şehir province'i
  // nüfusuyla birlikte hem sanayi hem hammadde üretiyor gibi görünüyordu.
  const rural = ruralPopulation(province);
  // Ölçü *kuruluş* kadrosudur, güncel kadro değil. Güncel kadroya bölünürken
  // gelişme çıktıya hiç yansımıyordu: kapasite artıyor, göç kırsal nüfusu yeni
  // kadroya eşitliyor, oran 1'de kalıyor, üretim yerinde sayıyordu.
  const base = Math.max(1, province.rgoBaseJobs ?? jobs);
  const ratio = rural / base;
  if (ratio <= 1) return ratio;
  return Math.min(RGO_LABOR_CAP, ratio ** RGO_LABOR_FALLOFF);
}

/** Küme econ'unun RGO istihdam durumu. */
export function rgoStatusOf(econ) {
  const type = RGO_TYPES[econ?.rgo];
  if (!econ || !type) return {
    type: null, jobs: 0, employed: 0, unemployed: 0, vacancies: 0, efficiency: 0,
  };
  const jobs = rgoJobsOf(econ);
  const employed = Math.min(Math.max(0, econ.population), jobs);
  return {
    type,
    jobs,
    employed,
    unemployed: Math.max(0, econ.population - jobs),
    vacancies: Math.max(0, jobs - econ.population),
    efficiency: jobs > 0 ? employed / jobs : 0,
  };
}

/** Kare üzerinden okuma: aynı kümenin her karesi aynı durumu döndürür. */
export function provinceRgoStatus(tile) {
  return rgoStatusOf(tile?.province);
}

// rgoStatusOf'un tahsis yapmayan tekil okumalari: sicak donguler (haftalik
// uretim, dort haftalik goc) durum nesnesinin tek alanini istiyor; nesne
// kurmak olculebilir cop uretiyordu. Deger tanimlari rgoStatusOf ile birebir.
export function rgoUnemployedOf(econ) {
  if (!econ || !RGO_TYPES[econ.rgo]) return 0;
  return Math.max(0, econ.population - rgoJobsOf(econ));
}

export function rgoVacanciesOf(econ) {
  if (!econ || !RGO_TYPES[econ.rgo]) return 0;
  return Math.max(0, rgoJobsOf(econ) - econ.population);
}

/**
 * Kümenin haftalık ulusal bütçe katkısı. Çıktı üye sayısıyla (hexes) ölçekli:
 * eskiden her kare kendi RGO'suyla üretiyordu, şimdi tek RGO kümenin tüm
 * toprağını işliyor. Kısmi işgal üretimi payı kadar keser — hex hex ilerleyen
 * ordu ekonomiyi kademeli boğar, barış masasını beklemez.
 */
/**
 * Cikti nesnesinin olasi TUM anahtarlari (taban kalemler + butun RGO mallari).
 * Karalama nesnesi geri kullanilirken onceki cagridan kalan anahtarlar bu
 * listeyle sifirlanir; okuyucular 0 degeri zaten uretim yok sayar.
 */
const PROVINCE_OUTPUT_KEYS = [...new Set([
  'gold', 'food', 'timber', 'iron', 'coal',
  ...Object.values(RGO_TYPES).map((type) => type.goodId),
])];

export function provinceOutput(world, province, out = null) {
  const econ = province?.econ;
  // Üretmeyen küme de kendi malını anahtar olarak taşımalı: çağıran taraf
  // `output[rgo.goodId]` okuyor ve eksik anahtar undefined dönüyordu.
  // `out` verilirse tahsis yerine karalama nesnesi sifirlanip doldurulur —
  // sicak toplayicilar (rawProduction, collectProvinceTotals) haftada binlerce
  // kez cagirir. Karalamanin omru cagri anidir; referansi saklama.
  let output;
  if (out) {
    output = out;
    for (const key of PROVINCE_OUTPUT_KEYS) output[key] = 0;
  } else {
    output = { gold: 0, food: 0, timber: 0, iron: 0, coal: 0 };
  }
  if (econ) output[RGO_TYPES[econ.rgo]?.goodId ?? 'food'] ??= 0;
  if (!econ || province.owner < 0) return output;
  const occupied = occupiedShareOf(world, province);
  if (occupied >= 1) return output;
  const control = clamp(econ.control / 100, 0, 1) * (1 - occupied);
  // rgoStatusOf kurmadan dogrudan okunur (ayni degerler): burasi haftada
  // binlerce kez kosan bir sicak yol.
  const type = RGO_TYPES[econ.rgo];
  if (!type) return output;
  const development = econ[type.track] ?? 0;
  // Teknoloji RGO verimini buyutur. `rgoOutput` degistiricisi hesaplanip
  // hicbir yerde okunmuyordu (olculdu, P1-6); tuketicisi burasi. Duz alan
  // okumasi — technology.js import edilmez (katman: world -> game yasak).
  const tech = 1 + (world.nations?.[province.owner]?.economy?.techMods?.rgoOutput ?? 0);
  output[type.goodId] = type.baseOutput
    * econ.rgoQuality * (1 + development * 0.18)
    * rgoLaborScale(econ, rgoJobsOf(econ)) * control * econ.hexes * tech;
  // Vergi tabanı kare başına eski ölçekte: nüfus hex payına indirgenir,
  // toplam hex sayısıyla geri çarpılır.
  const taxpayerScale = clamp(econ.population / (7000 * econ.hexes), 0, 2.2);
  // Çekirdek olmayan toprak (koloni, fetih) tam vergi vermez: sömürü gelir
  // getirir ama ev toprağı gibi işlemez — Vic2'nin non-core mantığı.
  const coreScale = province.coreOf === province.owner ? 1 : 0.55;
  output.gold = (0.08 + (econ.baseGold ?? 0) * 0.05 + econ.commerce * 0.09)
    * taxpayerScale * control * econ.hexes * coreScale;
  return output;
}

/**
 * Province migration is resolved as aggregated 100-person cohorts every four
 * weeks. No individual POP objects or pathfinding are created: unemployed
 * residents move to another RGO with vacancies inside the same country.
 */
export function runProvinceMigration(world, force = false) {
  const byNation = new Map();
  for (const nation of world.nations) {
    if (nation.economy) nation.economy.internalMigration = 0;
  }
  for (const province of world.provinces ?? []) {
    if (!province.econ) continue;
    province.econ.migration = 0;
    // Savaş bölgesi göçe kapalı: kısmen bile işgal edilmiş küme ne verir ne alır.
    if (province.owner < 0 || !world.nations[province.owner]?.alive
      || occupiedShareOf(world, province) > 0) continue;
    if (!byNation.has(province.owner)) byNation.set(province.owner, []);
    byNation.get(province.owner).push(province);
  }
  if (!force && (world.turn ?? 0) % MIGRATION_INTERVAL !== 0) return 0;

  let totalMoved = 0;
  for (const [nationId, provinces] of byNation) {
    // Sanayileşen küme de nüfus çeker. Fabrika kadrosu economy.js tarafından
    // `jobs` alanına yazılır; kümesi kare koordinatından çözülür — bu dosyanın
    // ekonomi katmanını import etmesi gerekmez.
    const factoryVacancies = new Map();
    for (const factory of world.nations[nationId]?.economy?.factories ?? []) {
      const tile = world.get(factory.q, factory.r);
      if (!tile || tile.provinceId < 0) continue;
      factoryVacancies.set(
        tile.provinceId,
        (factoryVacancies.get(tile.provinceId) ?? 0)
          + Math.max(0, (factory.jobs ?? 0) - (factory.employees ?? 0)),
      );
    }
    const cityOf = (province) => province.tileIdx.some((idx) => world.tiles[idx].city);
    const donors = provinces
      .map((province) => ({ province, surplus: rgoUnemployedOf(province.econ) }))
      .filter((row) => row.surplus >= MIGRATION_COHORT)
      .sort((a, b) => b.surplus - a.surplus);
    const receivers = provinces.map((province) => ({
      province,
      city: cityOf(province),
      vacancies: province.econ.control >= 50
        ? rgoVacanciesOf(province.econ) + (factoryVacancies.get(province.id) ?? 0)
        : 0,
    }))
      .filter((row) => row.vacancies >= MIGRATION_COHORT)
      .sort((a, b) => (
        (b.city ? 1 : 0) - (a.city ? 1 : 0)
        || b.province.econ.control - a.province.econ.control
        || b.vacancies - a.vacancies
      ));
    let receiverIndex = 0;
    let nationMoved = 0;
    for (const donor of donors) {
      let movable = Math.floor(Math.min(
        donor.surplus,
        Math.max(MIGRATION_COHORT, donor.province.econ.population * MIGRATION_RATE),
      ) / MIGRATION_COHORT) * MIGRATION_COHORT;
      while (movable >= MIGRATION_COHORT && receiverIndex < receivers.length) {
        const receiver = receivers[receiverIndex];
        if (receiver.province === donor.province) {
          receiverIndex++;
          continue;
        }
        const open = rgoVacanciesOf(receiver.province.econ)
          + (factoryVacancies.get(receiver.province.id) ?? 0);
        const vacancies = Math.floor(open / MIGRATION_COHORT) * MIGRATION_COHORT;
        if (vacancies < MIGRATION_COHORT) {
          receiverIndex++;
          continue;
        }
        const moved = Math.min(movable, vacancies);
        donor.province.econ.population -= moved;
        receiver.province.econ.population += moved;
        donor.province.econ.migration -= moved;
        receiver.province.econ.migration += moved;
        movable -= moved;
        nationMoved += moved;
        totalMoved += moved;
      }
      if (receiverIndex >= receivers.length) break;
    }
    world.nations[nationId].economy.internalMigration = nationMoved;
    world.nations[nationId].economy.lastInternalMigration = nationMoved;
    world.nations[nationId].economy.lastMigrationTurn = world.turn ?? 0;
  }
  return totalMoved;
}

// Ulus basina baris bayragi karalamasi; omru tek runProvinces cagrisidir.
const atPeaceScratch = [];

export function runProvinces(game) {
  const world = game.world;

  // Baris durumu ulus basina degismez; province basina butun uluslari
  // taramak hem O(kume x ulus) fazladan is hem kapanis (closure) copuydu.
  const atPeace = atPeaceScratch;
  atPeace.length = world.nations.length;
  for (const nation of world.nations) {
    let peace = true;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (world.relations?.[nation.id]?.[other.id]?.state === 'war') {
        peace = false;
        break;
      }
    }
    atPeace[nation.id] = peace;
  }

  const provinces = world.provinces ?? [];
  // Kitlik olumleri ACIK bir muhasebe kanalidir: nufus dususu "kayip insan"
  // degil kayitli olumdur — korunum denetimi ve ekran bu sayaci okur.
  for (const nation of world.nations) {
    if (nation.economy) nation.economy.famineDeaths = 0;
  }
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    const econ = province.econ;
    if (!econ) continue;
    // Sahiplik türetmesi: savaşta üye kareler tek tek el değiştirir (hex hex
    // işgal); hukuk çoğunluğu izler. Barış devri bütün kümeyi taşıdığında bu
    // türetme değişmeden doğru kalır.
    refreshProvinceOwner(world, province);
    if (province.owner < 0) continue;
    const nation = world.nations[province.owner];
    if (!nation?.alive) continue;
    const occupied = occupiedShareOf(world, province);
    if (occupied >= 1) {
      econ.control = clamp(econ.control - 2, 5, 100);
      continue;
    }
    const stability = Math.max(0.1, Math.min(1, nation.economy?.stability ?? 0.6));
    const citizenship = policyOf(nation, 'citizenship');
    const minorityControl = citizenship === 'full_citizenship'
      ? 1.25
      : citizenship === 'limited_citizenship' ? 0.85 : 0.6;
    // Kısmi işgal sadakati aşındırır: kazanım payı, sağlam kalan toprağın oranı.
    econ.control = clamp(
      econ.control + ((province.culture === nation.culture ? 1.5 : minorityControl)
        * (0.45 + stability)) * (1 - occupied) - occupied * 2,
      0,
      100,
    );
    const peace = atPeace[nation.id];
    // Sağlık harcaması büyümeyi hızlandırır (bkz. economy.js SOCIAL_PROGRAMS);
    // veri doğrudan okunuyor, economy.js'i import etmek katman döngüsü olurdu.
    const health = 1 + Math.min(100, nation.economy?.social?.health ?? 0) / 100 * 0.35;
    // BESLENME YALNIZ GIDADAN GELİR (bkz. econ/pop.js `foodMet`). Eski model
    // bütün sepete bakıyordu: karşılanamayan bir lüks — şarap, telefon —
    // beslenme endeksini düşürüp nüfusu eritebiliyordu. Gıda dışı kıtlık artık
    // memnuniyeti ve istikrarı vurur, açlığı değil.
    const nourishment = clamp(nation.economy?.foodMet ?? 1, 0, 1);
    const famine = nourishment < FAMINE_THRESHOLD
      ? (FAMINE_THRESHOLD - nourishment) / FAMINE_THRESHOLD : 0;
    // Taban Vic2 ölçeğinde: en iyi koşulda yılda ~%0.9, yüzyılda ~2.3 kat
    // (1836-1936 gerçeği ~1.75 kat). Eski katsayılar yüzyılda ~4.6 kat
    // veriyordu ve hiçbir RGO kapasitesi bunu kovalayamıyordu (ölçüldü,
    // bkz. market-diagnostic). İşgal payı büyümeyi de payı kadar keser.
    const weeklyGrowth = ((0.00006 + econ.agriculture * 0.00003)
      * (peace ? 1 : 0.55) * (0.45 + stability) * health
      * (0.25 + 0.75 * nourishment)) * (1 - occupied)
      - famine * FAMINE_DECLINE;
    const previousPopulation = econ.population;
    econ.population = Math.max(
      0,
      Math.round(econ.population * (1 + weeklyGrowth)),
    );
    if (econ.population < previousPopulation && nation.economy) {
      nation.economy.famineDeaths += previousPopulation - econ.population;
    }

    // Gelişme yalnız düzenin oturduğu yerde birikir: savaş, işgal ve kaos durdurur.
    const track = RGO_TYPES[econ.rgo]?.track;
    if (track && peace && occupied === 0 && econ.control > 80) {
      // Nüfus baskısı gelişmeyi hızlandırır: kadroyu aşan her el yeni tarla
      // açar, yeni kuyu kazar (gerekçe ölçümleri için git geçmişine bakınız).
      const jobs = rgoJobsOf(econ);
      const rural = ruralPopulation(econ);
      const pressure = jobs > 0 ? clamp(rural / jobs - 1, 0, 2) : 0;
      econ[track] = Math.min(
        RGO_DEVELOPMENT_CAP,
        (econ[track] ?? 0)
          + RGO_DEVELOPMENT_PER_WEEK * stability * (1 + pressure * 1.5)
            * rgoPriceDrive(world, econ),
      );
    }
  }
  // Küme sayaçları: HUD ve hegemonya gerçek province sayısını okur.
  for (const nation of world.nations) nation.provinces = 0;
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    if (province.owner >= 0 && world.nations[province.owner]) {
      world.nations[province.owner].provinces++;
    }
  }
  runProvinceMigration(world);
  game.emit('provinces', null);
}
