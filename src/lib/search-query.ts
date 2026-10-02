/**
 * Search query broadening — what to try when a photo search comes back empty.
 *
 * A scene query is built from the narration, so it is often a long and very
 * specific phrase ("the dramatic sunrise over the old harbour wall"). Stock
 * libraries have nothing for that, and the old behaviour was simply to show
 * "No images found" and leave the scene blank.
 *
 * Instead the query is widened in steps — drop filler words, drop photography
 * qualifiers, keep the last couple of meaningful words, then the single
 * strongest one — and each step is searched in turn until something comes
 * back. Every step is strictly shorter than the one before, so the sequence
 * always terminates and always ends on a term broad enough to match.
 *
 * Kept free of any fetch so it can be unit-tested in plain Node; the network
 * half lives in ./image-search.
 */

/** Grammatical filler that never helps a stock photo search. */
const STOP_WORDS = new Set(
  "a an the and or of in on to for with from by is are was were this that as at into it its their his her our your over under about".split(
    " "
  )
);

/**
 * Photography adjectives that read well in a brief but only narrow the result
 * set: every stock photo is already "beautiful" and "high quality".
 */
const QUALIFIERS = new Set([
  "beautiful",
  "dramatic",
  "stunning",
  "scenic",
  "peaceful",
  "cinematic",
  "epic",
  "gorgeous",
  "amazing",
  "quality",
  "high",
  "photo",
  "photograph",
  "picture",
  "image",
  "background",
  "wallpaper",
]);

/** The term used when a query has no usable words left at all. */
export const BROADEST_FALLBACK_QUERY = "nature";

/** Crude singular form, enough to match "mountains" against "mountain". */
export function stemWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/ies$/, "y")
    // "beaches" → "beach", "boxes" → "box", "glasses" → "glass": only the
    // "es" goes, never the consonant cluster in front of it.
    .replace(/(ch|sh|ss|x|z)es$/, "$1")
    .replace(/([^s])s$/, "$1");
}

const words = (query: string): string[] => query.split(" ").filter(Boolean);
const withoutStopWords = (list: string[]): string[] =>
  list.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
const withoutQualifiers = (list: string[]): string[] =>
  list.filter((w) => !QUALIFIERS.has(w.toLowerCase()));

/**
 * The ladder of searches to try for a query, widest-last.
 *
 * The first entry is always the query exactly as the user typed it, so a
 * query that does work is never silently replaced. Duplicate and empty steps
 * are collapsed, so a one-word query produces a one-step ladder rather than
 * four identical searches.
 *
 * @param maxSteps upper bound on the number of searches the caller will run.
 */
export function broadenQuery(query: string, maxSteps = 4): string[] {
  const original = (query || "").trim().replace(/\s+/g, " ");
  if (!original) return [BROADEST_FALLBACK_QUERY];

  const all = words(original);
  const meaningful = withoutStopWords(all);
  const plain = withoutQualifiers(meaningful);

  const ladder: string[] = [];
  const add = (candidate: string) => {
    const value = candidate.trim();
    if (value && !ladder.includes(value)) ladder.push(value);
  };

  add(original);
  add(meaningful.join(" "));
  add(plain.join(" "));
  // The tail of a scene query carries the subject far more often than the
  // head, which is usually a connective leading into it.
  add(plain.slice(-2).join(" "));
  add(plain.slice(-1).join(" "));
  // Only needed when the query is nothing but filler ("the and of"): without
  // it the ladder would be one unmatchable step long and end in an empty
  // grid. A query with real words already ends on one of them.
  if (plain.length === 0) add(BROADEST_FALLBACK_QUERY);

  return ladder.slice(0, Math.max(1, maxSteps));
}

/** The shape `matchFallbackPhotos` needs: anything with a name and category. */
export interface FallbackPhotoLike {
  name?: string;
  category?: string;
}

/**
 * Rank the bundled nature deck against a query, best match first.
 *
 * This is the last resort when every broadened search has come back empty —
 * no API keys, no network, or a genuinely unmatchable subject. A category hit
 * ("forest") counts for more than a name hit ("Lush Sunlit Redwood Forest"),
 * and photos matching nothing are dropped rather than padded in, so the
 * caller can tell a real match from a blind guess.
 */
export function matchFallbackPhotos<T extends FallbackPhotoLike>(
  query: string,
  deck: readonly T[]
): T[] {
  const terms = (query || "")
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
    .map(stemWord);
  if (terms.length === 0) return [];

  const CATEGORY_HIT = 3;
  const NAME_HIT = 2;

  return deck
    .map((photo, index) => {
      const category = stemWord(String(photo.category || ""));
      const nameWords = String(photo.name || "")
        .toLowerCase()
        .split(/\W+/)
        .filter(Boolean)
        .map(stemWord);

      const score = terms.reduce((total, term) => {
        let hit = 0;
        if (category && category === term) hit += CATEGORY_HIT;
        if (nameWords.includes(term)) hit += NAME_HIT;
        return total + hit;
      }, 0);

      return { photo, index, score };
    })
    .filter((entry) => entry.score > 0)
    // Ties keep deck order, so the ranking is stable and testable.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.photo);
}
