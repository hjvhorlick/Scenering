/* =========================================================================
   INTRO / OUTRO SECTION RENDERER
   -------------------------------------------------------------------------
   Paints one complete intro or outro frame:

       background (motion / user video / user image)
         → animated title + subtitle + badge
         → logo
         → cinematic polish (letterbox-free, safe margins, legibility)

   Shared by the Intro & Outro studio preview, the main VideoPreview and
   the final render, so what you build is exactly what you export.
   ========================================================================= */

import { paintMotionBackground, rgba } from "../data/intro-backgrounds";
import type { SectionConfig } from "../data/intro-outro";

/* ------------------------------ media cache ------------------------------ */

const videoCache = new Map<string, HTMLVideoElement>();
const imageCache = new Map<string, HTMLImageElement>();

export function getSectionVideo(src: string): HTMLVideoElement | null {
  if (typeof document === "undefined" || !src) return null;
  let v = videoCache.get(src);
  if (!v) {
    v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.loop = true;
    videoCache.set(src, v);
  }
  return v;
}

export function getSectionImage(src: string): HTMLImageElement | null {
  if (typeof document === "undefined" || !src) return null;
  let i = imageCache.get(src);
  if (!i) {
    i = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) i.crossOrigin = "anonymous";
    i.src = src;
    imageCache.set(src, i);
  }
  return i;
}

/* -------------------------------- easing --------------------------------- */

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** window a value into 0..1 between two progress points */
const phase = (p: number, from: number, to: number) => clamp01((p - from) / Math.max(0.0001, to - from));

/* ------------------------------ text helpers ----------------------------- */

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines;
}

/* ================================ renderer =============================== */

/**
 * @param t        seconds elapsed inside the section
 * @param progress 0..1 through the section
 */
export function renderSection(
  ctx: CanvasRenderingContext2D,
  cfg: SectionConfig,
  w: number,
  h: number,
  t: number,
  progress: number
) {
  const unit = w / 1280;
  const p = clamp01(progress);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  /* ---------------------------- 1. background ---------------------------- */
  let drewMedia = false;

  const drawCover = (el: HTMLVideoElement | HTMLImageElement, nw: number, nh: number) => {
    if (!nw || !nh) return;
    const ir = nw / nh;
    const cr = w / h;
    let dw = w;
    let dh = h;
    if (ir > cr) {
      dh = h;
      dw = h * ir;
    } else {
      dw = w;
      dh = w / ir;
    }
    ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };

  if (cfg.backgroundKind === "video" && cfg.mediaUrl) {
    const v = getSectionVideo(cfg.mediaUrl);
    if (v) {
      try {
        const dur = v.duration && isFinite(v.duration) ? v.duration : 0;
        if (dur > 0.2) {
          const target = t % dur;
          if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target;
        }
        v.muted = true; // section audio is handled by the stinger/upload track
        if (v.paused) v.play().catch(() => {});
        if (v.readyState >= 2) {
          drawCover(v, v.videoWidth, v.videoHeight);
          drewMedia = true;
        }
      } catch {
        drewMedia = false;
      }
    }
  } else if (cfg.backgroundKind === "image" && cfg.mediaUrl) {
    const i = getSectionImage(cfg.mediaUrl);
    if (i && (i.complete || i.naturalWidth > 0) && i.naturalWidth > 0) {
      // gentle ken-burns so a still image still feels alive
      const zoom = 1.04 + p * 0.07;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h / 2);
      drawCover(i, i.naturalWidth, i.naturalHeight);
      ctx.restore();
      drewMedia = true;
    }
  }

  if (!drewMedia) {
    if (cfg.backgroundKind === "motion") {
      paintMotionBackground(ctx, cfg.motionId, w, h, t, p, cfg.colorA, cfg.colorB);
    } else {
      // uploaded media not ready yet — neutral backdrop instead of a white flash
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, w, h);
    }
  }

  if (drewMedia) {
    // legibility scrim over user media
    const scrim = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.24, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    scrim.addColorStop(0, "rgba(0,0,0,0.12)");
    scrim.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
  }

  /* ------------------------------ 2. logo -------------------------------- */
  const accent = cfg.accentColor || "#f5b820";
  let logoBottom = 0;

  if (cfg.logoEnabled && cfg.logoUrl) {
    const logo = getSectionImage(cfg.logoUrl);
    if (logo && logo.naturalWidth > 0) {
      const lp = phase(p, 0.04, 0.4);
      const ease = easeOutBack(lp);
      const lw = Math.min(w * 0.34, 300 * unit) * (cfg.logoScale || 1);
      const lh = lw * (logo.naturalHeight / Math.max(1, logo.naturalWidth));
      const cx = (cfg.logoX ?? 0.5) * w;
      const cy = (cfg.logoY ?? 0.3) * h;
      const lx = cx - lw / 2;
      const ly = cy - lh / 2;
      logoBottom = ly + lh;

      ctx.save();
      ctx.globalAlpha = clamp01(lp * 1.4);
      ctx.translate(cx, cy);
      ctx.scale(0.72 + ease * 0.28, 0.72 + ease * 0.28);
      ctx.translate(-cx, -cy);

      // halo
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, lw * 0.85);
      halo.addColorStop(0, rgba(accent, 0.3));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - lw, cy - lw, lw * 2, lw * 2);

      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 20 * unit;
      ctx.shadowOffsetY = 5 * unit;
      ctx.drawImage(logo, lx, ly, lw, lh);
      ctx.restore();
    }
  }

  /* ------------------------------ 3. text -------------------------------- */
  const scale = cfg.textScale || 1;
  const centerX = w * 0.5;
  const baseY = Math.max((cfg.textY ?? 0.56) * h, logoBottom + 44 * unit * scale);
  const maxTextWidth = w * 0.84;
  const titleSize = Math.max(22, Math.min(88, w * 0.062)) * scale;
  const subSize = Math.max(13, Math.min(34, w * 0.023)) * scale;
  const badgeSize = Math.max(10, Math.min(20, w * 0.0135)) * scale;
  const textCol = cfg.textColor || "#ffffff";

  // badge
  if (cfg.badge && cfg.badge.trim()) {
    const bp = phase(p, 0.02, 0.28);
    ctx.save();
    ctx.globalAlpha = clamp01(bp * 1.5);
    ctx.font = `800 ${badgeSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = cfg.badge.toUpperCase();
    const padX = 18 * unit * scale;
    const bw = ctx.measureText(label).width + padX * 2;
    const bh = badgeSize * 2.1;
    const bx = centerX - bw / 2;
    const by = baseY - titleSize * 0.95 - bh - 14 * unit;
    const r = bh / 2;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
    ctx.lineTo(bx + r, by + bh);
    ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fillStyle = "rgba(6,10,20,0.78)";
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.85);
    ctx.lineWidth = 1.6 * unit;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillText(label, centerX, by + bh / 2 + 0.5 * unit);
    ctx.restore();
  }

  // title
  const title = (cfg.title || "").trim();
  let titleBottom = baseY;
  if (title) {
    ctx.save();
    ctx.font = `900 ${titleSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrap(ctx, title, maxTextWidth);
    const lineH = titleSize * 1.16;
    const tp = phase(p, 0.08, 0.5);

    lines.forEach((line, li) => {
      const y = baseY + li * lineH;
      titleBottom = y + lineH * 0.5;
      const lineDelay = li * 0.12;
      const lp = clamp01((tp - lineDelay) / Math.max(0.15, 1 - lineDelay));

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.92)";
      ctx.shadowBlur = 26 * unit;
      ctx.shadowOffsetY = 5 * unit;
      ctx.fillStyle = textCol;

      switch (cfg.titleAnimation) {
        case "zoom_punch": {
          const e = easeOutCubic(lp);
          ctx.globalAlpha = clamp01(lp * 1.8);
          ctx.translate(centerX, y);
          ctx.scale(2.3 - e * 1.3, 2.3 - e * 1.3);
          ctx.translate(-centerX, -y);
          ctx.fillText(line, centerX, y);
          break;
        }
        case "slide_reveal": {
          const e = easeOutCubic(lp);
          const lw = ctx.measureText(line).width;
          ctx.save();
          ctx.beginPath();
          ctx.rect(centerX - lw / 2 - 4 * unit, y - lineH * 0.6, lw * e + 8 * unit, lineH * 1.2);
          ctx.clip();
          ctx.fillText(line, centerX, y);
          ctx.restore();
          // travelling wipe bar
          if (e < 1) {
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(centerX - lw / 2 + lw * e, y - lineH * 0.46, 4.5 * unit, lineH * 0.92);
          }
          break;
        }
        case "typewriter": {
          const chars = Math.max(0, Math.round(line.length * lp));
          const shown = line.slice(0, chars);
          ctx.globalAlpha = 1;
          ctx.fillText(shown, centerX, y);
          if (lp < 1 && Math.floor(t * 3) % 2 === 0) {
            const sw = ctx.measureText(shown).width;
            ctx.fillStyle = accent;
            ctx.fillRect(centerX + sw / 2 + 5 * unit, y - titleSize * 0.44, 4 * unit, titleSize * 0.88);
          }
          break;
        }
        case "letter_drop": {
          const chars = line.split("");
          const total = ctx.measureText(line).width;
          let cursor = centerX - total / 2;
          ctx.textAlign = "left";
          chars.forEach((ch, ci) => {
            const cw = ctx.measureText(ch).width;
            const delay = (ci / Math.max(1, chars.length)) * 0.55;
            const cp = clamp01((lp - delay) / 0.45);
            const e = easeOutBack(cp);
            ctx.save();
            ctx.globalAlpha = clamp01(cp * 1.6);
            ctx.translate(0, -(1 - e) * titleSize * 0.85);
            ctx.fillText(ch, cursor, y);
            ctx.restore();
            cursor += cw;
          });
          ctx.textAlign = "center";
          break;
        }
        case "glitch_in": {
          ctx.globalAlpha = clamp01(lp * 1.8);
          if (lp < 0.85) {
            const j = (1 - lp) * 14 * unit;
            ctx.save();
            ctx.globalAlpha *= 0.55;
            ctx.fillStyle = "#ff2e63";
            ctx.fillText(line, centerX - j, y);
            ctx.fillStyle = "#22d3ee";
            ctx.fillText(line, centerX + j, y);
            ctx.restore();
          }
          ctx.fillStyle = textCol;
          ctx.fillText(line, centerX + (1 - lp) * (Math.sin(t * 40) * 6 * unit), y);
          break;
        }
        default: {
          // fade_up
          const e = easeOutCubic(lp);
          ctx.globalAlpha = clamp01(lp * 1.5);
          ctx.fillText(line, centerX, y + (1 - e) * 42 * unit);
        }
      }
      ctx.restore();
    });

    // accent underline that draws itself in
    const up = phase(p, 0.3, 0.68);
    if (up > 0) {
      const uw = Math.min(maxTextWidth * 0.5, 300 * unit * scale) * easeOutCubic(up);
      ctx.save();
      ctx.globalAlpha = 0.95;
      const ug = ctx.createLinearGradient(centerX - uw / 2, 0, centerX + uw / 2, 0);
      ug.addColorStop(0, rgba(accent, 0));
      ug.addColorStop(0.5, rgba(accent, 1));
      ug.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = ug;
      ctx.fillRect(centerX - uw / 2, titleBottom + 12 * unit, uw, 3.2 * unit);
      ctx.restore();
    }
    ctx.restore();
  }

  // subtitle
  const sub = (cfg.subtitle || "").trim();
  if (sub) {
    const sp = phase(p, 0.34, 0.72);
    ctx.save();
    ctx.font = `600 ${subSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = clamp01(sp * 1.5);
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 16 * unit;
    ctx.shadowOffsetY = 3 * unit;
    ctx.fillStyle = "rgba(235,240,250,0.94)";
    const lines = wrap(ctx, sub, maxTextWidth * 0.9);
    const startY = titleBottom + 34 * unit + subSize * 0.6;
    lines.forEach((line, li) => {
      ctx.fillText(line, centerX, startY + li * subSize * 1.4 + (1 - easeOutCubic(sp)) * 20 * unit);
    });
    ctx.restore();
  }

  /* ---------------------- 4. fade in / out at the seams -------------------- */
  const fadeIn = clamp01(p / 0.06);
  const fadeOut = clamp01((1 - p) / 0.08);
  const edge = Math.min(fadeIn, fadeOut);
  if (edge < 1) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - edge).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}
