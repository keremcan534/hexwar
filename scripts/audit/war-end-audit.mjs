// SAVAŞIN BİTİŞİ DENETİMİ — Kerem'in üç şikâyeti, ölçüyle.
//
//   1. "barışa geçince bir anda askerler başka ülkelerin içinde kalıyor ve
//      kurtaramıyorum" → barış imzalandığı ANDA ve sonraki haftanın sonunda
//      yabancı toprakta (savaşmadığı, geçişi olmadığı) kalan kara tümeni.
//      Oyuncunun barışı tur ARASINDA imzalanır (masa, kabul edilen teklif):
//      edilgen oyuncu teklifleri haftadan sonra kabul eder, aynı yol.
//   2. "dünyanın öbür ucundan çıkartma" → her denize biniş → karaya çıkış
//      olayı: denizde kaç hex, kaç deniz bölgesi, çıkış yeri kendi kıyımıza
//      ne kadar uzak; kim yaptı (YZ çıkarması, YZ komutası, oyuncunun AUTO
//      generali). Düşman kıyısına çıkış "çıkarma"dır; kendi kıyıya yer değiştirme.
//   3. "peacede çok az toprak alabiliyoruz" → barış başına el değiştiren küme.
//
// Kullanım: node scripts/audit/war-end-audit.mjs [yıl=15] [tohum,tohum=BORDER1]
//   WAREND_SIZE=160x96 (varsayılan) · WAREND_ACTIVE=0 edilgen oyuncu (yalnız
//   gelen teklifi kabul eder); varsayılan etkin: barışta yarım yıl geçince en
//   zayıf komşusuna savaş açar, kazandığını masaya getirir (Best deal + Sign,
//   ekranla aynı yol). Edilgen oyuncu 20 yılda hiç savaşmayabiliyor.
// Ölçüm (2026-11-23, 160×96 × 20 yıl × BORDER1-3): bkz. TASARIM §11.

import {
  headless, passivePlayer, section, sub, table, quantile, finding, reportFindings,
} from './harness.mjs';
import { atWar, declareWarNow, nationStrength, truceLeft } from '../../src/game/diplomacy.js';
import { BRANCH, STANCE, officersOf, setStance, setTarget } from '../../src/game/command.js';
import { controllerOf } from '../../src/game/control.js';
import { hasPassage } from '../../src/game/nationBirth.js';
import { buildOffer, offerRefusal, onPeace, signPeace, warScore } from '../../src/game/peace.js';
import { nodeNeighbors } from '../../src/world/provinceGraph.js';

const YEARS = Number(process.argv[2] ?? 15);
const SEEDS = (process.argv[3] ?? 'BORDER1').split(',');
const SIZE = (process.env.WAREND_SIZE ?? '160x96').split('x').map(Number);
const ACTIVE = process.env.WAREND_ACTIVE !== '0';
/** Düşman kıyısına inen yolculuğun "dünyanın öbür ucu" sayıldığı deniz hexi. */
const FAR_VOYAGE = 48;

section(`SAVAŞIN BİTİŞİ — ${YEARS} yıl × ${SEEDS.length} tohum (${SIZE.join('×')})${ACTIVE ? ' · etkin oyuncu' : ''}`);

/** Savaşmadığı ve geçişi olmadığı toprakta duran kara tümeni. */
function trespassing(world, unit) {
  if (unit.type?.domain !== 'land' || !unit.tile || unit.tile.terrain.water) return false;
  const holder = controllerOf(unit.tile);
  if (holder < 0 || holder === unit.nationId) return false;
  if (atWar(world, holder, unit.nationId)) return false;
  return !hasPassage(world, holder, unit.nationId);
}

/** Denizde ve rotası barıştaki bir ülkenin toprağında biten tümen. */
function deadCourse(world, unit) {
  if (unit.type?.domain !== 'land' || !unit.embarked) return false;
  const goal = unit.path?.length ? unit.path[unit.path.length - 1] : null;
  if (!goal || goal.terrain.water) return false;
  const holder = controllerOf(goal);
  if (holder < 0 || holder === unit.nationId) return false;
  return !atWar(world, holder, unit.nationId) && !hasPassage(world, holder, unit.nationId);
}

/** Oyuncu bu tümene eve dönüş emri verebilir mi (ekranın kullandığı kapı)? */
function orderable(game, unit) {
  const world = game.world;
  const canEnter = game.canEnterFor(unit);
  for (const near of nodeNeighbors(world, unit.tile)) {
    if (canEnter(near)) return true;
  }
  return false;
}

/** Kendi kontrolümüzdeki en yakın kara karesine hex uzaklığı (çıkış yerinin evden uzaklığı). */
function homeDistance(world, nationId, tile, skipProvince = -1) {
  let best = Infinity;
  for (const other of world.tiles) {
    if (other.terrain.water || !other.terrain.passable || other.provinceId === skipProvince) continue;
    if (other.owner !== nationId) continue;
    const d = world.wrapDistance(tile.q, tile.r, other.q, other.r);
    if (d < best) best = d;
  }
  return best;
}

function runSeed(seed) {
  const game = headless(seed, { cols: SIZE[0], rows: SIZE[1] });
  const world = game.world;
  const afterWeek = passivePlayer(game);
  const player = afterWeek.player;

  // --- 2. Biniş/iniş izi: her adım game.enterTile'dan geçer (movement.stepInto).
  const voyages = new Map();
  const landings = [];
  const enter = game.enterTile.bind(game);
  game.enterTile = (unit, tile) => {
    const from = unit.tile;
    if (unit.type?.domain === 'land' && from && tile) {
      if (!from.terrain.water && tile.terrain.water) {
        voyages.set(unit, {
          from, turn: game.turns.turn, steps: 0, zones: new Set(),
          who: unit.nationId === game.turns.playerNation ? 'player'
            : unit.directive?.landing != null ? 'ai-landing'
              : unit.directive ? 'ai-directive' : 'ai-command',
          goal: unit.path?.[unit.path.length - 1] ?? null,
        });
      }
      const voyage = voyages.get(unit);
      if (voyage && tile.terrain.water) {
        voyage.steps++;
        if (tile.seaZone >= 0) voyage.zones.add(tile.seaZone);
      }
      if (voyage && from.terrain.water && !tile.terrain.water) {
        voyages.delete(unit);
        // Düşman kıyısı: karayı düşman tutuyor ya da toprak düşmanın ve biz
        // kıyı başını tutuyoruz (öncünün ardından gelen dalga da çıkarmadır).
        const holder = controllerOf(tile);
        const enemyAt = (id) => id >= 0 && id !== unit.nationId && atWar(world, id, unit.nationId);
        const hostile = enemyAt(holder) || enemyAt(tile.owner);
        landings.push({
          who: voyage.who, hostile,
          steps: voyage.steps, zones: voyage.zones.size, weeks: game.turns.turn - voyage.turn,
          span: world.wrapDistance(voyage.from.q, voyage.from.r, tile.q, tile.r),
          // Düşman kıyısındaki çıkış yeri bizim en yakın karamızdan ne kadar uzak?
          home: hostile ? homeDistance(world, unit.nationId, tile) : 0,
        });
      }
    }
    return enter(unit, tile);
  };

  // --- 3. Barış başına el değiştiren küme.
  const peaces = [];
  const off = onPeace((_, event) => {
    peaces.push({
      demands: event.offer?.demands?.length ?? 0,
      concessions: event.offer?.concessions?.length ?? 0,
      terms: event.offer?.terms ?? [],
      white: event.white,
      player: event.a === game.turns.playerNation || event.b === game.turns.playerNation,
    });
  });

  // --- 1. Barış anı ve sonraki hafta.
  const weekly = { trespass: 0, deadCourse: 0, maxWeek: 0, weeksWith: 0 };
  const playerPeace = { count: 0, immediate: 0, stuck: 0, nextWeek: 0, atSea: 0 };
  let watchNextWeek = false;
  let lastPlayerPeace = -Infinity;
  const countPlayer = (fn) => world.units.filter((unit) => unit.nationId === player.id && fn(world, unit));

  const signedBetweenTurns = () => {
    // Masada imzalandı: tur arası. Sayım imzanın HEMEN ardından.
    playerPeace.count++;
    const here = countPlayer(trespassing);
    playerPeace.immediate += here.length;
    playerPeace.stuck += here.filter((unit) => !orderable(game, unit)).length;
    playerPeace.atSea += countPlayer(deadCourse).length;
    watchNextWeek = true;
  };

  for (let week = 0; week < YEARS * 52; week++) {
    game.turns.endTurn();
    if (watchNextWeek) {
      playerPeace.nextWeek += countPlayer(trespassing).length;
      watchNextWeek = false;
    }
    // Haftanın sonu: dünyadaki bütün tümenler.
    const t = world.units.filter((unit) => trespassing(world, unit)).length;
    const d = world.units.filter((unit) => deadCourse(world, unit)).length;
    weekly.trespass += t;
    weekly.deadCourse += d;
    weekly.maxWeek = Math.max(weekly.maxWeek, t);
    if (t) weekly.weeksWith++;

    if (!player.alive) continue;
    // Edilgen oyuncu: gelen teklifi kabul eder (harness), imza tur arası.
    const before = peaces.length;
    afterWeek();
    // Etkin oyuncu: barışta yarım yıl geçtiyse en zayıf komşusuna savaş açar
    // (generalleri ona döner, taarruzda), kazandığı ve en az bir yıldır süren
    // savaşı masaya getirir. Edilgen oyuncu 20 yılda hiç savaşmayabiliyor:
    // şikâyet 1 o zaman hiç sınanmazdı.
    if (ACTIVE) {
      const fighting = world.nations.some((n) => n.alive && n.id !== player.id && atWar(world, player.id, n.id));
      if (!fighting && world.turn - lastPlayerPeace >= 26 && world.turn >= 30) {
        const foes = world.nations
          .filter((n) => n.alive && n.id !== player.id && (world.contacts?.[player.id]?.[n.id] ?? 0) > 0
            && truceLeft(world, player.id, n.id, world.turn) <= 0)
          .sort((a, b) => nationStrength(world, a) - nationStrength(world, b) || a.id - b.id);
        for (const foe of foes.slice(0, 3)) {
          player.power = Math.max(player.power ?? 0, 500);
          if (!declareWarNow(game, player.id, foe.id, { manual: true })) continue;
          for (const general of officersOf(player, BRANCH.ARMY)) {
            setTarget(world, general, foe.id);
            setStance(world, general, STANCE.ADVANCE);
          }
          break;
        }
      }
      for (const foe of world.nations) {
        if (!foe.alive || foe.id === player.id || !atWar(world, player.id, foe.id)) continue;
        const since = world.relations[player.id][foe.id]?.since ?? world.turn;
        if (world.turn - since < 52 || warScore(world, player.id, foe.id) < 15) continue;
        const offer = buildOffer(world, player.id, foe.id, { appetite: 1 });
        if (offerRefusal(world, player.id, foe.id, offer) === null) signPeace(game, player.id, foe.id, offer);
      }
    }
    if (peaces.slice(before).some((p) => p.player)) {
      signedBetweenTurns();
      lastPlayerPeace = world.turn;
    }
  }
  off();
  return { seed, weeks: YEARS * 52, weekly, playerPeace, landings, peaces, player: player.name };
}

const rows = SEEDS.map(runSeed);

sub('1. BARIŞTAN SONRA YABANCI TOPRAKTA KALAN TÜMEN');
console.log(table(rows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'oyuncu barışı', get: (r) => r.playerPeace.count },
  { label: 'imza anında', get: (r) => r.playerPeace.immediate },
  { label: 'emir verilemez', get: (r) => r.playerPeace.stuck },
  { label: 'denizde ölü rota', get: (r) => r.playerPeace.atSea },
  { label: 'sonraki hafta', get: (r) => r.playerPeace.nextWeek },
  { label: 'hafta sonu Σ (dünya)', get: (r) => r.weekly.trespass },
  { label: 'en kötü hafta', get: (r) => r.weekly.maxWeek },
  { label: 'ölü rota Σ', get: (r) => r.weekly.deadCourse },
]));
{
  const left = rows.reduce((s, r) => s + r.weekly.trespass + r.playerPeace.nextWeek, 0);
  if (left > 0) {
    finding('HIGH', 'barışta yabancı toprakta tümen',
      'barıştan sonraki hafta sonunda yabancı toprakta 0 tümen',
      `${left} tümen-hafta`, 'turn.withdrawTrespassers / barış anı geri çekilme');
  } else console.log('  -> Hafta sonlarında yabancı toprakta tümen yok. DOĞRU.');
  const now = rows.reduce((s, r) => s + r.playerPeace.immediate + r.playerPeace.atSea, 0);
  if (now > 0) {
    finding('MEDIUM', 'barış anında geri çekilme yok',
      'oyuncunun imzaladığı barışın ANINDA yabancı topraktaki tümen 0',
      `${now} tümen (emir verilemeyen ${rows.reduce((s, r) => s + r.playerPeace.stuck, 0)})`,
      'Kerem: "barışa geçince askerler başka ülkelerin içinde kalıyor"');
  } else console.log('  -> Oyuncunun barışında imza anında yabancı toprakta tümen yok. DOĞRU.');
}

sub('2. ÇIKARMA MESAFESİ (denizde hex · bölge · çıkışın evden uzaklığı)');
{
  const groups = new Map();
  for (const r of rows) {
    for (const l of r.landings) {
      const key = `${l.who}${l.hostile ? ' → düşman' : ' → dost'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
  }
  const stat = (list, k, q) => (list.length ? quantile(list.map((l) => l[k]), q) : 0);
  const max = (list, k) => list.reduce((m, l) => Math.max(m, l[k]), 0);
  const out = [...groups.entries()].sort().map(([key, list]) => ({ key, list }));
  console.log(table(out, [
    { label: 'kim → nereye', get: (g) => g.key, right: false },
    { label: 'olay', get: (g) => g.list.length },
    { label: 'hex p50', get: (g) => stat(g.list, 'steps', 0.5) },
    { label: 'hex p90', get: (g) => stat(g.list, 'steps', 0.9) },
    { label: 'hex max', get: (g) => max(g.list, 'steps') },
    { label: 'bölge p90', get: (g) => stat(g.list, 'zones', 0.9) },
    { label: 'bölge max', get: (g) => max(g.list, 'zones') },
    { label: 'evden p90', get: (g) => stat(g.list, 'home', 0.9) },
    { label: 'evden max', get: (g) => max(g.list, 'home') },
    { label: 'hafta p90', get: (g) => stat(g.list, 'weeks', 0.9) },
  ]));
  const hostile = rows.flatMap((r) => r.landings.filter((l) => l.hostile));
  if (hostile.length) {
    console.log(`  Düşman kıyısına çıkış: ${hostile.length} · denizde hex p90 ${quantile(hostile.map((l) => l.steps), 0.9)}`
      + ` max ${max(hostile, 'steps')} · bölge max ${max(hostile, 'zones')} · evden p90 ${quantile(hostile.map((l) => l.home), 0.9)} max ${max(hostile, 'home')}`);
  }
  // Otomatik el (YZ ve oyuncunun AUTO generali) okyanus ötesinden düşman
  // kıyısına inmemeli. Oyuncunun kendi emri bu kurala bağlı değildir ama
  // denetimdeki oyuncu emir vermez; onun inişleri de AUTO'dur.
  // Kendi işgal edilmiş toprağımıza (evden 0) inen dönüş sayılmaz: o kurtarmadır.
  const far = hostile.filter((l) => l.steps > FAR_VOYAGE && l.home > 0);
  const share = far.length / Math.max(1, hostile.length);
  if (share > 0.02) {
    finding('MEDIUM', 'uzak çıkarma',
      `düşman kıyısına inen yolculukların en çok %2'si ${FAR_VOYAGE} deniz hexinden uzun`,
      `${far.length}/${hostile.length} (%${(share * 100).toFixed(1)}) · en uzun ${max(far, 'steps')} hex / ${max(far, 'zones')} bölge`,
      'Kerem: "dünyanın öbür ucundan çıkartma"; movement.AUTO_SEA, command.assignPosts');
  } else {
    console.log(`  -> ${FAR_VOYAGE} hexten uzun düşman çıkarması ${far.length}/${hostile.length}. DOĞRU.`);
  }
}

sub('3. BARIŞ BAŞINA EL DEĞİŞTİREN KÜME');
{
  const all = rows.flatMap((r) => r.peaces);
  const landed = all.filter((p) => p.demands + p.concessions > 0);
  const sizes = landed.map((p) => p.demands + p.concessions);
  const hist = new Map();
  for (const n of sizes) hist.set(n, (hist.get(n) ?? 0) + 1);
  console.log(`  Barış ${all.length} · topraklı ${landed.length} (%${((landed.length / Math.max(1, all.length)) * 100).toFixed(1)})`
    + ` · beyaz ${all.filter((p) => p.white).length} · vassal ${all.filter((p) => p.terms.includes('VASSALIZE')).length}`);
  console.log(`  Topraklı barışta küme: ort ${(sizes.reduce((s, n) => s + n, 0) / Math.max(1, sizes.length)).toFixed(2)}`
    + ` · p90 ${sizes.length ? quantile(sizes, 0.9) : 0} · max ${Math.max(0, ...sizes)}`
    + ` · dağılım ${[...hist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}:${c}`).join(' ')}`);
  const mine = all.filter((p) => p.player);
  console.log(`  Oyuncunun barışları ${mine.length}: küme ${mine.map((p) => `${p.demands}/${p.concessions}`).join(' ') || '-'} (alınan/verilen)`);
}

console.log(`WAREND_JSON ${JSON.stringify(rows.map((r) => ({
  seed: r.seed, playerPeace: r.playerPeace, weekly: r.weekly,
  landings: r.landings.length,
  hostile: r.landings.filter((l) => l.hostile).map((l) => [l.who, l.steps, l.zones, l.home]),
  peaces: r.peaces.map((p) => p.demands + p.concessions),
})))}`);

process.exit(reportFindings() > 0 ? 1 : 0);
