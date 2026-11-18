// YAŞAYAN DÜNYA BAYRAKLARI — her katmanın aç/kapa anahtarı ve tek okuma noktası.
//
// Ayarlar penceresi başka dalda kuruluyor; o pencere yalnız LIVING_LAYERS'ı
// listeler, `livingFlags.set(key, on)` çağırır. Haritaya haber vermek bu
// dosyanın işi değildir: LivingWorld abone olur, önbelleği o geçersiz kılar.
//
// Katman notu: DOM'a dokunmaz; depolama yoksa (Node) bayraklar bellekte kalır.

const KEY = 'hexwar.living.v1';

/** Ayarlar ekranının okuyacağı liste: sıra ekrandaki sıradır. */
export const LIVING_LAYERS = [
  { key: 'seasons', label: 'Snow and autumn colours' },
  { key: 'seaIce', label: 'Frozen seas' },
  { key: 'clouds', label: 'Cloud shadows' },
  { key: 'fronts', label: 'Rain and snow fronts' },
  { key: 'cities', label: 'City models' },
  { key: 'smoke', label: 'Factory smoke' },
  { key: 'nightLights', label: 'Night and city lights' },
  { key: 'ships', label: 'Merchant ships' },
  { key: 'trains', label: 'Railways and trains' },
];

function readStored() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

/** `?living=0` hepsini, `?livingOff=ships,trains` seçilenleri bu oturumda kapatır. */
function readUrl() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    return { master: q.get('living') !== '0', off: new Set((q.get('livingOff') ?? '').split(',').filter(Boolean)) };
  } catch {
    return { master: true, off: new Set() };
  }
}

class LivingFlags {
  constructor() {
    this.state = readStored();
    this.url = readUrl();
    this.listeners = new Set();
  }

  /** Bütün katmanların ortak anahtarı. */
  get master() {
    return this.url.master && this.state.master !== false;
  }

  /** Katman açık mı? Varsayılan hepsi açık. */
  on(key) {
    return this.master && !this.url.off.has(key) && this.state[key] !== false;
  }

  /** Kaydedilen tercih (URL geçersiz kılmaları hariç): ayar kutusunun değeri. */
  stored(key) {
    return this.state[key] !== false;
  }

  set(key, value) {
    this.state[key] = !!value;
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.state));
    } catch { /* depolama kapalıysa tercih yalnız bu oturumda yaşar */ }
    for (const fn of this.listeners) fn(key, !!value);
  }

  /** Değişimi dinler; dönen işlev aboneliği bırakır. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const livingFlags = new LivingFlags();
