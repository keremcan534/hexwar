// Stratejik baski denetimi — Open Beta 3'un bes bulgusunu sabitler.
//
// Beta 3 (commit 1ac35c7, 64 yillik kor kampanya) sunu olctu: savasin SONUCU
// onarilmisti ama savasin KENDISI ve sonrasindaki diplomatik bedel yoktu.
//
//   * 25 oyuncu savasinin ortalamasi 11,4 hafta / 4 muharebe.
//   * Ayni kurbana yilda bir saldirmak serbest (bir cift 14 kez savasti).
//   * 40 yilda ~48 kume ilhak eden oyuncunun sohreti hic 6,5'i gecmedi
//     (koalisyon esigi 22) — sohret yalniz ISGAL sirasinda birikiyordu ve
//     savaslar kisa oldugu icin hic birikmiyordu.
//   * 23.400 komsu-degerlendirmesinde olculdu: ai.js "zaten savasan ulkeye
//     cullanilmaz" kuralini HEDEFE uyguladigi icin surekli savasan bir ulke
//     surekli dokunulmaz oluyordu.
//
// Bu denetim o bes maddenin her birini ayri bir teste baglar ve ayni zamanda
// eski hatanin (savas toprak uretemiyor) geri gelmedigini dogrular.

import {
  headless, section, sub, table, n1, pct, finding, reportFindings,
} from './harness.mjs';
import { atWar, declareWar, truceLeft } from '../../src/game/diplomacy.js';
import * as infamyModule from '../../src/game/infamy.js';
import { INFAMY_COALITION, decayInfamy } from '../../src/game/infamy.js';

// ONCE/SONRA olcumu ayni dosyayla yapilabilsin diye savunmali: onarim oncesi
// kodda `annexInfamy` yoktur ve ilhak sifir sohret uretir — testin olcmesi
// gereken sey zaten tam olarak budur.
const annexInfamy = infamyModule.annexInfamy ?? (() => {});
import { provinceWarCost } from '../../src/game/peace.js';

const YEARS = Number(process.argv[2] ?? 50);
const SEEDS = (process.argv[3] ?? 'WP1,WP2,WP3').split(',');

section(`STRATEJIK BASKI DENETIMI — ${YEARS} yil × ${SEEDS.length} tohum`);

/** Tek tohumun tam kosusu; butun olcumler ayni gezintiden cikar. */
function runSeed(seed) {
  const game = headless(seed);
  const world = game.world;
  const n = world.nations.length;
  const startOwners = world.provinces.map((p) => p.owner);

  const open = new Map();          // "a:b" -> baslangic turu
  const wars = [];                 // { a, b, start, end, weeks, secondFront }
  const lastWarEnd = new Map();    // "a:b" -> son baris turu
  const repeatGaps = [];           // ayni cifte iki savas arasi hafta
  const pairCount = new Map();
  let maxSimultaneous = 0;         // bir ulusa ayni anda kac saldirgan
  let dogpiled3 = 0;               // uc ve daha fazla saldirgan gorulme sayisi
  let secondFronts = 0;
  const infamyPeak = new Float64Array(n);
  let thresholdNationWeeks = 0;
  const annexed = new Int32Array(n);

  for (let week = 0; week < YEARS * 52; week++) {
    game.turns.endTurn();
    const turn = game.turns.turn;

    // --- savas acilis/kapanis takibi ---
    const attackersOn = new Int32Array(n);
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const key = `${a}:${b}`;
        // CANLI ULKE SARTI. Yoksa elenen ulusun eski savas kaydi cullanma
        // sayimini sisiriyordu: tohum WP3'te tavan 6 olculuyor ama canli
        // filtreyle 3 cikiyordu — yani `MAX_ATTACKERS_ON_TARGET` hic
        // delinmemisti, denetim olmeyen bir seyi sayiyordu. (Kaynaktaki
        // bayat durum da ayrica temizlendi: turn.js checkElimination.)
        const now = world.nations[a].alive && world.nations[b].alive
          && atWar(world, a, b);
        if (now) { attackersOn[a]++; attackersOn[b]++; }
        if (now && !open.has(key)) {
          // Ikinci cephe mi: taraflardan biri BASKA bir ulusla zaten savasta
          // miydi? Sorgu dogrudan yapilir; `attackersOn` bu noktada yalniz
          // kismen doludur ve dongu sirasina bagli yanlis cevap verir.
          const otherWars = (x) => world.nations.filter(
            (t) => t.alive && t.id !== x && t.id !== (x === a ? b : a) && atWar(world, x, t.id),
          ).length;
          const busyBefore = otherWars(a) > 0 || otherWars(b) > 0;
          open.set(key, { start: turn, secondFront: busyBefore });
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
          if (busyBefore) secondFronts++;
          if (lastWarEnd.has(key)) repeatGaps.push(turn - lastWarEnd.get(key));
        } else if (!now && open.has(key)) {
          const rec = open.get(key);
          wars.push({ a, b, weeks: turn - rec.start, secondFront: rec.secondFront });
          open.delete(key);
          lastWarEnd.set(key, turn);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (attackersOn[i] > maxSimultaneous) maxSimultaneous = attackersOn[i];
      if (attackersOn[i] >= 3) dogpiled3++;
    }

    // --- sohret takibi ---
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const inf = nation.infamy ?? 0;
      if (inf > infamyPeak[nation.id]) infamyPeak[nation.id] = inf;
      if (inf >= INFAMY_COALITION) thresholdNationWeeks++;
    }
  }

  // Hala suren savaslar da sayilsin (alt sinir olarak).
  for (const [key, rec] of open) {
    const [a, b] = key.split(':').map(Number);
    wars.push({ a, b, weeks: game.turns.turn - rec.start, secondFront: rec.secondFront, openEnded: true });
  }

  let changed = 0;
  const gainers = new Set();
  for (let i = 0; i < startOwners.length; i++) {
    const owner = world.provinces[i].owner;
    if (owner === startOwners[i]) continue;
    changed++;
    if (owner >= 0) { gainers.add(owner); annexed[owner]++; }
  }

  // Kapanan savaslar ile hic kapanmayanlar ayri olculur: donmus bir cephe
  // "uzun savas" degildir, ayri bir hastaliktir ve ortalamayi zehirler
  // (olculdu: ortalama 224 hafta, ortanca 10).
  const closed = wars.filter((w) => !w.openEnded).map((w) => w.weeks).sort((x, y) => x - y);
  const median = closed.length ? closed[Math.floor(closed.length / 2)] : 0;
  const mean = closed.length ? closed.reduce((s, v) => s + v, 0) / closed.length : 0;
  const sortedGaps = [...repeatGaps].sort((x, y) => x - y);
  const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
  const quickRepeats = repeatGaps.filter((v) => v < 80).length;
  const repeats = [...pairCount.values()];

  return {
    seed,
    wars: wars.length,
    closedWars: closed.length,
    frozenWars: wars.filter((w) => w.openEnded).length,
    meanWeeks: mean,
    medianWeeks: median,
    maxWeeks: closed.length ? closed[closed.length - 1] : 0,
    shortWars: closed.filter((v) => v < 16).length,
    medianGap,
    quickRepeats,
    secondFronts,
    maxSimultaneous,
    dogpiled3,
    repeatPairs4: repeats.filter((v) => v >= 4).length,
    maxRepeats: repeats.length ? Math.max(...repeats) : 0,
    meanRepeatGap: repeatGaps.length
      ? repeatGaps.reduce((s, v) => s + v, 0) / repeatGaps.length : 0,
    infamyWorldPeak: Math.max(...infamyPeak),
    infamyOver: [...infamyPeak].filter((v) => v >= INFAMY_COALITION).length,
    thresholdNationWeeks,
    changed,
    provinces: startOwners.length,
    gainers: gainers.size,
    topAnnexer: Math.max(...annexed),
    topAnnexerInfamyPeak: infamyPeak[[...annexed].indexOf(Math.max(...annexed))],
    alive: world.nations.filter((x) => x.alive).length,
    aliveStart: n,
  };
}

const rows = SEEDS.map(runSeed);

sub('KOSU SONUCLARI');
console.log(table(rows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'savas', get: (r) => r.wars },
  { label: 'kapanan', get: (r) => r.closedWars },
  { label: 'donmus', get: (r) => r.frozenWars },
  { label: 'ORTANCA hafta', get: (r) => r.medianWeeks },
  { label: '<16 hafta', get: (r) => pct(r.shortWars / Math.max(1, r.closedWars)) },
  { label: '2.cephe', get: (r) => r.secondFronts },
  { label: 'azami esz.saldirgan', get: (r) => r.maxSimultaneous },
  { label: '4+ savasan cift', get: (r) => r.repeatPairs4 },
  { label: 'hizli tekrar(<80h)', get: (r) => r.quickRepeats },
  { label: 'ortanca bosluk', get: (r) => r.medianGap },
]));
console.log(table(rows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'zirve sohret', get: (r) => n1(r.infamyWorldPeak) },
  { label: 'esigi gecen ulke', get: (r) => r.infamyOver },
  { label: 'esik ulke-hafta', get: (r) => r.thresholdNationWeeks },
  { label: 'en cok ilhak', get: (r) => r.topAnnexer },
  { label: 'onun zirve sohreti', get: (r) => n1(r.topAnnexerInfamyPeak) },
  { label: 'degisen kume', get: (r) => `${r.changed}/${r.provinces}` },
  { label: 'kazanan ulke', get: (r) => r.gainers },
  { label: 'ulke', get: (r) => `${r.aliveStart}->${r.alive}` },
]));

const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;

// --- TEST 1: ilhak sohret uretiyor mu? (dogrudan, simulasyonsuz) ---
sub('TEST 1 — ilhak sohreti (annexInfamy) gercekten calisiyor mu?');
{
  const game = headless('WP-ANNEX');
  const world = game.world;
  for (let i = 0; i < 40; i++) game.turns.endTurn();
  const taker = world.nations.find((x) => x.alive && x.tiles > 10);
  const victim = world.nations.find((x) => x.alive && x.id !== taker.id && x.tiles > 10);
  const spoils = world.provinces.filter((p) => p.owner === victim.id && p.econ).slice(0, 3);
  taker.infamy = 0;
  annexInfamy(world, taker, spoils);
  const gained = taker.infamy ?? 0;
  const detail = spoils.map((p) => `${p.tileIdx.length} kare/${provinceWarCost(world, p)} bedel`).join(' · ');
  console.log(`  3 kume ilhak edildi (${detail})`);
  console.log(`  sohret 0 -> ${n1(gained)} (koalisyon esigi ${INFAMY_COALITION})`);
  if (gained < 8) {
    finding('CRITICAL', 'ilhak sohreti',
      'uc kume ilhak etmek anlamli sohret uretmeli',
      `yalniz ${n1(gained)} puan`,
      'Beta 3 bulgusu I-1: sohret yalniz isgalde birikiyordu, ilhak bedavaydi');
  } else if (gained > INFAMY_COALITION * 2.5) {
    finding('HIGH', 'ilhak sohreti asiri',
      'tek bir baris butun dunyayi ustune cekmemeli',
      `${n1(gained)} puan, esik ${INFAMY_COALITION}`);
  } else {
    console.log('  -> Ilhak kalici sohret uretiyor. DOGRU.');
  }
  // Azalma: bedel kalici olmali ama sonsuz degil.
  let weeks = 0;
  while ((taker.infamy ?? 0) > gained / 2 && weeks < 520) { decayInfamy(world); weeks++; }
  console.log(`  yarilanma suresi: ${weeks} hafta`);
  if (weeks < 20) {
    finding('MEDIUM', 'sohret azalmasi',
      'ilhak bedeli birkac hafta icinde silinmemeli', `yarilanma ${weeks} hafta`);
  }
}

// --- TEST 2: saldirgan genisleme diplomatik olarak tehlikeli hale geliyor mu? ---
sub('TEST 2 — en cok ilhak eden ulke diplomatik olarak tehlikeli mi?');
{
  const reached = rows.filter((r) => r.topAnnexerInfamyPeak >= INFAMY_COALITION).length;
  console.log(`  ${reached}/${rows.length} tohumda en cok fetheden ulke koalisyon esigini gordu`);
  console.log(`  dunya zirve sohreti ortalama ${n1(avg('infamyWorldPeak'))}`
    + ` · esigi gecen ulke ortalama ${n1(avg('infamyOver'))}`);
  if (avg('infamyOver') < 1) {
    finding('HIGH', 'sohret freni',
      'fetheden ulke koalisyon esigini gormeli',
      `tohum basina esigi gecen ulke ${n1(avg('infamyOver'))}`,
      'Beta 3: esik 22, dunya zirvesi 6,5 — fren hic devreye girmiyordu');
  } else {
    console.log('  -> Genisleme karsi baski uretiyor. DOGRU.');
  }
}

// --- TEST 3: ikinci cephe mumkun mu? ---
sub('TEST 3 — savasta olan ulke ikinci bir komsu tarafindan vurulabiliyor mu?');
{
  console.log(`  tohum basina ikinci cephe acilisi: ${n1(avg('secondFronts'))}`);
  if (avg('secondFronts') < 1) {
    finding('CRITICAL', 'savasta olmak dokunulmazlik',
      'zaten savasan bir ulke ikinci bir saldirgan tarafindan vurulabilmeli',
      `tohum basina ${n1(avg('secondFronts'))} ikinci cephe`,
      'Beta 3 kok nedeni: surekli savasan oyuncu surekli dokunulmaz');
  } else {
    console.log('  -> Savasta olmak artik kalkan degil. DOGRU.');
  }
}

// --- TEST 4: sinirsiz cullanma engelleniyor mu? ---
sub('TEST 4 — sinirsiz cullanma (dog-pile) engelleniyor mu?');
{
  console.log(`  azami escamanli saldirgan: ${rows.map((r) => r.maxSimultaneous).join(' · ')}`);
  console.log(`  3+ saldirganli ulke-hafta: ${rows.map((r) => r.dogpiled3).join(' · ')}`);
  if (Math.max(...rows.map((r) => r.maxSimultaneous)) > 3) {
    finding('HIGH', 'cullanma',
      'bir ulusa ayni anda ucten fazla saldirgan binmemeli',
      `azami ${Math.max(...rows.map((r) => r.maxSimultaneous))}`,
      'kurbani bekleyen kuyruk savas zincirinin eski sebebiydi');
  } else {
    console.log('  -> Cullanma sinirli. DOGRU.');
  }
}

// --- TEST 5: ayni kurbana tekrar saldirmak zorlasti mi? ---
sub('TEST 5 — ayni kurbana tekrarlanan savas seyreldi mi?');
{
  console.log(`  4+ kez savasan cift: ${rows.map((r) => r.repeatPairs4).join(' · ')}`
    + ` · en cok tekrar: ${rows.map((r) => r.maxRepeats).join(' · ')}`);
  console.log(`  ortanca bosluk: ${n1(avg('medianGap'))} hafta`
    + ` · 80 haftadan once tekrarlanan savas: ${n1(avg('quickRepeats'))} / tohum`);
  // Olcut ORTANCA ve HIZLI TEKRAR: ortalama, arada bir olan cok uzun
  // bosluklarla salam taktigini gizliyor (olculdu: ortalama 231, ortanca 10).
  if (avg('medianGap') > 0 && avg('medianGap') < 80) {
    finding('HIGH', 'salam taktigi',
      'ayni kurbana tekrar saldirmak icin gercek bir bekleme olmali',
      `ortanca bosluk ${n1(avg('medianGap'))} hafta,`
        + ` tohum basina ${n1(avg('quickRepeats'))} hizli tekrar`,
      'Beta 3: bir cift 64 yilda 14 kez savasti');
  } else {
    console.log('  -> Tekrarlanan savas arasindaki bosluk gercek. DOGRU.');
  }
}

// --- TEST 6: savasin bir govdesi var mi? ---
sub('TEST 6 — savasin stratejik govdesi');
{
  console.log(`  ORTANCA savas suresi ${n1(avg('medianWeeks'))} hafta`
    + ` (ortalama ${n1(avg('meanWeeks'))}, donmus savaslar disarida)`
    + ` · 16 haftadan kisa savas orani ${pct(avg('shortWars') / Math.max(1, avg('closedWars')))}`);
  // Olcut ORTANCA: ortalamayi hic kapanmayan cepheler zehirliyor.
  if (avg('medianWeeks') < 18) {
    finding('HIGH', 'savas suresi',
      'savaslar bir seferi tasiyacak kadar surmeli (ortanca >= 18 hafta)',
      `ortanca ${n1(avg('medianWeeks'))} hafta`,
      'Beta 3 bulgusu W-1: 11,4 hafta / 4 muharebe — baskin, savas degil');
  } else {
    console.log('  -> Savaslarin govdesi var. DOGRU.');
  }
}

// --- TEST 7: eski hata geri gelmedi mi? ---
sub('TEST 7 — savas hala toprak uretiyor mu? (gerileme kapisi)');
{
  const share = avg('changed') / avg('provinces');
  console.log(`  ${YEARS} yilda degisen kume orani ${pct(share)}`
    + ` · toprak kazanan ulke ${n1(avg('gainers'))}`
    + ` · ulke ${rows.map((r) => `${r.aliveStart}->${r.alive}`).join(' ')}`);
  if (share < 0.03) {
    finding('CRITICAL', 'toprak uretimi',
      'savaslar hala sinir degistirmeli', `yalniz ${pct(share)} kume el degisti`,
      'Beta 2 hatasi geri dondu: savas kazanmak islevsel olarak imkansiz');
  } else if (share > 0.33) {
    finding('HIGH', 'kartopu',
      "haritanin ucte birinden fazlasi el degistirmemeli", pct(share));
  } else {
    console.log('  -> Sinirlar hala degisiyor, kartopu yok. DOGRU.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
