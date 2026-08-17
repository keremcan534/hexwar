// Teknoloji ekrani. Victoria 2 duzeni: ust sirada kategori cubuklari, altta
// bes klasor sutunu x alti kademe merdiven, sagda secili teknolojinin
// dosyasi ve "Start Research".
//
// Katman notu: saf gorunum. Simulasyonu okur, YAZMAZ — eylemler `data-*`
// olarak isaretlenir, isleyicileri screens.js baglar.

import {
  TECH_CATEGORIES, TECH_FOLDERS, TECH_MODS, TECHNOLOGIES,
  canResearch, hasTech, techCost,
} from '../game/technology.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`;

/** Bir teknolojinin ekrandaki durumu — merdivenin rengini bu belirler. */
function stateOf(nation, tech, current) {
  if (hasTech(nation, tech.id)) return 'done';
  if (current === tech.id) return 'active';
  if (canResearch(nation, tech.id)) return 'open';
  return 'locked';
}

/** Etki satirlari. Dolgu yoksa liste de bos gorunmez. */
function effectRows(tech) {
  const rows = [];
  for (const [key, label] of Object.entries(TECH_MODS)) {
    const value = tech[key];
    if (!Number.isFinite(value) || value === 0) continue;
    // Tedarik tuketiminde AZALMA iyidir: renk deger isaretine degil,
    // oyuncunun lehine olup olmadigina bakar.
    const good = key === 'supplyConsumption' ? value < 0 : value > 0;
    rows.push(`<div class="tech-effect">
      <span>${esc(label)}</span><b class="${good ? 'pos' : 'neg'}">${pct(value)}</b></div>`);
  }
  for (const typeId of tech.unlock ?? []) {
    rows.push(`<div class="tech-effect">
      <span>Unlocks</span><b class="pos">${esc(typeId.replace(/_/g, ' ').toLowerCase())}</b></div>`);
  }
  return rows.length ? rows.join('') : '<div class="tech-effect"><span>No direct effect</span></div>';
}

/**
 * @param {object} nation
 * @param {object} view  { category, selected, year, points, rate }
 */
export function technologyScreen(nation, view) {
  const categoryId = TECH_CATEGORIES[view.category] ? view.category : 'industry';
  const research = nation.research ?? { points: 0, current: null, done: [] };
  const done = new Set(research.done ?? []);

  // --- Kategori cubuklari: kac teknoloji alindi / toplam ---
  const bars = Object.values(TECH_CATEGORIES).map((cat) => {
    const folders = TECHNOLOGIES[cat.id];
    // Henuz doldurulmamis kategori: iskelet var, icerik yok. Bunu SAKLAMAK
    // yerine soylemek dogru — oyuncu bos sekmeyi hata sanmasin.
    const all = folders ? Object.values(folders).flat() : [];
    const have = all.filter((t) => done.has(t.id)).length;
    const total = all.length || 30;
    return `<button class="tech-cat${cat.id === categoryId ? ' is-active' : ''}"
      data-tech-category="${cat.id}"${all.length ? '' : ' disabled title="Not yet authored"'}>
      <i>${cat.icon}</i><span>${esc(cat.name)}</span>
      <em>${have}/${total}</em>
      <span class="tech-cat-bar"><i style="width:${(have / total) * 100}%"></i></span>
    </button>`;
  }).join('');

  // --- Merdivenler ---
  const folders = TECHNOLOGIES[categoryId];
  const columns = (TECH_FOLDERS[categoryId] ?? []).map((folder) => {
    const list = folders?.[folder] ?? [];
    const steps = list.map((tech) => {
      const state = stateOf(nation, tech, research.current);
      const cost = techCost(tech.id, view.year);
      const early = (tech.year ?? 0) > view.year;
      return `<li class="tech-step is-${state}${tech.id === view.selected ? ' is-selected' : ''}">
        <button data-tech="${esc(tech.id)}" title="${esc(tech.name)} · ${tech.year} · ${cost} RP${early ? ' (early research penalty)' : ''}">
          <span>${esc(tech.name)}</span>
          ${state === 'done' ? '<em>✓</em>' : `<em class="${early ? 'neg' : ''}">${tech.year}</em>`}
        </button></li>`;
    }).join('');
    return `<section class="tech-col">
      <header>${esc(folder)}</header>
      <ol class="tech-ladder">${steps || '<li class="tech-step is-locked"><button disabled><span>—</span></button></li>'}</ol>
    </section>`;
  }).join('');

  // --- Secili teknolojinin dosyasi ---
  const selected = view.selected
    ? Object.values(TECHNOLOGIES).flatMap((f) => Object.values(f).flat())
      .find((t) => t.id === view.selected)
    : null;

  let detail = '<div class="tech-detail empty"><p>Select a technology to see what it changes.</p></div>';
  if (selected) {
    const state = stateOf(nation, selected, research.current);
    const cost = techCost(selected.id, view.year);
    const early = (selected.year ?? 0) > view.year;
    const weeks = view.rate > 0 ? Math.ceil((cost - (state === 'active' ? research.points : 0)) / view.rate) : null;
    const action = state === 'done'
      ? '<button class="action" disabled>Researched</button>'
      : state === 'active'
        ? '<button class="action" disabled>Researching…</button>'
        : state === 'open'
          ? `<button class="action primary" data-start-research="${esc(selected.id)}">Start Research</button>`
          : '<button class="action" disabled>Requires the previous step in this folder</button>';
    detail = `<div class="tech-detail">
      <header><h4>${esc(selected.name)}</h4>
        <span class="tech-year${early ? ' neg' : ''}">Activation year ${selected.year}</span></header>
      <div class="tech-effects">${effectRows(selected)}</div>
      <div class="tech-cost">
        <span><small>Cost</small><b>${cost} RP</b></span>
        ${early ? '<span class="neg"><small>Ahead of its time</small><b>costlier</b></span>' : ''}
        ${weeks != null && state !== 'done' ? `<span><small>At current rate</small><b>${weeks} wk</b></span>` : ''}
      </div>
      ${action}
    </div>`;
  }

  const currentName = research.current
    ? Object.values(TECHNOLOGIES).flatMap((f) => Object.values(f).flat())
      .find((t) => t.id === research.current)?.name ?? research.current
    : 'nothing';

  return `<div class="tech-screen">
    <div class="tech-head">
      <span><small>Current research</small><b>${esc(currentName)}</b></span>
      <span><small>Research points</small><b>${Math.round(research.points)}</b></span>
      <span title="Literacy is the main source of research points"><small>Per week</small><b>${view.rate.toFixed(2)}</b></span>
      <span><small>Literacy</small><b>${Math.round((nation.economy?.literacy ?? 0) * 100)}%</b></span>
    </div>
    <div class="tech-cats">${bars}</div>
    <div class="tech-body">
      <div class="tech-cols">${columns}</div>
      ${detail}
    </div>
  </div>`;
}
