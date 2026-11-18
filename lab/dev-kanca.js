// Geliştirici kancası — oyundan ÖNCE yüklenir. Klasik script, modül DEĞİL.
//
// Neden modül değil: modüller ertelenir ve sırayla çalışır; bu kancanın,
// main.js `new Game()` çağırıp harita tuvalinin WebGL bağlamını istemeden
// önce kurulmuş olması şart. Klasik bir script sayfa ayrıştırılırken hemen
// çalışır, yani her modülden önce.
//
// İki iş:
//   1. Deniz yolunu seçer (window.__denizYolu): `yeni` FFT okyanusu, `eski`
//      three.js denizi, `kapali` oyunun kendi denizi. `?deniz=0` kapalı,
//      `?deniz=eski` eski yol. Kayan nokta hedefi olmayan donanım eski yola,
//      WebGL2'si hiç olmayan donanım oyunun kendi denizine düşer.
//   2. ESKİ yolda #map-water tuvalinin bağlamını `preserveDrawingBuffer: true`
//      ile istetir: o deniz haritanın WebGL karesini BAŞKA bir bağlamdan doku
//      olarak okuyor ve tarayıcı çizim tamponunu kompozitten sonra temizlediği
//      için okuma kimi karede BOŞ dönüp deniz simsiyah oluyordu (laboratuvarda
//      ölçüldü). Yeni okyanus haritayı okumaz; bu pahalı bayrağa gerek duymaz.
(function () {
  var q = new URLSearchParams(location.search).get('deniz');
  function destek() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2');
      if (!gl) return 0;
      var ok = !!gl.getExtension('EXT_color_buffer_float');
      var kayip = gl.getExtension('WEBGL_lose_context');
      if (kayip) kayip.loseContext();
      return ok ? 2 : 1;
    } catch (e) { return 0; }
  }
  var d = q === '0' ? 0 : destek();
  var yol = d === 0 ? 'kapali' : (q === 'eski' || d === 1 ? 'eski' : 'yeni');
  window.__denizYolu = yol;
  if (yol !== 'eski') return;
  var asil = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (tur, secenek) {
    if (this.id === 'map-water' && String(tur).indexOf('webgl') === 0) {
      return asil.call(this, tur, Object.assign({}, secenek || {}, { preserveDrawingBuffer: true }));
    }
    return asil.call(this, tur, secenek);
  };
})();
