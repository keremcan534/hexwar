// Görsel stillerin tek giriş noktası: renderer yalnız bunu içe aktarır.
// Yeni stil = yeni dosya + buraya bir import satırı (kayıt yan etkisi).
// API belgesi: gfx/registry.js (stil tanımı), gfx/terrainGLSL.js (GLSL
// yardımcıları), render/terrainBake.js (veri), gfx/devData.js (gelişmişlik).

import './debugStyles.js';
import './vic3.js';
import './atlas.js';
import './threeD.js';
import './hoi4.js';

export {
  registerGfxStyle, getGfxStyle, gfxStyleNames, gfxStyleOptions, readGfxParam,
} from './registry.js';
