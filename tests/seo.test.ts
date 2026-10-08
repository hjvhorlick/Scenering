import { existsSync, readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { PLAN_CONFIG } from "../src/config/plans";
import { SEO_PAGES } from "../src/marketing/seo";

const h = createHarness();
const read = (path: string) => readFileSync(path, "utf8");

// Page metadata stays useful, concise, and distinct instead of repeating one
// generic description on every route.
const titles = Object.values(SEO_PAGES).map((page) => page.title);
h.eq(new Set(titles).size, titles.length, "each public route has a distinct SEO title");
for (const [path, page] of Object.entries(SEO_PAGES)) {
  h.ok(page.title.includes("Scenering"), `${path} title carries the brand`);
  h.ok(page.title.length <= 70, `${path} title is search-result length`);
  h.ok(page.description.length >= 40 && page.description.length <= 170, `${path} description is substantive and concise`);
}
h.eq(SEO_PAGES["/verify-email"].indexable, false, "email verification is not indexable");
h.eq(SEO_PAGES["/reset-password"].indexable, false, "password reset is not indexable");

const html = read("index.html");
for (const asset of ["/favicon.ico", "/favicon-32.png", "/apple-touch-icon.png", "/site.webmanifest"]) {
  h.ok(html.includes(asset) && existsSync(`public${asset}`), `${asset} is linked and present in public assets`);
}
h.ok(!html.includes("favicon.svg"), "the tab icon is the owner's artwork, not the retired vector mark");
h.ok(existsSync("public/icon-192.png") && existsSync("public/marketing/logo-scenering-512.png"), "the manifest and schema icons ship with the artwork");
h.ok(html.includes('rel="canonical" href="https://scenering.com/"'), "the static homepage has a production canonical URL");
h.ok(html.includes('property="og:url" content="https://scenering.com/"'), "Open Graph has an absolute page URL");
h.ok(html.includes('property="og:image" content="https://scenering.com/marketing/og-card.jpg"'), "Open Graph uses an absolute share image URL");
h.ok(html.includes('name="twitter:card" content="summary_large_image"'), "Twitter cards use the social share image");
h.ok(html.includes('name="description"'), "the initial HTML contains a search description before JavaScript runs");

const jsonLdText = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
h.ok(Boolean(jsonLdText), "SoftwareApplication structured data is included");
const schema = JSON.parse(jsonLdText || "{}");
h.eq(schema["@type"], "SoftwareApplication", "schema identifies the web app");
h.eq(schema.url, "https://scenering.com/", "schema links to the canonical homepage");
h.ok(schema.featureList.includes("Word-synced captions"), "schema describes caption timing accurately");
h.eq(schema.offers.find((offer: any) => offer.name === "SceneFlow monthly")?.price, String(PLAN_CONFIG.sceneflow.prices.monthly), "monthly offer matches the plan price");
h.eq(schema.offers.find((offer: any) => offer.name === "SceneForge yearly")?.price, String(PLAN_CONFIG.sceneforge.prices.yearly), "annual offer matches the plan price");

const seo = read("src/marketing/seo.ts");
const main = read("src/main.tsx");
const publicPage = read("src/marketing/PublicPage.tsx");
const marketingSite = read("src/marketing/MarketingSite.tsx");
h.ok(seo.includes('setMeta("property", "og:title"'), "route metadata updates Open Graph titles");
h.ok(seo.includes('setMeta("name", "twitter:description"'), "route metadata updates Twitter descriptions");
h.ok(seo.includes("new URL(canonicalPath, window.location.origin)"), "route canonicals are absolute URLs");
h.ok(main.includes("querySelector<HTMLLinkElement>('link[rel=\"canonical\"]')"), "the SPA reuses the static canonical tag rather than emitting duplicates");
h.ok(main.includes("querySelector<HTMLMetaElement>('meta[name=\"robots\"]')"), "the SPA updates the initial robots tag rather than emitting duplicates");
h.ok(publicPage.includes("applyPageSeo(path)"), "standalone public pages receive route-specific metadata");
h.ok(marketingSite.includes('applyPageSeo("/", "/")'), "homepage section aliases canonicalize to the homepage");

const platform = read("server/platform.ts");
for (const path of ["/features", "/how-it-works", "/pricing", "/about", "/faq", "/manual", "/contact", "/privacy", "/terms", "/cookies"]) {
  h.ok(platform.includes(`"${path}"`), `${path} is present in the sitemap`);
}
for (const path of ["/app", "/login", "/register", "/forgot-password", "/verify-email", "/reset-password"]) {
  h.ok(platform.includes(`Disallow: ${path}`), `${path} is excluded from crawler discovery`);
}

// The owner's actual social links now appear in the studio as well as the
// public site, and each common use is at least twice its old display size.
const app = read("src/App.tsx");
const corner = read("src/shared/SiteCornerMenu.tsx");
const signIn = read("src/studio/SignIn.tsx");
const signInCss = read("src/studio/sign-in.css");
/* Tablet width and up: on a phone the five 36px marks are ~220px of a 360px
   header, which is what pushed the studio's own controls under the corner menu
   — the owner's "the header is cutoff" report. The strip still renders on
   phones, in the corner menu panel and the footers. */
h.ok(
  app.includes('SocialLinksRow size={36} className="hidden md:flex shrink-0"'),
  "large social links are visible in the studio header, from tablet width up"
);
h.ok(
  /SocialLinksRow size=\{40\}/.test(corner),
  "the corner menu still carries the strip on every width, phones included"
);
h.ok(corner.includes("SocialLinksRow size={40}"), "the shared menu has enlarged social links");
h.ok(signIn.includes("SocialLinksRow size={40}"), "the sign-in page has enlarged social links");
h.ok(signInCss.includes("@media (max-width: 580px)") && signInCss.includes(".si-social { margin-left: 0; }"), "sign-in social links get narrow-screen spacing");
h.ok(
  publicPage.includes('BrandMark height={26}') && publicPage.includes('SocialLinksRow size={26} tone="light" className="mkt-nav-social"'),
  "the public header's social marks are drawn at the wordmark's own height"
);
h.ok(
  marketingSite.includes('SocialLinksRow size={26} tone="light" className="mkt-nav-social"'),
  "the front page header draws the same marks at the same height"
);
h.ok(publicPage.includes("SocialLinksRow size={48}"), "the footer keeps its larger social links");

h.done("SEO and brand visibility");
