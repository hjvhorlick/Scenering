/* =========================================================================
   SCENERING — INTRO / OUTRO SECTIONS
   -------------------------------------------------------------------------
   An intro or outro is deliberately SIMPLE to build:

       background   → a motion background, or the user's own video / image
       text         → title + subtitle (+ optional small badge)
       logo         → on/off, position, size
       sound        → an attention-grabbing stinger, with volume

   Everything else (animation of the text, safe margins, legibility shadows)
   is handled for them.
   ========================================================================= */

import type { BackgroundKind } from "./intro-backgrounds";

export type SectionKind = "intro" | "outro";

/** How the title animates in */
export type TitleAnimation =
  | "fade_up"
  | "zoom_punch"
  | "slide_reveal"
  | "typewriter"
  | "letter_drop"
  | "glitch_in";

export interface TitleAnimationDef {
  id: TitleAnimation;
  name: string;
  icon: string;
  blurb: string;
}

export const TITLE_ANIMATIONS: TitleAnimationDef[] = [
  { id: "fade_up", name: "Fade Up", icon: "⬆️", blurb: "Soft rise into place" },
  { id: "zoom_punch", name: "Zoom Punch", icon: "💥", blurb: "Slams in from big to sharp" },
  { id: "slide_reveal", name: "Slide Reveal", icon: "🎬", blurb: "Wipes open behind a bar" },
  { id: "typewriter", name: "Typewriter", icon: "⌨️", blurb: "Types out letter by letter" },
  { id: "letter_drop", name: "Letter Drop", icon: "🔤", blurb: "Letters fall in one by one" },
  { id: "glitch_in", name: "Glitch In", icon: "📺", blurb: "Digital tear then locks on" },
];

/** Attention-grabbing stingers — longer and bigger than plain sound effects */
export interface StingerDef {
  id: string;
  name: string;
  url: string;
  icon: string;
  blurb: string;
  seconds: number;
}

export const STINGERS: StingerDef[] = [
  { id: "none", name: "No Sound", url: "", icon: "🔇", blurb: "Silent section", seconds: 0 },
  {
    id: "epic_rise",
    name: "Epic Riser Hit",
    url: "/sounds/stingers/epic_rise.wav",
    icon: "🎺",
    blurb: "Building riser into a huge orchestral hit",
    seconds: 4,
  },
  {
    id: "cinematic_boom",
    name: "Cinematic Boom",
    url: "/sounds/stingers/cinematic_boom.wav",
    icon: "💣",
    blurb: "Deep trailer impact with a long tail",
    seconds: 4,
  },
  {
    id: "digital_glitch",
    name: "Digital Glitch Sweep",
    url: "/sounds/stingers/digital_glitch.wav",
    icon: "⚡",
    blurb: "Tech sweep with a snapping lock-on",
    seconds: 3.5,
  },
  {
    id: "magic_shimmer",
    name: "Magic Shimmer",
    url: "/sounds/stingers/magic_shimmer.wav",
    icon: "✨",
    blurb: "Sparkling bell cascade — elegant reveals",
    seconds: 4,
  },
  {
    id: "whoosh_impact",
    name: "Whoosh Impact",
    url: "/sounds/stingers/whoosh_impact.wav",
    icon: "🌪️",
    blurb: "Fast air whoosh landing on a punch",
    seconds: 3,
  },
  {
    id: "warm_uplift",
    name: "Warm Uplift",
    url: "/sounds/stingers/warm_uplift.wav",
    icon: "🌅",
    blurb: "Friendly major chord swell for outros",
    seconds: 4,
  },
];

export const STINGERS_BY_ID: Record<string, StingerDef> = STINGERS.reduce((a, s) => {
  a[s.id] = s;
  return a;
}, {} as Record<string, StingerDef>);

/* ------------------------------ the config ------------------------------- */

export interface SectionConfig {
  enabled: boolean;
  /** seconds — intros/outros are short by nature */
  duration: number;

  /* background */
  backgroundKind: BackgroundKind;
  /** motion background id when kind === "motion" */
  motionId: string;
  /** uploaded / pasted media url when kind === "video" | "image" */
  mediaUrl: string;
  mediaName?: string;
  /** recolour the motion background */
  colorA?: string;
  colorB?: string;

  /* text */
  title: string;
  subtitle: string;
  badge: string;
  titleAnimation: TitleAnimation;
  textScale: number; // 0.5 – 1.8
  /** vertical placement of the whole text block, 0 (top) – 1 (bottom) */
  textY: number;
  textColor: string;
  accentColor: string;

  /* logo */
  logoEnabled: boolean;
  logoUrl: string;
  logoScale: number; // 0.4 – 2.0
  logoX: number; // 0 – 1
  logoY: number; // 0 – 1

  /* sound */
  stingerId: string;
  /** user-uploaded audio overrides the stinger when set */
  customSoundUrl?: string;
  customSoundName?: string;
  volume: number; // 0 – 1
}

export const DEFAULT_INTRO: SectionConfig = {
  enabled: false,
  duration: 4,
  backgroundKind: "motion",
  motionId: "gold_flare",
  mediaUrl: "",
  title: "YOUR TITLE HERE",
  subtitle: "A short line that sets up the video",
  badge: "",
  titleAnimation: "zoom_punch",
  textScale: 1,
  textY: 0.56,
  textColor: "#ffffff",
  accentColor: "#f5b820",
  logoEnabled: true,
  logoUrl: "",
  logoScale: 1,
  logoX: 0.5,
  logoY: 0.3,
  stingerId: "epic_rise",
  volume: 0.85,
};

export const DEFAULT_OUTRO: SectionConfig = {
  enabled: false,
  duration: 4,
  backgroundKind: "motion",
  motionId: "particle_rise",
  mediaUrl: "",
  title: "THANKS FOR WATCHING",
  subtitle: "Subscribe for more",
  badge: "",
  titleAnimation: "fade_up",
  textScale: 1,
  textY: 0.56,
  textColor: "#ffffff",
  accentColor: "#fbbf24",
  logoEnabled: true,
  logoUrl: "",
  logoScale: 1,
  logoX: 0.5,
  logoY: 0.3,
  stingerId: "warm_uplift",
  volume: 0.85,
};

export function defaultSection(kind: SectionKind): SectionConfig {
  return kind === "intro" ? { ...DEFAULT_INTRO } : { ...DEFAULT_OUTRO };
}

/** Resolve the sound that should play for a section (custom upload wins) */
export function sectionSoundUrl(cfg: SectionConfig | null | undefined): string {
  if (!cfg || !cfg.enabled) return "";
  if (cfg.customSoundUrl) return cfg.customSoundUrl;
  const st = STINGERS_BY_ID[cfg.stingerId];
  return st && st.url ? st.url : "";
}
