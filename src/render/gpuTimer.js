// GPU kare süresi ölçümü (EXT_disjoint_timer_query_webgl2).
//
// Neden gerekti: bu depoda GPU işi HİÇ ölçülmüyordu. `perf.cpu` yalnız ana
// thread'i sayar, `dt` ise her şeyi tek sayıya toplar. Yüzey katmanı GPU'ya
// taşındıkça CPU rakamları İYİLEŞİR, dolayısıyla bir gerileme "iyileşme" gibi
// okunabilir. Suçluyu göstermeyen bir profil, profil değildir.
//
// SONUÇ GEÇ GELİR — mekaniğin tamamı bunun etrafında kurulu. Sürücü işi
// bitirene kadar birkaç kare geçer; sorgu sonucu çizildiği karenin değil,
// SONRAKİ karelerin birinde okunur. Bu yüzden değer `perf.add` ile bir kare
// hanesine yazılmaz, `perf.gauge` ile kendi halkasına düşer (bkz. core/perf).
//
// "Disjoint" bayrağı: GPU zamanlayıcısı bağlam değişimi ya da güç durumu
// değişimi yaşadıysa ölçüm çöptür. O turdaki BÜTÜN uçuştaki sorgular atılır —
// tek tek elemek yanlış olur, çünkü bayrak hangi sorguyu bozduğunu söylemez.
//
// Katman notu: GPU'ya dokunur, oyun durumuna ve DOM'a dokunmaz.

/** Aynı anda uçuşta tutulacak sorgu sayısı. TIME_ELAPSED tek seferde bir
 *  tanedir, ama sonuç geciktiği için havuz gerekir; 4 kare ~66 ms gecikmeye
 *  yeter ve bundan fazlası zaten bayat veridir. */
const POOL = 4;

export class GpuTimer {
  /**
   * Eklenti yoksa null döner — çağıran ölçümsüz devam eder. Eklentinin
   * yokluğu hata değildir: Safari'de ve bazı sürücülerde hiç gelmez, üstelik
   * zamanlama saldırılarına karşı tarayıcı tarafından kapatılabilir.
   */
  static create(gl) {
    if (!gl) return null;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    return new GpuTimer(gl, ext);
  }

  constructor(gl, ext) {
    this.gl = gl;
    this.ext = ext;
    /** Boştaki sorgu nesneleri; tahsis kare içinde yapılmasın diye havuzlanır. */
    this.free = [];
    /** Başlatılmış ama sonucu okunmamış sorgular. */
    this.inFlight = [];
    this.active = null;
    /** Sonucu okunamadan atılan sorgu sayısı — güven göstergesi. */
    this.discarded = 0;
  }

  /** Ölçüm başlat. Havuz doluysa sessizce atlanır: ölçüm çizimi bekletmez. */
  begin() {
    if (this.active) return false;
    const gl = this.gl;
    const q = this.free.pop() ?? gl.createQuery();
    if (!q) return false;
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
    return true;
  }

  end() {
    if (!this.active) return;
    const gl = this.gl;
    gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    if (this.inFlight.length >= POOL) {
      // Havuz taştı: en eskiyi at. Sonuç gelmediyse zaten bayattı.
      this.free.push(this.inFlight.shift());
      this.discarded++;
    }
    this.inFlight.push(this.active);
    this.active = null;
  }

  /**
   * Hazır olan sorguları toplar ve her biri için `onSample(ms)` çağırır.
   * Her karede bir kez çağrılmalı; okunmayan sonuç havuzu tıkar.
   */
  poll(onSample) {
    const gl = this.gl;
    if (!this.inFlight.length) return;
    // Disjoint: bu tur boyunca biriken ölçümlerin hepsi güvenilmez.
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.discarded += this.inFlight.length;
      this.free.push(...this.inFlight);
      this.inFlight.length = 0;
      return;
    }
    // Sorgular sırayla biter; ilk hazır olmayanda durmak doğru davranıştır.
    while (this.inFlight.length) {
      const q = this.inFlight[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.inFlight.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      this.free.push(q);
      onSample(ns / 1e6);
    }
  }

  dispose() {
    const gl = this.gl;
    for (const q of this.free) gl.deleteQuery(q);
    for (const q of this.inFlight) gl.deleteQuery(q);
    if (this.active) gl.deleteQuery(this.active);
    this.free.length = 0;
    this.inFlight.length = 0;
    this.active = null;
  }
}
