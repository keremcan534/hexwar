# Sahra topu ve üç kişilik mürettebat: kalkanlı 75 mm, ahşap tekerlek, kutu kundak.
# Yürüyüşte top kundağından çekilir (namlu geride); ateşte namlu geri teper, kundak sıçrar.
import math

from .effects import Muzzle
from .kit import Part, Vector, empty, material, rot, smooth, solve_arm, wave
from .soldier import FORE_ARM, UPPER_ARM, build_soldier, palette, pose_leg

META = {'worldSize': 46.0, 'span': 6.4, 'focus': 0.7, 'glow': 30.0}
WHEEL_R = 0.66


def gun_palette():
    return {
        'paint': material('top', (0.5, 0.5, 0.47), rough=0.6, mask=0.86, grain=0.24, grain_scale=22, ao=0.6, mud=0.5, mud_top=0.8),
        'dark': material('namlu2', (0.05, 0.05, 0.05), rough=0.34, metal=0.9),
        'wood': material('tahta', (0.13, 0.075, 0.035), rough=0.65, grain=0.3, grain_scale=16, mud=0.45, mud_top=0.7),
        'iron': material('demir', (0.05, 0.048, 0.045), rough=0.5, metal=0.8),
        'brass': material('pirinc', (0.62, 0.42, 0.13), rough=0.3, metal=1.0),
        'crate': material('sandik', (0.15, 0.12, 0.07), rough=0.85, mask=0.4, grain=0.3, grain_scale=14, ao=0.5),
    }


def wheel(name, pal, parent, at):
    p = Part(name)
    half = math.pi / 2
    p.band(WHEEL_R, WHEEL_R - 0.03, 0.085, pal['iron'], rot=(half, 0, 0))
    p.band(WHEEL_R - 0.03, WHEEL_R - 0.11, 0.095, pal['wood'], rot=(half, 0, 0))
    # İç boşluk için göbek ve parmaklar ayrı çubuktur; tekerlek dönerken gözle görülür.
    for k in range(12):
        a = math.tau * k / 12
        p.box((0.045, 0.05, WHEEL_R - 0.12), pal['wood'],
              at=(math.sin(a) * (WHEEL_R / 2), 0, math.cos(a) * (WHEEL_R / 2)), rot=(0, a, 0))
    p.cyl(0.12, 0.12, 0.2, pal['wood'], rot=(half, 0, 0), n=12)
    p.cyl(0.06, 0.06, 0.26, pal['iron'], rot=(half, 0, 0), n=10)
    return p.build(parent, at=at)


def build_gun(parent):
    pal = gun_palette()
    rig = empty('top', parent)
    axle = Part('top-dingil')
    axle.cyl(0.05, 0.05, 1.5, pal['iron'], rot=(math.pi / 2, 0, 0), n=10)
    # Kundak: iki kiriş dingilden yere iner, sonunda tırnak.
    for side in (-1, 1):
        axle.box((2.5, 0.11, 0.16), pal['paint'], at=(-1.2, side * 0.2 * 0.55, -0.26), rot=(0, 0.31, 0),
                 taper=(1, 0.9))
    axle.box((0.3, 0.32, 0.06), pal['paint'], at=(-0.75, 0, -0.08), rot=(0, 0.31, 0))
    axle.box((0.3, 0.4, 0.12), pal['iron'], at=(-2.34, 0, -0.64), rot=(0, 0.31, 0))
    axle.box((0.12, 0.34, 0.26), pal['iron'], at=(-2.46, 0, -0.76), rot=(0, 0.05, 0))
    axle.box((0.26, 0.36, 0.03), pal['wood'], at=(-1.3, 0, 0.14), rot=(0, 0.31, 0))
    # Kalkan: düz levha değil, ortası kesik, kenarları kıvrık.
    for side in (-1, 1):
        axle.box((0.022, 0.5, 1.1), pal['paint'], at=(0.26, side * 0.37, 0.28), rot=(0, -0.15, 0))
        axle.box((0.022, 0.1, 1.08), pal['paint'], at=(0.25, side * 0.66, 0.28), rot=(side * 0.0, -0.15, side * 0.5))
    axle.box((0.022, 0.26, 0.34), pal['paint'], at=(0.2, 0, -0.1), rot=(0, -0.15, 0))
    axle.box((0.022, 1.3, 0.07), pal['paint'], at=(0.355, 0, 0.84), rot=(0, -0.15, 0))
    frame = axle.build(rig, at=(0, 0, WHEEL_R))
    wheels = (wheel('top-tekerL', pal, frame, (0, 0.72, 0)), wheel('top-tekerR', pal, frame, (0, -0.72, 0)))

    tube = Part('top-namlu')
    tube.cyl(0.105, 0.085, 0.56, pal['dark'], at=(0.15, 0, 0), rot=(0, math.pi / 2, 0), n=14)
    tube.cyl(0.062, 0.052, 1.8, pal['dark'], at=(1.1, 0, 0), rot=(0, math.pi / 2, 0), n=12)
    tube.cyl(0.07, 0.07, 0.08, pal['dark'], at=(2.0, 0, 0), rot=(0, math.pi / 2, 0), n=12)
    tube.box((0.5, 0.16, 0.16), pal['dark'], at=(-0.28, 0, 0))
    tube.cyl(0.04, 0.04, 0.2, pal['brass'], at=(-0.6, 0, 0.0), rot=(0, math.pi / 2, 0), n=8)
    barrel = tube.build(frame, at=(0.0, 0, 0.36))
    rot(barrel, y=-0.13)
    # Geri tepme silindiri namlunun altında sabit durur, namlu onun üstünde kayar.
    cradle = Part('top-besik')
    cradle.cyl(0.075, 0.075, 1.5, pal['paint'], at=(0.45, 0, -0.14), rot=(0, math.pi / 2, 0), n=12)
    cradle.box((1.1, 0.2, 0.1), pal['paint'], at=(0.0, 0, -0.08))
    cradle_ob = cradle.build(frame, at=(0.0, 0, 0.36))
    rot(cradle_ob, y=-0.13)
    flash = Muzzle('top-ates', barrel, (2.1, 0, 0), size=1.2, puffs=5, seed=9)

    box = Part('top-sandik')
    box.box((0.62, 0.4, 0.32), pal['crate'], at=(0, 0, 0.16))
    box.box((0.64, 0.42, 0.04), pal['wood'], at=(0, 0, 0.33))
    for dy in (-0.11, 0.11):
        box.cyl(0.05, 0.05, 0.1, pal['brass'], at=(0.1, dy, 0.4), n=8)
    box.build(rig, at=(-1.62, -1.1, 0))
    return {'rig': rig, 'frame': frame, 'wheels': wheels, 'barrel': barrel, 'flash': flash}


def set_crew(fig, at, heading, lean):
    fig['root'].location = at
    fig['root'].rotation_mode = 'XYZ'
    fig['root'].rotation_euler = (0, 0, heading)
    rot(fig['torso'], y=lean)
    fig['slung'].hide_render = True
    fig['held'].hide_render = True
    fig['flash'].rest()


def step_legs(fig, t, amp=0.4, base=0.1):
    s = wave(t)
    pose_leg(fig['legs']['L'], base + amp * s, 0.2 + 0.7 * max(0, math.cos(math.tau * t)) ** 1.4, 0.2)
    pose_leg(fig['legs']['R'], base - amp * s, 0.2 + 0.7 * max(0, -math.cos(math.tau * t)) ** 1.4, 0.2)
    fig['pelvis'].location = (0, 0, 0.91 + 0.015 * math.cos(math.tau * t * 2))


def kneel(fig):
    fig['pelvis'].location = (0, 0, 0.6)
    pose_leg(fig['legs']['L'], 1.2, 1.5, 0.3, 0.1)
    pose_leg(fig['legs']['R'], -0.1, 1.72, 0.9, -0.1)


def arms_to(fig, left, right, pole_l=(-0.3, 0.8, -0.6), pole_r=(-0.3, -0.8, -0.6)):
    up, lo = fig['arms']['L']
    solve_arm(up, lo, left, pole_l, UPPER_ARM, FORE_ARM)
    up, lo = fig['arms']['R']
    solve_arm(up, lo, right, pole_r, UPPER_ARM, FORE_ARM)


def build():
    pal = palette()
    root = empty('batarya')
    gun = build_gun(root)
    crew = [build_soldier(f'topcu{i}', pal, root, role='crew') for i in range(3)]

    def pose(anim, t):
        frame, rig = gun['frame'], gun['rig']
        spin = 0.0
        if anim == 'walk':
            # Top kundağından çekilir: namlu arkada kalır, kundak el yüksekliğine kalkar.
            rig.location = (-0.9, 0, 0)
            rig.rotation_mode = 'XYZ'
            rig.rotation_euler = (0, 0, math.pi)
            rot(frame, y=-0.3)
            spin = t * math.tau
            rot(gun['barrel'], y=-0.13)
            gun['barrel'].location = (0, 0, 0.36)
            gun['flash'].rest()
            for i, fig in enumerate(crew[:2]):
                side = -1 if i else 1
                set_crew(fig, (1.82, side * 0.42, 0), 0.0, 0.42)
                step_legs(fig, t + i * 0.5)
                arms_to(fig, (0.42, -side * 0.16 + 0.2, 0.16), (0.42, -side * 0.16 - 0.2, 0.16))
                rot(fig['head'], y=-0.2)
            fig = crew[2]
            set_crew(fig, (-3.0, 0.92, 0), 0.0, 0.5)
            step_legs(fig, t + 0.25)
            arms_to(fig, (0.46, 0.2, 0.26), (0.46, -0.2, 0.26))
            rot(fig['head'], y=-0.2)
        else:
            rig.location = (0, 0, 0)
            rig.rotation_mode = 'XYZ'
            rig.rotation_euler = (0, 0, 0)
            rot(frame, y=0.0)
            kick = 0.0
            hop = 0.0
            if anim == 'fire':
                kick = smooth(0.1, 0.16, t) * (1 - smooth(0.24, 0.72, t))
                hop = smooth(0.1, 0.16, t) * (1 - smooth(0.22, 0.42, t))
                gun['flash'].step(t)
            else:
                gun['flash'].rest()
            gun['barrel'].location = (-0.5 * kick * math.cos(0.13), 0, 0.36 - 0.5 * kick * math.sin(0.13))
            rig.location = (-0.14 * hop, 0, 0.05 * hop)
            rot(frame, y=-0.05 * hop)

            # Nişancı kundağın solunda diz çökmüş, nişangâha bakar.
            aimer = crew[0]
            set_crew(aimer, (-0.42, 0.56, 0), 0.08, 0.34)
            kneel(aimer)
            rot(aimer['head'], y=0.2 - 0.25 * kick)
            arms_to(aimer, (0.36, -0.28, 0.1), (0.34, -0.42, 0.22))
            # Yükleyici mermiyi sağ yanda hazır tutar, geri tepmede başını çevirir.
            loader = crew[1]
            set_crew(loader, (-0.72, -0.72, 0), 0.5, 0.2 + 0.1 * kick)
            pose_leg(loader['legs']['L'], 0.3, 0.42, 0.1, 0.06)
            pose_leg(loader['legs']['R'], -0.2, 0.2, 0.08, -0.06)
            loader['pelvis'].location = (0, 0, 0.87)
            sway = 0.012 * wave(t)
            arms_to(loader, (0.34, 0.16, 0.08 + sway), (0.34, -0.16, 0.08 + sway))
            rot(loader['head'], z=-0.5 * kick, y=0.1)
            # Komutan geride ayakta, dürbünle bakar.
            chief = crew[2]
            set_crew(chief, (-1.75, 0.92, 0), -0.1, 0.03)
            pose_leg(chief['legs']['L'], 0.08, 0.12, 0.04, 0.04)
            pose_leg(chief['legs']['R'], -0.06, 0.1, -0.02, -0.04)
            chief['pelvis'].location = (0, 0, 0.925)
            rot(chief['head'], z=0.22 * wave(t * 0.5) if anim == 'idle' else 0.0)
            if anim == 'fire':
                arms_to(chief, (0.32, 0.1, 0.4), (0.32, -0.1, 0.4))
            else:
                arms_to(chief, (0.02, 0.3, -0.18), (0.03, -0.3, -0.18), (-1, 0.3, 0), (-1, -0.3, 0))
        rot(gun['wheels'][0], y=spin)
        rot(gun['wheels'][1], y=spin)

    return {**META, 'root': root, 'pose': pose, 'muzzles': [gun['flash'].anchor]}
