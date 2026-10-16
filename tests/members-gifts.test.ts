/**
 * The Email Centre's Members and Gifts, exercised end to end.
 *
 * Real Express routes and real SQL (node:sqlite running the real
 * migrations); only Resend is faked, at the fetch boundary. Members are
 * written straight into the database with known dates, plans and usage, so
 * every count and filter can be checked exactly. Gift codes are made
 * through the admin API and used through the same public redeem endpoint
 * the studio and sign-in screen call.
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createHarness } from "./harness.ts";

const h = createHarness();

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "re_test_key";
const OWNER = "owner@scenering.test";
process.env.SCENERING_OWNER_EMAIL = OWNER;
delete process.env.EMAIL_REPLY_TO;
delete process.env.INBOX_ADDRESS;

const express = (await import("express")).default;
const { installTestPlatformEnv, testD1 } = await import("./platform-env.ts");
installTestPlatformEnv();
const platform = await import("../server/platform.ts");
const emailCentre = await import("../server/email-centre.ts");
const inbox = await import("../server/inbox.ts");
const members = await import("../server/members.ts");
const giftCodes = await import("../server/gift-codes.ts");
const settingsModule = await import("../server/inbox-settings.ts");
const { GIFT_SCHEMA_STATEMENTS } = await import("../src/gifts-schema.ts");
const { GIFT_LENGTHS, giftEndsAt, giftLengthLabel, isGiftLength } = await import("../src/lib/gift-lengths.ts");
const { memberFilterCondition, MEMBER_FILTERS } = await import("../src/members-db.ts");
const plans = await import("../src/admin/email-plans.ts");
const membersApiModule = await import("../src/admin/members-api.ts");

const app = express();
app.use(express.json());
platform.registerPlatformRoutes(app);
emailCentre.registerEmailCentreRoutes(app);
inbox.registerInboxRoutes(app);
members.registerMembersRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

/* ---- Fakes and helpers ------------------------------------------------------ */
const originalFetch = globalThis.fetch;
const sent: Array<{ to: string; from: string; subject: string; replyTo?: string }> = [];
globalThis.fetch = (async (input: any, init?: any) => {
  if (String(input) === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body));
    sent.push({ to: body.to[0], from: body.from, subject: body.subject, replyTo: body.reply_to });
    return new Response(JSON.stringify({ id: `re_${sent.length}` }), { status: 200 });
  }
  if (String(input).startsWith("https://cloudflare-dns.com/")) return new Response(JSON.stringify({ Status: 0, Answer: [] }), { status: 200 });
  return originalFetch(input, init);
}) as typeof fetch;

async function json(path: string, init: RequestInit & { cookie?: string } = {}) {
  const { cookie, ...rest } = init;
  const response = await fetch(`${base}${path}`, { ...rest, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(rest.headers || {}) } });
  const data = (await response.json().catch(() => ({}))) as any;
  return { status: response.status, data };
}

const sql = testD1().sqlite;
const one = <T = any>(query: string, ...params: any[]) => sql.prepare(query).get(...params) as T;
const all = <T = any>(query: string, ...params: any[]) => sql.prepare(query).all(...params) as T[];
const DAY = 86400000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const daysAhead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function addUser(id: string, email: string, name: string, options: { joinedDaysAgo?: number; createdAt?: string; verified?: boolean; consent?: boolean; role?: string } = {}) {
  const createdAt = options.createdAt || daysAgo(options.joinedDaysAgo ?? 60);
  sql.prepare("INSERT INTO users (id, email, password_hash, display_name, role, is_verified, created_at, updated_at) VALUES (?, ?, 'x:y:z', ?, ?, ?, ?, ?)")
    .run(id, email, name, options.role || "user", options.verified === false ? 0 : 1, createdAt, createdAt);
  sql.prepare("INSERT INTO email_preferences (user_id, marketing_consent, consent_timestamp, consent_source, consent_version, training_step, updated_at) VALUES (?, ?, ?, 'registration', 'v1', 0, ?)")
    .run(id, options.consent === false ? 0 : 1, createdAt, createdAt);
  sql.prepare("INSERT INTO memberships (id, user_id, plan, status, created_at, updated_at) VALUES (?, ?, 'free', 'active', ?, ?)").run(`mem_${id}`, id, createdAt, createdAt);
}
function setPaid(userId: string, plan: "sceneflow" | "sceneforge", subscribedAt = daysAgo(10)) {
  sql.prepare("UPDATE memberships SET plan = ?, updated_at = ? WHERE user_id = ?").run(plan, subscribedAt, userId);
  sql.prepare("INSERT INTO subscriptions (id, user_id, plan_id, billing_interval, status, current_period_end, created_at, updated_at) VALUES (?, ?, ?, 'monthly', 'active', ?, ?, ?)")
    .run(`sub_${userId}_${randomUUID().slice(0, 8)}`, userId, plan, daysAhead(20), subscribedAt, subscribedAt);
}
function addGrant(userId: string, plan: "sceneflow" | "sceneforge", endsAt: string, options: { status?: string; createdAt?: string; codeId?: string | null; period?: string } = {}) {
  const id = `grant_${randomUUID().replace(/-/g, "")}`;
  const createdAt = options.createdAt || daysAgo(1);
  sql.prepare("INSERT INTO complimentary_grants (id, user_id, plan_id, period, status, starts_at, ends_at, granted_by, reason, access_code_id, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'usr_owner', 'test', ?, ?, NULL)")
    .run(id, userId, plan, options.period || "month", options.status || "active", createdAt, endsAt, options.codeId ?? null, createdAt);
  return id;
}
function addVideo(userId: string, createdAt: string, format: "short" | "long" = "short") {
  sql.prepare("INSERT INTO usage_records (id, user_id, kind, duration_minutes, format, created_at) VALUES (?, ?, 'download', ?, ?, ?)")
    .run(`use_${randomUUID().replace(/-/g, "")}`, userId, format === "short" ? 0.8 : 4, format, createdAt);
}
/** A signed-in session for a member, without going through the (rate-limited) sign-up. */
function sessionFor(userId: string): string {
  const raw = `test-session-${userId}-${randomUUID()}`;
  const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
  sql.prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(`sess_${randomUUID().slice(0, 12)}`, userId, hash, daysAhead(30), new Date().toISOString());
  return `scenering_session=${encodeURIComponent(raw)}`;
}
const redeem = (cookie: string, code: string) => json("/api/complimentary-codes/redeem", { method: "POST", cookie, body: JSON.stringify({ code }) });
const grantsOf = (userId: string) => all<any>("SELECT * FROM complimentary_grants WHERE user_id = ? ORDER BY created_at", userId);
const activeGrant = (userId: string) => one<any>("SELECT * FROM complimentary_grants WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", userId);

/* ---- 1. Schema: migration file = runtime statements, self-setup works ------ */
{
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const fileStatements = readFileSync(new URL("../migrations/0004_gift_codes.sql", import.meta.url), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map(normalize).filter(Boolean);
  h.eq(fileStatements.length, GIFT_SCHEMA_STATEMENTS.length, "migration 0004 has exactly the runtime schema statements");
  h.ok(fileStatements.every((statement, index) => statement === normalize(GIFT_SCHEMA_STATEMENTS[index])), "migration 0004 and src/gifts-schema.ts are identical, statement by statement");
  h.ok(!/ALTER TABLE/i.test(fileStatements.join(" ")), "the migration changes no existing table (it only adds one, and an index)");

  sql.exec("DROP INDEX idx_complimentary_grants_code; DROP TABLE gift_codes;");
  h.ok(!one("SELECT name FROM sqlite_master WHERE name = 'gift_codes'"), "simulated deploy before the migration: no gift_codes table");
  giftCodes.resetGiftSchemaCache();
  await giftCodes.ensureGiftSchema();
  h.ok(Boolean(one("SELECT name FROM sqlite_master WHERE name = 'gift_codes'")) && Boolean(one("SELECT name FROM sqlite_master WHERE name = 'idx_complimentary_grants_code'")), "the Worker creates the table and index on first use");
  giftCodes.resetGiftSchemaCache();
  await giftCodes.ensureGiftSchema();
  h.ok(true, "creating them again is harmless");
}

/* ---- 2. Gift lengths --------------------------------------------------------- */
{
  h.eq(GIFT_LENGTHS.map((entry) => entry.id).join(","), "week,month,3 months,6 months,year", "five gift lengths, keeping the old month and year ids");
  h.ok(isGiftLength("month") && isGiftLength("3 months") && !isGiftLength("2 weeks") && !isGiftLength(""), "only known lengths are accepted");
  const start = new Date("2026-10-16T10:00:00.000Z");
  h.eq(giftEndsAt(start, "week").toISOString(), "2026-10-23T10:00:00.000Z", "a week is seven days");
  h.eq(giftEndsAt(start, "month").toISOString(), "2026-11-16T10:00:00.000Z", "a month is a calendar month");
  h.eq(giftEndsAt(start, "3 months").toISOString(), "2027-01-16T10:00:00.000Z", "three months cross the year end correctly");
  h.eq(giftEndsAt(start, "6 months").toISOString(), "2027-04-16T10:00:00.000Z", "six months");
  h.eq(giftEndsAt(start, "year").toISOString(), "2027-10-16T10:00:00.000Z", "a year is a calendar year");
  const old = new Date(start); old.setUTCMonth(old.getUTCMonth() + 1);
  h.eq(giftEndsAt(start, "month").getTime(), old.getTime(), "a month ends exactly where gifts always ended");
  h.eq(giftLengthLabel("3 months"), "3 months", "labels read naturally");
  h.eq(giftLengthLabel("year"), "1 year", "the old ids read naturally too");
}

/* ---- Accounts ----------------------------------------------------------------- */
const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ email: OWNER, displayName: "Henry Owner", password: "a-long-enough-password", marketingConsent: true }) });
const token = String(registered.data.developmentVerificationUrl || "").split("token=")[1] || "";
await json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: OWNER, password: "a-long-enough-password" }) });
const ownerCookie = String(login.headers.get("set-cookie") || "").split(";")[0];
const ownerId = one<{ id: string }>("SELECT id FROM users WHERE email = ?", OWNER).id;
h.ok(Boolean(ownerCookie && ownerId) && one<any>("SELECT role FROM users WHERE id = ?", ownerId).role === "admin", "the owner administrator is signed in");
const asOwner = { cookie: ownerCookie };

addUser("usr_nia", "nia@example.com", "Nia New", { joinedDaysAgo: 3 });
addUser("usr_quinn", "quinn@example.com", "Quinn Quiet", { joinedDaysAgo: 90 });
addUser("usr_ada", "ada@example.com", "Ada Active", { joinedDaysAgo: 120 });
addUser("usr_omar", "omar@example.com", "Omar Never", { joinedDaysAgo: 45, consent: false });
addUser("usr_paul", "paul@example.com", "Paul Paying", { joinedDaysAgo: 200 });
addUser("usr_gina", "gina@example.com", "Gina Gift", { joinedDaysAgo: 40 });
addUser("usr_uma", "uma@example.com", "Uma Unconfirmed", { joinedDaysAgo: 2, verified: false });
addUser("usr_pct", "percent@example.com", "100% Real_Name", { joinedDaysAgo: 70 });
setPaid("usr_paul", "sceneflow");
addGrant("usr_gina", "sceneforge", daysAhead(20));
addGrant("usr_quinn", "sceneflow", daysAgo(5), { createdAt: daysAgo(36) }); // a gift that has run out
// Ada makes videos; Quinn made one long ago; Paul one this week.
for (let index = 0; index < 5; index += 1) addVideo("usr_ada", daysAgo(index * 2 + 1), index % 2 === 0 ? "short" : "long");
addVideo("usr_quinn", daysAgo(80), "long");
addVideo("usr_paul", daysAgo(0.1), "short");
addVideo("usr_pct", daysAgo(10), "short");

/* ---- 3. Only the owner administrator ---------------------------------------- */
{
  const customer = sessionFor("usr_ada");
  for (const [method, path] of [["GET", "/api/admin/members"], ["GET", "/api/admin/members/usr_ada"], ["GET", "/api/admin/gift-codes"], ["POST", "/api/admin/gift-codes"], ["GET", "/api/admin/gift-codes/gift_x"], ["PUT", "/api/admin/gift-codes/gift_x"]]) {
    const anonymous = await json(path, { method, body: method === "GET" ? undefined : "{}" });
    const member = await json(path, { method, cookie: customer, body: method === "GET" ? undefined : "{}" });
    h.ok(anonymous.status === 401 && member.status === 403, `${method} ${path} is closed to visitors (401) and customers (403)`);
  }
}

/* ---- 4. The member list ------------------------------------------------------ */
{
  const list = await json("/api/admin/members", asOwner);
  h.eq(list.status, 200, "the owner can list members");
  const emails = list.data.members.map((member: any) => member.email);
  h.ok(!emails.includes(OWNER), "the owner's own account is not listed as a member");
  h.eq(emails.length, 8, "every member is listed");
  h.eq(emails[0], "uma@example.com", "newest first by default");
  h.eq(list.data.counts.all, 8, "Everyone counts every member");
  h.eq(list.data.counts.free, 6, "Free: no paid plan and no running gift (an expired gift does not count)");
  h.eq(list.data.counts.paying, 1, "Paying: one subscription");
  h.eq(list.data.counts.gift, 1, "On a gift: one running gift");
  h.eq(list.data.counts.new, 2, "Joined in the last 30 days: two");
  h.eq(list.data.counts.no_video, 4, "No video yet: Nia, Omar, Gina and Uma");
  h.eq(list.data.counts.quiet, 3, "Quiet for 30 days: Quinn, Omar and Gina (joined over 30 days ago, nothing since)");
  h.eq(list.data.counts.unconfirmed, 1, "Email not confirmed: Uma");
  h.eq(list.data.hasMore, false, "one page is enough here");

  const byEmail = (rows: any[], email: string) => rows.find((row) => row.email === email);
  const gina = byEmail(list.data.members, "gina@example.com");
  h.ok(gina.giftPlan === "sceneforge" && Boolean(gina.giftEndsAt) && gina.paidPlan === null, "a running gift shows its plan and end date");
  const quinn = byEmail(list.data.members, "quinn@example.com");
  h.ok(quinn.giftPlan === null && quinn.videos === 1, "a gift that ran out is not shown as running");
  const paul = byEmail(list.data.members, "paul@example.com");
  h.ok(paul.paidPlan === "sceneflow" && paul.videos === 1, "a paying member shows the plan they pay for");
  const omar = byEmail(list.data.members, "omar@example.com");
  h.ok(omar.marketingConsent === false && byEmail(list.data.members, "ada@example.com").marketingConsent === true, "marketing consent is shown as it is");
  h.ok(byEmail(list.data.members, "uma@example.com").verified === false, "an unconfirmed email address is shown");

  const filtered = async (filter: string) => (await json(`/api/admin/members?filter=${filter}`, asOwner)).data.members.map((member: any) => member.email).sort().join(",");
  h.eq(await filtered("paying"), "paul@example.com", "the Paying filter");
  h.eq(await filtered("gift"), "gina@example.com", "the On a gift filter");
  h.eq(await filtered("no_video"), "gina@example.com,nia@example.com,omar@example.com,uma@example.com", "the No video yet filter");
  h.eq(await filtered("quiet"), "gina@example.com,omar@example.com,quinn@example.com", "the Quiet filter");
  h.eq(await filtered("new"), "nia@example.com,uma@example.com", "the Joined recently filter");
  h.eq(await filtered("unconfirmed"), "uma@example.com", "the Email not confirmed filter");
  h.eq(await filtered("nonsense"), (await filtered("all")), "an unknown filter shows everyone");
  for (const filter of MEMBER_FILTERS) {
    const rows = (await json(`/api/admin/members?filter=${filter}`, asOwner)).data.members.length;
    h.eq(rows, list.data.counts[filter], `the ${filter} count matches the rows the filter shows`);
  }

  const search = async (q: string) => (await json(`/api/admin/members?q=${encodeURIComponent(q)}`, asOwner)).data.members.map((member: any) => member.email).sort().join(",");
  h.eq(await search("ADA"), "ada@example.com", "search finds a name, whatever the case");
  h.eq(await search("omar@"), "omar@example.com", "search finds an email address");
  h.eq(await search("100%"), "percent@example.com", "a % in the search is a real character, not a wildcard");
  h.eq(await search("%"), "percent@example.com", "a % on its own finds only names with a %");
  h.eq(await search("_"), "percent@example.com", "and an underscore only names with an underscore");
  h.eq(await search("nobody-like-this"), "", "no match, no rows");

  const sorted = await json("/api/admin/members?sort=videos", asOwner);
  h.eq(sorted.data.members[0].email, "ada@example.com", "Most videos puts the busiest member first");
  const recent = await json("/api/admin/members?sort=active", asOwner);
  h.eq(recent.data.members[0].email, "paul@example.com", "Last video puts the most recent video first");
  h.ok(recent.data.members.slice(-1)[0].videos === 0, "members without videos come last");

  // Paging: 60 more members.
  for (let index = 0; index < 60; index += 1) addUser(`usr_bulk${index}`, `bulk${index}@example.com`, `Bulk ${index}`, { joinedDaysAgo: 300 + index });
  const page1 = await json("/api/admin/members?filter=all", asOwner);
  h.ok(page1.data.members.length === 50 && page1.data.hasMore === true, "the list comes in pages of 50");
  const page2 = await json("/api/admin/members?filter=all&offset=50", asOwner);
  h.ok(page2.data.members.length === 18 && page2.data.hasMore === false, "the second page holds the rest");
  h.eq(new Set([...page1.data.members, ...page2.data.members].map((member: any) => member.id)).size, 68, "no member appears twice across pages");
  sql.exec("DELETE FROM users WHERE id LIKE 'usr_bulk%'");
}

/* ---- 5. One member ------------------------------------------------------------ */
{
  const detail = await json("/api/admin/members/usr_ada", asOwner);
  h.eq(detail.status, 200, "the owner can open a member");
  h.ok(detail.data.member.email === "ada@example.com" && detail.data.member.plan === "free", "with their account and plan");
  h.eq(detail.data.activity.videos, 5, "all their videos are counted");
  h.ok(detail.data.activity.shorts === 3 && detail.data.activity.long === 2, "split into Shorts and long videos");
  h.ok(Boolean(detail.data.activity.firstVideoAt && detail.data.activity.lastVideoAt), "with the first and last video dates");
  h.ok(detail.data.consent.given === true, "and their marketing consent");
  h.eq((await json("/api/admin/members/usr_nobody", asOwner)).status, 404, "an unknown member is 404");
  h.eq((await json(`/api/admin/members/${ownerId}`, asOwner)).status, 404, "the owner's own account cannot be opened as a member");

  const paul = await json("/api/admin/members/usr_paul", asOwner);
  h.ok(paul.data.subscription && paul.data.subscription.planId === "sceneflow" && paul.data.subscription.interval === "monthly", "a paying member's subscription is shown");
  h.ok(paul.data.member.source === "verified_subscription", "and where their plan comes from");
  const gina = await json("/api/admin/members/usr_gina", asOwner);
  h.ok(gina.data.member.plan === "sceneforge" && gina.data.member.source === "complimentary", "a gift member's plan is the gift");
  h.ok(gina.data.gifts.length === 1 && gina.data.gifts[0].active === true && gina.data.gifts[0].code === null, "their gift is listed as running, given by the owner");

  // Emails and conversations.
  sql.prepare("INSERT INTO email_templates (id, name, subject, html_body, created_by, created_at, updated_at) VALUES ('tpl_m', 'Members test', 'Hi', '<p>Hi</p>', ?, ?, ?)").run(ownerId, daysAgo(3), daysAgo(3));
  sql.prepare("INSERT INTO email_campaigns (id, name, template_id, subject, audience_type, status, created_by, created_at, updated_at) VALUES ('cmp_m', 'Welcome new members (1 of 3)', 'tpl_m', '', 'all_consented', 'completed', ?, ?, ?)").run(ownerId, daysAgo(3), daysAgo(3));
  sql.prepare("INSERT INTO email_deliveries (id, campaign_id, user_id, email, status, sent_at, created_at, updated_at) VALUES ('dlv_m', 'cmp_m', 'usr_ada', 'ada@example.com', 'delivered', ?, ?, ?)").run(daysAgo(3), daysAgo(3), daysAgo(3));
  await json("/api/admin/inbox/summary", asOwner); // creates the inbox tables
  sql.prepare("INSERT INTO inbox_threads (id, subject, contact_email, contact_name, user_id, mailbox, source, category, status, unread, message_count, last_message_at, last_direction, last_preview, created_at, updated_at) VALUES ('thr_ada', 'Captions question', 'ada@example.com', 'Ada', NULL, 'vincent@scenering.com', 'email', '', 'open', 0, 1, ?, 'in', 'Hello', ?, ?)").run(daysAgo(1), daysAgo(1), daysAgo(1));
  sql.prepare("INSERT INTO inbox_threads (id, subject, contact_email, contact_name, user_id, mailbox, source, category, status, unread, message_count, last_message_at, last_direction, last_preview, created_at, updated_at) VALUES ('thr_spam', 'Buy now', 'ada@example.com', 'Ada', 'usr_ada', 'vincent@scenering.com', 'email', '', 'spam', 0, 1, ?, 'in', 'Spam', ?, ?)").run(daysAgo(1), daysAgo(1), daysAgo(1));
  const withMail = await json("/api/admin/members/usr_ada", asOwner);
  h.ok(withMail.data.emails.length === 1 && withMail.data.emails[0].campaignName === "Welcome new members (1 of 3)" && withMail.data.emails[0].status === "delivered", "the campaign emails a member received are listed");
  h.ok(withMail.data.conversations.length === 1 && withMail.data.conversations[0].id === "thr_ada", "conversations are found by address too, and spam is left out");
}

/* ---- 6. Giving free time directly, in every length --------------------------- */
{
  const before = Date.now();
  const week = await json("/api/admin/complimentary-memberships", { method: "POST", ...asOwner, body: JSON.stringify({ userId: "usr_nia", planId: "sceneflow", period: "week", reason: "Members test" }) });
  h.eq(week.status, 201, "a one-week gift can be given");
  const weekEnds = Date.parse(week.data.grant.ends_at);
  h.ok(Math.abs(weekEnds - before - 7 * DAY) < 60000, "it ends seven days later");
  h.ok(week.data.grant.ends_at === week.data.grant.endsAt && week.data.grant.period === "week", "the answer carries the end date in both spellings the screens read");
  const quarter = await json("/api/admin/complimentary-memberships", { method: "POST", ...asOwner, body: JSON.stringify({ userId: "usr_nia", planId: "sceneforge", period: "3 months" }) });
  h.eq(quarter.status, 201, "a three-month gift can be given");
  h.eq(grantsOf("usr_nia").filter((grant) => grant.status === "active").length, 1, "a new gift replaces the running one, as always");
  const expected = new Date(Date.parse(quarter.data.grant.starts_at)); expected.setUTCMonth(expected.getUTCMonth() + 3);
  h.eq(quarter.data.grant.ends_at, expected.toISOString(), "three calendar months");
  const month = await json("/api/admin/complimentary-memberships", { method: "POST", ...asOwner, body: JSON.stringify({ userId: "usr_nia", planId: "sceneflow", period: "month" }) });
  h.ok(month.status === 201 && month.data.grant.period === "month", "a month still works exactly as before");
  const bad = await json("/api/admin/complimentary-memberships", { method: "POST", ...asOwner, body: JSON.stringify({ userId: "usr_nia", planId: "sceneflow", period: "2 weeks" }) });
  h.eq(bad.status, 400, "an unknown length is refused");
  const unconfirmed = await json("/api/admin/complimentary-memberships", { method: "POST", ...asOwner, body: JSON.stringify({ userId: "usr_uma", planId: "sceneflow", period: "week" }) });
  h.eq(unconfirmed.status, 404, "a member who has not confirmed their email cannot be given a gift (unchanged rule)");
  // Reset Nia for the code tests.
  sql.prepare("UPDATE complimentary_grants SET status = 'revoked' WHERE user_id = 'usr_nia'").run();
}

/* ---- 7. Making gift codes ----------------------------------------------------- */
const make = (body: Record<string, unknown>) => json("/api/admin/gift-codes", { method: "POST", ...asOwner, body: JSON.stringify(body) });
const valid = { planId: "sceneflow", period: "month", maxUses: null, newMembersOnly: false, claimByDays: 30 };
{
  for (const [body, label] of [
    [{ ...valid, planId: "free" }, "the Free plan"], [{ ...valid, period: "fortnight" }, "an unknown length"], [{ ...valid, maxUses: 0 }, "zero people"],
    [{ ...valid, maxUses: 1.5 }, "half a person"], [{ ...valid, maxUses: 100001 }, "more than 100,000 people"], [{ ...valid, claimByDays: 0 }, "no days to use it"],
    [{ ...valid, claimByDays: 731 }, "more than two years"], [{ ...valid, claimByDays: undefined, claimByDate: "2020-01-01" }, "a last day in the past"],
    [{ ...valid, claimByDays: undefined, claimByDate: "16/10/2026" }, "a date in another format"], [{ ...valid, code: "AB" }, "a code that is too short"],
    [{ ...valid, code: "HELLO THERE" }, "a code with a space"], [{ ...valid, code: "SCN-MINE" }, "a code that looks like a one-time code"], [{ ...valid, code: "-START" }, "a code starting with a dash"],
  ] as Array<[Record<string, unknown>, string]>) {
    const result = await make(body);
    h.ok(result.status === 400 && typeof result.data.error === "string" && result.data.error.length > 10, `refuses ${label}, with a message`);
  }
  const madeUp = await make(valid);
  h.eq(madeUp.status, 201, "a code can be made");
  h.ok(/^GIFT-[2-9A-HJ-NP-Z]{6}$/.test(madeUp.data.code.code), `a made-up code is easy to read: ${madeUp.data.code.code}`);
  h.eq(madeUp.data.code.label, "SceneFlow for 1 month", "without a name, the code is named after its gift");
  h.ok(madeUp.data.code.state === "active" && madeUp.data.code.results.claimed === 0, "a new code is open, with no uses yet");
  const codes = new Set(await Promise.all(Array.from({ length: 12 }, async () => (await make(valid)).data.code.code)));
  h.eq(codes.size, 12, "made-up codes do not repeat");
  const own = await make({ ...valid, code: "  welcome-oct ", label: "October newsletter" });
  h.ok(own.status === 201 && own.data.code.code === "WELCOME-OCT" && own.data.code.label === "October newsletter", "an own code is kept in capitals, without spaces around it");
  const taken = await make({ ...valid, code: "Welcome-Oct" });
  h.ok(taken.status === 409 && /already taken/.test(taken.data.error), "an own code that is taken is refused");
  const dated = await make({ ...valid, claimByDays: undefined, claimByDate: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10) });
  h.ok(dated.status === 201 && dated.data.code.expiresAt.endsWith("T23:59:59.999Z"), "a last day means the end of that day");
  const list = await json("/api/admin/gift-codes", asOwner);
  h.ok(list.status === 200 && list.data.codes.length >= 15 && list.data.codes[0].createdAt >= list.data.codes[list.data.codes.length - 1].createdAt, "codes are listed newest first");
  h.ok(String(sql.prepare("SELECT code FROM gift_codes WHERE code = 'WELCOME-OCT'").get()?.code) === "WELCOME-OCT", "the code is stored readable, so it can be shared again later");
}

/* ---- 8. Using gift codes ------------------------------------------------------ */
addUser("usr_cara", "cara@example.com", "Cara Claimer", { joinedDaysAgo: 50 });
addUser("usr_dan", "dan@example.com", "Dan Second", { joinedDaysAgo: 50 });
addUser("usr_eve", "eve@example.com", "Eve Third", { joinedDaysAgo: 50 });
const cara = sessionFor("usr_cara");
const dan = sessionFor("usr_dan");
const eve = sessionFor("usr_eve");
{
  const code = (await make({ ...valid, maxUses: 2, label: "Two people" })).data.code;
  const claimed = await redeem(cara, `  ${code.code.toLowerCase()} `);
  h.eq(claimed.status, 200, "a member can use a gift code, typed in any case with spaces around it");
  h.ok(claimed.data.redeemed === true && claimed.data.membership.plan_id === "sceneflow" && claimed.data.membership.source === "complimentary", "their plan is now the gift");
  h.ok(Boolean(claimed.data.grant.ends_at) && claimed.data.grant.ends_at === claimed.data.grant.endsAt, "the answer carries the end date the account screen reads");
  const grant = activeGrant("usr_cara");
  h.ok(grant.access_code_id === code.id && grant.plan_id === "sceneflow" && grant.period === "month" && grant.reason === `Gift code ${code.code}`, "the gift is an ordinary grant that remembers its code");
  const expectedEnd = new Date(grant.starts_at); expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 1);
  h.eq(grant.ends_at, expectedEnd.toISOString(), "it lasts the code's length");
  h.ok(Boolean(one("SELECT id FROM billing_events WHERE user_id = 'usr_cara' AND event_name = 'gift_code_claimed'")), "the use is recorded in the billing history");
  const session = await json("/api/auth/session", { cookie: cara });
  h.ok(session.status === 200 && session.data.membership?.plan_id === "sceneflow" && session.data.membership?.source === "complimentary", "the member's own account shows the gift");

  const again = await redeem(cara, code.code);
  h.ok(again.status === 400 && /already used/.test(again.data.error), "the same person cannot use a code twice");
  h.eq(grantsOf("usr_cara").length, 1, "and nothing more was written");
  h.eq((await redeem(dan, code.code)).status, 200, "a second person can use it");
  const third = await redeem(eve, code.code);
  h.ok(third.status === 400 && /used up/.test(third.data.error), "a third person finds it used up");
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM complimentary_grants WHERE access_code_id = ?", code.id).n), 2, "exactly two gifts were given");
  const listed = (await json("/api/admin/gift-codes", asOwner)).data.codes.find((entry: any) => entry.id === code.id);
  h.ok(listed.state === "used_up" && listed.results.claimed === 2, "the code shows as used up");

  // Racing for the last place: one wins.
  addUser("usr_r1", "r1@example.com", "Racer One", { joinedDaysAgo: 30 });
  addUser("usr_r2", "r2@example.com", "Racer Two", { joinedDaysAgo: 30 });
  addUser("usr_r3", "r3@example.com", "Racer Three", { joinedDaysAgo: 30 });
  const last = (await make({ ...valid, maxUses: 1 })).data.code;
  const results = await Promise.all([redeem(sessionFor("usr_r1"), last.code), redeem(sessionFor("usr_r2"), last.code), redeem(sessionFor("usr_r3"), last.code)]);
  h.eq(results.filter((result) => result.status === 200).length, 1, "three people racing for one place: exactly one gets it");
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM complimentary_grants WHERE access_code_id = ?", last.id).n), 1, "and only one gift exists");

  // The claim statement itself is the guard, even when the checks before it are skipped.
  const guarded = (await make({ ...valid, maxUses: 1 })).data.code;
  const giftsDbModule = await import("../src/gifts-db.ts");
  const write = (userId: string) => giftsDbModule.giftsDb.claim({ codeId: guarded.id, userId, grantId: `grant_direct_${userId}`, startsAt: new Date().toISOString(), endsAt: daysAhead(30), reason: "direct", now: new Date().toISOString() });
  h.ok((await write("usr_r1")) === true && (await write("usr_r2")) === false, "the write refuses a use over the limit on its own");
  const repeat = (await make({ ...valid, maxUses: 5 })).data.code;
  const writeRepeat = (grantId: string) => giftsDbModule.giftsDb.claim({ codeId: repeat.id, userId: "usr_r3", grantId, startsAt: new Date().toISOString(), endsAt: daysAhead(30), reason: "direct", now: new Date().toISOString() });
  h.ok((await writeRepeat("grant_rep_1")) === true && (await writeRepeat("grant_rep_2")) === false, "and a second use by the same person");
}
{
  // Paused, ended, past its last day.
  addUser("usr_f1", "f1@example.com", "Fay One", { joinedDaysAgo: 30 });
  const fay = sessionFor("usr_f1");
  const code = (await make(valid)).data.code;
  await json(`/api/admin/gift-codes/${code.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ status: "paused" }) });
  const paused = await redeem(fay, code.code);
  h.ok(paused.status === 400 && /not available right now/.test(paused.data.error), "a paused code cannot be used");
  h.eq(grantsOf("usr_f1").length, 0, "and no place was used");
  await json(`/api/admin/gift-codes/${code.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ status: "active" }) });
  h.eq((await redeem(fay, code.code)).status, 200, "started again, it works");
  const ended = (await make(valid)).data.code;
  await json(`/api/admin/gift-codes/${ended.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ status: "ended" }) });
  addUser("usr_f2", "f2@example.com", "Fred Two", { joinedDaysAgo: 30 });
  const fred = sessionFor("usr_f2");
  const endedUse = await redeem(fred, ended.code);
  h.ok(endedUse.status === 400 && /has ended/.test(endedUse.data.error), "an ended code cannot be used");
  const restart = await json(`/api/admin/gift-codes/${ended.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ status: "active" }) });
  h.eq(restart.status, 400, "an ended code cannot be started again");
  const old = (await make(valid)).data.code;
  sql.prepare("UPDATE gift_codes SET expires_at = ? WHERE id = ?").run(daysAgo(1), old.id);
  const late = await redeem(fred, old.code);
  h.ok(late.status === 400 && /expired/.test(late.data.error), "a code past its last day cannot be used");
  const states = (await json("/api/admin/gift-codes", asOwner)).data.codes;
  h.eq(states.find((entry: any) => entry.id === old.id).state, "expired", "and shows as past its last day");
  h.eq(states.find((entry: any) => entry.id === ended.id).state, "ended", "an ended code shows as ended");
}
{
  // New members only.
  const forNew = (await make({ ...valid, newMembersOnly: true, label: "Partner: Jane's channel" })).data.code;
  const before = await redeem(eve, forNew.code);
  h.ok(before.status === 400 && /new members only/.test(before.data.error), "someone who joined before the code was made cannot use a new-members code");
  addUser("usr_newbie", "newbie@example.com", "Nell Newbie", { createdAt: new Date(Date.now() + 1000).toISOString() });
  h.eq((await redeem(sessionFor("usr_newbie"), forNew.code)).status, 200, "someone who joined after can");
}
{
  // A gift never takes something away.
  const flowCode = (await make(valid)).data.code;
  const paul = sessionFor("usr_paul");
  const paying = await redeem(paul, flowCode.code);
  h.ok(paying.status === 400 && /already includes/.test(paying.data.error), "a member who pays for the same plan is told their plan already includes it");
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM complimentary_grants WHERE access_code_id = ?", flowCode.id).n), 0, "and no place was used");
  const forgeCode = (await make({ ...valid, planId: "sceneforge", period: "week" })).data.code;
  h.eq((await redeem(paul, forgeCode.code)).status, 200, "a SceneFlow member can use a SceneForge gift (an upgrade for the gift's length)");
  h.ok(Boolean(one("SELECT 1 AS found FROM subscriptions WHERE user_id = 'usr_paul' AND status = 'active'")), "their subscription is untouched");
  const forgeResults = (await json("/api/admin/gift-codes", asOwner)).data.codes.find((entry: any) => entry.id === forgeCode.id).results;
  h.ok(forgeResults.claimed === 1 && forgeResults.thenPaid === 0, "someone who was already paying before the gift is not counted as going on to pay");

  // Gina has SceneForge until 20 days from now.
  const gina = sessionFor("usr_gina");
  const weaker = await redeem(gina, (await make({ ...valid, period: "week" })).data.code.code);
  h.ok(weaker.status === 400 && /at least as good/.test(weaker.data.error), "a running gift that is better and lasts longer is kept, and the member is told");
  h.eq(activeGrant("usr_gina").plan_id, "sceneforge", "Gina keeps her SceneForge gift");
  const longer = await redeem(gina, (await make({ ...valid, planId: "sceneforge", period: "6 months" })).data.code.code);
  h.eq(longer.status, 200, "a longer gift of the same plan replaces the running one");
  h.eq(grantsOf("usr_gina").filter((grant) => grant.status === "active").length, 1, "only one gift runs at a time");

  const admin = await redeem(ownerCookie, flowCode.code);
  h.eq(admin.status, 400, "the owner's own account cannot use a gift code");
  const unknown = await redeem(eve, "NO-SUCH-CODE");
  h.ok(unknown.status === 400 && unknown.data.error === "This access code is invalid, expired, revoked, or already used.", "an unknown code gets the same answer as before");
  h.eq((await json("/api/complimentary-codes/redeem", { method: "POST", body: JSON.stringify({ code: flowCode.code }) })).status, 401, "using a code needs an account");
}
{
  // The one-time codes still work, and can no longer be used twice by racing.
  addUser("usr_o1", "o1@example.com", "Ola One", { joinedDaysAgo: 20 });
  addUser("usr_o2", "o2@example.com", "Oto Two", { joinedDaysAgo: 20 });
  const oneTime = await json("/api/admin/complimentary-codes", { method: "POST", ...asOwner, body: JSON.stringify({ planId: "sceneforge", validForDays: 30 }) });
  h.eq(oneTime.status, 201, "a one-time code can still be made");
  const raced = await Promise.all([redeem(sessionFor("usr_o1"), oneTime.data.code), redeem(sessionFor("usr_o2"), oneTime.data.code)]);
  h.eq(raced.filter((result) => result.status === 200).length, 1, "two people racing with one one-time code: exactly one gets it");
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM complimentary_grants WHERE access_code_id = ?", oneTime.data.codeId).n), 1, "one gift from the one-time code");
  const winner = raced[0].status === 200 ? raced[0] : raced[1];
  h.ok(winner.data.grant.ends_at && winner.data.grant.period === "year", "the one-time code still gives a year, and its answer carries ends_at too");
  // The mark-as-used write itself only succeeds once, however close two requests are.
  const second = await json("/api/admin/complimentary-codes", { method: "POST", ...asOwner, body: JSON.stringify({ planId: "sceneflow", validForDays: 7 }) });
  const { db } = await import("../src/db.ts");
  h.ok((await db.redeemComplimentaryCode(second.data.codeId, "usr_o1")) === true && (await db.redeemComplimentaryCode(second.data.codeId, "usr_o2")) === false, "marking a one-time code used succeeds only for the first request");
  h.eq(one<any>("SELECT redeemed_by FROM complimentary_codes WHERE id = ?", second.data.codeId).redeemed_by, "usr_o1", "and the code stays with the first person");
}

/* ---- 9. Results and changes ---------------------------------------------------- */
{
  addUser("usr_x1", "x1@example.com", "Xena Video", { joinedDaysAgo: 100 });
  addUser("usr_x2", "x2@example.com", "Xavier Pays", { joinedDaysAgo: 100 });
  const code = (await make({ ...valid, maxUses: 10, label: "Results" })).data.code;
  addUser("usr_x3", "x3@example.com", "Xia Joined", { createdAt: new Date(Date.now() + 2000).toISOString() });
  for (const id of ["usr_x1", "usr_x2", "usr_x3"]) h.eq((await redeem(sessionFor(id), code.code)).status, 200, `${id} uses the results code`);
  addVideo("usr_x1", daysAhead(0.01));
  addVideo("usr_x1", daysAhead(0.02));
  setPaid("usr_x2", "sceneforge", daysAhead(0.01));
  sql.prepare("UPDATE complimentary_grants SET status = 'revoked' WHERE user_id = 'usr_x3' AND access_code_id = ?").run(code.id);
  const listed = (await json("/api/admin/gift-codes", asOwner)).data.codes.find((entry: any) => entry.id === code.id);
  h.eq(listed.results.claimed, 3, "used it: three");
  h.eq(listed.results.newMembers, 1, "joined for it: one (made their account after the code)");
  h.eq(listed.results.onGift, 2, "still on the gift: two (one gift was ended)");
  h.eq(listed.results.madeVideo, 1, "made a video since: one");
  h.eq(listed.results.thenPaid, 1, "went on to pay: one");
  const detail = await json(`/api/admin/gift-codes/${code.id}`, asOwner);
  h.ok(detail.status === 200 && detail.data.people.length === 3, "the code's people are listed");
  const xena = detail.data.people.find((person: any) => person.email === "x1@example.com");
  h.ok(xena.videosSince === 2 && xena.active === true && xena.thenPaid === false, "each with their videos since, whether the gift runs, and whether they paid");
  h.ok(detail.data.people.find((person: any) => person.email === "x2@example.com").thenPaid === true, "a member who subscribed afterwards shows as paying");
  h.ok(detail.data.people.find((person: any) => person.email === "x3@example.com").active === false, "an ended gift shows as over");
  h.eq((await json("/api/admin/gift-codes/gift_nope", asOwner)).status, 404, "an unknown code is 404");

  const lower = await json(`/api/admin/gift-codes/${code.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ maxUses: 2 }) });
  h.ok(lower.status === 400 && /cannot be lower/.test(lower.data.error), "the limit cannot drop below the people who already used it");
  const changed = await json(`/api/admin/gift-codes/${code.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ label: "Results, renamed", maxUses: null, claimByDate: new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10) }) });
  h.ok(changed.status === 200 && changed.data.code.label === "Results, renamed" && changed.data.code.maxUses === null && changed.data.code.expiresAt.endsWith("T23:59:59.999Z"), "the name, the limit and the last day can be changed");
  h.ok(changed.data.code.planId === "sceneflow" && changed.data.code.period === "month", "the gift itself stays the same");
  const badStatus = await json(`/api/admin/gift-codes/${code.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ status: "deleted" }) });
  h.eq(badStatus.status, 400, "an unknown status is refused");

  // The member screen shows where a gift came from.
  const xenaDetail = await json("/api/admin/members/usr_x1", asOwner);
  h.ok(xenaDetail.data.gifts[0].code && xenaDetail.data.gifts[0].code.code === code.code && xenaDetail.data.gifts[0].code.label === "Results, renamed", "a member's gift names the code it came from");
}

/* ---- 10. Who campaign emails come from ----------------------------------------- */
{
  const settings = await json("/api/admin/inbox/settings", asOwner);
  h.eq(settings.data.settings.campaignFrom, "", "by default campaign emails keep the no-reply sender");
  const template = await json("/api/admin/email/templates", { method: "POST", ...asOwner, body: JSON.stringify({ name: "From check", category: "announcement", subject: "From check", preheader: "", htmlBody: "<p>Hello {{first_name}}</p>", textBody: "" }) });
  const campaign = await json("/api/admin/email/campaigns", { method: "POST", ...asOwner, body: JSON.stringify({ name: "From check", templateId: template.data.template.id, subject: "", audienceType: "test_recipient", testEmail: "check@example.com" }) });
  h.eq(campaign.status, 201, "a campaign to a test address is made");
  sent.length = 0;
  await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}/test`, { method: "POST", ...asOwner, body: JSON.stringify({ to: "owner-test@example.com" }) });
  h.ok(sent.length === 1 && sent[0].from === "Scenering <noreply@scenering.com>", "a test send comes from the no-reply sender by default");

  const wrong = await json("/api/admin/inbox/settings", { method: "PUT", ...asOwner, body: JSON.stringify({ campaignFrom: "someone@else.com" }) });
  h.eq(wrong.status, 400, "campaigns can only come from one of the owner's own addresses");
  const chosen = await json("/api/admin/inbox/settings", { method: "PUT", ...asOwner, body: JSON.stringify({ campaignFrom: "Vincent@Scenering.com" }) });
  h.ok(chosen.status === 200 && chosen.data.settings.campaignFrom === "vincent@scenering.com", "the personal address can be chosen (any letter case)");
  sent.length = 0;
  await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}/test`, { method: "POST", ...asOwner, body: JSON.stringify({ to: "owner-test@example.com" }) });
  h.ok(sent[0]?.from === "Vincent from Scenering <vincent@scenering.com>" && sent[0]?.replyTo === "vincent@scenering.com", "then test sends come from it, and replies go to it");
  sent.length = 0;
  const send = await json(`/api/admin/email/campaigns/${campaign.data.campaign.id}/send`, { method: "POST", ...asOwner, body: "{}" });
  h.eq(send.status, 200, "the campaign is sent");
  h.ok(sent.length === 1 && sent[0].to === "check@example.com" && sent[0].from === "Vincent from Scenering <vincent@scenering.com>" && sent[0].replyTo === "vincent@scenering.com", "and the real send comes from it too");

  await json("/api/admin/inbox/settings", { method: "PUT", ...asOwner, body: JSON.stringify({ campaignFrom: "support@scenering.com" }) });
  const current = (await json("/api/admin/inbox/settings", asOwner)).data.settings;
  h.eq(current.campaignFrom, "support@scenering.com", "another of the owner's addresses can be chosen");
  const removed = await json("/api/admin/inbox/settings", { method: "PUT", ...asOwner, body: JSON.stringify({ ...current, otherAddresses: current.otherAddresses.filter((entry: any) => entry.address !== "support@scenering.com") }) });
  h.ok(removed.status === 200 && removed.data.settings.campaignFrom === "", "removing that address puts campaigns back on the no-reply sender instead of failing");
  settingsModule.clearInboxSettingsCache();
  const stored = settingsModule.campaignFromIdentity({ ...(await settingsModule.getInboxSettings()), campaignFrom: "gone@scenering.com" });
  h.eq(stored, null, "a stored address that no longer exists is never used");
}

/* ---- 11. The gift plan and the screens' helpers -------------------------------- */
{
  const plan = plans.CAMPAIGN_PLANS.find((entry) => entry.id === "gift-month")!;
  h.ok(Boolean(plan && plan.gift && plan.audience.type === "free_plan"), "there is a gift plan for Free members");
  const gift = { code: "WELCOME-OCT", planId: "sceneforge" as const, period: "3 months", expiresAt: "2026-11-30T23:59:59.999Z" };
  const payload = plans.planTemplatePayload(plan, 0, gift);
  h.ok(payload.subject.includes("three free months of SceneForge"), "the subject names the real gift");
  h.ok(payload.textBody.includes("WELCOME-OCT") && payload.htmlBody.includes("https://scenering.com/app?code=WELCOME-OCT"), "the email carries the code and the link that adds it");
  h.ok(payload.textBody.includes("30 November"), "and the last day to use it");
  h.ok(payload.textBody.includes("No weekly download limit") && !payload.textBody.includes("15 video downloads"), "SceneForge's downloads are described as SceneForge's");
  h.ok(!/\[\[/.test([payload.subject, payload.preheader, payload.htmlBody, payload.textBody].join(" ")), "no placeholder is left");
  h.eq(plans.planTemplateName(plan, 0, gift), "Plan: Free month gift (1 of 2) Your gift, WELCOME-OCT", "each code gets its own templates");
  const flow = plans.planTemplatePayload(plan, 0, { ...gift, planId: "sceneflow", period: "month" });
  h.ok(flow.subject.includes("a free month of SceneFlow") && flow.textBody.includes("15 video downloads every week"), "a SceneFlow month reads as one");
  const preview = plans.planTemplatePayload(plan, 1);
  h.ok(preview.textBody.includes(plans.EXAMPLE_GIFT_CODE), "previews show the example code");
  h.eq(plans.giftPhrase({ planId: "sceneflow", period: "week" }), "a free week of SceneFlow", "a week reads naturally");
  h.eq(plans.giftPhrase({ planId: "sceneforge", period: "year" }), "a free year of SceneForge", "a year reads naturally");
  const links = membersApiModule.giftLinks("WELCOME-OCT", "https://scenering.com");
  h.ok(links.members === "https://scenering.com/app?code=WELCOME-OCT" && links.newPeople === "https://scenering.com/register?code=WELCOME-OCT", "the two links a code is shared with");
  h.eq(membersApiModule.giftText("sceneflow", "6 months"), "SceneFlow for 6 months", "gift descriptions read naturally");
  const condition = memberFilterCondition("free", new Date());
  h.ok(condition.params.length === (condition.sql.match(/\?/g) || []).length && !condition.sql.includes(String(condition.params[0])), "filters are parameterised SQL: values are bound, never written into the query");
}

/* ---- 12. Arriving through the link for new people ------------------------------- */
{
  // The sign-in page adds the code a new person arrived with. The studio opens
  // the moment sign-in succeeds, so the account has to be read again once the
  // gift is added; otherwise the studio keeps treating them as Free (watermark,
  // VIP tools taken out of the export) until they reload the page.
  const signInPage = readFileSync(new URL("../src/studio/SignIn.tsx", import.meta.url), "utf8");
  const block = signInPage.slice(signInPage.indexOf("if (intendedCode) {"), signInPage.indexOf("scenering_intended_checkout\");", signInPage.indexOf("if (intendedCode) {")));
  const forget = block.indexOf("localStorage.removeItem(\"scenering_intended_access_code\")");
  const redeem = block.indexOf("await redeemComplimentaryCode(intendedCode)");
  const reread = block.indexOf("await refreshSession()");
  h.ok(forget >= 0 && redeem > forget, "the code is forgotten before it is tried, so a used-up code is not tried at every sign-in");
  h.ok(reread > redeem, "after the gift is added the account is read again, so the studio shows the gifted plan straight away");
}

server.close();
globalThis.fetch = originalFetch;
h.done("Members and gifts");
