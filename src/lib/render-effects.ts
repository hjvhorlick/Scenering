import { Scene, SceneFilterType, SceneMotionType, TimelineInsert } from "../types";

// Convert preset position string into normalized (0..1) coordinates
export function getPresetCoords(preset?: TimelineInsert["presetPosition"]): { x: number; y: number } {
  switch (preset) {
    case "top":
      return { x: 0.5, y: 0.15 };
    case "bottom":
      return { x: 0.5, y: 0.82 };
    case "center":
      return { x: 0.5, y: 0.5 };
    case "left":
      return { x: 0.22, y: 0.5 };
    case "right":
      return { x: 0.78, y: 0.5 };
    case "top-left":
      return { x: 0.18, y: 0.15 };
    case "top-right":
      return { x: 0.82, y: 0.15 };
    case "bottom-left":
      return { x: 0.22, y: 0.82 };
    case "bottom-right":
      return { x: 0.82, y: 0.82 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

// Compute transform for scene movement
export function getMotionTransform(
  motion: SceneMotionType | undefined,
  progress: number,
  w: number,
  h: number
): { scale: number; dx: number; dy: number } {
  const p = Math.max(0, Math.min(1, progress));
  switch (motion) {
    case "slow_zoom": {
      const s = 1 + p * 0.08;
      return { scale: s, dx: -(w * s - w) / 2, dy: -(h * s - h) / 2 };
    }
    case "zoom_in": {
      const s = 1 + p * 0.22;
      return { scale: s, dx: -(w * s - w) / 2, dy: -(h * s - h) / 2 };
    }
    case "zoom_out": {
      const s = 1.22 - p * 0.18;
      return { scale: s, dx: -(w * s - w) / 2, dy: -(h * s - h) / 2 };
    }
    case "pan_left": {
      const s = 1.15;
      const totalDx = w * (s - 1);
      return { scale: s, dx: -p * totalDx, dy: -(h * s - h) / 2 };
    }
    case "pan_right": {
      const s = 1.15;
      const totalDx = w * (s - 1);
      return { scale: s, dx: -(1 - p) * totalDx, dy: -(h * s - h) / 2 };
    }
    case "subtle_camera": {
      const s = 1.05;
      const wobbleX = Math.sin(p * Math.PI * 4) * 8;
      const wobbleY = Math.cos(p * Math.PI * 3) * 6;
      return { scale: s, dx: -(w * s - w) / 2 + wobbleX, dy: -(h * s - h) / 2 + wobbleY };
    }
    case "shake": {
      const s = 1.08;
      const shakeAmt = (1 - p * 0.7) * 9;
      const sx = (Math.sin(p * 50) + Math.cos(p * 37)) * shakeAmt;
      const sy = (Math.cos(p * 45) + Math.sin(p * 29)) * shakeAmt;
      return { scale: s, dx: -(w * s - w) / 2 + sx, dy: -(h * s - h) / 2 + sy };
    }
    case "pulse": {
      const beat = Math.sin(p * Math.PI * 8);
      const s = 1.03 + Math.max(0, beat) * 0.06;
      return { scale: s, dx: -(w * s - w) / 2, dy: -(h * s - h) / 2 };
    }
    case "floating": {
      const s = 1.08;
      const floatY = Math.sin(p * Math.PI * 2) * 12;
      const floatX = Math.cos(p * Math.PI * 1.5) * 8;
      return { scale: s, dx: -(w * s - w) / 2 + floatX, dy: -(h * s - h) / 2 + floatY };
    }
    case "none":
      return { scale: 1, dx: 0, dy: 0 };
    case "ken_burns":
    default: {
      const s = 1 + p * 0.08;
      const driftX = (p - 0.5) * 20;
      return { scale: s, dx: -(w * s - w) / 2 + driftX, dy: -(h * s - h) / 2 };
    }
  }
}

// Apply scene-level filter effects
export function applySceneFilter(
  ctx: CanvasRenderingContext2D,
  filter: SceneFilterType | undefined,
  w: number,
  h: number,
  timeSec: number = 0
) {
  if (!filter || filter === "none") return;

  ctx.save();
  switch (filter) {
    case "old_movie": {
      // 1. Vintage Warm Sepia Tint
      ctx.fillStyle = "rgba(180, 130, 60, 0.16)";
      ctx.fillRect(0, 0, w, h);

      // 2. High-Density Film Grain & Dirt Specks
      const speckCount = Math.floor((w * h) / 4500);
      for (let i = 0; i < speckCount; i++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        const size = Math.random() < 0.9 ? 1.5 : Math.random() * 3 + 1;
        const isWhite = Math.random() > 0.45;
        ctx.fillStyle = isWhite ? "rgba(255, 255, 255, 0.2)" : "rgba(15, 12, 10, 0.35)";
        ctx.fillRect(gx, gy, size, size);
      }

      // 3. Film Marks, Hair, and Blotches (Fashion Marks & Spots)
      const spotSeed = Math.floor(timeSec * 8);
      const spotsCount = 4 + (spotSeed % 5);
      for (let s = 0; s < spotsCount; s++) {
        const sx = ((spotSeed * 173 + s * 397) % 1000) / 1000 * w;
        const sy = ((spotSeed * 241 + s * 509) % 1000) / 1000 * h;
        const radius = 2 + (s % 4) * 2;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = s % 2 === 0 ? "rgba(20, 15, 10, 0.45)" : "rgba(240, 230, 210, 0.35)";
        ctx.fill();

        // Irregular tiny hair/curl mark
        if (s % 3 === 0) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(sx + 6, sy - 8, sx + 14, sy + 4);
          ctx.strokeStyle = "rgba(15, 10, 5, 0.5)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      // 4. Vertical Film Scratches that jitter
      const scratchCount = 2 + (spotSeed % 3);
      for (let sc = 0; sc < scratchCount; sc++) {
        const scrX = ((spotSeed * 311 + sc * 487) % 1000) / 1000 * w;
        ctx.beginPath();
        ctx.moveTo(scrX + (Math.random() - 0.5) * 2, 0);
        ctx.lineTo(scrX + (Math.random() - 0.5) * 3, h);
        ctx.strokeStyle = sc === 0 ? "rgba(255, 255, 255, 0.28)" : "rgba(20, 15, 10, 0.3)";
        ctx.lineWidth = sc === 0 ? 1 : 1.5;
        ctx.stroke();
      }

      // 5. Projector Light Vignette
      const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.72);
      vGrad.addColorStop(0, "rgba(0,0,0,0)");
      vGrad.addColorStop(1, "rgba(20, 10, 5, 0.65)");
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);

      // 6. Subtle projector flicker
      const flicker = Math.sin(timeSec * 45) * 0.04;
      if (flicker > 0) {
        ctx.fillStyle = `rgba(255, 240, 200, ${flicker})`;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "dust_particles": {
      // Atmospheric Hazy Dust Particles with Out-of-Focus Floating Bokeh
      // 1. Warm Atmospheric Base Haze
      const hazeGrad = ctx.createLinearGradient(0, 0, w, h);
      hazeGrad.addColorStop(0, "rgba(255, 220, 160, 0.12)");
      hazeGrad.addColorStop(1, "rgba(200, 140, 80, 0.08)");
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Multi-layered Out-of-Focus Floating Dust Motes (Bokeh)
      const t = timeSec || 0;
      const numParticles = 32;
      for (let i = 0; i < numParticles; i++) {
        // Deterministic pseudo-random seed per particle
        const baseSpeed = 0.02 + (i % 5) * 0.015;
        const driftAngle = 0.3 + (i % 3) * 0.2; // drift diagonally down-right
        const initX = ((i * 197.3) % 1) * w;
        const initY = ((i * 283.7) % 1) * h;

        // Smooth cyclic movement with Brownian wobble
        const wobbleX = Math.sin(t * 1.2 + i) * 25;
        const wobbleY = Math.cos(t * 0.9 + i * 1.5) * 20;
        const currentX = (initX + t * 40 * baseSpeed + wobbleX) % (w + 100) - 50;
        const currentY = (initY + t * 25 * baseSpeed * driftAngle + wobbleY) % (h + 100) - 50;

        // Size classes: large out-of-focus bokeh vs tiny shimmering motes
        const isBokeh = i % 4 === 0;
        const radius = isBokeh ? (18 + (i % 3) * 12) * (w / 1280) : (2 + (i % 3) * 2) * (w / 1280);
        const alpha = isBokeh
          ? 0.12 + Math.sin(t * 2 + i) * 0.05
          : 0.35 + Math.sin(t * 3 + i) * 0.15;

        // Draw soft radial particle
        const pGrad = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, Math.max(1, radius));
        pGrad.addColorStop(0, `rgba(255, 245, 210, ${alpha * 1.3})`);
        pGrad.addColorStop(0.4, `rgba(255, 220, 160, ${alpha * 0.7})`);
        pGrad.addColorStop(1, "rgba(255, 200, 120, 0)");

        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(currentX, currentY, Math.max(1, radius), 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Soft golden sun glow in top-left
      const sunGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.6);
      sunGrad.addColorStop(0, "rgba(255, 235, 180, 0.16)");
      sunGrad.addColorStop(1, "rgba(255, 235, 180, 0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "sun_flare": {
      // Golden Volumetric Sunbeams & Light Streak
      const beamGrad = ctx.createLinearGradient(0, 0, w * 0.8, h);
      beamGrad.addColorStop(0, "rgba(255, 240, 190, 0.22)");
      beamGrad.addColorStop(0.3, "rgba(255, 210, 140, 0.14)");
      beamGrad.addColorStop(0.7, "rgba(255, 180, 100, 0.08)");
      beamGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, w, h);

      // Top corner radiant orb
      const orb = ctx.createRadialGradient(w * 0.15, 0, 0, w * 0.15, 0, w * 0.5);
      orb.addColorStop(0, "rgba(255, 255, 240, 0.28)");
      orb.addColorStop(0.5, "rgba(255, 200, 100, 0.12)");
      orb.addColorStop(1, "rgba(255, 200, 100, 0)");
      ctx.fillStyle = orb;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "vhs_glitch": {
      // Horizontal CRT Scanlines
      const scanlineGap = Math.max(3, Math.floor(h / 240));
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      for (let y = 0; y < h; y += scanlineGap) {
        ctx.fillRect(0, y, w, 1);
      }

      // Subtle RGB Chromatic Shift on borders
      ctx.fillStyle = "rgba(255, 0, 60, 0.05)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0, 200, 255, 0.05)";
      ctx.fillRect(3, 0, w, h);

      // Tracking noise band that rolls slowly
      const noiseY = ((timeSec * 80) % (h + 60)) - 30;
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(0, noiseY, w, 6);
      break;
    }

    case "noir": {
      // High-Contrast Silver Gelatin B&W
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      // Deep Shadow Contrast
      ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
      ctx.fillRect(0, 0, w, h);

      // Heavy Noir Vignette
      const nGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.7);
      nGrad.addColorStop(0, "rgba(0,0,0,0)");
      nGrad.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = nGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "cinematic": {
      // Teal & Orange tone mapping
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "rgba(0, 40, 60, 0.15)");
      grad.addColorStop(1, "rgba(220, 110, 20, 0.12)");
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dark_cinematic": {
      // Moody Dark Cinema: Rich cool shadows & dramatic edge darkness
      ctx.fillStyle = "rgba(5, 12, 24, 0.28)";
      ctx.fillRect(0, 0, w, h);
      const dcGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
      dcGrad.addColorStop(0, "rgba(0,0,0,0)");
      dcGrad.addColorStop(1, "rgba(2, 6, 15, 0.65)");
      ctx.fillStyle = dcGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "warm_movie": {
      // Warm Golden Cinema: Amber midtones & creamy light halation
      const wGrad = ctx.createLinearGradient(0, 0, w, h);
      wGrad.addColorStop(0, "rgba(255, 160, 40, 0.22)");
      wGrad.addColorStop(1, "rgba(230, 110, 20, 0.16)");
      ctx.fillStyle = wGrad;
      ctx.fillRect(0, 0, w, h);
      const wBloom = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.6);
      wBloom.addColorStop(0, "rgba(255, 230, 170, 0.18)");
      wBloom.addColorStop(1, "rgba(255, 200, 120, 0)");
      ctx.fillStyle = wBloom;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "cool_movie": {
      // Nordic Cool Cinema: Icy steel-blue clarity & crisp highlights
      const cGrad = ctx.createLinearGradient(0, 0, w, h);
      cGrad.addColorStop(0, "rgba(30, 130, 240, 0.2)");
      cGrad.addColorStop(1, "rgba(10, 60, 140, 0.25)");
      ctx.fillStyle = cGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "high_contrast": {
      // Punchy High Contrast: Crushed blacks & intense highlights
      const hcGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
      hcGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      hcGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.15)");
      hcGrad.addColorStop(1, "rgba(0, 0, 0, 0.55)");
      ctx.fillStyle = hcGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "vintage": {
      // 1970s Vintage Film: Warm faded tones & soft vignette
      ctx.fillStyle = "rgba(200, 150, 70, 0.26)";
      ctx.fillRect(0, 0, w, h);
      const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.75);
      vGrad.addColorStop(0, "rgba(0,0,0,0)");
      vGrad.addColorStop(1, "rgba(80, 50, 20, 0.45)");
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "film_grain": {
      // 35mm Celluloid Film Grain with animated jitter
      const seed = Math.floor(timeSec * 24);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let i = 0; i < 450; i++) {
        const gx = ((i * 397 + seed * 97) % 1000) / 1000 * w;
        const gy = ((i * 613 + seed * 193) % 1000) / 1000 * h;
        ctx.fillRect(gx, gy, 1.8, 1.8);
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      for (let i = 0; i < 350; i++) {
        const gx = ((i * 541 + seed * 223) % 1000) / 1000 * w;
        const gy = ((i * 709 + seed * 317) % 1000) / 1000 * h;
        ctx.fillRect(gx, gy, 1.8, 1.8);
      }
      break;
    }
    case "soft_glow": {
      // Soft Dream Bloom: Luminous highlight diffusion
      const glowGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
      glowGrad.addColorStop(0, "rgba(255, 245, 215, 0.28)");
      glowGrad.addColorStop(0.5, "rgba(255, 225, 180, 0.14)");
      glowGrad.addColorStop(1, "rgba(255, 210, 160, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dreamy": {
      // Dreamy Pastel Fantasy: Ethereal lavender-pink and cyan gradient
      const dGrad = ctx.createLinearGradient(0, 0, w, h);
      dGrad.addColorStop(0, "rgba(245, 170, 240, 0.26)");
      dGrad.addColorStop(0.5, "rgba(180, 200, 255, 0.18)");
      dGrad.addColorStop(1, "rgba(140, 230, 250, 0.22)");
      ctx.fillStyle = dGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "golden_hour": {
      // Golden Hour: Rich twilight sunset radiance with warm solar orb
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255, 180, 30, 0.32)");
      grad.addColorStop(0.6, "rgba(240, 100, 20, 0.22)");
      grad.addColorStop(1, "rgba(180, 40, 10, 0.2)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const sun = ctx.createRadialGradient(w * 0.85, h * 0.15, 0, w * 0.85, h * 0.15, w * 0.5);
      sun.addColorStop(0, "rgba(255, 250, 210, 0.35)");
      sun.addColorStop(0.5, "rgba(255, 190, 80, 0.15)");
      sun.addColorStop(1, "rgba(255, 160, 40, 0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "sunset_warmth": {
      // Sunset Purple & Gold: Dusky twilight with violet skies and amber horizon
      const sGrad = ctx.createLinearGradient(0, 0, 0, h);
      sGrad.addColorStop(0, "rgba(130, 30, 140, 0.26)");
      sGrad.addColorStop(0.5, "rgba(255, 90, 80, 0.28)");
      sGrad.addColorStop(1, "rgba(255, 170, 40, 0.22)");
      ctx.fillStyle = sGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "cold_blue": {
      // Deep Ocean Blue: Cool futuristic sapphire and cyan depth
      const cbGrad = ctx.createLinearGradient(0, 0, w, h);
      cbGrad.addColorStop(0, "rgba(0, 150, 240, 0.24)");
      cbGrad.addColorStop(1, "rgba(10, 40, 130, 0.35)");
      ctx.fillStyle = cbGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "haze_fog": {
      // Atmospheric Morning Mist: Foggy ground haze and soft light
      ctx.fillStyle = "rgba(225, 235, 245, 0.18)";
      ctx.fillRect(0, 0, w, h);
      const fogGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
      fogGrad.addColorStop(0, "rgba(240, 248, 255, 0)");
      fogGrad.addColorStop(1, "rgba(240, 248, 255, 0.42)");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, h * 0.4, w, h * 0.6);
      break;
    }
    case "vignette": {
      // Focus Dark Vignette: Deep feathered corner fall-off
      const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.72);
      vGrad.addColorStop(0, "rgba(0,0,0,0)");
      vGrad.addColorStop(0.7, "rgba(0,0,0,0.35)");
      vGrad.addColorStop(1, "rgba(0,0,0,0.78)");
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "black_and_white": {
      // Classic Monochrome: High-definition grayscale
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      // Subtle contrast punch
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "sepia": {
      // Antique Sepia: 19th-century photographic print
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(125, 75, 25, 0.38)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "desaturated": {
      // Muted Desaturated: Gritty documentary look
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "rgba(128,128,128,0.65)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(10, 15, 20, 0.15)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "deep_shadows": {
      // Dramatic Deep Shadows: Crushed blacks & moody chiaroscuro
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, w, h);
      const dsGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
      dsGrad.addColorStop(0, "rgba(0,0,0,0)");
      dsGrad.addColorStop(1, "rgba(0, 0, 0, 0.65)");
      ctx.fillStyle = dsGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "color_boost": {
      // Zen Nature Vibrant: Heightened lush color & clarity
      const cbBoost = ctx.createLinearGradient(0, 0, w, h);
      cbBoost.addColorStop(0, "rgba(34, 197, 94, 0.12)");
      cbBoost.addColorStop(0.5, "rgba(234, 179, 8, 0.1)");
      cbBoost.addColorStop(1, "rgba(59, 130, 246, 0.12)");
      ctx.fillStyle = cbBoost;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dramatic_hdr": {
      // Dramatic Vivid HDR: Local micro-contrast & punch
      const hdrGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.65);
      hdrGrad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
      hdrGrad.addColorStop(0.7, "rgba(0, 0, 0, 0.1)");
      hdrGrad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
      ctx.fillStyle = hdrGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
  }
  ctx.restore();
}

// Draw a rounded rectangle path helper
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
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

// Render a timeline insert onto the canvas
export function renderTimelineInsert(
  ctx: CanvasRenderingContext2D,
  insert: TimelineInsert,
  currentTime: number,
  w: number,
  h: number,
  audioLevel: number = 0.5, // 0 to 1 amplitude level
  freqData?: Uint8Array | number[] | null
) {
  // Check if item is within active time window
  const start = insert.startTime;
  const end = start + insert.duration;
  if (currentTime < start || currentTime > end) return;

  const elapsed = currentTime - start;
  const dur = insert.duration;
  const progress = elapsed / dur;

  // Smooth fade-in (0.2s) and fade-out (0.3s)
  let opacity = 1;
  if (elapsed < 0.25) opacity = elapsed / 0.25;
  if (end - currentTime < 0.3) opacity = Math.max(0, (end - currentTime) / 0.3);
  if (insert.opacity !== undefined) opacity *= insert.opacity;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Position calculation
  const pos = insert.presetPosition ? getPresetCoords(insert.presetPosition) : insert.position;
  const cx = pos.x * w;
  const cy = pos.y * h;
  const size = insert.size || 1.0;

  // Render by category/type
  switch (insert.category) {
    case "call_to_action":
      renderCallToAction(ctx, insert, cx, cy, size, elapsed);
      break;
    case "stickers":
      renderSticker(ctx, insert, cx, cy, size, elapsed);
      break;
    case "content_cards":
    case "other_cards":
    case "text_templates":
      renderContentCard(ctx, insert, cx, cy, size, w);
      break;
    case "intro":
    case "outro":
      renderIntroOutroCard(ctx, insert, cx, cy, size, w, h, elapsed, progress);
      break;
    case "filters": {
      const filterKey = (insert.type.replace("filter_", "") || insert.content?.label || "cinematic") as SceneFilterType;
      applySceneFilter(ctx, filterKey, w, h, currentTime);
      break;
    }
    case "background_music":
    case "sound_effects":
      // Audio tracks handled by media player
      break;
    case "audio_visualizers":
    case "speech_reactive":
    case "meditation":
      renderAudioVisualizer(ctx, insert, cx, cy, size, w, h, audioLevel, elapsed, freqData);
      break;
    case "special_effects":
      renderSpecialEffect(ctx, insert, w, h, elapsed, progress);
      break;
    case "branding":
    case "logo":
      renderBranding(ctx, insert, cx, cy, size);
      break;
  }

  ctx.restore();
}

// ---------------- CALL TO ACTION ----------------
function renderCallToAction(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  elapsed: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  // Subtle breathing pulse for CTA button
  const pulse = 1 + Math.sin(elapsed * 4) * 0.025;
  ctx.scale(pulse, pulse);

  const primaryText = item.content?.primaryText || item.title || "Subscribe";
  const secondaryText = item.content?.secondaryText || "";
  const icon = item.content?.label || (
    item.type.includes("subscribe") ? "🔔" :
    item.type.includes("like") ? "👍" :
    item.type.includes("follow") ? "✨" :
    item.type.includes("buy") || item.type.includes("shop") ? "🛍️" :
    item.type.includes("website") || item.type.includes("link") ? "🔗" :
    item.type.includes("app") ? "📱" :
    item.type.includes("comment") ? "💬" :
    item.type.includes("save") ? "🔖" :
    item.type.includes("community") ? "⭐" : "🚀"
  );

  const primaryCol = item.visualOptions?.primaryColor || (
    item.type.includes("subscribe") ? "#ef4444" :
    item.type.includes("like") ? "#6366f1" :
    item.type.includes("follow") ? "#0284c7" :
    item.type.includes("buy") ? "#10b981" :
    item.type.includes("website") ? "#38bdf8" :
    item.type.includes("app") ? "#8b5cf6" :
    item.type.includes("comment") ? "#f59e0b" :
    item.type.includes("save") ? "#ec4899" :
    item.type.includes("community") ? "#eab308" : "#6366f1"
  );

  const secondaryCol = item.visualOptions?.secondaryColor || "#000000";

  // Calculate dynamic dimensions based on text length
  ctx.font = "bold 17px system-ui, -apple-system, sans-serif";
  const mainTextWidth = ctx.measureText(`${icon}  ${primaryText}`).width;
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  const subTextWidth = secondaryText ? ctx.measureText(secondaryText).width : 0;
  const contentWidth = Math.max(mainTextWidth, subTextWidth);
  const bw = Math.max(220, Math.min(380, contentWidth + 48));
  const bh = secondaryText ? 62 : 52;
  const rad = Math.min(28, bh / 2);

  // Background Gradient
  const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  grad.addColorStop(0, primaryCol);
  grad.addColorStop(1, secondaryCol !== "#000000" ? secondaryCol : primaryCol);
  ctx.fillStyle = grad;

  ctx.shadowColor = primaryCol;
  ctx.shadowBlur = item.visualOptions?.has3DLook ? 20 : 10;
  ctx.shadowOffsetY = item.visualOptions?.has3DLook ? 4 : 2;

  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rad);
  ctx.fill();

  // 3D Bevel / Highlight Border
  if (item.visualOptions?.has3DLook) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Top glossy highlight reflection
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, -bw / 2 + 3, -bh / 2 + 2, bw - 6, (bh / 2) - 4, rad - 2);
    ctx.clip();
    const glossGrad = ctx.createLinearGradient(0, -bh / 2, 0, 0);
    glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.28)");
    glossGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = glossGrad;
    ctx.fill();
    ctx.restore();
  }

  // Draw Primary Text
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (secondaryText) {
    ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${icon}  ${primaryText}`, 0, -8);

    ctx.font = "500 11px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(secondaryText, 0, 14);
  } else {
    ctx.font = "bold 17px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${icon}  ${primaryText}`, 0, 1);
  }

  ctx.restore();
}

// ---------------- STICKERS ----------------
function renderSticker(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  elapsed: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  switch (item.type) {
    case "subscribe": {
      // YouTube style red button with bell
      const pulse = 1 + Math.sin(elapsed * 4) * 0.03;
      ctx.scale(pulse, pulse);

      const bw = 240;
      const bh = 56;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 28);
      ctx.fillStyle = "#e50914";
      ctx.shadowColor = "rgba(229, 9, 20, 0.4)";
      ctx.shadowBlur = 16;
      ctx.fill();

      // Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SUBSCRIBE 🔔", 0, 0);
      break;
    }
    case "like": {
      const pulse = 1 + Math.sin(elapsed * 5) * 0.04;
      ctx.scale(pulse, pulse);
      const bw = 170;
      const bh = 50;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 25);
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.7)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#6366f1";
      ctx.font = "bold 22px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("👍 LIKE", 0, 0);
      break;
    }
    case "follow": {
      const bw = 160;
      const bh = 46;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 23);
      ctx.fillStyle = "#4f46e5";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+ FOLLOW", 0, 0);
      break;
    }
    case "share": {
      const bw = 150;
      const bh = 46;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 23);
      ctx.fillStyle = "rgba(17, 24, 39, 0.9)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↗ SHARE", 0, 0);
      break;
    }
    case "comment": {
      const bw = 180;
      const bh = 46;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 23);
      ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 17px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💬 COMMENT", 0, 0);
      break;
    }
    case "bell": {
      const rot = Math.sin(elapsed * 12) * 0.15;
      ctx.rotate(rot);
      ctx.font = "56px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔔", 0, 0);
      break;
    }
    case "heart": {
      const pulse = 1 + Math.sin(elapsed * 6) * 0.12;
      ctx.scale(pulse, pulse);
      ctx.font = "56px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("❤️", 0, 0);
      break;
    }
    case "arrow": {
      const bounce = Math.sin(elapsed * 8) * 8;
      ctx.font = "50px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("👉", bounce, 0);
      break;
    }
    case "check": {
      const bw = 160;
      const bh = 46;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 23);
      ctx.fillStyle = "#059669";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✓ VERIFIED", 0, 0);
      break;
    }
    case "warning": {
      const bw = 180;
      const bh = 46;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 23);
      ctx.fillStyle = "#d97706";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚠️ WARNING", 0, 0);
      break;
    }
    case "emoji_fire": {
      ctx.font = "56px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔥", 0, 0);
      break;
    }
    default: {
      ctx.font = "50px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⭐", 0, 0);
      break;
    }
  }

  ctx.restore();
}

// ---------------- CONTENT CARDS ----------------
function renderContentCard(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number
) {
  const content = item.content || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  const cardW = Math.min(840, canvasWidth * 0.8);

  switch (item.type) {
    case "scripture":
    case "template_scripture": {
      const cardH = 210;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.85)"; // gold border
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(245, 158, 11, 0.35)";
      ctx.shadowBlur = 24;
      ctx.fill();
      ctx.stroke();

      // Golden Header Label
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      const book = content.book || "John";
      const ch = content.chapter || "3";
      const vs = content.verse || "16";
      const version = content.secondaryText || "King James Version (KJV)";
      const label = content.label || "HOLY SCRIPTURE";
      ctx.fillText(`${label} · ${book.toUpperCase()} ${ch}:${vs}`, 0, -cardH / 2 + 34);

      // Quote Text
      ctx.fillStyle = "#fef3c7";
      ctx.font = "italic 20px Georgia, serif";
      wrapText(ctx, `“${content.primaryText || "For God so loved the world, that he gave his only begotten Son..."}”`, 0, -cardH / 2 + 82, cardW - 80, 28);

      // Version Translation Footer
      ctx.fillStyle = "#d97706";
      ctx.font = "600 13px system-ui";
      ctx.fillText(`— ${book} ${ch}:${vs} (${version})`, 0, cardH / 2 - 24);
      break;
    }

    case "quote":
    case "template_quote": {
      const cardH = 190;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(10, 15, 30, 0.88)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(56, 189, 248, 0.3)";
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.stroke();

      // Quote mark
      ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
      ctx.font = "bold 64px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("“", 0, -cardH / 2 + 45);

      // Quote text
      ctx.fillStyle = "#ffffff";
      ctx.font = "italic 21px Georgia, serif";
      wrapText(ctx, `“${content.primaryText || "The only limit to our realization of tomorrow is our doubts of today."}”`, 0, -cardH / 2 + 75, cardW - 70, 30);

      const author = content.author || content.secondaryText;
      if (author) {
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 15px system-ui";
        ctx.fillText(`— ${author}`, 0, cardH / 2 - 24);
      }
      break;
    }

    case "template_lower_third": {
      const barW = Math.min(680, canvasWidth * 0.7);
      const barH = 76;
      ctx.save();
      roundRect(ctx, -barW / 2, -barH / 2, barW, barH, 12);
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.8)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.stroke();

      // Left Accent Strip
      ctx.fillStyle = "#6366f1";
      roundRect(ctx, -barW / 2, -barH / 2, 8, barH, 4);
      ctx.fill();

      // Name & Title
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      ctx.fillText(content.primaryText || "Featured Presenter", -barW / 2 + 24, -4);

      ctx.fillStyle = "#a5b4fc";
      ctx.font = "14px system-ui";
      ctx.fillText(content.secondaryText || "Lead Specialist & Speaker", -barW / 2 + 24, 22);
      ctx.restore();
      break;
    }

    case "template_key_takeaway": {
      const cardH = 160;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(6, 78, 59, 0.9)";
      ctx.strokeStyle = "rgba(52, 211, 153, 0.8)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(16, 185, 129, 0.35)";
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`💡 ${content.label || "KEY TAKEAWAY"}`, 0, -cardH / 2 + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 21px system-ui";
      wrapText(ctx, content.primaryText || "Consistency compounds faster than occasional intensity.", 0, -cardH / 2 + 72, cardW - 60, 28);

      if (content.secondaryText) {
        ctx.fillStyle = "#a7f3d0";
        ctx.font = "14px system-ui";
        ctx.fillText(content.secondaryText, 0, cardH / 2 - 20);
      }
      break;
    }

    case "template_did_you_know": {
      const cardH = 170;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(80, 7, 36, 0.9)";
      ctx.strokeStyle = "rgba(244, 63, 94, 0.8)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fb7185";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`🧠 ${content.label || "DID YOU KNOW?"}`, 0, -cardH / 2 + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      wrapText(ctx, content.primaryText || "Honey never spoils in archaeological tombs.", 0, -cardH / 2 + 72, cardW - 60, 28);

      if (content.secondaryText) {
        ctx.fillStyle = "#fecdd3";
        ctx.font = "14px system-ui";
        ctx.fillText(content.secondaryText, 0, cardH / 2 - 20);
      }
      break;
    }

    case "template_numbered_step": {
      const cardH = 150;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(46, 16, 101, 0.92)";
      ctx.strokeStyle = "rgba(167, 139, 250, 0.8)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#c4b5fd";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`🎯 STEP ${content.number || "01"} — ${content.label || "ACTION ITEM"}`, 0, -cardH / 2 + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      wrapText(ctx, content.primaryText || "Calibrate your baseline before beginning the pipeline.", 0, -cardH / 2 + 72, cardW - 60, 28);
      break;
    }

    case "fact": {
      const cardH = 170;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(20, 24, 40, 0.9)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`💡 ${content.label || "DID YOU KNOW?"}`, 0, -cardH / 2 + 34);

      ctx.fillStyle = "#f1f5f9";
      ctx.font = "500 21px system-ui";
      wrapText(ctx, content.primaryText || "Octopuses have three hearts and blue copper-based blood.", 0, -cardH / 2 + 80, cardW - 80, 30);
      break;
    }

    case "key_point": {
      const cardH = 150;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 14);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "rgba(168, 85, 247, 0.8)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#c084fc";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`★ ${content.label || "KEY TAKEAWAY"}`, 0, -cardH / 2 + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px system-ui";
      wrapText(ctx, content.primaryText || "Focus on compounding small daily improvements.", 0, -cardH / 2 + 75, cardW - 70, 32);
      break;
    }

    case "definition": {
      const cardH = 180;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("📖 DEFINITION", 0, -cardH / 2 + 32);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 24px system-ui";
      ctx.fillText(content.primaryText || "Resilience", 0, -cardH / 2 + 70);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "17px system-ui";
      wrapText(ctx, content.secondaryText || "The capacity to recover quickly from difficulties; toughness.", 0, -cardH / 2 + 105, cardW - 80, 26);
      break;
    }

    case "tip": {
      const cardH = 130;
      const tw = 480;
      roundRect(ctx, -tw / 2, -cardH / 2, tw, cardH, 14);
      ctx.fillStyle = "rgba(6, 78, 59, 0.88)";
      ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`✨ ${content.label || "PRO TIP"}`, 0, -cardH / 2 + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "500 18px system-ui";
      wrapText(ctx, content.primaryText || "Review your highlights once every Sunday.", 0, -cardH / 2 + 70, tw - 40, 26);
      break;
    }

    case "question": {
      const cardH = 160;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(30, 27, 75, 0.9)";
      ctx.strokeStyle = "rgba(129, 140, 248, 0.7)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#818cf8";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("❓ QUESTION FOR YOU", 0, -cardH / 2 + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "600 22px system-ui";
      wrapText(ctx, content.primaryText || "What would you attempt if you knew you could not fail?", 0, -cardH / 2 + 75, cardW - 70, 32);
      break;
    }

    case "list": {
      const items = content.items || ["1. First priority item", "2. Second crucial factor", "3. Third action item"];
      const cardH = 80 + items.length * 36;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#818cf8";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`📋 ${content.label || "KEY POINTS"}`, 0, -cardH / 2 + 34);

      ctx.fillStyle = "#ffffff";
      ctx.font = "18px system-ui";
      ctx.textAlign = "left";
      items.forEach((it, idx) => {
        ctx.fillText(it, -cardW / 2 + 40, -cardH / 2 + 75 + idx * 36);
      });
      break;
    }

    default: {
      const cardH = 150;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 14);
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.primaryText || item.title, 0, 0);
      break;
    }
  }

  ctx.restore();
}

// ---------------- INTRO & OUTRO OVERLAYS (FULL-SCREEN TENSION GETTERS & BRANDING) ----------------
const introVideoCache = new Map<string, HTMLVideoElement>();
const introLogoCache = new Map<string, HTMLImageElement>();

function getOrLoadIntroVideo(src: string): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  let video = introVideoCache.get(src);
  if (!video) {
    video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = true;
    introVideoCache.set(src, video);
  }
  return video;
}

function getOrLoadIntroLogo(src: string): HTMLImageElement | null {
  if (typeof document === "undefined") return null;
  let img = introLogoCache.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    introLogoCache.set(src, img);
  }
  return img;
}

function renderIntroOutroCard(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number,
  canvasHeight: number,
  elapsed: number,
  progress: number
) {
  const content = item.content || {};
  const isIntro = item.category === "intro";
  const primaryColor = item.visualOptions?.primaryColor || (isIntro ? "#eab308" : "#ef4444");
  const secondaryColor = item.visualOptions?.secondaryColor || (isIntro ? "#f59e0b" : "#b91c1c");

  ctx.save();
  // Reset translation to paint full screen canvas coordinates (0, 0, canvasWidth, canvasHeight)
  ctx.translate(-x, -y);

  // 1. VIDEO OR IMAGE FULL-SCREEN BACKGROUND PLAYBACK & SYNCHRONIZATION
  const defaultVideo = isIntro ? "/videos/intros/intro_cinematic_gold.mp4" : "/videos/outros/outro_youtube_subscribe.mp4";
  const mediaSrc = content.imageUrl || content.videoUrl || item.videoUrl || defaultVideo;
  let hasDrawnVideo = false;

  const isImageMedia = Boolean(content.imageUrl && content.imageUrl.trim().length > 0) ||
    /\.(jpeg|jpg|png|webp|gif|svg)($|\?)/i.test(mediaSrc);

  if (isImageMedia) {
    const imgEl = getOrLoadIntroLogo(mediaSrc);
    if (imgEl && (imgEl.complete || imgEl.naturalWidth > 0)) {
      ctx.drawImage(imgEl, 0, 0, canvasWidth, canvasHeight);
      hasDrawnVideo = true;
    }
  } else {
    const videoEl = getOrLoadIntroVideo(mediaSrc);
    if (videoEl) {
      try {
        // Sync video playback timestamp smoothly with insert elapsed time
        const targetTime = elapsed % (videoEl.duration || 6);
        if (Math.abs(videoEl.currentTime - targetTime) > 0.35) {
          videoEl.currentTime = targetTime;
        }
        // Handle audio volume & mute for customer video clips that might already contain sound
        const isMuted = item.audioSettings?.muted ?? false;
        const vol = item.audioSettings?.volume ?? 0.8;
        videoEl.muted = isMuted;
        videoEl.volume = isMuted ? 0 : Math.max(0, Math.min(1, vol));

        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
        if (videoEl.readyState >= 2) {
          ctx.drawImage(videoEl, 0, 0, canvasWidth, canvasHeight);
          hasDrawnVideo = true;
        }
      } catch {
        hasDrawnVideo = false;
      }
    }
  }

  // 2. PROCEDURAL HIGH-QUALITY BACKDROP FALLBACK & VIGNETTE
  if (!hasDrawnVideo) {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const bgGrad = ctx.createRadialGradient(
      canvasWidth * 0.5,
      canvasHeight * 0.45,
      canvasWidth * 0.05,
      canvasWidth * 0.5,
      canvasHeight * 0.5,
      canvasWidth * 0.75
    );

    if (item.type.includes("cyber")) {
      bgGrad.addColorStop(0, "rgba(6, 182, 212, 0.45)");
      bgGrad.addColorStop(0.5, "rgba(15, 23, 42, 0.95)");
      bgGrad.addColorStop(1, "rgba(2, 6, 23, 1.0)");
    } else if (item.type.includes("cosmic")) {
      bgGrad.addColorStop(0, "rgba(168, 85, 247, 0.45)");
      bgGrad.addColorStop(0.5, "rgba(24, 12, 48, 0.95)");
      bgGrad.addColorStop(1, "rgba(5, 5, 15, 1.0)");
    } else if (item.type.includes("countdown")) {
      bgGrad.addColorStop(0, "rgba(239, 68, 68, 0.4)");
      bgGrad.addColorStop(0.5, "rgba(40, 10, 15, 0.95)");
      bgGrad.addColorStop(1, "rgba(5, 5, 10, 1.0)");
    } else if (item.type.includes("sunset")) {
      bgGrad.addColorStop(0, "rgba(245, 158, 11, 0.45)");
      bgGrad.addColorStop(0.5, "rgba(45, 18, 10, 0.95)");
      bgGrad.addColorStop(1, "rgba(8, 6, 12, 1.0)");
    } else {
      bgGrad.addColorStop(0, "rgba(234, 179, 8, 0.35)");
      bgGrad.addColorStop(0.5, "rgba(25, 20, 10, 0.95)");
      bgGrad.addColorStop(1, "rgba(6, 6, 10, 1.0)");
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Dynamic floating embers
    for (let i = 0; i < 24; i++) {
      const px = ((i * 137 + elapsed * 35) % canvasWidth);
      const py = (canvasHeight - ((i * 83 + elapsed * 55) % canvasHeight));
      const pr = 1.5 + (i % 3) * 1.5;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor + "55";
      ctx.fill();
    }
  }

  // Dark edge vignette for contrast
  const vigGrad = ctx.createRadialGradient(
    canvasWidth * 0.5,
    canvasHeight * 0.5,
    canvasWidth * 0.3,
    canvasWidth * 0.5,
    canvasHeight * 0.5,
    canvasWidth * 0.72
  );
  vigGrad.addColorStop(0, "rgba(0, 0, 0, 0.0)");
  vigGrad.addColorStop(1, "rgba(0, 0, 0, 0.75)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 3. TENSION GETTER SPECIAL EFFECTS
  const tensionStyle = content.tensionStyle || item.tensionStyle || (
    item.type.includes("countdown") ? "countdown" :
    item.type.includes("glitch") ? "glitch" :
    item.type.includes("warp") ? "warp" :
    item.type.includes("aperture") ? "aperture" :
    item.type.includes("pulse") ? "pulse" : "flare"
  );

  if (tensionStyle === "countdown") {
    // 3-2-1 CIRCULAR TENSION GAUGE
    const gaugeR = Math.min(canvasWidth, canvasHeight) * 0.16;
    const gX = canvasWidth * 0.5;
    const gY = canvasHeight * 0.36;
    const remaining = Math.max(1, 3 - Math.floor(progress * 3));
    const subProgress = (progress * 3) % 1.0;

    // Outer track
    ctx.beginPath();
    ctx.arc(gX, gY, gaugeR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Active glowing arc
    ctx.beginPath();
    ctx.arc(gX, gY, gaugeR, -Math.PI / 2, -Math.PI / 2 + (1 - subProgress) * Math.PI * 2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Number pulse
    const numScale = 1.0 + (1 - subProgress) * 0.25;
    ctx.save();
    ctx.translate(gX, gY);
    ctx.scale(numScale, numScale);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 24;
    ctx.fillText(String(remaining), 0, 0);
    ctx.restore();
  } else if (tensionStyle === "glitch") {
    // CYBER CHROMATIC ABERRATION PULSE
    if (Math.sin(elapsed * 18) > 0.4) {
      const sliceCount = 6;
      for (let i = 0; i < sliceCount; i++) {
        const sy = (canvasHeight / sliceCount) * i + (Math.sin(elapsed * 30 + i) * 20);
        const sh = 12 + Math.random() * 24;
        const dx = (Math.sin(elapsed * 25 + i) * 24);
        ctx.fillStyle = i % 2 === 0 ? "rgba(6, 182, 212, 0.25)" : "rgba(236, 72, 153, 0.25)";
        ctx.fillRect(dx, sy, canvasWidth, sh);
      }
    }
    // High-tech corner bracket targets
    const bSize = 36;
    const bPad = 48;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(bPad, bPad + bSize);
    ctx.lineTo(bPad, bPad);
    ctx.lineTo(bPad + bSize, bPad);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(canvasWidth - bPad - bSize, bPad);
    ctx.lineTo(canvasWidth - bPad, bPad);
    ctx.lineTo(canvasWidth - bPad, bPad + bSize);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(bPad, canvasHeight - bPad - bSize);
    ctx.lineTo(bPad, canvasHeight - bPad);
    ctx.lineTo(bPad + bSize, canvasHeight - bPad);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(canvasWidth - bPad - bSize, canvasHeight - bPad);
    ctx.lineTo(canvasWidth - bPad, canvasHeight - bPad);
    ctx.lineTo(canvasWidth - bPad, canvasHeight - bPad - bSize);
    ctx.stroke();
  } else if (tensionStyle === "warp") {
    // COSMIC WARP STARFIELD STREAKS
    const cX = canvasWidth * 0.5;
    const cY = canvasHeight * 0.45;
    const starCount = 38;
    for (let i = 0; i < starCount; i++) {
      const angle = (i / starCount) * Math.PI * 2 + (elapsed * 0.3);
      const dist = ((i * 47 + elapsed * 320) % (canvasWidth * 0.55));
      const sx = cX + Math.cos(angle) * dist;
      const sy = cY + Math.sin(angle) * dist;
      const streakLen = Math.min(45, dist * 0.15);
      const ex = sx + Math.cos(angle) * streakLen;
      const ey = sy + Math.sin(angle) * streakLen;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "rgba(168, 85, 247, 0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (tensionStyle === "aperture") {
    // STUDIO CAMERA APERTURE BLADES
    const cX = canvasWidth * 0.5;
    const cY = canvasHeight * 0.38;
    const irisR = Math.min(canvasWidth, canvasHeight) * (0.12 + progress * 0.08);
    const blades = 6;
    ctx.save();
    ctx.translate(cX, cY);
    ctx.rotate(elapsed * 0.8);
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * irisR, Math.sin(a) * irisR);
      ctx.lineTo(Math.cos(a + 0.8) * (irisR * 1.6), Math.sin(a + 0.8) * (irisR * 1.6));
      ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  } else if (tensionStyle === "pulse") {
    // SHOCKWAVE HEARTBEAT PULSE
    const cX = canvasWidth * 0.5;
    const cY = canvasHeight * 0.38;
    const pulsePhase = (progress * 5) % 1.0;
    const pulseR = Math.min(canvasWidth, canvasHeight) * (0.05 + pulsePhase * 0.35);

    // Glowing expanding shockwave rings
    for (let r = 0; r < 3; r++) {
      const ringOffset = (pulsePhase + r * 0.33) % 1.0;
      const currentR = Math.min(canvasWidth, canvasHeight) * (0.05 + ringOffset * 0.3);
      ctx.beginPath();
      ctx.arc(cX, cY, currentR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, (1 - ringOffset) * 0.7)})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
  } else {
    // GOLDEN / CINEMATIC HORIZONTAL ANAMORPHIC FLARE
    const flareY = canvasHeight * 0.38;
    const flareGrad = ctx.createLinearGradient(0, flareY, canvasWidth, flareY);
    flareGrad.addColorStop(0, "rgba(234, 179, 8, 0)");
    flareGrad.addColorStop(0.3, "rgba(234, 179, 8, 0.25)");
    flareGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.85)");
    flareGrad.addColorStop(0.7, "rgba(234, 179, 8, 0.25)");
    flareGrad.addColorStop(1, "rgba(234, 179, 8, 0)");

    ctx.fillStyle = flareGrad;
    ctx.fillRect(0, flareY - 3, canvasWidth, 6);

    // Central expanding shockwave ring
    const ringProgress = (progress * 1.6) % 1.0;
    const ringR = ringProgress * (canvasWidth * 0.35);
    ctx.beginPath();
    ctx.arc(canvasWidth * 0.5, flareY, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(234, 179, 8, ${Math.max(0, 1 - ringProgress)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 4. LOGO IMAGE RENDERING (CENTERED OR TOP)
  const showLogo = content.showLogo !== false && content.includeLogo !== false;
  const logoUrl = content.logoUrl || "/scenering-logo.png";
  const logoImg = showLogo ? getOrLoadIntroLogo(logoUrl) : null;
  const logoScale = content.logoScale || 1.0;
  const logoPos = content.logoPosition || "center";

  let logoBottomY = canvasHeight * 0.32;

  if (showLogo && logoImg && (logoImg.complete || logoImg.naturalWidth > 0)) {
    const baseLogoWidth = Math.min(240, canvasWidth * 0.28) * logoScale * size;
    const aspect = (logoImg.naturalHeight || 1) / Math.max(1, logoImg.naturalWidth || 1);
    const logoHeight = baseLogoWidth * aspect;

    let lx = canvasWidth * 0.5 - baseLogoWidth * 0.5;
    let ly = logoPos === "top" ? canvasHeight * 0.12 : canvasHeight * 0.28 - logoHeight * 0.5;
    logoBottomY = ly + logoHeight;

    // Glowing halo behind logo
    const halo = ctx.createRadialGradient(
      canvasWidth * 0.5,
      ly + logoHeight * 0.5,
      10,
      canvasWidth * 0.5,
      ly + logoHeight * 0.5,
      baseLogoWidth * 0.8
    );
    halo.addColorStop(0, primaryColor + "44");
    halo.addColorStop(1, "transparent");
    ctx.fillStyle = halo;
    ctx.fillRect(lx - 40, ly - 40, baseLogoWidth + 80, logoHeight + 80);

    // Render crisp logo with drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(logoImg, lx, ly, baseLogoWidth, logoHeight);
    ctx.restore();
  }

  // 5. TEXT CONTENT OVERLAYS
  const badgeText = content.badgeText || content.label || (isIntro ? "SPECIAL PRESENTATION" : "OFFICIAL RELEASE");
  const primaryText = content.primaryText || item.title || (isIntro ? "THE ORIGINAL STORY" : "THANKS FOR WATCHING!");
  const secondaryText = content.secondaryText || (isIntro ? "An Original Scenering Production" : "Subscribe and share with your friends");

  // Dynamic layout offsets
  const textCenterY = showLogo && logoPos === "center" ? Math.max(canvasHeight * 0.52, logoBottomY + 36) : canvasHeight * 0.48;

  // Eyebrow / Tension Badge
  if (badgeText) {
    ctx.save();
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    const badgeW = ctx.measureText(badgeText.toUpperCase()).width + 36;
    const badgeH = 28;
    const bX = canvasWidth * 0.5 - badgeW * 0.5;
    const bY = textCenterY - 58;

    roundRect(ctx, bX, bY, badgeW, badgeH, 14);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = primaryColor + "aa";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText.toUpperCase(), canvasWidth * 0.5, bY + badgeH * 0.5 + 1);
    ctx.restore();
  }

  // Primary Title
  ctx.save();
  const titleFontSize = Math.max(26, Math.min(46, Math.floor(canvasWidth * 0.038))) * size;
  ctx.font = `bold ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dramatic drop shadow for 100% legibility on dynamic video frames
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#ffffff";

  wrapText(ctx, primaryText, canvasWidth * 0.5, textCenterY, canvasWidth * 0.82, titleFontSize * 1.25);
  ctx.restore();

  // Secondary Subtitle / Tagline
  if (secondaryText) {
    ctx.save();
    const subFontSize = Math.max(15, Math.min(22, Math.floor(canvasWidth * 0.018))) * size;
    ctx.font = `500 ${subFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#e2e8f0";

    wrapText(ctx, secondaryText, canvasWidth * 0.5, textCenterY + 54, canvasWidth * 0.78, subFontSize * 1.35);
    ctx.restore();
  }

  // 6. OUTRO CALL TO ACTION SLATES & SUBSCRIBE BUTTON
  if (!isIntro) {
    const slateW = Math.min(220, canvasWidth * 0.22);
    const slateH = slateW * 0.56;
    const slateY = canvasHeight * 0.74;

    // Watch Next Frame 1 (Left)
    const leftSlateX = canvasWidth * 0.5 - slateW - 18;
    roundRect(ctx, leftSlateX, slateY, slateW, slateH, 12);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▶ WATCH NEXT", leftSlateX + slateW * 0.5, slateY + slateH * 0.5);

    // Watch Next Frame 2 (Right)
    const rightSlateX = canvasWidth * 0.5 + 18;
    roundRect(ctx, rightSlateX, slateY, slateW, slateH, 12);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText("▶ RECENT VIDEO", rightSlateX + slateW * 0.5, slateY + slateH * 0.5);

    // Animated SUBSCRIBE Button in Center
    const btnW = Math.min(210, canvasWidth * 0.24);
    const btnH = 46;
    const btnX = canvasWidth * 0.5 - btnW * 0.5;
    const btnY = canvasHeight * 0.89;

    roundRect(ctx, btnX, btnY, btnW, btnH, 23);
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
    btnGrad.addColorStop(0, "#ef4444");
    btnGrad.addColorStop(1, "#b91c1c");
    ctx.fillStyle = btnGrad;
    ctx.shadowColor = "rgba(239, 68, 68, 0.5)";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔔 SUBSCRIBE", canvasWidth * 0.5, btnY + btnH * 0.5 + 1);
  }

  ctx.restore();
}

// ---------------- OTHER CARDS ----------------
function renderOtherCard(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number
) {
  const content = item.content || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  switch (item.type) {
    case "chapter": {
      const cw = Math.min(860, canvasWidth * 0.85);
      const ch = 170;
      roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 16);
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#818cf8";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.label || "CHAPTER", 0, -ch / 2 + 45);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px system-ui";
      ctx.fillText(content.primaryText || "The New Beginning", 0, -ch / 2 + 95);
      break;
    }

    case "person": {
      const pw = 360;
      const ph = 80;
      roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 12);
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.7)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 19px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(content.primaryText || "Jane Doe", -pw / 2 + 20, -ph / 2 + 32);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui";
      ctx.fillText(content.secondaryText || "Guest Speaker", -pw / 2 + 20, -ph / 2 + 58);
      break;
    }

    case "location": {
      const lw = 300;
      const lh = 56;
      roundRect(ctx, -lw / 2, -lh / 2, lw, lh, 28);
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 17px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`📍 ${content.primaryText || "Kyoto, Japan"}`, 0, 0);
      break;
    }

    case "stats": {
      const sw = 360;
      const sh = 160;
      roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 18);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#a5b4fc";
      ctx.font = "bold 56px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.number || "84%", 0, -sh / 2 + 65);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "500 16px system-ui";
      wrapText(ctx, content.primaryText || "Productivity increase reported by customers", 0, -sh / 2 + 105, sw - 40, 22);
      break;
    }

    default: {
      const bw = 400;
      const bh = 90;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 14);
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fill();

      if (content.label) {
        ctx.fillStyle = "#818cf8";
        ctx.font = "bold 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(content.label, 0, -bh / 2 + 28);
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.primaryText || item.title, 0, content.label ? 10 : 0);
      break;
    }
  }

  ctx.restore();
}

// ---------------- AUDIO & SPEECH REACTIVE VISUALIZERS ----------------
function renderAudioVisualizer(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number,
  canvasHeight: number,
  audioLevel: number,
  elapsed: number,
  freqData?: Uint8Array | number[] | null
) {
  const isRound =
    item.type === "circular_wave" ||
    item.type === "voice_pulse" ||
    item.type === "energy_ring" ||
    item.type === "pulse_circle" ||
    item.type === "minimal_voice";

  ctx.save();

  // Linear visualizers stretch over the entire scene width (unless explicitly disabled)
  const isFullWidth = !isRound && (item.visualOptions?.fullWidth !== false);
  if (isFullWidth) {
    // Center horizontally across the scene at the specified vertical position y
    ctx.translate(canvasWidth / 2, y);
  } else {
    // Round visualizers or custom-positioned items anchor at (x, y)
    ctx.translate(x, y);
  }

  // Check if real Web Audio analyzer frequency data is active (> 5 threshold)
  const hasRealFreq = Boolean(
    freqData &&
    freqData.length > 0 &&
    Array.from(freqData).some((v) => v > 5)
  );

  // Dynamic speech rhythm cadence: 3.8 Hz syllable bursts + vowel formants (15.2 Hz) + micro breathing pauses
  const syllableBurst = Math.max(0, Math.sin(elapsed * Math.PI * 3.8));
  const phonemeHarmonic = Math.sin(elapsed * 15.2) * 0.35 + 0.65;
  const pauseFactor = Math.sin(elapsed * 1.1) > -0.5 ? 1.0 : 0.15;
  const simulatedSpeechEnvelope = syllableBurst * phonemeHarmonic * pauseFactor;

  // Music beat cadence: 120 BPM drum kick (2 Hz fundamental, 4 Hz downbeat, 8 Hz hi-hat)
  const kick = Math.pow(Math.max(0, Math.sin(elapsed * Math.PI * 2)), 3) * 0.55;
  const snare = Math.pow(Math.max(0, Math.sin((elapsed + 0.25) * Math.PI * 4)), 2) * 0.35;
  const hihat = Math.abs(Math.sin(elapsed * Math.PI * 8)) * 0.25;
  const musicBeat = kick + snare + hihat;

  // Reactivity amplitude calculation
  let amp = audioLevel;
  if (hasRealFreq) {
    amp = Math.min(2.5, Math.max(0.12, audioLevel * 3.5));
  } else if (item.audioSource === "music") {
    amp = Math.max(0.2, (musicBeat * 1.6 + audioLevel * 0.4));
  } else {
    amp = Math.min(2.4, Math.max(0.12, (simulatedSpeechEnvelope * 1.75 + audioLevel * 0.45)));
  }

  const primaryColor = item.visualOptions?.primaryColor || "#38bdf8";
  const secondaryColor = item.visualOptions?.secondaryColor || "#f43f5e";
  const has3D = item.visualOptions?.has3DLook !== false;
  const glowIntensity = item.visualOptions?.glowIntensity ?? 0.85;

  switch (item.type) {
    // ---------------- 1. OSCILLOSCOPE & ACOUSTIC WAVEFORM (REAL VOICE READING) ----------------
    case "oscilloscope":
    case "waveform":
    case "voice_wave": {
      const isOsc = item.type === "oscilloscope";
      const fullW = isFullWidth ? canvasWidth : 560 * size;
      const h = 75 * size;
      const step = 4;

      // Optional oscilloscope graticule zero grid & ticks
      if (isOsc) {
        ctx.strokeStyle = "rgba(16, 185, 129, 0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-fullW / 2, 0);
        ctx.lineTo(fullW / 2, 0);
        ctx.stroke();

        for (let gx = -fullW / 2; gx <= fullW / 2; gx += 40) {
          ctx.beginPath();
          ctx.moveTo(gx, -6);
          ctx.lineTo(gx, 6);
          ctx.stroke();
        }
      }

      // Calculate wave points: authentic voice vocal formant oscillations
      const points: { x: number; y: number }[] = [];
      const halfW = fullW / 2;

      for (let x = -halfW; x <= halfW; x += step) {
        const norm = (x + halfW) / fullW;
        // Edge envelope so it blends smoothly at screen borders
        const env = Math.sin(norm * Math.PI);
        let vy = 0;

        if (hasRealFreq && freqData) {
          const binIdx = Math.min(freqData.length - 1, Math.floor(norm * (freqData.length * 0.8)));
          const binVal = (freqData[binIdx] || 0) / 255;
          const harmonicRipple = Math.sin(norm * 42 + elapsed * 18) * 0.2;
          vy = (binVal * 0.85 + harmonicRipple) * h * amp * env;
        } else if (isOsc) {
          // Real oscilloscope vocal reading:
          // Glottal pitch pulse + Vocal Tract Formants (F1, F2, F3) + vowel modulation
          const pitchPeriod = Math.sin(norm * 24 - elapsed * 16);
          const formant1 = Math.sin(norm * 58 - elapsed * 24) * 0.45;
          const formant2 = Math.sin(norm * 112 + elapsed * 32) * 0.25;
          const sibilance = Math.sin(norm * 220 - elapsed * 45) * 0.1;
          const speechJitter = Math.sin(elapsed * 28 + norm * 14) * 0.08;
          vy = (pitchPeriod + formant1 + formant2 + sibilance + speechJitter) * (h * 0.55) * amp * env;
        } else {
          // Dynamic neon acoustic wave
          const w1 = Math.sin(norm * 16 + elapsed * 10);
          const w2 = Math.cos(norm * 32 - elapsed * 14) * 0.4;
          const w3 = Math.sin(norm * 64 + elapsed * 22) * 0.2;
          vy = (w1 + w2 + w3) * (h * 0.5) * amp * env;
        }

        points.push({ x, y: vy });
      }

      // PASS 1: Broad Phosphor / Neon Ambient Glow Bloom
      ctx.beginPath();
      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = isOsc ? "rgba(16, 185, 129, 0.3)" : (primaryColor + "33");
      ctx.lineWidth = 14 * size;
      ctx.shadowColor = isOsc ? "#10b981" : primaryColor;
      ctx.shadowBlur = 24 * glowIntensity;
      ctx.stroke();

      // PASS 2: Saturated Plasma Beam
      ctx.strokeStyle = isOsc ? "#34d399" : primaryColor;
      ctx.lineWidth = 4.5 * size;
      ctx.shadowBlur = 10 * glowIntensity;
      ctx.stroke();

      // PASS 3: Laser-sharp Core Phosphor Beam
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.8 * size;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // PASS 4: Secondary Harmonic Trace (Dual-beam oscilloscope depth)
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        const p = points[i];
        const norm = (p.x + halfW) / fullW;
        const env = Math.sin(norm * Math.PI);
        const subY = Math.sin(norm * 28 + elapsed * 8) * (h * 0.3) * amp * env;
        if (i === 0) ctx.moveTo(p.x, subY);
        else ctx.lineTo(p.x, subY);
      }
      ctx.strokeStyle = isOsc ? "rgba(6, 182, 212, 0.6)" : (secondaryColor + "99");
      ctx.lineWidth = 1.4 * size;
      ctx.stroke();
      break;
    }

    // ---------------- 2. MIRROR WAVEFORM (FULL SCENE 3D SPREAD) ----------------
    case "mirror_wave": {
      const fullW = isFullWidth ? canvasWidth : 560 * size;
      const count = Math.max(36, Math.min(84, Math.floor(fullW / 18)));
      const barW = (fullW / count) - 3;
      const startX = -fullW / 2;
      const maxH = 65 * size;

      for (let i = 0; i < count; i++) {
        const norm = i / count;
        const env = Math.sin(norm * Math.PI);
        let waveHeight = 0;

        if (hasRealFreq && freqData) {
          const binIdx = Math.min(freqData.length - 1, Math.floor(norm * (freqData.length * 0.8)));
          waveHeight = Math.abs((freqData[binIdx] / 255) * 0.85 + 0.15 * Math.sin(norm * 24 + elapsed * 12)) * maxH * env * amp;
        } else {
          waveHeight = Math.abs(
            Math.sin(norm * 18 + elapsed * 10) * 0.6 +
            Math.cos(norm * 36 - elapsed * 14) * 0.4
          ) * maxH * env * amp;
        }

        const hVal = Math.max(4, waveHeight);
        const bx = startX + i * (barW + 3);

        // 3D Mirror Gradient: Top Cyan -> Mid Pink -> Bottom Cyan
        const grad = ctx.createLinearGradient(0, -hVal, 0, hVal);
        grad.addColorStop(0, primaryColor);
        grad.addColorStop(0.5, secondaryColor);
        grad.addColorStop(1, primaryColor);

        ctx.fillStyle = grad;
        ctx.beginPath();
        roundRect(ctx, bx, -hVal, barW, hVal * 2, Math.min(barW / 2, 4));
        ctx.fill();

        // 3D Specular Highlight on top and bottom caps
        if (has3D) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
          ctx.fillRect(bx + 1, -hVal + 1, barW - 2, 2);
          ctx.fillRect(bx + 1, hVal - 3, barW - 2, 2);
        }
      }

      // Center glowing dividing baseline
      ctx.beginPath();
      ctx.moveTo(-fullW / 2, 0);
      ctx.lineTo(fullW / 2, 0);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 8 * glowIntensity;
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }

    // ---------------- 3. EQUALIZER BARS, SPECTRUM & SPEECH SPECTRUM ----------------
    case "equalizer_bars":
    case "spectrum":
    case "speech_spectrum": {
      const fullW = isFullWidth ? canvasWidth : 560 * size;
      const barCount = Math.max(28, Math.min(72, Math.floor(fullW / 22)));
      const gap = 4;
      const barW = Math.max(4, (fullW / barCount) - gap);
      const startX = -fullW / 2;
      const maxHeight = 125 * size;

      for (let i = 0; i < barCount; i++) {
        const norm = i / barCount;
        let barHeight = 0;

        if (hasRealFreq && freqData) {
          const binIdx = Math.min(freqData.length - 1, Math.floor(norm * (freqData.length * 0.85)));
          const realBin = (freqData[binIdx] || 0) / 255;
          barHeight = Math.max(8, Math.min(maxHeight, realBin * maxHeight * (amp * 0.9)));
        } else {
          // Acoustic frequency bands: Bass -> Vocal Mid -> Shimmer Treble
          const isBass = i < barCount * 0.2;
          const isMid = i >= barCount * 0.2 && i < barCount * 0.65;
          const bassPulse = Math.max(0, Math.sin(elapsed * 5.0 + i * 0.3)) * (1 - norm);
          const midVoice = Math.max(0, Math.sin(elapsed * 14.0 + i * 0.5)) * simulatedSpeechEnvelope;
          const trebleShimmer = Math.abs(Math.sin(elapsed * 24.0 + i * 1.1)) * norm * 0.6;

          const energy = (isBass ? bassPulse * 1.3 : isMid ? midVoice * 1.6 : trebleShimmer) * amp;
          barHeight = Math.max(8, Math.min(maxHeight, 10 + energy * (maxHeight * 0.85)));
        }

        const bx = startX + i * (barW + gap);
        const by = -barHeight;

        // 3D Multi-Stop Vertical Gradient
        const grad = ctx.createLinearGradient(0, 0, 0, by);
        if (item.type === "spectrum") {
          // Full 5-stop Rainbow Spectrum
          grad.addColorStop(0, "#2563eb");
          grad.addColorStop(0.35, "#06b6d4");
          grad.addColorStop(0.65, "#10b981");
          grad.addColorStop(0.85, "#f59e0b");
          grad.addColorStop(1, "#ef4444");
        } else if (item.type === "speech_spectrum") {
          // Speech Formant Vocal Spectrum
          grad.addColorStop(0, "#4338ca");
          grad.addColorStop(0.4, "#6366f1");
          grad.addColorStop(0.7, "#a855f7");
          grad.addColorStop(0.9, "#ec4899");
          grad.addColorStop(1, "#f43f5e");
        } else {
          // Studio Equalizer Bars
          grad.addColorStop(0, primaryColor);
          grad.addColorStop(0.6, primaryColor);
          grad.addColorStop(0.85, secondaryColor);
          grad.addColorStop(1, "#ffffff");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        roundRect(ctx, bx, by, barW, barHeight, Math.min(barW / 2, 4));
        ctx.fill();

        // 3D Extruded Depth (Left highlight & Right shadow)
        if (has3D) {
          // Left highlight edge
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fillRect(bx, by + 3, 1.5, barHeight - 3);

          // Right shadow edge
          ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
          ctx.fillRect(bx + barW - 1.5, by + 3, 1.5, barHeight - 3);

          // Top rounded cap gloss
          ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
          ctx.fillRect(bx + 1.5, by + 1, barW - 3, 2);
        }

        // Floating Peak LED indicator cap
        const peakY = by - 5 - (Math.sin(elapsed * 4 + i) > 0.5 ? 2 : 0);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = item.type === "spectrum" ? `hsl(${norm * 280}, 90%, 60%)` : primaryColor;
        ctx.shadowBlur = 8 * glowIntensity;
        ctx.fillRect(bx, peakY, barW, 2.5);
        ctx.shadowBlur = 0;

        // Glossy studio floor reflection
        const floorGrad = ctx.createLinearGradient(0, 0, 0, 18);
        floorGrad.addColorStop(0, "rgba(56, 189, 248, 0.25)");
        floorGrad.addColorStop(1, "transparent");
        ctx.fillStyle = floorGrad;
        ctx.fillRect(bx, 0, barW, 14);
      }
      break;
    }

    // ---------------- 4. CIRCULAR FREQUENCY WAVE (RADIAL OUTWARD BARS ALL AROUND) ----------------
    case "circular_wave": {
      const baseR = Math.max(12, 60 * size);
      const numBars = 52;

      // 3D Center Hub Diaphragm
      const coreGrad = ctx.createRadialGradient(0, 0, Math.min(2, baseR * 0.1), 0, 0, baseR);
      coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      coreGrad.addColorStop(0.3, "rgba(56, 189, 248, 0.6)");
      coreGrad.addColorStop(0.85, "rgba(15, 23, 42, 0.9)");
      coreGrad.addColorStop(1, primaryColor);

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, baseR - 4), 0, Math.PI * 2);
      ctx.fill();

      // Metallic Outer Ring
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 14 * glowIntensity;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 360-Degree Radial Bars Shooting Outwards
      for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2;
        const norm = i / numBars;
        let barLen = 0;

        if (hasRealFreq && freqData) {
          const binIdx = Math.floor(norm * (freqData.length * 0.75));
          const val = (freqData[binIdx] || 0) / 255;
          barLen = Math.max(6, val * 65 * size * amp);
        } else {
          const harmonic =
            Math.sin(angle * 4 + elapsed * 6) * 0.4 +
            Math.cos(angle * 8 - elapsed * 4) * 0.35 +
            Math.sin(elapsed * 10 + i) * 0.25;
          barLen = Math.max(6, (8 + (harmonic + 1) * 26 * amp) * size);
        }

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const r1 = baseR + 2;
        const r2 = baseR + 2 + barLen;

        const x1 = cosA * r1;
        const y1 = sinA * r1;
        const x2 = cosA * r2;
        const y2 = sinA * r2;

        // Radial Outward Bar
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        // Vibrant 3D Radial Color Transition
        ctx.strokeStyle = `hsl(${190 + norm * 140}, 95%, 60%)`;
        ctx.lineWidth = Math.max(3, 4.2 * size);
        ctx.lineCap = "round";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8 * glowIntensity;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Floating Outer Peak LED Dot
        const px = cosA * (r2 + 6 * size);
        const py = sinA * (r2 + 6 * size);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(px, py, 1.8 * size, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    // ---------------- 5. MINIMAL TALKING DOTS (4 MODERN 3D AI ASSISTANT PILLS) ----------------
    case "minimal_voice": {
      const dotColors = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981"];
      const spacing = 28 * size;
      const startX = -((dotColors.length - 1) * spacing) / 2;
      const baseDotW = 12 * size;

      dotColors.forEach((color, i) => {
        const bx = startX + i * spacing;
        // Vocal syllable bounce and stretch
        const bounce = Math.sin(elapsed * 11 + i * 1.5);
        const vocalPulse = Math.max(0.15, (bounce + 1) / 2) * amp;
        const pillHeight = Math.max(baseDotW, baseDotW + vocalPulse * 44 * size);
        const by = -pillHeight / 2;

        // 3D Capsule Pill
        ctx.fillStyle = color;
        ctx.beginPath();
        roundRect(ctx, bx - baseDotW / 2, by, baseDotW, pillHeight, baseDotW / 2);
        ctx.fill();

        // 3D Specular Highlight Bulb
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.beginPath();
        ctx.arc(bx, by + baseDotW * 0.45, baseDotW * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Soft drop glow
        ctx.fillStyle = color + "44";
        ctx.beginPath();
        ctx.ellipse(bx, pillHeight / 2 + 6 * size, baseDotW * 0.6, 2.5 * size, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }

    // ---------------- 6. VOICE PULSE & ENERGY RING ----------------
    case "pulse_circle":
    case "voice_pulse":
    case "energy_ring": {
      const isRing = item.type === "energy_ring";
      const baseR = Math.max(10, 55 * size);
      const r = Math.max(1, baseR + amp * (55 * size) + Math.sin(elapsed * 6) * 6);

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = isRing ? "#f43f5e" : primaryColor;
      ctx.lineWidth = Math.max(1, 4 * size);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 20 * glowIntensity;
      ctx.stroke();

      // Inner glowing ring
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, r * 0.65), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = Math.max(1, 2 * size);
      ctx.stroke();

      // Central glowing orb
      const orbR = Math.max(1, 18 * size);
      const orbGrad = ctx.createRadialGradient(0, 0, Math.min(2, orbR * 0.2), 0, 0, orbR);
      orbGrad.addColorStop(0, "#ffffff");
      orbGrad.addColorStop(0.5, isRing ? "#f43f5e" : primaryColor);
      orbGrad.addColorStop(1, "transparent");
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(0, 0, orbR, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    default: {
      const r = Math.max(1, (40 + amp * 30) * size);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = Math.max(1, 3 * size);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

// ---------------- SPECIAL EFFECTS ----------------
function renderSpecialEffect(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  w: number,
  h: number,
  elapsed: number,
  progress: number
) {
  ctx.save();
  switch (item.type) {
    case "flash":
    case "white_flash": {
      // Rapid decay flash
      const flashAlpha = Math.max(0, 1 - progress * 1.4);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.85})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "glitch": {
      const sliceCount = 8;
      for (let i = 0; i < sliceCount; i++) {
        const sy = Math.random() * h;
        const sh = 10 + Math.random() * 30;
        const offset = (Math.random() - 0.5) * 25;
        ctx.fillStyle = i % 2 === 0 ? "rgba(255, 0, 80, 0.25)" : "rgba(0, 240, 255, 0.25)";
        ctx.fillRect(offset, sy, w, sh);
      }
      break;
    }

    case "light_leak": {
      const leakGrad = ctx.createRadialGradient(w * 0.8, h * 0.2, 50, w * 0.8, h * 0.2, w * 0.6);
      leakGrad.addColorStop(0, "rgba(255, 140, 40, 0.45)");
      leakGrad.addColorStop(0.5, "rgba(255, 70, 120, 0.2)");
      leakGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = leakGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "rain": {
      ctx.strokeStyle = "rgba(180, 210, 255, 0.35)";
      ctx.lineWidth = 1.5;
      const count = 70;
      for (let i = 0; i < count; i++) {
        const rx = ((i * 37 + elapsed * 600) % w);
        const ry = ((i * 53 + elapsed * 900) % h);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 8, ry + 25);
        ctx.stroke();
      }
      break;
    }

    case "snow": {
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      const count = 50;
      for (let i = 0; i < count; i++) {
        const sx = ((i * 47 + Math.sin(elapsed + i) * 30) % w);
        const sy = ((i * 71 + elapsed * 80) % h);
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "vhs":
    case "scan_lines": {
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1.5);
      }
      // VHS tracking bar
      const barY = (elapsed * 120) % h;
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(0, barY, w, 20);
      break;
    }

    case "bokeh": {
      const orbs = 14;
      for (let i = 0; i < orbs; i++) {
        const ox = (i * 97) % w;
        const oy = ((i * 127 + elapsed * 15) % h);
        const r = 25 + (i % 5) * 12;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 150, ${0.08 + (i % 3) * 0.04})`;
        ctx.fill();
      }
      break;
    }

    case "fog": {
      const fogGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      fogGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      fogGrad.addColorStop(1, "rgba(230, 240, 250, 0.35)");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
      break;
    }

    default:
      break;
  }
  ctx.restore();
}

// ---------------- BRANDING ----------------
function renderBranding(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  const text = item.content?.primaryText || "SCENERINGS";
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

// Helper: Wrap text inside maximum width
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

/**
 * Standardized High-Precision Image Drawer with Visible Camera Motion (Ken Burns, Zooms, Pans, Shakes)
 * Used across both VideoPreview and RenderView to guarantee identical, cinematic results.
 */
export function drawSceneImageWithMotion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scene: Scene,
  progress: number, // 0 to 1
  canvasW: number,
  canvasH: number
) {
  const p = Math.max(0, Math.min(1, progress));
  const motion = scene.motion_effect || "ken_burns";
  const userZoom = scene.image_zoom ?? 1.0;
  const userOffsetX = ((scene.image_offset_x ?? 0) / 100) * canvasW;
  const userOffsetY = ((scene.image_offset_y ?? 0) / 100) * canvasH;

  // Calculate cover dimensions
  const imgRatio = (img.naturalWidth || 16) / (img.naturalHeight || 9);
  const canvasRatio = canvasW / canvasH;
  let baseW = canvasW;
  let baseH = canvasH;
  if (imgRatio > canvasRatio) {
    baseH = canvasH;
    baseW = canvasH * imgRatio;
  } else {
    baseW = canvasW;
    baseH = canvasW / imgRatio;
  }

  // Camera Motion transforms
  let motionScale = 1.0;
  let motionPanX = 0;
  let motionPanY = 0;

  switch (motion) {
    case "zoom_in": {
      // Smooth cinematic push-in from 1.0 to 1.24
      motionScale = 1.0 + p * 0.24;
      break;
    }
    case "zoom_out": {
      // Smooth dramatic pull-out from 1.24 down to 1.02
      motionScale = 1.24 - p * 0.22;
      break;
    }
    case "pan_left": {
      // Zoomed slightly so no black edges, panning smoothly right-to-left
      motionScale = 1.18;
      const travel = canvasW * 0.12;
      motionPanX = (0.5 - p) * travel;
      break;
    }
    case "pan_right": {
      // Zoomed slightly, panning smoothly left-to-right
      motionScale = 1.18;
      const travel = canvasW * 0.12;
      motionPanX = (p - 0.5) * travel;
      break;
    }
    case "shake": {
      // Visible handheld camera shake
      motionScale = 1.14;
      const shakeAmt = (1 - p * 0.3) * (canvasW * 0.018);
      motionPanX = (Math.sin(p * 45) + Math.cos(p * 31)) * shakeAmt;
      motionPanY = (Math.cos(p * 41) + Math.sin(p * 27)) * shakeAmt;
      break;
    }
    case "floating": {
      // Gentle floating dream drift
      motionScale = 1.12;
      motionPanX = Math.sin(p * Math.PI * 2) * (canvasW * 0.025);
      motionPanY = Math.cos(p * Math.PI * 1.5) * (canvasH * 0.025);
      break;
    }
    case "slow_zoom": {
      motionScale = 1.0 + p * 0.10;
      break;
    }
    case "subtle_camera": {
      motionScale = 1.08;
      motionPanX = Math.sin(p * Math.PI * 3) * (canvasW * 0.015);
      motionPanY = Math.cos(p * Math.PI * 2) * (canvasH * 0.015);
      break;
    }
    case "pulse": {
      const beat = Math.sin(p * Math.PI * 8);
      motionScale = 1.04 + Math.max(0, beat) * 0.08;
      break;
    }
    case "none": {
      motionScale = 1.0;
      break;
    }
    case "ken_burns":
    default: {
      // Classic Ken Burns: gentle zoom + subtle diagonal drift
      motionScale = 1.04 + p * 0.14;
      motionPanX = (p - 0.5) * (canvasW * 0.04);
      motionPanY = (0.5 - p) * (canvasH * 0.03);
      break;
    }
  }

  const finalScale = userZoom * motionScale;
  const drawW = baseW * finalScale;
  const drawH = baseH * finalScale;

  const centerX = canvasW / 2 + userOffsetX + motionPanX;
  const centerY = canvasH / 2 + userOffsetY + motionPanY;

  ctx.save();
  ctx.drawImage(img, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
  ctx.restore();
}

