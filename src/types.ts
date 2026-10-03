export type AspectRatioType = "16:9" | "9:16" | "1:1" | "4:3";
export type ResolutionType = "720p" | "1080p" | "2k" | "4k";
export type PacingModeType = "fixed" | "auto_speech";

/* ---------------- Render profile choices (made in Project Setup) --------
 * The user picks these ONCE in the setup section — the render screen only
 * displays them. Literal unions live here (not imported from lib) so the
 * types module stays dependency-free; src/lib/render-profile.ts consumes
 * them and owns all the technical meaning behind each value. */
export type RenderQualityType = "draft" | "standard" | "high" | "maximum";
export type RenderFpsType = "auto" | 24 | 25 | 30 | 50 | 60;
export type RenderFormatType = "mp4" | "webm";
export type AudioMasteringType = "automatic" | "manual";
/** Where the finished video is going. Picking a platform preset sets the
 *  canvas + encoding automatically; "custom" means the user overrode them. */
export type PublishDestinationType =
  | "youtube"
  | "youtube_shorts"
  | "tiktok"
  | "instagram_reels"
  | "facebook"
  | "linkedin"
  | "pinterest"
  | "custom";

export interface RenderProfileSettings {
  destination: PublishDestinationType;
  quality: RenderQualityType;
  fps: RenderFpsType;
  format: RenderFormatType;
  audio_mastering: AudioMasteringType;
}

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
  | "pan_up"
  | "pan_down"
  | "zoom_pan"
  | "subtle_camera"
  | "cinematic_drift"
  | "shake"
  | "pulse"
  | "floating";

export type SceneAnimationDirection =
  | "down"
  | "up"
  | "left"
  | "right"
  | "down-left"
  | "down-right"
  | "up-left"
  | "up-right";

export interface SceneAnimationRegion {
  /** Normalized left edge, 0..1 of the frame width. */
  x: number;
  /** Normalized top edge, 0..1 of the frame height. */
  y: number;
  /** Normalized width, 0..1 of the frame width. */
  w: number;
  /** Normalized height, 0..1 of the frame height. */
  h: number;
}

export interface SceneAnimationPoint {
  /** Normalized X origin, 0..1 of the frame width. */
  x: number;
  /** Normalized Y origin, 0..1 of the frame height. */
  y: number;
}

export type SceneAnimationColorPalette =
  | "natural"
  | "gold"
  | "silver"
  | "neon_blue"
  | "neon_cyan"
  | "neon_purple"
  | "neon_pink"
  | "neon_green"
  | "neon_orange";

export interface SceneAnimationCameraConfig {
  motion: SceneMotionType;
  /** 0..1, mapped to slow → fast by the preview/export renderer. */
  speed: number;
  /** 0..1, blends the selected motion from subtle to strong. */
  intensity: number;
}

export interface SceneAnimationEffect {
  id: string;
  type: string;
  enabled?: boolean;
  variant?: string;
  /** Common effect knobs. Each effect exposes only the controls that make sense. */
  intensity?: number;
  speed?: number;
  opacity?: number;
  direction?: SceneAnimationDirection;
  size?: number;
  density?: number;
  amount?: number;
  /** Optional creative recolour/tint applied in the render engine. */
  colorPalette?: SceneAnimationColorPalette;
  /** 0..1 soft light bloom around the element. */
  bloom?: number;
  /** 0..1 wide halo left around the element after it is drawn. */
  afterglow?: number;
  /** 0..1 directional motion tail/echo behind the element. */
  trail?: number;
  /** 0..1 specular/chrome-like highlight sweep; gold/silver auto-enable it. */
  shine?: number;
  /** Optional normalized area restriction (water, sky, fog banks, etc.). */
  region?: SceneAnimationRegion;
  /** Optional normalized source point (steam, smoke, fire, rays). */
  origin?: SceneAnimationPoint;
}

export interface SceneAnimationConfig {
  /** Per-scene switch. The project-level Setup toggle must also be ON. */
  enabled?: boolean;
  /** Per-scene camera/Ken Burns motion used when Scene Animation Effects is ON. */
  camera?: SceneAnimationCameraConfig;
  /** Independent visual layers that stack simultaneously. */
  effects?: SceneAnimationEffect[];
}

export type SceneTransitionType =
  | "none"
  | "fade"
  | "slide"
  | "crossfade"
  | "fade_black"
  | "zoom"
  | "fade_white" | "dissolve_blur" | "push_right" | "push_up" | "push_down"
  | "cover_left" | "cover_right" | "cover_up" | "cover_down"
  | "wipe_left" | "wipe_right" | "wipe_up" | "wipe_down" | "iris" | "blinds" | "zoom_out" | "whip_pan";

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
  image_query_locked?: boolean;
  image_url: string | null;
  duration: number;
  created_at?: string;
  // Scene-level settings
  voice_id?: string;
  speaker_name?: string;
  dialogue?: DialogueLine[];
  motion_effect?: SceneMotionType;
  transition?: SceneTransitionType;
  narration_speed?: number;
  burn_caption?: boolean;
  /**
   * Optional per-scene living-scene animation stack. It is ignored unless the
   * project-level Scene Animation Effects toggle is enabled in Setup, which
   * keeps older projects rendering exactly as before.
   */
  animation?: SceneAnimationConfig;
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
  /** What fills the bars when the photo does not reach the frame edge.
      "transparent" paints nothing, so whatever is behind shows through. */
  image_backdrop?: "transparent" | "blur" | "black" | "colour";
  image_backdrop_blur?: number;  // px at a 1080-wide frame, 0..120
  image_backdrop_zoom?: number;  // 1..2.5
  image_backdrop_dim?: number;   // 0..0.9
  image_backdrop_color?: string;
  // Imported real voice audio track
  audio_url?: string | null;
  audio_name?: string | null;
  audio_duration?: number;

  // --- Plain colour backdrop ------------------------------------------
  /**
   * A flat colour used as this scene's visual instead of a photo or clip.
   *
   * Some narration wants nothing behind it — a title card, a breather between
   * dense scenes, or a scene the user will caption over later. Set this and
   * the renderer paints the frame with it.
   *
   * Deliberately a separate field from `image_backdrop_color`, which colours
   * the *area around* a photo that does not fill the frame. This one means
   * "there is no photo"; setting it clears image_url and video_url.
   *
   * Stored as a hex string (`#101828`) so it survives a JSON round-trip
   * through local storage and Supabase unchanged.
   */
  blank_color?: string | null;

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
  /** id from VISUALIZER_PALETTES — the colour theme the visualiser is drawn in */
  colorTheme?: string;
  /** how many frequency bands the analyser splits the sound into (legacy: 16 chunky - 128 detailed; advanced engine: 64 - 512 fine elements) */
  bandCount?: number;
  /** advanced visualiser element count; kept separate so legacy racks can still call the value bands */
  elementCount?: number;
  /** accent colour (hot cores, spike tips, flashes) used by the immersive styles */
  accentColor?: string;
  /** ---- Advanced Audio Visualiser Engine ---- */
  visualizerStyle?: "fine_radial_bars" | "fine_radial_bars_3d" | "flat_circular_spectrum" | "circular_waveform" | "circular_pulse" | "advanced_spectrum_bars" | "advanced_mirror_spectrum" | "advanced_waveform" | "particle_ring" | "particle_ring_3d" | string;
  visualizerPreset?: string;
  frequencyMapping?: "linear" | "logarithmic" | "musical";
  minFrequency?: number;
  maxFrequency?: number;
  fftSize?: 512 | 1024 | 2048 | 4096 | number;
  smoothing?: number;
  attack?: number;
  release?: number;
  radialDirection?: "outward" | "inward" | "both";
  radialRadius?: number;
  maxBarHeight?: number;
  minBarHeight?: number;
  barGap?: number;
  visualizerOpacity?: number;
  bloomIntensity?: number;
  beatResponse?: boolean;
  beatExpansion?: number;
  beatGlow?: number;
  voiceMode?: boolean;
  centreScale?: number;
  centreOpacity?: number;
  centreContentType?: "none" | "image" | "logo" | "text" | "media";
  frequencyColorMode?: "gradient" | "frequency" | "amplitude";
  /** Move linear spectrum activity left/right without changing timing (-1..1). */
  spectrumBalance?: number;
  /** Stretch/compress the visible spectrum activity across the bar rack (0.5..2). */
  spectrumStretch?: number;
  /** Visual width/length of full-width spectrum racks (0.45..1.6). */
  spectrumWidth?: number;
  /** 0 = square/flat bar ends, 1 = pill-shaped rounded bar ends. */
  barRoundness?: number;
  /** 0 = flat colour, 1 = polished metallic/3D bevel highlights. */
  barShine?: number;
  /**
   * Draw the user's own logo in the middle of a centre visualiser (audio orb,
   * orbit disc, circular analysers). Defaults to on for the orb and the disc,
   * off elsewhere. No logo is drawn when the project has none.
   */
  centreLogo?: boolean;
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
  /* ---------- Metallic finish ---------- */
  /**
   * Chrome fill for the letters. "none" (or absent) uses the flat textColor;
   * "gold"/"silver" paint a vertical metal ramp instead. Absent means "take
   * whatever the chosen style declares", so the metallic presets work without
   * anything else being set.
   */
  metal?: "none" | "gold" | "silver";
}

