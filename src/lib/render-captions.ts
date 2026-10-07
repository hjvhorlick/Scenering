import { CaptionsConfig } from "../types";
import {
  captionFontStack,
  getCaptionFont,
  getCaptionStyle,
  getMetalFinish,
  resolveCaptionStyleId,
  type MetalFinishDef,
} from "../data/caption-styles";
import {
  activeWordIndexAt,
  alignedWordTimingsCached,
  type WordTiming,
} from "./word-sync";

/**
 * Optional real-time sync data for the captions.
 *
 * When the scene's narration was synthesised with speech marks, `wordTimings`
 * holds the *actual* spoken moment of every word
 * and `audioTimeSec` is the current position in that audio. The karaoke
 * highlight then follows the voice word-for-word instead of a syllable-weight
 * estimate, which is what used to run ahead and lag behind.
 *
 * Both fields must be present for real timing; otherwise the renderer falls
 * back to the estimate, so every existing caller keeps working unchanged.
 */
export interface CaptionSync {
  wordTimings?: WordTiming[] | null;
  audioTimeSec?: number;
}

/**
 * Put the context into its best text-drawing mode.
 *
 * Canvas defaults optimise for speed: `textRendering` is "auto" (which lets
 * the engine drop hinting and kerning precision as text scales), joins are
 * mitred, and caps are butt. On outlined caption text that shows up as
 * ragged corners on every letter and spikes on the diagonals of A, V and W.
 * Round joins and caps plus geometric precision are what make an outline read
 * as a smooth border rather than a jagged crust.
 *
 * Every property is feature-detected, because `textRendering` and
 * `letterSpacing` are recent canvas additions and the offline renderer also
 * runs against a stub context in the test suite.
 */
function applyTextQuality(ctx: CanvasRenderingContext2D, letterSpacingEm: number, fontPx: number) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.miterLimit = 2;
  try {
    (ctx as unknown as { textRendering?: string }).textRendering = "geometricPrecision";
  } catch {
    /* older engines ignore it */
  }
  try {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  } catch {
    /* not every context exposes the quality hint */
  }
  // Letter spacing was in the config and on a slider in the studio, but the
  // renderer never read it, so the control did nothing. It must be set before
  // any measureText call or the measurements and the drawing disagree and the
  // words overlap.
  try {
    if ("letterSpacing" in ctx) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing =
        `${(letterSpacingEm * fontPx).toFixed(2)}px`;
    }
  } catch {
    /* unsupported: the font's own spacing is used */
  }
}

/** "#RRGGBB" plus an alpha, as a canvas-ready rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A vertical chrome ramp across one line of text.
 *
 * Built per line, in frame coordinates, so the highlight band always lands on
 * the middle of the glyph rather than drifting with the caption's position.
 * The band from 0 to 1 covers the cap height plus a little descender room.
 */
function metalGradient(
  ctx: CanvasRenderingContext2D,
  metal: MetalFinishDef,
  centerY: number,
  fontPx: number
): CanvasGradient | string {
  try {
    const top = centerY - fontPx * 0.58;
    const bottom = centerY + fontPx * 0.42;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    for (const stop of metal.stops) grad.addColorStop(stop.at, stop.color);
    return grad;
  } catch {
    // No gradient support (very old context): the flat body colour still reads.
    return metal.stops[Math.floor(metal.stops.length / 2)]?.color || "#CCCCCC";
  }
}

/**
 * The specular band laid over the active word: transparent top and bottom,
 * bright across a sliver in the middle. Composited with "lighter" so it adds
 * light to the surface rather than repainting it.
 */
function metalSheen(
  ctx: CanvasRenderingContext2D,
  metal: MetalFinishDef,
  centerY: number,
  fontPx: number
): CanvasGradient | null {
  try {
    const top = centerY - fontPx * 0.58;
    const bottom = centerY + fontPx * 0.42;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    const clear = hexToRgba(metal.highlight, 0);
    grad.addColorStop(0, clear);
    grad.addColorStop(0.38, clear);
    grad.addColorStop(0.47, hexToRgba(metal.highlight, 0.34));
    grad.addColorStop(0.53, hexToRgba(metal.highlight, 0.34));
    grad.addColorStop(0.62, clear);
    grad.addColorStop(1, clear);
    return grad;
  } catch {
    return null;
  }
}

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
  metal: "none",
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
 * Type size for a caption at a given frame height.
 *
 * Exported because the Captions studio needs the exact same numbers to decide
 * where to point its close-up: a preview that guesses the caption band is a
 * preview that drifts away from the render the first time either changes.
 */
export function captionTypeMetrics(
  fontSize: CaptionsConfig["fontSize"] | undefined,
  h: number
): { fontPx: number; lineSpacingPx: number } {
  switch (fontSize) {
    case "small": {
      const fontPx = Math.max(16, Math.round(h * 0.032));
      return { fontPx, lineSpacingPx: Math.round(fontPx * 1.35) };
    }
    case "large": {
      const fontPx = Math.max(26, Math.round(h * 0.052));
      return { fontPx, lineSpacingPx: Math.round(fontPx * 1.38) };
    }
    case "medium":
    default: {
      const fontPx = Math.max(20, Math.round(h * 0.04));
      return { fontPx, lineSpacingPx: Math.round(fontPx * 1.36) };
    }
  }
}

/** Y of the FIRST of the two caption lines, for a frame of height `h`. */
export function captionBlockStartY(
  position: CaptionsConfig["position"] | undefined,
  h: number,
  lineSpacingPx: number
): number {
  switch (position) {
    case "top":
      return Math.max(32, Math.round(h * 0.12)) + lineSpacingPx / 2;
    case "center":
      return Math.round((h - 2 * lineSpacingPx) / 2) + lineSpacingPx / 2;
    case "bottom":
    default:
      // Fixed bottom-anchored baseline so 1-line and 2-line cards align consistently
      return h - Math.max(42, Math.round(h * 0.1)) - lineSpacingPx;
  }
}

/**
 * The middle of the two-line caption card — what a close-up should centre on.
 */
export function captionBandCenterY(config: CaptionsConfig, h: number): number {
  const { lineSpacingPx } = captionTypeMetrics(config.fontSize, h);
  return captionBlockStartY(config.position, h, lineSpacingPx) + lineSpacingPx / 2;
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
  h: number,
  sync?: CaptionSync
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
  const letterSpacingEm = config.letterSpacing ?? style.letterSpacing ?? 0;
  // An explicit config choice wins; otherwise the style's own finish applies,
  // so picking "Gold Chrome" is gold without the studio having to set a flag.
  const metal = getMetalFinish(config.metal ?? style.metal);

  const textToRender = uppercase ? cleaned.toUpperCase() : cleaned;
  const words = textToRender.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  // Reference everything to 720p so caption sizing is identical in preview and render
  const scale = h / 720;
  const { fontPx, lineSpacingPx } = captionTypeMetrics(config.fontSize, h);

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
  applyTextQuality(ctx, letterSpacingEm, fontPx);

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

  // ---------- Real word timing (voice-locked) ----------
  // When the TTS engine's own word boundaries are available the highlight is
  // driven by the audio clock, not by the estimate: each word lights up at the
  // exact moment the voice says it, and stays lit through any pause.
  const hasRealTiming =
    Boolean(sync?.wordTimings && sync.wordTimings.length > 0) && Number.isFinite(sync?.audioTimeSec as number);

  if (hasRealTiming) {
    const timings = sync!.wordTimings!;
    const aligned = alignedWordTimingsCached(words, timings);
    const audioTime = Math.max(0, sync!.audioTimeSec as number);
    // Past the end of the speech (the scene's breathing tail): everything sung.
    const lastEnd = timings[timings.length - 1]?.end ?? 0;
    activeWordGlobalIndex =
      audioTime > lastEnd + 0.05 ? totalWords - 1 : activeWordIndexAt(aligned, audioTime);
  } else if (safeProgress >= 1) {
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
  const startY = captionBlockStartY(config.position, h, lineSpacingPx);

  /**
   * The outline and the shadow the text sits on.
   *
   * Two details matter for how smooth the result looks:
   *
   * 1. The stroke is drawn at DOUBLE the requested width. `strokeText` centres
   *    the stroke on the glyph outline, so half of it falls inside the letter
   *    and eats the shape — thin stems go muddy and the counters of a, e and o
   *    fill in. Stroking at 2x and then filling on top leaves exactly the
   *    asked-for width showing on the outside with the glyph intact.
   * 2. Round joins and caps (set in applyTextQuality) keep the corners of the
   *    outline smooth instead of throwing mitre spikes off every diagonal.
   */
  const strokeWord = (
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign,
    overrideColor?: string
  ) => {
    const color = overrideColor || borderColor;
    // Chrome needs an edge even when the user has dialled the border to zero,
    // or the bright top of the ramp dissolves into a light background.
    const width = borderWidth > 0 ? borderWidth : metal ? Math.max(1, 1.2 * scale) : 0;
    if (width <= 0 && shadowStrength <= 0) return;
    ctx.save();
    ctx.textAlign = align;
    if (shadowStrength > 0) {
      ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.95, shadowStrength)})`;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowOffsetY;
    }
    if (width > 0) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = width * 2;
      ctx.strokeStyle = color;
      ctx.strokeText(text, x, y);
    } else {
      // No outline, but the shadow still has to come from somewhere.
      //
      // A canvas shadow is cast by whatever is painted, and this pass used to
      // paint only the stroke — so turning the border down to 0 silently
      // turned the drop shadow off with it, and the captions lost the one
      // thing holding them off a busy background. Painting the glyph itself
      // here casts the shadow; the real fill lands on top of it immediately
      // after and covers it completely.
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  // Render the max 2 visible lines
  visibleLines.forEach((lineObj, displayIdx) => {
    // Snapped to a whole pixel. A caption baseline on a half pixel is
    // resampled across two rows of pixels, which is exactly the soft-then-
    // crunchy edge that reads as "jagged" on a still frame.
    const lineY = Math.round(startY + displayIdx * lineSpacingPx);
    // One ramp per line, reused by every word on it, so the chrome is a
    // single continuous surface rather than each word having its own
    // highlight band.
    const metalFill = metal ? metalGradient(ctx, metal, lineY, fontPx) : null;
    const sheenFill = metal ? metalSheen(ctx, metal, lineY, fontPx) : null;

    // Pre-measure word widths to compute exact line layout with ZERO skipped letters
    const wordWidths = lineObj.words.map((wrd) => ctx.measureText(wrd).width);
    const totalWordsWidth = wordWidths.reduce((a, b) => a + b, 0);
    const totalLineWidth = totalWordsWidth + Math.max(0, lineObj.words.length - 1) * spaceWidth;
    const lineStartX = Math.round((w - totalLineWidth) / 2);

    // 1. Background backdrop (if blocked) — floating on its own shadow
    if (config.backgroundStyle === "blocked") {
      const padX = Math.round(fontPx * 0.65);
      const padY = Math.round(fontPx * 0.35);
      const maxBgW = Math.round(w * 0.88);
      // Rounded to whole pixels: a half-pixel rectangle edge is drawn as two
      // half-lit rows, which reads as a soft grey smear along the top of the
      // bar rather than a clean edge.
      const bgW = Math.round(Math.min(totalLineWidth + padX * 2, maxBgW));
      const bgH = Math.round(lineSpacingPx + padY);
      const bgX = Math.round((w - bgW) / 2);
      const bgY = Math.round(lineY - bgH / 2);

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

        const wordX = Math.round(currentX);

        // Soft shadow below every word
        strokeWord(wrd, wordX, lineY, "left", metal ? metal.edge : undefined);

        ctx.save();
        ctx.textAlign = "left";

        if (isCurrentActive) {
          // Chrome keeps its surface on the active word too; flattening it to
          // one colour made the highlight look like a different typeface.
          ctx.fillStyle = metalFill ?? (config.highlightColor || style.highlightColor);
          ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
          ctx.shadowBlur = shadowBlur;
          ctx.shadowOffsetY = shadowOffsetY;
        } else if (isAlreadySung) {
          ctx.fillStyle = metalFill ?? (config.textColor || style.textColor);
        } else {
          // Upcoming words in soft clean tone for anticipation
          ctx.fillStyle = metalFill ?? "rgba(255, 255, 255, 0.70)";
          if (metalFill) ctx.globalAlpha = 0.72;
        }

        ctx.fillText(wrd, wordX, lineY);
        ctx.restore();

        // The active word catches the light: a narrow bright band across the
        // turn of the surface, added on top.
        //
        // It has to be a GRADIENT, not a flat colour. Painting the whole
        // glyph in the highlight colour under "lighter" adds that colour to
        // every pixel and the word goes white — the opposite of metal. The
        // band is transparent everywhere except a sliver either side of the
        // midline, so only the part of the surface that would really catch a
        // light source is brightened.
        if (metal && isCurrentActive && sheenFill) {
          ctx.save();
          ctx.textAlign = "left";
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = sheenFill;
          ctx.fillText(wrd, wordX, lineY);
          ctx.restore();
        }

        currentX += curWordWidth + spaceWidth;
      });
    } else {
      // In Normal mode, draw the full uniform phrase centered
      const centerX = Math.round(w / 2);
      strokeWord(lineObj.text, centerX, lineY, "center", metal ? metal.edge : undefined);

      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = metalFill ?? (config.textColor || style.textColor);
      ctx.fillText(lineObj.text, centerX, lineY);
      ctx.restore();
    }
  });

  ctx.restore();
}
