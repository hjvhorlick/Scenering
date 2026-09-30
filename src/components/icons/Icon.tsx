import type { ReactNode } from "react";

/**
 * The icon in front of the word.
 *
 * Every label in the product used to start with an emoji. Emoji are drawn by
 * the operating system, so they were a different size, weight and palette on
 * every machine, and at the size they sat at they were too small to read.
 * These replace them with one drawn set, about twice the height, in the
 * Scenering blue-and-gold.
 *
 * Nothing here changes a single word. `glyph` takes the emoji that was
 * already in the copy and swaps only the picture; if a glyph has no drawing
 * yet it renders the original emoji at the new size, so a label can never end
 * up blank.
 */

/** Emoji already in the product -> the drawing that replaces it. */
export const ICON_FOR_GLYPH: Record<string, string> = {
  // transport
  "▶": "play",
  "►": "play",
  "▸": "play",
  "⏵": "play",
  "⏹": "stop",
  "⏸": "pause",
  "⏺": "record",
  "🔴": "record",
  "↻": "replay",
  "↺": "replay",
  "🔄": "replay",
  "🔃": "replay",
  "🔁": "loop",

  // answers
  "✓": "check",
  "✔": "check",
  "✅": "check",
  "✕": "close",
  "✖": "close",
  "❌": "close",
  "➕": "plus",
  "➖": "minus",
  "🚫": "ban",
  "⚠": "warning",

  // arrows
  "⬆": "up",
  "↑": "up",
  "⬇": "down",
  "↓": "down",
  "⬅": "left",
  "←": "left",
  "➡": "right",
  "→": "right",
  "➤": "right",
  "▲": "caret-up",
  "▼": "caret-down",
  "▾": "caret-down",
  "↔": "pan-h",
  "⇄": "pan-h",
  "↕": "pan-v",
  "⇅": "pan-v",

  // the craft
  "⚙": "gear",
  "🔧": "gear",
  "🎛": "gear",
  "📝": "script",
  "📜": "script",
  "📄": "script",
  "🎙": "mic",
  "🎤": "mic",
  "🗣": "mic",
  "💬": "captions",
  "🎬": "clapper",
  "🎥": "clapper",
  "🎞": "film",
  "📼": "film",
  "🖼": "image",
  "📷": "image",
  "📸": "image",
  "🔍": "search",
  "🎨": "palette",
  "⚡": "bolt",
  "✨": "sparkle",
  "✱": "sparkle",
  "🪄": "sparkle",
  "💫": "sparkle",
  "👁": "eye",
  "🏁": "flag",
  "✂": "scissors",
  "✏": "pencil",
  "✎": "pencil",
  "✍": "pencil",
  "🖌": "pencil",
  "🗑": "trash",
  "🔒": "lock",
  "🔓": "unlock",
  "🔑": "key",
  "ℹ": "info",
  "🔗": "link",
  "📋": "clipboard",
  "🛡": "shield",
  "🧪": "flask",
  "📖": "book",
  "📚": "book",
  "📕": "book",
  "💎": "gem",
  "🎭": "masks",
  "💾": "save",
  "📍": "pin",
  "🌊": "wave",
  "◑": "contrast",
  "◐": "contrast",
  "⏭": "skip",
  "📦": "box",
  "↶": "undo",
  "○": "ring",
  "◯": "ring",
  "⬛": "square",
  "⬜": "square",
  "👆": "hand",
  "⎋": "exit",
  "⇋": "flip",
  "🚻": "people",
  "✶": "sparkle",
  "🔊": "speaker",
  "🔉": "speaker",
  "📢": "speaker",
  "📣": "speaker",
  "🎵": "music",
  "🎶": "music",
  "♪": "music",
  "♫": "music",
  "🎧": "headphones",
  "◎": "visualiser",
  "📊": "visualiser",
  "🚀": "rocket",
  "🎯": "target",
  "📁": "folder",
  "📂": "folder",
  "🌐": "globe",
  "🔔": "bell",
  "💡": "bulb",
  "⏳": "clock",
  "⏱": "clock",
  "⏰": "clock",
  "👤": "person",
  "👨": "person",
  "👩": "person",
  "👥": "people",
  "🖱": "mouse",
  "▭": "frame",
  "▢": "frame",
  "🔲": "frame",
  "🔤": "text",
  "🔠": "text",
  "📱": "phone",
  "📺": "screen",
  "📈": "chart",
  "⭐": "star",
  "🌟": "star",
  "★": "star",
  "🏷": "tag",
  "🔖": "tag",
  "🔀": "shuffle",
  "📐": "crop",
  "⬇️": "download",
  "📤": "upload",
  "🌿": "leaf",
  "🗄": "archive",
  "🗃": "archive",
  "☰": "menu",
  "●": "dot",
  "⬤": "dot",
};

/** Every drawing the sprite actually contains. */
export const ICON_NAMES = [
  "play", "stop", "pause", "record", "replay", "loop",
  "check", "close", "plus", "minus", "ban", "warning",
  "up", "down", "left", "right", "caret-up", "caret-down", "pan-h", "pan-v",
  "gear", "script", "mic", "captions", "clapper", "film", "image", "search",
  "palette", "bolt", "sparkle", "eye", "flag", "scissors", "pencil", "trash",
  "lock", "speaker", "music", "headphones", "visualiser", "rocket", "target",
  "folder", "globe", "bell", "bulb", "clock", "person", "people", "mouse",
  "frame", "text", "phone", "screen", "chart", "star", "tag", "shuffle",
  "crop", "download", "upload", "leaf", "menu", "dot", "archive",
  "key", "unlock", "info", "link", "clipboard", "shield", "flask", "book",
  "gem", "masks", "save", "pin", "wave", "contrast", "skip", "box", "undo",
  "ring", "square", "hand", "exit", "flip",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const KNOWN = new Set<string>(ICON_NAMES);

/** Strip the variation selector so "⚙️" and "⚙" both resolve. */
const bare = (glyph: string) => glyph.replace(/\uFE0F/g, "").trim();

export const iconNameFor = (glyph: string): IconName | null => {
  const name = ICON_FOR_GLYPH[bare(glyph)];
  return name && KNOWN.has(name) ? (name as IconName) : null;
};

export interface IconProps {
  /** A drawing by name. */
  name?: IconName;
  /** Or the emoji that used to be in the copy, which is looked up. */
  glyph?: string;
  /** `sm` for dense rows, `lg` for headings. Default sits at ~1.8x the old emoji. */
  size?: "sm" | "md" | "lg";
  /** Set when the icon is the only content of a control and carries its meaning. */
  label?: string;
  className?: string;
}

/**
 * Decorative by default: these sit in front of a word that already says the
 * same thing, so they are hidden from screen readers unless given a `label`.
 */
export default function Icon({ name, glyph, size = "md", label, className }: IconProps): ReactNode {
  const resolved = name ?? (glyph ? iconNameFor(glyph) : null);
  const classes = ["ico", `ico-${size}`, className].filter(Boolean).join(" ");
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  // No drawing for this glyph yet — show the original emoji, at the new size,
  // rather than a hole where the icon was.
  if (!resolved) {
    return (
      <span className={`${classes} ico-glyph`} {...a11y}>
        {glyph}
      </span>
    );
  }

  return (
    <svg className={classes} viewBox="0 0 32 32" focusable="false" {...a11y}>
      <use href={`#ico-${resolved}`} />
    </svg>
  );
}

/**
 * Swap a leading emoji inside an existing string for its drawing.
 *
 * Plenty of labels in the product are strings, not markup — option lists,
 * ternaries on a button, catalogue entries. Rewriting those strings would
 * mean editing the copy, so instead the string is left exactly as it is and
 * the first glyph is exchanged for an icon on the way to the screen. The
 * words that follow are passed through untouched, spacing and all.
 */
export function iconify(value: unknown, size: IconProps["size"] = "md"): ReactNode {
  if (typeof value !== "string") return value as ReactNode;
  const match = value.match(
    /^([\u{1F300}-\u{1FAFF}\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u2600-\u26FF]\uFE0F?)(\s+)([\s\S]*)$/u,
  );
  if (!match) {
    // A label that is only a glyph — a close cross, a menu bar — still
    // deserves the drawing.
    const alone = value.trim();
    return iconNameFor(alone) ? <Icon glyph={alone} size={size} /> : value;
  }
  const [, glyph, gap, rest] = match;
  if (!iconNameFor(glyph)) return value;
  return (
    <>
      <Icon glyph={glyph} size={size} />
      {gap}
      {rest}
    </>
  );
}
