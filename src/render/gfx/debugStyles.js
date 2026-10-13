// HATA AYIKLAMA STİLLERİ — arazi temelinin verisini çıplak gösterir.
//
//   ?gfx=debug-height  kara gri tepe gölgesi (yeni yükseklik alanı), deniz dokunulmaz
//   ?gfx=debug-biome   biyom ağırlıkları sahte renkle + hafif gölge
//   ?gfx=debug-dev     gelişmişlik verisi (uGfxHex, devData) + province merkezi
//                      mürekkebi: hexData ve Canvas2D kancalarının kanıtı
//
// Amaç kanıt: sırt/vadi gerçek mi, hex tuğlası ya da teras kalmış mı, sarmal
// dikişi var mı, NaN/kara delik var mı. Sanat yönü DEĞİL; üç prototip bu
// verinin üstüne kurulur. Üçü aynı GLSL'i paylaşır, uGfx ile ayrılır (tek
// derleme).

import { registerGfxStyle } from './registry.js';
import { devHexData, devHexKey, provinceCenters } from './devData.js';

const GLSL = `
#define GFX_NO_BAND
#define GFX_NO_HATCH
uniform float uDbgRelief;   // tepe gölgesi kazancı
uniform float uDbgDetail;   // yakın zoom oluk genliği (0 kapatır: yalnız pişmiş veri)

vec3 dbgBiomeColor(GfxBiome b) {
  return b.forest * vec3(0.10, 0.36, 0.14)
    + b.jungle * vec3(0.02, 0.46, 0.34)
    + b.grass * vec3(0.46, 0.70, 0.26)
    + b.steppe * vec3(0.80, 0.74, 0.34)
    + b.desert * vec3(0.95, 0.80, 0.44)
    + b.tundra * vec3(0.56, 0.50, 0.66)
    + b.snow * vec3(0.97, 0.98, 1.00)
    + b.rock * vec3(0.48, 0.38, 0.30)
    + b.marsh * vec3(0.20, 0.62, 0.70)
    + b.beach * vec3(0.98, 0.62, 0.66);
}

vec3 gfxLand(GfxLand L) {
  vec4 T = gfxTerrain(L.world);
  vec2 g = gfxHeightGradMS(L.world, L.px);
  // Yakın zoom ayrıntısı yalnız yaylada; uzakta kendiliğinden söner.
  g += gfxErosionGrad(L.world, g, T.b, uDbgDetail);
  vec3 N = gfxNormalFromGrad(g, 1.0);
  if (uGfx == 902) {
    GfxBiome b = gfxBiomeAt(L.world);
    float sh = gfxHillshade(N, L.Ldir, 0.55 * uDbgRelief, 0.70, 1.25);
    return dbgBiomeColor(b) * sh;
  }
  if (uGfx == 903) {
    GfxDev d = gfxDev(L.fill);
    float sh = gfxHillshade(N, L.Ldir, 0.55 * uDbgRelief, 0.75, 1.20);
    // R kalkınma, G yoğunluk, B sanayi; tarla sarı tarama, demiryolu ince çizgi.
    vec3 c = vec3(0.15) + vec3(d.development * 0.75, d.density * 0.75, d.industry * 0.85);
    float stripe = step(0.5, fract((L.wp.x + L.wp.y) / 9.0));
    c = mix(c, vec3(0.95, 0.85, 0.30), d.farm * stripe * 0.6);
    c = mix(c, vec3(1.0), d.centre * 0.35);
    return c * sh;
  }
  float sh = gfxHillshade(N, L.Ldir, uDbgRelief, 0.30, 1.70);
  // Yükseklik tonu hafif: kütle okunsun ama gölge baskın kalsın.
  float grey = 0.40 + 0.20 * clamp(T.r, 0.0, 1.2);
  return vec3(grey * sh);
}

vec3 gfxPost(GfxLand L, vec3 col) { return col; }
`;

const common = {
  glsl: GLSL,
  uniforms: (t) => ({ uDbgRelief: t.relief, uDbgDetail: t.detail }),
};

registerGfxStyle({ ...common, name: 'debug-height', id: 901, tune: { relief: 1.0, detail: 0.022 } });
registerGfxStyle({ ...common, name: 'debug-biome', id: 902, tune: { relief: 1.0, detail: 0.022 } });
registerGfxStyle({
  ...common,
  name: 'debug-dev',
  id: 903,
  tune: { relief: 1.0, detail: 0.0 },
  hexData: (world) => devHexData(world),
  hexDataKey: (world) => devHexKey(world),
  ink: {
    // Statik katmana pişer (sınır çizgilerinin üstü): merkez halkası,
    // yarıçapı kalkınmayla. Mürekkep kancasının ve provinceCenters'ın kanıtı.
    over(ctx, info) {
      if (info.far) return;
      const P = info.world.wrapWidth || 0;
      ctx.save();
      ctx.lineWidth = 1.5 / info.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      for (const c of provinceCenters(info.world)) {
        const r = 4 + (c.econ?.development ?? 0) * 1.6;
        for (const dx of P ? [-P, 0, P] : [0]) {
          const x = c.x + dx;
          if (x + r < info.rect.minX || x - r > info.rect.maxX || c.y + r < info.rect.minY || c.y - r > info.rect.maxY) continue;
          ctx.beginPath();
          ctx.arc(x, c.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
});
