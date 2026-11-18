// LİDER PORTRESİ — dönem fotoğrafı, kartvizit boyu; dosya, masa ve bildirimde tek çizim.
//
// Portreler ChatGPT sayfalarından dilimlenir (assets/incoming/URETIM-LISTESI.md
// "Lider portreleri"): `assets/leaders/<sayfa>-NN.webp`. Sayfası gelmemiş rol
// subay vesikalıklarıyla (aynı fotoğraf dili) durur; bir sayfa dilimlenince adı
// READY_SHEETS'e yazılır, başka kod değişmez. Kadın yüzü olmayan yedek setin
// erkek fotoğrafını kadın lidere takmamak için o durumda adın baş harfleri basılır.
//
// Sayı üretmez: `leaderView`in kaydını basar.

import { calendarYear } from '../game/calendar.js';
import { esc, tipAttr } from './kit.js';
import { liderYedekYuzu } from './icons/subaylar.js';

/** Dilimlenip oyuna giren sayfalar. Yeni sayfa = buraya tek satır. */
const READY_SHEETS = new Set([]);

/** Devlet adamı kıyafeti Büyük Savaş'ta değişir: iki dönem, iki sayfa. */
const LATE_ERA = 1919;

function sheetOf(leader, sinceYear) {
  if (leader.role === 'monarch') return 'hukumdar';
  if (leader.role === 'marshal') return 'asker';
  if (leader.role === 'firebrand') return 'devrimci';
  return sinceYear >= LATE_ERA ? 'devlet-2' : 'devlet-1';
}

const two = (value) => String(value).padStart(2, '0');

/** Fotoğrafın yolu; yedek yoksa (kadın lider, sayfa gelmemiş) null. */
function photoSrc(leader, sinceYear) {
  const sheet = sheetOf(leader, sinceYear);
  if (READY_SHEETS.has(sheet)) return `assets/leaders/${sheet}-${two(leader.face)}.webp`;
  if (leader.female) return null;
  // Ad da karışır: rol başına yüz aralığı dar, komşu ülkelerin lideri aynı yüzü almasın.
  return liderYedekYuzu([...leader.name].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, leader.face));
}

const initials = (name) => name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('');

/**
 * Kartvizit çerçeveli portre. `size`: 'lg' dosya, 'sm' masa satırı, 'xs' bildirim.
 * @param {object} leader `nation.leader`
 */
export function leaderPhoto(leader, size = 'lg') {
  if (!leader) return '';
  const src = photoSrc(leader, calendarYear(leader.since ?? 0));
  const face = src
    ? `<img src="${src}" alt="" draggable="false">`
    : `<b aria-hidden="true">${esc(initials(leader.name))}</b>`;
  return `<span class="ldr-photo ${size}${src ? '' : ' plain'}" role="img" aria-label="Portrait of ${esc(leader.title)} ${esc(leader.name)}">${face}</span>`;
}

/** Portrenin yanındaki imza: masa satırı ve barış kartında yüzün kime ait olduğu. */
export function leaderByline(leader) {
  if (!leader) return '';
  return `<span class="ldr-by">${esc(leader.title)} ${esc(leader.name)}</span>`;
}

const VIA_TEXT = {
  start: 'in office', death: 'succeeded to office', election: 'elected', term: 'elected',
  coup: 'seized power', revolution: 'came with the revolution', reform: 'took office',
};

/**
 * Ülke dosyasındaki lider şeridi: yüz, ad, görev yılı ve özellikler. Her özelliğin
 * bilgi kartı hangi kararı nasıl değiştirdiğini tek cümleyle söyler.
 */
export function leaderStrip(view, leader) {
  if (!view) return '';
  const chips = view.traits.map((trait) => `<span class="ldr-trait"${tipAttr({ text: `${trait.name}\n${trait.line}` })}>${esc(trait.name)}</span>`).join('');
  const history = view.predecessor ? `Succeeded ${view.predecessor}.` : 'The first leader of this campaign.';
  const tip = tipAttr({ text: `${view.label}\nAge ${view.age}; ${VIA_TEXT[view.via] ?? 'in office'} in ${view.sinceYear}. ${history}` });
  return `<section class="dsr-sec dsr-ldr">
      ${leaderPhoto(leader, 'lg')}
      <div class="ldr-body">
        <div class="ldr-head"${tip}><b>${esc(view.label)}</b><small>age ${view.age} · since ${view.sinceYear}</small></div>
        <div class="ldr-traits">${chips}</div>
      </div>
    </section>`;
}
