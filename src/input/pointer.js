// Tek giriş katmanı: dokunmatik + fare + tekerlek.
//
// HOI4 semantiği:
//   sol tık            → seç
//   sol sürükle        → kutu (marquee) seçimi, masaüstünde klasör seçer gibi
//   sağ tık            → seçili birimleri yürüt
//   sağ sürükle        → bırakılan province'e yürüt
//   orta sürükle       → kamerayı kaydır (sol tuş artık seçim için ayrıldı)
//   tekerlek           → yakınlaş
//
// Dokunmatikte sağ tuş yok: tek parmak kaydırır, basılı tutup sürüklemek kutu
// seçimi yapar, iki parmak pinch zoom.

const TAP_MOVE_LIMIT = 12;   // CSS piksel
const TAP_TIME_LIMIT = 300;  // ms
const LONG_PRESS_MS = 380;   // dokunmatikte kutu seçimini baslatan basili tutma
/** Sol sürükleme bu eşiği geçmeden seçim kutusu sayılmaz (titreme tıklamayı yemesin). */
const MARQUEE_MIN = 10;

export class PointerController {
  /**
   * @param {HTMLElement} el
   * @param {import('../render/camera.js').Camera} camera
   * @param {object} handlers
   */
  constructor(el, camera, handlers = {}) {
    this.el = el;
    this.camera = camera;
    this.handlers = handlers;
    this.pointers = new Map();
    this.lastPinchDist = 0;
    this.lastMid = null;
    this.velocity = { x: 0, y: 0 };
    this.lastMoveTime = 0;
    this.gesture = null; // 'pan' | 'pinch'
    this.rightDrag = null;   // { id, points[] } — sag tus yuruyus jesti
    this.marquee = null;     // { id, start, current, active } — kutu secimi
    this.longPress = 0;

    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp, { passive: false });
    el.addEventListener('pointercancel', this.onUp, { passive: false });
    el.addEventListener('pointerleave', this.onUp, { passive: false });
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy() {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('pointerleave', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
    this.clearLongPress();
  }

  localPos(e) {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Dokunmatikte basılı tutmak kutu seçimini başlatır; kaydırmayla karışmasın diye eşikli. */
  armLongPress(e) {
    this.clearLongPress();
    const start = this.localPos(e);
    this.longPress = setTimeout(() => {
      const rec = this.pointers.get(e.pointerId);
      if (!rec || rec.moved > TAP_MOVE_LIMIT) return;
      this.pointers.delete(e.pointerId);
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.beginMarquee(e.pointerId, start);
    }, LONG_PRESS_MS);
  }

  clearLongPress() {
    if (this.longPress) clearTimeout(this.longPress);
    this.longPress = 0;
  }

  /**
   * Pointer capture kaybolan parmagi da takip etmek icindir; basarisiz olmasi
   * jesti iptal etmemeli (etkin olmayan pointerId'de NotFoundError atar).
   */
  capture(pointerId) {
    try { this.el.setPointerCapture?.(pointerId); } catch { /* capture zorunlu degil */ }
  }

  release(pointerId) {
    try { this.el.releasePointerCapture?.(pointerId); } catch { /* zaten birakilmis */ }
  }

  /** Secim kutusunu baslatir. Eski cizim-kipi kancasi geriye uyumludur. */
  beginMarquee(pointerId, start) {
    if (this.handlers.isDrawMode?.()) {
      this.rightDrag = { id: pointerId, points: [start], moved: TAP_MOVE_LIMIT + 1 };
      this.capture(pointerId);
      this.handlers.onRightDragStart?.(start.x, start.y);
      return;
    }
    this.marquee = { id: pointerId, start, current: start, active: false };
    this.capture(pointerId);
    this.handlers.onMarqueeStart?.(start.x, start.y);
  }

  marqueeRect() {
    const m = this.marquee;
    if (!m) return null;
    return {
      x: Math.min(m.start.x, m.current.x),
      y: Math.min(m.start.y, m.current.y),
      w: Math.abs(m.current.x - m.start.x),
      h: Math.abs(m.current.y - m.start.y),
    };
  }

  onDown = (e) => {
    const mouse = e.pointerType === 'mouse';

    // Sağ tuş: tikta veya surukleyip birakista yuruyus emri.
    if (mouse && e.button === 2) {
      e.preventDefault();
      const p = this.localPos(e);
      // Durum capture'dan önce kurulur: capture başarısız olsa da çizim başlasın.
      this.rightDrag = { id: e.pointerId, points: [p], moved: 0 };
      this.capture(e.pointerId);
      this.handlers.onRightDragStart?.(p.x, p.y);
      return;
    }

    // Orta tuş kamerayı kaydırır; sol tuş artık seçim için ayrılmıştır.
    if (mouse && e.button === 1) {
      e.preventDefault();
      this.capture(e.pointerId);
      const p = this.localPos(e);
      this.pointers.set(e.pointerId, {
        ...p, startX: p.x, startY: p.y, startTime: performance.now(), moved: 0, pan: true,
      });
      this.gesture = 'pan';
      return;
    }

    if (mouse && e.button !== 0) return;

    if (mouse) {
      // Masaüstünde sol basış kutu seçiminin başlangıcıdır; eşiği geçmezse tıklama sayılır.
      e.preventDefault();
      this.beginMarquee(e.pointerId, this.localPos(e));
      return;
    }

    // Istege bagli kip kancasi eski istemcilerle uyumluluk icindir.
    if (this.handlers.isDrawMode?.()) {
      e.preventDefault();
      this.beginMarquee(e.pointerId, this.localPos(e));
      return;
    }

    this.armLongPress(e);
    this.capture(e.pointerId);
    const p = this.localPos(e);
    this.pointers.set(e.pointerId, {
      ...p, startX: p.x, startY: p.y, startTime: performance.now(), moved: 0,
    });
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.gesture = this.pointers.size >= 2 ? 'pinch' : 'pan';
    if (this.pointers.size === 2) this.resetPinch();
  };

  onMove = (e) => {
    if (this.rightDrag?.id === e.pointerId) {
      e.preventDefault();
      const p = this.localPos(e);
      const last = this.rightDrag.points[this.rightDrag.points.length - 1];
      this.rightDrag.moved += Math.hypot(p.x - last.x, p.y - last.y);
      this.rightDrag.points.push(p);
      this.handlers.onRightDragMove?.(p.x, p.y);
      return;
    }

    if (this.marquee?.id === e.pointerId) {
      e.preventDefault();
      this.marquee.current = this.localPos(e);
      const rect = this.marqueeRect();
      // Eşiği geçince kutu "etkin" olur; altında kalırsa bırakışta tıklama sayılır.
      if (!this.marquee.active && Math.hypot(rect.w, rect.h) >= MARQUEE_MIN) {
        this.marquee.active = true;
      }
      if (this.marquee.active) this.handlers.onMarqueeMove?.(rect);
      this.handlers.onChange?.();
      return;
    }

    const rec = this.pointers.get(e.pointerId);
    if (!rec) {
      if (e.pointerType === 'mouse' && this.handlers.onHover) {
        const p = this.localPos(e);
        this.handlers.onHover(p.x, p.y);
      }
      return;
    }
    e.preventDefault();
    const p = this.localPos(e);
    const dx = p.x - rec.x;
    const dy = p.y - rec.y;
    rec.moved += Math.hypot(dx, dy);
    rec.x = p.x;
    rec.y = p.y;

    if (this.pointers.size === 1) {
      this.camera.panByScreen(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMoveTime);
      // Yumuşatılmış hız: bırakınca kayma (flick) için.
      this.velocity.x = this.velocity.x * 0.6 + (dx / dt) * 0.4 * 16;
      this.velocity.y = this.velocity.y * 0.6 + (dy / dt) * 0.4 * 16;
      this.lastMoveTime = now;
    } else if (this.pointers.size >= 2) {
      this.gesture = 'pinch';
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.lastPinchDist > 0) {
        this.camera.zoomAt(mid.x, mid.y, dist / this.lastPinchDist);
        if (this.lastMid) {
          this.camera.panByScreen(mid.x - this.lastMid.x, mid.y - this.lastMid.y);
        }
      }
      this.lastPinchDist = dist;
      this.lastMid = mid;
    }
    this.handlers.onChange?.();
  };

  onUp = (e) => {
    if (this.rightDrag?.id === e.pointerId) {
      const { points, moved } = this.rightDrag;
      const last = points[points.length - 1];
      this.rightDrag = null;
      this.release(e.pointerId);
      // Sürüklenmediyse bu bir sağ tıktır: yürüyüş emri.
      if (moved < TAP_MOVE_LIMIT) {
        this.handlers.onRightDragCancel?.();
        this.handlers.onRightTap?.(last.x, last.y);
      } else {
        this.handlers.onRightDragEnd?.(points);
      }
      this.handlers.onChange?.();
      return;
    }

    if (this.marquee?.id === e.pointerId) {
      const { active, start } = this.marquee;
      const rect = this.marqueeRect();
      this.marquee = null;
      this.release(e.pointerId);
      if (active) this.handlers.onMarqueeEnd?.(rect);
      else this.handlers.onTap?.(start.x, start.y);
      this.handlers.onChange?.();
      return;
    }

    this.clearLongPress();
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    this.pointers.delete(e.pointerId);
    this.release(e.pointerId);

    const duration = performance.now() - rec.startTime;
    const isTap = !rec.pan
      && rec.moved < TAP_MOVE_LIMIT
      && duration < TAP_TIME_LIMIT
      && this.gesture !== 'pinch';
    if (isTap) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.handlers.onTap?.(rec.x, rec.y);
    }

    if (this.pointers.size < 2) this.resetPinch();
    if (this.pointers.size === 0) this.gesture = null;
    this.handlers.onChange?.();
  };

  onWheel = (e) => {
    e.preventDefault();
    const p = this.localPos(e);
    const factor = Math.pow(0.999, e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    this.camera.zoomAt(p.x, p.y, factor);
    this.handlers.onChange?.();
  };

  resetPinch() {
    this.lastPinchDist = 0;
    this.lastMid = null;
  }

  /** Her karede çağrılır; parmak kalktıktan sonraki kaymayı sürdürür. */
  update() {
    if (this.pointers.size > 0) return false;
    const v = this.velocity;
    if (Math.abs(v.x) < 0.05 && Math.abs(v.y) < 0.05) {
      v.x = 0;
      v.y = 0;
      return false;
    }
    this.camera.panByScreen(v.x, v.y);
    v.x *= 0.9;
    v.y *= 0.9;
    return true;
  }
}
