/**
 * Lemon Squeezy billing: the live path, exercised end to end.
 *
 * Everything here runs against a real Express app with a throwaway data
 * directory, so the assertions are about behaviour rather than source text.
 * The point is that switching billing on should be filling in `.env` and
 * nothing else — so this suite checks the parts that have no second chance:
 * signature verification, replay, which events are acted on, which plan a
 * purchase maps to, and whether access survives a cancellation that is still
 * inside the period the customer paid for.
 */
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Read the sources before moving house: the platform module fixes its data
   directory from the working directory at import time. */
const platformSource = readFileSync(join(repoRoot, "server/platform.ts"), "utf8");
const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const modal = readFileSync(join(repoRoot, "src/components/AccountMembershipModal.tsx"), "utf8");
const serverSource = readFileSync(join(repoRoot, "server.ts"), "utf8");

const WEBHOOK_SECRET = "test-webhook-signing-secret";
process.chdir(mkdtempSync(join(tmpdir(), "scenering-billing-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.LEMON_SQUEEZY_API_KEY = "lsq-test-key";
process.env.LEMON_SQUEEZY_STORE_ID = "12345";
process.env.LEMON_SQUEEZY_SCENEFLOW_MONTHLY_VARIANT_ID = "111";
process.env.LEMON_SQUEEZY_SCENEFLOW_YEARLY_VARIANT_ID = "112";
process.env.LEMON_SQUEEZY_SCENEFORGE_MONTHLY_VARIANT_ID = "221";
process.env.LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID = "222";
process.env.LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL = "https://store.lemonsqueezy.com/checkout/buy/flow-monthly";
process.env.LEMON_SQUEEZY_SCENEFLOW_YEARLY_CHECKOUT_URL = "https://store.lemonsqueezy.com/checkout/buy/flow-yearly";
process.env.LEMON_SQUEEZY_SCENEFORGE_MONTHLY_CHECKOUT_URL = "https://store.lemonsqueezy.com/checkout/buy/forge-monthly";
process.env.LEMON_SQUEEZY_SCENEFORGE_YEARLY_CHECKOUT_URL = "https://store.lemonsqueezy.com/checkout/buy/forge-yearly";

const express = (await import("express")).default;
/* The platform now runs on Cloudflare bindings (D1/KV/R2) rather than JSON
   files. Install the in-memory Node shims — real SQLite running the real
   migration — so these behavioural tests exercise the same db.ts code the
   Worker does. */
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");

const app = express();
app.use((req, res, next) => (req.path === "/api/webhooks/lemonsqueezy" ? next() : express.json()(req, res, next)));
platform.registerLemonSqueezyWebhook(app);
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86400000;

function subscriptionEvent(options: {
  eventId: string;
  eventName: string;
  userId: string;
  email: string;
  variantId?: string;
  subscriptionId?: string;
  status?: string;
  renewsAt?: string;
  endsAt?: string;
  cancelled?: boolean;
  testMode?: boolean;
}) {
  return {
    meta: { event_id: options.eventId, event_name: options.eventName, custom_data: { user_id: options.userId, email: options.email }, ...(options.testMode ? { test_mode: true } : {}) },
    data: {
      id: options.subscriptionId || "sub-9001",
      attributes: {
        user_email: options.email,
        customer_id: 5150,
        product_id: 777,
        variant_id: Number(options.variantId ?? 111),
        status: options.status || "active",
        cancelled: Boolean(options.cancelled),
        created_at: iso(-DAY),
        renews_at: options.renewsAt ?? iso(30 * DAY),
        ends_at: options.endsAt ?? null,
        card_brand: "visa",
        card_last_four: "4242",
        renewal_price: 1900,
        urls: {
          customer_portal: "https://store.lemonsqueezy.com/billing/portal/abc",
          update_payment_method: "https://store.lemonsqueezy.com/billing/card/abc",
        },
      },
    },
  };
}

async function postWebhook(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  const sign = signature ?? createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const response = await fetch(`${base}/api/webhooks/lemonsqueezy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": sign },
    body,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}

/* ------------------------------------------------------------------ */
/* 1. A verified customer, created the way a real one is.              */
/* ------------------------------------------------------------------ */
const email = "buyer@example.com";
const registration = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, displayName: "Test Buyer", password: "a-long-enough-password" }),
});
const registered = await registration.json();
h.eq(registration.status, 201, "a customer account can be registered");
const verifyToken = String(registered.developmentVerificationUrl || "").split("token=")[1] || "";
h.ok(verifyToken.length > 0, "registration issues an email verification token");
await fetch(`${base}/api/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: decodeURIComponent(verifyToken) }) });
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-enough-password" }) });
h.eq(login.status, 200, "a verified customer can sign in");
const cookie = String(login.headers.get("set-cookie") || "").split(";")[0];
const account = async () => (await fetch(`${base}/api/account`, { headers: { Cookie: cookie } })).json() as any;
const dbUserId = (testD1().sqlite.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as { id: string }).id;
h.eq((await account()).membership.plan_id, "free", "a new account starts on Free");

/* ------------------------------------------------------------------ */
/* 2. Checkout hands back a configured link, tagged with the account.  */
/* ------------------------------------------------------------------ */
{
  const response = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const data = await response.json() as any;
  h.eq(response.status, 200, "checkout opens for a configured plan");
  const url = new URL(data.url);
  h.eq(url.origin + url.pathname, "https://store.lemonsqueezy.com/checkout/buy/flow-monthly", "the configured checkout link is used verbatim");
  h.eq(url.searchParams.get("checkout[custom][user_id]"), dbUserId, "the buyer's account id rides along, so the webhook can match it");
  h.eq(url.searchParams.get("checkout[email]"), email, "the buyer's email is prefilled");

  const bad = await fetch(`${base}/api/billing/checkout/free/monthly`, { headers: { Cookie: cookie } });
  h.eq(bad.status, 400, "there is no checkout for the Free plan");
  const anonymous = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`);
  h.eq(anonymous.status, 401, "checkout requires a signed-in account");
}

/* ------------------------------------------------------------------ */
/* 3. The webhook: signature, replay, and what it refuses to act on.   */
/* ------------------------------------------------------------------ */
{
  const forged = await postWebhook(subscriptionEvent({ eventId: "evt-forged", eventName: "subscription_created", userId: dbUserId, email }), "deadbeef");
  h.eq(forged.status, 401, "a webhook with a wrong signature is rejected");
  h.eq((await account()).membership.plan_id, "free", "a forged webhook grants nothing");

  const unsigned = await fetch(`${base}/api/webhooks/lemonsqueezy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  h.eq(unsigned.status, 401, "a webhook with no signature is rejected");

  const order = await postWebhook({ meta: { event_id: "evt-order", event_name: "order_created" }, data: { id: "order-1", attributes: { user_email: email, variant_id: 111, status: "paid" } } });
  h.eq(order.status, 200, "a non-subscription event is accepted");
  h.eq(order.body.status, "ignored", "a non-subscription event is recorded and ignored, not guessed at");
  h.eq((await account()).membership.plan_id, "free", "an order event alone changes no access");

  const strange = await postWebhook(subscriptionEvent({ eventId: "evt-strange", eventName: "subscription_created", userId: dbUserId, email, variantId: "999", subscriptionId: "sub-strange" }));
  h.eq(strange.status, 202, "an unrecognised variant is accepted but flagged");
  h.eq(strange.body.status, "unknown_variant", "an unmapped variant id never silently picks a plan");
  h.eq((await account()).membership.plan_id, "free", "an unmapped variant grants nothing");

  const stranger = await postWebhook(subscriptionEvent({ eventId: "evt-unknown-user", eventName: "subscription_created", userId: "usr_nobody", email: "nobody@example.com", subscriptionId: "sub-other" }));
  h.eq(stranger.body.status, "unmatched", "a purchase with no matching account is held, not applied to someone else");
}

/* ------------------------------------------------------------------ */
/* 4. A real purchase grants the plan, once.                           */
/* ------------------------------------------------------------------ */
{
  const created = await postWebhook(subscriptionEvent({ eventId: "evt-created", eventName: "subscription_created", userId: dbUserId, email }));
  h.eq(created.status, 200, "a signed subscription_created is processed");
  h.eq(created.body.status, "processed", "the event reports that it was applied");
  const after = await account();
  h.eq(after.membership.plan_id, "sceneflow", "the monthly SceneFlow variant grants SceneFlow");
  h.eq(after.subscription.billing_interval, "monthly", "the billing interval comes from the variant mapping");
  h.eq(after.subscription.status, "active", "the subscription is active");
  h.eq(after.subscription.customer_portal_url, "https://store.lemonsqueezy.com/billing/portal/abc", "the customer portal link is kept, so the customer can cancel themselves");
  h.eq(after.subscription.update_payment_url, "https://store.lemonsqueezy.com/billing/card/abc", "the update-card link is kept too");
  h.eq(after.subscription.card_last_four, "4242", "the card's last four digits are shown back to the customer");

  const replay = await postWebhook(subscriptionEvent({ eventId: "evt-created", eventName: "subscription_created", userId: dbUserId, email }));
  h.eq(replay.body.status, "duplicate", "the same event id is never applied twice");
  {
    const dupeRow = testD1().sqlite.prepare("SELECT payload FROM webhook_events WHERE provider_event_id = 'evt-created'").get() as { payload: string } | undefined;
    const payload = dupeRow ? JSON.parse(dupeRow.payload) : {};
    h.eq(payload.duplicate_count, 1, "a redelivery is marked on the original event's log entry");
    h.ok(Boolean(payload.last_duplicate_at), "the redelivery is timestamped");
  }

  /* Test-mode purchases (card 4242… from the store dashboard) verify the
     whole loop; they are processed and labelled in the webhook log. */
  {
    const testMode = await postWebhook(subscriptionEvent({ eventId: "evt-test-mode", eventName: "subscription_created", userId: dbUserId, email, testMode: true }));
    h.eq(testMode.body.status, "processed", "a test-mode purchase is processed end to end");
    const row = testD1().sqlite.prepare("SELECT payload FROM webhook_events WHERE provider_event_id = 'evt-test-mode'").get() as { payload: string } | undefined;
    h.eq(row ? JSON.parse(row.payload).test_mode : undefined, true, "test-mode deliveries are labelled in the webhook log");
    h.eq((await account()).membership.plan_id, "sceneflow", "the test-mode purchase granted the same plan a live one would");
  }

  const upgraded = await postWebhook(subscriptionEvent({ eventId: "evt-upgrade", eventName: "subscription_updated", userId: dbUserId, email, variantId: "222" }));
  h.eq(upgraded.body.status, "processed", "an upgrade is processed");
  const forge = await account();
  h.eq(forge.membership.plan_id, "sceneforge", "switching to the yearly SceneForge variant upgrades the plan");
  h.eq(forge.subscription.billing_interval, "yearly", "and the interval follows the new variant");
}

/* ------------------------------------------------------------------ */
/* 5. Cancelling does not take away a period that was already paid for.*/
/* ------------------------------------------------------------------ */
{
  const cancelled = await postWebhook(subscriptionEvent({
    eventId: "evt-cancel", eventName: "subscription_cancelled", userId: dbUserId, email,
    variantId: "222", status: "cancelled", cancelled: true, endsAt: iso(10 * DAY),
  }));
  h.eq(cancelled.body.status, "processed", "a cancellation is processed");
  const after = await account();
  h.eq(after.membership.plan_id, "sceneforge", "a cancellation inside the paid period keeps the plan");
  h.eq(after.subscription.cancel_at_period_end, true, "the account knows the subscription will not renew");
  h.ok(Boolean(after.subscription.expires_at), "the end date is shown, so the customer knows when access stops");
  h.eq(after.subscription.customer_portal_url, "https://store.lemonsqueezy.com/billing/portal/abc", "a cancelled subscription keeps its portal link, so it can be resumed");

  const failed = await postWebhook(subscriptionEvent({
    eventId: "evt-dunning", eventName: "subscription_payment_failed", userId: dbUserId, email,
    variantId: "222", status: "past_due", renewsAt: iso(3 * DAY),
  }));
  h.eq(failed.body.status, "processed", "a failed payment is processed");
  h.eq((await account()).membership.plan_id, "sceneforge", "a failed payment opens a retry window rather than cutting access off at once");
}

/* ------------------------------------------------------------------ */
/* 6. ...but it does end, on time, even if no webhook ever says so.    */
/* ------------------------------------------------------------------ */
{
  const lapsed = await postWebhook(subscriptionEvent({
    eventId: "evt-lapsed", eventName: "subscription_cancelled", userId: dbUserId, email,
    variantId: "222", status: "cancelled", cancelled: true, renewsAt: iso(-2 * DAY), endsAt: iso(-DAY),
  }));
  h.eq(lapsed.body.status, "processed", "the lapsed cancellation is processed");
  const after = await account();
  h.eq(after.membership.plan_id, "free", "a period that has already ended returns the account to Free");
  h.ok(!after.subscription, "the expired subscription is no longer presented as current");

  const resumed = await postWebhook(subscriptionEvent({ eventId: "evt-resume", eventName: "subscription_resumed", userId: dbUserId, email, variantId: "111", status: "active" }));
  h.eq(resumed.body.status, "processed", "resuming is processed");
  h.eq((await account()).membership.plan_id, "sceneflow", "resuming restores the plan the variant maps to");
}

/* ------------------------------------------------------------------ */
/* 7. Expiry ends access immediately.                                  */
/* ------------------------------------------------------------------ */
{
  await postWebhook(subscriptionEvent({ eventId: "evt-expired", eventName: "subscription_expired", userId: dbUserId, email, variantId: "111", status: "expired", endsAt: iso(-DAY) }));
  h.eq((await account()).membership.plan_id, "free", "an expired subscription returns the account to Free");
}

/* ------------------------------------------------------------------ */
/* 8. The go-live checklist tells the owner what is missing.           */
/* ------------------------------------------------------------------ */
{
  const ready = platform.billingConfiguration();
  h.eq(ready.ready, true, "with every key present the checklist reports ready");
  h.eq(ready.webhookUrl, "https://scenering.test/api/webhooks/lemonsqueezy", "the exact webhook URL to paste into Lemon Squeezy is given");
  h.eq(ready.requiredEvents.length, 10, "every subscription event the store must send is listed");
  h.ok(ready.requiredEvents.includes("subscription_payment_failed"), "the dunning event is among them");
  h.eq(ready.plans.length, 2, "both paid plans appear in the checklist");
  h.ok(ready.plans.every((plan) => plan.intervals.length === 2), "each plan is checked monthly and yearly");
  h.ok(ready.plans.every((plan) => plan.intervals.every((i) => i.checkoutUrlSet && i.variantIdSet)), "every checkout link and variant id is reported as set");

  const savedVariant = process.env.LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID;
  delete process.env.LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID;
  const incomplete = platform.billingConfiguration();
  h.eq(incomplete.ready, false, "one missing variant id is enough to report not ready");
  h.ok(
    incomplete.plans.some((plan) => plan.intervals.some((i) => !i.variantIdSet && i.variantEnv === "LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID")),
    "the checklist names the environment variable that is missing"
  );
  process.env.LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID = savedVariant;
}

/* ------------------------------------------------------------------ */
/* 9. Nothing is configured: the app must stay usable.                 */
/* ------------------------------------------------------------------ */
{
  const savedSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const savedCheckout = process.env.LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL;
  delete process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  delete process.env.LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL;
  const webhook = await postWebhook({ meta: { event_id: "evt-off", event_name: "subscription_created" }, data: {} });
  h.eq(webhook.status, 503, "with no signing secret the webhook refuses rather than trusting the caller");
  const checkout = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const body = await checkout.json() as any;
  h.eq(checkout.status, 503, "an unconfigured plan says so instead of opening a broken page");
  h.eq(body.code, "BILLING_NOT_CONFIGURED", "the reason is machine-readable");
  const entitlements = await fetch(`${base}/api/entitlements`, { headers: { Cookie: cookie } });
  h.eq(entitlements.status, 200, "the rest of the app keeps working with billing switched off");
  process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = savedSecret;
  process.env.LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL = savedCheckout;
}

/* ------------------------------------------------------------------ */
/* 10. Wiring and documentation that make the switch-on a paste job.   */
/* ------------------------------------------------------------------ */
{
  h.ok(serverSource.includes("registerLemonSqueezyWebhook(app)"), "the webhook is mounted by the server");
  h.ok(
    /req\.path === "\/api\/webhooks\/lemonsqueezy"/.test(serverSource),
    "the webhook is exempt from the same-origin guard, since Lemon Squeezy is a third party"
  );
  h.ok(
    serverSource.includes("form-action 'self' https://*.lemonsqueezy.com"),
    "the content security policy lets a checkout form reach Lemon Squeezy"
  );
  h.ok(
    platformSource.includes('express.raw({ type: "application/json", limit: "2mb" })'),
    "the webhook body stays raw, or the signature could never be verified"
  );
  h.ok(platformSource.includes("timingSafeEqual"), "signatures are compared in constant time");
  h.ok(
    platformSource.includes("webhookEventExists(eventId)") && readFileSync(join(repoRoot, "migrations", "0001_init.sql"), "utf8").includes("provider_event_id TEXT UNIQUE NOT NULL"),
    "event ids are checked for replay"
  );

  for (const key of [
    "LEMON_SQUEEZY_WEBHOOK_SECRET", "LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_STORE_ID",
    "LEMON_SQUEEZY_SCENEFLOW_MONTHLY_VARIANT_ID", "LEMON_SQUEEZY_SCENEFLOW_YEARLY_VARIANT_ID",
    "LEMON_SQUEEZY_SCENEFORGE_MONTHLY_VARIANT_ID", "LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID",
    "LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL", "LEMON_SQUEEZY_SCENEFLOW_YEARLY_CHECKOUT_URL",
    "LEMON_SQUEEZY_SCENEFORGE_MONTHLY_CHECKOUT_URL", "LEMON_SQUEEZY_SCENEFORGE_YEARLY_CHECKOUT_URL",
  ]) {
    h.ok(envExample.includes(`${key}=`), `.env.example lists ${key}`);
  }
  h.ok(envExample.includes("/api/webhooks/lemonsqueezy"), ".env.example gives the webhook path");
  h.ok(readme.includes("## Billing (Lemon Squeezy)"), "the README documents the billing setup");
  h.ok(readme.includes("subscription_payment_recovered"), "the README lists the events to tick in the store");

  h.ok(modal.includes("Manage or cancel"), "a paying customer can reach the Lemon Squeezy portal from the app");
  h.ok(modal.includes("Update payment card"), "and can change the card on file");
  h.ok(modal.includes('target="_blank" rel="noopener noreferrer"'), "hosted billing pages open safely");
  h.ok(modal.includes("adminData.billing.ready"), "the owner sees whether billing is ready to take payments");
  h.ok(modal.includes("adminData.billing.webhookUrl"), "the owner is shown the webhook URL to register");
  h.ok(modal.includes("Last webhooks received"), "the owner can see what the store has actually sent");
}

server.close();
h.done("billing");
