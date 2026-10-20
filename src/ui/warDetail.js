// SAVAŞIN AYRINTISI — tek kaynak. Sağ üst savaş panelinde satıra tıklayınca
// yanında açılan kart ve Diplomasi ekranındaki panel aynı gövdeyi basar
// (Kerem: "tıklayınca savaştaki taraflar ve detaylar orada gözüksün").
//
// Sayılar game/warView.worldConflicts'ten gelir; burada hesap yoktur.
// Eylemler veri öznitelikleriyle işaretlenir, bağlamayı çağıran yapar:
//   data-cd-nation  → ülke dosyası
//   data-cd-look    → kamera cepheye
//   data-cd-close   → kartı kapat

import { formatPopulation } from '../game/economy.js';
import { esc, tipAttr } from './kit.js';

const loss = (n) => (n > 0 ? `−${formatPopulation(n)}` : '0');
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
const flag = (id, w, h) => `<span class="flag" data-flag-nation="${id}" data-flag-w="${w}" data-flag-h="${h}" data-flag-style="crest"></span>`;

/** Savaş puanı çubuğu: ortadan sağa saldıranın lehine. */
export function scoreBarHtml(score) {
  const half = Math.min(50, Math.abs(score) / 2);
  const fill = score >= 0
    ? `<i style="left:50%;width:${half.toFixed(1)}%"></i>` : `<i style="left:${(50 - half).toFixed(1)}%;width:${half.toFixed(1)}%"></i>`;
  return `<span class="wd-bar" aria-hidden="true">${fill}</span>`;
}

/** Çatışmanın kamera hedefi: tutulan state, yoksa savunanın başkenti. */
export function conflictFocusTile(world, c) {
  const province = c?.focusProvince != null ? world.provinces?.[c.focusProvince] : null;
  return province?.center ?? world.nations[c?.lead?.[1]]?.capital ?? null;
}

/**
 * Ayrıntı gövdesi: iki taraf, puan, kayıp, tutulan state'ler, süren
 * muharebeler, süre, ikili savaşlar ve eylem düğmeleri.
 * @param {object} world
 * @param {object} c worldConflicts satırı
 * @param {{ close?: boolean }} [options]
 */
export function conflictDetailHtml(world, c, { close = true } = {}) {
  const name = (id) => esc(world.nations[id]?.name ?? '?');
  const side = (list) => list.map((n) => `<button type="button" class="cd-side" data-cd-nation="${n.id}"${tipAttr({ text: `${n.name}\nOpen the dossier.` })}>${flag(n.id, 24, 16)}<b>${esc(n.name)}</b></button>`).join('');
  const why = c.reason === 'alliance' ? 'Allies were called in.' : c.reason === 'coalition' ? 'A coalition war against an infamous power.' : '';
  const fronts = c.fronts.length > 1 ? `<h5 class="cd-sub">Wars in this conflict</h5>${c.fronts.map((f) => `<div class="cd-front">
        ${flag(f.a, 20, 14)}<b>${name(f.a)}</b><i>vs</i>${flag(f.b, 20, 14)}<b>${name(f.b)}</b><em>${signed(f.score)}</em>
        <small>${loss(f.lossesA)} / ${loss(f.lossesB)} · held ${f.holdA}/${f.holdB} · ${f.weeks}w</small>
      </div>`).join('')}` : '';
  return `<div class="cd-view">
      <div class="cd-sides">
        <div><h5>Attackers</h5>${side(c.attackers)}</div>
        <div><h5>Defenders</h5>${side(c.defenders)}</div>
      </div>
      <div class="cd-score"${tipAttr({ text: `War score ${signed(c.score)} for ${c.attackers[0].name}\nRight of centre favours the attackers.` })}>
        <span>${name(c.lead[0])}</span>${scoreBarHtml(c.score)}<span>${name(c.lead[1])}</span><em>${signed(c.score)}</em>
      </div>
      <div class="cd-stats">
        <div><span>Losses (men)</span><b class="neg">${loss(c.lossesA)}</b><b class="neg">${loss(c.lossesB)}</b></div>
        <div><span>States held</span><b>${c.holdA}</b><b>${c.holdB}</b></div>
        <div><span>Battles now</span><b>${c.battles}</b><b></b></div>
        <div><span>Duration</span><b>${c.weeks} weeks</b><b></b></div>
      </div>
      ${why ? `<p class="cd-why">${why}</p>` : ''}
      ${fronts}
      <div class="cd-acts">
        <button type="button" class="k-btn sm" data-cd-look="${c.key}">Look at the front</button>
        ${close ? '<button type="button" class="k-btn sm" data-cd-close>Close</button>' : ''}
      </div>
    </div>`;
}
