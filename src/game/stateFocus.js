// STATE FOCUS eylemleri: koy/kaldır, engeller, oyunun formülüyle önizleme ve
// YZ kuralı. Tanımlar ve çarpanlar focus.js'te (oradaki formüller buradan
// okumaz; bu dosya ağır modülleri içe aktarır).

import { FOCUS_BY_ID, assimilationFocusWeekly, focusOf, focusSlots, nextSlotAt } from './focus.js';
import { provinceOutput } from './econ/resources.js';
import { formatPopulation, provinceTaxBase, taxBreakdown } from './economy.js';
import { resourceValue } from './buildPreview.js';
import { provinceManpower } from './recruitment.js';
import { foreignShareOf, isAccepted } from './culture.js';
import { occupiedShareOf } from './provinces.js';

export function focusedStates(world, nation) {
  return (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ?.focus && focusOf(p.econ));
}

/** Odağı engelleyen ne varsa; boş dizi = konabilir. */
export function focusBlockers(world, nation, cluster, focusId) {
  const out = [];
  const focus = FOCUS_BY_ID[focusId];
  if (!focus) return ['Unknown focus.'];
  if (!cluster?.econ || cluster.owner !== nation.id) return ['Not your state.'];
  if (cluster.econ.focus === focusId) return [];
  if (occupiedShareOf(world, cluster) >= 1) out.push('The state is occupied.');
  if (!cluster.econ.focus && focusedStates(world, nation).length >= focusSlots(nation)) {
    const next = nextSlotAt(nation);
    const where = focusedStates(world, nation)
      .map((state) => `${state.name} (${FOCUS_BY_ID[state.econ.focus].name})`).join(', ');
    out.push(`All ${focusSlots(nation)} focus slots are in use: ${where}${next != null ? ` — the next opens at ${Math.round(next * 100)}% literacy` : ''}.`);
  }
  if (focusId === 'assimilate' && foreignShareOf(cluster, nation) < 0.01) {
    out.push('Everyone here already belongs to an accepted people.');
  }
  if (focusId === 'integrate' && cluster.econ.core && (cluster.econ.control ?? 0) >= 99.5
    && (cluster.econ.unrest ?? 0) < 0.05) {
    out.push('Already a fully integrated core state.');
  }
  return out;
}

/** Odağı koyar ya da (null / aynı odak) kaldırır. */
export function setFocus(world, nation, cluster, focusId) {
  if (!cluster?.econ || cluster.owner !== nation.id) return false;
  if (!focusId || cluster.econ.focus === focusId) {
    cluster.econ.focus = null;
    return true;
  }
  if (focusBlockers(world, nation, cluster, focusId).length) return false;
  cluster.econ.focus = focusId;
  return true;
}

/**
 * Odağın bu state'teki karşılığı, oyunun kendi formülüyle: odak geçici
 * konur, okunur, eski hâline döner. Dönen satırlar ekranın tooltip'idir.
 */
export function focusPreview(world, nation, cluster, focusId) {
  const econ = cluster?.econ;
  const focus = FOCUS_BY_ID[focusId];
  if (!econ || !focus) return null;
  const saved = econ.focus;
  const read = () => {
    const out = provinceOutput(cluster, nation);
    let value = 0;
    for (const [id, amount] of Object.entries(out)) value += amount * resourceValue(world, nation, id);
    const share = cluster.owner === nation.id ? stateTax(world, nation, cluster) : 0;
    return { value, tax: share, men: provinceManpower(world, cluster.center) };
  };
  let before;
  let after;
  try {
    econ.focus = null;
    before = read();
    econ.focus = focusId;
    after = read();
  } finally {
    econ.focus = saved;
  }
  const lines = [];
  if (focusId === 'production') lines.push(`+${(after.value - before.value).toFixed(2)} gold-worth of goods a week`);
  if (focusId === 'tax') lines.push(`+${(after.tax - before.tax).toFixed(2)} gold a week`);
  if (focusId === 'recruit') lines.push(`+${formatPopulation(after.men - before.men)} men to draft`);
  if (focusId === 'integrate') {
    lines.push(econ.core ? 'Core state: unrest −1' : `Compliance ${Math.round(econ.control ?? 0)}% grows twice as fast`);
  }
  if (focusId === 'assimilate') {
    const foreign = foreignShareOf(cluster, nation);
    const people = Math.max(0, econ.population ?? 0);
    const yearly = assimilationFocusWeekly(nation, econ.unrest, foreign) * 52 * people;
    lines.push(`~${formatPopulation(yearly)} people a year take up your culture (${Math.round(foreign * 100)}% not accepted here)`);
    if ((econ.unrest ?? 0) >= 3) lines.push(`Unrest ${(econ.unrest ?? 0).toFixed(1)} slows it; it stops near 7.7`);
  }
  return { lines, before, after };
}

/** Bir state'in haftalık vergisi: kendi tabanı × ulusal çarpanlar. */
function stateTax(world, nation, cluster) {
  const all = taxBreakdown(world, nation);
  return provinceTaxBase(cluster.econ) * all.law * all.stability * all.consumer * all.mods;
}

/**
 * YZ ve devredilmiş hükûmet aynı kapıdan geçer: boş yuvalara en çok getirecek
 * odak. Uyum düşük fethedilmiş state → Integration; kalabalık azınlık →
 * Assimilation; gerisi en kalabalık çekirdeğe Taxation. Var olan odak,
 * geçersizleşmedikçe yerinde kalır (oyuncunun kararını ezmez).
 */
export function autoFocus(world, nation) {
  for (const cluster of focusedStates(world, nation)) {
    if (focusBlockers(world, nation, cluster, cluster.econ.focus).length) cluster.econ.focus = null;
    // Tamamlanmış entegrasyon yuvayı boşa tutmasın.
    else if (cluster.econ.focus === 'integrate' && cluster.econ.core && (cluster.econ.unrest ?? 0) < 0.5) {
      cluster.econ.focus = null;
    // Tamamlanmış asimilasyon da: YZ'nin Assimilation yuva-yıllarının %55'i
    // zaten %1'in altında yabancısı kalmış state'lerdeydi (ölçüldü).
    } else if (cluster.econ.focus === 'assimilate' && foreignShareOf(cluster, nation) < 0.01) {
      cluster.econ.focus = null;
    }
  }
  let free = focusSlots(nation) - focusedStates(world, nation).length;
  if (free <= 0) return 0;
  const picks = [];
  for (const cluster of world.provinces ?? []) {
    if (cluster.owner !== nation.id || !cluster.econ || cluster.econ.focus) continue;
    if (occupiedShareOf(world, cluster) > 0) continue;
    const econ = cluster.econ;
    const people = Math.max(0, econ.population ?? 0);
    const foreign = foreignShareOf(cluster, nation);
    if (!econ.core && (econ.control ?? 0) < 70) {
      picks.push({ cluster, id: 'integrate', score: people * (1 - (econ.control ?? 0) / 100) * 3 });
    }
    if (foreign >= 0.25 && (econ.unrest ?? 0) < 6 && !isAccepted(nation, cluster.culture)) {
      picks.push({ cluster, id: 'assimilate', score: people * foreign * 1.5 });
    }
    if (econ.core) picks.push({ cluster, id: 'tax', score: people * (1 + 0.15 * (econ.development ?? 1)) * 0.5 });
  }
  picks.sort((a, b) => b.score - a.score || a.cluster.id - b.cluster.id);
  let placed = 0;
  for (const pick of picks) {
    if (free <= 0) break;
    if (pick.cluster.econ.focus) continue;
    if (setFocus(world, nation, pick.cluster, pick.id)) {
      free--;
      placed++;
    }
  }
  return placed;
}
