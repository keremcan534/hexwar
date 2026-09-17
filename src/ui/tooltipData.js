// Tooltip içerik sağlayıcıları.
//
// TEK KURAL: burada hiçbir simülasyon formülü yeniden kurulmaz. Her sağlayıcı
// alan katmanının döküm fonksiyonunu okur — `budgetBreakdown`, `industryOverview`,
// `factoryDiagnosis`, `provinceRgoStatus` — ve okuduğunu cümleye çevirir.
// Kopyalasaydık ekranla motor zamanla ayrışırdı; bütçede ölçülen sapma sınıfı
// tam olarak buydu (bkz. VICTORIA_LITE değişmez #2).
//
// Sağlayıcı `null` dönerse tooltip hiç açılmaz — boş bir kart göstermek,
// hiç göstermemekten kötüdür.

import { provideTooltip, tipTerm } from './tooltip.js';
import {
  FACTORIES, GOODS, budgetBreakdown, debtCapacity, formatPopulation, literacyTargetOf, priceOf,
} from '../game/economy.js';
import { constructionView } from '../game/construction.js';
import {
  TECH_CATEGORIES, TECH_MODS, canResearch, diffusionDiscount, effectiveTechCost, hasTech,
  researchPath, researchPointsOf, techById, techCost,
} from '../game/technology.js';
import { UNIT_TYPES } from '../game/units.js';
import { industryOverview } from '../game/industryView.js';
import { RGO_TYPES, depositsOf, provinceOutput, provinceRgoStatus } from '../game/provinces.js';
import { activeAlerts } from '../game/alerts.js';
import { INFAMY, INFAMY_COALITION } from '../game/infamy.js';
import { balanceAttribution, classIncomeAttribution, stabilityAttribution } from '../game/pulse.js';

const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d)}%`;
const coin = (v) => `£${(v ?? 0).toFixed(1)}`;
const signed = (v) => `${v >= 0 ? '+' : '−'}£${Math.abs(v ?? 0).toFixed(1)}`;
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
     BÜTÇE — beş kaldıraç + defter satırları
     ---------------------------------------------------------------------- */

  /** Ortak: bir bütçe kontrolünün dökümü. `arg` = kontrol anahtarı. */
  provideTooltip('budget', (arg) => {
    const nation = me();
    const view = budgetBreakdown(game.world, nation);
    const cfg = view?.controls?.[arg];
    if (!cfg) return null;
    const label = {
      taxLower: 'Lower class tax',
      taxMiddle: 'Middle class tax',
      taxUpper: 'Upper class tax',
      tariff: 'Tariff',
      armyFunding: 'Army funding',
      education: 'Education',
      welfare: 'Welfare',
    }[arg] ?? arg;

    // Vergi: matrah × oran = tahsilat. Üç sayı da dökümden gelir.
    if (arg.startsWith('tax')) {
      const incomes = classIncomeAttribution(nation);
      const mine = incomes?.[cfg.classId];
      return {
        type: 'breakdown',
        title: `${label} — ${cfg.value}%`,
        value: coin(cfg.collected),
        text: cfg.explain,
        rows: [
          { label: 'People in this class', value: formatPopulation(cfg.population) },
          { label: 'Taxable income / week', value: coin(cfg.base) },
          ...(mine && Math.abs(mine.delta) >= 0.05
            ? [{ label: 'Income vs last week', value: signed(mine.delta), tone: mine.delta >= 0 ? 'good' : 'bad' }]
            : []),
          { label: 'Rate', value: `${cfg.value}%` },
          { label: 'Collected', value: coin(cfg.collected), tone: 'good' },
        ],
        footer: `The system reads as <b>${view.controls.taxSummary.structure}</b>: `
          + 'the label follows your three rates, it is not set for you.',
      };
    }

    if (arg === 'tariff') {
      return {
        type: 'breakdown',
        title: `Tariff — ${cfg.value}%`,
        value: coin(cfg.revenue),
        text: cfg.explain,
        rows: [
          { label: 'Imports / week', value: coin(cfg.imports) },
          { label: 'Tariff revenue', value: coin(cfg.revenue), tone: cfg.revenue >= 0 ? 'good' : 'bad' },
        ],
        effects: [
          { label: 'Imported goods cost', value: `+${cfg.priceEffect}%`, tone: cfg.priceEffect > 0 ? 'bad' : 'good' },
          { label: 'Factories buying abroad', value: cfg.priceEffect > 0 ? 'earn less' : 'earn more' },
        ],
      };
    }

    if (arg === 'armyFunding') {
      return {
        type: 'mechanic',
        title: `Army funding — ${cfg.value}%`,
        text: cfg.explain,
        effects: Object.entries(cfg)
          .filter(([key]) => ['combat', 'reinforcement', 'training', 'supply'].includes(key))
          .map(([key, value]) => ({
            label: key[0].toUpperCase() + key.slice(1),
            value: typeof value === 'number' ? `×${value.toFixed(2)}` : String(value),
          })),
        footer: `Your government allows ${cfg.min}–${cfg.max}%.`,
      };
    }

    // Eğitim ve refah: sosyal program kaldıraçları.
    return {
      type: 'breakdown',
      title: `${label} — ${cfg.value}%`,
      value: cfg.cost != null ? `${coin(cfg.cost)} / week` : undefined,
      text: cfg.explain,
      rows: Object.entries(cfg)
        .filter(([key, value]) => typeof value === 'number'
          && !['value', 'min', 'max', 'cost'].includes(key))
        .slice(0, 4)
        .map(([key, value]) => ({
          label: key.replace(/([A-Z])/g, ' $1').toLowerCase(),
          value: value < 3 ? value.toFixed(2) : Math.round(value),
        })),
      footer: cfg.min > 0 ? `A law sets the floor at ${cfg.min}%.` : null,
    };
  });

  /** Ulusal banka: borç kapasitesi ve faiz. */
  provideTooltip('treasury', () => {
    const nation = me();
    const view = budgetBreakdown(game.world, nation);
    if (!view) return null;
    // "Bu hafta neyi oynatti": defterin en cok degisen satirlari (pulse.js).
    const moved = balanceAttribution(nation);
    const effects = moved ? [
      { label: 'Balance vs last week', value: signed(moved.delta), tone: moved.delta >= 0 ? 'good' : 'bad' },
      ...moved.lines.map((row) => ({
        label: `${row.label} (£${Math.abs(row.now).toFixed(1)})`,
        value: signed(row.delta),
        tone: row.delta >= 0 ? 'good' : 'bad',
      })),
    ] : [];
    return {
      type: 'breakdown',
      title: 'Treasury',
      value: `£${Math.round(view.treasury)}`,
      text: 'Last week\'s closed balance, not a forecast. '
        + `Income and spending are settled once a week.`,
      rows: [
        { label: 'Income', value: coin(view.income), tone: 'good' },
        { label: 'Spending', value: coin(view.expenses), tone: 'bad' },
        { label: 'Balance', value: signed(view.balance), tone: view.balance >= 0 ? 'good' : 'bad' },
        { label: 'Debt', value: `£${Math.round(view.debt)}` },
        { label: 'Borrowing room', value: `£${Math.round(Math.max(0, debtCapacity(nation) - view.debt))}` },
      ],
      effects,
      footer: moved ? 'Effects: what moved this week, largest first.' : null,
    };
  });

  /* ----------------------------------------------------------------------
     SANAYİ — tesis, mal, kadro, durum, eylemler
     ---------------------------------------------------------------------- */

  /** Sanayi dökümü bir tazelemede birden çok kez istenebilir: kısa bellek. */
  let cache = null;
  const industry = () => {
    const turn = game.world.turn;
    if (cache && cache.turn === turn && cache.nation === game.turns.playerNation) return cache.view;
    const view = industryOverview(game.world, me());
    cache = { turn, nation: game.turns.playerNation, view };
    return view;
  };
  const factoryOf = (id) => industry()?.factories.find((row) => row.id === id) ?? null;

  provideTooltip('fac-profit', (id) => {
    const row = factoryOf(id);
    if (!row) return null;
    const revenue = row.outputs.reduce(
      (sum, out) => sum + priceOf(game.world, out.id) * out.perWeek, 0,
    );
    const inputs = row.inputs.reduce(
      (sum, input) => sum + priceOf(game.world, input.id) * input.perWeek, 0,
    );
    return {
      type: 'breakdown',
      title: `${row.name} — weekly profit`,
      value: signed(row.profit),
      note: row.reason,
      rows: [
        { label: 'Output sold', value: coin(revenue), tone: 'good' },
        { label: 'Inputs bought', value: coin(-inputs), tone: 'bad' },
        { label: 'Wages', value: coin(-row.wages), tone: 'bad' },
        ...(row.subsidyPaid > 0
          ? [{ label: 'Treasury subsidy', value: coin(row.subsidyPaid), tone: 'good' }] : []),
        { label: 'Profit', value: signed(row.profit), tone: row.profit >= 0 ? 'good' : 'bad' },
      ],
      footer: `Margin ${pct(row.margin, 1)}. Prices come from the `
        + `${tipTerm('market', 'world market')}.`,
    };
  });

  provideTooltip('fac-workers', (id) => {
    const row = factoryOf(id);
    if (!row) return null;
    return {
      type: 'breakdown',
      title: `${row.name} — workforce`,
      value: `${formatPopulation(row.employees)} / ${formatPopulation(row.jobs)}`,
      text: 'Factories hire once a month from the lower class. A plant that fills '
        + 'every post and turns a profit expands on its own.',
      rows: [
        { label: 'Posts filled', value: pct(row.fill) },
        { label: 'Level', value: `${row.level} / ${row.maxLevel}` },
        { label: 'Empty posts', value: formatPopulation(Math.max(0, row.jobs - row.employees)) },
      ],
    };
  });

  provideTooltip('fac-status', (id) => {
    const row = factoryOf(id);
    if (!row) return null;
    return {
      type: 'simple',
      title: row.status.label,
      text: `${row.reason}. This is the plant's single primary state; the same `
        + 'reading drives the left-hand warning count and the Needs Attention filter.',
    };
  });

  provideTooltip('fac-upgrade', (id) => {
    const row = factoryOf(id);
    if (!row) return null;
    return row.upgradeBlocked
      ? { type: 'simple', title: 'Expansion not possible', text: row.upgradeBlocked }
      : {
        type: 'breakdown',
        title: `Expand to level ${row.level + 1}`,
        value: `£${Math.round(row.upgradeCost)}`,
        text: 'The treasury pays up front and the work enters the construction queue.',
        rows: [
          { label: 'New capacity', value: formatPopulation(row.jobs / row.level * (row.level + 1)) },
          { label: 'Paid from', value: 'Treasury' },
        ],
      };
  });

  provideTooltip('fac-subsidy', (id) => {
    const row = factoryOf(id);
    if (!row) return null;
    return {
      type: 'mechanic',
      title: row.subsidized ? 'Subsidy active' : 'Subsidise this plant',
      text: 'The treasury covers the plant\'s losses so it keeps its workers instead '
        + 'of shedding them. There is no fixed fee — you pay exactly the loss.',
      effects: row.subsidized
        ? [{ label: 'Paid this week', value: coin(row.subsidyPaid), tone: 'bad' }]
        : [{ label: 'Current loss', value: coin(Math.min(0, row.profit)), tone: 'bad' }],
    };
  });

  /** Mal künyesi: ne eder, kim üretir. `arg` = goodId. */
  provideTooltip('good', (goodId) => {
    const good = GOODS[goodId];
    if (!good) return null;
    const state = game.world.market?.goods?.[goodId];
    return {
      type: 'breakdown',
      title: good.name,
      value: `£${priceOf(game.world, goodId).toFixed(2)}`,
      text: `A ${good.category} good. Its price moves with world supply and demand.`,
      rows: state ? [
        { label: 'Base price', value: `£${good.basePrice.toFixed(2)}` },
        { label: 'World supply', value: state.supply.toFixed(1) },
        { label: 'World demand', value: state.demand.toFixed(1) },
      ] : [],
    };
  });

  provideTooltip('market', () => ({
    type: 'mechanic',
    title: 'World market',
    text: 'Every nation sells its surplus and buys its shortfall into one pool. '
      + 'Prices move where supply and demand part; a tariff raises what your own '
      + 'buyers pay for the imported share.',
  }));

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

  provideTooltip('rgo', () => {
    const tile = game.selected;
    if (!tile?.province) return null;
    const rgo = provinceRgoStatus(tile);
    const province = game.world.provinces?.[tile.provinceId];
    if (!rgo.type || !province) return null;
    // Satır başına haftalık çıktı motorun kendi hesabından (provinceOutput).
    const output = provinceOutput(game.world, province);
    const effects = depositsOf(tile.province).map((line) => {
      const type = RGO_TYPES[line.id];
      return type ? {
        label: `${type.icon} ${type.name} · ${line.hexes} hex`,
        value: `${(output[type.goodId] ?? 0).toFixed(2)}/wk`,
      } : null;
    }).filter(Boolean);
    return {
      type: 'breakdown',
      title: province.name ?? 'Province',
      value: `${pct(rgo.efficiency)} worked`,
      text: 'Every hex yields its own resource. Farms and mines employ the lower class '
        + 'who are not in factories or under arms; those left over are unemployed.',
      effects,
      rows: [
        { label: 'Workforce', value: formatPopulation(rgo.workforce) },
        { label: 'Jobs', value: formatPopulation(rgo.jobs) },
        { label: 'Unemployed', value: formatPopulation(rgo.unemployed), tone: rgo.unemployed > 0 ? 'bad' : '' },
      ],
      rowsLabel: 'Labour',
    };
  });

  /* ----------------------------------------------------------------------
     UST CUBUK — istikrar, sohret, ordu, insan gucu
     Tarayicinin `title` balonu bir saniye gecikiyor, duz metin basiyor ve
     ekran goruntusune bile girmiyor; kor oyun testinde "tooltip yok" diye
     okundu. Ayni bilgi artik geciktirmeli kartta.
     ---------------------------------------------------------------------- */

  provideTooltip('stability', () => {
    const nation = me();
    const bd = nation?.economy?.stabilityBreakdown;
    if (!bd) {
      return {
        type: 'simple',
        title: 'Stability',
        text: 'Measured after the first weekly tick; the opening value is a placeholder.',
      };
    }
    const pt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}`;
    const rows = [{ label: 'Household satisfaction', value: pt(bd.base), tone: 'good' }];
    if (bd.occupation < -0.0005) {
      rows.push({
        label: `Occupied territory (${Math.round(bd.occupiedShare * 100)}% of ${bd.occupiedTiles} hexes)`,
        value: pt(bd.occupation), tone: 'bad',
      });
    }
    if (bd.war < -0.0005) {
      rows.push({
        label: `War exhaustion (${bd.warFronts} front${bd.warFronts === 1 ? '' : 's'})`,
        value: pt(bd.war), tone: 'bad',
      });
    }
    if (bd.unemployment < -0.0005) {
      rows.push({
        label: `Unemployment (${formatPopulation(bd.unemployed)} without work)`,
        value: pt(bd.unemployment), tone: 'bad',
      });
    }
    if ((bd.legitimacy ?? 0) < -0.0005) {
      rows.push({
        label: `Government backing (${bd.leader} ${Math.round(bd.leaderSupport)}% vs your ${bd.ruling} ${Math.round(bd.rulingSupport)}%)`,
        value: pt(bd.legitimacy), tone: 'bad',
      });
    }
    // Bu haftanin farki: hangi bilesen oynadi (pulse.js).
    const moved = stabilityAttribution(nation);
    const effects = moved
      ? [
        { label: 'Change vs last week', value: pt(moved.delta), tone: moved.delta >= 0 ? 'good' : 'bad' },
        ...moved.parts.map((row) => ({ label: row.label, value: pt(row.delta), tone: row.delta >= 0 ? 'good' : 'bad' })),
      ]
      : [
        { label: 'Population growth', value: 'follows it' },
        { label: 'Province control', value: 'recovers faster when high' },
        { label: 'Factory hiring', value: 'faster when high' },
      ];
    return {
      type: 'breakdown',
      title: 'Stability',
      value: `${(bd.total * 100).toFixed(1)}%`,
      text: 'How firmly the country holds together: household satisfaction minus '
        + 'occupation, war, unemployment and a government the people do not back. Satisfaction rises when the basket gets '
        + 'cheaper, tax falls or welfare rises. It steers population growth, '
        + 'province control and factory hiring.',
      rows,
      effects,
      footer: moved ? 'Effects: what moved this week. Click the figure to pin the breakdown.'
        : 'Click the figure to pin this breakdown.',
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

  provideTooltip('manpower', () => ({
    type: 'mechanic',
    title: 'Manpower',
    text: 'Recruitable population left in your provinces. Every regiment you order '
      + 'draws from it, mobilisation draws more, and disbanded survivors return to it.',
  }));

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
      layers: ['Layers', 'Grid, labels, live sea, and the seed of this world.'],
    };
    const row = table[mode];
    return row ? { type: 'simple', title: row[0], text: row[1] } : null;
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

  /** Yatirimci santiyesine hazine destegi: ne oder, ne alir. */
  provideTooltip('fund', (projectId) => {
    const project = (industry()?.construction ?? []).find((row) => String(row.id) === String(projectId));
    if (!project) return null;
    const quarter = Math.max(1, Math.ceil(project.owed * 0.25));
    return {
      type: 'breakdown',
      title: `Top up ${project.name}`,
      value: `£${Math.round(project.owed)} unpaid`,
      text: project.stalled
        ? 'The investors ran out of capital and the site is dormant. Treasury money '
          + 'wakes it; the plant stays theirs, the goods reach your market.'
        : 'Investors are still paying; the treasury can shorten the wait.',
      rows: [
        { label: 'Click pays', value: `£${quarter}` },
        { label: 'Shift-click pays', value: `£${Math.round(project.owed)}` },
        { label: 'Booked to', value: 'construction line' },
      ],
    };
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
     İNŞAAT — özet şeridi ve kapasite eylemleri (construction.constructionView)
     ---------------------------------------------------------------------- */

  provideTooltip('construction', (arg) => {
    const nation = me();
    if (!nation) return null;
    const view = constructionView(nation);
    const cap = view.capacity;
    switch (arg) {
      case 'power':
        return {
          type: 'breakdown',
          title: 'Build power',
          value: `${view.power.toFixed(1)}/wk`,
          text: 'Work poured into the queue each week, top project first. Factories, '
            + 'expansions and capacity levels all draw on this one pool.',
          rows: [
            { label: 'Base', value: `${view.basePower}` },
            { label: `Capacity levels (${cap.level} × ${cap.perLevel})`, value: `+${cap.level * cap.perLevel}` },
            { label: 'Railway technology & credit', value: `${view.power - view.basePower - cap.level * cap.perLevel >= 0 ? '+' : '−'}${Math.abs(view.power - view.basePower - cap.level * cap.perLevel).toFixed(1)}` },
            { label: 'Build power', value: `${view.power.toFixed(1)}/wk`, tone: 'good' },
          ],
        };
      case 'queue':
      case 'clears':
        return {
          type: 'breakdown',
          title: arg === 'queue' ? 'Construction queue' : 'Queue clears in',
          value: view.own.length ? `~${view.clearsIn} wk` : 'empty',
          text: 'Your own projects, built top to bottom. A capacity level always goes '
            + 'first; investor sites wait for their money, not for your order.',
          rows: [
            { label: 'Projects', value: `${view.own.length}` },
            { label: 'Work left', value: `${Math.round(view.workLeft)}` },
            { label: 'Build power', value: `${view.power.toFixed(1)}/wk` },
            { label: 'Weeks to clear', value: view.own.length ? `~${view.clearsIn}` : '—' },
          ],
        };
      case 'upkeep':
        return {
          type: 'breakdown',
          title: 'Construction upkeep',
          value: `−£${view.upkeep.toFixed(1)}/wk`,
          text: 'Every capacity level costs upkeep whether or not anything is being built. '
            + 'Dissolve a level to shed it; there is no refund.',
          rows: [
            { label: `Levels (${cap.level} × £${cap.upkeepPerLevel})`, value: `−£${view.upkeep.toFixed(1)}`, tone: 'bad' },
          ],
          footer: 'Booked on the Budget screen under Construction.',
        };
      case 'investors':
        return {
          type: 'breakdown',
          title: 'Investor sites',
          value: `${view.investors.length}`,
          text: 'Factories that private capital founds and pays for. They share your build '
            + 'power once funded. The Factories screen can top one up from the treasury.',
          rows: [
            { label: 'Capital raised', value: `£${view.privateInflow.toFixed(1)}/wk` },
            { label: 'Sites waiting for money', value: `${view.investors.filter((row) => row.funded < 100).length}` },
          ],
          footer: `Private capital comes from upper-class savings and factory profits (${tipTerm('term', 'private capital', 'private-capital')}).`,
        };
      case 'invest':
        return cap.blocked
          ? { type: 'simple', title: 'Cannot invest', text: esc(cap.blocked[0].toUpperCase() + cap.blocked.slice(1)) }
          : {
            type: 'breakdown',
            title: `Capacity level ${cap.level + cap.pending + 1}`,
            value: `£${cap.cost}`,
            text: 'Paid up front. The level itself is built by the queue and always goes first.',
            effects: [
              { label: 'Build power', value: `+${cap.perLevel}/wk`, tone: 'good' },
              { label: 'Upkeep', value: `−£${cap.upkeepPerLevel}/wk`, tone: 'bad' },
            ],
            footer: 'Each further level costs 35% more than the first.',
          };
      case 'divest':
        return {
          type: 'simple',
          title: 'Dissolve a capacity level',
          text: cap.level > 0
            ? `Removes one level at once: −${cap.perLevel} build power, saves £${cap.upkeepPerLevel}/wk. No refund.`
            : 'There is no capacity level to dissolve.',
        };
      default:
        return null;
    }
  });

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

    const effects = [];
    for (const [key, label] of Object.entries(TECH_MODS)) {
      const value = tech[key];
      if (!Number.isFinite(value) || value === 0) continue;
      // Tedarik tüketiminde AZALMA iyidir; eğitim kadrosu düz slottur.
      const good = key === 'supplyConsumption' ? value < 0 : value > 0;
      const shown = key === 'trainingCapacity'
        ? `+${value}` : `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(0)}%`;
      effects.push({ label, value: shown, tone: good ? 'good' : 'bad' });
    }
    for (const typeId of tech.unlock ?? []) {
      effects.push({ label: 'Unlocks', value: FACTORIES[typeId]?.name ?? typeId, tone: 'good' });
    }
    for (const typeId of tech.unlockUnit ?? []) {
      effects.push({ label: 'Fields early', value: UNIT_TYPES[typeId]?.name ?? typeId, tone: 'good' });
    }

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
      text: 'The schooling level of the nation. It feeds research and factory hiring, and '
        + 'drifts slowly toward a target set by education spending, the welfare law and technology.',
      rows: [
        { label: 'Now', value: pct(nation.economy?.literacy, 1) },
        { label: 'Heading toward', value: pct(literacyTargetOf(nation), 1), tone: 'good' },
      ],
      // Nufus ekranindaki oran sinif ve sehirle duzeltilmis halidir; iki ayri
      // sayi gorulunce hangisinin ne oldugu burada bir kez soylenir.
      footer: 'Half the gap closes in about three years. The Population screen adds class and '
        + 'town: townsfolk and the rich read more, peasants less.',
    }),
    research: (nation) => ({
      type: 'breakdown',
      title: 'Research points',
      value: `${researchPointsOf(nation).toFixed(2)}/wk`,
      text: 'Produced every week by literate people, the middle class and clerks, then '
        + 'raised by technology and a free press. They flow into the technology being researched.',
    }),
    needs: (nation) => ({
      type: 'mechanic',
      title: 'Needs met',
      text: 'How much of their weekly basket households actually get. Below full, '
        + 'satisfaction falls; when food runs short, people starve.',
      effects: [
        { label: 'Satisfaction', value: 'rises with it', tone: 'good' },
        { label: 'Population growth', value: 'follows it' },
      ],
    }),
    unrest: () => ({
      type: 'mechanic',
      title: 'Unrest',
      text: 'From 0 to 10. Foreign culture, fresh conquest, war and occupation push it up; '
        + 'welfare and minority rights pull it down. At 7 or more, a province with a foreign '
        + 'majority can break away.',
    }),
    growth: () => ({
      type: 'mechanic',
      title: 'Population growth',
      text: 'Births minus deaths, famine and the men taken into the army. Food and '
        + 'satisfaction set the pace.',
    }),
    employment: () => ({
      type: 'mechanic',
      title: 'Employment',
      text: 'Share of working people who have a job on a farm, in a mine or in a factory. '
        + 'Unemployment lowers satisfaction and stability.',
    }),
    gdp: (nation) => ({
      type: 'simple',
      title: 'Gross domestic product',
      text: `Raw output plus the value factories add, per week: £${Math.round(nation.economy?.gdp ?? 0)}.`,
    }),
    'private-capital': (nation) => ({
      type: 'breakdown',
      title: 'Private capital',
      value: `£${Math.round(nation.politics?.privateCapital ?? 0)}`,
      text: 'Money the upper class reinvests: part of its household surplus and 30% of factory '
        + 'profits. It founds and expands factories where your government allows private industry.',
      rows: [
        { label: 'Raised per week', value: `£${(nation.politics?.privateInflow ?? 0).toFixed(1)}` },
      ],
    }),
    'trade-balance': () => ({
      type: 'mechanic',
      title: 'Trade balance',
      text: 'Goods sold abroad minus goods bought abroad this week, at world prices. '
        + 'A deficit is not a debt; it is paid from the same week\'s income.',
    }),
    shortages: () => ({
      type: 'mechanic',
      title: 'Critical shortages',
      text: 'Goods your people or factories need that neither your land nor the world '
        + 'market can supply this week. Shortages raise prices and idle factories.',
    }),
    officers: () => ({
      type: 'mechanic',
      title: 'Officers',
      text: 'Generals and admirals. Each commands an army or fleet; their skill shapes '
        + 'battle rolls and sieges.',
    }),
    upkeep: () => ({
      type: 'mechanic',
      title: 'Military upkeep',
      text: 'Weekly cost of the standing army and fleet, scaled by army funding on the Budget screen.',
    }),
  };

  provideTooltip('term', (arg) => {
    const nation = me();
    const entry = GLOSSARY[arg];
    return nation && entry ? entry(nation) : null;
  });
}
