/**
 * Master Render Profile suite — the central encoding configuration every
 * Scenering export inherits (src/lib/render-profile.ts) plus the audio
 * mastering stage's pure maths (src/lib/audio-mastering.ts).
 */
import { createHarness } from "./harness";
import {
  MASTER_RENDER_PROFILE,
  FRAME_RATE_CHOICES,
  QUALITY_LEVELS,
  PLATFORM_PROFILES,
  resolveFrameRate,
  resolveRenderDimensions,
  resolveRenderPlan,
  renderSignature,
  planPlatformRenders,
  computeVideoBitrateKbps,
  computeAudioBitrateKbps,
  estimateFileSizeMB,
  buildRenderFilename,
  sanitizeFileToken,
  resolutionToken,
  checkPlatformCompatibility,
  describeRenderFailure,
  buildCompatibilityFallback,
  queueStatusForProgress,
  totalFrameCount,
  getPlatformProfile,
  masterLabelForAspect,
  resolveRenderProfileSettings,
  destinationCanvas,
  renderProfileForDestination,
  destinationFileToken,
} from "../src/lib/render-profile";
import {
  duckTargetForVoiceLevel,
  duckTimeConstant,
  MUSIC_DUCK_FLOOR,
  VOICE_ACTIVE_THRESHOLD,
} from "../src/lib/audio-mastering";

const t = createHarness();

/* ---------------- the master defaults (§2, §31) ---------------- */
t.eq(MASTER_RENDER_PROFILE.container, "mp4", "master container is MP4");
t.eq(MASTER_RENDER_PROFILE.videoCodec, "h264", "master codec is H.264/AVC");
t.eq(MASTER_RENDER_PROFILE.pixelFormat, "yuv420p", "master pixel format is yuv420p");
t.eq(MASTER_RENDER_PROFILE.frameRate, 30, "master default frame rate is 30 FPS");
t.eq(MASTER_RENDER_PROFILE.frameRateMode, "cfr", "master uses constant frame rate");
t.eq(MASTER_RENDER_PROFILE.quality, "high", "High is the recommended default quality");
t.eq(MASTER_RENDER_PROFILE.keyframeIntervalSeconds, 2, "keyframe interval is 2 seconds");
t.eq(MASTER_RENDER_PROFILE.audioCodec, "aac", "master audio codec is AAC");
t.eq(MASTER_RENDER_PROFILE.audioSampleRateHz, 48000, "audio sample rate is 48 kHz");
t.eq(MASTER_RENDER_PROFILE.audioChannels, 2, "audio is stereo");
t.eq(MASTER_RENDER_PROFILE.fastStart, true, "web-optimised (fast-start) output is on");
t.eq(MASTER_RENDER_PROFILE.audioMastering, "automatic", "automatic mastering is the default");
t.eq(MASTER_RENDER_PROFILE.colorSpace, "BT.709 SDR", "standard SDR output, never accidental HDR");

/* ---------------- frame rate (§3, §4, §5) ---------------- */
t.eq(FRAME_RATE_CHOICES[0], 30, "30 FPS is presented first (the recommended setting)");
t.ok(FRAME_RATE_CHOICES.includes("auto"), "Auto is offered");
for (const f of [24, 25, 30, 50, 60] as const) {
  t.ok(FRAME_RATE_CHOICES.includes(f), `${f} FPS is offered`);
  t.eq(resolveFrameRate(f), f, `explicit ${f} FPS is honoured`);
}
t.eq(resolveFrameRate("auto"), 30, "auto resolves to 30 for the still-image workflow");
t.eq(resolveFrameRate(undefined), 30, "missing choice resolves to 30");
t.eq(resolveFrameRate("auto", 25), 25, "auto honours a detected 25 fps source instead of converting");
t.eq(resolveFrameRate("auto", 23.976), 24, "auto snaps a 23.976 source to 24");
t.eq(resolveFrameRate("auto", 17), 30, "auto ignores an oddball source rate");
t.eq(resolveFrameRate(60, 25), 60, "an explicit project FPS beats the source rate");

/* ---------------- resolution profiles (§6) ---------------- */
const land1080 = resolveRenderDimensions("16:9", "1080p");
t.eq(land1080.width, 1920, "landscape 1080p is 1920 wide");
t.eq(land1080.height, 1080, "landscape 1080p is 1080 tall");
const land720 = resolveRenderDimensions("16:9", "720p");
t.eq(`${land720.width}x${land720.height}`, "1280x720", "optional landscape 720p profile");
const vert = resolveRenderDimensions("9:16", "1080p");
t.eq(`${vert.width}x${vert.height}`, "1080x1920", "vertical profile is 1080×1920");
const square = resolveRenderDimensions("1:1", "1080p");
t.eq(`${square.width}x${square.height}`, "1080x1080", "square profile is 1080×1080");
t.eq(resolutionToken(1920, 1080), "1080p", "1920×1080 tokens as 1080p");
t.eq(resolutionToken(1280, 720), "720p", "1280×720 tokens as 720p");
t.eq(resolutionToken(1080, 1920), "1080x1920", "vertical tokens as WxH");
t.eq(resolutionToken(3840, 2160), "4K", "UHD tokens as 4K");

/* ---------------- platform-aware bitrate (§8) ---------------- */
const std1080 = computeVideoBitrateKbps(1920, 1080, 30, "standard");
const high1080 = computeVideoBitrateKbps(1920, 1080, 30, "high");
const max1080 = computeVideoBitrateKbps(1920, 1080, 30, "maximum");
t.eq(std1080, 8000, "1080p30 Standard hits the bottom of the 8–12 Mbps range");
t.eq(high1080, 10000, "1080p30 High is 10 Mbps");
t.eq(max1080, 12000, "1080p30 Maximum tops the range at 12 Mbps");
t.ok(std1080 < high1080 && high1080 < max1080, "quality ladder is strictly increasing");

const std720 = computeVideoBitrateKbps(1280, 720, 30, "standard");
const max720 = computeVideoBitrateKbps(1280, 720, 30, "maximum");
t.ok(std720 >= 5000 && std720 <= 7500, `720p30 Standard is inside 5–7.5 Mbps (got ${std720})`);
t.ok(max720 >= 5000 && max720 <= 7500, `720p30 Maximum is inside 5–7.5 Mbps (got ${max720})`);

t.eq(
  computeVideoBitrateKbps(1080, 1920, 30, "high"),
  high1080,
  "vertical 1080×1920 gets the same high-quality budget as landscape 1080p"
);
t.near(computeVideoBitrateKbps(1920, 1080, 60, "high"), 15000, 200, "60 fps costs ~1.5× the 30 fps bitrate");
const draft = computeVideoBitrateKbps(1280, 720, 30, "draft");
t.ok(draft < std720 / 2 + 1000, "draft preview bitrate is dramatically lighter");
t.eq(computeVideoBitrateKbps(1920, 1080, 30, "custom", 9500), 9500, "custom bitrate is honoured");
t.eq(computeVideoBitrateKbps(1920, 1080, 30, "custom", 999999), 80000, "custom bitrate is clamped to sanity");
t.ok(computeVideoBitrateKbps(320, 240, 30, "draft") >= 500, "bitrate never collapses below the floor");

/* ---------------- audio (§11) ---------------- */
t.eq(computeAudioBitrateKbps("standard"), 192, "Standard audio is 192 kbps");
t.eq(computeAudioBitrateKbps("high"), 256, "High audio is 256 kbps");
t.eq(computeAudioBitrateKbps("maximum"), 320, "Maximum audio is 320 kbps");
t.ok(computeAudioBitrateKbps("draft") >= 96, "even Draft audio stays listenable");
t.eq(computeAudioBitrateKbps("custom", 64), 96, "custom audio bitrate clamps up to 96");
t.eq(computeAudioBitrateKbps("custom", 999), 320, "custom audio bitrate clamps down to 320");

const sizeMB = estimateFileSizeMB(10000, 256, 60);
t.near(sizeMB, 76.9, 1, "a minute at 10 Mbps + 256 kbps is ~77 MB");

/* ---------------- platform inheritance & dedupe (§7, §19) ---------------- */
t.eq(PLATFORM_PROFILES.length, 7, "seven platform profiles ship");
for (const p of PLATFORM_PROFILES) {
  const plan = resolveRenderPlan(MASTER_RENDER_PROFILE, p.aspect, "1080p", p);
  t.eq(plan.container, "mp4", `${p.name} inherits the MP4 container from the master`);
  t.eq(plan.videoCodec, "h264", `${p.name} inherits H.264`);
  t.eq(plan.audioCodec, "aac", `${p.name} inherits AAC`);
  t.eq(plan.fps, 30, `${p.name} inherits 30 fps`);
  t.eq(plan.frameRateMode, "cfr", `${p.name} is constant frame rate`);
}

const landGroup = planPlatformRenders(MASTER_RENDER_PROFILE, ["youtube", "facebook", "linkedin"]);
t.eq(landGroup.length, 1, "YouTube + Facebook + LinkedIn collapse into ONE landscape master");
t.eq(landGroup[0].platforms.length, 3, "…serving all three platforms");
t.eq(`${landGroup[0].plan.width}x${landGroup[0].plan.height}`, "1920x1080", "…at 1920×1080");
t.eq(landGroup[0].masterLabel, "Landscape Master", "…labelled Landscape Master");

const mixed = planPlatformRenders(MASTER_RENDER_PROFILE, [
  "tiktok",
  "youtube",
  "youtube_shorts",
  "facebook",
  "instagram_reels",
  "linkedin",
  "pinterest",
]);
t.eq(mixed.length, 2, "all seven platforms need only TWO master encodes");
t.eq(mixed[0].masterLabel, "Landscape Master", "landscape master renders first");
t.eq(mixed[1].masterLabel, "Vertical Master", "vertical master follows");
t.eq(mixed[1].platforms.length, 4, "TikTok + Shorts + Reels + Pinterest share the vertical master");
t.eq(`${mixed[1].plan.width}x${mixed[1].plan.height}`, "1080x1920", "vertical master is 1080×1920");
t.ok(
  renderSignature(mixed[0].plan) !== renderSignature(mixed[1].plan),
  "the two masters have distinct technical signatures"
);
t.eq(
  renderSignature(resolveRenderPlan(MASTER_RENDER_PROFILE, "9:16", "1080p", getPlatformProfile("tiktok"))),
  renderSignature(resolveRenderPlan(MASTER_RENDER_PROFILE, "9:16", "1080p", getPlatformProfile("youtube_shorts"))),
  "TikTok and Shorts plans share one signature — encoded once, reused"
);
t.eq(planPlatformRenders(MASTER_RENDER_PROFILE, []).length, 0, "no platforms → no encodes");
t.eq(masterLabelForAspect("1:1"), "Square Master", "square label");

/* ---------------- file naming (§16) ---------------- */
t.eq(
  buildRenderFilename("ProjectName", "YouTube", 1920, 1080, 30, "mp4"),
  "ProjectName_YouTube_1080p_30fps.mp4",
  "landscape filename matches the spec example"
);
t.eq(
  buildRenderFilename("ProjectName", "Shorts", 1080, 1920, 30, "mp4"),
  "ProjectName_Shorts_1080x1920_30fps.mp4",
  "vertical filename matches the spec example"
);
const messy = buildRenderFilename("Mum's Café: Ep #2 (final!)", "TikTok", 1080, 1920, 30, "mp4");
t.ok(!/[\s:#'()!éì]/.test(messy), `no spaces or problem characters survive (${messy})`);
t.eq(sanitizeFileToken(""), "Scenering_Video", "empty titles fall back safely");
t.eq(sanitizeFileToken("  Hello   World  "), "Hello_World", "whitespace collapses to single underscores");

/* ---------------- platform compatibility check (§26) ---------------- */
const shorts = getPlatformProfile("youtube_shorts")!;
const okCheck = checkPlatformCompatibility(MASTER_RENDER_PROFILE, shorts, "9:16", 100);
t.ok(okCheck.allOk, "a 100s vertical video passes every Shorts check");
t.eq(okCheck.needsOwnProfile, false, "same aspect → no extra profile needed");
const longCheck = checkPlatformCompatibility(MASTER_RENDER_PROFILE, shorts, "16:9", 400);
t.ok(!longCheck.allOk, "a 400s video fails the Shorts duration limit");
t.eq(longCheck.checks.find((c) => c.id === "duration")?.ok, false, "…specifically the duration check");
t.eq(longCheck.needsOwnProfile, true, "16:9 project → Shorts needs its own vertical profile (made automatically)");
const webmMaster = { ...MASTER_RENDER_PROFILE, container: "webm" as const };
const webmCheck = checkPlatformCompatibility(webmMaster, getPlatformProfile("tiktok")!, "9:16", 60);
t.eq(webmCheck.checks.find((c) => c.id === "codec")?.ok, false, "WebM flags the codec check for TikTok");
t.eq(webmCheck.checks.find((c) => c.id === "container")?.ok, false, "…and the container check");
for (const c of okCheck.checks) {
  t.ok(c.detail.length > 0, `check "${c.label}" always explains itself`);
}

/* ---------------- error reporting & fallback (§22, §23) ---------------- */
const cancelled = describeRenderFailure("Render cancelled");
t.eq(cancelled.canAutoRetry, false, "a user cancel is not auto-retried");
const codecFail = describeRenderFailure("NotSupportedError: mimeType video/mp4 is not supported");
t.ok(codecFail.canAutoRetry, "a codec failure offers automatic retry");
t.ok(!/notsupportederror/i.test(codecFail.explanation), "the explanation is human, not the raw error");
t.eq(codecFail.technical.includes("NotSupportedError"), true, "the raw log is kept for support, not printed at the customer");
const taintFail = describeRenderFailure("SecurityError: canvas is tainted by cross-origin data");
t.ok(/image/i.test(taintFail.title), "a tainted canvas is explained as an image problem");
const memFail = describeRenderFailure("RangeError: Array buffer allocation failed — out of memory");
t.ok(/memory/i.test(memFail.title), "an OOM is explained as a memory problem");
const storageFail = describeRenderFailure("Not enough protected browser storage for this render");
t.ok(/storage/i.test(storageFail.title), "disk capacity is explained separately from RAM");
/**
 * A render that finishes every frame and then stalls while the file is being
 * packaged is the failure this product cannot leave unexplained: the customer
 * saw frames 100%, "Package" and then nothing at all.
 */
const stallFail = describeRenderFailure(
  "RenderTimeoutError: The render stopped responding while the video encoder finished the last of its frames (nothing moved for 2m 00s). Every frame was encoded, but the browser never confirmed the finished file.",
);
t.ok(/stall/i.test(stallFail.title), "a stalled packaging step is named as a stall");
t.ok(/frame/i.test(stallFail.explanation), "the explanation says the frames themselves were fine");
t.ok(/Vault|space|storage/i.test(stallFail.retryHint), "the retry hint tells the creator what to free up");
t.ok(stallFail.canAutoRetry, "a stall is worth retrying");
t.ok(/^[A-Z]/.test(stallFail.title) && !/error/i.test(stallFail.title), "the title is human, not an error class");
const watchdogFail = describeRenderFailure("render stopped responding: stall watchdog");
t.eq(watchdogFail.title, stallFail.title, "the watchdog and the deadline report the same failure");
const cancelledStallLookalike = describeRenderFailure("Render cancelled");
t.eq(cancelledStallLookalike.title, "Render cancelled", "a cancel is still a cancel, never a stall");
const unknown = describeRenderFailure("");
t.ok(/project was lost/i.test(unknown.explanation), "unknown failures reassure the creator that nothing was lost");
t.ok(unknown.canAutoRetry, "unknown failures can auto-retry");
/**
 * The card the customer reads must never contain the encoder's vocabulary.
 * This is the regression that produced "This browser cannot record the
 * selected format — the selected encoding settings are not supported by this
 * browser's encoder" on a project where nothing was wrong.
 */
for (const [name, report] of [
  ["codec", codecFail],
  ["taint", taintFail],
  ["memory", memFail],
  ["storage", storageFail],
  ["stall", stallFail],
  ["unknown", unknown],
] as const) {
  const card = `${report.title} ${report.explanation} ${report.retryHint}`;
  t.ok(
    !/codec|h\.?264|avc1|aac|vp9|opus|webcodecs|mime|encoder settings|selected encoding settings|fps|mp4|webm|profile|bitrate/i.test(card),
    `the ${name} failure card shows no encoder vocabulary`
  );
  t.ok(/^SC-[A-Z]+$/.test(report.code), `the ${name} failure card carries a short support code`);
  t.ok(report.technical.length > 0, `the ${name} failure keeps the raw log for support`);
}

/**
 * A finished file that fails Scenering's own check must not be dressed up as
 * something to retry: the check runs on the bytes after encoding, so a retry
 * repeats the work and reaches the same verdict. It is Scenering's problem,
 * and the support code is what identifies it.
 */
const verifyFail = describeRenderFailure(
  "Export validation failed: Encoder emitted 2894 video frames instead of 2893."
);
t.eq(verifyFail.code, "SC-VERIFY", "a verification refusal gets its own support code");
t.eq(verifyFail.canAutoRetry, false, "…and is never offered as an automatic retry");
t.ok(
  !/try again|retry/i.test(verifyFail.retryHint),
  "…and the creator is not told to retry something that fails identically"
);
t.ok(/our side/i.test(verifyFail.explanation), "…the explanation owns it as Scenering's problem");
{
  const auditRefusal = describeRenderFailure("The finished MP4 failed its own check: sample count 2893/2894");
  t.eq(auditRefusal.code, "SC-VERIFY", "the container audit's refusal lands in the same category");
  t.ok(/check/i.test(auditRefusal.title), "…and is described as a failed check, not a failed render");
  t.eq(auditRefusal.canAutoRetry, false, "…with no misleading retry");
}
const fb = buildCompatibilityFallback({ format: "webm", fps: 60, quality: "custom", resolution: "1080p" });
t.eq(fb.patch.format, "mp4", "fallback returns to MP4");
t.eq(fb.patch.fps, 30, "fallback returns to 30 fps");
t.eq(fb.patch.quality, "high", "custom settings fall back to the High preset");
t.eq(fb.changes.length, 3, "every change is reported — nothing silent");
const fbSame = buildCompatibilityFallback({ format: "mp4", fps: 30, quality: "high", resolution: "1080p" });
t.eq(fbSame.changes.length, 1, "an already-safe profile reports a transient retry");
const fbMem = buildCompatibilityFallback(
  { format: "mp4", fps: 30, quality: "maximum", resolution: "1080p" },
  describeRenderFailure("out of memory")
);
t.eq(fbMem.patch.resolution, "720p", "memory pressure retries at 720p");
t.ok(
  fbMem.changes.some((c) => /720p/.test(c)),
  "…and says so"
);

/* ---------------- queue status & timeline maths (§20, §21, §28) ---------------- */
t.eq(queueStatusForProgress(0.1), "preparing", "early progress reads Preparing");
t.eq(queueStatusForProgress(0.5), "rendering", "mid progress reads Rendering");
t.eq(queueStatusForProgress(0.93), "encoding", "late progress reads Encoding");
t.eq(queueStatusForProgress(0.98), "finalizing", "final progress reads Finalizing");
t.eq(queueStatusForProgress(1), "ready", "completion reads Ready");
t.eq(totalFrameCount(20, 30), 600, "20 seconds × 30 FPS = 600 frames (the spec's example)");
t.eq(totalFrameCount(8 + 13 + 15, 30), 1080, "varying scene durations sum into the exact frame count");

/* A narration scene's length is stored to one decimal place, so at the usual
 * frame rates duration × fps is always whole and both roundings agree. A
 * single-scene music video takes its length from the uploaded clip's own
 * duration — 96.44s, 87.419s — and there they do not. The encoder rounded up
 * while the post-encode check rounded to nearest, so the check refused a
 * finished file with "the encoder emitted 2894 frames instead of 2893" and
 * told the creator to retry something that fails identically every time. */
for (const [duration, fps] of [[96.44, 30], [87.42, 30], [61.3, 30], [12.345, 25], [7.7, 24]] as const) {
  t.eq(
    totalFrameCount(duration, fps),
    Math.ceil(duration * fps),
    `${duration}s at ${fps} fps counts every frame it will encode (${duration}×${fps} = ${duration * fps})`
  );
}
t.ok(
  totalFrameCount(96.44, 30) === 2894,
  "the fractional-duration case that refused a finished music video now keeps all its frames"
);
t.eq(totalFrameCount(0, 30), 0, "an empty timeline has no frames");
t.eq(totalFrameCount(Number.NaN, 30), 0, "a non-finite duration never produces NaN frames");

/* ---------------- quality ladder shape ---------------- */
t.eq(QUALITY_LEVELS.map((q) => q.id).join(","), "draft,standard,high,maximum", "ladder order");
for (let i = 1; i < QUALITY_LEVELS.length; i++) {
  t.ok(
    QUALITY_LEVELS[i].crfEquivalent < QUALITY_LEVELS[i - 1].crfEquivalent,
    `${QUALITY_LEVELS[i].name} targets a better CRF than ${QUALITY_LEVELS[i - 1].name}`
  );
  t.ok(
    QUALITY_LEVELS[i].audioKbps >= QUALITY_LEVELS[i - 1].audioKbps,
    `${QUALITY_LEVELS[i].name} audio never drops below ${QUALITY_LEVELS[i - 1].name}`
  );
}
t.ok(
  QUALITY_LEVELS.every((q) => q.audioKbps <= 320 && (q.id === "draft" || q.audioKbps >= 192)),
  "final audio bitrates sit in the 192–320 kbps window"
);

/* ---------------- voice-priority ducking maths (§12, §13) ---------------- */
t.eq(duckTargetForVoiceLevel(0), 1, "silence leaves the music fully open");
t.eq(duckTargetForVoiceLevel(VOICE_ACTIVE_THRESHOLD * 0.5), 1, "a breath below the threshold does not duck");
t.near(duckTargetForVoiceLevel(0.5), MUSIC_DUCK_FLOOR, 0.001, "full speech ducks music to the floor");
t.ok(MUSIC_DUCK_FLOOR > 0.25 && MUSIC_DUCK_FLOOR < 0.6, "the duck floor keeps music present, not muted");
let prev = 1;
for (let level = 0; level <= 0.4; level += 0.01) {
  const target = duckTargetForVoiceLevel(level);
  t.ok(target <= prev + 1e-9, `ducking is monotonic (level ${level.toFixed(2)})`);
  t.ok(target >= MUSIC_DUCK_FLOOR - 1e-9 && target <= 1, `duck target stays in range (level ${level.toFixed(2)})`);
  prev = target;
}
t.ok(duckTimeConstant(1, 0.4) < duckTimeConstant(0.4, 1), "duck attack is faster than release");

/* ---------------- render screen regression guards ----------------
 * (1) An early version swapped the <canvas> out of the DOM for the finished
 * <video> player, so every render after the first failed with "canvas not
 * available" — the canvas must stay permanently mounted.
 * (2) All output CHOICES live in Project Setup; the render screen is a
 * read-only executor. These guards keep choice UI from creeping back in. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const renderViewSrc = readFileSync(
  fileURLToPath(new URL("../src/components/RenderView.tsx", import.meta.url)),
  "utf8"
);
const setupStudioSrc = readFileSync(
  fileURLToPath(new URL("../src/components/SetupStudio.tsx", import.meta.url)),
  "utf8"
);
t.ok(
  !/renderedUrl && !isRendering \? \(/.test(renderViewSrc),
  "the render canvas is never conditionally replaced by the player (re-renders need it mounted)"
);
t.ok(
  /ref=\{canvasRef\}/.test(renderViewSrc),
  "the render canvas element exists"
);
// One render at a time, chosen in Setup: no multi-platform queue and no
// settings pickers on the render screen.
t.ok(
  !/runPlatformQueue|togglePlatform|selectedPlatforms/.test(renderViewSrc),
  "the render screen has no multi-platform queue"
);
t.ok(
  !/onUpdateRenderProfile/.test(renderViewSrc),
  "the render screen never edits the render profile (read-only summary)"
);
t.ok(
  /destinationFileToken\(renderProfile\.destination\)/.test(renderViewSrc),
  "filenames carry the destination chosen in Setup"
);
t.ok(
  /pickDestination/.test(setupStudioSrc) && /QUALITY_LEVELS/.test(setupStudioSrc),
  "destination and quality presets live in Project Setup"
);
/**
 * The render screen must never again answer a missing encoder with an encoder
 * message. Three things are pinned here:
 *   1. a device whose requested container is unsupported is asked for the
 *      compatible one before the customer is told anything;
 *   2. the raw log is not printed on the screen (no "Advanced Details" panel,
 *      no `<pre>` of the browser's error);
 *   3. the phrases from the complaint are gone.
 */
t.ok(
  !/Math\.ceil\(estimatedTotalDuration \* fpsUsed\)/.test(renderViewSrc),
  "the encode loop never rounds the frame count differently from the validator"
);
t.ok(
  /const totalFrames = totalFrameCount\(estimatedTotalDuration, fpsUsed\)/.test(renderViewSrc),
  "…it asks the shared helper for THE frame count instead"
);
t.ok(
  /totalFrameCount\(estimatedTotalDuration, fpsUsed\)/.test(renderViewSrc),
  "the same number is handed to the post-encode verification"
);
t.ok(
  /resolveEncodableFormat\(offlineConfig\)/.test(renderViewSrc),
  "the render preflight falls back to a container this device can actually encode"
);
t.ok(
  !/cannot be rendered frame-exactly in this browser/.test(renderViewSrc),
  "no render path tells the customer their browser cannot render the project"
);
t.ok(
  !/Advanced Details|showFailureDetail/.test(renderViewSrc),
  "the raw encoder log is never printed at the customer"
);
t.ok(
  /console\.error\(`Render failed \[\$\{report\.code\}\]/.test(renderViewSrc),
  "the raw log and its support code go to the console instead"
);
t.ok(
  /failureReport\.code/.test(renderViewSrc) && !/failureReport\.technical/.test(renderViewSrc),
  "the failure card shows the short support code, never the technical string"
);
t.ok(
  !/setFallbackNotes\([^)]*\)\s*;?[\s\S]{0,600}fallbackNotes\.map/.test(renderViewSrc),
  "an automatic retry no longer lists the encoder changes to the customer"
);
t.ok(
  /onUpdateRenderProfile\?\.\(renderProfileForDestination\(id\)\)/.test(setupStudioSrc),
  "changing destination applies its format and FPS defaults instead of retaining a stale incompatible override"
);

// ---- Setup-owned render profile helpers --------------------------------
const resolved = resolveRenderProfileSettings(undefined);
t.eq(resolved.destination, "youtube", "legacy projects default to the YouTube destination");
t.eq(resolved.quality, "high", "legacy projects default to High quality");
const partial = resolveRenderProfileSettings({ destination: "tiktok" } as never);
t.eq(partial.destination, "tiktok", "stored destination survives resolving");
t.eq(partial.format, "mp4", "missing fields fall back to the master defaults");
const tiktokCanvas = destinationCanvas("tiktok");
t.eq(tiktokCanvas?.aspect, "9:16", "TikTok destination sets a vertical canvas");
t.eq(tiktokCanvas?.resolution, "1080p", "platform destinations pin 1080p");
t.eq(destinationCanvas("custom"), null, "custom destination leaves the canvas alone");
const youtubePreset = renderProfileForDestination("youtube");
t.eq(youtubePreset.format, "mp4", "choosing YouTube resets a stale WebM override to the platform-safe MP4 default");
t.eq(youtubePreset.fps, 30, "choosing YouTube also resets a stale FPS override to 30");
const tiktokPreset = renderProfileForDestination("tiktok");
t.eq(tiktokPreset.format, "mp4", "TikTok's platform preset also prefers MP4");
t.eq(renderProfileForDestination("custom").format, undefined, "Custom preserves the creator's existing format override");
t.eq(destinationFileToken("youtube_shorts"), "Shorts", "filename token uses the platform short name");
t.eq(destinationFileToken("custom"), "Master", "custom output files are Master files");

t.done("render-profile");
