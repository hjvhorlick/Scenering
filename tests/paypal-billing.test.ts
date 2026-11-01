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
/* Set to reproduce what the real Sandbox app does to this integration: it is
   allowed to create a subscription and refused when reading one back. */
let subscriptionReadRefused = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://api-m.sandbox.paypal.com/")) return realFetch(input, init);
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string" && headers.get("content-type")?.includes("application/json") ? JSON.parse(init.body) : init?.body;
  calls.push({ url, method: init?.method || "GET", headers, body });
  if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-access-token", expires_in: 300 });
  /* No `custom_id` here, on purpose. The real Sandbox create response is
     status, id, create_time and links — PayPal does not echo `custom_id` back
     (verified against api-m.sandbox.paypal.com on 2026-10-30). This stub used
     to echo it, which is exactly why a create path that could never succeed
     passed 38 checks. The token is still asserted on the *request* below. */
  if (url.endsWith("/v1/billing/subscriptions")) {
    /* A distinct id for every create, the way PayPal really answers. Returning
       one fixed id made a second checkout collide on
       paypal_checkout_intents.paypal_subscription_id, which is unique — the
       schema was right and the stub was wrong, and it only surfaced once a
       test performed two creates. */
    const newId = `I-SANDBOX-SUB-${String(calls.length).padStart(6, "0")}`;
    return Response.json({
      id: newId,
      plan_id: body.plan_id,
      status: "APPROVAL_PENDING",
      create_time: "2026-10-28T10:00:00Z",
      links: [{ rel: "approve", href: `https://www.sandbox.paypal.com/checkoutnow?token=${newId}` }],
    }, { status: 201 });
  }
  if (url.endsWith("/v1/notifications/verify-webhook-signature")) return Response.json({ verification_status: "SUCCESS" });
  if (url.endsWith("/cancel")) return new Response(null, { status: 204 });
  const subscriptionMatch = url.match(/\/v1\/billing\/subscriptions\/([^/]+)$/);
  if (subscriptionMatch) {
    if (subscriptionReadRefused) return Response.json({ name: "PERMISSION_DENIED", message: "You do not have permission to access or perform operations on this resource.", debug_id: "stub-debug-id" }, { status: 403 });
    return Response.json(subscriptionFixtures.get(decodeURIComponent(subscriptionMatch[1])) || { id: decodeURIComponent(subscriptionMatch[1]), status: "ACTIVE" });
  }
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
    const priorMode = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    // Sandbox on production is how the real PayPal return and webhook URLs
    // get tested, and it carries no payment risk: a Sandbox checkout can only
    // be completed by a PayPal Sandbox test account. Live is the mode that has
    // to stay impossible, and it stays impossible on every runtime.
    h.eq(platform.paypalBillingConfiguration().ready, true, "production marks PayPal Sandbox checkout ready when the Sandbox keys are set there");
    const productionWebhook = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "evt-production", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" }) });
    h.eq(productionWebhook.status === 503, false, "production no longer refuses the Sandbox webhook at the runtime gate");
    h.eq(productionWebhook.status, 401, "an unverifiable webhook signature is still rejected on production");

    process.env.PAYPAL_ENVIRONMENT = "live";
    h.eq(platform.paypalBillingConfiguration().ready, false, "Live mode can never mark checkout ready, on production or anywhere else");
    const liveWebhook = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "evt-live", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" }) });
    h.eq(liveWebhook.status, 503, "Live mode webhooks are refused on every runtime");
    process.env.PAYPAL_ENVIRONMENT = "sandbox";
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
    h.ok(String(created.id).startsWith("I-SANDBOX-SUB-"), "the server creates a Sandbox subscription through PayPal's REST API");
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

    /* PayPal does not always return `custom_id` — its create response never
       does. Verification must not depend on the field, because the intent row
       already ties this subscription id, plan and member together server-side.
       A token PayPal *does* return still has to match. */
    /* The rejected intent above is still status 'created', and the schema
       allows one 'created'/'approved' intent per member
       (idx_paypal_checkout_intents_one_create_per_user). Retire it first, or
       the next insert trips that index. */
    await db.updatePayPalCheckoutIntent("ppi-webhook-mismatch", "expired");
    const noTokenId = "I-WEBHOOK-NO-CUSTOM-ID";
    const noTokenIntent = await db.createPayPalCheckoutIntent({
      id: "ppi-webhook-no-custom-id", userId: webhookUser.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("no-custom-id-token").digest("hex"),
      planId: "sceneforge", billingInterval: "monthly", paypalPlanId: "P-SG-MONTHLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(noTokenIntent.id, noTokenId);
    subscriptionFixtures.set(noTokenId, {
      id: noTokenId, plan_id: "P-SG-MONTHLY-TEST", status: "ACTIVE",
      billing_info: { next_billing_time: "2026-11-28T10:00:00Z" }, subscriber: { payer_id: "sandbox-payer" },
    });
    const noTokenEvent = { ...event, id: "WH-SANDBOX-NO-CUSTOM-ID", resource: { id: noTokenId, custom_id: "no-custom-id-token" } };
    const noToken = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: signedHeaders, body: JSON.stringify(noTokenEvent) });
    h.eq((await noToken.json() as any).status, "processed", "a subscription PayPal returns without custom_id still verifies against the stored checkout intent");
    h.eq((await db.findMembershipByUserId(webhookUser.id))?.plan, "sceneforge", "the verified activation grants the plan that was actually sold");

    const wrongTokenId = "I-WEBHOOK-WRONG-CUSTOM-ID";
    const wrongTokenIntent = await db.createPayPalCheckoutIntent({
      id: "ppi-webhook-wrong-custom-id", userId: webhookUser.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("expected-token").digest("hex"),
      planId: "sceneflow", billingInterval: "monthly", paypalPlanId: "P-SF-MONTHLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(wrongTokenIntent.id, wrongTokenId);
    subscriptionFixtures.set(wrongTokenId, { id: wrongTokenId, plan_id: "P-SF-MONTHLY-TEST", custom_id: "somebody-elses-token", status: "ACTIVE" });
    const wrongTokenEvent = { ...event, id: "WH-SANDBOX-WRONG-CUSTOM-ID", resource: { id: wrongTokenId, custom_id: "expected-token" } };
    const wrongToken = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: signedHeaders, body: JSON.stringify(wrongTokenEvent) });
    h.eq((await wrongToken.json() as any).status, "rejected", "a custom_id PayPal does return that fails to match the checkout token is still refused");
    h.eq((await db.findMembershipByUserId(webhookUser.id))?.plan, "sceneforge", "a refused verification changes no entitlement");
  }
  {
    /* PayPal refuses to let this app read a subscription back, but the event
       that arrives is still verified server state — the route rejects any
       delivery PayPal will not vouch for. A member who really paid has to be
       activated by it rather than left waiting on a read that will never be
       answered. */
    const readDeniedUser = await db.createUser({
      id: "paypal-read-denied-user", email: "read-denied@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Read Denied Member", role: "user", isVerified: true,
    });
    await db.createMembership(readDeniedUser.id, "free");
    const readDeniedId = "I-WEBHOOK-READ-DENIED";
    const readDeniedIntent = await db.createPayPalCheckoutIntent({
      id: "ppi-webhook-read-denied", userId: readDeniedUser.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("read-denied-token").digest("hex"),
      planId: "sceneflow", billingInterval: "monthly", paypalPlanId: "P-SF-MONTHLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(readDeniedIntent.id, readDeniedId);
    const deniedHeaders = {
      "Content-Type": "application/json", "PayPal-Auth-Algo": "SHA256withRSA", "PayPal-Cert-Url": "https://api-m.sandbox.paypal.com/certs/test",
      "PayPal-Transmission-Id": "transmission-read-denied", "PayPal-Transmission-Sig": "test-signature", "PayPal-Transmission-Time": "2026-10-28T11:00:01Z",
    };
    subscriptionReadRefused = true;
    const deniedEvent = {
      id: "WH-SANDBOX-READ-DENIED", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", create_time: "2026-10-28T11:00:01Z",
      resource: { id: readDeniedId, plan_id: "P-SF-MONTHLY-TEST", status: "ACTIVE", start_time: "2026-10-28T11:00:00Z", billing_info: { next_billing_time: "2026-11-28T11:00:00Z" } },
    };
    const delivered = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: deniedHeaders, body: JSON.stringify(deniedEvent) });
    h.eq(delivered.status, 200, "a signed lifecycle event is still acknowledged when the read-back is refused");
    h.eq((await delivered.json() as any).status, "processed", "a signed activation activates the member when PayPal refuses to read the subscription back");
    h.eq((await db.findSubscriptionByProviderId(readDeniedId))?.status, "active", "the subscription is recorded as active from the signed event");
    h.eq((await db.findMembershipByUserId(readDeniedUser.id))?.plan, "sceneflow", "the member is granted the plan that was actually sold");

    /* Falling back to the signed resource must not weaken the checks on it. */
    await db.updatePayPalCheckoutIntent("ppi-webhook-read-denied", "completed");
    const mismatchedId = "I-WEBHOOK-READ-DENIED-MISMATCH";
    const mismatchedIntent = await db.createPayPalCheckoutIntent({
      id: "ppi-webhook-read-denied-mismatch", userId: readDeniedUser.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("read-denied-mismatch-token").digest("hex"),
      planId: "sceneforge", billingInterval: "yearly", paypalPlanId: "P-SG-YEARLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(mismatchedIntent.id, mismatchedId);
    const mismatchedEvent = { ...deniedEvent, id: "WH-SANDBOX-READ-DENIED-MISMATCH", resource: { ...deniedEvent.resource, id: mismatchedId, plan_id: "P-SF-MONTHLY-TEST" } };
    const mismatched = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: deniedHeaders, body: JSON.stringify(mismatchedEvent) });
    h.eq((await mismatched.json() as any).status, "rejected", "a signed event for a plan other than the one sold is still refused without the read");
    h.eq((await db.findMembershipByUserId(readDeniedUser.id))?.plan, "sceneflow", "the refused event changes no entitlement");
    subscriptionReadRefused = false;
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
  {
    /* A cancellation PayPal has accepted must not be undone by the read that
       follows it. This Sandbox app is refused GET /v1/billing/subscriptions/{id}
       while being allowed to create and cancel, and letting that refusal throw
       meant an accepted cancellation changed nothing locally: the member stayed
       blocked on a subscription PayPal had already closed, and the message
       telling them to "manage or cancel" it named the one action that could not
       work. */
    const user = await db.createUser({
      id: "paypal-cancel-user", email: "cancel-member@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Cancel Member", role: "user", isVerified: true,
    });
    await db.createMembership(user.id, "sceneflow");
    const raw = "cancel-session-token";
    const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
    testD1().sqlite
      .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("sess_cancel_test", user.id, hash, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    const cookie = `scenering_session=${encodeURIComponent(raw)}`;
    await db.createSubscription({
      id: "sub-cancel-test", userId: user.id, provider: "paypal", providerCustomerId: "PAYER-CANCEL-TEST",
      providerSubscriptionId: "I-CANCEL-TEST", providerProductId: "P-SF-MONTHLY-TEST", providerPriceId: "P-SF-MONTHLY-TEST",
      planId: "sceneflow", billingInterval: "monthly", status: "active", currentPeriodStart: "2026-10-28T10:00:00Z",
      currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
      customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null,
      renewalPrice: "19 USD", providerEventOccurredAt: null,
    });

    subscriptionReadRefused = true;
    paypalApi.resetPayPalTokenCacheForTests();
    calls.length = 0;
    const cancelled = await fetch(`${base}/api/billing/paypal/cancel-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ subscriptionId: "I-CANCEL-TEST" }),
    });
    h.eq(cancelled.status, 200, "an accepted cancellation succeeds even though PayPal refuses to read the subscription back");
    h.ok(calls.some((call) => call.url.endsWith("/v1/billing/subscriptions/I-CANCEL-TEST/cancel")), "the cancellation really was sent to PayPal");
    h.eq((await db.findSubscriptionByProviderId("I-CANCEL-TEST"))?.status, "cancelled", "the accepted cancellation is recorded rather than discarded with the failed read");
    h.eq((await db.findMembershipByUserId(user.id))?.plan, "free", "cancelling with no period left drops the member to free");

    /* Which is the whole point: the account can check out again. */
    const retried = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    h.eq(retried.status, 201, "a cancelled subscription no longer refuses the next checkout");
    subscriptionReadRefused = false;
  }
  {
    /* The buyer approved in PayPal's window; PayPal then refuses to let the
       subscription be read back, so the approval cannot be verified from here.
       Throwing turned that into a checkout failure shown to somebody who had
       just paid. The dialog already has a waiting state for exactly this and
       the server never let it be reached. */
    const user = await db.createUser({
      id: "paypal-confirm-pending-user", email: "confirm-pending@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Confirm Pending", role: "user", isVerified: true,
    });
    await db.createMembership(user.id, "free");
    const raw = "confirm-pending-session-token";
    const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
    testD1().sqlite
      .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("sess_confirm_pending", user.id, hash, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    const cookie = `scenering_session=${encodeURIComponent(raw)}`;
    const subscriptionId = "I-CONFIRM-READ-DENIED";
    const intent = await db.createPayPalCheckoutIntent({
      id: "ppi-confirm-read-denied", userId: user.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("confirm-pending-token").digest("hex"),
      planId: "sceneflow", billingInterval: "monthly", paypalPlanId: "P-SF-MONTHLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(intent.id, subscriptionId, "approved");
    await db.createSubscription({
      id: "sub-confirm-read-denied", userId: user.id, provider: "paypal", providerCustomerId: null,
      providerSubscriptionId: subscriptionId, providerProductId: "P-SF-MONTHLY-TEST", providerPriceId: "P-SF-MONTHLY-TEST",
      planId: "sceneflow", billingInterval: "monthly", status: "pending", currentPeriodStart: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
      customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null,
      renewalPrice: "19 USD", providerEventOccurredAt: null,
    });

    subscriptionReadRefused = true;
    const confirmed = await fetch(`${base}/api/billing/paypal/confirm-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ subscriptionId }),
    });
    const outcome = await confirmed.json() as any;
    h.eq(confirmed.status, 200, "an approval that cannot be read back is not reported to the buyer as a failed checkout");
    h.eq(outcome.verified, false, "the answer says plainly that nothing has been verified yet");
    h.eq(outcome.active, false, "no paid access is granted by an unverified approval");
    h.eq((await db.findMembershipByUserId(user.id))?.plan, "free", "the member stays on free until the activation really is verified");
    subscriptionReadRefused = false;
  }
  {
    /* Nothing expired a lapsed subscription. db.listExpirableSubscriptions —
       the query written for it — had no caller anywhere in the codebase, and
       the hourly cron only cleaned up voice-import audio and drained the email
       queue, so a cancelled subscription kept its member on the paid plan after
       the period they had paid for was over. */
    const lapsedUser = await db.createUser({
      id: "paypal-lapsed-user", email: "lapsed@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Lapsed Member", role: "user", isVerified: true,
    });
    await db.createMembership(lapsedUser.id, "sceneflow");
    const renewingUser = await db.createUser({
      id: "paypal-renewing-user", email: "renewing@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Renewing Member", role: "user", isVerified: true,
    });
    await db.createMembership(renewingUser.id, "sceneflow");
    const unapprovedUser = await db.createUser({
      id: "paypal-unapproved-user", email: "unapproved@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Unapproved Member", role: "user", isVerified: true,
    });
    await db.createMembership(unapprovedUser.id, "free");
    const past = new Date(Date.now() - 60 * 60_000).toISOString();
    const subBase = {
      provider: "paypal", providerCustomerId: null, providerProductId: "P-SF-MONTHLY-TEST", providerPriceId: "P-SF-MONTHLY-TEST",
      planId: "sceneflow" as const, billingInterval: "monthly" as const, cancelAtPeriodEnd: false, customerPortalUrl: null,
      updatePaymentUrl: null, cardBrand: null, cardLastFour: null, renewalPrice: "19 USD", providerEventOccurredAt: null,
    };
    await db.createSubscription({ ...subBase, id: "sub-lapsed", userId: lapsedUser.id, providerSubscriptionId: "I-LAPSED", status: "cancelled", currentPeriodStart: null, currentPeriodEnd: past, cancelledAt: past, expiresAt: past });
    await db.createSubscription({ ...subBase, id: "sub-renewing", userId: renewingUser.id, providerSubscriptionId: "I-RENEWING", status: "active", currentPeriodStart: null, currentPeriodEnd: past, cancelledAt: null, expiresAt: null });
    await db.createSubscription({ ...subBase, id: "sub-unapproved", userId: unapprovedUser.id, providerSubscriptionId: "I-UNAPPROVED", status: "pending", currentPeriodStart: null, currentPeriodEnd: null, cancelledAt: null, expiresAt: null });

    const expired = await platform.expireLapsedSubscriptions();
    h.ok(expired >= 1, "the hourly sweep finds subscriptions whose paid period has ended");
    h.eq((await db.findSubscriptionByProviderId("I-LAPSED"))?.status, "expired", "a cancelled subscription past its recorded end is expired");
    h.eq((await db.findMembershipByUserId(lapsedUser.id))?.plan, "free", "the member whose paid period ended is returned to free");
    h.eq((await db.findSubscriptionByProviderId("I-RENEWING"))?.status, "active", "an active subscription past its period end is left to renewals and payment failures");
    h.eq((await db.findMembershipByUserId(renewingUser.id))?.plan, "sceneflow", "a member whose renewal is in flight is not downgraded by the clock");
    h.eq((await db.findSubscriptionByProviderId("I-UNAPPROVED"))?.status, "pending", "a subscription with no recorded end is not expired by the clock");
  }
  {
    /* An unapproved checkout must not lock the account for the whole window.
       Nothing was approved, so there is nothing for PayPal to cancel — the
       dialog used to call the cancel route on cleanup, it could not succeed,
       and the `pending` row stayed standing, refusing every later attempt with
       no action available to the member that could clear it. */
    const user = await db.createUser({
      id: "paypal-abandon-user", email: "abandon-checkout@example.test", passwordHash: "not-used-in-this-suite",
      displayName: "Abandon Checkout", role: "user", isVerified: true,
    });
    await db.createMembership(user.id, "free");
    const raw = "abandon-checkout-session-token";
    const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
    testD1().sqlite
      .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("sess_abandon_checkout", user.id, hash, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    const cookie = `scenering_session=${encodeURIComponent(raw)}`;
    const subscriptionId = "I-ABANDON-CHECKOUT";
    const intent = await db.createPayPalCheckoutIntent({
      id: "ppi-abandon-checkout", userId: user.id, intentHash: createHmac("sha256", process.env.SESSION_SECRET!).update("abandon-checkout-token").digest("hex"),
      planId: "sceneflow", billingInterval: "monthly", paypalPlanId: "P-SF-MONTHLY-TEST", paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    await db.bindPayPalCheckoutIntent(intent.id, subscriptionId, "approved");
    await db.createSubscription({
      id: "sub-abandon-checkout", userId: user.id, provider: "paypal", providerCustomerId: null,
      providerSubscriptionId: subscriptionId, providerProductId: "P-SF-MONTHLY-TEST", providerPriceId: "P-SF-MONTHLY-TEST",
      planId: "sceneflow", billingInterval: "monthly", status: "pending", currentPeriodStart: null,
      currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
      customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null,
      renewalPrice: "19 USD", providerEventOccurredAt: null,
    });

    const blocked = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    h.eq(blocked.status, 409, "an unapproved checkout blocks a new one until it is released");

    const abandoned = await fetch(`${base}/api/billing/paypal/abandon-checkout`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ subscriptionId }),
    });
    h.eq(abandoned.status, 200, "walking away from an unapproved checkout is accepted");
    h.eq((await abandoned.json() as any).released, true, "the abandoned checkout is released");
    h.eq((await db.findSubscriptionByProviderId(subscriptionId))?.status, "expired", "the never-approved subscription is expired rather than left to block the account");

    const retried = await fetch(`${base}/api/billing/paypal/create-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ plan: "sceneflow", interval: "monthly" }),
    });
    h.eq(retried.status, 201, "the member can start a new checkout immediately after abandoning one");

    /* Releasing must not touch anything that reached a paid state. */
    const paid = await db.createSubscription({
      id: "sub-abandon-protected", userId: user.id, provider: "paypal", providerCustomerId: null,
      providerSubscriptionId: "I-ABANDON-PROTECTED", providerProductId: "P-SF-MONTHLY-TEST", providerPriceId: "P-SF-MONTHLY-TEST",
      planId: "sceneflow", billingInterval: "monthly", status: "active", currentPeriodStart: "2026-10-28T10:00:00Z",
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(), cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
      customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null,
      renewalPrice: "19 USD", providerEventOccurredAt: null,
    });
    const protectedCall = await fetch(`${base}/api/billing/paypal/abandon-checkout`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ subscriptionId: "I-ABANDON-PROTECTED" }),
    });
    h.eq((await protectedCall.json() as any).released, false, "a subscription that reached a paid state is not released by abandoning a checkout");
    h.eq((await db.findSubscriptionByProviderId("I-ABANDON-PROTECTED"))?.status, "active", "the paid subscription is untouched");
    h.ok(Boolean(paid.id), "the protected row is the one that was checked");
  }
  h.done("PayPal Sandbox billing");
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
