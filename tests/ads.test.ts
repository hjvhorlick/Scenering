import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { ADSENSE_PUBLISHER_ID, ADSENSE_SLOT_STUDIO, ADSENSE_SLOT_WEB, adsTxtLine, adsenseClientId, adsensePlacementEnabled, adsenseSlotId, studioAdsEligible } from "../src/shared/ads";
import { applyPageShell, pageShellPaths } from "../src/marketing/seo-head";

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* Configuration gates: the publisher id and both ad units are committed, so a
   plain build with no .env at all serves advertising. An env value overrides
   the committed one, and a malformed override falls back rather than
   disabling the placement. */
{
  const empty: Record<string, string | undefined> = {};
  h.eq(adsenseClientId(empty), ADSENSE_PUBLISHER_ID, "the committed publisher id is the default, so no build can lack one");
  h.eq(adsenseSlotId(empty, "web"), ADSENSE_SLOT_WEB, "the public-page unit is committed, so no build can lack it");
  h.eq(adsenseSlotId(empty, "studio"), ADSENSE_SLOT_STUDIO, "the studio unit is committed, so no build can lack it");
  h.ok(adsensePlacementEnabled(empty, "web"), "the public-page unit is on with no .env at all");
  h.ok(adsensePlacementEnabled(empty, "studio"), "the studio rails are on with no .env at all");

  /* The real unit numbers, pinned so a stray edit cannot silently repoint
     either placement at the wrong AdSense unit. */
  h.eq(ADSENSE_SLOT_WEB, "6497478120", "the committed public-page unit is scenering-web");
  h.eq(ADSENSE_SLOT_STUDIO, "2346692151", "the committed studio unit is scenering-studio");

  const configured = {
    VITE_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456",
    VITE_ADSENSE_SLOT_WEB: "1234567890",
    VITE_ADSENSE_SLOT_STUDIO: "9876543210",
  };
  h.eq(adsenseClientId(configured), "ca-pub-1234567890123456", "a publisher override is accepted");
  h.eq(adsenseSlotId(configured, "web"), "1234567890", "a web slot override is accepted");
  h.eq(adsenseSlotId(configured, "studio"), "9876543210", "a studio slot override is accepted");
  h.ok(adsensePlacementEnabled(configured, "web"), "web placement on when fully configured");
  h.ok(adsensePlacementEnabled(configured, "studio"), "studio placement on when fully configured");
  h.eq(adsenseClientId({ VITE_ADSENSE_CLIENT_ID: "pub-123" }), ADSENSE_PUBLISHER_ID, "a malformed publisher override is ignored rather than disabling advertising");
  h.eq(adsenseSlotId({ VITE_ADSENSE_SLOT_WEB: "abc" }, "web"), ADSENSE_SLOT_WEB, "a malformed slot override falls back to the committed unit");
  h.eq(adsTxtLine("ca-pub-1234567890123456"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0", "ads.txt line names the publisher");
  h.eq(adsTxtLine(""), null, "no publisher, no ads.txt line");
}

/* Regression: advertising must never be switchable by losing configuration.

   The publisher id and both slot ids lived only in the gitignored .env.
   Emptying VITE_ADSENSE_CLIENT_ID — which vite.config.ts instructed, to avoid
   a second loader beside the one pasted literally into index.html — made
   adsenseClientId() answer "", and AdSlot renders nothing at all without a
   publisher id. Both units, the public-page one and the studio rails, went
   dark with no error, no failed build and no edit to any advertising code, and
   stayed dark through several deploys. All three values are committed now, so
   a missing, blank or malformed .env cannot switch advertising off. */
{
  const broken: Record<string, string | undefined>[] = [
    {},
    { VITE_ADSENSE_CLIENT_ID: "" },
    { VITE_ADSENSE_SLOT_WEB: "" },
    { VITE_ADSENSE_SLOT_STUDIO: "" },
    { VITE_ADSENSE_SLOT_WEB: "abc", VITE_ADSENSE_SLOT_STUDIO: "nonsense" },
    { VITE_ADSENSE_CLIENT_ID: "pub-123", VITE_ADSENSE_SLOT_WEB: "", VITE_ADSENSE_SLOT_STUDIO: "" },
  ];
  for (const env of broken) {
    h.ok(adsenseClientId(env).startsWith("ca-pub-"), "no environment can leave the site without a publisher id");
    h.ok(adsensePlacementEnabled(env, "web"), "no environment can switch the public-page unit off");
    h.ok(adsensePlacementEnabled(env, "studio"), "no environment can switch the studio rails off");
  }
  /* Where an ad may appear is still decided, but by the placements rather than
     by these values: PublicPage skips the legal and account-flow pages, and
     App gates the studio rails on a signed-in Free member on Setup and Render.
     Those rules are pinned in their own blocks below. */
}

/* Audience: only signed-in free-plan members ever see studio ads. */
{
  h.ok(studioAdsEligible(true, "free"), "signed-in free member sees studio ads");
  h.eq(studioAdsEligible(true, "sceneflow"), false, "SceneFlow sees no studio ads");
  h.eq(studioAdsEligible(true, "sceneforge"), false, "SceneForge sees no studio ads");
  h.eq(studioAdsEligible(false, "free"), false, "signed-out visitors see no studio ads");
  h.eq(studioAdsEligible(true, null), false, "unknown plan sees no studio ads");
}

/* Google's snippet, pasted literally into the HTML files themselves.
   AdSense asks the publisher to put its loader into the <head> of every page
   — that tag is also how Google verifies the site — so it lives in index.html
   and the public/ tool pages as committed text, never behind a build-time env
   var that a plain build would leave unset, and never injected by the SEO
   pass, or a page could end up with two loaders. */
{
  const clientId = "ca-pub-3303356901060479";
  const snippet =
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}" ` +
    `crossorigin="anonymous"></script>`;
  /** The file with indentation collapsed, so the snippet matches however it is laid out. */
  const flat = (html: string) => html.replace(/\s+/g, " ");
  const times = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  const source = read("index.html");
  h.ok(flat(source).includes(snippet), "index.html contains the literal snippet with ca-pub-3303356901060479");
  h.eq(times(source, "adsbygoogle.js?client="), 1, "index.html carries the snippet exactly once");

  for (const file of ["public/brand-check.html", "public/icon-sheet.html", "public/render-probe.html"]) {
    const html = read(file);
    h.ok(flat(html).includes(snippet), `${file} contains the literal snippet`);
    h.eq(times(html, "adsbygoogle.js?client="), 1, `${file} carries the snippet exactly once`);
  }

  for (const path of pageShellPaths()) {
    const shell = applyPageShell(source, path);
    const at = shell.indexOf("adsbygoogle.js");
    h.eq(times(shell, "adsbygoogle.js?client="), 1, `${path}: exactly one AdSense loader, never two`);
    h.ok(at > 0 && at < shell.indexOf("</head>"), `${path}: the snippet sits before </head>`);
  }

  h.ok(
    read("public/ads.txt").split("\n").includes("google.com, pub-3303356901060479, DIRECT, f08c47fec0942fa0"),
    "public/ads.txt contains the correct google.com line"
  );
}

/* Wiring: the placements the owner agreed — one web unit away from the hero
   and pricing, and studio side rails on Setup + Render only, fitted into
   genuine side margin only. These are source checks so a refactor cannot
   quietly move an ad onto the editing canvas. */
{
  const app = read("src/App.tsx");
  h.ok(app.includes('kind="studio"') && app.includes("showAdRails"), "studio rails render from the eligibility switch");
  h.ok(app.includes('view === "create" || showRenderPage'), "rails limited to Setup and Render");
  h.ok(
    app.includes("[data-studio-workspace]") && app.includes("getBoundingClientRect"),
    "rails measure the centred workspace instead of assuming a fixed viewport width"
  );
  h.ok(
    app.includes('".t-app-hdr"') && app.includes('".sc-corner"'),
    "rails measure the header and corner menu so they never cover either"
  );
  h.ok(app.includes("RAIL_TOP_CLEAR = 80"), "rails drop a further ~2 cm below the header/menu row");
  h.ok(!app.includes("min-[1750px]"), "no blanket 1750 px wall — each side qualifies from its own margin");
  h.ok(
    app.includes('testId="adsense-studio-left"') && app.includes('testId="adsense-studio-right"'),
    "one rail on each side"
  );
  h.ok(
    read("src/components/SetupStudio.tsx").includes('data-studio-workspace="setup"'),
    "the Setup workspace exposes the box the rails measure"
  );
  h.ok(app.includes("getInterfacePlan(sessionAccount)"), "owner plan preview decides the rails, so previewing paid hides them");

  const slot = read("src/shared/AdSlot.tsx");
  h.ok(slot.includes("if (!clientId || !slot) return null;"), "unconfigured slot renders nothing and reserves no space");
  h.ok(slot.includes("pagead2.googlesyndication.com"), "the ad script loads from Google, never through the Worker");

  // One loader per page, even though the verification snippet pasted into
  // index.html carries no id: the id check alone would never see it, so
  // ensureAdsenseScript must also recognise the library by src before
  // injecting a second copy of adsbygoogle.js.
  const bootstrap = read("index.html");
  const pasted = /<script[^>]*adsbygoogle\.js\?client=[^>]*>/.exec(bootstrap)?.[0] ?? "";
  h.ok(
    pasted.includes("adsbygoogle.js?client=ca-pub-3303356901060479") && !pasted.includes(" id="),
    "the pasted verification snippet carries no element id"
  );
  h.ok(
    slot.includes(`document.querySelector('script[src*="adsbygoogle.js?client="]')`),
    "AdSlot recognises an already-present loader by src, so a configured slot never adds a second adsbygoogle.js"
  );
  h.ok(slot.includes("script.id = ADSENSE_SCRIPT_ID"), "AdSlot still marks the script it injects for the id-based dedupe");

  const marketing = read("src/marketing/MarketingSite.tsx");
  // Placement, as the product owner asked: one unit directly below the hero,
  // before the features/pitch continues — never inside the hero, never beside
  // the pricing decision, never over a demonstration.
  const webAt = marketing.indexOf('kind="web"');
  h.ok(
    webAt > marketing.indexOf("<Hero />") && webAt < marketing.indexOf("<FeatureTour />"),
    "the homepage unit sits directly below the hero and above the features"
  );
  h.ok(webAt > -1 && !marketing.slice(marketing.indexOf("<Hero"), marketing.indexOf("<Hero />") + 1).includes("AdSlot"), "the hero itself carries no advertising");
  const publicPage = read("src/marketing/PublicPage.tsx");
  h.ok(publicPage.includes("showWebAd") && publicPage.includes('"/privacy"'), "no ads on legal or account-flow pages");

  const vite = read("vite.config.ts");
  h.ok(vite.includes("ads.txt") && vite.includes("VITE_ADSENSE_CLIENT_ID"), "the build writes ads.txt from the configured publisher");

  const cookies = read("src/marketing/legal-content.ts");
  h.ok(cookies.includes("Google AdSense"), "cookie information discloses AdSense before it can be enabled");
}

h.done("AdSense placements");
