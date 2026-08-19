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

const REFRESH_EVERY = 26;

const LINES = {
  occupied: 'A state administered, for now, from someone else\'s map.',
  losing_war: 'The war goes badly, and everyone in the capital knows it.',
  at_war: 'A nation with its affairs on the table and its army in the field.',
  debt_crisis: 'Creditors read its budgets more closely than its ministers do.',
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
  // KRIZ (occupiedShare haftalik refreshNationalStrain tarafindan yazilir)
  if ((economy.occupiedShare ?? 0) > 0.35) return 'occupied';
  const anyWar = world.nations.some((o) => o.alive && o.id !== nation.id
    && atWar(world, nation.id, o.id));
  if (anyWar && (economy.warStrain ?? 0) > 0.35) return 'losing_war';
  if ((economy.creditPenalty ?? 0) > 0.3) return 'debt_crisis';
  if ((economy.stability ?? 1) < 0.15) return 'revolutionary';
  if (anyWar) return 'at_war';
  // DONUSUM
  const factories = economy.factories?.length ?? 0;
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
  if (nation.research?.programme === 'NATIONAL_INSTRUCTION') return 'educating';
  if (factories >= 10 && (economy.social?.education ?? 0) >= 25) return 'industrializing';
  // KIMLIK
  if (rank > 0 && rank <= 3) return 'great_power';
  if (rank > 0 && rank <= 6 && (economy.ledger?.net ?? 0) < 0) return 'declining_power';
  if (research <= techBottom && research < 5) return 'tech_laggard';
  const flow = economy.goodsFlow ?? {};
  let exports = 0;
  let production = 0;
  for (const id of Object.keys(flow)) {
    exports += flow[id]?.exports ?? 0;
    production += flow[id]?.production ?? 0;
  }
  if (production > 0 && exports / production > 0.3) return 'trade_power';
  if (factories < 4) return 'agrarian';
  return 'generic';
}

/**
 * Onbellekli karakter satiri. Kriz etiketi degistiyse hemen, degilse en
 * erken 26 haftada bir tazelenir — "etiket sarkaci" olmasin.
 */
export function characterLine(world, nation) {
  const turn = world.turn ?? 0;
  const cache = nation.identity;
  const crisisTags = ['occupied', 'losing_war', 'debt_crisis', 'revolutionary', 'at_war'];
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
