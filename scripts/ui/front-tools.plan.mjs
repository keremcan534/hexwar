// HOI4 usulü cephe araçları: gerçek arayüzde, gerçek fare ve tuşla.
//   node scripts/ui/hx.mjs --plan scripts/ui/front-tools.plan.mjs --gpu --w 1536 --h 864 --out .shots/cephe
// Oyuncu iki komşusuyla savaşa girer, iki generale tümen verilir. Sıra: Z + sınıra
// tek tık (bütün cephe), boş cephe kartı ve atama, görevden alma, bütün planları
// sil (iki tık), Settings → Controls tuş listesi. Her adımda yerleşim sondası.
import { join } from 'node:path';

export default async function plan(hx) {
  await hx.sleep(2500);
  await hx.inject(join(hx.probes, 'layout-probe.js'));
  const probe = () => hx.ev(`(() => { const r = __layoutProbe(); return { unreachable: r.unreachable.slice(0, 5), offscreen: r.offscreen.slice(0, 5), columns: r.columns.length }; })()`);

  const setup = await hx.ev(`(async () => {
    const d = await import('/src/game/diplomacy.js');
    const c = await import('/src/game/command.js');
    const w = game.world; const me = game.turns.playerNation;
    const nation = w.nations[me];
    const borders = c.borderNationIds(w, me).map((id) => w.nations[id]).filter((n) => n?.alive)
      .sort((a, b) => a.id - b.id);
    const foes = borders.slice(0, 2);
    nation.power = 500;
    for (const foe of foes) {
      if (w.relations[me][foe.id].truceUntil) w.relations[me][foe.id].truceUntil = 0;
      d.declareWarNow(game, me, foe.id, { manual: true });
    }
    while (c.officersOf(nation, c.BRANCH.ARMY).length < 2) c.createGeneral(w, nation, game.turns.rng);
    const gens = c.officersOf(nation, c.BRANCH.ARMY);
    const land = w.units.filter((u) => u.nationId === me && u.type.domain === 'land');
    const half = Math.ceil(land.length / 2);
    c.assignDivisions(nation, gens[0].id, land.slice(0, half));
    c.assignDivisions(nation, gens[1].id, land.slice(half));
    // Başlangıç: ikisi de görevden alınmış (cephesiz), bütün cepheler boş.
    for (const g of gens) c.releaseFront(w, g);
    game.gapStamp = (game.gapStamp ?? 0) + 1;
    game.renderer.invalidateCache(); game.requestRender();
    game.emit('command', null);
    return { me: nation.name, foes: foes.map((f) => [f.id, f.name]), gens: gens.map((g) => [g.id, g.name, g.divisions.length]) };
  })()`);
  const [g1, g2] = setup.gens.map((g) => g[0]);
  const [foeA, foeB] = setup.foes.map((f) => f[0]);

  // A ile ortak sınırın bir karesi: kamera ortalanır, ekran noktası döner.
  const borderPoint = (foe) => hx.ev(`(async () => {
    const c = await import('/src/game/command.js');
    const ctl = await import('/src/game/control.js');
    const g = await import('/src/world/provinceGraph.js');
    const w = game.world; const me = game.turns.playerNation;
    const tiles = w.tiles.filter((t) => !t.terrain.water && ctl.controllerOf(t) === ${foe}
      && g.nodeNeighbors(w, t).some((n) => ctl.controllerOf(n) === me));
    const t = tiles[Math.floor(tiles.length / 2)];
    game.camera.zoom = 1.1;
    game.camera.centerOn(t.x, t.y);
    game.requestRender();
    await new Promise((r) => setTimeout(r, 400));
    const p = game.camera.worldToScreenWrapped(t.x, t.y);
    return { x: Math.round(p.x), y: Math.round(p.y), border: tiles.length };
  })()`);
  const generalState = (id) => hx.ev(`(() => {
    const g = game.world.nations[game.turns.playerNation].generals.find((x) => x.id === ${id});
    return { target: g.target, line: Boolean(g.line), released: Boolean(g.released), stance: g.stance, front: g.front.length,
      empty: game.emptyFronts().map((r) => [r.nationId, r.open, r.total]),
      cards: document.querySelectorAll('[data-empty-front]').length };
  })()`);

  const out = { setup, steps: {} };

  // 1. ÖNCE: G1 seçili, cephesi yok; A sınırı boşluk çizgisi.
  await hx.clickSel(`[data-general="${g1}"]`);
  await hx.sleep(300);
  const pa = await borderPoint(foeA);
  await hx.sleep(300);
  out.steps.before = { ...(await generalState(g1)), layout: await probe() };
  await hx.shot('1-once-cephesiz');

  // 2. Z + sınıra tek sol tık: A ile bütün ortak cephe G1'in.
  await hx.key('z');
  await hx.sleep(150);
  const tool = await hx.ev(`game.drawTool`);
  await hx.click(pa.x, pa.y);
  await hx.sleep(500);
  out.steps.oneClick = { tool, point: pa, ...(await generalState(g1)), layout: await probe() };
  await hx.shot('2-sonra-tek-tikla-cephe');

  // 3. Boş cephe kartı (B'nin cephesi generalsiz) ve atama: G2 seç, karta tık.
  await hx.clickSel(`[data-general="${g2}"]`);
  await hx.sleep(300);
  await borderPoint(foeB);
  await hx.sleep(300);
  out.steps.empty = { ...(await generalState(g2)), layout: await probe() };
  await hx.shot('3-bos-cephe-karti');
  const hit = await hx.clickSel(`[data-empty-front="${foeB}"]`);
  await hx.sleep(500);
  out.steps.assign = { hit: hit.hit, ...(await generalState(g2)), layout: await probe() };
  await hx.shot('4-bos-cepheye-atama');

  // 4. Görevden alma: G1 kartının sol köşesi. Tümenler generalde kalır.
  await borderPoint(foeA);
  const before = await hx.ev(`game.world.nations[game.turns.playerNation].generals.find((x) => x.id === ${g1}).divisions.length`);
  await hx.hover(0, 0);
  const rel = await hx.clickSel(`[data-cmd-release="${g1}"]`);
  await hx.sleep(500);
  const after = await hx.ev(`game.world.nations[game.turns.playerNation].generals.find((x) => x.id === ${g1}).divisions.length`);
  out.steps.release = { hit: rel.hit, divisionsBefore: before, divisionsAfter: after, ...(await generalState(g1)), layout: await probe() };
  await hx.shot('5-gorevden-alma');

  // 5. Bütün planları sil: araç satırındaki "All" iki tık.
  await hx.clickSel(`[data-general="${g2}"]`);
  await hx.sleep(300);
  await hx.ev(`(() => { const g = game.world.nations[game.turns.playerNation].generals.find((x) => x.id === ${g2}); return g.target; })()`);
  await hx.clickSel('#btn-clear-all');
  await hx.sleep(200);
  await hx.shot('6a-hepsini-sil-onay');
  await hx.clickSel('#btn-clear-all');
  await hx.sleep(500);
  out.steps.clearAll = {
    g1: await generalState(g1), g2: await generalState(g2), layout: await probe(),
  };
  await hx.shot('6b-hepsini-sil-sonra');

  // 6. Tuşlar: Delete planı siler, X taarruz, O ordu ekranı.
  await hx.key('z');
  await hx.sleep(100);
  const pb = await borderPoint(foeB);
  await hx.click(pb.x, pb.y);
  await hx.sleep(300);
  const assigned = (await generalState(g2)).target;
  await hx.key('x');
  await hx.sleep(150);
  const stance = (await generalState(g2)).stance;
  await hx.key('Delete');
  await hx.sleep(300);
  const deleted = await generalState(g2);
  out.steps.keys = { zClickTarget: assigned, xStance: stance, afterDelete: { target: deleted.target, stance: deleted.stance } };

  // 6b. HOI4 sağ sürükleme: sınırın yalnız bir parçası (çizilmiş cephe).
  await hx.clickSel(`[data-general="${g1}"]`);
  await hx.sleep(200);
  const stretch = await hx.ev(`(async () => {
    const ctl = await import('/src/game/control.js');
    const g = await import('/src/world/provinceGraph.js');
    const w = game.world; const me = game.turns.playerNation;
    const tiles = w.tiles.filter((t) => !t.terrain.water && ctl.controllerOf(t) === me
      && g.nodeNeighbors(w, t).some((n) => ctl.controllerOf(n) === ${foeB}));
    const mid = tiles[Math.floor(tiles.length / 2)];
    game.camera.centerOn(mid.x, mid.y); game.requestRender();
    await new Promise((r) => setTimeout(r, 300));
    const near = tiles.filter((t) => w.wrapDistance(t.q, t.r, mid.q, mid.r) <= 3)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    return near.map((t) => { const p = game.camera.worldToScreenWrapped(t.x, t.y); return { x: Math.round(p.x), y: Math.round(p.y) }; });
  })()`);
  await hx.key('z');
  await hx.sleep(100);
  const [s0, ...rest] = stretch;
  await hx.mouse('mouseMoved', s0.x, s0.y);
  await hx.mouse('mousePressed', s0.x, s0.y, { button: 'right' });
  for (const p of rest) { await hx.mouse('mouseMoved', p.x, p.y, { button: 'right' }); await hx.sleep(30); }
  await hx.mouse('mouseReleased', rest.at(-1)?.x ?? s0.x, rest.at(-1)?.y ?? s0.y, { button: 'right' });
  await hx.sleep(400);
  out.steps.rightDrag = { points: stretch.length, ...(await generalState(g1)) };
  await hx.shot('8-sag-surukle-parca-cephe');

  // 7. Settings → Controls tuş listesi.
  await hx.key('Escape');
  await hx.clickSel('#btn-settings');
  await hx.sleep(400);
  await hx.clickSel('#opt-tab-controls');
  await hx.sleep(400);
  out.steps.keyList = await hx.ev(`[...document.querySelectorAll('#settings kbd')].map((k) => k.innerText + ' = ' + k.previousSibling?.innerText)`);
  out.steps.settingsLayout = await probe();
  await hx.shot('7-kisayollar');
  return out;
}
