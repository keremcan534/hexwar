// Giriş noktası.

import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('map');
const game = new Game(canvas);
new Hud(game);

// URL'de ?seed=ABC123 varsa o dünyayı aç (paylaşılabilir haritalar).
const params = new URLSearchParams(location.search);
game.newWorld(params.get('seed') || undefined);

// Hata ayıklama için konsoldan erişim.
window.game = game;
