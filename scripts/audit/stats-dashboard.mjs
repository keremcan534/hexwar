// İSTATİSTİK PANOSU — tam kampanyanın grafiğe dökülecek zaman serisi.
//
// Kerem (2026-10-14): "bütçe hep artıda, tüfek hep fazla, binaların amacı
// yok mu, hızlıda çok şey aynı anda geliyor mu, tarih aralığı kısa mı" —
// her biri tek koşuda değil, kampanya boyunca eğri olarak görülmeli. Bu betik
// bir tohum × bir varyantı koşar ve JSON yazar; stats-dashboard-html.mjs
// bütün JSON'ları tek bir HTML panoya çizer.
//
// Ekonomi Tek Çubuk'tur (2026-10-15): haftalık ÇIKTI faturalara, orduya,
// halka ve kalkınmaya bölünür; stok kalkınma fonudur. Kesitler bu yüzden
// çıktıyı ve paylarını, ikmal krizini (s), fonu ve kalkınma kademelerini
// izler. Altın, vergi, borç, enflasyon ve inşaat kuyruğu yoktur.
//
// Oyuncu ulusu gerçek oyundaki gibi seçilir (world.playerNation, AUTO açık,
// diplomasi hariç) ve EDİLGEN oynar: kartları YZ seçimiyle kapatır, gelen
// barış teklifini kabul eder. Böylece "AUTO'ya bırakan oyuncu" ölçülür.
//
// Varyantlar (yalnız biri değişir):
//   auto      varsayılan
//   noinvest  oyuncunun kalkınması dondurulur (tavan −10: hiçbir kademe
//             alınamaz, kalkınma payı halka döner)
//   diplo     diplomasi de AUTO (oyuncu YZ gibi savaş açar ve barış yapar)
//
//   node scripts/audit/stats-dashboard.mjs SEED [variant] [years] [out.json]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { headless } from './harness.mjs';
import { CAMPAIGN_TURNS, exactYearOfTurn } from '../../src/game/calendar.js';
import {
  EQUIPMENT, EQUIPMENT_IDS, RESOURCES, RESOURCE_IDS, TRADE, UNIT_EQUIPMENT,
} from '../../src/game/econ/defs.js';
import { developmentCap, fundFloor } from '../../src/game/econ/investment.js';
import { inSupplyCrisis } from '../../src/game/econ/bills.js';
import { addIdea, refreshModifiers } from '../../src/game/modifiers.js';
import { applyDefaultDelegation, setDelegation } from '../../src/game/delegation.js';
import { EVENT_CARDS, resolveCard } from '../../src/game/eventCards.js';
import { activeAlerts } from '../../src/game/alerts.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { mobilizationTarget, MOBILIZATION, isMobilized } from '../../src/game/mobilization.js';
import { UNIT_TYPES, isConscript } from '../../src/game/units.js';
import { hegemonyScore } from '../../src/game/hegemony.js';

const VARIANTS = ['auto', 'noinvest', 'diplo'];
const SEED = process.argv[2] ?? 'STAT1';
const VARIANT = process.argv[3] ?? 'auto';
const YEARS = Number(process.argv[4] ?? 0);
const OUT = process.argv[5] ?? `scripts/audit/_tmp/stats/${SEED}-${VARIANT}.json`;
const WEEKS = YEARS > 0 ? Math.round(YEARS * 52.18) : CAMPAIGN_TURNS;
const BUCKET = 4;
// Eski varyantlar (nobuild, noinflation) kaldırılan ekonomiyi ölçüyordu:
// sessizce auto koşmasın, yanlış etiketli JSON panoya karışır.
if (!VARIANTS.includes(VARIANT)) throw new Error(`bilinmeyen varyant "${VARIANT}" (${VARIANTS.join(' | ')})`);

const game = headless(SEED, { cols: 160, rows: 96 });
const world = game.world;
const player = world.nations[world.playerNation];
game.turns.playerNation = player.id;
applyDefaultDelegation(player, world.turn ?? 1);
if (VARIANT === 'diplo') setDelegation(game, player, 'diplomacy', true);
if (VARIANT === 'noinvest') {
  // scenario-runner.freezeDevelopment ile aynı fikir: tavan her zaman 1'e
  // kırpılır, uygun state kalmaz (econ/investment.eligible).
  addIdea(player, 'audit_freeze_development', 'Audit: development frozen', { developmentCap: -10 });
  refreshModifiers(player, world.turn ?? 0);
}

// Oyuncuya düşen her bildirim, türüyle sayılır (gerçek oyunda kenar akışı).
// `silent` kayıt yalnız günlüğe yazılır, ekrana kart çıkmaz (notifications.js).
const notes = {};
game.notifications = {
  push(text, meta = {}) {
    if (meta.silent || !text) return;
    const k = meta.kind ?? 'OTHER';
    notes[k] = (notes[k] ?? 0) + 1;
  },
};

const quantile = (list, q) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))];
};
const median = (l) => quantile(l, 0.5);
const BAR_KEYS = ['output', 'bills', 'army', 'people', 'invest'];

/** Kara ordusunun kuruluş teçhizatı (alay × kit) ve alay sayıları. */
function armyOf(nationId) {
  const need = {};
  let regiments = 0;
  let conscripts = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nationId || unit.type.domain !== 'land') continue;
    for (const regiment of unit.regiments ?? []) {
      regiments++;
      if (isConscript(unit)) conscripts++;
      for (const [id, n] of Object.entries(UNIT_EQUIPMENT[regiment.typeId] ?? {})) need[id] = (need[id] ?? 0) + n;
    }
  }
  return { need, regiments, conscripts };
}

/** Oyuncunun state kademeleri (id → kademe): alınan kademe sayımı ve dağılım. */
function developmentLevels(nationId) {
  const levels = new Map();
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ) levels.set(province.id, province.econ.development ?? 1);
  }
  return levels;
}

/** Fon tabana yapışmış mı (econ-audit ile aynı %1 payı). */
function fundPinned(nation) {
  const floor = fundFloor(nation);
  return floor < 0 && (nation.fund ?? 0) <= floor * 0.99;
}

function autoCard(nation) {
  const pending = nation.cards?.pending ?? [];
  for (const entry of [...pending]) {
    const card = EVENT_CARDS[entry.id];
    let best = 0;
    let bestWeight = -Infinity;
    card.options.forEach((option, index) => {
      if (option.available && !option.available(nation)) return;
      const w = option.ai ? option.ai(nation) : 1;
      if (w > bestWeight) { best = index; bestWeight = w; }
    });
    resolveCard(game, nation, entry.key, best);
  }
}

const samples = [];
let acc = null;
const emptyBar = () => ({ output: 0, bills: 0, army: 0, people: 0, invest: 0, supply: 0 });
const freshAcc = () => ({
  ledger: {}, cards: 0, peaceOffers: 0, alertsMax: 0, alertWeeks: 0, alertKinds: {}, notes: {},
  warWeeks: 0, levels: 0, rifleOut: 0, rifleUsed: 0,
  bar: emptyBar(), s: 0, crisisWeeks: 0,
  world: { ...emptyBar(), crisis: 0, nationWeeks: 0 },
});
acc = freshAcc();
let prevLevels = developmentLevels(player.id);
let prevRifles = player.economy?.stock?.rifles ?? 0;
const t0 = performance.now();

for (let week = 1; week <= WEEKS; week++) {
  const notesBefore = { ...notes };
  const cardsBefore = player.cards?.pending?.length ?? 0;
  game.turns.endTurn();
  if (!player.alive) break;
  const e = player.economy;
  // Kart ve barış: edilgen oyuncu.
  acc.cards += Math.max(0, (player.cards?.pending?.length ?? 0) - cardsBefore);
  autoCard(player);
  for (const offer of [...game.pendingPeace()]) {
    if (offer.to !== player.id) continue;
    acc.peaceOffers++;
    game.resolvePeaceOffer(offer.id, true);
  }
  for (const [k, v] of Object.entries(notes)) acc.notes[k] = (acc.notes[k] ?? 0) + v - (notesBefore[k] ?? 0);
  const alertList = activeAlerts(world, player);
  const alerts = alertList.length;
  acc.alertsMax = Math.max(acc.alertsMax, alerts);
  if (alerts > 0) acc.alertWeeks++;
  for (const a of alertList) { const k = a.kind?.id ?? a.kind ?? a.id ?? '?'; acc.alertKinds[k] = (acc.alertKinds[k] ?? 0) + 1; }
  if ((e.warFronts ?? 0) > 0) acc.warWeeks++;
  for (const [k, v] of Object.entries(e.ledger ?? {})) {
    if (typeof v === 'number') acc.ledger[k] = (acc.ledger[k] ?? 0) + v;
  }
  // Çubuk: haftalık paylar kova boyunca toplanır (tek haftanın gürültüsü yerine).
  for (const k of BAR_KEYS) acc.bar[k] += e.alloc?.[k] ?? 0;
  // Ordu ve donanmanın ikmal faturasının ÖDENEN kısmı (eski "ordu bakımı").
  acc.bar.supply += ((e.bills?.army ?? 0) + (e.bills?.navy ?? 0)) * (e.bills?.s ?? 1);
  acc.s += e.bills?.s ?? 1;
  if (inSupplyCrisis(player)) acc.crisisWeeks++;
  // Alınan kademe: iki hafta da oyuncunun olan state'in kademe artışı
  // (fetihle gelen state sayılmaz).
  const levels = developmentLevels(player.id);
  for (const [id, level] of levels) {
    const before = prevLevels.get(id);
    if (before !== undefined && level > before) acc.levels += level - before;
  }
  prevLevels = levels;
  const riflesOut = e.lines?.rifles?.output ?? 0;
  acc.rifleOut += riflesOut;
  const rifles = e.stock?.rifles ?? 0;
  acc.rifleUsed += Math.max(0, prevRifles + riflesOut - rifles);
  prevRifles = rifles;
  for (const n of world.nations) {
    if (!n.alive || !n.economy?.alloc) continue;
    const ne = n.economy;
    for (const k of BAR_KEYS) acc.world[k] += ne.alloc[k] ?? 0;
    acc.world.supply += ((ne.bills?.army ?? 0) + (ne.bills?.navy ?? 0)) * (ne.bills?.s ?? 1);
    acc.world.nationWeeks++;
    if (inSupplyCrisis(n)) acc.world.crisis++;
  }

  if (week % BUCKET !== 0) continue;

  // ---- Oyuncu kesiti ----
  const army = armyOf(player.id);
  const manpower = nationManpower(world, player.id);
  const mobTarget = isMobilized(player) ? player.mobilization.target : mobilizationTarget(world, player);
  const lines = e.lines ?? {};
  const usedMil = EQUIPMENT_IDS.reduce((s, id) => s + (lines[id]?.ic ?? 0), 0);
  const effRifles = lines.rifles?.efficiency ?? 0.5;
  const stock = {};
  for (const id of EQUIPMENT_IDS) stock[id] = Math.round(e.stock?.[id] ?? 0);
  const barOut = Math.max(1e-9, acc.bar.output);
  const levelList = [...levels.values()];
  const P = {
    fund: player.fund ?? 0, fundFloor: fundFloor(player), outputAvg: e.outputAvg ?? 0,
    ledger: acc.ledger,
    output: acc.bar.output / BUCKET,
    // Kovadaki çıktının payları (0-1): faturalar + ordu + halk + kalkınma = 1.
    shares: {
      bills: acc.bar.bills / barOut, army: acc.bar.army / barOut,
      people: acc.bar.people / barOut, invest: acc.bar.invest / barOut,
      supply: acc.bar.supply / barOut,
    },
    s: acc.s / BUCKET, crisisWeeks: acc.crisisWeeks,
    feed: e.feed?.target ?? 1, feedAuto: e.feed?.mode !== 'manual',
    ic: e.ic?.total ?? 0, icMil: e.ic?.military ?? 0, icCiv: e.ic?.civil ?? 0, icUsed: usedMil,
    consumer: e.consumer?.ratio ?? 1,
    stock,
    rifleNeed: army.need.rifles ?? 0,
    rifleOutWk: acc.rifleOut / BUCKET, rifleUsedWk: acc.rifleUsed / BUCKET,
    // Bütün askerî IC tüfeğe verilse haftada kaç tüfek (hat verimiyle).
    // Eskiden 0.1'e bölünüyordu: tüfeğin bedeli 0.1 IC'den 4 IC'ye çıktı.
    rifleCapWk: (e.ic?.military ?? 0) * effRifles / EQUIPMENT.rifles.ic,
    regiments: army.regiments, conscripts: army.conscripts,
    manpower, manpowerRegiments: manpower / UNIT_TYPES.INFANTRY.manpower,
    mobTarget, mobRifles: mobTarget * MOBILIZATION.RIFLES,
    mobilized: isMobilized(player),
    law: player.politics?.laws?.economy ?? null,
    // Kalkınma: nüfus ağırlıklı ortalama, state kademelerinin dağılımı, tavan.
    development: e.development ?? 1,
    dev: [quantile(levelList, 0.1), median(levelList), quantile(levelList, 0.9)],
    devCap: developmentCap(player),
    levels: acc.levels,
    population: e.population ?? 0, provinces: player.provinces ?? 0,
    score: hegemonyScore(world, player).total,
    stability: player.stability ?? 0,
    warWeeks: acc.warWeeks, cards: acc.cards, peaceOffers: acc.peaceOffers,
    alertsMax: acc.alertsMax, alertWeeks: acc.alertWeeks, alertKinds: acc.alertKinds, notes: acc.notes,
  };

  // ---- Dünya kesiti (canlı ekonomiler) ----
  const live = world.nations.filter((n) => n.alive && n.economy);
  const fundWeeks = [];
  const devs = [];
  const consumers = [];
  const rifleCover = [];
  const milIdle = [];
  const warCover = [];
  const warIdle = [];
  let warShort = 0;
  let pinned = 0;
  let crisis = 0;
  let wars = 0;
  for (const n of live) {
    const ne = n.economy;
    // Fon, haftalık çıktının katı olarak (eski "hazinede kaç haftalık gelir").
    fundWeeks.push((n.fund ?? 0) / Math.max(1, ne.outputAvg ?? 0));
    devs.push(ne.development ?? 1);
    consumers.push(ne.consumer?.ratio ?? 1);
    if (fundPinned(n)) pinned++;
    if (inSupplyCrisis(n)) crisis++;
    const a = armyOf(n.id);
    if ((a.need.rifles ?? 0) > 0) rifleCover.push((ne.stock?.rifles ?? 0) / a.need.rifles);
    const mil = ne.ic?.military ?? 0;
    if (mil > 0.05) {
      const used = EQUIPMENT_IDS.reduce((s, id) => s + (ne.lines?.[id]?.ic ?? 0), 0);
      milIdle.push(1 - Math.min(1, used / mil));
    }
    if ((ne.warFronts ?? 0) > 0) {
      wars++;
      if ((a.need.rifles ?? 0) > 0) warCover.push((ne.stock?.rifles ?? 0) / a.need.rifles);
      if (mil > 0.05) {
        const used = EQUIPMENT_IDS.reduce((s, id) => s + (ne.lines?.[id]?.ic ?? 0), 0);
        warIdle.push(1 - Math.min(1, used / mil));
      }
      // Bir piyade alayını donatamayan savaştaki ulus: teçhizat bağlıyor.
      if ((ne.stock?.rifles ?? 0) < UNIT_EQUIPMENT.INFANTRY.rifles) warShort++;
    }
  }
  // Tabandan kalkmış fiyat: kaynak ticaret sinyali taşıyor (econ-audit eşiği).
  const offFloor = RESOURCE_IDS.filter((id) => world.market.prices[id] / RESOURCES[id].price > TRADE.minPrice + 0.02).length;
  const nationWeeks = Math.max(1, acc.world.nationWeeks);
  const W = {
    nations: live.length,
    fundWeeks: [quantile(fundWeeks, 0.25), median(fundWeeks), quantile(fundWeeks, 0.75), quantile(fundWeeks, 0.9)],
    pinnedShare: pinned / live.length,
    crisisShare: crisis / live.length,
    dev: [quantile(devs, 0.1), median(devs), quantile(devs, 0.9)],
    consumer: [quantile(consumers, 0.25), median(consumers), quantile(consumers, 0.75)],
    offFloor: offFloor / RESOURCE_IDS.length,
    rifleCover: [quantile(rifleCover, 0.25), median(rifleCover), quantile(rifleCover, 0.75)],
    milIdle: [quantile(milIdle, 0.25), median(milIdle), quantile(milIdle, 0.75)],
    atWarShare: wars / live.length,
    atWar: wars,
    warCover: [quantile(warCover, 0.25), median(warCover), quantile(warCover, 0.75)],
    warIdle: [quantile(warIdle, 0.25), median(warIdle), quantile(warIdle, 0.75)],
    warShort,
    // Dünya çubuğu: haftalık ortalama IC (paylar panoda çıktıya bölünür);
    // `crisis` krizdeki ulus-haftaların payı.
    flows: {
      ...Object.fromEntries([...BAR_KEYS, 'supply'].map((k) => [k, acc.world[k] / BUCKET])),
      crisis: acc.world.crisis / nationWeeks,
    },
  };

  samples.push({ week, year: Number(exactYearOfTurn(world.turn).toFixed(3)), P, W });
  acc = freshAcc();
}

const out = {
  seed: SEED, variant: VARIANT, weeks: WEEKS, bucket: BUCKET,
  player: { id: player.id, name: player.name, alive: player.alive },
  ms: Math.round(performance.now() - t0),
  samples,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`${SEED} ${VARIANT}: ${samples.length} örnek, ${Math.round(out.ms / 1000)} sn → ${OUT}`);
