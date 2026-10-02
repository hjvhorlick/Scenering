/**
 * Nature topic suggestions for the image search modal.
 *
 * Opening the search with an empty head is the slowest moment in building a
 * video, so the modal offers a few ready-made subjects to click. They have to
 * feel fresh: showing the same three every time makes the feature invisible
 * after the first use.
 *
 * A shuffled queue is drawn from instead of sampling independently each open.
 * That guarantees no topic repeats until every one of them has been offered,
 * which independent random picks cannot promise.
 */

import { pickRandomSample } from "./image-picker";

/** How many suggestions the modal shows each time it opens. */
export const TOPICS_PER_OPEN = 3;

export const NATURE_TOPICS: readonly string[] = [
  "mountain sunrise",
  "alpine lake",
  "misty forest",
  "ocean waves",
  "desert dunes",
  "waterfall",
  "tropical beach",
  "autumn forest",
  "snowy peaks",
  "green valley",
  "canyon landscape",
  "river through forest",
  "wildflower meadow",
  "coastal cliffs",
  "night sky",
  "milky way",
  "aurora borealis",
  "starry desert",
  "moon landscape",
  "blue sky clouds",
  "storm clouds",
  "pink sunset sky",
  "golden hour sky",
  "sun rays through clouds",
  "cloudscape",
  "morning fog",
  "volcanic landscape",
  "glacier",
  "savanna sunset",
  "rainforest",
  "island lagoon",
  "cherry blossoms",
  "bamboo forest",
  "lavender field",
  "rolling hills",
  "moonlit mountains",
  "earth from space",
];

/** The remaining topics in the current shuffled pass. */
let queue: string[] = [];

/** Start a fresh rotation — used by the tests, and on a project switch. */
export function resetNatureTopicRotation(): void {
  queue = [];
}

/** How many topics are left before the deck reshuffles. Exposed for tests. */
export function remainingNatureTopics(): number {
  return queue.length;
}

/**
 * The next `count` suggestions, never repeating one until the whole deck has
 * been handed out. When the queue runs dry mid-draw it is reshuffled and the
 * draw continues, so asking for more topics than exist still works.
 */
export function nextNatureTopics(
  count: number = TOPICS_PER_OPEN,
  rng: () => number = Math.random
): string[] {
  const wanted = Math.max(0, Math.floor(count));
  const out: string[] = [];

  while (out.length < wanted) {
    if (queue.length === 0) {
      queue = pickRandomSample(NATURE_TOPICS, NATURE_TOPICS.length, rng);
    }
    const topic = queue.shift();
    if (topic === undefined) break; // empty catalogue — nothing to offer
    out.push(topic);
  }

  return out;
}
