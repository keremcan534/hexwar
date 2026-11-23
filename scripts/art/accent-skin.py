"""Arayüz dokularının vurgu renkli eşleri (src/ui/theme.js ACCENTS).

Pirinç pikseller OKLCH'de seçilen vurgunun tonuna döner; açıklık aynı kalır, böylece
dokunun ışığı, gölgesi ve oyması korunur. Anlam taşıyan renkler (kırmızı tehlike
düğmesi, yeşil) dokunulmaz: yalnız pirinç bandı (ton 45-118, doygunluk 0.17 altı) döner.
Aynı dönüşüm src/ui/theme.js accentColor'dadır; ikisi birlikte değişmeli.

    python scripts/art/accent-skin.py
    python scripts/art/accent-skin.py --taraf    # yalnız harita sayacının taraf emayeleri
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SKIN = os.path.join(ROOT, 'assets', 'ui', 'skin')

# ton (derece), doygunluk çarpanı, en düşük doygunluk
ACCENTS = {
    'steel': (248.0, 0.95, 0.0),
    'silver': (250.0, 0.12, 0.0),
    # Kızıl denendi: seçili düğme tehlike düğmesinin kırmızısına karışıyordu.
    'verdigris': (192.0, 0.85, 0.0),
}


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_gam(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def rgb_to_oklch(rgb):
    r, g, b = [to_lin(rgb[..., i]) for i in range(3)]
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    C = np.hypot(A, B)
    h = np.degrees(np.arctan2(B, A)) % 360
    return L, C, h


def oklch_to_rgb(L, C, h):
    a = C * np.cos(np.radians(h))
    b = C * np.sin(np.radians(h))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return np.stack([to_gam(r), to_gam(g), to_gam(bb)], axis=-1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def brass_weight(C, h):
    band = smooth(38, 50, h) * (1 - smooth(112, 124, h))
    return band * smooth(0.012, 0.03, C) * (1 - smooth(0.15, 0.19, C))


# KATEGORİ DÜĞMELERİ (Kerem 2026-11-20: "butonlarda renkleri kullanalım"): seçili düğmenin
# pirinci kategorinin tonuna döner (yasa, danışman, karar, birlik kolu). Tonlar sekme emayesiyle
# aynı çarktadır (scripts/art/emboss-icons.py TAB_ENAMEL); CSS bağı src/hud.css [data-cat].
CATEGORIES = {
    'military': 15, 'industry': 45, 'people': 75, 'development': 105, 'economy': 135, 'trade': 165,
    'policy': 195, 'research': 225, 'diplomacy': 255, 'politics': 285, 'culture': 315, 'chronicle': 345,
}
# Koyu emaye: pirincin açıklığında renk şeker gibi pastel kalıyordu; beyaz yazı koyu zeminde durur.
CATEGORY_CHROMA = 1.35
CATEGORY_LIGHT = 0.7


def recolor(img, accent):
    hue, cmul, _ = ACCENTS[accent]
    return recolor_hue(img, hue, cmul)


def recolor_hue(img, hue, cmul, lmul=1.0):
    arr = np.asarray(img.convert('RGBA')).astype(np.float64) / 255
    rgb = arr[..., :3]
    L, C, h = rgb_to_oklch(rgb)
    w = brass_weight(C, h)
    C2 = C * cmul
    # Kısa yoldan ton geçişi: ağırlık kadar hedefe yaklaşır.
    dh = ((hue - h + 180) % 360) - 180
    h2 = h + dh * w
    C3 = C + (C2 - C) * w
    out = oklch_to_rgb(L * (1 + (lmul - 1) * w), C3, h2)
    res = np.concatenate([out, arr[..., 3:4]], axis=-1)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def categories():
    out = os.path.join(SKIN, 'kat')
    os.makedirs(out, exist_ok=True)
    for src_dir, suffix in [(SKIN, ''), (os.path.join(SKIN, 'acik'), '-acik')]:
        img = Image.open(os.path.join(src_dir, 'dugme-secili.webp'))
        for name, hue in CATEGORIES.items():
            recolor_hue(img, hue, CATEGORY_CHROMA, CATEGORY_LIGHT).save(os.path.join(out, f'{name}{suffix}.webp'), 'WEBP', quality=95, method=6)
    print('kat', len(CATEGORIES), 'tamam')


# HARİTA SAYACININ TARAF EMAYESİ (src/render/renderer.js COUNTER_SKIN): birlik künyesi arayüzle
# aynı malzemedir. Pirinç çerçeve kalır, yalnız koyu deri zemin tarafın emayesine döner; zeminin
# çizik ve parlaması L'de olduğu için korunur. Eskiden taraf, pirinç simgenin 'color' karışımıyla
# düz yeşil/kırmızı çizgiye boyanıyordu. Haritaya yazılır, vurgu rengiyle dönmez.
# ad: (ton, doygunluk, açıklık çarpanı). Koyu emaye: açık ve doygun zemin karlı haritada
# oyuncak gibi parlıyordu, pirinç simge de üstünde kayboluyordu. Düşman biraz daha açık:
# kırmızı-yeşil renk körlüğünde ikisi açıklıktan da ayrılsın (biçim işareti ayrıca kesik köşe).
SIDES = {'own': (148.0, 0.068, 0.98), 'ally': (250.0, 0.072, 1.02), 'hostile': (27.0, 0.11, 1.07)}
SIDE_RIM = 9.5


def sides():
    out = os.path.join(SKIN, 'taraf')
    os.makedirs(out, exist_ok=True)
    arr = np.asarray(Image.open(os.path.join(SKIN, 'dugme.webp')).convert('RGBA')).astype(np.float64) / 255
    h, w = arr.shape[:2]
    y = np.arange(h)[:, None]
    x = np.arange(w)[None, :]
    edge = np.minimum(np.minimum(y, h - 1 - y), np.minimum(x, w - 1 - x)).astype(np.float64)
    field = np.clip((edge - SIDE_RIM) / 1.5, 0, 1)[..., None]
    L, _, _ = rgb_to_oklch(arr[..., :3])
    for name, (hue, chroma, lmul) in SIDES.items():
        L2 = L * lmul
        # Doygunluk açıklıkla birlikte salınır: çiziğin parlak yeri renkli kalsın, gri lekeye dönmesin.
        C2 = chroma * np.clip(L2 / max(L2[field[..., 0] > 0.5].mean(), 1e-3), 0.6, 1.4)
        rgb = oklch_to_rgb(L2, C2, np.full_like(L2, hue))
        res = np.concatenate([arr[..., :3] * (1 - field) + rgb * field, arr[..., 3:4]], axis=-1)
        Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(
            os.path.join(out, f'{name}.webp'), 'WEBP', quality=95, method=6)
    print('taraf', len(SIDES), 'tamam')


def main():
    if '--taraf' in sys.argv:
        sides()
        return
    categories()
    sides()
    for accent in ACCENTS:
        for src_dir, suffix in [(SKIN, ''), (os.path.join(SKIN, 'acik'), '-acik')]:
            dst = os.path.join(SKIN, accent + suffix)
            os.makedirs(dst, exist_ok=True)
            for name in sorted(os.listdir(src_dir)):
                if not name.endswith('.webp'):
                    continue
                img = Image.open(os.path.join(src_dir, name))
                recolor(img, accent).save(os.path.join(dst, name), 'WEBP', quality=95, method=6)
            print(accent + suffix, 'tamam')


if __name__ == '__main__':
    main()
