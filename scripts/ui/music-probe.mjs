// Müziğin canlı sınaması: gerçek oyunda her hâli sırayla kurar, her adımda çalan
// bölümü ve çıkış düzeyini ölçer. Ses kapalı başsız Chrome'da çalışır.
//
//   node scripts/ui/hx.mjs --plan scripts/ui/music-probe.mjs --server http://localhost:5173 --seed MUZIK1
//
// Düzey çıkış düğümünden okunur (AnalyserNode): kaydırıcı ve geçiş eğrileri dahil
// kulağa giden sinyalin kendisidir.

const SETUP = `(async () => {
  const d = await import('/src/game/diplomacy.js');
  const p = await import('/src/game/peace.js');
  const m = game.music;
  const an = m.ctx.createAnalyser();
  an.fftSize = 2048;
  m.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  const samples = [];
  const marks = [];
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let sum = 0; let peak = 0;
    for (const v of buf) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    const s = m.describe();
    samples.push({
      t: Math.round(performance.now() - t0),
      db: +(10 * Math.log10(sum / buf.length + 1e-10)).toFixed(1),
      peak: +peak.toFixed(3),
      g: m.decks.map((deck) => +deck.gain.gain.value.toFixed(3)),
      mood: s.mood, want: s.want, moment: s.moment, section: s.section, at: s.at == null ? null : +s.at.toFixed(2),
    });
  }, 50);
  const w = () => game.world;
  const me = () => game.turns.playerNation;
  const used = new Set();
  window.__m = {
    d, p, samples, marks,
    mark(name) { marks.push({ name, t: Math.round(performance.now() - t0) }); },
    state: () => m.describe(),
    poke() { game.emit('diplomacy'); },
    pickEnemy() {
      w().nations[me()].power = 99999;
      const other = w().nations.find((n) => n.alive && n.id !== me() && !used.has(n.id)
        && d.warBlockers(w(), me(), n.id, game.turns.turn, null, { allowBreach: true }).length === 0);
      used.add(other.id);
      return other.id;
    },
    ultimatum(id) { return d.declareWar(game, me(), id, { manual: true, allowBreach: true }); },
    startWar(id) {
      w().relations[Math.min(me(), id)][Math.max(me(), id)].warAt = game.turns.turn;
      d.resolveCrises(game);
      game.emit('diplomacy');
      return d.atWar(w(), me(), id);
    },
    occupy(holder, victim, { capital = false } = {}) {
      const cap = w().nations[victim].capital;
      for (const province of w().provinces) {
        if (province.owner !== victim) continue;
        for (const idx of province.tileIdx) {
          const tile = w().tiles[idx];
          if (!capital && tile.q === cap.q && tile.r === cap.r) continue;
          tile.controller = holder;
        }
      }
    },
    setCapital(of, holder) { w().get(w().nations[of].capital.q, w().nations[of].capital.r).controller = holder; game.emit('diplomacy'); },
    restore(victim) {
      for (const province of w().provinces) {
        if (province.owner !== victim) continue;
        for (const idx of province.tileIdx) w().tiles[idx].controller = victim;
      }
    },
    sign(a, b, demands) {
      const held = demands ? p.occupiedProvincesOf(w(), a, b).slice(0, 1).map((x) => p.provinceKeyOf(x.province ?? x)) : [];
      const offer = { demands: held, concessions: [], terms: [] };
      return { refusal: p.offerRefusal(w(), a, b, offer), ok: p.signPeace(game, a, b, offer) };
    },
    powderKeg(on) {
      // Takvim ilk haftanın kapanışında kurulur.
      if (!w().worldEvents) game.endTurn();
      const entry = w().worldEvents.powder_keg;
      if (on) { entry.start = game.turns.turn; entry.until = game.turns.turn + 260; entry.fired = false; game.endTurn(); }
      else { entry.until = game.turns.turn; game.emit('diplomacy'); }
    },
  };
})()`;

export default async function (hx) {
  await hx.waitFor('game.music && game.music.ctx && game.music.describe().section', 30000);
  await hx.ev('game.setSpeed(0)');
  await hx.ev(SETUP);
  const results = [];
  const mark = (name) => hx.ev(`__m.mark(${JSON.stringify(name)})`);
  const look = () => hx.ev('__m.state()');
  /** Beklenen hâl gelene dek bekler; gelmezse adım başarısız yazılır. */
  async function expect(name, want, timeout = 15000) {
    const t0 = Date.now();
    let seen = null;
    while (Date.now() - t0 < timeout) {
      seen = await look();
      if (Object.entries(want).every(([k, v]) => seen[k] === v)) {
        results.push({ step: name, ok: true, after: Date.now() - t0, seen });
        return true;
      }
      await hx.sleep(100);
    }
    results.push({ step: name, ok: false, want, seen });
    return false;
  }
  const me = await hx.ev('game.turns.playerNation');

  await hx.sleep(5000);
  await expect('barış', { mood: 'peace', section: 'climbWhole' });

  await mark('dünya olayı');
  await hx.ev('__m.powderKeg(true)');
  await expect('dünya olayı vurgusu', { moment: 'worldShock', section: 'worldShock' });
  await expect('tedirgin barış', { mood: 'uneasy', moment: null }, 20000);
  await hx.sleep(4000);

  const first = await hx.ev('__m.pickEnemy()');
  await mark('ültimatom');
  await hx.ev(`__m.ultimatum(${first})`);
  await expect('gerginlik', { mood: 'tension', section: 'dreadRising' });
  await hx.sleep(7000);

  await mark('savaş patlıyor');
  await hx.ev(`__m.startWar(${first})`);
  await expect('savaş', { mood: 'war', section: 'warOutbreak' });
  await hx.sleep(9000);

  await mark('düşman başkenti alındı');
  await hx.ev(`__m.occupy(${me}, ${first}, { capital: true }); __m.poke()`);
  await expect('başkent alındı vurgusu', { moment: 'capitalTaken', section: 'uplift' });
  await expect('kazanılan savaş', { mood: 'warWinning', moment: null }, 30000);
  await hx.sleep(5000);

  await mark('başkentimiz düştü');
  await hx.ev(`__m.setCapital(${me}, ${first})`);
  await expect('başkent düştü vurgusu', { moment: 'capitalFall', section: 'capitalFall' });
  await expect('kaybedilen savaş', { mood: 'warLosing', moment: null }, 25000);
  await hx.sleep(5000);

  await hx.ev(`__m.powderKeg(false); __m.restore(${me}); __m.restore(${first}); __m.occupy(${first}, ${me});`);
  await mark('kaybedilen barış');
  const lost = await hx.ev(`__m.sign(${first}, ${me}, true)`);
  await expect('kaybedilen barış vurgusu', { moment: 'peaceLost', section: 'climbLast' });
  await expect('barışa dönüş', { mood: 'peace', moment: null }, 30000);
  await hx.ev(`__m.restore(${me})`);
  await hx.sleep(4000);

  const second = await hx.ev('__m.pickEnemy()');
  await hx.ev(`__m.ultimatum(${second}); __m.startWar(${second})`);
  await expect('ikinci savaş', { section: 'warOutbreak' });
  await hx.sleep(4000);
  await hx.ev(`__m.occupy(${me}, ${second})`);
  await mark('kazanılan barış');
  const won = await hx.ev(`__m.sign(${me}, ${second}, true)`);
  await expect('kazanılan barış vurgusu', { moment: 'peaceWon', section: 'wonderLast' });
  await expect('zaferden barışa', { mood: 'peace', moment: null }, 30000);
  await hx.sleep(3000);

  const third = await hx.ev('__m.pickEnemy()');
  await hx.ev(`__m.ultimatum(${third}); __m.startWar(${third})`);
  await expect('üçüncü savaş', { section: 'warOutbreak' });
  await hx.sleep(3000);
  await mark('beyaz barış');
  const white = await hx.ev(`__m.sign(${me}, ${third}, false)`);
  await expect('beyaz barış vurgusu', { moment: 'peaceWhite', section: 'climbWarm' });
  await hx.sleep(6000);

  await mark('ses sıfır');
  await hx.ev('game.music.menu.music.setVolume(0)');
  await hx.sleep(1500);
  const silent = await hx.ev('__m.samples.slice(-6).map((s) => s.db)');
  await mark('ses geri');
  await hx.ev('game.music.menu.music.setVolume(0.42)');
  await hx.sleep(2500);

  await mark('menü açıldı');
  await hx.ev(`document.body.classList.add('menu-open')`);
  await hx.sleep(3500);
  const inMenu = await look();
  await mark('menü kapandı');
  await hx.ev(`document.body.classList.remove('menu-open')`);
  await expect('menüden dönüş', { mood: 'peace' });
  await hx.sleep(4000);

  await mark('kampanya kaybedildi');
  await hx.ev(`game.emit('victory', { nation: game.world.nations[${third}], score: 1, board: [] })`);
  await expect('kampanya yenilgisi', { moment: 'campaignLost', section: 'climbOutro' });
  await hx.sleep(5000);
  await hx.ev('game.music.moment = null');
  await mark('kampanya kazanıldı');
  await hx.ev(`game.emit('victory', { nation: game.world.nations[${me}], score: 1, board: [] })`);
  await expect('kampanya zaferi', { moment: 'campaignWon', section: 'wonderFinale', mood: 'epilogue' });
  await hx.sleep(6000);

  const data = await hx.ev('JSON.stringify({ samples: __m.samples, marks: __m.marks })');
  return { results, peace: { lost, won, white }, silent, inMenu, ...JSON.parse(data) };
}
