/**
 * Word-level caption ↔ voice synchronisation.
 *
 * Piper currently returns audio only, so this module handles estimated timing until verified alignment is available.
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

/**
 * Search the remainder of the caption line for the next shared timing anchor.
 *
 * A short fixed look-ahead let sanitiser-expanded phrases (numbers, symbols,
 * abbreviations) consume one unrelated speech mark per caption word. The
 * highlight then fell behind until it happened to find a later anchor. The
 * search is bounded by the line itself, and remains monotonic, so even a long
 * expansion is interpolated as one run and the next shared word re-locks it.
 */
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

  /**
   * The first spoken word at or after `from` that any remaining caption
   * word names.
   *
   * Looking just ONE caption word ahead is enough while the two streams agree,
   * and it is what makes the citation case exact ("3:16" spans "chapter three
   * verse sixteen"). It is not enough when the sanitiser has *inserted*
   * words the caption does not have: then a run of caption words each fail to
   * match the spoken word they are being paired with, and consuming one
   * spoken word per caption word walks the highlight further and further
   * behind the voice — the cumulative lag that reads as captions that are
   * "not following" at all. Searching the rest of the line lets this whole
   * unmatched run be interpolated up to the next word both streams share.
   */
  const findAnchor = (fromCaption: number, fromTiming: number, span = n): { caption: number; timing: number } | null => {
    for (let k = fromCaption; k < Math.min(n, fromCaption + span); k++) {
      for (let j = fromTiming; j < timings.length; j++) {
        if (wordsMatch(captionWords[k], timings[j].text)) return { caption: k, timing: j };
      }
    }
    return null;
  };

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

    /* The last caption word is held for as long as the voice keeps speaking.
       It used to end with one spoken word, so the tail of the line — the
       words a delay or an expansion put after the caption's last word — ran
       with nothing lit. */
    if (i === n - 1) {
      const end = Math.max(lastEnd, timings[timings.length - 1].end, start + 0.05);
      result[i] = { start, end };
      return result;
    }

    /* Where does the NEXT caption word start being spoken? Only that one word
       is searched here, on purpose: an expansion ("3:16") matches nothing in
       the spoken stream, and the caption word before it must stop at the
       expansion's first spoken word rather than skipping to whatever word
       turns up later in the line. */
    const nextAnchor = findAnchor(i + 1, t + 1, 1);

    /* Does the caption word being placed actually name the spoken word it is
       standing on? If it does, this word owns the spoken words up to the next
       anchor (the expansion/citation rule). If it does not, the sanitiser put
       extra words here, and this word must not be allowed to consume one
       spoken word per caption word for the rest of the line. */
    const ownsCurrentSpokenWord = wordsMatch(captionWords[i], timings[t].text);

    if (!ownsCurrentSpokenWord) {
      const anchor = findAnchor(i + 1, t + 1);
      if (anchor) {
        /* Spread this run of unmatched caption words across the spoken words
           they cover, ending exactly where the anchor word starts. The anchor
           keeps its own exact timing, so the drift cannot outlive the run. */
        const spanEnd = timings[Math.max(t, anchor.timing - 1)].end;
        const slots = Math.max(1, anchor.caption - i);
        const slice = Math.max(0.001, (spanEnd - start) / slots);
        for (let m = i; m < anchor.caption; m++) {
          result[m] = { start: start + (m - i) * slice, end: start + (m - i + 1) * slice };
        }
        lastEnd = Math.max(lastEnd, spanEnd);
        t = anchor.timing;
        i = anchor.caption - 1;
        continue;
      }
      // Nothing ahead matches at all: pair this word with the single spoken
      // word under it (1:1 fallback) so both streams still drain.
      const end = Math.max(start, timings[t].end);
      result[i] = { start, end };
      lastEnd = Math.max(lastEnd, end);
      t += 1;
      continue;
    }

    const nextAt = nextAnchor ? nextAnchor.timing : -1;
    if (nextAt === -1) {
      // The next caption word never matches: this one ends with its own
      // spoken word, and the pairing continues from the following word.
      const end = Math.max(start, timings[t].end);
      result[i] = { start, end };
      lastEnd = Math.max(lastEnd, end);
      t += 1;
      continue;
    }

    const consume = Math.max(1, nextAt - t);
    const lastConsumed = timings[Math.min(t + consume - 1, timings.length - 1)];
    const end = Math.max(start, lastConsumed.end);
    result[i] = { start, end };
    lastEnd = Math.max(lastEnd, end);
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
