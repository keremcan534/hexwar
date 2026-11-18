// Denizi OYUNA bağlar.
//
// index.html'de main.js'ten SONRA yüklenir; modüller sırayla çalıştığı için
// bu dosya çalıştığında `window.game` hazırdır. Üç yol var:
//
//   yeni    FFT okyanusu (src/render/ocean). Varsayılan.
//   eski    three.js Gerstner denizi (lab/deniz.js). `?deniz=eski` ya da donanım
//           kayan nokta hedefi vermiyorsa. Yeni yolun yedeği budur.
//   kapalı  `?deniz=0`: hiçbir şey kurulmaz, oyun kendi Canvas2D/GL denizini çizer.
//           WebGL2 hiç yoksa da oyun buraya kendiliğinden düşer.
//
// Üç sözleşme:
//   1. Kendi kare döngüsü YOK (CLAUDE.md). Katman oyunun karesinden hemen sonra
//      çizilir; su animasyonu oyunun kısılmış su zamanlayıcısıyla akar.
//   2. Açılışı YAVAŞLATMAZ. Kıyı alanı menü perdesi arkasında dilim dilim
//      ısıtılıyor (main.js); burada zorla bitirilmez, hazır olması beklenir.
//   3. Sahiplik değişimi TEK BOĞAZDAN yakalanır: oyun siyasi renkleri
//      tazelediğinde her zaman waterGL.updateOwners'tan geçer. Kara oyunun
//      kendi çizimi olduğu için orada yapılacak tek iş arka dokuyu tazelemek.

const ANAHTAR = 'hexwar.dev.deniz.v1';
const yol = window.__denizYolu ?? 'eski';

if (yol === 'yeni') {
  yeniDeniz().catch((e) => {
    console.error('[okyanus] kurulamadı, eski deniz devrede:', e);
    baslat().catch((e2) => console.error('[deniz] kurulamadı:', e2));
  });
} else if (yol === 'eski') {
  baslat().catch((e) => console.error('[deniz] kurulamadı:', e));
}

function bekle(kosul, azamiMs = 60000) {
  return new Promise((coz, red) => {
    const t0 = performance.now();
    const dene = () => {
      if (kosul()) return coz();
      if (performance.now() - t0 > azamiMs) return red(new Error('zaman aşımı'));
      setTimeout(dene, 150);
    };
    dene();
  });
}

function oku() {
  try { return JSON.parse(localStorage.getItem(ANAHTAR) || 'null'); } catch { return null; }
}

/** Yeni okyanus: oyunun karesine bağlanır, Settings kalitesini izler. */
async function yeniDeniz() {
  const game = window.game;
  if (!game || !game.renderer) return;
  const { okyanusKur } = await import('../src/render/ocean/oceanApi.js');
  await bekle(() => game.world && game.renderer.material?.cache?.toLand);
  const api = okyanusKur(game);
  const asilKare = game.frame;
  game.frame = (ts = performance.now()) => {
    asilKare(ts);
    api.ciz(ts);
  };
  game.on('world', () => game.requestRender());
  addEventListener('resize', () => { api.boyutla(); game.requestRender(); });
  window.deniz = api;
  game.requestRender();
}

async function baslat() {
  const game = window.game;
  if (!game || !game.renderer) return;

  const THREE = await import('../vendor/three/three.module.min.js');
  const { denizKur, alanHazir } = await import('./deniz.js');
  const { panelKur } = await import('./dev-panel.js');

  await bekle(() => game.world && alanHazir(game));

  const kayitli = oku();
  const api = denizKur(THREE, game, { onayar: 'kerem', kayitli });

  // ---------------------------------------------------------------- kare
  // Oyunun karesine bağlan: önce oyun çizer, hemen ardından deniz.
  // Böylece arka doku her zaman AYNI karenin çizimidir.
  const asilKare = game.frame;
  game.frame = (ts = performance.now()) => {
    asilKare(ts);
    api.ciz(ts);
  };

  // ------------------------------------------------------------ yenileme
  // Siyasi renkler değişti: oyun #map-water'ı yeni renkle çizer, arka doku da
  // tazelenmeli — kırılan su kıyıda karanın pikselini de örnekliyor.
  const wgl = game.renderer.waterGL;
  if (wgl && wgl.updateOwners) {
    const asil = wgl.updateOwners.bind(wgl);
    wgl.updateOwners = (veri) => { asil(veri); api.tazeleIste(2); };
  }
  game.on('world', () => {
    bekle(() => alanHazir(game)).then(() => { api.dunyaYenile(); game.requestRender(); });
  });
  // Haritanın İÇERİĞİ değişince (birim, seçim, tur) arka doku tazelensin.
  // Her su tikinde değil: o zaman her kare tam ekran kopya ödenir.
  for (const ev of ['select', 'selection', 'units', 'turn', 'command', 'battles', 'construction', 'provinces']) {
    game.on(ev, () => api.tazeleIste(2));
  }
  addEventListener('resize', () => { api.boyutla(); game.requestRender(); });

  // ------------------------------------------------------------ panel
  let kayitZaman = 0;
  const kaydet = (hemen) => {
    clearTimeout(kayitZaman);
    const yaz = () => {
      try {
        localStorage.setItem(ANAHTAR, JSON.stringify({ ...api.P, __onayar: api.onayar }));
      } catch { /* depolama kapalıysa sessiz geç: ayar yalnız bu oturumda yaşar */ }
    };
    if (hemen === true) yaz(); else kayitZaman = setTimeout(yaz, 300);
    game.requestRender();
  };
  const panel = panelKur(api, { kaydet });

  const acKapa = () => { panel.ac(!panel.acikMi()); return panel.acikMi(); };

  // Aç/kapa iki yoldan: `"` (Türkçe klavyede 1'in solundaki tuş,
  // KeyboardEvent.code 'Backquote') ve konsolda `dev`. `b` eskiden üçüncü
  // yoldu; oyun onu hızlı inşaya bağladı (2026-10-08), o yüzden silindi.
  // Laboratuvar tuşları (1-6, k, o) yalnız panel AÇIKKEN çalışır: oyunda
  // harf tuşları er geç bir göreve bağlanır ve tasarım tezgâhı oyunu ele
  // geçirmemeli.
  addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    // `"` değiştirici denetiminden ÖNCE: bazı düzenlerde AltGr ile yazılır ve
    // Windows'ta AltGr, Ctrl+Alt olarak gelir.
    if (e.code === 'Backquote' || e.key === '"') {
      e.preventDefault();
      acKapa();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (!panel.acikMi()) return;
    const onayarlar = ['master', 'sot', 'gercek', 'durgun', 'kerem', 'kerem2'];
    const n = '123456'.indexOf(e.key);
    if (n >= 0) { api.onayarSec(onayarlar[n]); panel.yenile(); kaydet(); return; }
    if (e.key === 'k') { api.kasirgaBuraya(); panel.yenile(); kaydet(); }
    if (e.key === 'o') api.goster(!api.gorunur);
  });

  // Konsola `dev` yazmak paneli aç/kapar. Getter, çünkü kullanıcı parantezsiz
  // yazıyor; bir fonksiyon olsaydı `dev()` gerekirdi.
  Object.defineProperty(window, 'dev', {
    configurable: true,
    get() { return acKapa() ? 'Deniz geliştirici paneli AÇIK' : 'Deniz geliştirici paneli kapalı'; },
  });

  window.deniz = api;           // hata ayıklama için
  game.requestRender();
}
