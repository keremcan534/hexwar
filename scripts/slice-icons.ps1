# Ikon sheet dilimleyici.
#
# ChatGPT ikonlari TEK SHEET olarak uretiyor (tek seferde uretilenlerin isigi
# ve tonu birbirini tutuyor); bu betik onlari tek tek PNG'ye ayirir.
#
# IKONLAR NASIL AYRILIR: once ARKA PLAN bulunur, geri kalan bagli bilesenlere
# ayrilir. Bilesenler iki yoldan ikona toplanir:
#   - Varsayilan: yakin kutular birlesir (-MergeGap), okuma sirasina dizilir.
#     Duzensiz yerlesimli sheet'ler icin (satirlar farkli sayida ikon tasir).
#   - -Grid 4x3: her bilesen agirlik merkezinin dustugu HUCREYE gider. Prompt
#     sheet'i izgara olarak istedigi icin bu daha saglam: dis kutulari cakisan
#     iki komsu (topun namlusu tankin burnunun ustunden gecer) birlesmez,
#     kopuk duman ya da bayrak yine kendi ikonunda kalir.
# Ikon yalniz KENDI bilesenlerini tasir; kutusuna giren komsu parcasi alinmaz.
#
# ZEMIN RENGI (-Key): varsayilan beyaz. Beyaz zeminde nesnenin kendi beyazi
# (parlama, pamuk, yelken) zeminle karisir; asagidaki delik sorunu bundandir.
# Sheet duz mor (-Key FF00FF) istenirse karismaz: kapali her mor parca kesin
# deliktir ve kendiliginden saydamlasir, -Holes gerekmez. Mor sheet webp'de
# renk alt-ornekleme ile kenara yayilir: tolerans 60, kenar bandi 2 piksel.
#
# NEDEN KENARDAN TASMA (flood fill) ILE BEYAZ SILINIR: ikonlarin ICINDE de
# beyaz var (capa halati, cadir bezi, mermer sutun, kar). Duz "beyaza yakin
# pikseli sil" kurali bu beyazlari da delerdi. Tasma yalniz KENARDAN baslar,
# yani nesnenin icindeki beyaz kapali kalir ve hayatta kalir.
#
# Bu yuzden kenara acilmayan GERCEK delikler de (telefon kordonunun ici, disli
# bosluklari, tekerlek telleri arasi) beyaz kalir. Kenara degseydi zemin
# sayilacak renkteki kapali bolge (-HoleArea'dan buyuk) delik ADAYIDIR. Delik
# ile parlamayi otomatik ayiran olcu YOK (denendi: cevre parlakligi halat
# aralarinda, renk istatistigi kucuk deliklerde yaniliyor); mermi ucu, cam,
# gumus para, eldiven, inek alni, guhercile ayni beyazdir. Bu yuzden temizlik
# ADIYLA SECILEN ikonlara uygulanir (-Holes): once -HoleDebug ile kosulur,
# adaylar <ad>.holes.png'de macenta gorunur, karar goze sorulur.
#
# KENAR HALESI: beyaz zeminle karisan antialias bandi opak kalirsa koyu diskin
# ustunde nesnenin cevresinde ince acik cizgi kalir. Zemine bitisik -Fringe
# piksellik bant beyazdan arindirilir (color-to-alpha): pikselin beyazla
# karismis payi saydamliga cevrilir, rengi kendi koyu tonuna doner.
#
# Kucultme PArgb (onceden carpilmis alfa) yuzeyinde yapilir: bicubic saydam
# pikselin rengini kenara sizdiramaz. Duz ARGB'ye elle "unpremultiply" yapmak
# GDI+'nin zaten dogru hesapladigi kenari ikinci kez bolup acik hale birakir.
#
# Bagimlilik yok: PowerShell + System.Drawing (depo "bagimlilik yok" kuralinda).
#
# Kullanim:
#   powershell -ExecutionPolicy Bypass -File scripts/slice-icons.ps1 `
#     -Sheet .\sheet.png -Out .\assets\icons\rgo -Size 240 -Grid 4x3 `
#     -Names grain_farm,fishery,logging,quarry,iron_mine,coal_mine
#
#   -Names verilmezse dosyalar icon_01..icon_NN olur; once -DryRun ile kosup
#   bulunan kutulara bakmak, sonra adlarla tekrar kosmak en hizli yol.
#   Delikler: -HoleDebug ile kos, .holes.png'lere bak, delik olanlari sec:
#     ... -Grid 4x3 -Holes artillery,telephone,cotton:1800 -Names ...

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Sheet,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Size = 240,
  # Zemin rengi (hex, ornek FF00FF). Bkz. baslik.
  [string]$Key = 'FFFFFF',
  # Zemin toleransi: her kanalda zemin renginden en cok bu kadar uzak piksel
  # zemin sayilir. Verilmezse beyazda 24, renkli zeminde 60.
  [int]$Tolerance = -1,
  # Bu kadar pikselden kucuk bilesen toz kabul edilir (antialias kirintisi):
  # kendi basina ikon olmaz, ancak bir ikonun yanina iliserek kalir.
  [int]$MinArea = 900,
  # Birbirine bu kadar yakin kutular TEK ikondur: bayrak direkten, duman
  # bacadan, golge nesneden kopuk gelebiliyor. -Grid ile tozun ikona ilisme
  # mesafesidir.
  [int]$MergeGap = 14,
  # "SUTUNxSATIR" (ornek 4x3): bilesenler hucreye gore toplanir.
  [string]$Grid = '',
  # Kenara acilmayan zemin renkli bolge bu alandan (sheet pikseli) buyukse
  # delik adayidir.
  [int]$HoleArea = 30,
  # Delik adaylari saydamlasacak ikon adlari (-HoleDebug ciktisina bakip sec).
  # "ad:alan" o ikonun esigini yukseltir: delik buyuk, parlama kucukse ayirir.
  [string[]]$Holes = @(),
  # Zemine bitisik arindirilacak bant genisligi (piksel). 0 = kapali.
  # Verilmezse beyazda 1, renkli zeminde 2.
  [int]$Fringe = -1,
  # Her ikonun delik adaylarini <ad>.holes.png'de macenta boyar.
  [switch]$HoleDebug,
  [string[]]$Names = @(),
  # Yalniz olcup rapor et, dosya yazma.
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class IconComp {
  public int Id, Area;
  public int X0, Y0, X1, Y1;          // X1/Y1 haric
  public double Cx, Cy;               // agirlik merkezi
  public Rectangle Box { get { return Rectangle.FromLTRB(X0, Y0, X1, Y1); } }
}

public class IconGroup {
  public Rectangle Box;
  public HashSet<int> Ids = new HashSet<int>();
  public void Add(IconComp c) {
    Box = Ids.Count == 0 ? c.Box : Rectangle.Union(Box, c.Box);
    Ids.Add(c.Id);
  }
}

public class IconSheet {
  public int Width, Height;
  byte[] px;          // BGRA
  bool[] bg;          // arka plan maskesi
  int[] lab;          // bilesen etiketi, 0 = arka plan
  int tol;            // zemin toleransi: zemin ve delik ayni olcuyle
  int kr, kg, kb;     // zemin rengi
  public bool WhiteKey { get { return kr == 255 && kg == 255 && kb == 255; } }
  public List<IconComp> Comps = new List<IconComp>();

  public IconSheet(string path, int tolerance, int key) {
    kr = (key >> 16) & 255; kg = (key >> 8) & 255; kb = key & 255;
    using (Bitmap raw = new Bitmap(path))
    using (Bitmap bmp = new Bitmap(raw.Width, raw.Height, PixelFormat.Format32bppArgb)) {
      using (Graphics g = Graphics.FromImage(bmp)) g.DrawImageUnscaled(raw, 0, 0);
      Width = bmp.Width; Height = bmp.Height;
      BitmapData d = bmp.LockBits(new Rectangle(0, 0, Width, Height),
        ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      px = new byte[Width * Height * 4];
      System.Runtime.InteropServices.Marshal.Copy(d.Scan0, px, 0, px.Length);
      bmp.UnlockBits(d);
    }
    tol = tolerance;
    FloodBackground(tolerance);
    Label();
  }

  bool IsBackgroundColor(int i, int tol) {
    int b = px[i], g = px[i + 1], r = px[i + 2], a = px[i + 3];
    if (a < 16) return true;                       // zaten saydam
    int d = Math.Max(Math.Abs(r - kr), Math.Max(Math.Abs(g - kg), Math.Abs(b - kb)));
    return d <= tol;                               // zemin rengine yakin
  }

  // Tasma YALNIZ kenardan baslar: nesnenin icindeki beyaz kapali kalir.
  void FloodBackground(int tol) {
    bg = new bool[Width * Height];
    Stack<int> stack = new Stack<int>();
    for (int x = 0; x < Width; x++) { Seed(x, 0, tol, stack); Seed(x, Height - 1, tol, stack); }
    for (int y = 0; y < Height; y++) { Seed(0, y, tol, stack); Seed(Width - 1, y, tol, stack); }
    while (stack.Count > 0) {
      int p = stack.Pop();
      int x = p % Width, y = p / Width;
      if (x > 0) Seed(x - 1, y, tol, stack);
      if (x < Width - 1) Seed(x + 1, y, tol, stack);
      if (y > 0) Seed(x, y - 1, tol, stack);
      if (y < Height - 1) Seed(x, y + 1, tol, stack);
    }
  }

  void Seed(int x, int y, int tol, Stack<int> stack) {
    int p = y * Width + x;
    if (bg[p]) return;
    if (!IsBackgroundColor(p * 4, tol)) return;
    bg[p] = true;
    stack.Push(p);
  }

  // Bagli bilesenler (8 komsuluk): etiket, alan, kutu, agirlik merkezi.
  void Label() {
    lab = new int[Width * Height];
    Stack<int> stack = new Stack<int>();
    for (int start = 0; start < lab.Length; start++) {
      if (bg[start] || lab[start] != 0) continue;
      IconComp c = new IconComp();
      c.Id = Comps.Count + 1;
      c.X0 = start % Width; c.X1 = c.X0 + 1; c.Y0 = start / Width; c.Y1 = c.Y0 + 1;
      double sx = 0, sy = 0;
      lab[start] = c.Id; stack.Push(start);
      while (stack.Count > 0) {
        int p = stack.Pop(); c.Area++;
        int x = p % Width, y = p / Width;
        sx += x; sy += y;
        if (x < c.X0) c.X0 = x; if (x + 1 > c.X1) c.X1 = x + 1;
        if (y < c.Y0) c.Y0 = y; if (y + 1 > c.Y1) c.Y1 = y + 1;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
          int nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= Width || ny >= Height) continue;
          int q = ny * Width + nx;
          if (bg[q] || lab[q] != 0) continue;
          lab[q] = c.Id; stack.Push(q);
        }
      }
      c.Cx = sx / c.Area; c.Cy = sy / c.Area;
      Comps.Add(c);
    }
  }

  // Varsayilan: buyuk bilesenlerin kutulari yakinliga gore birlesir; kutunun
  // TAMAMEN icinde kalan her bilesen (toz dahil) o ikona aittir.
  public List<IconGroup> GroupsByMerge(int minArea, int gap) {
    List<Rectangle> boxes = new List<Rectangle>();
    foreach (IconComp c in Comps) if (c.Area >= minArea) boxes.Add(c.Box);
    boxes = ReadingOrder(Merge(boxes, gap));
    List<IconGroup> groups = new List<IconGroup>();
    foreach (Rectangle b in boxes) {
      IconGroup g = new IconGroup();
      foreach (IconComp c in Comps) if (b.Contains(c.Box)) g.Add(c);
      groups.Add(g);
    }
    return groups;
  }

  // Izgara: bilesen agirlik merkezinin hucresine gider. Toz, hucresindeki
  // ikonun ANA kutusuna 'attach' pikselden yakinsa iliser, degilse atilir.
  // Ana kutu sabit tutulur: eklenen toz kutuyu buyutup zincirleme kirinti
  // toplamasin.
  public List<IconGroup> GroupsByGrid(int cols, int rows, int minArea, int attach) {
    double cw = (double)Width / cols, ch = (double)Height / rows;
    IconGroup[] cells = new IconGroup[cols * rows];
    foreach (IconComp c in Comps) {
      if (c.Area < minArea) continue;
      int i = CellOf(c, cols, rows, cw, ch);
      if (cells[i] == null) cells[i] = new IconGroup();
      cells[i].Add(c);
    }
    Rectangle[] main = new Rectangle[cells.Length];
    for (int i = 0; i < cells.Length; i++)
      if (cells[i] != null) main[i] = Rectangle.Inflate(cells[i].Box, attach, attach);
    foreach (IconComp c in Comps) {
      if (c.Area >= minArea) continue;
      int i = CellOf(c, cols, rows, cw, ch);
      if (cells[i] != null && main[i].IntersectsWith(c.Box)) cells[i].Add(c);
    }
    List<IconGroup> groups = new List<IconGroup>();
    foreach (IconGroup g in cells) if (g != null) groups.Add(g);
    return groups;
  }

  static int CellOf(IconComp c, int cols, int rows, double cw, double ch) {
    int cx = Math.Min(cols - 1, Math.Max(0, (int)(c.Cx / cw)));
    int cy = Math.Min(rows - 1, Math.Max(0, (int)(c.Cy / ch)));
    return cy * cols + cx;
  }

  // Hicbir ikona girmeyen buyukce parca: atildigi sessizce gecmesin.
  public List<Rectangle> Unassigned(List<IconGroup> groups, int minArea) {
    HashSet<int> used = new HashSet<int>();
    foreach (IconGroup g in groups) used.UnionWith(g.Ids);
    List<Rectangle> r = new List<Rectangle>();
    foreach (IconComp c in Comps) if (c.Area >= minArea && !used.Contains(c.Id)) r.Add(c.Box);
    return r;
  }

  public static List<Rectangle> Merge(List<Rectangle> boxes, int gap) {
    bool changed = true;
    while (changed) {
      changed = false;
      for (int i = 0; i < boxes.Count && !changed; i++)
        for (int j = i + 1; j < boxes.Count && !changed; j++) {
          Rectangle a = boxes[i], b = boxes[j];
          Rectangle grown = Rectangle.Inflate(a, gap, gap);
          if (!grown.IntersectsWith(b)) continue;
          boxes[i] = Rectangle.Union(a, b);
          boxes.RemoveAt(j);
          changed = true;
        }
    }
    return boxes;
  }

  // Okuma sirasi: once satir kumelenir (dikey merkez, medyan yuksekligin
  // yarisi kadar tolerans), sonra satir icinde soldan saga.
  public static List<Rectangle> ReadingOrder(List<Rectangle> boxes) {
    if (boxes.Count == 0) return boxes;
    List<int> hs = new List<int>();
    foreach (Rectangle r in boxes) hs.Add(r.Height);
    hs.Sort();
    int median = hs[hs.Count / 2];
    int band = Math.Max(8, median / 2);
    List<Rectangle> sorted = new List<Rectangle>(boxes);
    sorted.Sort(delegate(Rectangle a, Rectangle b) {
      int ca = a.Top + a.Height / 2, cb = b.Top + b.Height / 2;
      if (Math.Abs(ca - cb) > band) return ca.CompareTo(cb);
      return a.Left.CompareTo(b.Left);
    });
    return sorted;
  }

  /// Ikonu kirp (yalniz kendi bilesenleri), delik ve haleyi temizle, kareye
  /// oturt, Size'a olcekle.
  public void Save(IconGroup g, string path, int size, int pad, int holeArea, bool cleanHoles, int fringe, string debugPath) {
    Rectangle box = g.Box;
    int w = box.Width, h = box.Height;
    bool[] keep = new bool[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int l = lab[(box.Top + y) * Width + box.Left + x];
      keep[y * w + x] = l != 0 && g.Ids.Contains(l);
    }
    bool[] hole = new bool[w * h];
    bool debug = !string.IsNullOrEmpty(debugPath);
    if (holeArea > 0 && (cleanHoles || debug)) MarkHoles(box, keep, hole, holeArea);
    if (cleanHoles) for (int i = 0; i < w * h; i++) if (hole[i]) keep[i] = false;

    byte[] buf = new byte[w * h * 4];   // duz BGRA
    for (int i = 0; i < w * h; i++) {
      if (!keep[i]) continue;
      int src = ((box.Top + i / w) * Width + box.Left + i % w) * 4;
      buf[i * 4] = px[src]; buf[i * 4 + 1] = px[src + 1]; buf[i * 4 + 2] = px[src + 2];
      buf[i * 4 + 3] = 255;
    }
    if (fringe > 0) Defringe(buf, keep, w, h, fringe, kr, kg, kb);
    // Arindirmadan kalan neredeyse saydam kirinti koyu diskte leke olur.
    for (int i = 0; i < w * h; i++)
      if (buf[i * 4 + 3] < 16) { buf[i * 4] = 0; buf[i * 4 + 1] = 0; buf[i * 4 + 2] = 0; buf[i * 4 + 3] = 0; }
    if (debug) SaveHoleDebug(buf, hole, w, h, debugPath);

    // Kareye oturt: en-boy orani korunur, ikonlar ayni kutuda ayni buyuklukte.
    int side = Math.Max(w, h) + pad * 2;
    int ox = (side - w) / 2, oy = (side - h) / 2;
    byte[] sq = new byte[side * side * 4];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int si = (y * w + x) * 4, di = ((oy + y) * side + ox + x) * 4;
      int a = buf[si + 3];
      if (a == 0) continue;
      sq[di] = (byte)((buf[si] * a + 127) / 255);
      sq[di + 1] = (byte)((buf[si + 1] * a + 127) / 255);
      sq[di + 2] = (byte)((buf[si + 2] * a + 127) / 255);
      sq[di + 3] = (byte)a;
    }
    using (Bitmap square = FromBytes(sq, side, side, PixelFormat.Format32bppPArgb))
    using (Bitmap scaled = new Bitmap(size, size, PixelFormat.Format32bppPArgb)) {
      using (Graphics gr = Graphics.FromImage(scaled)) {
        gr.Clear(Color.Transparent);
        gr.CompositingMode = CompositingMode.SourceCopy;
        gr.InterpolationMode = InterpolationMode.HighQualityBicubic;
        gr.PixelOffsetMode = PixelOffsetMode.HighQuality;
        using (ImageAttributes ia = new ImageAttributes()) {
          ia.SetWrapMode(WrapMode.TileFlipXY);
          gr.DrawImage(square, new Rectangle(0, 0, size, size), 0, 0, side, side, GraphicsUnit.Pixel, ia);
        }
      }
      // PNG duz alfa tasir; PArgb -> Argb donusumunu LockBits yapar.
      Rectangle all = new Rectangle(0, 0, size, size);
      BitmapData sd = scaled.LockBits(all, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      byte[] outBuf = new byte[size * size * 4];
      System.Runtime.InteropServices.Marshal.Copy(sd.Scan0, outBuf, 0, outBuf.Length);
      scaled.UnlockBits(sd);
      using (Bitmap outBmp = FromBytes(outBuf, size, size, PixelFormat.Format32bppArgb))
        outBmp.Save(path, ImageFormat.Png);
    }
  }

  static Bitmap FromBytes(byte[] data, int w, int h, PixelFormat format) {
    Bitmap b = new Bitmap(w, h, format);
    BitmapData d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, format);
    System.Runtime.InteropServices.Marshal.Copy(data, 0, d.Scan0, data.Length);
    b.UnlockBits(d);
    return b;
  }

  // Delik = kenara degseydi zemin sayilacak renk: tasmayla ayni esik.
  bool BackgroundLike(Rectangle box, int i, int w) {
    return IsBackgroundColor(((box.Top + i / w) * Width + box.Left + i % w) * 4, tol);
  }

  // Kenara acilmayan zemin renkli bolge (4 komsuluk) minArea'dan buyukse
  // delik adayi olarak isaretlenir; maske degismez, karari Save verir.
  void MarkHoles(Rectangle box, bool[] keep, bool[] hole, int minArea) {
    int w = box.Width, h = box.Height;
    bool[] seen = new bool[w * h];
    Stack<int> stack = new Stack<int>();
    List<int> region = new List<int>();
    for (int s = 0; s < w * h; s++) {
      if (seen[s] || !keep[s] || !BackgroundLike(box, s, w)) continue;
      region.Clear(); seen[s] = true; stack.Push(s);
      while (stack.Count > 0) {
        int p = stack.Pop(); region.Add(p);
        int x = p % w, y = p / w;
        for (int k = 0; k < 4; k++) {
          int nx = x + (k == 0 ? 1 : k == 1 ? -1 : 0);
          int ny = y + (k == 2 ? 1 : k == 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          int q = ny * w + nx;
          if (seen[q] || !keep[q] || !BackgroundLike(box, q, w)) continue;
          seen[q] = true; stack.Push(q);
        }
      }
      if (region.Count >= minArea) foreach (int r in region) hole[r] = true;
    }
  }

  // Kenar bandi (zemine 'r' piksel yakin) zemin rengi K ile karisimdan
  // ayristirilir: P = a*Q + (1-a)*K. Q bandin hemen icindeki gercek renktir
  // (bant disi tutulan komsularin ortalamasi). P, Q kadar ya da ondan fazla
  // K'dan uzaksa zeminle karismamistir (keskin kenar, koyu dis cizgi) ve
  // dokunulmaz; duz color-to-alpha bu kenarlari da koyultup delerdi. Ici
  // olmayan ince yapida (halat, zincir, direk teli) Q yoktur: orada K'ya karsi
  // color-to-alpha uygulanir.
  // Bant ve referans ARINDIRMADAN ONCEKI degerlerden okunur: asinma zincirlenmez.
  static void Defringe(byte[] buf, bool[] keep, int w, int h, int r, int kr, int kg, int kb) {
    double[] k = { kb, kg, kr };              // BGRA sirasi
    bool[] band = new bool[w * h];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int i = y * w + x;
      if (!keep[i]) continue;
      for (int dy = -r; dy <= r && !band[i]; dy++) for (int dx = -r; dx <= r && !band[i]; dx++) {
        int nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !keep[ny * w + nx]) band[i] = true;
      }
    }
    byte[] src = (byte[])buf.Clone();
    int rr = r + 1;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int i = y * w + x;
      if (!band[i]) continue;
      double qb = 0, qg = 0, qr = 0; int n = 0;
      for (int dy = -rr; dy <= rr; dy++) for (int dx = -rr; dx <= rr; dx++) {
        int nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        int j = ny * w + nx;
        if (!keep[j] || band[j]) continue;
        qb += src[j * 4]; qg += src[j * 4 + 1]; qr += src[j * 4 + 2]; n++;
      }
      int di = i * 4;
      double[] p = { src[di], src[di + 1], src[di + 2] };
      double[] q = n > 0 ? new double[] { qb / n, qg / n, qr / n } : null;
      double a = 0;
      if (q != null) {
        // En guvenilir kanal: Q'nun zemin renginden en uzak oldugu kanal.
        int c0 = 0;
        for (int c = 1; c < 3; c++) if (Math.Abs(q[c] - k[c]) > Math.Abs(q[c0] - k[c0])) c0 = c;
        double span = q[c0] - k[c0];
        if (Math.Abs(span) < 8) continue;      // ic de zemine yakin: ayristirilamaz
        a = (p[c0] - k[c0]) / span;
      } else {
        for (int c = 0; c < 3; c++) {
          double ac = p[c] > k[c] ? (k[c] < 255 ? (p[c] - k[c]) / (255 - k[c]) : 0)
                    : p[c] < k[c] ? (k[c] - p[c]) / k[c] : 0;
          if (ac > a) a = ac;
        }
      }
      if (a >= 1) continue;                     // zeminle karismamis
      if (a <= 0) { buf[di] = 0; buf[di + 1] = 0; buf[di + 2] = 0; buf[di + 3] = 0; continue; }
      for (int c = 0; c < 3; c++) {
        double v = q != null ? q[c] : k[c] + (p[c] - k[c]) / a;
        buf[di + c] = (byte)Math.Max(0, Math.Min(255, Math.Round(v)));
      }
      buf[di + 3] = (byte)Math.Round(a * 255);
    }
  }

  void SaveHoleDebug(byte[] buf, bool[] hole, int w, int h, string path) {
    byte[] d = new byte[w * h * 4];
    for (int i = 0; i < w * h; i++) {
      int a = buf[i * 4 + 3];
      for (int c = 0; c < 3; c++) d[i * 4 + c] = (byte)((buf[i * 4 + c] * a + 64 * (255 - a)) / 255);
      d[i * 4 + 3] = 255;
      if (hole[i]) { d[i * 4] = 255; d[i * 4 + 1] = 0; d[i * 4 + 2] = 255; }
    }
    using (Bitmap b = FromBytes(d, w, h, PixelFormat.Format32bppArgb)) b.Save(path, ImageFormat.Png);
  }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing

$sheetPath = (Resolve-Path $Sheet).Path
# Iki tuzak birden:
#   1. New-Object Tip(arg) PowerShell'da parantezi DIZI sanir; ::new() gerekir.
#   2. Degisken adi $sheet OLAMAZ: param blogundaki [string]$Sheet ile ayni
#      degiskendir (PowerShell buyuk/kucuk harf ayirmaz) ve TIPLIDIR, yani
#      nesne atansa bile ToString()'e cevrilir. Hata "String does not contain
#      a method named ..." olarak dusuyordu.
$keyValue = [Convert]::ToInt32($Key.TrimStart('#'), 16)
$white = $keyValue -eq 0xFFFFFF
if ($Tolerance -lt 0) { $Tolerance = if ($white) { 24 } else { 60 } }
if ($Fringe -lt 0) { $Fringe = if ($white) { 1 } else { 2 } }
$slicer = [IconSheet]::new($sheetPath, $Tolerance, $keyValue)
if ($Grid) {
  if ($Grid -notmatch '^(\d+)x(\d+)$') { throw "-Grid SUTUNxSATIR olmali (ornek 4x3): $Grid" }
  $groups = $slicer.GroupsByGrid([int]$Matches[1], [int]$Matches[2], $MinArea, $MergeGap)
} else {
  $groups = $slicer.GroupsByMerge($MinArea, $MergeGap)
}

Write-Host ("{0}x{1} sheet - {2} ikon bulundu" -f $slicer.Width, $slicer.Height, $groups.Count)
foreach ($r in $slicer.Unassigned($groups, 100)) {
  Write-Host ("  UYARI: hicbir ikona girmeyen parca {0},{1} {2}x{3}" -f $r.Left, $r.Top, $r.Width, $r.Height)
}

if (-not $DryRun -and -not (Test-Path $Out)) {
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
}

# -Names tek bir virgullu dize olarak gelebiliyor (ornegin bu betik baska bir
# powershell surecinden -File ile cagrildiginda dizi tek elemana duser).
# Bolmek ucuz ve yanlis dosya adi uretmekten iyidir.
function Split-List([string[]]$items) {
  $list = @()
  foreach ($n in $items) { $list += ($n -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
  return , $list
}
$labels = Split-List $Names
# Ad $holeArea OLAMAZ: [int]$HoleArea parametresiyle ayni degiskendir (bkz. $sheet).
$holePick = @{}
foreach ($h in (Split-List $Holes)) {
  $parts = $h -split ':'
  $holePick[$parts[0]] = if ($parts.Count -gt 1) { [int]$parts[1] } else { $HoleArea }
}

$i = 0
foreach ($group in $groups) {
  $box = $group.Box
  $name = if ($i -lt $labels.Count) { $labels[$i] } else { "icon_{0:d2}" -f ($i + 1) }
  Write-Host ("  {0,-22} {1,4},{2,-4} {3,4}x{4,-4}" -f $name, $box.Left, $box.Top, $box.Width, $box.Height)
  if (-not $DryRun) {
    $clean = $holePick.ContainsKey($name)
    $area = if ($clean) { $holePick[$name] } else { $HoleArea }
    # Renkli zeminde kapali zemin parcasi parlama olamaz: her boyda delik.
    if (-not $white) { $clean = $true; $area = 1 }
    # .NET'e $null giden string bos dizeye doner; Save bos dizeyi "yok" sayar.
    $debug = if ($HoleDebug) { Join-Path $Out "$name.holes.png" } else { '' }
    $slicer.Save($group, (Join-Path $Out "$name.png"), $Size, [int]($box.Width * 0.04), $area, $clean, $Fringe, $debug)
  }
  $i++
}

if ($DryRun) { Write-Host "(DryRun: dosya yazilmadi)" }
else { Write-Host ("-> {0}" -f (Resolve-Path $Out).Path) }
