/**
 * Configurable store notice banner:
 * - Strategically placed beneath the top navigation bar across the front pages;
 * - Defaults to an enabled launch notice stating that the web application is
 *   not quite finished yet and will be live soon;
 * - Editable and toggleable by the owner administrator inside Owner
 *   administration and the Email Centre dashboard, persisted in D1 (`admin_settings`).
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const storeNoticeSource = readFileSync(join(repoRoot, "src/shared/StoreNotice.tsx"), "utf8");
const marketingSource = readFileSync(join(repoRoot, "src/marketing/MarketingSite.tsx"), "utf8");
const publicPageSource = readFileSync(join(repoRoot, "src/marketing/PublicPage.tsx"), "utf8");
const signInSource = readFileSync(join(repoRoot, "src/studio/SignIn.tsx"), "utf8");
const modalSource = readFileSync(join(repoRoot, "src/components/AccountMembershipModal.tsx"), "utf8");
const emailCentreSource = readFileSync(join(repoRoot, "src/admin/EmailCentre.tsx"), "utf8");

process.chdir(mkdtempSync(join(tmpdir(), "scenering-store-notice-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.SCENERING_OWNER_EMAIL = "owner@example.com";

const express = (await import("express")).default;
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");
const { DEFAULT_STORE_NOTICE } = await import("../src/config/store-notice.ts");

const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

async function createSignedInUser(email: string, displayName: string) {
  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, displayName, password: "a-long-enough-password" }),
  });
  const registered = await registration.json();
  const token = String(registered.developmentVerificationUrl || "").split("token=")[1] || "";
  await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: decodeURIComponent(token) }),
  });
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "a-long-enough-password" }),
  });
  return String(login.headers.get("set-cookie") || "").split(";")[0];
}

const ownerCookie = await createSignedInUser("owner@example.com", "Site Owner");
const customerCookie = await createSignedInUser("customer@example.com", "Ordinary Customer");

/* ------------------------------------------------------------------ */
/* 1. Public reading defaults to the active "not finished yet" notice */
/* ------------------------------------------------------------------ */
{
  const response = await fetch(`${base}/api/store-notice`);
  h.eq(response.status, 200, "anyone can read the store notice without signing in");
  const data = await response.json();
  h.eq(data.notice.enabled, true, "the store notice is enabled by default");
  h.eq(data.notice.badge, DEFAULT_STORE_NOTICE.badge, "the default badge is returned");
  h.eq(data.notice.message, DEFAULT_STORE_NOTICE.message, "the default unfinished-app notice is returned");
  ok(/not quite finished|live soon/i.test(data.notice.message), "default notice states the web application is not finished yet and will be live soon");
}

/* ------------------------------------------------------------------ */
/* 2. Only the owner administrator may edit the store notice          */
/* ------------------------------------------------------------------ */
{
  const anonymous = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true, badge: "Notice", message: "Updated notice" }),
  });
  h.eq(anonymous.status, 401, "saving the store notice requires a session");

  const customer = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({ enabled: true, badge: "Notice", message: "Updated notice" }),
  });
  h.eq(customer.status, 403, "an ordinary customer cannot edit the store notice");
}

/* ------------------------------------------------------------------ */
/* 3. Validation rejects empty enabled messages and oversized text    */
/* ------------------------------------------------------------------ */
{
  const emptyEnabled = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ enabled: true, badge: "Store Notice", message: "   " }),
  });
  h.eq(emptyEnabled.status, 400, "an enabled notice with an empty message is refused");

  const longBadge = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ enabled: true, badge: "B".repeat(50), message: "Valid message" }),
  });
  h.eq(longBadge.status, 400, "an overly long badge is refused");

  const longMessage = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ enabled: true, badge: "Notice", message: "M".repeat(300) }),
  });
  h.eq(longMessage.status, 400, "an overly long message is refused");
}

/* ------------------------------------------------------------------ */
/* 4. The owner updates and toggles the notice; D1 persists it        */
/* ------------------------------------------------------------------ */
{
  const saved = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      enabled: true,
      badge: "Launch Update",
      message: "Scenering is in final pre-launch testing and will open fully very soon.",
    }),
  });
  h.eq(saved.status, 200, "the owner can update the store notice");
  const data = await saved.json();
  h.eq(data.notice.badge, "Launch Update", "updated badge is returned");
  h.eq(data.notice.message, "Scenering is in final pre-launch testing and will open fully very soon.", "updated message is returned");

  const publicRead = await (await fetch(`${base}/api/store-notice`)).json();
  h.eq(publicRead.notice.message, "Scenering is in final pre-launch testing and will open fully very soon.", "visitors read the updated store notice");

  const stored = JSON.parse(
    String(
      (
        testD1()
          .sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'store_notice'")
          .get() as { value: string } | undefined
      )?.value ?? "{}",
    ),
  );
  h.eq(stored.badge, "Launch Update", "the store notice persists in D1 admin_settings");
  ok(Boolean(stored.updated_at), "the save is timestamped");

  const disabled = await fetch(`${base}/api/admin/store-notice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      enabled: false,
      badge: "Launch Update",
      message: "",
    }),
  });
  h.eq(disabled.status, 200, "the owner can hide the store notice");
  const afterDisable = await (await fetch(`${base}/api/store-notice`)).json();
  h.eq(afterDisable.notice.enabled, false, "disabled state is returned to visitors");
}

/* ------------------------------------------------------------------ */
/* 5. Login & session resilience for admin and test accounts          */
/* ------------------------------------------------------------------ */
{
  // (a) Header-based session token works without cookies (sandbox iframe support)
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@example.com", password: "a-long-enough-password" }),
  });
  h.eq(loginRes.status, 200, "owner login succeeds");
  const loginBody = await loginRes.json();
  ok(typeof loginBody.sessionToken === "string" && loginBody.sessionToken.length > 20, "login returns a sessionToken for cookie-blocked sandbox previews");

  const sessionViaHeader = await fetch(`${base}/api/auth/session`, {
    headers: { "X-Scenering-Session": loginBody.sessionToken },
  });
  h.eq(sessionViaHeader.status, 200, "/api/auth/session authenticates via X-Scenering-Session header without Cookie");
  const sessionBody = await sessionViaHeader.json();
  h.eq(sessionBody.user.role, "admin", "header-authenticated owner session carries admin role");

  // (b) If the owner account was left unverified in D1, signing in with valid password verifies & unlocks it
  testD1().sqlite.prepare("UPDATE users SET is_verified = 0 WHERE email = 'owner@example.com'").run();
  const ownerRecoveryLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@example.com", password: "a-long-enough-password" }),
  });
  h.eq(ownerRecoveryLogin.status, 200, "owner account is never locked out by an unverified flag when signing in with valid password");

  // (c) DEV_SANDBOX_AUTO_PROVISION=1 allows instant sign-in for test accounts in the sandbox
  process.env.DEV_SANDBOX_AUTO_PROVISION = "1";
  const sandboxTestLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sandbox-tester@example.com", password: "sandbox-test-password" }),
  });
  h.eq(sandboxTestLogin.status, 200, "sandbox auto-provision signs in a new test account on the fly");
  const sandboxTestBody = await sandboxTestLogin.json();
  h.eq(sandboxTestBody.user.email, "sandbox-tester@example.com", "test account session matches the requested email");
  h.eq(sandboxTestBody.user.role, "user", "test account gets ordinary customer role");
  delete process.env.DEV_SANDBOX_AUTO_PROVISION;
}

server.close();

/* ------------------------------------------------------------------ */
/* 6. Strategic placement on front pages & admin editing UI           */
/* ------------------------------------------------------------------ */
ok(storeNoticeSource.includes('role="region"'), "the store notice is an accessible region");
ok(storeNoticeSource.includes('aria-label="Store notice"'), "the store notice region is labelled");
ok(marketingSource.includes("<StoreNoticeBanner />"), "the home front page renders the store notice banner");
ok(publicPageSource.includes("<StoreNoticeBanner />"), "standalone public pages render the store notice banner");
ok(signInSource.includes("<StoreNoticeBanner />"), "the sign-in and registration screen renders the store notice banner");
ok(modalSource.includes("/api/admin/store-notice"), "Owner administration saves to /api/admin/store-notice");
ok(modalSource.includes("saveStoreNotice"), "Owner administration has a save action for the store notice");
ok(emailCentreSource.includes("/api/admin/store-notice"), "the Email Centre dashboard also allows editing the store notice");

h.done("store notice");
