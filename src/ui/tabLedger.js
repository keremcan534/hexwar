// SEKME DEFTERİ — Victoria 2 üst menüsünün karşılığı. Her yönetim sekmesi
// adının altında kendi alanının canlı satırını taşır: araştırma, kalkınma,
// eğitim, gündem ilerledikçe yuvanın içi dolar (Vic2'nin yeşil araştırma
// çubuğu). Sayılar game/tabSummary.js'ten gelir; burası yalnız biçimdir.
// Sekme kimlikleri eskidir: 'construction' Development, 'budget' Economy
// ekranıdır (TEK ÇUBUK, 2026-10-15).
//
// ARAYÜZ OYNAMAZ (styles.css §50): yuva her kırılımda SABİT genişliktedir,
// değer değişince yalnız metin ve dolgu (transform) değişir. Düğmelerin
// innerHTML'ine dokunulmaz — sekme glifi (screens.js) ve imleç altındaki
// tooltip kaynağı yerinde kalır.

import { tabSummary } from '../game/tabSummary.js';
import { EQUIPMENT, RESOURCES } from '../game/econ/defs.js';
import { consumerStability } from '../game/econ/industry.js';
import { formatPopulation } from '../game/economy.js';
import { resourceArt } from './icons/art.js';
import { CURRENCY, spark } from './kit.js';
import { refreshTooltipsWithin } from './tooltip.js';

/** Tooltip sağlayıcısı (tooltipData 'tab') son hesaplanan özeti okur. */
let latest = null;

const weeks = (w) => (w == null ? '—' : w < 100 ? `${w}w` : `${Math.round(w / 52)}y`);
const percent = (share) => `${Math.round((share ?? 0) * 100)}%`;
// İlerleyen iş: geniş ekranda ad + kalan hafta (yüzde dolgunun kendisidir),
// dar ekranda ad yok, yüzde metne döner ("50% · 31w").
const progress = (share, w) => `${percent(share)} · ${weeks(w)}`;
const minus = (text) => text.replace('-', '−');

/**
 * IC tutarı: 12.4 · 140 · 1.2K — yuvaya sığacak kadar kısa. Yuvada birim
 * yazılmaz (yer yok); kart satırları `unit` ile "IC" ekler.
 */
function amount(value, { sign = false, unit = false } = {}) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const body = abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M`
    : abs >= 1e3 ? `${(abs / 1e3).toFixed(1)}K`
      : abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  const tail = unit ? ` ${CURRENCY.unit}` : '';
  if (sign) return `${n < 0 ? '−' : '+'}${body}${tail}`;
  return `${n < 0 ? '−' : ''}${body}${tail}`;
}

/** Fon izinin baştan sona değişimi; iz kısaysa null. */
function fundChange(history) {
  return history?.length >= 2 ? history[history.length - 1] - history[0] : null;
}

/** Faturaların ödenen payı 1'in altındaysa ikmal krizi (econ/bills.inSupplyCrisis eşiği). */
const inCrisis = (x) => (x.supplyShare ?? 1) < 1 - 1e-6;

const toneOf = (value, eps = 0.05) => (value > eps ? 'pos' : value < -eps ? 'neg' : '');

/**
 * Bir sekmenin yuvası. Geniş ekranda (≥1900 px) `name` + `value`; dar ekranda
 * ad sığmaz, yerine `short` yazılır (yoksa `value`). Uyarı durumunda dar metin
 * etiketini de taşır ("Crisis 60%") ve `alert` iz/ikonu ona bırakır:
 * etiketsiz "60%" krizi söylemiyordu (ölçüldü: eski iflas yuvası 1600, 1366
 * ve 1280'de etiketsiz kalıyordu). `fill` 0..1; `kind` 'progress' (ilerleyen
 * iş, yeşil) ya da 'gauge' (gösterge, pirinç); `lead` iz ya da ikon.
 */
export function cellFor(id, s) {
  const x = s?.[id];
  if (!x) return { name: '', value: '—', fill: 0, kind: 'gauge', tone: '' };
  switch (id) {
    case 'construction': {
      // KALKINMA: fon sıradaki kademeye biriktirir, bedele yetince kademe
      // kendiliğinden alınır (econ/investment.js). Dolgu fonun bedele oranı,
      // değer kalan hafta: sekmenin "araştırma çubuğu" sıradaki kademedir.
      if (x.next) {
        if (x.next.weeksLeft == null) {
          // Fona hiçbir şey akmıyor (faturalar, ordu ve halk çıktının
          // tamamını alıyor): kalan hafta yok, birikim durmuş — sarı.
          return {
            name: `Saving: ${x.next.name}`, value: `${amount(Math.max(0, x.fund))}/${amount(x.next.cost)}`,
            short: `Saving ${percent(x.next.progress)}`, fill: x.next.progress, kind: 'progress', tone: 'warn',
          };
        }
        return {
          name: x.next.name, value: weeks(x.next.weeksLeft), short: progress(x.next.progress, x.next.weeksLeft),
          fill: x.next.progress, kind: 'progress',
          // Kereste açığı yatırımın verimini düşürür: dolgu sarı yanar.
          tone: x.timber < 0.95 ? 'warn' : '',
        };
      }
      // Hedef yoksa her state tavanda (ya da denetim dışında): yatırım halka döner.
      return {
        name: 'At the cap', value: `cap ${x.developmentCap}`, short: 'At the cap',
        fill: 1, kind: 'progress', tone: '',
      };
    }
    case 'industry': {
      if (x.short) {
        const eta = x.short.etaWeeks != null ? `~${weeks(x.short.etaWeeks)}` : null;
        return {
          name: `Short: ${x.short.name}`, value: eta ?? 'no line', short: eta ? `Short ${eta}` : 'Short',
          fill: x.short.required > 0 ? x.short.stock / x.short.required : 0, kind: 'gauge',
          tone: eta ? 'warn' : 'neg', alert: true,
        };
      }
      return {
        name: 'Consumer goods', value: percent(x.consumer),
        fill: Math.min(1, x.consumer), kind: 'gauge', tone: x.consumer < 0.95 ? 'neg' : '',
      };
    }
    case 'trade': {
      const lead = `<span class="tl-ex">${x.topExport ? resourceArt(x.topExport.id, 'xs') : ''}</span>`
        + `<span class="tl-im">${x.topImport ? resourceArt(x.topImport.id, 'xs') : ''}</span>`;
      const leadKey = `${x.topExport?.id ?? ''}|${x.topImport?.id ?? ''}`;
      if (x.blockade >= 0.1) {
        return {
          name: 'Blockade', value: percent(x.blockade), short: `Blockade ${percent(x.blockade)}`,
          fill: x.blockade, kind: 'gauge', tone: 'neg', alert: true, lead, leadKey,
        };
      }
      return {
        name: 'Balance', value: amount(x.balance, { sign: true }), fill: 0, kind: 'gauge',
        tone: x.dependency ? 'warn' : toneOf(x.balance), lead, leadKey,
      };
    }
    case 'budget': {
      // EKONOMİ: değer haftalık çıktı, iz fonun son yılı, dolgu faturaların
      // tavanı ne kadar doldurduğu — 1'e varınca ikmal krizi başlar.
      const history = x.history ?? [];
      const change = fundChange(history);
      const trend = change == null ? '' : change >= 0 ? 'up' : 'down';
      const lead = history.length >= 2
        ? spark(history, { width: 40, height: 12, cls: `mini tl-spark ${trend}`, zero: false })
        : '<svg class="k-spark mini tl-spark" viewBox="0 0 40 12" preserveAspectRatio="none"><polyline points="0,6 40,6"/></svg>';
      // İz her hafta değişir; anahtar dizinin kendisi.
      const leadKey = `${history.length}:${history[history.length - 1] ?? ''}:${history[0] ?? ''}`;
      const load = x.room > 0 ? Math.min(1, x.owed / x.room) : 0;
      if (inCrisis(x)) {
        return {
          name: 'Supply crisis', value: `${percent(x.supplyShare)} paid`, short: `Crisis ${percent(x.supplyShare)}`,
          fill: 1, kind: 'gauge', tone: 'neg', alert: true, lead, leadKey,
        };
      }
      return {
        name: 'Output', value: `${amount(x.output)}/wk`, short: amount(x.output),
        // Halkın doyması Factories sekmesinin yuvasında; burada yalnız tavan.
        fill: load, kind: 'gauge', tone: load > 0.85 ? 'warn' : '', lead, leadKey,
      };
    }
    case 'military': {
      if (x.mobilization && x.mobilization.conscripts < x.mobilization.target) {
        const share = x.mobilization.target > 0 ? x.mobilization.conscripts / x.mobilization.target : 1;
        const count = `${x.mobilization.conscripts}/${x.mobilization.target}`;
        return { name: 'Mobilizing', value: count, short: `Mob. ${count}`, fill: share, kind: 'progress', tone: 'warn', alert: true };
      }
      if (x.training) {
        return {
          name: x.training.name, value: weeks(x.training.left), short: progress(x.training.share, x.training.left),
          fill: x.training.share, kind: 'progress', tone: '',
        };
      }
      if (!x.divisions) return { name: 'No army', value: '—', short: 'No army', fill: 0, kind: 'gauge', tone: x.wars ? 'neg' : '' };
      return {
        name: `${x.regiments} regiment${x.regiments === 1 ? '' : 's'}`, value: `STR ${percent(x.strength)}`,
        fill: x.strength, kind: 'gauge', tone: x.strength < 0.7 ? 'warn' : '',
      };
    }
    case 'population': {
      const yearly = minus(`${x.growth >= 0 ? '+' : ''}${(x.growth * 52 * 100).toFixed(2)}%/yr`);
      // Ad değerin adıdır: "Literacy 26% +0.82%/yr" okuryazarlık artıyor diye
      // okunuyordu. Okuryazarlık kartta.
      return {
        name: x.famine ? 'Famine' : x.war ? 'Growth · war' : 'Growth', value: yearly,
        fill: 0, kind: 'gauge', tone: x.famine || x.growth < 0 ? 'neg' : x.war ? 'warn' : '',
      };
    }
    case 'cultures': {
      // Bir puanın altındaki hareket gürültüdür; o zaman ulusal huzursuzluk.
      if (x.movement && x.movement.progress >= 1) {
        const m = x.movement;
        return {
          name: m.name, value: `${Math.round(m.progress)}%${m.eta != null && m.eta < 100 ? ` · ${m.eta}w` : ''}`,
          fill: m.progress / 100, kind: 'progress',
          tone: m.stageIndex >= 3 ? 'neg' : m.stageIndex >= 2 ? 'warn' : '',
        };
      }
      return {
        name: x.boiling ? 'Revolt risk' : 'Unrest', value: `${x.unrest.toFixed(1)} / 10`,
        fill: x.unrest / 10, kind: 'gauge', tone: x.unrest >= 7 || x.boiling ? 'neg' : x.unrest >= 4 ? 'warn' : '',
      };
    }
    case 'politics': {
      if (x.agenda) {
        return {
          name: x.agenda.name, value: weeks(x.agenda.weeksLeft), short: progress(x.agenda.progress, x.agenda.weeksLeft),
          fill: x.agenda.progress, kind: 'progress', tone: '',
        };
      }
      if (x.waiting) {
        return { name: 'Choose an agenda', value: `${x.waiting} ready`, short: `Choose (${x.waiting})`, fill: 0, kind: 'progress', tone: 'warn', alert: true };
      }
      return { name: x.party.name, value: x.decisions ? `${x.decisions} dec.` : '—', fill: 0, kind: 'progress', tone: '' };
    }
    case 'technology': {
      if (x.tech) {
        return {
          name: x.tech.name, value: weeks(x.tech.weeksLeft), short: progress(x.tech.progress, x.tech.weeksLeft),
          fill: x.tech.progress, kind: 'progress', tone: '',
        };
      }
      if (x.done >= x.total) return { name: 'All researched', value: '✓', short: 'All done', fill: 1, kind: 'progress', tone: 'pos' };
      // Sıradaki teknoloji AUTO'dan bağımsız gelecek hafta başlar (runResearch).
      if (x.next) return { name: x.next, value: 'queued', short: 'Queued', fill: 0, kind: 'progress', tone: '' };
      return {
        name: x.auto ? 'Choosing…' : 'Pick research', value: x.auto ? '—' : 'idle', short: x.auto ? '—' : 'Pick tech',
        fill: 0, kind: 'progress', tone: x.auto ? '' : 'warn', alert: !x.auto,
      };
    }
    case 'chronicle': {
      if (!x.rank) return { name: 'Rank', value: '—', fill: 0, kind: 'gauge', tone: '' };
      return {
        name: 'Rank', value: `#${x.rank} / ${x.of}`,
        fill: x.leader?.score > 0 ? x.score / x.leader.score : 0, kind: 'gauge', tone: x.rank <= 3 ? 'pos' : '',
      };
    }
    default:
      return { name: '', value: '—', fill: 0, kind: 'gauge', tone: '' };
  }
}

/**
 * Sekme kartının canlı satırları (tooltipData 'tab'). Yuvanın söylediğinin
 * nedeni ve yuvaya sığmayanlar burada: ad, ölçü, eşik, sıradaki iş.
 */
export function tabLedgerTip(id, s = latest) {
  const x = s?.[id];
  if (!x) return null;
  const cell = cellFor(id, s);
  const rows = [];
  const row = (label, value, tone = '') => rows.push({ label, value, tone });
  switch (id) {
    case 'construction':
      if (x.next) {
        row(`Next: ${x.next.province} → level ${x.next.level}`,
          `${amount(Math.max(0, x.fund), { unit: true })} of ${amount(x.next.cost, { unit: true })}${x.next.weeksLeft != null ? ` · ${weeks(x.next.weeksLeft)}` : ''}`);
      } else {
        row('Next level', 'none — every state is at the cap or not under control');
      }
      row('Invested a week', x.invest > 0.01 ? amount(x.invest, { sign: true, unit: true }) : 'nothing — bills, army and people take it all',
        x.invest > 0.01 ? 'pos' : 'warn');
      row('Development fund', `${amount(x.fund, { unit: true })} · floor ${amount(x.floor, { unit: true })}`, x.fund < 0 ? 'warn' : '');
      row('Development cap', `${x.developmentCap}`);
      if (x.timber < 0.95) row('Timber', `${percent(x.timber)} — investment slowed`, 'warn');
      if (x.lastAuto) row('Last AUTO order', `${x.lastAuto.text}${x.lastAuto.ago ? ` (${x.lastAuto.ago}w ago)` : ''}`);
      break;
    case 'industry': {
      const stab = consumerStability(x.consumer);
      row('Consumer goods', `${percent(x.consumer)} · ${minus(`${stab >= 0 ? '+' : ''}${Math.round(stab * 100)}`)} stability`, x.consumer < 0.95 ? 'neg' : '');
      row('Industry', `${x.ic.toFixed(1)} IC · the army may draw ${x.military.toFixed(1)}`);
      if (x.topLine) row('Top production line', `${EQUIPMENT[x.topLine.id]?.name ?? x.topLine.id} +${x.topLine.output.toFixed(1)}/wk`);
      else row('Production lines', `stopped · ${x.idle.toFixed(1)} IC back to the people and development`);
      if (x.short) {
        row(`Short: ${x.short.name}`, `${Math.round(x.short.stock)} / ${Math.round(x.short.required)}${x.short.etaWeeks != null ? ` · ~${weeks(x.short.etaWeeks)}` : ' · no line making it'}`, cell.tone);
      }
      break;
    }
    case 'trade':
      row('Exports', amount(x.exports, { sign: true, unit: true }), x.exports > 0 ? 'pos' : '');
      row('Imports', amount(x.imports, { sign: true, unit: true }), x.imports < 0 ? 'neg' : '');
      row('Top export', x.topExport ? `${RESOURCES[x.topExport.id]?.name ?? x.topExport.id} ▲${x.topExport.amount.toFixed(1)}` : 'none');
      row('Top import', x.topImport ? `${RESOURCES[x.topImport.id]?.name ?? x.topImport.id} ▼${x.topImport.amount.toFixed(1)}` : 'none');
      if (x.dependency) {
        row('Dependency', `${RESOURCES[x.dependency.id]?.name ?? x.dependency.id} ${percent(x.dependency.share)}${x.dependency.partner ? ` from ${x.dependency.partner}` : ''}`, 'warn');
      }
      if (x.blockade > 0) row('Blockade', `${percent(x.blockade)} of sea trade cut`, 'neg');
      if (x.embargoes) row('Embargoes', String(x.embargoes));
      break;
    case 'budget': {
      // Çubuğun dört payı (economy.alloc) ve fonun izi; pay çıktıya oranla.
      const share = (v) => (x.output > 0 ? percent(v / x.output) : '—');
      const change = fundChange(x.history);
      row('Output', `${amount(x.output, { unit: true })} a week`);
      row('Bills', `${amount(x.bills, { unit: true })} · ${share(x.bills)} · ceiling ${amount(x.room, { unit: true })}`,
        inCrisis(x) ? 'neg' : x.room > 0 && x.owed / x.room > 0.85 ? 'warn' : '');
      if (inCrisis(x)) row('Supply crisis', `only ${percent(x.supplyShare)} paid — reinforcement, training and organisation slowed`, 'neg');
      row('Army lines', `${amount(x.army, { unit: true })} · ${share(x.army)}`);
      row('People', `${amount(x.people, { unit: true })} · fed ×${(x.feed ?? 1).toFixed(2)}${x.feedAuto ? ' (AUTO)' : ''} · ${percent(x.consumer)} of need`,
        x.consumer < 0.95 ? 'neg' : '');
      row('Development', `${amount(x.invest, { unit: true })} · ${share(x.invest)}`, x.invest > 0.01 ? 'pos' : 'warn');
      if (change != null) row(`Fund over ${x.weeks} weeks`, amount(change, { sign: true, unit: true }), toneOf(change, 0.5));
      row('Development fund', `${amount(x.fund, { unit: true })} · floor ${amount(x.floor, { unit: true })}`, x.fund < 0 ? 'warn' : '');
      if (Math.abs(x.treaty) > 0.05) row(x.treaty > 0 ? 'Tribute received' : 'Reparations paid', amount(x.treaty, { sign: true, unit: true }), toneOf(x.treaty));
      break;
    }
    case 'military':
      if (x.mobilization) row('Mobilization', `${x.mobilization.conscripts} / ${x.mobilization.target} conscript regiments`, 'warn');
      row('Training', x.training ? `${x.training.name} · ${progress(x.training.share, x.training.left)}` : 'nothing in training');
      row('Queue', `${x.queue} order${x.queue === 1 ? '' : 's'} · ${x.capacity} slots${x.stalled ? ` · ${x.stalled} waiting for room` : ''}${x.frozen ? ` · ${x.frozen} frozen by treaty` : ''}`, x.stalled || x.frozen ? 'warn' : '');
      row('Army', `${x.divisions} division${x.divisions === 1 ? '' : 's'} · ${x.regiments} regiments`);
      row('Strength · organization', `${percent(x.strength)} · ${Math.round(x.organization ?? 0)}%`, x.strength < 0.7 ? 'warn' : '');
      if (x.inBattle) row('In battle', `${x.inBattle} division${x.inBattle === 1 ? '' : 's'}`, 'neg');
      if (x.fleet) row('Fleet', `${x.fleet} ship${x.fleet === 1 ? '' : 's'}`);
      if (x.unassigned) row('Without a commander', String(x.unassigned), 'warn');
      break;
    case 'population': {
      row('Growth', `${minus(`${x.growth >= 0 ? '+' : ''}${(x.growth * 52 * 100).toFixed(2)}`)}% a year${x.war ? ' · slowed by war' : ''}`, cell.tone);
      if (x.week != null) row('Last week', `${x.week >= 0 ? '+' : '−'}${formatPopulation(Math.abs(x.week))}`);
      row('Literacy', `${percent(x.literacy)} → ${percent(x.literacyTarget)}`);
      const u = x.unification;
      if (u.total) row(`${u.culture} homeland`, u.formed != null ? 'proclaimed' : `${u.owned} / ${u.total} provinces`);
      if (x.kinAbroad > 0.005) row('Kin under foreign rule', percent(x.kinAbroad));
      break;
    }
    case 'cultures':
      if (x.movement) {
        const m = x.movement;
        row(`${m.name}: ${m.stage}`, `${Math.round(m.progress)}%${m.eta != null ? ` · ~${weeks(m.eta)} to revolt` : m.trend < 0 ? ' · fading' : ''}`, cell.tone);
        if (m.martialLeft) row('Martial law', `${m.martialLeft}w left`);
      }
      row('National movements', String(x.movements));
      row('Unrest', `${x.unrest.toFixed(1)} / 10${x.boiling ? ` · ${x.boiling} state${x.boiling === 1 ? '' : 's'} at revolt level` : ''}`, x.boiling ? 'neg' : x.unrest >= 4 ? 'warn' : '');
      row('Full citizens', percent(x.citizens));
      break;
    case 'politics':
      if (x.agenda) row(`Agenda: ${x.agenda.name}`, progress(x.agenda.progress, x.agenda.weeksLeft));
      else if (x.waiting) row('Agenda', `waiting for your choice · ${x.waiting} offered`, 'warn');
      row('Ruling party', x.party.name);
      row('Government', x.government);
      if (x.legitimacy.gap > 0.5) row('The people want', `${x.legitimacy.leader} · gap ${Math.round(x.legitimacy.gap)}`, 'warn');
      row('Decisions ready', String(x.decisions));
      if (x.election != null) row('Next election', `in ${weeks(x.election)}`);
      break;
    case 'technology':
      if (x.tech) {
        row(`Researching: ${x.tech.name}`, `${Math.floor(x.tech.points)} / ${x.tech.cost} RP · ${weeks(x.tech.weeksLeft)}`);
        if (x.tech.first) row('First in the world', 'no nation has it yet', 'pos');
        if (x.tech.earlyYears > 0) row('Researched early', `${x.tech.earlyYears} yr ahead of its time`, 'warn');
      } else if (x.done >= x.total) {
        row('Researching', 'nothing left — the tree is complete', 'pos');
      } else if (x.next) {
        row('Researching', `${x.next} starts next week`);
      } else {
        row('Researching', x.auto ? 'the cabinet picks next week' : 'nothing — pick a technology', x.auto ? '' : 'warn');
      }
      row('Speed', `${x.rate.toFixed(2)} RP a week`);
      row('Technologies', `${x.done} / ${x.total}`);
      if (x.queue) row('Queue', `${x.queue}${x.next ? ` · next ${x.next}` : ''}`);
      break;
    case 'chronicle':
      if (x.rank) {
        row('Rank', `${x.rank} of ${x.of}`, cell.tone);
        row('Score', x.leader && !x.leader.me ? `${x.score} · leader ${x.leader.name} ${x.leader.score}` : `${x.score} · you lead`);
        const points = (n) => `${n} point${n === 1 ? '' : 's'}`;
        if (x.above) row(`To pass ${x.above.name}`, points(x.above.gap));
        if (x.below) row(`Ahead of ${x.below.name}`, points(x.below.gap));
      }
      row('Campaign', `${percent(x.era)} · ${x.yearsLeft} years to ${x.endYear}`);
      if (x.latest) row(`Latest (${x.latest.year})`, x.latest.title);
      break;
    default:
      break;
  }
  return { value: cell.short ?? cell.value, rows };
}

/**
 * Sekmelere yuva takar ve tazelemeyi seyreltir. Canlı oyunda hafta kapanışı
 * 5 ms'lik dilimlerle birçok kareye yayılır (turn.js pumpTurn) ve her dilim
 * YZ uluslarının olaylarını yayar: kare başına toplamak yetmiyordu (ölçüldü,
 * 8x: haftada 10.8 tazeleme, üçte ikisi ekranda hiçbir şeyi değiştirmiyor).
 * Kapanış sürerken gelen olaylar beklenir; iş bitince yayılan 'turn' tek tam
 * tazeleme yapar (turnJob, 'turn' olayından önce temizlenir). Duraklatılmış
 * oyunda oyuncunun eylemi hemen yansır.
 */
export class TabLedger {
  constructor(game) {
    this.game = game;
    this.handle = 0;
    this.cells = new Map();
    this.bar = document.getElementById('tab-bar');
    this.mount();
    // 'construction' olayı artık yayılmaz: kalkınma 'economy' ile tazelenir.
    for (const event of [
      'turn', 'economy', 'politics', 'provinces', 'units', 'battles',
      'delegation', 'peace', 'diplomacy', 'world',
    ]) {
      game.on(event, () => {
        if (game.turns?.turnJob) return;
        this.schedule();
      });
    }
    this.schedule();
  }

  mount() {
    for (const btn of document.querySelectorAll('#tab-bar [data-screen]')) {
      // Glif + ad tek başlık kutusunda: iki satırlı ızgarada ortalı grup ve
      // sekme genişliği = max(başlık, yuva). Glifi screens.js takar.
      if (!btn.querySelector('.tab-head')) {
        const head = document.createElement('span');
        head.className = 'tab-head';
        for (const child of [...btn.children]) {
          if (child.matches('.tab-ico, b')) head.append(child);
        }
        btn.prepend(head);
      }
      let led = btn.querySelector('.tab-led');
      if (!led) {
        // Erişilebilir ad sekmenin adıdır; canlı satır tooltip'te okunur.
        btn.insertAdjacentHTML('beforeend', `<span class="tab-led" aria-hidden="true">
          <i class="tl-fill"></i><span class="tl-lead"></span><span class="tl-name"></span><span class="tl-val"><span class="tl-w">—</span><span class="tl-c">—</span></span></span>`);
        led = btn.querySelector('.tab-led');
      }
      led.dataset.tab = btn.dataset.screen;
      this.cells.set(btn.dataset.screen, {
        led,
        fill: led.querySelector('.tl-fill'),
        lead: led.querySelector('.tl-lead'),
        name: led.querySelector('.tl-name'),
        wide: led.querySelector('.tl-w'),
        compact: led.querySelector('.tl-c'),
        state: {},
      });
    }
  }

  schedule() {
    if (this.handle) return;
    this.handle = requestAnimationFrame(() => {
      this.handle = 0;
      this.sync();
    });
  }

  sync() {
    const t0 = performance.now();
    const game = this.game;
    const me = game.world?.nations?.[game.turns?.playerNation];
    latest = me ? tabSummary(game, me) : null;
    for (const [id, cell] of this.cells) this.write(cell, cellFor(id, latest));
    // Açık sekme kartı kalıcı düğmeye bağlıdır; içeriği yerinde tazelenir.
    if (this.bar) refreshTooltipsWithin(this.bar);
    game.perf?.add('ui.tabs', performance.now() - t0);
  }

  write(cell, next) {
    const prev = cell.state;
    const short = next.short ?? next.value;
    if (prev.value !== next.value) cell.wide.textContent = next.value;
    if (prev.short !== short) cell.compact.textContent = short;
    if (prev.name !== next.name) cell.name.textContent = next.name;
    const cls = `tab-led is-${next.kind}${next.tone ? ` tone-${next.tone}` : ''}${next.lead ? ' has-lead' : ''}${next.alert ? ' is-alert' : ''}`;
    if (prev.cls !== cls) cell.led.className = cls;
    // Dolgu ölçekle çizilir: genişlik değişimi yerleşimi tetiklemez.
    const fill = Math.max(0, Math.min(1, Number.isFinite(next.fill) ? next.fill : 0)).toFixed(3);
    if (prev.fill !== fill) cell.fill.style.transform = `scaleX(${fill})`;
    const leadKey = next.lead ? next.leadKey ?? next.lead : '';
    if (prev.leadKey !== leadKey) cell.lead.innerHTML = next.lead ?? '';
    cell.state = { value: next.value, short, name: next.name, cls, fill, leadKey };
  }
}
