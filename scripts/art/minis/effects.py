# Namlu alevi ve barut dumanı: bütün silahların ortak ateş efekti.
#
# Atlasta alevin kendisi durur: beyaz sıcak çekirdek ve turuncu diller. Yanında gerçek bir
# nokta ışık yanar; atıcıyı ve silahı o kare aydınlatır. Hale atlasa pişirilmez (hücrede opak
# bir disk olurdu): oyun onu namlu konumuna eklemeli ışık olarak basar (miniatures.js).
import math
import random

import bpy

from .kit import Part, Vector, empty, glow_material, rot, smoke_material

# Ateş döngüsünde alevin yandığı an: 6 karelik döngüde 1. ve 2. kareye düşer.
FIRE_AT = 0.16
FLASH_SPAN = 0.2
# Fazlası atıcıyı ve atı beyaza yakıyordu.
LIGHT_POWER = 130.0


class Muzzle:
    """Namlunun ucuna bağlı alev + duman. `step(phase)` ateş anına göre sürer."""

    def __init__(self, name, parent, at, size=1.0, puffs=4, seed=1, drift=(1.0, 0.0, 0.32),
                 smoke=(0.62, 0.6, 0.56), light=True):
        rng = random.Random(seed)
        self.size = size
        self.drift = Vector(drift)
        self.anchor = empty(f'{name}-agiz', parent, at)
        tongue = glow_material(f'{name}-alev', (1.0, 0.3, 0.04), 9.0)
        hot = glow_material(f'{name}-oz', (1.0, 0.74, 0.36), 34.0)

        flame = Part(f'{name}-alev')
        # Ana dil namlu ekseninde uzar, kısa diller yana açılır: tek koni çizgi film gibi durur.
        for i in range(9):
            forward = i < 4
            spread = 0.16 if forward else 0.5
            a = rng.uniform(-spread, spread)
            b = rng.uniform(-spread, spread)
            length = rng.uniform(0.62, 1.05) * size if forward else rng.uniform(0.16, 0.3) * size
            tip = Vector((length * math.cos(a) * math.cos(b), length * math.sin(a), length * math.sin(b)))
            flame.limb((0, 0, 0), tip, (0.075 if forward else 0.045) * size, 0.008 * size, tongue, n=7)
        self.flame = flame.build(self.anchor)

        core = Part(f'{name}-oz')
        core.ball((0.17 * size, 0.06 * size, 0.06 * size), hot, at=(0.12 * size, 0, 0), n=12, stacks=8)
        core.limb((0, 0, 0), (0.5 * size, 0, 0), 0.05 * size, 0.012 * size, hot, n=8)
        self.core = core.build(self.anchor)

        self.glows = (self.flame, self.core)
        for ob in self.glows:
            ob.hide_render = True
            ob.visible_shadow = False

        self.light = None
        if light:
            data = bpy.data.lights.new(f'{name}-isik', 'POINT')
            data.color = (1.0, 0.58, 0.24)
            data.shadow_soft_size = 0.12 * size
            data.energy = LIGHT_POWER * size * size
            # Işık gölge düşürmez: gölge alıcı zeminde kama biçimli koyu leke bırakıyordu.
            data.use_shadow = False
            self.light = bpy.data.objects.new(f'{name}-isik', data)
            bpy.context.scene.collection.objects.link(self.light)
            self.light.parent = self.anchor
            self.light.location = (0.3 * size, 0, 0)
            self.light.hide_render = True

        self.puffs = []
        grey = smoke_material(f'{name}-duman', smoke)
        for i in range(puffs):
            p = Part(f'{name}-duman{i}')
            p.ball((0.22, 0.2, 0.2), grey, n=12, stacks=8)
            ob = p.build(self.anchor)
            ob.hide_render = True
            ob.visible_shadow = False
            ob['yon'] = (rng.uniform(0.7, 1.3), rng.uniform(-0.35, 0.35), rng.uniform(-0.1, 0.5))
            ob['gec'] = i * 0.09
            self.puffs.append(ob)

    def rest(self):
        for ob in self.glows:
            ob.hide_render = True
        if self.light:
            self.light.hide_render = True
        for ob in self.puffs:
            ob.hide_render = True

    def step(self, phase, fire_at=FIRE_AT):
        """phase: ateş döngüsü [0, 1). fire_at anında alev, sonrasında yükselen duman."""
        since = (phase - fire_at) % 1.0
        lit = since < FLASH_SPAN
        for ob in self.glows:
            ob.hide_render = not lit
        if self.light:
            self.light.hide_render = not lit
        if lit:
            peak = since < 0.1
            power = 1.0 if peak else 0.42
            scale = 1.0 if peak else 0.72
            self.flame.scale = (scale, scale, scale)
            self.core.scale = (scale, scale, scale)
            self.flame.color = (1, 1, 1, 0.95 * power + 0.05)
            self.core.color = (1, 1, 1, power)
            if self.light:
                self.light.data.energy = LIGHT_POWER * self.size * self.size * power
            rot(self.flame, x=since * 20)
        for ob in self.puffs:
            age = (since - ob['gec']) / 0.72
            if age < 0 or age >= 1:
                ob.hide_render = True
                continue
            ob.hide_render = False
            spread = Vector(ob['yon'])
            ob.location = (spread * (0.2 + age * 0.62) + self.drift * age * 0.34) * self.size
            scale = (0.5 + age * 1.5) * self.size
            ob.scale = (scale, scale, scale)
            ob.color = (1, 1, 1, (1 - age) ** 1.7 * 0.8)
