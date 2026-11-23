// Birim görünümü denetimi: sayaç ve figür her zoomda, Kerem'in ekranının DPR'siyle (1.25).
//
//   node scripts/ui/hx.mjs --plan scripts/ui/units-look.plan.mjs --no-boot --gpu --w 1536 --h 864 \
//     --server http://localhost:5184 --out <klasör> --query tag=once
//
// --no-boot ŞART: DPR oyun açılmadan ayarlanır, yoksa renderer 1 ile kurulur. Sahne aynı tohumda
// her koşuda aynıdır (önce/sonra aynı kadraj); ölçü minis-perf ile aynı kare yolundan.
import { join } from 'node:path';

const LIVE = `(() => { const m = game.renderer.minis; const start = m.frameStart; m.frameStart = function (_, selection, hovered) { start.call(this, false, selection, hovered); }; })()`;

/** Oyuncu ile komşusu savaşta, cephe iki yana dizili; ortadaki dost yığın seçili. */
const WAR = `(async () => {
  const world = game.world;
  const me = game.turns.playerNation;
  const ids = new Set(world.units.filter((u) => u.nationId !== me).map((u) => u.nationId));
  for (const id of ids) {
    const rec = world.relations?.[me]?.[id];
    if (rec) rec.state = 'war';
  }
  const c = window.__minisCenter;
  let best = null;
  for (const u of world.units) {
    if (u.nationId !== me) continue;
    const d = Math.hypot(u.tile.x - (c.x - 60), u.tile.y - c.y);
    if (!best || d < best.d) best = { u, d };
  }
  if (best) game.selectUnit(best.u);
  game.renderer.invalidateCache();
  game.requestRender();
  return { selected: best?.u.id ?? null };
})()`;

export default async function plan(hx) {
  const tag = /tag=([\w-]+)/.exec(process.argv.join(' '))?.[1] ?? 'x';
  const SERVER = process.argv[process.argv.indexOf('--server') + 1];
  const extra = /--query (\S+)/.exec(process.argv.join(' '))?.[1] ?? '';
  await hx.send('Emulation.setDeviceMetricsOverride', { width: hx.W, height: hx.H, deviceScaleFactor: 1.25, mobile: false });
  await hx.send('Page.navigate', { url: `${SERVER}/?seed=${encodeURIComponent(hx.SEED)}&${extra}` });
  await hx.waitFor('window.game && game.world && document.querySelector("#nation-picker")', 60000);
  await hx.sleep(300);
  await hx.ev(`(() => { const b = document.querySelector('#nation-picker [data-play]'); if (b) b.click(); })()`);
  await hx.waitFor('!document.body.classList.contains("picker-open")', 10000).catch(() => {});
  await hx.sleep(800);
  await hx.inject(join(hx.probes, 'minis-scene.js'));
  await hx.ev(LIVE);
  const out = { tag, dpr: await hx.ev('game.renderer.dpr'), shots: [], perf: [] };
  out.scene = await hx.ev('__minisScene({ radius: 9, perTile: 3 })');
  out.war = await hx.ev(WAR);
  // Arayüz panelleri kadrajı örtmesin.
  await hx.ev(`document.body.classList.add('hx-clean')`);
  const zooms = [0.3, 0.6, 0.9, 1.15, 1.35, 1.6, 2.2, 3.2];
  for (const zoom of zooms) {
    await hx.ev(`(() => { game.camera.zoom = ${zoom}; game.camera.centerOn(__minisCenter.x, __minisCenter.y); game.renderer.invalidateCache(); game.requestRender(); })()`);
    await hx.sleep(2200);
    out.shots.push(await hx.shot(`${tag}-z${zoom}`));
    // Ortadan 1:1 kırpım: piksel düzeyinde kenar, hale, bulanıklık.
    out.shots.push(await hx.shot(`${tag}-z${zoom}-crop`, { x: hx.W / 2 - 240, y: hx.H / 2 - 150, width: 480, height: 300 }, 1));
  }
  // Künye galerisi: dört taraf × kol, seçili/değil, iki ölçekte; oyunun kendi pişirme yolundan.
  out.gallery = await hx.ev(`(() => {
    const r = game.renderer;
    if (!r.paintCounterSprite) return null;
    const c = document.createElement('canvas');
    c.id = 'hx-gallery';
    c.width = innerWidth * devicePixelRatio;
    c.height = innerHeight * devicePixelRatio;
    c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#8d9478';
    document.body.append(c);
    const g = c.getContext('2d');
    g.fillStyle = '#8d9478'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#3e4a3a'; g.fillRect(c.width / 2, 0, c.width / 2, c.height);
    const nation = game.world.nations[game.turns.playerNation];
    const types = ['INFANTRY', 'CAVALRY', 'ARTILLERY', 'ARMOR', 'WARSHIP'];
    const sides = ['own', 'ally', 'hostile', 'other'];
    let y = 20;
    for (const zoom of [0.6, 1.0, 1.8]) {
      const scale = Math.pow(1.25, Math.round(Math.log(zoom * r.dpr) / Math.log(1.25)));
      let x = 20; let rowH = 0;
      for (const side of sides) for (const typeId of types) for (const selected of [false, true]) {
        if (selected && typeId !== 'INFANTRY') continue;
        const s = r.paintCounterSprite(scale, { nation, allegiance: side, typeId, soldiers: '30K', strength: 0.8, organization: 0.55, battle: false, selected, stackLen: typeId === 'ARMOR' ? 3 : 1, order: null });
        g.drawImage(s.canvas, x, y);
        x += s.canvas.width + 4; rowH = Math.max(rowH, s.canvas.height);
        if (x > c.width - s.canvas.width - 20) { x = 20; y += rowH + 6; rowH = 0; }
      }
      y += rowH + 16;
    }
    return { y };
  })()`);
  await hx.sleep(300);
  out.shots.push(await hx.shot(`${tag}-galeri`));
  await hx.ev(`document.getElementById('hx-gallery')?.remove()`);
  if (!/noperf/.test(extra)) {
    for (const zoom of [0.3, 0.9, 1.6, 2.2, 3.2]) {
      await hx.ev(`__minisMeasure(${zoom}, 90)`);
      const row = await hx.ev(`__minisMeasure(${zoom}, 240)`);
      row.drawn = await hx.ev('game.renderer.minis.order.length');
      out.perf.push(row);
    }
  }
  return out;
}
