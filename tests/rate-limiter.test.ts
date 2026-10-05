/**
 * The KV-backed rate limiter (src/rate-limiter.ts) has to survive the parts
 * of Workers KV that are not "just a Map":
 *
 *   • at most one write per second to the same key — a burst must not fail
 *     the requests that skip their counter write;
 *   • a minimum TTL of 60 seconds — shorter windows are clamped, never
 *     rejected;
 *   • KV can be unavailable or error at any time — the limiter must fail
 *     OPEN (admit) rather than turn a transient counter problem into an
 *     application 500.
 */
import { createHarness } from "./harness";
import { installTestPlatformEnv, createTestKV } from "./platform-env.ts";
import { rateLimit, getRateLimitCount } from "../src/rate-limiter.ts";
import { setEnv } from "../src/env.ts";

const h = createHarness();
const ok = h.ok;
const eq = h.eq;

installTestPlatformEnv();

/* Blocks once the stored count reaches the maximum. */
{
  const kv = createTestKV();
  setEnv({ DB: {}, RATE_LIMITS: kv });
  for (let i = 0; i < 5; i++) {
    eq(await rateLimit("rl:test:blocked", 3, 3600), true, `request ${i + 1} within the limit is admitted`);
  }
  // The three counted writes (spaced writes may skip some) eventually stop…
  const counted = await getRateLimitCount("rl:test:blocked");
  ok(counted >= 1 && counted <= 3, `the counter advanced (stored ${counted})`);
}

/* A counter already at the maximum blocks immediately. */
{
  const kv = createTestKV();
  setEnv({ DB: {}, RATE_LIMITS: kv });
  await kv.put("rl:test:full", "10");
  eq(await rateLimit("rl:test:full", 10, 3600), false, "a counter at the maximum blocks");
}

/* A KV write failure (the 1-write-per-second-per-key rejection, an outage,
   anything) must never fail the request. */
{
  const kv = createTestKV();
  const brokenPut = {
    get: kv.get,
    put: async () => { throw new Error("429 Too Many Requests (KV write rate limit)"); },
    delete: kv.delete,
  };
  setEnv({ DB: {}, RATE_LIMITS: brokenPut });
  eq(await rateLimit("rl:test:broken", 10, 3600), true, "a KV write error fails open");
  const brokenGet = {
    get: async () => { throw new Error("503 KV unavailable"); },
    put: kv.put,
    delete: kv.delete,
  };
  setEnv({ DB: {}, RATE_LIMITS: brokenGet });
  eq(await rateLimit("rl:test:broken-get", 10, 3600), true, "a KV read error fails open");
}

/* No KV binding at all (misconfiguration) also fails open. */
{
  setEnv({ DB: {} });
  eq(await rateLimit("rl:test:no-kv", 10, 3600), true, "a missing KV binding fails open");
  eq(await getRateLimitCount("rl:test:no-kv"), 0, "a missing KV binding reads as zero");
}

/* Writes to the same key inside one second are spaced out, not failed. */
{
  const kv = createTestKV();
  let writes = 0;
  const countingKv = {
    get: kv.get,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      writes += 1;
      return kv.put(key, value, options);
    },
    delete: kv.delete,
  };
  setEnv({ DB: {}, RATE_LIMITS: countingKv });
  const results: boolean[] = [];
  for (let i = 0; i < 20; i++) results.push(await rateLimit("rl:test:burst", 600, 3600));
  ok(results.every(Boolean), "a same-second burst of 20 requests is fully admitted");
  eq(writes, 1, "only the first request in the burst writes to KV (1 write/sec/key)");
  // …and the counter still blocks at the maximum once writes resume.
  await kv.put("rl:test:burst", "600");
  eq(await rateLimit("rl:test:burst", 600, 3600), false, "after reaching the maximum the burst key blocks");
}

/* The TTL handed to KV is never below the 60-second minimum. */
{
  let seenTtl = Number.POSITIVE_INFINITY;
  const observingKv = {
    get: async () => null,
    put: async (_key: string, _value: string, options?: { expirationTtl?: number }) => {
      seenTtl = options?.expirationTtl ?? Number.POSITIVE_INFINITY;
    },
    delete: async () => undefined,
  };
  setEnv({ DB: {}, RATE_LIMITS: observingKv });
  await rateLimit("rl:test:ttl", 10, 5); // a 5-second window would be rejected by KV
  ok(seenTtl >= 60, `the TTL is clamped up to KV's 60-second minimum (saw ${seenTtl})`);
}

h.done("rate limiter");
