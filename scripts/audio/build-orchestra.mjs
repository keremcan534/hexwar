// Dinamik müziğin örneklerini üretir: assets/audio/orchestra/*.ogg + bank.json
//
//   node scripts/audio/build-orchestra.mjs
//
// Kaynaklar (ikisi de CC0, ticari kullanım serbest, atıf gerekmez):
//   VSCO 2 Community Edition (Versilian Studios), github.com/sgossner/VSCO-2-CE — davullar, solo keman
//   Karoryfer Lecolds, github.com/sfzinstruments — Black And Green Guitars
//     (Hofner Club + Gretsch Anniversary, Brian Wood) ve Black And Blue Basses
//   VCSL (Versilian Community Sample Library), github.com/sgossner/VCSL — Steinway B piyano
// Kütüphanelerin tamamı ~6 GB; burada yalnız partisyonun çaldığı notalar alınır.
// Piyano notaları ~25 sn sürer ama 6-7 sn'si kullanılır: dosyanın yalnız ilk
// 8 sn'si HTTP Range ile indirilir (290 MB yerine ~100 MB) ve WAV başlığındaki
// uzunluklar kesilen boya göre düzeltilir.
// Ham WAV önbelleği scripts/audit/_tmp/audio/vsco/ (gitignore); ffmpeg gerekir.
//
// Her örnek için: baştaki sessizlik tepeden 40 dB aşağıda kesilir (vuruş
// zamanı kayınca riff aksar), enstrüman grubu birlikte normalize edilir
// (hafif katman hafif kalsın), kuyruk söndürülür, Vorbis q3.
//
// Adlandırma: VSCO'da C3 = MIDI 60; Karoryfer'de "e3" = MIDI 40 (sfz
// pitch_keycenter), yani MIDI = oktav × 12 + perde sınıfı. Kök perdeler
// adlardan değil ÖLÇÜMDEN: aynı akorda çalan iki kayıt birkaç sent ayrışırsa
// akor bulanır. VSCO kökleri elle ölçülüp yazıldı; Karoryfer kökleri burada,
// adın ±0.7 yarım ses çevresinde özilintiyle ölçülür (Hofner kayıtları
// adlarından 0.05-0.3 yarım ses tiz: gerçek gitarın akordu).
//
// Pirinç, yaylılar ve ziller 2026-10-22'de Kerem'in kulağıyla çıkarıldı ("mobil
// oyun hissi", "zil işe yaramıyor"), örs de ("ting ting"). Gitar önce tel modeliyle (Karplus-Strong)
// sentezlendi, "testere sesi / hâlâ yapay" denince gerçek kayda geçildi.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE = "scripts/audit/_tmp/audio/vsco";
const OUT = "assets/audio/orchestra";
const VSCO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/";
const GTR = "https://raw.githubusercontent.com/sfzinstruments/karoryfer.black-and-green-guitars/main/";
const BASS = "https://raw.githubusercontent.com/sfzinstruments/karoryfer.black-and-blue-basses/main/";
const VCSL = "https://raw.githubusercontent.com/sgossner/VCSL/master/";

const PCS = "c db d eb e f gb g ab a bb b".split(" ");
const kname = (m) => `${PCS[m % 12]}${Math.floor(m / 12)}`;
const rrs = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Karoryfer notaları: her nota × her tekrar; kök adından tahmin, sonra ölçülür. */
const kar = (notes, rr, file) => notes.flatMap((m) => rrs(rr).map((r) => [file(kname(m), r), m, 1, true]));

// Mi minör. Ritim gitarı power chord'ları (kök, beşli, oktav) 40-51 aralığında:
// E 40, Am 45, B 47, C 48, D 50 — kayıtlar E2'den başlar, kaydırma gerekmez.
const RHYTHM = [40, 45, 47, 48, 50, 52, 54, 55, 57, 59, 60, 62];
// Lead teması ve bir oktav altı (armonik minör, Re# yeden).
const LEAD = [57, 59, 60, 62, 63, 64, 66, 67, 69, 71, 72, 74, 75, 76, 78, 79];
// Bas kökleri: E1, A1, B1, C2, D2.
const BASS_ROOTS = [28, 33, 35, 36, 38];
// Solo keman: [MIDI, bilimsel ad]. Kayıtlar 2-4 yarım seste bir; barış
// melodisi 71-81 arasında, en çok 2 yarım ses kaydırılır.
const VIOLIN = [[64, "E4"], [67, "G4"], [69, "A4"], [72, "C5"], [76, "E5"], [79, "G5"], [81, "A5"], [84, "C6"]];
// Steinway B: tam ses aralıklı (en çok 1 yarım ses kaydırma). Melodi/akor
// aralığı E3-C6 hafif (vl2) + orta (vl3); alçak "kıyamet" notaları E1-D3 orta.
const SCI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const sci = (n) => { const m = /^([A-G]#?)(-?\d)$/.exec(n); return (Number(m[2]) + 1) * 12 + SCI[m[1]]; };
const PIANO_MEL = ["E3", "F#3", "G#3", "A#3", "C4", "D4", "E4", "F#4", "G#4", "A#4", "C5", "D5", "E5", "F#5", "G#5", "A#5", "C6"];
const PIANO_LOW = ["E1", "C2", "D2", "E2", "F#2", "G#2", "A#2", "C3", "D3"];
const steinway = (n, vl) => [`JHPiano_Sus_Close_${n}_vl${vl}_rr1.wav`, sci(n), vl === 2 ? 0 : 1, true];

// [enstrüman, saklanan sn, kaynak, klasör, [[dosya, kök MIDI | null, katman, ölç?], ...], seçenek]
// katman: 0 hafif, 1 güçlü, 2 en güçlü (yalnız final). seçenek.head: yalnız ilk N sn indir.
// seçenek.mono: kaynak tek kanal (Karoryfer DI): stereo yazmak çözülünce belleği boşa ikiye katlar.
// Bellek: bütün örnekler çözülünce ~280 MB'tı (44.1 kHz, hepsi stereo); oyunda tek bağlam,
// tembel çözme ve 32 kHz ile birlikte bu yüzden piyano 4.5, keman 5.5 sn saklanır.
const SPEC = [
  ["bdrum", 4, VSCO, "Percussion", [
    ["BDrumNewhit_v7_rr1_Sum.wav", null, 1], ["BDrumNewhit_v7_rr2_Sum.wav", null, 1],
    ["BDrumNewhit_v5_rr1_Sum.wav", null, 0], ["BDrumNewhit_v5_rr2_Sum.wav", null, 0]]],
  ["taiko", 1.6, VSCO, "VSCO 1 Percussion/drums/other/ethnic/giant/mallet", [
    ["EthnicLargeMallet_hit_ff_1.wav", null, 1], ["EthnicLargeMallet_hit_ff_2.wav", null, 1],
    ["EthnicLargeMallet_hit_f_1.wav", null, 1], ["EthnicLargeMallet_hit_mf_1.wav", null, 0]]],
  ["taikoHi", 1.4, VSCO, "VSCO 1 Percussion/drums/other/ethnic/giant/sticks", [
    ["EthnicLargeSticks_hit_fff_1.wav", null, 1], ["EthnicLargeSticks_hit_f_1.wav", null, 1],
    ["EthnicLargeSticks_hit_f_2.wav", null, 1], ["EthnicLargeSticks_hit_mf_1.wav", null, 0]]],
  // Konser trampeti (teller açık), tek tek vuruş: rock/endüstriyel backbeat'in gövdesi.
  // Sahra trampeti çıktı — askerî süs vuruşları "Müttefik ordusu" gibi duyuluyordu.
  ["snare", 1.4, VSCO, "Percussion", [
    ["Snare2-HitSN_v9_rr1_Sum.wav", null, 2], ["Snare2-HitSN_v9_rr2_Sum.wav", null, 2],
    ["Snare2-HitSN_v7_rr1_Sum.wav", null, 1], ["Snare2-HitSN_v7_rr2_Sum.wav", null, 1],
    ["Snare2-HitSN_v5_rr1_Sum.wav", null, 0], ["Snare2-HitSN_v5_rr2_Sum.wav", null, 0]]],
  // Timpani kökleri spektrumun ana modundan (1,1); oranlar 1 : 1.5 : 2.
  ["timp", 4, VSCO, "Percussion/Timpani", [
    ["Timpani1_Hit_v3_rr1_Sum.wav", 41.5, 1], ["Timpani2_Hit_v3_rr1_Sum.wav", 46.8, 0],
    ["Timpani2_Hit_v4_rr1_Sum.wav", 46.8, 1], ["Timpani3_Hit_v3_rr1_Sum.wav", 49.5, 0],
    ["Timpani3_Hit_v4_rr1_Sum.wav", 49.5, 1], ["Timpani5_Hit_v3_rr1_Sum.wav", 54.6, 1]]],
  // Ritim gitarı: Hofner, dört ayrı çalım. Sol ve sağ kanal farklı çalımı
  // alır — gerçek çift kayıt; duvar iki ayrı çalımdan doğar.
  ["gtr", 3.2, GTR, "Samples/black/ord", kar(RHYTHM, 4, (n, r) => `twang_${n}_f_rr${r}.wav`), { mono: true }],
  // Palm mute yerine kütüphanenin kısa (staccato) çalımı: E5 çugunun telleri.
  ["gtrMute", 0.6, GTR, "Samples/black/stac", kar([40, 47, 52], 4, (n, r) => `staccato_${n}_rr${r}.wav`), { mono: true }],
  // Lead: Gretsch, uzun sustain.
  ["lead", 3.5, GTR, "Samples/green/ord", kar(LEAD, 2, (n, r) => `twang_${n}_f_rr${r}.wav`), { mono: true }],
  ["bass", 3.2, BASS, "Samples/darkblack/reg", kar(BASS_ROOTS, 2, (n, r) => `darkblack_${n}_f_rr${r}.wav`), { mono: true }],
  ["bassMute", 0.8, BASS, "Samples/darkblack/stac", kar([28], 4, (n, r) => `darkblack_${n}_stac_rr${r}.wav`), { mono: true }],
  // Solo keman (barış/gerilim): vibratolu uzun nota, hafif (p) ve güçlü (f).
  // Bu klasörde adlar BİLİMSEL (C4 = MIDI 60), VSCO'nun geri kalanından bir
  // oktav farklı — ölçümle bulundu; tremolo klasörü VSCO düzenindedir.
  ["vln", 5.5, VSCO, "Strings/Solo Violin/Arco Vib", VIOLIN.flatMap(([m, n]) => [
    [`LLVln_ArcoVib_${n}_p.wav`, m, 0, true], [`LLVln_ArcoVib_${n}_f.wav`, m, 1, true]])],
  ["vlnTrem", 6, VSCO, "Strings/Solo Violin/Trem", VIOLIN.filter(([m]) => m <= 81).map(([m, n]) => [
    `LLVln_trem_${n.replace(/\d/, (o) => o - 1)}_v2_rr1.wav`, m, 1, true])],
  ["piano", 4.5, VCSL, "Chordophones/Zithers/Grand Piano, Steinway B/Sus",
    PIANO_MEL.flatMap((n) => [steinway(n, 2), steinway(n, 3)]), { head: 8 }],
  ["pianoLow", 7, VCSL, "Chordophones/Zithers/Grand Piano, Steinway B/Sus",
    PIANO_LOW.map((n) => steinway(n, 3)), { head: 8 }],
];

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr.slice(-800));
  return r.stderr;
}

/** Tek kanal float PCM (ffmpeg ile çözülür). */
function pcm(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-i", file, "-ac", "1", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(String(r.stderr).slice(-400));
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 2);
}

/**
 * Perde: vuruştan 60 ms sonra 300 ms'lik pencerede, beklenen periyodun ±0.7
 * yarım ses çevresinde normalize özilinti tepesi (parabolik ara değer).
 * Beklenen perde bilindiği için oktav hatasına düşmez.
 */
function measureRoot(file, guess) {
  const x = pcm(file);
  const sr = 44100;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let on = 0;
  while (on < x.length && Math.abs(x[on]) < peak * 0.01) on++;
  const a = on + Math.round(0.06 * sr);
  const n = Math.min(Math.round(0.3 * sr), x.length - a - 2000);
  const f = 440 * 2 ** ((guess - 69) / 12);
  const lo = Math.floor(sr / (f * 2 ** (0.7 / 12)));
  const hi = Math.ceil(sr / (f * 2 ** (-0.7 / 12)));
  const ac = (lag) => {
    let s = 0, e0 = 0, e1 = 0;
    for (let i = a; i < a + n; i++) {
      s += x[i] * x[i + lag];
      e0 += x[i] * x[i];
      e1 += x[i + lag] * x[i + lag];
    }
    return s / Math.sqrt(e0 * e1 + 1e-12);
  };
  let best = lo, bv = -1;
  const vals = new Map();
  for (let L = lo - 1; L <= hi + 1; L++) vals.set(L, ac(L));
  for (let L = lo; L <= hi; L++) if (vals.get(L) > bv) { bv = vals.get(L); best = L; }
  const y0 = vals.get(best - 1), y1 = vals.get(best), y2 = vals.get(best + 1);
  const lag = best + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2 || 1);
  return +(69 + 12 * Math.log2(sr / lag / 440)).toFixed(2);
}

const maxVolume = (file) => Number(/max_volume:\s*(-?[\d.]+) dB/.exec(ffmpeg(["-i", file, "-af", "volumedetect", "-f", "null", "-"]))[1]);

/** WAV başlığı: biçim ve veri parçasının yeri (parçalar sırayla taranır). */
function wavLayout(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("WAV değil");
  let off = 12, fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { ch: buf.readUInt16LE(off + 10), sr: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") return { ...fmt, dataOff: off + 8, dataSize: size };
    off += 8 + size + (size & 1);
  }
  throw new Error("veri parçası ilk 64 KB'de yok");
}

async function fetchRaw(base, folder, name, headSec) {
  // VSCO önbelleği eski adlarıyla kalır; öbür depolar depo adıyla öneklenir.
  const prefix = base === VSCO ? "" : base.split("/")[4] + "__";
  const dest = join(CACHE, prefix + `${folder}/${name}`.replaceAll("/", "__"));
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  const url = base + `${folder}/${name}`.split("/").map(encodeURIComponent).join("/");
  if (!headSec) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  }
  const probe = await fetch(url, { headers: { Range: "bytes=0-65535" } });
  if (probe.status !== 206) throw new Error(`Range desteklenmiyor (${probe.status}) ${url}`);
  const w = wavLayout(Buffer.from(await probe.arrayBuffer()));
  const frame = (w.ch * w.bits) / 8;
  const want = Math.min(w.dataSize, Math.round(headSec * w.sr) * frame);
  const res = await fetch(url, { headers: { Range: `bytes=0-${w.dataOff + want - 1}` } });
  if (res.status !== 206) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Kesilen dosyanın RIFF ve data uzunlukları gerçek boya çekilir; yoksa ffmpeg
  // eksik veriyi bozuk sayar.
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.writeUInt32LE(buf.length - w.dataOff, w.dataOff - 4);
  writeFileSync(dest, buf);
  return dest;
}

mkdirSync(CACHE, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const bank = {};
let bytes = 0;
let fetched = 0;
for (const [inst, keep, base, folder, files, opt = {}] of SPEC) {
  const src = [];
  // Sırayla dört dört: GitHub ham sunucusu toplu isteği kısabiliyor.
  for (let i = 0; i < files.length; i += 4) {
    src.push(...(await Promise.all(files.slice(i, i + 4).map(([name]) => fetchRaw(base, folder, name, opt.head)))));
  }
  for (const f of src) fetched += statSync(f).size;
  const peaks = src.map(maxVolume);
  const gain = -1 - Math.max(...peaks);
  bank[inst] = files.map(([, guess, layer, measure], i) => {
    const root = measure ? measureRoot(src[i], guess) : guess;
    const f = `${inst}-${String(i + 1).padStart(2, "0")}.ogg`;
    const fade = Math.max(0.05, keep * 0.3);
    const chain = [
      `silenceremove=start_periods=1:start_threshold=${(peaks[i] - 40).toFixed(1)}dB:start_silence=0.004`,
      `atrim=0:${keep}`,
      `afade=t=out:st=${(keep - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
      `volume=${gain.toFixed(2)}dB`,
    ].join(",");
    ffmpeg(["-y", "-i", src[i], "-af", chain, "-ar", "44100", "-ac", opt.mono ? "1" : "2", "-c:a", "libvorbis", "-q:a", "3", join(OUT, f)]);
    bytes += statSync(join(OUT, f)).size;
    const entry = { f, layer };
    if (root != null) entry.root = root;
    return entry;
  });
  const off = bank[inst].filter((e, i) => files[i][3] && Math.abs(e.root - files[i][1]) > 0.15).length;
  console.log(`${inst.padEnd(9)} ${files.length} örnek, kazanç ${gain.toFixed(1)} dB${off ? `, adından >0.15 sapan kök ${off}` : ""}`);
}
writeFileSync(join(OUT, "bank.json"), JSON.stringify(bank, null, 1) + "\n");
console.log(`toplam ${(bytes / 1e6).toFixed(2)} MB → ${OUT} (ham önbellek kullanımı ${(fetched / 1e6).toFixed(1)} MB)`);
