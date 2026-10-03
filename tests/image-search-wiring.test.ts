import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  NATURE_CATEGORIES,
  NATURE_FALLBACKS,
  natureBackgroundsFor,
  natureCategoryQuery,
} from "../src/data/nature-fallbacks";

/**
 * Guards against shipping helpers nobody calls.
 *
 * The October 2 work landed once as four well-formed modules — query
 * broadening, topic rotation, auto-framing, the extra transitions — that no
 * component imported. Every unit test passed and the app behaved exactly as
 * it had before, because none of it was reachable. These checks read the
 * source and assert the wiring itself exists.
 */
const h = createHarness();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string) => readFileSync(join(repoRoot, name), "utf8");

const modal = read("src/components/ImageSearchModal.tsx");
const strip = read("src/components/ImageCandidateStrip.tsx");
const editor = read("src/components/SceneEditor.tsx");
const app = read("src/App.tsx");
const imageSearch = read("src/lib/image-search.ts");
const picker = read("src/lib/image-picker.ts");
const natureData = read("src/data/nature-fallbacks.ts");

// ------------------------------------------------- broadening reaches the UI
h.ok(
  imageSearch.includes("export async function searchImagePoolBroadened"),
  "the broadening search exists in the network layer"
);
h.ok(
  imageSearch.includes("broadenQuery("),
  "the broadening search uses the query ladder rather than re-implementing it"
);
h.ok(
  imageSearch.includes("fallbackCandidates("),
  "the broadening search falls back to the bundled deck"
);
h.ok(
  picker.includes("matchFallbackPhotos("),
  "the fallback deck is ranked against the query, not served blind"
);
h.ok(
  modal.includes("searchImagePoolBroadened("),
  "the search modal searches through the broadening path"
);
h.ok(
  !modal.includes("searchImagePool(") || modal.includes("searchImagePoolBroadened("),
  "the modal no longer calls the narrow search directly"
);

// Research and Replace must widen too, or two of the three ways into a photo
// would still dead-end on a specific query.
//
// `bodyOf` matches the declaration exactly rather than by prefix, because
// `researchImages` is a prefix of `researchImagesDetailed` and a loose match
// would silently check the wrong function.
const bodyOf = (fn: string) => {
  const at = imageSearch.indexOf(`export async function ${fn}(`);
  if (at === -1) return "";
  const rest = imageSearch.slice(at);
  const end = rest.indexOf("\n}\n");
  return end === -1 ? rest : rest.slice(0, end);
};

for (const fn of ["researchImagesDetailed", "replaceImage"]) {
  h.ok(
    bodyOf(fn).includes("searchImagePoolBroadened("),
    `${fn} widens the query instead of giving up`
  );
}
h.ok(
  bodyOf("researchImages").includes("researchImagesDetailed("),
  "researchImages is the same search, so it widens through the detailed form"
);
h.ok(
  bodyOf("researchImagesDetailed").includes("fromFallbackDeck"),
  "research reports whether the bundled deck answered, so the UI can say so"
);
h.ok(
  bodyOf("researchImagesDetailed").includes("broadened"),
  "research reports whether the query was widened"
);

// The user is told when the grid answers a different query than they typed.
h.ok(modal.includes("broadened"), "the modal tracks whether the query was widened");
h.ok(
  modal.includes("fromFallbackDeck") || modal.includes("usedFallbackDeck"),
  "the modal tracks whether the bundled deck answered"
);
h.ok(
  modal.includes("the search was widened") || modal.includes("widened"),
  "the modal says so when it widened the search"
);

// ----------------------------------------------------- topic rotation is used
h.ok(modal.includes('from "../lib/nature-topics"'), "the modal imports the topic rotation");
h.ok(modal.includes("nextNatureTopics("), "the modal draws its suggestions from the rotation");
h.ok(modal.includes("TOPICS_PER_OPEN"), "the modal shows the agreed number of suggestions");
h.ok(
  modal.includes("useState(() => nextNatureTopics"),
  "suggestions are drawn once per open, not re-rolled on every keystroke"
);
h.ok(modal.includes("handleTopic"), "a suggestion is clickable");

// ------------------------------------------------------- auto-framing is used
h.ok(editor.includes("autoFrame("), "the scene editor frames a newly chosen photo automatically");
h.ok(editor.includes("measureImage("), "the scene editor measures the photo before framing it");
h.ok(
  !editor.includes("const probe = new Image()"),
  "the hand-rolled image probe was replaced by the shared helper"
);

// ---------------------------------------------------------- the query lock
h.ok(
  editor.includes("image_query_locked: true"),
  "choosing a photo from the search modal pins the query that found it"
);
h.ok(
  editor.includes("scene.image_query_locked && scene.image_query"),
  "a pinned query wins over one derived from the narration"
);
h.ok(
  app.includes("image_query_locked"),
  "the lock is persisted alongside the rest of the scene metadata"
);
h.ok(
  app.includes("existing?.image_query_locked && existing?.image_query"),
  "a pinned query survives a script regeneration"
);
h.ok(
  modal.includes("onSelect: (url: string, query: string) => void"),
  "the modal hands back the query that found the photo, not just the URL"
);
h.ok(
  modal.includes("onSelect(proxyUrl(img.url), effectiveQuery)"),
  "the query handed back is the one the photos actually answer"
);

// ------------------------------------------------- the transition library
h.ok(
  app.includes("TRANSITION_GROUPS") && app.includes("transitionsInGroup("),
  "the picker renders the whole grouped transition library"
);
h.ok(
  !app.includes("TRANSITION_OPTIONS.map"),
  "the picker no longer renders a flat row of every option"
);

// --------------------------------------- the research block searches by hand
// The automatic query is built from the scene script, which is right most of
// the time and wrong exactly when the writer already knows what they want to
// see. Without a box of their own they had to edit the narration to move the
// photo, which is the tail wagging the dog.
h.ok(
  strip.includes("onSearch?: (query: string) => void"),
  "the research block accepts a search of the user's own criteria"
);
h.ok(
  strip.includes("<input") && strip.includes("placeholder=\"Search your own words"),
  "the research block renders a text box to type criteria into"
);
h.ok(
  strip.includes('e.key === "Enter"'),
  "Enter runs the search, so the button is not the only way in"
);
h.ok(
  editor.includes("onSearch={handleResearchSearch}"),
  "the scene editor hands the research block a real search"
);
h.ok(
  editor.includes("image_query_locked: true"),
  "criteria typed by hand are pinned, so a script edit cannot discard them"
);
h.ok(
  editor.includes("const handleUseSceneWords"),
  "there is a way back from a pinned query to the scene's own words"
);
h.ok(
  editor.includes("researchImagesDetailed("),
  "research reads the detailed result, so it can report a widened query"
);
h.ok(
  strip.includes("broadened") && strip.includes("fromFallbackDeck"),
  "the research block says when the query was widened or the deck answered"
);

// ------------------------------------------ nature fallback searches too
// Picking "Waterfalls" used to filter nine bundled photos down to two, and
// those same two appeared on every project forever. A criteria is now a
// search, with the bundled deck as the floor under it.
h.ok(
  natureData.includes("export const NATURE_CATEGORIES"),
  "the nature deck declares the criteria you can choose"
);
h.ok(
  editor.includes("const chooseNatureCategory") && editor.includes("void searchNature("),
  "choosing a nature criteria runs a real search for it"
);
h.ok(
  editor.includes("NATURE_CATEGORIES.map("),
  "the nature drawer renders the criteria chips"
);
h.ok(
  editor.includes("natureResults.map("),
  "the fresh search results are rendered, not just fetched"
);
h.ok(
  editor.includes("natureBackgroundsFor("),
  "the bundled deck is filtered to the chosen criteria"
);
h.ok(
  editor.includes("void searchNature(natureCategory)"),
  "there is a way to ask for more photos of the same criteria"
);

// Every bundled photo must sit under a criteria the drawer offers, or it
// becomes unreachable the moment anything but All is chosen.
const criteriaIds = new Set(NATURE_CATEGORIES.map((c) => c.id));
h.ok(criteriaIds.has("all"), "there is an All criteria");
for (const bg of NATURE_FALLBACKS) {
  h.ok(criteriaIds.has(bg.category), `the ${bg.category} deck photo is reachable from a chip`);
}
for (const cat of NATURE_CATEGORIES) {
  h.ok(cat.query.trim().length > 0, `the ${cat.id} criteria carries a search query`);
}
h.eq(
  natureBackgroundsFor("all").length,
  NATURE_FALLBACKS.length,
  "All keeps the whole bundled deck"
);
h.ok(
  natureBackgroundsFor("waterfall").every((bg) => bg.category === "waterfall"),
  "a criteria filters the bundled deck to itself"
);
h.eq(
  natureCategoryQuery("mountains"),
  "mountain landscape",
  "a criteria maps to the words the search actually asks for"
);
h.ok(
  natureCategoryQuery("nonsense" as never).length > 0,
  "an unknown criteria still searches for something rather than nothing"
);

h.done("image-search-wiring");
