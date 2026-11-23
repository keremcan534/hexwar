# Birim minyatürleri: modelleri kurar, 8 yönde kareleri Cycles'la pişirir, WebP atlasa dizer.
#
#   "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b -P scripts/art/unit-minis.py
#   ... -- --preview                 küçük örnek ve kontak baskı; assets/ ve kaynak koda dokunmaz
#   ... -- --only=infantry,armor     yalnız bu türler
#   ... -- --samples=64              güzellik geçişinin örnek sayısı
#   ... -- --fresh                   kare önbelleğini yok say
#   ... -- --pack                    yeniden render etme, önbellekteki kareleri paketle
#
# Neden iki atlas: üniforma ve gövde rengi ulustan gelir, ulus başına kare seti pişirilemez.
# <tür>.webp nötr gri üniformayla ışığı taşır, <tür>-mask.webp ülke renginin nereye işlediğini
# (A kanalı). Tarayıcı ikisini ulus rengiyle birleştirir (src/render/miniatures.js).
#
# Çıktı: assets/minis/*.webp ve src/render/miniAtlas.js.
import hashlib
import importlib
import json
import math
import os
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import minis.kit as kit  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'minis')
OUT_JS = os.path.join(ROOT, 'src', 'render', 'miniAtlas.js')
CACHE = os.path.join(tempfile.gettempdir(), 'hexwar-minis')

# 2026-11-23 (Kerem: "hâlâ düşük kaliteli png gibi"): 160 px hücrede piyade ~50 px boyundaydı,
# tek örnekli filtre + gürültü giderici onu yumuşatıyordu, yarım çözünürlüklü maske de ulus
# rengini yüze ve tüfeğe taşırıyordu. Şimdi hücre 192, kare iki kat büyük pişip doğrusal
# ışıkta küçültülür (kenar keskin, tırtıksız) ve maske tam çözünürlüktedir.
CELL = 192
SUPERSAMPLE = 2
MASK_SCALE = 1
# Bu ölçüden önce pişmiş türler (deniz) çalışma anında bu varsayılanla okunur.
LEGACY_CELL = 160
LEGACY_MASK_SCALE = 2
# Gölge yakalayıcının güneş gölgesi neredeyse siyahtı (%85+): figürün yanında yapıştırılmış
# koyu bir leke gibi duruyordu. Arka ışık zemini de aydınlattığı için gölge artık ~%60'ta;
# paketlerken örtü bu payla bir kez daha ayarlanır (yeniden render gerekmez, --pack yeter).
# Temas gölgesi (ayak, palet) en koyu yer olarak kalır.
SHADOW_KEEP = 0.9
SHARPEN = 0.45
ELEVATION = math.radians(35)
ANIMS = (('idle', 6), ('walk', 8), ('fire', 6))
DIRECTIONS = 8
WEBP_QUALITY = 90
MASK_QUALITY = 86


def log(*parts):
    print('[minis]', *parts, flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {'preview': False, 'fresh': False, 'pack': False, 'only': None, 'samples': 64}
    for arg in argv:
        if arg == '--preview':
            opts['preview'] = True
        elif arg == '--fresh':
            opts['fresh'] = True
        elif arg == '--pack':
            opts['pack'] = True
        elif arg.startswith('--only='):
            opts['only'] = arg.split('=', 1)[1].split(',')
        elif arg.startswith('--samples='):
            opts['samples'] = int(arg.split('=', 1)[1])
        else:
            raise SystemExit(f'bilinmeyen seçenek: {arg}')
    return opts


# --- Sahne --------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='cycles')
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == 'OPTIX'
    return bpy.context.scene


def stage(spec, samples):
    """Ortografik kamera, tek güneş, gökyüzü dolgusu ve gölge alıcı zemin."""
    scene = bpy.context.scene
    span = spec['span']
    cam_data = bpy.data.cameras.new('kamera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = span
    cam = bpy.data.objects.new('kamera', cam_data)
    scene.collection.objects.link(cam)
    target = Vector((0, 0, spec['focus']))
    back = Vector((0, -math.cos(ELEVATION), math.sin(ELEVATION)))
    cam.location = target + back * 40
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (-back).to_track_quat('-Z', 'Y')
    cam_data.clip_end = 200
    scene.camera = cam

    sun_data = bpy.data.lights.new('gunes', 'SUN')
    sun_data.energy = 3.9
    sun_data.angle = math.radians(18)
    sun_data.color = (1.0, 0.95, 0.86)
    sun = bpy.data.objects.new('gunes', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = Vector((-0.40, -0.30, 0.92)).to_track_quat('Z', 'Y')

    # Arka kenar ışığı (gölgesiz, serin): omuz, miğfer ve namlunun üst kenarı parlar, siluet
    # haritadan ışıkla ayrılır. Eskiden bu işi tarayıcıdaki koyu kontur yapıyordu ve figür
    # kesilip yapıştırılmış bir çıkartma gibi okunuyordu.
    rim_data = bpy.data.lights.new('kenar', 'SUN')
    rim_data.energy = 2.6
    rim_data.angle = math.radians(8)
    rim_data.color = (0.80, 0.88, 1.0)
    if hasattr(rim_data, 'use_shadow'):
        rim_data.use_shadow = False
    if hasattr(rim_data, 'cycles') and hasattr(rim_data.cycles, 'cast_shadow'):
        rim_data.cycles.cast_shadow = False
    rim = bpy.data.objects.new('kenar', rim_data)
    scene.collection.objects.link(rim)
    rim.rotation_mode = 'QUATERNION'
    rim.rotation_quaternion = Vector((0.45, 0.85, 0.42)).to_track_quat('Z', 'Y')

    world = bpy.data.worlds.new('gok')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.70, 0.82, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.62
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=span * 6, location=(0, 0, spec.get('ground', 0.0)))
    ground = bpy.context.object
    ground.name = 'zemin'
    ground.is_shadow_catcher = True

    r = scene.render
    r.engine = 'CYCLES'
    r.resolution_x = r.resolution_y = CELL * SUPERSAMPLE
    r.resolution_percentage = 100
    r.film_transparent = True
    r.use_persistent_data = True
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    c = scene.cycles
    c.device = 'GPU'
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.max_bounces = 4
    c.diffuse_bounces = 2
    c.glossy_bounces = 2
    c.transparent_max_bounces = 12
    c.seed = 7
    c.pixel_filter_type = 'BLACKMAN_HARRIS'
    # İki kat çözünürlükte 1.5 px: son hücrede 0.75 px'lik süzgeç, kenar keskin kalır.
    c.filter_width = 1.5
    return ground


def beauty_settings(scene, ground, samples):
    kit.set_pass(False)
    ground.hide_render = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0.35
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True


def mask_settings(scene, ground):
    kit.set_pass(True)
    ground.hide_render = True
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False


def read_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return np.flipud(buf.reshape(h, w, 4))


def write_image(path, rgba, fmt, quality=90):
    """Blender'ın kendi yazıcısı: pakette dış araç gerekmesin."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new('cikti', w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = fmt
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(filepath=path, quality=quality) if fmt == 'WEBP' else img.save(filepath=path)
    bpy.data.images.remove(img)


# --- Kareler ------------------------------------------------------------------


def source_hash(key):
    """Kare önbelleği modelin kaynağına bağlıdır: kod değişince kareler tazelenir."""
    digest = hashlib.sha1()
    names = ['kit.py', 'effects.py', *TYPES[key]['files']]
    for name in names:
        with open(os.path.join(HERE, 'minis', name), 'rb') as fh:
            digest.update(fh.read())
    with open(os.path.abspath(__file__), 'rb') as fh:
        text = fh.read()
    digest.update(text[text.index(b'# --- Sahne'):text.index(b'# --- Kareler')])
    return digest.hexdigest()[:10]


def frame_path(key, tag, direction, anim, index, kind):
    return os.path.join(CACHE, key, tag, f'{direction}-{anim}{index}-{kind}.png')


def write_muzzles(key, tag, spec):
    """Alevin yandığı karede namlu ağızlarının hücre konumu (u, v); oyun parıltıyı buraya koyar."""
    cam = bpy.context.scene.camera
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    target = Vector((0, 0, spec['focus']))
    table = []
    root = spec['root']
    for direction in range(DIRECTIONS):
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (0, 0, -direction * math.pi / 4)
        spec['pose']('fire', 1 / 6)
        bpy.context.view_layer.update()
        row = []
        for anchor in spec['muzzles']:
            offset = anchor.matrix_world.translation - target
            # Namlunun ekrandaki yönü ve izdüşüm boyu: parıltı bu eksende uzar.
            axis = (anchor.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
            sx, sy = axis.dot(right), -axis.dot(up)
            row.append([round(0.5 + offset.dot(right) / spec['span'], 4),
                        round(0.5 - offset.dot(up) / spec['span'], 4),
                        round(math.atan2(sy, sx), 4), round(math.hypot(sx, sy), 3)])
        table.append(row)
    folder = os.path.join(CACHE, key, tag)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, 'namlu.json'), 'w', encoding='utf-8') as fh:
        json.dump(table, fh)


def render_type(key, opts):
    scene = reset_scene()
    module = importlib.import_module(TYPES[key]['module'])
    spec = module.build()
    ground = stage(spec, opts['samples'])
    tag = source_hash(key) + ('p' if opts['preview'] else '')
    root = spec['root']
    directions = [3, 0, 6] if opts['preview'] else list(range(DIRECTIONS))
    total = len(directions) * sum(n for _, n in ANIMS)
    done = 0
    write_muzzles(key, tag, spec)
    start = time.time()
    for direction in directions:
        # Saat yönünde: 0 doğu, 2 güney, 4 batı, 6 kuzey (harita ekranı yönleri).
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (0, 0, -direction * math.pi / 4)
        for anim, count in ANIMS:
            for index in range(count):
                beauty = frame_path(key, tag, direction, anim, index, 'b')
                mask = frame_path(key, tag, direction, anim, index, 'm')
                done += 1
                if not opts['fresh'] and os.path.exists(beauty) and os.path.exists(mask):
                    continue
                spec['pose'](anim, index / count)
                bpy.context.view_layer.update()
                beauty_settings(scene, ground, opts['samples'])
                scene.render.filepath = beauty
                bpy.ops.render.render(write_still=True)
                mask_settings(scene, ground)
                scene.render.filepath = mask
                bpy.ops.render.render(write_still=True)
                if done % 12 == 0:
                    rate = (time.time() - start) / done
                    log(f'{key}: {done}/{total}  {rate:.2f} sn/kare, kalan {(total - done) * rate / 60:.1f} dk')
    return tag, spec, directions


# --- Paket --------------------------------------------------------------------


def edge_fade(size):
    """Duman hücre sınırına değerse sert kesilmesin: en dış 8 piksel erir."""
    ramp = np.clip(np.minimum(np.arange(size) + 0.5, size - np.arange(size) - 0.5) / 8.0, 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    return np.outer(ramp, ramp).astype(np.float32)


def dilate_rgb(cell):
    """Saydam piksele komşu rengi yayar: kayıplı sıkıştırma kenarda koyu saçak bırakmasın."""
    rgb = cell[..., :3].copy()
    valid = cell[..., 3] > 0.01
    for _ in range(4):
        grown = np.zeros_like(valid)
        total = np.zeros_like(rgb)
        weight = np.zeros(valid.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(np.roll(valid, dy, 0), dx, 1)
            total += np.roll(np.roll(rgb * valid[..., None], dy, 0), dx, 1)
            weight += shifted
            grown |= shifted
        ring = grown & ~valid
        rgb[ring] = total[ring] / weight[ring][..., None]
        valid = valid | ring
    return np.dstack((rgb, cell[..., 3]))


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def shrink(values, factor):
    h, w = values.shape[:2]
    return values.reshape(h // factor, factor, w // factor, factor, *values.shape[2:]).mean(axis=(1, 3))


def finish_cell(beauty, mask):
    """İki kat pişmiş kareyi hücreye indirir: gölge inceltilir, renk doğrusal ışıkta önçarpımlı
    ortalanır (kenarda koyu/açık saçak kalmaz), iç kısım hafifçe keskinleşir. (rgba, maske) döner."""
    figure = mask[..., 3]
    alpha = beauty[..., 3]
    # Gölge yalnız figür örtüsünün dışında kalan fazla örtüdür; duman/alev maskede örtülü olduğu
    # için gölge sayılmaz (kit.finish_veil).
    excess = np.clip(alpha - figure, 0, 1)
    alpha2 = np.clip(figure + excess * SHADOW_KEEP, 0, 1)
    pre = to_linear(beauty[..., :3]) * alpha[..., None]
    pre = shrink(np.dstack((pre, alpha2)), SUPERSAMPLE)
    a = pre[..., 3]
    rgb = pre[..., :3] / np.maximum(a, 1e-4)[..., None]
    rgb = to_srgb(np.clip(rgb, 0, 1))
    if SHARPEN:
        # Yalnız tam örtülü iç kısım: kenarda keskinleştirme açık/koyu hale bırakır.
        pad = np.pad(rgb, ((1, 1), (1, 1), (0, 0)), mode='edge')
        blur = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:] + 4 * rgb) / 8
        apad = np.pad(a, 1, mode='edge')
        solid = np.minimum.reduce([apad[:-2, 1:-1], apad[2:, 1:-1], apad[1:-1, :-2], apad[1:-1, 2:], a]) > 0.98
        rgb = np.where(solid[..., None], np.clip(rgb + SHARPEN * (rgb - blur), 0, 1), rgb)
    # Maske değeri örtüyle çarpılır: kenarda yarı örtülü piksel dolu boyanmasın.
    value = shrink(mask[..., 0] * figure, SUPERSAMPLE)
    return np.dstack((rgb, a)).astype(np.float32), value.astype(np.float32)


def pack_type(key, tag):
    frames = sum(n for _, n in ANIMS)
    half = CELL // MASK_SCALE
    sheet = np.zeros((DIRECTIONS * CELL, frames * CELL, 4), np.float32)
    masks = np.zeros((DIRECTIONS * half, frames * half, 4), np.float32)
    masks[..., :3] = 1.0
    for direction in range(DIRECTIONS):
        column = 0
        for anim, count in ANIMS:
            for index in range(count):
                beauty = read_png(frame_path(key, tag, direction, anim, index, 'b'))
                mask = read_png(frame_path(key, tag, direction, anim, index, 'm'))
                cell, value = finish_cell(beauty, mask)
                y, x = direction * CELL, column * CELL
                cell[..., 3] *= FADE
                sheet[y:y + CELL, x:x + CELL] = dilate_rgb(cell)
                if MASK_SCALE > 1:
                    value = shrink(value, MASK_SCALE)
                masks[direction * half:(direction + 1) * half, column * half:(column + 1) * half, 3] = value
                column += 1
    os.makedirs(OUT_DIR, exist_ok=True)
    base_path = os.path.join(OUT_DIR, f'{key}.webp')
    mask_path = os.path.join(OUT_DIR, f'{key}-mask.webp')
    write_image(base_path, sheet, 'WEBP', WEBP_QUALITY)
    write_image(mask_path, masks, 'WEBP', MASK_QUALITY)
    size = os.path.getsize(base_path) + os.path.getsize(mask_path)
    log(f'{key}: atlas {sheet.shape[1]}x{sheet.shape[0]}, {size / 1048576:.2f} MB')
    return size


FADE = edge_fade(CELL)


def write_runtime(meta):
    anims = {name: {'start': sum(n for _, n in ANIMS[:i]), 'count': n} for i, (name, n) in enumerate(ANIMS)}
    # Üst düzeydeki ölçü eski koşuların türleri içindir; yeni türler kendi cell/maskScale'ini taşır.
    body = {'cell': LEGACY_CELL, 'maskScale': LEGACY_MASK_SCALE, 'directions': DIRECTIONS, 'anims': anims, 'types': meta}
    text = ('// scripts/art/unit-minis.py yazar; elle değiştirme.\n'
            f'export const MINI_ATLAS = {json.dumps(body, ensure_ascii=False, indent=2)};\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def preview_sheet(key, tag, spec, directions):
    """Çalışma anı birleşimiyle aynı formül: taban × (1 − m + m × ulus rengi), harita zemininde."""
    tints = [np.array(c) for c in ((0.42, 0.46, 0.30), (0.26, 0.33, 0.52), (0.55, 0.25, 0.21))]
    rows = []
    for row, direction in enumerate(directions):
        cells = []
        for anim, count in ANIMS:
            for index in range(count):
                b, value = finish_cell(read_png(frame_path(key, tag, direction, anim, index, 'b')),
                                       read_png(frame_path(key, tag, direction, anim, index, 'm')))
                value = value[..., None]
                tint = tints[row % len(tints)] * 1.5
                rgb = b[..., :3] * (1 - value + value * tint)
                a = b[..., 3][..., None]
                ground = np.array(spec.get('backdrop', (0.34, 0.36, 0.24)))
                cells.append(rgb * a + ground * (1 - a))
        rows.append(np.hstack(cells))
    picture = np.clip(np.vstack(rows), 0, 1)
    rgba = np.dstack((picture, np.ones(picture.shape[:2])))
    path = os.path.join(CACHE, f'onizleme-{key}.png')
    write_image(path, rgba, 'PNG')
    log('önizleme:', path)


TYPES = {
    'infantry': {'module': 'minis.infantry', 'files': ['soldier.py', 'infantry.py']},
    'cavalry': {'module': 'minis.cavalry', 'files': ['soldier.py', 'cavalry.py']},
    'artillery': {'module': 'minis.artillery', 'files': ['soldier.py', 'artillery.py']},
    'armor': {'module': 'minis.armor', 'files': ['armor.py']},
    'warship': {'module': 'minis.navy', 'files': ['navy.py']},
    'submarine': {'module': 'minis.navy_sub', 'files': ['navy.py', 'navy_sub.py']},
    'transport': {'module': 'minis.navy_transport', 'files': ['navy.py', 'navy_transport.py']},
}


def load_meta():
    """Önceki koşunun türleri korunur: --only ile tek tür yenilenince ötekiler silinmesin."""
    if not os.path.exists(OUT_JS):
        return {}
    with open(OUT_JS, encoding='utf-8') as fh:
        text = fh.read()
    return json.loads(text[text.index('{'):text.rindex('}') + 1]).get('types', {})


def main():
    opts = parse_args()
    keys = opts['only'] or list(TYPES)
    meta = load_meta()
    for key in keys:
        if key not in TYPES:
            raise SystemExit(f'bilinmeyen tür: {key}')
        start = time.time()
        if opts['pack']:
            tag = source_hash(key)
            spec = importlib.import_module(TYPES[key]['module']).META
        else:
            tag, spec, directions = render_type(key, opts)
            log(f'{key}: render {(time.time() - start) / 60:.1f} dk')
            if opts['preview']:
                preview_sheet(key, tag, spec, directions)
                continue
        pack_type(key, tag)
        with open(os.path.join(CACHE, key, tag, 'namlu.json'), encoding='utf-8') as fh:
            muzzles = json.load(fh)
        meta[key] = {
            'cell': CELL,
            'maskScale': MASK_SCALE,
            'worldSize': spec['worldSize'],
            'anchor': [0.5, round(0.5 + spec['focus'] * math.cos(ELEVATION) / spec['span'], 4)],
            # Oyundaki parıltı: yön başına namlu ağızları (u, v, açı, izdüşüm boyu) ve alev boyu.
            'muzzles': muzzles,
            'glow': spec.get('glow', 12.0),
        }
        write_runtime(meta)
    if not opts['preview']:
        total = sum(os.path.getsize(os.path.join(OUT_DIR, n)) for n in os.listdir(OUT_DIR))
        log(f'toplam atlas {total / 1048576:.2f} MB')
        if total > 25 * 1048576:
            raise SystemExit('atlas bütçesi (25 MB) aşıldı')


main()
