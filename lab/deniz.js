// Yeni deniz + kara — oyuna bağlanan ÇEKİRDEK.
//
// Laboratuvarın (sulab-oyun.html) kurulum kodu, ama iki şey olmadan:
//   · DOM paneli yok — o `dev-panel.js`'te, çünkü oyunda panel gizli durur.
//   · Kendi kare döngüsü yok — CLAUDE.md oyunda sürekli rAF döngüsünü
//     yasaklıyor. `ciz()` oyunun kendi karesinden çağrılır (bkz. entegre.js);
//     su animasyonu oyunun zaten kısılmış su zamanlayıcısıyla (12-25 kare/sn)
//     akar.
//
// Dünyaya bağlı dokular (kıyı alanı, yükseklik, arazi, sahiplik) YENİ DÜNYADA
// ve SAHİPLİK DEĞİŞİNCE yeniden kurulur; ikisi ayrı ömürdür. Sahipliği her tur
// tazelemek sınır alanının raster chamfer'ını boşuna koşturmak olurdu.

import {
  ONAYARLAR, dalgaDizisi, gurultuDokusu, suVertex, kirilmaFragment, gunesYonu,
} from './ocean.js';
import { kusKatmani } from './kuslar.js';
import {
  karaKatmani, tipDokusu, yukseklikDokusu, denizUzakligiDokusu,
  sinirAlaniDokusu, araziRenkDokusu, sahipDokusu, ulkeOrtalamaDokusu,
} from './kara.js';
import { HEX_SIZE } from '../src/world/worldgen.js';

const HEX_STEP = Math.sqrt(3) * HEX_SIZE;
const DIST_MAX = HEX_STEP * 9;         // surfaceGL ile AYNI ölçek

/**
 * Önayarların TAŞIMADIĞI alanlar: kara, sınır, kasırga, kuş. Önayar değişince
 * sıfırlanmazlar — bunlar su malzemesi değil, sahnenin geri kalanı.
 * Değerler laboratuvarda ölçülüp kalibre edilmiş hâlleridir.
 */
export const EK_VARSAYILAN = {
  kasirgaGuc: 0, kasirgaYaricap: 22,
  karaDoku: 0.22, karaKaya: 0.45, karaKar: 0.96, karaGolge: 0.42,
  karaAO: 0.35, karaKabartma: 1.0, karaYukOlcek: 1400,
  plajGen: 0.55, plajGuc: 0.45, falezGuc: 0.5,
  sinirGen: 6.0, icOpaklik: 0.85, canlilik: 0.0, hexYumusat: 0.6,
  kenarKalin: 0.42, kenarGuc: 0.0, hatGuc: 0.0, kontrast: 0.35,
  cekirdek: 0.8, cekirdekGuc: 0.35, bantKalin: 7.0, bantGuc: 1.0,
  bantDoygun: 0.55, bantIsik: 0.22, karartmaTaban: 0.72,
  tavan: 0.62, icKarart: 0.94,
  kusYogunluk: 0.55, kusBoyut: 9, kusYukseklik: 10, kusHiz: 1,
};
export const EKSTRA = Object.keys(EK_VARSAYILAN);

/** Kaydıraçla sürülen su skalerleri: uniform adı -> P alanı. */
const SKALER = {
  uChop: 'chop', uHiz: 'hiz', uEsinti: 'esinti',
  uKiyiKirilma: 'kiyiKirilma', uKiyiMenzil: 'kiyiMenzil', uGirdap: 'girdap',
  uKirilma: 'kirilma', uSogurma: 'sogurma', uKostik: 'kostik',
  uKostikOlcek: 'kostikOlcek', uSeviye: 'seviye',
  uKopukMik: 'foamAmt', uKopukEsik: 'kopukEsik', uKopukOmur: 'kopukOmur',
  uParilti: 'parilti', uPariltiGenis: 'pariltiGenis', uSSS: 'sssG',
  uDetay: 'detay', uYansima: 'yansima', uKabartma: 'kabartma', uRampa: 'rampa',
  uFaset: 'faset', uFasetOlcek: 'fasetOlcek',
};

/** Kara uniformu -> P alanı. uygula() tek döngüyle bağlar. */
const KARA_SKALER = {
  uDokuGuc: 'karaDoku', uKayaGuc: 'karaKaya', uKarSeviye: 'karaKar',
  uGolgeGuc: 'karaGolge', uAO: 'karaAO', uKabartmaK: 'karaKabartma',
  uYukOlcek: 'karaYukOlcek', uPlajGen: 'plajGen', uPlajGuc: 'plajGuc',
  uFalezGuc: 'falezGuc', uSinirGen: 'sinirGen', uIcOpaklik: 'icOpaklik',
  uCanlilik: 'canlilik', uHexYumusat: 'hexYumusat', uKenarKalin: 'kenarKalin',
  uKenarGuc: 'kenarGuc', uHatGuc: 'hatGuc', uKontrast: 'kontrast',
  uTavan: 'tavan', uIcKarart: 'icKarart', uCekirdek: 'cekirdek',
  uCekirdekGuc: 'cekirdekGuc', uBantKalin: 'bantKalin', uBantGuc: 'bantGuc',
  uBantDoygun: 'bantDoygun', uBantIsik: 'bantIsik', uKarartmaTaban: 'karartmaTaban',
};

/** Kıyı alanı hazır mı? Isıtma dilimli; hazır olmadan kurulum anlamsız. */
export function alanHazir(game) {
  const c = game.renderer?.material?.cache;
  return !!(c && c.toLand && c.surface && c.world === game.world);
}

function kiyiDokusu(THREE, alan) {
  const veri = new Uint8Array(alan.w * alan.h);
  for (let i = 0; i < veri.length; i++) {
    veri[i] = Math.min(255, Math.round((alan.toLand[i] / DIST_MAX) * 255));
  }
  const t = new THREE.DataTexture(veri, alan.w, alan.h, THREE.RedFormat);
  t.wrapS = THREE.RepeatWrapping;        // doğu-batı sarmalı
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Denizi ve karayı oyuna kurar. `alanHazir(game)` true dönmeden çağrılmamalı.
 *
 * @returns API — P (ayar), uygula(), onayarSec(), ciz(ts), boyutla(),
 *   dunyaYenile(), sahiplikYenile(), tazeleIste(), goster(v), kara, kus, U.
 */
export function denizKur(THREE, game, { onayar = 'kerem', kayitli = null } = {}) {
  const r = game.renderer;
  const cam = game.camera;
  THREE.ColorManagement.enabled = false;     // master paleti birebir çıksın

  // Tuval #map-water'ın hemen ARKASINA, aynı z-index ile: aynı katmandaki
  // öğeler DOM sırasıyla dizilir, yani suyun üstünde ve haritanın (#map, z1)
  // altında kalır. index.html'e tuval eklemeye gerek yok.
  let canvas = document.getElementById('map-kirilma');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'map-kirilma';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;'
      + 'z-index:0;pointer-events:none;';
    document.getElementById('map-water').after(canvas);
  }
  const gl = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  gl.outputColorSpace = THREE.LinearSRGBColorSpace;
  gl.setClearAlpha(0);
  const sahne = new THREE.Scene();
  const kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 12000);
  kamera.up.set(0, 0, -1);   // dünya +y ekranda AŞAĞI

  const P = { ...ONAYARLAR[onayar], ...EK_VARSAYILAN, ...(kayitli || {}) };
  let aktifOnayar = (kayitli && kayitli.__onayar) || onayar;
  delete P.__onayar;

  // Arka doku: OYUNUN kendi karesi. Suyun altında görünen şey uydurma bir
  // taban değil, haritanın gerçek pikselidir.
  const arkaTex = new THREE.CanvasTexture(document.getElementById('map-water'));
  arkaTex.minFilter = arkaTex.magFilter = THREE.LinearFilter;
  arkaTex.wrapS = arkaTex.wrapT = THREE.ClampToEdgeWrapping;
  arkaTex.generateMipmaps = false;

  const alan0 = r.material.cache;
  const ilk = dalgaDizisi(THREE, P);
  const U = {
    uTime: { value: 0 },
    uDalga: { value: ilk.arr },
    uOrigin: { value: new THREE.Vector2() },
    uSpan: { value: new THREE.Vector2() },
    uEkranSpan: { value: new THREE.Vector2() },
    uCozunurluk: { value: new THREE.Vector2() },
    uKamera: { value: new THREE.Vector3() },
    uAlan: { value: new THREE.Vector4(alan0.x0, alan0.y0, alan0.width, alan0.height) },
    uDist: { value: kiyiDokusu(THREE, alan0) },
    uArka: { value: arkaTex },
    uGurultu: { value: gurultuDokusu(THREE) },
    uDistMax: { value: DIST_MAX },
    uOlcek: { value: 1 },
    uKasirga: { value: new THREE.Vector4(0, 0, 900, 0) },
    uHex: { value: HEX_STEP },
    uTepeMax: { value: ilk.toplam },
    uDerin: { value: new THREE.Color(P.deep) },
    uOkyanus: { value: new THREE.Color(P.ocean) },
    uKiyi: { value: new THREE.Color(P.coast) },
    uKopukCol: { value: new THREE.Color(P.foam) },
    uSSSCol: { value: new THREE.Color(P.sss) },
    uUfuk: { value: new THREE.Color(P.ufuk) },
    uZenit: { value: new THREE.Color(P.zenit) },
    uGunesCol: { value: new THREE.Color(P.gunes) },
    uGunesDir: { value: gunesYonu(THREE, P) },
  };
  for (const [u, alanAdi] of Object.entries(SKALER)) U[u] = { value: P[alanAdi] };

  // Deniz mesh'i: birim kare, her karede kameranın altına ölçeklenir.
  const geo = new THREE.PlaneGeometry(1, 1, 512, 512);
  geo.rotateX(-Math.PI / 2);
  const deniz = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: U, vertexShader: suVertex({ yama: true }), fragmentShader: kirilmaFragment(),
    transparent: true, depthWrite: false, depthTest: false,
  }));
  deniz.frustumCulled = false;
  sahne.add(deniz);

  const kus = kusKatmani(THREE, {
    uDist: U.uDist, uAlan: U.uAlan, uDistMax: U.uDistMax, uHex: U.uHex, sayi: 900,
  });
  kus.mesh.renderOrder = 10;
  sahne.add(kus.mesh);

  // Sahipliğe bağlı dokular — ayrı ömür, ayrı kurulum.
  const sahiplikDokulari = () => {
    const a = sinirAlaniDokusu(THREE, game.world, r.material.cache, HEX_SIZE);
    return {
      sinirTex: a.tex, sinirAzami: a.azami,
      sahipTex: sahipDokusu(THREE, game.world),
      ulkeOrtTex: ulkeOrtalamaDokusu(THREE, game.world, r.surfaceOwnerData(game.world)),
    };
  };
  const s0 = sahiplikDokulari();
  const kara = karaKatmani(THREE, {
    uArka: U.uArka, uDist: U.uDist, uGurultu: U.uGurultu, uAlan: U.uAlan,
    uOrigin: U.uOrigin, uSpan: U.uSpan, uCozunurluk: U.uCozunurluk,
    uOlcek: U.uOlcek, uTime: U.uTime, uGunesDir: U.uGunesDir, uEkranSpan: U.uEkranSpan,
    uDistMax: U.uDistMax, uHex: U.uHex,
  }, {
    tipTex: tipDokusu(THREE, game.world),
    yukTex: yukseklikDokusu(THREE, alan0),
    kiyiTex: denizUzakligiDokusu(THREE, alan0, DIST_MAX),
    araziTex: araziRenkDokusu(THREE, game.world),
    ...s0,
    yukBoyut: { w: alan0.w, h: alan0.h },
    grid: { cols: game.world.cols, rows: game.world.rows },
    hexSize: HEX_SIZE,
  });
  kara.mesh.renderOrder = 5;
  sahne.add(kara.mesh);

  // Oyunun kendi sınır mürekkebi koyu bir çizgidir; kara katmanı sınırı kendi
  // çekirdek + bant modeliyle çiziyor. İkisi üst üste binerse bant siyahın
  // altında kalır. Geçit KARA KATMANINA bağlı: katman kapanınca oyunun
  // mürekkebi kendiliğinden geri gelir.
  const asilSinir = r.drawBorders.bind(r);
  r.drawBorders = (...a) => { if (!kara.mesh.visible || !gorunur) asilSinir(...a); };

  // ------------------------------------------------------------ yenileme
  let sonOlcek = 1;
  let arkaTazele = 8;          // ilk kareler: arka doku birkaç kez tazelensin
  const sonKam = { x: NaN, y: NaN, zoom: NaN };
  let gorunur = true;
  let t0 = 0;

  const dispose = (t) => { if (t && t.dispose) t.dispose(); };

  /** Yeni dünya: dünyaya bağlı HER doku yeniden kurulur. */
  function dunyaYenile() {
    const alan = r.material.cache;
    dispose(U.uDist.value);
    U.uDist.value = kiyiDokusu(THREE, alan);
    U.uAlan.value.set(alan.x0, alan.y0, alan.width, alan.height);
    const K = kara.U;
    dispose(K.uTip.value); K.uTip.value = tipDokusu(THREE, game.world);
    dispose(K.uYuk.value); K.uYuk.value = yukseklikDokusu(THREE, alan);
    K.uYukBoyut.value.set(alan.w, alan.h);
    dispose(K.uKiyiK.value); K.uKiyiK.value = denizUzakligiDokusu(THREE, alan, DIST_MAX);
    dispose(K.uArazi.value); K.uArazi.value = araziRenkDokusu(THREE, game.world);
    K.uGrid.value.set(game.world.cols, game.world.rows);
    sahiplikYenile();
  }

  /** Sahiplik değişti: yalnız sahipliğe bağlı üç doku yeniden kurulur. */
  function sahiplikYenile() {
    const s = sahiplikDokulari();
    const K = kara.U;
    dispose(K.uSinir.value); K.uSinir.value = s.sinirTex;
    K.uSinirAzami.value = s.sinirAzami;
    dispose(K.uSahip.value); K.uSahip.value = s.sahipTex;
    dispose(K.uUlkeOrt.value); K.uUlkeOrt.value = s.ulkeOrtTex;
    arkaTazele = Math.max(arkaTazele, 2);
  }

  function uygula() {
    const d = dalgaDizisi(THREE, P, sonOlcek);
    U.uDalga.value = d.arr;
    U.uTepeMax.value = d.toplam;
    for (const [u, alanAdi] of Object.entries(SKALER)) U[u].value = P[alanAdi];
    U.uDerin.value.set(P.deep);
    U.uOkyanus.value.set(P.ocean);
    U.uKiyi.value.set(P.coast);
    U.uKopukCol.value.set(P.foam);
    U.uSSSCol.value.set(P.sss);
    U.uUfuk.value.set(P.ufuk);
    U.uZenit.value.set(P.zenit);
    U.uGunesCol.value.set(P.gunes);
    U.uGunesDir.value.copy(gunesYonu(THREE, P));
    U.uKasirga.value.z = P.kasirgaYaricap * HEX_STEP;
    U.uKasirga.value.w = P.kasirgaGuc;
    kus.U.uSayiOran.value = P.kusYogunluk;
    kus.U.uBoyut.value = P.kusBoyut;
    kus.U.uYukseklik.value = P.kusYukseklik;
    kus.U.uHiz.value = P.kusHiz;
    kus.U.uYon.value = P.ruzgar * Math.PI / 180;    // kuşlar rüzgârla gider
    for (const [u, alanAdi] of Object.entries(KARA_SKALER)) kara.U[u].value = P[alanAdi];
  }

  function onayarSec(anahtar) {
    if (!ONAYARLAR[anahtar]) return;
    aktifOnayar = anahtar;
    const saklanan = {};
    for (const k of EKSTRA) saklanan[k] = P[k];
    Object.assign(P, ONAYARLAR[anahtar], saklanan);
    uygula();
  }

  function boyutla() {
    // RESIZE: setPixelRatio YENİDEN uygulanır (dpr değişince tampon ile
    // uCozunurluk ayrışıyordu), arka doku birkaç kare tazelenir (oyunun tuvali
    // yeniden ayrılınca boşalır) ve "harita değişti" sayılır.
    gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    gl.setSize(innerWidth, innerHeight, false);
    sonKam.zoom = NaN;
    arkaTazele = Math.max(arkaTazele, 6);
  }

  /** Harita içeriği değişti (birim, seçim, tur): arka doku tazelensin. */
  function tazeleIste(kare = 2) { arkaTazele = Math.max(arkaTazele, kare); }

  function goster(v) {
    gorunur = !!v;
    canvas.style.visibility = gorunur ? 'visible' : 'hidden';
    game.requestRender();
  }

  /**
   * Oyunun karesinden HEMEN SONRA çağrılır. Oyun az önce çizdiyse arka doku
   * tazedir; yalnız gerçekten değiştiğinde dokuya alınır — her kare tam ekran
   * kopya 4.41 ms sürüyordu (laboratuvarda ölçüldü, bütçe 2 ms).
   */
  function ciz(ts) {
    if (!gorunur) return;
    const dt = t0 ? Math.min(0.1, (ts - t0) / 1000) : 0;
    t0 = ts;
    U.uTime.value += dt;
    kus.U.uTime.value = U.uTime.value;
    kus.U.uPikselDunya.value = 1 / cam.zoom;

    const kamDegisti = cam.x !== sonKam.x || cam.y !== sonKam.y || cam.zoom !== sonKam.zoom;
    if (kamDegisti || arkaTazele > 0 || r.hasPendingJobs()) {
      if (r.waterGL && r.waterGL.gl) r.waterGL.gl.flush();
      arkaTex.needsUpdate = true;
      sonKam.x = cam.x; sonKam.y = cam.y; sonKam.zoom = cam.zoom;
      arkaTazele = Math.max(0, arkaTazele - 1);
    }

    // Dalga ölçeği zoom'u takip eder; genlik de aynı çarpanla ölçeklenir,
    // diklik sabit kalır (bkz. laboratuvardaki Nyquist ölçümü).
    const olcek = Math.min(4, Math.max(1, 0.9 / cam.zoom));
    if (Math.abs(olcek - sonOlcek) > 0.02) { sonOlcek = olcek; U.uOlcek.value = olcek; uygula(); }

    const yw = cam.viewWidth / cam.zoom;
    const yh = cam.viewHeight / cam.zoom;
    kamera.left = -yw / 2; kamera.right = yw / 2;
    kamera.top = yh / 2; kamera.bottom = -yh / 2;
    kamera.position.set(cam.x, 4000, cam.y);
    kamera.lookAt(cam.x, 0, cam.y);
    kamera.updateProjectionMatrix();
    U.uKamera.value.copy(kamera.position);
    U.uOrigin.value.set(cam.x, cam.y);
    U.uSpan.value.set(yw * 1.2, yh * 1.2);
    U.uEkranSpan.value.set(yw, yh);
    const pr = gl.getPixelRatio();
    U.uCozunurluk.value.set(innerWidth * pr, innerHeight * pr);

    gl.render(sahne, kamera);
  }

  onayarSec(aktifOnayar);
  if (kayitli) { Object.assign(P, kayitli); delete P.__onayar; uygula(); }
  boyutla();

  return {
    P, U, kara, kus, gl, sahne, kamera,
    uygula, onayarSec, ciz, boyutla, dunyaYenile, sahiplikYenile, tazeleIste, goster,
    get onayar() { return aktifOnayar; },
    get gorunur() { return gorunur; },
    kasirgaBuraya() {
      U.uKasirga.value.x = cam.x;
      U.uKasirga.value.y = cam.y;
      if (P.kasirgaGuc < 0.05) P.kasirgaGuc = 0.75;
      uygula();
    },
  };
}
