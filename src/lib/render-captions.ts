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
  /**
   * Transparent by default: the caption sits on the footage with no box
   * behind it. A solid backdrop has to be opted into, never inherited.
   */
  backgroundStyle: "transparent",
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

/**
 * Normalizes raw script text for subtitle display:
 * 1. Strips leading speaker labels (e.g. "NARRATOR:", "SPEAKER 1:", "HOST (V.O.):")
 * 2. Strips bracketed stage directions (e.g. "[sighs]", "(pause)", "[chuckles]")
 * 3. Strips markdown asterisks and formatting symbols
 * 4. Removes emojis so no weird squares or missing glyphs appear in the video
 */
export function cleanCaptionText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = raw;

  // 1. Remove leading speaker cues
  text = text.replace(
    /(?:^|\n)\s*(?:NARRATOR|VOICEOVER|HOST|SPEAKER\s*\d+|CHARACTER|WOMAN|MAN|VOICE|INTERVIEWER)(?:\s*\([^)]*\))?\s*:\s*/gi,
    ""
  );

  // 2. Remove bracketed/parenthesized stage cues
  text = text.replace(/\[[^\]]*\]/g, "");
  text = text.replace(/\([^)]*(?:pause|beat|sigh|laugh|softly|whisper)[^)]*\)/gi, "");

  // 3. Remove markdown bold/italic asterisks & formatting
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  text = text.replace(/\*/g, "");
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, "$1");
  text = text.replace(/_/g, " ");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/`/g, "");
  text = text.replace(/~{1,2}([^~]+)~{1,2}/g, "$1");
  text = text.replace(/~/g, "");

  // 4. Strip emojis & unicode dingbats that may render as missing glyphs in video fonts
  text = text.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
    ""
  );

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Shared canvas caption rendering engine.
 * Used by both live VideoPreview and final offline RenderView.
 *
 * Ensures 100% letter-by-letter rendering accuracy with rock-solid spacing,
 * stable multi-line paging, and natural syllable-weighted timing.
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
  const cleaned = cleanCaptionText(rawText);
  if (!cleaned) return;

  // ---------- Style + typography ----------
  const style = getCaptionStyle(resolveCaptionStyleId(config.preset));
  const fontDef = getCaptionFont(config.fontId || style.fontId);
  const fontFamily = captionFontStack(config.fontId || style.fontId);
  const fontWeight = config.fontWeight ?? fontDef.weight;
  const uppercase = config.uppercase ?? style.uppercase;

  const textToRender = uppercase ? cleaned.toUpperCase() : cleaned;
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

  const spaceWidth = ctx.measureText(" ").width;

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

  // Natural speech rhythm weighting:
  // Short connector words (a, to, in, of) pass quickly; longer polysyllabic words
  // receive their proportional speaking duration; citations with numbers (3:16-18)
  // receive adequate time so the highlight never rushes ahead of spoken verses.
  const totalWords = words.length;
  const wordWeights = words.map((w) => {
    // Numbers & citations (e.g. "3:16-18", "8:28", "$100", "2025")
    if (/\d/.test(w)) {
      const digits = w.replace(/\D/g, "").length;
      return Math.max(3.8, digits * 1.8);
    }
    const cleanWord = w.replace(/[^a-zA-Z]/g, "").toLowerCase();
    const len = cleanWord.length;
    if (len <= 2) return 1.6;
    if (len <= 4) return 2.4;
    // Estimate syllables from vowel clusters
    const vowelMatches = cleanWord.match(/[aeiouy]{1,2}/g);
    const estSyllables = vowelMatches ? Math.max(1, vowelMatches.length) : Math.ceil(len / 3);
    let weight = estSyllables * 2.2 + len * 0.35;
    if (/[,\-;:]$/.test(w)) weight += 1.8;
    if (/[.!?]$/.test(w)) weight += 3.2;
    return weight;
  });
  const totalWeight = Math.max(1, wordWeights.reduce((a, b) => a + b, 0));

  let activeWordGlobalIndex = 0;
  const safeProgress = Math.max(0, Math.min(1, Number.isFinite(sceneProgress) ? sceneProgress : 0));
  if (safeProgress >= 1) {
    activeWordGlobalIndex = totalWords - 1;
  } else if (safeProgress <= 0) {
    activeWordGlobalIndex = 0;
  } else {
    const targetWeight = safeProgress * totalWeight;
    let accum = 0;
    for (let i = 0; i < words.length; i++) {
      accum += wordWeights[i];
      if (targetWeight <= accum || i === words.length - 1) {
        activeWordGlobalIndex = i;
        break;
      }
    }
  }

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

  // STABLE PAGE-BASED CARDS: group into 2-line cards so the text stays rock solid
  // while being read and NEVER abruptly jerks or jumps up on every single line!
  const pageIdx = Math.floor(activeLineIdx / 2);
  const firstVisibleIdx = pageIdx * 2;

  const visibleLines = lines.slice(firstVisibleIdx, firstVisibleIdx + 2);

  // Calculate vertical position with generous safety margin from canvas borders
  let startY: number;
  const totalBlockHeight = 2 * lineSpacingPx;
  switch (config.position) {
    case "top":
      startY = Math.max(32, Math.round(h * 0.12)) + lineSpacingPx / 2;
      break;
    case "center":
      startY = Math.round((h - totalBlockHeight) / 2) + lineSpacingPx / 2;
      break;
    case "bottom":
    default:
      // Fixed bottom-anchored baseline so 1-line and 2-line cards align consistently
      startY = h - Math.max(42, Math.round(h * 0.10)) - lineSpacingPx;
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

    // Pre-measure word widths to compute exact line layout with ZERO skipped letters
    const wordWidths = lineObj.words.map((wrd) => ctx.measureText(wrd).width);
    const totalWordsWidth = wordWidths.reduce((a, b) => a + b, 0);
    const totalLineWidth = totalWordsWidth + Math.max(0, lineObj.words.length - 1) * spaceWidth;
    const lineStartX = (w - totalLineWidth) / 2;

    // 1. Background backdrop (if blocked) — floating on its own shadow
    if (config.backgroundStyle === "blocked") {
      const padX = Math.round(fontPx * 0.65);
      const padY = Math.round(fontPx * 0.35);
      const maxBgW = Math.round(w * 0.88);
      const bgW = Math.min(totalLineWidth + padX * 2, maxBgW);
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
      // In Karaoke mode, draw word by word with rock-solid spacing and highlight active words
      let currentX = lineStartX;

      lineObj.words.forEach((wrd, wInLineIdx) => {
        const globalWrdIdx = lineObj.startIndex + wInLineIdx;
        const isCurrentActive = safeProgress < 1 && globalWrdIdx === activeWordGlobalIndex;
        const isAlreadySung = safeProgress >= 1 || globalWrdIdx < activeWordGlobalIndex;
        const curWordWidth = wordWidths[wInLineIdx];

        // Soft shadow below every word
        strokeWord(wrd, currentX, lineY, "left");

        ctx.save();
        ctx.textAlign = "left";

        if (isCurrentActive) {
          ctx.fillStyle = config.highlightColor || style.highlightColor;
          ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
          ctx.shadowBlur = shadowBlur;
          ctx.shadowOffsetY = shadowOffsetY;
        } else if (isAlreadySung) {
          ctx.fillStyle = config.textColor || style.textColor;
        } else {
          // Upcoming words in soft clean tone for anticipation
          ctx.fillStyle = "rgba(255, 255, 255, 0.70)";
        }

        ctx.fillText(wrd, currentX, lineY);
        ctx.restore();

        currentX += curWordWidth + spaceWidth;
      });
    } else {
      // In Normal mode, draw the full uniform phrase centered
      strokeWord(lineObj.text, w / 2, lineY, "center");

      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = config.textColor || style.textColor;
      ctx.fillText(lineObj.text, w / 2, lineY);
      ctx.restore();
    }
  });

  ctx.restore();
}
