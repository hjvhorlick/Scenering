/**
 * Word-level caption ↔ voice synchronisation.
 *
 * Speechify can return word-level speech marks with each synthesis response.
 * Those marks are converted upstream to seconds and aligned to the displayed
 * caption words here. If marks are absent, the renderer uses its local timing
 * estimate instead.
 *
 * It is deliberately pure (no DOM, no network) so the alignment maths can be
 * unit-tested in plain Node.
 */

export interface WordTiming {
  /** The spoken word, as the TTS engine reported it. */
  text: string;
  /** Seconds from the start of the scene's audio. */
  start: number;
  /** Seconds from the start of the scene's audio (start + spoken length). */
  end: number;
}

/** A caption word's resolved timing; `null` when it could not be aligned. */
export type AlignedWord = { start: number; end: number } | null;

/** Normalises a word for fuzzy matching: lowercase, alphanumeric only. */
function normalizeWord(word: string): string {
  return (word || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Cheap containment/equality match between a caption word and a spoken word. */
function wordsMatch(caption: string, spoken: string): boolean {
  const c = normalizeWord(caption);
  const s = normalizeWord(spoken);
  if (!c || !s) return false;
  if (c === s) return true;
  // "don't" ↔ "dont", "world-changing" ↔ "world"
  if (c.length >= 4 && s.length >= 4 && (c.includes(s) || s.includes(c))) return true;
  return false;
}

/**
 * Aligns the caption's words to the spoken word timings.
 *
 * The TTS input is sanitised before synthesis (citations expand to words,
 * symbols become words, phonetic dictionary substitutions…), so the two word
 * streams are NOT identical. The alignment is therefore monotonic and
 * span-based:
 *
 *   - A caption word consumes spoken words until the *next* caption word
 *     matches. "3:16" therefore spans the timings of "chapter", "three",
 *     "verse", "sixteen" — the highlight sits on it the whole time it is
 *     being spoken, which is exactly what a viewer expects.
 *   - When both streams run out of matches, remaining caption words share the
 *     tail of the last known timing, and a completely unmatched middle word
 *     is interpolated between its neighbours — never NaN, never backwards.
 *
 * Returns one entry per caption word (same order), `null` only when there is
 * no timing information at all to place it.
 */
export function alignWordTimings(captionWords: readonly string[], timings: readonly WordTiming[]): AlignedWord[] {
  const n = captionWords.length;
  const result: AlignedWord[] = new Array(n).fill(null);
  if (n === 0 || timings.length === 0) return result;

  let t = 0; // index into timings
  let lastEnd = 0;

  for (let i = 0; i < n; i++) {
    if (t >= timings.length) {
      // No spoken words left: spread the remaining tail evenly so the last
      // words still light up in order instead of all-at-once.
      const remaining = n - i;
      const tail = Math.max(0.08, (timings[timings.length - 1]?.end ?? 0) - lastEnd);
      const slice = tail / remaining;
      for (let k = i; k < n; k++) {
        result[k] = { start: lastEnd + (k - i) * slice, end: lastEnd + (k - i + 1) * slice };
      }
      return result;
    }

    const start = timings[t].start;

    // Look ahead: where does the NEXT caption word start being spoken?
    let consume = 1;
    if (i + 1 < n) {
      let j = t;
      let nextAt = -1;
      while (j < timings.length) {
        if (j > t && wordsMatch(captionWords[i + 1], timings[j].text)) {
          nextAt = j;
          break;
        }
        j++;
      }
      if (nextAt === -1) {
        // Next caption word never matches: pair this caption word with the
        // single next spoken word (1:1 fallback) so both streams still drain.
        consume = 1;
        const end = timings[t].end;
        result[i] = { start, end: Math.max(start, end) };
        lastEnd = Math.max(lastEnd, result[i]!.end);
        t += 1;
        continue;
      }
      consume = nextAt - t;
    }

    const lastConsumed = timings[Math.min(t + consume - 1, timings.length - 1)];
    const end = i === n - 1 ? Math.max(lastConsumed.end, timings[t].start + 0.05) : lastConsumed.end;
    result[i] = { start, end: Math.max(start, end) };
    lastEnd = Math.max(lastEnd, result[i]!.end);
    t += consume;
  }

  return result;
}

/**
 * Which caption word is being spoken at `timeSec` into the scene audio?
 *
 * The word that most recently started wins (during the gap between two words
 * the previous one stays lit, which reads far better than flickering to the
 * next word early). Before the first word starts, the first word is active —
 * matching the historic behaviour at progress 0.
 */
export function activeWordIndexAt(aligned: readonly AlignedWord[], timeSec: number): number {
  if (aligned.length === 0) return 0;
  if (!Number.isFinite(timeSec)) return 0;
  let active = 0;
  for (let i = 0; i < aligned.length; i++) {
    const slot = aligned[i];
    if (!slot) continue;
    if (slot.start <= timeSec + 1e-4) active = i;
    else break;
  }
  return active;
}

/**
 * Small cache so the per-frame caption render does not re-run the alignment
 * 60 times a second for the same scene. Keyed by the timings array identity
 * (the render holds one array per scene for the whole export).
 */
const alignCache = new WeakMap<readonly WordTiming[], Map<string, AlignedWord[]>>();

export function alignedWordTimingsCached(
  captionWords: readonly string[],
  timings: readonly WordTiming[]
): AlignedWord[] {
  let perText = alignCache.get(timings);
  if (!perText) {
    perText = new Map();
    alignCache.set(timings, perText);
  }
  const key = captionWords.join("\u0000");
  let aligned = perText.get(key);
  if (!aligned) {
    aligned = alignWordTimings(captionWords, timings);
    perText.set(key, aligned);
    // Bounded: a long session with many scenes must not grow this forever.
    if (perText.size > 32) perText.delete(perText.keys().next().value as string);
  }
  return aligned;
}
