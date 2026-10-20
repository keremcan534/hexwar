"""Prosedürel ses efektleri. Harici örnek yok: her efekt gürültü + filtre +
zarftan üretilir, böylece lisans sorunu ve indirme gerekmez.

Kullanım: python sfx.py  -> sfx/*.wav (48 kHz stereo, float32)
"""
import os
import os
import numpy as np
os.chdir(os.path.dirname(os.path.abspath(__file__)))
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(1836)
os.makedirs('sfx', exist_ok=True)


def t_(dur): return np.arange(int(dur * SR)) / SR
def noise(dur): return rng.standard_normal(int(dur * SR))
def lp(x, f, o=4): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=4): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=3): return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x)


def norm(x, peak=0.9):
    return x * (peak / (np.abs(x).max() + 1e-9))


def stereo(l, r=None, width=0.0):
    if r is None:
        d = int(SR * 0.011)
        r = np.concatenate([np.zeros(d), l[:-d]]) if width else l
        r = l * (1 - width) + r * width
    return np.stack([l, r], 1)


def reverb(x, dur=2.2, damp=3000, mix=0.35):
    """Üstel sönümlü gürültü ile evrişim: oda değil, uzak bir kıyı hissi."""
    tt = t_(dur)
    irL = lp(noise(dur), damp) * np.exp(-tt * 6.9 / dur)
    irR = lp(noise(dur), damp) * np.exp(-tt * 6.9 / dur)
    L = len(x) + len(tt) - 1
    wl = fftconvolve(x, irL)[:L]
    wr = fftconvolve(x, irR)[:L]
    dry = np.concatenate([x, np.zeros(len(tt) - 1)])
    wl, wr = norm(wl, 1), norm(wr, 1)
    return np.stack([dry * (1 - mix) + wl * mix, dry * (1 - mix) + wr * mix], 1)


def write(name, x, peak=0.9):
    if x.ndim == 1: x = stereo(x)
    sf.write(f'sfx/{name}.wav', norm(x, peak).astype(np.float32), SR)


# okyanus: kahverengi gürültü + yavaş dalga kabarması
def ocean(dur=16):
    tt = t_(dur)
    out = []
    for ph in (0, 1.7):
        n = np.cumsum(noise(dur)); n = hp(n, 30, 2); n = lp(n, 700, 2)
        surf = hp(lp(noise(dur), 4500, 2), 900, 2)
        swell = 0.55 + 0.45 * np.sin(2 * np.pi * tt / 6.5 + ph) ** 2
        crest = np.clip(np.sin(2 * np.pi * tt / 6.5 + ph + 0.6), 0, 1) ** 6
        out.append(norm(n, 1) * swell + 0.18 * norm(surf, 1) * crest)
    x = np.stack(out, 1)
    fade = np.minimum(1, np.minimum(tt / 2.5, (dur - tt) / 2.5))[:, None]
    return x * fade


# alçak sinematik darbe: aşağı kayan sinüs + geçici + gürültü kuyruğu
def boom(dur=4.0, f0=62, f1=28, click=0.6):
    tt = t_(dur)
    f = f1 + (f0 - f1) * np.exp(-tt * 3.5)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 1.4)
    trans = lp(noise(dur), 2500) * np.exp(-tt * 60) * click
    tail = lp(noise(dur), 180) * np.exp(-tt * 1.8) * 0.5
    x = body + trans + norm(tail, 0.35)
    return reverb(x, 3.0, 900, 0.3)


# uzak top: alçak geçirgen patlama + uzun kıyı yankısı
def cannon(dist=1.0):
    dur = 0.9
    tt = t_(dur)
    blast = lp(noise(dur), 600 / dist) * np.exp(-tt * 9)
    thump = np.sin(2 * np.pi * 42 * tt) * np.exp(-tt * 7)
    x = norm(blast, 1) + 0.8 * thump
    return reverb(x, 3.5, 700, 0.55)


# whoosh: bant geçiren gürültü, merkez frekans süpürmesi
def whoosh(dur=0.7, a=250, b=3200, peak_at=0.6):
    tt = t_(dur)
    x = noise(dur)
    # kayan filtre yerine iki filtrenin geçişli karışımı: daha az yapay
    low = bp(x, a, a * 4, 2); high = bp(x, b / 4, min(b, 20000), 2)
    p = tt / dur
    mixc = p
    env = np.where(p < peak_at, (p / peak_at) ** 2.2, ((1 - p) / (1 - peak_at)) ** 1.6)
    y = (low * (1 - mixc) + high * mixc) * env
    return stereo(norm(y, 1), width=0.6)


# metalik tık (pirinç anahtar)
def metal_click():
    dur = 0.35; tt = t_(dur)
    x = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) * a
            for f, d, a in [(2140, 38, 1), (3390, 55, .6), (5230, 70, .4), (7810, 90, .25)])
    x += hp(noise(dur), 3000) * np.exp(-tt * 300) * 0.8
    return reverb(x, 0.6, 6000, 0.15)


# harita / ahşap tık
def map_click():
    dur = 0.12; tt = t_(dur)
    x = bp(noise(dur), 900, 3500) * np.exp(-tt * 140) + np.sin(2 * np.pi * 620 * tt) * np.exp(-tt * 90) * 0.5
    return reverb(x, 0.4, 5000, 0.12)


# kâğıt: seyrek çıtırtılar
def paper(dur=0.55):
    tt = t_(dur)
    x = np.zeros(len(tt))
    for _ in range(140):
        i = int(rng.uniform(0, len(tt) - 400))
        x[i:i + 400] += rng.standard_normal(400) * np.exp(-np.arange(400) / 50) * rng.uniform(.2, 1)
    x = bp(x, 1800, 9000) * np.sin(np.pi * tt / dur) ** 0.7
    sl = hp(noise(dur), 2500) * np.sin(np.pi * tt / dur) ** 2 * 0.15
    return stereo(x + sl, width=0.4)


# bayrak kumaşı: düzensiz çırpınma
def cloth(dur=1.4):
    tt = t_(dur)
    mod = np.abs(np.sin(2 * np.pi * np.cumsum(9 + 4 * np.sin(2 * np.pi * 1.3 * tt)) / SR)) ** 3
    x = bp(noise(dur), 250, 2200) * (0.25 + mod) * np.sin(np.pi * tt / dur) ** 0.6
    return stereo(x, width=0.7)


# buhar
def steam(dur=1.8):
    tt = t_(dur)
    env = np.minimum(1, tt / 0.08) * np.exp(-tt * 1.6)
    x = hp(noise(dur), 2800) * env + bp(noise(dur), 600, 1400) * env * 0.25
    return stereo(x, width=0.5)


# ters süpürme: darbeye doğru emilen yankı
def reverse_swell(dur=1.6):
    tt = t_(dur)
    x = lp(noise(dur), 5000) * np.exp(-tt * 4)
    x = reverb(x, 1.2, 4000, 0.7)[:len(tt)]
    return x[::-1] * np.linspace(0, 1, len(tt))[:, None] ** 1.5


# makine: ritmik piston
def machine(dur=2.2):
    tt = t_(dur)
    beat = (np.sin(2 * np.pi * 4.0 * tt) > 0.92).astype(float)
    hit = lp(np.convolve(beat, np.exp(-np.arange(2000) / 240), 'same'), 900)
    hum = np.sin(2 * np.pi * 55 * tt) * 0.15 + bp(noise(dur), 80, 300) * 0.3
    env = np.minimum(1, np.minimum(tt / 0.3, (dur - tt) / 0.5))
    return reverb((norm(hit, 1) + hum) * env, 1.0, 2000, 0.25)


# kıvılcım / ateş çıtırtısı
def embers(dur=2.5):
    tt = t_(dur)
    x = np.zeros(len(tt))
    for _ in range(90):
        i = int(rng.uniform(0, len(tt) - 300))
        x[i:i + 300] += rng.standard_normal(300) * np.exp(-np.arange(300) / 30) * rng.uniform(.1, 1)
    rumble = lp(noise(dur), 220) * 0.6
    env = np.minimum(1, np.minimum(tt / 0.2, (dur - tt) / 1.0))
    return stereo((hp(x, 1500) + rumble) * env, width=0.6)


write('ocean', ocean(), 0.8)
write('boom', boom())
write('boom_soft', boom(3.0, 48, 30, 0.2), 0.7)
write('cannon_far', cannon(1.6), 0.8)
write('cannon_near', cannon(1.0))
write('whoosh', whoosh())
write('whoosh_short', whoosh(0.38, 400, 4000, 0.7), 0.8)
write('metal_click', metal_click(), 0.7)
write('map_click', map_click(), 0.6)
write('paper', paper(), 0.6)
write('cloth', cloth(), 0.7)
write('steam', steam(), 0.6)
write('reverse_swell', reverse_swell(), 0.8)
write('machine', machine(), 0.7)
write('embers', embers(), 0.6)
print(sorted(os.listdir('sfx')))
