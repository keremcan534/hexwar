"""Müzik analizi: tüm parçanın enerji, onset, tempo ve bölüm profili.

Çıktı: analysis.json (ham eğriler) + konsola özet. Fragman kurgusu bu
dosyadaki zamanlara bağlanır; tahmini BPM kullanılmaz.
"""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf
from scipy.signal import stft, find_peaks, butter, sosfiltfilt
from scipy.ndimage import uniform_filter1d

os.chdir(os.path.dirname(os.path.abspath(__file__)))
if not os.path.exists('mono22k.wav'):
    ff = subprocess.run([sys.executable, '-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], capture_output=True, text=True).stdout.strip()
    subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y', '-i', 'source.mp3', '-ac', '1', '-ar', '22050', 'mono22k.wav'], check=True)
y, sr = sf.read('mono22k.wav')
y = y.astype(np.float64)
HOP = 256
FR = sr / HOP  # kare/sn

f, t, Z = stft(y, fs=sr, nperseg=2048, noverlap=2048 - HOP, boundary=None)
S = np.abs(Z)
logS = np.log1p(100 * S)

def band(lo, hi):
    m = (f >= lo) & (f < hi)
    return S[m].sum(0)

rms = np.sqrt(uniform_filter1d(y ** 2, HOP * 4)[::HOP])[: S.shape[1]]
low = band(20, 150); mid = band(150, 2000); high = band(2000, 9000)

# spektral akı: pozitif log farkı
flux = np.maximum(0, np.diff(logS, axis=1)).sum(0)
flux = np.concatenate([[0], flux])
lowflux = np.maximum(0, np.diff(np.log1p(100 * S[(f >= 20) & (f < 150)]), axis=1)).sum(0)
lowflux = np.concatenate([[0], lowflux])
hiflux = np.maximum(0, np.diff(np.log1p(100 * S[f >= 2000]), axis=1)).sum(0)
hiflux = np.concatenate([[0], hiflux])

def norm(x):
    x = x - np.median(x)
    return x / (np.percentile(x, 99.5) + 1e-9)

onset = norm(flux)
n = len(onset)
times = np.arange(n) / FR

# saniye başına özet
sec = int(times[-1])
print('sn  rms   low   high  onset(ort) ')
rms_db = 20 * np.log10(rms + 1e-9)
for s in range(0, sec, 2):
    a, b = int(s * FR), int((s + 2) * FR)
    print(f'{s:3d} {rms_db[a:b].mean():6.1f} {np.log10(low[a:b].mean()+1e-9):5.2f} '
          f'{np.log10(high[a:b].mean()+1e-9):5.2f} {onset[a:b].mean():5.2f} '
          + '#' * int(max(0, rms_db[a:b].mean() + 45)))

out = dict(fr=FR, hop=HOP, sr=sr,
           rms_db=rms_db.round(2).tolist(),
           onset=onset.round(4).tolist(),
           lowflux=norm(lowflux).round(4).tolist(),
           hiflux=norm(hiflux).round(4).tolist(),
           low=np.log10(low + 1e-9).round(3).tolist(),
           high=np.log10(high + 1e-9).round(3).tolist())
json.dump(out, open('analysis.json', 'w'))
