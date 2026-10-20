// Harita çekimleri. `camera(f, n, ctx)` sayfada çalışır (toString ile
// taşınır), bu yüzden dışarıdan değişken yakalamamalı; yardımcılar içeride.
// Süreler kurgudaki yerlerinden biraz uzun tutulur (kesim payı).
//
// Savaş çekimleri (WAR_SHOTS) haftalara bölünür: her hafta `fpw` kare çizilir,
// kamera ise çekim boyunca kesintisiz akar. Sonuç: akıcı kamera altında
// haftalık işleyen gerçek cephe.

const NO_POLITICS = { grid: false, country: false, province: false, labels: false };

export const MAP_SHOTS = {
  // Açılış: kıyıya yakın, karanlık deniz, yavaş yanal süzülüş.
  ocean_open: {
    frames: 400, mode: "geography", layers: NO_POLITICS,
    camera: (f, n, { CAP }) => {
      const e = (t) => 1 - Math.pow(1 - t, 3);
      const c = CAP.tileCenter(23, 34);
      const t = f / (n - 1);
      return { x: c.x - 520 + 260 * e(t), y: c.y + 190 - 40 * t, z: 3.4 - 0.5 * e(t) };
    },
  },
  // Kara açılır: kıyıdan geri çekilip Lorania-Eldor bölgesini kapsar.
  land_reveal_geo: {
    frames: 480, mode: "geography", layers: NO_POLITICS,
    camera: (f, n, { CAP }) => {
      const io = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
      const a = CAP.tileCenter(23, 34), b = CAP.nationCenter(42);
      const t = io(f / (n - 1));
      return { x: a.x - 260 + (b.x + 120 - (a.x - 260)) * t, y: a.y + 150 + (b.y - 120 - (a.y + 150)) * t, z: 2.9 * Math.pow(0.62 / 2.9, t) };
    },
  },
  // Oyuncunun ülkesi: hızlı, yönlü itiş (KRİZ dili), oyunun kendi ülke adıyla.
  lorania_intro: {
    frames: 200, mode: "political",
    camera: (f, n, { CAP, ME }) => {
      const o = (t) => 1 - Math.pow(1 - t, 5);
      const c = CAP.nationCenter(ME);
      const t = o(f / (n - 1));
      return { x: c.x - 220 + 200 * t, y: c.y + 40 - 30 * t, z: 0.72 + 0.48 * t };
    },
  },
  // Kaynak haritası: Lorania'dan sınırı geçip Eldor'un kömür eyaletlerine.
  coal_reveal: {
    frames: 300, mode: "resources",
    camera: (f, n, { CAP, ME, FOE }) => {
      const io = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const a = CAP.nationCenter(ME), b = CAP.provinceCenter(91);
      const t = io(f / (n - 1));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 1.05 + 0.55 * t };
    },
    track: ({ S, game, FOE, CAP }) => {
      const out = [];
      for (const p of S.coalProvincesOf(game.world, FOE)) for (const i of p.tileIdx) {
        const t = game.world.tiles[i];
        if (!(p.econ.deposits ?? []).some((d) => d.id === "COAL")) continue;
        const s = CAP.worldToScreen(t.x, t.y); out.push([Math.round(s.x), Math.round(s.y), p.id]);
      }
      return { z: game.camera.zoom, hex: out };
    },
  },
  // Sonuç: aynı kaynak haritası, kömür artık Lorania'nın.
  coal_after: {
    frames: 260, mode: "resources",
    camera: (f, n, { CAP }) => {
      const o = (t) => 1 - Math.pow(1 - t, 3);
      const b = CAP.provinceCenter(91);
      const t = o(f / (n - 1));
      return { x: b.x - 60 + 60 * t, y: b.y + 20, z: 1.75 - 0.35 * t };
    },
  },
  // Kreşendo için kıyı: deniz katmanı, hızlı yanal kayış.
  coast_fast: {
    frames: 120, mode: "political",
    camera: (f, n, { CAP }) => {
      const c = CAP.tileCenter(23, 34);
      return { x: c.x - 160 + 3.2 * f, y: c.y + 60, z: 2.3 };
    },
  },
  // Final: arayüz yok, dünya geri çekilir — genişlemiş Lorania ortada.
  final_world: {
    frames: 600, mode: "political",
    camera: (f, n, { CAP, ME }) => {
      const o = (t) => 1 - Math.pow(1 - t, 4);
      const c = CAP.nationCenter(ME);
      const t = o(f / (n - 1));
      return { x: c.x + 40 * t, y: c.y - 30 * t, z: 1.0 * Math.pow(0.27 / 1.0, t) };
    },
  },
};
// Siyasi sürüm: aynı kamera, sınırlar ve adlarla (kompozitörde sınır izi
// geçişiyle coğrafya sürümünün üstüne açılır).
MAP_SHOTS.land_reveal_pol = { ...MAP_SHOTS.land_reveal_geo, mode: "political",
  layers: { grid: false, country: true, province: true, labels: true } };

// w = savaşın başladığı haftadan itibaren hafta; [w0, w1) aralığında çekilir.
export const WAR_SHOTS = {
  // Emir okları: general seçili, tümenlerin kesikli rotaları görünür.
  war_orders: {
    w0: 0, w1: 6, fpw: 22, selectGeneral: true,
    camera: (f, n, { CAP, ME, FOE }) => {
      const a = CAP.provinceCenter(91);
      const t = f / (n - 1);
      return { x: a.x - 140 + 120 * t, y: a.y + 90 - 20 * t, z: 1.55 + 0.25 * t };
    },
  },
  // Cephe süpürmesi: işgal taraması hafta hafta Eldor'a yayılır; hareket
  // ekranda sağa doğru (kurgu yönü buna göre kurulur).
  war_sweep: {
    w0: 0, w1: 26, fpw: 10,
    camera: (f, n, { CAP, FOE }) => {
      const c = CAP.nationCenter(FOE);
      const t = f / (n - 1);
      return { x: c.x - 150 + 170 * t, y: c.y + 40, z: 1.05 + 0.3 * t };
    },
  },
  // Yakın: başkent çevresinde birlikler ve çatışma.
  war_close: {
    w0: 4, w1: 16, fpw: 14,
    camera: (f, n, { CAP }) => {
      const c = CAP.provinceCenter(131);
      const t = f / (n - 1);
      return { x: c.x - 60 + 110 * t, y: c.y + 10, z: 2.5 + 0.2 * t };
    },
  },
};
