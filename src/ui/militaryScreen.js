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

import { emblemArt, equipmentArt, traitArt } from './icons/art.js';
import { glyph } from './icons/glyphs.js';
import { kpi, kpiRow, money, tipAttr } from './kit.js';
import { formatPopulation } from '../game/economy.js';
import { SUPPLY } from '../game/econ/defs.js';
import { UNIT_CATEGORIES } from '../game/military.js';
import { subayPortresi } from './icons/subaylar.js';

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
/**
 * Birim sayaclari: pirinc kunye seti (assets/icons/units). Sembol dili NATO
 * karsiliklarindan gelir — X piyade, capraz suvari, oval zirhli, nokta-hat
 * topcu, capa donanma, V hava. Cizgi-SVG sayaclarinin yerini aldilar; kunye
 * cubugu ve defter madalyonlariyla ayni sette dursunlar diye.
 */
const COUNTER_ART = {
  INFANTRY: 'infantry',
  CAVALRY: 'cavalry',
  ARMOR: 'armor',
  ARTILLERY: 'artillery',
  WARSHIP: 'warship',
  SUBMARINE: 'warship',
  AIRCRAFT: 'aircraft',
};

const counter = (typeId) => `<img class="mil-counter" alt="" loading="lazy" decoding="async"
  src="assets/icons/units/${COUNTER_ART[typeId] ?? COUNTER_ART.INFANTRY}.png">`;

/** Bölüm başlığı: bordo laklanmış şerit — defterin her yerinde aynı ayraç. */
const band = (title, note = '') => `<h4 class="mil-band">${esc(title)}${
  note ? `<em>${esc(note)}</em>` : ''}</h4>`;

/* --------------------------------------------------------------------------
   ÜST KÜNYE — ülkenin askerî durumu tek satırda
   -------------------------------------------------------------------------- */

function headerStrip(summary, composition = [], spent = null) {
  const crises = (summary.crises ?? [])
    .map((crisis) => `${crisis.name} (war in ${crisis.left}w)`);
  const wars = summary.wars.length || crises.length
    ? summary.wars.map((war) => war.name).concat(crises).join(', ')
    : 'At peace';
  return kpiRow([
    kpi({
      icon: emblemArt('soldiers', 'md'), label: 'Standing army', value: formatPopulation(summary.men),
      // Önce güç: dar ekranda üç nokta az önemli parçayı kessin.
      sub: `${pct(summary.strength)} · ${summary.regiments} regiments`,
      meter: summary.strength, meterTone: summary.strength < 0.7 ? 'warn' : 'pos',
      // Eski alt bandın (sefer düzeni, saha durumu, takviye) bilgisi burada:
      // bant ordu kartını ve teçhizat panelini tekrar ediyordu.
      tip: { text: `Standing army\n${summary.regiments} regiments in ${summary.divisions} divisions, ${formatPopulation(summary.men)} men`
        + (composition.length ? `\n${composition.map((entry) => `${entry.count} ${entry.name}`).join(' · ')}` : '')
        + `\n${pct(summary.strength)} of full strength · ${summary.organization == null ? '—' : `${Math.round(summary.organization)}%`} organization`
        + `\n${summary.inBattle} engaged · ${summary.marching} on the march · ${summary.unassigned} without an officer`
        + `\nReinforcement: ${formatPopulation(summary.reinforcedMen)} men last week, ${formatPopulation(summary.reinforcementDemand)} strength still missing`
        + (spent ? ` (cost ${spent.rifles.toFixed(1)} rifles, ${spent.guns.toFixed(1)} guns)` : '') },
    }),
    kpi({
      icon: emblemArt('recruits', 'md'), label: 'Manpower', value: formatPopulation(summary.manpower), sub: 'still to be raised',
      tip: { text: 'Manpower\nPeople your states can still put under arms. The conscription law sets the share; technology, advisors and the Recruitment focus raise it.' },
    }),
    kpi({
      label: 'Officers', value: String(summary.officers),
      sub: summary.unassigned ? `${summary.unassigned} unit(s) without a commander` : `${summary.admirals} admirals`,
      cls: summary.unassigned ? 'warn' : '',
    }),
    kpi({
      label: 'In training', value: `${summary.training}<small> / ${summary.trainingCapacity}</small>`,
      sub: 'training at once', meter: summary.trainingCapacity ? Math.min(1, summary.training / summary.trainingCapacity) : 0,
    }),
    kpi({
      icon: emblemArt('war_support', 'md'), label: 'Wars', value: summary.wars.length ? String(summary.wars.length) : 'Peace',
      sub: summary.wars.length || crises.length ? wars : 'no war, no crisis', cls: summary.wars.length ? 'hot' : '',
      tip: { text: `Wars\n${wars}` },
    }),
    supplyKpi(summary),
  ]);
}

/**
 * İKMAL: ordunun ve donanmanın haftalık faturası (econ/bills.js). Altın yok;
 * fatura çıktının önünden düşer. Faturaların toplamı tavanı aşınca ödenen pay
 * (supplyShare) 1'in altına iner — ikmal krizi; kutu o zaman uyarır.
 */
function supplyKpi(summary) {
  const share = summary.supplyShare ?? 1;
  const crisis = share < 1 - 1e-6;
  return kpi({
    icon: emblemArt('army', 'md'), label: 'Supply', value: `${(summary.supply ?? 0).toFixed(1)}<small> IC/wk</small>`,
    sub: crisis ? `supply crisis · ${pct(share)} paid` : 'off the top of output',
    cls: crisis ? 'warn' : '',
    meter: crisis ? share : null, meterTone: 'warn',
    tip: { text: `Army supply\n${(summary.armyCost ?? 0).toFixed(1)} army · ${(summary.navyCost ?? 0).toFixed(1)} navy a week, ×${SUPPLY.war} at war. `
      + 'Every regiment and ship is a weekly bill that comes off the top of output, before the people and development.'
      + (crisis
        ? `\nSupply crisis: the state's bills pass their ceiling and only ${pct(share)} is paid. Reinforcement, training and organisation recovery slow down and stability falls.`
        : '')
      + '\nEquipment comes from the production lines (Factories).' },
  });
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
    <i class="mil-portrait has-art" aria-hidden="true">${subayPortresi(leader)}</i>
    <span class="mil-leader-text">
      <b>${esc(leader.name)}</b>
      <small>${leader.traits.map((trait) => `${traitArt(trait.id)}${esc(trait.name)}`).join(' · ') || 'no traits'}</small>
    </span>
    <span class="mil-leader-side">
      <em class="mil-stars">${stars}</em>
      ${stance}
      <small>${esc(leader.assignment)}</small>
    </span>
  </button>`;
}

/** Seçili subayın künyesi: çarpanlar ve emrindeki kuvvet. */
function leaderDetail(leader, loose, retireConfirm = null) {
  if (!leader) {
    return `<div class="mil-leader-detail is-empty">
      <p>Select an officer to read their bonuses.</p>
    </div>`;
  }
  const bonus = (label, value, note) => (value
    ? `<i title="${esc(note)}"><small>${esc(label)}</small><b>+${Math.round(value * 100)}%</b></i>`
    : '');
  const traits = leader.traits.map((trait) => `<em title="${esc(trait.desc)}">
    ${traitArt(trait.id)} ${esc(trait.name)}</em>`).join('') || '<em class="void">No traits</em>';
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
    ${leader.assault ? `<p class="mil-assault">${esc(leader.assault)}</p>` : ''}
    <div class="mil-detail-actions">
      ${loose > 0 && !leader.full ? `<button class="mil-btn" data-military-assign="${leader.id}"
        title="${esc(`Put every ${leader.branch === 'navy' ? 'ship' : 'division'} without a commander under this officer.`)}">
        Take ${loose} loose ${loose === 1 ? 'unit' : 'units'}</button>` : ''}
      ${/* HER ZAMAN GORUNUR, gerekirse devre disi. Once yalnizca tumeni olan
            subayda ciziliyordu ve dugme "yok olan" bir dugmeydi: oyuncu
            "Release Command diye bir sey bulamadim" diye yazdi. Ad da
            belirsizdi — subayi mi gorevden aliyoruz, tumenleri mi? Etiket
            artik SAYIYI soyluyor. */''}
      <button class="mil-btn" data-military-dismiss="${leader.id}"
        ${leader.divisions ? '' : 'disabled'}
        title="${esc(leader.divisions
    ? `Take the ${leader.divisions} ${leader.branch === 'navy' ? 'ship(s)' : 'division(s)'}`
      + ' away from this officer. They stay on the map without a commander and'
      + ' can be handed to someone else (or picked up automatically).'
    : 'This officer has nothing to release.')}">
        Release ${leader.divisions || ''} ${leader.branch === 'navy' ? 'ships' : 'divisions'}</button>
      <button class="mil-btn mil-retire${retireConfirm === leader.id ? ' danger' : ''}" data-military-retire="${leader.id}"${tipAttr({ text: retireConfirm === leader.id
    ? 'Click again to retire this officer.'
    : `Retire ${leader.name} from the staff. ${leader.divisions ? `Their ${leader.divisions} ${leader.branch === 'navy' ? 'ships' : 'divisions'} go to other officers (or wait for one).` : 'They command nothing.'}
Click twice to confirm.` })}>${retireConfirm === leader.id ? 'Confirm retire?' : 'Retire'}</button>
    </div>
  </div>`;
}

/**
 * Seferberlik satırı: tek düğme, tek cümle. Neden kapalıysa yazar (engel
 * listesi game/mobilization.js'ten gelir; ekran eşik hesaplamaz).
 */
/** Call to Arms: son umut (TASARIM D6). Tek cümle, iki tık; engel oyunun kapısından. */
function leveeRow(l) {
  if (!l) return '';
  const tip = l.active
    ? `The nation is in arms: ${l.militia} of ${l.target} militia regiments raised. They fight at 40% on our own soil, never attack, and go home at the peace.`
    : `Call to Arms
~${l.target} militia regiments (${Math.round(l.rate * 100)}% of our free people, every people) · fight at 40% on our own soil, never attack · stability −5 · exhaustion +10, and more while they stand · subjects resent the draft.${l.blockers.length ? `
${l.blockers.join(' ')}` : ''}`;
  return `<button class="mil-btn mil-big levee${l.active ? ' on' : ''}" data-military-levee
      ${l.active || l.blockers.length ? 'disabled' : ''}${tipAttr({ text: tip })}>${l.active ? `⚑ Nation in arms · ${l.militia}/${l.target}` : '⚑ Call to Arms'}</button>`;
}

function mobilizationRow(m) {
  if (!m) return '';
  // Depo hazırlığı: seferberlik tüfeksiz durur (kura alayı yarım takım alır).
  const short = !m.active && m.target > 0 && (m.armed ?? m.target) < m.target;
  const depot = m.target > 0
    ? ` The depot arms ${Math.min(m.armed ?? m.target, m.target)} of ${m.target} (${m.rifles ?? 15} rifles each)${short ? ': the rest wait for the rifle line.' : '.'}`
    : '';
  const note = m.active
    ? `${m.conscripts} of ${m.target} conscript regiments under arms. They fight at ${Math.round(m.power * 100)}%,`
      + ' draw normal supply, strain stability, and go home when the last war ends.'
    : m.blockers.length
      ? `${m.blockers.join(' ')} Would raise ${m.target} conscript regiments over ${m.weeks} weeks.`
      : `Raise ${m.target} conscript regiments over ${m.weeks} weeks (${Math.round(m.share * 100)}% of the`
        + ` manpower pool). They fight at ${Math.round(m.power * 100)}% and leave farms and factories short.`;
  const status = m.active
    ? `${m.conscripts}/${m.target} conscript ${m.target === 1 ? 'regiment' : 'regiments'} under arms`
    : m.blockers.length ? m.blockers[0] : `${m.target} regiments in ${m.weeks} weeks`;
  const ready = !m.active && m.target > 0
    ? `<em class="mil-reserve-depot${short ? ' short' : ''}">Depot arms ${Math.min(m.armed ?? m.target, m.target)}/${m.target}</em>`
    : '';
  // YEDEK KARTI: seferberlik savaşın en büyük tek kararı ama 74 px'lik, 10 px
  // yazılı bir düğme ve üç noktayla kesilen bir satırdı (Kerem: "oyuncu
  // göremez"). Artık başlıklı kart, tam genişlik düğme, durum cümlesi
  // kesilmeden yazılır; ayrıntı bilgi kartında.
  return `<div class="mil-reserve${m.active ? ' is-active' : ''}" role="group" aria-label="Mobilization"${tipAttr({ text: `Mobilization
${note}${depot}` })}>
    <div class="mil-reserve-head"><small>Reserve</small><em>${esc(status)}</em>${ready}</div>
    <button class="mil-btn mil-big ${m.active ? 'on' : ''}" data-military-mobilize
      ${!m.active && m.blockers.length ? 'disabled' : ''}>${m.active ? '■ Demobilize the reserve' : '⚑ Mobilize the reserve'}</button>
    ${leveeRow(m.levee)}
  </div>`;
}

function commandColumn(state, roster, looseByBranch, trainCost, canTrain, mobilization = null) {
  const branch = state.branch === 'navy' ? 'navy' : 'army';
  const list = branch === 'navy' ? roster.navy : roster.army;
  // Amiral gemi alır, general tümen: "boşta" sayısı da kola göre okunur.
  const loose = looseByBranch[branch] ?? 0;
  const selected = list.find((leader) => leader.id === state.leader) ?? list[0] ?? null;
  const rows = list.map((leader) => leaderRow(leader, selected?.id === leader.id)).join('')
    || `<p class="mil-empty">${branch === 'navy'
      ? 'No admirals. One is trained once you keep a fleet at sea.'
      : 'No officers in the staff.'}</p>`;

  // Kadro anahtarları AUTO hapı diliyle: tam genişlik satır, ad + tek satır
  // ne yaptığı + AÇIK/KAPALI. Eskiden 10 px'lik onay kutusuydu ve sütunun en
  // altında, çoğu ekranda görünür alanın dışında kalıyordu.
  const toggle = (key, label, on, note, line) => `<button class="mil-switch ${on ? 'on' : ''}"
    data-military-auto="${key}" aria-pressed="${on}"${tipAttr({ text: `${label}
${note}` })}>
    <span class="mil-switch-text"><b>${esc(label)}</b><small>${esc(line)}</small></span>
    <span class="auto-pill${on ? ' on' : ''}" aria-hidden="true"><i class="auto-led"></i>AUTO <b>${on ? 'ON' : 'OFF'}</b></span>
  </button>`;

  return `<aside class="mil-col mil-command">
    ${band('Command', `${roster.army.length} generals · ${roster.navy.length} admirals`)}
    <nav class="mil-tabs">
      <button data-military-branch="army" class="${branch === 'army' ? 'active' : ''}"
        aria-pressed="${branch === 'army'}">Generals</button>
      <button data-military-branch="navy" class="${branch === 'navy' ? 'active' : ''}"
        aria-pressed="${branch === 'navy'}">Admirals</button>
    </nav>
    ${/* Eylemler listenin ÜSTÜNDE: altta dururken 1366'da ekranın görünür
          alanının dışına düşüyordu (yedek kartı, kadro anahtarları). */''}
    <div class="mil-command-actions">
      <div class="mil-switches">
      ${toggle('autoCreate', 'Auto-create leaders', roster.options.autoCreate,
    'The staff renews itself: retirements are replaced, the corps grows with the army and idle officers'
    + ' retire when it shrinks. New officers are paid from the development fund.', 'staff grows and shrinks with the army')}
      ${toggle('autoAssign', 'Auto-assign leaders', roster.options.autoAssign,
    'Every division without a commander is handed to the least burdened officer each week.', 'loose divisions get a commander')}
      </div>
      ${branch === 'navy' ? '' : `<div class="mil-theater" role="group" aria-label="All commands">
        <small>All commands</small>
        <button class="mil-btn" data-military-all-stance="advance"
          title="Order every army command to advance. One click instead of one per general; individual commands can still be overridden.">➤ Advance</button>
        <button class="mil-btn" data-military-all-stance="hold"
          title="Order every army command to hold its front.">■ Hold</button>
      </div>${mobilizationRow(mobilization)}`}
      <button class="mil-btn wide" data-military-train="${branch}" ${canTrain ? '' : 'disabled'}
        title="${esc(canTrain
    ? `Trains a new officer for ${money(trainCost, 0)}, paid from the development fund. Each addition to the staff costs more.`
    : `The development fund cannot cover the ${money(trainCost, 0)} this commission costs without sinking below its floor.`)}">
        ${branch === 'navy' ? 'Create Admiral' : 'Create General'} · ${money(trainCost, 0)}</button>
    </div>
    <div class="mil-leader-list">${rows}</div>
    ${leaderDetail(selected, loose, state.retireConfirm)}
  </aside>`;
}

/* --------------------------------------------------------------------------
   ULUSAL GÖSTERGELER — sol sütunun altındaki kutu
   -------------------------------------------------------------------------- */

function statsBox(stats) {
  const rows = stats.map((row) => `<div class="mil-stat ${row.live ? '' : 'is-dead'}"${tipAttr({ text: `${row.label}\n${row.note}` })}>
    <span>${esc(row.label)}</span><b>${esc(row.value)}</b>
  </div>`).join('');
  return `<div class="mil-stats"><div class="mil-stat-grid">${rows}</div></div>`;
}

/* --------------------------------------------------------------------------
   ORTA SÜTUN — asker alımı
   -------------------------------------------------------------------------- */

/** Saldırı/güç/hız çubukları: seçeneklerin en büyüğüne göre. */
let STAT_MAX = { attack: 1, hp: 1, moves: 1 };

function statBar(label, value, max) {
  return `<span class="mil-sbar"><small>${label}</small><i><b style="width:${Math.round(Math.min(1, value / Math.max(1, max)) * 100)}%"></b></i><em>${value}</em></span>`;
}

function buildRow(option, ironclad) {
  const blocked = !option.canBuild;
  // Teçhizat eksikse alay eğitimi bekletmez; o oranda güçle çıkar (HOI4).
  let fill = 1;
  const equipment = option.equipment.map((item) => {
    const have = Math.min(item.amount, Math.max(0, item.stock));
    fill = Math.min(fill, item.amount > 0 ? have / item.amount : 1);
    return `<span class="mil-chip kit ${item.stock >= item.amount ? '' : 'short'}"${tipAttr({ text: `${item.name}\n${item.amount} per regiment · ${item.stock.toFixed(1)} in the depot` })}>${equipmentArt(item.id, 'xs', ironclad)}<b>${item.amount}</b></span>`;
  }).join('');
  const where = option.source ? `${option.source.province} · ${option.source.region}` : 'no state can raise it';
  const traits = [option.support ? 'support arm' : null, option.entrenched ? 'digs in' : null].filter(Boolean).join(' · ');
  const why = blocked ? option.blockers.map((b) => b.text).join('\n') : '';
  // Alayın peşin bedeli yok (TEK ÇUBUK): insan, teçhizat ve haftalık ikmal.
  const supply = (option.upkeep ?? 0).toFixed(2);
  const orderTip = blocked ? `Not possible now\n${why}`
    : `Order one ${option.name} regiment\n${option.weeks} weeks · ${formatPopulation(option.manpower)} men · ${supply} IC a week in supply`
      + `\nRaised in ${option.source?.province ?? '—'} (pool ${formatPopulation(option.sourcePool)})`
      + (fill < 1 ? `\nShort of equipment: it marches out at about ${Math.round(Math.max(0.1, fill) * 100)}% strength and fills up as equipment arrives.` : '');
  return `<div class="mil-unit ${blocked ? 'is-blocked' : ''}">
    <i class="mil-unit-mark" aria-hidden="true">${counter(option.id)}</i>
    <div class="mil-unit-id">
      <b>${esc(option.name)}<small>${esc(option.role)}</small></b>
      <span class="mil-unit-where">${esc(where)}${traits ? ` · ${esc(traits)}` : ''}</span>
    </div>
    <div class="mil-unit-stats">
      ${statBar('Attack', option.attack, STAT_MAX.attack)}
      ${statBar('Strength', option.hp, STAT_MAX.hp)}
      ${statBar('Speed', option.moves, STAT_MAX.moves)}
    </div>
    <div class="mil-unit-cost">
      <span class="mil-chip"${tipAttr({ text: 'Training time with the army fully supplied; a supply crisis lengthens it.' })}>${glyph('hourglass', 'inline')}<b>${option.weeks}</b><small>wk</small></span>
      <span class="mil-chip"${tipAttr({ text: `Weekly supply\n${supply} IC a week in peace, ×${SUPPLY.war} at war: a bill that comes off the top of output for as long as it serves. Nothing is paid up front.` })}>${emblemArt('army', 'xs')}<b>${(option.upkeep ?? 0).toFixed(1)}</b><small>/wk</small></span>
      <span class="mil-chip"${tipAttr({ text: 'Men drawn from the state when the regiment marches out.' })}>${emblemArt('people', 'xs')}<b>${formatPopulation(option.manpower)}</b></span>
      ${equipment}
      ${fill < 1 && !blocked ? `<span class="mil-chip warn"${tipAttr({ text: 'Short of equipment\nTraining does not wait: the regiment marches out at this strength and the production lines fill it up later.' })}><b>${Math.round(Math.max(0.1, fill) * 100)}%</b><small>str</small></span>` : ''}
    </div>
    <div class="mil-unit-acts">
      <button class="k-btn primary" data-military-build="${option.id}" ${blocked ? 'disabled aria-disabled="true"' : ''}${tipAttr({ text: orderTip })}>Order</button>
      <button class="k-btn sm" data-military-build="${option.id}" data-count="5" ${blocked ? 'disabled' : ''}${tipAttr({ text: 'Order five (Shift+click on Order does the same). Training slots, equipment and manpower still limit how fast they come.' })}>×5</button>
    </div>
    ${blocked ? `<p class="mil-blocked-why">${esc(option.blockers[0].text)}</p>` : ''}
  </div>`;
}

/** Teçhizat deposu: stok, ordunun ihtiyacı, haftalık üretim. */
function equipmentPanel(logistics, ironclad) {
  const rows = logistics.map((item) => {
    const short = item.required > item.stock + 0.5;
    const share = item.required > 0 ? Math.min(1, item.stock / item.required) : 1;
    return `<div class="mil-eq ${short ? 'short' : ''}"${tipAttr({ text: `${item.name}\n${item.stock.toFixed(1)} in the depot · ${item.required.toFixed(1)} needed (reinforcement + training)\n${item.producedPerWeek.toFixed(2)} a week from the production line${item.etaWeeks ? `\n~${item.etaWeeks} weeks to cover the gap` : ''}` })}>
      ${equipmentArt(item.id, 'sm', ironclad)}
      <b>${esc(item.name)}</b>
      <span class="mil-eq-bar"><i style="width:${(share * 100).toFixed(0)}%"></i></span>
      <span class="mil-eq-num"><b>${item.stock.toFixed(0)}</b><small>${item.required > 0.5 ? ` / ${item.required.toFixed(0)}` : ' ready'}</small></span>
      <span class="mil-eq-rate">+${item.producedPerWeek.toFixed(2)}<small>/wk</small></span>
    </div>`;
  }).join('');
  return `<section class="mil-eqs">
    ${band('Equipment', 'set the lines on the Factories screen')}
    ${rows}
  </section>`;
}

/**
 * KURA: hangi halkın oğlu askere gider. Kutu kaldırılan halktan ne alay ne
 * takviye çekilir; ölen asker kendi halkının payından düşer (game/levy.js).
 */
function levyPanel(levy) {
  if (!levy?.rows?.length) return '';
  const rows = levy.rows.map((row) => {
    const status = row.primary ? 'your people' : row.accepted ? 'accepted' : 'not accepted';
    const tip = row.levied
      ? `${row.name} — drafted\n${formatPopulation(row.free)} more men can be called up`
        + ` · ${formatPopulation(row.held)} under arms now`
        + `\nTheir dead fall from their own share of the population.`
        + (row.accepted ? '' : `\nNot accepted: only part of them serve (Citizenship law).`)
      : `${row.name} — exempt\nNo regiment or reinforcement draws on them;`
        + ` their men stay in the fields and the workshops.`
        + (row.accepted
          ? `\nSparing an accepted people angers the unaccepted peoples you still draft.` : '');
    return `<label class="mil-levy-row ${row.levied ? '' : 'off'}"${tipAttr({ text: tip })}>
      <input type="checkbox" data-military-levy="${row.id}" ${row.levied ? 'checked' : ''} />
      <span class="mil-levy-name"><b>${esc(row.name)}</b><small class="${row.accepted ? 'acc' : ''}">${esc(status)} · ${pct(row.share)}</small></span>
      <span class="mil-levy-num">${row.levied ? formatPopulation(row.free) : '<i>exempt</i>'}</span>
      <span class="mil-levy-num">${row.held >= 1 ? formatPopulation(row.held) : '—'}</span>
      <span class="mil-levy-num fallen">${row.fallen >= 1 ? formatPopulation(row.fallen) : '—'}</span>
    </label>`;
  }).join('');
  const warn = levy.nobody
    ? '<p class="mil-levy-warn">No people is ticked: no regiment can be raised or reinforced.</p>'
    : levy.unequal
      ? `<p class="mil-levy-warn">Unequal levy: the unaccepted peoples who still serve resent it — up to +${levy.grievance} unrest in ${levy.grieved} ${levy.grieved === 1 ? 'state' : 'states'}.</p>`
      : '';
  return `<section class="mil-levy">
    <div class="mil-levy-head"><span></span><span>People</span><span>Can give</span><span>Under arms</span><span>Fallen</span></div>
    <div class="mil-levy-list">${rows}</div>
    ${warn}
  </section>`;
}

/**
 * ORTA SÜTUN ÜÇ GÖRÜNÜM (Kerem: "military sekmesi çok karmaşık"). Kura
 * tablosu alay listesinin altında yarı yüksekliği yiyordu (768'de liste tek
 * kart gösteriyordu); ulusal göstergeler sol sütunun kaydırmasının altında
 * kalıyordu. Şimdi her biri kendi sekmesinde, sütunun tam boyunda.
 */
const VIEWS = [
  ['build', 'Build army'],
  ['levy', 'Who is drafted'],
  ['stats', 'Army stats'],
];

function buildColumn(state, options, summary, logistics = [], levy = null, stats = [], ironclad = false) {
  const view = VIEWS.some(([id]) => id === state.view) ? state.view : 'build';
  const note = view === 'build' ? `${summary.trainingCapacity} training slots`
    : view === 'levy' ? `${formatPopulation(levy?.fallen ?? 0)} fallen so far` : 'doctrine, technology and laws';
  const viewbar = `<header class="mil-viewbar">
    <nav class="mil-views" role="tablist">${VIEWS.map(([id, label]) => `<button type="button" role="tab" data-military-view="${id}" class="${view === id ? 'active' : ''}" aria-selected="${view === id}">${esc(label)}</button>`).join('')}</nav>
    <em>${esc(note)}</em>
  </header>`;
  if (view === 'levy') {
    return `<section class="mil-col mil-build is-levy">${viewbar}${levyPanel(levy) || '<p class="mil-empty">No people to draft.</p>'}</section>`;
  }
  if (view === 'stats') {
    return `<section class="mil-col mil-build is-stats">${viewbar}${statsBox(stats)}</section>`;
  }
  const category = state.category ?? 'all';
  // Seçilen kategoride henüz açık kol yoksa (1900'de Armour, Air) kilitliler
  // geliş yılıyla gösterilir: boş liste "bu sekme bozuk" gibi okunuyordu.
  const categoryOpen = category === 'all'
    || options.some((option) => option.category === category && option.available);
  const visible = options.filter((option) => {
    if (category !== 'all' && option.category !== category) return false;
    // Tarihi gelmemiş kol varsayılan olarak listede durmaz: 1836'da tank
    // satırı, oyuncunun yüz yıl boyunca hiçbir şey yapamayacağı bir satırdır.
    if (!state.showLocked && !option.available && categoryOpen) return false;
    return true;
  });
  const tabs = UNIT_CATEGORIES.map(([id, label]) => `
    <button data-military-category="${id}" class="${category === id ? 'active' : ''}"
      aria-pressed="${category === id}">${esc(label)}</button>`).join('');
  STAT_MAX = {
    attack: Math.max(1, ...options.map((o) => o.attack)),
    hp: Math.max(1, ...options.map((o) => o.hp)),
    moves: Math.max(1, ...options.map((o) => o.moves)),
  };
  const rows = visible.map((option) => buildRow(option, ironclad)).join('')
    || '<p class="mil-empty">No arm of this kind can be raised yet.</p>';
  return `<section class="mil-col mil-build">
    ${viewbar}
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
    : row.awaiting
      ? `waiting for equipment — buying ${row.awaiting} abroad`
      : row.stalled
        ? 'trained — no free ground to muster on'
        : row.queued
          ? 'waiting for a training slot'
          : `${row.left} ${row.left === 1 ? 'week' : 'weeks'} left`
            + (row.short ? ` · marches out at ${Math.round(Math.max(0.1, row.fill) * 100)}% strength unless ${row.short} arrive` : '');
  return `<div class="mil-queue-row ${row.stalled || row.frozen ? 'is-stalled' : ''} ${row.queued || row.awaiting ? 'is-waiting' : ''}"
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
        title="Cancel the order. The unspent share of the equipment comes back and the men go home.">✕</button>
    </div>
  </div>`;
}

function queueColumn(rows, summary, logistics = [], ironclad = false) {
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
    ${equipmentPanel(logistics, ironclad)}
  </section>`;
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
    ${headerStrip(data.summary, data.composition, data.spent)}
    <div class="mil-cols">
      <div class="mil-left">
        ${commandColumn(state, data.roster, data.loose, data.trainCost, data.canTrain,
    data.summary.mobilization)}
      </div>
      ${buildColumn(state, data.options, data.summary, data.logistics, data.levy, data.stats, data.ironclad)}
      ${queueColumn(data.queue, data.summary, data.logistics, data.ironclad)}
    </div>
  </div>`;
}
