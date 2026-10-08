// İNŞAAT ÖNİZLEMESİ — "basınca ne olur?" sorusunun cevabı.
//
// Eski Construction ekranı binanın GENEL etkisini yazıyordu ("Food +25%");
// oyuncu hangi state'te kaç birim aldığını bilmeden basıyordu (Kerem: "basınca
// ne olacağını bilemiyoruz", "food olmayan yere food basarsam nolur"). Burada
// her bina için o state'teki GERÇEK kazanç hesaplanır: kademe geçici olarak
// eklenir, oyunun kendi formülü (provinceOutput, provinceManpower, vergi
// dökümü) yeniden okunur, kademe geri alınır. İkinci bir formül yazılmaz —
// önizleme oyunla ayrışamaz.
//
// Katman: game. DOM yok; ekran yalnız buradan dönen satırları basar.

import {
  BUILDINGS, DOCKYARD_IC, FACTORY_IC, POP_UNIT, RESOURCES, RESOURCE_IDS, TAX_PER_DEVELOPMENT, TAX_PER_UNIT,
} from './econ/defs.js';
import { emptyResourceMap, provinceOutput } from './econ/resources.js';
import { provinceManpower } from './recruitment.js';
import { formatPopulation, taxBreakdown } from './economy.js';
import { mod } from './modifiers.js';
import { priceOf } from './econ/trade.js';

const before = emptyResourceMap();
const after = emptyResourceMap();

/** Bir kademe daha ekleyip ölçer, sonra binayı birebir eski hâline getirir. */
function withOneMore(econ, buildingId, measure) {
  const buildings = econ.buildings;
  const had = Object.prototype.hasOwnProperty.call(buildings, buildingId);
  const level = buildings[buildingId];
  buildings[buildingId] = (level ?? 0) + 1;
  try {
    return measure();
  } finally {
    if (had) buildings[buildingId] = level;
    else delete buildings[buildingId];
  }
}

const fmt = (value) => value.toFixed(value >= 10 ? 1 : 2);

/**
 * Bir birim kaynağın ULUSA değeri (altın/hafta). Evde kullanılan kaynak
 * piyasa fiyatındadır (ithalatın ya da açığın yerini tutar). Evde kullanılmayan
 * yalnız ihraç edilebilir ve dünya ancak ihtiyacı kadarını alır: değer fiyat ×
 * dünya ihtiyacı/üretimi. 1836'da kimsenin kullanmadığı petrol böylece sıfıra
 * iner — yalnız fiyatla sıralayınca bomboş petrol listenin tepesindeydi.
 */
export function resourceValue(world, nation, id) {
  const used = (nation.economy?.resources?.[id]?.need ?? 0) > 0.01;
  const balance = world.market?.balance?.[id] ?? 1;
  return priceOf(world, id) * (used ? 1 : Math.max(0, Math.min(1, balance)));
}

/**
 * Bir state'e bir kademe `buildingId` (ya da `'develop'`) eklemenin getirisi.
 * Dönen `gains` satırları: { label, text, value, resource?, from?, to? }.
 * `score` aynı binanın state'lerini sıralamak içindir (aynı birim).
 */
export function buildPreview(world, nation, province, buildingId) {
  const econ = province?.econ;
  const out = { gains: [], score: 0, note: '' };
  if (!econ) return out;
  const status = econ.status ?? 1;

  if (buildingId === 'develop') {
    const tax = taxBreakdown(world, nation);
    const scale = tax.base > 0 ? tax.total / tax.base : 0;
    const gold = econ.population / POP_UNIT * TAX_PER_UNIT * TAX_PER_DEVELOPMENT * status * scale;
    out.gains.push({ label: 'Tax', text: `+${fmt(gold)} gold/wk`, value: gold });
    out.gains.push({ label: 'Building slot', text: '+1 slot', value: 0 });
    out.score = gold;
    return out;
  }

  const info = BUILDINGS[buildingId];
  if (!info) return out;

  if (buildingId === 'farm' || buildingId === 'mine' || buildingId === 'railway') {
    provinceOutput(province, nation, before);
    withOneMore(econ, buildingId, () => provinceOutput(province, nation, after));
    for (const id of RESOURCE_IDS) {
      const delta = after[id] - before[id];
      if (delta <= 0.0005) continue;
      out.gains.push({
        label: RESOURCES[id].name, resource: id, value: delta,
        from: before[id], to: after[id], text: `+${fmt(delta)} ${RESOURCES[id].name}`,
      });
      // Sıralama DEĞERLE: kömür ile petrol aynı birim değil (resourceValue).
      out.score += delta * resourceValue(world, nation, id);
    }
    out.gains.sort((a, b) => b.value * resourceValue(world, nation, b.resource)
      - a.value * resourceValue(world, nation, a.resource));
    out.worth = out.score;
    if (buildingId === 'railway') out.note = 'Also: supply range and movement in this state.';
    if (!out.gains.length) out.note = status <= 0 ? 'Occupied: produces nothing.' : 'Nothing to boost here.';
    return out;
  }

  if (buildingId === 'factory') {
    const ic = FACTORY_IC * status;
    out.gains.push({ label: 'Industry', text: `+${fmt(ic)} IC`, value: ic });
    out.score = ic;
    if (status < 1) out.note = `Not core: counts at ${Math.round(status * 100)}%.`;
    return out;
  }

  if (buildingId === 'dockyard') {
    out.gains.push({ label: 'Shipyard', text: `+${fmt(DOCKYARD_IC)} ship IC cap`, value: DOCKYARD_IC });
    out.note = 'Also a naval base: fleets repair here.';
    out.score = DOCKYARD_IC;
    return out;
  }

  if (buildingId === 'barracks') {
    const now = provinceManpower(world, province.center);
    const next = withOneMore(econ, 'barracks', () => provinceManpower(world, province.center));
    const men = Math.max(0, next - now);
    out.gains.push({ label: 'Recruits', text: `+${formatPopulation(men)} recruits`, value: men });
    out.note = 'Also: regiments raised here train faster.';
    out.score = men;
    return out;
  }

  if (buildingId === 'fort') {
    const level = econ.buildings?.fort ?? 0;
    out.gains.push({ label: 'Defence', text: `Defence +${15 * (level + 1)}%`, value: 0.15 });
    out.note = 'Defenders in this state fight better.';
    // Sınır state'i öne: kale yalnız düşmanın gireceği yerde işe yarar.
    const frontier = (province.neighbors ?? []).some((id) => {
      const owner = world.provinces?.[id]?.owner;
      return owner != null && owner >= 0 && owner !== nation.id;
    });
    out.score = frontier ? 1 : 0.15;
    if (frontier) out.note = 'Border state.';
    return out;
  }

  if (buildingId === 'university') {
    const points = 0.3 * Math.max(0.2, 1 + mod(nation, 'research'));
    out.gains.push({ label: 'Research', text: `+${fmt(points)} RP/wk`, value: points });
    out.score = econ.population / POP_UNIT;
    return out;
  }
  return out;
}
