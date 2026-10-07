import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import {
  INSERT_FEATURE,
  auditVipForExport,
  blockingVipFindings,
  omittableVipFindings,
  stripVipFromExport,
} from "../src/lib/vip-export-audit";
import { PLAN_CONFIG, PLAN_ORDER, isPlanCatalogItemIncluded } from "../src/config/plans";
import type { TimelineInsert } from "../src/types";

/**
 * VIP creative tools are usable while you work and visible in the preview.
 * The line is the final download. These checks hold that line from both
 * sides: nothing paid may reach the rendered file, and nobody may be
 * surprised by that at the moment they press Render.
 */

const h = createHarness();
const render = readFileSync("src/components/RenderView.tsx", "utf8");

const insert = (over: Partial<TimelineInsert>): TimelineInsert =>
  ({
    id: over.id ?? "i1",
    category: over.category ?? "stickers",
    type: over.type ?? "sticker_arrow",
    title: over.title ?? "Neon Arrow",
    startTime: 0,
    duration: 3,
    position: { x: 0.5, y: 0.5 },
    size: 1,
    ...over,
  }) as TimelineInsert;

/* ------------------------------------------------- nothing paid escapes */

// Every category the render can draw either costs a feature or is a
// catalogue item that is checked per item. A category in neither list would
// be a silent hole in the gate.
const CATALOGUE_CHECKED = ["call_to_action", "logo", "background_music", "audio_visualizers"];
const studioCategories: TimelineInsert["category"][] = [
  "stickers", "content_cards", "text_templates", "lower_thirds", "audio_visualizers",
  "speech_reactive", "background_music", "filters", "sound_effects", "special_effects",
  "meditation", "intro", "outro", "call_to_action", "logo",
];
for (const category of studioCategories) {
  h.ok(
    Boolean(INSERT_FEATURE[category]) || CATALOGUE_CHECKED.includes(category),
    `${category} is gated either by feature or per catalogue item`
  );
}

// A Free project full of VIP work: every one of these is found.
const vipProject = {
  inserts: [
    insert({ id: "a", category: "stickers", type: "sticker_arrow" }),
    insert({ id: "b", category: "text_templates", type: "tt_quote", title: "Quote card" }),
    insert({ id: "c", category: "sound_effects", type: "sfx_whoosh", title: "Whoosh" }),
    insert({ id: "d", category: "audio_visualizers", type: "premium_orbit", title: "Orbit" }),
    insert({ id: "e", category: "background_music", type: "bgm_custom_track", title: "Custom track" }),
    // Included on Free, and must NOT be reported:
    insert({ id: "ok1", category: "audio_visualizers", type: "fine_radial_bars", title: "Radial bars" }),
    insert({ id: "ok2", category: "background_music", type: "bgm_divider", title: "Divider" }),
  ],
  videoFilter: { id: "cine_teal", settings: {} as any },
  sceneAnimationEnabled: true,
  motionStyle: "parallax_push",
  captionsConfig: { enabled: true, preset: "premium_style" } as any,
  selectedVoice: "premium_narrator",
  voiceEcho: { enabled: true, preset: "cathedral", mix: 0.4 } as any,
};

const found = auditVipForExport("free", vipProject);
const ids = found.map((finding) => finding.id);
h.ok(ids.includes("insert:a"), "a VIP sticker is found");
h.ok(ids.includes("insert:b"), "a VIP text template is found");
h.ok(ids.includes("insert:c"), "a VIP sound effect is found");
h.ok(ids.includes("item:d"), "a visualiser outside the Free pair is found");
h.ok(ids.includes("item:e"), "a music track outside the Free pair is found");
h.ok(ids.includes("filter"), "a filter is found");
h.ok(ids.includes("scene-animation"), "per-scene effects are found");
h.ok(ids.includes("motion"), "a paid camera movement is found");
h.ok(ids.includes("voice-echo"), "echo and ambience are found");
h.ok(ids.includes("voice"), "a voice outside the Free pair is found");
h.ok(ids.includes("caption-style"), "a caption style outside the Free pair is found");
h.ok(!ids.some((id) => id.endsWith("ok1") || id.endsWith("ok2")), "included choices are never reported as VIP");

// Every finding says what it is and why, in words a creator can act on.
for (const finding of found) {
  h.ok(finding.label.length >= 8, `"${finding.id}" says what it is`);
  h.ok(finding.detail.length >= 20, `"${finding.id}" says why`);
  h.ok(!/undefined|NaN|\[object/.test(`${finding.label}${finding.detail}`), `"${finding.id}" has no placeholder text`);
}

/* ------------------------------------------------- the cleaned render */

const safe = stripVipFromExport("free", vipProject);
h.eq(safe.inserts.length, 2, "only the two included inserts survive into the render");
h.ok(safe.inserts.every((item) => isPlanCatalogItemIncluded("free", item.category, item.type)), "and both are inside the Free selection");
h.eq(safe.videoFilter, null, "the filter is not applied to the file");
h.eq(safe.sceneAnimationEnabled, false, "per-scene effects are not rendered");
h.eq(safe.motionStyle, "dynamic", "the camera falls back to an included movement");
h.eq(safe.voiceEcho, undefined, "echo is not mixed into the exported track");
h.eq(safe.removed.length, omittableVipFindings(found).length, "everything omittable was removed");

// Re-auditing the cleaned render finds nothing that can be left out: the
// strip is complete in one pass, it does not need a second.
const afterStrip = auditVipForExport("free", {
  ...vipProject,
  inserts: safe.inserts,
  videoFilter: safe.videoFilter,
  sceneAnimationEnabled: safe.sceneAnimationEnabled,
  motionStyle: safe.motionStyle,
  voiceEcho: safe.voiceEcho,
});
h.eq(omittableVipFindings(afterStrip).length, 0, "the cleaned render has nothing left to strip");

// Voice and caption style are deliberately NOT swapped behind the creator's
// back: a download must sound and read like the preview it came from.
const blocking = blockingVipFindings(found);
h.eq(blocking.length, 2, "exactly two things must be changed by hand");
h.ok(blocking.every((finding) => finding.fixIn), "and each one names the step that changes it");
h.ok(blocking.some((finding) => finding.fixIn === "voiceover"), "the voice is changed in the Voiceover step");
h.ok(blocking.some((finding) => finding.fixIn === "captions"), "the caption style is changed in the Captions step");

// Paid plans are not nagged about anything.
for (const plan of PLAN_ORDER.filter((slug) => slug !== "free")) {
  h.eq(auditVipForExport(plan, vipProject).length, 0, `${PLAN_CONFIG[plan].name} has nothing withheld`);
  h.eq(stripVipFromExport(plan, vipProject).inserts.length, vipProject.inserts.length, `${PLAN_CONFIG[plan].name} renders every insert`);
}

// An empty or plain project is silent — no warning for people with nothing
// VIP in their video.
h.eq(auditVipForExport("free", {}).length, 0, "an empty project triggers no warning");
h.ok(
  auditVipForExport("free", { selectedVoice: "speechify_male_01", sceneVoices: ["speechify_female_02"] }).some((finding) => finding.id === "voice"),
  "a VIP voice assigned to one scene is caught even when the global voice is Free"
);
h.eq(
  auditVipForExport("free", {
    inserts: [insert({ id: "s", category: "call_to_action", type: "cta_youtube_subscribe", title: "Subscribe" })],
    captionsConfig: { enabled: true, preset: "newsroom_clean" } as any,
    selectedVoice: "speechify_female_01",
  }).length,
  0,
  "the standard Subscribe button, a Free caption style and a Free voice raise nothing"
);

/* ------------------------------------------------- the screen itself */

h.ok(render.includes("auditVipForExport("), "the render screen audits the project");
h.ok(render.includes("stripVipFromExport("), "and hands the renderer a cleaned copy");
h.ok(!/const INSERT_FEATURE/.test(render), "there is only one gate table, in the shared module");

// The warning must come BEFORE the work: the render returns early and opens
// the dialog instead of starting an encode the file cannot keep.
h.ok(
  /if \(isFinalExport && vipFindings\.length > 0 && !vipAcknowledged\) \{\s*setVipPrompt/.test(render),
  "a final render stops and warns before any work starts"
);
h.ok(/vipAcknowledged = false/.test(render), "and only proceeds once the creator has accepted it");
h.ok(render.includes("Render without them"), "the dialog offers to render without the VIP work");
h.ok(render.includes("see VIP plans"), "and offers the plans that would include it");

// A draft is never METERED and never blocked — that is the point of a draft.
h.ok(
  /const isFinalExport = Boolean\(plan\) \|\| settings\.quality !== "draft";/.test(render),
  "draft renders are not final exports"
);
// …but it is still a file in the Vault with a download button, so it is
// cleaned too: the strip is not conditional on the export being final.
h.ok(
  /const exportSafe = stripVipFromExport\(currentPlan, \{/.test(render),
  "every render, draft included, is handed the cleaned copy"
);
h.ok(!/const exportSafe = isFinalExport/.test(render), "the cleaning is not skipped for drafts");

// The manifest sent to the server describes the cleaned render, so the
// server's own check and the file agree.
h.ok(render.includes("for (const insert of exportInserts)"), "the manifest is built from the cleaned inserts");
h.ok(render.includes("if (exportFilter) required.add(\"filters\")"), "and the cleaned filter");
h.ok(render.includes("resolveVoiceEcho(exportVoiceEcho)"), "and the cleaned echo");
// Inside the render itself, the project's own values must not be reachable:
// everything draws from the cleaned copies. (The idle preview canvas
// elsewhere on the page legitimately shows the real thing — it is a
// preview, not a download, which is why this looks at the function body.)
{
  // From the end of the cleaning step (the audit input above it names the
  // project's own values on purpose) to the end of the function.
  const body = render.slice(
    render.indexOf("setVipOmittedLast(exportSafe.removed);"),
    render.indexOf("const renderFileName =")
  );
  for (const [pattern, what] of [
    [/getFilterCanvas\(videoFilter,/, "the filter"],
    [/paintVideoFilter\(ctx, videoFilter,/, "the filter overlay"],
    [/buildInsertAudioPlan\(inserts,/, "the insert audio mix"],
    [/requiredVisualizerFftSize\(inserts\)/, "the visualiser analysis"],
    [/resolveVoiceEcho\(voiceEcho\)/, "the narration echo"],
    [/\bsceneAnimationEnabled,/, "the per-scene effects"],
  ] as [RegExp, string][]) {
    h.ok(!pattern.test(body), `${what} is read from the cleaned copy, not the project`);
  }
  h.ok(body.includes("exportInserts"), "the render body works from the cleaned inserts");
  h.ok((body.match(/exportInserts/g) || []).length >= 8, "and does so everywhere inserts are used");
}

// And the creator is told, afterwards, what the file does not contain.
h.ok(render.includes("Rendered without"), "the finished render says what was left out");

h.done("VIP export audit");
