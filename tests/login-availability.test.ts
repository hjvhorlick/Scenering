import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { env, setEnv } from "../src/env.ts";
import { createTestD1, createTestKV, createTestR2, installTestPlatformEnv, testD1 } from "./platform-env.ts";

const SYNTHETIC_SESSION_SECRET = "test-only-synthetic-session-secret-0123456789abcdef";
const SYNTHETIC_RESEND_KEY = "re_test_synthetic_placeholder_key_999999";

process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = SYNTHETIC_SESSION_SECRET;
process.env.PUBLIC_APP_URL = "https://scenering.example";
process.env.SCENERING_OWNER_EMAIL = "owner-admin@scenering.example";
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = SYNTHETIC_RESEND_KEY;

installTestPlatformEnv();

const { createApp } = await import("../server.ts");
const { db } = await import("../src/db.ts");
const { inspectPlatformConfiguration, redactDiagnosticError } = await import("../server/platform.ts");

let resendMode: "ok" | "http-503" | "network-error" = "ok";
const sentEmails: Array<{ to: string; subject: string; text: string; html: string }> = [];
const realFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url === "https://api.resend.com/emails") {
    if (resendMode === "network-error") {
      throw new TypeError(`Network connection failed while using Bearer ${SYNTHETIC_RESEND_KEY}`);
    }
    if (resendMode === "http-503") {
      return new Response(
        JSON.stringify({ message: `Upstream temporary outage (${SYNTHETIC_RESEND_KEY})` }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    const payload = JSON.parse(String(init?.body || "{}"));
    sentEmails.push({
      to: String(payload.to?.[0] || ""),
      subject: String(payload.subject || ""),
      text: String(payload.text || ""),
      html: String(payload.html || ""),
    });
    return new Response(JSON.stringify({ id: `email_${sentEmails.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input, init);
};

// ---------------------------------------------------------------------------
// 1. Cold-start availability: createApp() must NOT throw even if email, owner,
//    PUBLIC_APP_URL, or SESSION_SECRET are degraded on cold start.
// ---------------------------------------------------------------------------
{
  const saved = { ...process.env };
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.SCENERING_OWNER_EMAIL;
    process.env.PUBLIC_APP_URL = "not-a-valid-url";
    process.env.SESSION_SECRET = "too-short";

    const diag = inspectPlatformConfiguration();
    assert.equal(diag.ok, false);
    assert.ok(diag.issues.some((i) => i.subsystem === "session"));
    assert.ok(diag.issues.some((i) => i.subsystem === "public_url"));
    assert.ok(diag.issues.some((i) => i.subsystem === "owner"));
    assert.ok(diag.issues.some((i) => i.subsystem === "email"));

    // Must construct cleanly without throwing on cold start:
    const degradedApp = createApp();
    assert.ok(degradedApp);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
}

const app = createApp();
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

let ipCounter = 1;
function nextIp() {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

async function api(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    rawBody?: string;
    cookie?: string;
    headers?: Record<string, string>;
    ip?: string;
  } = {},
) {
  const method = options.method || (options.body !== undefined || options.rawBody !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    "cf-connecting-ip": options.ip || nextIp(),
    Origin: "https://scenering.example",
    ...(options.headers || {}),
  };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.rawBody !== undefined
      ? options.rawBody
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  assert.ok(!text.includes(SYNTHETIC_SESSION_SECRET), `response from ${path} must never leak SESSION_SECRET`);
  assert.ok(!text.includes(SYNTHETIC_RESEND_KEY), `response from ${path} must never leak RESEND_API_KEY`);
  const setCookie = response.headers.get("set-cookie") || "";
  return { status: response.status, body: json, text, setCookie, cookiePair: setCookie.split(";")[0] || "" };
}

function latestTokenFromEmail(kind: "verify-email" | "reset-password"): string {
  const last = sentEmails[sentEmails.length - 1];
  assert.ok(last, `expected outbound email containing ${kind}`);
  const re = new RegExp(`/${kind}\\?token=([^\\s"&<]+)`);
  const match = last.text.match(re) || last.html.match(re);
  assert.ok(match, `expected ${kind} token in outbound email`);
  return decodeURIComponent(match[1]);
}

try {
  // -------------------------------------------------------------------------
  // 2. Operator health & diagnostic secret redaction
  // -------------------------------------------------------------------------
  const health = await api("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.status, "ok");
  assert.deepEqual(health.body.subsystems, {
    database: true,
    auth: true,
    email: true,
    owner: true,
  });

  const redacted = redactDiagnosticError(
    new Error(
      `Failed with secret=${SYNTHETIC_SESSION_SECRET} key=${SYNTHETIC_RESEND_KEY} Bearer secret-bearer-123 https://scenering.example/verify-email?token=super_secret_verify_tok`,
    ),
  );
  assert.ok(!redacted.includes(SYNTHETIC_SESSION_SECRET));
  assert.ok(!redacted.includes(SYNTHETIC_RESEND_KEY));
  assert.ok(!redacted.includes("secret-bearer-123"));
  assert.ok(!redacted.includes("super_secret_verify_tok"));
  assert.ok(redacted.includes("[REDACTED]"));

  // Malformed JSON request body returns clean 400 JSON, never HTML or 500.
  const badJson = await api("/api/auth/login", { rawBody: '{"email": "broken"' });
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.code, "INVALID_JSON");

  // -------------------------------------------------------------------------
  // 3. Reproduce exact Version 63 & Version 64 D1 unapplied-0007 failure mode:
  //    Remote `sessions` table lacks `device_id`, `device_label`, `platform`,
  //    `last_seen_at`, AND `workspace_documents` table does not exist yet.
  // -------------------------------------------------------------------------
  testD1().sqlite.exec(`
    DROP INDEX IF EXISTS idx_sessions_user_device;
    ALTER TABLE sessions RENAME TO sessions_with_0007;
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    DROP TABLE sessions_with_0007;
    DROP TABLE IF EXISTS workspace_documents;
  `);

  const memberCredentials = {
    email: "verified-member@example.com",
    password: "correct-horse-battery-staple",
    displayName: "Verified Member",
  };
  const registeredMember = await api("/api/auth/register", { body: memberCredentials });
  assert.equal(registeredMember.status, 201);
  assert.equal(registeredMember.body.emailDelivered, true);
  assert.equal(registeredMember.body.developmentVerificationUrl, undefined);

  const verifyMember = await api("/api/auth/verify-email", {
    body: { token: latestTokenFromEmail("verify-email") },
  });
  assert.equal(verifyMember.status, 200);

  // Wrong password MUST return 401, never 500.
  const invalidLogin = await api("/api/auth/login", {
    body: { email: memberCredentials.email, password: "wrong-password-attempt" },
  });
  assert.equal(invalidLogin.status, 401);
  assert.equal(invalidLogin.body.error, "Email or password is incorrect.");

  // Verified login against unmigrated 0007 `sessions` schema self-heals and returns 200!
  const healedLogin = await api("/api/auth/login", {
    body: memberCredentials,
    headers: {
      "X-Scenering-Device": "device-laptop-001",
      "X-Scenering-Device-Label": "Studio Laptop",
      "X-Scenering-Platform": "desktop",
    },
  });
  assert.equal(healedLogin.status, 200);
  assert.equal(healedLogin.body.user.email, memberCredentials.email);
  assert.equal(healedLogin.body.sessionToken, undefined, "production never returns bearer session tokens");
  assert.match(healedLogin.setCookie, /HttpOnly/i);
  assert.match(healedLogin.setCookie, /SameSite=Lax/i);
  assert.match(healedLogin.setCookie, /Secure/i);

  // Verify the 4 missing columns were added idempotently to `sessions`.
  const sessionCols = testD1()
    .sqlite.prepare("PRAGMA table_info(sessions)")
    .all()
    .map((r: any) => String(r.name));
  for (const col of ["device_id", "device_label", "platform", "last_seen_at"]) {
    assert.ok(sessionCols.includes(col), `expected sessions.${col} to be created automatically`);
  }

  // Session check & newly mounted /api/workspace routes self-heal `workspace_documents` too!
  const sessionCheck = await api("/api/auth/session", { cookie: healedLogin.cookiePair });
  assert.equal(sessionCheck.status, 200);

  // Header bearer auth MUST be rejected in production even if DEV_EMBEDDED_PREVIEW=1 is set!
  process.env.DEV_EMBEDDED_PREVIEW = "1";
  try {
    const rawCookieValue = decodeURIComponent(healedLogin.cookiePair.split("=")[1] || "");
    const headerOnlySession = await api("/api/auth/session", {
      headers: { "X-Scenering-Session": rawCookieValue },
    });
    assert.equal(headerOnlySession.status, 401, "X-Scenering-Session header auth must remain disabled in production");
  } finally {
    delete process.env.DEV_EMBEDDED_PREVIEW;
  }

  const workspaceList = await api("/api/workspace", { cookie: healedLogin.cookiePair });
  assert.equal(workspaceList.status, 200);
  assert.deepEqual(workspaceList.body.documents, []);

  const workspaceSync = await api("/api/workspace/sync", {
    cookie: healedLogin.cookiePair,
    body: {
      documents: [{ key: "scenering_projects_v1", body: JSON.stringify([{ id: "p1", title: "Scene 1" }]), baseRevision: 0 }],
    },
  });
  assert.equal(workspaceSync.status, 200);
  assert.equal(workspaceSync.body.accepted[0].key, "scenering_projects_v1");

  // -------------------------------------------------------------------------
  // 4. Verified users can still sign in when email configuration, Resend API,
  //    PUBLIC_APP_URL, SCENERING_OWNER_EMAIL, or auxiliary billing tables fail!
  // -------------------------------------------------------------------------
  {
    const saved = { ...process.env };
    try {
      delete process.env.RESEND_API_KEY;
      process.env.EMAIL_PROVIDER = "console";
      process.env.PUBLIC_APP_URL = "not-a-valid-url";
      process.env.SCENERING_OWNER_EMAIL = "malformed-owner-value";

      // Health stays 200 with accurate boolean subsystem flags:
      const degradedHealth = await api("/api/health");
      assert.equal(degradedHealth.status, 200);
      assert.equal(degradedHealth.body.status, "ok");
      assert.deepEqual(degradedHealth.body.subsystems, {
        database: true,
        auth: true,
        email: false,
        owner: false,
      });

      // Same-host request with malformed PUBLIC_APP_URL does NOT 500 in origin guard!
      const sameHostLogin = await api("/api/auth/login", {
        body: memberCredentials,
        headers: { Origin: `http://127.0.0.1:${port}` },
      });
      assert.equal(sameHostLogin.status, 200);

      // Invalid password still returns 401, never 500:
      const badPassUnderDegradedConfig = await api("/api/auth/login", {
        body: { email: memberCredentials.email, password: "incorrect" },
        headers: { Origin: `http://127.0.0.1:${port}` },
      });
      assert.equal(badPassUnderDegradedConfig.status, 401);

      // robots.txt & sitemap.xml do not crash on malformed PUBLIC_APP_URL:
      assert.equal((await api("/robots.txt")).status, 200);
      assert.equal((await api("/sitemap.xml")).status, 200);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) delete process.env[key];
      }
      Object.assign(process.env, saved);
    }
  }

  // Verified login succeeds even when Resend API is throwing network errors or 503s:
  resendMode = "network-error";
  try {
    const loginWhileResendDown = await api("/api/auth/login", { body: memberCredentials });
    assert.equal(loginWhileResendDown.status, 200);
  } finally {
    resendMode = "ok";
  }

  // Verified login & session succeed even if auxiliary usage/subscription queries throw:
  const origListUsage = db.listUsageSince;
  const origActiveSub = db.findActiveSubscriptionByUserId;
  db.listUsageSince = async () => {
    throw new Error("D1_ERROR: auxiliary usage table unavailable");
  };
  db.findActiveSubscriptionByUserId = async () => {
    throw new Error("D1_ERROR: auxiliary subscriptions table unavailable");
  };
  try {
    const resilientLogin = await api("/api/auth/login", { body: memberCredentials });
    assert.equal(resilientLogin.status, 200);
    assert.equal(resilientLogin.body.user.email, memberCredentials.email);
  } finally {
    db.listUsageSince = origListUsage;
    db.findActiveSubscriptionByUserId = origActiveSub;
  }

  // -------------------------------------------------------------------------
  // 5. All email-dependent routes under missing/broken email configuration:
  //    Safe, specific 503/403 responses with ZERO account enumeration.
  // -------------------------------------------------------------------------
  const unverifiedEmail = "pending-verify@example.com";
  {
    const reg = await api("/api/auth/register", {
      body: { email: unverifiedEmail, password: memberCredentials.password, displayName: "Pending User" },
    });
    assert.equal(reg.status, 201);
  }

  // Mint a valid reset token BEFORE breaking email config so we can prove
  // redeeming an existing reset/verify token still works without email config!
  const resetReqBeforeOutage = await api("/api/auth/forgot-password", { body: { email: memberCredentials.email } });
  assert.equal(resetReqBeforeOutage.status, 200);
  const preIssuedResetToken = latestTokenFromEmail("reset-password");

  {
    const savedKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      // (a) Registration returns 503 EMAIL_DELIVERY_UNAVAILABLE without creating
      //     a stranded unverified user, and matches existing-user response (no enumeration):
      const regNew = await api("/api/auth/register", {
        body: { email: "brand-new@example.com", password: memberCredentials.password, displayName: "Brand New" },
      });
      const regExisting = await api("/api/auth/register", {
        body: memberCredentials,
      });
      assert.equal(regNew.status, 503);
      assert.equal(regExisting.status, 503);
      assert.equal(regNew.body.code, "EMAIL_DELIVERY_UNAVAILABLE");
      assert.deepEqual(regNew.body, regExisting.body, "register 503 must not enumerate existing accounts");
      assert.equal(await db.findUserByEmail("brand-new@example.com"), null, "must not strand an unverified account when email config is offline");

      // (b) Resend verification returns identical 503 for unverified, verified, and unknown emails:
      const resendUnverified = await api("/api/auth/resend-verification", { body: { email: unverifiedEmail } });
      const resendVerified = await api("/api/auth/resend-verification", { body: { email: memberCredentials.email } });
      const resendUnknown = await api("/api/auth/resend-verification", { body: { email: "nobody@example.com" } });
      assert.equal(resendUnverified.status, 503);
      assert.equal(resendUnverified.body.code, "EMAIL_DELIVERY_UNAVAILABLE");
      assert.deepEqual(resendUnverified.body, resendVerified.body);
      assert.deepEqual(resendUnverified.body, resendUnknown.body);

      // (c) Forgot password returns identical 503 for existing and unknown emails:
      const forgotExisting = await api("/api/auth/forgot-password", { body: { email: memberCredentials.email } });
      const forgotUnknown = await api("/api/auth/forgot-password", { body: { email: "nobody@example.com" } });
      assert.equal(forgotExisting.status, 503);
      assert.equal(forgotExisting.body.code, "EMAIL_DELIVERY_UNAVAILABLE");
      assert.deepEqual(forgotExisting.body, forgotUnknown.body);

      // (d) Unverified login returns 403 EMAIL_UNVERIFIED with emailDelivered: false (never 500, no dev URL):
      const unverifiedLogin = await api("/api/auth/login", {
        body: { email: unverifiedEmail, password: memberCredentials.password },
      });
      assert.equal(unverifiedLogin.status, 403);
      assert.equal(unverifiedLogin.body.code, "EMAIL_UNVERIFIED");
      assert.equal(unverifiedLogin.body.emailDelivered, false);
      assert.equal(unverifiedLogin.body.developmentVerificationUrl, undefined);

      // (e) Reset password with an already-issued token still works (200) without email config!
      const newPassword = "updated-horse-battery-staple-99";
      const resetComplete = await api("/api/auth/reset-password", {
        body: { token: preIssuedResetToken, password: newPassword },
      });
      assert.equal(resetComplete.status, 200);
      memberCredentials.password = newPassword;

      // Verified user can immediately sign in with the new password while email config is still offline!
      const loginAfterReset = await api("/api/auth/login", { body: memberCredentials });
      assert.equal(loginAfterReset.status, 200);
    } finally {
      process.env.RESEND_API_KEY = savedKey;
    }
  }

  // -------------------------------------------------------------------------
  // 6. Runtime Resend API failure (503 / network error) when config IS valid:
  //    Safe degraded responses and strict non-enumeration on public endpoints.
  // -------------------------------------------------------------------------
  resendMode = "http-503";
  try {
    const regDuringOutage = await api("/api/auth/register", {
      body: { email: "outage-signup@example.com", password: memberCredentials.password, displayName: "Outage User" },
    });
    assert.equal(regDuringOutage.status, 201);
    assert.equal(regDuringOutage.body.requiresVerification, true);
    assert.equal(regDuringOutage.body.emailDelivered, false);
    assert.equal(regDuringOutage.body.code, "EMAIL_DELIVERY_DEGRADED");
    assert.equal(regDuringOutage.body.developmentVerificationUrl, undefined);

    const unverifiedDuringOutage = await api("/api/auth/login", {
      body: { email: "outage-signup@example.com", password: memberCredentials.password },
    });
    assert.equal(unverifiedDuringOutage.status, 403);
    assert.equal(unverifiedDuringOutage.body.code, "EMAIL_UNVERIFIED");
    assert.equal(unverifiedDuringOutage.body.emailDelivered, false);
    assert.equal(unverifiedDuringOutage.body.developmentVerificationUrl, undefined);

    // Public forgot-password and resend-verification must remain indistinguishable
    // between existing and non-existent accounts during a runtime provider outage:
    const forgotReal = await api("/api/auth/forgot-password", { body: { email: memberCredentials.email } });
    const forgotFake = await api("/api/auth/forgot-password", { body: { email: "nonexistent-user@example.com" } });
    assert.equal(forgotReal.status, 200);
    assert.equal(forgotFake.status, 200);
    assert.deepEqual(forgotReal.body, forgotFake.body);

    const resendReal = await api("/api/auth/resend-verification", { body: { email: "outage-signup@example.com" } });
    const resendFake = await api("/api/auth/resend-verification", { body: { email: "nonexistent-user@example.com" } });
    assert.equal(resendReal.status, 200);
    assert.equal(resendFake.status, 200);
    assert.deepEqual(resendReal.body, resendFake.body);
  } finally {
    resendMode = "ok";
  }

  // -------------------------------------------------------------------------
  // 7. Missing/short SESSION_SECRET or missing DB binding:
  //    Uniform 503 (never 500, never leaks secret names, zero enumeration).
  // -------------------------------------------------------------------------
  {
    const savedSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    try {
      const loginReal = await api("/api/auth/login", { body: memberCredentials });
      const loginFake = await api("/api/auth/login", {
        body: { email: "does-not-exist@example.com", password: "any-password" },
      });
      assert.equal(loginReal.status, 503);
      assert.equal(loginFake.status, 503);
      assert.equal(loginReal.body.code, "AUTH_CONFIG_UNAVAILABLE");
      assert.deepEqual(loginReal.body, loginFake.body);
      assert.ok(!JSON.stringify(loginReal.body).includes("SESSION_SECRET"));
    } finally {
      process.env.SESSION_SECRET = savedSecret;
    }
  }

  {
    const realDbBinding = env().DB;
    setEnv(
      new Proxy(
        {
          DB: undefined,
          RATE_LIMITS: createTestKV(),
          AUDIO_BUCKET: createTestR2(),
          ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
        },
        {
          get(target, prop) {
            if (typeof prop === "string" && prop in target) return (target as any)[prop];
            return (process.env as Record<string, unknown>)[prop as string];
          },
        },
      ) as any,
    );
    try {
      const loginNoDb = await api("/api/auth/login", { body: memberCredentials });
      assert.equal(loginNoDb.status, 503);
      assert.equal(loginNoDb.body.code, "DATABASE_UNAVAILABLE");

      // Public landing endpoints and logout still succeed cleanly without DB!
      assert.equal((await api("/api/health")).status, 200);
      assert.equal((await api("/api/social-links")).status, 200);
      assert.equal((await api("/api/store-notice")).status, 200);
      assert.equal((await api("/api/auth/logout", { method: "POST", body: {} })).status, 200);
    } finally {
      setEnv(
        new Proxy(
          {
            DB: realDbBinding,
            RATE_LIMITS: createTestKV(),
            AUDIO_BUCKET: createTestR2(),
            ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
          },
          {
            get(target, prop) {
              if (typeof prop === "string" && prop in target) return (target as any)[prop];
              return (process.env as Record<string, unknown>)[prop as string];
            },
          },
        ) as any,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 8. Owner verification & revocation invariants preserved end to end
  // -------------------------------------------------------------------------
  const ownerEmail = "owner-admin@scenering.example";
  const ownerPass = "owner-correct-horse-battery-99";
  const ownerReg = await api("/api/auth/register", {
    body: { email: ownerEmail, password: ownerPass, displayName: "Configured Owner" },
  });
  assert.equal(ownerReg.status, 201);
  assert.equal((await db.findUserByEmail(ownerEmail))?.role, "user", "unverified owner starts as normal user");

  const unverifiedOwnerLogin = await api("/api/auth/login", {
    body: { email: ownerEmail, password: ownerPass },
  });
  assert.equal(unverifiedOwnerLogin.status, 403);
  assert.equal((await db.findUserByEmail(ownerEmail))?.role, "user", "failed unverified login never promotes owner");

  const verifyOwner = await api("/api/auth/verify-email", {
    body: { token: latestTokenFromEmail("verify-email") },
  });
  assert.equal(verifyOwner.status, 200);
  assert.equal((await db.findUserByEmail(ownerEmail))?.role, "admin", "verified owner receives admin role");

  const ownerLogin = await api("/api/auth/login", {
    body: { email: ownerEmail, password: ownerPass },
  });
  assert.equal(ownerLogin.status, 200);
  assert.equal(ownerLogin.body.user.role, "admin");
  assert.equal(ownerLogin.body.sessionToken, undefined);

  const adminOverviewOk = await api("/api/admin/overview", { cookie: ownerLogin.cookiePair });
  assert.equal(adminOverviewOk.status, 200);

  // Changing or clearing SCENERING_OWNER_EMAIL immediately revokes admin access (403):
  process.env.SCENERING_OWNER_EMAIL = "replacement-owner@scenering.example";
  const adminOverviewAfterChange = await api("/api/admin/overview", { cookie: ownerLogin.cookiePair });
  assert.equal(adminOverviewAfterChange.status, 403);
  assert.equal((await db.findUserByEmail(ownerEmail))?.role, "user", "previous owner role is demoted to user");

  // SignIn.tsx regression check: forgot-password checks !response.ok rather than assuming 200.
  const signInSource = readFileSync(new URL("../src/studio/SignIn.tsx", import.meta.url), "utf8");
  assert.ok(signInSource.includes("if (!response.ok) throw new Error(data.error"), "SignIn forgot-password checks !response.ok");

  console.log("PASS login availability: unmigrated 0007 D1 repair, cold-start isolation, non-enumerating 503s, and owner/cookie security");
} finally {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
