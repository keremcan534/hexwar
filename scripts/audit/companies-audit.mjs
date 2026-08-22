// SIRKET / BORSA + DEVIR DENETIMI.
//
// Gorevin adlandirdigi degismezleri tek tek sinar. Genis bir "her seyi tara"
// kosusu DEGILDIR: her baslik tek bir iddiayi olcer ve sayiyi basar.
//
//   K1  hisse dagilimi her zaman %100 eder
//   K2  hisse alimi PARA KORUR (transfer, yaratma degil)
//   K3  temettu gercek kardan gelir ve para korur
//   K4  sahiplik BEDAVA MAL VERMEZ (fiziksel korunum bozulmaz)
//   K5  ayricalikli erisim mali yine PIYASA FIYATINDAN odetir
//   K6  yabanci sahiplik tavanlari tutar
//   K7  savas dusman ortagin temettusunu ve onceligini keser
//   K8  kayit/yukleme sirketleri ve sahipligi korur
//   K9  determinizm: ayni tohum ayni sonuc
//   K10 ozel yatirim calismaya devam eder
//   K11 sirket genislemesi fabrika/kaynak COGALTMAZ
//   K12 AUTO ON oyuncunun YASAL kaynak ve sinirlarini kullanir
//   K13 AUTO OFF elle kontrolu geri verir

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { headless } from './harness.mjs';
import { serialize, deserialize } from '../../src/game/save.js';
import { GOOD_IDS } from '../../src/game/economy.js';
import { fiscalPolicyLimits } from '../../src/game/politics.js';
import { atWar, declareWar } from '../../src/game/diplomacy.js';
import { setDelegation } from '../../src/game/delegation.js';
import {
  SECTORS, allCompanies, buyShares, domesticShare, foreignOwnershipCap, foreignShare,
  nationalize, purchasableShare, sharePrice, stakeOf,
} from '../../src/game/companies.js';

/**
 * ISCI KIPI. Kaydet/yukle karsilastirmasi AYRI SURECLERDE kosmali:
 * `units.js` kimlik sayaci MODUL DUZEYINDE bir degiskendir, yani tek surecte
 * iki oyun ayni sayaci paylasir ve yuklemenin `resetUnitIds` cagrisi
 * kesintisiz kosunun sayacini da geri sarar. Bu, gercek bir kayit hatasi
 * degil olcum kirliligidir; save-audit de ayni sebeple isci kullanir.
 */
const SELF = fileURLToPath(import.meta.url);
const WEEKS_BEFORE = 180;
const WEEKS_AFTER = 60;
/**
 * K9'un tohumu. SAVE-1 secildi cunku bu tohumda TABAN kosu (hicbir sirket
 * eylemi olmadan, hatta bu ozellik yokken de) kaydet/yukle acisindan temizdir
 * — yani buradaki bir fark GERCEKTEN sirket katmanina aittir.
 *
 * DIKKAT: CO-8 / CO-9 / CO-A / CO-B tohumlarinda taban kosu ZATEN dallaniyor
 * ve bu ozellikten ONCE de dalllaniyordu (olculdu, bkz.
 * COMPANIES_AND_DELEGATION_REPORT.md "Cozulmemis"). O tohumlari K9'a koymak
 * baskasinin hatasini bu denetime yazmak olurdu.
 */
const SAVE_SEED = 'SAVE-1';

/** Sahiplik tablosunun determinist ozeti. */
function ownershipSnapshot(world) {
  return allCompanies(world).map((c) => `${c.id}:${Object.keys(c.owners).sort()
    .map((k) => `${k}=${c.owners[k].toFixed(6)}`).join(',')}`).join('|');
}

/** Sirket/sahiplik/deger parmak izi. */
function fingerprint(game) {
  let out = '';
  for (const n of game.world.nations) {
    if (!n.alive) continue;
    out += `${n.id},${(n.gold ?? 0).toFixed(3)},${(n.politics?.privateCapital ?? 0).toFixed(3)};`;
    for (const c of n.economy.companies ?? []) {
      out += `${c.id}=${c.value.toFixed(4)}/${foreignShare(c).toFixed(6)}/${c.cash.toFixed(4)},`;
    }
    out += '|';
  }
  return out;
}

/**
 * Senaryonun ELLE yapilan kismi: en zengin ulke birkac yabanci sirkete ortak
 * olur ve iki alani devreder. Iki surecte de AYNI sirayla kosar.
 */
function openPositions(game) {
  const world = game.world;
  const buyer = [...world.nations].filter((n) => n.alive).sort((a, b) => b.gold - a.gold)[0];
  for (let attempt = 0; attempt < 8; attempt++) {
    const company = pickTarget(world, buyer);
    if (!company || !buyShares(game, buyer, company, 0.04)) break;
  }
  game.turns.playerNation = buyer.id;
  setDelegation(game, buyer, 'budget', true);
  setDelegation(game, buyer, 'trade', true);
  return buyer.id;
}

function worker(mode) {
  return execFileSync(process.execPath, [SELF, '--worker', mode], {
    encoding: 'utf8', maxBuffer: 1 << 26,
  }).trim();
}

if (process.argv[2] === '--worker') {
  const mode = process.argv[3];
  const game = headless(SAVE_SEED);
  for (let i = 0; i < WEEKS_BEFORE; i++) game.turns.endTurn();
  openPositions(game);
  let subject = game;
  if (mode === 'reloaded') {
    const payload = JSON.parse(JSON.stringify(serialize(game)));
    subject = headless(SAVE_SEED);
    if (!deserialize(subject, payload)) { process.stdout.write('LOAD-FAILED'); process.exit(0); }
  }
  for (let i = 0; i < WEEKS_AFTER; i++) subject.turns.endTurn();
  process.stdout.write(fingerprint(subject));
  process.exit(0);
}

const findings = [];
const fail = (id, title, expected, measured) => {
  findings.push(`${id} ${title}`);
  console.log(`  [YUKSEK] ${id} ${title}`);
  console.log(`      beklenen: ${expected}`);
  console.log(`      olculen : ${measured}`);
};
const ok = (id, text) => console.log(`  OK  ${id} ${text}`);
const n2 = (v) => (Math.round(v * 100) / 100).toLocaleString('en-US');

/** Dunyanin toplam parasi. Transfer bunu degistirmemeli. */
function worldWealth(world) {
  let total = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    total += nation.gold ?? 0;
    total += nation.politics?.privateCapital ?? 0;
    for (const company of nation.economy?.companies ?? []) total += company.cash ?? 0;
  }
  return total;
}

/** Elde hisse tutan ilk yabanci sirketi bulur; yoksa en degerlisini alir. */
function pickTarget(world, buyer) {
  let best = null;
  for (const host of world.nations) {
    if (!host.alive || host.id === buyer.id) continue;
    for (const company of host.economy?.companies ?? []) {
      if (company.defunct || !(company.value > 0)) continue;
      if (purchasableShare(world, buyer, company) < 0.01) continue;
      if (!best || company.value > best.value) best = company;
    }
  }
  return best;
}

console.log('='.repeat(74));
console.log('SIRKETLER, BORSA VE DEVIR — hedefli degismez denetimi');
console.log('='.repeat(74));

// ---------------------------------------------------------------- K1, K11 --
{
  console.log('\n-- K1/K11 hisse toplami ve varlik tekligi -------------------');
  const game = headless('CO-1');
  for (let i = 0; i < 200; i++) game.turns.endTurn();
  const world = game.world;
  let worstShare = 0;
  let negative = 0;
  let duplicated = 0;
  let orphan = 0;
  let companies = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const seen = new Set();
    const owned = new Set((nation.economy.factories ?? []).map((f) => f.id));
    for (const company of nation.economy.companies ?? []) {
      companies++;
      let sum = domesticShare(company);
      for (const key in company.owners) {
        const share = company.owners[key];
        if (share < 0 || share > 1) negative++;
        sum += share;
      }
      worstShare = Math.max(worstShare, Math.abs(sum - 1));
      for (const id of company.factoryIds) {
        if (seen.has(id)) duplicated++;
        seen.add(id);
        if (!owned.has(id)) orphan++;
      }
    }
  }
  console.log(`  sirket sayisi: ${companies} (ulke basina <= ${Object.keys(SECTORS).length})`);
  if (worstShare > 1e-9) fail('K1', 'hisse dagilimi %100 etmiyor', '|Σ - 1| = 0', worstShare);
  else ok('K1', `Σ(yurt ici + ortaklar) = 1 (en kotu sapma ${worstShare.toExponential(1)})`);
  if (negative) fail('K1', 'pay araligi disinda', '0 <= pay <= 1', `${negative} kayit`);
  if (duplicated) fail('K11', 'ayni fabrika iki sirkette', '0', `${duplicated} tesis`);
  else if (orphan) fail('K11', 'sirket sahibi olmayan tesisi sahipleniyor', '0', `${orphan} tesis`);
  else ok('K11', 'her tesis en fazla bir sirkette ve gercekten ulkenin');
}

// --------------------------------------------------------------------- K2 --
{
  console.log('\n-- K2 hisse alimi para korur --------------------------------');
  const game = headless('CO-2');
  for (let i = 0; i < 200; i++) game.turns.endTurn();
  const world = game.world;
  const buyer = world.nations.find((n) => n.alive && n.gold > 200);
  const company = buyer ? pickTarget(world, buyer) : null;
  if (!company) {
    console.log('  atlandi: alinabilir yabanci sirket bulunamadi.');
  } else {
    const before = worldWealth(world);
    const beforeBuyer = buyer.gold;
    const home = world.nations[company.home];
    const beforePool = home.politics.privateCapital;
    const beforeCash = company.cash;
    const result = buyShares(game, buyer, company, 0.03);
    const after = worldWealth(world);
    const drift = Math.abs(after - before);
    console.log(`  alinan pay: ${result ? (result.share * 100).toFixed(2) : 0}%`
      + ` bedel ${n2(result?.cost ?? 0)}`);
    if (!result) fail('K2', 'alim gerceklesmedi', 'bir dilim alinabilmeli', 'null');
    else if (drift > 1e-6) fail('K2', 'dunya serveti degisti', '0', n2(drift));
    else ok('K2', `alici -${n2(beforeBuyer - buyer.gold)}, satici havuzu`
      + ` +${n2(home.politics.privateCapital - beforePool)} (net 0)`);
    if (result && Math.abs(company.cash - beforeCash) > 1e-9) {
      fail('K2', 'SIRKET de bedeli aldi (para cogaldi)', '0', n2(company.cash - beforeCash));
    } else if (result) ok('K2', 'sirketin kasasina tek kurus girmedi');
  }
}

// ----------------------------------------------------------------- K3, K7 --
{
  console.log('\n-- K3/K7 temettu gercek kardan gelir, savasta donar ---------');
  const game = headless('CO-3');
  for (let i = 0; i < 220; i++) game.turns.endTurn();
  const world = game.world;
  // Zengin bir ulkeyi birden cok yabanci sirkete ortak et.
  const buyer = [...world.nations].filter((n) => n.alive)
    .sort((a, b) => b.gold - a.gold)[0];
  let bought = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const company = pickTarget(world, buyer);
    if (!company) break;
    if (!buyShares(game, buyer, company, 0.05)) break;
    bought++;
  }
  console.log(`  ${buyer.name} ${bought} dilim aldi.`);
  for (let i = 0; i < 6; i++) game.turns.endTurn();

  let paidOut = 0;
  let received = 0;
  let overWithheld = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    paidOut += nation.economy.dividendsOut ?? 0;
    received += nation.economy.ledger?.dividendRevenue ?? 0;
    // Temettu ust sinifin GERCEK sermaye gelirini asamaz.
    const upper = Math.max(0,
      Math.max(1, (nation.economy.baseOutputValue ?? 0) * 0.35) * 0.25
      + (nation.economy.factoryProfit ?? 0) * 0.5);
    if ((nation.economy.capitalWithheld ?? 0) > upper + 1e-6) {
      overWithheld = Math.max(overWithheld, (nation.economy.capitalWithheld ?? 0) - upper);
    }
  }
  const gap = Math.abs(paidOut - received);
  console.log(`  odenen ${n2(paidOut)} / alinan ${n2(received)}`);
  if (bought === 0) console.log('  uyari: hic pay alinamadi, K3 zayif kosuldu.');
  if (gap > 1e-6) fail('K3', 'odenen ile alinan temettu tutmuyor', '0', n2(gap));
  else ok('K3', 'odeyen ile alan birebir esit — temettu basilmiyor');
  if (overWithheld > 0) fail('K3', 'gercek sermaye gelirinden fazlasi dagitildi', '0', n2(overWithheld));
  else ok('K3', 'dagitim ust sinifin gercek sermaye gelirini asmiyor');

  // Savas: dusman ortaga temettu YOK, oncelik YOK.
  const victim = world.nations.find((n) => n.alive && n.id !== buyer.id
    && (n.economy.companies ?? []).some((c) => stakeOf(c, buyer.id) > 0));
  if (!victim) {
    console.log('  K7 atlandi: buyer hicbir ulkede ortak degil.');
  } else {
    declareWar(game, victim.id, buyer.id, { manual: true });
    for (let i = 0; i < 3; i++) game.turns.endTurn();
    let leaked = 0;
    for (const company of victim.economy.companies ?? []) {
      if (stakeOf(company, buyer.id) <= 0) continue;
      // Savasta pay DURUR (silinmez) ama akis kesilir.
      if ((company.dividend ?? 0) > 0 && company.frozen !== true) leaked++;
    }
    const stillHeld = (victim.economy.companies ?? [])
      .filter((c) => stakeOf(c, buyer.id) > 0).length;
    // Onceligi mala gore olcmek yaniltir: alici ayni mali ureten BASKA
    // (dusman olmayan) sirkette de ortak olabilir. Dogru olcut, dusman
    // sirketin agirliga KATKI YAPMAMASI: dusman disi paylardan beklenen
    // tablo, gercek tabloyla birebir tutmali.
    const expected = {};
    for (const host of world.nations) {
      if (!host.alive || host.id === buyer.id) continue;
      if (atWar(world, host.id, buyer.id)) continue;
      for (const company of host.economy.companies ?? []) {
        const share = stakeOf(company, buyer.id);
        if (!(share > 0) || company.defunct) continue;
        for (const goodId in company.outputs) {
          if (!(company.outputs[goodId] > 0)) continue;
          expected[goodId] = Math.min(0.20, (expected[goodId] ?? 0) + share * 0.35);
        }
      }
    }
    let priorityLeak = 0;
    const actual = buyer.economy.priorityAccess ?? {};
    for (const goodId of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (Math.abs((expected[goodId] ?? 0) - (actual[goodId] ?? 0)) > 1e-9) priorityLeak++;
    }
    console.log(`  savasta elde kalan pozisyon: ${stillHeld} (silinmemeli)`);
    if (!atWar(world, victim.id, buyer.id)) console.log('  uyari: savas acilamadi.');
    else if (leaked) fail('K7', 'dusman ortaga temettu akiyor', '0', `${leaked} sirket`);
    else ok('K7', 'dusman ortagin temettusu donduruldu');
    if (priorityLeak) {
      fail('K7', 'dusman sirket hala oncelik veriyor', '0 sapan mal', `${priorityLeak} mal`);
    } else ok('K7', 'dusman sirketin oncelik katkisi tam olarak sifir');
    if (stillHeld === 0) fail('K7', 'savas pozisyonlari sildi', '> 0', '0');
  }
}

// ----------------------------------------------------------------- K4, K5 --
{
  console.log('\n-- K4/K5 sahiplik bedava mal vermez, mal parayla alinir -----');
  const game = headless('CO-4');
  for (let i = 0; i < 200; i++) game.turns.endTurn();
  const world = game.world;
  const buyer = [...world.nations].filter((n) => n.alive).sort((a, b) => b.gold - a.gold)[0];
  for (let attempt = 0; attempt < 15; attempt++) {
    const company = pickTarget(world, buyer);
    if (!company || !buyShares(game, buyer, company, 0.05)) break;
  }
  for (let i = 0; i < 5; i++) game.turns.endTurn();

  let overImport = 0;
  let overFulfil = 0;
  let priced = 0;
  let worstPrice = 0;
  for (const id of GOOD_IDS) {
    let imports = 0;
    let exports = 0;
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const flow = nation.economy.goodsFlow[id];
      imports += flow.imports ?? 0;
      exports += flow.exports ?? 0;
      // Kimse talebinden fazlasini ithal edemez ve karsilanan talebi asamaz.
      if ((flow.imports ?? 0) > (flow.demand ?? 0) + 1e-6) overImport++;
      if ((flow.fulfilled ?? 0) > (flow.demand ?? 0) + 1e-6) overFulfil++;
    }
    if (imports > exports + 1e-6) {
      worstPrice = Math.max(worstPrice, imports - exports);
    }
  }
  // K5: HERKES ODER. Dis hesap kapanisi (trade.settlement) dunya toplaminda
  // ancak Sithalat degeri == Sihracat degeri ise para yaratmaz — ayricalikli
  // erisim bu esitligi bozmamali. Fiyati kosu aninda yeniden okumak yaniltir
  // (updatePrices ticaretten SONRA kosar), o yuzden dogrudan defter kalemleri
  // karsilastirilir.
  let importValue = 0;
  let exportValue = 0;
  let settlement = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    importValue += nation.economy.trade?.importValue ?? 0;
    exportValue += nation.economy.trade?.exportValue ?? 0;
    settlement += nation.economy.trade?.settlement ?? 0;
    priced++;
  }
  const worstValue = Math.max(Math.abs(importValue - exportValue), Math.abs(settlement));
  const access = Object.entries(buyer.economy.priorityAccess ?? {});
  console.log(`  ${buyer.name} oncelikli mal sayisi: ${access.length}`
    + (access.length ? ` (en yuksek agirlik ${(Math.max(...access.map((e) => e[1])) * 100).toFixed(1)}%)` : ''));
  if (overImport) fail('K4', 'talebinden fazla mal geldi', '0', `${overImport} satir`);
  else if (overFulfil) fail('K4', 'karsilanan talep talebi asti', '0', `${overFulfil} satir`);
  else if (worstPrice > 1e-6) fail('K4', 'ithalat ihracati asti (mal yaratildi)', '0', n2(worstPrice));
  else ok('K4', 'ithalat <= ihracat ve <= talep — bedava mal yok');
  if (worstValue > 1e-6) {
    fail('K5', 'dis hesap kapanisi sifirlanmiyor (para yaratiliyor)', '0',
      `Simport-Sexport = ${(importValue - exportValue).toExponential(2)},`
      + ` Ssettlement = ${settlement.toExponential(2)}`);
  } else {
    ok('K5', `${priced} ulke: Sithalat = Sihracat = ${n2(importValue)}, net kapanis 0`
      + ' — oncelikli alici da tam fiyat oder');
  }
}

// ----------------------------------------------------------------- K6 -----
{
  console.log('\n-- K6 yabanci sahiplik tavanlari ----------------------------');
  const game = headless('CO-6');
  for (let i = 0; i < 200; i++) game.turns.endTurn();
  const world = game.world;
  const buyer = [...world.nations].filter((n) => n.alive).sort((a, b) => b.gold - a.gold)[0];
  buyer.gold = 500000; // tavani PARA ile asmaya calis: asamamali.
  let attempts = 0;
  for (let round = 0; round < 60; round++) {
    const company = pickTarget(world, buyer);
    if (!company) break;
    if (!buyShares(game, buyer, company, 0.5)) break;
    attempts++;
  }
  let breaches = 0;
  let worst = 0;
  let capped = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const company of nation.economy.companies ?? []) {
      const cap = foreignOwnershipCap(nation, company.sector);
      const share = foreignShare(company);
      if (share > 0) capped++;
      if (share > cap + 1e-9) { breaches++; worst = Math.max(worst, share - cap); }
    }
  }
  console.log(`  ${attempts} alim denemesi, ${capped} sirkette yabanci pay var`);
  if (breaches) fail('K6', 'tavan asildi', 'yabanciPay <= tavan', `${breaches} sirket, +${(worst * 100).toFixed(1)}p`);
  else ok('K6', 'sinirsiz para bile tavani asamiyor');

  // Kamulastirma: tazminatsiz el koyma para korur ve sohret yakar.
  const target = allCompanies(world).find((c) => foreignShare(c) > 0.02);
  if (!target) console.log('  kamulastirma atlandi: yabanci payli sirket yok.');
  else {
    const home = world.nations[target.home];
    const before = worldWealth(world);
    const beforeInfamy = home.infamy ?? 0;
    const stake = foreignShare(target);
    const result = nationalize(game, home, target, 'seizure');
    const after = worldWealth(world);
    if (!result) fail('K6', 'kamulastirma calismadi', 'sonuc', 'null');
    else if (Math.abs(after - before) > 1e-6) {
      fail('K6', 'kamulastirma dunya servetini degistirdi', '0', n2(after - before));
    } else if (foreignShare(target) > 1e-9) {
      fail('K6', 'kamulastirmadan sonra yabanci pay kaldi', '0', foreignShare(target));
    } else if ((home.infamy ?? 0) <= beforeInfamy) {
      fail('K6', 'tazminatsiz el koymanin diplomatik bedeli yok', 'infamy artmali', 'artmadi');
    } else {
      ok('K6', `%${(stake * 100).toFixed(1)} devralindi, sohret`
        + ` ${n2(beforeInfamy)} -> ${n2(home.infamy)}, servet degismedi`);
    }
  }
}

// ------------------------------------------------------------ K8, K9, K10 --
{
  console.log('\n-- K8/K9/K10 kayit-yukleme, determinizm, ozel yatirim -------');
  // Kayit icerigi ve sahiplik ayni surecte sinanir (tur ilerletilmiyor).
  const game = headless(SAVE_SEED);
  for (let i = 0; i < WEEKS_BEFORE; i++) game.turns.endTurn();
  const factoriesBefore = game.world.nations.reduce(
    (sum, n) => sum + (n.economy?.factories?.length ?? 0), 0,
  );
  const buyer = openPositions(game);
  const beforeOwn = ownershipSnapshot(game.world);
  const beforeCount = allCompanies(game.world).length;

  const data = JSON.parse(JSON.stringify(serialize(game)));
  const loaded = headless(SAVE_SEED);
  if (!deserialize(loaded, data)) {
    fail('K8', 'kayit yuklenemedi', 'true', 'false');
  } else {
    const afterOwn = ownershipSnapshot(loaded.world);
    const afterCount = allCompanies(loaded.world).length;
    if (afterOwn !== beforeOwn) fail('K8', 'yuklemede sahiplik degisti', 'ayni', 'farkli');
    else if (afterCount !== beforeCount) {
      fail('K8', 'yuklemede sirket sayisi degisti', String(beforeCount), String(afterCount));
    } else if (!loaded.world.nations[buyer].delegation?.budget) {
      fail('K8', 'AUTO anahtarlari yuklemede kayboldu', 'budget=true', 'false');
    } else {
      const stakes = allCompanies(loaded.world).filter((c) => foreignShare(c) > 0).length;
      ok('K8', `${afterCount} sirket, ${stakes} yabanci pozisyon ve AUTO anahtarlari birebir dondu`);
    }
  }

  // K9 AYRI SURECLERDE: kesintisiz kosu ile kayittan devam eden kosu.
  const a = worker('continuous');
  const b = worker('reloaded');
  if (a === b) {
    ok('K9', `${WEEKS_AFTER} hafta sonra iki bagimsiz surecin parmak izi ayni`);
  } else {
    let at = 0;
    while (at < a.length && a[at] === b[at]) at++;
    fail('K9', 'kayit/yukleme gelecegi dallandirdi', 'ayni parmak izi',
      `ilk fark @${at}: kesintisiz "...${a.slice(Math.max(0, at - 30), at + 30)}"`
      + ` / yuklenmis "...${b.slice(Math.max(0, at - 30), at + 30)}"`);
  }

  for (let i = 0; i < WEEKS_AFTER; i++) game.turns.endTurn();
  const factoriesAfter = game.world.nations.reduce(
    (sum, n) => sum + (n.economy?.factories?.length ?? 0), 0,
  );
  const built = factoriesAfter - factoriesBefore;
  let attributed = 0;
  for (const n of game.world.nations) {
    for (const project of n.construction?.projects ?? []) if (project.companyId) attributed++;
  }
  if (built <= 0) fail('K10', 'ozel/devlet yatirimi durdu', '> 0 yeni tesis', String(built));
  else {
    ok('K10', `${WEEKS_AFTER} haftada ${built} yeni tesis kuruldu,`
      + ` ${attributed} acik proje bir sirkete yazili`);
  }
}

// ---------------------------------------------------------- K12, K13 ------
{
  console.log('\n-- K12/K13 AUTO ON yasal sinirlar, AUTO OFF elle kontrol ----');
  const game = headless('CO-12');
  for (let i = 0; i < 120; i++) game.turns.endTurn();
  const world = game.world;
  const me = world.nations.find((n) => n.alive && n.economy?.factories?.length);
  game.turns.playerNation = me.id;

  // AUTO OFF: hukumet oyuncunun kaldiraclarina DOKUNMAZ.
  me.economy.tariff = 31;
  me.economy.taxes.upper = 27;
  const socialBefore = { ...me.economy.social };
  for (let i = 0; i < 30; i++) game.turns.endTurn();
  const untouched = me.economy.tariff === 31 && me.economy.taxes.upper === 27
    && JSON.stringify(me.economy.social) === JSON.stringify(socialBefore);
  if (!untouched) {
    fail('K13', 'AUTO kapaliyken hukumet kaldiraclari oynatti',
      'tarife 31 / ust vergi 27 / sosyal ayni',
      `tarife ${me.economy.tariff} / ust vergi ${me.economy.taxes.upper}`);
  } else ok('K13', 'AUTO kapali: 30 hafta boyunca hicbir kaldirac oynamadi');

  // AUTO ON: kaldiraclar oynar ama YASAL bantta kalir, sicramaz.
  setDelegation(game, me, 'budget', true);
  setDelegation(game, me, 'trade', true);
  const startTariff = me.economy.tariff;
  let maxStep = 0;
  let previous = startTariff;
  let outOfBand = 0;
  let taxOutOfBand = 0;
  for (let i = 0; i < 60; i++) {
    game.turns.endTurn();
    maxStep = Math.max(maxStep, Math.abs(me.economy.tariff - previous));
    previous = me.economy.tariff;
    const limits = fiscalPolicyLimits(me);
    if (me.economy.tariff < limits.tariffMin || me.economy.tariff > limits.tariffMax) outOfBand++;
    for (const classId of ['lower', 'middle', 'upper']) {
      const value = me.economy.taxes[classId];
      if (value < 0 || value > 100) taxOutOfBand++;
    }
  }
  const moved = me.economy.tariff !== startTariff
    || me.economy.taxes.upper !== 27
    || JSON.stringify(me.economy.social) !== JSON.stringify(socialBefore);
  const note = me.delegation?.last?.budget ?? me.delegation?.last?.trade ?? null;
  console.log(`  tarife ${startTariff}% -> ${me.economy.tariff}%,`
    + ` en buyuk haftalik adim ${maxStep} puan`);
  if (note) console.log(`  son otomatik eylem: ${note.text} (${note.reason})`);
  if (!moved) fail('K12', 'AUTO acikken hukumet hicbir sey yapmadi', 'bir kaldirac oynamali', 'oynamadi');
  else if (outOfBand) fail('K12', 'tarife yasal bandin disina cikti', '0', `${outOfBand} hafta`);
  else if (taxOutOfBand) fail('K12', 'vergi araligin disina cikti', '0', `${taxOutOfBand} olcum`);
  else if (maxStep > 2) fail('K12', 'tarife bir haftada sicradi (salinim)', '<= 2 puan', `${maxStep} puan`);
  else ok('K12', 'AUTO acik: yasal bantta, haftada en fazla 2 puan surunerek');

  // AUTO OFF geri: anahtar kapaninca kontrol ayni hafta oyuncuya doner.
  setDelegation(game, me, 'budget', false);
  setDelegation(game, me, 'trade', false);
  me.economy.tariff = 12;
  me.economy.taxes.middle = 19;
  for (let i = 0; i < 20; i++) game.turns.endTurn();
  if (me.economy.tariff !== 12 || me.economy.taxes.middle !== 19) {
    fail('K13', 'AUTO kapatildiktan sonra hukumet hala oynatiyor', 'tarife 12 / orta vergi 19',
      `tarife ${me.economy.tariff} / orta vergi ${me.economy.taxes.middle}`);
  } else ok('K13', 'AUTO kapatilinca kontrol ANINDA oyuncuya dondu');
}

console.log(`\n${'='.repeat(74)}`);
console.log('BULGU OZETI');
console.log('='.repeat(74));
if (!findings.length) console.log('  Bu kosuda bulgu yok.');
else for (const item of findings) console.log(`  - ${item}`);
process.exit(findings.length ? 1 : 0);
