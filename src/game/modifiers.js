// ULUSAL DEĞİŞTİRİCİLER — teknoloji, danışman, iktidar partisi, hükûmet
// biçimi, olay/gündem etkileri TEK toplama yazılır (HOI4 "modifier" kalıbı).
//
// Neden tek toplam: eskiden her sistem kendi çarpanını kendi yerinde
// tutuyordu (techMods, lawModifiers, societyModifiers...) ve aynı anahtar üç
// ayrı yerde farklı adla okunuyordu. Burada anahtar bir kez tanımlanır,
// okuyucusu yanına yazılır; okuyucusu olmayan anahtar tabloya girmez.
//
// Değerler TOPLANIR. Yüzde anahtarları kesir olarak yazılır (0.1 = +%10).
// Kaynaklar: `nation.mods` haftalık `refreshModifiers` ile kurulur ve KAYDA
// GİRMEZ (kaynaklar kayıtta, toplam türetilir).

/**
 * Anahtar → { okuyucu, ekran etiketi, biçim }. Biçim: 'pct' yüzde, 'pts'
 * puan (istikrar/savaş desteği 0-100 ölçeğinde), 'num' düz sayı.
 */
export const MODIFIER_KEYS = {
  ic: { label: 'Industrial capacity', format: 'pct' }, // econ/industry
  lineEfficiency: { label: 'Production efficiency cap', format: 'pct' }, // econ/industry
  lineGain: { label: 'Production efficiency growth', format: 'pct' }, // econ/industry
  consumerNeed: { label: 'Consumer goods need', format: 'pct' }, // econ/industry
  food: { label: 'Food output', format: 'pct' }, // econ/resources
  resources: { label: 'Deposit output', format: 'pct' }, // econ/resources
  tax: { label: 'Tax income', format: 'pct' }, // economy
  exportIncome: { label: 'Export income', format: 'pct' }, // econ/trade
  importCost: { label: 'Import cost', format: 'pct' }, // econ/trade
  construction: { label: 'Construction speed', format: 'pct' }, // construction
  buildCost: { label: 'Building cost', format: 'pct' }, // construction
  developmentCap: { label: 'Development cap', format: 'num' }, // construction
  constructionSlots: { label: 'Construction slots', format: 'num' }, // construction
  growth: { label: 'Population growth', format: 'pct' }, // provinces
  literacy: { label: 'Literacy target', format: 'pct' }, // economy
  research: { label: 'Research speed', format: 'pct' }, // technology
  stability: { label: 'Stability', format: 'pts' }, // politics
  warSupport: { label: 'War support', format: 'pts' }, // politics
  power: { label: 'Political power', format: 'num' }, // politics
  lawCost: { label: 'Law change cost', format: 'pct' }, // politics
  unrest: { label: 'Unrest', format: 'pct' }, // culture
  assimilation: { label: 'Assimilation', format: 'pct' }, // culture
  manpower: { label: 'Manpower', format: 'pct' }, // recruitment
  training: { label: 'Training speed', format: 'pct' }, // recruitment
  reinforce: { label: 'Reinforcement rate', format: 'pct' }, // reinforcement
  attack: { label: 'Land attack', format: 'pct' }, // battles
  defense: { label: 'Land defence', format: 'pct' }, // battles
  organization: { label: 'Organisation recovery', format: 'pct' }, // turn
  naval: { label: 'Naval strength', format: 'pct' }, // battles
  upkeep: { label: 'Army upkeep', format: 'pct' }, // economy
  infamyDecay: { label: 'Infamy decay', format: 'pct' }, // infamy
  supply: { label: 'Supply in enemy land', format: 'pct' }, // turn (yıpranma)
  ironclad: { label: 'Ironclad ships (iron and coal instead of timber)', format: 'flag' }, // econ/industry
  // Çağ kaynakları: bonus yalnız kaynak ihtiyacı karşılandığı oranda gelir.
  oilIc: { label: 'Industrial capacity while oil needs are met', format: 'pct' }, // econ/industry
  rubberArmy: { label: 'Land combat while rubber needs are met', format: 'pct' }, // battles
  saltpeterFood: { label: 'Food output while saltpeter needs are met', format: 'pct' }, // econ/resources
};

/** Geçici etkiler (olay, gündem): `{ id, label, until, effects }`. */
export function addTimedModifier(nation, id, label, weeks, effects, turn) {
  nation.timed = (nation.timed ?? []).filter((entry) => entry.id !== id);
  nation.timed.push({ id, label, until: turn + weeks, effects: { ...effects } });
}

/** Kalıcı ulusal fikirler (Büyük X, gündem kalıcı ödülleri). */
export function addIdea(nation, id, label, effects) {
  nation.ideas = (nation.ideas ?? []).filter((entry) => entry.id !== id);
  nation.ideas.push({ id, label, effects: { ...effects } });
}

/**
 * Toplamı kurar. `sources` her biri `{ label, effects }` döndüren kaynak
 * fonksiyonlarıdır (politics ve technology kayıt eder; böylece bu dosya
 * onları import etmez ve döngü doğmaz).
 */
const SOURCES = [];
export function registerModifierSource(fn) {
  if (!SOURCES.includes(fn)) SOURCES.push(fn);
}

export function refreshModifiers(nation, turn = 0) {
  const total = {};
  const parts = [];
  const add = (label, effects) => {
    if (!effects) return;
    let any = false;
    for (const [key, value] of Object.entries(effects)) {
      if (!Number.isFinite(value) || value === 0) continue;
      total[key] = (total[key] ?? 0) + value;
      any = true;
    }
    if (any) parts.push({ label, effects });
  };
  for (const source of SOURCES) {
    for (const entry of source(nation) ?? []) add(entry.label, entry.effects);
  }
  if (nation.timed?.length) nation.timed = nation.timed.filter((entry) => entry.until > turn);
  for (const entry of nation.timed ?? []) add(entry.label, entry.effects);
  for (const entry of nation.ideas ?? []) add(entry.label, entry.effects);
  Object.defineProperty(nation, 'mods', {
    value: total, enumerable: false, writable: true, configurable: true,
  });
  Object.defineProperty(nation, 'modParts', {
    value: parts, enumerable: false, writable: true, configurable: true,
  });
  return total;
}

/** Tek anahtar (yoksa 0). Kurulmamış ulus için de güvenli. */
export function mod(nation, key) {
  return nation?.mods?.[key] ?? 0;
}

/** Bir anahtarın dökümü: hangi kaynak ne kadar veriyor (ekran için). */
export function modifierBreakdown(nation, key) {
  return (nation?.modParts ?? [])
    .filter((part) => part.effects[key])
    .map((part) => ({ label: part.label, value: part.effects[key] }));
}

/** Etkiler nesnesini okunur satırlara çevirir ("+10% Industrial capacity"). */
export function describeEffects(effects) {
  const lines = [];
  for (const [key, value] of Object.entries(effects ?? {})) {
    const meta = MODIFIER_KEYS[key];
    if (!meta || !value) continue;
    if (meta.format === 'flag') {
      lines.push(meta.label);
      continue;
    }
    const sign = value > 0 ? '+' : '−';
    const abs = Math.abs(value);
    const text = meta.format === 'pct' ? `${sign}${Math.round(abs * 100)}%`
      : meta.format === 'pts' ? `${sign}${Math.round(abs * 100)}`
        : `${sign}${Number(abs.toFixed(2))}`;
    lines.push(`${text} ${meta.label}`);
  }
  return lines;
}
