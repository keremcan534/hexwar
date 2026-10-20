// Dunya parmak izi — bassiz/tarayici esdegerlik denetiminin ORTAK olcutu.
//
// Iki ortam da AYNI modulu calistirir (tarayici dev sunucudan dinamik import
// eder); boylece "esit" karari iki ayri formulun tesadufu olamaz. Import yok:
// modul saf kalmali ki tarayicida tek basina yuklensin.

/** Deterministik, okunabilir dunya ozeti. Kayan noktalar sabit basamakla. */
export function worldFingerprint(game) {
  const world = game.world;
  const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
  // Kalkinma kademesi toplami: insaat kuyrugunun yerine ekonominin birikimi.
  const development = new Map();
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.econ) continue;
    development.set(province.owner, (development.get(province.owner) ?? 0) + (province.econ.development ?? 1));
  }
  const nations = world.nations
    .filter((n) => n.alive)
    .map((n) => [
      n.id, n.tiles, n2(n.fund ?? 0),
      n.economy?.population ?? 0,
      n2(n.economy?.ic?.output ?? 0),
      // Cubugun paylari: faturalar / ordu / halk / kalkinma.
      ['bills', 'army', 'people', 'invest'].map((k) => n2(n.economy?.alloc?.[k] ?? 0)).join('/'),
      n2(n.stability ?? 0),
      n2(n.infamy ?? 0),
      development.get(n.id) ?? 0,
      (n.generals ?? []).length,
      n2(n.economy?.literacy ?? 0),
      (n.research?.done ?? []).length,
    ].join(':'))
    .join('|');
  const prices = Object.entries(world.market?.prices ?? {})
    .map(([id, price]) => `${id}=${price.toFixed(4)}`)
    .sort()
    .join(';');
  const units = world.units
    .map((u) => `${u.id}:${u.type.id}:${u.nationId}:${u.tile.q},${u.tile.r}:${Math.round(u.hp)}`)
    .sort()
    .join('|');
  let wars = 0;
  for (let a = 0; a < world.nations.length; a++) {
    for (let b = a + 1; b < world.nations.length; b++) {
      if (world.relations?.[a]?.[b]?.state === 'war') wars++;
    }
  }
  const cities = world.cities.map((c) => `${c.name}:${c.nationId}:${c.pop}`).sort().join('|');
  // AUTO anahtarlari: yalniz oyuncunun ulkesinde anlamli ama kayittan
  // dondugu icin parmak ize girer.
  const delegation = world.nations
    .filter((n) => n.alive && n.delegation)
    .map((n) => `${n.id}:${Object.keys(n.delegation).filter((k) => n.delegation[k] === true).sort().join(',')}`)
    .filter((row) => !row.endsWith(':'))
    .join('|');
  return [
    `turn=${world.turn}`,
    `nations=${nations}`,
    `units=${units}`,
    `cities=${cities}`,
    `wars=${wars}`,
    `prices=${prices}`,
    `battles=${world.battleSystem?.battles?.length ?? 0}`,
    `delegation=${delegation}`,
  ].join('\n');
}

/**
 * YENİDEN TASARIMIN ALANLARI (redesign §5 "save-audit fingerprint"): parti
 * desteği, devletin rotası, irade/yorgunluk, savaş dengesi, kaybedilen barış,
 * milliyetler politikası, Home Rule, hareket kayıtları (ilerleme, kriz, taviz
 * defteri), levée ve milis alay sayısı. worldFingerprint'ten AYRI tutulur:
 * P1'in kabulü "eski alanlar bayt bayt aynı" der, yeni alanlar o kıyasa
 * girmemeli. Her alan korumalıdır: yoksa '-' yazılır, paket inince dolar.
 */
export function extendedFingerprint(game) {
  const world = game.world;
  const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');
  const n4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '-');
  const militia = new Map();
  for (const unit of world.units ?? []) {
    let count = 0;
    for (const r of unit.regiments ?? []) if (r.militia) count++;
    if (count) militia.set(unit.nationId, (militia.get(unit.nationId) ?? 0) + count);
  }
  const rows = world.nations
    .filter((n) => n.alive)
    .map((n) => {
      const p = n.politics ?? {};
      const support = ['conservative', 'liberal', 'nationalist', 'socialist']
        .map((id) => n2(p.support?.[id])).join('/');
      const course = p.course ? `${n2(p.course.x)},${n2(p.course.y)}` : '-';
      const heading = p.heading ? `${n2(p.heading.x)},${n2(p.heading.y)}` : '-';
      const balance = p.warBalance ? `${n2(p.warBalance.best)},${n2(p.warBalance.worst)}` : '-';
      const homeRule = Array.isArray(n.homeRule) ? [...n.homeRule].sort((a, b) => a - b).join('.') : '-';
      const movements = Object.keys(n.movements ?? {})
        .map(Number).sort((a, b) => a - b)
        .map((c) => {
          const m = n.movements[c] ?? {};
          const crisis = m.crisis ? `${m.crisis.kind ?? '?'}@${m.crisis.since ?? '?'}` : '-';
          const log = Array.isArray(m.concessionLog) ? m.concessionLog.join('.') : '-';
          return `${c}~${n2(m.progress)}~${crisis}~${log}`;
        }).join(';');
      const levee = n.mobilization?.levee;
      const leveeText = levee
        ? ['active', 'since', 'until', 'target', 'raised', 'warKey', 'lastAt'].map((k) => String(levee[k] ?? '-')).join('/')
        : '-';
      return [
        n.id, support, course, n2(p.courseBudget), heading, n4(p.exhaustion), balance,
        p.lostPeaceUntil ?? '-', p.nationalities ?? '-', homeRule, movements, leveeText,
        militia.get(n.id) ?? 0,
      ].join(':');
    });
  return `peoples=${rows.join('|')}`;
}

/** FNV-1a: uzun parmak izini kisa kimlige indirger (gorsel kiyas icin). */
export function fingerprintHash(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
