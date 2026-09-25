import {
  IMAGE_SEARCH_COUNT,
  pickRandomImageUrl,
  pickRandomSample,
  rawImageUrl,
} from "../src/lib/image-picker";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const eq = h.eq;

/** Deterministic cyclic rng for reproducible assertions. */
const makeRng = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

// ------------------------------------------------------ pickRandomImageUrl
eq(pickRandomImageUrl([]), null, "empty pool returns null");
eq(pickRandomImageUrl([""]), null, "blank entries are dropped");

eq(pickRandomImageUrl(["a"], undefined, makeRng()), "a", "single candidate is always returned");
eq(pickRandomImageUrl(["a", "a", "a"], undefined, makeRng()), "a", "duplicates collapse");

{
  const used = new Set(["a", "b"]);
  for (let i = 0; i < 20; i++) {
    eq(pickRandomImageUrl(["a", "b", "c"], used, makeRng(i + 1)), "c", "used urls are never picked");
  }
}

{
  // Exclusion of everything must degrade to the full pool, not null.
  const used = new Set(["a", "b"]);
  const hit = pickRandomImageUrl(["a", "b"], used, makeRng(42));
  ok(hit === "a" || hit === "b", `fully-exhausted pool falls back to full pool (got ${hit})`);
}

{
  // Randomness sanity: many seeded picks over a 100-deep pool hit many
  // distinct urls (i.e. it is not stuck on the first item).
  const pool = Array.from({ length: 100 }, (_, i) => `img-${i}`);
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const hit = pickRandomImageUrl(pool, undefined, makeRng(i * 7 + 3));
    if (hit) seen.add(hit);
  }
  ok(seen.size > 25, `random picks spread across pool (saw ${seen.size}/100 distinct)`);
}

// ---------------------------------------------------------- pickRandomSample
{
  const pool = Array.from({ length: 100 }, (_, i) => i);
  const sample = pickRandomSample(pool, 12, makeRng(9));
  eq(sample.length, 12, "sample returns requested size");
  ok(new Set(sample).size === 12, "sample has no duplicates");
  ok(sample.every((v) => pool.includes(v)), "sample items come from the pool");

  const a = pickRandomSample(pool, 12, makeRng(1));
  const b = pickRandomSample(pool, 12, makeRng(2));
  ok(JSON.stringify(a) !== JSON.stringify(b), "different seeds → different orders");

  const all = pickRandomSample(pool, pool.length, makeRng(5));
  eq(all.length, 100, "full-length sample returns every item");
  eq(new Set(all).size, 100, "full-length sample is a true permutation");

  const tooMany = pickRandomSample(pool, 500, makeRng(5));
  eq(tooMany.length, 100, "asking beyond pool length clamps to pool size");

  eq(pickRandomSample([], 5, makeRng()).length, 0, "empty pool → empty sample");
}

// --------------------------------------------------------------- rawImageUrl
eq(
  rawImageUrl("/functions/v1/proxy-image?url=https%3A%2F%2Fcdn.example.com%2Fa.jpg"),
  "https://cdn.example.com/a.jpg",
  "decoded proxied url"
);
eq(
  rawImageUrl("/api/proxy-image?url=https%3A%2F%2Fx.y%2Fe%3Fw%3D1280%26q%3D80"),
  "https://x.y/e?w=1280&q=80",
  "query-string params survive the unwrap"
);
eq(rawImageUrl("https://commons.wikimedia.org/f.jpg"), "https://commons.wikimedia.org/f.jpg", "plain url passes through");
eq(rawImageUrl(""), "", "empty url passes through");

eq(IMAGE_SEARCH_COUNT, 100, "searches request the top ~100 candidates");

h.done("image-picker");
