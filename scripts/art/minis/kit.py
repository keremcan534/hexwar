# Minyatür atölyesi: düşük poligonlu parça ilkelleri, malzemeler, iki kemikli IK.
#
# Her parça rijit bir nesnedir ve eklemine bağlanır; deri giydirme yok. Bu ölçekte
# (figür ~60 piksel) iskelet deformasyonu görünmez, ama kumaş/metal ayrımı görünür.
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector


def xf(at=(0, 0, 0), rot=(0, 0, 0)):
    return Matrix.Translation(Vector(at)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()


# --- Malzemeler ---------------------------------------------------------------


def pass_group():
    """Bütün malzemelerin ortak anahtarı: 0 = güzellik geçişi, 1 = renk maskesi."""
    tree = bpy.data.node_groups.get('gecis')
    if tree:
        return tree
    tree = bpy.data.node_groups.new('gecis', 'ShaderNodeTree')
    tree.interface.new_socket('deger', in_out='OUTPUT', socket_type='NodeSocketFloat')
    value = tree.nodes.new('ShaderNodeValue')
    value.name = 'v'
    value.outputs[0].default_value = 0.0
    out = tree.nodes.new('NodeGroupOutput')
    tree.links.new(value.outputs[0], out.inputs[0])
    return tree


def set_pass(mask):
    pass_group().nodes['v'].outputs[0].default_value = 1.0 if mask else 0.0


def weather(nt, color, ao, mud, mud_top):
    """Kullanılmışlık: girintiler kararır, alt kısımlara çamur biner. Düz boya oyuncak gibi durur."""
    out = color
    if ao:
        node = nt.nodes.new('ShaderNodeAmbientOcclusion')
        node.inputs['Distance'].default_value = 0.35
        node.samples = 6
        remap = nt.nodes.new('ShaderNodeMapRange')
        remap.inputs['To Min'].default_value = 1.0 - ao
        remap.inputs['To Max'].default_value = 1.0
        nt.links.new(node.outputs['AO'], remap.inputs['Value'])
        scale = nt.nodes.new('ShaderNodeVectorMath')
        scale.operation = 'SCALE'
        nt.links.new(out, scale.inputs[0])
        nt.links.new(remap.outputs[0], scale.inputs['Scale'])
        out = scale.outputs[0]
    if mud:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        split = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Position'], split.inputs[0])
        level = nt.nodes.new('ShaderNodeMapRange')
        level.inputs['From Min'].default_value = mud_top
        level.inputs['From Max'].default_value = 0.0
        level.inputs['To Min'].default_value = 0.0
        level.inputs['To Max'].default_value = mud
        nt.links.new(split.outputs['Z'], level.inputs['Value'])
        keep = nt.nodes.new('ShaderNodeMath')
        keep.operation = 'SUBTRACT'
        keep.inputs[0].default_value = 1.0
        nt.links.new(level.outputs[0], keep.inputs[1])
        clean = nt.nodes.new('ShaderNodeVectorMath')
        clean.operation = 'SCALE'
        nt.links.new(out, clean.inputs[0])
        nt.links.new(keep.outputs[0], clean.inputs['Scale'])
        dirt = nt.nodes.new('ShaderNodeVectorMath')
        dirt.operation = 'SCALE'
        dirt.inputs[0].default_value = (0.1, 0.082, 0.055)
        nt.links.new(level.outputs[0], dirt.inputs['Scale'])
        total = nt.nodes.new('ShaderNodeVectorMath')
        total.operation = 'ADD'
        nt.links.new(clean.outputs[0], total.inputs[0])
        nt.links.new(dirt.outputs[0], total.inputs[1])
        out = total.outputs[0]
    return out


def material(name, color, rough=0.7, metal=0.0, mask=0.0, grain=0.0, grain_scale=60.0,
             bump=0.0, sheen=0.0, spec=0.5, ao=0.0, mud=0.0, mud_top=1.0):
    """PBR malzeme + maske çıkışı.

    `mask` ülke renginin bu yüzeye ne kadar işleyeceğidir. `grain` albedoya düşük
    frekanslı kirlilik katar: tek renk yüzey sayaç gibi durur, solmuş kumaş gibi değil.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Specular IOR Level'].default_value = spec
    if sheen:
        bsdf.inputs['Sheen Weight'].default_value = sheen
    base = (*color, 1.0)
    bsdf.inputs['Base Color'].default_value = base
    if grain or bump:
        coord = nt.nodes.new('ShaderNodeTexCoord')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = grain_scale
        noise.inputs['Detail'].default_value = 5.0
        noise.inputs['Roughness'].default_value = 0.6
        nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    if grain:
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.28
        ramp.color_ramp.elements[0].color = (*(c * (1 - grain) for c in color), 1)
        ramp.color_ramp.elements[1].position = 0.72
        ramp.color_ramp.elements[1].color = (*(min(1.0, c * (1 + grain * 0.6)) for c in color), 1)
        nt.links.new(noise.outputs[0], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], bsdf.inputs['Base Color'])
    if ao or mud:
        source = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].is_linked else None
        if source is None:
            flat = nt.nodes.new('ShaderNodeRGB')
            flat.outputs[0].default_value = base
            source = flat.outputs[0]
        nt.links.new(weather(nt, source, ao, mud, mud_top), bsdf.inputs['Base Color'])
    if bump:
        bmp = nt.nodes.new('ShaderNodeBump')
        bmp.inputs['Strength'].default_value = bump
        bmp.inputs['Distance'].default_value = 0.01
        nt.links.new(noise.outputs[0], bmp.inputs['Height'])
        nt.links.new(bmp.outputs[0], bsdf.inputs['Normal'])
    finish(nt, bsdf.outputs[0], mask)
    return mat


def finish(nt, shader, mask):
    """Maske geçişinde yüzey ışıksız düz değer yayar: kenar örtüsü güzellikle aynı kalır."""
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (mask, mask, mask, 1)
    emit.inputs['Strength'].default_value = 1.0
    group = nt.nodes.new('ShaderNodeGroup')
    group.node_tree = pass_group()
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(group.outputs[0], mix.inputs[0])
    nt.links.new(shader, mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(mix.outputs[0], out.inputs['Surface'])


def glow_material(name, color, strength):
    """Namlu alevi: merkezde yoğun, kenarda erir. Saydamlık nesne alfa kanalından."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    nt.links.new(geo.outputs['Incoming'], dot.inputs[1])
    power = nt.nodes.new('ShaderNodeMath')
    power.operation = 'POWER'
    power.inputs[1].default_value = 1.8
    absv = nt.nodes.new('ShaderNodeMath')
    absv.operation = 'ABSOLUTE'
    nt.links.new(dot.outputs['Value'], absv.inputs[0])
    nt.links.new(absv.outputs[0], power.inputs[0])
    info = nt.nodes.new('ShaderNodeObjectInfo')
    fade = nt.nodes.new('ShaderNodeMath')
    fade.operation = 'MULTIPLY'
    nt.links.new(power.outputs[0], fade.inputs[0])
    nt.links.new(info.outputs['Alpha'], fade.inputs[1])
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*color, 1)
    emit.inputs['Strength'].default_value = strength
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fade.outputs[0], mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    finish_veil(nt, mix.outputs[0], fade.outputs[0])
    return mat


def foam_material(name):
    """Köpük: gürültüyle parçalanmış beyaz; düz şerit su üstünde boya gibi duruyordu."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 9.0
    noise.inputs['Detail'].default_value = 6.0
    noise.inputs['Roughness'].default_value = 0.65
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.46
    ramp.color_ramp.elements[1].position = 0.62
    nt.links.new(noise.outputs[0], ramp.inputs[0])
    white = nt.nodes.new('ShaderNodeBsdfDiffuse')
    white.inputs['Color'].default_value = (0.9, 0.94, 0.95, 1)
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(ramp.outputs[0], mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(white.outputs[0], mix.inputs[2])
    finish_veil(nt, mix.outputs[0], ramp.outputs[0])
    return mat


def smoke_material(name, color):
    """Barut dumanı: ince, yumuşak kenarlı, ışığı alan bir örtü."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    nt.links.new(geo.outputs['Incoming'], dot.inputs[1])
    absv = nt.nodes.new('ShaderNodeMath')
    absv.operation = 'ABSOLUTE'
    nt.links.new(dot.outputs['Value'], absv.inputs[0])
    power = nt.nodes.new('ShaderNodeMath')
    power.operation = 'POWER'
    power.inputs[1].default_value = 2.4
    nt.links.new(absv.outputs[0], power.inputs[0])
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 7.0
    noise.inputs['Detail'].default_value = 6.0
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    breakup = nt.nodes.new('ShaderNodeMath')
    breakup.operation = 'MULTIPLY'
    breakup.inputs[1].default_value = 1.7
    nt.links.new(noise.outputs[0], breakup.inputs[0])
    soft = nt.nodes.new('ShaderNodeMath')
    soft.operation = 'MULTIPLY'
    nt.links.new(power.outputs[0], soft.inputs[0])
    nt.links.new(breakup.outputs[0], soft.inputs[1])
    info = nt.nodes.new('ShaderNodeObjectInfo')
    fade = nt.nodes.new('ShaderNodeMath')
    fade.operation = 'MULTIPLY'
    fade.use_clamp = True
    nt.links.new(soft.outputs[0], fade.inputs[0])
    nt.links.new(info.outputs['Alpha'], fade.inputs[1])
    diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (*color, 1)
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fade.outputs[0], mix.inputs[0])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(diffuse.outputs[0], mix.inputs[2])
    finish_veil(nt, mix.outputs[0], fade.outputs[0])
    return mat


def finish_veil(nt, shader, fac):
    """Duman/alev maskede siyahtır ama örtüsünü korur: arkasındaki üniforma boyanmasın."""
    black = nt.nodes.new('ShaderNodeEmission')
    black.inputs['Color'].default_value = (0, 0, 0, 1)
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    veil = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fac, veil.inputs[0])
    nt.links.new(clear.outputs[0], veil.inputs[1])
    nt.links.new(black.outputs[0], veil.inputs[2])
    group = nt.nodes.new('ShaderNodeGroup')
    group.node_tree = pass_group()
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(group.outputs[0], mix.inputs[0])
    nt.links.new(shader, mix.inputs[1])
    nt.links.new(veil.outputs[0], mix.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(mix.outputs[0], out.inputs['Surface'])


# --- Geometri -----------------------------------------------------------------


def ellipse(cx, cy, rx, ry, n=12, power=2.0):
    """Süper elips kesiti; power > 2 köşeli gövde kesiti verir."""
    pts = []
    for i in range(n):
        a = math.tau * i / n
        c, s = math.cos(a), math.sin(a)
        x = math.copysign(abs(c) ** (2 / power), c) * rx
        y = math.copysign(abs(s) ** (2 / power), s) * ry
        pts.append((cx + x, cy + y))
    return pts


class Part:
    """Tek rijit parça: ilkeller biriktirilir, build() nesneyi kurar."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def rings(self, rings, mat, cap0=True, cap1=True, smooth=True):
        """Eşit noktalı halkaları yüzeyle bağlar."""
        idx = self.slot(mat)
        vs = [[self.bm.verts.new(p) for p in ring] for ring in rings]
        faces = []
        for a, b in zip(vs, vs[1:]):
            n = len(a)
            for i in range(n):
                faces.append(self.bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
        if cap0:
            faces.append(self.bm.faces.new(list(reversed(vs[0]))))
        if cap1:
            faces.append(self.bm.faces.new(vs[-1]))
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
        return self

    def loft(self, sections, mat, matrix=None, n=12, power=2.0, **kw):
        """Z ekseni boyunca kesit dizisi: (z, cx, cy, rx, ry)."""
        m = matrix or Matrix.Identity(4)
        rings = []
        for z, cx, cy, rx, ry in sections:
            rings.append([m @ Vector((x, y, z)) for x, y in ellipse(cx, cy, rx, ry, n, power)])
        return self.rings(rings, mat, **kw)

    def box(self, size, mat, at=(0, 0, 0), rot=(0, 0, 0), taper=(1.0, 1.0), smooth=False):
        m = xf(at, rot)
        sx, sy, sz = (s / 2 for s in size)
        tx, ty = taper
        ring0 = [(-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)]
        lower = [m @ Vector((x, y, -sz)) for x, y in ring0]
        upper = [m @ Vector((x * tx, y * ty, sz)) for x, y in ring0]
        return self.rings([lower, upper], mat, smooth=smooth)

    def cyl(self, r0, r1, h, mat, at=(0, 0, 0), rot=(0, 0, 0), n=12, smooth=True, cap=True):
        m = xf(at, rot)
        lower = [m @ Vector((x, y, -h / 2)) for x, y in ellipse(0, 0, r0, r0, n)]
        upper = [m @ Vector((x, y, h / 2)) for x, y in ellipse(0, 0, r1, r1, n)]
        self.rings([lower, upper], mat, cap0=cap, cap1=cap, smooth=smooth)
        return self

    def ball(self, radii, mat, at=(0, 0, 0), rot=(0, 0, 0), n=12, stacks=8):
        if isinstance(radii, (int, float)):
            radii = (radii, radii, radii)
        m = xf(at, rot)
        rings = []
        for j in range(1, stacks):
            b = math.pi * j / stacks - math.pi / 2
            z = math.sin(b) * radii[2]
            rr = math.cos(b)
            rings.append([m @ Vector((x, y, z)) for x, y in ellipse(0, 0, radii[0] * rr, radii[1] * rr, n)])
        return self.rings(rings, mat)

    def limb(self, p0, p1, r0, r1, mat, n=10):
        """İki nokta arası konik uzuv; uçlar yuvarlak, eklem aralığı görünmesin."""
        a, b = Vector(p0), Vector(p1)
        axis = b - a
        length = axis.length
        d = axis.normalized()
        q = Vector((0, 0, 1)).rotation_difference(d)
        rings = []
        for t, r in ((-0.55, 0.45), (-0.3, 0.86), (0.0, 1.0), (1.0, 1.0), (1.3, 0.86), (1.55, 0.45)):
            base = r0 if t <= 0.5 else r1
            z = t * length if 0 <= t <= 1 else (t * base if t < 0 else length + (t - 1) * base)
            rad = base * r
            ring = []
            for x, y in ellipse(0, 0, rad, rad, n):
                ring.append(a + q @ Vector((x, y, z)))
            rings.append(ring)
        return self.rings(rings, mat)

    def band(self, r_out, r_in, width, mat, rot=(0, 0, 0), n=26):
        """İçi boş çember: tekerlek jantı. Kapalı halka dolu disk gibi parmakları örterdi."""
        m = xf((0, 0, 0), rot)
        loop = [(r_out, -width / 2), (r_out, width / 2), (r_in, width / 2), (r_in, -width / 2)]
        rings = []
        for r, z in loop + loop[:1]:
            rings.append([m @ Vector((x, y, z)) for x, y in ellipse(0, 0, r, r, n)])
        return self.rings(rings, mat, cap0=False, cap1=False)

    def spine(self, stations, mat, n=10, cap0=True, cap1=True):
        """Eğri eksen boyunca elips kesit: (x, y, z, dikey yarıçap, yatay yarıçap)."""
        pts = [Vector(s[:3]) for s in stations]
        rings = []
        for i, st in enumerate(stations):
            a = pts[max(0, i - 1)]
            b = pts[min(len(pts) - 1, i + 1)]
            tangent = (b - a).normalized()
            side = Vector((0, 1, 0))
            up = side.cross(tangent).normalized()
            ring = []
            for k in range(n):
                t = math.tau * k / n
                ring.append(pts[i] + up * (math.sin(t) * st[3]) + side * (math.cos(t) * st[4]))
            rings.append(ring)
        return self.rings(rings, mat, cap0=cap0, cap1=cap1)

    def hull(self, stations, mat, deck_mat=None):
        """Gemi gövdesi: (x, yarı en, güverte z, omurga z). Kesit dibi yuvarlak, güverte düz."""
        rings = []
        for x, beam, deck, keel in stations:
            ring = []
            for a, b in ((-1.0, 1.0), (-0.98, 0.72), (-0.88, 0.36), (-0.55, 0.1), (0.0, 0.0),
                         (0.55, 0.1), (0.88, 0.36), (0.98, 0.72), (1.0, 1.0)):
                ring.append(Vector((x, a * beam, keel + (deck - keel) * b)))
            rings.append(ring)
        self.rings(rings, mat, cap0=True, cap1=True, smooth=True)
        if deck_mat:
            tops = []
            for x, beam, deck, _ in stations:
                tops.append([Vector((x, -beam * 0.985, deck + 0.004)), Vector((x, beam * 0.985, deck + 0.004))])
            idx = self.slot(deck_mat)
            vs = [[self.bm.verts.new(p) for p in row] for row in tops]
            for a, b in zip(vs, vs[1:]):
                face = self.bm.faces.new((a[0], a[1], b[1], b[0]))
                face.material_index = idx
        return self

    def build(self, parent=None, at=(0, 0, 0), bevel=0.0, smooth_angle=40.0):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.mats:
            mesh.materials.append(mat)
        mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
        ob = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.location = at
        ob.rotation_mode = 'QUATERNION'
        if bevel:
            mod = ob.modifiers.new('pah', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(35)
            mod.harden_normals = True
        return ob


def empty(name, parent=None, at=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = at
    ob.rotation_mode = 'QUATERNION'
    return ob


# --- Poz ----------------------------------------------------------------------


def rot(ob, x=0.0, y=0.0, z=0.0):
    ob.rotation_quaternion = Euler((x, y, z), 'XYZ').to_quaternion()


def aim_down(direction):
    """Aşağı bakan uzvu (-Z) verilen yöne çeviren dönüş."""
    return Vector((0, 0, -1)).rotation_difference(Vector(direction).normalized())


def solve_arm(upper, lower, hand_target, pole, len_upper, len_lower):
    """İki kemikli IK. Hedef ve kutup üst kemiğin ebeveyni uzayındadır."""
    shoulder = upper.location.copy()
    target = Vector(hand_target)
    span = target - shoulder
    dist = max(1e-4, min(span.length, (len_upper + len_lower) * 0.995))
    along = span.normalized()
    a = (len_upper ** 2 - len_lower ** 2 + dist ** 2) / (2 * dist)
    h = math.sqrt(max(0.0, len_upper ** 2 - a ** 2))
    side = Vector(pole) - along * Vector(pole).dot(along)
    side = side.normalized() if side.length > 1e-5 else Vector((0, 1, 0))
    elbow = shoulder + along * a + side * h
    q_upper = aim_down(elbow - shoulder)
    upper.rotation_quaternion = q_upper
    hand = shoulder + along * dist
    local = q_upper.inverted() @ (hand - elbow)
    lower.rotation_quaternion = aim_down(local)
    return hand


def wave(phase):
    return math.sin(math.tau * phase)


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


__all__ = [
    'Part', 'Quaternion', 'Vector', 'aim_down', 'ellipse', 'empty', 'foam_material', 'glow_material', 'material',
    'rot', 'set_pass', 'smoke_material', 'smooth', 'solve_arm', 'wave', 'xf',
]
