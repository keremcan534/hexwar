// Olcek denetimi: STANDART dunya (160x96) makul surede uretiliyor ve isliyor
// mu? Diger denetimler 78x62'ye sabitli (bkz. harness.headless); tam boy
// haritanin maliyet profili yalniz burada olculur.
//
// Esikler Node tek cekirdek icindir ve comert tutulmustur: amac gercek
// regresyonu yakalamak, CI'yi titretmek degil.

import { generateWorld } from '../../src/world/worldgen.js';
import {
  alive, finding, headless, n0, reportFindings, runWatched, section, sub,
} from './harness.mjs';

const SEED = 'scale-audit';
const COLS = 160;
const ROWS = 96;

section(`URETIM — ${COLS}x${ROWS}`);
{
  const t0 = performance.now();
  const world = generateWorld(SEED, { cols: COLS, rows: ROWS });
  const genMs = performance.now() - t0;
  console.log(`  uretim: ${genMs.toFixed(0)} ms · ${n0(world.tiles.length)} hex · kara ${n0(world.landCount)}`);
  if (genMs > 3000) {
    finding('HIGH', 'uretim suresi', '< 3000 ms', `${genMs.toFixed(0)} ms`);
  }
  if (world.tiles.length !== COLS * ROWS) {
    finding('CRITICAL', 'hex sayisi', String(COLS * ROWS), String(world.tiles.length));
  }
}

section('TAM OYUN KURULUMU + 40 HAFTA');
{
  const t0 = performance.now();
  const game = headless(SEED, { cols: COLS, rows: ROWS });
  const setupMs = performance.now() - t0;
  const world = game.world;
  console.log(`  kurulum: ${setupMs.toFixed(0)} ms · ulke ${world.nations.length}`
    + ` · kultur ${world.cultures.length} · sehir ${world.cities.length}`);
  if (setupMs > 8000) {
    finding('HIGH', 'kurulum suresi', '< 8000 ms', `${setupMs.toFixed(0)} ms`);
  }
  // Dunya artik BOS birakilmiyor: her toprak bir devlete bagli (bkz.
  // nations.fillRemaining). Bant buna gore genis; ust sinir tur maliyetini
  // korur, alt sinir "harita dolu hissettirmeli" kuralini.
  if (world.nations.length < 35 || world.nations.length > 75) {
    finding('MEDIUM', 'ulke sayisi', '35-75 bandi (dolu dunya, yonetilebilir tur)',
      String(world.nations.length));
  }

  sub('40 haftalik kosu (degismez taramali)');
  const w0 = performance.now();
  const violations = runWatched(game, 40);
  const runMs = performance.now() - w0;
  const perWeek = runMs / 40;
  console.log(`  40 hafta: ${runMs.toFixed(0)} ms · hafta basina ${perWeek.toFixed(0)} ms`);
  if (perWeek > 1000) {
    finding('HIGH', 'hafta suresi', '< 1000 ms/hafta', `${perWeek.toFixed(0)} ms`);
  } else if (perWeek > 400) {
    finding('MEDIUM', 'hafta suresi', '< 400 ms/hafta (masaustu hedefi ~60 ms)',
      `${perWeek.toFixed(0)} ms`);
  }
  for (const v of violations.slice(0, 8)) {
    finding('CRITICAL', `degismez: ${v.system}.${v.field}`, 'sonlu/aralikta', String(v.value),
      `hafta ${v.turn} ulke ${v.nationId}`);
  }
  if (!violations.length) console.log('  degismez ihlali yok.');

  const living = alive(game);
  const pop = living.reduce((s, n) => s + (n.economy?.population ?? 0), 0);
  console.log(`  canli ulke ${living.length} · toplam nufus ${n0(pop)}`);
  if (!living.length || !Number.isFinite(pop) || pop <= 0) {
    finding('CRITICAL', 'dunya canliligi', 'yasayan ulkeler ve pozitif nufus', `ulke ${living.length}, pop ${pop}`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
