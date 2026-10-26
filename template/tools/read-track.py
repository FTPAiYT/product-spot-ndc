# Read a music track before cutting picture to it: its real beats, which of them are
# strong (beats 1 and 3 of each bar, where the kick and accents sit), where its sections
# change, its biggest hits and its key. Writes <track>.beats.json next to the track for
# tools/beat-lock.mjs (--beats) and prints a summary to pick the film's anchors from.
#   python tools/read-track.py assets/music/track.mp3
# Needs Python with librosa (pip install librosa).
import json, sys
import numpy as np, librosa

path = sys.argv[1]
y, sr = librosa.load(path, sr=22050, mono=True)
dur = len(y) / sr
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time', tightness=200)
beats = [float(b) for b in beats]
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=128)
ot = librosa.times_like(onset, sr=sr, hop_length=128)
accent = lambda t: float(onset[(ot > t - 0.04) & (ot < t + 0.04)].max(initial=0))

# bar phase: the beat in each group of four that carries the most low end is beat 1
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=256)); f = librosa.fft_frequencies(sr=sr, n_fft=2048)
st = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=256)
low = S[f < 150].sum(0)
low_at = lambda t: float(low[(st > t - 0.03) & (st < t + 0.06)].max(initial=0))
phase = int(np.argmax([sum(low_at(b) + 10 * accent(b) for b in beats[p::4]) for p in range(4)]))
downbeats = beats[phase::4]
# accents: whichever pair of beats hits harder in THIS track - 1 and 3 (kick-led) or 2 and 4
# (clap/snare-led). Clicks belong on these: they are the beats a listener hears as "the beat".
pairs = [sorted(beats[(phase + k) % 4::4] + beats[(phase + k + 2) % 4::4]) for k in (0, 1)]
strong = max(pairs, key=lambda bs: np.mean([accent(b) for b in bs]))

# sections: bar-to-bar jumps in loudness (the bass enters, a drop, a breakdown, the return)
rms = librosa.feature.rms(y=y, hop_length=512)[0]; rt = librosa.times_like(rms, sr=sr, hop_length=512)
bar_db = [20 * np.log10(rms[(rt >= a) & (rt < b)].mean() + 1e-9) for a, b in zip(downbeats, downbeats[1:] + [dur])]
sections = [{'t': round(downbeats[i], 3), 'change_db': round(float(bar_db[i] - bar_db[i - 1]), 1)}
            for i in range(1, len(bar_db)) if abs(bar_db[i] - bar_db[i - 1]) > 2.5]

# the biggest hits (strongest onsets, at least a second apart)
order = np.argsort(onset)[::-1]; hits = []
for i in order:
    if all(abs(ot[i] - h) > 1.0 for h in hits): hits.append(float(ot[i]))
    if len(hits) >= 12: break

# key (Krumhansl profiles on the harmonic part)
c = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y), sr=sr).mean(axis=1)
maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
names = 'C C# D D# E F F# G G# A A# B'.split()
key = max(((np.corrcoef(np.roll(p, k), c)[0, 1], names[k] + q) for k in range(12) for p, q in [(maj, ' major'), (mnr, ' minor')]))[1]

out = {'dur': round(dur, 3), 'bpm': round(60 / float(np.median(np.diff(beats))), 2), 'key': key,
       'beats': [round(b, 4) for b in beats], 'downbeats': [round(b, 4) for b in downbeats], 'strong': [round(b, 4) for b in strong],
       'sections': sections, 'hits': sorted(round(h, 3) for h in hits)}
dst = path.rsplit('.', 1)[0] + '.beats.json'
json.dump(out, open(dst, 'w'), indent=1)
print(f"{dur:.1f}s  {out['bpm']} BPM  {key}  first downbeat {downbeats[0]:.2f}s  accents on beats {'1 and 3' if strong[0] in downbeats or strong[1] in downbeats else '2 and 4'}  -> {dst}")
print('sections (bar where the loudness jumps):', ', '.join(f"{s['t']:.2f}s ({s['change_db']:+.1f} dB)" for s in sections))
print('biggest hits:', ', '.join(f'{h:.2f}s' for h in out['hits']))
