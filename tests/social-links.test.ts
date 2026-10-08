/**
 * Configurable social links: the owner saves profile URLs once, and the
 * original-style YouTube, Facebook, LinkedIn and X icons appear on the public
 * website and in the app.
 *
 * Like the billing suite, this runs against a real Express app with a
 * throwaway data directory, so the assertions cover behaviour: who may save
 * links, which URLs are rejected, and that a saved link survives a restart
 * (the same JSON store the rest of the platform uses). A handful of source
 * checks then pin the rendering side — the brand icons exist and the strip is
 * mounted in both footers, the corner menu and the administration panel.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Read the sources before moving house: the platform module fixes its data
   directory from the working directory at import time. */
const socialSource = readFileSync(join(repoRoot, "src/shared/SocialLinks.tsx"), "utf8");
const marketingSource = readFileSync(join(repoRoot, "src/marketing/MarketingSite.tsx"), "utf8");
const publicPageSource = readFileSync(join(repoRoot, "src/marketing/PublicPage.tsx"), "utf8");
const cornerMenuSource = readFileSync(join(repoRoot, "src/shared/SiteCornerMenu.tsx"), "utf8");
const modalSource = readFileSync(join(repoRoot, "src/components/AccountMembershipModal.tsx"), "utf8");

process.chdir(mkdtempSync(join(tmpdir(), "scenering-social-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.SCENERING_OWNER_EMAIL = "owner@example.com";

const express = (await import("express")).default;
/* Cloudflare bindings (D1/KV/R2) faked in-memory with real SQLite, so the
   suite runs the same server code the Worker runs. */
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");

const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

async function createSignedInUser(email: string, displayName: string) {
  const registration = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, displayName, password: "a-long-enough-password" }) });
  const registered = await registration.json();
  const token = String(registered.developmentVerificationUrl || "").split("token=")[1] || "";
  await fetch(`${base}/api/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: decodeURIComponent(token) }) });
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-enough-password" }) });
  return String(login.headers.get("set-cookie") || "").split(";")[0];
}

const ownerCookie = await createSignedInUser("owner@example.com", "Site Owner");
const customerCookie = await createSignedInUser("customer@example.com", "Ordinary Customer");

/* ------------------------------------------------------------------ */
/* 1. Reading is public, and starts empty.                             */
/* ------------------------------------------------------------------ */
{
  const response = await fetch(`${base}/api/social-links`);
  h.eq(response.status, 200, "anyone can read the social links without signing in");
  const data = await response.json();
  h.eq(data.links.youtube, "", "no YouTube link is published before the owner saves one");
  h.eq(data.links.facebook, "", "no Facebook link is published before the owner saves one");
  h.eq(data.links.linkedin, "", "no LinkedIn link is published before the owner saves one");
  h.eq(data.links.x, "", "no X link is published before the owner saves one");
  h.eq(data.links.tiktok, "", "no TikTok link is published before the owner saves one");
  ok(Array.isArray(data.platforms) && data.platforms.length === 5, "the five supported platforms are listed");
  ok(data.platforms.some((platform: { id: string }) => platform.id === "tiktok"), "TikTok is one of the owner's fields");
}

/* ------------------------------------------------------------------ */
/* 2. Only the owner administrator may save links.                     */
/* ------------------------------------------------------------------ */
{
  const anonymous = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtube: "https://www.youtube.com/@scenering" }) });
  h.eq(anonymous.status, 401, "saving social links requires a session");
  const customer = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: customerCookie }, body: JSON.stringify({ youtube: "https://www.youtube.com/@scenering" }) });
  h.eq(customer.status, 403, "an ordinary customer cannot save social links");
}

/* ------------------------------------------------------------------ */
/* 3. Bad URLs are refused with a reason naming the field.             */
/* ------------------------------------------------------------------ */
{
  const plainHttp = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ownerCookie }, body: JSON.stringify({ youtube: "http://www.youtube.com/@scenering" }) });
  h.eq(plainHttp.status, 400, "an http:// link is refused");
  ok(String((await plainHttp.json()).error || "").includes("YouTube"), "the http error names the YouTube field");

  const wrongHost = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ownerCookie }, body: JSON.stringify({ linkedin: "https://example.com/company/scenering" }) });
  h.eq(wrongHost.status, 400, "a LinkedIn link on a foreign domain is refused");

  const wrongTikTok = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ownerCookie }, body: JSON.stringify({ tiktok: "https://example.com/@scenering" }) });
  h.eq(wrongTikTok.status, 400, "a TikTok link on a foreign domain is refused");
  const notAUrl = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ownerCookie }, body: JSON.stringify({ facebook: "scenering on facebook" }) });
  h.eq(notAUrl.status, 400, "free text is refused for the Facebook field");

  const lookalike = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ownerCookie }, body: JSON.stringify({ youtube: "https://youtube.com.evil.example/watch" }) });
  h.eq(lookalike.status, 400, "a lookalike domain that merely starts with youtube.com is refused");
}

/* ------------------------------------------------------------------ */
/* 4. The owner saves links; everyone reads them back.                 */
/* ------------------------------------------------------------------ */
{
  const saved = await fetch(`${base}/api/admin/social-links`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      youtube: "https://www.youtube.com/@scenering",
      facebook: "https://www.facebook.com/scenering",
      linkedin: "https://www.linkedin.com/company/scenering",
      x: "https://twitter.com/scenering",
      tiktok: "https://www.tiktok.com/@scenering",
    }),
  });
  h.eq(saved.status, 200, "the owner can save every link, TikTok included");
  const data = await saved.json();
  h.eq(data.links.youtube, "https://www.youtube.com/@scenering", "the YouTube link is stored as pasted");
  ok(data.links.x.startsWith("https://twitter.com/"), "a twitter.com address is accepted for X");
  h.eq(data.links.tiktok, "https://www.tiktok.com/@scenering", "the TikTok link is stored as pasted");

  const read = await (await fetch(`${base}/api/social-links`)).json();
  h.eq(read.links.facebook, "https://www.facebook.com/scenering", "a visitor reads the saved Facebook link");

  const stored = JSON.parse(String((testD1().sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'social_links'").get() as { value: string } | undefined)?.value ?? "{}"));
  h.eq(stored.linkedin, "https://www.linkedin.com/company/scenering", "the links persist in the platform store (D1), not in memory");
  ok(Boolean(stored.updated_at), "the save is timestamped");

  /* An address copied from a browser bar often has no scheme. That must be
     treated as https, not rejected as a typo. */
  const schemeless = await fetch(`${base}/api/admin/social-links`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ownerCookie }, body: JSON.stringify({ youtube: "www.youtube.com/@scenering" }) });
  h.eq(schemeless.status, 200, "an address pasted without https:// is accepted");
  h.eq((await schemeless.json()).links.youtube, "https://www.youtube.com/@scenering", "the missing https:// prefix is added, not rejected");
}

/* ------------------------------------------------------------------ */
/* 5. Clearing a field hides that icon again.                          */
/* ------------------------------------------------------------------ */
{
  const cleared = await fetch(`${base}/api/admin/social-links`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ youtube: "", facebook: "https://www.facebook.com/scenering", linkedin: "", x: "" }),
  });
  h.eq(cleared.status, 200, "the owner can clear links by saving empty fields");
  const read = await (await fetch(`${base}/api/social-links`)).json();
  h.eq(read.links.youtube, "", "a cleared YouTube link is no longer published");
  h.eq(read.links.facebook, "https://www.facebook.com/scenering", "the remaining link is untouched");
}

server.close();

/* ------------------------------------------------------------------ */
/* 6. The rendering side: original marks, mounted everywhere promised. */
/* ------------------------------------------------------------------ */
ok(socialSource.includes("M23.498 6.186"), "the YouTube icon uses the original play-button path");
ok(socialSource.includes("#FF0000"), "the YouTube icon keeps its brand red");
ok(socialSource.includes("M24 12.073"), "the Facebook icon uses the original 'f' path");
ok(socialSource.includes("#1877F2"), "the Facebook icon keeps its brand blue");
ok(socialSource.includes("M20.447 20.452"), "the LinkedIn icon uses the original 'in' path");
ok(socialSource.includes("#0A66C2"), "the LinkedIn icon keeps its brand blue");
ok(socialSource.includes("M18.244 2.25"), "the X icon uses the original wordmark path");
ok(socialSource.includes("M12.525.02"), "the TikTok icon uses the original note path");
ok(socialSource.includes('{ id: "x", label: "X", color: "currentColor", adaptive: true'), "the X mark takes the surface ink instead of a fixed grey");
ok(socialSource.includes('{ id: "tiktok", label: "TikTok", color: "currentColor", adaptive: true'), "the TikTok mark takes the surface ink instead of a fixed grey");
ok(!socialSource.includes("#E7E9EA"), "no near-white mark can end up invisible on a light header");
ok(socialSource.includes('icon.adaptive ? "currentColor" : icon.color'), "monochrome marks follow the surface; brand colours stay fixed");
ok(socialSource.includes('rel="noopener noreferrer"'), "social links open safely in a new tab");
ok(socialSource.includes("if (active.length === 0) return null"), "nothing renders until a link is configured");
ok(marketingSource.includes("<SocialLinksRow"), "the front-page footer carries the social strip");
ok(publicPageSource.includes("<SocialLinksRow"), "the standalone public pages' footer carries the social strip");
ok(cornerMenuSource.includes("<SocialLinksRow"), "the app's corner menu carries the social strip");
ok(modalSource.includes("/api/admin/social-links"), "the administration panel saves to the admin endpoint");
ok(modalSource.includes("saveSocialLinks"), "the administration panel has a save action for social links");
ok(modalSource.includes('inputMode="url"'), "the administration panel uses URL-keyboard inputs for every address");
ok(modalSource.includes("EMPTY_SOCIAL_LINKS"), "the administration form is built from the shared platform list, so a new platform needs no form edit");
ok(modalSource.includes("socialStatus"), "save feedback is shown inline, next to the save button");
ok(modalSource.includes("invalidateSocialLinks"), "a save refreshes the icons without a page reload");

h.done("social links");
