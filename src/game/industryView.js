// Sanayi ekranının VERİ KATMANI.
//
// Neden ayrı dosya: ekran hiçbir simülasyon formülünü yeniden kurmaz
// (bkz. VICTORIA_LITE değişmez #2 — "sayı üreten, onu gösterendir"). Fabrika
// ekranı doluluk, kâr sebebi, uyarı eşiği ve inşa engelini kendi hesaplasaydı
// simülasyondan sapardı; bütçede ölçülen sapma sınıfı tam olarak buydu.
//
// Burası `game` katmanıdır: DOM'a dokunmaz, Node'da tek başına çalışır.
//
// TEŞHİS TEK YERDE. Aynı durum dört yerde görünür (sol listedeki uyarı
// sayacı, kart rozeti, kâr satırının altındaki sebep ve "Needs Attention"
// süzgeci) ve dördü de `factoryDiagnosis`ten gelir. Ayrı ayrı hesaplansaydı
// kart "kârlı" derken süzgeç aynı tesisi soruna atabilirdi.

import {
  FACTORIES, GOODS, MAX_FACTORY_LEVEL, canBuildFactory, expansionCost,
  factoryAtlas, factoryCost, factoryJobs, factoryMargin, factoryOutputs,
  industryTaken, marketInputAvailability, priceOf, upgradeOutlook,
} from './economy.js';
import { factoryInvestmentRules } from './politics.js';
import {
  PROJECT_KIND, constructionAtlas, constructionPower, ensureConstruction,
} from './construction.js';

/** Tur numarasindan yil. Ekranla ayni formul — tek yerde durur. */
function eraYear(turn) {
  return 1836 + Math.floor(((turn ?? 1) - 1) * 7 / 365);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Tesisin kategorisi ÜRÜNÜNDEN gelir; ayrı bir tablo tutmak sapma üretirdi. */
export function categoryOf(typeId) {
  const type = FACTORIES[typeId];
  if (!type) return 'industrial';
  const first = Object.keys(type.outputs ?? {})[0];
  const category = GOODS[first]?.category ?? 'industrial';
  // Lüks tüketimdir: ekranda ayrı bir sekme açmaya değmiyor.
  return category === 'luxury' ? 'consumer' : category;
}

export const CATEGORY_LABELS = {
  consumer: 'Consumer Goods',
  industrial: 'Industrial Goods',
  military: 'Military Goods',
  raw: 'Raw Materials',
};

/** Bir malın tek satırlık künyesi: ad + haftalık akış. */
function goodRow(id, perWeek) {
  return {
    id,
    name: GOODS[id]?.name ?? id,
    icon: GOODS[id]?.icon ?? '',
    perWeek,
  };
}

/** Girdi karşılanması bunun altındaysa tesis hammadde bekliyor demektir. */
const INPUT_SHORTAGE = 0.95;
/**
 * İŞÇİ KITLIĞI MUTLAK DEĞİL, GÖRECELİDİR.
 *
 * Mutlak eşik denendi ve yanlış çıktı: oyun ülkenin BÜTÜN tesislerini %50
 * kadroyla başlatıyor, dolayısıyla ilk haftada on tesisin onu birden "işçi
 * kıtlığı" rozetiyle kırmızıya dönüyordu — oysa bu ülkenin normal hâli.
 *
 * Doğru soru "bu tesis yarım mı?" değil, "bu tesis ülkenin geri kalanından
 * DAHA MI KÖTÜ doluyor?" — çünkü oyuncunun müdahale edebileceği tek durum
 * budur. Ulusal ortalamanın bu kadar altında kalan tesis gerçekten aç kalmıştır.
 */
const FILL_GAP = 0.25;
/** Görecelilik ne olursa olsun, bu doluluğun üstü kıtlık sayılmaz. */
const FILL_CEILING = 0.85;
/** Bunun altındaki doluluk hâlâ "işe alıyor" — sorun değil, durum. */
const HIRING_FILL = 0.95;
/** Bu marjın üstü "güçlü talep" sayılır. */
const STRONG_MARGIN = 0.22;
/** Bir yıldır maliyetinin bu kadarını bile toplayamamış şantiye: takılı. */
const STALLED_FUNDING = 0.1;

/**
 * TEK TEŞHİS KAPISI. Kart rozeti, kâr satırının altındaki sebep, sol listedeki
 * uyarı sayacı ve "Needs Attention" süzgeci HEPSİ burayı okur.
 *
 * Üç ayrı yerde hesaplansaydı üç farklı cevap verirdi: kart "kârlı" derken
 * süzgeç aynı tesisi soruna atabilirdi.
 *
 * `attention` alanı bilerek dar tutulur — sorun sayılan tek şey OYUNCUNUN
 * MÜDAHALE EDEBİLECEĞİ durumdur. İşe alım ve büyüme sorun değildir.
 */
const DIAGNOSIS = {
  LOSING_MONEY: { id: 'LOSING_MONEY', label: 'Losing Money', tone: 'bad', weight: 50, attention: true },
  INPUT_SHORTAGE: { id: 'INPUT_SHORTAGE', label: 'Input Shortage', tone: 'bad', weight: 45, attention: true },
  WORKER_SHORTAGE: { id: 'WORKER_SHORTAGE', label: 'Worker Shortage', tone: 'warn', weight: 40, attention: true },
  IDLE: { id: 'IDLE', label: 'Idle', tone: 'warn', weight: 35, attention: true },
  SUBSIDIZED: { id: 'SUBSIDIZED', label: 'Subsidised', tone: 'warn', weight: 30, attention: true },
  HIRING: { id: 'HIRING', label: 'Hiring', tone: 'neutral', weight: 10, attention: false },
  STARTING: { id: 'STARTING', label: 'Starting up', tone: 'neutral', weight: 8, attention: false },
  EXPANDING: { id: 'EXPANDING', label: 'Expanding', tone: 'good', weight: 5, attention: false },
  PROFITABLE: { id: 'PROFITABLE', label: 'Profitable', tone: 'good', weight: 0, attention: false },
};

export const ATTENTION_STATUSES = Object.values(DIAGNOSIS)
  .filter((entry) => entry.attention).map((entry) => entry.id);

/**
 * Tesisin bu haftaki en kıt girdisi — sebep cümlesi bunu ADLANDIRIR.
 * Kıtlık ölçüsü piyasanın kendi ölçüsüdür (`marketInputAvailability`); ekran
 * için ikinci bir kıtlık tanımı kurulmaz.
 */
function scarcestInput(availability, factory) {
  const type = FACTORIES[factory.typeId];
  if (!type) return null;
  let worst = null;
  for (const id in type.inputs) {
    const share = clamp(availability[id] ?? 1, 0, 1);
    if (!worst || share < worst.share) worst = { id, share, name: GOODS[id]?.name ?? id };
  }
  return worst && worst.share < INPUT_SHORTAGE ? worst : null;
}

/**
 * @returns {{status:object, reason:string}} tek birincil durum + düz cümle
 */
export function factoryDiagnosis(world, availability, factory, nationalFill = 1, started = true) {
  // KAMPANYANIN ILK KARESI TEsHIS EDILEMEZ. Ilk hafta kapanmadan once
  // `throughput`, `profit` ve `margin` alanlarinin hepsi 0'dir; bu "atil" da
  // "zararda" da degildir, HENUZ HESAPLANMAMIStir. Ayrimi yapmayinca oyunun
  // acilis ekrani butun tesisleri "Idle" rozetiyle karsiliyordu.
  //
  // Olcut piyasa degil ULUSUN DEFTERIDIR: `market.lastUpdated` dunya kurulurken
  // 1 yazilir (fiyatlar tohumlanir), oysa defter ancak gercek bir `closeWeek`
  // sonrasi dolar.
  if (!started) {
    return { status: DIAGNOSIS.STARTING, reason: 'Awaiting the first week' };
  }
  const jobs = Math.max(1, factoryJobs(factory));
  const fill = clamp((factory.employees ?? 0) / jobs, 0, 1);
  const scarce = scarcestInput(availability, factory);
  const profit = factory.profit ?? 0;

  // Sıra ÖNEM sırasıdır: bir tesisin tek bir birincil durumu olur, dört rozet
  // üst üste binmez. İkincil bilgi sebep cümlesinde kalır.
  if ((factory.subsidyPaid ?? 0) > 0) {
    return { status: DIAGNOSIS.SUBSIDIZED, reason: 'The treasury covers its losses' };
  }
  if (profit < -0.005) {
    if (scarce) return { status: DIAGNOSIS.LOSING_MONEY, reason: `${scarce.name} shortage` };
    const outputs = factoryOutputs(factory, FACTORIES[factory.typeId]) ?? {};
    const revenue = Object.entries(outputs)
      .reduce((sum, [id, qty]) => sum + priceOf(world, id) * qty * (factory.throughput ?? 0), 0);
    const wages = factory.wages ?? 0;
    return {
      status: DIAGNOSIS.LOSING_MONEY,
      reason: revenue > 0 && wages / revenue > 0.55 ? 'Wages outrun output' : 'Inputs too expensive',
    };
  }
  if (scarce) {
    return { status: DIAGNOSIS.INPUT_SHORTAGE, reason: `${scarce.name} shortage` };
  }
  if (fill < FILL_CEILING && fill < nationalFill - FILL_GAP) {
    return { status: DIAGNOSIS.WORKER_SHORTAGE, reason: 'Cannot find workers' };
  }
  if ((factory.throughput ?? 0) <= 0.01) {
    return { status: DIAGNOSIS.IDLE, reason: 'Producing nothing this week' };
  }
  if (fill < HIRING_FILL) {
    return { status: DIAGNOSIS.HIRING, reason: 'Filling its posts' };
  }
  if ((factory.level ?? 1) < MAX_FACTORY_LEVEL && (factory.margin ?? 0) > STRONG_MARGIN) {
    return { status: DIAGNOSIS.EXPANDING, reason: 'Strong demand' };
  }
  return { status: DIAGNOSIS.PROFITABLE, reason: 'Steady trade' };
}

function factoryRow(world, nation, availability, factory, region, expansions, nationalFill, started) {
  const type = FACTORIES[factory.typeId];
  const jobs = Math.max(0, factoryJobs(factory));
  const { status, reason } = factoryDiagnosis(world, availability, factory, nationalFill, started);
  const outlook = upgradeOutlook(nation, factory);
  const throughput = factory.throughput ?? 0;
  // Yukseltme MUMKUN MU, degilse NEDEN? Gri bir dugme sebebini soylemezse
  // oyuncu neyi bekleyecegini bilemez (madde 19).
  const expansion = expansions.get(factory.id) ?? null;
  const cost = expansionCost(factory).gold ?? 0;
  const upgradeBlocked = (factory.level ?? 1) >= MAX_FACTORY_LEVEL
    ? 'Already at the maximum level'
    : expansion ? 'An expansion is already under way'
      : !factoryInvestmentRules(nation).stateExpand ? 'Policy forbids state investment'
        : (nation.gold ?? 0) < cost
          ? `Treasury short by ¤${Math.ceil(cost - (nation.gold ?? 0))}`
          : null;
  return {
    id: factory.id,
    typeId: factory.typeId,
    name: type?.name ?? factory.typeId,
    icon: type?.icon ?? '',
    category: categoryOf(factory.typeId),
    categoryLabel: CATEGORY_LABELS[categoryOf(factory.typeId)],
    level: factory.level ?? 1,
    maxLevel: MAX_FACTORY_LEVEL,
    stateId: region?.id ?? null,
    stateName: region?.name ?? '',
    employees: Math.round(factory.employees ?? 0),
    jobs,
    fill: jobs > 0 ? clamp((factory.employees ?? 0) / jobs, 0, 1) : 0,
    // Girdi/çıktı HAFTALIK GERÇEK akıştır, tabelaya yazılı kapasite değil:
    // yarım kadroyla çalışan tesis yarım hammadde tüketir.
    inputs: Object.entries(type?.inputs ?? {})
      .map(([id, amount]) => goodRow(id, amount * throughput)),
    outputs: Object.entries(factoryOutputs(factory, type) ?? {})
      .map(([id, amount]) => goodRow(id, amount * throughput)),
    profit: factory.profit ?? 0,
    margin: factory.margin ?? 0,
    wages: factory.wages ?? 0,
    subsidized: Boolean(factory.subsidized),
    subsidyPaid: factory.subsidyPaid ?? 0,
    reason,
    status,
    // Dikkat isteyen tesis: SUZGEC, SOL LISTEDEKI SAYAC ve KART ROZETI ayni
    // bayragi okur (madde 2 ve 4).
    attention: status.attention === true,
    upgrade: outlook,
    upgradeCost: cost,
    upgradeBlocked,
    expansion,
  };
}

/**
 * EKRANIN OKUDUĞU TEK KAYNAK.
 *
 * @returns {object|null} `{ summary, states, factories, construction, rules }`
 */
export function industryOverview(world, nation) {
  const economy = nation?.economy;
  if (!economy) return null;
  const { atlas, regions } = factoryAtlas(world, nation.id);
  const availability = marketInputAvailability(world.market);
  const queue = ensureConstruction(nation);
  // Suren genisletme projeleri tesis kimligine gore indekslenir: kart hem
  // "Upgrade" dugmesinin neden kapali oldugunu hem de "Cancel expansion"
  // secenegini buradan ogrenir.
  const expansions = new Map();
  for (const project of queue.projects) {
    if (project.kind === PROJECT_KIND.UPGRADE && project.factoryId != null) {
      expansions.set(project.factoryId, {
        projectId: project.id,
        actor: project.actor ?? 'state',
        funded: project.funded ?? 0,
        cost: project.cost ?? 0,
        percent: Math.round(clamp((project.progress ?? 0) / (project.work ?? 1), 0, 1) * 100),
        // Iade kurali construction.cancelConstruction'in kendisidir; burada
        // yalniz AYNI kural okunur, ikinci bir muhasebe kurulmaz.
        refund: Math.max(0, (project.funded ?? 0)
          * (1 - clamp((project.progress ?? 0) / (project.work ?? 1), 0, 1))),
      });
    }
  }
  // Ulusal doluluk teshisin referansidir (bkz. FILL_GAP): tek tesisin yarim
  // olmasi degil, DIGERLERINDEN geride olmasi sorundur.
  let staffed = 0;
  let posts = 0;
  for (const factory of economy.factories ?? []) {
    staffed += Math.max(0, factory.employees ?? 0);
    posts += Math.max(0, factoryJobs(factory));
  }
  const nationalFill = posts > 0 ? clamp(staffed / posts, 0, 1) : 1;
  const started = (economy.ledger?.lastUpdated ?? 0) > 0;

  const rows = [];
  for (const [factory, region] of regions) {
    rows.push(factoryRow(world, nation, availability, factory, region, expansions, nationalFill, started));
  }
  // İşgal altındaki state atlasa girmez; oradaki tesis yok sayılmamalı.
  const stranded = (economy.factories ?? []).filter((factory) => !regions.has(factory));
  for (const factory of stranded) {
    rows.push(factoryRow(world, nation, availability, factory, null, expansions, nationalFill, started));
  }

  const byState = new Map();
  for (const row of rows) {
    if (!row.stateId) continue;
    if (!byState.has(row.stateId)) byState.set(row.stateId, []);
    byState.get(row.stateId).push(row);
  }

  // SANAYI YUVASI, BINA YUVASI DEGIL. `region.slots` insaat (kale) yuvasidir;
  // sanayide kural baskadir: bir state'te her turden EN FAZLA BIR tesis olur
  // (bkz. economy.industryTaken). Ekranin "bos yuva" sayisi bu kuraldan gelir.
  const industrySlots = Object.keys(FACTORIES).length;
  const states = atlas.regions.map((region) => {
    const list = byState.get(region.id) ?? [];
    return {
      id: region.id,
      name: region.name,
      population: region.population,
      plants: list.length,
      slots: industrySlots,
      free: Math.max(0, industrySlots - list.length),
      profit: list.reduce((sum, row) => sum + row.profit, 0),
      // Sifirsa ekranda HIC gosterilmez (madde 3).
      attention: list.filter((row) => row.attention).length,
    };
    // SIRA "NEREYE BAKAYIM" SORUSUNU CEVAPLAR: once sanayisi olan state'ler,
    // sonra kar. Yalniz kara gore siralayinca ilk hafta butun karlar 0 oluyor
    // ve ekran alfabetik olarak SANAYISI OLMAYAN bir state'i seciyordu.
  }).sort((a, b) => (b.plants > 0) - (a.plants > 0)
    || b.profit - a.profit
    || b.plants - a.plants
    || a.name.localeCompare(b.name));

  const power = constructionPower(nation);
  let cumulative = 0;
  const construction = queue.projects
    .filter((project) => project.kind === PROJECT_KIND.FACTORY
      || project.kind === PROJECT_KIND.UPGRADE)
    .map((project) => {
      const type = FACTORIES[project.typeId];
      const work = project.work ?? 1;
      cumulative += Math.max(0, work - (project.progress ?? 0));
      const paidShare = project.cost > 0 ? clamp(project.funded / project.cost, 0, 1) : 1;
      return {
        id: project.id,
        typeId: project.typeId,
        name: project.kind === PROJECT_KIND.UPGRADE
          ? `${type?.name ?? project.typeId} expansion`
          : type?.name ?? project.typeId,
        icon: type?.icon ?? '',
        // Rayin simgesi urunun madalyonudur; emoji yalniz son care (bkz.
        // industryScreen.railColumn — "sticker" gorunumu tam buradan geliyordu).
        outputId: Object.keys(type?.outputs ?? {})[0] ?? null,
        stateName: project.regionName ?? '',
        actor: project.actor ?? 'state',
        percent: Math.round(clamp((project.progress ?? 0) / work, 0, 1) * 100),
        paidPercent: Math.round(paidShare * 100),
        weeksLeft: Math.max(1, Math.ceil(cumulative / Math.max(1, power))),
        owed: Math.max(0, (project.cost ?? 0) - (project.funded ?? 0)),
        // Parası akmayan özel şantiye "inşaat" değil, niyettir.
        stalled: project.actor === 'private' && paidShare < STALLED_FUNDING,
      };
    });
  const jobs = rows.reduce((sum, row) => sum + row.jobs, 0);
  return {
    summary: {
      factories: rows.length,
      workers: rows.reduce((sum, row) => sum + row.employees, 0),
      jobs,
      weeklyProfit: economy.factoryProfit ?? 0,
      hiredPerMonth: economy.industrialHiring ?? 0,
      privateCapital: nation.politics?.privateCapital ?? 0,
      privateInflow: nation.politics?.privateInflow ?? 0,
      freeSlots: states.reduce((sum, state) => sum + state.free, 0),
      totalSlots: states.length * industrySlots,
      buildPower: power,
    },
    states,
    factories: rows,
    construction,
    rules: factoryInvestmentRules(nation),
  };
}

/**
 * İnşa kataloğu: bir state'te kurulabilecek tesisler, KURULAMIYORSA NEDENİ.
 * Gri bir düğme sebebini söylemezse oyuncu neyi bekleyeceğini bilemez.
 */
export function factoryBuildOptions(world, nation, regionId) {
  const region = constructionAtlas(world, nation.id).regions
    .find((candidate) => candidate.id === regionId);
  if (!region) return null;
  const rules = factoryInvestmentRules(nation);
  const turn = world.turn ?? 1;
  const options = Object.values(FACTORIES).map((type) => {
    const taken = industryTaken(world, nation, regionId, type.id);
    const cost = factoryCost(nation, type.id);
    const era = type.availableFrom ?? 0;
    const locked = era > turn;
    const gold = cost.gold ?? 0;
    const enabled = !taken && canBuildFactory(world, nation, regionId, type.id);
    const blocked = enabled ? null
      : taken ? 'Already present in this state'
        : locked ? `Not yet invented — available from ${eraYear(era)}`
          : !rules.stateBuild ? 'Policy forbids state industry'
            : (nation.gold ?? 0) < gold ? `Treasury short by ¤${Math.ceil(gold - (nation.gold ?? 0))}`
              : region.free <= 0 ? 'No free industrial slot in this state'
                : 'Unavailable';
    const margin = factoryMargin(world, type.id);
    return {
      typeId: type.id,
      name: type.name,
      icon: type.icon,
      category: categoryOf(type.id),
      categoryLabel: CATEGORY_LABELS[categoryOf(type.id)],
      cost: gold,
      workers: factoryJobs({ level: 1 }),
      inputs: Object.entries(type.inputs ?? {}).map(([id, amount]) => goodRow(id, amount)),
      outputs: Object.entries(type.outputs ?? {}).map(([id, amount]) => goodRow(id, amount)),
      margin,
      // Pazar durumu: aynı sayının cümlesi. "0.42" değil "kârlı".
      market: margin > 1 ? 'Profitable at current prices'
        : margin > 0 ? 'Thin margin at current prices'
          : 'Unprofitable at current prices',
      era,
      eraLabel: era ? eraYear(era) : null,
      enabled,
      blocked,
    };
  });
  return { region, options, treasury: nation.gold ?? 0, policy: rules.policy };
}
