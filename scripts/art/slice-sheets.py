"""2026-11-20 ChatGPT sayfalarını dilimler (assets/incoming/... → assets/icons/..., assets/ui/...).

Macenta zeminliler scripts/slice-icons.ps1 ile (renk ayrıştırma orada), sonra saydam pay
kırpılır; kare olmayan parçalar (çubuk, oluk, liste kutusu) kendi en-boyunda kalır.
Siyah zeminli efekt sayfası eklemeli çizim içindir: alfa yok, 4x4 kareler şeride dizilir.

    python scripts/art/slice-sheets.py
"""
import os
import subprocess
import tempfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
INC = os.path.join(ROOT, 'assets', 'incoming')

# kaynak, hedef klasör, ızgara ("" = okuma sırası), çıktı boyu, adlar
SHEETS = [
    ('harita/ok-dokulari.webp', 'assets/icons/arrows', '', 512, 'fill_orange,fill_red,select_frame,arrow_head'),
    ('arayuz/gosterge-gercek-1.webp', 'assets/icons/kpi-real', '4x2', 256,
     'output,power,stability,war_support,infamy,exhaustion,population,manpower'),
    ('arayuz/gosterge-gercek-2.webp', 'assets/icons/kpi-real', '4x2', 256,
     'invested,industry,consumer_goods,exports,bills,development_fund,supply,literacy'),
    ('arayuz/gosterge-gercek-3.webp', 'assets/icons/kpi-real', '4x2', 256,
     'standing_army,peoples,full_citizens,unrest,researching,allies,army_draws,officers'),
    # §24-25 çerçeve armaları ve süsleri (ekran penceresinin tepesi, köşeler, ayraç).
    # İlk set (parlak pirinç) v1'de saklıdır; oyundaki cilalı bronz settir (Kerem: "polishlenmiş
    # armalar eskisinden daha iyi").
    ('arayuz/arma-1.webp', 'assets/ui/crest/v1', '2x3', 720, 'eagle,wheat,shield,gear,sabres,anchor'),
    ('arayuz/arma-2.webp', 'assets/ui/crest/v1', '2x3', 720, 'corner,divider,finial,keystone,pendant,wings'),
    ('arayuz/arma-1-cilali.webp', 'assets/ui/crest', '2x3', 720, 'eagle,wheat,shield,gear,sabres,anchor'),
    ('arayuz/arma-2-cilali.webp', 'assets/ui/crest', '2x3', 720, 'corner,divider,finial,keystone,pendant,wings'),
    # §23 saat bloğu: ceviz plaka, takvim yaprağı, telgraf kadranı, ibre, oynat/duraklat.
    ('arayuz/saat-blogu.webp', 'assets/ui/clock', '', 720, 'plate,calendar,dial,needle,play,pause'),
    ('arayuz/sekme-simgeleri.webp', 'assets/icons/tabs-flat', '4x3', 192, 'construction,industry,trade,budget,military,population,cultures,politics,technology,chronicle,diplomacy,navy'),
    ('tech/teknoloji-sanayi-altyapi.webp', 'assets/tech-flat', '5x4', 256, 'electric_motors,assembly_line,mass_production,machine_tools,flow_production,electric_steel,refined_petroleum,industrial_chemistry,light_alloys,synthetic_fuel,trunk_lines,motor_lorries,paved_highways,electrified_railways,motorised_logistics,steam_threshers,agricultural_colleges,tractors,hybrid_crops,mechanised_agriculture'),
    ('tech/teknoloji-ordu.webp', 'assets/tech-flat', '4x4', 256, 'fire_and_movement,trench_warfare,infiltration_tactics,combined_arms,mobile_warfare,smokeless_powder,light_machine_guns,landships,light_tanks,medium_tanks,observation_balloons,military_aviation,fighter_aircraft,metal_airframes,close_air_support,monoplane_fighters'),
    ('tech/teknoloji-donanma-toplum.webp', 'assets/tech-flat', '5x4', 256, 'pre_dreadnoughts,dreadnoughts,submarines,aircraft_carriers,radar,blue_water_doctrine,fire_control,convoy_system,naval_aviation,carrier_task_forces,social_insurance,total_mobilisation,propaganda_ministry,planned_economy,welfare_state,wireless_telegraphy,research_laboratories,mass_higher_education,electronics,nuclear_physics'),
    ('harita/harita-isaretleri.webp', 'assets/icons/map-marks', '4x2', 256,
     'province,capital,city,port,fortress,badge,rally,encircled'),
    ('harita/birlik-levhalari.webp', 'assets/icons/map-plates', '3x2', 320,
     'infantry,cavalry,artillery,armor,warship,submarine'),
    ('arayuz/kucuk-simgeler.webp', 'assets/icons/ui-art', '4x4', 128,
     'star,star_empty,close,menu,play,pause,bell,paper,home,locate,hourglass,layers,swords,advance,halt,check'),
    ('arayuz/gostergeler.webp', 'assets/ui/parts', '', 1400,
     'ring,coin,groove,fill_green,fill_amber,fill_red,fill_blue'),
    ('arayuz/denetimler.webp', 'assets/ui/parts', '', 1100,
     'toggle_off,toggle_on,check_off,check_on,slider_groove,slider_knob,dropdown,scroll_thumb,radio_off,radio_on'),
]

# Kendi çözünürlüğünde kalan sayfalar (9 dilim ve çubuk: ikon boyuna büyütülürse kenar bulanır,
# 72 px'lik lamba 1000 px olur). 'native' = macenta ayrıştırma + bileşen, okuma sırası satır
# kovası (üst kenar // 150) sonra soldan; 'engrave' = siyah zeminli gravür, eşit hücreler,
# alfa = parlaklık (çizgi fildişi kalır, zemin saydam).
NATIVE = [
    # §26 (2026-11-25, Codex gpt-6.2-sol): yüzer bilgi paneli 9 dilimi, bilgi satırı levhası,
    # camlı gösterge kanalı, pasta grafiği halkası, kademe lambası (boş/yanan).
    # Çerçeve skin/ altına gider: accent-skin.py vurgu renkli eşlerini oradan üretir.
    ('arayuz/panel-parcalari.webp', 'assets/ui/parts', 'native',
     'assets/ui/skin/bilgi-cerceve,row_plate,gauge,bezel,pip_off,pip_on'),
    # §27 (2026-11-25, Codex): boş durum gravürleri, 3x2 eşit hücre.
    ('arayuz/bos-durum-gravur.webp', 'assets/ui/vignette', 'engrave3x2', 'peace,ledger,harbour,accord,drill,waiting'),
    # §28 (2026-11-25, Codex): diplomasi masasının kart gravürleri ve harita süsü.
    ('arayuz/diplomasi-gravur.webp', 'assets/ui/vignette', 'engrave3x2', 'flags,globe,treaty,compass,dividers,dispatch'),
]


def unmix_magenta(rgb):
    """Macenta zemini ayrıştırır. Alfa zemine UZAKLIKTAN gelir: kanal başına en küçük alfa
    (klasik ayrıştırma) pirincin kırmızı ve mavisini zemin sayıp içini yeşile çeviriyordu.
    Yalnız kenar şeridi (yarı saydam) zeminden arındırılır: c = a·F + (1-a)·K."""
    import numpy as np
    c = rgb.astype(np.float32)
    k = np.array([255.0, 0.0, 255.0], dtype=np.float32)
    d = np.sqrt(((c - k) ** 2).sum(axis=2))
    # Codex zemini tam #FF00FF değil (uzaklık p99 ~17, en çok ~45): eşik onun üstünde.
    a = np.clip((d - 55.0) / 110.0, 0.0, 1.0)
    safe = np.maximum(a, 1e-3)[..., None]
    f = np.where(a[..., None] < 1.0, np.clip((c - (1.0 - safe) * k) / safe, 0, 255), c)
    # Kenarda kalan pembe sızıntı: kırmızı ve mavi yeşilin çok üstündeyse ikisini de kıs.
    spill = np.clip(np.minimum(f[..., 0], f[..., 2]) - f[..., 1] - 40.0, 0, None) * (a < 1.0)
    f[..., 0] -= spill
    f[..., 2] -= spill
    return np.clip(f, 0, 255), a


def slice_native(src, out_dir, names):
    import numpy as np
    from scipy import ndimage
    rgb = np.asarray(Image.open(src).convert('RGB'))
    f, a = unmix_magenta(rgb)
    labels, count = ndimage.label(a > 0.5)
    boxes = [b for b in ndimage.find_objects(labels) if (b[0].stop - b[0].start) * (b[1].stop - b[1].start) > 400]
    boxes.sort(key=lambda b: (b[0].start // 150, b[1].start))
    names = names.split(',')
    if len(boxes) != len(names):
        raise SystemExit(f'{src}: {len(boxes)} parça bulundu, {len(names)} ad var')
    os.makedirs(out_dir, exist_ok=True)
    for b, name in zip(boxes, names):
        y0, y1 = max(0, b[0].start - 2), min(rgb.shape[0], b[0].stop + 2)
        x0, x1 = max(0, b[1].start - 2), min(rgb.shape[1], b[1].stop + 2)
        rgba = np.dstack([f[y0:y1, x0:x1], a[y0:y1, x0:x1] * 255]).astype(np.uint8)
        # Adında '/' olan parça kökten yollanır (başka klasöre giden tek parça).
        dest = os.path.join(ROOT, f'{name}.webp') if '/' in name else os.path.join(out_dir, f'{name}.webp')
        # Yarı boy: ekranda en büyük kullanım 9 dilimin ~%30'u, yarı boy yine 1.5x örnekli.
        part = Image.fromarray(rgba, 'RGBA')
        part = part.resize((max(1, part.width // 2), max(1, part.height // 2)), Image.LANCZOS)
        part.save(dest, quality=92, method=6)
        print('  ', name, (x1 - x0, y1 - y0))


def slice_engrave(src, out_dir, names, cols=3, rows=2, size=256):
    import numpy as np
    im = Image.open(src).convert('RGB')
    w, h = im.size
    names = names.split(',')
    os.makedirs(out_dir, exist_ok=True)
    for i, name in enumerate(names):
        cx, cy = i % cols, i // cols
        cell = np.asarray(im.crop((cx * w // cols, cy * h // rows, (cx + 1) * w // cols, (cy + 1) * h // rows))).astype(np.float32)
        lum = cell.max(axis=2) / 255.0
        alpha = np.clip((lum - 0.08) / 0.8, 0.0, 1.0)
        ys, xs = np.nonzero(alpha > 0.04)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        # Çizgi tek renk fildişi: tonu alfa taşır, temada CSS rengi bozulmasın.
        ink = np.empty(cell.shape, dtype=np.float32)
        ink[...] = (236, 227, 205)
        rgba = np.dstack([ink, alpha * 255])[y0:y1, x0:x1].astype(np.uint8)
        out = Image.fromarray(rgba, 'RGBA')
        out.thumbnail((size, size), Image.LANCZOS)
        out.save(os.path.join(out_dir, f'{name}.webp'), quality=92)
        print('  ', name, out.size)


def slice_magenta(src, out_dir, grid, size, names):
    tmp = tempfile.mkdtemp(prefix='dilim-')
    png = os.path.join(tmp, 'sheet.png')
    Image.open(src).convert('RGB').save(png)
    args = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
            os.path.join(ROOT, 'scripts', 'slice-icons.ps1'), '-Sheet', png, '-Out', tmp,
            '-Size', str(size), '-Key', 'FF00FF', '-Names', names]
    if grid:
        args += ['-Grid', grid]
    else:
        args += ['-MergeGap', '30']
    log = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    found = [l for l in log.stdout.splitlines() if 'ikon bulundu' in l]
    print(os.path.basename(src), found[0] if found else log.stdout[-300:])
    os.makedirs(out_dir, exist_ok=True)
    for name in names.split(','):
        p = os.path.join(tmp, name + '.png')
        if not os.path.exists(p):
            print('  EKSIK', name)
            continue
        im = Image.open(p).convert('RGBA')
        box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            pad = 2
            im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
        im.save(os.path.join(out_dir, name + '.webp'), 'WEBP', quality=93, method=6)
        print('  ', name, im.size)


def finish_arrows(out_dir):
    """Ok dokuları yol boyunca tekrar eder: şeridin uçları birbirine eritilir (ChatGPT'nin
    "seamless"i tutmuyor, her 1.5 hexte bir dikiş görünüyordu) ve kenardaki saydam pay atılır.
    Seçim çerçevesinin ortası opak siyah gelir; sayaç altında kalsın diye saydam yapılır."""
    import numpy as np
    for name in ('fill_orange', 'fill_red'):
        p = os.path.join(out_dir, name + '.webp')
        if not os.path.exists(p):
            continue
        a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float64)
        solid = a[..., 3] > 250
        rows = np.where(solid.mean(1) > 0.9)[0]
        cols = np.where(solid.mean(0) > 0.9)[0]
        a = a[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        w = a.shape[1]
        o = int(w * 0.2)
        t = np.linspace(0, 1, o)[None, :, None]
        out = a[:, :w - o].copy()
        out[:, :o] = a[:, :o] * t + a[:, w - o:] * (1 - t)
        Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(p, 'WEBP', quality=93, method=6)
        print('  dikişsiz', name, out.shape[1], 'x', out.shape[0])
    p = os.path.join(out_dir, 'select_frame.webp')
    if os.path.exists(p):
        a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float64) / 255
        lum = a[..., :3].max(-1)
        a[..., 3] *= np.clip((lum - 0.04) / 0.16, 0, 1)
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA').save(p, 'WEBP', quality=93, method=6)
        print('  saydam orta', 'select_frame')


def slice_logo():
    src = os.path.join(INC, 'arayuz', 'logo.webp')
    im = Image.open(src).convert('RGB')
    w, h = im.size
    tmp = tempfile.mkdtemp(prefix='logo-')
    out = os.path.join(ROOT, 'assets', 'menu')
    for name, crop in [('logo', (0, 0, int(w * 0.64), h)), ('logo-emblem', (int(w * 0.62), 0, w, h))]:
        part = os.path.join(tmp, name + '-src.png')
        im.crop(crop).save(part)
        subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                        os.path.join(ROOT, 'scripts', 'slice-icons.ps1'), '-Sheet', part, '-Out', tmp,
                        '-Size', '1100', '-Key', 'FF00FF', '-MergeGap', '400', '-Names', name],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
        res = Image.open(os.path.join(tmp, name + '.png')).convert('RGBA')
        box = res.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        res = res.crop(box)
        res.save(os.path.join(out, name + '.webp'), 'WEBP', quality=94, method=6)
        print('logo', name, res.size)
    emb = Image.open(os.path.join(out, 'logo-emblem.webp'))
    emb.resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'menu', 'favicon.png'))


def slice_effects():
    src = os.path.join(INC, 'efekt', 'muharebe-kareleri.webp')
    im = Image.open(src).convert('RGB')
    w, h = im.size
    cw, ch = w // 4, h // 4
    out = os.path.join(ROOT, 'assets', 'fx')
    for row0, name in [(0, 'muzzle'), (2, 'smoke')]:
        strip = Image.new('RGB', (cw * 8, ch), (0, 0, 0))
        for k in range(8):
            r, c = row0 + k // 4, k % 4
            strip.paste(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), (k * cw, 0))
        strip = strip.resize((128 * 8, 128), Image.LANCZOS)
        strip.save(os.path.join(out, name + '-strip.webp'), 'WEBP', quality=90, method=6)
        print('efekt', name, strip.size)


def finish_crests(out_dir):
    """Arma dilimleri: magenta sızıntısı, köşe süsünün aynaları, ekran boyuna küçültme.

    Pirinçte mavi yeşilin altındadır; mavisi yeşilini geçen piksel magenta sızıntısıdır
    (buğday başağının ucu morumsu kalıyordu). Ekranda en çok ~120 px gösterilir: 720'lik
    dilim 400'e iner. Köşe süsü tek resimdir, öteki üç köşe aynadır.
    """
    import numpy as np
    for name in sorted(os.listdir(out_dir)):
        if not name.endswith('.webp') or name.startswith('corner-'):
            continue
        path = os.path.join(out_dir, name)
        a = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        m = b > g * 0.92
        b[m] = g[m] * 0.7
        r[m] = np.minimum(r[m], g[m] * 1.25)
        im = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        im.thumbnail((400, 400), Image.LANCZOS)
        im.save(path, 'WEBP', quality=92, method=6)
    corner = os.path.join(out_dir, 'corner.webp')
    if os.path.exists(corner):
        im = Image.open(corner).convert('RGBA')
        for suffix, op in (('tr', Image.FLIP_LEFT_RIGHT), ('bl', Image.FLIP_TOP_BOTTOM), ('br', Image.ROTATE_180)):
            im.transpose(op).save(os.path.join(out_dir, f'corner-{suffix}.webp'), 'WEBP', quality=92, method=6)


if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    for src, out, grid, size, names in SHEETS:
        if only and not any(o in src for o in only):
            continue
        if not os.path.exists(os.path.join(INC, src)):
            print('yok, atlandı:', src)
            continue
        slice_magenta(os.path.join(INC, src), os.path.join(ROOT, out), grid, size, names)
        if out.endswith('arrows'):
            finish_arrows(os.path.join(ROOT, out))
        if '/crest' in out:
            finish_crests(os.path.join(ROOT, out))
    for src, out, mode, names in NATIVE:
        if only and not any(o in src for o in only):
            continue
        if not os.path.exists(os.path.join(INC, src)):
            print('yok, atlandı:', src)
            continue
        print(src)
        if mode == 'native':
            slice_native(os.path.join(INC, src), os.path.join(ROOT, out), names)
        else:
            slice_engrave(os.path.join(INC, src), os.path.join(ROOT, out), names)
    if not only:
        slice_logo()
        slice_effects()
