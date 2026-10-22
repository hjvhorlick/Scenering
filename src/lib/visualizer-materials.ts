/**
 * Shared polished materials for Scenering audio visualisers.
 *
 * The renderers intentionally use these primitives rather than baking one-off
 * highlights into each style. A bar, radial spike or moving orb therefore has
 * the same glass, chrome, coloured under-light and specular language in a
 * catalogue still, the live studio preview and the exported video.
 *
 * Two materials, both always crisp:
 *
 *   glass   transparent, with a sharp rim and a thin specular band. `frost`
 *           moves it between crystal clear (0) and sandblasted (1), and
 *           `transparency` controls how much of the footage shows through.
 *   chrome  polished chrome — bright specular bands over a dark reflection.
 *           It is never dull: there is no "matte metal" setting anywhere, so
 *           a metal look always reads as chrome.
 *
 * Nothing here paints with a big `shadowBlur` on the shape itself. Blur is what
 * made the glass look fuzzy; the soft light belongs in `drawBloomHalo` and
 * `drawBottomLight`, which sit *behind* the crisp material.
 */
import { mixColors, rgba, roundRectPath } from "./visualizer-colors";

export interface SpacedBarLayout {
  count: number;
  slot: number;
  barWidth: number;
  gap: number;
}

/** Which material a visualiser is drawn in. */
export type VisualizerMaterial = "glass" | "chrome";

/**
 * The shared glass/chrome finish controls.
 *
 * `frost` is the sandblast dial: 0 is crystal clear, 1 is fully sandblasted
 * (diffuse, softly lit). `transparency` is how much of the picture behind the
 * material survives: 1 is almost pure light, 0 is a solid piece of glass.
 */
export interface MaterialFinish {
  material?: VisualizerMaterial;
  transparency?: number;
  frost?: number;
}

export interface ResolvedMaterialFinish {
  material: VisualizerMaterial;
  transparency: number;
  frost: number;
  /** true when the chrome material should be used. */
  chrome: boolean;
}

export function resolveMaterialFinish(opts: MaterialFinish | undefined): ResolvedMaterialFinish {
  const material: VisualizerMaterial = opts?.material === "chrome" ? "chrome" : "glass";
  return {
    material,
    transparency: clamp(finite(opts?.transparency, 0.78), 0.15, 1),
    frost: clamp(finite(opts?.frost, 0), 0, 1),
    chrome: material === "chrome",
  };
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

/**
 * A painterly bloom: three additive halos of different sizes.
 *
 * This is deliberately not a `shadowBlur`. A shadow fuzzes the shape that
 * casts it; a bloom is light *around* the shape and leaves every edge sharp.
 * `strength` is the user's bloom slider, so 0 draws nothing at all.
 */
export function drawBloomHalo(
  ctx: CanvasRenderingContext2D,
  opts: {
    x?: number;
    y?: number;
    radius: number;
    primary: string;
    accent?: string;
    secondary?: string;
    strength?: number;
  }
) {
  // A little goes a long way: the slider is perceptual, so even a third of the
  // way up is a bloom you can clearly see.
  const strength = Math.pow(clamp(finite(opts.strength, 0.5), 0, 1), 0.72);
  const radius = positive(opts.radius, 1);
  if (strength <= 0.02 || radius <= 1) return;
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.45);
  const secondary = opts.secondary || opts.primary;
  // Inner core plus two outer rings. The inner halo carries the brightest
  // light, so a raised bloom slider is unmistakable on screen.
  const rings: Array<{ scale: number; core: string; mid: string; alpha: number }> = [
    {
      scale: 1,
      core: rgba(mixColors(accent, "#ffffff", 0.5), 0.5 * strength),
      mid: rgba(opts.primary, 0.24 * strength),
      alpha: 1,
    },
    {
      scale: 1.45,
      core: rgba(opts.primary, 0.3 * strength),
      mid: rgba(secondary, 0.12 * strength),
      alpha: 1,
    },
    {
      scale: 2.05,
      core: rgba(opts.primary, 0.16 * strength),
      mid: rgba(secondary, 0.05 * strength),
      alpha: 1,
    },
  ];
  const inheritedAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const ring of rings) {
    const r = radius * ring.scale;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, ring.core);
    g.addColorStop(0.4, ring.mid);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = inheritedAlpha * ring.alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A light shining up from below: a bright pool at the base, a short shaft of
 * light climbing out of it and a hot core where the two meet.
 *
 * The previous version was a faint ellipse that disappeared under the
 * footage. This one is additive with a white-hot centre, so "light from
 * below" is a look you can actually see, and the strength is one slider.
 */
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
  const intensity = clamp(finite(opts.intensity, 0.7), 0, 1);
  const width = positive(opts.width, 1);
  const height = Math.max(2, finite(opts.height, width * 0.34));
  if (intensity <= 0.01) return;
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.55);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // ---- shaft of light climbing out of the pool -------------------------
  const shaftH = Math.max(height * 1.6, width * 0.5);
  const shaft = ctx.createLinearGradient(x, y, x, y - shaftH);
  shaft.addColorStop(0, rgba(mixColors(accent, "#ffffff", 0.4), 0.34 * intensity));
  shaft.addColorStop(0.45, rgba(accent, 0.16 * intensity));
  shaft.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shaft;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.34, y);
  ctx.quadraticCurveTo(x - width * 0.2, y - shaftH * 0.55, x - width * 0.06, y - shaftH);
  ctx.lineTo(x + width * 0.06, y - shaftH);
  ctx.quadraticCurveTo(x + width * 0.2, y - shaftH * 0.55, x + width * 0.34, y);
  ctx.closePath();
  ctx.fill();

  // ---- the pool on the surface ----------------------------------------
  const glow = ctx.createRadialGradient(x, y, 0, x, y, width * 0.72);
  glow.addColorStop(0, rgba(mixColors(accent, "#ffffff", 0.55), 0.62 * intensity));
  glow.addColorStop(0.24, rgba(opts.primary, 0.4 * intensity));
  glow.addColorStop(0.62, rgba(opts.secondary, 0.16 * intensity));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y, width * 0.72, height, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- white-hot core --------------------------------------------------
  const core = ctx.createRadialGradient(x, y, 0, x, y, Math.max(2, height * 0.9));
  core.addColorStop(0, rgba("#ffffff", 0.7 * intensity));
  core.addColorStop(0.55, rgba(accent, 0.34 * intensity));
  core.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(3, width * 0.16), Math.max(2, height * 0.62), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * A clear, rounded vertical bar.
 *
 * The body is genuinely transparent (the footage shows through it), the rim is
 * a sharp 1px line rather than a blurred glow, and a thin specular band and
 * bottom-lit hot spot give it volume. `frost` turns the same shape into
 * sandblasted glass, and `material: "chrome"` swaps it for polished chrome.
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
    /**
     * 0.15–1: how much of the picture stays visible through the body. 1 is a
     * thin, almost invisible pane; 0.15 is a thick solid block of glass.
     */
    transparency?: number;
    /** 0 = crystal clear, 1 = sandblasted. */
    frost?: number;
    material?: VisualizerMaterial;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const width = Math.max(1, positive(opts.width, 1));
  const height = Math.max(1, positive(opts.height, 1));
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const roundness = clamp(finite(opts.roundness, 1), 0, 1);
  const shine = clamp(finite(opts.shine, 0.86), 0, 1);
  const finish = resolveMaterialFinish(opts);
  const secondary = opts.secondary || opts.primary;
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.5);
  const radius = Math.min(width * 0.5, height * 0.5, width * (0.16 + roundness * 0.38));

  if (finish.chrome) {
    drawChromeBar(ctx, {
      x,
      y,
      width,
      height,
      primary: opts.primary,
      secondary,
      accent,
      roundness,
      shine,
      value,
    });
    return;
  }

  const frost = finish.frost;
  // Transparent body: the lower the transparency, the more colour the pane
  // holds. Even the most solid setting keeps a visible gap of footage.
  const bodyAlpha = clamp(0.14 + (1 - finish.transparency) * 0.62, 0.12, 0.78);

  ctx.save();
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  // ---- body ------------------------------------------------------------
  const body = ctx.createLinearGradient(x, y + height, x, y);
  body.addColorStop(0, rgba(mixColors(opts.primary, accent, 0.55), Math.min(1, bodyAlpha * 1.15)));
  body.addColorStop(0.22, rgba(opts.primary, bodyAlpha * 0.82));
  body.addColorStop(0.62, rgba(mixColors(opts.primary, secondary, 0.4), bodyAlpha * 0.5));
  body.addColorStop(1, rgba(mixColors(opts.primary, "#ffffff", 0.5), bodyAlpha * 0.34));
  ctx.fillStyle = body;
  ctx.fillRect(x, y, width, height);

  // ---- sandblast veil --------------------------------------------------
  if (frost > 0.02) {
    const veil = ctx.createLinearGradient(x, y, x, y + height);
    veil.addColorStop(0, rgba("#ffffff", 0.05 + frost * 0.2));
    veil.addColorStop(0.45, rgba(mixColors(opts.primary, "#ffffff", 0.6), 0.03 + frost * 0.14));
    veil.addColorStop(1, rgba("#ffffff", 0.04 + frost * 0.16));
    ctx.fillStyle = veil;
    ctx.fillRect(x, y, width, height);
    // A sandblasted pane scatters light instead of reflecting it: a fine,
    // evenly lit face with no hard reflection line.
    if (frost > 0.5) {
      ctx.fillStyle = rgba("#ffffff", (frost - 0.5) * 0.16);
      const step = Math.max(2, height / 9);
      for (let lineY = y + step * 0.5; lineY < y + height; lineY += step) {
        ctx.fillRect(x, lineY, width, Math.max(0.6, height * 0.012));
      }
    }
  }

  // ---- bottom-lit hot spot inside the pane -----------------------------
  const hot = ctx.createRadialGradient(
    x + width * 0.5,
    y + height * 0.92,
    0,
    x + width * 0.5,
    y + height * 0.92,
    Math.max(width, height * 0.55)
  );
  hot.addColorStop(0, rgba(accent, 0.3 + value * 0.12 + frost * 0.12));
  hot.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = hot;
  ctx.fillRect(x, y, width, height);

  // ---- sharp specular band (crystal) -----------------------------------
  const specular = Math.max(0.4, width * 0.2) * (1 - frost * 0.35);
  const bandX = x + Math.max(0.6, width * 0.16);
  const band = ctx.createLinearGradient(bandX, y, bandX + specular, y);
  band.addColorStop(0, rgba("#ffffff", 0.72 * shine * (1 - frost * 0.55)));
  band.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = band;
  ctx.fillRect(bandX, y + height * 0.08, specular, height * 0.84);

  // ---- thin top reflection ---------------------------------------------
  const top = ctx.createLinearGradient(x, y, x, y + Math.max(2, height * 0.22));
  top.addColorStop(0, rgba("#ffffff", 0.78 * shine));
  top.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(x, y, width, Math.max(2, height * 0.22));

  ctx.restore();

  // ---- crisp rim (never a blurry edge) ---------------------------------
  const rimAlpha = 0.5 + frost * 0.18 + shine * 0.3;
  roundRectPath(
    ctx,
    x + 0.5,
    y + 0.5,
    Math.max(1, width - 1),
    Math.max(1, height - 1),
    Math.max(0, radius - 0.5)
  );
  ctx.strokeStyle = rgba(mixColors(accent, "#ffffff", 0.65), Math.min(1, rimAlpha));
  ctx.lineWidth = Math.max(0.9, Math.min(1.4, width * 0.09));
  ctx.stroke();

  // A second, darker edge just inside the rim is what makes a transparent
  // pane read as glass rather than as a coloured rectangle.
  if (width > 3 && height > 6) {
    roundRectPath(ctx, x + 1.6, y + 1.6, Math.max(1, width - 3.2), Math.max(1, height - 3.2), Math.max(0, radius - 1.4));
    ctx.strokeStyle = rgba("#ffffff", 0.16 + shine * 0.18);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * Polished chrome as a bar. Opaque by design: a metal with the footage showing
 * through it reads as tinted plastic, which is exactly the "dull metal" look
 * this replaces. The bands are the reflection of a horizon — bright sky above,
 * dark ground below a razor-sharp specular line.
 */
export function drawChromeBar(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    primary: string;
    secondary?: string;
    accent?: string;
    roundness?: number;
    shine?: number;
    value?: number;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const width = Math.max(1, positive(opts.width, 1));
  const height = Math.max(1, positive(opts.height, 1));
  const roundness = clamp(finite(opts.roundness, 1), 0, 1);
  const shine = Math.max(0.7, clamp(finite(opts.shine, 0.92), 0, 1));
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const secondary = opts.secondary || mixColors(opts.primary, "#0b1220", 0.55);
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.6);
  const radius = Math.min(width * 0.5, height * 0.5, width * (0.16 + roundness * 0.38));

  ctx.save();
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  // Horizon reflection: bright top, dark middle, bright ground bounce.
  const metal = ctx.createLinearGradient(x, y, x, y + height);
  metal.addColorStop(0, rgba(mixColors(accent, "#ffffff", 0.55), 1));
  metal.addColorStop(0.16, rgba(mixColors(opts.primary, "#ffffff", 0.4), 1));
  metal.addColorStop(0.34, rgba(mixColors(opts.primary, "#0b1220", 0.42), 1));
  metal.addColorStop(0.5, rgba(secondary, 1));
  metal.addColorStop(0.62, rgba(mixColors(accent, "#ffffff", 0.72), 1));
  metal.addColorStop(0.72, rgba(mixColors(opts.primary, "#0b1220", 0.3), 1));
  metal.addColorStop(0.9, rgba(mixColors(opts.primary, accent, 0.4), 1));
  metal.addColorStop(1, rgba(mixColors(opts.primary, "#0b1220", 0.28), 1));
  ctx.fillStyle = metal;
  ctx.fillRect(x, y, width, height);

  // Cylindrical shading: bright left cheek, dark right cheek.
  const cheek = ctx.createLinearGradient(x, y, x + width, y);
  cheek.addColorStop(0, rgba("#ffffff", 0.3));
  cheek.addColorStop(0.18, rgba("#ffffff", 0.1));
  cheek.addColorStop(0.62, "rgba(0, 0, 0, 0)");
  cheek.addColorStop(0.92, rgba("#000000", 0.26));
  cheek.addColorStop(1, rgba("#000000", 0.4));
  ctx.fillStyle = cheek;
  ctx.fillRect(x, y, width, height);

  // Sharp specular stripe — the signature of chrome.
  const stripeX = x + Math.max(0.5, width * 0.2);
  const stripeW = Math.max(0.8, width * 0.16);
  const stripe = ctx.createLinearGradient(stripeX, y, stripeX + stripeW, y);
  stripe.addColorStop(0, rgba("#ffffff", 0.2 * shine));
  stripe.addColorStop(0.45, rgba("#ffffff", 0.92 * shine));
  stripe.addColorStop(1, rgba("#ffffff", 0.16 * shine));
  ctx.fillStyle = stripe;
  ctx.fillRect(stripeX, y, stripeW, height);

  // Coloured bounce from the light below, kept crisp at the base.
  const bounce = ctx.createLinearGradient(x, y + height, x, y + height * 0.72);
  bounce.addColorStop(0, rgba(accent, 0.42 + value * 0.08));
  bounce.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bounce;
  ctx.fillRect(x, y + height * 0.7, width, height * 0.3);

  ctx.restore();

  roundRectPath(ctx, x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1), Math.max(0, radius - 0.5));
  ctx.strokeStyle = rgba("#ffffff", 0.55 + shine * 0.3);
  ctx.lineWidth = Math.max(0.8, Math.min(1.2, width * 0.08));
  ctx.stroke();
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
    transparency?: number;
    frost?: number;
    material?: VisualizerMaterial;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const radius = Math.max(0.8, positive(opts.radius, 1));
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const shine = clamp(finite(opts.shine, 0.88), 0, 1);
  const finish = resolveMaterialFinish(opts);
  const secondary = opts.secondary || opts.primary;
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.5);

  if (finish.chrome) {
    drawChromeOrb(ctx, { x, y, radius, primary: opts.primary, secondary, accent, shine, value });
    return;
  }

  const frost = finish.frost;
  const shellAlpha = clamp(0.1 + (1 - finish.transparency) * 0.5, 0.08, 0.62);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  const shell = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.36,
    Math.max(0.5, radius * 0.05),
    x,
    y,
    radius
  );
  shell.addColorStop(0, rgba(mixColors(accent, "#ffffff", 0.6), shellAlpha * 0.9));
  shell.addColorStop(0.42, rgba(opts.primary, shellAlpha * 0.55));
  shell.addColorStop(0.8, rgba(secondary, shellAlpha * 0.4));
  shell.addColorStop(1, rgba(opts.primary, shellAlpha * 0.24));
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  const underlight = ctx.createLinearGradient(x, y + radius, x, y - radius);
  underlight.addColorStop(0, rgba(mixColors(opts.primary, accent, 0.6), Math.min(1, 0.5 + value * 0.12)));
  underlight.addColorStop(0.32, rgba(opts.primary, 0.24));
  underlight.addColorStop(0.72, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = underlight;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  if (frost > 0.02) {
    const veil = ctx.createRadialGradient(
      x - radius * 0.2,
      y - radius * 0.24,
      radius * 0.1,
      x,
      y,
      radius
    );
    veil.addColorStop(0, rgba("#ffffff", 0.04 + frost * 0.22));
    veil.addColorStop(0.6, rgba(mixColors(opts.primary, "#ffffff", 0.5), 0.03 + frost * 0.14));
    veil.addColorStop(1, rgba("#ffffff", 0.02 + frost * 0.1));
    ctx.fillStyle = veil;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp curved specular reflection, plus a tiny secondary catchlight.
  ctx.beginPath();
  ctx.ellipse(
    x - radius * 0.3,
    y - radius * 0.36,
    radius * (0.34 - frost * 0.14),
    radius * (0.14 - frost * 0.05),
    -0.7,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = rgba("#ffffff", (0.82 - frost * 0.4) * shine);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + radius * 0.34, y + radius * 0.3, Math.max(0.6, radius * 0.07), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#ffffff", 0.5 * shine);
  ctx.fill();

  ctx.restore();

  // Two sharp rims: a bright front edge and a faint far edge. No blur.
  ctx.beginPath();
  ctx.arc(x, y, radius - Math.min(0.6, radius * 0.12), 0, Math.PI * 2);
  ctx.strokeStyle = rgba(mixColors(accent, "#ffffff", 0.6), 0.65 + shine * 0.3);
  ctx.lineWidth = Math.max(0.75, radius * 0.1);
  ctx.stroke();
  if (radius > 3) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, radius - Math.max(1.2, radius * 0.22)), 0, Math.PI * 2);
    ctx.strokeStyle = rgba("#ffffff", 0.14 + shine * 0.16);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Chrome as a sphere: horizon bands bent around a polished ball. */
export function drawChromeOrb(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    radius: number;
    primary: string;
    secondary?: string;
    accent?: string;
    shine?: number;
    value?: number;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const radius = Math.max(0.8, positive(opts.radius, 1));
  const shine = Math.max(0.7, clamp(finite(opts.shine, 0.92), 0, 1));
  const secondary = opts.secondary || mixColors(opts.primary, "#0b1220", 0.55);
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.6);

  ctx.save();
  const ball = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.34,
    Math.max(0.4, radius * 0.05),
    x,
    y,
    radius
  );
  ball.addColorStop(0, rgba("#ffffff", 1));
  ball.addColorStop(0.18, rgba(mixColors(accent, "#ffffff", 0.5), 1));
  ball.addColorStop(0.42, rgba(mixColors(opts.primary, "#0b1220", 0.35), 1));
  ball.addColorStop(0.62, rgba(secondary, 1));
  ball.addColorStop(0.82, rgba(mixColors(opts.primary, accent, 0.45), 1));
  ball.addColorStop(1, rgba(mixColors(opts.primary, "#0b1220", 0.2), 1));
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Sharp horizon line across the ball.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  const horizon = ctx.createLinearGradient(x, y - radius * 0.1, x, y + radius * 0.26);
  horizon.addColorStop(0, rgba("#ffffff", 0.34 * shine));
  horizon.addColorStop(0.45, "rgba(0, 0, 0, 0)");
  horizon.addColorStop(0.55, rgba("#000000", 0.3));
  horizon.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = horizon;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.3, y - radius * 0.34, radius * 0.3, radius * 0.12, -0.7, 0, Math.PI * 2);
  ctx.fillStyle = rgba("#ffffff", 0.95 * shine);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, radius - Math.min(0.5, radius * 0.08), 0, Math.PI * 2);
  ctx.strokeStyle = rgba("#ffffff", 0.5 + shine * 0.3);
  ctx.lineWidth = Math.max(0.7, radius * 0.08);
  ctx.stroke();
  ctx.restore();
}

/**
 * A radial spike/bar. `baseX/baseY` is the point lit from below (normally the
 * ring itself), even when the spike grows inward.
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
    transparency?: number;
    frost?: number;
    material?: VisualizerMaterial;
  }
) {
  const x1 = finite(opts.x1, 0);
  const y1 = finite(opts.y1, 0);
  const x2 = finite(opts.x2, 0);
  const y2 = finite(opts.y2, 0);
  const width = Math.max(0.6, positive(opts.width, 1));
  const value = clamp(finite(opts.value, 0.5), 0, 1.8);
  const shine = clamp(finite(opts.shine, 0.86), 0, 1);
  const finish = resolveMaterialFinish(opts);
  const baseX = finite(opts.baseX, x1);
  const baseY = finite(opts.baseY, y1);
  const fromStart = Math.hypot(baseX - x1, baseY - y1) <= Math.hypot(baseX - x2, baseY - y2);
  const startX = fromStart ? x1 : x2;
  const startY = fromStart ? y1 : y2;
  const endX = fromStart ? x2 : x1;
  const endY = fromStart ? y2 : y1;
  const cap = opts.round === false ? "butt" : "round";

  if (finish.chrome) {
    const metal = ctx.createLinearGradient(startX, startY, endX, endY);
    metal.addColorStop(0, rgba(mixColors(opts.primary, "#ffffff", 0.35), 1));
    metal.addColorStop(0.3, rgba(mixColors(opts.primary, "#0b1220", 0.45), 1));
    metal.addColorStop(0.52, rgba(mixColors(opts.accent, "#ffffff", 0.55), 1));
    metal.addColorStop(0.72, rgba(mixColors(opts.primary, "#0b1220", 0.32), 1));
    metal.addColorStop(1, rgba(mixColors(opts.accent, "#ffffff", 0.4), 1));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = metal;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.stroke();
    // razor specular line down the spike
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = rgba("#ffffff", 0.55 + shine * 0.4);
    ctx.lineWidth = Math.max(0.5, width * 0.2);
    ctx.lineCap = cap;
    ctx.stroke();
    ctx.restore();
    return;
  }

  const frost = finish.frost;
  const bodyAlpha = clamp(0.2 + (1 - finish.transparency) * 0.62, 0.16, 0.82);
  const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
  gradient.addColorStop(0, rgba(mixColors(opts.primary, opts.accent, 0.5), Math.min(1, bodyAlpha + 0.18)));
  gradient.addColorStop(0.34, rgba(opts.primary, bodyAlpha * 0.72));
  gradient.addColorStop(0.76, rgba(opts.primary, bodyAlpha * 0.42));
  gradient.addColorStop(1, rgba(mixColors(opts.accent, "#ffffff", 0.45), bodyAlpha * 0.85));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.stroke();

  if (frost > 0.02) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = rgba("#ffffff", 0.04 + frost * 0.18);
    ctx.lineWidth = Math.max(0.8, width * (0.5 + frost * 0.4));
    ctx.lineCap = cap;
    ctx.stroke();
  }

  if (shine > 0.03 && width > 1.1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = rgba("#ffffff", (0.3 + shine * 0.5) * (1 - frost * 0.35));
    ctx.lineWidth = Math.max(0.45, width * 0.2);
    ctx.lineCap = cap;
    ctx.stroke();
  }

  // Crisp bright tip: the tip of every spike catches the light.
  const tipR = Math.max(0.6, width * 0.5);
  ctx.beginPath();
  ctx.arc(x2, y2, tipR, 0, Math.PI * 2);
  ctx.fillStyle = rgba(mixColors(opts.accent, "#ffffff", 0.55), 0.5 + value * 0.2);
  ctx.fill();
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
  // A short lens flare reads as a polished metal star rather than a dot.
  if (glow > 0.1) {
    ctx.beginPath();
    ctx.moveTo(-radius * 1.5, 0);
    ctx.lineTo(radius * 1.5, 0);
    ctx.moveTo(0, -radius * 1.5);
    ctx.lineTo(0, radius * 1.5);
    ctx.strokeStyle = rgba(opts.accent, 0.35 * glow);
    ctx.lineWidth = Math.max(0.4, radius * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A single puff of gas: several overlapping soft blobs inside an elongated
 * ellipse, so the silhouette is irregular rather than a ball.
 *
 * `fuzz` (0..1) moves the gradient's bright core outwards, which is what makes
 * smoke look diffuse; `fuzz` near 0 gives a structured curl of vapour.
 */
export function drawSmokePuff(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    radius: number;
    angle?: number;
    stretch?: number;
    primary: string;
    secondary?: string;
    accent?: string;
    alpha?: number;
    fuzz?: number;
    seed?: number;
  }
) {
  const x = finite(opts.x, 0);
  const y = finite(opts.y, 0);
  const radius = Math.max(1, positive(opts.radius, 1));
  const angle = finite(opts.angle, 0);
  const stretch = clamp(finite(opts.stretch, 1.7), 1, 3);
  const alpha = clamp(finite(opts.alpha, 0.16), 0, 1);
  const fuzz = clamp(finite(opts.fuzz, 0.6), 0, 1);
  const seed = finite(opts.seed, 0);
  const secondary = opts.secondary || opts.primary;
  const accent = opts.accent || mixColors(opts.primary, "#ffffff", 0.4);

  // Four overlapping lobes per puff. More fuzz spreads them further apart so
  // the edge dissolves; less fuzz keeps a tighter, more defined curl. Kept at
  // four because the renderer draws this for every cloud of every frame.
  const lobes = 4;
  const inheritedAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < lobes; i++) {
    const t = (i + hash01(seed + i * 7.13)) / lobes;
    const lobeAngle = angle + (hash01(seed + i * 3.7) - 0.5) * Math.PI * (0.35 + fuzz * 0.9);
    const distance = radius * (0.1 + hash01(seed + i * 5.1) * 0.75) * (0.4 + fuzz * 0.9);
    const lx = x + Math.cos(lobeAngle) * distance * stretch;
    const ly = y + Math.sin(lobeAngle) * distance;
    const lr = radius * (0.42 + hash01(seed + i * 2.3) * 0.45) * (0.7 + fuzz * 0.6);
    const g = ctx.createRadialGradient(lx, ly, lr * 0.04, lx, ly, lr);
    const core = Math.max(0.02, 0.3 - fuzz * 0.24);
    g.addColorStop(0, rgba(mixColors(accent, "#ffffff", 0.25), alpha * (0.9 - fuzz * 0.35)));
    g.addColorStop(core, rgba(opts.primary, alpha * 0.8));
    g.addColorStop(Math.min(0.95, core + 0.34), rgba(secondary, alpha * 0.42 * (1 - fuzz * 0.3)));
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = inheritedAlpha * clamp(0.28 + t * 0.4 + fuzz * 0.2, 0, 1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(lx, ly, lr * (1 + fuzz * 0.4), lr * (0.72 + fuzz * 0.3), lobeAngle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Deterministic 0..1 from a seed, shared with the gas lobes. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
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
