# Dretnot zırhlısı: üç kuleli, iki bacalı, üç ayaklı direkli muharebe gemisi (1910'lar).
# Ölçek: 1 birim ≈ 15 m. Su çizgisi z = 0: alt kısmı gölge alıcı zemin örter.
import math

from .effects import Muzzle
from .kit import Part, Vector, empty, foam_material, material, rot, smooth, wave

META = {'worldSize': 54.0, 'span': 13.6, 'focus': 0.55, 'glow': 26.0, 'backdrop': (0.09, 0.2, 0.28)}


def ship_palette():
    return {
        'hull': material('borda', (0.36, 0.38, 0.39), rough=0.6, mask=0.84, grain=0.22, grain_scale=5, ao=0.6),
        'upper': material('ust', (0.42, 0.44, 0.45), rough=0.6, mask=0.62, grain=0.2, grain_scale=9, ao=0.7),
        'boot': material('su-hatti', (0.09, 0.03, 0.025), rough=0.6),
        'deck': material('guverte', (0.16, 0.125, 0.08), rough=0.78, grain=0.28, grain_scale=46, ao=0.6),
        'dark': material('koyu2', (0.02, 0.022, 0.025), rough=0.6),
        'steel': material('demir2', (0.1, 0.105, 0.11), rough=0.45, metal=0.75),
        'funnel': material('baca', (0.34, 0.35, 0.36), rough=0.62, mask=0.72, ao=0.5),
        'cap': material('baca-ucu', (0.012, 0.012, 0.012), rough=0.75),
        'boat': material('filika', (0.7, 0.68, 0.6), rough=0.6),
        'foam': foam_material('kopuk'),
    }


def turret(name, pal, parent, at, facing, barrels=2, size=1.0):
    """Top kulesi: dönen taban + yükselebilen namlular. Yakın kuleler aynı kalıptan."""
    pivot = empty(name, parent, at)
    rot(pivot, z=facing)
    t = Part(f'{name}-g')
    # Köşeli zırh kulesi: yuvarlak kubbe üstten bakınca düğme gibi okunuyordu.
    t.loft([(0.0, 0, 0, 0.58 * size, 0.44 * size), (0.28 * size, -0.02, 0, 0.56 * size, 0.42 * size),
            (0.36 * size, -0.05, 0, 0.5 * size, 0.36 * size)], pal['upper'], n=16, power=7.0)
    t.box((0.3 * size, 0.2 * size, 0.04), pal['steel'], at=(-0.26 * size, 0, 0.33 * size))
    t.build(pivot, bevel=0.012)
    guns = empty(f'{name}-t', pivot, (0.34 * size, 0, 0.14 * size))
    g = Part(f'{name}-n')
    for k in range(barrels):
        y = (k - (barrels - 1) / 2) * 0.19 * size
        g.cyl(0.062 * size, 0.042 * size, 1.55 * size, pal['steel'], at=(0.78 * size, y, 0), rot=(0, math.pi / 2, 0), n=9)
        g.cyl(0.058 * size, 0.058 * size, 0.28 * size, pal['steel'], at=(0.02, y, 0), rot=(0, math.pi / 2, 0), n=9)
    g.build(guns)
    flash = Muzzle(f'{name}-a', guns, (1.58 * size, 0, 0), size=1.5 * size, puffs=4, seed=sum(map(ord, name)) % 97,
                   smoke=(0.5, 0.48, 0.45))
    return {'pivot': pivot, 'guns': guns, 'flash': flash, 'home': facing}


class Stack:
    """Baca dumanı: geminin hızına göre arkaya yatan kesintisiz kümeler."""

    def __init__(self, name, parent, at, size=1.0, seed=3):
        self.fx = Muzzle(name, parent, at, size=size, puffs=4, seed=seed, drift=(-1.6, 0.0, 0.9),
                         smoke=(0.17, 0.17, 0.18), light=False)

    def step(self, t, steaming):
        self.fx.step((t * (1.0 if steaming else 0.5)) % 1.0, 0.98)
        for ob in self.fx.glows:
            ob.hide_render = True


def foam_band(name, pal, parent, length, beam):
    """Baş dalgası: gövdeye yapışık köpük şeridi; baş tarafta kabarır, kıçta incelir."""
    p = Part(name)
    for side in (-1, 1):
        rings = []
        for k in range(10):
            u = k / 9
            # Köpük yalnız baş tarafta: kıça doğru incelip suya karışır.
            x = length * (0.5 - u * 0.5)
            half = beam * (math.sin(min(1.0, u * 2.4) * math.pi / 2) * 0.96 + 0.05)
            w = 0.3 * (1 - u) ** 1.6
            rings.append([Vector((x, side * (half - 0.02), 0.03)), Vector((x, side * (half + w), 0.016 + 0.05 * (1 - u)))])
        vs = [[p.bm.verts.new(v) for v in r] for r in rings]
        idx = p.slot(pal['foam'])
        for a, b in zip(vs, vs[1:]):
            f = p.bm.faces.new((a[0], a[1], b[1], b[0]))
            f.material_index = idx
            f.smooth = True
    ob = p.build(parent)
    ob.visible_shadow = False
    return ob


def build():
    pal = ship_palette()
    root = empty('zirhli')
    keel = -0.5
    fore = 0.68
    main = 0.5
    aft = 0.46
    stations = [
        (-5.95, 0.42, aft, -0.12), (-5.7, 0.7, aft, keel), (-4.8, 0.92, aft, keel), (-2.5, 1.0, main, keel),
        (0.6, 1.0, main, keel), (1.55, 0.98, main, keel), (1.6, 0.97, fore, keel), (3.4, 0.86, fore, keel),
        (4.8, 0.58, fore + 0.05, keel), (5.7, 0.2, fore + 0.14, keel * 0.7), (6.05, 0.03, fore + 0.2, keel * 0.25),
    ]
    body = Part('zirhli-govde')
    body.hull(stations, pal['hull'], pal['deck'])
    # Su çizgisi boyası.
    body.hull([(x, b * 1.008, 0.1, 0.0) for x, b, _, _ in stations], pal['boot'])
    for side in (-1, 1):
        # Yan toplar (kazamat): borda çizgisini kıran tek ayrıntı.
        for k in range(6):
            x = -2.4 + k * 0.72
            body.box((0.2, 0.05, 0.16), pal['dark'], at=(x, side * 1.0, 0.34))
            body.cyl(0.018, 0.018, 0.4, pal['steel'], at=(x, side * 1.2, 0.34), rot=(math.pi / 2, 0, 0), n=6)
    body.build(root)

    su = Part('zirhli-kopru')
    u = pal['upper']
    # Baş üst yapı: basamaklı köprü, sonra dikme, sonra bacalar.
    su.box((1.5, 1.2, 0.36), u, at=(0.72, 0, main + 0.18))
    su.box((0.88, 1.0, 0.3), u, at=(0.92, 0, main + 0.5))
    su.box((0.5, 1.2, 0.05), pal['deck'], at=(1.05, 0, main + 0.68))
    su.box((0.5, 0.74, 0.22), u, at=(0.98, 0, main + 0.8))
    su.box((0.34, 0.86, 0.1), pal['dark'], at=(1.2, 0, main + 0.86))
    # Üç ayaklı direk ve gözcü platformu.
    top = Vector((0.5, 0, main + 2.05))
    for at in ((0.8, 0.36), (0.8, -0.36), (0.12, 0.0)):
        su.limb((at[0], at[1], main + 0.4), top, 0.03, 0.024, pal['steel'], n=6)
    su.cyl(0.26, 0.2, 0.2, u, at=(top.x, 0, top.z + 0.08), n=10)
    su.cyl(0.14, 0.14, 0.1, pal['dark'], at=(top.x, 0, top.z + 0.2), n=10)
    su.cyl(0.014, 0.008, 0.9, pal['steel'], at=(top.x, 0, top.z + 0.7), n=5)
    # Ara yapı, filikalar, ikinci direk.
    su.box((3.4, 1.06, 0.26), u, at=(-1.2, 0, main + 0.13))
    for k in range(3):
        for side in (-1, 1):
            su.ball((0.34, 0.1, 0.07), pal['boat'], at=(-2.1 + k * 0.72, side * 0.62, main + 0.36), n=9, stacks=5)
    su.box((0.8, 0.64, 0.36), u, at=(-3.15, 0, main + 0.2))
    su.limb((-3.1, 0.0, main + 0.3), (-3.15, 0, main + 1.65), 0.03, 0.018, pal['steel'], n=6)
    su.limb((-3.4, 0.28, main + 0.3), (-3.15, 0, main + 1.35), 0.02, 0.016, pal['steel'], n=5)
    su.limb((-3.4, -0.28, main + 0.3), (-3.15, 0, main + 1.35), 0.02, 0.016, pal['steel'], n=5)
    for side in (-1, 1):
        su.cyl(0.05, 0.05, 0.14, pal['steel'], at=(0.45, side * 0.5, main + 0.5), rot=(0, math.pi / 2, 0), n=8)
    tower = su.build(root, bevel=0.012)
    # Üst yapı yükseltilir: gerçek oranda üstten bakınca gemi düz bir levhaya dönüyordu.
    tower.scale = (1.0, 1.0, 1.42)
    tower.location = (0, 0, -main * 0.42)

    funnels = Part('zirhli-baca')
    for x in (-0.3, -1.45):
        funnels.loft([(0.0, 0, 0, 0.32, 0.22), (1.3, -0.1, 0, 0.32, 0.22)], pal['funnel'],
                     xf_at(x, main + 0.26), n=12)
        funnels.loft([(1.3, -0.1, 0, 0.34, 0.24), (1.42, -0.11, 0, 0.34, 0.24)], pal['cap'],
                     xf_at(x, main + 0.26), n=12)
    funnels.build(root)

    turrets = [
        turret('zk-a', pal, root, (4.0, 0, fore + 0.02), 0.0),
        turret('zk-b', pal, root, (2.82, 0, fore + 0.32), 0.0),
        turret('zk-x', pal, root, (-3.9, 0, aft + 0.28), math.pi),
        turret('zk-y', pal, root, (-5.0, 0, aft + 0.02), math.pi),
    ]
    barbette = Part('zirhli-barbet')
    barbette.cyl(0.42, 0.42, 0.34, u, at=(2.82, 0, fore + 0.14), n=14)
    barbette.cyl(0.42, 0.42, 0.28, u, at=(-3.9, 0, aft + 0.13), n=14)
    barbette.build(root)

    stacks = [Stack('zirhli-is0', root, (-0.42, 0, main + 1.72), size=1.3, seed=31),
              Stack('zirhli-is1', root, (-1.57, 0, main + 1.72), size=1.3, seed=37)]
    bow = foam_band('zirhli-dalga', pal, root, 11.6, 0.98)

    def pose(anim, t):
        root.location = (0, 0, 0.012 * wave(t))
        roll = 0.012 * wave(t + 0.2) if anim != 'walk' else 0.016 * wave(t)
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (roll, 0.006 * wave(t + 0.4), root.rotation_euler.z)
        bow.hide_render = anim != 'walk'
        bow.scale = (1.0, 1.0 + 0.04 * wave(t * 2), 1.0 + 0.3 * wave(t * 2 + 0.25))
        steaming = anim == 'walk'
        for i, s in enumerate(stacks):
            s.step(t + i * 0.3, steaming)
        for k, tur in enumerate(turrets):
            if anim == 'fire':
                # Borda ateşi: kuleler aynı yöne döner, salvo kule kule yayılır.
                rot(tur['pivot'], z=1.32 if tur['home'] == 0 else 1.32)
                rot(tur['guns'], y=-0.22)
                tur['flash'].step(t)
            else:
                rot(tur['pivot'], z=tur['home'])
                rot(tur['guns'], y=-0.05)
                tur['flash'].rest()

    return {**META, 'root': root, 'pose': pose, 'muzzles': [t['flash'].anchor for t in turrets]}


def xf_at(x, z):
    from .kit import xf
    return xf((x, 0, z))
