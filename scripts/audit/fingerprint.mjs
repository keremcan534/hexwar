// Dunya parmak izi — bassiz/tarayici esdegerlik denetiminin ORTAK olcutu.
//
// Iki ortam da AYNI modulu calistirir (tarayici dev sunucudan dinamik import
// eder); boylece "esit" karari iki ayri formulun tesadufu olamaz. Import yok:
// modul saf kalmali ki tarayicida tek basina yuklensin.

/** Deterministik, okunabilir dunya ozeti. Kayan noktalar sabit basamakla. */
export function worldFingerprint(game) {
  const world = game.world;
  const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
  const nations = world.nations
    .filter((n) => n.alive)
    .map((n) => [
      n.id, n.tiles, n2(n.gold), n2(n.debt ?? 0),
      n.economy?.population ?? 0,
      n.economy?.factories?.length ?? 0,
      n2(n.economy?.stability ?? 0),
      n2(n.infamy ?? 0),
      n.construction?.capacity?.construction ?? 0,
      n.construction?.capacity?.education ?? 0,
      (n.construction?.buildings ?? []).length,
      (n.generals ?? []).length,
      n2(n.economy?.literacy ?? 0),
      (n.research?.done ?? []).length,
    ].join(':'))
    .join('|');
  const prices = Object.entries(world.market?.goods ?? {})
    .map(([id, g]) => `${id}=${g.price.toFixed(4)}`)
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
  // Sirket katmani parmak ize GIRER. Girmezse yesil bir audit:determinism /
  // audit:save kosusu bu katmanin deterministik oldugunun KANITI OLMAZ:
  // deger, sahiplik ve kasa hicbir sutunda gorunmezdi (import yok, alanlar
  // duz veri — modul saf kalir).
  const companies = world.nations
    .filter((n) => n.alive)
    .flatMap((n) => (n.economy?.companies ?? []).map((c) => [
      c.id, n2(c.value), n2(c.cash), n2(c.capitalReturn),
      Object.keys(c.owners ?? {}).sort()
        .map((k) => `${k}=${(c.owners[k] ?? 0).toFixed(6)}`).join(','),
    ].join(':')))
    .join('|');
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
    `companies=${companies}`,
    `delegation=${delegation}`,
  ].join('\n');
}

/** FNV-1a: uzun parmak izini kisa kimlige indirger (gorsel kiyas icin). */
export function fingerprintHash(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
