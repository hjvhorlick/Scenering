import { createHarness } from "./harness";
import {
  NATURE_TOPICS,
  TOPICS_PER_OPEN,
  nextNatureTopics,
  resetNatureTopicRotation,
  remainingNatureTopics,
} from "../src/lib/nature-topics";

/**
 * The search modal offers a few subjects to click. The promise is that they
 * feel fresh: no topic may come back until every other one has been offered,
 * which independent random picks cannot guarantee.
 */
const h = createHarness();

h.ok(NATURE_TOPICS.length > 20, "the topic deck is big enough to feel varied");
h.eq(new Set(NATURE_TOPICS).size, NATURE_TOPICS.length, "no topic is listed twice");
h.ok(
  NATURE_TOPICS.every((t) => t.trim() === t && t.length > 0),
  "every topic is a clean, non-empty phrase"
);
h.eq(TOPICS_PER_OPEN, 3, "three suggestions per open");

// ------------------------------------------------------- a full rotation
{
  resetNatureTopicRotation();
  const seen: string[] = [];
  // Draw exactly one full pass of the deck.
  const opens = Math.floor(NATURE_TOPICS.length / TOPICS_PER_OPEN);
  for (let i = 0; i < opens; i++) {
    const batch = nextNatureTopics(TOPICS_PER_OPEN);
    h.eq(batch.length, TOPICS_PER_OPEN, `open ${i + 1} offers ${TOPICS_PER_OPEN} topics`);
    h.eq(new Set(batch).size, batch.length, `open ${i + 1} offers no duplicate within the batch`);
    seen.push(...batch);
  }
  h.eq(
    new Set(seen).size,
    seen.length,
    `no topic repeated across ${opens} consecutive opens (${seen.length} draws)`
  );
  h.ok(
    seen.every((t) => NATURE_TOPICS.includes(t)),
    "every suggestion comes from the deck"
  );
}

// --------------------------------------------- the deck reshuffles, forever
{
  resetNatureTopicRotation();
  const drawn: string[] = [];
  for (let i = 0; i < NATURE_TOPICS.length * 3; i++) drawn.push(...nextNatureTopics(1));
  h.eq(drawn.length, NATURE_TOPICS.length * 3, "the rotation keeps producing topics");
  // Each full pass covers the whole deck exactly once.
  for (let pass = 0; pass < 3; pass++) {
    const slice = drawn.slice(pass * NATURE_TOPICS.length, (pass + 1) * NATURE_TOPICS.length);
    h.eq(new Set(slice).size, NATURE_TOPICS.length, `pass ${pass + 1} covers the deck exactly once`);
  }
}

// ------------------------------------------------------------- ordering
{
  // Two fresh rotations should not open with the same three topics; a fixed
  // order would make the feature invisible after the first use.
  let differs = false;
  for (let attempt = 0; attempt < 20 && !differs; attempt++) {
    resetNatureTopicRotation();
    const a = nextNatureTopics(TOPICS_PER_OPEN).join("|");
    resetNatureTopicRotation();
    const b = nextNatureTopics(TOPICS_PER_OPEN).join("|");
    if (a !== b) differs = true;
  }
  h.ok(differs, "the deck is shuffled, not served in a fixed order");
}

// -------------------------------------------------------------- edge cases
{
  resetNatureTopicRotation();
  h.eq(remainingNatureTopics(), 0, "a reset rotation starts empty");
  h.eq(nextNatureTopics(0).length, 0, "asking for no topics returns none");
  h.eq(nextNatureTopics(-5).length, 0, "a negative count returns none, not a crash");
  h.eq(nextNatureTopics(2.7).length, 2, "a fractional count is floored");

  resetNatureTopicRotation();
  const huge = nextNatureTopics(NATURE_TOPICS.length + 5);
  h.eq(huge.length, NATURE_TOPICS.length + 5, "asking for more than the deck holds still works");

  resetNatureTopicRotation();
  nextNatureTopics(TOPICS_PER_OPEN);
  h.eq(
    remainingNatureTopics(),
    NATURE_TOPICS.length - TOPICS_PER_OPEN,
    "the queue tracks what is left in the current pass"
  );
}

h.done("nature-topics");
