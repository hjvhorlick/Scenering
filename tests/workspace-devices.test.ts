/**
 * One membership, many devices — and the doors that were left open.
 *
 * Part 1 (pure): the workspace key registry, and the union merge that lets a
 * project created on a laptop and a project created on a phone both survive.
 *
 * Part 2 (real server, real migrations): a session is bound to the device that
 * opened it; a plan's device limit is enforced by the server; the workspace
 * repository holds each account's work separately and refuses credentials;
 * the retired export endpoint refuses; an expired reservation cannot complete;
 * and a server with no NODE_ENV is production, so it never hands back a
 * verification or password-reset link.
 */
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  LOCAL_ONLY_KEY_PREFIXES,
  NOT_LOCAL_STORAGE_NAMES,
  SYNCED_KEY_PREFIXES,
  isLocalOnlyKey,
  isSyncedWorkspaceKey,
} from "../src/lib/workspace-keys.ts";
import { mergeCollections } from "../src/lib/workspace-sync.ts";
import { isProductionRuntime, runtimeMode } from "../src/runtime-mode.ts";

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

/* ---------------------------------------------------------------- part 1 */

/* Every browser key the studio uses must have been classified on purpose.
   A new key that is neither synced nor local-only would either be stranded on
   one machine or — worse — copied to the server without anyone deciding it
   should be. This walks the source, so the check cannot drift. */
const srcFiles: Array<{ path: string; text: string }> = [];
(function walk(dir: string) {
  for (const name of readdirSync(join(repoRoot, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(repoRoot, rel)).isDirectory()) walk(rel);
    else if (/\.(ts|tsx)$/.test(name)) srcFiles.push({ path: rel, text: read(rel) });
  }
})("src");

const constantsFile = "lib/workspace-keys.ts";
const unclassified: string[] = [];
for (const file of srcFiles) {
  if (file.path.endsWith(constantsFile)) continue;
  for (const match of file.text.matchAll(/["'`](scenering_[A-Za-z0-9_]*)["'`]/g)) {
    const key = match[1];
    // Scenering narrator profile IDs share the `scenering_` brand prefix, but
    // are values rather than storage namespaces. A template-concatenated ID
    // prefix is likewise not a literal storage key.
    if (/^scenering_(?:male|female)_\d+$/.test(key) || key === "scenering_") continue;
    if (isSyncedWorkspaceKey(key) || isLocalOnlyKey(key)) continue;
    if (NOT_LOCAL_STORAGE_NAMES.some((name) => key === name)) continue;
    unclassified.push(`${key} (${file.path})`);
  }
}
h.eq([...new Set(unclassified)].length, 0, `every scenering_* key in src/ is classified as synced or local-only — unclassified: ${[...new Set(unclassified)].join(", ") || "none"}`);

/* Credentials and identity must never be in the synced set. */
for (const key of ["scenering_customer_api_keys", "scenering_session_token", "scenering_session", "scenering_device_id"]) {
  h.ok(!isSyncedWorkspaceKey(key), `${key} is not part of the synced workspace`);
}
h.ok(isSyncedWorkspaceKey("scenering_projects_v1"), "the project list is synced");
h.ok(isSyncedWorkspaceKey("scenering_scenes_v1"), "the scene list is synced");
h.ok(isSyncedWorkspaceKey("scenering_project_settings_42"), "per-project settings are synced");
h.ok(isSyncedWorkspaceKey("scenering_scene_meta_7"), "per-scene metadata is synced");
h.ok(isSyncedWorkspaceKey("scenering_phase_commits_42"), "commit history is synced");
h.ok(SYNCED_KEY_PREFIXES.length > 0 && LOCAL_ONLY_KEY_PREFIXES.length > 0, "both registries are populated");

/* A project added on each of two devices survives a merge. */
const laptopList = JSON.stringify([
  { id: 1, title: "Made on the laptop", created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-01T09:00:00Z" },
  { id: 2, title: "Shared, older edit", created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-01T09:00:00Z" },
]);
const phoneList = JSON.stringify([
  { id: 2, title: "Shared, newer edit", created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-02T09:00:00Z" },
  { id: 3, title: "Made on the phone", created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z" },
]);
const merged = JSON.parse(mergeCollections(laptopList, phoneList, "id")) as any[];
h.eq(merged.length, 3, "merging two devices' project lists keeps every project");
h.eq(merged.find((project) => project.id === 1)?.title, "Made on the laptop", "a project only the laptop has is kept");
h.eq(merged.find((project) => project.id === 3)?.title, "Made on the phone", "a project only the phone has is kept");
h.eq(merged.find((project) => project.id === 2)?.title, "Shared, newer edit", "the newer edit of a shared project wins");
h.eq(JSON.parse(mergeCollections("[]", phoneList, "id")).length, 2, "an empty device adopts the other device's list");
h.eq(JSON.parse(mergeCollections(laptopList, "[]", "id")).length, 2, "a device with projects survives an empty server copy");

/* A server with no NODE_ENV is production. Before this, the whole platform's
   development shortcuts were one missing variable away from the live site. */
h.eq(runtimeMode({}), "production", "an unset NODE_ENV means production");
h.eq(runtimeMode({ NODE_ENV: "" }), "production", "an empty NODE_ENV means production");
h.eq(runtimeMode({ NODE_ENV: "prod" }), "production", "an unexpected value means production");
h.eq(runtimeMode({ NODE_ENV: "development" }), "development", "development must be explicit");
h.eq(runtimeMode({ NODE_ENV: "test" }), "test", "test must be explicit");
h.ok(isProductionRuntime({}), "isProductionRuntime defaults to production");

const registerSource = read("server/platform.ts");
h.ok(
  /isDevelopmentRuntime\(env\(\)\) \? \{ developmentVerificationUrl/.test(registerSource),
  "the verification link is only returned by a development server",
);
h.ok(
  /const includeDevUrl = !isProduction\(\) && Boolean\(developmentResetUrl\);/.test(registerSource),
  "reset links are dev-only",
);
h.ok(
  /ENDPOINT_RETIRED/.test(registerSource),
  "the legacy export endpoint that skipped the creative policy is retired",
);

/* The studio must not clamp narration off by itself: a source-media project
   with an uploaded clip had its voiceover switch forced off on every load. */
const appSource = read("src/App.tsx");
h.ok(
  !/useEffect\(\(\) => \{\s*if \(mediaSourceProject\) setVoiceoverEnabled\(false\)/.test(appSource),
  "opening a source-media project no longer forces the narration switch off",
);
const sessionSource = read("src/lib/session.ts");
h.ok(/beginWorkspaceSync\(current\)/.test(sessionSource), "signing in starts the workspace sync");
h.ok(/stopWorkspaceSync\(\)/.test(sessionSource), "signing out stops the workspace sync");
h.ok(/deviceHeaders\(\)/.test(sessionSource), "API calls carry this browser's device identity");

/* ---------------------------------------------------------------- part 2 */

process.chdir(mkdtempSync(join(tmpdir(), "scenering-devices-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.SCENERING_OWNER_EMAIL = "owner@scenering.test";

const express = (await import("express")).default;
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");
const workspaceRoutes = await import("../server/workspace.ts");
const db = (await import("../src/db.ts")).db;

const app = express();
app.use(express.json({ limit: "4mb" }));
platform.registerPlatformRoutes(app);
workspaceRoutes.registerWorkspaceRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

type CallOptions = { cookie?: string | null; device?: string; body?: unknown; method?: string; headers?: Record<string, string> };
async function call(path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.device) headers["X-Scenering-Device"] = options.device;
  if (options.cookie) headers.Cookie = `scenering_session=${encodeURIComponent(options.cookie)}`;
  const response = await fetch(`${base}${path}`, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, body: json, cookie: response.headers.get("set-cookie") };
}

async function newAccount(email: string) {
  const registered = await call("/api/auth/register", { body: { displayName: "Device Tester", email, password: "correct horse battery" } });
  h.ok(registered.status === 201 || registered.status === 200, `register ${email} (${registered.status})`);
  const token = String(registered.body?.developmentVerificationUrl || "").split("token=")[1] || "";
  h.ok(token.length > 10, "a test server still offers the verification link (development only)");
  await call("/api/auth/verify-email", { body: { token: decodeURIComponent(token) } });
  return email;
}

async function setPlan(userId: string, plan: "free" | "sceneflow" | "sceneforge") {
  const membership = await db.findMembershipByUserId(userId);
  if (membership) await db.updateMembership(membership.id, { plan, status: "active" });
  else await db.createMembership(userId, plan);
}

async function login(email: string, device: string) {
  const result = await call("/api/auth/login", { device, body: { email, password: "correct horse battery" } });
  const cookie = String(result.cookie || "").match(/scenering_session=([^;]+)/)?.[1] || "";
  return { ...result, sessionCookie: cookie ? decodeURIComponent(cookie) : "" };
}

const freeEmail = `free-${Date.now()}@scenering.test`;
await newAccount(freeEmail);

/* --- Free: one device at a time ---------------------------------------- */
const firstDevice = await login(freeEmail, "device-aaaaaaaa-1111");
h.eq(firstDevice.status, 200, "the first device signs in to a Free plan");
h.ok(Boolean(firstDevice.sessionCookie), "sign-in returns a session cookie");
h.eq(firstDevice.body?.devices?.limit, 1, "the Free plan allows one signed-in device");
h.eq(firstDevice.body?.devices?.active, 1, "the account reports one active device");

await call("/api/workspace/sync", {
  cookie: firstDevice.sessionCookie,
  device: "device-aaaaaaaa-1111",
  body: { documents: [{ key: "scenering_projects_v1", body: JSON.stringify([{ id: 1, title: "Laptop project" }]), baseRevision: 0 }] },
});

const secondDevice = await login(freeEmail, "device-bbbbbbbb-2222");
h.eq(secondDevice.status, 200, "the second device can sign in");
h.eq(secondDevice.body?.devicesSignedOut, 1, "opening a second device on Free signs the first one out");
h.eq(secondDevice.body?.devices?.active, 1, "only one device remains signed in");

const firstDeviceAfter = await call("/api/auth/session", { cookie: firstDevice.sessionCookie, device: "device-aaaaaaaa-1111" });
h.eq(firstDeviceAfter.status, 401, "the signed-out device's session no longer works");

const firstSessionRows = await db.listActiveSessionsForUser((await db.findUserByEmail(freeEmail))!.id);
h.eq(firstSessionRows.length, 1, "the database holds exactly one Free session");
h.eq(firstSessionRows[0].deviceId, "device-bbbbbbbb-2222", "the surviving session belongs to the newest device");
h.ok(Boolean(firstSessionRows[0].deviceLabel), "the session records a readable device label");
h.ok(["mobile", "tablet", "desktop"].includes(String(firstSessionRows[0].platform)), "the session records a device class");

/* --- the workspace reaches the other device ---------------------------- */
const pulledOnSecond = await call("/api/workspace", { cookie: secondDevice.sessionCookie, device: "device-bbbbbbbb-2222" });
h.eq(pulledOnSecond.status, 200, "the workspace reads back on the second device");
const projectDoc = (pulledOnSecond.body?.documents || []).find((document: any) => document.key === "scenering_projects_v1");
h.ok(Boolean(projectDoc), "the project written on the first device is present");
h.eq(JSON.parse(projectDoc.body)[0].title, "Laptop project", "the second device sees the first device's project");
h.eq(pulledOnSecond.body?.limits?.maxConcurrentDevices, 1, "the workspace reports the plan's device limit");

/* --- revisions: a stale write is refused, not silently applied ---------- */
const freshRevision = projectDoc.revision;
const goodWrite = await call("/api/workspace/sync", {
  cookie: secondDevice.sessionCookie,
  body: { documents: [{ key: "scenering_project_title_1", body: "Second device title", baseRevision: 0 }] },
});
h.eq(goodWrite.body?.accepted?.length, 1, "a first write is accepted");
const staleWrite = await call("/api/workspace/sync", {
  cookie: secondDevice.sessionCookie,
  body: { documents: [{ key: "scenering_project_title_1", body: "Stale overwrite", baseRevision: 0 }] },
});
h.eq(staleWrite.body?.accepted?.length, 0, "a stale write is refused");
h.eq(staleWrite.body?.conflicts?.[0]?.document?.body, "Second device title", "the refusal hands back the current value");
h.ok(freshRevision >= 1, "documents carry a revision");

/* --- credentials never travel ----------------------------------------- */
const secretWrite = await call("/api/workspace/sync", {
  cookie: secondDevice.sessionCookie,
  body: { documents: [{ key: "scenering_customer_api_keys", body: JSON.stringify({ pexels: "secret-key" }), baseRevision: 0 }] },
});
h.eq(secretWrite.body?.accepted?.length, 0, "provider API keys are refused by the workspace");
const afterSecret = await call("/api/workspace", { cookie: secondDevice.sessionCookie });
h.ok(
  !(afterSecret.body?.documents || []).some((document: any) => document.key.includes("api_keys")),
  "no credentials are stored in the workspace",
);

/* --- accounts are isolated -------------------------------------------- */
const otherEmail = `other-${Date.now()}@scenering.test`;
await newAccount(otherEmail);
const otherLogin = await login(otherEmail, "device-cccccccc-3333");
const otherWorkspace = await call("/api/workspace", { cookie: otherLogin.sessionCookie });
h.eq((otherWorkspace.body?.documents || []).length, 0, "another member's workspace is empty, not someone else's");
const unauthorised = await call("/api/workspace");
h.eq(unauthorised.status, 401, "the workspace requires a session");

/* --- a paid plan allows more devices, and enforces its own number ------ */
const paid = (await db.findUserByEmail(freeEmail))!;
await setPlan(paid.id, "sceneflow");
const sessionsForFlow = [] as string[];
for (const device of ["device-fl-1-aaaa", "device-fl-2-bbbb", "device-fl-3-cccc"]) {
  const result = await login(freeEmail, device);
  sessionsForFlow.push(result.sessionCookie);
  h.eq(result.status, 200, `SceneFlow sign-in on ${device}`);
}
const flowSessions = await db.listActiveSessionsForUser(paid!.id);
h.eq(flowSessions.length, 2, "SceneFlow keeps two devices signed in");
h.eq((await call("/api/auth/session", { cookie: sessionsForFlow[0] })).status, 401, "the oldest of three is signed out");
h.eq((await call("/api/auth/session", { cookie: sessionsForFlow[2] })).status, 200, "the newest device keeps its place");

await setPlan(paid.id, "sceneforge");
const forgeCookies = new Map<string, string>();
for (const device of ["device-sf-1-aaaa", "device-sf-2-bbbb", "device-sf-3-cccc", "device-sf-4-dddd"]) {
  const result = await login(freeEmail, device);
  forgeCookies.set(device, result.sessionCookie);
  h.eq(result.status, 200, `SceneForge sign-in on ${device}`);
}
h.eq((await db.listActiveSessionsForUser(paid.id)).length, 5, "SceneForge keeps five devices signed in");
const sixthForge = await login(freeEmail, "device-sf-6-eeee");
h.eq(sixthForge.status, 200, "a sixth SceneForge device can still sign in");
h.eq((await db.listActiveSessionsForUser(paid.id)).length, 5, "and one of the older five is signed out");

/* --- reserve -> complete is the normal path, and it still works -------- */
const allowanceEmail = `allowance-${Date.now()}@scenering.test`;
await newAccount(allowanceEmail);
const allowanceLogin = await login(allowanceEmail, "device-allow-aaaa-1111");
const manifest = { features: ["scene_creation"], voice: "scenering_male_01", captionStyle: "newsroom_clean", backgroundMusic: [], audioVisualisers: [], callsToAction: [] };
const allowanceReservation = await call("/api/usage/final-export/reserve", {
  cookie: allowanceLogin.sessionCookie,
  body: { projectId: "9", durationMinutes: 4, format: "long", creativeManifest: manifest },
});
h.eq(allowanceReservation.status, 201, "a Free long-video reservation is issued");
const completion = await call("/api/usage/final-export/complete", {
  cookie: allowanceLogin.sessionCookie,
  body: { reservationId: allowanceReservation.body.reservationId },
});
h.eq(completion.status, 200, "completing that reservation is allowed (it does not count against itself)");
h.eq(completion.body?.recorded, true, "the export is recorded");
const spentAgain = await call("/api/usage/final-export/reserve", {
  cookie: allowanceLogin.sessionCookie,
  body: { projectId: "9", durationMinutes: 4, format: "long", creativeManifest: manifest },
});
h.eq(spentAgain.status, 403, "the Free long-video allowance is now spent");
/* A Vault download that names its reservation is counted from the server's
   record of that render — not from a duration the browser reports now. This
   one claims ten seconds; the reservation says four minutes. */
const disguised = await call("/api/usage/download", {
  cookie: allowanceLogin.sessionCookie,
  body: { projectId: "9", durationMinutes: 0.1, reservationId: allowanceReservation.body.reservationId },
});
h.eq(disguised.status, 403, "a download is counted at the duration its reservation authorised, not a retyped one");
const honestDownload = await call("/api/usage/download", {
  cookie: allowanceLogin.sessionCookie,
  body: { projectId: "9", durationMinutes: 0.1 },
});
h.eq(honestDownload.status, 201, "a download without provenance still counts as the Short it reports");
const tooLong = await call("/api/usage/final-export/reserve", {
  cookie: allowanceLogin.sessionCookie,
  body: { projectId: "9", durationMinutes: 9, format: "long", creativeManifest: manifest },
});
h.eq(tooLong.status, 403, "a video longer than the Free ceiling is refused");

/* --- the retired endpoint and the expired reservation ----------------- */
const retired = await call("/api/usage/final-export", {
  cookie: sixthForge.sessionCookie,
  body: { durationMinutes: 0.5, format: "short" },
});
h.eq(retired.status, 410, "the legacy export endpoint refuses to record an export");
h.eq(retired.body?.code, "ENDPOINT_RETIRED", "and explains why");

const reservation = await call("/api/usage/final-export/reserve", {
  cookie: sixthForge.sessionCookie,
  body: {
    projectId: "1", durationMinutes: 0.5, format: "short",
    creativeManifest: { features: ["scene_creation"], voice: "default", captionStyle: "default", backgroundMusic: [], audioVisualisers: [], callsToAction: [] },
  },
});
h.eq(reservation.status, 201, "a valid reservation is issued");
/* Age it past its two-hour window, then try to complete it. */
testD1().sqlite.exec(`UPDATE export_reservations SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = '${reservation.body.reservationId}'`);
const tooLate = await call("/api/usage/final-export/complete", {
  cookie: sixthForge.sessionCookie,
  body: { reservationId: reservation.body.reservationId },
});
h.eq(tooLate.status, 409, "an expired reservation cannot be completed");
h.eq(tooLate.body?.code, "RESERVATION_EXPIRED", "and says the reservation expired");

server.close();
h.done("devices, workspace sync and plan-bypass doors");
