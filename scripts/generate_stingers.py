"""
Scenering — Intro / Outro Stinger Generator
===========================================
Synthesises the six attention-grabbing stingers used by the Intro & Outro
studio. These are deliberately LONGER and bigger than the short UI sound
effects: risers, booms, sweeps and chord swells of 3-4 seconds.

Pure Python stdlib (no numpy / ffmpeg needed).

Output: public/sounds/stingers/*.wav  (44.1 kHz, 16-bit stereo)
Run:    python3 scripts/generate_stingers.py
"""
import math
import os
import random
import struct
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "sounds", "stingers")

random.seed(7)


# --------------------------------------------------------------- primitives
def buf(seconds):
    return [0.0] * int(SR * seconds)


def add(dst, src, at=0.0, gain=1.0):
    i0 = int(at * SR)
    for i, v in enumerate(src):
        j = i0 + i
        if 0 <= j < len(dst):
            dst[j] += v * gain


def env_ar(n, attack, release, curve=2.0):
    """attack/release envelope over n samples (seconds)"""
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    out = []
    for i in range(n):
        if i < a:
            e = (i / a) ** 0.6
        else:
            x = min(1.0, (i - a) / r)
            e = (1.0 - x) ** curve
        out.append(e)
    return out


def sine(freq, seconds, amp=1.0, phase=0.0, detune=0.0):
    n = int(SR * seconds)
    out = [0.0] * n
    f = freq
    for i in range(n):
        t = i / SR
        if detune:
            f = freq * (1.0 + detune * math.sin(2 * math.pi * 0.7 * t))
        out[i] = amp * math.sin(2 * math.pi * f * t + phase)
    return out


def sweep(f0, f1, seconds, amp=1.0, shape="exp"):
    """frequency sweep with continuous phase"""
    n = int(SR * seconds)
    out = [0.0] * n
    ph = 0.0
    for i in range(n):
        x = i / n
        if shape == "exp":
            f = f0 * ((f1 / f0) ** x)
        else:
            f = f0 + (f1 - f0) * x
        ph += 2 * math.pi * f / SR
        out[i] = amp * math.sin(ph)
    return out


def noise(seconds, amp=1.0):
    n = int(SR * seconds)
    return [amp * (random.random() * 2 - 1) for _ in range(n)]


def lowpass(sig, cutoff):
    out = [0.0] * len(sig)
    rc = 1.0 / (2 * math.pi * cutoff)
    a = (1.0 / SR) / (rc + 1.0 / SR)
    y = 0.0
    for i, v in enumerate(sig):
        y += a * (v - y)
        out[i] = y
    return out


def highpass(sig, cutoff):
    out = [0.0] * len(sig)
    rc = 1.0 / (2 * math.pi * cutoff)
    a = rc / (rc + 1.0 / SR)
    prev_x = 0.0
    prev_y = 0.0
    for i, v in enumerate(sig):
        y = a * (prev_y + v - prev_x)
        out[i] = y
        prev_x = v
        prev_y = y
    return out


def apply_env(sig, e):
    return [s * e[i] for i, s in enumerate(sig)]


def reverb(sig, amount=0.3, decay=0.5):
    """cheap multi-tap schroeder-ish tail"""
    out = list(sig)
    taps = [(0.029, 0.7), (0.037, 0.6), (0.051, 0.5), (0.073, 0.42), (0.097, 0.34), (0.131, 0.25)]
    for delay, g in taps:
        d = int(delay * SR)
        for i in range(d, len(out)):
            out[i] += out[i - d] * g * amount * decay
    return out


def normalize(sig, peak=0.92):
    m = max(1e-9, max(abs(v) for v in sig))
    k = peak / m
    return [v * k for v in sig]


def soft_clip(sig):
    return [math.tanh(v * 1.15) for v in sig]


def write_wav(name, left, right=None):
    os.makedirs(OUT, exist_ok=True)
    if right is None:
        right = left
    left = soft_clip(normalize(left))
    right = soft_clip(normalize(right))
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        frames = bytearray()
        for i in range(len(left)):
            l = int(max(-1.0, min(1.0, left[i])) * 32000)
            r = int(max(-1.0, min(1.0, right[i])) * 32000)
            frames += struct.pack("<hh", l, r)
        f.writeframes(bytes(frames))
    print(f"  ✓ {name}  ({len(left)/SR:.1f}s, {len(frames)//1024} KB)")


# ------------------------------------------------------------------ patches
def epic_rise():
    """Building riser into a huge orchestral hit"""
    dur = 4.0
    out = buf(dur)

    # rising noise riser
    riser_len = 2.6
    nz = noise(riser_len, 0.9)
    shaped = []
    for i, v in enumerate(nz):
        x = i / len(nz)
        shaped.append(v * (x ** 2.2))
    shaped = highpass(lowpass(shaped, 900 + 6000 * 0.5), 320)
    # sweep the filter by blending progressively brighter copies
    bright = highpass(nz, 2500)
    for i in range(len(shaped)):
        x = i / len(shaped)
        shaped[i] = shaped[i] * (1 - x * 0.6) + bright[i] * (x ** 3) * 0.55
    add(out, shaped, 0.0, 0.5)

    # rising tone
    tone = sweep(110, 880, riser_len, 0.5)
    tone = apply_env(tone, [(i / len(tone)) ** 2 for i in range(len(tone))])
    add(out, tone, 0.0, 0.4)

    # THE HIT at 2.6s
    hit_at = 2.55
    # sub boom
    boom = sweep(90, 34, 1.3, 1.0, shape="exp")
    boom = apply_env(boom, env_ar(len(boom), 0.004, 1.25, 1.6))
    add(out, boom, hit_at, 1.0)
    # brass-ish stack
    for f, g in [(98, 0.5), (147, 0.38), (196, 0.3), (294, 0.2), (392, 0.13)]:
        n = int(SR * 1.35)
        v = sine(f, 1.35, g, detune=0.0015)
        v = apply_env(v, env_ar(n, 0.012, 1.3, 1.4))
        add(out, v, hit_at, 0.55)
    # cymbal crash
    cr = noise(1.5, 0.8)
    cr = highpass(cr, 4200)
    cr = apply_env(cr, env_ar(len(cr), 0.002, 1.45, 2.4))
    add(out, cr, hit_at, 0.34)

    out = reverb(out, 0.34, 0.6)
    # slight stereo width
    r = [0.0] * len(out)
    d = int(0.011 * SR)
    for i in range(len(out)):
        r[i] = out[i] * 0.86 + (out[i - d] * 0.3 if i >= d else 0)
    return out, r


def cinematic_boom():
    """Deep trailer impact with a long tail"""
    dur = 4.0
    out = buf(dur)

    # pre-whoosh
    pre = noise(0.8, 0.7)
    pre = lowpass(pre, 1400)
    pre = apply_env(pre, [(i / (SR * 0.8)) ** 2.5 for i in range(int(SR * 0.8))])
    add(out, pre, 0.25, 0.4)

    hit = 1.0
    # massive sub drop
    sub = sweep(120, 26, 2.6, 1.0)
    sub = apply_env(sub, env_ar(len(sub), 0.005, 2.55, 1.1))
    add(out, sub, hit, 1.0)
    # body thud
    body = sine(62, 1.6, 0.8)
    body = apply_env(body, env_ar(len(body), 0.003, 1.55, 1.8))
    add(out, body, hit, 0.6)
    # metallic transient
    tr = noise(0.5, 1.0)
    tr = highpass(tr, 1800)
    tr = apply_env(tr, env_ar(len(tr), 0.001, 0.45, 3.2))
    add(out, tr, hit, 0.3)
    # long dark tail
    for f, g in [(55, 0.32), (82, 0.22), (110, 0.16)]:
        v = sine(f, 2.8, g, detune=0.002)
        v = apply_env(v, env_ar(len(v), 0.25, 2.5, 1.2))
        add(out, v, hit + 0.05, 0.5)

    out = reverb(out, 0.45, 0.75)
    r = [0.0] * len(out)
    d = int(0.017 * SR)
    for i in range(len(out)):
        r[i] = out[i] * 0.88 + (out[i - d] * 0.34 if i >= d else 0)
    return out, r


def digital_glitch():
    """Tech sweep with a snapping lock-on"""
    dur = 3.5
    out = buf(dur)

    # digital stutter bursts
    tpos = 0.0
    step = 0.055
    i = 0
    while tpos < 1.7:
        f = 420 * (1.0 + i * 0.16) + random.random() * 160
        ln = step * (0.45 + random.random() * 0.4)
        n = int(SR * ln)
        seg = []
        for k in range(n):
            tt = k / SR
            sq = 1.0 if math.sin(2 * math.pi * f * tt) > 0 else -1.0
            seg.append(sq * 0.5)
        seg = apply_env(seg, env_ar(n, 0.002, ln * 0.9, 1.4))
        add(out, seg, tpos, 0.26 * (0.4 + i * 0.07))
        tpos += step
        i += 1

    # rising filtered noise sweep
    nz = noise(1.9, 0.8)
    nz = highpass(nz, 900)
    nz = apply_env(nz, [(k / (SR * 1.9)) ** 2.4 for k in range(int(SR * 1.9))])
    add(out, nz, 0.0, 0.3)

    # sweep tone
    sw = sweep(240, 2400, 1.8, 0.45)
    sw = apply_env(sw, [(k / (SR * 1.8)) ** 1.8 for k in range(int(SR * 1.8))])
    add(out, sw, 0.0, 0.3)

    # LOCK-ON snap
    lock = 1.85
    snap = noise(0.28, 1.0)
    snap = highpass(snap, 2600)
    snap = apply_env(snap, env_ar(len(snap), 0.0008, 0.26, 3.0))
    add(out, snap, lock, 0.4)
    sub = sweep(180, 45, 1.1, 0.9)
    sub = apply_env(sub, env_ar(len(sub), 0.003, 1.05, 1.4))
    add(out, sub, lock, 0.8)
    # confirm blips
    for k, (f, at) in enumerate([(1320, 0.0), (1760, 0.09), (2640, 0.19)]):
        b = sine(f, 0.22, 0.5)
        b = apply_env(b, env_ar(len(b), 0.002, 0.2, 2.2))
        add(out, b, lock + at, 0.3)

    out = reverb(out, 0.22, 0.4)
    r = [0.0] * len(out)
    d = int(0.008 * SR)
    for i2 in range(len(out)):
        r[i2] = out[i2] * 0.85 + (out[i2 - d] * 0.4 if i2 >= d else 0)
    return out, r


def magic_shimmer():
    """Sparkling bell cascade — elegant reveals"""
    dur = 4.0
    out = buf(dur)

    # pentatonic bell cascade
    scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5, 1567.98, 2093.0]
    for i in range(26):
        at = 0.06 + i * 0.085 + random.random() * 0.02
        f = scale[i % len(scale)] * (1 if i < 14 else 2)
        ln = 1.6
        # FM bell
        n = int(SR * ln)
        seg = [0.0] * n
        for k in range(n):
            tt = k / SR
            mod = math.sin(2 * math.pi * f * 1.41 * tt) * 2.2 * math.exp(-tt * 3.0)
            seg[k] = math.sin(2 * math.pi * f * tt + mod) * 0.42
        seg = apply_env(seg, env_ar(n, 0.003, ln * 0.95, 2.2))
        add(out, seg, at, 0.22)

    # warm pad underneath
    for f, g in [(261.63, 0.3), (329.63, 0.24), (392.0, 0.2), (523.25, 0.14)]:
        v = sine(f, 3.4, g, detune=0.003)
        v = apply_env(v, env_ar(len(v), 0.55, 2.8, 1.1))
        add(out, v, 0.2, 0.34)

    # airy shimmer top
    air = noise(3.0, 0.5)
    air = highpass(air, 6500)
    air = apply_env(air, env_ar(len(air), 0.7, 2.3, 1.4))
    add(out, air, 0.3, 0.12)

    out = reverb(out, 0.5, 0.8)
    r = [0.0] * len(out)
    d = int(0.021 * SR)
    for i in range(len(out)):
        r[i] = out[i] * 0.84 + (out[i - d] * 0.42 if i >= d else 0)
    return out, r


def whoosh_impact():
    """Fast air whoosh landing on a punch"""
    dur = 3.0
    out = buf(dur)

    # whoosh: band-passed noise swelling then dropping
    wl = 1.25
    nz = noise(wl, 1.0)
    band = highpass(lowpass(nz, 2600), 420)
    e = []
    n = int(SR * wl)
    for i in range(n):
        x = i / n
        e.append(math.sin(math.pi * min(1.0, x * 1.05)) ** 1.6)
    band = apply_env(band, e)
    add(out, band, 0.05, 0.5)

    # doppler tone riding the whoosh
    dopp = sweep(180, 1400, wl, 0.3)
    dopp = apply_env(dopp, e)
    add(out, dopp, 0.05, 0.22)

    # IMPACT
    hit = 1.22
    punch = sweep(160, 40, 1.4, 1.0)
    punch = apply_env(punch, env_ar(len(punch), 0.003, 1.35, 1.3))
    add(out, punch, hit, 1.0)
    crack = noise(0.35, 1.0)
    crack = highpass(crack, 2200)
    crack = apply_env(crack, env_ar(len(crack), 0.001, 0.33, 3.0))
    add(out, crack, hit, 0.32)
    for f, g in [(110, 0.4), (165, 0.26), (220, 0.18)]:
        v = sine(f, 1.4, g, detune=0.002)
        v = apply_env(v, env_ar(len(v), 0.008, 1.3, 1.6))
        add(out, v, hit, 0.45)

    out = reverb(out, 0.3, 0.55)
    r = [0.0] * len(out)
    d = int(0.013 * SR)
    for i in range(len(out)):
        r[i] = out[i] * 0.87 + (out[i - d] * 0.36 if i >= d else 0)
    return out, r


def warm_uplift():
    """Friendly major chord swell for outros"""
    dur = 4.0
    out = buf(dur)

    # I - V - vi - IV feel compressed into a single rising swell (C major)
    chords = [
        (0.0, [261.63, 329.63, 392.00, 523.25]),
        (0.85, [392.00, 493.88, 587.33, 783.99]),
        (1.7, [440.00, 523.25, 659.25, 880.00]),
        (2.55, [349.23, 440.00, 523.25, 698.46]),
    ]
    for at, notes in chords:
        for ni, f in enumerate(notes):
            ln = 1.5
            n = int(SR * ln)
            # warm additive pad
            seg = [0.0] * n
            for k in range(n):
                tt = k / SR
                seg[k] = (
                    math.sin(2 * math.pi * f * tt) * 0.5
                    + math.sin(2 * math.pi * f * 2 * tt) * 0.18
                    + math.sin(2 * math.pi * f * 3 * tt) * 0.08
                    + math.sin(2 * math.pi * f * 1.003 * tt) * 0.3
                ) * 0.34
            seg = apply_env(seg, env_ar(n, 0.12, 1.35, 1.3))
            add(out, seg, at, 0.4 - ni * 0.045)

    # gentle bell accents
    for i, (at, f) in enumerate([(0.05, 1046.5), (1.75, 1318.5), (2.6, 1567.98)]):
        n = int(SR * 1.5)
        seg = [0.0] * n
        for k in range(n):
            tt = k / SR
            mod = math.sin(2 * math.pi * f * 1.4 * tt) * 1.6 * math.exp(-tt * 3.2)
            seg[k] = math.sin(2 * math.pi * f * tt + mod) * 0.38
        seg = apply_env(seg, env_ar(n, 0.004, 1.45, 2.2))
        add(out, seg, at, 0.2)

    # soft sub foundation
    sub = sine(65.41, 3.6, 0.4)
    sub = apply_env(sub, env_ar(len(sub), 0.35, 3.1, 1.1))
    add(out, sub, 0.1, 0.5)

    out = reverb(out, 0.42, 0.7)
    r = [0.0] * len(out)
    d = int(0.019 * SR)
    for i in range(len(out)):
        r[i] = out[i] * 0.85 + (out[i - d] * 0.4 if i >= d else 0)
    return out, r


PATCHES = [
    ("epic_rise.wav", epic_rise),
    ("cinematic_boom.wav", cinematic_boom),
    ("digital_glitch.wav", digital_glitch),
    ("magic_shimmer.wav", magic_shimmer),
    ("whoosh_impact.wav", whoosh_impact),
    ("warm_uplift.wav", warm_uplift),
]

if __name__ == "__main__":
    print("Generating intro/outro stingers…")
    for name, fn in PATCHES:
        l, r = fn()
        write_wav(name, l, r)
    print(f"Done → {OUT}")
