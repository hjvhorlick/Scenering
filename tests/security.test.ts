import { readFileSync } from "node:fs";
import { createHarness } from "./harness";

const h = createHarness();
const platform = readFileSync("server/platform.ts", "utf8");
const server = readFileSync("server.ts", "utf8");
const keys = readFileSync("src/lib/api-keys.ts", "utf8");
const terms = readFileSync("src/marketing/legal-content.ts", "utf8");
const publicPage = readFileSync("src/marketing/PublicPage.tsx", "utf8");
const license = readFileSync("LICENSE", "utf8");

h.ok(platform.includes("SESSION_SECRET must be a unique production secret"), "production rejects missing or weak session secrets");
h.ok(platform.includes("timingSafeEqual"), "secret comparisons use timing-safe equality");
h.ok(platform.includes("HttpOnly; SameSite=Lax"), "session cookie is HttpOnly and SameSite protected");
h.ok(platform.includes("checkout[custom][user_id]"), "checkout binds provider custom data to authenticated user");
h.ok(platform.includes("SCENERING_OWNER_EMAIL") && platform.includes("requireAdmin"), "owner administration is bound to a server-configured email and protected role");
h.ok(platform.includes('"/api/admin/overview"'), "owner has a protected operational overview endpoint");
const accountUi = readFileSync("src/components/AccountMembershipModal.tsx", "utf8");
const sessionUi = readFileSync("src/lib/session.ts", "utf8");
h.ok(accountUi.includes("Preview the Studio as a customer plan") && accountUi.includes("setAdminPlanPreview"), "owner administration can preview Free, SceneFlow and SceneForge interfaces");
h.ok(sessionUi.includes("scenering_admin_plan_preview") && sessionUi.includes('account?.user.role !== "admin"'), "plan preview is session-scoped and restricted to the owner administrator interface");
h.ok(platform.includes('"/api/admin/complimentary-memberships"') && platform.includes("ComplimentaryGrant"), "owner can issue audited expiring complimentary memberships");
h.ok(platform.includes("setUTCMonth") && platform.includes("setUTCFullYear"), "complimentary periods are exactly one calendar month or year");
h.ok(platform.includes('"/api/admin/complimentary-codes"') && platform.includes('"/api/complimentary-codes/redeem"'), "owner can create and customers can redeem access codes");
h.ok(
  platform.includes("codeHash: hashToken(raw)") && readFileSync("src/db.ts", "utf8").includes("SET status = 'redeemed'"),
  "access codes are stored hashed and become single-use after redemption"
);
h.ok(platform.includes('const period = "year" as const'), "access codes always grant one year rather than a selectable month");
h.ok(platform.includes("unknown_variant"), "unknown billing variants grant no membership");
h.ok(server.includes("Cross-origin request rejected"), "state-changing browser requests have origin enforcement");
for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy"]) h.ok(server.includes(header), `${header} is configured`);
h.ok(server.includes("allowedImageHost"), "image proxy has an explicit host allowlist");
h.ok(server.includes('parsed.protocol !== "https:"'), "image proxy accepts only HTTPS upstreams");
h.ok(server.includes("Unsafe image redirect"), "image proxy revalidates redirects");
const speechifyClient = readFileSync("src/lib/speechify-client.ts", "utf8");
h.ok(!server.includes("/api/tts") && !server.includes("X-Speechify-Key") && speechifyClient.includes("https://api.speechify.ai/v1"), "Speechify BYOK requests bypass the Worker and go directly from the browser to the provider");
h.ok(server.includes("ownerId") && server.includes("randomBytes(18)"), "uploaded audio uses account ownership and cryptographic ids");
const supabaseClient = readFileSync("src/lib/supabase.ts", "utf8");
h.ok(supabaseClient.includes('EDGE_FUNCTION_BASE = "/api"'), "client cannot bypass the authenticated server through legacy Edge Functions");
h.ok(readFileSync("supabase/config.toml", "utf8").match(/verify_jwt = true/g)?.length === 3, "legacy Edge Functions require JWTs and are decommissioned");
h.ok(platform.includes('final-export/reserve') && platform.includes('final-export/complete'), "final exports use two-phase server reservations");
h.ok(platform.includes("parseCreativeManifest") && platform.includes("validateExportCreativeManifest"), "final-export authorization validates the selected creative catalog server-side");
h.ok(platform.includes("finalExportsPerWeek") && !platform.includes("finalExportMinutesPerWeek"), "paid final-export authorization uses weekly download counts rather than render minutes");
const render = readFileSync("src/components/RenderView.tsx", "utf8");
h.ok(render.includes("reserveFinalExport") && render.includes("completeFinalExport"), "renderer authorizes and completes usage before exposing final output");
h.ok(render.includes("getEntitlements(true)") && render.includes("ENTITLEMENT") === false, "final render reloads authoritative feature entitlements");
h.ok(!keys.includes('params.set("pexels_key"') && !keys.includes('params.set("pixabay_key"'), "provider keys are not placed in URLs");
h.ok(license.includes("Henry John Vincent Horlick") && license.includes("All rights reserved"), "proprietary licence identifies the owner");
h.ok(terms.includes('LEGAL_OWNER = "Henry John Vincent Horlick"'), "legal content identifies the owner");
h.ok(terms.includes("created and owned by ${LEGAL_OWNER}"), "public terms state application ownership");
h.ok(publicPage.includes("LEGAL_DOCUMENTS"), "PublicPage renders the legal document registry");
h.ok(readFileSync("SECURITY.md", "utf8").includes("browser is **not a trusted security boundary**"), "security policy records the browser-renderer limitation");
h.done("security and ownership");
