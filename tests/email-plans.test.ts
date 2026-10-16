/**
 * Ready-made campaign plans (src/admin/email-plans.ts, the Email Centre's
 * Plans tab) and the two audiences they rely on: members who have not made
 * a video yet, and members with no video download for a number of days.
 *
 * The plan copy is checked against the server's own rules (lengths,
 * categories, variables, HTML cleaning, the shared layout) and against the
 * application's facts (prices, limits, catalogue counts). Using a plan is
 * then exercised end to end through the real routes, exactly as the Plans
 * tab does it, and a plan email is sent through the real campaign queue.
 */
import { createHarness } from "./harness.ts";

const h = createHarness();

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "re_test_key";
const OWNER = "owner@scenering.test";
process.env.SCENERING_OWNER_EMAIL = OWNER;

const express = (await import("express")).default;
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");
const emailCentre = await import("../server/email-centre.ts");
const plans = await import("../src/admin/email-plans.ts");
const { EMAIL_TEMPLATE_VARIABLES, AUDIENCE_TYPES } = await import("../src/admin/email-centre-api.ts");
const { EMAIL_TEMPLATE_CATEGORIES } = await import("../src/db.ts");
const { PLAN_CONFIG } = await import("../src/config/plans.ts");
const { LIVE_COUNTS, CATALOG_COUNTS } = await import("../src/marketing/product-facts.ts");

const { CAMPAIGN_PLANS } = plans;
const FREE = PLAN_CONFIG.free;
const FLOW = PLAN_CONFIG.sceneflow;
const FORGE = PLAN_CONFIG.sceneforge;

/* ---- 1. The catalogue itself ------------------------------------------------ */
const SYMBOLS = /[\u2190-\u21FF\u2300-\u27BF\u2600-\u26FF\u{1F300}-\u{1FAFF}]/u;
const AMERICAN = /\b(color|colors|favorite|favorites|organiz\w*|realiz\w*|center|behavior|customiz\w*|personaliz\w*|visualiz\w*|analyz\w*|catalog)\b/i;
const ALLOWED_VARIABLES = new Set(EMAIL_TEMPLATE_VARIABLES.map((variable) => variable.key));
const ALLOWED_PAGES = new Set(["/app", "/pricing"]);
const allText = (payload: { subject: string; preheader: string; htmlBody: string; textBody: string }) => [payload.subject, payload.preheader, payload.htmlBody, payload.textBody].join("\n");

h.ok(CAMPAIGN_PLANS.length >= 6, "there is a real choice of plans");
h.eq(new Set(CAMPAIGN_PLANS.map((plan) => plan.id)).size, CAMPAIGN_PLANS.length, "every plan has its own id");
const templateNames = new Set<string>();
const now = new Date("2026-10-16T08:00:00.000Z");
for (const plan of CAMPAIGN_PLANS) {
  h.ok(plan.emails.length >= 1 && plan.name.length > 3 && plan.goal.length > 10 && plan.when.length > 10, `${plan.name}: has a name, a goal, advice on when to use it, and emails`);
  h.ok(AUDIENCE_TYPES.some((entry) => entry.value === plan.audience.type) && emailCentre.EMAIL_AUDIENCE_TYPES.some((entry) => entry.value === plan.audience.type), `${plan.name}: its audience exists in the editor and on the server`);
  h.ok(!["manual", "test_recipient"].includes(plan.audience.type), `${plan.name}: goes to a group of members, not a hand-picked list`);
  h.eq(plan.emails[0].day, 0, `${plan.name}: the first email goes out on the day the plan starts`);
  h.ok(plan.emails.every((email, index) => index === 0 || email.day > plan.emails[index - 1].day), `${plan.name}: the emails go out in order, on different days`);
  h.ok(plan.emails[plan.emails.length - 1].day <= 60, `${plan.name}: the whole series fits well inside the 180-day scheduling window`);
  const times = plans.planSendTimes(plan, now);
  h.ok(times.every((time, index) => time.getTime() - now.getTime() === plan.emails[index].day * 86400000), `${plan.name}: send times follow the day offsets`);
  plan.emails.forEach((email, index) => {
    const payload = plans.planTemplatePayload(plan, index);
    const label = `${plan.name} email ${index + 1}`;
    h.ok(!templateNames.has(payload.name), `${label}: its template name is unique`);
    templateNames.add(payload.name);
    h.ok(payload.name.length <= 120 && plans.planCampaignName(plan, index, now).length <= 120, `${label}: template and campaign names fit the 120-character limit`);
    h.ok(payload.description.length <= 500, `${label}: the description fits`);
    h.ok((EMAIL_TEMPLATE_CATEGORIES as readonly string[]).includes(payload.category), `${label}: uses a real template category`);
    const subjectSeen = payload.subject.replace(/\{\{\s*first_name\s*\}\}/g, "Alexandra");
    h.ok(subjectSeen.length >= 10 && subjectSeen.length <= 70, `${label}: the subject is short enough to read in an inbox (${subjectSeen.length})`);
    h.ok(payload.preheader.length >= 20 && payload.preheader.length <= 110, `${label}: the preview line is a useful length (${payload.preheader.length})`);
    const variables = allText(payload).match(/\{\{\s*[a-z_]+\s*\}\}/g) || [];
    h.ok(variables.every((variable) => ALLOWED_VARIABLES.has(variable.replace(/\s+/g, "") as any)), `${label}: only uses variables the server fills in`);
    h.ok(!SYMBOLS.test(allText(payload)), `${label}: has no symbol characters`);
    h.ok(!AMERICAN.test(allText(payload)), `${label}: uses British spelling`);
    h.ok(!/[<>]/.test(payload.textBody) && !payload.textBody.includes("**"), `${label}: the plain-text version has no HTML or markup`);
    h.eq((payload.htmlBody.match(/class="cta"/g) || []).length, 1, `${label}: has exactly one button`);
    const links = [...payload.htmlBody.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    h.ok(links.length >= 1 && links.every((link) => link.startsWith(`${plans.PLAN_SITE}/`) && ALLOWED_PAGES.has(new URL(link).pathname)), `${label}: links only to Scenering pages that exist`);
    const cleaned = emailCentre.sanitizeEmailHtml(payload.htmlBody, "https://scenering.test");
    h.eq((cleaned.match(/<b>/g) || []).length, (payload.htmlBody.match(/<b>/g) || []).length, `${label}: survives the server's HTML cleaning with its emphasis intact`);
    h.ok(!payload.htmlBody.includes("<ul") || cleaned.includes("<ul"), `${label}: keeps its list through cleaning`);
    const rendered = emailCentre.renderCampaignMessage({
      template: { ...payload, id: "plan-check", heroImageUrl: null, status: "active" } as any,
      campaignSubject: payload.subject,
      recipient: { userId: "plan-check", email: "member@example.com", displayName: "Maya Chen" },
      linkUserId: "plan-check",
      base: "https://scenering.test",
      isTest: false,
    });
    h.ok(!rendered.html.includes("{{") && !rendered.text.includes("{{") && !rendered.subject.includes("{{"), `${label}: no variable is left unfilled`);
    h.ok(!allText(payload).includes("{{first_name}}") || rendered.html.includes("Maya"), `${label}: greets the member by first name`);
    h.ok(rendered.html.includes("background-color:#6366f1") && rendered.html.includes("Unsubscribe"), `${label}: gets the Scenering button styling and the unsubscribe footer`);
    const ctaLabel = email.blocks.find((block): block is { cta: string; href: string } => "cta" in block)!.cta;
    h.ok(ctaLabel === "Open Scenering" || !rendered.html.includes(">Open Scenering</a>"), `${label}: the layout does not add a second button`);
  });
  // Only paying members (and the upgrade offer, which says so) hear numbers that need a paid plan.
  // A gift plan gives those features for the gift's length, and says so.
  if (plan.audience.type !== "paid_plan" && plan.id !== "upgrade" && !plan.gift) {
    const text = plan.emails.map((_, index) => allText(plans.planTemplatePayload(plan, index))).join("\n");
    h.ok(!text.includes(`${LIVE_COUNTS.voices} narrators`) && !text.includes(`${LIVE_COUNTS.captionStyles} caption styles`), `${plan.name}: does not promise free members the paid-plan narrators or caption styles`);
  }
}

/* ---- 2. Facts come from the application -------------------------------------- */
{
  const byId = (id: string) => CAMPAIGN_PLANS.find((plan) => plan.id === id)!;
  const text = (id: string, index: number) => plans.planTemplatePayload(byId(id), index).textBody;
  const words = ["no", "one", "two", "three", "four", "five"];
  const upgrade = text("upgrade", 0);
  for (const fact of [`$${FLOW.prices.monthly} a month`, `$${FLOW.prices.yearly} a year`, `$${FLOW.annualMonthlyEquivalent} a month`, `save $${FLOW.annualSaving}`, `${FLOW.limits.finalExportsPerWeek} video downloads every week`,
    `All ${LIVE_COUNTS.voices} narrators`, `all ${LIVE_COUNTS.captionStyles} caption styles`, `${CATALOG_COUNTS.filters} filters`, `${CATALOG_COUNTS.textTemplates} text templates`, `${CATALOG_COUNTS.stickers} stickers`,
    `${CATALOG_COUNTS.musicTracks} music tracks`, `${CATALOG_COUNTS.visualisers} sound visualisers`, `${FREE.limits.maxShortMinutes}-minute limit on Shorts`, `${FREE.limits.maxLongMinutes}-minute limit on long videos`]) {
    h.ok(upgrade.includes(fact), `the upgrade email states "${fact}" from the plan configuration and catalogues`);
  }
  const compare = text("upgrade", 1);
  for (const fact of [`${FREE.name}: $0`, `${FLOW.name}: $${FLOW.prices.monthly} a month or $${FLOW.prices.yearly} a year`, `${FORGE.name}: $${FORGE.prices.monthly} a month or $${FORGE.prices.yearly} a year`, "no weekly download limit"]) {
    h.ok(compare.includes(fact), `the plan comparison states "${fact}"`);
  }
  h.ok(text("first-video", 2).includes(`${words[FREE.limits.shortExportsPerWeek!]} Shorts and ${words[FREE.limits.longExportsPerWeek!]} long video`), "the weekly-downloads email uses the Free plan's real weekly downloads");
  h.ok(text("first-video", 2).includes("only counted when you download"), "and says rendering is free, as metering works");
  const welcome = byId("welcome-series").audience.filter(now);
  h.ok(welcome.registeredFrom === "2026-09-16" && welcome.registeredTo === "2026-10-16", "the welcome plan goes to members who joined in the 30 days before it is used");
  h.eq(byId("win-back").audience.filter(now).inactiveDays, 30, "the win-back plan looks for 30 days without a download");
  h.eq(plans.planLengthLabel(byId("tips-course")), "4 emails over 21 days", "plan lengths read naturally");
  h.eq(plans.planLengthLabel(byId("feedback")), "1 email", "a single-email plan says so");
}

/* ---- Server ------------------------------------------------------------------ */
const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
emailCentre.registerEmailCentreRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

const originalFetch = globalThis.fetch;
const sent: Array<{ to: string; subject: string; html: string }> = [];
globalThis.fetch = (async (input: any, init?: any) => {
  if (String(input) === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body));
    sent.push({ to: body.to[0], subject: body.subject, html: body.html });
    return new Response(JSON.stringify({ id: `email_${sent.length}` }), { status: 200 });
  }
  return originalFetch(input, init);
}) as typeof fetch;

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}

const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ email: OWNER, displayName: "Henry Owner", password: "a-long-enough-password", marketingConsent: true }) });
await json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: String(registered.data.developmentVerificationUrl || "").split("token=")[1] || "" }) });
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: OWNER, password: "a-long-enough-password" }) });
const withAdmin = { headers: { Cookie: String(login.headers.get("set-cookie") || "").split(";")[0] } } as RequestInit;
h.eq((await json("/api/admin/email/dashboard", withAdmin)).status, 200, "the owner is signed in as administrator");

/* ---- 3. Audiences built on making videos ------------------------------------- */
const sqlite = testD1().sqlite;
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const member = (id: string, email: string, name: string, joinedDaysAgo: number, consent: boolean) => {
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role, is_verified, created_at, updated_at) VALUES (?, ?, 'x:y:z', ?, 'user', 1, ?, ?)").run(id, email, name, daysAgo(joinedDaysAgo), daysAgo(joinedDaysAgo));
  sqlite.prepare("INSERT INTO email_preferences (user_id, marketing_consent, consent_timestamp, consent_source, consent_version, training_step, updated_at) VALUES (?, ?, ?, 'registration', 'v1', 0, ?)").run(id, consent ? 1 : 0, daysAgo(joinedDaysAgo), daysAgo(joinedDaysAgo));
};
const download = (userId: string, days: number, kind = "download") => {
  sqlite.prepare("INSERT INTO usage_records (id, user_id, kind, duration_minutes, format, project_id, reservation_id, created_at) VALUES (?, ?, ?, 1, 'short', NULL, NULL, ?)").run(`use_${userId}_${days}_${kind}`, userId, kind, daysAgo(days));
};
member("usr_new", "new@example.com", "Nia New", 1, true);              // joined yesterday, no video
member("usr_neverold", "never@example.com", "Omar Never", 90, true);   // joined long ago, no video
member("usr_quiet", "quiet@example.com", "Quinn Quiet", 90, true);     // last video 60 days ago
download("usr_quiet", 60, "final_export");
member("usr_active", "active@example.com", "Ada Active", 90, true);    // video 2 days ago
download("usr_active", 2);
member("usr_refused", "refused@example.com", "Ray Refused", 90, false); // no consent, no video

const count = async (query: string) => json(`/api/admin/email/audience-count?${query}`, withAdmin);
const noVideo = await count("type=no_video_yet");
h.eq(noVideo.data.count, 2, "'not made a video yet' finds the two consenting members without any video (never the owner or anyone without consent)");
h.ok(/not downloaded a finished video/.test(noVideo.data.description), "and describes itself plainly");
h.eq((await count("type=inactive")).data.count, 2, "'no downloads lately' defaults to 30 days: the quiet member and the one who never made a video");
h.eq((await count("type=inactive&inactiveDays=90")).data.count, 1, "over 90 days, the member whose last video was 60 days ago is no longer quiet");
h.eq((await count("type=inactive&inactiveDays=7")).data.count, 2, "a member who joined yesterday is never counted as quiet, and a recent download keeps a member out");
h.ok(/last 90 days/.test((await count("type=inactive&inactiveDays=90")).data.description), "the description names the number of days");
for (const bad of ["5", "366", "abc", "30.5"]) h.eq((await count(`type=inactive&inactiveDays=${bad}`)).status, 400, `'${bad}' days is refused`);
const { db } = await import("../src/db.ts");
const resolved = (await db.listEmailAudience("no_video_yet", {}, 100)).map((entry) => entry.email).sort().join(",");
h.eq(resolved, "never@example.com,new@example.com", "sending resolves exactly the members the count promised");

/* ---- 4. Using a plan, as the Plans tab does --------------------------------- */
async function usePlan(id: string, start: Date | null) {
  const plan = CAMPAIGN_PLANS.find((entry) => entry.id === id)!;
  const ids: string[] = [];
  for (let index = 0; index < plan.emails.length; index += 1) {
    const created = await json("/api/admin/email/templates", { method: "POST", ...withAdmin, body: JSON.stringify(plans.planTemplatePayload(plan, index)) });
    h.eq(created.status, 201, `${plan.name}: template ${index + 1} is accepted by the server`);
    ids.push(created.data.template?.id);
  }
  const times = start ? plans.planSendTimes(plan, start) : null;
  const campaigns: any[] = [];
  for (let index = 0; index < plan.emails.length; index += 1) {
    const body: Record<string, unknown> = { name: plans.planCampaignName(plan, index, new Date()), templateId: ids[index], subject: "", audienceType: plan.audience.type, ...plan.audience.filter(new Date()) };
    if (times) { body.schedule = true; body.scheduledAt = times[index].toISOString(); }
    const created = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify(body) });
    h.eq(created.status, 201, `${plan.name}: campaign ${index + 1} is accepted by the server`);
    campaigns.push(created.data.campaign);
  }
  return { plan, campaigns };
}

const start = new Date(Date.now() + 26 * 3600000);
const firstVideo = await usePlan("first-video", start);
h.ok(firstVideo.campaigns.every((campaign) => campaign.status === "scheduled" && campaign.audienceType === "no_video_yet"), "a scheduled plan creates scheduled campaigns for its audience");
h.ok(firstVideo.campaigns.every((campaign, index) => Date.parse(campaign.scheduledAt) === start.getTime() + firstVideo.plan.emails[index].day * 86400000), "each campaign is scheduled on its own day");
const winBack = await usePlan("win-back", null);
h.ok(winBack.campaigns.every((campaign) => campaign.status === "draft" && campaign.scheduledAt === null), "without scheduling, the campaigns wait to be sent by hand");
const winBackDetail = await json(`/api/admin/email/campaigns/${winBack.campaigns[0].id}`, withAdmin);
h.ok(JSON.stringify(winBackDetail.data).includes("last 30 days"), "the win-back campaign keeps its 30-day audience");
const welcome = await usePlan("welcome-series", start);
h.ok(welcome.campaigns.every((campaign) => campaign.audienceType === "registered_range"), "the welcome plan goes to recent sign-ups");
h.ok(JSON.stringify((await json(`/api/admin/email/campaigns/${welcome.campaigns[0].id}`, withAdmin)).data).includes("registered"), "with the sign-up dates it was created with");

const preview = await json("/api/admin/email/render-preview", { method: "POST", ...withAdmin, body: JSON.stringify({ template: plans.planTemplatePayload(firstVideo.plan, 0) }) });
h.ok(preview.status === 200 && preview.data.html.includes("Henry") && !preview.data.subject.includes("{{"), "the Plans preview renders an email in the real layout, greeting the owner by name");

/* ---- 5. A plan email really goes to the right members ---------------------- */
{
  const plan = firstVideo.plan;
  const template = await json("/api/admin/email/templates", { method: "POST", ...withAdmin, body: JSON.stringify({ ...plans.planTemplatePayload(plan, 0), name: "Send check" }) });
  const campaign = await json("/api/admin/email/campaigns", { method: "POST", ...withAdmin, body: JSON.stringify({ name: "Send check", templateId: template.data.template.id, subject: "", audienceType: "no_video_yet" }) });
  sent.length = 0;
  const started = await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}/send`, { method: "POST", ...withAdmin, body: "{}" });
  h.ok(started.status === 200 || started.status === 202, "the plan campaign can be sent");
  for (let round = 0; round < 5; round += 1) {
    const step = await emailCentre.processCampaignBatch(campaign.data.campaign.id, 20);
    if (step.remaining === 0) break;
  }
  h.eq(sent.map((mail) => mail.to).sort().join(","), "never@example.com,new@example.com", "only members who have not made a video receive it");
  h.ok(sent.every((mail) => mail.subject === "Your first video is closer than you think"), "with the plan's subject");
  h.ok(sent.some((mail) => mail.html.includes("Nia")) && sent.some((mail) => mail.html.includes("Omar")), "each member is greeted by their own name");
}

server.close();
globalThis.fetch = originalFetch;
h.done("Email Centre plans");
