"""Düz pirinç silüet simgelere dökme metal efekti (Kerem: "çok düz logolar, efekt ekle").

ChatGPT sayfaları düz sarı silüet ve düz koyu emaye veriyor. Burada her simgeye aynı ışık
pişirilir: pirinç maskeden yükseklik çıkar, sol üstten ışıkla kabartma ve parlama alır;
emaye levha kenarda kararır, üstünde cam gibi hafif parıltı, pirincin altında gölge olur.
Ham dilimler assets/incoming/dilim-ham/<klasör> altında saklanır; betik hep onlardan okur,
yeniden koşmak efekti üst üste bindirmez.

    python scripts/art/emboss-icons.py
"""
import os
import shutil
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FOLDERS = ['assets/icons/tabs-flat', 'assets/tech-flat']
RAW = os.path.join(ROOT, 'assets', 'incoming', 'dilim-ham')

# Sekme madalyonlarının emayesi her ekranda ayrı renk (Kerem 2026-11-20: "her bir ikon ayırt
# edici farklı bir renk olabilir"). Ton OKLCH derecesi; açıklık ve doygunluk ortak, renk çarkında
# ~36 derece aralıkla: on sekme yan yana durduğunda komşular karışmaz. Teknoloji setinde yok.
TAB_ENAMEL = {
    'military': 15, 'industry': 45, 'population': 75, 'construction': 105, 'budget': 135,
    'trade': 165, 'policies': 195, 'technology': 225, 'diplomacy': 255, 'politics': 285,
    'cultures': 315, 'chronicle': 345, 'navy': 240,
}
ENAMEL_L, ENAMEL_C = 0.36, 0.085

LIGHT = np.array([-0.55, -0.65, 0.52])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'L')
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float64) / 255


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def oklch_rgb(L, C, h):
    a, b = C * np.cos(np.radians(h)), C * np.sin(np.radians(h))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lin = np.array([4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
                    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
                    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_])
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)


def emboss(img, hue=None):
    arr = np.asarray(img.convert('RGBA')).astype(np.float64) / 255
    rgb, alpha = arr[..., :3], arr[..., 3]
    h, w = alpha.shape
    s = w / 256
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Pirinç: sıcak ve parlak (kırmızı/yeşil yüksek, mavi düşük). Kırmızı haç gibi anlam rengi pirinç sayılmaz.
    brass = smooth(0.18, 0.35, (r + g) / 2 - b) * smooth(0.35, 0.55, g) * (alpha > 0.5)
    # Yükseklik: yuvarlatılmış maske; ince çizgiler de kabarsın diye iki ölçek.
    height = 0.65 * blur(brass, 1.6 * s) + 0.35 * blur(brass, 3.5 * s)
    gy, gx = np.gradient(height)
    k = 11.0 * s
    n = np.stack([-gx * k, -gy * k, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    lam = np.clip((n * LIGHT).sum(-1), 0, 1)
    refl = 2 * n[..., 2:3] * n - np.array([0, 0, 1.0])
    spec = np.clip((refl * LIGHT).sum(-1), 0, 1) ** 18
    yy, xx = np.mgrid[0:h, 0:w]
    vert = 1.08 - 0.22 * (yy / h)
    # Pirinç tonu yeniden boyanır: düz sarı yerine koyu bronzdan açık altına giden metal
    # rampası. Işık ve kenar kabartması rampada yürür; ince fırça izi gren olarak eklenir.
    dark = np.array([0.30, 0.20, 0.07])
    mid = np.array([0.72, 0.54, 0.24])
    light = np.array([1.0, 0.90, 0.62])
    t = np.clip(lam * vert, 0, 1.2)[..., None]
    metal = np.where(t < 0.55, dark + (mid - dark) * (t / 0.55), mid + (light - mid) * np.clip((t - 0.55) / 0.45, 0, 1))
    rng = np.random.default_rng(7)
    grain = Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8), 'L').filter(ImageFilter.BoxBlur(max(1, int(1.5 * s))))
    grain = (np.asarray(grain).astype(np.float64) / 255 - 0.5) * 0.10
    metal = np.clip(metal * (1 + grain[..., None]) + spec[..., None] * np.array([1.0, 0.96, 0.82]) * 0.8, 0, 1)
    # Silüetin kenarı koyu bir çizgiyle biter: dökme parçanın emayeye oturduğu yiv.
    edge = np.clip(brass - blur(brass, 0.9 * s), 0, 1) * 1.6
    metal = metal * (1 - 0.45 * np.clip(edge, 0, 1))[..., None]
    # Emaye: kenarda kararır, üstte cam parıltısı, pirincin sağ altına gölge.
    cx, cy = w / 2, h / 2
    rad = np.hypot((xx - cx) / (w / 2), (yy - cy) / (h / 2))
    vign = 1 - 0.45 * smooth(0.35, 1.0, rad)
    shift = np.roll(np.roll(blur(brass, 2.2 * s), int(2 * s), 0), int(2 * s), 1)
    drop = 1 - 0.65 * shift * (1 - brass)
    gloss = np.exp(-(((xx - cx) / (w * 0.32)) ** 2 + ((yy - h * 0.24) / (h * 0.13)) ** 2)) * 0.10
    base = rgb
    if hue is not None:
        # Ham emaye düz lacivert: açıklık dokusu korunur, rengi sekmenin tonuyla değişir.
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
        ref = np.median(lum[(alpha > 0.5) & (brass < 0.2)]) if np.any((alpha > 0.5) & (brass < 0.2)) else 0.05
        shade = np.clip(lum / max(ref, 1e-3), 0.6, 1.5)[..., None]
        base = np.clip(oklch_rgb(ENAMEL_L, ENAMEL_C, hue)[None, None, :] * shade, 0, 1)
    enamel = np.clip(base * (vign * drop)[..., None] + gloss[..., None] * np.array([0.9, 0.92, 0.95]), 0, 1)
    out = enamel * (1 - brass[..., None]) + metal * brass[..., None]
    res = np.concatenate([out, alpha[..., None]], -1)
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    for folder in FOLDERS:
        src = os.path.join(ROOT, folder)
        raw = os.path.join(RAW, os.path.basename(folder))
        if not os.path.isdir(raw):
            shutil.copytree(src, raw)
        for name in sorted(os.listdir(raw)):
            if name.endswith('.webp'):
                hue = TAB_ENAMEL.get(name[:-5]) if folder.endswith('tabs-flat') else None
                emboss(Image.open(os.path.join(raw, name)), hue).save(os.path.join(src, name), 'WEBP', quality=94, method=6)
        print(folder, len(os.listdir(raw)))


if __name__ == '__main__':
    main()
