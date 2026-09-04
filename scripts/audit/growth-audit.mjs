// BUYUME DENETIMI — yuzyillik gozlemci kosusu ve REFERANS CIZGI karsilastirmasi.
//
// NEDEN VAR. "Talep gelirle buyusun" pass'i dengeyi gercekten oynatir: fiyat,
// kar, goc, savas gucu, hepsi kayar. Boyle bir degisiklikte tek tehlike hata
// yapmak degil, NE DEGISTIGINI BILMEMEKTIR. Bu denetim degisiklikten ONCEKI
// dunyayi bir dosyaya dondurur (`baselines/growth.json`) ve her kosuda yeni
// dunyayi onun yanina koyar. Boylece "sanirim iyilesti" yerine "1876'da reel
// kisi basi tuketim 1.41'den 1.58'e cikti, fabrika sayisi 468'de kaldi"
// denebilir.
//
// GOZLEMCI KOSUSU. Hicbir ulke oynanmaz (`playerNation` -1'de birakilir).
// Oyuncu atamak maliye/sosyal YZ'yi o ulkede devre disi birakir ve olcumu
// "hangi ulkeyi sectigimize" baglar; dunya toplamlarini olcerken bu bir
// gurultu kaynagidir.
//
// BARISCIL. Ekonomik kaldirac olcerken zorunlu (bkz. harness.runPeaceful):
// savas topragi, toprak nufusu, nufus her seyi degistirir ve iki kosunun farki
// artik kaldiraca degil kimin kimi fethettigine baglanir.
//
// DORT HEDEF. Bu pass'in isi bu dort sayiyi duzeltmektir; denetim onlari tutar:
//   H1  reel kisi basi TUKETIM yuzyil sonunda en az 1.00x olmali
//   H2  orta+ust sinif payi %10'un altina inmemeli
//   H3  fabrika sayisi 1846'dan 1936'ya en az 1.20x buyumeli
//   H4  sanayi DOLULUGU 1846'dan yuzyil sonuna en az 1.50x artmali
//
// H4 NEDEN EGIM OLCER, SEVIYE DEGIL. Vic2'de fabrika slotlari aninda dolmaz:
// okuryazarlik arttikca isci akisi hizlanir, ilk yarim yuzyilda yariya bile
// ulasilmaz, sonra ivmelenir — sanayilesmenin S egrisi budur. Bizde egri TERS
// duruyordu (olculdu: 1837 %61.0 -> 1906 %43.0), cunku dunya yari kadrolu
// tesislerle aciliyor ve insaat ise alimdan hizli oldugu icin doluluk yalniz
// SEYRELIYOR. Tek bir doluluk seviyesi bu kusuru gostermez; ORAN gosterir.
//
// ORANIN IKI YOLU VAR: kadro artar ya da olu kapasite defterden duser. Rapor
// ikisini de basar (kadro Nx · kapasite Nx), cunku yalniz orani yazan bir
// hedef, paydayi kucultup kendini gecirebilir.
//
// Kullanim:
//   npm run audit:growth              -> referans cizgiyle karsilastir
//   npm run audit:growth -- --write   -> mevcut durumu referans cizgi YAP
//   npm run audit:growth -- --years 60 --seeds A,B
//
// SURE UYARISI: varsayilan 100 yil x 2 tohum ve tek cekirdekte ~20 dakika
// surer. Hizli bir on bakis icin --years 40.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  headless, runPeaceful, section, sub, table, n2, finding, reportFindings,
} from './harness.mjs';
import { GOODS, factoryJobs } from '../../src/game/economy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, 'baselines', 'growth.json');

/** argv: --write, --years N, --seeds A,B */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const WRITE = process.argv.includes('--write');
const YEARS = Number(arg('years', 100));
const SEEDS = String(arg('seeds', 'PRICE-A,PRICE-B')).split(',');
// Kontrol noktalari on yillik. Ilk nokta 1836 DEGIL 1837: hafta 0'da hicbir
// tur islememistir, GSYH tanimi geregi 0 cikar ve butun oranlari bozar.
const FIRST = 1837;

/** Dunyanin tek satirlik kesiti. Butun sayilar DUNYA TOPLAMIDIR. */
function slice(world, year) {
  let realGdp = 0; let gdp = 0; let pop = 0;
  let lower = 0; let middle = 0; let upper = 0;
  let tesis = 0; let seviye = 0; let karli = 0;
  let kadro = 0; let kapasite = 0;
  let needsW = 0; let classPop = 0;
  for (const nation of world.nations) {
    const economy = nation.economy;
    if (!nation.alive || !economy) continue;
    realGdp += economy.realGdp ?? 0;
    gdp += economy.gdp ?? 0;
    pop += Math.max(0, economy.population ?? 0);
    lower += economy.classes?.lower?.population ?? 0;
    middle += economy.classes?.middle?.population ?? 0;
    upper += economy.classes?.upper?.population ?? 0;
    for (const cls of ['lower', 'middle', 'upper']) {
      const k = economy.classes?.[cls];
      if (!k) continue;
      classPop += k.population ?? 0;
      needsW += (k.needsMet ?? 0) * (k.population ?? 0);
    }
    for (const factory of economy.factories ?? []) {
      tesis++;
      seviye += factory.level ?? 0;
      kadro += Math.max(0, factory.employees ?? 0);
      kapasite += Math.max(0, factoryJobs(factory));
      if ((factory.profit ?? 0) > 0) karli++;
    }
  }
  // Piyasa: arz/talep ve fiilen el degistiren mal TABAN FIYATLA degerlenir.
  // Cari fiyatla olcmek dairesel olurdu — fiyat zaten fazlanin sonucudur.
  let supply = 0; let demand = 0; let traded = 0; let index = 0; let counted = 0;
  for (const [id, good] of Object.entries(world.market.goods)) {
    const base = good.basePrice ?? GOODS[id]?.basePrice ?? 0;
    if (!(base > 0)) continue;
    supply += good.supply * base;
    demand += good.demand * base;
    traded += Math.min(good.supply, good.demand) * base;
    index += good.price / base;
    counted++;
  }
  const people = Math.max(1, pop);
  const classTotal = Math.max(1, lower + middle + upper);
  return {
    year,
    realGdpPc: realGdp / people,
    tradedPc: traded / people,
    gdp,
    index: counted > 0 ? index / counted : 0,
    ratio: demand > 0 ? supply / demand : 0,
    pop,
    midUpShare: 100 * (middle + upper) / classTotal,
    needsMet: classPop > 0 ? needsW / classPop : 0,
    tesis,
    seviye,
    karliPay: tesis > 0 ? 100 * karli / tesis : 0,
    // SANAYI DOLULUGU. Vic2'de fabrika slotlari aninda dolmaz: okuryazarlik
    // arttikca isci akisi hizlanir, ilk yarim yuzyilda yariya bile ulasilmaz,
    // sonra ivmelenir. Olcut bu EGRIDIR, tek bir seviye degil.
    doluluk: kapasite > 0 ? 100 * kadro / kapasite : 0,
    // DOLULUK BIR ORANDIR VE PAYDASI DA DEGISIR. Olu tesis defterden dusunce
    // doluluk isci gelmeden de yukselir; bu yuzden pay (kadro) ile payda
    // (kapasite) AYRICA raporlanir, yoksa H4 kendini kandirabilir.
    kadro,
    kapasite,
  };
}

function runSeed(seed) {
  const game = headless(seed);
  // GOZLEMCI: harness playerNation'i -1 birakir. Bu bir varsayim degil, kontrol.
  if (game.turns.playerNation !== -1) {
    throw new Error('gozlemci kosusu bekleniyordu: playerNation -1 degil');
  }
  const world = game.world;
  const marks = [];
  let year = 1836;
  for (const target of [FIRST, ...decades()]) {
    const weeks = Math.round((target - year) * 52);
    if (weeks > 0) runPeaceful(game, weeks);
    year = target;
    marks.push(slice(world, target));
  }
  return marks;
}

function decades() {
  const out = [];
  for (let y = 1846; y <= 1836 + YEARS; y += 10) out.push(y);
  return out;
}

/** Iki kosunun ayni kontrol noktalarini eslestir; eslesmeyeni atla. */
function pair(now, before) {
  if (!before) return null;
  const byYear = new Map(before.map((m) => [m.year, m]));
  return now.map((m) => ({ now: m, before: byYear.get(m.year) ?? null }));
}

section(`BUYUME — gozlemci kosusu · ${YEARS} yil x ${SEEDS.length} tohum`);
console.log('  Hicbir ulke oynanmadi (playerNation -1) · savaslar bastirildi.');

const current = {};
for (const seed of SEEDS) {
  current[seed] = runSeed(seed.trim());
}

let baseline = null;
if (existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch (err) {
    console.log(`  UYARI: referans cizgi okunamadi (${err.message}); karsilastirma atlaniyor.`);
  }
}

// --- yorum satiri: her tohum icin yol haritasi -------------------------------
for (const seed of SEEDS) {
  const marks = current[seed.trim()];
  sub(`TOHUM ${seed.trim()} — yuzyilin seyri`);
  const first = marks[0];
  console.log(table(marks, [
    { label: 'yil', get: (m) => String(m.year), right: false },
    { label: 'reel uretim/kisi', get: (m) => n2(m.realGdpPc / first.realGdpPc) },
    { label: 'reel tuketim/kisi', get: (m) => n2(m.tradedPc / first.tradedPc) },
    { label: 'fiyat endeksi', get: (m) => n2(m.index) },
    { label: 'arz/talep', get: (m) => n2(m.ratio) },
    { label: 'orta+ust %', get: (m) => n2(m.midUpShare) },
    { label: 'sepet %', get: (m) => n2(100 * m.needsMet) },
    { label: 'tesis', get: (m) => String(m.tesis) },
    { label: 'karli %', get: (m) => n2(m.karliPay) },
  ]));
}

// --- referans cizgiyle fark ---------------------------------------------------
if (baseline && baseline.seeds) {
  sub('REFERANS CIZGIYLE FARK');
  console.log(`  taban: ${baseline.recorded ?? 'tarihsiz'} · commit ${baseline.commit ?? '?'}`);
  // Kisi basi reel buyuklukler HAM haliyle 1e-5 mertebesindedir ve iki
  // basamakla basilinca ekranda "0.00 -> 0.00" gorunuyordu: yuzde dogru,
  // sayilar okunamaz. Ikisi de kendi kosusunun ILK kontrol noktasina gore
  // ENDEKSLENIR — zaten anlamli olan buyukluk odur.
  const METRICS = [
    ['realGdpPc', 'reel uretim/kisi', true],
    ['tradedPc', 'reel tuketim/kisi', true],
    ['index', 'fiyat endeksi', false],
    ['ratio', 'arz/talep', false],
    ['midUpShare', 'orta+ust %', false],
    ['needsMet', 'sepet', false],
    ['tesis', 'tesis', false],
  ];
  for (const seed of SEEDS) {
    const key = seed.trim();
    const rows = pair(current[key], baseline.seeds[key]);
    if (!rows) { console.log(`  ${key}: referans cizgide yok, atlandi.`); continue; }
    const son = rows[rows.length - 1];
    if (!son.before) { console.log(`  ${key}: son yil referansta yok, atlandi.`); continue; }
    const nowFirst = current[key][0];
    const beforeFirst = baseline.seeds[key][0];
    console.log(`\n  ${key} — ${son.now.year} yilinda:`);
    for (const [k, label, indexed] of METRICS) {
      let a = son.before[k]; let b = son.now[k];
      if (indexed) {
        // Her kosu KENDI ilk noktasina gore endekslenir; iki kosunun ham
        // birimleri farkli olabilir, buyume orani karsilastirilabilir olandir.
        a = beforeFirst?.[k] > 0 ? a / beforeFirst[k] : NaN;
        b = nowFirst?.[k] > 0 ? b / nowFirst[k] : NaN;
      }
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const delta = a !== 0 ? 100 * (b - a) / Math.abs(a) : 0;
      const yon = Math.abs(delta) < 0.005 ? '=' : (delta > 0 ? '+' : '');
      console.log(`      ${label.padEnd(20)} ${n2(a).padStart(10)} -> ${n2(b).padStart(10)}`
        + `   ${yon}${n2(delta)}%`);
    }
  }
} else if (!WRITE) {
  sub('REFERANS CIZGI YOK');
  console.log('  `npm run audit:growth -- --write` ile bu kosu taban olarak kaydedilir.');
}

// --- hedefler ------------------------------------------------------------------
sub('HEDEFLER — bu pass\'in isi');
{
  // KISA UFUKTA HUKUM VERILMEZ. H3 son yili 1846 ile kiyaslar; kosu 1846'da
  // bitiyorsa oran tanim geregi 1.00 cikar ve denetim var olmayan bir kusuru
  // isaretler. Uc hedefin ucu de en az yarim yuzyil ister.
  const MIN_YEAR = 1886;
  const sonYil = current[SEEDS[0].trim()].at(-1).year;
  if (sonYil < MIN_YEAR) {
    console.log(`  Ufuk kisa (${sonYil}); hedefler ${MIN_YEAR}'dan once olculmez.`);
    console.log('  Yol haritasi yukarida okunabilir, hukum icin --years 50 veya uzeri gerekir.');
  } else {
  const rows = SEEDS.map((s) => {
    const marks = current[s.trim()];
    const first = marks[0];
    const last = marks[marks.length - 1];
    const y1846 = marks.find((m) => m.year === 1846) ?? first;
    return {
      seed: s.trim(),
      h1: last.tradedPc / first.tradedPc,
      h2: last.midUpShare,
      h3: y1846.tesis > 0 ? last.tesis / y1846.tesis : 0,
    };
  });
  console.log(table(rows, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'H1 tuketim/kisi', get: (r) => n2(r.h1) },
    { label: 'H2 orta+ust %', get: (r) => n2(r.h2) },
    { label: 'H3 tesis buyumesi', get: (r) => n2(r.h3) },
  ]));

  const w1 = rows.reduce((a, b) => (b.h1 < a.h1 ? b : a));
  if (w1.h1 < 1) {
    finding('HIGH', 'H1 reel tuketim buyumuyor',
      `${YEARS} yilda reel kisi basi tuketim en az 1.00x olmali`,
      `${n2(w1.h1)}x (${w1.seed})`,
      'talep sabit sepet tavanina yaslanir: bought = quantity * afford, afford <= 1');
  } else {
    console.log('  -> H1 gecti: reel kisi basi tuketim buyuyor.');
  }

  const w2 = rows.reduce((a, b) => (b.h2 < a.h2 ? b : a));
  if (w2.h2 < 10) {
    finding('HIGH', 'H2 orta ve ust sinif eziliyor',
      'orta+ust sinif payi %10\'un altina inmemeli',
      `%${n2(w2.h2)} (${w2.seed})`,
      'runPromotion "sepetini karsila + %35 artik birak" ister; sepet %50 civarinda');
  } else {
    console.log('  -> H2 gecti: orta ve ust sinif ayakta.');
  }

  sub('H4 — sanayi dolulugu yuzyil icinde YUKSELIYOR mu?');
  for (const seed of SEEDS) {
    const marks = current[seed.trim()];
    console.log(`  ${seed.trim()}: `
      + marks.map((m) => `${m.year} %${n2(m.doluluk)}`).join(' · '));
  }
  {
    // Olcut SEVIYE degil EGIMDIR: dunya yarim kadroyla acilip asagi kayiyorsa
    // (olculdu: 1837 %61 -> 1906 %43) sanayilesmenin bir kalkisi yok demektir.
    const oran = SEEDS.map((s) => {
      const marks = current[s.trim()];
      const erken = marks.find((m) => m.year === 1846) ?? marks[0];
      const gec = marks[marks.length - 1];
      return { seed: s.trim(), erken: erken.doluluk, gec: gec.doluluk,
        oran: erken.doluluk > 0 ? gec.doluluk / erken.doluluk : 0 };
    });
    const worst = oran.reduce((a, b) => (b.oran < a.oran ? b : a));
    console.log(`  en kotu tohumda 1846 %${n2(worst.erken)} -> %${n2(worst.gec)}`
      + ` = ${n2(worst.oran)}x (${worst.seed})`);
    // ORANIN NEREDEN GELDIGI YAZILIR. Doluluk hem isci gelince hem olu
    // kapasite dusunce yukselir; ikisi ayni sey degildir ve rapor bunu
    // saklarsa hedef kendi kendini gecirir.
    for (const s2 of SEEDS) {
      const marks = current[s2.trim()];
      const erken = marks.find((m) => m.year === 1846) ?? marks[0];
      const gec = marks[marks.length - 1];
      console.log(`      ${s2.trim()}: kadro ${n2(gec.kadro / Math.max(1, erken.kadro))}x`
        + ` · kapasite ${n2(gec.kapasite / Math.max(1, erken.kapasite))}x`
        + ` (1846 kadro ${(erken.kadro / 1e6).toFixed(2)}mn -> ${(gec.kadro / 1e6).toFixed(2)}mn)`);
    }
    // KANIT METNI DE KOSUDAN GELIR. Once "dunyanin yarisi ise alima kapali"
    // yaziliydi; o cumle bir onceki turun olcumuydu ve her kosuda tekrar
    // dogrulanmadan basiliyordu. Artik bu kosunun kendi pay/payda sayilari yazilir.
    const buyume = (s3) => {
      const marks = current[s3.trim()];
      const erken = marks.find((m) => m.year === 1846) ?? marks[0];
      const gec = marks[marks.length - 1];
      return {
        kadro: gec.kadro / Math.max(1, erken.kadro),
        kapasite: gec.kapasite / Math.max(1, erken.kapasite),
      };
    };
    if (worst.oran < 1.5) {
      const b4 = buyume(worst.seed);
      finding('HIGH', 'H4 sanayi dolulugu yukselmiyor',
        '1846\'dan yuzyil sonuna doluluk en az 1.50x artmali',
        `${n2(worst.oran)}x (${worst.seed})`,
        `ayni tohumda kadro ${n2(b4.kadro)}x, kapasite ${n2(b4.kapasite)}x`
          + ` — doluluk ancak kadro kapasiteden HIZLI buyurse yukselir`);
    } else {
      console.log('  -> H4 gecti: sanayi yuzyil icinde doluyor.');
    }
    // H3 ILE H4 AYNI KESRIN IKI UCUDUR. Bu bir ölcu kusurudur, oyunun degil:
    // doluluk = kadro / kapasite; H3 kapasitenin BUYUMESINI, H4 ayni kesrin
    // KUCUK kalmasini ister. Ikisini ayni anda yesile boyamak tanim geregi
    // mumkun degil. Uyari her kosuda basilir ki gelecek turlar birbirini
    // kovalamasin — ikisi TEK olcute indirilmeli (bkz. MEKANIK_KILAVUZU 4.5).
    if (worst.oran < 1.5 && rows.some((r) => r.h3 < 1.2)) {
      console.log('  !! H3 ve H4 AYNI KESRIN pay ve paydasidir: ikisi birlikte'
        + ' yesile donemez. Tek olcute indirilmeli.');
    }
  }

  const w3 = rows.reduce((a, b) => (b.h3 < a.h3 ? b : a));
  if (w3.h3 < 1.2) {
    finding('HIGH', 'H3 sanayi taslasiyor',
      '1846-1936 arasi fabrika sayisi en az 1.20x buyumeli',
      `${n2(w3.h3)}x (${w3.seed})`,
      (() => {
        const marks = current[w3.seed];
        const erken = marks.find((m) => m.year === 1846) ?? marks[0];
        const gec = marks[marks.length - 1];
        return `ayni tohumda kapasite ${n2(gec.kapasite / Math.max(1, erken.kapasite))}x,`
          + ` kadro ${n2(gec.kadro / Math.max(1, erken.kadro))}x. Tesis SAYISI olu tesis`
          + ` tasfiyesiyle de duser (retireDeadFactories), yani bu olcut tek basina`
          + ` "sanayi buyuyor mu" sorusuna cevap vermez.`;
      })());
  } else {
    console.log('  -> H3 gecti: sanayi yuzyil boyunca buyuyor.');
  }
  }
}

if (WRITE) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  const payload = {
    recorded: new Date().toISOString().slice(0, 10),
    commit: process.env.GIT_COMMIT ?? null,
    years: YEARS,
    note: 'Gozlemci kosusu (playerNation -1), bariscil, dunya toplamlari.',
    seeds: current,
  };
  writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n  Referans cizgi yazildi: ${BASELINE}`);
}

reportFindings();
