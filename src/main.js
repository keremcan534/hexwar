// Giriş noktası.

import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { mountTooltips } from './ui/tooltip.js';
import { registerTooltips } from './ui/tooltipData.js';
import { MainMenu } from './ui/mainMenu.js';
import { Notifications } from './ui/notifications.js';
import { PerfOverlay } from './ui/perfOverlay.js';
import { materials } from './render/textures.js';

// Yüzey dokuları bir kez üretilip CSS'e verilir. Çalışma anında hesaplandığı
// için depoda ikili dosya, indirilen görsel ya da derleme adımı yok
// (bkz. textures.js). Panel ve harita ayrı malzeme kullanır: biri mat metal
// greni, diğeri atlas kâğıdı greni.
{
  const mat = materials();
  const root = document.documentElement.style;
  root.setProperty('--ui-grain', `url("${mat.uiMetal.toDataURL('image/png')}")`);
  root.setProperty('--map-grain', `url("${mat.filmGrain.toDataURL('image/png')}")`);
}

const canvas = document.getElementById('map');
const game = new Game(canvas);
const hud = new Hud(game);
new Notifications(game);

// Gecikmeli bilgi kartlari TEK yerden kurulur (bkz. ui/tooltip.js): ekranlar
// her tazelemede innerHTML'i bastan yazdigi icin dinleyici koktedir, ogeler
// yalniz `data-tip` ozniteligi tasir.
mountTooltips();
registerTooltips(game);

// URL'de ?seed=ABC123 varsa o dünyayı aç (paylaşılabilir haritalar).
// Yoksa kaldığı yerden devam et: 300 turluk oyun tek oturumda bitmez.
const params = new URLSearchParams(location.search);
const seed = params.get('seed');
// Dünya menüden önce kurulur: perde kalktığı anda oyun hazır olmalı, ayrıca
// kayıt yüklenmeden "Devam Et"in gerçekten devam edeceği bilinemez.
const resumable = !seed && game.load();
if (seed) game.newWorld(seed);
else if (!resumable) game.newWorld();

// Paylaşılan tohum linki doğrudan haritayı açar; menü perdesi araya girmez.
const menu = new MainMenu(game, { resumable });
if (!seed) menu.open();
hud.bindMenu(menu);

// Geliştirici performans kaplaması: F3 ya da ?perf=1 (bkz. ui/perfOverlay.js).
new PerfOverlay(game);

// Ağır tek-seferlik işler (su dokuları, uzak-zoom dünya dokusu) menü perdesi
// arkasında dilim dilim ısıtılır: ilk harita karesi senkron pişirme ödemesin
// (ölçüldü: doku üretimi 227 ms + uzak pişirme 111 ms tek karede). Yeni dünya
// kurulunca ısıtma baştan başlar.
{
  let warming = 0;
  const warm = () => {
    warming = 0;
    if (!game.world) return;
    if (game.renderer.warmup(game.world)) warming = setTimeout(warm, 40);
  };
  const kick = () => {
    if (!warming) warming = setTimeout(warm, 80);
  };
  kick();
  game.on('world', kick);
}

// Hata ayıklama için konsoldan erişim.
window.game = game;
window.menu = menu;
