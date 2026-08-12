// UZUN KOSU DUNYA TESTLERI
//
// 10 tohum x 260 hafta, 5 tohum x 520 hafta, 2 tohum x 1040 hafta.
// Aranan sey tekil hata degil, SISTEMIK patoloji: butun uluslarin batmasi,
// fiyatlarin patlamasi/cokmesi, sanayinin durmasi, nufusun cokmesi.

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct,
} from './harness.mjs';
import { GOODS, GOOD_IDS } from '../../src/game/economy.js';

const PLANS = [
  { weeks: 260, seeds: ['lr-1', 'lr-2', 'lr-3', 'lr-4', 'lr-5', 'lr-6', 'lr-7', 'lr-8', 'lr-9', 'lr-10'] },
  { weeks: 520, seeds: ['lr-1', 'lr-2', 'lr-3', 'lr-4', 'lr-5'] },
  { weeks: 1040, seeds: ['lr-1', 'lr-2'] },
];

section('UZUN KOSU DUNYA TESTLERI');

const summary = [];

for (const plan of PLANS) {
  sub(`${plan.seeds.length} tohum x ${plan.weeks} hafta`);
  const rows = [];
  for (const seed of plan.seeds) {
    const r = runScenario({
      seed, warmup: 0, weeks: plan.weeks, asPlayer: false,
      measure: ['nations', 'market', 'invariants'], watchInvariants: true,
    });
    const nations = r.nations;
    const goods = Object.entries(r.market);
    const ceiling = goods.filter(([, g]) => g.atCeiling);
    const floor = goods.filter(([, g]) => g.atFloor);
    const priceIndex = goods.reduce((s, [, g]) => s + g.ratio, 0) / goods.length;
    const row = {
      seed,
      weeks: plan.weeks,
      alive: nations.length,
      population: nations.reduce((s, n) => s + n.population, 0),
      gold: nations.reduce((s, n) => s + n.gold, 0),
      debt: nations.reduce((s, n) => s + n.debt, 0),
      bankrupt: nations.filter((n) => n.gold < -50).length,
      factories: nations.reduce((s, n) => s + n.factories, 0),
      levels: nations.reduce((s, n) => s + n.factoryLevels, 0),
      fill: nations.reduce((s, n) => s + n.fill, 0) / Math.max(1, nations.length),
      regiments: nations.reduce((s, n) => s + n.regiments, 0),
      wars: nations.filter((n) => n.atWar).length,
      stability: nations.reduce((s, n) => s + n.stability, 0) / Math.max(1, nations.length),
      needs: r.cohorts.needsFulfilled,
      ceiling: ceiling.length,
      floor: floor.length,
      priceIndex,
      dead: goods.filter(([, g]) => g.supply < 1e-6 && g.demand < 1e-6).length,
      starved: goods.filter(([, g]) => g.demand > 0.5 && g.supply < 1e-6).length,
      violations: r.violations.length,
    };
    rows.push(row);
    summary.push(row);
  }
  console.log(table(rows, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'canliUlke', get: (r) => r.alive },
    { label: 'dunyaNufusu', get: (r) => n0(r.population) },
    { label: 'toplamHazine', get: (r) => n0(r.gold) },
    { label: 'toplamBorc', get: (r) => n0(r.debt) },
    { label: 'batik', get: (r) => r.bankrupt },
    { label: 'tesis', get: (r) => r.factories },
    { label: 'seviye', get: (r) => r.levels },
    { label: 'ortDoluluk', get: (r) => pct(r.fill) },
    { label: 'alay', get: (r) => r.regiments },
    { label: 'savasan', get: (r) => r.wars },
    { label: 'ortIstikrar', get: (r) => n2(r.stability) },
    { label: 'ihtiyac', get: (r) => pct(r.needs) },
    { label: 'tavandaMal', get: (r) => r.ceiling },
    { label: 'tabandaMal', get: (r) => r.floor },
    { label: 'oluMal', get: (r) => r.dead },
    { label: 'arzsizMal', get: (r) => r.starved },
    { label: 'fiyatEndeksi', get: (r) => n2(r.priceIndex) },
    { label: 'ihlal', get: (r) => r.violations },
  ]));
}

section('SISTEMIK PATOLOJI TARAMASI');

const at = (weeks) => summary.filter((r) => r.weeks === weeks);

// 1) Sayisal saglik
{
  const bad = summary.filter((r) => r.violations > 0);
  console.log(`  degismez ihlali olan kosu: ${bad.length}/${summary.length}`);
  if (bad.length) {
    finding('CRITICAL', 'Uzun kosuda degismez ihlali',
      'hicbir kosuda NaN/negatif/imkansiz deger olmamali',
      `${bad.length} kosu ihlal uretti`, bad.map((r) => `${r.seed}@${r.weeks}`).join(', '));
  } else {
    console.log('  OK  1040 haftaya kadar hicbir kosuda sayisal bozulma yok.');
  }
}

// 2) Toplu iflas / toplu zenginlik
{
  for (const weeks of [260, 520, 1040]) {
    const rows = at(weeks);
    if (!rows.length) continue;
    const bankruptShare = rows.reduce((s, r) => s + r.bankrupt / r.alive, 0) / rows.length;
    const avgGold = rows.reduce((s, r) => s + r.gold / r.alive, 0) / rows.length;
    const avgDebt = rows.reduce((s, r) => s + r.debt / r.alive, 0) / rows.length;
    console.log(`  ${weeks} hafta: batik ulke orani ${pct(bankruptShare)}`
      + ` · ulke basina ortalama hazine ${n0(avgGold)} · borc ${n0(avgDebt)}`);
  }
  const share = (weeks) => {
    const rows = at(weeks);
    return rows.length ? rows.reduce((s, r) => s + r.bankrupt / r.alive, 0) / rows.length : 0;
  };
  const avgGold = (weeks) => {
    const rows = at(weeks);
    return rows.length ? rows.reduce((s, r) => s + r.gold / r.alive, 0) / rows.length : 0;
  };
  if (share(1040) > 0.2 || (avgGold(1040) < 0 && avgGold(260) > 0)) {
    finding('HIGH', 'Gec oyunda kademeli mali cokus',
      'yuzyilin ikinci yarisinda ekonomiler ayakta kalabilmeli',
      `batik ulke orani 260h ${pct(share(260))} -> 520h ${pct(share(520))} -> 1040h ${pct(share(1040))};`
      + ` ulke basina ortalama hazine ${n0(avgGold(260))} -> ${n0(avgGold(520))} -> ${n0(avgGold(1040))}`,
      'hazinenin tabani yok (bkz. debt-audit): borclanma kapasitesi dolunca acik'
      + ' sonsuza kadar negatif hazinede birikir ve geri donusu yoktur');
  }
}

// 3) Fiyat bandi doygunlugu
{
  for (const weeks of [260, 520, 1040]) {
    const rows = at(weeks);
    if (!rows.length) continue;
    const ceil = rows.reduce((s, r) => s + r.ceiling, 0) / rows.length;
    const floor = rows.reduce((s, r) => s + r.floor, 0) / rows.length;
    const dead = rows.reduce((s, r) => s + r.dead, 0) / rows.length;
    const starved = rows.reduce((s, r) => s + r.starved, 0) / rows.length;
    console.log(`  ${weeks} hafta: ortalama ${n1(ceil)} mal tavanda, ${n1(floor)} mal tabanda,`
      + ` ${n1(dead)} mal tamamen olu, ${n1(starved)} mal talebi var arzi yok (${GOOD_IDS.length} maldan)`);
  }
  const worst = summary.reduce((m, r) => Math.max(m, (r.ceiling + r.floor) / GOOD_IDS.length), 0);
  if (worst > 0.4) {
    finding('HIGH', 'Piyasa fiyat bandinda kilitleniyor',
      'fiyatlar arz/talebe gore serbestce hareket etmeli',
      `en kotu kosuda mallarin ${pct(worst)}'i fiyat sinirinda cakili`,
      'hammadde arzi talebin kat kat uzerinde (taban), islenmis mal arzi talebin'
      + ' cok altinda (tavan): uretim zincirinin orta katmani hic kurulmuyor');
  }
}

// 4) Sanayi buyumesi / durgunluk
{
  const a = at(260);
  const b = at(520);
  const c = at(1040);
  const avgLevels = (rows) => rows.reduce((s, r) => s + r.levels, 0) / Math.max(1, rows.length);
  console.log(`  toplam sanayi seviyesi: 260h ${n1(avgLevels(a))} · 520h ${n1(avgLevels(b))}`
    + ` · 1040h ${n1(avgLevels(c))}`);
  if (c.length && avgLevels(c) > avgLevels(b) * 3) {
    finding('MEDIUM', 'Sanayi ustel buyuyor', 'buyume bir tavana oturmali',
      `520 -> 1040 hafta arasinda sanayi ${n1(avgLevels(c) / Math.max(1, avgLevels(b)))} katina cikti`, '');
  }
  if (c.length && avgLevels(c) < avgLevels(b) * 1.05) {
    finding('MEDIUM', 'Gec oyunda sanayi duruyor',
      'yuzyilin ikinci yarisinda da sanayilesme surmeli',
      `520h ${n1(avgLevels(b))} seviye -> 1040h ${n1(avgLevels(c))} seviye`,
      'isgucu tavani (MAX_WORKER_SHARE 0.4 ve MONTHLY_HIRE_RATE) buyumeyi kesiyor olabilir');
  }
}

// 5) Nufus egrisi
{
  const avgPop = (rows) => rows.reduce((s, r) => s + r.population, 0) / Math.max(1, rows.length);
  const a = avgPop(at(260));
  const b = avgPop(at(520));
  const c = avgPop(at(1040));
  console.log(`  dunya nufusu: 260h ${n0(a)} · 520h ${n0(b)} · 1040h ${n0(c)}`);
  if (c && c < a * 0.9) {
    finding('HIGH', 'Uzun kosuda dunya nufusu cokuyor',
      'baris/savas dengesinde nufus artmali', `260h ${n0(a)} -> 1040h ${n0(c)}`, '');
  }
  if (c && c > a * 8) {
    finding('MEDIUM', 'Nufus patlamasi', 'yuzyilda ~2 kat hedefleniyor',
      `260h ${n0(a)} -> 1040h ${n0(c)} (${n1(c / a)}x)`, '');
  }
}

// 6) Savas / baris dengesi
{
  const warShare = (rows) => rows.reduce((s, r) => s + r.wars / r.alive, 0) / Math.max(1, rows.length);
  console.log(`  savasan ulke orani: 260h ${pct(warShare(at(260)))}`
    + ` · 520h ${pct(warShare(at(520)))} · 1040h ${pct(warShare(at(1040)))}`);
  const all = warShare(summary);
  if (all < 0.02) {
    finding('MEDIUM', 'Dunyada savas yok', 'yuzyil boyunca savas olmali', `${pct(all)}`, '');
  }
  if (all > 0.85) {
    finding('MEDIUM', 'Dunya kalici savas halinde', 'baris donemleri olmali', `${pct(all)}`, '');
  }
}

// 7) Ulke sayisi / eleme
{
  console.log(`  canli ulke sayisi: 260h ${at(260).map((r) => r.alive).join(',')}`
    + ` · 520h ${at(520).map((r) => r.alive).join(',')}`
    + ` · 1040h ${at(1040).map((r) => r.alive).join(',')}`);
  const late = at(1040);
  if (late.length && late.every((r) => r.alive >= 14)) {
    finding('LOW', 'Harita hic konsolide olmuyor',
      '1040 haftada bazi ulkeler elenmeli (hegemonya yarisi anlamli olsun)',
      `1040. haftada canli ulke sayisi ${late.map((r) => r.alive).join(', ')} (baslangic 15)`,
      'YZ savaslari toprak degistirmiyor: barisa varan savaslar isgali iade ediyor');
  }
}

// 8) Doluluk / issizlik
{
  for (const weeks of [260, 520, 1040]) {
    const rows = at(weeks);
    if (!rows.length) continue;
    console.log(`  ${weeks} hafta: ortalama sanayi dolulugu`
      + ` ${pct(rows.reduce((s, r) => s + r.fill, 0) / rows.length)}`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
