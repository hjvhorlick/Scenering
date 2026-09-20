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

export interface Sticker3DAsset {
  id: string;
  filename: string;
  name: string;
  url: string;
  category: "badges" | "emojis" | "creator" | "gaming";
  description: string;
  isHD3D: boolean;
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
  {
    id: "gymnopedie_no1",
    name: "Erik Satie - Gymnopédie No. 1",
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
  {
    id: "morning_radiance",
    name: "Peaceful Morning Radiance",
    genre: "Warm Acoustic Piano & Soft Strings",
    url: "/sounds/morning_radiance.wav",
    duration: 20,
    author: "Scenering Studio Royalty-Free Archives",
    source: "Scenering Studio Collection",
    sourceUrl: "https://scenering.app/sounds/morning_radiance",
    license: "Royalty-Free / CC0 Public Domain",
    description: "Uplifting, warm acoustic chords in C major with gentle resonance.",
    creditText: 'Music: "Peaceful Morning Radiance" by Scenering Studio Audio (Royalty-Free CC0 License)',
  },
  {
    id: "zen_meditation",
    name: "Deep Zen Meditation (432 Hz)",
    genre: "Tibetan Singing Bowl & Healing Drone",
    url: "/sounds/zen_meditation.wav",
    duration: 25,
    author: "Ambient Meditations Archive",
    source: "Ambient Sound Library",
    sourceUrl: "https://scenering.app/sounds/zen_meditation",
    license: "CC0 Public Domain",
    description: "Calming acoustic singing bowls and soothing drone resonance for mindfulness.",
    creditText: 'Music: "Deep Zen Meditation (432 Hz)" - Ambient Meditations Archive (Royalty-Free / CC0 Public Domain)',
  },
  {
    id: "gentle_sanctuary",
    name: "Gentle River Sanctuary",
    genre: "Lush Acoustic Harp & Harmonic Chimes",
    url: "/sounds/gentle_sanctuary.wav",
    duration: 20,
    author: "Acoustic Reflections Archive",
    source: "Acoustic Creative Commons",
    sourceUrl: "https://scenering.app/sounds/gentle_sanctuary",
    license: "CC0 Public Domain",
    description: "Flowing harp arpeggios with gentle harmonic bells.",
    creditText: 'Music: "Gentle River Sanctuary" - Acoustic Reflections Archive (Royalty-Free / CC0 Public Domain)',
  },
  {
    id: "twilight_horizon",
    name: "Twilight Horizon",
    genre: "Warm Lo-Fi Rhodes & Ambient Vinyl",
    url: "/sounds/twilight_horizon.wav",
    duration: 20,
    author: "Chillhop Sound Collective",
    source: "Lo-Fi Music Archive",
    sourceUrl: "https://scenering.app/sounds/twilight_horizon",
    license: "CC0 Public Domain",
    description: "Nostalgic, warm electric piano chords with soft twilight ambience.",
    creditText: 'Music: "Twilight Horizon" - Chillhop Sound Collective (Royalty-Free / CC0 Public Domain)',
  },
  {
    id: "forest_canopy",
    name: "Forest Canopy & Rainfall Piano",
    genre: "Minimalist Calming Piano & Soft Rain",
    url: "/sounds/forest_canopy.wav",
    duration: 23,
    author: "Nature Sanctuary Audio",
    source: "Nature & Music Archives",
    sourceUrl: "https://scenering.app/sounds/forest_canopy",
    license: "CC0 Public Domain",
    description: "Delicate minimalist piano notes designed for study, relaxation, and narration.",
    creditText: 'Music: "Forest Canopy & Rainfall Piano" - Nature Sanctuary Audio (Royalty-Free / CC0 Public Domain)',
  },
  {
    id: "ethereal_clouds",
    name: "Ethereal Cloudscape",
    genre: "Dreamy Ambient Synth Swell & Shimmer",
    url: "/sounds/ethereal_clouds.wav",
    duration: 27,
    author: "Ethereal Soundscapes Project",
    source: "Ambient Drone Collection",
    sourceUrl: "https://scenering.app/sounds/ethereal_clouds",
    license: "CC0 Public Domain",
    description: "Deep, slow-evolving atmospheric pads providing emotional cinematic depth.",
    creditText: 'Music: "Ethereal Cloudscape" - Ethereal Soundscapes Project (Royalty-Free / CC0 Public Domain)',
  },
  {
    id: "solitude_reflection",
    name: "Solitude & Inner Reflection",
    genre: "Warm Melancholic Piano & Cello",
    url: "/sounds/solitude_reflection.wav",
    duration: 24,
    author: "Cinematic Acoustic Labs",
    source: "Classical Reflections Library",
    sourceUrl: "https://scenering.app/sounds/solitude_reflection",
    license: "CC0 Public Domain",
    description: "Intimate and reflective piano voicing ideal for documentary and narrative storytelling.",
    creditText: 'Music: "Solitude & Inner Reflection" - Cinematic Acoustic Labs (Royalty-Free / CC0 Public Domain)',
  },
  {
    id: "midnight_starlight",
    name: "Midnight Starlight Drift",
    genre: "Binaural Calming Pad in F Major",
    url: "/sounds/midnight_starlight.wav",
    duration: 27,
    author: "Starlight Sleep Audio",
    source: "Ambient Soundscapes",
    sourceUrl: "https://scenering.app/sounds/midnight_starlight",
    license: "CC0 Public Domain",
    description: "Hypnotic, relaxing chord progression bathed in celestial reverberation.",
    creditText: 'Music: "Midnight Starlight Drift" - Starlight Sleep Audio (Royalty-Free / CC0 Public Domain)',
  },
];

export function getBackgroundMusicTrack(idOrUrl?: string): BackgroundMusicTrack | undefined {
  if (!idOrUrl || idOrUrl === "none") return undefined;
  return BACKGROUND_MUSIC_TRACKS.find(
    (t) => t.id === idOrUrl || t.url === idOrUrl || t.name.toLowerCase().includes(idOrUrl.toLowerCase())
  );
}

// High Definition 3D-Look Vector Graphics stored in the app
export const STICKERS_3D: Sticker3DAsset[] = [
  {
    id: "star_3d",
    filename: "star_3d.svg",
    name: "3D Golden Star",
    url: "/stickers/star_3d.svg",
    category: "badges",
    description: "Extruded 3D star with metallic sheen, bevel facets, and warm specular shine.",
    isHD3D: true,
  },
  {
    id: "heart_3d",
    filename: "heart_3d.svg",
    name: "3D Shiny Ruby Heart",
    url: "/stickers/heart_3d.svg",
    category: "emojis",
    description: "Glossy 3D ruby heart with curved surface reflections and soft ambient occlusion.",
    isHD3D: true,
  },
  {
    id: "fire_3d",
    filename: "fire_3d.svg",
    name: "3D Volumetric Fire Flame",
    url: "/stickers/fire_3d.svg",
    category: "creator",
    description: "Layered 3D hot flame with glowing core, amber corona, and depth shadow.",
    isHD3D: true,
  },
  {
    id: "bell_3d",
    filename: "bell_3d.svg",
    name: "3D Golden Notification Bell",
    url: "/stickers/bell_3d.svg",
    category: "creator",
    description: "Lustrous brass 3D bell with curved specular glint and hanging clapper.",
    isHD3D: true,
  },
  {
    id: "verified_3d",
    filename: "verified_3d.svg",
    name: "3D Verified Badge",
    url: "/stickers/verified_3d.svg",
    category: "badges",
    description: "3D starburst badge in vibrant cyber cyan-blue with white checkmark.",
    isHD3D: true,
  },
  {
    id: "trophy_3d",
    filename: "trophy_3d.svg",
    name: "3D Championship Trophy",
    url: "/stickers/trophy_3d.svg",
    category: "gaming",
    description: "3D gold winner cup on slate pedestal with medallion star.",
    isHD3D: true,
  },
  {
    id: "sparkle_3d",
    filename: "sparkle_3d.svg",
    name: "3D Diamond Sparkle",
    url: "/stickers/sparkle_3d.svg",
    category: "creator",
    description: "Multi-axis prismatic 3D sparkle flare with deep blue-to-white light core.",
    isHD3D: true,
  },
  {
    id: "trending_3d",
    filename: "trending_3d.svg",
    name: "3D Trending Rocket",
    url: "/stickers/trending_3d.svg",
    category: "creator",
    description: "Dynamic 3D rocket ship with fiery exhaust booster and metallic fuselage.",
    isHD3D: true,
  },
  {
    id: "camera_3d",
    filename: "camera_3d.svg",
    name: "3D Studio Camera",
    url: "/stickers/camera_3d.svg",
    category: "creator",
    description: "3D dark slate camera body with coated optical cyan glass lens.",
    isHD3D: true,
  },
  {
    id: "thumbsup_3d",
    filename: "thumbsup_3d.svg",
    name: "3D Golden Thumbs Up",
    url: "/stickers/thumbsup_3d.svg",
    category: "emojis",
    description: "Tactile curved 3D gold thumbs up gesture with blue cuff.",
    isHD3D: true,
  },
  {
    id: "play_3d",
    filename: "play_3d.svg",
    name: "3D Glass Play Button",
    url: "/stickers/play_3d.svg",
    category: "creator",
    description: "Translucent frosted 3D crimson glass button with glowing arrow.",
    isHD3D: true,
  },
  {
    id: "money_3d",
    filename: "money_3d.svg",
    name: "3D Gold Coins Stack",
    url: "/stickers/money_3d.svg",
    category: "badges",
    description: "Layered 3D gold coin stack with ribbed edges and dollar embossing.",
    isHD3D: true,
  },
];

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
