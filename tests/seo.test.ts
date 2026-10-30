import { existsSync, readFileSync, statSync } from "node:fs";
import { createHarness } from "./harness";
import { PLAN_CONFIG, PLAN_ORDER } from "../src/config/plans";
import { SITE_SECTION_PATHS, isFeatureTourPath } from "../src/lib/route";
import { LEGAL_DOCUMENTS } from "../src/marketing/legal-content";
import { MESSAGES } from "../src/marketing/product-facts";
import {
  INDEXABLE_ROBOTS,
  NOINDEX_ROBOTS,
  SEO_PAGES,
  SHARE_IMAGE,
  SITE_ORIGIN,
  canonicalPathFor,
  canonicalUrl,
  seoForPath,
} from "../src/marketing/seo";
import {
  HERO_ART,
  PRIVATE_PAGES,
  PUBLIC_PAGES,
  SEO_HEAD_END,
  SEO_HEAD_START,
  SEO_PAGE_END,
  SEO_PAGE_START,
  SITE_LOGO,
  applyPageShell,
  escapeHtml,
  pageShellFiles,
  pageShellPaths,
  renderSeoHead,
  renderSeoPage,
  structuredData,
} from "../src/marketing/seo-head";
import { STRUCTURED_DATA_ID, withOrganizationProfiles } from "../src/shared/structured-data";

const h = createHarness();
const read = (path: string) => readFileSync(path, "utf8");
const count = (text: string, needle: string) => text.split(needle).length - 1;

/* 1. One table of page metadata: distinct, branded, search-result length. */
const listed = Object.entries(SEO_PAGES).filter(([, page]) => page.indexable !== false);
const titles = listed.map(([, page]) => page.title);
h.eq(new Set(titles).size, titles.length, "each listed page has a distinct SEO title");
const descriptions = listed.map(([, page]) => page.description);
h.eq(new Set(descriptions).size, descriptions.length, "each listed page has a distinct description");
for (const [path, page] of Object.entries(SEO_PAGES)) {
  h.ok(page.title.includes("Scenering"), `${path} title carries the brand`);
  h.ok(page.title.length <= 60, `${path} title fits a search result (${page.title.length} characters)`);
  const [min, max] = page.indexable === false ? [40, 160] : [70, 160];
  h.ok(page.description.length >= min && page.description.length <= max, `${path} description is substantive and fits a search result (${page.description.length} characters)`);
}
for (const path of ["/verify-email", "/reset-password", "/email-preferences", "/unsubscribe"]) {
  h.eq(SEO_PAGES[path]?.indexable, false, `${path} is not indexable`);
}

/* 2. Canonical URLs: always the production site, one page per address. */
h.eq(SITE_ORIGIN, "https://scenering.com", "canonical URLs name the production site");
h.eq(canonicalUrl("/"), "https://scenering.com/", "the front page's canonical URL");
h.eq(canonicalUrl("/pricing"), "https://scenering.com/pricing", "a page is its own canonical URL");
h.eq(canonicalUrl("/Pricing/"), "https://scenering.com/pricing", "case and a trailing slash do not make a second page");
const tourShortcuts = Object.keys(SITE_SECTION_PATHS).filter((path) => isFeatureTourPath(path) && !SEO_PAGES[path]);
h.ok(tourShortcuts.length >= 10, `${tourShortcuts.length} feature-tour shortcuts are known`);
for (const path of tourShortcuts) {
  h.eq(canonicalPathFor(path), "/features", `${path} shows the Features page, so names it as its page`);
  h.eq(seoForPath(path).title, SEO_PAGES["/features"].title, `${path} carries the Features title, not the front page's`);
}
for (const path of ["/examples", "/no-meter", "/made-up-page"]) {
  h.eq(canonicalPathFor(path), "/", `${path} shows the front page, so names it`);
}

/* 3. index.html: the markers, and no hand-typed tags left outside them. */
const source = read("index.html");
h.eq(count(source, SEO_HEAD_START), 1, "index.html has one seo:start marker");
h.eq(count(source, SEO_HEAD_END), 1, "index.html has one seo:end marker");
h.ok(source.includes(`<div id="root">${SEO_PAGE_START}${SEO_PAGE_END}</div>`), "the readable-summary markers sit inside #root");
const outside = source.slice(0, source.indexOf(SEO_HEAD_START)) + source.slice(source.indexOf(SEO_HEAD_END));
for (const tag of ["<title", 'name="description"', 'rel="canonical"', 'name="robots"', 'property="og:', 'name="twitter:', "application/ld+json"]) {
  h.ok(!outside.includes(tag), `index.html has no hand-typed ${tag} tag — every page's comes from seo.ts`);
}
for (const asset of ["/favicon.ico", "/favicon-32.png", "/icon-192.png", "/apple-touch-icon.png", "/site.webmanifest"]) {
  h.ok(source.includes(asset) && existsSync(`public${asset}`), `${asset} is linked and present in public assets`);
}
h.ok(
  source.includes('<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />'),
  "a 192 px icon (a multiple of 48 px, as Google asks for search results) is linked"
);
h.ok(!source.includes("favicon.svg"), "the tab icon is the owner's artwork, not the retired vector mark");
h.ok(existsSync("public/icon-192.png") && existsSync(`public${SITE_LOGO.path}`), "the manifest and schema icons ship with the artwork");
const googleVerificationTag = '<meta name="google-site-verification" content="hPhCtRAdkEnwdSpyUQLsvXtHpBeZDrj7UouL7HJIMlk" />';
for (const [label, html] of [["index.html", source], ["the built front page", applyPageShell(source, "/")]] as const) {
  const headEnd = html.indexOf("</head>");
  const bodyStart = html.indexOf("<body");
  const tagAt = html.indexOf(googleVerificationTag);
  h.ok(tagAt > 0 && tagAt < headEnd && headEnd < bodyStart, `${label} keeps the Google Search Console verification tag inside <head> before <body>`);
}

/* 4. Every page's own file. */
const shellPaths = pageShellPaths();
const files = pageShellFiles(applyPageShell(source, "/"));
h.eq(files.length, shellPaths.length - 1, "a file is written for every page except the front page, which is index.html");
h.eq(new Set(files.map((file) => file.file)).size, files.length, "no two pages share a file");
h.ok(files.every((file) => /^[a-z-]+\.html$/.test(file.file)), "page files sit next to index.html with the page's own name");
for (const path of PUBLIC_PAGES.map((page) => page.path)) h.ok(shellPaths.includes(path), `${path} gets its own file`);
for (const path of tourShortcuts) h.ok(shellPaths.includes(path), `${path} gets its own file`);
for (const path of ["/examples", "/no-meter"]) h.ok(!shellPaths.includes(path), `${path} uses the front page's file`);

const metaContent = (html: string, attribute: string, key: string) =>
  html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1];
for (const path of shellPaths) {
  const html = applyPageShell(source, path);
  h.ok(!/\bAI\b|artificial intelligence|\bneural\b|machine learning/i.test(html), `${path}: SEO metadata and structured-data copy use TTS language`);
  const seo = seoForPath(path);
  const indexable = seo.indexable !== false;
  h.eq(count(html, "<title>"), 1, `${path}: one title`);
  h.ok(html.includes(`<title>${escapeHtml(seo.title)}</title>`), `${path}: its own title`);
  h.eq(metaContent(html, "name", "description"), escapeHtml(seo.description), `${path}: its own description`);
  h.eq(metaContent(html, "name", "robots"), indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS, `${path}: ${indexable ? "indexable" : "noindex"}`);
  h.eq(count(html, 'rel="canonical"'), indexable ? 1 : 0, `${path}: ${indexable ? "exactly one canonical URL" : "no canonical URL"}`);
  h.ok(html.includes(`<div id="root">${SEO_PAGE_START}<div id="seo-page">`), `${path}: carries a readable summary inside #root`);
  h.ok(html.includes('<script type="module"'), `${path}: still loads the app`);
  h.ok(html.includes('document.documentElement.setAttribute("data-theme"'), `${path}: still applies the theme before first paint`);
  h.eq(applyPageShell(html, path), html, `${path}: applying the page tags again changes nothing`);
  if (!indexable) {
    h.ok(!html.includes("application/ld+json"), `${path}: no structured data on a page that must not be listed`);
    continue;
  }
  const url = canonicalUrl(path);
  h.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${path}: canonical URL is ${url}`);
  h.eq(metaContent(html, "property", "og:url"), url, `${path}: og:url matches the canonical URL`);
  h.eq(metaContent(html, "property", "og:title"), escapeHtml(seo.title), `${path}: og:title matches the title`);
  h.eq(metaContent(html, "property", "og:image"), `${SITE_ORIGIN}${SHARE_IMAGE.path}`, `${path}: link previews show the hero image`);
  h.eq(metaContent(html, "name", "twitter:image"), `${SITE_ORIGIN}${SHARE_IMAGE.path}`, `${path}: the X card shows the hero image`);
  h.eq(metaContent(html, "name", "twitter:card"), "summary_large_image", `${path}: large link-preview card`);
}
const head = renderSeoHead("/");
h.ok(head.includes(".seo-js #seo-page{display:none}") && head.includes('classList.add("seo-js")'), "visitors with JavaScript never see the summary flash");
h.ok(read("src/main.tsx").includes('createRoot(document.getElementById("root")'), "React replaces the summary inside #root when the app starts");

/* 5. Structured data: Organization (logo), WebSite (site name), WebPage, breadcrumbs, the application. */
const structuredDataIn = (html: string) => {
  const text = html.match(/<script type="application\/ld\+json" id="seo-ld">([\s\S]*?)<\/script>/)?.[1];
  return text ? JSON.parse(text) : null;
};
for (const path of PUBLIC_PAGES.map((page) => page.path)) {
  const html = applyPageShell(source, path);
  const data = structuredDataIn(html);
  h.ok(Boolean(data), `${path}: structured data parses`);
  const graph: any[] = data?.["@graph"] ?? [];
  const ofType = (type: string) => graph.filter((node) => node["@type"] === type);
  const organization = ofType("Organization")[0];
  h.eq(organization?.name, "Scenering", `${path}: the Organization is Scenering`);
  h.eq(organization?.logo?.url, `${SITE_ORIGIN}${SITE_LOGO.path}`, `${path}: the Organization's logo is the owner's icon`);
  const site = ofType("WebSite")[0];
  h.eq(site?.name, "Scenering", `${path}: WebSite names the site Scenering, the name Google shows above a result`);
  h.eq(site?.url, "https://scenering.com/", `${path}: WebSite is the production site`);
  h.ok(site?.alternateName?.includes("scenering.com"), `${path}: the domain is offered as the alternative site name`);
  const page = graph.find((node) => String(node["@id"] || "").endsWith("#webpage"));
  h.eq(page?.url, canonicalUrl(path), `${path}: WebPage is this page`);
  h.eq(page?.primaryImageOfPage?.url, `${SITE_ORIGIN}${SHARE_IMAGE.path}`, `${path}: the page's main image is the hero image`);
  const describesApp = ["/", "/features", "/pricing"].includes(path);
  h.eq(ofType("SoftwareApplication").length, describesApp ? 1 : 0, `${path}: ${describesApp ? "describes" : "does not repeat"} the application`);
  if (path === "/") h.eq(ofType("BreadcrumbList").length, 0, "the front page has no breadcrumb");
  else h.eq(ofType("BreadcrumbList")[0]?.itemListElement?.[1]?.item, canonicalUrl(path), `${path}: the breadcrumb ends at this page`);
  h.ok(!/aggregateRating|"review"/.test(html), `${path}: no ratings or reviews are claimed`);
}
const application = (structuredData("/pricing")?.["@graph"] as any[]).find((node) => node["@type"] === "SoftwareApplication");
h.ok(application.featureList.includes("Script captions and karaoke timing"), "schema describes caption timing without promising Piper speech marks");
h.ok(application.featureList.includes("Browser-local narration without recording your own voice"), "application schema describes the narration benefit");
h.ok(application.featureList.includes("No token or credit purchases required"), "application schema describes token-free pricing");
h.ok(!JSON.stringify(application).includes("Piper"), "application schema focuses on benefits rather than engine names");
h.ok(SEO_PAGES["/"].description.includes("faceless") && SEO_PAGES["/"].description.includes("token"), "home metadata emphasizes faceless creation and no token purchases");
for (const slug of PLAN_ORDER) {
  const plan = PLAN_CONFIG[slug];
  if (plan.prices.monthly === 0) {
    h.eq(application.offers.find((offer: any) => offer.name === plan.name)?.price, "0", `${plan.name} is offered at no charge`);
    continue;
  }
  h.eq(application.offers.find((offer: any) => offer.name === `${plan.name} monthly`)?.price, String(plan.prices.monthly), `${plan.name} monthly offer matches the plan price`);
  h.eq(application.offers.find((offer: any) => offer.name === `${plan.name} yearly`)?.price, String(plan.prices.yearly), `${plan.name} yearly offer matches the plan price`);
}
h.ok(
  application.image.some((image: any) => image.url === `${SITE_ORIGIN}${HERO_ART.path}`) && existsSync(`public${HERO_ART.path}`),
  "the application's images include the hero key art"
);

/* 6. The readable summary: the page's own heading, its description, links to every page. */
for (const page of [...PUBLIC_PAGES, ...PRIVATE_PAGES]) {
  const summary = renderSeoPage(page.path);
  h.ok(summary.includes(`<h1>${escapeHtml(page.heading)}</h1>`), `${page.path}: the summary's heading`);
  h.ok(summary.includes(`<p>${escapeHtml(seoForPath(page.path).description)}</p>`), `${page.path}: the summary's description`);
  h.ok(PUBLIC_PAGES.every((link) => summary.includes(`<a href="${link.path}">`)), `${page.path}: the summary links to every listed page`);
}
h.eq(PUBLIC_PAGES[0].heading, MESSAGES.hero, "the front page's summary uses the hero's own heading");
for (const kind of ["privacy", "terms", "cookies", "refunds"] as const) {
  h.eq(PUBLIC_PAGES.find((page) => page.path === `/${kind}`)?.heading, LEGAL_DOCUMENTS[kind].title, `/${kind}: the summary uses the document's own heading`);
}
const pageSources = read("src/marketing/PublicPage.tsx") + read("src/marketing/FAQPage.tsx") + read("src/marketing/ManualPage.tsx");
for (const page of [...PUBLIC_PAGES, ...PRIVATE_PAGES]) {
  if (["/", "/privacy", "/terms", "/cookies", "/refunds"].includes(page.path)) continue;
  h.ok(
    pageSources.includes(`title="${page.heading}"`) || pageSources.includes(`<h1>${page.heading}`),
    `${page.path}: the summary heading "${page.heading}" is the page's own <h1>`
  );
}
for (const path of Object.keys(SEO_PAGES)) {
  h.ok([...PUBLIC_PAGES, ...PRIVATE_PAGES].some((page) => page.path === path), `${path} has a summary heading`);
}

/* 7. The owner's social profiles join the structured data as sameAs. */
const homeData = applyPageShell(source, "/").match(/<script type="application\/ld\+json" id="seo-ld">([\s\S]*?)<\/script>/)![1];
const withProfiles = withOrganizationProfiles(homeData, [
  "https://www.youtube.com/channel/example",
  "",
  "http://insecure.example",
  "https://www.facebook.com/profile.php?id=1",
  "https://www.youtube.com/channel/example",
]);
const organizationWithProfiles = (JSON.parse(withProfiles || "{}")["@graph"] as any[]).find((node) => node["@type"] === "Organization");
h.eq(
  JSON.stringify(organizationWithProfiles?.sameAs),
  JSON.stringify(["https://www.youtube.com/channel/example", "https://www.facebook.com/profile.php?id=1"]),
  "saved profiles become the Organization's sameAs — https only, each once"
);
const organizationCleared = (JSON.parse(withOrganizationProfiles(withProfiles || "", []) || "{}")["@graph"] as any[]).find((node) => node["@type"] === "Organization");
h.ok(organizationCleared && !("sameAs" in organizationCleared), "no saved profiles, no sameAs");
h.eq(withOrganizationProfiles("not json", ["https://x.com/example"]), null, "unreadable structured data is left alone");
h.eq(STRUCTURED_DATA_ID, "seo-ld", "the build and the browser share the structured-data element id");
h.ok(
  read("src/shared/SocialLinks.tsx").includes("applyOrganizationProfiles(SOCIAL_ICONS.map((icon) => next[icon.id]))"),
  "the social strip hands the saved profiles to the structured data"
);

/* 8. The browser keeps the same values while the visitor moves around. */
const seo = read("src/marketing/seo.ts");
const main = read("src/main.tsx");
const publicPage = read("src/marketing/PublicPage.tsx");
const marketingSite = read("src/marketing/MarketingSite.tsx");
h.ok(seo.includes('setMeta("property", "og:title"'), "route metadata updates Open Graph titles");
h.ok(seo.includes('setMeta("name", "twitter:description"'), "route metadata updates Twitter descriptions");
h.ok(seo.includes('setMeta("property", "og:image", imageUrl)'), "route metadata keeps the hero share image");
h.ok(!seo.includes("window.location.origin") && seo.includes("siteUrl(canonicalPath)"), "route canonicals always name https://scenering.com, never the address in the browser");
h.ok(!/canonical\.href|rel = "canonical"|window\.location\.origin/.test(main), "main.tsx no longer writes a canonical URL from the visitor's address");
h.ok(main.includes("querySelector<HTMLMetaElement>('meta[name=\"robots\"]')"), "the SPA updates the initial robots tag rather than emitting duplicates");
h.ok(publicPage.includes("applyPageSeo(path)"), "standalone public pages receive route-specific metadata");
h.ok(marketingSite.includes('applyPageSeo("/", "/")'), "homepage section aliases canonicalize to the homepage");

/* 9. The build writes the files; the never-connected module is gone. */
const viteConfig = read("vite.config.ts");
h.ok(
  viteConfig.includes("seoPageShells()") &&
    viteConfig.includes("pageShellFiles(html)") &&
    viteConfig.includes('applyPageShell(html, "/")'),
  "the build writes every page's file from seo-head.ts"
);
h.ok(
  !existsSync("src/shared/seo.ts") && !existsSync("src/lib/page-meta.ts") && !existsSync("scripts/generate-seo-head.ts"),
  "the old SEO module that was never connected is gone, so its stale titles cannot be switched on by mistake"
);

/* 10. The share image is the hero key art; the logo is the owner's icon. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}
const shareFile = `public${SHARE_IMAGE.path}`;
const shareSize = existsSync(shareFile) ? jpegSize(readFileSync(shareFile)) : null;
h.eq(`${shareSize?.width}x${shareSize?.height}`, `${SHARE_IMAGE.width}x${SHARE_IMAGE.height}`, "the share image is the 1200×630 link-preview shape");
h.ok(existsSync(shareFile) && statSync(shareFile).size < 300 * 1024, "the share image is light enough for previews");
h.ok(!existsSync("public/marketing/og-card.jpg"), "the old share card is gone");
h.ok(read("scripts/make-og-card.mjs").includes("hero-showpiece-1024.webp"), "the share image is built from the hero section's key art");
const logo = readFileSync(`public${SITE_LOGO.path}`);
h.eq(`${logo.readUInt32BE(16)}x${logo.readUInt32BE(20)}`, "512x512", "the logo search engines read is a 512 px square");

/* 11. robots.txt, the sitemap and the workers.dev address. */
const platform = read("server/platform.ts");
h.ok(platform.includes("Allow: /\\nAllow: /api/social-links\\n"), "robots.txt lets crawlers read the social links the pages show");
const sitemapPaths = (platform.match(/const pages = \[([^\]]*)\]/)?.[1].match(/"([^"]*)"/g) ?? []).map((entry) => JSON.parse(entry) || "/");
h.eq(JSON.stringify([...sitemapPaths].sort()), JSON.stringify(PUBLIC_PAGES.map((page) => page.path).sort()), "the sitemap lists exactly the pages that are listed");
for (const path of ["/app", "/login", "/register", "/forgot-password", "/verify-email", "/reset-password"]) {
  h.ok(platform.includes(`Disallow: ${path}`), `${path} is excluded from crawler discovery`);
}
const headers = read("public/_headers");
// Every standalone page is its own document naming the hashed bundle, so each
// one must revalidate. A rule for "/index.html" never covered "/features":
// after a deployment, a cached features.html asked for a bundle that no longer
// existed, 404'd, and rendered a blank page while the home page kept working.
for (const page of [...PUBLIC_PAGES, ...PRIVATE_PAGES].map((entry) => entry.path)) {
  if (page === "/") continue;
  const rule = `\n${page}\n  Cache-Control: no-cache, must-revalidate`;
  h.ok(headers.includes(rule), `${page} revalidates its document after a deployment`);
  h.ok(headers.includes(`${page}.html\n  Cache-Control: no-cache, must-revalidate`), `${page}.html revalidates too`);
}
h.ok(/https:\/\/:version\.:subdomain\.workers\.dev\/\*\n\s+X-Robots-Tag: noindex/.test(headers), "every page on a workers.dev address says noindex");
for (const page of ["brand-check", "icon-sheet", "render-probe"]) {
  h.ok(
    headers.includes(`/${page}\n  X-Robots-Tag: noindex`) && headers.includes(`/${page}.html\n  X-Robots-Tag: noindex`) && existsSync(`public/${page}.html`),
    `the ${page} tool page says noindex at both of its addresses`
  );
}

// The social strips are half their previous visual size across the app and
// public pages, leaving room for three additional profiles when they are added.
const app = read("src/App.tsx");
const corner = read("src/shared/SiteCornerMenu.tsx");
const signIn = read("src/studio/SignIn.tsx");
const signInCss = read("src/studio/sign-in.css");
h.ok(
  app.includes('SocialLinksRow size={18} className="hidden 2xl:flex shrink-0"'),
  "the half-size social strip is available in the studio header on ultrawide screens"
);
h.ok(corner.includes("SocialLinksRow size={20}"), "the shared menu carries half-size social links on every width");
h.ok(signIn.includes("SocialLinksRow size={20}"), "the sign-in page carries half-size social links");
h.ok(signInCss.includes("@media (max-width: 580px)") && signInCss.includes(".si-social { margin-left: 0; }"), "sign-in social links get narrow-screen spacing");
h.ok(
  publicPage.includes('BrandMark height={26}') && publicPage.includes('SocialLinksRow size={13} tone="light" className="mkt-nav-social"'),
  "the standalone public header's social marks are half-sized"
);
h.ok(
  marketingSite.includes('SocialLinksRow size={13} tone="light" className="mkt-nav-social"'),
  "the front page header draws half-size social marks"
);
h.ok(publicPage.includes("SocialLinksRow size={24}"), "the standalone-page footer social marks are half-sized");
h.ok(marketingSite.includes("SocialLinksRow size={24}"), "the front-page footer social marks are half-sized");
h.ok(read("src/shared/SocialLinks.tsx").includes("size = 12"), "unspecified social strips default to half their prior size");

h.done("SEO and brand visibility");
