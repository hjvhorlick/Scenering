import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { installTestPlatformEnv, testD1 } from "./platform-env.ts";

process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "production-auth-test-secret-not-for-deployment";
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "test-only-key";
delete process.env.SCENERING_OWNER_EMAIL;
delete process.env.DEV_SANDBOX_AUTO_PROVISION;
installTestPlatformEnv();
const { db } = await import("../src/db.ts");
const { registerPlatformRoutes, resolveFastSpringCustomerForUser } = await import("../server/platform.ts");

// Successful delivery is essential: the old production code only returned a
// verification URL when delivery failed. Never send real email in this test.
const realFetch = globalThis.fetch;
let deliveries = 0;
let failDelivery = false;
globalThis.fetch = (async (input, init) => {
  if (String(input) === "https://api.resend.com/emails") {
    deliveries++;
    return failDelivery
      ? new Response("Unavailable", { status: 503 })
      : Response.json({ id: `test-email-${deliveries}` });
  }
  return realFetch(input, init);
}) as typeof fetch;

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
  const registration = await post("register", { ...credentials, displayName: "Preview User" });
  assert.equal(registration.status, 201);
  const registered = await registration.json();
  assert.ok(registered.developmentVerificationUrl);
  assert.equal(deliveries, 1);
  await verify(registered.developmentVerificationUrl);
  const user = await db.findUserByEmail(credentials.email);
  assert.ok(user);
  assert.equal(user.role, "user");

  // Every billing customer entry point independently repairs an unmigrated DB.
  testD1().sqlite.exec("DROP TABLE billing_customers");
  assert.equal(await db.findBillingCustomerByUser(user.id, user.email), null);
  testD1().sqlite.exec("DROP TABLE billing_customers");
  assert.equal(await db.findBillingCustomer("acct_test"), null);
  testD1().sqlite.exec("DROP TABLE billing_customers");
  const mapping = { provider: "fastspring", providerCustomerId: "acct_test", userId: user.id, email: user.email, lastEventAt: "2026-10-19T00:00:00Z" };
  await db.upsertBillingCustomer(mapping);
  await db.upsertBillingCustomer({ ...mapping, email: "stale@example.com", lastEventAt: "2026-10-18T00:00:00Z" });
  assert.equal((await db.findBillingCustomer("acct_test"))?.email, user.email);
  assert.equal((await db.findBillingCustomerByUser(user.id))?.providerCustomerId, "acct_test");
  assert.equal((await resolveFastSpringCustomerForUser(user))?.accountId, "acct_test");
  assert.ok(testD1().sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_billing_customers_user'").get());

  // Login and session reads also work when the customer table is absent.
  testD1().sqlite.exec("DROP TABLE billing_customers");
  const login = await post("login", credentials);
  assert.equal(login.status, 200);
  const cookie = String(login.headers.get("set-cookie")).split(";")[0];
  testD1().sqlite.exec("DROP TABLE billing_customers");
  assert.equal((await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200);

  const findCustomer = db.findBillingCustomerByUser;
  db.findBillingCustomerByUser = async () => { throw new Error("D1 schema unavailable"); };
  try {
    assert.equal(await resolveFastSpringCustomerForUser(user), null);
    assert.equal((await post("login", credentials)).status, 200);
    assert.equal((await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200);
  } finally {
    db.findBillingCustomerByUser = findCustomer;
  }
  const listSubscriptions = db.listSubscriptionsForUser;
  db.listSubscriptionsForUser = async () => { throw new Error("no such table: subscriptions"); };
  try {
    assert.equal(await resolveFastSpringCustomerForUser(user), null);
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
  assert.ok(unverifiedBody.developmentVerificationUrl);
  assert.equal(deliveries, 2);
  await verify(unverifiedBody.developmentVerificationUrl);
  assert.equal((await post("login", credentials)).status, 200);

  failDelivery = true;
  await db.updateUser(user.id, { isVerified: false });
  const failedEmailLogin = await post("login", credentials);
  assert.equal(failedEmailLogin.status, 403);
  await verify((await failedEmailLogin.json()).developmentVerificationUrl);
  const failedEmailRegistration = await post("register", { email: "no-mail@example.com", password: credentials.password, displayName: "No Mail" });
  assert.equal(failedEmailRegistration.status, 201);
  await verify((await failedEmailRegistration.json()).developmentVerificationUrl);
  failDelivery = false;

  const ownerRegistration = await post("register", { email: "hjvhorlick@gmail.com", password: credentials.password, displayName: "Owner" });
  assert.equal(ownerRegistration.status, 201);
  const owner = await db.findUserByEmail("hjvhorlick@gmail.com");
  assert.equal(owner?.role, "admin");
  assert.equal((await db.findMembershipByUserId(owner!.id))?.plan, "sceneforge");
  process.env.SCENERING_OWNER_EMAIL = "custom-owner@example.com";
  const customOwner = await post("register", { email: "custom-owner@example.com", password: credentials.password, displayName: "Custom Owner" });
  assert.equal(customOwner.status, 201);
  assert.equal((await db.findUserByEmail("custom-owner@example.com"))?.role, "admin");

  const signIn = readFileSync(new URL("../src/studio/SignIn.tsx", import.meta.url), "utf8");
  assert.ok(signIn.includes('minLength={mode === "register" ? 10 : undefined}'));
  const shortPassword = await post("register", { email: "short@example.com", password: "short", displayName: "Short Password" });
  assert.equal(shortPassword.status, 400);
  console.log("PASS production auth: inline verification, owner defaults, billing repair and failure isolation");
} finally {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
