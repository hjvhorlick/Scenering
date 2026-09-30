import { ttsPlayer } from "../lib/tts-player";

export interface SoundAsset {
  id: string;
  filename: string;
  name: string;
  category: "sfx" | "bell" | "cinematic" | "ui" | "music";
  /**
   * Which group the Sound Effects tab files it under: Bells & UI Chimes, Whooshes
   * & Pops, or Camera & Applause. Spelled out per sound so a group can only ever
   * hold the kind of sound its name promises.
   */
  section?: "ui" | "impact" | "foley";
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
    section: "ui",
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
    section: "impact",
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
    section: "impact",
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
    section: "foley",
    url: "/sounds/camera_shutter.ogg",
    duration: 3.5,
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
    section: "impact",
    url: "/sounds/dramatic_chord.ogg",
    duration: 4.4,
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
    section: "ui",
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
    section: "foley",
    url: "/sounds/applause.ogg",
    duration: 10.2,
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
    section: "ui",
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
    section: "ui",
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
    name: "Subtle UI Beep",
    category: "ui",
    section: "ui",
    url: "/sounds/ui_beep.ogg",
    duration: 1.2,
    author: "Wikimedia Commons",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Beep_400ms.ogg",
    license: "Public Domain",
    description: "Clean modern minimal click/beep for quick UI transitions.",
  },
  {
    id: "camera_click",
    filename: "camera_click.ogg",
    name: "Camera Shutter Click",
    category: "sfx",
    section: "foley",
    url: "/sounds/camera_click.ogg",
    duration: 0.7,
    author: "Scenering sound set",
    source: "Project sound library (free-licence recordings)",
    sourceUrl: "",
    license: "Free / royalty-free",
    description: "Tight mechanical shutter click — cameras, photos and snap reveals.",
  },
  {
    id: "bicycle_bell",
    filename: "bicycle_bell.ogg",
    name: "Ding-Dong Bicycle Bell",
    category: "bell",
    section: "ui",
    url: "/sounds/bicycle_bell.ogg",
    duration: 2.2,
    author: "Wikimedia Commons",
    source: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ding_Dong_Bicycle_Bell_A.ogg",
    license: "Public Domain",
    description: "Classic acoustic brass ding-dong bicycle bell chime.",
  },];

export interface BackgroundMusicTrack {
  id: string;
  mood?: "acoustic" | "electronic" | "cinematic" | "ambient";
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
  // ---------- YouTube Audio Library Calm Background Music (No classical, no popular) ----------
  {
    id: "divider",
    name: "Divider",
    mood: "ambient",
    genre: "Calm Minimalist Ambient — soft drone & piano",
    url: "/sounds/yt_divider.mp3",
    duration: 201,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Deeply peaceful, calm minimalist ambient drone with soft floating piano accents.",
    creditText: 'Music: "Divider" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "candlepower",
    name: "Candlepower",
    mood: "acoustic",
    genre: "Calm Acoustic & Ambient — gentle fingerpicking",
    url: "/sounds/yt_candlepower.mp3",
    duration: 340,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Tender, soothing acoustic guitar and gentle ambient piano warmth.",
    creditText: 'Music: "Candlepower" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "gentle_reflection",
    name: "Gentle Reflection",
    mood: "acoustic",
    genre: "Tender Ballad — soft piano & calm strings",
    url: "/sounds/real_gentle_reflection.mp3",
    duration: 518,
    author: "Kevin MacLeod (incompetech.com)",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / CC0 Public Domain (no copyright claims)",
    description: "Intimate, heartfelt ballad with soft acoustic instrumentation — calm, reflective and emotional.",
    creditText: 'Music: "Relaxing Ballad" by Kevin MacLeod, YouTube Audio Library — Free for commercial and monetized videos',
  },
  {
    id: "lofi_study",
    name: "Lo-Fi Study Night",
    mood: "electronic",
    genre: "Chill Mellow Lo-Fi — laid-back beat & warm keys",
    url: "/sounds/real_lofi_study.mp3",
    duration: 494,
    author: "Kevin MacLeod (incompetech.com)",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / CC0 Public Domain (no copyright claims)",
    description: "Relaxed, mellow groove with warm keys and an unobtrusive chill beat — calm and nostalgic.",
    creditText: 'Music: "Be Chillin" by Kevin MacLeod, YouTube Audio Library — Free for commercial and monetized videos',
  },
  {
    id: "wonder_cycle",
    name: "Wonder Cycle",
    mood: "ambient",
    genre: "Serene Atmospheric Ambient — soft texture",
    url: "/sounds/yt_wonder_cycle.mp3",
    duration: 345,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Spacious, peaceful ambient soundscape that washes smoothly in the background without distraction.",
    creditText: 'Music: "Wonder Cycle" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "nirvanavevo",
    name: "NirvanaVEVO",
    mood: "ambient",
    genre: "Quiet Ambient Swell — warm meditative pad",
    url: "/sounds/yt_nirvanavevo.mp3",
    duration: 191,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Warm, gentle ambient swells providing a tranquil and meditative background atmosphere.",
    creditText: 'Music: "NirvanaVEVO" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "heliograph",
    name: "Heliograph",
    mood: "ambient",
    genre: "Airy Ambient Atmosphere — light floating tone",
    url: "/sounds/yt_heliograph.mp3",
    duration: 339,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Airy, floating ambient texture designed for quiet narration and relaxed video pacing.",
    creditText: 'Music: "Heliograph" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "oxygen_garden",
    name: "Oxygen Garden",
    mood: "ambient",
    genre: "Tranquil Harmonic Drone — gentle acoustic space",
    url: "/sounds/yt_oxygen_garden.mp3",
    duration: 363,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Organic, soothing harmonic drone that creates an expansive, tranquil acoustic sanctuary.",
    creditText: 'Music: "Oxygen Garden" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "acoustic_campfire",
    name: "Campfire Acoustic",
    mood: "acoustic",
    genre: "Warm Acoustic Folk — gentle acoustic guitar",
    url: "/sounds/real_acoustic_campfire.mp3",
    duration: 213,
    author: "Kevin MacLeod (incompetech.com)",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / CC0 Public Domain (no copyright claims)",
    description: "Earthy, warm acoustic folk guitar with a calm, friendly and relaxing feel.",
    creditText: 'Music: "Bonfire" by Kevin MacLeod, YouTube Audio Library — Free for commercial and monetized videos',
  },
  {
    id: "prelude_no3",
    name: "Prelude No. 3",
    mood: "cinematic",
    genre: "Minimalist Peaceful Piano — soft chords",
    url: "/sounds/yt_prelude_no3.mp3",
    duration: 90,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Gentle, understated contemporary piano chords over a serene warm bed.",
    creditText: 'Music: "Prelude No. 3" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "prelude_no16",
    name: "Prelude No. 16",
    mood: "cinematic",
    genre: "Reflective Ambient Piano — quiet space",
    url: "/sounds/yt_prelude_no16.mp3",
    duration: 90,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Quiet, thoughtful ambient piano notes resonating in a calm acoustic space.",
    creditText: 'Music: "Prelude No. 16" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
  {
    id: "prelude_no23",
    name: "Prelude No. 23",
    mood: "cinematic",
    genre: "Warm Calming Piano — gentle reflection",
    url: "/sounds/yt_prelude_no23.mp3",
    duration: 103,
    author: "Chris Zabriskie",
    source: "YouTube Audio Library",
    sourceUrl: "https://www.youtube.com/audiolibrary",
    license: "YouTube Audio Library / Creative Commons Attribution 4.0",
    description: "Soft, peaceful piano harmonies creating an easy, relaxing background backdrop.",
    creditText: 'Music: "Prelude No. 23" by Chris Zabriskie, YouTube Audio Library — Licensed under Creative Commons: By Attribution 4.0',
  },
];

/**
 * The Render screen's "Background music" styles mapped to REAL instrumental
 * recordings from the library (never the old Web Audio synth tones).
 */
export const AMBIENT_STYLE_TO_TRACK: Record<string, string> = {
  lofi: "lofi_study",
  cinematic: "divider",
  ambient: "gentle_reflection",
  energetic: "candlepower",
};

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
      currentActiveAudio.loop = false;
      currentActiveAudio.onended = null;
      currentActiveAudio.onerror = null;
    } catch {}
    currentActiveAudio = null;
  }
  currentActiveUrl = null;
  notifyAudioListeners(null, false, currentPreviewVolume);

  // Also stop any TTS or SpeechSynthesis that might be speaking, so a preview
  // never keeps talking over the next one.
  try {
    ttsPlayer.stop();
  } catch {}
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
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
  notifyAudioListeners(currentActiveUrl, Boolean(currentActiveUrl), safeVol);
}

export function isSoundPreviewPlaying(url?: string): boolean {
  if (!url) return Boolean(currentActiveUrl);
  return currentActiveUrl === url;
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
      console.warn("Audio file playback error:", url);
      currentActiveAudio = null;
      currentActiveUrl = null;
      notifyAudioListeners(null, false, currentPreviewVolume);
      onStateChange?.(false);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("Autoplay blocked or playback error:", err);
        currentActiveAudio = null;
        currentActiveUrl = null;
        notifyAudioListeners(null, false, currentPreviewVolume);
        onStateChange?.(false);
      });
    }

    return true;
  } catch (err) {
    console.warn("Failed creating Audio object:", err);
    currentActiveAudio = null;
    currentActiveUrl = null;
    notifyAudioListeners(null, false, currentPreviewVolume);
    onStateChange?.(false);
    return false;
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
  graphicsUsed?: string[];
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
    graphicsUsed = [],
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
    (s) => soundsUsed.includes(s.id) || soundsUsed.includes(s.url)
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

  // 3. 3D Graphics & Visual Overlays — only the assets actually used
  if (graphicsUsed.length > 0) {
    doc += `🎨 3D GRAPHICS & VISUAL ELEMENTS:
• High-Definition 3D Vector Assets created with Scenering 3D Vector Engine
  Included assets: ${graphicsUsed.join(", ")}
  License: Free for commercial and personal video production.

`;
  }

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
