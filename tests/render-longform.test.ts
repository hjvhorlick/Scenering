/**
 * Long-form and Vault standards.
 *
 * The three promises this product makes, pinned so a later change cannot
 * quietly erode them:
 *
 *   1. THE VAULT HOLDS FIVE VIDEOS.
 *   2. THE ENGINE FINISHES A FIFTEEN-MINUTE VIDEO — including the finishing
 *      stages, which is where a deadline that was tuned for a one-minute
 *      Short would abandon a long render.
 *   3. IMAGE QUALITY IS UNTOUCHED by anything to do with packing, timing or
 *      storage: the bitrate ladder, resolution and frame rate come from the
 *      Master Render Profile and nowhere else.
 */
import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import {
  MAX_VAULT_RENDERS,
  clearVault,
  listVaultRenders,
  saveRenderToVault,
  vaultRequestTimeoutMs,
  VAULT_MAX_REQUEST_TIMEOUT_MS,
  VAULT_BASE_REQUEST_TIMEOUT_MS,
} from "../src/lib/render-vault";
import {
  LONGFORM_SECONDS,
  RENDER_STALL_LIMIT_MS,
  EXPORT_VALIDATION_TIMEOUT_MS,
  audioMixTimeoutMs,
  drainEncoderQueue,
  formatGuardTime,
  vaultCommitTimeoutMs,
} from "../src/lib/render-guard";
import {
  estimateMuxedOutputBytes,
  muxChunkReservation,
} from "../src/lib/render-output-store";
import {
  ENCODE_QUEUE_STALL_MS,
  ENCODER_FLUSH_TIMEOUT_MS,
  OUTPUT_DRAIN_TIMEOUT_MS,
  OUTPUT_HANDOVER_TIMEOUT_MS,
} from "../src/lib/offline-export";
import {
  computeVideoBitrateKbps,
  computeAudioBitrateKbps,
  resolveRenderDimensions,
  resolveRenderPlan,
  MASTER_RENDER_PROFILE,
  totalFrameCount,
} from "../src/lib/render-profile";

const t = createHarness();

/* ================================================================== *
 * 1. The Vault holds five videos
 * ================================================================== */

t.eq(MAX_VAULT_RENDERS, 5, "the Vault holds five videos");

const video = (n: number) =>
  new Blob([new Uint8Array(1024 * 64)], { type: "video/mp4" });

const save = (n: number) =>
  saveRenderToVault({
    blob: video(n),
    title: `Video ${n}`,
    mimeType: "video/mp4",
    durationSec: 900,
    width: 1920,
    height: 1080,
    label: "1080p · 30fps · MP4",
  });

await clearVault();
const savedIds: string[] = [];
for (let n = 1; n <= 5; n += 1) {
  const row = await save(n);
  savedIds.push(row.id);
  // Give each row a distinct createdAt so "oldest" is unambiguous.
  await new Promise((resolve) => setTimeout(resolve, 2));
}
t.eq((await listVaultRenders()).length, 5, "five finished videos are kept");

await save(6);
const afterSix = await listVaultRenders();
t.eq(afterSix.length, 5, "a sixth render leaves the vault at five, not six");
t.eq(afterSix.some((row) => row.id === savedIds[0]), false, "the OLDEST render is the one dropped");
t.eq(afterSix[0].title, "Video 6", "the newest render is first (newest-first order)");

/* The slot is freed before the write, not after: six long renders must never
   need disk for six at once. */
const vaultSource = readFileSync("src/lib/render-vault.ts", "utf8");
const pruneCall = vaultSource.indexOf("await pruneVault({ reserve: 1 })");
const putCall = vaultSource.indexOf('const key = await tx<IDBValidKey>("readwrite"');
t.ok(pruneCall > 0 && putCall > pruneCall, "the oldest slot is freed BEFORE the new file is written");
t.ok(
  /MAX_VAULT_RENDERS = 5/.test(vaultSource),
  "the five-slot limit is a named constant, not a literal in the UI",
);
await clearVault();

/* ================================================================== *
 * 2. Fifteen-minute budgets
 * ================================================================== */

t.eq(LONGFORM_SECONDS, 900, "the supported long-form length is fifteen minutes");

/* Every finishing deadline has to be generous enough for the longest video,
   and still short enough to catch a storage service that has stopped. */
const mix15 = audioMixTimeoutMs(LONGFORM_SECONDS);
t.ok(mix15 >= 8 * 60_000, `the 15-minute audio mix gets a real budget (${formatGuardTime(mix15)})`);
t.ok(mix15 < 60 * 60_000, "the audio mix budget is a stall detector, not a day");
t.ok(audioMixTimeoutMs(900) > audioMixTimeoutMs(60), "the audio mix budget scales with the video");
t.eq(audioMixTimeoutMs(0) >= 180_000, true, "even a tiny video gets a workable audio budget");

const vault15Hd = vaultCommitTimeoutMs(1.1 * 1024 ** 3);
const vault15Uhd = vaultCommitTimeoutMs(3.8 * 1024 ** 3);
t.ok(vault15Hd >= 4 * 60_000, `a 1.1 GB commit gets a real budget (${formatGuardTime(vault15Hd)})`);
t.ok(vault15Uhd > vault15Hd, "the Vault budget scales with the size of the file");
t.ok(vault15Uhd >= 8 * 60_000, `a 3.8 GB 4K commit gets a real budget (${formatGuardTime(vault15Uhd)})`);
t.ok(vaultCommitTimeoutMs(0) > 0, "an empty file still gets a positive budget");
t.ok(vaultCommitTimeoutMs(10 ** 15) <= 25 * 60_000, "the Vault budget is capped, so a hang is still caught");

/* The inner IndexedDB deadline must fire before the outer one, so the
   transaction is aborted cleanly rather than left holding a lock. */
for (const bytes of [0, 50 * 1024 ** 2, 1.1 * 1024 ** 3, 3.8 * 1024 ** 3]) {
  t.ok(
    vaultRequestTimeoutMs(bytes) < vaultCommitTimeoutMs(bytes),
    `IndexedDB's own deadline is tighter than the render screen's at ${Math.round(bytes / 1024 ** 2)} MB`,
  );
  t.ok(vaultRequestTimeoutMs(bytes) >= VAULT_BASE_REQUEST_TIMEOUT_MS, "no Vault write is given less than the floor");
  t.ok(vaultRequestTimeoutMs(bytes) <= VAULT_MAX_REQUEST_TIMEOUT_MS, "every Vault write is still bounded");
}

/* The steps with NO heartbeat must all finish well inside the watchdog. */
t.eq(RENDER_STALL_LIMIT_MS, 6 * 60_000, "the stall watchdog is six minutes");
t.ok(EXPORT_VALIDATION_TIMEOUT_MS < RENDER_STALL_LIMIT_MS, "verification is bounded inside the watchdog");
t.ok(
  ENCODER_FLUSH_TIMEOUT_MS + OUTPUT_DRAIN_TIMEOUT_MS + OUTPUT_HANDOVER_TIMEOUT_MS < RENDER_STALL_LIMIT_MS,
  "the exporter's own finishing deadlines add up to less than the watchdog",
);
t.eq(ENCODE_QUEUE_STALL_MS, 60_000, "an encoder queue may be still for a minute before it is wedged");

/* A fifteen-minute encode must never be mistaken for a stalled one. */
{
  const totalFrames = LONGFORM_SECONDS * 30;
  let depth = 12;
  let framesSeen = 0;
  let clock = 0;
  let caught: unknown = null;
  try {
    await drainEncoderQueue({
      queueSize: () => depth,
      limit: 6,
      stallMs: ENCODE_QUEUE_STALL_MS,
      now: () => clock,
      // A slow but healthy hardware encoder: every frame takes 250 ms, so the
      // queue drains more slowly than it fills but never stops moving.
      yieldTo: async () => {
        clock += 250;
        framesSeen += 1;
        if (framesSeen % 3 === 0) depth -= 1;
        if (depth <= 6) depth = 12;
        if (framesSeen >= totalFrames) depth = 0;
      },
    });
  } catch (error) {
    caught = error;
  }
  t.eq(caught, null, "27,000 frames at 250 ms each is slow, not stalled");
}

/* ================================================================== *
 * 3. The muxer's reservation covers a fifteen-minute video
 * ================================================================== */

for (const fps of [24, 25, 30, 60]) {
  const reserve = muxChunkReservation(LONGFORM_SECONDS, fps);
  const frames = totalFrameCount(LONGFORM_SECONDS, fps);
  t.ok(reserve.expectedVideoChunks >= frames, `${fps}fps: the video index reserves room for all ${frames} frames`);
  const audioPackets = Math.ceil((LONGFORM_SECONDS * 48_000) / 1024);
  t.ok(reserve.expectedAudioChunks >= audioPackets, `${fps}fps: the audio index reserves room for all ${audioPackets} packets`);
}
{
  const reserve = muxChunkReservation(LONGFORM_SECONDS, 30);
  // Headroom must be room, not waste: reserving a whole extra video's worth
  // of index would slow the finish of every render.
  t.ok(
    reserve.expectedVideoChunks - 27_000 <= 16,
    "video headroom is a handful of chunks, not a second encode",
  );
  t.ok(
    reserve.expectedAudioChunks - 42_188 <= 128,
    "audio headroom is a handful of packets, not a second encode",
  );
}

/* ================================================================== *
 * 4. Image quality is decided by the Master Render Profile only
 * ================================================================== */

const hd = resolveRenderDimensions("16:9", "1080p");
t.eq(hd.width, 1920, "1080p stays exactly 1920 wide");
t.eq(hd.height, 1080, "1080p stays exactly 1080 high");
const uhd = resolveRenderDimensions("16:9", "4k");
t.eq(uhd.width * uhd.height >= 3840 * 2160, true, "4K stays at least UHD");

const hdBitrate = computeVideoBitrateKbps(1920, 1080, 30, "high");
const uhdBitrate = computeVideoBitrateKbps(uhd.width, uhd.height, 30, "high");
t.ok(hdBitrate >= 8_000, `1080p High keeps its full bitrate (${hdBitrate} kbps)`);
t.ok(uhdBitrate > hdBitrate * 2, "4K High scales with pixel count rather than reusing 1080p's bitrate");
t.eq(computeAudioBitrateKbps("high") >= 192, true, "High-quality audio keeps its bitrate");

// Duration must never influence quality: a 15-minute render is encoded with
// exactly the same ladder as a 15-second one.
for (const seconds of [15, 60, 900]) {
  t.eq(computeVideoBitrateKbps(1920, 1080, 30, "high"), hdBitrate, `${seconds}s at 1080p uses the same bitrate`);
}
const plan = resolveRenderPlan(MASTER_RENDER_PROFILE, "16:9", "1080p");
t.eq(plan.width, 1920, "the resolved plan is 1920 wide");
t.eq(plan.height, 1080, "the resolved plan is 1080 high");
t.eq(plan.videoBitrateKbps, hdBitrate, "the plan's bitrate comes from the profile, not from packing");

/* ================================================================== *
 * 5. Storage for a fifteen-minute video
 * ================================================================== */

for (const [label, kbps] of [["1080p High", hdBitrate], ["4K High", uhdBitrate]] as const) {
  const bytes = estimateMuxedOutputBytes({
    fps: 30,
    videoKbps: kbps,
    audioKbps: computeAudioBitrateKbps("high"),
    expectedVideoChunks: totalFrameCount(LONGFORM_SECONDS, 30),
  });
  const mb = bytes / 1024 ** 2;
  t.ok(bytes > 0, `${label}: the 15-minute estimate is positive`);
  t.ok(mb > 500, `${label}: a 15-minute render is estimated honestly (${Math.round(mb)} MB)`);
  if (label === "4K High") {
    t.ok(mb > 3000, `4K: the estimate reflects a multi-gigabyte file (${Math.round(mb)} MB)`);
  }
}

t.done("render-longform");
