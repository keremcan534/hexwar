// Kamera: dünya <-> ekran dönüşümü, zoom sınırları, kenar kilidi.

export class Camera {
  constructor() {
    this.x = 0;         // dünya koordinatında merkez
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.25;
    this.maxZoom = 3.5;
    this.viewWidth = 1;   // CSS piksel
    this.viewHeight = 1;
    this.bounds = null;   // { minX, minY, maxX, maxY }
  }

  setViewport(width, height) {
    this.viewWidth = width;
    this.viewHeight = height;
    this.clamp();
  }

  setBounds(bounds) {
    this.bounds = bounds;
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    // Tüm dünyayı görebilecek kadar uzaklaşmaya izin ver, daha fazlasına değil.
    const fit = Math.min(this.viewWidth / worldW, this.viewHeight / worldH);
    this.minZoom = Math.min(0.9, fit * 0.9);
    this.clamp();
  }

  /** Dünyayı ekrana sığdır ve ortala. */
  fit(padding = 0.92) {
    if (!this.bounds) return;
    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    this.zoom = Math.min(this.viewWidth / w, this.viewHeight / h) * padding;
    this.x = (this.bounds.minX + this.bounds.maxX) / 2;
    this.y = (this.bounds.minY + this.bounds.maxY) / 2;
    this.clamp();
  }

  centerOn(worldX, worldY) {
    this.x = worldX;
    this.y = worldY;
    this.clamp();
  }

  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  /** Ekranda verilen noktayı sabit tutarak zoom yapar (pinch/tekerlek merkezi). */
  zoomAt(screenX, screenY, factor) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  clamp() {
    if (!this.bounds) return;
    const halfW = this.viewWidth / (2 * this.zoom);
    const halfH = this.viewHeight / (2 * this.zoom);
    const b = this.bounds;
    // Dünya ekrandan küçükse ortala, büyükse kenardan dışarı çıkmayı engelle.
    if (b.maxX - b.minX < halfW * 2) this.x = (b.minX + b.maxX) / 2;
    else this.x = Math.min(b.maxX - halfW, Math.max(b.minX + halfW, this.x));
    if (b.maxY - b.minY < halfH * 2) this.y = (b.minY + b.maxY) / 2;
    else this.y = Math.min(b.maxY - halfH, Math.max(b.minY + halfH, this.y));
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.viewWidth / 2,
      y: (wy - this.y) * this.zoom + this.viewHeight / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewWidth / 2) / this.zoom + this.x,
      y: (sy - this.viewHeight / 2) / this.zoom + this.y,
    };
  }

  /** Görünen dünya dikdörtgeni (kırpma için). */
  visibleRect(margin = 0) {
    const halfW = this.viewWidth / (2 * this.zoom) + margin;
    const halfH = this.viewHeight / (2 * this.zoom) + margin;
    return {
      minX: this.x - halfW, maxX: this.x + halfW,
      minY: this.y - halfH, maxY: this.y + halfH,
    };
  }
}
