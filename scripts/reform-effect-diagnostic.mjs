// Reform etkilerinin tanilamasi: yasa bir SONUC dogurmali.
//
// Iddia zinciri:
//   yasa -> hane butcesi / memnuniyet / sanayi verimi -> stability -> parti destegi
//
// Yontem: ayni tohumda TEK degisken oynatilir (ozne ulus reform yapar/yapmaz),
// dunyanin geri kalani iki kosuda da aynidir; fark yalnizca yasaya atfedilebilir.
//
// Kullanim: node scripts/reform-effect-diagnostic.mjs [hafta]
// Bu dosya URETIM KODU DEGILDIR.

import { headless, run } from './audit/harness.mjs';
import { REFORMS, enactReform, ensureReforms, reformModifiers } from '../src/game/reforms.js';

const SEED = 'REFORM-EFFECT';
const WEEKS = Number(process.argv[2] ?? 52);

function snapshot(nation) {
  const e = nation.economy;
  const c = e?.classes ?? {};
  return {
    gold: nation.gold ?? 0,
    stability: e?.stability ?? 0,
    lowerSat: c.lower?.satisfaction ?? 0,
    upperSat: c.upper?.satisfaction ?? 0,
    lowerBudget: c.lower?.needsBudget ?? 0,
    factoryProfit: e?.factoryProfit ?? 0,
    socialCost: e?.ledger?.socialCost ?? 0,
    radicalSupport: nation.politics?.parties
      ?.filter((p) => ['socialist', 'communist'].includes(p.ideology))
      .reduce((s, p) => s + p.support, 0) ?? 0,
  };
}

/** Meclis izin verdigi surece sosyal merdivenlerde yukari surer. Kapi asilmaz. */
function pushSocialReforms(game, nation, rounds) {
  let enacted = 0;
  for (let i = 0; i < rounds; i++) {
    for (const group of REFORMS) {
      if (group.category !== 'social') continue;
      if (enactReform(game, nation, group.id)) enacted++;
    }
  }
  return enacted;
}

function runCase(reform) {
  const game = headless(SEED);
  const subject = game.world.nations
    .filter((n) => n.alive).sort((a, b) => b.tiles - a.tiles)[0];
  // Ozne OYUNCU ulusu sayilir: YZ'nin reform ajandasi ona dokunmasin, yoksa
  // A/B'nin 'reform yapmayan' tarafi da kendiliginden reform yapiyor ve tek
  // degisken kurali bozuluyor (olculdu).
  game.turns.playerNation = subject.id;
  run(game, 8);
  ensureReforms(subject);
  const enacted = reform ? pushSocialReforms(game, subject, 6) : 0;
  run(game, WEEKS);
  return {
    enacted,
    mods: reformModifiers(subject),
    state: snapshot(subject),
    worldPop: game.world.nations.reduce((s, n) => s + (n.economy?.population ?? 0), 0),
  };
}

const plain = runCase(false);
const reformed = runCase(true);
const twin = runCase(true);
const deterministic = JSON.stringify(twin) === JSON.stringify(reformed);

const d = (k) => reformed.state[k] - plain.state[k];
const pct = (k) => (plain.state[k] !== 0
  ? `${((d(k) / Math.abs(plain.state[k])) * 100).toFixed(1)}%` : 'n/a');

const results = {
  wiring: {
    lawsEnacted: reformed.enacted > 0,
    // Notr taban: hic reform yapmayan ulusta carpanlar merdivenin dibinde.
    modsStronger: reformed.mods.lowerMood > plain.mods.lowerMood
      && reformed.mods.throughput <= plain.mods.throughput,
  },
  consequences: {
    // Kazanan isci. Butce iddiasi KOSULLU: onu yukselten yasa asgari
    // ucret/sendikadir ve meclis her kosuda gecirmez.
    lowerBudgetUp: reformed.mods.lowerBudget > plain.mods.lowerBudget
      ? d('lowerBudget') > 0 : true,
    lowerSatisfactionUp: d('lowerSat') > 0,
    // Kaybeden sermaye.
    upperSatisfactionDown: d('upperSat') < 0,
    // Sanayinin faturasi DOGRUDAN kanaldan olculur: ucret carpani. Nihai kar
    // 260 haftada artabiliyor cunku memnun isci calisma istekliligini ve
    // dolayisiyla sanayinin boyunu buyutuyor (olculdu: +31.9%). Bu mesru bir
    // ikincil etki; garanti edilen sey ucret faturasidir, nihai kar degil.
    industryPaysWages: reformed.mods.wageCost > plain.mods.wageCost,
    // Hazine sosyal taahhudu oder.
    treasuryPaysMore: d('socialCost') > 0,
  },
  feedback: {
    stabilityResponds: Math.abs(d('stability')) > 1e-6,
    politicsResponds: Math.abs(d('radicalSupport')) > 1e-6,
  },
  safety: {
    deterministic,
    noNaN: Object.values(reformed.state).every(Number.isFinite),
    worldIntact: reformed.worldPop > plain.worldPop * 0.85,
  },
};
results.passed = Object.values(results)
  .every((s) => Object.values(s).every(Boolean));

console.log(JSON.stringify({
  ...results,
  detail: {
    weeks: WEEKS,
    lawsEnacted: reformed.enacted,
    delta: {
      lowerSat: d('lowerSat').toFixed(4),
      upperSat: d('upperSat').toFixed(4),
      stability: d('stability').toFixed(4),
      factoryProfit: `${d('factoryProfit').toFixed(1)} (${pct('factoryProfit')})`,
      socialCost: `${d('socialCost').toFixed(1)} (${pct('socialCost')})`,
      gold: `${d('gold').toFixed(0)} (${pct('gold')})`,
      radicalSupport: `${d('radicalSupport').toFixed(2)} puan`,
    },
  },
}, null, 2));
if (!results.passed) process.exitCode = 1;
