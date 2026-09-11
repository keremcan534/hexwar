// Geliştirici kancası — oyundan ÖNCE yüklenir. Klasik script, modül DEĞİL.
//
// Neden modül değil: modüller ertelenir ve sırayla çalışır; bu kancanın,
// main.js `new Game()` çağırıp harita tuvalinin WebGL bağlamını istemeden
// önce kurulmuş olması şart. Klasik bir script sayfa ayrıştırılırken hemen
// çalışır, yani her modülden önce.
//
// Ne yapıyor: #map-water tuvalinin bağlamı `preserveDrawingBuffer: true` ile
// istenir. Yeni deniz haritanın WebGL karesini BAŞKA bir bağlamdan doku olarak
// okuyor; tarayıcı çizim tamponunu kompozitten sonra temizlediği için okuma
// kimi karede dolu kimi karede BOŞ dönüyordu ve deniz durup dururken simsiyah
// oluyordu (laboratuvarda ölçüldü). `src/` altında hiçbir dosya değişmez.
//
// `?deniz=0` ile açılırsa hiçbir şeye dokunmaz: oyun tam olarak bugünkü
// hâliyle çalışır.
(function () {
  if (new URLSearchParams(location.search).get('deniz') === '0') return;
  var asil = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (tur, secenek) {
    if (this.id === 'map-water' && String(tur).indexOf('webgl') === 0) {
      return asil.call(this, tur, Object.assign({}, secenek || {}, { preserveDrawingBuffer: true }));
    }
    return asil.call(this, tur, secenek);
  };
})();
