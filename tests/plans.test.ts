import { CUSTOMISED_CTA_SUFFIX, PLAN_CONFIG, PLAN_ORDER, isPlanCaptionIncluded, isPlanCatalogItemIncluded, isPlanVoiceIncluded, validateExportCreativeManifest, type ExportCreativeManifest } from "../src/config/plans";
import { isCtaCustomised, isFreeCtaInsert } from "../src/data/cta-library";
import { readFileSync } from "node:fs";
import { createHarness } from "./harness";

const h = createHarness();
h.eq(PLAN_ORDER.join(","), "free,sceneflow,sceneforge", "exactly the three approved plans are published");
h.eq(PLAN_CONFIG.free.limits.shortExportsPerWeek, 2, "Free includes two Shorts weekly");
h.eq(PLAN_CONFIG.free.limits.longExportsPerWeek, 1, "Free includes one long-video download weekly");
h.eq(PLAN_CONFIG.free.limits.backgroundMusicTracks, 2, "Free includes two background-music choices");
h.eq(PLAN_CONFIG.free.limits.captionStyles, 2, "Free includes two caption styles");
h.eq(PLAN_CONFIG.sceneflow.limits.finalExportsPerWeek, 15, "SceneFlow includes 15 final downloads weekly");
h.eq(PLAN_CONFIG.sceneforge.limits.finalExportsPerWeek, null, "SceneForge has no Scenering-imposed download count");
h.ok(Object.values(PLAN_CONFIG.sceneflow.features).every(Boolean), "SceneFlow unlocks every creative feature");
h.ok(Object.values(PLAN_CONFIG.sceneforge.features).every(Boolean), "SceneForge unlocks every creative feature");

const freeSample: ExportCreativeManifest = {
  features: ["background_music", "sound_visualiser"],
  voice: "speechify_male_01",
  captionStyle: "newsroom_clean",
  backgroundMusic: ["bgm_divider", "bgm_candlepower"],
  audioVisualisers: ["fine_radial_bars"],
  callsToAction: ["cta_youtube_subscribe"],
};
h.eq(validateExportCreativeManifest("free", freeSample), null, "Free sample catalog authorizes final downloads");
h.ok(Boolean(validateExportCreativeManifest("free", { ...freeSample, backgroundMusic: ["bgm_custom_track"] })), "Free rejects music outside its two-track sample");
h.ok(Boolean(validateExportCreativeManifest("free", { ...freeSample, captionStyle: "premium_style" })), "Free rejects captions outside its two-style sample");
h.ok(Boolean(validateExportCreativeManifest("free", { ...freeSample, callsToAction: ["cta_instagram_follow"] })), "Free rejects CTAs other than animated Subscribe");
h.eq(validateExportCreativeManifest("sceneflow", { ...freeSample, backgroundMusic: ["bgm_custom_track"], captionStyle: "premium_style", callsToAction: ["cta_instagram_follow"] }), null, "SceneFlow permits the complete creative catalog");
h.ok(isPlanVoiceIncluded("free", "speechify_male_01") && isPlanVoiceIncluded("free", "speechify_female_01") && !isPlanVoiceIncluded("free", "speechify_male_02"), "voice cards distinguish the two Speechify Free samples from VIP choices");
h.ok(isPlanCaptionIncluded("free", "newsroom_clean") && !isPlanCaptionIncluded("free", "premium_style"), "caption cards distinguish Free samples from VIP choices");
h.ok(isPlanCatalogItemIncluded("free", "call_to_action", "cta_youtube_subscribe"), "animated Subscribe CTA remains available on Free");
h.ok(!isPlanCatalogItemIncluded("free", "call_to_action", "cta_instagram_follow"), "other CTA cards are VIP choices on Free");
h.ok(isPlanCatalogItemIncluded("sceneflow", "background_music", "bgm_custom_track"), "paid plans can use every catalog choice");
const paidSurfaces = ["VideoStudio.tsx", "VoiceoverStudio.tsx", "VoiceMediaLibrary.tsx", "CaptionsStudio.tsx"].map((name) => readFileSync(`src/components/${name}`, "utf8"));
h.ok(paidSurfaces.every((source) => source.includes("VipFeatureBadge")), "every major creative selector displays the VIP symbol");
h.ok(paidSurfaces.every((source) => source.includes("openMembershipPlans")), "clicking a VIP creative choice opens membership plan options");

/* ------------------------------------------------- VIP: voice echo ------ */

// Echo and ambience are written into the exported voice track, so they are
// a paid sound. Free may audition every space in the Voiceover step — the
// line is drawn at the final download, like every other plan limit.
h.ok(!PLAN_CONFIG.free.features.voice_echo, "voice echo is NOT a Free feature");
h.ok(PLAN_CONFIG.sceneflow.features.voice_echo, "SceneFlow includes voice echo");
h.ok(PLAN_CONFIG.sceneforge.features.voice_echo, "SceneForge includes voice echo");
h.ok(
  Boolean(validateExportCreativeManifest("free", { ...freeSample, features: [...freeSample.features, "voice_echo"] })),
  "a Free final download with echo on is refused"
);
h.eq(
  validateExportCreativeManifest("sceneflow", { ...freeSample, features: [...freeSample.features, "voice_echo"] }),
  null,
  "a paid final download with echo on is authorized"
);

const renderView = readFileSync("src/components/RenderView.tsx", "utf8");
h.ok(renderView.includes('required.add("voice_echo")'), "the export gate actually asks for voice_echo");
h.ok(/voiceEchoIsActive\([\s\S]{0,60}\)\) required\.add\("voice_echo"\)/.test(renderView), "it asks only when the echo is really switched on");
const voiceStudio = readFileSync("src/components/VoiceoverStudio.tsx", "utf8");
h.ok(voiceStudio.includes("echoIsVip"), "the Voiceover step knows echo is a VIP sound");
h.ok(/echoIsVip && <VipFeatureBadge/.test(voiceStudio), "and marks the echo panel with the VIP symbol on Free");

/* ----------------------------------- VIP: anything but the plain Subscribe */

// Free includes ONE button: the standard Subscribe badge as it ships. The
// button settings can rebuild it into any button at all, and a made-to-order
// button is a VIP button whichever badge it started from.
const subscribe = {
  type: "cta_youtube_subscribe",
  visualOptions: { platform: "youtube_subscribe" },
  content: {},
};
h.ok(isFreeCtaInsert(subscribe), "the untouched Subscribe badge is the Free call to action");
h.ok(!isCtaCustomised(subscribe), "an untouched badge is not a custom one");
h.ok(
  isFreeCtaInsert({ ...subscribe, visualOptions: { ...subscribe.visualOptions, primaryColor: "#FF0000", secondaryColor: "#B00000" } }),
  "re-stating the shipped colours is not a change"
);

const variations: Array<[string, any]> = [
  ["a recoloured Subscribe button", { visualOptions: { platform: "youtube_subscribe", primaryColor: "#EAB308" } }],
  ["a re-worded Subscribe button", { content: { primaryText: "JOIN THE VIP CLUB" } }],
  ["a re-subtitled Subscribe button", { content: { secondaryText: "Members only" } }],
  ["a re-shaped Subscribe button", { visualOptions: { platform: "youtube_subscribe", ctaShape: "banner" } }],
  ["a re-styled Subscribe button", { visualOptions: { platform: "youtube_subscribe", ctaStyle: "outline" } }],
  ["a Subscribe button wearing an uploaded logo", { visualOptions: { platform: "youtube_subscribe", customMark: "data:image/png;base64,AAA" } }],
  ["a re-badged Subscribe button", { content: { badgeText: "Follow" } }],
];
for (const [label, patch] of variations) {
  const insert = {
    ...subscribe,
    ...patch,
    visualOptions: { ...subscribe.visualOptions, ...(patch.visualOptions || {}) },
    content: { ...subscribe.content, ...(patch.content || {}) },
  };
  h.ok(isCtaCustomised(insert), `${label} counts as made-to-order`);
  h.ok(!isFreeCtaInsert(insert), `${label} is NOT the free Subscribe button`);
}

h.ok(!isFreeCtaInsert({ type: "cta_instagram_follow", visualOptions: { platform: "instagram_follow" }, content: {} }), "another platform is never the free button");
h.ok(isFreeCtaInsert({ type: "cta_youtube_subscribe", visualOptions: null, content: null }), "a badge with no options at all is still the shipped one");

// The server must be able to refuse a restyled button, so the browser reports
// it with a suffix rather than a type that looks like the free one.
h.ok(
  Boolean(validateExportCreativeManifest("free", { ...freeSample, callsToAction: [`cta_youtube_subscribe${CUSTOMISED_CTA_SUFFIX}`] })),
  "a Free download with a restyled Subscribe button is refused"
);
h.eq(
  validateExportCreativeManifest("sceneflow", { ...freeSample, callsToAction: [`cta_youtube_subscribe${CUSTOMISED_CTA_SUFFIX}`] }),
  null,
  "a paid download may use any button it likes"
);
h.ok(renderView.includes("isFreeCtaInsert(insert)"), "the export gate judges the button, not just its type");
h.ok(renderView.includes("CUSTOMISED_CTA_SUFFIX"), "and tells the server when a button was restyled");
const propertiesModal = readFileSync("src/components/InsertPropertiesModal.tsx", "utf8");
h.ok(propertiesModal.includes("ctaNeedsVip"), "the button settings panel says when a design has become VIP");
h.ok(propertiesModal.includes("VipFeatureBadge"), "and shows the VIP symbol there rather than at the download");

/* ------------------------------------------- VIP: the mark itself ------ */

// The badge is the only thing a Free user sees of the paid tiers while they
// work, so it has to read as a prize rather than a disabled state. It is
// struck in flame: orange-to-red body, hot rim, red outline, orange glow.
{
  const badge = readFileSync("src/components/VipFeatureBadge.tsx", "utf8");
  const sheet = readFileSync("src/index.css", "utf8");
  h.ok(badge.includes("vip-flame"), "the VIP badge uses the flame mark");
  h.ok(!/amber-\d{3}/.test(badge), "no muted amber survives on the badge");
  const block = sheet.slice(sheet.indexOf(".vip-flame {"), sheet.indexOf(".vip-flame.is-compact"));
  h.ok(/linear-gradient\([^)]*#ff/i.test(block), "the body is a flame gradient, not a flat fill");
  h.ok(/border: 1px solid #ff/i.test(block), "a bright orange rim");
  h.ok(/box-shadow:[\s\S]*rgba\(214, 24, 8/.test(block), "a red outline ring around it");
  h.ok(/box-shadow:[\s\S]*rgba\(255, 122, 0/.test(block), "an orange glow under it");
  h.ok(sheet.includes("vip-flame-breathe"), "the glow swells slowly instead of blinking");
  h.ok(
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.vip-flame \{\s*animation: none/.test(sheet),
    "and holds still for anyone who asked for less motion"
  );
  h.ok(sheet.includes("forced-colors: active"), "the badge still shows up in forced-colours mode");
  // Size is unchanged, so marking a row VIP never re-flows it.
  h.ok(/font-size: 9px/.test(block), "the full badge keeps its 9px size");
  h.ok(/font-size: 8px/.test(sheet.slice(sheet.indexOf(".vip-flame.is-compact"))), "the compact badge keeps its 8px size");
}

h.done("plans and creative allowances");
