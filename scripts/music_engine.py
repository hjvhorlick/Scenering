"""
Scenering — Lively Background Music Library Generator
=====================================================
Synthesises 10 royalty-free, vocal-free background tracks with a real
multi-instrument engine (numpy/scipy): additive piano, Karplus-Strong
plucks (guitar/ukulele/harp), FM bells & e-piano, string ensembles,
synth leads, bass and a full drum kit, with convolution reverb,
stereo imaging and master limiting.

Output: /tmp/music/<id>.wav  (44.1 kHz stereo, then encoded to MP3)

Run:  python3 scripts/generate_lively_music.py
"""
import math
import os
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sawtooth, square

SR = 44100
OUT_DIR = "/tmp/music"

# ---------------------------------------------------------------- note utils
NOTE_MAP = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def nf(name):
    """Note name (e.g. 'F#3') -> frequency in Hz."""
    if isinstance(name, (int, float)):
        return float(name)
    pitch = name[:-1]
    octave = int(name[-1])
    semi = NOTE_MAP[pitch] + (octave - 4) * 12 - 9  # A4 = 440
    return 440.0 * (2 ** (semi / 12.0))


CHORDS = {
    "C": ["C4", "E4", "G4"], "Cmaj7": ["C4", "E4", "G4", "B4"], "C6": ["C4", "E4", "G4", "A4"],
    "Cmaj9": ["C4", "E4", "G4", "B4", "D5"], "Csus": ["C4", "F4", "G4"],
    "Am": ["A3", "C4", "E4"], "Am7": ["A3", "C4", "E4", "G4"], "Am9": ["A3", "C4", "E4", "B4"],
    "F": ["F3", "A3", "C4"], "Fmaj7": ["F3", "A3", "C4", "E4"], "F6": ["F3", "A3", "C4", "D4"],
    "G": ["G3", "B3", "D4"], "G7": ["G3", "B3", "D4", "F4"], "Gsus": ["G3", "C4", "D4"],
    "Em": ["E3", "G3", "B3"], "Em7": ["E3", "G3", "B3", "D4"], "Dm": ["D3", "F3", "A3"],
    "D": ["D3", "F#3", "A3"], "Dmaj7": ["D3", "F#3", "A3", "C#4"], "D7": ["D3", "F#3", "A3", "C4"],
    "A": ["A3", "C#4", "E4"], "A7": ["A3", "C#4", "E4", "G4"], "E": ["E3", "G#3", "B3"],
    "E7": ["E3", "G#3", "B3", "D4"], "Bm": ["B3", "D4", "F#4"], "Bm7": ["B3", "D4", "F#4", "A4"],
    "F#m": ["F#3", "A3", "C#4"], "F#m7": ["F#3", "A3", "C#4", "E4"], "Gm": ["G3", "A#3", "D4"],
    "Cm": ["C4", "D#4", "G4"], "Bb": ["A#3", "D4", "F4"], "Ebmaj7": ["D#4", "G4", "A#4", "D5"],
    "Fm7": ["F3", "G#3", "C4", "D#4"], "Ab": ["G#3", "C4", "D#4"], "Bbmaj7": ["A#3", "D4", "F4", "A4"],
}

ROOTS = {
    "C": "C2", "Cmaj7": "C2", "C6": "C2", "Cmaj9": "C2", "Csus": "C2",
    "Am": "A1", "Am7": "A1", "Am9": "A1", "F": "F1", "Fmaj7": "F1", "F6": "F1",
    "G": "G1", "G7": "G1", "Gsus": "G1", "Em": "E2", "Em7": "E2", "Dm": "D2",
    "D": "D2", "Dmaj7": "D2", "D7": "D2", "A": "A1", "A7": "A1", "E": "E2", "E7": "E2",
    "Bm": "B1", "Bm7": "B1", "F#m": "F#1", "F#m7": "F#1", "Gm": "G1", "Cm": "C2",
    "Bb": "A#1", "Ebmaj7": "D#2", "Fm7": "F1", "Ab": "G#1", "Bbmaj7": "A#1",
}


def chord_notes(name):
    return [nf(n) for n in CHORDS[name]]


def chord_root(name):
    return nf(ROOTS.get(name, CHORDS[name][0]))


def note_at(name, semitones=0, octaves=0):
    return nf(name) * (2 ** (octaves + semitones / 12.0))


# ---------------------------------------------------------------- helpers
def env_adsr(n, attack, decay, sustain, release, curve=2.0):
    a = max(1, int(attack * SR))
    d = max(1, int(decay * SR))
    r = max(1, int(release * SR))
    sus = max(0, n - a - d - r)
    parts = [
        np.linspace(0, 1, a) ** (1 / curve),
        np.linspace(1, sustain, d) ** curve,
        np.full(sus, sustain),
        np.linspace(sustain, 0, r) ** curve,
    ]
    e = np.concatenate(parts)
    if len(e) < n:
        e = np.concatenate([e, np.zeros(n - len(e))])
    return e[:n]


def lowpass(x, cutoff, order=2):
    cutoff = min(cutoff, SR * 0.45)
    b, a = butter(order, cutoff / (SR / 2), btype="low")
    return lfilter(b, a, x)


def highpass(x, cutoff, order=2):
    b, a = butter(order, max(20, cutoff) / (SR / 2), btype="high")
    return lfilter(b, a, x)


def bandpass(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], btype="band")
    return lfilter(b, a, x)


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def n_samples(dur):
    return max(1, int(dur * SR))


# ---------------------------------------------------------------- voices
def v_piano(freq, dur, vel=0.8, bright=1.0):
    n = n_samples(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    partials = [(1.0, 1.0, 0.55), (2.003, 0.42, 0.85), (3.006, 0.24, 1.15),
                (4.01, 0.13, 1.5), (5.02, 0.08, 1.9), (6.03, 0.05, 2.3), (8.05, 0.03, 3.0)]
    for mult, amp, dec in partials:
        decay = np.exp(-t * (dec * (2.4 - bright * 0.9)) * (1 + freq / 3000))
        out += amp * np.sin(2 * math.pi * freq * mult * t) * decay
    # gentle detuned second string for richness
    for det in (-0.14, 0.16):
        out += 0.18 * np.sin(2 * math.pi * freq * (1 + det / 100) * t) * np.exp(-t * 1.5)
    # hammer transient
    click = np.exp(-t * 320) * np.random.uniform(-1, 1, n) * 0.05 * bright
    attack = 1 - np.exp(-t * 500)
    body = out * attack + click
    rel = np.ones(n)
    rel_len = min(n, int(0.05 * SR))
    rel[-rel_len:] = np.linspace(1, 0, rel_len) ** 2
    return body * rel * vel * 0.5


def v_pluck(freq, dur, vel=0.8, damp=0.5, bright=0.5, drive=1.0):
    """Karplus-Strong plucked string (guitar, ukulele, harp)."""
    n = n_samples(dur)
    N = max(2, int(SR / freq))
    rng = np.random.default_rng(int(freq * 7) % 99991)
    burst = rng.uniform(-1, 1, N)
    burst = lowpass(burst, 1800 + bright * 6500) if bright > 0.05 else burst
    burst -= burst.mean()
    g = 0.9985 - damp * 0.006
    a = np.zeros(N + 2)
    a[0] = 1.0
    a[N] = -0.5 * g
    a[N + 1] = -0.5 * g
    y = lfilter(np.array([1.0]), a, np.concatenate([burst, np.zeros(n)]))[:n]
    y = highpass(y, 90)
    e = np.ones(n)
    tail = min(n, int(0.03 * SR))
    e[-tail:] = np.linspace(1, 0, tail)
    out = soft_clip(y * 1.4, drive) * e * vel
    return out


def v_strings(freq, dur, vel=0.5, attack=0.25, cutoff=2600, vib=0.004):
    n = n_samples(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.35, -0.12, 0.1, 0.33):
        f = freq * (1 + det / 100)
        vibsig = 1 + vib * np.sin(2 * math.pi * 5.2 * t + det)
        out += sawtooth(2 * math.pi * f * t * vibsig)
    out /= 4
    out = lowpass(out, cutoff * (0.8 + freq / 2000))
    return out * env_adsr(n, attack, 0.1, 0.8, 0.35) * vel * 0.5


def v_pad(freq, dur, vel=0.4, cutoff=1800):
    n = n_samples(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det, pwm in [(-0.5, 0.45), (0.0, 0.5), (0.55, 0.55)]:
        out += square(2 * math.pi * freq * (1 + det / 100) * t, duty=pwm) * 0.6
        out += sawtooth(2 * math.pi * freq * 0.5 * (1 + det / 150) * t) * 0.4
    out /= 3
    out = lowpass(out, cutoff)
    return out * env_adsr(n, min(dur * 0.4, 1.1), 0.3, 0.75, 0.6) * vel * 0.42


def v_fm(freq, dur, vel=0.7, ratio=2.0, index=3.0, idecay=6.0, dec=3.0, bright=0.0):
    """FM voice — electric piano, marimba, glockenspiel, bells."""
    n = n_samples(dur)
    t = np.arange(n) / SR
    mod_env = np.exp(-t * idecay)
    mod = index * mod_env * np.sin(2 * math.pi * freq * ratio * t)
    carrier = np.sin(2 * math.pi * freq * t + mod)
    carrier += bright * 0.3 * np.sin(2 * math.pi * freq * ratio * 2.998 * t + mod * 0.4)
    body = np.exp(-t * dec)
    attack = 1 - np.exp(-t * 700)
    return carrier * body * attack * vel * 0.55


def v_lead(freq, dur, vel=0.6, kind="saw"):
    n = n_samples(dur)
    t = np.arange(n) / SR
    vib = 1 + 0.0045 * np.sin(2 * math.pi * 5.6 * t) * np.clip(t * 4, 0, 1)
    if kind == "saw":
        out = sawtooth(2 * math.pi * freq * t * vib) * 0.7 + sawtooth(2 * math.pi * freq * 1.006 * t * vib) * 0.4
    elif kind == "square":
        out = square(2 * math.pi * freq * t * vib, duty=0.42) * 0.7 + square(2 * math.pi * freq * 0.997 * t * vib, duty=0.5) * 0.3
    else:
        out = np.sin(2 * math.pi * freq * t * vib)
    out = lowpass(out, 4200)
    return out * env_adsr(n, 0.02, 0.05, 0.75, min(0.25, dur * 0.4)) * vel * 0.42


def v_flute(freq, dur, vel=0.55):
    n = n_samples(dur)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * math.pi * 5.0 * t) * np.clip((t - 0.1) * 3, 0, 1)
    out = np.sin(2 * math.pi * freq * t * vib) * 0.9
    out += np.sin(2 * math.pi * freq * 2 * t * vib) * 0.12
    breath = bandpass(np.random.uniform(-1, 1, n), 1200, 5200) * 0.06
    return (out + breath) * env_adsr(n, 0.06, 0.05, 0.85, min(0.2, dur * 0.35)) * vel * 0.5


def v_bass(freq, dur, vel=0.8, sub=0.35):
    n = n_samples(dur)
    t = np.arange(n) / SR
    out = np.sin(2 * math.pi * freq * t) + sub * np.sin(2 * math.pi * freq * 0.5 * t)
    out += 0.22 * sawtooth(2 * math.pi * freq * t)
    out = lowpass(out, 1400)
    out = soft_clip(out * 1.3, 1.2)
    return out * env_adsr(n, 0.008, 0.06, 0.75, min(0.09, dur * 0.4)) * vel * 0.55


def v_organ(freq, dur, vel=0.5):
    n = n_samples(dur)
    t = np.arange(n) / SR
    out = np.sin(2 * math.pi * freq * t) * 0.6
    out += np.sin(2 * math.pi * freq * 2 * t) * 0.3
    out += np.sin(2 * math.pi * freq * 3 * t) * 0.18
    out += np.sin(2 * math.pi * freq * 0.5 * t) * 0.3
    return lowpass(out, 3000) * env_adsr(n, 0.03, 0.05, 0.9, min(0.15, dur * 0.3)) * vel * 0.5


# ---------------------------------------------------------------- drums
def d_kick(vel=1.0):
    n = n_samples(0.5)
    t = np.arange(n) / SR
    f = 118 * np.exp(-t * 32) + 44
    body = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5)
    click = np.exp(-t * 900) * np.random.uniform(-1, 1, n) * 0.35
    return soft_clip((body + click) * 1.1, 1.3) * vel * 0.95


def d_snare(vel=0.8, tone=200.0):
    n = n_samples(0.35)
    t = np.arange(n) / SR
    noise = bandpass(np.random.uniform(-1, 1, n), 900, 7500) * np.exp(-t * 16)
    bodytone = (np.sin(2 * math.pi * tone * t) + 0.6 * np.sin(2 * math.pi * tone * 1.5 * t)) * np.exp(-t * 26)
    return (noise * 0.85 + bodytone * 0.5) * vel * 0.8


def d_clap(vel=0.8):
    n = n_samples(0.45)
    t = np.arange(n) / SR
    base = bandpass(np.random.uniform(-1, 1, n), 1000, 4200)
    env = np.zeros(n)
    for delay, amp in [(0.000, 1.0), (0.011, 0.85), (0.022, 0.7), (0.033, 0.5)]:
        idx = int(delay * SR)
        seg = np.zeros(n)
        seg[idx:] = np.exp(-np.arange(n - idx) / SR * 40)
        env += seg * amp
    env += np.exp(-t * 9) * 0.55  # room tail
    return base * env * vel * 0.5


def d_hat(open_=False, vel=0.6):
    dur = 0.45 if open_ else 0.09
    n = n_samples(dur)
    t = np.arange(n) / SR
    noise = np.random.uniform(-1, 1, n)
    noise = highpass(noise, 6800)
    noise += bandpass(noise, 9000, 14000) * 0.5
    d = 7.0 if open_ else 60.0
    return noise * np.exp(-t * d) * vel * (0.3 if open_ else 0.36)


def d_shaker(vel=0.4):
    n = n_samples(0.13)
    t = np.arange(n) / SR
    noise = bandpass(np.random.uniform(-1, 1, n), 4200, 11000)
    env = np.exp(-((t - 0.022) ** 2) / (2 * 0.012 ** 2))
    return noise * env * vel * 0.5


def d_tom(freq=170.0, vel=0.7):
    n = n_samples(0.45)
    t = np.arange(n) / SR
    f = freq * np.exp(-t * 4.5) + freq * 0.6
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * vel * 0.7


def d_crash(vel=0.5):
    n = n_samples(1.8)
    t = np.arange(n) / SR
    noise = highpass(np.random.uniform(-1, 1, n), 4200)
    noise += bandpass(np.random.uniform(-1, 1, n), 2500, 5000) * 0.5
    return noise * np.exp(-t * 2.6) * vel * 0.42


def d_ride(vel=0.35):
    n = n_samples(0.8)
    t = np.arange(n) / SR
    noise = highpass(np.random.uniform(-1, 1, n), 5200) * np.exp(-t * 6)
    ping = np.sin(2 * math.pi * 1750 * t) * np.exp(-t * 14) * 0.3
    return (noise * 0.7 + ping) * vel * 0.4


def d_stomp(vel=0.7):
    n = n_samples(0.4)
    t = np.arange(n) / SR
    thud = np.sin(2 * math.pi * (72 * np.exp(-t * 22) + 42) * t) * np.exp(-t * 11)
    body = lowpass(np.random.uniform(-1, 1, n), 300) * np.exp(-t * 16)
    return (thud * 1.1 + body * 0.8) * vel * 0.85


def d_timpani(freq=98.0, vel=0.8):
    n = n_samples(1.4)
    t = np.arange(n) / SR
    f = freq * np.exp(-t * 2.2) + freq * 0.92
    tone = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    tone += 0.3 * np.sin(2 * math.pi * np.cumsum(f * 1.5) / SR) * np.exp(-t * 5)
    thump = lowpass(np.random.uniform(-1, 1, n), 500) * np.exp(-t * 22) * 0.5
    return (tone + thump) * vel * 0.75


def d_boom(vel=0.9):
    """Cinematic sub impact for the epic track."""
    n = n_samples(1.6)
    t = np.arange(n) / SR
    sub = np.sin(2 * math.pi * np.cumsum(60 * np.exp(-t * 2.0) + 28) / SR) * np.exp(-t * 3.0)
    rumble = lowpass(np.random.uniform(-1, 1, n), 220) * np.exp(-t * 4) * 1.4
    return (sub + rumble) * vel * 0.85


DRUMS = {
    "kick": d_kick, "snare": d_snare, "clap": d_clap, "hat": lambda vel=0.6: d_hat(False, vel),
    "ohat": lambda vel=0.5: d_hat(True, vel), "shaker": d_shaker, "tom": d_tom,
    "crash": d_crash, "ride": d_ride, "stomp": d_stomp, "timpani": d_timpani, "boom": d_boom,
}


# ---------------------------------------------------------------- song builder
class Song:
    def __init__(self, bpm, bars, beats_per_bar=4):
        self.bpm = bpm
        self.bars = bars
        self.bpb = beats_per_bar
        self.beat = 60.0 / bpm
        self.total_beats = bars * beats_per_bar
        self.length = int(self.total_beats * self.beat * SR) + SR
        self.L = np.zeros(self.length)
        self.R = np.zeros(self.length)
        self.rev_send = np.zeros(self.length)

    def add(self, sig, at_beat, gain=1.0, pan=0.0, rev=0.0, jitter=0.0):
        if jitter > 0:
            at_beat += float(np.random.default_rng().normal(0, jitter))
            at_beat = max(0.0, at_beat)
        i = int(at_beat * self.beat * SR)
        if i >= self.length:
            return
        seg = sig[: self.length - i]
        l_gain = gain * math.sqrt(max(0.0, (1 - pan) / 2 + 0.5 * 0))
        r_gain = gain * math.sqrt(max(0.0, (1 + pan) / 2 + 0.5 * 0))
        # equal-power pan
        ang = (pan + 1) * math.pi / 4
        l_gain = gain * math.cos(ang)
        r_gain = gain * math.sin(ang)
        self.L[i : i + len(seg)] += seg * l_gain
        self.R[i : i + len(seg)] += seg * r_gain
        if rev > 0:
            self.rev_send[i : i + len(seg)] += seg * gain * rev

    # -- musical helpers -------------------------------------------------
    def drum(self, name, at_beat, gain=1.0, vel=1.0, pan=0.0, rev=0.0):
        self.add(DRUMS[name](vel), at_beat, gain=gain, pan=pan, rev=rev)

    def pattern(self, name, pattern, start_beat, steps_per_beat=4, gain=1.0, vel=1.0, pan=0.0, rev=0.0):
        step = 1.0 / steps_per_beat
        for k, ch in enumerate(pattern):
            if ch in "xXoO":
                v = vel * (1.0 if ch in "xX" else 0.6)
                self.drum(name, start_beat + k * step, gain=gain, vel=v, pan=pan, rev=rev)

    def chord(self, name, at_beat, dur_beats, voice, gain=1.0, pan=0.0, rev=0.0, oct_shift=0, spread=0.0, vel=0.8, **vkw):
        for i, note in enumerate(chord_notes(name)):
            p = pan + (spread * (i - (len(CHORDS[name]) - 1) / 2))
            sig = voice(note_at(note, octaves=oct_shift), dur_beats * self.beat, vel, **vkw)
            self.add(sig, at_beat, gain=gain, pan=max(-1, min(1, p)), rev=rev, jitter=0.004)

    def arp(self, name, at_beat, dur_beats, steps, voice, gain=1.0, pan=0.0, rev=0.0, oct_shift=1,
            vel=0.7, updown=False, order=None, **vkw):
        notes = chord_notes(name)
        if order:
            idxs = order
        elif updown:
            idxs = list(range(len(notes))) + list(range(len(notes) - 2, 0, -1))
        else:
            idxs = list(range(len(notes)))
        step = dur_beats / steps
        for k in range(steps):
            note = notes[idxs[k % len(idxs)]]
            pan_n = pan + 0.16 * math.sin(2 * math.pi * k / max(1, steps))
            sig = voice(note_at(note, octaves=oct_shift), step * self.beat * 1.7, vel * (1.0 if k % 2 == 0 else 0.78), **vkw)
            self.add(sig, at_beat + k * step, gain=gain, pan=pan_n, rev=rev, jitter=0.004)

    def mel(self, events, voice, gain=1.0, pan=0.0, rev=0.0, base_beat=0.0, **vkw):
        for ev in events:
            at, note, dur, vel = ev
            sig = voice(nf(note), dur * self.beat * 1.05, vel, **vkw)
            self.add(sig, base_beat + at, gain=gain, pan=pan + 0.05 * math.sin(at * 1.7), rev=rev, jitter=0.006)

    def bassline(self, name, at_beat, dur_beats, voice, gain=1.0, oct_shift=0, vel=0.85, **vkw):
        self.add(voice(chord_root(name) * (2 ** oct_shift), dur_beats * self.beat, vel, **vkw), at_beat, gain=gain)

    # -- finish ----------------------------------------------------------
    def _reverb_ir(self, seconds=1.9, decay=3.6, pre_lowpass=5200):
        n = int(seconds * SR)
        t = np.arange(n) / SR
        rng = np.random.default_rng(7)
        ir = rng.uniform(-1, 1, n) * np.exp(-t * decay)
        ir = lowpass(ir, pre_lowpass)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        # early reflections
        for d, g in [(0.011, 0.5), (0.019, 0.4), (0.027, 0.32), (0.041, 0.25), (0.058, 0.2)]:
            idx = int(d * SR)
            if idx < n:
                ir[idx] += g
        return ir / np.abs(ir).max()

    def render(self, rev_amount=0.22, rev_seconds=1.9, rev_decay=3.6, tail_beats=1.2):
        if rev_amount > 0:
            ir = self._reverb_ir(rev_seconds, rev_decay)
            wet_l = fftconvolve(self.rev_send, ir)[: self.length] * rev_amount
            wet_r = fftconvolve(self.rev_send, ir * np.linspace(1.0, 0.94, len(ir)))[: self.length] * rev_amount
            self.L += wet_l
            self.R += wet_r
        # trim trailing silence, keep a short musical tail
        keep = int((self.total_beats + tail_beats) * self.beat * SR)
        L, R = self.L[:keep], self.R[:keep]
        # master chain: rumble filter, gentle glue, stereo width, limiter
        L, R = highpass(L, 28), highpass(R, 28)
        mid, side = (L + R) / 2, (L - R) / 2
        # Wide, airy image: asymmetric short delays decorrelate the channels
        d1, d2 = int(0.0085 * SR), int(0.0125 * SR)
        L = L + 0.42 * np.concatenate([np.zeros(d1), R[:-d1]])
        R = R + 0.42 * np.concatenate([np.zeros(d2), L[:-d2]])
        L, R = L * 0.78, R * 0.78
        mid, side = (L + R) / 2, (L - R) / 2
        side *= 1.25
        L, R = mid + side, mid - side
        peak = max(np.abs(L).max(), np.abs(R).max())
        if peak > 0:
            L, R = L / peak, R / peak
        L, R = soft_clip(L * 1.02, 1.15) / soft_clip(np.array([1.02]), 1.15)[0], soft_clip(R * 1.02, 1.15) / soft_clip(np.array([1.02]), 1.15)[0]
        peak = max(np.abs(L).max(), np.abs(R).max())
        L, R = L / peak * 0.95, R / peak * 0.95
        # click-free loop seam (kept very short so repeats stay seamless)
        fade = int(0.008 * SR)
        L[:fade] *= np.linspace(0, 1, fade)
        R[:fade] *= np.linspace(0, 1, fade)
        L[-fade:] *= np.linspace(1, 0, fade)
        R[-fade:] *= np.linspace(1, 0, fade)
        return L, R


def write_wav(path, L, R):
    data = np.empty(L.size * 2, dtype=np.int16)
    data[0::2] = np.clip(L, -1, 1) * 32767
    data[1::2] = np.clip(R, -1, 1) * 32767
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    rms = float(np.sqrt(np.mean((L ** 2 + R ** 2) / 2)))
    print(f"  {os.path.basename(path):26s} {L.size/SR:5.1f}s  peak={np.abs(L).max():.2f} rms={rms:.3f} ({20*math.log10(rms):.1f} dBFS)")
    return rms
