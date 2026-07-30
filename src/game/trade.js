// Ticaret: barış hâlindeki ülkeler arasında pasif kaynak akışı.
//
// Tasarımın denge inceliği (docs/tasarim.md § 7): ticaret **açığı olana** akar.
// Zenginin fazlası ancak alıcı bulursa değer kazanır, yani ticaret fakiri
// güçlendirir ve hazine birikmesine doğal bir tahliye açar.
//
// Her tur pazarlık yok: anlaşma bir kez kurulur, akış kendiliğinden işler.

import { atPeace } from './diplomacy.js';
import { INFAMY_TRADE_CUTOFF } from './infamy.js';
import { storageCap } from './cities.js';

/** Ticarete konu mallar. Erzak taşınmaz: bozulur, yerinde tüketilir. */
export const TRADE_GOODS = ['timber', 'iron'];

/** Malın altın karşılığı. Alıcı öder, satıcı kazanır. */
export const GOOD_PRICE = { timber: 3, iron: 5 };

/** Tur başına bir anlaşmadan akabilecek en fazla mal. */
export const ROUTE_CAPACITY = 3;

/** Bu stoğun üstü fazla, altı açık sayılır. */
const COMFORT = 12;

function surplusOf(nation, good, cap) {
  // Ambar dolmaya yakınsa fazlası zaten ziyan olacak: satmak kârlı.
  return Math.max(0, Math.min(nation[good] - COMFORT, cap - COMFORT));
}

function deficitOf(nation, good) {
  return Math.max(0, COMFORT - nation[good]);
}

/** Ülke ticarete uygun mu? Şöhreti kirlenmişse ortak bulamaz. */
export function canTrade(nation) {
  return nation.alive && (nation.infamy ?? 0) < INFAMY_TRADE_CUTOFF;
}

/**
 * Bir turun tüm ticaret akışını işler.
 * Yalnız barış hâlinde, temas eden ve şöhreti temiz ülkeler arasında.
 * @returns {{ deals: number, volume: number }}
 */
export function runTrade(world) {
  const contacts = world.contacts;
  if (!contacts) return { deals: 0, volume: 0 };
  let deals = 0;
  let volume = 0;

  for (let a = 0; a < world.nations.length; a++) {
    const seller = world.nations[a];
    if (!canTrade(seller)) continue;
    const sellerCap = storageCap(seller.budget?.cities ?? 1, seller);

    for (let b = 0; b < world.nations.length; b++) {
      if (a === b) continue;
      const buyer = world.nations[b];
      if (!canTrade(buyer) || !atPeace(world, a, b)) continue;
      // Komşuluk ya da kıyı bağı gerekir: rastgele iki ülke ticaret yapmaz.
      const linked = contacts[a][b] > 0 || (seller.coastal && buyer.coastal);
      if (!linked) continue;

      for (const good of TRADE_GOODS) {
        const flow = Math.min(
          surplusOf(seller, good, sellerCap),
          deficitOf(buyer, good),
          ROUTE_CAPACITY,
        );
        if (flow <= 0) continue;
        const price = flow * GOOD_PRICE[good];
        // Alıcı parayı denkleştiremiyorsa alışveriş küçülür.
        if (buyer.gold < price) continue;

        seller[good] -= flow;
        buyer[good] += flow;
        buyer.gold -= price;
        seller.gold += price;
        deals++;
        volume += flow;
      }
    }
  }
  return { deals, volume };
}
