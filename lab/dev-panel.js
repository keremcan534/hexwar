// Geliştirici paneli — deniz ve kara ayarları. Oyunda GİZLİ başlar.
//
// Açmak: `b`, `"` tuşu (Türkçe klavyede 1'in solu, `Backquote`) ya da konsola
// `dev` yazmak. Oyun çıkana kadar böyle kalacak; oyuncuya görünen bir ayar
// ekranı değil, tasarım tezgâhı.
//
// Kaydıraç tabloları laboratuvardakiyle aynı sırada ve aynı adlarla durur ki
// laboratuvarda bulunan bir ayar ("Ayarı kopyala") oyunda da aynı yere düşsün.

import { ONAYARLAR } from './ocean.js';
import { EK_VARSAYILAN } from './deniz.js';

// Kaydıraçlar GRUPLANIR: hepsi tek listede olunca hiçbiri bulunamıyordu.
export const GRUPLAR = [
  ['Dalga', [
    ['amp', 'Yükseklik', 0, 4, 0.05],
    ['chop', 'Sivrilik (chop)', 0, 1.2, 0.01],
    ['hiz', 'Hız', 0, 3, 0.01],
    ['ruzgar', 'Rüzgâr yönü', 0, 360, 1],
    ['yayilma', 'Yönsel yayılma', 0, 2.5, 0.01],
    ['esinti', 'Esinti (hamle)', 0, 1, 0.01],
  ]],
  ['Dünyanın şekli', [
    ['kiyiKirilma', 'Kıyı kırılması', 0, 3, 0.02],
    ['kiyiMenzil', 'Kırılma menzili (hex)', 1, 16, 0.5],
    ['girdap', 'Akıntı girdapları', 0, 2, 0.02],
  ]],
  ['Su sütunu', [
    ['kirilma', 'Kırılma (altı görme)', 0, 4, 0.02],
    ['sogurma', 'Soğurma (bulanıklık)', 0, 2, 0.02],
    ['seviye', 'Derinlik ölçeği (hex)', 1, 14, 0.5],
    ['kostik', 'Kostik (ışık ağı)', 0, 2, 0.02],
    ['kostikOlcek', 'Kostik ölçeği', 0.3, 5, 0.05],
  ]],
  ['Işık', [
    ['parilti', 'Güneş parıltısı', 0, 3, 0.02],
    ['pariltiGenis', 'Parıltı genişliği', 0, 1, 0.01],
    ['yansima', 'Gök yansıması', 0, 1, 0.01],
    ['gunesY', 'Güneş yüksekliği', 0.02, 0.95, 0.01],
    ['gunesAci', 'Güneş azimutu', 0, 360, 1],
    ['sssG', 'Altyüzey ışıması', 0, 2, 0.01],
  ]],
  ['Köpük ve yüzey', [
    ['faset', 'Faset (durgun su üçgenleri)', 0, 2, 0.01],
    ['fasetOlcek', 'Faset boyu (dünya birimi)', 2, 40, 0.5],
    ['foamAmt', 'Köpük miktarı', 0, 1.5, 0.01],
    ['kopukEsik', 'Köpük eşiği', 0.2, 1.2, 0.01],
    ['kopukOmur', 'Köpük ömrü (iz)', 0, 1, 0.01],
    ['detay', 'Yüzey detayı', 0, 1.5, 0.01],
  ]],
  ['Kara', [
    ['karaDoku', 'Arazi dokusu', 0, 1.5, 0.01],
    ['karaKaya', 'Eğimden kaya', 0, 1.5, 0.01],
    ['karaKar', 'Kar seviyesi', 0.8, 1, 0.002],
    ['karaGolge', 'Dağ gölgesi', 0, 1, 0.01],
    ['karaAO', 'Çukur karanlığı', 0, 1.5, 0.01],
    ['karaKabartma', 'Eğim duyarlılığı', 0.2, 3, 0.02],
    ['karaYukOlcek', 'Yükseklik ölçeği', 200, 3000, 25],
    ['plajGen', 'Plaj genişliği (hex)', 0, 2, 0.02],
    ['plajGuc', 'Plaj gücü', 0, 1, 0.01],
    ['falezGuc', 'Falez gücü', 0, 1, 0.01],
  ]],
  ['Ülke rengi (HOI4)', [
    ['sinirGen', 'Sınır bandı (hex)', 0.3, 6, 0.1],
    ['cekirdek', 'Çekirdek hat (piksel)', 0, 4, 0.1],
    ['cekirdekGuc', 'Çekirdek gücü', 0, 1, 0.01],
    ['bantKalin', 'Ülke bandı (piksel)', 0, 16, 0.5],
    ['bantGuc', 'Bant gücü', 0, 1, 0.01],
    ['bantDoygun', 'Bant doygunluğu', 0, 1.5, 0.01],
    ['bantIsik', 'Bant parlaklığı', 0, 0.6, 0.01],
    ['tavan', 'Parlaklık tavanı', 0.3, 1, 0.01],
    ['icKarart', 'İç karartma', 0.6, 1, 0.01],
    ['kontrast', 'Kontrast', 0, 0.8, 0.01],
    ['karartmaTaban', 'Karartma tabanı', 0.3, 1, 0.01],
    ['icOpaklik', 'İçeride ülke rengi', 0, 1, 0.01],
    ['canlilik', 'Renk canlılığı', 0, 1.2, 0.01],
    ['hexYumusat', 'Hex kademesini erit', 0, 1, 0.01],
  ]],
  ['Fırtına ve canlılar', [
    ['kasirgaGuc', 'Kasırga gücü', 0, 1, 0.01],
    ['kasirgaYaricap', 'Kasırga yarıçapı (hex)', 4, 60, 1],
    ['kusYogunluk', 'Kuş yoğunluğu', 0, 1, 0.01],
    ['kusBoyut', 'Kuş boyu (piksel)', 2, 18, 0.5],
    ['kusYukseklik', 'Kuş yüksekliği (piksel)', 0, 30, 0.5],
    ['kusHiz', 'Kuş hızı', 0, 3, 0.02],
  ]],
];

// MAKROLAR — bir kaydıraç, birlikte hareket etmesi gereken beş ayar.
export const MAKROLAR = [
  ['ruzgarSiddeti', 'Rüzgâr şiddeti', (v) => ({
    amp: 0.15 + 2.6 * v * v, chop: 0.25 + 0.75 * v, foamAmt: 0.08 + 1.0 * v,
    yayilma: 0.5 + 1.3 * v, esinti: 0.1 + 0.6 * v, kopukEsik: 0.95 - 0.45 * v,
  })],
  ['berraklik', 'Berraklık (suyun altı)', (v) => ({
    kirilma: 0.2 + 2.4 * v, sogurma: 1.4 - 1.25 * v, kostik: 0.05 + 0.95 * v, seviye: 3.0 + 5.0 * v,
  })],
  ['isikSiddeti', 'Işık', (v) => ({
    parilti: 0.2 + 2.0 * v, yansima: 0.15 + 0.8 * v, sssG: 0.15 + 1.1 * v, pariltiGenis: 0.5 - 0.42 * v,
  })],
  ['kiyiEtkisi', 'Kıyının etkisi', (v) => ({
    kiyiKirilma: 0.3 + 2.4 * v, kiyiMenzil: 3.0 + 9.0 * v, girdap: 0.1 + 1.2 * v,
  })],
];

const STIL = `
#dev-deniz { position: fixed; top: 64px; left: 10px; z-index: 9000; width: 250px;
  max-height: calc(100vh - 84px); overflow-y: auto; box-sizing: border-box;
  background: rgba(8, 18, 24, 0.92); border: 1px solid rgba(150, 190, 200, 0.22);
  border-radius: 6px; padding: 8px 11px 11px; color: #cfe0e4;
  font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
  scrollbar-width: thin; scrollbar-color: rgba(150, 190, 200, 0.3) transparent; }
#dev-deniz .dd-bas { display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8fb3bd; }
#dev-deniz .dd-bas button { background: none; border: 0; color: #9fbcc4; cursor: pointer; font-size: 14px; }
#dev-deniz .dd-onay { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
#dev-deniz button.dd-b { flex: 1; min-width: 62px; padding: 5px 3px; font: inherit; font-size: 11px;
  cursor: pointer; background: rgba(30, 58, 70, 0.7); color: #cfe0e4; border-radius: 4px;
  border: 1px solid rgba(150, 190, 200, 0.22); }
#dev-deniz button.dd-b.aktif { background: #2b6d80; border-color: #7fc4d4; color: #fff; }
#dev-deniz details { border-top: 1px solid rgba(150, 190, 200, 0.14); margin-top: 6px; }
#dev-deniz summary { cursor: pointer; font-size: 11px; letter-spacing: 0.06em; padding: 5px 0 2px;
  color: #7fb0bd; text-transform: uppercase; user-select: none; list-style: none; }
#dev-deniz summary::before { content: '▸ '; }
#dev-deniz details[open] > summary::before { content: '▾ '; }
#dev-deniz label { display: block; margin: 5px 0 1px; font-size: 11px; color: #9fbcc4; }
#dev-deniz label span { float: right; color: #dff0f4; font-variant-numeric: tabular-nums; }
#dev-deniz input[type=range] { width: 100%; margin: 0; accent-color: #62b6c9; height: 14px; }
#dev-deniz .dd-not { font-size: 10px; color: rgba(200, 225, 232, 0.45); margin-top: 8px; line-height: 1.45; }
`;

/**
 * Paneli kurar ve GİZLİ bırakır.
 *
 * @param api       denizKur'un döndürdüğü nesne
 * @param kaydet    her değişiklikten sonra çağrılır (entegre.js saklar)
 */
export function panelKur(api, { kaydet = () => {} } = {}) {
  const { P } = api;
  const stil = document.createElement('style');
  stil.textContent = STIL;
  document.head.append(stil);

  const kok = document.createElement('div');
  kok.id = 'dev-deniz';
  kok.hidden = true;
  kok.innerHTML = '<div class="dd-bas"><span>Deniz · geliştirici</span>'
    + '<button type="button" title="Kapat (b ya da &quot; tuşu)">✕</button></div>'
    + '<div class="dd-onay"></div><div class="dd-gruplar"></div>';
  document.body.append(kok);
  kok.querySelector('.dd-bas button').onclick = () => ac(false);

  const girdiler = {};
  const degisti = () => { api.uygula(); kaydet(); };

  // Önayar düğmeleri
  const onayEl = kok.querySelector('.dd-onay');
  for (const [anahtar, o] of Object.entries(ONAYARLAR)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dd-b';
    b.textContent = o.ad;
    b.dataset.k = anahtar;
    b.onclick = () => { api.onayarSec(anahtar); yenile(); kaydet(); };
    onayEl.append(b);
  }

  // Makrolar
  const gruplarEl = kok.querySelector('.dd-gruplar');
  const makroDeger = { ruzgarSiddeti: 0.35, berraklik: 0.5, isikSiddeti: 0.4, kiyiEtkisi: 0.45 };
  for (const [ad, etiket, kural] of MAKROLAR) {
    const l = document.createElement('label');
    l.innerHTML = '<b>' + etiket + '</b><span></span>';
    const i = document.createElement('input');
    i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.01; i.value = makroDeger[ad];
    const yaz = () => { l.querySelector('span').textContent = makroDeger[ad].toFixed(2); };
    i.oninput = () => {
      makroDeger[ad] = parseFloat(i.value);
      Object.assign(P, kural(makroDeger[ad]));
      yaz();
      for (const g of Object.values(girdiler)) g.yaz(true);
      degisti();
    };
    yaz();
    gruplarEl.append(l, i);
  }

  // Gruplar
  GRUPLAR.forEach(([baslik, satirlar], gi) => {
    const d = document.createElement('details');
    if (gi === 0) d.open = true;
    const sum = document.createElement('summary');
    sum.textContent = baslik;
    d.append(sum);
    for (const [ad, etiket, min, max, adim] of satirlar) {
      const l = document.createElement('label');
      l.innerHTML = etiket + '<span></span>';
      const i = document.createElement('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = adim; i.value = P[ad];
      const yaz = (degerDe) => {
        if (degerDe) i.value = P[ad];
        l.querySelector('span').textContent = (+P[ad]).toFixed(adim < 1 ? 2 : 0);
      };
      i.oninput = () => { P[ad] = parseFloat(i.value); yaz(false); degisti(); };
      yaz(false);
      d.append(l, i);
      girdiler[ad] = { yaz };
    }
    gruplarEl.append(d);
  });

  // Sınır çekirdeğinin rengi kaydıraçla seçilemez.
  if (api.kara.U.uCizgiRenk) {
    const l = document.createElement('label');
    l.textContent = 'Sınır çekirdeği rengi';
    l.style.marginTop = '8px';
    const k = document.createElement('input');
    k.type = 'color';
    k.value = '#' + api.kara.U.uCizgiRenk.value.getHexString();
    k.style.cssText = 'width:100%;height:22px;padding:0;border:1px solid rgba(150,190,200,0.22);'
      + 'border-radius:4px;background:transparent;cursor:pointer;';
    k.oninput = () => { api.kara.U.uCizgiRenk.value.set(k.value); P.__cizgiRenk = k.value; kaydet(); };
    kok.append(l, k);
  }

  const dugme = (metin, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dd-b'; b.textContent = metin;
    b.style.cssText = 'width:100%;margin-top:6px;';
    b.onclick = fn;
    kok.append(b);
    return b;
  };
  // Bulunan ayarı kaybetmemek için: JSON doğrudan önayara dönüşebilir.
  const kopya = dugme('Ayarı kopyala', () => {
    const cikti = {};
    for (const [, satirlar] of GRUPLAR) for (const [ad] of satirlar) cikti[ad] = +(+P[ad]).toFixed(3);
    const metin = JSON.stringify(cikti, null, 2);
    if (navigator.clipboard) navigator.clipboard.writeText(metin).catch(() => {});
    console.log('AYAR:', metin);
    kopya.textContent = 'kopyalandı ✓';
    setTimeout(() => { kopya.textContent = 'Ayarı kopyala'; }, 1400);
  });
  dugme('Varsayılana dön', () => {
    api.onayarSec('kerem');
    Object.assign(P, EK_VARSAYILAN);
    delete P.__cizgiRenk;
    api.uygula();
    yenile();
    kaydet(true);
  });

  const not = document.createElement('div');
  not.className = 'dd-not';
  not.innerHTML = 'Aç/kapa: <b>b</b>, <b>"</b> ya da konsolda <b>dev</b>. '
    + 'Panel açıkken: <b>1-6</b> önayar · <b>k</b> kasırgayı buraya · '
    + '<b>l</b> kara katmanı · <b>o</b> yeni deniz aç/kapa. Ayarlar tarayıcıda saklanır.';
  kok.append(not);

  function yenile() {
    for (const g of Object.values(girdiler)) g.yaz(true);
    for (const b of onayEl.children) b.classList.toggle('aktif', b.dataset.k === api.onayar);
  }
  function ac(v) { kok.hidden = !v; if (v) yenile(); }

  yenile();
  return { ac, acikMi: () => !kok.hidden, yenile, kok };
}
