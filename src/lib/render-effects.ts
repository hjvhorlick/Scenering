import { SceneFilterType, SceneMotionType, TimelineInsert } from "../types";

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
  h: number
) {
  if (!filter || filter === "none") return;

  ctx.save();
  switch (filter) {
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
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "warm_movie": {
      ctx.fillStyle = "rgba(255, 140, 20, 0.12)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "cool_movie": {
      ctx.fillStyle = "rgba(40, 120, 220, 0.14)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "high_contrast": {
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "vintage": {
      ctx.fillStyle = "rgba(180, 140, 70, 0.22)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "film_grain": {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      for (let i = 0; i < 400; i++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        ctx.fillRect(gx, gy, 2, 2);
      }
      break;
    }
    case "soft_glow": {
      ctx.fillStyle = "rgba(255, 240, 200, 0.12)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dreamy": {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
      grad.addColorStop(0, "rgba(255, 210, 240, 0.18)");
      grad.addColorStop(1, "rgba(160, 190, 255, 0.14)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "golden_hour": {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255, 190, 40, 0.24)");
      grad.addColorStop(1, "rgba(230, 90, 20, 0.16)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "sunset_warmth": {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255, 100, 80, 0.2)");
      grad.addColorStop(1, "rgba(120, 30, 120, 0.18)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "cold_blue": {
      ctx.fillStyle = "rgba(20, 90, 180, 0.2)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "haze_fog": {
      ctx.fillStyle = "rgba(230, 240, 250, 0.16)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "vignette": {
      const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
      vGrad.addColorStop(0, "rgba(0,0,0,0)");
      vGrad.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "black_and_white": {
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "sepia": {
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(112, 66, 20, 0.25)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "desaturated": {
      ctx.globalCompositeOperation = "color";
      ctx.fillStyle = "rgba(128,128,128,0.5)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "deep_shadows": {
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "color_boost": {
      ctx.fillStyle = "rgba(255, 200, 0, 0.08)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "dramatic_hdr": {
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
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
  audioLevel: number = 0.5 // 0 to 1 amplitude level
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
      renderContentCard(ctx, insert, cx, cy, size, w);
      break;
    case "other_cards":
      renderOtherCard(ctx, insert, cx, cy, size, w);
      break;
    case "audio_visualizers":
    case "speech_reactive":
    case "meditation":
      renderAudioVisualizer(ctx, insert, cx, cy, size, w, h, audioLevel, elapsed);
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

  switch (item.type) {
    case "subscribe_cta": {
      const bw = 240;
      const bh = 56;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 28);
      // 3D Red Gradient
      const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      grad.addColorStop(0, "#ef4444");
      grad.addColorStop(1, "#b91c1c");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(220, 38, 38, 0.65)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      ctx.fill();

      // Border highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`🔔 ${primaryText}`, 0, 1);
      break;
    }

    case "follow_cta": {
      const bw = 230;
      const bh = 52;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 26);
      const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      grad.addColorStop(0, "#0284c7");
      grad.addColorStop(1, "#0369a1");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(2, 132, 199, 0.6)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 17px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`✨ ${primaryText}`, 0, 1);
      break;
    }

    case "like_share_cta": {
      const bw = 250;
      const bh = 54;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 16);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 16;
      ctx.fill();

      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`👍 ${primaryText}`, 0, 1);
      break;
    }

    case "buy_now_cta": {
      const bw = 220;
      const bh = 52;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 26);
      const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(1, "#047857");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(16, 185, 129, 0.6)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 17px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`🛍️ ${primaryText}`, 0, 1);
      break;
    }

    case "visit_website_cta": {
      const bw = 240;
      const bh = 50;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 14);
      ctx.fillStyle = "rgba(24, 24, 27, 0.94)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 14;
      ctx.fill();

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`🔗 ${primaryText}`, 0, 1);
      break;
    }

    default: {
      const bw = 230;
      const bh = 52;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 26);
      const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      grad.addColorStop(0, "#6366f1");
      grad.addColorStop(1, "#4338ca");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(99, 102, 241, 0.6)";
      ctx.shadowBlur = 16;
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 17px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`📢 ${primaryText}`, 0, 1);
      break;
    }
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
    case "scripture": {
      const cardH = 200;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.strokeStyle = "rgba(234, 179, 8, 0.75)"; // gold border
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 24;
      ctx.fill();
      ctx.stroke();

      // Golden Header Label
      ctx.fillStyle = "#eab308";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.letterSpacing = "2px";
      const ref = [content.book || "Scripture", content.chapter ? `${content.chapter}:${content.verse || ""}` : ""].filter(Boolean).join(" ");
      ctx.fillText(`HOLY SCRIPTURE · ${ref.toUpperCase()}`, 0, -cardH / 2 + 34);

      // Quote Text
      ctx.fillStyle = "#f8fafc";
      ctx.font = "italic 22px Georgia, serif";
      wrapText(ctx, `“${content.primaryText || "The Lord is my shepherd; I shall not want."}”`, 0, -cardH / 2 + 82, cardW - 80, 32);

      // Reference
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 16px system-ui";
      ctx.fillText(`— ${ref}`, 0, cardH / 2 - 28);
      break;
    }

    case "quote": {
      const cardH = 190;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
      ctx.fillStyle = "rgba(10, 15, 30, 0.85)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.stroke();

      // Quote mark
      ctx.fillStyle = "rgba(99, 102, 241, 0.35)";
      ctx.font = "bold 64px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("“", 0, -cardH / 2 + 45);

      // Quote text
      ctx.fillStyle = "#ffffff";
      ctx.font = "italic 22px Georgia, serif";
      wrapText(ctx, `“${content.primaryText || "Your time is limited, so don't waste it living someone else's life."}”`, 0, -cardH / 2 + 75, cardW - 70, 32);

      if (content.author) {
        ctx.fillStyle = "#818cf8";
        ctx.font = "bold 15px system-ui";
        ctx.fillText(`— ${content.author}`, 0, cardH / 2 - 24);
      }
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
  elapsed: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  // Reactivity based on selected audio source
  let amp = audioLevel;
  if (item.audioSource === "music") {
    // Rhythmic musical beat for videos without voiceovers
    const beat = (Math.sin(elapsed * 8) * 0.5 + 0.5) * 0.65 + (Math.sin(elapsed * 16) * 0.5 + 0.5) * 0.35;
    amp = Math.max(0.22, beat);
  } else {
    // Connected to main voiceover narration
    amp = Math.max(0.08, audioLevel);
  }

  const customColor = item.visualOptions?.primaryColor;

  switch (item.type) {
    case "waveform":
    case "voice_wave": {
      const w = 500;
      const h = 70;
      ctx.beginPath();
      for (let i = -w / 2; i <= w / 2; i += 4) {
        const norm = (i + w / 2) / w;
        const envelope = Math.sin(norm * Math.PI);
        const wave = Math.sin(norm * 25 + elapsed * 10) * Math.cos(norm * 14 - elapsed * 6);
        const vy = wave * h * amp * envelope;
        if (i === -w / 2) ctx.moveTo(i, vy);
        else ctx.lineTo(i, vy);
      }
      ctx.strokeStyle = item.type === "voice_wave" ? "#38bdf8" : "#818cf8";
      ctx.lineWidth = 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.stroke();
      break;
    }

    case "mirror_wave": {
      const w = 500;
      const h = 60;
      // Top wave
      ctx.beginPath();
      for (let i = -w / 2; i <= w / 2; i += 4) {
        const norm = (i + w / 2) / w;
        const envelope = Math.sin(norm * Math.PI);
        const wave = Math.abs(Math.sin(norm * 20 + elapsed * 8)) * h * amp * envelope;
        if (i === -w / 2) ctx.moveTo(i, -wave);
        else ctx.lineTo(i, -wave);
      }
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Bottom wave
      ctx.beginPath();
      for (let i = -w / 2; i <= w / 2; i += 4) {
        const norm = (i + w / 2) / w;
        const envelope = Math.sin(norm * Math.PI);
        const wave = Math.abs(Math.sin(norm * 20 + elapsed * 8)) * h * amp * envelope;
        if (i === -w / 2) ctx.moveTo(i, wave);
        else ctx.lineTo(i, wave);
      }
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    }

    case "pulse_circle":
    case "voice_pulse":
    case "energy_ring": {
      const baseR = 50;
      const r = baseR + amp * 45 + Math.sin(elapsed * 6) * 6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = item.type === "energy_ring" ? "#f59e0b" : "#6366f1";
      ctx.lineWidth = 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 18;
      ctx.stroke();

      // Inner faint ring
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    case "circular_wave": {
      const r = 70;
      const points = 48;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const bump = Math.sin(angle * 8 + elapsed * 10) * amp * 22;
        const px = Math.cos(angle) * (r + bump);
        const py = Math.sin(angle) * (r + bump);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = "#ec4899";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#ec4899";
      ctx.shadowBlur = 14;
      ctx.stroke();
      break;
    }

    case "equalizer_bars":
    case "spectrum":
    case "speech_spectrum": {
      const barCount = 24;
      const totalW = 440;
      const barW = totalW / barCount - 4;
      for (let i = 0; i < barCount; i++) {
        const norm = i / barCount;
        const phase = Math.sin(norm * Math.PI * 3 + elapsed * 10);
        const h = 10 + Math.max(0, phase * 65 * amp);
        const bx = -totalW / 2 + i * (barW + 4);
        roundRect(ctx, bx, -h, barW, h, 3);
        ctx.fillStyle = item.type === "spectrum" ? `hsl(${norm * 280}, 85%, 60%)` : "#6366f1";
        ctx.fill();
      }
      break;
    }

    case "breathing_circle": {
      // Gentle meditation pacing: 4s inhale, 4s exhale
      const breath = (Math.sin(elapsed * 0.8) + 1) / 2; // 0 to 1
      const r = 45 + breath * 35;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#10b981";
      ctx.shadowBlur = 16;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(breath > 0.5 ? "Inhale..." : "Exhale...", 0, 0);
      break;
    }

    case "gentle_wave":
    case "water_ripple": {
      const rings = 3;
      for (let i = 0; i < rings; i++) {
        const ringProgress = (elapsed * 0.4 + i / rings) % 1;
        const r = ringProgress * 120;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - ringProgress) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      break;
    }

    case "minimal_voice": {
      // 3 modern talking dots
      const dots = [-30, 0, 30];
      dots.forEach((dx, i) => {
        const dotBounce = Math.sin(elapsed * 12 + i * 1.5) * amp * 12;
        ctx.beginPath();
        ctx.arc(dx, dotBounce, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
      });
      break;
    }

    default: {
      const r = 40 + amp * 30;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 3;
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
