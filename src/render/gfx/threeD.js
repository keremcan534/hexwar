// SANAT YÖNÜ C — "3B EĞİK KAMERA" ÖNİZLEMESİ.  ?gfx=3d&tilt=45
//
// Victoria 3 / Total War sefer haritası hissi: kabartma yalnız ışık değil
// GEOMETRİ; kamera eğilir, dağ yükselir, yamaç güneşe göre aydınlanır, sırt
// komşu vadiye yumuşak bir gölge düşer, uzak kenar hafif bir pusa karışır.
//
// Üç katman, tek kamera (gfx/view3d.js):
//   1. SurfaceGL arazi mesh'i (#map-water): oyunun KENDİ malzeme shader'ı,
//      dünya noktası vertexten gelir. Kara/deniz kararı, sınır eğrisi, ülke
//      rengi, işgal taraması piksel piksel düz yolla aynı kaynaktan.
//   2. three.js denizi (#map-kirilma, lab/): aynı perspektif kamerayla
//      çizdirilir. Denizin kendisi değişmez (shader, önayar, ayar aynı);
//      yalnız kamerası eğilir. Kırılma tabanı yine #map-water'ın pikselidir.
//   3. Mürekkep örtüsü (gfx/inkOverlay.js): renderer'ın Canvas2D mürekkebi
//      ekran dışı tuvale çizilir ve aynı mesh'e giydirilir; pus da burada.
//
// EĞİM 0 = KLASİK. Eğim yokken mesh kurulmaz, malzeme klasik malzemenin
// aynısıdır (gfxClassicMaterial + gfxClassicGrade): ?gfx=3d tek başına
// bugünkü haritayı çizer, deniz bit bit aynı kalır.
//
// Canlı ayar: game.renderer.gfxTune.tilt = 45; game.requestRender()
//   tilt (derece, 0..62), fov (derece), heightScale (dünya birimi/yükseklik
//   birimi: kabartma abartısı, ışık ve gölge aynı ölçeği kullanır), relief,
//   shadow, cavity, haze, exposure.
//
// İKİ GEÇİŞ. Araziye yalnız ZEMİNE AİT mürekkep giydirilir (sınır, nehir,
// kıyı, işgal taraması, seçim ve cephe çizgisi: renderer markPass 'ink').
// Yazı ve işaretler (ülke/state/şehir adı, şehir baklavası, zafer puanı,
// birim sayacı, bayrak, künye, filo) ekran tuvaline DİK basılır
// (renderer.renderMarks): her öğe kendi dünya çapasının izdüşümünde, o
// noktanın arazi yüksekliği dahil; boyu derinlikle ılımlı ölçeklenir
// (markScale). Giydirilen yazı dağın sırtında bükülüyor, uzak kenarda
// basık okunuyordu (Kerem: "yazı ve işaret araziye yapışmasın").
//
// Tıklama ve imleç: kamera izdüşümü (hookCamera) ışını yükseklik alanında
// yürütür; dağın önündeki yamaç, arkasındaki vadiyi örter.

import { registerGfxStyle } from './registry.js';
import { makeView3D } from './view3d.js';
import { InkOverlay3D } from './inkOverlay.js';
import { TERRAIN } from '../../world/terrain.js';
import { HEX_SIZE } from '../../world/worldgen.js';

const HEX_W = Math.sqrt(3) * HEX_SIZE;

/** URL'den sayı (yoksa varsayılan). */
function urlNum(key, fallback) {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get(key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/** terrain.js rengi → GLSL vec3 (sRGB, oyunun kendi paleti). */
function vec3Of(id) {
  const hex = TERRAIN[id]?.color ?? '#808080';
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(4));
  return `vec3(${c.join(', ')})`;
}

const GLSL = `
uniform float u3Mode;      // 0 siyasi/kültür, 1 coğrafya/arazi, 2 veri kipi
uniform float u3Relief;    // tepe gölgesi kazancı
uniform float u3Lo;        // gölge tarafı tabanı
uniform float u3Hi;        // ışık tarafı tavanı
uniform float u3PolRelief; // siyasi kipte aynıları (ayrı: bkz. gfxLand)
uniform float u3PolLo;
uniform float u3PolHi;
uniform float u3Shadow;    // düşen gölge derinliği (0 kapatır)
uniform float u3Cavity;    // eğrilik (sırt açık, vadi koyu; ortalaması sıfır)
uniform float u3Erosion;   // yakın zoom oluk genliği
uniform float u3Exposure;  // eğik bakışta ekran ortalamasını koruyan pay (siyasi)
uniform float u3ExposureNat; // aynısı, doğa paleti
uniform float u3Texture;   // malzeme dokusu (çayır lekesi, orman tacı) payı
uniform float u3Snow;      // zirve karı eşiği kaydırıcı (alan ölçümle ayarlandı)

#ifdef GFX_MESH
uniform float uHeightCurve;  // mesh ile ORTAK (MESH_VERT_BODY): ışık ve gölge aynı şekli görsün

/** Mesh'in yükseklik eğrisi (dünya birimi = bu × uHeightScale). */
float h3(float h) { h = max(h, 0.0); return h * (1.0 - uHeightCurve + uHeightCurve * h); }
/** Eğrinin türevi: eğim zinciri (ova basık → ova ışığı da yumuşak). */
float h3d(float h) { return 1.0 - uHeightCurve + 2.0 * uHeightCurve * max(h, 0.0); }

// Biyom paleti terrain.js renklerinden (renk tek yerde kalsın). Eğik bakışta
// geniş alanlar yan yana ve ışıklı durur: oyunun düz paletinin doygunluğu
// burada "neon" okundu (ilk tur), bu yüzden %22 griye çekilir.
vec3 natural(vec3 c) { return mix(vec3(gfxLuma(c)), c, 0.78); }
const vec3 P_FOREST = ${vec3Of('FOREST')};
const vec3 P_JUNGLE = ${vec3Of('JUNGLE')};
const vec3 P_GRASS = ${vec3Of('GRASSLAND')};
const vec3 P_STEPPE = ${vec3Of('PLAINS')};
const vec3 P_DESERT = ${vec3Of('DESERT')};
const vec3 P_TUNDRA = ${vec3Of('TUNDRA')};
const vec3 P_SNOW = ${vec3Of('SNOW_PEAK')};
const vec3 P_ICE = ${vec3Of('ICE')};
const vec3 P_ROCK = ${vec3Of('MOUNTAIN')};
const vec3 P_HILLS = ${vec3Of('HILLS')};
const vec3 P_BEACH = ${vec3Of('BEACH')};

/**
 * Coğrafya kipinde sürekli arazi rengi: hex mozaiği değil, ekoton.
 * Kar biyom kanalından DOĞRUDAN boyanmaz: kanal SNOW_PEAK hexlerini izler ve
 * düz boyandığında dağın sırtı tek parça beyaz bir yayla oluyordu (ilk tur).
 * Kar zirve kuşağında YÜKSEKLİK, EĞİM ve gürültüyle oturur: dik yüz kaya
 * kalır, oyuk ve düzlük karı tutar. Kutup buzu (kanal × ova) ayrı ve tamdır.
 */
vec3 natureColor(GfxBiome b, vec4 T, float slope, float n1, float n2) {
  vec3 marsh = mix(P_GRASS, P_FOREST, 0.55) * 0.92;
  vec3 rock = mix(P_HILLS, P_ROCK, smoothstep(0.45, 0.95, T.b));
  // Buzla zirveyi YÜKSEKLİK ayırır: yayla kapısı süzülmüş olduğundan tek
  // başına duran zirvede düşük kalıyor ve zirve "buz lekesi" oluyordu.
  float hi = smoothstep(0.3, 0.6, T.r);
  float alpine = b.snow * hi;
  float polar = b.snow * (1.0 - hi);
  // Kar dışı biyomlar; kar payı dağda kayaya, ovada tundraya devredilir.
  // Ağırlıklar KESKİNLEŞTİRİLİR (üs 2.2) ve orman/çayır sınırı gürültüyle
  // bükülür: süzülmüş biyom tek başına her yeri yeşil bir bulamaca
  // çeviriyordu (ikinci tur); örtü ancak ormanla açıklık AYRI lekeler
  // olunca "gerçek arazi" okunur. Gürültü periyodik, hex kimliği taşımaz.
  float pf = n1 * 0.45;
  const float K = 2.2;
  float wFo = pow(max(b.forest + pf, 0.0), K);
  float wJu = pow(max(b.jungle + pf, 0.0), K);
  float wGr = pow(max(b.grass - pf, 0.0), K);
  float wSt = pow(max(b.steppe - pf * 0.5, 0.0), K);
  float wDe = pow(b.desert, K);
  float wTu = pow(b.tundra, K);
  float wRo = pow(b.rock + alpine, K);
  float wMa = pow(b.marsh, K);
  float wBe = pow(b.beach, K);
  float wIc = pow(polar, K);
  // Tundra soluk gri değil, toprak-yosun: soluk griyle süzülmüş kenarı
  // eğik bakışta "duman" gibi okundu (ikinci tur).
  vec3 tundra = mix(P_TUNDRA, P_HILLS, 0.45) * 0.94;
  vec3 c = wFo * P_FOREST + wJu * P_JUNGLE + wGr * P_GRASS + wSt * P_STEPPE
    + wDe * P_DESERT + wTu * tundra + wRo * rock + wMa * marsh + wBe * P_BEACH
    + wIc * tundra;
  float w = wFo + wJu + wGr + wSt + wDe + wTu + wRo + wMa + wBe + wIc;
  c = natural(c / max(w, 1e-4));
  float forestW = (wFo + wJu) / max(w, 1e-4);
  // Çayır/bozkır lekesi: aynı biyomun içinde iki ton (biçilmiş/biçilmemiş).
  c *= 1.0 + n1 * 0.16 * u3Texture;
  // Orman tacı: yakında tek tek ağaç kümesi gibi kırılan ton.
  c *= 1.0 + n2 * 0.34 * u3Texture * forestW;
  // Dik yayla yüzünde kaya açığa çıkar.
  c = mix(c, natural(P_ROCK) * (0.92 + n2 * 0.25), T.b * smoothstep(0.9, 1.9, slope) * 0.55);
  // Zirve karı: kar çizgisi (0.93, worldgen kar eşiği kuşağı) + biyom payı +
  // gürültü − dik yüz (yayla eğimi p50 0.55 / p90 1.4: yalnız dik dörtte bir
  // kaya kalır). Alan ölçümle ayarlandı (snowcal, u3Snow 0.10: STEAM %4.5
  // kara tekseli; SNOW_PEAK hex payı %4.7).
  float sn = (T.r - 0.93) * 5.0 + alpine * 0.35 + n1 * 0.5 + n2 * 0.25
    - smoothstep(0.9, 2.2, slope) * 0.8 + u3Snow;
  // Dar geçiş: yarım kar geniş alanda gri bir "sis" gibi duruyordu.
  float snow = smoothstep(0.04, 0.16, sn);
  c = mix(c, natural(P_SNOW) * vec3(0.97, 0.99, 1.03), snow);
  // Buz sahanlığı: keskin kenarlı, gürültüyle kırık (süzülmüş kenar bulut olurdu).
  c = mix(c, natural(P_ICE) * (0.96 + n2 * 0.1), smoothstep(0.42, 0.52, polar + n1 * 0.35));
  return c;
}

vec3 gfxLand(GfxLand L) {
  vec4 T = gfxTerrain(L.world);
  float hexW = uHexSize * 1.7320508;
  bool nature = u3Mode > 0.5 && u3Mode < 1.5;
  vec2 g = gfxHeightGradMS(L.world, L.px);
  // Oluk ayrıntısı ülke renginde buruşuk kumaş gibi duruyordu: siyasi düşük.
  g += gfxErosionGrad(L.world, g, T.b, u3Erosion * (nature ? 1.0 : 0.35));
  // MAT YÜZEY: yakında ince bir kabarıklık (bitki örtüsü, taş) eğime eklenir.
  // Yalnız pişmiş alanla yüzey pürüzsüz ve parlak "saten" gibi duruyordu;
  // gerçek arazinin her ölçekte pürüzü vardır. Periyodik, ekranda söner.
  float bf = gfxScreenFade(11.0);
  if (bf > 0.0) {
    float e = 2.5;
    float b0 = gfxFbm(L.world, 11.0, 2, 151.0);
    float bx = gfxFbm(L.world + vec2(e, 0.0), 11.0, 2, 151.0);
    float by = gfxFbm(L.world + vec2(0.0, e), 11.0, 2, 151.0);
    // Siyasi kipte düşük: ülke renginde benek "kamuflaj" gibi okunuyordu.
    g += vec2(bx - b0, by - b0) / e * (nature ? 0.020 : 0.008) * bf * u3Texture;
  }
  // Işık mesh'in GERÇEK eğimini görür: eğri ovayı basıklaştırdıysa ışığı da.
  g *= h3d(T.r);
  vec3 N = gfxNormalFromGrad(g, 1.0);
  float slope = gfxSlope(N);
  // Siyasi kipte geometri kabartmayı zaten taşır; aynı ışık ülke renginde
  // "saten kumaş" gibi parlıyordu (ikinci tur): payı kısılır.
  float k = nature ? u3Relief : u3PolRelief;
  float lo = nature ? u3Lo : u3PolLo;
  float hi = nature ? u3Hi : u3PolHi;
  float sh = gfxHillshade(N, L.Ldir, k, lo, hi);
  GfxBiome b = gfxBiomeAt(L.world);
  // Malzeme gürültüsü PERİYODİK ve ekranda söner (hex kimliği yok, bulut yok:
  // en büyük ölçek yarım hex).
  float n1 = gfxFbm(L.world, hexW * 0.5, 3, 101.0) - 0.5;
  float n2 = (gfxFbm(L.world, 9.0, 2, 131.0) - 0.5) * gfxScreenFade(9.0);
  vec3 nat = natureColor(b, T, slope, n1, n2);
  vec3 col;
  if (nature) {
    col = nat;
  } else {
    // Siyasi: ton/doygunluk ülkenin, arazi yalnız PARLAKLIKTA (orman koyu,
    // kar ve çöl açık, taç ve leke dokusu). Uzakta düz ülke rengi kalır,
    // yaklaştıkça arazi okunur; ±%8 ile sınırlı (±%14'te orman lekeleri ülke
    // renginde "kamuflaj" gibi okundu, ikinci tur).
    float near = gfxZoomFade(0.8, 2.6);
    float lum = gfxLuma(nat) / 0.50;
    float m = clamp(pow(max(lum, 1e-3), 0.15 + 0.20 * near), 0.92, 1.08);
    col = L.base * mix(1.0, m * u3Texture + (1.0 - u3Texture), L.damp);
  }
  // Eğrilik: dar ölçekli Laplace; kapalı yüzeyde ortalaması sıfır, karartmaz.
  float s = uTerrTexel.x * 3.0;
  float lap = gfxHeight(L.world + vec2(s, 0.0)) + gfxHeight(L.world - vec2(s, 0.0))
    + gfxHeight(L.world + vec2(0.0, s)) + gfxHeight(L.world - vec2(0.0, s)) - 4.0 * T.r;
  float cav = clamp(-lap * u3Cavity * h3d(T.r), -0.08, 0.08);
  // Sıcak ışık / serin gölge: güneşe dönük yamaç hafif sıcak, gölgeli yamaç
  // gökten hafif mavi alır. Parlaklık nötr (kanal ağırlıkları luma'ya göre),
  // yalnız tonda; kabartmayı derinleştirir, haritayı karartmaz.
  float lit = clamp((sh - 1.0) * 4.0, -1.0, 1.0);
  vec3 tint = lit > 0.0 ? mix(vec3(1.0), vec3(1.035, 1.0, 0.94), lit)
                        : mix(vec3(1.0), vec3(0.965, 0.995, 1.07), -lit);
  tint /= gfxLuma(tint);
  return col * mix(vec3(1.0), sh * (1.0 + cav) * mix(vec3(1.0), tint, nature ? 1.0 : 0.5), L.damp);
}

vec3 gfxPost(GfxLand L, vec3 col) {
  // Siyasi palet klasik dereceyle (ülke renklerinin kimliği); doğa paleti
  // yarım derece (S eğrisi koyu yeşili kömüre çekiyordu).
  bool nature = u3Mode > 0.5 && u3Mode < 1.5;
  float grade = nature ? uGrade * 0.4 : uGrade;
  vec3 c = mix(col, col * col * (3.0 - 2.0 * col), grade);
  // Pay ölçümden: eğik bakışta kameraya bakan (gölgeli) yamaç ekranda daha
  // çok yer kaplar. Kara ortalaması klasiğin altına inmesin (coğrafya %93 → ~%100).
  return c * mix(1.0, nature ? u3ExposureNat : u3Exposure, L.damp);
}

/**
 * DÜŞEN GÖLGE. Işığa doğru yükseklik alanında yürünür; gölge YUMUŞAK ve
 * SINIRLI: payı, arazinin ışın üstüne ne kadar çıktığının uzaklığa oranıyla
 * büyür (yarı gölge uzaklıkla açılır). Ham fark kullanılınca alçak güneşte
 * (~29°) her vadi gölgeye düşüyor ve harita kararıyordu (eski 3B dalı, %31).
 */
float castShadow(vec3 P, vec3 Ld) {
  vec2 dir = normalize(Ld.xy);
  float rise = Ld.z / length(Ld.xy);
  float hexW = uHexSize * 1.7320508;
  float step0 = hexW * 0.16;
  float lod = gfxLod(max(gfxPx(), uTerrTexel.x), uTerrTexel.x) + 1.0;
  float occ = 0.0;
  float t = 0.0;
  for (int i = 1; i <= 22; i++) {
    t += step0 * (1.0 + float(i) * 0.12);
    vec2 q = P.xy + dir * t;
    float hz = h3(gfxTerrainLod(q, lod).r) * uHeightScale;
    float over = hz - (P.z + 0.6 + rise * t);
    occ = max(occ, clamp(over / (t * 0.16 + 6.0), 0.0, 1.0));
  }
  return occ;
}

vec3 gfxMeshFinal(vec3 c, vec3 P, float land, vec3 Ld) {
  if (land < 0.5 || u3Shadow <= 0.0) return c;
  float damp = mix(1.0, 0.28, uDataMode);
  // Siyasi kipte gölge ülke renginde "leke" okunuyordu (0.6 denemesi):
  // orada yarı payda, doğa kipinde tam payda.
  bool nature = u3Mode > 0.5 && u3Mode < 1.5;
  float s = castShadow(P, Ld) * (nature ? 1.0 : 0.55);
  // Gölge gökyüzünden mavi alır: gri kir değil, serin gölge.
  vec3 shade = mix(vec3(1.0), vec3(0.90, 0.95, 1.08), nature ? 1.0 : 0.4);
  return c * mix(vec3(1.0), (1.0 - u3Shadow) * shade, s * damp);
}
#else
// Düz yol (eğim 0): klasik malzemenin birebir aynısı.
vec3 gfxLand(GfxLand L) { return gfxClassicMaterial(L); }
vec3 gfxPost(GfxLand L, vec3 col) { return gfxClassicGrade(col); }
#endif
`;

/** Stilin çalışma durumu (tek renderer). */
const S = {
  renderer: null,
  overlay: null,
  inkCanvas: null,
  inkCtx: null,
  active: false,
  inInk: false,
  view: null,
  memo: null,
  hMax: { terrain: null, value: 1 },
  deniz: null,
  denizCiz: null,
  camProto: null,
};

const tune = {
  tilt: urlNum('tilt', 0),
  fov: urlNum('fov', 30),
  heightScale: urlNum('exag', 150),
  heightCurve: urlNum('curve', 0.7),
  relief: 0.6,
  lo: 0.78,
  hi: 1.22,
  // Siyasi kipte geometri kabartmayı zaten taşır; aynı keskin ışık ülke
  // renginde "katlanmış saten" gibi duruyordu (dağ yamacı tanh tavanına
  // vurup düz parlak/düz koyu plakalar oluyordu). Kazanç düşük, aralık
  // geniş: dağ yamacı doğrusal bölgede kalır, yüzey mat okunur.
  polRelief: 0.16,
  polLo: 0.76,
  polHi: 1.24,
  shadow: 0.24,
  cavity: 2.0,
  erosion: 0.022,
  texture: 1.0,
  snow: 0.10,
  exposure: 1.0,
  exposureNat: 1.07,
  haze: 0.16,
  hazeCol: [0.62, 0.70, 0.76],
  // Dünyanın kutup kenarının ötesi: uzak açık denizin tonunda bir sis (açık
  // pus orada geniş beyaz bir perde, koyu gri ise "tavan" oluyordu).
  edgeFog: 0.94,
  edgeCol: [0.075, 0.14, 0.18],
  // Uzak zoomda eğim azalır (strateji haritalarının alışkanlığı): kıta
  // ölçeğinde siyasi harita okunur kalır, dünyanın kenarı az görünür.
  farTilt: 0.6,
};

function modeId(r) {
  const m = r?.mapMode;
  if (m === 'terrain' || m === 'geography') return 1;
  if (m === 'political' || m === 'cultures' || m === 'diplomacy' || m === 'seas') return 0;
  return 2;
}

/** Yükseklik alanının tepesi: görünür zemin kutusunun üst sınırı için. */
function heightMax(terrain) {
  if (S.hMax.terrain === terrain) return S.hMax.value;
  const d = terrain.height.data;
  let m = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > m) m = d[i];
  S.hMax = { terrain, value: m };
  return m;
}

/**
 * Bu karenin eğik görünümü; eğim yoksa ya da arazi hazır değilse null.
 * Aynı kamera ve ayar için tek kez kurulur: dik işaret geçişinde her yazı
 * worldToScreen'den geçer, görünümü her çağrıda yeniden kurmak (matris +
 * ızgara) yüzlerce kez aynı işi yapmaktı.
 */
function viewFor(r, cam = r.camera) {
  const t = r.gfxTune;
  if (!t || !(t.tilt > 0.01)) return null;
  const wgl = r.waterGL;
  if (!wgl || wgl.lost || !r.renderWorld || !wgl.gfxReady()) return null;
  const terrain = r.gfxTerrainFor(r.renderWorld);
  if (!terrain) return null;
  const key = `${cam.x},${cam.y},${cam.zoom},${cam.viewWidth},${cam.viewHeight},`
    + `${t.tilt},${t.fov},${t.heightScale},${t.heightCurve},${t.farTilt}`;
  if (S.memo?.key === key && S.memo.terrain === terrain) return S.memo.view;
  const near = Math.min(1, Math.max(0, (cam.zoom - 0.3) / 0.6));
  const k = t.farTilt + (1 - t.farTilt) * near * near * (3 - 2 * near);
  const view = makeView3D(cam, {
    tilt: t.tilt * k, fov: t.fov, heightScale: t.heightScale, heightCurve: t.heightCurve,
    hMax: heightMax(terrain),
  });
  S.memo = { key, terrain, view };
  return view;
}

/**
 * terrainBake.sampleTerrain'in yalnız yükseklik kanalı (aynı çift doğrusal
 * okuma, x sarmal): işaret ve ışın adımı başına dizi ayırmasın.
 */
function heightAt(terrain, x, y) {
  const H = terrain.height;
  const f = terrain.field;
  const w = H.w;
  const u = ((x - f.x0) / f.spanX) * w - 0.5;
  const v = ((y - f.y0) / f.spanY) * H.h - 0.5;
  let iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  iu = ((iu % w) + w) % w;
  const x1 = iu + 1 === w ? 0 : iu + 1;
  const y0 = Math.min(H.h - 1, Math.max(0, iv));
  const y1 = Math.min(H.h - 1, Math.max(0, iv + 1));
  const d = H.data;
  const a = d[(y0 * w + iu) * 4];
  const b = d[(y0 * w + x1) * 4];
  const e = d[(y1 * w + iu) * 4];
  const g = d[(y1 * w + x1) * 4];
  return (a + (b - a) * fu) * (1 - fv) + (e + (g - e) * fu) * fv;
}

/** Zemin yüksekliği, dünya birimi (tıklama ışını ve işaret izdüşümü). */
function groundAt(r, x, y) {
  const terrain = r.gfxTerrainFor(r.renderWorld);
  if (!terrain) return 0;
  const t = r.gfxTune;
  const h = Math.max(0, heightAt(terrain, x, y));
  const c = t?.heightCurve ?? 0;
  return h * (1 - c + c * h) * (t?.heightScale ?? 0);
}

/**
 * Dik işaretin derinlik ölçeği. kr = çapadaki piksel/dünya oranı ÷ hedef
 * noktasınınki (önde > 1, arkada < 1). Tam perspektif uzak kenardaki adı
 * okunmaz kılıyor, öndeki sayacı şişiriyordu: üs 0.7 ile yumuşar, bantta kalır.
 */
function markScale(kr) {
  return Math.min(1.2, Math.max(0.78, kr ** 0.7));
}

/** Ekran kenarının ötesinde bu kadar piksele kadar çapa yine çizilir (yazı taşar). */
const PIN_CULL = 160;

/**
 * Dik işaret iğnesi (renderer.renderMarks'a verilir). pin(ctx, x, y):
 * dünya çapası (x + shift, y) arazinin üstünde izdüşürülür ve tuval
 * dönüşümü öyle kurulur ki çizimin dünya koordinatı o noktada, ekrana dik ve
 * zoom × markScale ölçeğinde düşer. Kamera arkası ya da ekran dışı: false.
 */
function makePin(r, v, dpr) {
  return {
    shift: 0,
    pin(ctx, x, y) {
      const wx = x + this.shift;
      const p = v.project(wx, y, groundAt(r, wx, y));
      if (!p || p.x < -PIN_CULL || p.x > v.W + PIN_CULL || p.y < -PIN_CULL || p.y > v.H + PIN_CULL) return false;
      const m = v.zoom * markScale(v.f / (p.depth * v.zoom));
      ctx.setTransform(dpr * m, 0, 0, dpr * m, dpr * (p.x - m * x), dpr * (p.y - m * y));
      return true;
    },
  };
}

function enter3D(r) {
  if (!S.overlay) {
    const map = document.getElementById('map');
    S.overlay = map ? InkOverlay3D.create(map) : null;
  }
  if (S.overlay) S.overlay.canvas.style.display = 'block';
  // Yönetim ekranı açıkken harita geri çekilir (styles.css: body.screen-open
  // #map); mürekkep artık bu tuvalde olduğu için aynı kural ona da.
  if (!document.getElementById('gfx3d-style')) {
    const st = document.createElement('style');
    st.id = 'gfx3d-style';
    st.textContent = '#map-3d-ink{transition:filter 180ms ease}'
      + 'body.screen-open #map-3d-ink{filter:saturate(0.72) brightness(0.82)}';
    document.head.appendChild(st);
  }
  if (!S.inkCanvas) {
    S.inkCanvas = document.createElement('canvas');
    S.inkCtx = S.inkCanvas.getContext('2d', { alpha: true });
  }
  // Ekrandaki Canvas2D tuvali eğik kipte boş durur (mürekkep örtüde).
  const ctx = r.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  S.active = true;
}

function leave3D(r) {
  S.active = false;
  S.view = null;
  S.memo = null;
  if (r.waterGL) r.waterGL.view3d = null;
  if (S.overlay) {
    S.overlay.clear();
    S.overlay.canvas.style.display = 'none';
  }
  r.staticLayers = null;
  r.staticDirty = true;
  r.requestFrame?.();
}

/**
 * Laboratuvar denizinin kamerası. three.js denizi oyunun karesinden hemen
 * sonra kendi ortografik kamerasıyla çizer (lab/entegre.js → api.ciz). Eğik
 * kipte o çizim yutulur, kamera bizim perspektifimize çevrilir ve sahne bir
 * kez daha çizilir. Laboratuvar koduna dokunulmaz; eğim 0'da kanca doğrudan
 * özgün çizime geçer.
 */
function hookDeniz() {
  const api = globalThis.deniz;
  if (!api || S.deniz === api || typeof api.ciz !== 'function' || !api.gl || !api.kamera) return;
  S.deniz = api;
  const orig = api.ciz;
  S.denizCiz = orig;
  api.ciz = (ts) => {
    const v = S.active ? S.view : null;
    if (!v) return orig(ts);
    const gl = api.gl;
    const render = gl.render;
    gl.render = () => {};
    try {
      orig(ts);
    } finally {
      gl.render = render;
    }
    const k = api.kamera;
    const U = api.U;
    // three.js: x doğu, y YUKARI, z güney (oyunun y'si).
    const [ex, ey, ez] = v.eye;
    const [tx, ty, tz] = v.target;
    k.up.set(0, 1, 0);
    k.position.set(ex, ez, ey);
    k.lookAt(tx, tz, ty);
    k.updateMatrixWorld();
    k.projectionMatrix.fromArray(v.proj);
    k.projectionMatrixInverse.copy(k.projectionMatrix).invert();
    U.uKamera.value.set(ex, ez, ey);
    // Deniz yaması görünür zemini PAYLA kaplar (Gerstner yatay kayması kenarı
    // içeri çekiyordu) ama dünyanın kutup kenarını fazla aşmaz: ötesi sistir
    // ve three.js'in kıyı alanı orada kenar satırını tekrarlıyor.
    const b = v.bbox;
    const padX = (b.maxX - b.minX) * 0.08;
    const padY = (b.maxY - b.minY) * 0.08;
    const wy = S.renderer?.gfxTerrainFor(S.renderer.renderWorld)?.field;
    let y0 = b.minY - padY;
    let y1 = b.maxY + padY;
    if (wy) {
      y0 = Math.max(y0, wy.y0 - HEX_W * 4);
      y1 = Math.min(y1, wy.y0 + wy.spanY + HEX_W * 4);
    }
    U.uOrigin.value.set((b.minX + b.maxX) / 2, (y0 + y1) / 2);
    U.uSpan.value.set(b.maxX - b.minX + padX * 2, Math.max(1, y1 - y0));
    U.uEkranSpan.value.set(v.W / v.zoom, v.H / v.zoom);
    try {
      render.call(gl, api.sahne, k);
    } finally {
      k.up.set(0, 0, -1);
    }
  };
}

function unhookDeniz() {
  if (S.deniz && S.denizCiz) S.deniz.ciz = S.denizCiz;
  S.deniz = null;
  S.denizCiz = null;
}

/**
 * Kamera izdüşümü: tıklama, imleç ve HTML işaretleri (birim kartı, muharebe)
 * eğik görünümde de gördükleri yere düşsün. Örnek yönteme gölge koyulur;
 * mürekkep geçişinde (kamera geçici olarak genişletilmiş tepeden bakışken)
 * ve eğim 0'da özgün afin dönüşüm çalışır.
 */
function hookCamera(r) {
  const cam = r.camera;
  if (S.camProto) return;
  const proto = Object.getPrototypeOf(cam);
  S.camProto = proto;
  cam.screenToWorld = function screenToWorld3d(sx, sy) {
    if (!S.active || S.inInk) return proto.screenToWorld.call(this, sx, sy);
    const v = viewFor(r, this);
    const p = v?.pick(sx, sy, (x, y) => groundAt(r, x, y));
    return p ?? proto.screenToWorld.call(this, sx, sy);
  };
  // Yazı katmanı (renderer.drawLabels) k ve kr'yi okur: k çapanın ölçeği
  // (markScale), kr ham oranı (sarmal kopya adımı). Düz yolda ikisi yok.
  cam.worldToScreen = function worldToScreen3d(wx, wy) {
    if (!S.active || S.inInk) return proto.worldToScreen.call(this, wx, wy);
    const v = viewFor(r, this);
    if (!v) return proto.worldToScreen.call(this, wx, wy);
    const p = v.project(wx, wy, groundAt(r, wx, wy));
    // Kameranın arkası ekran dışıdır; afin yedek onu ekrana düşürüyordu.
    if (!p) return { x: -1e5, y: -1e5, k: 1, kr: 1 };
    const kr = v.f / (p.depth * v.zoom);
    return { x: p.x, y: p.y, k: markScale(kr), kr };
  };
}

function unhookCamera(r) {
  if (!S.camProto) return;
  delete r.camera.screenToWorld;
  delete r.camera.worldToScreen;
  S.camProto = null;
}

/**
 * Renderer karesinin sarmalayıcısı (registry: renderWrap). Eğik kipte:
 * kamera geçici olarak görünür zemini kaplayan tepeden bakışa genişletilir,
 * mürekkep ekran dışı tuvale çizilir, SurfaceGL mesh'i view3d ile çizer;
 * kare bitince kamera geri alınır ve mürekkep örtüsü giydirilir.
 */
function renderWrap(r, world, state, inner) {
  hookDeniz();
  const v = viewFor(r);
  if (!v) {
    if (S.active) leave3D(r);
    return inner();
  }
  if (!S.active) enter3D(r);
  if (!S.overlay) return inner();
  const cam = r.camera;
  const dpr = r.dpr || 1;
  const b = v.bbox;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  // Mürekkep tuvali oyunun zoom'unda (yazı ve çizgi bugünkü boyunda);
  // çok büyürse (uzak zoom, geniş eğim) tavanla küçültülür.
  // TUVAL KAMERASI KABA ADIMA OTURUR. Kaydırırken kamera her kare alt
  // piksel kayınca tuvaldeki her yazı ve çizgi yeni konumda yeniden
  // rasterleşiyor ve dokuya yükleme o işi bekliyordu (z0.6'da kare başına
  // birkaç ms). Merkez SNAP piksellik adımlara yuvarlanınca içerik adım
  // içinde aynı piksellerde kalır; tuval her yandan bir adım payla büyür.
  const MAXPX = 4096;
  const SNAP = 128;
  const inkZoom = Math.min(cam.zoom, MAXPX / (bw * dpr + SNAP * 2), MAXPX / (bh * dpr + SNAP * 2));
  const cssW = Math.ceil((bw * inkZoom + SNAP * 2) / 64) * 64;
  const cssH = Math.ceil((bh * inkZoom + SNAP * 2) / 64) * 64;
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (S.inkCanvas.width !== pw || S.inkCanvas.height !== ph) {
    S.inkCanvas.width = pw;
    S.inkCanvas.height = ph;
  }
  const step = SNAP / inkZoom;
  const cx = Math.round((b.minX + b.maxX) / 2 / step) * step;
  const cy = Math.round((b.minY + b.maxY) / 2 / step) * step;
  const rect = {
    x0: cx - cssW / (2 * inkZoom), y0: cy - cssH / (2 * inkZoom),
    w: cssW / inkZoom, h: cssH / inkZoom,
  };
  const saved = { x: cam.x, y: cam.y, zoom: cam.zoom, w: cam.viewWidth, h: cam.viewHeight };
  const savedCtx = r.ctx;
  cam.x = cx;
  cam.y = cy;
  cam.zoom = inkZoom;
  cam.viewWidth = cssW;
  cam.viewHeight = cssH;
  r.ctx = S.inkCtx;
  r.waterGL.view3d = v;
  S.view = v;
  S.inInk = true;
  // Yazı ve işaret bu tuvale girmez (markPass 'ink'): dokuya alınan tuval
  // araziyle eğilir; onlar aşağıda ekrana dik basılır.
  r.markPass = 'ink';
  let out;
  const t0 = performance.now();
  try {
    out = inner();
  } finally {
    r.perf?.add('r.3d.inner', performance.now() - t0);
    S.inInk = false;
    r.markPass = null;
    r.ctx = savedCtx;
    cam.x = saved.x;
    cam.y = saved.y;
    cam.zoom = saved.zoom;
    cam.viewWidth = saved.w;
    cam.viewHeight = saved.h;
  }
  const t = r.gfxTune;
  const ov = S.overlay;
  ov.setTerrain(r.gfxTerrainFor(world));
  ov.resize(saved.w, saved.h, dpr);
  // Pus hedef noktasının biraz ötesinde başlar, üst kenarda tam payına varır.
  const top = v.rayDir(v.W / 2, 0);
  const tTop = top[2] < -1e-4 ? -v.eye[2] / top[2] * Math.hypot(top[0], top[1], top[2]) : v.far * 0.5;
  const t1 = performance.now();
  ov.draw(v, S.inkCanvas, rect, {
    near: v.D * 0.92, far: Math.max(v.D * 1.2, tTop), amt: t.haze, col: t.hazeCol,
    edge: t.edgeFog, edgeCol: t.edgeCol, edgeReach: HEX_W * 4,
  });
  r.perf?.add('r.3d.overlay', performance.now() - t1);
  // Dik işaretler ve yazılar #map tuvaline (örtünün üstünde), gerçek kamerayla.
  r.renderMarks(world, state, makePin(r, v, dpr), v.bbox);
  return out;
}

registerGfxStyle({
  name: '3d',
  label: '3D',
  // Eğim 0 bu stilde klasik çizimdir; menü varsayılanı bu yüzden 45.
  controls: [{ key: 'tilt', label: 'Tilt', min: 0, max: 60, step: 1, value: 45 }],
  id: 31,
  glsl: GLSL,
  tune,
  uniforms: (t) => ({
    u3Mode: modeId(S.renderer),
    u3Relief: t.relief,
    u3Lo: t.lo,
    u3Hi: t.hi,
    u3PolRelief: t.polRelief,
    u3PolLo: t.polLo,
    u3PolHi: t.polHi,
    u3Shadow: t.shadow,
    u3Cavity: t.cavity,
    u3Erosion: t.erosion,
    u3Exposure: t.exposure,
    u3ExposureNat: t.exposureNat,
    u3Texture: t.texture,
    u3Snow: t.snow,
  }),
  renderWrap,
  attach(r) {
    S.renderer = r;
    // Konsoldan teşhis: game.renderer.gfx3d (görünüm, mürekkep tuvali, örtü).
    r.gfx3d = S;
    hookCamera(r);
  },
  detach(r) {
    if (S.active) leave3D(r);
    unhookCamera(r);
    unhookDeniz();
    S.overlay?.destroy();
    S.overlay = null;
    S.renderer = null;
  },
});
