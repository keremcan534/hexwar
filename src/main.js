// Giriş noktası.

// İlk modül: arayüz ölçeği (--ui) HUD kurulup ölçmeden önce yazılsın.
import './ui/uiScale.js';
import { Game } from './game/game.js';
import { Hud } from './ui/hud.js';
import { mountTooltips } from './ui/tooltip.js';
import { registerTooltips } from './ui/tooltipData.js';
import { MainMenu } from './ui/mainMenu.js';
import { Notifications } from './ui/notifications.js';
import { AlertStrip } from './ui/alerts.js';
import { MovementDock } from './ui/movementDock.js';
import { NavyDock } from './ui/navyDock.js';
import { BattlePanel } from './ui/battlePanel.js';
import { UnitHover } from './ui/unitHover.js';
import { FrontPlates } from './ui/frontPlates.js';
import { NationPicker } from './ui/nationPicker.js';
import { PerfOverlay } from './ui/perfOverlay.js';
import { GameMusic } from './ui/gameMusic.js';
import { EventCards } from './ui/eventCard.js';
import { Ambience } from './ui/ambience.js';
import { UiSound } from './ui/uiSound.js';
import { DiscoveryCard } from './ui/discoveryCard.js';
import { currentTheme, initTheme, mountThemeSettings, setTheme } from './ui/theme.js';
import './ui/gfxStyleMenu.js';
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

// ?skin=0: kaplamasız açılış. Malzeme değişikliği "daha iyi mi" diye ancak
// aynı oyunda yan yana bakılarak tartılır; katman tek kuraldan söküldüğü için
// taban görünüm birebir geri gelir (bkz. index.html #css-cascade, skin.css).
if (new URLSearchParams(location.search).get('skin') === '0') {
  const sheet = document.getElementById('css-cascade')?.sheet;
  const rules = sheet ? [...sheet.cssRules] : [];
  const at = rules.findIndex((rule) => rule instanceof CSSImportRule && rule.href.endsWith('skin.css'));
  if (at >= 0) sheet.deleteRule(at);
}

// Tema (koyu / açık çelik): kayıtlı seçim ya da ?theme=light. Kaplama sökme
// işinden SONRA kurulur ki açık kopyalar sökülmüş kurallardan üretilmesin.
initTheme();

const canvas = document.getElementById('map');
const game = new Game(canvas);
const hud = new Hud(game);
new Notifications(game);
// Sag ust: ulusal hareketler (bildirim kartlari sag alttaki sayaca indi).
new MovementDock(game);
// Sol: donanma paneli, yalnız deniz haritası (Seas kipi) açıkken.
new NavyDock(game);
new BattlePanel(game);
new UnitHover(game);
// Cephe levhaları: general portresi + cephedeki insan (bkz. ui/frontPlates.js).
// Konsoldan sınama ve ölçüm için oyuna bağlı (game.frontPlates.setEnabled).
game.frontPlates = new FrontPlates(game);
// Seçenekli olay kartları: açılınca saati durdurur (bkz. ui/eventCard.js).
new EventCards(game);

// Sürekli uyarı şeridi: baloncuktan farkı, DURUM sürdükçe durmasıdır.
// Haftalık kapanışta ve dünya değişince yeniden ölçülür; içerik değişmediyse
// DOM'a hiç dokunmaz (bkz. AlertStrip.refresh).
const alerts = new AlertStrip(game);
for (const event of ['turn', 'economy', 'politics', 'world', 'provinces']) {
  game.on?.(event, () => alerts.refresh());
}
alerts.refresh();

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
// Kayıtlar IndexedDB yuvalarındadır (game/saveStore.js): okuma zaman uyumsuz,
// menü yükleme bitmeden kurulmaz.
// window.game bekleyişten ÖNCE: sonraki modül (lab/entegre.js, deniz) onu
// değerlendirildiği anda okur ve üst düzey await onu beklemez.
window.game = game;
let resumable = false;
if (seed) game.newWorld(seed);
else {
  resumable = (await game.load()).ok;
  if (!resumable) game.newWorld();
}

// Ülke seçimi: yeni dünya kurulunca perde kalkar, oyuncu ülkesini haritadan
// ya da listeden seçer (bkz. ui/nationPicker.js). Kayıttan dönüşte açılmaz.
const picker = new NationPicker(game);
hud.bindPicker(picker);

// Paylaşılan tohum linki doğrudan haritayı açar; menü perdesi araya girmez.
const menu = new MainMenu(game, {
  resumable,
  onWorldBuilt: () => picker.open(),
  onOpen: () => picker.close(),
});
if (!seed) menu.open();
else picker.open();
hud.bindMenu(menu);
// Oyun müziği: savaş/barış/seferberlik/devlet/deniz/kargaşa, oyunun hâline göre
// (bkz. ui/gameMusic.js). Menü açıkken susar, menü müziği çalar.
game.music = new GameMusic(game, hud.screens, menu);

// Harita ambiyansı (bkz. ui/ambience.js): Settings paneline kendi "audio"
// satırını ekler. Konsoldan denetim için oyuna bağlı: game.ambience.state().
game.ambience = new Ambience(game);

// Arayüz sesleri (bkz. ui/uiSound.js): Settings'e kendi "interface" satırını
// ekler; ambiyanstan SONRA kurulur ki satır onun altına gelsin. Konsoldan
// sınama için oyuna bağlı: game.uiSound.play('discovery').
game.uiSound = new UiSound();
// Görünüm satırı (koyu / açık çelik): Settings'te grafik stilinin altına.
// Konsoldan sınama için oyuna bağlı: game.theme.set('light').
mountThemeSettings();
game.theme = { set: setTheme, get: currentTheme };
// Keşif kartı: oyuncunun araştırması bitince resimli kart (ui/discoveryCard.js).
new DiscoveryCard(game, { screens: hud.screens, sound: game.uiSound });

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
