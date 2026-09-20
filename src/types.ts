export type AspectRatioType = "16:9" | "9:16" | "1:1" | "4:3";
export type ResolutionType = "720p" | "1080p" | "2k" | "4k";
export type PacingModeType = "fixed" | "auto_speech";

export interface Project {
  id: number;
  title: string;
  script: string;
  status: string;
  aspect_ratio?: AspectRatioType;
  resolution?: ResolutionType;
  default_duration?: number;
  pacing_mode?: PacingModeType;
  motion_style?: string;
  created_at: string;
  updated_at: string;
}

export type SceneMotionType =
  | "none"
  | "ken_burns"
  | "slow_zoom"
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "subtle_camera"
  | "shake"
  | "pulse"
  | "floating";

export interface DialogueLine {
  id: string;
  speaker: string;
  text: string;
  voice_id?: string;
}

export interface Scene {
  id: number;
  project_id: number;
  order_index: number;
  text: string;
  image_query: string;
  image_url: string | null;
  duration: number;
  created_at?: string;
  // Scene-level settings
  voice_id?: string;
  speaker_name?: string;
  dialogue?: DialogueLine[];
  motion_effect?: SceneMotionType;
  transition?: "none" | "crossfade" | "fade_black" | "zoom" | "slide";
  narration_speed?: number;
  burn_caption?: boolean;
  // Image framing and positioning
  image_offset_x?: number; // -50 to +50%
  image_offset_y?: number; // -50 to +50%
  image_zoom?: number;     // 1.0 to 2.5x
  image_fit?: "cover" | "contain";
  // Imported real voice audio track
  audio_url?: string | null;
  audio_name?: string | null;
  audio_duration?: number;
}

export type EditorStep = "setup" | "scenes" | "voice_captions" | "voiceover" | "captions" | "studio" | "render";

export interface CustomerLogoConfig {
  enabled: boolean;
  url: string | null;
  scale: number; // 0.5 to 2.0 (default 1.0)
  opacity: number; // 0.2 to 1.0 (default 1.0)
  margin: number; // in pixels, default 24
}

export interface InsertVisualOptions {
  has3DLook?: boolean;
  /* ---- Call-to-action badge styling ---- */
  platform?: string;              // platform id from src/data/cta-library.ts
  ctaShape?: "pill" | "round" | "square" | "banner";
  ctaStyle?: "solid" | "gradient" | "outline" | "glass";
  badgeScale?: number;            // 0.6 - 1.8 badge width multiplier
  textScale?: number;             // 0.7 - 1.4 text size multiplier
  iconScale?: number;             // 0.6 - 1.6 brand mark size multiplier
  elevation?: number;             // 0 - 1 raised 2D look depth
  borderWidth?: number;           // outline style thickness in px
  customMark?: string;            // icon picked in the Text & Icon tab (replaces the brand logo)
  floatShadow?: boolean;          // soft shadow below the overlay (default on; gives the frame depth)
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  shadowIntensity?: number;
  rotation?: number; // degrees -180 to 180
  animationPreset?: "pop_in" | "bounce" | "float_3d" | "fade" | "spin" | "pulse";
  assetUrl?: string;
  fullWidth?: boolean; // stretch over entire scene (default true for linear visualizers)
  barThickness?: number; // width/thickness of bars or wave stroke
  glowIntensity?: number; // 0 to 1
  colorPreset?: string; // "spectrum" | "cyber" | "crt_green" | "custom"
  /* ---- Audio visualiser reactivity ---- */
  reactivity?: number; // 0.2 - 2.4 reaction strength (default 1)
  spanFullVideo?: boolean; // run for the whole video, not a fixed 8s window (default true for visualisers)
}

export interface InsertAudioSettings {
  soundUrl?: string;
  soundName?: string;
  volume?: number; // 0 to 1, default 0.9
  muted?: boolean;
  loop?: boolean;
  loopAudio?: boolean; // legacy alias of loop (old catalog data)
  delay?: number; // in seconds
}

export type InsertCategory =
  | "logo"
  | "intro"
  | "outro"
  | "call_to_action"
  | "stickers"
  | "content_cards"
  | "text_templates"
  | "audio_visualizers"
  | "speech_reactive"
  | "background_music"
  | "filters"
  | "sound_effects"
  | "other_cards"
  | "meditation"
  | "special_effects"
  | "branding";

export type AudioSourceType = "voice" | "music" | "all";

export interface TimelineInsert {
  id: string;
  category: InsertCategory;
  type: string;
  title: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  position: { x: number; y: number }; // 0 to 1 normalized canvas coords
  presetPosition?: "top" | "bottom" | "center" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  size: number; // 0.5 to 2.0 scale (default 1.0)
  opacity?: number; // 0 to 1
  intensity?: number; // 0 to 1
  speed?: number; // 0.5 to 2
  audioSource?: AudioSourceType;
  scope?: "this_scene" | "from_here" | "entire_video";
  videoUrl?: string;
  tensionStyle?: "countdown" | "flash" | "pulse" | "glitch" | "aperture" | "shimmer" | "warp" | "flare";
  visualOptions?: InsertVisualOptions;
  audioSettings?: InsertAudioSettings;
  // Configurable content for cards, templates, and overlays
  content?: {
    primaryText?: string;
    secondaryText?: string;
    book?: string;
    chapter?: string;
    verse?: string;
    author?: string;
    number?: string;
    label?: string;
    items?: string[];
    // Specialized text template fields
    reference?: string;
    scriptureText?: string;
    version?: string;
    quoteText?: string;
    authorTitle?: string;
    speakerName?: string;
    speakerRole?: string;
    socialHandle?: string;
    takeawayNumber?: string;
    takeawayTitle?: string;
    takeawayBody?: string;
    factHeadline?: string;
    factBody?: string;
    factSource?: string;
    stepNumber?: string;
    stepTitle?: string;
    stepAction?: string;
    stylePreset?: string;
    // CTA & Intro/Outro fields
    buttonText?: string;
    badgeText?: string;
    url?: string;
    introTitle?: string;
    introTagline?: string;
    introStyle?: string;
    outroTitle?: string;
    outroTagline?: string;
    outroStyle?: string;
    showLogo?: boolean;
    includeLogo?: boolean;
    videoUrl?: string;
    imageUrl?: string;
    logoUrl?: string;
    logoScale?: number;
    logoPosition?: "center" | "top" | "side";
    tensionStyle?: "countdown" | "flash" | "pulse" | "glitch" | "aperture" | "shimmer" | "warp" | "flare";
    tensionRiser?: boolean;
    countdownSeconds?: number;
    soundUrl?: string;
    soundVolume?: number;
  };
}

export interface CaptionsConfig {
  enabled: boolean;
  mode: "karaoke" | "normal";
  backgroundStyle: "transparent" | "blocked";
  /** Id from the caption style library (legacy preset ids are mapped automatically) */
  preset: string;
  fontSize: "small" | "medium" | "large";
  position: "bottom" | "center" | "top";
  uppercase: boolean;
  textColor: string;
  highlightColor: string;
  bgColor?: string;
  /* ---------- Typography (from the style library, overridable) ---------- */
  /** Font id from CAPTION_FONTS; falls back to the style's own font */
  fontId?: string;
  fontWeight?: number;
  /** Letter spacing in em */
  letterSpacing?: number;
  /* ---------- Border + floating shadow ---------- */
  /** Outline width in px at 720p — thin by default, thicken it as needed */
  borderWidth?: number;
  borderColor?: string;
  /** Soft shadow below the captions so they sit in the frame with depth */
  shadow?: boolean;
  shadowStrength?: number;
  shadowOffset?: number;
  shadowBlur?: number;
}

