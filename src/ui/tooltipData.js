// Tooltip içerik sağlayıcıları.
//
// TEK KURAL: burada hiçbir simülasyon formülü yeniden kurulmaz. Her sağlayıcı
// alan katmanının döküm fonksiyonunu okur — economyView, stabilityBreakdown,
// warSupportBreakdown, powerIncome, taxBreakdown — ve okuduğunu cümleye
// çevirir (TASARIM.md ilke 2).
//
// Sağlayıcı `null` dönerse tooltip hiç açılmaz — boş bir kart göstermek,
// hiç göstermemekten kötüdür.

import { provideTooltip } from './tooltip.js';
import { economyView, formatPopulation, literacyTarget } from '../game/economy.js';
import {
  TECH_CATEGORIES, canResearch, diffusionDiscount, effectiveTechCost, hasTech,
  researchPath, researchPointsOf, techById, techCost,
} from '../game/technology.js';
import { activeAlerts } from '../game/alerts.js';
import { DELEGATION_AREAS, DELEGATION_IDS, isDelegated } from '../game/delegation.js';
import { INFAMY, INFAMY_COALITION } from '../game/infamy.js';
import { BUILDINGS, RESOURCES } from '../game/econ/defs.js';
import { describeEffects, modifierBreakdown, MODIFIER_KEYS } from '../game/modifiers.js';
import { powerIncome } from '../game/politics.js';
import { nationManpower } from '../game/recruitment.js';

const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d)}%`;
const coin = (v) => `${(v ?? 0).toFixed(1)}`;
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v ?? 0).toFixed(1)}`;
const pts = (v) => `${v >= 0 ? '+' : '−'}${Math.abs((v ?? 0) * 100).toFixed(1)}`;
/** `text` ham HTML basilir; simulasyondan gelen cumleler kacirilarak girer. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Sağlayıcıları kurar. Oyun nesnesini kapatma (closure) ile taşır ki
 * sağlayıcılar imzalarında dolaşmasın.
 */
export function registerTooltips(game) {
  const me = () => game.world.nations[game.turns.playerNation];

  /* ----------------------------------------------------------------------
     ÜST ÇUBUK — hazine, SG, savaş desteği, IC, kaynaklar, binalar
     ---------------------------------------------------------------------- */

  provideTooltip('treasury', () => {
    const nation = me();
    if (!nation?.economy) return null;
    const view = economyView(game.world, nation);
    const ledger = view.ledger;
    return {
      type: 'breakdown',
      title: 'Treasury',
      value: `${Math.round(view.gold)} gold`,
      text: 'Gold pays for buildings, regiments, upkeep and imports. When it runs dry the '
        + 'state borrows automatically; above the debt ceiling it goes bankrupt.',
      rows: [
        { label: 'Taxes', value: signed(ledger.tax ?? 0), tone: 'good' },
        { label: 'Exports', value: signed(ledger.exports ?? 0), tone: 'good' },
        { label: 'Army & navy', value: signed((ledger.army ?? 0) + (ledger.navy ?? 0)), tone: 'bad' },
        { label: 'Building upkeep', value: signed(ledger.maintenance ?? 0), tone: 'bad' },
        { label: 'Imports', value: signed(ledger.imports ?? 0), tone: 'bad' },
        { label: 'Education', value: signed(ledger.education ?? 0), tone: 'bad' },
        { label: 'Interest', value: signed(ledger.interest ?? 0), tone: 'bad' },
        { label: 'Week closed at', value: signed(ledger.net ?? 0), tone: (ledger.net ?? 0) >= 0 ? 'good' : 'bad' },
      ],
      footer: `Debt ${Math.round(view.debt)} of a ${Math.round(view.debtCap)} ceiling.`,
    };
  });

  provideTooltip('power', () => {
    const nation = me();
    if (!nation) return null;
    const income = powerIncome(nation);
    return {
      type: 'breakdown',
      title: 'Political power',
      value: `${Math.round(nation.power ?? 0)} / 500`,
      text: 'The currency of government: laws, advisors, propaganda, culture policy, '
        + 'war justification, embargoes and decisions all cost political power.',
      rows: [
        { label: 'Base', value: '+1.00' },
        ...modifierBreakdown(nation, 'power').map((row) => ({ label: row.label, value: `+${row.value.toFixed(2)}`, tone: 'good' })),
        { label: 'Stability multiplier', value: `×${income.stability.toFixed(2)}` },
        { label: 'Per week', value: `+${income.total.toFixed(2)}`, tone: 'good' },
      ],
    };
  });

  provideTooltip('warsupport', () => {
    const nation = me();
    const parts = nation?.politics?.warSupportParts;
    if (!parts) return null;
    return {
      type: 'breakdown',
      title: 'War support',
      value: pct(nation.warSupport),
      text: 'How willing the people are to fight. Extensive conscription needs 50%, total '
        + 'mobilisation 80%. Below 20% the nation accepts harsh peace terms.',
      rows: parts.map((part) => ({ label: part.label, value: pts(part.value), tone: part.value >= 0 ? 'good' : 'bad' })),
      footer: `Heading to ${pct(nation.politics?.warSupportTarget)}, one point a week.`,
    };
  });

  provideTooltip('ic', () => {
    const nation = me();
    const ic = nation?.economy?.ic;
    if (!ic) return null;
    return {
      type: 'breakdown',
      title: 'Industrial capacity',
      value: ic.total.toFixed(1),
      text: 'Factories make IC. The economy law sends a share of it to the army\'s production '
        + 'lines; the rest makes consumer goods for the people.',
      rows: [
        { label: 'Factory levels', value: ic.raw.toFixed(1) },
        { label: 'Coal', value: `×${(ic.factors?.coal ?? 1).toFixed(2)}`, tone: (ic.factors?.coal ?? 1) < 1 ? 'bad' : '' },
        { label: 'Stability', value: `×${(ic.factors?.stability ?? 1).toFixed(2)}` },
        { label: 'Conscription', value: `×${(ic.factors?.law ?? 1).toFixed(2)}` },
        { label: 'Technology & ministers', value: `×${(ic.factors?.tech ?? 1).toFixed(2)}` },
        { label: 'Civilian · military', value: `${ic.civil.toFixed(1)} · ${ic.military.toFixed(1)}` },
      ],
    };
  });

  provideTooltip('resource', (id) => {
    const nation = me();
    const info = RESOURCES[id];
    const record = nation?.economy?.resources?.[id];
    if (!info || !record) return null;
    const partner = record.topPartner >= 0 ? game.world.nations[record.topPartner] : null;
    const uses = {
      FOOD: 'Feeds the people. Below 70% the population shrinks.',
      COAL: 'Fuels the factories: short coal costs up to 40% of industrial capacity.',
      IRON: 'Rifles, artillery, railways and ironclads.',
      TIMBER: 'Construction sites, rifle stocks and sailing ships.',
      HORSES: 'Cavalry and artillery: without them they fight up to 40% weaker.',
      SALTPETER: 'Gunpowder: every regiment in battle burns it; short powder costs up to 30% of strength.',
    }[id];
    return {
      type: 'breakdown',
      title: `${info.glyph} ${info.name}`,
      value: record.need > 0.01 ? `${pct(record.ratio)} covered` : 'no need',
      text: uses,
      rows: [
        { label: 'Produced', value: record.produced.toFixed(1) },
        { label: 'Needed', value: record.need.toFixed(1) },
        { label: 'Imported', value: record.imported.toFixed(1), tone: record.imported > 0 ? 'bad' : '' },
        { label: 'Exported', value: record.exported.toFixed(1), tone: record.exported > 0 ? 'good' : '' },
        { label: 'World price', value: (game.world.market?.prices?.[id] ?? info.price).toFixed(2) },
        partner ? { label: `Main supplier: ${partner.name}`, value: pct(record.topShare), tone: record.topShare > 0.5 ? 'bad' : '' } : null,
      ].filter(Boolean),
    };
  });

  provideTooltip('building', (id) => {
    const info = BUILDINGS[id];
    if (!info) return null;
    return {
      type: 'mechanic',
      title: info.name,
      text: `${info.effect}. Costs ${info.cost} gold, ${info.weeks} weeks to build, ${info.upkeep ?? 0} gold a week to keep. Up to ${info.max} levels.`,
    };
  });

  /* ----------------------------------------------------------------------
     EYALET KUTUSU — denetim, RGO, kültür
     ---------------------------------------------------------------------- */

  provideTooltip('control', () => ({
    type: 'mechanic',
    title: 'Control',
    text: 'How much of this province actually answers to you. Freshly taken land '
      + 'starts low and climbs back; occupied land pays you nothing until the '
      + 'peace is signed.',
  }));


  /* ----------------------------------------------------------------------
     UST CUBUK — istikrar, sohret, ordu, insan gucu
     Tarayicinin `title` balonu bir saniye gecikiyor, duz metin basiyor ve
     ekran goruntusune bile girmiyor; kor oyun testinde "tooltip yok" diye
     okundu. Ayni bilgi artik geciktirmeli kartta.
     ---------------------------------------------------------------------- */

  provideTooltip('stability', () => {
    const nation = me();
    const parts = nation?.politics?.stabilityParts;
    if (!parts?.length) {
      return { type: 'simple', title: 'Stability', text: 'Measured after the first weekly tick.' };
    }
    return {
      type: 'breakdown',
      title: 'Stability',
      value: pct(nation.stability, 1),
      text: 'How firmly the country holds together. It multiplies political power, taxes and '
        + 'industry; below 30% unrest boils over. It moves one point a week toward its target.',
      rows: parts.map((part) => ({ label: part.label, value: pts(part.value), tone: part.value >= 0 ? 'good' : 'bad' })),
      footer: `Target ${pct(nation.politics?.stabilityTarget, 1)}. Click the figure to pin the breakdown.`,
    };
  });

  provideTooltip('infamy', () => {
    const nation = me();
    const infamy = nation?.infamy ?? 0;
    const decay = INFAMY.DECAY_PER_TURN + infamy * INFAMY.DECAY_RATIO;
    return {
      type: 'breakdown',
      title: 'Infamy',
      value: `${infamy.toFixed(1)} / ${INFAMY_COALITION}`,
      text: `How much the world resents your conquests. At ${INFAMY_COALITION} your `
        + 'neighbours unite in a coalition and declare war on you together.',
      rows: [
        { label: 'Occupying a foreign-culture hex', value: `+${INFAMY.FOREIGN_CULTURE_TILE}`, tone: 'bad' },
        { label: 'Occupying a hex of your own culture', value: `+${INFAMY.OWN_CULTURE_TILE}`, tone: 'bad' },
        { label: 'Occupying a city', value: `+${INFAMY.CITY}`, tone: 'bad' },
        { label: 'Annexing at the peace table', value: 'per hex, city and person', tone: 'bad' },
        { label: 'Forgotten every week', value: `−${decay.toFixed(2)}`, tone: 'good' },
      ],
      footer: infamy >= INFAMY_COALITION * 0.6
        ? 'Close to the threshold: one more annexation may unite your neighbours.'
        : 'A single border province is safe; a string of annexations is not.',
    };
  });

  provideTooltip('army', () => ({
    type: 'mechanic',
    title: 'Army',
    text: 'Men under arms: soldiers drawn from your provinces and serving in your '
      + 'divisions. A regiment is 30,000 infantry, 20,000 cavalry or 15,000 gunners. '
      + 'Survivors of a disbanded unit walk home; the dead do not.',
  }));

  provideTooltip('manpower', () => {
    const nation = me();
    return {
      type: 'mechanic',
      title: 'Manpower',
      text: `Recruits available: ${formatPopulation(nation ? nationManpower(game.world, nation.id) : 0)}. `
        + 'The conscription law sets the share of the population that can be called up (2% to 15%); '
        + 'barracks, the citizenship law and compliance raise or lower it. Regiments and reinforcements draw from it.',
    };
  });

  /* ----------------------------------------------------------------------
     UYARI SERIDI — ikonun uzerine gelince sebep ve care
     ---------------------------------------------------------------------- */

  provideTooltip('alert', (id) => {
    const alert = activeAlerts(game.world, me()).find((row) => row.id === id);
    if (!alert) return null;
    return {
      type: 'simple',
      title: alert.title,
      text: `${esc(alert.cause)}<br><br><b>${esc(alert.remedy)}</b>`,
      footer: 'Click the icon to pin the note; ✕ silences it until the situation changes.',
    };
  });

  /* ----------------------------------------------------------------------
     SAAT, HARITA KIPLERI, DUNYA KURULUMU — duz aciklamalar
     ---------------------------------------------------------------------- */

  provideTooltip('time', (speed) => {
    const n = Number(speed) || 0;
    const desc = {
      0: 'Pause. Space toggles it; + and − step the speed.',
      1: 'One day per second — a week every seven seconds.',
      2: 'Two days per second.',
      4: 'Four days per second.',
      8: 'Eight days per second — a week in under a second while the simulation keeps up.',
    }[n] ?? '';
    return {
      type: 'simple',
      title: n ? `Speed ×${n}` : 'Pause',
      text: `${desc}${n ? ' War, crisis and existential events stop the clock by themselves; '
        + 'the date then says why.' : ''}`,
    };
  });

  provideTooltip('mapmode', (mode) => {
    const table = {
      political: ['Political map', 'Borders, nations and armies. Occupied hexes carry a hatch; the front of the selected commander is outlined.'],
      terrain: ['Terrain', 'Relief and vegetation without borders: where armies slow down and where the land is rich.'],
      geography: ['Geography', 'The bare world as the generator drew it — continents, seas and straits, no borders or units.'],
      cultures: ['Cultures', 'Who lives where. Hatching marks provinces whose majority differs from the owner\'s culture.'],
      resources: ['Resources', 'What every hex yields — grain, cattle, coal, iron and the rest. A province produces the sum of its hexes; the legend lists every resource.'],
      population: ['Population', 'How many people live in each province, in four bands.'],
      diplomacy: ['Diplomacy', 'Who is at war with whom. Green is the nation you look from, red its enemies, blue its allies; hatching marks occupied land. Click any nation to see the map through its eyes.'],
      unrest: ['Unrest', 'How close each province is to revolt, 0 to 10. Above 7 a revolt starts to brew; foreign culture, hunger and occupation drive it.'],
      industry: ['Industry', 'Factory workers in each province, across every nation — where the industrial heartlands are.'],
      infamy: ['Infamy', `How feared each nation is. At ${INFAMY_COALITION} the neighbours start forming coalitions against it.`],
      layers: ['Layers', 'Grid, labels, live sea, and the seed of this world.'],
    };
    const row = table[mode];
    return row ? { type: 'simple', title: row[0], text: row[1] } : null;
  });

  /**
   * Sekme künyesi: ekranın ne olduğu ve AUTO ışığının anlamı. Işık tek başına
   * "bu neden yeşil yanıyor" sorusunu cevaplamaz; cümle devir tablosundan gelir.
   */
  provideTooltip('tab', (screen) => {
    const TAB = {
      construction: ['Construction', 'Build capacity and the national build queue.'],
      industry: ['Factories', 'Every plant you own: output, workers, profit and upgrades.'],
      trade: ['Trade', 'The world market: prices, what you buy and sell, and the tariff.'],
      budget: ['Budget', 'Taxes, spending, debt and the weekly balance.'],
      military: ['Military', 'Regiments, training, equipment and mobilization.'],
      population: ['Population', 'Classes, needs, employment, literacy and unrest.'],
      politics: ['Politics', 'Parties, laws and the legitimacy of the government.'],
      technology: ['Technology', 'The research tree, the queue and what each technology does.'],
      chronicle: ['Chronicle', 'The history of your nation, event by event.'],
    };
    const row = TAB[screen];
    if (!row) return null;
    const nation = me();
    const areaId = DELEGATION_IDS.find((id) => DELEGATION_AREAS[id].screen === screen);
    if (!areaId || !nation) return { type: 'simple', title: row[0], text: row[1] };
    const on = isDelegated(nation, areaId);
    return {
      type: 'simple',
      title: `${row[0]} · ${on ? 'AUTO' : 'manual'}`,
      text: `${row[1]} ${on
        ? `The government runs it: ${DELEGATION_AREAS[areaId].desc} Turn AUTO off on the screen to take it back.`
        : 'You run this portfolio yourself; AUTO on the screen hands it to the government.'}`,
    };
  });

  provideTooltip('setup', (field) => {
    const table = {
      seed: ['World seed', 'Any text. The same seed always draws the same world, nations and opening economy — share it to share a map. Blank picks a random one.'],
      size: ['Map size', 'Hex columns; rows follow the aspect. 160 × 96 is the standard world the game is balanced on.'],
      cont: ['Continentality', 'How the land clumps: low values scatter islands and peninsulas, high values fuse them into a few large continents.'],
      land: ['Land ratio', 'Nudges the share of land. 0.00 is the standard 36% land; negative drowns the coasts, positive raises them.'],
      nations: ['Great powers', 'How many nations are seeded as great powers. Automatic lets the generator decide from the land available.'],
    };
    const row = table[field];
    return row ? { type: 'simple', title: row[0], text: row[1] } : null;
  });


  provideTooltip('defense', () => ({
    type: 'mechanic',
    title: 'Defence',
    text: 'Terrain bonus, plus a city\'s walls if one stands here. A defender on this '
      + 'hex fights with this much extra strength.',
  }));

  provideTooltip('culture', () => ({
    type: 'mechanic',
    title: 'Culture',
    text: 'Provinces of a culture your state does not accept recover control more '
      + 'slowly and are unhappier. Citizenship law decides who counts as accepted.',
  }));

  /* ----------------------------------------------------------------------
     TEKNOLOJİ — ağaç düğümü ve kuyruk çipi (bkz. technologyScreen.js).
     Fiyat motorun ETKİN fiyatıdır; erken araştırma cezası ve yayılım
     indirimi formül kopyalanmadan, motorun kendi fonksiyonlarından okunur.
     ---------------------------------------------------------------------- */

  provideTooltip('tech', (arg) => {
    const nation = me();
    const entry = techById(arg);
    if (!nation || !entry) return null;
    const { tech, categoryId, folder } = entry;
    const world = game.world;
    const year = 1836 + Math.floor(((world.turn ?? 1) - 1) * 7 / 365);
    const research = nation.research ?? {};
    const queue = research.queue ?? [];
    const done = hasTech(nation, tech.id);
    const status = done ? 'Researched'
      : research.current === tech.id ? 'Researching'
        : queue.includes(tech.id) ? `Queued #${queue.indexOf(tech.id) + 1}`
          : canResearch(nation, tech.id) ? 'Available' : 'Locked';

    const effects = describeEffects(tech.effects).map((line) => ({
      label: line, value: '', tone: line.startsWith('−') ? 'bad' : 'good',
    }));
    if (tech.desc) effects.unshift({ label: tech.desc, value: '' });

    const rows = [];
    if (!done) {
      const cost = effectiveTechCost(world, nation, tech.id, year);
      rows.push({ label: 'Cost', value: `${cost} RP` });
      const onTime = techCost(tech.id, tech.year ?? year);
      const now = techCost(tech.id, year);
      if (now > onTime) {
        rows.push({ label: `Ahead of its time (${tech.year})`, value: `+${Math.round((now / onTime - 1) * 100)}%`, tone: 'bad' });
      }
      const discount = diffusionDiscount(world, nation, tech.id);
      if (discount > 0.005) {
        rows.push({ label: 'Neighbours already know it', value: `−${Math.round(discount * 100)}%`, tone: 'good' });
      }
      const path = researchPath(nation, tech.id);
      const rate = researchPointsOf(nation);
      if (path.length > 1) rows.push({ label: 'Earlier steps first', value: path.length - 1 });
      if (rate > 0) {
        const total = path.reduce((sum, id) => sum + effectiveTechCost(world, nation, id, year), 0);
        const weeks = Math.max(0, Math.ceil((total - (research.points ?? 0)) / rate));
        rows.push({ label: research.current === tech.id ? 'Done in' : 'If started now', value: `${weeks} wk` });
      }
    }
    return {
      type: 'breakdown',
      title: tech.name,
      value: status,
      text: `${esc(TECH_CATEGORIES[categoryId]?.name ?? categoryId)} · ${esc(folder)} · activation ${tech.year}`,
      effects,
      rows,
      rowsLabel: 'Research',
      footer: done ? null : 'Click to research now · Shift+click to queue · Right-click to remove',
    };
  });

  /* ----------------------------------------------------------------------
     SÖZLÜK — ekranların özet etiketleri. Tanım kısa; bugünkü değer ve nereden
     geldiği, okunabiliyorsa, yanında. Formül burada kopyalanmaz: yalnız alan
     katmanının zaten hesapladığı sayılar okunur.
     ---------------------------------------------------------------------- */

  const GLOSSARY = {
    literacy: (nation) => ({
      type: 'breakdown',
      title: 'National literacy',
      value: pct(nation.economy?.literacy, 1),
      text: 'Schooling of the nation. It feeds research, raises the development cap and quickens '
        + 'national movements. It drifts slowly toward a target set by the education law and universities.',
      rows: [
        { label: 'Now', value: pct(nation.economy?.literacy, 1) },
        { label: 'Heading toward', value: pct(literacyTarget(game.world, nation), 1), tone: 'good' },
      ],
    }),
    research: (nation) => ({
      type: 'breakdown',
      title: 'Research points',
      value: `${researchPointsOf(nation).toFixed(2)}/wk`,
      text: 'One point a week, plus literacy × 6, plus 0.3 per university level; ministers and parties multiply.',
    }),
    unrest: () => ({
      type: 'mechanic',
      title: 'Unrest',
      text: 'From 0 to 10. Unaccepted peoples, fresh conquest, an unpopular war and empty shops push it up; '
        + 'minority rights and full shops pull it down. Unrest feeds national movements.',
    }),
    compliance: () => ({
      type: 'mechanic',
      title: 'Compliance',
      text: 'How far a non-core province accepts our rule (0-100). Taxes, recruits, industry and resources '
        + 'come in at 25% plus 75% of compliance. Cores always give everything.',
    }),
    consumer: () => ({
      type: 'mechanic',
      title: 'Consumer goods',
      text: 'What the people want to buy: workshops make most of it, civilian industry the rest. Short '
        + 'goods cost stability; surplus raises taxes. Expectations grow every decade.',
    }),
    development: () => ({
      type: 'mechanic',
      title: 'Development',
      text: 'Roads, markets and towns. Each level adds 25% tax, a building slot and faster growth. '
        + 'Research and literacy raise the cap.',
    }),
    officers: () => ({
      type: 'mechanic',
      title: 'Officers',
      text: 'Generals and admirals. Each commands an army or fleet; their skill shapes battle rolls and sieges.',
    }),
    upkeep: () => ({
      type: 'mechanic',
      title: 'Military upkeep',
      text: 'Weekly cost of the standing army and fleet; doubled half again while at war.',
    }),
  };

  provideTooltip('term', (arg) => {
    const nation = me();
    const entry = GLOSSARY[arg];
    return nation && entry ? entry(nation) : null;
  });
}
