// GERÇEK TARAYICI OYNANIŞ DOĞRULAMASI — basit çekirdek.
//
// Headless denetim kimlikleri kanıtlar; bu betik OYUNU oynatır. Chromium'da
// gerçek bir kampanya açılır, ekonomik hikâyeler oynanır ve her adımda hem
// konsol hataları hem ekranın gösterdiği sayılar toplanır.
//
// Kullanım: node scripts/dev-server.mjs &  →  node scripts/audit/browser-play.mjs

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

const URL = process.env.HEXWAR_URL ?? 'http://localhost:5173/?seed=BETA1836';
const SHOTS = process.env.HEXWAR_SHOTS ?? "/tmp/hexwar-shots";
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (...args) => console.log(...args);
const head = (title) => {
  log(`\n${'='.repeat(74)}`);
  log(title);
  log('='.repeat(74));
};

// Kurulu Chromium'un yolu sürüm klasörüne bağlıdır; PLAYWRIGHT_BROWSERS_PATH
// altındaki ilk gerçek chrome ikilisi bulunur (yeniden indirme YOK).
function chromiumPath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const dir of readdirSync(root)) {
    const candidate = `${root}/${dir}/chrome-linux/chrome`;
    if (dir.startsWith('chromium-') && existsSync(candidate)) return candidate;
  }
  return undefined;
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

head('AÇILIŞ');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game?.world?.nations?.length > 0, { timeout: 60000 });
const opening = await page.evaluate(() => ({
  nations: window.game.world.nations.length,
  provinces: window.game.world.provinces.length,
  turn: window.game.world.turn,
  player: window.game.turns.playerNation,
  drawn: window.game.renderer?.lastDrawn ?? null,
}));
log(`  ulke ${opening.nations} · province ${opening.provinces} · tur ${opening.turn}`
  + ` · oyuncu ${opening.player} · cizilen hex ${opening.drawn}`);
await page.screenshot({ path: `${SHOTS}/01-opening.png` });

/** Turu ilerlet ve arada kareyi soluklandır (gercek oyun donmesin). */
async function advance(weeks) {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) {
      window.game.turns.endTurn();
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }, weeks);
}

const snapshot = () => page.evaluate(() => {
  const g = window.game;
  const me = g.world.nations[g.turns.playerNation] ?? g.world.nations[0];
  const e = me.economy;
  const price = (id) => {
    const s = g.world.market.goods[id];
    return s ? s.price / s.basePrice : null;
  };
  const flow = (id) => {
    const f = e.goodsFlow[id] ?? {};
    return {
      production: f.production ?? 0,
      imports: f.imports ?? 0,
      exports: f.exports ?? 0,
      demand: f.demand ?? 0,
      shortage: f.shortage ?? 0,
    };
  };
  return {
    turn: g.world.turn,
    name: me.name,
    gold: me.gold,
    debt: me.debt ?? 0,
    population: e.population,
    workforce: e.workforce,
    employed: e.employed,
    unemployment: e.unemploymentRate,
    needsMet: e.needsMet,
    foodMet: e.foodMet,
    satisfaction: e.satisfaction,
    stability: e.stability,
    literacy: e.literacy,
    techs: me.research?.done?.length ?? 0,
    researchPoints: me.research?.points ?? 0,
    education: e.social?.education ?? 0,
    tariff: e.tariff,
    gdp: e.gdp,
    wages: e.wagesPaid,
    profit: e.factoryProfit,
    factories: e.factories.length,
    ledger: { ...e.ledger },
    prices: { coal: price('coal'), steel: price('steel'), arms: price('arms'), food: price('food') },
    flows: { coal: flow('coal'), steel: flow('steel'), arms: flow('arms') },
  };
});

const n2 = (value, digits = 2) => (Number.isFinite(value) ? value : 0).toFixed(digits);
const row = (s) => `  t${String(s.turn).padStart(4)} ${s.name.padEnd(12)}`
  + ` alt¤${String(Math.round(s.gold)).padStart(6)}`
  + ` net${n2(s.ledger?.net, 0).padStart(6)}`
  + ` nufus${String(Math.round(s.population / 1000)).padStart(6)}k`
  + ` issiz${n2((s.unemployment ?? 0) * 100, 1).padStart(5)}%`
  + ` sepet${n2(s.needsMet)}`
  + ` gida${n2(s.foodMet)}`
  + ` okur${n2(s.literacy)}`
  + ` fabrika${String(s.factories).padStart(3)}`
  + ` tek${String(s.techs).padStart(3)}`;

head('A. NORMAL KAMPANYA — 5 yıl');
let snap = await snapshot();
log(row(snap));
for (const step of [52, 52, 52, 52, 52]) {
  await advance(step);
  snap = await snapshot();
  log(row(snap));
}
await page.screenshot({ path: `${SHOTS}/02-five-years.png` });

head('B. KÖMÜR KITLIĞI → ÇELİK → SİLAH');
const chain = await page.evaluate(async () => {
  const g = window.game;
  const before = {};
  const read = () => {
    const out = {};
    for (const id of ['coal', 'iron', 'steel', 'arms']) {
      const s = g.world.market.goods[id];
      out[id] = { price: s.price / s.basePrice, supply: s.supply, demand: s.demand };
    }
    return out;
  };
  Object.assign(before, read());
  // Dünyanın kömür üretimini KES: her kömür kümesinin kalitesi çeyreğe iner.
  let cut = 0;
  for (const province of g.world.provinces) {
    if (province.econ?.rgo === 'COAL') {
      province.econ.rgoQuality *= 0.15;
      cut++;
    }
  }
  for (let i = 0; i < 78; i++) g.turns.endTurn();
  return { cut, before, after: read() };
});
log(`  kesilen kömür kümesi: ${chain.cut}`);
for (const id of ['coal', 'iron', 'steel', 'arms']) {
  const b = chain.before[id];
  const a = chain.after[id];
  log(`  ${id.padEnd(6)} fiyat ${b.price.toFixed(2)}x → ${a.price.toFixed(2)}x`
    + ` · arz ${b.supply.toFixed(1)} → ${a.supply.toFixed(1)}`);
}
await page.screenshot({ path: `${SHOTS}/03-coal-shock.png` });

head('C. KÖMÜR ÜRETİMİ GERİ GELİYOR');
const recovery = await page.evaluate(async () => {
  const g = window.game;
  for (const province of g.world.provinces) {
    if (province.econ?.rgo === 'COAL') province.econ.rgoQuality /= 0.15;
  }
  for (let i = 0; i < 78; i++) g.turns.endTurn();
  const out = {};
  for (const id of ['coal', 'steel', 'arms']) {
    const s = g.world.market.goods[id];
    out[id] = { price: s.price / s.basePrice, supply: s.supply };
  }
  return out;
});
for (const id of ['coal', 'steel', 'arms']) {
  log(`  ${id.padEnd(6)} fiyat ${recovery[id].price.toFixed(2)}x · arz ${recovery[id].supply.toFixed(1)}`);
}

head('D. EĞİTİM %10 → %90');
const education = await page.evaluate(async () => {
  const g = window.game;
  const me = g.world.nations[g.turns.playerNation] ?? g.world.nations[0];
  const read = () => ({
    education: me.economy.social.education,
    literacy: me.economy.literacy,
    socialCost: me.economy.ledger?.socialCost ?? 0,
    techs: me.research.done.length,
    net: me.economy.ledger?.net ?? 0,
  });
  me.economy.social.education = 10;
  for (let i = 0; i < 52; i++) g.turns.endTurn();
  const low = read();
  for (let i = 0; i < 156; i++) {
    me.economy.social.education = 90;
    g.turns.endTurn();
  }
  const high = read();
  return { low, high };
});
log(`  %10  → okuryazarlık ${n2(education.low.literacy, 3)}`
  + ` · sosyal gider ¤${n2(education.low.socialCost, 1)} · teknoloji ${education.low.techs}`);
log(`  %90  → okuryazarlık ${n2(education.high.literacy, 3)}`
  + ` · sosyal gider ¤${n2(education.high.socialCost, 1)} · teknoloji ${education.high.techs}`);
await page.screenshot({ path: `${SHOTS}/04-education.png` });

head('E. VERGİ %10 → %90');
const tax = await page.evaluate(async () => {
  const g = window.game;
  const me = g.world.nations[g.turns.playerNation] ?? g.world.nations[0];
  const read = () => ({
    revenue: me.economy.ledger?.taxRevenue ?? 0,
    satisfaction: me.economy.classes.lower.satisfaction,
    stability: me.economy.stability,
    gold: me.gold,
  });
  for (const id of ['lower', 'middle', 'upper']) me.economy.taxes[id] = 10;
  for (let i = 0; i < 26; i++) g.turns.endTurn();
  const low = read();
  for (let i = 0; i < 52; i++) {
    for (const id of ['lower', 'middle', 'upper']) me.economy.taxes[id] = 90;
    g.turns.endTurn();
  }
  const high = read();
  return { low, high };
});
log(`  %10  → vergi geliri ¤${tax.low.revenue.toFixed(1)}`
  + ` · alt sınıf memnuniyeti ${tax.low.satisfaction.toFixed(2)} · istikrar ${tax.low.stability.toFixed(2)}`);
log(`  %90  → vergi geliri ¤${tax.high.revenue.toFixed(1)}`
  + ` · alt sınıf memnuniyeti ${tax.high.satisfaction.toFixed(2)} · istikrar ${tax.high.stability.toFixed(2)}`);

head('F. GÜMRÜK %0 → %80');
const tariff = await page.evaluate(async () => {
  const g = window.game;
  const me = g.world.nations[g.turns.playerNation] ?? g.world.nations[0];
  const read = () => ({
    imports: me.economy.trade.importValue,
    exports: me.economy.trade.exportValue,
    tariffRevenue: me.economy.ledger?.tariffRevenue ?? 0,
    settlement: me.economy.ledger?.externalSettlement ?? 0,
  });
  for (let i = 0; i < 26; i++) { me.economy.tariff = 0; g.turns.endTurn(); }
  const free = read();
  for (let i = 0; i < 26; i++) { me.economy.tariff = 80; g.turns.endTurn(); }
  const closed = read();
  return { free, closed };
});
log(`  %0   → ithalat ¤${tariff.free.imports.toFixed(1)} · ihracat ¤${tariff.free.exports.toFixed(1)}`
  + ` · gümrük geliri ¤${tariff.free.tariffRevenue.toFixed(1)}`);
log(`  %80  → ithalat ¤${tariff.closed.imports.toFixed(1)} · ihracat ¤${tariff.closed.exports.toFixed(1)}`
  + ` · gümrük geliri ¤${tariff.closed.tariffRevenue.toFixed(1)}`);

head('G. EKRANLAR');
const screens = ['budget', 'industry', 'population', 'trade', 'politics', 'technology', 'military', 'exchange'];
for (const id of screens) {
  const ok = await page.evaluate((name) => {
    const button = document.querySelector(`[data-screen="${name}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, id).catch(() => false);
  await page.waitForTimeout(250);
  if (ok) await page.screenshot({ path: `${SHOTS}/screen-${id}.png` });
  log(`  ${id.padEnd(12)} ${ok ? 'açıldı' : 'düğme bulunamadı'}`);
}

head('DEĞİŞMEZLER (tarayıcıda, oynanmış dünyada)');
const invariants = await page.evaluate(() => {
  const g = window.game;
  const bad = [];
  let worstClose = 0;
  for (const n of g.world.nations) {
    if (!n.alive || !n.economy) continue;
    const e = n.economy;
    if (!Number.isFinite(n.gold)) bad.push(`${n.name}.gold=${n.gold}`);
    if (e.population < 0) bad.push(`${n.name}.population<0`);
    if (e.workforce > e.population + 1) bad.push(`${n.name} workforce>population`);
    const employees = e.factories.reduce((s, f) => s + (f.employees ?? 0), 0);
    if (employees > e.workforce + 1) bad.push(`${n.name} employees>workforce`);
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${n.name}.economy.${k}=${v}`);
    }
    const h = e.treasuryHistory ?? [];
    if (h.length >= 2) {
      const delta = h[h.length - 1] - h[h.length - 2];
      const L = e.ledger ?? {};
      const expect = (L.net ?? 0) + (L.borrowed ?? 0) - (L.repaid ?? 0) + (L.defaulted ?? 0);
      worstClose = Math.max(worstClose, Math.abs(delta - expect) / Math.max(10, Math.abs(expect)));
    }
  }
  let badPrice = 0;
  for (const id in g.world.market.goods) {
    const s = g.world.market.goods[id];
    if (!Number.isFinite(s.price) || s.price <= 0) badPrice++;
  }
  return { bad, badPrice, worstClose, turn: g.world.turn };
});
log(`  tur ${invariants.turn}`);
log(`  ihlal: ${invariants.bad.length}${invariants.bad.length ? ` → ${invariants.bad.slice(0, 6).join(', ')}` : ''}`);
log(`  gecersiz fiyat: ${invariants.badPrice}`);
log(`  hazine kapanisi en kotu sapma: ${(invariants.worstClose * 100).toFixed(2)}%`);

head('KONSOL');
log(`  hata sayisi: ${errors.length}`);
for (const e of errors.slice(0, 10)) log(`    ${e}`);

await browser.close();
process.exit(errors.length || invariants.bad.length || invariants.badPrice ? 1 : 0);
