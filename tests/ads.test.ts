import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { ADSENSE_SCRIPT_ID, adsTxtLine, adsenseClientId, adsensePlacementEnabled, adsenseScriptTag, adsenseSlotId, studioAdsEligible } from "../src/shared/ads";
import { applyPageShell, pageShellFiles, pageShellPaths } from "../src/marketing/seo-head";

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* Configuration gates: ads are inert until publisher AND slot are set, and a
   malformed value must never half-enable a placement. */
{
  const empty: Record<string, string | undefined> = {};
  h.eq(adsenseClientId(empty), "", "no publisher id configured by default");
  h.eq(adsensePlacementEnabled(empty, "web"), false, "web placement off by default");
  h.eq(adsensePlacementEnabled(empty, "studio"), false, "studio placement off by default");

  const configured = {
    VITE_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456",
    VITE_ADSENSE_SLOT_WEB: "1234567890",
    VITE_ADSENSE_SLOT_STUDIO: "9876543210",
  };
  h.eq(adsenseClientId(configured), "ca-pub-1234567890123456", "publisher id accepted");
  h.eq(adsenseSlotId(configured, "web"), "1234567890", "web slot accepted");
  h.eq(adsenseSlotId(configured, "studio"), "9876543210", "studio slot accepted");
  h.ok(adsensePlacementEnabled(configured, "web"), "web placement on when fully configured");
  h.ok(adsensePlacementEnabled(configured, "studio"), "studio placement on when fully configured");
  h.eq(adsensePlacementEnabled({ VITE_ADSENSE_CLIENT_ID: "ca-pub-1234567890123456" }, "web"), false, "publisher without a slot stays off");
  h.eq(adsenseClientId({ VITE_ADSENSE_CLIENT_ID: "pub-123" }), "", "malformed publisher id rejected");
  h.eq(adsenseSlotId({ VITE_ADSENSE_SLOT_WEB: "abc" }, "web"), "", "malformed slot id rejected");
  h.eq(adsTxtLine("ca-pub-1234567890123456"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0", "ads.txt line names the publisher");
  h.eq(adsTxtLine(""), null, "no publisher, no ads.txt line");
}

/* Audience: only signed-in free-plan members ever see studio ads. */
{
  h.ok(studioAdsEligible(true, "free"), "signed-in free member sees studio ads");
  h.eq(studioAdsEligible(true, "sceneflow"), false, "SceneFlow sees no studio ads");
  h.eq(studioAdsEligible(true, "sceneforge"), false, "SceneForge sees no studio ads");
  h.eq(studioAdsEligible(false, "free"), false, "signed-out visitors see no studio ads");
  h.eq(studioAdsEligible(true, null), false, "unknown plan sees no studio ads");
}

/* Google's snippet, on every page. AdSense asks the publisher to paste its
   loader into the <head> of each page; the build writes it into every page
   file instead, so no page is ever missed and the id still lives in one place
   (VITE_ADSENSE_CLIENT_ID). Nothing is written when no id is configured. */
{
  const clientId = "ca-pub-3303356901060479";
  const source = read("index.html");
  h.eq(adsenseScriptTag(""), "", "no publisher id, no snippet");
  h.eq(adsenseScriptTag("pub-123"), "", "a malformed publisher id writes no snippet");
  const tag = adsenseScriptTag(clientId);
  h.ok(
    tag.startsWith("<script async ") && tag.includes(`js/adsbygoogle.js?client=${clientId}`) && tag.includes('crossorigin="anonymous"'),
    "the snippet is Google's own: an async loader of adsbygoogle.js with the publisher id and crossorigin"
  );
  h.ok(tag.includes(`id="${ADSENSE_SCRIPT_ID}"`), "the snippet carries the id AdSlot looks for, so a page never loads two loaders");

  for (const path of pageShellPaths()) {
    const withAds = applyPageShell(source, path, clientId);
    const at = withAds.indexOf("js/adsbygoogle.js");
    h.ok(at > 0 && at < withAds.indexOf("</head>"), `${path}: Google's AdSense snippet is inside <head>`);
    h.eq(withAds.split("js/adsbygoogle.js").length - 1, 1, `${path}: exactly one AdSense loader, never two`);
    h.eq(applyPageShell(withAds, path, clientId), withAds, `${path}: re-applying the page shell does not duplicate the snippet`);
    h.ok(!applyPageShell(source, path).includes("adsbygoogle"), `${path}: no Google script at all until a publisher id is configured`);
  }
  h.ok(
    pageShellFiles(applyPageShell(source, "/", clientId), clientId).every((file) => file.html.includes(clientId)),
    "every page file the build writes carries the snippet"
  );
}

/* Wiring: the placements the owner agreed — one web unit away from the hero
   and pricing, and studio side rails on Setup + Render only, wide screens
   only. These are source checks so a refactor cannot quietly move an ad
   onto the editing canvas. */
{
  const app = read("src/App.tsx");
  h.ok(app.includes('kind="studio"') && app.includes("showAdRails"), "studio rails render from the eligibility switch");
  h.ok(app.includes('view === "create" || showRenderPage'), "rails limited to Setup and Render");
  h.ok(app.includes("min-[1750px]:block"), "rails only where the side space is genuinely unused");
  h.ok(app.includes("fixed left-3") && app.includes("fixed right-3"), "one rail on each side");
  h.ok(app.includes("getInterfacePlan(sessionAccount)"), "owner plan preview decides the rails, so previewing paid hides them");

  const slot = read("src/shared/AdSlot.tsx");
  h.ok(slot.includes("if (!clientId || !slot) return null;"), "unconfigured slot renders nothing and reserves no space");
  h.ok(slot.includes("pagead2.googlesyndication.com"), "the ad script loads from Google, never through the Worker");

  const marketing = read("src/marketing/MarketingSite.tsx");
  h.ok(marketing.includes('kind="web"') && marketing.indexOf('kind="web"') > marketing.indexOf("<Examples"), "the homepage unit sits below the examples, not in the hero");
  const publicPage = read("src/marketing/PublicPage.tsx");
  h.ok(publicPage.includes("showWebAd") && publicPage.includes('"/privacy"'), "no ads on legal or account-flow pages");

  const vite = read("vite.config.ts");
  h.ok(vite.includes("ads.txt") && vite.includes("VITE_ADSENSE_CLIENT_ID"), "the build writes ads.txt from the configured publisher");

  const cookies = read("src/marketing/legal-content.ts");
  h.ok(cookies.includes("Google AdSense"), "cookie information discloses AdSense before it can be enabled");
}

h.done("AdSense placements");
