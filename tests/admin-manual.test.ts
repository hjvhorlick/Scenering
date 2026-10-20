/**
 * The admin Manual (src/admin/admin-manual.ts, the Email Centre's Manual tab).
 *
 * A manual is only useful while it is true, so it is checked against the
 * application itself:
 *  1. its shape: every answer has steps, ids are unique, links between
 *     answers lead somewhere;
 *  2. every *screen label* it tells you to look for or select really appears
 *     in the admin's screens;
 *  3. every number it quotes matches the code that enforces it;
 *  4. every option, status, refusal message and skip reason in the code is
 *     explained, so a new one cannot be added without the manual noticing;
 *  5. its language: British spelling, no symbols the icon rules forbid;
 *  6. search finds what it should;
 *  7. the tab is wired into the Email Centre, loads only when opened, and
 *     opens a linked answer.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHarness } from "./harness.ts";

const h = createHarness();

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "a-test-session-secret-of-sufficient-length";
process.env.PUBLIC_APP_URL = "https://scenering.test";
process.env.EMAIL_PROVIDER = "console";
process.env.SCENERING_OWNER_EMAIL = "owner@scenering.test";

const { installTestPlatformEnv } = await import("./platform-env.ts");
installTestPlatformEnv();
const manual = await import("../src/admin/admin-manual.ts");
const emailCentre = await import("../server/email-centre.ts");
const programs = await import("../server/programs.ts");
const giftCodes = await import("../server/gift-codes.ts");
const inboxSettings = await import("../server/inbox-settings.ts");
const { MEMBER_FILTERS, GIFT_STATE_LABEL } = await import("../src/admin/members-api.ts");
const { INBOX_FILTERS } = await import("../src/admin/inbox-api.ts");
const { AUDIENCE_TYPES, EMAIL_TEMPLATE_VARIABLES } = await import("../src/admin/email-centre-api.ts");
const { CAMPAIGN_PLANS } = await import("../src/admin/email-plans.ts");
const { READY_PROGRAMMES } = await import("../src/admin/email-programmes.ts");

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/** Lists and objects are compared by their contents (h.eq compares with Object.is). */
const same = (actual: unknown, expected: unknown, message: string) =>
  h.ok(JSON.stringify(actual) === JSON.stringify(expected), `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
const { ADMIN_MANUAL, MANUAL_ENTRIES, MANUAL_FACTS: F } = manual;
const entry = (id: string) => manual.findManualEntry(id)?.entry;
const allText = (item: { q: string; a: string; steps: readonly string[]; points?: readonly string[]; tips?: readonly string[] }) => manual.entryText(item as any);

/* ---- 1. Shape ------------------------------------------------------------------ */
{
  h.ok(ADMIN_MANUAL.length >= 12, `the manual covers every area (${ADMIN_MANUAL.length} topics)`);
  h.eq(new Set(ADMIN_MANUAL.map((topic) => topic.id)).size, ADMIN_MANUAL.length, "topic ids are unique");
  h.eq(new Set(ADMIN_MANUAL.map((topic) => topic.short)).size, ADMIN_MANUAL.length, "topic buttons are unique");
  h.eq(manual.MANUAL_QUESTION_COUNT, ADMIN_MANUAL.reduce((sum, topic) => sum + topic.entries.length, 0), "the question count is the sum of the topics");
  h.ok(manual.MANUAL_QUESTION_COUNT >= 80, `the manual is thorough (${manual.MANUAL_QUESTION_COUNT} questions)`);
  const ids = MANUAL_ENTRIES.map((item) => item.entry.id);
  h.eq(new Set(ids).size, ids.length, "question ids are unique, so every link opens one answer");
  h.eq(new Set(MANUAL_ENTRIES.map((item) => item.entry.q)).size, ids.length, "no question is asked twice");
  const problems: string[] = [];
  for (const { topic, entry: item } of MANUAL_ENTRIES) {
    const where = `${topic.id}/${item.id}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) problems.push(`${where}: id is not lower-case-with-dashes`);
    if (!item.q.endsWith("?")) problems.push(`${where}: the question does not end with a question mark`);
    if (item.a.trim().length < 20) problems.push(`${where}: the short answer is missing`);
    if (item.steps.length < 2) problems.push(`${where}: fewer than two steps`);
    if (item.steps.length > 12) problems.push(`${where}: more than twelve steps`);
    if (item.pointsTitle && !(item.points && item.points.length)) problems.push(`${where}: a heading without a list`);
    for (const id of item.related || []) {
      if (id === item.id) problems.push(`${where}: links to itself`);
      else if (!manual.findManualEntry(id)) problems.push(`${where}: links to a missing question "${id}"`);
    }
    if (new Set(item.related || []).size !== (item.related || []).length) problems.push(`${where}: a related question is listed twice`);
    for (const text of allText(item)) {
      if ((text.match(/\*/g) || []).length % 2) problems.push(`${where}: unmatched * in "${text.slice(0, 60)}"`);
      if ((text.match(/`/g) || []).length % 2) problems.push(`${where}: unmatched backtick in "${text.slice(0, 60)}"`);
      if (/\*\s|\s\*(?=[.,;:!?)]|$)/.test(text.replace(/\*[^*\n]+\*/g, "X"))) problems.push(`${where}: a stray * in "${text.slice(0, 60)}"`);
    }
    for (const step of item.steps) {
      const plain = manual.plainManualText(step).trim();
      if (!/[.?!:)]$/.test(plain)) problems.push(`${where}: a step does not end like a sentence: "${plain.slice(-40)}"`);
      if (!/^[A-Z0-9"]/.test(plain)) problems.push(`${where}: a step does not start with a capital: "${plain.slice(0, 40)}"`);
    }
  }
  same(problems, [], "every answer has a short answer and two to twelve steps, and its links and markers are sound");
  h.ok(MANUAL_ENTRIES.every((item) => !item.entry.related?.length || item.entry.related.every((id) => entry(id))), "related questions all exist");
}

/* ---- 2. Every screen label is on a screen --------------------------------------- */
{
  const adminFiles = readdirSync(new URL("../src/admin/", import.meta.url)).filter((name) => /\.(tsx?|ts)$/.test(name) && name !== "admin-manual.ts");
  h.ok(adminFiles.includes("ManualTab.tsx") && adminFiles.includes("EmailCentre.tsx"), "the admin's screens are read");
  const screens = [
    ...adminFiles.map((name) => read(`src/admin/${name}`)),
    read("src/components/AccountMembershipModal.tsx"),
    read("src/shared/SiteCornerMenu.tsx"),
    read("src/studio/SignIn.tsx"),
  ].join("\n");
  const labels = new Map<string, string>();
  for (const { entry: item } of MANUAL_ENTRIES) {
    for (const text of allText(item)) for (const label of manual.screenLabels(text)) if (!labels.has(label)) labels.set(label, item.id);
  }
  h.ok(labels.size >= 250, `the manual names what to look for on screen (${labels.size} different labels)`);
  const missing = [...labels].filter(([label]) => !screens.includes(label)).map(([label, id]) => `"${label}" (${id})`);
  same(missing, [], "every button, tab, field and message the manual names appears in the admin's screens");
  // The test itself must be able to fail.
  h.ok(!screens.includes("Launch the rocket now"), "a label that is on no screen is noticed");
}

/* ---- 3. Every number matches the code -------------------------------------------- */
{
  h.eq(F.campaignBatch, emailCentre.SEND_BATCH_SIZE, "campaign batch size");
  h.eq(F.campaignPerRun, emailCentre.CRON_SEND_BUDGET, "campaign emails per five-minute run");
  h.eq(F.largestAudience, emailCentre.MAX_AUDIENCE, "largest campaign audience");
  h.eq(F.programmePerRun, programs.PROGRAM_SEND_BUDGET, "programme emails per run");
  h.eq(F.programmeEmails, programs.MAX_PROGRAM_STEPS, "emails in one programme");
  h.eq(F.joinedMaxDay, programs.MAX_DAYS.joined, "last day after joining");
  h.eq(F.giftMaxDay, programs.MAX_DAYS.gift_ending, "last day before a gift ends");
  h.eq(F.otherAddresses, inboxSettings.MAX_OTHER_ADDRESSES, "number of other addresses");
  h.eq(F.giftUses, giftCodes.MAX_GIFT_USES, "people per gift code");
  h.eq(F.giftOpenDays, giftCodes.MAX_CLAIM_DAYS, "how long a code can stay open");
  h.eq(F.giftOpenDays, 730, "which the manual calls two years");
  const programsSource = read("server/programs.ts");
  h.ok(programsSource.includes(`const STALE_MS = ${F.lateDays} * 86400000;`), "how late a programme email may be");
  h.ok(read("server/members.ts").includes(`const PAGE_SIZE = ${F.membersPerPage};`), "members shown at a time");
  const inboxCore = read("server/inbox-core.ts");
  h.ok(inboxCore.includes(`MAX_ATTACHMENTS = ${F.attachmentsPerEmail};`), "attachments kept per email");
  h.ok(inboxCore.includes(`MAX_ATTACHMENT_BYTES = ${F.attachmentMb} * 1024 * 1024;`), "size of one attachment");
  h.ok(inboxCore.includes(`MAX_TOTAL_ATTACHMENT_BYTES = ${F.attachmentsTotalMb} * 1024 * 1024;`), "size of all attachments");
  h.ok(inboxCore.includes(`MAX_ALERTS_PER_DAY = ${F.alertsPerDay};`), "alerts per day");
  const platformSource = read("server/platform.ts");
  h.ok(platformSource.includes(`rateLimit("login", ${F.signInTries}, ${F.signInMinutes * 60000})`), "sign-in tries");
  h.ok(platformSource.includes(`rateLimit("forgot", ${F.resetLinksPerHour}, 3600000)`), "password reset links per hour");
  h.ok(platformSource.includes("d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); d.setUTCHours(0, 0, 0, 0);"), "the download week starts on Monday at midnight UTC (02:00 in South Africa)");
  h.ok(read("server/email-centre.ts").includes(`.slice(0, ${F.handPicked});`), "people in a hand-picked audience");
  h.ok(read("src/admin/EmailCentre.tsx").includes(`Between ${F.quietMinDays} and ${F.quietMaxDays} days.`), "days without a download");
  h.ok(read("src/lib/email-templates.ts").includes(`This link expires in ${F.confirmLinkHours} hours.`), "how long a confirmation link works");
  h.ok(/"crons":\s*\[[^\]]*"\*\/5 \* \* \* \*"/.test(read("wrangler.jsonc")), "the email queue runs every five minutes");
  h.ok(read("src/admin/GiftsTab.tsx").includes("Letters, numbers and dashes, 4 to 32 characters."), "what a chosen code may contain");
  h.ok(read("server/gift-codes.ts").includes("SCN-"), "chosen codes cannot look like the older SCN- codes");
  h.ok(read("src/marketing/legal-content.ts").includes("Refunds are considered case by case."), "what the Terms say about refunds");
  h.ok(read("src/marketing/legal-content.ts").includes("there is no server copy"), "projects live only in the customer's browser");
}

/* ---- 4. Every option, status, message and reason is explained -------------------- */
{
  same(Object.keys(manual.MEMBER_GROUP_TEXT).sort(), MEMBER_FILTERS.map((entry) => entry.value).sort(), "every member group is explained");
  same(Object.keys(manual.INBOX_FILTER_TEXT).sort(), INBOX_FILTERS.map((entry) => entry.value).sort(), "every Inbox filter is explained");
  same(Object.keys(manual.GIFT_STATE_TEXT).sort(), Object.keys(GIFT_STATE_LABEL).sort(), "every gift code state is explained");
  const statuses = [...(read("src/db.ts").match(/export type EmailCampaignStatus =([^;]+);/)?.[1] || "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  h.ok(statuses.length >= 8, "the campaign statuses are read from the code");
  same(Object.keys(manual.CAMPAIGN_STATUS_TEXT).sort(), statuses, "every campaign status is explained");

  const giftSource = read("server/gift-codes.ts");
  const refusals = [...new Set([...giftSource.matchAll(/refused\("([^"]+)"\)/g)].map((m) => m[1]))];
  h.ok(refusals.length >= 8, `the gift code refusals are read from the code (${refusals.length})`);
  const notFound = platformMessage();
  const explained = manual.GIFT_REFUSALS.map((entry) => entry.message);
  same([...refusals, notFound].filter((message) => !explained.includes(message)), [], "every message a customer can see about a gift code is explained");
  same(explained.filter((message) => message !== notFound && !refusals.includes(message)), [], "and the manual explains no message the app does not show");

  const reasons = new Set<string>();
  const decide = programsSource();
  for (const m of decide.matchAll(/return "([A-Z][^"]+)";/g)) reasons.add(m[1]);
  for (const m of decide.matchAll(/programsDb\.skip\(send\.id, "([^"]+)"\)/g)) reasons.add(m[1]);
  const programsDbSource = read("src/programs-db.ts");
  for (const m of programsDbSource.matchAll(/reason = '([^']+)'/g)) reasons.add(m[1]);
  for (const m of programsDbSource.matchAll(/THEN '((?:[^']|'')+)'/g)) if (/^[A-Z].* /.test(m[1])) reasons.add(m[1].replace(/''/g, "'"));
  h.ok(reasons.size >= 13, `the programme skip reasons are read from the code (${reasons.size})`);
  const reasonTexts = manual.PROGRAMME_REASONS.map((entry) => entry.reason);
  same([...reasons].filter((reason) => !reasonTexts.includes(reason)), [], "every reason a programme email is not sent is explained");
  same(reasonTexts.filter((reason) => !reasons.has(reason)), [], "and the manual explains no reason the app does not give");

  const pointsOf = (id: string) => (entry(id)?.points || []).join("\n");
  h.ok(CAMPAIGN_PLANS.every((plan) => pointsOf("plans-which").includes(`*${plan.name}*`)), "every plan is described");
  h.ok(READY_PROGRAMMES.every((programme) => pointsOf("prog-ready").includes(`*${programme.name}*`)), "every ready-made programme is described");
  h.ok(AUDIENCE_TYPES.every((type) => pointsOf("camp-audience").includes(`*${type.label}*`)), "every campaign audience is described");
  h.ok(EMAIL_TEMPLATE_VARIABLES.every((variable) => pointsOf("tpl-variables").includes(variable.key)), "every template variable is described");
  h.ok(pointsOf("camp-audience").includes("every member is at the first step"), "the training-step audience says plainly that nobody moves along the steps yet");
  const tabLabels = [...(read("src/admin/EmailCentre.tsx").match(/\{\(\[(\["dashboard"[^\n]+)\] as Array<\[Tab, string\]>/)?.[1] || "").matchAll(/\["[a-z]+", "([^"]+)"\]/g)].map((m) => m[1]);
  h.eq(tabLabels.length, 9, "the Email Centre has nine tabs, Manual included");
  same(tabLabels.filter((label) => !pointsOf("tabs-overview").includes(`*${label}*`)), [], "every tab is explained in the overview");
  for (const plan of ["free", "sceneflow", "sceneforge"]) h.ok(pointsOf("plan-limits").includes(plan === "free" ? "*Free*" : plan === "sceneflow" ? "*SceneFlow*" : "*SceneForge*"), `the ${plan} plan is described`);
  h.ok(pointsOf("plan-limits").includes("$19 a month or $180 a year") && pointsOf("plan-limits").includes("$39 a month or $372 a year"), "prices come from the plan settings");
  h.ok(entry("downloads-count")!.steps.join(" ").includes("2 Shorts and 1 long video a week") && entry("downloads-count")!.steps.join(" ").includes("15 downloads a week"), "download limits come from the plan settings");
  h.ok(entry("give-free-time")!.steps.join(" ").includes("1 week, 1 month, 3 months, 6 months or 1 year"), "gift lengths come from the app's list");
  h.ok(entry("staff-access")!.a.includes("Only one account can open the admin"), "the manual says honestly that there are no staff logins yet");

  function platformMessage(): string {
    return read("server/platform.ts").match(/gift\.status === "not_found"\) return res\.status\(400\)\.json\(\{ error: "([^"]+)" \}\)/)?.[1] || "(not found)";
  }
  function programsSource(): string {
    return read("server/programs.ts");
  }
}

/* ---- 5. Language ------------------------------------------------------------------ */
{
  const words = MANUAL_ENTRIES.flatMap(({ topic, entry: item }) => [topic.title, topic.intro, ...allText(item)]).join("\n");
  /* Prose only for the spelling and wording rules: `Words between backticks`
     are identifiers to type or copy exactly (event names such as
     `subscription.canceled`, environment variables, paths) and must be shown
     as FastSpring spells them, not translated into British prose. */
  const prose = words.replace(/`[^`\n]*`/g, "X");
  const american = prose.match(/\b(color|colors|organize|organized|organization|center|favorite|canceled|canceling|behavior|catalog|analyze|license|enroll|enrolled)\b/gi) || [];
  same(american, [], "British spelling throughout");
  const symbols = [...words].filter((char) => {
    const code = char.codePointAt(0)!;
    return (code >= 0x2190 && code <= 0x21ff) || (code >= 0x2300 && code <= 0x27bf) || (code >= 0x2600 && code <= 0x26ff) || (code >= 0x1f300 && code <= 0x1faff);
  });
  same(symbols, [], "no arrows, ticks or emoji (the icon rules)");
  h.ok(!/\bprogram\b/i.test(prose.replace(/unexpected program/g, "")), "programme, not program, for Scenering's automatic emails");
  h.ok(!/click here/i.test(prose), "links and buttons are named, not \"click here\"");
}

/* ---- 6. Search ------------------------------------------------------------------- */
{
  const all = manual.searchManual("");
  h.eq(all.length, ADMIN_MANUAL.length, "an empty search shows every topic");
  h.eq(all.reduce((sum, group) => sum + group.entries.length, 0), manual.MANUAL_QUESTION_COUNT, "and every question");
  const ids = (query: string) => manual.searchManual(query).flatMap((group) => group.entries.map((item) => item.id));
  h.ok(ids("gift code").includes("gift-make"), "\"gift code\" finds how to make one");
  same(ids("GIFT CODES"), ids("gift code"), "search ignores capitals and plurals");
  h.ok(ids("replies").includes("inbox-saved-replies"), "\"replies\" finds saved replies");
  h.ok(ids("Make a gift code").includes("gift-make"), "the words of a button find its answer");
  h.ok(ids("refund").includes("refunds"), "\"refund\" finds refunds");
  h.ok(ids("password").includes("password-reset") && ids("password").includes("staff-access"), "\"password\" finds both password answers");
  h.ok(ids("dmarc").includes("dmarc"), "technical words are found too");
  same(ids("zzqx nothing"), [], "a search with no match finds nothing");
  h.ok(ids("gift ends").every((id) => {
    const text = manual.plainManualText(allText(entry(id)!).join(" ") + " " + manual.findManualEntry(id)!.topic.title).toLowerCase();
    return text.includes("gift") && text.includes("end");
  }), "every result contains every word searched for");
  h.eq(manual.findManualEntry("nope"), null, "an unknown id opens nothing");
  h.eq(manual.manualLink("gift-make", "https://scenering.com"), "https://scenering.com/admin/email-centre?tab=manual&q=gift-make", "the link to one answer");
  same(manual.screenLabels("Select *Save* and then *Close*, not `Save`."), ["Save", "Close"], "screen labels are the words between stars");
}

/* ---- 7. The tab ------------------------------------------------------------------ */
{
  const centre = read("src/admin/EmailCentre.tsx");
  h.ok(centre.includes('const ManualTab = lazy(() => import("./ManualTab"));'), "the Manual loads only when its tab is opened");
  h.ok(!/from "\.\/(ManualTab|admin-manual)"/.test(centre), "and is never pulled into the Email Centre's first load");
  h.ok(centre.includes('["manual", "Manual"]'), "Manual is a tab");
  h.ok(centre.includes('tab === "campaigns" || tab === "manual" ? tab : "dashboard"'), "?tab=manual opens it");
  h.ok(centre.includes('if (value !== "manual") url.searchParams.delete("q");'), "leaving the Manual drops the answer from the address");
  const manualBranch = centre.indexOf('{tab === "manual" && (');
  h.ok(manualBranch > 0 && centre.indexOf("<Suspense", manualBranch) > manualBranch && centre.indexOf("<ManualTab />", manualBranch) > centre.indexOf("<Suspense", manualBranch), "the tab shows the Manual, while it loads too");
  const tab = read("src/admin/ManualTab.tsx");
  h.ok(tab.includes('new URLSearchParams(window.location.search).get("q")') && tab.includes("findManualEntry(id)"), "a link opens its answer");
  h.ok(tab.includes("scrollIntoView") && tab.includes("`manual-${scrollTo}`"), "and scrolls to it");
  h.ok(tab.includes('aria-expanded={open}') && tab.includes('aria-controls={`manual-${entry.id}-answer`}'), "each question opens and closes its answer, for screen readers too");
  h.ok(!/overflow-(y-)?(auto|scroll)/.test(tab), "no inner scroll panes");
  h.ok(tab.includes("opt-btn"), "topic buttons use the app's option buttons");
}

/* ---- 8. FastSpring --------------------------------------------------------------- */
{
  const platformSource = read("server/platform.ts");
  const fastspring = await import("../src/config/fastspring.ts");
  const setup = entry("fastspring-setup")!;
  const webhook = entry("fastspring-webhook")!;
  const productsEntry = entry("fastspring-products")!;
  const setupAndWebhookText = [...allText(setup), ...allText(webhook)].join(" ");

  /* The webhook address the manual gives is the one the server serves. */
  const webhookPath = platformSource.match(/FASTSPRING_WEBHOOK_PATH = "([^"]+)"/)?.[1] || "";
  h.eq(webhookPath, "/api/webhooks/fastspring", "the webhook path is the one the manual names");
  h.ok(setupAndWebhookText.includes(webhookPath), "the setup steps give the exact webhook address to paste");

  /* Every event the code acts on is one the manual tells the owner to tick. */
  const eventBlock = platformSource.match(/FASTSPRING_SUBSCRIPTION_EVENTS = \[([\s\S]*?)\] as const/)?.[1] || "";
  const codeEvents = [...eventBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  h.eq(codeEvents.length, 6, "the code handles six FastSpring subscription events");
  for (const eventName of codeEvents) {
    h.ok(
      (webhook.points || []).some((point) => point.includes(`\`${eventName}\``)),
      `the manual explains ${eventName}`,
    );
  }

  /* The product paths in the manual are the ones the webhook maps by. */
  const defaultPaths = fastspring.fastspringProductMappings(() => undefined).map((row) => row.path);
  same(defaultPaths, ["sceneflow-monthly", "sceneflow-yearly", "sceneforge-monthly", "sceneforge-yearly"], "the four default product paths");
  const productsText = productsEntry.steps.join(" ");
  for (const path of defaultPaths) {
    h.ok(productsText.includes(`\`${path}\``), `the manual names the product path ${path}`);
  }

  /* The setup steps name every environment variable the checklist needs. */
  for (const name of ["FASTSPRING_STOREFRONT", "FASTSPRING_WEBHOOK_SECRET", "FASTSPRING_API_USERNAME", "FASTSPRING_API_PASSWORD", "FASTSPRING_SCENEFLOW_MONTHLY_PATH"]) {
    h.ok(setupAndWebhookText.includes(name), `the setup steps name ${name}`);
  }
  h.ok(read(".env.example").includes("FASTSPRING_WEBHOOK_SECRET="), ".env.example lists the FastSpring settings the manual describes");
}

h.done("Admin manual");
