import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { installTestPlatformEnv, testD1 } from "./platform-env.ts";

process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "production-auth-test-secret-not-for-deployment";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "test-only-key";
process.env.SCENERING_OWNER_EMAIL = "hjvhorlick@gmail.com";
delete process.env.DEV_SANDBOX_AUTO_PROVISION;
installTestPlatformEnv();
const { db } = await import("../src/db.ts");
const { assertSecurePlatformConfiguration, registerPlatformRoutes } = await import("../server/platform.ts");

/**
 * A production server never hands a verification or password-reset link back
 * in an API response. That was the hole: anybody could register with an
 * address they do not own — or any throwaway address — and verify it instantly
 * without ever reading the mailbox, which turns "one Free account" into
 * unlimited Free accounts. In production the emailed link is the only way in,
 * so this suite reads the token out of the message the server actually sends.
 *
 * Delivery success is essential to that: never send real email here.
 */
const realFetch = globalThis.fetch;
let deliveries = 0;
let failDelivery = false;
let lastEmailHtml = "";
globalThis.fetch = (async (input, init) => {
  if (String(input) === "https://api.resend.com/emails") {
    deliveries++;
    try {
      const payload = JSON.parse(String((init as any)?.body || "{}"));
      lastEmailHtml = String(payload.html || payload.text || "");
    } catch {
      lastEmailHtml = "";
    }
    return failDelivery
      ? new Response("Unavailable", { status: 503 })
      : Response.json({ id: `test-email-${deliveries}` });
  }
  return realFetch(input, init);
}) as typeof fetch;

/** The link the customer would click in their inbox. */
const emailedLink = (): string => {
  const match = lastEmailHtml.match(/https?:[^"'\s]*(?:verify-email|reset-password)\?token=[A-Za-z0-9_%.-]+/);
  assert.ok(match, "the email carries a link");
  return match![0].replace(/&amp;/g, "&");
};

const app = express();
app.use(express.json());
registerPlatformRoutes(app);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const post = (path: string, body: unknown) => fetch(`${base}/api/auth/${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const credentials = { email: "preview@example.com", password: "preview-password-123" };
const verify = async (url: string) => {
  const token = new URL(url, base).searchParams.get("token");
  assert.ok(token);
  assert.equal((await post("verify-email", { token })).status, 200);
};

try {
  assert.doesNotThrow(() => assertSecurePlatformConfiguration());
  const configuredOwner = process.env.SCENERING_OWNER_EMAIL;
  delete process.env.SCENERING_OWNER_EMAIL;
  assert.throws(() => assertSecurePlatformConfiguration(), /SCENERING_OWNER_EMAIL/);
  process.env.SCENERING_OWNER_EMAIL = configuredOwner;
  const configuredResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  assert.throws(() => assertSecurePlatformConfiguration(), /RESEND_API_KEY/);
  process.env.RESEND_API_KEY = configuredResendKey;


  const registration = await post("register", { ...credentials, displayName: "Preview User" });
  assert.equal(registration.status, 201);
  const registered = await registration.json();
  assert.equal(registered.developmentVerificationUrl, undefined, "production never returns the verification link");
  assert.equal(deliveries, 1);
  await verify(emailedLink());
  const user = await db.findUserByEmail(credentials.email);
  assert.ok(user);
  assert.equal(user.role, "user");

  // Authentication and session reads remain independent of billing tables.
  const login = await post("login", credentials);
  assert.equal(login.status, 200);
  const cookie = String(login.headers.get("set-cookie")).split(";")[0];
  assert.equal((await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200);

  // Account reads still degrade safely if a legacy subscription schema is absent.
  const listSubscriptions = db.listSubscriptionsForUser;
  db.listSubscriptionsForUser = async () => { throw new Error("no such table: subscriptions"); };
  try {
    assert.equal((await fetch(`${base}/api/account`, { headers: { Cookie: cookie } })).status, 200);
  } finally {
    db.listSubscriptionsForUser = listSubscriptions;
  }

  // Existing unverified accounts get the inline token only after a valid password.
  await db.updateUser(user.id, { isVerified: false });
  const badLogin = await post("login", { ...credentials, password: "wrong-password" });
  assert.equal(badLogin.status, 401);
  assert.equal((await badLogin.json()).developmentVerificationUrl, undefined);
  const unverified = await post("login", credentials);
  assert.equal(unverified.status, 403);
  const unverifiedBody = await unverified.json();
  assert.equal(unverifiedBody.code, "EMAIL_UNVERIFIED");
  assert.equal(unverifiedBody.developmentVerificationUrl, undefined, "an unverified sign-in leaks no link either");
  assert.equal(deliveries, 2);
  await verify(emailedLink());
  assert.equal((await post("login", credentials)).status, 200);

  // When the mail provider is down there is simply no link to hand back — the
  // customer asks for another one later. Failing open here would be worse.
  failDelivery = true;
  await db.updateUser(user.id, { isVerified: false });
  const failedEmailLogin = await post("login", credentials);
  assert.equal(failedEmailLogin.status, 403);
  assert.equal((await failedEmailLogin.json()).developmentVerificationUrl, undefined);
  const failedEmailRegistration = await post("register", { email: "no-mail@example.com", password: credentials.password, displayName: "No Mail" });
  assert.equal(failedEmailRegistration.status, 201);
  assert.equal((await failedEmailRegistration.json()).developmentVerificationUrl, undefined);
  failDelivery = false;
  await verify(emailedLink());

  // A public owner email is an identifier, not a credential. An attacker who
  // registers it first remains a normal unverified user until the actual
  // mailbox holder redeems the verification link.
  const ownerRegistration = await post("register", { email: "hjvhorlick@gmail.com", password: credentials.password, displayName: "Owner" });
  assert.equal(ownerRegistration.status, 201);
  let owner = await db.findUserByEmail("hjvhorlick@gmail.com");
  assert.equal(owner?.role, "user");
  assert.equal(owner?.isVerified, false);
  assert.equal((await db.findMembershipByUserId(owner!.id))?.plan, "free");
  const prematureOwnerLogin = await post("login", { email: "hjvhorlick@gmail.com", password: credentials.password });
  assert.equal(prematureOwnerLogin.status, 403, "an unverified configured address cannot sign in as admin");
  await verify(emailedLink());
  owner = await db.findUserByEmail("hjvhorlick@gmail.com");
  assert.equal(owner?.role, "admin", "verified configured address is promoted to admin");
  const ownerLogin = await post("login", { email: "hjvhorlick@gmail.com", password: credentials.password });
  assert.equal(ownerLogin.status, 200);
  const ownerPayload = await ownerLogin.json();
  assert.equal(ownerPayload.membership.plan_id, "sceneforge", "verified owner receives SceneForge entitlement");
  assert.equal(ownerPayload.sessionToken, undefined, "production never returns browser-readable bearer session tokens");
  const ownerCookie = String(ownerLogin.headers.get("set-cookie") || "").split(";")[0];

  /* Secondary entitlement tables are fault-isolated in production. Sign-in
   * resolves the plan, the subscription, the gift grant, the billing customer
   * and this week's usage — and a missing migration or a D1 error in ANY of
   * them used to reject the whole Promise.all and answer 500. They must now
   * degrade quietly: the owner keeps SceneForge, everybody else keeps their
   * stored membership. */
  for (const table of ["subscriptions", "complimentary_grants", "usage_records"]) {
    testD1().sqlite.exec(`DROP TABLE ${table}`);
  }
  const ownerAfterDrops = await post("login", { email: "hjvhorlick@gmail.com", password: credentials.password });
  assert.equal(ownerAfterDrops.status, 200, "dropped entitlement/usage tables never fail the owner's sign-in");
  const ownerAfterDropsPayload = await ownerAfterDrops.json();
  assert.equal(ownerAfterDropsPayload.user.role, "admin");
  assert.equal(ownerAfterDropsPayload.membership.plan_id, "sceneforge", "the verified owner keeps SceneForge without the subscription tables");
  assert.equal(
    (await fetch(`${base}/api/auth/session`, { headers: { Cookie: ownerCookie } })).status,
    200,
    "session restore survives dropped entitlement/usage tables",
  );

  // The member was deliberately left unverified by the e-mail failure tests
  // above; restore that state before re-using the account here.
  await db.updateUser(user.id, { isVerified: true });
  const memberAfterDrops = await post("login", credentials);
  assert.equal(memberAfterDrops.status, 200, "an ordinary member signs in without the entitlement/usage tables");
  assert.equal((await memberAfterDrops.json()).membership.plan_id, "free", "a member with no readable subscription falls back to Free");
  const memberCookie = String(memberAfterDrops.headers.get("set-cookie") || "").split(";")[0];

  /* The reads themselves throwing (not just their tables being absent) is
   * isolated the same way. */
  for (const [method, message] of [
    ["findActiveSubscriptionByUserId", "no such table: subscriptions"],
    ["findMembershipByUserId", "no such table: memberships"],
    ["findAndSweepActiveComplimentaryGrant", "no such table: complimentary_grants"],
    ["listUsageSince", "no such table: usage_records"],
  ] as const) {
    const original = (db as any)[method];
    (db as any)[method] = async () => {
      throw new Error(message);
    };
    try {
      assert.equal(
        (await fetch(`${base}/api/auth/session`, { headers: { Cookie: ownerCookie } })).status,
        200,
        `a ${method} failure must not break GET /api/auth/session`,
      );
      assert.equal(
        (await fetch(`${base}/api/auth/session`, { headers: { Cookie: memberCookie } })).status,
        200,
        `a ${method} failure must not break a member's session restore`,
      );
    } finally {
      (db as any)[method] = original;
    }
  }

  // Changing the configured owner address invalidates the previous owner's
  // admin session; the replacement follows the same verified-email route.
  process.env.SCENERING_OWNER_EMAIL = "custom-owner@example.com";
  const staleOwnerSession = await fetch(`${base}/api/admin/overview`, { headers: { Cookie: String(ownerLogin.headers.get("set-cookie") || "").split(";")[0] } });
  assert.equal(staleOwnerSession.status, 403, "a previous owner loses admin access after the configured address changes");
  const customOwner = await post("register", { email: "custom-owner@example.com", password: credentials.password, displayName: "Custom Owner" });
  assert.equal(customOwner.status, 201);
  assert.equal((await db.findUserByEmail("custom-owner@example.com"))?.role, "user");
  await verify(emailedLink());
  assert.equal((await db.findUserByEmail("custom-owner@example.com"))?.role, "admin");

  const signIn = readFileSync(new URL("../src/studio/SignIn.tsx", import.meta.url), "utf8");
  assert.ok(signIn.includes('minLength={mode === "register" ? 10 : undefined}'));
  const shortPassword = await post("register", { email: "short@example.com", password: "short", displayName: "Short Password" });
  assert.equal(shortPassword.status, 400);
  console.log("PASS production auth: verified owner promotion, session hardening, billing repair and failure isolation");
} finally {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
