// İNŞAAT — bina ve kalkınma kuyruğu (TASARIM.md §7).
//
// Bina PROVINCE'E aittir: toprak el değiştirince bina da gider (fabrika
// devri ayrı bir iş değildir). Bedel peşin ödenir, süre haftalarla akar; aynı
// anda yürüyen proje sayısı inşaat yuvasıyla sınırlıdır, fazlası sırada
// bekler. Yürüyen proje haftalık kereste (demiryolu ayrıca demir) yer; kıtsa
// yavaşlar — inşaat hamlesinin coğrafi bedeli budur.
//
// Oyuncu province province tıklar ya da AUTO'ya bırakır: `planConstruction`
// YZ ile AUTO'nun ORTAK kapısıdır (ilke 4).

import {
  BUILDINGS, BUILDING_IDS, CONSTRUCTION_TIMBER, DEVELOPMENT_CAP_BASE, DEVELOPMENT_COST,
  DEVELOPMENT_COST_EXPONENT, DEVELOPMENT_MAX, DEVELOPMENT_WEEKS, FACTORY_COST_GROWTH, POP_UNIT,
  RAILWAY_IRON, RESOURCE_IDS,
} from './econ/defs.js';
import { lawOption } from './laws.js';
import { mod } from './modifiers.js';
import { settle } from './treasury.js';
import { buildingLevels, buildingSlots, provinceName } from './provinces.js';
import { resourceRatio } from './econ/resources.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** En çok bu kadar proje sırada bekleyebilir (yürüyenler dahil). */
export const MAX_QUEUE = 24;

export function ensureConstruction(nation) {
  const state = nation.construction ?? {};
  nation.construction = state;
  if (!Array.isArray(state.queue)) state.queue = [];
  if (!Number.isInteger(state.nextId)) state.nextId = 1;
  return state;
}

export function initConstruction(world) {
  for (const nation of world.nations) {
    nation.construction = { queue: [], nextId: 1 };
  }
}

/** Aynı anda yürüyen proje sayısı: 2 + her 5 province'e bir + teknoloji. */
export function constructionSlots(nation) {
  return Math.max(1, 2 + Math.floor((nation.provinces ?? 0) / 5)
    + Math.round(mod(nation, 'constructionSlots')));
}

/** Bina ve kalkınma bedel çarpanı: teknoloji ve ticaret yasası. */
function costFactor(nation) {
  return Math.max(0.4, 1 + mod(nation, 'buildCost') + (lawOption(nation, 'trade').construction ?? 0));
}

/** Kalkınma tavanı: taban + teknoloji + okuryazarlık. */
export function developmentCap(nation) {
  const literacy = nation.economy?.literacy ?? 0;
  return clamp(Math.floor(DEVELOPMENT_CAP_BASE + mod(nation, 'developmentCap') + literacy * 4),
    1, DEVELOPMENT_MAX);
}

/** Province ve bina türü için sıradaki projeler (kademe sayımı). */
function queuedFor(nation, provinceId, kind, building = null) {
  let count = 0;
  for (const project of ensureConstruction(nation).queue) {
    if (project.provinceId !== provinceId || project.kind !== kind) continue;
    if (building && project.building !== building) continue;
    count++;
  }
  return count;
}

/** Ulusun fabrika kademesi (sıradakiler dahil): her biri sonrakini pahalılaştırır. */
function factoryCount(world, nation) {
  let count = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id) count += province.econ?.buildings?.factory ?? 0;
  }
  for (const project of ensureConstruction(nation).queue) {
    if (project.building === 'factory') count++;
  }
  return count;
}

export function buildingCost(world, nation, province, buildingId) {
  const info = BUILDINGS[buildingId];
  if (!info || !province?.econ) return Infinity;
  const level = (province.econ.buildings?.[buildingId] ?? 0)
    + queuedFor(nation, province.id, 'building', buildingId);
  let cost = info.cost * (1 + (info.costGrowth ?? 0) * level);
  if (buildingId === 'factory') cost *= 1 + FACTORY_COST_GROWTH * factoryCount(world, nation);
  return Math.round(cost * costFactor(nation));
}

export function developmentCost(nation, province) {
  const econ = province?.econ;
  if (!econ) return Infinity;
  const target = econ.development + 1 + queuedFor(nation, province.id, 'develop');
  const scale = Math.max(1, Math.sqrt(econ.population / POP_UNIT));
  return Math.round(DEVELOPMENT_COST * target ** DEVELOPMENT_COST_EXPONENT * scale * costFactor(nation));
}

/**
 * Neden kurulamaz? Boş liste = kurulabilir. Ekran düğmesi ve YZ aynı listeyi
 * okur; gerekçe cümle olarak döner.
 */
export function buildBlockers(world, nation, province, buildingId) {
  const info = BUILDINGS[buildingId];
  const econ = province?.econ;
  const out = [];
  if (!info || !econ) return ['Unknown building'];
  if (province.owner !== nation.id) out.push('Not your province');
  else if ((econ.status ?? 1) <= 0) out.push('Province is occupied');
  const level = (econ.buildings?.[buildingId] ?? 0) + queuedFor(nation, province.id, 'building', buildingId);
  if (level >= info.max) out.push(`Maximum level (${info.max})`);
  const used = buildingLevels(econ) + queuedFor(nation, province.id, 'building');
  if (used >= buildingSlots(econ)) out.push(`No free building slot (development ${econ.development} → ${buildingSlots(econ)} slots)`);
  if (info.minDevelopment && econ.development < info.minDevelopment) {
    out.push(`Needs development ${info.minDevelopment}`);
  }
  if (info.needsDeposit && !(province.deposits?.length)) out.push('No mineral deposit here');
  if (info.coastal && !province.coastal) out.push('Must be on the coast');
  if (ensureConstruction(nation).queue.length >= MAX_QUEUE) out.push('Construction queue is full');
  const cost = buildingCost(world, nation, province, buildingId);
  if ((nation.gold ?? 0) < cost) out.push(`Needs ${cost} gold`);
  return out;
}

export function developBlockers(world, nation, province) {
  const econ = province?.econ;
  const out = [];
  if (!econ) return ['Unknown province'];
  if (province.owner !== nation.id) out.push('Not your province');
  else if ((econ.status ?? 1) <= 0) out.push('Province is occupied');
  const target = econ.development + 1 + queuedFor(nation, province.id, 'develop');
  const cap = developmentCap(nation);
  if (target > cap) out.push(`Development cap ${cap} (research and literacy raise it)`);
  if (ensureConstruction(nation).queue.length >= MAX_QUEUE) out.push('Construction queue is full');
  const cost = developmentCost(nation, province);
  if ((nation.gold ?? 0) < cost) out.push(`Needs ${cost} gold`);
  return out;
}

function pushProject(game, nation, project) {
  const state = ensureConstruction(nation);
  project.id = state.nextId++;
  project.progress = 0;
  project.queuedAt = game.turns?.turn ?? 0;
  state.queue.push(project);
  settle(nation, 'construction', -project.cost);
  game.emit?.('construction', nation.id);
  return project;
}

export function queueBuilding(game, nation, province, buildingId) {
  const world = game.world;
  if (buildBlockers(world, nation, province, buildingId).length) return null;
  const info = BUILDINGS[buildingId];
  return pushProject(game, nation, {
    kind: 'building',
    building: buildingId,
    provinceId: province.id,
    weeks: info.weeks,
    cost: buildingCost(world, nation, province, buildingId),
  });
}

export function queueDevelopment(game, nation, province) {
  if (developBlockers(game.world, nation, province).length) return null;
  return pushProject(game, nation, {
    kind: 'develop',
    provinceId: province.id,
    weeks: DEVELOPMENT_WEEKS,
    cost: developmentCost(nation, province),
  });
}

/** İptal: harcanmamış kısmın dörtte üçü geri döner. */
export function cancelProject(game, nation, projectId) {
  const state = ensureConstruction(nation);
  const index = state.queue.findIndex((project) => project.id === projectId);
  if (index < 0) return false;
  const [project] = state.queue.splice(index, 1);
  const unspent = 1 - clamp(project.progress / Math.max(1, project.weeks), 0, 1);
  const refund = project.cost * unspent * 0.75;
  if (refund > 0) settle(nation, 'construction', refund);
  game.emit?.('construction', nation.id);
  return true;
}

/** Projeyi kuyruğun başına (ya da sonuna) taşır. */
export function moveProject(game, nation, projectId, edge = 'top') {
  const state = ensureConstruction(nation);
  const index = state.queue.findIndex((project) => project.id === projectId);
  if (index < 0) return false;
  const [project] = state.queue.splice(index, 1);
  if (edge === 'top') state.queue.unshift(project);
  else state.queue.push(project);
  game.emit?.('construction', nation.id);
  return true;
}

/** Yürüyen (yuvaya girmiş) projeler: kuyruğun başındaki N tanesi. */
export function activeProjects(nation) {
  const state = ensureConstruction(nation);
  return state.queue.slice(0, constructionSlots(nation));
}

/** İnşaatın haftalık kaynak ihtiyacı (economy.js ticaret teklifine katar). */
export function constructionResourceNeeds(nation, needs) {
  for (const project of activeProjects(nation)) {
    needs.TIMBER += CONSTRUCTION_TIMBER;
    if (project.building === 'railway') needs.IRON += RAILWAY_IRON;
  }
  return needs;
}

/** Haftalık ilerleme hızı: teknoloji × kereste (× demir, demiryolunda). */
export function projectSpeed(nation, project) {
  const timber = 0.25 + 0.75 * resourceRatio(nation, 'TIMBER');
  const iron = project.building === 'railway' ? 0.25 + 0.75 * resourceRatio(nation, 'IRON') : 1;
  return Math.max(0.1, 1 + mod(nation, 'construction')) * timber * iron;
}

function completeProject(game, nation, project) {
  const world = game.world;
  const province = world.provinces?.[project.provinceId];
  const econ = province?.econ;
  if (!econ || province.owner !== nation.id) return;
  let text;
  if (project.kind === 'develop') {
    econ.development = Math.min(DEVELOPMENT_MAX, econ.development + 1);
    text = `${provinceName(province.center)} developed to level ${econ.development}.`;
  } else {
    const info = BUILDINGS[project.building];
    econ.buildings[project.building] = Math.min(info.max, (econ.buildings[project.building] ?? 0) + 1);
    text = `${info.name} completed in ${provinceName(province.center)}.`;
  }
  if (nation.id === game.turns?.playerNation) {
    game.turns.addLog(text, { kind: 'BUILDING', tile: province.center, silent: true });
  }
  game.renderer?.invalidateTiles?.(province.tileIdx.map((idx) => world.tiles[idx]), false);
}

export function runConstruction(game) {
  const world = game.world;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const state = ensureConstruction(nation);
    if (!state.queue.length) continue;
    // Sahibi değişmiş province'teki proje düşer (savaş dışı yollar için de).
    state.queue = state.queue.filter((project) => world.provinces?.[project.provinceId]?.owner === nation.id);
    const slots = constructionSlots(nation);
    const done = [];
    for (let i = 0; i < Math.min(slots, state.queue.length); i++) {
      const project = state.queue[i];
      const province = world.provinces[project.provinceId];
      // İşgal altındaki province'te iş durur.
      if ((province.econ?.status ?? 1) <= 0) continue;
      project.progress += projectSpeed(nation, project);
      if (project.progress >= project.weeks) done.push(project);
    }
    if (!done.length) continue;
    state.queue = state.queue.filter((project) => !done.includes(project));
    for (const project of done) completeProject(game, nation, project);
    game.emit?.('construction', nation.id);
  }
}

/**
 * Province el değiştirirken (fetih, barış, isyan, devir) eski sahibin oradaki
 * projeleri düşer; binalar province'te kalır ve yeni sahibe geçer.
 */
export function captureConstructionAt(world, tile, newNationId) {
  if (!tile || tile.owner < 0 || tile.owner === newNationId) return 0;
  const oldNation = world.nations[tile.owner];
  if (!oldNation?.construction) return 0;
  const state = ensureConstruction(oldNation);
  const before = state.queue.length;
  state.queue = state.queue.filter((project) => project.provinceId !== tile.provinceId);
  return before - state.queue.length;
}

/**
 * İnşaat ekranının modeli: yuvalar, kuyruk (yürüyen/bekleyen), ilerleme.
 */
export function constructionView(world, nation) {
  const state = ensureConstruction(nation);
  const slots = constructionSlots(nation);
  return {
    slots,
    developmentCap: developmentCap(nation),
    queue: state.queue.map((project, index) => {
      const province = world.provinces?.[project.provinceId];
      const speed = projectSpeed(nation, project);
      const left = Math.max(0, project.weeks - project.progress);
      return {
        id: project.id,
        kind: project.kind,
        building: project.building ?? null,
        name: project.kind === 'develop' ? `Develop to ${(province?.econ?.development ?? 0) + 1}` : BUILDINGS[project.building]?.name,
        province: province ? provinceName(province.center) : '?',
        provinceId: project.provinceId,
        progress: project.progress / Math.max(1, project.weeks),
        weeksLeft: index < slots ? Math.ceil(left / Math.max(0.05, speed)) : null,
        active: index < slots,
        cost: project.cost,
      };
    }),
  };
}

/**
 * YZ ve AUTO'nun inşaat kararı. Bütçe: eldeki altının yedeğin üstündeki
 * kısmı. Öncelik ulusun durumundan: tüketim malı ya da askerî IC eksikse
 * fabrika; gıda açığı varsa çiftlik; kıyıda tersanesizse tersane; kalan
 * altın en kalabalık province'in kalkınmasına.
 */
export function planConstruction(game, nation, { reserve = 60 } = {}) {
  const world = game.world;
  const state = ensureConstruction(nation);
  const slots = constructionSlots(nation);
  if (state.queue.length >= slots + 2) return null;
  const budget = (nation.gold ?? 0) - reserve - Math.max(0, nation.debt ?? 0) * 0.5;
  if (budget <= 0) return null;
  const economy = nation.economy ?? {};
  const own = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ
    && (p.econ.status ?? 1) > 0);
  if (!own.length) return null;
  const byPopulation = [...own].sort((a, b) => b.econ.population - a.econ.population || a.id - b.id);
  const wants = [];
  const consumer = economy.consumer?.ratio ?? 1;
  if (consumer < 1.05 || (economy.warFronts ?? 0) > 0) wants.push('factory');
  if ((economy.resources?.FOOD?.ratio ?? 1) < 1) wants.push('farm');
  // Gıda açığını çiftlik kapatır; geri kalan her kaynak (petrol ve kauçuk
  // dahil — liste eskiden beş temel kaynakla sınırlıydı) işletmeyle.
  for (const id of RESOURCE_IDS) {
    if (id === 'FOOD') continue;
    if ((economy.resources?.[id]?.balance ?? 0) < 0) { wants.push('mine'); break; }
  }
  if (economy.coastal && !own.some((p) => (p.econ.buildings.dockyard ?? 0) > 0)) wants.push('dockyard');
  wants.push('factory', 'railway', 'develop');
  const tryBuild = (buildingId) => {
    const candidates = buildingId === 'mine'
      ? byPopulation.filter((p) => p.deposits?.some((d) => (economy.resources?.[d.id]?.balance ?? 0) < 0))
      : buildingId === 'farm'
        ? [...own].sort((a, b) => (b.fertility ?? 1) * b.econ.population - (a.fertility ?? 1) * a.econ.population)
        : byPopulation;
    for (const province of candidates) {
      if (buildBlockers(world, nation, province, buildingId).length) continue;
      if (buildingCost(world, nation, province, buildingId) > budget) continue;
      return queueBuilding(game, nation, province, buildingId);
    }
    return null;
  };
  for (const want of wants) {
    if (want === 'develop') {
      for (const province of byPopulation) {
        if (developBlockers(world, nation, province).length) continue;
        if (developmentCost(nation, province) > budget) continue;
        return queueDevelopment(game, nation, province);
      }
      continue;
    }
    const made = tryBuild(want);
    if (made) return made;
  }
  return null;
}

/** Bina kimlikleri (ekranlar için). */
export { BUILDING_IDS };
