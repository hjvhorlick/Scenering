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
  // Image framing and positioning — see src/lib/scene-framing.ts.
  // Nothing here ever changes the image's aspect ratio; photos are cropped or
  // letterboxed, never stretched.
  image_offset_x?: number; // -50 to +50% of the frame
  image_offset_y?: number; // -50 to +50% of the frame
  image_zoom?: number;     // 0.25x to 4x
  /** "blur_fill" shows the whole photo with a blurred copy behind the bars */
  image_fit?: "cover" | "contain" | "blur_fill";
  /** normalised source crop rectangle, 0..1 */
  image_crop?: { x: number; y: number; w: number; h: number };
  image_rotate?: number;   // degrees, -180..180
  image_flip_h?: boolean;
  image_flip_v?: boolean;
  /** what fills the frame where the photo does not reach */
  image_backdrop?: "blur" | "black" | "colour";
  image_backdrop_blur?: number;  // px at a 1080-wide frame, 0..120
  image_backdrop_zoom?: number;  // 1..2.5
  image_backdrop_dim?: number;   // 0..0.9
  image_backdrop_color?: string;
  // Imported real voice audio track
  audio_url?: string | null;
  audio_name?: string | null;
  audio_duration?: number;

  // --- Short video clip attached to this scene -------------------------
  /** Object URL or remote URL of a short clip used instead of a still image. */
  video_url?: string | null;
  video_name?: string | null;
  /** Full, untrimmed length of the source clip in seconds. */
  video_duration?: number;
  /** Trim window into the source clip, in seconds from its start. */
  video_trim_start?: number;
  video_trim_end?: number;
  /**
   * When true the clip's own soundtrack is muted and the scene's script
   * narration is heard instead. Default true for script scenes; inserted
   * scenes keep their own audio unless the user says otherwise.
   */
  video_mute?: boolean;
  /** Volume of the clip's own audio when it is not muted, 0..1. */
  video_volume?: number;
  /** How the clip is fitted when its length differs from the scene's. */
  video_fit_mode?: "trim" | "loop" | "slow";

  /**
   * Marks a scene the user inserted manually rather than one generated from
   * the script. Inserted scenes keep their clip audio and are not forced to
   * follow narration length.
   */
  is_inserted?: boolean;
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
  /* ---- Overlay motion (stickers & CTA badges) ---- */
  /** id from MOTION_PRESETS in src/lib/overlay-motion.ts */
  motionPreset?: string;
  motionSpeed?: number;   // 0.25 - 2.5 cycle rate (default 1)
  motionAmount?: number;  // 0 - 2 travel/angle multiplier (default 1)
  motionEntrance?: boolean; // play the pop-in on appear (default true)
  /* ---- Text templates ---- */
  /** id from TEXT_TEMPLATES in src/data/text-templates.ts */
  templateId?: string;
  /** per-insert overrides of the template's default look */
  templateStyle?: Record<string, unknown>;
  /* ---- 3D sticker look ---- */
  stickerId?: string;     // id from STICKER_LIBRARY in src/lib/sticker-3d.ts
  stickerTint?: string | null; // recolour the sticker (null = its own palette)
  stickerGlow?: number;   // 0 - 1 ambient glow behind the sticker
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
  /** Lower thirds are their own studio section (name/role bars) */
  | "lower_thirds"
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
    item1?: string;
    item2?: string;
    item3?: string;
    item4?: string;
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

