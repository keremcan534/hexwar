// GÖRSEL STİL KAYDI.
//
// Neden: haritanın sanat yönü (Kerem'in seçeceği üç prototip ve sonrası)
// renderer.js'i her seferinde yeniden yazmadan denenebilsin. Stil bir
// tanım nesnesidir; SurfaceGL onun GLSL'ini ortak arazi parçasıyla derler,
// renderer onun pişirme adımlarını, dokularını ve Canvas2D mürekkep
// geçişlerini doğru yerlere bağlar. Klasik görünüm bir stil DEĞİLDİR: hiçbir
// kanca çalışmaz, program bugünkü kaynağın aynısıdır (piksel piksel).
//
// ===================================================================== AÇMA
//   URL:    ?gfx=<ad>                     (yoksa 'classic')
//   Konsol: game.renderer.setGfxStyle('<ad>')  ('classic' geri döner)
//           game.renderer.gfxTune          canlı ayar (stilin tune nesnesi;
//                                          değişince game.requestRender())
//           game.renderer.gfx.bakeLog      pişirme ölçümü (dilim, adım, toplam)
//           game.renderer.waterGL.gfxError derleme hatası (konsolda satırlı)
//           __gpuMs()                      SurfaceGL geçişinin GPU süresi (ms)
//
// Yeni stil = src/render/gfx/<ad>.js + gfx/index.js'e bir import satırı.
//
// ===================================================================== TANIM
//   registerGfxStyle({
//     name: 'atlas',          // ?gfx=atlas
//     id: 3,                  // uGfx değeri: tam sayı > 0, benzersiz (901-903 hata ayıklama)
//     glsl: `...`,            // ZORUNLU: vec3 gfxLand(GfxLand L) + vec3 gfxPost(GfxLand L, vec3 col)
//     tune: { ... },          // canlı ayarlar; tune.heightScale uHeightScale'i ezer (vars. 100)
//     uniforms(tune, info) {} // her çizimde {uAd: sayı → float | [2..4] → vecN | {int: n} → int}
//                             // info = { camera, time, world, seaMaterial }
//     textures: {             // birim 14/15 (GFX_UNITS.style); bağlam başına bir kez kurulur
//       uAtlasTex: { unit: 14, target?: gl.TEXTURE_2D_ARRAY,
//                    create(gl, host) → WebGLTexture } },
//                             // host = { gl, world, terrain, extra, makeTex(internal, format, w, h, data, filter, wrap, wrapT) }
//     bake: function* (world, terrain, renderer) { ...; yield; ...; return value },
//                             // ek dilimli pişirme (her yield < ~4 ms); dönüş = extra
//                             // (host.extra, ink info.extra). Dünya başına bir kez.
//     hexData(world, renderer) → Uint8Array(cols*rows*4),  // birim 13 (uGfxHex), GLSL gfxHexData(L.fill)
//     hexDataKey(world, renderer) → any,  // ucuz imza; değişince hexData yeniden kurulur
//                             // (hazır: gfx/devData.js devHexData + devHexKey, GLSL gfxDev)
//     tileColor(tile, world, renderer) → css | null,  // yalnız KARA hexinin uOwner rengi
//                             // (null = oyunun rengi). Deniz rengi asla değişmez.
//     ink: {                  // Canvas2D, dünya koordinatında (ctx zaten dönüşümlü)
//       under(ctx, info),     // statik katmana + uzak önbelleğe PİŞER, sınır çizgilerinin ALTINDA
//       over(ctx, info),      // aynı, sınır çizgilerinin ÜSTÜNDE
//       live(ctx, info),      // her kare, şehirlerin altında (hareketli şeyler için)
//     },                      // info = { world, rect{minX,maxX,minY,maxY}, scale, far, renderer,
//                             //          mode, terrain, extra, tune }
//                             // çizgi kalınlığı: px / info.scale. Sarmal: x ± world.wrapWidth.
//                             // Pişen geçişin verisi değişince renderer.invalidateCache().
//     terrain: true,          // false: arazi pişirmesi istenmez (doku birimleri boş yedekli)
//     bakeOptions: { ... },   // terrainBake BAKE üzerine (sigmaB, ridgeAmp...). Farklı ayar
//                             // ayrı pişirme demektir; arazi stiller arası tek yuvada tutulur.
//     attach(renderer), detach(renderer),  // stil seçilince / bırakılınca
//   })
//
// ===================================================================== GLSL
// Stilin GLSL'i FRAG içine landColor'ın hemen önüne girer (#define GFX 1).
// Önce gfx/terrainGLSL.js'in ortak parçası gelir; oradaki her yardımcı ve
// FRAG'ın kendi uniformları/işlevleri (uZoom, uDetail, uDataMode, hexAt,
// regionAt, elevGrad, pigmentNoise...) kullanılabilir. landColor akışı:
//
//   hexBlend → base (ülke rengi, bölge içinde süzülmüş), ch
//   col = gfxLand(L)                      ← stil: malzeme + ışık
//   işgal taraması (uOverlay)             ← #define GFX_NO_HATCH kapatır
//   ülke kenar gölgesi (uBand, siyasi)    ← #define GFX_NO_BAND kapatır,
//                                            #define GFX_CUSTOM_BAND + vec3 gfxBand(GfxLand L, vec3 col, float bd)
//                                            değiştirir (bd: sınıra uzaklık / BAND_REACH, 0 sınırda)
//   return clamp(gfxPost(L, col))         ← stil: son derece (klasik S eğrisi yerine)
//
// Veri kiplerinde (kaynak, nüfus, barış; uDataMode = 1) L.damp = 0.28: her
// arazi terimi L.damp ile çarpılmalı, harita bir SEÇİM YÜZEYİ kalmalı.
// Deniz (seaColor) stile kapalıdır: three.js denizi #map-water'ı kırar, deniz
// pikselleri bit bit aynı kalmalı (setGfxStyle ile doğrulandı).
//
// Katman notu: DOM'a dokunmaz; URL okuması yalnız tarayıcıda.

const STYLES = new Map();

/** Stil kaydı; aynı ad ikinci kez gelirse yenisi geçerli (geliştirmede sıcak yeniden yükleme). */
export function registerGfxStyle(def) {
  if (!def?.name || def.name === 'classic') throw new Error('gfx: stil adı gerekli (classic ayrılmış)');
  if (!Number.isInteger(def.id) || def.id <= 0) throw new Error(`gfx: ${def.name} için tam sayı id > 0 gerekli`);
  if (typeof def.glsl !== 'string' || !/gfxLand\s*\(/.test(def.glsl) || !/gfxPost\s*\(/.test(def.glsl)) {
    throw new Error(`gfx: ${def.name} glsl'i gfxLand(GfxLand) ve gfxPost(GfxLand, vec3) tanımlamalı`);
  }
  for (const other of STYLES.values()) {
    if (other.id === def.id && other.name !== def.name) throw new Error(`gfx: id ${def.id} çakışıyor (${other.name})`);
  }
  def.tune ??= {};
  STYLES.set(def.name, def);
  return def;
}

export function getGfxStyle(name) {
  return STYLES.get(name) ?? null;
}

export function gfxStyleNames() {
  return ['classic', ...STYLES.keys()];
}

/** `?gfx=` parametresi; yoksa ya da tarayıcı dışında 'classic'. */
export function readGfxParam() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    return q.get('gfx') || 'classic';
  } catch {
    return 'classic';
  }
}
