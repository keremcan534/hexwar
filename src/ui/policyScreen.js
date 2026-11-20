// DEVLET POLİTİKALARI EKRANI — vassal merdiveni, işgal yasası, ceza state'leri,
// kültür kaynaşması. Sayılar game/policyView.js dökümündendir; burada formül yok.
//
// Dört karar da ulus düzeyindedir: oyuncu kırk vassalı tek tek dolaşmaz. Geri
// dönüşü zor olanlar (sert duruş, kamp açmak, halk göndermek) iki tık ister.

import {
  badge, blockedAttr, empty, esc, kpi, kpiRow, ledger, meter, money, num, panel, pct, segmented, tipAttr,
} from './kit.js';
import { formatPopulation } from '../game/economy.js';
import { policiesView } from '../game/policyView.js';
import { setPolicyOrder } from '../game/orders.js';
import { setOccupationLaw, setVassalDoctrine, setVassalStance } from '../game/policies.js';
import {
  cancelFusion, closeCamp, openCamp, setCampIntake, setCampRegime, startFusion,
} from '../game/culturePolicy.js';
import { POLICY_ORDER } from '../game/policyDefs.js';

const signedPts = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
const toneClass = { harsh: 'neg', neutral: '', kind: 'pos' };

/** Alanın sürekli emri: başlığın sağında tek anahtar. */
function orderPill(order) {
  const on = order.mode === POLICY_ORDER.AUTO;
  return `<button type="button" class="auto-pill${on ? ' on' : ''}" data-pol-order="${order.id}" aria-pressed="${on}"${tipAttr({ text: `${order.name} · ${on ? 'run by the cabinet' : 'in your hands'}\n${order.desc}` })}><i class="auto-led" aria-hidden="true"></i>AUTO <b>${on ? 'ON' : 'OFF'}</b></button>`;
}

/**
 * Tek başlıklı ince tablo. Kerem kartı ve uzayan satırı boşluk israfı sayıyor:
 * etiket bir kez yazılır, satır 26 piksel, sütunlar içeriğe göre sabit.
 * `columns`: [etiket, genişlik]; ilk sütun ad, son sütun düğmedir.
 */
function policyTable(columns, rows) {
  const cols = columns.map((column) => column[1]).join(' ');
  const cell = (html, i) => `<span class="${i === 0 ? 'n' : ''}">${html}</span>`;
  return `<div class="k-pol-table" style="--cols:${cols}">
    <div class="k-pol-tr head">${columns.map((column, i) => cell(esc(column[0]), i)).join('')}</div>
    ${rows.map((row) => `<div class="k-pol-tr">${row.map(cell).join('')}</div>`).join('')}
  </div>`;
}

function stanceTip(row) {
  return { text: [
    row.name,
    row.desc,
    `Tribute ${pct(row.tribute)} of their output${row.weekly > 0 ? ` (${money(row.weekly, 1)} / week)` : ''}`,
    row.autonomy ? `Autonomy target ${signedPts(row.autonomy)}` : '',
    row.regard ? `Their regard for us ${row.regard > 0 ? 'rises' : 'falls'} every week` : '',
    row.infamy ? `Infamy +${num(row.infamy, 3)} / week` : '',
  ].filter(Boolean).join('\n') };
}

function vassalPanel(view, state, order) {
  const v = view.vassals;
  // Tek tek ayar istisnadır: merdiven yalnız satır seçilince açılır, doktrin yeter.
  const picked = v.rows.find((row) => row.id === state.policyVassal) ?? null;
  const armed = (key) => state.confirm === key;
  const doctrine = segmented(v.doctrines.map((row) => ({
    label: esc(row.name),
    on: row.id === v.doctrine,
    confirm: armed(`doctrine:${row.id}`),
    attrs: `data-pol-doctrine="${row.id}"`,
    tip: stanceTip(row),
    blocked: view.power < v.power,
  })));
  const rows = v.rows.map((row) => {
    const toll = [
      row.toll.hungerDead ? `${formatPopulation(row.toll.hungerDead)} lost to hunger` : '',
      row.toll.abducted ? `${formatPopulation(row.toll.abducted)} deported` : '',
      row.toll.levied ? `${formatPopulation(row.toll.levied)} levied` : '',
      row.toll.stripped ? `${row.toll.stripped} development tiers dismantled` : '',
      row.toll.subsidised ? `${money(row.toll.subsidised, 0)} invested` : '',
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="k-prow k-prow-pick${picked?.id === row.id ? ' on' : ''}" data-pol-vassal="${row.id}">
      <span class="k-prow-name"><b>${esc(row.name)}</b>${badge(row.stanceName, toneClass[row.tone])}${row.manual ? badge('set by hand', 'dim') : ''}</span>
      <span class="k-prow-share"${tipAttr({ text: `Autonomy ${Math.round(row.autonomy)}\nAt 80 they break away if we falter.` })}>${meter(row.autonomy / 100, { tone: row.autonomy >= 60 ? 'neg' : row.autonomy >= 40 ? 'warn' : 'pos', mark: 0.8 })}<b>${Math.round(row.autonomy)}</b></span>
      <span class="k-prow-where"><span><b>${money(row.tribute, 1)}</b> / wk</span><small>${esc(toll || `${formatPopulation(row.population)} people`)}</small></span>
    </button>`;
  }).join('');
  const ladder = picked ? `<h4 class="k-sub">${esc(picked.name)}: treatment</h4>${segmented(picked.options.map((row) => ({
    label: esc(row.name),
    on: row.id === picked.stance,
    confirm: armed(`stance:${picked.id}:${row.id}`),
    attrs: `data-pol-stance="${picked.id}:${row.id}"`,
    tip: row.blockers.length && row.id !== picked.stance ? { text: ['Not possible now', ...row.blockers].join('\n') } : stanceTip(row),
    blocked: row.blockers.length > 0,
  })))}` : '';
  return panel('Vassals', `<h4 class="k-sub">Doctrine for all vassals · ${v.power} PP</h4>${doctrine}
    ${v.rows.length ? `<div class="k-ptable">${rows}</div>${ladder}` : empty('We hold no vassals. Take one at the peace table.')}`, {
    sub: v.rows.length ? `${money(v.weekly, 1)} tribute a week` : 'harsh on the left, generous on the right',
    right: orderPill(order),
  });
}

function occupationPanel(view, state, order) {
  const o = view.occupation;
  const laws = segmented(o.laws.map((row) => ({
    label: esc(row.name),
    on: row.id === o.law,
    confirm: state.confirm === `law:${row.id}`,
    attrs: `data-pol-occupation="${row.id}"`,
    blocked: row.blockers.length > 0,
    tip: { text: [
      row.name,
      row.desc,
      `Takes ${pct(row.extract)} of the occupied economy`,
      `Resistance ${row.resistance > 0 ? '+' : '−'}${num(Math.abs(row.resistance), 1)} a week`,
      row.infamy ? `Infamy +${num(row.infamy, 3)} per state each week` : '',
      row.pop ? `Population −${num(row.pop * 5200, 1)}% a year` : '',
      row.labour ? `Workers are shipped to our states` : '',
      row.ruin ? 'Each year a development tier is ruined' : '',
      row.afterControl ? `If we keep the state: compliance ${signedPts(row.afterControl)}` : '',
      ...(row.blockers.length && row.id !== o.law ? ['', 'Not possible now', ...row.blockers] : []),
    ].filter((line) => line !== null && line !== false).join('\n') },
  })));
  const rows = o.held.length ? ledger(o.held.map((row) => ({
    label: esc(row.name),
    sub: `${esc(row.owner)} · resistance ${Math.round(row.resistance)}%`,
    value: `${money(row.income, 2)} / wk`,
    tip: { text: `${row.name}\n${formatPopulation(row.population)} people, ${pct(row.share)} under our control.\nResistance ${Math.round(row.resistance)}% cuts the income and wears down the garrison.` },
  }))) : empty('We occupy no enemy land.');
  return panel('Occupied land', `${laws}${rows}${o.heldCount > o.held.length ? `<small class="k-more">and ${o.heldCount - o.held.length} more</small>` : ''}`, {
    sub: o.heldCount ? `${money(o.income, 1)} a week from ${o.heldCount} state${o.heldCount === 1 ? '' : 's'}` : `changing the law costs ${o.power} PP`,
    right: orderPill(order),
  });
}

function campPanel(view, state, order) {
  const c = view.camps;
  // Rejimler tablodur: seçmeden önce dört rejimin bedeli yan yana okunur.
  const regimes = policyTable([['Regime', 'minmax(0,1fr)'], ['Deaths / yr', '62px'], ['IC / 100K', '54px'], ['Infamy', '40px'], ['Draft', '34px'], ['', '56px']], c.regimes.map((row) => {
    const key = `regime:${row.id}`;
    const active = row.id === c.regime;
    return [`<span${tipAttr({ text: `${row.name}\n${row.desc}` })}>${esc(row.short)}</span>`,
      `${(row.yearlyToll * 100).toFixed(1)}%`, num(row.yieldPerUnit, 2), `×${num(row.severity, 1)}`, row.penal ? pct(row.penal) : '—',
      `<button type="button" class="k-btn sm${active ? ' on' : ''}${state.confirm === key ? ' confirming' : ''}" data-pol-regime="${row.id}"${active ? ' disabled aria-pressed="true"' : ''}>${active ? 'Active' : state.confirm === key ? 'Confirm' : 'Set'}</button>`];
  }));
  const camps = c.camps.map((row) => {
    const key = `close:${row.id}`;
    return [esc(row.name), `${formatPopulation(row.inmates)} / ${formatPopulation(row.capacity)}`, money(row.output, 1), formatPopulation(row.deaths), num(row.unrest, 1),
      `<button type="button" class="k-btn sm${state.confirm === key ? ' confirming' : ''}" data-pol-close="${row.id}"${tipAttr({ text: 'Close this penal state\nThe inmates stay where they are, free.' })}>${state.confirm === key ? 'Confirm' : 'Close'}</button>`];
  });
  const sites = c.camps.length >= c.cap ? [] : c.candidates.map((row) => {
    const key = `open:${row.id}`;
    return [esc(row.name), formatPopulation(row.population), pct(row.foreign),
      `<button type="button" class="k-btn sm danger${state.confirm === key ? ' confirming' : ''}" data-pol-open="${row.id}"${row.blockers.length ? blockedAttr(row.blockers) : tipAttr({ text: `Make this a penal state\nCost: ${c.openPower} PP, infamy +${c.openInfamy}.\nThe state's unrest climbs, stability falls, and if it is captured the world learns everything.` })}>${state.confirm === key ? 'Confirm' : 'Designate'}</button>`];
  });
  const peoples = c.camps.length ? c.peoples.map((row) => {
    const key = `intake:${row.id}`;
    return [esc(row.name), formatPopulation(row.people), pct(row.share), row.progress > 0 ? `${Math.round(row.progress)}%` : '—',
      `<button type="button" class="k-btn sm${row.on ? ' on' : ' danger'}${state.confirm === key ? ' confirming' : ''}" data-pol-intake="${row.id}"${!row.on && row.blockers.length ? blockedAttr(row.blockers) : tipAttr({ text: row.on ? 'Stop sending them. Those already held stay held.' : `Send them to the penal states\nInfamy +${c.intakeInfamy}. Their movement grows and kin states turn against us.` })}>${state.confirm === key ? 'Confirm' : row.on ? 'Stop' : 'Send'}</button>`];
  }) : [];
  const peopleTable = peoples.length ? `<div><h4 class="k-sub">Peoples sent here</h4>${policyTable([['People', 'minmax(0,1fr)'], ['Count', '58px'], ['Share', '44px'], ['Movement', '66px'], ['', '78px']], peoples)}</div>` : '';
  const siteTable = sites.length ? `<div><h4 class="k-sub">Designate a state · ${c.openPower} PP</h4>${policyTable([['State', 'minmax(0,1fr)'], ['People', '58px'], ['No rights', '62px'], ['', '86px']], sites)}</div>` : '';
  const stat = (label, value, tone = '') => `<span class="k-pol-stat"><small>${label}</small><b class="${tone}">${value}</b></span>`;
  const summary = c.camps.length ? `<div class="k-pol-stats">
    ${stat('Held', formatPopulation(c.inmates))}
    ${stat('Output', `${money(c.output, 1)} / wk`, 'pos')}
    ${stat('Deaths', `${formatPopulation(c.weeklyDeaths)} / wk`, 'neg')}
    ${stat('Deaths so far', formatPopulation(c.totalDeaths), 'neg')}
    ${stat('Infamy', `+${num(c.infamy, 3)} / wk`, 'neg')}
    ${stat('Stability', `${Math.round(c.stability * 100)}`, 'neg')}
  </div>` : '';
  return panel('Penal states', `${summary}
    ${camps.length ? policyTable([['Penal state', 'minmax(0,1fr)'], ['Held', '112px'], ['IC / wk', '64px'], ['Deaths / wk', '78px'], ['Unrest', '52px'], ['', '78px']], camps) : ''}
    <div class="k-pol-duo">
      <div>${regimes}${peopleTable}${c.camps.length && !c.peoples.length ? empty('Every people here holds full rights.') : ''}</div>
      ${siteTable}
    </div>`, {
    sub: `${c.camps.length} of ${c.cap}`,
    right: orderPill(order),
  });
}

function fusionPanel(view, state, order) {
  const f = view.fusion;
  const current = f.current ? policyTable([['Fusing with', 'minmax(0,1fr)'], ['Apart', '48px'], ['From', '44px'], ['Weeks', '48px'], ['', '64px']], [[
    esc(f.current.name), pct(f.current.share), pct(f.current.from), String(f.current.weeks),
    `<button type="button" class="k-btn sm" data-pol-unfuse${tipAttr({ text: `Stop the fusion. What has merged stays merged.\nIt completes when fewer than ${pct(f.current.finish)} remain apart.` })}>Stop</button>`,
  ]]) : '';
  const list = !f.current && f.candidates.length ? policyTable([['People', 'minmax(0,1fr)'], ['Count', '58px'], ['Share', '44px'], ['', '92px']], f.candidates.map((row) => {
    const key = `fuse:${row.id}`;
    return [esc(row.name), formatPopulation(row.people), pct(row.share),
      `<button type="button" class="k-btn sm primary${state.confirm === key ? ' confirming' : ''}" data-pol-fuse="${row.id}"${row.blockers.length ? blockedAttr(row.blockers) : tipAttr({ text: `Fuse the ${row.name} with our people\nOver years they merge into our culture, even in their homeland, and their demands fade. Prestige +${f.prestige} when it completes.` })}>${state.confirm === key ? 'Confirm' : `Fuse · ${f.power} PP`}</button>`];
  })) : '';
  return panel('Fusion of peoples', `${current || list || empty('Accept a people as full citizens first.')}${f.fused.length ? `<small class="k-more">Already one with us: ${f.fused.map(esc).join(', ')}</small>` : ''}`, {
    sub: 'two peoples become one',
    right: orderPill(order),
  });
}

export function renderPolicies(game, me, state) {
  const view = policiesView(game.world, me, game.turns?.turn ?? game.world.turn ?? 0);
  const orderOf = (id) => view.orders.find((row) => row.id === id);
  const kpis = kpiRow([
    kpi({ label: 'Political power', value: String(Math.round(view.power)), sub: 'pays for every change', tip: 'power' }),
    kpi({ label: 'Infamy', value: num(view.infamy, 1), sub: 'above 22 neighbours may unite', cls: view.infamy >= 15 ? 'warn' : '', meter: view.infamy / 30, meterTone: 'neg' }),
    kpi({ label: 'Vassal tribute', value: money(view.vassals.weekly, 1), sub: `${view.vassals.rows.length} vassal${view.vassals.rows.length === 1 ? '' : 's'}` }),
    kpi({ label: 'Occupation income', value: money(view.occupation.income, 1), sub: `${view.occupation.heldCount} state${view.occupation.heldCount === 1 ? '' : 's'} held` }),
    kpi({ label: 'Held in penal states', value: formatPopulation(view.camps.inmates), sub: view.camps.camps.length ? `${formatPopulation(view.camps.weeklyDeaths)} deaths a week` : 'none', cls: view.camps.inmates ? 'warn' : '' }),
  ]);
  return `${kpis}
    <div class="k-split k-policies" data-cat="policy">
      <div class="k-stack">
        ${vassalPanel(view, state, orderOf('vassals'))}
        ${occupationPanel(view, state, orderOf('occupation'))}
      </div>
      <div class="k-stack">
        ${campPanel(view, state, orderOf('camps'))}
        ${/* Kaynaşma sağda: solda üç panel 1536x864'te pencereden taşıyordu, ceza state'lerinin
              sütunu yarı boştu (2026-11-20, ölçüldü). */''}
        ${fusionPanel(view, state, orderOf('fusion'))}
      </div>
    </div>`;
}

/** Ekran düğmelerini oyunun kapılarına bağlar. */
export function bindPolicyScreen(screens) {
  const { game } = screens;
  const me = screens.me;
  const root = screens.el.body;
  const state = screens.uc;
  if (!me || !root.querySelector('.k-policies')) return;
  const world = game.world;
  const on = (selector, handler) => {
    for (const el of root.querySelectorAll(selector)) {
      el.onclick = (event) => {
        handler(el, event);
        game.emit('politics', me.id);
      };
    }
  };
  const confirmThen = (key, apply) => {
    if (state.confirm !== key) {
      state.confirm = key;
      screens.armConfirm('ucConfirmTimer', () => state.confirm === key, () => { state.confirm = null; });
      screens.refresh();
      return;
    }
    state.confirm = null;
    clearTimeout(screens.ucConfirmTimer);
    apply();
    screens.refresh();
  };
  on('[data-pol-order]', (el) => {
    const area = el.dataset.polOrder;
    const auto = el.getAttribute('aria-pressed') === 'true';
    setPolicyOrder(me, area, auto ? POLICY_ORDER.HOLD : POLICY_ORDER.AUTO);
    screens.refresh();
  });
  on('[data-pol-vassal]', (el) => {
    const id = Number(el.dataset.polVassal);
    state.policyVassal = state.policyVassal === id ? null : id;
    screens.refresh();
  });
  on('[data-pol-doctrine]', (el) => {
    const id = el.dataset.polDoctrine;
    confirmThen(`doctrine:${id}`, () => setVassalDoctrine(game, me, id));
  });
  on('[data-pol-stance]', (el) => {
    const [vassal, id] = el.dataset.polStance.split(':');
    confirmThen(`stance:${vassal}:${id}`, () => setVassalStance(game, me, Number(vassal), id));
  });
  on('[data-pol-occupation]', (el) => {
    const id = el.dataset.polOccupation;
    confirmThen(`law:${id}`, () => setOccupationLaw(game, me, id));
  });
  on('[data-pol-regime]', (el) => {
    const id = el.dataset.polRegime;
    confirmThen(`regime:${id}`, () => setCampRegime(me, id));
  });
  on('[data-pol-open]', (el) => {
    const id = Number(el.dataset.polOpen);
    confirmThen(`open:${id}`, () => openCamp(game, me, id));
  });
  on('[data-pol-close]', (el) => {
    const id = Number(el.dataset.polClose);
    confirmThen(`close:${id}`, () => closeCamp(game, me, id));
  });
  on('[data-pol-intake]', (el) => {
    const id = Number(el.dataset.polIntake);
    const sending = me.policies?.intake?.includes(id);
    if (sending) {
      setCampIntake(world, me, id, false);
      screens.refresh();
      return;
    }
    confirmThen(`intake:${id}`, () => setCampIntake(world, me, id, true));
  });
  on('[data-pol-fuse]', (el) => {
    const id = Number(el.dataset.polFuse);
    confirmThen(`fuse:${id}`, () => startFusion(game, me, id));
  });
  on('[data-pol-unfuse]', () => {
    cancelFusion(me);
    screens.refresh();
  });
}
