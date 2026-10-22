// DİPLOMASİ EKRANI VE ÜLKE DOSYASI (TASARIM §12; şartname §15).
//
// Neden ayrı modül: screens.js başka bir ekip tarafından düzenleniyor; bu
// dosya ekranın ve dosyanın gövdesini kurar, screens.js yalnız devreder
// (render_diplomacy / render_dossier / bind). Screens örneğinin durumunu ve
// yardımcılarını kullanır (dipFilter, warConfirm, warFocus, nationTarget,
// vassalButtons, peaceOfferCard, dossierIdentity, conflictPanel).
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
import { rulingParty } from '../game/politics.js';
import { formatPopulation, populationOf } from '../game/economy.js';
import { diplomacyView, dossierView } from '../game/diplomacyView.js';
import { warOverview, worldConflicts } from '../game/warView.js';
import { breakAllianceBy, isAllied } from '../game/alliances.js';
import {
  clearRival, declareRival, denounceNap, giveGuarantee, issueDemand, proposeAlliance, proposeNap, protegeThreatened,
  recallEnvoyFrom, renewNap, resolvePending, revokeGuarantee, sendEnvoy,
} from '../game/pacts.js';
import { declareIndependence } from '../game/vassals.js';
import { proposeUnion } from '../game/unification.js';
import { AUTONOMY, ENVOY, GUARANTEE } from '../game/dipDefs.js';
import { esc, kpi as kitKpi, kpiRow as kitKpiRow, panel as kitPanel, tipAttr } from './kit.js';
import { diplomacyArt, eventArt, gaugeArt } from './icons/art.js';

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
    ? `<button type="button" class="dip-envoy on" data-dip-act="recall" data-dip-arg="${row.id}" aria-label="Recall our envoy from ${esc(row.name)}"${tip(`Our envoy at ${row.name}'s court\n+${ENVOY.RATE} a week up to +${ENVOY.CAP}; costs ${ENVOY.UPKEEP} political power a week.\nClick to recall (free; what was gained fades slowly).`)}>★</button>`
    : `<button type="button" class="dip-envoy" data-dip-act="envoy" data-dip-arg="${row.id}" aria-label="Send an envoy to ${esc(row.name)}"${row.envoy.can ? tip(`Send an envoy to ${row.name}\nRelations +${ENVOY.RATE} a week, up to +${ENVOY.CAP} (about a year's work). Costs ${ENVOY.UPKEEP} political power a week; two envoys at most.`) : ` disabled${tip(`Send an envoy\n${row.envoy.blockers.join('\n')}`)}`}>☆</button>`;
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
  const head = `<div class="dip-row head"><span></span><span>Nation</span><span>Standing</span><span>Strength</span><span${tip('Relations\nHow they regard us: the sum of what we did to each other, fading by 1% a week. ★ = our envoy at their court.')}>Relations</span><span${tip('Threat\nCould this neighbour attack us? Their strength against ours plus half of everyone who stands behind us, against the margin they need; then whether they are ready and free.')}>Threat</span><span class="dip-col-ally">Alliance</span><span></span></div>`;

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
    kitKpi({ icon: diplomacyArt('alliance', 'md'), label: 'Allies', value: `${view.allies} / ${view.maxAllies}`, sub: 'an attack on one calls the other' }),
    kitKpi({ label: 'Envoys', value: `${view.envoys.used} / ${view.envoys.slots}`, sub: `+${view.envoys.rate} a week each, up to +${view.envoys.cap}`, tip: { text: `Envoys\nAn envoy raises how a court regards us by ${view.envoys.rate} a week, up to +${view.envoys.cap}. Send one with ☆ in a row or from a dossier.` } }),
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
    ? kitPanel('Requests', view.requests.map(requestRow).join(''), { sub: 'answer before they lapse', cls: 'dip-requests' })
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

function dossierButton({ act, arg, label, blockers = [], tipText, cls = 'k-btn', confirmKey = null, screens = null, confirmLabel = null, art = '' }) {
  const confirming = confirmKey && screens?.dipConfirm === confirmKey;
  const pic = art ? (DOSSIER_EVENT_ART.has(art) ? eventArt(art, 'inline') : dart(art)) : '';
  const klass = `${cls}${pic ? ' has-art' : ''}`;
  if (blockers.length) {
    return `<button type="button" class="${klass}" data-dip-act="${act}" data-dip-arg="${esc(arg)}" disabled${tip(`${label}\n${blockers.join('\n')}`)}>${pic}${esc(label)}</button>`;
  }
  return `<button type="button" class="${klass}${confirming ? ' confirming' : ''}" data-dip-act="${act}" data-dip-arg="${esc(arg)}"${tip(`${label}\n${tipText}${confirmKey && !confirming ? '\nClick twice to confirm.' : ''}`)}>${pic}${esc(confirming ? (confirmLabel ?? 'Confirm?') : label)}</button>`;
}
/** Dosya düğmelerinden resmi tarih setinden gelenler (birlik ilanı diplomasi değil, halkın birleşmesi). */
const DOSSIER_EVENT_ART = new Set(['unification']);

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
  const war = atWar(world, me.id, target.id);
  const crisis = crisisLeft(world, me.id, target.id, turn);
  const truce = truceLeft(world, me.id, target.id, turn);
  const rec = relation(world, me.id, target.id);
  const locked = war && turn - rec.since < MIN_WAR_TURNS;
  const vassal = overlordOf(world, target.id, turn) === me.id;
  const overlord = overlordOf(world, me.id, turn) === target.id;
  const view = dossierView(world, me, target, turn);
  const board = scoreboard(world);
  const rankOf = (id) => board.findIndex((row) => row.nation.id === id) + 1;
  const score = hegemonyScore(world, target);
  const myPower = nationStrength(world, me);
  const power = nationStrength(world, target);
  const cities = world.cities.filter((city) => city.nationId === target.id).length;
  const industry = (target.economy?.ic?.total ?? 0).toFixed(1);
  const output = (target.economy?.ic?.output ?? 0).toFixed(1);
  const party = rulingParty(target);
  const offer = (game.peaceOffers ?? []).find((entry) => entry.from === target.id && entry.to === me.id);
  const allied = isAllied(me, target.id);
  const status = [
    war ? '<span class="tag war">at war</span>'
      : crisis ? `<span class="tag crisis">war in ${crisis}w</span>`
        : truce ? `<span class="tag truce">truce ${truce}w</span>`
          : '<span class="tag peace">at peace</span>',
    allied ? '<span class="tag ally">ally</span>' : '',
    vassal ? `<span class="tag ally">our vassal · ${Math.round(view.autonomy?.value ?? 0)}%</span>` : '',
    overlord ? '<span class="tag ally">our overlord</span>' : '',
    view.pact ? `<span class="tag truce">${view.pact.denounced != null ? `pact ends ${view.pact.left}w` : `pact ${Math.floor(view.pact.left / 52)}y`}</span>` : '',
    view.guaranteed ? '<span class="tag ally">guaranteed by us</span>' : '',
    view.guaranteesUs ? '<span class="tag ally">guarantees us</span>' : '',
    view.envoy.posted ? '<span class="tag ally">our envoy</span>' : '',
    view.cb ? `<span class="tag war">casus belli ${Math.max(0, view.cb.expires - turn)}w</span>` : '',
    me.rivalId === target.id ? `<span class="tag rival">${me.rivalChosen != null ? 'our declared rival' : 'our rival'}</span>` : '',
    target.rivalId === me.id ? '<span class="tag rival">sees us as the rival</span>' : '',
  ].filter(Boolean).join(' ');

  // İlişki kartı.
  const r = view.relations;
  const partsList = r.parts.length
    ? `<ul class="dip-parts">${r.parts.map((p) => `<li><span>${esc(p.label)}</span><b class="${p.value >= 0 ? 'pos' : 'neg'}">${fmt(p.value, 0)}</b><small>${p.fadesBy ? `fades by ${p.fadesBy}` : ''}</small></li>`).join('')}</ul>`
    : '<p class="dip-quiet">No deeds yet: neither of us has done anything the other remembers.</p>';
  const envoyBtn = view.envoy.posted
    ? dossierButton({ act: 'recall', arg: target.id, label: 'Recall envoy', tipText: `Free. Our envoy stands at ${fmt(view.envoy.standing, 0)} of +${ENVOY.CAP}; it fades slowly once recalled.` })
    : dossierButton({ act: 'envoy', arg: target.id, label: `Send envoy · ${ENVOY.UPKEEP} PP/wk`, blockers: view.envoy.blockers, tipText: `Relations +${ENVOY.RATE} a week up to +${ENVOY.CAP} (+25 after about 37 weeks). Two envoys at most.` });
  const dangers = view.dangers.length
    ? view.dangers.map((d) => `<li><button type="button" class="dip-cname" data-nation="${d.id}">${esc(d.name)}</button> <span class="dip-threat ${d.label === 'may attack' ? 'may' : d.label === 'able, not ready' ? 'able' : 'safe'}">${esc(d.label === 'able, not ready' ? 'able · not ready' : d.label)}</span><small>${esc(d.text)}</small></li>`).join('')
    : '<li><small>No neighbour of theirs is able to attack them.</small></li>';
  const autonomyBlock = view.autonomy
    ? `<div class="dip-dsec"><h4>Their autonomy as our vassal</h4><div class="dip-cauto"${tip(autonomyTip(target.name, view.autonomy))}>${autonomyMeter(view.autonomy.value)}<em>${Math.round(view.autonomy.value)}</em><small>heading to ${Math.round(view.autonomy.target)} · resists annexation at ${AUTONOMY.NO_ANNEX} · breaks away at ${AUTONOMY.BREAK} if we falter</small></div></div>`
    : '';
  const ourAutonomyBlock = view.ourAutonomy
    ? `<div class="dip-dsec"><h4>Our autonomy under ${esc(target.name)}</h4><div class="dip-cauto"${tip(autonomyTip('Our', view.ourAutonomy))}>${autonomyMeter(view.ourAutonomy.value)}<em>${Math.round(view.ourAutonomy.value)}</em></div>
        ${dossierButton({ act: 'independence', arg: target.id, label: 'Declare independence', blockers: view.independence ?? [], tipText: `Free: a war of independence against ${target.name}, no calls to arms. Our autonomy is ${Math.round(view.ourAutonomy.value)}.`, cls: 'k-btn danger', confirmKey: `indep:${target.id}`, screens, confirmLabel: 'Confirm: declare independence?' })}</div>`
    : '';
  const relationsCard = `<div class="card dip-relations">
      <div class="card-head"><h3>How ${esc(target.name)} regards us <b class="${toneOf(r.value)}">${fmt(r.value, 0)}</b></h3><small>${esc(r.effects.text)}</small></div>
      <div class="dip-relrow">${relationBar(r.value)}${envoyBtn}</div>
      ${partsList}
      <div class="dip-dsec"><h4>Danger to them</h4><ul class="dip-dangers">${dangers}</ul></div>
      ${autonomyBlock}${ourAutonomyBlock}
    </div>`;

  // Eylemler.
  const v = view.verdicts;
  const rows = [];
  if (war) {
    rows.push(['War', `<button type="button" class="k-btn has-art" data-peace="${target.id}" ${locked ? 'disabled' : ''}>${dart('peace')}Peace Talks${locked ? ` (${MIN_WAR_TURNS - (turn - rec.since)}w)` : ''}</button>`]);
  } else {
    const agreements = [];
    if (allied) {
      if (view.allyBreak) agreements.push(breakButton(view.allyBreak, 'k-btn'));
    } else if (!vassal && !overlord) {
      agreements.push(dossierButton({
        act: 'ally', arg: target.id, label: 'Propose alliance', art: 'alliance',
        blockers: v.ally.blockers.length ? v.ally.blockers : (v.ally.accept ? [] : [v.ally.sentence]),
        tipText: `${v.ally.sentence}\nAn attack on one becomes a call to the other.`,
      }));
    }
    if (view.pact) {
      if (view.pact.denounced == null) {
        agreements.push(dossierButton({ act: 'renew', arg: target.id, label: `Renew pact · ${view.costs.nap}`, art: 'pact', blockers: v.nap.blockers.length ? v.nap.blockers : (v.nap.verdict.accept ? [] : [v.nap.sentence]), tipText: `${v.nap.sentence}\nFive more years.` }));
        agreements.push(dossierButton({ act: 'denounce', arg: target.id, label: 'Denounce pact', tipText: `The pact ends in 26 weeks; ${target.name} takes it badly (relations −15).` }));
      }
    } else if (!allied && !vassal && !overlord) {
      agreements.push(dossierButton({
        act: 'nap', arg: target.id, label: `Non-aggression pact · ${view.costs.nap}`, art: 'pact',
        blockers: v.nap.blockers.length ? v.nap.blockers : (v.nap.verdict.accept ? [] : [v.nap.sentence]),
        tipText: `${v.nap.sentence}\nFive years in which neither of us may declare war; a denunciation gives 26 weeks' notice. Breaking it costs +8 infamy and every partner's trust.`,
      }));
    }
    if (v.guarantee.guaranteed) {
      agreements.push(dossierButton({
        act: 'revoke', arg: target.id, label: 'Revoke guarantee',
        tipText: v.guarantee.threatened ? `They are under threat: revoking now is abandonment — prestige −${GUARANTEE.ABANDON_PRESTIGE}, them −40, every partner −10.` : `Free; ${target.name} −15. Saves ${GUARANTEE.UPKEEP} political power a week.`,
        cls: v.guarantee.threatened ? 'k-btn danger' : 'k-btn',
        confirmKey: v.guarantee.threatened ? `revoke:${target.id}` : null, screens, confirmLabel: 'Confirm: abandon them?',
      }));
    } else if (!allied && !vassal && !overlord) {
      agreements.push(dossierButton({
        act: 'guarantee', arg: target.id, label: `Guarantee independence · ${view.costs.guarantee} + ${view.costs.guaranteeUpkeep}/wk`, art: 'guarantee',
        blockers: v.guarantee.blockers,
        tipText: 'If anyone declares war on them, we are called. Our strength counts in every attacker\'s odds against them, and no kindred state may absorb them while we guarantee them.',
      }));
    }
    if (v.rival.declared) {
      agreements.push(dossierButton({ act: 'clear-rival', arg: target.id, label: 'Clear rival', tipText: 'Free. The lock stays; the yearly review assigns a rival again.' }));
    } else if (!allied && !vassal && !overlord) {
      agreements.push(dossierButton({
        act: 'rival', arg: target.id, label: `Declare rival · ${view.costs.rival}`, blockers: v.rival.blockers,
        tipText: `War on them becomes justified (20); nations that share this rival lean toward us; ${target.name} −20. Locked for two years.${v.rival.assigned ? ' They are already our rival by circumstance: declaring keeps them there.' : ''}`,
      }));
    }
    if (v.union) {
      agreements.push(dossierButton({ act: 'union', arg: target.id, label: `Propose union · ${v.union.cost} PP`, art: 'unification', blockers: v.union.blockers, tipText: 'Their whole state joins ours in peace. A little infamy, much prestige.' }));
    }
    if (vassal) agreements.push(screens.vassalButtons(world, target, view.annexBlockers ?? [], 'k-btn'));
    if (agreements.length) rows.push(['Agreements', agreements.join('')]);
    if (!vassal && !overlord && !allied) {
      const pressure = view.demands.map((d) => dossierButton({
        act: 'demand', arg: `${target.id}:${d.provinceId}`, label: `Demand ${d.name} · ${view.costs.demand} PP, +${view.costs.demandInfamy} infamy`, art: 'demand',
        blockers: d.blockers, tipText: `"Give us ${d.name} or war." Now ${d.text}. If they refuse we hold a free cause for war for a year.`,
        cls: 'k-btn danger', confirmKey: `demand:${target.id}:${d.provinceId}`, screens, confirmLabel: `Confirm: demand ${d.name}?`,
      }));
      if (!pressure.length && view.demandWhy) pressure.push(`<small class="dip-note"${tip(`Territorial demand\n${view.demandWhy}`)}>No demand: ${esc(view.demandWhy.toLowerCase())}</small>`);
      const warRow = { id: target.id, name: target.name, warLabel: view.war.label, warBlockers: view.war.blockers, warTip: view.war.tip, warBreaksPact: view.war.pact, warJoinsCall: view.war.call };
      pressure.push(warButton(screens, warRow, 'k-btn danger'));
      rows.push(['Pressure', pressure.join('')]);
    }
  }
  const embargo = v.embargo.active ? '' : `<button type="button" class="k-btn has-art" data-embargo="${target.id}"${v.embargo.blockers.length ? ` disabled${tip(`Embargo\n${v.embargo.blockers.join('\n')}`)}` : tip(`Embargo ${target.name}\nCuts trade both ways. Costs ${v.embargo.cost} political power; ${target.name} −20 in relations.`)}>${dart('embargo')}Embargo · ${v.embargo.cost} PP</button>`;
  rows.push(['Other', `${embargo}<button type="button" class="k-btn" data-locate="${target.id}">Show on map</button>`]);
  const actions = rows.map(([label, body]) => `<div class="dip-arow"><span class="dip-alabel">${esc(label)}</span><div class="row-buttons dossier-actions">${body}</div></div>`).join('');

  return `<div class="card nation-dossier">
      <div class="dossier-head">
        <span class="flag-hero small" data-flag-nation="${target.id}" data-flag-w="96" data-flag-h="64"></span>
        <div class="grow">
          <h2>${esc(target.name)} ${status}</h2>
          <div class="dossier-sub">${esc(party?.name ?? 'No government')}
            · infamy ${(target.infamy ?? 0).toFixed(1)}/${INFAMY_COALITION}</div>
        </div>
        <div class="dossier-rank"><small>rank</small><b>#${rankOf(target.id)}</b></div>
      </div>
      <div class="dossier-scores">
        <span><small>Total</small><b>${score.total}</b></span>
        <span><small>Industry</small><b>${score.industry}</b></span>
        <span><small>Prestige</small><b>${score.prestige}</b></span>
        <span${tip(strengthPhrase(myPower, power))}><small>Relative strength</small><b class="${myPower >= power ? 'res-pos' : 'res-neg'}">${strengthPhrase(myPower, power)}</b></span>
      </div>
      <div class="dossier-facts">
        <div><span>Population</span><b>${formatPopulation(populationOf(world, target))}</b></div>
        <div><span>Territory</span><b>${target.tiles}</b><small>hexes</small></div>
        <div><span>Cities</span><b>${cities}</b></div>
        <div><span>Output</span><b>${output} IC/wk</b></div>
        <div><span>Industry</span><b>${industry} IC</b></div>
      </div>
      ${screens.dossierIdentity(world, target)}
    </div>
    ${relationsCard}
    ${offer ? screens.peaceOfferCard(offer) : ''}
    <div class="card dip-dossier-actions">
      <div class="card-head"><h3>Diplomacy</h3><small>${esc(dossierHint(view, { war, truce, vassal }))}</small></div>
      ${actions}
    </div>`;
}

function dossierHint(view, { war, truce, vassal }) {
  if (war) return 'a treaty is negotiated state by state at the peace table';
  if (vassal) return 'they pay us tribute; their autonomy decides how long';
  if (truce) return 'a truce forbids a new declaration until it lapses';
  if (view.war.blockers.length) return view.war.blockers[0];
  return 'every button says what it costs and why they would accept or refuse';
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
}
