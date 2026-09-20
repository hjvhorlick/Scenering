import { CaptionsConfig } from "../types";

export const DEFAULT_CAPTIONS_CONFIG: CaptionsConfig = {
  enabled: true,
  mode: "karaoke",
  backgroundStyle: "blocked",
  preset: "word_pop",
  fontSize: "medium",
  position: "bottom",
  uppercase: true,
  textColor: "#ffffff",
  highlightColor: "#facc15", // bright golden yellow for karaoke active word
  bgColor: "rgba(0, 0, 0, 0.75)",
};

/**
 * Shared canvas caption rendering engine.
 * Used by both live VideoPreview and final offline RenderView.
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

  const textToRender = config.uppercase ? trimmed.toUpperCase() : trimmed;
  const words = textToRender.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

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

  ctx.save();
  ctx.font = `bold ${fontPx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "middle";

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
      words: curLineWords,
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

  // DISPLAY MAX 2 LINES:
  // "I want it to only display max 2 lines and make them fit inside the boarder of the video.
  //  the next line can show as the first is done with voice over reading."
  let firstVisibleIdx = 0;
  if (lines.length <= 2) {
    firstVisibleIdx = 0;
  } else if (activeLineIdx >= lines.length - 1) {
    // When on the final line, show the preceding line + final line to keep a stable 2-line layout
    firstVisibleIdx = lines.length - 2;
  } else {
    // Active line is on top; next line shows directly underneath it!
    // As soon as the first line is done, activeLineIdx increments and the next line becomes active on top!
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

  // Render the max 2 visible lines
  visibleLines.forEach((lineObj, displayIdx) => {
    const lineY = startY + displayIdx * lineSpacingPx;
    const lineWidth = ctx.measureText(lineObj.text).width;
    const lineStartX = (w - lineWidth) / 2;

    // 1. Background backdrop (if blocked) - strictly constrained within video boundaries
    if (config.backgroundStyle === "blocked") {
      const padX = Math.round(fontPx * 0.65);
      const padY = Math.round(fontPx * 0.35);
      const maxBgW = Math.round(w * 0.88);
      const bgW = Math.min(lineWidth + padX * 2, maxBgW);
      const bgH = lineSpacingPx + padY;
      const bgX = (w - bgW) / 2;
      const bgY = lineY - bgH / 2;

      ctx.save();
      ctx.fillStyle = config.bgColor || "rgba(0, 0, 0, 0.75)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 8;
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
      ctx.textAlign = "left";

      lineObj.words.forEach((wrd, wInLineIdx) => {
        const globalWrdIdx = lineObj.startIndex + wInLineIdx;
        const isCurrentActive = globalWrdIdx === activeWordGlobalIndex;
        const isAlreadySung = globalWrdIdx < activeWordGlobalIndex;

        ctx.save();

        if (config.backgroundStyle === "transparent") {
          // Heavy shadow/outline for transparent readability
          ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
          ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.16));
          ctx.strokeText(wrd, currentX, lineY);
        }

        if (isCurrentActive) {
          ctx.fillStyle = config.highlightColor || "#facc15";
          ctx.shadowColor = config.highlightColor || "#facc15";
          ctx.shadowBlur = 14;
        } else if (isAlreadySung) {
          ctx.fillStyle = config.textColor || "#ffffff";
        } else {
          // Upcoming words in soft white tone for clean anticipation
          ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
        }

        ctx.fillText(wrd, currentX, lineY);
        ctx.restore();

        currentX += ctx.measureText(wrd + " ").width;
      });
    } else {
      // In Normal mode, draw the full uniform phrase
      ctx.save();
      ctx.textAlign = "center";

      if (config.backgroundStyle === "transparent") {
        ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
        ctx.lineWidth = Math.max(3, Math.round(fontPx * 0.16));
        ctx.strokeText(lineObj.text, w / 2, lineY);
      }

      ctx.fillStyle = config.textColor || "#ffffff";
      ctx.fillText(lineObj.text, w / 2, lineY);
      ctx.restore();
    }
  });

  ctx.restore();
}
