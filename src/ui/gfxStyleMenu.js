// HARİTA STİLİ SEÇİMİ — Settings'te "Graphics" bölümü, "Map style".
//
// İki yerde aynı denetim: oyun içi Settings paneli (#settings, Graphics
// satırı) ve ana menünün Settings görünümü (#menu-options). İkisi aynı
// duruma bağlı; biri değişince öteki açılınca doğru görünür.
//
// Seçenekler stil kaydından gelir (gfx/registry.js gfxStyleOptions): yeni bir
// stil kaydedilince menüye kendiliğinden girer, liste burada yazılmaz. Stilin
// `controls` kaydırıcıları (3D: Tilt) seçimin altında, yalnız o stil
// seçiliyken görünür.
//
// Yeni oyuncu Classic ile başlar; seçim tarayıcıda kalır (localStorage).
// ?gfx= o oturum için onu ezer, ?tilt= gibi bir kontrol parametresi de kendi
// kaydırıcısını.
//
// Neden hud.js / index.html değil: paneller sabit işaretlemedir; denetim
// çalışma anında, panellerin kendi sınıflarıyla (.field, .menu-field)
// eklenir ki HUD ve stil sayfası bu özelliğe bağımlı olmasın. Stil ataması
// main.js modülü bittikten sonra (mikro görev) yapılır: o anda window.game
// kurulmuştur.

import { gfxStyleOptions, getGfxStyle } from '../render/gfx/index.js';

const STYLE_KEY = 'hexwar.gfxStyle';
const ctlKey = (style, key) => `hexwar.gfx.${style}.${key}`;

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Özel pencere ya da kapalı depolama: seçim yalnız bu oturumda geçerli.
  }
}

function urlParams() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '');
  } catch {
    return new URLSearchParams();
  }
}

// Oyun içi panelde .field yalnız metin kutusunu biçimliyor; seçim kutusu aynı
// çukur gövdeyi alsın. Ana menünün .menu-field select'i zaten biçimli.
const CSS = `
#settings .gfx-field select { padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line);
  border-radius: var(--radius); background: var(--surface-sunken); color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-md); cursor: pointer; }
#settings .gfx-head + .gfx-field { margin-top: var(--sp-2); }
.gfx-field option { background: var(--surface-1); color: var(--text); }
`;

/** Kontrolün başlangıç değeri: URL (yalnız URL o stili açtıysa) > kayıt > tanım. */
function controlValue(styleName, c) {
  const q = urlParams();
  if (q.get('gfx') === styleName && q.has(c.key)) {
    const n = Number(q.get(c.key));
    if (Number.isFinite(n)) return n;
  }
  const raw = load(ctlKey(styleName, c.key));
  const stored = Number(raw);
  if (raw != null && Number.isFinite(stored)) return stored;
  return c.value;
}

/**
 * Stili seçer. Kontrol değerleri stil seçilmeden ÖNCE tune'a yazılır: ilk
 * karesi doğru eğimle çizilsin (eğim 0'dan 45'e bir karelik sıçrama olmasın).
 */
export function applyGfxStyle(game, name) {
  const r = game?.renderer;
  if (!r) return;
  const style = name === 'classic' ? null : getGfxStyle(name);
  if (!style) name = 'classic';
  for (const c of style?.controls ?? []) style.tune[c.key] = controlValue(name, c);
  if ((r.pendingGfx ?? r.gfxStyle) === name) {
    // Aynı stil (seçili ya da bağlanınca seçilecek): yalnız ayar değişmiş
    // olabilir. Klasikte hiçbir şey yapılmaz, açılış karesi bugünküyle aynı.
    if (!style?.controls?.length) return;
    r.invalidateCache();
  } else if (r.waterGL) {
    r.setGfxStyle(name);
  } else {
    // Yüzey henüz bağlanmadı: renderer bağlanınca kendisi seçer.
    r.pendingGfx = name;
  }
  game.requestRender?.();
}

/**
 * Bir panele denetim kurar. kind 'panel': oyun içi Settings (.field, versal
 * "graphics" satırı); 'menu': ana menü Settings (.menu-field).
 */
function buildInstance(game, kind, parent, before) {
  const fieldClass = kind === 'menu' ? 'menu-field gfx-field' : 'field gfx-field';
  // display: contents — alanlar panelin kendi akışında (aralık, sıra) dursun.
  const box = document.createElement('div');
  box.className = 'gfx-settings';
  box.style.display = 'contents';
  if (kind === 'panel') {
    const head = document.createElement('div');
    head.className = 'action-row gfx-head';
    head.style.marginTop = '14px';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = 'graphics';
    head.append(k);
    box.append(head);
  }
  const label = document.createElement('label');
  label.className = fieldClass;
  const span = document.createElement('span');
  span.textContent = 'Map style';
  const select = document.createElement('select');
  select.id = kind === 'menu' ? 'menu-gfx-style' : 'opt-gfx-style';
  label.append(span, select);
  const controls = document.createElement('div');
  controls.style.display = 'contents';
  box.append(label, controls);
  parent.insertBefore(box, before);
  return { game, kind, fieldClass, select, controls, shown: null };
}

/** Seçili stilin kaydırıcıları; yalnız stil değişince yeniden kurulur. */
function buildControls(inst, name) {
  const { game, controls } = inst;
  inst.shown = name;
  controls.replaceChildren();
  const style = name === 'classic' ? null : getGfxStyle(name);
  for (const c of style?.controls ?? []) {
    const label = document.createElement('label');
    label.className = inst.fieldClass;
    const span = document.createElement('span');
    const val = document.createElement('b');
    // Panel "Map size: 160" dizgisini, menü "MUSIC 42%" dizgisini kullanır.
    span.append(inst.kind === 'menu' ? `${c.label} ` : `${c.label}: `, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(c.min);
    input.max = String(c.max);
    input.step = String(c.step ?? 1);
    const v = style.tune[c.key] ?? c.value;
    input.value = String(v);
    const show = (x) => { val.textContent = c.key === 'tilt' ? `${Math.round(x)}°` : String(x); };
    show(v);
    input.addEventListener('input', () => {
      const x = Number(input.value);
      style.tune[c.key] = x;
      show(x);
      game.requestRender?.();
    });
    // Jest bitince bir kez: pişmiş katmanlar yeni görünüşe göre kurulsun.
    input.addEventListener('change', () => {
      save(ctlKey(name, c.key), input.value);
      game.renderer?.invalidateCache();
      game.requestRender?.();
    });
    label.append(span, input);
    controls.append(label);
  }
}

function syncInstance(inst, options) {
  const r = inst.game.renderer;
  const name = r?.pendingGfx || r?.gfxStyle || 'classic';
  // ?gfx=debug-height gibi listede olmayan stil seçiliyken adıyla görünür.
  const list = options.some((o) => o.name === name) ? options : [...options, { name, label: name }];
  const values = [...inst.select.options].map((o) => o.value).join();
  if (values !== list.map((o) => o.name).join()) {
    inst.select.replaceChildren(...list.map((o) => new Option(o.label, o.name)));
  }
  inst.select.value = name;
  // Kaydırıcı değerleri tune'dan okunur: öteki panelde oynandıysa yeniden kur.
  buildControls(inst, name);
}

export function mountGfxStyleMenu(game) {
  const options = gfxStyleOptions();
  const q = urlParams();
  const stored = load(STYLE_KEY);
  const known = (n) => options.some((o) => o.name === n);
  // Yeni oyuncu: kayıt yok → Classic.
  const initial = q.get('gfx') || (known(stored) ? stored : 'classic');
  applyGfxStyle(game, initial);
  if (document.querySelector('.gfx-settings')) return;

  if (!document.getElementById('gfx-style-menu-css')) {
    const st = document.createElement('style');
    st.id = 'gfx-style-menu-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const instances = [];
  const panel = document.getElementById('settings');
  if (panel) {
    // "save game" ve "menu" satırlarının ardına, ipuçlarından önce.
    instances.push(buildInstance(game, 'panel', panel, document.getElementById('save-info')));
  }
  const menuView = document.getElementById('menu-options');
  if (menuView) {
    // Dil seçiminin hemen önüne: görüntü ayarları bir arada.
    const lang = document.getElementById('menu-lang')?.closest('.menu-field') ?? null;
    instances.push(buildInstance(game, 'menu', menuView, lang));
  }

  const syncAll = () => { for (const inst of instances) syncInstance(inst, options); };
  for (const inst of instances) {
    inst.select.addEventListener('change', () => {
      const name = inst.select.value;
      save(STYLE_KEY, name);
      applyGfxStyle(game, name);
      syncAll();
    });
  }
  // Panel açılınca güncel durum (konsoldan setGfxStyle ya da öteki panel).
  for (const host of [panel, menuView]) {
    if (!host) continue;
    new MutationObserver(() => {
      if (!host.classList.contains('hidden')) syncAll();
    }).observe(host, { attributes: true, attributeFilter: ['class'] });
  }
  syncAll();
}

// main.js tek satırla içe aktarır; oyun nesnesi modül gövdesi bitince hazırdır.
queueMicrotask(function boot(tries = 0) {
  if (globalThis.game?.renderer) mountGfxStyleMenu(globalThis.game);
  else if (tries < 50) setTimeout(() => boot(tries + 1), 100);
});
