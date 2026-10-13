// Görsel stillerin tek giriş noktası: renderer yalnız bunu içe aktarır.
// Yeni stil = yeni dosya + buraya bir import satırı (kayıt yan etkisi).
// API belgesi: gfx/registry.js (stil tanımı), gfx/terrainGLSL.js (GLSL
// yardımcıları), render/terrainBake.js (veri), gfx/devData.js (gelişmişlik).

import './debugStyles.js';
import './atlas.js';

export { registerGfxStyle, getGfxStyle, gfxStyleNames, readGfxParam } from './registry.js';
