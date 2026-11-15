"""
THE MARIGOLD SILENCE: the score (Stage H), composed and rendered in code. No samples, no internet.

  theme.m4a        "The Marigold": a slow waltz in A minor built on the music-box tune
                   (5-3-1-3-5-8-5-3), piano over strings and a low cello. Title, intro, endings.
  investigation.m4a  sparse piano notes over a soft drone; loops quietly under the day.
  undercroft.m4a   low clashing strings, a slow heartbeat, the tune slowed and out of tune.

Instruments are synthesised: piano (inharmonic partials, hammer thump, decay), strings (detuned
saws, soft attack, filtered), all through a long stereo reverb.

Run: npm run music   (uses Blender's Python for numpy; writes public/audio/music/*.m4a)
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'audio', 'music')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1933)

A4 = 440.0
SCALE = [0, 2, 3, 5, 7, 8, 10, 12]  # A natural minor, one octave: tooth n -> SCALE[n-1]


def hz(semis_from_a4):
    return A4 * 2 ** (semis_from_a4 / 12)


def piano(f, dur, vel=0.6):
    """A felt piano note: slightly inharmonic partials, fast attack, two-stage decay, a hammer thump."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    B = 0.0004
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > SR / 2.2:
            break
        amp = vel / k ** 1.3
        dec = np.exp(-t * (0.9 + k * 0.55)) * 0.7 + np.exp(-t * (3.5 + k)) * 0.3
        out += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * dec
    thump = rng.standard_normal(n) * np.exp(-t * 90) * 0.04 * vel
    env = np.minimum(1, t / 0.004)
    return (out + thump) * env


def lowpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def strings(freqs, dur, vol=0.12, attack=1.5, release=1.8, cutoff=1800):
    """A string section chord: detuned saws with vibrato, slow swell, warm filter."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            vib = 1 + 0.003 * np.sin(2 * np.pi * (5.2 + det) * t + rng.uniform(0, 6))
            phase = np.cumsum(f * (1 + det / 100) * vib) / SR
            out += 2 * (phase % 1) - 1
    out = lowpass(out / (len(freqs) * 3), cutoff)
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release).clip(0, 1)
    return out * env * vol


def reverb(mono, seconds=3.2, wet=0.35):
    """Stereo hall reverb by convolving with a decaying noise tail (different per side)."""
    n = int(SR * seconds)
    t = np.arange(n) / SR
    outs = []
    for side in (0, 1):
        ir = rng.standard_normal(n) * np.exp(-t * 3.0 / seconds * 2.2)
        ir = lowpass(ir, 5000 if side else 4500)
        ir[: int(SR * 0.012)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        L = len(mono) + n
        size = 1 << (L - 1).bit_length()
        conv = np.fft.irfft(np.fft.rfft(mono, size) * np.fft.rfft(ir, size), size)[:len(mono)]
        outs.append(mono * (1 - wet) + conv * wet * 2.0)
    return np.stack(outs, 1)


def place(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def write(name, stereo, loop_fade=0.0):
    if loop_fade:  # fold the tail onto the start so it loops without a seam
        k = int(loop_fade * SR)
        ramp = np.linspace(0, 1, k)[:, None]
        stereo[:k] = stereo[:k] * ramp + stereo[-k:] * (1 - ramp)
        stereo = stereo[:-k]
    peak = np.max(np.abs(stereo)) or 1
    stereo = stereo / peak * 0.85
    wav = os.path.join(OUT, f'{name}.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype('<i2').tobytes())
    m4a = os.path.join(OUT, f'{name}.m4a')
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000', wav, m4a], check=True)
    os.remove(wav)
    print(f'MUSIC {name}.m4a {os.path.getsize(m4a) / 1e6:.2f} MB, {len(stereo) / SR:.0f} s')


# chords: Am, F, Dm, E (semitones from A4), bass notes an octave or two down
CHORDS = [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]]
BASS = [-24, -28, -31, -29]


def theme():
    bpm = 66
    beat = 60 / bpm
    bar = beat * 3
    bars = 24
    dur = bars * bar + 6
    buf = np.zeros(int(SR * dur))
    tune = [5, 3, 1, 3, 5, 8, 5, 3]
    for b in range(bars):
        c = b // 2 % 4
        t0 = b * bar
        if b % 2 == 0:  # strings hold each chord for two bars
            place(buf, strings([hz(s - 12) for s in CHORDS[c]], bar * 2 + 1.2, vol=0.10 if b < 4 else 0.14), t0)
            place(buf, strings([hz(BASS[c])], bar * 2 + 1.2, vol=0.16, cutoff=600), t0)
        # waltz left hand: bass on 1, chord on 2 and 3
        place(buf, piano(hz(BASS[c] + 12), bar, 0.35), t0)
        for k in (1, 2):
            for s in CHORDS[c]:
                place(buf, piano(hz(s - 12), beat * 1.2, 0.12), t0 + k * beat)
    # the melody: the music-box tune, twice, then varied, then once more an octave up
    phrase = [(n, 1.5 if i % 4 == 3 else 1) for i, n in enumerate(tune)]
    t = 4 * bar
    for rep, octv in ((0, 0), (1, 0), (2, -12), (3, 12)):
        for n, length in phrase:
            vel = 0.55 if rep != 2 else 0.4
            place(buf, piano(hz(SCALE[n - 1] + octv), beat * length * 2.2, vel), t)
            t += beat * length
        t += bar
    return reverb(buf, 3.4, 0.38)


def investigation():
    dur = 128
    buf = np.zeros(int(SR * dur))
    for k in range(0, dur, 16):  # slow drone chords
        c = (k // 16) % 4
        place(buf, strings([hz(BASS[c] + 12), hz(CHORDS[c][1] - 12)], 18, vol=0.07, attack=5, release=6, cutoff=900), k)
    t = 3.0
    pent = [0, 3, 5, 7, 10, 12, 15]
    while t < dur - 6:  # scattered piano notes, now and then a fragment of the tune
        if rng.random() < 0.22:
            for n in (5, 3, 1):
                place(buf, piano(hz(SCALE[n - 1]), 4, 0.28), t)
                t += 0.9
        else:
            place(buf, piano(hz(rng.choice(pent) - (12 if rng.random() < 0.4 else 0)), 5, rng.uniform(0.15, 0.3)), t)
        t += rng.uniform(2.2, 5.5)
    return reverb(buf, 4.0, 0.45)


def undercroft():
    dur = 96
    buf = np.zeros(int(SR * dur))
    place(buf, strings([hz(-24), hz(-23)], dur, vol=0.12, attack=6, release=6, cutoff=500), 0)  # A against B-flat
    place(buf, strings([hz(-12), hz(-6)], dur, vol=0.05, attack=10, release=8, cutoff=1200), 0)  # a tritone above
    t = 2.0
    while t < dur - 2:  # a slow heartbeat
        for dt, v in ((0, 0.5), (0.28, 0.32)):
            n = int(SR * 0.35)
            tt = np.arange(n) / SR
            thump = np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 14) * v
            place(buf, thump, t + dt)
        t += 1.6
    tune = [5, 3, 1, 3, 5, 8, 5, 3]
    for start in (14, 46, 74):  # the music box, far away, slowed down and slightly out of tune
        for i, n in enumerate(tune):
            place(buf, piano(hz(SCALE[n - 1] + 12 + rng.uniform(-0.3, 0.3)), 3, 0.18), start + i * 1.3)
    return reverb(buf, 4.5, 0.5)


write('theme', theme())
write('investigation', investigation(), loop_fade=6)
write('undercroft', undercroft(), loop_fade=6)
