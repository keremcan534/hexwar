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
  GOODS, budgetBreakdown, debtCapacity, formatPopulation, priceOf,
} from '../game/economy.js';
import { industryOverview } from '../game/industryView.js';
import { provinceRgoStatus } from '../game/provinces.js';

const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d)}%`;
const coin = (v) => `£${(v ?? 0).toFixed(1)}`;
const signed = (v) => `${v >= 0 ? '+' : '−'}£${Math.abs(v ?? 0).toFixed(1)}`;

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
      return {
        type: 'breakdown',
        title: `${label} — ${cfg.value}%`,
        value: coin(cfg.collected),
        text: cfg.explain,
        rows: [
          { label: 'People in this class', value: formatPopulation(cfg.population) },
          { label: 'Taxable income / week', value: coin(cfg.base) },
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

  provideTooltip('rgo', (_, element) => {
    const tile = game.selected;
    if (!tile?.province) return null;
    const rgo = provinceRgoStatus(tile);
    if (!rgo.type) return null;
    return {
      type: 'breakdown',
      title: rgo.type.name,
      value: `${pct(rgo.efficiency)} worked`,
      text: `This province's raw output. It employs the countryside directly; `
        + 'idle hands here are the unemployment you see beside it.',
      rows: [
        { label: 'Workforce', value: `${formatPopulation(rgo.employed)} / ${formatPopulation(rgo.jobs)}` },
        { label: 'Unemployed', value: formatPopulation(rgo.unemployed), tone: rgo.unemployed > 0 ? 'bad' : '' },
        { label: 'Produces', value: `${tipTerm('good', GOODS[rgo.type.goodId]?.name ?? rgo.type.goodId, rgo.type.goodId)}` },
      ],
    };
  });

  provideTooltip('defense', () => ({
    type: 'mechanic',
    title: 'Defence',
    text: 'Terrain bonus plus any fort in range. A defender on this hex fights '
      + 'with this much extra strength.',
  }));

  provideTooltip('culture', () => ({
    type: 'mechanic',
    title: 'Culture',
    text: 'Provinces of a culture your state does not accept recover control more '
      + 'slowly and are unhappier. Citizenship law decides who counts as accepted.',
  }));
}
