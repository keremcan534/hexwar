// Gecikmeli bilgi kartı sistemi — TEK yönetici.
//
// Oyundaki bütün açıklamalı hover'lar buradan geçer: `data-tip` sağlayıcıları,
// eski `title` öznitelikleri ve `data-tooltip` (ikisi ilk hover'da devşirilir,
// bkz. adopt). Yeni kod `title` yazmaz; `data-tip` + sağlayıcı yazar.
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
// NEDEN GEOMETRİ: kart tıklamayı yutmaz (pointer-events yalnız terimlerde
// açık, bkz. styles.css §29). Kartın altındaki düğmeye yapılan tık o düğmeye
// gider; kartın "içinde" olmak bu yüzden olay hedefiyle değil, imlecin kartın
// dikdörtgeninde olmasıyla ölçülür. Eskiden kart imleç altındaki denetimin
// üstüne girince anında kapanıyordu (passThrough): üst çubuk kartlarının üst
// yarısı sekme şeridinin üstündeydi ve hiçbirine girilemiyordu (T-01).
//
// İÇERİK BURADA HESAPLANMAZ. Sağlayıcılar alan katmanının döküm
// fonksiyonlarını okur (bkz. tooltipData.js); tooltip kodu hiçbir simülasyon
// formülünü kopyalamaz — kopyalasaydı ekranla motor zamanla ayrışırdı.
//
// Katman notu: yalnız DOM. Oyun durumuna sağlayıcılar üzerinden erişir.

import { localRect, viewport } from './uiScale.js';

/**
 * Birinci katman: oyuncu gerçekten "ne bu?" diye durmuş olmalı. 550 ms'de
 * kart imleç üst çubukta gezerken sekme sekme açılıyordu; Paradox bandının
 * üst ucu (~700 ms) okumak için duranı gezinenden ayırır. Vurgu anlıktır.
 */
const DELAY = 700;
/** İç içe katman: zaten okuma kipindedir, daha kısa. */
const NESTED_DELAY = 300;
/** Kaynakla kart arasında gezerken kapanmasın diye mühlet. */
const GRACE = 260;
/**
 * Karta doğru giden imleç mühleti tazeler ama sonsuza dek değil: yolda başka
 * kaynakların üstünden geçen çapraz hareket (kaynak çipleri, sekme şeridi)
 * GRACE'ten uzun sürebilir; yaklaşmayı bırakan imleç kartı bırakmış sayılır.
 */
const TRAVEL = 1200;
/** Derinlik sınırı: sonsuz zincir okunmaz hale gelir. */
const MAX_DEPTH = 3;
const EDGE = 8;
const GAP = 6;

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
 * `effects` sonuçlardır: "bu değer neyi değiştiriyor". `text`, `note` ve
 * `footer` ham HTML'dir (tipTerm terimleri buradan girer); satır etiketleri
 * kaçırılır, yalnız `labelHtml` verilen satır terim taşıyabilir.
 */
/*
 * TEK BAKIŞTA OKUNAN KART (Kerem 2026-11-20: "tooltipler kısa, net, anlaşılır; bonuslar renkli,
 * ekstra şeyler çizgili, tekte anlaşılır"). 832 kartın 98'i 30 kelimeyi aşıyordu (en uzunu 172).
 * Metinler tek tek yazılmadan bütün kartlar aynı düzene girer: başlık + değer, TEK cümle ana fikir,
 * renkli etkiler, formül; kalan cümleler ve dipnot kesik çizginin altında sönük "ek bilgi" olur.
 */

/** Ana fikir bu kadar kelimeyi aşmayan metinde bölünmez: kısa metin zaten tek bakışta okunur. */
const LEAD_WORDS = 25;

/** HTML'i etiket ve metin parçalarına ayırır; değişiklik yalnız metin parçasına uygulanır. */
function mapText(html, fn) {
  return String(html).split(/(<[^>]+>)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

/**
 * Metindeki işaretli sayılar: yüzde değişiklik bonus (yeşil) ya da ceza (kırmızı), diğer işaretli
 * sayılar yalnız kalın. Ardından "dearer/cost/upkeep" gibi bir bedel sözü geliyorsa anlam tersine
 * döner ("imports +50% dearer" kötüdür).
 */
const COST_WORD = /^\s*(dearer|costlier|cost|costs|slower|upkeep|infamy|unrest|exhaustion|attrition|price|prices|tension|resentment)\b/i;
function toneNumbers(html) {
  return mapText(html, (text) => text.replace(/([+−-])(\d+(?:[.,]\d+)*)(%?)/g, (match, sign, num, pct, at, whole) => {
    // Kısa çizgi sözcük içindeyse (Saint-Venant, 1914-18) sayı değildir.
    if (sign === '-' && at > 0 && /[\w\d]/.test(whole[at - 1])) return match;
    if (!pct) return `<b class="tip-num">${match}</b>`;
    let good = sign === '+';
    if (COST_WORD.test(whole.slice(at + match.length))) good = !good;
    return `<b class="${good ? 'tip-pos' : 'tip-neg'}">${match}</b>`;
  }));
}

/** İlk cümle ve kalanı. Sınır: metin parçasında [.!?] + boşluk + büyük harf ya da etiket. */
function splitLead(html) {
  const plain = String(html).replace(/<[^>]+>/g, ' ');
  if (plain.trim().split(/\s+/).length <= LEAD_WORDS) return [html, ''];
  const parts = String(html).split(/(<[^>]+>)/);
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const m = /[.!?](\s+)(?=[A-Z0-9"“(]|$)/.exec(parts[i]);
      if (m && (m.index + 1 < parts[i].length)) {
        const cut = pos + m.index + 1;
        const rest = String(html).slice(cut).trim();
        if (rest) return [String(html).slice(0, cut), rest];
      }
    }
    pos += parts[i].length;
  }
  return [html, ''];
}

/** Etki satırının tonu verilmemişse işaretten: "+4% Land attack" yeşil, "−3%" kırmızı. */
function effectTone(row) {
  if (row.tone) return row.tone;
  const v = String(row.value ?? '').trim();
  if (/^\+\s*0*[.,]?0*%?$/.test(v)) return '';
  if (v.startsWith('+')) return 'good';
  if (v.startsWith('−') || v.startsWith('-')) return 'bad';
  return '';
}

function render(data) {
  if (!data) return '';
  const label = (row) => row.labelHtml ?? esc(row.label);
  const rows = (data.rows ?? []).map((row) => `
    <div class="tip-row ${row.tone ?? ''}">
      <span>${label(row)}</span>
      <b>${esc(String(row.value))}</b>
    </div>`).join('');
  const effects = (data.effects ?? []).map((row) => `
    <div class="tip-effect">
      <span>${label(row)}</span>
      <b class="${effectTone(row)}">${esc(String(row.value))}</b>
    </div>`).join('');
  const [lead, more] = data.text ? splitLead(data.text) : ['', ''];
  const extra = [more, data.footer].filter(Boolean).map((part) => `<p>${toneNumbers(part)}</p>`).join('');
  // Başlıksız kart (yalnız açıklama cümlesi) boş bir başlık şeridi taşımaz.
  const head = data.title || data.value != null ? `
    <div class="tip-head">
      <b>${esc(data.title ?? '')}</b>
      ${data.value != null ? `<span class="tip-value">${esc(String(data.value))}</span>` : ''}
    </div>` : '';
  return `${head}
    ${data.note ? `<div class="tip-note">${data.note}</div>` : ''}
    ${lead ? `<p class="tip-text tip-lead">${toneNumbers(lead)}</p>` : ''}
    ${effects ? `<div class="tip-block"><small>${esc(data.effectsLabel ?? 'Effects')}</small>${effects}</div>` : ''}
    ${rows ? `<div class="tip-block"><small>${esc(data.rowsLabel ?? 'Why')}</small>${rows}</div>` : ''}
    ${extra ? `<div class="tip-extra">${extra}</div>` : ''}`;
}

/* ==========================================================================
   YÖNETİCİ
   ========================================================================== */

const providers = new Map();

/**
 * DÜZ METİN SAĞLAYICI. Eski `title` ve `data-tooltip` açıklamaları buradan
 * geçer: tarayıcının gecikmeli, düz ve ekran görüntüsüne bile girmeyen
 * balonu ile saf CSS balonu yan yana iki ayrı dil konuşuyordu. İlk satır çok
 * satırlı metinde başlık olur.
 */
providers.set('text', (arg, element) => {
  const lines = String(element?.dataset.tipText ?? '')
    .split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (lines.length === 1) return { type: 'simple', text: esc(lines[0]) };
  return { type: 'simple', title: lines[0], text: lines.slice(1).map(esc).join('<br>') };
});

/**
 * `title`/`data-tooltip` taşıyan öğeyi karta devşirir: metin `data-tip-text`e
 * taşınır, yerel balon kaldırılır. Yalnız simgeden oluşan düğme adını
 * kaybetmesin diye metnin ilk satırı erişilebilir ada yazılır.
 */
function adopt(element) {
  if (!element) return null;
  if (element.dataset.tip) return element;
  const text = element.getAttribute('title') ?? element.getAttribute('data-tooltip');
  if (!text || !text.trim()) return null;
  element.removeAttribute('title');
  element.removeAttribute('data-tooltip');
  if (!element.hasAttribute('aria-label') && !element.textContent.trim()) {
    element.setAttribute('aria-label', text.split('\n')[0]);
  }
  element.dataset.tip = 'text';
  element.dataset.tipText = text;
  return element;
}

const SOURCE = '[data-tip], [title], [data-tooltip]';

/**
 * Bir tooltip kaynağı tanımlar.
 * @param {string} id  `data-tip` değeri
 * @param {(arg: string, element: HTMLElement) => object|null} fn
 */
export function provideTooltip(id, fn) {
  providers.set(id, fn);
}

/**
 * Sağlayıcının içeriği, kart açmadan. Kalıcı bir panel kartla aynı sayıyı
 * söylemek isterse buradan okur (iki ayrı döküm zamanla ayrışır); içerik
 * taraması da her sağlayıcıyı fare olmadan bununla çağırır.
 */
export function tooltipHtml(id, arg = '') {
  const provider = providers.get(id);
  return provider ? render(provider(arg, null)) : '';
}

/**
 * İçeriğin içinde ikincil terim: `tipTerm('term', 'stability', 'stability')`.
 * Terim kartın içinde kendi kartını açar (iç içe katman); sağlayıcı yoksa
 * vurgulu kelime yalan söylemesin diye düz metin yazılır.
 */
export function tipTerm(id, label, arg = '') {
  if (!providers.has(id)) return esc(label);
  // <span>, <b> değil: satır değerinin `.tip-row b` rengi (kırmızı/yeşil) terimi boyuyordu.
  return `<span class="tip-term" data-tip="${esc(id)}"${arg ? ` data-tip-arg="${esc(arg)}"` : ''}>${esc(label)}</span>`;
}

/** Açık katmanlar: { card, source, depth }. Dizin = derinlik. */
const layers = [];
/** Açılmayı bekleyen kaynak: { element, depth, timer }. */
let pending = null;
/** Kapanmayı bekleyen derinlik: { depth, timer, since, dist }. */
let closing = null;
/** Son bilinen imleç (kart pointer-events taşımadığı için geometri buradan). */
const pointer = { x: -1, y: -1, buttons: 0 };
let observer = null;
let mounted = false;

const rectOf = (card) => card.getBoundingClientRect();
const within = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
function distanceTo(r, x, y) {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

/** Öğeyi içeren kartın katmanı (-1: ekranın kendisi). */
function cardIndexOf(element) {
  if (!element?.closest) return -1;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].card.contains(element)) return i;
  }
  return -1;
}

/** İmlecin geometrik olarak içinde durduğu en derin kart (-1: hiçbiri). */
function insideIndex() {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (within(rectOf(layers[i].card), pointer.x, pointer.y)) return i;
  }
  return -1;
}

/** Bir öğenin hangi katmanın içinde olduğunu bulur (0 = ekranın kendisi). */
function depthOf(element) {
  const index = cardIndexOf(element);
  return index < 0 ? 0 : index + 1;
}

function makeCard(depth) {
  const card = document.createElement('div');
  card.className = 'tip-card';
  card.setAttribute('role', 'tooltip');
  card.dataset.depth = String(depth);
  document.body.appendChild(card);
  return card;
}

/**
 * Programla geri yüklenen kaydırma konumları. Ekranlar her tazelemede
 * gövdeyi baştan kurup iç listelerin konumunu geri yazar; bu bir `scroll`
 * olayı doğurur ve "kaydırma kartı düşürür" kuralı oyunda AÇIK OLAN HER
 * KARTI haftada bir kapatıyordu — kaydırılmış bir ekran açıkken hiçbir ipucu
 * yarım saniyeden uzun yaşamıyordu (ölçüldü). Oyuncunun kaydırması değildir.
 */
const quietScrolls = new WeakMap();
export function quietScroll(node) {
  quietScrolls.set(node, performance.now());
}
function onScroll(event) {
  // Uzun kartın kendi kaydırması okumanın parçasıdır.
  if (event.target?.closest?.('.tip-card')) return;
  const at = quietScrolls.get(event.target);
  if (at != null && performance.now() - at < 300) return;
  hideTooltips();
}

const clampTo = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Yerleşim. Birinci katman kaynağın altına, sığmazsa üstüne; ikisi de
 * yetmezse YANINA (tam ekran boyu) açılır, o da olmazsa geniş tarafa boyu
 * kısılıp kaydırılır — kaynağı hiç örtmez. İç katman üst kartın yanına
 * açılır (sağ, kenarda sol): terimin altına açılan kart üst kartın kalan
 * satırlarını ve öteki terimleri örtüyordu (T-05).
 */
function place(card, anchor, depth) {
  // Bütün hesap YEREL px'te (ui/uiScale.js): kart yakınlaştırılmış bir
  // köktür, yazılan left/top ölçekle çarpılır. Görsel dikdörtgenle hesap
  // 1440p'de kartı kaynağın 1.33 katı uzağına atıyordu.
  // Bazı bağlamlarda (gizli sekme, gömülü panel) `innerWidth` 0 döner ve
  // kartı köşeye sıkıştırırdı; viewport() belge kutusuna düşer.
  const a = localRect(anchor);
  const { w: vw, h: vh } = viewport();
  card.style.visibility = 'hidden';
  card.style.left = '0px';
  card.style.top = '0px';
  card.style.maxHeight = `${vh - EDGE * 2}px`;
  let box = localRect(card);
  const fitsRight = (x) => x + box.width <= vw - EDGE;
  let left = null;
  let top = null;

  if (depth > 0 && layers[depth - 1]) {
    const parent = localRect(layers[depth - 1].card);
    if (fitsRight(parent.right + GAP)) left = parent.right + GAP;
    else if (parent.left - GAP - box.width >= EDGE) left = parent.left - GAP - box.width;
    if (left != null) {
      // Terimin satırına hizalı: göz satırdan karta yatay kayar.
      top = clampTo(a.top - 8, EDGE, vh - box.height - EDGE);
    } else {
      // Yan yana sığmayan dar ekranda üst kartın altına/üstüne, üstüne asla.
      const below = vh - EDGE - (parent.bottom + GAP);
      const above = parent.top - GAP - EDGE;
      if (box.height > Math.max(below, above)) {
        card.style.maxHeight = `${Math.max(below, above)}px`;
        box = localRect(card);
      }
      top = below >= above ? parent.bottom + GAP : parent.top - GAP - box.height;
      left = clampTo(parent.left, EDGE, vw - box.width - EDGE);
    }
  } else {
    const below = vh - EDGE - (a.bottom + GAP);
    const above = a.top - GAP - EDGE;
    if (box.height <= below) top = a.bottom + GAP;
    else if (box.height <= above) top = a.top - GAP - box.height;
    else if (fitsRight(a.right + GAP)) {
      left = a.right + GAP;
      top = clampTo(a.top, EDGE, vh - box.height - EDGE);
    } else if (a.left - GAP - box.width >= EDGE) {
      left = a.left - GAP - box.width;
      top = clampTo(a.top, EDGE, vh - box.height - EDGE);
    } else {
      card.style.maxHeight = `${Math.max(below, above)}px`;
      box = localRect(card);
      top = below >= above ? a.bottom + GAP : a.top - GAP - box.height;
    }
    if (left == null) {
      // Yatay: sola hizalı başlar, sağa taşarsa kaynağın sağ kenarına yaslanır.
      left = a.left;
      if (!fitsRight(left)) left = a.right - box.width;
      left = clampTo(left, EDGE, vw - box.width - EDGE);
    }
  }
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(Math.max(EDGE, top))}px`;
  card.style.visibility = '';
  markScroll(card);
}

/**
 * Boyu ekrana sığmayan kart kendi içinde kaydırılır; kaydırma çubuğu ve
 * tekerlek ancak kart olay alırsa çalışır. Yalnız bu kartlar tıklamayı tutar.
 */
function markScroll(card) {
  card.classList.toggle('tip-scroll', card.scrollHeight > card.clientHeight + 1);
}

/** Verilen derinlikten AŞAĞIYI kapatır (üst katmanlar kalır). */
function closeFrom(depth) {
  while (layers.length > depth) {
    const layer = layers.pop();
    layer.card.remove();
  }
  if (closing && closing.depth >= layers.length) cancelClose();
  if (!layers.length) observer?.disconnect();
}

function cancelClose() {
  if (!closing) return;
  clearTimeout(closing.timer);
  closing = null;
}

function cancelPending() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending = null;
}

/**
 * `depth`ten aşağısı GRACE sonra kapanır. İmleç o derinliğin kartına
 * yaklaştıkça (uzaklık ilk kez küçüldükçe) mühlet TRAVEL tavanına dek tazelenir.
 */
function closeLater(depth) {
  // Kapanacak kartların en yakını: iç karta giden imleç üst kartla iç kart
  // arasındaki boşluktan geçerken kök derinlik kapanmaya aday olur.
  let dist = Infinity;
  for (let i = depth; i < layers.length; i++) {
    dist = Math.min(dist, distanceTo(rectOf(layers[i].card), pointer.x, pointer.y));
  }
  const now = performance.now();
  if (closing && closing.depth === depth) {
    if (dist < closing.dist - 0.5 && now - closing.since < TRAVEL) {
      clearTimeout(closing.timer);
      closing.timer = setTimeout(fireClose, GRACE);
    }
    closing.dist = Math.min(closing.dist, dist);
    return;
  }
  cancelClose();
  closing = { depth, since: now, dist, timer: setTimeout(fireClose, GRACE) };
}

function fireClose() {
  const depth = closing?.depth;
  closing = null;
  if (depth != null) closeFrom(depth);
}

/**
 * Kaynağı açılmaya aday yapar. Bekleme olayın KENDİ zaman damgasından
 * sayılır: ana iş parçacığı meşgulken olay geç dağıtılınca kart da o kadar
 * gecikiyordu (ölçüldü: 550 ms hedefe 562-1000 ms).
 */
function want(element, depth, stamp) {
  if (pending && pending.depth === depth && sameSource(pending.element, element)) {
    pending.element = element;
    return;
  }
  cancelPending();
  const wait = (depth ? NESTED_DELAY : DELAY) - Math.max(0, performance.now() - stamp);
  const entry = { element, depth, timer: 0 };
  entry.timer = setTimeout(() => {
    if (pending !== entry) return;
    pending = null;
    // Beklerken kaynak yeniden kurulduysa (haftalık tazeleme) aynı kimlikteki
    // yeni düğüm açılır; terim üst kartın içinde aranır.
    const element = entry.element.isConnected ? entry.element
      : findSame(entry.element, entry.depth ? layers[entry.depth - 1]?.card : document);
    if (element) open(element, entry.depth);
  }, Math.max(0, wait));
  pending = entry;
}

/**
 * Her imleç olayında katmanların hâli yeniden kurulur: hangi kaynak "sıcak",
 * kaç katman kalmalı, hangisi beklemeli. Kartın altında kalan öğe görünmez
 * sayılır — kartı okuyan imleç alttaki sekmenin kartını açmamalı.
 */
function track(target, stamp = performance.now()) {
  pruneOrphans();
  const inside = insideIndex();
  const own = cardIndexOf(target);
  let hot = null;
  let host = 0;
  if (inside >= 0 && own < inside) {
    host = inside + 1;
  } else if (own >= 0) {
    host = own + 1;
    const term = target.closest('[data-tip]');
    hot = term && layers[own].card.contains(term) ? term : null;
  } else {
    hot = adopt(target?.closest?.(SOURCE) ?? null);
  }
  let keep = host;
  if (hot && layers[host] && sameSource(layers[host].source, hot)) {
    // Aynı kaynağın üstünde gezinmek yeniden açmaz; yeniden kurulmuş aynı
    // kaynak (haftalık tazeleme) kartı yerinde günceller.
    if (layers[host].source !== hot) refresh(layers[host], hot);
    keep = host + 1;
    hot = null;
  }
  // Basılı tuşla gezen imleç (sürükleme, kaydırma çubuğu) kart açmaz.
  if (hot && host < MAX_DEPTH && !pointer.buttons) want(hot, host, stamp);
  else cancelPending();
  if (layers.length > keep) closeLater(keep);
  else cancelClose();
  return inside;
}

/**
 * Kaynağı DOM'dan düşen katman: haftalık tazelemede aynı kimlikte yeni öğe
 * varsa ona bağlanır, yoksa kapanır. Kaynağı silinen kart eskiden imleç
 * oynayana dek havada kalıyordu (Esc ile kapanan province paneli, T-02).
 */
function pruneOrphans() {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.source?.isConnected) continue;
    // İç katmanın terimi yalnız ÜST kartında aranır: aynı terim başka bir
    // kartta da olabilir (istikrar hem güç hem çıktı kartında).
    const found = findSame(layer.source, layer.depth ? layers[layer.depth - 1]?.card : document);
    if (found) {
      refresh(layer, found);
      continue;
    }
    closeFrom(i);
    return;
  }
}

/** Aynı kimlikteki yeni kaynak; ekran düzeyinde aranırken kartların terimleri sayılmaz. */
function findSame(old, root = document) {
  if (!old?.dataset?.tip || !root) return null;
  for (const element of root.querySelectorAll('[data-tip]')) {
    if (root === document && element.closest('.tip-card')) continue;
    if (element.dataset.tip === old.dataset.tip && sameSource(old, element)) return element;
  }
  return null;
}

/**
 * Açık kartları canlı tutar. Kaynağı haftalık tazelemede yeniden kurulduysa
 * aynı kimlikteki yeni öğe bulunur ve içerik YERİNDE güncellenir: kart ne
 * kapanır ne kayar, ama eski sayıyı da göstermez (ölçüldü: hazine kartı açık
 * kalırken "134 gold" diyordu, çubuk 122). Bulunamazsa kart kapanır.
 * HUD ve ekranlar her tazelemenin sonunda çağırır.
 */
export function refreshTooltips() {
  pruneOrphans();
}

/**
 * Kaynağı YERİNDE duran kartlar için: sekme düğmeleri haftalık yeniden
 * kurulmaz, yalnız içlerindeki sayı değişir (tabLedger.js). refreshTooltips
 * bağlı kaynağı atlar; burada `root` içindeki açık kart yeniden çizilir.
 */
export function refreshTooltipsWithin(root) {
  for (const layer of layers) {
    const source = layer.source;
    if (source?.isConnected && root.contains(source)) refresh(layer, source);
  }
}

/** Tümünü kapatır ve bekleyen zamanlayıcıları temizler (panel kapanışı). */
export function hideTooltips() {
  cancelPending();
  cancelClose();
  closeFrom(0);
}

/**
 * Aynı bilgi mi? Üst çubuk ve açık ekranlar her hafta innerHTML ile yeniden
 * kurulur; imlecin altındaki öğe YENİ bir düğümdür ama aynı sağlayıcıyı ve
 * argümanı taşır. Bunu "başka kaynak" sayınca kart her hafta kapanıp
 * gecikmeyle yeniden açılıyordu (Kerem: "açılıp kapanma, gidip gelmeler").
 */
function sameSource(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.dataset.tip !== b.dataset.tip) return false;
  if ((a.dataset.tipArg ?? '') !== (b.dataset.tipArg ?? '')) return false;
  // Serbest metinli kartta ilk satır (başlık) kimliktir; sayılar değişebilir.
  if (a.dataset.tip === 'text') {
    const head = (el) => (el.dataset.tipText ?? '').split('\n')[0];
    return head(a) === head(b);
  }
  return true;
}

function contentOf(element) {
  const provider = providers.get(element.dataset.tip);
  if (!provider) return null;
  try {
    return provider(element.dataset.tipArg ?? '', element);
  } catch (error) {
    // Bozuk bir sağlayıcı ekranı düşürmez: tooltip yoksa yoktur. Ama sessiz
    // de kalmaz — kayıp kart eskiden iz bırakmıyordu.
    console.warn(`tooltip '${element.dataset.tip}':`, error);
    return null;
  }
}

/** Açık kartın içeriğini yerinde tazeler: kapanmaz, ekrandan taşmadıkça yeri değişmez. */
function refresh(layer, element) {
  layer.source = element;
  const data = contentOf(element);
  if (!data) return;
  const html = render(data);
  const card = layer.card;
  // Son yazılan dizgiyle karşılaştırılır, `innerHTML` ile değil: tarayıcının
  // geri serileştirmesi (&#39; → ') hiç eşit çıkmıyor, kart her tazelemede
  // baştan yazılıyordu ve imlecin altındaki terim düğümü değişiyordu.
  if (layer.html !== html) {
    const scroll = card.scrollTop;
    card.innerHTML = html;
    card.scrollTop = scroll;
    layer.html = html;
  }
  // Biçim de değişebilir (canlı sekme kartı oyuncu elenince sadeleşir):
  // eski `tip-breakdown` kalınca kart yanlış genişlikte kalıyordu.
  const type = `tip-${data.type ?? 'simple'}`;
  if (!card.classList.contains(type)) {
    card.classList.remove('tip-simple', 'tip-breakdown', 'tip-mechanic');
    card.classList.add(type);
  }
  const r = rectOf(card);
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;
  const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
  if (r.bottom > vh - EDGE + 1 || r.right > vw - EDGE + 1) place(card, element, layer.depth);
  else markScroll(card);
}

function open(element, depth) {
  const data = contentOf(element);
  if (!data) return;
  closeFrom(depth);
  if (closing && closing.depth >= depth) cancelClose();
  const card = makeCard(depth);
  const html = render(data);
  card.innerHTML = html;
  card.classList.add(`tip-${data.type ?? 'simple'}`);
  place(card, element, depth);
  layers.push({ card, source: element, depth, html });
  watch();
}

/**
 * Kaynağı silen her DOM değişikliği (panel kapanışı, ekran değişimi) kartı
 * hemen sınar; imleç kıpırdamasa da yetim kart kalmaz. Yalnız kart açıkken
 * dinlenir: kapalıyken haftalık HUD yazımları hiç maliyet doğurmaz.
 */
function watch() {
  if (typeof MutationObserver === 'undefined') return;
  observer ??= new MutationObserver(() => {
    if (layers.length) pruneOrphans();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Sistemi bir kez kurar. Kök `document`tir: ekranlar, harita araçları ve
 * kutu hepsi aynı dinleyiciyi paylaşır.
 */
export function mountTooltips() {
  if (mounted) return;
  mounted = true;

  const note = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.buttons = event.buttons ?? 0;
  };

  document.addEventListener('pointerover', (event) => {
    note(event);
    // GECİKME: anlık açılan kart, imleç ekranda gezerken yanıp söner. Anlık
    // olan yalnız görsel vurgudur (CSS :hover); BİLGİ gecikmeyle gelir.
    track(event.target, event.timeStamp);
  });

  window.addEventListener('pointermove', (event) => {
    note(event);
    if (!layers.length && !pending) return;
    const inside = track(event.target, event.timeStamp);
    // Kartın altındaki öğe imleci görmez: harita kart altındaki hexi
    // vurgulamasın, birim künyesi kartın üstüne açılmasın. Tık yine geçer.
    if (inside >= 0 && cardIndexOf(event.target) < 0 && !event.buttons) event.stopPropagation();
  }, { capture: true, passive: true });

  document.addEventListener('pointerout', (event) => {
    // Pencereden çıkan imleç: arkasından pointerover gelmez.
    if (event.relatedTarget) return;
    cancelPending();
    if (layers.length) closeLater(0);
  });

  // KLAVYE. Sekmeyle gezen oyuncu da aynı açıklamayı alır. Yalnız
  // :focus-visible — tıklamanın odağı kartı düğmenin üstünde yeniden açmasın.
  document.addEventListener('focusin', (event) => {
    if (!event.target.matches?.(':focus-visible')) return;
    const element = adopt(event.target.closest?.(SOURCE));
    if (!element) return;
    const depth = depthOf(element);
    if (depth >= MAX_DEPTH) return;
    if (layers[depth] && sameSource(layers[depth].source, element)) return;
    want(element, depth, event.timeStamp);
  });
  document.addEventListener('focusout', (event) => {
    if (pending?.element === event.target) cancelPending();
    const index = layers.findIndex((layer) => layer.source === event.target);
    if (index >= 0 && insideIndex() < index && !event.target.matches?.(':hover')) closeLater(index);
  });

  // Tık kartı düşürür ve ALTINDAKİ denetime gider (kart tıklamayı tutmaz).
  // Terime tık beklemeden açar; uzun kartın içine tık kaydırma içindir.
  window.addEventListener('pointerdown', (event) => {
    const own = cardIndexOf(event.target);
    if (own < 0) {
      hideTooltips();
      return;
    }
    const term = event.target.closest('[data-tip]');
    if (!term || !layers[own].card.contains(term) || own + 1 >= MAX_DEPTH) return;
    cancelPending();
    if (!(layers[own + 1] && sameSource(layers[own + 1].source, term))) open(term, own + 1);
  }, true);

  // Tekerlek de tık gibi kartın ALTINA gider (kart olay almaz): harita kartın
  // altında yakınlaşırken kart eski yerinde asılı kalıyordu. Uzun kartın
  // kendi kaydırması okumadır, kartı kapatmaz.
  window.addEventListener('wheel', (event) => {
    if (!layers.length || cardIndexOf(event.target) >= 0) return;
    note(event);
    if (insideIndex() >= 0) hideTooltips();
  }, { capture: true, passive: true });

  // Esc evrensel "kapat"tır; kartı kapatır ama zinciri kesmez (panel de kapanır).
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (layers.length || pending)) hideTooltips();
  }, true);

  // Kaydırma ve odak kaybı kartı düşürür: yanlış yerde asılı kalmasın.
  window.addEventListener('blur', hideTooltips);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideTooltips();
  });
  document.addEventListener('scroll', onScroll, true);
}
