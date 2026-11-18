# Piyade eri: 1910'ların yünlü kaputu, dolgulu tozluk, çelik miğfer, sürgülü tüfek.
# Eklemler rijit parçadır; kollar tüfeğe IK ile bağlanır, böylece geri tepme ele geçer.
import math

from .effects import Muzzle
from .kit import Part, Vector, empty, material, rot, smooth, solve_arm, wave

UPPER_ARM = 0.30
FORE_ARM = 0.285
THIGH = 0.42
SHIN = 0.40


def palette():
    """Üniforma nötr gridir; ülke rengi maskeyle çarpılır."""
    return {
        'wool': material('yun', (0.56, 0.56, 0.54), rough=0.92, mask=1.0, grain=0.22,
                         grain_scale=90, bump=0.25, sheen=0.5, ao=0.45),
        'wool2': material('yun2', (0.47, 0.47, 0.45), rough=0.95, mask=1.0, grain=0.24,
                          grain_scale=70, bump=0.3, sheen=0.4, ao=0.45, mud=0.5, mud_top=0.5),
        'puttee': material('tozluk', (0.42, 0.40, 0.35), rough=0.95, mask=0.55, grain=0.2,
                           grain_scale=120, bump=0.4),
        'steel': material('celik', (0.34, 0.35, 0.33), rough=0.52, metal=0.35, mask=0.72,
                          grain=0.2, grain_scale=30, bump=0.1),
        'leather': material('deri', (0.17, 0.10, 0.055), rough=0.5, grain=0.2, grain_scale=40),
        'boot': material('cizme', (0.075, 0.055, 0.04), rough=0.45, grain=0.3, grain_scale=30),
        'skin': material('ten', (0.40, 0.25, 0.17), rough=0.6, grain=0.07, grain_scale=30),
        'canvas': material('kanvas', (0.30, 0.27, 0.19), rough=0.95, mask=0.32, grain=0.22,
                           grain_scale=70, bump=0.3),
        'blanket': material('battaniye', (0.30, 0.27, 0.22), rough=1.0, mask=0.5, grain=0.3,
                            grain_scale=50, bump=0.5),
        'gun': material('namlu', (0.05, 0.05, 0.055), rough=0.36, metal=0.9),
        'wood': material('kundak', (0.21, 0.105, 0.045), rough=0.42, grain=0.3, grain_scale=24),
        'tin': material('matara', (0.13, 0.125, 0.09), rough=0.72, grain=0.25),
    }


def rifle_mesh(name, pal, parent, bayonet=True):
    """Dipçik -X, namlu +X; köken tetik kavrama noktası."""
    p = Part(name)
    w = pal['wood']
    g = pal['gun']
    # Dipçik ve kundak tek çizgi: boynu inceltilmiş bir av tüfeği silueti.
    stations = [
        (-0.42, -0.075, 0.018, 0.058), (-0.30, -0.055, 0.018, 0.045),
        (-0.12, -0.02, 0.017, 0.028), (-0.04, -0.01, 0.019, 0.03),
        (0.14, 0.0, 0.02, 0.026), (0.42, 0.004, 0.017, 0.02), (0.60, 0.006, 0.014, 0.016),
    ]
    rings = []
    for x, z, ry, rz in stations:
        ring = []
        for k in range(8):
            a = math.tau * k / 8
            ring.append(Vector((x, math.cos(a) * ry, z + math.sin(a) * rz)))
        rings.append(ring)
    p.rings(rings, w)
    p.box((0.2, 0.024, 0.036), g, at=(0.06, 0, 0.03))
    p.cyl(0.0085, 0.0085, 0.72, g, at=(0.42, 0, 0.042), rot=(0, math.pi / 2, 0), n=7)
    p.box((0.014, 0.05, 0.012), g, at=(0.05, 0.03, 0.05))
    p.ball(0.011, g, at=(0.05, 0.056, 0.05), n=6, stacks=4)
    p.box((0.02, 0.012, 0.04), g, at=(0.015, 0, -0.03))
    p.box((0.05, 0.022, 0.05), g, at=(0.1, 0, -0.035))
    p.box((0.015, 0.03, 0.02), g, at=(0.6, 0, 0.0))
    if bayonet:
        p.box((0.24, 0.005, 0.018), material('sungu', (0.24, 0.24, 0.25), rough=0.4, metal=0.8),
              at=(0.88, 0, 0.03))
    return p.build(parent, bevel=0.002)


def build_soldier(name='er', pal=None, parent=None, role='infantry'):
    """role: infantry (tam teçhizat), rider (süvari: çizme, kasket, karabina), crew (topçu)."""
    pal = pal or palette()
    root = empty(name, parent)
    laden = role == 'infantry'

    # --- Kalça ve etek ---
    hips = Part(f'{name}-kalca')
    hips.loft([(-0.10, 0, 0, 0.115, 0.165), (0.0, 0, 0, 0.135, 0.18), (0.10, 0, 0, 0.13, 0.17)],
              pal['wool2'], n=12)
    # Kaput eteği: diz üstüne dek iner, önden hafif açık.
    hips.loft([(-0.34, 0.01, 0, 0.205, 0.235), (-0.20, 0.0, 0, 0.175, 0.215),
               (-0.04, 0, 0, 0.152, 0.195), (0.12, 0, 0, 0.142, 0.182)],
              pal['wool'], n=14, cap0=False, cap1=False)
    hips.loft([(0.075, 0, 0, 0.153, 0.193), (0.135, 0, 0, 0.153, 0.193)], pal['leather'], n=14)
    hips.box((0.03, 0.055, 0.05), pal['tin'], at=(0.16, 0, 0.105))
    for side in (-1, 1):
        hips.box((0.065, 0.095, 0.085), pal['leather'], at=(0.145, side * 0.095, 0.07))
    hips.ball((0.05, 0.075, 0.095), pal['tin'], at=(-0.02, 0.215, -0.02))
    if laden:
        hips.box((0.13, 0.05, 0.16), pal['canvas'], at=(-0.06, -0.215, -0.05))
    if role == 'rider':
        # Süvari kılıcı sol kalçadan geriye iner.
        hips.cyl(0.018, 0.014, 0.92, pal['gun'], at=(-0.2, 0.235, -0.3), rot=(0.05, -0.62, 0), n=7)
        hips.box((0.03, 0.05, 0.13), pal['tin'], at=(0.08, 0.225, 0.08), rot=(0, -0.62, 0))
    pelvis = hips.build(root, at=(0, 0, 0.93))

    # --- Gövde, sırt çantası, battaniye rulosu ---
    chest = Part(f'{name}-govde')
    chest.loft([(0.0, 0, 0, 0.135, 0.178), (0.14, 0.005, 0, 0.155, 0.2), (0.28, 0.0, 0, 0.158, 0.222),
                (0.385, -0.01, 0, 0.115, 0.215), (0.44, -0.012, 0, 0.065, 0.11),
                (0.47, -0.012, 0, 0.052, 0.062)], pal['wool'], n=14)
    # Kaput yakası.
    chest.loft([(0.42, -0.012, 0, 0.082, 0.095), (0.49, -0.012, 0, 0.074, 0.08)], pal['wool2'], n=12)
    # Çapraz askı kayışları göğüste kesişir.
    for side in (-1, 1):
        chest.box((0.014, 0.038, 0.46), pal['leather'], at=(0.156, side * 0.085, 0.22),
                  rot=(side * 0.26, -0.03, 0))
        chest.box((0.014, 0.038, 0.40), pal['leather'], at=(-0.158, side * 0.09, 0.23),
                  rot=(-side * 0.22, 0.05, 0))
    for z in (0.3, 0.2, 0.1):
        chest.ball(0.009, pal['tin'], at=(0.16, 0, z), n=6, stacks=4)
    if laden:
        pack = (-0.245, 0, 0.215)
        chest.box((0.15, 0.31, 0.33), pal['canvas'], at=pack, taper=(0.92, 0.96))
        chest.box((0.02, 0.27, 0.13), pal['canvas'], at=(-0.33, 0, 0.26))
        for side in (-1, 1):
            chest.box((0.17, 0.022, 0.012), pal['leather'], at=(-0.245, side * 0.09, 0.3))
        chest.cyl(0.072, 0.072, 0.46, pal['blanket'], at=(-0.235, 0, 0.445), rot=(math.pi / 2, 0, 0), n=11)
        chest.cyl(0.042, 0.042, 0.09, pal['tin'], at=(-0.33, 0.0, 0.1), rot=(0, math.pi / 2, 0), n=10)
        chest.box((0.024, 0.024, 0.34), pal['wood'], at=(-0.335, 0.13, 0.17), rot=(0.1, 0, 0))
        chest.box((0.05, 0.1, 0.13), pal['tin'], at=(-0.335, 0.13, 0.03))
    else:
        # Rulo battaniye çapraz: sırt çantasız kolların tek yükü.
        chest.cyl(0.05, 0.05, 0.56, pal['blanket'], at=(0.0, 0.0, 0.3), rot=(0.72, 0, 0), n=9)
    torso = chest.build(pelvis, at=(0, 0, 0.10))

    # --- Baş ve miğfer ---
    skull = Part(f'{name}-bas')
    skull.cyl(0.052, 0.056, 0.1, pal['skin'], at=(0.005, 0, 0.03), n=10)
    skull.ball((0.098, 0.083, 0.114), pal['skin'], at=(0.018, 0, 0.14), n=14, stacks=9)
    skull.box((0.03, 0.02, 0.042), pal['skin'], at=(0.118, 0, 0.13), taper=(0.6, 0.7))
    skull.ball((0.03, 0.018, 0.03), pal['skin'], at=(0.0, 0.084, 0.135), n=7, stacks=5)
    skull.ball((0.03, 0.018, 0.03), pal['skin'], at=(0.0, -0.084, 0.135), n=7, stacks=5)
    skull.box((0.04, 0.09, 0.012), pal['boot'], at=(0.105, 0, 0.158))
    if role == 'rider':
        # Kasket: düz tepe, kısa siperlik. Süvariyi uzaktan piyadeden ayırır.
        skull.loft([(0.19, 0.0, 0, 0.112, 0.1), (0.212, 0.0, 0, 0.124, 0.112),
                    (0.236, -0.008, 0, 0.148, 0.134), (0.246, -0.008, 0, 0.128, 0.116)], pal['wool'], n=16)
        skull.loft([(0.19, 0.0, 0, 0.116, 0.104), (0.215, 0.0, 0, 0.116, 0.104)], pal['leather'], n=16)
        skull.box((0.09, 0.15, 0.012), pal['boot'], at=(0.135, 0, 0.192), rot=(0, 0.22, 0))
    else:
        skull.loft([(0.178, 0.005, 0, 0.128, 0.114), (0.215, 0.005, 0, 0.126, 0.112),
                    (0.262, 0.0, 0, 0.102, 0.092), (0.292, -0.004, 0, 0.056, 0.05),
                    (0.302, -0.006, 0, 0.012, 0.012)], pal['steel'], n=16)
        # Geniş kenar: en güçlü siluet işareti, üstten bakınca kimliği o verir.
        skull.loft([(0.158, 0.012, 0, 0.17, 0.152), (0.172, 0.01, 0, 0.158, 0.142),
                    (0.18, 0.008, 0, 0.135, 0.12)], pal['steel'], n=18)
    skull.box((0.02, 0.008, 0.11), pal['leather'], at=(0.05, 0.088, 0.1), rot=(0, 0.2, 0))
    skull.box((0.02, 0.008, 0.11), pal['leather'], at=(0.05, -0.088, 0.1), rot=(0, 0.2, 0))
    head = skull.build(torso, at=(-0.008, 0, 0.455))

    # --- Kollar ---
    arms = {}
    for tag, side in (('R', -1), ('L', 1)):
        up = Part(f'{name}-ust{tag}')
        up.limb((0, 0, 0), (0, 0, -UPPER_ARM), 0.064, 0.052, pal['wool'])
        up.box((0.1, 0.09, 0.02), pal['wool2'], at=(0, side * 0.01, 0.045))
        upper = up.build(torso, at=(-0.005, side * 0.262, 0.355))
        lo = Part(f'{name}-alt{tag}')
        lo.limb((0, 0, 0), (0, 0, -FORE_ARM + 0.02), 0.051, 0.041, pal['wool'])
        lo.cyl(0.05, 0.047, 0.05, pal['wool2'], at=(0, 0, -FORE_ARM + 0.055), n=10)
        lo.ball((0.042, 0.032, 0.056), pal['skin'], at=(0, 0, -FORE_ARM - 0.02), n=9, stacks=6)
        lower = lo.build(upper, at=(0, 0, -UPPER_ARM))
        arms[tag] = (upper, lower)

    # --- Bacaklar ---
    legs = {}
    for tag, side in (('R', -1), ('L', 1)):
        th = Part(f'{name}-but{tag}')
        th.limb((0, 0, 0), (0, 0, -THIGH), 0.098, 0.066, pal['wool2'])
        thigh = th.build(pelvis, at=(0, side * 0.098, -0.06))
        sh = Part(f'{name}-baldir{tag}')
        if role == 'rider':
            sh.limb((0, 0, 0), (0, 0, -SHIN + 0.03), 0.068, 0.05, pal['boot'])
        else:
            sh.limb((0, 0, 0), (0, 0, -SHIN + 0.03), 0.064, 0.044, pal['puttee'])
            # Dolgulu tozluk sargısı: spiral kıvrım silueti tırtıklar.
            for k in range(7):
                z = -0.09 - k * 0.042
                r = 0.067 - k * 0.0028
                sh.cyl(r, r, 0.018, pal['puttee'], at=(0.002, 0, z), rot=(0.18, 0, 0), n=10)
        shin = sh.build(thigh, at=(0, 0, -THIGH))
        ft = Part(f'{name}-ayak{tag}')
        ft.loft([(-0.05, 0.05, 0, 0.13, 0.058), (-0.015, 0.045, 0, 0.125, 0.055),
                 (0.03, 0.01, 0, 0.078, 0.05), (0.08, 0.0, 0, 0.05, 0.045)], pal['boot'], n=12)
        ft.box((0.28, 0.1, 0.022), pal['boot'], at=(0.05, 0, -0.06))
        foot = ft.build(shin, at=(0, 0, -SHIN))
        legs[tag] = (thigh, shin, foot)

    # İki tüfek: yürürken omuzda, ateşte elde. Biri görünür, ötekinin görüntüsü kapanır.
    slung = rifle_mesh(f'{name}-omuz', pal, torso, bayonet=laden)
    slung.location = (-0.18, -0.2, 0.2)
    rot(slung, x=0.1, y=-1.28, z=0.0)
    held = rifle_mesh(f'{name}-el', pal, torso, bayonet=laden)
    flash = Muzzle(f'{name}-ates', held, (0.8 if not laden else 1.0, 0, 0.042), size=0.62, puffs=3, seed=4)

    return {
        'root': root, 'pelvis': pelvis, 'torso': torso, 'head': head, 'arms': arms, 'legs': legs,
        'slung': slung, 'held': held, 'flash': flash, 'pal': pal,
    }


def pose_leg(leg, hip, knee, foot_pitch, splay=0.0):
    thigh, shin, foot = leg
    rot(thigh, x=splay, y=-hip)
    rot(shin, y=knee)
    rot(foot, y=foot_pitch)


def leg_height(hip, knee):
    return THIGH * math.cos(hip) + SHIN * math.cos(hip - knee)


def strap_hand(fig, bob=0.0):
    """Sağ el kayışı tutar, sol kol serbest: yürüyüş kolu öteki eli sallar."""
    up, lo = fig['arms']['R']
    solve_arm(up, lo, (0.17, -0.18, 0.19 + bob), (-0.45, -0.35, -1.0), UPPER_ARM, FORE_ARM)


def pose_idle(fig, t):
    fig['slung'].hide_render = False
    fig['held'].hide_render = True
    fig['flash'].rest()
    breath = wave(t)
    shift = wave(t * 0.5 + 0.1)
    fig['pelvis'].location = (0, 0.012 * shift, 0.93 - 0.003 * breath)
    rot(fig['pelvis'], x=0.018 * shift)
    rot(fig['torso'], x=-0.012 * shift, y=0.05 + 0.012 * breath)
    rot(fig['head'], y=0.03, z=0.16 * math.sin(math.tau * t * 0.5))
    pose_leg(fig['legs']['L'], 0.05, 0.1, 0.05, 0.03)
    pose_leg(fig['legs']['R'], -0.04, 0.08, -0.04, -0.03)
    strap_hand(fig, 0.006 * breath)
    up, lo = fig['arms']['L']
    solve_arm(up, lo, (0.05 + 0.006 * breath, 0.3, -0.19), (-1.0, 0.25, 0.0), UPPER_ARM, FORE_ARM)


def pose_walk(fig, t):
    fig['slung'].hide_render = False
    fig['held'].hide_render = True
    fig['flash'].rest()
    # Yüklü piyade adımı: gövde öne yatık, adım kısa ve ağır.
    def leg(phase):
        s = wave(phase)
        swing = math.cos(math.tau * phase)
        hip = 0.08 + 0.46 * s
        knee = 0.16 + 0.82 * max(0.0, swing) ** 1.4
        return hip, knee
    hl, kl = leg(t)
    hr, kr = leg(t + 0.5)
    # Kalça yüksekliği basan bacaktan: ayak zeminde kalır, sürtünerek kaymaz.
    drop = max(leg_height(hl, kl), leg_height(hr, kr))
    fig['pelvis'].location = (0.03, 0.012 * wave(t + 0.25), drop + 0.112)
    rot(fig['pelvis'], x=-0.03 * wave(t + 0.25), z=0.1 * wave(t))
    rot(fig['torso'], x=0.03 * wave(t + 0.25), y=0.16 + 0.03 * wave(t * 2 + 0.2), z=-0.15 * wave(t))
    rot(fig['head'], y=-0.1, z=0.05 * wave(t))
    pose_leg(fig['legs']['L'], hl, kl, 0.5 * max(0, -wave(t)) + (kl - hl) * 0.55)
    pose_leg(fig['legs']['R'], hr, kr, 0.5 * max(0, -wave(t + 0.5)) + (kr - hr) * 0.55)
    strap_hand(fig, 0.01 * wave(t * 2))
    swing = wave(t + 0.5)
    up, lo = fig['arms']['L']
    solve_arm(up, lo, (0.1 + 0.26 * swing, 0.3, -0.17 + 0.07 * abs(swing)), (-1.0, 0.3, -0.1),
              UPPER_ARM, FORE_ARM)


def pose_fire(fig, t):
    fig['slung'].hide_render = True
    fig['held'].hide_render = False
    # Sahne: nişan → ateş → geri tepme → sürgü → yeniden nişan.
    kick = smooth(0.1, 0.16, t) * (1 - smooth(0.2, 0.46, t))
    bolt = smooth(0.46, 0.58, t) * (1 - smooth(0.68, 0.84, t))
    fig['flash'].step(t)
    fig['pelvis'].location = (-0.02 - 0.012 * kick, 0, 0.885)
    rot(fig['pelvis'], z=0.38)
    rot(fig['torso'], y=0.15 - 0.04 * kick, z=-0.3)
    rot(fig['head'], y=0.2 - 0.03 * kick, z=-0.1)
    pose_leg(fig['legs']['L'], 0.5, 0.42, -0.08, 0.1)
    pose_leg(fig['legs']['R'], -0.34, 0.2, 0.14, -0.08)
    # Tüfek omuzun önünde durur; geri tepme onu geri ve hafif yukarı iter.
    grip = Vector((0.2 - 0.05 * kick, -0.2 + 0.02 * bolt, 0.335 + 0.012 * kick - 0.015 * bolt))
    held = fig['held']
    held.location = grip
    rot(held, x=-0.03, y=-0.07 - 0.1 * kick + 0.05 * bolt, z=0.32)
    right = grip + Vector((-0.02, 0.0, -0.02)) + Vector((0.06, 0.05, 0.06)) * bolt
    fore = grip + Vector((0.42 * math.cos(0.32), 0.42 * math.sin(0.32), 0.03 - 0.1 * kick * 0.42))
    up, lo = fig['arms']['R']
    solve_arm(up, lo, right, (-0.4, -1.0, -0.8), UPPER_ARM, FORE_ARM)
    up, lo = fig['arms']['L']
    solve_arm(up, lo, fore, (0.1, 0.9, -1.0), UPPER_ARM, FORE_ARM)


def pose(fig, anim, t):
    {'idle': pose_idle, 'walk': pose_walk, 'fire': pose_fire}[anim](fig, t)
