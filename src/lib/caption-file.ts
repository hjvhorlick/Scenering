/**
 * Reading a caption file into the same word clock a transcript produces.
 *
 * On-device transcription is the normal route to captions for uploaded
 * footage, but it needs a browser that can run it and a clip with speech in it.
 * A creator who already has an `.srt` or `.vtt` — from a phone, an editor, or
 * a service they paid for elsewhere — should not have to retype it, so the same
 * fields (`scene.text` plus per-word timings) are filled from a file instead.
 *
 * The output is deliberately identical in shape to `speech-to-text.ts`, so
 * everything downstream is one code path: the Captions Studio styles it, the
 * scene text editor corrects it and the renderer burns it in.
 */

import type { WordTiming } from "./word-sync";

export interface CaptionFileResult {
  words: WordTiming[];
  text: string;
  /** Seconds covered by the last cue, used to spot a file that does not match the footage. */
  audioSeconds: number;
  /** Which format the file turned out to be. */
  format: "srt" | "vtt";
}

export class CaptionFileError extends Error {}

/** "00:01:23,450" (SRT) and "00:01:23.450" (VTT) both land here. */
function parseTimestamp(raw: string): number | null {
  const match = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*$/.exec(raw || "");
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  // A 2-digit fraction is hundredths, a 1-digit one tenths — pad, don't assume.
  const fraction = Number(String(match[4]).padEnd(3, "0"));
  if (!Number.isFinite(hours + minutes + seconds + fraction)) return null;
  return hours * 3600 + minutes * 60 + seconds + fraction / 1000;
}

/** Strips the markup caption files carry: `<00:00:01.000>`, `<c>`, `<b>`, `{\an8}`. */
function stripCueMarkup(line: string): string {
  return line
    .replace(/<[^>]*>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Splits one cue's words across its span.
 *
 * A caption file times a phrase, not a word, so the karaoke highlight is
 * spread over the phrase by character count — the long words are the slow
 * ones, and even spacing by word visibly rushes them.
 */
function wordsForCue(text: string, start: number, end: number): WordTiming[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const span = Math.max(0, end - start);
  const lengths = parts.map((word) => Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, "").length || 1));
  const total = lengths.reduce((a, b) => a + b, 0);
  const words: WordTiming[] = [];
  let cursor = start;
  parts.forEach((word, index) => {
    const share = (lengths[index] / total) * span;
    words.push({ text: word, start: cursor, end: cursor + share });
    cursor += share;
  });
  // Never leave the last word ending before the cue does.
  if (words.length > 0) words[words.length - 1].end = Math.max(words[words.length - 1].end, end);
  return words;
}

/**
 * Parses an SRT or VTT file.
 *
 * Throws `CaptionFileError` with a sentence for the screen when the file has no
 * timed cues in it at all — a renamed text file is the usual culprit, and "no
 * captions found" is more useful than an empty result that looks like success.
 */
export function parseCaptionFile(contents: string, filename = ""): CaptionFileResult {
  const raw = String(contents || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const looksLikeVtt = /^\s*WEBVTT/.test(raw) || /\.vtt$/i.test(filename);
  const format: "srt" | "vtt" = looksLikeVtt ? "vtt" : "srt";

  // A cue is a line holding "start --> end"; everything until the next blank
  // line (or the next cue) is its text.
  const blocks = raw.split(/\n\s*\n/);
  const words: WordTiming[] = [];
  let lastEnd = 0;

  for (const block of blocks) {
    const lines = block.split("\n");
    const cueAt = lines.findIndex((line) => line.includes("-->"));
    if (cueAt < 0) continue;
    const [startRaw, rest] = lines[cueAt].split("-->");
    if (rest === undefined) continue;
    // VTT allows positions after the end time ("... --> ... line:90%").
    const endRaw = rest.trim().split(/\s+/)[0] || "";
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    if (start === null || end === null) continue;
    const text = lines
      .slice(cueAt + 1)
      .map(stripCueMarkup)
      .filter(Boolean)
      .join(" ");
    if (!text) continue;
    const from = Math.max(0, start);
    const to = Math.max(from, end);
    words.push(...wordsForCue(text, from, to));
    lastEnd = Math.max(lastEnd, to);
  }

  if (words.length === 0) {
    throw new CaptionFileError(
      `No timed captions were found in "${filename || "that file"}". An SRT or VTT file needs lines like 00:00:01,000 --> 00:00:04,000 above each line of text.`
    );
  }

  const text = words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  // Two decimals, not one: an SRT/VTT cue is timed to the millisecond, and
  // this figure is compared against the footage's own length to spot a file
  // that belongs to a different cut.
  return { words, text, audioSeconds: Math.round(lastEnd * 100) / 100, format };
}

/** What a caption-file input should accept. */
export const CAPTION_FILE_ACCEPT = ".srt,.vtt,text/plain";
