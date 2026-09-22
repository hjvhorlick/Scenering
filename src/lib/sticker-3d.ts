/**
 * 3D Sticker Renderer
 * ===================
 * Draws every sticker procedurally on the canvas instead of stamping a flat
 * emoji glyph or a static SVG. Building them out of primitives is what lets
 * them behave like objects: the extruded side wall, the contact shadow, the
 * specular highlight and the rim light are all re-computed every frame against
 * the current `facing` value from the motion engine, so as a sticker turns the
 * light genuinely travels across its surface.
 *
 * Each sticker is drawn in a nominal 200x200 box centred on the origin.
 */

import type { MotionState } from "./overlay-motion";

export interface StickerPaint {
  /** main body colour */
  base: string;
  /** lighter tone for the lit top-left */
  light: string;
  /** darker tone for the shaded bottom-right and the extruded wall */
  dark: string;
  /** glow / accent colour */
  accent: string;
}

export interface StickerDef {
  id: string;
  name: string;
  icon: string;
  group: "reactions" | "social" | "commerce" | "alerts" | "objects";
  blurb: string;
  palette: StickerPaint;
  /** motion that suits this shape best */
  defaultMotion: string;
}

// ---------------------------------------------------------------- palettes
const P = {
  gold: { base: "#FFC400", light: "#FFF3B0", dark: "#A85E00", accent: "#FFE066" },
  ruby: { base: "#FF2D55", light: "#FF9AAE", dark: "#8E0B27", accent: "#FF6B85" },
  flame: { base: "#FF7A18", light: "#FFD166", dark: "#8C2E00", accent: "#FFB703" },
  sky: { base: "#2D9CFF", light: "#A8D8FF", dark: "#0B4F8E", accent: "#6EC1FF" },
  emerald: { base: "#10C97F", light: "#8FF0C8", dark: "#046841", accent: "#4FE0A8" },
  violet: { base: "#8B5CF6", light: "#D3C2FF", dark: "#4526A8", accent: "#B79BFF" },
  rose: { base: "#FF4FA3", light: "#FFB3D6", dark: "#98185C", accent: "#FF85C0" },
  silver: { base: "#C9D3E0", light: "#FFFFFF", dark: "#6B7688", accent: "#E8EEF6" },
  ink: { base: "#2B3445", light: "#6C7A91", dark: "#11161F", accent: "#8FA3BF" },
  amber: { base: "#F59E0B", light: "#FDE68A", dark: "#92400E", accent: "#FCD34D" },
  cyan: { base: "#22D3EE", light: "#A5F3FC", dark: "#0E7490", accent: "#67E8F9" },
  lime: { base: "#A3E635", light: "#E4F8B5", dark: "#4D7C0F", accent: "#C7F04F" },
} as const;

const EMERALD: StickerPaint = P.emerald;

/** Every sticker available in the Stickers tab. */
export const STICKER_LIBRARY: StickerDef[] = [
  // ---- reactions ----
  { id: "star", name: "Gold Star", icon: "⭐", group: "reactions", blurb: "Bevelled five-point star in polished gold", palette: P.gold, defaultMotion: "spin_y" },
  { id: "heart", name: "Ruby Heart", icon: "❤️", group: "reactions", blurb: "Glossy heart with a soft inner glow", palette: P.ruby, defaultMotion: "heartbeat" },
  { id: "fire", name: "Flame", icon: "🔥", group: "reactions", blurb: "Layered flame with a hot white core", palette: P.flame, defaultMotion: "float" },
  { id: "thumbs_up", name: "Thumbs Up", icon: "👍", group: "reactions", blurb: "Chunky thumbs-up with rounded knuckles", palette: P.amber, defaultMotion: "bounce" },
  { id: "hundred", name: "100", icon: "💯", group: "reactions", blurb: "Bold hundred score with a double underline", palette: P.ruby, defaultMotion: "jelly" },
  { id: "clap", name: "Applause", icon: "👏", group: "reactions", blurb: "Clapping burst with radiating motion lines", palette: P.amber, defaultMotion: "shake" },
  { id: "sparkle", name: "Sparkle", icon: "✨", group: "reactions", blurb: "Four-point glint with lens flare", palette: P.cyan, defaultMotion: "rotate_flat" },
  { id: "crown", name: "Crown", icon: "👑", group: "reactions", blurb: "Jewelled crown with gem inlays", palette: P.gold, defaultMotion: "float" },

  // ---- social ----
  { id: "like_badge", name: "Like Badge", icon: "💙", group: "social", blurb: "Circular like button with a raised rim", palette: P.sky, defaultMotion: "pulse" },
  { id: "bell", name: "Notification Bell", icon: "🔔", group: "social", blurb: "Ringing bell with a live alert dot", palette: P.amber, defaultMotion: "swing" },
  { id: "verified", name: "Verified", icon: "✅", group: "social", blurb: "Scalloped verification badge with a tick", palette: P.sky, defaultMotion: "spin_y" },
  { id: "subscribe", name: "Subscribe", icon: "📺", group: "social", blurb: "Red subscribe pill with a bell", palette: P.ruby, defaultMotion: "pulse" },
  { id: "comment", name: "Comment", icon: "💬", group: "social", blurb: "Speech bubble with typing dots", palette: P.violet, defaultMotion: "wobble" },
  { id: "share", name: "Share", icon: "↗️", group: "social", blurb: "Share node graph with connecting arms", palette: P.cyan, defaultMotion: "float" },
  { id: "eye", name: "Views", icon: "👁️", group: "social", blurb: "Glossy eye with a reflective iris", palette: P.violet, defaultMotion: "spin_y" },

  // ---- commerce ----
  { id: "money", name: "Money", icon: "💰", group: "commerce", blurb: "Stacked coins with a dollar face", palette: P.lime, defaultMotion: "bounce" },
  { id: "tag", name: "Price Tag", icon: "🏷️", group: "commerce", blurb: "Angled sale tag with an eyelet", palette: P.rose, defaultMotion: "swing" },
  { id: "cart", name: "Cart", icon: "🛒", group: "commerce", blurb: "Shopping cart with rolling wheels", palette: P.sky, defaultMotion: "drift_in" },
  { id: "gift", name: "Gift", icon: "🎁", group: "commerce", blurb: "Wrapped box with a ribbon bow", palette: P.rose, defaultMotion: "jelly" },
  { id: "rocket", name: "Rocket", icon: "🚀", group: "commerce", blurb: "Rocket with fins and a live exhaust", palette: P.silver, defaultMotion: "float" },
  { id: "trending", name: "Trending Up", icon: "📈", group: "commerce", blurb: "Rising chart arrow on a plotted grid", palette: EMERALD, defaultMotion: "drift_in" },

  // ---- alerts ----
  { id: "warning", name: "Warning", icon: "⚠️", group: "alerts", blurb: "Hazard triangle with a bevelled edge", palette: P.amber, defaultMotion: "shake" },
  { id: "new_burst", name: "New Burst", icon: "🌟", group: "alerts", blurb: "Starburst flash reading NEW", palette: P.ruby, defaultMotion: "rotate_flat" },
  { id: "info", name: "Info", icon: "ℹ️", group: "alerts", blurb: "Round info disc with a raised glyph", palette: P.sky, defaultMotion: "spin_y" },
  { id: "question", name: "Question", icon: "❓", group: "alerts", blurb: "Question mark on a rounded plate", palette: P.violet, defaultMotion: "wobble" },
  { id: "arrow", name: "Pointer", icon: "👉", group: "alerts", blurb: "Solid chevron arrow with depth", palette: P.cyan, defaultMotion: "shake" },

  // ---- objects ----
  { id: "trophy", name: "Trophy", icon: "🏆", group: "objects", blurb: "Two-handled cup on a plinth", palette: P.gold, defaultMotion: "spin_y" },
  { id: "medal", name: "Medal", icon: "🥇", group: "objects", blurb: "Ribboned first-place medal", palette: P.gold, defaultMotion: "swing" },
  { id: "bulb", name: "Idea", icon: "💡", group: "objects", blurb: "Light bulb with a glowing filament", palette: P.amber, defaultMotion: "pulse" },
  { id: "camera", name: "Camera", icon: "📷", group: "objects", blurb: "Camera body with a glass lens barrel", palette: P.ink, defaultMotion: "tumble" },
  { id: "play", name: "Play Button", icon: "▶️", group: "objects", blurb: "Circular play button with a deep rim", palette: P.ruby, defaultMotion: "pulse" },
  { id: "clock", name: "Clock", icon: "⏰", group: "objects", blurb: "Alarm clock with sweeping hands", palette: P.silver, defaultMotion: "wobble" },
  { id: "lock", name: "Lock", icon: "🔒", group: "objects", blurb: "Padlock with a metal shackle", palette: P.ink, defaultMotion: "bounce" },
  { id: "diamond", name: "Diamond", icon: "💎", group: "objects", blurb: "Faceted gem that catches the light", palette: P.cyan, defaultMotion: "spin_y" },
];

export const STICKER_BY_ID: Record<string, StickerDef> = Object.fromEntries(
  STICKER_LIBRARY.map((s) => [s.id, s])
);

export const STICKER_GROUPS = [
  { id: "reactions", name: "Reactions", icon: "⭐" },
  { id: "social", name: "Social", icon: "💬" },
  { id: "commerce", name: "Commerce", icon: "💰" },
  { id: "alerts", name: "Alerts", icon: "⚠️" },
  { id: "objects", name: "Objects", icon: "🏆" },
] as const;

/** Legacy catalog types → new sticker ids, so existing projects keep working. */
export const LEGACY_STICKER_MAP: Record<string, string> = {
  emoji_star: "star",
  heart: "heart",
  emoji_fire: "fire",
  bell: "bell",
  check: "verified",
  verified: "verified",
  trophy: "trophy",
  sparkle: "sparkle",
  trending: "trending",
  camera: "camera",
  thumbsup: "thumbs_up",
  thumbs_up: "thumbs_up",
  play: "play",
  money: "money",
  subscribe: "subscribe",
  like: "like_badge",
  follow: "like_badge",
  share: "share",
  comment: "comment",
  warning: "warning",
  arrow: "arrow",
};

export function resolveStickerId(type: string | undefined): string {
  if (!type) return "star";
  if (STICKER_BY_ID[type]) return type;
  return LEGACY_STICKER_MAP[type] || "star";
}

// ---------------------------------------------------------------- helpers

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(
    b1 + (b2 - b1) * k
  )})`;
}

/** Rounded rect path (local helper so this module stands alone) */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/** Star polygon path */
function starPath(ctx: CanvasRenderingContext2D, points: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.85);
  ctx.bezierCurveTo(-s * 1.35, s * 0.05, -s * 0.72, -s * 0.92, 0, -s * 0.34);
  ctx.bezierCurveTo(s * 0.72, -s * 0.92, s * 1.35, s * 0.05, 0, s * 0.85);
  ctx.closePath();
}

/**
 * The core of the "3D" read: fills the current path, then paints a directional
 * light gradient, a specular hotspot that tracks `facing`, and a rim light on
 * the shaded side.
 */
function shadeBody(
  ctx: CanvasRenderingContext2D,
  paint: StickerPaint,
  facing: number,
  radius: number
) {
  // light comes from the upper-left; as the object turns the hotspot slides
  const lx = -radius * 0.34 - facing * radius * 0.42;
  const ly = -radius * 0.38;

  const g = ctx.createRadialGradient(lx, ly, radius * 0.06, 0, 0, radius * 1.18);
  g.addColorStop(0, paint.light);
  g.addColorStop(0.32, paint.base);
  g.addColorStop(0.78, mix(paint.base, paint.dark, 0.55));
  g.addColorStop(1, paint.dark);
  ctx.fillStyle = g;
  ctx.fill();

  // specular hotspot
  ctx.save();
  ctx.clip();
  const spec = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius * 0.55);
  spec.addColorStop(0, `rgba(255,255,255,${0.62 - Math.abs(facing) * 0.28})`);
  spec.addColorStop(0.45, "rgba(255,255,255,0.12)");
  spec.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);

  // rim light on the far side keeps the silhouette from going muddy
  const rim = ctx.createLinearGradient(-lx, -ly, lx, ly);
  rim.addColorStop(0, rgba(paint.accent, 0.5));
  rim.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = rim;
  ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);
  ctx.restore();
}

/**
 * Extruded side wall — the single biggest cue that the shape has thickness.
 * Draws the same path repeatedly, offset along the light direction.
 */
function extrude(
  ctx: CanvasRenderingContext2D,
  drawPath: () => void,
  depth: number,
  paint: StickerPaint,
  facing: number
) {
  const steps = Math.max(3, Math.round(depth));
  // the wall shows on whichever side is turning away from us
  const dx = (facing >= 0 ? 1 : -1) * Math.min(1, Math.abs(facing) * 1.4 + 0.25);
  for (let i = steps; i > 0; i--) {
    const k = i / steps;
    ctx.save();
    ctx.translate(dx * k * depth * 0.55, k * depth * 0.72);
    drawPath();
    ctx.fillStyle = mix(paint.dark, "#000000", 0.25 + k * 0.3);
    ctx.fill();
    ctx.restore();
  }
}

/** Soft contact shadow that grows as the object lifts off the video */
function contactShadow(ctx: CanvasRenderingContext2D, radius: number, lift: number, strength: number) {
  if (strength <= 0) return;
  const spread = 1 + lift * 0.9;
  ctx.save();
  ctx.translate(0, radius * 0.92 + lift * 14);
  ctx.scale(spread, 0.26 * spread);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, `rgba(0,0,0,${(0.5 - lift * 0.18) * strength})`);
  g.addColorStop(0.6, `rgba(0,0,0,${0.18 * strength})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ambient glow behind the sticker so it separates from busy footage */
function auraGlow(ctx: CanvasRenderingContext2D, radius: number, colour: string, strength: number) {
  if (strength <= 0) return;
  const g = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 1.5);
  g.addColorStop(0, rgba(colour, 0.34 * strength));
  g.addColorStop(0.6, rgba(colour, 0.1 * strength));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function boldText(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  y: number,
  fill: string,
  stroke?: string
) {
  ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (stroke) {
    ctx.lineWidth = size * 0.16;
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, 0, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, y);
}

// ---------------------------------------------------------------- shapes
// Each shape draws itself centred on the origin at roughly 160px across.

type ShapeFn = (
  ctx: CanvasRenderingContext2D,
  p: StickerPaint,
  facing: number,
  t: number
) => void;

const SHAPES: Record<string, ShapeFn> = {
  star: (ctx, p, f) => {
    const path = () => starPath(ctx, 5, 82, 34);
    extrude(ctx, path, 11, p, f);
    path();
    shadeBody(ctx, p, f, 82);
    // facet lines catch the eye as it spins
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 82, Math.sin(a) * 82);
      ctx.stroke();
    }
    ctx.restore();
  },

  heart: (ctx, p, f) => {
    const path = () => heartPath(ctx, 74);
    extrude(ctx, path, 12, p, f);
    path();
    shadeBody(ctx, p, f, 74);
    // glossy top-left bloom
    ctx.save();
    path();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-26 - f * 12, -30, 24, 16, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
    ctx.restore();
  },

  fire: (ctx, p, f, t) => {
    const flick = Math.sin(t * 9) * 0.06;
    // outer flame
    const outer = () => {
      ctx.beginPath();
      ctx.moveTo(0, 86);
      ctx.bezierCurveTo(-62, 44, -46, -18, -14, -52);
      ctx.bezierCurveTo(-12, -20, 6, -30, 4, -58);
      ctx.bezierCurveTo(34, -34, 58, 6, 44, 44);
      ctx.bezierCurveTo(36, 68, 18, 84, 0, 86);
      ctx.closePath();
    };
    extrude(ctx, outer, 10, p, f);
    ctx.save();
    ctx.scale(1 + flick, 1 - flick * 0.5);
    outer();
    shadeBody(ctx, p, f, 76);
    // inner hot core
    ctx.beginPath();
    ctx.moveTo(0, 74);
    ctx.bezierCurveTo(-28, 48, -22, 6, -2, -18);
    ctx.bezierCurveTo(12, 4, 28, 26, 20, 50);
    ctx.bezierCurveTo(14, 66, 8, 72, 0, 74);
    ctx.closePath();
    const core = ctx.createRadialGradient(0, 40, 4, 0, 30, 60);
    core.addColorStop(0, "#FFFFFF");
    core.addColorStop(0.4, "#FFE066");
    core.addColorStop(1, rgba(p.accent, 0.1));
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  },

  thumbs_up: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      // fist
      rr(ctx, -52, -6, 96, 76, 18);
      ctx.closePath();
    };
    const thumb = () => {
      ctx.beginPath();
      ctx.moveTo(-30, -4);
      ctx.bezierCurveTo(-30, -44, -6, -58, 4, -78);
      ctx.bezierCurveTo(24, -86, 32, -66, 24, -46);
      ctx.lineTo(18, -28);
      ctx.lineTo(50, -28);
      ctx.bezierCurveTo(66, -28, 66, -4, 50, -4);
      ctx.closePath();
    };
    extrude(ctx, path, 11, p, f);
    extrude(ctx, thumb, 11, p, f);
    path();
    shadeBody(ctx, p, f, 74);
    thumb();
    shadeBody(ctx, p, f, 74);
    // knuckle grooves
    ctx.strokeStyle = rgba(p.dark, 0.55);
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-40 + i * 26, 12);
      ctx.lineTo(-40 + i * 26, 62);
      ctx.stroke();
    }
  },

  hundred: (ctx, p, f) => {
    ctx.save();
    ctx.translate(0, -8);
    ctx.font = '900 74px system-ui, -apple-system, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // hand-rolled extrusion: the same glyph stamped back along the light axis
    for (let i = 10; i > 0; i--) {
      ctx.fillStyle = mix(p.dark, "#000000", 0.2 + i * 0.03);
      ctx.fillText("100", (f >= 0 ? 1 : -1) * i * 0.6, i * 0.85);
    }
    const g = ctx.createLinearGradient(0, -38, 0, 38);
    g.addColorStop(0, p.light);
    g.addColorStop(0.5, p.base);
    g.addColorStop(1, p.dark);
    ctx.fillStyle = g;
    ctx.fillText("100", 0, 0);
    // double underline
    ctx.strokeStyle = p.base;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-54, 48);
    ctx.lineTo(54, 48);
    ctx.moveTo(-46, 64);
    ctx.lineTo(46, 64);
    ctx.stroke();
    ctx.restore();
  },

  clap: (ctx, p, f, t) => {
    const spread = 6 + Math.abs(Math.sin(t * 8)) * 8;
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(dir * spread, 0);
      ctx.rotate(dir * 0.3);
      const path = () => rr(ctx, -34, -40, 62, 82, 22);
      extrude(ctx, path, 9, p, f);
      path();
      shadeBody(ctx, p, f, 60);
      ctx.strokeStyle = rgba(p.dark, 0.5);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-24 + i * 20, -28);
        ctx.lineTo(-24 + i * 20, 30);
        ctx.stroke();
      }
      ctx.restore();
    }
    // motion lines
    ctx.strokeStyle = rgba(p.accent, 0.85);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 74, Math.sin(a) * 74);
      ctx.lineTo(Math.cos(a) * 92, Math.sin(a) * 92);
      ctx.stroke();
    }
  },

  sparkle: (ctx, p, f, t) => {
    const pulse = 1 + Math.sin(t * 5) * 0.08;
    ctx.save();
    ctx.scale(pulse, pulse);
    const four = () => {
      ctx.beginPath();
      ctx.moveTo(0, -88);
      ctx.quadraticCurveTo(12, -18, 82, 0);
      ctx.quadraticCurveTo(12, 18, 0, 88);
      ctx.quadraticCurveTo(-12, 18, -82, 0);
      ctx.quadraticCurveTo(-12, -18, 0, -88);
      ctx.closePath();
    };
    extrude(ctx, four, 7, p, f);
    four();
    shadeBody(ctx, p, f, 82);
    // small companion glint
    ctx.save();
    ctx.translate(54, -50);
    ctx.scale(0.32, 0.32);
    four();
    ctx.fillStyle = rgba("#FFFFFF", 0.9);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  },

  crown: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-76, 44);
      ctx.lineTo(-64, -40);
      ctx.lineTo(-30, 4);
      ctx.lineTo(0, -56);
      ctx.lineTo(30, 4);
      ctx.lineTo(64, -40);
      ctx.lineTo(76, 44);
      ctx.closePath();
    };
    extrude(ctx, path, 12, p, f);
    path();
    shadeBody(ctx, p, f, 78);
    // base band
    ctx.save();
    rr(ctx, -78, 40, 156, 26, 9);
    const band = ctx.createLinearGradient(0, 40, 0, 66);
    band.addColorStop(0, p.light);
    band.addColorStop(1, p.dark);
    ctx.fillStyle = band;
    ctx.fill();
    ctx.restore();
    // gems
    const gems = ["#FF2D55", "#2D9CFF", "#10C97F"];
    gems.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(-40 + i * 40, 52, 8, 0, Math.PI * 2);
      const gg = ctx.createRadialGradient(-43 + i * 40, 49, 1, -40 + i * 40, 52, 9);
      gg.addColorStop(0, "#FFFFFF");
      gg.addColorStop(0.4, c);
      gg.addColorStop(1, mix(c, "#000000", 0.5));
      ctx.fillStyle = gg;
      ctx.fill();
    });
  },

  like_badge: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.arc(0, 0, 78, 0, Math.PI * 2);
    };
    extrude(ctx, path, 14, p, f);
    path();
    shadeBody(ctx, p, f, 78);
    // inner raised rim
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.strokeStyle = rgba("#FFFFFF", 0.35);
    ctx.lineWidth = 4;
    ctx.stroke();
    // thumb glyph
    ctx.save();
    ctx.scale(0.52, 0.52);
    ctx.translate(0, 6);
    SHAPES.thumbs_up(ctx, { ...p, base: "#FFFFFF", light: "#FFFFFF", dark: "#C9D9EC", accent: "#FFFFFF" }, f, 0);
    ctx.restore();
  },

  bell: (ctx, p, f, t) => {
    const swing = Math.sin(t * 8) * 0.07;
    ctx.save();
    ctx.rotate(swing);
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-58, 40);
      ctx.bezierCurveTo(-58, -14, -42, -46, 0, -58);
      ctx.bezierCurveTo(42, -46, 58, -14, 58, 40);
      ctx.closePath();
    };
    extrude(ctx, body, 12, p, f);
    body();
    shadeBody(ctx, p, f, 62);
    // lip + clapper
    rr(ctx, -70, 38, 140, 18, 9);
    ctx.fillStyle = mix(p.base, p.dark, 0.3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 66, 13, 0, Math.PI * 2);
    ctx.fillStyle = p.dark;
    ctx.fill();
    // top loop
    ctx.beginPath();
    ctx.arc(0, -62, 11, Math.PI, 0);
    ctx.lineWidth = 8;
    ctx.strokeStyle = mix(p.base, p.dark, 0.2);
    ctx.stroke();
    ctx.restore();
    // live alert dot
    ctx.beginPath();
    ctx.arc(52, -48, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#FF2D55";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4;
    ctx.stroke();
  },

  verified: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      const pts = 12;
      for (let i = 0; i < pts * 2; i++) {
        const r = i % 2 === 0 ? 80 : 66;
        const a = (i * Math.PI) / pts - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    extrude(ctx, path, 12, p, f);
    path();
    shadeBody(ctx, p, f, 80);
    // tick
    ctx.beginPath();
    ctx.moveTo(-30, 2);
    ctx.lineTo(-8, 26);
    ctx.lineTo(34, -24);
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.stroke();
    ctx.translate(0, -3);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 13;
    ctx.stroke();
  },

  subscribe: (ctx, p, f) => {
    const w = 190;
    const h = 66;
    const path = () => rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    extrude(ctx, path, 10, p, f);
    path();
    shadeBody(ctx, p, f, 95);
    boldText(ctx, "SUBSCRIBE", 24, 1, "#FFFFFF", "rgba(0,0,0,0.25)");
  },

  comment: (ctx, p, f, t) => {
    const path = () => {
      ctx.beginPath();
      rr(ctx, -80, -62, 160, 104, 26);
      ctx.moveTo(-26, 40);
      ctx.lineTo(-10, 78);
      ctx.lineTo(8, 40);
      ctx.closePath();
    };
    extrude(ctx, path, 11, p, f);
    path();
    shadeBody(ctx, p, f, 82);
    // typing dots
    for (let i = 0; i < 3; i++) {
      const bob = Math.sin(t * 6 - i * 0.7) * 5;
      ctx.beginPath();
      ctx.arc(-34 + i * 34, -8 + bob, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
    }
  },

  share: (ctx, p, f) => {
    const nodes: [number, number, number][] = [
      [40, -52, 22],
      [40, 52, 22],
      [-46, 0, 26],
    ];
    ctx.strokeStyle = mix(p.base, p.dark, 0.25);
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.lineTo(40, -52);
    ctx.moveTo(-46, 0);
    ctx.lineTo(40, 52);
    ctx.stroke();
    nodes.forEach(([nx, ny, r]) => {
      ctx.save();
      ctx.translate(nx, ny);
      const path = () => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
      };
      extrude(ctx, path, 9, p, f);
      path();
      shadeBody(ctx, p, f, r);
      ctx.restore();
    });
  },

  eye: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-86, 0);
      ctx.quadraticCurveTo(0, -70, 86, 0);
      ctx.quadraticCurveTo(0, 70, -86, 0);
      ctx.closePath();
    };
    extrude(ctx, path, 10, p, f);
    path();
    shadeBody(ctx, p, f, 80);
    ctx.save();
    path();
    ctx.clip();
    // iris follows the turn, which sells the volume
    const ix = f * 22;
    ctx.beginPath();
    ctx.arc(ix, 0, 32, 0, Math.PI * 2);
    const ig = ctx.createRadialGradient(ix - 8, -8, 2, ix, 0, 34);
    ig.addColorStop(0, p.light);
    ig.addColorStop(0.5, p.base);
    ig.addColorStop(1, p.dark);
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#0B0F19";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix - 11, -11, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.restore();
  },

  money: (ctx, p, f) => {
    // stacked coins
    for (let i = 2; i >= 0; i--) {
      ctx.save();
      ctx.translate(0, 26 - i * 24);
      ctx.scale(1, 0.4);
      const path = () => {
        ctx.beginPath();
        ctx.arc(0, 0, 70, 0, Math.PI * 2);
      };
      if (i === 0) {
        path();
        shadeBody(ctx, p, f, 70);
      } else {
        path();
        ctx.fillStyle = mix(p.base, p.dark, 0.2 + i * 0.16);
        ctx.fill();
      }
      ctx.restore();
      // coin edge
      ctx.save();
      ctx.translate(0, 26 - i * 24);
      ctx.fillStyle = mix(p.dark, "#000000", 0.15);
      ctx.fillRect(-70, 0, 140, 12);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(0, -22);
    boldText(ctx, "$", 52, 0, p.light, mix(p.dark, "#000000", 0.3));
    ctx.restore();
  },

  tag: (ctx, p, f) => {
    ctx.save();
    ctx.rotate(-0.35);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-70, -46);
      ctx.lineTo(24, -46);
      ctx.lineTo(76, 0);
      ctx.lineTo(24, 46);
      ctx.lineTo(-70, 46);
      ctx.quadraticCurveTo(-82, 46, -82, 34);
      ctx.lineTo(-82, -34);
      ctx.quadraticCurveTo(-82, -46, -70, -46);
      ctx.closePath();
    };
    extrude(ctx, path, 11, p, f);
    path();
    shadeBody(ctx, p, f, 80);
    // eyelet
    ctx.beginPath();
    ctx.arc(38, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.strokeStyle = rgba("#FFFFFF", 0.5);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(-22, 0);
    boldText(ctx, "SALE", 30, 0, "#FFFFFF", "rgba(0,0,0,0.3)");
    ctx.restore();
    ctx.restore();
  },

  cart: (ctx, p, f) => {
    const basket = () => {
      ctx.beginPath();
      ctx.moveTo(-54, -28);
      ctx.lineTo(76, -28);
      ctx.lineTo(56, 34);
      ctx.lineTo(-34, 34);
      ctx.closePath();
    };
    extrude(ctx, basket, 11, p, f);
    basket();
    shadeBody(ctx, p, f, 72);
    // handle
    ctx.strokeStyle = mix(p.base, p.dark, 0.3);
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-84, -56);
    ctx.lineTo(-58, -56);
    ctx.lineTo(-40, 6);
    ctx.stroke();
    // wheels
    [-16, 42].forEach((wx) => {
      ctx.beginPath();
      ctx.arc(wx, 58, 14, 0, Math.PI * 2);
      const wg = ctx.createRadialGradient(wx - 4, 54, 1, wx, 58, 15);
      wg.addColorStop(0, "#8A94A6");
      wg.addColorStop(1, "#1B2130");
      ctx.fillStyle = wg;
      ctx.fill();
    });
  },

  gift: (ctx, p, f) => {
    const box = () => rr(ctx, -70, -34, 140, 100, 12);
    extrude(ctx, box, 12, p, f);
    box();
    shadeBody(ctx, p, f, 78);
    // lid
    const lid = () => rr(ctx, -80, -58, 160, 32, 10);
    lid();
    const lg = ctx.createLinearGradient(0, -58, 0, -26);
    lg.addColorStop(0, p.light);
    lg.addColorStop(1, mix(p.base, p.dark, 0.3));
    ctx.fillStyle = lg;
    ctx.fill();
    // ribbon
    ctx.fillStyle = rgba(p.accent, 0.95);
    ctx.fillRect(-14, -58, 28, 124);
    // bow
    [-1, 1].forEach((d) => {
      ctx.beginPath();
      ctx.ellipse(d * 26, -68, 24, 16, d * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.strokeStyle = rgba("#000000", 0.2);
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  },

  rocket: (ctx, p, f, t) => {
    // exhaust first so the body sits over it
    const flare = 0.75 + Math.abs(Math.sin(t * 14)) * 0.45;
    ctx.save();
    ctx.translate(0, 62);
    ctx.scale(1, flare);
    const eg = ctx.createRadialGradient(0, 0, 2, 0, 16, 46);
    eg.addColorStop(0, "#FFFFFF");
    eg.addColorStop(0.35, "#FFD166");
    eg.addColorStop(0.7, "#FF7A18");
    eg.addColorStop(1, "rgba(255,122,24,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(0, 74, 22, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // fins
    [-1, 1].forEach((d) => {
      ctx.beginPath();
      ctx.moveTo(d * 20, 20);
      ctx.lineTo(d * 62, 58);
      ctx.lineTo(d * 22, 58);
      ctx.closePath();
      ctx.fillStyle = mix("#FF2D55", "#8E0B27", 0.2);
      ctx.fill();
    });
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(0, -88);
      ctx.bezierCurveTo(34, -46, 34, 14, 26, 58);
      ctx.lineTo(-26, 58);
      ctx.bezierCurveTo(-34, 14, -34, -46, 0, -88);
      ctx.closePath();
    };
    extrude(ctx, body, 10, p, f);
    body();
    shadeBody(ctx, p, f, 62);
    // nose cone
    ctx.beginPath();
    ctx.moveTo(0, -88);
    ctx.bezierCurveTo(22, -62, 26, -46, 26, -40);
    ctx.lineTo(-26, -40);
    ctx.bezierCurveTo(-26, -46, -22, -62, 0, -88);
    ctx.closePath();
    ctx.fillStyle = mix("#FF2D55", "#8E0B27", 0.15);
    ctx.fill();
    // porthole
    ctx.beginPath();
    ctx.arc(0, -6, 19, 0, Math.PI * 2);
    const pg = ctx.createRadialGradient(-6, -12, 1, 0, -6, 20);
    pg.addColorStop(0, "#DFF6FF");
    pg.addColorStop(0.6, "#2D9CFF");
    pg.addColorStop(1, "#0B4F8E");
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = rgba("#FFFFFF", 0.7);
    ctx.lineWidth = 4;
    ctx.stroke();
  },

  trending: (ctx, p, f) => {
    // plotted grid
    ctx.strokeStyle = rgba("#FFFFFF", 0.16);
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-78, -56 + i * 30);
      ctx.lineTo(78, -56 + i * 30);
      ctx.stroke();
    }
    const arrow = () => {
      ctx.beginPath();
      ctx.moveTo(-70, 52);
      ctx.lineTo(-20, 0);
      ctx.lineTo(8, 26);
      ctx.lineTo(56, -34);
      ctx.lineTo(56, -8);
      ctx.lineTo(80, -50);
      ctx.lineTo(34, -56);
      ctx.lineTo(50, -40);
      ctx.lineTo(10, 0);
      ctx.lineTo(-18, -26);
      ctx.lineTo(-84, 40);
      ctx.closePath();
    };
    extrude(ctx, arrow, 10, p, f);
    arrow();
    shadeBody(ctx, p, f, 82);
  },

  warning: (ctx, p, f) => {
    const tri = () => {
      ctx.beginPath();
      ctx.moveTo(0, -80);
      ctx.lineTo(86, 62);
      ctx.lineTo(-86, 62);
      ctx.closePath();
    };
    extrude(ctx, tri, 13, p, f);
    tri();
    shadeBody(ctx, p, f, 84);
    boldText(ctx, "!", 76, 16, "#1A1206", "rgba(255,255,255,0.35)");
  },

  new_burst: (ctx, p, f) => {
    const path = () => starPath(ctx, 12, 88, 62);
    extrude(ctx, path, 10, p, f);
    path();
    shadeBody(ctx, p, f, 88);
    boldText(ctx, "NEW", 32, 0, "#FFFFFF", "rgba(0,0,0,0.28)");
  },

  info: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.arc(0, 0, 78, 0, Math.PI * 2);
    };
    extrude(ctx, path, 13, p, f);
    path();
    shadeBody(ctx, p, f, 78);
    boldText(ctx, "i", 82, 4, "#FFFFFF", "rgba(0,0,0,0.25)");
  },

  question: (ctx, p, f) => {
    const path = () => rr(ctx, -72, -72, 144, 144, 34);
    extrude(ctx, path, 13, p, f);
    path();
    shadeBody(ctx, p, f, 78);
    boldText(ctx, "?", 86, 4, "#FFFFFF", "rgba(0,0,0,0.25)");
  },

  arrow: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-72, -34);
      ctx.lineTo(10, -34);
      ctx.lineTo(10, -64);
      ctx.lineTo(82, 0);
      ctx.lineTo(10, 64);
      ctx.lineTo(10, 34);
      ctx.lineTo(-72, 34);
      ctx.closePath();
    };
    extrude(ctx, path, 12, p, f);
    path();
    shadeBody(ctx, p, f, 80);
  },

  trophy: (ctx, p, f) => {
    const cup = () => {
      ctx.beginPath();
      ctx.moveTo(-46, -62);
      ctx.lineTo(46, -62);
      ctx.lineTo(38, 4);
      ctx.quadraticCurveTo(34, 30, 0, 30);
      ctx.quadraticCurveTo(-34, 30, -38, 4);
      ctx.closePath();
    };
    // handles
    [-1, 1].forEach((d) => {
      ctx.beginPath();
      ctx.ellipse(d * 60, -34, 22, 28, 0, 0, Math.PI * 2);
      ctx.lineWidth = 12;
      ctx.strokeStyle = mix(p.base, p.dark, 0.25);
      ctx.stroke();
    });
    extrude(ctx, cup, 12, p, f);
    cup();
    shadeBody(ctx, p, f, 62);
    // stem + plinth
    ctx.fillStyle = mix(p.base, p.dark, 0.35);
    ctx.fillRect(-12, 30, 24, 26);
    rr(ctx, -46, 54, 92, 22, 8);
    const bg = ctx.createLinearGradient(0, 54, 0, 76);
    bg.addColorStop(0, mix(p.base, p.dark, 0.15));
    bg.addColorStop(1, p.dark);
    ctx.fillStyle = bg;
    ctx.fill();
    // star engraving
    ctx.save();
    ctx.translate(0, -24);
    ctx.scale(0.26, 0.26);
    starPath(ctx, 5, 82, 34);
    ctx.fillStyle = rgba("#FFFFFF", 0.45);
    ctx.fill();
    ctx.restore();
  },

  medal: (ctx, p, f) => {
    // ribbons
    [-1, 1].forEach((d) => {
      ctx.beginPath();
      ctx.moveTo(d * 12, -86);
      ctx.lineTo(d * 52, -86);
      ctx.lineTo(d * 26, -6);
      ctx.lineTo(d * 2, -26);
      ctx.closePath();
      ctx.fillStyle = d < 0 ? "#2D9CFF" : "#FF2D55";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    const path = () => {
      ctx.beginPath();
      ctx.arc(0, 26, 58, 0, Math.PI * 2);
    };
    extrude(ctx, path, 12, p, f);
    path();
    shadeBody(ctx, p, f, 58);
    ctx.save();
    ctx.translate(0, 26);
    boldText(ctx, "1", 56, 0, p.light, mix(p.dark, "#000000", 0.3));
    ctx.restore();
  },

  bulb: (ctx, p, f, t) => {
    const glow = 0.6 + Math.abs(Math.sin(t * 3)) * 0.4;
    auraGlow(ctx, 80, p.accent, glow);
    const glass = () => {
      ctx.beginPath();
      ctx.arc(0, -18, 56, Math.PI * 0.86, Math.PI * 0.14);
      ctx.lineTo(24, 36);
      ctx.lineTo(-24, 36);
      ctx.closePath();
    };
    extrude(ctx, glass, 9, p, f);
    glass();
    shadeBody(ctx, p, f, 58);
    // filament
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + glow * 0.4})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-14, 20);
    ctx.lineTo(-8, -14);
    ctx.lineTo(0, 2);
    ctx.lineTo(8, -14);
    ctx.lineTo(14, 20);
    ctx.stroke();
    // screw base
    rr(ctx, -24, 36, 48, 36, 7);
    const sg = ctx.createLinearGradient(-24, 0, 24, 0);
    sg.addColorStop(0, "#6B7688");
    sg.addColorStop(0.45, "#D3DBE6");
    sg.addColorStop(1, "#5A6474");
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-24, 44 + i * 10);
      ctx.lineTo(24, 44 + i * 10);
      ctx.stroke();
    }
  },

  camera: (ctx, p, f) => {
    const body = () => rr(ctx, -84, -44, 168, 104, 18);
    extrude(ctx, body, 13, p, f);
    body();
    shadeBody(ctx, p, f, 88);
    // top hump
    rr(ctx, -34, -62, 68, 24, 8);
    ctx.fillStyle = mix(p.base, p.dark, 0.25);
    ctx.fill();
    // lens barrel
    ctx.beginPath();
    ctx.arc(0, 10, 42, 0, Math.PI * 2);
    ctx.fillStyle = "#0D1117";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 10, 32, 0, Math.PI * 2);
    const lg = ctx.createRadialGradient(-12 - f * 8, -2, 2, 0, 10, 34);
    lg.addColorStop(0, "#BFEAFF");
    lg.addColorStop(0.35, "#2D9CFF");
    lg.addColorStop(0.75, "#123A6B");
    lg.addColorStop(1, "#05101F");
    ctx.fillStyle = lg;
    ctx.fill();
    // glass glint tracks the turn
    ctx.beginPath();
    ctx.ellipse(-13 - f * 9, -3, 11, 7, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
    // flash
    ctx.beginPath();
    ctx.arc(58, -22, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#FFE066";
    ctx.fill();
  },

  play: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.arc(0, 0, 80, 0, Math.PI * 2);
    };
    extrude(ctx, path, 14, p, f);
    path();
    shadeBody(ctx, p, f, 80);
    // deep inner rim
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 6;
    ctx.stroke();
    // triangle
    ctx.beginPath();
    ctx.moveTo(-22, -34);
    ctx.lineTo(40, 0);
    ctx.lineTo(-22, 34);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();
    ctx.save();
    ctx.translate(0, -3);
    ctx.beginPath();
    ctx.moveTo(-22, -34);
    ctx.lineTo(40, 0);
    ctx.lineTo(-22, 34);
    ctx.closePath();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
  },

  clock: (ctx, p, f, t) => {
    // bells
    [-1, 1].forEach((d) => {
      ctx.beginPath();
      ctx.arc(d * 52, -58, 20, 0, Math.PI * 2);
      ctx.fillStyle = mix(p.base, p.dark, 0.3);
      ctx.fill();
    });
    const path = () => {
      ctx.beginPath();
      ctx.arc(0, 0, 74, 0, Math.PI * 2);
    };
    extrude(ctx, path, 13, p, f);
    path();
    shadeBody(ctx, p, f, 74);
    // face
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.fillStyle = "#F7FAFF";
    ctx.fill();
    ctx.strokeStyle = rgba(p.dark, 0.35);
    ctx.lineWidth = 3;
    ctx.stroke();
    // ticks
    ctx.strokeStyle = "#39435A";
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 48);
      ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 56);
      ctx.stroke();
    }
    // sweeping hands
    ctx.lineCap = "round";
    ctx.strokeStyle = "#11161F";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(t * 0.9 - Math.PI / 2) * 32, Math.sin(t * 0.9 - Math.PI / 2) * 32);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#FF2D55";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(t * 3.2 - Math.PI / 2) * 46, Math.sin(t * 3.2 - Math.PI / 2) * 46);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#11161F";
    ctx.fill();
  },

  lock: (ctx, p, f) => {
    // shackle
    ctx.beginPath();
    ctx.arc(0, -34, 36, Math.PI, 0);
    ctx.lineWidth = 16;
    ctx.strokeStyle = "#9AA6B8";
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#D7DEE9";
    ctx.beginPath();
    ctx.arc(0, -34, 36, Math.PI, 0);
    ctx.stroke();
    const body = () => rr(ctx, -62, -12, 124, 96, 18);
    extrude(ctx, body, 13, p, f);
    body();
    shadeBody(ctx, p, f, 70);
    // keyhole
    ctx.beginPath();
    ctx.arc(0, 24, 13, 0, Math.PI * 2);
    ctx.fillStyle = "#FFC400";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, 26);
    ctx.lineTo(6, 26);
    ctx.lineTo(4, 56);
    ctx.lineTo(-4, 56);
    ctx.closePath();
    ctx.fill();
  },

  diamond: (ctx, p, f) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, -62);
      ctx.lineTo(74, -14);
      ctx.lineTo(0, 78);
      ctx.lineTo(-74, -14);
      ctx.closePath();
    };
    extrude(ctx, path, 10, p, f);
    path();
    shadeBody(ctx, p, f, 76);
    // facets — redrawn each frame against `facing` so they flash while spinning
    ctx.save();
    path();
    ctx.clip();
    const facets: [number, number][][] = [
      [[0, -62], [-74, -14], [0, -14]],
      [[0, -62], [74, -14], [0, -14]],
      [[-74, -14], [0, 78], [0, -14]],
      [[74, -14], [0, 78], [0, -14]],
    ];
    facets.forEach((tri, i) => {
      ctx.beginPath();
      ctx.moveTo(tri[0][0], tri[0][1]);
      ctx.lineTo(tri[1][0], tri[1][1]);
      ctx.lineTo(tri[2][0], tri[2][1]);
      ctx.closePath();
      const bright = 0.12 + Math.abs(Math.sin(f * 2 + i * 1.4)) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${bright})`;
      ctx.fill();
    });
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-74, -14);
    ctx.lineTo(74, -14);
    ctx.stroke();
    ctx.restore();
  },
};

export interface DrawStickerOptions {
  /** current motion state (drives lighting + depth) */
  motion: MotionState;
  /** seconds since the sticker appeared, for shape-internal animation */
  time: number;
  /** override the palette's base colour */
  tint?: string | null;
  /** 0-1 contact shadow strength (default 0.85) */
  shadow?: number;
  /** 0-1 ambient glow strength (default 0.35) */
  glow?: number;
}

/**
 * Draws a sticker centred on the current origin. The caller is expected to
 * have translated to the sticker's position and applied the motion transform.
 */
export function drawSticker(
  ctx: CanvasRenderingContext2D,
  stickerId: string,
  opts: DrawStickerOptions
) {
  const def = STICKER_BY_ID[resolveStickerId(stickerId)];
  if (!def) return;

  let paint = def.palette;
  if (opts.tint) {
    paint = {
      base: opts.tint,
      light: mix(opts.tint, "#FFFFFF", 0.55),
      dark: mix(opts.tint, "#000000", 0.5),
      accent: mix(opts.tint, "#FFFFFF", 0.3),
    };
  }

  const m = opts.motion;
  const shape = SHAPES[def.id];
  if (!shape) return;

  // contact shadow and glow live in un-rotated space so they stay grounded
  ctx.save();
  contactShadow(ctx, 86, m.lift, opts.shadow ?? 0.85);
  auraGlow(ctx, 78, paint.accent, opts.glow ?? 0.35);
  ctx.restore();

  ctx.save();
  // seeing the back of a turning sticker mirrors the artwork
  if (m.backface) ctx.scale(-1, 1);
  shape(ctx, paint, m.facing, opts.time);
  ctx.restore();
}
