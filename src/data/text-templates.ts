/**
 * Text Template Library
 * =====================
 * Every on-screen text card — scripture, quotes, lower thirds, facts and
 * lessons — is described here as data rather than as a hard-coded draw
 * function. A template declares its layout skeleton and its default look; the
 * renderer in src/lib/render-text-template.ts turns that into pixels.
 *
 * Doing it this way is what makes every template uniformly adjustable: the
 * background colour, background transparency, border (including removing it
 * entirely), text colour and transparency, font and slide-in motion are all
 * properties of the card rather than something baked into each design.
 */

/** Which studio section a template belongs to. */
export type TemplateSection = "scripture" | "quotes" | "lower_thirds" | "lessons" | "titles";

/** Layout skeletons the renderer knows how to draw. */
export type TemplateLayout =
  // scripture
  | "verse_classic"      // centred verse, reference header, translation footer
  | "verse_side_rule"    // left gold rule, reference stacked at the left
  | "verse_illuminated"  // large drop-cap opening letter, ornamental corners
  | "verse_banner"       // reference on a ribbon banner above the verse
  | "verse_minimal"      // no plate, just text with a hairline underline
  // quotes
  | "quote_editorial"    // big quotation mark, author rule beneath
  | "quote_centered"     // symmetrical marks either side, centred author
  | "quote_card_left"    // left accent bar, text ragged right
  | "quote_neon"         // glowing outline plate, uppercase author
  | "quote_typewriter"   // mono type on a paper plate
  // lower thirds
  | "lt_bar"             // classic two-line bar with accent strip
  | "lt_stacked"         // name on a solid block, role on a lighter block
  | "lt_pill"            // rounded pill with a leading dot
  | "lt_boxed"           // outlined box, name inside, role on the border
  | "lt_ribbon"          // angled ribbon tail
  | "lt_minimal_rule"    // no plate, just text over a thin rule
  // lessons
  | "lesson_takeaway"    // label header + body
  | "lesson_numbered"    // big number badge on the left
  | "lesson_fact"        // question header + explanation + source
  | "lesson_checklist"   // bulleted items
  | "lesson_stat"        // oversized figure with a caption
  // titles — the letters themselves are the artwork (see src/lib/text-art.ts)
  | "title_art"          // headline only
  | "title_art_sub"      // headline with a subtitle beneath
  | "title_art_kicker"   // small kicker label above the headline
  | "title_art_split";   // headline with rules either side

/** Entrance motion for a card. */
export type TemplateMotion =
  | "none"
  | "slide_left"    // in from the left edge
  | "slide_right"   // in from the right edge
  | "slide_up"      // up from below
  | "slide_down"    // down from above
  | "fade"
  | "pop"
  | "wipe_left"     // revealed by a left-to-right wipe
  | "typewriter";   // body text types on

export const TEMPLATE_MOTIONS: {
  id: TemplateMotion;
  name: string;
  icon: string;
  blurb: string;
}[] = [
  { id: "none", name: "None", icon: "⏸️", blurb: "Appears instantly" },
  { id: "slide_left", name: "Slide from Left", icon: "➡️", blurb: "Glides in from the left edge" },
  { id: "slide_right", name: "Slide from Right", icon: "⬅️", blurb: "Glides in from the right edge" },
  { id: "slide_up", name: "Slide Up", icon: "⬆️", blurb: "Rises up from below" },
  { id: "slide_down", name: "Slide Down", icon: "⬇️", blurb: "Drops down from above" },
  { id: "fade", name: "Fade", icon: "🌫️", blurb: "Soft cross-fade" },
  { id: "pop", name: "Pop", icon: "💥", blurb: "Overshooting scale pop" },
  { id: "wipe_left", name: "Wipe", icon: "🧹", blurb: "Revealed by a sweeping wipe" },
  { id: "typewriter", name: "Typewriter", icon: "⌨️", blurb: "Body text types on letter by letter" },
];

export const TEMPLATE_MOTIONS_BY_ID: Record<string, (typeof TEMPLATE_MOTIONS)[number]> =
  Object.fromEntries(TEMPLATE_MOTIONS.map((m) => [m.id, m]));

/** Corner treatment of the plate. */
export type PlateShape = "rounded" | "sharp" | "pill" | "cut_corner";

/** Where the border sits, if it is shown at all. */
export type BorderMode = "none" | "full" | "left" | "bottom" | "top" | "left_bottom";

/**
 * The complete adjustable look of a text card. Every field here is exposed in
 * the properties modal — this interface IS the settings panel.
 */
export interface TextTemplateStyle {
  /* ---- titles only: letter artwork (see src/lib/text-art.ts) ---- */
  /** partial TextArtStyle overrides for the headline letters */
  art?: Record<string, unknown>;

  /* ---- plate / background ---- */
  bgColor: string;
  /** 0 = fully transparent plate (text floats on the video), 1 = solid */
  bgOpacity: number;
  /** second colour for a gradient plate; null = flat fill */
  bgColor2: string | null;
  plateShape: PlateShape;
  cornerRadius: number;
  /** blur the video behind the plate (0-1) */
  backdropBlur: number;

  /* ---- border ---- */
  borderMode: BorderMode;
  borderColor: string;
  borderOpacity: number;
  borderWidth: number;

  /* ---- text ---- */
  /** font id from CAPTION_FONTS */
  fontId: string;
  titleColor: string;
  titleOpacity: number;
  bodyColor: string;
  bodyOpacity: number;
  accentColor: string;
  accentOpacity: number;
  /** multiplies every font size in the layout */
  textScale: number;
  lineSpacing: number;
  uppercaseLabel: boolean;
  textAlign: "left" | "center" | "right";

  /* ---- depth ---- */
  shadow: number;
  glow: number;

  /* ---- motion ---- */
  motion: TemplateMotion;
  motionDuration: number;
}

/**
 * Titles carry a second style object describing the LETTER artwork (material,
 * outline, bevel, extrusion). The plate/border/motion settings above still
 * apply exactly as they do for every other template, so a title can sit on a
 * plate, or on nothing at all.
 */
export interface TextTemplateDef {
  id: string;
  section: TemplateSection;
  layout: TemplateLayout;
  name: string;
  icon: string;
  blurb: string;
  defaultDuration: number;
  defaultPosition:
    | "top"
    | "bottom"
    | "center"
    | "left"
    | "right"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  /** starting content for the fields this layout uses */
  content: Record<string, string>;
  style: TextTemplateStyle;
  /** only for section "titles": the letter artwork preset id */
  artPreset?: string;
}

/** Sensible baseline every template starts from. */
const BASE: TextTemplateStyle = {
  bgColor: "#0B1220",
  bgOpacity: 0.88,
  bgColor2: null,
  plateShape: "rounded",
  cornerRadius: 16,
  backdropBlur: 0,
  borderMode: "full",
  borderColor: "#6366F1",
  borderOpacity: 0.8,
  borderWidth: 2,
  fontId: "inter",
  titleColor: "#FFFFFF",
  titleOpacity: 1,
  bodyColor: "#E6EDF7",
  bodyOpacity: 1,
  accentColor: "#6366F1",
  accentOpacity: 1,
  textScale: 1,
  lineSpacing: 1,
  uppercaseLabel: true,
  textAlign: "center",
  shadow: 0.55,
  glow: 0.25,
  motion: "fade",
  motionDuration: 0.6,
};

const s = (over: Partial<TextTemplateStyle>): TextTemplateStyle => ({ ...BASE, ...over });

export const TEXT_TEMPLATES: TextTemplateDef[] = [
  // ============================ SCRIPTURE ============================
  {
    id: "scripture_classic",
    section: "scripture",
    layout: "verse_classic",
    name: "Classic Verse Card",
    icon: "📖",
    blurb: "Centred verse on a deep plate with a gold reference header",
    defaultDuration: 7,
    defaultPosition: "center",
    content: {
      label: "HOLY SCRIPTURE",
      book: "John",
      chapter: "3",
      verse: "16",
      primaryText:
        "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
      secondaryText: "King James Version (KJV)",
    },
    style: s({
      bgColor: "#0A0F1C",
      bgOpacity: 0.9,
      borderColor: "#F0B429",
      accentColor: "#F0B429",
      bodyColor: "#FDF3D8",
      fontId: "eb_garamond",
      cornerRadius: 14,
      glow: 0.3,
      motion: "fade",
    }),
  },
  {
    id: "scripture_side_rule",
    section: "scripture",
    layout: "verse_side_rule",
    name: "Side Rule Verse",
    icon: "📜",
    blurb: "Left gold rule with the reference stacked beside the verse",
    defaultDuration: 7,
    defaultPosition: "center",
    content: {
      book: "Psalm",
      chapter: "23",
      verse: "1",
      primaryText: "The Lord is my shepherd; I shall not want.",
      secondaryText: "New King James Version",
    },
    style: s({
      bgColor: "#101418",
      bgOpacity: 0.72,
      borderMode: "left",
      borderColor: "#D4A643",
      borderWidth: 5,
      accentColor: "#D4A643",
      bodyColor: "#F5EEDC",
      fontId: "cormorant",
      textAlign: "left",
      cornerRadius: 8,
      motion: "slide_left",
    }),
  },
  {
    id: "scripture_illuminated",
    section: "scripture",
    layout: "verse_illuminated",
    name: "Illuminated Manuscript",
    icon: "✒️",
    blurb: "Drop-cap opening letter with ornamental corner flourishes",
    defaultDuration: 8,
    defaultPosition: "center",
    content: {
      book: "Isaiah",
      chapter: "40",
      verse: "31",
      primaryText:
        "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles.",
      secondaryText: "King James Version",
    },
    style: s({
      bgColor: "#14100A",
      bgColor2: "#2A2013",
      bgOpacity: 0.93,
      borderColor: "#C9A227",
      borderWidth: 3,
      accentColor: "#E8C55A",
      bodyColor: "#F7EAC8",
      fontId: "cinzel",
      cornerRadius: 6,
      plateShape: "cut_corner",
      glow: 0.4,
      motion: "pop",
    }),
  },
  {
    id: "scripture_banner",
    section: "scripture",
    layout: "verse_banner",
    name: "Ribbon Banner Verse",
    icon: "🎗️",
    blurb: "Reference on a ribbon banner floating above the verse",
    defaultDuration: 7,
    defaultPosition: "center",
    content: {
      book: "Philippians",
      chapter: "4",
      verse: "13",
      primaryText: "I can do all things through Christ which strengtheneth me.",
      secondaryText: "KJV",
    },
    style: s({
      bgColor: "#0D1B2A",
      bgOpacity: 0.85,
      borderColor: "#E0B252",
      accentColor: "#E0B252",
      bodyColor: "#FFFFFF",
      fontId: "cormorant",
      cornerRadius: 18,
      motion: "slide_down",
    }),
  },
  {
    id: "scripture_minimal",
    section: "scripture",
    layout: "verse_minimal",
    name: "Open Verse (No Plate)",
    icon: "🕊️",
    blurb: "Text straight on the video with a hairline rule — no background",
    defaultDuration: 7,
    defaultPosition: "center",
    content: {
      book: "Proverbs",
      chapter: "3",
      verse: "5",
      primaryText: "Trust in the Lord with all thine heart; and lean not unto thine own understanding.",
      secondaryText: "KJV",
    },
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      accentColor: "#F0D080",
      bodyColor: "#FFFFFF",
      fontId: "cormorant",
      shadow: 0.85,
      glow: 0,
      motion: "fade",
    }),
  },

  // ============================== QUOTES ==============================
  {
    id: "quote_editorial",
    section: "quotes",
    layout: "quote_editorial",
    name: "Editorial Quote",
    icon: "💬",
    blurb: "Oversized opening mark with the author on a rule beneath",
    defaultDuration: 6,
    defaultPosition: "center",
    content: {
      label: "WORDS OF WISDOM",
      primaryText: "The only limit to our realization of tomorrow is our doubts of today.",
      author: "Franklin D. Roosevelt",
      secondaryText: "32nd U.S. President",
    },
    style: s({
      bgColor: "#07101B",
      bgOpacity: 0.86,
      borderColor: "#38BDF8",
      accentColor: "#38BDF8",
      fontId: "eb_garamond",
      motion: "fade",
    }),
  },
  {
    id: "quote_centered",
    section: "quotes",
    layout: "quote_centered",
    name: "Symmetrical Quote",
    icon: "❝",
    blurb: "Marks on both sides with the author centred below",
    defaultDuration: 6,
    defaultPosition: "center",
    content: {
      primaryText: "Simplicity is the ultimate sophistication.",
      author: "Leonardo da Vinci",
      secondaryText: "",
    },
    style: s({
      bgColor: "#12060F",
      bgOpacity: 0.8,
      borderColor: "#F472B6",
      accentColor: "#F472B6",
      fontId: "cormorant",
      cornerRadius: 22,
      motion: "pop",
    }),
  },
  {
    id: "quote_card_left",
    section: "quotes",
    layout: "quote_card_left",
    name: "Accent Bar Quote",
    icon: "▌",
    blurb: "Thick left accent bar with ragged-right text",
    defaultDuration: 6,
    defaultPosition: "center",
    content: {
      primaryText: "Discipline is choosing between what you want now and what you want most.",
      author: "Abraham Lincoln",
      secondaryText: "",
    },
    style: s({
      bgColor: "#0F1720",
      bgOpacity: 0.78,
      borderMode: "left",
      borderColor: "#34D399",
      borderWidth: 6,
      accentColor: "#34D399",
      fontId: "inter",
      textAlign: "left",
      cornerRadius: 10,
      motion: "slide_left",
    }),
  },
  {
    id: "quote_neon",
    section: "quotes",
    layout: "quote_neon",
    name: "Neon Quote",
    icon: "🌃",
    blurb: "Glowing outline plate with an uppercase author line",
    defaultDuration: 6,
    defaultPosition: "center",
    content: {
      primaryText: "Dream bigger. Start smaller. Move faster.",
      author: "Unknown",
      secondaryText: "",
    },
    style: s({
      bgColor: "#05020A",
      bgOpacity: 0.7,
      borderColor: "#C084FC",
      borderWidth: 3,
      accentColor: "#E879F9",
      titleColor: "#F5E9FF",
      bodyColor: "#F5E9FF",
      fontId: "monoton",
      cornerRadius: 14,
      glow: 0.8,
      motion: "fade",
    }),
  },
  {
    id: "quote_typewriter",
    section: "quotes",
    layout: "quote_typewriter",
    name: "Typewriter Quote",
    icon: "⌨️",
    blurb: "Mono type on a paper plate that types itself on",
    defaultDuration: 7,
    defaultPosition: "center",
    content: {
      primaryText: "Write drunk, edit sober.",
      author: "Ernest Hemingway",
      secondaryText: "",
    },
    style: s({
      bgColor: "#F5F0E4",
      bgOpacity: 0.94,
      borderMode: "none",
      titleColor: "#1B1712",
      bodyColor: "#26211A",
      accentColor: "#8A6A3B",
      fontId: "inter",
      cornerRadius: 4,
      plateShape: "sharp",
      shadow: 0.7,
      glow: 0,
      motion: "typewriter",
    }),
  },

  // =========================== LOWER THIRDS ===========================
  {
    id: "lt_broadcast_bar",
    section: "lower_thirds",
    layout: "lt_bar",
    name: "Broadcast Bar",
    icon: "📺",
    blurb: "Classic two-line bar with a coloured accent strip",
    defaultDuration: 5,
    defaultPosition: "bottom-left",
    content: {
      primaryText: "Dr. Elizabeth Vance",
      secondaryText: "Lead Astrobiologist & Research Fellow",
      label: "FEATURED SPEAKER",
    },
    style: s({
      bgColor: "#0B1220",
      bgOpacity: 0.94,
      borderMode: "left",
      borderColor: "#6366F1",
      borderWidth: 7,
      accentColor: "#818CF8",
      fontId: "inter",
      textAlign: "left",
      cornerRadius: 10,
      motion: "slide_left",
    }),
  },
  {
    id: "lt_stacked_blocks",
    section: "lower_thirds",
    layout: "lt_stacked",
    name: "Stacked Blocks",
    icon: "🧱",
    blurb: "Name on a solid block with the role on a lighter block below",
    defaultDuration: 5,
    defaultPosition: "bottom-left",
    content: {
      primaryText: "Marcus Reed",
      secondaryText: "Founder & Chief Designer",
      label: "",
    },
    style: s({
      bgColor: "#E11D48",
      bgOpacity: 1,
      borderMode: "none",
      accentColor: "#0B1220",
      titleColor: "#FFFFFF",
      bodyColor: "#FFFFFF",
      fontId: "anton",
      textAlign: "left",
      plateShape: "sharp",
      cornerRadius: 0,
      shadow: 0.7,
      motion: "slide_right",
    }),
  },
  {
    id: "lt_pill",
    section: "lower_thirds",
    layout: "lt_pill",
    name: "Rounded Pill",
    icon: "💊",
    blurb: "Soft glass pill with a pulsing live dot",
    defaultDuration: 5,
    defaultPosition: "bottom-left",
    content: {
      primaryText: "Sarah Chen",
      secondaryText: "@sarahbuilds",
      label: "LIVE",
    },
    style: s({
      bgColor: "#0F172A",
      bgOpacity: 0.72,
      plateShape: "pill",
      borderMode: "full",
      borderColor: "#FFFFFF",
      borderOpacity: 0.28,
      borderWidth: 1.5,
      accentColor: "#22D3EE",
      fontId: "inter",
      textAlign: "left",
      backdropBlur: 0.6,
      motion: "slide_up",
    }),
  },
  {
    id: "lt_boxed",
    section: "lower_thirds",
    layout: "lt_boxed",
    name: "Outlined Box",
    icon: "🔲",
    blurb: "Hollow outlined box with the role sitting on the border",
    defaultDuration: 5,
    defaultPosition: "bottom-left",
    content: {
      primaryText: "JAMES OKONKWO",
      secondaryText: "Documentary Director",
      label: "",
    },
    style: s({
      bgOpacity: 0.18,
      bgColor: "#000000",
      borderMode: "full",
      borderColor: "#FBBF24",
      borderWidth: 2.5,
      accentColor: "#FBBF24",
      fontId: "cinzel",
      textAlign: "left",
      cornerRadius: 2,
      plateShape: "sharp",
      motion: "wipe_left",
    }),
  },
  {
    id: "lt_ribbon",
    section: "lower_thirds",
    layout: "lt_ribbon",
    name: "Angled Ribbon",
    icon: "🎀",
    blurb: "Sharp angled ribbon tail with a bold name",
    defaultDuration: 5,
    defaultPosition: "bottom-left",
    content: {
      primaryText: "Ana Duarte",
      secondaryText: "Head of Product",
      label: "GUEST",
    },
    style: s({
      bgColor: "#7C3AED",
      bgOpacity: 0.95,
      borderMode: "none",
      accentColor: "#FDE047",
      titleColor: "#FFFFFF",
      bodyColor: "#EDE9FE",
      fontId: "inter",
      textAlign: "left",
      plateShape: "sharp",
      motion: "slide_left",
    }),
  },
  {
    id: "lt_minimal_rule",
    section: "lower_thirds",
    layout: "lt_minimal_rule",
    name: "Minimal Rule",
    icon: "➖",
    blurb: "No plate at all — name over a thin rule, pure and clean",
    defaultDuration: 5,
    defaultPosition: "bottom-left",
    content: {
      primaryText: "Noah Bennett",
      secondaryText: "Cinematographer",
      label: "",
    },
    style: s({
      bgOpacity: 0,
      borderMode: "bottom",
      borderColor: "#FFFFFF",
      borderOpacity: 0.85,
      borderWidth: 2,
      accentColor: "#FFFFFF",
      fontId: "inter",
      textAlign: "left",
      shadow: 0.9,
      glow: 0,
      motion: "slide_right",
    }),
  },

  // ============================== LESSONS ==============================
  {
    id: "lesson_takeaway",
    section: "lessons",
    layout: "lesson_takeaway",
    name: "Key Takeaway",
    icon: "💡",
    blurb: "Label header over a bold one-line lesson",
    defaultDuration: 5.5,
    defaultPosition: "bottom",
    content: {
      label: "KEY TAKEAWAY",
      primaryText: "Consistency compounds faster than occasional intensity.",
      secondaryText: "Small daily actions yield long-term transformation.",
    },
    style: s({
      bgColor: "#052E24",
      bgOpacity: 0.9,
      borderColor: "#34D399",
      accentColor: "#6EE7B7",
      fontId: "inter",
      motion: "slide_up",
    }),
  },
  {
    id: "lesson_numbered",
    section: "lessons",
    layout: "lesson_numbered",
    name: "Numbered Step",
    icon: "🎯",
    blurb: "Large number badge beside the instruction",
    defaultDuration: 5.5,
    defaultPosition: "center",
    content: {
      label: "ACTION STEP",
      number: "01",
      primaryText: "Calibrate your baseline and inspect all inputs.",
      secondaryText: "Double-check the workspace before continuing.",
    },
    style: s({
      bgColor: "#1E1040",
      bgOpacity: 0.92,
      borderColor: "#A78BFA",
      accentColor: "#C4B5FD",
      fontId: "inter",
      textAlign: "left",
      motion: "slide_left",
    }),
  },
  {
    id: "lesson_fact",
    section: "lessons",
    layout: "lesson_fact",
    name: "Did You Know?",
    icon: "🧠",
    blurb: "Trivia callout with a question header and a source line",
    defaultDuration: 6,
    defaultPosition: "top",
    content: {
      label: "DID YOU KNOW?",
      primaryText: "Honey found in ancient Egyptian tombs is still edible after 3,000 years.",
      secondaryText: "Archaeologists routinely uncover intact, unspoiled honey pots.",
    },
    style: s({
      bgColor: "#2A0A1E",
      bgOpacity: 0.9,
      borderColor: "#EC4899",
      accentColor: "#F9A8D4",
      fontId: "inter",
      motion: "slide_down",
    }),
  },
  {
    id: "lesson_checklist",
    section: "lessons",
    layout: "lesson_checklist",
    name: "Checklist",
    icon: "✅",
    blurb: "Up to four ticked points that build the argument",
    defaultDuration: 7,
    defaultPosition: "center",
    content: {
      label: "REMEMBER THIS",
      item1: "Plan the shot before you roll",
      item2: "Record clean audio first",
      item3: "Cut on motion, not on words",
      item4: "Colour last, never first",
    },
    style: s({
      bgColor: "#0B1220",
      bgOpacity: 0.9,
      borderColor: "#38BDF8",
      accentColor: "#7DD3FC",
      fontId: "inter",
      textAlign: "left",
      motion: "slide_left",
    }),
  },
  {
    id: "lesson_stat",
    section: "lessons",
    layout: "lesson_stat",
    name: "Big Statistic",
    icon: "📊",
    blurb: "Oversized figure with a supporting caption",
    defaultDuration: 5,
    defaultPosition: "center",
    content: {
      label: "BY THE NUMBERS",
      number: "87%",
      primaryText: "of viewers drop off in the first ten seconds",
      secondaryText: "Source: internal retention study, 2025",
    },
    style: s({
      bgColor: "#1A1206",
      bgOpacity: 0.9,
      borderColor: "#F59E0B",
      accentColor: "#FCD34D",
      fontId: "anton",
      motion: "pop",
    }),
  },

  // ------- lesson titles: the same text art, sitting in the Lessons section
  {
    id: "lesson_title_module",
    section: "lessons",
    layout: "title_art_kicker",
    name: "Module Title",
    icon: "🎓",
    blurb: "Text-art module heading with a small lesson label above",
    defaultDuration: 5,
    defaultPosition: "center",
    content: { label: "MODULE 2", primaryText: "FOUNDATIONS" },
    artPreset: "carved_stone",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      accentColor: "#8FD3FF",
      shadow: 0,
      glow: 0,
      motion: "slide_up",
    }),
  },
  {
    id: "lesson_title_topic",
    section: "lessons",
    layout: "title_art_sub",
    name: "Topic Title",
    icon: "📚",
    blurb: "Lesson topic in text art with a one-line summary",
    defaultDuration: 5.5,
    defaultPosition: "center",
    content: { primaryText: "PHOTOSYNTHESIS", secondaryText: "How plants turn light into food" },
    artPreset: "clean_modern",
    style: s({
      bgColor: "#081120",
      bgOpacity: 0.5,
      borderMode: "none",
      bodyColor: "#C9D6EA",
      cornerRadius: 16,
      motion: "fade",
    }),
  },
  {
    id: "lesson_title_term",
    section: "lessons",
    layout: "title_art",
    name: "Key Term",
    icon: "🔑",
    blurb: "A single word or term rendered as bold gold lettering",
    defaultDuration: 4,
    defaultPosition: "center",
    content: { primaryText: "MOMENTUM" },
    artPreset: "classic_gold",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      shadow: 0,
      glow: 0,
      motion: "pop",
    }),
  },
  {
    id: "lesson_title_divider",
    section: "lessons",
    layout: "title_art_split",
    name: "Section Divider",
    icon: "🪧",
    blurb: "Chapter break between lessons, with rules either side",
    defaultDuration: 4,
    defaultPosition: "center",
    content: { primaryText: "PART TWO" },
    artPreset: "silver_chrome",
    style: s({
      bgColor: "#060A14",
      bgOpacity: 0.6,
      borderMode: "none",
      accentColor: "#9FB3CC",
      cornerRadius: 14,
      motion: "wipe_left",
    }),
  },

  // ============================== TITLES ==============================
  // Same card settings as every other template (background, transparency,
  // border, motion) — the difference is the letters are rendered as text art.
  {
    id: "title_hero",
    section: "titles",
    layout: "title_art",
    name: "Hero Title",
    icon: "🏆",
    blurb: "Big gold headline, no plate — the letters carry it",
    defaultDuration: 5,
    defaultPosition: "center",
    content: { primaryText: "THE GOLDEN HOUR" },
    artPreset: "classic_gold",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      shadow: 0,
      glow: 0,
      motion: "pop",
    }),
  },
  {
    id: "title_subtitle",
    section: "titles",
    layout: "title_art_sub",
    name: "Title & Subtitle",
    icon: "📰",
    blurb: "Chrome headline with a clean subtitle underneath",
    defaultDuration: 5.5,
    defaultPosition: "center",
    content: { primaryText: "CHAPTER ONE", secondaryText: "Where every journey begins" },
    artPreset: "silver_chrome",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      bodyColor: "#E6EDF7",
      fontId: "inter",
      shadow: 0,
      glow: 0,
      motion: "fade",
    }),
  },
  {
    id: "title_kicker",
    section: "titles",
    layout: "title_art_kicker",
    name: "Kicker Title",
    icon: "🔖",
    blurb: "Small label above a rusted, weathered headline",
    defaultDuration: 5.5,
    defaultPosition: "center",
    content: { label: "EPISODE 04", primaryText: "THE LONG ROAD" },
    artPreset: "rusted_iron",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      accentColor: "#E8A33D",
      shadow: 0,
      glow: 0,
      motion: "slide_up",
    }),
  },
  {
    id: "title_split",
    section: "titles",
    layout: "title_art_split",
    name: "Ruled Title",
    icon: "➖",
    blurb: "Headline flanked by rules, framed on a soft plate",
    defaultDuration: 5,
    defaultPosition: "center",
    content: { primaryText: "FINALE" },
    artPreset: "elegant_script",
    style: s({
      bgColor: "#0A0F1C",
      bgOpacity: 0.55,
      borderMode: "none",
      accentColor: "#E8C55A",
      cornerRadius: 18,
      motion: "wipe_left",
    }),
  },
  {
    id: "title_neon_sign",
    section: "titles",
    layout: "title_art",
    name: "Neon Title",
    icon: "💡",
    blurb: "Glowing neon lettering against the footage",
    defaultDuration: 5,
    defaultPosition: "center",
    content: { primaryText: "AFTER DARK" },
    artPreset: "neon_sign",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      shadow: 0,
      glow: 0,
      motion: "fade",
    }),
  },
  {
    id: "title_impact",
    section: "titles",
    layout: "title_art_sub",
    name: "Impact Title",
    icon: "💥",
    blurb: "Battle-damaged headline for high-drama moments",
    defaultDuration: 5,
    defaultPosition: "center",
    content: { primaryText: "NO WAY BACK", secondaryText: "A story of survival" },
    artPreset: "battle_damaged",
    style: s({
      bgOpacity: 0,
      borderMode: "none",
      bodyColor: "#D8D3CB",
      shadow: 0,
      glow: 0,
      motion: "pop",
    }),
  },

];

export const TEMPLATE_BY_ID: Record<string, TextTemplateDef> = Object.fromEntries(
  TEXT_TEMPLATES.map((t) => [t.id, t])
);

export const TEMPLATE_SECTIONS: {
  id: TemplateSection;
  name: string;
  icon: string;
  description: string;
}[] = [
  { id: "scripture", name: "Scripture", icon: "📖", description: "Verse cards with reference and translation" },
  { id: "quotes", name: "Quotes", icon: "💬", description: "Pull quotes with author attribution" },
  { id: "lower_thirds", name: "Lower Thirds", icon: "👤", description: "Name and role bars that slide in" },
  { id: "lessons", name: "Facts & Lessons", icon: "💡", description: "Takeaways, steps, facts and statistics" },
  { id: "titles", name: "Titles", icon: "🎨", description: "Display titles rendered as text art — gold, chrome, rusted and more" },
];

/** Legacy insert types → new template ids, so saved projects keep rendering. */
export const LEGACY_TEMPLATE_MAP: Record<string, string> = {
  scripture: "scripture_classic",
  template_scripture: "scripture_classic",
  quote: "quote_editorial",
  template_quote: "quote_editorial",
  template_lower_third: "lt_broadcast_bar",
  person: "lt_broadcast_bar",
  template_key_takeaway: "lesson_takeaway",
  key_point: "lesson_takeaway",
  template_did_you_know: "lesson_fact",
  fact: "lesson_fact",
  template_numbered_step: "lesson_numbered",
};

export function resolveTemplateId(type: string | undefined): string {
  if (!type) return "quote_editorial";
  if (TEMPLATE_BY_ID[type]) return type;
  return LEGACY_TEMPLATE_MAP[type] || "quote_editorial";
}

/** Merge a template's defaults with whatever the user has overridden. */
export function resolveTemplateStyle(
  templateId: string,
  overrides?: Partial<TextTemplateStyle> | null
): TextTemplateStyle {
  const def = TEMPLATE_BY_ID[resolveTemplateId(templateId)];
  const base = def ? def.style : BASE;
  return overrides ? { ...base, ...overrides } : base;
}

/** Slider metadata so the properties panel stays in sync with the model. */
export const STYLE_CONTROLS: {
  key: keyof TextTemplateStyle;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: "percent" | "px" | "x";
  group: "background" | "border" | "text" | "depth";
}[] = [
  { key: "bgOpacity", label: "Background opacity", min: 0, max: 1, step: 0.02, suffix: "percent", group: "background" },
  { key: "cornerRadius", label: "Corner radius", min: 0, max: 40, step: 1, suffix: "px", group: "background" },
  { key: "backdropBlur", label: "Backdrop blur", min: 0, max: 1, step: 0.05, suffix: "percent", group: "background" },
  { key: "borderWidth", label: "Border width", min: 0.5, max: 12, step: 0.5, suffix: "px", group: "border" },
  { key: "borderOpacity", label: "Border opacity", min: 0, max: 1, step: 0.02, suffix: "percent", group: "border" },
  { key: "textScale", label: "Text size", min: 0.6, max: 1.8, step: 0.05, suffix: "x", group: "text" },
  { key: "lineSpacing", label: "Line spacing", min: 0.7, max: 1.8, step: 0.05, suffix: "x", group: "text" },
  { key: "titleOpacity", label: "Title opacity", min: 0.1, max: 1, step: 0.02, suffix: "percent", group: "text" },
  { key: "bodyOpacity", label: "Body opacity", min: 0.1, max: 1, step: 0.02, suffix: "percent", group: "text" },
  { key: "accentOpacity", label: "Accent opacity", min: 0, max: 1, step: 0.02, suffix: "percent", group: "text" },
  { key: "shadow", label: "Drop shadow", min: 0, max: 1, step: 0.05, suffix: "percent", group: "depth" },
  { key: "glow", label: "Glow", min: 0, max: 1, step: 0.05, suffix: "percent", group: "depth" },
  { key: "motionDuration", label: "Motion length", min: 0.15, max: 1.5, step: 0.05, group: "depth" },
];

export const BORDER_MODES: { id: BorderMode; name: string; icon: string }[] = [
  { id: "none", name: "No border", icon: "∅" },
  { id: "full", name: "All sides", icon: "▢" },
  { id: "left", name: "Left only", icon: "▌" },
  { id: "bottom", name: "Bottom", icon: "▁" },
  { id: "top", name: "Top", icon: "▔" },
  { id: "left_bottom", name: "Left + bottom", icon: "└" },
];

export const PLATE_SHAPES: { id: PlateShape; name: string }[] = [
  { id: "rounded", name: "Rounded" },
  { id: "sharp", name: "Sharp" },
  { id: "pill", name: "Pill" },
  { id: "cut_corner", name: "Cut corner" },
];
