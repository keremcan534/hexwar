// Hegemonya puanı ve zafer. Oyunun amacı budur: eleme değil, üstünlük.
//
// Toprak puana katkı verir ama tek yol değildir; ekonomi ve prestij de
// barışçı bir zafer yolu sağlar.

import { atPeace } from './diplomacy.js';

/**
 * Oyun 1836'da başlar, bir tur bir haftadır ve 1945'te biter: 5740. tur
 * 28 Aralık 1945'e denk gelirdi (bkz. hud.js tarih hesabı).
 *
 * Erken zafer yoktur. Eskiden bir puan eşiğine ilk ulaşan oyunu bitiriyordu;
 * bu, güçlü ülkenin yüzyılın ortasında masayı toplamasına ve geri kalan
 * onlarca yılın hiç oynanmamasına yol açıyordu. Artık tek kural son turda en
 * yüksek puana sahip olmaktır.
 *
 * KAMPANYA 1900'DE BITER (5740 -> 3340 hafta). Sebep tasarım değil ÖLÇÜM:
 * 110 yıllık kampanyanın son 45 yılı ölçülebilir biçimde boştu.
 *   - Harita 1910'dan sonra donuyordu: ömür boyu sınır değişiminin 649/668'i
 *     1910'dan önce oluyor, sonrasında dört tohumda da 25-32 yıllık kesintisiz
 *     "tek hex el değiştirmedi" pencereleri var.
 *   - Teknoloji ağacının SON düğümü zaten 1912; lider ulus 1899-1902'de
 *     65/65'i bitiriyor. Sonrası için araştırma ekranında gösterilecek şey yok.
 *   - Oyuncunun önüne gelen karar sayısı geç oyunda sıfıra yaklaşıyordu.
 * Yani kesilen 45 yıl oynanan bir şey değildi, izlenen bir şeydi. 1836-1900
 * arası ~64 yıl, oyunun içeriğinin bittiği yere denk düşer ve tek oturumda
 * bitirilebilir bir kampanya olur.
 */
export const FINAL_TURN = 3340;

/**
 * Kurulu sanayi kapasitesinin puan ağırlığı. Ham üretim ve prestij yüzyıl
 * boyunca yavaş büyür; fabrika seviyesi ise asıl yükselen eksendir.
 *
 * Ağırlık 10'dan 4'e indirildi: fabrikalar artık state başına kurulup kendi
 * kendine seviye atladığı için toplam seviye 12 değil 250'yi aşıyor.
 *
 * Ölçülen bileşim (industry/production/prestige): 1845'te %49/%35/%17,
 * 1935'te %86/%10/%4. Geç oyundaki baskınlık bu ağırlıktan değil, prestij ve
 * ham üretimin yüzyıl boyunca sabit kalmasından gelir (prestij 49 → 47).
 * Ağırlığı buradan düşürmek geç oyunu çeşitlendirmez, yalnız eşiği
 * ulaşılamaz yapar; çözüm diğer eksenleri büyütmektir.
 */
const INDUSTRY_WEIGHT = 4;

/**
 * @returns {{ total:number, economy:number, prestige:number }}
 */
export function hegemonyScore(world, nation) {
  const budget = nation.budget;
  // Ekonomi: ürettiğin, sahip olduğun değil.
  const production = budget
    ? budget.production.gold + budget.production.food
      + budget.production.timber + budget.production.iron
    : 0;
  const industry = (nation.economy?.factories ?? []).reduce(
    (sum, factory) => sum + factory.level, 0,
  );
  const economy = production * 1.2 + industry * INDUSTRY_WEIGHT;

  // Prestij: şehirler, barışçı ilişkiler, toprak (en zayıf katsayı toprakta).
  let cities = 0;
  for (const city of world.cities) if (city.nationId === nation.id) cities += 2 + city.pop * 0.3;
  let partners = 0;
  for (const other of world.nations) {
    if (other.alive && other.id !== nation.id && atPeace(world, nation.id, other.id)) partners++;
  }
  // Toprağın katsayısı kasten en zayıf: geniş olmak tek yol olmasın.
  const prestige = cities + partners * 2 + nation.tiles * 0.04;

  return {
    total: Math.round(economy + prestige),
    economy: Math.round(economy),
    prestige: Math.round(prestige),
  };
}

export function scoreboard(world) {
  return world.nations
    .filter((n) => n.alive)
    .map((n) => ({ nation: n, ...hegemonyScore(world, n) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Zafer kontrolü.
 * @returns {{ nation: object, score: number, byConquest: boolean, reason: string }|null}
 */
export function checkVictory(world, turn) {
  const board = scoreboard(world);
  if (!board.length) return null;
  const leader = board[0];

  // Tek bitiş koşulu süredir; erken zafer yoktur (bkz. FINAL_TURN notu).
  if (turn < FINAL_TURN) return null;

  // Kazanan aynı zamanda en geniş ülke mi? Tasarım ölçütü bunu sorar.
  const maxTiles = Math.max(...board.map((b) => b.nation.tiles));
  return {
    nation: leader.nation,
    score: leader.total,
    byConquest: leader.nation.tiles === maxTiles,
    reason: 'time',
    board,
  };
}
