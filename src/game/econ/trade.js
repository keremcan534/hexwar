// DÜNYA TİCARETİ — kaynak başına tek fiyat, ikili akış (TASARIM.md §4).
//
// İhracat yalnız FAZLADIR ve ticaret yasasının izin verdiği pay kadardır;
// ithalat açığı kendiliğinden kapatmaya çalışır, altın yettiği sürece. Akış
// ikili kurulur çünkü üç mekanik "kimden" sorusunu ister: ambargo (o çiftle
// ticaret yok), abluka (deniz yolu kesilir) ve bağımlılık (açığın yarısından
// fazlası tek ülkeden).
//
// Dağıtım orantılıdır: ithalatçının talebi, ulaşabildiği ihracatçılara
// teklifleri oranında bölünür; teklifini aşan talep gören ihracatçı herkesi
// aynı oranda keser. İki tur yapılır ki bir yerde boşta kalan teklif ötekinin
// karşılanmamış talebine gitsin.

import { RESOURCES, RESOURCE_IDS, TRADE } from './defs.js';
import { lawOption } from '../laws.js';
import { mod } from '../modifiers.js';
import { settle } from '../treasury.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function ensureMarket(world) {
  world.market ??= {};
  const market = world.market;
  market.prices ??= {};
  market.history ??= {};
  market.volume ??= {};
  market.offered ??= {};
  market.wanted ??= {};
  for (const id of RESOURCE_IDS) {
    if (!Number.isFinite(market.prices[id])) market.prices[id] = RESOURCES[id].price;
    market.history[id] ??= [];
    market.volume[id] ??= 0;
    market.offered[id] ??= 0;
    market.wanted[id] ??= 0;
  }
  return market;
}

export function priceOf(world, id) {
  return world.market?.prices?.[id] ?? RESOURCES[id]?.price ?? 1;
}

/** Çift arasında ambargo var mı (iki yönden biri yeter)? */
export function embargoed(world, a, b) {
  const na = world.nations[a];
  const nb = world.nations[b];
  return Boolean(na?.embargoes?.includes(b) || nb?.embargoes?.includes(a));
}

/** Ambargo koyar/kaldırır. SG bedeli ve kural politics/diplomasi katmanında. */
export function setEmbargo(nation, targetId, on) {
  nation.embargoes = (nation.embargoes ?? []).filter((id) => id !== targetId);
  if (on) nation.embargoes.push(targetId);
}

/**
 * ABLUKA: düşman savaş gemisinin 2 hex yakınındaki kıyı province'leri.
 * Ulusun ablukadaki kıyı province payı deniz ticaretini o oranda keser.
 * Haftada bir, ekonomi başında.
 */
export function computeBlockades(world) {
  const blockaded = new Set();
  for (const unit of world.units ?? []) {
    if (unit.type?.domain !== 'sea' || !unit.tile) continue;
    const enemy = unit.nationId;
    const center = unit.tile;
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
        const tile = world.get(center.q + dq, center.r + dr);
        if (!tile || tile.terrain.water || tile.provinceId < 0) continue;
        const province = world.provinces?.[tile.provinceId];
        if (!province || province.owner < 0 || province.owner === enemy) continue;
        if (world.relations?.[enemy]?.[province.owner]?.state !== 'war') continue;
        blockaded.add(province.id);
      }
    }
  }
  const coastal = new Array(world.nations.length).fill(0);
  const blocked = new Array(world.nations.length).fill(0);
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.coastal) continue;
    coastal[province.owner]++;
    if (blockaded.has(province.id)) blocked[province.owner]++;
  }
  for (const nation of world.nations) {
    if (!nation.economy) continue;
    nation.economy.coastal = coastal[nation.id] > 0;
    nation.economy.blockade = coastal[nation.id] ? blocked[nation.id] / coastal[nation.id] : 0;
  }
  return blockaded;
}

/** Çiftin yol katsayısı: kara komşusu 1, deniz (1-abluka)², yol yoksa 0. */
function routeFactor(world, a, b) {
  if (world.contacts?.[a]?.[b] > 0) return 1;
  const ea = world.nations[a].economy;
  const eb = world.nations[b].economy;
  if (!ea?.coastal || !eb?.coastal) return 0;
  return (1 - (ea.blockade ?? 0)) * (1 - (eb.blockade ?? 0));
}

/**
 * Haftalık ticaret. Her ulusun `economy.resources[id]` kaydında `offered`
 * (ihraç teklifi) ve `wanted` (ithalat talebi) hazır olmalı. Akışı kurar,
 * altını öder, `imported`/`exported`/`topPartner`/`topShare` yazar, fiyatları
 * günceller. Determinizm: uluslar id sırasıyla, kaynaklar tablo sırasıyla.
 */
export function clearTrade(world, turn) {
  const market = ensureMarket(world);
  const nations = world.nations.filter((n) => n.alive && n.economy?.resources);
  const n = world.nations.length;
  // flows[r][i][e]: kaynak r'de i'nin e'den aldığı (seyrek: Map).
  const flowsByRes = {};
  for (const id of RESOURCE_IDS) {
    const offers = new Float64Array(n);
    const wants = new Float64Array(n);
    let offeredTotal = 0;
    let wantedTotal = 0;
    for (const nation of nations) {
      const record = nation.economy.resources[id];
      offers[nation.id] = Math.max(0, record.offered);
      wants[nation.id] = Math.max(0, record.wanted);
      offeredTotal += offers[nation.id];
      wantedTotal += wants[nation.id];
    }
    market.offered[id] = offeredTotal;
    market.wanted[id] = wantedTotal;
    const flows = new Map();
    const addFlow = (i, e, amount) => {
      if (!(amount > 0)) return;
      let row = flows.get(i);
      if (!row) flows.set(i, (row = new Map()));
      row.set(e, (row.get(e) ?? 0) + amount);
    };
    if (offeredTotal > 0 && wantedTotal > 0) {
      for (let pass = 0; pass < 2; pass++) {
        // Talep payları: i'nin e'ye düşen talebi (teklif oranında).
        const asked = new Float64Array(n);
        const plan = [];
        for (const importer of nations) {
          const i = importer.id;
          if (!(wants[i] > 1e-9)) continue;
          let reach = 0;
          const options = [];
          for (const exporter of nations) {
            const e = exporter.id;
            if (e === i || !(offers[e] > 1e-9)) continue;
            if (world.relations?.[i]?.[e]?.state === 'war') continue;
            if (embargoed(world, i, e)) continue;
            const route = routeFactor(world, i, e);
            if (route <= 0) continue;
            options.push({ e, route });
            reach += offers[e];
          }
          if (!(reach > 0)) continue;
          for (const option of options) {
            const share = wants[i] * offers[option.e] / reach;
            asked[option.e] += share;
            plan.push({ i, e: option.e, share, route: option.route });
          }
        }
        const fill = new Float64Array(n);
        for (let e = 0; e < n; e++) fill[e] = asked[e] > 0 ? Math.min(1, offers[e] / asked[e]) : 0;
        const usedOffer = new Float64Array(n);
        const gotWant = new Float64Array(n);
        for (const step of plan) {
          // Deniz yolu ablukayla kesilir: ithalatçı daha azını alır, ihracatçı
          // daha azını satar (mal yolda kalmaz, hiç yüklenmez).
          const amount = step.share * fill[step.e] * step.route;
          addFlow(step.i, step.e, amount);
          usedOffer[step.e] += amount;
          gotWant[step.i] += amount;
        }
        for (let k = 0; k < n; k++) {
          offers[k] = Math.max(0, offers[k] - usedOffer[k]);
          wants[k] = Math.max(0, wants[k] - gotWant[k]);
        }
      }
    }
    flowsByRes[id] = flows;

    // FİYAT DÜNYA DENGESİNDEN: (dünya ihtiyacı ÷ dünya üretimi)^1.5, bant içinde,
    // haftada %10 yaklaşır. İlk sürüm takas tekliflerine bakıyordu
    // (√talep/teklif) ve dünya fazlası %11 olan gıdada bile fiyat hep
    // tabandaydı (audit:econ): takasa yalnız açıklar girdiği için oran
    // kıtlığı değil takasın darlığını ölçüyordu.
    let produced = 0;
    let need = 0;
    for (const nation of nations) {
      produced += nation.economy.resources[id].produced;
      need += nation.economy.resources[id].need;
    }
    const balance = produced > 0 ? need / produced : (need > 0 ? TRADE.maxPrice : 1);
    market.balance ??= {};
    market.balance[id] = balance;
    // Üs 1.5: kare, %26 dünya fazlasında bile fiyatı tabana çakıyordu.
    const target = RESOURCES[id].price * clamp(balance ** 1.5, TRADE.minPrice, TRADE.maxPrice);
    market.prices[id] += (target - market.prices[id]) * TRADE.priceSpeed;
  }

  // Ödeme: ithalatçının bütçesi (altın + borç payı) yetmezse BÜTÜN alımları
  // aynı oranda kısılır; ihracatçı da o kadar az satar.
  const costOf = new Float64Array(n);
  for (const id of RESOURCE_IDS) {
    for (const [i, row] of flowsByRes[id]) {
      const importer = world.nations[i];
      const mult = lawOption(importer, 'trade').importCost * Math.max(0.5, 1 + mod(importer, 'importCost'));
      for (const amount of row.values()) costOf[i] += amount * market.prices[id] * mult;
    }
  }
  const scale = new Float64Array(n).fill(1);
  for (const nation of nations) {
    const cost = costOf[nation.id];
    if (!(cost > 0)) continue;
    const budget = importBudget(nation, turn);
    if (cost > budget) scale[nation.id] = budget > 0 ? budget / cost : 0;
  }

  for (const nation of nations) {
    // Bu haftanın takasına katıldı: aynı hafta elense de kaydı denetimde
    // sayılır (korunum dünya toplamıyla sınanır).
    nation.economy.tradeTurn = turn;
    for (const id of RESOURCE_IDS) {
      const record = nation.economy.resources[id];
      record.imported = 0;
      record.exported = 0;
      record.topPartner = -1;
      record.topShare = 0;
      record.price = market.prices[id];
    }
  }
  for (const id of RESOURCE_IDS) {
    let volume = 0;
    for (const [i, row] of flowsByRes[id]) {
      const importer = world.nations[i];
      const record = importer.economy.resources[id];
      const mult = lawOption(importer, 'trade').importCost * Math.max(0.5, 1 + mod(importer, 'importCost'));
      let top = 0;
      for (const [e, raw] of row) {
        const amount = raw * scale[i];
        if (!(amount > 0)) continue;
        const exporter = world.nations[e];
        const price = market.prices[id];
        settle(importer, 'imports', -amount * price * mult);
        const exportMult = (lawOption(exporter, 'trade').exportIncome ?? 1) * (1 + mod(exporter, 'exportIncome'));
        settle(exporter, 'exports', amount * price * exportMult);
        record.imported += amount;
        exporter.economy.resources[id].exported += amount;
        volume += amount;
        if (amount > top) {
          top = amount;
          record.topPartner = e;
        }
      }
      record.topShare = record.need > 0 ? top / record.need : 0;
    }
    market.volume[id] = volume;
    const history = market.history[id];
    history.push(Number(market.prices[id].toFixed(3)));
    if (history.length > 52) history.shift();
  }
}

/**
 * İthalat bütçesi: eldeki altın + borç tavanına kalan pay. İflastaki ulus
 * yalnız eldekiyle alır.
 */
export function importBudget(nation, turn) {
  const gold = Math.max(0, nation.gold ?? 0);
  if ((nation.bankruptUntil ?? 0) > turn) return gold;
  const room = Math.max(0, (nation.economy?.debtCap ?? 0) - (nation.debt ?? 0));
  return gold + room;
}
