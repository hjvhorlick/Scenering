import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import express from "express";
import { createHarness } from "./harness";

const h = createHarness();
process.chdir(mkdtempSync(`${tmpdir()}/scenering-paypal-`));
Object.assign(process.env, {
  NODE_ENV: "test",
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
});

const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const { db } = await import("../src/db.ts");
const paypalApi = await import("../server/paypal-api.ts");
const platform = await import("../server/platform.ts");

const calls: Array<{ url: string; method: string; headers: Headers; body: any }> = [];
const subscriptionFixtures = new Map<string, any>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://api-m.sandbox.paypal.com/")) return realFetch(input, init);
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string" && headers.get("content-type")?.includes("application/json") ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method: init?.method || "GET", headers, body });
  if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-access-token", expires_in: 300 });
  if (url.endsWith("/v1/billing/subscriptions")) return Response.json({
    id: "I-SANDBOX-SUB-123456",
    custom_id: body.custom_id,
    plan_id: body.plan_id,
    status: "APPROVAL_PENDING",
    create_time: "2026-10-28T10:00:00Z",
    links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=I-SANDBOX-SUB-123456" }],
  }, { status: 201 });
  if (url.endsWith("/v1/notifications/verify-webhook-signature")) return Response.json({ verification_status: "SUCCESS" });
  const subscriptionMatch = url.match(/\/v1\/billing\/subscriptions\/([^/]+)$/);
  if (subscriptionMatch) return Response.json(subscriptionFixtures.get(decodeURIComponent(subscriptionMatch[1])) || { id: decodeURIComponent(subscriptionMatch[1]), status: "ACTIVE" });
  return Response.json({}, { status: 404 });
}) as typeof fetch;

const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

try {
  {
    const response = await fetch(`${base}/api/billing/public-config`);
    const config = await response.json() as any;
    h.eq(response.status, 200, "PayPal Sandbox public config is readable");
    h.eq(config.provider, "paypal", "PayPal config identifies the sole subscription provider");
    h.eq(config.environment, "sandbox", "public config is pinned to Sandbox");
    h.eq(config.configured, true, "complete test Sandbox configuration enables the development checkout");
    h.eq(config.tiers.find((tier: any) => tier.id === "sceneflow")?.planId.monthly, "P-SF-MONTHLY-TEST", "public tiers include the monthly PayPal plan identifier");
    h.eq(JSON.stringify(config).includes("sandbox-client-secret-test-only"), false, "the PayPal Client Secret is never returned to the browser");
    const savedSingleTest = {
      flag: process.env.PAYPAL_PREVIEW_SINGLE_PLAN_MODE,
      secret: process.env.PAYPAL_WEBHOOK_ID,
      yearly: process.env.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID,
      forgeMonthly: process.env.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID,
      forgeYearly: process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID,
    };
    process.env.PAYPAL_PREVIEW_SINGLE_PLAN_MODE = "true";
    delete process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID;
    delete process.env.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID;
    delete process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID;
    const singlePlanConfig = paypalApi.paypalPublicConfig();
    h.eq(singlePlanConfig.configured, true, "explicit Preview mode permits a single Sandbox plan for checkout");
    h.eq(singlePlanConfig.previewTestPlan?.plan, "sceneflow", "single-plan Preview identifies the only enabled tier");
    h.eq(singlePlanConfig.previewTestPlan?.interval, "monthly", "single-plan Preview identifies the only enabled billing interval");
    h.eq(platform.paypalBillingConfiguration().ready, false, "full billing readiness remains false until a webhook is configured");
    h.eq(platform.paypalBillingConfiguration().checkoutReady, true, "single-plan Preview can test initial checkout before webhook registration");
    h.eq(paypalApi.paypalPlanId("sceneforge", "monthly"), "", "single-plan Preview does not reuse its plan ID for another tier");
    process.env.PAYPAL_PREVIEW_SINGLE_PLAN_MODE = savedSingleTest.flag || "";
    if (savedSingleTest.secret) process.env.PAYPAL_WEBHOOK_ID = savedSingleTest.secret;
    else delete process.env.PAYPAL_WEBHOOK_ID;
    if (savedSingleTest.yearly) process.env.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID = savedSingleTest.yearly;
    else delete process.env.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID;
    if (savedSingleTest.forgeMonthly) process.env.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID = savedSingleTest.forgeMonthly;
    else delete process.env.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID;
    if (savedSingleTest.forgeYearly) process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID = savedSingleTest.forgeYearly;
    else delete process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID;
    const priorMode = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    h.eq(platform.paypalBillingConfiguration().ready, false, "production runtime can never mark PayPal Sandbox checkout ready");
    h.eq(platform.paypalBillingConfiguration().checkoutReady, false, "production runtime cannot use the single-plan Preview checkout exception");
    h.eq(paypalApi.paypalPublicConfig().configured, false, "production never exposes Sandbox checkout as configured");
    const productionWebhook = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "evt-production", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" }) });
    h.eq(productionWebhook.status, 503, "production rejects PayPal Sandbox webhook processing");
    process.env.NODE_ENV = priorMode;
  }
  {
    const response = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    h.eq(response.status, 401, "PayPal subscription creation requires an authenticated Scenering session");
  }
  {
    const response = await fetch(`${base}/api/webhooks/paypal`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "evt-invalid", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" }),
    });
    h.eq(response.status, 401, "webhooks without PayPal transmission signature headers are rejected");
  }
  {
    paypalApi.resetPayPalTokenCacheForTests();
    calls.length = 0;
    const token = "random-intent-token-never-a-user-id";
    const created = await paypalApi.createPayPalSubscription({
      planId: "P-SF-MONTHLY-TEST", userId: "user-id-only-for-local-association", email: "member@example.test", intentToken: token,
      returnUrl: "https://scenering-sandbox.test/welcome?payment=paypal",
      cancelUrl: "https://scenering-sandbox.test/pricing?checkout=cancelled",
    });
    h.eq(created.id, "I-SANDBOX-SUB-123456", "the server creates a Sandbox subscription through PayPal's REST API");
    const creation = calls.find((call) => call.url.endsWith("/v1/billing/subscriptions"));
    h.eq(new URL(creation!.url).host, "api-m.sandbox.paypal.com", "all REST subscription requests use PayPal Sandbox host");
    h.eq(creation!.body.plan_id, "P-SF-MONTHLY-TEST", "server-provided plan ID is sent to PayPal");
    h.eq(creation!.body.custom_id, token, "a random single-use checkout token associates the subscription without exposing the user ID");
    h.eq(creation!.body.subscriber.email_address, "member@example.test", "subscriber email comes from the authenticated server-side account");
    h.eq(JSON.stringify(creation!.body).includes("user-id-only-for-local-association"), false, "internal Scenering user IDs are not passed to PayPal");
  }
  {
    paypalApi.resetPayPalTokenCacheForTests();
    const verified = await paypalApi.verifyPayPalWebhook({
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api-m.sandbox.paypal.com/certs/test",
      "paypal-transmission-id": "transmission-test-id",
      "paypal-transmission-sig": "test-signature",
      "paypal-transmission-time": "2026-10-28T10:00:00Z",
    }, { id: "evt-verified", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" });
    h.eq(verified, true, "PayPal signatures are delegated to PayPal's verification API with the configured Sandbox Webhook ID");
    const verification = calls.find((call) => call.url.endsWith("/v1/notifications/verify-webhook-signature"));
    h.eq(verification?.body.webhook_id, "sandbox-webhook-id-test-only", "signature verification uses the server-configured webhook ID");
  }
  {
    process.env.PAYPAL_ENVIRONMENT = "live";
    let rejected = false;
    try {
      await paypalApi.createPayPalSubscription({ planId: "P-ANY", userId: "u", email: "member@example.test", intentToken: "token", returnUrl: "https://example.test/return", cancelUrl: "https://example.test/cancel" });
    } catch (error) { rejected = error instanceof paypalApi.PayPalApiError && error.code === "PAYPAL_LIVE_DISABLED"; }
    h.eq(rejected, true, "attempts to switch the PayPal API client to Live mode are rejected");
    process.env.PAYPAL_ENVIRONMENT = "sandbox";
  }
  {
    const webhookUser = await db.createUser({
      id: "paypal-webhook-user", email: "paypal-member@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "PayPal Member", role: "user", isVerified: true,
    });
    await db.createMembership(webhookUser.id, "free");
    const intentToken = "paypal-webhook-intent-token";
    const intentHash = createHmac("sha256", process.env.SESSION_SECRET!).update(intentToken).digest("hex");
    const subscriptionId = "I-WEBHOOK-SUB-123456";
    const intent = await db.createPayPalCheckoutIntent({
      id: "ppi-webhook-test", userId: webhookUser.id, intentHash, planId: "sceneflow", billingInterval: "monthly",
      paypalPlanId: "P-SF-MONTHLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(intent.id, subscriptionId);
    await db.createSubscription({
      id: "sub-webhook-test", userId: webhookUser.id, provider: "paypal", providerCustomerId: null,
      providerSubscriptionId: subscriptionId, providerProductId: "P-SF-MONTHLY-TEST", providerPriceId: "P-SF-MONTHLY-TEST",
      planId: "sceneflow", billingInterval: "monthly", status: "pending", currentPeriodStart: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
      customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null,
      renewalPrice: "19 USD", providerEventOccurredAt: null,
    });
    subscriptionFixtures.set(subscriptionId, {
      id: subscriptionId, plan_id: "P-SF-MONTHLY-TEST", custom_id: intentToken, status: "ACTIVE",
      create_time: "2026-10-28T10:00:00Z", status_update_time: "2026-10-28T10:00:00Z",
      billing_info: { next_billing_time: "2026-11-28T10:00:00Z" }, subscriber: { payer_id: "sandbox-payer" },
    });
    const event = { id: "WH-SANDBOX-ACTIVATION-1", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", create_time: "2026-10-28T10:00:01Z", resource: { id: subscriptionId, custom_id: intentToken } };
    const signedHeaders = {
      "Content-Type": "application/json", "PayPal-Auth-Algo": "SHA256withRSA", "PayPal-Cert-Url": "https://api-m.sandbox.paypal.com/certs/test",
      "PayPal-Transmission-Id": "transmission-activation", "PayPal-Transmission-Sig": "test-signature", "PayPal-Transmission-Time": "2026-10-28T10:00:01Z",
    };
    const activated = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: signedHeaders, body: JSON.stringify(event) });
    h.eq(activated.status, 200, "verified PayPal activation webhook is acknowledged");
    h.eq((await activated.json() as any).status, "processed", "activation event is applied only after PayPal REST state verification");
    h.eq((await db.findMembershipByUserId(webhookUser.id))?.plan, "sceneflow", "a verified Sandbox activation updates the server-side membership");
    const duplicate = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: signedHeaders, body: JSON.stringify(event) });
    h.eq((await duplicate.json() as any).status, "duplicate", "replayed PayPal event ID is idempotently ignored");
    h.eq((await db.findMembershipByUserId(webhookUser.id))?.plan, "sceneflow", "duplicate delivery does not repeat entitlement transitions");

    const mismatchedId = "I-WEBHOOK-PLAN-MISMATCH";
    const mismatchIntent = await db.createPayPalCheckoutIntent({
      id: "ppi-webhook-mismatch", userId: webhookUser.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("mismatch-token").digest("hex"),
      planId: "sceneforge", billingInterval: "yearly", paypalPlanId: "P-SG-YEARLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(mismatchIntent.id, mismatchedId);
    subscriptionFixtures.set(mismatchedId, { id: mismatchedId, plan_id: "P-SF-MONTHLY-TEST", custom_id: "mismatch-token", status: "ACTIVE" });
    const mismatchEvent = { ...event, id: "WH-SANDBOX-PLAN-MISMATCH", resource: { id: mismatchedId, custom_id: "mismatch-token" } };
    const mismatch = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: signedHeaders, body: JSON.stringify(mismatchEvent) });
    h.eq((await mismatch.json() as any).status, "rejected", "subscription plan mismatches are rejected by the verified webhook handler");
    h.eq((await db.findMembershipByUserId(webhookUser.id))?.plan, "sceneflow", "a mismatched PayPal plan cannot grant a different Scenering entitlement");
  }
  {
    const event = { providerEventId: "paypal:evt-idempotency-test", eventName: "BILLING.SUBSCRIPTION.ACTIVATED", status: "processing", payload: { provider: "paypal" } };
    h.eq(await db.claimWebhookEvent(event), true, "the first PayPal event atomically claims its D1 event ID");
    h.eq(await db.claimWebhookEvent(event), false, "a concurrent/replayed PayPal event cannot claim the same D1 event ID twice");
    h.eq((await db.findWebhookEventByProviderId(event.providerEventId))?.status, "processing", "the in-progress claim is visible before applying entitlements");
    await db.updateWebhookEventStatus(event.providerEventId, "retryable_error", { provider: "paypal" });
    h.eq(await db.claimRetryableWebhookEvent(event.providerEventId), true, "a transiently failed PayPal event may be claimed once on retry");
    h.eq(await db.claimRetryableWebhookEvent(event.providerEventId), false, "two retries cannot concurrently reclaim the same transient event");
    await db.updateWebhookEventStatus(event.providerEventId, "processed");
    h.eq((await db.findWebhookEventByProviderId(event.providerEventId))?.status, "processed", "the completed event outcome remains recorded");
    const crashedId = "paypal:evt-stale-processing-test";
    await db.claimWebhookEvent({ providerEventId: crashedId, eventName: "BILLING.SUBSCRIPTION.ACTIVATED", status: "processing", payload: { provider: "paypal" } });
    testD1().sqlite.prepare("UPDATE webhook_events SET created_at = ? WHERE provider_event_id = ?").run("2026-10-28T08:00:00.000Z", crashedId);
    const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
    h.eq(await db.reclaimStaleWebhookEvent(crashedId, staleBefore), true, "a worker crash leaves a processing event reclaimable after the stale window");
    h.eq(await db.reclaimStaleWebhookEvent(crashedId, staleBefore), false, "stale recovery itself remains an atomic single claim");
    h.ok(Boolean(testD1().sqlite), "the idempotency checks use the real SQLite-backed D1 test shim");
  }
  h.done("PayPal Sandbox billing");
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
