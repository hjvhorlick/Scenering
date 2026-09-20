import wave, math, struct, random, os

def create_relaxing_track(filename, chord_progression, timbre="piano", sample_rate=22050, bpm=45, loop_bars=4):
    num_samples = int(sample_rate * (60 / bpm) * 4 * loop_bars)
    samples = [0.0] * num_samples
    bar_len = int(sample_rate * (60 / bpm) * 4)

    for bar_idx, chord in enumerate(chord_progression):
        bar_start = bar_idx * bar_len
        for note_idx, note_freq in enumerate(chord):
            # Staggered arpeggiation or simultaneous chord
            arpeggio_delay = int(note_idx * 0.18 * sample_rate) if timbre in ["harp", "arpeggio"] else 0
            start_i = bar_start + arpeggio_delay
            note_len = int(bar_len * 1.6)

            for i in range(min(note_len, num_samples - start_i)):
                t = i / sample_rate
                if timbre == "piano":
                    attack = min(1.0, t / 0.04)
                    decay = math.exp(-t * 0.5)
                    env = attack * decay
                    val = (math.sin(2 * math.pi * note_freq * t) * 0.55 +
                           math.sin(2 * math.pi * note_freq * 2 * t) * 0.25 +
                           math.sin(2 * math.pi * note_freq * 3 * t) * 0.1 +
                           math.sin(2 * math.pi * (note_freq * 1.002) * t) * 0.15)
                elif timbre == "zen":
                    # Singing bowl / drone with gentle beats
                    attack = min(1.0, t / 0.8)
                    decay = math.exp(-t * 0.2)
                    env = attack * decay
                    val = (math.sin(2 * math.pi * note_freq * t) * 0.6 +
                           math.sin(2 * math.pi * (note_freq + 1.2) * t) * 0.25 +
                           math.sin(2 * math.pi * (note_freq * 2) * t) * 0.15)
                elif timbre == "harp":
                    attack = min(1.0, t / 0.02)
                    decay = math.exp(-t * 0.8)
                    env = attack * decay
                    val = (math.sin(2 * math.pi * note_freq * t) * 0.7 +
                           math.sin(2 * math.pi * note_freq * 2 * t) * 0.2 +
                           math.sin(2 * math.pi * note_freq * 4 * t) * 0.1)
                elif timbre == "lofi":
                    attack = min(1.0, t / 0.06)
                    decay = math.exp(-t * 0.4)
                    env = attack * decay
                    # Warm rhodes with subtle detune
                    val = (math.sin(2 * math.pi * note_freq * t) * 0.6 +
                           math.sin(2 * math.pi * (note_freq * 1.003) * t) * 0.3 +
                           math.sin(2 * math.pi * (note_freq * 3) * t) * 0.08)
                elif timbre == "pad":
                    # Ethereal swell pad
                    attack = min(1.0, t / 1.2)
                    decay = min(1.0, (note_len - i) / (sample_rate * 1.5))
                    env = attack * decay
                    val = (math.sin(2 * math.pi * note_freq * t) * 0.4 +
                           math.sin(2 * math.pi * (note_freq * 1.004) * t) * 0.3 +
                           math.sin(2 * math.pi * (note_freq * 0.5) * t) * 0.2 +
                           math.sin(2 * math.pi * (note_freq * 2) * t) * 0.1)
                else:
                    attack = min(1.0, t / 0.1)
                    decay = math.exp(-t * 0.35)
                    env = attack * decay
                    val = math.sin(2 * math.pi * note_freq * t) * 0.7

                idx = start_i + i
                if idx < num_samples:
                    samples[idx] += val * env * 0.22

    # Master normalize
    max_val = max(max(abs(s) for s in samples), 0.001)
    scale = 0.78 / max_val

    out_path = os.path.join('public/sounds', filename)
    with wave.open(out_path, 'w') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        data = bytearray()
        for i, s in enumerate(samples):
            pan = math.sin(i / sample_rate * 0.5) * 0.1
            left = int(max(-32767, min(32767, s * scale * (1.0 - pan) * 32767)))
            right = int(max(-32767, min(32767, s * scale * (1.0 + pan) * 32767)))
            data.extend(struct.pack('<hh', left, right))
        wav.writeframes(data)
    print(f'Generated {filename}')

tracks = [
    ('zen_meditation.wav', [
        [108.0, 162.0, 216.0, 432.0],
        [96.0, 144.0, 192.0, 384.0],
        [120.0, 180.0, 240.0, 480.0],
        [108.0, 162.0, 216.0, 432.0]
    ], 'zen', 38),

    ('gentle_sanctuary.wav', [
        [130.81, 164.81, 196.00, 246.94, 329.63], # Cmaj7
        [146.83, 174.61, 220.00, 261.63, 349.23], # Dm7
        [164.81, 196.00, 246.94, 293.66, 392.00], # Em7
        [174.61, 220.00, 261.63, 329.63, 440.00]  # Fmaj7
    ], 'harp', 48),

    ('twilight_horizon.wav', [
        [116.54, 146.83, 174.61, 220.00, 261.63], # Bbmaj7
        [130.81, 164.81, 196.00, 233.08, 293.66], # C7
        [98.00, 146.83, 174.61, 220.00, 261.63],  # Gm7
        [116.54, 174.61, 220.00, 261.63, 349.23]  # Bbmaj9
    ], 'lofi', 48),

    ('forest_canopy.wav', [
        [110.00, 164.81, 220.00, 261.63, 329.63], # Am
        [87.31, 130.81, 174.61, 220.00, 261.63],  # Fmaj7
        [130.81, 196.00, 246.94, 293.66, 329.63], # C
        [98.00, 146.83, 196.00, 246.94, 293.66]   # G
    ], 'piano', 42),

    ('ethereal_clouds.wav', [
        [130.81, 196.00, 261.63, 329.63, 392.00], # C
        [146.83, 220.00, 293.66, 349.23, 440.00], # Dm
        [164.81, 246.94, 329.63, 392.00, 493.88], # Em
        [174.61, 261.63, 349.23, 440.00, 523.25]  # F
    ], 'pad', 36),

    ('solitude_reflection.wav', [
        [82.41, 123.47, 164.81, 196.00, 246.94],  # Em
        [73.42, 110.00, 146.83, 185.00, 220.00],  # D
        [65.41, 98.00, 130.81, 164.81, 196.00],   # C
        [73.42, 110.00, 146.83, 185.00, 220.00]   # D
    ], 'piano', 40),

    ('midnight_starlight.wav', [
        [87.31, 130.81, 174.61, 220.00, 261.63, 349.23], # Fmaj9
        [110.00, 164.81, 220.00, 261.63, 329.63],        # Am7
        [98.00, 146.83, 196.00, 246.94, 293.66],         # G
        [130.81, 196.00, 261.63, 329.63, 392.00]         # C
    ], 'pad', 35)
]

for filename, chords, timbre, bpm in tracks:
    create_relaxing_track(filename, chords, timbre=timbre, bpm=bpm)
print('All audio tracks generated successfully.')
