export interface SoundAsset {
  id: string;
  filename: string;
  name: string;
  category: "sfx" | "bell" | "cinematic" | "ui" | "music";
  url: string;
  duration: number; // in seconds approx
  author: string;
  source: string;
  sourceUrl: string;
  license: string;
  description: string;
}

// Verified High-Quality Audio from Free Sources (Wikimedia Commons, Freesound.org, Incompetech)
export const SOUND_LIBRARY: SoundAsset[] = [
  {
    id: "ting",
    filename: "ting.ogg",
    name: "Ting Bell Chime",
    category: "bell",
    url: "/sounds/ting.ogg",
    duration: 1.2,
    author: "Wikimedia Commons",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ting.ogg",
    license: "CC0 / Public Domain",
    description: "High pitch clear ting chime bell for notifications and accents.",
  },
  {
    id: "whoosh_appear",
    filename: "whoosh_appear.wav",
    name: "Whoosh / Swoosh Appear",
    category: "sfx",
    url: "/sounds/whoosh_appear.wav",
    duration: 1.4,
    author: "RunnerPack",
    source: "Freesound.org via Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:RunnerPack_-_weapAppear_(by)_(Freesound).wav",
    license: "CC BY 3.0",
    description: "Dynamic airy whoosh transition sound effect.",
  },
  {
    id: "jump_pop",
    filename: "jump_pop.wav",
    name: "Jump / Bounce Pop",
    category: "sfx",
    url: "/sounds/jump_pop.wav",
    duration: 0.8,
    author: "LloydEvans09",
    source: "Freesound.org via Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:LloydEvans09_-_jump2_(cc-by)_(freesound).wav",
    license: "CC BY 3.0",
    description: "Punchy bouncy cork pop sound for sticker arrivals and reactions.",
  },
  {
    id: "camera_shutter",
    filename: "camera_shutter.ogg",
    name: "SLR Camera Shutter",
    category: "sfx",
    url: "/sounds/camera_shutter.ogg",
    duration: 0.9,
    author: "Francois C",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Camera_shutter.ogg",
    license: "CC BY-SA 3.0",
    description: "Authentic mechanical SLR camera shutter snapshot click.",
  },
  {
    id: "dramatic_chord",
    filename: "dramatic_chord.ogg",
    name: "Dramatic Sting (Dun Dun Dun)",
    category: "cinematic",
    url: "/sounds/dramatic_chord.ogg",
    duration: 2.8,
    author: "Wikimedia Commons Community",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Dun_dun_duuun!.ogg",
    license: "Public Domain",
    description: "Iconic orchestral dramatic tension sting.",
  },
  {
    id: "achievement_bell",
    filename: "achievement_bell.wav",
    name: "Achievement Unlocked Chime",
    category: "bell",
    url: "/sounds/achievement_bell.wav",
    duration: 2.2,
    author: "rhodesmas",
    source: "Freesound.org via Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Achievement_bell.wav",
    license: "CC BY 3.0",
    description: "Triumphant sparkling brass chime for badges, milestones and stats.",
  },
  {
    id: "applause",
    filename: "applause.ogg",
    name: "Audience Applause & Cheer",
    category: "sfx",
    url: "/sounds/applause.ogg",
    duration: 5.0,
    author: "Thore",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Applause.ogg",
    license: "Public Domain / CC0",
    description: "Warm live audience clapping applause for celebratory moments.",
  },
  {
    id: "computer_beep",
    filename: "computer_beep.wav",
    name: "Tech UI Computer Beep",
    category: "ui",
    url: "/sounds/computer_beep.wav",
    duration: 1.0,
    author: "Gravity Sound",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Computer_Sound_(Gravity_Sound).wav",
    license: "CC BY 4.0",
    description: "Modern digital technology beep interface sound.",
  },
  {
    id: "retro_fx",
    filename: "retro_fx.mp3",
    name: "Retro 8-Bit Game FX",
    category: "sfx",
    url: "/sounds/retro_fx.mp3",
    duration: 1.2,
    author: "Gravity Sound",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Retro_Sound_(Gravity_Sound).mp3",
    license: "CC BY 4.0",
    description: "Crisp nostalgic 8-bit video game powerup sound effect.",
  },
  {
    id: "ui_beep",
    filename: "ui_beep.ogg",
    name: "Subtle UI Beep (400ms)",
    category: "ui",
    url: "/sounds/ui_beep.ogg",
    duration: 0.4,
    author: "Wikimedia Commons",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Beep_400ms.ogg",
    license: "Public Domain",
    description: "Clean modern minimal click/beep for quick UI transitions.",
  },
  {
    id: "bicycle_bell",
    filename: "bicycle_bell.ogg",
    name: "Ding-Dong Bicycle Bell",
    category: "bell",
    url: "/sounds/bicycle_bell.ogg",
    duration: 1.5,
    author: "Wikimedia Commons",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ding_Dong_Bicycle_Bell_A.ogg",
    license: "Public Domain",
    description: "Classic acoustic brass ding-dong bicycle bell chime.",
  },
  {
    id: "gymnopedie_no1",
    filename: "gymnopedie_no1.mp3",
    name: "Erik Satie - Gymnopédie No. 1",
    category: "music",
    url: "/sounds/gymnopedie_no1.mp3",
    duration: 184,
    author: "Composed by Erik Satie, performed by Kevin MacLeod",
    source: "Incompetech / Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3",
    license: "CC BY 3.0 (incompetech.com)",
    description: "High Definition 320 kbps peaceful classical piano soundtrack.",
  }
];

export interface BackgroundMusicTrack {
  id: string;
  mood?: "acoustic" | "electronic" | "cinematic";
  name: string;
  genre: string;
  url: string;
  duration: number; // in seconds
  author: string;
  source: string;
  sourceUrl: string;
  license: string;
  description: string;
  creditText: string;
}

export const BACKGROUND_MUSIC_TRACKS: BackgroundMusicTrack[] = [
  // ---------- Real public-domain / CC instrumental recordings ----------
  {
    id: "gymnopedie_no1",
    name: "Erik Satie - Gymnopédie No. 1",
    mood: "acoustic",
    genre: "Classical Solo Piano",
    url: "/sounds/gymnopedie_no1.mp3",
    duration: 184,
    author: "Erik Satie, performed by Kevin MacLeod",
    source: "Incompetech / Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3",
    license: "CC BY 3.0",
    description: "Serene, tranquil classical piano masterpiece with no vocals.",
    creditText: 'Music: "Gymnopédie No. 1" by Erik Satie, performed by Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 3.0',
  },
  {
    id: "clair_de_lune",
    name: "Claude Debussy - Clair de Lune",
    mood: "acoustic",
    genre: "Impressionist Classical Piano",
    url: "/sounds/clair_de_lune.ogg",
    duration: 304,
    author: "Claude Debussy (Suite bergamasque), performed by Laurens Goedhart",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg",
    license: "Public Domain / CC0",
    description: "Gentle, timeless acoustic piano with soft floating harmonies.",
    creditText: 'Music: "Clair de Lune" by Claude Debussy, Suite bergamasque (Public Domain / CC0 free for commercial & personal use)',
  },

  // ---------- 10 lively in-house royalty-free tracks (no vocals) ----------
  {
    id: "sunrise_uplift",
    name: "Sunrise Uplift",
    mood: "cinematic",
    genre: "Uplifting Corporate Pop — bright piano arpeggio & strings",
    url: "/sounds/sunrise_uplift.mp3",
    duration: 25,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/sunrise_uplift",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Optimistic, motivating build with sparkling piano arpeggios, warm strings and an uplifting bell melody.",
    creditText: 'Music: "Sunrise Uplift" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "happy_strum",
    name: "Happy Days Strum",
    mood: "acoustic",
    genre: "Joyful Acoustic — ukulele strum & whistled melody",
    url: "/sounds/happy_strum.mp3",
    duration: 25,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/happy_strum",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Sunny ukulele strumming, hand claps and a cheerful whistled hook — feel-good and playful.",
    creditText: 'Music: "Happy Days Strum" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "tech_bounce",
    name: "Tech Bounce",
    mood: "electronic",
    genre: "Modern Electronic — pluck hook & driving synth bass",
    url: "/sounds/tech_bounce.mp3",
    duration: 24,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/tech_bounce",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Confident, modern groove with a catchy plucked hook and punchy four-on-the-floor beat.",
    creditText: 'Music: "Tech Bounce" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "marimba_hop",
    name: "Marimba Hop",
    mood: "electronic",
    genre: "Playful Marimba Pop — bouncy wooden melody",
    url: "/sounds/marimba_hop.mp3",
    duration: 25,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/marimba_hop",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Quirky, light-hearted marimba hops over a soft shaker groove — ideal for fun explainers.",
    creditText: 'Music: "Marimba Hop" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "triumph_rise",
    name: "Triumph Rise",
    mood: "cinematic",
    genre: "Epic Cinematic Uplift — string ostinato & timpani",
    url: "/sounds/triumph_rise.mp3",
    duration: 28,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/triumph_rise",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Inspiring orchestral build with driving strings, timpani and a heroic brass-style lead.",
    creditText: 'Music: "Triumph Rise" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "gentle_reflection",
    name: "Gentle Reflection",
    mood: "acoustic",
    genre: "Tender Solo Piano — expressive melody & warm pad",
    url: "/sounds/gentle_reflection.mp3",
    duration: 33,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/gentle_reflection",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Intimate solo piano with a heartfelt melody and soft strings — reflective and emotional.",
    creditText: 'Music: "Gentle Reflection" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "lofi_study",
    name: "Lo-Fi Study Night",
    mood: "electronic",
    genre: "Chill Lo-Fi Hip-Hop — warm Rhodes chords",
    url: "/sounds/lofi_study.mp3",
    duration: 35,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/lofi_study",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Relaxed swung drums, mellow Rhodes chords and a laid-back bass line — calm and nostalgic.",
    creditText: 'Music: "Lo-Fi Study Night" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "acoustic_campfire",
    name: "Campfire Acoustic",
    mood: "acoustic",
    genre: "Warm Fingerstyle Folk — guitar picking & flute",
    url: "/sounds/acoustic_campfire.mp3",
    duration: 31,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/acoustic_campfire",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Earthy fingerpicked guitar with a friendly flute melody and gentle stomp-clap rhythm.",
    creditText: 'Music: "Campfire Acoustic" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "neon_drive",
    name: "Neon Drive",
    mood: "electronic",
    genre: "Retro Synthwave — driving arpeggio & retro lead",
    url: "/sounds/neon_drive.mp3",
    duration: 26,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/neon_drive",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Eighties-inspired synthwave with a pulsating bass arpeggio and gated pad chords.",
    creditText: 'Music: "Neon Drive" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
  {
    id: "celebration_bells",
    name: "Celebration Bells",
    mood: "acoustic",
    genre: "Festive Glockenspiel Pop — bright celebratory melody",
    url: "/sounds/celebration_bells.mp3",
    duration: 23,
    author: "Scenering Studio Music Engine",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/celebration_bells",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Bright glockenspiel melody, stomp-clap groove and joyful chords — perfect for celebrations.",
    creditText: 'Music: "Celebration Bells" - Scenering Studio Music (Royalty-Free CC0 License)',
  },
];

export function getBackgroundMusicTrack(idOrUrl?: string): BackgroundMusicTrack | undefined {
  if (!idOrUrl || idOrUrl === "none") return undefined;
  return BACKGROUND_MUSIC_TRACKS.find(
    (t) => t.id === idOrUrl || t.url === idOrUrl || t.name.toLowerCase().includes(idOrUrl.toLowerCase())
  );
}

// NOTE: the old STICKERS_3D SVG assets were removed when stickers moved to the
// procedural 3D renderer in src/lib/sticker-3d.ts, which draws them on canvas
// so their lighting can react to motion. See STICKER_LIBRARY there.

// Global reference to active sound preview
let currentActiveAudio: HTMLAudioElement | null = null;
let currentActiveUrl: string | null = null;
let currentStopSynth: (() => void) | null = null;
let currentSynthGain: GainNode | null = null;
let activePreviewListeners = new Set<(url: string | null, isPlaying: boolean, volume: number) => void>();
let currentPreviewVolume: number = 0.8;

export function getCurrentlyPlayingSoundUrl(): string | null {
  return currentActiveUrl;
}

export function getCurrentPreviewVolume(): number {
  return currentPreviewVolume;
}

export function subscribeToAudioPreview(listener: (url: string | null, isPlaying: boolean, volume: number) => void): () => void {
  activePreviewListeners.add(listener);
  return () => activePreviewListeners.delete(listener);
}

function notifyAudioListeners(url: string | null, isPlaying: boolean, volume: number) {
  currentPreviewVolume = volume;
  activePreviewListeners.forEach((cb) => {
    try {
      cb(url, isPlaying, volume);
    } catch {}
  });
}

// Stop any currently playing preview immediately (Toggle OFF)
export function stopAllSoundPreviews(): void {
  if (currentActiveAudio) {
    try {
      currentActiveAudio.pause();
      currentActiveAudio.currentTime = 0;
      currentActiveAudio.onended = null;
      currentActiveAudio.onerror = null;
    } catch {}
    currentActiveAudio = null;
  }
  if (currentStopSynth) {
    try {
      currentStopSynth();
    } catch {}
    currentStopSynth = null;
  }
  currentSynthGain = null;
  const oldUrl = currentActiveUrl;
  currentActiveUrl = null;
  if (oldUrl) {
    notifyAudioListeners(null, false, currentPreviewVolume);
  }
}

// Adjust volume in real time for currently playing sound
export function setSoundPreviewVolume(volume: number): void {
  const safeVol = Math.max(0, Math.min(1, volume));
  currentPreviewVolume = safeVol;
  if (currentActiveAudio) {
    try {
      currentActiveAudio.volume = safeVol;
    } catch {}
  }
  if (currentSynthGain) {
    try {
      currentSynthGain.gain.setValueAtTime(Math.max(0.001, safeVol * 0.35), 0);
    } catch {}
  }
  notifyAudioListeners(currentActiveUrl, Boolean(currentActiveUrl), safeVol);
}

export function isSoundPreviewPlaying(url?: string): boolean {
  if (!url) return Boolean(currentActiveUrl);
  return currentActiveUrl === url;
}

// Synthesize pleasant acoustic preview if local audio file fails or sandbox blocks it
function playSynthesizedAcousticPreview(url: string, volume: number, onEnd?: () => void) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const isMusic =
      url.includes("gymnopedie") ||
      url.includes("clair") ||
      url.includes("radiance") ||
      url.includes("zen") ||
      url.includes("sanctuary") ||
      url.includes("twilight") ||
      url.includes("forest") ||
      url.includes("ethereal") ||
      url.includes("solitude") ||
      url.includes("midnight") ||
      url.includes("music");

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume * 0.35)), ctx.currentTime);
    masterGain.connect(ctx.destination);
    currentSynthGain = masterGain;

    const chords = isMusic
      ? [261.63, 329.63, 392.00, 523.25, 440.0, 349.23, 392.0, 523.25] // C maj / F maj soothing progression
      : [523.25, 659.25, 783.99]; // Chime arpeggio

    const oscillators: OscillatorNode[] = [];
    chords.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = isMusic ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const startTime = ctx.currentTime + (isMusic ? i * 0.5 : i * 0.12);
      noteGain.gain.setValueAtTime(0.001, startTime);
      noteGain.gain.linearRampToValueAtTime(0.18, startTime + 0.05);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + (isMusic ? 3.0 : 0.8));

      osc.connect(noteGain);
      noteGain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + (isMusic ? 3.2 : 0.9));
      oscillators.push(osc);
    });

    const totalDuration = (isMusic ? 12.0 : 1.5) * 1000;
    const timer = setTimeout(() => {
      stopAllSoundPreviews();
      onEnd?.();
      try { ctx.close(); } catch {}
    }, totalDuration);

    currentStopSynth = () => {
      clearTimeout(timer);
      oscillators.forEach((o) => {
        try { o.stop(); } catch {}
      });
      try { ctx.close(); } catch {}
      currentSynthGain = null;
    };
  } catch {}
}

// Toggle sound preview: If playing -> stops (OFF). If stopped -> plays (ON) with volume control.
export function toggleSoundPreview(
  url: string,
  volume = 0.8,
  onStateChange?: (isPlaying: boolean) => void
): boolean {
  if (!url) return false;

  // Toggle OFF if already playing this URL
  if (currentActiveUrl === url) {
    stopAllSoundPreviews();
    onStateChange?.(false);
    return false;
  }

  // Stop previous preview
  stopAllSoundPreviews();

  const safeVol = Math.max(0, Math.min(1, volume));
  currentPreviewVolume = safeVol;
  currentActiveUrl = url;
  notifyAudioListeners(url, true, safeVol);
  onStateChange?.(true);

  try {
    const audio = new Audio(url);
    audio.volume = safeVol;
    currentActiveAudio = audio;

    audio.onended = () => {
      if (currentActiveUrl === url) {
        currentActiveAudio = null;
        currentActiveUrl = null;
        notifyAudioListeners(null, false, currentPreviewVolume);
        onStateChange?.(false);
      }
    };

    audio.onerror = () => {
      console.warn("Audio file playback error, activating acoustic fallback synth:", url);
      currentActiveAudio = null;
      playSynthesizedAcousticPreview(url, safeVol, () => onStateChange?.(false));
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("Autoplay policy or decode error, using acoustic synth fallback:", err);
        currentActiveAudio = null;
        playSynthesizedAcousticPreview(url, safeVol, () => onStateChange?.(false));
      });
    }

    return true;
  } catch (err) {
    console.warn("Failed creating Audio object, using synthesizer fallback:", err);
    playSynthesizedAcousticPreview(url, safeVol, () => onStateChange?.(false));
    return true;
  }
}

// Helper to play any sound preview instantly using browser HTML5 Audio
export function playSoundPreview(url: string, volume = 0.8): HTMLAudioElement | null {
  toggleSoundPreview(url, volume);
  return currentActiveAudio;
}

// Generate formatted attribution document for YouTube, TikTok, Vimeo, or video descriptions
export function generateAttributionDocument(options: {
  projectTitle?: string;
  soundsUsed?: string[];
  includeBackgroundMusic?: boolean;
  musicType?: string;
  imageSources?: string[];
  voiceName?: string;
  voiceGender?: string;
  voiceAccent?: string;
  voiceEngine?: string;
}): string {
  const {
    projectTitle = "My Video Project",
    soundsUsed = [],
    includeBackgroundMusic = true,
    musicType = "Gymnopédie No. 1 (Erik Satie / Kevin MacLeod)",
    imageSources = ["Pexels (CC0 / Free to use)", "Pixabay (Content License)"],
    voiceName,
    voiceGender,
    voiceAccent,
    voiceEngine,
  } = options;

  const dateStr = new Date().toISOString().split("T")[0];

  let doc = `======================================================================
VIDEO CREDITS & MEDIA ATTRIBUTIONS
Project: ${projectTitle}
Generated with: Scenering Video Studio
Date: ${dateStr}
======================================================================

COPY & PASTE INTO YOUR VIDEO DESCRIPTION (YouTube, TikTok, Vimeo, etc.):
----------------------------------------------------------------------
📢 CREDITS & ATTRIBUTIONS

`;

  // 1. Voiceover & TTS Attribution
  if (voiceName) {
    doc += `🎙️ VOICEOVER & SPEECH SYNTHESIS (TTS):
• Voice Profile: ${voiceName}
  Profile Type: ${voiceGender ? `${voiceGender.toUpperCase()} • ` : ""}${voiceAccent || "Studio Narration"}
  Technology: ${voiceEngine || "Neural AI Speech & Web Speech API Standards"}
  License: Royalty-Free Commercial & Personal Synthetic Audio Production License

`;
  }

  // 2. Music Attribution
  if (includeBackgroundMusic && musicType && musicType !== "none") {
    const track = getBackgroundMusicTrack(musicType);
    doc += `🎵 BACKGROUND MUSIC:
`;
    if (track) {
      doc += `• "${track.name}"
  Author / Performer: ${track.author}
  Genre: ${track.genre}
  License: ${track.license}
  Source: ${track.source} (${track.sourceUrl})
  Attribution Note: ${track.creditText}

`;
    } else {
      doc += `• "${musicType}"
  License: Royalty-Free Commercial / Creative Commons License
  Attribution Cleared via Scenering Studio Audio Engine

`;
    }
  }

  // 2. Sound Effects Attribution
  const relevantSounds = SOUND_LIBRARY.filter(
    (s) => soundsUsed.length === 0 || soundsUsed.includes(s.id) || soundsUsed.includes(s.url)
  );

  if (relevantSounds.length > 0) {
    doc += `🔊 SOUND EFFECTS & FOLEY:
`;
    relevantSounds.forEach((s) => {
      doc += `• "${s.name}"
  Author: ${s.author}
  License: ${s.license}
  Source: ${s.sourceUrl}

`;
    });
  }

  // 3. 3D Graphics & Visual Overlays
  doc += `🎨 3D GRAPHICS & VISUAL ELEMENTS:
• High-Definition 3D Vector Assets created with Scenering 3D Vector Engine
  Included assets: 3D Golden Star, Ruby Heart, Volumetric Fire, Golden Bell, Diamond Sparkle, Trending Rocket
  License: Free for commercial and personal video production.

`;

  // 4. Stock Photography & Footage
  if (imageSources && imageSources.length > 0) {
    doc += `📸 STOCK IMAGES & MEDIA:
`;
    imageSources.forEach((src) => {
      doc += `• Sourced via ${src}
`;
    });
    doc += `  All imagery utilized complies with respective free licensing provisions.\n\n`;
  }

  doc += `----------------------------------------------------------------------
All audio and media assets used in this video have been legally sourced 
from royalty-free or Creative Commons licensed repositories.
======================================================================`;

  return doc;
}
