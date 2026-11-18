# Piyade: tek er. Bölük görüntüsü çalışma anında birkaç erin fazları kaydırılarak kurulur.
from .soldier import build_soldier, pose

META = {'worldSize': 30.0, 'span': 3.0, 'focus': 0.72, 'glow': 11.0}


def build():
    fig = build_soldier()
    return {
        **META,
        'root': fig['root'],
        'muzzles': [fig['flash'].anchor],
        'pose': lambda anim, t: pose(fig, anim, t),
    }
