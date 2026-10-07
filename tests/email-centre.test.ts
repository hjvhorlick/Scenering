/**
 * The Admin Email Centre, exercised end to end.
 *
 * Everything here runs against a real Express app backed by the in-memory
 * D1 shim (real SQLite running the real migrations), with Resend faked at
 * the fetch boundary — so the assertions are about behaviour: consent
 * gating, sanitisation, escaping, idempotency, the queue, and the public
 * unsubscribe path. Transactional routes are also probed to prove the
 * separation the design promises.
 */
import { createHmac } from "node:crypto";
import { createHarness } from "./harness.ts";

const h = createHarness();

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "re_test_key";
process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("resend-webhook-test-secret").toString("base64");

const express = (await import("express")).default;
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");
const emailCentre = await import("../server/email-centre.ts");

const app = express();
// The Resend webhook verifies the untouched raw bytes, so it mounts before
// the general JSON parser — exactly the order server.ts uses.
emailCentre.registerResendWebhook(app);
app.use(express.json());
platform.registerPlatformRoutes(app);
emailCentre.registerEmailCentreRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

/* ---- Resend stub: records every request the app makes. ---------------- */
const originalFetch = globalThis.fetch;
interface RecordedSend { to: string; subject: string; text: string; html: string; body: any }
const sent: RecordedSend[] = [];
// Only Resend is faked; everything else (the test server itself) goes to
// the real fetch.
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body));
    sent.push({ to: body.to[0], subject: body.subject, text: body.text, html: body.html, body });
    return new Response(JSON.stringify({ id: `email_${sent.length}` }), { status: 200 });
  }
  return originalFetch(input, init);
}) as typeof fetch;

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = (await response.json().catch(() => ({}))) as any;
  return { status: response.status, data, response };
}

/* ---- Accounts ----------------------------------------------------------- */
async function registerAndSignIn(email: string, displayName = "Test Member", marketingConsent = false) {
  const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ email, displayName, password: "a-long-enough-password", marketingConsent }) });
  const token = String(registered.data.developmentVerificationUrl || "").split("token=")[1] || "";
  await json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-enough-password" }) });
  const cookie = String(login.headers.get("set-cookie") || "").split(";")[0];
  return { cookie, id: testD1().sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined };
}

const OWNER = "owner@scenering.test";
process.env.SCENERING_OWNER_EMAIL = OWNER;
// ensureOwnerPrivileges runs on session lookup, so the owner gets admin.
const admin = await registerAndSignIn(OWNER, "Henry Owner", true);
const adminCookie = admin.cookie;
const adminId = String(admin.id?.id);
h.ok(Boolean(adminCookie && adminId), "the owner account exists, is verified and signed in");

const withAdmin = { headers: { Cookie: adminCookie } } as RequestInit;

// Consent holders and non-consent holders for audience tests.
const consentedA = await registerAndSignIn("consent-a@example.com", "Alice Consented", true);
const consentedB = await registerAndSignIn("consent-b@example.com", "Bob Consented", true);
const refused = await registerAndSignIn("refused@example.com", "Refused Person", false);
h.ok(Boolean(consentedA.cookie && consentedB.cookie && refused.cookie), "audience fixtures are signed in");

// A paid member (sceneflow membership) with consent.
await testD1().sqlite.exec("INSERT INTO memberships (id, user_id, plan, status, created_at, updated_at) VALUES ('mem_paid', '" + String(consentedB.id?.id) + "', 'sceneflow', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')");
// An invalid email address on a consented account must never be selected.
await testD1().sqlite.exec("INSERT INTO users (id, email, password_hash, display_name, role, is_verified, created_at, updated_at) VALUES ('usr_broken', 'not-an-email', 'x:y:z', 'Broken Address', 'user', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')");
await testD1().sqlite.exec("INSERT INTO email_preferences (user_id, marketing_consent, consent_timestamp, consent_source, consent_version, training_step, updated_at) VALUES ('usr_broken', 1, '2026-01-01T00:00:00.000Z', 'registration', '2026-10', 0, '2026-01-01T00:00:00.000Z')");

/* ---- 1. Authorisation ---------------------------------------------------- */
{
  const anonymous = await json("/api/admin/email/templates");
  h.eq(anonymous.status, 401, "the email centre is closed to anonymous callers");
  const nonAdmin = await json("/api/admin/email/templates", { method: "GET", headers: { Cookie: String(consentedA.cookie) } });
  h.eq(nonAdmin.status, 403, "the email centre refuses non-administrator accounts");
  const asAdmin = await json("/api/admin/email/templates", { method: "GET", ...withAdmin });
  h.eq(asAdmin.status, 200, "the owner administrator can list templates");
}

/* ---- 2. Template management --------------------------------------------- */
const EVIL_HTML = `<h2>Hello {{first_name}}</h2>
<script>alert('xss')</script>
<p onmouseover="alert('hover')" style="color:#111;position:absolute">We moved {{display_name}}!</p>
<a href="javascript:alert(1)">Bad link</a>
<a href="https://scenering.test/app" class="cta">Good link</a>
<img src="https://scenering.test/logo.png" onerror="alert(2)">
<!-- a comment -->`;

let templateId = "";
{
  const invalid = await json("/api/admin/email/templates", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "", category: "nope", subject: "", htmlBody: "" }) });
  h.eq(invalid.status, 400, "template creation validates its fields");

  const created = await json("/api/admin/email/templates", { method: "POST", ...withAdmin, body: JSON.stringify({
    name: "October update", description: "Release notes", category: "product_update",
    subject: "{{first_name}}, October in Scenering", preheader: "New effects and faster research",
    htmlBody: EVIL_HTML, textBody: "Hello {{first_name}},\n\nWe moved!",
  }) });
  h.eq(created.status, 201, "a valid template is created");
  templateId = created.data.template.id;
  h.eq(created.data.template.status, "active", "new templates start active");
  h.eq(created.data.template.createdByEmail, OWNER, "the template records its creator");

  const updated = await json(`/api/admin/email/templates/${templateId}`, { method: "PUT", ...withAdmin, body: JSON.stringify({ name: "October update v2" }) });
  h.eq(updated.status, 200, "templates can be edited");
  h.eq(updated.data.template.name, "October update v2", "edits persist");

  const duplicated = await json(`/api/admin/email/templates/${templateId}/duplicate`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(duplicated.status, 201, "templates can be duplicated");
  h.ok(String(duplicated.data.template.name).includes("(copy)"), "duplicates are labelled as copies");
  const dupId = duplicated.data.template.id;

  const archived = await json(`/api/admin/email/templates/${dupId}/archive`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(archived.data.template.status, "archived", "templates can be archived");
  h.ok(Boolean(archived.data.template.archivedAt), "archival is timestamped");
  const restored = await json(`/api/admin/email/templates/${dupId}/archive`, { method: "POST", ...withAdmin, body: JSON.stringify({ archived: false }) });
  h.eq(restored.data.template.status, "active", "archived templates can be restored");
}

/* ---- 3. Rendering: sanitisation, variables, branding, fallbacks --------- */
{
  const preview = await json("/api/admin/email/render-preview", { method: "POST", ...withAdmin, body: JSON.stringify({ templateId, sample: { displayName: "<b>Evil</b> Alice", email: "alice@example.com" } }) });
  h.eq(preview.status, 200, "a template can be previewed");
  const html = String(preview.data.html);
  const text = String(preview.data.text);
  const subject = String(preview.data.subject);

  h.ok(!html.includes("<script"), "script tags never survive rendering");
  h.ok(!/onmouseover/i.test(html) && !/onerror/i.test(html), "event handler attributes are stripped");
  h.ok(!html.includes("javascript:"), "javascript: URLs are stripped");
  h.ok(!html.includes("a comment"), "HTML comments are removed");
  h.ok(!/position:absolute/.test(html), "out-of-allowlist CSS is dropped");
  h.ok(html.includes("&lt;b&gt;Evil&lt;/b&gt; Alice"), "recipient-supplied values are HTML-escaped (and the variable resolved)");
  h.ok(html.includes("scenering-logo.png"), "the branded layout carries the Scenering logo");
  h.ok(html.includes("Henry John Vincent Horlick"), "the footer carries the business identification");
  h.ok(html.includes("/unsubscribe?token="), "the layout includes a tokenised unsubscribe link");
  h.ok(html.includes("/email-preferences?token="), "the layout includes a manage-preferences link");
  h.ok(/max-width:\s*600px/.test(html), "the layout is a mobile-friendly 600px email card");
  h.ok(!/<style/i.test(html), "no external or embedded stylesheets ride inside the email");
  h.ok(/style="[^"]*display:inline-block/.test(html), "class=\"cta\" links render as inline-styled buttons");
  h.ok(text.includes("Unsubscribe from marketing email:"), "the plain-text fallback carries the unsubscribe URL");
  h.ok(!subject.includes("<b>"), "subject variables render as words, never as markup");
  h.ok(preview.data.text.includes("Hello Evil,"), "plain-text bodies render values as plain words (tags stripped, no entity escaping)");

  // Fallbacks: a recipient with no display name at all (the shape a
  // test-recipient-only delivery or a vanished account renders with).
  const fallback = emailCentre.renderCampaignMessage({
    template: { id: "t", name: "T", description: "", category: "newsletter", subject: "Hi {{first_name}}", preheader: "", htmlBody: "<p>Hello {{first_name}}</p>", textBody: "", heroImageUrl: null, status: "active", createdBy: "x", createdAt: "", updatedAt: "", archivedAt: null },
    campaignSubject: "Hi {{first_name}}",
    recipient: { userId: null, email: "nobody@example.com", displayName: "" },
    linkUserId: null,
    base: "https://scenering.test",
    isTest: false,
  });
  h.ok(fallback.html.includes("Hello there"), "a missing first name falls back to \"there\"");
  h.ok(fallback.subject === "Hi there", "the subject uses the same safe fallback");
  h.ok(fallback.text.includes("Unsubscribe from marketing email:"), "even fallback renders carry the unsubscribe URL");

  // Inline (unsaved) draft preview with a hero image and root-relative URL.
  const inline = await json("/api/admin/email/render-preview", { method: "POST", ...withAdmin, body: JSON.stringify({ template: { name: "Draft", category: "newsletter", subject: "Draft {{current_year}}", htmlBody: "<p>Year {{current_year}}</p>", heroImageUrl: "/marketing/hero-showcase-1024.webp" } }) });
  h.ok(String(inline.data.html).includes("https://scenering.test/marketing/hero-showcase-1024.webp"), "root-relative hero images are absolutised against the site URL");
  h.ok(String(inline.data.html).includes(`Year ${new Date().getUTCFullYear()}`), "{{current_year}} resolves");
  const badHero = await json("/api/admin/email/render-preview", { method: "POST", ...withAdmin, body: JSON.stringify({ template: { name: "Bad", category: "newsletter", subject: "x", htmlBody: "<p>x</p>", heroImageUrl: "javascript:alert(1)" } }) });
  h.ok(!String(badHero.data.html).includes("javascript:"), "a javascript: hero URL is dropped");
}

/* ---- 4. Audiences: consent is the gate ---------------------------------- */
{
  const all = await json("/api/admin/email/audience-count?type=all_consented", { method: "GET", ...withAdmin });
  h.eq(all.status, 200, "audience counts are available");
  // Alice, Bob, the owner, and the broken-address account all hold consent,
  // but the broken address is filtered by the email prefilter in SQL.
  h.eq(all.data.count, 3, "only valid-addressed consented users are counted (refused account excluded, broken address dropped)");
  h.ok(String(all.data.description).includes("marketing consent"), "the audience carries a human description");

  const paid = await json("/api/admin/email/audience-count?type=paid_plan", { method: "GET", ...withAdmin });
  h.eq(paid.data.count, 2, "paid audience = the sceneflow member plus the owner administrator");
  const free = await json("/api/admin/email/audience-count?type=free_plan", { method: "GET", ...withAdmin });
  h.eq(free.data.count, 1, "free audience excludes paid members and admins");

  const step = await json("/api/admin/email/audience-count?type=training_step&trainingStep=3", { method: "GET", ...withAdmin });
  h.eq(step.data.count, 0, "training-step audiences are filtered by the preference row's step");

  const range = await json("/api/admin/email/audience-count?type=registered_range&registeredFrom=2026-01-01&registeredTo=2026-12-31", { method: "GET", ...withAdmin });
  h.eq(range.data.count, 3, "date ranges include their end day and still require consent");

  const manual = await json(`/api/admin/email/audience-count?type=manual&userIds=${String(refused.id?.id)},${String(consentedA.id?.id)}`, { method: "GET", ...withAdmin });
  h.eq(manual.data.count, 1, "manual audiences still exclude non-consented selections");

  const bad = await json("/api/admin/email/audience-count?type=nonsense", { method: "GET", ...withAdmin });
  h.eq(bad.status, 400, "unknown audience types are rejected");

  const recipients = await json("/api/admin/email/recipients?q=alice", { method: "GET", ...withAdmin });
  h.eq(recipients.status, 200, "the manual picker can search recipients");
  h.ok(recipients.data.recipients.every((r: any) => r.email !== "refused@example.com"), "the recipient picker never offers non-consented users");
}

/* ---- 5. Campaigns: create, preview, test, send -------------------------- */
let campaignId = "";
const campaignMailOf = (id: string) => sent.filter((entry) => Array.isArray(entry.body.tags) && entry.body.tags.includes(`campaign:${id}`));
{
  const created = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({
    name: "October campaign", templateId, subject: "", audienceType: "all_consented",
  }) });
  h.eq(created.status, 201, "a campaign can be created as a draft");
  campaignId = created.data.campaign.id;
  h.eq(created.data.campaign.status, "draft", "new campaigns start as drafts");
  h.ok(String(created.data.campaign.resolvedSubject).includes("October in Scenering"), "the resolved subject falls back to the template subject");

  const noTemplate = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "x", templateId: "tpl_missing", audienceType: "all_consented" }) });
  h.eq(noTemplate.status, 400, "campaigns must reference an existing template");

  const preview = await json(`/api/admin/email/campaigns/${campaignId}/preview`, { method: "POST", ...withAdmin, body: JSON.stringify({ sample: { displayName: "Preview Person", email: "preview@example.com" } }) });
  h.eq(preview.status, 200, "campaigns can be previewed");
  h.ok(String(preview.data.html).includes("Preview Person"), "the preview renders with the sample recipient");

  // Test email: clearly marked, no delivery rows.
  const before = testD1().sqlite.prepare("SELECT COUNT(*) AS n FROM email_deliveries").get() as { n: number };
  const testSend = await json(`/api/admin/email/campaigns/${campaignId}/test`, { method: "POST", ...withAdmin, body: JSON.stringify({ to: "owner@scenering.test" }) });
  h.eq(testSend.status, 200, "a test email can be sent");
  const after = testD1().sqlite.prepare("SELECT COUNT(*) AS n FROM email_deliveries").get() as { n: number };
  h.eq(after.n, before.n, "test sends never create campaign delivery rows");
  const last = sent[sent.length - 1];
  h.ok(last.subject.startsWith("[Test]"), "test emails are clearly marked in the subject");
  h.ok(last.html.includes("Test email"), "test emails carry a visible test banner");
  h.ok(last.body.tags.includes(`campaign-test:${campaignId}`), "test sends carry campaign metadata as provider tags");
  const badAddress = await json(`/api/admin/email/campaigns/${campaignId}/test`, { method: "POST", ...withAdmin, body: JSON.stringify({ to: "not-an-email" }) });
  h.eq(badAddress.status, 400, "test sends validate the recipient address");

  // Send: the whole (small) audience goes out in the first batch.
  const send = await json(`/api/admin/email/campaigns/${campaignId}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(send.status, 200, "sending a campaign is accepted");
  h.eq(send.data.campaign.recipientCount, 3, "the recipient count is fixed at send time");
  h.ok(send.data.progress.processed >= 1, "the first batch is processed synchronously");

  const again = await json(`/api/admin/email/campaigns/${campaignId}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(again.status, 409, "a campaign that finished cannot be sent again (idempotency)");

  const detail = await json(`/api/admin/email/campaigns/${campaignId}`, { method: "GET", ...withAdmin });
  h.eq(detail.data.campaign.status, "completed", "a fully drained campaign completes");
  h.eq(detail.data.campaign.sentCount, 3, "every eligible recipient was sent to");
  h.eq(detail.data.campaign.failedCount, 0, "no failures occurred");
  h.ok(detail.data.deliveryCounts.sent === 3, "delivery rows recorded the sends");

  // Only campaign-tagged mail counts: no recipient was emailed twice, and
  // none of the always-excluded users received anything.
  const mail = campaignMailOf(campaignId);
  h.eq(mail.length, 3, "exactly one email per eligible recipient");
  const toAddresses = mail.map((entry) => entry.to);
  h.eq(new Set(toAddresses).size, toAddresses.length, "no recipient received duplicate campaign mail");
  h.ok(!toAddresses.includes("refused@example.com"), "the non-consented account received nothing");
  h.ok(!toAddresses.includes("not-an-email"), "the invalid address received nothing");
  h.ok(mail.every((entry) => entry.html.includes("/unsubscribe?token=")), "every campaign email carries the unsubscribe link");
  h.ok(mail.every((entry) => entry.text.includes("Unsubscribe from marketing email:")), "every plain-text part carries the unsubscribe URL");
}

/* ---- 5b. A larger audience: batching and continuation ------------------- */
{
  // 25 more consented users → 28 total: more than one batch of 20.
  const insert = testD1().sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role, is_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 'user', 1, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')");
  const insertPref = testD1().sqlite.prepare("INSERT INTO email_preferences (user_id, marketing_consent, consent_timestamp, consent_source, consent_version, training_step, updated_at) VALUES (?, 1, '2026-02-01T00:00:00.000Z', 'registration', '2026-10', 0, '2026-02-01T00:00:00.000Z')");
  for (let i = 0; i < 25; i += 1) {
    const id = `usr_bulk_${i}`;
    insert.run(id, `bulk${i}@example.com`, "scrypt:00:00", `Bulk User ${i}`);
    insertPref.run(id);
  }

  const created = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "Batched campaign", templateId, audienceType: "all_consented" }) });
  const batchedId = created.data.campaign.id;
  const first = await json(`/api/admin/email/campaigns/${batchedId}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(first.data.campaign.recipientCount, 28, "the larger audience is fully queued");
  h.eq(first.data.progress.processed, 20, "only one bounded batch is sent per invocation");
  h.eq(first.data.campaign.status, "sending", "the campaign stays in flight while batches remain");

  const second = await json(`/api/admin/email/campaigns/${batchedId}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(second.status, 200, "calling send on an in-flight campaign continues the queue rather than restarting it");
  h.eq(second.data.progress.processed, 8, "the remaining batch is drained by the next call");

  const detail = await json(`/api/admin/email/campaigns/${batchedId}`, { method: "GET", ...withAdmin });
  h.eq(detail.data.campaign.status, "completed", "the batched campaign completes once drained");
  const mail = campaignMailOf(batchedId);
  h.eq(mail.length, 28, "every queued recipient was emailed exactly once");
  h.eq(new Set(mail.map((entry) => entry.to)).size, 28, "no duplicates across batches");
}

/* ---- 6. Template deletion guard ----------------------------------------- */
{
  const blocked = await json(`/api/admin/email/templates/${templateId}`, { method: "DELETE", ...withAdmin });
  h.eq(blocked.status, 409, "templates used by campaigns cannot be deleted");

  const fresh = await json("/api/admin/email/templates", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "Spare", category: "announcement", subject: "Spare", htmlBody: "<p>spare</p>" }) });
  const removed = await json(`/api/admin/email/templates/${fresh.data.template.id}`, { method: "DELETE", ...withAdmin });
  h.eq(removed.status, 200, "never-used templates can be deleted");
}

/* ---- 7. Empty audience is refused, draft survives ----------------------- */
{
  const campaign = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "Empty audience", templateId, audienceType: "training_step", trainingStep: 9 }) });
  const send = await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(send.status, 400, "sending to an empty audience is refused");
  const still = await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}`, { method: "GET", ...withAdmin });
  h.eq(still.data.campaign.status, "draft", "a refused send leaves the draft intact");
  await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}/cancel`, { method: "POST", ...withAdmin, body: "{}" });
}

/* ---- 8. Scheduling + the cron queue -------------------------------------- */
{
  const past = new Date(Date.now() - 3600000).toISOString();
  const scheduled = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "Due campaign", templateId, audienceType: "all_consented", schedule: true, scheduledAt: past }) });
  h.eq(scheduled.status, 400, "scheduling in the past is refused");

  const due = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "Future campaign", templateId, audienceType: "all_consented", schedule: true, scheduledAt: new Date(Date.now() + 3600000).toISOString() }) });
  h.eq(due.status, 201, "a campaign can be scheduled for the future");
  h.eq(due.data.campaign.status, "scheduled", "scheduled campaigns carry the status");
  const early = await json(`/api/admin/email/campaigns/${due.data.campaign.id}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.eq(early.status, 409, "a scheduled campaign cannot be manually sent before its time");

  // Make it due, then run the cron entry point.
  await testD1().sqlite.prepare("UPDATE email_campaigns SET scheduled_at = ? WHERE id = ?").run(new Date(Date.now() - 60000).toISOString(), String(due.data.campaign.id));
  const queue = await emailCentre.processEmailCampaignQueue();
  h.ok(queue.processed >= 1, "the cron queue starts due campaigns and sends their first batch");
  const detail = await json(`/api/admin/email/campaigns/${due.data.campaign.id}`, { method: "GET", ...withAdmin });
  h.eq(detail.data.campaign.status === "sending" || detail.data.campaign.status === "completed", true, "a due scheduled campaign is started by the queue");
  await json(`/api/admin/email/campaigns/${due.data.campaign.id}/cancel`, { method: "POST", ...withAdmin, body: "{}" });
}

/* ---- 9. Unsubscribe + preference tokens ---------------------------------- */
{
  const { signEmailPreferenceToken } = platform;
  const token = signEmailPreferenceToken(String(consentedA.id?.id));
  const read = await json(`/api/email-preferences?token=${encodeURIComponent(token)}`);
  h.eq(read.status, 200, "a signed preference token reads the preference");
  h.eq(read.data.marketingConsent, true, "the preference row is returned for the token holder");

  const tampered = await json(`/api/email-preferences?token=${encodeURIComponent(token.slice(0, -4) + "AAAA")}`);
  h.eq(tampered.status, 401, "a tampered preference token is rejected");

  const put = await json("/api/email-preferences", { method: "PUT", body: JSON.stringify({ token, marketingConsent: false }) });
  h.eq(put.status, 200, "preferences can be updated through the token");
  h.eq(put.data.marketingConsent, false, "the token update is recorded");
  const count = await json("/api/admin/email/audience-count?type=all_consented", { method: "GET", ...withAdmin });
  h.eq(count.data.count, 27, "the opted-out account immediately leaves the audience (owner + paid member + 25 bulk users remain)");

  const unsubscribe = await json("/api/email/unsubscribe", { method: "POST", body: JSON.stringify({ token: signEmailPreferenceToken(String(consentedB.id?.id)) }) });
  h.eq(unsubscribe.status, 200, "the one-click unsubscribe works from the email link");
  h.ok(String(unsubscribe.data.message).includes("unsubscribed"), "the unsubscribe response is explicit");
  const invalid = await json("/api/email/unsubscribe", { method: "POST", body: JSON.stringify({ token: "nonsense" }) });
  h.eq(invalid.status, 400, "invalid unsubscribe tokens are rejected");

  // The session (account settings) path still works.
  const sessionPut = await json("/api/email-preferences", { method: "PUT", headers: { Cookie: String(refused.cookie) }, body: JSON.stringify({ marketingConsent: true }) });
  h.eq(sessionPut.status, 200, "signed-in users can still set preferences the old way");
  h.eq(sessionPut.data.marketingConsent, true, "the session update is recorded");
}

/* ---- 10. Dashboard -------------------------------------------------------- */
{
  const dashboard = await json("/api/admin/email/dashboard", { method: "GET", ...withAdmin });
  h.eq(dashboard.status, 200, "the dashboard loads");
  h.eq(dashboard.data.stats.users.total, 30, "total users are counted");
  h.ok(dashboard.data.stats.users.consented >= 1, "consented users are counted");
  h.ok(dashboard.data.stats.users.unsubscribed >= 1, "unsubscribed users are counted");
  h.ok(dashboard.data.stats.templates.total >= 2, "templates are counted");
  h.ok(Object.keys(dashboard.data.stats.campaignStatuses).length >= 1, "campaign statuses are aggregated");
  h.ok(Array.isArray(dashboard.data.recentCampaigns) && dashboard.data.recentCampaigns.length >= 1, "recent campaigns are listed");
  h.ok(dashboard.data.meta.variables.some((v: any) => v.key === "{{unsubscribe_url}}"), "the dashboard advertises the safe variable list");
  h.eq(dashboard.data.meta.emailProviderConfigured, true, "the dashboard reports provider readiness");
}

/* ---- 11. Resend delivery webhook ------------------------------------------ */
{
  const deliveryRow = testD1().sqlite.prepare("SELECT id, provider_message_id FROM email_deliveries WHERE provider_message_id IS NOT NULL ORDER BY created_at ASC LIMIT 1").get() as { id: string; provider_message_id: string } | undefined;
  h.ok(Boolean(deliveryRow), "send attempts recorded a provider message id");
  if (deliveryRow) {
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: deliveryRow.provider_message_id, subject: "October in Scenering" } });
    const timestamp = Math.floor(Date.now() / 1000);
    const id = "msg_test_1";
    const secret = Buffer.from(String(process.env.RESEND_WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
    const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("base64");
    const delivered = await fetch(`${base}/api/webhooks/resend`, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` }, body: payload });
    h.eq(delivered.status, 200, "a correctly signed delivery event is accepted");
    const row = testD1().sqlite.prepare("SELECT status FROM email_deliveries WHERE id = ?").get(deliveryRow.id) as { status: string };
    h.eq(row.status, "delivered", "delivery webhooks advance the delivery row");
    const campaign = testD1().sqlite.prepare("SELECT delivered_count FROM email_campaigns WHERE id = ?").get(campaignId) as { delivered_count: number };
    h.ok(campaign.delivered_count >= 1, "delivery webhooks update the campaign's delivered count");

    // Replay is deduplicated; a bad signature is refused.
    const replay = await fetch(`${base}/api/webhooks/resend`, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` }, body: payload });
    h.eq((await replay.json()).status, "duplicate", "webhook redeliveries are deduplicated");
    const forged = await fetch(`${base}/api/webhooks/resend`, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": "msg_2", "svix-timestamp": String(timestamp), "svix-signature": "v1,deadbeef" }, body: payload });
    h.eq(forged.status, 401, "forged signatures are rejected");
  }
}

/* ---- 12. Transactional separation ----------------------------------------- */
{
  // Registering a NEW account sends a verification email — through the
  // transactional path, with none of the campaign machinery involved.
  sent.length = 0;
  await json("/api/auth/register", { method: "POST", body: JSON.stringify({ email: "verification-only@example.com", displayName: "Verify Me", password: "a-long-enough-password", marketingConsent: false }) });
  const verification = sent[0];
  h.ok(Boolean(verification), "registration still sends its verification email");
  h.ok(!verification.subject.startsWith("[Test]"), "transactional mail is never marked as a test");
  h.ok(!verification.body.tags || !verification.body.tags.some((t: string) => t.startsWith("campaign")), "transactional mail carries no campaign metadata");
  h.ok(!verification.html || !verification.html.includes("unsubscribe?token"), "transactional mail does not carry marketing unsubscribe links");
  const rows = testD1().sqlite.prepare("SELECT COUNT(*) AS n FROM email_deliveries WHERE email = ?").get("verification-only@example.com") as { n: number };
  h.eq(rows.n, 0, "transactional mail never writes campaign delivery rows");
}

server.close();
globalThis.fetch = originalFetch;
h.done("Admin Email Centre");
