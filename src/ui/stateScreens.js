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
  CROWN_OUTPUT, DEVELOPMENT_CAP_BASE, DEVELOPMENT_CAP_LITERACY, DEVELOPMENT_MAX, EQUIPMENT, EQUIPMENT_IDS, FEED,
  FUND_RESERVE_WEEKS, HAND_OUTPUT, INDUSTRY_PER_DEV, INVEST, LINE_EFFICIENCY,
  RESOURCES, RESOURCE_IDS, SUPPLY,
} from '../game/econ/defs.js';
import { LAWS, lawIndex } from '../game/laws.js';
import {
  acceptedShareOf, economyView, formatPopulation, literacyTarget, populationOf, splitOutput,
} from '../game/economy.js';
import {
  LINE_PRIORITIES, consumerNeed, consumerStability, feedTarget, lineAllocation, lineEfficiencyCap, lineEfficiencyGain,
  linePriorityOf, setFeed, setLinePriority,
} from '../game/econ/industry.js';
import { setEmbargo } from '../game/econ/trade.js';
import { billCap, billsOf } from '../game/econ/bills.js';
import { developmentCap, investEfficiency, investmentTarget, levelCost, levelGain } from '../game/econ/investment.js';
import { outputFactors, provinceOutputOf } from '../game/econ/output.js';
import { LEDGER_LINES } from '../game/treasury.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import {
  FAMINE_THRESHOLD, GROWTH_PER_DEVELOPMENT, WAR_GROWTH, provinceName,
} from '../game/provinces.js';
import { depositsOf } from '../game/econ/deposits.js';
import {
  PARTIES, appointGovernment, courseView, dismissAdvisor, enactRegime, governmentView,
  hireAdvisor, setCourse, setLaw,
} from '../game/politics.js';
import { agendaView, chooseAgenda } from '../game/agenda.js';
import { decisionsView, takeDecision } from '../game/decisions.js';
import { acceptCulture, revokeCulture } from '../game/culture.js';
import { blockadeCause, blockadeTip } from './navyText.js';
import { releasePeople } from '../game/nationBirth.js';
import { concentrate, deport, forceAssimilation, forcedAssimilation, resettle } from '../game/culturePolicy.js';
import { FOCUSES, FOCUS_BY_ID, focusSlots } from '../game/focus.js';
import { focusBlockers, focusPreview, focusedStates, setFocus } from '../game/stateFocus.js';
import { DELEGATION_AREAS, isDelegated, lastDelegatedAction } from '../game/delegation.js';
import { FORMATION_POWER, FORMATION_SHARE, formNation, formationBlockers, proposeUnion } from '../game/unification.js';
import { GOALS, goalMet } from '../game/hegemony.js';
import { nationManpower } from '../game/recruitment.js';
import { describeEffects, mod } from '../game/modifiers.js';
import {
  autoPill, badge, blockedAttr, chain, empty, esc, kpi, kpiRow, ledger, meter, money, nextSort, num, panel, pct, pips, pts,
  segmented, short, signed, signedMoney, sortHead, sortLabel, sortRows, spark, tipAttr, tone,
} from './kit.js';
import { glyph } from './icons/glyphs.js';
import {
  buildingArt, diplomacyArt, emblemArt, equipmentArt, eventArt, gaugeArt, kitArt, lawArt, ledgerArt, movementArt,
  resourceArt,
} from './icons/art.js';
import { peopleDetail, peoplesView, resettlementView } from '../game/peoplesView.js';
import { END_YEAR } from '../game/calendar.js';
import { techById, unlockTechOf } from '../game/technology.js';
import {
  MOVEMENT, crackdown, declareMartialLaw, grantConcessions, releaseAsVassal,
} from '../game/movements.js';

const turnOf = (game) => game.turns?.turn ?? game.world?.turn ?? 0;

/**
 * Uzun süre yıl olarak: "~1927 wk" 1900-1945 kampanyasında bir YIL gibi
 * okunuyordu (Cultures hareket kartı). İki yılın altında hafta kalır.
 */
const span = (weeks) => (weeks < 104 ? `${weeks} wk` : `${Math.round(weeks / 52)} years`);

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
    <span class="k-law-art"${tipAttr('law', lawId)}>${lawArt(lawId, compact ? 'md' : 'lg')}</span>
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
const FEED_TIP = `Feed the people\nDrag right: more consumer goods — stability and growth, best near ×1.2. Drag left: more for development. The new share applies from next week.\n← → step ×${num(FEED.step, 2)} · Auto hands it back to the ministry.`;
// Kartlar sayıyı kuralın kendisinden okur (ai.autoFeed FEED'i okur): sabit
// değişince metin eskimesin. Eski metin "kişiliğe göre" diyordu; kural ulusal odaktır.
const PEACE_FEEDS = [FEED.peace, ...Object.values(FEED.byFocus)];
const AUTO_FEED_TIP = `Auto\nThe ministry sets the handle by national focus: ${num(Math.min(...PEACE_FEEDS), 2)}-${num(Math.max(...PEACE_FEEDS), 2)} in peace, ${num(FEED.war, 2)} at war, +${num(FEED.unrest, 2)} while stability is below ${pct(FEED.unrestBelow)} (at most ${num(FEED.unrestCap, 2)}).`;
const FOCUS_OFF = pct(1 - INVEST.focusDiscount);

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
function barBase(world, me, turn = world.turn ?? 0) {
  const economy = me.economy;
  const alloc = economy?.alloc;
  const target = nextLevelOf(world, me);
  if (!alloc || !(alloc.output > 0)) return projectedBase(world, me, turn, target);
  const bills = economy.bills ?? EMPTY_BILLS;
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
    projected: false,
  };
}

/**
 * İLK HAFTA: pay ancak haftalık kapanışta kurulur (economy.alloc) ve oyun
 * başında çubuk boş bir kutuydu ("The first weekly report comes after week
 * 1" — Kerem: "bu kısım zayıf"). Kapanışın KENDİ fonksiyonlarıyla tahmin:
 * faturalar billsOf, ordu tavanı yasanın payı, halkın ihtiyacı consumerNeed,
 * bölüşüm splitOutput (runNationEconomy 4-6. adımlarla aynı girdiler). Hatlar
 * henüz çekmedi: ordu payı 0. Saf okuma: dünyaya yazmaz, determinizm aynı.
 */
function projectedBase(world, me, turn, target) {
  const economy = me.economy;
  const ic = economy?.ic;
  if (!(ic?.output > 0)) return null;
  const bills = billsOf(world, me, ic.output, turn);
  const armyCap = Math.min(ic.military ?? 0, Math.max(0, ic.output - bills.paid));
  const { need } = consumerNeed(me, economy.population ?? populationOf(world, me), turn);
  const investable = Boolean(target)
    || (me.fund ?? 0) < FUND_RESERVE_WEEKS * Math.max(0, economy.outputAvg ?? 0);
  return {
    output: ic.output,
    bills: bills.paid,
    owed: bills.owed,
    room: bills.room,
    s: bills.s,
    armyCap,
    drawn: 0,
    need,
    investable,
    efficiency: investEfficiency(me),
    fund: me.fund ?? 0,
    target,
    week: feedTarget(me),
    committed: feedTarget(me),
    projected: true,
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
  const when = split.eta == null ? 'not saving' : split.eta === 0 ? 'this week' : `in ${span(split.eta)}`;
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
  // Ad ve değer ayrı: dar dilimde önce ad düşer, değer kalır (styles.css §67).
  const seg = (id, label, value, tip, extra = '') => `<i class="ec-seg ${id}" data-ec-seg="${id}" style="width:${segWidth(value, Y)}"${tipAttr({ text: tip })}><span><em>${label}</em><b data-ec-v="${id}">${num(value, 1)}</b></span>${extra}</i>`;
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
  const base = barBase(game.world, me, turnOf(game));
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
  const output = ic.output ?? 0;
  // İlk hafta kapanmadan pay yoktur. Faturalar yine bellidir: hafta
  // kapanışının kullandığı billsOf bugünkü orduyla aynı sayıyı verir; halkın
  // payı ise ancak kapanışta ölçülür ("%100" yer tutucudur).
  const settled = Boolean(view.alloc);
  const bills = view.bills ?? (output > 0 ? billsOf(world, me, output, turnOf(game)) : EMPTY_BILLS);
  const consumer = view.consumer ?? { need: 0, ratio: 1 };
  const cap = billCap(me);
  const crisis = bills.s < 1 - 1e-6;
  const base = barBase(world, me, turnOf(game));
  const split = base ? barSplit(base, base.committed) : null;
  const projected = Boolean(base?.projected);
  const next = base?.target ?? nextLevelOf(world, me);
  const auto = (view.feed?.mode ?? 'auto') === 'auto';
  const billShare = bills.room > 0 ? bills.owed / bills.room : 0;

  const kpis = kpiRow([
    kpi({
      icon: gaugeArt('output', 'md'), label: 'Output', value: num(output, 1), cls: 'hero',
      sub: `IC a week · hand ${num(ic.hand ?? 0, 0)} · industry ${num(ic.total ?? 0, 0)} · crown ${num(ic.crown ?? 0, 0)}`,
      tip: { text: 'Output\nEvery state produces each week: handwork from every 100k workers, industry from every development level above 1 (it needs coal and grows with research). The capital adds a flat 4. The Factories screen shows every factor.' },
    }),
    kpi({
      icon: ledgerArt('bills', 'md'), label: 'Bills', value: `${num(bills.owed, 1)} / ${num(bills.room, 0)}`, cls: crisis ? 'crisis' : '',
      sub: crisis ? `<span class="neg">supply crisis · ${pct(bills.s)} paid</span>` : `${pct(output > 0 ? bills.owed / output : 0)} of output · ceiling ${pct(cap)}`,
      tip: { text: `Bills\nArmy and navy supply, schools and martial law come off the top of output, at most ${pct(cap)} of it (${num(bills.room, 1)} IC). Above that the nation is in a SUPPLY CRISIS: every bill is paid in part, reinforcement, training and order recover slower and stability falls.` },
      meter: billShare, meterTone: crisis ? 'neg' : billShare > 0.8 ? 'warn' : 'pos',
    }),
    kpi({
      icon: ledgerArt('development', 'md'), label: 'Development fund', value: short(view.fund),
      sub: next ? `next level ${money(next.cost, 0)} · floor ${money(view.fundFloor, 0)}` : `floor ${money(view.fundFloor, 0)}`,
      tip: { text: 'Development fund\nWhat is left after bills, the army and the people flows here and buys development levels state by state. Generals, settlers, event choices and imports are paid from it too; it may dip to the floor (four weeks of output below zero).' },
      meter: next && next.cost > 0 ? view.fund / next.cost : 0, meterTone: view.fund < 0 ? 'warn' : 'pos',
    }),
    kpi({
      icon: ledgerArt('people', 'md'), label: 'Consumer goods',
      value: settled ? pct(consumer.ratio) : split ? pct(split.ratio) : '—',
      sub: settled ? `${pts(consumerStability(consumer.ratio))} stability · fed ×${num(consumer.feed ?? feedTarget(me), 2)}`
        : split ? `projected · fed ×${num(split.feed, 2)}` : `fed ×${num(feedTarget(me), 2)}`,
      tip: { text: 'Consumer goods\nThe people\'s share of output against what they want (it grows every decade). Short shelves cost stability and growth; full ones, up to ×1.2, add a little of both. The handle on the bar sets it.' },
      meter: settled ? Math.min(1, consumer.ratio) : split ? Math.min(1, split.ratio) : 0,
      meterTone: (settled ? consumer.ratio : split?.ratio ?? 1) < 0.95 ? 'neg' : 'pos',
    }),
  ]);

  const feedNow = feedTarget(me);
  const pending = base && Math.abs(feedNow - base.week) > 1e-6;
  const heroRight = `${projected ? badge('projected · week 1', 'dim') : ''}${auto ? badge('auto', 'pos') : badge('manual', 'dim')}
    <button class="k-btn sm" data-uc-feed-auto${auto ? ` disabled${tipAttr({ text: 'The ministry already sets the handle. Drag it to take it over.' })}` : tipAttr({ text: AUTO_FEED_TIP })}>Auto</button>`;
  const hero = panel('This week\'s output', base ? barHtml(base, split) + barCaption(base, split) : empty('No output yet.'), {
    sub: pending && !projected ? `×${num(feedNow, 2)} from next week` : '',
    right: heroRight,
    cls: `ec-hero${projected ? ' is-projected' : ''}`,
  });

  // --- Faturalar ------------------------------------------------------------
  const perRegiment = bills.land > 0 ? bills.army / bills.land : 0;
  const school = LAWS.education.options[lawIndex(me, 'education')];
  const billRow = (icon, label, sub, owed, tip) => {
    const idle = owed < 0.005;
    const ofRoom = bills.room > 0 ? Math.min(1, owed / bills.room) : 0;
    return `<div class="ec-brow${idle ? ' idle' : ''}"${tipAttr({ text: tip })}>
      <span class="k-row-ico">${icon}</span>
      <span class="ec-bname">${label}${sub ? `<small>${sub}</small>` : ''}</span>
      <span class="ec-bbar"><i style="width:${(ofRoom * 100).toFixed(1)}%"></i></span>
      <span class="r">${idle ? '—' : num(owed, 2)}</span>
      <span class="r">${idle ? '' : pct(output > 0 ? owed / output : 0)}</span>
      <span class="r">${idle ? '' : num(owed * bills.s, 2)}</span>
    </div>`;
  };
  const billRows = [
    billRow(kitArt('supply'), 'Army supply', `${bills.land} regiment${bills.land === 1 ? '' : 's'} × ${num(perRegiment, 2)}${bills.atWar ? ` · war ×${SUPPLY.war}` : ''}`, bills.army,
      `Army supply\nEvery regiment costs ${num(SUPPLY.land, 1)} IC a week in 1900, growing with the era; ×${SUPPLY.war} at war. A big peacetime army slows growth.`),
    billRow(ledgerArt('navy'), 'Navy supply', `${num(bills.sea, bills.sea % 1 ? 1 : 0)} ship${bills.sea === 1 ? '' : 's'}`, bills.navy,
      `Navy supply\nEvery warship costs ${num(SUPPLY.sea, 1)} IC a week in 1900 (submarines half), growing with the era; ×${SUPPLY.war} at war.`),
    billRow(ledgerArt('schools'), 'Schools', esc(school.name), bills.schools,
      'Schools\nThe education law\'s bill per 100k people. In a supply crisis the schools work only as far as they are paid.'),
    billRow(ledgerArt('martial'), 'Martial law', 'against national movements', bills.martial,
      'Martial law\nHolding down a national movement costs a weekly bill while it lasts.'),
  ].join('');
  const billsTable = `<div class="ec-bills">
      <div class="ec-brow head"><span></span><span>Bill</span><span${tipAttr({ text: 'Share of the ceiling\nHow much of the bill ceiling each bill takes.' })}>Of the ceiling</span><span class="r">Owed / wk</span><span class="r">Of output</span><span class="r">Paid</span></div>
      ${billRows}
      <div class="ec-brow total"><span></span><span class="ec-bname">Total</span><span class="ec-bbar total${crisis ? ' neg' : ''}"><i style="width:${(Math.min(1, billShare) * 100).toFixed(1)}%"></i></span><span class="r">${num(bills.owed, 2)}</span><span class="r">${pct(output > 0 ? bills.owed / output : 0)}</span><span class="r ${crisis ? 'neg' : ''}">${num(bills.paid ?? bills.owed, 2)}</span></div>
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
  const warTip = `In a war\nSupply costs ×${SUPPLY.war}. The same army and fleet would cost ${num(warArmy, 1)} IC a week and bills would take ${pct(warShare)} of output. Above ${pct(cap)} the nation is in a supply crisis.`;
  const warLine = `<div class="ec-warline"${tipAttr({ text: warTip })}>
      <small>${bills.atWar ? 'At war' : 'In a war'}</small>
      <span>supply ×${SUPPLY.war}</span>
      <span><b>${num(warArmy, 1)}</b> IC / wk</span>
      <span>bills <b class="${warTone}">${pct(warShare)}</b> of output</span>
      <span>crisis above <b>${pct(cap)}</b></span>
    </div>`;

  // --- Fon --------------------------------------------------------------------
  // Fon bir sayı listesi değil bir HAZNE: tabanından (borç sınırı) sonraki
  // kademenin bedeline uzanan ölçekte şimdi nerede, bu hafta ne kadar
  // dolacak, sıradaki kademe ne zaman. Eski panel yedi satırlık bir defter +
  // boş grafikti; ilk haftada yedi satırın hepsi "—" idi (Kerem: "bu kısım
  // zayıf"). Defter satırları sabit kalır (haftadan haftaya sıfıra düşen
  // satır kaybolsaydı panel oynardı), iki sütunda: giren / çıkan.
  const rows = view.ledger ?? {};
  const fundNow = view.fund ?? 0;
  const floor = Math.min(0, view.fundFloor ?? 0);
  const weekly = split ? split.invested : 0;
  const after = fundNow + weekly;
  const goal = Math.max(next?.cost ?? 0, after, fundNow, 1);
  const range = goal - floor || 1;
  const at = (x) => (((Math.max(floor, Math.min(goal, x)) - floor) / range) * 100).toFixed(2);
  const eta = split?.eta;
  const when = !next ? 'every state at the cap'
    : eta == null ? 'not saving' : eta === 0 ? 'this week' : `in ${span(eta)}`;
  const trackTip = `Development fund\nWhat is left after bills, the army and the people flows here and buys development levels state by state. It may dip to the floor, ${money(view.fundFloor, 0)} (four weeks of output below zero).`;
  const fillFrom = fundNow < 0 ? at(fundNow) : at(0);
  const fillTo = fundNow < 0 ? at(0) : at(fundNow);
  const track = `<div class="ec-ftrack"${tipAttr({ text: trackTip })}>
      <div class="ec-ftrack-bar">
        <i class="ec-ft-debt" style="left:0;width:${at(0)}%"></i>
        <i class="ec-ft-fill${fundNow < 0 ? ' neg' : ''}" style="left:${fillFrom}%;width:${(fillTo - fillFrom).toFixed(2)}%"></i>
        ${weekly > 0.05 ? `<i class="ec-ft-gain" style="left:${at(fundNow)}%;width:${(at(after) - at(fundNow)).toFixed(2)}%"></i>` : ''}
        <b class="ec-ft-zero" style="left:${at(0)}%"></b>
        ${next ? `<b class="ec-ft-goal" style="left:${at(next.cost)}%"></b>` : ''}
      </div>
      <div class="ec-ftrack-scale">
        <span class="floor">floor ${money(view.fundFloor, 0)}</span>
        <span class="zero" style="left:${at(0)}%">0</span>
        ${next ? `<span class="goal">${money(next.cost, 0)}</span>` : ''}
      </div>
    </div>`;
  // İlk hafta kapanmadan defter boştur: akışlar tahminle (yalnız bu haftanın
  // yatırımı) dolar, panel ilk haftadan sonra yer değiştirmez.
  const flowSource = view.settled ? rows : split ? { investment: split.invested } : null;
  const flowMax = Math.max(1e-6, ...FUND_LINES.map((id) => Math.abs(flowSource?.[id] ?? 0)));
  const flowRow = (id) => {
    const value = flowSource?.[id] ?? 0;
    const idle = Math.abs(value) <= 0.05;
    return `<div class="ec-flow${idle ? ' idle' : ''}"${tipAttr('ledger', id)}>
        <span class="ec-flow-ico">${fundArt(id)}</span>
        <span class="ec-flow-name">${esc(LEDGER_LINES[id]?.label ?? id)}</span>
        <span class="ec-flow-bar ${value < 0 ? 'out' : 'in'}"><i style="width:${((Math.abs(value) / flowMax) * 100).toFixed(1)}%"></i></span>
        <b class="${idle ? '' : tone(value)}">${idle ? '—' : signed(value)}</b>
      </div>`;
  };
  const net = view.settled
    ? rows.net ?? FUND_LINES.reduce((sum, id) => sum + (rows[id] ?? 0), 0)
    : FUND_LINES.reduce((sum, id) => sum + (flowSource?.[id] ?? 0), 0);
  const when_ = view.settled ? 'last week' : 'this week, projected';
  const ins = FUND_LINES.filter((id) => LEDGER_LINES[id]?.kind === 'income');
  const outs = FUND_LINES.filter((id) => LEDGER_LINES[id]?.kind !== 'income');
  const flows = flowSource
    ? `<div class="ec-flows">
        <div class="ec-flow-col"><small>In · ${when_}</small>${ins.map(flowRow).join('')}</div>
        <div class="ec-flow-col"><small>Out · ${when_}</small>${outs.map(flowRow).join('')}
          <div class="ec-flow net"><span class="ec-flow-ico"></span><span class="ec-flow-name">Net</span><span></span><b class="${tone(net)}">${signed(net)}</b></div>
        </div>
      </div>`
    : '';
  const history = me.economy?.fundHistory ?? [];
  const chart = history.length >= 2
    ? `<div class="k-chart ec-fundchart">${spark(history, { width: 420, height: 60 })}</div>
      <div class="k-chart-legend"><span>${history.length} weeks</span><span>floor <b>${money(view.fundFloor, 0)}</b></span><span>now <b>${money(fundNow, 0)}</b></span></div>`
    : '';
  const fundBody = `<div class="ec-fund">
      <div class="ec-fund-top">
        <div class="ec-fund-now"><small>In the fund</small><b class="${fundNow < 0 ? 'neg' : ''}">${money(fundNow, 0)}</b>
          <em>${weekly > 0.05 ? `${projected ? '≈ ' : ''}+${num(weekly, 1)} this week` : 'nothing flows in this week'}</em></div>
        <div class="ec-fund-next"><small>Next level</small>
          ${next ? `<b>${esc(next.name)} <span>→ ${next.level}</span></b><em>${money(next.cost, 0)} · ${when}</em>` : `<b>${when}</b>`}</div>
      </div>
      ${track}
      ${flows}
      ${chart}
    </div>`;

  const educTip = 'Schools\nThe education law\'s weekly bill. Literacy raises the development cap and opens focus slots.';
  const educ = `<div class="ec-warline"${tipAttr({ text: educTip })}>
      <small>Schools</small>
      <span><b>${money(view.education, 1)}</b> / wk</span>
      <span>literacy <b>${pct(view.literacy)}</b> → <b>${pct(view.literacyTarget)}</b></span>
    </div>`;

  return `${kpis}
    ${crisis ? `<div class="k-alert neg"><b>Supply crisis</b> — the bills owe ${money(bills.owed, 1)} a week but only ${money(bills.room, 1)} fit under the ceiling: every bill is paid ${pct(bills.s)}. Reinforcement, training and order recover slower and stability falls until they fit. Shrink the army, lower the education law or take Requisition the Economy.</div>` : ''}
    ${hero}
    <div class="k-cols-2">
      ${panel('Bills', `${billsTable}${warLine}`)}
      ${panel('Development fund', fundBody)}
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
  // Kaynak defteri ve ticaret ilk hafta kapanınca yazılır: öncesinde her satır
  // "0.0 · not needed" ve "+0.0 IC last week" diyordu.
  const settled = view.settled;
  const shortages = RESOURCE_IDS.filter((id) => (resources[id]?.need ?? 0) > 0.01 && (resources[id]?.ratio ?? 1) < 0.98);
  const embargoes = (me.embargoes ?? []).map((id) => world.nations[id]).filter(Boolean);
  const flow = (value) => (settled ? signedMoney(value) : '—');

  // Ticaret fonun kalemidir: ihracat fona IC yazar, ithalat ondan öder.
  const kpis = kpiRow([
    kpi({ icon: ledgerArt('exports', 'md'), label: 'Exports', value: flow(ledgerRows.exports ?? 0), sub: settled ? 'last week' : '', tip: 'ledger', arg: 'exports', cls: 'hero' }),
    kpi({ label: 'Imports', value: flow(ledgerRows.imports ?? 0), sub: settled ? 'last week' : '', tip: 'ledger', arg: 'imports' }),
    kpi({ label: 'Trade balance', value: flow((ledgerRows.exports ?? 0) + (ledgerRows.imports ?? 0)), sub: '', tip: { text: 'Trade balance\nWhat exports paid into the development fund minus what imports took out of it last week.' } }),
    kpi({
      label: 'Shortages', value: settled ? String(shortages.length) : '—',
      sub: !settled ? '' : shortages.length ? shortages.map((id) => RESOURCES[id].name).join(', ') : 'none',
      tip: { text: 'Shortages\nResources the country needs but could not fully make or buy last week.' },
    }),
    kpi({
      // NAVY-06: eski metin kalkmış hex modelini anlatıyordu; kural navyText'te.
      label: 'Blockade', value: pct(view.blockade), sub: view.blockade > 0 ? 'of our sea trade is cut' : 'sea lanes open',
      tip: { text: blockadeTip(world, view.blockade, blockadeCause(world, me.id)) },
      meter: view.blockade, meterTone: 'neg',
    }),
  ]);

  // DÜNYA PAZARI tablonun sütunlarıdır (Kerem: sekiz büyük kutu "yer
  // israfı"; fiyat zaten tablodaydı). Fiyat, tabana göre fark ve yıllık iz
  // satırın kendisinde; fiyatın formülü sütun başlığının bilgi kartında.
  const resRows = RESOURCE_IDS.map((id) => {
    const info = RESOURCES[id];
    const r = resources[id] ?? {};
    const needed = (r.need ?? 0) > 0.01;
    return {
      id, info, r, needed,
      name: info.name,
      ratio: needed ? r.ratio : 1,
      price: market.prices?.[id] ?? info.price,
      history: market.history?.[id] ?? [],
      // Ana tedarikçi "Bought" sütunuyla aynı eşikten: hiç alım yokken %0'lık
      // bir tedarikçi adı yazıp sütunla çelişiyordu.
      partner: r.topPartner >= 0 && (r.imported ?? 0) > 0.05 ? world.nations[r.topPartner] : null,
    };
  });
  const sort = state.sort?.trade ?? null;
  const rows = sortRows(resRows, sort, RES_COLS).map((row) => {
    const { id, info, r, needed, ratio, price, history, partner } = row;
    const vsBase = info.price > 0 ? Math.round((price / info.price - 1) * 100) : 0;
    const trend = history.length > 1
      ? spark(history, { width: 64, height: 20, cls: 'mini', zero: false })
      : '<small class="k-dim">—</small>';
    return `<div class="k-res-row${needed && ratio < 0.8 ? ' short' : ''}"${tipAttr('resource', id)}>
      <span class="k-res-name">${resourceArt(id, 'sm')}<b>${esc(info.name)}</b></span>
      <span class="k-num">${settled ? num(r.produced ?? 0) : '—'}</span>
      <span class="k-num">${needed ? num(r.need) : '—'}</span>
      <span class="k-cover">${needed ? `${meter(ratio, { tone: ratio < 0.8 ? 'neg' : ratio < 0.98 ? 'warn' : 'pos' })}<b>${pct(ratio)}</b>` : `${meter(0, { tone: 'dim' })}<b class="k-dim">${settled ? 'none' : '—'}</b>`}</span>
      <span class="k-num neg">${r.imported > 0.05 ? num(r.imported) : '—'}</span>
      <span class="k-num pos">${r.exported > 0.05 ? num(r.exported) : '—'}</span>
      <span class="k-price"${tipAttr({ text: `${info.name}: ${num(price, 2)} IC\nBase price ${num(info.price, 2)} IC: ${vsBase > 0 ? '+' : vsBase < 0 ? '−' : ''}${Math.abs(vsBase)}% against it.` })}><b>${num(price, 2)}</b><small class="${vsBase > 0 ? 'up' : vsBase < 0 ? 'down' : ''}">${vsBase > 0 ? '+' : vsBase < 0 ? '−' : ''}${Math.abs(vsBase)}%</small></span>
      <span class="k-res-trend">${trend}</span>
      <span class="k-partner">${partner ? `${esc(partner.name)} <small>${pct(r.topShare)}</small>` : '<small class="k-dim">—</small>'}</span>
    </div>`;
  }).join('');
  const col = (key) => sortHead('trade', key, RES_COLS, sort);
  const table = `<div class="k-res-table">
      <div class="k-res-row head">${['name', 'made', 'need', 'cover', 'bought', 'sold', 'price'].map(col).join('')}<span${tipAttr({ text: 'Trend\nThe world price over the last 52 weeks.' })}>Trend</span>${col('supplier')}</div>
      ${rows}
    </div>`;

  const embargoBody = embargoes.length
    ? ledger(embargoes.map((other) => ({
      label: esc(other.name),
      value: `<button class="k-btn sm" data-uc-embargo-lift="${other.id}">Lift</button>`,
    })))
    : empty('No embargoes');

  return `${kpis}
    <div class="k-split wide-left">
      ${panel('Resources', table, { sub: `per week${sortLabel(sort, RES_COLS) ? ` · ${sortLabel(sort, RES_COLS)}` : ''}` })}
      <div class="k-stack">
        ${panel('Trade law', lawCard(world, me, 'trade', state.confirm, { compact: true }), {
          tip: { text: 'Trade law\nExports sell only the surplus, up to the law\'s share of output, and pay into the development fund. Imports fill every shortage automatically while the fund is above its floor.' },
        })}
        ${panel('Embargoes', embargoBody)}
      </div>
    </div>`;
}

/**
 * Kaynak tablosunun sıralanabilir sütunları (kit.sortHead). Satır nesnesi
 * renderTrade'de kurulur; fiyatın formülü başlığın bilgi kartındadır.
 */
const RES_COLS = {
  name: { label: 'Resource', text: true, value: (row) => row.name },
  made: { label: 'Made', cls: 'r', value: (row) => row.r.produced ?? 0 },
  need: { label: 'Needed', cls: 'r', value: (row) => (row.needed ? row.r.need : null) },
  cover: { label: 'Covered', value: (row) => (row.needed ? row.ratio : null) },
  bought: { label: 'Bought', cls: 'r', value: (row) => (row.r.imported > 0.05 ? row.r.imported : 0) },
  sold: { label: 'Sold', cls: 'r', value: (row) => (row.r.exported > 0.05 ? row.r.exported : 0) },
  price: {
    label: 'World price', cls: 'r', value: (row) => row.price,
    tip: 'World price\nIC per unit, set every week by the whole world: base price × (world need ÷ world output)^1.5, held between 0.6× and 2× the base. The small figure is the change against the base price.',
  },
  supplier: {
    label: 'Supplier', text: true, value: (row) => row.partner?.name ?? null,
    tip: 'Main supplier\nThe country we bought the most from last week, and its share of what we bought.',
  },
};

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
  // İlk hafta kapanmadan ordunun çektiği ve halkın payı yoktur (alloc null);
  // economy.consumer o zamana dek "%100" yer tutucusudur. O hafta kartlar
  // Economy ekranının tahminini okur (projectedBase: kapanışın fonksiyonları).
  const settled = Boolean(view.alloc);
  const projBase = settled ? null : barBase(world, me, turnOf(game));
  const proj = projBase ? barSplit(projBase, projBase.committed) : null;

  const kpis = kpiRow([
    kpi({ icon: buildingArt('factory', 'md'), label: 'Industry', value: num(ic.total), sub: `${pct(ic.output > 0 ? ic.total / ic.output : 0)} of output`, tip: 'ic', cls: 'hero' }),
    kpi({ icon: gaugeArt('output', 'md'), label: 'Output', value: num(ic.output), sub: `hand ${num(ic.hand ?? 0, 0)} + industry ${num(ic.total ?? 0, 0)} + crown ${num(ic.crown ?? 0, 0)}`, tip: { text: 'Output\nHandwork, industry and the crown: everything the country makes in a week. Bills, the army, the people and development share it (Economy screen).' } }),
    kpi({
      label: 'Army draws', value: settled ? `${num(drawn, 1)} / ${num(armyCap, 1)}` : proj ? `0.0 / ${num(projBase.armyCap, 1)}` : '—',
      sub: `up to ${pct(ic.share)} of industry · economy law`,
      tip: 'law', arg: 'economy', meter: settled && armyCap > 0 ? drawn / armyCap : 0,
    }),
    kpi({
      icon: ledgerArt('people', 'md'), label: 'Consumer goods', value: settled ? pct(consumer.ratio) : proj ? pct(proj.ratio) : '—',
      sub: settled ? `${pts(consumerStability(consumer.ratio))} stability · fed ×${num(consumer.feed ?? feed, 2)}` : `projected · fed ×${num(feed, 2)}`,
      tip: { text: 'Consumer goods\nThe people\'s share of output against what they want, which grows every decade. A shortage costs stability and growth; the handle on the Economy screen sets the share.' },
      meter: settled ? Math.min(1, consumer.ratio) : proj ? Math.min(1, proj.ratio) : 0,
      meterTone: (settled ? consumer.ratio : proj?.ratio ?? 1) < 0.95 ? 'neg' : 'pos',
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
    { label: 'Crown', value: ic.crown ?? 0, text: num(ic.crown ?? 0, 0), tip: { text: `Crown\nThe capital adds a flat ${CROWN_OUTPUT} IC a week: even the smallest state keeps going.` } },
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
  const consumerNote = `<p class="k-note">${settled
    ? `Covered <b class="${consumer.ratio < 0.95 ? 'neg' : 'pos'}">${pct(consumer.ratio)}</b> · stability ${pts(consumerStability(consumer.ratio))}`
    : 'The people\'s share is measured when the first week closes'} · target ×${num(feed, 2)}${auto ? badge('auto', 'pos') : badge('manual', 'dim')}</p>
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
  // Toplu Auto, etkilediği sütunun başlığında durur (Kerem: panel başlığının
  // sağ ucunda öncelik düğmelerinden uzak, "garip" duruyordu).
  const anyManual = EQUIPMENT_IDS.some((id) => view.lines?.[id]?.mode === 'manual');
  const bulk = `<button class="k-btn sm pl-bulk" data-uc-lines-auto${anyManual
    ? tipAttr({ text: 'All lines to Auto\nThe ministry makes what the army lacks again; your own priorities are dropped.' })
    : ` disabled${tipAttr({ text: 'All lines to Auto\nEvery line is already on Auto.' })}`}>All to Auto</button>`;
  const body = `<div class="pl-top">
      ${lawCard(world, me, 'economy', state.confirm, { compact: true })}
      ${total}
    </div>
    ${splitBar(split, idleText)}
    <div class="pl-table">
      <div class="pl-row head">
        <span${tipAttr({ text: 'Lines\n↑ ↓ pick a line for the keyboard.' })}>Line <kbd class="k-key">↑↓</kbd></span>
        <span class="pl-prihead"><span${tipAttr({ text: `Priority\nThe army's industry is split between the lines by shares: ${LINE_PRIORITIES.map((level) => `${level.name} ${level.weight}`).join(' · ')}. Hover a priority to see the new split.\n← → step the picked line's priority.` })}>Priority <kbd class="k-key">←→</kbd></span>${bulk}</span>
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
      ${panel('Output', chains, { cls: 'ec-chainpanel' })}
      ${panel('Consumer goods', `${settled ? consumerBar : ''}${consumerNote}`, { sub: 'the people\'s share of output' })}
    </div>
    ${panel('Production lines', body, { cls: 'pl-panel' })}`;
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
      // Satır ve sıralama aynı sayıyı okur (bir kez hesaplanır).
      out: provinceOutputOf(province, me),
      fort: econ.fort ?? 0,
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

/**
 * Sıralanabilir sütunlar (kit.sortHead). Kalkınamayan state'in bedeli ve
 * getirisi yoktur (null): hangi yönde sıralanırsa sıralansın sonda kalır.
 */
const DEV_COLS = {
  name: { label: 'State', text: true, value: (row) => row.name },
  dev: { label: 'Development', value: (row) => row.dev },
  output: {
    label: 'Hand · industry', cls: 'r', value: (row) => row.out.hand + row.out.industry,
    tip: 'Output a week\nHandwork · industry, national factors included. Sorts by their sum.',
  },
  cost: { label: 'Next level', cls: 'r', value: (row) => (row.open ? row.cost : null) },
  gain: { label: 'Gain / wk', cls: 'r', value: (row) => (row.open ? row.gain : null) },
  fort: { label: 'Fort', cls: 'c', value: (row) => row.fort },
};

/** Ekranın, klavyenin ve imleç bekçisinin okuduğu tek sıra: oyuncunun sıralaması ya da fonunki. */
function devOrder(world, me, state) {
  return sortRows(developmentRows(world, me), state.sort?.construction, DEV_COLS);
}

/**
 * Satırlar imlecin altında yer değiştirmez. Liste fonun alacağı sırayla
 * dizilir ve saat akarken kayıyordu (8x'te 34 haftada 5 kez, ölçüldü):
 * oyuncunun nişan aldığı düğmeye başka bir state geliyordu. İmleç tablodayken
 * son çizilen sıra tutulur (değerler yine tazelenir); çıkınca liste dizilir.
 */
function shownRows(rows, state) {
  const hold = state.devHold;
  if (!hold?.length) return rows;
  const at = new Map(hold.map((id, i) => [id, i]));
  return rows.map((row, i) => [at.get(row.province.id) ?? hold.length + i, row])
    .sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/** screens.refresh yeniden kurmadan önce çağırır: tablo imlecin altındaysa çizili sırayı tutar. */
export function holdConstructionOrder(body, state) {
  // Başlığa tıklandı: imleç tablodadır ama oyuncu yeni sırayı istiyor.
  if (state.devResort) {
    state.devResort = false;
    state.devHold = null;
    return;
  }
  const table = body.querySelector('.ec-states .k-wtable');
  state.devHold = table?.matches(':hover')
    ? [...table.querySelectorAll('[data-uc-dvrow]')].map((row) => Number(row.dataset.ucDvrow))
    : null;
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
  const { out, fort } = row;
  const payback = row.gain > 1e-6 ? Math.ceil(row.cost / row.gain) : null;
  const other = econ.focus && econ.focus !== 'develop' ? FOCUS_BY_ID[econ.focus] : null;
  const blockers = row.focus ? [] : focusBlockers(world, me, province, 'develop');
  const preview = row.focus ? null : focusPreview(world, me, province, 'develop');
  const focusTip = row.focus
    ? `Develop focus\nThe development fund comes here first and its levels cost ${FOCUS_OFF} less.\nClick to remove it and free the slot.`
    : ['Develop focus', ...(preview?.lines ?? []), other ? `Replaces its ${other.name} focus.` : 'Uses a focus slot.'].join('\n');
  const button = `<button class="k-btn sm ec-devbtn${row.focus ? ' on' : ''}" data-uc-develop="${province.id}"${row.focus ? ' aria-pressed="true"' : ''}${blockers.length ? blockedAttr(blockers) : tipAttr({ text: focusTip })}>${row.focus ? 'Developing' : 'Develop'}</button>`;
  const gainTip = row.open
    ? `${row.name}: one more level\n+${num(row.gain, 2)} IC a week: more industry, and richer deposits at world prices.\nCosts ${money(row.cost, 0)}${row.focus ? ` (Develop focus: ${FOCUS_OFF} off)` : ''}${payback != null ? `: pays for itself in ~${payback} weeks.` : '.'}`
    : `${row.name}\n${row.closed === 'at the cap' ? 'At the development cap: research and literacy raise it.' : `Compliance under ${pct(INVEST.minStatus)}: the fund does not invest here yet.`}`;
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
  // İlk hafta kapanmadan fona akan pay yoktur: "0.0" ve "not saving" yalandı.
  const settled = Boolean(view.alloc);
  const projBase = settled ? null : barBase(world, me, turnOf(game));
  const proj = projBase ? barSplit(projBase, projBase.committed) : null;
  const known = settled || Boolean(proj);
  const invest = view.alloc?.invest ?? proj?.invest ?? 0;
  const efficiency = settled ? (view.investEfficiency ?? 1) : (projBase?.efficiency ?? 1);
  const invested = invest * efficiency;
  const rows = shownRows(devOrder(world, me, state), state);
  const next = rows.find((row) => row.target) ?? null;
  const fund = view.fund;
  const left = next ? Math.max(0, next.cost - fund) : 0;
  const eta = !next ? null : left <= 0 ? 0 : invested > 0.01 ? Math.ceil(left / invested) : null;
  const when = !known ? '' : eta == null ? 'not saving' : eta === 0 ? 'this week' : `~${span(eta)}`;
  const slots = focusSlots(me);
  const focused = focusedStates(world, me);
  const developing = focused.filter((p) => p.econ.focus === 'develop').length;
  const open = rows.filter((row) => row.open).length;

  const kpis = kpiRow([
    kpi({
      icon: emblemArt('infrastructure', 'md'), label: 'Invested', value: known ? num(invested, 1) : '—', cls: 'hero',
      sub: `IC a week · ${num(invest, 1)} × ${num(efficiency, 2)} efficiency${settled ? '' : ' · projected'}`,
      tip: { text: 'Invested\nWhat is left of output after bills, the army and the people, times the investment efficiency: research, advisors, Industrial Subsidies and Free Trade raise it; a timber or iron shortage cuts it by up to half.' },
    }),
    kpi({
      label: 'Next level', value: next ? `${short(fund)} / ${short(next.cost)}` : short(fund),
      sub: next ? `${esc(next.name)} → ${next.dev + 1}${when ? ` · ${when}` : ''}` : 'every state is at the cap',
      tip: { text: 'Next level\nThe fund saves for one state at a time and buys its next level as soon as it can pay: Develop-focus states first, then the best gain for the cost.' },
      meter: next && next.cost > 0 ? fund / next.cost : 0, meterTone: 'pos',
    }),
    kpi({
      label: 'Development cap', value: String(view.developmentCap), sub: `of ${DEVELOPMENT_MAX}`,
      tip: { text: `Development cap\nNo state may develop beyond it: ${DEVELOPMENT_CAP_BASE}, plus research, plus literacy × ${DEVELOPMENT_CAP_LITERACY} (literacy now ${pct(view.literacy)}). Schools cost output today and open the cap tomorrow.` },
    }),
    kpi({
      label: 'Fund floor', value: money(view.fundFloor, 0), sub: '',
      tip: { text: 'Fund floor\nGenerals, settlers, event choices and imports may take the fund below zero, down to this floor. Below zero no level is bought until it recovers.' },
    }),
    kpi({
      label: 'Develop focus', value: String(developing), sub: `${focused.length} of ${slots} focus slots in use`,
      tip: { text: `Develop focus\nThe fund serves these states first and their levels cost ${FOCUS_OFF} less. Focus slots grow with literacy and are shared with Production, Recruitment, Integration and Assimilation.` },
    }),
  ]);

  const cursor = devCursor(rows, state);
  const highlight = state.lineKeyboard && state.kbScreen === 'construction' ? cursor : null;
  const sort = state.sort?.construction ?? null;
  const col = (key) => sortHead('construction', key, DEV_COLS, sort);
  const head = `<div class="k-wrow k-dvrow head"><span></span>${Object.keys(DEV_COLS).map(col).join('')}<span></span></div>`;
  const body = rows.length ? rows.map((row) => devRow(world, me, row, highlight)).join('') : empty('You own no states.');
  const free = Math.max(0, slots - focused.length);

  return `${kpis}
    ${panel('States', `<div class="k-wtable">${head}${body}</div>${DEV_KEYS}`, {
    // Fonun sırası varsayılandır ve adıyla yazılır; oyuncunun sıralaması da.
    sub: `${sortLabel(sort, DEV_COLS) ?? 'in the order the fund buys'} · ${open} of ${rows.length} can develop`,
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
  // Klavye de ekranda görünen sırayla gezer (imleç tablodaysa tutulan sıra).
  const rows = shownRows(devOrder(game.world, me, state), state);
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
    kpi({ icon: gaugeArt('population', 'md'), label: 'Population', value: formatPopulation(economy.population ?? populationOf(world, me)), sub: `${yearly(g.rate)} a year${view.realized != null ? ` · last year ${signed(view.realized * 100, 2)}%` : ''}`, tip: { text: 'Population\nGrows with food, consumer goods, stability, development and peace; war and famine shrink it. The Growth panel shows every factor.' } }),
    kpi({ icon: lawArt('education', 'md'), label: 'Literacy', value: pct(economy.literacy), sub: `heading for ${pct(economy.literacyTarget ?? literacyTarget(world, me))}`, tip: 'law', arg: 'education', meter: economy.literacy, meterTone: 'pos' }),
    kpi({ icon: gaugeArt('manpower', 'md'), label: 'Manpower', value: formatPopulation(nationManpower(world, me.id)), sub: '', tip: 'manpower' }),
    kpi({ icon: lawArt('citizenship', 'md'), label: 'Full citizens', value: pct(economy.acceptedShare ?? acceptedShareOf(world, me)), sub: 'of the population', tip: 'law', arg: 'citizenship', meter: economy.acceptedShare ?? acceptedShareOf(world, me) }),
  ]);

  // --- Büyüme -------------------------------------------------------------
  const growthBody = g.famine
    ? `<div class="k-famine"><b>Famine</b> — food covers ${pct(g.foodRatio)} of need; the population shrinks ${yearly(g.rate)} a year. Import food, or give farm states the Production focus.</div>`
    : `<div class="k-growth-top"><b class="${g.rate >= 0 ? 'pos' : 'neg'}">${yearly(g.rate)}</b><small>a year</small>${spark(view.history, { width: 200, height: 34, zero: false })}</div>
      ${chain({ label: 'Base', text: `${num(g.base * 5200, 2)}%`, value: g.base }, [
    { label: 'Food', value: g.food, tip: { text: `Food\nShortfall slows growth; below ${pct(FAMINE_THRESHOLD)} covered, famine.\nCovered ${pct(g.foodRatio)}` } },
    { label: 'Goods', value: g.consumer, tip: { text: 'Consumer goods\nFull shelves add growth, empty ones take it away.' } },
    { label: 'Stability', value: g.stability },
    { label: 'Development', value: g.development, tip: { text: `Development\nPopulation-weighted across your states: +${pct(GROWTH_PER_DEVELOPMENT)} per level.` } },
    { label: 'Law', value: g.law },
    { label: 'Tech & ideas', value: g.mods },
    { label: 'Peace', value: g.peace, tip: { text: `Peace\nAt war, growth is cut by ${pct(1 - WAR_GROWTH)}.` } },
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

  // ANA YURT, kimin elinde: birleşmenin asıl sorusu "hangi state'ler eksik"
  // ve bu panel eskiden tam boy tek bir düğmenin altında boş kalıyordu.
  // Satır başına bir tutucu (önce biz, sonra en çok tutan); çip haritada açar.
  const holders = new Map();
  for (const province of world.provinces ?? []) {
    if (province.homeland !== me.culture || !province.econ) continue;
    if (!holders.has(province.owner)) holders.set(province.owner, []);
    holders.get(province.owner).push(province);
  }
  const holderRows = [...holders.entries()]
    .sort(([a, x], [b, y]) => (a === me.id ? -1 : b === me.id ? 1 : y.length - x.length || a - b))
    .map(([owner, list]) => {
      const mine = owner === me.id;
      const holder = Number.isInteger(owner) && owner >= 0 ? world.nations[owner] : null;
      const who = mine ? 'Ours' : holder ? esc(holder.name) : 'Unclaimed';
      const chips = list.map((province) => {
        const name = provinceName(province.center);
        return `<button type="button" class="k-chipbtn" data-uc-focus="${province.id}"${tipAttr({ text: `${name}\n${mine ? 'Ours' : holder ? `Held by ${holder.name}` : 'Unclaimed'} · ${status.culture} homeland\nClick to show it on the map.` })}>${esc(name)}</button>`;
      }).join('');
      return `<div class="k-home-row${mine ? ' mine' : ''}"><span class="k-home-who"><span>${who}</span><b>${list.length}</b></span><span class="k-home-chips">${chips}</span></div>`;
    }).join('');

  // İlan: önce sonucu söyler, sonra düğme (bedeli üstünde, engeli kartında).
  const proclaimed = status.formed === me.id;
  const proclaim = `<div class="k-proclaim${formBlockers.length ? '' : ' ready'}">
      <span class="k-proclaim-art">${eventArt('unification', 'md')}</span>
      <span class="k-proclaim-text"><b>Great ${esc(status.culture)} Empire</b>
        <small>${status.formed == null ? `Hold ${pct(FORMATION_SHARE)} of the homeland: a core on every homeland state, prestige and an end to the kin-abroad grievance.`
    : proclaimed ? 'Proclaimed: every homeland state is a core of ours.' : 'Another state has claimed the name.'}</small></span>
      <button class="k-btn${formBlockers.length ? '' : ' primary'}" data-uc-form="1"${formBlockers.length ? blockedAttr(formBlockers) : tipAttr({ text: `Proclaim the Great ${status.culture} Empire\nCosts ${FORMATION_POWER} political power. Once for every people.` })}>${proclaimed ? 'Proclaimed' : 'Proclaim'}<small>${FORMATION_POWER} PP</small></button>
    </div>`;

  return `${kpis}
    <div class="k-split k-pop">
      <div class="k-stack">
        ${panel('Growth', growthBody)}
        ${panel('Education', lawCard(world, me, 'education', state.confirm, { compact: true }))}
      </div>
      <div class="k-stack">
        ${panel(`The ${esc(status.culture)} nation`, `
          <div class="k-unify"${tipAttr({ text: `Unification\nHold ${pct(FORMATION_SHARE)} of your people's homeland to proclaim the Great nation: a core on every homeland state, prestige and an end to the kin-abroad grievance.` })}>
            <small>Homeland held</small>${meter(held, { tone: 'pos', mark: FORMATION_SHARE, wide: true })}<b>${status.owned} / ${status.total}</b>
          </div>
          ${holderRows ? `<div class="k-homes">${holderRows}</div>` : ''}
          <div class="k-unify-sub"><span>Kin under foreign rule <b class="${(economy.kinAbroad ?? 0) > 0.1 ? 'neg' : ''}">${pct(economy.kinAbroad ?? 0)}</b></span>
            ${goal ? `<span${tipAttr({ text: `${goal.name}\n${goal.desc}` })}>Goal: <b>${esc(goal.name)}</b> ${goalMet(world, me) ? badge('on track', 'pos') : badge(`+${goal.bonus} in ${END_YEAR}`, 'dim')}</span>` : ''}</div>
          ${unionRows ? `<div class="k-unions">${unionRows}</div>` : ''}
          ${proclaim}`, { sub: status.formed == null ? 'unification' : proclaimed ? 'proclaimed' : 'claimed by another', icon: eventArt('unification', 'sm'), cls: 'k-nation' })}
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
    kpi({ icon: eventArt('revolution', 'md'), label: 'Unrest', value: num(view.unrest, 1), sub: view.boiling ? `${view.boiling} state${view.boiling === 1 ? '' : 's'} at revolt level` : `revolt level is ${view.revoltAt}`, tip: { text: `Unrest (0-10)\nPopulation-weighted across your states. Above ${view.revoltAt} a state can rise; where an unaccepted people is the majority, unrest above 6 feeds their national movement.` }, meter: view.unrest / 10, meterTone: view.unrest >= 4 ? 'neg' : 'warn' }),
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
    ? `<span class="k-stage s${move.stage.index}"${tipAttr({ text: `${move.stage.name} · ${Math.round(move.progress)}%\nAt 100% their states break away${move.heir ? ` and ${move.heir.name} goes to war with us` : ''}.${move.eta != null ? `\nAt this pace: ~${span(move.eta)}.` : ''}` })}>${esc(move.stage.name)} <b>${Math.round(move.progress)}%</b></span>`
    : '<span class="k-dim">—</span>');
  // --- Halklar: satır seçilir; politika rozetleri ------------------------
  const psort = state.sort?.cultures ?? null;
  const peopleHead = `<div class="k-prow head">${Object.keys(PEOPLE_COLS).map((key) => sortHead('cultures', key, PEOPLE_COLS, psort)).join('')}<span>Policy</span></div>`;
  const peopleRows = sortRows(view.peoples, psort, PEOPLE_COLS).slice(0, 16).map((row) => {
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
      <span class="k-rrow-val"${tipAttr({ text: tip })}>${meter(row.unrest / 10, { tone: row.unrest >= 7 ? 'neg' : row.unrest >= 4 ? 'warn' : 'party', mark: 0.7 })}<b class="${row.unrest >= 7 ? 'neg' : ''}">${num(row.unrest, 1)}</b><i class="k-trend ${rising ? 'up' : falling ? 'down' : ''}">${glyph(rising ? 'up' : falling ? 'down' : 'flat', 'ctl')}</i></span>
      <span class="k-rrow-causes"${tipAttr({ text: tip })}>${causes || '<span class="k-dim">settling</span>'}</span>
      <span class="k-rrow-comp">${Math.round(row.compliance)}%</span>
    </div>`;
  }).join('');

  // --- Ulusal hareketler --------------------------------------------------
  const moveCards = view.movements.map((row) => {
    const a = row.actions;
    const act = (id, label, cfg, tip, cls = '', art = '') => {
      const key = `move:${id}:${row.cultureId}`;
      const arming = state.confirm === key;
      return `<button class="k-btn sm ${cls}${art ? ' has-art' : ''}${arming ? ' confirming' : ''}" data-uc-move="${id}:${row.cultureId}"${cfg.blockers.length ? blockedAttr(cfg.blockers) : tipAttr({ text: tip })}>${art}${arming ? 'Confirm' : label}</button>`;
    };
    const ticks = MOVEMENT.STAGES.slice(1).map((s) => `<i style="left:${s.at}%"></i>`).join('');
    const pace = row.martialLeft > 0 ? `martial law · ${row.martialLeft} wk`
      : row.calmLeft > 0 ? `exhausted · ${row.calmLeft} wk`
        : row.eta != null ? `breaks away in ~${span(row.eta)}` : 'fading';
    return `<div class="k-move s${row.stage.index}" style="--mv:${row.color ?? '#888'}">
      <div class="k-move-head"><i></i>${movementArt(row.track)}<b>${esc(row.name)}</b><span class="k-stage s${row.stage.index}">${esc(row.stage.name)}</span><small>${pace}</small></div>
      <div class="k-move-bar"${tipAttr({ text: `${Math.round(row.progress)}% — at 100% ${row.provinces.length} state${row.provinces.length === 1 ? '' : 's'} break away${row.heir ? ` and ${row.heir.name} goes to war with us` : ''}.\nIt grows while their unrest stays above ${row.calm} (now ${num(row.pressure, 1)}).` })}><i class="fill" style="width:${row.progress.toFixed(1)}%"></i>${ticks}</div>
      <div class="k-move-acts">
        ${act('concessions', `Concede · ${a.concessions.cost} PP`, a.concessions, `Temporary: −${a.concessions.drop}% progress and calmer states. Once a year.`, '', eventArt('concession'))}
        ${act('martial', `Martial law · ${money(a.martial.cost, 1)}/wk`, a.martial, `Temporary: for ${a.martial.weeks} weeks the movement loses ground; it adds a weekly bill (paid off the top of output) and costs some stability.`, '', eventArt('martial_law'))}
        ${act('vassal', `Release ${a.vassal.provinces} as vassal`, a.vassal, 'Permanent: their states become our vassal. The land goes, the war never comes, they pay us 15% of their income.', 'danger', diplomacyArt('vassal'))}
        ${act('crackdown', `Crush · ${formatPopulation(a.crackdown.dead)} die`, a.crackdown, `Permanent: ${formatPopulation(a.crackdown.dead)} of them die. −${a.crackdown.drop}% progress, heavy infamy, lost stability; our other peoples grow bolder.`, 'danger')}
      </div>
    </div>`;
  }).join('');

  return `${kpis}
    <div class="k-split wide-left k-cult">
      <div class="k-stack">
        ${panel('Peoples', `<div class="k-ptable">${peopleHead}${peopleRows}</div>`, { sub: sortLabel(psort, PEOPLE_COLS) ?? '' })}
        ${panel('Restless states', restlessRows ? `<div class="k-rtable">${restlessRows}</div>${view.restlessMore ? `<small class="k-more">and ${view.restlessMore} calmer state${view.restlessMore === 1 ? '' : 's'}</small>` : ''}` : empty('Every state is calm.'), { sub: `out of 10 · revolt at ${view.revoltAt} · ${glyph('up', 'ctl')} rising ${glyph('down', 'ctl')} settling`, right: 'cause · compliance' })}
      </div>
      <div class="k-stack">
        ${detail ? peopleCard(world, me, detail, state, acceptTip) : ''}
        ${settle.emptied.length || settle.ongoing ? resettleCard(settle) : ''}
        ${panel('National movements', moveCards || empty('No movement is growing. One rises where an unaccepted people is the majority and their unrest stays above 6.'), { sub: view.movements.length ? 'act before they break away' : 'peoples without rights organise here' })}
        ${focusCard(world, me)}
        ${panel('Citizenship', lawCard(world, me, 'citizenship', state.confirm, { compact: true }))}
      </div>
    </div>`;
}

/** Halklar tablosunun sıralanabilir sütunları (kit.sortHead); hareketi olmayan halk sonda. */
const PEOPLE_COLS = {
  name: { label: 'People', text: true, value: (row) => row.name },
  share: { label: 'Share', value: (row) => row.share },
  states: { label: 'Lives in', value: (row) => row.states },
  unrest: { label: 'Unrest', value: (row) => row.unrest },
  movement: { label: 'Movement', value: (row) => row.movement?.progress ?? null },
};

/** Seçili halkın kartı: kim, nerede, ve üç basamaklı politika zinciri. */
function peopleCard(world, me, d, state, acceptTip) {
  const confirmBtn = (key, attr, label, tip, blockers, cls = '') => {
    const arming = state.confirm === key;
    return `<button class="k-btn sm ${cls}${arming ? ' confirming' : ''}" ${attr}${blockers.length ? blockedAttr(blockers) : tipAttr({ text: tip })}>${arming ? 'Confirm' : label}</button>`;
  };
  const homes = d.homes.slice(0, 6).map((home) => `<button type="button" class="k-chipbtn" data-uc-focus="${home.id}"${tipAttr({ text: `${home.name}\n${formatPopulation(home.people)} ${d.name} · ${pct(home.share)} of the state${home.homeland ? ' · their homeland' : ''}${home.reservation ? ' · reservation' : ''}\nUnrest ${num(home.unrest, 1)}${home.focus ? ` · focus: ${home.focus}` : ''}` })}>${esc(home.name)} <b>${pct(home.share)}</b>${home.homeland ? `<i>${glyph('home', 'ctl')}</i>` : ''}${home.reservation ? `<i>${glyph('reserve', 'ctl')}</i>` : ''}</button>`).join('');
  const more = d.homes.length > 6 ? `<small class="k-dim">+${d.homes.length - 6} more</small>` : '';
  const kin = d.kin.length ? `kin state: <b>${d.kin.map((k) => esc(k.name)).join(', ')}</b>` : 'no kin state';

  // Basamak satırı: solda ne yapılacağı ve sonucu, sağda TEK düğme sütunu.
  // Eskiden Accept solda, Focus/Impose sağda, Release/Deport/Confine solda
  // tek sırada, Show on map sağ üstteydi (Kerem: "butonlar saçma yerlerde").
  // Düğmeler aynı genişlikte: "Confirm"e dönen düğme satırı oynatmaz.
  const act = (title, effect, button) => `<div class="k-pol-act">
      <span class="k-pol-what"><b>${title}</b>${effect ? `<small>${effect}</small>` : ''}</span>
      <span class="k-pol-btn">${button}</span>
    </div>`;

  // 1) HAKLAR
  const rights = d.primary
    ? act('Our own people', 'Full rights by birth: they work, serve and fill the ranks.', '')
    : d.accepted
      ? (() => {
        const r = d.revoke.preview;
        const tip = `Revoke their acceptance\nThey become foreign again: ${formatPopulation(r.recruits)} fewer recruits, unrest heads for ${num(r.unrestTo, 1)} where they live and keeps growing each year until you act, and their old movement can stir again.\nIn return they can be assimilated once more — and deported or confined if they rise.\nThe political power spent is not returned; accepting them again costs ${r.power} PP. The cabinet will not re-accept them on its own.`;
        return act('Full citizens', `they work, serve and feed no movement · revoking: recruits −${formatPopulation(r.recruits)}, unrest ${num(r.unrestFrom, 1)} → ${num(r.unrestTo, 1)}`,
          confirmBtn(`revoke:${d.id}`, `data-uc-revoke="${d.id}"`, 'Revoke', tip, d.revoke.blockers, 'danger'));
      })()
      : (() => {
        const blocked = d.accept.blockers;
        const tip = blocked.length
          ? ` disabled aria-disabled="true"${tipAttr({ text: `Not possible now\n${blocked.join('\n')}\n\n${acceptTip({ name: d.name, accept: d.accept }).text}` })}`
          : tipAttr(acceptTip({ name: d.name, accept: d.accept }));
        return act('Accept as full citizens', `recruits +${formatPopulation(d.accept.preview.recruits)} · unrest ${num(d.accept.preview.unrestFrom, 1)} → ${num(d.accept.preview.unrestTo, 1)}`,
          `<button class="k-btn sm primary" data-uc-accept="${d.id}"${tip}>Accept<small>${d.accept.preview.power} PP</small></button>`);
      })();

  // 2) ERİTME
  const melt = d.primary || d.accepted ? '' : `
    ${act('Assimilation focus', `${d.focusStates} of their ${d.homes.length} state${d.homes.length === 1 ? '' : 's'} focused · 2-4% a year take our culture`,
    `<button class="k-btn sm" data-uc-melt="${d.id}"${tipAttr({ text: 'Assimilation focus\nPut the focus on their largest state without one: 2-4% of its people a year take up our culture. Uses a focus slot.' })}>Focus largest</button>`)}
    ${act('Forced assimilation', d.forced ? `<b class="neg">in force</b> · ~${formatPopulation(d.force.yearly)} a year` : `~${formatPopulation(d.force.yearly)} a year · unrest +${num(d.force.unrest, 1)} · infamy +${d.force.infamy}`,
    d.forced
      ? `<button class="k-btn sm" data-uc-force="${d.id}:0"${tipAttr({ text: 'Lift it\nTheir children may learn their own tongue again. What has melted stays melted.' })}>Lift</button>`
      : confirmBtn(`force:${d.id}`, `data-uc-force="${d.id}:1"`, 'Impose', `Forced assimilation\nTheir newborns count as ours: ~${formatPopulation(d.force.yearly)} of them a year take up our culture, even in their homeland. Unrest +${num(d.force.unrest, 1)} where they live; infamy +${d.force.infamy}.`, d.force.blockers, 'danger'))}`;

  // 3) UZAKLAŞTIRMA (kriz kapısı): her yolun sonucu kendi satırında.
  const where = d.deport.destinations.map((row) => `${esc(row.name)}${row.kin ? ' (kin)' : ''}`).join(', ');
  const away = d.primary || d.accepted ? '' : `
    ${act(esc(d.release.label ?? 'Release their provinces'), 'their majority provinces leave · no war, infamy falls',
    confirmBtn(`release:${d.id}`, `data-uc-release="${d.id}"`, 'Release', `${d.release.label ?? 'Release'}\nEvery province where they are the majority leaves with them: to their kin state next door, or as their own Free State. No war; the world thinks better of us (infamy falls).`, d.release.blockers, 'danger'))}
    ${act(`Deport all ${formatPopulation(d.people)}`, `${where ? `to ${where}` : 'across the border'} · infamy +${Math.round(d.deport.infamy)} · their land empties`,
    confirmBtn(`expel:${d.id}`, `data-uc-expel="${d.id}"`, 'Deport', `Deport\nAll ${formatPopulation(d.people)} of them are driven across the border${where ? ` to ${where}` : ''}. Infamy +${Math.round(d.deport.infamy)}. Their provinces empty — settlers can fill them.`, d.deport.blockers, 'danger'))}
    ${act(d.confine.target ? `Confine to ${esc(d.confine.target.name)}` : 'Confine to one state', `${formatPopulation(d.confine.people)} moved · reservation unrest +${d.confine.unrest} · infamy +${Math.round(d.confine.infamy)}`,
    confirmBtn(`confine:${d.id}`, `data-uc-confine="${d.id}"`, 'Confine', `Confine\n${formatPopulation(d.confine.people)} of them are moved into ${d.confine.target?.name ?? 'one state'}. Their other homes empty; the reservation's unrest +${d.confine.unrest} and their movement feeds on it. Infamy +${Math.round(d.confine.infamy)}.`, d.confine.blockers, 'danger'))}
    <small class="k-pol-gate">${d.deport.blockers.length ? esc(d.deport.blockers[0]) : 'Deportation and confinement are open: they rose, or their movement reached Agitation.'}</small>`;

  const body = `
    <div class="k-people-head"><i style="background:${d.color}"></i><b>${esc(d.name)}</b>
      <span>${pct(d.share)} · ${formatPopulation(d.people)} · ${kin}</span>
      <span class="k-pol-btn"><button class="k-btn sm" data-uc-showmap="${d.id}"${tipAttr({ text: `Show the ${d.name} on the culture map\nEvery province shaded by their share, ours and abroad.` })}>Show on map</button></span></div>
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
  return panel('Empty land', `${rows}${v.emptied.length > 5 ? `<small class="k-more">and ${v.emptied.length - 5} more</small>` : ''}${action}`, {});
}

/** Bütün state odakları (province panelindeki listeyle aynı eylemler). */
function focusCard(world, me) {
  const states = focusedStates(world, me).sort((a, b) => (a.econ.focus ?? '').localeCompare(b.econ.focus ?? '') || a.name.localeCompare(b.name));
  const free = Math.max(0, focusSlots(me) - states.length);
  const rows = states.map((state) => {
    const focus = FOCUSES.find((f) => f.id === state.econ.focus);
    return `<div class="k-focus-row">${emblemArt(focus.art, 'xs')}<button class="k-link" data-uc-focus="${state.id}">${esc(state.name)}</button><b>${esc(focus.name)}</b>
      <button class="k-x" data-uc-unfocus="${state.id}" aria-label="Remove the focus from ${esc(state.name)}"${tipAttr({ text: `Remove the focus from ${state.name}` })}>${glyph('close', 'ctl')}</button></div>`;
  }).join('');
  const cabinet = me.focusAuto !== false && isDelegated(me, 'reforms');
  return panel('State focus', `${rows || empty('No state has a focus.')}
    <div class="k-focus-foot"><span>${free ? `${free} free slot${free === 1 ? '' : 's'}` : 'all slots in use'}</span>
      <button class="k-btn sm${cabinet ? ' on' : ''}" data-uc-focus-auto${isDelegated(me, 'reforms') ? '' : ' disabled'}${tipAttr({ text: 'The cabinet (AUTO) puts a focus in every empty slot each quarter.\nTurn it off to keep the slots you clear empty.' })}>Cabinet fills: ${cabinet ? 'on' : 'off'}</button>
      <button class="k-btn sm" data-uc-unfocus-all${states.length ? '' : ' disabled'}>Clear all</button></div>`,
  { sub: `${states.length} of ${focusSlots(me)} slots` });
}

// ============================================================== POLITICS ===

/**
 * MECLİS: parti desteği 100 sandalyelik yarım daire (Victoria'daki gibi).
 * Yalnız sunum: destek yüzdesi en büyük kalan yöntemiyle sandalyeye çevrilir;
 * seçim, çoğunluk ya da koalisyon mekaniği YOK. Altındaki çubuklar kesin
 * yüzdeyi söyler, yarım daire güç dengesini tek bakışta. Partiler soldan
 * sağa ideoloji sırasıyla oturur; ortadaki kesik çizgi 50. sandalyedir.
 */
const HEMI_ORDER = ['socialist', 'liberal', 'conservative', 'nationalist'];
const HEMI_SEATS = 100;

/** Rota karesinin kenarı (px). Tık ve nişan aynı ölçüyü okur. */
const COURSE_PAD = 136;
/** Tıkla kurulan rotanın finansmanı: açık kademe ya da Düşük (tık işleyicisiyle tek kural). */
const courseClickBudget = (me) => (me.politics.courseBudget > 0 ? me.politics.courseBudget : 0.15);

/** Rota durum satırı. Finansman kapalıyken kurulu rota kıpırdamaz: söylenir. */
function courseStatus(c) {
  if (c.weeks != null) return `Drifting toward the ${esc(PARTIES[c.toward].name)} — ~${c.weeks} weeks, −${c.weeklyCost.toFixed(1)} PP a week`;
  if (c.heading && !(c.budget > 0)) return 'Course set · funding is Off, so it holds still';
  if (c.heading) return 'Holding course: free';
  return `Leaning ${esc(PARTIES[c.leaning].name)} · no course set`;
}

/**
 * Nişanın önizlemesi: tık bu noktaya rota kursa ne olur. Sayı oyunun
 * courseView'ından gelir (ekran formül kurmaz): oyuncunun ulusu üstünde,
 * yalnız yönü ve finansmanı değişmiş bir görünüm — asıl durum değişmez.
 */
function coursePreview(me, x, y) {
  const probe = Object.create(me);
  probe.politics = { ...me.politics, heading: { x, y }, courseBudget: courseClickBudget(me) };
  const view = courseView(probe);
  return view.weeks != null
    ? `Click: steer toward the ${PARTIES[view.toward].name} — ~${view.weeks} weeks, −${view.weeklyCost.toFixed(1)} PP a week`
    : 'Click: hold the course here';
}
function hemicycle(support) {
  const parties = HEMI_ORDER.map((id) => support.find((party) => party.id === id)).filter(Boolean);
  if (!parties.length) return '';
  const total = parties.reduce((sum, party) => sum + Math.max(0, party.support), 0) || 1;
  const quotas = parties.map((party) => (Math.max(0, party.support) / total) * HEMI_SEATS);
  const seats = quotas.map(Math.floor);
  let spare = HEMI_SEATS - seats.reduce((a, b) => a + b, 0);
  for (const [, i] of quotas.map((q, i) => [q - Math.floor(q), i]).sort((a, b) => b[0] - a[0])) {
    if (spare-- > 0) seats[i]++;
  }
  // Dört sıra; sıra başına sandalye yarıçapla orantılı (yay boyu eşit aralık).
  // İç boşluk iktidar partisinin adına yer bırakır: 62'lik iç yarıçapta ad
  // iç sıranın sandalyelerine biniyordu.
  const W = 300;
  const H = 158;
  const cx = W / 2;
  const cy = 150;
  const rows = 4;
  const rIn = 80;
  const rOut = 142;
  const radii = Array.from({ length: rows }, (_, i) => rIn + (i * (rOut - rIn)) / (rows - 1));
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.round((HEMI_SEATS * r) / sumR));
  perRow[rows - 1] += HEMI_SEATS - perRow.reduce((a, b) => a + b, 0);
  const spots = [];
  radii.forEach((r, row) => {
    const n = perRow[row];
    for (let k = 0; k < n; k++) {
      const a = Math.PI - (k * Math.PI) / (n - 1);
      spots.push({ a, row, x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
    }
  });
  // Açıya göre soldan sağa: her parti bir dilim olur, sıralar boyunca.
  spots.sort((p, q) => q.a - p.a || p.row - q.row);
  let at = 0;
  const groups = parties.map((party, pi) => {
    const dots = spots.slice(at, at + seats[pi]).map((spot, k) => `<circle cx="${spot.x.toFixed(1)}" cy="${spot.y.toFixed(1)}" r="5.6" style="--i:${at + k}"/>`).join('');
    at += seats[pi];
    return `<g class="k-hemi-party${party.ruling ? ' is-ruling' : ''}" fill="${party.color}"${tipAttr('party', party.id)}>${dots}</g>`;
  }).join('');
  const ruling = parties.find((party) => party.ruling);
  return `<figure class="k-hemi" aria-label="Parliament">
      <svg viewBox="0 0 ${W} ${H}" role="img"><title>Parliament: ${parties.map((party, i) => `${esc(party.name)} ${seats[i]}`).join(', ')}</title>
        <line class="k-hemi-maj" x1="${cx}" y1="${cy - rOut - 9}" x2="${cx}" y2="${cy - rIn + 9}"/>${groups}</svg>
      ${ruling ? `<figcaption><b>${esc(ruling.name)}</b><small>${Math.round(ruling.support)}% · in government</small></figcaption>` : ''}
    </figure>`;
}

export function renderPolitics(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const view = governmentView(world, me, turn);
  const agenda = agendaView(world, me, turn);
  const decisions = decisionsView(me, turn);

  const kpis = kpiRow([
    kpi({ icon: gaugeArt('power', 'md'), label: 'Political power', value: String(Math.round(view.power)), sub: `${signed(view.powerIncome.total, 2)} / week · cap 500`, tip: 'power', meter: view.power / 500, cls: 'hero' }),
    kpi({ icon: gaugeArt('stability', 'md'), label: 'Stability', value: pct(view.stability), sub: `heading to ${pct(view.stabilityTarget)}`, tip: 'stability', meter: view.stability, meterTone: view.stability < 0.35 ? 'neg' : 'pos' }),
    kpi({ icon: gaugeArt('war_support', 'md'), label: 'War support', value: pct(view.warSupport), sub: `heading to ${pct(view.warSupportTarget)}`, tip: 'warsupport', meter: view.warSupport, meterTone: 'warn' }),
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
  // Kare bir SEÇİM YÜZEYİ olarak okunmalı (Kerem: "oyuncu tıklayıp
  // tıklamaması gerektiğini bilmiyor"): ızgaralı, çerçeveli, dört kenarında
  // eksen adı; imleci izleyen nişan ve tıklamanın sonucu durum satırında
  // (bindStateScreens, oyunun courseView'ı); rota yokken içinde ipucu.
  const courseSquare = (c) => {
    if (!c) return '';
    const S = COURSE_PAD;
    const px = (v) => (((v + 1) / 2) * S).toFixed(1);
    const tints = Object.entries(c.corners).map(([id, [x, y]]) => `<rect x="${x < 0 ? 0 : S / 2}" y="${y < 0 ? 0 : S / 2}" width="${S / 2}" height="${S / 2}" fill="${PARTIES[id].color}" opacity="0.13"/>`).join('');
    const grid = [0.25, 0.75].map((f) => `<line x1="${S * f}" y1="0" x2="${S * f}" y2="${S}"/><line x1="0" y1="${S * f}" x2="${S}" y2="${S * f}"/>`).join('');
    const corners = Object.entries(c.corners).map(([id, [x, y]]) => `<circle class="k-course-party" cx="${px(x)}" cy="${px(y)}" r="6" fill="${PARTIES[id].color}"/>`).join('');
    // Hedef: açık pirinç halka + artı (ortası boş), rotadan ona kesik yol.
    // Bugünkü yer: dolu krem nokta. İkisi biçimden ayrılır, renkten değil.
    const target = c.heading ? `<g class="k-course-target">
        <line class="k-course-path" x1="${px(c.course.x)}" y1="${px(c.course.y)}" x2="${px(c.heading.x)}" y2="${px(c.heading.y)}"/>
        <g transform="translate(${px(c.heading.x)} ${px(c.heading.y)})"><circle r="7.5"/><path d="M-12 0h6M6 0h6M0 -12v6M0 6v6"/></g>
      </g>` : '';
    const status = courseStatus(c);
    const funding = c.budgets.map((b, i) => `<button class="k-btn sm${Math.abs(c.budget - b) < 1e-6 ? ' on' : ''}" data-uc-course-budget="${b}">${['Off', 'Low 15%', 'High 30%'][i]}</button>`).join('');
    return `<div class="k-course">
      <div class="k-course-pad">
        <span class="k-course-ax n">Order</span><span class="k-course-ax w">Elite</span>
        <svg class="k-course-sq${c.heading ? ' set' : ''}" data-uc-course viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Course of the state: click to set a heading, right-click to stop">
          <rect class="k-course-bg" x="0" y="0" width="${S}" height="${S}"/>${tints}
          <g class="k-course-grid">${grid}</g>
          <line class="k-course-axis" x1="${S / 2}" y1="0" x2="${S / 2}" y2="${S}"/><line class="k-course-axis" x1="0" y1="${S / 2}" x2="${S}" y2="${S / 2}"/>
          <rect class="k-course-frame" x="0.75" y="0.75" width="${S - 1.5}" height="${S - 1.5}" rx="2"/>
          ${c.heading ? '' : `<g class="k-course-hint"><rect x="${S / 2 - 54}" y="${S * 0.68}" width="108" height="17" rx="8.5"/><text x="${S / 2}" y="${S * 0.68 + 12.2}" text-anchor="middle">Click to set a course</text></g>`}
          ${corners}${target}
          <g class="k-course-ghost"><line x1="${px(c.course.x)}" y1="${px(c.course.y)}" x2="${px(c.course.x)}" y2="${px(c.course.y)}"/><g><circle r="7.5"/><path d="M-12 0h6M6 0h6M0 -12v6M0 6v6"/></g></g>
          <circle class="k-course-now" cx="${px(c.course.x)}" cy="${px(c.course.y)}" r="5"/>
        </svg>
        <span class="k-course-ax e">Masses</span><span class="k-course-ax s">Reform</span>
      </div>
      <div class="k-course-side">
        <small${tipAttr({ text: 'The course of the state\nWhere you steer the nation\'s politics. Support for the parties near it grows as long as you hold it there; moving costs a share of political power, holding costs nothing. Order raises war support; Reform calms your peoples.\nClick the square to set a heading, right-click it to stop.' })}>Course of the state</small>
        <p class="k-course-status" data-course-status>${status}</p>
        <div class="k-actions">${funding}</div>
      </div>
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
  // Kapalı karar da aynı kartı açar (engeller kartın altında): yalnız engel
  // listesi gösterilseydi kesilen etki metni hiçbir yerde okunamazdı.
  const decisionTiles = decisions.map((decision) => `<button class="k-dec slim" data-uc-decision="${decision.id}"${decision.blockers.length ? ' disabled aria-disabled="true"' : ''}${tipAttr('decision', decision.id)}>
      <b>${esc(decision.name)}</b><span class="k-cost">${decision.cost}</span><small>${esc(decision.desc)}</small></button>`).join('');

  // DÜZEN: tam genişlik, iki sütun. Eski düzen yedi paneli alt alta diziyordu
  // ve 1080p'de 500px taşıyordu; gövde `overflow: hidden` olduğu için
  // Danışmanlar ve Kararlar fareyle HİÇ görülemiyordu (ölçüldü).
  return `${kpis}
    <div class="k-split k-pol">
      <div class="k-stack">
        ${panel('Parties', `<div class="k-pol-top">${courseSquare(view.course)}${hemicycle(view.support)}</div><div class="k-parties">${parties}</div>${regimes ? `<div class="k-actions">${regimes}</div>` : ''}`, { sub: esc(view.government.desc) })}
        ${panel('Laws', `<div class="k-laws">${laws}</div>`, { sub: `${view.lawCost} political power per change · 26-week lock` })}
        ${panel('Decisions', `<div class="k-decs">${decisionTiles}</div>`)}
      </div>
      <div class="k-stack">
        <div class="k-cols-2 k-pol-why">
          ${panel('Stability', parts(view.stabilityParts), { right: `→ ${pct(view.stabilityTarget)}`, tip: 'stability' })}
          ${panel('War support', parts(view.warSupportParts), { right: `→ ${pct(view.warSupportTarget)}`, tip: 'warsupport' })}
        </div>
        ${view.exhaustion > 0.005 || view.exhaustionParts.length ? panel('War exhaustion', `${parts(view.exhaustionParts.map((part) => ({ ...part, value: -part.value })))}
          <p class="k-pol-ladder">${view.exhaustionLadder.map((step) => `<span class="${step.passed ? 'passed' : ''}">${Math.round(step.at * 100)}% ${esc(step.text)}</span>`).join(' · ')}</p>`, {
    // Üst çubukta "War Sup." hücresindeki yorgunluk aynı miğferle yazılır.
    icon: gaugeArt('exhaustion', 'sm'),
    right: `${pct(view.exhaustion)} → ${pct(view.exhaustionTarget)}`,
  }) : ''}
        ${panel('National agenda', agendaBody + (recent ? `<ul class="k-log">${recent}</ul>` : ''), {
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
  // Kurulan onay screens.js'tekilerle aynı sürede söner: süresiz "Confirm"
  // haftalar sonra tek tıkla geri alınmaz bir kararı yürürlüğe koyuyordu.
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
  // Sıralanabilir başlıklar (kit.sortHead). 'politics' yayınlanmaz: sıra
  // oyun durumu değildir, üst çubuğun tazelenecek bir şeyi yok.
  for (const el of root.querySelectorAll('[data-uc-sort]')) {
    el.onclick = () => {
      const [table, key] = el.dataset.ucSort.split(':');
      state.sort = { ...state.sort, [table]: nextSort(state.sort?.[table], key, el.dataset.sortFirst === 'asc') };
      // Development: imleç tablodayken tutulan sıra yeni sıralamayı ezmesin;
      // kaydırılmış liste başa döner (yeni sıranın ucu görünsün).
      if (table === 'construction') state.devResort = true;
      el.closest('.k-wtable')?.scrollTo({ top: 0 });
      screens.refresh();
    };
  }
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
  // İmleç tablodan çıkınca tutulan sıra bırakılır; sıra eskidiyse liste
  // hemen dizilir (saat dururken bir sonraki haftayı beklemesin).
  const devTable = root.querySelector('.ec-states .k-wtable');
  if (devTable) {
    devTable.onpointerleave = () => {
      const hold = state.devHold;
      if (!hold) return;
      state.devHold = null;
      const fresh = devOrder(game.world, me, state).map((row) => row.province.id);
      if (fresh.join() !== hold.join()) screens.scheduleRefresh();
    };
  }
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
  // Üstünde gezinen imleci bir nişan izler; durum satırı tıkın sonucunu söyler.
  for (const el of root.querySelectorAll('[data-uc-course]')) {
    const status = root.querySelector('[data-course-status]');
    const resting = status?.textContent ?? '';
    const ghost = el.querySelector('.k-course-ghost');
    const pointAt = (event) => {
      const box = el.getBoundingClientRect();
      const clamp = (v) => Math.max(-1, Math.min(1, v));
      return { x: clamp(((event.clientX - box.left) / box.width) * 2 - 1), y: clamp(((event.clientY - box.top) / box.height) * 2 - 1) };
    };
    const aim = ({ x, y }) => {
      const px = (v) => (((v + 1) / 2) * COURSE_PAD).toFixed(1);
      ghost?.querySelector('g')?.setAttribute('transform', `translate(${px(x)} ${px(y)})`);
      ghost?.querySelector('line')?.setAttribute('x2', px(x));
      ghost?.querySelector('line')?.setAttribute('y2', px(y));
      el.classList.add('aiming');
      if (status) status.textContent = coursePreview(me, x, y);
      state.courseAim = { x, y };
    };
    el.onpointermove = (event) => aim(pointAt(event));
    el.onpointerleave = () => {
      el.classList.remove('aiming');
      if (status) status.textContent = resting;
      state.courseAim = null;
    };
    // Haftalık tazeleme kareyi yeniden kurar: imleç üstündeyse nişan yerinde kalsın.
    if (state.courseAim && el.matches(':hover')) aim(state.courseAim);
    el.onclick = (event) => {
      // Nişanın noktası: tık olayının koordinatı tam sayıya yuvarlanır,
      // gezinmeninki kesirlidir; önizlemedeki hafta sayısı birebir tutsun.
      const { x, y } = state.courseAim ?? pointAt(event);
      setCourse(me, { x, y }, courseClickBudget(me));
      // Tıktan sonra durum satırı kurulan rotayı söyler; nişan fare oynayınca döner.
      state.courseAim = null;
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

/** Dosya kartından ambargo: bedel ve kural oyun katmanında (econ/trade.js, DIP-06). */
export { EMBARGO_POWER, embargoBlockers, declareEmbargo } from '../game/econ/trade.js';
