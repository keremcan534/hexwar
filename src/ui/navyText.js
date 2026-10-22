// DONANMANIN CÜMLELERİ — panel (navyDock), deniz karesi kartı (hud) ve ticaret
// ekranı (stateScreens) aynı kuralı aynı sözle anlatsın. Sayı burada KURULMAZ:
// hepsi game/navy.js dökümlerinden (navyView, zoneStatus, seaZoneMarks) gelir;
// burada yalnız cümleye dökülür. Kural metni ("strength nedir", "abluka nasıl
// işler") tek yerde durur ki ekranlar birbiriyle çelişmesin.

import {
  EVADE_RATIO, HOME_WATERS, SQUADRON, WITHDRAW_WEEKS, dayMonth, seaZoneMarks, zoneStatus,
} from '../game/navy.js';
import { linePriorityOf } from '../game/econ/industry.js';
import { SHIP_CLASSES } from '../game/units.js';
import { seaLaneView } from '../game/seaLanes.js';
import { seaZonesOf } from '../world/seaZones.js';

export const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;
export const str1 = (value) => (Number.isFinite(value) ? value.toFixed(1) : '—');
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const names = (world, ids) => (ids ?? []).map((id) => world.nations[id]?.name).filter(Boolean).join(', ');

/** Gücün ne olduğu (cümle testi): başlık ipucu ve kartın "neden" bloğu. */
export function strengthRule(view) {
  const classes = SHIP_CLASSES.map((cls) => `${cls.name.toLowerCase()} ${cls.power}`).join(', ');
  return `Each warship counts hull (0–100%) × class (${classes}) × naval technology (×${(view?.naval ?? 1).toFixed(2)}). `
    + `In battle, home waters add ${Math.round(HOME_WATERS * 100)}% and an admiral 6% per skill. `
    + 'Ready: not repairing, not withdrawn. Hull: average condition; below 85% a ship goes home to repair when it can be spared.';
}

/** Deniz muharebesinin kuralı (kartın "How sea battles work" ipucu). */
export const BATTLE_RULE = 'How sea battles work\nEach side deals damage equal to its hull × the quality ratio × 0.5 × a die (0.75–1.25). '
  + `Quality is strength per hull: class, naval technology, +${Math.round(HOME_WATERS * 100)}% in home waters, the admiral. `
  + 'A ship at 2% hull sinks with her crew; under 40% she goes home to repair. '
  + `The side with more strength left holds the sea; the other returns to port for ${WITHDRAW_WEEKS} weeks. `
  + `A fleet less than ${EVADE_RATIO === 0.5 ? 'half' : pct(EVADE_RATIO)} as strong as its enemy does not fight at all: it withdraws for ${WITHDRAW_WEEKS} weeks.`;

/** Ablukanın gerçek kuralı (NAVY-06: eski ipucu kalkmış hex modelini anlatıyordu). */
export const BLOCKADE_RULE = 'Enemy warships holding the seas off our coast cut our sea trade. Each coastal state takes the '
  + 'strongest enemy hold on its waters (the enemy\'s share of that sea × cover, 0.6 strength per coastal state there); '
  + 'the national figure is the average over our coastal states. Imports and exports with partners we do not border by '
  + 'land lose that share; land neighbours are untouched.';

/** Tümenin denizdeki modeli (TRADE satırı ve ordu paneli ipucu): uydurma yok. */
export const TROOPS_RULE = 'Divisions embark from any coast; no transports or ports are needed. They cannot fight at sea, '
  + 'cannot enter a sea the enemy holds (over half of the warships there), and lose men every week they spend in one. '
  + 'Overseas divisions are supplied like any other.';

const level = (weight) => linePriorityOf(weight ?? 0).name;

/**
 * Auto'nun bu deniz için gerekçesi (Auto düğmesinin ipucu, satırın notu).
 * `why` navy.autoZonePlan/zonePlan'dan gelir; kod başına bir cümle.
 */
export function whySentence(world, why, zoneName = 'this sea') {
  if (!why) return 'Auto · Off — not a sea Auto watches: no home coast, no enemy coast in reach, no escort duty.';
  const enemy = world.nations[why.enemy]?.name ?? 'the enemy';
  switch (why.code) {
    case 'home-main':
      return `Auto · Normal — our longest coast (${plural(why.coast ?? 0, 'state')}) lies on this sea.`;
    case 'home':
      return 'Auto · Low — home waters; in peace Auto keeps a watch on every home sea.';
    case 'gathered':
      return 'Auto · Off — in war Auto gathers the fleet: only the longest home coast keeps its squadron, the rest goes where the enemy is.';
    case 'shared':
      return `Auto · High — ${enemy}'s coast shares this home sea: in war Auto concentrates here.`;
    case 'blockade':
      return `Auto · Normal — blockading ${enemy}: our fleet (${str1(why.ours)}) is at least 0.8 of theirs (${str1(why.theirs)}).`;
    case 'unconfident':
      return `Auto · Off — no blockade of ${enemy}: our fleet (${str1(why.ours)}) is below 0.8 × theirs (${str1(why.theirs)}).`;
    case 'hold':
      return `Auto · High — we drove ${enemy}'s fleet out of this sea on ${dayMonth(why.since)}: Auto holds it (blockade, keeps it out) until ${dayMonth(why.expires)} or the war ends.`;
    case 'escort':
      return `Auto · Normal — escort: enemy U-boats sink ${pct(why.share)} of our cargo here.`;
    case 'contest':
      return `Auto · High — ${enemy}'s fleet here (${str1(why.there)}); our ready fleet (${str1(why.ours)}) is a third stronger (needs ${str1(why.need)}).`;
    case 'outgunned':
      return `Auto · Off — ${enemy}'s fleet here (${str1(why.there)}) needs a ready fleet of ${str1(why.need)}; ours is ${str1(why.ours)}. The fleet stays in port rather than lose it (fleet in being).`;
    case 'refused':
      if (why.away) {
        return `Auto · Off — refused battle here on ${dayMonth(why.memo.turn)}; ${enemy}'s fleet has left this sea but is still as strong (fleet ${str1(why.memo.fleet)}) and would chase our squadron out again. `
          + `Sails again when our ready fleet reaches ${str1(why.need)} (now ${str1(why.ours)}), ${enemy}'s ready fleet falls below ${str1(why.retakeBelow)}, or after ${dayMonth(why.expires)}.`;
      }
      return `Auto · Off — refused battle here on ${dayMonth(why.memo.turn)} (${str1(why.memo.theirs)} against our squadron). `
        + `Sails again when our ready fleet reaches ${str1(why.need)} (now ${str1(why.ours)}), ${enemy}'s fleet here falls below ${str1(why.retakeBelow)}, or after ${dayMonth(why.expires)}.`;
    case 'pooled': {
      const seas = (why.by ?? []).map((id) => seaZonesOf(world).zones[id]?.name).filter(Boolean);
      const taken = why.used > 0
        ? `; your ${seas.length ? seas.join(', ') : 'own order'} ${why.used === 1 ? 'takes one of them' : `take ${why.used} of them`}`
        : '';
      const cause = why.cause && why.cause.code !== 'pooled' ? `\nWithout that: ${whySentence(world, why.cause, zoneName)}` : '';
      return `Auto · Off — Auto keeps warships in squadrons of ${SQUADRON}: ${plural(why.ready, 'ready ship')} hold ${plural(why.slots, 'sea')}${taken}. `
        + `${zoneName} (Auto would set ${level(why.wanted)}) waits for a bigger fleet.${cause}`;
    }
    case 'manual':
      return `Your order: ${level(why.weight)}. ${why.auto ? `Auto would set ${level(why.autoWeight)} — ${whySentence(world, why.auto, zoneName).replace(/^Auto · \w+ — /, '')}` : 'Auto would leave this sea alone.'}`;
    default:
      return `Auto · ${level(why.weight)}.`;
  }
}

/** Öngörünün tek satırı (satırın üçüncü satırı). */
export function forecastLine(world, forecast) {
  if (!forecast || !(forecast.theirs > 0)) return null;
  const them = names(world, forecast.enemy ? [forecast.enemy.id] : []) || 'The enemy';
  const vs = `≈ ${str1(forecast.ours)} vs ${str1(forecast.theirs)}`;
  switch (forecast.verdict) {
    // Satır ~60 harf (panel 432 px); uzun hâli forecastTip'te. Eskiden "(port
    // 6 wk)" ve "for this sea" kuyrukları 1920'de bile kesiliyordu.
    case 'none': return { tone: 'bad', text: `${them}'s fleet here (${str1(forecast.theirs)}) — none of ours planned` };
    case 'refuse': return { tone: 'bad', text: `⚠ ${vs} — below half: ours will refuse battle` };
    case 'drive': return { tone: 'good', text: `${vs} — ${them}'s fleet will refuse battle and leave` };
    case 'unfavourable': return { tone: 'bad', text: `⚠ ${vs} — unfavourable battle` };
    case 'even': return { tone: 'warn', text: `${vs} — even battle` };
    case 'favourable': return { tone: 'good', text: `${vs} — favourable battle` };
    default: return null;
  }
}

/** Öngörünün ipucu: bantların anlamı (cümle testi). */
export function forecastTip(forecast) {
  if (!forecast) return '';
  return `Forecast for next week\nOurs ≈ ${str1(forecast.ours)} (${plural(forecast.ships, 'ship')} planned${forecast.allies > 0 ? `, allies ${str1(forecast.allies)}` : ''}${forecast.weeks ? `, the last arrives in ${forecast.weeks} wk` : ''}) against ${str1(forecast.theirs)}.\n`
    + `Below ${pct(EVADE_RATIO)} of the enemy a squadron refuses battle and spends ${WITHDRAW_WEEKS} weeks in port; above twice the enemy, the enemy does. `
    + 'Within ±10% the battle is even (the battle die swings 25% each way); beyond it the stronger side wins most of the time.\n'
    + `To fight here: ≥ ${str1(forecast.needFight)}. To be favoured: ≈ ${str1(forecast.needFavour)}. Admirals and next week's arrivals can move it (≈).`;
}

/** Auto'nun kaçınma hafızası satırı. */
export function memoLine(memo) {
  if (!memo) return null;
  return `Auto refused ${dayMonth(memo.turn)} — back at ${str1(memo.need)} (now ${str1(memo.now)}) or after ${dayMonth(memo.expires)}`;
}

/**
 * DENİZ KARESİNİN KARTI (hud, §7.3): hâkimiyet, kapalı deniz, abluka ve
 * yollar. [etiket, değer] çiftleri; boş deniz tek satır.
 */
export function waterLines(game, tile) {
  const world = game.world;
  const player = game.turns?.playerNation ?? -1;
  const zoneId = tile?.seaZone ?? -1;
  if (zoneId < 0 || player < 0 || !world.navyState) return [];
  const lines = [];
  const status = zoneStatus(world, player, zoneId);
  const presence = world.navyState.presence?.get(zoneId);
  const shipsOf = (ids) => ids.reduce((sum, id) => sum + (presence?.get(id)?.ships.length ?? 0), 0);
  // Kısa değer: kartın ilk notu büyük yazılır (hud pv-note).
  const ours = presence?.get(player)?.ships.length ?? 0;
  if (status.state === 'open') {
    lines.push(['Control', 'open sea']);
    lines.push(['Fleets', 'no warships of any side at war with us']);
  } else if (status.state === 'ours') {
    lines.push(['Control', 'ours']);
    lines.push(['Fleets', `ours ${plural(ours, 'ship')} (${str1(status.friendly)})`]);
  } else {
    lines.push(['Control', `${names(world, status.holders.slice(0, 1))} ${pct(status.share)}`]);
    lines.push(['Fleets', `${names(world, status.holders)} ${plural(shipsOf(status.holders), 'ship')} (${str1(status.hostile)}) · ours ${ours ? `${plural(ours, 'ship')} (${str1(status.friendly)})` : 'none'}`]);
  }
  if (status.state === 'held') lines.push(['Troops', 'Closed to our troops — the enemy holds over half the sea']);
  const mark = seaZoneMarks(world, player).get(zoneId);
  if (mark?.onUs > 0.01) lines.push(['Blockade', `our coast here ${pct(mark.onUs)} (${names(world, status.holders) || 'the enemy'})`]);
  for (const row of (mark?.byUs ?? []).slice(0, 2)) {
    lines.push(['Blockade', `${world.nations[row.nation]?.name ?? '?'}'s coast here ${pct(row.share)}`]);
  }
  let lanes = 0;
  let cut = 0;
  for (const lane of seaLaneView(world)) {
    if (!lane.path.includes(zoneId)) continue;
    lanes++;
    if (lane.factor < 0.98) cut++;
  }
  if (lanes) lines.push(['Lanes', `${plural(lanes, 'trade lane')} cross${lanes === 1 ? 'es' : ''}${cut ? `; ${cut} cut` : ''}`]);
  return lines;
}

/**
 * Kıyımızı ablukaya alan denizler, en ağırı önce: {zone, share, by}. Ticaret
 * ekranı navyView'in bütününü kurmasın diye işaret tablosundan okunur.
 */
export function blockadeCause(world, nationId) {
  const zones = seaZonesOf(world).zones;
  const out = [];
  for (const [zoneId, mark] of seaZoneMarks(world, nationId)) {
    if (!(mark.onUs > 0.01)) continue;
    out.push({ zone: zones[zoneId], share: mark.onUs, by: zoneStatus(world, nationId, zoneId).holders });
  }
  return out.sort((a, b) => b.share - a.share || a.zone.id - b.zone.id);
}

/**
 * Ticaret ekranının Blockade ipucu (§7.4): kural + şimdiki sebep. `blockers`
 * navyView().trade.blockers ya da blockadeCause.
 */
export function blockadeTip(world, share, blockers) {
  const worst = blockers?.[0];
  const now = worst ? `\nNow: ${names(world, worst.by) || 'the enemy'} in ${worst.zone.name}.` : '\nNow: no enemy fleet holds the seas off our coast.';
  return `Blockade ${pct(share)}\n${BLOCKADE_RULE}${now}\nThe Seas map (M) shows who holds which sea.`;
}
