// ULUSAL YÖNETİM EKRANLARI — Uluslar Çağı (TASARIM.md §16).
//
// Altı ekran, sekme künyeleriyle aynı adlar: Economy (tek çubuk: faturalar,
// ordu, halk, kalkınma; sekme kimliği hâlâ 'budget'), Trade (kaynak ve
// ticaret), Factories (çıktı zinciri, tüketim malı, üretim hatları),
// Development (kalkınma fonu ve state'ler; sekme kimliği 'construction'),
// Population (halklar ve birleşme), Politics (hükûmet, yasa, danışman,
// gündem, karar).
//
// KURAL (ilke 2): ekran formül KURMAZ. Her sayı oyunun döküm fonksiyonundan
// gelir (economyView, splitOutput, levelCost/levelGain, governmentView,
// agendaView...); burada yalnız biçim ve düğme vardır. Bileşenler kit.js'tedir;
// her sayının bilgi kartı tooltipData/tooltipState sağlayıcılarındandır.
// Bağlama `bindStateScreens` içindedir: her düğme bir `data-uc-*` özniteliği
// taşır.
//
// ADLANDIRMA (HOI4 modeli): kodda "province" denen küme oyuncunun gözünde
// STATE'tir (ekonomi, kalkınma, odak); ordunun yürüdüğü hex PROVINCE'tir.

import {
  DEVELOPMENT_CAP_BASE, DEVELOPMENT_CAP_LITERACY, DEVELOPMENT_MAX, EQUIPMENT, EQUIPMENT_IDS, FEED,
  HAND_OUTPUT, INDUSTRY_PER_DEV, INVEST, LINE_EFFICIENCY,
  RESOURCES, RESOURCE_IDS, SUPPLY,
} from '../game/econ/defs.js';
import { LAWS, lawIndex } from '../game/laws.js';
import {
  acceptedShareOf, economyView, formatPopulation, literacyTarget, populationOf, splitOutput,
} from '../game/economy.js';
import {
  LINE_PRIORITIES, consumerStability, feedTarget, lineAllocation, lineEfficiencyCap, lineEfficiencyGain,
  linePriorityOf, setFeed, setLinePriority,
} from '../game/econ/industry.js';
import { embargoed, setEmbargo } from '../game/econ/trade.js';
import { billCap } from '../game/econ/bills.js';
import { developmentCap, investmentTarget, levelCost, levelGain } from '../game/econ/investment.js';
import { outputFactors, provinceOutputOf } from '../game/econ/output.js';
import { LEDGER_LINES } from '../game/treasury.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import { provinceName } from '../game/provinces.js';
import { depositsOf } from '../game/econ/deposits.js';
import {
  PARTIES, appointGovernment, dismissAdvisor, enactRegime, governmentView,
  hireAdvisor, setCourse, setLaw,
} from '../game/politics.js';
import { agendaView, chooseAgenda } from '../game/agenda.js';
import { decisionsView, takeDecision } from '../game/decisions.js';
import { acceptCulture, revokeCulture } from '../game/culture.js';
import { releasePeople } from '../game/nationBirth.js';
import { concentrate, deport, forceAssimilation, forcedAssimilation, resettle } from '../game/culturePolicy.js';
import { FOCUSES, FOCUS_BY_ID, focusSlots } from '../game/focus.js';
import { focusBlockers, focusPreview, focusedStates, setFocus } from '../game/stateFocus.js';
import { DELEGATION_AREAS, isDelegated, lastDelegatedAction } from '../game/delegation.js';
import { formNation, formationBlockers, proposeUnion } from '../game/unification.js';
import { GOALS, goalMet } from '../game/hegemony.js';
import { nationManpower } from '../game/recruitment.js';
import { describeEffects, mod } from '../game/modifiers.js';
import {
  autoPill, badge, blockedAttr, chain, empty, esc, kpi, kpiRow, ledger, meter, money, num, panel, pct, pips, pts,
  segmented, short, signed, signedMoney, spark, tipAttr, tone,
} from './kit.js';
import { buildingArt, emblemArt, equipmentArt, lawArt, ledgerArt, resourceArt } from './icons/art.js';
import { peopleDetail, peoplesView, resettlementView } from '../game/peoplesView.js';
import { END_YEAR } from '../game/calendar.js';
import { techById, unlockTechOf } from '../game/technology.js';
import {
  MOVEMENT, crackdown, declareMartialLaw, grantConcessions, releaseAsVassal,
} from '../game/movements.js';

const turnOf = (game) => game.turns?.turn ?? game.world?.turn ?? 0;

/**
 * Yeni yasanın sanat setinde resmi yok: en yakın eskisinin amblemi. Labour
 * vergi yasasının yerine geldi (aynı üç kademe), resmi de onunkidir.
 */
const LAW_ART = { labour: 'tax' };

/**
 * Yasa kartı: gravür amblem, ad, yürürlükteki seçenek, seçenekler bölünmüş
 * kontrol olarak. Her seçeneğin kartı etkisini ve engelini söyler; ilk tık
 * onay ister (state.confirm), ikinci tık yasayı çıkarır.
 */
function lawCard(world, nation, lawId, confirm, { compact = false } = {}) {
  const law = LAWS[lawId];
  const current = lawIndex(nation, lawId);
  const view = governmentView(world, nation).laws.find((row) => row.id === lawId);
  const options = law.options.map((option, index) => {
    const blockers = view?.options[index]?.blockers ?? [];
    const key = `law:${lawId}:${index}`;
    return {
      label: confirm === key ? 'Confirm?' : esc(option.name),
      on: index === current,
      confirm: confirm === key,
      blocked: blockers.length > 0 && index !== current,
      attrs: `data-uc-law="${lawId}:${index}"`,
      tip: 'law-option',
      arg: `${lawId}:${index}`,
    };
  });
  return `<div class="k-law${compact ? ' compact' : ''}">
    <span class="k-law-art"${tipAttr('law', lawId)}>${lawArt(LAW_ART[lawId] ?? lawId, compact ? 'md' : 'lg')}</span>
    <div class="k-law-main">
      <div class="k-law-head"${tipAttr('law', lawId)}>
        <b>${esc(law.name)}</b>
        ${view?.lock ? badge(`locked ${view.lock}w`, 'warn') : ''}
        <small>${esc(law.options[current].desc)}</small>
      </div>
      ${segmented(options)}
    </div>
  </div>`;
}

// ================================================================ ECONOMY ===
//
// TEK ÇUBUK (2026-10-15). Eski bütçe ekranı hazine, vergi zinciri, borç ve
// enflasyon basıyordu; hepsi kalktı. Ekonomi tek bir haftalık ÇIKTIDIR ve
// tek çubukta dört paya bölünür: faturalar | ordu | halk | kalkınma.
// Oyuncunun tek kolu halkla kalkınma arasındaki tutamaçtır (doyurma hedefi).

/**
 * Fon defterinin satırları, SABİT sırayla (gelir önce, gider sonra). Boş
 * kalem sönük "—" ile yerinde durur: tek seferlik kalemler paneli büyütüp
 * küçültüyor, yanındaki grafik zıplıyordu (ölçüldü, eski bütçe).
 */
const FUND_LINES = ['investment', 'exports', 'treaty', 'grant', 'imports', 'development', 'outlay'];
/** Defterin yeni kalemlerinin sanat setinde madalyonu yok: en yakın eskisi. */
const FUND_ART = { investment: 'tax', grant: 'treaty', development: 'construction' };
const fundArt = (id) => ledgerArt(id) || ledgerArt(FUND_ART[id]);
const EMPTY_BILLS = {
  land: 0, sea: 0, war: 1, army: 0, navy: 0, schools: 0, martial: 0, owed: 0, room: 0, paid: 0, s: 1, atWar: false,
};
const FEED_TIP = 'Feed the people\nDrag right: more consumer goods — stability and growth, best near ×1.2. Drag left: more for development. The new share applies from next week.\n← → step ×0.05 · Auto hands it back to the ministry.';
const AUTO_FEED_TIP = 'Auto\nThe ministry sets the handle: 0.95-1.10 in peace by temperament, 0.85 at war, +0.10 while stability is below 40%.';

/** Fonun biriktirdiği kademe. CANLI hedef: Develop odağı hemen yansısın. */
function nextLevelOf(world, me) {
  const province = investmentTarget(world, me);
  if (!province) return null;
  return {
    province,
    name: provinceName(province.center),
    level: (province.econ.development ?? 1) + 1,
    cost: levelCost(province),
  };
}

/**
 * Çubuğun sabit kısmı: bu haftanın çıktısı, ödenen faturalar, ordunun
 * çektiği, halkın ihtiyacı. Tutamaç yalnız halkla kalkınma arasını oynatır;
 * gerisi önizlemede sabittir. İlk hafta kapanmadan pay yoktur (null).
 */
function barBase(world, me) {
  const economy = me.economy;
  const alloc = economy?.alloc;
  if (!alloc || !(alloc.output > 0)) return null;
  const bills = economy.bills ?? EMPTY_BILLS;
  const target = nextLevelOf(world, me);
  return {
    output: alloc.output,
    bills: alloc.bills,
    owed: bills.owed ?? alloc.bills,
    room: bills.room ?? alloc.output,
    s: bills.s ?? 1,
    armyCap: alloc.armyCap ?? 0,
    drawn: alloc.army ?? 0,
    need: economy.consumer?.need ?? 0,
    investable: economy.investable ?? Boolean(target),
    efficiency: economy.investEfficiency ?? 1,
    fund: me.fund ?? 0,
    target,
    // Bu haftanın payını kuran hedef ve oyuncunun şimdiki hedefi: ayrıysa
    // çubuk gelecek haftayı gösteriyordur.
    week: economy.consumer?.feed ?? feedTarget(me),
    committed: feedTarget(me),
  };
}

/**
 * Tutamacın verdiği paylaşım. Hesap oyunun kendi splitOutput'udur:
 * önizleme haftanın gerçek bölüşümüyle ayrışamaz.
 */
function barSplit(base, feed) {
  const split = splitOutput({
    output: base.output, billsPaid: base.bills, armyCap: base.armyCap, drawn: base.drawn,
    need: base.need, feed, investable: base.investable,
  });
  const invested = split.invest * base.efficiency;
  const ratio = base.need > 0 ? split.people / base.need : 1;
  const left = base.target ? Math.max(0, base.target.cost - base.fund) : 0;
  const eta = !base.target ? null : left <= 0 ? 0 : invested > 0.01 ? Math.ceil(left / invested) : null;
  return { ...split, feed, invested, ratio, eta };
}

/** Tutamacın çubuk üzerindeki yeri (binde): halkla kalkınmanın sınırı. */
const handleAt = (base, split) => Math.round(shareOf(split.bills + split.army + split.people, base.output) * 1000);

/** Çubuktaki yerden doyurma hedefi: FEED adımına yuvarlı, sınırlar içinde. */
function feedAt(base, army, pos) {
  if (!(base.need > 0)) return base.committed;
  const raw = (pos * base.output - base.bills - army) / base.need;
  const stepped = Math.round(raw / FEED.step) * FEED.step;
  return Number(Math.max(FEED.min, Math.min(FEED.max, stepped)).toFixed(2));
}

/** "Ardena → 4 in 12 wk": düz metin (önizleme textContent'e yazar). */
function etaText(base, split) {
  const target = base.target;
  if (!target) return 'every state at the cap';
  const when = split.eta == null ? 'not saving' : split.eta === 0 ? 'this week' : `in ${split.eta} wk`;
  return `${target.name} → ${target.level} ${when}`;
}

/**
 * ÇUBUK: tam genişlik bu haftanın çıktısıdır. Dilimler faturalar | ordu |
 * halk | kalkınma; ikmal krizinde fatura diliminin taralı kırmızı ucu her
 * faturanın ödenmeyen payıdır. Üstte tavan ve ordu tavanı işaretleri, altta
 * ihtiyacın ×1.0 ve ×1.2'si. Tutamaç görünmez bir kaydıraçtır (yalnız topuzu
 * tutulur): screens.js sürükleme bekçisi `input[type=range]` arar.
 */
function barHtml(base, split) {
  const Y = base.output;
  const at = (value) => `${(shareOf(value, Y) * 100).toFixed(2)}%`;
  const crisis = base.s < 1 - 1e-6;
  const unpaid = crisis ? `<i class="ec-unpaid" style="width:${((1 - base.s) * 100).toFixed(1)}%"></i>` : '';
  const seg = (id, label, value, tip, extra = '') => `<i class="ec-seg ${id}" data-ec-seg="${id}" style="width:${segWidth(value, Y)}"${tipAttr({ text: tip })}><span>${label} <b data-ec-v="${id}">${num(value, 1)}</b></span>${extra}</i>`;
  const billsTip = `Bills\n${num(split.bills, 1)} IC a week, paid off the top: army and navy supply, schools, martial law. At most ${pct(base.room / Y)} of output (${num(base.room, 1)} IC).${crisis ? `\nSupply crisis: ${num(base.owed, 1)} IC owed, every bill paid ${pct(base.s)}. The hatched end is the unpaid share.` : ''}`;
  const armyTip = `Army\n${num(split.army, 1)} IC drawn by the production lines this week, up to ${num(base.armyCap, 1)} IC (the economy law's share of industry).`;
  const peopleTip = `People\n${num(split.people, 1)} IC of consumer goods: ${pct(split.ratio)} of what they want (${num(base.need, 1)} IC). Drag the handle to feed them better or worse.`;
  const devTip = `Development\n${num(split.invest, 1)} IC into the development fund × ${num(base.efficiency, 2)} efficiency = ${num(split.invested, 1)} IC. It buys development levels state by state.`;
  const capAt = split.bills + base.armyCap;
  const ceilAt = base.room;
  // Bayraklar çakışmasın: ordu tavanı tavana çok yakınsa yalnız çizgisi kalır.
  const capFlag = Math.abs(shareOf(capAt, Y) - shareOf(ceilAt, Y)) > 0.1;
  const tick = (k, text) => {
    const x = split.bills + split.army + k * base.need;
    return base.need > 0 && x <= Y ? `<span style="left:${at(x)}"${tipAttr({ text })}>×${num(k, 1)}</span>` : '';
  };
  const handle = base.need > 0
    ? `<input type="range" class="ec-handle" min="0" max="1000" step="1" value="${handleAt(base, split)}" data-uc-feed data-policy="feed" aria-label="Feed the people" aria-valuetext="×${num(split.feed, 2)} of need"${tipAttr({ text: FEED_TIP })}>`
    : '';
  return `<div class="ec-flags">
      ${ceilAt < Y ? `<span class="ceil" style="left:${at(ceilAt)}">ceiling ${pct(ceilAt / Y)}</span>` : ''}
      ${capFlag && base.armyCap > 0 ? `<span style="left:${at(capAt)}">army cap</span>` : ''}
    </div>
    <div class="ec-bar-wrap">
      <div class="ec-bar${Math.abs(split.feed - base.week) > 1e-6 ? ' next' : ''}" data-ec-bar>
        ${seg('bills', 'Bills', split.bills, billsTip, unpaid)}
        ${seg('army', 'Army', split.army, armyTip)}
        ${seg('people', 'People', split.people, peopleTip)}
        ${seg('dev', 'Development', split.invest, devTip)}
        ${ceilAt < Y ? `<b class="ec-mark ceil" style="left:${at(ceilAt)}"${tipAttr({ text: `Bill ceiling\nBills may take ${pct(ceilAt / Y)} of output (${num(ceilAt, 1)} IC). Above it the nation is in a supply crisis.` })}></b>` : ''}
        ${base.armyCap > 0 ? `<b class="ec-mark cap" style="left:${at(capAt)}"${tipAttr({ text: `Army cap\nThe production lines may draw up to ${num(base.armyCap, 1)} IC a week: the economy law's share of industry.` })}></b>` : ''}
      </div>
      ${handle}
    </div>
    <div class="ec-ticks">
      ${tick(1, 'What the people want\nBelow it the shelves are short: stability and growth suffer.')}
      ${tick(1.2, 'Well fed\nAbove about ×1.2 more consumer goods add no stability, growth or calm.')}
    </div>`;
}

/** Çubuğun altındaki tek satır: halk | kalkınma | ordu. Değer yuvaları sabit genişlikte. */
function barCaption(base, split) {
  return `<div class="ec-cap">
    <span class="ec-cap-g people"><i class="sw"></i>People <b data-ec-c="people">${num(split.people, 1)}</b> · feed <b data-ec-c="feed">×${num(split.feed, 2)}</b> · ratio <b data-ec-c="ratio">${pct(split.ratio)}</b> · stability <b data-ec-c="stab">${pts(consumerStability(split.ratio))}</b></span>
    <span class="ec-cap-g dev"><i class="sw"></i>Development <b data-ec-c="invest">${num(split.invest, 1)}</b> · <span class="ec-eta" data-ec-c="eta">${esc(etaText(base, split))}</span></span>
    <span class="ec-cap-g army"><i class="sw"></i>Army ≤ <b>${num(base.armyCap, 1)}</b> · drawing <b>${num(split.army, 1)}</b></span>
  </div>`;
}

/**
 * Önizleme: tutamacın yeni hedefiyle halk ve kalkınma dilimlerini ve alt
 * satırı YERİNDE yazar (faturalar ve ordu tutamaçla değişmez).
 */
function paintBar(root, base, feed) {
  const split = barSplit(base, feed);
  const set = (selector, text) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  };
  for (const [id, value] of [['people', split.people], ['dev', split.invest]]) {
    const seg = root.querySelector(`[data-ec-seg="${id}"]`);
    if (seg) seg.style.width = segWidth(value, base.output);
    set(`[data-ec-v="${id}"]`, num(value, 1));
  }
  set('[data-ec-c="people"]', num(split.people, 1));
  set('[data-ec-c="feed"]', `×${num(split.feed, 2)}`);
  set('[data-ec-c="ratio"]', pct(split.ratio));
  set('[data-ec-c="stab"]', pts(consumerStability(split.ratio)));
  set('[data-ec-c="invest"]', num(split.invest, 1));
  set('[data-ec-c="eta"]', etaText(base, split));
  const bar = root.querySelector('[data-ec-bar]');
  bar?.classList.add('preview');
  bar?.classList.toggle('next', Math.abs(feed - base.week) > 1e-6);
  return split;
}

/**
 * Tutamaç: sürüklerken çubuk splitOutput ile yeniden bölünür, bırakınca
 * setFeed. Haftalık tazeleme sürükleme boyunca bekler (screens.js
 * `dragging`), tutamaç parmağın altından kaybolmaz. Ok tuşları hedefi bir
 * FEED adımı oynatır ve hemen uygular; `data-policy` odağı tazelemeden
 * sonra geri getirir.
 */
function bindFeed(screens, input) {
  const { game } = screens;
  const me = screens.me;
  const root = screens.el.body;
  const base = barBase(game.world, me);
  if (!base) return;
  const army = barSplit(base, base.committed).army;
  let feed = base.committed;
  const commit = (value) => {
    setFeed(me, value);
    screens.refresh();
    game.emit('politics', me.id);
  };
  input.oninput = () => {
    feed = feedAt(base, army, Number(input.value) / 1000);
    const split = paintBar(root, base, feed);
    // Topuz adıma oturur: sınırdan taşan sürükleme onu sınırda tutar.
    input.value = String(handleAt(base, split));
    input.setAttribute('aria-valuetext', `×${num(feed, 2)} of need`);
  };
  input.onchange = () => commit(feed);
  input.onkeydown = (event) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -4, PageUp: 4 }[event.key];
    const edge = event.key === 'Home' ? FEED.min : event.key === 'End' ? FEED.max : null;
    if (step == null && edge == null) return;
    // Yerel adım binde birdir (görünmez); hedef FEED adımıyla oynar.
    event.preventDefault();
    event.stopPropagation();
    commit(edge ?? feedTarget(me) + step * FEED.step);
  };
}

export function renderBudget(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const ic = view.ic ?? { output: 0, total: 0, hand: 0, crown: 0 };
  const bills = view.bills ?? EMPTY_BILLS;
  const consumer = view.consumer ?? { need: 0, ratio: 1 };
  const output = ic.output ?? 0;
  const cap = billCap(me);
  const crisis = bills.s < 1 - 1e-6;
  const base = barBase(world, me);
  const split = base ? barSplit(base, base.committed) : null;
  const next = base?.target ?? nextLevelOf(world, me);
  const auto = (view.feed?.mode ?? 'auto') === 'auto';
  const billShare = bills.room > 0 ? bills.owed / bills.room : 0;

  const kpis = kpiRow([
    kpi({
      icon: emblemArt('industry', 'md'), label: 'Output', value: num(output, 1), cls: 'hero',
      sub: `IC a week · hand ${num(ic.hand ?? 0, 0)} · industry ${num(ic.total ?? 0, 0)} · crown ${num(ic.crown ?? 0, 0)}`,
      tip: { text: 'Output\nEvery state produces each week: handwork from every 100k workers, industry from every development level above 1 (it needs coal and grows with research). The capital adds a flat 4. The Factories screen shows every factor.' },
    }),
    kpi({
      label: 'Bills', value: `${num(bills.owed, 1)} / ${num(bills.room, 0)}`, cls: crisis ? 'crisis' : '',
      sub: crisis ? `<span class="neg">supply crisis · ${pct(bills.s)} paid</span>` : `${pct(output > 0 ? bills.owed / output : 0)} of output · ceiling ${pct(cap)}`,
      tip: { text: `Bills\nArmy and navy supply, schools and martial law come off the top of output, at most ${pct(cap)} of it (${num(bills.room, 1)} IC). Above that the nation is in a SUPPLY CRISIS: every bill is paid in part, reinforcement, training and order recover slower and stability falls.` },
      meter: billShare, meterTone: crisis ? 'neg' : billShare > 0.8 ? 'warn' : 'pos',
    }),
    kpi({
      label: 'Development fund', value: short(view.fund),
      sub: next ? `next level ${money(next.cost, 0)} · floor ${money(view.fundFloor, 0)}` : `floor ${money(view.fundFloor, 0)}`,
      tip: { text: 'Development fund\nWhat is left after bills, the army and the people flows here and buys development levels state by state. Generals, settlers, event choices and imports are paid from it too; it may dip to the floor (four weeks of output below zero).' },
      meter: next && next.cost > 0 ? view.fund / next.cost : 0, meterTone: view.fund < 0 ? 'warn' : 'pos',
    }),
    kpi({
      label: 'Consumer goods', value: pct(consumer.ratio),
      sub: `${pts(consumerStability(consumer.ratio))} stability · fed ×${num(consumer.feed ?? feedTarget(me), 2)}`,
      tip: { text: 'Consumer goods\nThe people\'s share of output against what they want (it grows every decade). Short shelves cost stability and growth; full ones, up to ×1.2, add a little of both. The handle on the bar sets it.' },
      meter: Math.min(1, consumer.ratio), meterTone: consumer.ratio < 0.95 ? 'neg' : 'pos',
    }),
  ]);

  const feedNow = feedTarget(me);
  const pending = base && Math.abs(feedNow - base.week) > 1e-6;
  const heroRight = `${auto ? badge('auto', 'pos') : badge('manual', 'dim')}
    <button class="k-btn sm" data-uc-feed-auto${auto ? ` disabled${tipAttr({ text: 'The ministry already sets the handle. Drag it to take it over.' })}` : tipAttr({ text: AUTO_FEED_TIP })}>Auto</button>`;
  const hero = panel('This week\'s output', base ? barHtml(base, split) + barCaption(base, split) : empty('The first weekly report comes after week 1.'), {
    sub: pending ? `new target ×${num(feedNow, 2)} applies from next week` : 'one handle: the people\'s share against development',
    right: heroRight,
    cls: 'ec-hero',
  });

  // --- Faturalar ------------------------------------------------------------
  const perRegiment = bills.land > 0 ? bills.army / bills.land : 0;
  const school = LAWS.education.options[lawIndex(me, 'education')];
  const billRow = (icon, label, sub, owed, tip) => {
    const idle = owed < 0.005;
    return `<div class="ec-brow${idle ? ' idle' : ''}"${tipAttr({ text: tip })}>
      <span class="k-row-ico">${icon}</span>
      <span class="ec-bname">${label}${sub ? `<small>${sub}</small>` : ''}</span>
      <span class="r">${idle ? '—' : num(owed, 2)}</span>
      <span class="r">${idle ? '' : pct(output > 0 ? owed / output : 0)}</span>
      <span class="r">${idle ? '' : num(owed * bills.s, 2)}</span>
    </div>`;
  };
  const billRows = [
    billRow(ledgerArt('army'), 'Army supply', `${bills.land} regiment${bills.land === 1 ? '' : 's'} × ${num(perRegiment, 2)}${bills.atWar ? ` · war ×${SUPPLY.war}` : ''}`, bills.army,
      `Army supply\nEvery regiment costs ${num(SUPPLY.land, 1)} IC a week in 1900, growing with the era; ×${SUPPLY.war} at war. A big peacetime army slows growth.`),
    billRow(ledgerArt('navy'), 'Navy supply', `${num(bills.sea, bills.sea % 1 ? 1 : 0)} ship${bills.sea === 1 ? '' : 's'}`, bills.navy,
      `Navy supply\nEvery warship costs ${num(SUPPLY.sea, 1)} IC a week in 1900 (submarines half), growing with the era; ×${SUPPLY.war} at war.`),
    billRow(ledgerArt('education'), 'Schools', esc(school.name), bills.schools,
      'Schools\nThe education law\'s bill per 100k people. In a supply crisis the schools work only as far as they are paid.'),
    billRow(ledgerArt('unrest'), 'Martial law', 'against national movements', bills.martial,
      'Martial law\nHolding down a national movement costs a weekly bill while it lasts.'),
  ].join('');
  const billsTable = `<div class="ec-bills">
      <div class="ec-brow head"><span></span><span>Bill</span><span class="r">Owed / wk</span><span class="r">Of output</span><span class="r">Paid</span></div>
      ${billRows}
      <div class="ec-brow total"><span></span><span class="ec-bname">Total</span><span class="r">${num(bills.owed, 2)}</span><span class="r">${pct(output > 0 ? bills.owed / output : 0)}</span><span class="r ${crisis ? 'neg' : ''}">${num(bills.paid ?? bills.owed, 2)}</span></div>
    </div>
    <div class="ec-ceil"${tipAttr({ text: `Bill ceiling\n${pct(cap)} of output may go to bills. The Requisition the Economy decision raises it for half a year.` })}>
      <small>Ceiling</small>${meter(billShare, { tone: crisis ? 'neg' : billShare > 0.8 ? 'warn' : 'pos', mark: 1, wide: true })}
      <b>${num(bills.room, 1)}</b><em class="${crisis ? 'neg' : 'pos'}">${pct(bills.s)} paid</em>
    </div>`;
  // Savaş payı: aynı ordu savaşta ×SUPPLY.war yer. Barışta sığan ordunun
  // savaşta krize düşürüp düşürmeyeceği seferberlikten ÖNCE görünsün.
  const warArmy = (bills.army + bills.navy) * (bills.atWar ? 1 : SUPPLY.war / (bills.war || 1));
  const warShare = output > 0 ? (warArmy + bills.schools + bills.martial) / output : 0;
  const warTone = warShare > cap ? 'neg' : warShare > cap * 0.8 ? 'warn' : '';
  const warLine = bills.atWar
    ? `<p class="k-note">At war: supply already costs ×${SUPPLY.war}. Bills take <b>${pct(output > 0 ? bills.owed / output : 0)}</b> of output; above <b>${pct(cap)}</b> a supply crisis starts.</p>`
    : `<p class="k-note">At war the same army and fleet would cost <b>${num(warArmy, 1)} IC</b> a week (×${SUPPLY.war}): bills <b class="${warTone}">${pct(warShare)}</b> of output. A supply crisis starts above <b>${pct(cap)}</b>${warShare > cap ? ' — this army could not be supplied in a war' : ''}.</p>`;

  // --- Fon defteri ----------------------------------------------------------
  const rows = view.ledger ?? {};
  const fundRows = FUND_LINES.map((id) => {
    const value = rows[id] ?? 0;
    const row = { icon: fundArt(id), label: esc(LEDGER_LINES[id]?.label ?? id), value: signed(value), tone: tone(value), tip: 'ledger', arg: id };
    return Math.abs(value) > 0.05 ? row : { ...row, value: '—', tone: '', cls: 'idle' };
  });
  const net = rows.net ?? FUND_LINES.reduce((sum, id) => sum + (rows[id] ?? 0), 0);
  const history = me.economy?.fundHistory ?? [];
  const fundBody = `${ledger([...fundRows, { label: 'Net', value: signed(net), tone: tone(net), strong: true }])}
    <div class="k-chart ec-fundchart">${spark(history, { width: 420, height: 60 })}</div>
    <div class="k-chart-legend"><span>${history.length} weeks</span><span>floor <b>${money(view.fundFloor, 0)}</b></span><span>now <b>${money(view.fund, 0)}</b></span></div>`;

  const educ = `<p class="k-note">Schools cost <b>${money(view.education, 1)}</b> a week and move literacy toward <b>${pct(view.literacyTarget)}</b> (now ${pct(view.literacy)}). Literacy raises the development cap and opens focus slots.</p>`;

  return `${kpis}
    ${crisis ? `<div class="k-alert neg"><b>Supply crisis</b> — the bills owe ${money(bills.owed, 1)} a week but only ${money(bills.room, 1)} fit under the ceiling: every bill is paid ${pct(bills.s)}. Reinforcement, training and order recover slower and stability falls until they fit. Shrink the army, lower the education law or take Requisition the Economy.</div>` : ''}
    ${hero}
    <div class="k-cols-2">
      ${panel('Bills', `${billsTable}${warLine}`, { sub: 'paid off the top of output' })}
      ${panel('Development fund', fundBody, { sub: view.settled ? 'IC last week · last 52 weeks' : 'first report after week 1' })}
    </div>
    ${panel('Economic laws', `<div class="k-laws">${lawCard(world, me, 'economy', state.confirm, { compact: true })}${lawCard(world, me, 'labour', state.confirm, { compact: true })}${lawCard(world, me, 'education', state.confirm, { compact: true })}</div>${educ}`,
    { sub: `${governmentView(world, me).lawCost} political power per change` })}`;
}

// ================================================================== TRADE ===

export function renderTrade(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const resources = view.resources ?? {};
  const market = world.market ?? {};
  const ledgerRows = view.ledger ?? {};
  const shortages = RESOURCE_IDS.filter((id) => (resources[id]?.need ?? 0) > 0.01 && (resources[id]?.ratio ?? 1) < 0.98);
  const embargoes = (me.embargoes ?? []).map((id) => world.nations[id]).filter(Boolean);

  // Ticaret fonun kalemidir: ihracat fona IC yazar, ithalat ondan öder.
  const kpis = kpiRow([
    kpi({ icon: ledgerArt('exports', 'md'), label: 'Exports', value: signedMoney(ledgerRows.exports ?? 0), sub: 'into the fund last week', tip: 'ledger', arg: 'exports', cls: 'hero' }),
    kpi({ label: 'Imports', value: signedMoney(ledgerRows.imports ?? 0), sub: 'from the fund last week', tip: 'ledger', arg: 'imports' }),
    kpi({ label: 'Trade balance', value: signedMoney((ledgerRows.exports ?? 0) + (ledgerRows.imports ?? 0)), sub: 'exports − imports', tip: { text: 'Trade balance\nWhat exports paid into the development fund minus what imports took out of it last week.' } }),
    kpi({
      label: 'Shortages', value: String(shortages.length),
      sub: shortages.length ? shortages.map((id) => RESOURCES[id].name).join(', ') : 'every need covered',
      tip: { text: 'Shortages\nResources the country needs but could not fully make or buy last week.' },
    }),
    kpi({
      label: 'Blockade', value: pct(view.blockade), sub: view.blockade > 0 ? 'of our coast is cut' : 'sea lanes open',
      tip: { text: 'Blockade\nEnemy warships within two hexes of our coastal states cut that share of seaborne imports.' },
      meter: view.blockade, meterTone: 'neg',
    }),
  ]);

  const rows = RESOURCE_IDS.map((id) => {
    const info = RESOURCES[id];
    const r = resources[id] ?? {};
    const needed = (r.need ?? 0) > 0.01;
    const ratio = needed ? r.ratio : 1;
    const price = market.prices?.[id] ?? info.price;
    const history = market.history?.[id] ?? [];
    const trend = history.length > 4 ? price - history[Math.max(0, history.length - 5)] : 0;
    // Ana tedarikçi "Bought" sütunuyla aynı eşikten: hiç alım yokken %0'lık
    // bir tedarikçi adı yazıp sütunla çelişiyordu.
    const partner = r.topPartner >= 0 && (r.imported ?? 0) > 0.05 ? world.nations[r.topPartner] : null;
    return `<div class="k-res-row${needed && ratio < 0.8 ? ' short' : ''}"${tipAttr('resource', id)}>
      <span class="k-res-name">${resourceArt(id, 'sm')}<b>${esc(info.name)}</b>${info.era && !needed ? badge('no demand yet', 'dim') : ''}</span>
      <span class="k-num">${num(r.produced ?? 0)}</span>
      <span class="k-num">${needed ? num(r.need) : '—'}</span>
      <span class="k-cover">${needed ? `${meter(ratio, { tone: ratio < 0.8 ? 'neg' : ratio < 0.98 ? 'warn' : 'pos' })}<b>${pct(ratio)}</b>` : '<small class="k-dim">not needed</small>'}</span>
      <span class="k-num neg">${r.imported > 0.05 ? num(r.imported) : '—'}</span>
      <span class="k-num pos">${r.exported > 0.05 ? num(r.exported) : '—'}</span>
      <span class="k-price"><b>${num(price, 2)}</b><i class="${trend > 0.01 ? 'up' : trend < -0.01 ? 'down' : ''}"></i></span>
      <span class="k-partner">${partner ? `${esc(partner.name)} <small>${pct(r.topShare)}</small>` : '<small class="k-dim">—</small>'}</span>
    </div>`;
  }).join('');
  const table = `<div class="k-res-table">
      <div class="k-res-row head"><span>Resource</span><span>Made</span><span>Needed</span><span>Covered</span><span>Bought</span><span>Sold</span><span>Price</span><span>Main supplier</span></div>
      ${rows}
    </div>`;

  const marketTiles = RESOURCE_IDS.map((id) => {
    const price = market.prices?.[id] ?? 0;
    const base = RESOURCES[id].price;
    return `<div class="k-mkt"${tipAttr('resource', id)}>
      ${resourceArt(id, 'sm')}
      <span><em>${esc(RESOURCES[id].name)}</em><b>${num(price, 2)}</b><small>${price >= base ? '+' : '−'}${Math.abs(Math.round((price / base - 1) * 100))}% vs base</small></span>
      ${spark(market.history?.[id] ?? [], { width: 90, height: 24, cls: 'mini', zero: false })}
    </div>`;
  }).join('');

  const embargoBody = embargoes.length
    ? ledger(embargoes.map((other) => ({
      label: esc(other.name),
      value: `<button class="k-btn sm" data-uc-embargo-lift="${other.id}">Lift</button>`,
    })))
    : empty('No embargoes. Declare one from a foreign power\'s dossier (25 political power).');

  return `${kpis}
    <div class="k-split wide-left">
      ${panel('Resources', table, { sub: 'per week · hover a row for its uses and suppliers' })}
      <div class="k-stack">
        ${panel('Trade law', lawCard(world, me, 'trade', state.confirm, { compact: true })
    + '<p class="k-note">Exports sell only the surplus, up to the law\'s share of output, and pay into the development fund. Imports fill every shortage automatically while the fund is above its floor.</p>')}
        ${panel('Embargoes', embargoBody, { sub: 'no trade with these states' })}
      </div>
    </div>
    ${panel('World market', `<div class="k-mkts">${marketTiles}</div>`, { sub: 'price in IC = base × (world need ÷ world output)^1.5, 0.6–2× base' })}`;
}

// ============================================================== INDUSTRY ===

/** Toplam zinciri: kit.chain'in "+" eşi (el + sanayi + taç = çıktı). */
function sumChain(parts, result) {
  const pill = (p, op) => `<span class="k-pill ${p.tone ?? ''}"${tipAttr(p.tip ?? { text: p.label }, p.arg)}>
    ${op ? `<i>${op}</i>` : ''}<b>${p.text ?? num(p.value, 2)}</b><small>${esc(p.label)}</small></span>`;
  return `<div class="k-chain">${parts.map((p, index) => pill(p, index ? '+' : '')).join('')}<span class="k-eq">=</span>${pill(result, '')}</div>`;
}

export function renderIndustry(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const ic = view.ic ?? { total: 0, output: 0, hand: 0, crown: 0, raw: 0, share: 0, dockyards: 0, factors: {} };
  const consumer = view.consumer ?? { need: 0, supply: 0, ratio: 1 };
  const alloc = view.alloc ?? { army: 0, armyCap: 0 };
  const logistics = equipmentLogistics(world, me);
  const ironclad = mod(me, 'ironclad') > 0;
  const f = ic.factors ?? {};
  const common = f.common ?? 1;
  // El zincirinin tabanı: ulusal çarpanlardan önceki el çıktısı (Σ 0.6 × işçi × statü).
  const handBase = common > 0 ? (ic.hand ?? 0) / common : 0;
  const armyCap = alloc.armyCap ?? 0;
  const drawn = alloc.army ?? 0;
  const feed = feedTarget(me);
  const auto = (view.feed?.mode ?? 'auto') === 'auto';

  const kpis = kpiRow([
    kpi({ icon: buildingArt('factory', 'md'), label: 'Industry', value: num(ic.total), sub: `${pct(ic.output > 0 ? ic.total / ic.output : 0)} of output · the army draws from it`, tip: 'ic', cls: 'hero' }),
    kpi({ label: 'Output', value: num(ic.output), sub: `hand ${num(ic.hand ?? 0, 0)} + industry ${num(ic.total ?? 0, 0)} + crown ${num(ic.crown ?? 0, 0)}`, tip: { text: 'Output\nHandwork, industry and the crown: everything the country makes in a week. Bills, the army, the people and development share it (Economy screen).' } }),
    kpi({
      label: 'Army draws', value: `${num(drawn, 1)} / ${num(armyCap, 1)}`, sub: `up to ${pct(ic.share)} of industry · economy law`,
      tip: 'law', arg: 'economy', meter: armyCap > 0 ? drawn / armyCap : 0,
    }),
    kpi({
      label: 'Consumer goods', value: pct(consumer.ratio), sub: `${pts(consumerStability(consumer.ratio))} stability · fed ×${num(consumer.feed ?? feed, 2)}`,
      tip: { text: 'Consumer goods\nThe people\'s share of output against what they want, which grows every decade. A shortage costs stability and growth; the handle on the Economy screen sets the share.' },
      meter: Math.min(1, consumer.ratio), meterTone: consumer.ratio < 0.95 ? 'neg' : 'pos',
    }),
    kpi({
      label: 'Shipyards', value: num(ic.dockyards ?? 0, 1), sub: (ic.dockyards ?? 0) > 0 ? 'IC the ship line can take' : 'no developed coast',
      tip: { text: 'Shipyard capacity\nEvery development level of a coastal state adds 0.3 IC: the most the ship line can take each week, and what repairs the fleet. Develop coastal states to raise it.' },
    }),
  ]);

  // ÇIKTI ZİNCİRİ: el ve sanayi ayrı satırda. Kömür/demir/kereste/petrol ve
  // teknoloji yalnız sanayiyi çarpar; istikrar, askerlik, emek ve
  // değiştiriciler (ulusal çarpan) ikisini de.
  const nation = [
    { label: 'Stability', value: f.stability ?? 1, tip: 'stability' },
    { label: 'Conscription', value: f.law ?? 1, tip: 'law', arg: 'conscription' },
    { label: 'Labour', value: f.labour ?? 1, tip: 'law', arg: 'labour' },
    { label: 'Modifiers', value: f.mods ?? 1, tip: { text: 'Ministers, research and events\nEvery modifier to national output.' } },
  ];
  const handChain = chain(
    { label: `Workers ×${HAND_OUTPUT}`, value: handBase, text: num(handBase), tip: { text: `Handwork\n${HAND_OUTPUT} IC a week from every 100k workers: ${num(handBase / HAND_OUTPUT, 1)} × 100k at work, weighted by compliance. Grows with the population.` } },
    nation,
    { label: 'Hand', value: ic.hand ?? 0, text: num(ic.hand ?? 0), tip: { text: 'Handwork\nFields, workshops and crafts after the national factors.' } },
  );
  const industryChain = chain(
    { label: `Levels ×${INDUSTRY_PER_DEV}`, value: ic.raw ?? 0, text: num(ic.raw ?? 0), tip: { text: `Industry base\n${INDUSTRY_PER_DEV} IC a week from every 100k workers for each development level above 1. Develop states to raise it.` } },
    [
      { label: 'Coal', value: f.coal ?? 1, tip: 'resource', arg: 'COAL' },
      { label: 'Iron', value: f.iron ?? 1, tip: 'resource', arg: 'IRON' },
      { label: 'Timber', value: f.timber ?? 1, tip: 'resource', arg: 'TIMBER' },
      ...((f.oil ?? 1) !== 1 || mod(me, 'oilIc') > 0 ? [{ label: 'Oil', value: f.oil ?? 1, tip: 'resource', arg: 'OIL' }] : []),
      { label: 'Technology', value: f.tech ?? 1, tip: { text: 'Technology\nResearch that raises industry (handwork does not grow with it).' } },
      { label: 'Nation', value: common, tip: { text: `Nation\nThe same four factors as handwork: stability ×${num(f.stability ?? 1, 2)} · conscription ×${num(f.law ?? 1, 2)} · labour ×${num(f.labour ?? 1, 2)} · modifiers ×${num(f.mods ?? 1, 2)}.` } },
    ],
    { label: 'Industry', value: ic.total ?? 0, text: num(ic.total ?? 0), tone: 'pos', tip: 'ic' },
  );
  const outputChain = sumChain([
    { label: 'Hand', value: ic.hand ?? 0, text: num(ic.hand ?? 0) },
    { label: 'Industry', value: ic.total ?? 0, text: num(ic.total ?? 0), tip: 'ic' },
    { label: 'Crown', value: ic.crown ?? 0, text: num(ic.crown ?? 0, 0), tip: { text: 'Crown\nThe capital adds a flat 4 IC a week: even the smallest state keeps going.' } },
  ], { label: 'Output', value: ic.output ?? 0, text: num(ic.output ?? 0), tone: 'pos', tip: { text: 'Output\nThe week\'s total: the Economy screen splits it between bills, the army, the people and development.' } });
  const chains = `<div class="ec-chainrow"><small>Hand</small>${handChain}</div>
    <div class="ec-chainrow"><small>Industry</small>${industryChain}</div>
    <div class="ec-chainrow"><small>Output</small>${outputChain}</div>`;

  // TÜKETİM MALI: halkın payı ihtiyaca karşı; iki işaret ihtiyaç (×1.0) ve
  // tutamacın hedefi. Atölye/sivil sanayi ayrımı kalktı: arz tek paydır.
  const need = consumer.need ?? 0;
  const supply = consumer.supply ?? 0;
  const scale = Math.max(supply, need * Math.max(1.25, feed), 1e-6) * 1.04;
  const consumerBar = `<div class="k-stackbar">
      <i class="b" style="width:${((supply / scale) * 100).toFixed(2)}%"${tipAttr({ text: `The people's share\n${num(supply, 1)} IC of output this week.` })}></i>
      <b style="left:${((need / scale) * 100).toFixed(2)}%"${tipAttr({ text: `What the people want\n${num(need, 1)} IC — grows every decade.` })}></b>
      <b class="target" style="left:${((feed * need / scale) * 100).toFixed(2)}%"${tipAttr({ text: `Feed target ×${num(feed, 2)}\n${num(feed * need, 1)} IC: what the handle on the Economy screen asks for.` })}></b>
    </div>
    <div class="k-legend"><span><i class="b"></i>People ${num(supply, 1)}</span><span><i class="mark"></i>Wanted ${num(need, 1)}</span><span><i class="mark target"></i>Target ×${num(feed, 2)}</span></div>`;
  const consumerNote = `<p class="k-note">Covered <b class="${consumer.ratio < 0.95 ? 'neg' : 'pos'}">${pct(consumer.ratio)}</b> · stability ${pts(consumerStability(consumer.ratio))} · target ×${num(feed, 2)}${auto ? badge('auto', 'pos') : badge('manual', 'dim')}</p>
    <div class="k-actions"><button class="k-btn sm" data-uc-goto="budget"${tipAttr({ text: 'The handle between the people and development is on the Economy screen.' })}>Set it on the Economy screen</button></div>`;

  // ÜRETİM HATLARI — tablo (dördüncü sürüm, 2026-10-12). Üç kartlık sürüm
  // beş hatta 573 px tutuyordu (Kerem: "vibecoded, boşluk israfı"): her kart
  // aynı etiketleri tekrarlıyor, kilitli hat tam boy kart kaplıyor, duran hat
  // iki dev "+0.00" basıyordu. Yeni düzen HOI4'ün üretim listesi: yasa →
  // ordunun tavanı → dağılım çubuğu (çekilmeyen pay taralı) → hat başına tek
  // satır. Öncelik düğmesinin üstünde durmak çubuğu ve satırları yeni
  // paylaşımla YERİNDE gösterir (paintLineSplit).
  const split = lineSplit(me);
  const military = split.military;
  // İmleç vurgusu yalnız klavye bu ekranda kullanılınca: fareyle oynayana
  // kalıcı bir "seçili satır" gürültüdür.
  const cursor = lineCursor(me, state, split).id;
  const highlight = state.lineKeyboard && state.kbScreen === 'industry' ? cursor : null;
  const rows = EQUIPMENT_IDS.map((id) => lineRow(me, id, { split, view, logistics, ironclad, cursor: highlight })).join('');
  // Çekilmeyen payın iki kaynağı: bütün hatlar durmuş ya da tersane tavanı
  // (gemi hattının tavanı aşan payı öteki hatlara geçmez, bkz. lineAllocation).
  // Bu pay boşa gitmez: halkın ve kalkınmanın payında kalır (splitOutput).
  const idleText = split.shipCapped
    ? 'The shipyards cap the ship line; the rest of its share stays in the economy. Develop coastal states or lower its priority to arm faster.'
    : 'No line takes it: every open line is stopped. Set a line to Low to stock up for war.';
  const total = `<div class="pl-total"${tipAttr({ text: `Military industry\n${pct(ic.share)} of ${num(ic.total)} IC of industry may go to the army (economy law): the most the lines can draw. The lines share it by priority; what no line takes stays with the people and development.` })}>
      <small>To the army</small><b>${num(military, 1)}<i> IC</i></b><em>${pct(ic.share)} of ${num(ic.total, 1)}</em>
    </div>`;
  const anyManual = EQUIPMENT_IDS.some((id) => view.lines?.[id]?.mode === 'manual');
  const bulk = `<button class="k-btn sm" data-uc-lines-auto${anyManual
    ? tipAttr({ text: 'All lines to Auto\nThe ministry makes what the army lacks again; your own priorities are dropped.' })
    : ' disabled'}>All to Auto</button>`;
  const body = `<div class="pl-top">
      ${lawCard(world, me, 'economy', state.confirm, { compact: true })}
      ${total}
    </div>
    ${splitBar(split, idleText)}
    <div class="pl-table">
      <div class="pl-row head">
        <span${tipAttr({ text: 'Lines\n↑ ↓ pick a line for the keyboard.' })}>Line <kbd class="k-key">↑↓</kbd></span>
        <span${tipAttr({ text: `Priority\nThe army's industry is split between the lines by shares: ${LINE_PRIORITIES.map((level) => `${level.name} ${level.weight}`).join(' · ')}. Hover a priority to see the new split.\n← → step the picked line's priority.` })}>Priority <kbd class="k-key">←→</kbd></span>
        <span class="r">Industry</span>
        <span>Efficiency</span>
        <span class="r">Output / wk</span>
        <span class="r">Depot</span>
        <span>Army</span>
        <span>Materials / wk</span>
      </div>
      ${rows}
    </div>`;

  return `${kpis}
    <div class="k-split wide-left">
      ${panel('Output', chains, { sub: 'what the states make × the national factors', cls: 'ec-chainpanel' })}
      ${panel('Consumer goods', `${consumerBar}${consumerNote}`, { sub: 'the people\'s share of output' })}
    </div>
    ${panel('Production lines', body, { sub: 'the army\'s share of industry, split by priority · hover a priority to preview', right: bulk, cls: 'pl-panel' })}`;
}

// --------------------------------------------------------- ÜRETİM HATLARI ---

/** Hat rengi: dağılım çubuğunun dilimi ve satırın sol kenarı aynı renktir. */
const LINE_TONE = { rifles: 'brass', guns: 'copper', ships: 'steel', tanks: 'iron', aircraft: 'sky' };
/** Öncelik sırası; klavyenin ← → adımı bu sırayı izler. */
const LINE_STEPS = ['auto', ...LINE_PRIORITIES.map((level) => level.id)];

/**
 * Ordunun tavanının hatlara dağılımı ve hiçbir hatta gitmeyen pay.
 * `override` önizleme ağırlığıdır ({ guns: 6 }). Hesap lineAllocation'dır:
 * önizleme oyunla ayrışamaz. Tavan simülasyonunkiyle aynıdır (yasanın payı,
 * faturalardan sonra kalan çıktıyı aşamaz: economy.alloc.armyCap). Tersane
 * tavanını görmek için aynı paylaşım tavansız da hesaplanır.
 */
function lineSplit(me, override = null) {
  const economy = me.economy ?? {};
  const ic = economy.ic ?? {};
  const military = economy.alloc?.armyCap ?? ic.military ?? 0;
  const dockyards = ic.dockyards ?? 0;
  const alloc = lineAllocation(me, military, dockyards, override);
  const used = EQUIPMENT_IDS.reduce((sum, id) => sum + alloc[id].ic, 0);
  const free = dockyards > 0 ? lineAllocation(me, military, Infinity, override).ships.ic : 0;
  return { military, alloc, idle: Math.max(0, military - used), shipCapped: free > alloc.ships.ic + 1e-6 };
}

const icText = (value) => (value > 0.005 ? num(value, 1) : '—');
const outText = (value) => (value > 0.005 ? `+${num(value, value >= 10 ? 1 : 2)}` : '—');
const shareOf = (value, total) => (total > 0 ? Math.max(0, Math.min(1, value / total)) : 0);
const segWidth = (value, total) => `${(shareOf(value, total) * 100).toFixed(2)}%`;

/** Klavye imleci: yalnız açık hatlarda gezer; kapanan hattan ilk açık hatta düşer. */
function lineCursor(me, state, split = lineSplit(me)) {
  const usable = EQUIPMENT_IDS.filter((id) => split.alloc[id].usable);
  if (!usable.includes(state.lineCursor)) state.lineCursor = usable[0] ?? null;
  return { usable, id: state.lineCursor };
}

/** Dağılım çubuğu: açık hatların dilimleri + taralı çekilmeyen pay. */
function splitBar(split, idleText) {
  const segs = EQUIPMENT_IDS.filter((id) => split.alloc[id].usable).map((id) => {
    const value = split.alloc[id].ic;
    const name = EQUIPMENT[id].name;
    return `<i class="pl-seg ${LINE_TONE[id]}" data-pl-seg="${id}" style="width:${segWidth(value, split.military)}"${tipAttr({ text: `${name} line\n${num(value, 1)} IC: ${pct(shareOf(value, split.military))} of the army's industry.` })}><span>${esc(name)} <b data-pl-segv="${id}">${num(value, 1)}</b></span></i>`;
  }).join('');
  const idle = `<i class="pl-seg idle" data-pl-seg="idle" style="width:${segWidth(split.idle, split.military)}"${tipAttr({ text: `Not drawn\n${num(split.idle, 1)} IC the army does not take this week: it stays with the people and development.\n${idleText}` })}><span>Not drawn <b data-pl-segv="idle">${num(split.idle, 1)}</b> IC</span></i>`;
  return `<div class="pl-bar" data-pl-bar>${segs}${idle}</div>`;
}

/** Kapalı hattın nedeni ve (varsa) ona götüren düğme. */
function lineLock(me, id) {
  if (id === 'ships') {
    // Tersane binası yok: kapasite kıyı state'lerinin kalkınmasıdır.
    return { text: 'Needs <b>developed coastal states</b> — warships are built only in shipyards on a coast.', button: '' };
  }
  const techId = unlockTechOf(EQUIPMENT[id]?.unit);
  const tech = techById(techId)?.tech;
  const research = me.research ?? {};
  const status = research.current === techId ? ' · researching now'
    : research.queue?.includes(techId) ? ' · in the research queue' : '';
  return {
    text: `Needs <b>${esc(tech?.name ?? 'research')}</b>${tech ? ` · technology of ${tech.year}` : ''}${status}`,
    button: tech ? `<button class="k-btn sm" data-uc-goto-tech="${esc(techId)}">Show in Technology</button>` : '',
  };
}

/** Hat satırı: kimlik · öncelik · IC · verim · çıktı · depo · ordu · malzeme. */
function lineRow(me, id, { split, view, logistics, ironclad, cursor }) {
  const info = EQUIPMENT[id];
  const alloc = split.alloc[id];
  const tone = LINE_TONE[id];
  const nameCell = (sub) => `<span class="pl-name"${tipAttr('line', id)}>
      <span class="pl-art">${equipmentArt(id, 'sm', ironclad)}</span>
      <span class="pl-id"><b>${esc(info.name)}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    </span>`;

  if (!alloc.usable) {
    const lock = lineLock(me, id);
    return `<div class="pl-row locked ${tone}" data-pl-row="${id}">
      ${nameCell('')}
      <span class="pl-lock">${lock.text}</span>
      <span class="pl-go">${lock.button}</span>
    </div>`;
  }

  const line = view.lines?.[id] ?? { weight: 0, efficiency: 0, mode: 'auto' };
  const auto = line.mode !== 'manual';
  const current = linePriorityOf(line.weight);
  const log = logistics.find((row) => row.id === id) ?? { stock: 0, required: 0, etaWeeks: null };
  const deficit = Math.max(0, log.required - log.stock);
  const military = split.military;

  // Auto ışığı yanar; Auto'nun şu an çalıştığı kademe dipte ince ışıkla
  // işaretlenir. Kademe düğmelerinin bilgi kartı yok: üstünde durmak yeni
  // paylaşımı çubukta ve satırlarda zaten gösteriyor, kart onu örtüyordu.
  const steps = LINE_STEPS.map((step) => {
    const level = LINE_PRIORITIES.find((p) => p.id === step);
    const on = step === 'auto' ? auto : !auto && current.id === step;
    const at = auto && current.id === step;
    const tip = level ? null
      : { text: `Auto${auto ? ` — now ${current.id === 'off' ? 'stopped' : current.name}` : ''}\nThe ministry makes what the army lacks and stocks rifles for the reserve's mobilization: the line stops when the depot is full and speeds up in war.` };
    return `<button class="pl-pb${level ? '' : ' auto'}${on ? ' on' : ''}${at ? ' at' : ''}" data-uc-linepri="${id}:${step}"${on ? ' aria-pressed="true"' : ''}${tipAttr(tip)}>${level ? level.name : 'Auto'}</button>`;
  });

  const capped = id === 'ships' && split.shipCapped;
  const icTip = `${info.name} line\n${num(alloc.ic, 2)} IC: ${pct(shareOf(alloc.ic, military))} of the army's industry${capped ? `\nThe shipyards take at most ${num(alloc.ic, 1)} IC; the rest of this line's share is not drawn. Develop coastal states to raise it.` : ''}`;

  const eff = line.efficiency ?? 0;
  const cap = lineEfficiencyCap(me);
  const running = alloc.ic > 0;
  const trend = running ? (eff < cap - 0.0005 ? 'up' : '') : (eff > LINE_EFFICIENCY.floor + 0.0005 ? 'down' : '');
  const effTip = `Efficiency ${pct(eff)}\nA running line gains ${num(lineEfficiencyGain(me) * 100, 1)}% a week up to its cap of ${pct(cap)}; an idle line forgets ${num(LINE_EFFICIENCY.decay * 100, 1)}% a week, down to ${pct(LINE_EFFICIENCY.floor)}. Switching a line on and off wastes industry.`;

  const outTip = `Output\n${num(alloc.ic, 2)} IC × ${pct(eff)} efficiency ÷ ${num(info.ic, 2)} IC each${alloc.limit < 0.995 && running ? `\nMaterials cover only ${pct(alloc.limit)}: output cut to match.` : ''}`;
  const starved = running && alloc.limit < 0.995;

  const army = deficit > 0.5
    ? { cls: 'short', text: `Short ${short(deficit)}`, sub: log.etaWeeks != null ? `~${log.etaWeeks} wk to fill` : 'not filling' }
    : log.required > 0.5 ? { cls: 'ok', text: 'Covered', sub: `needs ${short(log.required)}` }
      : { cls: 'idle', text: 'Equipped', sub: 'nothing missing' };
  const armyTip = deficit > 0.5
    ? `Short of ${info.name.toLowerCase()}\nThe army needs ${num(log.required, 1)} for reinforcement and training; the depot holds ${num(log.stock, 1)}.${log.etaWeeks == null ? '\nThis line is not filling the gap: raise its priority.' : ''}`
    : log.required > 0.5 ? `${info.name}\nThe army needs ${num(log.required, 1)} for reinforcement and training; the depot covers it.`
      : `${info.name}\nNothing is missing: no regiment is short of them and no training waits for them.`;

  const recipe = id === 'ships' && ironclad ? info.ironclad : info.resources;
  const mats = Object.keys(recipe ?? {}).map((res) => {
    const amount = alloc.inputs[res] ?? 0;
    const scarce = amount > 0.005 && (me.economy?.resources?.[res]?.ratio ?? 1) < 0.8;
    return `<span class="pl-mat${amount > 0.005 ? '' : ' idle'}${scarce ? ' short' : ''}"${tipAttr('resource', res)}>${resourceArt(res, 'xs')}${amount > 0.005 ? `<b>${num(amount, amount >= 10 ? 0 : amount >= 1 ? 1 : 2)}</b>` : ''}</span>`;
  }).join('');

  return `<div class="pl-row ${tone}${cursor === id ? ' kb' : ''}${deficit > 0.5 ? ' short' : ''}" data-pl-row="${id}">
    ${nameCell(auto ? `Auto · ${current.id === 'off' ? 'stopped' : current.name}` : 'Manual')}
    <span class="pl-pri" role="group" aria-label="${esc(info.name)} priority">${steps[0]}<span class="pl-tiers">${steps.slice(1).join('')}</span></span>
    <span class="pl-ic"${tipAttr({ text: icTip })}><b class="${running ? '' : 'none'}${capped ? ' cap' : ''}" data-pl-ic="${id}">${icText(alloc.ic)}</b><small data-pl-share="${id}">${running ? pct(shareOf(alloc.ic, military)) : ''}</small></span>
    <span class="pl-eff"${tipAttr({ text: effTip })}>${meter(eff, { mark: cap, tone: running ? 'pos' : '' })}<b>${pct(eff)}</b><i class="pl-trend ${trend}"></i></span>
    <span class="pl-out"${tipAttr({ text: outTip })}><b class="${alloc.output > 0.005 ? '' : 'none'}" data-pl-out="${id}">${outText(alloc.output)}</b>${starved ? `<small class="warn">materials ${pct(alloc.limit)}</small>` : ''}</span>
    <span class="pl-depot"${tipAttr({ text: `${info.name} in the depot\n${num(log.stock, 1)} ready.` })}><b>${short(log.stock)}</b></span>
    <span class="pl-army ${army.cls}"${tipAttr({ text: armyTip })}><b>${army.text}</b><small>${army.sub}</small></span>
    <span class="pl-mats">${mats}</span>
  </div>`;
}

/**
 * Önizleme: dağılım çubuğunu ve satırların IC/çıktı hücrelerini verilen
 * ağırlıkla yerinde yazar; `override` yoksa şimdiki hâline döndürür. Hücreler
 * sabit genişlikte olduğundan satır oynamaz (styles.css §56).
 */
function paintLineSplit(root, me, override = null) {
  if (!root.querySelector('[data-pl-bar]')) return;
  const split = lineSplit(me, override);
  const base = override ? lineSplit(me) : split;
  const mark = (el, now, was) => {
    el.classList.toggle('none', now <= 0.005);
    el.classList.toggle('pv-up', !!override && now > was + 0.005);
    el.classList.toggle('pv-down', !!override && now < was - 0.005);
  };
  for (const id of [...EQUIPMENT_IDS, 'idle']) {
    const value = id === 'idle' ? split.idle : split.alloc[id].ic;
    const seg = root.querySelector(`[data-pl-seg="${id}"]`);
    if (seg) seg.style.width = segWidth(value, split.military);
    const segValue = root.querySelector(`[data-pl-segv="${id}"]`);
    if (segValue) segValue.textContent = num(value, 1);
    if (id === 'idle') continue;
    const icCell = root.querySelector(`[data-pl-ic="${id}"]`);
    if (icCell) {
      icCell.textContent = icText(value);
      mark(icCell, value, base.alloc[id].ic);
    }
    const share = root.querySelector(`[data-pl-share="${id}"]`);
    if (share) share.textContent = value > 0.005 ? pct(shareOf(value, split.military)) : '';
    const out = root.querySelector(`[data-pl-out="${id}"]`);
    if (out) {
      out.textContent = outText(split.alloc[id].output);
      mark(out, split.alloc[id].output, base.alloc[id].output);
    }
  }
  root.querySelector('[data-pl-bar]').classList.toggle('preview', !!override);
}

/** Önizlenen düğmenin ağırlığı. Auto'nun ağırlığını kural dört haftada bir yazar: önizlenmez. */
function previewWeights(key) {
  const [id, step] = String(key ?? '').split(':');
  const level = LINE_PRIORITIES.find((p) => p.id === step);
  return level && EQUIPMENT[id] ? { [id]: level.weight } : null;
}

/**
 * Factories klavyesi: ↑ ↓ hat seçer, ← → önceliğini Auto · Off · Low ·
 * Normal · High sırasında kaydırır. Kapalı hat atlanır.
 */
export function industryKey(screens, event) {
  const me = screens.me;
  const state = screens.uc;
  if (!me?.economy) return false;
  const vertical = event.code === 'ArrowDown' || event.code === 'ArrowUp';
  const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  if (!vertical && !horizontal) return false;
  const { usable, id } = lineCursor(me, state);
  if (!id) return true;
  if (vertical) {
    const step = event.code === 'ArrowDown' ? 1 : -1;
    state.lineCursor = usable[Math.max(0, Math.min(usable.length - 1, usable.indexOf(id) + step))];
  } else {
    const line = me.economy.lines?.[id];
    const now = line?.mode === 'manual' ? linePriorityOf(line.weight).id : 'auto';
    const index = LINE_STEPS.indexOf(now) + (event.code === 'ArrowRight' ? 1 : -1);
    const next = LINE_STEPS[Math.max(0, Math.min(LINE_STEPS.length - 1, index))];
    if (next !== now) setLinePriority(me, id, next);
  }
  state.lineKeyboard = true;
  state.kbScreen = 'industry';
  screens.refresh();
  screens.game.emit('politics', me.id);
  return true;
}

// ============================================================ DEVELOPMENT ===
//
// KALKINMA (Tek Çubuk, 2026-10-15). Bina kataloğu, kuyruk, yuva ve "en iyi
// N" düğmeleri kalktı: kalan çıktı fona akar, fon kademeyi kendisi alır
// (econ/investment.js). Oyuncunun tek kararı fonun önce NEREYE gideceğidir:
// Develop odağı (dörtte bir ucuz, sıranın başı). Ekran fonun sırasını ve
// her state'in kademe başına getirisini gösterir.

/**
 * State satırları, FONUN SIRASIYLA: hedef önce, sonra Develop odaklı açık
 * state'ler, sonra öteki açıklar (kazanç ÷ bedel), en sonda kalkınamayanlar
 * (tavanda ya da uyumu düşük). Kural investmentTarget'ınkidir; ekran,
 * klavye ve fon aynı listeyi okur.
 */
function developmentRows(world, me) {
  const cap = developmentCap(me);
  const factors = outputFactors(me);
  const target = investmentTarget(world, me);
  const rows = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== me.id || !province.econ) continue;
    const econ = province.econ;
    const dev = econ.development ?? 1;
    const atCap = dev >= cap;
    const weak = (econ.status ?? 1) < INVEST.minStatus;
    const cost = atCap ? 0 : levelCost(province);
    const gain = atCap ? 0 : levelGain(world, me, province, factors);
    rows.push({
      province,
      name: provinceName(province.center),
      dev,
      cap,
      cost,
      gain,
      open: !atCap && !weak,
      closed: atCap ? 'at the cap' : weak ? 'low compliance' : '',
      focus: econ.focus === 'develop',
      target: province === target,
      score: cost > 0 ? gain / cost : 0,
    });
  }
  const rank = (row) => (row.target ? 0 : !row.open ? 3 : row.focus ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || b.score - a.score || a.province.id - b.province.id);
}

/** Klavye imleci state kimliğiyle tutulur: odak değişince satır yer değiştirir, imleç onu izler. */
function devCursor(rows, state) {
  if (!rows.some((row) => row.province.id === state.devCursor)) state.devCursor = rows[0]?.province.id ?? null;
  return state.devCursor;
}

/** Develop odağını açar/kapar; konamazsa sebebi günlüğe yazar. */
function toggleDevelop(game, me, province) {
  if (!province?.econ) return false;
  const on = province.econ.focus === 'develop';
  if (setFocus(game.world, me, province, on ? null : 'develop')) return true;
  const why = focusBlockers(game.world, me, province, 'develop')[0];
  game.turns?.addLog?.(why ?? 'No free focus slot — clear one in the State focus list.', { kind: 'POLITICS', key: 'focus-full' });
  return false;
}

/** State satırı: yatak · ad · kalkınma · el/sanayi · sonraki kademe · getiri · kale · odak. */
function devRow(world, me, row, cursor) {
  const province = row.province;
  const econ = province.econ;
  const out = provinceOutputOf(province, me);
  const fort = econ.fort ?? 0;
  const payback = row.gain > 1e-6 ? Math.ceil(row.cost / row.gain) : null;
  const other = econ.focus && econ.focus !== 'develop' ? FOCUS_BY_ID[econ.focus] : null;
  const blockers = row.focus ? [] : focusBlockers(world, me, province, 'develop');
  const preview = row.focus ? null : focusPreview(world, me, province, 'develop');
  const focusTip = row.focus
    ? 'Develop focus\nThe development fund comes here first and its levels cost 25% less.\nClick to remove it and free the slot.'
    : ['Develop focus', ...(preview?.lines ?? []), other ? `Replaces its ${other.name} focus.` : 'Uses a focus slot.'].join('\n');
  const button = `<button class="k-btn sm ec-devbtn${row.focus ? ' on' : ''}" data-uc-develop="${province.id}"${row.focus ? ' aria-pressed="true"' : ''}${blockers.length ? blockedAttr(blockers) : tipAttr({ text: focusTip })}>${row.focus ? 'Developing' : 'Develop'}</button>`;
  const gainTip = row.open
    ? `${row.name}: one more level\n+${num(row.gain, 2)} IC a week: more industry, and richer deposits at world prices.\nCosts ${money(row.cost, 0)}${row.focus ? ' (Develop focus: 25% off)' : ''}${payback != null ? `: pays for itself in ~${payback} weeks.` : '.'}`
    : `${row.name}\n${row.closed === 'at the cap' ? 'At the development cap: research and literacy raise it.' : 'Compliance under 50%: the fund does not invest here yet.'}`;
  const levelTip = `Development ${row.dev} of ${DEVELOPMENT_MAX}\nEvery level above 1 adds industry (${INDUSTRY_PER_DEV} IC per 100k workers). The cap is ${row.cap}.`;
  return `<div class="k-wrow k-dvrow${row.open ? '' : ' off'}${row.target ? ' target' : ''}${cursor === province.id ? ' kb' : ''}" data-uc-dvrow="${province.id}">
    <span class="k-wrow-res">${resourceArt(depositsOf(province)[0]?.id, 'sm')}</span>
    <span class="k-wrow-name"><button class="k-link" data-uc-focus="${province.id}"${tipAttr('state', province.id)}>${esc(row.name)}</button>
      <small>${formatPopulation(econ.population)}${econ.core === false ? ' · <em>not core</em>' : ''}${row.target ? ' · <b class="ec-saving">the fund saves here</b>' : ''}</small></span>
    <span class="ec-dvlv"${tipAttr({ text: levelTip })}>${pips(row.dev, DEVELOPMENT_MAX, row.cap)}<b>${row.dev}</b></span>
    <span class="ec-dvout"${tipAttr({ text: `${row.name}\nHandwork ${num(out.hand, 2)} IC + industry ${num(out.industry, 2)} IC a week, national factors included.` })}><b>${num(out.hand, 1)}</b><i>·</i><b>${num(out.industry, 1)}</b></span>
    <span class="ec-dvcost">${row.open ? `<b>${money(row.cost, 0)}</b>` : `<small>${esc(row.closed)}</small>`}</span>
    <span class="ec-dvgain"${tipAttr({ text: gainTip })}>${row.open ? `<b>+${num(row.gain, 2)}</b><small>${payback != null ? `pays back ~${payback} wk` : 'no gain'}</small>` : '<small class="k-dim">—</small>'}</span>
    <span class="ec-dvfort"${tipAttr({ text: `Fort level ${fort}\nA fixed feature of the map: it slows sieges and cannot be built.` })}>${fort > 0 ? pips(fort, 3) : '<small class="k-dim">—</small>'}</span>
    ${button}
  </div>`;
}

const DEV_KEYS = `<div class="k-keys">
  <span><kbd>↑</kbd><kbd>↓</kbd> state</span><span><kbd>Enter</kbd> / <kbd>B</kbd> Develop focus</span><span><kbd>A</kbd> auto</span>
</div>`;

export function renderConstruction(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const invest = view.alloc?.invest ?? 0;
  const efficiency = view.investEfficiency ?? 1;
  const invested = invest * efficiency;
  const rows = developmentRows(world, me);
  const next = rows.find((row) => row.target) ?? null;
  const fund = view.fund;
  const left = next ? Math.max(0, next.cost - fund) : 0;
  const eta = !next ? null : left <= 0 ? 0 : invested > 0.01 ? Math.ceil(left / invested) : null;
  const slots = focusSlots(me);
  const focused = focusedStates(world, me);
  const developing = focused.filter((p) => p.econ.focus === 'develop').length;
  const open = rows.filter((row) => row.open).length;

  const kpis = kpiRow([
    kpi({
      icon: emblemArt('infrastructure', 'md'), label: 'Invested', value: num(invested, 1), cls: 'hero',
      sub: `IC a week · ${num(invest, 1)} × ${num(efficiency, 2)} efficiency`,
      tip: { text: 'Invested\nWhat is left of output after bills, the army and the people, times the investment efficiency: research, advisors, Industrial Subsidies and Free Trade raise it; a timber or iron shortage cuts it by up to half.' },
    }),
    kpi({
      label: 'Next level', value: next ? `${short(fund)} / ${short(next.cost)}` : short(fund),
      sub: next ? `${esc(next.name)} → ${next.dev + 1} · ${eta == null ? 'not saving' : eta === 0 ? 'this week' : `~${eta} wk`}` : 'every state is at the cap',
      tip: { text: 'Next level\nThe fund saves for one state at a time and buys its next level as soon as it can pay: Develop-focus states first, then the best gain for the cost.' },
      meter: next && next.cost > 0 ? fund / next.cost : 0, meterTone: 'pos',
    }),
    kpi({
      label: 'Development cap', value: String(view.developmentCap), sub: `of ${DEVELOPMENT_MAX} · research and literacy raise it`,
      tip: { text: `Development cap\nNo state may develop beyond it: ${DEVELOPMENT_CAP_BASE}, plus research, plus literacy × ${DEVELOPMENT_CAP_LITERACY} (literacy now ${pct(view.literacy)}). Schools cost output today and open the cap tomorrow.` },
    }),
    kpi({
      label: 'Fund floor', value: money(view.fundFloor, 0), sub: 'four weeks of output below zero',
      tip: { text: 'Fund floor\nGenerals, settlers, event choices and imports may take the fund below zero, down to this floor. Below zero no level is bought until it recovers.' },
    }),
    kpi({
      label: 'Develop focus', value: String(developing), sub: `${focused.length} of ${slots} focus slots in use`,
      tip: { text: 'Develop focus\nThe fund serves these states first and their levels cost 25% less. Focus slots grow with literacy and are shared with Production, Recruitment, Integration and Assimilation.' },
    }),
  ]);

  const cursor = devCursor(rows, state);
  const highlight = state.lineKeyboard && state.kbScreen === 'construction' ? cursor : null;
  const head = `<div class="k-wrow k-dvrow head"><span></span><span>State</span><span>Development</span>
    <span class="r"${tipAttr({ text: 'Output a week\nHandwork · industry, national factors included.' })}>Hand · industry</span>
    <span class="r">Next level</span><span class="r">Gain / wk</span><span>Fort</span><span></span></div>`;
  const body = rows.length ? rows.map((row) => devRow(world, me, row, highlight)).join('') : empty('You own no states.');
  const free = Math.max(0, slots - focused.length);

  return `${kpis}
    ${panel('States', `<div class="k-wtable">${head}${body}</div>${DEV_KEYS}`, {
    sub: `in the order the fund buys · ${open} of ${rows.length} can develop`,
    right: `${developing} developing · ${free} free slot${free === 1 ? '' : 's'}`,
    cls: 'ec-states',
  })}`;
}

/**
 * Development klavyesi (screens.handleKey): ↑ ↓ state seçer, Enter ya da B
 * imleçteki state'in Develop odağını açar/kapar. Fare akışının aynısı.
 */
export function constructionKey(screens, event) {
  const { game } = screens;
  const me = screens.me;
  const state = screens.uc;
  if (!me) return false;
  const vertical = event.code === 'ArrowDown' || event.code === 'ArrowUp';
  const enter = event.code === 'Enter' || event.code === 'NumpadEnter';
  if (!vertical && !enter && event.code !== 'KeyB') return false;
  // Ekranın İÇİNDEKİ odaklı düğme kendi Enter'ını kullanır (klavyeyle gezen
  // oyuncu). Fareyle tıklanan sekme düğmesi odakta kalıyordu: Enter o düğmeyi
  // çalıştırıp ekranı kapatıyordu (ölçüldü).
  if (enter && event.target?.closest?.('#screen-body button, #screen-body a, #screen-body input, #screen-body select')) return false;
  const rows = developmentRows(game.world, me);
  const id = devCursor(rows, state);
  if (id == null) return true;
  const at = rows.findIndex((row) => row.province.id === id);
  if (vertical) {
    const step = event.code === 'ArrowDown' ? 1 : -1;
    state.devCursor = rows[Math.max(0, Math.min(rows.length - 1, at + step))].province.id;
  } else {
    toggleDevelop(game, me, rows[at].province);
  }
  // Klavye vurgusu bayrağı Factories'inkiyle ortaktır (screens.close onu
  // düşürür); hangi ekranda gezildiğini kbScreen söyler.
  state.lineKeyboard = true;
  state.kbScreen = 'construction';
  screens.refresh();
  game.emit('politics', me.id);
  screens.el.body.querySelector('.k-dvrow.kb')?.scrollIntoView({ block: 'nearest' });
  return true;
}

// ============================================================ POPULATION ===

export function renderPopulation(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const economy = me.economy ?? {};
  const view = peoplesView(world, me, turn);
  const goal = GOALS[me.goal];
  const g = view.growth;
  const yearly = (rate) => `${signed(rate * 52 * 100, 2)}%`;

  // Halklar, huzursuzluk ve hareketler Cultures sekmesindedir (renderCultures):
  // bu ekran nüfusun kendisidir — büyüme, okuryazarlık, insan gücü, birleşme.
  const kpis = kpiRow([
    kpi({ icon: emblemArt('people', 'md'), label: 'Population', value: formatPopulation(economy.population ?? populationOf(world, me)), sub: `${yearly(g.rate)} a year${view.realized != null ? ` · last year ${signed(view.realized * 100, 2)}%` : ''}`, tip: { text: 'Population\nGrows with food, consumer goods, stability, development and peace; war and famine shrink it. The Growth panel shows every factor.' } }),
    kpi({ icon: lawArt('education', 'md'), label: 'Literacy', value: pct(economy.literacy), sub: `heading for ${pct(economy.literacyTarget ?? literacyTarget(world, me))}`, tip: 'law', arg: 'education', meter: economy.literacy, meterTone: 'pos' }),
    kpi({ icon: emblemArt('recruits', 'md'), label: 'Manpower', value: formatPopulation(nationManpower(world, me.id)), sub: 'men who can still be raised', tip: 'manpower' }),
    kpi({ icon: lawArt('citizenship', 'md'), label: 'Full citizens', value: pct(economy.acceptedShare ?? acceptedShareOf(world, me)), sub: 'of the population · Cultures tab', tip: 'law', arg: 'citizenship', meter: economy.acceptedShare ?? acceptedShareOf(world, me) }),
  ]);

  // --- Büyüme -------------------------------------------------------------
  const growthBody = g.famine
    ? `<div class="k-famine"><b>Famine</b> — food covers ${pct(g.foodRatio)} of need; the population shrinks ${yearly(g.rate)} a year. Import food, or give farm states the Production focus.</div>`
    : `<div class="k-growth-top"><b class="${g.rate >= 0 ? 'pos' : 'neg'}">${yearly(g.rate)}</b><small>a year</small>${spark(view.history, { width: 200, height: 34, zero: false })}</div>
      ${chain({ label: 'Base', text: `${num(g.base * 5200, 2)}%`, value: g.base }, [
    { label: 'Food', value: g.food, tip: { text: `Food\nShortfall slows growth; below 70% covered, famine.\nCovered ${pct(g.foodRatio)}` } },
    { label: 'Goods', value: g.consumer, tip: { text: 'Consumer goods\nFull shelves add growth, empty ones take it away.' } },
    { label: 'Stability', value: g.stability },
    { label: 'Development', value: g.development, tip: { text: 'Development\nPopulation-weighted across your states: +5% per level.' } },
    { label: 'Law', value: g.law },
    { label: 'Tech & ideas', value: g.mods },
    { label: 'Peace', value: g.peace, tip: { text: 'Peace\nAt war, growth is cut by 40%.' } },
  ], { label: 'per year', text: yearly(g.rate), value: g.rate })}`;

  // --- Birleşme -----------------------------------------------------------
  const status = view.status;
  const held = status.total ? status.owned / status.total : 0;
  const unionRows = view.unions.map((u) => `<div class="k-urow">
      <b>${esc(u.name)}</b><small>${formatPopulation(u.population)}</small>
      <span class="k-urow-ratio ${u.ratio >= u.need ? 'pos' : ''}"${tipAttr({ text: `Size\nWe must be ${u.need}× their population to absorb them peacefully. Now ${num(u.ratio, 1)}×.` })}>${num(u.ratio, 1)}× <small>/ ${u.need}×</small></span>
      <button class="k-btn sm" data-uc-union="${u.id}"${blockedAttr(u.blockers)}${u.blockers.length ? '' : tipAttr({ text: `Union\nTheir whole state joins ours in peace. Costs ${u.power} political power and a little infamy.` })}>Union<small>${u.power} PP</small></button>
    </div>`).join('');
  const formBlockers = formationBlockers(world, me);

  return `${kpis}
    <div class="k-split k-pop">
      <div class="k-stack">
        ${panel('Growth', growthBody, { sub: 'why the population grows' })}
        ${panel('Education', lawCard(world, me, 'education', state.confirm, { compact: true }), { sub: 'literacy speeds research and assimilation and opens focus slots' })}
      </div>
      <div class="k-stack">
        ${panel(`The ${esc(status.culture)} nation`, `
          <div class="k-unify"${tipAttr({ text: 'Unification\nHold 80% of your people\'s homeland to proclaim the Great nation: a core on every homeland state, prestige and an end to the kin-abroad grievance.' })}>
            <small>Homeland held</small>${meter(held, { tone: 'pos', mark: 0.8, wide: true })}<b>${status.owned} / ${status.total}</b>
          </div>
          <div class="k-unify-sub"><span>Kin under foreign rule <b class="${(economy.kinAbroad ?? 0) > 0.1 ? 'neg' : ''}">${pct(economy.kinAbroad ?? 0)}</b></span>
            ${goal ? `<span${tipAttr({ text: `${goal.name}\n${goal.desc}` })}>Goal: <b>${esc(goal.name)}</b> ${goalMet(world, me) ? badge('on track', 'pos') : badge(`+${goal.bonus} in ${END_YEAR}`, 'dim')}</span>` : ''}</div>
          ${unionRows ? `<div class="k-unions">${unionRows}</div>` : ''}
          <button class="k-btn wide" data-uc-form="1"${blockedAttr(formBlockers)}>Proclaim the Great ${esc(status.culture)} Empire</button>`, { sub: status.formed == null ? 'unification' : status.formed === me.id ? 'proclaimed' : 'claimed by another' })}
      </div>
    </div>`;
}

// =============================================================== CULTURES ===

/**
 * KÜLTÜRLER (Kerem 2026-10-12: "kültürler için bir sekmemiz olabilir").
 * Solda halklar (satır tıklanınca seçilir) ve huzursuz state'ler; sağda
 * seçili halkın kartı — politika ZİNCİRİ üç basamaktır: haklar (kabul),
 * eritme (asimilasyon odağı, zorla asimilasyon), uzaklaştırma (bırakma,
 * sürgün, toplama; yalnız ayaklanan ya da hareketi olan halka). Altında boş
 * topraklar ve iskân, ulusal hareketler, bütün odaklar ve vatandaşlık yasası.
 * Sayılar game/peoplesView (peopleDetail, resettlementView) dökümündendir.
 */
export function renderCultures(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const economy = me.economy ?? {};
  const view = peoplesView(world, me, turn);
  const pick = view.peoples.find((row) => row.id === state.people)
    ?? view.peoples.find((row) => !row.primary && !row.accepted)
    ?? view.peoples.find((row) => !row.primary) ?? view.peoples[0];
  const detail = pick ? peopleDetail(world, me, pick.id, turn) : null;
  const settle = resettlementView(world, me);
  const unaccepted = view.peoples.filter((row) => !row.accepted).length;
  const worst = view.movements.reduce((best, row) => (!best || row.progress > best.progress ? row : best), null);

  const kpis = kpiRow([
    kpi({ icon: emblemArt('people', 'md'), label: 'Peoples', value: String(view.peoples.length), sub: unaccepted ? `${unaccepted} without full rights` : 'all accepted', tip: { text: 'Peoples\nEvery people living in your states. Those you have not accepted pay less, serve less and feed national movements.' } }),
    kpi({ icon: lawArt('citizenship', 'md'), label: 'Full citizens', value: pct(economy.acceptedShare ?? acceptedShareOf(world, me)), sub: 'of the population', tip: 'law', arg: 'citizenship', meter: economy.acceptedShare ?? acceptedShareOf(world, me) }),
    kpi({ icon: emblemArt('infamy', 'md'), label: 'Unrest', value: num(view.unrest, 1), sub: view.boiling ? `${view.boiling} state${view.boiling === 1 ? '' : 's'} at revolt level` : `revolt level is ${view.revoltAt}`, tip: { text: `Unrest (0-10)\nPopulation-weighted across your states. Above ${view.revoltAt} a state can rise; where an unaccepted people is the majority, unrest above 6 feeds their national movement.` }, meter: view.unrest / 10, meterTone: view.unrest >= 4 ? 'neg' : 'warn' }),
    kpi({ label: 'Movements', value: String(view.movements.length), sub: worst ? `${esc(worst.name)} · ${esc(worst.stage.name)} ${Math.round(worst.progress)}%` : 'none growing', cls: worst && worst.progress >= 50 ? 'warn' : '', tip: { text: 'National movements\nA people without rights that is the majority somewhere organises; at 100% their states break away.' } }),
    kpi({ label: 'Empty land', value: String(settle.emptied.length), sub: settle.ongoing ? `settlers on the way · ${settle.ongoing.weeks} wk` : settle.emptied.length ? 'provinces half empty' : 'every province lived in', cls: settle.emptied.length && !settle.ongoing ? 'warn' : '', tip: { text: 'Empty land\nProvinces that lost half their people to deportation or confinement. Settlers of our own people can fill them.' } }),
  ]);

  const acceptTip = (row) => {
    const p = row.accept.preview;
    return { text: [
      `Accept the ${row.name}`,
      `Recruits +${formatPopulation(p.recruits)}`,
      `Unrest where they live: ${num(p.unrestFrom, 1)} → ${num(p.unrestTo, 1)} (target)`,
      'They work at full output, fill the ranks and stop feeding a movement.',
      `Cost: ${p.power} political power`,
      `Backlash: your own people +${num(p.backlash, 1)} unrest, fading over ${Math.round(p.backlashWeeks / 52)} years`,
    ].join('\n') };
  };
  const stageChip = (move) => (move
    ? `<span class="k-stage s${move.stage.index}"${tipAttr({ text: `${move.stage.name} · ${Math.round(move.progress)}%\nAt 100% their states break away${move.heir ? ` and ${move.heir.name} goes to war with us` : ''}.${move.eta != null ? `\nAt this pace: ~${move.eta} weeks.` : ''}` })}>${esc(move.stage.name)} <b>${Math.round(move.progress)}%</b></span>`
    : '<span class="k-dim">—</span>');
  // --- Halklar: satır seçilir; politika rozetleri ------------------------
  const peopleHead = `<div class="k-prow head"><span>People</span><span>Share</span><span>Lives in</span><span>Unrest</span><span>Movement</span><span>Policy</span></div>`;
  const peopleRows = view.peoples.slice(0, 16).map((row) => {
    const status = row.primary ? badge('primary', 'gold') : row.accepted ? badge('accepted', 'pos') : badge('no rights', 'dim');
    const forced = forcedAssimilation(me, row.id);
    const reservation = (world.provinces ?? []).some((p) => p.owner === me.id && p.econ?.reservation === row.id);
    const policy = [
      forced ? badge('forced', 'neg') : '',
      reservation ? badge('reservation', 'neg') : '',
    ].join('') || '<span class="k-dim">—</span>';
    return `<button type="button" class="k-prow k-prow-pick${pick?.id === row.id ? ' on' : ''}" data-uc-people="${row.id}"${tipAttr('culture', row.id)}>
      <span class="k-prow-name"><i style="background:${row.color}"></i><b>${esc(row.name)}</b>${status}</span>
      <span class="k-prow-share">${meter(row.share, { tone: row.accepted ? 'pos' : 'warn' })}<b>${pct(row.share)}</b><small>${formatPopulation(row.people)}</small></span>
      <span class="k-prow-where"><span><b>${row.states}</b> state${row.states === 1 ? '' : 's'}</span><small>${row.majority ? `majority in ${row.majority}` : 'minority everywhere'}</small></span>
      <span class="k-prow-unrest">${meter(row.unrest / 10, { tone: row.unrest >= 6 ? 'neg' : row.unrest >= 3 ? 'warn' : 'pos', mark: 0.6 })}<b>${num(row.unrest, 1)}</b></span>
      <span class="k-prow-move">${stageChip(row.movement)}</span>
      <span class="k-prow-acts">${policy}</span>
    </button>`;
  }).join('');

  // --- Huzursuz state'ler, sebebiyle ------------------------------------
  const restlessRows = view.restless.map((row) => {
    const culture = world.cultures?.[row.culture];
    const rising = row.target > row.unrest + 0.15;
    const falling = row.target < row.unrest - 0.15;
    const causes = row.causes.slice(0, 2).map((c) => `<span class="k-cause">${esc(c.label)} <b>+${num(c.value, 1)}</b></span>`).join('')
      + row.reliefs.slice(0, 1).map((c) => `<span class="k-cause pos">${esc(c.label)} <b>${num(c.value, 1)}</b></span>`).join('');
    const tip = [`${row.name}: unrest ${num(row.unrest, 1)}, heading for ${num(row.target, 1)}`,
      ...row.causes.map((c) => `${c.label} +${num(c.value, 2)}`),
      ...row.reliefs.map((c) => `${c.label} ${num(c.value, 2)}`),
      `Compliance ${Math.round(row.compliance)}% · foreign ${pct(row.foreign)}`].join('\n');
    return `<div class="k-rrow">
      <span class="k-rrow-name"><i style="background:${culture?.color ?? '#888'}"></i><button class="k-link" data-uc-focus="${row.id}"${tipAttr('state', row.id)}>${esc(row.name)}</button><small>${esc(culture?.name ?? '')}</small></span>
      <span class="k-rrow-val"${tipAttr({ text: tip })}>${meter(row.unrest / 10, { tone: row.unrest >= 7 ? 'neg' : row.unrest >= 4 ? 'warn' : 'party', mark: 0.7 })}<b class="${row.unrest >= 7 ? 'neg' : ''}">${num(row.unrest, 1)}</b><i class="k-trend ${rising ? 'up' : falling ? 'down' : ''}">${rising ? '▲' : falling ? '▼' : '■'}</i></span>
      <span class="k-rrow-causes"${tipAttr({ text: tip })}>${causes || '<span class="k-dim">settling</span>'}</span>
      <span class="k-rrow-comp">${Math.round(row.compliance)}%</span>
    </div>`;
  }).join('');

  // --- Ulusal hareketler --------------------------------------------------
  const moveCards = view.movements.map((row) => {
    const a = row.actions;
    const act = (id, label, cfg, tip, cls = '') => {
      const key = `move:${id}:${row.cultureId}`;
      const arming = state.confirm === key;
      return `<button class="k-btn sm ${cls}${arming ? ' confirming' : ''}" data-uc-move="${id}:${row.cultureId}"${cfg.blockers.length ? blockedAttr(cfg.blockers) : tipAttr({ text: tip })}>${arming ? 'Confirm' : label}</button>`;
    };
    const ticks = MOVEMENT.STAGES.slice(1).map((s) => `<i style="left:${s.at}%"></i>`).join('');
    const pace = row.martialLeft > 0 ? `martial law · ${row.martialLeft} wk`
      : row.calmLeft > 0 ? `exhausted · ${row.calmLeft} wk`
        : row.eta != null ? `breaks away in ~${row.eta} wk` : 'fading';
    return `<div class="k-move s${row.stage.index}" style="--mv:${row.color ?? '#888'}">
      <div class="k-move-head"><i></i><b>${esc(row.name)}</b><span class="k-stage s${row.stage.index}">${esc(row.stage.name)}</span><small>${pace}</small></div>
      <div class="k-move-bar"${tipAttr({ text: `${Math.round(row.progress)}% — at 100% ${row.provinces.length} state${row.provinces.length === 1 ? '' : 's'} break away${row.heir ? ` and ${row.heir.name} goes to war with us` : ''}.\nIt grows while their unrest stays above ${row.calm} (now ${num(row.pressure, 1)}).` })}><i class="fill" style="width:${row.progress.toFixed(1)}%"></i>${ticks}</div>
      <div class="k-move-acts">
        ${act('concessions', `Concede · ${a.concessions.cost} PP`, a.concessions, `Temporary: −${a.concessions.drop}% progress and calmer states. Once a year.`)}
        ${act('martial', `Martial law · ${money(a.martial.cost, 1)}/wk`, a.martial, `Temporary: for ${a.martial.weeks} weeks the movement loses ground; it adds a weekly bill (paid off the top of output) and costs some stability.`)}
        ${act('vassal', `Release ${a.vassal.provinces} as vassal`, a.vassal, 'Permanent: their states become our vassal. The land goes, the war never comes, they pay us 15% of their income.')}
        ${act('crackdown', `Crush · ${formatPopulation(a.crackdown.dead)} die`, a.crackdown, `Permanent: ${formatPopulation(a.crackdown.dead)} of them die. −${a.crackdown.drop}% progress, heavy infamy, lost stability; our other peoples grow bolder.`, 'danger')}
      </div>
    </div>`;
  }).join('');

  return `${kpis}
    <div class="k-split wide-left k-cult">
      <div class="k-stack">
        ${panel('Peoples', `<div class="k-ptable">${peopleHead}${peopleRows}</div>`, { sub: 'click a people to see what can be done' })}
        ${panel('Restless states', restlessRows ? `<div class="k-rtable">${restlessRows}</div>${view.restlessMore ? `<small class="k-more">and ${view.restlessMore} calmer state${view.restlessMore === 1 ? '' : 's'}</small>` : ''}` : empty('Every state is calm.'), { sub: `out of 10 · revolt at ${view.revoltAt} · ▲ rising ▼ settling`, right: 'cause · compliance' })}
      </div>
      <div class="k-stack">
        ${detail ? peopleCard(world, me, detail, state, acceptTip) : ''}
        ${settle.emptied.length || settle.ongoing ? resettleCard(settle) : ''}
        ${panel('National movements', moveCards || empty('No movement is growing. One rises where an unaccepted people is the majority and their unrest stays above 6.'), { sub: view.movements.length ? 'act before they break away' : 'peoples without rights organise here' })}
        ${focusCard(world, me)}
        ${panel('Citizenship', lawCard(world, me, 'citizenship', state.confirm, { compact: true }), { sub: 'rights for peoples you have not accepted' })}
      </div>
    </div>`;
}

/** Seçili halkın kartı: kim, nerede, ve üç basamaklı politika zinciri. */
function peopleCard(world, me, d, state, acceptTip) {
  const confirmBtn = (key, attr, label, tip, blockers, cls = '') => {
    const arming = state.confirm === key;
    return `<button class="k-btn sm ${cls}${arming ? ' confirming' : ''}" ${attr}${blockers.length ? blockedAttr(blockers) : tipAttr({ text: tip })}>${arming ? 'Confirm' : label}</button>`;
  };
  const homes = d.homes.slice(0, 6).map((home) => `<button type="button" class="k-chipbtn" data-uc-focus="${home.id}"${tipAttr({ text: `${home.name}\n${formatPopulation(home.people)} ${d.name} · ${pct(home.share)} of the state${home.homeland ? ' · their homeland' : ''}${home.reservation ? ' · reservation' : ''}\nUnrest ${num(home.unrest, 1)}${home.focus ? ` · focus: ${home.focus}` : ''}` })}>${esc(home.name)} <b>${pct(home.share)}</b>${home.homeland ? '<i>⌂</i>' : ''}${home.reservation ? '<i>▣</i>' : ''}</button>`).join('');
  const more = d.homes.length > 6 ? `<small class="k-dim">+${d.homes.length - 6} more</small>` : '';
  const kin = d.kin.length ? `kin state: <b>${d.kin.map((k) => esc(k.name)).join(', ')}</b>` : 'no kin state';

  // 1) HAKLAR
  const rights = d.primary
    ? '<p class="k-dim">Our own people.</p>'
    : d.accepted
      ? (() => {
        const r = d.revoke.preview;
        const tip = `Revoke their acceptance\nThey become foreign again: ${formatPopulation(r.recruits)} fewer recruits, unrest heads for ${num(r.unrestTo, 1)} where they live and keeps growing each year until you act, and their old movement can stir again.\nIn return they can be assimilated once more — and deported or confined if they rise.\nThe political power spent is not returned; accepting them again costs ${r.power} PP. The cabinet will not re-accept them on its own.`;
        return `<div class="k-pol-row">${confirmBtn(`revoke:${d.id}`, `data-uc-revoke="${d.id}"`, 'Revoke', tip, d.revoke.blockers, 'danger')}
          <span>recruits −${formatPopulation(r.recruits)} · unrest ${num(r.unrestFrom, 1)} → ${num(r.unrestTo, 1)}</span></div>
          <p class="k-dim">Accepted: full citizens — they work, serve and feed no movement.</p>`;
      })()
      : (() => {
        const blocked = d.accept.blockers;
        const tip = blocked.length
          ? ` disabled aria-disabled="true"${tipAttr({ text: `Not possible now\n${blocked.join('\n')}\n\n${acceptTip({ name: d.name, accept: d.accept }).text}` })}`
          : tipAttr(acceptTip({ name: d.name, accept: d.accept }));
        return `<div class="k-pol-row"><button class="k-btn sm" data-uc-accept="${d.id}"${tip}>Accept<small>${d.accept.preview.power} PP</small></button>
          <span>recruits +${formatPopulation(d.accept.preview.recruits)} · unrest ${num(d.accept.preview.unrestFrom, 1)} → ${num(d.accept.preview.unrestTo, 1)}</span></div>`;
      })();

  // 2) ERİTME
  const melt = d.primary || d.accepted ? '' : `
    <div class="k-pol-row"><span class="k-pol-label">Assimilation focus</span><span>${d.focusStates} of their ${d.homes.length} state${d.homes.length === 1 ? '' : 's'}</span>
      <button class="k-btn sm" data-uc-melt="${d.id}"${tipAttr({ text: `Assimilation focus\nPut the focus on their largest state without one: 2-4% of its people a year take up our culture. Uses a focus slot.` })}>Focus their largest state</button></div>
    <div class="k-pol-row"><span class="k-pol-label">Forced assimilation</span>
      <span>${d.forced ? `<b class="neg">in force</b> · ~${formatPopulation(d.force.yearly)} a year` : `~${formatPopulation(d.force.yearly)} a year · unrest +${num(d.force.unrest, 1)} · infamy +${d.force.infamy}`}</span>
      ${d.forced
    ? `<button class="k-btn sm" data-uc-force="${d.id}:0"${tipAttr({ text: 'Lift it\nTheir children may learn their own tongue again. What has melted stays melted.' })}>Lift</button>`
    : confirmBtn(`force:${d.id}`, `data-uc-force="${d.id}:1"`, 'Impose', `Forced assimilation\nTheir newborns count as ours: ~${formatPopulation(d.force.yearly)} of them a year take up our culture, even in their homeland. Unrest +${num(d.force.unrest, 1)} where they live; infamy +${d.force.infamy}.`, d.force.blockers, 'danger')}</div>`;

  // 3) UZAKLAŞTIRMA (kriz kapısı)
  const where = d.deport.destinations.map((row) => `${esc(row.name)}${row.kin ? ' (kin)' : ''}`).join(', ');
  const away = d.primary || d.accepted ? '' : `
    <div class="k-pol-row">
      ${confirmBtn(`release:${d.id}`, `data-uc-release="${d.id}"`, 'Release', `${d.release.label ?? 'Release'}\nEvery province where they are the majority leaves with them: to their kin state next door, or as their own Free State. No war; the world thinks better of us (infamy falls).`, d.release.blockers)}
      ${confirmBtn(`expel:${d.id}`, `data-uc-expel="${d.id}"`, 'Deport', `Deport\nAll ${formatPopulation(d.people)} of them are driven across the border${where ? ` to ${where}` : ''}. Infamy +${Math.round(d.deport.infamy)}. Their provinces empty — settlers can fill them.`, d.deport.blockers, 'danger')}
      ${confirmBtn(`confine:${d.id}`, `data-uc-confine="${d.id}"`, d.confine.target ? `Confine to ${esc(d.confine.target.name)}` : 'Confine', `Confine\n${formatPopulation(d.confine.people)} of them are moved into ${d.confine.target?.name ?? 'one state'}. Their other homes empty; the reservation's unrest +${d.confine.unrest} and their movement feeds on it. Infamy +${Math.round(d.confine.infamy)}.`, d.confine.blockers, 'danger')}
    </div>
    <small class="k-pol-gate">${d.deport.blockers.length ? esc(d.deport.blockers[0]) : 'Deportation and confinement are open: they rose, or their movement reached Agitation.'}</small>`;

  const body = `
    <div class="k-people-head"><i style="background:${d.color}"></i><b>${esc(d.name)}</b>
      <span>${pct(d.share)} · ${formatPopulation(d.people)} · ${kin}</span>
      <button class="k-btn sm" data-uc-showmap="${d.id}"${tipAttr({ text: `Show the ${d.name} on the culture map\nEvery province shaded by their share, ours and abroad.` })}>Show on map</button></div>
    <div class="k-people-homes">${homes}${more}</div>
    <h4 class="k-pol-step">1 · Rights</h4>${rights}
    ${melt ? `<h4 class="k-pol-step">2 · Assimilate</h4>${melt}` : ''}
    ${away ? `<h4 class="k-pol-step">3 · Remove</h4>${away}` : ''}`;
  return panel(d.name, body, { sub: d.primary ? 'our people' : d.accepted ? 'accepted people' : 'without full rights', cls: 'k-peoplecard' });
}

/** Boşalan topraklar ve iskân. */
function resettleCard(v) {
  const rows = v.emptied.slice(0, 5).map((row) => `<div class="k-settle-row"><button class="k-link" data-uc-focus="${row.id}">${esc(row.name)}</button>
    ${meter(row.from > 0 ? row.population / row.from : 0, { tone: 'warn' })}<small>${formatPopulation(row.population)} of ${formatPopulation(row.from)}</small></div>`).join('');
  const action = v.ongoing
    ? `<p class="k-settle-on">Settlers on the way: <b>${formatPopulation(v.ongoing.left)}</b> still to arrive · ${v.ongoing.weeks} weeks left</p>`
    : `<button class="k-btn wide" data-uc-resettle="1"${v.blockers.length ? blockedAttr(v.blockers) : tipAttr({ text: `Resettle\n${formatPopulation(v.plan.people)} of our own people move from our most crowded provinces into the empty ones over two years. ${v.plan.people < v.plan.need ? `The empty land could take ${formatPopulation(v.plan.need)}; our provinces can spare no more. ` : ''}Paid now from the development fund: ${money(v.plan.cost, 0)}.` })}>Bring settlers · ${formatPopulation(v.plan.people)} · ${money(v.plan.cost, 0)}</button>`;
  return panel('Empty land', `${rows}${v.emptied.length > 5 ? `<small class="k-more">and ${v.emptied.length - 5} more</small>` : ''}${action}`, { sub: 'provinces emptied by deportation or confinement' });
}

/** Bütün state odakları (province panelindeki listeyle aynı eylemler). */
function focusCard(world, me) {
  const states = focusedStates(world, me).sort((a, b) => (a.econ.focus ?? '').localeCompare(b.econ.focus ?? '') || a.name.localeCompare(b.name));
  const free = Math.max(0, focusSlots(me) - states.length);
  const rows = states.map((state) => {
    const focus = FOCUSES.find((f) => f.id === state.econ.focus);
    return `<div class="k-focus-row">${emblemArt(focus.art, 'xs')}<button class="k-link" data-uc-focus="${state.id}">${esc(state.name)}</button><b>${esc(focus.name)}</b>
      <button class="k-x" data-uc-unfocus="${state.id}" aria-label="Remove the focus from ${esc(state.name)}"${tipAttr({ text: `Remove the focus from ${state.name}` })}>✕</button></div>`;
  }).join('');
  const cabinet = me.focusAuto !== false && isDelegated(me, 'reforms');
  return panel('State focus', `${rows || empty('No state has a focus.')}
    <div class="k-focus-foot"><span>${free ? `${free} free slot${free === 1 ? '' : 's'}` : 'all slots in use'}</span>
      <button class="k-btn sm${cabinet ? ' on' : ''}" data-uc-focus-auto${isDelegated(me, 'reforms') ? '' : ' disabled'}${tipAttr({ text: 'The cabinet (AUTO) puts a focus in every empty slot each quarter.\nTurn it off to keep the slots you clear empty.' })}>Cabinet fills: ${cabinet ? 'on' : 'off'}</button>
      <button class="k-btn sm" data-uc-unfocus-all${states.length ? '' : ' disabled'}>Clear all</button></div>`,
  { sub: `${states.length} of ${focusSlots(me)} slots` });
}

// ============================================================== POLITICS ===

export function renderPolitics(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const view = governmentView(world, me, turn);
  const agenda = agendaView(world, me, turn);
  const decisions = decisionsView(me, turn);

  const kpis = kpiRow([
    kpi({ label: 'Political power', value: String(Math.round(view.power)), sub: `${signed(view.powerIncome.total, 2)} / week · cap 500`, tip: 'power', meter: view.power / 500, cls: 'hero' }),
    kpi({ label: 'Stability', value: pct(view.stability), sub: `heading to ${pct(view.stabilityTarget)}`, tip: 'stability', meter: view.stability, meterTone: view.stability < 0.35 ? 'neg' : 'pos' }),
    kpi({ label: 'War support', value: pct(view.warSupport), sub: `heading to ${pct(view.warSupportTarget)}`, tip: 'warsupport', meter: view.warSupport, meterTone: 'warn' }),
    // Rejim adı sayı değil metin: 24 px tek satır "Constitutional M…" diye
    // kesiliyordu; metin KPI'si küçük ve iki satırlık sabit yuvadadır.
    kpi({ label: 'Government', cls: 'is-text', value: esc(view.government.name), sub: view.nextElection ? `election in ${Math.max(0, view.nextElection - turn)} weeks` : 'no elections', tip: { text: `${view.government.name}\n${view.government.desc}` } }),
    kpi({
      label: 'Legitimacy', value: view.legitimacy.gap > 0 ? pts(-view.legitimacy.hit) : 'full',
      sub: view.legitimacy.gap > 0 ? `the people want the ${esc(PARTIES[view.legitimacy.leader].name)}` : 'the people back the cabinet',
      tip: { text: 'Legitimacy\nIf the people want another party than the one in government, stability pays for it every week.' },
    }),
  ]);

  const parts = (list) => ledger(list.map((part) => ({ label: esc(part.label), value: pts(part.value), tone: tone(part.value) })));

  // DEVLETİN ROTASI (TASARIM D4): dört partili kare; nokta rota, halka yön.
  const courseSquare = (c) => {
    if (!c) return '';
    const S = 132;
    const px = (v) => (((v + 1) / 2) * S).toFixed(1);
    const corners = Object.entries(c.corners).map(([id, [x, y]]) => `<circle cx="${px(x)}" cy="${px(y)}" r="7" fill="${PARTIES[id].color}"><title>${esc(PARTIES[id].name)}</title></circle>`).join('');
    const ring = c.heading ? `<circle cx="${px(c.heading.x)}" cy="${px(c.heading.y)}" r="7" fill="none" stroke="#f2e2b8" stroke-width="2" stroke-dasharray="3 2"/>` : '';
    const status = c.weeks != null
      ? `Drifting toward the ${esc(PARTIES[c.toward].name)} — ~${c.weeks} weeks, −${c.weeklyCost.toFixed(1)} PP a week`
      : c.heading ? 'Holding course: free' : `Leaning ${esc(PARTIES[c.leaning].name)} · click the square to set a course`;
    const funding = c.budgets.map((b, i) => `<button class="k-btn sm${Math.abs(c.budget - b) < 1e-6 ? ' on' : ''}" data-uc-course-budget="${b}">${['Off', 'Low 15%', 'High 30%'][i]}</button>`).join('');
    return `<div class="k-course"${tipAttr({ text: 'The course of the state\nWhere you steer the nation\'s politics. Support for the parties near it grows as long as you hold it there; moving costs a share of political power, holding costs nothing. Order raises war support; Reform calms your peoples. Click to set a heading, right-click to stop.' })}>
      <svg class="k-course-sq" data-uc-course viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Course of the state">
        <rect x="0.5" y="0.5" width="${S - 1}" height="${S - 1}" fill="rgba(0,0,0,0.25)" stroke="rgba(242,226,184,0.35)"/>
        <line x1="${S / 2}" y1="0" x2="${S / 2}" y2="${S}" stroke="rgba(242,226,184,0.12)"/><line x1="0" y1="${S / 2}" x2="${S}" y2="${S / 2}" stroke="rgba(242,226,184,0.12)"/>
        <text x="${S / 2}" y="11" text-anchor="middle" font-size="9" fill="rgba(242,226,184,0.6)">Order</text>
        <text x="${S / 2}" y="${S - 4}" text-anchor="middle" font-size="9" fill="rgba(242,226,184,0.6)">Reform</text>
        ${corners}${ring}
        <circle cx="${px(c.course.x)}" cy="${px(c.course.y)}" r="5" fill="#f2e2b8"/>
      </svg>
      <div class="k-course-side"><small>Elite ↔ Masses · Order ↔ Reform</small><p>${status}</p><div class="k-actions">${funding}</div></div>
    </div>`;
  };
  const parties = view.support.map((party) => {
    const appoint = !party.appointBlockers.includes('Decided by elections') && !party.ruling;
    const confirming = state.confirm === `gov:${party.id}`;
    return `<div class="k-party${party.ruling ? ' ruling' : ''}"${tipAttr('party', party.id)}>
      <i class="k-party-color" style="background:${party.color}"></i>
      <span class="k-party-name"><b>${esc(party.name)}</b>${party.ruling ? badge('in government', 'gold') : ''}<small>${describeEffects(party.effects).join(' · ')}</small></span>
      <span class="k-party-sup">${meter(party.support / 100, { tone: 'party' })}<b>${Math.round(party.support)}%</b></span>
      <span class="k-party-acts">
        ${appoint ? `<button class="k-btn sm${confirming ? ' confirming' : ''}" data-uc-appoint="${party.id}"${blockedAttr(party.appointBlockers)}>${confirming ? 'Confirm' : 'Appoint · 80'}</button>` : ''}
      </span>
    </div>`;
  }).join('');
  const regimes = view.regimes.map((regime) => `<button class="k-btn${state.confirm === `regime:${regime.id}` ? ' confirming' : ''}" data-uc-regime="${regime.id}"${blockedAttr(regime.blockers)}>
      ${esc(regime.name)} · ${regime.cost}${state.confirm === `regime:${regime.id}` ? ' — confirm' : ''}</button>`).join('');

  const laws = Object.keys(LAWS).map((id) => lawCard(world, me, id, state.confirm, { compact: true })).join('');

  const seats = view.advisors.map((seat) => {
    const others = seat.candidates.filter((c) => c.id !== seat.hired?.id);
    return `<div class="k-seat">
      <small class="k-seat-name">${esc(seat.name)}</small>
      ${seat.hired ? `<div class="k-seat-who"${tipAttr('advisor', `${seat.slot}:${seat.hired.id}`)}><b>${esc(seat.hired.title)}</b><span>${esc(seat.hired.name)}</span>
          <small>${describeEffects(seat.hired.effects).join(' · ')}</small>
          <button class="k-btn sm" data-uc-dismiss="${seat.slot}">Dismiss</button></div>` : '<div class="k-seat-who vacant"><span>Vacant seat</span></div>'}
      <div class="k-seat-cands">${others.map((candidate) => `<button class="k-cand" data-uc-hire="${candidate.id}"${candidate.blockers.length ? blockedAttr(candidate.blockers) : tipAttr('advisor', `${seat.slot}:${candidate.id}`)}>
          <b>${esc(candidate.title)}</b><small>${esc(candidate.name)} · 50</small></button>`).join('')}</div>
    </div>`;
  }).join('');

  const agendaBody = agenda.current
    ? `<div class="k-agenda now"${tipAttr('agenda', agenda.current.id)}><small>In progress</small><b>${esc(agenda.current.name)}</b><p>${esc(agenda.current.reward)}</p>
        <span>${meter(agenda.current.progress, { tone: 'pos', wide: true })}<em>${agenda.current.weeksLeft} weeks left</em></span></div>`
    : `<div class="k-agenda-opts">${agenda.options.map((option) => `<button class="k-agenda" data-uc-agenda="${option.id}"${tipAttr('agenda', option.id)}>
        <b>${esc(option.name)}</b><p>${esc(option.desc)}</p><em>${esc(option.reward)} · ${option.weeks} weeks</em></button>`).join('')
      || empty('New proposals arrive next week.')}</div>`;
  const recent = (me.agenda?.log ?? []).slice(0, 3).map((entry) => `<li>${esc(entry.text)}</li>`).join('');

  // Karar kutucuğu tek satır ad + bedel, etki ikinci satırda kısaltılmış;
  // tamamı bilgi kartında. Eski kutucuk üç satırdı ve ekranı taşırıyordu.
  const decisionTiles = decisions.map((decision) => `<button class="k-dec slim" data-uc-decision="${decision.id}"${decision.blockers.length ? blockedAttr(decision.blockers) : tipAttr('decision', decision.id)}>
      <b>${esc(decision.name)}</b><span class="k-cost">${decision.cost}</span><small>${esc(decision.desc)}</small></button>`).join('');

  // DÜZEN: tam genişlik, iki sütun. Eski düzen yedi paneli alt alta diziyordu
  // ve 1080p'de 500px taşıyordu; gövde `overflow: hidden` olduğu için
  // Danışmanlar ve Kararlar fareyle HİÇ görülemiyordu (ölçüldü).
  return `${kpis}
    <div class="k-split k-pol">
      <div class="k-stack">
        ${panel('Parties', `${courseSquare(view.course)}<div class="k-parties">${parties}</div>${regimes ? `<div class="k-actions">${regimes}</div>` : ''}`, { sub: esc(view.government.desc) })}
        ${panel('Laws', `<div class="k-laws">${laws}</div>`, { sub: `${view.lawCost} political power per change · 26-week lock · click twice to enact` })}
        ${panel('Decisions', `<div class="k-decs">${decisionTiles}</div>`, { sub: 'spend political power · hover for the full effect' })}
      </div>
      <div class="k-stack">
        <div class="k-cols-2 k-pol-why">
          ${panel('Stability', parts(view.stabilityParts), { right: `→ ${pct(view.stabilityTarget)}`, tip: 'stability' })}
          ${panel('War support', parts(view.warSupportParts), { right: `→ ${pct(view.warSupportTarget)}`, tip: 'warsupport' })}
        </div>
        ${view.exhaustion > 0.005 || view.exhaustionParts.length ? panel('War exhaustion', `${parts(view.exhaustionParts.map((part) => ({ ...part, value: -part.value })))}
          <p class="k-pol-ladder">${view.exhaustionLadder.map((step) => `<span class="${step.passed ? 'passed' : ''}">${Math.round(step.at * 100)}% ${esc(step.text)}</span>`).join(' · ')}</p>`, {
    right: `${pct(view.exhaustion)} → ${pct(view.exhaustionTarget)}`,
    sub: 'what the war costs: casualties, years, occupation, hunger, men under arms',
  }) : ''}
        ${panel('National agenda', agendaBody + (recent ? `<ul class="k-log">${recent}</ul>` : ''), {
    sub: 'one project at a time',
    // Gündemin AUTO anahtarı kendi panelinde: başlıktaki hap Government'ın.
    right: autoPill(DELEGATION_AREAS.agenda, { on: isDelegated(me, 'agenda'), last: lastDelegatedAction(me, 'agenda') }),
  })}
        ${panel('Advisors', `<div class="k-seats">${seats}</div>`, { sub: 'one per seat · 50 political power' })}
      </div>
    </div>`;
}

// ================================================================== BIND ===

/**
 * Ekran düğmelerini oyunun kapılarına bağlar. `screens` Screens örneğidir:
 * `refresh()`, `uc` durum nesnesi ve `me` buradan okunur.
 */
export function bindStateScreens(screens) {
  const { game } = screens;
  const me = screens.me;
  const root = screens.el.body;
  const state = screens.uc;
  if (!me) return;
  // Her düğme SG, fon ya da istikrar harcar; üst çubuk haftayı beklemeden
  // tazelensin diye eylemden sonra 'politics' yayınlanır (hud.js dinler).
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
      screens.refresh();
      return;
    }
    state.confirm = null;
    apply();
    screens.refresh();
  };
  on('[data-uc-law]', (el) => {
    const [lawId, index] = el.dataset.ucLaw.split(':');
    confirmThen(`law:${lawId}:${index}`, () => setLaw(game, me, lawId, Number(index)));
  });
  on('[data-uc-linepri]', (el) => {
    const [id, priority] = el.dataset.ucLinepri.split(':');
    setLinePriority(me, id, priority);
    state.lineCursor = id;
    screens.refresh();
  });
  on('[data-uc-lines-auto]', () => {
    for (const id of EQUIPMENT_IDS) setLinePriority(me, id, 'auto');
    screens.refresh();
  });
  // Kapalı hattan yoluna: Technology o teknolojiyi inceleyerek açılır.
  on('[data-uc-goto-tech]', (el) => {
    const techId = el.dataset.ucGotoTech;
    screens.tech.inspect = techId;
    screens.open('technology');
    root.querySelector(`.tech-node[data-tech="${CSS.escape(techId)}"]`)?.scrollIntoView({ block: 'center', inline: 'center' });
  });
  // Başka ekranın kolu (Factories → Economy'deki tutamaç).
  on('[data-uc-goto]', (el) => screens.open(el.dataset.ucGoto));
  on('[data-uc-embargo-lift]', (el) => {
    setEmbargo(me, Number(el.dataset.ucEmbargoLift), false);
    screens.refresh();
  });
  // EKONOMİ: tutamaç (bindFeed) ve onu bakanlığa geri veren Auto.
  const feedInput = root.querySelector('[data-uc-feed]');
  if (feedInput) bindFeed(screens, feedInput);
  on('[data-uc-feed-auto]', () => { setFeed(me, 'auto'); screens.refresh(); });
  // KALKINMA: Develop odağı aç/kapa; imleç tıklanan state'e geçer.
  on('[data-uc-develop]', (el) => {
    const id = Number(el.dataset.ucDevelop);
    toggleDevelop(game, me, game.world.provinces?.[id]);
    state.devCursor = id;
    screens.refresh();
  });
  on('[data-uc-focus]', (el) => {
    const province = game.world.provinces?.[Number(el.dataset.ucFocus)];
    if (!province?.center) return;
    // Kamera açık ekranın ARKASINDA oynuyordu: oyuncu hiçbir şey görmüyordu.
    // "Show on map" gibi önce ekran kapanır.
    screens.close();
    game.focusTile?.(province.center);
  });
  on('[data-uc-accept]', (el) => { acceptCulture(game, me, Number(el.dataset.ucAccept)); screens.refresh(); });
  on('[data-uc-revoke]', (el) => {
    const id = Number(el.dataset.ucRevoke);
    confirmThen(`revoke:${id}`, () => revokeCulture(game, me, id));
  });
  on('[data-uc-release]', (el) => {
    const id = Number(el.dataset.ucRelease);
    confirmThen(`release:${id}`, () => releasePeople(game, me, id));
  });
  on('[data-uc-expel]', (el) => {
    const id = Number(el.dataset.ucExpel);
    confirmThen(`expel:${id}`, () => deport(game, me, id));
  });
  on('[data-uc-form]', () => { formNation(game, me); screens.refresh(); });
  // KÜLTÜRLER: halk seçimi ve politika zinciri (culturePolicy.js).
  on('[data-uc-people]', (el) => { state.people = Number(el.dataset.ucPeople); screens.refresh(); });
  on('[data-uc-force]', (el) => {
    const [id, on] = el.dataset.ucForce.split(':').map(Number);
    if (on) confirmThen(`force:${id}`, () => forceAssimilation(game, me, id, true));
    else { forceAssimilation(game, me, id, false); screens.refresh(); }
  });
  on('[data-uc-confine]', (el) => {
    const id = Number(el.dataset.ucConfine);
    confirmThen(`confine:${id}`, () => concentrate(game, me, id));
  });
  on('[data-uc-resettle]', () => { resettle(game, me); screens.refresh(); });
  on('[data-uc-melt]', (el) => {
    const id = Number(el.dataset.ucMelt);
    const home = peopleDetail(game.world, me, id)?.homes.find((row) => !row.focus);
    const province = home ? game.world.provinces[home.id] : null;
    if (province && setFocus(game.world, me, province, 'assimilate')) screens.refresh();
    else game.turns.addLog('No free focus slot — clear one in the State focus list.', { kind: 'POLITICS', key: 'focus-full' });
  });
  on('[data-uc-unfocus]', (el) => {
    const province = game.world.provinces[Number(el.dataset.ucUnfocus)];
    if (province) setFocus(game.world, me, province, null);
    screens.refresh();
  });
  on('[data-uc-unfocus-all]', () => {
    for (const province of focusedStates(game.world, me)) setFocus(game.world, me, province, null);
    screens.refresh();
  });
  on('[data-uc-focus-auto]', () => { me.focusAuto = me.focusAuto === false; screens.refresh(); });
  on('[data-uc-showmap]', (el) => {
    const id = Number(el.dataset.ucShowmap);
    screens.close();
    game.renderer.cultureHighlight = id;
    const btn = document.querySelector('.mode-btn[data-mode="cultures"]');
    if (game.renderer.mapMode !== 'cultures' && btn) btn.click();
    else game.emit('mapmode', 'cultures');
    game.requestRender();
  });
  // Ulusal hareket eylemleri (movementDock ile aynı kapılar). Kalıcı olanlar
  // (vassal bırakma, katliam) iki tık ister.
  on('[data-uc-move]', (el) => {
    const [action, id] = el.dataset.ucMove.split(':');
    const cultureId = Number(id);
    const run = {
      concessions: () => grantConcessions(game, me, cultureId),
      martial: () => declareMartialLaw(game, me, cultureId),
      vassal: () => releaseAsVassal(game, me, cultureId),
      crackdown: () => crackdown(game, me, cultureId),
    }[action];
    if (!run) return;
    if (action === 'vassal' || action === 'crackdown') confirmThen(`move:${action}:${cultureId}`, run);
    else { run(); screens.refresh(); }
  });
  on('[data-uc-union]', (el) => { proposeUnion(game, me, Number(el.dataset.ucUnion)); screens.refresh(); });
  on('[data-uc-appoint]', (el) => {
    const id = el.dataset.ucAppoint;
    confirmThen(`gov:${id}`, () => appointGovernment(game, me, id));
  });
  // Rota karesi (TASARIM D4): tık yön çizer, sağ tık durdurur; finansman üç kademe.
  for (const el of root.querySelectorAll('[data-uc-course]')) {
    el.onclick = (event) => {
      const box = el.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width) * 2 - 1;
      const y = ((event.clientY - box.top) / box.height) * 2 - 1;
      const budget = me.politics.courseBudget > 0 ? me.politics.courseBudget : 0.15;
      setCourse(me, { x, y }, budget);
      game.emit('politics', me.id);
      screens.refresh();
    };
    el.oncontextmenu = (event) => {
      event.preventDefault();
      setCourse(me, null, me.politics.courseBudget ?? 0);
      game.emit('politics', me.id);
      screens.refresh();
    };
  }
  on('[data-uc-course-budget]', (el) => { setCourse(me, me.politics.heading, Number(el.dataset.ucCourseBudget)); screens.refresh(); });
  on('[data-uc-regime]', (el) => {
    const id = el.dataset.ucRegime;
    confirmThen(`regime:${id}`, () => enactRegime(game, me, id));
  });
  on('[data-uc-hire]', (el) => { hireAdvisor(game, me, el.dataset.ucHire); screens.refresh(); });
  on('[data-uc-dismiss]', (el) => { dismissAdvisor(game, me, el.dataset.ucDismiss); screens.refresh(); });
  on('[data-uc-agenda]', (el) => { chooseAgenda(game, me, el.dataset.ucAgenda); screens.refresh(); });
  on('[data-uc-decision]', (el) => { takeDecision(game, me, el.dataset.ucDecision); screens.refresh(); });

  // Üretim hattı önizlemesi. Dinleyici kalıcı gövdededir: haftalık tazeleme
  // düğmeleri yeniden kurar, imleç yerinde durdukça önizleme
  // `state.linePreview` ile geri yazılır; başka bir öğeye geçince silinir.
  if (root.querySelector('[data-pl-bar]')) {
    root.onpointerover = (event) => {
      const key = event.target.closest?.('[data-uc-linepri]')?.dataset.ucLinepri ?? null;
      if (key === state.linePreview) return;
      state.linePreview = key;
      paintLineSplit(root, me, previewWeights(key));
    };
    root.onpointerleave = () => {
      if (!state.linePreview) return;
      state.linePreview = null;
      paintLineSplit(root, me, null);
    };
    if (state.linePreview) paintLineSplit(root, me, previewWeights(state.linePreview));
  } else {
    root.onpointerover = null;
    root.onpointerleave = null;
    state.linePreview = null;
  }
}

/** Dosya kartından ambargo (SG bedeli diplomasi katmanında; burada kapı). */
export const EMBARGO_POWER = 25;
export function embargoBlockers(world, me, other) {
  const out = [];
  if (!other?.alive || other.id === me.id) return ['Not a valid target'];
  if (embargoed(world, me.id, other.id) && (me.embargoes ?? []).includes(other.id)) return ['Already under embargo'];
  if ((me.power ?? 0) < EMBARGO_POWER) out.push(`Needs ${EMBARGO_POWER} political power`);
  return out;
}
export function declareEmbargo(game, me, otherId) {
  const other = game.world.nations[otherId];
  if (embargoBlockers(game.world, me, other).length) return false;
  me.power -= EMBARGO_POWER;
  setEmbargo(me, otherId, true);
  game.turns?.addLog?.(`Embargo declared on ${other.name}.`, { kind: 'POLITICS' });
  return true;
}
