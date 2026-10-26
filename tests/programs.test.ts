/**
 * Email programmes, exercised end to end: the admin API, the ready-made
 * programmes' copy, and the cron runner (processEmailPrograms) driven with
 * a moving clock, so each member's emails can be followed day by day.
 *
 * Real Express routes and real SQL (node:sqlite running the real
 * migrations); only Resend is faked, at the fetch boundary.
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
process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("resend-webhook-test-secret").toString("base64");
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
const programs = await import("../server/programs.ts");
const { PROGRAM_SCHEMA_STATEMENTS } = await import("../src/programs-schema.ts");
const ready = await import("../src/admin/email-programmes.ts");
const plans = await import("../src/admin/email-plans.ts");
const { EMAIL_TEMPLATE_VARIABLES } = await import("../src/admin/email-centre-api.ts");

const app = express();
emailCentre.registerResendWebhook(app);
app.use(express.json());
platform.registerPlatformRoutes(app);
emailCentre.registerEmailCentreRoutes(app);
inbox.registerInboxRoutes(app);
programs.registerProgramRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

/* ---- Fakes and helpers ------------------------------------------------------ */
const originalFetch = globalThis.fetch;
interface Sent { to: string; from: string; subject: string; text: string; replyTo?: string; headers?: Record<string, string>; tags?: Array<{ name: string; value: string }>; id: string }
const sent: Sent[] = [];
const failFor = new Set<string>();
let resendIds = 0;
globalThis.fetch = (async (input: any, init?: any) => {
  if (String(input) === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body));
    if (failFor.has(body.to[0])) return new Response(JSON.stringify({ message: "Invalid `to` field." }), { status: 422 });
    resendIds += 1;
    const id = `re_${resendIds}`;
    sent.push({ to: body.to[0], from: body.from, subject: body.subject, text: body.text, replyTo: body.reply_to, headers: body.headers, tags: body.tags, id });
    return new Response(JSON.stringify({ id }), { status: 200 });
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
const at = (offsetMs: number) => new Date(Date.now() + offsetMs);

function addUser(id: string, email: string, name: string, options: { createdAt?: string; verified?: boolean; consent?: boolean } = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  sql.prepare("INSERT INTO users (id, email, password_hash, display_name, role, is_verified, created_at, updated_at) VALUES (?, ?, 'x:y:z', ?, 'user', ?, ?, ?)")
    .run(id, email, name, options.verified === false ? 0 : 1, createdAt, createdAt);
  sql.prepare("INSERT INTO email_preferences (user_id, marketing_consent, consent_timestamp, consent_source, consent_version, training_step, updated_at) VALUES (?, ?, ?, 'registration', 'v1', 0, ?)")
    .run(id, options.consent === false ? 0 : 1, createdAt, createdAt);
  sql.prepare("INSERT INTO memberships (id, user_id, plan, status, created_at, updated_at) VALUES (?, ?, 'free', 'active', ?, ?)").run(`mem_${id}`, id, createdAt, createdAt);
}
function sessionFor(userId: string): string {
  const raw = `test-session-${userId}-${randomUUID()}`;
  const hash = createHmac("sha256", process.env.SESSION_SECRET!).update(raw).digest("hex");
  sql.prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(`sess_${randomUUID().slice(0, 12)}`, userId, hash, at(30 * DAY).toISOString(), new Date().toISOString());
  return `scenering_session=${encodeURIComponent(raw)}`;
}
const sendsOf = (programId: string, userId: string) => all<any>("SELECT * FROM email_program_sends WHERE program_id = ? AND user_id = ? ORDER BY due_at", programId, userId);

/* ---- 1. Schema --------------------------------------------------------------- */
{
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const fileStatements = readFileSync(new URL("../migrations/0005_programs.sql", import.meta.url), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map(normalize).filter(Boolean);
  h.eq(fileStatements.length, PROGRAM_SCHEMA_STATEMENTS.length, "migration 0005 has exactly the runtime schema statements");
  h.ok(fileStatements.every((statement, index) => statement === normalize(PROGRAM_SCHEMA_STATEMENTS[index])), "migration 0005 and src/programs-schema.ts are identical, statement by statement");
  h.ok(!/ALTER TABLE/i.test(fileStatements.join(" ")), "no existing table is changed");
  sql.exec("DROP TABLE email_program_sends; DROP TABLE email_programs;");
  programs.resetProgramSchemaCache();
  await programs.ensureProgramSchema();
  h.ok(Boolean(one("SELECT name FROM sqlite_master WHERE name = 'email_programs'")) && Boolean(one("SELECT name FROM sqlite_master WHERE name = 'email_program_sends'")), "the Worker creates the programme tables on first use");
  programs.resetProgramSchemaCache();
  await programs.ensureProgramSchema();
  h.ok(true, "creating them again is harmless");
  const outcome = await programs.processEmailPrograms();
  h.ok(outcome.sent === 0 && outcome.skipped === 0, "with no programme switched on, the cron run does nothing");
}

/* ---- 2. The ready-made programmes' emails ------------------------------------- */
{
  const ALLOWED_VARIABLES = new Set(EMAIL_TEMPLATE_VARIABLES.map((variable) => variable.key));
  const SYMBOLS = /[\u2190-\u21FF\u2300-\u27BF\u2600-\u26FF\u{1F300}-\u{1FAFF}]/u;
  const AMERICAN = /\b(color|colors|favorite|favorites|organiz\w*|realiz\w*|center|behavior|customiz\w*|personaliz\w*|visualiz\w*|analyz\w*|catalog|program|programs)\b/i;
  h.eq(ready.READY_PROGRAMMES.length, 3, "three ready-made programmes");
  const names = new Set<string>();
  for (const programme of ready.READY_PROGRAMMES) {
    h.ok(programme.steps.length >= 2 && programme.steps.every((step, index) => index === 0 || (programme.trigger === "joined" ? step.day > programme.steps[index - 1].day : step.day < programme.steps[index - 1].day)), `${programme.name}: its emails are in the order members get them`);
    programme.steps.forEach((step, index) => {
      const payload = ready.programmeTemplatePayload(programme, index);
      const label = `${programme.name} email ${index + 1}`;
      const text = [payload.subject, payload.preheader, payload.htmlBody, payload.textBody].join("\n");
      h.ok(!names.has(payload.name) && payload.name.length <= 120, `${label}: its own template name, within the limit`);
      names.add(payload.name);
      const subject = payload.subject.replace(/\{\{\s*first_name\s*\}\}/g, "Alexandra");
      h.ok(subject.length >= 10 && subject.length <= 70 && payload.preheader.length >= 20 && payload.preheader.length <= 110, `${label}: subject and preview line are a good length`);
      h.ok((text.match(/\{\{\s*[a-z_]+\s*\}\}/g) || []).every((variable) => ALLOWED_VARIABLES.has(variable.replace(/\s+/g, "") as any)), `${label}: only variables the server fills in`);
      h.ok(!SYMBOLS.test(text) && !AMERICAN.test(text), `${label}: no symbols, British spelling`);
      h.eq((payload.htmlBody.match(/class="cta"/g) || []).length, 1, `${label}: one button`);
      const links = [...payload.htmlBody.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      h.ok(links.every((link) => ["https://scenering.com/app", "https://scenering.com/pricing"].includes(link)), `${label}: links only to Scenering pages that exist`);
      h.ok(!/\[\[/.test(text), `${label}: no placeholder left`);
    });
  }
  const giftEnding = ready.READY_PROGRAMMES.find((programme) => programme.id === "gift-ending")!;
  const reminder = ready.programmeTemplatePayload(giftEnding, 0).textBody;
  h.ok(reminder.includes("$19 a month or $180 a year") && reminder.includes("$39 a month or $372 a year") && reminder.includes("15 video downloads every week"), "the gift-ending email quotes the real prices and limits");
  h.ok(ready.programmeTemplatePayload(giftEnding, 1).textBody.includes("$15 a month on the yearly plan"), "and the yearly monthly price");
  h.eq(ready.daysText("joined", [0, 2, 5]), "on the day they join, then 2 and 5 days after joining", "days read naturally (joining)");
  h.eq(ready.daysText("joined", [7, 11, 16]), "7, 11 and 16 days after joining", "days read naturally (later)");
  h.eq(ready.daysText("gift_ending", [7, 1]), "7 and 1 days before the gift ends", "days read naturally (gift)");
  h.eq(ready.daysText("joined", [1]), "1 day after joining", "one day is singular");
  h.ok(plans.GIFT_ENDING_EMAILS.every((email) => email.day > 0), "gift-ending emails count days before the end");
}

/* ---- Accounts and templates --------------------------------------------------- */
const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ email: OWNER, displayName: "Henry Owner", password: "a-long-enough-password", marketingConsent: true }) });
const token = String(registered.data.developmentVerificationUrl || "").split("token=")[1] || "";
await json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: OWNER, password: "a-long-enough-password" }) });
const ownerCookie = String(login.headers.get("set-cookie") || "").split(";")[0];
const asOwner = { cookie: ownerCookie };
h.ok(Boolean(ownerCookie), "the owner is signed in");

async function template(name: string, subject: string) {
  const created = await json("/api/admin/email/templates", { method: "POST", ...asOwner, body: JSON.stringify({ name, category: "welcome", subject, preheader: "", htmlBody: "<p>Hi {{first_name}}</p><p><a class=\"cta\" href=\"https://scenering.com/app\">Open Scenering</a></p>", textBody: "" }) });
  return String(created.data.template.id);
}
const tWelcome = await template("Welcome", "Welcome, {{first_name}}");
const tTips = await template("Tips", "Tips for you");
const tAsk = await template("Ask", "What are you making?");
const tGiftWeek = await template("Gift week", "A week left");
const tGiftDay = await template("Gift day", "Ends tomorrow");

/* ---- 3. Only the owner administrator ---------------------------------------- */
{
  addUser("usr_cust", "cust@example.com", "Customer");
  const customer = sessionFor("usr_cust");
  for (const [method, path] of [["GET", "/api/admin/programs"], ["POST", "/api/admin/programs"], ["PUT", "/api/admin/programs/prg_x"], ["POST", "/api/admin/programs/prg_x/switch"], ["DELETE", "/api/admin/programs/prg_x"], ["GET", "/api/admin/programs/prg_x/activity"]]) {
    const anonymous = await json(path, { method, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
    const member = await json(path, { method, cookie: customer, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
    h.ok(anonymous.status === 401 && member.status === 403, `${method} ${path} is closed to visitors (401) and customers (403)`);
  }
}

/* ---- 4. Making programmes ----------------------------------------------------- */
const create = (body: Record<string, unknown>) => json("/api/admin/programs", { method: "POST", ...asOwner, body: JSON.stringify(body) });
const welcomeBody = { name: "Welcome programme", trigger: "joined", stopRule: "none", steps: [{ templateId: tAsk, day: 5 }, { templateId: tWelcome, day: 0 }, { templateId: tTips, day: 2 }] };
let welcome: any;
{
  for (const [body, label] of [
    [{ ...welcomeBody, name: "" }, "no name"], [{ ...welcomeBody, trigger: "birthday" }, "an unknown start"], [{ ...welcomeBody, stopRule: "sometimes" }, "an unknown stop rule"],
    [{ ...welcomeBody, steps: [] }, "no emails"], [{ ...welcomeBody, steps: Array.from({ length: 11 }, (_, day) => ({ templateId: tWelcome, day })) }, "more than ten emails"],
    [{ ...welcomeBody, steps: [{ templateId: tWelcome, day: 61 }] }, "a day too far after joining"], [{ ...welcomeBody, steps: [{ templateId: tWelcome, day: 1.5 }] }, "half a day"],
    [{ ...welcomeBody, steps: [{ templateId: tWelcome, day: 2 }, { templateId: tTips, day: 2 }] }, "two emails on the same day"],
    [{ ...welcomeBody, steps: [{ templateId: "tpl_missing", day: 0 }] }, "a template that does not exist"],
    [{ ...welcomeBody, trigger: "gift_ending", steps: [{ templateId: tGiftWeek, day: 31 }] }, "a day too far before a gift ends"],
  ] as Array<[Record<string, unknown>, string]>) {
    const result = await create(body);
    h.ok(result.status === 400 && String(result.data.error || "").length > 10, `refuses ${label}, with a message`);
  }
  const made = await create(welcomeBody);
  h.eq(made.status, 201, "a programme can be made");
  welcome = made.data.program;
  h.ok(welcome.status === "off" && welcome.startedAt === null, "a new programme is switched off");
  h.eq(welcome.steps.map((step: any) => step.day).join(","), "0,2,5", "its emails are put in the order members get them");
  h.ok(welcome.steps.every((step: any) => /^st_[a-z0-9]+$/.test(step.id)), "each email gets a stable id");
  h.ok(welcome.stats.members === 0 && welcome.stats.sent === 0, "with no figures yet");
  const list = await json("/api/admin/programs", asOwner);
  h.ok(list.status === 200 && list.data.programs.length === 1, "programmes are listed");
}

/* ---- 5. A member's welcome, day by day --------------------------------------- */
addUser("usr_before", "before@example.com", "Bea Before", { createdAt: at(-2 * DAY).toISOString() });
let firstStartedAt = "";
{
  await programs.processEmailPrograms(10, new Date());
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM email_program_sends").n), 0, "a programme that is off adds nobody");
  const switched = await json(`/api/admin/programs/${welcome.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: true }) });
  h.ok(switched.status === 200 && switched.data.program.status === "on" && Boolean(switched.data.program.startedAt), "it can be switched on");
  firstStartedAt = switched.data.program.startedAt;
  const changeStart = await json(`/api/admin/programs/${welcome.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ trigger: "gift_ending", steps: [{ templateId: tGiftWeek, day: 7 }] }) });
  h.eq(changeStart.status, 400, "what starts a programme cannot change while it is on");
}
addUser("usr_nell", "nell@example.com", "Nell Newcomer", { createdAt: at(1000).toISOString() });
addUser("usr_nora", "nora@example.com", "Nora Noconsent", { createdAt: at(1000).toISOString(), consent: false });
addUser("usr_ulla", "ulla@example.com", "Ulla Unconfirmed", { createdAt: at(1000).toISOString(), verified: false });
{
  sent.length = 0;
  const day0 = at(5000);
  const first = await programs.processEmailPrograms(10, day0);
  h.eq(sendsOf(welcome.id, "usr_before").length, 0, "someone who joined before it was switched on is not added");
  h.eq(sendsOf(welcome.id, "usr_ulla").length, 0, "someone who has not confirmed their email is not added yet");
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM email_program_sends s JOIN users u ON u.id = s.user_id WHERE u.role = 'admin'").n), 0, "the owner is never added");
  const nell = sendsOf(welcome.id, "usr_nell");
  h.eq(nell.length, 3, "a new member is added for every email");
  h.ok(nell[0].status === "sent" && nell[1].status === "pending" && nell[2].status === "pending", "the first email goes out straight away, the others wait");
  h.eq(new Date(nell[1].due_at).getTime() - new Date(nell[0].due_at).getTime(), 2 * DAY, "the second is due two days later");
  h.eq(new Date(nell[2].due_at).getTime() - new Date(nell[0].due_at).getTime(), 5 * DAY, "the third five days later");
  const toNell = sent.filter((email) => email.to === "nell@example.com");
  h.eq(toNell.length, 1, "Nell got one email");
  h.eq(toNell[0].subject, "Welcome, Nell", "with her first name in it");
  h.eq(toNell[0].from, "Scenering <noreply@scenering.com>", "from the campaign sender");
  h.ok(Boolean(toNell[0].headers?.["List-Unsubscribe"]) && toNell[0].headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "with one-click unsubscribe headers");
  h.ok(toNell[0].text.includes("Unsubscribe from marketing email") && toNell[0].text.includes("Manage your email preferences"), "and the unsubscribe footer");
  h.ok(toNell[0].tags?.some((tag) => tag.name === "program" && tag.value === welcome.id) === true, "tagged with the programme");
  const nora = sendsOf(welcome.id, "usr_nora");
  h.ok(nora[0].status === "skipped" && nora[0].reason === "Does not want marketing email", "someone without marketing consent is never sent anything");
  h.ok(!sent.some((email) => email.to === "nora@example.com"), "Nora got nothing");
  h.ok(first.sent === 1 && first.skipped === 1, "the run reports what it did");

  const again = await programs.processEmailPrograms(10, at(6000));
  h.ok(again.sent === 0 && sent.length === 1, "running again sends nothing twice");

  // Ulla confirms her email a day later: she is added then, and her emails are spaced from then.
  sql.prepare("UPDATE users SET is_verified = 1 WHERE id = 'usr_ulla'").run();
  const later = at(DAY);
  await programs.processEmailPrograms(10, later);
  const ulla = sendsOf(welcome.id, "usr_ulla");
  h.ok(ulla.length === 3 && ulla[0].status === "sent" && ulla[0].anchor_at === later.toISOString(), "a member who confirms late is added then, starting from that moment");
  h.eq(new Date(ulla[1].due_at).getTime() - later.getTime(), 2 * DAY, "so her emails are not bunched together");

  // Two days on: Nell's second email.
  sent.length = 0;
  await programs.processEmailPrograms(10, at(2 * DAY + 60000));
  h.ok(sent.length === 1 && sent[0].to === "nell@example.com" && sent[0].subject === "Tips for you", "two days later, Nell gets the second email");
  sent.length = 0;
  await programs.processEmailPrograms(10, at(3 * DAY + 60000));
  h.ok(sent.length === 1 && sent[0].to === "ulla@example.com", "and Ulla hers, a day after that");
  sent.length = 0;
  await programs.processEmailPrograms(10, at(5 * DAY + 60000));
  h.ok(sent.length === 1 && sent[0].to === "nell@example.com" && sent[0].subject === "What are you making?", "five days on, Nell gets the third");
  h.ok(sendsOf(welcome.id, "usr_nell").every((row) => row.status === "sent"), "all three of Nell's emails went, each once");
}

/* ---- 6. Bounded runs and overlapping runs -------------------------------------- */
{
  const crowdAt = at(6 * DAY);
  for (let index = 0; index < 15; index += 1) addUser(`usr_crowd${index}`, `crowd${index}@example.com`, `Crowd ${index}`, { createdAt: new Date(crowdAt.getTime() - 60000).toISOString() });
  sent.length = 0;
  const firstRun = await programs.processEmailPrograms(10, crowdAt);
  h.eq(firstRun.sent, 10, "one run sends at most its budget");
  const secondRun = await programs.processEmailPrograms(10, new Date(crowdAt.getTime() + 300000));
  const crowd = sent.filter((email) => email.to.startsWith("crowd"));
  h.ok(secondRun.sent > 0 && firstRun.sent + secondRun.sent === sent.length, "the next run sends the rest");
  h.ok(crowd.length === 15 && new Set(crowd.map((email) => email.to)).size === 15, "everyone got their welcome, once");
  // Two runs at the same moment cannot send the same email twice.
  for (let index = 0; index < 6; index += 1) addUser(`usr_race${index}`, `race${index}@example.com`, `Race ${index}`, { createdAt: new Date(crowdAt.getTime() + 400000).toISOString() });
  sent.length = 0;
  const raceAt = new Date(crowdAt.getTime() + 600000);
  await Promise.all([programs.processEmailPrograms(10, raceAt), programs.processEmailPrograms(10, raceAt)]);
  h.eq(sent.length, 6, "two overlapping runs send each welcome once");
  h.eq(new Set(sent.map((email) => email.to)).size, 6, "to six different people");
}

/* ---- 7. Late, removed, failed ---------------------------------------------------- */
{
  // Cron down for three days: an email that late is dropped, not sent.
  addUser("usr_late", "late@example.com", "Lee Late", { createdAt: at(7 * DAY).toISOString() });
  sent.length = 0;
  await programs.processEmailPrograms(0, at(7 * DAY + 60000)); // added, nothing sent (no budget)
  const lee = sendsOf(welcome.id, "usr_late");
  h.ok(lee.length === 3 && lee.every((row) => row.status === "pending"), "with no budget, members are still added");
  await programs.processEmailPrograms(50, at(10 * DAY + 2 * 3600000));
  const leeAfter = sendsOf(welcome.id, "usr_late");
  h.ok(leeAfter[0].status === "skipped" && /two days late/.test(leeAfter[0].reason), "an email more than two days late is dropped");
  h.ok(!sent.some((email) => email.to === "late@example.com" && email.subject === "Welcome, Lee"), "so Lee is not sent a stale welcome");
  h.ok(leeAfter[1].status === "sent" && sent.some((email) => email.to === "late@example.com" && email.subject === "Tips for you"), "while one only a day late still goes");

  // A failing address is recorded, not retried for ever.
  addUser("usr_fail", "fail@example.com", "Fay Fails", { createdAt: at(11 * DAY).toISOString() });
  failFor.add("fail@example.com");
  const failed = await programs.processEmailPrograms(50, at(11 * DAY + 60000));
  h.ok(failed.failed === 1 && sendsOf(welcome.id, "usr_fail")[0].status === "failed" && /422/.test(sendsOf(welcome.id, "usr_fail")[0].reason), "a provider refusal is recorded as not sent, with the reason");

  // Removing an email from the programme: what was waiting for it is not sent.
  const current = (await json("/api/admin/programs", asOwner)).data.programs.find((entry: any) => entry.id === welcome.id);
  const lastStep = current.steps[2];
  const removed = await json(`/api/admin/programs/${welcome.id}`, { method: "PUT", ...asOwner, body: JSON.stringify({ steps: current.steps.slice(0, 2) }) });
  h.ok(removed.status === 200 && removed.data.program.steps.length === 2 && removed.data.program.steps[0].id === current.steps[0].id, "an email can be removed, the others keep their ids");
  sent.length = 0;
  const removedAt = at(16 * DAY + 60000);
  await programs.processEmailPrograms(50, removedAt);
  const removedRows = all<any>("SELECT status, reason FROM email_program_sends WHERE step_id = ? AND due_at <= ? AND reason IS NOT NULL", lastStep.id, removedAt.toISOString());
  h.ok(removedRows.length > 0 && removedRows.some((row) => row.reason === "This email was removed from the programme"), "emails waiting for a removed step are dropped");
  h.ok(!sent.some((email) => email.subject === "What are you making?"), "and none of them went out");
}

/* ---- 8. Stop rules -------------------------------------------------------------- */
{
  const helper = await create({ name: "First video helper", trigger: "joined", stopRule: "made_video", steps: [{ templateId: tTips, day: 7 }, { templateId: tAsk, day: 11 }] });
  h.eq(helper.status, 201, "a second programme can run alongside");
  await json(`/api/admin/programs/${helper.data.program.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: true }) });
  addUser("usr_maker", "maker@example.com", "Mo Maker", { createdAt: at(1000 + 2000).toISOString() });
  addUser("usr_idle", "idle@example.com", "Ida Idle", { createdAt: at(1000 + 2000).toISOString() });
  await programs.processEmailPrograms(20, at(5000 + 2000));
  sql.prepare("INSERT INTO usage_records (id, user_id, kind, duration_minutes, format, created_at) VALUES ('use_mo', 'usr_maker', 'download', 0.8, 'short', ?)").run(at(3 * DAY).toISOString());
  sent.length = 0;
  await programs.processEmailPrograms(20, at(7 * DAY + 600000));
  const mo = sendsOf(helper.data.program.id, "usr_maker");
  h.ok(mo[0].status === "skipped" && mo[0].reason === "Made a video, so the programme stopped", "a member who made a video stops getting the helper");
  h.ok(sent.some((email) => email.to === "idle@example.com" && email.subject === "Tips for you") && !sent.some((email) => email.to === "maker@example.com" && email.subject === "Tips for you"), "a member who has not still gets it");
}

/* ---- 9. Before a gift ends ------------------------------------------------------ */
let giftProgramme: any;
{
  const made = await create({ name: "Gift ending reminder", trigger: "gift_ending", stopRule: "paying", steps: [{ templateId: tGiftDay, day: 1 }, { templateId: tGiftWeek, day: 7 }] });
  giftProgramme = made.data.program;
  h.eq(giftProgramme.steps.map((step: any) => step.day).join(","), "7,1", "days before the end go from furthest to nearest");
  await json(`/api/admin/programs/${giftProgramme.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: true }) });
  const grant = (userId: string, endsAt: Date) => {
    const id = `grant_${randomUUID().replace(/-/g, "")}`;
    sql.prepare("INSERT INTO complimentary_grants (id, user_id, plan_id, period, status, starts_at, ends_at, granted_by, reason, access_code_id, created_at, revoked_at) VALUES (?, ?, 'sceneflow', 'month', 'active', ?, ?, 'usr_owner', 'test', NULL, ?, NULL)")
      .run(id, userId, new Date().toISOString(), endsAt.toISOString(), new Date().toISOString());
    return id;
  };
  addUser("usr_gift10", "gift10@example.com", "Gil Ten", { createdAt: at(-40 * DAY).toISOString() });
  addUser("usr_gift3", "gift3@example.com", "Gus Three", { createdAt: at(-40 * DAY).toISOString() });
  addUser("usr_giftpay", "giftpay@example.com", "Gia Pays", { createdAt: at(-40 * DAY).toISOString() });
  addUser("usr_giftgone", "giftgone@example.com", "Gwen Gone", { createdAt: at(-40 * DAY).toISOString() });
  const now = new Date();
  grant("usr_gift10", new Date(now.getTime() + 10 * DAY));
  grant("usr_gift3", new Date(now.getTime() + 3 * DAY));
  grant("usr_giftpay", new Date(now.getTime() + 7 * DAY + 3600000));
  const gone = grant("usr_giftgone", new Date(now.getTime() + DAY + 1800000));
  sent.length = 0;
  await programs.processEmailPrograms(20, now);
  h.eq(sendsOf(giftProgramme.id, "usr_gift10").length, 0, "a gift ending further away than the first email's day is not added yet");
  const gus = sendsOf(giftProgramme.id, "usr_gift3");
  h.ok(gus.length === 2 && gus[0].status === "skipped" && /Too late/.test(gus[0].reason) && gus[1].status === "pending", "a gift ending in three days skips the one-week email and waits for the day-before one");
  h.ok(sendsOf(giftProgramme.id, "usr_giftpay").length === 2, "a gift ending in a week is added");
  sql.prepare("UPDATE complimentary_grants SET status = 'revoked' WHERE id = ?").run(gone);
  sql.prepare("UPDATE memberships SET plan = 'sceneforge' WHERE user_id = 'usr_giftpay'").run();
  await programs.processEmailPrograms(20, new Date(now.getTime() + 2 * 3600000));
  h.ok(sendsOf(giftProgramme.id, "usr_giftpay")[0].reason === "Started paying, so the programme stopped", "someone who started paying is not reminded");
  h.ok(sendsOf(giftProgramme.id, "usr_giftgone").every((row) => row.status === "skipped"), "a gift that was ended early sends nothing");
  h.ok(!sent.some((email) => email.to === "gift3@example.com"), "Gus's day-before email waits for its day");
  sent.length = 0;
  await programs.processEmailPrograms(20, new Date(now.getTime() + 2 * DAY + 60000));
  h.ok(sent.some((email) => email.to === "gift3@example.com" && email.subject === "Ends tomorrow"), "the day before Gus's gift ends, he is reminded");
  h.ok(sendsOf(giftProgramme.id, "usr_gift10").length === 2, "the ten-day gift is added once it is within a week (and a day) of its end");
  sent.length = 0;
  await programs.processEmailPrograms(20, new Date(now.getTime() + 3 * DAY + 60000));
  const gil = sendsOf(giftProgramme.id, "usr_gift10");
  h.ok(gil[0].status === "sent" && gil[1].status === "pending", "a week before its end, the first reminder goes and the second waits");
  h.ok(sent.some((email) => email.to === "gift10@example.com" && email.subject === "A week left"), "Gil got the one-week reminder");
}

/* ---- 10. Switching off, activity, deleting ------------------------------------- */
{
  addUser("usr_wait", "wait@example.com", "Walt Waiting", { createdAt: at(20 * DAY).toISOString() });
  await programs.processEmailPrograms(0, at(20 * DAY + 60000));
  h.ok(sendsOf(welcome.id, "usr_wait").some((row) => row.status === "pending"), "Walt is waiting for his welcome");
  const off = await json(`/api/admin/programs/${welcome.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: false }) });
  h.ok(off.status === 200 && off.data.program.status === "off", "a programme can be switched off");
  h.ok(sendsOf(welcome.id, "usr_wait").every((row) => row.status === "skipped" && row.reason === "The programme was switched off"), "what was waiting is dropped, never sent later");
  sent.length = 0;
  await programs.processEmailPrograms(20, at(21 * DAY));
  h.ok(!sent.some((email) => email.to === "wait@example.com"), "nothing goes out from a switched-off programme");
  const on = await json(`/api/admin/programs/${welcome.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: true }) });
  h.ok(on.status === 200 && String(on.data.program.startedAt) > firstStartedAt, "switched on again, it starts from now");
  const before = Number(one<any>("SELECT COUNT(*) AS n FROM email_program_sends WHERE program_id = ?", welcome.id).n);
  await programs.processEmailPrograms(20, at(21 * DAY + 60000));
  h.eq(Number(one<any>("SELECT COUNT(*) AS n FROM email_program_sends WHERE program_id = ?", welcome.id).n), before, "members from before are not added again");

  const activity = await json(`/api/admin/programs/${welcome.id}/activity`, asOwner);
  h.ok(activity.status === 200 && activity.data.activity.length > 0 && activity.data.activity.length <= 50, "what happened is listed, at most 50 at a time");
  h.ok(activity.data.activity.every((row: any) => row.email && row.stepId && row.status) && activity.data.activity.some((row: any) => row.status === "sent" && row.sentAt), "with each member, email and outcome");
  const listed = (await json("/api/admin/programs", asOwner)).data.programs.find((entry: any) => entry.id === welcome.id);
  h.ok(listed.stats.sent >= 25 && listed.stats.members >= 20 && listed.stats.sentByStep[listed.steps[0].id] >= 20, "the figures add up per programme and per email");

  const refuse = await json(`/api/admin/programs/${welcome.id}`, { method: "DELETE", ...asOwner });
  h.eq(refuse.status, 400, "a programme that is on cannot be deleted");
  await json(`/api/admin/programs/${welcome.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: false }) });
  const deleted = await json(`/api/admin/programs/${welcome.id}`, { method: "DELETE", ...asOwner });
  h.ok(deleted.status === 200 && Number(one<any>("SELECT COUNT(*) AS n FROM email_program_sends WHERE program_id = ?", welcome.id).n) === 0, "switched off, it can be deleted with its history");
  h.eq((await json(`/api/admin/programs/${welcome.id}/activity`, asOwner)).status, 404, "and is gone");

  // An archived template blocks switching on, with a message.
  const archiving = await create({ name: "Archived check", trigger: "joined", stopRule: "none", steps: [{ templateId: tGiftDay, day: 0 }] });
  await json(`/api/admin/email/templates/${tGiftDay}/archive`, { method: "POST", ...asOwner, body: "{}" });
  const blocked = await json(`/api/admin/programs/${archiving.data.program.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: true }) });
  h.ok(blocked.status === 400 && /Then switch it on/.test(blocked.data.error), "a programme whose template was archived cannot be switched on until it is fixed");
  sent.length = 0;
  addUser("usr_giftlast", "giftlast@example.com", "Gale Last", { createdAt: at(-40 * DAY).toISOString() });
  sql.prepare("INSERT INTO complimentary_grants (id, user_id, plan_id, period, status, starts_at, ends_at, granted_by, reason, access_code_id, created_at, revoked_at) VALUES ('grant_last', 'usr_giftlast', 'sceneflow', 'month', 'active', ?, ?, 'usr_owner', 'test', NULL, ?, NULL)")
    .run(new Date().toISOString(), at(DAY + 1800000).toISOString(), new Date().toISOString());
  await programs.processEmailPrograms(20, new Date());
  await programs.processEmailPrograms(20, at(3600000));
  h.ok(sendsOf(giftProgramme.id, "usr_giftlast").some((row) => row.reason === "The email's template was deleted or archived"), "an email whose template was archived since is not sent");
}

/* ---- 11. Opting out from a programme email ------------------------------------- */
{
  addUser("usr_spam", "spam@example.com", "Sam Spam", { createdAt: new Date().toISOString() });
  const spamProgramme = await create({ name: "Spam check", trigger: "joined", stopRule: "none", steps: [{ templateId: tWelcome, day: 0 }] });
  await json(`/api/admin/programs/${spamProgramme.data.program.id}/switch`, { method: "POST", ...asOwner, body: JSON.stringify({ on: true }) });
  sql.prepare("UPDATE users SET created_at = ? WHERE id = 'usr_spam'").run(at(1000).toISOString());
  sent.length = 0;
  await programs.processEmailPrograms(20, at(60000));
  const email = sent.find((entry) => entry.to === "spam@example.com");
  h.ok(Boolean(email), "a programme email went to Sam");
  const payload = JSON.stringify({ type: "email.complained", data: { email_id: email?.id } });
  const svixId = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = Buffer.from(String(process.env.RESEND_WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", secret).update(`${svixId}.${timestamp}.${payload}`).digest("base64");
  const hook = await fetch(`${base}/api/webhooks/resend`, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": svixId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, body: payload });
  h.eq(hook.status, 200, "the provider's complaint is accepted");
  h.eq(Number(one<any>("SELECT marketing_consent FROM email_preferences WHERE user_id = 'usr_spam'").marketing_consent), 0, "marking a programme email as spam withdraws marketing consent");
  h.eq(Number(one<any>("SELECT marketing_consent FROM email_preferences WHERE user_id = 'usr_idle'").marketing_consent), 1, "nobody else's consent changes");
}

/* ---- 12. Wiring ------------------------------------------------------------------- */
{
  const worker = readFileSync(new URL("../worker.ts", import.meta.url), "utf8");
  h.ok(/processEmailCampaignQueue\(\)\.then\(\(\) => processEmailPrograms\(\)\)/.test(worker), "the hourly cron runs programmes after campaigns, one after the other");
  const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  h.ok(serverSource.includes("registerProgramRoutes(app)"), "the programme routes are registered");
}

server.close();
globalThis.fetch = originalFetch;
h.done("Email programmes");
