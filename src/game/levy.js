// ASKER KİMDEN TOPLANIR — halk halk kura.
//
// Oyuncu Military ekranında her halkın yanındaki kutuyu işaretler; alay ve
// takviye yalnız işaretli halklardan asker çeker. Eskiden havuz tek bir
// sayıydı: kimin oğlunun cepheye gittiği hiçbir yerde görünmüyordu, ölenler
// de bütün halklardan payları oranında düşüyordu.
//
// Şimdi her alayın `draws` defteri halk halk tutulur (draw.by) ve ölüm, ölen
// halkın payından düşer. Kendi halkını kuradan çıkarıp azınlığı cepheye
// süren devlet zamanla nüfusun bileşimini değiştirir — bedeli de vardır:
// kabul edilmiş bir halkı kayıran devlette kuraya kalan kabul edilmemiş
// halklar huzursuzlanır (culture.js unrestBreakdown `levy`) ve havuz,
// vatandaşlık yasasının o halka verdiği pay kadar küçüktür.
//
// Havuz formülü recruitment.js'teki eski tek sayının halk halk açılımıdır:
// bütün halklar işaretliyken toplam eskisiyle aynıdır.

import { lawOption } from './laws.js';
import { mod } from './modifiers.js';
import { CULTURE, cultureMix, foreignManpowerShare, isAccepted } from './culture.js';
import { claimSoldiers, releaseSoldiers } from './provinces.js';
import { focusBonus } from './focus.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Kümenin halk satırları; bileşimi olmayan eski küme tek halktır. */
export function cultureRows(cluster) {
  if (cluster?.cultures?.length) return cluster.cultures;
  return cluster?.culture >= 0 ? [{ id: cluster.culture, share: 1 }] : [];
}

/** Kuradan çıkarılan halklar. Varsayılan boş: yeni fethedilen halk kuraya girer. */
export function levyExcluded(nation) {
  return Array.isArray(nation?.levyExcluded) ? nation.levyExcluded : [];
}

export function isLevied(nation, cultureId) {
  return !levyExcluded(nation).includes(cultureId);
}

/** Kutuyu çevirir. */
export function setLevied(nation, cultureId, on) {
  const rest = levyExcluded(nation).filter((id) => id !== cultureId);
  nation.levyExcluded = on ? rest : [...rest, cultureId].sort((a, b) => a - b);
  return nation.levyExcluded;
}

/**
 * EŞİTSİZ KURA: kabul edilmiş bir halk kuradan çıkarılmışken kabul edilmemiş
 * bir halk hâlâ askere alınıyorsa. Tersi (azınlığı muaf tutmak) kimseyi
 * kızdırmaz; havuzu küçültmek kendi bedelidir.
 */
export function unequalLevy(nation, cultureIds = null) {
  const excluded = levyExcluded(nation);
  if (!excluded.length) return false;
  if (!excluded.some((id) => isAccepted(nation, id))) return false;
  if (!cultureIds) return true;
  return cultureIds.some((id) => !isAccepted(nation, id) && !excluded.includes(id));
}

/**
 * Kümenin halk halk asker havuzu. `pool` yasanın izin verdiği, `held` şu an
 * silah altında olan, `free` verilebilecek. Halk satırı olmayan (eski kayıt)
 * silah altındakiler havuzlar oranında paylaştırılır.
 */
export function culturePools(world, cluster, nation) {
  const econ = cluster?.econ;
  if (!econ || !nation) return [];
  const rate = lawOption(nation, 'conscription').rate
    * (1 + 0.2 * (econ.buildings?.barracks ?? 0))
    * Math.max(0.2, 1 + mod(nation, 'manpower'))
    * (1 + focusBonus(econ, 'manpower'));
  const calm = 1 - clamp01((econ.unrest ?? 0) / 10) * 0.6;
  const status = econ.status ?? 1;
  const people = Math.max(0, econ.population) * rate * calm * status;
  const foreign = foreignManpowerShare(nation);
  const levied = econ.levied ?? {};
  const rows = cultureRows(cluster).map((row) => {
    const willing = isAccepted(nation, row.id) ? 1 : foreign;
    return {
      id: row.id,
      share: row.share,
      pool: people * row.share * willing,
      held: Math.max(0, levied[row.id] ?? 0),
      levied: isLevied(nation, row.id),
    };
  });
  // Defterde halkı yazılı olmayan asker (eski kayıt, kuruluş ordusu, bileşimden
  // silinmiş halk) havuzlar oranında düşer: toplam eskisiyle birebir kalır.
  const recorded = rows.reduce((sum, row) => sum + row.held, 0);
  const loose = Math.max(0, (econ.soldiers ?? 0) - recorded);
  const poolSum = rows.reduce((sum, row) => sum + row.pool, 0);
  for (const row of rows) {
    if (loose > 0 && poolSum > 0) row.held += loose * row.pool / poolSum;
    row.free = Math.max(0, row.pool - row.held);
  }
  return rows;
}

/** Kümenin kuraya açık halklarından verebileceği asker. */
export function levyAvailable(world, cluster, nation) {
  let total = 0;
  for (const row of culturePools(world, cluster, nation)) if (row.levied) total += row.free;
  return total;
}

/**
 * `men` kişiyi kümenin işaretli halklarından, verebildikleri oranda toplar.
 * @returns {Object<number, number>} halk → kişi (draw.by)
 */
export function takeLevy(world, cluster, nation, men) {
  const by = {};
  if (!(men > 0) || !cluster?.econ) return by;
  const rows = culturePools(world, cluster, nation).filter((row) => row.levied && row.free > 0);
  const free = rows.reduce((sum, row) => sum + row.free, 0);
  if (!(free > 0)) return by;
  const econ = cluster.econ;
  econ.levied ??= {};
  for (const row of rows) {
    const take = men * row.free / free;
    by[row.id] = take;
    econ.levied[row.id] = (econ.levied[row.id] ?? 0) + take;
  }
  claimSoldiers(econ, men);
  return by;
}

/** İki draw.by defterini birleştirir (takviye aynı kümeden tekrar çektiğinde). */
export function mergeLevy(into, by) {
  for (const [id, men] of Object.entries(by ?? {})) into[id] = (into[id] ?? 0) + men;
  return into;
}

/**
 * Bir draw'dan `men` kişiyi bırakır. `died` ise adam ölmüştür: nüfustan,
 * KENDİ HALKININ payından düşer ve ulusun şehit defterine yazılır.
 * draw.men ve draw.by yerinde küçülür.
 */
export function releaseDraw(world, nationId, draw, men, died = false) {
  const before = Math.max(0, draw.men ?? 0);
  men = Math.min(before, Math.max(0, men));
  if (!(men > 0)) return;
  const tile = world?.get?.(draw.q, draw.r);
  const econ = tile?.province ?? null;
  const cluster = tile ? world.provinces?.[tile.provinceId] : null;
  const frac = before > 0 ? men / before : 0;
  // Halk halk kayıp: defterdeki oran; defteri olmayan draw kümenin bileşimi.
  const lost = {};
  let attributed = 0;
  for (const [id, held] of Object.entries(draw.by ?? {})) {
    const take = held * frac;
    if (!(take > 0)) continue;
    lost[id] = take;
    draw.by[id] = held - take;
    attributed += take;
  }
  const loose = Math.max(0, men - attributed);
  if (loose > 0) for (const row of cultureRows(cluster)) lost[row.id] = (lost[row.id] ?? 0) + loose * row.share;
  draw.men = before - men;

  if (econ) {
    const people = Math.max(0, econ.population ?? 0);
    releaseSoldiers(econ, men, died);
    if (econ.levied) {
      for (const [id, take] of Object.entries(lost)) {
        if (econ.levied[id] == null) continue;
        econ.levied[id] = Math.max(0, econ.levied[id] - take);
        if (econ.levied[id] < 0.5) delete econ.levied[id];
      }
    }
    if (died && cluster?.cultures?.length && people > men) shiftMix(world, cluster, people, lost);
  }
  if (died) {
    const nation = world?.nations?.[nationId];
    if (nation) {
      nation.fallen ??= {};
      for (const [id, take] of Object.entries(lost)) nation.fallen[id] = (nation.fallen[id] ?? 0) + take;
    }
  }
}

/**
 * Ölüm kümenin bileşimini kaydırır: ölen halkın payı, ölenler kadar küçülür.
 * Satır silinmez (eşik altı satırı asimilasyon toplar); çoğunluk değişirse
 * kareler yeni rengi alır.
 */
function shiftMix(world, cluster, people, lost) {
  const rest = people - Object.values(lost).reduce((sum, men) => sum + men, 0);
  if (!(rest > 0)) return;
  const next = cluster.cultures.map((row) => ({
    id: row.id,
    share: Math.max(0, row.share * people - (lost[row.id] ?? 0)) / rest,
  })).filter((row) => row.share > 0);
  const total = next.reduce((sum, row) => sum + row.share, 0);
  if (!(total > 0)) return;
  for (const row of next) row.share /= total;
  next.sort((a, b) => b.share - a.share || a.id - b.id);
  const before = cluster.culture;
  cluster.cultures = next;
  cluster.culture = next[0].id;
  if (cluster.culture !== before) {
    for (const idx of cluster.tileIdx ?? []) world.tiles[idx].culture = cluster.culture;
  }
}

/**
 * Military ekranının "kim askere gider" dökümü: halk başına kutu, havuz,
 * silah altındaki, şehit. Ekran sayı üretmez; bunu basar.
 */
export function levyView(world, nation) {
  const rows = new Map();
  for (const entry of cultureMix(world, nation)) {
    rows.set(entry.id, {
      id: entry.id, name: entry.name, people: entry.people, share: entry.share ?? 0,
      accepted: isAccepted(nation, entry.id), primary: entry.id === nation.culture,
      levied: isLevied(nation, entry.id),
      pool: 0, free: 0, held: 0, fallen: 0,
    });
  }
  let grieved = 0;
  for (const cluster of world.provinces ?? []) {
    if (cluster.owner !== nation.id || !cluster.econ) continue;
    const pools = culturePools(world, cluster, nation);
    for (const pool of pools) {
      const row = rows.get(pool.id);
      if (!row) continue;
      row.pool += pool.pool;
      row.free += pool.free;
      row.held += pool.held;
    }
    if (unequalLevy(nation, pools.map((pool) => pool.id))) grieved++;
  }
  for (const [id, men] of Object.entries(nation.fallen ?? {})) {
    const row = rows.get(Number(id));
    if (row) row.fallen = men;
  }
  const list = [...rows.values()].sort((a, b) => b.people - a.people);
  const peopleTotal = list.reduce((sum, row) => sum + row.people, 0);
  for (const row of list) row.share = peopleTotal > 0 ? row.people / peopleTotal : 0;
  return {
    rows: list,
    unequal: unequalLevy(nation),
    grieved,
    grievance: CULTURE.LEVY_GRIEVANCE,
    free: list.reduce((sum, row) => sum + (row.levied ? row.free : 0), 0),
    held: list.reduce((sum, row) => sum + row.held, 0),
    fallen: list.reduce((sum, row) => sum + row.fallen, 0),
    nobody: list.length > 0 && list.every((row) => !row.levied),
  };
}
