import { env } from "./env";

/**
 * KV-backed rate limiting counter.
 *
 * Workers KV has three behaviours that shape this implementation:
 *
 * 1. **At most one write per second to the same key.** A burst of requests
 *    to one endpoint from one visitor — an image grid loading twenty
 *    thumbnails through the proxy in a single second, say — all write the
 *    same `rl:<name>:<subject>` key. Without spacing, KV rejects the extra
 *    writes (HTTP 429) and those rejections used to surface as application
 *    500s. Writes to a given key are therefore spaced at least one second
 *    apart within this isolate, and any KV error fails **open**.
 * 2. **Minimum TTL of 60 seconds.** `put()` with `expirationTtl` below 60 is
 *    rejected, so shorter windows are clamped up.
 * 3. **Eventual consistency** (up to ~60 s to propagate globally). Counters
 *    can under-count across locations. That is acceptable here: every limit
 *    in this application is abuse mitigation, not a security boundary, and
 *    the per-request accounting that must be exact (final exports) is done
 *    in D1, which is strongly consistent.
 */
const MIN_TTL_SECONDS = 60;
/** KV rejects a second write to the same key within one second. */
const WRITE_SPACING_MS = 1050;
/** Last KV write per key inside this isolate; isolates are per-colo, so this
 *  only reduces (never increases) how often KV is written. */
const lastWriteAt = new Map<string, number>();

/** The slice of the KV API this module uses, declared structurally so the
 *  file typechecks both under @cloudflare/workers-types (Worker build) and
 *  in the browser compilation unit, which has no Workers types. */
interface RateLimitKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

function kvNamespace(): RateLimitKV | null {
  const kv = env().RATE_LIMITS;
  return kv ?? null;
}

export async function rateLimit(key: string, maxRequests: number, windowSeconds: number = 60): Promise<boolean> {
  let kv: RateLimitKV | null;
  try {
    kv = kvNamespace();
  } catch {
    // env() not initialised (no Worker env installed — e.g. a unit test).
    return true;
  }
  if (!kv) return true; // No KV binding configured: fail open rather than 500.

  try {
    const current = parseInt((await kv.get(key)) || "0", 10);
    if (current >= maxRequests) return false;

    const now = Date.now();
    const last = lastWriteAt.get(key) ?? 0;
    if (now - last < WRITE_SPACING_MS) {
      // A write to this key happened less than a second ago; KV would reject
      // another one. Admit the request without writing — the counter
      // under-counts by at most the requests packed into one second.
      return true;
    }
    lastWriteAt.set(key, now);
    await kv.put(key, String(current + 1), { expirationTtl: Math.max(MIN_TTL_SECONDS, windowSeconds) });
    return true;
  } catch {
    // KV unavailable, throttled, or the write raced another isolate's write.
    // Rate limiting is best-effort: never turn a transient counter failure
    // into a failed user request.
    return true;
  }
}

export async function getRateLimitCount(key: string): Promise<number> {
  try {
    const kv = kvNamespace();
    if (!kv) return 0;
    return parseInt((await kv.get(key)) || "0", 10);
  } catch {
    return 0;
  }
}
