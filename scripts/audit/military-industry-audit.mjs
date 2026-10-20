// ASKERÎ SANAYİ DÖNGÜSÜ DENETİMİ — sanayi savaş gücüne dönüşüyor mu?
//
// Kerem (2026-10-14): "tüfek hep fazla, barışta askerî fabrikaya ihtiyaç yok,
// binaların amacı yok". İstatistik panosu (stats-dashboard.mjs) kökü gösterdi:
// ordu insan gücüyle sınırlıydı (havuzun ~%90'ı barışta silah altında),
// seferberlik ve takviye aç kalıyordu, askerî IC %96-100 boştu, zırh/hava
// alayı hiç kurulmuyordu, tüketim malı oranı 2'ye çıkıp vergi tavanını
// (1.4) geçiyordu. Bu denetim o döngünün her halkasını tek satırda ölçer.
//
//   node scripts/audit/military-industry-audit.mjs [yıl] [tohum,tohum] [big]

import { headless, section, table, finding, reportFindings } from './harness.mjs';
import { isConscript } from '../../src/game/units.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { isMobilized } from '../../src/game/mobilization.js';
import { EQUIPMENT_IDS } from '../../src/game/econ/defs.js';

const YEARS = Number(process.argv[2] ?? 30);
const SEEDS = (process.argv[3] ?? 'ARMY1,ARMY2,ARMY3').split(',');
const BIG = process.argv[4] === 'big';

const q = (list, p) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)];
};
const pct = (v) => `${(100 * v).toFixed(1)}%`;

section(`ASKERÎ SANAYİ DÖNGÜSÜ — ${SEEDS.length} tohum × ${YEARS} yıl${BIG ? ' (160×96)' : ''}`);

function runSeed(seed) {
  const game = headless(seed, BIG ? { cols: 160, rows: 96 } : {});
  const w = game.world;
  const acc = {
    warWeeks: 0, mobWeeks: 0, peaceIdle: [], warIdle: [], consumer: [], freePool: [],
    warMissing: 0, warMax: 0, riflesUsedWar: 0, riflesMadeWar: 0, riflesMadePeace: 0,
    lawWeeks: [0, 0, 0, 0], waitingWar: 0, nationWeeks: 0, conscriptMax: 0, byDecade: [],
    drawn: 0, icTotal: 0, armyOut: 0, output: 0,
  };
  const prevStock = new Map();
  const startNations = w.nations.filter((n) => n.alive).length;
  for (let wk = 1; wk <= YEARS * 52; wk++) {
    game.turns.endTurn();
    const live = w.nations.filter((n) => n.alive && n.economy);
    let conscripts = 0;
    for (const n of live) {
      const e = n.economy;
      const war = (e.warFronts ?? 0) > 0;
      acc.nationWeeks++;
      acc.lawWeeks[n.politics?.laws?.economy ?? 0]++;
      const mil = e.ic?.military ?? 0;
      acc.icTotal += e.ic?.total ?? 0;
      acc.drawn += EQUIPMENT_IDS.reduce((sum, id) => sum + (e.lines?.[id]?.ic ?? 0), 0);
      // Çubuktaki ordu payı (Tek Çubuk): hatların çektiği, toplam çıktıya
      // oranla — sanayi payı yasanın tavanını, bu ekonominin yükünü gösterir.
      acc.armyOut += e.alloc?.army ?? 0;
      acc.output += e.alloc?.output ?? e.ic?.output ?? 0;
      if (mil > 0.05) {
        const used = EQUIPMENT_IDS.reduce((s, id) => s + (e.lines?.[id]?.ic ?? 0), 0);
        (war ? acc.warIdle : acc.peaceIdle).push(1 - Math.min(1, used / mil));
      }
      const made = e.lines?.rifles?.output ?? 0;
      const stock = e.stock?.rifles ?? 0;
      const prev = prevStock.get(n.id) ?? stock;
      const used = Math.max(0, prev + made - stock);
      prevStock.set(n.id, stock);
      if (war) {
        acc.warWeeks++;
        if (isMobilized(n)) acc.mobWeeks++;
        acc.riflesUsedWar += used;
        acc.riflesMadeWar += made;
        acc.waitingWar += (n.training?.queue ?? []).filter((item) => Object.keys(item.missing ?? {}).length).length;
      } else acc.riflesMadePeace += made;
      if (wk % 13 === 0) {
        acc.consumer.push(e.consumer?.ratio ?? 1);
        const decade = Math.min(4, Math.floor(wk / 52 / 10));
        (acc.byDecade[decade] ??= []).push(e.consumer?.ratio ?? 1);
        const pool = nationManpower(w, n.id);
        const soldiers = e.soldiers ?? 0;
        acc.freePool.push(pool / Math.max(1, pool + soldiers));
        if (war) {
          for (const u of w.units) {
            if (u.nationId !== n.id || u.type.domain !== 'land') continue;
            for (const r of u.regiments ?? []) {
              acc.warMissing += Math.max(0, r.maxStrength - r.strength);
              acc.warMax += r.maxStrength;
            }
          }
        }
      }
    }
    for (const u of w.units) if (u.type.domain === 'land' && isConscript(u)) conscripts += u.regiments?.length ?? 1;
    acc.conscriptMax = Math.max(acc.conscriptMax, conscripts);
  }
  const types = {};
  for (const u of w.units) {
    if (u.type.domain !== 'land') continue;
    for (const r of u.regiments ?? []) types[r.typeId] = (types[r.typeId] ?? 0) + 1;
  }
  const live = w.nations.filter((n) => n.alive && n.economy);
  return {
    seed,
    nations: `${startNations}→${live.length}`,
    regiments: Object.values(types).reduce((a, b) => a + b, 0),
    armor: types.ARMOR ?? 0,
    air: types.AIRCRAFT ?? 0,
    conscriptMax: acc.conscriptMax,
    mobilized: acc.warWeeks ? acc.mobWeeks / acc.warWeeks : 0,
    freePool: q(acc.freePool, 0.5),
    warMissing: acc.warMax ? acc.warMissing / acc.warMax : 0,
    idlePeace: q(acc.peaceIdle, 0.5),
    idleWar: q(acc.warIdle, 0.5),
    usedPerWarWeek: acc.warWeeks ? acc.riflesUsedWar / acc.warWeeks : 0,
    madePerWarWeek: acc.warWeeks ? acc.riflesMadeWar / acc.warWeeks : 0,
    waitingWar: acc.warWeeks ? acc.waitingWar / acc.warWeeks : 0,
    consumer: q(acc.consumer, 0.5),
    consumerDecades: acc.byDecade.map((l) => q(l, 0.5).toFixed(2)).join(' '),
    drawnShare: acc.icTotal ? acc.drawn / acc.icTotal : 0,
    outputShare: acc.output ? acc.armyOut / acc.output : 0,
    consumerP25: q(acc.consumer, 0.25),
    lawWar: (acc.lawWeeks[2] + acc.lawWeeks[3]) / Math.max(1, acc.nationWeeks),
    lawPartial: acc.lawWeeks[1] / Math.max(1, acc.nationWeeks),
    warShare: acc.warWeeks / Math.max(1, acc.nationWeeks),
  };
}

const rows = [];
for (const seed of SEEDS) {
  const t0 = performance.now();
  const r = runSeed(seed);
  r.sec = Math.round((performance.now() - t0) / 1000);
  rows.push(r);
}
const view = rows.map((r) => ({
  seed: r.seed, ulus: r.nations, alay: r.regiments, zırh: r.armor, hava: r.air, 'kura(en çok)': r.conscriptMax,
  'seferber/savaş-hf': pct(r.mobilized), 'boş havuz': pct(r.freePool), 'savaşta eksik güç': pct(r.warMissing),
  'askerî pay halka (barış)': pct(r.idlePeace), 'askerî IC boş (savaş)': pct(r.idleWar),
  'tüfek harcanan/üretilen (savaş hf)': `${r.usedPerWarWeek.toFixed(2)}/${r.madePerWarWeek.toFixed(2)}`,
  'teçhizat bekleyen alay': r.waitingWar.toFixed(2),
  'tüketim malı ort./p25': `${r.consumer.toFixed(2)}/${r.consumerP25.toFixed(2)}`,
  'tüketim on yıllar': r.consumerDecades,
  'orduya giden IC': pct(r.drawnShare),
  'ordunun çıktı payı': pct(r.outputShare),
  'kısmi/savaş ekonomisi': `${pct(r.lawPartial)}/${pct(r.lawWar)}`,
  'savaş payı': pct(r.warShare), sn: r.sec,
}));
// Tablo dar terminalde iki parçaya bölünür: ordu, sonra sanayi.
const cut = 9;
const keys = Object.keys(view[0]);
for (const part of [keys.slice(0, cut), ['seed', ...keys.slice(cut)]]) {
  console.log(table(view, part.map((k) => ({ label: k, get: (r) => r[k] }))));
}

for (const r of rows) {
  if (r.mobilized > 0.2 && r.conscriptMax < 5) {
    finding('HIGH', 'seferberlik', 'savaşta yedek silah altına alınır', `${r.seed}: savaş haftalarının ${pct(r.mobilized)}'inde seferber ama dünyada en çok ${r.conscriptMax} kura alayı`);
  }
  // Barışta çekilmeyen askerî pay halka döner (industry.militaryDraw): boşluk
  // orada bedel değildir. Savaşta boş kalıyorsa teçhizat bağlamıyor demektir.
  if (r.idleWar > 0.5) finding('MEDIUM', 'askerî sanayi', 'savaşta hatlar askerî payı kullanır', `${r.seed}: savaşta askerî IC ${pct(r.idleWar)} boş`);
  if (r.armor + r.air === 0 && YEARS >= 20) finding('HIGH', 'zırh/hava', 'kol açılınca YZ zırh ve hava alayı kurar', `${r.seed}: ${YEARS} yılda hiç yok`);
  // Tek Çubuk'ta oran doyurma koludur (≤ 1.5); üstü, kalkınacak state
  // kalmadığı için yatırımın halka taştığını gösterir.
  if (r.consumer > 1.6) finding('MEDIUM', 'tüketim malı', 'oran doyurma kolunun çevresinde (≤ 1.5)', `${r.seed}: ortanca ${r.consumer.toFixed(2)}`);
}
reportFindings();
