/**
 * Paddle billing: the live path, exercised end to end.
 *
 * Everything here runs against a real Express app and a real SQLite database
 * created from the real migrations, so the assertions are about behaviour
 * rather than source text. The only thing faked is Paddle itself: `fetch` is
 * intercepted for `*.paddle.com` and answers the way the Paddle API does,
 * which means the transaction the server creates and the subscription it reads
 * back are both inspected, not assumed.
 *
 * The point is that switching billing on should be filling in `.env` and
 * nothing else — so this suite checks the parts that have no second chance:
 * signature verification, replay, which events are acted on, which plan a
 * purchase maps to, how a payment is matched back to an account, and whether
 * access survives a cancellation that is still inside the period the customer
 * paid for.
 */
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
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
const paddleDoc = readFileSync(join(repoRoot, "PADDLE.md"), "utf8");
const modal = readFileSync(join(repoRoot, "src/components/AccountMembershipModal.tsx"), "utf8");
const serverSource = readFileSync(join(repoRoot, "server.ts"), "utf8");

const WEBHOOK_SECRET = "pdlwhsec_test_webhook_secret_key";
const API_KEY = "pdlv1_test_api_key";
process.chdir(mkdtempSync(join(tmpdir(), "scenering-billing-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.PADDLE_ENVIRONMENT = "sandbox";
process.env.PADDLE_API_KEY = API_KEY;
process.env.PADDLE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID = "pri_flow_month";
process.env.PADDLE_SCENEFLOW_YEARLY_PRICE_ID = "pri_flow_year";
process.env.PADDLE_SCENEFORGE_MONTHLY_PRICE_ID = "pri_forge_month";
process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID = "pri_forge_year";
process.env.PADDLE_SCENEFLOW_MONTHLY_CHECKOUT_URL = "https://sandbox.checkout.build/sceneflow-monthly";
process.env.PADDLE_SCENEFLOW_YEARLY_CHECKOUT_URL = "https://sandbox.checkout.build/sceneflow-yearly";
process.env.PADDLE_SCENEFORGE_MONTHLY_CHECKOUT_URL = "https://sandbox.checkout.build/sceneforge-monthly";
process.env.PADDLE_SCENEFORGE_YEARLY_CHECKOUT_URL = "https://sandbox.checkout.build/sceneforge-yearly";
process.env.PADDLE_CLIENT_TOKEN = "test_client_token_for_the_pricing_page";
process.env.PADDLE_CLIENT_ENVIRONMENT = "sandbox";

/* Paddle's API, faked. Only requests to a Paddle host are intercepted — the
   suite talks to its own Express server over the same global `fetch`, and that
   must keep working untouched. Every call is recorded so the assertions can be
   about what was sent, not just about what came back. */
const realFetch = globalThis.fetch;
const paddleCalls: Array<{ url: string; method: string; body: any }> = [];
let paddleApiFails = false;
/* Controls for Paddle's published source-range endpoint. The allowlist fetches
   this rather than hard-coding ranges, so the tests have to be able to make it
   both answer and fail. */
let paddleIpsFails = false;
const PADDLE_SOURCE_CIDRS = ["34.195.190.139/32", "52.30.114.63/32", "44.227.213.206/32"];
/* The address the webhook sees. Cloudflare sets cf-connecting-ip, and the app
   reads that header first, so this is what the allowlist judges. */
let webhookClientIp: string | null = null;
let paddleOmitsCheckoutUrl = false;
const MANAGEMENT_URLS = {
  cancel: "https://billing.paddle.com/cancel/sub_9001",
  update_payment_method: "https://billing.paddle.com/card/sub_9001",
};
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === "string" ? input : input?.url ?? "");
  if (!/https:\/\/(sandbox-)?api\.paddle\.com\//.test(url)) return realFetch(input, init);
  const method = String(init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  paddleCalls.push({ url, method, body });
  const respond = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  if (url.endsWith("/ips")) {
    if (paddleIpsFails) return respond(500, { error: { code: "internal_error", detail: "unavailable", errors: [] } });
    return respond(200, { data: { ipv4_cidrs: PADDLE_SOURCE_CIDRS, ipv6_cidrs: [] }, meta: {} });
  }
  if (paddleApiFails) return respond(403, { error: { code: "forbidden", detail: "API key does not have permission", errors: [] } });
  if (method === "POST" && url.endsWith("/transactions")) {
    const approved = body?.checkout?.url;
    return respond(201, {
      data: {
        id: "txn_01hzy3test",
        status: "ready",
        custom_data: body?.custom_data ?? null,
        // Paddle returns the approved checkout URL with the transaction bound
        // to it. No approved URL, no link to send the customer to.
        checkout: { url: approved && !paddleOmitsCheckoutUrl ? `${approved}?_ptxn=txn_01hzy3test` : null },
      },
      meta: {},
    });
  }
  if (method === "GET" && url.includes("/subscriptions/")) {
    return respond(200, { data: { id: url.split("/subscriptions/")[1], status: "active", management_urls: MANAGEMENT_URLS }, meta: {} });
  }
  return respond(404, { error: { code: "not_found", detail: "Unexpected test call", errors: [] } });
}) as typeof fetch;

const express = (await import("express")).default;
/* The platform runs on Cloudflare bindings (D1/KV/R2) rather than JSON files.
   Install the in-memory Node shims — real SQLite running the real migrations —
   so these behavioural tests exercise the same db.ts code the Worker does. */
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");

const app = express();
app.use((req, res, next) => (req.path === "/api/webhooks/paddle" ? next() : express.json()(req, res, next)));
platform.registerPaddleWebhook(app);
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86400000;
const CUSTOMER_ID = "ctm_01hzytestcustomer";
const SUBSCRIPTION_ID = "sub_9001";

/** A Paddle subscription webhook: the envelope Paddle actually sends, with the
 *  price nested inside `items[].price` the way a notification carries it. */
function subscriptionEvent(options: {
  eventId: string;
  eventType: string;
  userId?: string | null;
  email?: string | null;
  priceId?: string;
  subscriptionId?: string;
  status?: string;
  occurredAt?: string;
  customerId?: string | null;
  periodStartsAt?: string;
  periodEndsAt?: string;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
  scheduledChange?: { action: string; effective_at: string } | null;
}) {
  return {
    event_id: options.eventId,
    notification_id: `ntf_${options.eventId}`,
    event_type: options.eventType,
    occurred_at: options.occurredAt ?? iso(0),
    data: {
      id: options.subscriptionId || SUBSCRIPTION_ID,
      status: options.status || "active",
      customer_id: options.customerId === undefined ? CUSTOMER_ID : options.customerId,
      address_id: "add_01test",
      currency_code: "USD",
      collection_mode: "automatic",
      created_at: iso(-DAY),
      updated_at: iso(0),
      started_at: iso(-DAY),
      next_billed_at: options.nextBilledAt === undefined ? iso(30 * DAY) : options.nextBilledAt,
      ...(options.canceledAt === undefined ? {} : { canceled_at: options.canceledAt }),
      current_billing_period: { starts_at: options.periodStartsAt ?? iso(-DAY), ends_at: options.periodEndsAt ?? iso(30 * DAY) },
      billing_cycle: { interval: "month", frequency: 1 },
      ...(options.scheduledChange === undefined ? { scheduled_change: null } : { scheduled_change: options.scheduledChange }),
      items: [{
        status: "active", quantity: 1, recurring: true, created_at: iso(-DAY), updated_at: iso(0),
        price: {
          id: options.priceId ?? "pri_flow_month", product_id: "pro_01test", description: "SceneFlow monthly",
          billing_cycle: { interval: "month", frequency: 1 }, tax_mode: "account_setting",
          unit_price: { amount: "1900", currency_code: "USD" },
        },
      }],
      ...(options.userId === null && !options.email ? {} : { custom_data: { user_id: options.userId, email: options.email } }),
    },
  };
}

function customerEvent(eventId: string, eventType: string, email: string, userId?: string) {
  return {
    event_id: eventId, notification_id: `ntf_${eventId}`, event_type: eventType, occurred_at: iso(0),
    data: { id: CUSTOMER_ID, name: "Test Buyer", email, marketing_consent: false, status: "active", locale: "en", created_at: iso(-DAY), updated_at: iso(0), ...(userId ? { custom_data: { user_id: userId } } : {}) },
  };
}

/** Signs a body exactly the way Paddle does, so a delivery is accepted for the
 *  right reason rather than because verification was loosened. */
function sign(body: string, ts = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET) {
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

async function postWebhook(payload: unknown, signature?: string | null, rawBody?: string) {
  const body = rawBody ?? JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (webhookClientIp) headers["cf-connecting-ip"] = webhookClientIp;
  if (signature !== null) headers["Paddle-Signature"] = signature ?? sign(body);
  const response = await fetch(`${base}/api/webhooks/paddle`, { method: "POST", headers, body });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}

const webhookLog = (eventId: string) => {
  const row = testD1().sqlite.prepare("SELECT payload FROM webhook_events WHERE provider_event_id = ?").get(eventId) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : undefined;
};

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
/* 2. Checkout creates a tagged Paddle transaction and returns a link. */
/* ------------------------------------------------------------------ */
{
  const response = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const data = await response.json() as any;
  h.eq(response.status, 200, "checkout opens for a configured plan");
  h.eq(data.url, "https://sandbox.checkout.build/sceneflow-monthly?_ptxn=txn_01hzy3test", "Paddle's returned checkout link is handed to the browser verbatim");
  h.eq(data.provider, "paddle", "the response names the provider");
  h.eq(data.environment, "sandbox", "and the environment it was created in");

  const created = paddleCalls.find((call) => call.method === "POST" && call.url.endsWith("/transactions"));
  h.ok(Boolean(created), "the server created the transaction itself rather than building a link in the browser");
  h.eq(created?.url, "https://sandbox-api.paddle.com/transactions", "against the sandbox API base URL");
  h.eq(created?.body?.items?.[0]?.price_id, "pri_flow_month", "with the configured price id for that plan and interval");
  h.eq(created?.body?.items?.[0]?.quantity, 1, "for a single subscription");
  h.eq(created?.body?.checkout?.url, "https://sandbox.checkout.build/sceneflow-monthly", "passing the configured approved checkout URL");
  /* This is the whole security story of the integration: the account id is set
     by the server that authenticated the member, signed by Paddle, and comes
     home on every webhook — the person paying cannot change it. */
  h.eq(created?.body?.custom_data?.user_id, dbUserId, "the buyer's account id rides along in custom_data, so the webhook can match it");
  h.eq(created?.body?.custom_data?.email, email, "and so does their email, as a second way to match");

  const yearly = await fetch(`${base}/api/billing/checkout/sceneforge/yearly`, { headers: { Cookie: cookie } });
  h.eq(yearly.status, 200, "the yearly SceneForge checkout opens too");
  const yearlyCall = paddleCalls.filter((call) => call.method === "POST").pop();
  h.eq(yearlyCall?.body?.items?.[0]?.price_id, "pri_forge_year", "and uses that plan's yearly price id");
  h.eq(yearlyCall?.body?.custom_data?.interval, "yearly", "with the interval recorded in custom_data");

  const bad = await fetch(`${base}/api/billing/checkout/free/monthly`, { headers: { Cookie: cookie } });
  h.eq(bad.status, 400, "there is no checkout for the Free plan");
  const anonymous = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`);
  h.eq(anonymous.status, 401, "checkout requires a signed-in account");

  /* Paddle refuses: the customer sees that Paddle did, not a blank page. */
  paddleApiFails = true;
  const refused = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const refusedBody = await refused.json() as any;
  h.eq(refused.status, 502, "a Paddle API failure is reported as a provider error");
  h.eq(refusedBody.code, "BILLING_PROVIDER_ERROR", "with a machine-readable code");
  h.ok(String(refusedBody.detail || "").includes("permission"), "and Paddle's own reason, so the owner can act on it");
  paddleApiFails = false;

  /* No approved checkout URL means Paddle returns no link to send anyone to. */
  paddleOmitsCheckoutUrl = true;
  const noLink = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const noLinkBody = await noLink.json() as any;
  h.eq(noLink.status, 503, "a transaction with no checkout link is not handed over as though it worked");
  h.eq(noLinkBody.code, "BILLING_NOT_CONFIGURED", "and is reported as configuration, not as a Paddle fault");
  h.ok(String(noLinkBody.detail || "").includes("PADDLE_SCENEFLOW_MONTHLY_CHECKOUT_URL"), "naming the variable that has to hold an approved checkout URL");
  paddleOmitsCheckoutUrl = false;
}

/* ------------------------------------------------------------------ */
/* 3. The webhook's signature contract.                                */
/* ------------------------------------------------------------------ */
{
  /* Deliberately an event this server does not act on: the signature contract
     is what is under test here, and a valid `subscription.activated` would
     grant a plan and change the state every later section asserts about. */
  const payload = {
    event_id: "evt-sig", notification_id: "ntf_evt-sig", event_type: "product.created", occurred_at: iso(0),
    data: { id: "pro_01test", name: "SceneFlow", status: "active", created_at: iso(-DAY), updated_at: iso(0) },
  };
  const body = JSON.stringify(payload);

  const good = await postWebhook(payload);
  h.eq(good.status, 200, "a correctly signed delivery is accepted");
  h.eq(good.body.received, true, "and acknowledged");
  h.eq(good.body.status, "ignored", "without being acted on, because it is not a subscription event");
  h.eq((await account()).membership.plan_id, "free", "and a valid signature on its own grants nothing");

  const forged = await postWebhook(payload, sign(body, undefined, "the-wrong-secret"));
  h.eq(forged.status, 401, "a delivery signed with the wrong secret is rejected");

  const unsigned = await fetch(`${base}/api/webhooks/paddle`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  h.eq(unsigned.status, 401, "a delivery with no Paddle-Signature header is rejected");

  const malformed = await postWebhook(payload, "h1=deadbeef");
  h.eq(malformed.status, 401, "a signature with no timestamp is rejected");

  /* Paddle's own SDK hashes `ts:body` as a string; this server hashes the same
     bytes, so an uppercased digest — legal hex, different case — still passes
     and a body edited in transit never does. */
  /* Hex is case-insensitive as a format, and Paddle's own SDK compares with a
     plain `===` that would reject a capitalised digest. This server normalises
     both the key names and the hex, so either case verifies — leniency about
     formatting, never about the digest itself. */
  const signed = sign(body);
  const hexUpper = `${signed.split(";")[0]};h1=${signed.split("h1=")[1].toUpperCase()}`;
  h.eq((await postWebhook(payload, hexUpper)).status, 200, "the hex digest may arrive in either case");
  const keysUpper = signed.replace("ts=", "TS=").replace("h1=", "H1=");
  h.eq((await postWebhook(payload, keysUpper)).status, 200, "and the header's key names are matched case-insensitively too");
  const halfSwapped = `${signed.split(";")[0]};h2=${signed.split("h1=")[1]}`;
  h.eq((await postWebhook(payload, halfSwapped)).status, 401, "a signature under any other key name is rejected");

  /* Signed over one body, delivered with another. The edit is trivial — a
     different event id — because the point is that the bytes are what get
     hashed, not that the edit is interesting. */
  const tamperedBody = body.replace('"evt-sig"', '"evt-tampered"');
  h.ok(tamperedBody !== body, "the tampered body really is different");
  const tampered = await postWebhook(payload, sign(body), tamperedBody);
  h.eq(tampered.status, 401, "a body edited after signing is rejected, because the raw bytes are what get hashed");

  const stale = await postWebhook(payload, sign(body, Math.floor(Date.now() / 1000) - 3600));
  h.eq(stale.status, 401, "a delivery signed an hour ago is rejected as a replay");
  const future = await postWebhook(payload, sign(body, Math.floor(Date.now() / 1000) + 3600));
  h.eq(future.status, 401, "and so is one signed an hour from now");

  const notJson = await postWebhook(null, sign("this is not json", undefined, WEBHOOK_SECRET), "this is not json");
  h.eq(notJson.status, 400, "a signed delivery that is not JSON is refused as unparseable, not trusted");

  const shapeless = await postWebhook({ data: {} }, sign(JSON.stringify({ data: {} })));
  h.eq(shapeless.status, 400, "a delivery with no event id or event type is refused");
}

/* ------------------------------------------------------------------ */
/* 4. What the webhook refuses to act on.                              */
/* ------------------------------------------------------------------ */
{
  /* Paddle sends a transaction event for every payment. Acting on it would
     mean storing a `txn_…` id where a `sub_…` id belongs, so it is recorded
     and ignored: `subscription.activated` follows within seconds. */
  const transaction = await postWebhook({
    event_id: "evt-txn", notification_id: "ntf_evt-txn", event_type: "transaction.completed", occurred_at: iso(0),
    data: { id: "txn_01hzy", status: "completed", customer_id: CUSTOMER_ID, custom_data: { user_id: dbUserId, email }, items: [{ price_id: "pri_flow_month", quantity: 1 }], payments: [] },
  });
  h.eq(transaction.status, 200, "a transaction event is accepted");
  h.eq(transaction.body.status, "ignored", "but recorded and ignored rather than guessed at");
  h.eq((await account()).membership.plan_id, "free", "and it grants no access on its own");

  const refund = await postWebhook({
    event_id: "evt-adj", notification_id: "ntf_evt-adj", event_type: "adjustment.created", occurred_at: iso(0),
    data: { id: "adj_01", action: "refund", status: "approved", customer_id: CUSTOMER_ID, subscription_id: SUBSCRIPTION_ID, items: [] },
  });
  h.eq(refund.body.status, "ignored", "a refund adjustment is recorded too — the subscription event that follows is what changes access");

  /* A subscription event with no id has nothing to key a row on. Accepting it
     would insert a fresh row for every redelivery, so it is recorded instead. */
  const idless = subscriptionEvent({ eventId: "evt-no-id", eventType: "subscription.activated", userId: dbUserId, email }) as any;
  idless.data.id = "";
  const noId = await postWebhook(idless);
  h.eq(noId.status, 200, "a subscription event with no subscription id is accepted");
  h.eq(noId.body.status, "ignored", "but not acted on, since there is nothing to key a subscription row on");

  const stranger = await postWebhook(subscriptionEvent({ eventId: "evt-unknown-user", eventType: "subscription.activated", userId: "usr_nobody", email: "nobody@example.com", subscriptionId: "sub_other", customerId: "ctm_never_seen_before" }));
  h.eq(stranger.status, 202, "a subscription that matches no account is accepted but flagged");
  h.eq(stranger.body.status, "unmatched", "so Paddle stops retrying while the owner can see what happened");
  h.eq((await account()).membership.plan_id, "free", "and it changes nobody's access");

  const unknownPrice = await postWebhook(subscriptionEvent({ eventId: "evt-unknown-price", eventType: "subscription.activated", userId: dbUserId, email, priceId: "pri_something_else", subscriptionId: "sub_other2" }));
  h.eq(unknownPrice.status, 202, "an unrecognised price is accepted but flagged");
  h.eq(unknownPrice.body.status, "unknown_price", "an unmapped price id never silently picks a plan");
  h.eq((await account()).membership.plan_id, "free", "an unmapped price grants nothing");
}

/* ------------------------------------------------------------------ */
/* 5. Customer events map a Paddle customer to an account — nothing else.*/
/* ------------------------------------------------------------------ */
{
  const mapped = await postWebhook(customerEvent("evt-customer", "customer.created", email, dbUserId));
  h.eq(mapped.body.status, "mapped", "a customer webhook is recorded as a mapping");
  h.eq((await account()).membership.plan_id, "free", "a customer event alone grants no plan");
  const row = testD1().sqlite.prepare("SELECT user_id, email FROM billing_customers WHERE provider_customer_id = ?").get(CUSTOMER_ID) as { user_id: string; email: string } | undefined;
  h.eq(row?.user_id, dbUserId, "the Paddle customer id is stored against the right account");
  h.eq(row?.email, email, "with the email that identified it");

  const nobody = await postWebhook(customerEvent("evt-customer-nobody", "customer.created", "stranger@example.com"));
  h.eq(nobody.body.status, "unmatched", "a customer nobody signed up with is flagged, not invented");

  /* The log holds ids and statuses, never the customer's email. */
  h.eq(webhookLog("evt-customer")?.email, undefined, "the webhook log keeps no email address");
  h.eq(webhookLog("evt-customer")?.environment, "sandbox", "and labels which Paddle environment sent it");
}

/* ------------------------------------------------------------------ */
/* 6. A real purchase: access granted, links stored, replay refused.   */
/* ------------------------------------------------------------------ */
{
  const activated = await postWebhook(subscriptionEvent({ eventId: "evt-activated", eventType: "subscription.activated", userId: dbUserId, email }));
  h.eq(activated.status, 200, "the subscription webhook is accepted");
  h.eq(activated.body.status, "processed", "and processed");

  const after = await account();
  h.eq(after.membership.plan_id, "sceneflow", "the purchase granted the plan its price id maps to");
  h.eq(after.membership.source, "verified_subscription", "recorded as coming from a verified subscription");
  h.eq(after.subscription.status, "active", "the subscription is active");
  h.eq(after.subscription.billing_interval, "monthly", "on the interval the price id says");
  h.ok(Boolean(after.subscription.current_period_end), "with the period end the customer can see");
  h.eq(after.subscription.cancel_at_period_end, false, "and no cancellation pending");
  /* Paddle leaves `management_urls` off its webhooks, so they are read back
     from the API — which is what makes self-service cancelling possible. */
  h.eq(after.subscription.customer_portal_url, MANAGEMENT_URLS.cancel, "Paddle's cancel link is stored from the API, so the customer can leave without emailing");
  h.eq(after.subscription.update_payment_url, MANAGEMENT_URLS.update_payment_method, "and so is the update-card link");
  const stored = testD1().sqlite.prepare("SELECT provider, provider_price_id, provider_customer_id, renewal_price FROM subscriptions WHERE provider_subscription_id = ?").get(SUBSCRIPTION_ID) as any;
  h.eq(stored?.provider, "paddle", "the subscription row names Paddle as its provider");
  h.eq(stored?.provider_price_id, "pri_flow_month", "and keeps the price id it was matched on");
  h.eq(stored?.provider_customer_id, CUSTOMER_ID, "and the Paddle customer id, for later events that carry no custom_data");
  h.eq(stored?.renewal_price, "1900 USD", "the renewal price keeps its currency, because the number alone would not mean anything");
  const readBack = paddleCalls.find((call) => call.method === "GET" && call.url.includes(`/subscriptions/${SUBSCRIPTION_ID}`));
  h.ok(Boolean(readBack), "the management links were read back from Paddle for that subscription");

  const replay = await postWebhook(subscriptionEvent({ eventId: "evt-activated", eventType: "subscription.activated", userId: dbUserId, email }));
  h.eq(replay.body.status, "duplicate", "the same event id is never applied twice");
  h.eq(webhookLog("evt-activated")?.duplicate_count, 1, "a redelivery is marked on the original event's log entry");
  h.ok(Boolean(webhookLog("evt-activated")?.last_duplicate_at), "and timestamped");
}

/* ------------------------------------------------------------------ */
/* 7. A purchase that arrives with no custom_data still finds its owner.*/
/* ------------------------------------------------------------------ */
{
  /* Imported subscriptions and anything created in the Paddle dashboard carry
     a customer id but no custom_data. The mapping written in section 5 is what
     matches those, so a payment can never be stranded because the checkout did
     not tag it. */
  const bare = await postWebhook(subscriptionEvent({ eventId: "evt-bare", eventType: "subscription.updated", userId: null, priceId: "pri_flow_month", status: "active" }));
  h.eq(bare.body.status, "processed", "a subscription webhook with no custom_data is still processed");
  h.eq((await account()).membership.plan_id, "sceneflow", "because the Paddle customer id was mapped to the account earlier");

  const upgraded = await postWebhook(subscriptionEvent({ eventId: "evt-upgrade", eventType: "subscription.updated", userId: dbUserId, email, priceId: "pri_forge_year", status: "active" }));
  h.eq(upgraded.body.status, "processed", "an upgrade is processed");
  const forge = await account();
  h.eq(forge.membership.plan_id, "sceneforge", "switching to the yearly SceneForge price upgrades the plan");
  h.eq(forge.subscription.billing_interval, "yearly", "and the interval follows the new price");
}

/* ------------------------------------------------------------------ */
/* 8. Cancelling does not take away a period that was already paid for.*/
/* ------------------------------------------------------------------ */
{
  /* Paddle cancels at the end of the period by default: the status stays
     `active` and a scheduled change says when it stops. */
  const scheduled = await postWebhook(subscriptionEvent({
    eventId: "evt-scheduled-cancel", eventType: "subscription.updated", userId: dbUserId, email,
    priceId: "pri_forge_year", status: "active", periodEndsAt: iso(10 * DAY),
    scheduledChange: { action: "cancel", effective_at: iso(10 * DAY) },
  }));
  h.eq(scheduled.body.status, "processed", "a scheduled cancellation is processed");
  const afterSchedule = await account();
  h.eq(afterSchedule.membership.plan_id, "sceneforge", "a cancellation scheduled for the end of the period keeps the plan until then");
  h.eq(afterSchedule.subscription.cancel_at_period_end, true, "the account knows the subscription will not renew");
  h.ok(Boolean(afterSchedule.subscription.expires_at), "the end date is shown, so the customer knows when access stops");
  h.eq(afterSchedule.subscription.customer_portal_url, MANAGEMENT_URLS.cancel, "and the cancel link stays, so they can change their mind");

  const pastDue = await postWebhook(subscriptionEvent({
    eventId: "evt-past-due", eventType: "subscription.past_due", userId: dbUserId, email,
    priceId: "pri_forge_year", status: "past_due", periodEndsAt: iso(3 * DAY),
  }));
  h.eq(pastDue.body.status, "processed", "a failed payment is processed");
  h.eq((await account()).membership.plan_id, "sceneforge", "a failed payment opens a dunning retry window rather than cutting access off at once");

  /* Paddle's `paused` means no billing AND no service — unlike the provider
     this replaced, where a pause ran to the end of the paid period. A pause
     that has not started yet is still an `active` subscription carrying a
     scheduled change, which is the case above and does keep the plan. */
  const paused = await postWebhook(subscriptionEvent({
    eventId: "evt-paused", eventType: "subscription.paused", userId: dbUserId, email,
    priceId: "pri_forge_year", status: "paused", periodEndsAt: iso(5 * DAY),
  }));
  h.eq(paused.body.status, "processed", "a pause is processed");
  h.eq((await account()).membership.plan_id, "free", "and a paused subscription stops the plan, because Paddle has stopped the service");
}

/* ------------------------------------------------------------------ */
/* 9. ...but access does end, on time, even if no webhook ever says so.*/
/* ------------------------------------------------------------------ */
{
  const trialing = await postWebhook(subscriptionEvent({
    eventId: "evt-trialing", eventType: "subscription.trialing", userId: dbUserId, email,
    priceId: "pri_flow_month", status: "trialing", periodEndsAt: iso(7 * DAY),
  }));
  h.eq(trialing.body.status, "processed", "a trial is processed");
  h.eq((await account()).membership.plan_id, "sceneflow", "a trialling subscription counts as paid access while the trial runs");

  const resumed = await postWebhook(subscriptionEvent({ eventId: "evt-resume", eventType: "subscription.resumed", userId: dbUserId, email, priceId: "pri_flow_month", status: "active", periodEndsAt: iso(30 * DAY) }));
  h.eq(resumed.body.status, "processed", "resuming is processed");
  h.eq((await account()).membership.plan_id, "sceneflow", "and restores the plan the price maps to");

  const canceled = await postWebhook(subscriptionEvent({
    eventId: "evt-canceled", eventType: "subscription.canceled", userId: dbUserId, email,
    priceId: "pri_flow_month", status: "canceled", canceledAt: iso(-DAY),
    periodStartsAt: iso(-31 * DAY), periodEndsAt: iso(-DAY), nextBilledAt: null,
  }));
  h.eq(canceled.body.status, "processed", "the cancellation is processed");
  const after = await account();
  h.eq(after.membership.plan_id, "free", "a cancellation whose period has ended returns the account to Free");
  h.ok(!after.subscription, "the ended subscription is no longer presented as current");

  /* The backstop: a subscription that stops being reported on still expires on
     the date stored for it, so a webhook that never arrives cannot leave a paid
     plan switched on forever. */
  await postWebhook(subscriptionEvent({
    eventId: "evt-quiet", eventType: "subscription.updated", userId: dbUserId, email,
    priceId: "pri_forge_month", status: "past_due", subscriptionId: "sub_quiet", periodEndsAt: iso(-2 * DAY),
  }));
  const quiet = await account();
  h.eq(quiet.membership.plan_id, "free", "a past-due subscription whose period has already ended drops to Free on the stored date alone");
}

/* ------------------------------------------------------------------ */
/* 9b. A late redelivery of an older event cannot undo a newer one.    */
/* ------------------------------------------------------------------ */
{
  /* Paddle guarantees nothing about delivery order: a retry or a replay can
     land after a newer event. Applying the older one would resurrect state the
     customer has already moved past — here, an upgrade undone by a late event
     that predates it. */
  const newer = await postWebhook(subscriptionEvent({
    eventId: "evt-order-new", eventType: "subscription.updated", userId: dbUserId, email,
    priceId: "pri_forge_year", status: "active", subscriptionId: "sub_ordering", occurredAt: iso(60000),
  }));
  h.eq(newer.body.status, "processed", "the newer event is applied");
  const older = await postWebhook(subscriptionEvent({
    eventId: "evt-order-old", eventType: "subscription.updated", userId: dbUserId, email,
    priceId: "pri_flow_month", status: "active", subscriptionId: "sub_ordering", occurredAt: iso(-60000),
  }));
  h.eq(older.status, 200, "a late older event is still answered 2xx, so Paddle does not keep retrying it");
  h.eq(older.body.status, "stale", "but it is dropped rather than applied over the top of newer state");
  h.eq((await account()).membership.plan_id, "sceneforge", "and the newer state survives it");

  const sameTime = await postWebhook(subscriptionEvent({
    eventId: "evt-order-same", eventType: "subscription.updated", userId: dbUserId, email,
    priceId: "pri_forge_year", status: "active", subscriptionId: "sub_ordering", occurredAt: iso(60000),
  }));
  h.eq(sameTime.body.status, "processed", "an event with the same timestamp as the last applied one is not treated as stale");
}

/* ------------------------------------------------------------------ */
/* 10. The go-live checklist tells the owner what is missing.          */
/* ------------------------------------------------------------------ */
{
  const ready = platform.billingConfiguration();
  h.eq(ready.ready, true, "with every key present the checklist reports ready");
  h.eq(ready.provider, "paddle", "and names Paddle as the provider");
  h.eq(ready.environment, "sandbox", "and which Paddle environment it is pointed at");
  h.eq(ready.apiBaseUrl, "https://sandbox-api.paddle.com", "with the API base URL that follows from it");
  h.eq(ready.sandboxInProduction, false, "sandbox is only flagged as a problem on a production deployment");
  h.eq(ready.webhookUrl, "https://scenering.test/api/webhooks/paddle", "the exact webhook URL to paste into Paddle is given");
  h.eq(ready.requiredEvents.length, 11, "every event to subscribe to in Paddle is listed");
  h.ok(ready.requiredEvents.includes("subscription.canceled"), "the cancellation event is among them");
  h.ok(ready.requiredEvents.includes("customer.created"), "and so is the customer event that makes matching possible");
  h.eq(ready.subscriptionEvents.length, 9, "the events that actually change access are listed separately");
  h.eq(ready.plans.length, 2, "both paid plans appear in the checklist");
  h.ok(ready.plans.every((plan) => plan.intervals.length === 2), "each plan is checked monthly and yearly");
  h.ok(ready.plans.every((plan) => plan.intervals.every((i) => i.checkoutUrlSet && i.priceIdSet)), "every checkout URL and price id is reported as set");
  h.eq(ready.clientTokenSet, true, "the public pricing page's client-side token is on the checklist");
  h.eq(ready.clientEnvironmentSet, true, "and so is the client environment Paddle.js must be pointed at");

  const savedClientToken = process.env.PADDLE_CLIENT_TOKEN;
  delete process.env.PADDLE_CLIENT_TOKEN;
  const noClientToken = platform.billingConfiguration();
  h.eq(noClientToken.ready, false, "without the client token the pricing page cannot open checkout, so it is not ready");
  h.eq(noClientToken.clientTokenSet, false, "and the checklist says the client token is missing");
  process.env.PADDLE_CLIENT_TOKEN = savedClientToken;

  const savedClientEnv = process.env.PADDLE_CLIENT_ENVIRONMENT;
  process.env.PADDLE_CLIENT_ENVIRONMENT = "live";
  const wrongClientEnv = platform.billingConfiguration();
  h.eq(wrongClientEnv.ready, false, "a client environment Paddle.js does not recognise is not silently accepted");
  process.env.PADDLE_CLIENT_ENVIRONMENT = savedClientEnv;

  /* Step 1 verification: sandbox client config + environment mismatch guard */
  const pubCfgRes = await fetch(`${base}/api/billing/public-config`);
  const pubCfg = await pubCfgRes.json() as any;
  h.eq(pubCfgRes.status, 200, "public billing config responds 200 in sandbox");
  h.eq(pubCfg.environment, "sandbox", "frontend receives sandbox environment");
  h.ok(String(pubCfg.clientToken || "").startsWith("test_"), "frontend receives a test_-prefixed client token in sandbox");

  process.env.PADDLE_CLIENT_TOKEN = "live_wrong_prefix_in_sandbox";
  const mismatchTokenRes = await fetch(`${base}/api/billing/public-config`);
  const mismatchTokenBody = await mismatchTokenRes.json() as any;
  h.eq(mismatchTokenRes.status, 503, "a live_-prefixed client token in sandbox is rejected by public-config");
  h.eq(mismatchTokenBody.code, "PADDLE_ENVIRONMENT_MISMATCH", "with PADDLE_ENVIRONMENT_MISMATCH error code");
  h.eq(platform.billingConfiguration().clientTokenSet, false, "and billingConfiguration flags the mismatched token");
  process.env.PADDLE_CLIENT_TOKEN = savedClientToken;

  /* Step 4 end-to-end subscription lifecycle verification:
     (2) initial checkout -> (4a) immediate upgrade with do_not_bill ->
     (4b) scheduled cancellation at period end -> (4c) immediate cancellation */
  {
    const subLifecycleId = "sub_e2e_lifecycle";
    const ctmLifecycleId = "ctm_e2e_lifecycle";
    // Initial subscription activation (SceneFlow Monthly, pro_flow / pri_flow_month)
    const initEvt = subscriptionEvent({
      eventId: "evt-e2e-activate",
      eventType: "subscription.activated",
      userId: dbUserId,
      email,
      subscriptionId: subLifecycleId,
      customerId: ctmLifecycleId,
      priceId: "pri_flow_month",
      status: "active",
      occurredAt: iso(120000),
      periodStartsAt: iso(0),
      periodEndsAt: iso(30 * DAY),
    });
    initEvt.data.items[0].price.product_id = "pro_flow";
    initEvt.data.items[0].price.unit_price = { amount: "1900", currency_code: "USD" };
    const rInit = await postWebhook(initEvt);
    h.eq(rInit.status, 200, "e2e checkout: subscription.activated returns 200");
    h.eq(rInit.body.status, "processed", "e2e checkout: subscription.activated is processed");

    const rowInit = testD1().sqlite.prepare("SELECT status, plan_id, provider_price_id, provider_product_id, cancel_at_period_end FROM subscriptions WHERE provider_subscription_id = ?").get(subLifecycleId) as any;
    h.eq(rowInit?.status, "active", "e2e checkout: DB status is active");
    h.eq(rowInit?.plan_id, "sceneflow", "e2e checkout: DB plan_id is sceneflow");
    h.eq(rowInit?.provider_price_id, "pri_flow_month", "e2e checkout: DB provider_price_id is pri_flow_month");
    h.eq(rowInit?.provider_product_id, "pro_flow", "e2e checkout: DB provider_product_id is pro_flow");

    const entFlow = await (await fetch(`${base}/api/entitlements/premium_captions`, { headers: { Cookie: cookie } })).json() as any;
    const entSummaryFlow = await (await fetch(`${base}/api/entitlements`, { headers: { Cookie: cookie } })).json() as any;
    h.eq(entFlow.allowed, true, "e2e checkout: access helper unlocks SceneFlow features (premium_captions)");
    h.eq(entSummaryFlow.plan, "sceneflow", "e2e checkout: entitlements endpoint reports sceneflow");
    h.eq(entSummaryFlow.entitlements.limits.finalExportsPerWeek, 15, "e2e checkout: SceneFlow has 15 final exports per week");
    h.eq(entSummaryFlow.entitlements.limits.visualResearchCapacity, "expanded", "e2e checkout: SceneFlow has expanded visual research capacity");

    // 4(a) Plan upgrade applied immediately without billing (proration_billing_mode: do_not_bill)
    const upgradeEvt = subscriptionEvent({
      eventId: "evt-e2e-upgrade-do-not-bill",
      eventType: "subscription.updated",
      userId: dbUserId,
      email,
      subscriptionId: subLifecycleId,
      customerId: ctmLifecycleId,
      priceId: "pri_forge_month",
      status: "active",
      occurredAt: iso(180000),
      periodStartsAt: iso(0),
      periodEndsAt: iso(30 * DAY),
    });
    upgradeEvt.data.items[0].price.product_id = "pro_forge";
    upgradeEvt.data.items[0].price.unit_price = { amount: "3900", currency_code: "USD" };
    const rUpgrade = await postWebhook(upgradeEvt);
    h.eq(rUpgrade.status, 200, "4(a) upgrade (do_not_bill): subscription.updated returns 200");
    h.eq(rUpgrade.body.status, "processed", "4(a) upgrade (do_not_bill): subscription.updated is processed");

    const rowUpgrade = testD1().sqlite.prepare("SELECT status, plan_id, provider_price_id, provider_product_id, renewal_price FROM subscriptions WHERE provider_subscription_id = ?").get(subLifecycleId) as any;
    h.eq(rowUpgrade?.status, "active", "4(a) upgrade: DB status remains active");
    h.eq(rowUpgrade?.plan_id, "sceneforge", "4(a) upgrade: DB plan_id updated to sceneforge");
    h.eq(rowUpgrade?.provider_price_id, "pri_forge_month", "4(a) upgrade: mirrored row reflects new price pri_forge_month");
    h.eq(rowUpgrade?.provider_product_id, "pro_forge", "4(a) upgrade: mirrored row reflects new product pro_forge");
    h.eq(rowUpgrade?.renewal_price, "3900 USD", "4(a) upgrade: renewal price updated to 3900 USD with no transaction required");

    const entSummaryForge = await (await fetch(`${base}/api/entitlements`, { headers: { Cookie: cookie } })).json() as any;
    h.eq(entSummaryForge.plan, "sceneforge", "4(a) upgrade: access helper now reports sceneforge");
    h.eq(entSummaryForge.entitlements.limits.finalExportsPerWeek, null, "4(a) upgrade: access helper now unlocks unlimited weekly final exports");
    h.eq(entSummaryForge.entitlements.limits.visualResearchCapacity, "high", "4(a) upgrade: access helper now unlocks high visual research capacity");

    // 4(b) Scheduled cancellation at end of billing period (effective_from: next_billing_period)
    const schedCancelEvt = subscriptionEvent({
      eventId: "evt-e2e-sched-cancel",
      eventType: "subscription.updated",
      userId: dbUserId,
      email,
      subscriptionId: subLifecycleId,
      customerId: ctmLifecycleId,
      priceId: "pri_forge_month",
      status: "active",
      occurredAt: iso(240000),
      periodStartsAt: iso(0),
      periodEndsAt: iso(30 * DAY),
      scheduledChange: { action: "cancel", effective_at: iso(30 * DAY) },
    });
    schedCancelEvt.data.items[0].price.product_id = "pro_forge";
    const rSched = await postWebhook(schedCancelEvt);
    h.eq(rSched.status, 200, "4(b) scheduled cancel: subscription.updated returns 200");
    h.eq(rSched.body.status, "processed", "4(b) scheduled cancel: subscription.updated is processed");

    const rowSched = testD1().sqlite.prepare("SELECT status, cancel_at_period_end, expires_at FROM subscriptions WHERE provider_subscription_id = ?").get(subLifecycleId) as any;
    h.eq(rowSched?.status, "active", "4(b) scheduled cancel: DB status is STILL active (not yet canceled)");
    h.eq(rowSched?.cancel_at_period_end, 1, "4(b) scheduled cancel: cancel_at_period_end is set to 1");
    h.ok(Boolean(rowSched?.expires_at), "4(b) scheduled cancel: expires_at records the scheduled effective_at timestamp");

    const entDuringSched = await (await fetch(`${base}/api/entitlements/bulk_workflow`, { headers: { Cookie: cookie } })).json() as any;
    h.eq(entDuringSched.allowed, true, "4(b) scheduled cancel: access helper still grants paid features while period is active");

    // 4(c) Immediate cancellation (effective_from: immediately)
    const immCancelEvt = subscriptionEvent({
      eventId: "evt-e2e-imm-cancel",
      eventType: "subscription.canceled",
      userId: dbUserId,
      email,
      subscriptionId: subLifecycleId,
      customerId: ctmLifecycleId,
      priceId: "pri_forge_month",
      status: "canceled",
      occurredAt: iso(300000),
      canceledAt: iso(-1000),
      periodStartsAt: iso(-DAY),
      periodEndsAt: iso(-1000),
      nextBilledAt: null,
      scheduledChange: null,
    });
    immCancelEvt.data.items[0].price.product_id = "pro_forge";
    const rImm = await postWebhook(immCancelEvt);
    h.eq(rImm.status, 200, "4(c) immediate cancel: subscription.canceled returns 200");
    h.eq(rImm.body.status, "processed", "4(c) immediate cancel: subscription.canceled is processed");

    const entAfterImm = await (await fetch(`${base}/api/entitlements/premium_captions`, { headers: { Cookie: cookie } })).json() as any;
    const entBulkAfterImm = await (await fetch(`${base}/api/entitlements/bulk_workflow`, { headers: { Cookie: cookie } })).json() as any;
    const accAfterImm = await account();
    h.eq(accAfterImm.membership.plan_id, "free", "4(c) immediate cancel: membership plan_id is now free");
    h.eq(entAfterImm.allowed, false, "4(c) immediate cancel: access helper denies SceneFlow paid features (premium_captions)");
    h.eq(entBulkAfterImm.allowed, false, "4(c) immediate cancel: access helper denies SceneForge paid features (bulk_workflow)");

    const rowImm = testD1().sqlite.prepare("SELECT status, cancelled_at FROM subscriptions WHERE provider_subscription_id = ?").get(subLifecycleId) as any;
    h.eq(rowImm?.status, "cancelled", "4(c) immediate cancel: DB subscription status remains cancelled even after access checks");
    h.ok(Boolean(rowImm?.cancelled_at), "4(c) immediate cancel: DB cancelled_at timestamp is recorded");
  }

  const savedPrice = process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID;
  delete process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID;
  const incomplete = platform.billingConfiguration();
  h.eq(incomplete.ready, false, "one missing price id is enough to report not ready");
  h.ok(
    incomplete.plans.some((plan) => plan.intervals.some((i) => !i.priceIdSet && i.priceEnv === "PADDLE_SCENEFORGE_YEARLY_PRICE_ID")),
    "the checklist names the environment variable that is missing"
  );
  process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID = savedPrice;

  const savedKey = process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_API_KEY;
  h.eq(platform.billingConfiguration().ready, false, "without the API key the server cannot create a checkout, so it is not ready");
  const noKey = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  h.eq(noKey.status, 503, "and checkout says so instead of handing over a link that could not work");
  process.env.PADDLE_API_KEY = savedKey;

  h.eq(platform.sceneringStatusForPaddle("subscription.canceled", "canceled"), "cancelled", "Paddle's American spelling is translated once, into the one this codebase compares against");
  h.eq(platform.sceneringStatusForPaddle("subscription.trialing", "trialing"), "on_trial", "a trial maps onto the status the expiry sweep already understands");
  h.eq(platform.sceneringStatusForPaddle("subscription.updated", "something_new"), "something_new", "and a status nobody has seen is stored as-is rather than defaulted to one that grants access");
  h.eq(platform.verifyPaddleSignature(Buffer.from("{}"), "", "secret"), null, "signature verification refuses an empty header");
  h.eq(platform.paddleSignatureHeader("{}", "secret", 1000).startsWith("ts=1000;h1="), true, "the signing helper produces the header Paddle sends");
}

/* ------------------------------------------------------------------ */
/* 11. Nothing is configured: the app must stay usable.                */
/* ------------------------------------------------------------------ */
{
  const savedSecret = process.env.PADDLE_WEBHOOK_SECRET;
  delete process.env.PADDLE_WEBHOOK_SECRET;
  const webhook = await postWebhook(subscriptionEvent({ eventId: "evt-off", eventType: "subscription.activated", userId: dbUserId, email }), null);
  h.eq(webhook.status, 503, "with no webhook secret key the endpoint refuses rather than trusting the caller");
  process.env.PADDLE_WEBHOOK_SECRET = savedSecret;

  const savedPrice = process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID;
  delete process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID;
  const checkout = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const body = await checkout.json() as any;
  h.eq(checkout.status, 503, "an unconfigured plan says so instead of opening a broken page");
  h.eq(body.code, "BILLING_NOT_CONFIGURED", "the reason is machine-readable");
  h.ok(String(body.detail || "").includes("PADDLE_SCENEFLOW_MONTHLY_PRICE_ID"), "and names the variable that is missing");
  process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID = savedPrice;

  const entitlements = await fetch(`${base}/api/entitlements`, { headers: { Cookie: cookie } });
  h.eq(entitlements.status, 200, "the rest of the app keeps working with billing switched off");
  const plans = await fetch(`${base}/api/plans`);
  h.eq(plans.status, 200, "and the public pricing page still gets its plans");
}

/* ------------------------------------------------------------------ */
/* 12. Wiring and documentation that make the switch-on a paste job.   */
/* ------------------------------------------------------------------ */
{
  h.ok(serverSource.includes("registerPaddleWebhook(app)"), "the webhook is mounted by the server");
  h.ok(
    /req\.path === "\/api\/webhooks\/paddle"/.test(serverSource),
    "the webhook is exempt from the same-origin guard, since Paddle is a third party"
  );
  h.ok(
    serverSource.includes("form-action 'self' https://*.paddle.com https://*.checkout.build"),
    "the content security policy lets a checkout reach Paddle"
  );
  h.ok(
    platformSource.includes('express.raw({ type: "application/json", limit: "2mb" })'),
    "the webhook body stays raw, or the signature could never be verified"
  );
  h.ok(platformSource.includes("timingSafeEqual"), "signatures are compared in constant time");
  h.ok(platformSource.includes(".update(rawBody)"), "and hashed as the bytes that arrived, never as a re-serialised object");
  h.ok(
    platformSource.includes("webhookEventExists(eventId)") && readFileSync(join(repoRoot, "migrations", "0001_init.sql"), "utf8").includes("provider_event_id TEXT UNIQUE NOT NULL"),
    "event ids are checked for replay"
  );
  const schema = String((testD1().sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'subscriptions'").get() as any)?.sql || "");
  h.ok(schema.includes("provider_price_id"), "the live schema stores a Paddle price id");
  h.ok(!schema.includes("provider_variant_id"), "and the Lemon Squeezy variant column is gone, not merely unused");
  h.ok(schema.includes("DEFAULT 'paddle'"), "with the provider defaulting to paddle");
  h.ok(
    Boolean(testD1().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'billing_customers'").get()),
    "and the customer mapping table the fallback matching needs exists"
  );

  for (const key of [
    "PADDLE_ENVIRONMENT", "PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET",
    "PADDLE_SCENEFLOW_MONTHLY_PRICE_ID", "PADDLE_SCENEFLOW_YEARLY_PRICE_ID",
    "PADDLE_SCENEFORGE_MONTHLY_PRICE_ID", "PADDLE_SCENEFORGE_YEARLY_PRICE_ID",
    "PADDLE_SCENEFLOW_MONTHLY_CHECKOUT_URL", "PADDLE_SCENEFLOW_YEARLY_CHECKOUT_URL",
    "PADDLE_SCENEFORGE_MONTHLY_CHECKOUT_URL", "PADDLE_SCENEFORGE_YEARLY_CHECKOUT_URL",
  ]) {
    h.ok(envExample.includes(`${key}=`), `.env.example lists ${key}`);
  }
  h.ok(envExample.includes("/api/webhooks/paddle"), ".env.example gives the webhook path");
  h.ok(envExample.includes("subscription.past_due"), ".env.example lists the events to subscribe to");
  h.ok(readme.includes("## Billing (Paddle)"), "the README documents the billing setup");
  h.ok(readme.includes("subscription.activated"), "the README lists the events to subscribe to in Paddle");
  h.ok(paddleDoc.includes("Paddle-Signature"), "PADDLE.md states the signature contract");
  h.ok(paddleDoc.includes("npx skills add https://developer.paddle.com/"), "PADDLE.md gives the agent skills install command");
  h.ok(paddleDoc.includes("https://sandbox-mcp.paddle.com/mcp") && paddleDoc.includes("https://mcp.paddle.com/mcp") && paddleDoc.includes("https://paddlehq.mcp.kapa.ai"), "PADDLE.md lists all three Paddle MCP servers");

  h.ok(modal.includes("Manage or cancel"), "a paying customer can reach Paddle's cancel page from the app");
  h.ok(modal.includes("Update payment card"), "and can change the card on file");
  h.ok(modal.includes('target="_blank" rel="noopener noreferrer"'), "hosted billing pages open safely");
  h.ok(modal.includes("adminData.billing.ready"), "the owner sees whether billing is ready to take payments");
  h.ok(modal.includes("adminData.billing.webhookUrl"), "the owner is shown the webhook URL to register");
  h.ok(modal.includes("sandboxInProduction"), "and is warned when a production site is still pointed at Paddle's sandbox");
  h.ok(modal.includes("Last webhooks received"), "the owner can see what Paddle has actually sent");

  /* The MCP servers an AI editor needs to reach a Paddle account. These are
     declarative configuration checked into the repo, so the next agent session
     in any of these editors gets Paddle's docs and sandbox without anyone
     remembering to add them. */
  const mcpRoot = JSON.parse(readFileSync(join(repoRoot, ".mcp.json"), "utf8"));
  const cursor = JSON.parse(readFileSync(join(repoRoot, ".cursor/mcp.json"), "utf8"));
  const vscode = JSON.parse(readFileSync(join(repoRoot, ".vscode/mcp.json"), "utf8"));
  for (const [label, config] of [[".mcp.json", mcpRoot], [".cursor/mcp.json", cursor], [".vscode/mcp.json", vscode]] as Array<[string, any]>) {
    const servers = config.mcpServers || config.servers;
    h.eq(servers["paddle-docs"]?.url ?? servers["paddle-docs"]?.serverUrl, "https://paddlehq.mcp.kapa.ai", `${label} points paddle-docs at the documentation server`);
    h.eq(servers["paddle-sandbox"]?.url ?? servers["paddle-sandbox"]?.serverUrl, "https://sandbox-mcp.paddle.com/mcp", `${label} points paddle-sandbox at the sandbox server`);
    h.eq(servers["paddle-live"]?.url ?? servers["paddle-live"]?.serverUrl, "https://mcp.paddle.com/mcp", `${label} points paddle-live at the live server`);

    /* paddle-sandbox authenticates with a sandbox API key, so it has to be given
       one — an env-var reference, never a literal. paddle-docs (browser
       sign-in) and paddle-live (OAuth) complete authentication interactively and
       must carry no header at all. */
    const sandboxAuth = servers["paddle-sandbox"]?.headers?.Authorization;
    h.ok(typeof sandboxAuth === "string" && sandboxAuth.startsWith("Bearer $"), `${label} gives paddle-sandbox a Bearer key read from the environment`);
    h.ok(servers["paddle-docs"]?.headers === undefined, `${label} leaves paddle-docs to its interactive sign-in`);
    h.ok(servers["paddle-live"]?.headers === undefined, `${label} leaves paddle-live to its OAuth flow`);
  }
  h.ok(!JSON.stringify(mcpRoot).includes("sk-") && !JSON.stringify(mcpRoot).includes(API_KEY), "no key is committed in the MCP configuration");

  /* Paddle's own agent skills, vendored rather than left to a command someone has
     to remember to run. They are instructions for agents, so the guarantee worth
     testing is that they are present, attributed and unmodified in shape. */
  const SKILLS = ["paddle-webhooks", "paddle-subscription-sync", "paddle-catalog-setup", "paddle-checkout-web", "paddle-customer-portal", "paddle-subscription-cancel", "paddle-subscription-update", "paddle-billing-history", "paddle-pricing-pages", "paddle-sandbox-testing", "paddle-usage-based-billing"];
  for (const dir of [".agents/skills", ".claude/skills"]) {
    for (const skill of SKILLS) {
      h.eq(existsSync(join(repoRoot, dir, skill, "SKILL.md")), true, `${dir}/${skill}/SKILL.md is installed`);
    }
    h.eq(existsSync(join(repoRoot, dir, "LICENSE.paddle-agent-skills")), true, `${dir} keeps the upstream Apache-2.0 licence text beside the skills`);
  }
  const webhooksSkill = readFileSync(join(repoRoot, ".agents/skills/paddle-webhooks/SKILL.md"), "utf8");
  h.eq(webhooksSkill.startsWith("---"), true, "each skill keeps its frontmatter, which is how an agent discovers it");
  h.ok(/name:\s*paddle-webhooks/.test(webhooksSkill), "and is named the way the skills CLI names its directory");
  const skillLicence = readFileSync(join(repoRoot, ".agents/skills/LICENSE.paddle-agent-skills"), "utf8");
  h.ok(skillLicence.includes("Apache License"), "the vendored skills are Apache-2.0");
  const repoLicence = readFileSync(join(repoRoot, "DEVELOPMENT_LICENSES.md"), "utf8");
  h.ok(repoLicence.includes("paddlehq/paddle-agent-skills"), "DEVELOPMENT_LICENSES.md attributes them to their source");

  /* ------------------------------------------------------------------ */
  /* 13. The source-IP allowlist: fetched, off by default, fails open.   */
  /* ------------------------------------------------------------------ */
  {
    h.eq(process.env.PADDLE_WEBHOOK_IP_ALLOWLIST === "on", false, "the allowlist is off unless the owner switches it on");
    h.eq(paddleCalls.some((call) => call.url.endsWith("/ips")), false, "so Paddle's source ranges are never fetched while it is off");

    /* The pure matcher, including the edge cases a payment path must not get
       wrong: a /32 must not match its neighbour, and a mapped IPv4 address
       arriving from Cloudflare must still match. */
    h.eq(platform.ipIsFromPaddle("34.195.190.139", PADDLE_SOURCE_CIDRS), true, "a published Paddle address matches");
    h.eq(platform.ipIsFromPaddle("34.195.190.140", PADDLE_SOURCE_CIDRS), false, "the next address along does not — a /32 is one host");
    h.eq(platform.ipIsFromPaddle("203.0.113.9", PADDLE_SOURCE_CIDRS), false, "an unrelated address does not match");
    h.eq(platform.ipIsFromPaddle("::ffff:34.195.190.139", PADDLE_SOURCE_CIDRS), true, "an IPv4-mapped address still matches");
    h.eq(platform.ipIsFromPaddle("10.0.0.0", ["0.0.0.0/0"]), true, "a /0 range covers everything, because the prefix length is honoured");
    h.eq(platform.ipIsFromPaddle("", PADDLE_SOURCE_CIDRS), false, "an absent address matches nothing");
    h.eq(platform.ipIsFromPaddle("34.195.190.139", []), false, "an empty list matches nothing");

    /* Fail open first, while no list has ever been cached: if Paddle's own
       endpoint is unreachable, a genuine delivery must not be dropped. The
       signature is still the thing that authenticates it. */
    process.env.PADDLE_WEBHOOK_IP_ALLOWLIST = "on";
    paddleIpsFails = true;
    webhookClientIp = "203.0.113.9";
    const unreachable = await postWebhook({ event_id: "evt-ips-unreachable", event_type: "product.created", occurred_at: new Date().toISOString(), data: { id: "pro_1" } });
    h.eq(unreachable.status, 200, "an unreachable /ips fails open rather than dropping the delivery");
    h.eq(unreachable.body.status, "ignored", "and the event is still handled normally");
    h.eq(paddleCalls.some((call) => call.url.endsWith("/ips")), true, "it did try to fetch Paddle's ranges from the configured environment");

    /* Now the list is available: an outside address is refused before the body
       is parsed, and an allowed one goes through unchanged. */
    paddleIpsFails = false;
    const refused = await postWebhook({ event_id: "evt-ips-refused", event_type: "product.created", occurred_at: new Date().toISOString(), data: { id: "pro_1" } });
    h.eq(refused.status, 403, "a delivery from outside Paddle's published ranges is refused");
    h.eq((testD1().sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE provider_event_id = 'evt-ips-refused'").get() as any).n, 0, "and it leaves no row: it was refused before it was treated as an event");

    webhookClientIp = "52.30.114.63";
    const allowed = await postWebhook({ event_id: "evt-ips-allowed", event_type: "product.created", occurred_at: new Date().toISOString(), data: { id: "pro_1" } });
    h.eq(allowed.status, 200, "a delivery from a published range is accepted");
    h.eq(allowed.body.status, "ignored", "and handled exactly as it would be with the allowlist off");

    /* An allowed address is not a trusted one: the signature is still checked.
       This is the assertion that matters, because it is the reason failing open
       above is safe. */
    const badSignature = await postWebhook({ event_id: "evt-ips-badsig", event_type: "product.created", occurred_at: new Date().toISOString(), data: { id: "pro_1" } }, "ts=9999999999;h1=deadbeef");
    h.eq(badSignature.status, 401, "an allowed IP with a bad signature is still rejected — the allowlist never replaces verification");

    webhookClientIp = null;
    delete process.env.PADDLE_WEBHOOK_IP_ALLOWLIST;
    h.ok(platformSource.includes("paddleSourceCidrs") && platformSource.includes("/ips"), "the ranges are fetched from Paddle, not written into the source");
    h.eq(/(34\.195\.190\.139|52\.30\.114\.63|44\.227\.213\.206)/.test(platformSource), false, "and no range is hard-coded in the handler");
    h.ok(platformSource.includes("fails open") || platformSource.includes("fail open"), "the fail-open choice is written down where it was made");
  }

  /* Secret name aliases (e.g. PADDLE_PRICE_ID_SCEENFLOW_MONTHLY / ANNUAL) resolve cleanly. */
  {
    const saved = {
      sfM: process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID,
      sfY: process.env.PADDLE_SCENEFLOW_YEARLY_PRICE_ID,
      sfgM: process.env.PADDLE_SCENEFORGE_MONTHLY_PRICE_ID,
      sfgY: process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID,
    };
    delete process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID;
    delete process.env.PADDLE_SCENEFLOW_YEARLY_PRICE_ID;
    delete process.env.PADDLE_SCENEFORGE_MONTHLY_PRICE_ID;
    delete process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID;
    process.env.PADDLE_PRICE_ID_SCEENFLOW_MONTHLY = "pri_alias_sf_m";
    process.env.PADDLE_PRICE_ID_SCEENFLOW_ANNUAL = "pri_alias_sf_y";
    process.env.PADDLE_PRICE_ID_SCEENFORGE_MONTHLY = "pri_alias_sfg_m";
    process.env.PADDLE_PRICE_ID_SCEENFORGE_ANNUAL = "pri_alias_sfg_y";
    h.eq(platform.planForPaddlePrice("pri_alias_sf_m")?.plan, "sceneflow", "alias PADDLE_PRICE_ID_SCEENFLOW_MONTHLY resolves to sceneflow monthly");
    h.eq(platform.planForPaddlePrice("pri_alias_sf_y")?.interval, "yearly", "alias PADDLE_PRICE_ID_SCEENFLOW_ANNUAL resolves to sceneflow yearly");
    h.eq(platform.planForPaddlePrice("pri_alias_sfg_m")?.plan, "sceneforge", "alias PADDLE_PRICE_ID_SCEENFORGE_MONTHLY resolves to sceneforge monthly");
    h.eq(platform.planForPaddlePrice("pri_alias_sfg_y")?.interval, "yearly", "alias PADDLE_PRICE_ID_SCEENFORGE_ANNUAL resolves to sceneforge yearly");
    delete process.env.PADDLE_PRICE_ID_SCEENFLOW_MONTHLY;
    delete process.env.PADDLE_PRICE_ID_SCEENFLOW_ANNUAL;
    delete process.env.PADDLE_PRICE_ID_SCEENFORGE_MONTHLY;
    delete process.env.PADDLE_PRICE_ID_SCEENFORGE_ANNUAL;
    process.env.PADDLE_SCENEFLOW_MONTHLY_PRICE_ID = saved.sfM;
    process.env.PADDLE_SCENEFLOW_YEARLY_PRICE_ID = saved.sfY;
    process.env.PADDLE_SCENEFORGE_MONTHLY_PRICE_ID = saved.sfgM;
    process.env.PADDLE_SCENEFORGE_YEARLY_PRICE_ID = saved.sfgY;
  }

  /* Lemon Squeezy is gone, not merely unused. */
  for (const file of ["server/platform.ts", "server.ts", "src/env.ts", "src/config/plans.ts", "src/db.ts", ".env.example", ".dev.vars.example", "README.md", "scripts/setup-cloudflare.sh"]) {
    const text = readFileSync(join(repoRoot, file), "utf8");
    h.eq(/lemon/i.test(text), false, `${file} no longer mentions Lemon Squeezy`);
  }
}

server.close();
h.done("billing");
