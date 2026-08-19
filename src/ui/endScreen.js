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
import { governmentType } from '../game/reforms.js';
import { scoreboard } from '../game/hegemony.js';
import { formatPopulation } from '../game/economy.js';

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
  if (!opening) return 'The century closes on a state still finding its shape.';
  const now = {
    population: nation.economy?.population ?? 0,
    gdp: nation.economy?.gdp ?? 0,
    literacy: nation.economy?.literacy ?? 0,
    tiles: nation.tiles ?? 0,
    government: governmentType(nation),
    factories: nation.economy?.factories?.length ?? 0,
  };
  const land = now.tiles - opening.tiles;
  const industry = now.factories - opening.factories;
  const schooled = now.literacy - opening.literacy;
  const rank = board?.findIndex((row) => row.nation.id === nation.id) ?? -1;

  // "a absolute monarchy" olmasin: unlu ile baslayan bicimler 'an' alir.
  const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
  const form = (opening.government || 'state').toLowerCase();
  const start = opening.literacy < 0.05 && opening.factories <= 2
    ? 'It entered the century with land, poverty and ambition.'
    : `It entered the century as ${article(form)} ${form}.`;
  const territory = land > 4 ? 'larger' : land < -4 ? 'smaller' : 'much the same size';
  const built = industry > 6 ? 'industrial' : industry > 0 ? 'partly industrialised' : 'still agrarian';
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
    </li>`).join('') || '<li class="epilogue-event empty"><span>A century without recorded upheaval.</span></li>';

  const metrics = opening ? [
    metricRow('Population', formatPopulation(opening.population), formatPopulation(nation.economy?.population ?? 0)),
    metricRow('Territory', `${opening.tiles} hexes`, `${nation.tiles} hexes`),
    metricRow('Industry', `${opening.factories} plants`, `${nation.economy?.factories?.length ?? 0} plants`),
    metricRow('Literacy', `${Math.round(opening.literacy * 100)}%`, `${Math.round((nation.economy?.literacy ?? 0) * 100)}%`),
    metricRow('Government', opening.government, governmentType(nation)),
    metricRow('Standing', `rank ${(board.findIndex((row) => row.nation.id === nation.id) + 1) || '—'}`, `rank ${rank + 1} of ${board.length}`),
  ].join('') : '';

  const host = document.createElement('div');
  host.id = 'epilogue';
  host.className = 'epilogue';
  host.innerHTML = `
    <article class="epilogue-sheet" role="dialog" aria-label="Campaign epilogue">
      <header class="epilogue-head">
        <small>The Long Century</small>
        <h1>${esc(nation.name)}</h1>
        <p class="epilogue-span">${startYear}–${endYear}</p>
      </header>
      <p class="epilogue-line">${esc(closingLine(nation, opening, board))}</p>
      <section class="epilogue-metrics">${metrics}</section>
      <section class="epilogue-timeline">
        <h2>The century in brief</h2>
        <ol>${timeline}</ol>
      </section>
      <footer class="epilogue-foot">
        <p>The century is over. Its consequences are not.</p>
        <button class="action primary" data-epilogue-close>Close</button>
      </footer>
    </article>`;
  document.body.append(host);
  host.querySelector('[data-epilogue-close]').onclick = () => host.remove();
  return host;
}
