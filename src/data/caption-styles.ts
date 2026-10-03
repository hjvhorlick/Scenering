/**
 * Caption style library — a catalogue of complete looks with their own
 * typefaces, from formal and classical through metallic chrome to artsy and
 * fun.
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

export type CaptionStyleCategory =
  | "Classical"
  | "Formal"
  | "Modern"
  | "Metallic"
  | "Artsy"
  | "Strange"
  | "Fun";

/**
 * Metallic finishes — a chrome fill instead of a flat colour.
 *
 * A metal letter is not one colour: it is a vertical ramp from a bright top
 * bevel, through the body colour, to a dark underside, with a specular band
 * where the surface turns over and a bounce-light edge at the very bottom.
 * That ramp is the whole trick, and it is why `textColor` alone could never
 * produce gold — a single hex is a flat sticker, not a surface.
 *
 * The stops are positions down the cap height (0 = top of the capital,
 * 1 = bottom of the descender area), so the ramp lands in the same place on
 * every font size and every frame resolution.
 */
export type MetalFinish = "none" | "gold" | "silver";

export interface MetalFinishDef {
  id: Exclude<MetalFinish, "none">;
  label: string;
  /** Vertical gradient down the glyph: the body of the metal. */
  stops: { at: number; color: string }[];
  /** Dark edge that gives the bevel something to end against. */
  edge: string;
  /** Colour of the active (karaoke) word, kept in the same metal family. */
  highlight: string;
  /** A swatch for the studio UI. */
  swatch: string;
}

export const METAL_FINISHES: MetalFinishDef[] = [
  {
    id: "gold",
    label: "Gold chrome",
    stops: [
      { at: 0.0, color: "#FFFBE6" },
      { at: 0.14, color: "#F8E3A1" },
      { at: 0.34, color: "#E4AE3A" },
      { at: 0.47, color: "#A9741A" },
      { at: 0.52, color: "#FFF6CF" },
      { at: 0.62, color: "#D9A433" },
      { at: 0.82, color: "#8A5E0D" },
      { at: 0.95, color: "#F3D27A" },
      { at: 1.0, color: "#C8992F" },
    ],
    edge: "#3E2A05",
    highlight: "#FFF4C2",
    swatch: "linear-gradient(180deg,#FFFBE6,#E4AE3A 40%,#8A5E0D 82%,#F3D27A)",
  },
  {
    id: "silver",
    label: "Silver chrome",
    stops: [
      { at: 0.0, color: "#FFFFFF" },
      { at: 0.14, color: "#E8EDF3" },
      { at: 0.34, color: "#A7B1BF" },
      { at: 0.47, color: "#69737F" },
      { at: 0.52, color: "#FFFFFF" },
      { at: 0.62, color: "#B9C2CD" },
      { at: 0.82, color: "#5A6472" },
      { at: 0.95, color: "#E2E7ED" },
      { at: 1.0, color: "#939DAA" },
    ],
    edge: "#20252C",
    highlight: "#FFFFFF",
    swatch: "linear-gradient(180deg,#FFFFFF,#A7B1BF 40%,#5A6472 82%,#E2E7ED)",
  },
];

export function getMetalFinish(id?: MetalFinish | string): MetalFinishDef | null {
  if (!id || id === "none") return null;
  return METAL_FINISHES.find((m) => m.id === id) || null;
}

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
  /** Chrome fill. Absent or "none" means the flat `textColor` is used. */
  metal?: MetalFinish;
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

  // --- Second wave. Appended, never inserted: getCaptionFont() falls back to
  // CAPTION_FONTS[3] (Inter) and reordering would silently change the default
  // typeface of every project that never picked one.
  { id: "playfair", family: "Playfair Display", fallback: "Georgia, 'Times New Roman', serif", weight: 700, weights: [400, 700, 900], label: "Playfair Display · high-contrast editorial serif" },
  { id: "libre_baskerville", family: "Libre Baskerville", fallback: "Georgia, 'Times New Roman', serif", weight: 700, label: "Libre Baskerville · classic book text" },
  { id: "great_vibes", family: "Great Vibes", fallback: "'Segoe Script', 'Brush Script MT', cursive", weight: 400, label: "Great Vibes · formal calligraphy" },
  { id: "oswald", family: "Oswald", fallback: "'Arial Narrow', 'Helvetica Neue', sans-serif", weight: 600, weights: [400, 600, 700], label: "Oswald · condensed news sans" },
  { id: "montserrat", family: "Montserrat", fallback: "'Helvetica Neue', Arial, sans-serif", weight: 800, weights: [500, 700, 800, 900], label: "Montserrat · geometric modern sans" },
  { id: "bebas", family: "Bebas Neue", fallback: "Impact, 'Arial Narrow', sans-serif", weight: 400, label: "Bebas Neue · tall poster capitals" },
  { id: "archivo_black", family: "Archivo Black", fallback: "'Arial Black', Impact, sans-serif", weight: 400, label: "Archivo Black · ultra-bold grotesque" },
  { id: "orbitron", family: "Orbitron", fallback: "'Courier New', 'Lucida Console', monospace", weight: 700, weights: [500, 700, 900], label: "Orbitron · sci-fi techno" },
  { id: "righteous", family: "Righteous", fallback: "'Trebuchet MS', Verdana, sans-serif", weight: 400, label: "Righteous · art-deco display" },
  { id: "lobster", family: "Lobster", fallback: "'Brush Script MT', 'Segoe Script', cursive", weight: 400, label: "Lobster · retro sign script" },
  { id: "pacifico", family: "Pacifico", fallback: "'Segoe Script', 'Brush Script MT', cursive", weight: 400, label: "Pacifico · surf-shop script" },
  { id: "special_elite", family: "Special Elite", fallback: "'Courier New', Courier, monospace", weight: 400, label: "Special Elite · struck typewriter" },
  { id: "press_start", family: "Press Start 2P", fallback: "'Courier New', monospace", weight: 400, label: "Press Start 2P · pixel arcade" },
  { id: "fredoka", family: "Fredoka", fallback: "'Trebuchet MS', Verdana, system-ui, sans-serif", weight: 600, weights: [500, 600, 700], label: "Fredoka · chunky rounded" },

  // --- Third wave: the strange shelf. Decorative display faces that look
  // like nothing else — melted, burned, pixelated, hatched, blackletter,
  // graffiti. These are why the Strange category exists.
  { id: "rubik_glitch", family: "Rubik Glitch", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Glitch · corrupted broadcast signal" },
  { id: "rubik_wet_paint", family: "Rubik Wet Paint", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Wet Paint · dripping wet paint" },
  { id: "rubik_puddles", family: "Rubik Puddles", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Puddles · melted into puddles" },
  { id: "rubik_moonrocks", family: "Rubik Moonrocks", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Moonrocks · bubbled moon rock" },
  { id: "rubik_burned", family: "Rubik Burned", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Burned · scorched and charred" },
  { id: "rubik_beastly", family: "Rubik Beastly", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Beastly · furry creature" },
  { id: "rubik_iso", family: "Rubik Iso", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Iso · isometric 3D blocks" },
  { id: "rubik_maze", family: "Rubik Maze", fallback: "'Courier New', monospace", weight: 400, label: "Rubik Maze · circuit-board maze" },
  { id: "rubik_distressed", family: "Rubik Distressed", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Rubik Distressed · worn-through stencil" },
  { id: "bungee_shade", family: "Bungee Shade", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Bungee Shade · layered drop-shadow block" },
  { id: "bungee_inline", family: "Bungee Inline", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Bungee Inline · inline sign painting" },
  { id: "creepster", family: "Creepster", fallback: "Impact, fantasy, sans-serif", weight: 400, label: "Creepster · horror matinee" },
  { id: "nosifer", family: "Nosifer", fallback: "Impact, fantasy, sans-serif", weight: 400, label: "Nosifer · dripping blood" },
  { id: "metal_mania", family: "Metal Mania", fallback: "Impact, fantasy, serif", weight: 400, label: "Metal Mania · heavy metal band" },
  { id: "unifraktur", family: "UnifrakturMaguntia", fallback: "'Old English Text MT', Garamond, serif", weight: 400, label: "UnifrakturMaguntia · medieval blackletter" },
  { id: "faster_one", family: "Faster One", fallback: "Impact, 'Arial Black', sans-serif", weight: 400, label: "Faster One · speed-blurred racing" },
  { id: "megrim", family: "Megrim", fallback: "'Century Gothic', 'Trebuchet MS', sans-serif", weight: 400, label: "Megrim · thin geometric line art" },
  { id: "codystar", family: "Codystar", fallback: "'Courier New', monospace", weight: 400, weights: [300, 400], label: "Codystar · dotted bulb marquee" },
  { id: "wallpoet", family: "Wallpoet", fallback: "'Arial Narrow', Impact, sans-serif", weight: 400, label: "Wallpoet · cut spray stencil" },
  { id: "silkscreen", family: "Silkscreen", fallback: "'Courier New', monospace", weight: 400, weights: [400, 700], label: "Silkscreen · hard-edged pixel screen" },
  { id: "vt323", family: "VT323", fallback: "'Courier New', 'Lucida Console', monospace", weight: 400, label: "VT323 · glowing computer terminal" },
  { id: "major_mono", family: "Major Mono Display", fallback: "'Courier New', monospace", weight: 400, label: "Major Mono Display · monospace art" },
  { id: "londrina_sketch", family: "Londrina Sketch", fallback: "'Comic Sans MS', 'Segoe Print', cursive", weight: 400, label: "Londrina Sketch · loose pencil sketch" },
  { id: "sedgwick_ave", family: "Sedgwick Ave Display", fallback: "'Segoe Script', 'Brush Script MT', cursive", weight: 400, label: "Sedgwick Ave Display · graffiti tag" },
  { id: "rock_salt", family: "Rock Salt", fallback: "'Segoe Print', 'Bradley Hand', cursive", weight: 400, label: "Rock Salt · rough inked hand" },
  { id: "amatic", family: "Amatic SC", fallback: "'Arial Narrow', 'Segoe Print', sans-serif", weight: 700, weights: [400, 700], label: "Amatic SC · tall thin hand" },
  { id: "shrikhand", family: "Shrikhand", fallback: "Impact, 'Arial Black', fantasy", weight: 400, label: "Shrikhand · festival poster" },
  { id: "modak", family: "Modak", fallback: "Impact, 'Arial Black', fantasy", weight: 400, label: "Modak · blobby balloon letters" },
  { id: "titan_one", family: "Titan One", fallback: "'Arial Black', Impact, fantasy", weight: 400, label: "Titan One · fat cartoon" },
  { id: "rampart_one", family: "Rampart One", fallback: "'Arial Black', Impact, fantasy", weight: 400, label: "Rampart One · soft 3D relief" },
  { id: "rye", family: "Rye", fallback: "'Rockwell', Georgia, serif", weight: 400, label: "Rye · wild-west slab" },
  { id: "jolly_lodger", family: "Jolly Lodger", fallback: "Impact, fantasy, sans-serif", weight: 400, label: "Jolly Lodger · skeletal carnival" },
  { id: "lacquer", family: "Lacquer", fallback: "Impact, 'Arial Black', fantasy", weight: 400, label: "Lacquer · grunge spray stencil" },
  { id: "audiowide", family: "Audiowide", fallback: "'Trebuchet MS', 'Arial Black', sans-serif", weight: 400, label: "Audiowide · wide techno" },
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

  /* ------------------------------------------------------------------ *
   * METALLIC — a chrome surface, not a yellow or grey letter.
   *
   * The ramp does the work (see METAL_FINISHES). These two keep a dark
   * outline and a strong shadow on purpose: metal only reads as metal when
   * it has an edge to catch and something to sit against. Both use a heavy
   * face, because a hairline serif in chrome just looks like dirty text.
   * ------------------------------------------------------------------ */
  {
    id: "gold_chrome",
    name: "Gold Chrome",
    category: "Metallic",
    fontId: "archivo_black",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#E4AE3A",
    highlightColor: "#FFF4C2",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 2.2,
    borderColor: "#3E2A05",
    shadowStrength: 0.78,
    shadowOffset: 5,
    shadowBlur: 14,
    metal: "gold",
    description: "Polished gold with a bright bevel and a dark edge — awards, luxury and big reveals.",
  },
  {
    id: "silver_chrome",
    name: "Silver Chrome",
    category: "Metallic",
    fontId: "archivo_black",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#C3CBD6",
    highlightColor: "#FFFFFF",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 2.2,
    borderColor: "#20252C",
    shadowStrength: 0.78,
    shadowOffset: 5,
    shadowBlur: 14,
    metal: "silver",
    description: "Brushed silver chrome with a mirror band — tech, sport and trailer titles.",
  },
  {
    id: "gold_engraved",
    name: "Engraved Gold",
    category: "Metallic",
    fontId: "cinzel",
    letterSpacing: 0.08,
    uppercase: true,
    textColor: "#E4AE3A",
    highlightColor: "#FFFBE6",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#2A1C04",
    shadowStrength: 0.68,
    shadowOffset: 4,
    shadowBlur: 12,
    metal: "gold",
    description: "Roman capitals struck in gold — history, scripture and ceremonial titles.",
  },
  {
    id: "silver_titanium",
    name: "Titanium Edge",
    category: "Metallic",
    fontId: "orbitron",
    letterSpacing: 0.07,
    uppercase: true,
    textColor: "#C3CBD6",
    highlightColor: "#9FE8FF",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.8,
    borderColor: "#121821",
    shadowStrength: 0.75,
    shadowOffset: 4,
    shadowBlur: 16,
    metal: "silver",
    description: "Machined chrome on a techno face — product launches, gaming and sci-fi.",
  },

  /* ------------------------------- CLASSICAL & FORMAL, second wave ---- */
  {
    id: "editorial_serif",
    name: "Editorial Headline",
    category: "Formal",
    fontId: "playfair",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#F0B429",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#0A0A0A",
    shadowStrength: 0.6,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "High-contrast magazine serif — interviews, essays and long-form features.",
  },
  {
    id: "quiet_book",
    name: "Quiet Book",
    category: "Classical",
    fontId: "libre_baskerville",
    letterSpacing: 0.005,
    uppercase: false,
    textColor: "#F5F1E8",
    highlightColor: "#C9A227",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1,
    borderColor: "#131313",
    shadowStrength: 0.55,
    shadowOffset: 3,
    shadowBlur: 10,
    description: "Plain book text that never shouts — audiobooks, poetry and narration.",
  },
  {
    id: "royal_script",
    name: "Royal Script",
    category: "Formal",
    fontId: "great_vibes",
    letterSpacing: 0.02,
    uppercase: false,
    textColor: "#FFF8E7",
    highlightColor: "#E8C87A",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#1A1206",
    shadowStrength: 0.66,
    shadowOffset: 4,
    shadowBlur: 13,
    description: "Formal calligraphy with long flourishes — weddings, invitations and toasts.",
  },

  /* ----------------------------------------- MODERN, second wave ------ */
  {
    id: "condensed_news",
    name: "Condensed Report",
    category: "Modern",
    fontId: "oswald",
    letterSpacing: 0.015,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FF4D4D",
    background: "blocked",
    bgColor: "rgba(10, 10, 12, 0.76)",
    borderWidth: 1,
    borderColor: "#000000",
    shadowStrength: 0.55,
    shadowOffset: 4,
    shadowBlur: 11,
    description: "Narrow news capitals on a dark bar — headlines, sport and live reporting.",
  },
  {
    id: "geometric_bold",
    name: "Geometric Bold",
    category: "Modern",
    fontId: "montserrat",
    letterSpacing: 0.01,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#22D3EE",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#05070C",
    shadowStrength: 0.62,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Clean geometric sans with real weight — brand films and product explainers.",
  },
  {
    id: "tall_caps",
    name: "Tall Caps",
    category: "Modern",
    fontId: "bebas",
    letterSpacing: 0.05,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FACC15",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.8,
    borderColor: "#000000",
    shadowStrength: 0.7,
    shadowOffset: 5,
    shadowBlur: 13,
    description: "Tall narrow capitals that fit long lines — trailers, teasers and countdowns.",
  },
  {
    id: "techno_grid",
    name: "Techno Grid",
    category: "Modern",
    fontId: "orbitron",
    letterSpacing: 0.08,
    uppercase: true,
    textColor: "#D8F6FF",
    highlightColor: "#22D3EE",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#061018",
    shadowStrength: 0.78,
    shadowOffset: 3,
    shadowBlur: 18,
    description: "Wide techno lettering with a cold glow — AI, data and future-facing topics.",
  },

  /* -------------------------------------------- ARTSY, second wave ---- */
  {
    id: "deco_glow",
    name: "Deco Glow",
    category: "Artsy",
    fontId: "righteous",
    letterSpacing: 0.04,
    uppercase: true,
    textColor: "#FFE8C2",
    highlightColor: "#FF8A3D",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#16100A",
    shadowStrength: 0.72,
    shadowOffset: 4,
    shadowBlur: 16,
    description: "Art-deco display with a warm glow — cocktail, jazz and vintage pieces.",
  },
  {
    id: "sign_painter",
    name: "Sign Painter",
    category: "Artsy",
    fontId: "lobster",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFF4E3",
    highlightColor: "#F43F5E",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#17110C",
    shadowStrength: 0.66,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Retro painted shopfront script — food, markets and local business films.",
  },
  {
    id: "surf_script",
    name: "Surf Script",
    category: "Artsy",
    fontId: "pacifico",
    letterSpacing: 0.005,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#2DD4BF",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#0A1A1C",
    shadowStrength: 0.6,
    shadowOffset: 4,
    shadowBlur: 11,
    description: "Loose beach-sign script — travel, summer and feel-good montages.",
  },
  {
    id: "typewriter_note",
    name: "Typewriter Note",
    category: "Artsy",
    fontId: "special_elite",
    letterSpacing: 0.02,
    uppercase: false,
    textColor: "#F2EADF",
    highlightColor: "#E0A82E",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1,
    borderColor: "#120F0B",
    shadowStrength: 0.5,
    shadowOffset: 3,
    shadowBlur: 9,
    description: "Struck typewriter keys, slightly worn — true crime, archive and dossier looks.",
  },

  /* ---------------------------------------------- FUN, second wave ---- */
  {
    id: "arcade_pixel",
    name: "Arcade Pixel",
    category: "Fun",
    fontId: "press_start",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#A3E635",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 2,
    borderColor: "#000000",
    shadowStrength: 0.65,
    shadowOffset: 4,
    shadowBlur: 8,
    description: "8-bit arcade type — gaming clips, scores and retro challenges.",
  },
  {
    id: "chunky_round",
    name: "Chunky Round",
    category: "Fun",
    fontId: "fredoka",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#FB7185",
    background: "blocked",
    bgColor: "rgba(24, 16, 40, 0.70)",
    borderWidth: 1.4,
    borderColor: "#120A20",
    shadowStrength: 0.58,
    shadowOffset: 4,
    shadowBlur: 11,
    description: "Fat rounded letters on a soft pill — kids, crafts and cheerful explainers.",
  },

  /* ------------------------------------------------------------------ *
   * STRANGE — the artistic shelf.
   *
   * Faces that look like nothing else: melted, burned, pixelated,
   * hatched, bled, sprayed and blackletter. Most of them carry little or
   * NO outline on purpose — an outline fills in the gaps that make a
   * maze, a bulb marquee or a sketch readable as what it is, and turns
   * the face back into a generic blob. They lean on the drop shadow
   * instead, which is why the border-0 shadow fix matters here.
   * ------------------------------------------------------------------ */
  {
    id: "glitch_signal",
    name: "Glitch Signal",
    category: "Strange",
    fontId: "rubik_glitch",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#E8FBFF",
    highlightColor: "#FF3BD4",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#06121A",
    shadowStrength: 0.8,
    shadowOffset: 4,
    shadowBlur: 16,
    description: "Corrupted broadcast type that tears as you read it — tech horror, hacking and error screens.",
  },
  {
    id: "wet_paint",
    name: "Wet Paint",
    category: "Strange",
    fontId: "rubik_wet_paint",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FF6B35",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#000000",
    shadowStrength: 0.75,
    shadowOffset: 5,
    shadowBlur: 14,
    description: "Letters still running down the wall — street art, music videos and anything loud.",
  },
  {
    id: "melted",
    name: "Melted",
    category: "Strange",
    fontId: "rubik_puddles",
    letterSpacing: 0.02,
    uppercase: false,
    textColor: "#F7F3FF",
    highlightColor: "#C084FC",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#1A1026",
    shadowStrength: 0.72,
    shadowOffset: 5,
    shadowBlur: 15,
    description: "Type collapsing into puddles — surreal, dream sequences and summer-heat footage.",
  },
  {
    id: "moonrock",
    name: "Moonrock",
    category: "Strange",
    fontId: "rubik_moonrocks",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#E9F0FF",
    highlightColor: "#7DD3FC",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#070B16",
    shadowStrength: 0.8,
    shadowOffset: 4,
    shadowBlur: 18,
    description: "Bubbled, cratered lettering — space, science and anything otherworldly.",
  },
  {
    id: "scorched",
    name: "Scorched",
    category: "Strange",
    fontId: "rubik_burned",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFE6C7",
    highlightColor: "#FF7A1A",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#1A0C04",
    shadowStrength: 0.82,
    shadowOffset: 4,
    shadowBlur: 16,
    description: "Charred and burned at the edges — disaster, survival and hard-news openers.",
  },
  {
    id: "beastly",
    name: "Beastly",
    category: "Strange",
    fontId: "rubik_beastly",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFF3D6",
    highlightColor: "#F97316",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#140A02",
    shadowStrength: 0.75,
    shadowOffset: 4,
    shadowBlur: 14,
    description: "Shaggy, furred letterforms — wildlife, monsters and children's adventure.",
  },
  {
    id: "isometric_block",
    name: "Isometric Block",
    category: "Strange",
    fontId: "rubik_iso",
    letterSpacing: 0.04,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FDE047",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#0A0A12",
    shadowStrength: 0.7,
    shadowOffset: 4,
    shadowBlur: 13,
    description: "Letters built as 3D blocks on a grid — architecture, gaming and explainers.",
  },
  {
    id: "circuit_maze",
    name: "Circuit Maze",
    category: "Strange",
    fontId: "rubik_maze",
    letterSpacing: 0.05,
    uppercase: true,
    textColor: "#B8FFD9",
    highlightColor: "#22D3EE",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#01140C",
    shadowStrength: 0.85,
    shadowOffset: 3,
    shadowBlur: 18,
    description: "Type drawn as a circuit maze — puzzles, data and systems.",
  },
  {
    id: "worn_stencil",
    name: "Worn Stencil",
    category: "Strange",
    fontId: "rubik_distressed",
    letterSpacing: 0.04,
    uppercase: true,
    textColor: "#F3EFE6",
    highlightColor: "#EF4444",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#120F0A",
    shadowStrength: 0.7,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "A stencil that has been painted over too many times — military, industrial and punk.",
  },
  {
    id: "shadow_block",
    name: "Shadow Block",
    category: "Strange",
    fontId: "bungee_shade",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FACC15",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#000000",
    shadowStrength: 0.6,
    shadowOffset: 4,
    shadowBlur: 10,
    description: "A block face carrying its own hard 3D shadow — posters, titles and announcements.",
  },
  {
    id: "inline_sign",
    name: "Inline Sign",
    category: "Strange",
    fontId: "bungee_inline",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#FFF8E7",
    highlightColor: "#FB7185",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#140C06",
    shadowStrength: 0.68,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Sign-painted letters with an inline cut through them — markets, diners and shopfronts.",
  },
  {
    id: "creep_show",
    name: "Creep Show",
    category: "Strange",
    fontId: "creepster",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#E8FFD6",
    highlightColor: "#84CC16",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#0A1203",
    shadowStrength: 0.8,
    shadowOffset: 5,
    shadowBlur: 15,
    description: "Melting horror-matinee lettering — Halloween, spooky stories and B-movie homages.",
  },
  {
    id: "blood_drip",
    name: "Blood Drip",
    category: "Strange",
    fontId: "nosifer",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFE9E9",
    highlightColor: "#DC2626",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#1A0404",
    shadowStrength: 0.85,
    shadowOffset: 5,
    shadowBlur: 16,
    description: "Letters bleeding down the frame — horror, true crime and shock openers.",
  },
  {
    id: "metal_band",
    name: "Metal Band",
    category: "Strange",
    fontId: "metal_mania",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#F1F5F9",
    highlightColor: "#F43F5E",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#0A0A0C",
    shadowStrength: 0.8,
    shadowOffset: 5,
    shadowBlur: 15,
    description: "Spiked heavy-metal lettering — music, gaming and anything with a guitar in it.",
  },
  {
    id: "old_gothic",
    name: "Old Gothic",
    category: "Strange",
    fontId: "unifraktur",
    letterSpacing: 0.02,
    uppercase: false,
    textColor: "#F5ECD7",
    highlightColor: "#C9A227",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#120D04",
    shadowStrength: 0.72,
    shadowOffset: 4,
    shadowBlur: 13,
    description: "Medieval blackletter — history, folklore, breweries and heraldry.",
  },
  {
    id: "full_speed",
    name: "Full Speed",
    category: "Strange",
    fontId: "faster_one",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#38BDF8",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#020814",
    shadowStrength: 0.78,
    shadowOffset: 4,
    shadowBlur: 16,
    description: "Letters smeared by their own speed — motorsport, deadlines and launch countdowns.",
  },
  {
    id: "line_art",
    name: "Line Art",
    category: "Strange",
    fontId: "megrim",
    letterSpacing: 0.09,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#A78BFA",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#0A0A14",
    shadowStrength: 0.8,
    shadowOffset: 3,
    shadowBlur: 14,
    description: "Hairline geometric construction lines — design, architecture and minimal essays.",
  },
  {
    id: "bulb_marquee",
    name: "Bulb Marquee",
    category: "Strange",
    fontId: "codystar",
    letterSpacing: 0.06,
    uppercase: true,
    textColor: "#FFF6D8",
    highlightColor: "#FB7185",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#120A14",
    shadowStrength: 0.9,
    shadowOffset: 3,
    shadowBlur: 20,
    description: "Letters made of theatre bulbs — cabaret, cinema and showtime intros.",
  },
  {
    id: "spray_stencil",
    name: "Spray Stencil",
    category: "Strange",
    fontId: "wallpoet",
    letterSpacing: 0.05,
    uppercase: true,
    textColor: "#F4F4F5",
    highlightColor: "#FACC15",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#09090B",
    shadowStrength: 0.72,
    shadowOffset: 4,
    shadowBlur: 13,
    description: "A cut stencil sprayed onto concrete — urban, protest and documentary.",
  },
  {
    id: "pixel_screen",
    name: "Pixel Screen",
    category: "Strange",
    fontId: "silkscreen",
    letterSpacing: 0.04,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#A3E635",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#000000",
    shadowStrength: 0.6,
    shadowOffset: 4,
    shadowBlur: 8,
    description: "Hard pixels with no smoothing at all — retro computing, games and glitch art.",
  },
  {
    id: "green_terminal",
    name: "Green Terminal",
    category: "Strange",
    fontId: "vt323",
    letterSpacing: 0.03,
    uppercase: false,
    textColor: "#8CFF9E",
    highlightColor: "#00FF66",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#001A08",
    shadowStrength: 0.9,
    shadowOffset: 2,
    shadowBlur: 18,
    description: "A glowing CRT terminal — hacking, sci-fi and anything with a command line.",
  },
  {
    id: "mono_art",
    name: "Mono Art",
    category: "Strange",
    fontId: "major_mono",
    letterSpacing: 0.08,
    uppercase: false,
    textColor: "#E7E5E4",
    highlightColor: "#F472B6",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#0C0A09",
    shadowStrength: 0.7,
    shadowOffset: 3,
    shadowBlur: 12,
    description: "Monospace shapes used as drawing — art direction, credits and experimental pieces.",
  },
  {
    id: "pencil_sketch",
    name: "Pencil Sketch",
    category: "Strange",
    fontId: "londrina_sketch",
    letterSpacing: 0.02,
    uppercase: false,
    textColor: "#FFFDF7",
    highlightColor: "#F59E0B",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#141210",
    shadowStrength: 0.65,
    shadowOffset: 4,
    shadowBlur: 11,
    description: "Loose sketched outlines — ideas, drafts, teaching and process films.",
  },
  {
    id: "graffiti_tag",
    name: "Graffiti Tag",
    category: "Strange",
    fontId: "sedgwick_ave",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#22D3EE",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#0A0A14",
    shadowStrength: 0.75,
    shadowOffset: 5,
    shadowBlur: 14,
    description: "A marker tag straight off a wall — hip-hop, skate and street culture.",
  },
  {
    id: "rough_hand",
    name: "Rough Hand",
    category: "Strange",
    fontId: "rock_salt",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFF8F0",
    highlightColor: "#F97316",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#120D08",
    shadowStrength: 0.7,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Rough inked handwriting with real texture — journals, letters and personal stories.",
  },
  {
    id: "tall_thin_hand",
    name: "Tall Thin Hand",
    category: "Strange",
    fontId: "amatic",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#34D399",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1,
    borderColor: "#0A1410",
    shadowStrength: 0.62,
    shadowOffset: 4,
    shadowBlur: 11,
    description: "Tall, narrow, hand-drawn capitals — recipes, markets and friendly explainers.",
  },
  {
    id: "festival_poster",
    name: "Festival Poster",
    category: "Strange",
    fontId: "shrikhand",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFF3E0",
    highlightColor: "#F43F5E",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.8,
    borderColor: "#1A0A12",
    shadowStrength: 0.75,
    shadowOffset: 5,
    shadowBlur: 14,
    description: "A fat festival poster face — music, food, culture and celebration.",
  },
  {
    id: "blobby",
    name: "Blobby",
    category: "Strange",
    fontId: "modak",
    letterSpacing: 0.01,
    uppercase: false,
    textColor: "#FFFFFF",
    highlightColor: "#FB923C",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.6,
    borderColor: "#1A0E06",
    shadowStrength: 0.68,
    shadowOffset: 4,
    shadowBlur: 12,
    description: "Balloon letters squeezed together — kids, comedy and birthday videos.",
  },
  {
    id: "cartoon_fat",
    name: "Cartoon Fat",
    category: "Strange",
    fontId: "titan_one",
    letterSpacing: 0.01,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#FDE047",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 2,
    borderColor: "#0B0B0F",
    shadowStrength: 0.7,
    shadowOffset: 5,
    shadowBlur: 12,
    description: "Thick cartoon lettering that reads at any size — shorts, memes and reactions.",
  },
  {
    id: "soft_relief",
    name: "Soft Relief",
    category: "Strange",
    fontId: "rampart_one",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#C4B5FD",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#120F1C",
    shadowStrength: 0.7,
    shadowOffset: 4,
    shadowBlur: 13,
    description: "Soft moulded letters standing off the frame — craft, toys and gentle promos.",
  },
  {
    id: "wild_west",
    name: "Wild West",
    category: "Strange",
    fontId: "rye",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#FFF0D4",
    highlightColor: "#B45309",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#17100A",
    shadowStrength: 0.72,
    shadowOffset: 4,
    shadowBlur: 13,
    description: "Saloon-poster slab serif — westerns, whiskey and tall tales.",
  },
  {
    id: "skeleton_key",
    name: "Skeleton Key",
    category: "Strange",
    fontId: "jolly_lodger",
    letterSpacing: 0.03,
    uppercase: true,
    textColor: "#F5F5F4",
    highlightColor: "#A855F7",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.2,
    borderColor: "#0C0A12",
    shadowStrength: 0.78,
    shadowOffset: 4,
    shadowBlur: 14,
    description: "Bony carnival lettering — Halloween, pantomime and dark comedy.",
  },
  {
    id: "grunge_spray",
    name: "Grunge Spray",
    category: "Strange",
    fontId: "lacquer",
    letterSpacing: 0.02,
    uppercase: true,
    textColor: "#FFFFFF",
    highlightColor: "#F43F5E",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    borderColor: "#0A0A0A",
    shadowStrength: 0.78,
    shadowOffset: 4,
    shadowBlur: 15,
    description: "Spray-can grunge with ragged edges — punk, skate and underground music.",
  },
  {
    id: "audio_wide",
    name: "Audio Wide",
    category: "Strange",
    fontId: "audiowide",
    letterSpacing: 0.06,
    uppercase: true,
    textColor: "#E0F2FE",
    highlightColor: "#38BDF8",
    background: "transparent",
    bgColor: "rgba(0, 0, 0, 0)",
    borderWidth: 1.4,
    borderColor: "#020B16",
    shadowStrength: 0.8,
    shadowOffset: 4,
    shadowBlur: 16,
    description: "Wide techno letterforms — audio, electronics and product reveals.",
  },
];

/** Load order for the studio: grouped catalogue */
export const CAPTION_STYLE_ORDER: CaptionStyleCategory[] = [
  "Classical",
  "Formal",
  "Modern",
  "Metallic",
  "Artsy",
  "Strange",
  "Fun",
];

/** The styles in one category, in library order. */
export function captionStylesInCategory(category: CaptionStyleCategory): CaptionStyleDef[] {
  return CAPTION_STYLES.filter((s) => s.category === category);
}

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

/**
 * Google Fonts stylesheet URLs, built from CAPTION_FONTS itself.
 *
 * Derived rather than hand-written, because the hand-written list is exactly
 * what went wrong: faces were added to the library and forgotten in the URL,
 * so they silently fell back to Georgia or Arial and a dozen "different"
 * styles all looked the same. If a face is in the library it is now, by
 * construction, in the request.
 *
 * Split across several links because one URL naming nearly sixty families is
 * long enough to be refused by proxies, and a single refused request would
 * take every typeface down with it.
 */
const FAMILIES_PER_REQUEST = 12;

export function googleFontsHrefs(): string[] {
  const specs = CAPTION_FONTS.map((f) => {
    const name = f.family.replace(/ /g, "+");
    const weights = Array.from(new Set([f.weight, ...(f.weights || [])])).sort((a, b) => a - b);
    // The axis is named whenever a style wants something other than regular,
    // because Google Fonts serves ONLY the weights you ask for: a request
    // with no axis returns 400 alone, and a style declaring weight 700 then
    // gets a faux-bold smear of the regular face instead of the real one.
    //
    // Single-weight display faces (almost all of the strange shelf) are
    // asked for with no axis at all, since requesting a weight a font does
    // not have is an error that would take the whole batch down with it.
    const needsAxis = weights.length > 1 || weights[0] !== 400;
    return needsAxis ? `family=${name}:wght@${weights.join(";")}` : `family=${name}`;
  });

  const hrefs: string[] = [];
  for (let i = 0; i < specs.length; i += FAMILIES_PER_REQUEST) {
    hrefs.push(
      "https://fonts.googleapis.com/css2?" +
        specs.slice(i, i + FAMILIES_PER_REQUEST).join("&") +
        "&display=swap"
    );
  }
  return hrefs;
}

let fontsPromise: Promise<void> | null = null;
const faceLoads = new Map<string, Promise<void>>();

/**
 * Inject the caption font stylesheets.
 *
 * This only brings in the CSS. It deliberately does NOT download all
 * fifty-odd faces: @font-face is lazy, so the browser fetches a face when
 * something on the page uses it, which is what you want for a catalogue of
 * style cards. Canvas is the exception — it never triggers a font load — so
 * anything drawing captions must also call `ensureCaptionFont` for the face
 * it is about to draw with.
 *
 * Safe to call repeatedly; resolves immediately when there is no DOM
 * (SSR/tests) so nothing blocks.
 */
export function loadCaptionFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontsPromise) return fontsPromise;

  fontsPromise = (async () => {
    try {
      // A distinct marker from the <link data-caption-fonts> in index.html.
      // Sharing that attribute meant this block saw the hand-written link
      // already in the page, decided its work was done, and never requested
      // any of the faces that link does not list.
      if (!document.querySelector("link[data-caption-fonts-full]")) {
        for (const href of googleFontsHrefs()) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.setAttribute("data-caption-fonts-full", "true");
          document.head.appendChild(link);
        }
      }
    } catch {
      // network blocked — the fallback stacks keep the captions readable
    }
  })();

  return fontsPromise;
}

/**
 * Make one typeface available to a canvas, and report whether it arrived.
 *
 * Returns false when the face could not be loaded (offline, blocked, a bad
 * family name) so the caller can say so instead of quietly drawing in
 * Georgia and leaving the user to wonder why every style looks alike.
 */
export async function ensureCaptionFont(fontId?: string): Promise<boolean> {
  if (typeof document === "undefined") return true;
  const font = getCaptionFont(fontId);
  await loadCaptionFonts();
  const fontSet = (document as any).fonts as FontFaceSet | undefined;
  if (!fontSet?.load) return true;

  const key = font.id;
  if (!faceLoads.has(key)) {
    const weights = Array.from(new Set([font.weight, ...(font.weights || [])]));
    faceLoads.set(
      key,
      Promise.all(
        weights.map((wt) => fontSet.load(`${wt} 32px "${font.family}"`).catch(() => null))
      ).then(() => undefined)
    );
  }
  try {
    await faceLoads.get(key);
  } catch {
    return false;
  }
  return captionFontAvailable(fontId);
}

/**
 * Is this face actually usable right now, or is the fallback stack drawing?
 *
 * `document.fonts.check` answers for the real family name only, so a true
 * here means the glyphs on screen are the ones the style promises.
 */
export function captionFontAvailable(fontId?: string): boolean {
  if (typeof document === "undefined") return true;
  const fontSet = (document as any).fonts as FontFaceSet | undefined;
  if (!fontSet?.check) return true;
  const font = getCaptionFont(fontId);
  try {
    // `check()` alone is not enough. Asked about a family it has never heard
    // of, it answers true — vacuously, because none of the zero matching
    // faces are unloaded. That is precisely the offline case this warning
    // exists for, so the face has to be found in the set first.
    let known = false;
    fontSet.forEach((face: FontFace) => {
      if (face.family.replace(/^["']|["']$/g, "") === font.family) known = true;
    });
    if (!known) return false;
    return fontSet.check(`${font.weight} 32px "${font.family}"`);
  } catch {
    return true;
  }
}
