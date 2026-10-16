/**
 * Every download counts against the plan — exercised end to end.
 *
 * The owner's rule: a finished render may always be downloaded, and EVERY
 * download uses one of the plan's weekly downloads. Rendering itself is not
 * counted. The download button that sat below the render preview is gone
 * (it re-saved the in-memory video as often as you liked, uncounted); the
 * Vault is the one place a finished video is downloaded, and it asks the
 * server to count the download before the file is saved.
 *
 * Part 1 runs the real platform routes on the real migrations (in-memory
 * SQLite via platform-env.ts). Part 2 holds the render screen to the rule.
 */
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

/* Read the sources before moving house (see billing.test.ts). */
const render = read("src/components/RenderView.tsx");
const entitlementsSource = read("src/lib/entitlements.ts");
const appSource = read("src/App.tsx");
const platformSource = read("server/platform.ts");
const srcFiles: Array<{ path: string; text: string }> = [];
(function walk(dir: string) {
  for (const name of readdirSync(join(repoRoot, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(repoRoot, rel)).isDirectory()) walk(rel);
    else if (/\.(ts|tsx)$/.test(name)) srcFiles.push({ path: rel, text: read(rel) });
  }
})("src");

process.chdir(mkdtempSync(join(tmpdir(), "scenering-downloads-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
const OWNER = "owner@scenering.test";
process.env.SCENERING_OWNER_EMAIL = OWNER;

const express = (await import("express")).default;
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();

/* Real D1 is a network hop away, so parallel requests interleave between
   one query and the next. The in-memory shim answers synchronously, and
   each request then finishes before the next connection even arrives —
   which hides a "check, then insert" race completely: a counter with that
   bug passed this suite until this was added (measured: at most 3 requests
   ever in flight). So every query first waits `queryDelayMs` — a few
   milliseconds during the parallel burst below, like a network hop — and
   the 20 downloads genuinely overlap, exactly as they could in production. */
let queryDelayMs = 0;
{
  const d1 = testD1() as any;
  const realPrepare = d1.prepare.bind(d1);
  const tick = () => new Promise<void>((resolve) => (queryDelayMs > 0 ? setTimeout(resolve, queryDelayMs) : setImmediate(resolve)));
  const yielding = (statement: any): any => ({
    first: async () => { await tick(); return statement.first(); },
    all: async () => { await tick(); return statement.all(); },
    run: async () => { await tick(); return statement.run(); },
    bind: (...params: unknown[]) => yielding(statement.bind(...params)),
  });
  d1.prepare = (sql: string) => yielding(realPrepare(sql));
}
const platform = await import("../server/platform.ts");

const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

async function call(path: string, cookie: string | null, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const download = (cookie: string | null, durationMinutes: unknown, extra: Record<string, unknown> = {}) =>
  call("/api/usage/download", cookie, { durationMinutes, ...extra });

async function registerAndSignIn(email: string) {
  const registered = await call("/api/auth/register", null, { email, displayName: "Test Member", password: "a-long-enough-password" });
  const token = decodeURIComponent(String(registered.data.developmentVerificationUrl || "").split("token=")[1] || "");
  await call("/api/auth/verify-email", null, { token });
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-enough-password" }) });
  const cookie = String(login.headers.get("set-cookie") || "").split(";")[0];
  const id = (testD1().sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string }).id;
  return { cookie, id };
}
const usageRows = (userId: string) =>
  testD1().sqlite.prepare("SELECT kind, format, duration_minutes FROM usage_records WHERE user_id = ? ORDER BY created_at").all(userId) as Array<{ kind: string; format: string | null; duration_minutes: number }>;

/* ------------------------------------------------------------------ */
/* Accounts: the owner (to grant plans) and one customer per plan.     */
/* ------------------------------------------------------------------ */
const owner = await registerAndSignIn(OWNER);
const free = await registerAndSignIn("free@example.com");
const flow = await registerAndSignIn("flow@example.com");
const forge = await registerAndSignIn("forge@example.com");
for (const [customer, planId] of [[flow, "sceneflow"], [forge, "sceneforge"]] as const) {
  const grant = await call("/api/admin/complimentary-memberships", owner.cookie, { userId: customer.id, planId, period: "month", reason: "download metering test" });
  h.ok(grant.status < 300, `the owner can put a customer on ${planId} for this test`);
}
h.eq((await call("/api/entitlements", free.cookie)).data.plan, "free", "a new customer is on Free");
h.eq((await call("/api/entitlements", flow.cookie)).data.plan, "sceneflow", "the SceneFlow customer is on SceneFlow");
h.eq((await call("/api/entitlements", forge.cookie)).data.plan, "sceneforge", "the SceneForge customer is on SceneForge");

/* ------------------------------------------------------------------ */
/* 1. The counter itself.                                              */
/* ------------------------------------------------------------------ */
h.eq((await download(null, 2)).status, 401, "a signed-out download is refused — there is nobody to count it against");
for (const bad of [0, -1, "abc", 2000, null]) {
  h.eq((await download(free.cookie, bad)).status, 400, `a download with no valid length (${JSON.stringify(bad)}) is refused`);
}
h.eq(usageRows(free.id).length, 0, "refused requests record nothing");

/* Rendering is free: the render's authorisation never counts anything,
   and a render still in progress does not block downloading a finished one. */
const manifest = { features: [], voice: "speechify_male_01", captionStyle: "newsroom_clean", backgroundMusic: [], audioVisualisers: [], callsToAction: [] };
const reserved = await call("/api/usage/final-export/reserve", free.cookie, { projectId: "project-1", durationMinutes: 3, format: "long", creativeManifest: manifest });
h.eq(reserved.status, 201, "a final render is still authorised before encoding");
const midRender = await download(free.cookie, 3);
h.eq(midRender.status, 201, "a finished video can be downloaded while another render is still running");
h.eq(midRender.data.remaining?.longExports, 0, "that download used Free's one long-video download for the week");
await call("/api/usage/final-export/cancel", free.cookie, { reservationId: reserved.data.reservationId });
h.eq(usageRows(free.id).length, 1, "ending the render released its authorisation without counting a download");

const secondLong = await download(free.cookie, 3);
h.eq(secondLong.status, 403, "Free's second long-video download in a week is refused");
h.eq(secondLong.data.code, "DOWNLOAD_LIMIT_REACHED", "the refusal says why, in a form the screen can show");
h.ok(/1 Free long-video download/.test(secondLong.data.error || ""), "the refusal names the allowance that was used up");
h.ok(/Monday/.test(secondLong.data.error || ""), "the refusal says when downloads reset");
const tooLong = await download(free.cookie, 6);
h.eq(tooLong.status, 403, "a video longer than Free's 5-minute ceiling cannot be downloaded on Free");
h.ok(/up to 5 minutes/.test(tooLong.data.error || ""), "the refusal explains the length ceiling");

h.eq((await download(free.cookie, 0.75)).status, 201, "Free's first Short download of the week is allowed");
const secondShort = await download(free.cookie, 0.5);
h.eq(secondShort.status, 201, "Free's second Short download of the week is allowed");
h.eq(secondShort.data.remaining?.shortExports, 0, "and that uses both of Free's weekly Shorts downloads");
const thirdShort = await download(free.cookie, 0.5);
h.eq(thirdShort.status, 403, "Free's third Short download in a week is refused");
h.ok(/2 Free Shorts downloads/.test(thirdShort.data.error || ""), "the refusal names the Shorts allowance");
const freeRows = usageRows(free.id);
h.eq(freeRows.length, 3, "exactly the three allowed downloads were recorded — refusals record nothing");
h.ok(freeRows.every((row) => row.kind === "download"), "each recorded row is a download");
h.eq((await call("/api/account", free.cookie)).data.usage?.finalExports, 3, "the account's weekly counter shows the three downloads");

/* SceneFlow: 15 a week. Rows written by the older render-time counting
   still count, and twenty simultaneous clicks cannot overspend — the check
   and the insert are one statement. */
const legacy = testD1().sqlite.prepare("INSERT INTO usage_records (id, user_id, kind, duration_minutes, format, project_id, reservation_id, created_at) VALUES (?, ?, 'final_export', 2, 'long', NULL, NULL, ?)");
for (let i = 0; i < 3; i++) legacy.run(`use_legacy_${i}`, flow.id, new Date().toISOString());
queryDelayMs = 4;
const burst = await Promise.all(Array.from({ length: 20 }, () => download(flow.cookie, 2)));
queryDelayMs = 0;
h.eq(burst.filter((r) => r.status === 201).length, 12, "20 simultaneous downloads on SceneFlow: exactly the 12 left after 3 earlier counted exports succeed");
h.eq(burst.filter((r) => r.status === 403).length, 8, "the other 8 are refused, none slip through");
h.eq(usageRows(flow.id).length, 15, "SceneFlow ends the week at exactly 15 counted downloads");
const sixteenth = await download(flow.cookie, 2);
h.eq(sixteenth.status, 403, "SceneFlow's 16th download in a week is refused");
h.ok(/15 SceneFlow downloads/.test(sixteenth.data.error || ""), "the SceneFlow refusal names its allowance");

/* SceneForge: no count, but every download is still recorded. */
let forgeAllowed = 0;
for (let i = 0; i < 20; i++) if ((await download(forge.cookie, 4)).status === 201) forgeAllowed++;
h.eq(forgeAllowed, 20, "SceneForge downloads are never refused for count");
h.eq(usageRows(forge.id).length, 20, "…yet every SceneForge download is recorded");
h.eq((await call("/api/entitlements", forge.cookie)).data.remaining?.finalExports, null, "SceneForge reports no remaining-count ceiling");

/* Short vs long is decided by the server from the length, never by the browser. */
await download(forge.cookie, 3, { format: "short" });
await download(forge.cookie, 0.5, { format: "long" });
const lastTwo = usageRows(forge.id).slice(-2).map((row) => row.format);
h.eq(lastTwo.join(","), "long,short", "the server classifies Short/long from the length and ignores the browser's claim");

server.close();

/* ------------------------------------------------------------------ */
/* 2. The render screen: the Vault is the only way out, and it counts. */
/* ------------------------------------------------------------------ */
h.ok(!/Download video \(/.test(render) && !/const downloadVideo\b/.test(render), "the download button below the render preview is gone");
h.ok(!render.includes("right-click the preview and pick Save video as"), "the screen no longer tells people to save the preview with right-click");

const saveCalls = render.match(/\bsaveRenderBlob\(/g) || [];
h.eq(saveCalls.length, 1, "saving a finished video happens in exactly one place (the Vault download)");
const vaultHandler = render.slice(render.indexOf("const downloadVaultRender = async"), render.indexOf("const removeVaultRender = async"));
h.ok(vaultHandler.length > 0 && vaultHandler.includes("saveRenderBlob(row.blob"), "the one save is the Vault's Download button");
h.ok(vaultHandler.indexOf("recordVideoDownload(") > 0 && vaultHandler.indexOf("recordVideoDownload(") < vaultHandler.indexOf("saveRenderBlob("), "the Vault asks the server to count the download BEFORE it saves the file");
h.ok(/catch \(err\)[\s\S]{0,260}setVaultError\([\s\S]{0,160}return;/.test(vaultHandler), "a refused download shows the reason and saves nothing");
h.ok(vaultHandler.includes("DOWNLOADS_COUNTED_NOT_SAVED.has(row.id)") && vaultHandler.includes("DOWNLOADS_COUNTED_NOT_SAVED.add(row.id)"), "a counted download whose save was cancelled can be retried without counting twice");
h.ok(vaultHandler.includes("vaultDownloadInFlightRef.current") , "a fast double-click cannot count two downloads");

const videoTags = render.match(/<video\b[\s\S]*?\/>/g) || [];
h.ok(videoTags.length >= 2, "the render preview and the Vault preview are both found");
for (const tag of videoTags) {
  h.ok(tag.includes('controlsList="nodownload"') && tag.includes("onContextMenu"), "every preview player hides the browser's own Download / Save video as…");
}

h.ok(render.includes("reserveFinalExport") && render.includes("cancelFinalExport") && !render.includes("completeFinalExport"), "a render is authorised and then released — it never counts a download itself");
h.ok(entitlementsSource.includes('"/api/usage/download"') && /recordVideoDownload[\s\S]{0,700}if \(!response\.ok\) throw/.test(entitlementsSource), "the client's download counter throws when the server refuses");
h.ok(platformSource.includes('"/api/usage/download"') && platformSource.includes("createUsageRecordWithinLimit"), "the server counts downloads with a single check-and-record statement");

const savers = srcFiles.filter((file) => /\bsaveBlobToDisk\(/.test(file.text)).map((file) => file.path).sort();
h.eq(savers.join(","), "src/components/RenderView.tsx,src/lib/render-vault.ts", "nothing else in the app saves a rendered video to disk");
h.ok(!/\.download\s*=/.test(appSource) && !appSource.includes("saveBlobToDisk"), "the app shell keeps the finished video for preview only and never downloads it");

h.done("download metering");
