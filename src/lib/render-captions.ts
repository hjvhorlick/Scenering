import { CaptionsConfig } from "../types";
import {
  captionFontStack,
  getCaptionFont,
  getCaptionStyle,
  resolveCaptionStyleId,
} from "../data/caption-styles";

export const DEFAULT_CAPTIONS_CONFIG: CaptionsConfig = {
  enabled: true,
  mode: "karaoke",
  backgroundStyle: "blocked",
  preset: "newsroom_clean",
  fontSize: "medium",
  position: "bottom",
  uppercase: true,
  textColor: "#FFFFFF",
  highlightColor: "#7DD3FC",
  bgColor: "rgba(8, 12, 22, 0.72)",
  borderWidth: 1, // hairline by default — thickened from the Captions studio
  borderColor: "#000000",
  shadow: true,
  shadowStrength: 0.5,
};

/** Helper: apply letter spacing where the canvas supports it (Chrome/Edge/Safari) */
function applyLetterSpacing(ctx: CanvasRenderingContext2D, em: number) {
  const anyCtx = ctx as unknown as { letterSpacing?: string };
  if ("letterSpacing" in anyCtx && typeof anyCtx.letterSpacing === "string") {
    anyCtx.letterSpacing = `${(em || 0).toFixed(3)}em`;
  }
}

/**
 * Shared canvas caption rendering engine.
 * Used by both live VideoPreview and final offline RenderView.
 *
 * Every style draws a soft shadow *below* the text (and below the backdrop pill)
 * so the captions read as floating a little above the footage, which gives the
 * frame depth. The border is a hairline by default and thickens with borderWidth.
 */
export function renderCanvasCaptions(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  sceneProgress: number, // 0 to 1
  config: CaptionsConfig,
  w: number,
  h: number
) {
  if (!config.enabled || !rawText) return;
  const trimmed = rawText.trim();
  if (!trimmed) return;

  // ---------- Style + typography ----------
  const style = getCaptionStyle(resolveCaptionStyleId(config.preset));
  const fontDef = getCaptionFont(config.fontId || style.fontId);
  const fontFamily = captionFontStack(config.fontId || style.fontId);
  const fontWeight = config.fontWeight ?? fontDef.weight;
  const letterSpacing = config.letterSpacing ?? style.letterSpacing;
  const uppercase = config.uppercase ?? style.uppercase;

  const textToRender = uppercase ? trimmed.toUpperCase() : trimmed;
  const words = textToRender.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  // Reference everything to 720p so caption sizing is identical in preview and render
  const scale = h / 720;

  // Font size calculation based on canvas height
  let fontPx: number;
  let lineSpacingPx: number;
  switch (config.fontSize) {
    case "small":
      fontPx = Math.max(16, Math.round(h * 0.032));
      lineSpacingPx = Math.round(fontPx * 1.35);
      break;
    case "large":
      fontPx = Math.max(26, Math.round(h * 0.052));
      lineSpacingPx = Math.round(fontPx * 1.38);
      break;
    case "medium":
    default:
      fontPx = Math.max(20, Math.round(h * 0.04));
      lineSpacingPx = Math.round(fontPx * 1.36);
      break;
  }

  // Border and shadow, both scaled to the frame
  const borderWidth = Math.max(0, (config.borderWidth ?? style.borderWidth) * scale);
  const borderColor = config.borderColor || style.borderColor;
  const shadowOn = config.shadow ?? true;
  const shadowStrength = (config.shadowStrength ?? style.shadowStrength) * (shadowOn ? 1 : 0);
  const shadowOffsetY = Math.max(1, (config.shadowOffset ?? style.shadowOffset) * scale);
  const shadowBlur = Math.max(2, (config.shadowBlur ?? style.shadowBlur) * scale);

  ctx.save();
  ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  applyLetterSpacing(ctx, letterSpacing);

  // Wrap words into lines based on safe canvas width (ensuring text fits inside video borders)
  const maxLineWidth = Math.round(w * 0.78);
  const lines: { words: string[]; text: string; startIndex: number; lineIndex: number }[] = [];
  let curLineWords: string[] = [];
  let curStartIndex = 0;
  let wordIdx = 0;

  for (const word of words) {
    const testLine = curLineWords.length > 0 ? curLineWords.join(" ") + " " + word : word;
    if (ctx.measureText(testLine).width > maxLineWidth && curLineWords.length > 0) {
      lines.push({
        words: [...curLineWords],
        text: curLineWords.join(" "),
        startIndex: curStartIndex,
        lineIndex: lines.length,
      });
      curLineWords = [word];
      curStartIndex = wordIdx;
    } else {
      curLineWords.push(word);
    }
    wordIdx++;
  }
  if (curLineWords.length > 0) {
    lines.push({
      words: [...curLineWords],
      text: curLineWords.join(" "),
      startIndex: curStartIndex,
      lineIndex: lines.length,
    });
  }

  // Compute active word index for speech progress
  const totalWords = words.length;
  const activeWordGlobalIndex = Math.min(
    totalWords - 1,
    Math.floor(sceneProgress * totalWords)
  );

  // Find active line being read by voiceover
  let activeLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const endIdx = l.startIndex + l.words.length - 1;
    if (activeWordGlobalIndex >= l.startIndex && activeWordGlobalIndex <= endIdx) {
      activeLineIdx = i;
      break;
    }
    if (activeWordGlobalIndex > endIdx) {
      activeLineIdx = i;
    }
  }

  // DISPLAY MAX 2 LINES: the next line shows underneath as the first is finished.
  let firstVisibleIdx = 0;
  if (lines.length <= 2) {
    firstVisibleIdx = 0;
  } else if (activeLineIdx >= lines.length - 1) {
    firstVisibleIdx = lines.length - 2;
  } else {
    firstVisibleIdx = activeLineIdx;
  }

  const visibleLines = lines.slice(firstVisibleIdx, firstVisibleIdx + 2);
  const displayLineCount = visibleLines.length;

  // Calculate vertical position with generous safety margin from canvas borders
  let startY: number;
  const totalBlockHeight = displayLineCount * lineSpacingPx;
  switch (config.position) {
    case "top":
      startY = Math.max(32, Math.round(h * 0.12)) + lineSpacingPx / 2;
      break;
    case "center":
      startY = Math.round((h - totalBlockHeight) / 2) + lineSpacingPx / 2;
      break;
    case "bottom":
    default:
      // Keep comfortably elevated above bottom edge and timeline progress bar
      startY = h - Math.max(42, Math.round(h * 0.10)) - (displayLineCount - 1) * lineSpacingPx;
      break;
  }

  /** Hairline border + a shadow that falls below the text */
  const strokeWord = (text: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.save();
    ctx.textAlign = align;
    if (shadowStrength > 0) {
      ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.95, shadowStrength)})`;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowOffsetY;
    }
    if (borderWidth > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      ctx.strokeText(text, x, y);
    }
    ctx.restore();
  };

  // Render the max 2 visible lines
  visibleLines.forEach((lineObj, displayIdx) => {
    const lineY = startY + displayIdx * lineSpacingPx;
    const lineWidth = ctx.measureText(lineObj.text).width;
    const lineStartX = (w - lineWidth) / 2;

    // 1. Background backdrop (if blocked) — floating on its own shadow
    if (config.backgroundStyle === "blocked") {
      const padX = Math.round(fontPx * 0.65);
      const padY = Math.round(fontPx * 0.35);
      const maxBgW = Math.round(w * 0.88);
      const bgW = Math.min(lineWidth + padX * 2, maxBgW);
      const bgH = lineSpacingPx + padY;
      const bgX = (w - bgW) / 2;
      const bgY = lineY - bgH / 2;

      ctx.save();
      ctx.fillStyle = config.bgColor || "rgba(0, 0, 0, 0.72)";
      ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.6, 0.28 + shadowStrength * 0.4)})`;
      ctx.shadowBlur = shadowBlur * 0.9;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(1.5, shadowOffsetY * 0.8);
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(bgX, bgY, bgW, bgH, Math.min(12, Math.round(bgH * 0.25)));
      } else {
        ctx.rect(bgX, bgY, bgW, bgH);
      }
      ctx.fill();
      ctx.restore();
    }

    // 2. Text Drawing
    if (config.mode === "karaoke") {
      // In Karaoke mode, draw word by word, highlighting active and sung words
      let currentX = lineStartX;

      lineObj.words.forEach((wrd, wInLineIdx) => {
        const globalWrdIdx = lineObj.startIndex + wInLineIdx;
        const isCurrentActive = globalWrdIdx === activeWordGlobalIndex;
        const isAlreadySung = globalWrdIdx < activeWordGlobalIndex;

        // Soft shadow below every word, so the whole line floats in the frame
        strokeWord(wrd, currentX, lineY, "left");

        ctx.save();
        ctx.textAlign = "left";

        if (isCurrentActive) {
          ctx.fillStyle = config.highlightColor || style.highlightColor;
          if (style.category === "Artsy" || style.shadowStrength > 0.65) {
            // glow styles keep a coloured halo on the active word
            ctx.shadowColor = ctx.fillStyle as string;
            ctx.shadowBlur = Math.max(6, shadowBlur * 0.9);
            ctx.shadowOffsetY = Math.max(1, shadowOffsetY * 0.4);
          } else {
            ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.9, shadowStrength)})`;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetY = shadowOffsetY;
          }
        } else if (isAlreadySung) {
          ctx.fillStyle = config.textColor || style.textColor;
        } else {
          // Upcoming words in a soft tone for clean anticipation
          ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
        }

        ctx.fillText(wrd, currentX, lineY);
        ctx.restore();

        currentX += ctx.measureText(wrd + " ").width;
      });
    } else {
      // In Normal mode, draw the full uniform phrase
      strokeWord(lineObj.text, w / 2, lineY, "center");

      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = config.textColor || style.textColor;
      ctx.fillText(lineObj.text, w / 2, lineY);
      ctx.restore();
    }
  });

  applyLetterSpacing(ctx, 0);
  ctx.restore();
}
