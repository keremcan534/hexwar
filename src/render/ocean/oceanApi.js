// Okyanusun oyuna gösterdiği yüz: `window.deniz`.
//
// Settings paneli ve 3D stil bu nesneyi eski three.js denizinin sözleşmesiyle
// okur (gorunur, goster, gl.getPixelRatio, gl.setPixelRatio, tazeleIste). Aynı
// adlar korunur ki iki yol da aynı panelle çalışsın.

import { OceanLayer } from './oceanLayer.js';

/** Panel henüz kurulmadıysa kayıtlı seçim okunur; yoksa en yüksek kalite. */
function panelSea(game) {
  const live = game.settings?.sea;
  if (live) return live;
  try {
    return JSON.parse(localStorage.getItem('hexwar:options') ?? '{}').sea ?? 'high';
  } catch {
    return 'high';
  }
}

export function okyanusKur(game) {
  let canvas = document.getElementById('map-kirilma');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'map-kirilma';
    // Tuval #map-water'ın hemen ARKASINA, aynı z-index ile: suyun üstünde,
    // haritanın (#map, z1) altında kalır.
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;'
      + 'z-index:0;pointer-events:none;';
    document.getElementById('map-water').after(canvas);
  }
  const layer = new OceanLayer(game, canvas, { quality: panelSea(game) });

  const api = {
    layer,
    ciz(ts) {
      layer.setQuality(panelSea(game));
      layer.draw(ts);
    },
    boyutla() { layer.resize(); },
    dunyaYenile() { layer.bakedWorld = null; },
    tazeleIste() {},
    /** Dışarıdan gemi bildirimi: [{ id, x, y }] dünya koordinatı (örn. minyatür gemiler). */
    gemiBildir(liste) { layer.external = liste ?? []; },
    // Panel yalnız High'da denizi açık tutan ESKİ sözleşmeyle konuşur. Burada
    // üç kalite de okyanustur; panel "göster" kararını vermesin diye değer
    // onun beklediği yanıtla eşlenir ve çağrı hiç gelmez.
    get gorunur() { return panelSea(game) === 'high'; },
    goster() {},
    gl: {
      getPixelRatio: () => layer.pixelRatio,
      setPixelRatio: (v) => { layer.pixelRatio = v; layer.resize(); },
    },
  };
  return api;
}
