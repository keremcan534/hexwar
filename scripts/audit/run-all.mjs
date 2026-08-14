// Butun denetimleri sirayla isletir ve ozet cikarir.
//
// Kullanim:  node scripts/audit/run-all.mjs           (hepsi)
//            node scripts/audit/run-all.mjs tax market (adinda gecenler)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const AUDITS = [
  ['determinism', 'Ayni tohum ayni oyunu veriyor mu'],
  ['wrap', 'Silindirik sarmal topoloji'],
  ['scale', '200x160 olcek profili'],
  ['province', 'Province bolumlemesi'],
  ['world', 'Makro dunya sablonu'],
  ['tax', 'C. Vergi uc deger testi'],
  ['tariff', 'D. Gumruk istismar testi'],
  ['budget', 'E/F/G. Butce kaydiraclari, sifir ve tavan devlet'],
  ['market', 'H/M. Piyasa korunumu ve kitlik'],
  ['factory', 'I/J. Fabrika ve subvansiyon'],
  ['population', 'K/L/N. Nufus, hane ekonomisi, istihdam'],
  ['construction', 'Q. Insaat'],
  ['military', 'R/S/T. Savas ekonomisi'],
  ['debt', 'U. Borc ve faiz'],
  ['ai', 'V. YZ hayatta kalma'],
  ['strategy', 'W. Baskin strateji avi'],
  ['boundary', 'X. Sinir degerleri'],
  ['save', 'Y. Kayit / yukleme'],
  ['legacy', 'Z. Eski sistemler'],
  ['long-run', 'Uzun kosu dunya testleri'],
];

const filter = process.argv.slice(2).map((s) => s.toLowerCase());
const selected = filter.length
  ? AUDITS.filter(([name, desc]) => filter.some((f) => `${name} ${desc}`.toLowerCase().includes(f)))
  : AUDITS;

const results = [];
for (const [name, desc] of selected) {
  const started = Date.now();
  process.stdout.write(`\n\n${'#'.repeat(74)}\n# ${name}-audit — ${desc}\n${'#'.repeat(74)}\n`);
  const out = spawnSync(process.execPath, [join(HERE, `${name}-audit.mjs`)], {
    encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
  process.stdout.write(out.stdout ?? '');
  if (out.stderr) process.stderr.write(out.stderr);
  // Bulgu sayisi cikti ozetinden okunur; her denetim ayni bicimi basar.
  const counts = {};
  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    const match = new RegExp(`^${sev} \\((\\d+)\\)$`, 'm').exec(out.stdout ?? '');
    counts[sev] = match ? Number(match[1]) : 0;
  }
  results.push({
    name, desc, counts, seconds: (Date.now() - started) / 1000, status: out.status,
  });
}

console.log(`\n\n${'='.repeat(74)}\nTOPLAM OZET\n${'='.repeat(74)}`);
const width = Math.max(...results.map((r) => r.name.length));
let total = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const r of results) {
  for (const sev of Object.keys(total)) total[sev] += r.counts[sev];
  console.log(`  ${r.name.padEnd(width)}  `
    + `KRITIK ${String(r.counts.CRITICAL).padStart(2)}  `
    + `YUKSEK ${String(r.counts.HIGH).padStart(2)}  `
    + `ORTA ${String(r.counts.MEDIUM).padStart(2)}  `
    + `DUSUK ${String(r.counts.LOW).padStart(2)}  `
    + `(${r.seconds.toFixed(0)}s)`);
}
console.log(`\n  TOPLAM: KRITIK ${total.CRITICAL} · YUKSEK ${total.HIGH}`
  + ` · ORTA ${total.MEDIUM} · DUSUK ${total.LOW}`);
process.exit(total.CRITICAL + total.HIGH > 0 ? 1 : 0);
