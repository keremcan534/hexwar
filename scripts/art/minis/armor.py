# Orta tank (1930'ların sonu): perçinli gövde, eğik ön levha, üç kişilik kule, 75 mm top.
# Palet gerçek baklalardan oluşur; baklalar yol üzerinde kaydırılarak yürütülür.
import math

from .effects import Muzzle
from .kit import Part, Vector, empty, material, rot, smooth, wave

META = {'worldSize': 54.0, 'span': 9.2, 'focus': 0.95, 'glow': 30.0}

TRACK_FRONT = 2.62
TRACK_BACK = -2.72
SPROCKET_R = 0.42
IDLER_R = 0.4
TRACK_Y = 1.18
TOP_Z = 1.16
LINKS = 46


def tank_palette():
    return {
        'paint': material('boya', (0.46, 0.46, 0.42), rough=0.66, mask=0.92, grain=0.3, grain_scale=9, bump=0.14, ao=0.8, mud=0.62, mud_top=1.25),
        'paint2': material('boya2', (0.37, 0.37, 0.34), rough=0.72, mask=0.86, grain=0.32, grain_scale=7, bump=0.16, ao=0.8, mud=0.68, mud_top=1.3),
        'steel': material('palet', (0.055, 0.052, 0.05), rough=0.5, metal=0.85, grain=0.2, grain_scale=20),
        'rubber': material('lastik', (0.02, 0.02, 0.02), rough=0.8),
        'dark': material('koyu', (0.012, 0.012, 0.014), rough=0.7),
        'gun': material('kulelik', (0.14, 0.14, 0.13), rough=0.42, metal=0.7, mask=0.5),
        'rust': material('pas', (0.17, 0.09, 0.05), rough=0.85, grain=0.3, grain_scale=14),
        'wood': material('kazma', (0.24, 0.15, 0.08), rough=0.7),
    }


def track_point(s):
    """Palet yolu boyunca [0, 1) konumu: (x, z, teğet açısı). Yol: üst düz, ön yay, alt düz, arka yay."""
    top = TRACK_FRONT - TRACK_BACK
    arc_f = math.pi * SPROCKET_R
    arc_b = math.pi * IDLER_R
    low_x0, low_x1 = TRACK_BACK + 0.32, TRACK_FRONT - 0.42
    bottom = low_x1 - low_x0
    z_f, z_b = TOP_Z - SPROCKET_R, TOP_Z - IDLER_R
    drop_f = math.hypot(TRACK_FRONT + SPROCKET_R - low_x1, z_f - SPROCKET_R)
    drop_b = math.hypot(low_x0 - (TRACK_BACK - IDLER_R), z_b - IDLER_R)
    total = top + arc_f + drop_f + bottom + drop_b + arc_b
    d = (s % 1.0) * total
    if d < top:
        return TRACK_BACK + d, TOP_Z, 0.0
    d -= top
    if d < arc_f:
        a = d / SPROCKET_R
        return TRACK_FRONT + math.sin(a) * SPROCKET_R, z_f + math.cos(a) * SPROCKET_R, a
    d -= arc_f
    x0, z0 = TRACK_FRONT, z_f - SPROCKET_R
    if d < drop_f:
        u = d / drop_f
        return x0 + (low_x1 - x0) * u, z0 + (0.04 - z0) * u, math.pi - math.atan2(z0 - 0.04, x0 - low_x1)
    d -= drop_f
    if d < bottom:
        return low_x1 - d, 0.04, math.pi
    d -= bottom
    x1, z1 = TRACK_BACK, z_b - IDLER_R
    if d < drop_b:
        u = d / drop_b
        return low_x0 + (x1 - low_x0) * u, 0.04 + (z1 - 0.04) * u, math.pi + math.atan2(z1 - 0.04, low_x0 - x1)
    d -= drop_b
    a = math.pi + d / IDLER_R
    return TRACK_BACK + math.sin(a) * IDLER_R, z_b + math.cos(a) * IDLER_R, a


def road_wheel(name, pal, parent, x, y, r):
    p = Part(name)
    half = math.pi / 2
    p.cyl(r, r, 0.22, pal['rubber'], rot=(half, 0, 0), n=20)
    p.cyl(r * 0.76, r * 0.76, 0.24, pal['paint2'], rot=(half, 0, 0), n=18)
    p.cyl(r * 0.28, r * 0.28, 0.27, pal['steel'], rot=(half, 0, 0), n=10)
    for k in range(6):
        a = math.tau * k / 6
        p.ball(0.022, pal['steel'], at=(math.cos(a) * r * 0.52, (0.125 if y > 0 else -0.125), math.sin(a) * r * 0.52),
               n=6, stacks=4)
    return p.build(parent, at=(x, y, r + 0.03))


def rivets(part, mat, x0, x1, y, z, count, r=0.018):
    for k in range(count):
        part.ball(r, mat, at=(x0 + (x1 - x0) * k / max(1, count - 1), y, z), n=6, stacks=4)


def build():
    pal = tank_palette()
    root = empty('tank')
    body = Part('tank-govde')
    p, p2 = pal['paint'], pal['paint2']
    # Alt tekne ve eğik ön levha.
    body.box((4.5, 1.76, 0.62), p, at=(-0.2, 0, 0.82))
    body.box((1.34, 1.76, 0.1), p, at=(2.52, 0, 0.98), rot=(0, 0.42, 0))
    body.box((0.9, 1.72, 0.1), p, at=(2.62, 0, 0.56), rot=(0, -0.62, 0))
    # Üst yapı: kenarları içe eğik, sürücü kabini önde çıkıntılı.
    body.box((3.9, 2.16, 0.56), p, at=(-0.34, 0, 1.4), taper=(0.97, 0.9))
    body.box((0.76, 1.94, 0.46), p, at=(1.76, 0, 1.36), rot=(0, 0.6, 0))
    body.box((0.22, 0.32, 0.12), pal['dark'], at=(2.0, 0.5, 1.46), rot=(0, 0.6, 0))
    body.box((0.32, 0.4, 0.05), p2, at=(1.5, -0.5, 1.68))
    body.box((0.32, 0.4, 0.05), p2, at=(1.5, 0.5, 1.68))
    # Çamurluk ve üstündeki alet takımı: düz gövdeyi "kullanılmış" gösteren şey budur.
    for side in (-1, 1):
        body.box((5.5, 0.56, 0.035), p2, at=(-0.05, side * 1.22, 1.2))
        body.box((0.9, 0.56, 0.035), p2, at=(2.98, side * 1.22, 1.03), rot=(0, 0.48, 0))
        body.box((0.6, 0.5, 0.26), p2, at=(-2.2, side * 1.2, 1.35))
        body.box((0.05, 0.08, 1.2), pal['wood'], at=(0.4, side * 1.36, 1.28), rot=(0, math.pi / 2, 0))
        body.box((0.14, 0.05, 0.22), pal['steel'], at=(1.0, side * 1.36, 1.28))
        rivets(body, pal['steel'], -2.1, 1.3, side * 1.083, 1.62, 11)
        rivets(body, pal['steel'], -2.1, 1.3, side * 1.083, 1.2, 11)
    # Motor güvertesi: panjurlar, egzoz, stepne.
    for k in range(6):
        body.box((0.08, 1.15, 0.03), pal['dark'], at=(-1.25 - k * 0.17, 0, 1.69))
    body.cyl(0.1, 0.1, 1.0, pal['rust'], at=(-2.42, 0.48, 0.86), rot=(math.pi / 2, 0, 0), n=10)
    body.cyl(0.1, 0.1, 1.0, pal['rust'], at=(-2.42, -0.48, 0.86), rot=(math.pi / 2, 0, 0), n=10)
    hull = body.build(root, bevel=0.018)

    # Süspansiyon kirişleri ve dönen tekerlekler.
    spinners = []
    for side in (-1, 1):
        y = side * TRACK_Y
        strut = Part(f'tank-sasi{side}')
        strut.box((5.0, 0.1, 0.34), pal['steel'], at=(0, y * 0.87, 0.82))
        for k in range(5):
            strut.box((0.3, 0.1, 0.46), pal['paint2'], at=(-1.72 + k * 0.86, y * 0.94, 0.62), rot=(0, 0.3, 0))
        strut.build(hull)
        for k in range(5):
            spinners.append((road_wheel(f'tank-yol{side}{k}', pal, hull, -1.72 + k * 0.86, y, 0.3), 0.3))
        for k in range(3):
            w = Part(f'tank-donus{side}{k}')
            w.cyl(0.12, 0.12, 0.18, pal['rubber'], rot=(math.pi / 2, 0, 0), n=12)
            ob = w.build(hull, at=(-1.4 + k * 1.4, y, 1.06))
            spinners.append((ob, 0.12))
        s = Part(f'tank-zincir{side}')
        s.cyl(SPROCKET_R * 0.86, SPROCKET_R * 0.86, 0.2, pal['steel'], rot=(math.pi / 2, 0, 0), n=14)
        s.cyl(0.2, 0.2, 0.26, pal['paint2'], rot=(math.pi / 2, 0, 0), n=10)
        for k in range(12):
            a = math.tau * k / 12
            s.box((0.1, 0.09, 0.07), pal['steel'], at=(math.cos(a) * SPROCKET_R * 0.92, 0, math.sin(a) * SPROCKET_R * 0.92),
                  rot=(0, -a, 0))
        spinners.append((s.build(hull, at=(TRACK_FRONT, y, TOP_Z - SPROCKET_R)), SPROCKET_R))
        i = Part(f'tank-avare{side}')
        i.cyl(IDLER_R * 0.9, IDLER_R * 0.9, 0.2, pal['steel'], rot=(math.pi / 2, 0, 0), n=16)
        i.cyl(IDLER_R * 0.6, IDLER_R * 0.6, 0.23, pal['paint2'], rot=(math.pi / 2, 0, 0), n=12)
        spinners.append((i.build(hull, at=(TRACK_BACK, y, TOP_Z - IDLER_R)), IDLER_R))

    # Palet baklaları tek örgü paylaşır; her karede yol üzerinde konumları yazılır.
    link = Part('bakla')
    link.box((0.2, 0.48, 0.05), pal['steel'])
    link.box((0.05, 0.5, 0.075), pal['steel'], at=(0.05, 0, -0.03))
    link.box((0.1, 0.08, 0.07), pal['steel'], at=(0, 0, 0.05))
    link_mesh = link.build(hull)
    link_mesh.hide_render = True
    links = []
    for side in (-1, 1):
        for k in range(LINKS):
            ob = link_mesh.copy()
            bpy_link(ob)
            ob.hide_render = False
            ob.parent = hull
            ob['s'] = k / LINKS
            ob['y'] = side * TRACK_Y
            links.append(ob)

    tur = Part('tank-kule')
    tur.loft([(0.0, 0, 0, 1.08, 0.92), (0.1, 0, 0, 1.1, 0.95), (0.56, -0.02, 0, 0.92, 0.8), (0.64, -0.04, 0, 0.84, 0.72)],
             p, n=10, power=3.4)
    tur.box((0.6, 1.2, 0.46), p2, at=(-1.26, 0, 0.32), taper=(0.9, 0.85))
    # Kumandan kubbesi: siluetin tepesi, görüş yarıkları koyu.
    tur.cyl(0.28, 0.25, 0.3, p, at=(-0.34, 0.2, 0.78), n=12)
    tur.cyl(0.29, 0.29, 0.04, p2, at=(-0.34, 0.2, 0.92), n=12)
    for k in range(6):
        a = math.tau * k / 6
        tur.box((0.09, 0.03, 0.05), pal['dark'],
                at=(-0.34 + math.cos(a) * 0.27, 0.2 + math.sin(a) * 0.27, 0.8), rot=(0, 0, a))
    tur.box((0.45, 0.5, 0.05), p2, at=(0.25, -0.34, 0.66))
    for side in (-1, 1):
        tur.box((0.5, 0.03, 0.34), p2, at=(-0.1, side * 0.97, 0.3), rot=(side * 0.2, 0, 0))
        rivets(tur, pal['steel'], -0.75, 0.6, side * 0.965, 0.47, 7)
    tur.cyl(0.02, 0.006, 1.2, pal['steel'], at=(-0.95, -0.5, 1.2), rot=(0.12, -0.05, 0), n=5)
    turret = tur.build(hull, at=(0.0, 0, 1.68), bevel=0.016)

    man = Part('tank-kalkan')
    man.box((0.3, 0.74, 0.46), p, at=(1.02, 0, 0.3), taper=(0.92, 0.9))
    man.cyl(0.12, 0.13, 0.32, pal['gun'], at=(1.22, 0, 0.3), rot=(0, math.pi / 2, 0), n=12)
    man.build(turret, bevel=0.012)

    gun = Part('tank-top')
    gun.cyl(0.06, 0.052, 2.3, pal['gun'], at=(1.15, 0, 0), rot=(0, math.pi / 2, 0), n=12)
    gun.cyl(0.09, 0.09, 0.22, pal['gun'], at=(2.35, 0, 0), rot=(0, math.pi / 2, 0), n=10)
    gun.box((0.18, 0.2, 0.05), pal['dark'], at=(2.36, 0, 0))
    barrel = gun.build(turret, at=(1.2, 0, 0.3))
    rot(barrel, y=-0.04)
    flash = Muzzle('tank-ates', barrel, (2.5, 0, 0), size=1.25, puffs=5, seed=13)
    # Egzoz dumanı aynı duman sınıfıyla, alevi hiç açılmaz.
    fumes = [Muzzle(f'tank-egzoz{i}', hull, (-2.9, y, 0.86), size=0.5, puffs=3, seed=20 + i,
                    drift=(-1.0, 0.0, 0.7), smoke=(0.2, 0.2, 0.2), light=False) for i, y in enumerate((0.48, -0.48))]

    def pose(anim, t):
        travel = t if anim == 'walk' else 0.0
        for ob in links:
            x, z, a = track_point(ob['s'] + travel * 3 / LINKS * LINKS / LINKS)
            ob.location = (x, ob['y'], z)
            rot(ob, y=a)
        for ob, radius in spinners:
            rot(ob, y=travel * 2.6 / radius)
        kick = 0.0
        if anim == 'fire':
            kick = smooth(0.1, 0.16, t) * (1 - smooth(0.22, 0.6, t))
            flash.step(t)
        else:
            flash.rest()
        barrel.location = (1.2 - 0.34 * kick, 0, 0.3)
        if anim == 'walk':
            hull.location = (0, 0, 0.014 * wave(t * 2))
            rot(hull, y=0.012 * wave(t + 0.2), x=0.005 * wave(t * 2 + 0.3))
            for i, fume in enumerate(fumes):
                fume.step((t * 2 + i * 0.37) % 1.0, 0.99)
        elif anim == 'fire':
            hull.location = (-0.06 * kick, 0, 0)
            rot(hull, y=-0.032 * kick)
            for fume in fumes:
                fume.rest()
        else:
            hull.location = (0, 0, 0.003 * wave(t * 3))
            rot(hull, y=0.0)
            for i, fume in enumerate(fumes):
                fume.step((t + i * 0.5) % 1.0, 0.99)
        for fume in fumes:
            for ob in fume.glows:
                ob.hide_render = True

    return {**META, 'root': root, 'pose': pose, 'muzzles': [flash.anchor]}


def bpy_link(ob):
    import bpy
    bpy.context.scene.collection.objects.link(ob)
