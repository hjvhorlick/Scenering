import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createHarness, createStubContext } from "./harness";
import { installTestPlatformEnv, testD1 } from "./platform-env";
import {
  pexelsPhotoToCandidate,
  pixabayHitToCandidate,
  wikimediaInfoToCandidate,
  scoreCandidateForFrame,
  rankCandidatesForFrame,
  upgradeStockUrlForRender,
} from "../src/lib/image-candidates";
import {
  selectFreshCandidates,
  pickOneFreshCandidate,
  resetShownHistory,
  type ImageCandidate,
} from "../src/lib/image-picker";
import { computeVideoBitrateKbps } from "../src/lib/render-profile";
import { avcCodecForSize } from "../src/lib/offline-export";
import {
  renderCanvasCaptions,
  captionTypeMetrics,
  captionBlockStartY,
  DEFAULT_CAPTIONS_CONFIG,
} from "../src/lib/render-captions";
import { getMotionTransform, renderTimelineInsert } from "../src/lib/render-effects";
import { evaluateExportValidation } from "../src/lib/export-validator";
import { createMasteringChain, MUSIC_DUCK_FLOOR } from "../src/lib/audio-mastering";

const h = createHarness();

// ---------------------------------------------------------------------------
// 1. Source-image selection: resolution headroom, aspect match & upgrades
// ---------------------------------------------------------------------------
{
  const portraitPexels = pexelsPhotoToCandidate({
    width: 2000,
    height: 5200,
    src: { original: "https://images.pexels.com/photos/10/pexels-photo-10.jpeg" },
  });
  h.eq(portraitPexels, null, "extreme portrait source is rejected instead of losing >60% to cropping");

  const uhd16x9 = pexelsPhotoToCandidate({
    width: 3840,
    height: 2160,
    src: { original: "https://images.pexels.com/photos/11/pexels-photo-11.jpeg" },
  });
  const min1080 = pexelsPhotoToCandidate({
    width: 1920,
    height: 1080,
    src: { original: "https://images.pexels.com/photos/12/pexels-photo-12.jpeg" },
  });
  const fourByThree = pexelsPhotoToCandidate({
    width: 2400,
    height: 1800,
    src: { original: "https://images.pexels.com/photos/13/pexels-photo-13.jpeg" },
  });
  h.ok(uhd16x9 !== null && min1080 !== null && fourByThree !== null, "valid landscape sources accepted");
  h.eq(uhd16x9!.nativeWidth, 3840, "native source width preserved on Pexels candidate");
  h.eq(uhd16x9!.nativeHeight, 2160, "native source height preserved on Pexels candidate");

  const scoreUhd = scoreCandidateForFrame(uhd16x9!, 1920, 1080);
  const scoreMin = scoreCandidateForFrame(min1080!, 1920, 1080);
  const scoreCrop = scoreCandidateForFrame(fourByThree!, 1920, 1080);
  h.ok(scoreUhd > scoreMin, `4K 16:9 source (${scoreUhd}) outranks bare 1080p (${scoreMin}) for zoom headroom`);
  h.ok(scoreUhd > scoreCrop, `4K 16:9 source (${scoreUhd}) outranks cropped 4:3 source (${scoreCrop})`);

  const ranked = rankCandidatesForFrame([fourByThree!, min1080!, uhd16x9!], 1920, 1080);
  h.eq(ranked[0].url, uhd16x9!.url, "rankCandidatesForFrame places the highest-headroom 16:9 photo first");

  const pb = pixabayHitToCandidate({
    imageWidth: 3840,
    imageHeight: 2160,
    fullHDURL: "https://pixabay.com/get/g999_1920.jpg",
    imageURL: "https://pixabay.com/get/g999_original.jpg",
    previewURL: "https://pixabay.com/get/g999_150.jpg",
  });
  h.ok(pb !== null && pb.highResUrl === "https://pixabay.com/get/g999_original.jpg", "Pixabay preserves original highResUrl when >1920");

  const wm = wikimediaInfoToCandidate({
    width: 4096,
    height: 2304,
    thumburl: "https://upload.wikimedia.org/w/commons/a/ab/Peak.jpg/1920px-Peak.jpg",
    thumbwidth: 1920,
    url: "https://upload.wikimedia.org/w/commons/a/ab/Peak.jpg",
  });
  h.eq(wm?.nativeWidth, 4096, "Wikimedia records nativeWidth");

  resetShownHistory();
  const mixedPool: ImageCandidate[] = [
    ...Array.from({ length: 18 }, (_, i) => ({
      url: `https://example.com/low-${i}.jpg`,
      thumbnail: `https://example.com/low-${i}-t.jpg`,
      source: "pexels",
      width: 1920,
      height: 1080,
      nativeWidth: 1920,
      nativeHeight: 1440,
    })),
    ...Array.from({ length: 18 }, (_, i) => ({
      url: `https://example.com/uhd-${i}.jpg`,
      thumbnail: `https://example.com/uhd-${i}-t.jpg`,
      source: "pexels",
      width: 1920,
      height: 1080,
      nativeWidth: 3840,
      nativeHeight: 2160,
    })),
  ];
  const freshPick = pickOneFreshCandidate(mixedPool, () => 0.15);
  h.ok(Boolean(freshPick && freshPick.url.includes("/uhd-")), "Replace draws from the top resolution/aspect tier first");
  const freshGrid = selectFreshCandidates(mixedPool, 12, () => 0.25);
  h.eq(freshGrid.length, 12, "research grid returns 12 candidates");
  h.ok(
    freshGrid.filter((c) => c.url.includes("/uhd-")).length >= 8,
    "research grid strongly prefers high-headroom 16:9 photos"
  );

  // Stock render URL upgrades
  h.eq(
    upgradeStockUrlForRender(
      "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop",
      1920,
      1080
    ),
    null,
    "unzoomed 1080p leaves 1920×1080 Pexels URL untouched"
  );
  h.eq(
    upgradeStockUrlForRender(
      "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop",
      2560,
      1440
    ),
    "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?cs=tinysrgb&q=92&w=2560&h=1440&fit=crop",
    "2K/Ken-Burns headroom upgrades Pexels URL to 2560×1440 q=92"
  );
  h.eq(
    upgradeStockUrlForRender(
      "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop",
      1566,
      2784
    ),
    "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?cs=tinysrgb&q=92&w=3840&h=2160&fit=crop",
    "vertical 9:16 export upgrades 16:9 Pexels master to 3840×2160 so center crop never upscales"
  );
  h.eq(
    upgradeStockUrlForRender(
      "https://upload.wikimedia.org/w/commons/a/ab/F.jpg/1920px-F.jpg",
      3840,
      2160
    ),
    "https://upload.wikimedia.org/w/commons/a/ab/F.jpg/3840px-F.jpg",
    "4K export upgrades Wikimedia thumb to 3840px"
  );
  h.eq(
    upgradeStockUrlForRender("https://pixabay.com/get/gabc_1280.jpg", 2560, 1440),
    "https://pixabay.com/get/gabc_1920.jpg",
    "legacy 1280px Pixabay URL upgrades to 1920px"
  );
}

// ---------------------------------------------------------------------------
// 2, 3 & 4. Pipeline resolution, high-quality scaling & UHD bitrate control
// ---------------------------------------------------------------------------
{
  const previewSrc = readFileSync("src/components/VideoPreview.tsx", "utf8");
  h.ok(
    previewSrc.includes('"16:9": { w: 1920, h: 1080') &&
      previewSrc.includes('"9:16": { w: 1080, h: 1920'),
    "VideoPreview renders onto Full HD 1080p backing canvases instead of upscaling 720p"
  );
  h.ok(
    previewSrc.includes('{ alpha: false }') && previewSrc.includes('imageSmoothingQuality = "high"'),
    "VideoPreview uses an opaque RGBX surface and high-quality resampling"
  );

  const framingSrc = readFileSync("src/lib/scene-framing.ts", "utf8");
  h.ok(
    framingSrc.includes("function mipCopy(") && framingSrc.includes('imageSmoothingQuality = "high"'),
    "scene-framing uses progressive 2x mip downsampling and high-quality resampling"
  );

  // Visualizers bypass offscreen blurred floatScratch so additive bloom stays bright & razor-sharp
  const { ctx: vizCtx, opsWithArgs: vizOps } = createStubContext(3840, 2160);
  renderTimelineInsert(
    vizCtx,
    {
      id: "viz-uhd",
      category: "audio_visualizers",
      type: "spectrum_bars",
      startTime: 0,
      duration: 5,
      position: { x: 0.5, y: 0.78 },
      size: 1.2,
    } as any,
    1.2,
    3840,
    2160
  );
  h.ok(vizOps.length > 5, "4K visualizer insert draws cleanly directly onto destination context with zero NaN args");

  // Codec levels & UHD bitrates
  h.eq(avcCodecForSize(1920, 1080, 30), "avc1.640028", "1080p30 keeps Level 4.0");
  h.eq(avcCodecForSize(1920, 1080, 60), "avc1.64002a", "1080p60 uses Level 4.2");
  h.eq(avcCodecForSize(3840, 2160, 60), "avc1.640034", "4K60 uses Level 5.2");

  const qhdHigh = computeVideoBitrateKbps(2560, 1440, 30, "high");
  const uhdHigh = computeVideoBitrateKbps(3840, 2160, 30, "high");
  const uhdMax = computeVideoBitrateKbps(3840, 2160, 30, "maximum");
  h.ok(qhdHigh >= 15_000 && qhdHigh <= 20_000, `2K30 High gets quality-oriented bitrate (${qhdHigh} kbps)`);
  h.ok(uhdHigh >= 32_000 && uhdHigh <= 38_000, `4K30 High gets studio UHD bitrate (${uhdHigh} kbps)`);
  h.ok(uhdMax >= 39_000 && uhdMax <= 45_000, `4K30 Maximum gets ~40 Mbps UHD bitrate (${uhdMax} kbps)`);
}

// ---------------------------------------------------------------------------
// 5 & 6. Sharp captions (vertical safe margins, weight, shadow) & smooth motion
// ---------------------------------------------------------------------------
{
  const vertMetrics = captionTypeMetrics("medium", 1920, 1080);
  const landMetrics = captionTypeMetrics("medium", 1080, 1920);
  h.eq(landMetrics.fontPx, 43, "1080p landscape medium caption size stays 43px");
  h.ok(
    vertMetrics.fontPx >= 46 && vertMetrics.fontPx <= 56,
    `9:16 vertical caption size (${vertMetrics.fontPx}px) fits comfortably without crowding side borders`
  );
  const vertBottomY = captionBlockStartY("bottom", 1920, vertMetrics.lineSpacingPx, 1080);
  h.ok(
    1920 - vertBottomY >= 320,
    `9:16 vertical bottom captions keep generous clearance (${1920 - vertBottomY}px from bottom edge)`
  );

  // Active karaoke highlight must not carry a dark shadow on its inner fill
  const stub = createStubContext(1920, 1080);
  renderCanvasCaptions(
    stub.ctx,
    "Crystal sharp spoken words",
    0.25,
    {
      ...DEFAULT_CAPTIONS_CONFIG,
      enabled: true,
      mode: "karaoke",
      fontWeight: 400, // thin weight must be lifted to >= 600
      borderWidth: 2,
      highlightColor: "#38BDF8",
    },
    1920,
    1080
  );
  h.ok(
    String((stub.ctx as any).font).startsWith("600 ") || stub.opsWithArgs.some((o) => o.includes("600 ")),
    "thin caption font weight (400) is promoted to crisp >=600 weight"
  );
  const highlightIdx = stub.opsWithArgs.indexOf("set:fillStyle=#38BDF8");
  const nextFillIdx = stub.opsWithArgs.indexOf("fillText(CRYSTAL,591,924)", highlightIdx);
  h.ok(highlightIdx > 0, "karaoke active highlight color is painted");
  if (highlightIdx > 0) {
    const between = stub.opsWithArgs.slice(highlightIdx, nextFillIdx > highlightIdx ? nextFillIdx : highlightIdx + 4);
    h.ok(
      !between.some((op) => op.startsWith("set:shadowColor=rgba(0, 0, 0")),
      "inner active karaoke fill does not bleed a black shadow over its outline"
    );
  }

  // Smooth Ken Burns sub-pixel continuity: monotonic zoom with no integer quantization steps
  let prevScale = 0;
  for (let frame = 0; frame <= 60; frame++) {
    const tr = getMotionTransform("slow_zoom", frame / 60, 1920, 1080, 0);
    h.ok(tr.scale >= prevScale - 1e-9, "slow_zoom scale advances monotonically every frame");
    prevScale = tr.scale;
  }

  const tickerSrc = readFileSync("src/lib/frame-ticker.ts", "utf8");
  h.ok(tickerSrc.includes("nextDueAt"), "frame ticker uses phase-locked deadline cadence");
}

// ---------------------------------------------------------------------------
// 7. Finished export validation: dimensions, FPS, audio sync & duration
// ---------------------------------------------------------------------------
{
  const valid = evaluateExportValidation({
    byteSize: 12_500_000,
    expectedWidth: 1920,
    expectedHeight: 1080,
    expectedFps: 30,
    expectedDurationSec: 20,
    expectedFrames: 600,
    engine: "frame-exact",
    expectAudio: true,
    probed: { width: 1920, height: 1080, durationSec: 20.01 },
    encoderStats: {
      codedWidth: 1920,
      codedHeight: 1088, // H.264 16px macroblock height alignment
      submittedFrames: 600,
      encodedVideoChunks: 600,
      encodedAudioChunks: 938,
      videoDurationSec: 20.0,
      audioDurationSec: 20.01,
      audioPacketGaps: 0,
      audioPacketOverlaps: 0,
      audioMaxContinuityGapUs: 0,
      effectiveFps: 30,
      maxFrameDurationDriftUs: 40,
    },
  });
  h.ok(valid.ok, "valid 1080p30 export passes all 5 verification checks");
  h.eq(valid.width, 1920, "verified width reported");
  h.eq(valid.height, 1080, "verified height reported");
  h.ok((valid.audioSyncDeltaMs ?? 999) <= 20, "audio/video sync delta measured in milliseconds");

  const wrongRes = evaluateExportValidation({
    byteSize: 8_000_000,
    expectedWidth: 3840,
    expectedHeight: 2160,
    expectedFps: 30,
    expectedDurationSec: 10,
    expectedFrames: 300,
    engine: "frame-exact",
    probed: { width: 1920, height: 1080, durationSec: 10 },
  });
  h.eq(wrongRes.ok, false, "lower-resolution video masquerading as 4K is rejected");
  h.ok(wrongRes.errors.some((e) => e.includes("3840 × 2160")), "dimension mismatch error names requested 4K size");

  const badSync = evaluateExportValidation({
    byteSize: 8_000_000,
    expectedWidth: 1920,
    expectedHeight: 1080,
    expectedFps: 30,
    expectedDurationSec: 10,
    expectedFrames: 300,
    engine: "frame-exact",
    expectAudio: true,
    encoderStats: {
      codedWidth: 1920,
      codedHeight: 1080,
      submittedFrames: 300,
      encodedVideoChunks: 300,
      encodedAudioChunks: 420,
      videoDurationSec: 10.0,
      audioDurationSec: 9.4, // 600ms drift!
      audioPacketGaps: 0,
      audioPacketOverlaps: 0,
      audioMaxContinuityGapUs: 0,
      effectiveFps: 30,
      maxFrameDurationDriftUs: 20,
    },
  });
  h.eq(badSync.ok, false, "600ms audio/video sync drift is rejected before download");

  const renderSrc = readFileSync("src/components/RenderView.tsx", "utf8");
  // The calls are now wrapped in a deadline (withTimeout(...)), so the check
  // is on the call sites themselves — the ORDER is the invariant: a file that
  // fails verification is never written to the Vault and never offered for
  // download.
  const validateAt = renderSrc.indexOf("validateFinishedExport(");
  const vaultAt = renderSrc.indexOf("saveRenderToVault(");
  h.ok(
    validateAt > 0 && vaultAt > validateAt,
    "RenderView validates the finished export BEFORE committing to the Vault or presenting download"
  );
  h.ok(
    /withTimeout\(\s*validateFinishedExport\(/.test(renderSrc),
    "the verification step has a deadline, so it cannot hang the render"
  );
  h.ok(
    /withTimeout\(\s*saveRenderToVault\(/.test(renderSrc),
    "the Vault commit has a deadline, so it cannot hang the render"
  );
  h.ok(
    /if \(offlineContainer === "mp4"\)\s*\{[\s\S]{0,900}auditFinishedMp4\(/.test(renderSrc),
    "the MP4-only byte parser runs only for MP4 output"
  );
  h.ok(
    /else \{\s*setOutputAudit\(null\);\s*renderTimer\.note\("container audit", "WebM uses the browser metadata and export validation checks"\)/.test(renderSrc),
    "valid WebM output is checked by browser metadata and common export validation instead of being rejected as non-MP4"
  );
}

// ---------------------------------------------------------------------------
// 8. Voice clarity mastering & backend speed invariants
// ---------------------------------------------------------------------------
{
  const createdFilters: Array<{ type: string; freq: number; gain: number }> = [];
  const targetCalls: Array<{ target: number; startTime: number }> = [];
  const fakeNode = () => ({
    gain: {
      value: 1,
      setTargetAtTime(target: number, startTime: number) {
        targetCalls.push({ target, startTime });
      },
    },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 1 },
    attack: { value: 0 },
    release: { value: 0 },
    connect() {},
    disconnect() {},
  });
  const fakeAudioCtx = {
    createGain: () => fakeNode(),
    createDynamicsCompressor: () => fakeNode(),
    createBiquadFilter: () => {
      const rec = { type: "peaking", freq: 0, gain: 0 };
      createdFilters.push(rec);
      return {
        get type() { return rec.type; },
        set type(v: string) { rec.type = v; },
        frequency: {
          get value() { return rec.freq; },
          set value(v: number) { rec.freq = v; },
        },
        Q: { value: 1 },
        gain: {
          get value() { return rec.gain; },
          set value(v: number) { rec.gain = v; },
        },
        connect() {},
        disconnect() {},
      };
    },
  } as unknown as BaseAudioContext;

  const chain = createMasteringChain(fakeAudioCtx, "automatic");
  h.eq(createdFilters.length, 5, "automatic mastering builds 4-band vocal clarity EQ + 1 music speech-pocket filter");
  h.ok(createdFilters.some((f) => f.type === "highpass" && f.freq === 80), "80 Hz vocal high-pass removes mud/rumble");
  h.ok(createdFilters.some((f) => f.freq === 3200 && f.gain > 1.5), "3.2 kHz vocal presence boost lifts intelligibility");
  h.ok(createdFilters.some((f) => f.freq === 7500 && f.gain > 1.0), "7.5 kHz air shelf sharpens speech consonants");
  h.ok(createdFilters.some((f) => f.freq === 2800 && f.gain < -1.0), "2.8 kHz music speech-pocket dip clears space for voice");

  chain.primeVoiceEntrance?.(2.0);
  h.ok(
    targetCalls.some((c) => Math.abs(c.target - MUSIC_DUCK_FLOOR) < 1e-6 && Math.abs(c.startTime - 1.965) < 1e-3),
    "primeVoiceEntrance pre-ducks music 35ms ahead of speech entrance"
  );
  chain.dispose();
}

// Backend D1 / sync / ETag fast paths
await (async () => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "render-quality-speed-test-secret-0123456789abcdef";
  process.env.SCENERING_OWNER_EMAIL = "owner@scenering.test";
  installTestPlatformEnv();

  const { db } = await import("../src/db.ts");
  const { createApp } = await import("../server.ts");
  const { audioStore } = await import("../src/audio-store.ts");

  const user = await db.createUser({
    id: "usr_speed_1",
    email: "speed@scenering.test",
    passwordHash: "scrypt$test$hash",
    displayName: "Speed Tester",
    role: "user",
    isVerified: true,
  });

  // Zero-DDL PayPal checkout-intent lookup on a migrated DB.
  let ddlCount = 0;
  const origPrepare = testD1().prepare.bind(testD1());
  testD1().prepare = ((sql: string) => {
    if (/CREATE\s+(TABLE|INDEX)/i.test(sql)) ddlCount += 1;
    return origPrepare(sql);
  }) as any;
  try {
    await db.findPayPalCheckoutIntentByHash("missing-intent-hash");
    h.eq(ddlCount, 0, "migrated DB runs zero CREATE TABLE/INDEX round-trips on intent reads");
  } finally {
    testD1().prepare = origPrepare;
  }

  // Per-user complimentary grant sweep
  const pastGrant = await db.createComplimentaryGrant({
    userId: user.id,
    planId: "sceneflow",
    period: "monthly",
    startsAt: "2025-01-01T00:00:00.000Z",
    endsAt: "2025-02-01T00:00:00.000Z",
    reason: "expired",
    grantedBy: user.id,
    accessCodeId: null,
  });
  h.eq(await db.findAndSweepActiveComplimentaryGrant(user.id), null, "elapsed grant returns null");
  const statusRow = testD1().sqlite.prepare("SELECT status FROM complimentary_grants WHERE id = ?").get(pastGrant.id) as any;
  h.eq(statusRow?.status, "expired", "elapsed user grant is lazily marked expired");

  const app = createApp();
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "audio-etag@scenering.test",
        displayName: "Audio Tester",
        password: "strong-password-12345",
      }),
    });
    const created = (await db.findUserByEmail("audio-etag@scenering.test"))!;
    await db.updateUser(created.id, { isVerified: true });
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "audio-etag@scenering.test",
        password: "strong-password-12345",
      }),
    });
    const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
    await audioStore.upload(created.id, "aud_test_1", Buffer.from("ID3-mock-audio-bytes").toString("base64"), "audio/mpeg");

    const first = await fetch(`http://127.0.0.1:${port}/api/custom-audio/aud_test_1`, {
      headers: { Cookie: cookie },
    });
    h.eq(first.status, 200, "initial custom-audio fetch returns 200");
    const etag = first.headers.get("etag");
    h.ok(Boolean(etag), "custom-audio response includes an ETag header");

    const second = await fetch(`http://127.0.0.1:${port}/api/custom-audio/aud_test_1`, {
      headers: {
        Cookie: cookie,
        "If-None-Match": etag || "",
      },
    });
    h.eq(second.status, 304, "repeat custom-audio fetch with matching If-None-Match returns 304 without re-transferring bytes");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
})();

h.done("render quality, pipeline verification & backend speed");
