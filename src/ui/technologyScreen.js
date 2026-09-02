// Teknoloji ekrani. Victoria 2 duzeni: ust sirada kategori cubuklari, altta
// bes klasor sutunu x alti kademe merdiven, sagda secili teknolojinin
// dosyasi ve "Start Research".
//
// Katman notu: saf gorunum. Simulasyonu okur, YAZMAZ — eylemler `data-*`
// olarak isaretlenir, isleyicileri screens.js baglar.

import {
  PROGRAMME_TERM, PROGRAMMES, TECH_CATEGORIES, TECH_FOLDERS, TECH_MODS,
  TECHNOLOGIES, canResearch, hasTech, programmeCostFactor, programmeOf, techCost,
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
    // trainingCapacity DUZ slottur, yuzde degil — "+1" yazilir, "+100%" degil.
    const shown = key === 'trainingCapacity' ? `+${value}` : pct(value);
    rows.push(`<div class="tech-effect">
      <span>${esc(label)}</span><b class="${good ? 'pos' : 'neg'}">${shown}</b></div>`);
  }
  for (const typeId of tech.unlock ?? []) {
    rows.push(`<div class="tech-effect">
      <span>Unlocks</span><b class="pos">${esc(typeId.replace(/_/g, ' ').toLowerCase())}</b></div>`);
  }
  for (const typeId of tech.unlockUnit ?? []) {
    rows.push(`<div class="tech-effect">
      <span>Fields</span><b class="pos">${esc(typeId.toLowerCase())} divisions early</b></div>`);
  }
  return rows.length ? rows.join('') : '<div class="tech-effect"><span>No direct effect</span></div>';
}

/** Program paneli: yurutulen taahhut ya da ilan secenekleri. */
function programmePanel(nation, view) {
  const research = nation.research ?? {};
  const programme = programmeOf(nation);
  if (programme) {
    const termEnd = (research.programmeSince ?? 0) + PROGRAMME_TERM;
    const endYear = 1836 + Math.floor((termEnd - 1) * 7 / 365);
    const lapsed = (view.turn ?? 0) >= termEnd;
    const focus = programme.focus.map(([, f]) => f).join(' · ');
    const neglect = programme.neglect.map(([, f]) => f).join(' · ');
    return `<div class="tech-programme">
      <header><i>${programme.icon}</i><b>${esc(programme.name)}</b>
        <span>${lapsed ? 'term lapsed — carries on until replaced' : `term to ${endYear}`}</span></header>
      <p class="tech-programme-line">${esc(programme.line)}</p>
      <div class="tech-programme-terms">
        <span><small>Cheap</small>${esc(focus)}</span>
        <span><small>Dear</small>${esc(neglect)}</span>
        <span><small>Bound</small>Education at ${programme.floor}% or higher</span>
      </div>
      <button class="tech-programme-abandon" data-abandon-programme
        title="Winding up before term forfeits half the research bank and bars a new proclamation for a year.">Wind up</button>
    </div>`;
  }
  const cooldown = research.programmeCooldown ?? 0;
  if ((view.turn ?? 0) < cooldown) {
    const year = 1836 + Math.floor((cooldown - 1) * 7 / 365);
    return `<div class="tech-programme empty">
      <p>No national programme. After the last winding-up, none may be proclaimed before ${year}.</p>
    </div>`;
  }
  // Iki tik: ilki karti "onay bekliyor" yapar, ikincisi ilan eder. Tek tikla
  // sekiz yillik taahhut yeni oyuncuyu sasirtti (Open Beta 4); ayri bir
  // iletisim kutusu yok, kartin kendisi soruyu sorar.
  const cards = Object.values(PROGRAMMES).map((p) => `
    <button class="tech-programme-card${view.confirm === p.id ? ' confirming' : ''}" data-proclaim="${esc(p.id)}"
      title="${esc(p.line)} Binds education at ${p.floor}%.">
      <i>${p.icon}</i><b>${esc(p.name)}</b>
      <span>${p.focus.map(([, f]) => f).join(' · ')}</span>
      <em>${view.confirm === p.id
    ? 'click again to proclaim: eight years, education bound at ' + p.floor + '%'
    : 'education ≥ ' + p.floor + '%'}</em>
    </button>`).join('');
  return `<div class="tech-programme choose">
    <header><b>Proclaim a National Programme</b>
      <span>an eight-year commitment: direction, price and obligation</span></header>
    <div class="tech-programme-cards">${cards}</div>
  </div>`;
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
  const costOf = view.costOf ?? ((id) => techCost(id, view.year));
  const folders = TECHNOLOGIES[categoryId];
  const columns = (TECH_FOLDERS[categoryId] ?? []).map((folder) => {
    const list = folders?.[folder] ?? [];
    const steps = list.map((tech) => {
      const state = stateOf(nation, tech, research.current);
      const cost = costOf(tech.id);
      const early = (tech.year ?? 0) > view.year;
      // Program rengi: odak klasor ucuz (pirinc), ihmal edilen pahali (soluk).
      const factor = programmeCostFactor(nation, tech.id);
      const bias = factor < 1 ? ' is-focus' : factor > 1 ? ' is-neglect' : '';
      return `<li class="tech-step is-${state}${tech.id === view.selected ? ' is-selected' : ''}${bias}">
        <button data-tech="${esc(tech.id)}" title="${esc(tech.name)} · ${tech.year} · ${cost} RP${early ? ' (early research penalty)' : ''}${factor !== 1 ? (factor < 1 ? ' · programme focus' : ' · programme neglect') : ''}">
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
    const cost = costOf(selected.id);
    const early = (selected.year ?? 0) > view.year;
    // Biriken puan HANGI teknolojiye baslanirsa baslansin gecerlidir
    // (advanceResearch puani secimden ONCE toplar), dolayisiyla tahmin de
    // onu dusmelidir. Eskiden yalniz YURUYEN teknoloji icin dusuluyordu:
    // 693 RP biriken oyuncuya her aday "191 hafta" diyordu (kor beta B-018).
    const weeks = view.rate > 0
      ? Math.max(0, Math.ceil((cost - research.points) / view.rate))
      : null;
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

  // "Neden bu hiz?" dokumu — WHY THE PRICE MOVES kalibinin arastirmasi.
  // Sayilar researchPointsOf'un GERCEK terimleridir; yaklasiklik yok.
  const economy = nation.economy ?? {};
  const lit = Math.max(0, Math.min(1, economy.literacy ?? 0));
  const population = Math.max(1, economy.population ?? 1);
  const middleShare = Math.max(0, Math.min(1, (economy.classes?.middle?.population ?? 0) / population));
  const clerks = lit >= 0.5 ? middleShare * 2 : 0;
  const techBoost = economy.techMods?.researchRate ?? 0;
  const whyRate = esc([
    `Literacy ${(lit * 100).toFixed(0)}% × 4  =  +${(lit * 4).toFixed(2)}`,
    `Middle class ${(middleShare * 100).toFixed(1)}% × 1.5  =  +${(middleShare * 1.5).toFixed(2)}`,
    lit >= 0.5
      ? `Clerks (literacy ≥ 50%)  =  +${clerks.toFixed(2)}`
      : 'Clerks  =  +0.00 (needs literacy ≥ 50%)',
    'Base  =  +1.00',
    techBoost ? `Research technology  =  ×${(1 + techBoost).toFixed(2)}` : null,
  ].filter(Boolean).join('\n'));

  return `<div class="tech-screen">
    <div class="tech-head">
      <span><small>Current research</small><b>${esc(currentName)}</b></span>
      <span><small>Research points</small><b>${Math.round(research.points)}</b></span>
      <span class="stat-why" role="button" tabindex="0" data-why="research" data-why-text="${whyRate}"
        title="Click for the breakdown"><small>Per week</small><b>${view.rate.toFixed(2)}</b></span>
      <span title="National schooling level. The Population screen shows the class-weighted share of literate pops, which is a different measure."><small>National literacy</small><b>${Math.round((nation.economy?.literacy ?? 0) * 100)}%</b></span>
    </div>
    ${programmePanel(nation, view)}
    <div class="tech-cats">${bars}</div>
    <div class="tech-body">
      <div class="tech-cols">${columns}</div>
      ${detail}
    </div>
  </div>`;
}
