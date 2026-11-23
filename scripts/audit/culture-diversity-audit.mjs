// KÜLTÜR ÇEŞİTLİLİĞİ DENETİMİ — harita boyu büyüdükçe halklar da çoğalıyor mu?
//
// 2026-11-23, Kerem: "büyük maplerde kültür mapi aşırı az kültürle doğuyor,
// tek kültür onlarca ülkeyi içine alıyor, karmaşıklık ve etnik kaos yok".
// Kültür tohumu makro bölge başına sabit sayıdaydı (macro.ZONE_CULTURES):
// ulus sayısı alanla büyürken halk sayısı yerinde kalıyordu. Bu cetvel aynı
// tanımla her boyu ölçer ki önce/sonra yan yana konsun.
//
// Yalnız DÜNYA ÜRETİMİNİ ölçer (tur koşmaz). Ağırlık nüfustur
// (TurnManager.start'ın kurduğu province.econ.population), nüfus yoksa hex.
//
//   node scripts/audit/culture-diversity-audit.mjs [--sizes 100,160,240,earth,240n200]
//        [--seeds STAT1,STAT2,BORDER1] [--json dosya]
//
// Tanımlar (state = province kümesi; oyuncu ona "state" der):
//   kültür           world.cultures (uyuyan isyancı yuvaları ulus sayılmaz)
//   ulus/kültür      bir halkın ANA HALK olduğu düzenli ulus sayısı (ort., en çok)
//   yayılım          bir halkın ÇOĞUNLUK olduğu state'leri tutan ulus sayısı
//                    (ort., en çok) — "tek kültür onlarca ülke" bunun ucudur
//   en büyük pay     bir halkın kara payı (hex × satır payı) / bütün kara
//   çok halklı       en büyük halkı nüfusun %85'inin altında kalan ulus payı
//   halk/ulus        nüfusun ≥ %5'ini tutan halk sayısı, ulus ortalaması
//   azınlık          state içinde çoğunluk dışı nüfus payı (nüfus ağırlıklı)
//   karışık state    azınlığı ≥ %15 olan state payı
//   yama             state'in kendisi + komşularında ≥ 3 ayrı çoğunluk halkı
//   diaspora         ≥ %5 satırın halkı hiçbir komşu state'te çoğunluk değil
//                    (kopuk cep: ada azınlığı, şehir diasporası)
//   ad yedeği        "Culture-N" yedek adı (ad üreteci tükendi) + çift ad

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { headless, section, table, n1, n2, pct, mean, quantile, runWorkers } from './harness.mjs';
import { worldRows } from '../../src/world/worldgen.js';

const SELF = fileURLToPath(import.meta.url);
const isRebel = (nation) => nation?.archetype === 'rebel';
const rowsOf = (p) => (p.cultures?.length ? p.cultures : (p.culture >= 0 ? [{ id: p.culture, share: 1 }] : []));

/** Boy: "160", "earth", ya da ulus kaydıracıyla "240n200" (240 sütun, 200 ulus). */
function sizeOptions(size) {
  const [base, total] = String(size).split('n');
  const out = base === 'earth' ? { map: 'earth' } : { cols: Number(base), rows: worldRows(Number(base)) };
  if (total) out.nationTotal = Number(total);
  return out;
}

export function measure(world) {
  const provinces = world.provinces;
  const cultures = world.cultures;
  const regular = world.nations.filter((n) => !isRebel(n) && provinces.some((p) => p.owner === n.id));
  const weight = (p) => Math.max(0, p.econ?.population ?? p.tileIdx.length);
  let landHexes = 0;
  for (const p of provinces) landHexes += p.tileIdx.length;

  // Halk başına: kara payı, ana halk olduğu uluslar, çoğunluk olduğu ulus kümesi.
  const presence = new Array(cultures.length).fill(0);
  const spans = cultures.map(() => new Set());
  for (const p of provinces) {
    for (const row of rowsOf(p)) presence[row.id] += p.tileIdx.length * row.share;
    if (p.culture >= 0 && p.owner >= 0 && !isRebel(world.nations[p.owner])) spans[p.culture].add(p.owner);
  }
  const primaryOf = new Map();
  for (const n of regular) if (n.culture >= 0) primaryOf.set(n.culture, (primaryOf.get(n.culture) ?? 0) + 1);
  const primaryCounts = [...primaryOf.values()];
  const spanCounts = spans.map((s) => s.size).filter((v) => v > 0);
  const living = presence.filter((v) => v > 0.5).length;

  // Ulus başına bileşim.
  const nationRows = regular.map((n) => {
    const mix = new Map();
    let total = 0;
    for (const p of provinces) {
      if (p.owner !== n.id) continue;
      const w = weight(p);
      total += w;
      for (const row of rowsOf(p)) mix.set(row.id, (mix.get(row.id) ?? 0) + w * row.share);
    }
    const shares = [...mix.values()].map((v) => v / Math.max(1e-9, total)).sort((a, b) => b - a);
    const simpson = shares.reduce((s, v) => s + v * v, 0);
    return {
      largest: shares[0] ?? 0,
      peoples5: shares.filter((v) => v >= 0.05).length,
      enc: simpson > 0 ? 1 / simpson : 0,
      archetype: n.archetype,
    };
  });

  // State düzeyi: azınlık, karışık state, yama, diaspora.
  let pop = 0;
  let minorityPop = 0;
  let mixed = 0;
  let patch = 0;
  let diaspora = 0;
  let owned = 0;
  for (const p of provinces) {
    if (p.culture < 0) continue;
    const rows = rowsOf(p);
    const w = weight(p);
    pop += w;
    minorityPop += w * (1 - (rows[0]?.share ?? 1));
    owned++;
    if ((rows[1]?.share ?? 0) >= 0.15) mixed++;
    const around = new Set([p.culture]);
    for (const i of p.neighbors) if (provinces[i]?.culture >= 0) around.add(provinces[i].culture);
    if (around.size >= 3) patch++;
    if (rows.slice(1).some((row) => row.share >= 0.05 && !around.has(row.id))) diaspora++;
  }

  const names = cultures.map((c) => c.name);
  return {
    cols: world.cols,
    rows: world.rows,
    landHexes,
    provinces: provinces.length,
    nations: regular.length,
    nationsTotal: world.nations.length,
    cultures: cultures.length,
    living,
    families: new Set(cultures.map((c) => c.family)).size,
    hexPerCulture: landHexes / Math.max(1, living),
    hexPerNation: landHexes / Math.max(1, regular.length),
    primaryMean: mean(primaryCounts),
    primaryMax: Math.max(0, ...primaryCounts),
    spanMean: mean(spanCounts),
    spanP90: quantile(spanCounts, 0.9),
    spanMax: Math.max(0, ...spanCounts),
    largestShare: Math.max(0, ...presence) / Math.max(1, landHexes),
    multiEthnic: nationRows.filter((r) => r.largest < 0.85).length / Math.max(1, nationRows.length),
    peoplesPerNation: mean(nationRows.map((r) => r.peoples5)),
    encMean: mean(nationRows.map((r) => r.enc)),
    encEmpire: Math.max(0, ...nationRows.filter((r) => ['kuzey-imparatorlugu', 'bilesik-monarsi', 'kavsak-imparatorlugu', 'dogu-devi'].includes(r.archetype)).map((r) => r.enc)),
    minority: minorityPop / Math.max(1e-9, pop),
    mixedStates: mixed / Math.max(1, owned),
    patch: patch / Math.max(1, owned),
    diaspora: diaspora / Math.max(1, owned),
    // Kaynak dökümü (cultureGen 2 karnesi; eski üreteçte boş).
    beltPeoples: (world.cultureMosaic?.belts ?? []).reduce((sum, b) => sum + b.peoples.length, 0),
    diasporaPeoples: (world.cultureMosaic?.diaspora ?? []).length,
    islandMinorities: (world.cultureMosaic?.islands ?? []).length,
    sisterPeoples: (world.mosaicPeoples?.kin ?? []).reduce((sum, k) => sum + k.peoples.length - 1, 0),
    subjectPeoples: (world.subjectPeoples ?? []).reduce((sum, x) => sum + x.peoples.filter((m) => !m.kept).length, 0),
    pockets: (world.mosaicPeoples?.pockets ?? []).length,
    fallbackNames: names.filter((n) => /^Culture-/.test(n)).length,
    duplicateNames: names.length - new Set(names).size,
  };
}

if (process.argv[2] === '--worker') {
  const [, seed, size] = process.argv.slice(2);
  const t0 = Date.now();
  const game = headless(seed, sizeOptions(size));
  const out = { seed, size, ms: Date.now() - t0, ...measure(game.world) };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const SIZES = opt('--sizes', '100,160,240,earth').split(',');
const SEEDS = opt('--seeds', 'STAT1,STAT2,BORDER1').split(',');
const JSON_OUT = opt('--json', null);

section(`KÜLTÜR ÇEŞİTLİLİĞİ — ${SIZES.join(', ')} × ${SEEDS.join(', ')}`);
const jobs = [];
for (const size of SIZES) for (const seed of SEEDS) jobs.push(['--worker', seed, size]);
const results = await runWorkers(SELF, jobs, { concurrency: Number(process.env.AUDIT_JOBS ?? 2) });

/** Düz nesne satırları: ilk iki sütun (boy, tohum) sola yaslı. */
const show = (rows, keys) => console.log(table(rows, keys.map((k, i) => ({
  label: k, get: (r) => r[k], right: i > 1 || !['boy', 'tohum'].includes(k),
}))));
const label = (r) => {
  const [base, total] = String(r.size).split('n');
  return (base === 'earth' ? 'earth' : `${r.cols}x${r.rows}`) + (total ? ` n${total}` : '');
};
show(results.map((r) => ({
  boy: label(r), tohum: r.seed, kara: r.landHexes, state: r.provinces, ulus: r.nations, toplam: r.nationsTotal,
  kultur: r.cultures, aile: r.families, 'hex/kultur': Math.round(r.hexPerCulture), 'hex/ulus': Math.round(r.hexPerNation),
  ms: r.ms,
})), ['boy', 'tohum', 'kara', 'state', 'ulus', 'toplam', 'kultur', 'aile', 'hex/kultur', 'hex/ulus', 'ms']);
show(results.map((r) => ({
  boy: label(r), tohum: r.seed,
  'ana ort': n2(r.primaryMean), 'ana max': r.primaryMax,
  'yay ort': n2(r.spanMean), 'yay p90': r.spanP90, 'yay max': r.spanMax,
  'en buyuk': pct(r.largestShare), 'cok halkli': pct(r.multiEthnic),
  'halk/ulus': n2(r.peoplesPerNation), ENC: n2(r.encMean), 'ENC imp': n2(r.encEmpire),
})), ['boy', 'tohum', 'ana ort', 'ana max', 'yay ort', 'yay p90', 'yay max', 'en buyuk', 'cok halkli', 'halk/ulus', 'ENC', 'ENC imp']);
show(results.map((r) => ({
  boy: label(r), tohum: r.seed, azinlik: pct(r.minority), 'karisik st': pct(r.mixedStates),
  yama: pct(r.patch), diaspora: pct(r.diaspora), yedek: r.fallbackNames, cift: r.duplicateNames,
  tebaa: r.subjectPeoples, kusak: r.beltPeoples, kardes: r.sisterPeoples, 'dias halk': r.diasporaPeoples,
  ada: r.islandMinorities, cep: r.pockets,
})), ['boy', 'tohum', 'azinlik', 'karisik st', 'yama', 'diaspora', 'yedek', 'cift', 'tebaa', 'kusak', 'kardes', 'dias halk', 'ada', 'cep']);

// Boy başına ortalama: önce/sonra kıyası bu satırlardan okunur.
const bySize = new Map();
for (const r of results) {
  const key = label(r);
  if (!bySize.has(key)) bySize.set(key, []);
  bySize.get(key).push(r);
}
const avg = (list, k) => mean(list.map((r) => r[k]));
section('BOY ORTALAMASI');
show([...bySize].map(([boy, list]) => ({
  boy,
  kultur: n1(avg(list, 'cultures')),
  ulus: n1(avg(list, 'nations')),
  toplam: n1(avg(list, 'nationsTotal')),
  'ana ort': n2(avg(list, 'primaryMean')),
  'ana max': n1(avg(list, 'primaryMax')),
  'yay ort': n2(avg(list, 'spanMean')),
  'yay max': n1(avg(list, 'spanMax')),
  'en buyuk': pct(avg(list, 'largestShare')),
  'cok halkli': pct(avg(list, 'multiEthnic')),
  'halk/ulus': n2(avg(list, 'peoplesPerNation')),
  azinlik: pct(avg(list, 'minority')),
  yama: pct(avg(list, 'patch')),
  diaspora: pct(avg(list, 'diaspora')),
  yedek: n1(avg(list, 'fallbackNames')),
})), ['boy', 'kultur', 'ulus', 'toplam', 'ana ort', 'ana max', 'yay ort', 'yay max', 'en buyuk', 'cok halkli', 'halk/ulus', 'azinlik', 'yama', 'diaspora', 'yedek']);

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
