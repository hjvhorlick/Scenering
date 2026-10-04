import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  CUSTOM_IMAGE_PREFIX,
  MAX_CUSTOM_IMAGE_BYTES,
  isCustomImageUrl,
  customImageId,
  resolveImageUrl,
  getCustomImage,
  describeImageAsset,
} from "../src/lib/custom-image";

/**
 * Bringing your own photo or clip to a scene.
 *
 * Two rules are being guarded here, and both have already been broken once
 * in this codebase:
 *
 * 1. **An upload must survive a reload.** Anything stored as a bare `blob:`
 *    URL stops resolving when the page closes, so the scene opens empty the
 *    next day. Uploads are stored in IndexedDB and the scene keeps the
 *    stable address `custom-image:<id>` / `custom-video:<id>`.
 * 2. **Every place that draws a scene picture must resolve that address.**
 *    An unresolved `custom-image:…` in an `<img src>` is a broken image.
 */
const h = createHarness();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string) => readFileSync(join(repoRoot, name), "utf8");

const editor = read("src/components/SceneEditor.tsx");
const clipPanel = read("src/components/SceneClipPanel.tsx");
const timeline = read("src/components/Timeline.tsx");
const loader = read("src/lib/scene-image-loader.ts");
const app = read("src/App.tsx");
const attach = read("src/lib/scene-clip-attach.ts");

/* ------------------------------------------------- the custom-image store */

h.eq(CUSTOM_IMAGE_PREFIX, "custom-image:", "the stored address has its own scheme");
h.ok(MAX_CUSTOM_IMAGE_BYTES >= 10 * 1024 * 1024, "the size limit is generous enough for a camera JPEG");
h.ok(MAX_CUSTOM_IMAGE_BYTES <= 100 * 1024 * 1024, "but small enough that a few uploads cannot kill the tab");

h.ok(isCustomImageUrl("custom-image:ci_abc"), "an upload address is recognised");
h.ok(!isCustomImageUrl("https://images.example.com/a.jpg"), "a normal URL is not an upload");
h.ok(!isCustomImageUrl("blob:http://x/y"), "a blob URL is not an upload address");
h.ok(!isCustomImageUrl(undefined), "undefined is not an upload address");
h.ok(!isCustomImageUrl(null), "null is not an upload address");
h.eq(customImageId("custom-image:ci_123"), "ci_123", "the id is the part after the scheme");

// Pass-through is the property that makes this safe to call everywhere.
for (const url of [
  "https://images.pexels.com/photo.jpg",
  "/nature/mountain-sunrise-1920.webp",
  "data:image/png;base64,AAAA",
  "blob:http://localhost/abc",
]) {
  h.eq(resolveImageUrl(url), url, `a normal address passes through untouched: ${url}`);
}
h.eq(resolveImageUrl(""), null, "an empty address resolves to nothing");
h.eq(resolveImageUrl(undefined), null, "a missing address resolves to nothing");
h.eq(
  resolveImageUrl("custom-image:does_not_exist"),
  null,
  "a deleted upload resolves to nothing, so callers fall back as they would for a dead photo"
);
h.eq(getCustomImage("custom-image:nope"), undefined, "an unknown upload has no metadata");
h.eq(getCustomImage("https://example.com/a.jpg"), undefined, "a normal URL has no upload metadata");

h.eq(
  describeImageAsset({ id: "x", name: "A", mime: "image/jpeg", size: 2 * 1024 * 1024, width: 1920, height: 1080, addedAt: 0 }),
  "1920 × 1080 · 2 MB",
  "the upload card line reads as a size and a shape"
);
h.eq(
  describeImageAsset({ id: "x", name: "A", mime: "image/png", size: 12 * 1024, width: 0, height: 0, addedAt: 0 }),
  "12 KB",
  "an unmeasured small file still describes itself"
);

// Storage internals that the two rules depend on.
const store = read("src/lib/custom-image.ts");
h.ok(store.includes('indexedDB.open'), "uploads are kept in IndexedDB, not in memory alone");
h.ok(store.includes('const DB_NAME = "scenering-image"'), "the image store has its own database, so an upgrade cannot break music or video");
h.ok(/image\/svg\+xml/.test(store), "SVG is refused up front rather than tainting a canvas mid-render");
h.ok(store.includes("CustomImageError"), "refusals arrive as a message the UI can print");

/* ------------------------------------------------------- the two buttons */

h.ok(editor.includes("Upload Image"), "the scene row has an image upload button");
h.ok(editor.includes("Upload Video"), "the scene row has a video upload button");
const colourAt = editor.indexOf("<span>Colour</span>");
h.ok(colourAt > 0, "the Colour button is still in the row");
h.ok(editor.indexOf("Upload Image") > colourAt, "the uploads come at the END of the button row");
h.ok(editor.indexOf("Upload Video") > editor.indexOf("Upload Image"), "image upload sits before video upload");
h.ok(editor.includes('accept="image/*"'), "the image input only offers images");
h.ok(editor.includes('accept="video/*"'), "the video input only offers videos");
h.ok(editor.includes("imageUploadRef"), "a hidden input is driven by the image button");
h.ok(editor.includes("videoUploadRef"), "a hidden input is driven by the video button");
h.ok(editor.includes("uploadError"), "a refused upload says why on screen");
h.ok(/e\.target\.value = ""/.test(editor), "the input is cleared so the same file can be picked twice");

// The crucial wiring: an uploaded photo takes the same path as a searched
// one, which is what makes it get cropped to the frame automatically.
h.ok(editor.includes("addCustomImage(file)"), "the chosen file is stored before the scene points at it");
h.ok(
  /addCustomImage\(file\)[\s\S]{0,400}adoptImage\(url\)/.test(editor),
  "the stored address is adopted through adoptImage, so auto-cropping runs on uploads too"
);
h.ok(!/image_url:\s*URL\.createObjectURL/.test(editor), "no raw object URL is ever written into a scene");

/* ------------------------------------------- video uploads that persist */

h.ok(attach.includes("addCustomVideo(file)"), "video uploads go through the persistent store");
h.ok(attach.includes("custom-video:"), "and the scene keeps the stable address");
h.ok(clipPanel.includes("sceneUpdatesForVideoFile"), "the clip panel uses the shared attach helper");
h.ok(
  !/video_url:\s*url,/.test(clipPanel),
  "the clip panel no longer stores a page-lifetime blob URL in the scene (it died on reload)"
);
h.ok(
  editor.includes("sceneUpdatesForVideoFile"),
  "the row's video button produces exactly the same scene as the clip panel"
);
h.ok(attach.includes("video_mute: !isInserted"), "a script scene still mutes the clip under the narration");
h.ok(attach.includes('"loop"'), "a clip shorter than the narration still loops");

/* ------------------------------------- every drawing path resolves uploads */

h.ok(loader.includes("isCustomImageUrl"), "the shared image loader resolves upload addresses");
h.ok(
  loader.indexOf("isCustomImageUrl") < loader.indexOf("resolveLegacyLocalImage(trimmed)"),
  "it does so before any proxy or legacy rewriting is attempted"
);
h.ok(
  timeline.includes("resolveImageUrl(block.scene?.image_url)"),
  "the timeline thumbnail — the one direct <img> — resolves the address too"
);
h.ok(
  !/<img src=\{block\.scene\?\.image_url\}/.test(timeline),
  "the timeline no longer puts a raw scene address into an <img>"
);
h.ok(app.includes("loadCustomImages()"), "stored photos are re-opened on start-up, before the first project loads");

h.done("scene-uploads");
