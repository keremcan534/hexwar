// Fabrika kartı: saf veriden HTML üretir.
//
// Kart bir kez burada tanımlanır, ekran onu veriyle çağırır. Oyun nesnesi
// buraya girmez — screens.js oyun verisini aşağıdaki sözleşmeye çevirir,
// böylece kart hem "inşa et" seçicisinde hem ileride başka listelerde aynı
// kodla kullanılabilir ve görsel değişiklik tek dosyada kalır.
//
// Veri sözleşmesi (factoryOptionCard):
//   typeId    tesis tür kimliği (FACTORIES anahtarı)
//   name      görünen ad
//   cost      altın maliyeti (sayı)
//   inputs    [{ id, name, amount }]  — boşsa "girdisiz" tesis
//   outputs   [{ id, name, amount }]
//   perLevel  seviye başına haftalık kâr tahmini (sayı)
//   blocked   '' ya da neden metni; doluysa kart devre dışı çizilir
//   region    data-region değeri (inşa hedefi)

import { factoryEmblem, resourceArtRinged, resourceGlyph } from './icons/index.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Miktar etiketi: 1 yazılmaz (gürültü), kesirler kısa yazılır. */
function amountLabel(amount) {
  if (amount === 1) return '';
  return Number.isInteger(amount) ? String(amount) : String(amount).replace('0.', '.');
}

function ioItem({ id, name, amount }) {
  return `<span class="fcard-res" title="${esc(name)}${amount !== 1 ? ` × ${amount}` : ''}">
    ${resourceGlyph(id)}${amountLabel(amount) ? `<em>${amountLabel(amount)}</em>` : ''}
  </span>`;
}

/**
 * "İnşa et" seçicisindeki tesis kartı. Dönen kök eleman <button>tır ki
 * mevcut [data-factory] bağlayıcısı ve klavye erişimi aynen çalışsın.
 */
export function factoryOptionCard(data) {
  const {
    typeId, name, cost, inputs = [], outputs = [],
    perLevel = 0, blocked = '', region = '',
  } = data;
  const gain = perLevel >= 0;
  // Halkasını sanatın içinde taşıyan madalyonda (paket 1) CSS halkası kalkar,
  // yoksa çift çerçeve görünür; halkasız nesne (paket 2) ve vektör glif CSS
  // pirinç halkasının içine oturur.
  const outputId = outputs[0]?.id ?? null;
  const painted = outputId && resourceArtRinged(outputId);
  return `<button class="fcard${blocked ? ' blocked' : ''}" data-factory="${esc(typeId)}"
    data-region="${esc(region)}" ${blocked ? 'disabled' : ''}
    title="${esc(blocked || `${name} — ¤${Math.round(cost)}`)}">
    <span class="fcard-wash" aria-hidden="true">${factoryEmblem(typeId, outputId)}</span>
    <span class="fcard-emblem${painted ? ' painted' : ''}">${factoryEmblem(typeId, outputId)}</span>
    <span class="fcard-body">
      <span class="fcard-head">
        <b class="fcard-name">${esc(name)}</b>
        <span class="fcard-cost">${Math.round(cost)}<i class="fcard-coin"></i></span>
      </span>
      <span class="fcard-io">
        ${inputs.length ? inputs.map(ioItem).join('') : '<span class="fcard-noin">no inputs</span>'}
      </span>
      <span class="fcard-foot">
        <span class="fcard-out">${outputs.map(ioItem).join('')}
          <em>${outputs.map((o) => esc(o.name)).join(' · ')}</em></span>
        <span class="fcard-profit ${gain ? 'res-pos' : 'res-neg'}">${gain ? '+' : ''}${perLevel.toFixed(1)}/level</span>
      </span>
      ${blocked ? `<span class="fcard-blocked">${esc(blocked)}</span>` : ''}
    </span>
  </button>`;
}
