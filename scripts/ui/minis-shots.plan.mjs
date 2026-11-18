// Minyatür görsel denetimi (node scripts/ui/hx.mjs --plan scripts/ui/minis-shots.plan.mjs --gpu --out <klasör>).
// Galeri: her tür × 8 yön × üç canlandırma. Sahne: sayaçtan figüre geçiş, cephe, deniz.
import { join } from 'node:path';

/** Duraklatılmış dünyada da yürüyüş ve ateş canlandırması görünsün. */
const LIVE = `(() => { const m = game.renderer.minis; const start = m.frameStart; m.frameStart = function () { start.call(this, false); }; })()`;

export default async function plan(hx) {
  await hx.inject(join(hx.probes, 'minis-scene.js'));
  await hx.ev(LIVE);
  const out = { shots: [] };
  for (const [anim, frame] of [['idle', 0], ['walk', 2], ['walk', 6], ['fire', 1], ['fire', 2]]) {
    out.gallery = await hx.ev(`__minisGallery('${anim}', ${frame}, 3)`);
    await hx.sleep(200);
    out.shots.push(await hx.shot(`galeri-${anim}${frame}`));
  }
  await hx.ev('__minisGalleryClose()');
  out.scene = await hx.ev('__minisScene({ radius: 13, perTile: 3 })');
  for (const zoom of [1.0, 1.3, 1.6, 2.4, 3.5]) {
    await hx.ev(`(() => { game.camera.zoom = ${zoom}; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.requestRender(); })()`);
    await hx.sleep(1800);
    out.shots.push(await hx.shot(`cephe-z${zoom}`));
  }
  // Atış anı: ateş eden figürlerin alevi yakalansın diye birkaç kare art arda.
  await hx.ev('(() => { game.camera.zoom = 3.2; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.requestRender(); })()');
  await hx.sleep(1500);
  for (let i = 0; i < 4; i++) {
    out.shots.push(await hx.shot(`atis-${i}`));
    await hx.sleep(170);
  }
  out.sea = await hx.ev('__minisSea()');
  await hx.sleep(2500);
  out.shots.push(await hx.shot('deniz-z2.6'));
  await hx.ev('(() => { game.camera.zoom = 3.5; game.requestRender(); })()');
  await hx.sleep(1500);
  out.shots.push(await hx.shot('deniz-z3.5'));
  out.stats = await hx.ev(`(() => { const m = game.renderer.minis; return { live: m.live, sheets: [...m.books.keys()], loaded: [...m.atlases].filter(([, a]) => a.ready).map(([k]) => k) }; })()`);
  return out;
}
