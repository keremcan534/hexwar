// Askerî ekran: komuta · asker alımı · eğitim kuyruğu.
//
// Yapı Victoria 2'nin Military penceresinden gelir — solda subay kadrosu ve
// ulusal göstergeler, ortada kurulabilir birimler, sağda üretim kuyruğu, altta
// ordunun künyesi. Boya bizim: kömür siyahı yüzey, oyulmuş pirinç hat, bordo
// şerit başlık (bkz. styles.css §21), referansın gri metal kabuğu değil.
//
// Bu dosya yalnız ÇİZER. Bütün sayılar game/military.js'ten hazır gelir;
// burada tek bir eşik ya da toplam hesaplanmaz. Simgeler satır içi çizgi-SVG:
// birim rozetleri harita odası sayacı gibi okunur, emoji yoktur.

import { formatPopulation } from '../game/economy.js';
import { UNIT_CATEGORIES } from '../game/military.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pct = (share) => `${Math.round(share * 100)}%`;

/* --------------------------------------------------------------------------
   SİMGE — birim rozetleri harita sayacı dilinde: çerçeve + kolun işareti.
   Figüratif asker resmi yerine sayaç, çünkü ekran bir savaş odası masasıdır.
   -------------------------------------------------------------------------- */
const COUNTER = {
  INFANTRY: '<rect x="2.2" y="4.4" width="11.6" height="7.2"/><path d="m2.2 4.4 11.6 7.2M13.8 4.4 2.2 11.6"/>',
  CAVALRY: '<rect x="2.2" y="4.4" width="11.6" height="7.2"/><path d="m2.2 11.6 11.6-7.2"/>',
  ARTILLERY: '<rect x="2.2" y="4.4" width="11.6" height="7.2"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>',
  ARMOR: '<rect x="2.2" y="4.4" width="11.6" height="7.2"/><ellipse cx="8" cy="8" rx="3.6" ry="2.2"/>',
  AIRCRAFT: '<rect x="2.2" y="4.4" width="11.6" height="7.2"/><path d="M8 5.6v4.8M5.4 6.6c1.4 0 2.6.6 2.6 1.4M10.6 9.4c-1.4 0-2.6-.6-2.6-1.4"/>',
  WARSHIP: '<rect x="2.2" y="4.4" width="11.6" height="7.2"/><path d="M4.6 9.2h6.8l-1 1.6H5.6zM8 5.4v3.8M6.4 6.8h3.2"/>',
};

const MARK = {
  officer: '<path d="M8 2.6 9.6 6l3.7.4-2.7 2.5.7 3.6L8 10.8 4.7 12.5l.7-3.6L2.7 6.4 6.4 6z"/>',
  hourglass: '<path d="M4.4 2.8h7.2M4.4 13.2h7.2M5.2 2.8c0 2.6 2.8 3.6 2.8 5.2S5.2 10.6 5.2 13.2M10.8 2.8c0 2.6-2.8 3.6-2.8 5.2s2.8 2.6 2.8 5.2"/>',
  manpower: '<circle cx="5.4" cy="4.6" r="1.7"/><path d="M2.4 12.8V10c0-1.5 1.3-2.7 3-2.7s3 1.2 3 2.7v2.8M10.6 5.4a1.6 1.6 0 1 0 0-.1M9.8 12.8V10c0-1 .5-1.8 1.3-2.2"/>',
  sword: '<path d="M11.4 2.6h2v2L7.2 10.8 5.2 8.8zM4.6 9.4 6.6 11.4 4 14l-2-2zM9 7l-2-2"/>',
  flag: '<path d="M4 13.4V2.8M4 3.4h8l-1.6 2.4L12 8.2H4z"/>',
  coin: '<circle cx="8" cy="8" r="5.2"/><path d="M8 4.8v6.4M6.4 6.4h3.2M6.4 9.6h3.2"/>',
  anchor: '<circle cx="8" cy="3.6" r="1.4"/><path d="M8 5v8.4M4.6 7.2h6.8M3 10.2c0 2 2.2 3.4 5 3.4s5-1.4 5-3.4"/>',
  shield: '<path d="M8 2.4 13 4.4v3.4c0 2.9-2.1 4.7-5 5.8-2.9-1.1-5-2.9-5-5.8V4.4z"/>',
};

const counter = (typeId) => `<svg class="mil-counter" viewBox="0 0 16 16" fill="none"
  stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"
  aria-hidden="true">${COUNTER[typeId] ?? COUNTER.INFANTRY}</svg>`;

const mark = (id) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${MARK[id] ?? ''}</svg>`;

/** Bölüm başlığı: bordo laklanmış şerit — defterin her yerinde aynı ayraç. */
const band = (title, note = '') => `<h4 class="mil-band">${esc(title)}${
  note ? `<em>${esc(note)}</em>` : ''}</h4>`;

/* --------------------------------------------------------------------------
   ÜST KÜNYE — ülkenin askerî durumu tek satırda
   -------------------------------------------------------------------------- */

function figure(icon, label, value, note, tone = '') {
  return `<div class="mil-figure ${tone}" title="${esc(note)}">
    <i aria-hidden="true">${mark(icon)}</i>
    <span><small>${esc(label)}</small><b>${esc(value)}</b></span>
  </div>`;
}

function headerStrip(summary) {
  const wars = summary.wars.length
    ? summary.wars.map((war) => war.name).join(', ')
    : 'At peace';
  return `<header class="mil-head">
    ${figure('sword', 'Standing army', `${summary.divisions}`,
    `${summary.regiments} regiments · ${formatPopulation(summary.soldiers)} men`
      + ` · ${pct(summary.strength)} of establishment`
      + (summary.inBattle ? ` · ${summary.inBattle} in battle` : '')
      + (summary.marching ? ` · ${summary.marching} marching` : ''))}
    ${figure('manpower', 'Manpower pool', formatPopulation(summary.manpower),
    'People your provinces can still put under arms. Recruits leave the province'
      + ' population; only survivors return when a division is disbanded.')}
    ${figure('officer', 'Officers', `${summary.officers}${summary.admirals ? ` · ${summary.admirals}⚓` : ''}`,
    `${summary.officers} generals, ${summary.admirals} admirals`
      + (summary.unassigned ? ` · ${summary.unassigned} unit(s) without a commander` : ''),
    summary.unassigned ? 'warn' : '')}
    ${figure('hourglass', 'In training', `${summary.training}`,
    `${summary.trainingCapacity} can train at once · ${formatPopulation(summary.trainingManpower)}`
      + ' men committed when they march out')}
    ${figure('flag', 'Wars', `${summary.wars.length}`, wars, summary.wars.length ? 'hot' : '')}
    ${figure('coin', 'Upkeep', `${summary.upkeepGold.toFixed(1)}¤`,
    `${summary.upkeepGold.toFixed(1)} gold and ${Math.round(summary.upkeepFood)} food a week`
      + ` · procurement ${summary.procurementCost.toFixed(1)}¤ · wages at ${summary.wages}%`)}
  </header>`;
}

/* --------------------------------------------------------------------------
   SOL SÜTUN — komuta
   -------------------------------------------------------------------------- */

function leaderRow(leader, selected) {
  const stars = '★'.repeat(leader.skill) + '☆'.repeat(Math.max(0, 5 - leader.skill));
  const traits = leader.traits.map((trait) => trait.name).join(' · ') || 'no traits';
  // Durus SATIRDA gorunur: beta iki ekranin celisen cevap verdigini yazdi
  // ("panel ADVANCING diyor, komut holding'e donmus", B2-021) — tek bakista
  // dogru durum her subayin kendi satirinda durursa celiski kalmaz.
  const stance = leader.branch === 'navy' || !leader.divisions ? ''
    : `<em class="mil-stance ${leader.stance === 'advance' ? 'hot' : ''}">${
      leader.stance === 'advance' ? '➤ adv' : '■ hold'}</em>`;
  return `<button class="mil-leader ${selected ? 'is-open' : ''} ${leader.divisions ? '' : 'is-idle'}"
    data-military-leader="${leader.id}"
    title="${esc(`${leader.rank} ${leader.name} — ${traits}`)}">
    <i class="mil-portrait" aria-hidden="true">${mark(leader.branch === 'navy' ? 'anchor' : 'officer')}</i>
    <span class="mil-leader-text">
      <b>${esc(leader.name)}</b>
      <small>${esc(traits)}</small>
    </span>
    <span class="mil-leader-side">
      <em class="mil-stars">${stars}</em>
      ${stance}
      <small>${esc(leader.assignment)}</small>
    </span>
  </button>`;
}

/** Seçili subayın künyesi: çarpanlar ve emrindeki kuvvet. */
function leaderDetail(leader, loose) {
  if (!leader) {
    return `<div class="mil-leader-detail is-empty">
      <p>Select an officer to read their bonuses.</p>
    </div>`;
  }
  const bonus = (label, value, note) => (value
    ? `<i title="${esc(note)}"><small>${esc(label)}</small><b>+${Math.round(value * 100)}%</b></i>`
    : '');
  const traits = leader.traits.map((trait) => `<em title="${esc(trait.desc)}">
    ${trait.icon} ${esc(trait.name)}</em>`).join('') || '<em class="void">No traits</em>';
  return `<div class="mil-leader-detail">
    <div class="mil-detail-head">
      <b>${esc(leader.rank)} ${esc(leader.name)}</b>
      <small>${leader.battles} ${leader.battles === 1 ? 'battle' : 'battles'}
        · ${leader.age} ${leader.age === 1 ? 'year' : 'years'} of service
        · ${leader.xp} xp</small>
    </div>
    <div class="mil-detail-traits">${traits}</div>
    <div class="mil-detail-bonus">
      ${bonus('attack', leader.attack, 'Added to the combat roll when this command attacks.')}
      ${bonus('defence', leader.defense, 'Added to the combat roll when this command defends.')}
      ${bonus('siege', leader.siege, 'Share of terrain and fortification bonus this officer ignores.')}
      ${bonus('recovery', leader.recovery, 'Faster weekly reinforcement for divisions under this command.')}
      ${bonus('planning', leader.planningRate, 'Battle plans of this command mature faster.')}
      ${bonus('variance', leader.variance, 'Wider swing on every combat roll — a gambler.')}
      ${leader.march ? `<i title="Adds to the marching speed of the whole command."><small>march</small><b>+${leader.march}</b></i>` : ''}
    </div>
    <div class="mil-detail-foot">
      <span>${esc(leader.assignment)}${leader.branch === 'navy' ? ''
    : ` · ${leader.stance === 'advance' ? 'advancing' : 'holding'} · ${esc(leader.aggression)}`}</span>
      ${leader.branch === 'navy' ? '' : `<span class="mil-plan" title="A matured plan is worth up to +25% in the attack.">
        planning <i><b style="width:${Math.round(leader.planning * 100)}%"></b></i>${pct(leader.planning)}</span>`}
    </div>
    <div class="mil-detail-actions">
      ${loose > 0 && !leader.full ? `<button class="mil-btn" data-military-assign="${leader.id}"
        title="${esc(`Put every ${leader.branch === 'navy' ? 'ship' : 'division'} without a commander under this officer.`)}">
        Take ${loose} loose ${loose === 1 ? 'unit' : 'units'}</button>` : ''}
      ${leader.divisions ? `<button class="mil-btn" data-military-dismiss="${leader.id}"
        title="Release this command; the divisions stay on the map without an officer.">
        Release command</button>` : ''}
    </div>
  </div>`;
}

function commandColumn(state, roster, looseByBranch, trainCost, canTrain) {
  const branch = state.branch === 'navy' ? 'navy' : 'army';
  const list = branch === 'navy' ? roster.navy : roster.army;
  // Amiral gemi alır, general tümen: "boşta" sayısı da kola göre okunur.
  const loose = looseByBranch[branch] ?? 0;
  const selected = list.find((leader) => leader.id === state.leader) ?? list[0] ?? null;
  const rows = list.map((leader) => leaderRow(leader, selected?.id === leader.id)).join('')
    || `<p class="mil-empty">${branch === 'navy'
      ? 'No admirals. One is trained once you keep a fleet at sea.'
      : 'No officers in the staff.'}</p>`;

  const toggle = (key, label, on, note) => `<button class="mil-toggle ${on ? 'on' : ''}"
    data-military-auto="${key}" title="${esc(note)}" aria-pressed="${on}">
    <i aria-hidden="true">${on ? '✓' : ''}</i>${esc(label)}</button>`;

  return `<aside class="mil-col mil-command">
    ${band('Command', `${roster.army.length} generals · ${roster.navy.length} admirals`)}
    <nav class="mil-tabs">
      <button data-military-branch="army" class="${branch === 'army' ? 'active' : ''}"
        aria-pressed="${branch === 'army'}">Generals</button>
      <button data-military-branch="navy" class="${branch === 'navy' ? 'active' : ''}"
        aria-pressed="${branch === 'navy'}">Admirals</button>
    </nav>
    <div class="mil-leader-list">${rows}</div>
    ${leaderDetail(selected, loose)}
    <div class="mil-command-actions">
      ${branch === 'navy' ? '' : `<div class="mil-theater" role="group" aria-label="All commands">
        <small>All commands</small>
        <button class="mil-btn" data-military-all-stance="advance"
          title="Order every army command to advance. One click instead of one per general; individual commands can still be overridden.">➤ Advance</button>
        <button class="mil-btn" data-military-all-stance="hold"
          title="Order every army command to hold its front.">■ Hold</button>
      </div>`}
      <button class="mil-btn wide" data-military-train="${branch}" ${canTrain ? '' : 'disabled'}
        title="${esc(canTrain
    ? `Trains a new officer for ${trainCost} gold. Each addition to the staff costs more.`
    : `The treasury cannot cover the ${trainCost} gold this commission costs.`)}">
        ${branch === 'navy' ? 'Create Admiral' : 'Create General'} · ${trainCost}¤</button>
      ${toggle('autoCreate', 'Auto-create leaders', roster.options.autoCreate,
    'The staff renews itself once a year: retirements are replaced and the corps grows'
    + ' with the army, paid from the treasury.')}
      ${toggle('autoAssign', 'Auto-assign leaders', roster.options.autoAssign,
    'Every division without a commander is handed to the least burdened officer each week.')}
    </div>
  </aside>`;
}

/* --------------------------------------------------------------------------
   ULUSAL GÖSTERGELER — sol sütunun altındaki kutu
   -------------------------------------------------------------------------- */

function statsBox(stats) {
  const rows = stats.map((row) => `<div class="mil-stat ${row.live ? '' : 'is-dead'}"
    title="${esc(row.note)}">
    <span>${esc(row.label)}</span><b>${esc(row.value)}</b>
  </div>`).join('');
  return `<section class="mil-stats">
    ${band('National military')}
    <div class="mil-stat-grid">${rows}</div>
  </section>`;
}

/* --------------------------------------------------------------------------
   ORTA SÜTUN — asker alımı
   -------------------------------------------------------------------------- */

function buildRow(option, state) {
  const blocked = !option.canBuild;
  const stats = [
    `attack ${option.attack}`,
    `strength ${option.hp}`,
    `speed ${option.moves}`,
    option.support ? 'support arm' : null,
    option.entrenched ? 'digs in' : null,
  ].filter(Boolean).join(' · ');
  const equipment = option.equipment.map((item) => `<em class="${item.stock >= item.amount ? '' : 'short'}"
    title="${esc(`${item.name}: ${item.amount} needed, ${item.stock.toFixed(1)} in stock`)}">
    ${item.amount}${item.icon}</em>`).join('');
  const reason = blocked
    ? option.blockers.map((blocker) => blocker.text).join('\n')
    : `${option.weeks} weeks of training · ${option.gold} gold on order`
      + `\nRaised in ${option.source?.province ?? 'a province'}`
      + ` (${option.source?.region ?? '—'}), pool ${formatPopulation(option.sourcePool)}`;
  const where = option.source
    ? `${option.source.province} · ${option.source.region}`
    : 'no recruitment source';
  return `<div class="mil-build-row ${blocked ? 'is-blocked' : ''}" title="${esc(reason)}">
    <i class="mil-build-mark" aria-hidden="true">${counter(option.id)}</i>
    <div class="mil-build-text">
      <b>${esc(option.name)}<small>${esc(option.role)}</small></b>
      <small class="mil-build-where">${esc(where)}</small>
      <small class="mil-build-stats">${esc(stats)}</small>
    </div>
    <div class="mil-build-cost">
      <span title="Training time at full military funding.">${option.weeks}w</span>
      <span title="Paid from the treasury when the order is placed.">${option.gold}¤</span>
      <span title="Drawn from the province population when the unit marches out.">
        ${option.manpower.toLocaleString('en-US')}</span>
      <span class="mil-build-kit">${equipment || '<em class="void">—</em>'}</span>
    </div>
    <button class="mil-btn build" data-military-build="${option.id}" ${blocked ? 'disabled' : ''}
      title="${esc(blocked ? option.blockers.map((b) => b.text).join('\n')
    : `Order one ${option.name} regiment. Shift+click orders five —`
      + ' training slots, equipment and manpower still limit throughput.')}">
      ${blocked ? 'Blocked' : 'Order'}</button>
    ${blocked ? `<p class="mil-blocked-why">${esc(option.blockers[0].text)}</p>` : ''}
  </div>`;
}

function buildColumn(state, options, summary) {
  const category = state.category ?? 'all';
  const visible = options.filter((option) => {
    if (category !== 'all' && option.category !== category) return false;
    // Tarihi gelmemiş kol varsayılan olarak listede durmaz: 1836'da tank
    // satırı, oyuncunun yüz yıl boyunca hiçbir şey yapamayacağı bir satırdır.
    if (!state.showLocked && !option.available) return false;
    return true;
  });
  const tabs = UNIT_CATEGORIES.map(([id, label]) => `
    <button data-military-category="${id}" class="${category === id ? 'active' : ''}"
      aria-pressed="${category === id}">${esc(label)}</button>`).join('');
  const rows = visible.map((option) => buildRow(option, state)).join('')
    || '<p class="mil-empty">No arm of this kind can be raised yet.</p>';
  return `<section class="mil-col mil-build">
    ${band('Build army', `${summary.trainingCapacity} training slots`)}
    <nav class="mil-tabs mil-arms">${tabs}</nav>
    <div class="mil-build-list">${rows}</div>
    <label class="mil-check" title="Shows arms that history has not opened yet, with the year they arrive.">
      <input type="checkbox" data-military-locked ${state.showLocked ? 'checked' : ''} />
      Show arms not yet available</label>
  </section>`;
}

/* --------------------------------------------------------------------------
   SAĞ SÜTUN — eğitim kuyruğu
   -------------------------------------------------------------------------- */

function queueRow(row) {
  const state = row.frozen
    ? 'frozen — a peace treaty forbids raising divisions'
    : row.stalled
      ? 'trained — no province can spare the men or the ground'
      : row.queued
        ? 'waiting for a training slot'
        : `${row.left} ${row.left === 1 ? 'week' : 'weeks'} left`;
  return `<div class="mil-queue-row ${row.stalled || row.frozen ? 'is-stalled' : ''} ${row.queued ? 'is-waiting' : ''}"
    title="${esc(`${row.name} — ${row.province} (${row.region})\n${state}`)}">
    <i class="mil-build-mark" aria-hidden="true">${counter(row.typeId)}</i>
    <div class="mil-queue-text">
      <b>${esc(row.name)}</b>
      <small>${esc(row.province)} · ${esc(row.region)}</small>
      <span class="mil-progress"><i style="width:${(row.share * 100).toFixed(1)}%"></i></span>
      <small class="mil-queue-state">${pct(row.share)} · ${esc(state)}</small>
    </div>
    <div class="mil-queue-tools">
      <button class="mil-icon" data-military-top="${row.id}" ${row.first ? 'disabled' : ''}
        title="Move to the top of the queue in one click.">⤒</button>
      <button class="mil-icon" data-military-up="${row.id}" ${row.first ? 'disabled' : ''}
        title="Move up: the training slots go to the top of the queue first.">▲</button>
      <button class="mil-icon" data-military-down="${row.id}" ${row.last ? 'disabled' : ''}
        title="Move down.">▼</button>
      <button class="mil-icon danger" data-military-cancel="${row.id}"
        title="Cancel the order. Only the unspent share of the gold and equipment comes back.">✕</button>
    </div>
  </div>`;
}

function queueColumn(rows, summary) {
  const soonest = rows.filter((row) => !row.stalled)
    .reduce((best, row) => (best == null || row.left < best ? row.left : best), null);
  const list = rows.map(queueRow).join('')
    || '<p class="mil-empty">Nothing is in training. Orders placed in the centre column appear here.</p>';
  return `<section class="mil-col mil-queue">
    ${band('Units in training', `${rows.length} of ${summary.queueLimit}`)}
    <div class="mil-queue-head">
      <span><small>Committed manpower</small><b>${formatPopulation(summary.trainingManpower)}</b></span>
      <span><small>Training at once</small><b>${Math.min(summary.trainingCapacity, rows.length)} / ${summary.trainingCapacity}</b></span>
      <span><small>Next to march out</small><b>${soonest == null ? '—' : `${soonest}w`}</b></span>
    </div>
    <div class="mil-queue-list">${list}</div>
  </section>`;
}

/* --------------------------------------------------------------------------
   ALT BANT — kuvvet künyesi
   -------------------------------------------------------------------------- */

function dispositionBand(summary, composition, logistics, spent) {
  const arms = composition.map((entry) => `<span title="${esc(`${entry.count} ${entry.name} regiments`)}">
    <i aria-hidden="true">${counter(entry.id)}</i>${entry.count}</span>`).join('')
    || '<span class="void">no regiments</span>';
  const supply = logistics.map((item) => {
    const short = item.balance < 0;
    return `<span class="${short ? 'short' : ''}"
      title="${esc(`${item.name}: ${item.stock.toFixed(1)} in stock, ${item.required.toFixed(1)} needed`
      + `, ${item.supplyPerDay.toFixed(2)}/day arriving`
      + (item.etaDays ? ` — ${item.etaDays} days to cover the gap` : ''))}">
      ${item.icon}${item.stock.toFixed(0)}</span>`;
  }).join('');
  const orgValue = summary.organization == null ? '—' : `${Math.round(summary.organization)}%`;
  return `<footer class="mil-disposition">
    <div class="mil-disp-cell">
      <small>Order of battle</small>
      <div class="mil-arms">${arms}</div>
    </div>
    <div class="mil-disp-cell">
      <small>Field state</small>
      <b>${pct(summary.strength)} strength · ${orgValue} organization</b>
      <em>${summary.inBattle} engaged · ${summary.marching} on the march
        · ${summary.unassigned} without an officer</em>
    </div>
    <div class="mil-disp-cell">
      <small>Reinforcement</small>
      <b>${formatPopulation(summary.reinforced)} men last week</b>
      <em>${formatPopulation(summary.reinforcementDemand)} still missing from the ranks${spent
    ? ` · cost ${spent.arms.toFixed(1)} small arms, ${spent.artillery.toFixed(1)} artillery`
    : ''}</em>
    </div>
    <div class="mil-disp-cell">
      <small>Stockpile</small>
      <div class="mil-supply">${supply}</div>
      <em>supply index ${pct(summary.supplyIndex)} · procurement ${summary.procurement}%</em>
    </div>
  </footer>`;
}

/* --------------------------------------------------------------------------
   ÇERÇEVE
   -------------------------------------------------------------------------- */

/**
 * Ekranın tamamı. `state` Screens örneğinde yaşar (açık kol, seçili subay,
 * birim kategorisi, kilitli kolların gösterilmesi). Bütün veri dışarıdan
 * verilir: aynı tarama hem sütunlar hem alt bant tarafından paylaşılır.
 */
export function militaryScreen(state, data) {
  return `<div class="mil">
    ${headerStrip(data.summary)}
    <div class="mil-cols">
      <div class="mil-left">
        ${commandColumn(state, data.roster, data.loose, data.trainCost, data.canTrain)}
        ${statsBox(data.stats)}
      </div>
      ${buildColumn(state, data.options, data.summary)}
      ${queueColumn(data.queue, data.summary)}
    </div>
    ${dispositionBand(data.summary, data.composition, data.logistics, data.spent)}
  </div>`;
}
