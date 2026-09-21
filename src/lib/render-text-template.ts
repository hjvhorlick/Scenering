/**
 * Text Template Renderer
 * ======================
 * Draws every text card described in src/data/text-templates.ts.
 *
 * The important structural idea: the plate (background + border), the text
 * styling and the entrance motion are handled once, generically, for all
 * templates. Each layout only describes where its text blocks sit. That is what
 * makes background colour, transparency, border removal, font choice and
 * slide-in motion work uniformly across every template instead of having to be
 * re-implemented per design.
 */

import {
  resolveTemplateId,
  resolveTemplateStyle,
  TEMPLATE_BY_ID,
  type TextTemplateStyle,
  type TemplateLayout,
  type BorderMode,
} from "../data/text-templates";
import { getCaptionFont } from "../data/caption-styles";
import {
  drawTextArt,
  artFamilyFor,
  DEFAULT_TEXT_ART,
  PRESET_BY_ID,
  type TextArtStyle,
} from "./text-art";
import type { TimelineInsert } from "../types";

// ------------------------------------------------------------------ colour

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

// ------------------------------------------------------------------ paths

function platePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: TextTemplateStyle
) {
  const shape = style.plateShape;
  let r = style.cornerRadius;
  if (shape === "sharp") r = 0;
  if (shape === "pill") r = h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));

  ctx.beginPath();
  if (shape === "cut_corner") {
    const c = Math.max(6, Math.min(style.cornerRadius, w / 2, h / 2));
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draws only the requested edges, so "no border" is a real option. */
function strokeBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: TextTemplateStyle
) {
  const mode: BorderMode = style.borderMode;
  if (mode === "none" || style.borderOpacity <= 0 || style.borderWidth <= 0) return;

  ctx.save();
  ctx.strokeStyle = rgba(style.borderColor, style.borderOpacity);
  ctx.lineWidth = style.borderWidth;
  ctx.lineCap = "square";

  if (mode === "full") {
    platePath(ctx, x, y, w, h, style);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Edge-only borders read best as solid bars rather than hairlines
  const t = style.borderWidth;
  ctx.fillStyle = rgba(style.borderColor, style.borderOpacity);
  if (mode === "left" || mode === "left_bottom") {
    ctx.fillRect(x, y, t, h);
  }
  if (mode === "bottom" || mode === "left_bottom") {
    ctx.fillRect(x, y + h - t, w, t);
  }
  if (mode === "top") {
    ctx.fillRect(x, y, w, t);
  }
  ctx.restore();
}

/**
 * Background plate: optional blur of the footage behind it, flat or gradient
 * fill at the chosen opacity, then the border.
 */
function paintPlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: TextTemplateStyle
) {
  // Drop shadow under the whole plate
  if (style.shadow > 0 && style.bgOpacity > 0.02) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.5 * style.shadow})`;
    ctx.shadowBlur = 26 * style.shadow;
    ctx.shadowOffsetY = 8 * style.shadow;
    platePath(ctx, x, y, w, h, style);
    ctx.fillStyle = rgba(style.bgColor, Math.max(0.35, style.bgOpacity));
    ctx.fill();
    ctx.restore();
  }

  // Glow halo
  if (style.glow > 0) {
    ctx.save();
    ctx.shadowColor = rgba(style.accentColor, 0.75 * style.glow);
    ctx.shadowBlur = 34 * style.glow;
    platePath(ctx, x, y, w, h, style);
    ctx.fillStyle = "rgba(0,0,0,0.001)";
    ctx.fill();
    ctx.restore();
  }

  // The fill itself — fully skipped at zero opacity so text can float free
  if (style.bgOpacity > 0.001) {
    ctx.save();
    platePath(ctx, x, y, w, h, style);
    if (style.bgColor2) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, rgba(style.bgColor, style.bgOpacity));
      g.addColorStop(1, rgba(style.bgColor2, style.bgOpacity));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = rgba(style.bgColor, style.bgOpacity);
    }
    ctx.fill();

    // A soft top sheen keeps flat plates from looking like dead rectangles
    if (style.bgOpacity > 0.25) {
      ctx.clip();
      const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.5);
      sheen.addColorStop(0, "rgba(255,255,255,0.07)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(x, y, w, h * 0.5);
    }
    ctx.restore();
  }

  strokeBorder(ctx, x, y, w, h, style);
}

// ------------------------------------------------------------------ text

function fontStack(style: TextTemplateStyle): string {
  const f = getCaptionFont(style.fontId);
  return `"${f.family}", ${f.fallback}`;
}

function setFont(
  ctx: CanvasRenderingContext2D,
  style: TextTemplateStyle,
  size: number,
  weight: number | string = 700,
  italic = false
) {
  const px = Math.max(8, size * style.textScale);
  ctx.font = `${italic ? "italic " : ""}${weight} ${px}px ${fontStack(style)}`;
}

/** Word-wrap that reports how many lines it used, so layouts can self-size. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/** x position and canvas textAlign for the card's alignment setting */
function alignFor(style: TextTemplateStyle, left: number, right: number) {
  if (style.textAlign === "left") return { x: left, align: "left" as CanvasTextAlign };
  if (style.textAlign === "right") return { x: right, align: "right" as CanvasTextAlign };
  return { x: (left + right) / 2, align: "center" as CanvasTextAlign };
}

// ------------------------------------------------------------------ motion

interface MotionResult {
  dx: number;
  dy: number;
  scale: number;
  alpha: number;
  /** 0-1 clip reveal for wipes; 1 = fully revealed */
  wipe: number;
  /** 0-1 of the body text to show for the typewriter */
  type: number;
  /** which template is being drawn (title layouts need it for the art style) */
  templateId: string;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutBack(t: number) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

function computeTemplateMotion(
  style: TextTemplateStyle,
  elapsed: number,
  duration: number,
  cardWidth: number,
  cardHeight: number
): MotionResult {
  const res: MotionResult = { dx: 0, dy: 0, scale: 1, alpha: 1, wipe: 1, type: 1, templateId: "" };
  const d = Math.max(0.05, style.motionDuration);
  const tIn = Math.max(0, Math.min(1, elapsed / d));
  const e = easeOutCubic(tIn);

  switch (style.motion) {
    case "slide_left":
      res.dx = -(1 - e) * (cardWidth * 0.75 + 120);
      res.alpha = Math.min(1, tIn * 1.6);
      break;
    case "slide_right":
      res.dx = (1 - e) * (cardWidth * 0.75 + 120);
      res.alpha = Math.min(1, tIn * 1.6);
      break;
    case "slide_up":
      res.dy = (1 - e) * (cardHeight * 0.9 + 60);
      res.alpha = Math.min(1, tIn * 1.6);
      break;
    case "slide_down":
      res.dy = -(1 - e) * (cardHeight * 0.9 + 60);
      res.alpha = Math.min(1, tIn * 1.6);
      break;
    case "fade":
      res.alpha = e;
      break;
    case "pop":
      res.scale = 0.7 + easeOutBack(tIn) * 0.3;
      res.alpha = Math.min(1, tIn * 2);
      break;
    case "wipe_left":
      res.wipe = e;
      break;
    case "typewriter":
      // reveal the plate quickly, then type the body over ~60% of the card
      res.alpha = Math.min(1, tIn * 2.5);
      res.type = Math.max(0, Math.min(1, elapsed / Math.max(0.4, duration * 0.55)));
      break;
    case "none":
    default:
      break;
  }

  // Everything eases out at the end so cards never snap off screen
  const remaining = duration - elapsed;
  if (remaining < 0.35) {
    const o = Math.max(0, remaining / 0.35);
    res.alpha *= o;
  }

  return res;
}

// ------------------------------------------------------------------ layout

/** Nominal card size per layout, before the user's size multiplier. */
export function templateFootprint(
  layout: TemplateLayout,
  canvasWidth: number
): { w: number; h: number } {
  const wide = Math.min(880, canvasWidth * 0.82);
  const bar = Math.min(720, canvasWidth * 0.62);
  switch (layout) {
    case "verse_classic":
      return { w: wide, h: 230 };
    case "verse_side_rule":
      return { w: wide, h: 200 };
    case "verse_illuminated":
      return { w: wide, h: 260 };
    case "verse_banner":
      return { w: wide, h: 250 };
    case "verse_minimal":
      return { w: wide, h: 190 };
    case "quote_editorial":
      return { w: wide, h: 220 };
    case "quote_centered":
      return { w: wide, h: 220 };
    case "quote_card_left":
      return { w: wide, h: 190 };
    case "quote_neon":
      return { w: wide, h: 200 };
    case "quote_typewriter":
      return { w: wide, h: 190 };
    case "lt_bar":
      return { w: bar, h: 92 };
    case "lt_stacked":
      return { w: bar, h: 104 };
    case "lt_pill":
      return { w: bar, h: 80 };
    case "lt_boxed":
      return { w: bar, h: 96 };
    case "lt_ribbon":
      return { w: bar, h: 92 };
    case "lt_minimal_rule":
      return { w: bar, h: 88 };
    case "lesson_takeaway":
      return { w: wide, h: 170 };
    case "lesson_numbered":
      return { w: wide, h: 160 };
    case "lesson_fact":
      return { w: wide, h: 185 };
    case "lesson_checklist":
      return { w: wide, h: 240 };
    case "lesson_stat":
      return { w: wide, h: 220 };
    case "title_art":
      return { w: wide, h: 200 };
    case "title_art_sub":
      return { w: wide, h: 250 };
    case "title_art_kicker":
      return { w: wide, h: 230 };
    case "title_art_split":
      return { w: wide, h: 210 };
    default:
      return { w: wide, h: 200 };
  }
}

type LayoutFn = (
  ctx: CanvasRenderingContext2D,
  c: Record<string, string>,
  st: TextTemplateStyle,
  w: number,
  h: number,
  m: MotionResult
) => void;

/** Reference string like "John 3:16" */
function refOf(c: Record<string, string>): string {
  const book = c.book || "";
  const ch = c.chapter || "";
  const v = c.verse || "";
  if (!book) return c.reference || "";
  return `${book} ${ch}${v ? ":" + v : ""}`.trim();
}

/**
 * Resolves the letter artwork for a title: engine defaults, then the
 * template's chosen preset, then the user's own overrides.
 */
export function resolveArtStyle(
  templateId: string,
  overrides?: Record<string, unknown> | null
): TextArtStyle {
  const def = TEMPLATE_BY_ID[templateId];
  const preset = def?.artPreset ? PRESET_BY_ID[def.artPreset] : undefined;
  return {
    ...DEFAULT_TEXT_ART,
    ...(preset ? preset.style : {}),
    ...((overrides || {}) as Partial<TextArtStyle>),
  } as TextArtStyle;
}

/** Paints the headline lettering for the title layouts. */
function paintTitleArt(
  ctx: CanvasRenderingContext2D,
  text: string,
  st: TextTemplateStyle,
  w: number,
  topY: number,
  reveal: number,
  templateId: string
): { width: number; height: number } {
  const art = resolveArtStyle(templateId, st.art);
  // the card's own text scale still multiplies the art size, so the existing
  // size slider keeps working exactly as it does on every other template
  const scaled: TextArtStyle = { ...art, fontSize: art.fontSize * st.textScale };
  const baseFont = getCaptionFont(scaled.fontId);
  const fam = artFamilyFor(scaled, { family: baseFont.family, fallback: baseFont.fallback });
  return drawTextArt(ctx, text, scaled, {
    family: fam.family,
    fallback: fam.fallback,
    x: 0,
    y: topY,
    maxWidth: w - 56,
    reveal,
    seed: 11,
  });
}

const LAYOUTS: Record<TemplateLayout, LayoutFn> = {
  // ------------------------------- scripture
  verse_classic: (ctx, c, st, w, h) => {
    const pad = 38;
    const { x, align } = alignFor(st, -w / 2 + pad, w / 2 - pad);
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";

    setFont(ctx, st, 14, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    const head = `${st.uppercaseLabel ? (c.label || "HOLY SCRIPTURE").toUpperCase() : c.label || "Holy Scripture"} · ${refOf(c).toUpperCase()}`;
    ctx.fillText(head, x, -h / 2 + 38);

    setFont(ctx, st, 22, 500, true);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 30 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, `“${c.primaryText || ""}”`, w - pad * 2);
    drawLines(ctx, lines, x, -h / 2 + 84, lh);

    setFont(ctx, st, 13, 600);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity * 0.85);
    ctx.fillText(`— ${refOf(c)} (${c.secondaryText || "KJV"})`, x, h / 2 - 24);
  },

  verse_side_rule: (ctx, c, st, w, h) => {
    const padL = 42;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // stacked reference
    setFont(ctx, st, 26, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(c.book || "Psalm", -w / 2 + padL, -h / 2 + 52);
    setFont(ctx, st, 16, 600);
    ctx.fillText(`${c.chapter || ""}:${c.verse || ""}`, -w / 2 + padL, -h / 2 + 76);

    // verse to the right of the reference column
    const textLeft = -w / 2 + padL + 130;
    setFont(ctx, st, 21, 500, true);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 29 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w / 2 - 30 - textLeft);
    drawLines(ctx, lines, textLeft, -h / 2 + 54, lh);

    setFont(ctx, st, 12, 600);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity * 0.8);
    ctx.fillText(c.secondaryText || "", textLeft, h / 2 - 22);
  },

  verse_illuminated: (ctx, c, st, w, h) => {
    const pad = 46;
    const body = c.primaryText || "";
    const first = body.charAt(0) || "T";
    const rest = body.slice(1);

    // ornamental corners
    ctx.strokeStyle = rgba(st.accentColor, st.accentOpacity * 0.8);
    ctx.lineWidth = 2;
    const cs = 22;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      const px = (w / 2 - 16) * sx;
      const py = (h / 2 - 16) * sy;
      ctx.beginPath();
      ctx.moveTo(px - cs * sx, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py - cs * sy);
      ctx.stroke();
    });

    // drop cap
    setFont(ctx, st, 76, 700);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    const capX = -w / 2 + pad;
    ctx.fillText(first, capX, -h / 2 + 108);
    const capW = ctx.measureText(first).width + 14;

    setFont(ctx, st, 20, 500);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 28 * st.textScale * st.lineSpacing;
    // first two lines wrap beside the cap, the rest run full width
    const narrow = wrap(ctx, rest, w - pad * 2 - capW);
    const beside = narrow.slice(0, 2);
    drawLines(ctx, beside, capX + capW, -h / 2 + 60, lh);
    if (narrow.length > 2) {
      const remainder = narrow.slice(2).join(" ");
      const full = wrap(ctx, remainder, w - pad * 2);
      drawLines(ctx, full, capX, -h / 2 + 60 + 2 * lh, lh);
    }

    setFont(ctx, st, 13, 700);
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(`${refOf(c).toUpperCase()} · ${(c.secondaryText || "KJV").toUpperCase()}`, 0, h / 2 - 26);
  },

  verse_banner: (ctx, c, st, w, h) => {
    // ribbon banner across the top
    const bw = Math.min(w * 0.62, 420);
    const bh = 40;
    const by = -h / 2 - bh / 2 + 6;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-bw / 2, by);
    ctx.lineTo(bw / 2, by);
    ctx.lineTo(bw / 2 - 16, by + bh / 2);
    ctx.lineTo(bw / 2, by + bh);
    ctx.lineTo(-bw / 2, by + bh);
    ctx.lineTo(-bw / 2 + 16, by + bh / 2);
    ctx.closePath();
    ctx.fillStyle = rgba(st.accentColor, Math.max(0.75, st.accentOpacity));
    ctx.fill();
    setFont(ctx, st, 15, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0B1220";
    ctx.fillText(refOf(c).toUpperCase(), 0, by + bh / 2 + 1);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 23, 500, true);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 32 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, `“${c.primaryText || ""}”`, w - 90);
    drawLines(ctx, lines, 0, -h / 2 + 92, lh);

    setFont(ctx, st, 13, 600);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity * 0.85);
    ctx.fillText(c.secondaryText || "KJV", 0, h / 2 - 24);
  },

  verse_minimal: (ctx, c, st, w, h) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 25, 500, true);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 34 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - 60);
    drawLines(ctx, lines, 0, -h / 2 + 62, lh);

    const ruleY = -h / 2 + 62 + lines.length * lh + 6;
    ctx.strokeStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-70, ruleY);
    ctx.lineTo(70, ruleY);
    ctx.stroke();

    setFont(ctx, st, 14, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(`${refOf(c).toUpperCase()}`, 0, ruleY + 26);
  },

  // ------------------------------- quotes
  quote_editorial: (ctx, c, st, w, h) => {
    const pad = 46;
    ctx.textBaseline = "alphabetic";

    setFont(ctx, st, 72, 700);
    ctx.textAlign = "left";
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity * 0.45);
    ctx.fillText("“", -w / 2 + pad - 8, -h / 2 + 76);

    const { x, align } = alignFor(st, -w / 2 + pad, w / 2 - pad);
    ctx.textAlign = align;
    setFont(ctx, st, 23, 500, true);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 32 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - pad * 2 - 20);
    drawLines(ctx, lines, x, -h / 2 + 96, lh);

    const ruleY = h / 2 - 48;
    ctx.strokeStyle = rgba(st.accentColor, st.accentOpacity * 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + pad, ruleY);
    ctx.lineTo(-w / 2 + pad + 54, ruleY);
    ctx.stroke();

    ctx.textAlign = "left";
    setFont(ctx, st, 16, 700);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.author || "", -w / 2 + pad + 68, ruleY + 5);
    if (c.secondaryText) {
      setFont(ctx, st, 12, 500);
      ctx.fillStyle = rgba(st.accentColor, st.accentOpacity * 0.8);
      ctx.fillText(c.secondaryText, -w / 2 + pad + 68, ruleY + 24);
    }
  },

  quote_centered: (ctx, c, st, w, h) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 26, 600, true);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 36 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - 140);
    const startY = -h / 2 + 84;
    drawLines(ctx, lines, 0, startY, lh);

    // marks flanking the block
    setFont(ctx, st, 58, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity * 0.5);
    const midY = startY + ((lines.length - 1) * lh) / 2;
    ctx.fillText("“", -w / 2 + 48, midY);
    ctx.fillText("”", w / 2 - 48, midY + 8);

    setFont(ctx, st, 15, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText((c.author || "").toUpperCase(), 0, h / 2 - 30);
  },

  quote_card_left: (ctx, c, st, w, h) => {
    const pad = 40;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 22, 600);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 31 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - pad * 2);
    drawLines(ctx, lines, -w / 2 + pad, -h / 2 + 56, lh);

    setFont(ctx, st, 14, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(`— ${c.author || ""}`, -w / 2 + pad, h / 2 - 28);
  },

  quote_neon: (ctx, c, st, w, h) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 26, 500);
    const lh = 38 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - 90);
    // neon = a glow pass under a bright core
    ctx.save();
    ctx.shadowColor = rgba(st.accentColor, 0.9);
    ctx.shadowBlur = 18 + 22 * st.glow;
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    drawLines(ctx, lines, 0, -h / 2 + 70, lh);
    ctx.restore();
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    drawLines(ctx, lines, 0, -h / 2 + 70, lh);

    setFont(ctx, st, 13, 700);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText((c.author || "").toUpperCase(), 0, h / 2 - 26);
  },

  quote_typewriter: (ctx, c, st, w, h, m) => {
    const pad = 40;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const full = c.primaryText || "";
    const shown = full.slice(0, Math.max(0, Math.ceil(full.length * m.type)));

    ctx.font = `600 ${Math.max(8, 21 * st.textScale)}px "Courier New", Courier, monospace`;
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 30 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, shown, w - pad * 2);
    drawLines(ctx, lines, -w / 2 + pad, -h / 2 + 58, lh);

    // blinking caret while typing
    if (m.type < 1) {
      const lastLine = lines[lines.length - 1] || "";
      const cw = ctx.measureText(lastLine).width;
      const cy = -h / 2 + 58 + (lines.length - 1) * lh;
      ctx.fillRect(-w / 2 + pad + cw + 3, cy - 14, 9, 17);
    }

    ctx.font = `700 ${Math.max(8, 13 * st.textScale)}px "Courier New", Courier, monospace`;
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(`-- ${c.author || ""}`, -w / 2 + pad, h / 2 - 24);
  },

  // ------------------------------- lower thirds
  lt_bar: (ctx, c, st, w, h) => {
    const padL = 26;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (c.label) {
      setFont(ctx, st, 10, 800);
      ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
      ctx.fillText(st.uppercaseLabel ? c.label.toUpperCase() : c.label, -w / 2 + padL, -h / 2 + 22);
    }
    setFont(ctx, st, 23, 800);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.primaryText || "", -w / 2 + padL, -h / 2 + (c.label ? 50 : 42));

    setFont(ctx, st, 14, 500);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.85);
    ctx.fillText(c.secondaryText || "", -w / 2 + padL, -h / 2 + (c.label ? 72 : 66));
  },

  lt_stacked: (ctx, c, st, w, h) => {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const nameH = h * 0.6;

    // the name block is the plate itself; the role sits on a darker block
    setFont(ctx, st, 26, 800);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText((c.primaryText || "").toUpperCase(), -w / 2 + 22, -h / 2 + nameH / 2);

    const roleY = -h / 2 + nameH;
    const roleH = h - nameH;
    ctx.fillStyle = rgba(st.accentColor, 0.92);
    ctx.fillRect(-w / 2, roleY, w, roleH);
    setFont(ctx, st, 14, 700);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    ctx.fillText(c.secondaryText || "", -w / 2 + 22, roleY + roleH / 2);
  },

  lt_pill: (ctx, c, st, w, h) => {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const dotX = -w / 2 + 30;

    // live dot
    ctx.beginPath();
    ctx.arc(dotX, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = rgba(st.accentColor, 1);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = rgba(st.accentColor, 0.9);
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();

    if (c.label) {
      setFont(ctx, st, 10, 800);
      ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
      ctx.fillText(c.label.toUpperCase(), dotX + 18, -11);
    }
    setFont(ctx, st, 19, 700);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.primaryText || "", dotX + 18, c.label ? 9 : 0);

    if (c.secondaryText) {
      setFont(ctx, st, 13, 500);
      ctx.textAlign = "right";
      ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.8);
      ctx.fillText(c.secondaryText, w / 2 - 26, 0);
    }
  },

  lt_boxed: (ctx, c, st, w, h) => {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    setFont(ctx, st, 22, 700);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.primaryText || "", -w / 2 + 24, -6);

    // role tag straddling the bottom border
    const role = c.secondaryText || "";
    if (role) {
      setFont(ctx, st, 12, 700);
      const tw = ctx.measureText(role).width + 20;
      const ty = h / 2 - 8;
      ctx.fillStyle = rgba(st.accentColor, 1);
      ctx.fillRect(-w / 2 + 24, ty - 9, tw, 20);
      ctx.fillStyle = "#0B1220";
      ctx.fillText(role, -w / 2 + 34, ty + 1);
    }
  },

  lt_ribbon: (ctx, c, st, w, h) => {
    // angled tail on the right
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, -h / 2);
    ctx.lineTo(w / 2 + 34, -h / 2);
    ctx.lineTo(w / 2 + 12, h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = rgba(st.accentColor, 0.95);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    if (c.label) {
      setFont(ctx, st, 10, 800);
      ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
      ctx.fillText(c.label.toUpperCase(), -w / 2 + 24, -h / 2 + 24);
    }
    setFont(ctx, st, 24, 800);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.primaryText || "", -w / 2 + 24, -h / 2 + 52);
    setFont(ctx, st, 13, 500);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.88);
    ctx.fillText(c.secondaryText || "", -w / 2 + 24, -h / 2 + 74);
  },

  lt_minimal_rule: (ctx, c, st, w, h) => {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 26, 700);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.primaryText || "", -w / 2 + 8, -h / 2 + 40);
    setFont(ctx, st, 14, 500);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.85);
    ctx.fillText(c.secondaryText || "", -w / 2 + 8, -h / 2 + 64);
  },

  // ------------------------------- lessons
  lesson_takeaway: (ctx, c, st, w, h) => {
    const pad = 40;
    const { x, align } = alignFor(st, -w / 2 + pad, w / 2 - pad);
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";

    setFont(ctx, st, 13, 800);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(st.uppercaseLabel ? (c.label || "").toUpperCase() : c.label || "", x, -h / 2 + 34);

    setFont(ctx, st, 21, 700);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    const lh = 29 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - pad * 2);
    drawLines(ctx, lines, x, -h / 2 + 70, lh);

    if (c.secondaryText) {
      setFont(ctx, st, 14, 500);
      ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.85);
      const sub = wrap(ctx, c.secondaryText, w - pad * 2);
      drawLines(ctx, sub, x, -h / 2 + 70 + lines.length * lh + 12, 20 * st.textScale);
    }
  },

  lesson_numbered: (ctx, c, st, w, h) => {
    const badge = 66;
    const bx = -w / 2 + 34;

    // number badge
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + badge / 2, 0, badge / 2, 0, Math.PI * 2);
    ctx.fillStyle = rgba(st.accentColor, 0.95);
    ctx.shadowColor = rgba(st.accentColor, 0.7 * st.glow);
    ctx.shadowBlur = 20 * st.glow;
    ctx.fill();
    ctx.restore();
    setFont(ctx, st, 26, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0B1220";
    ctx.fillText(c.number || "01", bx + badge / 2, 1);

    const tx = bx + badge + 24;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, st, 12, 800);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText((c.label || "STEP").toUpperCase(), tx, -h / 2 + 42);

    setFont(ctx, st, 20, 700);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    const lh = 27 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w / 2 - 30 - tx);
    drawLines(ctx, lines, tx, -h / 2 + 68, lh);
  },

  lesson_fact: (ctx, c, st, w, h) => {
    const pad = 40;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    setFont(ctx, st, 14, 800);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText(`💡 ${(c.label || "DID YOU KNOW?").toUpperCase()}`, 0, -h / 2 + 36);

    setFont(ctx, st, 20, 600);
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    const lh = 28 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - pad * 2);
    drawLines(ctx, lines, 0, -h / 2 + 74, lh);

    if (c.secondaryText) {
      setFont(ctx, st, 13, 500);
      ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.8);
      ctx.fillText(c.secondaryText, 0, h / 2 - 22);
    }
  },

  lesson_checklist: (ctx, c, st, w, h) => {
    const pad = 44;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    setFont(ctx, st, 13, 800);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.textBaseline = "alphabetic";
    ctx.fillText((c.label || "REMEMBER").toUpperCase(), -w / 2 + pad, -h / 2 + 36);

    const items = [c.item1, c.item2, c.item3, c.item4].filter(Boolean) as string[];
    ctx.textBaseline = "middle";
    const rowH = 38 * st.textScale * st.lineSpacing;
    const top = -h / 2 + 68;
    items.forEach((item, i) => {
      const y = top + i * rowH;
      // tick
      ctx.strokeStyle = rgba(st.accentColor, st.accentOpacity);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-w / 2 + pad, y);
      ctx.lineTo(-w / 2 + pad + 7, y + 7);
      ctx.lineTo(-w / 2 + pad + 19, y - 8);
      ctx.stroke();

      setFont(ctx, st, 17, 600);
      ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
      ctx.fillText(item, -w / 2 + pad + 32, y);
    });
  },

  // ------------------------------- titles
  title_art: (ctx, c, st, w, h, m) => {
    paintTitleArt(ctx, c.primaryText || "", st, w, -h * 0.12, m.type, m.templateId);
  },

  title_art_sub: (ctx, c, st, w, h, m) => {
    const r = paintTitleArt(ctx, c.primaryText || "", st, w, -h * 0.30, m.type, m.templateId);
    if (c.secondaryText) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      setFont(ctx, st, 19, 500);
      ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
      ctx.fillText(c.secondaryText, 0, -h * 0.30 + r.height + 34);
    }
  },

  title_art_kicker: (ctx, c, st, w, h, m) => {
    if (c.label) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      setFont(ctx, st, 15, 800);
      ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
      ctx.fillText(st.uppercaseLabel ? c.label.toUpperCase() : c.label, 0, -h * 0.30);
    }
    paintTitleArt(ctx, c.primaryText || "", st, w, -h * 0.30 + 22, m.type, m.templateId);
  },

  title_art_split: (ctx, c, st, w, h, m) => {
    const r = paintTitleArt(ctx, c.primaryText || "", st, w, -h * 0.16, m.type, m.templateId);
    // rules either side of the headline
    const half = Math.min(r.width / 2 + 34, w / 2 - 24);
    const y = -h * 0.16 + r.height / 2;
    ctx.strokeStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 28, y);
    ctx.lineTo(-half, y);
    ctx.moveTo(half, y);
    ctx.lineTo(w / 2 - 28, y);
    ctx.stroke();
  },

  lesson_stat: (ctx, c, st, w, h) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    setFont(ctx, st, 13, 800);
    ctx.fillStyle = rgba(st.accentColor, st.accentOpacity);
    ctx.fillText((c.label || "").toUpperCase(), 0, -h / 2 + 34);

    setFont(ctx, st, 66, 800);
    ctx.save();
    ctx.shadowColor = rgba(st.accentColor, 0.6 * st.glow);
    ctx.shadowBlur = 26 * st.glow;
    ctx.fillStyle = rgba(st.titleColor, st.titleOpacity);
    ctx.fillText(c.number || "87%", 0, -h / 2 + 112);
    ctx.restore();

    setFont(ctx, st, 18, 600);
    ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity);
    const lh = 25 * st.textScale * st.lineSpacing;
    const lines = wrap(ctx, c.primaryText || "", w - 80);
    drawLines(ctx, lines, 0, -h / 2 + 144, lh);

    if (c.secondaryText) {
      setFont(ctx, st, 11, 500);
      ctx.fillStyle = rgba(st.bodyColor, st.bodyOpacity * 0.65);
      ctx.fillText(c.secondaryText, 0, h / 2 - 20);
    }
  },
};

/** Pulls the card's text fields out of an insert's content bag. */
function contentOf(item: TimelineInsert, templateId: string): Record<string, string> {
  const def = TEMPLATE_BY_ID[templateId];
  const base: Record<string, string> = def ? { ...def.content } : {};
  const c = (item.content || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "string" && v.length > 0) base[k] = v;
  }
  // legacy field aliases
  if (typeof c.scriptureText === "string" && c.scriptureText) base.primaryText = c.scriptureText;
  if (typeof c.quoteText === "string" && c.quoteText) base.primaryText = c.quoteText;
  if (typeof c.speakerName === "string" && c.speakerName) base.primaryText = c.speakerName;
  if (typeof c.speakerRole === "string" && c.speakerRole) base.secondaryText = c.speakerRole;
  if (Array.isArray(c.items)) {
    (c.items as string[]).slice(0, 4).forEach((it, i) => {
      if (it) base[`item${i + 1}`] = it;
    });
  }
  return base;
}

/**
 * Main entry point. Draws the text card for a timeline insert.
 *
 * @param elapsed seconds since the insert appeared (drives the entrance)
 */
export function renderTextTemplate(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number,
  elapsed: number
) {
  const templateId = resolveTemplateId(
    (item.visualOptions?.templateId as string) || item.type
  );
  const def = TEMPLATE_BY_ID[templateId];
  if (!def) return;

  const style = resolveTemplateStyle(
    templateId,
    item.visualOptions?.templateStyle as Partial<TextTemplateStyle> | undefined
  );
  const content = contentOf(item, templateId);

  const fp = templateFootprint(def.layout, canvasWidth);
  const w = fp.w;
  const h = fp.h;

  const motion = computeTemplateMotion(style, elapsed, item.duration, w, h);
  motion.templateId = templateId;

  // Keep the card on screen. Wide cards (especially lower thirds) anchored to a
  // corner preset would otherwise hang off the frame edge.
  const halfW = (w * size) / 2;
  const margin = canvasWidth * 0.03;
  const minX = halfW + margin;
  const maxX = canvasWidth - halfW - margin;
  const drawX = maxX > minX ? Math.max(minX, Math.min(maxX, x)) : canvasWidth / 2;

  ctx.save();
  ctx.translate(drawX, y);
  ctx.scale(size, size);
  ctx.translate(motion.dx, motion.dy);
  if (motion.scale !== 1) ctx.scale(motion.scale, motion.scale);
  ctx.globalAlpha *= Math.max(0, Math.min(1, motion.alpha));

  // Wipe reveal clips everything, plate included
  if (motion.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2 - 40, w * motion.wipe, h + 80);
    ctx.clip();
  }

  paintPlate(ctx, -w / 2, -h / 2, w, h, style);

  // Text is clipped to the plate so long content can never bleed out
  ctx.save();
  platePath(ctx, -w / 2 - 40, -h / 2 - 40, w + 80, h + 80, style);
  ctx.clip();
  const layout = LAYOUTS[def.layout];
  if (layout) layout(ctx, content, style, w, h, motion);
  ctx.restore();

  ctx.restore();
}

/** Footprint used for hit-testing and the drag/resize handles. */
export function getTextTemplateBounds(
  item: TimelineInsert,
  canvasWidth: number
): { w: number; h: number } {
  const templateId = resolveTemplateId(
    (item.visualOptions?.templateId as string) || item.type
  );
  const def = TEMPLATE_BY_ID[templateId];
  const fp = templateFootprint(def ? def.layout : "quote_editorial", canvasWidth);
  const size = item.size || 1;
  return { w: fp.w * size, h: fp.h * size };
}
