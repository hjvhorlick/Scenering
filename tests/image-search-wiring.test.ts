import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

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
const editor = read("src/components/SceneEditor.tsx");
const app = read("src/App.tsx");
const imageSearch = read("src/lib/image-search.ts");
const picker = read("src/lib/image-picker.ts");

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
for (const fn of ["researchImages", "replaceImage"]) {
  const body = imageSearch.slice(imageSearch.indexOf(`export async function ${fn}`));
  const end = body.indexOf("\n}\n");
  h.ok(
    body.slice(0, end).includes("searchImagePoolBroadened("),
    `${fn} widens the query instead of giving up`
  );
}

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

h.done("image-search-wiring");
