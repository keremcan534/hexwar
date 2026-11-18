// Kalabalık savaş sahnesinde kare süresi (node scripts/ui/hx.mjs --plan scripts/ui/minis-perf.plan.mjs --gpu).
// Taban ölçüsü aynı komuta `--query minis=0` eklenerek alınır: sayaçlar, figürsüz.
import { join } from 'node:path';

export default async function plan(hx) {
  await hx.inject(join(hx.probes, 'minis-scene.js'));
  // En kötü durum ölçülür: duraklatılmış dünyada da yürüyüş ve ateş canlandırması açık kalır.
  await hx.ev(`(() => { const m = game.renderer.minis; if (m) { const start = m.frameStart; m.frameStart = function () { start.call(this, false); }; } })()`);
  const scene = await hx.ev('__minisScene({ radius: 13, perTile: 3 })');
  const out = { scene, zooms: [] };
  for (const zoom of [0.3, 0.7, 1.0, 1.3, 1.6, 2.2, 3.5]) {
    // İlk tur boyamaları ölçüye karışmasın: kareler bir canlandırma turu önceden ısınır.
    await hx.ev(`__minisMeasure(${zoom}, 90)`);
    const row = await hx.ev(`__minisMeasure(${zoom}, 240)`);
    row.figures = await hx.ev('game.renderer.minis.order.length');
    row.bakes = await hx.ev('game.renderer.minis.bakes');
    out.zooms.push(row);
  }
  return out;
}
