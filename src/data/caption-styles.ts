/**
 * Caption style library — ten fresh looks with their own typefaces, ranging from
 * formal and classical to artsy and fun.
 *
 * Every style is a complete recipe: font, weight, letter spacing, case, colours,
 * a very thin border by default (thickenable from the Captions studio) and a soft
 * shadow that falls below the text so the captions sit in the frame with depth.
 *
 * Fonts come from Google Fonts; loadCaptionFonts() injects the stylesheet and waits
 * for the faces to be ready, and each entry carries a local fallback stack so the
 * captions still render if the network is unavailable.
 */

export interface CaptionFontDef {
  id: string;
  /** CSS family name as published by Google Fonts */
  family: string;
  /** Fallback stack used until (or if) the web font is available */
  fallback: string;
  /** Weight used by the canvas renderer */
  weight: number;
  /** Extra weights to preload */
  weights?: number[];
  /** Short label for the studio */
  label: string;
}

export type CaptionStyleCategory = "Classical" | "Formal" | "Modern" | "Artsy" | "Fun";

export interface CaptionStyleDef {
  id: string;
  name: string;
  category: CaptionStyleCategory;
  fontId: string;
  /** Letter spacing in em */
  letterSpacing: number;
  uppercase: boolean;
  textColor: string;
  highlightColor: string;
  /** Backdrop behind the caption line */
  background: "transparent" | "blocked";
  bgColor: string;
  /** Border (outline) width in px measured at 720p — kept very thin by default */
  borderWidth: number;
  borderColor: string;
  /** Drop shadow that falls below the text, 0..1 */
  shadowStrength: number;
  /** Shadow offset/blur in px measured at 720p */
  shadowOffset: number;
  shadowBlur: number;
  description: string;
}

export const CAPTION_FONTS: CaptionFontDef[] = [
  { id: "eb_garamond", family: "EB Garamond", fallback: "Georgia, 'Times New Roman', serif", weight: 600, label: "EB Garamond · classical book serif" },
  { id: "cormorant", family: "Cormorant Garamond", fallback: "Georgia, 'Times New Roman', serif", weight: 600, label: "Cormorant Garamond · elegant formal serif" },
  { id: "cinzel", family: "Cinzel", fallback: "'Times New Roman', Georgia, serif", weight: 700, label: "Cinzel · Roman inscriptional caps" },
  { id: "inter", family: "Inter", fallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", weight: 700, label: "Inter · clean broadcast sans" },
  { id: "anton", family: "Anton", fallback: "'Arial Black', Impact, system-ui, sans-serif", weight: 400, label: "Anton · heavy poster sans" },
  { id: "permanent_marker", family: "Permanent Marker", fallback: "'Comic Sans MS', 'Segoe Print', cursive", weight: 400, label: "Permanent Marker · hand-drawn marker" },
  { id: "caveat", family: "Caveat", fallback: "'Segoe Script', 'Bradley Hand', cursive", weight: 700, label: "Caveat · relaxed handwriting" },
  { id: "monoton", family: "Monoton", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Monoton · retro neon marquee" },
  { id: "bangers", family: "Bangers", fallback: "Impact, 'Arial Black', fantasy", weight: 400, label: "Bangers · comic book shout" },
  { id: "baloo2", family: "Baloo 2", fallback: "'Trebuchet MS', Verdana, system-ui, sans-serif", weight: 800, label: "Baloo 2 · rounded friendly" },
];

export function getCaptionFont(fontId?: string): CaptionFontDef {
  return CAPTION_FONTS.find((f) => f.id === fontId) || CAPTION_FONTS[3];
}

/** CSS font-family value including the fallback stack */
export function captionFontStack(fontId?: string): string {
  const f = getCaptionFont(fontId);
  return `"${f.family}", ${f.fallback}`;
}

const THIN = 1.5; // px at 720p — deliberately hairline, users thicken it from the studio

export const CAPTION_STYLES: CaptionStyleDef[] = [
  {
    id: "cinema_classic",
    name: "Cinema Classic",
    category: "Classical",
    fontId: "eb_garamond",
    letterSpacing: 0.015,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#F4D58D",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: THIN,
    borderColor: "#000000",
    shadowStrength: 0.62,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Timeless book serif, hairline outline and a soft shadow below — documentary subtitles.",
  },
  {
    id: "marble_elegance",
    name: "Marble Elegance",
    category: "Formal",
    fontId: "cormorant",
    letterSpacing: 0.09,
    uppercase: true,
    textColor: "#F6F1E7",
    highlightColor: "#D9B98A",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1,
    borderColor: "#121212",
    shadowStrength: 0.55,
    shadowOffset: 3,
    shadowBlur: 10,
    description: "Wide-tracked formal serif in warm ivory — luxury brand and gallery films.",
  },
  {
    id: "roman_epic",
    name: "Roman Epic",
    category: "Classical",
    fontId: "cinzel",
    letterSpacing: 0.07,
    uppercase: true,
    textColor: "#EFD9A5",
    highlightColor: "#FFFFFF",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#1B1206",
    shadowStrength: 0.7,
    shadowOffset: 5,
    shadowBlur: 14,
    description: "Roman inscriptional capitals in antique gold — history, epic and heritage stories.",
  },
  {
    id: "newsroom_clean",
    name: "Newsroom Clean",
    category: "Formal",
    fontId: "inter",
    letterSpacing: 0,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#7DD3FC",
    background: "blocked",
    bgColor: "rgba(8, 12, 22, 0.72)",
    borderWidth: 1,
    borderColor: "#000000",
    shadowStrength: 0.5,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Crisp broadcast sans on a slim dark bar — explainers, news and corporate video.",
  },
  {
    id: "poster_impact",
    name: "Poster Impact",
    category: "Modern",
    fontId: "anton",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FFEB3B",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 2,
    borderColor: "#000000",
    shadowStrength: 0.72,
    shadowOffset: 5,
    shadowBlur: 13,
    description: "Condensed poster weight for punchy statement lines — clean but loud.",
  },
  {
    id: "marker_story",
    name: "Marker Story",
    category: "Artsy",
    fontId: "permanent_marker",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FDF6EC",
    highlightColor: "#FF7A59",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#191919",
    shadowStrength: 0.6,
    shadowOffset: 4,
    shadowBlur: 11,
    description: "Hand-drawn marker lettering — vlogs, behind-the-scenes and storytelling.",
  },
  {
    id: "ink_script",
    name: "Ink Script",
    category: "Artsy",
    fontId: "caveat",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFF7E6",
    highlightColor: "#FDE68A",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1,
    borderColor: "#141414",
    shadowStrength: 0.62,
    shadowOffset: 4,
    shadowBlur: 10,
    description: "Relaxed handwriting for diary-style voiceover and reflective passages.",
  },
  {
    id: "retro_marquee",
    name: "Retro Marquee",
    category: "Artsy",
    fontId: "monoton",
    letterSpacing: 0.06,
    uppercase: true,
    textColor: "#7DF9FF",
    highlightColor: "#FF6EC7",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#0B1026",
    shadowStrength: 0.8,
    shadowOffset: 4,
    shadowBlur: 18,
    description: "Neon marquee lettering with a colourful glow — retro, music and nightlife.",
  },
  {
    id: "comic_burst",
    name: "Comic Burst",
    category: "Fun",
    fontId: "bangers",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FFD400",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.8,
    borderColor: "#000000",
    shadowStrength: 0.7,
    shadowOffset: 5,
    shadowBlur: 12,
    description: "Comic-book shout with a yellow pop word — reactions and entertainment clips.",
  },
  {
    id: "bubble_play",
    name: "Bubble Play",
    category: "Fun",
    fontId: "baloo2",
    letterSpacing: 0.005,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#34D399",
    background: "blocked",
    bgColor: "rgba(17, 24, 39, 0.68)",
    borderWidth: 1.2,
    borderColor: "#0B1220",
    shadowStrength: 0.55,
    shadowOffset: 4,
    shadowBlur: 10,
    description: "Round, friendly letterforms on a soft pill — tutorials, kids and lifestyle.",
  },
];

/** Load order for the studio: grouped catalogue */
export const CAPTION_STYLE_ORDER: CaptionStyleCategory[] = ["Classical", "Formal", "Modern", "Artsy", "Fun"];

export function getCaptionStyle(id?: string): CaptionStyleDef {
  return CAPTION_STYLES.find((s) => s.id === id) || CAPTION_STYLES[0];
}

/** The five legacy preset ids map onto the closest new style so saved projects keep working */
const LEGACY_PRESET_MAP: Record<string, string> = {
  word_pop: "poster_impact",
  yellow_outline: "comic_burst",
  karaoke: "retro_marquee",
  classic_box: "newsroom_clean",
  minimal: "cinema_classic",
};

export function resolveCaptionStyleId(preset?: string): string {
  if (!preset) return CAPTION_STYLES[0].id;
  if (CAPTION_STYLES.some((s) => s.id === preset)) return preset;
  return LEGACY_PRESET_MAP[preset] || CAPTION_STYLES[0].id;
}

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=EB+Garamond:wght@400..700",
    "family=Cormorant+Garamond:wght@400..700",
    "family=Cinzel:wght@400..800",
    "family=Inter:wght@400..800",
    "family=Anton",
    "family=Permanent+Marker",
    "family=Caveat:wght@400..700",
    "family=Monoton",
    "family=Bangers",
    "family=Baloo+2:wght@400..800",
  ].join("&") +
  "&display=swap";

let fontsPromise: Promise<void> | null = null;

/**
 * Injects the caption font stylesheet and resolves once the faces are usable on
 * a canvas. Safe to call repeatedly; resolves immediately when there is no DOM
 * (SSR/tests) so nothing blocks.
 */
export function loadCaptionFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontsPromise) return fontsPromise;

  fontsPromise = (async () => {
    try {
      if (!document.querySelector("link[data-caption-fonts]")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = GOOGLE_FONTS_HREF;
        link.setAttribute("data-caption-fonts", "true");
        document.head.appendChild(link);
      }
      const fontSet = (document as any).fonts as FontFaceSet | undefined;
      if (!fontSet?.load) return;
      await Promise.all(
        CAPTION_FONTS.map((f) =>
          fontSet.load(`${f.weight} 32px "${f.family}"`).catch(() => null)
        )
      );
      if (fontSet.ready) await fontSet.ready;
    } catch {
      // network blocked — the fallback stacks keep the captions readable
    }
  })();

  return fontsPromise;
}
