/**
 * The image proxy's response validator — and the copies it no longer makes.
 *
 * WHY THIS EXISTS
 *
 * Cloudflare reported CPU time limit errors while the studio was in use. The
 * image search path was measured and cleared: ranking 80 Pexels candidates
 * costs 0.0037 ms and serialising them 0.056 ms, so searching is not where the
 * budget goes. The proxy is. Every photo the browser displays is routed
 * through /api/proxy-image, and that handler used to do three things per
 * request that the response did not need:
 *
 *   1. Let Express build a weak ETag. Express attaches one to every res.send()
 *      unless the header is already set (express/lib/response.js —
 *      `generateETag = !this.get("ETag") && typeof etagFn === "function"`), and
 *      its generator hashes the entire entity. So a 500 KB photo was read end
 *      to end again purely to produce a header — 0.25 ms measured, 0.82 ms at
 *      1.5 MB — on a Worker with no `limits` block in wrangler.jsonc and so no
 *      CPU budget above the plan default.
 *   2. Duplicate the decoded image with `arrayBuf.slice(0)` before handing it
 *      to the edge cache, even though constructing a Response from a
 *      BufferSource already copies the bytes and leaves the source intact.
 *   3. Answer a browser that already held the photo with the whole image again,
 *      because nothing ever compared a validator.
 *
 * These checks drive the real Express app and the real handler over HTTP, so
 * they fail if the validator stops being URL-derived, if Express quietly takes
 * it back, if the 304 short-circuit regresses, or if the grey placeholder ever
 * starts carrying a validator — which would let a browser revalidate into a
 * permanent placeholder.
 */
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createHarness } from "./harness";

const h = createHarness();

await (async () => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "image-proxy-test-secret-0123456789abcdef";
  process.env.SCENERING_OWNER_EMAIL = "owner@scenering.test";

  const { installTestPlatformEnv } = await import("./platform-env.ts");
  installTestPlatformEnv();

  // Serve one known photo from the ASSETS binding so the proxy's success path
  // executes for real with no network, exactly as it does against Cloudflare's
  // static asset layer. Everything else still resolves through the bindings
  // installTestPlatformEnv installed.
  const { env, setEnv } = await import("../src/env.ts");
  const PHOTO_PATH = "/nature/test-photo.jpg";
  const photo = Buffer.alloc(64 * 1024, 0x41);
  const installed = env();
  setEnv(
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === "ASSETS"
            ? {
                fetch: async (request: Request) => {
                  const path = new URL(request.url).pathname;
                  if (path !== PHOTO_PATH) return new Response(null, { status: 404 });
                  return new Response(photo, {
                    status: 200,
                    headers: { "content-type": "image/jpeg" },
                  });
                },
              }
            : (installed as any)[prop],
        has: (_target, prop) => prop === "ASSETS" || prop in (installed as object),
      }
    )
  );

  const { db } = await import("../src/db.ts");
  const { createApp } = await import("../server.ts");

  const app = createApp();
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const origin = `http://127.0.0.1:${port}`;

    // The proxy sits behind requirePlatformUser, so sign a real session in.
    await fetch(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "image-proxy@scenering.test",
        displayName: "Proxy Tester",
        password: "strong-password-12345",
      }),
    });
    const created = (await db.findUserByEmail("image-proxy@scenering.test"))!;
    await db.updateUser(created.id, { isVerified: true });
    const loginRes = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "image-proxy@scenering.test",
        password: "strong-password-12345",
      }),
    });
    const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
    h.ok(cookie.length > 0, "a session cookie was issued for the proxy requests");

    const proxyUrl = (target: string) =>
      `${origin}/api/proxy-image?url=${encodeURIComponent(target)}`;
    // The validator the handler must produce: a hash of the URL, not the bytes.
    const validatorFor = (target: string) =>
      `W/"${createHash("sha1").update(target).digest("base64")}"`;

    const first = await fetch(proxyUrl(PHOTO_PATH), { headers: { Cookie: cookie } });
    h.eq(first.status, 200, "a proxied photo is served");
    h.eq(first.headers.get("content-type"), "image/jpeg", "the upstream content type is preserved");
    h.eq(first.headers.get("cache-control"), "public, max-age=86400, immutable", "the photo stays browser-cacheable for a day");

    // The load-bearing assertion. Express's own generator would return a
    // content hash of the 64 KB body instead, so matching this exact string is
    // what proves the body was never hashed to build the header.
    h.eq(first.headers.get("etag"), validatorFor(PHOTO_PATH), "the ETag is derived from the URL, not from hashing the image body");

    const body = await first.arrayBuffer();
    h.eq(body.byteLength, photo.byteLength, "every image byte still reaches the browser");
    h.eq(new Uint8Array(body)[0], 0x41, "the bytes served are the photo's own");

    // A browser that already holds the photo must not be sent it again.
    const revalidated = await fetch(proxyUrl(PHOTO_PATH), {
      headers: { Cookie: cookie, "If-None-Match": validatorFor(PHOTO_PATH) },
    });
    h.eq(revalidated.status, 304, "a repeat request carrying the validator is answered 304");
    h.eq((await revalidated.arrayBuffer()).byteLength, 0, "the 304 carries no body");
    h.eq(revalidated.headers.get("etag"), validatorFor(PHOTO_PATH), "the 304 still names the validator");

    // A different photo must not validate against this one.
    const other = "/nature/another-photo.jpg";
    h.ok(validatorFor(other) !== validatorFor(PHOTO_PATH), "each photo has its own validator");

    /* The grey placeholder must never be cacheable.
     *
     * It is served when the asset is missing and no upstream can be reached.
     * Express gives it a weak ETag of its own — a hash of the few-hundred-byte
     * SVG, which is trivial and is NOT the URL validator above. What must not
     * happen is a browser holding the placeholder and revalidating into a 304:
     * a scene that failed to load once would then keep showing grey even after
     * the photo became reachable, and no retry in the studio would clear it.
     * no-store is what makes the failure retryable. */
    const missing = await fetch(proxyUrl("/nature/does-not-exist.jpg"), {
      headers: { Cookie: cookie },
    });
    h.eq(missing.headers.get("cache-control"), "no-store", "the placeholder is not cacheable, so a transient failure stays retryable");
    h.ok(
      missing.headers.get("etag") !== validatorFor("/nature/does-not-exist.jpg"),
      "the placeholder does not wear the URL validator, so it can never be mistaken for the photo"
    );

    // A stale validator from a different photo must not short-circuit to 304.
    const mismatched = await fetch(proxyUrl(PHOTO_PATH), {
      headers: { Cookie: cookie, "If-None-Match": validatorFor(other) },
    });
    h.eq(mismatched.status, 200, "a validator for a different photo is ignored and the image is served");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
})();

h.done("image proxy validation and caching");
