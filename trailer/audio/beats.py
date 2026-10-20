"""Tempo + vuruş ızgarası + ölçü/frase sınırları + kendine benzerlik.

Tempo otokorelasyondan, vuruşlar dinamik programlamayla (Ellis 2007) bulunur.
Kesim noktası adayları: ölçü başı + kroma benzerliği yüksek iki nokta
(aynı müzikal yere denk gelen iki an -> temiz müzikal kurgu).
"""
import json
import os
import numpy as np
os.chdir(os.path.dirname(os.path.abspath(__file__)))
import soundfile as sf
from scipy.signal import stft, find_peaks
from scipy.ndimage import uniform_filter1d

A = json.load(open('analysis.json'))
FR = A['fr']
onset = np.array(A['onset'])
lowf = np.array(A['lowflux'])
rms_db = np.array(A['rms_db'])
n = len(onset)

def tempo(seg):
    o = seg - seg.mean()
    ac = np.correlate(o, o, 'full')[len(o) - 1:]
    lags = np.arange(len(ac)) / FR
    m = (lags > 60 / 200) & (lags < 60 / 60)
    # log-normal ağırlık 120 BPM çevresi
    bpm = 60 / lags[m]
    w = np.exp(-0.5 * (np.log2(bpm / 120) / 0.9) ** 2)
    i = np.argmax(ac[m] * w)
    return 60 / lags[m][i], ac[m], bpm

for a, b in [(16, 56), (56, 96), (96, 138), (156, 222), (234, 286), (0, 290)]:
    bpm, _, _ = tempo(onset[int(a * FR):int(b * FR)])
    print(f'tempo {a:3d}-{b:3d}: {bpm:6.1f} BPM')

# genel tempo, ince ayar
bpm0, _, _ = tempo(onset[int(16 * FR):int(286 * FR)])
period = FR * 60 / bpm0

# DP vuruş izleme
alpha = 100.0
score = onset.copy(); back = -np.ones(n, int)
lo, hi = int(round(period * 0.5)), int(round(period * 2))
for i in range(n):
    s = max(0, i - hi); e = i - lo
    if e <= s: continue
    prev = np.arange(s, e)
    pen = -alpha * (np.log((i - prev) / period)) ** 2
    cand = score[prev] + pen
    j = np.argmax(cand)
    if cand[j] > 0:
        score[i] += cand[j]; back[i] = prev[j]
i = int(np.argmax(score[-int(period * 2):])) + n - int(period * 2)
beats = []
while i >= 0:
    beats.append(i); i = back[i]
beats = np.array(beats[::-1]) / FR
ibi = np.diff(beats)
print(f'genel {bpm0:.2f} BPM, vuruş sayısı {len(beats)}, IBI med {np.median(ibi):.4f}s')

# ölçü fazı: 4 olası fazdan bas akısı en güçlü olanı downbeat
def at(x, tt): return x[np.clip((np.asarray(tt) * FR).round().astype(int), 0, n - 1)]
lowb = np.array([lowf[max(0, int(t * FR) - 2):int(t * FR) + 3].max() for t in beats])
onb = np.array([onset[max(0, int(t * FR) - 2):int(t * FR) + 3].max() for t in beats])
for M in (4, 3):
    ph = [lowb[k::M].mean() for k in range(M)]
    print(f'{M}/x faz bas ortalamaları', np.round(ph, 3))
ph = int(np.argmax([lowb[k::4].mean() for k in range(4)]))
downbeats = beats[ph::4]

# büyük vuruşlar: onset + bas en güçlü olanlar
hits = []
pk, pr = find_peaks(onset, height=1.2, distance=int(FR * 0.4))
for p in pk:
    hits.append((p / FR, float(onset[p]), float(lowf[p])))
hits.sort(key=lambda h: -(h[1] + h[2]))
print('\nen güçlü 40 darbe (zaman, onset, bas):')
for h in sorted(hits[:40]):
    print(f'  {h[0]:7.3f}  {h[1]:5.2f}  {h[2]:5.2f}')

# kroma benzerliği (ölçü başlarında)
y, sr = sf.read('mono22k.wav')
f, t, Z = stft(y, fs=sr, nperseg=4096, noverlap=4096 - 512, boundary=None)
S = np.abs(Z)
m = (f > 60) & (f < 4000)
pc = (np.round(12 * np.log2(f[m] / 440)) % 12).astype(int)
chroma = np.zeros((12, S.shape[1]))
for k in range(12): chroma[k] = S[m][pc == k].sum(0)
chroma /= chroma.sum(0, keepdims=True) + 1e-9
cfr = sr / 512
def bar_chroma(t0, dur):
    a, b = int(t0 * cfr), int((t0 + dur) * cfr)
    v = chroma[:, a:b].mean(1); return v / (np.linalg.norm(v) + 1e-9)
bar = np.median(ibi) * 4
C = np.array([bar_chroma(d, bar) for d in downbeats])
E = np.array([rms_db[int(d * FR):int((d + bar) * FR)].mean() for d in downbeats])

json.dump(dict(bpm=float(bpm0), beats=beats.round(4).tolist(),
               downbeats=downbeats.round(4).tolist(), bar=float(bar),
               bar_chroma=C.round(4).tolist(), bar_rms=E.round(2).tolist()),
          open('beats.json', 'w'))
print(f'\nölçü süresi {bar:.4f}s, ilk downbeat {downbeats[0]:.3f}')
print('ölçüler (zaman, rms):')
for i, (d, e) in enumerate(zip(downbeats, E)):
    print(f'{i:3d} {d:7.3f} {e:6.1f}', end='   ' if i % 4 != 3 else '\n')
