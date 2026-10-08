import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { planRequiresSceneringWatermark } from "../src/lib/scenering-watermark";

const h = createHarness();

// Membership, not project data or a render preference, decides product
// branding. Treat an unresolved plan as Free so it cannot produce an
// accidentally unbranded render while an account is still loading.
h.ok(planRequiresSceneringWatermark("free"), "Free requires the Scenering watermark");
h.ok(!planRequiresSceneringWatermark("sceneflow"), "SceneFlow does not require the Scenering watermark");
h.ok(!planRequiresSceneringWatermark("sceneforge"), "SceneForge does not require the Scenering watermark");
h.ok(planRequiresSceneringWatermark(undefined), "an unresolved plan safely uses the Free watermark policy");

const renderView = readFileSync("src/components/RenderView.tsx", "utf8");
const preview = readFileSync("src/components/VideoPreview.tsx", "utf8");

h.ok(
  renderView.includes("planRequiresSceneringWatermark(currentPlan)"),
  "export derives watermark visibility from the active plan"
);
h.ok(
  preview.includes("planRequiresSceneringWatermark(getInterfacePlan(account))"),
  "studio preview derives watermark visibility from the active plan"
);
h.ok(
  !/includeWatermark|watermarkOpacity|watermarkScale/.test(renderView),
  "the export has no creator-controlled watermark preference"
);
h.ok(
  (renderView.match(/drawPlanWatermark\(\);/g) || []).length >= 3,
  "export paints the mark for intro, outro, and regular scene frames"
);
h.ok(
  (preview.match(/drawPlanWatermark\(ctx\);/g) || []).length >= 4,
  "preview paints the mark for regular, scrubbed, intro, and outro frames"
);
h.ok(
  renderView.lastIndexOf("drawPlanWatermark();") > renderView.lastIndexOf("renderTimelineInsert"),
  "export composites the watermark after creator timeline inserts"
);
h.ok(
  preview.lastIndexOf("drawPlanWatermark(ctx);") > preview.lastIndexOf("renderTimelineInsert"),
  "preview composites the watermark after creator timeline inserts"
);
h.ok(
  renderView.includes("The required Scenering watermark could not load"),
  "Free export fails rather than silently writing an unbranded file"
);

h.done("watermark policy");
