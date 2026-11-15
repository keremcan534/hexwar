// DİPLOMASİ EKRANI VE ÜLKE DOSYASI (TASARIM §12; şartname §15).
//
// Neden ayrı modül: screens.js başka bir ekip tarafından düzenleniyor; bu
// dosya ekranın ve dosyanın gövdesini kurar, screens.js yalnız devreder
// (render_diplomacy / render_dossier / bind). Screens örneğinin durumunu ve
// yardımcılarını kullanır (dipFilter, warConfirm, warFocus, vassalConfirm,
// nationTarget, vassalButtons, peaceOfferCard, conflictPanel).
//
// Ekran SAYI ÜRETMEZ: diplomacyView / dossierView ne hesapladıysa onu basar
// (TASARIM ilke 2). Mevcut eylemler mevcut öznitelikleri taşır (data-war,
// data-peace, data-locate, data-nation, data-embargo, data-release-vassal,
// data-annex-vassal, data-dip-filter, data-dip-conflict) ki screens.bind'deki
// işleyiciler çalışmaya devam etsin; yeni ya da değişen her eylem
// `data-dip-act` taşır ve burada bağlanır.

import { MIN_WAR_TURNS, atWar, crisisLeft, nationStrength, overlordOf, relation, truceLeft } from '../game/diplomacy.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { hegemonyScore, scoreboard } from '../game/hegemony.js';
import { governmentType, rulingParty } from '../game/politics.js';
import { formatPopulation, populationOf } from '../game/economy.js';
import { diplomacyView, dossierView } from '../game/diplomacyView.js';
import { warOverview, worldConflicts } from '../game/warView.js';
import { alliesOf, breakAllianceBy, isAllied } from '../game/alliances.js';
import {
  clearRival, declareRival, denounceNap, giveGuarantee, issueDemand, proposeAlliance, proposeNap, protegeThreatened,
  recallEnvoyFrom, renewNap, resolvePending, revokeGuarantee, sendEnvoy,
} from '../game/pacts.js';
import { annexCost, declareIndependence } from '../game/vassals.js';
import { proposeUnion } from '../game/unification.js';
import { ALLIANCE_RULES, AUTONOMY, ENVOY, GUARANTEE } from '../game/dipDefs.js';
import { characterLine, techStanding } from '../game/identity.js';
import { chronicleYear, memoryOf } from '../game/chronicle.js';
import { RESOURCES, RESOURCE_IDS } from '../game/econ/defs.js';
import { glyph } from './icons/glyphs.js';
import { esc, kpi as kitKpi, kpiRow as kitKpiRow, panel as kitPanel, tipAttr } from './kit.js';
import { diplomacyArt, eventArt, gaugeArt, resourceArt } from './icons/art.js';

const tip = (text) => tipAttr({ text });
// Düğme ve başlık içindeki resim metin boyunda ('inline': negatif kenarlı
// 1.5em): satır ve masa yüksekliği resimsiz hâliyle aynı kalır.
const dart = (id) => diplomacyArt(id, 'inline');
// Yuvarlanmış değere göre işaret: −0.04 "−0" değil "+0" yazar.
const fmt = (v, digits = 1) => {
  const r = Number(v.toFixed(digits));
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`;
};
const toneOf = (v) => (v > 0.5 ? 'pos' : v < -0.5 ? 'neg' : 'neutral');
const CONFIRM_MS = 8000;

const FILTERS = [
  ['all', 'All'], ['neighbours', 'Neighbours'], ['war', 'Wars'], ['allies', 'Allies'],
  ['commitments', 'Commitments'], ['threats', 'Threats'],
];
const GROUP = {
  war: 'At war', crisis: 'Ultimatum', ally: 'Allies', vassal: 'Vassals', overlord: 'Overlord', truce: 'Truce',
  rival: 'Rivals', neighbour: 'Neighbours', other: 'Other nations', elsewhere: 'At war elsewhere',
  threat: 'Could attack us',
};

/** Güç karşılaştırmasının düz cümlesi (BUG-016: oran tek başına okunamıyordu). */
function strengthPhrase(myPower, theirPower) {
  if (!(theirPower > 0)) return 'no standing army';
  if (!(myPower > 0)) return 'we have no army';
  const ratio = myPower / theirPower;
  if (ratio >= 1.05) return `we are ${ratio.toFixed(1)}× their strength`;
  if (ratio <= 0.95) return `they are ${(1 / ratio).toFixed(1)}× our strength`;
  return 'evenly matched';
}

/** Defterin bilgi kartı: toplam, parçalar (sönüş yılıyla), etkiler. */
function relationsTip(name, relations) {
  const lines = [`How ${name} regards us: ${fmt(relations.value, 0)}`];
  if (relations.parts.length) {
    for (const part of relations.parts) {
      lines.push(`${part.label} ${fmt(part.value, 0)}${part.fadesBy ? ` · fades by ${part.fadesBy}` : ''}`);
    }
  } else {
    lines.push('No deeds yet: nothing either of us did has left a mark.');
  }
  lines.push(`What it does: ${relations.effects.text}.`);
  return lines.join('\n');
}

/** −100..+100 ortalı çubuk. */
function relationBar(value) {
  const v = Math.max(-100, Math.min(100, value));
  const width = Math.abs(v) / 2;
  const left = v >= 0 ? 50 : 50 - width;
  return `<i class="dip-rbar"><b class="${v >= 0 ? 'pos' : 'neg'}" style="left:${left}%;width:${width}%"></b></i>`;
}

function relationCell(row) {
  const r = row.relations;
  const star = row.envoy.posted
    ? `<button type="button" class="dip-envoy on" data-dip-act="recall" data-dip-arg="${row.id}" aria-label="Recall our envoy from ${esc(row.name)}"${tip(`Our envoy at ${row.name}'s court\n+${ENVOY.RATE} a week up to +${ENVOY.CAP}; costs ${ENVOY.UPKEEP} political power a week.\nClick to recall (free; what was gained fades slowly).`)}>${glyph('star-on', 'ctl')}</button>`
    : `<button type="button" class="dip-envoy" data-dip-act="envoy" data-dip-arg="${row.id}" aria-label="Send an envoy to ${esc(row.name)}"${row.envoy.can ? tip(`Send an envoy to ${row.name}\nRelations +${ENVOY.RATE} a week, up to +${ENVOY.CAP} (about a year's work). Costs ${ENVOY.UPKEEP} political power a week; two envoys at most.`) : ` disabled${tip(`Send an envoy\n${row.envoy.blockers.join('\n')}`)}`}>${glyph('star', 'ctl')}</button>`;
  return `<span class="dip-relcell">
    <span class="dip-relv ${toneOf(r.value)}"${tip(relationsTip(row.name, r))}>${relationBar(r.value)}<em>${fmt(r.value, 0)}</em></span>${star}
  </span>`;
}

function threatCell(row) {
  const t = row.threat;
  if (!t) return '<span class="dip-threat none">—</span>';
  const cls = t.label === 'may attack' ? 'may' : t.label === 'able, not ready' ? 'able' : 'safe';
  const label = t.label === 'able, not ready' ? 'able · not ready' : t.label;
  return `<span class="dip-threat ${cls}"${tip(`Threat from ${row.name}\n${t.text}`)}>${esc(label)}</span>`;
}

function allianceCell(row) {
  if (row.standing === 'ally') return '<b class="pos">ally</b>';
  if (row.standing === 'war') return '<span class="dim">—</span>';
  if (row.allyBlocker) return `<span class="dim"${tip(`Alliance\n${row.allyTip}`)}>no</span>`;
  return `<b class="pos"${tip(`Alliance\n${row.allyTip}`)}>willing</b>`;
}

function warButton(screens, row, cls = 'k-btn sm danger') {
  const confirming = screens.warConfirm === row.id;
  if (row.warBlockers.length) {
    return `<button type="button" class="${cls}" data-war="${row.id}" disabled${tip(`${row.warLabel}\n${row.warBlockers.join('\n')}`)}>${esc(row.warLabel)}</button>`;
  }
  const label = confirming ? (row.warBreaksPact ? 'Confirm: break pact?' : row.warJoinsCall ? 'Confirm join?' : 'Confirm war?') : row.warLabel;
  return `<button type="button" class="${cls}${confirming ? ' confirming' : ''}" data-war="${row.id}"${tip(`${row.warLabel} — ${row.name}\n${row.warTip}${confirming ? '' : '\nClick twice to confirm.'}`)}>${esc(label)}</button>`;
}

// Masa satırının eylem sütunu dar ve sabit: resim düğmeyi iki satıra bölüyordu
// (1920'de bile). Resimli eylemler dosyadadır; masa yalın kalır.
function actionCell(screens, world, row, commitments) {
  if (row.standing === 'war') {
    return `<button type="button" class="k-btn sm" data-peace="${row.id}"${row.talksIn ? ` disabled${tip(`Peace talks open after ${row.talksIn} more weeks of war.`)}` : ''}>${row.talksIn ? `Talks · ${row.talksIn}w` : 'Peace talks'}</button>`;
  }
  if (row.standing === 'crisis') return `<small class="dip-note">ultimatum · ${row.crisis}w</small>`;
  if (row.standing === 'ally') {
    const ally = commitments.allies.find((a) => a.id === row.id);
    return ally ? breakButton(ally) : '';
  }
  if (row.standing === 'vassal') return screens.vassalButtons(world, world.nations[row.id], row.annexBlockers, 'k-btn sm');
  if (row.standing === 'overlord') return '<small class="dip-note">our overlord</small>';
  if (row.standing === 'truce') return `<small class="dip-note">truce · ${row.truce}w</small>`;
  const ally = `<button type="button" class="k-btn sm" data-dip-act="ally" data-dip-arg="${row.id}"${row.allyBlocker
    ? ` disabled${tip(`Propose an alliance\n${row.allyTip}`)}`
    : tip(`Propose an alliance to ${row.name}\n${row.allyTip}\nAn attack on one becomes a call to the other.`)}>Ally</button>`;
  return `${warButton(screens, row)}${ally}`;
}

function breakButton(ally, cls = 'k-btn sm') {
  return `<button type="button" class="${cls}" data-dip-act="break" data-dip-arg="${ally.id}"${ally.breakEnabled
    ? tip(`End the alliance with ${ally.name}\n${ally.breakTip}`)
    : ` disabled${tip(`End the alliance\n${ally.breakTip}`)}`}>${esc(ally.breakLabel)}</button>`;
}

/** Masadaki tek kayıt: kim, ne istiyor, kaç hafta, cevapsız kalırsa ne olur. */
function requestRow(req) {
  const buttons = req.options.map((o) => `<button type="button" class="k-btn sm${o.choice === 'join' || o.choice === 'accept' ? ' primary' : ''}${o.choice === 'yield' ? ' danger' : ''}" data-dip-act="req" data-dip-arg="${req.id}:${o.choice}"${o.enabled ? tip(`${o.label}\n${o.tip}`) : ` disabled${tip(`${o.label}\n${o.tip}`)}`}>${esc(o.label)}</button>`).join('');
  const show = req.tile ? `<button type="button" class="k-btn sm" data-dip-act="tile" data-dip-arg="${req.tile.q},${req.tile.r}"${tip('Show the province on the map.')}>Show</button>` : '';
  return `<div class="dip-req k-${req.kind}">
    <span class="flag" data-flag-nation="${req.flag}" data-flag-w="30" data-flag-h="20" data-flag-style="crest"></span>
    <div class="dip-req-main">
      <b>${dart(req.topic)}${esc(req.title)}</b>
      <small>${esc(req.body)}</small>
      <small class="dip-req-meta"><em>${req.weeksLeft} w</em> · if unanswered: ${esc(req.onTimeout)}</small>
    </div>
    <div class="dip-req-acts">${buttons}${show}</div>
  </div>`;
}

function autonomyMeter(value) {
  const v = Math.max(0, Math.min(100, value));
  return `<span class="dip-auto"><i style="width:${v}%"></i><u style="left:${AUTONOMY.NO_ANNEX}%"></u><u style="left:${AUTONOMY.BREAK}%"></u></span>`;
}

function autonomyTip(name, a) {
  const lines = [`${name}'s autonomy: ${Math.round(a.value)} (heading to ${Math.round(a.target)})`];
  for (const part of a.parts) lines.push(`${part.label} ${fmt(part.value, 0)}`);
  lines.push(`At ${AUTONOMY.NO_ANNEX} they resist annexation; at ${AUTONOMY.BREAK} they break away if the overlord falters (exhaustion ${Math.round(AUTONOMY.LEAVE_EXHAUSTION * 100)}% or at war).`);
  lines.push('An envoy at their court and a rested army keep it down.');
  return lines.join('\n');
}

/** Taahhütler paneli (eski "Alliances" panelinin yerine). */
function commitmentsPanel(screens, world, view) {
  const c = view.commitments;
  const sections = [];
  // Bölüm başlığı anlaşmanın resmini taşır; satırlar yalın kalır (bir resim
  // bölüm başına yeter, satır başına tekrar yüksekliği ve gürültüyü artırırdı).
  const SECTION_ART = {
    Allies: 'alliance', Vassals: 'vassal', 'Guarantees we give': 'guarantee', 'Guaranteed by': 'guarantee',
    Pacts: 'pact', 'Casus belli': 'demand', Overlord: 'vassal',
  };
  const section = (title, rows) => {
    const art = SECTION_ART[title];
    if (rows.length) sections.push(`<div class="dip-csec"><h4>${art ? dart(art) : ''}${esc(title)}</h4>${rows.join('')}</div>`);
  };
  section('Allies', c.allies.map((a) => `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${a.id}">${esc(a.name)}</button><small>${a.cause ? `cause: ${esc(a.cause)}` : 'an attack on one calls the other'}</small>${breakButton(a)}</div>`));
  section('Vassals', c.vassals.map((v) => `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${v.id}">${esc(v.name)}</button><span class="dip-cauto"${tip(autonomyTip(v.name, { value: v.autonomy, target: v.target, parts: v.parts }))}>${autonomyMeter(v.autonomy)}<em>${Math.round(v.autonomy)}</em></span>${screens.vassalButtons(world, world.nations[v.id], v.annexBlockers, 'k-btn sm')}</div>`));
  section('Guarantees we give', c.guaranteesGiven.map((g) => {
    const key = `revoke:${g.id}`;
    const confirming = screens.dipConfirm === key;
    return `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${g.id}">${esc(g.name)}</button><small>${g.threatened ? '<b class="neg">under threat</b>' : `−${GUARANTEE.UPKEEP} PP/wk`}</small><button type="button" class="k-btn sm${g.threatened ? ' danger' : ''}${confirming ? ' confirming' : ''}" data-dip-act="revoke" data-dip-arg="${g.id}"${tip(`Revoke the guarantee of ${g.name}\n${g.revokeTip}`)}>${confirming ? 'Confirm: abandon?' : 'Revoke'}</button></div>`;
  }));
  section('Guaranteed by', c.guaranteesHeld.map((g) => `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${g.id}">${esc(g.name)}</button><small>they are called if anyone attacks us</small></div>`));
  section('Pacts', c.pacts.map((p) => `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${p.id}">${esc(p.name)}</button><small>${esc(p.leftText)}</small>${p.denounced == null
    ? `${p.renewOpen ? `<button type="button" class="k-btn sm" data-dip-act="renew" data-dip-arg="${p.id}"${p.renewEnabled ? tip(`Renew the pact\n${p.renewTip}`) : ` disabled${tip(`Renew the pact\n${p.renewTip}`)}`}>Renew</button>` : ''}<button type="button" class="k-btn sm" data-dip-act="denounce" data-dip-arg="${p.id}"${tip(`Denounce the pact with ${p.name}\nIt ends in 26 weeks; ${p.name} takes it badly (relations −15). Free.`)}>Denounce</button>`
    : '<small class="dip-note">denounced</small>'}</div>`));
  section('Casus belli', c.cbs.map((cb) => `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${cb.id}">${esc(cb.name)}</button><small>${esc(cb.province)} · ${cb.left}w</small><button type="button" class="k-btn sm danger${screens.warConfirm === cb.id ? ' confirming' : ''}" data-war="${cb.id}"${tip(`Declare war on ${cb.name}\nTheir refused demand gives us a free, justified war for ${cb.province}. If we let it lapse, we have backed down (prestige −5).${screens.warConfirm === cb.id ? '' : '\nClick twice to confirm.'}`)}>${screens.warConfirm === cb.id ? 'Confirm war?' : 'Declare · free'}</button></div>`));
  section('Envoys', c.envoys.map((e) => `<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${e.id}">${esc(e.name)}</button><small>at their court: ${fmt(e.standing, 0)} of +${e.cap}</small><button type="button" class="k-btn sm" data-dip-act="recall" data-dip-arg="${e.id}"${tip(`Recall our envoy from ${e.name}\nFree. What was gained fades slowly (half-life about 69 weeks).`)}>Recall</button></div>`));
  if (c.overlord) section('Overlord', [`<div class="dip-crow"><button type="button" class="dip-cname" data-nation="${c.overlord.id}">${esc(c.overlord.name)}</button><small>our foreign policy is theirs</small></div>`]);
  return sections.length ? sections.join('') : '<p class="empty">No commitments. Envoys, pacts and guarantees appear here.</p>';
}

/** DİPLOMASİ MASASI (P). */
export function renderDiplomacyScreen(screens, me) {
  const game = screens.game;
  const world = game.world;
  const turn = game.turns.turn;
  const view = diplomacyView(world, me, turn);
  if (!view?.rows.length) return '<p class="empty">No other nations remain.</p>';
  const filter = screens.dipFilter ?? 'all';
  const conflicts = worldConflicts(world, me.id, turn);
  const warring = new Map();
  for (const c of conflicts) {
    for (const [mine, theirs] of [[c.attackers, c.defenders], [c.defenders, c.attackers]]) {
      for (const n of mine) warring.set(n.id, { key: c.key, foes: theirs.map((x) => x.name) });
    }
  }
  const ours = (row) => row.standing === 'war' || row.standing === 'crisis';
  const threatening = (row) => row.threat && row.threat.label !== 'safe';
  const groupOf = (row) => (filter === 'war' && !ours(row) ? 'elsewhere' : filter === 'threats' ? 'threat' : row.standing);
  const pass = (row) => (filter === 'neighbours' ? row.neighbour
    : filter === 'war' ? ours(row) || warring.has(row.id)
      : filter === 'allies' ? ['ally', 'vassal', 'overlord'].includes(row.standing)
        : filter === 'commitments' ? row.commitment
          : filter === 'threats' ? threatening(row) : true);
  const rows = view.rows.filter(pass);
  if (filter === 'war') rows.sort((a, b) => Number(!ours(a)) - Number(!ours(b)));
  if (filter === 'threats') rows.sort((a, b) => b.threat.ratio / b.threat.needed - a.threat.ratio / a.threat.needed || a.id - b.id);
  const foesText = (id) => {
    const foes = warring.get(id).foes;
    return `vs ${foes.slice(0, 2).join(', ')}${foes.length > 2 ? ` +${foes.length - 2}` : ''}`;
  };
  const relationText = (row) => (groupOf(row) === 'elsewhere' ? foesText(row.id) : null) ?? ({
    war: `at war · ${row.score > 0 ? '+' : ''}${row.score}`,
    crisis: `war in ${row.crisis}w`,
    ally: 'allied',
    vassal: 'our vassal',
    overlord: 'our overlord',
    truce: `truce · ${row.truce}w`,
    rival: row.rivalOfUs ? 'their rival' : 'our rival',
    neighbour: 'neighbour',
    other: '—',
  }[row.standing]);
  let lastGroup = null;
  const table = rows.map((row) => {
    const group = groupOf(row);
    const heading = group !== lastGroup ? `<div class="dip-group">${GROUP[group]}</div>` : '';
    lastGroup = group;
    const ratio = Math.max(0.02, Math.min(4, row.ratio));
    const bar = Math.round(Math.min(1, ratio / 3) * 100);
    // "Komşu" ilişki sütununda zaten yazıyorsa alt satırda tekrarlanmaz.
    const tags = row.tags.filter((t) => !(t === 'neighbour' && row.standing === 'neighbour')).join(' · ');
    return `${heading}<div class="dip-row s-${row.standing}">
      <span class="flag" data-flag-nation="${row.id}" data-flag-w="30" data-flag-h="20" data-flag-style="crest"></span>
      <button type="button" class="dip-name" data-nation="${row.id}"${tip(`${row.name}\nOpen the dossier: relations, agreements, pressure and every action.`)}><b>${esc(row.name)}</b><small>${esc(tags)}</small></button>
      ${group === 'elsewhere'
    ? `<button type="button" class="dip-rel dip-rel-war" data-dip-conflict="${warring.get(row.id).key}"${tip('Open this war: sides, score, losses and occupied states.')}>${esc(relationText(row))}</button>`
    : `<span class="dip-rel">${esc(relationText(row))}</span>`}
      <span class="dip-power"${tip(`Strength\n${row.name} is ${row.ratio >= 1 ? `${row.ratio.toFixed(1)}× as strong as` : `${(row.ratio * 100).toFixed(0)}% as strong as`} your nation (army, fleet and cities).`)}><i style="width:${bar}%"></i><b>×${row.ratio.toFixed(row.ratio < 10 ? 1 : 0)}</b></span>
      ${relationCell(row)}
      ${threatCell(row)}
      <span class="dip-ally">${allianceCell(row)}</span>
      <span class="dip-act">${actionCell(screens, world, row, view.commitments)}</span>
    </div>`;
  }).join('') || '<p class="empty">No nation matches this filter.</p>';
  const counts = {
    commitments: view.rows.filter((r) => r.commitment).length,
    threats: view.rows.filter(threatening).length,
  };
  const filters = `<div class="dip-filters">${FILTERS.map(([id, label]) => `<button type="button" class="k-btn sm${filter === id ? ' on' : ''}" data-dip-filter="${id}" aria-pressed="${filter === id}">${label}${counts[id] != null ? ` <small>${counts[id]}</small>` : ''}</button>`).join('')}</div>`;
  const head = `<div class="dip-row head"><span></span><span>Nation</span><span>Standing</span><span>Strength</span><span${tip('Relations\nHow they regard us: the sum of what we did to each other, fading by 1% a week. A lit star marks our envoy at their court.')}>Relations</span><span${tip('Threat\nCould this neighbour attack us? Their strength against ours plus half of everyone who stands behind us, against the margin they need; then whether they are ready and free.')}>Threat</span><span class="dip-col-ally">Alliance</span><span></span></div>`;

  const rival = view.rivalInfo;
  const commitmentsSub = [
    view.upkeepParts.guarantees ? `${view.upkeepParts.guarantees} guarantee${view.upkeepParts.guarantees === 1 ? '' : 's'}` : '',
    view.upkeepParts.pacts ? `${view.upkeepParts.pacts} pact${view.upkeepParts.pacts === 1 ? '' : 's'}` : '',
    view.upkeepParts.envoys ? `${view.upkeepParts.envoys} envoy${view.upkeepParts.envoys === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ') || 'nothing pledged';
  const kpis = kitKpiRow([
    // Kötü şöhret ve savaş üst çubuğun resimleriyle: aynı sayı iki resimle iki ayrı sayı sanılır.
    kitKpi({ icon: gaugeArt('infamy', 'md'), label: 'Infamy', value: `${view.infamy.toFixed(1)} / ${view.infamyCap}`, sub: view.infamy >= view.infamyCap ? 'coalitions can form' : 'coalition threshold', tip: 'infamy', meter: view.infamy / view.infamyCap, meterTone: view.infamy >= view.infamyCap ? 'neg' : view.infamy >= view.infamyCap * 0.6 ? 'warn' : '', cls: 'hero' }),
    kitKpi({ icon: gaugeArt('war_support', 'md'), label: 'Wars', value: String(view.wars), sub: view.crises ? `${view.crises} ultimatum${view.crises === 1 ? '' : 's'}` : 'at war with you' }),
    kitKpi({ icon: diplomacyArt('alliance', 'md'), label: 'Allies', value: `${view.allies} / ${view.maxAllies}`, sub: '' }),
    kitKpi({ label: 'Envoys', value: `${view.envoys.used} / ${view.envoys.slots}`, sub: `+${view.envoys.rate} a week each, up to +${view.envoys.cap}`, tip: { text: `Envoys\nAn envoy raises how a court regards us by ${view.envoys.rate} a week, up to +${view.envoys.cap}. Send one with the star in a row or from a dossier.` } }),
    kitKpi({ label: 'Commitments', value: view.upkeep > 0 ? `−${view.upkeep.toFixed(2)} PP/wk` : '0 PP/wk', sub: commitmentsSub, tip: { text: `Commitments\nEnvoys cost ${ENVOY.UPKEEP} and each guarantee we give ${GUARANTEE.UPKEEP} political power a week. If power runs dry the newest envoy is recalled, then the newest guarantee.` } }),
    kitKpi({
      label: 'Rival', value: esc(rival.name ?? 'none'),
      sub: rival.declared ? `declared ${rival.declared}${rival.lockedUntil ? ` · locked until ${rival.lockedUntil}` : ''}`
        : rival.name ? 'assigned by circumstance — declare your own in a dossier' : view.rivalsOfUs.length ? `rival of ${esc(view.rivalsOfUs.slice(0, 2).join(', '))}` : 'nobody names you rival',
      cls: 'is-text',
    }),
  ]);

  const wars = warOverview(world, me.id, turn);
  const warList = wars.wars.length || wars.crises.length
    ? `${wars.crises.map((c) => `<div class="dip-war crisis"><b>${esc(c.name)}</b><small>ultimatum · war in ${c.weeksLeft}w</small></div>`).join('')}${wars.wars.map((w) => `<div class="dip-war ${w.score > 8 ? 'winning' : w.score < -8 ? 'losing' : 'even'}" data-tip="war" data-tip-arg="${w.enemyId}">
        <b>${esc(w.name)}</b><em>${w.score > 0 ? '+' : ''}${w.score}</em>
        <small>${w.lossesOurs > 0 ? `−${formatPopulation(w.lossesOurs)}` : '0'} / ${w.lossesTheirs > 0 ? `−${formatPopulation(w.lossesTheirs)}` : '0'} men · ${w.weeks}w · holds ${w.holdTheirs}/${w.holdOurs}</small>
      </div>`).join('')}`
    : '<p class="empty">At peace.</p>';
  const offers = (game.peaceOffers ?? []).filter((entry) => entry.to === me.id).map((entry) => screens.peaceOfferCard(entry)).join('');
  const focus = screens.warFocus ? conflicts.find((c) => c.key === screens.warFocus) ?? null : null;
  // Seçili savaş bittiyse panel sessizce kapanır.
  if (screens.warFocus && !focus) screens.warFocus = null;
  const sideName = (list) => `${esc(list[0].name)}${list.length > 1 ? ` +${list.length - 1}` : ''}`;
  const worldList = conflicts.length
    ? conflicts.map((c) => `<button type="button" class="dip-war dip-conflict${focus?.key === c.key ? ' on' : ''}" data-dip-conflict="${c.key}">
        <span class="dip-cflags"><span class="flag" data-flag-nation="${c.lead[0]}" data-flag-w="24" data-flag-h="16" data-flag-style="crest"></span><span class="flag" data-flag-nation="${c.lead[1]}" data-flag-w="24" data-flag-h="16" data-flag-style="crest"></span></span>
        <b>${sideName(c.attackers)} <i>vs</i> ${sideName(c.defenders)}</b><em>${c.score > 0 ? '+' : ''}${c.score}</em>
        <small>${c.weeks}w · held ${c.holdA}/${c.holdB}${c.battles ? ` · ${c.battles} ${c.battles === 1 ? 'battle' : 'battles'}` : ''}</small>
      </button>`).join('')
    : '<p class="empty">No other wars in the world.</p>';
  const requests = view.requests.length
    ? kitPanel('Requests', view.requests.map(requestRow).join(''), { sub: '', cls: 'dip-requests' })
    : '';

  return `${kpis}
    <div class="k-split dip-split">
      ${kitPanel('Nations', `${filters}<div class="dip-table v2">${head}${table}</div>`, { sub: `${view.rows.length} nations · ${view.neighbours} neighbours`, cls: 'dip-nations' })}
      <div class="k-stack">
        ${requests}
        ${focus ? screens.conflictPanel(focus) : ''}
        ${offers ? kitPanel('Peace offers', offers, { sub: 'answer within six weeks' }) : ''}
        ${kitPanel('Our wars', warList, { sub: 'score · losses · weeks · states held', right: '' })}
        ${kitPanel('World wars', worldList, { sub: `${conflicts.length} ${conflicts.length === 1 ? 'war' : 'wars'} · click for details` })}
        ${kitPanel('Commitments', commitmentsPanel(screens, world, view), { sub: `${view.allies} of ${view.maxAllies} alliance seats · ${view.envoys.used} of ${view.envoys.slots} envoys`, cls: 'dip-commit' })}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- DOSYA ---
//
// Dar sol panel: haritada yabancı toprağa sağ tıkla (ya da masada bir ada
// tıklayınca) açılır. Sıra oyuncunun sorusunu izler: kim (başlık), ne
// yapabilirim (eylemler), bana nasıl bakıyorlar (ilişki), ne kadar güçlüler
// (künye), ne yaşadılar (kayıt). Eylemler eskiden en alttaydı ve 1366×768'de
// kaydırmadan görünmüyordu; kapatma düğmesi sekme çubuğunun öbür ucundaydı;
// puanlar ve künye geniş ızgaralara yayılıp boşluk yiyordu (Kerem: "çarpı
// yok, asıl şeyler aşağıda kalıyor", "aşırı boşluk israfı").

/**
 * Eylem kutusu: resim, ad (+ karşı tarafın hükmü) ve alt satır (bedel ·
 * etki). Hüküm oyunun kendi ölçüsüdür (allianceVerdict, napVerdict,
 * demandVerdict): oyuncu tıklamadan kabul edip etmeyeceklerini görür.
 * Kapalı kutu yerinde kalır — ilk engeli alt satırda, hepsi bilgi kartında —
 * ki kutular ülkeden ülkeye yer değiştirmesin. İki satır da tek satıra
 * kırpılır: kutu boyu haftalık değerle oynamaz.
 */
function actTile({
  act = null, arg = '', attrs = '', icon = '', label, title = label, cost = '', note = '', tone = '',
  verdict = null, blockers = [], offNote = null, tipText = '', cls = '', confirming = false,
  confirmLabel = 'Confirm?', twoClick = false, power = null,
}) {
  const off = blockers.length > 0;
  const armed = confirming && !off;
  const data = act ? ` data-dip-act="${act}" data-dip-arg="${esc(arg)}"` : attrs;
  const card = off ? [title, ...blockers] : [title, tipText, twoClick && !armed ? 'Click twice to confirm.' : ''];
  // Engel siyasi güç yetmezliğiyse dar kutu "we have N" der: bedel zaten
  // solunda, uzun cümle 1366'da "Needs 60 political po…" diye kırpılıyordu.
  const short = off && power != null && /political power/i.test(blockers[0]) ? `we have ${Math.floor(power)}` : null;
  const said = off ? (offNote ?? short ?? blockers[0]) : note;
  const sub = [
    cost ? `<em>${esc(cost)}</em>` : '',
    said ? `<i class="${off ? 'neg' : tone}">${esc(said)}</i>` : '',
  ].filter(Boolean).join('<span class="dsr-dot">·</span>');
  const mark = verdict ? `<i class="dsr-vd ${verdict.yes ? 'pos' : 'neg'}">${esc(verdict.text)}</i>` : '';
  return `<button type="button" class="k-btn dsr-act${cls ? ` ${cls}` : ''}${armed ? ' confirming' : ''}"${data}${off ? ' disabled' : ''}${tip(card.filter(Boolean).join('\n'))}>
      <span class="dsr-ico">${icon}</span>
      <span class="dsr-txt"><b><span>${esc(armed ? confirmLabel : label)}</span>${armed ? '' : mark}</b><small>${sub}</small></span>
    </button>`;
}

/**
 * Hükmün kutudaki hâli. Sert engel varsa (savaşta, koltuk dolu) hüküm
 * gösterilmez: o zaman "reddeder" demek yanlış olurdu, engel konuşur.
 * Ret kutuyu kapatır; alt satır neden yetmediğini sayıyla söyler.
 */
function verdictOf(verdict, hard, yes) {
  if (hard.length) return { blockers: hard };
  const sum = Math.abs(verdict.sum) < 0.05 ? 0 : verdict.sum;
  return {
    verdict: { yes: verdict.accept, text: verdict.accept ? yes : 'refuses' },
    blockers: verdict.accept ? [] : [verdict.sentence],
    offNote: verdict.accept ? null : `${sum.toFixed(1)} of ${verdict.threshold} needed`,
  };
}

/** ÜLKE DOSYASI (yabancı toprağa sağ tık). */
export function renderDossierScreen(screens, me) {
  const game = screens.game;
  const world = game.world;
  const target = world.nations[screens.nationTarget];
  if (!target?.alive) {
    return '<p class="empty">Right-click a foreign state on the map to open its dossier.</p>';
  }
  if (target.id === me.id) return '<p class="empty">This is our own state: open the Nation tab.</p>';
  const turn = game.turns.turn;
  const rec = relation(world, me.id, target.id);
  const war = atWar(world, me.id, target.id);
  const ctx = {
    screens, world, me, target, turn,
    view: dossierView(world, me, target, turn),
    war,
    crisis: crisisLeft(world, me.id, target.id, turn),
    truce: truceLeft(world, me.id, target.id, turn),
    // Barış masası savaşın ilk haftalarında kapalıdır: kaç hafta kaldı.
    talksIn: war ? Math.max(0, MIN_WAR_TURNS - (turn - rec.since)) : 0,
    vassal: overlordOf(world, target.id, turn) === me.id,
    overlord: overlordOf(world, me.id, turn) === target.id,
    allied: isAllied(me, target.id),
  };
  const offer = (game.peaceOffers ?? []).find((entry) => entry.from === target.id && entry.to === me.id);
  // Ulusun harita rengi panelin vurgusudur: oyuncu dosyayı haritadaki lekesiyle eşler.
  return `<div class="dsr" style="--nc:${esc(target.color ?? '#8a7a55')}">
      ${dossierHead(ctx)}
      ${dossierActions(ctx)}
      ${offer ? screens.peaceOfferCard(offer) : ''}
      ${dossierRelations(ctx)}
      ${dossierProfile(ctx)}
      ${dossierRecord(ctx)}
    </div>`;
}

/** Başlıktaki durum çipleri: önce savaş/barış, sonra bağlar ve kinler. */
function statusChips({ me, target, view, turn, war, crisis, truce, vassal, overlord, allied }) {
  const chip = (cls, text, tipText = '') => `<span class="dsr-chip ${cls}"${tipText ? tip(tipText) : ''}>${esc(text)}</span>`;
  const weeks = (w) => (w >= 52 ? `${Math.floor(w / 52)}y` : `${w}w`);
  const out = [
    war ? chip('c-war', 'At war')
      : crisis ? chip('c-crisis', `War in ${crisis}w`, `Ultimatum\nWar begins in ${crisis} weeks unless it is settled.`)
        : truce ? chip('c-truce', `Truce ${truce}w`, 'Truce\nA truce forbids a new declaration until it lapses.')
          : chip('c-peace', 'At peace'),
  ];
  if (allied) out.push(chip('c-ally', 'Ally', 'Ally\nAn attack on one is a call to the other.'));
  if (vassal) out.push(chip('c-ally', `Our vassal · ${Math.round(view.autonomy?.value ?? 0)}%`, 'Our vassal\nThey pay us tribute; their autonomy decides how long.'));
  if (overlord) out.push(chip('c-ally', 'Our overlord', 'Our overlord\nOur foreign policy is theirs.'));
  if (view.pact) out.push(chip('c-truce', view.pact.denounced != null ? `Pact ends ${view.pact.left}w` : `Pact ${weeks(view.pact.left)}`));
  if (view.guaranteed) out.push(chip('c-ally', 'Guaranteed by us'));
  if (view.guaranteesUs) out.push(chip('c-ally', 'Guarantees us'));
  if (view.envoy.posted) out.push(chip('c-info', 'Our envoy'));
  if (view.cb) out.push(chip('c-war', `Casus belli ${Math.max(0, view.cb.expires - turn)}w`));
  if (me.rivalId === target.id) out.push(chip('c-rival', me.rivalChosen != null ? 'Our declared rival' : 'Our rival'));
  if (target.rivalId === me.id) out.push(chip('c-rival', 'Sees us as rival'));
  if ((me.embargoes ?? []).includes(target.id)) out.push(chip('c-war', 'Embargoed'));
  else if ((target.embargoes ?? []).includes(me.id)) out.push(chip('c-war', 'Embargoes us'));
  return out.join('');
}

/**
 * Başlık: bayrak, ad, sıra, hükümet, durum; sağ üstte haritada göster ve
 * kapat. Gövdenin içinde yapışkandır: aşağı kaydırılsa da çarpı elde kalır.
 */
function dossierHead(ctx) {
  const { world, target } = ctx;
  const board = scoreboard(world);
  const rank = board.findIndex((row) => row.nation.id === target.id) + 1;
  const score = hegemonyScore(world, target);
  const party = rulingParty(target);
  const gov = governmentType(target);
  const rankTip = `Rank #${rank} of ${board.length}\nHegemony score ${score.total}: industry ${score.industry} · population ${score.population} · land ${score.land} · prestige ${score.prestige}${score.goal ? ` · goal ${score.goal}` : ''}.`;
  return `<header class="dsr-head">
      <span class="dsr-flag" data-flag-nation="${target.id}" data-flag-w="90" data-flag-h="60"></span>
      <div class="dsr-id">
        <h2><span class="dsr-name">${esc(target.name)}</span><span class="dsr-rank"${tip(rankTip)}><small>rank</small>#${rank}</span></h2>
        <p class="dsr-gov"${tip(`${gov}\n${party.name} govern: ${party.pitch}`)}>${esc(gov)}<span class="dsr-dot">·</span><i class="dsr-party" style="--pc:${esc(party.color)}"></i>${esc(party.name)}</p>
        <div class="dsr-chips">${statusChips(ctx)}</div>
      </div>
      <div class="dsr-tools">
        <button type="button" class="icon-btn dsr-tool" data-locate="${target.id}" aria-label="Show ${esc(target.name)} on the map"${tip(`Show on the map\nCentres the map on ${target.name} and closes this panel.`)}>${glyph('locate')}</button>
        <button type="button" class="icon-btn dsr-tool dsr-close" data-dsr-close aria-label="Close"${tip('Close\nEsc closes it too.')}>${glyph('close')}</button>
        <kbd class="dsr-esc" aria-hidden="true">Esc</kbd>
      </div>
    </header>`;
}

/**
 * Eylem şeridi, başlığın hemen altında. İki sütun, sabit sıra: solda
 * yakınlaşma (elçi, ittifak, pakt, garanti, birlik, barış), sağda baskı
 * (rakip, ambargo, talep, savaş). Aynı eylem her ülkede aynı yerde durur.
 */
function dossierActions({ screens, world, me, target, view, war, talksIn, vassal, overlord, allied }) {
  // Her kutu siyasi gücümüzü bilir: güç yetmezliği kısa yazılır (actTile).
  const tile = (spec) => actTile({ power: me.power ?? 0, ...spec });
  const v = view.verdicts;
  const id = target.id;
  const accord = [];
  const pressure = [];
  // Elçi her hâlde ilk kutudur: ilişkinin tek sürekli kaldıracı.
  accord.push(view.envoy.posted
    ? tile({
      act: 'recall', arg: id, icon: glyph('star-on'), label: 'Recall envoy', cost: 'free',
      note: `at ${fmt(view.envoy.standing, 0)} of +${ENVOY.CAP}`,
      tipText: `Free. Our envoy stands at ${fmt(view.envoy.standing, 0)} of +${ENVOY.CAP}; it fades slowly once recalled.`,
    })
    : tile({
      act: 'envoy', arg: id, icon: glyph('star'), label: 'Send envoy', cost: `${ENVOY.UPKEEP} PP/wk`,
      note: `+${ENVOY.RATE}/wk, up to +${ENVOY.CAP}`, tone: 'pos', blockers: view.envoy.blockers,
      tipText: `Relations +${ENVOY.RATE} a week up to +${ENVOY.CAP} (+25 after about 37 weeks). Two envoys at most.`,
    }));
  if (war) {
    accord.push(tile({
      attrs: ` data-peace="${id}"`, icon: diplomacyArt('peace', 'sm'), label: 'Peace talks', note: 'the treaty, state by state',
      blockers: talksIn > 0 ? [`Peace talks open after ${talksIn} more weeks of war.`] : [],
      offNote: `open in ${talksIn} weeks`,
      tipText: 'A treaty is negotiated state by state at the peace table; what we take cannot exceed our war score.',
    }));
  } else {
    if (allied) {
      const b = view.allyBreak;
      if (b) {
        accord.push(tile({
          act: 'break', arg: id, icon: diplomacyArt('alliance', 'sm'), label: 'Break alliance', title: `End the alliance with ${target.name}`,
          cost: b.cause ? 'free' : `${ALLIANCE_RULES.BREAK_POWER} PP`, note: b.cause ? 'they gave cause' : 'without cause', tone: b.cause ? '' : 'warn',
          blockers: b.breakEnabled ? [] : [b.breakTip], tipText: b.breakTip,
        }));
      }
    } else if (!vassal && !overlord) {
      accord.push(tile({
        act: 'ally', arg: id, icon: diplomacyArt('alliance', 'sm'), label: 'Propose alliance', cost: 'free', note: 'mutual defence',
        ...verdictOf(v.ally, v.ally.blockers, 'accepts'),
        tipText: `${v.ally.sentence}\nAn attack on one becomes a call to the other.`,
      }));
    }
    if (view.pact) {
      if (view.pact.denounced == null) {
        accord.push(tile({
          act: 'renew', arg: id, icon: diplomacyArt('pact', 'sm'), label: 'Renew pact', title: 'Renew the non-aggression pact',
          cost: `${view.costs.nap} PP`, note: 'five more years',
          ...verdictOf({ ...v.nap.verdict, sentence: v.nap.sentence }, v.nap.blockers, 'signs'),
          tipText: `${v.nap.sentence}\nFive more years.`,
        }));
        pressure.push(tile({
          act: 'denounce', arg: id, icon: diplomacyArt('pact', 'sm'), label: 'Denounce pact', cost: 'free', note: 'ends in 26 weeks',
          tipText: `The pact ends in 26 weeks; ${target.name} takes it badly (relations −15).`,
        }));
      }
    } else if (!allied && !vassal && !overlord) {
      accord.push(tile({
        act: 'nap', arg: id, icon: diplomacyArt('pact', 'sm'), label: 'Sign pact', title: 'Non-aggression pact',
        cost: `${view.costs.nap} PP`, note: 'five years of peace',
        ...verdictOf({ ...v.nap.verdict, sentence: v.nap.sentence }, v.nap.blockers, 'signs'),
        tipText: `${v.nap.sentence}\nFive years in which neither of us may declare war; a denunciation gives 26 weeks' notice. Breaking it costs +8 infamy and every partner's trust.`,
      }));
    }
    if (v.guarantee.guaranteed) {
      accord.push(tile({
        act: 'revoke', arg: id, icon: diplomacyArt('guarantee', 'sm'), label: 'Revoke guarantee', cost: 'free',
        note: v.guarantee.threatened ? 'abandons them under threat' : `saves ${GUARANTEE.UPKEEP} PP/wk`, tone: v.guarantee.threatened ? 'neg' : '',
        tipText: v.guarantee.threatened ? `They are under threat: revoking now is abandonment — prestige −${GUARANTEE.ABANDON_PRESTIGE}, them −40, every partner −10.` : `Free; ${target.name} −15. Saves ${GUARANTEE.UPKEEP} political power a week.`,
        cls: v.guarantee.threatened ? 'danger' : '',
        confirming: v.guarantee.threatened && screens.dipConfirm === `revoke:${id}`, confirmLabel: 'Confirm: abandon them?', twoClick: v.guarantee.threatened,
      }));
    } else if (!allied && !vassal && !overlord) {
      accord.push(tile({
        act: 'guarantee', arg: id, icon: diplomacyArt('guarantee', 'sm'), label: 'Guarantee', title: 'Guarantee their independence',
        cost: `${view.costs.guarantee} PP + ${view.costs.guaranteeUpkeep}/wk`, blockers: v.guarantee.blockers,
        tipText: 'If anyone declares war on them, we are called. Our strength counts in every attacker\'s odds against them, and no kindred state may absorb them while we guarantee them.',
      }));
    }
    if (v.union) {
      accord.push(tile({
        act: 'union', arg: id, icon: eventArt('unification', 'sm'), label: 'Propose union', cost: `${v.union.cost} PP`,
        note: 'their state joins ours', tone: 'pos', blockers: v.union.blockers,
        tipText: 'Their whole state joins ours in peace. A little infamy, much prestige.',
      }));
    }
    if (vassal) {
      // Vassal düğmeleri screens.bind'in iki tık kalıbıyla çalışır
      // (data-release-vassal / data-annex-vassal, screens.vassalConfirm).
      const armed = (kind) => screens.vassalConfirm === `${kind}:${id}`;
      accord.push(tile({
        attrs: ` data-release-vassal="${id}"`, icon: eventArt('independence', 'sm'), label: 'Release', title: `Release ${target.name}`,
        cost: 'free', note: 'tribute stops', cls: 'danger', confirming: armed('release'), confirmLabel: 'Confirm release?', twoClick: true,
        tipText: 'The tribute stops and they become fully independent. Only then can you declare war on them.',
      }));
      pressure.push(tile({
        attrs: ` data-annex-vassal="${id}"`, icon: diplomacyArt('vassal', 'sm'), label: 'Annex', title: `Annex ${target.name}`,
        cost: `${annexCost(world, target)} PP`, note: 'their provinces join us', blockers: view.annexBlockers ?? [],
        cls: 'danger', confirming: armed('annex'), confirmLabel: 'Confirm annex?', twoClick: true,
        tipText: 'Their provinces join us and their army disbands. Their peoples become our subjects, and it costs a quarter of a conquest\'s infamy.',
      }));
    }
    if (v.rival.declared) {
      pressure.push(tile({
        act: 'clear-rival', arg: id, icon: glyph('swords'), label: 'Clear rival', cost: 'free', note: 'the lock stays',
        tipText: 'Free. The lock stays; the yearly review assigns a rival again.',
      }));
    } else if (!allied && !vassal && !overlord) {
      pressure.push(tile({
        act: 'rival', arg: id, icon: glyph('swords'), label: 'Declare rival', cost: `${view.costs.rival} PP`,
        note: 'war on them justified', blockers: v.rival.blockers,
        tipText: `War on them becomes justified (20); nations that share this rival lean toward us; ${target.name} −20. Locked for two years.${v.rival.assigned ? ' They are already our rival by circumstance: declaring keeps them there.' : ''}`,
      }));
    }
  }
  // Ambargo yürürlükteyken de kutu durur (kapalı): yer kaymaz, durum okunur.
  pressure.push(tile({
    attrs: ` data-embargo="${id}"`, icon: diplomacyArt('embargo', 'sm'), label: v.embargo.active ? 'Embargo in force' : 'Embargo',
    title: `Embargo ${target.name}`, cost: v.embargo.active ? '' : `${v.embargo.cost} PP`, note: 'cuts trade both ways',
    blockers: v.embargo.blockers,
    tipText: `Cuts trade both ways. Costs ${v.embargo.cost} political power; ${target.name} −20 in relations.`,
  }));
  if (!war && !vassal && !overlord && !allied) {
    for (const d of view.demands) {
      const key = `demand:${id}:${d.provinceId}`;
      pressure.push(tile({
        act: 'demand', arg: `${id}:${d.provinceId}`, icon: diplomacyArt('demand', 'sm'), label: `Demand ${d.name}`,
        cost: `${view.costs.demand} PP · +${view.costs.demandInfamy} infamy`,
        verdict: d.blockers.length ? null : { yes: d.verdict.yield, text: d.verdict.yield ? 'yields' : 'refuses' },
        blockers: d.blockers, cls: 'danger', confirming: screens.dipConfirm === key, confirmLabel: `Confirm: demand ${d.name}?`, twoClick: true,
        tipText: `"Give us ${d.name} or war." Now ${d.text}. If they refuse we hold a free cause for war for a year.`,
      }));
    }
    if (!view.demands.length && view.demandWhy) {
      // Talep edilecek il yoksa kutu kapalı durur; nedeni oyunun kendi engelidir.
      pressure.push(tile({
        icon: diplomacyArt('demand', 'sm'), label: 'Demand a province', title: 'Territorial demand',
        cost: `${view.costs.demand} PP`, blockers: [view.demandWhy], cls: 'danger',
      }));
    }
    const w = view.war;
    pressure.push(tile({
      attrs: ` data-war="${id}"`, icon: gaugeArt('war_support', 'sm'), label: w.call ? 'Join the war' : 'Declare war', title: `${w.label} — ${target.name}`,
      cost: w.call || w.cb ? 'free' : `${w.cost} PP`,
      note: w.call ? 'as a defender' : w.pact ? 'breaks our pact' : w.cb ? 'casus belli' : '8-week ultimatum', tone: w.pact ? 'neg' : '',
      blockers: w.blockers, tipText: w.tip, cls: 'danger', twoClick: true,
      confirming: screens.warConfirm === id, confirmLabel: w.pact ? 'Confirm: break pact?' : w.call ? 'Confirm join?' : 'Confirm war?',
    }));
  }
  if (view.ourAutonomy) {
    const key = `indep:${id}`;
    pressure.push(tile({
      act: 'independence', arg: id, icon: eventArt('independence', 'sm'), label: 'Declare independence', cost: 'free',
      note: `our autonomy ${Math.round(view.ourAutonomy.value)}`, blockers: view.independence ?? [],
      cls: 'danger', confirming: screens.dipConfirm === key, confirmLabel: 'Confirm: independence?', twoClick: true,
      tipText: `Free: a war of independence against ${target.name}, no calls to arms. Our autonomy is ${Math.round(view.ourAutonomy.value)}.`,
    }));
  }
  return `<section class="dsr-sec dsr-dip">
      <div class="dsr-acts-h"><h3 class="dsr-h"><span>Accord</span></h3><h3 class="dsr-h"><span>Pressure</span></h3></div>
      <div class="dsr-acts"><div class="dsr-col">${accord.join('')}</div><div class="dsr-col">${pressure.join('')}</div></div>
    </section>`;
}

/** Görünür neden satırı en çok bu kadar; fazlası tek satırda toplanır. */
const SHOWN_PARTS = 4;

/**
 * İlişki: nasıl görüyorlar (ölçek başlığın çizgisidir) ve nedenleri, en
 * ağırı önde. "Ne işe yarar" cümlesi başlığın bilgi kartındadır (ikincil).
 */
function dossierRelations({ target, view }) {
  const r = view.relations;
  const v = Math.max(-100, Math.min(100, r.value));
  const fill = `left:${v >= 0 ? 50 : 50 + v / 2}%;width:${Math.abs(v) / 2}%`;
  const row = (p) => `<li><span>${esc(p.label)}</span><b class="${p.value >= 0 ? 'pos' : 'neg'}">${fmt(p.value, 0)}</b><small>${p.fadesBy ? `fades by ${p.fadesBy}` : ''}</small></li>`;
  const cut = r.parts.length > SHOWN_PARTS ? SHOWN_PARTS - 1 : SHOWN_PARTS;
  const rest = r.parts.slice(cut);
  const restSum = rest.reduce((sum, p) => sum + p.value, 0);
  const more = rest.length
    ? `<li class="more"${tip(relationsTip(target.name, r))}><span>${rest.length} more: ${esc(rest.map((p) => p.label).join(', '))}</span><b class="${restSum >= 0 ? 'pos' : 'neg'}">${fmt(restSum, 0)}</b><small></small></li>`
    : '';
  const parts = r.parts.length
    ? `<ul class="dsr-parts">${r.parts.slice(0, cut).map(row).join('')}${more}</ul>`
    : '<p class="dsr-quiet">No deeds yet: neither of us has done anything the other remembers.</p>';
  return `<section class="dsr-sec dsr-rel">
      <h3 class="dsr-h"${tip(relationsTip(target.name, r))}><span>How ${esc(target.name)} regards us</span><i class="dsr-rbar"><b class="${v >= 0 ? 'pos' : 'neg'}" style="${fill}"></b></i><em class="dsr-relv ${toneOf(r.value)}">${fmt(r.value, 0)}</em></h3>
      ${parts}
    </section>`;
}

/** Künyede başka ulusun adı: dosyasını açar; biz isek "us". */
function nationLink(me, id, name) {
  if (id === me.id) return '<b class="dsr-us">us</b>';
  return `<button type="button" class="dip-cname" data-nation="${id}">${esc(name)}</button>`;
}

/**
 * Künye: iki sütunlu anahtar/değer tablosu. Kısa sayılar ikişer bir satırda,
 * uzun değerler (güç, teknoloji, mallar, tehdit) tam satırda. Sütunlar sabit
 * paylıdır: haftalık değer değişince komşu hücre kaymaz.
 */
function dossierProfile({ world, me, target, view }) {
  const myPower = nationStrength(world, me);
  const power = nationStrength(world, target);
  const share = myPower + power > 0 ? myPower / (myPower + power) : 0.5;
  const cities = world.cities.filter((city) => city.nationId === target.id).length;
  const industry = (target.economy?.ic?.total ?? 0).toFixed(1);
  const output = (target.economy?.ic?.output ?? 0).toFixed(1);
  const records = target.economy?.resources ?? {};
  const exports = RESOURCE_IDS
    .filter((rid) => (records[rid]?.exported ?? 0) > 0.05)
    .sort((a, b) => (records[b].exported ?? 0) - (records[a].exported ?? 0))
    .slice(0, 3)
    .map((rid) => `<span class="dsr-res">${resourceArt(rid, 'xs')}${esc(RESOURCES[rid].name)}</span>`);
  const imports = RESOURCE_IDS
    .filter((rid) => (records[rid]?.imported ?? 0) > 0.05 && (records[rid]?.need ?? 0) > 0)
    .sort((a, b) => records[b].imported / records[b].need - records[a].imported / records[a].need)
    .slice(0, 3)
    .map((rid) => {
      const pct = Math.round(records[rid].imported / records[rid].need * 100);
      return `<span class="dsr-res"${tip(`${RESOURCES[rid].name}\n${pct}% of what they need comes from abroad.`)}>${resourceArt(rid, 'xs')}${esc(RESOURCES[rid].name)}<small>${pct}%</small></span>`;
    });
  const standing = techStanding(world, target);
  const allies = alliesOf(target).map((aid) => world.nations[aid]).filter((n) => n?.alive);
  const rival = target.rivalId != null ? world.nations[target.rivalId] : null;
  const none = (text) => `<span class="dsr-none">${text}</span>`;
  const pair = (k1, v1, k2, v2, t1 = '', t2 = '') => `<div class="dsr-r"><span class="k">${k1}</span><span class="v"${t1}>${v1}</span><span class="k">${k2}</span><span class="v"${t2}>${v2}</span></div>`;
  const wide = (k, val, t = '', cls = '') => `<div class="dsr-r wide"><span class="k">${k}</span><span class="v${cls ? ` ${cls}` : ''}"${t}>${val}</span></div>`;
  const threat = (d) => {
    const cls = d.label === 'may attack' ? 'may' : d.label === 'able, not ready' ? 'able' : 'safe';
    return `<span class="dsr-threat">${nationLink(me, d.id, d.name)}<span class="dip-threat ${cls}"${tip(`${d.name} against ${target.name}\n${d.text}`)}>${esc(d.label === 'able, not ready' ? 'able · not ready' : d.label)}</span></span>`;
  };
  const rows = [
    pair('Population', esc(formatPopulation(populationOf(world, target))), 'Territory', `${target.tiles}<small>hexes</small>`),
    pair('Cities', String(cities), 'Infamy', `${(target.infamy ?? 0).toFixed(1)}<small>of ${INFAMY_COALITION}</small>`,
      '', tip(`Infamy\nAt ${INFAMY_COALITION} other nations can form a coalition against them.`)),
    pair('Output', `${output}<small>IC/wk</small>`, 'Industry', `${industry}<small>IC</small>`),
    wide('Strength', `<span class="${myPower >= power ? 'pos' : 'neg'}">${esc(strengthPhrase(myPower, power))}</span><i class="dsr-sbar"><b style="width:${Math.round(share * 100)}%"></b></i>`,
      tip(`Strength: army, fleet and cities\nOurs ${Math.round(myPower)} · theirs ${Math.round(power)}. The bar is our share of the two.`), 'flex'),
    wide('Technology', `${esc(standing.label)}<small>#${standing.rank ?? '—'} of ${standing.of ?? '—'} · ${standing.research} researched</small>`),
    wide('Exports', exports.length ? exports.join('') : none('little of note'), '', 'flex'),
    wide('Depends on', imports.length ? imports.join('') : none('no major imports'), '', 'flex'),
    pair('Allies', allies.length ? allies.map((n) => nationLink(me, n.id, n.name)).join('<span class="dsr-comma">,</span>') : none('none'),
      'Rival', rival?.alive ? nationLink(me, rival.id, rival.name) : none('none declared'),
      allies.length ? tip(`Allies of ${target.name}\n${allies.map((n) => n.name).join(', ')}`) : ''),
    wide('Threatened by', view.dangers.length ? view.dangers.map(threat).join('') : none('no neighbour is able to attack them'), '', 'flex'),
  ];
  if (view.autonomy) {
    rows.push(wide('Autonomy', `${autonomyMeter(view.autonomy.value)}<em>${Math.round(view.autonomy.value)}</em><small>heading to ${Math.round(view.autonomy.target)}</small>`,
      tip(autonomyTip(target.name, view.autonomy)), 'flex dip-cauto'));
  }
  if (view.ourAutonomy) {
    rows.push(wide('Our autonomy', `${autonomyMeter(view.ourAutonomy.value)}<em>${Math.round(view.ourAutonomy.value)}</em><small>independence at ${view.costs.independenceAt}</small>`,
      tip(autonomyTip('Our', view.ourAutonomy)), 'flex dip-cauto'));
  }
  return `<section class="dsr-sec dsr-prof">
      <h3 class="dsr-h"><span>Profile</span></h3>
      <div class="dsr-kv">${rows.join('')}</div>
    </section>`;
}

/** Kayıt: ulusun karakter cümlesi ve son üç hatırası. */
function dossierRecord({ world, target }) {
  const rows = memoryOf(target).slice(-3).reverse().map((m) => {
    const other = esc(world.nations[m.other]?.name ?? '?');
    const text = {
      war_with: `war with ${other}`,
      took_land_from: `took land from ${other}`,
      lost_land_to: `lost land to ${other}`,
      industry_seized_by: `industry seized by ${other}`,
      seized_industry_of: `seized ${other}'s industry`,
      allied: `allied with ${other}`,
      alliance_broken: `broke with ${other}`,
      honored_call: `honored the call of ${other}`,
    }[m.kind] ?? `${esc(m.kind)} ${other}`;
    return `<li><em>${chronicleYear(m.turn)}</em><span>${text}</span></li>`;
  }).join('');
  return `<section class="dsr-sec dsr-rec">
      <h3 class="dsr-h"><span>Record</span></h3>
      <p class="dsr-quote">${esc(characterLine(world, target))}</p>
      ${rows ? `<ul class="dsr-mem">${rows}</ul>` : ''}
    </section>`;
}

// ------------------------------------------------------------- BAĞLAMA ---

/** İki tık: ilki onay ister; 8 sn sonra söner. */
function confirmFirst(screens, key) {
  if (screens.dipConfirm === key) {
    screens.dipConfirm = null;
    clearTimeout(screens.dipConfirmTimer);
    return true;
  }
  screens.dipConfirm = key;
  clearTimeout(screens.dipConfirmTimer);
  screens.dipConfirmTimer = setTimeout(() => {
    if (screens.dipConfirm !== key) return;
    screens.dipConfirm = null;
    screens.refresh();
  }, CONFIRM_MS);
  screens.refresh();
  return false;
}

/** Başarısız eylemin sebebi oyuncuya kart olarak düşer (sessiz ret yok). */
function report(game, result, what) {
  if (!result || result.ok !== false) return;
  game.turns?.addLog?.(`${what}: ${result.reason ?? 'not possible now'}.`, { kind: 'DIPLOMACY' });
}

function act(screens, kind, arg) {
  const game = screens.game;
  const me = screens.me;
  const world = game.world;
  if (!me) return;
  const id = Number(String(arg).split(':')[0]);
  const target = world.nations[id];
  switch (kind) {
    case 'envoy': report(game, sendEnvoy(game, me, id), 'Envoy'); break;
    case 'recall': recallEnvoyFrom(game, me, id); break;
    case 'req': {
      const [reqId, choice] = String(arg).split(':');
      report(game, resolvePending(game, Number(reqId), choice), 'Request');
      break;
    }
    case 'break': report(game, breakAllianceBy(game, me, id), 'Alliance'); break;
    case 'ally': proposeAlliance(game, me, id); break;
    case 'nap': report(game, proposeNap(game, me, id), `Pact with ${target?.name}`); break;
    case 'renew': report(game, renewNap(game, me, id), `Renewal with ${target?.name}`); break;
    case 'denounce': denounceNap(game, me, id); break;
    case 'guarantee': if (!giveGuarantee(game, me, id)) report(game, { ok: false }, 'Guarantee'); break;
    case 'revoke': {
      // Tehdit altındaki korunanı bırakmak terktir: iki tık ister.
      if (protegeThreatened(world, id) && !confirmFirst(screens, `revoke:${id}`)) return;
      revokeGuarantee(game, me, id);
      break;
    }
    case 'rival': report(game, declareRival(game, me, id), 'Rival'); break;
    case 'clear-rival': clearRival(game, me); break;
    case 'union': if (!proposeUnion(game, me, id)) report(game, { ok: false }, 'Union'); break;
    case 'demand': {
      if (!confirmFirst(screens, `demand:${arg}`)) return;
      const [nationId, provinceId] = String(arg).split(':').map(Number);
      const outcome = issueDemand(game, me, nationId, provinceId);
      if (!outcome) report(game, { ok: false }, 'Demand');
      break;
    }
    case 'independence': {
      if (!confirmFirst(screens, `indep:${id}`)) return;
      if (!declareIndependence(game, me)) report(game, { ok: false }, 'Independence');
      break;
    }
    case 'tile': {
      const [q, r] = String(arg).split(',').map(Number);
      const tile = world.get(q, r);
      screens.close();
      if (tile) game.focusTile(tile);
      return;
    }
    default: return;
  }
  game.emit?.('diplomacy');
  // SG ve şöhret harcandı: üst çubuk 'politics' olayında tazelenir (öbür
  // ekranların SG harcayan düğmeleri gibi). Yokken duraklatılmış oyunda üst
  // çubuk bir sonraki haftaya dek eski SG'yi gösteriyordu (oyuncu testi:
  // talepten sonra POWER 98, gerçekte 27.6; şöhret 0.0, gerçekte 2).
  game.emit?.('politics', me.id);
  game.requestRender?.();
  screens.refresh();
}

/** screens.bind'den çağrılır (yalnız diplomasi ve dosya ekranında). */
export function bindDiplomacyScreen(screens) {
  for (const btn of screens.el.body.querySelectorAll('[data-dip-act]')) {
    btn.onclick = () => act(screens, btn.dataset.dipAct, btn.dataset.dipArg);
  }
  // Dosyanın kendi çarpısı: sekme çubuğundaki kapat bu dar panelden ekranın
  // öbür ucunda kalıyordu (Kerem: "bu ekranda çarpı yok").
  const close = screens.el.body.querySelector('[data-dsr-close]');
  if (close) close.onclick = () => screens.close();
}
