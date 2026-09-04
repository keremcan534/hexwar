# Ikon sheet dilimleyici.
#
# ChatGPT ikonlari TEK SHEET olarak uretiyor (tek seferde uretilenlerin isigi
# ve tonu birbirini tutuyor); bu betik onlari tek tek PNG'ye ayirir.
#
# NEDEN IZGARA DEGIL DE BILESEN: sheet'lerin yerlesimi duzensiz — satirlar
# farkli sayida ikon tasiyor, kart ikonlari kare degil, aralar esit degil.
# Sabit izgara her yeni sheet'te elle ayar isterdi. Bunun yerine ARKA PLAN
# bulunur, geri kalan bagli bilesenlere ayrilir ve okuma sirasina dizilir.
#
# NEDEN KENARDAN TASMA (flood fill) ILE BEYAZ SILINIR: ikonlarin ICINDE de
# beyaz var (capa halati, cadir bezi, mermer sutun, kar). Duz "beyaza yakin
# pikseli sil" kurali bu beyazlari da delerdi. Tasma yalniz KENARDAN baslar,
# yani nesnenin icindeki beyaz kapali kalir ve hayatta kalir.
#
# Kucultmede premultiply sart: saydam pikselin rengi yoksa bicubic o rengi
# kenara sizdirir ve nesnenin cevresinde hale kalir.
#
# Bagimlilik yok: PowerShell + System.Drawing (depo "bagimlilik yok" kuralinda).
#
# Kullanim:
#   powershell -ExecutionPolicy Bypass -File scripts/slice-icons.ps1 `
#     -Sheet .\sheet.png -Out .\assets\icons\rgo -Size 240 `
#     -Names grain_farm,fishery,logging,quarry,iron_mine,coal_mine
#
#   -Names verilmezse dosyalar icon_01..icon_NN olur; once boyle kosup
#   ciktiya bakmak, sonra adlarla tekrar kosmak en hizli yol.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Sheet,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Size = 240,
  # Beyaz toleransi: 255-Tolerance ustundeki her kanal "beyaz" sayilir.
  [int]$Tolerance = 24,
  # Bu kadar pikselden kucuk bilesen toz kabul edilir (antialias kirintisi).
  [int]$MinArea = 900,
  # Birbirine bu kadar yakin kutular TEK ikondur: bayrak direkten, duman
  # bacadan, golge nesneden kopuk gelebiliyor.
  [int]$MergeGap = 14,
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

public class IconSheet {
  public int Width, Height;
  byte[] px;          // BGRA
  bool[] bg;          // arka plan maskesi

  public IconSheet(string path, int tolerance) {
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
    FloodBackground(tolerance);
  }

  bool IsBackgroundColor(int i, int tol) {
    int b = px[i], g = px[i + 1], r = px[i + 2], a = px[i + 3];
    if (a < 16) return true;                       // zaten saydam
    int lo = Math.Min(b, Math.Min(g, r));
    return lo >= 255 - tol;                        // beyaza yakin
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

  // Bagli bilesenler (8 komsuluk) -> kutular.
  public List<Rectangle> Components(int minArea) {
    bool[] seen = new bool[Width * Height];
    List<Rectangle> boxes = new List<Rectangle>();
    Stack<int> stack = new Stack<int>();
    for (int start = 0; start < seen.Length; start++) {
      if (seen[start] || bg[start]) continue;
      int x0 = start % Width, x1 = x0, y0 = start / Width, y1 = y0, area = 0;
      seen[start] = true; stack.Push(start);
      while (stack.Count > 0) {
        int p = stack.Pop(); area++;
        int x = p % Width, y = p / Width;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
          int nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= Width || ny >= Height) continue;
          int q = ny * Width + nx;
          if (seen[q] || bg[q]) continue;
          seen[q] = true; stack.Push(q);
        }
      }
      if (area >= minArea) boxes.Add(Rectangle.FromLTRB(x0, y0, x1 + 1, y1 + 1));
    }
    return boxes;
  }

  // Yakin kutulari birlestir: bayrak/duman/golge kopuk bilesen gelir.
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

  /// Kutuyu kirp, arka plani saydam yap, kareye oturt, Size'a olcekle.
  public void Save(Rectangle box, string path, int size, int pad) {
    int w = box.Width, h = box.Height;
    using (Bitmap cut = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      BitmapData d = cut.LockBits(new Rectangle(0, 0, w, h),
        ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      byte[] buf = new byte[w * h * 4];
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int src = ((box.Top + y) * Width + (box.Left + x));
        int di = (y * w + x) * 4;
        if (bg[src]) { buf[di] = 0; buf[di + 1] = 0; buf[di + 2] = 0; buf[di + 3] = 0; continue; }
        buf[di] = px[src * 4]; buf[di + 1] = px[src * 4 + 1];
        buf[di + 2] = px[src * 4 + 2]; buf[di + 3] = 255;
      }
      System.Runtime.InteropServices.Marshal.Copy(buf, 0, d.Scan0, buf.Length);
      cut.UnlockBits(d);

      // Kareye oturt: en-boy orani korunur, ikonlar ayni kutuda ayni buyuklukte.
      int side = Math.Max(w, h) + pad * 2;
      using (Bitmap square = new Bitmap(side, side, PixelFormat.Format32bppArgb)) {
        using (Graphics g = Graphics.FromImage(square)) {
          g.Clear(Color.Transparent);
          g.DrawImageUnscaled(cut, (side - w) / 2, (side - h) / 2);
        }
        Premultiply(square, true);
        using (Bitmap outBmp = new Bitmap(size, size, PixelFormat.Format32bppArgb)) {
          using (Graphics g = Graphics.FromImage(outBmp)) {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            using (ImageAttributes ia = new ImageAttributes()) {
              ia.SetWrapMode(WrapMode.TileFlipXY);
              g.DrawImage(square, new Rectangle(0, 0, size, size),
                0, 0, side, side, GraphicsUnit.Pixel, ia);
            }
          }
          Premultiply(outBmp, false);
          outBmp.Save(path, ImageFormat.Png);
        }
      }
    }
  }

  static void Premultiply(Bitmap bmp, bool forward) {
    BitmapData d = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height),
      ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    byte[] buf = new byte[bmp.Width * bmp.Height * 4];
    System.Runtime.InteropServices.Marshal.Copy(d.Scan0, buf, 0, buf.Length);
    for (int i = 0; i < buf.Length; i += 4) {
      int a = buf[i + 3];
      if (a == 255) continue;
      for (int c = 0; c < 3; c++) {
        int v = buf[i + c];
        if (forward) v = v * a / 255;
        else v = a == 0 ? 0 : Math.Min(255, v * 255 / a);
        buf[i + c] = (byte)v;
      }
    }
    System.Runtime.InteropServices.Marshal.Copy(buf, 0, d.Scan0, buf.Length);
    bmp.UnlockBits(d);
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
#      a method named Components" olarak dusuyordu.
$slicer = [IconSheet]::new($sheetPath, $Tolerance)
$boxes = $slicer.Components($MinArea)
$boxes = [IconSheet]::Merge($boxes, $MergeGap)
$boxes = [IconSheet]::ReadingOrder($boxes)

Write-Host ("{0}x{1} sheet - {2} ikon bulundu" -f $slicer.Width, $slicer.Height, $boxes.Count)

if (-not $DryRun -and -not (Test-Path $Out)) {
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
}

# -Names tek bir virgullu dize olarak gelebiliyor (ornegin bu betik baska bir
# powershell surecinden -File ile cagrildiginda dizi tek elemana duser).
# Bolmek ucuz ve yanlis dosya adi uretmekten iyidir.
$labels = @()
foreach ($n in $Names) { $labels += ($n -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

$i = 0
foreach ($box in $boxes) {
  $name = if ($i -lt $labels.Count) { $labels[$i] } else { "icon_{0:d2}" -f ($i + 1) }
  Write-Host ("  {0,-22} {1,4},{2,-4} {3,4}x{4,-4}" -f $name, $box.Left, $box.Top, $box.Width, $box.Height)
  if (-not $DryRun) {
    $slicer.Save($box, (Join-Path $Out "$name.png"), $Size, [int]($box.Width * 0.04))
  }
  $i++
}

if ($DryRun) { Write-Host "(DryRun: dosya yazilmadi)" }
else { Write-Host ("-> {0}" -f (Resolve-Path $Out).Path) }
