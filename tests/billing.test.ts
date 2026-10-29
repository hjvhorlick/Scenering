/**
 * Billing contract: PayPal Sandbox is the only active subscription provider.
 * Sandbox runs on any runtime that holds the Sandbox keys, production
 * included, because the live host is the only one with a fixed public URL and
 * PayPal needs one. Live mode has no path at all, on any runtime.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHarness } from "./harness";

const h = createHarness();
const root = process.cwd();
const platformSource = readFileSync(`${root}/server/platform.ts`, "utf8");
const serverSource = readFileSync(`${root}/server.ts`, "utf8");
const paypalSource = readFileSync(`${root}/server/paypal-api.ts`, "utf8");
const modal = readFileSync(`${root}/src/components/AccountMembershipModal.tsx`, "utf8");
const paypalDialog = readFileSync(`${root}/src/components/PayPalSubscriptionDialog.tsx`, "utf8");
const publicPage = readFileSync(`${root}/src/marketing/PublicPage.tsx`, "utf8");
const appHtml = readFileSync(`${root}/index.html`, "utf8");

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.PAYPAL_ENVIRONMENT = "sandbox";
process.env.PAYPAL_CLIENT_ID = "sandbox-public-client-id";
process.env.PAYPAL_CLIENT_SECRET = "server-only-test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID = "P-SF-MONTH";
process.env.PAYPAL_SCENEFLOW_YEARLY_PLAN_ID = "P-SF-YEAR";
process.env.PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID = "P-SG-MONTH";
process.env.PAYPAL_SCENEFORGE_YEARLY_PLAN_ID = "P-SG-YEAR";

const express = (await import("express")).default;
const { installTestPlatformEnv } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");
const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const configResponse = await fetch(`${base}/api/billing/public-config`);
const config = await configResponse.json() as any;
h.eq(configResponse.status, 200, "public plan configuration is readable without authentication");
h.eq(config.provider, "paypal", "PayPal is the subscription provider");
h.eq(config.environment, "sandbox", "public config is explicitly Sandbox-only");
h.eq(config.currency, "USD", "subscription prices use the unchanged USD catalogue");
h.eq(config.tiers.find((tier: any) => tier.id === "sceneflow")?.planId.monthly, "P-SF-MONTH", "public catalogue exposes the configured SceneFlow Sandbox plan ID");
h.eq(config.tiers.find((tier: any) => tier.id === "sceneforge")?.planId.yearly, "P-SG-YEAR", "public catalogue exposes the configured SceneForge Sandbox plan ID");
h.eq(JSON.stringify(config).includes("server-only-test-secret"), false, "the public config never exposes the PayPal Client Secret");

const webhookResponse = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "evt-unconfigured" }) });
h.eq(webhookResponse.status, 503, "unconfigured Sandbox webhook fails closed");
const staleCheckout = await fetch(`${base}/api/billing/checkout/sceneflow/monthly`);
h.eq(staleCheckout.status, 404, "the former generic checkout route is no longer registered");

const configuration = platform.billingConfiguration();
h.eq(configuration.provider, "paypal", "admin billing configuration reports PayPal only");
h.eq(configuration.webhookPath, "/api/webhooks/paypal", "admin configuration reports the PayPal callback path");
h.eq(configuration.webhookUrl, "https://scenering.test/api/webhooks/paypal", "callback candidate is formed from the configured app origin");
/* The webhook is deliberately not required for checkout: approval is verified
 * by reading the subscription back from PayPal, so the Sandbox can be tested
 * before any webhook is registered. A missing Credential still closes it. */
h.eq(configuration.webhookIdSet, false, "admin configuration reports the unset Sandbox webhook id");
/* The webhook is deliberately not required: approval is verified by reading
 * the subscription back from PayPal, so a checkout can be tested before any
 * Sandbox webhook is registered. */
h.eq(configuration.ready, true, "credentials and plan ids are enough — an unregistered webhook does not block checkout");
h.ok(configuration.warnings.some((item: string) => item.includes("PAYPAL_WEBHOOK_ID")), "the unregistered webhook is still reported as outstanding");
{
  const clientId = process.env.PAYPAL_CLIENT_ID;
  process.env.PAYPAL_CLIENT_ID = "";
  h.eq(platform.billingConfiguration().ready, false, "missing Sandbox credentials keep checkout unready");
  process.env.PAYPAL_CLIENT_ID = clientId;
  const plans = ["PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID", "PAYPAL_SCENEFLOW_YEARLY_PLAN_ID", "PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID", "PAYPAL_SCENEFORGE_YEARLY_PLAN_ID"]
    .map((name) => [name, process.env[name]] as const);
  for (const [name] of plans) process.env[name] = "";
  h.eq(platform.billingConfiguration().ready, false, "no Sandbox plan at all keeps checkout unready");
  h.eq(platform.billingConfiguration().plansReady, 0, "no plan slots are counted as ready");
  for (const [name, value] of plans) process.env[name] = value;
  h.eq(platform.billingConfiguration().ready, true, "restoring the configuration restores checkout");
}
h.ok(paypalDialog.includes("/api/billing/public-config"), "the PayPal dialog reads the sole public billing configuration endpoint");
h.eq(platform.billingProvider(), "paypal", "the billing-provider selector is PayPal-only");

const paypalMigration = readFileSync(`${root}/migrations/0008_paypal_billing.sql`, "utf8");
h.eq(existsSync(`${root}/migrations/0006_billing.sql`), true, "historical billing migration remains for existing databases");
h.eq(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+subscriptions\b/i.test(paypalMigration), false, "PayPal migration does not destructively clean historical subscription rows");

for (const retiredFile of ["FASTSPRING.md", "src/lib/fastspring.ts", "src/config/fastspring.ts", "tests/fastspring.test.ts"]) {
  h.eq(existsSync(`${root}/${retiredFile}`), false, `${retiredFile} has been removed`);
}
h.eq(platformSource.includes("/api/webhooks/fastspring"), false, "the server has no retired provider webhook route");
h.eq(platformSource.includes("/api/billing/fastspring/checkout"), false, "the server has no retired provider checkout alias");
h.eq(serverSource.includes("sbl.onfastspring.com"), false, "the document security policy no longer trusts the retired checkout SDK");
h.eq(publicPage.includes("openFastSpringPopup"), false, "the public pricing flow no longer opens a retired provider popup");
h.eq(modal.includes("openFastSpringPopup"), false, "the account window no longer opens a retired provider popup");
h.eq(appHtml.includes("fsc-api"), false, "the document no longer loads the retired checkout script");
h.ok(publicPage.includes("PayPal Sandbox") && modal.includes("PayPal Sandbox"), "customer pricing and account controls clearly identify Sandbox checkout");
h.ok(paypalSource.includes("PAYPAL_LIVE_DISABLED") && paypalSource.includes("api-m.sandbox.paypal.com"), "PayPal Live checkout is rejected and the API client is pinned to Sandbox");

server.close();
h.done("billing");
