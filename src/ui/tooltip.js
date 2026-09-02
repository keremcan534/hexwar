// Gecikmeli bilgi kartı sistemi — TEK yönetici.
//
// Paradox'un tooltip'i tarayıcının `title` balonu değildir: gecikmeyle açılır,
// içine girilebilir, içindeki terimlerin kendi açıklaması vardır ve ekranın
// dışına taşmaz. Bu dosya o davranışın tamamını tek yerde tutar.
//
// NEDEN DELEGASYON: bu depodaki ekranlar her tazelemede `innerHTML`i baştan
// yazar. Öğe başına `registerTooltip(el, ...)` çağırmak, her hafta yüzlerce
// dinleyiciyi yeniden bağlamak demekti — ve bir tazelemeyi unutan ekran sessizce
// tooltip'siz kalırdı. Onun yerine kök bir dinleyici vardır; öğeler yalnız
// `data-tip="saglayici"` (+ isteğe bağlı `data-tip-arg`) taşır. Yeni bir
// tooltip eklemek = bir öznitelik yazmak.
//
// İÇERİK BURADA HESAPLANMAZ. Sağlayıcılar alan katmanının döküm
// fonksiyonlarını okur (bkz. tooltipData.js); tooltip kodu hiçbir simülasyon
// formülünü kopyalamaz — kopyalasaydı ekranla motor zamanla ayrışırdı.
//
// Katman notu: yalnız DOM. Oyun durumuna sağlayıcılar üzerinden erişir.

/** Birinci katman: oyuncu gerçekten "ne bu?" diye durmuş olmalı. */
const DELAY = 800;
/** İç içe katman: zaten okuma kipindedir, daha kısa. */
const NESTED_DELAY = 350;
/** Kaynakla kart arasında gezerken kapanmasın diye mühlet. */
const GRACE = 220;
/** Derinlik sınırı: sonsuz zincir okunmaz hale gelir. */
const MAX_DEPTH = 3;
const EDGE = 8;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ==========================================================================
   İÇERİK BİÇİMLERİ — en küçüğü seçilir
   ========================================================================== */

/**
 * Sağlayıcılar bu üç biçimden birini döndürür. Ham HTML döndürmezler:
 * biçim burada kurulur ki bütün tooltip'ler aynı dili konuşsun.
 *
 *   { type:'simple',    title, text }
 *   { type:'breakdown', title, value, note, rows:[{label,value,tone}], effects, text }
 *   { type:'mechanic',  title, text, effects, rows, footer }
 *
 * `rows` bir FORMÜLÜN parçalarıdır: "neden bu değer" sorusunun cevabı.
 * `effects` sonuçlardır: "bu değer neyi değiştiriyor".
 */
function render(data) {
  if (!data) return '';
  const rows = (data.rows ?? []).map((row) => `
    <div class="tip-row ${row.tone ?? ''}">
      <span>${esc(row.label)}</span>
      <b>${esc(String(row.value))}</b>
    </div>`).join('');
  const effects = (data.effects ?? []).map((row) => `
    <div class="tip-effect">
      <span>${esc(row.label)}</span>
      <b class="${row.tone ?? ''}">${esc(String(row.value))}</b>
    </div>`).join('');
  return `
    <div class="tip-head">
      <b>${esc(data.title ?? '')}</b>
      ${data.value != null ? `<span class="tip-value">${esc(String(data.value))}</span>` : ''}
    </div>
    ${data.note ? `<div class="tip-note">${data.note}</div>` : ''}
    ${data.text ? `<p class="tip-text">${data.text}</p>` : ''}
    ${effects ? `<div class="tip-block"><small>Effects</small>${effects}</div>` : ''}
    ${rows ? `<div class="tip-block"><small>Why</small>${rows}</div>` : ''}
    ${data.footer ? `<p class="tip-foot">${data.footer}</p>` : ''}`;
}

/* ==========================================================================
   YÖNETİCİ
   ========================================================================== */

const providers = new Map();

/**
 * Bir tooltip kaynağı tanımlar.
 * @param {string} id  `data-tip` değeri
 * @param {(arg: string, element: HTMLElement) => object|null} fn
 */
export function provideTooltip(id, fn) {
  providers.set(id, fn);
}

/** İçeriğin içinde ikincil terim: `tipTerm('research', 'Research Points')`. */
export function tipTerm(id, label, arg = '') {
  return `<b class="tip-term" data-tip="${esc(id)}"${arg ? ` data-tip-arg="${esc(arg)}"` : ''}>${esc(label)}</b>`;
}

/** Açık katmanlar. Her katman kendi kartını ve zamanlayıcısını taşır. */
const layers = [];
let openTimer = null;
let closeTimer = null;
let mounted = false;

function makeCard(depth) {
  const card = document.createElement('div');
  card.className = 'tip-card';
  card.dataset.depth = String(depth);
  document.body.appendChild(card);
  card.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  card.addEventListener('pointerleave', scheduleClose);
  return card;
}

/** Kaynağın yanına yerleştirir; ekran kenarında yön değiştirir. */
function place(card, anchor) {
  const rect = anchor.getBoundingClientRect();
  card.style.visibility = 'hidden';
  card.style.left = '0px';
  card.style.top = '0px';
  const box = card.getBoundingClientRect();
  // Bazi baglamlarda (gizli sekme, gomulu panel) `innerWidth` 0 doner ve
  // karti koseye sikistirirdi; belge kutusu daha guvenilir bir tabandir.
  const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;

  // Dikey: altına sığıyorsa alta, sığmıyorsa üste.
  let top = rect.bottom + 6;
  if (top + box.height > vh - EDGE) {
    const above = rect.top - box.height - 6;
    top = above >= EDGE ? above : Math.max(EDGE, vh - box.height - EDGE);
  }
  // Yatay: sola hizalı başlar, sağa taşarsa kaynağın sağ kenarına yaslanır.
  let left = rect.left;
  if (left + box.width > vw - EDGE) left = rect.right - box.width;
  left = Math.max(EDGE, Math.min(left, vw - box.width - EDGE));

  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
  card.style.visibility = '';
}

/** Verilen derinlikten AŞAĞIYI kapatır (üst katmanlar kalır). */
function closeFrom(depth) {
  while (layers.length > depth) {
    const layer = layers.pop();
    layer.card.remove();
  }
}

function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => closeFrom(0), GRACE);
}

/** Tümünü kapatır ve bekleyen zamanlayıcıları temizler (panel kapanışı). */
export function hideTooltips() {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  closeFrom(0);
}

function open(element, depth) {
  const id = element.dataset.tip;
  const provider = providers.get(id);
  if (!provider) return;
  let data = null;
  try {
    data = provider(element.dataset.tipArg ?? '', element);
  } catch {
    // Bozuk bir sağlayıcı ekranı düşürmez: tooltip yoksa yoktur.
    data = null;
  }
  if (!data) return;
  closeFrom(depth);
  const card = makeCard(depth);
  card.innerHTML = render(data);
  card.classList.add(`tip-${data.type ?? 'simple'}`);
  place(card, element);
  layers.push({ card, source: element, depth });
}

/** Bir öğenin hangi katmanın içinde olduğunu bulur (0 = ekranın kendisi). */
function depthOf(element) {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].card.contains(element)) return layers[i].depth + 1;
  }
  return 0;
}

/**
 * Sistemi bir kez kurar. Kök `document`tir: ekranlar, harita araçları ve
 * kutu hepsi aynı dinleyiciyi paylaşır.
 */
export function mountTooltips() {
  if (mounted) return;
  mounted = true;

  document.addEventListener('pointerover', (event) => {
    const element = event.target.closest?.('[data-tip]');
    if (!element) return;
    const depth = depthOf(element);
    if (depth >= MAX_DEPTH) return;
    // Aynı kaynağın üstünde gezinmek yeniden açmaz.
    if (layers[depth] && layers[depth].source === element) {
      clearTimeout(closeTimer);
      return;
    }
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    // GECİKME: anlık açılan kart, imleç ekranda gezerken yanıp söner. Anlık
    // olan yalnız görsel vurgudur (CSS :hover); BİLGİ gecikmeyle gelir.
    openTimer = setTimeout(() => open(element, depth), depth ? NESTED_DELAY : DELAY);
  });

  document.addEventListener('pointerout', (event) => {
    const element = event.target.closest?.('[data-tip]');
    if (!element) return;
    const to = event.relatedTarget;
    // Karta doğru çıkıyorsa kapatma: oyuncu içeriği okumaya gidiyor.
    if (to && layers.some((layer) => layer.card.contains(to))) return;
    if (to && to.closest?.('[data-tip]')) { clearTimeout(openTimer); return; }
    clearTimeout(openTimer);
    scheduleClose();
  });

  // Kaydırma ve tıklama kartı düşürür: yanlış yerde asılı kalmasın.
  document.addEventListener('pointerdown', hideTooltips, true);
  window.addEventListener('blur', hideTooltips);
  document.addEventListener('scroll', hideTooltips, true);
}
