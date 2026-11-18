// Dalga tayfı: JONSWAP + yönsel yayılım → başlangıç genlikleri h0(k).
//
// Bu dosya DOM ve GL bilmez; Node'da ölçülebilir kalsın diye yalnız sayı üretir.
// Rastgelelik simülasyonun zarından AYRIDIR: kendi küçük üreteci vardır, oyunun
// determinizmine temas etmez.

export const G = 9.81;
/** Bir dünya biriminin metre karşılığı: yakın zoomda ekran ≈ 1 km genişlik. */
export const METERS_PER_UNIT = 2;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: iki bağımsız standart normal. */
function gauss(rng) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** cos^2s(θ/2) yayılımının normu: ∫ D dθ = 1. */
function spreadNorm(s) {
  return Math.exp(logGamma(s + 1) - logGamma(s + 0.5)) / (2 * Math.sqrt(Math.PI));
}

/** JONSWAP S(ω), m²·s. */
export function jonswap(omega, { wind, fetch, gamma = 3.3 }) {
  if (omega <= 1e-4) return 0;
  const X = (G * fetch) / (wind * wind);
  const alpha = 0.076 * X ** -0.22;
  const wp = peakOmega({ wind, fetch });
  const sigma = omega <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((omega - wp) ** 2) / (2 * sigma * sigma * wp * wp));
  return alpha * G * G * omega ** -5 * Math.exp(-1.25 * (wp / omega) ** 4) * gamma ** r;
}

/** Hasselmann 1973: ωp = 22 (g² / (U F))^⅓. */
export function peakOmega({ wind, fetch }) {
  return 22 * Math.cbrt((G * G) / (wind * fetch));
}

/** Hasselmann yayılımı: tepede dar, kuyrukta geniş. */
function spreadS(omega, wp, wind) {
  const r = omega / wp;
  const s = r < 1.05
    ? 6.97 * r ** 4.06
    : 9.77 * r ** (-2.33 - 1.45 * ((wind * wp) / G - 1.17));
  return Math.max(1.5, Math.min(24, s));
}

/**
 * İki deniz durumu üst üste: rüzgâr denizi + uzaktan gelen uzun ölü dalga.
 * Tek sistem "taranmış" okunur; gerçek denizde neredeyse her zaman iki yön var.
 */
export const SEA_STATES = [
  { wind: 10.5, fetch: 180000, gamma: 3.3, dir: 0.46, gain: 1 },
  { wind: 6.5, fetch: 500000, gamma: 6, dir: 1.05, gain: 0.3, swell: true },
];

/** Bir kk hücresinin yoğunluğu S(kx,kz), m⁴. */
function density(kx, kz, states) {
  const k = Math.hypot(kx, kz);
  if (k < 1e-6) return 0;
  const omega = Math.sqrt(G * k);
  const dwdk = G / (2 * omega);
  const theta = Math.atan2(kz, kx);
  let sum = 0;
  for (const st of states) {
    const wp = peakOmega(st);
    const s = st.swell ? 18 : spreadS(omega, wp, st.wind);
    const d = Math.abs(Math.cos((theta - st.dir) / 2)) ** (2 * s) * spreadNorm(s);
    sum += st.gain * jonswap(omega, st) * d;
  }
  return (sum * dwdk) / k;
}

/**
 * h0(k) ve eşlenik h0*(−k), RGBA32F satır düzeninde.
 *
 * @param N      ızgara (2'nin kuvveti)
 * @param L      karo boyu (metre)
 * @param kMin,kMax  bu kaskadın dalga sayısı bandı: bantlar örtüşmez, yoksa
 *                   iki kaskadın ortak bandı iki kez sayılır ve deniz sertleşir
 */
export function buildH0(N, L, kMin, kMax, seed, states = SEA_STATES) {
  const rng = mulberry(seed);
  const dk = (2 * Math.PI) / L;
  const hk = new Float32Array(N * N * 2);
  for (let y = 0; y < N; y++) {
    const nz = y < N / 2 ? y : y - N;
    for (let x = 0; x < N; x++) {
      const nx = x < N / 2 ? x : x - N;
      const [a, b] = gauss(rng);
      const kx = nx * dk;
      const kz = nz * dk;
      const k = Math.hypot(kx, kz);
      // Nyquist satırı eşleniksiz kalır: gerçek alan bozulur.
      if (k < kMin || k >= kMax || x === N / 2 || y === N / 2) continue;
      const amp = Math.sqrt((density(kx, kz, states) * dk * dk) / 2) / Math.SQRT2;
      const i = (y * N + x) * 2;
      hk[i] = a * amp;
      hk[i + 1] = b * amp;
    }
  }
  const out = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    const my = (N - y) % N;
    for (let x = 0; x < N; x++) {
      const mx = (N - x) % N;
      const i = (y * N + x) * 2;
      const m = (my * N + mx) * 2;
      const p = (y * N + x) * 4;
      out[p] = hk[i];
      out[p + 1] = hk[i + 1];
      out[p + 2] = hk[m];
      out[p + 3] = -hk[m + 1];
    }
  }
  return out;
}
