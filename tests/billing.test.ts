/**
 * Billing integration contract (FastSpring merchant of record):
 *
 * Verifies the public billing configuration endpoint, pricing & welcome page
 * checkout wiring, admin billing overview, and that Paddle has been completely
 * removed from runtime billing routes, client modules, and configuration.
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const platformSource = readFileSync(join(repoRoot, "server/platform.ts"), "utf8");
const serverSource = readFileSync(join(repoRoot, "server.ts"), "utf8");
const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const fastspringDoc = readFileSync(join(repoRoot, "FASTSPRING.md"), "utf8");
const modal = readFileSync(join(repoRoot, "src/components/AccountMembershipModal.tsx"), "utf8");
const publicPage = readFileSync(join(repoRoot, "src/marketing/PublicPage.tsx"), "utf8");
const fastspringClient = readFileSync(join(repoRoot, "src/lib/fastspring.ts"), "utf8");
const packageJson = readFileSync(join(repoRoot, "package.json"), "utf8");

const WEBHOOK_SECRET = "fastspring_billing_test_secret";
process.chdir(mkdtempSync(join(tmpdir(), "scenering-billing-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.FASTSPRING_STOREFRONT = "scenering.test.onfastspring.com/popup-scenering";
process.env.FASTSPRING_WEBHOOK_SECRET = WEBHOOK_SECRET;

const express = (await import("express")).default;
const { installTestPlatformEnv } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");

const app = express();
app.use((req, res, next) => (req.path === "/api/webhooks/fastspring" ? next() : express.json()(req, res, next)));
platform.registerFastSpringWebhook(app);
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

/* ------------------------------------------------------------------ */
/* 1. Public billing config endpoint (/api/billing/public-config).    */
/* ------------------------------------------------------------------ */
{
  const res = await fetch(`${base}/api/billing/public-config`, { headers: { "CF-IPCountry": "ZA" } });
  const body = (await res.json()) as any;
  h.eq(res.status, 200, "public billing config is readable without authentication");
  h.eq(body.provider, "fastspring", "FastSpring is the sole billing provider");
  h.eq(body.storefront, "scenering.test.onfastspring.com/popup-scenering", "public config exposes the FastSpring storefront path");
  h.eq(body.environment, "test", "public config detects test storefront environment");
  h.eq(body.checkoutMode, "popup", "public config reports popup checkout mode");
  h.eq(body.country, "ZA", "public config passes through the visitor's edge country");
  h.eq(Array.isArray(body.tiers), true, "public config exposes the pricing tiers array");
  h.eq(body.tiers.find((t: any) => t.id === "sceneflow")?.priceId?.month, "sceneflow-monthly", "SceneFlow monthly tier carries its FastSpring product path");
  h.eq(body.tiers.find((t: any) => t.id === "sceneflow")?.priceId?.year, "sceneflow-yearly", "SceneFlow annual tier carries its FastSpring product path");
  h.eq(body.tiers.find((t: any) => t.id === "sceneforge")?.priceId?.month, "sceneforge-monthly", "SceneForge monthly tier carries its FastSpring product path");
  h.eq(body.tiers.find((t: any) => t.id === "sceneforge")?.priceId?.year, "sceneforge-yearly", "SceneForge annual tier carries its FastSpring product path");

  /* Without FASTSPRING_STOREFRONT, public-config returns 503 FASTSPRING_NOT_CONFIGURED. */
  const savedStorefront = process.env.FASTSPRING_STOREFRONT;
  delete process.env.FASTSPRING_STOREFRONT;
  const unconfiguredRes = await fetch(`${base}/api/billing/public-config`);
  const unconfigured = await unconfiguredRes.json() as any;
  h.eq(unconfiguredRes.status, 503, "without FASTSPRING_STOREFRONT public config returns 503");
  h.eq(unconfigured.code, "FASTSPRING_NOT_CONFIGURED", "and names FASTSPRING_NOT_CONFIGURED");
  process.env.FASTSPRING_STOREFRONT = savedStorefront;
}

/* ------------------------------------------------------------------ */
/* 2. FastSpring webhook & checkout wiring.                           */
/* ------------------------------------------------------------------ */
{
  const cfg = platform.billingConfiguration();
  h.eq(cfg.provider, "fastspring", "billingConfiguration returns FastSpring configuration");
  h.eq(cfg.webhookPath, "/api/webhooks/fastspring", "webhookPath is /api/webhooks/fastspring");
  h.eq(cfg.webhookUrl, "https://scenering.test/api/webhooks/fastspring", "webhookUrl uses PUBLIC_APP_URL");
  h.eq(cfg.ready, true, "billingConfiguration is ready");

  const payload = JSON.stringify({
    events: [
      {
        id: "evt-billing-1",
        live: false,
        processed: false,
        type: "order.completed",
        created: Date.now(),
        data: { id: "ord_1" },
      },
    ],
  });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(Buffer.from(payload, "utf8")).digest("base64");
  const wh = await fetch(`${base}/api/webhooks/fastspring`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FS-Signature": sig },
    body: payload,
  });
  h.eq(wh.status, 200, "signed FastSpring webhook delivery is accepted");
}

/* ------------------------------------------------------------------ */
/* 3. Paddle removal & FastSpring-only architecture invariants.       */
/* ------------------------------------------------------------------ */
{
  h.eq(existsSync(join(repoRoot, "src/lib/paddle.ts")), false, "src/lib/paddle.ts has been removed");
  h.eq(existsSync(join(repoRoot, "PADDLE.md")), false, "PADDLE.md has been removed");
  h.eq(existsSync(join(repoRoot, "LIVE_MIGRATION.md")), false, "LIVE_MIGRATION.md has been removed");
  h.eq(existsSync(join(repoRoot, "migrations/0006_paddle.sql")), false, "0006_paddle.sql was renamed to 0006_billing.sql");
  h.eq(existsSync(join(repoRoot, "migrations/0006_billing.sql")), true, "0006_billing.sql exists");
  h.eq(packageJson.includes("@paddle/paddle-js"), false, "@paddle/paddle-js dependency has been removed from package.json");
  h.eq(/paddle/i.test(serverSource), false, "server.ts has zero Paddle references");
  h.eq(/paddle/i.test(platformSource), false, "server/platform.ts has zero Paddle references");
  h.eq(/paddle/i.test(envExample), false, ".env.example has zero Paddle references");
  h.eq(/paddle/i.test(readme), false, "README.md has zero Paddle references");
  h.eq(/paddle/i.test(fastspringDoc), false, "FASTSPRING.md has zero Paddle references");
  h.eq(/paddle/i.test(modal), false, "AccountMembershipModal.tsx has zero Paddle references");
  h.eq(/paddle/i.test(publicPage), false, "PublicPage.tsx has zero Paddle references");
  h.ok(publicPage.includes("openFastSpringPopup"), "PublicPage.tsx opens FastSpring popup checkout");
  h.ok(modal.includes("openFastSpringPopup"), "AccountMembershipModal.tsx opens FastSpring popup checkout");
  h.ok(fastspringClient.includes("sbl.onfastspring.com/sbl/1.0.6/fastspring-builder.min.js"), "src/lib/fastspring.ts loads the official FastSpring Store Builder Library");
}

server.close();
h.done("billing");
