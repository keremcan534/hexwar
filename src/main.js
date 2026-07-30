// Giriş noktası.

import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('map');
const game = new Game(canvas);
new Hud(game);

// URL'de ?seed=ABC123 varsa o dünyayı aç (paylaşılabilir haritalar).
// Yoksa kaldığı yerden devam et: 300 turluk oyun tek oturumda bitmez.
const params = new URLSearchParams(location.search);
const seed = params.get('seed');
if (seed) game.newWorld(seed);
else if (!game.load()) game.newWorld();

// Hata ayıklama için konsoldan erişim.
window.game = game;
