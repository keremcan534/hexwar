// Iletisim katmani denetimi: SESSIZLIGI duzeltirken GURULTU uretmeyelim.
//
// Kor Beta #2'nin hukmu "iyi simulasyon, sessiz oyun"du. Bu gecis olaylari
// konusturdu; bu denetim iki yonlu nobet tutar:
//   1. Buyuk olaylar GERCEKTEN duyuruluyor mu? (sessizlik nobeti)
//   2. Oyuncu her hafta bolunuyor mu? (gurultu nobeti)
//
// Olcu birimi YILLIK butcedir: sakin bir yil neredeyse hic kesinti
// uretmemeli, savas/kriz yili daha cok uretebilir.

import {
  headless, run, asPlayer, alive, section, sub, table,
  finding, reportFindings, n1,
} from './harness.mjs';
import { TIER } from '../../src/game/chronicle.js';

function show(rows, keys) {
  console.log(table(rows, keys.map((key, i) => ({
    label: key, get: (row) => row[key] ?? '', right: i !== 0,
  }))));
}

/**
 * Oyuncu ulkesini izleyen kosu. Bildirim merkezi yerine sayac takilir:
 * hangi tier'den kac kart aktigi ve kac kez zamanin durduguna bakilir.
 */
function measure(seed, weeks) {
  const game = headless(seed);
  const nation = alive(game)
    .sort((a, b) => (b.economy.factories?.length ?? 0) - (a.economy.factories?.length ?? 0))[0];
  asPlayer(game, nation);
  const tiers = [0, 0, 0, 0];
  const titles = new Map();
  let halts = 0;
  game.notifications = {
    push(text, meta = {}) {
      const tier = meta.tier ?? 0;
      tiers[tier]++;
      if (tier >= TIER.MAJOR) {
        const key = meta.title ?? text.slice(0, 40);
        titles.set(key, (titles.get(key) ?? 0) + 1);
      }
      // Gercek merkezin durdurma kurali: meta.halt ya da tier 3.
      if (meta.halt === true || (meta.halt !== false && tier >= TIER.EXISTENTIAL)) halts++;
      return null;
    },
  };
  game.setSpeed = () => {};
  run(game, weeks);
  return { game, nation, tiers, halts, titles, years: weeks / 52 };
}

section('event-communication-audit — Sessizlik ve gurultu dengesi');

sub('TEST 1 — yillik bildirim butcesi (3 tohum x 50 yil)');

const rows = [];
let worstMajor = 0;
let worstHalt = 0;
let quietest = Infinity;
for (const seed of ['COMM1', 'COMM2', 'COMM3']) {
  const m = measure(seed, 2600);
  const majorPerYear = (m.tiers[2] + m.tiers[3]) / m.years;
  const haltPerYear = m.halts / m.years;
  rows.push({
    seed,
    'ambient/yil': n1(m.tiers[0] / m.years),
    'onemli/yil': n1(m.tiers[1] / m.years),
    'ulusal/yil': n1(majorPerYear),
    'durdurma/yil': n1(haltPerYear),
    vakayiname: (m.nation.chronicle ?? []).length,
  });
  worstMajor = Math.max(worstMajor, majorPerYear);
  worstHalt = Math.max(worstHalt, haltPerYear);
  quietest = Math.min(quietest, (m.nation.chronicle ?? []).length);
}
show(rows, ['seed', 'ambient/yil', 'onemli/yil', 'ulusal/yil', 'durdurma/yil', 'vakayiname']);

// GURULTU: yilda ikiden fazla zaman durdurma oyuncuyu bolmeye baslar.
if (worstHalt > 2) {
  finding('HIGH', 'bildirim gurultusu',
    'yilda en cok 2 zorunlu duraklama',
    `${n1(worstHalt)} duraklama/yil`,
    'her donum noktasi zamani durdurursa oyun oynanmaz hale gelir');
}
// SESSIZLIK: yuzyilda hic ulusal olay yoksa katman calismiyor demektir.
if (quietest < 2) {
  finding('HIGH', 'iletisim sessizligi',
    '50 yilda en az 2 ulusal olay kayda gecmeli',
    `en sessiz tohumda ${quietest} kayit`,
    'simulasyon tarih uretiyor ama oyun anlatmiyor');
}

sub('TEST 2 — tekrar engelleme (ayni baslik kac kez?)');

{
  const m = measure('COMMDUP', 5200);
  const repeats = [...m.titles.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);
  show(repeats.length
    ? repeats.slice(0, 8).map(([title, count]) => ({ baslik: title.slice(0, 52), tekrar: count }))
    : [{ baslik: '(tekrar yok)', tekrar: 0 }], ['baslik', 'tekrar']);
  // Yuzyilda ayni baslik en cok 4 kez: ikinci iflas tarihtir, sekizinci gurultu.
  const worst = repeats[0]?.[1] ?? 0;
  if (worst > 4) {
    finding('MEDIUM', 'olay tekrari',
      'ayni ulusal olay yuzyilda en cok 4 kez',
      `"${repeats[0][0].slice(0, 40)}" ${worst} kez`,
      'durum makinesi cikip girdikce ayni satiri tekrarliyor');
  }
}

sub('TEST 3 — vakayiname yogunlugu (on yil basina)');

{
  const m = measure('COMMDENS', 5200);
  const entries = m.nation.chronicle ?? [];
  const perDecade = entries.length / 10;
  show([{
    'toplam kayit': entries.length,
    'on yil basina': n1(perDecade),
    'ilk kayit': entries.length ? 1836 + Math.floor(entries[0].turn / 52) : '—',
    'son kayit': entries.length ? 1836 + Math.floor(entries[entries.length - 1].turn / 52) : '—',
  }], ['toplam kayit', 'on yil basina', 'ilk kayit', 'son kayit']);
  // Hedef: on yilda birkac satir. 12'den fazlasi gunluk olur, tarih olmaz.
  if (perDecade > 12) {
    finding('MEDIUM', 'vakayiname yogunlugu',
      'on yilda en cok 12 kayit',
      `${n1(perDecade)} kayit/on yil`,
      'vakayiname tarih degil gunluk haline geliyor');
  }
}

reportFindings();
