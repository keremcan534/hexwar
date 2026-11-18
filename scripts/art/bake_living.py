# YAŞAYAN DÜNYA MAKETLERİ — Blender'da pişirilen şehir, liman, fabrika, gemi, tren.
#
# Çalıştırma:
#   "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b -P scripts/art/bake_living.py -- [--only city_3_0,port_1_s] [--out <klasör>]
#
# Bütün geometri burada, kodla kurulur: dışarıdan model ya da doku gelmez. Çıktı
# iki atlas + bir ölçü dosyası:
#   assets/living/living-color.webp  gündüz görüntüsü (düşen gölge alfada)
#   assets/living/living-mask.webp   R pencere ışığı, G yukarı bakan yüzey (kar)
#   src/render/living/atlasMeta.js   hücreler, dünya boyu, baca uçları
#
# Kamera oyunun haritasına göre seçildi: kuzeye bakar, 52° eğik, dik izdüşüm.
# Işık kuzeybatıdan gelir (surfaceGL Ldir ile aynı yön): maket haritanın
# kabartmasıyla aynı güneşi görmezse "üstüne yapıştırılmış" okunur.

import json
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, fallback=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else fallback


ONLY = set(filter(None, (arg('--only') or '').split(',')))
WORK = arg('--out') or os.path.join(ROOT, 'scripts', 'audit', '_tmp', 'living-bake')
SAMPLES = int(arg('--samples', '96'))
os.makedirs(WORK, exist_ok=True)

PITCH = math.radians(52)
SUN_DIR = Vector((-0.55, 0.68, 0.62)).normalized()   # Blender'da y kuzey

# ---------------------------------------------------------------- malzeme ---

PALETTE = {
    'wall_cream': ((0.50, 0.44, 0.33), 0.85),
    'wall_ochre': ((0.40, 0.29, 0.17), 0.85),
    'wall_grey': ((0.36, 0.35, 0.32), 0.8),
    'wall_white': ((0.56, 0.53, 0.47), 0.8),
    'wall_brick': ((0.27, 0.12, 0.08), 0.9),
    'wall_dark': ((0.25, 0.15, 0.11), 0.9),
    'stone': ((0.46, 0.44, 0.40), 0.9),
    'stone_pale': ((0.64, 0.61, 0.54), 0.85),
    'concrete': ((0.52, 0.51, 0.48), 0.9),
    'roof_terra': ((0.27, 0.11, 0.07), 0.7),
    'roof_clay': ((0.31, 0.16, 0.09), 0.75),
    'roof_slate': ((0.14, 0.16, 0.19), 0.55),
    'roof_grey': ((0.27, 0.27, 0.28), 0.65),
    'roof_copper': ((0.23, 0.42, 0.36), 0.5),
    'roof_tar': ((0.08, 0.08, 0.09), 0.8),
    'metal': ((0.17, 0.18, 0.20), 0.45),
    'metal_rust': ((0.30, 0.14, 0.08), 0.7),
    'crane': ((0.46, 0.27, 0.10), 0.55),
    'coal': ((0.03, 0.03, 0.035), 0.95),
    'wood': ((0.25, 0.16, 0.09), 0.85),
    'leaf': ((0.11, 0.20, 0.08), 0.9),
    'leaf_dark': ((0.06, 0.13, 0.08), 0.9),
    'hull_black': ((0.03, 0.035, 0.04), 0.45),
    'hull_red': ((0.30, 0.06, 0.04), 0.6),
    'deck': ((0.42, 0.33, 0.22), 0.8),
    'cabin': ((0.74, 0.71, 0.62), 0.6),
    'funnel': ((0.42, 0.11, 0.06), 0.5),
    'glass': ((0.05, 0.07, 0.09), 0.2),
    'windows_lit': ((0.05, 0.07, 0.09), 0.2),
    'loco': ((0.05, 0.055, 0.06), 0.35),
    'loco_trim': ((0.34, 0.09, 0.06), 0.45),
    'wagon': ((0.27, 0.19, 0.13), 0.75),
    'wagon_roof': ((0.31, 0.31, 0.29), 0.7),
}

MATS = {}


def principled(name, color, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    bsdf = tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def emission(name, build):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    em = tree.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1
    build(tree, em)
    tree.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


def make_materials():
    for name, (color, rough) in PALETTE.items():
        MATS[name] = principled(name, color, rough)


def mask_materials():
    """Maske geçişi: pencere R, yukarı bakan yüzey G. Işık hesabı yok."""
    def lit(tree, em):
        em.inputs['Color'].default_value = (1, 0, 0, 1)

    def up(tree, em):
        geo = tree.nodes.new('ShaderNodeNewGeometry')
        sep = tree.nodes.new('ShaderNodeSeparateXYZ')
        rng = tree.nodes.new('ShaderNodeMapRange')
        rng.inputs['From Min'].default_value = 0.42
        rng.inputs['From Max'].default_value = 0.82
        comb = tree.nodes.new('ShaderNodeCombineColor')
        tree.links.new(geo.outputs['Normal'], sep.inputs['Vector'])
        tree.links.new(sep.outputs['Z'], rng.inputs['Value'])
        tree.links.new(rng.outputs['Result'], comb.inputs['Green'])
        tree.links.new(comb.outputs['Color'], em.inputs['Color'])

    return emission('mask_lit', lit), emission('mask_up', up)


# ------------------------------------------------------------- geometri ---

class Kit:
    """Malzeme başına tek ağ: yüzlerce küçük nesne yerine birkaç birleşik parça."""

    def __init__(self):
        self.parts = {}
        self.tips = []

    def add(self, mat, verts, faces):
        v, f = self.parts.setdefault(mat, ([], []))
        base = len(v)
        v.extend(verts)
        f.extend(tuple(i + base for i in face) for face in faces)

    def build(self, rot=0.0):
        made = []
        turn = Matrix.Rotation(rot, 4, 'Z')
        for name, (verts, faces) in self.parts.items():
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata([tuple(turn @ Vector(p)) for p in verts], [], faces)
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(MATS[name])
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            made.append(obj)
        return made


def frame(cx, cy, rot):
    c, s = math.cos(rot), math.sin(rot)
    return lambda x, y, z: (cx + x * c - y * s, cy + x * s + y * c, z)


def box(kit, mat, cx, cy, z0, w, d, h, rot=0.0):
    p = frame(cx, cy, rot)
    a, b = w / 2, d / 2
    v = [p(-a, -b, z0), p(a, -b, z0), p(a, b, z0), p(-a, b, z0),
         p(-a, -b, z0 + h), p(a, -b, z0 + h), p(a, b, z0 + h), p(-a, b, z0 + h)]
    kit.add(mat, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])


def gable(kit, mat, cx, cy, z0, w, d, h, rot=0.0, over=0.22):
    """Beşik çatı: mahya uzun kenar (d) boyunca."""
    p = frame(cx, cy, rot)
    a, b = w / 2 + over, d / 2 + over
    v = [p(-a, -b, z0), p(a, -b, z0), p(a, b, z0), p(-a, b, z0), p(0, -b, z0 + h), p(0, b, z0 + h)]
    kit.add(mat, v, [(0, 3, 2, 1), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)])


def hip(kit, mat, cx, cy, z0, w, d, h, rot=0.0, over=0.2):
    """Kırma çatı: dört yana iner, mahya kısa."""
    p = frame(cx, cy, rot)
    a, b = w / 2 + over, d / 2 + over
    r = max(0.0, b - a * 0.9)
    v = [p(-a, -b, z0), p(a, -b, z0), p(a, b, z0), p(-a, b, z0), p(0, -r, z0 + h), p(0, r, z0 + h)]
    kit.add(mat, v, [(0, 3, 2, 1), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)])


def cyl(kit, mat, cx, cy, z0, r0, r1, h, n=12):
    v = []
    for k in range(n):
        t = 2 * math.pi * k / n
        v.append((cx + r0 * math.cos(t), cy + r0 * math.sin(t), z0))
    for k in range(n):
        t = 2 * math.pi * k / n
        v.append((cx + r1 * math.cos(t), cy + r1 * math.sin(t), z0 + h))
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for k in range(n):
        j = (k + 1) % n
        faces.append((k, j, n + j, n + k))
    kit.add(mat, v, faces)


def dome(kit, mat, cx, cy, z0, r, n=14, rings=6, squash=1.0):
    v = []
    faces = []
    for ring in range(rings):
        a = (math.pi / 2) * ring / rings
        for k in range(n):
            t = 2 * math.pi * k / n
            v.append((cx + r * math.cos(a) * math.cos(t), cy + r * math.cos(a) * math.sin(t),
                      z0 + r * squash * math.sin(a)))
    v.append((cx, cy, z0 + r * squash))
    for ring in range(rings - 1):
        for k in range(n):
            j = (k + 1) % n
            faces.append((ring * n + k, ring * n + j, (ring + 1) * n + j, (ring + 1) * n + k))
    top = len(v) - 1
    for k in range(n):
        faces.append(((rings - 1) * n + k, (rings - 1) * n + (k + 1) % n, top))
    faces.append(tuple(range(n - 1, -1, -1)))
    kit.add(mat, v, faces)


def windows(kit, rng, cx, cy, z0, w, d, floors, rot, floor_h=1.05):
    """Yalnız kameranın gördüğü üç cepheye pencere; gece payı rastgele yanar."""
    p = frame(cx, cy, rot)
    a, b = w / 2 + 0.02, d / 2 + 0.02
    pane = 0.2
    tall = 0.3

    def quad(mat, pts):
        kit.add(mat, [p(*q) for q in pts], [(0, 1, 2, 3)])

    for floor in range(floors):
        z = z0 + floor_h * (floor + 0.42)
        for i in range(max(1, int(w / 0.85))):
            x = -a + (i + 0.5) * (2 * a) / max(1, int(w / 0.85))
            mat = 'windows_lit' if rng.random() < 0.46 else 'glass'
            quad(mat, [(x - pane, -b, z - tall), (x + pane, -b, z - tall), (x + pane, -b, z + tall), (x - pane, -b, z + tall)])
        for i in range(max(1, int(d / 0.85))):
            y = -b + (i + 0.5) * (2 * b) / max(1, int(d / 0.85))
            mat = 'windows_lit' if rng.random() < 0.46 else 'glass'
            quad(mat, [(a, y - pane, z - tall), (a, y + pane, z - tall), (a, y + pane, z + tall), (a, y - pane, z + tall)])
            mat = 'windows_lit' if rng.random() < 0.46 else 'glass'
            quad(mat, [(-a, y + pane, z - tall), (-a, y - pane, z - tall), (-a, y - pane, z + tall), (-a, y + pane, z + tall)])


WALLS = ['wall_cream', 'wall_ochre', 'wall_grey', 'wall_white', 'wall_brick', 'wall_cream', 'wall_ochre']
ROOFS = ['roof_terra', 'roof_clay', 'roof_slate', 'roof_grey', 'roof_terra']


def building(kit, rng, cx, cy, w, d, floors, rot, walls=WALLS, roofs=ROOFS, flat=False):
    h = floors * 1.05 + 0.25
    wall = rng.choice(walls)
    box(kit, wall, cx, cy, 0, w, d, h, rot)
    windows(kit, rng, cx, cy, 0, w, d, floors, rot)
    roof = rng.choice(roofs)
    if flat:
        box(kit, 'stone_pale', cx, cy, h, w + 0.14, d + 0.14, 0.2, rot)
        box(kit, 'roof_tar', cx, cy, h + 0.2, w - 0.2, d - 0.2, 0.05, rot)
    elif rng.random() < 0.55:
        gable(kit, roof, cx, cy, h, w, d, min(w, 3.0) * 0.52, rot)
    else:
        hip(kit, roof, cx, cy, h, w, d, min(w, 3.0) * 0.46, rot)
    if rng.random() < 0.5:
        p = frame(cx, cy, rot)
        q = p(w * 0.22, d * 0.2, 0)
        box(kit, 'wall_brick', q[0], q[1], h, 0.34, 0.34, 1.0, rot)


def tree(kit, rng, cx, cy, scale=1.0):
    if rng.random() < 0.35:
        cyl(kit, 'leaf_dark', cx, cy, 0.1, 0.8 * scale, 0.02, 2.8 * scale, 7)
    else:
        r = (0.7 + rng.random() * 0.45) * scale
        cyl(kit, 'wood', cx, cy, 0, 0.1, 0.08, 0.7 * scale, 5)
        dome(kit, 'leaf', cx, cy, 0.6 * scale, r, 8, 3, 1.05)


def church(kit, rng, cx, cy, rot, scale=1.0):
    w, d = 3.4 * scale, 8.2 * scale
    h = 4.6 * scale
    box(kit, 'stone_pale', cx, cy, 0, w, d, h, rot)
    gable(kit, 'roof_slate', cx, cy, h, w, d, 2.5 * scale, rot, 0.14)
    box(kit, 'stone_pale', cx, cy, 0, d * 0.72, w * 0.8, h * 0.9, rot)
    gable(kit, 'roof_slate', cx, cy, h * 0.9, w * 0.8, d * 0.72, 2.1 * scale, rot + math.pi / 2, 0.12)
    p = frame(cx, cy, rot)
    t = p(0, -d * 0.5 - 0.9 * scale, 0)
    box(kit, 'stone_pale', t[0], t[1], 0, 2.2 * scale, 2.2 * scale, 9.5 * scale, rot)
    cyl(kit, 'roof_copper', t[0], t[1], 9.5 * scale, 1.5 * scale, 0.03, 5.5 * scale, 8)


def capitol(kit, rng, cx, cy, rot, scale=1.0):
    box(kit, 'stone_pale', cx, cy, 0, 13 * scale, 7.5 * scale, 4.8 * scale, rot)
    box(kit, 'stone', cx, cy, 4.8 * scale, 13.4 * scale, 7.9 * scale, 0.5 * scale, rot)
    windows(kit, rng, cx, cy, 0, 13 * scale, 7.5 * scale, 4, rot)
    cyl(kit, 'stone_pale', cx, cy, 5.3 * scale, 3.4 * scale, 3.3 * scale, 2.9 * scale, 18)
    dome(kit, 'roof_copper', cx, cy, 8.2 * scale, 3.4 * scale, 18, 7, 1.15)
    cyl(kit, 'stone_pale', cx, cy, 12.0 * scale, 0.55 * scale, 0.45 * scale, 1.4 * scale, 10)
    cyl(kit, 'roof_copper', cx, cy, 13.4 * scale, 0.55 * scale, 0.02, 1.5 * scale, 10)


def tower(kit, rng, cx, cy, w, floors, rot):
    """1930'ların basamaklı yüksek binası."""
    h = 0.0
    tiers = 3
    for t in range(tiers):
        share = floors // tiers
        ww = w * (1 - 0.2 * t)
        fh = share * 1.05
        box(kit, 'stone_pale' if t % 2 == 0 else 'wall_grey', cx, cy, h, ww, ww, fh, rot)
        windows(kit, rng, cx, cy, h, ww, ww, share, rot)
        h += fh
    cyl(kit, 'metal', cx, cy, h, 0.3, 0.02, 3.2, 6)


def city(kit, tier, seed, capital=False):
    rng = random.Random(9000 + tier * 100 + seed)
    R = {1: 11.5, 2: 17.5, 3: 25.0, 4: 33.0}[tier]
    base_floors = {1: 2, 2: 3, 3: 4, 4: 5}[tier]
    theta = rng.uniform(-0.28, 0.28)
    block = 7.2 if tier >= 3 else 6.4
    street = 1.5 if tier >= 3 else 1.2
    plaza = {1: 2.8, 2: 4.2, 3: 6.5, 4: 9.0}[tier]
    n = int(R / block) + 2
    c, s = math.cos(theta), math.sin(theta)
    for ix in range(-n, n + 1):
        for iy in range(-n, n + 1):
            bx, by = ix * block, iy * block
            wx, wy = bx * c - by * s, bx * s + by * c
            r = math.hypot(wx, wy)
            edge = R * (0.82 + 0.26 * math.sin(math.atan2(wy, wx) * 3 + seed * 1.7))
            if r > edge or r < plaza:
                continue
            fall = max(0.0, 1 - r / edge)
            inner = block - street
            lots = max(2, int(inner / 2.7))
            size = inner / lots
            for side in range(4):
                for k in range(lots):
                    if rng.random() > 0.55 + 0.45 * fall ** 0.5:
                        continue
                    t = (k + 0.5) * size - inner / 2
                    depth = min(3.0, inner * 0.36)
                    lx, ly = [(t, -inner / 2 + depth / 2), (inner / 2 - depth / 2, t),
                              (-t, inner / 2 - depth / 2), (-inner / 2 + depth / 2, -t)][side]
                    px = wx + lx * c - ly * s
                    py = wy + lx * s + ly * c
                    rot = theta + side * math.pi / 2
                    floors = max(1, round(base_floors * (0.55 + fall) + rng.uniform(-0.9, 0.9)))
                    flat = tier >= 3 and floors >= 4 and rng.random() < 0.5
                    building(kit, rng, px, py, size * 0.93, depth, floors, rot, flat=flat)
    if capital or tier >= 4:
        capitol(kit, rng, 0, 0, theta, 0.72 if tier < 4 else 0.95)
    elif tier >= 2:
        church(kit, rng, 0, 0.6, theta, 0.62 + 0.14 * tier)
    else:
        church(kit, rng, 0, 0, theta, 0.55)
    if tier >= 4:
        for k in range(6):
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(plaza + 3.5, R * 0.55)
            tower(kit, rng, r * math.cos(a), r * math.sin(a), rng.uniform(4.0, 5.2), rng.randint(12, 21), theta)
    # Kenar mahalle: dağınık küçük ev ve ağaç, şehir haritaya yumuşakça otursun.
    for _ in range(int(R * 3.2)):
        a = rng.uniform(0, 2 * math.pi)
        r = R * rng.uniform(0.82, 1.2)
        x, y = r * math.cos(a), r * math.sin(a)
        if rng.random() < 0.42:
            building(kit, rng, x, y, rng.uniform(1.8, 2.6), rng.uniform(2.4, 3.4), rng.randint(1, 2), rng.uniform(0, 3.1))
        else:
            tree(kit, rng, x, y, rng.uniform(0.8, 1.25))


def sawtooth(kit, mat, cx, cy, w, d, h, teeth, rot):
    box(kit, mat, cx, cy, 0, w, d, h, rot)
    windows(kit, random.Random(int(cx * 13 + cy * 7)), cx, cy, 0, w, d, max(1, int(h / 1.6)), rot, 1.6)
    p = frame(cx, cy, rot)
    step = d / teeth
    rise = step * 0.62
    for k in range(teeth):
        y0 = -d / 2 + k * step
        y1 = y0 + step
        a = w / 2
        v = [p(-a, y0, h), p(a, y0, h), p(a, y1, h), p(-a, y1, h), p(-a, y0, h + rise), p(a, y0, h + rise)]
        kit.add('roof_grey', v, [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 5), (3, 0, 4), (4, 5, 2, 3)])
        g = y0 - 0.03
        kit.add('windows_lit' if k % 2 == 0 else 'glass',
                [p(-a + 0.5, g, h + 0.12), p(a - 0.5, g, h + 0.12), p(a - 0.5, g, h + rise - 0.12), p(-a + 0.5, g, h + rise - 0.12)],
                [(0, 1, 2, 3)])


def chimney(kit, cx, cy, height, r=0.62, mat='wall_brick'):
    cyl(kit, 'stone', cx, cy, 0, r * 1.5, r * 1.4, 1.5, 12)
    cyl(kit, mat, cx, cy, 1.5, r * 1.2, r * 0.62, height - 1.5, 12)
    for band in (0.55, 0.78):
        cyl(kit, 'metal', cx, cy, height * band, r * (1.2 - 0.58 * band) + 0.05, r * (1.2 - 0.58 * band) + 0.05, 0.3, 12)
    cyl(kit, 'metal', cx, cy, height, r * 0.72, r * 0.76, 0.42, 12)
    kit.tips.append((cx, cy, height + 0.5))


def factory(kit, tier, seed):
    rng = random.Random(4100 + tier * 10 + seed)
    theta = rng.uniform(-0.12, 0.12)
    p = frame(0, 0, theta)
    halls = {1: 1, 2: 2, 3: 3}[tier]
    for k in range(halls):
        x, y = p(-6.5 + k * 11.5, 2.5 - (k % 2) * 3.5, 0)[:2]
        sawtooth(kit, rng.choice(['wall_brick', 'wall_dark', 'wall_brick']), x, y, 10, 15 + rng.uniform(-2, 3), 3.8 + tier * 0.45, 5, theta)
    stacks = {1: 1, 2: 2, 3: 4}[tier]
    for k in range(stacks):
        x, y = p(-10 + k * 6.4 + rng.uniform(-0.7, 0.7), 11.5 + rng.uniform(-0.8, 0.8), 0)[:2]
        chimney(kit, x, y, rng.uniform(10.5, 13.5) + tier * 0.7)
    x, y = p(-14.5, -9.5, 0)[:2]
    cyl(kit, 'metal_rust', x, y, 3.4, 1.5, 1.5, 2.2, 14)
    dome(kit, 'metal', x, y, 5.6, 1.5, 14, 4, 0.45)
    for a in range(4):
        t = a * math.pi / 2 + 0.78
        box(kit, 'metal', x + 1.2 * math.cos(t), y + 1.2 * math.sin(t), 0, 0.22, 0.22, 3.4)
    for k in range(3 + tier):
        cyl(kit, 'coal', *p(-7 + k * 3.6 + rng.uniform(-1, 1), -10.5 + rng.uniform(-0.8, 0.8), 0)[:2], 0.02, 1.7, 0.08, 1.3, 9)


def freighter(kit, cx, cy, rot, length=18.0):
    """Rıhtımdaki gemi, liman maketi için."""
    w = length * 0.17
    p = frame(cx, cy, rot)
    pts = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.36), (0.0, 0.62), (-0.5, 0.36)]
    lo = [p(x * w * 0.92, y * length, 0.05) for x, y in pts]
    hi = [p(x * w, y * length, 1.5) for x, y in pts]
    n = len(pts)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for k in range(n):
        j = (k + 1) % n
        faces.append((k, j, n + j, n + k))
    kit.add('hull_black', lo + hi, faces)
    deck = [p(x * w * 0.9, y * length * 0.97, 1.52) for x, y in pts]
    kit.add('deck', deck, [tuple(range(n))])
    c = p(0, -length * 0.14, 0)
    box(kit, 'cabin', c[0], c[1], 1.5, w * 0.72, length * 0.17, 1.8, rot)
    f = p(0, -length * 0.16, 0)
    cyl(kit, 'funnel', f[0], f[1], 3.3, 0.5, 0.46, 1.7, 8)


def crane(kit, cx, cy, rot, h=8.0):
    p = frame(cx, cy, rot)
    for x, y in ((-1.2, -1.2), (1.2, -1.2), (1.2, 1.2), (-1.2, 1.2)):
        q = p(x, y, 0)
        box(kit, 'crane', q[0], q[1], 0, 0.28, 0.28, h, rot)
    box(kit, 'crane', cx, cy, h, 3.0, 3.0, 0.5, rot)
    box(kit, 'cabin', cx, cy, h + 0.5, 1.8, 2.0, 1.2, rot)
    jib = p(0, -6.5, 0)
    box(kit, 'crane', jib[0], jib[1], h + 1.1, 0.42, 14.5, 0.42, rot)
    back = p(0, 3.4, 0)
    box(kit, 'metal', back[0], back[1], h + 0.8, 1.2, 1.5, 1.0, rot)


def port(kit, tier, seed):
    """Deniz yerel −y yönünde (kameraya doğru); döndürme build() içinde."""
    rng = random.Random(7700 + tier * 10 + seed)
    W = 30 if tier == 1 else 42
    box(kit, 'stone', 0, 3, 0, W, 8.5, 0.55)
    box(kit, 'concrete', 0, 3, 0.55, W - 0.8, 7.7, 0.06)
    for k, x in enumerate(range(-int(W / 2) + 6, int(W / 2) - 2, 13)):
        box(kit, 'stone', x, -8.5, 0, 3.2, 15, 0.55)
        box(kit, 'wood', x, -15.8, 0, 3.8, 0.6, 0.7)
        if k % 2 == 0:
            freighter(kit, x + 6.4, -9.5, 0, 14.5 + tier * 2)
        crane(kit, x - 0.2, -3.6 - (k % 2) * 3.2, 0, 7.5 + tier)
    for k in range(3 + tier):
        x = -W / 2 + 6 + k * (W - 10) / (2 + tier)
        wall = rng.choice(['wall_brick', 'wall_dark', 'wall_ochre'])
        h = 3.2 + rng.uniform(0, 1.3)
        box(kit, wall, x, 11.3, 0, 8.2, 7.4, h)
        gable(kit, rng.choice(['roof_slate', 'roof_grey']), x, 11.3, h, 7.4, 8.2, 1.8, math.pi / 2)
        windows(kit, rng, x, 11.3, 0, 8.2, 7.4, 2, 0.0, 1.5)
    for _ in range(12 + tier * 8):
        x, y = rng.uniform(-W / 2 + 2, W / 2 - 2), rng.uniform(0.3, 6.0)
        box(kit, rng.choice(['wood', 'metal_rust', 'crane', 'wall_ochre']), x, y, 0.6, rng.uniform(1.0, 2.3), 1.1, rng.uniform(0.7, 1.5), rng.choice([0, 0, math.pi / 2]))


def steamer(kit, variant):
    """Yük vapuru, burun +y. Dünya boyu ~22 birim."""
    L = 22.0 if variant == 0 else 25.0
    w = L * 0.155
    pts = [(-0.34, -0.5), (0.34, -0.5), (0.5, -0.32), (0.5, 0.26), (0.0, 0.55), (-0.5, 0.26), (-0.5, -0.32)]
    lo = [(x * w * 0.9, y * L, 0.0) for x, y in pts]
    hi = [(x * w, y * L, 1.7) for x, y in pts]
    n = len(pts)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for k in range(n):
        j = (k + 1) % n
        faces.append((k, j, n + j, n + k))
    kit.add('hull_red' if variant else 'hull_black', lo + hi, faces)
    kit.add('deck', [(x * w * 0.9, y * L * 0.97, 1.72) for x, y in pts], [tuple(range(n))])
    box(kit, 'cabin', 0, -L * 0.12, 1.7, w * 0.74, L * 0.2, 2.1)
    box(kit, 'roof_grey', 0, -L * 0.12, 3.8, w * 0.82, L * 0.22, 0.14)
    box(kit, 'cabin', 0, -L * 0.13, 3.94, w * 0.46, L * 0.09, 1.1)
    cyl(kit, 'funnel', 0, -L * 0.24, 3.0, 0.72, 0.66, 2.6, 10)
    cyl(kit, 'hull_black', 0, -L * 0.24, 5.6, 0.68, 0.68, 0.5, 10)
    kit.tips.append((0, -L * 0.24, 6.2))
    for y in (L * 0.32, -L * 0.4):
        cyl(kit, 'wood', 0, y, 1.7, 0.13, 0.07, 6.5, 6)
    for y in (L * 0.16, L * 0.04, -L * 0.34):
        box(kit, 'wood', 0, y, 1.72, w * 0.6, L * 0.08, 0.32)


def locomotive(kit):
    cyl_at = lambda y, r, z, h: cyl(kit, 'loco', 0, y, z, r, r, h, 12)
    box(kit, 'loco', 0, 0, 0.5, 2.2, 10.5, 0.5)
    for k in range(5):
        cyl_at(-2.8 + k * 1.3, 1.02, 1.0, 1.65)
    cyl(kit, 'loco', 0, 3.6, 2.5, 0.4, 0.5, 1.5, 10)
    kit.tips.append((0, 3.6, 4.1))
    box(kit, 'loco', 0, -3.8, 1.0, 2.4, 2.6, 2.7)
    box(kit, 'loco_trim', 0, -3.8, 3.7, 2.7, 3.0, 0.2)
    box(kit, 'loco_trim', 0, 5.2, 0.5, 2.6, 0.3, 0.8)


def wagon(kit):
    box(kit, 'metal', 0, 0, 0.45, 2.1, 8.5, 0.3)
    box(kit, 'wagon', 0, 0, 0.75, 2.5, 8.2, 2.3)
    gable(kit, 'wagon_roof', 0, 0, 3.05, 2.5, 8.2, 0.42, 0.0, 0.1)


# ----------------------------------------------------------------- sahne ---

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    scene.cycles.device = 'GPU'
                    print(f'[bake] cihaz {kind}')
                    break
            except TypeError:
                continue
    except Exception as err:  # GPU yoksa işlemci de aynı görüntüyü verir, yalnız yavaş
        print('[bake] GPU yok:', err)

    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputWorld')
    bg = tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.62, 0.72, 0.86, 1)
    bg.inputs['Strength'].default_value = 0.46
    tree.links.new(bg.outputs['Background'], out.inputs['Surface'])
    scene.world = world

    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 2.5
    sun.angle = math.radians(7)
    sun.color = (1.0, 0.93, 0.82)
    sun_obj = bpy.data.objects.new('sun', sun)
    sun_obj.rotation_euler = SUN_DIR.to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(sun_obj)

    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam_obj = bpy.data.objects.new('cam', cam)
    cam_obj.rotation_euler = (math.pi / 2 - PITCH, 0, 0)
    cam_obj.location = (0, -300 * math.cos(PITCH), 300 * math.sin(PITCH))
    cam.clip_end = 2000
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    ground = bpy.data.meshes.new('ground')
    S = 400
    ground.from_pydata([(-S, -S, 0), (S, -S, 0), (S, S, 0), (-S, S, 0)], [], [(0, 1, 2, 3)])
    ground_obj = bpy.data.objects.new('ground', ground)
    ground_obj.is_shadow_catcher = True
    scene.collection.objects.link(ground_obj)
    return scene, cam, ground_obj


def project(tip, rot=0.0):
    """Maket noktası → hücre merkezine göre ekran kayması (dünya birimi, y aşağı)."""
    p = Matrix.Rotation(rot, 4, 'Z') @ Vector(tip)
    return (round(p.x, 3), round(-(p.y * math.sin(PITCH) + p.z * math.cos(PITCH)), 3))


def read_png(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]


def shrink(rgba, factor):
    """Önçarpımlı kutu süzgeç: yarı saydam kenarda koyu hale kalmasın."""
    a = rgba[..., 3:4]
    pm = np.concatenate([rgba[..., :3] * a, a], axis=2)
    h, w = pm.shape[:2]
    out = pm[: h - h % factor, : w - w % factor].reshape(h // factor, factor, w // factor, factor, 4).mean(axis=(1, 3))
    alpha = out[..., 3:4]
    rgb = out[..., :3] / np.maximum(alpha, 1e-4)
    # Gölge hücre kenarına değerse atlasta düz bir kesik çizgi kalır: kenarda sönsün.
    n, m = alpha.shape[:2]
    yy, xx = np.mgrid[0:n, 0:m]
    r = np.hypot((xx + 0.5) / m - 0.5, (yy + 0.5) / n - 0.5) * 2
    t = np.clip((1.0 - r) / 0.22, 0, 1)
    fade = (t * t * (3 - 2 * t))[..., None]
    return np.concatenate([np.clip(rgb, 0, 1), alpha * fade], axis=2)


def render_sprite(scene, cam, ground, name, world_size, cell, build, rot=0.0):
    kit = Kit()
    build(kit)
    objs = kit.build(rot)
    cam.ortho_scale = world_size
    scene.render.resolution_x = cell * 2
    scene.render.resolution_y = cell * 2
    color_path = os.path.join(WORK, f'{name}.color.png')
    mask_path = os.path.join(WORK, f'{name}.mask.png')

    scene.cycles.samples = SAMPLES if cell >= 256 else max(32, SAMPLES // 2)
    scene.cycles.use_denoising = True
    ground.hide_render = False
    scene.render.filepath = color_path
    bpy.ops.render.render(write_still=True)

    # Maske: ışıksız, gölgesiz; yalnız hangi pikselin ne olduğu.
    mask_lit, mask_up = MASKS
    for obj in objs:
        obj.data.materials[0] = mask_lit if obj.name.startswith('windows_lit') else mask_up
    ground.hide_render = True
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.render.filepath = mask_path
    bpy.ops.render.render(write_still=True)

    tips = [project(t, rot) for t in kit.tips]
    for obj in objs:
        mesh = obj.data
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(mesh)
    return shrink(read_png(color_path), 2), shrink(read_png(mask_path), 2), tips


# ------------------------------------------------------------------ liste ---

HEADINGS = 16


def sprite_list():
    items = []
    for tier, size in ((1, 40), (2, 56), (3, 76), (4, 98)):
        for variant in range(3):
            items.append({'id': f'city_{tier}_{variant}', 'size': size, 'cell': 256,
                          'build': (lambda t, v: lambda kit: city(kit, t, v))(tier, variant)})
    for tier, variant in ((1, 0), (2, 0), (3, 0), (1, 1), (2, 1), (3, 1)):
        items.append({'id': f'factory_{tier}_{variant}', 'size': 56, 'cell': 256,
                      'build': (lambda t, v: lambda kit: factory(kit, t, v))(tier, variant)})
    # Liman dört yöne ayrı pişer: gölge ve kamera açısı döndürülerek taklit edilemez.
    for tier, size in ((1, 58), (2, 70)):
        for k, face in enumerate('senw'):
            items.append({'id': f'port_{tier}_{face}', 'size': size, 'cell': 256, 'rot': k * math.pi / 2,
                          'build': (lambda t: lambda kit: port(kit, t, 0))(tier)})
    for variant in range(2):
        for h in range(HEADINGS):
            items.append({'id': f'ship_{variant}_{h}', 'size': 34, 'cell': 128, 'rot': -h * 2 * math.pi / HEADINGS,
                          'build': (lambda v: lambda kit: steamer(kit, v))(variant)})
    for h in range(HEADINGS):
        items.append({'id': f'loco_{h}', 'size': 17, 'cell': 128, 'rot': -h * 2 * math.pi / HEADINGS,
                      'build': locomotive})
    for h in range(HEADINGS):
        items.append({'id': f'wagon_{h}', 'size': 17, 'cell': 128, 'rot': -h * 2 * math.pi / HEADINGS,
                      'build': wagon})
    return items


def save_atlas(pixels, path, scene, quality=90):
    h, w = pixels.shape[:2]
    img = bpy.data.images.new('atlas', w, h, alpha=True)
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(pixels[::-1].astype(np.float32).ravel())
    settings = scene.render.image_settings
    settings.file_format = 'WEBP'
    settings.color_mode = 'RGBA'
    settings.quality = quality
    img.save_render(path, scene=scene)
    bpy.data.images.remove(img)
    settings.file_format = 'PNG'


def main():
    global MASKS
    scene, cam, ground = setup_scene()
    make_materials()
    MASKS = mask_materials()
    items = sprite_list()
    if ONLY:
        items = [i for i in items if i['id'] in ONLY]
    size = 2048
    color = np.zeros((size, size, 4), dtype=np.float32)
    mask = np.zeros((size, size, 4), dtype=np.float32)
    meta = {}
    x = y = row = 0
    for n, item in enumerate(items):
        cell = item['cell']
        if x + cell > size:
            x = 0
            y += row
            row = 0
        print(f"[bake] {n + 1}/{len(items)} {item['id']}", flush=True)
        c, m, tips = render_sprite(scene, cam, ground, item['id'], item['size'], cell, item['build'], item.get('rot', 0.0))
        color[y:y + cell, x:x + cell] = c
        mask[y:y + cell, x:x + cell] = m
        meta[item['id']] = {'x': x, 'y': y, 'c': cell, 's': item['size'], 'tips': tips}
        x += cell
        row = max(row, cell)
    if ONLY:
        print('[bake] deneme bitti:', WORK)
        return
    out = os.path.join(ROOT, 'assets', 'living')
    os.makedirs(out, exist_ok=True)
    save_atlas(color, os.path.join(out, 'living-color.webp'), scene)
    # Maskede alfa renkle aynı kalsın: pencere kenarı rengin kenarıyla örtüşür.
    mask[..., 3] = color[..., 3]
    save_atlas(mask, os.path.join(out, 'living-mask.webp'), scene)
    body = json.dumps({'size': size, 'headings': HEADINGS, 'cells': meta}, separators=(',', ':'))
    with open(os.path.join(ROOT, 'src', 'render', 'living', 'atlasMeta.js'), 'w', encoding='utf-8') as fh:
        fh.write('// scripts/art/bake_living.py üretir, elle düzenlenmez.\n')
        fh.write(f'export const LIVING_ATLAS = {body};\n')
    print('[bake] tamam')


MASKS = None
main()
