// ARAYÜZ KİTİ — Uluslar Çağı ekranlarının ortak bileşenleri.
//
// Neden ayrı bir kit: ilk taslak ekranlar her paneli `etiket ......... değer`
// satırlarıyla kurdu; satır tam genişliğe yayılınca etiketle değer arasında
// 400 piksel boşluk kalıyor, her şey aynı boy düz metin görünüyordu
// (kör bakışta "Paint'ten yapıştırma"). Kit üç kural koyar:
//   1. Her panelin TEK ana metriği vardır ve büyüktür (kpi).
//   2. Liste satırı kendi sütununda kalır; sütunlar ızgaraya dizilir (ledger).
//   3. Her sayı açıklanır: bileşen `tip` alırsa `data-tip` yazar, kart
//      tooltip.js'in sağlayıcısından gelir. Açıklamasız sayı bırakılmaz.
//
// Katman notu: yalnız HTML dizgisi üretir; oyun durumu okumaz.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const num = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
export const signed = (value, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value ?? 0).toFixed(digits)}`;
export const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;
export const pts = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round((value ?? 0) * 100))}`;
export const tone = (value) => (value < 0 ? 'neg' : value > 0 ? 'pos' : '');

/** Büyük sayıyı kısalt: 12 400 → 12.4K. */
export function short(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString('en-US');
}

/** Tooltip öznitelikleri: `tip` sağlayıcı adı ya da { text } düz metin. */
export function tipAttr(tip, arg = '') {
  if (!tip) return '';
  if (typeof tip === 'object') return ` data-tip="text" data-tip-text="${esc(tip.text)}"`;
  return ` data-tip="${esc(tip)}"${arg !== '' && arg != null ? ` data-tip-arg="${esc(arg)}"` : ''}`;
}

/** Engel listesi: düğmeyi kapatır ve sebebini kartla söyler. */
export function blockedAttr(blockers) {
  if (!blockers?.length) return '';
  return ` disabled aria-disabled="true" data-tip="text" data-tip-text="${esc(['Not possible now', ...blockers].join('\n'))}"`;
}

/**
 * Gösterge kutusu: simge, versal etiket, büyük değer, alt satır. `meter`
 * verilirse alt kenarda ince bir dolum çubuğu (0-1) çizer.
 */
export function kpi({ icon = '', label, value, sub = '', tip = null, arg = '', cls = '', meter = null, meterTone = '' }) {
  return `<div class="k-kpi ${cls}"${tipAttr(tip, arg)}>
    ${icon ? `<span class="k-kpi-ico">${icon}</span>` : ''}
    <span class="k-kpi-body">
      <small>${esc(label)}</small>
      <b>${value}</b>
      ${sub ? `<em>${sub}</em>` : ''}
    </span>
    ${meter != null ? `<i class="k-kpi-meter ${meterTone}"><i style="width:${Math.round(Math.max(0, Math.min(1, meter)) * 100)}%"></i></i>` : ''}
  </div>`;
}

export function kpiRow(items) {
  return `<div class="k-kpis" style="--n:${items.length}">${items.join('')}</div>`;
}

/** Panel: pirinç başlık şeridi + gövde. `right` başlığın sağ ucu (özet/düğme). */
export function panel(title, body, { sub = '', right = '', cls = '', tip = null, arg = '' } = {}) {
  return `<section class="k-panel ${cls}">
    <header class="k-head"${tipAttr(tip, arg)}><h3>${esc(title)}</h3>${sub ? `<small>${sub}</small>` : ''}${right ? `<span class="k-head-r">${right}</span>` : ''}</header>
    <div class="k-body">${body}</div>
  </section>`;
}

/**
 * Defter: simgeli, sıkı satırlar. Satır { icon, label, value, tone, tip,
 * arg, sub, strong }. Kendi sütun genişliğinde kalır.
 */
export function ledger(list, cls = '') {
  return `<div class="k-ledger ${cls}">${list.filter(Boolean).map((row) => `
    <div class="k-row${row.strong ? ' strong' : ''}${row.cls ? ` ${row.cls}` : ''}"${tipAttr(row.tip, row.arg)}>
      ${row.icon !== undefined ? `<span class="k-row-ico">${row.icon ?? ''}</span>` : ''}
      <span class="k-row-label">${row.label}${row.sub ? `<small>${row.sub}</small>` : ''}</span>
      <b class="k-row-val ${row.tone ?? ''}">${row.value}</b>
    </div>`).join('')}</div>`;
}

/** Yatay dolum çubuğu (0-1). `mark` hedef/tavan çizgisi (0-1). */
export function meter(share, { tone: t = '', mark = null, wide = false } = {}) {
  const w = Math.round(Math.max(0, Math.min(1, share ?? 0)) * 100);
  return `<span class="k-meter ${t}${wide ? ' wide' : ''}"><i style="width:${w}%"></i>${mark != null ? `<b style="left:${Math.round(Math.max(0, Math.min(1, mark)) * 100)}%"></b>` : ''}</span>`;
}

/**
 * Formül zinciri: taban × çarpanlar = sonuç, tek satırda pul pul. Eski
 * "Coal supply ............ ×1.00" satırları formülü dikine dağıtıyordu;
 * zincir onu bir bakışta okutur, her pulun kendi açıklaması vardır.
 */
export function chain(base, factors, result) {
  const pill = (p, op) => `<span class="k-pill ${p.tone ?? (op === '×' && p.value < 0.995 ? 'neg' : op === '×' && p.value > 1.005 ? 'pos' : '')}"${tipAttr(p.tip ?? { text: p.label }, p.arg)}>
    ${op ? `<i>${op}</i>` : ''}<b>${p.text ?? num(p.value, 2)}</b><small>${esc(p.label)}</small></span>`;
  return `<div class="k-chain">${pill(base, '')}${factors.map((f) => pill(f, '×')).join('')}<span class="k-eq">=</span>${pill(result, '')}</div>`;
}

/** Kademe pulları: 1..max, dolu/boş, `cap` tavan çizgisi. */
export function pips(value, max, cap = max) {
  let out = '';
  for (let i = 1; i <= max; i++) {
    out += `<i class="${i <= value ? 'on' : ''}${i > cap ? ' locked' : ''}"></i>`;
  }
  return `<span class="k-pips">${out}</span>`;
}

/** Bölünmüş kontrol (yasa seçenekleri gibi). */
export function segmented(options) {
  return `<div class="k-seg">${options.map((o) => `<button class="k-seg-b${o.on ? ' on' : ''}${o.confirm ? ' confirming' : ''}"
    ${o.attrs ?? ''}${o.on ? ' aria-pressed="true"' : ''}${tipAttr(o.tip, o.arg)}${o.on ? ' disabled' : o.blocked ? ' disabled aria-disabled="true"' : ''}>${o.label}</button>`).join('')}</div>`;
}

/** Boş durum: tek satır, soluk. */
export function empty(text) {
  return `<p class="k-empty">${esc(text)}</p>`;
}

/** Küçük, inline etiket rozeti. */
export function badge(text, cls = '') {
  return `<span class="k-badge ${cls}">${esc(text)}</span>`;
}

/** Sparkline (SVG). */
export function spark(values, { width = 220, height = 42, cls = '' } = {}) {
  const list = (values ?? []).filter(Number.isFinite);
  if (list.length < 2) return '<small class="k-dim">Not enough history yet</small>';
  const min = Math.min(...list, 0);
  const max = Math.max(...list, 1e-6);
  const span = Math.max(1e-6, max - min);
  const pts2 = list.map((value, index) => {
    const x = (index / (list.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const zero = height - ((0 - min) / span) * (height - 2) - 1;
  return `<svg viewBox="0 0 ${width} ${height}" class="k-spark ${cls}" preserveAspectRatio="none">
    <polygon points="0,${height} ${pts2.join(' ')} ${width},${height}" class="area"/>
    <line x1="0" x2="${width}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" class="zero"/>
    <polyline points="${pts2.join(' ')}"/></svg>`;
}
