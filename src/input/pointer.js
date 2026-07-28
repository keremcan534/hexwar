// Tek giriş katmanı: dokunmatik + fare + tekerlek. Pinch zoom ve kaydırma ataleti dahil.

const TAP_MOVE_LIMIT = 12;   // CSS piksel
const TAP_TIME_LIMIT = 300;  // ms

export class PointerController {
  /**
   * @param {HTMLElement} el
   * @param {import('../render/camera.js').Camera} camera
   * @param {{ onTap?: (x:number,y:number)=>void, onChange?: ()=>void, onHover?: (x:number,y:number)=>void }} handlers
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
  }

  localPos(e) {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.el.setPointerCapture?.(e.pointerId);
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
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    this.pointers.delete(e.pointerId);
    this.el.releasePointerCapture?.(e.pointerId);

    const duration = performance.now() - rec.startTime;
    const isTap = rec.moved < TAP_MOVE_LIMIT && duration < TAP_TIME_LIMIT && this.gesture !== 'pinch';
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
