/**
 * ============================================================================
 * SCENERING MASTER RENDER PROFILE
 * ============================================================================
 *
 * The ONE central rendering configuration every Scenering export flows
 * through. Resolution, aspect, frame rate, frame-rate mode, codec, pixel
 * format, bitrate, quality, keyframe interval, audio spec, container,
 * colour space and web optimisation all live HERE — nothing else in the
 * application is allowed to invent its own copy of these numbers.
 *
 * The architecture:
 *
 *     SCENERING PROJECT
 *             │
 *             ▼
 *     MASTER TIMELINE            (scene schedule — every frame is generated
 *             │                   from the real timeline, duration × FPS)
 *             ▼
 *     MASTER RENDER PROFILE      (this module)
 *             │
 *             ├───────────────┐
 *             ▼               ▼
 *     LANDSCAPE MASTER    VERTICAL MASTER
 *             │               │
 *             ▼               ▼
 *     YouTube             Shorts
 *     Facebook            TikTok
 *     LinkedIn            Instagram
 *                         Pinterest
 *
 * Platform profiles INHERIT from the master and only override what the
 * platform genuinely requires. When several selected platforms resolve to
 * the same technical signature, `planPlatformRenders` groups them so the
 * compatible master is encoded ONCE and reused — never three times.
 *
 * Philosophy (the most important rule in this file):
 *   The user chooses where the video is going.
 *   Scenering chooses how the video needs to be encoded.
 */

import type { AspectRatioType, ResolutionType } from "../types";

/* ========================================================================== *
 * 1. TYPES
 * ========================================================================== */

/** Project frame rate. "auto" lets Scenering pick (which is 30 — the
 *  recommended rate for the still-image / narration workflow). */
export type FrameRateChoice = "auto" | 24 | 25 | 30 | 50 | 60;

/** CFR is the only mode Scenering ships to social platforms — variable
 *  frame rate output breaks YouTube/TikTok/Instagram processing and NLEs. */
export type FrameRateMode = "cfr" | "vfr";

/**
 * The user-facing quality ladder. The exact technical parameters (bitrate,
 * CRF-equivalent, audio bitrate) come from this module — normal users never
 * see a CRF/QP number.
 *
 *   draft    — fast preview render (lower resolution, fast encode)
 *   standard — normal export
 *   high     — recommended final publishing quality (default)
 *   maximum  — highest practical quality before platform compression
 *   custom   — advanced users supply their own bitrates
 */
export type EncodingQuality = "draft" | "standard" | "high" | "maximum" | "custom";

export type MasteringMode = "automatic" | "manual";

export type ContainerFormat = "mp4" | "webm";

export interface MasterRenderProfile {
  /* ---- container / codec ---- */
  container: ContainerFormat;
  /** H.264/AVC for broad compatibility — deliberately NOT HEVC/AV1, which
   *  social platforms still re-encode or reject. WebM (VP9) only on request. */
  videoCodec: "h264" | "vp9";
  /** H.264 encoding profile. "high" is the modern broadly-compatible choice. */
  videoProfile: "high" | "main" | "baseline";
  /** 4:2:0 8-bit — the only pixel format every platform and player accepts.
   *  Standard SDR output; Scenering never accidentally produces HDR from
   *  ordinary source images. */
  pixelFormat: "yuv420p";
  colorSpace: "BT.709 SDR";
  /* ---- frame rate ---- */
  frameRate: FrameRateChoice;
  frameRateMode: FrameRateMode;
  /* ---- quality / bitrate ---- */
  quality: EncodingQuality;
  /** Only consulted when quality === "custom" (kbps). */
  customVideoBitrateKbps?: number;
  /** Keyframe every N seconds — 2s is the social-media sweet spot. Never
   *  shown to normal users; configurable here for the whole app. */
  keyframeIntervalSeconds: number;
  /* ---- audio ---- */
  audioCodec: "aac" | "opus";
  audioSampleRateHz: 48000;
  audioChannels: 2;
  /** Only consulted when quality === "custom" (kbps). */
  customAudioBitrateKbps?: number;
  /* ---- delivery ---- */
  /** Web-optimised output: streaming-friendly packaging so platforms and
   *  browsers can begin playback progressively. (Browser MP4 recordings are
   *  fragmented MP4 with the moov atom up front, which satisfies this.) */
  fastStart: boolean;
  /* ---- audio mastering stage ---- */
  audioMastering: MasteringMode;
}

/**
 * THE default master profile — §31's "most important default". A normal
 * user clicks RENDER and gets exactly this, with zero encoding knowledge:
 *
 *   High Quality · 1920×1080 (or the project's aspect) · 30 FPS · CFR
 *   H.264 · AAC 48 kHz stereo · MP4 · web optimised
 */
export const MASTER_RENDER_PROFILE: MasterRenderProfile = {
  container: "mp4",
  videoCodec: "h264",
  videoProfile: "high",
  pixelFormat: "yuv420p",
  colorSpace: "BT.709 SDR",
  frameRate: 30,
  frameRateMode: "cfr",
  quality: "high",
  keyframeIntervalSeconds: 2,
  audioCodec: "aac",
  audioSampleRateHz: 48000,
  audioChannels: 2,
  fastStart: true,
  audioMastering: "automatic",
};

/** The order the frame-rate radio group is presented in (30 first — the
 *  recommended setting; the normal user never needs to touch this). */
export const FRAME_RATE_CHOICES: FrameRateChoice[] = [30, 24, 25, 50, 60, "auto"];

/** "auto" means Scenering decides — and for the still-image/narration
 *  timeline the intelligent decision is always the platform-safe 30. When
 *  imported source video ever drives a project, this is where its detected
 *  source rate would be honoured instead of blindly converting. */
export function resolveFrameRate(choice: FrameRateChoice | undefined, sourceFps?: number): number {
  if (choice && choice !== "auto") return choice;
  if (sourceFps && [24, 25, 30, 50, 60].includes(Math.round(sourceFps))) {
    return Math.round(sourceFps);
  }
  return 30;
}

/* ========================================================================== *
 * 2. RESOLUTION PROFILES
 * ========================================================================== */

export interface ResolvedDimensions {
  width: number;
  height: number;
  label: string;
  /** tailwind class the preview viewport uses */
  aspectClass: string;
}

/**
 * Central resolution table — the single source for every canvas size in the
 * app. Content is never stretched into these frames: `drawSceneImage`
 * crops/repositions intelligently (cover / contain / blur-fill).
 *
 *   Landscape: 1920×1080 (16:9), optional 1280×720
 *   Vertical:  1080×1920 (9:16)
 *   Square:    1080×1080 (1:1)
 */
export function resolveRenderDimensions(
  aspect: AspectRatioType,
  resolution: ResolutionType
): ResolvedDimensions {
  if (aspect === "9:16") {
    if (resolution === "720p") return { width: 720, height: 1280, label: "720 × 1280 (720p HD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
    if (resolution === "2k") return { width: 1440, height: 2560, label: "1440 × 2560 (2K QHD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
    if (resolution === "4k") return { width: 2160, height: 3840, label: "2160 × 3840 (4K UHD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
    return { width: 1080, height: 1920, label: "1080 × 1920 (1080p Full HD)", aspectClass: "aspect-[9/16] max-h-[520px]" };
  }
  if (aspect === "1:1") {
    if (resolution === "720p") return { width: 720, height: 720, label: "720 × 720 (720p HD)", aspectClass: "aspect-square max-h-[520px]" };
    if (resolution === "2k") return { width: 1440, height: 1440, label: "1440 × 1440 (2K QHD)", aspectClass: "aspect-square max-h-[520px]" };
    if (resolution === "4k") return { width: 2160, height: 2160, label: "2160 × 2160 (4K UHD)", aspectClass: "aspect-square max-h-[520px]" };
    return { width: 1080, height: 1080, label: "1080 × 1080 (1080p Full HD)", aspectClass: "aspect-square max-h-[520px]" };
  }
  if (aspect === "4:3") {
    if (resolution === "720p") return { width: 960, height: 720, label: "960 × 720 (720p HD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
    if (resolution === "2k") return { width: 1920, height: 1440, label: "1920 × 1440 (2K QHD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
    if (resolution === "4k") return { width: 2880, height: 2160, label: "2880 × 2160 (4K UHD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
    return { width: 1440, height: 1080, label: "1440 × 1080 (1080p Full HD)", aspectClass: "aspect-[4/3] max-h-[520px]" };
  }
  // Default 16:9 landscape
  if (resolution === "720p") return { width: 1280, height: 720, label: "1280 × 720 (720p HD)", aspectClass: "aspect-video" };
  if (resolution === "2k") return { width: 2560, height: 1440, label: "2560 × 1440 (2K QHD)", aspectClass: "aspect-video" };
  if (resolution === "4k") return { width: 3840, height: 2160, label: "3840 × 2160 (4K UHD)", aspectClass: "aspect-video" };
  return { width: 1920, height: 1080, label: "1920 × 1080 (1080p Full HD)", aspectClass: "aspect-video" };
}

/** Short filename-safe token for a frame size — "1080p" for the landscape
 *  ladder, "1080x1920" style for vertical/square (matching how creators
 *  name Shorts/TikTok files). */
export function resolutionToken(width: number, height: number): string {
  if (width > height) {
    if (height === 2160) return "4K";
    if (height === 1440) return "1440p";
    if (height === 1080) return "1080p";
    if (height === 720) return "720p";
  }
  return `${width}x${height}`;
}

/* ========================================================================== *
 * 3. QUALITY LADDER & PLATFORM-AWARE BITRATE
 * ========================================================================== */

interface QualityLevel {
  id: EncodingQuality;
  name: string;
  blurb: string;
  /** kbps at 1920×1080 @ 30fps — every other size scales from this anchor. */
  baseKbps1080p30: number;
  /** the CRF a quality-based encoder would use — advanced display only */
  crfEquivalent: number;
  audioKbps: number;
}

/**
 * The quality ladder, anchored at the platform guidance for 1080p/30
 * (YouTube recommends 8 Mbps for 1080p SDR; 12 Mbps is the practical top
 * before platform re-compression makes bigger files pointless):
 *
 *   1080p landscape → 8–12 Mbps target range
 *   720p  landscape → 5–7.5 Mbps target range
 *   1080p vertical  → same pixel budget as 1080p landscape (high quality)
 */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { id: "draft", name: "Draft", blurb: "Fast preview — lower resolution, quick encode", baseKbps1080p30: 3000, crfEquivalent: 28, audioKbps: 128 },
  { id: "standard", name: "Standard", blurb: "Normal export", baseKbps1080p30: 8000, crfEquivalent: 23, audioKbps: 192 },
  { id: "high", name: "High", blurb: "Recommended final publishing quality", baseKbps1080p30: 10000, crfEquivalent: 20, audioKbps: 256 },
  { id: "maximum", name: "Maximum", blurb: "Highest practical quality before platform compression", baseKbps1080p30: 12000, crfEquivalent: 18, audioKbps: 320 },
] as const;

export function getQualityLevel(quality: EncodingQuality): QualityLevel {
  return QUALITY_LEVELS.find((q) => q.id === quality) || QUALITY_LEVELS[2];
}

/**
 * Platform-aware video bitrate. NOT one arbitrary number for every video:
 * the target scales with pixel count (sub-linearly — codec efficiency rises
 * with frame size) and frame rate (60fps ≈ 1.5× of 30fps, the industry
 * rule of thumb), then is rounded to a tidy value.
 *
 * Balances Quality ↔ File Size ↔ Platform Compatibility: big enough that a
 * 1080p render never looks starved, small enough that files stay uploadable.
 */
export function computeVideoBitrateKbps(
  width: number,
  height: number,
  fps: number,
  quality: EncodingQuality,
  customKbps?: number
): number {
  if (quality === "custom" && customKbps && customKbps > 0) {
    return Math.round(Math.min(80000, Math.max(500, customKbps)));
  }
  const level = getQualityLevel(quality);
  // 0.58 keeps the anchor ranges intact: 1080p → 8–12 Mbps, 720p → 5–7.5 Mbps
  const pixelScale = Math.pow((width * height) / (1920 * 1080), 0.58);
  const fpsScale = 0.5 + 0.5 * (Math.max(10, Math.min(120, fps)) / 30);
  const kbps = level.baseKbps1080p30 * pixelScale * fpsScale;
  return Math.max(500, Math.round(kbps / 100) * 100);
}

/** AAC 48 kHz stereo at 192–320 kbps depending on the quality profile. */
export function computeAudioBitrateKbps(quality: EncodingQuality, customKbps?: number): number {
  if (quality === "custom" && customKbps && customKbps > 0) {
    return Math.round(Math.min(320, Math.max(96, customKbps)));
  }
  return getQualityLevel(quality).audioKbps;
}

/** Rough output size — used by the queue display and file-size limit checks. */
export function estimateFileSizeMB(videoKbps: number, audioKbps: number, durationSec: number): number {
  return ((videoKbps + audioKbps) * Math.max(0, durationSec)) / 8 / 1000;
}

/* ========================================================================== *
 * 4. PLATFORM PROFILES (inherit from the master)
 * ========================================================================== */

export type PlatformId =
  | "youtube"
  | "youtube_shorts"
  | "tiktok"
  | "instagram_reels"
  | "facebook"
  | "linkedin"
  | "pinterest";

export interface PlatformProfile {
  id: PlatformId;
  name: string;
  shortName: string;
  icon: string;
  aspect: AspectRatioType;
  /** longest clip the platform accepts (seconds) */
  maxDurationSec: number;
  /** upload cap in MB */
  maxFileSizeMB: number;
  /** frame rates the platform ingests without re-timing */
  acceptedFps: number[];
  /** Only real platform requirements override the master. */
  overrides?: Partial<MasterRenderProfile>;
  note?: string;
}

export const PLATFORM_PROFILES: readonly PlatformProfile[] = [
  {
    id: "youtube",
    name: "YouTube",
    shortName: "YouTube",
    icon: "▶️",
    aspect: "16:9",
    maxDurationSec: 12 * 3600,
    maxFileSizeMB: 256_000,
    acceptedFps: [24, 25, 30, 50, 60],
    note: "1080p landscape · H.264/AAC MP4",
  },
  {
    id: "youtube_shorts",
    name: "YouTube Shorts",
    shortName: "Shorts",
    icon: "📱",
    aspect: "9:16",
    maxDurationSec: 180,
    maxFileSizeMB: 20_000,
    acceptedFps: [24, 25, 30, 50, 60],
    note: "Vertical 9:16 · up to 3 minutes",
  },
  {
    id: "tiktok",
    name: "TikTok",
    shortName: "TikTok",
    icon: "🎵",
    aspect: "9:16",
    maxDurationSec: 600,
    maxFileSizeMB: 4_000,
    acceptedFps: [24, 25, 30, 50, 60],
    note: "Vertical 9:16 · up to 10 minutes",
  },
  {
    id: "instagram_reels",
    name: "Instagram Reels",
    shortName: "Reels",
    icon: "📸",
    aspect: "9:16",
    maxDurationSec: 180,
    maxFileSizeMB: 4_000,
    acceptedFps: [24, 25, 30, 50, 60],
    note: "Vertical 9:16 · up to 3 minutes",
  },
  {
    id: "facebook",
    name: "Facebook",
    shortName: "Facebook",
    icon: "👥",
    aspect: "16:9",
    maxDurationSec: 240 * 60,
    maxFileSizeMB: 10_000,
    acceptedFps: [24, 25, 30, 50, 60],
    note: "1080p landscape · H.264/AAC MP4",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    shortName: "LinkedIn",
    icon: "💼",
    aspect: "16:9",
    maxDurationSec: 15 * 60,
    maxFileSizeMB: 5_000,
    acceptedFps: [24, 25, 30, 50, 60],
    note: "1080p landscape · up to 15 minutes",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    shortName: "Pinterest",
    icon: "📌",
    aspect: "9:16",
    maxDurationSec: 15 * 60,
    maxFileSizeMB: 2_000,
    acceptedFps: [24, 25, 30],
    note: "Vertical 9:16 video pin",
  },
] as const;

export function getPlatformProfile(id: PlatformId): PlatformProfile | undefined {
  return PLATFORM_PROFILES.find((p) => p.id === id);
}

/* ========================================================================== *
 * 5. EFFECTIVE RENDER PLANS & DEDUPLICATED GROUPS
 * ========================================================================== */

/** A fully-resolved recipe for one encode — master values with any platform
 *  overrides applied. Everything the encoder needs, nothing UI-shaped. */
export interface RenderPlan {
  width: number;
  height: number;
  aspect: AspectRatioType;
  fps: number;
  frameRateMode: FrameRateMode;
  container: ContainerFormat;
  videoCodec: MasterRenderProfile["videoCodec"];
  videoProfile: MasterRenderProfile["videoProfile"];
  pixelFormat: MasterRenderProfile["pixelFormat"];
  quality: EncodingQuality;
  videoBitrateKbps: number;
  keyframeIntervalSeconds: number;
  audioCodec: MasterRenderProfile["audioCodec"];
  audioSampleRateHz: number;
  audioChannels: number;
  audioBitrateKbps: number;
  fastStart: boolean;
}

/** Resolve the master profile into a concrete plan for one aspect ratio. */
export function resolveRenderPlan(
  master: MasterRenderProfile,
  aspect: AspectRatioType,
  resolution: ResolutionType,
  platform?: PlatformProfile
): RenderPlan {
  const effective: MasterRenderProfile = { ...master, ...(platform?.overrides || {}) };
  const dims = resolveRenderDimensions(aspect, resolution);
  const fps = resolveFrameRate(effective.frameRate);
  return {
    width: dims.width,
    height: dims.height,
    aspect,
    fps,
    frameRateMode: effective.frameRateMode,
    container: effective.container,
    videoCodec: effective.container === "webm" ? "vp9" : "h264",
    videoProfile: effective.videoProfile,
    pixelFormat: effective.pixelFormat,
    quality: effective.quality,
    videoBitrateKbps: computeVideoBitrateKbps(dims.width, dims.height, fps, effective.quality, effective.customVideoBitrateKbps),
    keyframeIntervalSeconds: effective.keyframeIntervalSeconds,
    audioCodec: effective.container === "webm" ? "opus" : "aac",
    audioSampleRateHz: effective.audioSampleRateHz,
    audioChannels: effective.audioChannels,
    audioBitrateKbps: computeAudioBitrateKbps(effective.quality, effective.customAudioBitrateKbps),
    fastStart: effective.fastStart,
  };
}

/** Technical identity of an encode. Two platforms whose plans share a
 *  signature can share ONE master render — the whole point of §19. */
export function renderSignature(plan: RenderPlan): string {
  return [
    `${plan.width}x${plan.height}`,
    `${plan.fps}${plan.frameRateMode}`,
    plan.videoCodec,
    plan.container,
    `${plan.videoBitrateKbps}k`,
    `${plan.audioCodec}${plan.audioSampleRateHz / 1000}k${plan.audioBitrateKbps}`,
  ].join("|");
}

export interface RenderPlanGroup {
  signature: string;
  plan: RenderPlan;
  /** "Landscape Master" / "Vertical Master" / "Square Master" */
  masterLabel: string;
  platforms: PlatformProfile[];
}

export function masterLabelForAspect(aspect: AspectRatioType): string {
  if (aspect === "9:16") return "Vertical Master";
  if (aspect === "1:1") return "Square Master";
  return "Landscape Master";
}

/**
 * Group the selected platforms into the minimum set of encodes.
 *
 *   YouTube + Facebook + LinkedIn  → ONE 1920×1080 landscape master
 *   TikTok + Shorts + Reels        → ONE 1080×1920 vertical master
 *
 * Groups keep a stable order: landscape, then vertical, then square.
 */
export function planPlatformRenders(
  master: MasterRenderProfile,
  platformIds: PlatformId[],
  resolution: ResolutionType = "1080p"
): RenderPlanGroup[] {
  const groups = new Map<string, RenderPlanGroup>();
  for (const id of platformIds) {
    const platform = getPlatformProfile(id);
    if (!platform) continue;
    const plan = resolveRenderPlan(master, platform.aspect, resolution, platform);
    const signature = renderSignature(plan);
    const existing = groups.get(signature);
    if (existing) {
      existing.platforms.push(platform);
    } else {
      groups.set(signature, {
        signature,
        plan,
        masterLabel: masterLabelForAspect(platform.aspect),
        platforms: [platform],
      });
    }
  }
  const aspectOrder: Record<string, number> = { "16:9": 0, "4:3": 1, "9:16": 2, "1:1": 3 };
  return [...groups.values()].sort(
    (a, b) => (aspectOrder[a.plan.aspect] ?? 9) - (aspectOrder[b.plan.aspect] ?? 9)
  );
}

/* ========================================================================== *
 * 6. FILE NAMING
 * ========================================================================== */

/** Strip spaces and problematic characters, keep the name human-readable. */
export function sanitizeFileToken(raw: string, fallback = "Scenering_Video"): string {
  const cleaned = (raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/['’"]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || fallback;
}

/**
 * Automatic, useful output names:
 *
 *   ProjectName_YouTube_1080p_30fps.mp4
 *   ProjectName_Shorts_1080x1920_30fps.mp4
 *   ProjectName_TikTok_1080x1920_30fps.mp4
 */
export function buildRenderFilename(
  projectTitle: string,
  targetLabel: string,
  width: number,
  height: number,
  fps: number,
  ext: string
): string {
  const project = sanitizeFileToken(projectTitle);
  const target = sanitizeFileToken(targetLabel, "Master");
  return `${project}_${target}_${resolutionToken(width, height)}_${fps}fps.${ext}`;
}

/* ========================================================================== *
 * 7. PLATFORM COMPATIBILITY CHECK
 * ========================================================================== */

export interface CompatibilityCheck {
  id: "resolution" | "fps" | "codec" | "audio" | "container" | "duration" | "filesize";
  label: string;
  ok: boolean;
  detail: string;
}

export interface PlatformCompatibility {
  platform: PlatformProfile;
  checks: CompatibilityCheck[];
  allOk: boolean;
  /** true when Scenering solves an aspect mismatch by making a separate
   *  compatible master automatically (never an error — just information) */
  needsOwnProfile: boolean;
}

export function checkPlatformCompatibility(
  master: MasterRenderProfile,
  platform: PlatformProfile,
  projectAspect: AspectRatioType,
  durationSec: number,
  resolution: ResolutionType = "1080p"
): PlatformCompatibility {
  const plan = resolveRenderPlan(master, platform.aspect, resolution, platform);
  const sizeMB = estimateFileSizeMB(plan.videoBitrateKbps, plan.audioBitrateKbps, durationSec);
  const mins = Math.floor(platform.maxDurationSec / 60);

  const checks: CompatibilityCheck[] = [
    {
      id: "resolution",
      label: "Resolution",
      ok: true,
      detail: `${plan.width} × ${plan.height}`,
    },
    {
      id: "fps",
      label: "FPS",
      ok: platform.acceptedFps.includes(plan.fps),
      detail: platform.acceptedFps.includes(plan.fps)
        ? `${plan.fps} fps · constant frame rate`
        : `${plan.fps} fps is outside ${platform.name}'s accepted rates — use 30 fps`,
    },
    {
      id: "codec",
      label: "Codec",
      ok: plan.videoCodec === "h264",
      detail:
        plan.videoCodec === "h264"
          ? "H.264 High · yuv420p · SDR"
          : `${platform.name} prefers H.264 MP4 — WebM may be re-encoded or rejected`,
    },
    {
      id: "audio",
      label: "Audio",
      ok: plan.audioCodec === "aac",
      detail:
        plan.audioCodec === "aac"
          ? `AAC · 48 kHz · stereo · ${plan.audioBitrateKbps} kbps`
          : `${platform.name} prefers AAC audio`,
    },
    {
      id: "container",
      label: "Container",
      ok: plan.container === "mp4",
      detail: plan.container === "mp4" ? "MP4 · web optimised" : "WebM container — MP4 is safer here",
    },
    {
      id: "duration",
      label: "Duration",
      ok: durationSec <= platform.maxDurationSec,
      detail:
        durationSec <= platform.maxDurationSec
          ? `~${Math.round(durationSec)}s fits the ${mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins} min`} limit`
          : `${platform.name} allows up to ${mins >= 60 ? `${Math.floor(mins / 60)} hours` : `${mins} minutes`} — this video is ~${Math.round(durationSec)}s`,
    },
    {
      id: "filesize",
      label: "File size",
      ok: sizeMB <= platform.maxFileSizeMB,
      detail:
        sizeMB <= platform.maxFileSizeMB
          ? `~${sizeMB < 1000 ? `${Math.round(sizeMB)} MB` : `${(sizeMB / 1000).toFixed(1)} GB`} estimated`
          : `Estimated ~${Math.round(sizeMB)} MB exceeds the ${platform.maxFileSizeMB} MB cap — lower the quality preset`,
    },
  ];

  return {
    platform,
    checks,
    allOk: checks.every((c) => c.ok),
    needsOwnProfile: platform.aspect !== projectAspect,
  };
}

/* ========================================================================== *
 * 8. ERROR REPORTING & AUTOMATIC FALLBACK
 * ========================================================================== */

export interface RenderFailureReport {
  /** short headline for the error card */
  title: string;
  /** the human-readable explanation — never a raw encoder message */
  explanation: string;
  /** what "Retry Automatically" will do */
  retryHint: string;
  /** the raw technical log, kept under Advanced Details */
  technical: string;
  /** false only when retrying cannot possibly help (e.g. user cancelled) */
  canAutoRetry: boolean;
}

/** Turn any encoder/recorder failure into something a human can act on. */
export function describeRenderFailure(rawMessage: string): RenderFailureReport {
  const raw = rawMessage || "Unknown render error";
  const lower = raw.toLowerCase();

  if (lower.includes("cancel")) {
    return {
      title: "Render cancelled",
      explanation: "You stopped this render before it finished. Nothing was saved.",
      retryHint: "Start the render again whenever you are ready.",
      technical: raw,
      canAutoRetry: false,
    };
  }
  if (lower.includes("notsupported") || lower.includes("istypesupported") || lower.includes("mime") || lower.includes("codec")) {
    return {
      title: "This browser cannot record the selected format",
      explanation:
        "The video could not be rendered because the selected encoding settings are not supported by this browser's encoder.",
      retryHint: "Scenering can automatically retry using the standard compatible profile (H.264 MP4 · 30 fps · High quality, falling back to WebM if needed).",
      technical: raw,
      canAutoRetry: true,
    };
  }
  if (lower.includes("security") || lower.includes("taint")) {
    return {
      title: "An image blocked the recording",
      explanation:
        "One of the scene images comes from a source that forbids exporting (a cross-origin image without permission). The canvas refused to record with it on screen.",
      retryHint: "Scenering can retry — re-searching that scene's image in the Scenes step usually fixes this permanently.",
      technical: raw,
      canAutoRetry: true,
    };
  }
  if (lower.includes("memory") || lower.includes("alloc") || lower.includes("quota")) {
    return {
      title: "The browser ran out of memory",
      explanation: "The render needed more memory than the browser would give it — long videos at high resolutions are the usual cause.",
      retryHint: "Scenering can automatically retry at 720p Standard quality, which needs far less memory.",
      technical: raw,
      canAutoRetry: true,
    };
  }
  return {
    title: "The video could not be rendered",
    explanation:
      "The video could not be rendered because the selected encoding settings are incompatible with the source.",
    retryHint: "Scenering can automatically retry using the standard compatible profile.",
    technical: raw,
    canAutoRetry: true,
  };
}

export interface CompatibilityFallback {
  /** patch to apply over the current settings */
  patch: {
    format: ContainerFormat;
    fps: FrameRateChoice;
    quality: EncodingQuality;
    resolution?: ResolutionType;
  };
  /** what changed, reported to the user — quality is never reduced silently */
  changes: string[];
}

/**
 * The automatic-retry profile after a failed render: identify what to relax,
 * preserve as much quality as possible, and SAY what changed.
 */
export function buildCompatibilityFallback(current: {
  format: ContainerFormat;
  fps: FrameRateChoice;
  quality: EncodingQuality;
  resolution: ResolutionType;
}, failure?: RenderFailureReport): CompatibilityFallback {
  const changes: string[] = [];
  const patch: CompatibilityFallback["patch"] = {
    format: "mp4",
    fps: 30,
    quality: current.quality === "custom" ? "high" : current.quality,
  };
  if (current.format !== "mp4") changes.push("Container switched to MP4 (H.264 + AAC)");
  if (resolveFrameRate(current.fps) !== 30) changes.push(`Frame rate reset to 30 fps CFR (was ${resolveFrameRate(current.fps)})`);
  if (current.quality === "custom") changes.push("Custom encoding values replaced by the High preset");

  const memoryPressure = failure ? /memory/i.test(failure.title) : false;
  if (memoryPressure && current.resolution !== "720p") {
    patch.resolution = "720p";
    patch.quality = "standard";
    changes.push("Resolution lowered to 720p Standard to fit in memory (raise it again after this export)");
  }
  if (changes.length === 0) changes.push("Retrying with the same settings — the failure looked transient");
  return { patch, changes };
}

/* ========================================================================== *
 * 9. RENDER QUEUE STATUS
 * ========================================================================== */

export type RenderQueueStatus =
  | "queued"
  | "preparing"
  | "rendering"
  | "encoding"
  | "finalizing"
  | "ready"
  | "reused"
  | "failed";

export const QUEUE_STATUS_LABEL: Record<RenderQueueStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  rendering: "Rendering",
  encoding: "Encoding",
  finalizing: "Finalizing",
  ready: "Ready",
  reused: "Using existing render",
  failed: "Failed",
};

/** Map a 0..1 render progress value onto the user-facing pipeline stage. */
export function queueStatusForProgress(progress: number): RenderQueueStatus {
  if (progress < 0.3) return "preparing";
  if (progress < 0.9) return "rendering";
  if (progress < 0.96) return "encoding";
  if (progress < 1) return "finalizing";
  return "ready";
}

/** Exact frame count of an export — duration × FPS, per the master timeline. */
export function totalFrameCount(durationSec: number, fps: number): number {
  return Math.max(0, Math.round(durationSec * fps));
}
