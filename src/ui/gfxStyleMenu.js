// HARİTA STİLİ SEÇİMİ — Layers menüsünde "Map style".
//
// Seçenekler stil kaydından gelir (gfx/registry.js gfxStyleOptions): yeni bir
// stil kaydedilince menüye kendiliğinden girer, liste burada yazılmaz. Stilin
// `controls` kaydırıcıları (3D: Tilt) seçimin altında, yalnız o stil
// seçiliyken görünür.
//
// Seçim tarayıcıda kalır (localStorage); ?gfx= o oturum için onu ezer, ?tilt=
// gibi bir kontrol parametresi de kendi kaydırıcısını.
//
// Neden hud.js değil: katman menüsü index.html'de sabit; denetim çalışma
// anında eklenir ki HUD ve stil sayfası bu özelliğe bağımlı olmasın. Stil
// ataması main.js modülü bittikten sonra (mikro görev) yapılır: o anda
// window.game kurulmuştur.

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

const CSS = `
#layer-menu .gfx-style { display: flex; flex-direction: column; gap: var(--sp-2);
  padding-top: var(--sp-2); border-top: 1px solid var(--line); }
#layer-menu .gfx-style-head { font: 600 10px/1.2 var(--font-ui); letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-mute); }
#layer-menu .gfx-style select { width: 100%; padding: 3px 6px; font: 13px var(--font-ui);
  color: var(--text); background: var(--surface-2); border: 1px solid var(--line-brass);
  border-radius: var(--radius); cursor: pointer; }
#layer-menu .gfx-style select:focus-visible { outline: 1px solid var(--gold-bright); outline-offset: 1px; }
#layer-menu .gfx-style option { background: var(--surface-1); color: var(--text); }
#layer-menu .gfx-ctl { flex-direction: column; align-items: stretch; gap: 4px; }
#layer-menu .gfx-ctl span { display: flex; justify-content: space-between; gap: var(--sp-2);
  font-size: 12px; color: var(--text-dim); }
#layer-menu .gfx-ctl b { color: var(--gold-bright); font-weight: 600; font-variant-numeric: tabular-nums; }
#layer-menu .gfx-ctl input[type=range] { width: 100%; height: 16px; margin: 0; }
`;

/** Kontrolün başlangıç değeri: URL (yalnız URL o stili açtıysa) > kayıt > tanım. */
function controlValue(styleName, c) {
  const q = urlParams();
  if (q.get('gfx') === styleName && q.has(c.key)) {
    const n = Number(q.get(c.key));
    if (Number.isFinite(n)) return n;
  }
  const stored = Number(load(ctlKey(styleName, c.key)));
  if (load(ctlKey(styleName, c.key)) != null && Number.isFinite(stored)) return stored;
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

export function mountGfxStyleMenu(game) {
  const menu = document.getElementById('layer-menu');
  const options = gfxStyleOptions();
  const q = urlParams();
  const stored = load(STYLE_KEY);
  const known = (n) => options.some((o) => o.name === n);
  const initial = q.get('gfx') || (known(stored) ? stored : 'classic');
  applyGfxStyle(game, initial);
  if (!menu || menu.querySelector('.gfx-style')) return;

  if (!document.getElementById('gfx-style-menu-css')) {
    const st = document.createElement('style');
    st.id = 'gfx-style-menu-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const box = document.createElement('div');
  box.className = 'gfx-style';
  const head = document.createElement('div');
  head.className = 'gfx-style-head';
  head.id = 'gfx-style-head';
  head.textContent = 'Map style';
  const select = document.createElement('select');
  select.id = 'opt-gfx-style';
  select.setAttribute('aria-labelledby', 'gfx-style-head');
  const controls = document.createElement('div');
  controls.className = 'gfx-style';
  controls.style.cssText = 'padding:0;border:0';
  box.append(head, select, controls);
  menu.insertBefore(box, document.getElementById('seed-chip'));

  const current = () => game.renderer?.pendingGfx || game.renderer?.gfxStyle || 'classic';

  const buildControls = (name) => {
    controls.replaceChildren();
    const style = name === 'classic' ? null : getGfxStyle(name);
    for (const c of style?.controls ?? []) {
      const label = document.createElement('label');
      label.className = 'gfx-ctl';
      const text = document.createElement('span');
      const val = document.createElement('b');
      text.append(c.label, val);
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
      label.append(text, input);
      controls.append(label);
    }
  };

  const sync = () => {
    const name = current();
    const list = known(name) ? options : [...options, { name, label: name }];
    if (select.options.length !== list.length) {
      select.replaceChildren(...list.map((o) => new Option(o.label, o.name)));
    }
    select.value = name;
    buildControls(name);
  };

  select.addEventListener('change', () => {
    const name = select.value;
    save(STYLE_KEY, name);
    applyGfxStyle(game, name);
    buildControls(name);
  });
  // Konsoldan (setGfxStyle) değişen stil menü açılınca doğru görünsün.
  new MutationObserver(() => {
    if (!menu.classList.contains('hidden')) sync();
  }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  sync();
}

// main.js tek satırla içe aktarır; oyun nesnesi modül gövdesi bitince hazırdır.
queueMicrotask(function boot(tries = 0) {
  if (globalThis.game?.renderer) mountGfxStyleMenu(globalThis.game);
  else if (tries < 50) setTimeout(() => boot(tries + 1), 100);
});
