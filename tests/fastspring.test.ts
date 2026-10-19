/**
 * FastSpring billing: the live path, exercised end to end.
 *
 * Everything here runs against a real Express app and a real SQLite database
 * created from the real migrations, so the assertions are about behaviour
 * rather than source text. The only thing faked is FastSpring itself: `fetch`
 * is intercepted for `api.fastspring.com` and answers the way the FastSpring
 * API does, which means the session the server creates and the account link
 * it mints are both inspected, not assumed.
 *
 * The point is that switching FastSpring on should be filling in `.env` and
 * nothing else — so this suite checks the parts that have no second chance:
 * signature verification, replay, which events are acted on, which plan a
 * purchase maps to, how a payment is matched back to an account through the
 * checkout `tags`, and whether access survives a cancellation that is still
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

const platformSource = readFileSync(join(repoRoot, "server/platform.ts"), "utf8");
const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const fastspringDoc = readFileSync(join(repoRoot, "FASTSPRING.md"), "utf8");
const modal = readFileSync(join(repoRoot, "src/components/AccountMembershipModal.tsx"), "utf8");
const serverSource = readFileSync(join(repoRoot, "server.ts"), "utf8");
const sblLoader = readFileSync(join(repoRoot, "src/lib/fastspring.ts"), "utf8");

const WEBHOOK_SECRET = "fastspring_test_webhook_secret";
const API_USERNAME = "scenering-api-user";
const API_PASSWORD = "scenering-api-password";
process.chdir(mkdtempSync(join(tmpdir(), "scenering-fastspring-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.BILLING_PROVIDER = "fastspring";
process.env.FASTSPRING_STOREFRONT = "scenering.test.onfastspring.com/popup-scenering";
process.env.FASTSPRING_WEBHOOK_SECRET = WEBHOOK_SECRET;

/* FastSpring's API, faked. Only requests to api.fastspring.com are
   intercepted — the suite talks to its own Express server over the same
   global `fetch`, and that must keep working untouched. Every call is
   recorded so the assertions can be about what was sent, not just about what
   came back. */
const realFetch = globalThis.fetch;
const fastspringCalls: Array<{ url: string; method: string; body: any }> = [];
let fastspringApiFails = false;
let sessionCounter = 0;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === "string" ? input : input?.url ?? "");
  if (!url.startsWith("https://api.fastspring.com/")) return realFetch(input, init);
  const method = String(init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  fastspringCalls.push({ url, method, body });
  const respond = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  if (fastspringApiFails) return respond(403, { message: "API credentials do not have permission" });
  if (method === "POST" && url === "https://api.fastspring.com/sessions") {
    sessionCounter += 1;
    return respond(200, { id: `sess_test_${sessionCounter}`, url: null, status: "open" });
  }
  if (method === "GET" && /\/accounts\/[^/]+\/authenticate$/.test(url)) {
    const accountId = decodeURIComponent(url.split("/accounts/")[1].split("/authenticate")[0]);
    return respond(200, { url: `https://scenering.test.onfastspring.com/account?auth=${accountId}` });
  }
  return respond(404, { message: "Unexpected test call" });
}) as typeof fetch;

const express = (await import("express")).default;
/* The platform runs on Cloudflare bindings (D1/KV/R2). Install the in-memory
   Node shims — real SQLite running the real migrations — so these behavioural
   tests exercise the same db.ts code the Worker does. */
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");

const app = express();
app.use((req, res, next) => (req.path === "/api/webhooks/fastspring" ? next() : express.json()(req, res, next)));
platform.registerFastSpringWebhook(app);
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const DAY = 86400000;
const ACCOUNT_ID = "acctAbCdEfG123XyZ456";
const SUBSCRIPTION_ID = "subSCR1pt10nAbc123456XYZ";
const ms = (offsetMs: number) => Date.now() + offsetMs;

/**
 * One FastSpring webhook event: the envelope FastSpring actually sends
 * (`events` array, each event carrying the subscription object in `data`),
 * with the tags the checkout set as the account trail.
 */
function subscriptionEvent(options: {
  eventId: string;
  type: string;
  subscriptionId?: string;
  product?: string;
  userId?: string | null;
  email?: string | null;
  accountId?: string | null;
  accountUrl?: string | null;
  accountEmail?: string | null;
  state?: string;
  changed?: number;
  begin?: number;
  next?: number | null;
  end?: number | null;
  canceledDate?: number | null;
  deactivationDate?: number | null;
  nextChargeTotalDisplay?: string | null;
  paymentMethod?: { type: string; cardBrand?: string; lastFour?: string } | null;
}) {
  const tags: Record<string, string> = {};
  if (options.userId) tags.user_id = options.userId;
  if (options.email) tags.email = options.email;
  const subscriptionId = options.subscriptionId ?? SUBSCRIPTION_ID;
  return {
    id: options.eventId,
    live: true,
    processed: false,
    type: options.type,
    created: options.changed ?? ms(0),
    data: {
      id: subscriptionId,
      quote: "QUOT1234ABC5678XYZ",
      subscription: subscriptionId,
      active: true,
      state: options.state ?? "active",
      changed: options.changed ?? ms(0),
      changedValue: options.changed ?? ms(0),
      changedInSeconds: Math.floor((options.changed ?? ms(0)) / 1000),
      live: true,
      currency: "USD",
      account:
        options.accountId === null
          ? undefined
          : {
              id: options.accountId ?? ACCOUNT_ID,
              account: options.accountId ?? ACCOUNT_ID,
              contact: { first: "Test", last: "Buyer", email: options.accountEmail ?? "buyer@example.com" },
              url: options.accountUrl === null ? undefined : (options.accountUrl ?? "https://scenering.test.onfastspring.com/account"),
            },
      product: { product: options.product ?? "sceneflow-monthly" },
      quantity: 1,
      autoRenew: true,
      price: 19,
      priceDisplay: "$19.00",
      begin: options.begin ?? ms(-DAY),
      next: options.next === undefined ? ms(30 * DAY) : options.next,
      end: options.end === undefined ? null : options.end,
      canceledDate: options.canceledDate === undefined ? null : options.canceledDate,
      deactivationDate: options.deactivationDate === undefined ? null : options.deactivationDate,
      intervalUnit: (options.product ?? "sceneflow-monthly").includes("yearly") ? "year" : "month",
      nextChargeCurrency: "USD",
      nextChargeTotalDisplay: options.nextChargeTotalDisplay === undefined ? "$19.00" : options.nextChargeTotalDisplay,
      ...(options.paymentMethod === undefined ? {} : options.paymentMethod === null ? {} : { paymentMethod: options.paymentMethod }),
      ...(options.userId === null && !options.email ? {} : { tags }),
    },
  };
}

/** Signs a body exactly the way FastSpring does — base64 HMAC-SHA256 over the
 *  raw body — so a delivery is accepted for the right reason rather than
 *  because verification was loosened. */
function sign(body: string, secret = WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("base64");
}

async function postWebhook(payload: unknown, signature?: string | null, rawBody?: string) {
  const body = rawBody ?? JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) headers["X-FS-Signature"] = signature ?? sign(body);
  const response = await fetch(`${base}/api/webhooks/fastspring`, { method: "POST", headers, body });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}

const webhookLog = (eventId: string) => {
  const row = testD1().sqlite.prepare("SELECT payload FROM webhook_events WHERE provider_event_id = ?").get(eventId) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : undefined;
};
const subscriptionRow = () =>
  testD1().sqlite.prepare("SELECT * FROM subscriptions WHERE provider = 'fastspring' ORDER BY created_at ASC LIMIT 1").get() as any;

/* ------------------------------------------------------------------ */
/* 1. A verified customer, created the way a real one is.              */
/* ------------------------------------------------------------------ */
const email = "buyer@example.com";
const registration = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, displayName: "Test Buyer", password: "a-long-enough-password" }),
});
const registered = await registration.json() as any;
h.eq(registration.status, 201, "a customer account can be registered");
const verifyToken = String(registered.developmentVerificationUrl || "").split("token=")[1] || "";
await fetch(`${base}/api/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: decodeURIComponent(verifyToken) }) });
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-enough-password" }) });
h.eq(login.status, 200, "a verified customer can sign in");
const cookie = String(login.headers.get("set-cookie") || "").split(";")[0];
const account = async () => (await fetch(`${base}/api/account`, { headers: { Cookie: cookie } })).json() as any;
const dbUserId = (testD1().sqlite.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as { id: string }).id;
h.eq((await account()).membership.plan_id, "free", "a new account starts on Free");

/* ------------------------------------------------------------------ */
/* 2. The signature contract.                                         */
/* ------------------------------------------------------------------ */
{
  const body = JSON.stringify({ events: [subscriptionEvent({ eventId: "evt-sig", type: "order.completed" })] });

  const good = await postWebhook(JSON.parse(body));
  h.eq(good.status, 200, "a correctly signed delivery is accepted");
  h.eq(good.body.received, true, "and acknowledged");
  h.eq(good.body.results[0], "ignored", "without being acted on, because order.completed is not a subscription event");
  h.eq((await account()).membership.plan_id, "free", "and a valid signature on its own grants nothing");

  const forged = await postWebhook(JSON.parse(body), sign(body, "the-wrong-secret"));
  h.eq(forged.status, 401, "a delivery signed with the wrong secret is rejected");

  const unsigned = await fetch(`${base}/api/webhooks/fastspring`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  h.eq(unsigned.status, 401, "a delivery with no signature at all is rejected");

  /* The signature covers the raw bytes: a body different from the one signed
     must not produce a match. */
  const tampered = body.replace('"processed":false', '"processed":true');
  const moved = await postWebhook(null, sign(tampered), tampered);
  h.eq(moved.status, 200, "a delivery signed over its exact bytes is accepted");
  const scrambled = JSON.stringify({ events: [JSON.parse(body).events[0], {}] });
  const bad = await postWebhook(null, sign(body), scrambled);
  h.eq(bad.status, 401, "a body different from the one signed is rejected");

  /* The exported helpers sign and verify exactly as the handler does. */
  const raw = "{\"events\":[]}";
  const header = platform.fastspringSignatureHeader(raw, WEBHOOK_SECRET);
  h.eq(platform.verifyFastSpringSignature(Buffer.from(raw, "utf8"), header, WEBHOOK_SECRET), true, "the signing helper round-trips through the verifier");
  h.eq(platform.verifyFastSpringSignature(Buffer.from(raw, "utf8"), header, "other"), false, "and only under the right secret");
  h.eq(platform.verifyFastSpringSignature(Buffer.from(`${raw} `, "utf8"), header, WEBHOOK_SECRET), false, "the bytes hashed are the bytes that arrived, never a re-serialised object");
  h.eq(platform.verifyFastSpringSignature(Buffer.from(raw, "utf8"), "", WEBHOOK_SECRET), false, "an absent header verifies as false, not as empty");
  h.eq(platform.verifyFastSpringSignature(Buffer.from(raw, "utf8"), "not-base64-of-anything", WEBHOOK_SECRET), false, "and a wrong digest of any length fails");
  h.eq(header, Buffer.from(createHmac("sha256", WEBHOOK_SECRET).update(Buffer.from(raw, "utf8")).digest()).toString("base64"), "the header is base64 HMAC-SHA256 over the raw body, exactly as FastSpring documents");

  /* Nothing is configured: the endpoint refuses rather than trusting. */
  const savedSecret = process.env.FASTSPRING_WEBHOOK_SECRET;
  delete process.env.FASTSPRING_WEBHOOK_SECRET;
  const unconfigured = await postWebhook(JSON.parse(body));
  h.eq(unconfigured.status, 503, "with no webhook secret the endpoint refuses rather than trusting the caller");
  process.env.FASTSPRING_WEBHOOK_SECRET = savedSecret;

  /* Status mapping: FastSpring's vocabulary onto this codebase's. */
  h.eq(platform.sceneringStatusForFastSpring("subscription.activated", "active"), "active", "a new subscription is active");
  h.eq(platform.sceneringStatusForFastSpring("subscription.activated", "trial"), "on_trial", "a trial is on_trial");
  h.eq(platform.sceneringStatusForFastSpring("subscription.charge.completed", "active"), "active", "a successful rebill keeps the plan");
  h.eq(platform.sceneringStatusForFastSpring("subscription.charge.failed", "overdue"), "past_due", "a failed rebill is past_due");
  h.eq(platform.sceneringStatusForFastSpring("subscription.canceled", "canceled"), "cancelled", "canceled is this codebase's cancelled");
  h.eq(platform.sceneringStatusForFastSpring("subscription.deactivated", "deactivated"), "expired", "deactivated means the paid period is over");
  h.eq(platform.sceneringStatusForFastSpring("subscription.updated", "overdue"), "past_due", "an update follows the state it carries");
  h.eq(platform.sceneringStatusForFastSpring("subscription.updated", "unheard-of"), "unheard-of", "an unknown state is stored as-is rather than granting access");
}

/* ------------------------------------------------------------------ */
/* 3. Checkout: a tagged popup, and a tagged server-made session.     */
/* ------------------------------------------------------------------ */
{
  const response = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const data = await response.json() as any;
  h.eq(response.status, 200, "checkout opens for a configured plan");
  h.eq(data.provider, "fastspring", "the response names the provider");
  h.eq(data.mode, "popup", "with no API keys the Store Builder popup is used");
  h.eq(data.storefront, "scenering.test.onfastspring.com/popup-scenering", "pointing at the configured storefront path");
  h.eq(data.productPath, "sceneflow-monthly", "for the product path that plan and interval map to");
  /* The whole security story of the integration: the account id and email are
     set by the server that authenticated the member, ride the session as
     order tags, and come home on every webhook — the person paying cannot
     change them. */
  h.eq(data.tags?.user_id, dbUserId, "the buyer's account id rides along in the tags, so the webhook can match it");
  h.eq(data.tags?.email, email, "and so does their email, as a second way to match");
  h.eq(data.email, email, "the buyer's email is prefilled at checkout");

  const forge = await fetch(`${base}/api/billing/fastspring/checkout/sceneforge/yearly`, { headers: { Cookie: cookie } });
  const forgeData = await forge.json() as any;
  h.eq(forge.status, 200, "the explicit FastSpring endpoint opens the same checkout");
  h.eq(forgeData.productPath, "sceneforge-yearly", "with that plan's yearly product path");

  const bad = await fetch(`${base}/api/billing/checkout/free/monthly`, { headers: { Cookie: cookie } });
  h.eq(bad.status, 400, "there is no checkout for the Free plan");
  const anonymous = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`);
  h.eq(anonymous.status, 401, "checkout requires a signed-in account");

  /* Product paths are configuration: renaming the product in the FastSpring
     app and setting one variable keeps every mapping working. */
  process.env.FASTSPRING_SCENEFLOW_MONTHLY_PATH = "flow-m";
  const renamed = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const renamedData = await renamed.json() as any;
  h.eq(renamedData.productPath, "flow-m", "a renamed product path is read from the environment");
  delete process.env.FASTSPRING_SCENEFLOW_MONTHLY_PATH;
  h.eq(platform.planForFastSpringProduct("flow-m", (k) => process.env[k] as string | undefined), null, "and the old path no longer maps once renamed");
  h.eq(platform.planForFastSpringProduct("sceneflow-monthly", (k) => process.env[k] as string | undefined)?.plan, "sceneflow", "the default path maps to sceneflow");
  h.eq(platform.planForFastSpringProduct("sceneforge-yearly", (k) => process.env[k] as string | undefined)?.interval, "yearly", "and the yearly path maps to the yearly interval");

  /* With the API keys configured the server can create the session itself,
     tags and buyer email already inside it, and hand over its URL. */
  process.env.FASTSPRING_API_USERNAME = API_USERNAME;
  process.env.FASTSPRING_API_PASSWORD = API_PASSWORD;
  const session = await fetch(`${base}/api/billing/checkout/sceneforge/monthly`, { headers: { Cookie: cookie } });
  const sessionData = await session.json() as any;
  h.eq(session.status, 200, "session checkout opens with the API keys configured");
  h.eq(sessionData.mode, "session", "and is a hosted session redirect");
  h.eq(sessionData.url, "https://scenering.test.onfastspring.com/session/sess_test_1", "pointing at the session FastSpring created");
  const created = fastspringCalls.find((call) => call.method === "POST" && call.url.endsWith("/sessions"));
  h.ok(Boolean(created), "the server created the session itself rather than building one in the browser");
  h.eq(created?.body?.products?.[0]?.path, "sceneforge-monthly", "with the product path for that plan and interval");
  h.eq(created?.body?.products?.[0]?.quantity, 1, "for a single subscription");
  h.eq(created?.body?.tags?.user_id, dbUserId, "the account id rides in the session's tags");
  h.eq(created?.body?.tags?.email, email, "and the email with it");
  h.eq(created?.body?.customer?.email, email, "the buyer's email is prefilled in the session");

  /* FastSpring refusing is a provider error the customer can see, not a
     blank page. */
  fastspringApiFails = true;
  const refused = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const refusedBody = await refused.json() as any;
  h.eq(refused.status, 502, "a FastSpring API failure is reported as a provider error");
  h.eq(refusedBody.code, "BILLING_PROVIDER_ERROR", "with a machine-readable code");
  h.ok(String(refusedBody.detail || "").includes("permission"), "and FastSpring's own reason, so the owner can act on it");
  fastspringApiFails = false;
  delete process.env.FASTSPRING_API_USERNAME;
  delete process.env.FASTSPRING_API_PASSWORD;

  /* Nothing configured names the variable that is missing. */
  const savedStorefront = process.env.FASTSPRING_STOREFRONT;
  delete process.env.FASTSPRING_STOREFRONT;
  const unconfigured = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const unconfiguredBody = await unconfigured.json() as any;
  h.eq(unconfigured.status, 503, "an unconfigured storefront says so instead of opening a broken page");
  h.eq(unconfiguredBody.code, "BILLING_NOT_CONFIGURED", "the reason is machine-readable");
  h.ok(String(unconfiguredBody.detail || "").includes("FASTSPRING_STOREFRONT"), "and names the variable that is missing");
  process.env.FASTSPRING_STOREFRONT = savedStorefront;

  /* BILLING_PROVIDER is the switch: Paddle keeps its endpoint even while
     FastSpring is the default. */
  process.env.BILLING_PROVIDER = "paddle";
  const viaPaddle = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`, { headers: { Cookie: cookie } });
  const viaPaddleBody = await viaPaddle.json() as any;
  h.eq(viaPaddle.status, 503, "with BILLING_PROVIDER=paddle the FastSpring checkout is not opened");
  h.eq(viaPaddleBody.code, "BILLING_NOT_CONFIGURED", "and the Paddle path reports its own missing configuration");
  process.env.BILLING_PROVIDER = "fastspring";
}

/* ------------------------------------------------------------------ */
/* 4. subscription.activated: the tags find the account.              */
/* ------------------------------------------------------------------ */
{
  const event = subscriptionEvent({ eventId: "evt-act-1", type: "subscription.activated", userId: dbUserId, email });
  const result = await postWebhook({ events: [event] });
  h.eq(result.status, 200, "a signed subscription.activated is accepted");
  h.eq(result.body.results[0], "processed", "and processed");
  h.eq((await account()).membership.plan_id, "sceneflow", "the member's plan becomes SceneFlow");
  h.eq((await account()).plan.id, "sceneflow", "the account payload agrees");
  h.eq((await account()).subscription.plan_id, "sceneflow", "as does the subscription it reports");
  h.eq((await account()).subscription.subscription_id, SUBSCRIPTION_ID, "keyed on FastSpring's subscription id");
  h.eq((await account()).subscription.status, "active", "with FastSpring's status translated");
  h.eq((await account()).subscription.price_id, "sceneflow-monthly", "the product path is stored as the price the webhook maps by");
  h.eq((await account()).has_billing_customer, true, "the customer mapping is recorded");

  const sub = subscriptionRow();
  h.eq(sub.plan_id, "sceneflow", "the subscription row names the plan");
  h.eq(sub.billing_interval, "monthly", "and the interval");
  h.eq(sub.provider_customer_id, ACCOUNT_ID, "with the FastSpring account id on it");
  h.eq(sub.customer_portal_url, "https://scenering.test.onfastspring.com/account#/subscriptions", "and the account management link the webhook carried");
  h.eq(sub.update_payment_url, "https://scenering.test.onfastspring.com/account#/subscriptions", "with update-card leading to the same Manage menu");

  const customer = testD1().sqlite.prepare("SELECT * FROM billing_customers WHERE provider = 'fastspring'").get() as any;
  h.eq(customer.user_id, dbUserId, "the FastSpring account is mapped to the Scenering account");
  h.eq(customer.email, email, "with the checkout email on the mapping");

  h.eq(webhookLog("evt-act-1")?.product_path, "sceneflow-monthly", "the webhook log records the product path");
  h.eq(webhookLog("evt-act-1")?.live, true, "and whether the event was live");

  /* Replay protection: the same event id again changes nothing. */
  const replay = await postWebhook({ events: [event] });
  h.eq(replay.body.results[0], "duplicate", "a redelivery of the same event id is recognised");
  const rows = testD1().sqlite.prepare("SELECT COUNT(*) AS n FROM webhook_events WHERE provider_event_id = 'evt-act-1'").get() as any;
  h.eq(rows.n, 1, "and leaves exactly one log row");
  h.ok((webhookLog("evt-act-1")?.duplicate_count ?? 0) >= 1, "while marking the original row that a redelivery arrived");
  h.eq(subscriptionRow().status, "active", "and changing nothing");

  /* Matching by the tags' email alone, when a user_id is absent or wrong. */
  const second = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "second@example.com", displayName: "Second Buyer", password: "a-long-enough-password" }),
  });
  const secondBody = await second.json() as any;
  const secondToken = String(secondBody.developmentVerificationUrl || "").split("token=")[1] || "";
  await fetch(`${base}/api/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: decodeURIComponent(secondToken) }) });
  const byEmail = subscriptionEvent({ eventId: "evt-act-2", type: "subscription.activated", subscriptionId: "subSCR1pt10nSecond111", userId: null, email: "second@example.com", product: "sceneforge-yearly" });
  const matched = await postWebhook({ events: [byEmail] });
  h.eq(matched.body.results[0], "processed", "a payment tagged with only an email is matched to that account");
  const secondUser = testD1().sqlite.prepare("SELECT id FROM users WHERE lower(email) = 'second@example.com'").get() as any;
  const secondMembership = testD1().sqlite.prepare("SELECT plan FROM memberships WHERE user_id = ?").get(secondUser.id) as any;
  h.eq(secondMembership.plan, "sceneforge", "and grants the plan that product maps to");

  /* The email wins over a user_id that belongs to somebody else. */
  const stolen = subscriptionEvent({ eventId: "evt-act-3", type: "subscription.activated", subscriptionId: "subSCR1pt10nThird222", userId: dbUserId, email: "second@example.com", product: "sceneflow-monthly" });
  const won = await postWebhook({ events: [stolen] });
  h.eq(won.body.results[0], "processed", "the checkout email is the stronger identity");
  const stolenSub = testD1().sqlite.prepare("SELECT * FROM subscriptions WHERE provider_subscription_id = 'subSCR1pt10nThird222'").get() as any;
  h.eq(stolenSub.user_id, secondUser.id, "so the subscription lands on the email's account, not the mismatched id");

  /* Nothing to match: recorded, and access granted to nobody. A fresh
     account id, so no earlier mapping can rescue it. */
  const orphan = subscriptionEvent({ eventId: "evt-act-orphan", type: "subscription.activated", subscriptionId: "subSCR1pt10nOrphan33", userId: null, email: null, accountId: "acctNobodyElse777", accountEmail: "nobody@example.com" });
  (orphan.data as any).tags = {};
  const unmatched = await postWebhook({ events: [orphan] });
  h.eq(unmatched.status, 200, "an unmatched delivery is acknowledged so FastSpring stops retrying");
  h.eq(unmatched.body.results[0], "unmatched", "with its outcome recorded");
  h.eq((testD1().sqlite.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE provider_subscription_id = 'subSCR1pt10nOrphan33'").get() as any).n, 0, "and no subscription row invented");
}

/* ------------------------------------------------------------------ */
/* 5. Charge failures, renewals and the subscription lifecycle.       */
/* ------------------------------------------------------------------ */
{
  /* A failed rebill keeps access while FastSpring retries the card. */
  const failed = subscriptionEvent({ eventId: "evt-fail-1", type: "subscription.charge.failed", userId: dbUserId, email, state: "overdue", changed: ms(1000) });
  h.eq((await postWebhook({ events: [failed] })).body.results[0], "processed", "a failed charge is processed");
  h.eq((await account()).subscription.status, "past_due", "the subscription is past_due");
  h.eq((await account()).membership.plan_id, "sceneflow", "and the member keeps the plan while dunning runs");

  /* A successful rebill restores it and records the renewal price. */
  const rebill = subscriptionEvent({ eventId: "evt-rebill-1", type: "subscription.charge.completed", userId: dbUserId, email, changed: ms(2000), next: ms(60 * DAY), nextChargeTotalDisplay: "$19.00" });
  h.eq((await postWebhook({ events: [rebill] })).body.results[0], "processed", "a successful rebill is processed");
  h.eq((await account()).subscription.status, "active", "the subscription is active again");
  h.eq(subscriptionRow().renewal_price, "$19.00", "and the renewal price FastSpring states is recorded");

  /* A stale redelivery cannot resurrect state the customer moved past. */
  const stale = subscriptionEvent({ eventId: "evt-stale-1", type: "subscription.charge.failed", userId: dbUserId, email, state: "overdue", changed: ms(500) });
  h.eq((await postWebhook({ events: [stale] })).body.results[0], "stale", "an event older than the newest applied is dropped");

  /* A plan change arrives as subscription.updated carrying the new product. */
  const upgrade = subscriptionEvent({ eventId: "evt-upgrade-1", type: "subscription.updated", userId: dbUserId, email, product: "sceneforge-yearly", state: "active", changed: ms(3000), next: ms(365 * DAY), nextChargeTotalDisplay: "$372.00", paymentMethod: { type: "card", cardBrand: "visa", lastFour: "4242" } });
  h.eq((await postWebhook({ events: [upgrade] })).body.results[0], "processed", "a product change is processed");
  h.eq((await account()).membership.plan_id, "sceneforge", "the member's plan follows the product path");
  h.eq((await account()).subscription.billing_interval, "yearly", "and the billing interval with it");
  h.eq((await account()).subscription.card_brand, "visa", "FastSpring names the payment method when one is on file");
  h.eq((await account()).subscription.card_last_four, "4242", "and the account window can show the card");

  /* An update with no state says nothing about access. */
  const quiet = subscriptionEvent({ eventId: "evt-quiet-1", type: "subscription.updated", userId: dbUserId, email, product: "sceneforge-yearly", changed: ms(3500) });
  delete (quiet.data as any).state;
  h.eq((await postWebhook({ events: [quiet] })).body.results[0], "processed", "an update without a state is still applied");
  h.eq((await account()).subscription.status, "active", "and keeps the status already stored");

  /* Cancellation: access continues until the paid period ends. */
  const deactivationAt = ms(45 * DAY);
  const cancelled = subscriptionEvent({ eventId: "evt-cancel-1", type: "subscription.canceled", userId: dbUserId, email, product: "sceneforge-yearly", state: "canceled", changed: ms(4000), next: null, deactivationDate: deactivationAt });
  h.eq((await postWebhook({ events: [cancelled] })).body.results[0], "processed", "a cancellation is processed");
  h.eq((await account()).subscription.status, "cancelled", "the subscription is cancelled");
  h.eq((await account()).subscription.cancel_at_period_end, true, "and marked as ending");
  h.eq((await account()).membership.plan_id, "sceneforge", "while the member keeps the plan the period was paid for");
  h.ok(String((await account()).subscription.expires_at || "").startsWith(new Date(deactivationAt).toISOString().slice(0, 10)), "with the deactivation date stored as the end of access");

  /* Deactivation: the paid period is over. */
  const deactivated = subscriptionEvent({ eventId: "evt-deact-1", type: "subscription.deactivated", userId: dbUserId, email, product: "sceneforge-yearly", state: "deactivated", changed: ms(5000), next: null, deactivationDate: deactivationAt });
  h.eq((await postWebhook({ events: [deactivated] })).body.results[0], "processed", "a deactivation is processed");
  h.eq((await account()).membership.plan_id, "free", "the member goes back to Free");
  h.eq((await account()).subscription, null, "and no subscription is current any more");
}

/* ------------------------------------------------------------------ */
/* 5b. Shapes FastSpring actually sends: unknown paths, batches, bare. */
/* ------------------------------------------------------------------ */
{
  /* A product path the settings do not name grants nothing. */
  const stranger = subscriptionEvent({ eventId: "evt-act-unknown", type: "subscription.activated", subscriptionId: "subSCR1pt10nStranger44", userId: dbUserId, email, product: "not-a-scenering-plan" });
  const unknown = await postWebhook({ events: [stranger] });
  h.eq(unknown.body.results[0], "unknown_price", "an unknown product path is refused as unknown_price");

  /* A batch of two events in one delivery, as FastSpring sends them. */
  const batchResult = await postWebhook({
    events: [
      subscriptionEvent({ eventId: "evt-batch-1", type: "subscription.charge.completed", subscriptionId: "subSCR1pt10nBatch55", userId: dbUserId, email }),
      subscriptionEvent({ eventId: "evt-batch-2", type: "order.completed", subscriptionId: "subSCR1pt10nBatch55", userId: dbUserId, email }),
    ],
  });
  h.eq(batchResult.body.results.length, 2, "every event in a batched delivery is handled");
  h.eq(batchResult.body.results[0], "processed", "in order");
  h.eq(batchResult.body.results[1], "ignored", "with non-subscription events recorded and ignored");

  /* A bare event object (no envelope) is accepted too. */
  const bare = subscriptionEvent({ eventId: "evt-bare-1", type: "subscription.charge.completed", subscriptionId: "subSCR1pt10nBare66", userId: dbUserId, email });
  const bareResult = await postWebhook(bare);
  h.eq(bareResult.body.results[0], "processed", "a single event without the events array is accepted");
}

/* ------------------------------------------------------------------ */
/* 6. Customer subscription management links.                         */
/* ------------------------------------------------------------------ */
{
  /* The webhook's account.url is what the account window's Manage or cancel
     and Update payment card buttons open — FastSpring's own portal, where the
     Manage menu offers update-card and cancel. */
  const sub = testD1().sqlite.prepare("SELECT * FROM subscriptions WHERE provider_subscription_id = ?").get(SUBSCRIPTION_ID) as any;
  h.ok(String(sub.customer_portal_url || "").startsWith("https://"), "the stored portal link is a real URL");
  h.ok(String(sub.customer_portal_url || "").includes("#/subscriptions"), "landing on the subscriptions tab");

  /* The Customer portal button mints a pre-authenticated link when the API
     keys are configured — a fresh one on every click, never stored. */
  process.env.FASTSPRING_API_USERNAME = API_USERNAME;
  process.env.FASTSPRING_API_PASSWORD = API_PASSWORD;
  const portal = await fetch(`${base}/api/billing/portal`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
  const portalBody = await portal.json() as any;
  h.eq(portal.status, 200, "the customer portal opens for a FastSpring member");
  h.eq(portalBody.url, "https://scenering.test.onfastspring.com/account?auth=acctAbCdEfG123XyZ456#/subscriptions", "as an authenticated account management link, on the subscriptions tab");
  const authCall = fastspringCalls.find((call) => call.url.includes("/authenticate"));
  h.eq(authCall?.url, `https://api.fastspring.com/accounts/${ACCOUNT_ID}/authenticate`, "minted from the FastSpring API for this account");
  const again = await fetch(`${base}/api/billing/portal`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
  h.eq(again.status, 200, "and again on every click");
  delete process.env.FASTSPRING_API_USERNAME;
  delete process.env.FASTSPRING_API_PASSWORD;

  /* Without the API keys the stored customer-facing link still works. */
  const fallback = await fetch(`${base}/api/billing/portal`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
  const fallbackBody = await fallback.json() as any;
  h.eq(fallback.status, 200, "without the API keys the portal falls back to the link the webhook recorded");
  h.eq(fallbackBody.url, "https://scenering.test.onfastspring.com/account#/subscriptions", "which is FastSpring's own account management page");

  const anonymous = await fetch(`${base}/api/billing/portal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  h.eq(anonymous.status, 401, "the portal requires a signed-in account");
}

/* ------------------------------------------------------------------ */
/* 7. The owner's checklist.                                          */
/* ------------------------------------------------------------------ */
{
  const config = platform.fastspringConfiguration();
  h.eq(config.provider, "fastspring", "the checklist is for FastSpring");
  h.eq(config.webhookPath, "/api/webhooks/fastspring", "and names the webhook path");
  h.eq(config.webhookUrl, "https://scenering.test/api/webhooks/fastspring", "the exact webhook URL to paste");
  h.eq(config.requiredEvents.length, 6, "with the events to tick");
  for (const eventName of ["subscription.activated", "subscription.updated", "subscription.charge.completed", "subscription.charge.failed", "subscription.canceled", "subscription.deactivated"]) {
    h.ok((config.requiredEvents as readonly string[]).includes(eventName), `the checklist lists ${eventName}`);
  }
  h.eq(config.storefront, "scenering.test.onfastspring.com/popup-scenering", "reading the storefront path from the environment");
  h.eq(config.environment, "test", "and which environment the host says it is");
  h.eq(config.checkoutMode, "popup", "with the checkout mode it will use");
  h.eq(config.products.length, 4, "the four sellable products");
  h.eq(config.products.map((p: any) => p.productPath).join(","), "sceneflow-monthly,sceneflow-yearly,sceneforge-monthly,sceneforge-yearly", "and the paths it will recognise");
  h.eq(config.apiSet, false, "API keys are optional and reported as missing, not invented");
  h.eq(config.ready, true, "with the storefront and the webhook secret the setup can take a payment");
  const withoutSecret = process.env.FASTSPRING_WEBHOOK_SECRET;
  delete process.env.FASTSPRING_WEBHOOK_SECRET;
  h.eq(platform.fastspringConfiguration().ready, false, "without the webhook secret nothing is ready, because a payment could never be believed");
  process.env.FASTSPRING_WEBHOOK_SECRET = withoutSecret;
  h.eq(platform.billingProvider(), "fastspring", "BILLING_PROVIDER chooses the default checkout");
  process.env.BILLING_PROVIDER = "paddle";
  h.eq(platform.billingProvider(), "paddle", "and Paddle stays selectable beside it");
  process.env.BILLING_PROVIDER = "fastspring";
}

/* ------------------------------------------------------------------ */
/* 8. Wiring and documentation that make the switch-on a paste job.   */
/* ------------------------------------------------------------------ */
{
  h.ok(serverSource.includes("registerFastSpringWebhook(app)"), "the webhook is mounted by the server");
  h.ok(
    /req\.path === "\/api\/webhooks\/fastspring"/.test(serverSource),
    "the webhook is exempt from the same-origin guard, since FastSpring is a third party",
  );
  h.ok(serverSource.includes("https://*.onfastspring.com") && serverSource.includes("https://*.fastspring.com"), "the content security policy allows the FastSpring storefronts");
  h.ok(serverSource.includes("https://sbl.onfastspring.com"), "and the Store Builder Library the popup loads");
  h.ok(serverSource.includes("https://api.fastspring.com"), "and the FastSpring API");
  h.ok(
    platformSource.includes('express.raw({ type: "application/json", limit: "2mb" })') && platformSource.includes("verifyFastSpringSignature(body"),
    "the webhook body stays raw, or the signature could never be verified",
  );
  h.ok(platformSource.includes("timingSafeEqual"), "signatures are compared in constant time");
  h.ok(platformSource.includes(".update(rawBody)"), "and hashed as the bytes that arrived, never as a re-serialised object");
  h.ok(
    platformSource.includes("webhookEventExists(eventId)") && readFileSync(join(repoRoot, "migrations", "0001_init.sql"), "utf8").includes("provider_event_id TEXT UNIQUE NOT NULL"),
    "event ids are checked for replay",
  );
  h.ok(platformSource.includes("fastspringCheckoutTags"), "checkout carries the account tags that webhooks read back");

  for (const key of [
    "BILLING_PROVIDER", "FASTSPRING_STOREFRONT", "FASTSPRING_API_USERNAME",
    "FASTSPRING_API_PASSWORD", "FASTSPRING_WEBHOOK_SECRET", "FASTSPRING_CHECKOUT_MODE",
    "FASTSPRING_SCENEFLOW_MONTHLY_PATH", "FASTSPRING_SCENEFLOW_YEARLY_PATH",
    "FASTSPRING_SCENEFORGE_MONTHLY_PATH", "FASTSPRING_SCENEFORGE_YEARLY_PATH",
  ]) {
    h.ok(envExample.includes(`${key}=`) || envExample.includes(`# ${key}=`), `.env.example lists ${key}`);
  }
  h.ok(envExample.includes("/api/webhooks/fastspring"), ".env.example gives the webhook path");
  h.ok(envExample.includes("subscription.deactivated"), ".env.example lists the events to subscribe to");
  h.ok(readme.includes("## Billing (FastSpring"), "the README documents the FastSpring setup");
  h.ok(readme.includes("fastspringCheckoutTags") || readme.includes("`tags` = `{ user_id, email }`") || readme.includes("tags"), "and the tags that match payments to accounts");
  h.ok(fastspringDoc.includes("X-FS-Signature"), "FASTSPRING.md states the signature contract");
  h.ok(fastspringDoc.includes("/api/webhooks/fastspring"), "and the exact webhook URL to paste");
  h.ok(fastspringDoc.includes("sceneflow-monthly") && fastspringDoc.includes("sceneflow-yearly") && fastspringDoc.includes("sceneforge-monthly") && fastspringDoc.includes("sceneforge-yearly"), "and the four product paths");
  for (const eventName of ["subscription.activated", "subscription.updated", "subscription.charge.completed", "subscription.charge.failed", "subscription.canceled", "subscription.deactivated"]) {
    h.ok(fastspringDoc.includes(eventName), `FASTSPRING.md lists ${eventName} to tick`);
  }
  h.ok(fastspringDoc.includes("HMAC SHA256 Secret"), "and names the field the secret comes from");

  h.ok(modal.includes("FastSpring billing"), "the owner sees the FastSpring checklist in the app");
  h.ok(modal.includes("adminData.fastspring.webhookUrl"), "with the webhook URL to register");
  h.ok(modal.includes("testInProduction"), "and is warned when a production site is still pointed at the test storefront");
  h.ok(modal.includes("Manage or cancel"), "a paying customer can reach FastSpring's account pages from the app");
  h.ok(modal.includes("Update payment card"), "and can change the card on file");
  h.ok(modal.includes('target="_blank" rel="noopener noreferrer"'), "hosted billing pages open safely");
  h.ok(modal.includes("openFastSpringPopup"), "the popup checkout is opened from the account window");

  h.ok(sblLoader.includes("sbl.onfastspring.com"), "the Store Builder Library is loaded from FastSpring's own host");
  h.ok(sblLoader.includes("data-storefront"), "with the storefront path the server configured");
  h.ok(sblLoader.includes("tags"), "and the account tags on the session");
}

server.close();
h.done("fastspring");
