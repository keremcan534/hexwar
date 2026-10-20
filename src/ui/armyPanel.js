// ORDU PANELİ (sol alt) ve KOMUTA KARTLARI (orta alt) — HOI4'ün seçim paneli
// ile ordu çubuğunun karşılığı.
//
// Kerem 2026-10-13: "soldaki kısım tasarım faciası; selected divisions iyi
// görsel olarak ama sanki bir şeyler yanlış", generaller "epey kötü,
// minik". Ölçülen sebepler:
//   - Seçim İKİ panele bölünmüştü: liste sol üstte, ayrıntı sol altta. Liste
//     ikisinin arasına sıkışıyordu (1600×900'de 9 tümenden 2 satır görünür,
//     2 seçimde 1 satır) ve alt panel yalnız ilk tümeni anlatıyordu
//     ("showing the first").
//   - Satırlar tümenin NEREDE olduğunu söylemiyordu: on üç satırın on üçü
//     "1× Infantry · 30K men" — birbirinden ayırt edilmiyordu.
//   - Komutan/cephe/emir satırları küçük harfli "k — metin" etiketleriyle
//     ızgaraya dağılıyor, düğmeler iki sütuna rastgele düşüyordu.
//   - General portresi iki eski kuralın çakışmasında 26 px'lik köşeye
//     sıkışıp "HOLD" rozetinin altında kalıyordu; kartta yüz görünmüyordu.
//
// Bu modül yalnız HTML üretir; olayları hud.js bağlar (data-* öznitelikleri
// eskisiyle aynı: data-order, data-unassign, data-command-stance,
// data-disband; yeni: data-ap-unit, data-ap-assign, data-ap-clear).
// Yükseklik kuralı: haftalık tazelemede panel oynamaz — her satır tek satır,
// sabit boy; liste yalnız seçim değişince uzar (jitter-probe).

import {
  UNIT_TYPES, isMoving, menUnderArms, organizationOf, regimentCount, speedOf, strengthRatio,
} from '../game/units.js';
import {
  BRANCH, MAX_SKILL, TRAITS, aggressionInfo, commandSize, frontTilesOf, generalOfArmy, officersOf,
} from '../game/command.js';
import { ORDER } from '../game/orders.js';
import { etaWeeks } from '../game/movement.js';
import { formatPopulation } from '../game/economy.js';
import { subayPortresi } from './icons/subaylar.js';
import { traitArt } from './icons/art.js';
import { esc, tipAttr } from './kit.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * Kolun harita sayacı (assets/icons/units — pirinç plaka, NATO işareti):
 * panel haritadaki sayaçla aynı dili konuşsun. Harf rozeti ("I", "C") rengi
 * dışında hiçbir şey söylemiyordu.
 */
const counter = (unit, cls) => `<img class="${cls}" alt="${esc(unit.type.name)}" draggable="false"
  src="assets/icons/units/${String(unit.type.id).toLowerCase()}.png">`;

/** Tümenin bulunduğu yerin adı: state ya da deniz bölgesi. */
function placeName(world, tile) {
  if (!tile) return '—';
  if (tile.terrain?.water) {
    const zone = tile.seaZone >= 0 ? world.seaZones?.zones?.[tile.seaZone] : null;
    return zone?.name ?? tile.terrain.name;
  }
  return world.provinces?.[tile.provinceId]?.name ?? tile.terrain?.name ?? '—';
}

/**
 * Tümenin bu haftaki hâli: kısa rozet (liste) + uzun cümle (tek seçim).
 * Sıra öncelik sırasıdır: muharebedeki tümen yürüse de "muharebe"dir.
 */
export function unitStatus(game, unit) {
  const turn = game.turns?.turn ?? 0;
  if (unit.embarked) return { key: 'sea', chip: 'At sea', text: 'at sea · cannot fight, enemy-held seas cost men' };
  if (unit.battleId) return { key: 'battle', chip: 'Battle', text: 'in battle' };
  if ((unit.retreatUntil ?? 0) > turn) return { key: 'retreat', chip: 'Retreat', text: 'retreating' };
  if ((unit.attackReadyAt ?? 0) > turn) return { key: 'regroup', chip: 'Regroup', text: 'reorganizing after an attack' };
  if (isMoving(unit)) {
    const eta = etaWeeks(game, unit);
    const goal = unit.path?.[unit.path.length - 1];
    const where = goal ? placeName(game.world, game.world.get(goal.q, goal.r)) : null;
    // Aynı state içindeki yürüyüş hedefi tekrar etmesin ("Wehrheim · marching to Wehrheim").
    const away = where && where !== placeName(game.world, unit.tile);
    return { key: 'march', chip: `${eta} wk`, text: `marching${away ? ` to ${where}` : ''} · ${eta} wk` };
  }
  if (unit.order?.type === ORDER.AUTO) return { key: 'auto', chip: 'Auto', text: 'delegated to the AI' };
  if (unit.order?.type === ORDER.HOLD) return { key: 'hold', chip: 'Hold', text: 'holding position' };
  return { key: 'ready', chip: 'Ready', text: 'in position' };
}

/** İnce dolum çubuğu (güç / düzen). */
function bar(share, tone) {
  return `<span class="ap-bar ${tone}"><i style="width:${(clamp01(share) * 100).toFixed(0)}%"></i></span>`;
}

/** Bir göstergenin kutusu: versal etiket, değer, isteğe bağlı çubuk. */
function stat(label, value, { share = null, tone = '', tip = null } = {}) {
  return `<span class="ap-stat"${tip ? tipAttr(tip) : ''}><small>${label}</small><b>${value}</b>${share == null ? '' : bar(share, tone)}</span>`;
}

function composition(units) {
  const counts = new Map();
  for (const unit of units) {
    for (const regiment of unit.regiments?.length ? unit.regiments : [{ typeId: unit.type.id }]) {
      const name = UNIT_TYPES[regiment.typeId]?.name ?? regiment.typeId;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${n} ${name}`).join(' · ');
}

/** Seçimin ortak komutanı: hepsi aynı generaldeyse o, değilse kaç farklı. */
function sharedCommand(me, units) {
  const ids = new Set(units.map((unit) => generalOfArmy(me, unit)?.id ?? null));
  if (ids.size === 1) {
    const [id] = ids;
    return { general: id == null ? null : generalOfArmy(me, units[0]), mixed: 0 };
  }
  return { general: null, mixed: ids.size };
}

function headHtml(game, me, units) {
  const lead = units[0];
  const single = units.length === 1;
  const status = single ? unitStatus(game, lead) : null;
  const title = single ? `${lead.type.name} Division` : `${units.length} Divisions`;
  const sub = single
    ? `${placeName(game.world, lead.tile)} · ${status.text}`
    : composition(units);
  const badge = single
    ? `<span class="ap-badge" style="--nation:${me.color}">${counter(lead, 'ap-counter')}</span>`
    : `<span class="ap-badge is-count" style="--nation:${me.color}">${units.length}</span>`;
  return `<header class="ap-head">
      ${badge}
      <span class="ap-title"><b>${esc(title)}</b><small>${esc(sub)}</small></span>
      <button class="ap-x" type="button" data-ap-clear aria-label="Clear selection"${tipAttr({ text: 'Clear selection · Esc' })}>✕</button>
    </header>`;
}

function statsHtml(game, units) {
  let men = 0;
  let hp = 0;
  let maxHp = 0;
  let org = 0;
  let marching = 0;
  let fighting = 0;
  for (const unit of units) {
    men += menUnderArms(unit);
    const cap = Math.max(1, unit.maxHp ?? unit.type.hp ?? 1);
    hp += strengthRatio(unit) * cap;
    maxHp += cap;
    org += organizationOf(unit) * cap;
    if (unit.battleId) fighting++;
    else if (isMoving(unit)) marching++;
  }
  const strength = maxHp > 0 ? hp / maxHp : 0;
  const organization = maxHp > 0 ? org / maxHp / 100 : 0;
  const lead = units[0];
  const fourth = units.length === 1
    ? stat('Speed', String(speedOf(lead)), { tip: { text: 'Speed\nMovement points a week; terrain and roads spend them. The slowest regiment sets the pace.' } })
    : stat(fighting ? 'In battle' : 'Marching', String(fighting || marching),
      { tip: { text: `${marching} marching · ${fighting} in battle · ${units.length - marching - fighting} in position` } });
  return `<div class="ap-stats">
      ${stat('Men', formatPopulation(men), { tip: { text: 'Men under arms\nDrawn from the provinces that raised them; the dead fall from their own people.' } })}
      ${stat('Strength', `${Math.round(strength * 100)}%`, { share: strength, tone: 'str', tip: { text: 'Strength\nHow full the ranks are. Reinforcements refill it from the manpower pool and the equipment stock.' } })}
      ${stat('Org.', `${Math.round(organization * 100)}%`, { share: organization, tone: 'org', tip: { text: 'Organization\nCohesion in battle. It drains while fighting and recovers at rest.' } })}
      ${fourth}
    </div>`;
}

function listHtml(game, me, units) {
  const rows = units.map((unit) => {
    const status = unitStatus(game, unit);
    const general = generalOfArmy(me, unit);
    const tip = `${unit.type.name} division · ${placeName(game.world, unit.tile)}\n`
      + `${formatPopulation(menUnderArms(unit))} men · STR ${Math.round(strengthRatio(unit) * 100)}% · ORG ${Math.round(organizationOf(unit))}%\n`
      + `${status.text}${general ? ` · ${general.name}` : ' · no commander'}\n`
      + 'Click: select only this division · Shift+click: drop it from the selection';
    return `<button class="ap-row" type="button" data-ap-unit="${unit.id}"${tipAttr({ text: tip })}>
        <span class="ap-row-badge" style="--nation:${me.color}">${counter(unit, 'ap-counter')}</span>
        <span class="ap-row-name"><b>${esc(unit.type.name)}${regimentCount(unit) > 1 ? ` ×${regimentCount(unit)}` : ''}</b><small>${esc(placeName(game.world, unit.tile))}</small></span>
        <span class="ap-row-bars">${bar(strengthRatio(unit), 'str')}${bar(organizationOf(unit) / 100, 'org')}</span>
        <em class="ap-chip ${status.key}">${esc(status.chip)}</em>
      </button>`;
  }).join('');
  return `<div class="ap-list" role="list">${rows}</div>`;
}

function commandHtml(me, units) {
  const { general, mixed } = sharedCommand(me, units);
  const count = units.length;
  if (!general) {
    const text = mixed ? `${mixed} different commands` : 'No commander';
    const help = mixed
      ? 'Under different commanders. Assign them all to one for a single front.'
      : 'Holds where it stands. A commander gives it a front, planning and an offensive.';
    return `<section class="ap-sec ap-cmd is-empty">
        <h4>Commander</h4>
        <div class="ap-cmd-row">
          <span class="ap-portrait is-empty">?</span>
          <span class="ap-cmd-who"><b>${text}</b><small>${esc(help)}</small></span>
          <span class="ap-cmd-acts"><button class="ap-btn primary" type="button" data-ap-assign>Assign${count > 1 ? ` all ${count}` : ''}</button></span>
        </div>
      </section>`;
  }
  const traits = general.traits.map((id) => `<span class="ap-trait"${tipAttr({ text: `${TRAITS[id].name}\n${TRAITS[id].desc}` })}>${traitArt(id)}${esc(TRAITS[id].name)}</span>`).join('')
    || '<span class="ap-trait is-none">No traits</span>';
  const stance = aggressionInfo(general.aggression);
  const stars = `${'★'.repeat(general.skill)}<i>${'★'.repeat(Math.max(0, MAX_SKILL - general.skill))}</i>`;
  return `<section class="ap-sec ap-cmd">
      <h4>Commander</h4>
      <div class="ap-cmd-row">
        <span class="ap-portrait">${subayPortresi(general)}</span>
        <span class="ap-cmd-who">
          <b>${esc(general.name)}</b>
          <small><span class="ap-stars"${tipAttr({ text: `Skill ${general.skill}/${MAX_SKILL}\nAdds to attack and defence of every division in the command.` })}>${stars}</span> · ${commandSize(general)} divisions · ${esc(stance.label)}</small>
          <span class="ap-traits">${traits}</span>
        </span>
        <span class="ap-cmd-acts">
        <button class="ap-btn" type="button" data-ap-assign${tipAttr({ text: `Give the ${count} selected ${count === 1 ? 'division' : 'divisions'} to another commander.` })}>Change</button>
        <button class="ap-btn" type="button" data-unassign="${general.id}"${tipAttr({ text: `Release all ${commandSize(general)} divisions from ${general.name}'s command. The commander stays on the staff; Auto-assign may hand them back.` })}>Release</button>
        </span>
      </div>
    </section>`;
}

function frontHtml(game, me, units) {
  const { general } = sharedCommand(me, units);
  if (!general) return '';
  const front = frontTilesOf(game.world, general);
  const ready = clamp01(general.planning ?? 0);
  const attack = general.stance === 'advance';
  const target = general.target == null ? 'all active borders' : game.world.nations[general.target]?.name ?? 'unknown nation';
  const nextAssault = Math.max(0, (general.nextAssaultAt ?? 0) - (game.turns?.turn ?? 0));
  const back = general.fallingBack && general.fallback?.length;
  const line = back
    ? `Falling back · holding the fallback line`
    : `${attack ? 'Advancing' : 'Holding'} ${front.length} ${front.length === 1 ? 'province' : 'provinces'} · ${general.line ? 'drawn front' : target}`;
  const tip = `Front\nThe commander's sector of the border${general.target == null ? '' : ` with ${target}`}: ${front.length} provinces for ${commandSize(general)} divisions. `
    + 'Divisions take posts along it by themselves.\nPlanning grows while they hold their posts; an offensive spends it, halting resets it.'
    + (nextAssault > 0 ? `\nNext assault in ${nextAssault} weeks (stance tempo).` : '');
  return `<section class="ap-sec ap-front">
      <h4>Front <span class="ap-front-line"${tipAttr({ text: tip })}>${esc(line)}</span></h4>
      <div class="ap-plan">
        <span class="ap-plan-meter"${tipAttr({ text: `Planning ${Math.round(ready * 100)}%\nAttacks gain from planning; each assault spends some of it.` })}><i style="width:${(ready * 100).toFixed(0)}%"></i></span>
        <b>${Math.round(ready * 100)}%</b>
        <button class="ap-btn ${attack ? 'danger' : 'go'}" type="button" data-command-stance="${general.id}"${tipAttr({ text: attack ? 'Halt the offensive. Accumulated planning is lost; the army regroups. Key: O' : 'Start the offensive: divisions advance along the front. Planning carries into the attack. Key: O' })}>${attack ? '■ Halt' : '➤ Offensive'}</button>
      </div>
    </section>`;
}

/**
 * Tümenin DURAN emri — bu haftaki hâli (unitStatus) değil. Başlık "ne
 * yapıyor"u söyler; emir satırı "kimin sözünü dinliyor"u.
 */
function standingOrder(me, unit) {
  if (unit.order?.type === ORDER.AUTO) return 'delegated to the AI';
  if (unit.order?.type === ORDER.HOLD) return 'holding position';
  if (unit.directive) return 'moving on your order';
  return generalOfArmy(me, unit) ? 'follows the commander' : 'awaiting orders';
}

function ordersHtml(game, me, units) {
  const lead = units[0];
  const count = units.length;
  const orders = units.map((unit) => unit.order?.type ?? null);
  const all = (type) => orders.every((order) => order === type);
  const standing = new Set(units.map((unit) => standingOrder(me, unit)));
  const [only] = standing;
  const label = standing.size > 1 ? 'mixed orders'
    : count > 1 ? `all ${only.replace(/^follows /, 'follow ')}` : only;
  // Terhis tek ve çoklu seçimde aynı düğme: çoklu seçimde düğme hiç yoktu
  // (Kerem), kırk tümen için kırk ayrı seçim gerekiyordu. Muharebedekiler
  // atlanır; kimlik listesi düğmeye yazılır, kurulu hâl o listeye bağlıdır.
  const free = units.filter((unit) => !unit.battleId);
  const ids = free.map((unit) => unit.id).join(',');
  const armed = Boolean(ids) && disbandArmed === ids;
  const what = count === 1 ? 'this division' : `the ${free.length} selected ${free.length === 1 ? 'division' : 'divisions'}`;
  const skipped = count - free.length;
  const disband = `<button class="ap-btn quiet ap-disband${armed ? ' danger' : ''}" type="button" data-disband="${ids}" ${free.length ? '' : 'disabled'}${tipAttr({ text: !free.length
    ? (count === 1 ? 'A division in battle cannot be disbanded.' : 'Every selected division is in battle; none can be disbanded.')
    : `Disband ${what}. Survivors walk home: their manpower returns to the provinces that raised them and the upkeep stops. The dead do not come back.${skipped ? `\n${skipped} in battle ${skipped === 1 ? 'stays' : 'stay'}.` : ''}${armed ? '' : '\nClick twice to confirm.'}` })}>${armed ? 'Confirm disband?' : count === 1 ? 'Disband' : `Disband ${free.length}`}</button>`;
  return `<section class="ap-sec ap-orders">
      <h4>Orders <span>${esc(label)}</span></h4>
      <div class="ap-actions">
        <button class="ap-btn ${all(ORDER.AUTO) ? 'on' : ''}" type="button" data-order="${ORDER.AUTO}"${tipAttr({ text: `Delegate the ${count} selected ${count === 1 ? 'division' : 'divisions'} to the AI: they pick targets and fight on their own until you cancel.` })}>Auto</button>
        <button class="ap-btn ${all(ORDER.HOLD) ? 'on' : ''}" type="button" data-order="${ORDER.HOLD}"${tipAttr({ text: 'Hold position: stand fast and leave the next-idle cycle. Key: H' })}>Hold <kbd>H</kbd></button>
        <button class="ap-btn" type="button" data-order="clear"${tipAttr({ text: "Stop: the march, the right-click order and Auto/Hold are dropped. A commander's division returns to its post next week. Key: X" })}>Stop <kbd>X</kbd></button>
        ${disband}
      </div>
    </section>`;
}

/**
 * İki tıklı terhis. Disband, Hold/Stop ile aynı satırda tek tıkla tümeni
 * siliyordu — geri alınamaz eylem, komşu düğmeye kayan bir tıkla. İlk tık
 * bu kimliği "onay bekliyor" yapar (hud.js birkaç saniye sonra söndürür).
 */
let disbandArmed = null;
export function armDisband(id) {
  disbandArmed = id;
}

/** Sol alt panel: seçili tümenlerin tamamı (tek seçimde ayrıntı). */
export function armyPanelHtml(game, units) {
  const me = game.world.nations[game.turns.playerNation];
  const list = units.filter((unit) => unit && unit.hp > 0);
  if (!me || !list.length) return '';
  return `<div class="army-panel ${list.length === 1 ? 'is-single' : 'is-multi'}">
      ${headHtml(game, me, list)}
      ${statsHtml(game, list)}
      ${list.length > 1 ? listHtml(game, me, list) : ''}
      ${commandHtml(me, list)}
      ${frontHtml(game, me, list)}
      ${ordersHtml(game, me, list)}
    </div>`;
}

/**
 * Komutan seçme listesi (Assign / Change): ordu panelinin yerine açılır,
 * aynı kart dilinde — portre, yıldız, özellikler, kaç tümen. Seçimin şimdiki
 * komutanı işaretlidir; eğitim düğmesi altta.
 */
export function generalPickerHtml(game, me, list, { branch = BRANCH.ARMY, costLabel = '', affordable = false } = {}) {
  const current = sharedCommand(me, list).general;
  const officers = officersOf(me, branch);
  const noun = branch === BRANCH.NAVY ? 'ship' : 'division';
  const cards = officers.map((general) => {
    const size = commandSize(general);
    const traits = general.traits.map((id) => `<span class="ap-trait"${tipAttr({ text: `${TRAITS[id].name}\n${TRAITS[id].desc}` })}>${traitArt(id)}${esc(TRAITS[id].name)}</span>`).join('')
      || '<span class="ap-trait is-none">No traits</span>';
    const stars = `${'★'.repeat(general.skill)}<i>${'★'.repeat(Math.max(0, MAX_SKILL - general.skill))}</i>`;
    return `<button class="ap-pick${current?.id === general.id ? ' is-current' : ''}" type="button" data-pick-general="${general.id}">
        <span class="ap-portrait">${subayPortresi(general)}</span>
        <span class="ap-cmd-who">
          <b>${esc(general.name)}</b>
          <small><span class="ap-stars">${stars}</span> · ${size ? `${size} ${noun}s` : 'in reserve'} · ${general.battles ?? 0} battles</small>
          <span class="ap-traits">${traits}</span>
        </span>
        ${current?.id === general.id ? '<em class="ap-chip hold">Current</em>' : ''}
      </button>`;
  }).join('') || '<p class="ap-none">No officers on the staff.</p>';
  return `<div class="army-panel is-picker">
      <header class="ap-head">
        <span class="ap-badge is-count" style="--nation:${me.color}">${list.length}</span>
        <span class="ap-title"><b>Choose a commander</b><small>for ${list.length} selected ${list.length === 1 ? noun : `${noun}s`} · ${officers.length} on the staff</small></span>
        <button class="ap-x" type="button" data-close-generals aria-label="Back"${tipAttr({ text: 'Back to the army' })}>✕</button>
      </header>
      <div class="ap-picks">${cards}</div>
      <div class="ap-actions">
        <button class="ap-btn primary" type="button" data-train-general ${affordable ? '' : 'disabled'}${tipAttr({ text: 'A new officer joins the staff with a random trait.' })}>Train new officer · ${costLabel}</button>
        <button class="ap-btn quiet" type="button" data-close-generals>Back</button>
      </div>
    </div>`;
}

/**
 * Orta alttaki komutan kartları (HOI4 ordu çubuğu). Dikey kart: üstte duruş
 * rozeti ve tümen sayısı, ortada 50 px madalyon portre, altta ad, yetenek
 * yıldızları ve plan çubuğu. Yatay kart altı generalde 1280'de üç satıra
 * sarıyordu; dikey kart aynı genişliğe tek satır sığar. Tümensiz general
 * "yedek" olarak söner.
 */
export function commandCardsHtml(game, me, { active = null, selected = 0, retireArm = null } = {}) {
  const cards = officersOf(me, BRANCH.ARMY).map((general) => {
    const size = commandSize(general);
    const advancing = general.stance === 'advance';
    const ready = clamp01(general.planning ?? 0);
    const first = general.name.split(' ')[0];
    const tip = `${general.name} · skill ${general.skill}/${MAX_SKILL}\n`
      + `${size ? `${size} divisions · ${advancing ? 'on the offensive' : 'holding the line'} · planning ${Math.round(ready * 100)}%` : 'In reserve: no divisions'}\n`
      + `Click: select the command${selected ? `\nRight-click: transfer the ${selected} selected ${selected === 1 ? 'division' : 'divisions'} here` : ''}`;
    return `<button class="cmd-card${active?.id === general.id ? ' active' : ''}${advancing ? ' is-advancing' : ''}${size ? '' : ' is-idle'}"
        type="button" data-general="${general.id}"${tipAttr({ text: tip })}>
        <span class="cmd-top">${size ? `<em class="cmd-stance">${advancing ? 'ATK' : 'HOLD'}</em><b class="cmd-size">${size}</b>` : '<em class="cmd-stance is-reserve">RES</em>'}</span>
        <span class="cmd-portrait">${subayPortresi(general)}</span>
        <b class="cmd-name">${esc(first)}</b>
        <span class="cmd-stars">${'★'.repeat(general.skill)}<i>${'★'.repeat(Math.max(0, MAX_SKILL - general.skill))}</i></span>
        <span class="cmd-plan"><i style="width:${(ready * 100).toFixed(0)}%"></i></span>
        <span class="cmd-x${retireArm === general.id ? ' armed' : ''}" role="button" data-cmd-retire="${general.id}" aria-label="Retire ${esc(general.name)}"${tipAttr({ text: retireArm === general.id ? `Click again to retire ${general.name}` : `Retire ${general.name}\nTwo clicks. ${size ? `Their ${size} divisions are left without a commander.` : 'They command no divisions.'}` })}>${retireArm === general.id ? '✓' : '✕'}</span>
      </button>`;
  }).join('');
  const assignTip = selected
    ? `Give the ${selected} selected ${selected === 1 ? 'division' : 'divisions'} to a commander`
    : 'Select divisions first: click, box-drag or double-click an army';
  // Assign kartı BAŞTA: şerit taşınca (≈10 komutan) sondaki kart kaydırılıp
  // görünmez oluyordu ve kaydırma çubuğu gizli (ölçüldü). Kaydırma tekerlekle.
  return `<button class="cmd-card cmd-assign" type="button" data-new-command="1" ${selected ? '' : 'disabled'}${tipAttr({ text: assignTip })}>
      <span class="cmd-top">${selected ? `<b class="cmd-size">${selected}</b>` : ''}</span>
      <span class="cmd-portrait cmd-plus">+</span>
      <b class="cmd-name">Assign</b>
      <span class="cmd-stars">${selected ? 'selected' : 'select first'}</span>
    </button>${cards}`;
}
