import { PLAN_CONFIG, PLAN_ORDER, isPlanCaptionIncluded, isPlanCatalogItemIncluded, isPlanVoiceIncluded, validateExportCreativeManifest, type ExportCreativeManifest } from "../src/config/plans";
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
  voice: "guy",
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
h.ok(isPlanVoiceIncluded("free", "guy") && !isPlanVoiceIncluded("free", "premium_narrator"), "voice cards distinguish Free samples from VIP choices");
h.ok(isPlanCaptionIncluded("free", "newsroom_clean") && !isPlanCaptionIncluded("free", "premium_style"), "caption cards distinguish Free samples from VIP choices");
h.ok(isPlanCatalogItemIncluded("free", "call_to_action", "cta_youtube_subscribe"), "animated Subscribe CTA remains available on Free");
h.ok(!isPlanCatalogItemIncluded("free", "call_to_action", "cta_instagram_follow"), "other CTA cards are VIP choices on Free");
h.ok(isPlanCatalogItemIncluded("sceneflow", "background_music", "bgm_custom_track"), "paid plans can use every catalog choice");
const paidSurfaces = ["VideoStudio.tsx", "VoiceoverStudio.tsx", "VoiceMediaLibrary.tsx", "CaptionsStudio.tsx"].map((name) => readFileSync(`src/components/${name}`, "utf8"));
h.ok(paidSurfaces.every((source) => source.includes("VipFeatureBadge")), "every major creative selector displays the VIP symbol");
h.ok(paidSurfaces.every((source) => source.includes("openMembershipPlans")), "clicking a VIP creative choice opens membership plan options");

h.done("plans and creative allowances");
