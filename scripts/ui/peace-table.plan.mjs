// Barış masası ve barışta eve dönüş: gerçek arayüzde.
//   node scripts/ui/hx.mjs --plan scripts/ui/peace-table.plan.mjs --gpu --w 1536 --h 864 --out .shots/baris
// Oyuncu bir komşusuyla savaşa girer, kümelerinin bir kısmını (ikinci sahnede
// başkentle birlikte çoğunu) tutar, tümenlerini düşman toprağına koyar; masa
// açılır, "Best deal" ile doldurulur ve imzalanır. Ölçülen: masanın yazdığı
// bütçe/tavan, imzadan HEMEN sonra yabancı toprakta kalan oyuncu tümeni.
import { join } from 'node:path';

export default async function plan(hx) {
  await hx.sleep(3000);
  await hx.inject(join(hx.probes, 'layout-probe.js'));
  const setup = (share) => hx.ev(`(async () => {
    const d = await import('/src/game/diplomacy.js');
    const u = await import('/src/game/units.js');
    const w = game.world; const me = game.turns.playerNation;
    const contacts = w.contacts ?? d.computeContacts(w);
    const foes = w.nations.filter((n) => n.alive && n.id !== me && (contacts[me]?.[n.id] ?? 0) > 0 && !d.atWar(w, me, n.id))
      .sort((a, b) => (b.provinces ?? 0) - (a.provinces ?? 0) || a.id - b.id);
    const foe = foes.find((n) => w.provinces.filter((p) => p.owner === n.id && p.econ).length >= 5) ?? foes[0];
    w.nations[me].power = 500;
    if (w.relations[me][foe.id].truceUntil) w.relations[me][foe.id].truceUntil = 0;
    d.declareWarNow(game, me, foe.id, { manual: true });
    // Masa savaşın ilk haftalarında kapalıdır (MIN_WAR_TURNS): savaş geriye yaşlandırılır.
    d.relation(w, me, foe.id).since = game.turns.turn - 60;
    const theirs = w.provinces.filter((p) => p.owner === foe.id && p.econ)
      .sort((a, b) => (b.id === foe.capital?.provinceId) - (a.id === foe.capital?.provinceId) || a.id - b.id);
    const wanted = Math.max(1, Math.round(theirs.length * ${share}));
    let taken = 0;
    for (const p of theirs) { if (taken >= wanted) break; for (const i of p.tileIdx) w.tiles[i].controller = me; taken++; }
    // Tümenlerimizin dördü düşmanın işgal edilmemiş derinliğine (barışta kalacak toprağa).
    const deep = theirs.slice(wanted).flatMap((p) => p.tileIdx.map((i) => w.tiles[i]))
      .filter((t) => t.terrain.passable && !t.terrain.water && !u.unitsOn(t).length);
    const mine = w.units.filter((x) => x.nationId === me && x.type.domain === 'land' && !x.battleId).slice(0, 4);
    mine.forEach((x, i) => { if (deep[i * 3]) { u.placeUnit(x, deep[i * 3]); w.tiles[w.tiles.indexOf(deep[i * 3])].controller = me; } });
    game.renderer.invalidateCache(); game.requestRender();
    return { foe: foe.id, name: foe.name, provinces: theirs.length, occupied: taken, inside: mine.length };
  })()`);

  const trespassers = () => hx.ev(`(async () => {
    const wd = await import('/src/game/withdrawal.js');
    const w = game.world; const me = game.turns.playerNation;
    return w.units.filter((x) => x.nationId === me && wd.trespasses(w, x)).length;
  })()`);

  const scene = async (name, share) => {
    const s = await setup(share);
    // Diplomasi ekranı (P) savaş satırındaki "Peace talks" düğmesi: oyuncunun yolu.
    await hx.key('p');
    await hx.sleep(700);
    await hx.clickSel(`[data-peace="${s.foe}"]`);
    await hx.sleep(600);
    const opened = await hx.ev(`!!document.querySelector('.peace-score')`);
    if (!opened) throw new Error(`peace table did not open (${name})`);
    await hx.clickSel('[data-fill-peace]');
    await hx.sleep(500);
    const table = await hx.ev(`(() => ({
      score: document.querySelector('.peace-score')?.innerText.replace(/\\s+/g, ' ').trim(),
      head: document.querySelector('.card-head small')?.innerText.trim(),
      hint: document.querySelector('.peace-head .hint')?.innerText.trim(),
      demanded: document.querySelectorAll('.peace-tile.take').length,
      terms: [...document.querySelectorAll('.peace-term.picked b')].map((b) => b.innerText),
      layout: (() => { const r = __layoutProbe(); return { unreachable: r.unreachable.length, offscreen: r.offscreen.length }; })(),
    }))()`);
    await hx.shot(`${name}-masa`);
    await hx.clickSel('[data-peace-tab="terms"]');
    await hx.sleep(300);
    await hx.shot(`${name}-sartlar`);
    await hx.clickSel('[data-peace-tab="take"]');
    await hx.sleep(200);
    const before = await trespassers();
    await hx.clickSel('[data-sign-peace]');
    await hx.sleep(600);
    const after = await trespassers();
    const log = await hx.ev(`(game.turns.log ?? []).slice(0, 4)`);
    await hx.shot(`${name}-imza`);
    return { ...s, table, trespassBefore: before, trespassAfter: after, log };
  };

  const small = await scene('kucuk-zafer', 0.3);
  for (let i = 0; i < 3; i++) await hx.key('Escape');
  const crushing = await scene('ezici-zafer', 0.7);
  return { small, crushing };
}
