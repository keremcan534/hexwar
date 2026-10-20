// Ulusal karakter satiri: simulasyon etiket secer, metin YAZARDAN gelir.
// Calisma zamaninda uretilmis cumle YOK — kucuk, elle yazilmis bir kutuphane
// ve deterministik bir secici. Oncelik: kriz > donusum > kimlik > genel.
//
// Titreme freni: satir ulusun uzerinde onbelleklenir ve en erken 26 haftada
// bir tazelenir; KRIZ etiketleri istisnadir (savas/temerrut aninda gorunur —
// kriz zaten titremez, baslar ve biter).
//
// Katman: game. DOM yok; yalniz dunya durumunu okur.

import { atWar } from './diplomacy.js';
import { scoreboard } from './hegemony.js';
import { IC_SCALE } from './econ/defs.js';

const REFRESH_EVERY = 26;

const LINES = {
  occupied: 'A state administered, for now, from someone else\'s map.',
  losing_war: 'The war goes badly, and everyone in the capital knows it.',
  at_war: 'A nation with its affairs on the table and its army in the field.',
  supply_crisis: 'Its armies eat faster than its workshops can feed them.',
  revolutionary: 'The old order holds the buildings; the street holds the rest.',
  tech_leader: 'Others debate the future. Here, it is already being built.',
  industrializing: 'Chimneys rise faster than church spires now.',
  educating: 'A century is being won, quietly, in its classrooms.',
  great_power: 'Its opinions arrive with the weight of fleets and railways.',
  declining_power: 'A great name, spending an inheritance it no longer earns.',
  tech_laggard: 'The future arrives here by import licence.',
  agrarian: 'The harvest is still the only clock that matters.',
  trade_power: 'Its flag follows its ledgers, not the other way round.',
  generic: 'A country like the others, which is to say: unlike any of them.',
};

/** Deterministik etiket secimi — oncelik sirasi sabit. */
function pickTag(world, nation) {
  const economy = nation.economy ?? {};
  // KRIZ (occupiedShare haftalik economy.beginEconomy tarafindan yazilir)
  if ((economy.occupiedShare ?? 0) > 0.35) return 'occupied';
  const anyWar = world.nations.some((o) => o.alive && o.id !== nation.id
    && atWar(world, nation.id, o.id));
  // Kaybedilen savaş YORGUNLUKTUR (redesign D5 merdiveni 0.6): irade savaşta
  // toplandığı için artık "her şey kötü gidiyor"u söylemez.
  if (anyWar && (nation.politics?.exhaustion ?? 0) >= 0.6) return 'losing_war';
  const turn = world.turn ?? 0;
  if ((economy.bills?.s ?? 1) < 0.9) return 'supply_crisis';
  if ((nation.stability ?? 1) < 0.15) return 'revolutionary';
  if (anyWar) return 'at_war';
  // DONUSUM
  // Ham sanayi (kalkınma × işçi); eski fabrika kademesinin ~IC_SCALE katı.
  const factories = (economy.ic?.raw ?? 0) / IC_SCALE;
  const education = nation.politics?.laws?.education ?? 0;
  const research = nation.research?.done?.length ?? 0;
  const board = scoreboard(world);
  const rank = board.findIndex((row) => row.nation.id === nation.id) + 1;
  const techCounts = world.nations
    .filter((n) => n.alive)
    .map((n) => n.research?.done?.length ?? 0)
    .sort((a, b) => b - a);
  const techTop = techCounts[Math.max(0, Math.floor(techCounts.length * 0.15))] ?? 0;
  const techBottom = techCounts[Math.min(techCounts.length - 1, Math.floor(techCounts.length * 0.85))] ?? 0;
  if (research >= techTop && research > 5) return 'tech_leader';
  // Okula gerçekten para basan ülke: eğitim yasası en üst kademede.
  if (education >= 2 && (economy.literacy ?? 0) >= 0.4) return 'educating';
  if (factories >= 10 && education >= 1) return 'industrializing';
  // KIMLIK
  if (rank > 0 && rank <= 3) return 'great_power';
  if (rank > 0 && rank <= 6 && (economy.bills?.owed ?? 0) > 0.45 * (economy.ic?.output ?? Infinity)) return 'declining_power';
  if (research <= techBottom && research < 5) return 'tech_laggard';
  const output = economy.ic?.output ?? 0;
  if (output > 0 && (economy.ledger?.exports ?? 0) / output > 0.08) return 'trade_power';
  if (factories < 3) return 'agrarian';
  return 'generic';
}

/**
 * Onbellekli karakter satiri. Kriz etiketi degistiyse hemen, degilse en
 * erken 26 haftada bir tazelenir — "etiket sarkaci" olmasin.
 */
export function characterLine(world, nation) {
  const turn = world.turn ?? 0;
  const cache = nation.identity;
  const crisisTags = ['occupied', 'losing_war', 'supply_crisis', 'revolutionary', 'at_war'];
  if (cache && turn - cache.turn < REFRESH_EVERY) {
    // Kriz basladi/bitti mi? Aninda yansit; digerleri bekler.
    const tag = pickTag(world, nation);
    const wasCrisis = crisisTags.includes(cache.tag);
    const isCrisis = crisisTags.includes(tag);
    if (wasCrisis === isCrisis) return LINES[cache.tag] ?? LINES.generic;
    nation.identity = { tag, turn };
    return LINES[tag] ?? LINES.generic;
  }
  const tag = pickTag(world, nation);
  nation.identity = { tag, turn };
  return LINES[tag] ?? LINES.generic;
}

/** Ulke panelinin "teknolojik konum" etiketi — ayni esikler, kisa ad. */
export function techStanding(world, nation) {
  const research = nation.research?.done?.length ?? 0;
  const counts = world.nations
    .filter((n) => n.alive)
    .map((n) => n.research?.done?.length ?? 0)
    .sort((a, b) => b - a);
  if (!counts.length) return { label: '—', research };
  const rank = counts.filter((c) => c > research).length + 1;
  const share = rank / counts.length;
  // Erken oyunda herkes 1-2 teknolojide esittir; beraberlikte herkesin
  // "lider" cikmamasi icin etiketler mutlak esige de bakar.
  const label = share <= 0.15 && research > 4 ? 'Technological leader'
    : share <= 0.4 && research > 2 ? 'Fast follower'
      : share <= 0.75 || research >= 2 ? 'Average adopter'
        : 'Technologically lagging';
  return { label, research, rank, of: counts.length };
}
