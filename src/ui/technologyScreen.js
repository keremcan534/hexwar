// Teknoloji ekrani: ZAMAN CIZELGELI AGAC (2026-10-08 yeniden yapim).
//
// Bes kategori yatay serit, her klasor bir satir; teknoloji kendi aktivasyon
// yilina yerlesir. Agacin fikri dogruydu, okunusu degildi (Kerem: "kullanici
// dostu bir sey olsun, havali hissiyat"): 30px'lik dugumde ad kesiliyor,
// teknolojinin NE yaptigi ancak uzerine gelince gorunuyor, "bitti / arastirilir
// / kilitli / erken" ayni gri kutuydu, tik-shift-sag tik gizli kuraldi.
//
// Simdi:
//   - DUGUM: ad + ANA ETKI ("+10% Construction"), durumuna gore bes ayri gorunus
//     (bitti altin ✓, arastiriliyor parlak + dolan cubuk, acik parlak cerceve,
//     kilitli soluk + kilit, erken taramali + "+18% early").
//   - MASA: yurutulen teknoloji, hiz, okuryazarlik, toplam; kuyruk her
//     teknolojinin BITIS TARIHIYLE ("~Mar 1839").
//   - INCELEME: etkiler satir satir, fiyat dokumu (taban × kademe × cag ×
//     erken − komsu indirimi; technology.techCostFactors), sure, kilitliyse
//     YOL (once ne arastirilmali, toplam bedel/sure), kisayollu dugmeler.
//   - KLAVYE (screens.handleKey → techKey): oklar agacta gezer, Enter
//     arastirir, Q kuyruga ekler/cikarir, [ ] yakinlastirir.
//
// Katman notu: saf gorunum. Simulasyonu okur, YAZMAZ — eylemler `data-*`
// olarak isaretlenir, isleyicileri screens.js baglar.

import { emblemArt } from './icons/art.js';
import {
  TECH_CATEGORIES, TECH_FOLDERS, TECHNOLOGIES, canResearch, hasTech, researchPath, techById,
  techCostFactors,
} from '../game/technology.js';
import { describeEffects, mod } from '../game/modifiers.js';
import { isDelegated } from '../game/delegation.js';
import { badge, chain, kpi, kpiRow, num, tipAttr } from './kit.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const START_YEAR = 1836;
const END_YEAR = 1900;
/** Yil basina piksel ve dugum eni birlikte secildi: 1920'de %90 agac sigar. */
const PX_PER_YEAR = 15;
const NODE_W = 160;
/** Ayni klasorde iki teknoloji yillari yakinsa ust uste binmesin. */
const NODE_GAP = 6;

const CATEGORY_ORDER = ['industry', 'infrastructure', 'army', 'navy', 'society'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Yakinlastirma kademeleri; [ ] ve Ctrl+tekerlek gezer. */
export const TECH_ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5];

/**
 * Klavye gezintisinin izgarasi: satirlar (kategori × klasor) ve her satirda
 * teknolojiler yil sirasiyla. Ekran ve techKey ayni diziyi okur.
 */
export function techGrid() {
  const rows = [];
  for (const categoryId of CATEGORY_ORDER) {
    const folders = TECHNOLOGIES[categoryId];
    if (!folders) continue;
    for (const folder of TECH_FOLDERS[categoryId] ?? []) {
      const list = folders[folder] ?? [];
      if (list.length) rows.push(list.map((tech) => ({ id: tech.id, year: tech.year ?? START_YEAR })));
    }
  }
  return rows;
}

function layoutRow(list) {
  let edge = -Infinity;
  return list.map((tech) => {
    const want = ((tech.year ?? START_YEAR) - START_YEAR) * PX_PER_YEAR;
    const x = Math.max(want, edge + NODE_GAP);
    edge = x + NODE_W;
    return { tech, x };
  });
}

/**
 * "Neden bu hız?" dökümü: technology.researchPointsOf'un GERÇEK terimleri,
 * aynı sırayla (ekran formül kurmaz; terimleri okur).
 */
export function researchRateLines(nation) {
  const economy = nation.economy ?? {};
  const lit = Math.max(0, Math.min(1, economy.literacy ?? 0));
  const universities = economy.universities ?? 0;
  const bonus = mod(nation, 'research');
  return [
    'Base  =  +1.00',
    `Literacy ${(lit * 100).toFixed(0)}% × 6  =  +${(lit * 6).toFixed(2)}`,
    `Universities ${universities} × 0.3  =  +${(universities * 0.3).toFixed(2)}`,
    bonus ? `Technology, ministers, party  =  ×${(1 + bonus).toFixed(2)}` : null,
  ].filter(Boolean);
}

function stateOf(nation, research, tech) {
  if (hasTech(nation, tech.id)) return 'done';
  if (research.current === tech.id) return 'active';
  if (canResearch(nation, tech.id)) return 'open';
  return 'locked';
}

/** Oyun yili kesrinden "Mar 1839". */
function dateOf(yearExact) {
  const year = Math.floor(yearExact);
  return `${MONTHS[Math.min(11, Math.floor((yearExact - year) * 12))]} ${year}`;
}

const weeksLabel = (weeks) => (weeks == null ? '—' : weeks <= 0 ? 'this week' : `${weeks} wk`);

/**
 * Inceleme paneli. Ekran her hafta yeniden kurulur ama fare/klavye gezinirken
 * yalniz bu parca degisir (bkz. screens.inspectTech).
 * @param {object} view technologyScreen'in gorunum nesnesi (fiyat, hiz, yil)
 */
export function techInspector(nation, techId, view) {
  const entry = techId ? techById(techId) : null;
  const tech = entry?.tech;
  if (!tech) return '<p class="tq-empty">Point at a technology — or use the arrow keys — to see what it does.</p>';
  const research = nation.research ?? {};
  const state = stateOf(nation, research, tech);
  const queued = (research.queue ?? []).includes(tech.id);
  const category = TECH_CATEGORIES[entry.categoryId];
  const cost = view.costOf(tech.id);
  const factors = techCostFactors(tech.id, view.year);
  const discount = factors ? 1 - cost / Math.max(1, Math.round(factors.base * factors.level * factors.yearScale * factors.early)) : 0;
  const rate = Math.max(1e-6, view.rate);
  const left = state === 'active' ? Math.max(0, cost - (research.points ?? 0)) : cost;
  const statusBadge = {
    done: badge('researched', 'pos'), active: badge('researching', 'gold'),
    open: badge('available', 'pos'), locked: badge('locked', 'dim'),
  }[state];
  const early = factors && factors.earlyYears > 0 && state !== 'done';

  const effects = describeEffects(tech.effects).map((line) => {
    const [value, ...label] = line.split(' ');
    const signed = /^[+−]/.test(value);
    return `<div class="tq-eff"><b class="${value.startsWith('−') ? 'neg' : 'pos'}">${signed ? esc(value) : '◆'}</b><span>${esc(signed ? label.join(' ') : line)}</span></div>`;
  }).join('');

  const costChain = factors && state !== 'done' ? chain(
    { label: 'Base', value: factors.base, text: String(factors.base) },
    [
      { label: 'Tier', value: factors.level, tip: { text: 'Tier\nLater technologies in a line cost more.' } },
      { label: 'Era', value: factors.yearScale, tip: { text: 'Era\nThe later its year, the more it costs (+2% a year after 1836).' } },
      ...(early ? [{ label: `${factors.earlyYears} yr early`, value: factors.early, tip: { text: `Early research\n+6% for every year before ${tech.year} (at most 2.5×). Wait, and it gets cheaper.` } }] : []),
      ...(discount > 0.005 ? [{ label: 'Neighbours', value: 1 - discount, tip: { text: 'Diffusion\nNeighbours who already know it make it cheaper (up to −35%).' } }] : []),
    ],
    { label: 'RP', value: cost, text: String(cost), tone: early ? 'neg' : '' },
  ) : '';

  // Kilitliyse yol: once ne arastirilmali, toplam bedel ve sure.
  const path = state === 'locked' ? researchPath(nation, tech.id) : [];
  const pathCost = path.reduce((sum, id) => sum + view.costOf(id), 0);
  const pathHtml = path.length > 1 ? `<div class="tq-sec"><small>Path</small>
      <ol class="tq-path">${path.map((id) => `<li>${esc(techById(id)?.tech?.name ?? id)}<em>${view.costOf(id)} RP</em></li>`).join('')}</ol>
      <p class="tq-note">${path.length} steps · ${pathCost} RP · ≈ ${weeksLabel(Math.ceil(pathCost / rate))}. Research now queues the whole path.</p></div>` : '';

  const id = esc(tech.id);
  const actions = [];
  if (state !== 'done' && state !== 'active') {
    actions.push(`<button type="button" class="k-btn primary" data-tech-now="${id}">Research now<kbd>Enter</kbd></button>`);
    actions.push(queued
      ? `<button type="button" class="k-btn danger" data-tech-dequeue="${id}">Remove from queue<kbd>Q</kbd></button>`
      : `<button type="button" class="k-btn" data-tech-queue="${id}">Add to queue<kbd>Q</kbd></button>`);
  }

  return `<div class="tq-head">
      <span class="tq-art">${emblemArt(category.id, 'lg')}</span>
      <div><small>${esc(category.name)} · ${esc(entry.folder)}</small><h3>${esc(tech.name)}</h3>
        <span class="tq-meta">${statusBadge}<b>${tech.year}</b>${early ? `<em class="early">${factors.earlyYears} years early</em>` : ''}</span></div>
    </div>
    ${tech.desc ? `<p class="tq-desc">${esc(tech.desc)}</p>` : ''}
    <div class="tq-sec"><small>Effects</small>${effects || '<p class="tq-note">No direct effect.</p>'}</div>
    ${costChain ? `<div class="tq-sec"><small>Cost</small>${costChain}
      <p class="tq-note">≈ ${weeksLabel(Math.ceil(left / rate))} at ${num(view.rate, 2)} RP a week${state === 'active' ? ` · ${Math.floor(research.points ?? 0)} / ${cost} done` : ''}</p></div>` : ''}
    ${pathHtml}
    ${actions.length ? `<div class="tq-actions">${actions.join('')}</div>` : ''}`;
}

/**
 * @param {object} nation
 * @param {object} view { year, yearExact, rate, rateLines, costOf, rank, of, inspect, zoom }
 */
export function technologyScreen(nation, view) {
  const research = nation.research ?? { points: 0, current: null, done: [], queue: [] };
  const queue = research.queue ?? [];
  const costOf = view.costOf;
  const zoom = TECH_ZOOMS.includes(view.zoom) ? view.zoom : 1;
  const inspect = view.inspect ?? research.current ?? queue[0] ?? null;
  const rate = Math.max(1e-6, view.rate);

  // --- Masa: yurutulen teknoloji ve hiz -------------------------------
  const currentEntry = research.current ? techById(research.current) : null;
  const current = currentEntry?.tech ?? null;
  const cost = current ? costOf(current.id) : 0;
  const progress = current && cost > 0 ? Math.min(1, (research.points ?? 0) / cost) : 0;
  const weeksNow = current ? Math.max(0, Math.ceil((cost - (research.points ?? 0)) / rate)) : null;
  const total = Object.values(TECHNOLOGIES).reduce(
    (sum, folders) => sum + Object.values(folders).reduce((s, list) => s + list.length, 0), 0,
  );
  const done = (research.done ?? []).length;
  const kpis = kpiRow([
    kpi({
      icon: current ? emblemArt(currentEntry.categoryId, 'md') : emblemArt('society', 'md'),
      label: 'Researching', value: current ? esc(current.name) : 'Nothing',
      sub: current ? `${Math.floor(research.points ?? 0)} / ${cost} RP · done ${dateOf(view.yearExact + weeksNow * 7 / 365)}` : 'pick a technology in the tree',
      meter: progress, meterTone: 'pos', cls: 'hero tech-now-kpi',
    }),
    kpi({ label: 'Per week', value: `${num(view.rate, 2)} RP`, sub: 'literacy is the main source', tip: { text: ['Research points a week', ...view.rateLines].join('\n') } }),
    kpi({ icon: emblemArt('society', 'md'), label: 'Literacy', value: `${Math.round((nation.economy?.literacy ?? 0) * 100)}%`, sub: 'education law and universities', tip: 'term', arg: 'literacy' }),
    kpi({ label: 'Technologies', value: `${done}<small> / ${total}</small>`, sub: view.rank ? `rank ${view.rank} of ${view.of}` : '', meter: total ? done / total : 0 }),
  ]);

  // --- Kuyruk: bitis tarihleriyle ---------------------------------------
  let cursor = weeksNow ?? 0;
  const plates = queue.map((id, index) => {
    const entry = techById(id);
    if (!entry) return '';
    cursor += Math.ceil(costOf(id) / rate);
    return `<li class="tq-plate"><button type="button" data-dequeue="${esc(id)}" data-tech-inspect="${esc(id)}"${tipAttr({ text: `${entry.tech.name}\nDone around ${dateOf(view.yearExact + cursor * 7 / 365)}.\nClick to remove from the queue.` })}>
      <em>${index + 1}</em>${emblemArt(entry.categoryId, 'xs')}<b>${esc(entry.tech.name)}</b><small>~${dateOf(view.yearExact + cursor * 7 / 365)}</small><i aria-hidden="true">×</i></button></li>`;
  }).join('');
  const zoomIndex = TECH_ZOOMS.indexOf(zoom);
  const queueRow = `<div class="tq-queue">
    <span class="tq-queue-label">Queue</span>
    ${plates ? `<ol>${plates}</ol>` : `<span class="tq-queue-empty">${isDelegated(nation, 'research')
    ? 'Empty — the academy picks the next technology (AUTO).'
    : 'Empty — research waits for your choice; points keep banking.'}</span>`}
    <span class="tq-zoom" role="group" aria-label="Zoom">
      <button type="button" class="k-btn sm" data-tech-zoom="-1" aria-label="Zoom out" ${zoomIndex <= 0 ? 'disabled' : ''}>−</button>
      <button type="button" class="k-btn sm tech-zoom-level" data-tech-zoom="0" aria-label="Reset zoom">${Math.round(zoom * 100)}%</button>
      <button type="button" class="k-btn sm" data-tech-zoom="1" aria-label="Zoom in" ${zoomIndex >= TECH_ZOOMS.length - 1 ? 'disabled' : ''}>+</button>
    </span>
  </div>`;

  // --- Agac -------------------------------------------------------------
  let width = (END_YEAR - START_YEAR) * PX_PER_YEAR;
  const bands = CATEGORY_ORDER.filter((id) => TECHNOLOGIES[id]).map((categoryId) => {
    const category = TECH_CATEGORIES[categoryId];
    const folders = TECHNOLOGIES[categoryId];
    const all = Object.values(folders).flat();
    const have = all.filter((tech) => hasTech(nation, tech.id)).length;
    const folderRows = (TECH_FOLDERS[categoryId] ?? []).map((folder) => {
      const placed = layoutRow(folders[folder] ?? []);
      if (placed.length) width = Math.max(width, placed[placed.length - 1].x + NODE_W);
      const links = placed.slice(1).map((node, i) => {
        const prev = placed[i];
        const left = prev.x + NODE_W;
        const lit = hasTech(nation, prev.tech.id);
        return `<i class="tech-link${lit ? ' is-lit' : ''}" style="left:${left}px;width:${Math.max(0, node.x - left)}px"></i>`;
      }).join('');
      const nodes = placed.map(({ tech, x }) => {
        const state = stateOf(nation, research, tech);
        const queued = queue.indexOf(tech.id);
        const factors = techCostFactors(tech.id, view.year);
        const early = state !== 'done' && factors && factors.earlyYears > 0;
        const effect = describeEffects(tech.effects)[0] ?? '';
        const meta = state === 'done' ? `<span class="ok">✓ ${tech.year}</span>`
          : state === 'active' ? `${Math.round(progress * 100)}% · ${weeksLabel(weeksNow)}`
            : early ? `<span class="early">${tech.year} · +${Math.round((factors.early - 1) * 100)}% early</span>`
              : `${tech.year} · ${costOf(tech.id)} RP`;
        const bar = state === 'active' ? `<i class="tech-node-bar" style="width:${(progress * 100).toFixed(1)}%"></i>` : '';
        return `<button class="tech-node is-${state}${early ? ' is-early' : ''}${queued >= 0 ? ' is-queued' : ''}${tech.id === inspect ? ' is-inspected' : ''}"
          style="left:${x}px" data-tech="${esc(tech.id)}" data-cat="${categoryId}"
          aria-label="${esc(tech.name)}, ${tech.year}, ${state}">
          <b>${esc(tech.name)}</b><span class="tech-node-eff">${esc(effect)}</span><small>${meta}</small>${bar}
          ${state === 'locked' ? '<i class="tech-node-lock" aria-hidden="true"></i>' : ''}
          ${queued >= 0 ? `<em class="tech-node-q">${queued + 1}</em>` : ''}
        </button>`;
      }).join('');
      return `<div class="tech-row">
        <span class="tech-row-label">${esc(folder)}</span>
        <div class="tech-track">${links}${nodes}</div>
      </div>`;
    }).join('');
    return `<section class="tech-band" data-category="${categoryId}">
      <header class="tech-band-head">
        <span class="tech-row-label">${emblemArt(category.id)}<b>${esc(category.name)}</b>
          <em>${have}/${all.length}</em></span>
        <span class="tech-band-bar" aria-hidden="true"><i style="width:${all.length ? (have / all.length) * 100 : 0}%"></i></span>
      </header>
      ${folderRows}
    </section>`;
  }).join('');

  const ticks = [];
  for (let year = 1840; year <= END_YEAR; year += 10) {
    ticks.push(`<span style="left:${(year - START_YEAR) * PX_PER_YEAR}px">${year}</span>`);
  }
  const nowX = Math.max(0, (view.yearExact - START_YEAR) * PX_PER_YEAR);
  const legend = `<div class="tq-legend">
    <span><i class="lg done"></i>researched</span><span><i class="lg active"></i>researching</span>
    <span><i class="lg open"></i>available</span><span><i class="lg early"></i>early — costs more</span><span><i class="lg locked"></i>locked</span>
    <span class="tq-keys"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> research · <kbd>Q</kbd> queue · <kbd>[</kbd><kbd>]</kbd> zoom · <b>Shift+click</b> queue · <b>Right-click</b> remove</span>
  </div>`;

  return `<div class="tech-screen tq">
    ${kpis}
    ${queueRow}
    <div class="tech-body">
      <div class="tech-tree" style="--tree-w:${Math.ceil(width)}px;--node-w:${NODE_W}px;--now-x:${nowX.toFixed(1)}px">
        <div class="tech-tree-inner" style="zoom:${zoom}">
          <div class="tech-axis"><span class="tech-row-label"></span><div class="tech-axis-track">${ticks.join('')}
            <span class="tech-now-label" style="left:${nowX.toFixed(1)}px">${view.year}</span></div></div>
          <div class="tech-bands">${bands}<i class="tech-now" aria-hidden="true"></i><i class="tech-future" aria-hidden="true"></i></div>
        </div>
      </div>
      <aside class="tech-inspector tq-inspector" data-tech-inspector aria-live="polite">${techInspector(nation, inspect, view)}</aside>
    </div>
    ${legend}
  </div>`;
}
