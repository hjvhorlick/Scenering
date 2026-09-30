/**
 * The image-research deck rules.
 *
 * These guard the two promises the research UI makes to the user: pressing
 * research again gives a genuinely different set, and Replace always hands
 * back a photo that has not been shown yet. Both were previously only
 * enforced by whichever component happened to call the helper, so a caller
 * that forgot to record a hand-out could serve the same photo twice.
 *
 * The functions are seeded with a deterministic rng where the exact draw
 * matters, so a failure is reproducible rather than a flake.
 */

import {
  selectFreshCandidates,
  pickOneFreshCandidate,
  rememberShown,
  rememberShownAll,
  hasBeenShown,
  resetShownHistory,
  shownHistorySize,
  VISIBLE_CANDIDATES,
  type ImageCandidate,
} from "../src/lib/image-picker";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;

/** A pool the size a real Pexels/Pixabay query returns. */
const bigPool = (n = 100): ImageCandidate[] =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/photo-${i}.jpg`,
    thumbnail: `https://example.com/thumb-${i}.jpg`,
    source: "pexels",
  }));

// A seeded rng so a failing draw can be reproduced exactly.
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- the visible-deck size is the one the grid is built around -------------
ok(VISIBLE_CANDIDATES === 12, "twelve candidates are shown at a time");
ok(VISIBLE_CANDIDATES % 3 === 0, "12 divides by the phone grid's 3 columns");
ok(VISIBLE_CANDIDATES % 4 === 0, "12 divides by the tablet grid's 4 columns");
ok(VISIBLE_CANDIDATES % 6 === 0, "12 divides by the desktop grid's 6 columns");

// --- research: consecutive sets must not repeat ----------------------------
resetShownHistory();
{
  const pool = bigPool();
  const rng = seededRng(12345);
  let previous: ImageCandidate[] = [];
  let carries = 0;

  for (let press = 0; press < 6; press++) {
    const set = selectFreshCandidates(pool, VISIBLE_CANDIDATES, rng);
    ok(set.length === VISIBLE_CANDIDATES, `press ${press + 1} fills the grid with 12`);
    if (previous.length > 0) {
      const overlap = set.filter((c) =>
        previous.some((p) => p.url === c.url)
      ).length;
      carries += overlap;
      ok(overlap === 0, `press ${press + 1} repeats none of the previous set (got ${overlap})`);
    }
    previous = set;
  }
  ok(carries === 0, "six consecutive research presses never carry a photo over");
  ok(
    shownHistorySize() === 6 * VISIBLE_CANDIDATES,
    `history records every shown photo (got ${shownHistorySize()})`
  );
}

// --- research picks distinct photos inside a single set --------------------
resetShownHistory();
{
  const set = selectFreshCandidates(bigPool(), VISIBLE_CANDIDATES, seededRng(7));
  const urls = new Set(set.map((c) => c.url));
  ok(urls.size === set.length, "a single research set contains no duplicate photos");
}

// --- replace: a different photo every press --------------------------------
resetShownHistory();
{
  const pool = bigPool();
  const rng = seededRng(999);
  const handed: string[] = [];
  let repeats = 0;

  for (let press = 0; press < 20; press++) {
    const pick = pickOneFreshCandidate(pool, rng);
    ok(pick !== null, `replace press ${press + 1} returns a photo`);
    const url = pick?.url || "";
    if (handed.includes(url)) repeats++;
    handed.push(url);
  }
  ok(repeats === 0, `twenty replaces never hand back the same photo (got ${repeats})`);
  ok(new Set(handed).size === 20, "twenty replaces yield twenty distinct photos");
}

// --- replace does not re-serve what research already showed ----------------
resetShownHistory();
{
  const pool = bigPool();
  const researched = selectFreshCandidates(pool, VISIBLE_CANDIDATES, seededRng(31));
  const pick = pickOneFreshCandidate(pool, seededRng(32));
  ok(pick !== null, "replace still returns a photo after research");
  ok(
    !researched.some((c) => c.url === pick?.url),
    "replace never returns a photo the research grid is already showing"
  );
}

// --- exhaustion: an empty grid is never acceptable -------------------------
resetShownHistory();
{
  const tiny = bigPool(5);
  for (let press = 0; press < 6; press++) {
    const set = selectFreshCandidates(tiny, VISIBLE_CANDIDATES, seededRng(press + 1));
    ok(set.length > 0, `press ${press + 1} on a 5-photo library still shows photos`);
    ok(
      set.every((c) => tiny.some((t) => t.url === c.url)),
      `press ${press + 1} only returns photos from the pool`
    );
  }
}

// --- degenerate input is handled, not thrown on ----------------------------
resetShownHistory();
{
  ok(selectFreshCandidates([], 12).length === 0, "an empty pool yields an empty set");
  ok(pickOneFreshCandidate([]) === null, "an empty pool yields no replace candidate");

  // Pools carry the same photo more than once surprisingly often.
  const duped: ImageCandidate[] = [
    { url: "https://x/a.jpg", thumbnail: "a", source: "pexels" },
    { url: "https://x/a.jpg", thumbnail: "a", source: "pexels" },
    { url: "https://x/b.jpg", thumbnail: "b", source: "pexels" },
  ];
  const set = selectFreshCandidates(duped, 12, seededRng(3));
  ok(
    new Set(set.map((c) => c.url)).size === set.length,
    "a pool containing duplicates is de-duplicated by URL"
  );

  // Items missing a url must not be offered or crash the picker.
  const broken = [
    { url: "", thumbnail: "x", source: "pexels" },
    { url: "https://x/ok.jpg", thumbnail: "y", source: "pexels" },
  ] as ImageCandidate[];
  const picked = selectFreshCandidates(broken, 12, seededRng(4));
  ok(picked.every((c) => c.url.length > 0), "candidates without a url are skipped");
}

// --- history bookkeeping ---------------------------------------------------
resetShownHistory();
{
  ok(shownHistorySize() === 0, "history starts empty");
  rememberShown("https://x/one.jpg");
  ok(hasBeenShown("https://x/one.jpg"), "a remembered url reads back as shown");
  ok(!hasBeenShown("https://x/two.jpg"), "an unseen url reads back as unseen");

  rememberShown("https://x/one.jpg");
  ok(shownHistorySize() === 1, "remembering the same url twice does not double-count");

  rememberShown("");
  ok(shownHistorySize() === 1, "an empty url is ignored");

  rememberShownAll(["https://x/two.jpg", "https://x/three.jpg"]);
  ok(shownHistorySize() === 3, "bulk remember adds each new url once");

  // The cap keeps a long session from growing the set without limit.
  for (let i = 0; i < 700; i++) rememberShown(`https://cap/${i}.jpg`);
  ok(shownHistorySize() <= 500, `history stays bounded (got ${shownHistorySize()})`);
  ok(
    !hasBeenShown("https://x/one.jpg"),
    "the oldest entries are the ones evicted, not the newest"
  );
}

// --- the same scene must not get the same photo twice in a row -------------
resetShownHistory();
{
  // Replacing one scene repeatedly with a fresh pool each time — what the
  // Replace button actually does, since each press re-queries the server.
  const rng = seededRng(2024);
  let last = "";
  let sameAsLast = 0;
  for (let press = 0; press < 15; press++) {
    const pick = pickOneFreshCandidate(bigPool(), rng);
    if (pick && pick.url === last) sameAsLast++;
    last = pick?.url || "";
  }
  ok(sameAsLast === 0, `15 sequential replaces never repeat back-to-back (got ${sameAsLast})`);
}

h.done("image-research");
