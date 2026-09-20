"""
Scenering — Lively Background Music Library (10 tracks)
=======================================================
Arrangements for scripts/music_engine.py. Every track is 12 bars, 4/4,
instrumental (no vocals), royalty-free (synthesised in-house), loopable.

Run:  python3 scripts/generate_lively_music.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from music_engine import (  # noqa: E402
    OUT_DIR, SR, Song, chord_notes, nf, note_at, v_bass, v_flute, v_fm, v_lead,
    v_organ, v_pad, v_piano, v_pluck, v_strings, write_wav,
)


def rep(phrase, times, span):
    """Repeat a (beat, note, dur, vel) phrase with a time offset."""
    out = []
    for i in range(times):
        out += [(at + i * span, n, d, v) for (at, n, d, v) in phrase]
    return out


# =============================================================== 1. uplifting
def t_sunrise_uplift():
    s = Song(bpm=120, bars=12)
    prog = [("C", 2), ("G", 2), ("Am", 2), ("F", 2), ("C", 2), ("G", 2)]
    b = 0
    for name, bars in prog:
        dur = bars * 4
        s.chord(name, b, dur, v_strings, gain=0.5, rev=0.5, oct_shift=0, spread=0.25)
        s.chord(name, b + 2, dur - 2, v_pad, gain=0.3, rev=0.4, oct_shift=-1, spread=0.2)
        # bass: root on 1 & 3, fifth pickup
        s.bassline(name, b, 2, v_bass, gain=0.9)
        s.bassline(name, b + 2, 2, v_bass, gain=0.75, oct_shift=1)
        for bar in range(bars):
            bb = b + bar * 4
            s.arp(name, bb, 4, 8, v_piano, gain=0.5, rev=0.35, oct_shift=1, vel=0.62)
            s.arp(name, bb + 2, 2, 4, v_piano, gain=0.36, rev=0.3, oct_shift=2, vel=0.5)
        b += dur

    # drums
    for bar in range(12):
        bb = bar * 4
        s.pattern("kick", "x.....x.....x..." if bar < 4 else "x...x...x...x...", bb, gain=0.95)
        if bar >= 2:
            s.pattern("clap", "....x.......x...", bb, gain=0.6, rev=0.25)
        if bar >= 1:
            s.pattern("hat", "..x...x...x...x.", bb, gain=0.5)
            s.pattern("shaker", "x.x.x.x.x.x.x.x.", bb, gain=0.34)
        if bar in (3, 7, 11):
            s.drum("crash", bb, gain=0.5, rev=0.5)
    s.drum("crash", 32, gain=0.55, rev=0.5)

    # bright bell melody (bars 5-12) — singable, rising
    m = rep([(0, "G4", 0.5, 0.85), (0.5, "A4", 0.5, 0.8), (1, "C5", 1, 0.9),
             (2, "E5", 0.5, 0.85), (2.5, "D5", 0.5, 0.8), (3, "C5", 1, 0.85)], 1, 0)
    m2 = rep([(0, "E5", 0.5, 0.9), (0.5, "G5", 0.5, 0.85), (1, "A5", 1, 0.9),
              (2, "G5", 0.5, 0.85), (2.5, "E5", 0.5, 0.8), (3, "D5", 1, 0.85)], 1, 0)
    m3 = rep([(0, "C5", 0.5, 0.9), (0.5, "D5", 0.5, 0.85), (1, "E5", 1, 0.9),
              (2, "G5", 1, 0.95), (3, "E5", 1, 0.85)], 1, 0)
    m4 = rep([(0, "A4", 0.5, 0.9), (0.5, "C5", 0.5, 0.85), (1, "D5", 1, 0.9),
              (2, "C5", 2, 0.9)], 1, 0)
    v = v_fm
    s.mel(m, v, gain=0.62, rev=0.45, base_beat=16)
    s.mel(m2, v, gain=0.62, rev=0.45, base_beat=24)
    s.mel(m3, v, gain=0.66, rev=0.45, base_beat=32)
    s.mel(m4, v, gain=0.66, rev=0.45, base_beat=40)
    s.mel(m2, v, gain=0.6, rev=0.45, base_beat=44)
    return s, dict(rev_amount=0.26)


# =============================================================== 2. joyful acoustic
def t_happy_strum():
    s = Song(bpm=116, bars=12)
    prog = [("G", 2), ("Em", 2), ("C", 2), ("D", 2), ("C", 2), ("D", 2)]
    b = 0
    for name, bars in prog:
        dur = bars * 4
        for bar in range(bars):
            bb = b + bar * 4
            # down-up ukulele strumming on 8ths
            for k in range(8):
                gain = 0.62 if k % 2 == 0 else 0.4
                notes = chord_notes(name)
                for i, note in enumerate(notes):
                    sig = v_pluck(note_at(note, octaves=1), 0.6, 0.7 * gain)
                    s.add(sig, bb + k * 0.5, gain=0.5, pan=-0.25 + 0.18 * i, rev=0.22)
            s.bassline(name, bb, 2, v_bass, gain=0.8)
            s.bassline(name, bb + 2, 1.5, v_bass, gain=0.7, oct_shift=1)
        b += dur

    for bar in range(12):
        bb = bar * 4
        if bar >= 1:
            s.pattern("kick", "x.......x.......", bb, gain=0.85)
            s.pattern("clap", "....x.......x...", bb, gain=0.62, rev=0.3)
            s.pattern("shaker", "x.x.x.x.x.x.x.x.", bb, gain=0.3)
            s.pattern("hat", "..x...x...x...x.", bb, gain=0.34)
    s.drum("crash", 0, gain=0.4, rev=0.5)
    s.drum("crash", 32, gain=0.5, rev=0.5)

    # whistle-like lead — playful, hopping
    lead = rep([(0, "D5", 0.5, 0.9), (0.5, "E5", 0.5, 0.85), (1, "G5", 1, 0.95),
                (2, "E5", 0.5, 0.85), (2.5, "D5", 0.5, 0.8), (3, "B4", 1, 0.85)], 1, 0)
    lead2 = rep([(0, "G5", 1, 0.95), (1, "A5", 0.5, 0.9), (1.5, "G5", 0.5, 0.85),
                 (2, "E5", 1.5, 0.9), (3.5, "D5", 0.5, 0.8)], 1, 0)
    lead3 = rep([(0, "E5", 0.5, 0.9), (0.5, "G5", 0.5, 0.9), (1, "A5", 1, 0.95),
                 (2, "G5", 0.5, 0.9), (2.5, "E5", 0.5, 0.85), (3, "D5", 1, 0.9)], 1, 0)
    lead4 = rep([(0, "D5", 1, 0.9), (1, "E5", 1, 0.9), (2, "G5", 2, 1.0)], 1, 0)
    for phrase, beat in [(lead, 16), (lead2, 24), (lead3, 32), (lead4, 40)]:
        s.mel(phrase, v_flute, gain=0.7, rev=0.4, base_beat=beat)
    return s, dict(rev_amount=0.2, rev_seconds=1.5)


# =============================================================== 3. modern tech
def t_tech_bounce():
    s = Song(bpm=122, bars=12)
    prog = [("Am", 2), ("F", 2), ("C", 2), ("G", 2), ("Am", 2), ("F", 2)]
    b = 0
    for name, bars in prog:
        for bar in range(bars):
            bb = b + bar * 4
            s.arp(name, bb, 2, 8, v_pluck, gain=0.5, rev=0.18, oct_shift=1, vel=0.7)
            s.arp(name, bb + 2, 2, 8, v_pluck, gain=0.4, rev=0.18, oct_shift=2, vel=0.55)
            # syncopated bass
            s.bassline(name, bb, 0.75, v_bass, gain=0.95)
            s.bassline(name, bb + 1.5, 0.5, v_bass, gain=0.7)
            s.bassline(name, bb + 2, 0.75, v_bass, gain=0.9)
            s.bassline(name, bb + 3.25, 0.75, v_bass, gain=0.7, oct_shift=1)
        b += bars * 4
    s.chord("Am", 0, 4, v_pad, gain=0.2, rev=0.3)

    for bar in range(12):
        bb = bar * 4
        s.pattern("kick", "x...x...x...x...", bb, gain=1.0)
        if bar >= 2:
            s.pattern("clap", "....x.......x...", bb, gain=0.62, rev=0.2)
            s.pattern("hat", "..x...x...x...x.", bb, gain=0.42)
        if bar >= 6:
            s.pattern("shaker", "x.xxx.xxx.xxx.xx", bb, gain=0.26)
        if bar in (3, 5, 7, 9):
            s.pattern("tom", "............x.x.", bb, gain=0.4)
        if bar in (3, 11):
            s.drum("crash", bb, gain=0.42, rev=0.4)
    s.drum("crash", 32, gain=0.5, rev=0.45)

    # catchy pluck hook
    hook = rep([(0, "A4", 0.5, 0.9), (0.5, "C5", 0.5, 0.85), (1, "E5", 1, 0.95),
                (2, "D5", 0.5, 0.9), (2.5, "C5", 0.5, 0.85), (3, "A4", 1, 0.9)], 1, 0)
    hook2 = rep([(0, "F5", 0.5, 0.95), (0.5, "E5", 0.5, 0.9), (1, "C5", 1, 0.9),
                 (2, "D5", 0.5, 0.9), (2.5, "E5", 0.5, 0.9), (3, "G5", 1, 0.95)], 1, 0)
    hook3 = rep([(0, "E5", 0.5, 0.9), (0.5, "G5", 0.5, 0.9), (1, "A5", 1, 0.95),
                 (2, "G5", 0.5, 0.9), (2.5, "E5", 0.5, 0.85), (3, "D5", 1, 0.9)], 1, 0)
    for phrase, beat in [(hook, 16), (hook2, 24), (hook3, 32), (hook2, 40)]:
        s.mel(phrase, lambda f, d, v=0.8: v_lead(f, d, v, kind="square"), gain=0.5, rev=0.3, base_beat=beat)
    return s, dict(rev_amount=0.18, rev_seconds=1.4)


# =============================================================== 4. playful marimba
def t_marimba_hop():
    s = Song(bpm=118, bars=12)
    prog = [("F", 2), ("Dm", 2), ("Bb", 2), ("C", 2), ("F", 2), ("Dm", 2)]
    b = 0
    for name, bars in prog:
        for bar in range(bars):
            bb = b + bar * 4
            s.bassline(name, bb, 1.5, v_pluck, gain=0.75, vel=0.85)
            s.bassline(name, bb + 2, 1.5, v_pluck, gain=0.6, oct_shift=1, vel=0.7)
            s.chord(name, bb + 1, 1, v_fm, gain=0.3, rev=0.3, oct_shift=1, spread=0.3, vel=0.5)
            s.chord(name, bb + 3, 1, v_fm, gain=0.26, rev=0.3, oct_shift=1, spread=0.3, vel=0.45)
        b += bars * 4

    for bar in range(12):
        bb = bar * 4
        s.pattern("kick", "x.......x.......", bb, gain=0.8)
        s.pattern("shaker", "x.xxx.xxx.xxx.xx", bb, gain=0.3)
        if bar >= 4:
            s.pattern("clap", "....x.......x...", bb, gain=0.45, rev=0.25)
            s.pattern("hat", "..x...x...x...x.", bb, gain=0.3)
        if bar in (3, 7, 11):
            s.pattern("tom", "............x.x.", bb, gain=0.45)
    s.drum("crash", 32, gain=0.4, rev=0.45)

    # bouncy marimba melody
    mar = lambda f, d, v=0.8: v_fm(f, d, v, ratio=4.0, index=1.6, idecay=9, dec=8, bright=0.2)
    mel = rep([(0, "C5", 0.5, 0.9), (0.5, "F5", 0.5, 0.85), (1, "A5", 1, 0.9),
               (2, "G5", 0.5, 0.85), (2.5, "F5", 0.5, 0.85), (3, "C5", 1, 0.8)], 1, 0)
    mel2 = rep([(0, "D5", 0.5, 0.9), (0.5, "F5", 0.5, 0.85), (1, "A5", 1, 0.9),
                (2, "C6", 1, 0.95), (3, "A5", 1, 0.85)], 1, 0)
    mel3 = rep([(0, "F5", 0.5, 0.9), (0.5, "G5", 0.5, 0.9), (1, "A5", 1, 0.9),
                (2, "C6", 0.5, 0.95), (2.5, "A5", 0.5, 0.85), (3, "G5", 1, 0.9)], 1, 0)
    mel4 = rep([(0, "A5", 0.5, 0.9), (0.5, "G5", 0.5, 0.85), (1, "F5", 1, 0.9),
                (2, "C5", 2, 0.9)], 1, 0)
    for phrase, beat in [(mel, 16), (mel2, 24), (mel3, 32), (mel4, 40)]:
        s.mel(phrase, mar, gain=0.6, rev=0.35, base_beat=beat)
    return s, dict(rev_amount=0.2, rev_seconds=1.4)


# =============================================================== 5. epic triumph
def t_triumph_rise():
    s = Song(bpm=104, bars=12)
    prog = [("D", 2), ("Bm", 2), ("G", 2), ("A", 2), ("D", 2), ("A", 2)]
    b = 0
    for idx, (name, bars) in enumerate(prog):
        for bar in range(bars):
            bb = b + bar * 4
            # string ostinato in 8ths
            for k in range(8):
                note = chord_notes(name)[k % len(chord_notes(name))]
                sig = v_strings(note_at(note, octaves=1), 0.42, 0.5 if k % 2 == 0 else 0.36, attack=0.03, cutoff=3200)
                s.add(sig, bb + k * 0.5, gain=0.5, pan=0.1 * (k % 2), rev=0.4)
            s.chord(name, bb, 4, v_strings, gain=0.55, rev=0.55, oct_shift=0, spread=0.3)
            s.chord(name, bb, 4, v_pad, gain=0.3, rev=0.4, oct_shift=-2, spread=0.2)
            s.bassline(name, bb, 4, v_bass, gain=0.95, oct_shift=0)
        b += bars * 4

    for bar in range(12):
        bb = bar * 4
        if bar >= 2:
            s.pattern("kick", "x...x...x...x...", bb, gain=0.75)
            s.pattern("timpani", "x.......x.......", bb, gain=0.8)
        if bar >= 6:
            s.pattern("ride", "x.x.x.x.x.x.x.x.", bb, gain=0.22)
            s.pattern("snare", "....x.......x...", bb, gain=0.3, rev=0.25)
        if bar in (0, 4, 8):
            s.drum("burst" if False else "timpani", bb, gain=1.0, vel=1.0, rev=0.5)
            s.drum("boom", bb, gain=0.85, rev=0.4)
        if bar in (4, 8, 11):
            s.drum("crash", bb, gain=0.5, rev=0.55)
        if bar in (7, 11):
            s.pattern("tom", "..x.x...x.x.x.x.", bb, gain=0.4)

    # heroic brass-like lead (bars 5-12)
    brass = lambda f, d, v=0.8: v_lead(f, d, v * 0.95, kind="saw")
    hero = rep([(0, "D5", 1, 0.95), (1, "F#5", 1, 0.9), (2, "A5", 1.5, 1.0),
                (3.5, "G5", 0.5, 0.85)], 1, 0)
    hero2 = rep([(0, "F#5", 1, 0.95), (1, "E5", 1, 0.9), (2, "D5", 2, 0.95)], 1, 0)
    hero3 = rep([(0, "A5", 1, 1.0), (1, "B5", 1, 0.95), (2, "D6", 2, 1.0)], 1, 0)
    hero4 = rep([(0, "C#6", 1, 0.95), (1, "B5", 1, 0.9), (2, "A5", 2, 0.95)], 1, 0)
    for phrase, beat in [(hero, 16), (hero2, 24), (hero3, 32), (hero4, 40)]:
        s.mel(phrase, brass, gain=0.5, rev=0.5, base_beat=beat)
    return s, dict(rev_amount=0.3, rev_seconds=2.4, rev_decay=3.0)


# =============================================================== 6. tender piano
def t_gentle_reflection():
    s = Song(bpm=76, bars=10)
    prog = [("Am", 2), ("F", 2), ("C", 2), ("G", 2), ("Am", 2)]
    b = 0
    for name, bars in prog:
        dur = bars * 4
        s.chord(name, b, dur, v_pad, gain=0.34, rev=0.55, oct_shift=-1, spread=0.25)
        s.chord(name, b, dur, v_strings, gain=0.22, rev=0.6, oct_shift=0, spread=0.3, attack=0.6)
        # gentle broken-chord left hand
        for k in range(bars * 4):
            notes = chord_notes(name) + chord_notes(name)[::-1]
            note = notes[(k * 2) % len(notes)]
            s.add(v_piano(note_at(note, octaves=-1), 2.2, 0.42), b + k * 1.0, gain=0.5, pan=-0.22, rev=0.4)
            note2 = notes[(k * 2 + 1) % len(notes)]
            s.add(v_piano(note_at(note2, octaves=-1), 2.0, 0.32), b + k * 1.0 + 0.5, gain=0.36, pan=0.2, rev=0.4)
        s.bassline(name, b, 4, v_bass, gain=0.5, oct_shift=-1)
        b += dur

    # expressive melody, humanised timing
    mel = [(0.02, "E5", 1.5, 0.8), (1.5, "C5", 0.5, 0.7), (2.0, "D5", 2.0, 0.8),
           (4.0, "C5", 1.0, 0.75), (5.0, "A4", 2.0, 0.72), (7.0, "C5", 1.0, 0.7),
           (8.03, "G5", 1.5, 0.85), (9.5, "E5", 0.5, 0.7), (10.0, "D5", 2.0, 0.8),
           (12.0, "E5", 1.0, 0.8), (13.0, "F5", 3.0, 0.85),
           (16.0, "A5", 2.0, 0.9), (18.0, "G5", 2.0, 0.85),
           (20.0, "F5", 1.5, 0.8), (21.5, "E5", 0.5, 0.72), (22.0, "D5", 2.0, 0.78),
           (24.0, "C5", 2.0, 0.8), (26.0, "E5", 2.0, 0.8),
           (28.0, "D5", 2.0, 0.8), (30.0, "C5", 2.0, 0.75),
           (32.0, "E5", 3.0, 0.85), (35.0, "D5", 1.0, 0.7),
           (36.0, "C5", 4.0, 0.8)]
    s.mel(mel, lambda f, d, v=0.8: v_piano(f, d, v, bright=0.8), gain=0.62, rev=0.55)
    return s, dict(rev_amount=0.3, rev_seconds=2.6, rev_decay=2.8)


# =============================================================== 7. lo-fi study
def t_lofi_study():
    s = Song(bpm=84, bars=12)
    prog = [("Am7", 2), ("Dm7" if "Dm7" in ("Dm7",) else "Dm", 2), ("Fmaj7", 2), ("G7", 2), ("Am7", 2), ("Fmaj7", 2)]
    prog[1] = ("Dm", 2)
    b = 0
    for name, bars in prog:
        dur = bars * 4
        for bar in range(bars):
            bb = b + bar * 4
            s.chord(name, bb + 0.02, 3.6, v_fm, gain=0.34, rev=0.45, oct_shift=0, spread=0.3, vel=0.55)
            s.bassline(name, bb, 2.5, v_bass, gain=0.85, sub=0.5)
            s.bassline(name, bb + 3, 0.9, v_bass, gain=0.6, oct_shift=1, sub=0.2)
        b += dur
    s.chord("Am7", 44, 4, v_fm, gain=0.3, rev=0.5, spread=0.3, vel=0.5)

    for bar in range(12):
        bb = bar * 4
        # lazy, swung groove
        s.drum("kick", bb, gain=0.95)
        s.drum("kick", bb + 2.5, gain=0.7)
        s.drum("snare", bb + 1, gain=0.55, vel=0.6, rev=0.3)
        s.drum("snare", bb + 3, gain=0.5, vel=0.55, rev=0.3)
        for k, off in enumerate([0.0, 0.66, 1.0, 1.66, 2.0, 2.66, 3.0, 3.66]):
            s.drum("hat", bb + off, gain=0.3 if k % 2 == 0 else 0.22, vel=0.5)
        s.drum("shaker", bb + 3.5, gain=0.22)
        if bar % 4 == 3:
            s.pattern("tom", "..........x.x...", bb, gain=0.32)
    # mellow riff
    rhodes_voice = lambda f, d, v=0.7: v_fm(f, d, v, ratio=2.0, index=1.4, idecay=4, dec=2.6, bright=0.3)
    riff_mel = rep([(0, "E5", 1, 0.75), (1, "C5", 0.5, 0.65), (1.5, "D5", 1.5, 0.7),
                    (3, "A4", 1, 0.62)], 1, 0)
    riff2 = rep([(0, "F5", 1, 0.78), (1, "E5", 0.5, 0.68), (1.5, "D5", 1.5, 0.72),
                 (3, "C5", 1, 0.65)], 1, 0)
    riff3 = rep([(0, "G5", 1, 0.8), (1, "E5", 0.5, 0.7), (1.5, "D5", 1, 0.7),
                 (2.5, "C5", 1.5, 0.68)], 1, 0)
    for phrase, beat in [(riff_mel, 16), (riff2, 24), (riff3, 32), (riff2, 40)]:
        s.mel(phrase, rhodes_voice, gain=0.5, rev=0.45, base_beat=beat)
    return s, dict(rev_amount=0.24, rev_seconds=1.7)


# =============================================================== 8. campfire folk
def t_acoustic_campfire():
    s = Song(bpm=96, bars=12)
    prog = [("G", 2), ("D", 2), ("Em", 2), ("C", 2), ("C", 2), ("G", 2)]
    b = 0
    for name, bars in prog:
        for bar in range(bars):
            bb = b + bar * 4
            notes = chord_notes(name)
            # fingerpicked pattern: bass, then upper strings
            s.add(v_pluck(note_at(notes[0], octaves=-1), 1.4, 0.85), bb, gain=0.62, pan=-0.2, rev=0.25)
            for k, (off, idx) in enumerate([(1.0, 1), (1.5, 2), (2.0, 1), (2.5, 2), (3.0, 1), (3.5, 2)]):
                s.add(v_pluck(note_at(notes[idx], octaves=0), 1.0, 0.62), bb + off, gain=0.44, pan=0.18, rev=0.25)
            s.add(v_pluck(note_at(notes[0], octaves=-1), 1.2, 0.7), bb + 2, gain=0.5, pan=-0.15, rev=0.25)
            s.bassline(name, bb, 2, v_bass, gain=0.72)
            s.bassline(name, bb + 2, 2, v_bass, gain=0.6, oct_shift=1)
        b += bars * 4
    for bar in range(12):
        bb = bar * 4
        if bar >= 1:
            s.pattern("kick", "x.......x.......", bb, gain=0.7)
            s.pattern("stomp", "x.......x.......", bb, gain=0.4)
            s.pattern("shaker", "..x...x...x...x.", bb, gain=0.3)
            s.pattern("clap", "....x.......x...", bb, gain=0.4, rev=0.3)
    # warm flute melody
    mel = rep([(0, "B4", 1, 0.8), (1, "D5", 1, 0.82), (2, "G5", 2, 0.9)], 1, 0)
    mel2 = rep([(0, "A5", 1, 0.85), (1, "G5", 1, 0.8), (2, "E5", 2, 0.82)], 1, 0)
    mel3 = rep([(0, "G5", 0.5, 0.82), (0.5, "A5", 0.5, 0.82), (1, "B5", 1.5, 0.9),
                (2.5, "A5", 0.5, 0.8), (3, "G5", 1, 0.8)], 1, 0)
    mel4 = rep([(0, "E5", 1, 0.8), (1, "D5", 1, 0.78), (2, "G5", 2, 0.88)], 1, 0)
    for phrase, beat in [(mel, 16), (mel2, 22), (mel3, 30), (mel4, 38)]:
        s.mel(phrase, v_flute, gain=0.62, rev=0.42, base_beat=beat)
    return s, dict(rev_amount=0.22, rev_seconds=1.6)


# =============================================================== 9. synthwave drive
def t_neon_drive():
    s = Song(bpm=112, bars=12)
    prog = [("F#m", 2), ("D", 2), ("A", 2), ("E", 2), ("F#m", 2), ("D", 2)]
    b = 0
    for name, bars in prog:
        dur = bars * 4
        s.chord(name, b, dur, v_pad, gain=0.34, rev=0.4, oct_shift=0, spread=0.3, cutoff=2300)
        for bar in range(bars):
            bb = b + bar * 4
            # driving 16th bass arpeggio
            for k in range(16):
                note = chord_notes(name)[k % 3]
                sig = v_bass(note_at(note, octaves=-1), 0.18, 0.62 if k % 2 == 0 else 0.46, sub=0.2)
                s.add(sig, bb + k * 0.25, gain=0.5, pan=0.0, rev=0.1)
        b += dur
    for bar in range(12):
        bb = bar * 4
        s.pattern("kick", "x...x...x...x...", bb, gain=0.95)
        s.pattern("snare", "....x.......x...", bb, gain=0.6, rev=0.45)
        s.pattern("hat", "..x...x...x...x.", bb, gain=0.34)
        if bar >= 4:
            s.pattern("ohat", "......x.......x.", bb, gain=0.3)
        if bar in (3, 7, 11):
            s.pattern("tom", "..x.x.x.........x", bb, gain=0.35)
        if bar in (0, 4, 8):
            s.drum("crash", bb, gain=0.4, rev=0.5)
    # retro lead hook
    lead = lambda f, d, v=0.8: v_lead(f, d, v, kind="saw")
    hook = rep([(0, "C#5", 1, 0.9), (1, "E5", 1, 0.88), (2, "F#5", 2, 0.95)], 1, 0)
    hook2 = rep([(0, "A5", 1, 0.95), (1, "F#5", 1, 0.88), (2, "E5", 2, 0.9)], 1, 0)
    hook3 = rep([(0, "E5", 0.5, 0.9), (0.5, "F#5", 0.5, 0.88), (1, "A5", 1.5, 0.95),
                 (2.5, "G#5", 0.5, 0.85), (3, "F#5", 1, 0.88)], 1, 0)
    hook4 = rep([(0, "F#5", 1, 0.9), (1, "E5", 1, 0.85), (2, "C#5", 2, 0.88)], 1, 0)
    for phrase, beat in [(hook, 16), (hook2, 24), (hook3, 32), (hook4, 40)]:
        s.mel(phrase, lead, gain=0.5, rev=0.4, base_beat=beat)
    return s, dict(rev_amount=0.22, rev_seconds=2.0)


# =============================================================== 10. celebration
def t_celebration_bells():
    s = Song(bpm=126, bars=12)
    prog = [("D", 2), ("A", 2), ("Bm", 2), ("G", 2), ("G", 2), ("A", 2)]
    b = 0
    for name, bars in prog:
        dur = bars * 4
        for bar in range(bars):
            bb = b + bar * 4
            s.chord(name, bb, 3.5, v_organ, gain=0.34, rev=0.3, oct_shift=0, spread=0.3, vel=0.6)
            s.bassline(name, bb, 2, v_bass, gain=0.9)
            s.bassline(name, bb + 2, 1.5, v_bass, gain=0.7, oct_shift=1)
        b += dur
    for bar in range(12):
        bb = bar * 4
        s.pattern("kick", "x...x...x...x...", bb, gain=0.9) if bar >= 2 else s.drum("kick", bb, gain=0.8)
        s.pattern("clap", "....x.......x...", bb, gain=0.68, rev=0.28)
        s.pattern("stomp", "x.......x.......", bb, gain=0.42)
        s.pattern("hat", "..x...x...x...x.", bb, gain=0.36)
        if bar >= 4:
            s.pattern("shaker", "x.x.x.x.x.x.x.x.", bb, gain=0.28)
        if bar in (0, 4, 8, 11):
            s.drum("crash", bb, gain=0.45, rev=0.5)
        if bar in (3, 7, 11):
            s.pattern("tom", "............x.xx", bb, gain=0.4)
    # festive glockenspiel melody
    glock = lambda f, d, v=0.8: v_fm(f, d, v, ratio=3.5, index=1.1, idecay=11, dec=6, bright=0.5)
    mel = rep([(0, "A4", 0.5, 0.9), (0.5, "D5", 0.5, 0.88), (1, "F#5", 1, 0.92),
               (2, "E5", 0.5, 0.86), (2.5, "D5", 0.5, 0.86), (3, "A4", 1, 0.8)], 1, 0)
    mel2 = rep([(0, "B4", 0.5, 0.9), (0.5, "D5", 0.5, 0.88), (1, "F#5", 1, 0.92),
                (2, "A5", 1, 0.95), (3, "F#5", 1, 0.88)], 1, 0)
    mel3 = rep([(0, "D5", 0.5, 0.9), (0.5, "E5", 0.5, 0.9), (1, "F#5", 1, 0.92),
                (2, "A5", 0.5, 0.95), (2.5, "F#5", 0.5, 0.88), (3, "E5", 1, 0.9)], 1, 0)
    mel4 = rep([(0, "F#5", 0.5, 0.9), (0.5, "E5", 0.5, 0.88), (1, "D5", 1, 0.9),
                (2, "A4", 2, 0.9)], 1, 0)
    for phrase, beat in [(mel, 16), (mel2, 24), (mel3, 32), (mel4, 40)]:
        s.mel(phrase, glock, gain=0.5, rev=0.45, base_beat=beat)
    return s, dict(rev_amount=0.24, rev_seconds=1.9)


TRACKS = [
    ("sunrise_uplift", t_sunrise_uplift),
    ("happy_strum", t_happy_strum),
    ("tech_bounce", t_tech_bounce),
    ("marimba_hop", t_marimba_hop),
    ("triumph_rise", t_triumph_rise),
    ("gentle_reflection", t_gentle_reflection),
    ("lofi_study", t_lofi_study),
    ("acoustic_campfire", t_acoustic_campfire),
    ("neon_drive", t_neon_drive),
    ("celebration_bells", t_celebration_bells),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = sys.argv[1:] or None
    print(f"Rendering {len(TRACKS)} tracks to {OUT_DIR}")
    for name, builder in TRACKS:
        if only and name not in only:
            continue
        song, opts = builder()
        L, R = song.render(**opts)
        write_wav(os.path.join(OUT_DIR, f"{name}.wav"), L, R)
    print("Done.")


if __name__ == "__main__":
    main()
