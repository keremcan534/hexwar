// Kampanya sonu: yuzyilin son sayfasi.
//
// Simulasyon 1945'te (FINAL_TURN) duruyordu ve geriye tek satirlik bir metin
// kaliyordu — 109 yillik kampanyanin odulu bir cumleydi. Bu ekran o yuzyili
// oyuncunun KENDI tarihinden derler: acilis ve kapanis olculeri, vakayinameden
// secilmis donum noktalari ve gercek verilerden turetilmis bir kapanis cumlesi.
//
// Burada YENI veri uretilmez. Her sayi ya kampanya basinda saklanmis acilis
// kesitinden ya da bugunku durumdan gelir.

import { chronicleYear, ensureChronicle } from '../game/chronicle.js';
import { ERA_NAME } from '../game/calendar.js';
import { governmentType } from '../game/politics.js';
import { scoreboard } from '../game/hegemony.js';
import { formatPopulation } from '../game/economy.js';
import { IC_SCALE } from '../game/econ/defs.js';
import { money } from '../game/money.js';
import { techStanding } from '../game/identity.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Vakayinameden en agir olaylari secer; zaman sirasi korunur. */
function highlights(chronicle, limit = 10) {
  if (chronicle.length <= limit) return chronicle;
  // Varolussal olaylar once, sonra ulusal olaylar; esitlikte erken tarih.
  const ranked = [...chronicle]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (b.entry.tier ?? 2) - (a.entry.tier ?? 2) || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);
  return ranked.map((item) => item.entry);
}

/**
 * Kapanis cumlesi: kampanyanin gercek sayilarindan turer. Hazir bir cumle
 * secilmez — ulkenin nereden nereye gittigi soylenir.
 */
function closingLine(nation, opening, board) {
  if (!opening) return 'The age closes on a state still finding its shape.';
  // `factories` adı açılış kesitinden kalır (chronicle.captureOpening): artık
  // ham sanayi IC'sidir (Σ işçi × kademe, çarpanlardan önce), iki uç aynı ölçü.
  const now = {
    population: nation.economy?.population ?? 0,
    output: nation.economy?.ic?.output ?? 0,
    literacy: nation.economy?.literacy ?? 0,
    tiles: nation.tiles ?? 0,
    government: governmentType(nation),
    factories: Math.round(nation.economy?.ic?.raw ?? 0),
  };
  const land = now.tiles - opening.tiles;
  const industry = now.factories - opening.factories;
  const schooled = now.literacy - opening.literacy;
  const rank = board?.findIndex((row) => row.nation.id === nation.id) ?? -1;

  // "a absolute monarchy" olmasin: unlu ile baslayan bicimler 'an' alir.
  const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
  const form = (opening.government || 'state').toLowerCase();
  // Eşikler eski fabrika sayısınındı; ham sanayi birimi eski fabrikanın
  // IC_SCALE katı olduğundan aynı cümle aynı ülkeye düşsün diye ölçeklenir
  // ("kısmen sanayileşmiş" = en az bir eski fabrikalık büyüme; nüfus artışı
  // da ham sanayiyi kıpırdatır, sıfırın üstü yetmez).
  const start = opening.literacy < 0.05 && opening.factories <= 2 * IC_SCALE
    ? 'It entered the age with land, poverty and ambition.'
    : `It entered the age as ${article(form)} ${form}.`;
  const territory = land > 4 ? 'larger' : land < -4 ? 'smaller' : 'much the same size';
  const built = industry > 6 * IC_SCALE ? 'industrial' : industry >= IC_SCALE ? 'partly industrialised' : 'still agrarian';
  const learned = schooled > 0.2 ? 'literate' : schooled > 0.05 ? 'better schooled' : 'largely unschooled';
  const standing = rank === 0 ? 'and first among nations'
    : rank >= 0 && rank < 5 ? 'and counted among the great powers'
      : 'and still its own master';
  return `${start} It leaves it ${territory}, ${built}, ${learned}, ${standing}.`;
}

function metricRow(label, from, to) {
  return `<div class="epilogue-metric">
    <span>${esc(label)}</span>
    <b>${esc(from)}</b><em>→</em><b class="to">${esc(to)}</b>
  </div>`;
}

/**
 * Ekrani kurar ve DOM'a takar. `victory` olayindan cagrilir; oyun zaten
 * durmustur (turn.js zafer sonrasi yeni tur baslatmaz).
 */
export function showEndScreen(game, result) {
  if (document.getElementById('epilogue')) return null;
  const world = game.world;
  const nation = world.nations[game.turns.playerNation];
  if (!nation) return null;
  const opening = nation.opening ?? null;
  const chronicle = ensureChronicle(nation);
  const board = result?.board ?? scoreboard(world);
  const rank = board.findIndex((row) => row.nation.id === nation.id);
  const endYear = chronicleYear(world.turn);
  const startYear = chronicleYear(opening?.turn ?? 1);

  const timeline = highlights(chronicle).map((entry) => `
    <li class="epilogue-event tier-${entry.tier ?? 2}">
      <b>${chronicleYear(entry.turn)}</b>
      <span>${esc(entry.title)}</span>
    </li>`).join('') || '<li class="epilogue-event empty"><span>An age without recorded upheaval.</span></li>';

  // Teknoloji satiri: acilis kesiti + guncel konum (identity.techStanding).
  const standing = techStanding(world, nation);
  const metrics = opening ? [
    metricRow('Population', formatPopulation(opening.population), formatPopulation(nation.economy?.population ?? 0)),
    metricRow('Territory', `${opening.tiles} hexes`, `${nation.tiles} hexes`),
    // Ham sanayi: açılış kesiti çarpansız tutuldu, kapanış da çarpansız okunur.
    metricRow('Industrial base', `${opening.factories} IC`, `${Math.round(nation.economy?.ic?.raw ?? 0)} IC`),
    metricRow('Literacy', `${Math.round(opening.literacy * 100)}%`, `${Math.round((nation.economy?.literacy ?? 0) * 100)}%`),
    metricRow('Technology', `${opening.research ?? 0} researched`,
      `${standing.research} · ${standing.label.toLowerCase()}`),
    metricRow('Government', opening.government, governmentType(nation)),
    // Baslangic ucu ACILIS kesitinden (chronicle.captureOpening). Eskiden iki
    // uc da ayni bugunku tablodan okunuyordu: "rank 5 -> rank 5" her zaman.
    // Eski kayitta alan yoktur; uydurmak yerine "—" yazilir.
    metricRow('Standing', opening.rank ? `rank ${opening.rank}` : '—',
      rank >= 0 ? `rank ${rank + 1} of ${board.length}` : '—'),
  ].join('') : '';
  // Kampanya sayaclari (nation.tally, haftalik tutulur — uydurma yok).
  // Sayac yoksa satir da yok. Hazine/borc sayaclari altinla birlikte gitti:
  // Tek Cubuk'ta kampanyanin olcusu en yuksek cikti ve ikmal krizi haftalari.
  const tally = nation.tally;
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const tallyLine = tally && (tally.warsFought > 0 || tally.peakOutput > 0)
    ? `<p class="epilogue-tally">${plural(tally.warsFought ?? 0, 'war', 'wars')} fought · peak output ${money(tally.peakOutput ?? 0, 0)}`
      + ` · ${plural(tally.crisisWeeks ?? 0, 'week', 'weeks')} of supply crisis</p>`
    : '';

  const host = document.createElement('div');
  host.id = 'epilogue';
  host.className = 'epilogue';
  host.innerHTML = `
    <article class="epilogue-sheet" role="dialog" aria-label="Campaign epilogue">
      <header class="epilogue-head">
        <small>${esc(ERA_NAME)}</small>
        <h1>${esc(nation.name)}</h1>
        <p class="epilogue-span">${startYear}–${endYear}</p>
      </header>
      <p class="epilogue-line">${esc(closingLine(nation, opening, board))}</p>
      <section class="epilogue-metrics">${metrics}</section>
      ${tallyLine}
      <section class="epilogue-timeline">
        <h2>The age in brief</h2>
        <ol>${timeline}</ol>
      </section>
      <footer class="epilogue-foot">
        <p>The age is over. Its consequences are not.</p>
        <button class="action primary" data-epilogue-close>Close</button>
      </footer>
    </article>`;
  document.body.append(host);
  host.querySelector('[data-epilogue-close]').onclick = () => host.remove();
  return host;
}
