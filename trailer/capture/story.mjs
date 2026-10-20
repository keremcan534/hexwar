// Fragmanın hikâyesini GERÇEK oyunda oynar ve her durakta görüntü toplar.
//
//   node capture/story.mjs                      # hepsi (~25 dk)
//   node capture/story.mjs --only stills,war    # yalnız bu bölümlerin görüntüsü
//
// --only yalnız YAKALAMAYI atlar; oyun durumu her zaman aynı kronolojiyle
// ilerler (newWorld + endTurn deterministik), böylece sayılar tutarlı kalır.
//
// Dünya: seed STEAM, oyuncu Lorania (42). Komşu Eldor (29) kömür eyaletlerini
// tutuyor. Akış: 60 hafta ısınma -> ekranlar -> Eldor dosyası -> arayüzden
// ilan (8 haftalık ültimatom) -> seferberlik + taarruz emri -> işgal ->
// Eldor'un barış teklifi -> "Accept terms" -> 16 hafta sonra kömür hesabı.
//
// Çıktı: footage/stills/*.png (2x arayüz fotoğrafları), footage/<çekim>/
// kare dizileri (1x harita), footage/meta.json (gerçek sayılar + ekran
// dikdörtgenleri; kompozitör odak maskelerini buradan alır).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openGame, sleep } from "./session.mjs";
import { MAP_SHOTS, WAR_SHOTS } from "./mapShots.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "footage");
const ME = 42, FOE = 29, SEED = "STEAM", WARMUP = 60;
const oi = process.argv.indexOf("--only");
const only = (oi > 0 ? process.argv[oi + 1] : "").split(",").filter(Boolean);
const want = (k) => !only.length || only.includes(k);

mkdirSync(join(OUT, "stills"), { recursive: true });
const metaPath = join(OUT, "meta.json");
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
const saveMeta = () => writeFileSync(metaPath, JSON.stringify(meta, null, 1));

const b = await openGame({ seed: SEED });
const ev = (code) => b.evaluate(code);
const dpr = (s) => b.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: s, mobile: false });
const jpg = () => b.shot({ format: "jpeg", quality: 94 });
const pad = (f) => String(f).padStart(4, "0");
const ctxArg = `{ ME: ${ME}, FOE: ${FOE}, CAP, game, S }`;
const clearSel = () => ev(`game.selected = null; game.hovered = null; game.selectUnits([]); game.selectGeneral(null);`);
const snap = async (tag) => { const s = await ev(`S.snapshot(${ME}, ${FOE})`); meta.coal ??= {}; meta.coal[tag] = s; saveMeta(); console.log(tag, JSON.stringify(s)); return s; };
const openScreen = (s) => ev(`document.querySelector('#tab-bar button[data-screen=${s}]').click()`);
const closeScreen = () => ev(`document.querySelector('#screen-close')?.click()`);
const mapSetup = (mode, layers) => ev(`CAP.chrome('none'); CAP.mapMode('${mode}'); CAP.layers(${JSON.stringify(layers ?? { grid: false, country: true, province: true, labels: true })}); CAP.startClock();`);

let SECTION = "";

async function still(name, { settle = 900, rects = {} } = {}) {
  if (!want(SECTION)) return;
  await sleep(settle);
  const r = {};
  for (const [k, expr] of Object.entries(rects)) r[k] = await ev(expr);
  writeFileSync(join(OUT, "stills", `${name}.png`), await b.shot({ format: "png" }));
  meta.stills ??= {};
  meta.stills[name] = { rects: r, turn: await ev("game.world.turn"), date: await ev("document.querySelector('#hud-header')?.innerText.match(/\\d+ [A-Z]+ \\d{4}/)?.[0] ?? null") };
  saveMeta();
  console.log("still", name, JSON.stringify(r).slice(0, 140));
}

// Harita çekimi: kare dizisi, her karede sanal saat 1/60 sn ilerler.
async function mapShot(name) {
  if (!want(SECTION)) return;
  const spec = MAP_SHOTS[name];
  const dir = join(OUT, name); mkdirSync(dir, { recursive: true });
  await clearSel();
  await mapSetup(spec.mode ?? "political", spec.layers);
  const n = spec.frames, track = [];
  for (let f = 0; f < n; f++) {
    await ev(`(() => { const p = (${spec.camera.toString()})(${f}, ${n}, ${ctxArg}); CAP.camera(p.x, p.y, p.z); CAP.tick(); })()`);
    if (spec.track) track.push(await ev(`(${spec.track.toString()})(${ctxArg})`));
    writeFileSync(join(dir, `${pad(f)}.jpg`), await jpg());
  }
  meta.shots ??= {}; meta.shots[name] = { frames: n, track: spec.track ? track : undefined };
  saveMeta();
  console.log("map", name, n);
}

// ---------------------------------------------------------------- kurulum
await ev(`(() => { game.setPlayerNation(${ME}); S.quiet(); document.querySelector('#nation-picker [data-play]')?.click(); menu?.close?.(); game.setSpeed(0); })()`);
await sleep(1500);

// Açılış: Ocak 1836, ısınmadan önce.
SECTION = "opening";
await mapShot("ocean_open");
await mapShot("land_reveal_geo");
await mapShot("land_reveal_pol");

await ev(`(() => { for (let i = 0; i < ${WARMUP}; i++) game.endTurn(); game.setSpeed(0); game.requestRender(); })()`);
await snap("prewar");

SECTION = "prewar";
await mapShot("lorania_intro");
await mapShot("coal_reveal");

// Bayraklar (savaş kartı için), oyunun kendi bayrak çizicisinden.
SECTION = "flags";
if (want("flags")) {
  const flags = await ev(`(async () => { const F = await import('/src/render/flagPainter.js'); const w = game.world; return { me: F.flagDataUrl(w.nations[${ME}], 960, 640), foe: F.flagDataUrl(w.nations[${FOE}], 960, 640), names: [w.nations[${ME}].name, w.nations[${FOE}].name] }; })()`);
  for (const k of ["me", "foe"]) writeFileSync(join(OUT, "stills", `flag_${k}.png`), Buffer.from(flags[k].split(",")[1], "base64"));
  meta.names = flags.names; saveMeta();
}

// ---------------------------------------------------------------- ekranlar
SECTION = "stills";
await ev(`CAP.chrome('hud')`);
await dpr(2); await sleep(800);
await ev(`window.dispatchEvent(new Event('resize')); game.emit('player', ${ME});`); await sleep(500);
await still("hud_map", { rects: { header: `CAP.rect('#hud-header')` } });

await openScreen("industry");
await still("industry", { rects: {
  arms: `(() => { const el=[...document.querySelectorAll('#screen *')].find(e=>e.children.length===0&&/^Arms Industry$/.test(e.textContent.trim())); const row=el?.closest('[class*=row],[class*=card],li,article')??el; return CAP.rect(row); })()`,
  coal: `(() => { const els=[...document.querySelectorAll('#screen *')].filter(e=>e.children.length===0&&e.textContent.trim()==='Coal'); return els.map(e=>CAP.rect(e)); })()`,
} });
await closeScreen();

const tradeRects = {
  coalRow: `CAP.rect('[data-trade-good=coal]')`,
  labels: `(() => { const o={}; for (const k of ['Produced','Imported','Unmet demand','Coverage','Demand','Exported']) { const e=[...document.querySelectorAll('#screen *')].find(x=>x.children.length===0&&x.textContent.trim()===k); if(e){ const v=e.nextElementSibling; o[k]={label:CAP.rect(e), value:v?CAP.rect(v):null, text:v?.textContent.trim()}; } } return o; })()`,
  why: `(() => { const e=[...document.querySelectorAll('#screen li')].find(x=>/covers/.test(x.textContent)); return e?{r:CAP.rect(e),t:e.textContent.trim()}:null; })()`,
  chart: `(() => { const e=[...document.querySelectorAll('#screen svg, #screen canvas')].find(x=>x.getBoundingClientRect().width>150); return e?CAP.rect(e):null; })()`,
};
await openScreen("trade");
await sleep(600);
await ev(`document.querySelector('[data-trade-good=coal]')?.click()`);
await still("trade_coal", { rects: tradeRects });
await closeScreen();

await openScreen("construction");
await still("construction", { rects: {
  short: `(() => { const e=[...document.querySelectorAll('#screen *')].find(x=>x.children.length===0&&/short by/.test(x.textContent)); return e?{r:CAP.rect(e),t:e.textContent.trim()}:null; })()`,
  nothing: `CAP.rectByText('Nothing is being built')`,
} });
await closeScreen();
for (const s of ["budget", "politics", "technology", "population", "military"]) {
  await openScreen(s); await still(s); await closeScreen();
}

// Eldor dosyası; ilan düğmesine iki kez basılır — oyuncunun yaptığı gibi.
// Yakalama atlansa bile ilan HER ZAMAN aynı yoldan yapılır.
await ev(`game.emit('nation', ${FOE})`);
await sleep(600);
await still("dossier", { rects: {
  strength: `(() => { const e=[...document.querySelectorAll('#screen *')].find(x=>x.children.length===0&&x.textContent.trim()==='Relative strength'); return CAP.rect(e?.parentElement); })()`,
  produces: `(() => { const e=[...document.querySelectorAll('#screen *')].find(x=>x.children.length===0&&/^produces$/i.test(x.textContent.trim())); return CAP.rect(e?.parentElement); })()`,
  war: `CAP.rect('#screen [data-war]')`,
} });
await ev(`document.querySelector('#screen [data-war]')?.click()`);
await still("dossier_confirm", { rects: { war: `CAP.rect('#screen [data-war]')`, text: `document.querySelector('#screen [data-war]')?.textContent.trim()` } });
await ev(`document.querySelector('#screen [data-war]')?.click()`);
await sleep(300);
await closeScreen();
await still("ultimatum_hud", { rects: { header: `CAP.rect('#hud-header')`, warbar: `CAP.rect('#war-bar')` } });
await dpr(1); await sleep(800);
meta.declared = await ev(`({ turn: game.world.turn, crisis: S.mods.D.inCrisis(game.world, ${ME}, ${FOE}), atWar: S.mods.D.atWar(game.world, ${ME}, ${FOE}), foeCoal: S.coalProvincesOf(game.world, ${FOE}).map(p => [p.id, p.name ?? null]) })`);
saveMeta();
console.log("declared", JSON.stringify(meta.declared));
if (!meta.declared.crisis && !meta.declared.atWar) throw new Error("ilan başarısız");

// ---------------------------------------------------------------- savaş
SECTION = "war";
await ev(`game.toggleMobilization()`);
let guard = 0;
while (!(await ev(`S.mods.D.atWar(game.world, ${ME}, ${FOE})`))) { await ev(`game.endTurn()`); if (++guard > 12) throw new Error("savaş başlamadı"); }
await snap("warstart");
meta.war = { startTurn: await ev("game.world.turn"), weeks: [] };

const lastShotWeek = Math.max(...Object.values(WAR_SHOTS).map((x) => x.w1));
const st = {};
for (const [k, s] of Object.entries(WAR_SHOTS)) { st[k] = { f: 0, n: (s.w1 - s.w0) * s.fpw }; if (want("war")) mkdirSync(join(OUT, k), { recursive: true }); }
let offer = null;
for (let w = 0; w < 50; w++) {
  // Haftanın emri: generaller taarruzda, hedef Eldor.
  await ev(`S.pushOffensive(${ME}, ${FOE})`);
  for (const [k, s] of Object.entries(WAR_SHOTS)) {
    if (!want("war") || w < s.w0 || w >= s.w1) continue;
    await clearSel();
    await mapSetup("political");
    if (s.selectGeneral) await ev(`(() => { const C = S.mods.C; const gs = C.officersOf(game.world.nations[${ME}], 'army').sort((a, b) => C.divisionsOf(game.world, b).length - C.divisionsOf(game.world, a).length); game.selectGeneral(gs[0]); })()`);
    for (let i = 0; i < s.fpw; i++, st[k].f++) {
      await ev(`(() => { const p = (${s.camera.toString()})(${st[k].f}, ${st[k].n}, ${ctxArg}); CAP.camera(p.x, p.y, p.z); CAP.tick(); })()`);
      writeFileSync(join(OUT, k, `${pad(st[k].f)}.jpg`), await jpg());
    }
  }
  await clearSel();
  await ev(`game.endTurn()`);
  const s = await ev(`S.snapshot(${ME}, ${FOE})`);
  const offers = await ev(`(game.peaceOffers ?? []).filter(o => o.from === ${FOE} && o.to === ${ME}).map(o => ({ id: o.id, offer: o.offer }))`);
  meta.war.weeks.push({ w, turn: s.turn, warScore: s.warScore, offers: offers.length });
  if (offers.length && w >= lastShotWeek - 1) { offer = offers[0]; break; }
}
if (want("war")) for (const k of Object.keys(WAR_SHOTS)) { meta.shots ??= {}; meta.shots[k] = { frames: st[k].f, fpw: WAR_SHOTS[k].fpw, w0: WAR_SHOTS[k].w0 }; }
meta.war.offer = offer; saveMeta();
console.log("offer", JSON.stringify(offer), "weeks", meta.war.weeks.length);
if (!offer) throw new Error("barış teklifi gelmedi");

// ---------------------------------------------------------------- barış
SECTION = "peace";
await ev(`CAP.chrome('hud')`);
await dpr(2); await sleep(800);
await ev(`game.selected = null; document.querySelector('#war-bar [data-war-target]')?.click()`);
await still("peace_offer", { settle: 1200, rects: {
  cede: `(() => { const e=[...document.querySelectorAll('#screen *')].find(x=>x.children.length===0&&/cede/i.test(x.textContent)); return e?{r:CAP.rect(e.parentElement),t:e.parentElement.textContent.replace(/\\s+/g,' ').trim()}:null; })()`,
  accept: `(() => { const e=[...document.querySelectorAll('#screen button')].find(x=>/Accept terms/.test(x.textContent)); return CAP.rect(e); })()`,
  proposes: `(() => { const e=[...document.querySelectorAll('#screen *')].find(x=>x.children.length===0&&/PROPOSES PEACE/i.test(x.textContent)); return e?{r:CAP.rect(e.parentElement),t:e.parentElement.textContent.replace(/\\s+/g,' ').trim()}:null; })()`,
  warbar: `CAP.rect('#war-bar')`,
} });
await closeScreen();
await dpr(1); await sleep(800);

// İlhak: aynı kesintisiz çekimde "Accept terms" tıklanır, harita el değiştirir.
SECTION = "annex";
const ANNEX_PRE = 120, ANNEX_POST = 200, annexTotal = ANNEX_PRE + ANNEX_POST;
if (want("annex")) mkdirSync(join(OUT, "annex"), { recursive: true });
await clearSel();
await mapSetup("political");
const annexCam = (f, n, { CAP }) => {
  const c = CAP.provinceCenter(131); const o = (t) => 1 - Math.pow(1 - t, 2);
  const t = o(f / (n - 1));
  return { x: c.x - 30 + 60 * t, y: c.y + 20, z: 1.5 - 0.25 * t };
};
for (let f = 0; f < annexTotal; f++) {
  if (f === ANNEX_PRE) {
    // Oyuncunun düğmesi: masa açılır, "Accept terms" tıklanır (ekran CSS ile gizli).
    await ev(`document.querySelector('#war-bar [data-war-target]')?.click()`);
    await sleep(300);
    const ok = await ev(`(() => { const e=[...document.querySelectorAll('#screen button')].find(x=>/Accept terms/.test(x.textContent)); if (!e) return false; e.click(); return true; })()`);
    await ev(`document.querySelector('#screen-close')?.click(); game.selected = null; game.renderer.invalidateCache();`);
    meta.annexClick = { frame: f, ok }; saveMeta();
    console.log("accept clicked", ok);
    if (!ok) throw new Error("Accept terms bulunamadı");
  }
  if (want("annex")) {
    await ev(`(() => { const p = (${annexCam.toString()})(${f}, ${annexTotal}, ${ctxArg}); CAP.camera(p.x, p.y, p.z); CAP.tick(); })()`);
    writeFileSync(join(OUT, "annex", `${pad(f)}.jpg`), await jpg());
  }
}
if (want("annex")) { meta.shots ??= {}; meta.shots.annex = { frames: annexTotal, click: ANNEX_PRE }; saveMeta(); }
await snap("peace");
meta.peaceTurn = await ev("game.world.turn");
meta.ceded = await ev(`S.coalProvincesOf(game.world, ${ME}).map(p => [p.id, p.name ?? null])`);

// ---------------------------------------------------------------- sonrası
meta.after = [];
for (let w = 1; w <= 16; w++) {
  await ev(`game.endTurn()`);
  meta.after.push(await ev(`S.snapshot(${ME}, ${FOE})`));
}
saveMeta();
await snap("after16");

SECTION = "after";
await mapShot("coal_after");
await mapShot("coast_fast");
await ev(`CAP.chrome('hud')`);
await dpr(2); await sleep(800);
await openScreen("trade"); await sleep(600);
await ev(`document.querySelector('[data-trade-good=coal]')?.click()`);
await still("trade_coal_after", { rects: tradeRects });
await closeScreen();
await openScreen("industry"); await still("industry_after"); await closeScreen();
await openScreen("technology"); await still("technology_after"); await closeScreen();
await openScreen("population"); await still("population_after"); await closeScreen();
await dpr(1); await sleep(800);

SECTION = "final";
await mapShot("final_world");

console.log("tamam");
await b.close();
process.exit(0);
