/* =========================================================================
   SCENERING — INTRO / OUTRO MOTION BACKGROUNDS
   -------------------------------------------------------------------------
   Short, looping, high-impact motion backgrounds drawn procedurally on the
   canvas. They are resolution independent (crisp at 4K), weigh nothing, and
   always animate in perfect sync with the timeline clock.

   A background is just an id + a paint function:

       paintMotionBackground(ctx, id, w, h, t, progress, palette)

   The user can also drop in their OWN video or image instead — the studio
   stores that as { kind: "video" | "image", url } and the renderer draws it
   in place of a procedural background.
   ========================================================================= */

export type BackgroundKind = "motion" | "video" | "image";

export interface MotionBackgroundDef {
  id: string;
  name: string;
  /** short sell of the mood, shown under the thumbnail */
  blurb: string;
  icon: string;
  /** default palette (user can recolour) */
  colors: [string, string];
  /** which sections it suits best */
  mood: "epic" | "modern" | "elegant" | "energetic" | "calm";
}

export const MOTION_BACKGROUNDS: MotionBackgroundDef[] = [
  {
    id: "gold_flare",
    name: "Golden Flare Burst",
    blurb: "Warm cinematic light explodes outward with drifting embers",
    icon: "✨",
    colors: ["#f5b820", "#ff7a18"],
    mood: "epic",
  },
  {
    id: "cosmic_warp",
    name: "Cosmic Warp Speed",
    blurb: "Star streaks rushing past through a deep nebula",
    icon: "🌌",
    colors: ["#a855f7", "#38bdf8"],
    mood: "epic",
  },
  {
    id: "cyber_grid",
    name: "Neon Cyber Grid",
    blurb: "Retro-futuristic horizon grid with a glowing sun",
    icon: "⚡",
    colors: ["#22d3ee", "#ec4899"],
    mood: "modern",
  },
  {
    id: "ink_bloom",
    name: "Liquid Ink Bloom",
    blurb: "Colour clouds blooming slowly through dark water",
    icon: "🌊",
    colors: ["#6366f1", "#06b6d4"],
    mood: "elegant",
  },
  {
    id: "light_sweep",
    name: "Studio Light Sweep",
    blurb: "Clean beams sweeping across a soft studio backdrop",
    icon: "🎛️",
    colors: ["#38bdf8", "#818cf8"],
    mood: "modern",
  },
  {
    id: "particle_rise",
    name: "Rising Particles",
    blurb: "Elegant glowing motes lifting through soft darkness",
    icon: "🫧",
    colors: ["#fbbf24", "#f472b6"],
    mood: "elegant",
  },
  {
    id: "energy_pulse",
    name: "Energy Shockwave",
    blurb: "Hard-hitting rings pounding outward from the centre",
    icon: "💥",
    colors: ["#ef4444", "#f59e0b"],
    mood: "energetic",
  },
  {
    id: "film_strip",
    name: "Cinema Projector",
    blurb: "Vintage projector beam, gate flicker and floating dust",
    icon: "🎞️",
    colors: ["#eab308", "#78350f"],
    mood: "elegant",
  },
  {
    id: "aurora_silk",
    name: "Aurora Silk",
    blurb: "Slow ribbons of northern light folding through the frame",
    icon: "🌠",
    colors: ["#34d399", "#8b5cf6"],
    mood: "calm",
  },
  {
    id: "glitch_bars",
    name: "Digital Glitch",
    blurb: "Torn data bars and RGB tearing across a dark screen",
    icon: "📺",
    colors: ["#06b6d4", "#f43f5e"],
    mood: "modern",
  },
  {
    id: "smoke_reveal",
    name: "Smoke & Spotlight",
    blurb: "Moody smoke curling through a single hard spotlight",
    icon: "🚬",
    colors: ["#94a3b8", "#1e293b"],
    mood: "elegant",
  },
  {
    id: "confetti_pop",
    name: "Celebration Pop",
    blurb: "Bright confetti bursting up — perfect for a happy outro",
    icon: "🎉",
    colors: ["#f472b6", "#facc15"],
    mood: "energetic",
  },
];

export const MOTION_BACKGROUNDS_BY_ID: Record<string, MotionBackgroundDef> =
  MOTION_BACKGROUNDS.reduce((a, b) => {
    a[b.id] = b;
    return a;
  }, {} as Record<string, MotionBackgroundDef>);

/* ------------------------------------------------------------------ utils */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function rnd(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* --------------------------------------------------------------- painting */

/**
 * Paint a full-frame animated background.
 * @param t        seconds since the section started (drives the animation)
 * @param progress 0..1 through the section (drives reveals / builds)
 */
export function paintMotionBackground(
  ctx: CanvasRenderingContext2D,
  id: string,
  w: number,
  h: number,
  t: number,
  progress: number,
  colorA?: string,
  colorB?: string
) {
  const def = MOTION_BACKGROUNDS_BY_ID[id] || MOTION_BACKGROUNDS[0];
  const c1 = colorA || def.colors[0];
  const c2 = colorB || def.colors[1];
  const unit = w / 1280;
  const p = Math.max(0, Math.min(1, progress));

  ctx.save();
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, w, h);

  switch (def.id) {
    case "gold_flare": {
      const cx = w * 0.5;
      const cy = h * 0.46;
      const burst = Math.min(1, p * 2.2);

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * (0.28 + burst * 0.45));
      g.addColorStop(0, rgba(c1, 0.95));
      g.addColorStop(0.22, rgba(c1, 0.5));
      g.addColorStop(0.55, rgba(c2, 0.22));
      g.addColorStop(1, "rgba(5,4,2,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // rotating light rays
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.18);
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14;
        const len = w * (0.35 + rnd(i, 3) * 0.35);
        const rg = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        rg.addColorStop(0, rgba(c1, 0.32 * burst));
        rg.addColorStop(1, rgba(c1, 0));
        ctx.strokeStyle = rg;
        ctx.lineWidth = (7 + rnd(i, 9) * 20) * unit;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();

      // horizontal anamorphic streak
      const s = ctx.createLinearGradient(0, cy, w, cy);
      s.addColorStop(0, rgba(c1, 0));
      s.addColorStop(0.5, rgba("#ffffff", 0.5 * burst));
      s.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = s;
      ctx.fillRect(0, cy - 4 * unit, w, 8 * unit);

      // embers
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 46; i++) {
        const x = (rnd(i, 2) * w + Math.sin(t * 0.6 + i) * 40 * unit + w) % w;
        const y = (((rnd(i, 4) * h - t * (22 + rnd(i, 6) * 45)) % (h + 100)) + h + 100) % (h + 100) - 50;
        const r = (1.2 + rnd(i, 8) * 3.4) * unit;
        const a = 0.28 + 0.45 * Math.abs(Math.sin(t * 1.6 + i));
        const pg = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        pg.addColorStop(0, rgba(c1, a));
        pg.addColorStop(1, rgba(c1, 0));
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "cosmic_warp": {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const neb = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
      neb.addColorStop(0, rgba(c1, 0.4));
      neb.addColorStop(0.45, rgba(c2, 0.18));
      neb.addColorStop(1, "rgba(2,2,10,1)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);

      // nebula clouds
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 7; i++) {
        const a = t * 0.05 + i;
        const x = cx + Math.cos(a) * w * 0.22;
        const y = cy + Math.sin(a * 1.3) * h * 0.24;
        const r = w * (0.16 + rnd(i, 5) * 0.2);
        const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
        cg.addColorStop(0, rgba(i % 2 ? c1 : c2, 0.17));
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, w, h);
      }

      // warp star streaks
      const speed = 0.35 + p * 0.9;
      for (let i = 0; i < 150; i++) {
        const ang = rnd(i, 2) * Math.PI * 2;
        const cycle = (rnd(i, 4) + t * speed * (0.35 + rnd(i, 6) * 0.5)) % 1;
        const dist = cycle * cycle * Math.hypot(w, h) * 0.72;
        const x = cx + Math.cos(ang) * dist;
        const y = cy + Math.sin(ang) * dist;
        const len = Math.min(120 * unit, dist * 0.22);
        const a = Math.min(1, cycle * 2.2) * 0.85;
        const sg = ctx.createLinearGradient(x, y, x - Math.cos(ang) * len, y - Math.sin(ang) * len);
        sg.addColorStop(0, rgba("#ffffff", a));
        sg.addColorStop(1, rgba(c1, 0));
        ctx.strokeStyle = sg;
        ctx.lineWidth = (0.9 + rnd(i, 8) * 1.8) * unit;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
        ctx.stroke();
      }
      break;
    }

    case "cyber_grid": {
      const horizon = h * 0.56;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#0a0418");
      sky.addColorStop(1, rgba(c2, 0.5));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);

      // sun
      const sunR = w * 0.13;
      const sg = ctx.createLinearGradient(0, horizon - sunR * 1.6, 0, horizon);
      sg.addColorStop(0, rgba(c2, 1));
      sg.addColorStop(1, rgba(c1, 1));
      ctx.save();
      ctx.beginPath();
      ctx.arc(w * 0.5, horizon - sunR * 0.15, sunR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      // scan gaps in the sun
      ctx.fillStyle = "rgba(6,2,16,0.85)";
      for (let i = 0; i < 7; i++) {
        const y = horizon - sunR * 1.1 + i * sunR * 0.28 + Math.sin(t * 1.2) * 2 * unit;
        ctx.fillRect(w * 0.3, y, w * 0.4, sunR * (0.04 + i * 0.013));
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glow = ctx.createRadialGradient(w * 0.5, horizon, 0, w * 0.5, horizon, w * 0.4);
      glow.addColorStop(0, rgba(c1, 0.35));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // ground
      ctx.fillStyle = "#06020e";
      ctx.fillRect(0, horizon, w, h - horizon);

      // perspective grid
      ctx.strokeStyle = rgba(c1, 0.75);
      ctx.lineWidth = 1.4 * unit;
      for (let i = -14; i <= 14; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + i * w * 0.04, horizon);
        ctx.lineTo(w * 0.5 + i * w * 0.42, h);
        ctx.stroke();
      }
      const scroll = (t * 0.45) % 1;
      for (let i = 0; i < 16; i++) {
        const f = (i + scroll) / 16;
        const y = horizon + Math.pow(f, 2.3) * (h - horizon);
        ctx.globalAlpha = Math.min(1, f * 2.4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case "ink_bloom": {
      ctx.fillStyle = "#04060c";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 16; i++) {
        const life = (t * 0.16 + rnd(i, 3)) % 1;
        const x = w * (0.12 + rnd(i, 5) * 0.76) + Math.sin(t * 0.25 + i) * w * 0.04;
        const y = h * (0.15 + rnd(i, 7) * 0.7) + Math.cos(t * 0.2 + i) * h * 0.05;
        const r = w * (0.05 + life * (0.16 + rnd(i, 9) * 0.14));
        const a = Math.sin(life * Math.PI) * 0.4;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(i % 2 ? c1 : c2, a));
        g.addColorStop(0.55, rgba(i % 2 ? c2 : c1, a * 0.4));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "light_sweep": {
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#0b1020");
      bg.addColorStop(1, "#050810");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const phase = (t * 0.22 + i * 0.2) % 1.4 - 0.2;
        const x = phase * w * 1.25;
        const bw = w * (0.08 + rnd(i, 3) * 0.13);
        const g = ctx.createLinearGradient(x - bw, 0, x + bw, h);
        g.addColorStop(0, rgba(i % 2 ? c1 : c2, 0));
        g.addColorStop(0.5, rgba(i % 2 ? c1 : c2, 0.24));
        g.addColorStop(1, rgba(i % 2 ? c1 : c2, 0));
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(0.22);
        ctx.fillStyle = g;
        ctx.fillRect(-bw - w * 0.1, -h * 0.3, bw * 2.2, h * 1.8);
        ctx.restore();
      }
      const centre = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.5, w * 0.55);
      centre.addColorStop(0, rgba(c1, 0.16));
      centre.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = centre;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "particle_rise": {
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.75, 0, w * 0.5, h * 0.5, w * 0.8);
      bg.addColorStop(0, rgba(c2, 0.22));
      bg.addColorStop(1, "#04040a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 90; i++) {
        const x = (rnd(i, 2) * w + Math.sin(t * 0.5 + i * 0.7) * 34 * unit + w) % w;
        const y = (((rnd(i, 4) * h - t * (14 + rnd(i, 6) * 40)) % (h + 120)) + h + 120) % (h + 120) - 60;
        const big = i % 7 === 0;
        const r = (big ? 6 + rnd(i, 8) * 12 : 1 + rnd(i, 8) * 2.6) * unit;
        const a = (big ? 0.18 : 0.6) * (0.55 + 0.45 * Math.sin(t * 1.8 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        g.addColorStop(0, rgba(i % 3 ? c1 : c2, a));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "energy_pulse": {
      ctx.fillStyle = "#0a0305";
      ctx.fillRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.5;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
      core.addColorStop(0, rgba(c2, 0.45));
      core.addColorStop(0.5, rgba(c1, 0.14));
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 5; i++) {
        const cycle = (t * 0.85 + i * 0.2) % 1;
        const r = cycle * w * 0.62;
        const a = Math.pow(1 - cycle, 1.7) * 0.85;
        ctx.strokeStyle = rgba(i % 2 ? c1 : c2, a);
        ctx.lineWidth = (2 + (1 - cycle) * 12) * unit;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // impact flash on the beat
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.7)), 14);
      if (beat > 0.01) {
        ctx.fillStyle = rgba("#ffffff", beat * 0.22);
        ctx.fillRect(0, 0, w, h);
      }
      // speed lines
      for (let i = 0; i < 34; i++) {
        const ang = rnd(i, 2) * Math.PI * 2;
        const d0 = w * (0.2 + ((t * 0.8 + rnd(i, 5)) % 1) * 0.45);
        const len = w * 0.08;
        ctx.strokeStyle = rgba(c1, 0.3);
        ctx.lineWidth = 1.6 * unit;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * d0, cy + Math.sin(ang) * d0);
        ctx.lineTo(cx + Math.cos(ang) * (d0 + len), cy + Math.sin(ang) * (d0 + len));
        ctx.stroke();
      }
      break;
    }

    case "film_strip": {
      ctx.fillStyle = "#0b0805";
      ctx.fillRect(0, 0, w, h);
      // projector cone
      ctx.globalCompositeOperation = "screen";
      const cone = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.45, w * 0.62);
      const flick = 0.82 + 0.18 * Math.sin(t * 27) * Math.sin(t * 13);
      cone.addColorStop(0, rgba(c1, 0.38 * flick));
      cone.addColorStop(0.45, rgba(c1, 0.12 * flick));
      cone.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cone;
      ctx.fillRect(0, 0, w, h);

      // floating dust
      for (let i = 0; i < 60; i++) {
        const x = (rnd(i, 2) * w + t * (8 + rnd(i, 6) * 22) + w) % w;
        const y = (rnd(i, 4) * h + Math.sin(t * 0.7 + i) * 26 * unit + h) % h;
        const r = (0.9 + rnd(i, 8) * 2.4) * unit;
        ctx.fillStyle = rgba("#fff6dc", 0.16 + 0.3 * Math.sin(t * 2 + i));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // sprocket strips top & bottom
      const strip = h * 0.09;
      ctx.fillStyle = "rgba(6,4,2,0.92)";
      ctx.fillRect(0, 0, w, strip);
      ctx.fillRect(0, h - strip, w, strip);
      const holeW = w * 0.032;
      const offset = (t * 130 * unit) % (holeW * 2);
      ctx.fillStyle = "rgba(240,232,210,0.82)";
      for (let x = -holeW * 2 + offset; x < w + holeW; x += holeW * 2) {
        ctx.fillRect(x, strip * 0.28, holeW, strip * 0.44);
        ctx.fillRect(x, h - strip + strip * 0.28, holeW, strip * 0.44);
      }
      // grain
      for (let i = 0; i < 260; i++) {
        const gx = rnd(i + Math.floor(t * 24) * 0.31, 3) * w;
        const gy = rnd(i + Math.floor(t * 24) * 0.57, 7) * h;
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
        ctx.fillRect(gx, gy, 1.7 * unit, 1.7 * unit);
      }
      break;
    }

    case "aurora_silk": {
      ctx.fillStyle = "#03050e";
      ctx.fillRect(0, 0, w, h);
      // stars
      for (let i = 0; i < 90; i++) {
        const x = rnd(i, 2) * w;
        const y = rnd(i, 4) * h * 0.85;
        ctx.fillStyle = rgba("#ffffff", 0.2 + 0.5 * Math.abs(Math.sin(t * 1.3 + i)));
        ctx.fillRect(x, y, 1.6 * unit, 1.6 * unit);
      }
      ctx.globalCompositeOperation = "screen";
      for (let band = 0; band < 4; band++) {
        const col = band % 2 ? c1 : c2;
        ctx.beginPath();
        const baseY = h * (0.3 + band * 0.1);
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w; x += w / 48) {
          const y =
            baseY +
            Math.sin(x / w * 4.2 + t * 0.4 + band) * h * 0.09 +
            Math.sin(x / w * 9 + t * 0.7 + band * 2) * h * 0.035;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, baseY - h * 0.16, 0, baseY + h * 0.42);
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.35, rgba(col, 0.2));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
      break;
    }

    case "glitch_bars": {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#080a14");
      bg.addColorStop(1, "#04060c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const frame = Math.floor(t * 14);
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 16; i++) {
        const y = rnd(i + frame, 3) * h;
        const bh = (4 + rnd(i + frame, 5) * 42) * unit;
        const dx = (rnd(i + frame, 7) - 0.5) * w * 0.3;
        ctx.fillStyle = rgba(i % 2 ? c1 : c2, 0.16 + rnd(i + frame, 9) * 0.3);
        ctx.fillRect(dx, y, w, bh);
      }
      // rgb tear
      const tear = Math.sin(t * 5) * 6 * unit;
      ctx.fillStyle = rgba(c1, 0.1);
      ctx.fillRect(-tear, 0, w, h);
      ctx.fillStyle = rgba(c2, 0.1);
      ctx.fillRect(tear, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      // scanlines
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      for (let y = 0; y < h; y += Math.max(2, 3 * unit)) ctx.fillRect(0, y, w, 1.2 * unit);
      break;
    }

    case "smoke_reveal": {
      ctx.fillStyle = "#070809";
      ctx.fillRect(0, 0, w, h);
      // hard spotlight cone from top
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - w * 0.06, -h * 0.05);
      ctx.lineTo(w * 0.5 + w * 0.06, -h * 0.05);
      ctx.lineTo(w * 0.5 + w * 0.42, h);
      ctx.lineTo(w * 0.5 - w * 0.42, h);
      ctx.closePath();
      const cone = ctx.createLinearGradient(0, 0, 0, h);
      cone.addColorStop(0, rgba("#ffffff", 0.2));
      cone.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = cone;
      ctx.fill();

      // smoke puffs
      for (let i = 0; i < 12; i++) {
        const drift = t * (0.05 + rnd(i, 5) * 0.09);
        const x = w * (0.2 + ((rnd(i, 2) + drift) % 1) * 0.6);
        const y = h * (0.35 + rnd(i, 4) * 0.55) + Math.sin(t * 0.3 + i) * h * 0.05;
        const r = w * (0.1 + rnd(i, 7) * 0.16);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(c1, 0.1));
        g.addColorStop(0.6, rgba(c1, 0.035));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "confetti_pop": {
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.5, w * 0.75);
      bg.addColorStop(0, rgba(c1, 0.28));
      bg.addColorStop(1, "#0a0512");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const palette = [c1, c2, "#4ade80", "#38bdf8", "#f97316"];
      for (let i = 0; i < 110; i++) {
        const launch = rnd(i, 3);
        const life = (t * 0.42 + launch) % 1;
        const ang = -Math.PI / 2 + (rnd(i, 5) - 0.5) * 2.1;
        const power = w * (0.3 + rnd(i, 7) * 0.5);
        const x = w * 0.5 + Math.cos(ang) * power * life;
        const y = h * 0.62 + Math.sin(ang) * power * life + Math.pow(life, 2) * h * 0.85;
        if (y > h + 20) continue;
        const size = (4 + rnd(i, 9) * 8) * unit;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (2 + rnd(i, 11) * 5) + i);
        ctx.globalAlpha = Math.min(1, (1 - life) * 2.4);
        ctx.fillStyle = palette[i % palette.length];
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      break;
    }
  }

  // shared cinematic vignette so overlaid text always reads
  ctx.globalCompositeOperation = "source-over";
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
