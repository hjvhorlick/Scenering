import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHarness } from "./harness";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, LEGAL_OWNER, LEGAL_ORGANISATION, LEGAL_CONTACT_PATH } from "../src/marketing/legal-content";

const h = createHarness();
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");
const content = read("src/marketing/legal-content.ts");
const page = read("src/marketing/PublicPage.tsx");
const css = read("src/marketing/marketing.css");
const platform = read("server/platform.ts");
const plans = read("src/config/plans.ts");
const sourceFiles: string[] = [];
const collect = (dir: string) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (statSync(full).isDirectory()) collect(full); else if (full.endsWith(".ts") || full.endsWith(".tsx")) sourceFiles.push(full); } };
collect(join(root, "src"));
const sourceAll = sourceFiles.filter((file) => file !== join(root, "src/marketing/legal-content.ts")).map((file) => readFileSync(file, "utf8")).join("\n");
const serverAll = read("server/platform.ts") + read("server.ts");

h.eq(Object.keys(LEGAL_DOCUMENTS).sort().join(","), "cookies,privacy,terms", "the three legal documents are registered");
h.eq(LEGAL_EFFECTIVE_DATE, "4 October 2026", "effective date is the specified date");
h.eq(LEGAL_OWNER, "Henry John Vincent Horlick", "owner constant is exact");
h.eq(LEGAL_ORGANISATION, "Horlick Group", "organisation constant is exact");
h.eq(LEGAL_CONTACT_PATH, "/contact", "contact path is exact");
for (const [kind, document] of Object.entries(LEGAL_DOCUMENTS)) {
  h.ok(document.title.length > 2 && document.lead.length > 10, `${kind} has title and lead`);
  h.ok(document.summary.length >= 2, `${kind} has a plain-language summary`);
  h.ok(document.sections.length >= 3, `${kind} has sections`);
  h.ok(document.sections.every((section) => section.heading && (section.paragraphs?.length || section.bullets?.length || section.table)), `${kind} sections have content`);
  h.ok(JSON.stringify(document).indexOf("TODO") < 0 && JSON.stringify(document).indexOf("Coming soon") < 0, `${kind} has no placeholder copy`);
  h.ok(JSON.stringify(document).toLowerCase().indexOf("guarantee") < 0, `${kind} does not make a prohibited promise`);
  h.ok(page.includes(`Effective {LEGAL_EFFECTIVE_DATE}`) && content.includes(LEGAL_EFFECTIVE_DATE), `${kind} is rendered with the effective date`);
}

for (const key of ["scenering_projects_v1", "scenering_scenes_v1", "scenering_project_settings_<id>", "scenering_inserts_<id>", "scenering_scene_meta_<id>", "scenering_customer_api_keys", "scenering_analytics_queue_v1"]) {
  h.ok(content.includes(key), `legal copy names ${key}`);
  h.ok(sourceAll.includes(key.replace("_<id>", "")), `${key} is backed by an app storage reference`);
}
for (const provider of ["Google Gemini", "gemini-3.1-flash-tts-preview", "Edge neural", "Wikimedia Commons", "Pexels", "Pixabay", "Google Translate", "Google Fonts", "Lemon Squeezy"]) {
  h.ok(content.includes(provider), `legal copy names ${provider}`);
}
for (const source of ["gemini", "msedge", "wikimedia", "pexels", "pixabay", "translate", "fonts.googleapis.com", "lemonsqueezy"]) {
  h.ok((sourceAll + serverAll).toLowerCase().includes(source), `code contains a call path for ${source}`);
}
h.ok(content.includes("20 MB") && content.includes("5 files") && content.includes("20 files") && content.includes("24 hours"), "imported voice limits are stated");
h.ok(content.includes("scenering_session") && content.includes("30 days") && content.includes("HttpOnly") && content.includes("SameSite=Lax") && content.includes("Path=/") && content.includes("Secure"), "cookie properties are stated");
h.ok(platform.includes("scenering_session") && platform.includes("Max-Age=2592000") && platform.includes("HttpOnly; SameSite=Lax"), "cookie page matches setSessionCookie");
h.ok(platform.includes("scryptSync") && platform.includes('createHmac("sha256"'), "security primitives are present in platform");
h.ok(platform.includes('["cancelled", "past_due"].includes(status) && paidThrough'), "cancellation and failed-payment grace period is implemented");
h.ok(content.includes("Lemon Squeezy is the merchant of record") && content.includes("card numbers never reach us"), "payment processor language is exact");
h.ok(content.includes("created and owned by ${LEGAL_OWNER}"), "ownership phrase is sourced from the owner constant");
h.ok(content.includes("South Africa") && content.includes("12 months"), "terms include governing law and liability cap");

for (const price of ["$0", "$19/month", "$39/month"]) h.ok(content.includes(price), `terms include ${price}`);
for (const allowance of ["3/week", "two up to 1 minute", "one up to 5 minutes", "15 final downloads/week", "Unlimited final downloads"]) h.ok(content.includes(allowance), `terms include ${allowance}`);
h.ok(plans.includes('monthly: 19') && plans.includes('monthly: 39'), "terms prices have plan source values");
h.ok(plans.includes("finalExportsPerWeek: 3") && plans.includes("finalExportsPerWeek: 15"), "terms allowances have plan source values");
const freeCatalog = plans.match(/const FREE_CATALOG = \{[\s\S]*?\n\} as const;/)?.[0] || "";
for (const voice of ["guy", "jenny"]) h.ok(freeCatalog.includes(`"${voice}"`) && content.toLowerCase().includes(voice), `free voice ${voice} is catalogued and documented`);
for (const item of ["newsroom_clean", "cinema_classic", "bgm_divider", "bgm_candlepower", "fine_radial_bars", "fine_radial_bars_3d", "cta_youtube_subscribe"]) h.ok(freeCatalog.includes(item), `free catalogue contains ${item}`);

h.ok(page.includes("LEGAL_DOCUMENTS[kind]"), "page selects the document by kind");
h.ok(page.includes("pub-legal-summary") && page.includes("In short"), "page renders summary box");
h.ok(page.includes("pub-table-wrap") && page.includes('scope="row"'), "page renders accessible legal tables");
h.ok(page.includes("pub-legal-note") && page.includes("/privacy") && page.includes("/terms") && page.includes("/cookies"), "page renders legal cross-links");
for (const rule of [".pub-legal-date", ".pub-legal-summary", ".pub-prose section + section", ".pub-prose ul", ".pub-prose .pub-table-wrap", ".pub-prose .pub-table th[scope=\"row\"]", ".pub-legal-note"]) h.ok(css.includes(rule), `CSS includes ${rule}`);
h.ok(!css.match(/@media[^{}]*max-width/), "marketing CSS uses mobile-first media queries");
h.done("legal");
