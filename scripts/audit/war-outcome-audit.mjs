// Savas sonucu denetimi. Beta 2'nin en agir bulgusu: 68 yilda dunyada
// HICBIR SINIR degismedi.
//
// Kok neden iki koldu ve ikisi de olculdu:
//   1) Fiyat ile skor ayni para biriminde degildi. Tek bir kumenin bedeli
//      80-85'e cikabiliyordu, warscore tavani ise 100'du; orta olcekli bir
//      ulkenin butun kumelerinin toplam bedeli 700-900'du. 6.1 kat ustunlukle
//      uc yil savasan taraf +28 topluyor ve tek kume bile alamiyordu.
//   2) Masaya yalniz TAMAMEN isgal edilmis kume gelebiliyordu. 50 yillik
//      kosuda hicbir taraf hicbir kumenin son karesini alamadi (cephe hex hex
//      ilerliyor, savunan son kareyi birakmiyor), yani teklif hep bos kaliyor
//      ve her savas beyaz barisla kapaniyordu.
//
// Bu denetim iki kolu da SABITLER: kazanilan savas toprak getirmeli, kucuk
// zafer az, buyuk zafer daha cok getirmeli, cilizi basari absurt toprak
// isteyememeli.

import {
  headless, section, sub, table, n1, finding, reportFindings,
} from './harness.mjs';
import {
  MAX_WAR_SCORE, buildOffer, demandLimit, offerCost, offerRefusal, provinceKeyOf,
  provinceWarCost, signPeace, warExpectation, warScore,
} from '../../src/game/peace.js';
import { atWar, declareWar, recordWarCasualties } from '../../src/game/diplomacy.js';

section('SAVAS SONUCU / TOPRAK DEVRI DENETIMI');

/**
 * Ortak kurulum: iki komsu ulke savasa girer ve saldirgan kurbanin kumelerinin
 * `share` orani kadarini isgal eder. Cephe simulasyonu yerine dogrudan kontrol
 * atamasi kullanilir: olculen sey BARIS MASASI, muharebe degil.
 */
function occupiedWar(seed, share, weeks = 40) {
  const game = headless(seed);
  const world = game.world;
  for (let i = 0; i < weeks; i++) game.turns.endTurn();
  const ranked = world.nations
    .filter((n) => n.alive && n.tiles > 6)
    .sort((a, b) => b.tiles - a.tiles);
  // Temas halinde bir cift: isgal edilen kume gercekten sinir kumesi olsun.
  let pair = null;
  for (const a of ranked) {
    for (const b of ranked) {
      if (a.id === b.id) continue;
      if (world.contacts?.[a.id]?.[b.id]) { pair = [a, b]; break; }
    }
    if (pair) break;
  }
  if (!pair) pair = [ranked[0], ranked[1]];
  const [aggressor, victim] = pair;
  if (!atWar(world, aggressor.id, victim.id)) declareWar(game, aggressor.id, victim.id);

  const theirs = world.provinces.filter((p) => p.owner === victim.id && p.econ);
  const wanted = Math.max(1, Math.round(theirs.length * share));
  let taken = 0;
  for (const province of theirs) {
    if (taken >= wanted) break;
    for (const idx of province.tileIdx) world.tiles[idx].controller = aggressor.id;
    taken++;
  }
  return { game, world, aggressor, victim, occupied: taken, total: theirs.length };
}

// --- TEST 1: fiyat ile skor ayni para biriminde mi? ---
sub('TEST 1 — kume fiyati ulasilabilir bir skorla odenebiliyor mu?');
{
  const game = headless('WAROUT-PRICE');
  for (let i = 0; i < 60; i++) game.turns.endTurn();
  const world = game.world;
  const prices = world.provinces
    .filter((p) => p.owner >= 0 && p.econ)
    .map((p) => provinceWarCost(world, p))
    .sort((x, y) => x - y);
  const at = (f) => prices[Math.floor((prices.length - 1) * f)];
  console.log(table([{}], [
    { label: 'kume', get: () => prices.length },
    { label: 'en ucuz', get: () => at(0) },
    { label: 'ortanca', get: () => at(0.5) },
    { label: '%90', get: () => at(0.9) },
    { label: 'en pahali', get: () => at(1) },
  ]));
  // Ortanca kume, ulasilabilir bir zaferin (skor ~35) butcesine sigmali.
  if (at(0.5) > 35) {
    finding('CRITICAL', 'kume fiyati',
      'ortanca kume bedeli kazanilabilir bir skorla (35) odenebilmeli',
      `ortanca ${at(0.5)}`,
      'fiyat ile warscore ayni para biriminde degil — beta 2 bulgusu');
  } else if (at(1) > MAX_WAR_SCORE * 0.6) {
    finding('HIGH', 'kume fiyati tavani',
      "en pahali kume warscore tavaninin %60'ini asmamali",
      `en pahali ${at(1)} / ${MAX_WAR_SCORE}`);
  } else {
    console.log(`  -> Ortanca ${at(0.5)}, en pahali ${at(1)}; ikisi de warscore olceginde. DOGRU.`);
  }
  if (at(0) <= 0) {
    finding('HIGH', 'bedava kume', 'hicbir kume bedava olmamali', `en ucuz kume ${at(0)}`);
  }
}

// --- TEST 2: muzaffer saldirgan toprak alabiliyor mu? ---
sub('TEST 2 — kucuk zafer (kurbanin %25 kumesi isgal) toprak getiriyor mu?');
{
  const {
    game, world, aggressor, victim, occupied, total,
  } = occupiedWar('WAROUT-SMALL', 0.25);
  const score = warScore(world, aggressor.id, victim.id);
  const offer = buildOffer(world, aggressor.id, victim.id, { appetite: 1 });
  // nation.provinces sayaci haftalik sayimda tazelenir; devri dogrudan
  // kume sahipliginden okumak daha durust.
  const countOf = (id) => world.provinces.filter((p) => p.owner === id).length;
  const before = countOf(victim.id);
  console.log(`  ${aggressor.name} ${occupied}/${total} kumeyi isgal etti · warscore ${score}`
    + ` · kume tavani ${demandLimit(score)}`
    + ` · beklenti ${n1(warExpectation(world, aggressor.id, victim.id))}`);
  console.log(`  teklif: ${offer.demands.length} kume + ${offer.terms.length} sart`
    + ` · bedel ${offerCost(world, offer)}`);
  const refusal = offerRefusal(world, aggressor.id, victim.id, offer);
  const signed = refusal === null && signPeace(game, aggressor.id, victim.id, offer);
  const gained = world.provinces.filter((p) => p.owner === aggressor.id
    && offer.demands.includes(provinceKeyOf(p))).length;
  const after = countOf(victim.id);
  console.log(`  imza: ${signed ? 'EVET' : `HAYIR (${refusal})`} · devredilen kume ${gained}`);
  if (!signed) {
    finding('CRITICAL', 'muzaffer saldirgan',
      'kurbanin dortte birini isgal eden taraf bir baris imzalayabilmeli',
      `teklif reddedildi: ${refusal}`,
      'savas kazanmak islevsel olarak imkansiz — beta 2 bulgusu');
  } else if (gained < 1) {
    finding('CRITICAL', 'toprak devri',
      'kucuk bir zafer 1-3 kume devredebilmeli', `${gained} kume devredildi`,
      `warscore ${score}, isgal ${occupied}/${total}`);
  } else if (gained > 3) {
    finding('HIGH', 'kucuk zaferin bedeli',
      'kucuk zafer 3 kumeden fazlasini goturmemeli', `${gained} kume devredildi`);
  } else {
    console.log(`  -> Kucuk zafer ${gained} kume getirdi (1-3 araligi). DOGRU.`);
  }
  if (signed && after >= before) {
    finding('HIGH', 'sinir kaydi',
      'devirden sonra kurbanin kume sayisi azalmali', `${before} -> ${after}`);
  }
}

// --- TEST 3: buyuk zafer daha fazlasini getirir ---
sub('TEST 3 — buyuk zafer (%75 isgal) kucuk zaferden fazlasini getiriyor mu?');
{
  const rows = [];
  for (const [name, share] of [['kucuk', 0.25], ['buyuk', 0.75]]) {
    const set = occupiedWar('WAROUT-SCALE', share);
    const score = warScore(set.world, set.aggressor.id, set.victim.id);
    const offer = buildOffer(set.world, set.aggressor.id, set.victim.id, { appetite: 1 });
    rows.push({
      name,
      isgal: `${set.occupied}/${set.total}`,
      score,
      limit: demandLimit(score),
      kume: offer.demands.length,
      bedel: offerCost(set.world, offer),
    });
  }
  console.log(table(rows, [
    { label: 'zafer', get: (r) => r.name, right: false },
    { label: 'isgal', get: (r) => r.isgal },
    { label: 'warscore', get: (r) => r.score },
    { label: 'kume tavani', get: (r) => r.limit },
    { label: 'alinan kume', get: (r) => r.kume },
    { label: 'bedel', get: (r) => r.bedel },
  ]));
  if (rows[1].score <= rows[0].score) {
    finding('CRITICAL', 'zaferin olcegi',
      'daha genis isgal daha yuksek warscore vermeli',
      `kucuk ${rows[0].score} · buyuk ${rows[1].score}`);
  } else if (rows[1].kume <= rows[0].kume) {
    finding('HIGH', 'buyuk zaferin karsiligi',
      'buyuk zafer kucuk zaferden FAZLA kume goturmeli',
      `kucuk ${rows[0].kume} · buyuk ${rows[1].kume}`);
  } else {
    console.log(`  -> ${rows[0].kume} -> ${rows[1].kume} kume. DOGRU.`);
  }
}

// --- TEST 4: cilizi basari absurt toprak isteyemez ---
sub('TEST 4 — cilizi basari absurt toprak istiyor mu?');
{
  const { world, aggressor, victim } = occupiedWar('WAROUT-TINY', 0.05);
  const score = warScore(world, aggressor.id, victim.id);
  const limit = demandLimit(score);
  // Elle kurulmus acgozlu teklif: kurbanin en degerli alti kumesi.
  const greedy = {
    demands: world.provinces.filter((p) => p.owner === victim.id && p.econ)
      .sort((x, y) => provinceWarCost(world, y) - provinceWarCost(world, x))
      .slice(0, 6).map(provinceKeyOf),
    concessions: [],
    terms: [],
  };
  const refusal = offerRefusal(world, aggressor.id, victim.id, greedy);
  console.log(`  warscore ${score} · kume tavani ${limit}`);
  console.log(`  ${greedy.demands.length} kume isteyen teklif: ${refusal ?? 'KABUL EDILDI'}`);
  if (refusal === null) {
    finding('CRITICAL', 'absurt talep',
      'cilizi bir basari alti kume goturememeli', 'teklif kabul edildi');
  } else if (limit > 3) {
    finding('HIGH', 'kume tavani',
      'dusuk skorda kume tavani 3u asmamali', `tavan ${limit}, skor ${score}`);
  } else {
    console.log('  -> Cilizi basari absurt toprak satin alamiyor. DOGRU.');
  }
}

// --- TEST 5: baskent isgali ve ordu imhasi skoru hareket ettiriyor mu? ---
sub('TEST 5 — baskent ve ordu imhasi warscore uretiyor mu?');
{
  const { world, aggressor, victim } = occupiedWar('WAROUT-CAPITAL', 0.15);
  const base = warScore(world, aggressor.id, victim.id);

  const capital = world.nations[victim.id].capital;
  const savedController = capital.controller;
  capital.controller = aggressor.id;
  const withCapital = warScore(world, aggressor.id, victim.id);
  capital.controller = savedController;

  // Kurbanin sahadaki mevcudunun uc kati kadar asker yok edilmis sayilir:
  // "ordusu dagildi" durumu.
  let victimMen = 0;
  for (const unit of world.units) {
    if (unit.nationId !== victim.id) continue;
    for (const regiment of unit.regiments ?? []) victimMen += regiment.strength ?? 0;
  }
  recordWarCasualties(world, aggressor.id, victim.id, 0, Math.max(1000, victimMen * 3));
  const withAttrition = warScore(world, aggressor.id, victim.id);

  console.log(table([{}], [
    { label: 'taban skor', get: () => base },
    { label: '+ baskent', get: () => withCapital },
    { label: '+ ordu imhasi', get: () => withAttrition },
  ]));
  if (withCapital - base < 8) {
    finding('HIGH', 'baskent isgali',
      'dusman baskentini tutmak skoru belirgin sekilde arttirmali',
      `${base} -> ${withCapital}`);
  } else if (withAttrition - base < 8) {
    finding('HIGH', 'ordu imhasi',
      'dusman ordusunu yok etmek skoru belirgin sekilde arttirmali',
      `${base} -> ${withAttrition}`);
  } else {
    console.log(`  -> Baskent +${withCapital - base}, ordu imhasi +${withAttrition - base}. DOGRU.`);
  }
}

// --- TEST 6: YZ kendi basina sinir degistirebiliyor mu? ---
sub('TEST 6 — YZ, isgal ettigi topragi masada aliyor mu? (200 hafta)');
{
  const {
    game, world, aggressor, victim,
  } = occupiedWar('WAROUT-AI', 0.35);
  const before = world.provinces.map((p) => p.owner);
  const watched = new Set([aggressor.id, victim.id]);
  for (let i = 0; i < 200; i++) game.turns.endTurn();
  let changed = 0;
  let changedHere = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === world.provinces[i].owner) continue;
    changed++;
    if (watched.has(before[i]) || watched.has(world.provinces[i].owner)) changedHere++;
  }
  console.log(`  ${aggressor.name} - ${victim.name} savasi · hala savasta: `
    + `${atWar(world, aggressor.id, victim.id) ? 'evet' : 'hayir'}`);
  console.log(`  200 haftada sahibi degisen kume: ${changed} (bu cift: ${changedHere})`);
  if (changed === 0) {
    finding('CRITICAL', 'YZ baris masasi',
      'YZ, kazandigi savasi toprak devriyle kapatabilmeli',
      '200 haftada hicbir kume el degistirmedi',
      'beta 2 bulgusu: 68 yilda hicbir sinir degismedi');
  } else {
    console.log('  -> YZ barisi sinir degistiriyor. DOGRU.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
