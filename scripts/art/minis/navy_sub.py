# Okyanus denizaltısı: su üstünde seyir hâli. Silindir gövde suya gömülü, üstte dar güverte,
# kulecik, güverte topu, ağ kesici. Ölçek: 1 birim ≈ 9 m.
import math

from .effects import Muzzle
from .kit import Part, Vector, empty, foam_material, material, rot, smooth, wave, xf
from .navy import Stack, foam_band

META = {'worldSize': 44.0, 'span': 10.4, 'focus': 0.3, 'glow': 16.0, 'backdrop': (0.09, 0.2, 0.28)}


def build():
    pal = {
        'hull': material('dz-govde', (0.32, 0.35, 0.36), rough=0.52, mask=0.82, grain=0.26, grain_scale=6, ao=0.6),
        'deck': material('dz-guverte', (0.2, 0.2, 0.19), rough=0.78, mask=0.3, grain=0.25, grain_scale=30),
        'steel': material('dz-celik', (0.07, 0.075, 0.08), rough=0.42, metal=0.8),
        'dark': material('dz-koyu', (0.012, 0.013, 0.015), rough=0.7),
        'rust': material('dz-pas', (0.2, 0.09, 0.05), rough=0.9, grain=0.4, grain_scale=9),
        'foam': foam_material('kopuk2'),
    }
    root = empty('denizalti')
    body = Part('dz-govde')
    # Basınç gövdesi su çizgisinin hemen üstüne çıkar; balast tankları bordayı şişirir.
    body.spine([(-4.1, 0, 0.04, 0.05, 0.05), (-3.6, 0, 0.1, 0.2, 0.22), (-2.2, 0, 0.13, 0.33, 0.5),
                (0.0, 0, 0.14, 0.36, 0.58), (2.2, 0, 0.13, 0.33, 0.48), (3.5, 0, 0.14, 0.21, 0.24),
                (4.25, 0, 0.22, 0.05, 0.04)], pal['hull'], n=14)
    for x0, x1 in ((-2.6, -0.8), (0.9, 2.5)):
        for side in (-1, 1):
            body.box((x1 - x0, 0.03, 0.05), pal['rust'], at=((x0 + x1) / 2, side * 0.52, 0.07))
    # Dar üst güverte: gövdeden yüksekte, delikli kaplama.
    body.box((6.6, 0.42, 0.06), pal['deck'], at=(0.0, 0, 0.5))
    body.box((1.3, 0.2, 0.05), pal['deck'], at=(3.75, 0, 0.42), rot=(0, 0.07, 0))
    for k in range(26):
        body.box((0.05, 0.3, 0.01), pal['dark'], at=(-3.0 + k * 0.24, 0, 0.535))
    # Baş dalgakıran ve ağ kesici testere.
    body.limb((3.2, 0, 0.5), (4.3, 0, 0.92), 0.022, 0.01, pal['steel'], n=6)
    for k in range(4):
        body.box((0.14, 0.015, 0.09), pal['steel'], at=(3.55 + k * 0.2, 0, 0.72 + k * 0.08), rot=(0, 0.35, 0))
    tower = Part('dz-kule')
    # Kulecik: akışkan kesitli, köprü üstü açık, önde rüzgârlık.
    tower.loft([(0.0, 0, 0, 0.72, 0.3), (0.42, 0.06, 0, 0.66, 0.28), (0.62, 0.08, 0, 0.58, 0.25)],
               pal['hull'], xf((0, 0, 0.52)), n=14, power=2.6)
    tower.box((0.82, 0.32, 0.03), pal['dark'], at=(0.04, 0, 1.13))
    tower.box((0.12, 0.34, 0.14), pal['hull'], at=(0.62, 0, 1.2), rot=(0, 0.5, 0))
    # Periskoplar ve şnorkel direği: siluetin kimliği.
    for x, h in ((-0.14, 1.05), (0.1, 0.8)):
        tower.cyl(0.024, 0.018, h, pal['steel'], at=(x, 0, 1.15 + h / 2), n=7)
    tower.limb((0.32, 0.0, 1.12), (0.4, 0.0, 1.9), 0.013, 0.01, pal['steel'], n=5)
    tower.box((0.45, 0.04, 0.12), pal['dark'], at=(0.3, 0.3, 0.86))
    tower.box((0.45, 0.04, 0.12), pal['dark'], at=(0.3, -0.3, 0.86))
    tower.build(root, bevel=0.01)

    # Güverte topu kuleciğin önünde.
    mount = empty('dz-kaide', root, (1.4, 0, 0.55))
    gun = Part('dz-top')
    gun.cyl(0.1, 0.13, 0.22, pal['steel'], at=(0, 0, 0.11), n=10)
    gun.box((0.2, 0.05, 0.24), pal['steel'], at=(0, 0.12, 0.26))
    gun.box((0.2, 0.05, 0.24), pal['steel'], at=(0, -0.12, 0.26))
    gun.build(mount)
    tube = Part('dz-namlu')
    tube.cyl(0.05, 0.05, 0.3, pal['steel'], at=(0, 0, 0), rot=(0, math.pi / 2, 0), n=9)
    tube.cyl(0.03, 0.022, 0.95, pal['steel'], at=(0.55, 0, 0), rot=(0, math.pi / 2, 0), n=8)
    barrel = tube.build(mount, at=(0.0, 0, 0.32))
    rot(barrel, y=-0.1)
    flash = Muzzle('dz-ates', barrel, (1.05, 0, 0), size=1.1, puffs=4, seed=17)
    bow = foam_band('dz-dalga', pal, root, 8.4, 0.6)
    fume = Stack('dz-egzoz', root, (-1.2, 0, 0.5), size=0.55, seed=41)
    body.build(root)

    def pose(anim, t):
        root.location = (0, 0, 0.02 * wave(t) - 0.02)
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (0.02 * wave(t + 0.1), 0.012 * wave(t + 0.35), root.rotation_euler.z)
        bow.hide_render = anim == 'idle'
        bow.scale = (1.0, 1.0 + 0.05 * wave(t * 2), 1.0 + 0.35 * wave(t * 2 + 0.25))
        fume.step(t, anim == 'walk')
        if anim == 'fire':
            kick = smooth(0.1, 0.16, t) * (1 - smooth(0.24, 0.6, t))
            barrel.location = (-0.14 * kick, 0, 0.32)
            rot(mount, z=0.7)
            rot(barrel, y=-0.22)
            flash.step(t)
        else:
            barrel.location = (0, 0, 0.32)
            rot(mount, z=0.0)
            rot(barrel, y=-0.1)
            flash.rest()

    return {**META, 'root': root, 'pose': pose, 'muzzles': [flash.anchor]}
