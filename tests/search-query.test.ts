import { createHarness } from "./harness";
import {
  broadenQuery,
  matchFallbackPhotos,
  stemWord,
  BROADEST_FALLBACK_QUERY,
} from "../src/lib/search-query";
import { fallbackCandidates } from "../src/lib/image-picker";
import { NATURE_FALLBACKS } from "../src/data/nature-fallbacks";

/**
 * A photo search must never dead-end. Scene queries are built from narration,
 * so they are long and specific and routinely match nothing; these checks
 * cover the ladder that widens them and the bundled deck underneath it.
 */
const h = createHarness();

// ------------------------------------------------------------- broadenQuery
{
  const steps = broadenQuery("the dramatic sunrise over the old harbour wall");
  h.ok(steps.length >= 2, "a long query produces several widening steps");
  h.eq(
    steps[0],
    "the dramatic sunrise over the old harbour wall",
    "the exact query is always tried first"
  );
  h.ok(
    !steps.slice(1).some((s) => s.split(" ").includes("the")),
    "filler words are dropped after the first step"
  );
  h.ok(
    !steps.slice(2).some((s) => s.split(" ").includes("dramatic")),
    "photography qualifiers are dropped once filler is gone"
  );

  // Each step must be no longer than the one before it, or the ladder could
  // loop forever without ever reaching a term broad enough to match.
  for (let i = 1; i < steps.length; i++) {
    h.ok(
      steps[i].split(" ").length <= steps[i - 1].split(" ").length,
      `step ${i} ("${steps[i]}") is no longer than step ${i - 1}`
    );
  }
}

h.eq(broadenQuery("mountain").length, 1, "a one-word query needs only one search");
h.eq(broadenQuery("mountain")[0], "mountain", "a one-word query is searched as typed");
h.eq(broadenQuery("")[0], BROADEST_FALLBACK_QUERY, "an empty query falls back to nature");
h.eq(broadenQuery("   ")[0], BROADEST_FALLBACK_QUERY, "a blank query falls back to nature");
h.eq(
  broadenQuery("the and of")[0],
  "the and of",
  "a query of pure filler still tries what was typed"
);
h.ok(
  broadenQuery("the and of").includes(BROADEST_FALLBACK_QUERY),
  "a query of pure filler ends on a term that matches something"
);
h.eq(broadenQuery("a b c d e", 2).length, 2, "maxSteps caps the number of searches");
h.eq(broadenQuery("a b c d e", 0).length, 1, "at least one search is always attempted");
h.eq(
  broadenQuery("  rolling   green   hills  ")[0],
  "rolling green hills",
  "whitespace is normalised before searching"
);

// No duplicates: two identical searches in a row is wasted latency.
for (const query of [
  "mountain",
  "ocean waves",
  "a beautiful cinematic photo of a glacier",
  "the sea",
  "forest",
]) {
  const steps = broadenQuery(query);
  h.eq(new Set(steps).size, steps.length, `"${query}" produces no duplicate steps`);
  h.ok(
    steps.every((s) => s.trim().length > 0),
    `"${query}" produces no empty steps`
  );
}

// ------------------------------------------------------------------- stemming
h.eq(stemWord("mountains"), "mountain", "plural 's' is stemmed");
h.eq(stemWord("valleys"), "valley", "plural 'ys' is stemmed");
h.eq(stemWord("skies"), "sky", "'ies' becomes 'y'");
h.eq(stemWord("beaches"), "beach", "'ches' is stemmed");
h.eq(stemWord("Ocean"), "ocean", "stemming is case-insensitive");
h.eq(stemWord("grass"), "grass", "a word ending in a double s is left alone");

// ------------------------------------------------------- matchFallbackPhotos
{
  const matched = matchFallbackPhotos("ocean", NATURE_FALLBACKS);
  h.ok(matched.length > 0, "a category word matches photos in the deck");
  h.eq(matched[0].category, "ocean", "the category match ranks first");

  const plural = matchFallbackPhotos("oceans", NATURE_FALLBACKS);
  h.eq(plural[0]?.id, matched[0]?.id, "a plural query matches the same photo as the singular");

  const byName = matchFallbackPhotos("redwood", NATURE_FALLBACKS);
  h.ok(byName.length > 0, "a word from a photo's name matches it");

  h.eq(
    matchFallbackPhotos("quantum tunnelling diagram", NATURE_FALLBACKS).length,
    0,
    "a query matching nothing returns nothing rather than a blind guess"
  );
  h.eq(matchFallbackPhotos("", NATURE_FALLBACKS).length, 0, "an empty query matches nothing");
  h.eq(matchFallbackPhotos("ocean", []).length, 0, "an empty deck matches nothing");

  // Category beats name, so "forest" leads with the forest-category photo
  // even though other names contain the word.
  const forest = matchFallbackPhotos("forest", NATURE_FALLBACKS);
  h.eq(forest[0].category, "forest", "a category hit outranks a name hit");

  // Stable ordering: the same query must always rank the same way.
  const a = matchFallbackPhotos("mountain sky", NATURE_FALLBACKS).map((p) => p.id);
  const b = matchFallbackPhotos("mountain sky", NATURE_FALLBACKS).map((p) => p.id);
  h.eq(a.join(","), b.join(","), "ranking is stable across calls");
}

// ------------------------------------------------------- fallbackCandidates
{
  const matched = fallbackCandidates("ocean");
  h.ok(matched.length > 0, "the fallback deck answers a matching query");
  h.ok(
    matched.every((c) => c.url.length > 0 && c.thumbnail.length > 0),
    "every fallback candidate carries a url and a thumbnail"
  );
  h.ok(
    matched.every((c) => c.source === "nature"),
    "fallback candidates are labelled as the bundled nature library"
  );

  // Even an unmatchable query gets a full grid — an empty modal is the one
  // outcome this whole path exists to prevent.
  const unmatched = fallbackCandidates("quantum tunnelling diagram");
  h.eq(
    unmatched.length,
    NATURE_FALLBACKS.length,
    "an unmatchable query still fills the grid from the deck"
  );
  h.eq(
    new Set(unmatched.map((c) => c.url)).size,
    NATURE_FALLBACKS.length,
    "the fallback grid holds no duplicates"
  );

  // Deterministic rng proves the shuffle is a shuffle, not a reordering bug
  // that drops photos.
  let seed = 0;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shuffled = fallbackCandidates("nothing here", NATURE_FALLBACKS, rng);
  h.eq(shuffled.length, NATURE_FALLBACKS.length, "a seeded shuffle keeps every photo");
}

h.done("search-query");
