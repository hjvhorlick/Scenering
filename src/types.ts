export interface Project {
  id: number;
  title: string;
  script: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type SceneFilterType =
  | "none"
  | "cinematic"
  | "dark_cinematic"
  | "warm_movie"
  | "cool_movie"
  | "high_contrast"
  | "vintage"
  | "film_grain"
  | "soft_glow"
  | "dreamy"
  | "golden_hour"
  | "sunset_warmth"
  | "cold_blue"
  | "haze_fog"
  | "vignette"
  | "black_and_white"
  | "sepia"
  | "desaturated"
  | "deep_shadows"
  | "color_boost"
  | "dramatic_hdr";

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
  created_at: string;
  // Scene-level settings
  voice_id?: string;
  speaker_name?: string;
  dialogue?: DialogueLine[];
  filter?: SceneFilterType;
  motion_effect?: SceneMotionType;
  transition?: "none" | "crossfade" | "fade_black" | "zoom" | "slide";
  narration_speed?: number;
  burn_caption?: boolean;
  // Image framing and positioning
  image_offset_x?: number; // -50 to +50%
  image_offset_y?: number; // -50 to +50%
  image_zoom?: number;     // 1.0 to 2.5x
  image_fit?: "cover" | "contain";
}

export type EditorStep = "scenes" | "voice_captions" | "voiceover" | "captions" | "studio" | "render";

export interface CustomerLogoConfig {
  enabled: boolean;
  url: string | null;
  scale: number; // 0.5 to 2.0 (default 1.0)
  opacity: number; // 0.2 to 1.0 (default 1.0)
  margin: number; // in pixels, default 24
}

export interface InsertVisualOptions {
  has3DLook?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  shadowIntensity?: number;
  rotation?: number; // degrees -180 to 180
  animationPreset?: "pop_in" | "bounce" | "float_3d" | "fade" | "spin" | "pulse";
  assetUrl?: string;
}

export interface InsertAudioSettings {
  soundUrl?: string;
  soundName?: string;
  volume?: number; // 0 to 1, default 0.8
  muted?: boolean;
  loop?: boolean;
  delay?: number; // in seconds
}

export type InsertCategory =
  | "logo"
  | "call_to_action"
  | "stickers"
  | "content_cards"
  | "other_cards"
  | "audio_visualizers"
  | "speech_reactive"
  | "meditation"
  | "special_effects"
  | "branding"
  | "sound_effects";

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
  visualOptions?: InsertVisualOptions;
  audioSettings?: InsertAudioSettings;
  // Configurable content for cards and overlays
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
  };
}

