// GAZETE ARŞİVİ — Chronicle ekranının paneli.
//
// Ayrı dosya: screens.js bunu içe alır, ui/newspaper.js ise hud.js'i (Esc sırası)
// alır; ikisi aynı dosyada olsaydı hud → screens → newspaper → hud döngüsü kurulurdu.
// Satıra tıklamayı ui/newspaper.js kökten dinler (`data-press-issue`).

import { pressIssues } from '../game/press.js';
import { composeIssue } from '../game/pressText.js';
import { esc, panel as kitPanel } from './kit.js';

/** Basılmış sayı değişmez: satırı bir kez kurulur, ekran her tazelemede yazar. */
const rows = new WeakMap();

function rowOf(issue) {
  let html = rows.get(issue);
  if (!html) {
    const view = composeIssue(issue);
    html = `<li class="gz-row" data-press-issue="${issue.n}" role="button" tabindex="0">
      <small>${esc(view.date)}${view.extra ? ` · ${esc(view.extraLabel)}` : ''}</small>
      <b>${esc(view.lead.head)}</b>
    </li>`;
    rows.set(issue, html);
  }
  return html;
}

export function pressArchivePanel(world) {
  const issues = pressIssues(world);
  const body = issues.length
    ? `<ol class="gz-archive">${issues.map(rowOf).join('')}</ol>`
    : '<p class="gz-archive-empty">The first issue goes to press at the turn of the month.</p>';
  const paper = issues[0]?.pa ?? '';
  return kitPanel('Newspaper', body, { sub: paper ? `${paper} · ${issues.length} issues` : '' });
}
