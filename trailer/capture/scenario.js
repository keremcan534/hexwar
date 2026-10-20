// Tarayıcı içinde çalışır (window.game). Fragmanın anlattığı zinciri GERÇEK
// oyun API'siyle oynar: kömür ithalatına bağımlı ulus, komşunun kömür
// madenine ültimatom verir, savaşır, barışta ilhak eder. Denge değiştirilmez;
// oyuncunun yapabildiği her şey burada da yapılır (ilan, seferberlik,
// taarruz emri, barış masası).
const P = await import('/src/game/peace.js');
const C = await import('/src/game/command.js');
const D = await import('/src/game/diplomacy.js');
const AL = await import('/src/game/alliances.js');

export const mods = { P, C, D, AL };

export function quiet() {
  game.autosaveEnabled = false;
  // Kartlar oyunu durdurur ve görüntüye girer; senaryo kendi temposunu yürütür.
  game.notifications.push = () => null;
}

export const coalProvincesOf = (w, id) =>
  w.provinces.filter((p) => p.owner === id && (p.econ?.deposits ?? []).some((d) => d.id === 'COAL'));

export function coalGoal(w, me, foe) {
  const list = coalProvincesOf(w, foe);
  return list.find((p) => (p.neighbors ?? []).some((nid) => w.provinces[nid]?.owner === me)) ?? list[0];
}

export function snapshot(me, foe) {
  const w = game.world, A = w.nations[me], B = w.nations[foe];
  const f = A.economy.goodsFlow.coal;
  const r = (x, d = 2) => +(+(x ?? 0)).toFixed(d);
  return {
    turn: w.turn, prod: r(f.production), dem: r(f.demand), imp: r(f.imports), short: r(f.shortage),
    impSh: r(f.importShare), fulfilled: r(f.fulfilled), treasury: Math.round(A.gold ?? 0),
    tiles: A.tiles, foeTiles: B.tiles, coalProvs: coalProvincesOf(w, me).length,
    warScore: D.atWar(w, me, foe) ? Math.round(P.warScore(w, me, foe)) : null,
    atWar: D.atWar(w, me, foe), price: r(w.market.goods.coal.price),
  };
}

// Savaşta her generali taarruza ve hedefe bağlar (oyuncunun komuta panelinde
// yaptığı iki tık).
export function pushOffensive(me, foe) {
  const A = game.world.nations[me];
  for (const g of C.officersOf(A, 'army')) {
    if (g.stance !== 'advance') { game.selectGeneral(g); game.toggleOffensive(); }
    game.selectGeneral(g); game.setCommandTarget(foe);
  }
  game.selectGeneral(null);
}

export function tryPeace(me, foe, goal, force = false) {
  const w = game.world;
  const off = P.buildOffer(w, me, foe);
  const ids = off.demands.map((d) => d.provinceId ?? d.id ?? d);
  if (!off.demands.length || (!ids.includes(goal.id) && !force)) return null;
  return P.signPeace(game, me, foe, off) ? off : null;
}

// Aday çiftler: kömür ithal eden ulus + kömür eyaleti ona komşu, müttefiksiz,
// belirgin biçimde zayıf bir komşu. Güç oranı oyunun kendi ölçüsü.
export function candidates(minRatio = 2) {
  const w = game.world, out = [];
  for (const A of w.nations) {
    if (!A.alive) continue;
    const f = A.economy.goodsFlow?.coal;
    if (!f || f.demand < 0.5 || (f.imports + (f.shortage ?? 0)) < 0.3) continue;
    const sa = D.nationStrength(w, A);
    const seen = new Set();
    for (const p of w.provinces) {
      if (p.owner !== A.id) continue;
      for (const nid of p.neighbors ?? []) {
        const q = w.provinces[nid];
        if (!q || q.owner < 0 || q.owner === A.id || seen.has(q.owner)) continue;
        if (!(q.econ?.deposits ?? []).some((d) => d.id === 'COAL')) continue;
        seen.add(q.owner);
        const B = w.nations[q.owner];
        const ratio = sa / Math.max(1, D.nationStrength(w, B));
        const allies = AL.alliesOf(B).length;
        if (ratio >= minRatio && !allies) out.push({ me: A.id, meName: A.name, foe: B.id, foeName: B.name, ratio: +ratio.toFixed(1),
          imp: +f.imports.toFixed(2), short: +(f.shortage ?? 0).toFixed(2), dem: +f.demand.toFixed(2), prod: +f.production.toFixed(2),
          foeCoal: coalProvincesOf(w, B.id).length, foeTiles: B.tiles, meTiles: A.tiles });
      }
    }
  }
  return out.sort((a, b) => (b.imp + b.short) - (a.imp + a.short));
}
