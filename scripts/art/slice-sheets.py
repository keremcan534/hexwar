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
    if not only:
        slice_logo()
        slice_effects()
