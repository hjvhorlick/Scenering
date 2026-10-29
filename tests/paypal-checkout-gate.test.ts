/**
 * The gate in front of PayPal Sandbox checkout.
 *
 * Paid checkout used to be switched on by `import.meta.env.DEV` in the
 * browser — a flag that is false in the bundle the app is actually served
 * from (`npm run dev` runs `vite build --watch`; every other host serves a
 * production build). The buttons were therefore dead on the very Sandbox
 * hosts meant for testing them, with no explanation on screen. These checks
 * hold the server's runtime answer to being the one gate, and hold the
 * diagnostics that replace a silently disabled button.
 */
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createHarness } from "./harness";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const h = createHarness();
process.chdir(mkdtempSync(`${tmpdir()}/scenering-paypal-gate-`));

const FULL = {
  NODE_ENV: "development",
  TRUST_PROXY: "1",
  SESSION_SECRET: "a-test-session-secret-of-sufficient-length",
  PUBLIC_APP_URL: "https://scenering-sandbox.test",
  PAYPAL_ENVIRONMENT: "sandbox",
  PAYPAL_CLIENT_ID: "sandbox-client-id-test-only",
  PAYPAL_CLIENT_SECRET: "sandbox-client-secret-test-only",
  PAYPAL_WEBHOOK_ID: "sandbox-webhook-id-test-only",
  PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID: "P-SF-MONTHLY-TEST",
  PAYPAL_SCENEFLOW_YEARLY_PLAN_ID: "P-SF-YEARLY-TEST",
  PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID: "P-SG-MONTHLY-TEST",
  PAYPAL_SCENEFORGE_YEARLY_PLAN_ID: "P-SG-YEARLY-TEST",
} as const;
Object.assign(process.env, FULL);

const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const { db } = await import("../src/db.ts");
const paypalApi = await import("../server/paypal-api.ts");
const platform = await import("../server/platform.ts");

const calls: Array<{ url: string; method: string; body: any }> = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://api-m.sandbox.paypal.com/")) return realFetch(input, init);
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string" && headers.get("content-type")?.includes("application/json") ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method: init?.method || "GET", body });
  if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-access-token", expires_in: 300 });
  if (url.endsWith("/v1/billing/subscriptions")) return Response.json({
    id: "I-SANDBOX-SUB-GATE",
    custom_id: body.custom_id,
    plan_id: body.plan_id,
    status: "APPROVAL_PENDING",
    create_time: "2026-10-29T10:00:00Z",
    links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=I-SANDBOX-SUB-GATE" }],
  }, { status: 201 });
  return Response.json({}, { status: 404 });
}) as typeof fetch;

const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const publicConfig = async (headers: Record<string, string> = {}) => {
  const response = await fetch(`${base}/api/billing/public-config`, { headers });
  return (await response.json()) as any;
};

try {
  /* ---- 1. A complete Sandbox configuration on a development runtime ------ */
  {
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, true, "a complete Sandbox configuration enables checkout on a development runtime");
    h.eq(config.configured, true, "the public billing configuration is reported ready");
    h.eq(config.sandbox, true, "the public configuration is pinned to Sandbox");
    h.eq(config.production, false, "a development runtime says so to the browser");
    h.eq(config.missing.length, 0, "nothing is reported missing when every variable is set");
    h.eq(config.clientId, "sandbox-client-id-test-only", "the Sandbox client id is published so the browser SDK can load");
    h.eq(JSON.stringify(config).includes("sandbox-client-secret-test-only"), false, "the client secret is never published");
    h.eq(JSON.stringify(config).includes("sandbox-webhook-id-test-only"), false, "the webhook id is never published");
  }

  /* ---- 2. Production is still refused, whatever is configured ------------ */
  {
    process.env.NODE_ENV = "production";
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, false, "production never offers PayPal Sandbox checkout");
    h.eq(config.production, true, "the browser is told which runtime it is talking to");
    process.env.NODE_ENV = "development";
  }

  /* ---- 3. Whatever is missing is named, without its value ---------------- */
  {
    process.env.PAYPAL_CLIENT_ID = "";
    process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID = "";
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, false, "an incomplete Sandbox configuration disables checkout");
    h.ok(config.missing.some((item: string) => item.startsWith("PAYPAL_CLIENT_ID")), "the missing client id is named");
    h.ok(config.missing.some((item: string) => item.startsWith("PAYPAL_SCENEFORGE_YEARLY_PLAN_ID")), "the missing plan id is named");
    h.eq(config.missing.length, 2, "only the variables that are actually unset are reported");
    process.env.PAYPAL_CLIENT_ID = FULL.PAYPAL_CLIENT_ID;
    process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID = FULL.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID;
  }

  /* ---- 4. The link origin ------------------------------------------------- */
  {
    h.eq(paypalApi.paypalAppUrl("http://preview.example.test"), "https://scenering-sandbox.test", "a configured PUBLIC_APP_URL always wins over a request host");
    process.env.NODE_ENV = "production";
    const configuredOrigin = process.env.PUBLIC_APP_URL;
    delete process.env.PUBLIC_APP_URL;
    h.eq(paypalApi.paypalAppUrl("http://preview.example.test"), "", "production never invents a link origin from a request");
    process.env.PUBLIC_APP_URL = configuredOrigin;
    process.env.NODE_ENV = "development";
    delete process.env.PUBLIC_APP_URL;
    h.eq(paypalApi.paypalAppUrl("http://preview.example.test"), "http://preview.example.test", "a development host may derive its own link origin from the request");
    h.eq(paypalApi.paypalAppUrl(""), "", "with no configured origin and no request there is no link origin");
    process.env.PUBLIC_APP_URL = FULL.PUBLIC_APP_URL;
  }

  /* ---- 5. Checkout opens on a preview host with a derived origin ---------- */
  {
    const user = await db.createUser({
      id: "paypal-gate-user", email: "gate-member@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Gate Member", role: "user", isVerified: true,
    });
    await db.createMembership(user.id, "free");
    const raw = `gate-session-${randomUUID()}`;
    const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
    testD1().sqlite
      .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("sess_gate_test", user.id, hash, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    const cookie = `scenering_session=${encodeURIComponent(raw)}`;

    delete process.env.PUBLIC_APP_URL;
    paypalApi.resetPayPalTokenCacheForTests();
    calls.length = 0;
    const response = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "x-forwarded-host": "preview.example.test" },
      body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    const created = (await response.json()) as any;
    h.eq(response.status, 201, "Sandbox checkout opens on a preview host without a configured PUBLIC_APP_URL");
    h.eq(created.subscriptionId, "I-SANDBOX-SUB-GATE", "the browser receives the PayPal subscription id to approve");
    const creation = calls.find((call) => call.url.endsWith("/v1/billing/subscriptions"));
    h.eq(creation?.body.application_context.return_url, "http://preview.example.test/welcome?payment=paypal", "the approval return link is built on the host the member is on");
    h.eq(creation?.body.application_context.cancel_url, "http://preview.example.test/pricing?checkout=cancelled", "the cancellation link is built on the host the member is on");
    h.eq(creation?.body.plan_id, "P-SF-MONTHLY-TEST", "the plan id still comes from server configuration, never from the browser");

    // Production must refuse the same request rather than derive an origin.
    process.env.NODE_ENV = "production";
    const refused = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, "x-forwarded-host": "preview.example.test" },
      body: JSON.stringify({ plan: "sceneforge", interval: "yearly" }),
    });
    h.eq(refused.status, 503, "production refuses to open a Sandbox checkout even with credentials configured");
    process.env.NODE_ENV = "development";
    process.env.PUBLIC_APP_URL = FULL.PUBLIC_APP_URL;
  }

  /* ---- 6. The browser asks the runtime; it does not guess from the bundle - */
  {
    const publicPage = readFileSync(`${root}/src/marketing/PublicPage.tsx`, "utf8");
    const accountModal = readFileSync(`${root}/src/components/AccountMembershipModal.tsx`, "utf8");
    const dialog = readFileSync(`${root}/src/components/PayPalSubscriptionDialog.tsx`, "utf8");
    const sdk = readFileSync(`${root}/src/lib/paypal-sdk.ts`, "utf8");
    const serverSource = readFileSync(`${root}/server.ts`, "utf8");

    h.eq(/import\.meta\.env\.DEV/.test(publicPage), false, "the pricing page no longer gates paid checkout on a build-time flag that is false in every served bundle");
    h.eq(/import\.meta\.env\.DEV/.test(accountModal), false, "the account modal no longer gates paid checkout on a build-time flag");
    h.ok(publicPage.includes("config?.configured"), "the pricing page enables its buttons from the server's public billing configuration");
    h.ok(accountModal.includes("billingConfig?.configured"), "the account modal enables its buttons from the server's public billing configuration");
    h.ok(publicPage.includes("checkoutBlockedReason"), "a disabled subscribe button says why, instead of looking broken");
    h.ok(dialog.includes("createPortal("), "the checkout dialog renders into document.body, clear of the account modal's backdrop-filter containing block");
    h.ok(dialog.includes("Try again"), "a failed checkout can be retried without reloading the page");
    h.ok(dialog.includes("missing"), "the checkout dialog shows which variable is missing");
    h.ok(/account && !config/.test(publicPage) || publicPage.includes("!account || !config"), "the sign-in return waits for the server's answer before reopening a checkout");
    h.ok(/sdkPromise = null/.test(sdk), "a failed PayPal SDK load is not cached, so a retry really reloads it");
    h.ok(serverSource.includes("same-origin-allow-popups"), "the approval popup keeps its opener relationship");
    h.eq(/req\.path === "\/pricing"/.test(serverSource), false, "the popup opener policy is not limited to two hard-coded paths");
  }

  h.done("PayPal Sandbox checkout gate");
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
