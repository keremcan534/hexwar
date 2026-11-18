# Süvari: at + binici. Yürüyüş tırıstır (çapraz bacak çiftleri), ateşte binici karabinayla nişan alır.
import math

from .kit import Part, Vector, empty, material, rot, smooth, solve_arm, wave
from .soldier import FORE_ARM, UPPER_ARM, build_soldier, palette, pose_leg

META = {'worldSize': 41.0, 'span': 4.4, 'focus': 1.12, 'glow': 12.0}


def horse_palette():
    return {
        'coat': material('don', (0.05, 0.022, 0.011), rough=0.42, grain=0.14, grain_scale=14, sheen=0.1),
        'dark': material('yele', (0.018, 0.014, 0.012), rough=0.7),
        'leg': material('bacak', (0.022, 0.014, 0.01), rough=0.5, grain=0.2, grain_scale=20),
        'hoof': material('toynak', (0.02, 0.018, 0.016), rough=0.4),
        'tack': material('kosum', (0.085, 0.045, 0.02), rough=0.45),
        'cloth': material('haso', (0.58, 0.58, 0.55), rough=0.95, mask=1.0, grain=0.2, grain_scale=60),
        'metal': material('uzengi', (0.45, 0.42, 0.34), rough=0.35, metal=0.9),
        'roll': material('heybe', (0.27, 0.24, 0.17), rough=0.95, mask=0.3, grain=0.25, grain_scale=50),
        'eye': material('goz', (0.005, 0.004, 0.004), rough=0.12),
    }


def build_horse(parent):
    pal = horse_palette()
    root = empty('at', parent, (0, 0, 0))
    body = Part('at-govde')
    body.spine([(-0.86, 0, 1.22, 0.12, 0.13), (-0.74, 0, 1.25, 0.29, 0.25), (-0.42, 0, 1.25, 0.34, 0.31),
                (0.02, 0, 1.17, 0.33, 0.3), (0.4, 0, 1.2, 0.32, 0.27), (0.68, 0, 1.25, 0.25, 0.21),
                (0.84, 0, 1.3, 0.1, 0.12)], pal['coat'], n=14)
    # Sağrı ve omuz kası: düz fıçıyı at gövdesine çeviren iki kabartı.
    for side in (-1, 1):
        body.ball((0.3, 0.1, 0.3), pal['coat'], at=(-0.56, side * 0.2, 1.22), n=12, stacks=8)
        body.ball((0.2, 0.09, 0.3), pal['coat'], at=(0.52, side * 0.18, 1.14), n=12, stacks=8)
    # Eyer takımı: haşa, eyer, kolan, heybe. Haşa gövdenin eğrisine oturur, levha gibi durmaz.
    cloth = []
    for x in (-0.42, 0.28):
        ring = []
        for k in range(14):
            a = -0.42 + (math.pi + 0.84) * k / 13
            ring.append(Vector((x, 0.345 * math.cos(a), 1.2 + 0.365 * math.sin(a))))
        cloth.append(ring)
    body.rings(cloth, pal['cloth'])
    body.spine([(-0.34, 0, 1.54, 0.03, 0.34), (0.0, 0, 1.53, 0.03, 0.36), (0.3, 0, 1.53, 0.03, 0.33)],
               pal['tack'], n=10)
    for side in (-1, 1):
        body.box((0.22, 0.07, 0.2), pal['roll'], at=(-0.58, side * 0.3, 1.36))
        body.box((0.05, 0.02, 0.5), pal['tack'], at=(0.16, side * 0.31, 1.22), rot=(side * 0.12, 0, 0))
    body.spine([(-0.3, 0, 1.6, 0.1, 0.13), (-0.04, 0, 1.56, 0.06, 0.16), (0.18, 0, 1.6, 0.12, 0.12),
                (0.26, 0, 1.69, 0.05, 0.05)], pal['tack'], n=10)
    body.cyl(0.075, 0.075, 0.6, pal['roll'], at=(-0.48, 0, 1.63), rot=(math.pi / 2, 0, 0), n=10)
    torso = body.build(root)

    neck = Part('at-boyun')
    neck.spine([(-0.1, 0, -0.16, 0.26, 0.15), (0.14, 0, 0.14, 0.2, 0.1), (0.32, 0, 0.42, 0.14, 0.075),
                (0.4, 0, 0.58, 0.12, 0.07)], pal['coat'], n=12)
    # Yele boyun boyunca dik durur.
    neck.spine([(-0.16, 0, 0.1, 0.05, 0.02), (0.06, 0, 0.36, 0.08, 0.022), (0.26, 0, 0.62, 0.07, 0.02),
                (0.33, 0, 0.74, 0.03, 0.016)], pal['dark'], n=8)
    neck_ob = neck.build(torso, at=(0.66, 0, 1.46))

    head = Part('at-bas')
    head.spine([(-0.02, 0, 0.0, 0.1, 0.075), (0.14, 0, -0.1, 0.115, 0.08), (0.32, 0, -0.24, 0.085, 0.06),
                (0.46, 0, -0.35, 0.06, 0.05), (0.51, 0, -0.39, 0.03, 0.03)], pal['coat'], n=11)
    for side in (-1, 1):
        head.limb((-0.02, side * 0.05, 0.09), (-0.05, side * 0.07, 0.24), 0.028, 0.008, pal['coat'], n=6)
        head.ball(0.02, pal['eye'], at=(0.14, side * 0.078, -0.03), n=8, stacks=5)
        head.box((0.012, 0.012, 0.2), pal['tack'], at=(0.26, side * 0.068, -0.2), rot=(0, 0.5, 0))
    head.spine([(0.42, 0, -0.26, 0.015, 0.075), (0.42, 0, -0.42, 0.015, 0.075)], pal['tack'], n=8)
    head.box((0.1, 0.13, 0.015), pal['tack'], at=(0.1, 0, 0.11), rot=(0, 0.6, 0))
    head_ob = head.build(neck_ob, at=(0.42, 0, 0.62))

    tail = Part('at-kuyruk')
    tail.spine([(0, 0, 0, 0.05, 0.05), (-0.1, 0, -0.14, 0.075, 0.07), (-0.16, 0, -0.5, 0.075, 0.065),
                (-0.18, 0, -0.92, 0.045, 0.03)], pal['dark'], n=8)
    tail_ob = tail.build(torso, at=(-0.86, 0, 1.36))

    legs = {}
    for tag, x, side, kind in (('FL', 0.56, 1, 'f'), ('FR', 0.56, -1, 'f'), ('HL', -0.62, 1, 'h'), ('HR', -0.62, -1, 'h')):
        z = 1.02 if kind == 'f' else 1.08
        up_len = 0.46 if kind == 'f' else 0.44
        lo_len = 0.40 if kind == 'f' else 0.46
        up = Part(f'at-ust{tag}')
        up.limb((0, 0, 0), (0, 0, -up_len), 0.105 if kind == 'f' else 0.13, 0.05, pal['coat'], n=9)
        upper = up.build(torso, at=(x, side * 0.17, z))
        lo = Part(f'at-alt{tag}')
        lo.limb((0, 0, 0), (0, 0, -lo_len), 0.056, 0.04, pal['leg'], n=8)
        lower = lo.build(upper, at=(0, 0, -up_len))
        ft = Part(f'at-toynak{tag}')
        ft.limb((0, 0, 0), (0.03, 0, -0.1), 0.04, 0.046, pal['leg'], n=8)
        ft.cyl(0.075, 0.062, 0.075, pal['hoof'], at=(0.045, 0, -0.145), n=10)
        foot = ft.build(lower, at=(0, 0, -lo_len))
        legs[tag] = (upper, lower, foot, kind)
    return {'root': root, 'body': torso, 'neck': neck_ob, 'head': head_ob, 'tail': tail_ob, 'legs': legs}


def pose_horse(h, anim, t):
    legs = h['legs']
    if anim == 'walk':
        # Tırıs: çapraz çiftler aynı anda iner, gövde adım başına iki kez yaylanır.
        for tag, phase in (('FL', 0.0), ('HR', 0.0), ('FR', 0.5), ('HL', 0.5)):
            upper, lower, foot, kind = legs[tag]
            s = wave(t + phase)
            lift = max(0.0, math.cos(math.tau * (t + phase)))
            if kind == 'f':
                rot(upper, y=-0.5 * s - 0.04)
                rot(lower, y=-1.25 * lift ** 1.5)
                rot(foot, y=0.6 * lift)
            else:
                rot(upper, y=-0.48 * s + 0.2)
                rot(lower, y=-0.38 + 1.0 * lift ** 1.4 * -1.0 * -0.5)
                rot(foot, y=0.35)
        h['root'].location = (0, 0, 0.022 * math.cos(math.tau * t * 2))
        rot(h['body'], y=0.022 * wave(t * 2 + 0.2))
        rot(h['neck'], y=0.07 * wave(t * 2 + 0.05))
        rot(h['head'], y=-0.05 * wave(t * 2))
        rot(h['tail'], y=-0.25 + 0.12 * wave(t * 2), x=0.14 * wave(t))
    elif anim == 'idle':
        for tag in legs:
            upper, lower, foot, kind = legs[tag]
            rot(upper, y=0.0 if kind == 'f' else 0.2)
            rot(lower, y=0.0 if kind == 'f' else -0.38)
            rot(foot, y=0.0 if kind == 'f' else 0.2)
        # Dinlenen at: tek arka ayak gevşer, baş ağır ağır iner kalkar, kuyruk sinek kovar.
        u, l, f, _ = legs['HL']
        rot(u, y=0.26)
        rot(l, y=-0.62)
        rot(f, y=0.5)
        h['root'].location = (0, 0, 0)
        rot(h['body'], y=0.006 * wave(t))
        rot(h['neck'], y=0.1 + 0.05 * wave(t), z=0.09 * wave(t * 0.5))
        rot(h['head'], y=0.05 * wave(t + 0.2))
        rot(h['tail'], x=0.34 * wave(t * 2) * smooth(0.3, 0.5, t) * (1 - smooth(0.7, 0.9, t)), y=-0.08)
    else:
        # Ateş anında at ürker: kısa bir geri çekiliş, kulak ve baş yukarı.
        startle = smooth(0.14, 0.24, t) * (1 - smooth(0.34, 0.86, t))
        for tag in legs:
            upper, lower, foot, kind = legs[tag]
            front = kind == 'f'
            rot(upper, y=(-0.14 * startle if front else 0.2 + 0.1 * startle))
            rot(lower, y=(0.0 if front else -0.38))
            rot(foot, y=(0.0 if front else 0.2))
        h['root'].location = (-0.05 * startle, 0, 0.012 * startle)
        rot(h['body'], y=-0.05 * startle)
        rot(h['neck'], y=-0.2 * startle, z=0.1 * startle)
        rot(h['head'], y=-0.12 * startle)
        rot(h['tail'], y=-0.3 * startle)


def build():
    pal = palette()
    root = empty('suvari')
    horse = build_horse(root)
    fig = build_soldier('binici', pal, horse['body'], role='rider')
    fig['root'].location = (-0.1, 0, 0.72)

    def pose(anim, t):
        pose_horse(horse, anim, t)
        pelvis = fig['pelvis']
        bounce = 0.03 * math.cos(math.tau * t * 2) if anim == 'walk' else 0.0
        pelvis.location = (0.02, 0, 0.93 + bounce)
        for tag, side in (('L', 1), ('R', -1)):
            # Üzengide bacak: uyluk öne ve yana açık, baldır atın yanına iner.
            pose_leg(fig['legs'][tag], 0.68, 0.72, 0.16, side * 0.34)
        fig['slung'].hide_render = anim == 'fire'
        fig['held'].hide_render = anim != 'fire'
        rein = (0.42, 0.02, 0.1 + bounce * 0.5)
        if anim == 'fire':
            kick = smooth(0.1, 0.16, t) * (1 - smooth(0.2, 0.46, t))
            fig['flash'].step(t)
            rot(pelvis, z=0.42)
            rot(fig['torso'], y=0.12 - 0.04 * kick, z=-0.34)
            rot(fig['head'], y=0.18, z=-0.08)
            grip = Vector((0.2 - 0.05 * kick, -0.2, 0.335 + 0.012 * kick))
            held = fig['held']
            held.location = grip
            rot(held, x=-0.03, y=-0.05 - 0.1 * kick, z=0.32)
            up, lo = fig['arms']['R']
            solve_arm(up, lo, grip + Vector((-0.02, 0, -0.02)), (-0.4, -1.0, -0.8), UPPER_ARM, FORE_ARM)
            up, lo = fig['arms']['L']
            fore = grip + Vector((0.36 * math.cos(0.32), 0.36 * math.sin(0.32), 0.02 - 0.05 * kick))
            solve_arm(up, lo, fore, (0.1, 0.9, -1.0), UPPER_ARM, FORE_ARM)
            return
        fig['flash'].rest()
        rot(pelvis, x=0.0)
        lean = 0.14 if anim == 'walk' else 0.03
        rot(fig['torso'], y=lean + 0.03 * wave(t * 2), z=0.04 * wave(t) if anim == 'idle' else 0.0)
        rot(fig['head'], y=-0.06, z=0.2 * wave(t * 0.5) if anim == 'idle' else 0.0)
        for tag, side in (('L', 1), ('R', -1)):
            up, lo = fig['arms'][tag]
            solve_arm(up, lo, (rein[0], side * 0.1, rein[2]), (-0.7, side * 0.6, -0.8), UPPER_ARM, FORE_ARM)

    return {**META, 'root': root, 'pose': pose, 'muzzles': [fig['flash'].anchor]}
