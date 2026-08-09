// Bildirim merkezi: günlüğe düşen olayları oyuncunun göreceği kartlara çevirir.
// Burada DOM yok — kartları `ui/notifications.js` çizer, bu katman yalnızca
// olayın ne olduğunu, ne kadar önemli olduğunu ve nereye baktığını bilir.

/**
 * Kart türleri. `ttl` 0 ise kart kendiliğinden kapanmaz: savaş ilanı ya da
 * kıtlık gibi oyuncunun görmeden geçmemesi gereken olaylar elle kapatılır.
 */
export const NOTIFY = {
  WAR: { icon: '⚔', tone: 'war', label: 'War', ttl: 0 },
  PEACE: { icon: '🕊', tone: 'good', label: 'Peace', ttl: 12000 },
  DIPLOMACY: { icon: '📜', tone: 'info', label: 'Diplomacy', ttl: 10000 },
  BATTLE: { icon: '⚔', tone: 'bad', label: 'Battle', ttl: 9000 },
  FIELD_WIN: { icon: '🎖', tone: 'good', label: 'Battle won', ttl: 10000 },
  CONQUEST: { icon: '🏴', tone: 'war', label: 'Conquest', ttl: 14000 },
  CITY: { icon: '🏛', tone: 'good', label: 'City', ttl: 11000 },
  GROWTH: { icon: '👥', tone: 'info', label: 'Growth', ttl: 8000 },
  BUILDING: { icon: '🏗', tone: 'info', label: 'Construction', ttl: 10000 },
  INDUSTRY: { icon: '🏭', tone: 'info', label: 'Industry', ttl: 10000 },
  INFRA: { icon: '🛤', tone: 'info', label: 'Infrastructure', ttl: 8000 },
  RESEARCH: { icon: '🔬', tone: 'good', label: 'Research', ttl: 11000 },
  ARMY: { icon: '🛡', tone: 'info', label: 'Army', ttl: 8000 },
  COMMANDER: { icon: '🎖', tone: 'good', label: 'Officer staff', ttl: 10000 },
  PROVINCE: { icon: '⛏', tone: 'info', label: 'Province', ttl: 9000 },
  CRISIS: { icon: '⚠', tone: 'bad', label: 'Crisis', ttl: 0 },
  NATION: { icon: '☠', tone: 'bad', label: 'Nations', ttl: 12000 },
  HEGEMONY: { icon: '👑', tone: 'good', label: 'Hegemony', ttl: 0 },
  INFO: { icon: '❕', tone: 'info', label: 'Dispatch', ttl: 9000 },
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

    const entry = {
      id: this.nextId++,
      key,
      kind: kindId,
      icon: meta.icon ?? kind.icon,
      tone: meta.tone ?? kind.tone,
      label: meta.label ?? kind.label,
      ttl: meta.ttl ?? kind.ttl,
      text,
      tile: meta.tile ?? null,
      turn: this.game.turns?.turn ?? 0,
      count: 1,
      at: now,
    };
    this.active.push(entry);
    if (this.active.length > MAX_ACTIVE) this.active.shift();
    this.game.emit('notify', { entry, repeated: false });
    return entry;
  }

  /** Kart ekrandan kalktı: bundan sonrası yeni kart açar, eskiye eklenmez. */
  release(entry) {
    this.active = this.active.filter((item) => item !== entry);
  }

  clear() {
    this.active = [];
    this.game.emit('notify-clear', null);
  }
}
