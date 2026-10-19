/**
 * The Email Centre inbox, exercised end to end.
 *
 * Real Express routes and real SQL (node:sqlite running the real
 * migrations), with only the outside world faked: Resend at the fetch
 * boundary, DNS-over-HTTPS for the connection check, and Cloudflare's
 * ForwardableEmailMessage for incoming mail (a raw MIME stream plus
 * recorded forward()/setReject() calls). The assertions are about
 * behaviour: who may see what, where messages land, how replies thread,
 * what is forwarded or alerted, and that nothing unsafe is rendered.
 */
import { createHmac } from "node:crypto";
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
const core = await import("../server/inbox-core.ts");
const settingsModule = await import("../server/inbox-settings.ts");
const emailModule = await import("../server/email.ts");
const { INBOX_SCHEMA_STATEMENTS } = await import("../src/inbox-schema.ts");
const { env } = await import("../src/env.ts");

const app = express();
emailCentre.registerResendWebhook(app);
app.use(express.json());
platform.registerPlatformRoutes(app);
emailCentre.registerEmailCentreRoutes(app);
inbox.registerInboxRoutes(app);
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

/* ---- Fakes ---------------------------------------------------------------- */
const originalFetch = globalThis.fetch;
interface Sent { to: string; from: string; subject: string; text: string; html: string; replyTo?: string; headers?: Record<string, string>; tags?: any[]; attachments?: any[]; idempotencyKey?: string }
const sent: Sent[] = [];
const failFor = new Set<string>();
let dns: { status: number; answers: string[] } | "throw" = { status: 0, answers: [] };
let resendIds = 0;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body));
    if (failFor.has(body.to[0])) return new Response(JSON.stringify({ message: "Invalid `to` field." }), { status: 422 });
    sent.push({ to: body.to[0], from: body.from, subject: body.subject, text: body.text, html: body.html, replyTo: body.reply_to, headers: body.headers, tags: body.tags, attachments: body.attachments, idempotencyKey: init?.headers?.["Idempotency-Key"] });
    resendIds += 1;
    return new Response(JSON.stringify({ id: `re_${resendIds}` }), { status: 200 });
  }
  if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
    if (dns === "throw") throw new Error("network down");
    const answers = dns.answers.map((data) => ({ type: 15, data }));
    return new Response(JSON.stringify({ Status: dns.status, Answer: answers }), { status: 200, headers: { "content-type": "application/dns-json" } });
  }
  return originalFetch(input, init);
}) as typeof fetch;

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = (await response.json().catch(() => ({}))) as any;
  return { status: response.status, data, response };
}

async function registerAndSignIn(email: string, displayName: string, marketingConsent = false) {
  const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ email, displayName, password: "a-long-enough-password", marketingConsent }) });
  const token = String(registered.data.developmentVerificationUrl || "").split("token=")[1] || "";
  await json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-enough-password" }) });
  const cookie = String(login.headers.get("set-cookie") || "").split(";")[0];
  const id = (testD1().sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined)?.id || "";
  return { cookie, id };
}

const sql = testD1().sqlite;
const one = <T = any>(query: string, ...params: any[]) => sql.prepare(query).get(...params) as T;

/** A raw RFC 5322 message, the way Cloudflare hands it to the Worker. */
function mime(options: {
  from: string; to?: string; subject: string; messageId?: string; inReplyTo?: string; references?: string;
  text?: string; html?: string; auth?: string; headers?: string[]; attachment?: { name: string; type: string; bytes: Buffer };
}): string {
  const head = [
    `Authentication-Results: mx.cloudflare.net; ${options.auth ?? "spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com"}`,
    `From: ${options.from}`,
    `To: ${options.to ?? "vincent@scenering.com"}`,
    `Subject: ${options.subject}`,
    `Date: ${new Date().toUTCString()}`,
    ...(options.messageId ? [`Message-ID: <${options.messageId}>`] : []),
    ...(options.inReplyTo ? [`In-Reply-To: <${options.inReplyTo}>`] : []),
    ...(options.references ? [`References: ${options.references}`] : []),
    ...(options.headers || []),
    "MIME-Version: 1.0",
  ];
  if (!options.html && !options.attachment) return [...head, "Content-Type: text/plain; charset=utf-8", "", options.text ?? ""].join("\r\n");
  const boundary = "mix_boundary_42";
  const parts: string[] = [];
  const textPart = options.text !== undefined ? ["Content-Type: text/plain; charset=utf-8", "", options.text].join("\r\n") : "";
  const htmlPart = options.html !== undefined ? ["Content-Type: text/html; charset=utf-8", "", options.html].join("\r\n") : "";
  if (textPart && htmlPart) {
    // What mail apps really send: the text and HTML versions as alternatives.
    const alt = "alt_boundary_7";
    parts.push([`Content-Type: multipart/alternative; boundary="${alt}"`, "", `--${alt}\r\n${textPart}`, `--${alt}\r\n${htmlPart}`, `--${alt}--`].join("\r\n"));
  } else if (textPart || htmlPart) {
    parts.push(textPart || htmlPart);
  }
  if (options.attachment) {
    parts.push([
      `Content-Type: ${options.attachment.type}; name="${options.attachment.name}"`,
      `Content-Disposition: attachment; filename="${options.attachment.name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      options.attachment.bytes.toString("base64").replace(/.{76}/g, "$&\r\n"),
    ].join("\r\n"));
  }
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts.map((part) => `--${boundary}\r\n${part}`), `--${boundary}--`, ""].join("\r\n");
}

interface FakeMessage { message: any; forwardedTo: string[]; rejected: string[] }
function inbound(raw: string, options: { from?: string; to?: string; forwardThrows?: boolean; rawSize?: number } = {}): FakeMessage {
  const record: FakeMessage = { message: null, forwardedTo: [], rejected: [] };
  record.message = {
    from: options.from ?? (raw.match(/^From: .*?<?([^<>\s]+@[^<>\s]+)>?$/m)?.[1] || "someone@example.com"),
    to: options.to ?? "vincent@scenering.com",
    raw: new Blob([raw]).stream(),
    rawSize: options.rawSize ?? Buffer.byteLength(raw),
    headers: new Headers(),
    setReject: (reason: string) => { record.rejected.push(reason); },
    forward: async (rcptTo: string) => {
      if (options.forwardThrows) throw new Error("destination address not verified");
      record.forwardedTo.push(rcptTo);
      return { messageId: "fwd" };
    },
  };
  return record;
}

/* ---- 1. Schema: migration file = runtime statements, self-setup works ------ */
{
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const fileStatements = readFileSync(new URL("../migrations/0003_inbox.sql", import.meta.url), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map(normalize).filter(Boolean);
  h.eq(fileStatements.length, INBOX_SCHEMA_STATEMENTS.length, "migration 0003 has exactly the runtime schema statements");
  h.ok(fileStatements.every((statement, index) => statement === normalize(INBOX_SCHEMA_STATEMENTS[index])), "migration 0003 and src/inbox-schema.ts are identical, statement by statement");

  // Production applies migrations by hand: the Worker must create the tables itself.
  sql.exec("DROP TABLE inbox_messages; DROP TABLE inbox_threads; DROP TABLE inbox_saved_replies;");
  h.ok(!one("SELECT name FROM sqlite_master WHERE name = 'inbox_threads'"), "simulated deploy before the migration: no inbox tables");
  core.resetInboxSchemaCache();
  await core.ensureInboxSchema();
  h.ok(Boolean(one("SELECT name FROM sqlite_master WHERE name = 'inbox_threads'")) && Boolean(one("SELECT name FROM sqlite_master WHERE name = 'inbox_messages'")) && Boolean(one("SELECT name FROM sqlite_master WHERE name = 'inbox_saved_replies'")),
    "the Worker creates the inbox tables on first use");
  core.resetInboxSchemaCache();
  await core.ensureInboxSchema();
  h.ok(true, "creating them again is harmless");
}

/* ---- Accounts --------------------------------------------------------------- */
const admin = await registerAndSignIn(OWNER, "Henry Owner", true);
const withAdmin = { headers: { Cookie: admin.cookie } } as RequestInit;
const member = await registerAndSignIn("maya@example.com", "Maya Chen", true);
h.ok(Boolean(admin.cookie && admin.id && member.cookie && member.id), "the owner and a member are signed in");
sent.length = 0;

/* ---- 2. Only the owner administrator ---------------------------------------- */
{
  for (const [method, path] of [["GET", "/api/admin/inbox/threads"], ["GET", "/api/admin/inbox/summary"], ["GET", "/api/admin/inbox/settings"], ["PUT", "/api/admin/inbox/settings"], ["POST", "/api/admin/inbox/compose"], ["POST", "/api/admin/inbox/threads/thr_x/reply"], ["GET", "/api/admin/inbox/attachments/msg_x/0"], ["GET", "/api/admin/inbox/status"], ["GET", "/api/admin/inbox/saved-replies"], ["DELETE", "/api/admin/inbox/threads/thr_x"]]) {
    const anonymous = await json(path, { method, body: method === "GET" ? undefined : "{}" });
    const customer = await json(path, { method, headers: { Cookie: member.cookie }, body: method === "GET" ? undefined : "{}" });
    h.ok(anonymous.status === 401 && customer.status === 403, `${method} ${path} is closed to visitors (401) and customers (403)`);
  }
}

/* ---- 3. Contact form → conversation + alert --------------------------------- */
let contactThreadId = "";
{
  const posted = await json("/api/contact", { method: "POST", body: JSON.stringify({ name: "Sam Visitor", email: "Sam@Example.COM", subject: "Export question", message: "How do I export in 4K?\n<script>alert(1)</script>", category: "Technical" }) });
  h.eq(posted.status, 201, "the public contact form still answers 201");
  h.ok(Boolean(one("SELECT id FROM contact_submissions WHERE email = 'Sam@Example.COM'")), "the submission is still stored where it always was");
  const list = await json("/api/admin/inbox/threads?filter=needs_reply", withAdmin);
  h.eq(list.status, 200, "the owner can list conversations");
  const thread = list.data.threads.find((t: any) => t.subject === "Export question");
  h.ok(Boolean(thread), "the contact message is a conversation in the inbox");
  contactThreadId = thread?.id || "";
  h.eq(thread?.source, "contact_form", "it is marked as coming from the contact form");
  h.eq(thread?.contactEmail, "sam@example.com", "the address is normalised to lower case");
  h.eq(thread?.category, "Technical", "the contact-form category is kept");
  h.ok(thread?.unread === true && thread?.status === "new", "it starts unread and new");
  const alert = sent.find((mail) => mail.to === OWNER && mail.subject.startsWith("New message from Sam Visitor"));
  h.ok(Boolean(alert), "the owner gets an email alert");
  h.ok(Boolean(alert?.text.includes(`https://scenering.test/admin?tab=inbox&thread=${encodeURIComponent(contactThreadId)}`)), "the alert links straight to the conversation");
  h.ok(Boolean(alert?.text.includes("How do I export in 4K?")), "the alert quotes the message");
  h.ok(Boolean(alert) && !alert!.html.includes("<script>"), "visitor text is escaped in the alert's HTML");
  const opened = await json(`/api/admin/inbox/threads/${contactThreadId}`, withAdmin);
  h.eq(opened.status, 200, "the conversation opens");
  h.eq(opened.data.messages.length, 1, "it holds the visitor's message");
  h.eq(opened.data.member, null, "a visitor without an account shows no member card");
  h.eq(one<any>("SELECT unread FROM inbox_threads WHERE id = ?", contactThreadId).unread, 0, "opening a conversation marks it read");

  sent.length = 0;
  await json("/api/contact", { method: "POST", body: JSON.stringify({ name: "Maya Chen", email: "maya@example.com", subject: "Billing", message: "Can I switch to yearly billing?", category: "Billing" }) });
  const memberThread = (await json("/api/admin/inbox/threads?filter=all", withAdmin)).data.threads.find((t: any) => t.subject === "Billing");
  h.eq(memberThread?.userId, member.id, "a message from a member is linked to their account");
  const memberView = await json(`/api/admin/inbox/threads/${memberThread?.id}`, withAdmin);
  h.eq(memberView.data.member?.email, "maya@example.com", "the conversation shows the member card");
  h.eq(memberView.data.member?.plan, "free", "the member card shows their plan");
  h.eq(memberView.data.member?.marketingConsent, true, "and whether they accepted marketing email");
}

/* ---- 4. Messages from before the inbox existed are imported once ---------- */
{
  sql.prepare("INSERT INTO contact_submissions (id, name, email, subject, message, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("contact_legacy1", "Old Timer", "old@example.com", "Legacy question", "Sent before the inbox", "General", "resolved", "2026-09-01T10:00:00.000Z");
  sql.prepare("INSERT INTO contact_submissions (id, name, email, subject, message, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("contact_legacy2", "New Timer", "new@example.com", "Unanswered legacy", "Nobody saw this yet", "General", "new", "2026-09-02T10:00:00.000Z");
  const all = await json("/api/admin/inbox/threads?filter=all", withAdmin);
  const legacy = all.data.threads.find((t: any) => t.id === "thr_contact_legacy1");
  h.ok(Boolean(legacy), "an older contact message appears in the inbox");
  h.ok(legacy?.status === "resolved" && legacy?.unread === false, "its status is kept and an answered message is not unread");
  h.eq(all.data.threads.find((t: any) => t.id === "thr_contact_legacy2")?.unread, true, "an unanswered older message is unread");
  await json("/api/admin/inbox/threads?filter=all", withAdmin);
  h.eq(one<any>("SELECT COUNT(*) AS n FROM inbox_threads WHERE id = 'thr_contact_legacy1'").n, 1, "importing again never duplicates");
  h.eq(one<any>("SELECT COUNT(*) AS n FROM inbox_messages WHERE thread_id = 'thr_contact_legacy1'").n, 1, "nor duplicates its message");
}

/* ---- 5. Incoming email ------------------------------------------------------- */
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001aa3fd1b30000000049454e44ae426082", "hex");
let emailThreadId = "";
let emailMessageId = "";
{
  sent.length = 0;
  const fake = inbound(mime({
    from: "Priya Patel <Priya@Example.org>", subject: "Render stuck at 90%", messageId: "abc123@mail.example.org",
    text: "My render stops at 90%.\nScreenshot attached.", html: "<p>My render stops at <b>90%</b>.</p><script>steal()</script>",
    attachment: { name: "screenshot.png", type: "image/png", bytes: png },
  }));
  const outcome = await core.handleInboundEmail(fake.message);
  h.ok(outcome.stored === true && Boolean(outcome.threadId), "an incoming email is stored");
  emailThreadId = String(outcome.threadId);
  emailMessageId = String(outcome.messageId);
  h.ok(outcome.forwarded === true && fake.forwardedTo[0] === OWNER, "an untouched copy is forwarded to the owner's own mailbox");
  h.eq(outcome.alert, "skipped", "no extra alert when the copy was forwarded");
  h.eq(sent.length, 0, "and no email was sent through Resend");
  const thread = one<any>("SELECT * FROM inbox_threads WHERE id = ?", emailThreadId);
  h.ok(thread.subject === "Render stuck at 90%" && thread.contact_email === "priya@example.org" && thread.contact_name === "Priya Patel", "subject, address and name are recorded");
  h.ok(thread.status === "new" && thread.unread === 1 && thread.source === "email" && thread.mailbox === "vincent@scenering.com", "it is a new, unread email conversation for vincent@");
  const message = one<any>("SELECT * FROM inbox_messages WHERE id = ?", emailMessageId);
  h.eq(message.text_body, "My render stops at 90%.\nScreenshot attached.", "the plain-text part is kept as the message");
  h.eq(message.message_id, "abc123@mail.example.org", "its Message-ID is kept for threading");
  h.ok(message.auth_summary.includes("dmarc=pass"), "the sender authentication result is recorded");
  const files = JSON.parse(message.attachments);
  h.ok(files.length === 1 && files[0].name === "screenshot.png" && files[0].size === png.length && String(files[0].key).startsWith("inbox/"), "the attachment is stored privately");
  const opened = await json(`/api/admin/inbox/threads/${emailThreadId}`, withAdmin);
  h.ok(!JSON.stringify(opened.data).includes("inbox/"), "storage keys never reach the browser");
  h.ok(opened.data.messages[0].attachments[0].available === true, "the attachment is offered for download");
  const download = await fetch(`${base}/api/admin/inbox/attachments/${emailMessageId}/0`, withAdmin);
  const bytes = Buffer.from(await download.arrayBuffer());
  h.eq(download.status, 200, "the owner can download it");
  h.ok(bytes.equals(png), "the download is byte-for-byte the file that was sent");
  h.eq(download.headers.get("content-type"), "application/octet-stream", "attachments are served as downloads, never rendered");
  h.ok(String(download.headers.get("content-disposition")).startsWith("attachment; filename=\"screenshot.png\""), "with an attachment disposition and the original name");
  const customerDownload = await fetch(`${base}/api/admin/inbox/attachments/${emailMessageId}/0`, { headers: { Cookie: member.cookie } });
  h.eq(customerDownload.status, 403, "nobody else can download attachments");

  // HTML-only mail: readable text, scripts gone.
  const htmlOnly = inbound(mime({ from: "news@example.net", subject: "HTML only", html: "<div>Hello&nbsp;there &amp; welcome<br>Line two</div><style>p{}</style><script>alert('x')</script><p>Bye</p>" }));
  const htmlOutcome = await core.handleInboundEmail(htmlOnly.message);
  const htmlText = one<any>("SELECT text_body FROM inbox_messages WHERE id = ?", htmlOutcome.messageId).text_body;
  h.eq(htmlText, "Hello there & welcome\nLine two\nBye", "an HTML-only email becomes readable text");
  h.ok(!/alert|<script|p\{\}/.test(htmlText), "scripts and styles never survive");

  // Forwarding fails (destination not verified yet) → an alert instead.
  sent.length = 0;
  const unverified = inbound(mime({ from: "lee@example.com", subject: "Hello there", text: "Just saying hi" }), { forwardThrows: true });
  const unverifiedOutcome = await core.handleInboundEmail(unverified.message);
  h.ok(unverifiedOutcome.stored && !unverifiedOutcome.forwarded && Boolean(unverifiedOutcome.forwardError), "a failed forward is reported, the message is still stored");
  h.eq(unverifiedOutcome.alert, "sent", "the owner is alerted instead");
  h.ok(sent.some((mail) => mail.to === OWNER && mail.subject.includes("Hello there")), "the alert goes to the owner through Resend");

  // DMARC failure → spam, never forwarded or alerted.
  sent.length = 0;
  const spoof = inbound(mime({ from: "ceo@bank.example", subject: "Urgent payment", text: "Pay now", auth: "spf=fail smtp.mailfrom=bank.example; dkim=none; dmarc=fail header.from=bank.example" }));
  const spoofOutcome = await core.handleInboundEmail(spoof.message);
  h.eq(spoofOutcome.status, "spam", "mail that fails DMARC is filed as spam");
  h.ok(spoof.forwardedTo.length === 0 && sent.length === 0, "spam is never forwarded or alerted");
  const needsReply = await json("/api/admin/inbox/threads?filter=needs_reply", withAdmin);
  h.ok(!needsReply.data.threads.some((t: any) => t.id === spoofOutcome.threadId), "spam stays out of the reply list");
  const spamList = await json("/api/admin/inbox/threads?filter=spam", withAdmin);
  h.ok(spamList.data.threads.some((t: any) => t.id === spoofOutcome.threadId), "but can be found under Spam");

  // An automatic message (out-of-office, service notice): copied, never alerted, needs no reply.
  sent.length = 0;
  const auto = inbound(mime({ from: "notices@service.example", subject: "Verify your account", text: "Click to verify", headers: ["Auto-Submitted: auto-generated"] }), { forwardThrows: false });
  const autoOutcome = await core.handleInboundEmail(auto.message);
  h.ok(autoOutcome.stored && autoOutcome.automated === true, "automatic mail is stored and recognised");
  h.eq(auto.forwardedTo[0], OWNER, "it is still copied to the owner (a sign-up confirmation matters)");
  h.ok(autoOutcome.alert === "skipped" && sent.length === 0, "it never triggers an alert");
  h.eq(autoOutcome.status, "closed", "it needs no reply");

  // Limits.
  const huge = inbound(mime({ from: "big@example.com", subject: "Huge", text: "x" }), { rawSize: 26 * 1024 * 1024 });
  const hugeOutcome = await core.handleInboundEmail(huge.message);
  h.ok(hugeOutcome.stored === false && huge.rejected.length === 1, "a message over 25 MB is refused");
  const insert = sql.prepare("INSERT INTO inbox_messages (id, thread_id, direction, from_email, created_at) VALUES (?, ?, 'in', 'flood@example.com', ?)");
  for (let i = 0; i < 30; i++) insert.run(`msg_flood_${i}`, emailThreadId, new Date().toISOString());
  const flood = inbound(mime({ from: "flood@example.com", subject: "Again", text: "again" }));
  const floodOutcome = await core.handleInboundEmail(flood.message);
  h.ok(floodOutcome.stored === false && floodOutcome.rejected === "sender_limit" && flood.rejected.length === 1, "a sender over 30 messages an hour is refused");
  sql.exec("DELETE FROM inbox_messages WHERE id LIKE 'msg_flood_%'");
}

/* ---- 6. Replying, and the answer threading back -------------------------------- */
{
  sent.length = 0;
  const empty = await json(`/api/admin/inbox/threads/${emailThreadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "   " }) });
  h.eq(empty.status, 400, "an empty reply is refused");
  const reply = await json(`/api/admin/inbox/threads/${emailThreadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Hi Priya,\n\nTry the <b>Draft</b> quality first.\n\nThanks!" }) });
  h.eq(reply.status, 201, "the owner's reply is sent");
  const mail = sent[0];
  h.eq(mail?.to, "priya@example.org", "it goes to the customer");
  h.eq(mail?.from, "Vincent from Scenering <vincent@scenering.com>", "from vincent@scenering.com with the owner's name");
  h.eq(mail?.replyTo, "vincent@scenering.com", "answers come back to vincent@");
  h.eq(mail?.subject, "Re: Render stuck at 90%", "the subject is a reply to theirs");
  h.eq(mail?.headers?.["In-Reply-To"], "<abc123@mail.example.org>", "In-Reply-To names their message, so it threads in their mail app");
  h.ok(String(mail?.headers?.References).includes("<abc123@mail.example.org>"), "References carries the conversation");
  h.ok(Boolean(mail?.idempotencyKey?.startsWith("inbox-msg_")), "every reply has an idempotency key, so a retry cannot send twice");
  h.ok(Boolean(mail?.text.includes("Try the <b>Draft</b> quality first.")) && Boolean(mail?.text.includes("Vincent\nScenering · scenering.com")), "the plain text has the reply and the signature");
  h.ok(Boolean(mail?.text.includes("> My render stops at 90%.")), "and quotes the customer's message");
  h.ok(Boolean(mail?.html.includes("Try the &lt;b&gt;Draft&lt;/b&gt; quality first.")) && !mail!.html.includes("<b>Draft"), "the HTML version escapes what the owner typed");
  h.ok(Array.isArray(mail?.tags) && mail!.tags!.every((t: any) => /^[A-Za-z0-9_-]+$/.test(t.name) && /^[A-Za-z0-9_-]+$/.test(t.value)), "reply tags are valid for Resend");
  const thread = one<any>("SELECT * FROM inbox_threads WHERE id = ?", emailThreadId);
  h.ok(thread.status === "open" && thread.last_direction === "out" && thread.unread === 0, "after replying the conversation is open and no longer waiting");
  const waiting = await json("/api/admin/inbox/threads?filter=needs_reply", withAdmin);
  h.ok(!waiting.data.threads.some((t: any) => t.id === emailThreadId), "it leaves the reply list");
  const stored = one<any>("SELECT * FROM inbox_messages WHERE thread_id = ? AND direction = 'out'", emailThreadId);
  h.ok(stored.delivery_status === "sent" && Boolean(stored.provider_message_id), "the reply is stored as sent, with the provider's id");

  // Delivery events from Resend update the reply.
  const signed = (type: string, emailId: string, id: string) => {
    const payload = JSON.stringify({ type, data: { email_id: emailId, subject: "Re" } });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = Buffer.from(String(process.env.RESEND_WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
    const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("base64");
    return fetch(`${base}/api/webhooks/resend`, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` }, body: payload });
  };
  await signed("email.delivered", stored.provider_message_id, "evt_inbox_1");
  h.eq(one<any>("SELECT delivery_status FROM inbox_messages WHERE id = ?", stored.id).delivery_status, "delivered", "a delivery event marks the reply delivered");
  await signed("email.bounced", stored.provider_message_id, "evt_inbox_2");
  await signed("email.delivered", stored.provider_message_id, "evt_inbox_3");
  h.eq(one<any>("SELECT delivery_status FROM inbox_messages WHERE id = ?", stored.id).delivery_status, "bounced", "states only move forward (a late 'delivered' cannot hide a bounce)");

  // The customer answers: their mail app quotes our headers.
  sent.length = 0;
  const answer = inbound(mime({ from: "Priya Patel <priya@example.org>", subject: "Re: Render stuck at 90%", messageId: "def456@mail.example.org", inReplyTo: "abc123@mail.example.org", references: "<abc123@mail.example.org>", text: "That worked, thank you!" }));
  const answerOutcome = await core.handleInboundEmail(answer.message);
  h.eq(answerOutcome.threadId, emailThreadId, "the customer's answer lands in the same conversation");
  const after = one<any>("SELECT * FROM inbox_threads WHERE id = ?", emailThreadId);
  h.ok(after.last_direction === "in" && after.unread === 1 && after.message_count === 3, "it is unread and waiting for the owner again");

  // A mail app that drops the threading headers: "Re:" + same subject + same person.
  const noHeaders = inbound(mime({ from: "priya@example.org", subject: "RE: Render stuck at 90%", text: "One more thing" }));
  h.eq((await core.handleInboundEmail(noHeaders.message)).threadId, emailThreadId, "a reply without threading headers still finds its conversation");
  const fresh = inbound(mime({ from: "priya@example.org", subject: "Render stuck at 90%", text: "A brand new problem" }));
  h.ok((await core.handleInboundEmail(fresh.message)).threadId !== emailThreadId, "a new message without 'Re:' starts its own conversation");

  // Resolved, then the customer writes again → reopened.
  await json(`/api/admin/inbox/threads/${emailThreadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Glad to help!", status: "resolved" }) });
  h.eq(one<any>("SELECT status FROM inbox_threads WHERE id = ?", emailThreadId).status, "resolved", "the owner can reply and resolve in one step");
  const later = inbound(mime({ from: "priya@example.org", subject: "Re: Render stuck at 90%", inReplyTo: "def456@mail.example.org", text: "It happened again" }));
  await core.handleInboundEmail(later.message);
  h.eq(one<any>("SELECT status FROM inbox_threads WHERE id = ?", emailThreadId).status, "open", "a resolved conversation reopens when the customer writes again");

  // Replying to a contact-form conversation threads on its synthetic id.
  sent.length = 0;
  await json(`/api/admin/inbox/threads/${contactThreadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Use the 4K preset in Setup." }) });
  h.eq(sent[0]?.to, "sam@example.com", "a contact-form visitor gets the reply by email");
  h.ok(String(sent[0]?.headers?.["In-Reply-To"]).startsWith("<contact-contact_"), "the reply refers to the contact message, so the visitor's answer threads back");

  // A provider refusal is shown, not lost.
  failFor.add("sam@example.com");
  const refused = await json(`/api/admin/inbox/threads/${contactThreadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Second try" }) });
  failFor.delete("sam@example.com");
  h.eq(refused.status, 502, "a refused send reports an error");
  h.ok(String(refused.data.error).includes("not sent"), "the error says the reply was not sent");
  const failed = one<any>("SELECT delivery_status, failure_reason FROM inbox_messages WHERE thread_id = ? AND text_body = 'Second try'", contactThreadId);
  h.ok(failed?.delivery_status === "failed" && String(failed?.failure_reason).includes("422"), "the failed reply stays in the conversation with its reason");
}

/* ---- 7. Starting a conversation --------------------------------------------- */
{
  sent.length = 0;
  const invalid = await json("/api/admin/inbox/compose", { method: "POST", ...withAdmin, body: JSON.stringify({ to: "not-an-address", subject: "Hi", body: "Hello" }) });
  h.eq(invalid.status, 400, "a new message needs a valid address");
  const self = await json("/api/admin/inbox/compose", { method: "POST", ...withAdmin, body: JSON.stringify({ to: "vincent@scenering.com", subject: "Hi", body: "Hello" }) });
  h.eq(self.status, 400, "you cannot write to your own inbox address");
  const composed = await json("/api/admin/inbox/compose", { method: "POST", ...withAdmin, body: JSON.stringify({ to: "Maya@Example.com", subject: "Welcome to Scenering", body: "Hi Maya, how is it going?" }) });
  h.eq(composed.status, 201, "the owner can start a conversation");
  h.ok(composed.data.thread.source === "outbound" && composed.data.thread.status === "open" && composed.data.thread.userId === member.id, "it is linked to the member and open");
  h.ok(sent[0]?.to === "maya@example.com" && sent[0]?.subject === "Welcome to Scenering" && !sent[0]?.headers, "it is sent as a fresh message");
}

/* ---- 8. Status, search, deletion ---------------------------------------------- */
{
  const marked = await json(`/api/admin/inbox/threads/${contactThreadId}`, { method: "PUT", ...withAdmin, body: JSON.stringify({ status: "closed", unread: true }) });
  h.ok(marked.status === 200 && marked.data.thread.status === "closed" && marked.data.thread.unread === true, "status and unread can be changed");
  const invalid = await json(`/api/admin/inbox/threads/${contactThreadId}`, { method: "PUT", ...withAdmin, body: JSON.stringify({ status: "archived" }) });
  h.eq(invalid.status, 400, "unknown statuses are refused");
  for (const [query, expected] of [["Priya", emailThreadId], ["example.org", emailThreadId], ["That worked", emailThreadId], ["export question", contactThreadId]]) {
    const found = await json(`/api/admin/inbox/threads?filter=all&q=${encodeURIComponent(query)}`, withAdmin);
    h.ok(found.data.threads.some((t: any) => t.id === expected), `search finds "${query}" (name, address, message text or subject)`);
  }
  const literal = await json(`/api/admin/inbox/threads?filter=all&q=${encodeURIComponent("90%")}`, withAdmin);
  h.ok(literal.data.threads.some((t: any) => t.id === emailThreadId), "a % in the search matches a real percent sign");
  const wildcard = await json(`/api/admin/inbox/threads?filter=all&q=${encodeURIComponent("9_%")}`, withAdmin);
  h.eq(wildcard.data.threads.length, 0, "_ and % are literal characters, not wildcards (9_% would otherwise match 90%)");
  const counts = (await json("/api/admin/inbox/threads?filter=all", withAdmin)).data.counts;
  h.ok(counts.all >= 5 && counts.spam === 1 && typeof counts.needs_reply === "number", "the list reports a count per filter");

  // Deleting an email conversation removes its files too.
  const keyRow = one<any>("SELECT attachments FROM inbox_messages WHERE id = ?", emailMessageId);
  const key = JSON.parse(keyRow.attachments)[0].key;
  h.ok(Boolean(await env().AUDIO_BUCKET.get(key)), "the attachment file exists before deletion");
  const deleted = await json(`/api/admin/inbox/threads/${emailThreadId}`, { method: "DELETE", ...withAdmin });
  h.eq(deleted.status, 200, "a conversation can be deleted");
  h.ok(!one("SELECT id FROM inbox_threads WHERE id = ?", emailThreadId) && !one("SELECT id FROM inbox_messages WHERE thread_id = ?", emailThreadId), "its messages are gone");
  h.eq(await env().AUDIO_BUCKET.get(key), null, "and so are its attachment files");

  // Deleting a contact-form conversation deletes the original row, so it never comes back.
  await json(`/api/admin/inbox/threads/${contactThreadId}`, { method: "DELETE", ...withAdmin });
  await json("/api/admin/inbox/threads?filter=all", withAdmin);
  h.ok(!one("SELECT id FROM inbox_threads WHERE id = ?", contactThreadId), "a deleted contact conversation is not re-imported");
  h.ok(!one("SELECT id FROM contact_submissions WHERE id = ?", contactThreadId.slice(4)), "its original contact row is removed as well");
  const missing = await json(`/api/admin/inbox/threads/${contactThreadId}`, withAdmin);
  h.eq(missing.status, 404, "a deleted conversation is gone");
}

/* ---- 9. Saved replies --------------------------------------------------------- */
{
  const invalid = await json("/api/admin/inbox/saved-replies", { method: "POST", ...withAdmin, body: JSON.stringify({ title: "", body: "" }) });
  h.eq(invalid.status, 400, "a saved reply needs a title and text");
  const created = await json("/api/admin/inbox/saved-replies", { method: "POST", ...withAdmin, body: JSON.stringify({ title: "Thanks", body: "Hi {{first_name}}, thanks for writing!" }) });
  h.eq(created.status, 201, "a saved reply is created");
  const updated = await json(`/api/admin/inbox/saved-replies/${created.data.reply.id}`, { method: "PUT", ...withAdmin, body: JSON.stringify({ title: "Thank you", body: "Hi {{first_name}}, thank you!" }) });
  h.eq(updated.data.reply.title, "Thank you", "it can be edited");
  const listed = await json("/api/admin/inbox/saved-replies", withAdmin);
  h.eq(listed.data.replies.length, 1, "and listed");
  await json(`/api/admin/inbox/saved-replies/${created.data.reply.id}`, { method: "DELETE", ...withAdmin });
  h.eq((await json("/api/admin/inbox/saved-replies", withAdmin)).data.replies.length, 0, "and deleted");
}

/* ---- 10. Settings and Reply-To ---------------------------------------------------- */
{
  const current = await json("/api/admin/inbox/settings", withAdmin);
  h.eq(current.data.settings.address, "vincent@scenering.com", "the inbox address defaults to vincent@scenering.com");
  h.eq(current.data.settings.displayName, "Vincent from Scenering", "replies are signed by Vincent from Scenering");
  h.ok(current.data.settings.alertEmail === OWNER && current.data.settings.forwardEmail === OWNER, "alerts and copies go to the owner's own address");
  h.eq(current.data.settings.replyToAllEmails, false, "automatic emails keep their own Reply-To until the owner switches it on");
  for (const [body, label] of [
    [{ address: "vincent@gmail.com" }, "an address outside scenering.com"],
    [{ address: "not an address" }, "an invalid address"],
    [{ forwardEmail: "vincent@scenering.com" }, "copies to the inbox itself (a loop)"],
    [{ displayName: "x" }, "a one-letter name"],
    [{ alertEmail: "nope" }, "an invalid alert address"],
  ] as Array<[any, string]>) {
    const refused = await json("/api/admin/inbox/settings", { method: "PUT", ...withAdmin, body: JSON.stringify(body) });
    h.eq(refused.status, 400, `settings refuse ${label}`);
  }
  const saved = await json("/api/admin/inbox/settings", { method: "PUT", ...withAdmin, body: JSON.stringify({ displayName: "Vincent <Horlick>\r\nBcc: evil@example.com", replyToAllEmails: true, businessAddress: "1 Main Road, Benoni", businessPhone: "+27 11 000 0000" }) });
  h.eq(saved.status, 200, "valid settings are saved");
  h.ok(!/[<>\r\n]/.test(saved.data.settings.displayName), "the reply name can never carry header characters");
  h.ok(Boolean(saved.data.settings.updatedAt), "saving records when the settings were reviewed");
  sent.length = 0;
  await emailModule.sendTransactionalEmail({ to: "someone@example.com", subject: "Account notice", text: "Hello" });
  h.eq(sent[0]?.replyTo, "vincent@scenering.com", "with the switch on, automatic emails carry Reply-To: vincent@");
  const sender = emailCentre.campaignSenderFromSettings(await settingsModule.getInboxSettings({ fresh: true }));
  h.ok(sender.address === "1 Main Road, Benoni" && sender.phone === "+27 11 000 0000" && sender.email === "vincent@scenering.com", "marketing footers use the saved business details");
  await json("/api/admin/inbox/settings", { method: "PUT", ...withAdmin, body: JSON.stringify({ replyToAllEmails: false }) });
  sent.length = 0;
  await emailModule.sendTransactionalEmail({ to: "someone@example.com", subject: "Account notice", text: "Hello" });
  h.eq(sent[0]?.replyTo, undefined, "switched off again, the Reply-To goes back to the default");
}

/* ---- 10b. Other addresses for replies ---------------------------------------------- */
{
  const put = (body: unknown) => json("/api/admin/inbox/settings", { method: "PUT", ...withAdmin, body: JSON.stringify(body) });
  const current = await json("/api/admin/inbox/settings", withAdmin);
  h.eq(current.data.settings.otherAddresses.map((entry: any) => entry.address).join(","), "support@scenering.com,hello@scenering.com,billing@scenering.com", "support@, hello@ and billing@ are offered besides the personal address");
  h.ok(current.data.settings.otherAddresses.every((entry: any) => entry.displayName.length >= 2 && entry.signature.length > 0), "each has its own name and signature");
  const named = (address: string, displayName = "Scenering Team") => ({ address, displayName, signature: "Team" });
  for (const [body, label] of [
    [{ otherAddresses: [named("help@gmail.com")] }, "another domain"],
    [{ otherAddresses: [named("support@scenering.com"), named("SUPPORT@scenering.com")] }, "the same address twice"],
    [{ otherAddresses: [named("vincent@scenering.com")] }, "the personal address again"],
    [{ otherAddresses: [named("support@scenering.com", "x")] }, "a one-letter name"],
    [{ otherAddresses: [named("")] }, "an empty row"],
    [{ otherAddresses: Array.from({ length: 9 }, (_, index) => named(`team${index}@scenering.com`)) }, "more than eight"],
    [{ otherAddresses: "support@scenering.com" }, "something that is not a list"],
    [{ forwardEmail: "support@scenering.com" }, "copies sent to one of the inbox's own addresses"],
    [{ alertEmail: "hello@scenering.com" }, "alerts sent to one of the inbox's own addresses"],
    [{ address: "support@scenering.com" }, "a personal address that is already one of the others"],
  ] as Array<[any, string]>) {
    h.eq((await put(body)).status, 400, `other addresses refuse ${label}`);
  }
  const saved = await put({ otherAddresses: [
    { address: " Support@Scenering.com ", displayName: "Scenering Support", signature: "Scenering Support\r\nscenering.com" },
    { address: "billing@scenering.com", displayName: "Billing <Team>\r\nBcc: evil@example.com", signature: "Scenering Billing" },
  ] });
  h.eq(saved.status, 200, "a changed list of other addresses is saved");
  h.eq(saved.data.settings.otherAddresses.map((entry: any) => entry.address).join(","), "support@scenering.com,billing@scenering.com", "addresses are cleaned and removed ones are gone");
  h.ok(!/[<>\r\n]/.test(saved.data.settings.otherAddresses[1].displayName), "names can never carry header characters");
  h.eq(saved.data.settings.otherAddresses[0].signature, "Scenering Support\nscenering.com", "signatures keep their line breaks");

  // A customer writes to support@: the conversation belongs to support@ and the reply starts there.
  sent.length = 0;
  const lena = inbound(mime({ from: "Lena Mokoena <lena@example.com>", to: "support@scenering.com", subject: "My video will not download", messageId: "lena-1@example.com", text: "Hi, the download button does nothing." }), { to: "support@scenering.com" });
  const lenaOutcome = await core.handleInboundEmail(lena.message);
  h.ok(lenaOutcome.stored === true, "email to support@ arrives in the inbox");
  const lenaThread = await json(`/api/admin/inbox/threads/${lenaOutcome.threadId}`, withAdmin);
  h.eq(lenaThread.data.thread.mailbox, "support@scenering.com", "the conversation records the address the customer wrote to");
  h.eq(lenaThread.data.replyFrom, "support@scenering.com", "the reply box starts on that address");
  sent.length = 0;
  const viaSupport = await json(`/api/admin/inbox/threads/${lenaOutcome.threadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Hi Lena, please try again now." }) });
  h.eq(viaSupport.status, 201, "a reply without a chosen address is sent");
  h.eq(sent[0]?.from, "Scenering Support <support@scenering.com>", "it comes from support@ with its own name");
  h.eq(sent[0]?.replyTo, "support@scenering.com", "and the customer's answer goes back to support@");
  h.ok(sent[0]?.text.includes("Scenering Support\nscenering.com") && !sent[0]?.text.includes("Vincent from Scenering"), "it carries the support@ signature, not the personal one");
  h.eq(viaSupport.data.message.fromEmail, "support@scenering.com", "the conversation shows which address replied");
  sent.length = 0;
  const personal = await json(`/api/admin/inbox/threads/${lenaOutcome.threadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Vincent here, I checked it myself.", from: "Vincent@Scenering.com" }) });
  h.ok(personal.status === 201 && /<vincent@scenering\.com>$/.test(sent[0]?.from || "") && sent[0]?.replyTo === "vincent@scenering.com", "the owner can choose the personal address for a reply instead");
  h.eq((await json(`/api/admin/inbox/threads/${lenaOutcome.threadId}`, withAdmin)).data.replyFrom, "vincent@scenering.com", "the next reply starts on the address last used");
  h.eq(sent[0]?.headers?.["In-Reply-To"], "<lena-1@example.com>", "switching address keeps the reply in the customer's thread");
  for (const [from, label] of [["someone@gmail.com", "a stranger's address"], ["hello@scenering.com", "an address that was removed"]]) {
    const refused = await json(`/api/admin/inbox/threads/${lenaOutcome.threadId}/reply`, { method: "POST", ...withAdmin, body: JSON.stringify({ body: "Hello", from }) });
    h.eq(refused.status, 400, `a reply cannot be sent from ${label}`);
  }

  // Writing from billing@
  sent.length = 0;
  const ownTarget = await json("/api/admin/inbox/compose", { method: "POST", ...withAdmin, body: JSON.stringify({ to: "support@scenering.com", subject: "Hi", body: "Hello" }) });
  h.eq(ownTarget.status, 400, "you cannot write to any of your own addresses");
  const billing = await json("/api/admin/inbox/compose", { method: "POST", ...withAdmin, body: JSON.stringify({ to: "accounts@example.com", subject: "Your invoice", body: "Hello, your invoice is attached.", from: "billing@scenering.com" }) });
  h.ok(billing.status === 201 && billing.data.thread.mailbox === "billing@scenering.com", "a new message can be written from billing@");
  h.ok(/<billing@scenering\.com>$/.test(sent[0]?.from || "") && sent[0]?.replyTo === "billing@scenering.com" && sent[0]?.text.includes("Scenering Billing"), "it is sent from billing@ with the billing signature");
  const defaultCompose = await json("/api/admin/inbox/compose", { method: "POST", ...withAdmin, body: JSON.stringify({ to: "friend@example.com", subject: "Hello", body: "Hello there." }) });
  h.eq(defaultCompose.data.thread.mailbox, "vincent@scenering.com", "without a choice, a new message comes from the personal address");

  // Mail claiming to come from one of the inbox's own addresses is never copied or alerted.
  sent.length = 0;
  const looped = inbound(mime({ from: "support@scenering.com", subject: "Looping", text: "echo" }));
  const loopOutcome = await core.handleInboundEmail(looped.message);
  h.ok(loopOutcome.stored === true && looped.forwardedTo.length === 0 && sent.length === 0, "mail from support@ itself is kept but never copied or alerted");

  const status = await json("/api/admin/inbox/status", withAdmin);
  h.eq((status.data.status.addresses || []).join(","), "vincent@scenering.com,support@scenering.com,billing@scenering.com", "the connection status lists every address that needs a routing rule");

  // A damaged stored list never stops the inbox, and settings from before this feature get the defaults.
  const { db } = await import("../src/db.ts");
  const keep = await db.getSetting(settingsModule.INBOX_SETTINGS_KEY);
  await db.setSetting(settingsModule.INBOX_SETTINGS_KEY, JSON.stringify({ ...JSON.parse(keep || "{}"), otherAddresses: [{ address: "broken" }, { address: "partners@scenering.com", displayName: "Partners", signature: "" }, { address: "vincent@scenering.com", displayName: "Copy" }] }));
  h.eq((await settingsModule.getInboxSettings({ fresh: true })).otherAddresses.map((entry) => entry.address).join(","), "partners@scenering.com", "bad stored entries are dropped quietly");
  await db.setSetting(settingsModule.INBOX_SETTINGS_KEY, JSON.stringify({ address: "vincent@scenering.com", displayName: "Vincent from Scenering" }));
  h.eq((await settingsModule.getInboxSettings({ fresh: true })).otherAddresses.length, 3, "settings saved before other addresses existed are offered the three defaults");
  await db.setSetting(settingsModule.INBOX_SETTINGS_KEY, keep || "{}");
  settingsModule.clearInboxSettingsCache();
}

/* ---- 11. Connection status ------------------------------------------------------- */
{
  dns = { status: 0, answers: ["10 route1.mx.cloudflare.net.", "20 route2.mx.cloudflare.net."] };
  const routed = await core.lookupMx("routed.example");
  h.eq(routed.state, "cloudflare", "MX records pointing at Cloudflare Email Routing are recognised");
  dns = { status: 0, answers: ["1 aspmx.l.google.com."] };
  h.eq((await core.lookupMx("google.example")).state, "other", "another mail provider is recognised");
  dns = { status: 3, answers: [] };
  h.eq((await core.lookupMx("none.example")).state, "none", "no MX records at all is recognised");
  dns = "throw";
  h.eq((await core.lookupMx("offline.example")).state, "unknown", "a failed lookup is reported as unknown, never as a false answer");
  dns = { status: 0, answers: ["10 route1.mx.cloudflare.net."] };
  const status = await json("/api/admin/inbox/status", withAdmin);
  h.ok(status.status === 200 && status.data.status.address === "vincent@scenering.com" && status.data.status.sendingConfigured === true, "the owner sees the address and whether sending is configured");
  h.ok(Boolean(status.data.status.lastInboundAt), "and when the last email arrived");
}

/* ---- 12. Summary in the owner overview ------------------------------------------ */
{
  const overview = await json("/api/admin/overview", withAdmin);
  h.ok(overview.status === 200 && typeof overview.data.inbox?.needsReply === "number" && typeof overview.data.inbox?.total === "number", "the Account window's overview carries the inbox counts");
  const summary = await json("/api/admin/inbox/summary", withAdmin);
  h.ok(summary.data.summary.total >= 1, "the summary endpoint reports totals");
}

/* ---- 13. Helpers ------------------------------------------------------------------ */
{
  h.eq(core.normalizeSubject("Re: RE: Fwd: AW: Hello  World"), "hello world", "reply and forward prefixes are removed in any language and case");
  h.eq(core.replySubject("Re: Hello"), "Re: Hello", "an existing Re: is not doubled");
  h.eq(core.replySubject("Hello\r\nBcc: x@example.com"), "Re: Hello Bcc: x@example.com", "line breaks can never reach a subject header");
  h.eq(core.extractMessageIds("<A@x> <b@Y>").join(","), "a@x,b@y", "Message-IDs are extracted and lower-cased");
  h.eq(core.extractMessageIds("lonely@id").join(","), "lonely@id", "a bare Message-ID is accepted");
  h.eq(core.htmlToText("<p>a&#39;b&#x2019;c</p><ul><li>one</li><li>two</li></ul>"), "a'b’c\n• one\n• two", "entities and lists become text");
  h.eq(core.summarizeAuthentication([{ key: "authentication-results", value: "mx; spf=pass; dkim=fail; dmarc=fail" }]).suspicious, true, "DMARC failure is suspicious");
  h.eq(core.summarizeAuthentication([{ key: "authentication-results", value: "mx; spf=fail; dkim=pass; dmarc=pass" }]).suspicious, false, "a forwarded message with valid DKIM is not");
  h.eq(core.isAutomatedMessage([{ key: "precedence", value: "bulk" }], "a@b.c"), true, "bulk mail is automatic");
  h.eq(core.isAutomatedMessage([], "MAILER-DAEMON@example.com"), true, "bounces are automatic");
  h.eq(core.isAutomatedMessage([{ key: "auto-submitted", value: "no" }], "a@b.c"), false, "Auto-Submitted: no is a person");
  h.eq(settingsModule.headerSafe('a"b<c>\r\nd', 50), "a b c d", "header-safe text drops quotes, angle brackets and line breaks");
  const tags = emailModule.resendTags(["campaign:cmp_123", "inbox:thr_abc", "weird tag:has spaces/and:colons"]);
  h.ok(tags!.length === 3 && tags!.every((t) => /^[A-Za-z0-9_-]+$/.test(t.name) && /^[A-Za-z0-9_-]+$/.test(t.value)), "every tag is converted to Resend's {name, value} format");
  h.eq(JSON.stringify(emailModule.cleanExtraHeaders({ "In-Reply-To": "<a@b>\r\nBcc: x", "X-Evil": "1" })), JSON.stringify({ "In-Reply-To": "<a@b> Bcc: x" }), "only known headers pass, and never with line breaks");
  h.eq(core.htmlToText('<p>Please <a href="https://dash.cloudflare.com/verify?token=abc">Verify email</a> now.</p>'), "Please Verify email (https://dash.cloudflare.com/verify?token=abc) now.", "HTML-only verification links are preserved in plain text");
  h.eq(core.appendMissingHtmlLinks("Click below to confirm.", '<a href="https://example.com/confirm?code=99">Confirm address</a>'), "Click below to confirm.\n\nConfirm address: https://example.com/confirm?code=99", "verification links in HTML buttons are appended when omitted from the plain-text part");

  // Rich HTML email + verification links + inline images for trusted content
  const verifyFake = inbound(mime({
    from: "Cloudflare <noreply@notify.cloudflare.com>",
    subject: "Verify your destination address",
    text: "Please verify your email address.",
    html: '<!doctype html><html><head><title>Verify</title></head><body><p>Welcome!</p><img src="https://notify.cloudflare.com/logo.png" alt="Cloudflare"><p><a href="https://dash.cloudflare.com/verify?token=xyz_123">Verify email address</a></p><script>evil()</script></body></html>',
    attachment: { name: "preview.png", type: "image/png", bytes: png },
  }));
  const verifyOutcome = await core.handleInboundEmail(verifyFake.message);
  h.ok(verifyOutcome.stored === true, "verification email with HTML and image is stored");
  const verifyOpened = await json(`/api/admin/inbox/threads/${verifyOutcome.threadId}`, withAdmin);
  const verifyMsg = verifyOpened.data.messages[0];
  h.ok(verifyMsg.textBody.includes("https://dash.cloudflare.com/verify?token=xyz_123"), "verification link is preserved in textBody");
  h.ok(verifyMsg.htmlBody.includes('href="https://dash.cloudflare.com/verify?token=xyz_123"') && verifyMsg.htmlBody.includes('target="_blank"'), "sanitised htmlBody keeps clickable verification link");
  h.ok(verifyMsg.htmlBody.includes('src="https://notify.cloudflare.com/logo.png"') && !verifyMsg.htmlBody.includes("<script"), "sanitised htmlBody keeps trusted images and strips scripts");

  // Inline image serving for trusted content vs unsafe attachment types
  const inlineRes = await fetch(`${base}/api/admin/inbox/attachments/${verifyOutcome.messageId}/0?inline=1`, withAdmin);
  h.eq(inlineRes.status, 200, "owner can load raster image attachment inline");
  h.eq(inlineRes.headers.get("content-type"), "image/png", "inline raster image is served with its image content-type");
  h.ok(String(inlineRes.headers.get("content-disposition")).startsWith("inline;"), "inline raster image uses inline disposition");

  const svgFake = inbound(mime({
    from: "stranger@example.com",
    subject: "SVG file",
    text: "See attached",
    attachment: { name: "trap.svg", type: "image/svg+xml", bytes: Buffer.from("<svg onload=alert(1)></svg>") },
  }));
  const svgOutcome = await core.handleInboundEmail(svgFake.message);
  const svgInlineAttempt = await fetch(`${base}/api/admin/inbox/attachments/${svgOutcome.messageId}/0?inline=1`, withAdmin);
  h.eq(svgInlineAttempt.headers.get("content-type"), "application/octet-stream", "SVG attachments are never rendered inline even with ?inline=1");
  h.ok(String(svgInlineAttempt.headers.get("content-disposition")).startsWith("attachment;"), "SVG attachments stay forced downloads");

  // Client helpers for links, verifications and trusted content
  const inboxApiModule = await import("../src/admin/inbox-api.ts");
  const segments = inboxApiModule.tokenizeTextWithLinks("Confirm at (https://scenering.com/verify?token=123). Or email mailto:support@scenering.com!");
  const linkHrefs = segments.filter((s) => s.kind === "link").map((s) => (s as any).href);
  h.eq(linkHrefs.join(","), "https://scenering.com/verify?token=123,mailto:support@scenering.com", "URLs and mailto links in text are tokenised cleanly without trailing punctuation or closing parens");
  const extracted = inboxApiModule.extractMessageLinks(verifyMsg);
  h.ok(extracted.length === 1 && extracted[0].url === "https://dash.cloudflare.com/verify?token=xyz_123" && extracted[0].isVerification === true, "verification links are identified and extracted with their label");
  h.eq(inboxApiModule.isMessageTrusted(verifyMsg, "new"), true, "authenticated sender passing DMARC/SPF/DKIM is trusted");
  h.eq(inboxApiModule.isMessageTrusted({ ...verifyMsg, authSummary: "spf=fail dmarc=fail" }, "new"), false, "sender failing DMARC is not trusted");
  h.eq(inboxApiModule.isMessageTrusted(verifyMsg, "spam"), false, "spam thread is never auto-trusted");
  h.ok(!inboxApiModule.prepareEmailHtmlForDisplay(verifyMsg.htmlBody, { showImages: false }).includes("<img"), "untrusted display mode hides images while keeping links");
  h.ok(inboxApiModule.prepareEmailHtmlForDisplay(verifyMsg.htmlBody, { showImages: true }).includes("<img"), "trusted display mode shows images");

  // Outgoing attachments (compose + reply) and emptying spam
  sent.length = 0;
  const composedWithFile = await json("/api/admin/inbox/compose", {
    method: "POST",
    ...withAdmin,
    body: JSON.stringify({
      to: "client@example.com",
      subject: "Project assets",
      body: "Attached is the preview image.",
      attachments: [{ name: "preview.png", contentType: "image/png", contentBase64: png.toString("base64") }],
    }),
  });
  h.eq(composedWithFile.status, 201, "owner can compose an email with an attachment");
  h.eq(sent[0]?.attachments?.[0]?.filename, "preview.png", "outbound attachment is sent to the email provider");
  const outThread = await json(`/api/admin/inbox/threads/${composedWithFile.data.thread.id}`, withAdmin);
  const outMsg = outThread.data.messages[0];
  h.eq(outMsg.attachments.length, 1, "sent message records its attachment in the conversation");
  const outDownload = await fetch(`${base}/api/admin/inbox/attachments/${outMsg.id}/0?inline=1`, withAdmin);
  h.eq(outDownload.status, 200, "sent attachment is stored and viewable from the conversation");

  sent.length = 0;
  const replyWithFileOnly = await json(`/api/admin/inbox/threads/${composedWithFile.data.thread.id}/reply`, {
    method: "POST",
    ...withAdmin,
    body: JSON.stringify({
      body: "",
      attachments: [{ name: "notes.txt", contentType: "text/plain", contentBase64: Buffer.from("Spec notes").toString("base64") }],
    }),
  });
  h.eq(replyWithFileOnly.status, 201, "owner can send an attachment-only reply");
  h.eq(sent[0]?.attachments?.[0]?.filename, "notes.txt", "reply attachment is passed to the email provider");

  // Emptying spam removes all spam threads
  const spamBefore = await json("/api/admin/inbox/threads?filter=spam", withAdmin);
  h.ok(spamBefore.data.threads.length >= 1, "spam filter has at least one spam thread before emptying");
  const emptied = await json("/api/admin/inbox/spam", { method: "DELETE", ...withAdmin });
  h.ok(emptied.status === 200 && emptied.data.deletedCount >= 1, "DELETE /api/admin/inbox/spam deletes all spam conversations");
  const spamAfter = await json("/api/admin/inbox/threads?filter=spam", withAdmin);
  h.eq(spamAfter.data.threads.length, 0, "spam filter is empty after emptying spam");
}

server.close();
globalThis.fetch = originalFetch;
h.done("Email Centre inbox");
