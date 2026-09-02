// Üst çubuktaki makro ölçülerin gecikmeli bilgi kartı.
//
// İki soruya cevap verir: "bu sayı nereden geldi" (geçmiş eğrisi) ve "ben
// neredeyim" (dünya sıralaması). Üzerine gelince eğri, tıklayınca sıralama.
//
// Bu dosya YALNIZ ÇİZER. Nüfus izi `economy.popHistory`ten, sıralama
// `hegemony.scoreboard`tan gelir; burada hiçbir sayı hesaplanmaz.
//
// Katman notu: yerleştirme mantığı (ekran kenarına taşmama, kaynağa yakın
// durma) burada tek yerde durur; ileride genel tooltip yöneticisi bunu
// devralabilir.

const HOVER_DELAY = 420;
const GRACE = 200;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const compact = (v) => {
  const n = Math.round(v ?? 0);
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
};

/**
 * Çizgi grafiği. Örnek yoksa çizilmez — uydurma eğri yok.
 * @param {number[]} samples
 */
function chart(samples, { width = 300, height = 96 } = {}) {
  if (!samples || samples.length < 3) {
    return '<p class="mc-empty">No history yet — the first weeks are still being recorded.</p>';
  }
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  const span = Math.max(1e-9, max - min);
  const step = width / Math.max(1, samples.length - 1);
  const y = (v) => height - 6 - ((v - min) / span) * (height - 18);
  const points = samples.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const rising = samples[samples.length - 1] >= samples[0];
  // Alan dolgusu eğrinin altını kapatır: tek çizgi koyu zeminde kayboluyordu.
  const area = `0,${height} ${points.join(' ')} ${width},${height}`;
  return `<svg class="mc-chart ${rising ? 'up' : 'down'}" viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="none" aria-hidden="true">
      <polygon class="mc-area" points="${area}"/>
      <polyline class="mc-line" points="${points.join(' ')}"/>
    </svg>
    <div class="mc-axis"><span>${compact(min)}</span><span>${samples.length} weeks</span><span>${compact(max)}</span></div>`;
}

/** Geçmiş kartı: başlık, şu anki değer, değişim ve eğri. */
function historyCard(title, samples, current, unit) {
  const first = samples?.[0];
  const last = samples?.[samples.length - 1];
  const change = first > 0 && last != null ? (last / first - 1) * 100 : null;
  return `<div class="mc-head">
      <b>${esc(title)}</b>
      <span class="mc-now">${unit}${compact(current)}</span>
    </div>
    ${change == null ? '' : `<div class="mc-change ${change >= 0 ? 'up' : 'down'}">
      ${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}% over the recorded period</div>`}
    ${chart(samples)}
    <p class="mc-hint">Click for the world ranking.</p>`;
}

/** Sıralama kartı: ilk on, oyuncunun satırı vurgulu; dışarıdaysa eklenir. */
function rankCard(title, rows, meId, unit) {
  const top = rows.slice(0, 10);
  if (!top.some((row) => row.id === meId)) {
    const mine = rows.find((row) => row.id === meId);
    if (mine) top.push(mine);
  }
  const body = top.map((row) => `<tr class="${row.id === meId ? 'me' : ''}">
      <td class="mc-rank">${row.rank}</td>
      <td class="mc-name">${esc(row.name)}</td>
      <td class="mc-val">${unit}${compact(row.value)}</td>
    </tr>`).join('');
  return `<div class="mc-head"><b>${esc(title)}</b>
      <span class="mc-now">${rows.length} nations</span></div>
    <table class="mc-table"><tbody>${body}</tbody></table>
    <p class="mc-hint">Click again for the history.</p>`;
}

/**
 * Makro ölçüleri gecikmeli bilgi kartına bağlar.
 *
 * @param {HTMLElement} root  üst çubuktaki `.macro-strip`
 * @param {object} api  `{ series(metric), ranking(metric), playerId }`
 */
export function bindMacroCards(root, api) {
  if (!root) return;
  let card = document.getElementById('macro-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'macro-card';
    card.className = 'macro-card hidden';
    document.body.appendChild(card);
  }
  let openTimer = null;
  let closeTimer = null;
  let source = null;
  let mode = 'history';

  const hide = () => {
    card.classList.add('hidden');
    source = null;
    mode = 'history';
  };
  const cancelOpen = () => { clearTimeout(openTimer); openTimer = null; };
  const cancelClose = () => { clearTimeout(closeTimer); closeTimer = null; };

  /** Kaynağın ÜSTÜNDE açılır; ekranın sağına taşarsa sola yaslanır. */
  const place = (element) => {
    const anchor = element.getBoundingClientRect();
    card.classList.remove('hidden');
    const box = card.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
    // Üst çubuğun altına açılır; yer yoksa üstüne çıkar.
    let top = anchor.bottom + 6;
    if (top + box.height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - box.height - 6);
    }
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  };

  const draw = (element) => {
    const metric = element.dataset.macro;
    const label = metric === 'population' ? 'Population' : 'Gross domestic product';
    const unit = metric === 'gdp' ? '¤' : '';
    if (mode === 'rank') {
      const rows = api.ranking(metric);
      card.innerHTML = rankCard(`${label} — world ranking`, rows, api.playerId(), unit);
    } else {
      const series = api.series(metric);
      card.innerHTML = historyCard(label, series.samples, series.current, unit);
    }
    place(element);
  };

  root.addEventListener('pointerover', (event) => {
    const element = event.target.closest('[data-macro]');
    if (!element || element === source) return;
    cancelClose();
    cancelOpen();
    source = element;
    mode = 'history';
    // GECIKME: anlik acilan kart, cubuk boyunca gezerken yanip soner.
    openTimer = setTimeout(() => draw(element), HOVER_DELAY);
  });

  root.addEventListener('pointerout', (event) => {
    const element = event.target.closest('[data-macro]');
    if (!element) return;
    if (card.contains(event.relatedTarget)) return;
    cancelOpen();
    cancelClose();
    // Kaynakla kart arasinda gezerken kapanmasin diye kisa bir muhlet.
    closeTimer = setTimeout(hide, GRACE);
  });

  card.addEventListener('pointerenter', cancelClose);
  card.addEventListener('pointerleave', () => {
    cancelClose();
    closeTimer = setTimeout(hide, GRACE);
  });

  root.addEventListener('click', (event) => {
    const element = event.target.closest('[data-macro]');
    if (!element) return;
    cancelOpen();
    cancelClose();
    source = element;
    mode = mode === 'rank' ? 'history' : 'rank';
    draw(element);
  });

  // Ekran kapanirken artik kart kalmasin; zamanlayici da temizlenir.
  return { hide: () => { cancelOpen(); cancelClose(); hide(); } };
}
