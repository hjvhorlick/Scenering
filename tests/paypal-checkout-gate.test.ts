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
/** PayPal mints a new subscription id per creation; the mock must too, or a
 *  second checkout in the same suite collides on the intent's unique id. */
let created = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://api-m.sandbox.paypal.com/")) return realFetch(input, init);
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string" && headers.get("content-type")?.includes("application/json") ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method: init?.method || "GET", body });
  if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-access-token", expires_in: 300 });
  if (url.endsWith("/v1/billing/subscriptions")) {
    const id = `I-SANDBOX-SUB-GATE-${++created}`;
    /* Deliberately no `custom_id`. This stub used to echo the request's
       `custom_id` straight back, which is not what PayPal does: the real
       Sandbox response is status, id, create_time and links (verified against
       api-m.sandbox.paypal.com). Because the create path required the echoed
       token, the generous stub was the only reason a checkout that could never
       succeed looked tested. Keep this response as poor as the real one. */
    return Response.json({
      id,
      plan_id: body.plan_id,
      status: "APPROVAL_PENDING",
      create_time: "2026-10-29T10:00:00Z",
      links: [{ rel: "approve", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }],
    }, { status: 201 });
  }
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

  /* ---- 2. Production runs Sandbox checkout; Live is refused everywhere --- */
  {
    // Refusing Sandbox on production looked like a safety measure and was not
    // one: a Sandbox checkout can only ever be completed by a Sandbox test
    // account, so no visitor can be charged. What the refusal actually did was
    // remove the only host with a fixed public URL, and PayPal needs one — the
    // return URL and the webhook URL are registered in the PayPal dashboard
    // and have to name the host the browser really came from. Live is the mode
    // that must never run, and it is refused on every runtime, not just here.
    process.env.NODE_ENV = "production";
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, true, "production offers PayPal Sandbox checkout once the Sandbox keys are set there");
    h.eq(config.production, true, "the browser is told which runtime it is talking to");
    h.eq(config.sandbox, true, "and that the checkout it is offering is Sandbox");

    process.env.PAYPAL_ENVIRONMENT = "live";
    const live = await publicConfig();
    h.eq(live.checkoutEnabled, false, "Live mode is refused on production, the same as on every other runtime");
    h.eq(live.sandbox, false, "a runtime that is not pinned to Sandbox says so to the browser");
    process.env.PAYPAL_ENVIRONMENT = "sandbox";
    process.env.NODE_ENV = "development";
  }

  /* ---- 3. Whatever is missing is named, without its value ---------------- */
  {
    process.env.PAYPAL_CLIENT_ID = "";
    process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID = "";
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, false, "an incomplete Sandbox configuration disables checkout");
    h.ok(config.missing.some((item: string) => item.startsWith("PAYPAL_CLIENT_ID")), "the missing client id is named");
    h.ok(config.missing.some((item: string) => item.includes("PAYPAL_SCENEFORGE_YEARLY_PLAN_ID")), "the missing plan id is named");
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
    const checkout = (await response.json()) as any;
    h.eq(response.status, 201, "Sandbox checkout opens on a preview host without a configured PUBLIC_APP_URL");
    h.ok(String(checkout.subscriptionId).startsWith("I-SANDBOX-SUB-GATE-"), "the browser receives the PayPal subscription id to approve");
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
    h.eq(refused.status, 503, "production never invents a link origin from the request — PUBLIC_APP_URL must name the host");
    process.env.NODE_ENV = "development";
    process.env.PUBLIC_APP_URL = FULL.PUBLIC_APP_URL;
  }

  /* ---- 6. One Sandbox product is enough to test with ---------------------- */
  {
    // A Sandbox is normally brought up one product at a time. Only
    // SceneFlow monthly exists here; the other three do not.
    process.env.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID = "";
    process.env.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID = "";
    process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID = "";
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, true, "a single set-up Sandbox plan keeps checkout available");
    h.eq(config.missing.length, 0, "missing plan ids are not reported as blocking gaps");
    h.eq(config.unconfiguredPlans.length, 3, "the three plans with no Sandbox id are listed individually");
    h.ok(config.unconfiguredPlans.some((item: string) => item.startsWith("SceneForge yearly")), "each unconfigured plan is named, with its variable");
    h.eq(config.tiers.find((tier: any) => tier.id === "sceneflow")?.planId.monthly, "P-SF-MONTHLY-TEST", "the plan that exists is still offered");
    h.eq(config.tiers.find((tier: any) => tier.id === "sceneforge")?.planId.yearly, "", "the plan that does not exist is not offered");

    const signIn = async (id: string, email: string) => {
      const user = await db.createUser({
        id, email, passwordHash: "not-used-in-this-suite", displayName: "Single Product Member", role: "user", isVerified: true,
      });
      await db.createMembership(user.id, "free");
      const raw = `gate-session-${id}-${randomUUID()}`;
      const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
      testD1().sqlite
        .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(`sess_${id}`, user.id, hash, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
      return `scenering_session=${encodeURIComponent(raw)}`;
    };
    // Two accounts: one subscription at a time is already enforced, so the
    // refused plan has to be attempted by a member who has none.
    const buyer = await signIn("paypal-gate-single-user", "single-member@example.test");
    const otherBuyer = await signIn("paypal-gate-other-user", "other-member@example.test");

    paypalApi.resetPayPalTokenCacheForTests();
    const purchasable = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: buyer },
      body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    h.eq(purchasable.status, 201, "the plan that is set up in Sandbox can be bought");

    const unconfigured = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: otherBuyer },
      body: JSON.stringify({ plan: "sceneforge", interval: "yearly" }),
    });
    const refused = (await unconfigured.json()) as any;
    h.eq(unconfigured.status, 503, "a plan with no Sandbox id is refused");
    h.eq(refused.code, "PAYPAL_PLAN_NOT_CONFIGURED", "the refusal names the reason a client can act on");
    h.ok(String(refused.error).includes("PAYPAL_SCENEFORGE_YEARLY_PLAN_ID"), "the refusal names the variable to set, not a generic failure");
    h.eq(refused.missing.length, 1, "the refusal reports only the plan that was asked for");

    // Nothing at all set up: nothing can be sold, and that is blocking.
    process.env.PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID = "";
    const empty = await publicConfig();
    h.eq(empty.checkoutEnabled, false, "with no Sandbox plan at all, checkout stays closed");
    h.eq(empty.unconfiguredPlans.length, 4, "all four plan slots are reported");
    h.ok(empty.missing.some((item: string) => item.includes("PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID")), "with no plan set up, the missing plan ids are blocking gaps");
    Object.assign(process.env, {
      PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID: FULL.PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID,
      PAYPAL_SCENEFLOW_YEARLY_PLAN_ID: FULL.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID,
      PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID: FULL.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID,
      PAYPAL_SCENEFORGE_YEARLY_PLAN_ID: FULL.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID,
    });
  }

  /* ---- 7. The webhook is needed later, not for the first approval --------- */
  {
    // Approval is verified by reading the subscription back from PayPal, so a
    // checkout must work before any Sandbox webhook has been registered.
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_WEBHOOK_ID;
    const config = await publicConfig();
    h.eq(config.checkoutEnabled, true, "checkout is available before the Sandbox webhook is registered");
    h.eq(config.missing.length, 0, "an unregistered webhook is not reported as a blocking gap");
    h.eq(config.warnings.length, 1, "the unregistered webhook is reported as an outstanding warning");
    h.ok(config.warnings[0].includes("PAYPAL_WEBHOOK_ID"), "the warning names the variable that is still outstanding");

    const late = await db.createUser({
      id: "paypal-gate-no-webhook", email: "no-webhook@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "No Webhook Yet", role: "user", isVerified: true,
    });
    await db.createMembership(late.id, "free");
    const raw = `gate-session-${randomUUID()}`;
    const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
    testD1().sqlite
      .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("sess_gate_no_webhook", late.id, hash, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    paypalApi.resetPayPalTokenCacheForTests();
    const opened = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `scenering_session=${encodeURIComponent(raw)}` },
      body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    h.eq(opened.status, 201, "a checkout opens with no Sandbox webhook registered yet");

    // An unverifiable webhook delivery still fails closed — that gate is
    // independent of whether checkout is allowed.
    const webhook = await fetch(`${base}/api/webhooks/paypal`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt-no-webhook-id", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" }),
    });
    h.eq(webhook.status, 503, "webhook delivery still fails closed while the webhook id is unset");
    if (webhookId) process.env.PAYPAL_WEBHOOK_ID = webhookId;
  }

  /* ---- 8. The browser asks the runtime; it does not guess from the bundle - */
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
    h.ok(publicPage.includes("paypalPlanReady("), "the pricing page offers each Sandbox plan on its own, not all four at once");
    h.ok(accountModal.includes("paypalPlanReady("), "the account modal offers each Sandbox plan on its own");
    h.ok(/sdkPromise = null/.test(sdk), "a failed PayPal SDK load is not cached, so a retry really reloads it");
    h.ok(serverSource.includes("same-origin-allow-popups"), "the approval popup keeps its opener relationship");
    h.eq(/req\.path === "\/pricing"/.test(serverSource), false, "the popup opener policy is not limited to two hard-coded paths");
  }

  h.done("PayPal Sandbox checkout gate");
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
