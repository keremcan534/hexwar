// Kullanılabilirlik taraması: harita durumları, on sekme, diplomasi, ülke dosyası,
// ayarlar ve gazete. Her durumda __usabilityProbe koşar, bulgular işaretlenip çekilir.
//   node scripts/ui/hx.mjs --plan scripts/ui/usability.plan.mjs --gpu --w 1920 --h 1080 --out .shots/ui-denetim/1920
import { join } from 'node:path';

export default async function plan(hx) {
  const states = {};
  await hx.sleep(3500);
  await hx.inject(join(hx.probes, 'usability-probe.js'));
  await hx.inject(join(hx.probes, 'layout-probe.js'));

  const capture = async (name) => {
    await hx.sleep(700);
    const report = await hx.ev('__usabilityProbe()');
    report.layout = await hx.ev('(() => { const r = __layoutProbe(); return { unreachable: r.unreachable.length, offscreen: r.offscreen.length }; })()');
    states[name] = report;
    await hx.ev(`__usabilityMark(${JSON.stringify(report)}); 1`);
    await hx.sleep(120);
    await hx.shot(name);
    await hx.ev('__usabilityUnmark(); 1');
  };
  const closeAll = async () => {
    for (let i = 0; i < 3; i++) await hx.key('Escape');
    await hx.sleep(300);
  };

  // --- Harita ---
  await capture('harita');
  const spot = await hx.ev(`(() => {
    const me = game.turns.playerNation; const w = game.world;
    const u = w.units.find((x) => x.nationId === me && x.hp > 0 && x.type.domain === 'land');
    const own = w.tiles.find((t) => t.owner === me && !t.terrain.water && !w.units.some((x) => x.tile === t));
    return { unit: { x: u.tile.x, y: u.tile.y }, tile: { x: own.x, y: own.y } };
  })()`);
  await hx.ev(`game.camera.zoom = 1.6; game.camera.centerOn(${spot.tile.x}, ${spot.tile.y}); game.requestRender(); 1`);
  await hx.sleep(1500);
  const tilePt = await hx.ev(`(() => { const p = game.camera.worldToScreenNear(${spot.tile.x}, ${spot.tile.y}, innerWidth / 2); return { x: p.x, y: p.y }; })()`);
  await hx.click(tilePt.x, tilePt.y);
  await capture('harita-il');
  await closeAll();
  await hx.ev(`game.camera.centerOn(${spot.unit.x}, ${spot.unit.y}); game.requestRender(); 1`);
  await hx.sleep(1500);
  const unitPt = await hx.ev(`(() => { const p = game.camera.worldToScreenNear(${spot.unit.x}, ${spot.unit.y}, innerWidth / 2); return { x: p.x, y: p.y }; })()`);
  await hx.click(unitPt.x, unitPt.y);
  await capture('harita-ordu');
  await closeAll();
  await hx.clickSel('#btn-layers');
  await capture('harita-katmanlar');
  await closeAll();
  await hx.clickSel('#btn-newspaper');
  await capture('gazete');
  await closeAll();

  // --- Yönetim ekranları (F1-F10) ---
  const tabs = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
  for (const key of tabs) {
    await hx.key(key);
    await hx.sleep(900);
    const name = await hx.ev(`document.querySelector('#screen:not(.hidden)')?.dataset.screen ?? document.querySelector('.screen:not(.hidden)')?.dataset.screen ?? '${key}'`);
    await capture(`ekran-${name}`);
    await closeAll();
  }
  await hx.key('p');
  await capture('ekran-diplomacy');
  await closeAll();
  await hx.ev(`game.emit('nation', game.world.nations.find((n) => n.alive && n.id !== game.turns.playerNation).id); 1`);
  await capture('ekran-dossier');
  await closeAll();

  // --- Ayarlar ---
  await hx.clickSel('#btn-settings');
  await hx.sleep(500);
  const optTabs = await hx.ev('[...document.querySelectorAll("#opt-tabs [role=tab], #opt-tabs button")].filter((b) => b.offsetParent).map((b) => b.textContent.trim())');
  for (let i = 0; i < optTabs.length; i++) {
    await hx.ev(`[...document.querySelectorAll("#opt-tabs [role=tab], #opt-tabs button")].filter((b) => b.offsetParent)[${i}].click(); 1`);
    await capture(`ayar-${optTabs[i].toLowerCase()}`);
  }
  await closeAll();
  return { states, console: hx.consoleLog.slice(0, 10) };
}
