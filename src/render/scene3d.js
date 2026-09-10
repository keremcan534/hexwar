// ARAZİ SAHNESİ — yükseklik artık ışık değil GEOMETRİ.
//
// Bu dosya haritanın yüzeyini üç boyutlu bir mesh olarak çizer. Malzeme
// surfaceGL ile ORTAKTIR (bkz. SURFACE_LIB / SURFACE_BODY): aynı pigment,
// aynı kabartma ışığı, aynı deniz. Değişen tek şey `world`ün nereden
// geldiğidir — tam ekran sunumu onu ekran koordinatından ters afinle türetir,
// burada vertex taşır.
//
// NEDEN AYNI BAĞLAM: `#map-water` tuvali tek bir WebGL2 bağlamı verebilir.
// three.js kendi bağlamını açmaya kalksa iki sunum yan yana yaşayamaz ve
// A/B karşılaştırması — bu portun tek güvenlik ağı — imkânsızlaşırdı.
// Bağlamı renderer açar, ikisi de onu ödünç alır (bkz. renderer.attachWater).
//
// KOORDİNAT EŞLEMESİ. Oyun dünyası Canvas2D geleneğindedir: y AŞAĞI. three
// ise y YUKARI çalışır. Eşleme tek satırdır ve her yerde aynıdır:
//
//     three.x = world.x        three.y = -world.y        three.z = yükseklik
//
// Eğim SIFIRKEN ortografik izdüşüm bugünkü afin dönüşümle BİREBİR aynıdır —
// piksel-eş referans testi bunun üstüne kurulu (scripts/audit/surface-ab).
//
// Katman notu: GPU'ya ve DOM'a dokunur, oyun durumuna dokunmaz.

import * as THREE from 'three';
import { SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import {
  SURFACE_LIB, SURFACE_BODY, buildSurfaceFields, buildWaveTexture, defaultTune, fieldOf,
} from './surfaceGL.js';
import { GpuTimer } from './gpuTimer.js';

const HEX_STEP = SQRT3 * HEX_SIZE;

/**
 * Yükseklik ölçeği (dünya birimi). Yükseklik alanı 0..1'dir ve karanın
 * gerçekte kapladığı bant ~0.5..1, yani görünür kabartma bunun YARISI kadar.
 *
 * 26 = bir hex yarıçapı. Paralaks bütçesi bu sayıya bağlıdır:
 *   kayma_hex = h * tan(eğim) / 45.03
 * 26'da 30° eğim 0.33 hex kayma demek; 0.5'i geçtiği an oyuncu "tıkladığım
 * hex bu değildi" der. Ölçekle eğim BİRLİKTE seçilmeli.
 */
const HEIGHT_SCALE = 26;

/** Kameranın hedefe uzaklığı. Ortografikte yalnız kırpma düzlemlerini
 *  ilgilendirir; arazi kalınlığından kat kat büyük olması yeter. */
const CAM_DIST = 4000;

const MESH_VERT = `
uniform sampler2D uElevVert;
uniform vec2 uField;        // spanX, spanY
uniform vec2 uFieldOrg;     // x0, y0
uniform float uHeightScale;
uniform float uWrapOffset;  // bu kopyanın dünya x kayması
out vec2 vWorld;

void main() {
  // Düzlem XY'de kurulur ve dünya dikdörtgenine gerilir; uv 0..1'dir.
  vec2 world = uFieldOrg + uv * uField;
  vWorld = world + vec2(uWrapOffset, 0.0);
  float h = texture(uElevVert, uv).r;
  // three.y = -world.y (bkz. dosya başlığı).
  vec3 p = vec3(vWorld.x, -world.y, h * uHeightScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const MESH_FRAG = `
in vec2 vWorld;
${SURFACE_LIB}
${SURFACE_BODY}
void main() {
  fragColor = surfaceAt(vWorld);
}`;

/** THREE.DataTexture kurucusu; süzme ve sarmal her yerde aynı olsun diye. */
function dataTex(data, w, h, format, type, linear, repeatX) {
  const t = new THREE.DataTexture(data, w, h, format, type);
  t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export class Scene3D {
  /**
   * @param canvas hedef tuval
   * @param gl     RENDERER'IN AÇTIĞI bağlam; three onu ödünç alır
   */
  static create(canvas, gl, onContextChange = null) {
    if (!gl) return null;
    try {
      return new Scene3D(canvas, gl, onContextChange);
    } catch (err) {
      // Sessiz düşüş: çağıran ham WebGL2 yoluna geri döner, harita kaybolmaz.
      console.warn('Scene3D kurulamadı:', err);
      return null;
    }
  }

  constructor(canvas, gl, onContextChange = null) {
    this.canvas = canvas;
    this.gl = gl;
    this.onContextChange = onContextChange;
    this.world = null;
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.debug = { enabled: true };
    this.seaMaterial = true;
    this.overlayOn = false;
    this.perf = null;
    this.gpuTimer = GpuTimer.create(gl);
    this.tune = defaultTune();

    /** Kamera eğimi (radyan). 0 = tepeden; ortografikte bugünkü afinle eş. */
    this.tilt = 0;
    /** Yükseklik ölçeği; eğimle birlikte paralaks bütçesini belirler. */
    this.heightScale = HEIGHT_SCALE;
    /**
     * Mesh çözünürlüğü, yükseklik rasterinin tekseline göre. 1 = teksel başına
     * bir vertex (160x96 dünyada 640x384 = 246k vertex). Yavaş makinede
     * düşürülebilir; kabartmanın DETAYINI bu belirler, ışığı değil.
     */
    this.meshDetail = 1;
    /** Ham yolla AYNI: bkz. resize gerekçesi. */
    this.resScale = 0.75;
    /**
     * Dünya-uzayı mürekkebi (ızgara, province kenarı, ülke sınırı) YÜZEYDE
     * çizilsin mi? Mesh yolunda VARSAYILAN AÇIK: kamera eğildiği an Canvas2D'nin
     * düz afin mürekkebi hexlerin üstünden kayar. Yüzeye çizilen çizgi araziye
     * drape olur ve kalınlığı dFdx/dFdy sayesinde ekran pikselinde sabit kalır.
     */
    this.inkOnSurface = true;
    this.ink = { grid: 0, province: 0, edge: 0, border: 0 };

    this.renderer = new THREE.WebGLRenderer({
      canvas, context: gl, antialias: false, alpha: true,
    });
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    // Ortografik. Eğim açıldığında bile varsayılan budur: perspektif ALANI
    // derinliğe göre bozar ve göz onu düzeltemez; ortografik tekdüze bozar.
    // Harita bir atlastır, alan okuması oyunun altı kipinde bilgi taşır.
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAM_DIST * 4);
    this.perspCamera = new THREE.PerspectiveCamera(35, 1, 1, CAM_DIST * 8);
    this.camera = this.orthoCamera;
    /** Perspektif bölmesi açık mı? Varsayılan HAYIR — bkz. applyCamera. */
    this.perspective = false;
    /** Perspektif görüş açısı (derece). Dar açı = az bozulma, çok "uzun lens". */
    this.fov = 35;
    this.meshes = [];
    this.uniforms = null;
    this.lastCam = null;
    this.lastTime = -1;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.debug.enabled = false;
      this.gpuTimer = null;
      this.onContextChange?.('lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.onContextChange?.('restored');
    });
  }

  /** surfaceGL ile AYNI imza: renderer ikisini ayırt etmek zorunda kalmasın. */
  setWorld(world, coast, surfaceData) {
    if (this.world === world && this.meshes.length) return true;
    if (!coast?.toLand || !coast?.surface || !surfaceData) return false;

    const f = buildSurfaceFields(world, coast);
    const field = fieldOf(world);
    const cols = world.cols;
    const rows = world.rows;

    this.disposeWorld();

    // İKİ AYRI YÜKSEKLİK DOKUSU, bilerek.
    //
    // Vertex tarafı R32F ister: vertex texture fetch yarım kayan noktayı her
    // sürücüde süzmez ve yer değiştirme süzülmezse mesh basamaklanır.
    //
    // Fragment tarafı ise ham yolla AYNI olmalı — R16F. Farklı hassasiyet
    // farklı eğim, farklı eğim farklı ışık demek; kabartma shader'da 18x
    // büyütüldüğü için bu fark ölçülebilir hâle geliyor (ilk ölçümde
    // piksellerin %5'i ayrıldı ve suçlu buydu). Referans testinin anlamı
    // "iki yol aynı pikseli üretiyor mu" olduğu için girdileri de aynı olmalı.
    const elevVertTex = dataTex(new Float32Array(coast.surface), coast.w, coast.h,
      THREE.RedFormat, THREE.FloatType, true, true);
    const elevTex = dataTex(f.elev, coast.w, coast.h, THREE.RedFormat,
      THREE.HalfFloatType, true, true);

    const tex = {
      uHex: dataTex(f.hex, cols, rows, THREE.RedFormat, THREE.UnsignedByteType, false, true),
      uDist: dataTex(f.dist, coast.w, coast.h, THREE.RedFormat, THREE.UnsignedByteType, true, true),
      uOwner: dataTex(surfaceData.owner, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType, false, true),
      uChar: dataTex(surfaceData.character, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType, false, true),
      uElev: elevTex,
      uElevVert: elevVertTex,
      // Kimlik NEAREST okunmalı: enterpole edilen bir kimlik "aradaki" bir
      // ülkeye ait olur ve sınır hiçbir yere oturmaz.
      uIds: dataTex(surfaceData.ids ?? new Uint8Array(cols * rows * 4), cols, rows,
        THREE.RGBAFormat, THREE.UnsignedByteType, false, true),
      uOverlay: dataTex(new Uint8Array(cols * rows * 4), cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType, false, true),
    };
    const wave = buildWaveTexture();
    tex.uWave = dataTex(wave.data, wave.size, wave.size, THREE.RGBAFormat,
      THREE.UnsignedByteType, true, true);
    tex.uWave.wrapT = THREE.RepeatWrapping;
    tex.uWave.needsUpdate = true;

    this.tex = tex;
    this.uniforms = {
      uViewport: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uCam: { value: new THREE.Vector2() },
      uZoom: { value: 1 },
      uTime: { value: 0 },
      uWrap: { value: world.wrapWidth || 0 },
      uGrid: { value: new THREE.Vector2(cols, rows) },
      uHexSize: { value: HEX_SIZE },
      uFieldOrigin: { value: new THREE.Vector2(field.x0, field.y0) },
      uFieldSpan: { value: new THREE.Vector2(field.spanX, field.spanY) },
      uDistMax: { value: HEX_STEP * 9 },
      uDetail: { value: 0 },
      uShallow: { value: new THREE.Vector3() },
      uTeal: { value: new THREE.Vector3() },
      uPetrol: { value: new THREE.Vector3() },
      uAbyss: { value: new THREE.Vector3() },
      uShelf: { value: 1 },
      uSpecAmp: { value: 1 },
      uFresAmp: { value: 1 },
      uFoamAmp: { value: 1 },
      uWaveAmp: { value: 1 },
      uWaveShade: { value: 1 },
      uRefract: { value: 1 },
      uLandRelief: { value: 1 },
      uLandGrain: { value: 1 },
      uGrade: { value: 0.3 },
      uSeaMaterial: { value: 1 },
      uOverlayOn: { value: 0 },
      uDataMode: { value: 0 },
      uElevSize: { value: new THREE.Vector2(coast.w, coast.h) },
      uInkOn: { value: 0 },
      uInkGrid: { value: 0 },
      uInkProv: { value: 0 },
      uInkEdge: { value: 0 },
      uInkBorder: { value: 0 },
      // Vertex tarafı
      uElevVert: { value: elevVertTex },
      uField: { value: new THREE.Vector2(field.spanX, field.spanY) },
      uFieldOrg: { value: new THREE.Vector2(field.x0, field.y0) },
      uHeightScale: { value: this.heightScale },
      uWrapOffset: { value: 0 },
    };
    for (const [name, t] of Object.entries(tex)) this.uniforms[name] = { value: t };

    const segX = Math.max(2, Math.round(coast.w * this.meshDetail));
    const segY = Math.max(2, Math.round(coast.h * this.meshDetail));
    this.geometry = new THREE.PlaneGeometry(field.spanX, field.spanY, segX, segY);
    // Düzlemin merkezi dünya dikdörtgeninin merkezine oturur; y işaret
    // değiştirdiği için merkez de negatiflenir (bkz. dosya başlığı).
    this.geometry.translate(field.x0 + field.spanX / 2, -(field.y0 + field.spanY / 2), 0);

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      vertexShader: MESH_VERT,
      fragmentShader: MESH_FRAG,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    // SARMAL: silindir dünyada görünür pencereye iki periyot birden düşebilir.
    // Üç kopya her zoom ve her eğimde yeter (kenardaki ikisi çoğu karede
    // frustum dışında kalır ve hiç çizilmez).
    const P = world.wrapWidth || 0;
    const offsets = P ? [-P, 0, P] : [0];
    for (const dx of offsets) {
      const uni = { ...this.uniforms, uWrapOffset: { value: dx } };
      const mat = this.material.clone();
      mat.uniforms = uni;
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.position.x = dx;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }

    this.world = world;
    this.grid = { cols, rows };
    this.field = field;
    // Işın izi CPU'da bu alandan yürür; picking'in tek kaynağı budur.
    this.surface = coast.surface;
    this.surfaceSize = { w: coast.w, h: coast.h };
    return true;
  }

  updateIds(idData) {
    if (!this.tex?.uIds) return;
    this.tex.uIds.image.data.set(idData);
    this.tex.uIds.needsUpdate = true;
  }

  updateOwners(ownerData) {
    if (!this.tex?.uOwner) return;
    this.tex.uOwner.image.data.set(ownerData);
    this.tex.uOwner.needsUpdate = true;
  }

  updateOverlay(overlayData) {
    if (!this.tex?.uOverlay) return;
    this.tex.uOverlay.image.data.set(overlayData);
    this.tex.uOverlay.needsUpdate = true;
  }

  /**
   * ÇÖZÜNÜRLÜK ASİMETRİSİ. Ham yol yüzeyi `dpr * 0.75` ile çizer (piksel
   * işinin %56'sı); mürekkep katmanı ise tam `dpr`'de. Mesh yolu tam
   * çözünürlükte çizilseydi aynı sahne 1,78 kat dolgu maliyeti öderdi —
   * üstelik bu, tek bir üçgen bile eklenmeden, portun ilk gününde.
   *
   * Aynı sebeple referans testi de bozulurdu: iki kol farklı çözünürlükte
   * çizip aynı hedefe ölçeklenince kenarlarda yeniden örnekleme farkı çıkar
   * ve o fark "port sadık değil" gibi okunur (ilk ölçümde piksellerin
   * %0,11'i buydu, en büyük fark 295/765).
   *
   * Varsayılan eşitlik içindir; geometri kenarı düşük çözünürlükten daha çok
   * zarar gördüğü için bu sayı ileride mesh yolunda ayrıca ayarlanacak.
   */
  resize(cssW, cssH, dpr) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr * this.resScale;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      Math.max(1, Math.round(cssW * this.dpr)),
      Math.max(1, Math.round(cssH * this.dpr)),
      false,
    );
  }

  /**
   * Kamerayı oyunun 2B kamerasından kurar.
   *
   * Eğim sıfırken kutu tam olarak bugünkü afin dönüşümdür. Eğim açıldığında
   * DİKEY kutu `cos(eğim)` ile kısılır: zemin ekranda o oranda kısaldığı için
   * kısılmazsa merkezdeki hex boyu zoom'un vaat ettiğinden küçük çıkar ve
   * "zoom 1" iki kipte iki ayrı şey demeye başlar.
   */
  applyCamera(cam) {
    const tx = cam.x;
    const ty = -cam.y;
    const s = Math.sin(this.tilt);
    const co = Math.cos(this.tilt);

    if (this.perspective && this.tilt > 1e-4) {
      // PERSPEKTİF. Eğik ortografiğin VERMEDİĞİ tek şey hareket paralaksıdır:
      // kamera kayınca yakın ve uzak arazi FARKLI hızda kayar ve derinlik
      // ancak o zaman "hissedilir". Bedeli de burada ödenir — alan artık
      // tekdüze değil DERİNLİĞE GÖRE bozulur ve göz onu düzeltemez; sekiz
      // harita kipinin altısı alan okumasına dayanıyor (bkz. §4.2).
      const cameraCls = this.perspCamera;
      const fov = this.fov;
      // Odak düzleminde görünen dünya yüksekliği bugünkü zoom'la aynı olsun:
      // uzaklık oradan çıkar, yoksa "zoom 1" iki kipte iki ayrı şey demeye
      // başlar.
      const dist = (cam.viewHeight / (2 * cam.zoom))
        / Math.tan((fov * Math.PI) / 360);
      cameraCls.fov = fov;
      cameraCls.aspect = cam.viewWidth / cam.viewHeight;
      cameraCls.near = Math.max(1, dist * 0.02);
      cameraCls.far = dist * 6 + this.heightScale * 4;
      cameraCls.position.set(tx, ty - dist * s, dist * co);
      cameraCls.up.set(0, co, s);
      cameraCls.lookAt(tx, ty, 0);
      cameraCls.updateProjectionMatrix();
      cameraCls.updateMatrixWorld();
      this.camera = cameraCls;
      return;
    }

    const c = this.orthoCamera;
    // TELAFİ YOK, bilerek. Çerçeveyi `cos(eğim)` ile kısmak, ortografikte düz
    // bir düzlemi eğmenin bütün görsel etkisini SİLER: sonuç eğimsiz görüntünün
    // matematiksel eşidir (ilk denemede tam olarak bu oldu, eğim uygulandı ama
    // ekranda hiçbir şey değişmedi). Zeminin dikeyde kısalması eğimin
    // KENDİSİDİR; ekrandaki hex boyu o oranda küçülür ve küçülmelidir.
    const halfW = cam.viewWidth / (2 * cam.zoom);
    const halfH = cam.viewHeight / (2 * cam.zoom);
    c.left = -halfW; c.right = halfW;
    c.top = halfH; c.bottom = -halfH;
    c.near = 1;
    c.far = CAM_DIST * 4;
    c.position.set(tx, ty - CAM_DIST * s, CAM_DIST * co);
    c.up.set(0, co, s);
    c.lookAt(tx, ty, 0);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.camera = c;
  }

  /**
   * Dünya noktasının EKRAN konumu (CSS piksel, y aşağı).
   *
   * Canvas2D mürekkep katmanı (etiket, künye, şehir) bunu kullanır: eğim
   * açıldığında `camera.worldToScreen`ın afin cevabı artık doğru değildir,
   * ama mürekkep hâlâ ekran uzayında çizilir — değişen yalnız çapanın nereye
   * düştüğüdür.
   */
  project(worldX, worldY, height = null) {
    // Yükseklik verilmediyse araziden örneklenir: etiket ve künye zeminin
    // ÜSTÜNDE dursun, düz sıfır düzleminde asılı kalmasın.
    const h = height == null ? this.heightAt(worldX, worldY) : height;
    // Kare başına yüzlerce çağrı olur (etiket, province, şehir, birim);
    // vektör TAHSİS EDİLMEZ, tek kalemlik bir kazıma nesnesi yeniden kullanılır.
    const v = this.scratch ??= new THREE.Vector3();
    v.set(worldX, -worldY, h * this.heightScale);
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.cssW,
      y: (0.5 - v.y * 0.5) * this.cssH,
      depth: v.z,
    };
  }

  /** Yükseklik alanından örnek (dünya koordinatı → 0..1). */
  heightAt(worldX, worldY) {
    if (!this.surface) return 0;
    const { w, h } = this.surfaceSize;
    const u = (worldX - this.field.x0) / this.field.spanX;
    const v = (worldY - this.field.y0) / this.field.spanY;
    if (v < 0 || v >= 1) return 0;
    // X sarmal, Y kenara kenetli — dokuların sarmalıyla aynı kural.
    let px = Math.floor((((u % 1) + 1) % 1) * w);
    const py = Math.floor(v * h);
    px = ((px % w) + w) % w;
    return this.surface[py * w + px] ?? 0;
  }

  /**
   * Ekran noktasının düştüğü DÜNYA noktası — ışın yürüyüşü.
   *
   * Eğim sıfırken ters afin kapalı formdur ve `camera.screenToWorld` doğru
   * cevabı verir. Eğim açıldığında öyle bir ters YOKTUR: ışın araziye çarpar
   * ve çarptığı yer yüksekliğe bağlıdır. Bu, C yolunun oyunu bozabilecek tek
   * kalemidir — "gördüğüm hexe mi tıklıyorum" sorusunun cevabı burasıdır.
   *
   * Yürüyüş CPU'da yapılır. `gl.readPixels` ile GPU picking cazip görünür ama
   * senkron boru duraklamasıdır ve hover HER `mousemove`'da çalışır.
   */
  pick(screenX, screenY) {
    if (!this.surface) return null;
    const cam = this.camera;
    const o = this.pickOrigin ??= new THREE.Vector3();
    const d = this.pickDir ??= new THREE.Vector3();
    o.set((screenX / this.cssW) * 2 - 1, 1 - (screenY / this.cssH) * 2, -1);
    o.unproject(cam);
    if (cam.isPerspectiveCamera) {
      // PERSPEKTİFTE HER PİKSEL BAŞKA YÖNE BAKAR. Kameranın ileri vektörünü
      // bütün pikseller için kullanmak yalnız ortografikte doğrudur; burada
      // yapılırsa ışın hep aynı yere çarpar ve tıklama ekranın neresine
      // basılırsa basılsın odak karesini döndürür (ölçüldü: eğim 30°'de
      // örneklerin tamamı tek kareye düştü).
      d.copy(o).sub(cam.position).normalize();
    } else {
      d.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    }

    const maxH = this.heightScale;
    // Işını arazinin TEPESİNDEN başlat: üstünde kesişim olamaz, dolayısıyla
    // ilk örnek her zaman havadadır ve "önceki" değeri güvenle kurulur.
    if (d.z < -1e-6 && o.z > maxH) o.addScaledVector(d, (maxH - o.z) / d.z);
    if (d.z >= -1e-6) return null;   // yukarı ya da yatay bakan ışın araziye çarpmaz

    // Adım bir teksel boyu: alanın kendi çözünürlüğünden ince adım bilgi
    // getirmez, yalnız maliyet getirir. Dikey erim en fazla maxH kadar.
    const step = this.field.spanX / this.surfaceSize.w;
    const maxSteps = Math.ceil((maxH / Math.abs(d.z)) / step) + 4;
    let pwx = 0; let pwy = 0; let pdiff = 0; let have = false;
    for (let i = 0; i <= maxSteps; i++) {
      const wx = o.x;
      const wy = -o.y;
      const diff = o.z - this.heightAt(wx, wy) * this.heightScale;
      if (diff <= 0) {
        if (!have) return { x: wx, y: wy };
        // İki örnek arasında doğrusal kesişim: adımın içinde tam yer.
        const k = pdiff / (pdiff - diff);
        return { x: pwx + (wx - pwx) * k, y: pwy + (wy - pwy) * k };
      }
      pwx = wx; pwy = wy; pdiff = diff; have = true;
      o.addScaledVector(d, step);
      if (o.z < -1e-3) break;
    }
    return null;
  }

  draw(camera, time, force = false) {
    if (!this.world || !this.debug.enabled || !this.meshes.length) return false;
    const moved = this.lastCam?.x !== camera.x || this.lastCam?.y !== camera.y
      || this.lastCam?.zoom !== camera.zoom || this.lastCam?.tilt !== this.tilt;
    if (!force && !moved && time - this.lastTime < 0.033) return false;
    this.lastTime = time;
    this.lastCam = { x: camera.x, y: camera.y, zoom: camera.zoom, tilt: this.tilt };

    this.gpuTimer?.poll((ms) => this.perf?.gauge('gpu.scene', ms));
    this.gpuTimer?.begin();

    this.applyCamera(camera);
    const detail = Math.max(0, Math.min(1, (camera.zoom - 0.35) / 1.1));
    for (const mesh of this.meshes) {
      const u = mesh.material.uniforms;
      u.uViewport.value.set(this.cssW, this.cssH);
      u.uDpr.value = this.dpr;
      u.uCam.value.set(camera.x, camera.y);
      u.uZoom.value = camera.zoom;
      u.uTime.value = time;
      u.uDetail.value = detail;
      u.uSeaMaterial.value = this.seaMaterial ? 1 : 0;
      u.uDataMode.value = this.seaMaterial ? 0 : 1;
      u.uOverlayOn.value = this.overlayOn ? 1 : 0;
      u.uHeightScale.value = this.heightScale;
      u.uInkOn.value = this.inkOnSurface ? 1 : 0;
      u.uInkGrid.value = this.ink.grid;
      u.uInkProv.value = this.ink.province;
      u.uInkEdge.value = this.ink.edge;
      u.uInkBorder.value = this.ink.border;
      const T = this.tune;
      if (T) {
        u.uShallow.value.fromArray(T.shallow);
        u.uTeal.value.fromArray(T.teal);
        u.uPetrol.value.fromArray(T.petrol);
        u.uAbyss.value.fromArray(T.abyss);
        u.uShelf.value = T.shelf;
        u.uSpecAmp.value = T.spec;
        u.uFresAmp.value = T.fresnel;
        u.uFoamAmp.value = T.foam;
        u.uWaveAmp.value = T.waveAmp;
        u.uWaveShade.value = T.waveShade;
        u.uRefract.value = T.refract;
        u.uLandRelief.value = T.relief;
        u.uLandGrain.value = T.grain;
        u.uGrade.value = T.grade;
      }
    }
    // three GL durumunu kendi bildiği gibi bırakır; ham yol (surfaceGL) aynı
    // bağlamı paylaştığı için oradaki çizim kendi durumunu kurmak zorunda.
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    this.gpuTimer?.end();
    this.perf?.bump('draws', this.meshes.length);
    this.perf?.bump('tris', this.geometry.index
      ? this.geometry.index.count / 3 * this.meshes.length : 0);
    return true;
  }

  disposeWorld() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.material.dispose();
    }
    this.meshes.length = 0;
    this.geometry?.dispose();
    this.geometry = null;
    for (const t of Object.values(this.tex ?? {})) t.dispose();
    this.tex = null;
    this.world = null;
  }

  dispose() {
    this.disposeWorld();
    this.gpuTimer?.dispose();
    this.gpuTimer = null;
    this.renderer?.dispose();
  }
}
