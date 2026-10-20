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
  ['econ', 'Ekonomi degismezleri ve sagligi (Uluslar Cagi)'],
  ['military-industry', 'Sanayi savas gucune donusuyor mu (yedek, hat, tuketim mali)'],
  ['tech-effect', 'Degistirici anahtarlarinin okuyucusu'],
  ['save', 'Kayit / yukleme'],
  ['war-outcome', 'Savas sonucu ve toprak devri'],
  ['war-pressure', 'Stratejik baski: savas suresi, sohret, cullanma'],
  ['war-declaration-guard', 'Savas ilani nihai kapisi'],
  ['border-change', '50 yilda sinir degisimi'],
  ['military-strategy', 'Cephe kapsami ve ordu YZ'],
  ['culture-unrest', 'Huzursuzluk, asimilasyon, isyan'],
  ['homeland', 'Ana yurt kilidi, cesitlilik, birakma ve cikis kapilari (kampanya, 6+1 tohum)'],
  ['peace-stakes', 'Baris masasi kabul toleransi'],
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
  // Çöken denetim bulgu basmaz; eskiden "0 bulgu" diye temiz görünüyordu
  // (homeland-audit kaldırılmış bir dışa aktarımı içe alıp iki kez çöktü:
  // 10-07..10-08 provinceOutput, 10-12..10-14 expelCulture; 1900 geçişinin
  // tamamı ikinci pencerede indi ve battery.log onu "0 bulgu (0s)" diye bastı).
  // İstisnayla biten koşu KRİTİK, özet basmadan çıkan koşu (kurulumu anlamsız
  // bulup erken çıktı) YÜKSEK sayılır: ikisi de "temiz" değildir.
  const crashed = Boolean(out.error) || /^\w*Error\b|^\s+at .+:\d+:\d+\)?$/m.test(out.stderr ?? '')
    || (out.status !== 0 && out.status !== 1);
  const summarized = /^(CRITICAL|HIGH|MEDIUM|LOW) \(\d+\)$|bulgu yok/im.test(out.stdout ?? '');
  if (crashed) counts.CRITICAL += 1;
  else if (!summarized) counts.HIGH += 1;
  results.push({
    name, desc, counts, seconds: (Date.now() - started) / 1000, status: out.status,
    note: crashed ? 'COKTU' : summarized ? '' : 'OZETSIZ',
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
    + `(${r.seconds.toFixed(0)}s)${r.note ? `  ${r.note}` : ''}`);
}
console.log(`\n  TOPLAM: KRITIK ${total.CRITICAL} · YUKSEK ${total.HIGH}`
  + ` · ORTA ${total.MEDIUM} · DUSUK ${total.LOW}`);
process.exit(total.CRITICAL + total.HIGH > 0 ? 1 : 0);
