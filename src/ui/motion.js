// Panellerin açılış/kapanış hareketi — `.hidden` ile yönetilen her kutu için
// TEK yol.
//
// Açılış CSS'tedir (§31: `:not(.hidden)` görünür olunca animasyon kendiliğinden
// oynar). Kapanış CSS'le yapılamaz: `.hidden` display'i anında kapatır ve
// kutu çıkış hareketi başlamadan kaybolur. Bu yüzden kapanışta önce
// `is-leaving` takılır, hareket bitince `.hidden` gelir.
//
// Hareket OYUNUN ayarıdır (Settings → Interface animations, kök data-motion);
// kapalıyken her şey anında olur.

/** Çıkış hareketinin süresi; §31'deki `ui-*-out` animasyonlarıyla aynı. */
export const LEAVE_MS = 170;

export function motionOn() {
  return document.documentElement.dataset.motion !== 'off';
}

/** Paneli açar; yarıda kalmış bir kapanışı iptal eder. */
export function showPanel(el) {
  if (!el) return;
  clearTimeout(el.__leaveTimer);
  el.__leaveTimer = 0;
  el.classList.remove('is-leaving', 'hidden');
}

/**
 * Paneli kapatır: önce çıkış hareketi, sonra `.hidden`. `done` kutu gerçekten
 * gizlendiğinde çağrılır (içeriği temizlemek gibi işler oraya).
 */
export function hidePanel(el, done = null) {
  if (!el) return;
  if (el.classList.contains('hidden') || !motionOn()) {
    clearTimeout(el.__leaveTimer);
    el.__leaveTimer = 0;
    el.classList.remove('is-leaving');
    el.classList.add('hidden');
    done?.();
    return;
  }
  if (el.__leaveTimer) return;
  el.classList.add('is-leaving');
  el.__leaveTimer = setTimeout(() => {
    el.__leaveTimer = 0;
    el.classList.remove('is-leaving');
    el.classList.add('hidden');
    done?.();
  }, LEAVE_MS);
}

/** Açık mı? Kapanmakta olan kutu kapalı sayılır. */
export function panelOpen(el) {
  return Boolean(el) && !el.classList.contains('hidden') && !el.classList.contains('is-leaving');
}

/** Aç/kapa; `force` verilirse o duruma getirir. Yeni durumu döndürür. */
export function togglePanel(el, force = undefined) {
  const open = force ?? !panelOpen(el);
  if (open) showPanel(el);
  else hidePanel(el);
  return open;
}
