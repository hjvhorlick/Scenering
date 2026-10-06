/**
 * Bring-your-own-key narration, exercised end to end.
 *
 * Narration is the one part of Scenering that reaches a paid API, so who
 * pays for it has to be unambiguous:
 *
 *  - an ordinary customer narrates with their own free Google AI Studio key,
 *    sent on the request and never stored;
 *  - the owner administrator keeps using the deployment's GEMINI_API_KEY, so
 *    running the product never means pasting a key into it;
 *  - a customer with no key is told so in plain words and is NOT quietly
 *    downgraded to the Google Translate read-aloud voice.
 *
 * The first half runs the real Express app (the same `createApp()` the
 * Worker boots) with every outbound call intercepted, so the assertions are
 * about behaviour: which key reached Google, and which requests left at all.
 * The second half pins the interface that makes the arrangement usable — the
 * key field, the prompts and the website copy.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string) => readFileSync(join(repoRoot, relative), "utf8");

/* Sources read before the working directory moves. */
const serverSource = read("server.ts");
const apiKeysLib = read("src/lib/api-keys.ts");
const narrationLib = read("src/lib/gemini-narration.ts");
const modal = read("src/components/ApiKeysModal.tsx");
const notice = read("src/components/GeminiKeyNotice.tsx");
const voiceStudio = read("src/components/VoiceoverStudio.tsx");
const videoPreview = read("src/components/VideoPreview.tsx");
const renderView = read("src/components/RenderView.tsx");
const voiceImport = read("src/components/VoiceImportModal.tsx");
const ttsCache = read("src/lib/tts-cache.ts");
const ttsPlayer = read("src/lib/tts-player.ts");
const voiceDownload = read("src/lib/voice-download.ts");
const zipDownload = read("src/lib/zip-download.ts");
const appShell = read("src/App.tsx");
const productFacts = read("src/marketing/product-facts.ts");
const noMeterSection = read("src/marketing/sections/NoMeter.tsx");
const pricingSection = read("src/marketing/sections/Pricing.tsx");

const SERVER_SECRET_KEY = "owner-server-gemini-secret-key-0001";
const CUSTOMER_KEY = "customer-own-google-ai-studio-key-42";

process.chdir(mkdtempSync(join(tmpdir(), "scenering-narration-")));
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.SCENERING_OWNER_EMAIL = "owner@example.com";
process.env.GEMINI_API_KEY = SERVER_SECRET_KEY;

/* ------------------------------------------------------------------ */
/* Every outbound call is intercepted, so the suite never touches the  */
/* network and can say exactly which key was presented to Google.      */
/* ------------------------------------------------------------------ */
interface OutboundCall {
  url: string;
  key: string;
}
const outbound: OutboundCall[] = [];
const realFetch = globalThis.fetch.bind(globalThis);

/** 0.2s of silent 16-bit PCM — what Gemini hands back, base64 encoded. */
const FAKE_PCM = Buffer.alloc(24000 * 2 * 0.2).toString("base64");

function presentedKey(url: string, init: RequestInit | undefined, input: unknown): string {
  const headers = new Headers(
    (init?.headers as HeadersInit | undefined) ||
      ((input as Request | undefined)?.headers as HeadersInit | undefined) ||
      {}
  );
  const header = headers.get("x-goog-api-key");
  if (header) return header;
  try {
    return new URL(url).searchParams.get("key") || "";
  } catch {
    return "";
  }
}

globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (url.includes("127.0.0.1") || url.includes("localhost")) return realFetch(input, init);

  outbound.push({ url, key: presentedKey(url, init, input) });

  if (url.includes("generativelanguage.googleapis.com")) {
    // The models listing is how a key is verified; generateContent is how
    // narration is synthesised.
    const body = url.includes(":generateContent")
      ? {
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: FAKE_PCM } }] } },
          ],
        }
      : { models: [{ name: "models/gemini-3.1-flash-tts-preview" }] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (url.includes("translate.google.com")) {
    // Reachable on purpose: the point of this suite is that a keyless
    // request never gets here.
    return new Response(Buffer.alloc(4096, 1), { status: 200, headers: { "content-type": "audio/mpeg" } });
  }

  return new Response("{}", { status: 404 });
}) as typeof fetch;

const express = (await import("express")).default;
const { installTestPlatformEnv } = await import("./platform-env.ts");
installTestPlatformEnv();
const { createApp } = await import("../server.ts");

const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

async function createSignedInUser(email: string, displayName: string) {
  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, displayName, password: "a-long-enough-password" }),
  });
  const registered = (await registration.json()) as any;
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
outbound.length = 0;

/** POST /api/tts the way the studio does. Each call uses its own text so the
 *  server's synthesis cache cannot answer for a key that was never used. */
async function speak(options: { cookie: string; text: string; key?: string }) {
  const before = outbound.length;
  const response = await fetch(`${base}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.key ? { "X-Gemini-Key": options.key } : {}),
      Cookie: options.cookie,
    },
    body: JSON.stringify({ text: options.text, voice: "guy" }),
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? ((await response.json().catch(() => ({}))) as any)
    : null;
  if (!body) await response.arrayBuffer();
  return { response, body, calls: outbound.slice(before) };
}

/* ------------------------------------------------------------------ */
/* 1. A customer with no key of their own is told, not downgraded.     */
/* ------------------------------------------------------------------ */
{
  const { response, body, calls } = await speak({ cookie: customerCookie, text: "A keyless first attempt." });
  h.eq(response.status, 400, "a customer with no Gemini key is refused rather than served");
  h.eq(body?.code, "GEMINI_KEY_REQUIRED", "the refusal carries a machine-readable code");
  h.eq(
    response.headers.get("X-TTS-Error"),
    "gemini-key-required",
    "…and a header, so a caller reading audio bytes can recognise it"
  );
  ok(/free/i.test(String(body?.error)) && /minute/i.test(String(body?.error)), "the message says it is free and quick");
  ok(String(body?.helpUrl).includes("aistudio.google.com"), "the refusal links to Google AI Studio");
  h.eq(calls.length, 0, "no request left the server at all");
  ok(
    !calls.some((call) => call.url.includes("translate.google.com")),
    "the Google Translate read-aloud voice is never substituted"
  );
}

/* ------------------------------------------------------------------ */
/* 2. A customer's own key — and only that key — speaks for them.      */
/* ------------------------------------------------------------------ */
{
  const { response, calls } = await speak({
    cookie: customerCookie,
    text: "A customer narrating with their own key.",
    key: CUSTOMER_KEY,
  });
  h.eq(response.status, 200, "a customer with their own key gets narration");
  const gemini = calls.filter((call) => call.url.includes("generativelanguage.googleapis.com"));
  h.eq(gemini.length, 1, "exactly one synthesis request reached Google");
  h.eq(gemini[0]?.key, CUSTOMER_KEY, "it presented the customer's own key");
  ok(
    !calls.some((call) => call.key === SERVER_SECRET_KEY),
    "the owner's server secret is never spent on a customer's narration"
  );
  h.eq(response.headers.get("X-TTS-Source"), "gemini", "the audio is reported as Gemini narration");
}

/* ------------------------------------------------------------------ */
/* 3. The owner administrator keeps using the server's own secret.     */
/* ------------------------------------------------------------------ */
{
  const { response, calls } = await speak({ cookie: ownerCookie, text: "The owner never pastes a key." });
  h.eq(response.status, 200, "the owner narrates without supplying a key");
  const gemini = calls.filter((call) => call.url.includes("generativelanguage.googleapis.com"));
  h.eq(gemini.length, 1, "the owner's narration reached Google once");
  h.eq(gemini[0]?.key, SERVER_SECRET_KEY, "…with the deployment's configured GEMINI_API_KEY");
}

/* ------------------------------------------------------------------ */
/* 4. The same rule on the GET route, and on nonsense keys.            */
/* ------------------------------------------------------------------ */
{
  const refused = await fetch(`${base}/api/tts?text=${encodeURIComponent("A GET with no key.")}&voice=guy`, {
    headers: { Cookie: customerCookie },
  });
  h.eq(refused.status, 400, "GET synthesis is refused without a key too");
  h.eq((await refused.json() as any)?.code, "GEMINI_KEY_REQUIRED", "…with the same code");

  const served = await fetch(`${base}/api/tts?text=${encodeURIComponent("A GET with a key.")}&voice=guy`, {
    headers: { Cookie: customerCookie, "X-Gemini-Key": CUSTOMER_KEY },
  });
  h.eq(served.status, 200, "GET synthesis works with the customer's key");
  await served.arrayBuffer();

  const junk = await speak({ cookie: customerCookie, text: "A key that is not a key.", key: "short" });
  h.eq(junk.response.status, 400, "an obviously malformed key is treated as no key");
  h.eq(junk.calls.length, 0, "…and nothing is sent to Google on its behalf");

  const catalogue = await fetch(`${base}/api/tts/voices`, { headers: { Cookie: customerCookie } });
  h.eq(catalogue.status, 200, "the voice catalogue is readable without any key");
  ok(Array.isArray(((await catalogue.json()) as any)?.voices), "…and still lists narrators");
}

/* ------------------------------------------------------------------ */
/* 5. The key is verified the same way the image provider keys are.    */
/* ------------------------------------------------------------------ */
{
  const before = outbound.length;
  const verified = await fetch(`${base}/api/verify-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({ geminiKey: CUSTOMER_KEY }),
  });
  const status = ((await verified.json()) as any)?.status;
  h.eq(verified.status, 200, "the key verifier answers");
  h.eq(status?.gemini?.valid, true, "a working Gemini key verifies");
  const calls = outbound.slice(before);
  h.eq(calls[0]?.key, CUSTOMER_KEY, "verification presents the key being tested");
  ok(
    calls.every((call) => !call.url.includes(`key=${CUSTOMER_KEY}`)),
    "the key travels in a header, never in the URL"
  );

  const rejected = await fetch(`${base}/api/verify-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: customerCookie },
    body: JSON.stringify({ geminiKey: "too-short" }),
  });
  h.eq(((await rejected.json()) as any)?.status?.gemini?.valid, false, "a malformed key fails verification");
}

server.close();

/* ------------------------------------------------------------------ */
/* 6. The server code says what the behaviour above proves.            */
/* ------------------------------------------------------------------ */
ok(serverSource.includes("resolveGeminiKey"), "the server resolves one narration key per request");
ok(serverSource.includes('auth?.user?.role === "admin"'), "only the owner administrator falls back to the server secret");
ok(serverSource.includes("env().GEMINI_API_KEY"), "the owner's narration still comes from the configured secret");
ok(serverSource.includes('"GEMINI_KEY_REQUIRED"'), "the refusal is a named, documented code");
ok(serverSource.includes("geminiClientFor"), "a client is built per key rather than once per process");

/* ------------------------------------------------------------------ */
/* 7. Storing, sending and explaining the key in the interface.        */
/* ------------------------------------------------------------------ */
ok(apiKeysLib.includes("geminiKey"), "the browser key store holds a Gemini key beside Pexels and Pixabay");
ok(apiKeysLib.includes('"X-Gemini-Key"'), "the key is sent as a request header");
ok(
  !apiKeysLib.includes('params.set("gemini_key"') && !apiKeysLib.includes("gemini_key="),
  "the narration key is never placed in a URL"
);
const imageHeaderBody = apiKeysLib.slice(
  apiKeysLib.indexOf("export function getApiKeysHeaders"),
  apiKeysLib.indexOf("export function getStoredGeminiKey")
);
ok(
  apiKeysLib.includes("getNarrationHeaders") && !imageHeaderBody.includes("X-Gemini-Key"),
  "narration headers are separate from the image-provider headers"
);

// Every route to /api/tts carries the customer's key — a missed call site
// would mean a feature that works for the owner and fails for everyone else.
for (const [name, source] of [
  ["tts-cache", ttsCache],
  ["tts-player", ttsPlayer],
  ["voice-download", voiceDownload],
  ["zip-download", zipDownload],
  ["VoiceoverStudio", voiceStudio],
  ["VideoPreview", videoPreview],
  ["RenderView", renderView],
  ["VoiceImportModal", voiceImport],
] as const) {
  // Only the POST synthesis calls need a key; the GET voice catalogue does
  // not, and must keep working for an account that has not added one.
  const callSites: string[] = [];
  const pattern = /fetch\((?:"\/api\/tts"|`\$\{EDGE_FUNCTION_BASE\}\/tts`)/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    callSites.push(source.slice(match.index, match.index + 320));
  }
  const synthesis = callSites.filter((site) => site.includes('method: "POST"'));
  ok(synthesis.length > 0, `${name}: still synthesises through the TTS API`);
  h.eq(
    synthesis.filter((site) => site.includes("...getNarrationHeaders()")).length,
    synthesis.length,
    `${name}: every synthesis request carries the customer's key`
  );
  ok(
    source.includes("isGeminiKeyRequiredResponse") || source.includes("isGeminiKeyRequiredError"),
    `${name}: recognises the "no key" answer`
  );
}

ok(
  ttsPlayer.includes("isGeminiKeyRequiredError(err)") && ttsPlayer.includes("this.stop()"),
  "a keyless preview stops instead of auditioning an unrelated browser voice"
);

/* The modal: a third field, verified like the other two, with a dot. */
ok(modal.includes("Gemini API Key"), "the API Keys modal has a Gemini field");
ok(modal.includes("geminiKey: geminiKey.trim()"), "the Gemini key is saved with the others");
ok(modal.includes("data.status?.gemini?.valid"), "the Gemini key is verified by the same endpoint");
ok(modal.includes("function StatusDot"), "verification is shown as a status dot");
for (const field of ["testResults?.pexels", "testResults?.pixabay", "testResults?.gemini"]) {
  ok(modal.includes(`StatusDot state={dotState(${field}`), `${field} has its own status dot`);
}
ok(
  modal.includes("GEMINI_KEY_HELP_URL") && narrationLib.includes("aistudio.google.com/app/apikey"),
  "the modal links to the free key"
);

/* The prompt shown when an account has no key. */
ok(narrationLib.includes("aistudio.google.com/app/apikey"), "the prompt copy links to Google AI Studio");
ok(/free/i.test(narrationLib) && /minute/i.test(narrationLib), "the prompt says free, and about a minute");
ok(narrationLib.includes('account?.user.role === "admin"'), "the owner administrator is never prompted");
ok(notice.includes("openApiKeysModal"), "the prompt has a button that opens the API Keys modal");
ok(notice.includes("Get a free key at Google AI Studio"), "…beside a link to get the key");
ok(voiceStudio.includes("<GeminiKeyNotice"), "the voice studio shows the prompt");
ok(voiceStudio.includes("<GeminiKeyHint"), "…including beside its preview buttons");
ok(videoPreview.includes("<GeminiKeyHint"), "the preview controls show the prompt too");
ok(
  appShell.includes('window.addEventListener("scenering-open-api-keys"'),
  "the studio opens the API Keys modal when a prompt asks it to"
);

/* ------------------------------------------------------------------ */
/* 8. The website says the same thing as the product.                  */
/* ------------------------------------------------------------------ */
ok(
  /your own free Google AI Studio key/i.test(productFacts),
  "the no-meter copy says narration uses your own free Google key"
);
ok(
  /own free Google AI Studio key/i.test(noMeterSection),
  "the no-meter section repeats it where a visitor reads it"
);
ok(
  /your own free Google AI Studio key/i.test(pricingSection) && /never meters it/i.test(pricingSection),
  "pricing says the narration key is yours, free and unmetered"
);
ok(
  !/narration is free speech synthesis/i.test(productFacts),
  "the old claim that narration needs nothing from you is gone"
);

h.done("bring-your-own-key narration");
