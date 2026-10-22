// DİPLOMASİ DENETİMİ — sözler, talepler, vassal özerkliği (TASARIM §12;
// şartname scripts/audit/_tmp/pass/design/diplomacy.md §18.3).
//
// Üç katman:
//   DEĞİŞMEZLER (haftalık; bozulursa CRITICAL): sarkaç yok, pakt bağlar,
//     vassalın dış siyaseti yok, simetri, aralıklar, masa kayıtları
//     bayatlamaz, cümle testi (parçalar toplamı = karar sayısı), her
//     savunucu ya katıldı ya mazeretli ya oyuncuya çağrı aldı.
//   KALDIRAÇ SAĞLIĞI (sayaçlar; üç tohumda 0 ise HIGH "ölü kaldıraç"):
//     YZ garantisi, YZ paktı, fesih, talep / verme / ret-savaş / geri adım,
//     özerklik 50, vassal çağrısı, kopuş; karar dönmeleri (garantör, bağ,
//     ilişki eşiği, pakt atlama) — aynı koşuda karşı-olgusal, tohum gürültüsü yok.
//   ARALIKLAR: verme talebin %10-60'ı, 10. yılda YZ garantisi ≤ 16/tohum,
//     20. yılda vassal çiftleri `DIP_ARMS=none` koşusunun ≥ %70'i (--paired).
//   OYUNCU KALDIRAÇLARI (--active, şartname §18.5'in diplomatı): pakt, fesih
//     ve pakt atlama yalnız oyuncuyla yaşar (YZ-YZ paktı ölçüldü, silindi);
//     pakt atlama küçük oyuncuda (--small) sınanır. Diplomat iki
//     elçi yollar (ilki bizden güçlü en tehlikeli komşuya, ikincisi en
//     çekiciye), o komşuya pakt önerir, bir küçük komşuya garanti verir,
//     bakanlığın kabul ettiğini kabul eder ve her çağrıya katılır. Şartnamenin
//     diplomatı elçiyi yalnız çekiciliğe göre yolluyor, pakt önermiyordu: o
//     haliyle 3 tohum × 20 yılda tek pakt imzalandı, pakt ve ilişki eşiği
//     kaldıraçları hiç sınanmadı.
//
// Kullanım:
//   node scripts/audit/diplomacy-audit.mjs [yıl=20] [tohumlar=STAT1,STAT2,STAT3] [--player|--active] [--small] [--paired] [--size=78x62]
// `DIP_ARMS` ortam değişkenine uyar (tezgâh). Varsayılan 160×96 (oyunun
// dünyası; tohum başına ~4 dk): şartname 78×62 BORDER1-3 diyordu ama küçük
// tezgâhta 3 tohum × 20 yılda 2 talep düşüyor, verme ve özerklik 50 hiç
// görünmüyor — kaldıraç sağlığı orada ölçülemez.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  headless, passivePlayer, section, sub, table, finding, reportFindings,
} from './harness.mjs';
import { attackerCount, hostile, relation, warBlockers } from '../../src/game/diplomacy.js';
import { allianceAppeal, allianceVerdict, alliesOf } from '../../src/game/alliances.js';
import {
  autonomyOf, defendersOf, guaranteesGiven, napsOf, regardOf, relationsBreakdown, vassalTreatyOf,
} from '../../src/game/relations.js';
import {
  answerPendingDelegated, giveGuarantee, guaranteeBlockers, proposeNap, resolvePending, sendEnvoy, setOddsProbe,
} from '../../src/game/pacts.js';
import { envoyBlockers, pendingFor } from '../../src/game/relations.js';
import { nationStrength } from '../../src/game/diplomacy.js';
import { DIP_AI, NAP, WAR_GATE } from '../../src/game/dipDefs.js';
import { makeRng } from '../../src/core/rng.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const YEARS = Number(args[0] ?? 20);
const SEEDS = (args[1] ?? 'STAT1,STAT2,STAT3').split(',');
const WEEKS = Math.round(YEARS * 52);
const ACTIVE = flags.has('--active');
const SMALL = flags.has('--small');
const PLAYER = flags.has('--player') || ACTIVE || SMALL;
const PAIRED = flags.has('--paired');
const JSON_OUT = flags.has('--json');
// --size=78x62: küçük tezgâh (hızlı duman; kaldıraç sağlığı için az).
const SIZE = [...flags].find((f) => f.startsWith('--size='))?.slice(7).split('x').map(Number) ?? [160, 96];

if (!JSON_OUT) section(`DIPLOMASI DENETIMI — ${YEARS} yil × ${SEEDS.length} tohum${ACTIVE ? ' · aktif diplomat' : PLAYER ? ' · pasif oyuncu' : ''} · kollar ${process.env.DIP_ARMS ?? 'all'}`);

const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** Şartname §18.5 diplomatı: haftalık cevaplar, çeyrekte elçi ve garanti. */
function activeDiplomat(game, player, turn) {
  const world = game.world;
  for (const rec of [...pendingFor(world, player.id)]) {
    if (rec.kind === 'call') resolvePending(game, rec.id, 'join');
  }
  answerPendingDelegated(game, player);
  if (turn % 13 !== 0) return;
  const neighbours = world.nations.filter((n) => n.alive && n.id !== player.id && world.contacts?.[player.id]?.[n.id]);
  const mine = nationStrength(world, player);
  const threats = neighbours.filter((n) => nationStrength(world, n) > mine)
    .sort((x, y) => nationStrength(world, y) - nationStrength(world, x) || x.id - y.id);
  const byAppeal = neighbours
    .map((n) => ({ n, a: allianceAppeal(world, n, player) }))
    .filter((x) => Number.isFinite(x.a))
    .sort((x, y) => y.a - x.a || x.n.id - y.n.id)
    .map((x) => x.n);
  for (const n of [...threats.slice(0, 1), ...byAppeal]) {
    if ((player.envoys?.length ?? 0) >= 2) break;
    if (!envoyBlockers(world, player, n.id).length) sendEnvoy(game, player, n.id);
  }
  for (const n of threats) {
    if (napsOf(player, turn).length >= NAP.MAX) break;
    proposeNap(game, player, n.id);
  }
  if (!guaranteesGiven(player).length) {
    const small = neighbours
      .filter((n) => !guaranteeBlockers(world, player, n, turn).length)
      .sort((x, y) => nationStrength(world, x) - nationStrength(world, y) || x.id - y.id)[0];
    if (small) giveGuarantee(game, player, small.id);
  }
}

function runSeed(seed) {
  const game = headless(seed, SIZE ? { cols: SIZE[0], rows: SIZE[1] } : {});
  const world = game.world;
  if (PLAYER) {
    world.playerNation ??= world.nations.find((n) => n.alive)?.id ?? 0;
    // --small: oyuncu küçük bir devlettir (toprakça alt çeyrek). Pakt ve
    // elçinin caydırıcılığı ancak saldırılabilecek oyuncuda sınanır; büyük
    // bir devletle 3 tohum × 20 yılda tek karar dönmedi.
    if (SMALL) {
      const ranked = world.nations.filter((n) => n.alive && n.tiles > 0).sort((x, y) => x.tiles - y.tiles || x.id - y.id);
      world.playerNation = ranked[Math.floor(ranked.length / 4)]?.id ?? world.playerNation;
    }
  }
  const after = PLAYER ? passivePlayer(game) : null;
  const violations = {};
  const bump = (bag, key, by = 1) => { bag[key] = (bag[key] ?? 0) + by; };
  const violate = (key, sample) => {
    const v = (violations[key] ??= { count: 0, samples: [] });
    v.count++;
    if (v.samples.length < 3) v.samples.push(sample);
  };
  const levers = {};
  // Karar dönmeleri: ai.js hedef döngüsü her değerlendirmeyi sondaya bildirir.
  setOddsProbe((nation, other, odds, kind) => {
    const p = odds.parts;
    const denom = Math.max(1, p.target + WAR_GATE.ALLY_WEIGHT * (p.allied
      + p.guarantors.reduce((s, g) => s + g.strength, 0) + p.bonds.reduce((s, b) => s + b.strength, 0)));
    const myPower = odds.ratio * denom;
    const without = (drop) => myPower / Math.max(1, denom - WAR_GATE.ALLY_WEIGHT * drop);
    if (kind === 'pact') { if (odds.eligible) bump(levers, 'flip:pact-skip'); return; }
    if (!odds.eligible) {
      const g = p.guarantors.reduce((s, x) => s + x.strength, 0);
      const b = p.bonds.reduce((s, x) => s + x.strength, 0);
      if (g > 0 && without(g) >= odds.needed) bump(levers, 'flip:guarantor');
      if (b > 0 && without(b) >= odds.needed) bump(levers, 'flip:bond');
    }
  });

  const formed = new Map();   // pairKey -> son kurulma haftası
  const broke = new Map();    // pairKey -> son bozulma haftası
  const allianceSet = () => {
    const s = new Set();
    for (const n of world.nations) for (const id of alliesOf(n)) s.add(pairKey(n.id, id));
    return s;
  };
  let prevAlliances = allianceSet();
  const crisisSnap = () => {
    const m = new Map();
    for (let a = 0; a < world.nations.length; a++) {
      for (let b = a + 1; b < world.nations.length; b++) {
        const r = world.relations[a]?.[b];
        if (r && (r.state === 'crisis' || r.state === 'war')) m.set(`${a}-${b}`, r);
      }
    }
    return m;
  };
  let prevHostile = crisisSnap();
  let pendingCheck = [];
  let historySeen = 0;
  let autonomyMax = 0;
  const autonomyAbove50 = new Set();
  let unaccounted = 0;
  let accounted = 0;
  let guaranteesAtYear10 = null;
  const rng = makeRng(`dipaudit-${seed}`);

  for (let week = 1; week <= WEEKS; week++) {
    game.turns.endTurn();
    after?.();
    const turn = game.turns.turn;
    if (ACTIVE && after.player.alive) activeDiplomat(game, after.player, turn);

    // 1) Sarkaç: kur → boz → kur 104 hafta içinde olmamalı (YZ çiftleri).
    const now = allianceSet();
    for (const k of now) {
      if (prevAlliances.has(k)) continue;
      const lastForm = formed.get(k);
      const lastBreak = broke.get(k);
      if (lastForm != null && lastBreak != null && lastBreak > lastForm && turn - lastForm <= 104) {
        violate('flip-flop', `${k} kuruldu ${lastForm}, bozuldu ${lastBreak}, yeniden ${turn}`);
      }
      formed.set(k, turn);
    }
    for (const k of prevAlliances) {
      if (now.has(k)) continue;
      const [a, b] = k.split('-').map(Number);
      if (world.nations[a].alive && world.nations[b].alive) broke.set(k, turn);
    }
    prevAlliances = now;

    // 2-5) Pakt bağlar, vassal dış siyaseti, simetri, aralıklar.
    for (const n of world.nations) {
      if (!n.alive) continue;
      for (const t of napsOf(n, turn)) {
        if (hostile(world, n.id, t.partner)) violate('nap-integrity', `${n.id}↔${t.partner} pakt varken düşman`);
        const mirror = (world.nations[t.partner]?.treaties ?? []).find((x) => x.type === 'NAP' && x.partner === n.id);
        if (!mirror || mirror.until !== t.until) violate('symmetry', `NAP ${n.id}→${t.partner} aynası yok/farklı`);
      }
      for (const id of alliesOf(n)) {
        if (!(world.nations[id]?.treaties ?? []).some((x) => x.type === 'ALLIANCE' && x.partner === n.id)) {
          violate('symmetry', `ALLIANCE ${n.id}→${id} aynası yok`);
        }
      }
      if (DIP_AI.vassals && vassalTreatyOf(n, turn)) {
        if (alliesOf(n).length || napsOf(n, turn).length || guaranteesGiven(n).length) {
          violate('vassal-foreign-policy', `vassal ${n.id} hâlâ ittifak/pakt/garanti tutuyor`);
        }
      }
      const autonomy = autonomyOf(world, n.id, turn);
      if (autonomy != null) {
        autonomyMax = Math.max(autonomyMax, autonomy);
        if (!(autonomy >= 0 && autonomy <= 100)) violate('ranges', `özerklik ${n.id} = ${autonomy}`);
        if (autonomy >= 50 && !autonomyAbove50.has(n.id)) { autonomyAbove50.add(n.id); bump(levers, 'autonomy≥50'); }
      }
      if (!Number.isFinite(n.power) || n.power < 0) violate('ranges', `SG ${n.id} = ${n.power}`);
      for (const key of Object.keys(n.regard ?? {})) {
        for (const e of n.regard[key]) if (!Number.isFinite(e[1]) || !Number.isFinite(e[2])) violate('ranges', `defter NaN ${n.id}/${key}`);
      }
    }
    // 6) Masa: süresi geçmiş ya da ölüye yazılmış kayıt yok.
    for (const rec of world.diplo?.pending ?? []) {
      if (turn > rec.expires + 1) violate('stale-pending', `#${rec.id} ${rec.kind} expires ${rec.expires}, şimdi ${turn}`);
      if (!world.nations[rec.to]?.alive) violate('stale-pending', `#${rec.id} ölü alıcı ${rec.to}`);
    }

    // 8) Yeni ilanların savunucuları: katıldı, mazeretli ya da oyuncuya çağrı.
    // Bir hafta SONRA bakılır: siyaset evresindeki kıvılcım (eventCards
    // sparkGreatWar) çağrı kuyruğuna ertesi haftanın diplomasi evresinde girer.
    const hostileNow = crisisSnap();
    const player = game.turns.playerNation;
    // Mazeret: iki cephe, ilan kapısı ya da oyuncuya istemsiz cephe tavanı
    // (declareWar'ın kendi kapısı; warBlockers onu taşımaz). İlan haftasında
    // ya da bir hafta sonra geçerliyse sayılır: çağrı o aralıkta işlenir.
    const excuseOf = (id, aggressor) => {
      if (attackerCount(world, id) >= 2) return 'two-fronts';
      if (aggressor === player && attackerCount(world, player) >= 2) return 'player-cap';
      return warBlockers(world, id, aggressor, turn, 'alliance')[0] ?? null;
    };
    const fresh = [];
    for (const [k, r] of hostileNow) {
      if (prevHostile.has(k) && prevHostile.get(k) === r) continue;
      if (r.state !== 'crisis' || r.reason === 'alliance' || r.reason === 'independence') continue;
      const [a, b] = k.split('-').map(Number);
      const defender = r.aggressor === a ? b : a;
      // Savunucular İLAN ANINDAKİ bağlardır: bir hafta içinde kurulan ittifak
      // çağrılmaz (callAlliesToWar ilanda bir kez koşar).
      const defs = defendersOf(world, defender, r.reason ?? null, turn)
        .map((d) => ({ ...d, excuse: excuseOf(d.id, r.aggressor), at: turn }));
      fresh.push({ k, r, defender, defs });
    }
    const due = pendingCheck;
    pendingCheck = fresh;
    for (const { r, defender, defs } of due) {
      const aggressor = r.aggressor;
      if (!world.nations[defender]?.alive || !world.nations[aggressor]?.alive) continue;
      for (const { id, bond, excuse: excuseThen, at } of defs) {
        if (id === aggressor || !world.nations[id]?.alive) continue;
        const joined = hostile(world, id, aggressor);
        const called = (world.diplo?.pending ?? []).some((rec) => rec.kind === 'call' && rec.to === id && rec.aggressor === aggressor);
        const excused = excuseThen != null || excuseOf(id, aggressor) != null;
        if (joined || called || excused) accounted++;
        else {
          unaccounted++;
          if (unaccounted <= 3) {
            violate('defender-unaccounted', `ilan ${aggressor}→${defender} (${r.reason ?? 'aggression'}, hafta ${at}), savunucu ${id} (${bond}, ilişki ${relation(world, id, aggressor)?.state ?? '-'})`);
          }
        }
      }
    }
    prevHostile = hostileNow;

    // Kaldıraç sayaçları: tarih satırları (Faz 3 kaydedicisi / saplama).
    const history = world.history ?? [];
    for (; historySeen < history.length; historySeen++) {
      const title = history[historySeen].title;
      if (/guarantees the independence of/.test(title)) bump(levers, 'guarantees');
      else if (/sign a non-aggression pact/.test(title)) bump(levers, 'pacts');
      else if (/denounces its pact/.test(title)) bump(levers, 'denunciations');
      else if (/ demands .* from /.test(title)) bump(levers, 'demands');
      else if (/without a war/.test(title)) bump(levers, 'yields');
      else if (/backs down over/.test(title)) bump(levers, 'back-downs');
      else if (/strains against/.test(title)) bump(levers, 'autonomy80');
      else if (/leaves .*'s rule|rises for independence/.test(title)) bump(levers, 'breakaways');
      else if (/abandons/.test(title)) bump(levers, 'abandoned');
      else if (/conclude an alliance/.test(title)) bump(levers, 'alliances-formed');
      else if (/ends its alliance/.test(title)) bump(levers, 'alliances-ended');
    }
    // Talep ret → savaş ve vassal çağrısı: yeni ültimatomun sebebi.
    for (const [k, r] of hostileNow) {
      if (prevHostileWeek.has(k)) continue;
      if (r.reason === 'demand') bump(levers, 'refusal→war');
      if (r.reason === 'alliance') {
        const [a, b] = k.split('-').map(Number);
        const joiner = r.aggressor === a ? b : a;
        const bonded = world.nations.some((d) => d.alive && hostile(world, d.id, r.aggressor) && d.id !== joiner
          && (vassalTreatyOf(world.nations[joiner], turn)?.partner === d.id || vassalTreatyOf(d, turn)?.partner === joiner));
        if (bonded) bump(levers, 'vassal-call-joins');
      }
    }
    prevHostileWeek = new Set(hostileNow.keys());

    if (week === 520) {
      guaranteesAtYear10 = world.nations.reduce((s, n) => s + (n.alive ? guaranteesGiven(n).length : 0), 0);
    }
    // 7) Cümle testi: yılda bir, rastgele (tohumlu) çiftler.
    if (week % 52 === 0) {
      const alive = world.nations.filter((n) => n.alive);
      for (let i = 0; i < Math.ceil(200 / YEARS); i++) {
        const x = alive[Math.floor(rng() * alive.length)];
        const y = alive[Math.floor(rng() * alive.length)];
        if (!x || !y || x === y) continue;
        const br = relationsBreakdown(world, x.id, y.id, turn);
        const sum = br.parts.reduce((s, p) => s + p.value, 0);
        const value = regardOf(world, x.id, y.id, turn);
        if (Math.abs(Math.max(-100, Math.min(100, sum)) - value) > 1e-9) violate('sentence-relations', `${x.id}→${y.id} Σ${sum} ≠ ${value}`);
        if (br.parts.some((p) => !p.label)) violate('sentence-relations', `${x.id}→${y.id} etiketsiz parça`);
        const verdict = allianceVerdict(world, x, y, turn);
        if (!verdict.blockers.length) {
          const appeal = allianceAppeal(world, x, y, turn);
          if (Math.abs(verdict.sum - appeal) > 1e-9) violate('sentence-alliance', `${x.id}→${y.id} Σ${verdict.sum} ≠ ${appeal}`);
          if (verdict.parts.some((p) => !p.label)) violate('sentence-alliance', `${x.id}→${y.id} etiketsiz parça`);
        }
      }
    }
  }
  setOddsProbe(null);
  const vassalPairs = world.nations.filter((n) => n.alive && vassalTreatyOf(n, game.turns.turn)).length;
  const autonomies = world.nations.filter((n) => n.alive && vassalTreatyOf(n, game.turns.turn))
    .map((n) => Math.round(autonomyOf(world, n.id, game.turns.turn)));
  return {
    seed, violations, levers, unaccounted, accounted, guaranteesAtYear10, vassalPairs, autonomyMax: Math.round(autonomyMax), autonomies,
    nations: world.nations.filter((n) => n.alive).length,
    player: PLAYER ? { pending: world.diplo?.pending?.length ?? 0 } : null,
  };
}
let prevHostileWeek = new Set();

function runAll() {
  return SEEDS.map((seed) => { prevHostileWeek = new Set(); return runSeed(seed); });
}

const rows = runAll();
if (JSON_OUT) {
  console.log(`DIPAUDIT_JSON ${JSON.stringify(rows)}`);
  process.exit(0);
}

sub('DEĞİŞMEZLER');
const kinds = ['flip-flop', 'nap-integrity', 'vassal-foreign-policy', 'symmetry', 'ranges', 'stale-pending',
  'sentence-relations', 'sentence-alliance', 'defender-unaccounted'];
console.log(table(kinds.map((k) => ({ k, ...Object.fromEntries(rows.map((r) => [r.seed, r.violations[k]?.count ?? 0])) })), [
  { label: 'değişmez', get: (r) => r.k, right: false },
  ...rows.map((r) => ({ label: r.seed, get: (x) => x[r.seed] })),
]));
for (const k of kinds) {
  const total = rows.reduce((s, r) => s + (r.violations[k]?.count ?? 0), 0);
  if (!total) continue;
  const samples = rows.flatMap((r) => r.violations[k]?.samples ?? []).slice(0, 3).join(' | ');
  finding(k === 'defender-unaccounted' ? 'HIGH' : 'CRITICAL', `değişmez: ${k}`, '0 ihlal', `${total} ihlal`, samples);
}
console.log(`  savunucu muhasebesi: ${rows.reduce((s, r) => s + r.accounted, 0)} hesapta, ${rows.reduce((s, r) => s + r.unaccounted, 0)} açıkta`);

sub('KALDIRAÇ SAĞLIĞI');
const leverKeys = ['guarantees', 'pacts', 'denunciations', 'demands', 'yields', 'refusal→war', 'back-downs',
  'autonomy≥50', 'autonomy80', 'vassal-call-joins', 'breakaways', 'abandoned', 'alliances-formed', 'alliances-ended',
  'flip:guarantor', 'flip:bond', 'flip:pact-skip'];
console.log(table(leverKeys.map((k) => ({ k, ...Object.fromEntries(rows.map((r) => [r.seed, r.levers[k] ?? 0])) })), [
  { label: 'kaldıraç', get: (r) => r.k, right: false },
  ...rows.map((r) => ({ label: r.seed, get: (x) => x[r.seed] })),
]));
const live = (key) => rows.reduce((s, r) => s + (r.levers[key] ?? 0), 0);
// OYUNCU KALDIRAÇLARI yalnız --active koşusunda ölçülür. Pakt, fesih ve pakt
// atlama: YZ-YZ paktı ölçülüp silindi (pacts.aiPacts), pakt yalnız oyuncuyla
// imzalanır; tüm-YZ koşusunda 0 doğaldır. Pakt atlamayı küçük oyuncu görür
// (--active --small). İlişki eşiği (R2a) dokuz koşuda tek kararı
// döndürmedi ve silindi (TASARIM §12).
const armOf = {
  guarantees: 'guarantees', demands: 'demands', yields: 'demands',
  'refusal→war': 'demands', 'autonomy≥50': 'vassals', 'flip:guarantor': 'guarantees', 'flip:bond': 'vassals',
  ...(ACTIVE ? { pacts: 'pacts' } : {}),
  ...(ACTIVE && SMALL ? { 'flip:pact-skip': 'pacts' } : {}),
};
for (const [key, arm] of Object.entries(armOf)) {
  if (!DIP_AI[arm]) continue;
  if (!live(key)) finding('HIGH', `ölü kaldıraç: ${key}`, `${SEEDS.length} tohumda > 0`, '0', `kol ${arm}`);
}

sub('ARALIKLAR');
const demands = live('demands');
const yields = live('yields');
const yieldShare = demands ? yields / demands : 0;
console.log(`  verme / talep: ${yields}/${demands} = ${(yieldShare * 100).toFixed(1)}% (hedef %10-60)`);
if (DIP_AI.demands && demands >= 10 && (yieldShare < 0.10 || yieldShare > 0.60)) {
  finding('MEDIUM', 'talep hükmü', 'verme payı %10-60', `${(yieldShare * 100).toFixed(1)}%`, 'ya hep ret ya hep verme: hüküm bir zar değil, bir kayıt');
}
for (const r of rows) {
  console.log(`  ${r.seed}: 10. yılda YZ garantisi ${r.guaranteesAtYear10 ?? '-'} · ${YEARS}. yılda vassal çifti ${r.vassalPairs} (özerklik ${r.autonomies.join('/') || '-'}, en yüksek ${r.autonomyMax}) · ulus ${r.nations} · kopuş ${r.levers.breakaways ?? 0}`);
  if ((r.guaranteesAtYear10 ?? 0) > 16) finding('MEDIUM', 'garanti yoğunluğu', '10. yılda ≤ 16', String(r.guaranteesAtYear10));
  if ((r.levers.breakaways ?? 0) > 4) finding('MEDIUM', 'vassal kopuşu', 'tohum başına ≤ 4', String(r.levers.breakaways));
}
if (PAIRED) {
  const base = spawnSync(process.execPath, [fileURLToPath(import.meta.url), String(YEARS), SEEDS.join(','), '--json'], {
    env: { ...process.env, DIP_ARMS: 'none' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const line = (base.stdout ?? '').split('\n').find((l) => l.startsWith('DIPAUDIT_JSON '));
  if (line) {
    const none = JSON.parse(line.slice('DIPAUDIT_JSON '.length));
    for (const r of rows) {
      const b = none.find((x) => x.seed === r.seed);
      const share = b?.vassalPairs ? r.vassalPairs / b.vassalPairs : 1;
      console.log(`  ${r.seed}: vassal çifti ${r.vassalPairs} / none ${b?.vassalPairs ?? '-'} = ${(share * 100).toFixed(0)}%`);
      if (b?.vassalPairs >= 2 && share < 0.7) finding('MEDIUM', 'vassal çiftleri', '≥ %70 (none koşusuna göre)', `${(share * 100).toFixed(0)}%`);
    }
  }
}

console.log(`DIPAUDIT_JSON ${JSON.stringify(rows)}`);
process.exit(reportFindings() > 0 ? 1 : 0);
