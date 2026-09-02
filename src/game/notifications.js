// Bildirim merkezi: günlüğe düşen olayları oyuncunun göreceği kartlara çevirir.
// Burada DOM yok — kartları `ui/notifications.js` çizer, bu katman yalnızca
// olayın ne olduğunu, ne kadar önemli olduğunu ve nereye baktığını bilir.

/**
 * Kart türleri. `ttl` 0 ise kart kendiliğinden kapanmaz: savaş ilanı ya da
 * kıtlık gibi oyuncunun görmeden geçmemesi gereken olaylar elle kapatılır.
 */
/**
 * `halt: true` olan tur oyunu DURDURUR.
 *
 * Beta testcisi savasta oldugunu fark etmedi: *"Draesh declared war on us!"*
 * ile *"Clothing Factory reached level 6"* ayni yiginda, ayni bicimde
 * duruyordu. Savasi dakikalar sonra, Fabrikalar ekraninda beliren bir
 * *"Open peace talks with Draesh"* dugmesinden anladi (BUG-013).
 *
 * ttl 0 (kendiliğinden kapanmama) yetmedi — kart yine de akista kayboluyordu.
 * Sonucu olan olay zamani durdurmali; bildirim akisi ile KARAR ani ayrilmali.
 */
/**
 * `tier` sunumun agirligini belirler (bkz. chronicle.js TIER):
 * 0 akista gecer · 1 belirgin kart · 2 ulusal olay kartı + vakayiname ·
 * 3 varolussal, zamani durdurur. Cagiran `meta.tier` ile tek bir olayi
 * yukseltebilir: ayni tur (ARMY) hem "bir alay dustu" hem "ordu yok oldu"
 * olabilir.
 */
export const NOTIFY = {
  WAR: { icon: '⚔', tone: 'war', label: 'War', ttl: 0, halt: true, tier: 2 },
  PEACE: { icon: '🕊', tone: 'good', label: 'Peace', ttl: 0, tier: 2 },
  DIPLOMACY: { icon: '📜', tone: 'info', label: 'Diplomacy', ttl: 10000, tier: 1 },
  BATTLE: { icon: '⚔', tone: 'bad', label: 'Battle', ttl: 9000, tier: 0 },
  FIELD_WIN: { icon: '🎖', tone: 'good', label: 'Battle won', ttl: 10000, tier: 1 },
  CONQUEST: { icon: '🏴', tone: 'war', label: 'Conquest', ttl: 14000, tier: 2 },
  CITY: { icon: '🏛', tone: 'good', label: 'City', ttl: 11000, tier: 1 },
  BUILDING: { icon: '🏗', tone: 'info', label: 'Construction', ttl: 10000, tier: 0 },
  INDUSTRY: { icon: '🏭', tone: 'info', label: 'Industry', ttl: 10000, tier: 0 },
  RESEARCH: { icon: '🔬', tone: 'good', label: 'Research', ttl: 0, tier: 1 },
  ARMY: { icon: '🛡', tone: 'info', label: 'Army', ttl: 8000, tier: 1 },
  COMMANDER: { icon: '🎖', tone: 'good', label: 'Officer staff', ttl: 10000, tier: 0 },
  POLITICS: { icon: '🗳', tone: 'info', label: 'Politics', ttl: 12000, tier: 1 },
  CRISIS: { icon: '⚠', tone: 'bad', label: 'Crisis', ttl: 0, halt: true, tier: 2 },
  NATION: { icon: '☠', tone: 'bad', label: 'Nations', ttl: 12000, tier: 1 },
  HEGEMONY: { icon: '👑', tone: 'good', label: 'Hegemony', ttl: 0, tier: 2 },
  INFO: { icon: '❕', tone: 'info', label: 'Dispatch', ttl: 9000, tier: 0 },
};

/**
 * Kart ekranda durduğu sürece aynı anahtarlı olay ona eklenir; arayüz kartı
 * kapattığında `release` çağırır. Saat 4x'te bir hafta 300 ms sürüyor,
 * birleştirme olmadan aynı türden on kart üst üste binerdi. Paradox oyunları
 * da uyarıları türüne göre tek kutuda sayar.
 *
 * Bu sınır yalnızca arayüzsüz kullanımda (tanılama betikleri) listenin
 * büyümesini engeller.
 */
const MAX_ACTIVE = 12;

/** Kartın kendi ömrü de tazelenir, ama sınırsız değil: en fazla bu kadar. */
const MAX_COUNT = 99;

export class NotificationCenter {
  constructor(game) {
    this.game = game;
    /** Ekranda duran kartlar; birleştirme için tutulur (geçmiş turns.log'da). */
    this.active = [];
    this.nextId = 1;
  }

  /**
   * Olayı karta çevirir. Aynı anahtar hâlâ ekrandaysa yeni kart açmaz, var
   * olanın sayacını artırır ve metnini tazeler.
   * @returns {object|null} kart; gösterilmeyecekse null.
   */
  push(text, meta = {}) {
    if (meta.silent || !text) return null;
    const kindId = NOTIFY[meta.kind] ? meta.kind : 'INFO';
    const kind = NOTIFY[kindId];
    // Anahtar varsayılan olarak türün kendisidir: yüksek hızda akan olaylar
    // (muharebe, büyüme) böylece kendiliğinden tek kartta toplanır.
    const key = meta.key ?? kindId;
    const now = Date.now();

    const existing = this.active.find((item) => item.key === key);
    if (existing) {
      existing.count = Math.min(MAX_COUNT, existing.count + 1);
      existing.text = text;
      existing.tile = meta.tile ?? existing.tile;
      existing.at = now;
      this.game.emit('notify', { entry: existing, repeated: true });
      return existing;
    }

    const tier = meta.tier ?? kind.tier ?? 0;
    const entry = {
      id: this.nextId++,
      key,
      kind: kindId,
      icon: meta.icon ?? kind.icon,
      tone: meta.tone ?? kind.tone,
      label: meta.label ?? kind.label,
      ttl: meta.ttl ?? kind.ttl,
      text,
      tier,
      // Ulusal olayin basligi ile govdesi ayri tutulur: kart basligi buyuk,
      // sonuc cumlesi altinda okunur (bkz. ui/notifications.js).
      title: meta.title ?? null,
      body: meta.body ?? null,
      tile: meta.tile ?? null,
      turn: this.game.turns?.turn ?? 0,
      count: 1,
      at: now,
    };
    this.active.push(entry);
    if (this.active.length > MAX_ACTIVE) this.active.shift();
    // Sonucu olan olay zamani durdurur. Yalnizca YENI kartta: tekrar eden
    // olay (ayni anahtar) oyuncuyu tekrar tekrar duraklatmamali. Varolussal
    // olay (tier 3) turu ne olursa olsun durdurur.
    const halt = meta.halt ?? (kind.halt || tier >= 3);
    if (halt) this.game.setSpeed?.(0);
    this.game.emit('notify', { entry, repeated: false });
    return entry;
  }

  /** Kart ekrandan kalktı: bundan sonrası yeni kart açar, eskiye eklenmez. */
  release(entry) {
    this.active = this.active.filter((item) => item !== entry);
  }

  /**
   * Konusu kapanan kartları düşürür. Savaş ilanı kartı `ttl: 0` ile kalıcıdır
   * (görülmeden geçmesin diye) ama barış imzalandıktan sonra ekranda durması
   * yalan söylemektir: kör beta testçisi barıştan bir yıl sonra hâlâ "Ulheim
   * declared war on us!" kartına bakıyordu (B-020).
   */
  dismissKind(kindId) {
    const doomed = this.active.filter((entry) => entry.kind === kindId);
    if (!doomed.length) return 0;
    this.active = this.active.filter((entry) => entry.kind !== kindId);
    this.game.emit('notify-dismiss', doomed);
    return doomed.length;
  }

  /**
   * Kosulu biten kalici kartlar anahtara gore duser. Kalici (ttl 0) kart
   * "okunana kadar durur" diye tasarlandi (B-018) ama kosulu bittikten sonra
   * durmasi yalan soyler: 1839'un "The state defaults" karti 1865'te borc
   * sifirken hala ekrandaydi (Open Beta 4, B-5).
   */
  dismissKeys(keys) {
    const wanted = new Set(Array.isArray(keys) ? keys : [keys]);
    const doomed = this.active.filter((entry) => wanted.has(entry.key));
    if (!doomed.length) return 0;
    this.active = this.active.filter((entry) => !wanted.has(entry.key));
    this.game.emit('notify-dismiss', doomed);
    return doomed.length;
  }

  clear() {
    this.active = [];
    this.game.emit('notify-clear', null);
  }
}
