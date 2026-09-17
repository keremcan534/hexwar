// Ülke özeti: kuruluş ekranındaki "bu ülke kim" kartının verisi.
//
// Kör oyun testinin ilk bulgusu ülke seçememekti: oyun bir ülkeyi atayıp
// haritaya bırakıyordu. Seçim ekranı için tek bir döküm fonksiyonu: sıra,
// toprak, halk, hükûmet, hammadde, sanayi, ordu, komşular ve "dikkat"
// satırları. Burada hiçbir sayı üretilmez; hepsi dünyanın kendi alanlarından
// okunur (VICTORIA_LITE değişmez #2: sayıyı üreten, onu gösterendir).
//
// Katman: game. DOM yok. Kuruluş anında (ilk haftalık tik öncesi) da çalışır:
// goodsFlow henüz boş olduğundan üretim province RGO'larından sayılır.

import { scoreboard } from './hegemony.js';
import { nationStrength } from './diplomacy.js';
import {
  governmentType, policyLabel, policyOf, rulingParty,
} from './politics.js';
import { RGO_TYPES } from './provinces.js';
import { FACTORIES, GOODS, populationOf } from './economy.js';
import { characterLine } from './identity.js';

/** Bir ülkenin ekonomisi olan (yerleşik) kümeleri. */
function provincesOf(world, nationId) {
  return (world.provinces ?? []).filter((province) => province.owner === nationId && province.econ);
}

/**
 * Toprak tek parça mı? Kuruluşta seçilen ülkeyle aynı ölçüt
 * (nations.js pickContiguousPlayer): iki parçalı ülke denizden yaşar.
 */
export function isContiguous(world, nationId) {
  const provinces = provincesOf(world, nationId);
  if (provinces.length <= 1) return true;
  const mine = new Set(provinces.map((province) => province.id));
  const seen = new Set([provinces[0].id]);
  const queue = [provinces[0].id];
  while (queue.length) {
    const id = queue.pop();
    for (const next of world.provinces[id]?.neighbors ?? []) {
      if (!mine.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === provinces.length;
}

/** Ülkenin çıkardığı hammaddeler, kaç kümede: hexle ağırlıklı ilk üç. */
function rawGoods(world, provinces, limit = 3) {
  const tally = new Map();
  for (const province of provinces) {
    const type = RGO_TYPES[province.econ.rgo];
    if (!type) continue;
    const row = tally.get(type.goodId) ?? { id: type.goodId, hexes: 0, provinces: 0 };
    row.hexes += province.tileIdx.length;
    row.provinces += 1;
    tally.set(type.goodId, row);
  }
  return [...tally.values()]
    .sort((a, b) => b.hexes - a.hexes)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      name: GOODS[row.id]?.name ?? row.id,
      icon: GOODS[row.id]?.icon ?? '',
    }));
}

/** Kurulu sanayi: kaç tesis, hangi türler (en çok üçü). */
function industryOf(nation) {
  const factories = nation.economy?.factories ?? [];
  const names = new Map();
  for (const factory of factories) {
    const name = FACTORIES[factory.typeId]?.name ?? factory.typeId;
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  return {
    count: factories.length,
    levels: factories.reduce((sum, factory) => sum + (factory.level ?? 1), 0),
    types: [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
  };
}

/**
 * Sınır komşuları: küme komşuluğundan (kare taraması yok). Her komşu için
 * güç oranı ve en yaygın hammaddesi — "kimin nesi var" sorusu için.
 */
function neighboursOf(world, nation, myPower) {
  const ids = new Set();
  for (const province of provincesOf(world, nation.id)) {
    for (const next of province.neighbors ?? []) {
      const owner = world.provinces[next]?.owner;
      if (owner >= 0 && owner !== nation.id) ids.add(owner);
    }
  }
  return [...ids]
    .map((id) => world.nations[id])
    .filter((other) => other?.alive)
    .map((other) => {
      const power = nationStrength(world, other);
      const goods = rawGoods(world, provincesOf(world, other.id), 1);
      return {
        id: other.id,
        name: other.name,
        power,
        ratio: myPower > 0 ? power / myPower : Infinity,
        good: goods[0] ?? null,
        provinces: provincesOf(world, other.id).length,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Kuruluş ekranının tek döküm fonksiyonu.
 * @returns {object} sayılar + metin için hazır satırlar (`notes`)
 */
export function nationBrief(world, nation) {
  const board = scoreboard(world);
  const rank = board.findIndex((row) => row.nation.id === nation.id) + 1;
  const provinces = provincesOf(world, nation.id);
  const population = populationOf(world, nation);
  const cities = world.cities.filter((city) => city.nationId === nation.id).length;
  const divisions = world.units.filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land').length;
  const ships = world.units.filter((unit) => unit.nationId === nation.id && unit.type.domain === 'sea').length;
  const power = nationStrength(world, nation);
  const party = rulingParty(nation);
  // Kabul edilmis kultur yabanci sayilmaz (nation.accepted): vatandaslik
  // yasasi kimin "bizden" oldugunu belirler, kurucu kultur tek basina degil.
  const accepted = new Set([nation.culture, ...(nation.accepted ?? [])]);
  const foreign = provinces.reduce((sum, province) => (
    !accepted.has(province.culture) ? sum + (province.econ?.population ?? 0) : sum
  ), 0);
  const foreignShare = population > 0 ? foreign / population : 0;
  const contiguous = isContiguous(world, nation.id);
  const goods = rawGoods(world, provinces);
  const industry = industryOf(nation);
  const neighbours = neighboursOf(world, nation, power);
  const strongest = neighbours[0] ?? null;

  // "DİKKAT" satırları: hepsi yukarıdaki sayılardan türer, hiçbiri uydurma.
  const notes = [];
  if (strongest && strongest.ratio >= 1.5) {
    notes.push({ tone: 'bad', text: `A stronger neighbour: ${strongest.name} is ${strongest.ratio.toFixed(1)}× your strength.` });
  } else if (strongest && strongest.ratio <= 0.6) {
    notes.push({ tone: 'good', text: `A weak neighbour: ${strongest.name}${strongest.good ? ` sits on ${strongest.good.name.toLowerCase()}` : ''}.` });
  }
  if (!contiguous) notes.push({ tone: 'warn', text: 'Territory in more than one piece: the far part lives by sea.' });
  if (!nation.coastal) notes.push({ tone: 'warn', text: 'Landlocked: no navy, trade by land only.' });
  if (industry.count < 4) notes.push({ tone: 'warn', text: `Agrarian: ${industry.count} plant${industry.count === 1 ? '' : 's'} — industry must be built.` });
  else if (industry.count >= 8) notes.push({ tone: 'good', text: `An industrial base of ${industry.count} plants.` });
  if (foreignShare > 0.3) notes.push({ tone: 'warn', text: `${Math.round(foreignShare * 100)}% of the people are of a culture the state does not accept.` });
  if (rank > 0 && rank <= 5) notes.push({ tone: 'good', text: 'A great power: the world measures itself against you.' });
  else if (rank > 0 && rank >= board.length * 0.7) notes.push({ tone: 'warn', text: 'A minor power: room to climb, little margin for error.' });

  return {
    id: nation.id,
    name: nation.name,
    fullName: nation.fullName ?? nation.name,
    color: nation.color,
    rank,
    of: board.length,
    hexes: nation.tiles ?? 0,
    provinces: provinces.length,
    population,
    cities,
    coastal: Boolean(nation.coastal),
    contiguous,
    culture: world.cultures?.[nation.culture]?.name ?? 'Unknown',
    foreignShare,
    government: governmentType(nation),
    party: party?.name ?? 'No government',
    economicPolicy: policyLabel('economy', policyOf(nation, 'economy')),
    tradePolicy: policyLabel('trade', policyOf(nation, 'trade')),
    goods,
    industry,
    divisions,
    ships,
    power,
    treasury: Math.round(nation.gold ?? 0),
    neighbours,
    notes,
    line: characterLine(world, nation),
    suggested: nation.id === world.playerNation,
  };
}

/** Seçim listesi: yaşayan ülkeler sıraya göre. */
export function nationRoster(world) {
  return scoreboard(world).map((row, index) => ({
    id: row.nation.id,
    name: row.nation.name,
    color: row.nation.color,
    rank: index + 1,
    total: row.total,
    provinces: provincesOf(world, row.nation.id).length,
    contiguous: isContiguous(world, row.nation.id),
  }));
}
