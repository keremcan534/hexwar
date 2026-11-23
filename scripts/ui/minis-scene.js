// Minyatür denetim sahnesi: kalabalık bir savaş cephesi kurar (GELİŞTİRME ARACI).
//
// Oyun kodu bunu içe aktarmaz; başsız koşucu sayfaya enjekte eder. Sahne yalnız
// duraklatılmış dünyada kurulur ve simülasyon ilerletilmez: `battleId` ve `path`
// birer görüntü durumu olarak yazılır, kare süresi ölçüsü her koşuda aynı kalsın.
window.__minisScene = async function minisScene({ radius = 13, perTile = 3 } = {}) {
  const { createUnit, unitsOn, MAX_STACK } = await import('/src/game/units.js');
  const game = window.game;
  const world = game.world;
  game.setSpeed(0);
  const me = world.nations[game.turns.playerNation];
  const foe = world.nations.find((n) => n.alive && n.id !== me.id);
  const center = me.capital;
  const types = ['INFANTRY', 'INFANTRY', 'CAVALRY', 'ARTILLERY', 'ARMOR', 'INFANTRY'];
  const tiles = [];
  world.forEach((tile) => {
    if (tile.terrain?.water || !tile.terrain?.passable) return;
    const dx = tile.x - center.x;
    const dy = tile.y - center.y;
    if (Math.hypot(dx, dy) <= radius * 45) tiles.push(tile);
  });
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);
  let made = 0;
  let index = 0;
  for (const tile of tiles) {
    const side = tile.x < center.x ? me : foe;
    const room = Math.min(perTile, MAX_STACK) - unitsOn(tile).length;
    for (let i = 0; i < room; i++) {
      const typeId = types[(index + i) % types.length];
      const unit = createUnit(typeId, side.id, tile, side);
      // Doğrudan kareye: placeUnit orduyu province merkezine toplar, sahne seyrek kalırdı.
      unit.tile = tile;
      tile.units = tile.units ?? [];
      tile.units.push(unit);
      tile.unit = tile.units[0];
      world.units.push(unit);
      made++;
      const roll = (index * 7 + i * 3) % 4;
      if (roll === 0) unit.battleId = 999000 + index;
      else if (roll === 1) {
        const next = tiles[(index + 1) % tiles.length];
        unit.path = [next];
      }
    }
    index++;
  }
  window.__minisCenter = { x: center.x, y: center.y };
  game.camera.centerOn(center.x, center.y);
  game.requestRender();
  return { made, tiles: tiles.length, units: world.units.length, me: me.name, foe: foe.name };
};

/**
 * Kare süresi ölçüsü: tam çizim, kamerayı her karede bir piksel kaydırarak
 * (önbellek isabeti ölçülmesin) ve rAF temposuna uyarak. p50/p95/ort. ms döner.
 */
window.__minisMeasure = async function minisMeasure(zoom, frames = 240) {
  const game = window.game;
  const cam = game.camera;
  cam.zoom = zoom;
  if (window.__minisCenter) cam.centerOn(window.__minisCenter.x, window.__minisCenter.y);
  cam.clamp?.();
  const x0 = cam.x;
  const samples = [];
  await new Promise((r) => setTimeout(r, 900));
  game.requestRender();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 500)));
  for (let i = 0; i < frames; i++) {
    cam.x = x0 + Math.sin(i * 0.07) * 6;
    await new Promise((r) => requestAnimationFrame(r));
    const t0 = performance.now();
    game.dirty = true;
    game.frame(performance.now());
    samples.push(performance.now() - t0);
    if (game.frameHandle) { cancelAnimationFrame(game.frameHandle); game.frameHandle = 0; }
  }
  cam.x = x0;
  samples.sort((a, b) => a - b);
  const pick = (p) => +samples[Math.min(samples.length - 1, Math.floor(p * samples.length))].toFixed(2);
  return {
    zoom,
    frames,
    avg: +(samples.reduce((s, v) => s + v, 0) / samples.length).toFixed(2),
    p50: pick(0.5),
    p95: pick(0.95),
    max: +samples[samples.length - 1].toFixed(2),
  };
};

/**
 * Atlas galerisi: her tür × 8 yön, oyundaki boyama yolundan geçerek tam ekran bir tuvale dizilir.
 * Yön sırası 0 doğu, saat yönünde; satırlar MINI_KINDS sırasıyla.
 */
window.__minisGallery = async function minisGallery(anim = 'idle', frame = 0, nationIndex = 0) {
  const game = window.game;
  const minis = game.renderer.minis;
  const { MINI_ATLAS } = await import('/src/render/miniAtlas.js');
  const kinds = ['infantry', 'cavalry', 'artillery', 'armor', 'warship', 'submarine', 'transport'];
  for (const kind of kinds) minis.atlas(kind);
  for (let i = 0; i < 300 && kinds.some((k) => !minis.atlas(k)); i++) await new Promise((r) => setTimeout(r, 100));
  const nations = game.world.nations.filter((n) => n.alive);
  const nation = nations[nationIndex % nations.length];
  let canvas = document.getElementById('minis-gallery');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'minis-gallery';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#5a5f43';
    document.body.append(canvas);
  }
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const g = canvas.getContext('2d');
  const size = Math.min(innerWidth / 8, innerHeight / kinds.length);
  kinds.forEach((kind, row) => {
    const naval = row >= 4;
    g.fillStyle = naval ? '#24495a' : '#5a5f43';
    g.fillRect(0, row * size, innerWidth, size);
    const atlas = minis.atlas(kind);
    const tint = minis.tintOf(nation, kind);
    const book = minis.bookFor(1000, minis.cellOf(atlas));
    for (let dir = 0; dir < 8; dir++) {
      minis.bakes = 0;
      minis.tick++;
      minis.bakeMs = 0;
      const slot = minis.slot(book, atlas, kinds.indexOf(kind), tint, dir, MINI_ATLAS.anims[anim].start + frame);
      const c = book.cell;
      const local = slot % book.perPage;
      g.drawImage(book.page(Math.floor(slot / book.perPage)).canvas, (local % book.cols) * c, Math.floor(local / book.cols) * c, c, c, dir * size, row * size, size, size);
    }
  });
  return { nation: nation.name, tint: minis.tintOf(nation, 'infantry').color, size };
};

window.__minisGalleryClose = () => document.getElementById('minis-gallery')?.remove();

/** Deniz sahnesi: en kalabalık filo bölgesine gider, bir de bindirilmiş tümen koyar. */
window.__minisSea = async function minisSea() {
  const { createUnit, placeUnit } = await import('/src/game/units.js');
  const game = window.game;
  const world = game.world;
  for (let i = 0; i < 4 && !world.navyState?.presence?.size; i++) game.endTurn();
  const geo = game.renderer.sea.geometry(world);
  // Yabancı filolar yalnız Seas kipinde görünür: bu kip denetimde bütün filoları açar.
  game.renderer.setMapMode('seas');
  let best = null;
  for (const [zone, here] of world.navyState.presence) {
    let ships = 0;
    for (const entry of here.values()) ships += entry.ships.length;
    if (!best || ships > best.ships) best = { zone, ships };
  }
  const anchor = geo.anchors[best.zone];
  game.camera.centerOn(anchor.x, anchor.y);
  game.camera.zoom = 2.6;
  const me = world.nations[game.turns.playerNation];
  let water = null;
  world.forEach((tile) => {
    if (!water && tile.terrain?.water && Math.hypot(tile.x - anchor.x, tile.y - anchor.y) > 110
      && Math.hypot(tile.x - anchor.x, tile.y - anchor.y) < 170) water = tile;
  });
  if (water) {
    const unit = createUnit('INFANTRY', me.id, water, me);
    placeUnit(unit, water);
    world.units.push(unit);
    unit.path = [world.get(water.q + 1, water.r) ?? water];
  }
  game.requestRender();
  return { zone: best.zone, ships: best.ships, zones: world.navyState.presence.size, transport: !!water };
};
