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

// Helper to play any sound preview instantly using browser HTML5 Audio
export function playSoundPreview(url: string, volume = 0.8): HTMLAudioElement | null {
  try {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch((err) => {
      console.warn("Audio playback prevented by browser auto-play policy:", err);
    });
    return audio;
  } catch (err) {
    console.error("Failed to play sound preview:", err);
    return null;
  }
}

// Generate formatted attribution document for YouTube, TikTok, Vimeo, or video descriptions
export function generateAttributionDocument(options: {
  projectTitle?: string;
  soundsUsed?: string[];
  includeBackgroundMusic?: boolean;
  musicType?: string;
  imageSources?: string[];
}): string {
  const {
    projectTitle = "My Video Project",
    soundsUsed = [],
    includeBackgroundMusic = true,
    musicType = "Gymnopédie No. 1 (Erik Satie / Kevin MacLeod)",
    imageSources = ["Pexels (CC0 / Free to use)", "Pixabay (Content License)"],
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

  // 1. Music Attribution
  if (includeBackgroundMusic) {
    doc += `🎵 BACKGROUND MUSIC:
• "Gymnopédie No. 1" by Erik Satie
  Performed by Kevin MacLeod (incompetech.com)
  Licensed under Creative Commons: By Attribution 3.0 License
  http://creativecommons.org/licenses/by/3.0/
  Source: Wikimedia Commons / Incompetech

`;
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
