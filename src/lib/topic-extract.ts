/**
 * Scene topic extraction for image search.
 *
 * The old behaviour was `text.split(" ").slice(0, 5)` — the first few words of
 * the narration. That is almost never the subject: scripts open with
 * connectives and scene-setting ("In the years that followed, the young…"),
 * so the search ran on filler and returned an unrelated picture, and every
 * later sentence in the scene drifted further off-topic.
 *
 * This module instead ranks the whole scene and puts NAMES AND PLACES first,
 * because a proper noun is the single most searchable thing in a sentence:
 * "Jerusalem" or "Nelson Mandela" retrieves the right photo, "following" does
 * not.
 *
 * No NLP model is available, so entities are found structurally:
 *   - runs of capitalised words that are NOT merely sentence-initial,
 *   - words following a locative preposition ("in Rome", "across Judea"),
 *   - all-caps tokens and hyphenated/apostrophised names.
 * Everything else is scored as a plain topic term by frequency and specificity.
 */

/** Words that carry no visual meaning and must never drive an image search. */
const STOPWORDS = new Set<string>(
  (
    "a about above after again against all am an and any are aren't as at be because been " +
    "before being below between both but by can cannot could couldn't did didn't do does " +
    "doesn't doing don't down during each few for from further had hadn't has hasn't have " +
    "haven't having he he'd he'll he's her here here's hers herself him himself his how " +
    "how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most " +
    "mustn't my myself no nor not of off on once only or other ought our ours ourselves " +
    "out over own same shan't she she'd she'll she's should shouldn't so some such than " +
    "that that's the their theirs them themselves then there there's these they they'd " +
    "they'll they're they've this those through to too under until up very was wasn't we " +
    "we'd we'll we're we've were weren't what what's when when's where where's which while " +
    "who who's whom why why's with won't would wouldn't you you'd you'll you're you've " +
    "your yours yourself yourselves " +
    // narration filler and discourse glue
    "also just now then today still even much many way ways thing things something anything " +
    "everything nothing someone anyone everyone one two three first second next last another " +
    "every begin began begins begun start started starts come came comes go goes going went " +
    "get gets got give gives gave take takes took make makes made know knows knew see sees " +
    "saw look looks looked think thinks thought say says said tell tells told become becomes " +
    "became seem seems find finds found keep keeps kept leave leaves left feel feels felt " +
    "bring brings brought turn turns turned want wants wanted need needs needed use uses " +
    "used try tries tried call calls called work works worked part place places back time " +
    "times year years day days people man woman life world never always often soon later " +
    "story chapter scene narrator imagine picture perhaps however therefore meanwhile " +
    "finally suddenly indeed truly really quite rather almost nearly around along toward " +
    "towards upon within without across behind beyond among amid despite though although " +
    "whether since unless until while whereas thus hence moreover furthermore"
  ).split(/\s+/)
);

/** Prepositions that mark the next capitalised token as a location. */
const LOCATIVE = new Set([
  "in", "at", "from", "to", "into", "across", "through", "near", "outside",
  "inside", "toward", "towards", "beyond", "around", "along", "over", "under",
  "throughout", "upon", "within", "onto", "past", "beside", "between",
]);

/** Titles that glue onto a following name: "King David", "Dr Khan". */
const NAME_TITLES = new Set([
  "mr", "mrs", "ms", "miss", "dr", "doctor", "prof", "professor", "sir", "lady",
  "lord", "king", "queen", "prince", "princess", "president", "captain",
  "general", "saint", "st", "pope", "rabbi", "imam", "sheikh", "chief",
  "emperor", "empress", "duke", "duchess", "judge", "governor", "senator",
  "colonel", "major", "sergeant", "apostle", "prophet", "father", "mother",
]);

/** Words that look capitalised but are structural, not names. */
const NOT_A_NAME = new Set([
  "i", "the", "a", "an", "and", "but", "or", "so", "yet", "for", "nor",
  "this", "that", "these", "those", "it", "its", "he", "she", "they", "we",
  "you", "his", "her", "their", "our", "your", "there", "here", "then",
  "when", "where", "while", "after", "before", "because", "if", "as", "at",
  "in", "on", "of", "to", "from", "with", "by", "was", "were", "is", "are",
  "his", "what", "how", "why", "who", "not", "no", "all", "some", "every",
  "one", "two", "three", "many", "much", "most", "more", "now", "today",
  "meanwhile", "however", "finally", "suddenly", "imagine", "picture",
  "let", "look", "listen", "consider", "remember", "welcome", "hello",
]);

export interface TopicEntity {
  /** The surface form, e.g. "Nelson Mandela". */
  text: string;
  /** Higher is more likely to be the scene's true subject. */
  score: number;
  kind: "place" | "name" | "term";
}

/** Split into sentences, keeping the index where each begins. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripEdges(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}'’\-]+$/u, "");
}

function isCapitalised(token: string): boolean {
  const first = token[0];
  return Boolean(first) && first === first.toUpperCase() && first !== first.toLowerCase();
}

function isAllCaps(token: string): boolean {
  return token.length > 1 && token === token.toUpperCase() && /\p{L}/u.test(token);
}

/**
 * Pull named entities (people, places, organisations, titled works) out of the
 * scene. Multi-word runs are kept together so "New York" never degrades into
 * two useless single words.
 */
export function extractEntities(text: string): TopicEntity[] {
  const found = new Map<string, TopicEntity>();
  const sentences = splitSentences(text);

  for (const sentence of sentences) {
    const raw = sentence.split(/\s+/);
    const tokens = raw.map(stripEdges);

    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (!tok || !/\p{L}/u.test(tok)) {
        i++;
        continue;
      }

      const lower = tok.toLowerCase();
      const capitalised = isCapitalised(tok) || isAllCaps(tok);
      if (!capitalised || NOT_A_NAME.has(lower)) {
        i++;
        continue;
      }

      // A capitalised word in first position is ambiguous — every sentence
      // starts with one. Only accept it if it is also a title ("King David…")
      // or the run continues into another capitalised word ("Rome fell" no,
      // "Roman Empire fell" yes), or it repeats elsewhere in the scene.
      const atSentenceStart = i === 0;

      // Grow the run: consecutive capitalised tokens, allowing lowercase
      // particles inside names ("Ptolemy of Alexandria", "Tower of London").
      const parts: string[] = [tok];
      let j = i + 1;
      while (j < tokens.length) {
        const nxt = tokens[j];
        if (!nxt) break;
        const nxtLower = nxt.toLowerCase();
        const isParticle =
          (nxtLower === "of" || nxtLower === "de" || nxtLower === "van" ||
            nxtLower === "von" || nxtLower === "del" || nxtLower === "la" ||
            nxtLower === "the" || nxtLower === "al") &&
          j + 1 < tokens.length &&
          isCapitalised(tokens[j + 1]) &&
          !NOT_A_NAME.has(tokens[j + 1].toLowerCase());
        if (isParticle) {
          parts.push(nxt, tokens[j + 1]);
          j += 2;
          continue;
        }
        if (isCapitalised(nxt) && !NOT_A_NAME.has(nxtLower)) {
          parts.push(nxt);
          j += 1;
          continue;
        }
        break;
      }

      const surface = parts.join(" ");
      const multiWord = parts.length > 1;

      // Locative preposition immediately before ⇒ this is a place.
      const prevLower = i > 0 ? tokens[i - 1]?.toLowerCase() : "";
      const isPlace = LOCATIVE.has(prevLower || "");
      // Title immediately before ⇒ definitely a person's name.
      const titled = NAME_TITLES.has(prevLower || "") || NAME_TITLES.has(lower);

      const accept = multiWord || titled || isPlace || !atSentenceStart;

      if (accept) {
        const key = surface.toLowerCase();
        const existing = found.get(key);
        // Names and places outrank everything else; multi-word runs and
        // repeated mentions outrank single passing references.
        let score = 100;
        if (isPlace) score += 60;
        if (titled) score += 55;
        if (multiWord) score += 30 * (parts.length - 1);
        if (atSentenceStart) score -= 25;
        if (isAllCaps(tok)) score += 15;

        if (existing) {
          // repetition is the strongest signal that this is the scene's subject
          existing.score += 45;
          if (isPlace && existing.kind !== "place") existing.kind = "place";
        } else {
          found.set(key, {
            text: surface,
            score,
            kind: isPlace ? "place" : "name",
          });
        }
      }

      i = Math.max(j, i + 1);
    }
  }

  // A sentence-initial capitalised word that also appears mid-sentence is a
  // real name; the loop above already merged those by key, so nothing extra
  // is needed here.
  return [...found.values()].sort((a, b) => b.score - a.score);
}

/**
 * Fold simple English plurals so "reefs" and "reef" count as one topic. Without
 * this a scene that alternates between singular and plural splits its own
 * strongest signal in half and loses to incidental words.
 */
function singularise(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches") || word.endsWith("xes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Score ordinary content words so a scene with no names still searches well. */
export function extractTerms(text: string): TopicEntity[] {
  const counts = new Map<string, { n: number; surface: string; firstAt: number }>();
  const words = (text || "").split(/\s+/);

  words.forEach((rawWord, idx) => {
    const tok = stripEdges(rawWord);
    if (!tok) return;
    const lower = tok.toLowerCase();
    if (lower.length < 4) return;
    if (STOPWORDS.has(lower)) return;
    if (!/^[\p{L}][\p{L}'’\-]*$/u.test(tok)) return;

    const key = singularise(lower);
    if (STOPWORDS.has(key)) return;
    const existing = counts.get(key);
    if (existing) {
      existing.n += 1;
      // keep the shorter (usually singular) surface form for the query
      if (tok.length < existing.surface.length) existing.surface = tok;
    } else {
      counts.set(key, { n: 1, surface: tok, firstAt: idx });
    }
  });

  const out: TopicEntity[] = [];
  for (const [key, info] of counts) {
    const lower = key;
    // Repetition matters most; longer words are more specific than short ones;
    // very early words get a small nudge only (they used to get everything).
    let score = info.n * 22 + Math.min(lower.length, 12) * 2;
    if (info.firstAt < 6) score += 3;
    // Adverbs and vague abstractions rarely make good photos.
    if (lower.endsWith("ly")) score -= 18;
    if (lower.endsWith("ness") || lower.endsWith("ity") || lower.endsWith("tion")) score -= 6;
    out.push({ text: info.surface, score, kind: "term" });
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface TopicQueryOptions {
  /** Max words in the returned query. Stock APIs do poorly beyond ~5. */
  maxWords?: number;
  /** Appended when the scene yields nothing usable. */
  fallback?: string;
  /** A previously stored query, used only if extraction finds nothing. */
  stored?: string;
}

/**
 * Build the image-search query for a scene.
 *
 * Priority: places and people first (they are what the viewer must see), then
 * the highest-scoring topic terms to disambiguate, capped to a short phrase.
 */
export function buildSceneImageQuery(text: string, options: TopicQueryOptions = {}): string {
  const maxWords = options.maxWords ?? 5;
  const entities = extractEntities(text);
  const terms = extractTerms(text);

  const picked: string[] = [];
  const usedLower = new Set<string>();
  let wordBudget = maxWords;

  const push = (phrase: string) => {
    const wordCount = phrase.split(/\s+/).length;
    if (wordCount > wordBudget) return;
    const key = phrase.toLowerCase();
    if (usedLower.has(key)) return;
    // Don't add a term that is already inside a chosen entity.
    for (const already of usedLower) {
      if (already.includes(key) || key.includes(already)) return;
    }
    usedLower.add(key);
    picked.push(phrase);
    wordBudget -= wordCount;
  };

  // Up to two named entities — a person plus a place is the ideal photo brief.
  for (const ent of entities.slice(0, 3)) {
    if (picked.length >= 2) break;
    push(ent.text);
  }

  // Fill the rest with the strongest ordinary terms.
  for (const term of terms) {
    if (wordBudget <= 0) break;
    if (picked.length >= 4) break;
    push(term.text);
  }

  const query = picked.join(" ").trim();
  if (query) return query;

  const stored = (options.stored || "").trim();
  if (stored) return stored;
  return options.fallback || "cinematic background";
}

/**
 * Human-readable explanation of why a query was chosen, for the scene UI.
 */
export function describeSceneTopic(text: string): {
  query: string;
  names: string[];
  places: string[];
  terms: string[];
} {
  const entities = extractEntities(text);
  const terms = extractTerms(text).slice(0, 5).map((t) => t.text);
  return {
    query: buildSceneImageQuery(text),
    names: entities.filter((e) => e.kind === "name").map((e) => e.text),
    places: entities.filter((e) => e.kind === "place").map((e) => e.text),
    terms,
  };
}
