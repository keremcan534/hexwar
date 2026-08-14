// Giriş noktası.

import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { MainMenu } from './ui/mainMenu.js';
import { Notifications } from './ui/notifications.js';
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

// Hata ayıklama için konsoldan erişim.
window.game = game;
window.menu = menu;
