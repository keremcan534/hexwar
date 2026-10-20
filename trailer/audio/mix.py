"""Son miks: müzik (kaynak 222.96 s'den) + kurgu ipuçlarına bağlı efektler.

Müzik baskın kalır; efektler -14..-24 dB altında. SAVAŞ öncesi kısa bir
müzik çekilmesi (duck) darbeyi büyütür. Çıktı: out/mix.wav (48 kHz, 24 bit)
ve loudness raporu.

    python mix.py
"""
import json, os, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

SR = 48000
here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)
os.makedirs('out', exist_ok=True)
BM = json.load(open('beatmap.json', encoding='utf-8'))
CUES = json.load(open('cues.json', encoding='utf-8'))
DUR = BM['duration']
T0 = BM['T0']

ff = subprocess.run(['python', '-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], capture_output=True, text=True).stdout.strip()
subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(T0), '-t', str(DUR + 0.5), '-i', 'source.mp3',
                '-ar', str(SR), '-ac', '2', 'out/music.wav'], check=True)
music, _ = sf.read('out/music.wav')
N = int(DUR * SR)
music = np.pad(music, ((0, max(0, N - len(music))), (0, 0)))[:N]

# Müzik otomasyonu (dB): giriş yumuşatma + savaş öncesi çekilme + son.
def env_db(points):
    tt = np.arange(N) / SR
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    return np.interp(tt, xs, ys)

auto = env_db(CUES['music_automation'])
music *= (10 ** (auto / 20))[:, None]

bus = np.zeros((N, 2))
cache = {}
def load(name):
    if name not in cache:
        x, sr = sf.read(f'sfx/{name}.wav')
        if sr != SR: x = resample_poly(x, SR, sr, axis=0)
        if x.ndim == 1: x = np.stack([x, x], 1)
        cache[name] = x
    return cache[name]

for c in CUES['sfx']:
    x = load(c['name']).copy()
    if 'dur' in c:
        n = int(c['dur'] * SR); x = x[:n]
        fade = min(len(x), int(0.25 * SR)); x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    if c.get('pan'):
        p = c['pan']; x[:, 0] *= min(1, 1 - p); x[:, 1] *= min(1, 1 + p)
    # 'at' darbe anı: ters süpürme gibi efektler bitişi darbeye hizalar.
    start = c['t'] - (len(x) / SR if c.get('end_at') else 0) + c.get('offset', 0)
    i = int(start * SR)
    if i < 0: x = x[-i:]; i = 0
    j = min(N, i + len(x))
    bus[i:j] += x[:j - i] * 10 ** (c['db'] / 20)

mix = music + bus
# Yumuşak tavan: tepe -1 dBFS'yi aşarsa tanh ile sıkıştır.
peak = np.abs(mix).max()
ceil = 10 ** (-1 / 20)
if peak > ceil:
    mix = np.tanh(mix / ceil * 0.9) * ceil / np.tanh(0.9)
fade_in = int(1.2 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None] ** 2
sf.write('out/mix.wav', mix.astype(np.float32), SR, subtype='PCM_24')

def rms_db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
print(f'miks: {DUR:.2f} s, tepe {20*np.log10(np.abs(mix).max()):.2f} dBFS, RMS {rms_db(mix):.1f} dB, '
      f'müzik RMS {rms_db(music):.1f}, efekt RMS {rms_db(bus):.1f}')
r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', 'out/mix.wav', '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'],
                   capture_output=True, text=True)
import re
lufs = float(re.search(r'Input Integrated:\s+(-?[\d.]+)', r.stderr).group(1))
# Yayın hedefi -14 LUFS: statik kazanç, sıkıştırma yok (dinamik korunur).
TARGET = -14.0
g = 10 ** ((TARGET - lufs) / 20)
mix = mix * g
sf.write('out/mix.wav', mix.astype(np.float32), SR, subtype='PCM_24')
r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', 'out/mix.wav', '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'],
                   capture_output=True, text=True)
print(f'kaynak {lufs:.1f} LUFS, kazanç {20 * np.log10(g):+.1f} dB ->')
print('\n'.join(l for l in r.stderr.splitlines() if 'Input Integrated' in l or 'Input True Peak' in l))
