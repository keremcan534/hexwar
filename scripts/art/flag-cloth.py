# Bayrak bezi: HAREKET bir kez Blender'da pişirilir, bayrak çalışma anında giydirilir.
#
#   "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b -P scripts/art/flag-cloth.py
#   ... -- --preview            küçük önizleme, assets/ ve kaynak koda dokunmaz
#   ... -- --resim              simülasyon önbelleğini yok say
#   ... -- wind=500 bending=2   SIM ayarını tek koşuluk değiştir
#
# Neden video değil: bayraklar ulus başına prosedürel üretilir (world/flags.js),
# ulus başına kare seti pişirilemez. Atlas bezin GÖRÜNTÜSÜNÜ değil, her pikselin
# bayrağın neresine baktığını taşır; bayrağı tarayıcı o adresle okur.
#
# Çıktı: assets/flag/cloth-atlas.png (R,G = UV kayması, B = ışık, A = örtü) ve
# src/render/flagWave.js içindeki <cloth-atlas> sabit bloğu.

import hashlib
import math
import os
import re
import struct
import sys
import tempfile
import time
import zlib

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_PNG = os.path.join(ROOT, 'assets', 'flag', 'cloth-atlas.png')
RUNTIME_JS = os.path.join(ROOT, 'src', 'render', 'flagWave.js')
CACHE = os.path.join(tempfile.gettempdir(), 'hexwar-flag-cloth')

SIM = {
    'cols': 78, 'rows': 52,
    'settle': 170, 'capture': 380,
    'seed': 11,
    'quality': 12,
    'mass': 0.012,
    # Basınç direnci düşük: bez gevşek kalmazsa rüzgâr onu kıvrımsız bir levhaya germekte.
    'tension': 16.0, 'compression': 4.0, 'shear': 6.0, 'bending': 0.4,
    'air': 1.0, 'gravity': 0.45,
    'wind': 300.0, 'gust': 0.24, 'yaw': 6.0,
    'turb': 560.0, 'turb_size': 0.85, 'turb_flow': 0.0, 'turb_speed': 3.2,
    'swing': 14.0,
}
ATLAS = {
    'frames': 48, 'step': 2, 'fade': 8,
    'cell_w': 256, 'columns': 8, 'gutter': 2,
    'samples': 96, 'smooth': 10,
}
CLOTH_W = 3.0
CLOTH_H = 2.0
SIM_FPS = 24


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    flags = {a for a in argv if a.startswith('--')}
    for arg in argv:
        if '=' not in arg:
            continue
        key, value = arg.split('=', 1)
        if key not in SIM:
            raise SystemExit(f'bilinmeyen SIM ayarı: {key}')
        SIM[key] = type(SIM[key])(float(value))
    return flags


def log(*parts):
    print('[flag-cloth]', *parts, flush=True)


# --- Simülasyon --------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='cycles')
    return bpy.context.scene


def grid_arrays():
    cols, rows = SIM['cols'], SIM['rows']
    us, vs = np.meshgrid(np.linspace(0, 1, cols + 1), np.linspace(0, 1, rows + 1))
    faces = []
    for j in range(rows):
        for i in range(cols):
            a = j * (cols + 1) + i
            faces.append((a, a + cols + 1, a + cols + 2, a + 1))
    return us.ravel(), vs.ravel(), faces


def build_cloth(scene):
    us, vs, faces = grid_arrays()
    # Kusursuz düz levha rüzgârı simetrik yarar ve kıvrım geç doğar.
    ys = 0.012 * np.sin(us * 9.0 + vs * 4.0)
    verts = np.column_stack((us * CLOTH_W, ys, (0.5 - vs) * CLOTH_H))
    mesh = bpy.data.meshes.new('bez')
    mesh.from_pydata(verts.tolist(), [], faces)
    mesh.update()
    ob = bpy.data.objects.new('bez', mesh)
    scene.collection.objects.link(ob)
    hoist = ob.vertex_groups.new(name='gonder')
    hoist.add([j * (SIM['cols'] + 1) for j in range(SIM['rows'] + 1)], 1.0, 'REPLACE')
    return ob


def add_forces(scene, frames):
    rng = np.random.default_rng(SIM['seed'])
    bpy.ops.object.effector_add(type='WIND', location=(-1.0, 0.0, 0.0))
    wind = bpy.context.object
    wind.rotation_euler = (0.0, math.pi / 2, math.radians(SIM['yaw']))
    wind.field.strength = SIM['wind']
    wind.field.flow = 1.0

    bpy.ops.object.effector_add(type='TURBULENCE', location=(1.5, 0.0, 0.0))
    turb = bpy.context.object
    turb.field.strength = SIM['turb']
    turb.field.size = SIM['turb_size']
    turb.field.flow = SIM['turb_flow']
    turb.field.seed = SIM['seed']

    # Alan değerini döngüde elle yazmak bez önbelleğini geçersiz kılar; anahtar
    # kareler değerlendirmede okunduğu için simülasyon kesilmez.
    # Girdap uzayda sabittir: alanı rüzgârla taşımazsak bez hep aynı yerden itilir.
    phases = rng.uniform(0, math.tau, 3)
    for f in range(1, frames + 1, 6):
        t = f / SIM_FPS
        gust = (math.sin(t * 0.83 + phases[0]) + 0.6 * math.sin(t * 1.91 + phases[1])
                + 0.3 * math.sin(t * 3.7 + phases[2])) / 1.9
        wind.field.strength = SIM['wind'] * (1.0 + SIM['gust'] * gust)
        wind.field.keyframe_insert('strength', frame=f)
        # Yön salınımı bezi iki yana şişirir; sabit yönlü rüzgâr onu gergin bir levhaya çevirir.
        swing = math.sin(t * 1.27 + phases[1]) + 0.5 * math.sin(t * 2.9 + phases[2])
        wind.rotation_euler = (0.0, math.pi / 2, math.radians(SIM['yaw'] + SIM['swing'] * swing / 1.5))
        wind.keyframe_insert('rotation_euler', frame=f)
        # Girdap rüzgâr yönünde akar: kıvrım gönderden uca doğru yürüsün.
        turb.location = (1.5 + t * SIM['turb_speed'], 0.35 * math.sin(t * 0.7), t * 0.55)
        turb.keyframe_insert('location', frame=f)


def sim_key():
    return hashlib.sha1(repr(sorted(SIM.items())).encode()).hexdigest()[:12]


def simulate():
    path = os.path.join(CACHE, f'sim-{sim_key()}.npy')
    if os.path.exists(path) and '--resim' not in FLAGS:
        log('simülasyon önbellekten:', path)
        return np.load(path)

    scene = reset_scene()
    total = SIM['settle'] + SIM['capture']
    scene.frame_start, scene.frame_end = 1, total
    scene.render.fps = SIM_FPS
    ob = build_cloth(scene)
    mod = ob.modifiers.new('bez', 'CLOTH')
    cs = mod.settings
    cs.vertex_group_mass = 'gonder'
    cs.pin_stiffness = 1.0
    cs.quality = SIM['quality']
    cs.mass = SIM['mass']
    cs.tension_stiffness = SIM['tension']
    cs.compression_stiffness = SIM['compression']
    cs.shear_stiffness = SIM['shear']
    cs.bending_stiffness = SIM['bending']
    cs.air_damping = SIM['air']
    # Tam yerçekiminde bez paralelkenar gibi sarkıyor ve çerçevenin dörtte biri boş kalıyor.
    cs.effector_weights.gravity = SIM['gravity']
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = total
    add_forces(scene, total)

    count = len(ob.data.vertices)
    buf = np.empty(count * 3, np.float32)
    out = np.empty((SIM['capture'], count, 3), np.float32)
    start = time.time()
    for f in range(1, total + 1):
        scene.frame_set(f)
        if f % 50 == 0:
            log(f'kare {f}/{total}  {time.time() - start:.0f} sn')
        if f <= SIM['settle']:
            continue
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        ev.data.vertices.foreach_get('co', buf)
        out[f - SIM['settle'] - 1] = buf.reshape(-1, 3)
    if not np.isfinite(out).all():
        raise SystemExit('simülasyon patladı: NaN')
    os.makedirs(CACHE, exist_ok=True)
    np.save(path, out)
    return out


# --- Döngü -------------------------------------------------------------------


def rms(a):
    return float(np.sqrt(np.mean(np.sum(a * a, axis=-1))))


def smooth_grid(loop, rounds):
    """Girdabın bıraktığı ince buruşukluğu siler, büyük kıvrımlara dokunmaz.

    Küçük ölçekli çukurlar ışık geçişinde benek olarak görünüyor, bez buruşuk
    kâğıt gibi okunuyordu. Gönder sütunu sabit kalır.
    """
    rows, cols = SIM['rows'] + 1, SIM['cols'] + 1
    grid = loop.reshape(loop.shape[0], rows, cols, 3).copy()
    for _ in range(rounds):
        padded = np.pad(grid, ((0, 0), (1, 1), (1, 1), (0, 0)), mode='edge')
        blur = (padded[:, :-2, 1:-1] + padded[:, 2:, 1:-1]
                + padded[:, 1:-1, :-2] + padded[:, 1:-1, 2:]) / 4
        blur[:, :, 0] = grid[:, :, 0]
        grid = grid * 0.4 + blur * 0.6
    return grid.reshape(loop.shape)


def make_loop(raw, frames, step, fade):
    """Dikişi önce en az yerde arar, kalanı köşe uzayında eritir.

    Rastgele bir pencerede harmanlama iki ilgisiz kıvrım desenini ortalar ve
    bez dikişte düzleşir; benzer iki an seçilince harman neredeyse görünmez.
    """
    span = frames * step
    last = raw.shape[0] - span - fade * step - 1
    if last < 1:
        raise SystemExit('yakalama penceresi döngüden kısa')
    probe = raw[:, ::5]
    best, best_cost = 0, float('inf')
    for a in range(last):
        pose = probe[a + span] - probe[a]
        vel = (probe[a + span + 1] - probe[a + span]) - (probe[a + 1] - probe[a])
        cost = rms(pose) + 6.0 * rms(vel)
        if cost < best_cost:
            best, best_cost = a, cost
    loop = raw[best + np.arange(frames) * step].copy()
    tail = raw[best + span + np.arange(fade) * step]
    for i in range(fade):
        t = (i + 1) / (fade + 1)
        s = t * t * (3 - 2 * t)
        loop[i] = tail[i] * (1 - s) + loop[i] * s
    steps = [rms(loop[(i + 1) % frames] - loop[i]) for i in range(frames)]
    typical = float(np.median(steps[:-1]))
    log(f'döngü: başlangıç {best}, dikiş adımı {steps[-1]:.4f} / tipik {typical:.4f}'
        f' (oran {steps[-1] / typical:.2f}, en büyük adım {max(steps):.4f})')
    return loop


# --- Geçişler ----------------------------------------------------------------


def frame_bounds(loop, cell_w):
    """Hareketin tamamını saran çerçeve; gönder kenarı çerçevenin sol kenarıdır."""
    x_max = float(loop[..., 0].max())
    z_min, z_max = float(loop[..., 2].min()), float(loop[..., 2].max())
    pad = CLOTH_W * 4.0 / cell_w
    fw = x_max + pad
    fh = (z_max - z_min) + 2 * pad
    cell_h = int(round(cell_w * fh / fw / 2)) * 2
    # Hücre tam sayıya yuvarlanınca piksel kare kalsın diye çerçeve genişler.
    fh_fit = fw * cell_h / cell_w
    z_mid = (z_max + z_min) / 2
    return {'x0': 0.0, 'fw': fw, 'z_top': z_mid + fh_fit / 2, 'fh': fh_fit, 'w': cell_w, 'h': cell_h}


def material_uv():
    mat = bpy.data.materials.new('uv')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'flagUV'
    emit = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(attr.outputs['Vector'], emit.inputs['Color'])
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    return mat


def material_cloth():
    mat = bpy.data.materials.new('kumas')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    # Bez ince: arkadan gelen ışığın bir kısmı geçer, gölgeler kömür gibi olmaz.
    through = nt.nodes.new('ShaderNodeBsdfTranslucent')
    through.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs[0].default_value = 0.16
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(diffuse.outputs[0], mix.inputs[1])
    nt.links.new(through.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return mat


def build_render_scene(loop, box):
    scene = reset_scene()
    us, vs, faces = grid_arrays()
    mesh = bpy.data.meshes.new('kare')
    mesh.from_pydata(loop[0].tolist(), [], faces)
    mesh.update()
    mesh.shade_smooth()
    # v yukarıdan aşağı: tuvalin satır sırası, çalışma anında çevirme gerekmesin.
    attr = mesh.attributes.new('flagUV', 'FLOAT2', 'POINT')
    attr.data.foreach_set('vector', np.column_stack((us, vs)).ravel().astype(np.float32))
    ob = bpy.data.objects.new('kare', mesh)
    scene.collection.objects.link(ob)
    mesh.materials.append(material_uv())

    cam_data = bpy.data.cameras.new('kamera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(box['fw'], box['fh'])
    cam = bpy.data.objects.new('kamera', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (box['x0'] + box['fw'] / 2, -12.0, box['z_top'] - box['fh'] / 2)
    cam.rotation_euler = (math.pi / 2, 0.0, 0.0)
    scene.camera = cam

    sun_data = bpy.data.lights.new('gunes', 'SUN')
    sun_data.energy = 3.4
    sun_data.angle = math.radians(26.0)
    sun = bpy.data.objects.new('gunes', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_mode = 'QUATERNION'
    # Işık yandan ve sıyırarak gelir: kıvrımlar bez boyunca dizildiği için
    # eğimi en çok yatay bileşen okutur.
    sun.rotation_quaternion = (-Vector((0.80, 0.46, -0.38))).to_track_quat('Z', 'Y')

    world = bpy.data.worlds.new('ortam')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.34, 0.34, 0.34, 1)
    scene.world = world

    r = scene.render
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y = box['w'], box['h']
    r.resolution_percentage = 100
    r.film_transparent = True
    r.use_persistent_data = True
    r.image_settings.file_format = 'OPEN_EXR'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '32'
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.cycles.device = 'CPU'
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.seed = 1
    return scene, ob


def read_exr(path, w, h):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return np.flipud(buf.reshape(h, w, 4))


def render_passes(loop, box, samples):
    scene, ob = build_render_scene(loop, box)
    mesh = ob.data
    uv_mat = mesh.materials[0]
    cloth_mat = material_cloth()
    w, h = box['w'], box['h']
    n = loop.shape[0]
    uvs = np.zeros((n, h, w, 2), np.float32)
    mask = np.zeros((n, h, w), bool)
    shade = np.zeros((n, h, w), np.float32)
    cover = np.zeros((n, h, w), np.float32)
    tmp = os.path.join(CACHE, f'gecis-{os.getpid()}.exr')
    start = time.time()
    for i in range(n):
        mesh.vertices.foreach_set('co', loop[i].ravel())
        mesh.update()

        # UV harmanlanamaz: iki kıvrımın adresinin ortalaması bayrakta üçüncü bir
        # yerdir. Bu yüzden süzgeç sıfıra yakın, kenar yumuşaklığı örtü geçişinden.
        mesh.materials[0] = uv_mat
        scene.cycles.samples = 1
        scene.cycles.pixel_filter_type = 'BOX'
        scene.cycles.filter_width = 0.01
        scene.cycles.max_bounces = 0
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        px = read_exr(tmp, w, h)
        uvs[i] = px[..., :2]
        mask[i] = px[..., 3] > 0.5

        mesh.materials[0] = cloth_mat
        scene.cycles.samples = samples
        scene.cycles.pixel_filter_type = 'BLACKMAN_HARRIS'
        scene.cycles.filter_width = 1.5
        scene.cycles.max_bounces = 3
        scene.cycles.diffuse_bounces = 2
        scene.cycles.transmission_bounces = 2
        bpy.ops.render.render(write_still=True)
        px = read_exr(tmp, w, h)
        alpha = px[..., 3]
        shade[i] = px[..., 0] / np.maximum(alpha, 1e-4)
        cover[i] = alpha
        if (i + 1) % 6 == 0:
            log(f'geçiş {i + 1}/{n}  {time.time() - start:.0f} sn')
    # Gönder çerçevenin sol kenarında: süzgeç oradan boşluğu da örnekler ve
    # sapın dibinde yarı saydam bir şerit bırakırdı.
    cover[:, :, :2] = cover[:, :, 2:3]
    return uvs, mask, shade, cover


# --- Paketleme ---------------------------------------------------------------


def neighbours(a):
    return (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)
            + np.roll(np.roll(a, 1, 0), 1, 1) + np.roll(np.roll(a, 1, 0), -1, 1)
            + np.roll(np.roll(a, -1, 0), 1, 1) + np.roll(np.roll(a, -1, 0), -1, 1))


def dilate(values, valid, rounds):
    """Değeri siluetin dışına yayar: çift doğrusal okuma kenarda boşluğu karıştırmasın."""
    values = values.copy()
    valid = valid.copy()
    if values.ndim == 2:
        values = values[..., None]
    for _ in range(rounds):
        weight = neighbours(valid.astype(np.float32))
        grow = (~valid) & (weight > 0)
        if not grow.any():
            break
        for c in range(values.shape[-1]):
            total = neighbours(values[..., c] * valid)
            values[..., c][grow] = total[grow] / weight[grow]
        valid |= grow
    return values, valid


def soften(a):
    return (a * 4 + (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) * 2
            + np.roll(np.roll(a, 1, 0), 1, 1) + np.roll(np.roll(a, 1, 0), -1, 1)
            + np.roll(np.roll(a, -1, 0), 1, 1) + np.roll(np.roll(a, -1, 0), -1, 1)) / 16


def encode_frames(uvs, mask, shade, cover, box):
    """Kareleri 8 bite indirir. UV mutlak değil, durağan bezden KAYMA olarak saklanır.

    Kayma bayrak genişliğinin küçük bir kesridir: aynı 256 basamak daha dar bir
    aralığa düşer, büyük sancakta basamaklanma görünmez ve PNG de küçülür.
    """
    n, h, w = uvs.shape[:3]
    xs = ((np.arange(w) + 0.5) / w * box['fw'] + box['x0']) / CLOTH_W
    ys = ((box['z_top'] - (np.arange(h) + 0.5) / h * box['fh']) * -1 / CLOTH_H) + 0.5
    rest = np.stack(np.meshgrid(xs, ys), axis=-1).astype(np.float32)

    delta = uvs - rest
    lo = np.percentile(delta[mask], 0.02, axis=0) - 0.004
    hi = np.percentile(delta[mask], 99.98, axis=0) + 0.004

    lit = shade[cover > 0.9]
    mid = float(np.median(lit))
    out = np.zeros((n, h, w, 4), np.uint8)
    for i in range(n):
        filled, reach = dilate(delta[i], mask[i], 7)
        tone, _ = dilate(shade[i], cover[i] > 0.5, 7)
        tone = soften(tone[..., 0])
        # Bayrak rengi sRGB: ışık çarpanı da algısal uzayda olmalı, yoksa kıvrımın
        # gölgesi bayrağı karartır.
        factor = np.maximum(tone / mid, 0) ** (1 / 2.2)
        keep = reach | (cover[i] > 0.002)
        out[i, ..., 0] = np.round(np.clip((filled[..., 0] - lo[0]) / (hi[0] - lo[0]), 0, 1) * 255)
        out[i, ..., 1] = np.round(np.clip((filled[..., 1] - lo[1]) / (hi[1] - lo[1]), 0, 1) * 255)
        out[i, ..., 2] = np.round(np.clip(factor * 0.5, 0, 1) * 255)
        out[i, ..., 3] = np.round(np.clip(cover[i], 0, 1) * 255)
        out[i][~keep] = 0
    log(f'kayma aralığı u {lo[0]:.3f}…{hi[0]:.3f}  v {lo[1]:.3f}…{hi[1]:.3f}  '
        f'(bir basamak bayrağın {1000 * (hi[0] - lo[0]) / 255:.2f}‰ kadarı)')
    return out, lo, hi


def write_png(path, rgba):
    """Renk yönetimi parçası olmayan PNG: tarayıcı veriyi "renk" sanıp dönüştürmesin."""
    h, w = rgba.shape[:2]
    bpp = 4
    raw = bytearray()
    prev = np.zeros(w * bpp, np.int16)
    for y in range(h):
        row = rgba[y].reshape(-1).astype(np.int16)
        left = np.concatenate((np.zeros(bpp, np.int16), row[:-bpp]))
        up_left = np.concatenate((np.zeros(bpp, np.int16), prev[:-bpp]))
        p = left + prev - up_left
        pa, pb, pc = np.abs(p - left), np.abs(p - prev), np.abs(p - up_left)
        paeth = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, prev, up_left))
        options = [row, row - left, row - prev, row - ((left + prev) >> 1), row - paeth]
        wrapped = [(o & 255).astype(np.uint8) for o in options]
        score = [np.minimum(o, 256 - o.astype(np.int16)).sum() for o in wrapped]
        pick = int(np.argmin(score))
        raw.append(pick)
        raw.extend(wrapped[pick].tobytes())
        prev = row

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    packed = zlib.compress(bytes(raw), 9)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n')
        fh.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        fh.write(chunk(b'IDAT', packed))
        fh.write(chunk(b'IEND', b''))


def pack_atlas(frames, columns, gutter):
    n, h, w = frames.shape[:3]
    rows = math.ceil(n / columns)
    sheet = np.zeros((rows * (h + gutter), columns * (w + gutter), 4), np.uint8)
    for i in range(n):
        y, x = divmod(i, columns)
        sheet[y * (h + gutter):y * (h + gutter) + h, x * (w + gutter):x * (w + gutter) + w] = frames[i]
    return sheet, rows


def patch_runtime(meta):
    """Sabitler kaynak koda yazılır: sancağın tuval payı atlas yüklenmeden bilinmeli."""
    body = (
        '// <cloth-atlas> scripts/art/flag-cloth.py yazar; elle değiştirme.\n'
        'const CLOTH = {\n'
        f"  frames: {meta['frames']}, columns: {meta['columns']}, rows: {meta['rows']},\n"
        f"  cellW: {meta['cellW']}, cellH: {meta['cellH']}, gutter: {meta['gutter']},\n"
        f"  width: {meta['width']}, height: {meta['height']},\n"
        f"  loopSeconds: {meta['loopSeconds']}, still: {meta['still']},\n"
        f"  // Çerçevenin durağan bez koordinatındaki yeri (u, v birimi).\n"
        f"  x0: {meta['x0']:.5f}, y0: {meta['y0']:.5f}, spanU: {meta['spanU']:.5f}, spanV: {meta['spanV']:.5f},\n"
        f"  // R, G kanallarının çözüm aralığı.\n"
        f"  duMin: {meta['duMin']:.5f}, duMax: {meta['duMax']:.5f}, dvMin: {meta['dvMin']:.5f}, dvMax: {meta['dvMax']:.5f},\n"
        '};\n'
        '// </cloth-atlas>'
    )
    with open(RUNTIME_JS, encoding='utf-8', newline='') as fh:
        source = fh.read()
    pattern = re.compile(r'// <cloth-atlas>.*?// </cloth-atlas>', re.S)
    if not pattern.search(source):
        log('UYARI: flagWave.js içinde <cloth-atlas> bloğu yok, sabitler yazılmadı:')
        print(body, flush=True)
        return
    with open(RUNTIME_JS, 'w', encoding='utf-8', newline='') as fh:
        fh.write(pattern.sub(lambda _: body, source, count=1))
    log('flagWave.js sabitleri güncellendi')


def contact_sheet(frames, lo, hi, box, path, picks):
    """Gerçek çözüm yolunun kanıtı: atlas verisinden bir deneme bayrağı giydirir."""
    h, w = frames.shape[1:3]
    src_h, src_w = 240, 360
    src = np.zeros((src_h, src_w, 3), np.float32)
    src[:, :120] = (0.08, 0.22, 0.55)
    src[:, 120:240] = (0.93, 0.91, 0.84)
    src[:, 240:] = (0.74, 0.12, 0.14)
    src[100:140, :] = (0.86, 0.68, 0.22)
    xs = ((np.arange(w) + 0.5) / w * box['fw'] + box['x0']) / CLOTH_W
    ys = ((box['z_top'] - (np.arange(h) + 0.5) / h * box['fh']) * -1 / CLOTH_H) + 0.5
    rest_u, rest_v = np.meshgrid(xs, ys)
    tiles = []
    for i in picks:
        f = frames[i].astype(np.float32) / 255
        u = rest_u + lo[0] + f[..., 0] * (hi[0] - lo[0])
        v = rest_v + lo[1] + f[..., 1] * (hi[1] - lo[1])
        px = np.clip((u * src_w).astype(int), 0, src_w - 1)
        py = np.clip((v * src_h).astype(int), 0, src_h - 1)
        rgb = src[py, px] * (f[..., 2] * 2)[..., None]
        a = f[..., 3][..., None]
        tiles.append(np.clip(rgb * a + np.array((0.1, 0.12, 0.14)) * (1 - a), 0, 1))
    cols = min(4, len(tiles))
    rows = math.ceil(len(tiles) / cols)
    sheet = np.zeros((rows * h, cols * w, 4), np.uint8)
    sheet[..., 3] = 255
    for k, tile in enumerate(tiles):
        y, x = divmod(k, cols)
        sheet[y * h:(y + 1) * h, x * w:(x + 1) * w, :3] = np.round(tile * 255)
    write_png(path, sheet)


def main():
    global FLAGS
    FLAGS = parse_args()
    os.makedirs(CACHE, exist_ok=True)
    preview = '--preview' in FLAGS
    raw = simulate()
    log(f'uç kenar ort. x {raw[:, -1, 0].mean():.2f}, derinlik rms {raw[..., 1].std():.3f}, '
        f'z {raw[..., 2].min():.2f}…{raw[..., 2].max():.2f}')
    frames, step = ATLAS['frames'], ATLAS['step']
    loop = smooth_grid(make_loop(raw, frames, step, ATLAS['fade']), ATLAS['smooth'])

    cell_w = 128 if preview else ATLAS['cell_w']
    samples = 24 if preview else ATLAS['samples']
    render_set = loop[::4] if preview else loop
    box = frame_bounds(loop, cell_w)
    log(f"çerçeve {box['w']}x{box['h']}  {box['fw']:.3f} x {box['fh']:.3f} birim")
    uvs, mask, shade, cover = render_passes(render_set, box, samples)
    encoded, lo, hi = encode_frames(uvs, mask, shade, cover, box)

    picks = list(range(0, len(encoded), max(1, len(encoded) // 12)))[:12]
    sheet_path = os.path.join(CACHE, f'preview-{sim_key()}.png')
    contact_sheet(encoded, lo, hi, box, sheet_path, picks)
    log('önizleme:', sheet_path)
    if preview:
        return

    sheet, rows = pack_atlas(encoded, ATLAS['columns'], ATLAS['gutter'])
    write_png(OUT_PNG, sheet)
    size = os.path.getsize(OUT_PNG)
    log(f'atlas {sheet.shape[1]}x{sheet.shape[0]}, {size / 1048576:.2f} MB')
    # Durağan görünüm için kıvrımı en belirgin kare.
    contrast = [float(encoded[i, ..., 2][encoded[i, ..., 3] > 200].std()) for i in range(frames)]
    patch_runtime({
        'frames': frames, 'columns': ATLAS['columns'], 'rows': rows,
        'cellW': box['w'], 'cellH': box['h'], 'gutter': ATLAS['gutter'],
        'width': int(sheet.shape[1]), 'height': int(sheet.shape[0]),
        'loopSeconds': round(frames * step / SIM_FPS, 3), 'still': int(np.argmax(contrast)),
        'x0': box['x0'] / CLOTH_W, 'y0': 0.5 - box['z_top'] / CLOTH_H,
        'spanU': box['fw'] / CLOTH_W, 'spanV': box['fh'] / CLOTH_H,
        'duMin': float(lo[0]), 'duMax': float(hi[0]), 'dvMin': float(lo[1]), 'dvMax': float(hi[1]),
    })


FLAGS = set()
main()
