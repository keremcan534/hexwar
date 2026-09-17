// Teknoloji ekrani: ZAMAN CIZELGELI AGAC.
//
// Bes kategori yatay serit, her klasor bir satir. Teknoloji kendi aktivasyon
// yilina yerlesir ve klasoru icinde cizgiyle bir sonrakine baglanir. Butun
// agac tek sayfada: eski ekran kategori sekmelerinin arkasinda bir seferde tek
// kategori gosteriyordu, "digerlerinde ne var" sorusu tik istiyordu. Etkiler
// dugumun ipucu kartinda (tooltipData 'tech'); tik arastirir, shift+tik
// kuyruga ekler.
//
// Katman notu: saf gorunum. Simulasyonu okur, YAZMAZ — eylemler `data-*`
// olarak isaretlenir, isleyicileri screens.js baglar.

import {
  TECH_CATEGORIES, TECH_FOLDERS, TECHNOLOGIES, canResearch, hasTech, techById,
} from '../game/technology.js';
import { lawModifiers } from '../game/politics.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const START_YEAR = 1836;
const END_YEAR = 1915;
/**
 * Yil basina piksel ve dugum eni birlikte secildi: 1600px ekranda agac yatay
 * kaydirmasiz sigar ve adlarin cogu kesilmez (118px ile yarisi kesiliyordu).
 */
const PX_PER_YEAR = 14;
const NODE_W = 140;
/** Ayni klasorde iki teknoloji yillari yakinsa ust uste binmesin. */
const NODE_GAP = 6;

const CATEGORY_ORDER = ['industry', 'army', 'navy', 'commerce', 'culture'];

/**
 * Satir yerlesimi: dugum yilinin yerine konur, onceki dugume binecekse saga
 * itilir. Yil eksenin kabaca dogru kalir, okunurluk bozulmaz (en yakin iki
 * teknoloji 2 yil arayla: 1900/1902).
 */
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
 * "Neden bu hiz?" dokumu: researchPointsOf'un GERCEK terimleri, ayni sirayla.
 * Basin ozgurlugu (anayasa yasasi) da carpandadir; eski dokum onu yazmiyordu
 * ve satirlarin toplami ekrandaki hizi tutmuyordu.
 */
export function researchRateLines(nation) {
  const economy = nation.economy ?? {};
  const lit = Math.max(0, Math.min(1, economy.literacy ?? 0));
  const population = Math.max(1, economy.population ?? 1);
  const middle = Math.max(0, Math.min(1, (economy.classes?.middle?.population ?? 0) / population));
  const clerks = lit >= 0.5 ? middle * 2 : 0;
  const tech = economy.techMods?.researchRate ?? 0;
  const press = lawModifiers(nation).researchRate ?? 0;
  return [
    `Literacy ${(lit * 100).toFixed(0)}% × 4  =  +${(lit * 4).toFixed(2)}`,
    `Middle class ${(middle * 100).toFixed(1)}% × 1.5  =  +${(middle * 1.5).toFixed(2)}`,
    lit >= 0.5 ? `Clerks (literacy ≥ 50%)  =  +${clerks.toFixed(2)}` : 'Clerks  =  +0.00 (needs literacy ≥ 50%)',
    'Base  =  +1.00',
    tech || press ? `Technology and press  =  ×${(1 + tech + press).toFixed(2)}` : null,
  ].filter(Boolean);
}

function stateOf(nation, research, tech) {
  if (hasTech(nation, tech.id)) return 'done';
  if (research.current === tech.id) return 'active';
  if (canResearch(nation, tech.id)) return 'open';
  return 'locked';
}

/**
 * @param {object} nation
 * @param {object} view { year, yearExact, rate, costOf, rank, of }
 */
export function technologyScreen(nation, view) {
  const research = nation.research ?? { points: 0, current: null, done: [], queue: [] };
  const queue = research.queue ?? [];
  const costOf = view.costOf;

  // --- Ozet: yurutulen teknoloji, ilerleme, hiz, okuryazarlik, konum ---
  const current = research.current ? techById(research.current)?.tech : null;
  const cost = current ? costOf(current.id) : 0;
  const progress = current && cost > 0 ? Math.min(1, research.points / cost) : 0;
  const weeks = current && view.rate > 0
    ? Math.max(0, Math.ceil((cost - research.points) / view.rate)) : null;
  const total = Object.values(TECHNOLOGIES).reduce(
    (sum, folders) => sum + Object.values(folders).reduce((s, list) => s + list.length, 0), 0,
  );
  const whyRate = esc(view.rateLines.join('\n'));

  const kpis = `<div class="ui-kpis tech-kpis">
    <div class="ui-kpi tech-kpi-now">
      <small>Researching</small>
      <b>${current ? esc(current.name) : 'Nothing'}</b>
      <span class="tech-kpi-bar" aria-hidden="true"><i style="width:${(progress * 100).toFixed(1)}%"></i></span>
      <span>${current
    ? `${Math.floor(research.points)} / ${cost} RP${weeks != null ? ` · ${weeks === 0 ? 'this week' : `${weeks} wk`}` : ''}`
    : 'click a technology below'}</span>
    </div>
    <div class="ui-kpi stat-why" role="button" tabindex="0" data-why="research" data-why-text="${whyRate}"
      data-tip="term" data-tip-arg="research"><small>Per week</small><b>${view.rate.toFixed(2)} RP</b>
      <span>click for the breakdown</span></div>
    <div class="ui-kpi" data-tip="term" data-tip-arg="literacy"><small>National literacy</small>
      <b>${Math.round((nation.economy?.literacy ?? 0) * 100)}%</b><span>the main source of points</span></div>
    <div class="ui-kpi"><small>Technologies</small><b>${(research.done ?? []).length}<em> / ${total}</em></b>
      <span>${view.rank ? `rank ${view.rank} of ${view.of}` : '&nbsp;'}</span></div>
  </div>`;

  // --- Kuyruk ---
  const chips = queue.map((id, index) => {
    const tech = techById(id)?.tech;
    if (!tech) return '';
    return `<li><button class="tech-chip" data-dequeue="${esc(id)}" data-tip="tech" data-tip-arg="${esc(id)}"
      aria-label="Remove ${esc(tech.name)} from the queue"><em>${index + 1}</em>${esc(tech.name)}<i aria-hidden="true">×</i></button></li>`;
  }).join('');
  const queueRow = `<div class="tech-queue">
    <span class="tech-queue-label">Queue</span>
    ${chips ? `<ol>${chips}</ol>` : '<span class="tech-queue-empty">empty — when a technology finishes, the next is chosen for you</span>'}
    <span class="tech-queue-hint"><b>Click</b> research now · <b>Shift+click</b> add to queue · <b>Right-click</b> remove</span>
  </div>`;

  // --- Agac ---
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
        const done = hasTech(nation, node.tech.id) || research.current === node.tech.id;
        return `<i class="tech-link${hasTech(nation, prev.tech.id) ? ' is-lit' : ''}${done ? ' is-done' : ''}"
          style="left:${left}px;width:${Math.max(0, node.x - left)}px"></i>`;
      }).join('');
      const nodes = placed.map(({ tech, x }) => {
        const state = stateOf(nation, research, tech);
        const queued = queue.indexOf(tech.id);
        const early = (tech.year ?? START_YEAR) > view.year;
        const meta = state === 'done'
          ? `${tech.year} · ✓`
          : `<span class="${early ? 'is-early' : ''}">${tech.year}</span> · ${costOf(tech.id)} RP`;
        const bar = state === 'active'
          ? `<i class="tech-node-bar" style="width:${(progress * 100).toFixed(1)}%"></i>` : '';
        return `<button class="tech-node is-${state}${queued >= 0 ? ' is-queued' : ''}"
          style="left:${x}px" data-tech="${esc(tech.id)}" data-tip="tech" data-tip-arg="${esc(tech.id)}"
          aria-label="${esc(tech.name)}, ${tech.year}, ${state}">
          <b>${esc(tech.name)}</b><small>${meta}</small>${bar}
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
        <span class="tech-row-label"><i aria-hidden="true">${category.icon}</i><b>${esc(category.name)}</b>
          <em>${have}/${all.length}</em></span>
        <span class="tech-band-bar" aria-hidden="true"><i style="width:${all.length ? (have / all.length) * 100 : 0}%"></i></span>
      </header>
      ${folderRows}
    </section>`;
  }).join('');

  // Eksen: on yilda bir etiket. "Bugun" cizgisi erken arastirma cezasinin
  // basladigi yeri gosterir — sagindaki her teknoloji zamaninin onunde.
  const ticks = [];
  for (let year = 1840; year <= END_YEAR; year += 10) {
    ticks.push(`<span style="left:${(year - START_YEAR) * PX_PER_YEAR}px">${year}</span>`);
  }
  const nowX = Math.max(0, (view.yearExact - START_YEAR) * PX_PER_YEAR);

  return `<div class="tech-screen">
    ${kpis}
    ${queueRow}
    <div class="tech-tree" style="--tree-w:${Math.ceil(width)}px;--node-w:${NODE_W}px;--now-x:${nowX.toFixed(1)}px">
      <div class="tech-tree-inner">
        <div class="tech-axis"><span class="tech-row-label"></span><div class="tech-axis-track">${ticks.join('')}
          <span class="tech-now-label" style="left:${nowX.toFixed(1)}px">${view.year}</span></div></div>
        <div class="tech-bands">${bands}<i class="tech-now" aria-hidden="true"></i></div>
      </div>
    </div>
  </div>`;
}
