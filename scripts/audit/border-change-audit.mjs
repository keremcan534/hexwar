// Sinir degisimi denetimi — 50 YILLIK TAM SIMULASYON.
//
// Beta 2 oyun icinde su bulguyla kapandi: 68 yilda dunyada HICBIR SINIR
// degismedi. Bu denetim o bulgunun geri donmesini engeller ve iki yonlu
// calisir:
//
//   ALT SINIR — savaslar sinir degistirmeli. Sifir degisim, savas dongusunun
//   kirildigi anlamina gelir (kazanan taraf masada bir sey isteyemiyor).
//
//   UST SINIR — degisim SINIRLI kalmali. Victoria savaslari ulke yutmaz,
//   sinir duzeltir. Haritanin ucte biri el degistiriyorsa ya da ulkeler
//   siliniyorsa denge ters tarafa kacmis demektir.
//
// Kullanim:  node scripts/audit/border-change-audit.mjs [yil] [tohum,tohum]

import { headless, section, sub, table, pct, finding, reportFindings } from './harness.mjs';
import { atWar } from '../../src/game/diplomacy.js';

const YEARS = Number(process.argv[2] ?? 50);
const SEEDS = (process.argv[3] ?? 'BORDER1,BORDER2,BORDER3').split(',');

section(`SINIR DEGISIMI DENETIMI — ${YEARS} yil × ${SEEDS.length} tohum`);

/** Bir tohumun tam kosusu; donen sayilar tohumlar arasi karsilastirilabilir. */
function runSeed(seed) {
  const game = headless(seed);
  const world = game.world;
  const before = world.provinces.map((province) => province.owner);
  const nationsBefore = world.nations.filter((nation) => nation.alive).length;
  const wars = new Set();

  for (let week = 0; week < YEARS * 52; week++) {
    game.turns.endTurn();
    // Savas sayimi ilan basina: ayni cift yeniden savasirsa `since` degisir.
    for (let a = 0; a < world.nations.length; a++) {
      for (let b = a + 1; b < world.nations.length; b++) {
        if (atWar(world, a, b)) wars.add(`${a}-${b}-${world.relations[a][b].since}`);
      }
    }
  }

  let changed = 0;
  const gainers = new Set();
  for (let i = 0; i < before.length; i++) {
    const owner = world.provinces[i].owner;
    if (owner === before[i]) continue;
    changed++;
    if (owner >= 0) gainers.add(owner);
  }
  return {
    seed,
    provinces: before.length,
    changed,
    gainers: gainers.size,
    wars: wars.size,
    nationsBefore,
    nationsAfter: world.nations.filter((nation) => nation.alive).length,
  };
}

const rows = SEEDS.map(runSeed);

sub('KOSU SONUCLARI');
console.log(table(rows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'savas', get: (r) => r.wars },
  { label: 'kume', get: (r) => r.provinces },
  { label: 'sahibi degisen', get: (r) => r.changed },
  { label: 'pay', get: (r) => pct(r.changed / r.provinces) },
  { label: 'kazanan ulke', get: (r) => r.gainers },
  { label: 'ulke (once -> sonra)', get: (r) => `${r.nationsBefore} -> ${r.nationsAfter}` },
]));

// --- ALT SINIR: sinirlar kimildamali ---
sub('TEST 1 — sinirlar kimildiyor mu?');
{
  const dead = rows.filter((r) => r.changed === 0);
  const total = rows.reduce((sum, r) => sum + r.changed, 0);
  if (dead.length) {
    finding('CRITICAL', 'donmus dunya',
      `${YEARS} yilda her tohumda en az bir kume el degistirmeli`,
      `${dead.length}/${rows.length} tohumda hicbir sinir degismedi (${dead.map((r) => r.seed).join(', ')})`,
      'beta 2 bulgusu: 68 yilda dunyada hicbir sinir degismedi');
  } else if (total < rows.length * 5) {
    finding('HIGH', 'sonucsuz savaslar',
      `tohum basina ortalama en az 5 kume el degistirmeli`,
      `toplam ${total} kume / ${rows.length} tohum`,
      'savaslar aciliyor ama masada hicbir sey uretmiyor');
  } else {
    console.log(`  -> ${rows.length} tohumun hepsinde sinir degisti`
      + ` (toplam ${total} kume). DOGRU.`);
  }
}

// --- ALT SINIR: degisim tek bir fatihin isi olmamali ---
sub('TEST 2 — birden fazla ulke kazaniyor mu?');
{
  const solo = rows.filter((r) => r.changed > 0 && r.gainers < 2);
  if (solo.length === rows.length) {
    finding('MEDIUM', 'tek fatih',
      'sinir degisimi tek bir ulkenin genislemesi olmamali',
      `${solo.length}/${rows.length} tohumda toprak kazanan tek ulke var`);
  } else {
    const avg = rows.reduce((sum, r) => sum + r.gainers, 0) / rows.length;
    console.log(`  -> Tohum basina ortalama ${avg.toFixed(1)} ulke toprak kazandi. DOGRU.`);
  }
}

// --- UST SINIR: savas ulke yutmamali ---
sub('TEST 3 — degisim sinirli mi? (Victoria olcegi)');
{
  const runaway = rows.filter((r) => r.changed / r.provinces > 0.33);
  const wiped = rows.filter((r) => r.nationsBefore - r.nationsAfter > r.nationsBefore * 0.25);
  if (runaway.length) {
    finding('HIGH', 'kartopu',
      "bir kosuda haritanin ucte birinden fazlasi el degistirmemeli",
      runaway.map((r) => `${r.seed} ${pct(r.changed / r.provinces)}`).join(', '),
      'savas sinir duzeltir, ulke yutmaz');
  } else if (wiped.length) {
    finding('HIGH', 'ulke silinmesi',
      `${YEARS} yilda ulkelerin dortte birinden fazlasi yok olmamali`,
      wiped.map((r) => `${r.seed} ${r.nationsBefore} -> ${r.nationsAfter}`).join(', '));
  } else {
    const share = rows.reduce((sum, r) => sum + r.changed / r.provinces, 0) / rows.length;
    console.log(`  -> Haritanin ortalama ${pct(share)}'i el degisti, ulke sayisi korundu. DOGRU.`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
