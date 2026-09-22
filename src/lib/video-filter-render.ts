/* =========================================================================
   GLOBAL VIDEO FILTER — ANIMATED LAYER RENDERER
   -------------------------------------------------------------------------
   Paints the atmospheric half of a filter (grain, mist, dust, flares, VHS
   artefacts, rain, snow …) on top of an already colour-graded frame.

   Used identically by:
     • VideoPreview  (live canvas preview)
     • RenderView    (final MediaRecorder render)
     • FiltersStudio (the little example thumbnails in the Filters tab)

   Everything is deterministic from `timeSec`, so preview and render match.
   ========================================================================= */

import {
  getPreset,
  resolveSettings,
  type LayerSpec,
  type VideoFilterConfig,
  type VideoFilterSettings,
} from "../data/video-filters";

/* deterministic pseudo random in [0,1) */
function rnd(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function gradientFor(
  ctx: CanvasRenderingContext2D,
  dir: "diag" | "vert" | "horiz",
  w: number,
  h: number
): CanvasGradient {
  if (dir === "vert") return ctx.createLinearGradient(0, 0, 0, h);
  if (dir === "horiz") return ctx.createLinearGradient(0, 0, w, 0);
  return ctx.createLinearGradient(0, 0, w, h);
}

function scaleAlpha(color: string, k: number): string {
  // rgba(r,g,b,a) → rgba(r,g,b,a*k)
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const p = m[1].split(",").map((v) => parseFloat(v.trim()));
  const a = p.length > 3 ? p[3] : 1;
  return `rgba(${p[0] | 0}, ${p[1] | 0}, ${p[2] | 0}, ${Math.max(0, Math.min(1, a * k)).toFixed(4)})`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** which slider (if any) drives a given layer kind */
function layerGain(spec: LayerSpec, s: VideoFilterSettings): number {
  switch (spec.kind) {
    case "grain":
      return s.grain * 1.35;
    case "vignette":
      return s.vignette * 1.6;
    case "bloom":
    case "halation":
    case "leak":
    case "sunflare":
    case "godrays":
      return 0.25 + s.glow * 1.5;
    case "particles":
    case "rain":
      return 0.2 + s.particles * 1.6;
    case "fog":
      return 0.15 + s.mist * 1.7;
    case "flicker":
      return 0.4 + s.glow * 0.8;
    default:
      return 1;
  }
}

/* --------------------------------- layers -------------------------------- */

function paintLayer(
  ctx: CanvasRenderingContext2D,
  spec: LayerSpec,
  w: number,
  h: number,
  t: number,
  s: VideoFilterSettings
) {
  const k = clamp01(s.strength) * layerGain(spec, s);
  if (k <= 0.001) return;
  const unit = w / 1280; // scale everything against a 1280-wide reference
  const warm = s.warmth;

  switch (spec.kind) {
    case "wash": {
      const g = gradientFor(ctx, spec.dir || "diag", w, h);
      const n = spec.colors.length;
      spec.colors.forEach((c, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), scaleAlpha(c, spec.alpha * k)));
      ctx.save();
      if (spec.blend) ctx.globalCompositeOperation = spec.blend;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // warm/cool trim pass so the slider has a real visible effect
      if (Math.abs(warm) > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle =
          warm > 0
            ? `rgba(255, 170, 70, ${(warm * 0.22 * k).toFixed(3)})`
            : `rgba(70, 150, 255, ${(-warm * 0.22 * k).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      break;
    }

    case "vignette": {
      const inner = spec.inner ?? 0.3;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.max(w, h) * inner, w / 2, h / 2, Math.max(w, h) * 0.78);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.65, scaleAlpha(spec.color || "rgba(0,0,0,1)", spec.alpha * k * 0.35));
      g.addColorStop(1, scaleAlpha(spec.color || "rgba(0,0,0,1)", spec.alpha * k));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "grain": {
      const a = spec.alpha * k;
      if (a <= 0.005) break;
      const density = (spec.density ?? 1) * (w * h) / 5200;
      const frame = Math.floor(t * 24);
      const light = `rgba(255,255,255,${(a * 0.16).toFixed(3)})`;
      const dark = `rgba(0,0,0,${(a * 0.2).toFixed(3)})`;
      const px = Math.max(1, 1.7 * unit);
      for (let i = 0; i < density; i++) {
        const gx = rnd(i + frame * 0.37, 3) * w;
        const gy = rnd(i + frame * 0.61, 7) * h;
        ctx.fillStyle = i % 2 === 0 ? light : spec.mono ? light : dark;
        ctx.fillRect(gx, gy, px, px);
      }
      break;
    }

    case "specks": {
      const a = spec.alpha * k;
      const seed = Math.floor(t * 9);
      const count = 6 + (seed % 6);
      for (let i = 0; i < count; i++) {
        const x = rnd(i + seed, 11) * w;
        const y = rnd(i + seed, 23) * h;
        const r = (1.5 + rnd(i + seed, 31) * 4) * unit;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? `rgba(245,235,215,${(a * 0.4).toFixed(3)})` : `rgba(18,12,6,${(a * 0.5).toFixed(3)})`;
        ctx.fill();
        if (i % 3 === 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 8 * unit, y - 12 * unit, x + 20 * unit, y + 5 * unit);
          ctx.strokeStyle = `rgba(15,10,5,${(a * 0.5).toFixed(3)})`;
          ctx.lineWidth = 1.3 * unit;
          ctx.stroke();
        }
      }
      break;
    }

    case "scratches": {
      const a = spec.alpha * k;
      const seed = Math.floor(t * 12 * s.speed);
      const count = 2 + (seed % 3);
      for (let i = 0; i < count; i++) {
        const x = rnd(i + seed, 41) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 3 * unit, h * 0.33, x - 3 * unit, h * 0.66, x + rnd(i + seed, 53) * 4 * unit, h);
        ctx.strokeStyle = i === 0 ? `rgba(255,255,255,${(a * 0.3).toFixed(3)})` : `rgba(25,18,10,${(a * 0.32).toFixed(3)})`;
        ctx.lineWidth = (i === 0 ? 1 : 1.6) * unit;
        ctx.stroke();
      }
      break;
    }

    case "flicker": {
      const rate = (spec.rate ?? 24) * s.speed;
      const f = (Math.sin(t * rate) + Math.sin(t * rate * 1.73)) * 0.5;
      const a = Math.max(0, f) * spec.alpha * k * 0.09;
      if (a > 0.002) {
        ctx.fillStyle = `rgba(255,243,214,${a.toFixed(4)})`;
        ctx.fillRect(0, 0, w, h);
      }
      const d = Math.max(0, -f) * spec.alpha * k * 0.07;
      if (d > 0.002) {
        ctx.fillStyle = `rgba(0,0,0,${d.toFixed(4)})`;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "scanlines": {
      const gap = Math.max(2, Math.round((spec.gap ?? 3) * unit));
      ctx.fillStyle = `rgba(0,0,0,${(spec.alpha * k * 0.22).toFixed(3)})`;
      for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, Math.max(1, gap * 0.4));
      break;
    }

    case "tracking": {
      const a = spec.alpha * k;
      const y = ((t * 90 * s.speed) % (h + 80)) - 40;
      const band = ctx.createLinearGradient(0, y - 14 * unit, 0, y + 14 * unit);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, `rgba(255,255,255,${(a * 0.18).toFixed(3)})`);
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, y - 14 * unit, w, 28 * unit);
      // torn noise dashes inside the band
      for (let i = 0; i < 26; i++) {
        const nx = rnd(i, Math.floor(t * 12)) * w;
        ctx.fillStyle = `rgba(255,255,255,${(a * 0.22).toFixed(3)})`;
        ctx.fillRect(nx, y - 5 * unit + rnd(i, 9) * 10 * unit, rnd(i, 17) * 42 * unit, 1.6 * unit);
      }
      break;
    }

    case "chroma": {
      const a = spec.alpha * k;
      const off = (2 + Math.sin(t * 3 * s.speed) * 1.6) * unit;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(255,0,70,${(a * 0.055).toFixed(3)})`;
      ctx.fillRect(-off, 0, w, h);
      ctx.fillStyle = `rgba(0,220,255,${(a * 0.055).toFixed(3)})`;
      ctx.fillRect(off, 0, w, h);
      ctx.restore();
      break;
    }

    case "bloom": {
      const cx = (spec.x ?? 0.5) * w;
      const cy = (spec.y ?? 0.4) * h;
      const r = (spec.radius ?? 0.7) * Math.max(w, h);
      const pulse = 1 + Math.sin(t * 0.8 * s.speed) * 0.06;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
      g.addColorStop(0, scaleAlpha(spec.color, spec.alpha * k * 0.85));
      g.addColorStop(0.45, scaleAlpha(spec.color, spec.alpha * k * 0.3));
      g.addColorStop(1, scaleAlpha(spec.color, 0));
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case "halation": {
      // warm glow pushed in from every edge, as film highlights bleed
      const a = spec.alpha * k;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.8);
      g.addColorStop(0, scaleAlpha(spec.color, a * 0.05));
      g.addColorStop(1, scaleAlpha(spec.color, a * 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case "leak": {
      const a = spec.alpha * k * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.35 * s.speed)));
      const side = spec.side || "right";
      const g =
        side === "left"
          ? ctx.createLinearGradient(0, 0, w * 0.6, h * 0.3)
          : side === "top"
          ? ctx.createLinearGradient(0, 0, w * 0.2, h * 0.7)
          : ctx.createLinearGradient(w, 0, w * 0.4, h * 0.6);
      g.addColorStop(0, scaleAlpha(spec.color, a * 0.55));
      g.addColorStop(0.35, scaleAlpha(spec.color, a * 0.2));
      g.addColorStop(1, scaleAlpha(spec.color, 0));
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case "sunflare": {
      const a = spec.alpha * k;
      const cx = (spec.x ?? 0.2) * w;
      const cy = (spec.y ?? 0.2) * h;
      const col = spec.color || "rgba(255,240,190,1)";
      const breathe = 1 + Math.sin(t * 0.9 * s.speed) * 0.08;
      ctx.save();
      ctx.globalCompositeOperation = "screen";

      // core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.32 * breathe);
      core.addColorStop(0, scaleAlpha(col, a * 0.9));
      core.addColorStop(0.25, scaleAlpha(col, a * 0.32));
      core.addColorStop(1, scaleAlpha(col, 0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      // horizontal anamorphic streak
      const streak = ctx.createLinearGradient(0, cy, w, cy);
      streak.addColorStop(0, scaleAlpha(col, 0));
      streak.addColorStop(0.5, scaleAlpha(col, a * 0.3));
      streak.addColorStop(1, scaleAlpha(col, 0));
      ctx.fillStyle = streak;
      ctx.fillRect(0, cy - 9 * unit * breathe, w, 18 * unit * breathe);

      // star rays
      const rays = spec.rays ?? 0;
      if (rays > 0) {
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.05 * s.speed);
        for (let i = 0; i < rays; i++) {
          const ang = (Math.PI * 2 * i) / rays;
          const len = w * (0.18 + rnd(i, 5) * 0.2) * breathe;
          const grad = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
          grad.addColorStop(0, scaleAlpha(col, a * 0.35));
          grad.addColorStop(1, scaleAlpha(col, 0));
          ctx.strokeStyle = grad;
          ctx.lineWidth = (2 + rnd(i, 13) * 3) * unit;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
          ctx.stroke();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // lens ghosts marching towards the opposite corner
      const gx = w - cx;
      const gy = h - cy;
      for (let i = 1; i <= 4; i++) {
        const p = i / 5;
        const px = cx + (gx - cx) * p;
        const py = cy + (gy - cy) * p;
        const r = (16 + i * 11) * unit * breathe;
        const gg = ctx.createRadialGradient(px, py, 0, px, py, r);
        const tint = i % 2 ? "rgba(255,200,130,1)" : "rgba(160,220,255,1)";
        gg.addColorStop(0, scaleAlpha(tint, a * 0.16));
        gg.addColorStop(0.7, scaleAlpha(tint, a * 0.07));
        gg.addColorStop(1, scaleAlpha(tint, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case "godrays": {
      const a = spec.alpha * k;
      const count = spec.count ?? 6;
      const angle = spec.angle ?? 0.5;
      const col = spec.color || "255,250,215";
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const originX = -w * 0.15;
      const originY = -h * 0.2;
      for (let i = 0; i < count; i++) {
        const sway = Math.sin(t * 0.25 * s.speed + i) * 0.035;
        const spread = 0.22 + i * 0.13;
        const ang = angle + spread + sway;
        const width = (52 + rnd(i, 3) * 70) * unit;
        const len = Math.hypot(w, h) * 1.4;
        const ex = originX + Math.cos(ang) * len;
        const ey = originY + Math.sin(ang) * len;
        const g = ctx.createLinearGradient(originX, originY, ex, ey);
        const beamA = a * (0.16 + rnd(i, 9) * 0.12) * (0.75 + 0.25 * Math.sin(t * 0.6 + i));
        g.addColorStop(0, `rgba(${col},${(beamA * 1.1).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${col},${(beamA * 0.5).toFixed(3)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case "particles": {
      const a = spec.alpha * k;
      if (a <= 0.005) break;
      const count = Math.round(spec.count * (0.4 + s.particles * 1.3));
      const drift = (spec.drift ?? 0.5) * s.speed;
      ctx.save();
      ctx.globalCompositeOperation = spec.style === "snow" ? "source-over" : "screen";
      for (let i = 0; i < count; i++) {
        const seedX = rnd(i, 2);
        const seedY = rnd(i, 4);
        const sway = Math.sin(t * (0.5 + rnd(i, 6) * 0.9) * s.speed + i) * (26 + rnd(i, 8) * 36) * unit;
        const bob = Math.cos(t * (0.4 + rnd(i, 10) * 0.7) * s.speed + i * 1.3) * 18 * unit;

        let x: number;
        let y: number;
        if (spec.style === "snow") {
          x = (seedX * w + sway + w) % w;
          y = ((seedY * h + t * (60 + rnd(i, 12) * 90) * drift) % (h + 60)) - 30;
        } else if (spec.style === "ember" || spec.style === "pollen") {
          x = (seedX * w + sway + w) % w;
          y = (((seedY * h - t * (16 + rnd(i, 12) * 34) * Math.abs(drift)) % (h + 80)) + h + 80) % (h + 80) - 40;
        } else {
          x = (seedX * w + t * (10 + rnd(i, 14) * 22) * drift + sway + w * 2) % (w + 120) - 60;
          y = (seedY * h + bob + h) % h;
        }

        const base = spec.size * unit;
        const isBig = spec.style === "bokeh" || i % 5 === 0;
        const r = spec.style === "bokeh" ? base * (9 + rnd(i, 16) * 16) : base * (1.2 + rnd(i, 16) * (isBig ? 4.2 : 1.8));
        const twinkle =
          spec.style === "pollen" || spec.style === "ember"
            ? 0.55 + 0.45 * Math.sin(t * (1.6 + rnd(i, 18) * 2.4) + i)
            : 0.7 + 0.3 * Math.sin(t * 1.1 + i);
        const alpha = a * (spec.style === "bokeh" ? 0.16 : 0.5) * twinkle;
        if (alpha <= 0.003) continue;

        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
        g.addColorStop(0, `rgba(${spec.color},${Math.min(1, alpha * 1.6).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(${spec.color},${(alpha * 0.55).toFixed(3)})`);
        g.addColorStop(1, `rgba(${spec.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
        ctx.fill();

        // crisp bokeh rim
        if (spec.style === "bokeh") {
          ctx.strokeStyle = `rgba(${spec.color},${(alpha * 0.7).toFixed(3)})`;
          ctx.lineWidth = 1.2 * unit;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, r * 0.92), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      break;
    }

    case "rain": {
      const a = spec.alpha * k;
      const count = Math.round(spec.count * (0.4 + s.particles * 1.2));
      ctx.save();
      ctx.strokeStyle = `rgba(210,232,255,${(a * 0.3).toFixed(3)})`;
      for (let i = 0; i < count; i++) {
        const speed = 700 + rnd(i, 21) * 900;
        const x = (rnd(i, 2) * w + Math.sin(t * 0.3 + i) * 20 * unit + w) % w;
        const y = ((rnd(i, 4) * h + t * speed * s.speed) % (h + 120)) - 60;
        const len = (14 + rnd(i, 6) * 26) * unit;
        ctx.lineWidth = (0.8 + rnd(i, 8) * 0.9) * unit;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3 * unit, y + len);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case "fog": {
      const a = spec.alpha * k;
      if (a <= 0.005) break;
      const bands = spec.bands ?? 3;
      ctx.save();
      for (let b = 0; b < bands; b++) {
        const phase = t * (0.035 + b * 0.022) * s.speed + b * 0.6;
        const cx = ((phase % 2) - 0.5) * w * 1.2;
        const baseY = spec.from === "bottom" ? h * (0.72 - b * 0.1) : spec.from === "top" ? h * (0.1 + b * 0.12) : h * (0.25 + b * 0.24);
        const ry = h * (0.3 + b * 0.09);
        const rx = w * (0.75 + b * 0.16);
        const cy = baseY + Math.sin(phase * 1.4) * h * 0.035;
        const g = ctx.createRadialGradient(cx + w * 0.5, cy, 0, cx + w * 0.5, cy, Math.max(rx, ry));
        const bandA = a * (0.3 - b * 0.055);
        g.addColorStop(0, `rgba(${spec.color},${Math.max(0, bandA).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${spec.color},${Math.max(0, bandA * 0.45).toFixed(3)})`);
        g.addColorStop(1, `rgba(${spec.color},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (spec.from === "bottom") {
        const g2 = ctx.createLinearGradient(0, h * 0.45, 0, h);
        g2.addColorStop(0, `rgba(${spec.color},0)`);
        g2.addColorStop(1, `rgba(${spec.color},${(a * 0.32).toFixed(3)})`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, h * 0.45, w, h * 0.55);
      }
      ctx.restore();
      break;
    }

    case "letterbox": {
      const bar = h * (spec.ratio ?? 0.1);
      ctx.fillStyle = `rgba(0,0,0,${(spec.alpha * clamp01(s.strength)).toFixed(3)})`;
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
      break;
    }
  }
}

/**
 * Paint the whole filter's animated layer stack over the current frame.
 * Call AFTER the scene image has been drawn with the colour grade applied.
 */
export function paintVideoFilter(
  ctx: CanvasRenderingContext2D,
  config: VideoFilterConfig | null | undefined,
  w: number,
  h: number,
  timeSec: number
) {
  const preset = getPreset(config?.id);
  if (!preset || w <= 0 || h <= 0) return;
  const settings = resolveSettings(preset, config?.settings);
  if (settings.strength <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  for (const layer of preset.layers) {
    ctx.save();
    try {
      paintLayer(ctx, layer, w, h, timeSec, settings);
    } catch {
      /* one bad layer must never kill a render */
    }
    ctx.restore();
  }
  ctx.restore();
}

export { getPreset, resolveSettings };
export type { VideoFilterConfig, VideoFilterSettings };
