// ATLAS — "boyanmış / gravürlü atlas" sanat yönü (?gfx=atlas).
//
// Hedef his: 19. yüzyılın elle boyanmış bir atlası ya da birinci sınıf bir
// kutu oyunu haritası. Üç malzeme var ve her biri kendi katmanında:
//
//   KÂĞIT   (GL)  sıcak krem zemin; lif, gren, benek — ortalaması 1, karartmaz
//   BOYA    (GL)  ülke tonunda düz suluboya yıkaması + granülasyon; arazi
//                 kiplerinde biyom yıkaması. Kar beyaz bırakılır, konturla.
//   MÜREKKEP(2D)  gravür: dağ simgeleri / tarama, ağaç, kum noktası, saz;
//                 ülke kenarında ince pigment birikmesi (bkz. atlasInk.js)
//
// Neden mürekkep Canvas2D'de: GL yüzeyi 0.75 çözünürlükte çizilip CSS ile
// büyütülüyor; 1 piksellik gravür çizgisi orada yumuşar. Mürekkep tuvali tam
// çözünürlükte ve statik katmana pişiyor — çizgi her zoomda keskin, kare
// başına maliyeti yok.
//
// Kerem kuralları burada nasıl karşılanıyor:
//   - Ülke rengi kendi tonunda kalır; arazi ışığı yalnız PARLAKLIĞA biner
//     (dağ tonu sınırlı ve ortalamayı korur, gfxHillshade).
//   - Sınır geniş yumuşak alan değil: oyunun kenar gölgesi kapalı
//     (GFX_NO_BAND), birikme 2-3 piksellik mürekkep çizgisidir.
//   - Gürültüler periyodik (gfxNoise/gfxFbm), sarmalda dikiş yok; hiçbiri hex
//     kimliğine bağlı değil.
//   - Deniz (seaColor) dokunulmaz; kıyı çizgisi yalnız KARA tarafında.

import { registerGfxStyle } from './registry.js';
import { atlasBake, atlasInkUnder, atlasInkOver, atlasRiverStyle } from './atlasInk.js';

const GLSL = `
#define GFX_NO_BAND
uniform float uAtMode;      // 0 siyasi/kültür (yıkama oyunun renginden), 1 arazi/coğrafya (biyom yıkaması), 2 veri kipi
uniform vec3 uAtPaperCol;   // kâğıdın kendi rengi
uniform float uAtPaper;     // kâğıt dokusu payı
uniform float uAtGran;      // pigment granülasyonu payı
uniform float uAtTone;      // yayla ton gölgesi payı
uniform float uAtSnow;      // kar beyazı payı
uniform float uAtContour;   // kar konturu payı
uniform float uAtCoast;     // kara yanı kıyı çizgisi payı
uniform vec3 uAtInk;        // mürekkep (sepya-siyah)
uniform highp sampler2D uAtInkH; // birim 14: mürekkep yüksekliği (kubbesiz; atlasInk.atlasBake)

/** Kubbesiz yükseklik: taramanın çizdiği yüzeyle aynı (ton ve kar konturu buradan). */
float atInkH(vec2 w) { return textureLod(uAtInkH, gfxUV(w), 0.0).r; }
vec2 atInkGrad(vec2 w, float s) {
  vec2 dx = vec2(s, 0.0);
  vec2 dy = vec2(0.0, s);
  return vec2(atInkH(w + dx) - atInkH(w - dx), atInkH(w + dy) - atInkH(w - dy)) / (2.0 * s);
}

/**
 * KÂĞIT ÇARPANI, ortalaması 1. Üç ölçek: ince gren (pigmenti tutan yüzey),
 * x yönünde uzun lifler (yalnız y sıkıştırılır: x'i ölçeklemek sarmal
 * periyodunu bozardı) ve geniş kalınlık beneği. İnce ölçekler ekranda
 * birkaç pikselin altına inince söner — uzakta kum gibi kıpırdamasın.
 */
float atPaper(vec2 w) {
  float g = (gfxNoise(w, 1.7, 401.0) - 0.5) * gfxScreenFade(1.7);
  float f = (gfxNoise(vec2(w.x, w.y * 4.0), 8.0, 409.0) - 0.5) * gfxScreenFade(2.0);
  float m = gfxFbm(w, 80.0, 3, 419.0) - 0.5;
  return 1.0 + g * 0.06 + f * 0.05 + m * 0.05;
}

/** Lekelenme (foxing): seyrek, çok soluk kahve benek. Alan payı ~%3, ortalamayı ancak binde bir kaydırır. */
float atFox(vec2 w) {
  float n = gfxNoise(w, 160.0, 431.0);
  float d = gfxNoise(w, 22.0, 433.0);
  return smoothstep(0.80, 0.93, n) * (0.4 + 0.6 * d);
}

/**
 * Arazi kiplerinin suluboya paleti. Ağırlıklar keskinleştirilir (üs 1.7):
 * ekoton yine ilerler ama iki biyomun yarı yarıya karıştığı bant daralır —
 * yıkamalar çamurlaşmaz, atlas lekesi gibi seçik durur.
 */
vec3 atBiomeWash(GfxBiome b, float h) {
  float w[10];
  w[0] = b.forest; w[1] = b.jungle; w[2] = b.grass; w[3] = b.steppe; w[4] = b.desert;
  w[5] = b.tundra; w[6] = b.snow; w[7] = b.rock; w[8] = b.marsh; w[9] = b.beach;
  vec3 pal[10];
  pal[0] = vec3(0.66, 0.76, 0.55);  // orman: söğüt yeşili
  pal[1] = vec3(0.52, 0.68, 0.50);  // cangıl: koyu zümrüt
  pal[2] = vec3(0.82, 0.86, 0.63);  // çayır: açık sarı-yeşil
  pal[3] = vec3(0.89, 0.85, 0.64);  // bozkır: saman
  pal[4] = vec3(0.95, 0.85, 0.63);  // çöl: okra kum
  pal[5] = vec3(0.80, 0.82, 0.76);  // tundra: gri yosun
  pal[6] = vec3(0.97, 0.97, 0.96);  // kar
  pal[7] = vec3(0.80, 0.73, 0.64);  // kaya: sıcak gri-kahve
  pal[8] = vec3(0.68, 0.77, 0.70);  // bataklık: gri-çam
  pal[9] = vec3(0.96, 0.91, 0.75);  // kumsal
  vec3 c = vec3(0.0);
  float s = 0.0;
  for (int i = 0; i < 10; i++) {
    float k = pow(max(w[i], 0.0), 1.7);
    c += pal[i] * k;
    s += k;
  }
  c = s > 1e-4 ? c / s : uAtPaperCol;
  // Hipsometrik hafif sıcaklık: yayla kahveye çalar (kar hariç).
  c = mix(c, vec3(0.82, 0.74, 0.62), 0.22 * smoothstep(0.40, 0.95, h) * (1.0 - b.snow));
  return c;
}

vec3 gfxLand(GfxLand L) {
  vec2 w = L.world;
  float paper = atPaper(w);
  // Veri kipleri seçim yüzeyidir: oyunun rengi kalır, kâğıt yalnız fısıldar.
  if (uAtMode > 1.5) return L.base * (1.0 + (paper - 1.0) * uAtPaper * L.damp);

  vec4 T = gfxTerrain(w);
  GfxBiome b = gfxBiomeAt(w);

  // --- BOYA: suluboya yıkaması ---
  // Kâğıt ışığı geçirir, pigment süzer: renk = kâğıt × geçirgenlik^yoğunluk
  // (Beer-Lambert). Yoğunluk granülasyonla ±, yıkamanın kendi düzensizliği
  // geniş ölçekte ±: ton aynı kalır, yalnız koyuluk kıpırdar.
  vec3 wash = uAtMode > 0.5 ? atBiomeWash(b, T.r) : L.base;
  vec3 trans = clamp(wash / uAtPaperCol, 0.03, 1.0);
  float gr = gfxNoise(w, 2.6, 451.0) * 0.6 + gfxNoise(w, 1.1, 457.0) * 0.4;
  gr = (gr - 0.5) * gfxScreenFade(2.6);
  float bloom = gfxFbm(w, 38.0, 2, 463.0) - 0.5;
  float dens = 1.0 + (gr * 0.30 * uAtGran + bloom * 0.16) * L.damp;
  vec3 col = uAtPaperCol * pow(trans, vec3(dens));

  // --- KAR: boya kar alanında seyrelir (beyaz bırakılmış kâğıt) ---
  // Siyasi kipte yalnız hafifçe: ülke tonu karda da okunmalı.
  float snow = smoothstep(0.40, 0.68, b.snow) * uAtSnow;
  if (uAtMode < 0.5) col = mix(col, uAtPaperCol * 1.03, snow * 0.38);

  // --- TON: dağ gölgesi, sınırlı ve ortalamayı koruyan ---
  // Eğim mürekkep yüksekliğinden (kubbesiz) ve orta ölçekte: temel alanda
  // her dağ hexi kendi kubbesi olarak parlıyordu. Ton yalnız kütleyi taşır;
  // yamaç ayrıntısı mürekkebin (tarama) işi.
  float hexW = uHexSize * 1.7320508;
  vec2 gc = atInkGrad(w, max(hexW * 0.33, L.px * 2.0)) * 0.6
          + atInkGrad(w, max(hexW * 0.8, L.px * 4.0)) * 0.4;
  vec3 N = gfxNormalFromGrad(gc, 1.5);
  // Uzakta mürekkep simgesi küçük kalır, kütleyi ton taşır; yakında tarama.
  // Yakında tarama kütleyi zaten taşıyor: ton orada geri çekilir, yoksa geniş
  // gölge yarısı tarama altında kirli bir leke gibi okunuyordu.
  float toneAmt = uAtTone * mix(1.0, 0.38, smoothstep(0.6, 2.0, uZoom)) * (uAtMode < 0.5 ? 0.75 : 1.0);
  // Gölge yanı ışık yanından dar: geniş yamaçta tek taraflı gölge kâğıtta
  // "kirli leke" gibi duruyordu (coğrafya kipi, z0.6).
  float sh = gfxHillshade(N, L.Ldir, 1.0, 0.91, 1.08);
  col *= mix(1.0, sh, toneAmt * L.damp);
  // --- KAR KONTURU: kar alanında ince mavi-gri eş yükselti çizgileri ---
  // Aralık zoomla İKİNİN KUVVETİ adımlarıyla değişir: sürekli değişseydi
  // çizgiler zoom boyunca kayardı. Kalınlık ekran pikseli (eğim/px ile).
  // Yükseklik kubbesiz alandan: temel alanda her zirve hexi iç içe halka
  // ("hedef tahtası") çiziyordu.
  vec2 g = atInkGrad(w, max(uTerrTexel.x, L.px * 1.5));
  float gm = length(g);
  float dh = 0.06 * exp2(floor(log2(max(L.px, 1e-3)) + 0.5));
  float dpx = abs(fract(atInkH(w) / dh + 0.5) - 0.5) * dh / max(gm * L.px, 1e-6);
  float cl = 1.0 - smoothstep(0.35, 0.95, dpx);
  // Çizgiler çok sıklaşınca (dik yamaç, uzak zoom) söner.
  cl *= 1.0 - smoothstep(0.18, 0.40, gm * L.px / dh);
  col = mix(col, vec3(0.40, 0.48, 0.58), cl * snow * uAtContour * L.damp);

  // --- KÂĞIT ---
  col *= 1.0 + (paper - 1.0) * uAtPaper * L.damp;
  col = mix(col, col * vec3(0.93, 0.88, 0.80), atFox(w) * 0.45 * uAtPaper * L.damp);

  // --- KIYI: kara yanında ince mürekkep çizgisi ---
  // Kıyıya işaretli uzaklık oyunun kendi kıyı eğrisinden pişti: çizgi
  // GL'nin kara/deniz kararının tam iç kenarında durur.
  float cpx = T.a * uHexSize * 1.7320508 / L.px;
  float coast = 1.0 - smoothstep(0.7, 1.6, cpx);
  col = mix(col, uAtInk, coast * uAtCoast * L.damp);
  return col;
}

vec3 gfxPost(GfxLand L, vec3 col) { return col; }
`;

/** Renderer başvurusu: harita kipi uniform ve renk kancasında okunur. */
let R = null;

/** Kip → GLSL dalı. Siyasi/kültür: oyunun rengi yıkamaya döner; arazi kipleri biyomdan. */
function modeCode(mode) {
  if (mode === 'political' || mode === 'cultures') return 0;
  if (mode === 'terrain' || mode === 'geography') return 1;
  return 2;
}

const washCache = new Map();
/**
 * Atlas yıkaması: oyunun koyu "baskı bandı" (L 22-53) yerine kâğıt üstünde
 * pastel suluboya. Ton ulusun kendi tonu; doygunluk biraz açılır ki yıkama
 * kâğıdın yanında solmasın, parlaklık dar bir banda oturur ki hiçbir ülke
 * kâğıttan fırlamasın ya da çamura batmasın. Arazi gölgesi BURAYA girmez:
 * yıkama düzdür, arazi mürekkeple okunur.
 */
function washColor(src, renderer) {
  const key = `${src.id ?? ''}:${src.hue}:${src.sat}:${src.light}`;
  let c = washCache.get(key);
  if (c) return c;
  // Oyunun ton başına doygunluk tavanı (mineralize) korunur: ilk denemede
  // tavansız açılan doygunluk turkuaz ve limonu neon yaptı ("anormal parlıyor").
  const m = renderer.mineralize(src.hue, src.sat, src.light);
  const h = ((m.hue % 360) + 360) % 360;
  // Sarı-yeşil aile göze en parlak gelir: aynı L'de öbürlerinden açık okunur.
  const bright = h > 40 && h < 170 ? -3 : 0;
  const sat = Math.max(20, Math.min(40, m.sat * 0.92 + 2));
  const light = Math.max(62, Math.min(77, 70 + (src.light - 50) * 0.6 + bright));
  c = `hsl(${Math.round(h)} ${Math.round(sat)}% ${Math.round(light)}%)`;
  washCache.set(key, c);
  return c;
}

/** Sahipsiz kara: aynı yıkama kuralından geçen soluk taş rengi (özel görünüm değil, renksiz yıkama). */
const NEUTRAL_WASH = { id: 'neutral', hue: 48, sat: 10, light: 54 };

function ownerIdOf(tile, world) {
  if (tile.owner >= 0) return tile.owner;
  if (tile.fringeOf >= 0) return world.provinces?.[tile.fringeOf]?.owner ?? -1;
  return -1;
}

const LABEL_INK = {
  country: {
    fill: 'rgba(56, 40, 27, 0.9)', stroke: 'rgba(248, 241, 224, 0.72)', strokeK: 0.15,
    shadow: 'rgba(0, 0, 0, 0)', shadowBlur: 0,
  },
  state: { fill: 'rgba(60, 45, 31, 0.9)', stroke: 'rgba(248, 241, 224, 0.66)', width: 2.6 },
  city: {
    fill: 'rgba(56, 42, 30, 0.9)', capital: 'rgba(40, 28, 19, 0.96)',
    stroke: 'rgba(248, 241, 224, 0.7)', widthK: 1.4,
  },
};

const TUNE = {
  paperCol: [0.948, 0.918, 0.850],
  paper: 1.0,
  gran: 1.0,
  tone: 1.0,
  snow: 1.0,
  contour: 0.85,
  coast: 0.85,
  ink: [0.20, 0.155, 0.11],
  // Mürekkep (Canvas2D) — atlasInk okur; değişince renderer.invalidateCache().
  symbols: 1.0,
  hachure: 1.0,
  rim: 1.0,
  heightScale: 100,
};

registerGfxStyle({
  name: 'atlas',
  id: 3,
  glsl: GLSL,
  tune: TUNE,
  uniforms: (t) => ({
    uAtMode: modeCode(R?.mapMode),
    uAtPaperCol: t.paperCol,
    uAtPaper: t.paper,
    uAtGran: t.gran,
    uAtTone: t.tone,
    uAtSnow: t.snow,
    uAtContour: t.contour,
    uAtCoast: t.coast,
    uAtInk: t.ink,
  }),
  // Mürekkep yerleşimi için eğim alanı ve yayla eğim dağılımı (bkz. atlasInk).
  bake: atlasBake,
  textures: {
    // Mürekkep yüksekliği GL'ye de verilir: ton ve kar konturu taramayla aynı
    // yüzeyden okunsun. R16F, doğrusal süzme (WebGL2 çekirdeğinde süzülebilir);
    // mip yok — ton ve kontur yarım hexten kaba adımla okur.
    uAtInkH: {
      unit: 14,
      create(gl, host) {
        const ex = host.extra;
        const H = host.terrain?.height;
        if (!ex?.hInk || !H) return null;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, H.w, H.h, 0, gl.RED, gl.FLOAT, ex.hInk);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      },
    },
  },
  tileColor(tile, world, renderer) {
    const mode = renderer.mapMode;
    if (mode === 'political') {
      const o = ownerIdOf(tile, world);
      const n = o >= 0 ? world.nations[o] : null;
      return washColor(n ?? NEUTRAL_WASH, renderer);
    }
    if (mode === 'cultures') {
      const c = tile.culture >= 0 ? world.cultures?.[tile.culture] : null;
      return washColor(c ?? NEUTRAL_WASH, renderer);
    }
    return null;
  },
  ink: { under: atlasInkUnder, over: atlasInkOver },
  rivers: atlasRiverStyle,
  // Açık kâğıtta oyunun krem yazısı kayboluyordu: koyu sepya mürekkep + kâğıt
  // halesi. Veri kiplerinde zemin yine koyu: orada oyunun yazısı kalır.
  get labelInk() {
    return modeCode(R?.mapMode) === 2 ? null : LABEL_INK;
  },
  attach(renderer) {
    R = renderer;
  },
  detach() {
    R = null;
  },
});
