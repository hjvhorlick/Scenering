import wave, math, struct, random, os, subprocess

SR = 22050

def make_track(filename, duration=24, style="uplift", bpm=120):
    num_samples = int(SR * duration)
    samples = [0.0] * num_samples
    bar_len = int(SR * (60.0 / bpm) * 4)
    beat_len = int(SR * (60.0 / bpm))

    # Notes frequencies
    notes = {
        'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
        'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
        'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
        'C6': 1046.50
    }

    # Different chord progressions based on style
    if style == "uplift": # Sunrise Uplift
        chords = [['C4', 'E4', 'G4', 'C5'], ['G3', 'B3', 'D4', 'G4'], ['A3', 'C4', 'E4', 'A4'], ['F3', 'A3', 'C4', 'F4']]
        bass_notes = ['C3', 'G3', 'A3', 'F3']
    elif style == "strum": # Happy Strum
        chords = [['C4', 'E4', 'G4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'], ['C4', 'E4', 'G4']]
        bass_notes = ['C3', 'F3', 'G3', 'C3']
    elif style == "tech": # Tech Bounce
        chords = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4']]
        bass_notes = ['A3', 'F3', 'C3', 'G3']
    elif style == "marimba": # Marimba Hop
        chords = [['G3', 'B3', 'D4', 'G4'], ['C4', 'E4', 'G4', 'C5'], ['D4', 'F4', 'A4'], ['G3', 'B3', 'D4']]
        bass_notes = ['G3', 'C3', 'D3', 'G3']
    elif style == "triumph": # Triumph Rise
        chords = [['D4', 'F4', 'A4', 'D5'], ['G3', 'B3', 'D4', 'G4'], ['C4', 'E4', 'G4', 'C5'], ['F3', 'A3', 'C4', 'F4']]
        bass_notes = ['D3', 'G3', 'C3', 'F3']
    elif style == "gentle": # Gentle Reflection
        chords = [['C4', 'E4', 'G4', 'B4'], ['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['G3', 'B3', 'D4', 'F4']]
        bass_notes = ['C3', 'A3', 'F3', 'G3']
    elif style == "lofi": # Lo-Fi Study Night
        chords = [['D4', 'F4', 'A4', 'C5'], ['G3', 'B3', 'D4', 'F4'], ['C4', 'E4', 'G4', 'B4'], ['A3', 'C4', 'E4', 'G4']]
        bass_notes = ['D3', 'G3', 'C3', 'A3']
    elif style == "campfire": # Campfire Acoustic
        chords = [['G3', 'B3', 'D4'], ['D4', 'F4', 'A4'], ['E3', 'G3', 'B3'], ['C4', 'E4', 'G4']]
        bass_notes = ['G3', 'D3', 'E3', 'C3']
    elif style == "neon": # Neon Drive
        chords = [['F3', 'A3', 'C4', 'E4'], ['G3', 'B3', 'D4'], ['A3', 'C4', 'E4'], ['E3', 'G3', 'B3']]
        bass_notes = ['F3', 'G3', 'A3', 'E3']
    else: # Celebration Bells
        chords = [['C4', 'G4', 'C5', 'E5'], ['F3', 'C4', 'F4', 'A4'], ['G3', 'D4', 'G4', 'B4'], ['C4', 'G4', 'C5', 'E5']]
        bass_notes = ['C3', 'F3', 'G3', 'C3']

    total_bars = math.ceil(num_samples / bar_len)
    for b in range(total_bars):
        chord_idx = b % len(chords)
        chord = chords[chord_idx]
        b_note = bass_notes[chord_idx]
        b_freq = notes.get(b_note, 130.81)
        bar_start = b * bar_len

        # 1. Bassline
        for beat in range(4):
            beat_start = bar_start + beat * beat_len
            b_len = int(beat_len * 0.85)
            for i in range(min(b_len, num_samples - beat_start)):
                t = i / SR
                # Warm sub bass
                env = min(1.0, t / 0.02) * math.exp(-t * 2.5)
                val = (math.sin(2 * math.pi * b_freq * t) * 0.7 +
                       math.sin(2 * math.pi * b_freq * 2 * t) * 0.2) * env
                idx = beat_start + i
                if idx < num_samples:
                    samples[idx] += val * 0.28

        # 2. Arpeggio / Chords
        for step in range(8):
            step_start = bar_start + int(step * (beat_len / 2))
            note_name = chord[step % len(chord)]
            freq = notes.get(note_name, 261.63)
            note_dur = int(beat_len * 0.9)
            for i in range(min(note_dur, num_samples - step_start)):
                t = i / SR
                if style in ["marimba", "strum"]:
                    # Marimba / pluck
                    env = min(1.0, t / 0.005) * math.exp(-t * 5.0)
                    val = (math.sin(2 * math.pi * freq * t) * 0.6 +
                           math.sin(2 * math.pi * freq * 2.02 * t) * 0.25 +
                           math.sin(2 * math.pi * freq * 3.01 * t) * 0.15) * env
                elif style in ["tech", "neon"]:
                    # Synth pluck
                    env = min(1.0, t / 0.01) * math.exp(-t * 4.0)
                    val = (math.sin(2 * math.pi * freq * t) * 0.5 +
                           math.sin(2 * math.pi * freq * 2 * t) * 0.3 +
                           math.sin(2 * math.pi * freq * 3 * t) * 0.2) * env
                else:
                    # Piano / bells
                    env = min(1.0, t / 0.02) * math.exp(-t * 1.8)
                    val = (math.sin(2 * math.pi * freq * t) * 0.55 +
                           math.sin(2 * math.pi * freq * 2 * t) * 0.25 +
                           math.sin(2 * math.pi * freq * 4 * t) * 0.12) * env
                idx = step_start + i
                if idx < num_samples:
                    samples[idx] += val * 0.24

        # 3. Soft Rhythm (Hi-hat & Kick pulse)
        for beat in range(4):
            # Kick on 0 and 2
            if beat in [0, 2]:
                k_start = bar_start + beat * beat_len
                k_len = int(0.12 * SR)
                for i in range(min(k_len, num_samples - k_start)):
                    t = i / SR
                    k_freq = 120.0 * math.exp(-t * 35.0) + 45.0
                    val = math.sin(2 * math.pi * k_freq * t) * math.exp(-t * 22.0)
                    idx = k_start + i
                    if idx < num_samples:
                        samples[idx] += val * 0.35

            # Hi-hat on off-beats
            h_start = bar_start + int((beat + 0.5) * beat_len)
            h_len = int(0.04 * SR)
            for i in range(min(h_len, num_samples - h_start)):
                t = i / SR
                noise = (random.random() * 2.0 - 1.0) * math.exp(-t * 80.0)
                idx = h_start + i
                if idx < num_samples:
                    samples[idx] += noise * 0.08

    # Master Normalize
    max_val = max(max(abs(s) for s in samples), 0.001)
    scale = 0.85 / max_val

    wav_path = os.path.join('public/sounds', f"{filename}.wav")
    with wave.open(wav_path, 'w') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        data = bytearray()
        for i, s in enumerate(samples):
            pan = math.sin(i / SR * 0.8) * 0.15
            left = int(max(-32767, min(32767, s * scale * (1.0 - pan) * 32767)))
            right = int(max(-32767, min(32767, s * scale * (1.0 + pan) * 32767)))
            data.extend(struct.pack('<hh', left, right))
        wav.writeframes(data)

    mp3_path = os.path.join('public/sounds', f"{filename}.mp3")
    try:
        subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-b:a', '128k', mp3_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"Generated {filename}.wav and {filename}.mp3")
    except Exception as e:
        print(f"Generated {filename}.wav (ffmpeg error: {e})")

tracks = [
    ("sunrise_uplift", 25, "uplift", 120),
    ("happy_strum", 25, "strum", 124),
    ("tech_bounce", 24, "tech", 125),
    ("marimba_hop", 25, "marimba", 120),
    ("triumph_rise", 28, "triumph", 116),
    ("gentle_reflection", 33, "gentle", 76),
    ("lofi_study", 35, "lofi", 80),
    ("acoustic_campfire", 31, "campfire", 100),
    ("neon_drive", 26, "neon", 122),
    ("celebration_bells", 25, "bells", 128),
]

for name, dur, style, bpm in tracks:
    make_track(name, duration=dur, style=style, bpm=bpm)

print("All lively music tracks generated successfully!")
