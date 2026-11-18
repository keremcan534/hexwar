# Asker nakliye vapuru: dik baş, yüksek borda, ortada köprü, tek uzun baca, yük bumbaları.
# Kıçta tek savunma topu vardır: savaş yıllarında ticaret gemilerine konan türden.
import math

from .effects import Muzzle
from .kit import Part, Vector, empty, foam_material, material, rot, smooth, wave, xf
from .navy import Stack, foam_band

META = {'worldSize': 48.0, 'span': 12.0, 'focus': 0.72, 'glow': 14.0, 'backdrop': (0.09, 0.2, 0.28)}


def build():
    pal = {
        'hull': material('nk-borda', (0.3, 0.31, 0.32), rough=0.62, mask=0.82, grain=0.26, grain_scale=5, ao=0.6),
        'lower': material('nk-alt', (0.1, 0.035, 0.028), rough=0.7),
        'white': material('nk-beyaz', (0.55, 0.52, 0.44), rough=0.6, grain=0.18, grain_scale=9, ao=0.7),
        'deck': material('nk-guverte', (0.32, 0.26, 0.17), rough=0.8, grain=0.25, grain_scale=36),
        'hatch': material('nk-ambar', (0.12, 0.13, 0.1), rough=0.95, mask=0.35, grain=0.3, grain_scale=22),
        'funnel': material('nk-baca', (0.42, 0.4, 0.36), rough=0.55, mask=0.95),
        'cap': material('nk-uc', (0.012, 0.012, 0.012), rough=0.7),
        'steel': material('nk-celik', (0.09, 0.09, 0.09), rough=0.5, metal=0.7),
        'dark': material('nk-koyu', (0.015, 0.016, 0.018), rough=0.7),
        'boat': material('nk-filika', (0.82, 0.8, 0.72), rough=0.6),
        'crate': material('nk-sandik', (0.3, 0.22, 0.12), rough=0.85, grain=0.25, grain_scale=12),
        'foam': foam_material('kopuk3'),
    }
    root = empty('nakliye')
    high = 0.98
    well = 0.78
    keel = -0.5
    stations = [
        (-4.95, 0.3, high - 0.1, -0.1), (-4.8, 0.62, high - 0.1, keel), (-4.2, 0.82, high - 0.1, keel),
        (-3.1, 0.88, high - 0.1, keel), (-3.05, 0.88, well, keel), (-1.2, 0.9, well, keel),
        (-1.15, 0.9, high, keel), (1.2, 0.9, high, keel), (1.25, 0.9, well, keel), (3.0, 0.82, well, keel),
        (3.05, 0.8, high + 0.1, keel), (4.2, 0.45, high + 0.14, keel * 0.8), (4.9, 0.04, high + 0.2, keel * 0.5),
    ]
    body = Part('nk-govde')
    body.hull(stations, pal['hull'], pal['deck'])
    body.hull([(x, b * 1.008, 0.16, 0.0) for x, b, _, _ in stations], pal['lower'])
    for side in (-1, 1):
        for k in range(16):
            body.ball(0.024, pal['dark'], at=(-3.4 + k * 0.48, side * 0.89, 0.64), n=6, stacks=4)
    # Ambar kapakları ve güverte yükü.
    for x in (-2.1, 2.2):
        body.box((1.3, 0.92, 0.16), pal['hatch'], at=(x, 0, well + 0.08))
        for k in range(5):
            body.box((0.03, 0.94, 0.02), pal['dark'], at=(x - 0.56 + k * 0.28, 0, well + 0.165))
    body.box((0.5, 0.42, 0.3), pal['crate'], at=(2.2, 0.16, well + 0.32))
    body.box((0.36, 0.32, 0.22), pal['crate'], at=(1.95, -0.2, well + 0.27))
    body.box((0.7, 0.34, 0.26), pal['crate'], at=(-2.3, -0.12, well + 0.29))
    body.build(root)

    su = Part('nk-kopru')
    w = pal['white']
    su.box((2.3, 1.56, 0.42), w, at=(0, 0, high + 0.21), taper=(0.98, 0.96))
    su.box((1.6, 1.34, 0.36), w, at=(0.2, 0, high + 0.6))
    su.box((0.74, 1.72, 0.05), pal['deck'], at=(0.68, 0, high + 0.81))
    su.box((0.62, 1.0, 0.26), w, at=(0.68, 0, high + 0.95))
    su.box((0.16, 0.96, 0.08), pal['dark'], at=(0.98, 0, high + 1.0))
    su.box((0.6, 0.74, 0.06), w, at=(0.68, 0, high + 1.11))
    for x in (-0.9, 0.1, 0.9):
        for side in (-1, 1):
            su.ball((0.09, 0.05, 0.05), pal['dark'], at=(x, side * 0.79, high + 0.2), n=8, stacks=5)
    # Filikalar: beyaz yapının üstünde, mataforalarla.
    for x in (-0.65, 0.05):
        for side in (-1, 1):
            su.ball((0.34, 0.11, 0.09), pal['boat'], at=(x, side * 0.74, high + 0.92), n=10, stacks=6)
            su.limb((x - 0.2, side * 0.64, high + 0.78), (x - 0.2, side * 0.8, high + 1.14), 0.012, 0.01, pal['steel'], n=5)
            su.limb((x + 0.2, side * 0.64, high + 0.78), (x + 0.2, side * 0.8, high + 1.14), 0.012, 0.01, pal['steel'], n=5)
    su.build(root, bevel=0.012)

    fun = Part('nk-baca')
    at = xf((-0.45, 0, high + 0.8))
    fun.loft([(0.0, 0, 0, 0.3, 0.24), (1.12, -0.1, 0, 0.3, 0.24)], pal['funnel'], at, n=14)
    fun.loft([(1.12, -0.1, 0, 0.32, 0.26), (1.26, -0.12, 0, 0.32, 0.26)], pal['cap'], at, n=14)
    fun.loft([(0.56, -0.05, 0, 0.312, 0.252), (0.7, -0.062, 0, 0.312, 0.252)], pal['white'], at, n=14)
    fun.build(root)

    rig = Part('nk-direk')
    s = pal['steel']
    for x, base in ((-2.8, high - 0.1), (2.82, high + 0.1)):
        rig.limb((x, 0, base), (x, 0, base + 2.1), 0.05, 0.022, s, n=7)
        rig.box((0.05, 0.9, 0.05), s, at=(x, 0, base + 0.95))
        for side in (-1, 1):
            rig.limb((x, side * 0.4, base + 0.95), (x + (1.0 if x < 0 else -1.0), side * 0.44, base + 0.2), 0.02, 0.016, s, n=5)
            rig.limb((x, side * 0.4, base + 1.6), (x + (1.0 if x < 0 else -1.0), side * 0.44, base + 0.2), 0.007, 0.007, s, n=4)
    rig.limb((-2.8, 0, high + 2.0), (0.4, 0, high + 1.62), 0.006, 0.006, s, n=4)
    rig.limb((2.82, 0, high + 2.15), (0.4, 0, high + 1.62), 0.006, 0.006, s, n=4)
    rig.limb((0.4, 0, high + 1.05), (0.4, 0, high + 2.0), 0.022, 0.012, s, n=5)
    rig.build(root)

    # Kıç savunma topu.
    mount = empty('nk-kaide', root, (-4.15, 0, high - 0.08))
    g = Part('nk-top')
    g.cyl(0.12, 0.15, 0.2, s, at=(0, 0, 0.1), n=10)
    g.box((0.3, 0.3, 0.2), pal['hull'], at=(0, 0, 0.28))
    g.build(mount)
    tube = Part('nk-namlu')
    tube.cyl(0.03, 0.022, 0.8, s, at=(0.42, 0, 0), rot=(0, math.pi / 2, 0), n=8)
    barrel = tube.build(mount, at=(0.0, 0, 0.3))
    flash = Muzzle('nk-ates', barrel, (0.86, 0, 0), size=1.0, puffs=4, seed=23)

    smoke = Stack('nk-is', root, (-0.6, 0, high + 2.1), size=1.2, seed=29)
    bow = foam_band('nk-dalga', pal, root, 9.5, 0.88)

    def pose(anim, t):
        root.location = (0, 0, 0.018 * wave(t))
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (0.018 * wave(t + 0.2), 0.008 * wave(t + 0.45), root.rotation_euler.z)
        bow.hide_render = anim != 'walk'
        bow.scale = (1.0, 1.0 + 0.04 * wave(t * 2), 1.0 + 0.3 * wave(t * 2 + 0.25))
        smoke.step(t, anim == 'walk')
        if anim == 'fire':
            rot(mount, z=2.4)
            rot(barrel, y=-0.2)
            flash.step(t)
        else:
            rot(mount, z=math.pi)
            rot(barrel, y=-0.06)
            flash.rest()

    return {**META, 'root': root, 'pose': pose, 'muzzles': [flash.anchor]}
