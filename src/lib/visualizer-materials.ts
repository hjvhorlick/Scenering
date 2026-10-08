/**
 * Shared polished materials for Scenering audio visualisers.
 *
 * The renderers intentionally use these primitives rather than baking one-off
 * highlights into each style. A bar, radial spike or moving orb therefore has
 * the same transparent glass, coloured under-light and specular language in a
 * catalogue still, the live studio preview and the exported video.
 */
import { mixColors, rgba, roundRectPath } from "./visualizer-colors";

export interface SpacedBarLayout {
  count: number;
  slot: number;
  barWidth: number;
  gap: number;
}

/**
 * Keep racks legible as a material rather than a solid wall. We reduce an
 * over-dense requested count before shrinking a bar or its breathing room. The
 * caller can sample its analyser values across the returned count.
 */
export function resolveSpacedBarLayout(opts: {
  width: number;
  count: number;
  requestedWidth: number;
  requestedGap: number;
  minWidth?: number;
}): SpacedBarLayout {
  const width = positive(opts.width, 1);
  const minWidth = Math.max(0.75, finite(opts.minWidth, 1.5));
  const requestedWidth = Math.max(minWidth, finite(opts.requestedWidth, minWidth));
  const targetWidth = Math.max(minWidth, requestedWidth * 1.22);
  const targetGap = Math.max(1.35, finite(opts.requestedGap, 2) * 1.38, targetWidth * 0.3);
  const requestedCount = Math.max(1, Math.round(finite(opts.count, 1)));
  const maxCount = Math.max(1, Math.floor(width / Math.max(1, targetWidth + targetGap)));
  const count = Math.min(requestedCount, maxCount);
  const slot = width / count;
  const barWidth = Math.max(
    Math.min(minWidth, slot * 0.45),
    Math.min(targetWidth, Math.max(minWidth, slot - Math.min(targetGap, slot * 0.68)))
  );
  return { count, slot, barWidth, gap: Math.max(0, slot - barWidth) };
}

/** Sample a source analyser array at the middle of a displayed bar. */
export function sampleMaterialBand(values: Float32Array, index: number, count: number): number {
  if (!values.length || count <= 0) return 0;
  const position = ((index + 0.5) / count) * (values.length - 1);
  const low = Math.max(0, Math.min(values.length - 1, Math.floor(position)));
  const high = Math.max(0, Math.min(values.length - 1, Math.ceil(position)));
  const fraction = position - low;
  return (values[low] || 0) * (1 - fraction) + (values[high] || 0) * fraction;
}

/** A small coloured pool at an element's base, as if a light is shining up. */
export function drawBottomLight(
  ctx: CanvasRenderingContext2D,
  opts: {
    x?: number;
    y: number;
    width: number;
    height?: number;
    primary: string;
    secondary: string;
    accent?: string;
    intensity?: number;
  }
) {
  const intensity = clamp(finite(opts.intensity, 0.6), 0, 1);
  const width = positive(opts.width, 1);
  const height = Math.max(2, finite(opts.height, width * 0.32));
  if (intensity <= 0.01) return;
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.45);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, width * 0.72);
  glow.addColorStop(0, rgba(accent, 0.28 * intensity));
  glow.addColorStop(0.26, rgba(opts.primary, 0.2 * intensity));
  glow.addColorStop(0.64, rgba(opts.secondary, 0.08 * intensity));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.72, height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A clear, rounded vertical bar. Its inner gradient is deliberately brightest
 * at the base, then clears toward the tip, which gives every spectrum rack the
 * requested coloured-light-from-below treatment without hiding the footage.
 */
export function drawGlassBar(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    primary: string;
    secondary?: string;
    accent?: string;
    glow?: number;
    value?: number;
    roundness?: number;
    shine?: number;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const width = Math.max(1, positive(opts.width, 1));
  const height = Math.max(1, positive(opts.height, 1));
  const glow = clamp(finite(opts.glow, 0.55), 0, 1);
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const roundness = clamp(finite(opts.roundness, 1), 0, 1);
  const shine = clamp(finite(opts.shine, 0.86), 0, 1);
  const secondary = opts.secondary || opts.primary;
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.5);
  const radius = Math.min(width * 0.5, height * 0.5, width * (0.16 + roundness * 0.38));

  ctx.save();
  if (glow > 0.02) {
    ctx.shadowColor = rgba(opts.primary, 0.46 + value * 0.12);
    ctx.shadowBlur = (2 + value * 8) * glow * (1 - shine * 0.28);
  }
  const body = ctx.createLinearGradient(x, y + height, x, y);
  // Bottom: a saturated colour source. Top: a translucent clear-glass rim.
  body.addColorStop(0, rgba(mixColors(opts.primary, accent, 0.52), 0.92));
  body.addColorStop(0.14, rgba(opts.primary, 0.76));
  body.addColorStop(0.5, rgba(mixColors(opts.primary, secondary, 0.35), 0.48));
  body.addColorStop(0.82, rgba(mixColors(opts.primary, "#ffffff", 0.42), 0.36));
  body.addColorStop(1, rgba("#ffffff", 0.64));
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.clip();
  // Convex clear-glass bevel: white catchlight on the left, a faint shaded
  // far edge, and a thin top reflection.
  const bevel = ctx.createLinearGradient(x, 0, x + width, 0);
  bevel.addColorStop(0, rgba("#ffffff", 0.58 * shine));
  bevel.addColorStop(0.15, rgba("#ffffff", 0.2 * shine));
  bevel.addColorStop(0.44, "rgba(255, 255, 255, 0)");
  bevel.addColorStop(0.78, rgba("#000000", 0.16 * shine));
  bevel.addColorStop(1, rgba("#ffffff", 0.26 * shine));
  ctx.fillStyle = bevel;
  ctx.fillRect(x, y, width, height);
  const rise = ctx.createLinearGradient(x, y + height, x, y + height * 0.22);
  rise.addColorStop(0, rgba(accent, 0.28 * shine));
  rise.addColorStop(0.7, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = rise;
  ctx.fillRect(x, y + height * 0.2, width, height * 0.8);
  const top = ctx.createLinearGradient(x, y, x, y + Math.max(3, height * 0.32));
  top.addColorStop(0, rgba("#ffffff", 0.72 * shine));
  top.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(x + Math.max(0.7, width * 0.08), y + 0.5, Math.max(1, width * 0.84), Math.max(2, height * 0.35));
  ctx.restore();

  roundRectPath(ctx, x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1), Math.max(0, radius - 0.5));
  ctx.strokeStyle = rgba(mixColors(accent, "#ffffff", 0.5), 0.35 + shine * 0.42);
  ctx.lineWidth = Math.min(1.25, Math.max(0.65, width * 0.1));
  ctx.stroke();
  ctx.restore();
}

/** A transparent glossy sphere with its colour visibly rising from the base. */
export function drawGlassOrb(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    radius: number;
    primary: string;
    secondary?: string;
    accent?: string;
    glow?: number;
    value?: number;
    shine?: number;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const radius = Math.max(0.8, positive(opts.radius, 1));
  const glow = clamp(finite(opts.glow, 0.55), 0, 1);
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const shine = clamp(finite(opts.shine, 0.88), 0, 1);
  const secondary = opts.secondary || opts.primary;
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.5);

  ctx.save();
  if (glow > 0.02) {
    ctx.shadowColor = rgba(opts.primary, 0.44 + value * 0.16);
    ctx.shadowBlur = (2 + value * 10) * glow;
  }
  const shell = ctx.createRadialGradient(
    x - radius * 0.34,
    y - radius * 0.42,
    Math.max(0.5, radius * 0.04),
    x,
    y,
    radius
  );
  shell.addColorStop(0, rgba("#ffffff", 0.76));
  shell.addColorStop(0.14, rgba(mixColors(accent, "#ffffff", 0.36), 0.54));
  shell.addColorStop(0.46, rgba(opts.primary, 0.27));
  shell.addColorStop(0.78, rgba(secondary, 0.2));
  shell.addColorStop(1, rgba(opts.primary, 0.06));
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  const underlight = ctx.createLinearGradient(x, y + radius, x, y - radius);
  underlight.addColorStop(0, rgba(mixColors(opts.primary, accent, 0.58), 0.78));
  underlight.addColorStop(0.34, rgba(opts.primary, 0.34));
  underlight.addColorStop(0.78, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = underlight;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  // A curved high-side reflection reads more like glass than a flat dot.
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.26, y - radius * 0.32, radius * 0.34, radius * 0.15, -0.7, 0, Math.PI * 2);
  ctx.fillStyle = rgba("#ffffff", 0.52 * shine);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, radius - Math.min(0.5, radius * 0.1), 0, Math.PI * 2);
  ctx.strokeStyle = rgba(mixColors(accent, "#ffffff", 0.48), 0.4 + shine * 0.36);
  ctx.lineWidth = Math.max(0.55, radius * 0.11);
  ctx.stroke();
  ctx.restore();
}

/**
 * A glass version of a radial spike/bar. `baseX/baseY` is the point lit from
 * below (normally the ring itself), even when the spike grows inward.
 */
export function drawGlassRadialStroke(
  ctx: CanvasRenderingContext2D,
  opts: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    baseX: number;
    baseY: number;
    width: number;
    primary: string;
    accent: string;
    glow?: number;
    value?: number;
    shine?: number;
    round?: boolean;
  }
) {
  const x1 = finite(opts.x1, 0);
  const y1 = finite(opts.y1, 0);
  const x2 = finite(opts.x2, 0);
  const y2 = finite(opts.y2, 0);
  const width = Math.max(0.6, positive(opts.width, 1));
  const glow = clamp(finite(opts.glow, 0.5), 0, 1);
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const shine = clamp(finite(opts.shine, 0.86), 0, 1);
  const baseX = finite(opts.baseX, x1);
  const baseY = finite(opts.baseY, y1);
  const fromStart = Math.hypot(baseX - x1, baseY - y1) <= Math.hypot(baseX - x2, baseY - y2);
  const startX = fromStart ? x1 : x2;
  const startY = fromStart ? y1 : y2;
  const endX = fromStart ? x2 : x1;
  const endY = fromStart ? y2 : y1;
  const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
  gradient.addColorStop(0, rgba(mixColors(opts.primary, opts.accent, 0.56), 0.94));
  gradient.addColorStop(0.18, rgba(opts.primary, 0.76));
  gradient.addColorStop(0.64, rgba(opts.primary, 0.44));
  gradient.addColorStop(1, rgba("#ffffff", 0.7));
  ctx.save();
  if (glow > 0.02) {
    ctx.shadowColor = rgba(opts.primary, 0.56);
    ctx.shadowBlur = (2 + value * 9) * glow * (1 - shine * 0.25);
  }
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineCap = opts.round === false ? "butt" : "round";
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (shine > 0.03 && width > 1.2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = rgba("#ffffff", 0.2 + shine * 0.42);
    ctx.lineWidth = Math.max(0.55, width * 0.22);
    ctx.lineCap = opts.round === false ? "butt" : "round";
    ctx.stroke();
  }
  ctx.restore();
}

/** A four-point lustrous sparkle for gold, silver and opalescent pixie dust. */
export function drawLustrousSparkle(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    radius: number;
    primary: string;
    accent: string;
    glow?: number;
    rotation?: number;
    opacity?: number;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const radius = Math.max(0.6, positive(opts.radius, 1));
  const glow = clamp(finite(opts.glow, 0.5), 0, 1);
  const opacity = clamp(finite(opts.opacity, 1), 0, 1);
  const rotation = finite(opts.rotation, 0);
  ctx.save();
  ctx.globalAlpha *= opacity;
  if (glow > 0.02) {
    ctx.shadowColor = rgba(opts.primary, 0.8);
    ctx.shadowBlur = (2 + radius * 3) * glow;
  }
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const star = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  star.addColorStop(0, "rgba(255, 255, 255, 1)");
  star.addColorStop(0.26, rgba(opts.accent, 0.96));
  star.addColorStop(0.72, rgba(opts.primary, 0.65));
  star.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = star;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.quadraticCurveTo(radius * 0.18, -radius * 0.18, radius, 0);
  ctx.quadraticCurveTo(radius * 0.18, radius * 0.18, 0, radius);
  ctx.quadraticCurveTo(-radius * 0.18, radius * 0.18, -radius, 0);
  ctx.quadraticCurveTo(-radius * 0.18, -radius * 0.18, 0, -radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
