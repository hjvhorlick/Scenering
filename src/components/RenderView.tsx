import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { isBoolean, useRememberedChoice } from "../lib/section-memory";
import type { Project, Scene, TimelineInsert, CustomerLogoConfig, CaptionsConfig, AspectRatioType, EditorStep, ResolutionType, PacingModeType } from "../types";
import StepNav, { PROJECT_PHASES, type ProjectPhase } from "./StepNav";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { cancelFinalExport, getEntitlements, recordVideoDownload, reserveFinalExport } from "../lib/entitlements";
import { CUSTOMISED_CTA_SUFFIX, isPlanVoiceIncluded, type FeatureKey } from "../config/plans";
import { getInterfacePlan, useSession } from "../lib/session";
import { openMembershipPlans } from "./VipFeatureBadge";
import {
  INSERT_FEATURE,
  auditVipForExport,
  blockingVipFindings,
  omittableVipFindings,
  stripVipFromExport,
  type VipFinding,
} from "../lib/vip-export-audit";
import { isCtaCustomised, isFreeCtaInsert } from "../data/cta-library";
import { startVoiceSource } from "../lib/voice-fade";
import {
  drawSceneImage,
  sceneHasVisual,
  sceneIsBlankColor,
  prewarmSceneFrame,
  sourceHasPixels,
  type SceneDrawable,
} from "../lib/scene-framing";
import { drawSceneTransition, getTransitionDuration } from "../lib/scene-transition";
import { ClipPool, asDrawableClip, sceneHasClip } from "../lib/scene-clip";
import { loadCustomVideos } from "../lib/custom-video";
import { clipAudioPlanFor, loadClipAudio, scheduleClipAudio } from "../lib/clip-audio";
import { narratableText, projectHasNarration, sceneCaptionWords } from "../lib/clip-transcript";
import { isPreparedVoiceoverId } from "../lib/voiceover-generation";
import { resolveVoicePreset } from "../data/voice-presets";
import {
  renderTimelineInsert,
} from "../lib/render-effects";
import {
  getSceneCameraTransform,
  motionForStyle,
  renderSceneAnimationEffects,
  resolveSceneCameraMotion,
} from "../lib/scene-animation";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../lib/render-captions";
import { AudioFrame, EMPTY_FRAME, makeBus } from "../lib/audio-reactive";
import { PackedAudioTelemetry, TELEMETRY_SAMPLE_STRIDE } from "../lib/audio-telemetry";
import { requiredVisualizerFftSize } from "../lib/advanced-audio-visualizer";
import { resolveSceneAudioBuffer, replaceSceneNarration, fetchSceneAudioWithTimeline } from "../lib/tts-cache";
import type { WordTiming } from "../lib/word-sync";
import { createFrameTicker, type FrameTicker } from "../lib/frame-ticker";
import { loadSceneImage } from "../lib/scene-image-loader";
import { resolveLegacyLocalImage } from "../lib/nature-library-compat";
import { STICKER_LIBRARY } from "../lib/sticker-3d";
import {
  formatDuration,
  narrationLeadIn,
  sceneTimelineDuration,
} from "../lib/duration-utils";
import { loadCaptionFonts, ensureCaptionFont, getCaptionStyle } from "../data/caption-styles";
import { generateAttributionDocument, getBackgroundMusicTrack, AMBIENT_STYLE_TO_TRACK } from "../data/media-library";
import { calculateDynamicDuration } from "../lib/duration-utils";
import { getFilterCanvas, getPreset, type VideoFilterConfig } from "../data/video-filters";
import { paintVideoFilter } from "../lib/video-filter-render";
import { buildInsertAudioPlan, buildSectionAudioPlan, InsertAudioMixer } from "../lib/insert-audio";
import { renderSection } from "../lib/render-section";
import type { SectionConfig } from "../data/intro-outro";
import {
  VoiceEchoConfig,
  VoiceEchoGraph,
  createVoiceEchoGraph,
  resolveVoiceEcho,
  voiceEchoIsActive,
  describeVoiceEcho,
} from "../lib/voice-echo";
import {
  MAX_VAULT_RENDERS,
  type VaultRender,
  saveBlobToDisk,
  saveRenderToVault,
  deleteVaultRender,
  listVaultRenders,
  enforceVaultRule,
  subscribeVault,
  formatVaultSize,
  formatVaultTime,
} from "../lib/render-vault";
import {
  getRenderStatus,
  setRenderStatus,
  subscribeRenderStatus,
  type RenderJobStatus,
} from "../lib/render-status";
import {
  MASTER_RENDER_PROFILE,
  DEFAULT_RENDER_PROFILE_SETTINGS,
  resolveFrameRate,
  resolveRenderDimensions,
  resolveRenderPlan,
  computeVideoBitrateKbps,
  computeAudioBitrateKbps,
  estimateFileSizeMB,
  getQualityLevel,
  getPlatformProfile,
  buildRenderFilename,
  checkPlatformCompatibility,
  describeRenderFailure,
  buildCompatibilityFallback,
  resolutionToken,
  totalFrameCount,
  destinationLabel,
  destinationFileToken,
  type FrameRateChoice,
  type EncodingQuality,
  type MasteringMode,
  type RenderPlan,
  type RenderFailureReport,
} from "../lib/render-profile";
import type { RenderProfileSettings } from "../types";
import { createMasteringChain, type MasteringChain } from "../lib/audio-mastering";
import {
  OfflineExporter,
  resolveEncodableFormat,
  supported as offlineExportSupported,
  type OfflineExportConfig,
  type OfflineExportStats,
} from "../lib/offline-export";
import { validateFinishedExport, type ExportValidationReport } from "../lib/export-validator";
import { createFrameBudget } from "../lib/yield-to-browser";
import { RenderTimer, formatMs } from "../lib/render-timing";
import { holdRenderWakeLock, type RenderWakeLockState } from "../lib/render-wake-lock";
import {
  clearStaleRenderScratch,
  formatStorageBytes,
  muxChunkReservation,
  type RenderOutputStorageMode,
} from "../lib/render-output-store";
import {
  EXPORT_VALIDATION_TIMEOUT_MS,
  RENDER_STALL_LIMIT_MS,
  RenderCancelledError,
  RenderTimeoutError,
  audioMixTimeoutMs,
  formatGuardTime,
  vaultCommitTimeoutMs,
  withProgressTicker,
  withTimeout,
} from "../lib/render-guard";
import { drawSceneringWatermark, planRequiresSceneringWatermark } from "../lib/scenering-watermark";
import { FrameMotionAudit, type MotionAuditReport } from "../lib/frame-motion-audit";
import { auditFinishedMp4, describeAudit, type Mp4Audit } from "../lib/mp4-audit";
import Icon, { iconify } from "./icons/Icon";

/**
 * The render screen's live settings. Every one of them is DECIDED in
 * Project Setup (the render screen only displays and executes them), and
 * the technical values behind them (bitrate ladder, codec, pixel format,
 * keyframe interval, audio spec…) come from the Master Render Profile in
 * src/lib/render-profile.ts — one source, no duplicated choices.
 */
export interface RenderSettings {
  format: "mp4" | "webm";
  resolution: "720p" | "1080p" | "2k" | "4k" | "shorts_9_16" | "square_1_1" | "4:3";
  fps: FrameRateChoice;
  quality: EncodingQuality;
  includeSubtitles: boolean;
  subtitleStyle: "karaoke" | "normal";
  backgroundMusic: "none" | "lofi" | "cinematic" | "ambient" | "energetic";
  musicVolume: number;
  /** "automatic" = the optional mastering stage (no clipping, voice-priority
   *  music ducking). "manual" = the user's mix passes through untouched. */
  audioMastering: MasteringMode;
}

interface RenderHealthState {
  startedAt: number | null;
  elapsedMs: number;
  framesDone: number;
  totalFrames: number;
  outputBytes: number;
  queuedOutputBytes: number;
  outputStorage: RenderOutputStorageMode | "checking";
  outputStorageDetail: string;
  telemetryBytes: number;
  tabHidden: boolean;
  wakeLock: RenderWakeLockState;
  /** Frames the encoder reported off their own 1/fps tick. */
  offCadenceFrames: number;
  /** One-line motion check: did the picture actually move between samples? */
  motionCheck: string;
}

const EMPTY_RENDER_HEALTH: RenderHealthState = {
  startedAt: null,
  elapsedMs: 0,
  framesDone: 0,
  totalFrames: 0,
  outputBytes: 0,
  queuedOutputBytes: 0,
  outputStorage: "checking",
  outputStorageDetail: "Checking protected browser storage…",
  telemetryBytes: 0,
  tabHidden: false,
  wakeLock: "released",
  offCadenceFrames: 0,
  motionCheck: "Waiting for the first frames…",
};

/**
 * Vault rows whose download the server has ALREADY counted, but whose file
 * has not been saved yet (the save dialog was cancelled, or the browser
 * refused it). Trying again uses that same counted download instead of
 * counting a second one. A successful save removes the row from the Vault,
 * so each counted download yields exactly one saved file. Module-level so it
 * survives leaving and re-entering the render screen within the page.
 */
const DOWNLOADS_COUNTED_NOT_SAVED = new Set<string>();

/* INSERT_FEATURE now lives in src/lib/vip-export-audit.ts, so the warning on
   screen, the dialog at the moment of pressing Render and the render itself
   all read one table instead of three copies that could drift. */

interface RenderViewProps {
  project: Project | null;
  scenes: Scene[];
  inserts: TimelineInsert[];
  selectedVoice?: string;
  availableVoices?: { id: string; name: string; gender?: "male" | "female"; accent?: string; locale?: string }[];
  aspectRatio?: AspectRatioType;
  resolution?: ResolutionType;
  pacingMode?: PacingModeType;
  onNavigateToStep?: (step: EditorStep) => void;
  onBack?: () => void;
  customerLogo?: CustomerLogoConfig;
  captionsConfig?: CaptionsConfig;
  /** Project-wide narration switch. Off renders a video with no spoken track. */
  voiceoverEnabled?: boolean;
  /** One-scene project: the footage is the video, so nothing may shorten it. */
  singleScene?: boolean;
  onUpdateCaptionsConfig?: (config: CaptionsConfig) => void;
  renderedBlob?: Blob | null;
  renderedUrl?: string | null;
  onRenderSuccess?: (blob: Blob, url: string) => void;
  /**
   * Told when a new render starts, so the last finished video can be released.
   *
   * A render is encoded in the browser, and until this existed the previous
   * finished file stayed referenced by the app, by this screen and by its
   * object URL for the whole session — hundreds of megabytes that the next
   * encode then has to find room around.
   */
  onRenderStart?: () => void;
  /* Setup choices — shown read-only on this screen */
  sceneDuration?: number;
  motionStyle?: string;
  /** Project-level toggle for per-scene camera/effect stacks. */
  sceneAnimationEnabled?: boolean;
  /** the single look applied across the whole video */
  videoFilter?: VideoFilterConfig | null;
  introSection?: SectionConfig | null;
  outroSection?: SectionConfig | null;
  /** echo / ambience on the narration, set in the Voiceover step */
  voiceEcho?: VoiceEchoConfig;
  /** The render profile chosen in Project Setup — displayed and executed
   *  here, never edited here. */
  renderProfile?: RenderProfileSettings;
  onOpenSetup?: () => void;
  onNavigatePhase?: (phase: ProjectPhase) => void;
  /**
   * Let a render repair a scene's narration.
   *
   * When the saved file no longer belongs to the scene (it was re-scripted, or
   * it still holds an earlier narrator), the renderer synthesises the line it
   * needs. Writing that line back means the scene now describes what was
   * actually exported — so the next render, the preview and the per-scene
   * download all use it instead of generating the same line again.
   */
  onUpdateScene?: (sceneId: number, updates: Partial<Scene>) => void;
}

/** Small read-only row used by the "Your choices" panel */
function SummaryRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-gray-400 flex items-center gap-1.5 shrink-0">
        <Icon glyph={icon} />
        {label}
      </span>
      <span className="text-[11px] font-medium text-white text-right break-words min-w-0">
        {value}
        {hint && <span className="block text-[10px] text-gray-500 font-normal">{hint}</span>}
      </span>
    </div>
  );
}

export function generateSrtSubtitles(scenes: Scene[], voiceoverEnabled: boolean = true): string {
  const pad = (n: number, z = 2) => String(Math.floor(n)).padStart(z, "0");
  const formatSrtTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  };

  // The video opens with the first image held for the narration lead-in
  // before the first words are spoken, so the subtitle clock starts there.
  // With no narration there is no hold, and the first caption starts at zero.
  let acc = narrationLeadIn(false, voiceoverEnabled);
  return scenes
    .filter(sceneHasVisual)
    .map((s, i) => {
      const start = acc;
      const end = acc + s.duration;
      acc = end;
      return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${s.text.trim()}\n`;
    })
    .join("\n");
}

export default function RenderView({
  project,
  scenes,
  inserts,
  selectedVoice = "speechify_male_01",
  availableVoices = [],
  aspectRatio = "16:9",
  resolution: propResolution = "1080p",
  pacingMode = "auto_speech",
  onNavigateToStep,
  onBack,
  customerLogo,
  captionsConfig,
  voiceoverEnabled = true,
  singleScene = false,
  onUpdateCaptionsConfig,
  renderedBlob: propRenderedBlob,
  renderedUrl: propRenderedUrl,
  onRenderSuccess,
  onRenderStart,
  sceneDuration = 20,
  motionStyle = "none",
  sceneAnimationEnabled = false,
  videoFilter = null,
  introSection = null,
  outroSection = null,
  voiceEcho,
  renderProfile = DEFAULT_RENDER_PROFILE_SETTINGS,
  onOpenSetup,
  onNavigatePhase,
  onUpdateScene,
}: RenderViewProps) {
  // Scenes with a short video clip are renderable even without a still image.
  const scenesWithImages = scenes.filter(sceneHasVisual);
  const sceneVoiceIds = useMemo(
    () => scenes.filter(sceneHasVisual).map((scene) => scene.voice_id).filter((voiceId): voiceId is string => Boolean(voiceId)),
    [scenes]
  );
  const activeLook = getPreset(videoFilter?.id);

  /* ---------------------------------------------------------------- VIP
     What this project contains that the membership does not include in a
     final download. Previewing it is free and stays free; this is only
     about the file that gets written. Recomputed as the project changes so
     the notice on screen is never stale. */
  const { account } = useSession();
  const currentPlan = getInterfacePlan(account);
  /** Product branding is plan policy, never a creator-controlled render setting. */
  const showPlanWatermark = planRequiresSceneringWatermark(currentPlan);
  const vipFindings = useMemo(
    () =>
      auditVipForExport(currentPlan, {
        inserts,
        videoFilter,
        sceneAnimationEnabled,
        motionStyle,
        captionsConfig,
        selectedVoice,
        sceneVoices: sceneVoiceIds,
        voiceEcho,
      }),
    [currentPlan, inserts, videoFilter, sceneAnimationEnabled, motionStyle, captionsConfig, selectedVoice, sceneVoiceIds, voiceEcho]
  );
  const vipBlocking = useMemo(() => blockingVipFindings(vipFindings), [vipFindings]);
  const vipOmittable = useMemo(() => omittableVipFindings(vipFindings), [vipFindings]);
  /** Set when the creator presses Render and there is something to say first. */
  const [vipPrompt, setVipPrompt] = useState<null | { format?: "mp4" | "webm" | "mov"; plan?: RenderPlan & { label?: string } }>(null);
  /** What the last final render actually left out, reported after the fact. */
  const [vipOmittedLast, setVipOmittedLast] = useState<VipFinding[]>([]);
  const getSceneDuration = (s: Scene) => s.duration || calculateDynamicDuration(s.text, s.audio_duration);
  const totalDuration = scenesWithImages.reduce((sum, s) => sum + getSceneDuration(s), 0);

  // Render settings state — every value here was CHOSEN in Project Setup
  // (destination preset, quality, fps, format, mastering). This screen only
  // mirrors those choices and runs the render; there are no controls here.
  const [settings, setSettings] = useState<RenderSettings>({
    format: renderProfile.format,
    resolution: propResolution || "1080p",
    fps: renderProfile.fps,
    quality: renderProfile.quality,
    includeSubtitles: captionsConfig?.enabled ?? false,
    subtitleStyle: captionsConfig?.mode ?? "karaoke",
    // Music is added in Video Studio as timeline inserts, so this page stays free of settings
    backgroundMusic: "none",
    musicVolume: 0.3,
    audioMastering: renderProfile.audio_mastering,
  });

  // Keep the read-only summary and the render in sync with the setup choices
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      resolution: propResolution || prev.resolution,
      includeSubtitles: captionsConfig?.enabled ?? prev.includeSubtitles,
      subtitleStyle: captionsConfig?.mode ?? prev.subtitleStyle,
      format: renderProfile.format,
      fps: renderProfile.fps,
      quality: renderProfile.quality,
      audioMastering: renderProfile.audio_mastering,
    }));
  }, [
    propResolution,
    captionsConfig?.enabled,
    captionsConfig?.mode,
    renderProfile.format,
    renderProfile.fps,
    renderProfile.quality,
    renderProfile.audio_mastering,
  ]);

  // Render execution state
  const [isRendering, setIsRendering] = useState(false);
  const [isPreparingRender, setIsPreparingRender] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  /** Where the last render spent its time, shown on screen when it finishes. */
  const [renderTiming, setRenderTiming] = useState<string | null>(null);
  const [timingCopied, setTimingCopied] = useState(false);
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(propRenderedBlob || null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(propRenderedUrl || null);
  /** Lets the idle canvas repaint when the required Free-plan mark finishes loading. */
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  /** The container the finished render was ACTUALLY recorded in. The download
   *  extension always matches this — a mislabelled file is what made the
   *  download "not work" before. */
  const [renderedContainer, setRenderedContainer] = useState<"mp4" | "webm">("webm");
  const [renderError, setRenderError] = useState<string | null>(null);
  /** Never hide which pipeline made the file. During diagnosis, frame-exact
   * is required by default so a silent MediaRecorder fallback cannot be
   * mistaken for a successful fix. */
  /**
   * Which engine produced (or is producing) the file.
   *
   * There is only one engine now. `failed` exists so the screen can say the
   * browser could not do it instead of quietly recording something worse.
   */
  const [renderEngine, setRenderEngine] = useState<"checking" | "frame-exact" | "failed" | null>(null);
  const [offlineFailureReason, setOfflineFailureReason] = useState<string | null>(null);
  /**
   * Said out loud when an uploaded clip's own soundtrack could not be read by
   * this browser: the render continues, but "keep the original sound" silently
   * producing silence is exactly the kind of failure the creator must hear
   * about.
   */
  const [clipAudioNotice, setClipAudioNotice] = useState<string | null>(null);
  /** How many scene photos had to be replaced by placeholder cards in the
   *  last render — surfaced so a dead image URL is never silent again. */
  const [imageFallbackCount, setImageFallbackCount] = useState(0);
  /** Live safety/throughput facts for the stronger long-render dashboard. */
  const [renderHealth, setRenderHealth] = useState<RenderHealthState>(EMPTY_RENDER_HEALTH);
  /** Verified post-encode dimensions, frame rate, duration and A/V sync. */
  const [exportValidation, setExportValidation] = useState<ExportValidationReport | null>(null);
  /**
   * The finished file, read back the way a player reads it: container, codec,
   * frame count, frame timing and audio length. `exportValidation` asks the
   * browser to decode the result; this asks the bytes themselves, which is the
   * only way to catch a file that plays, but plays badly.
   */
  const [outputAudit, setOutputAudit] = useState<Mp4Audit | null>(null);
  /** Did the picture actually move between sampled frames, or was it held? */
  const [motionAudit, setMotionAudit] = useState<MotionAuditReport | null>(null);

  // ---- Master Render Profile UI state ---------------------------------
  /** Technical details panel (read-only — normal users never need it). */
  const [showAdvanced, setShowAdvanced] = useRememberedChoice(project?.id, "render", "advancedOpen", false, isBoolean);
  /**
   * Human-readable failure report. The customer sees the title, explanation,
   * retry hint and support code; the raw log goes to the console only.
   */
  const [failureReport, setFailureReport] = useState<RenderFailureReport | null>(null);
  /** What the automatic-fallback retry changed — never silent. */
  const [fallbackNotes, setFallbackNotes] = useState<string[]>([]);
  /**
   * One plain sentence, shown only when this device could not write the
   * requested container and the render used a compatible one instead. It
   * names the format of the file the customer is about to download — never a
   * codec list, a profile string or an encoder error.
   */
  const [exportFormatNote, setExportFormatNote] = useState<string | null>(null);

  // ---- The Vault: finished renders waiting to be downloaded -----------
  const [vaultRenders, setVaultRenders] = useState<VaultRender[]>([]);
  const [vaultMessage, setVaultMessage] = useState<string>("");
  const [vaultPreviewId, setVaultPreviewId] = useState<string | null>(null);
  const [vaultPreviewUrl, setVaultPreviewUrl] = useState<string | null>(null);
  const [vaultBusyId, setVaultBusyId] = useState<string | null>(null);
  /** Why the last download did not start (plan allowance used up, offline…). */
  const [vaultError, setVaultError] = useState<string>("");
  /** Synchronous guard: a fast double-click must not count two downloads. */
  const vaultDownloadInFlightRef = useRef(false);
  /** Live job status, shared with the header so a background render stays visible. */
  const [job, setJob] = useState<RenderJobStatus>(() => getRenderStatus());

  /** The object URL this screen created for the last finished render. */
  const finishedUrlRef = useRef<string | null>(null);

  /**
   * Releases the last finished video: the object URL, this screen's copy and
   * the app's copy. Called when a new render starts, so only one finished
   * file is ever held while another is being encoded.
   */
  const clearFinishedRender = useCallback(() => {
    const previous = finishedUrlRef.current;
    finishedUrlRef.current = null;
    if (previous) {
      try {
        URL.revokeObjectURL(previous);
      } catch {}
    }
    setRenderedBlob(null);
    setRenderedUrl(null);
    onRenderStart?.();
  }, [onRenderStart]);

  const refreshVault = useCallback(async () => {
    try {
      // The panel promises MAX_VAULT_RENDERS slots, so an over-full vault —
      // one left by an older build, or by a restore — is brought back to the
      // rule the first time the customer opens this screen. The newest rows
      // are the ones kept.
      await enforceVaultRule();
      setVaultRenders(await listVaultRenders());
    } catch {
      /* vault is best-effort */
    }
  }, []);

  useEffect(() => {
    void refreshVault();
    const offVault = subscribeVault(() => {
      void refreshVault();
    });
    const offJob = subscribeRenderStatus((status) => setJob(status));
    return () => {
      offVault();
      offJob();
    };
  }, [refreshVault]);

  /** Object URL for the row being previewed (one at a time, always revoked). */
  useEffect(() => {
    if (!vaultPreviewId) {
      setVaultPreviewUrl(null);
      return;
    }
    const row = vaultRenders.find((r) => r.id === vaultPreviewId);
    if (!row) {
      setVaultPreviewId(null);
      return;
    }
    const url = URL.createObjectURL(row.blob);
    setVaultPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [vaultPreviewId, vaultRenders]);

  /**
   * Stall bookkeeping for the render job (see the watchdog effect below).
   *
   *   heartbeat   — when real work last moved. Only genuine progress and stage
   *                 changes touch it, never the cosmetic elapsed-time ticker.
   *   abandoned   — the watchdog has already ended this job, so a late
   *                 rejection from the stuck render must not overwrite the
   *                 explanation the creator is reading.
   *   token       — identifies one render, so cleanup from an abandoned render
   *                 that finally settles can never clear a newer one.
   *   exporter    — the live encoder, so Cancel reaches the packaging waits
   *                 and not just the frame loop.
   */
  const renderHeartbeatRef = useRef(Date.now());
  /**
   * The renders the watchdog has given up on.
   *
   * A set of TOKENS, not a single flag: a stuck render can settle long after
   * the creator has started a replacement, and its late failure (or late
   * success) must be ignored without touching the live render's status.
   */
  const abandonedRenderTokensRef = useRef<Set<number>>(new Set());
  const renderTokenRef = useRef(0);
  const activeExporterRef = useRef<OfflineExporter | null>(null);

  /**
   * Progress/stage updates: the local render screen AND the app-wide job
   * status. The second half is what keeps the header pill alive when the
   * user walks away from this page mid-render.
   */
  const reportProgress = useCallback((p: number, stage?: string) => {
    renderHeartbeatRef.current = Date.now();
    setRenderProgress(p);
    setRenderStatus({ progress: p, ...(stage ? { stage } : {}) });
  }, []);
  const reportStage = useCallback((stage: string) => {
    renderHeartbeatRef.current = Date.now();
    setRenderStage(stage);
    setRenderStatus({ stage });
  }, []);

  // Keep the dashboard clock alive, reflect background-tab state, and warn
  // before a reload/navigation destroys a local encoder that cannot survive a
  // document unload.
  useEffect(() => {
    if (!isRendering) return;
    const update = () => {
      setRenderHealth((health) => ({
        ...health,
        elapsedMs: health.startedAt ? Date.now() - health.startedAt : health.elapsedMs,
        tabHidden: typeof document !== "undefined" ? document.hidden : false,
      }));
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "A video render is still running.";
    };
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("beforeunload", beforeUnload);
    update();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [isRendering]);

  /**
   * The last line of defence: no render may stay "running" for ever.
   *
   * The encoder and the Vault now time their own waits out (render-guard.ts,
   * render-output-store.ts, render-vault.ts), but a render also spends time in
   * things none of those own: decoding a scene photo, seeking a clip, the
   * OfflineAudioContext mix. If *anything* in the pipeline stops reporting
   * progress for RENDER_STALL_LIMIT_MS, the job is ended here with an
   * explanation the creator can act on — rather than a spinner that never
   * stops and a tab that warns them not to close it.
   */
  useEffect(() => {
    if (!isRendering) return;
    const timer = window.setInterval(() => {
      const watched = renderTokenRef.current;
      if (abandonedRenderTokensRef.current.has(watched)) return;
      const quietMs = Date.now() - renderHeartbeatRef.current;
      if (quietMs < RENDER_STALL_LIMIT_MS) return;
      // Read from the shared job status rather than this render's state so the
      // interval does not have to be recreated on every stage update.
      const liveStage = getRenderStatus().stage || "finishing the file";
      const message =
        `The render stopped responding after ${formatGuardTime(quietMs)} without progress ` +
        `(${liveStage}). It was ended rather than left running. ` +
        `Nothing was lost from the project — start the render again.`;
      abandonedRenderTokensRef.current.add(watched);
      renderStartPendingRef.current = false;
      abortControllerRef.current = true;
      activeExporterRef.current?.abort(message);
      lastRenderErrorRef.current = message;
      setRenderError(message);
      setFailureReport(describeRenderFailure("render stopped responding: stall watchdog"));
      setRenderStatus({ active: false, progress: 0, stage: "Render stalled", error: message });
      setIsRendering(false);
      setIsPreparingRender(false);
      setIsCancelling(false);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isRendering]);

  // Sync with prop when returning to render tab
  useEffect(() => {
    if (propRenderedBlob) setRenderedBlob(propRenderedBlob);
    if (propRenderedUrl) setRenderedUrl(propRenderedUrl);
  }, [propRenderedBlob, propRenderedUrl]);

  /**
   * Idle canvas painter — the render screen shows the project's own imagery.
   *
   * The canvas used to stay black until "Start Video Render" was pressed,
   * which read as "no images in the render". It now plays the first scene
   * with the same framing, motion, filter and caption engine the export uses
   * (all the shared modules), looping gently like the live preview. It stops
   * the moment a real render starts — the render loop owns the canvas then.
   */
  useEffect(() => {
    if (isRendering || renderedUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height } = getDimensions(settings.resolution);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const first = scenesWithImages[0];
    if (!first) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let startedAt = 0;
    const LOOP_SECONDS = 14;
    const idleClipPool = new ClipPool();
    // The render-page preview is visual only. A video's own soundtrack belongs
    // to the Studio Play button and the final file, never to an autoplaying card.
    const idleScene = sceneHasClip(first) ? { ...first, video_mute: true } : first;

    const paint = (progress: number) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      let idleSource: SceneDrawable | null = idleImgRef.current as any;
      if (sceneHasClip(idleScene)) {
        const video = idleClipPool.get(idleScene);
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          idleSource = asDrawableClip(video);
        }
      }

      if (sceneIsBlankColor(first) && first.blank_color) {
        ctx.save();
        try { ctx.filter = "none"; } catch {}
        ctx.fillStyle = first.blank_color;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      } else if (sourceHasPixels(idleSource)) {
        const { scale, dx, dy } = getSceneCameraTransform(
          first,
          sceneAnimationEnabled,
          progress,
          width,
          height,
          0
        );
        const safeScale = isNaN(scale) ? 1 : scale;
        const safeDx = isNaN(dx) ? 0 : dx;
        const safeDy = isNaN(dy) ? 0 : dy;
        try {
          drawSceneImage(ctx, idleSource, first, width, height, {
            motionScale: safeScale,
            motionDx: safeDx + (width * safeScale - width) / 2,
            motionDy: safeDy + (height * safeScale - height) / 2,
            filter: getFilterCanvas(videoFilter, width),
          });
        } catch {}
        try { ctx.filter = "none"; } catch {}
      }

      if (sceneAnimationEnabled) {
        try {
          renderSceneAnimationEffects(ctx, first, width, height, progress * LOOP_SECONDS, progress, { enabled: true });
        } catch {}
      }

      try {
        paintVideoFilter(ctx, videoFilter, width, height, progress * LOOP_SECONDS);
      } catch {}

      if (settings.includeSubtitles && (first.burn_caption ?? true) && first.text) {
        try {
          renderCanvasCaptions(
            ctx,
            first.text,
            progress,
            captionsConfig || DEFAULT_CAPTIONS_CONFIG,
            width,
            height
          );
        } catch {}
      }

      // The Free-plan mark is deliberately the final preview layer, matching
      // export and preventing project content from covering it.
      if (showPlanWatermark) {
        drawSceneringWatermark(ctx, watermarkImgRef.current, width, height);
      }
    };

    const tick = (now: number) => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (!startedAt) startedAt = now;
      const progress = ((now - startedAt) / 1000 / LOOP_SECONDS) % 1;
      paint(progress);
      rafId = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        await loadCaptionFonts();
        await ensureCaptionFont(
          captionsConfig?.fontId || getCaptionStyle(captionsConfig?.preset).fontId
        );
      } catch {}
      await loadCustomVideos();
      if (cancelled) return;
      // Load through the shared loader: a failed photo shows the gradient
      // card exactly like the preview, never a black canvas.
      const res = await loadSceneImage(first.image_url || "", 0);
      if (cancelled) return;
      idleImgRef.current = res ? res.img : null;
      if (sceneHasClip(idleScene)) {
        // Muted autoplay keeps this visual preview moving without producing a
        // second soundtrack beside the Studio's explicit Play control.
        void idleClipPool.play(
          idleScene,
          0,
          Math.max(0.1, idleScene.video_duration || idleScene.duration || LOOP_SECONDS)
        );
      }
      paint(0.35);
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      idleClipPool.dispose();
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRendering, renderedUrl, scenesWithImages, videoFilter, settings.resolution, settings.includeSubtitles, captionsConfig, aspectRatio, propResolution, sceneAnimationEnabled, showPlanWatermark, watermarkLoaded]);

  // Attribution state - default collapsed ("do not open it yet")
  const [copiedAttribution, setCopiedAttribution] = useState(false);
  const [showAttributionPreview, setShowAttributionPreview] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Clip decoders in use by the current export, released when it ends. */
  const clipPoolRef = useRef<ClipPool | null>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  /** Shares a single in-flight image request between preview and an export. */
  const watermarkLoadRef = useRef<Promise<HTMLImageElement | null> | null>(null);
  const customerLogoImgRef = useRef<HTMLImageElement | null>(null);
  /** Locks out a second click while async export authorization/render cleanup is in flight. */
  const renderStartPendingRef = useRef(false);
  const abortControllerRef = useRef<boolean>(false);
  /** Frame pacing for the export — vsync-locked, worker-driven when hidden. */
  const frameTickerRef = useRef<FrameTicker | null>(null);
  /** Which render installed the ticker, so an abandoned render's cleanup
   *  never stops the ticker of the render that replaced it. */
  const frameTickerOwnerRef = useRef(0);
  /** Image behind the idle render-canvas painter. */
  const idleImgRef = useRef<HTMLImageElement | null>(null);
  /** Why the last render failed — read synchronously by the platform queue
   *  so a failed row can say what went wrong (state updates are async). */
  const lastRenderErrorRef = useRef<string>("");

  /**
   * Free output must never begin until its required product mark is available.
   * This also avoids loading the image at all for paid plans.
   */
  const ensureWatermarkImage = useCallback((): Promise<HTMLImageElement | null> => {
    const existing = watermarkImgRef.current;
    if (existing && existing.naturalWidth > 0 && existing.naturalHeight > 0) {
      return Promise.resolve(existing);
    }
    if (watermarkLoadRef.current) return watermarkLoadRef.current;

    const image = new Image();
    const pending = new Promise<HTMLImageElement | null>((resolve) => {
      image.onload = () => {
        watermarkImgRef.current = image;
        watermarkLoadRef.current = null;
        setWatermarkLoaded(true);
        resolve(image);
      };
      image.onerror = () => {
        watermarkImgRef.current = null;
        watermarkLoadRef.current = null;
        setWatermarkLoaded(false);
        resolve(null);
      };
    });
    watermarkLoadRef.current = pending;
    image.src = "/scenering-logo.png";
    return pending;
  }, []);

  // Warm the mark for a Free-plan preview. The final-export path below also
  // awaits it, so a fast click cannot produce an unbranded Free render.
  useEffect(() => {
    if (showPlanWatermark) void ensureWatermarkImage();
  }, [showPlanWatermark, ensureWatermarkImage]);

  // Pre-load customer logo image cleanly using safe proxy to prevent canvas tainting
  useEffect(() => {
    const logoUrl = customerLogo?.url;
    if (logoUrl) {
      loadImage(logoUrl).then((img) => {
        customerLogoImgRef.current = img;
      });
    } else {
      customerLogoImgRef.current = null;
    }
  }, [customerLogo?.url]);

  // Resolution dimensions helper supporting resolution settings and aspect
  // ratio. The actual table lives in the Master Render Profile
  // (src/lib/render-profile.ts) — this only resolves which row to ask for.
  const getDimensions = (resOrRatio?: RenderSettings["resolution"] | AspectRatioType) => {
    const targetRes: ResolutionType = (resOrRatio === "720p" || resOrRatio === "1080p" || resOrRatio === "2k" || resOrRatio === "4k")
      ? resOrRatio
      : (settings?.resolution === "720p" || settings?.resolution === "2k" || settings?.resolution === "4k" ? settings.resolution : (propResolution || "1080p"));
    const currentRatio = aspectRatio || "16:9";
    const aspect: AspectRatioType =
      resOrRatio === "shorts_9_16" || resOrRatio === "9:16" || currentRatio === "9:16"
        ? "9:16"
        : resOrRatio === "square_1_1" || resOrRatio === "1:1" || currentRatio === "1:1"
        ? "1:1"
        : resOrRatio === "4:3" || currentRatio === "4:3"
        ? "4:3"
        : "16:9";
    return resolveRenderDimensions(aspect, targetRes);
  };

  /** The frame rate the export really runs at ("auto" → Scenering picks 30). */
  const effectiveFps = resolveFrameRate(settings.fps);

  /**
   * Scene images and logos load through the ONE shared loader
   * (src/lib/scene-image-loader.ts) — the same loader the live preview uses.
   * A scene photo that cannot be loaded resolves the preview's gradient
   * "Scene N" card instead of null, so the exported video can never show a
   * black frame where the preview showed a picture. Logos opt out of the
   * fallback; the required product watermark is loaded and gated separately.
   */
  const loadImage = (url: string): Promise<HTMLImageElement | null> =>
    loadSceneImage(url, 0, { fallback: "none" }).then((r) => r?.img ?? null);

  // Load real background music buffer from library track
  const loadRealAmbientTrackBuffer = async (
    ctx: BaseAudioContext,
    style: RenderSettings["backgroundMusic"]
  ): Promise<AudioBuffer | null> => {
    if (style === "none") return null;
    const trackId = AMBIENT_STYLE_TO_TRACK[style];
    const track = trackId ? getBackgroundMusicTrack(trackId) : undefined;
    if (!track?.url) return null;
    try {
      const res = await fetch(track.url);
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      console.warn("Failed loading real ambient music track:", err);
      return null;
    }
  };

  // Helper to ensure scene duration matches speech narration with clean breathing space
  const getEffectiveSceneDuration = (scene: Scene, audioBufDuration?: number): number => {
    if (audioBufDuration && audioBufDuration > 0.3) {
      return Math.round((audioBufDuration + 0.25) * 10) / 10;
    }
    if (scene.duration && scene.duration > 0) {
      return scene.duration;
    }
    return calculateDynamicDuration(scene.text, scene.audio_duration);
  };

  // ------ RENDER VIDEO HANDLER ------
  // targetFormat records into that container: "mp4" (H.264 + AAC — the social
  // standard), "webm" (VP9/VP8 + Opus), or "mov" (the same H.264/AAC stream
  // saved with the QuickTime .mov extension). Omitted → the configured format.
  //
  // `plan` (optional) is a fully-resolved Master Render Profile recipe — the
  // multi-platform queue passes one per master encode (a vertical TikTok
  // master can be produced from a landscape project this way). Without a
  // plan the current settings are resolved through the same profile module.
  //
  // Returns the finished encode so callers (the queue) can reuse it; null on
  // failure or cancellation.
  const handleStartRender = async (
    targetFormat?: "mp4" | "webm" | "mov",
    plan?: RenderPlan & { label?: string },
    /** Set once the creator has seen, and accepted, the VIP warning below. */
    vipAcknowledged = false
  ): Promise<{ blob: Blob; container: "mp4" | "webm" } | null> => {
    if (scenesWithImages.length === 0 || isRendering || renderStartPendingRef.current) return null;
    // The job status is shared beyond this screen. Two local WebCodecs
    // encoders and two OfflineAudioContexts at once is exactly how a browser
    // runs out of memory *between* renders, so a live job is never doubled —
    // however this screen was reached.
    if (getRenderStatus().active) return null;
    renderStartPendingRef.current = true;
    setIsPreparingRender(true);
    const renderToken = renderTokenRef.current + 1;
    renderTokenRef.current = renderToken;
    renderHeartbeatRef.current = Date.now();
    // A render that was cancelled, crashed or lost with its tab leaves its
    // `.part` staging file behind. Those files compete for the same protected
    // storage the next encode needs, so sweep the ones that are provably not
    // in use before anything is written.
    void clearStaleRenderScratch(30 * 60 * 1000)
      .then((swept) => {
        if (swept.files > 0) {
          console.info(
            `Cleared ${swept.files} abandoned render file(s) (${formatStorageBytes(swept.bytes)}) before rendering.`,
          );
        }
      })
      .catch(() => {
        /* the sweep is best-effort */
      });
    /**
     * Preparation owns the start lock, so it must always give it back.
     *
     * These two steps used to run unguarded: a rejected `loadCustomVideos()`,
     * or a watermark image that simply never answered, returned without
     * clearing `renderStartPendingRef` — and from then on every press of
     * Render did nothing at all until the page was reloaded. The watermark
     * request now also has a deadline, because "never answers" is a real
     * state for an image request on a flaky connection.
     */
    try {
      // Stable `custom-video:<id>` addresses are useless to the clip pool
      // until IndexedDB has restored their live Blob URLs for this page load.
      await loadCustomVideos();
    } catch (prepareError: any) {
      const message = prepareError?.message || "This project's uploaded clips could not be prepared.";
      lastRenderErrorRef.current = message;
      setRenderError(message);
      setRenderStatus({ active: false, error: message, stage: "Render could not start" });
      renderStartPendingRef.current = false;
      setIsPreparingRender(false);
      return null;
    }

    // The watermark is Free-plan policy, not a best-effort visual detail. Do
    // not produce a file if its required, fixed mark failed to load.
    const watermark = showPlanWatermark
      ? await withTimeout(
          ensureWatermarkImage(),
          15_000,
          "the required Scenering watermark loaded",
        ).catch(() => null)
      : null;
    if (showPlanWatermark && !watermark) {
      const message = "The required Scenering watermark could not load. Check your connection and try again.";
      lastRenderErrorRef.current = message;
      setRenderError(message);
      setRenderStatus({ active: false, error: message, stage: "Watermark unavailable" });
      renderStartPendingRef.current = false;
      setIsPreparingRender(false);
      return null;
    }

    // Draft is an unmetered preview. Every other encode reserves allowance
    // atomically before expensive work starts, preventing parallel-tab races.
    const isFinalExport = Boolean(plan) || settings.quality !== "draft";

    /* ------------------------------------------------------------- VIP
       A draft is a preview and shows everything. A FINAL download is the
       file people keep, and it goes out with only what the membership
       includes. Two things happen here, in this order:

       1. Nobody is surprised. If there is anything VIP in the project the
          render does not start — the dialog opens first and says exactly
          what is in there and what is about to happen to it.
       2. The renderer is handed a cleaned copy either way. Everything
          below draws from `exportInserts` / `exportFilter` / … rather than
          the project's own values, so a paid effect cannot reach the file
          through a check that was missed, a plan that changed mid-session
          or a stale answer from the server. */
    if (isFinalExport && vipFindings.length > 0 && !vipAcknowledged) {
      setVipPrompt({ format: targetFormat, plan });
      renderStartPendingRef.current = false;
      setIsPreparingRender(false);
      return null;
    }
    /* Cleaned for EVERY render, draft included. A draft is a cheap, unmetered
       encode, but it is still a file: it lands in the Vault and it has a
       download button, so "the preview may show it" cannot stretch to cover
       it. Watching the project play on this page is the preview; anything
       that writes a video goes out with what the membership includes.
       (The two findings that cannot be left out — the narration voice and
       the caption style — only stop a FINAL download; a draft is allowed to
       keep them, because it exists to be looked at and then thrown away.) */
    const exportSafe = stripVipFromExport(currentPlan, {
      inserts,
      videoFilter,
      sceneAnimationEnabled,
      motionStyle,
      captionsConfig,
      selectedVoice,
      sceneVoices: sceneVoiceIds,
      voiceEcho,
    });
    const exportInserts = exportSafe.inserts;
    const exportFilter = exportSafe.videoFilter;
    /**
     * The per-scene effect stack (weather, water, particles…) is the paid part
     * and is stripped for a plan that does not include special effects.
     *
     * The CAMERA is a different feature (`camera_movements`, audited through
     * `motionStyle` above), so it must NOT be switched off by that strip. It
     * used to be: with the stack stripped, `getSceneCameraTransform()` read
     * `scene.motion_effect` instead of `scene.animation.camera.motion`, which
     * is a field the preview never touched — so on any project where the two
     * had drifted apart (every project saved before the style was propagated
     * to all scenes) the preview glided and the finished file froze or moved
     * differently, scene by scene. That is "the Ken Burns looks jagged in the
     * video but fine in the preview".
     */
    const exportSceneEffects = exportSafe.sceneAnimationEnabled;
    const exportSceneAnimation = sceneAnimationEnabled || exportSceneEffects;
    const exportMotionStyle = exportSafe.motionStyle;
    const exportVoiceEcho = exportSafe.voiceEcho;
    setVipOmittedLast(exportSafe.removed);

    /* The reservation only AUTHORISES this render (membership features and a
       download still left this week). It never counts anything: it is
       released in the `finally` below however the render ends. What counts
       against the plan is each download from the Vault — recordVideoDownload
       in downloadVaultRender. */
    let exportReservationId: string | null = null;
    if (isFinalExport) {
      const durationMinutes = Math.max(0.01, totalDuration / 60);
      try {
        // Everything here is measured on the cleaned render — what the file
        // will contain — not on the project, which may still hold VIP work
        // the creator wants to keep for when they upgrade.
        const required = new Set<FeatureKey>();
        const narrationVoices = [selectedVoice || "speechify_male_01", ...sceneVoiceIds];
        if (narrationVoices.some((voiceId) => !isPlanVoiceIncluded("free", voiceId))) required.add("advanced_voice");
        if (captionsConfig?.enabled && !["newsroom_clean", "cinema_classic"].includes(captionsConfig.preset || "newsroom_clean")) required.add("premium_captions");
        if (exportMotionStyle && !["dynamic", "static", "none"].includes(exportMotionStyle)) required.add("camera_movements");
        if (exportSceneEffects) required.add("special_effects");
        // Echo and ambience are written into the exported voice track, so the
        // export is what they are charged against; previewing them stays free.
        if (voiceEchoIsActive(resolveVoiceEcho(exportVoiceEcho))) required.add("voice_echo");
        if (exportFilter) required.add("filters");
        for (const insert of exportInserts) {
          const feature = INSERT_FEATURE[insert.category];
          if (feature) required.add(feature);
          // Free includes ONE button: the standard Subscribe badge as it
          // ships. Any other platform — and any badge restyled in the button
          // settings, Subscribe included — is an advanced call to action.
          if (insert.category === "call_to_action" && !isFreeCtaInsert(insert)) required.add("advanced_cta");
        }
        const membership = await getEntitlements(true);
        const denied = [...required].find((feature) => !membership.entitlements.features[feature]);
        if (denied) throw new Error(`Your current membership does not include ${denied.replace(/_/g, " ")} in a Final Export. You can still preview it or change membership.`);
        const creativeManifest = {
          features: [...required],
          voice: sceneVoiceIds.find((voiceId) => !isPlanVoiceIncluded("free", voiceId)) || selectedVoice || "speechify_male_01",
          captionStyle: captionsConfig?.preset || "newsroom_clean",
          backgroundMusic: exportInserts.filter((insert) => insert.category === "background_music").map((insert) => insert.type),
          audioVisualisers: exportInserts.filter((insert) => insert.category === "audio_visualizers" || insert.category === "speech_reactive").map((insert) => insert.type),
          // A restyled badge is reported with the :custom suffix so the server
          // refuses it by the same route as an unlisted platform, instead of
          // seeing a type that looks like the free Subscribe button.
          callsToAction: exportInserts
            .filter((insert) => insert.category === "call_to_action")
            .map((insert) => (isCtaCustomised(insert) ? `${insert.type}${CUSTOMISED_CTA_SUFFIX}` : insert.type)),
        };
        exportReservationId = await reserveFinalExport(project?.id ?? "unknown", durationMinutes, durationMinutes <= 1 ? "short" : "long", creativeManifest);
      } catch (authorizationError: any) {
        const message = authorizationError?.message || "This final export could not be authorized.";
        setRenderError(message);
        setRenderStatus({ active: false, error: message, stage: "Export authorization required" });
        renderStartPendingRef.current = false;
        setIsPreparingRender(false);
        return null;
      }
    }

    setIsRendering(true);
    setIsPreparingRender(false);
    setIsCancelling(false);
    // The previous finished video is still pinned three times (this screen's
    // state, the app's, and its object URL). Holding it through the next
    // encode is exactly the memory and disk pressure that makes a second
    // render — but not the first — stumble at the packaging step. It has
    // either been downloaded from the Vault already or is still there, so it
    // is released only once this render is authorised and actually starting.
    clearFinishedRender();
    setRenderTiming(null);
    setTimingCopied(false);
    reportProgress(0);
    setRenderError(null);
    setFailureReport(null);
    setRenderEngine("checking");
    setOutputAudit(null);
    setMotionAudit(null);
    setExportFormatNote(null);
    setOfflineFailureReason(null);
    setExportValidation(null);
    setClipAudioNotice(null);
    abortControllerRef.current = false;
    const renderStartedAt = Date.now();
    setRenderHealth({
      ...EMPTY_RENDER_HEALTH,
      startedAt: renderStartedAt,
      tabHidden: typeof document !== "undefined" ? document.hidden : false,
    });
    // Publish the job so the header can follow it even if the user leaves
    // this screen — the render itself keeps running either way.
    setRenderStatus({
      active: true,
      progress: 0,
      stage: "1/4: Preparing narration, visuals and audio…",
      title: project?.title || "Untitled render",
      startedAt: renderStartedAt,
      finishedAt: null,
      error: null,
      lastVaultId: null,
    });

    // Preview vs final render (§18 of the profile spec): the Draft preset is
    // a fast preview — 720p-class dimensions and a light bitrate — while
    // every other preset is a full platform-quality final encode.
    const dims = plan
      ? { width: plan.width, height: plan.height }
      : settings.quality === "draft"
      ? getDimensions("720p")
      : getDimensions(settings.resolution);
    const { width, height } = dims;
    // Constant frame rate: the canvas is captured at exactly this rate and
    // the frame ticker paces the loop to match — total frames = duration × FPS.
    const fpsUsed = plan ? plan.fps : effectiveFps;
    const videoKbps = plan
      ? plan.videoBitrateKbps
      : computeVideoBitrateKbps(width, height, fpsUsed, settings.quality);
    const audioKbps = plan ? plan.audioBitrateKbps : computeAudioBitrateKbps(settings.quality);

    lastRenderErrorRef.current = "";
    const canvas = canvasRef.current;
    if (!canvas) {
      lastRenderErrorRef.current = "The render canvas is not on screen (try staying on this page while rendering)";
      setRenderError("Canvas element not available");
      setRenderStatus({ active: false, error: "Canvas element not available", stage: "Render failed" });
      setIsRendering(false);
      setIsPreparingRender(false);
      renderStartPendingRef.current = false;
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
    if (!ctx) {
      lastRenderErrorRef.current = "The browser refused a 2D drawing context";
      setRenderError("2D Context unavailable");
      setRenderStatus({ active: false, error: "2D Context unavailable", stage: "Render failed" });
      setIsRendering(false);
      setIsPreparingRender(false);
      renderStartPendingRef.current = false;
      return null;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    let releaseWakeLock: () => Promise<void> = async () => {};
    let renderAudioContext: AudioContext | null = null;
    /** This render's clip decoders, released in the finally even if a newer
     *  render has already taken over `clipPoolRef`. */
    let renderClipPool: ClipPool | null = null;

    try {
      releaseWakeLock = await holdRenderWakeLock((wakeLock) => {
        setRenderHealth((health) => ({ ...health, wakeLock }));
      });
      // Make sure the caption faces are ready before the first frame is
      // captured. The specific face has to be requested by name: canvas text
      // does not pull a web font in the way DOM text does, so without this
      // the export would burn in the fallback typeface even though the
      // preview showed the real one.
      await loadCaptionFonts();
      await ensureCaptionFont(
        captionsConfig?.fontId || getCaptionStyle(captionsConfig?.preset).fontId
      );

      // 1. Synthesizing audio & sound effects
      reportStage("1/4: Synthesizing narration voices & sound effects...");
      reportProgress(0.08);

      const audioCtx = new AudioContext();
      renderAudioContext = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const audioBuffers = new Map<number, { buffer: AudioBuffer; duration: number; words?: WordTiming[] }>();
      // A project with the voiceover switched off has no spoken track to
      // resolve, synthesise or schedule. Leaving this map empty is what makes
      // every later stage — scene lengths, the audio graph, the caption
      // clock — fall back to the footage and the script instead of a voice.
      const narrationTasks: Array<() => Promise<void>> = [];
      for (let i = 0; voiceoverEnabled && i < scenesWithImages.length; i++) {
        if (abortControllerRef.current) throw new Error("Render cancelled");
        const s = scenesWithImages[i];
        const sceneVoice = s.voice_id || selectedVoice;

        // 1. Resolve directly from the saved voiceover section (memory, IndexedDB, or audio_url)
        /* Only words the creator WROTE are narration. A scene's text can just
           as easily be a transcript of the soundtrack the video already has,
           and reading that back would put a synthesised voice over the song it
           came from — so `narratableText` is empty for a transcript.

           Such a scene is skipped whole rather than merely not synthesised:
           `resolveSceneAudioBuffer` reads `scene.audio_url`, which a narration
           generated for an EARLIER script leaves behind, and installing a
           transcript does not clear it. Resolving first would resurrect that
           old voice over the song the captions came from. */
        const spokenText = narratableText(s);
        if (s.caption_source === "transcript") continue;
        /* A scene with nothing to say has no narration of its own. Any file
           still attached to it is what an earlier script left behind, and
           playing it would put a voice back under a scene the creator has
           since emptied. The one exception is a prepared track — the
           creator's own recording, which is never re-synthesised. */
        const speaksHere = Boolean(spokenText) || isPreparedVoiceoverId(s.voice_id);
        if (!speaksHere) continue;
        const sceneIndex = i;
        narrationTasks.push(async () => {
          if (abortControllerRef.current) throw new Error("Render cancelled");
          let resolved = await resolveSceneAudioBuffer(s, audioCtx);
          if (!resolved && voiceoverEnabled) {
            /* A prepared file cannot be re-made, so an unreadable one is an
               error the creator has to answer. A generated line can be: the
               script and the narrator this scene has now are all the renderer
               needs, and synthesising it is better than exporting whatever
               older file happened to still be attached. */
            if (s.audio_url && speaksHere && isPreparedVoiceoverId(s.voice_id)) {
              throw new Error(`The saved audio for scene ${sceneIndex + 1} could not be loaded. Re-import or regenerate that track.`);
            }
            if (spokenText) {
              const withTimeline = await fetchSceneAudioWithTimeline(spokenText, sceneVoice, { timeoutMs: 20000 });
              if (!withTimeline) throw new Error(`Speechify returned no audio for scene ${sceneIndex + 1}.`);
              const audioBuffer = await audioCtx.decodeAudioData(withTimeline.rawBuffer.slice(0));
              const blob = new Blob([withTimeline.rawBuffer], { type: withTimeline.mimeType });
              const blobUrl = URL.createObjectURL(blob);
              await replaceSceneNarration(s.id, sceneVoice, spokenText, {
                audioBuffer,
                blobUrl,
                duration: audioBuffer.duration,
                voiceId: sceneVoice,
                text: spokenText,
                rawBuffer: withTimeline.rawBuffer,
                blob,
                words: withTimeline.words,
              });
              // The scene now describes the line that was actually exported —
              // its narrator, its file and the length it needs — instead of
              // keeping a pointer to the file this render just replaced.
              const fitted = Math.max(1, Math.round((audioBuffer.duration + 0.35) * 10) / 10);
              onUpdateScene?.(s.id, {
                audio_url: blobUrl,
                audio_name: `${resolveVoicePreset(sceneVoice)?.name || sceneVoice} Narration`,
                voice_id: sceneVoice,
                duration: fitted,
                audio_duration: audioBuffer.duration,
              });
              resolved = {
                buffer: audioBuffer,
                duration: audioBuffer.duration,
                url: blobUrl,
                words: withTimeline.words,
              };
            }
          }
          if (resolved) {
            audioBuffers.set(s.id, {
              buffer: resolved.buffer,
              duration: resolved.duration,
              words: resolved.words && resolved.words.length > 0 ? resolved.words : undefined,
            });
          } else if (spokenText) {
            throw new Error(`No narration audio is available for scene ${sceneIndex + 1}.`);
          }
        });
      }

      if (narrationTasks.length > 0) {
        let nextTask = 0;
        let completedTasks = 0;
        await Promise.all(
          Array.from({ length: Math.min(3, narrationTasks.length) }, async () => {
            while (nextTask < narrationTasks.length) {
              const run = narrationTasks[nextTask++];
              await run();
              completedTasks += 1;
              reportProgress(0.08 + (completedTasks / narrationTasks.length) * 0.18);
            }
          })
        );
      }

      // Build the immutable timeline before constructing either audio graph. Both
      // the offline and real-time paths consume this exact schedule.
      const introSec = introSection?.enabled ? introSection : null;
      const outroSec = outroSection?.enabled ? outroSection : null;
      const introDuration = introSec ? Math.max(0.5, introSec.duration) : 0;
      const outroDuration = outroSec ? Math.max(0.5, outroSec.duration) : 0;

      // When the video opens directly on a scene (no intro section), the
      // first image holds for a short lead-in before the first words are
      // spoken — the narration used to begin ~0.1s in, too soon to take in
      // the opening. An enabled intro section is its own opening, so the
      // lead-in only applies without one.
      const speaks = voiceoverEnabled && projectHasNarration(scenesWithImages);
      const leadIn = narrationLeadIn(Boolean(introSec), speaks);

      let timelineOffset = introDuration;
      const sceneSchedule = scenesWithImages.map((s, idx) => {
        const item = audioBuffers.get(s.id);
        const sceneLength = sceneTimelineDuration(s, item ? item.duration : undefined, { singleScene });
        /* Nothing spoken means the "speech" simply spans the scene; any other
           value would drift the captions away from the picture. Estimating it
           from the text would be wrong twice over for a transcript, where the
           text is captions rather than something being read. */
        const speechDur =
          !voiceoverEnabled || !narratableText(s)
            ? sceneLength
            : item && item.duration > 0.3
              ? item.duration
              : calculateDynamicDuration(s.text, s.audio_duration);
        // The exact same scene-length formula the live preview uses
        // (src/lib/duration-utils.ts → sceneTimelineDuration): one number for
        // both, so the cut, the audio start and the caption flip all land on
        // the same moment in the preview and in the exported file.
        const sceneDur = sceneLength;
        // The first scene's window includes the lead-in; its narration (and
        // captions) begin speechOffset seconds into that window.
        const speechOffset = idx === 0 ? leadIn : 0;
        const windowDur = sceneDur + speechOffset;
        const entry = {
          scene: s,
          index: idx,
          startTime: timelineOffset,
          duration: windowDur,
          endTime: timelineOffset + windowDur,
          speechDuration: speechDur,
          speechOffset,
        };
        timelineOffset += windowDur;
        return entry;
      });

      const scriptTotalDuration = timelineOffset - introDuration;
      const outroStartTime = timelineOffset;
      const estimatedTotalDuration = Math.max(1, timelineOffset + outroDuration);

      const finishSuccessfulExport = async (
        finalBlob: Blob,
        recordedContainer: "mp4" | "webm",
        fallbackMime: string,
        engineUsed: "frame-exact" | "compatibility",
        encoderStats?: OfflineExportStats | null,
        recordedFrames?: number | null
      ): Promise<{ blob: Blob; container: "mp4" | "webm"; durableVaultCopy: boolean }> => {
        reportProgress(0.985);
        reportStage("4/4: Verifying output resolution, frame rate & audio sync…");
        const validation = await withTimeout(
          validateFinishedExport(finalBlob, {
            expectedWidth: width,
            expectedHeight: height,
            expectedFps: fpsUsed,
            expectedDurationSec: estimatedTotalDuration,
            expectedFrames: totalFrameCount(estimatedTotalDuration, fpsUsed),
            engine: engineUsed,
            encoderStats: encoderStats ?? null,
            recordedFrames: recordedFrames ?? null,
          }),
          EXPORT_VALIDATION_TIMEOUT_MS,
          "the finished file was verified",
        );
        if (!validation.ok) {
          throw new Error(`Export validation failed: ${validation.errors.join(" ")}`);
        }
        setExportValidation(validation);

        // A finished render is free. It goes into the Vault, and each
        // download from there is what counts against the plan.
        let finishedBlob = finalBlob;
        let durableVaultCopy = false;
        let lastVaultId: string | null = null;
        reportProgress(0.99);
        reportStage("4/4: Securing the finished video in the Vault…");
        try {
          /**
           * The commit is a disk write of the whole video. On a fifteen-minute
           * 4K render that is several gigabytes, so the deadline follows the
           * file size rather than a fixed few minutes — and because it is
           * bounded, the ticker may keep the watchdog calm while it runs.
           */
          const commitBudget = vaultCommitTimeoutMs(finalBlob.size);
          const entry = await withProgressTicker(
            "4/4: Securing the finished video in the Vault",
            () => withTimeout(
            saveRenderToVault({
              blob: finalBlob,
              title: plan?.label
                ? `${project?.title || "Untitled render"} — ${plan.label}`
                : project?.title || "Untitled render",
              mimeType: finalBlob.type || fallbackMime,
              durationSec: validation.durationSec,
              width: validation.width,
              height: validation.height,
              label: `${resolutionToken(validation.width, validation.height)} · ${Math.round(validation.fps)}fps CFR · ${recordedContainer.toUpperCase()} · ${getQualityLevel(settings.quality).name}`,
              // Provenance for the download that follows: the server keeps the
              // duration and format it authorised, so the Vault can count what
              // was actually rendered instead of trusting a retyped number.
              projectId: project?.id ?? null,
              reservationId: exportReservationId,
            }),
            commitBudget,
            "the finished video was committed to the Vault",
            ),
            (text) => {
              setRenderStage(text);
              setRenderStatus({ stage: text });
            },
            { heartbeat: () => { renderHeartbeatRef.current = Date.now(); } },
          );
          // IndexedDB returns its verified clone. Use that Blob for preview,
          // download and App state, then the OPFS staging file may be removed.
          finishedBlob = entry.blob;
          durableVaultCopy = entry.storageKind === "indexeddb";
          lastVaultId = entry.id;
          setVaultMessage(
            `Render finished — ${vaultRenders.length >= MAX_VAULT_RENDERS ? "oldest vault slot cleared, " : ""}waiting in the vault to download.`
          );
          void refreshVault();
        } catch (vaultErr) {
          console.warn("Vault save notice:", vaultErr);
          setVaultMessage("Render finished, but the Vault could not verify a copy. Download this video before closing the tab.");
        }

        const url = URL.createObjectURL(finishedBlob);
        // One finished video is enough to hold: the previous URL (if this
        // screen still owns one) is released before the new one is published.
        const previousUrl = finishedUrlRef.current;
        if (previousUrl && previousUrl !== url) {
          try {
            URL.revokeObjectURL(previousUrl);
          } catch {}
        }
        finishedUrlRef.current = url;
        setRenderedBlob(finishedBlob);
        setRenderedUrl(url);
        setRenderedContainer(recordedContainer);
        setSettings((current) => ({ ...current, format: recordedContainer }));
        reportProgress(1);
        reportStage("Render Complete! 🎉");
        onRenderSuccess?.(finishedBlob, url);
        // A render the watchdog already gave up on may still settle here (its
        // flush came back after all). The finished file is kept — that is
        // strictly better for the creator — but the job pill belongs to
        // whichever render is current.
        if (renderTokenRef.current === renderToken) {
          setRenderStatus({
            active: false,
            progress: 1,
            stage: durableVaultCopy ? "Render finished — verified in the Vault" : "Render finished — download before closing",
            finishedAt: Date.now(),
            lastVaultId,
          });
        }
        return { blob: finishedBlob, container: recordedContainer, durableVaultCopy };
      };

      // 2. Loading High-Resolution Visual Assets & Watermark
      reportStage("2/4: Loading high-resolution visuals & watermark...");
      reportProgress(0.28);

      /**
       * Bounded visual window.
       *
       * The old preparation step decoded every scene photo, built every
       * full-size graded canvas and opened every video decoder at once. A long
       * project can easily turn that into several gigabytes before frame one.
       * Sequential export only needs previous/current/next (the previous one
       * is retained for transitions), so keep exactly that three-scene window.
       */
      type RenderImage = SceneDrawable | null;
      const images: RenderImage[] = new Array(scenesWithImages.length).fill(null);
      const imageLoads = new Map<number, Promise<void>>();
      const fallbackScenes = new Set<number>();
      const gradeForCache = getFilterCanvas(exportFilter, width);
      const clipPool = new ClipPool();
      renderClipPool = clipPool;
      clipPoolRef.current = clipPool;

      // Request ~1.45× pixel headroom so Ken Burns zoom (up to 1.44×) and 9:16
      // crops sample native stock-photo pixels rather than upscaling 1080p URLs.
      const targetImageWidth = Math.ceil(width * 1.45);
      const targetImageHeight = Math.ceil(height * 1.45);

      const loadWindowImage = (index: number): Promise<void> => {
        if (index < 0 || index >= scenesWithImages.length || images[index]) return Promise.resolve();
        const inFlight = imageLoads.get(index);
        if (inFlight) return inFlight;
        const task = loadSceneImage(scenesWithImages[index].image_url || "", index, {
          minWidth: targetImageWidth,
          minHeight: targetImageHeight,
        })
          .then((result) => {
            if (!result) return;
            images[index] = result.img as RenderImage;
            if (result.usedFallback) fallbackScenes.add(index);
            setImageFallbackCount(fallbackScenes.size);
            try {
              prewarmSceneFrame(result.img, scenesWithImages[index], width, height, gradeForCache);
            } catch {}
          })
          .finally(() => imageLoads.delete(index));
        imageLoads.set(index, task);
        return task;
      };

      const loadWindowClip = async (index: number): Promise<void> => {
        const scene = scenesWithImages[index];
        if (!scene || !sceneHasClip(scene)) return;
        const el = clipPool.get(scene);
        if (!el || el.readyState >= 2) return;
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          el.addEventListener("loadeddata", done, { once: true });
          el.addEventListener("error", done, { once: true });
          setTimeout(done, 8000);
        });
      };

      let visualWindowCenter = -1;
      let visualWindowTask: Promise<void> = Promise.resolve();
      const ensureVisualWindow = (center: number): Promise<void> => {
        const safeCenter = Math.max(0, Math.min(scenesWithImages.length - 1, center));
        if (safeCenter === visualWindowCenter) return visualWindowTask;
        visualWindowCenter = safeCenter;
        visualWindowTask = (async () => {
          const immediate = [safeCenter - 1, safeCenter, safeCenter + 1].filter(
            (index) => index >= 0 && index < scenesWithImages.length,
          );
          await Promise.all(immediate.flatMap((index) => [loadWindowImage(index), loadWindowClip(index)]));

          // Kick off background lookahead prefetch for scene +2 so high-res
          // masters stream in while the current scene encodes.
          const lookaheadIndex = safeCenter + 2;
          const keep =
            lookaheadIndex < scenesWithImages.length ? [...immediate, lookaheadIndex] : immediate;
          if (lookaheadIndex < scenesWithImages.length) {
            void loadWindowImage(lookaheadIndex);
          }

          // Do not release the old window until the new one is ready: a slow
          // network image can never create a black gap at a scene boundary.
          const keepSet = new Set(keep);
          for (let index = 0; index < images.length; index++) {
            if (keepSet.has(index) || !images[index]) continue;
            const old = images[index] as HTMLImageElement;
            images[index] = null;
            try {
              if ("src" in old) old.src = "";
            } catch {}
          }
          clipPool.retain(keep.map((index) => scenesWithImages[index].id));
        })();
        return visualWindowTask;
      };

      // Frame zero and the next scene are decoded and prewarmed before any
      // encoder starts. Later windows are prepared as the sequential loop
      // reaches them.
      await ensureVisualWindow(0);

      // A Free-plan export already awaited its mandatory watermark before
      // spending work on scene assets. Paid plans intentionally skip it.

      // Preload customer brand logo if enabled to ensure it is decoded and ready
      if (customerLogo?.enabled && customerLogo.url) {
        try {
          const cLogo = await loadImage(customerLogo.url);
          if (cLogo) {
            customerLogoImgRef.current = cLogo;
          }
        } catch (logoErr) {
          console.warn("Notice: Customer logo preload issue:", logoErr);
        }
      }

      const sceneIndexAt = (time: number): number => {
        if (sceneSchedule.length === 0) return 0;
        for (const entry of sceneSchedule) {
          if (time < entry.endTime) return entry.index;
        }
        return sceneSchedule[sceneSchedule.length - 1].index;
      };

      // Pure canvas pass: timeline time and analyser telemetry are explicit
      // inputs, so this produces the same pixels in real time or frame-by-frame.
      const drawFrameAt = (currentGlobalTime: number, audioFrame: AudioFrame | null): void => {
        try {
          const frameTelemetry = audioFrame || EMPTY_FRAME;
          const loudestFrameBus = frameTelemetry.voice.level >= frameTelemetry.music.level
            ? frameTelemetry.voice
            : frameTelemetry.music;
          const frameAudioLevel = audioFrame ? Math.min(1, 0.15 + loudestFrameBus.level * 2.6) : 0.4;
          const frameFreqData = audioFrame ? (loudestFrameBus.freq as Uint8Array) || null : null;
          /** Product branding is always painted after project content. */
          const drawPlanWatermark = () => {
            if (showPlanWatermark) {
              drawSceneringWatermark(ctx, watermarkImgRef.current, width, height);
            }
          };
        // ==========================================
        // PHASE 1: INTRO SEGMENT
        // ==========================================
        if (introSec && currentGlobalTime < introDuration) {
          const progressInIntro = Math.min(1, currentGlobalTime / Math.max(0.1, introDuration));
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);

          try {
            renderSection(ctx, introSec, width, height, currentGlobalTime, progressInIntro);
          } catch (e) {
            console.warn("Intro section render notice:", e);
          }

          if (exportInserts && exportInserts.length > 0) {
            exportInserts
              .filter((i) => i.category !== "intro" && i.category !== "outro")
              .forEach((ins) => {
                try {
                  renderTimelineInsert(ctx, ins, currentGlobalTime, width, height, frameAudioLevel, frameFreqData, frameTelemetry);
                } catch {}
              });
          }

          drawPlanWatermark();
          return;
        }

        // ==========================================
        // PHASE 3: OUTRO SEGMENT
        // ==========================================
        if (outroSec && currentGlobalTime >= outroStartTime) {
          const elapsedInOutro = currentGlobalTime - outroStartTime;
          const progressInOutro = Math.min(1, elapsedInOutro / Math.max(0.1, outroDuration));
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);

          try {
            renderSection(ctx, outroSec, width, height, elapsedInOutro, progressInOutro);
          } catch (e) {
            console.warn("Outro section render notice:", e);
          }

          if (exportInserts && exportInserts.length > 0) {
            exportInserts
              .filter((i) => i.category !== "intro" && i.category !== "outro")
              .forEach((ins) => {
                try {
                  renderTimelineInsert(ctx, ins, currentGlobalTime, width, height, frameAudioLevel, frameFreqData, frameTelemetry);
                } catch {}
              });
          }

          drawPlanWatermark();
          return;
        }

        // ==========================================
        // PHASE 2: SCRIPT SCENES (Exact Schedule Match)
        // ==========================================
        let activeEntry = sceneSchedule[sceneSchedule.length - 1];
        for (let i = 0; i < sceneSchedule.length; i++) {
          const entry = sceneSchedule[i];
          if (currentGlobalTime >= entry.startTime && currentGlobalTime < entry.endTime) {
            activeEntry = entry;
            break;
          }
          if (i === 0 && currentGlobalTime < entry.startTime) {
            activeEntry = entry;
            break;
          }
        }

        const currentScene = activeEntry.scene;
        const currentSceneIdx = activeEntry.index;
        const elapsedInScene = Math.max(0, currentGlobalTime - activeEntry.startTime);
        const progressInScene = Math.min(1, elapsedInScene / Math.max(0.1, activeEntry.duration));
        // speechProgress reaches 1.0 at the exact moment spoken narration
        // completes. The first scene's speech begins speechOffset seconds
        // in (the opening lead-in), so both the progress and the
        // word-locked timing are measured from that moment.
        const activeSpokenDuration = Math.max(0.4, activeEntry.speechDuration);
        const speechElapsed = Math.max(0, elapsedInScene - activeEntry.speechOffset);
        const speechProgress = Math.min(
          1,
          Math.max(0, speechElapsed / Math.max(0.1, activeSpokenDuration))
        );

        // --- Draw background ---
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);

        // --- Draw image (or video clip) ---
        let img: SceneDrawable | null = images[currentSceneIdx] as any;
        if (sceneHasClip(currentScene)) {
          const el = clipPool.get(currentScene);
          if (el) {
            clipPool.seekToProgress(currentScene, progressInScene, activeEntry.duration);
            if (el.readyState >= 2 && el.videoWidth > 0) {
              img = asDrawableClip(el);
            }
          }
        }

        const prevEntry = currentSceneIdx > 0 ? sceneSchedule[currentSceneIdx - 1] : null;
        const prevScene = prevEntry ? prevEntry.scene : null;
        let prevImg: SceneDrawable | null =
          currentSceneIdx > 0 ? (images[currentSceneIdx - 1] as any) : null;
        if (prevScene && sceneHasClip(prevScene)) {
          const el = clipPool.get(prevScene);
          if (el && el.readyState >= 2 && el.videoWidth > 0) {
            prevImg = asDrawableClip(el);
          }
        }

        /* The movement the project's Motion Style gives this scene is the
           fallback, so a scene whose own movement was stripped or never
           written still moves in the file exactly as the preview showed. */
        const { scale, dx, dy } = getSceneCameraTransform(
          currentScene,
          exportSceneAnimation,
          progressInScene,
          width,
          height,
          currentSceneIdx,
          motionForStyle(exportMotionStyle, currentSceneIdx)
        );
        const safeScale = isNaN(scale) ? 1 : scale;
        const safeDx = isNaN(dx) ? 0 : dx;
        const safeDy = isNaN(dy) ? 0 : dy;

        /**
         * A scene using a plain colour has no image to draw, so fill the
         * frame first. Painting it here — before the transition and before
         * the project filter — means a fade still darkens into the colour
         * and the filter still tints it, exactly as it would a photo.
         */
        if (sceneIsBlankColor(currentScene) && currentScene.blank_color) {
          ctx.save();
          try {
            ctx.filter = "none";
          } catch {}
          ctx.fillStyle = currentScene.blank_color;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }

        let handledTransition = false;
        if (
          currentScene.transition &&
          currentScene.transition !== "none"
        ) {
          const transDur = getTransitionDuration(activeEntry.duration);
          if (elapsedInScene < transDur) {
            const { scale: prevScale, dx: prevDx, dy: prevDy } = prevScene
              ? getSceneCameraTransform(
                  prevScene,
                  exportSceneAnimation,
                  1,
                  width,
                  height,
                  Math.max(0, currentSceneIdx - 1),
                  motionForStyle(exportMotionStyle, Math.max(0, currentSceneIdx - 1))
                )
              : { scale: 1, dx: 0, dy: 0 };
            const safePrevScale = isNaN(prevScale) ? 1 : prevScale;
            const safePrevDx = isNaN(prevDx) ? 0 : prevDx;
            const safePrevDy = isNaN(prevDy) ? 0 : prevDy;

            handledTransition = drawSceneTransition(
              ctx,
              currentScene,
              sourceHasPixels(img) ? img : null,
              prevScene || null,
              sourceHasPixels(prevImg) ? prevImg : null,
              elapsedInScene,
              activeEntry.duration,
              width,
              height,
              {
                motionScale: safeScale,
                motionDx: safeDx + (width * safeScale - width) / 2,
                motionDy: safeDy + (height * safeScale - height) / 2,
                filter: getFilterCanvas(exportFilter, width),
              },
              prevScene ? {
                motionScale: safePrevScale,
                motionDx: safePrevDx + (width * safePrevScale - width) / 2,
                motionDy: safePrevDy + (height * safePrevScale - height) / 2,
                filter: getFilterCanvas(exportFilter, width),
              } : undefined
            );
          }
        }

        if (!handledTransition && sourceHasPixels(img)) {
          try {
            drawSceneImage(ctx, img, currentScene, width, height, {
              motionScale: safeScale,
              motionDx: safeDx + (width * safeScale - width) / 2,
              motionDy: safeDy + (height * safeScale - height) / 2,
              filter: getFilterCanvas(exportFilter, width),
            });
          } catch (drawErr) {
            console.warn("Scene draw notice:", drawErr);
          }

          try {
            ctx.filter = "none";
          } catch {}
        }

        // --- Per-scene living-scene animation layers ---
        if (exportSceneEffects) {
          try {
            renderSceneAnimationEffects(
              ctx,
              currentScene,
              width,
              height,
              elapsedInScene,
              progressInScene,
              { enabled: true, audioLevel: frameAudioLevel }
            );
          } catch (animationErr) {
            console.warn("Scene animation notice:", animationErr);
          }
        }

        // --- Animated atmosphere of the project-wide filter ---
        try {
          paintVideoFilter(ctx, exportFilter, width, height, currentGlobalTime);
        } catch (filterErr) {
          console.warn("Video filter notice:", filterErr);
        }

        // --- Customer Brand Logo in Top-Right Corner (if enabled) ---
        if (
          customerLogo?.enabled &&
          customerLogo.url &&
          customerLogoImgRef.current &&
          customerLogoImgRef.current.naturalWidth > 0 &&
          customerLogoImgRef.current.naturalHeight > 0
        ) {
          ctx.save();
          const logoOpacity = Math.max(0.1, Math.min(1.0, customerLogo.opacity ?? 1.0));
          ctx.globalAlpha = logoOpacity;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          const scaleRatio = width / 1280;
          const cScale = Math.max(0.2, Math.min(3.0, customerLogo.scale ?? 1.0));
          const cMarginX = (customerLogo.margin ?? 20) * scaleRatio;
          const cMarginY = (customerLogo.margin ?? 20) * (height / 720);
          const cWidth = Math.max(20, Math.round(200 * cScale * scaleRatio));
          const cHeight = Math.max(10, Math.round((cWidth * customerLogoImgRef.current.naturalHeight) / Math.max(1, customerLogoImgRef.current.naturalWidth)));
          const cX = Math.max(0, width - cWidth - cMarginX);
          const cY = Math.max(0, cMarginY);

          ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
          ctx.shadowBlur = 8 * scaleRatio;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2 * scaleRatio;

          try {
            ctx.drawImage(customerLogoImgRef.current, cX, cY, cWidth, cHeight);
          } catch (logoDrawErr) {
            console.warn("Logo draw notice:", logoDrawErr);
          }
          ctx.restore();
        }

        // --- Subtitle & Caption Rendering (Speech Synchronized) ---
        // Held back through the opening lead-in so the captions appear
        // exactly when the voice starts speaking.
        // A scene switched off in the Captions step is skipped here too, so the
        // exported file matches what the preview showed.
        if (
          settings.includeSubtitles &&
          (currentScene.burn_caption ?? true) &&
          currentScene.text &&
          elapsedInScene >= activeEntry.speechOffset
        ) {
          try {
            const activeCaptionsConfig: CaptionsConfig = captionsConfig || DEFAULT_CAPTIONS_CONFIG;
            const spokenWords = audioBuffers.get(currentScene.id)?.words;
            const footageWords = spokenWords ? null : sceneCaptionWords(currentScene);

            renderCanvasCaptions(
              ctx,
              currentScene.text,
              speechProgress,
              activeCaptionsConfig,
              width,
              height,
              {
                // Real per-word spoken timings: the highlight follows the
                // voice itself, not an estimate of it. Footage has no TTS, so
                // its captions follow the transcript of its own soundtrack
                // instead — the same word clock, from the other direction.
                wordTimings: spokenWords ?? footageWords,
                /* The two clocks differ by the opening lead-in, and using the
                   wrong one puts every caption two seconds late. A provider's
                   timings start when the speech starts; a transcript's
                   timings are the footage's own, which start with the scene. */
                audioTimeSec: footageWords ? elapsedInScene : speechElapsed,
              }
            );
          } catch (capErr) {
            console.warn("Captions render notice:", capErr);
          }
        }

        // --- Timeline Inserts & Overlays ---
        if (exportInserts && exportInserts.length > 0) {
          try {
            let audioLevel = 0.4;
            let freqData: Uint8Array | null = null;
            const insertAudioFrame = audioFrame || EMPTY_FRAME;
            const loudest = insertAudioFrame.voice.level >= insertAudioFrame.music.level
              ? insertAudioFrame.voice
              : insertAudioFrame.music;
            if (audioFrame) {
              audioLevel = Math.min(1, 0.15 + loudest.level * 2.6);
              freqData = (loudest.freq as Uint8Array) || null;
            }

            exportInserts.forEach((insert) => {
              try {
                renderTimelineInsert(ctx, insert, currentGlobalTime, width, height, audioLevel, freqData, insertAudioFrame, {
                  logo: customerLogo?.enabled ? customerLogoImgRef.current : null,
                });
              } catch (insErr) {
                console.warn("Insert notice:", insErr);
              }
            });
          } catch (insertsErr) {
            console.warn("Timeline inserts notice:", insertsErr);
          }
        }

        // Always paint the Free-plan mark after captions, logos and every
        // timeline insert so project content cannot cover or remove it.
        drawPlanWatermark();
        } catch (frameErr) {
          console.error("Frame render recoverable error:", frameErr);
        }
      };

      // Prefer a deterministic two-pass export. Nothing here is paced by wall
      // time: Web Audio renders the mix sample-exactly, then WebCodecs receives
      // one canvas snapshot for every timestamp in the CFR timeline.
      const requestedContainer: "mp4" | "webm" =
        targetFormat === "webm" ? "webm" : targetFormat === "mp4" || targetFormat === "mov"
          ? "mp4"
          : (plan ? plan.container : settings.format) === "webm" ? "webm" : "mp4";
      let offlineContainer: "mp4" | "webm" = requestedContainer;
      let offlineConfig: OfflineExportConfig = {
        container: offlineContainer,
        width,
        height,
        fps: fpsUsed,
        videoKbps,
        audioKbps,
        sampleRate: 48_000,
        channels: 2,
        /**
         * Upper bounds on how many chunks each track will produce, so the
         * muxer can reserve room for the index at the front of the file
         * instead of keeping the whole video in memory and rearranging it at
         * the end. One chunk per frame for video; AAC works in 1024-sample
         * frames, so the audio count follows from the duration. Rounded up
         * generously — reserving slightly too much space costs a few unused
         * bytes, reserving too little would fail the export.
         */
        ...muxChunkReservation(estimatedTotalDuration, fpsUsed),
      };
      let offlineProbe = await offlineExportSupported(offlineConfig);

      /**
       * One renderer. It is frame-exact, and it produces a real file every
       * time it can — the container is decided by what this device can encode,
       * not by what the customer typed.
       *
       * Two escapes remain removed and must not come back:
       *
       *  - **A real-time MediaRecorder fallback.** It painted the canvas while
       *    the audio played and captured whatever came out. Its motion is only
       *    as even as the machine is fast: the camera stalls, catches up, and
       *    stalls again, which is exactly the "stop and go" the frame-exact
       *    renderer exists to prevent.
       *  - **A silent switch that the screen never mentions.** A file that is
       *    really WebM must never be described as H.264 MP4, and its download
       *    extension always follows the bytes. That is still true below: when
       *    the container changes, the finish line and the Vault label both say
       *    which one was written, in one plain sentence.
       *
       * What changed (October 27): a device that cannot encode H.264/AAC for
       * MP4 was stopping the render with "This browser cannot record the
       * selected format" — after the customer had chosen everything, and with
       * nothing wrong with their project. Firefox without an AAC encoder, a
       * blocklisted hardware encoder and a stricter Safari all landed there.
       * The device is now asked twice (MP4, then the compatible alternative,
       * each with several profile/level/configuration shapes) before anything
       * is said to the customer, and only a device that can encode neither
       * container stops.
       */
      if (typeof OfflineAudioContext === "undefined") {
        setOfflineFailureReason("OfflineAudioContext unavailable");
        setRenderEngine("failed");
        console.error("Frame-exact offline export unsupported: no OfflineAudioContext");
        throw new Error(
          "This browser cannot mix the soundtrack for an export, so the video was not made. " +
            "Your project is unchanged — render again in Chrome, Edge or Safari.",
        );
      }

      if (!offlineProbe.supported) {
        const chosen = await resolveEncodableFormat(offlineConfig);
        console.info("Encoder preflight:", {
          requested: requestedContainer,
          chosen: chosen.container,
          substituted: chosen.substituted,
          detail: chosen.support.reason || "supported",
        });
        if (chosen.supported) {
          if (chosen.substituted) {
            offlineContainer = chosen.container;
            offlineConfig = { ...offlineConfig, container: chosen.container };
            offlineProbe = chosen.support;
            // Only worth saying when the file ends up as WebM: MP4 is what
            // every platform wants, so a device that produces it needs no
            // note at all.
            if (chosen.container === "webm") {
              setExportFormatNote(
                "This browser saves the video as WebM rather than MP4. It plays everywhere and uploads fine — " +
                  "for an MP4 file, render again in Chrome, Edge or Safari.",
              );
            }
          }
        } else {
          const reason = offlineProbe.reason || chosen.support.reason || "no encodable configuration";
          setOfflineFailureReason(reason);
          setRenderEngine("failed");
          console.error("Frame-exact offline export unsupported:", reason);
          throw new Error(
            "This browser could not produce the video file, so nothing was made and nothing was counted. " +
              "Your project is unchanged — render again in Chrome, Edge or Safari.",
          );
        }
      }

      let offlineEncoder: OfflineExporter | null = null;
      try {
          reportStage("3/4: Rendering sample-exact audio mix…");
          reportProgress(0.32);
          // Times itself, because the renders that go wrong are the long ones
          // and nobody can be asked to sit and watch a nine-minute export to
          // tell me which part was slow.
          const renderTimer = new RenderTimer();
          renderTimer.stage("encoder setup");
          const totalFrames = Math.ceil(estimatedTotalDuration * fpsUsed);
          setRenderHealth((health) => ({ ...health, totalFrames }));
          // Configure real encoder instances before spending time on the audio
          // pass. A driver/configuration rejection is reported immediately.
          offlineEncoder = await OfflineExporter.create(offlineConfig);
          activeExporterRef.current = offlineEncoder;
          setRenderHealth((health) => ({
            ...health,
            outputStorage: offlineEncoder!.outputStorage,
            outputStorageDetail: offlineEncoder!.outputStorageDetail,
          }));
          setRenderEngine("frame-exact");
          reportStage(`3/4: Frame-exact ${offlineProbe.videoCodec} + ${offlineProbe.audioCodec} — rendering audio…`);
          renderTimer.stage("audio graph");
          const offlineCtx = new OfflineAudioContext(2, Math.ceil(estimatedTotalDuration * 48_000), 48_000);
          const visualizerFftSize = requiredVisualizerFftSize(exportInserts);
          const offlineMastering = createMasteringChain(offlineCtx, settings.audioMastering);
          offlineMastering.output.connect(offlineCtx.destination);

          const voiceAnalyser = offlineCtx.createAnalyser();
          voiceAnalyser.fftSize = visualizerFftSize;
          voiceAnalyser.smoothingTimeConstant = 0.72;
          voiceAnalyser.minDecibels = -92;
          voiceAnalyser.maxDecibels = -12;
          voiceAnalyser.connect(offlineMastering.voiceInput);
          const offlineMusicAnalyser = offlineCtx.createAnalyser();
          offlineMusicAnalyser.fftSize = visualizerFftSize;
          offlineMusicAnalyser.smoothingTimeConstant = 0.72;
          offlineMusicAnalyser.minDecibels = -92;
          offlineMusicAnalyser.maxDecibels = -12;
          offlineMusicAnalyser.connect(offlineMastering.musicInput);

          let offlineEcho: VoiceEchoGraph | null = null;
          const offlineEchoConfig = resolveVoiceEcho(exportVoiceEcho);
          if (voiceEchoIsActive(offlineEchoConfig)) {
            offlineEcho = createVoiceEchoGraph(offlineCtx, offlineEchoConfig);
            offlineEcho.output.connect(voiceAnalyser);
          }
          for (const entry of sceneSchedule) {
            const item = audioBuffers.get(entry.scene.id);
            if (!item) continue;
            /* Each narration line opens from silence over ~12ms through its own
               gain, exactly as the preview does — so the exported soundtrack
               cannot carry the step-in of a buffer starting at full gain, and
               the preview and the file sound like the same performance. */
            /* Never longer than the scene it narrates. A line is scheduled
               whole, so a file left over from a longer voice (or a scene
               re-timed shorter) used to run on over the next scene — and, at
               the end of the video, past the last frame. */
            const speechStart = entry.startTime + entry.speechOffset;
            offlineMastering.primeVoiceEntrance?.(speechStart);
            startVoiceSource(offlineCtx, item.buffer, offlineEcho ? offlineEcho.input : voiceAnalyser, {
              whenSeconds: speechStart,
              durationSeconds: Math.max(0.05, entry.duration - entry.speechOffset),
            });
          }

          // Legacy render-page ambient bed (normally timeline inserts now).
          if (settings.backgroundMusic !== "none" && settings.musicVolume > 0) {
            const styleTrackId = AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic];
            const track = styleTrackId ? getBackgroundMusicTrack(styleTrackId) : undefined;
            if (track) {
              try {
                const response = await fetch(track.url);
                if (response.ok) {
                  const source = offlineCtx.createBufferSource();
                  source.buffer = await offlineCtx.decodeAudioData(await response.arrayBuffer());
                  source.loop = true;
                  const gain = offlineCtx.createGain();
                  gain.gain.value = Math.max(0, Math.min(1, settings.musicVolume)) * 0.85;
                  source.connect(gain);
                  source.start(0);
                  gain.connect(offlineMusicAnalyser);
                }
              } catch (error) {
                console.warn("Offline ambient track decode failed:", error);
              }
            }
          }

          const insertPlans = [
            ...buildInsertAudioPlan(exportInserts, estimatedTotalDuration),
            ...buildSectionAudioPlan(introSec, outroSec, introDuration, estimatedTotalDuration),
          ];
          const offlineInsertMixer = new InsertAudioMixer(offlineCtx, offlineMusicAnalyser);
          await offlineInsertMixer.load(insertPlans);
          // Placed on the timeline up front, to the sample, so the render does
          // not have to stop once per frame to ask whether a sound is due.
          offlineInsertMixer.scheduleAll();

          /* The soundtrack of any clip attached to a scene.
             Seeking a video element to draw it makes no noise, so without this
             the exported file had no original sound at all. It rides the music bus,
             which means narration ducks it automatically in "automatic"
             mastering, and a scene whose creator chose "remove the sound"
             produces no plan and therefore no track in the file. */
          renderTimer.stage("clip soundtracks");
          const clipAudioCache = new Map<number, AudioBuffer | null>();
          for (const entry of sceneSchedule) {
            const plan = clipAudioPlanFor(entry.scene, entry.startTime, entry.duration);
            if (!plan) continue;
            if (!clipAudioCache.has(entry.scene.id)) {
              clipAudioCache.set(entry.scene.id, await loadClipAudio(entry.scene.video_url, offlineCtx));
            }
            const track = clipAudioCache.get(entry.scene.id);
            if (!track) {
              setClipAudioNotice(
                `"${entry.scene.video_name || "The uploaded video"}" has no soundtrack this browser can read, so the export is silent over it.`
              );
              continue;
            }
            /* No source list to keep here: an offline context runs to
               completion on its own, and cancelling the render abandons the
               whole context rather than stopping individual tracks. */
            scheduleClipAudio(offlineCtx, track, plan, offlineMusicAnalyser, 0);
          }

          // One packed allocation replaces tens of thousands of retained
          // AudioFrame objects/ArrayBuffers on a long render. Scratch arrays
          // are reused at every suspension point and copied into a fixed row.
          const telemetry = new PackedAudioTelemetry(
            totalFrames,
            voiceAnalyser.frequencyBinCount,
            voiceAnalyser.fftSize,
          );
          setRenderHealth((health) => ({ ...health, telemetryBytes: telemetry.byteLength }));
          const voiceFreq = new Uint8Array(voiceAnalyser.frequencyBinCount);
          const voiceWave = new Uint8Array(voiceAnalyser.fftSize);
          const musicFreq = new Uint8Array(offlineMusicAnalyser.frequencyBinCount);
          const musicWave = new Uint8Array(offlineMusicAnalyser.fftSize);
          const readLevel = (
            node: AnalyserNode,
            freq: Uint8Array<ArrayBuffer>,
            wave: Uint8Array<ArrayBuffer>,
          ) => {
            node.getByteFrequencyData(freq);
            node.getByteTimeDomainData(wave);
            let sum = 0;
            for (let n = 0; n < freq.length; n++) sum += freq[n];
            return sum / Math.max(1, freq.length * 255);
          };

          /**
           * Register a small look-ahead window of suspension points. A purely
           * sequential suspend can lose a race with the very fast offline
           * audio thread; registering all 27,000 points up front avoids that
           * race but retains 27,000 promises. At the last suspended frame of
           * each window the next window is registered *before* resume(), so
           * the renderer can never pass it and only a few seconds of promises
           * are live at once.
           */
          const captureTelemetry = () => new Promise<void>((resolve, reject) => {
            const WINDOW_FRAMES = Math.max(30, Math.round(fpsUsed * 4));
            const STRIDE = TELEMETRY_SAMPLE_STRIDE;
            let settled = false;
            const fail = (error: unknown) => {
              if (settled) return;
              settled = true;
              reject(error);
            };
            /** The last frame this window suspends at (every STRIDE-th frame). */
            const lastSampleIn = (start: number, end: number) =>
              start + Math.floor((end - 1 - start) / STRIDE) * STRIDE;
            /**
             * The mix is the longest silent phase of a long render: fifteen
             * minutes of soundtrack through the mastering chain, sampled for
             * visualisers every third frame. It reports where it has reached,
             * because it really is advancing — and that is what tells the
             * stall watchdog a slow mix on a slow machine is still work, not a
             * hang. Nothing else about the mix or its quality changes.
             */
            let lastMixReportAt = 0;
            const reportMixProgress = (frame: number) => {
              const now = performance.now();
              if (frame < totalFrames - 1 && now - lastMixReportAt < 250) return;
              lastMixReportAt = now;
              const fraction = Math.min(1, (frame + 1) / Math.max(1, totalFrames));
              reportProgress(0.32 + fraction * 0.03);
              reportStage(
                `3/4: Rendering the sample-exact audio mix (${Math.round(fraction * 100)}% of ${formatDuration(estimatedTotalDuration)})…`,
              );
            };
            const scheduleWindow = (start: number) => {
              const end = Math.min(totalFrames, start + WINDOW_FRAMES);
              const lastSample = lastSampleIn(start, end);
              for (let frame = start; frame <= lastSample; frame += STRIDE) {
                offlineCtx.suspend(frame / fpsUsed).then(async () => {
                  if (abortControllerRef.current) throw new Error("Render cancelled");
                  const voiceLevel = readLevel(voiceAnalyser, voiceFreq, voiceWave);
                  const musicLevel = readLevel(offlineMusicAnalyser, musicFreq, musicWave);
                  /* One sample covers the frames it stands for: three times
                     fewer suspend/resume round trips on the main thread, and
                     every frame still has its row. */
                  telemetry.setAnalyserSpan(
                    frame,
                    frame + STRIDE,
                    voiceLevel,
                    voiceFreq,
                    voiceWave,
                    musicLevel,
                    musicFreq,
                    musicWave,
                  );
                  offlineMastering.updateVoiceLevel(voiceLevel, offlineCtx.currentTime);
                  reportMixProgress(frame);

                  // Extend the runway while the context is safely suspended.
                  if (frame === lastSample && end < totalFrames) scheduleWindow(end);
                  await offlineCtx.resume();
                  if (end >= totalFrames && frame === lastSample && !settled) {
                    settled = true;
                    resolve();
                  }
                }).catch(fail);
              }
            };
            if (totalFrames <= 1) {
              settled = true;
              resolve();
            } else {
              scheduleWindow(1);
            }
          });
          // The first look-ahead window is registered synchronously before
          // startRendering begins.
          renderTimer.stage("audio render + telemetry");
          const telemetryCapture = captureTelemetry();
          const rendering = offlineCtx.startRendering();
          /**
           * Bounded, because OfflineAudioContext cannot be cancelled once it
           * has started and a wedged one would otherwise report nothing for
           * ever. The budget scales with the video (fifteen minutes of
           * soundtrack is not a ten-second job), and the ticker keeps the
           * stall watchdog calm for exactly as long as this deadline owns it.
           */
          const [mixedAudio] = await withProgressTicker(
            "3/4: Rendering the sample-exact audio mix",
            () =>
              withTimeout(
                Promise.all([rendering, telemetryCapture]),
                audioMixTimeoutMs(estimatedTotalDuration),
                "the sample-exact audio mix finished",
              ),
            (text) => {
              setRenderStage(text);
              setRenderStatus({ stage: text });
            },
            {
              // The mix publishes its own percentage as it advances; the
              // ticker only steps in when that goes quiet, so the two texts do
              // not fight over the stage line.
              tickMs: 3000,
              heartbeat: () => { renderHeartbeatRef.current = Date.now(); },
            },
          );
          if (abortControllerRef.current) throw new Error("Render cancelled");

          renderTimer.stage("video frames");
          const encodeBudget = createFrameBudget();
          /**
           * Watches the picture the encoder is actually given, so "the motion
           * is stop-and-go" can be answered with a number instead of a guess:
           * how many sampled frames repeated the one before them, and for how
           * long the picture was held.
           */
          const motionWatch = new FrameMotionAudit(fpsUsed);
          /**
           * A project whose scenes are deliberately still is not a stuttering
           * render, so the motion check only raises a flag when the timeline
           * actually asked the camera to move.
           */
          const motionExpected = scenesWithImages.some(
            (scene, index) =>
              (resolveSceneCameraMotion(scene, exportSceneAnimation, motionForStyle(exportMotionStyle, index)) ?? "none") !== "none",
          );
          let assetScene = -1;
          let lastOfflineProgressAt = 0;
          for (let frame = 0; frame < totalFrames; frame++) {
            if (abortControllerRef.current) throw new Error("Render cancelled");
            const time = frame / fpsUsed;
            const nextAssetScene = sceneIndexAt(time);
            if (nextAssetScene !== assetScene) {
              await ensureVisualWindow(nextAssetScene);
              assetScene = nextAssetScene;
            }
            let active = sceneSchedule[sceneSchedule.length - 1];
            for (const entry of sceneSchedule) {
              if (time >= entry.startTime && time < entry.endTime) { active = entry; break; }
              if (time < entry.startTime) { active = entry; break; }
            }
            if (active && sceneHasClip(active.scene) && time >= active.startTime && time < active.endTime) {
              const elapsed = Math.max(0, time - active.startTime);
              await clipPool.seekExact(active.scene, Math.min(1, elapsed / Math.max(0.1, active.duration)), active.duration);
            }
            /* Interpolated, not held: a row is stored once every few frames
               to keep memory bounded, but every frame gets its own analyser
               value so audio-reactive visuals move continuously. */
            drawFrameAt(time, telemetry.frameSmooth(frame, TELEMETRY_SAMPLE_STRIDE));
            motionWatch.sample(frame, canvas);
            await offlineEncoder.encodeCanvas(canvas, frame);
            const progressNow = performance.now();
            if (frame === totalFrames - 1 || progressNow - lastOfflineProgressAt >= 250) {
              lastOfflineProgressAt = progressNow;
              const progress = 0.35 + ((frame + 1) / totalFrames) * 0.5;
              reportProgress(Math.min(0.85, progress));
              reportStage(`3/4: Encoding frame ${frame + 1} of ${totalFrames} (frame-exact)…`);
              const stats = offlineEncoder.getExportStats();
              setRenderHealth((health) => ({
                ...health,
                framesDone: frame + 1,
                outputBytes: offlineEncoder!.bytesWritten,
                queuedOutputBytes: offlineEncoder!.queuedOutputBytes,
                offCadenceFrames: stats.offCadenceFrames,
                motionCheck: motionWatch.report.summary,
              }));
            }
            // Hand the browser a turn on a time budget rather than every
            // fourth frame, and through a message rather than a timer —
            // timers are clamped to a second once the tab is in the
            // background, which is what made a long render crawl the moment
            // you looked at something else.
            await encodeBudget.maybeYield();
          }

          /**
           * Everything past this point used to sit behind a single 94% and a
           * frozen window: the soundtrack was encoded in one unbroken loop,
           * then the container was assembled in another. On a nine-minute
           * video that is a long time to look at a bar that is not moving,
           * and long enough to look like a crash. Both now yield, and both
           * report where they are.
           */
          renderTimer.stage("audio encode");
          reportStage("4/4: Encoding sample-exact audio…");
          reportProgress(0.86);
          // Natural packet framing (1024 frames for AAC, a 20 ms packet for
          // Opus) is chosen inside the exporter from the configured codec, so
          // the platform encoder never has to re-buffer arbitrary chunks.
          await offlineEncoder.encodeAudio(mixedAudio, undefined, (fraction) => {
            reportProgress(0.86 + fraction * 0.08);
          });
          setRenderHealth((health) => ({
            ...health,
            outputBytes: offlineEncoder!.bytesWritten,
            queuedOutputBytes: offlineEncoder!.queuedOutputBytes,
          }));

          renderTimer.stage("finalise container");
          reportStage("4/4: Finalising the container…");
          reportProgress(0.95);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          /**
           * Everything from here to the Vault is browser-internal work with no
           * visible output: the encoder's own flush, the disk drain, the index
           * write and the hand-over as a File. It is also exactly where the
           * reported failure happened — every frame done, then nothing.
           * The ticker proves the tab is still alive, and the exporter's own
           * deadlines turn a real stall into a named error instead of a
           * percentage that never moves again.
           */
          const offlineBlob = await withProgressTicker(
            "4/4: Finalising the container…",
            () => offlineEncoder!.finalize(),
            (text) => {
              setRenderStage(text);
              setRenderStatus({ stage: text });
            },
            // Every wait inside finalize() has its own deadline (encoder
            // flush, disk drain, hand-over), so this phase is bounded and may
            // keep the watchdog calm while it runs.
            { heartbeat: () => { renderHeartbeatRef.current = Date.now(); } },
          );
          setRenderHealth((health) => ({
            ...health,
            framesDone: totalFrames,
            outputBytes: offlineBlob.size,
            queuedOutputBytes: 0,
          }));
          renderTimer.stop();
          renderTimer.note(
            "video",
            `${Math.round(estimatedTotalDuration)}s at ${fpsUsed}fps (${totalFrames} frames), ${offlineConfig.width}x${offlineConfig.height}`
          );
          renderTimer.note(
            "file",
            `${(offlineBlob.size / 1_048_576).toFixed(0)} MB ${offlineContainer.toUpperCase()}`
          );
          renderTimer.note("output storage", offlineEncoder.outputStorageDetail);
          renderTimer.note("audio telemetry", `${(telemetry.byteLength / 1_048_576).toFixed(1)} MB packed`);
          renderTimer.note("visual assets", "bounded 3-scene decode window");
          const exportStats = offlineEncoder.getExportStats();
          renderTimer.note("verified output", `${exportStats.codedWidth}x${exportStats.codedHeight} · ${exportStats.effectiveFps}fps`);
          renderTimer.note(
            "frame cadence",
            exportStats.offCadenceFrames === 0
              ? `every one of ${exportStats.encodedVideoChunks} frames arrived on its own tick (no jitter)`
              : `${exportStats.offCadenceFrames} of ${exportStats.encodedVideoChunks} frames arrived off-tick`,
          );
          renderTimer.note(
            "audio continuity",
            exportStats.audioPacketGaps === 0 && exportStats.audioPacketOverlaps === 0
              ? `all ${exportStats.encodedAudioChunks} audio packets are gapless (no dropouts)`
              : `${exportStats.audioPacketGaps} gap(s), ${exportStats.audioPacketOverlaps} overlap(s); widest ${Math.round(exportStats.audioMaxContinuityGapUs / 1000)}ms`,
          );
          renderTimer.note(
            "motion",
            motionExpected
              ? motionWatch.verdict.detail
              : `${motionWatch.report.summary} (this project asks for still pictures, so a held frame is intended)`,
          );
          if (exportStats.reorderedChunks > 0) {
            renderTimer.note(
              "frame order",
              exportStats.signedOffsetsPatched
                ? `the encoder reordered ${exportStats.reorderedChunks} frames (B-frames); the index was written signed so every frame presents on time`
                : `the encoder reordered ${exportStats.reorderedChunks} frames (B-frames), handled by the index`,
            );
          }

          /**
           * Read the finished file back before it is called finished.
           *
           * This is the step that answers "is it really an MP4, with every
           * frame, at a constant frame rate?" from the bytes themselves. A
           * structure that a player cannot use is a failed render — not a file
           * handed over with a warning — because the customer's next stop is a
           * video editor, not this screen.
           */
          reportStage("4/4: Reading the finished file back…");
          setMotionAudit(motionWatch.report);
          if (offlineContainer === "mp4") {
            // This byte-level parser understands ISO-BMFF/MP4 only. Running it
            // on WebM reports "not an MP4" by design; treating that as a
            // structural failure used to throw away every valid WebM render
            // after encoding had completed, leaving the Vault with nothing to
            // download. WebM is checked by the browser probe and the common
            // post-encode validator below instead.
            const audit = await auditFinishedMp4(offlineBlob, {
              width: offlineConfig.width,
              height: offlineConfig.height,
              fps: fpsUsed,
              frames: totalFrames,
              durationSec: estimatedTotalDuration,
              container: "mp4",
              requireAudio: false,
            });
            setOutputAudit(audit);
            renderTimer.note("container audit", audit.ok ? audit.summary : audit.problems.join(" · "));
            const structural = !audit.isMp4
              || !audit.video
              || audit.video.sampleCount !== totalFrames
              || audit.video.zeroSizeSamples > 0;
            if (structural) {
              throw new Error(
                `The finished MP4 failed its own check: ${audit.problems.join(" ")}`,
              );
            }
          } else {
            setOutputAudit(null);
            renderTimer.note("container audit", "WebM uses the browser metadata and export validation checks");
          }

          const timingReport = renderTimer.format();
          console.log(timingReport);
          setRenderTiming(timingReport);
          reportProgress(0.98);
          offlineMastering.dispose();
          offlineEcho?.dispose();
          offlineInsertMixer.dispose();
          setRenderEngine("frame-exact");
          setOfflineFailureReason(null);
          const finished = await finishSuccessfulExport(
            offlineBlob,
            offlineContainer,
            offlineBlob.type,
            "frame-exact",
            exportStats
          );
          if (finished.durableVaultCopy) {
            await offlineEncoder.releaseOutputStorage();
          }
          return { blob: finished.blob, container: finished.container };
        } catch (offlineError) {
          offlineEncoder?.close();
          if (abortControllerRef.current) throw offlineError;
          const reason = offlineError instanceof Error
            ? `${offlineError.name}: ${offlineError.message}`
            : String(offlineError);
          setOfflineFailureReason(reason);
          console.error("Frame-exact offline export failed:", offlineError);
          /**
           * There is no fallback, on purpose.
           *
           * A deadline that expired is not a codec mismatch, and the old answer
           * to both was a silent re-encode in real time. That takes as long as
           * the video is and produces exactly the uneven motion the frame-exact
           * renderer exists to avoid, so a failed render now says what failed —
           * by name — and leaves the Render button ready to try again.
           */
          throw new Error(`Frame-exact export failed. ${reason}`);
        }
    } catch (err: any) {
      const message = err?.message || "Failed to render video";
      // The stall watchdog already explained this job and handed the screen
      // back; a late rejection from the render it gave up on must not clear
      // the message the creator is reading — or the status of the render they
      // started to replace it.
      if (abandonedRenderTokensRef.current.has(renderToken)) return null;
      if (abortControllerRef.current || message === "Render cancelled" || err instanceof RenderCancelledError) {
        setRenderError(null);
        setFailureReport(null);
        setRenderStatus({ active: false, progress: 0, stage: "Render cancelled", error: null });
        return null;
      }
      // Never show a bare "Rendering failed" — and never the encoder's own
      // words either. The failure is translated into plain sentences plus a
      // short support code, and an automatic retry is offered.
      const report = describeRenderFailure(String(err?.stack || message));
      lastRenderErrorRef.current = report.title;
      // The screen shows the plain sentences and the support code; the raw
      // encoder log goes here, where support can read it and the customer
      // never has to.
      console.error(`Render failed [${report.code}] ${report.title}`, report.technical);
      setFailureReport(report);
      setRenderError(message);
      setRenderStatus({ active: false, error: message, stage: "Render failed" });
      return null;
    } finally {
      // Always released: the render authorisation is over, success or not.
      // Both of these are bounded: this block is what re-enables the Render
      // button, and a server that stops answering must never leave the screen
      // stuck on "Rendering…" after the file is already finished.
      if (exportReservationId) {
        try {
          await withTimeout(cancelFinalExport(exportReservationId), 10_000, "the render authorisation was released");
        } catch (cleanupError) { console.warn("Could not release the render authorisation:", cleanupError); }
      }
      try {
        await withTimeout(releaseWakeLock(), 10_000, "the screen wake lock was released");
      } catch (cleanupError) { console.warn("Could not release the render wake lock:", cleanupError); }
      setRenderHealth((health) => ({
        ...health,
        elapsedMs: health.startedAt ? Date.now() - health.startedAt : health.elapsedMs,
        wakeLock: "released",
      }));
      /**
       * Tear down THIS render's resources, never the next render's.
       *
       * The watchdog can end a stuck render and the creator can start another
       * one immediately; the abandoned render's cleanup then finishes minutes
       * later, while the new one is already running. Every shared ref is
       * therefore checked before it is cleared, and the heavy objects are the
       * ones this closure created (`clipPool`, `renderAudioContext`), so
       * releasing them cannot pull a decoder out from under the live render.
       */
      // Belt and braces: the loop stops its own ticker on cleanup, but an
      // exception between start and cleanup must not leave it ticking.
      try {
        if (frameTickerRef.current && frameTickerOwnerRef.current === renderToken) {
          frameTickerRef.current.stop();
          frameTickerRef.current = null;
          frameTickerOwnerRef.current = 0;
        }
      } catch {}
      // Release every clip decoder used by THIS export.
      try {
        renderClipPool?.dispose();
        if (clipPoolRef.current === renderClipPool) clipPoolRef.current = null;
        renderClipPool = null;
      } catch {}
      try {
        if (renderAudioContext && renderAudioContext.state !== "closed") {
          await withTimeout(renderAudioContext.close(), 10_000, "the render audio engine was shut down");
        }
      } catch {}
      const thisRenderIsCurrent = renderTokenRef.current === renderToken;
      if (!thisRenderIsCurrent) abandonedRenderTokensRef.current.delete(renderToken);
      if (thisRenderIsCurrent) {
        renderAudioContext = null;
        activeExporterRef.current = null;
        // Keep the cancel state and start lock until *all* asynchronous
        // cleanup has settled, so a second render cannot inherit old audio or
        // wake-lock work.
        renderStartPendingRef.current = false;
        setIsPreparingRender(false);
        setIsRendering(false);
        setIsCancelling(false);
      }
    }
  };

  // ------ DOWNLOAD HANDLERS ------
  // Automatic useful filenames from the Master Render Profile:
  // ProjectName_YouTube_1080p_30fps.mp4 — the middle token is the
  // destination chosen in Project Setup ("Master" for custom output).
  // No spaces or problem characters, ever.
  const renderFileName = (title: string, ext: string, targetLabel?: string) => {
    const d = getDimensions(settings.resolution);
    const token = targetLabel || destinationFileToken(renderProfile.destination);
    return buildRenderFilename(title || "Scenering_Video", token, d.width, d.height, effectiveFps, ext);
  };

  /**
   * Saves a finished video to the user's computer.
   *
   * The File System Access API is tried first (a real "Save as…" dialog — the
   * only path that cannot be silently swallowed when the app runs inside an
   * iframe), then the classic download. On success the vault slot is freed,
   * which is exactly how the vault is meant to work: it only holds what has
   * not been downloaded yet.
   */
  const saveRenderBlob = async (blob: Blob, filename: string, vaultId: string | null) => {
    if (vaultId) setVaultBusyId(vaultId);
    setVaultMessage("Opening the save dialog…");
    const outcome = await saveBlobToDisk(blob, filename);
    if (vaultId) setVaultBusyId(null);

    if (outcome === "cancelled") {
      setVaultMessage("Save cancelled — the video is still safe in the vault.");
      return;
    }
    if (outcome === "failed") {
      setVaultMessage("The browser refused the download. Try the Download button again.");
      return;
    }
    setVaultMessage(`Saved ${filename} — vault slot cleared.`);
    if (vaultId) {
      await deleteVaultRender(vaultId);
      DOWNLOADS_COUNTED_NOT_SAVED.delete(vaultId);
    }
    if (job.lastVaultId && job.lastVaultId === vaultId) setRenderStatus({ lastVaultId: null });
    void refreshVault();
  };

  /**
   * Download a row that is waiting in the vault — the ONE place a finished
   * video is downloaded. Every download counts against the plan: the server
   * records it first (recordVideoDownload) and the file is saved only after
   * the server says yes. When the allowance is used up the server says no,
   * nothing is saved, and the video stays in the vault. A counted download
   * whose save was cancelled or refused can be retried without counting
   * again (DOWNLOADS_COUNTED_NOT_SAVED); a successful save frees the slot.
   */
  const downloadVaultRender = async (row: VaultRender) => {
    if (vaultDownloadInFlightRef.current) return;
    vaultDownloadInFlightRef.current = true;
    setVaultError("");
    try {
      if (!DOWNLOADS_COUNTED_NOT_SAVED.has(row.id)) {
        setVaultBusyId(row.id);
        try {
          await recordVideoDownload(row.projectId ?? null, Math.max(1, Number(row.durationSec) || 0) / 60, row.reservationId ?? null);
        } catch (err) {
          setVaultBusyId(null);
          setVaultMessage("");
          setVaultError(err instanceof Error ? err.message : "This download could not be counted, so it was not started.");
          return;
        }
        DOWNLOADS_COUNTED_NOT_SAVED.add(row.id);
      }
      // The extension ALWAYS matches the container that was really recorded.
      const ext = row.mimeType.includes("mp4") ? "mp4" : "webm";
      await saveRenderBlob(row.blob, renderFileName(row.title, ext), row.id);
    } finally {
      vaultDownloadInFlightRef.current = false;
    }
  };

  const removeVaultRender = async (row: VaultRender) => {
    if (vaultPreviewId === row.id) setVaultPreviewId(null);
    await deleteVaultRender(row.id);
    DOWNLOADS_COUNTED_NOT_SAVED.delete(row.id);
    setVaultMessage(`Removed “${row.title}” from the vault.`);
    void refreshVault();
  };

  const getAttributionText = () => {
    const soundUrlsUsed = inserts
      .map((ins) => ins.audioSettings?.soundUrl)
      .filter((u): u is string => Boolean(u));

    const currentVoice = availableVoices?.find((v) => v.id === selectedVoice);
    const voiceDisplay = currentVoice ? currentVoice.name : (selectedVoice || "Speechify narrator");
    const isCustomImport = selectedVoice?.startsWith("custom:") || selectedVoice?.startsWith("import:");
    const isSpeechifyStyle = Boolean(currentVoice?.id.startsWith("speechify_"));
    const voiceGender = currentVoice?.gender === "male"
      ? "Male Narrator"
      : currentVoice?.gender === "female"
        ? "Female Narrator"
        : "Narrator";

    // Only the image sources this project's scenes actually use are credited;
    // anything unused stays out of the document.
    const usedImageSources = new Set<string>();
    for (const s of scenes) {
      const url = resolveLegacyLocalImage((s.image_url || "").trim());
      if (!url) continue;
      // `custom-image:` is an upload from this device, same as data:/blob:.
      if (/^data:|^blob:|^custom-image:/i.test(url)) usedImageSources.add("Creator's own uploaded imagery");
      else if (url.includes("images.unsplash.com")) usedImageSources.add("Unsplash (Unsplash License)");
      else if (url.includes("pexels.com")) usedImageSources.add("Pexels (CC0 / Free License)");
      else if (url.includes("pixabay")) usedImageSources.add("Pixabay (Content License)");
      else if (url.includes("wikimedia.org")) usedImageSources.add("Wikimedia Commons (Creative Commons)");
      else if (/^https?:/i.test(url)) usedImageSources.add("Third-party image URL (credited to its source)");
    }

    // Only the 3D stickers actually placed on the timeline are credited.
    const usedGraphics = new Set<string>();
    for (const ins of inserts) {
      if (ins.category !== "stickers") continue;
      const stickerId = ins.visualOptions?.stickerId || ins.type;
      usedGraphics.add(STICKER_LIBRARY.find((st) => st.id === stickerId)?.name || ins.title);
    }

    // The bed chosen in the Voiceover step is the music that is actually in
    // the finished file, so that is what the credits document has to name.
    // Most of the library is Creative Commons BY, where crediting the track is
    // a condition of the licence — leaving it out of the document would leave
    // the creator publishing without the attribution they owe.
    let timelineMusicUrl: string | undefined;
    for (const ins of inserts) {
      if (ins.category === "background_music" && ins.audioSettings?.soundUrl) {
        timelineMusicUrl = ins.audioSettings.soundUrl;
      }
    }

    return generateAttributionDocument({
      projectTitle: project?.title || "My Video Project",
      soundsUsed: soundUrlsUsed,
      includeBackgroundMusic: Boolean(timelineMusicUrl) || settings.backgroundMusic !== "none",
      // report the REAL track used for the chosen style in the credits doc
      musicType:
        timelineMusicUrl || AMBIENT_STYLE_TO_TRACK[settings.backgroundMusic] || settings.backgroundMusic,
      imageSources: [...usedImageSources],
      graphicsUsed: [...usedGraphics],
      voiceName: voiceDisplay,
      voiceGender: isCustomImport ? "User Prepared Voice" : voiceGender,
      voiceAccent: isCustomImport
        ? "Custom Imported Audio File"
        : currentVoice?.accent || currentVoice?.locale || (isSpeechifyStyle ? "Scenering style profile" : "Speechify voice"),
      voiceEngine: isCustomImport
        ? "User-Prepared Audio File (Imported Track)"
        : isSpeechifyStyle
          ? "Speechify text-to-speech — customer-provided API key, Scenering style profile"
          : "Speechify text-to-speech — customer-provided API key",
    });
  };

  const copyAttributionDoc = async () => {
    const text = getAttributionText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAttribution(true);
      setTimeout(() => setCopiedAttribution(false), 3000);
    } catch (err) {
      console.error("Clipboard copy error:", err);
    }
  };

  const downloadAttributionDoc = () => {
    const text = getAttributionText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (project?.title || "video").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${safeTitle}_attribution_credits.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  /**
   * Puts the timing report on the clipboard. One button beats asking anyone
   * to open developer tools and copy a line out of a console.
   */
  const copyTimingReport = async () => {
    if (!renderTiming) return;
    try {
      await navigator.clipboard.writeText(renderTiming);
      setTimingCopied(true);
      window.setTimeout(() => setTimingCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; selecting the text by hand still works.
      setTimingCopied(false);
    }
  };

  const cancelRender = () => {
    if (!isRendering || isCancelling) return;
    abortControllerRef.current = true;
    // The frame loop only reads that flag between frames. Once the frames are
    // all in, the render is inside the encoder flush or a disk drain, so
    // Cancel has to reach the exporter itself or the button does nothing at
    // exactly the moment it is most needed.
    activeExporterRef.current?.abort();
    setIsCancelling(true);
    reportStage("Stopping render…");
  };

  const toggleRender = () => {
    if (isRendering) cancelRender();
    else if (!isPreparingRender) void handleStartRender();
  };

  // ==================== MASTER RENDER PROFILE ==========================

  /** The 4-step resolution ladder value behind the current setting. */
  const ladderResolution: ResolutionType =
    settings.resolution === "720p" || settings.resolution === "2k" || settings.resolution === "4k"
      ? settings.resolution
      : "1080p";

  /** The Master Render Profile with this screen's live choices applied —
   *  the single source every encode (and every platform child) inherits. */
  const masterProfile = useMemo(
    () => ({
      ...MASTER_RENDER_PROFILE,
      container: settings.format,
      frameRate: settings.fps,
      // Platform exports are always final quality — Draft is only the
      // fast preview path of the main render button.
      quality: (settings.quality === "draft" ? "standard" : settings.quality) as EncodingQuality,
      audioMastering: settings.audioMastering,
    }),
    [settings.format, settings.fps, settings.quality, settings.audioMastering]
  );

  /** Advanced-panel numbers for the CURRENT single render. */
  const currentDims = getDimensions(settings.quality === "draft" ? "720p" : settings.resolution);
  const currentVideoKbps = computeVideoBitrateKbps(currentDims.width, currentDims.height, effectiveFps, settings.quality);
  const currentAudioKbps = computeAudioBitrateKbps(settings.quality);
  const estSizeMB = estimateFileSizeMB(currentVideoKbps, currentAudioKbps, totalDuration);
  const currentFrames = totalFrameCount(totalDuration, effectiveFps);
  /** Non-default choices that could reduce platform compatibility — the
   *  advanced panel warns before the user commits to them. */
  const compatibilityWarnings: string[] = [];
  if (settings.format === "webm") compatibilityWarnings.push("WebM (VP9/Opus) is not accepted natively by TikTok or Instagram — MP4 (H.264/AAC) is the platform standard.");
  if (effectiveFps > 30) compatibilityWarnings.push(`${effectiveFps} fps doubles the encode work for footage that is mostly still imagery — 30 fps is the recommended setting.`);
  if (effectiveFps === 24 || effectiveFps === 25) compatibilityWarnings.push(`${effectiveFps} fps is a film/broadcast rate; social platforms accept it, but 30 fps is their native cadence.`);

  /**
   * The compatibility report for the ONE destination chosen in Project
   * Setup ("custom" has no platform rules to check). Read-only — if the
   * user wants a different destination they go back to Setup, pick it, and
   * render again; the previous video stays in the Vault.
   */
  const destinationCheck = useMemo(() => {
    if (renderProfile.destination === "custom") return null;
    const platform = getPlatformProfile(renderProfile.destination);
    if (!platform) return null;
    return checkPlatformCompatibility(masterProfile, platform, aspectRatio || "16:9", totalDuration, ladderResolution);
  }, [renderProfile.destination, masterProfile, aspectRatio, totalDuration, ladderResolution]);

  /**
   * §23 Automatic fallback: identify what to relax, retry with a compatible
   * Scenering profile, preserve as much quality as possible — and report
   * exactly what changed. Never a silent downgrade.
   */
  const retryWithFallback = () => {
    if (isRendering) return;
    const fallback = buildCompatibilityFallback(
      {
        format: settings.format,
        fps: settings.fps,
        quality: settings.quality,
        resolution: ladderResolution,
      },
      failureReport || undefined
    );
    // The changes are logged, not listed on screen: the customer gets one
    // plain sentence in the UI, support gets the specifics.
    console.info("Automatic retry — what changed:", fallback.changes);
    setFallbackNotes(fallback.changes);
    setFailureReport(null);
    setRenderError(null);
    setSettings((s) => ({
      ...s,
      format: fallback.patch.format,
      fps: fallback.patch.fps,
      quality: fallback.patch.quality,
      ...(fallback.patch.resolution ? { resolution: fallback.patch.resolution } : {}),
    }));
    // Run with an explicit plan so the retry uses the fallback values NOW —
    // not the pre-update settings still captured in this closure.
    const retryMaster = {
      ...masterProfile,
      container: fallback.patch.format,
      frameRate: fallback.patch.fps,
      quality: fallback.patch.quality,
    };
    const retryRes = fallback.patch.resolution || ladderResolution;
    const plan = resolveRenderPlan(retryMaster, aspectRatio || "16:9", retryRes);
    void handleStartRender(undefined, { ...plan, label: "Automatic retry" });
  };

  const { width: renderW, height: renderH, label: resLabel, aspectClass } = getDimensions(settings.resolution);

  const getPhaseStep = (phase: ProjectPhase): EditorStep =>
    (PROJECT_PHASES.find((p) => p.id === phase)?.editorStep || "scenes") as EditorStep;

  // ---- Read-only summary values (the results of the setup choices) ----
  const MOTION_LABELS: Record<string, string> = {
    dynamic: "Dynamic Variety",
    ken_burns: "Documentary Ken Burns",
    slow_zoom: "Slow Cinematic Zoom",
    zoom_in: "Cinematic Zoom In",
    zoom_out: "Dramatic Zoom Out",
    pan_left: "Smooth Camera Pan (left)",
    pan_right: "Smooth Camera Pan (right)",
    pan: "Smooth Camera Pan",
    subtle_camera: "Subtle Camera Drift",
    shake: "Handheld Shake",
    pulse: "Heartbeat Pulse",
    floating: "Weightless Float",
    none: "Static (no motion)",
  };
  const voiceDisplayName =
    availableVoices.find((v) => v.id === selectedVoice)?.name || selectedVoice || "Studio AI Voice";

  const insertHasSound = (ins: TimelineInsert) =>
    Boolean(ins.audioSettings?.soundUrl || ins.content?.soundUrl);

  const musicInserts = inserts.filter(
    (ins) => ins.category === "background_music" && insertHasSound(ins)
  );
  const musicSummary =
    musicInserts.length === 0
      ? {
          value: "None added",
          hint: "Add music in Voiceover → Background Music (formerly in Video Studio)",
        }
      : {
          value: musicInserts.map((i) => i.title || i.audioSettings?.soundName || "Music track").join(", "),
          hint:
            musicInserts.length === 1
              ? `${Math.round((musicInserts[0].audioSettings?.volume ?? 0.5) * 100)}% volume${
                  musicInserts[0].audioSettings?.loop ? " · loops to the end" : ""
                }`
              : `${musicInserts.length} tracks`,
        };
  const soundEffectCount = inserts.filter(
    (ins) => ins.category === "sound_effects" && insertHasSound(ins)
  ).length;

  return (
    <div className="space-y-3 sm:space-y-6 max-w-5xl 2xl:max-w-7xl mx-auto pb-12 animate-fade-in px-1 sm:px-0">
      {/* Top Banner & Summary */}
      <div className="bg-gray-800/60 border border-hairline rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
                Step 3 of 3
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Icon glyph="🎬" /> Render & Export Video
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Project: <span className="text-white font-medium">{project?.title || "Untitled Video"}</span> · {scenesWithImages.length} scenes · ~{formatDuration(totalDuration)} duration
            </p>
          </div>

        </div>

        {/* Single Previous control for the final phase (nothing here can be changed) */}
        <div className="mt-4">
          <StepNav
            current="render"
            onNavigate={(phase) => {
              if (onNavigatePhase) onNavigatePhase(phase);
              else if (phase === "studio" && onBack) onBack();
              else if (onNavigateToStep) onNavigateToStep(getPhaseStep(phase));
            }}
            note="read-only results — edit in earlier phases"
          />
        </div>
      </div>

      {/* Main Grid: read-only summary on the left, render engine / preview on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: READ-ONLY summary of the choices made on the Project Setup screen */}
        <div className="order-2 lg:order-1 lg:col-span-4 space-y-4">
          <div className="bg-gray-800/50 border border-hairline rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-hairline pb-2 gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Icon glyph="📋" /> Your Choices
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900 border border-hairline text-gray-400 font-semibold shrink-0">
                Read-only
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              These are the results of your project setup. This screen only shows and renders them — nothing
              here can change your video.
            </p>

            <dl className="space-y-2.5 pt-1 border-t border-hairline">
              <SummaryRow icon="🏷️" label="Project" value={project?.title || "Untitled Video"} />
              <SummaryRow
                icon="🎞️"
                label="Story"
                value={`${scenesWithImages.length} scene${scenesWithImages.length === 1 ? "" : "s"} · ~${formatDuration(totalDuration)}`}
                hint={`${formatDuration(sceneDuration)} target per scene`}
              />
              <SummaryRow
                icon="📐"
                label="Canvas"
                value={aspectRatio}
                hint={aspectRatio === "16:9" ? "Landscape" : aspectRatio === "9:16" ? "Vertical" : aspectRatio === "1:1" ? "Square" : "Classic"}
              />
              <SummaryRow
                icon="📺"
                label="Output"
                value={resLabel}
                hint={`${renderedContainer.toUpperCase()} · ${effectiveFps} fps CFR · ${getQualityLevel(settings.quality).name} quality`}
              />
              <SummaryRow
                icon="⚡"
                label="Frame rate"
                value={`${effectiveFps} FPS · Constant`}
                hint={settings.fps === "auto" ? "Auto — Scenering chose 30" : "Change under Advanced Render Settings"}
              />
              <SummaryRow
                icon="🎥"
                label="Camera motion"
                value={sceneAnimationEnabled ? "Per-scene animation controls" : (MOTION_LABELS[motionStyle] || motionStyle)}
                hint={sceneAnimationEnabled ? "Scene Animation Effects ON" : undefined}
              />
              <SummaryRow
                icon="🎙️"
                label="Voiceover"
                value={voiceDisplayName}
                hint="Speechify voice"
              />
              <SummaryRow
                icon="🔊"
                label="Voice echo"
                value={describeVoiceEcho(voiceEcho)}
                hint={voiceEchoIsActive(voiceEcho) ? "Written into the video" : "Dry narration"}
              />
              <SummaryRow
                icon="💬"
                label="Captions"
                value={settings.includeSubtitles ? "Burned in" : "Off"}
                hint={
                  settings.includeSubtitles
                    ? `${(captionsConfig?.mode || settings.subtitleStyle) === "karaoke" ? "Karaoke word-pop" : "Normal"} · ${captionsConfig?.position || "bottom"}`
                    : "No subtitles in the video"
                }
              />
              <SummaryRow
                icon="🎨"
                label="Video look / filter"
                value={activeLook ? activeLook.name : "None"}
                hint={activeLook ? `${activeLook.tagline} · every scene` : "Pick one in Video Studio → Filters"}
              />
              <SummaryRow
                icon="🎵"
                label="Background music"
                value={musicSummary.value}
                hint={musicSummary.hint}
              />
              <SummaryRow
                icon="🔊"
                label="Sound effects"
                value={`${soundEffectCount} placed`}
                hint={soundEffectCount > 0 ? "Timeline inserts" : "None added in Studio"}
              />
              <SummaryRow icon="🛡️" label="Scenering watermark" value="On (top-left)" />
              <SummaryRow
                icon="🏷️"
                label="Brand logo"
                value={customerLogo?.enabled && customerLogo?.url ? "Custom logo on" : "Not set"}
                hint={customerLogo?.enabled && customerLogo?.url ? "Top-right corner" : "Upload in Video Studio"}
              />
            </dl>

            {onOpenSetup && (
              <button
                type="button"
                onClick={onOpenSetup}
                className="w-full mt-1 py-2 px-3 bg-gray-900 hover:bg-gray-750 border border-hairline rounded-xl text-[11px] font-semibold text-gray-200 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                <Icon glyph="⚙" />
                <span>Change these in Project Setup</span>
              </button>
            )}
          </div>

          <div className="bg-gray-800/30 border border-hairline rounded-xl p-3 flex items-start gap-2">
            <span className="text-sm"><Icon glyph="🔒" /></span>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              The render screen does not allow any changes. Go back to Scenes, Voiceover, Captions or Studio
              to edit your video — then render again.
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-8 space-y-4">

          {/* ---------- RENDER PROFILE (read-only) ---------------------------
              Every choice below was made in Project Setup — this screen only
              shows it and carries it out. No controls here on purpose: one
              render at a time; to render another version (say vertical for
              TikTok), go back to Setup, pick that destination, and render
              again. Finished videos wait in the Vault. */}
          <div className="bg-gray-800/50 border border-hairline rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Icon glyph="🎛" /> Render Profile
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900 border border-hairline text-gray-400">
                  Read-only — set in Project Setup
                </span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                <Icon glyph="✓" /> Optimized for social platforms
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Plain-English summary of what will be rendered */}
              <div className="bg-gray-900/70 border border-hairline rounded-lg p-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Destination</span>
                  <span className="text-white font-medium text-right">
                    {renderProfile.destination === "custom"
                      ? "Custom output"
                      : `${getPlatformProfile(renderProfile.destination)?.icon || ""} ${destinationLabel(renderProfile.destination)}`}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Video</span>
                  <span className="text-white font-medium text-right">
                    {currentDims.width} × {currentDims.height} · {effectiveFps} FPS
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Quality</span>
                  <span className="text-white font-medium text-right">{getQualityLevel(settings.quality).name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Audio</span>
                  <span className="text-white font-medium text-right">
                    {settings.format === "webm" ? "Opus" : "AAC"} · 48 kHz · Stereo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Format</span>
                  <span className="text-white font-medium text-right">
                    {settings.format.toUpperCase()} {settings.format === "mp4" ? "· web optimized" : ""}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Audio mastering</span>
                  <span className="text-white font-medium text-right">
                    {settings.audioMastering === "automatic" ? "Automatic" : "Manual"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Estimated size</span>
                  <span className="text-white font-medium text-right">
                    ~{estSizeMB < 1000 ? `${Math.max(1, Math.round(estSizeMB))} MB` : `${(estSizeMB / 1000).toFixed(1)} GB`}
                  </span>
                </div>
              </div>

              {/* Platform check for the chosen destination */}
              <div className="bg-gray-900/70 border border-hairline rounded-lg p-3">
                {destinationCheck ? (
                  <>
                    <p className="text-[11px] font-bold text-white mb-1.5">
                      Platform check — {destinationCheck.platform.icon} {destinationCheck.platform.name}{" "}
                      {destinationCheck.allOk ? (
                        <span className="text-emerald-400 font-semibold">· ready</span>
                      ) : (
                        <span className="text-amber-400 font-semibold">· recommendations</span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-500 leading-relaxed mb-1.5">
                      Choosing a platform preset sets MP4 and 30 FPS automatically. Browser codec support is checked before frame encoding; an unsupported format stops the render before a finished file is offered.
                    </p>
                    <ul className="space-y-0.5">
                      {destinationCheck.checks.map((c) => (
                        <li
                          key={c.id}
                          className={`text-[10px] leading-snug ${c.ok ? "text-gray-400" : "text-amber-300"}`}
                        >
                          {iconify(c.ok ? "✓" : "⚠")} <span className="font-medium">{c.label}</span> — {c.detail}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    <span className="font-bold text-white">Custom output</span> — no platform rules to check.
                    The video renders exactly as configured in Project Setup's Advanced overrides.
                  </p>
                )}
              </div>
            </div>

            {settings.quality === "draft" && (
              <p className="text-[10px] text-amber-300/90 leading-relaxed">
                <Icon glyph="⚡" /> Draft is a fast preview render at 720p — perfect while editing. Switch to High in Project
                Setup for the final platform-quality export.
              </p>
            )}
            {compatibilityWarnings.length > 0 && (
              <div className="p-2.5 bg-amber-950/50 border border-amber-800/70 rounded-lg space-y-1">
                {compatibilityWarnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-amber-300 leading-relaxed"><Icon glyph="⚠" /> {w}</p>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {onOpenSetup && (
                <button
                  type="button"
                  onClick={onOpenSetup}
                  className="px-3 py-2 bg-gray-900 hover:bg-gray-750 border border-hairline rounded-xl text-[11px] font-semibold text-gray-200 hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Icon glyph="⚙" /> Change these in Project Setup
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="px-3 py-2 bg-gray-900 hover:bg-gray-750 border border-hairline rounded-xl text-[11px] font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-1.5"
              >
                <Icon glyph="🔧" /> {showAdvanced ? "Hide" : "Show"} technical details
              </button>
            </div>

            {showAdvanced && (
              /* Read-only master values — one source of truth, shown honestly */
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[10px] bg-gray-900/60 border border-hairline rounded-lg p-3">
                <div><dt className="text-gray-500">Codec</dt><dd className="text-gray-200 font-medium">{settings.format === "webm" ? "VP9" : "H.264 / AVC"}</dd></div>
                <div><dt className="text-gray-500">Profile</dt><dd className="text-gray-200 font-medium">{settings.format === "webm" ? "—" : "High"}</dd></div>
                <div><dt className="text-gray-500">Pixel format</dt><dd className="text-gray-200 font-medium">yuv420p · SDR (BT.709)</dd></div>
                <div><dt className="text-gray-500">Frame rate mode</dt><dd className="text-gray-200 font-medium">Constant (CFR)</dd></div>
                <div><dt className="text-gray-500">Video bitrate</dt><dd className="text-gray-200 font-medium">{(currentVideoKbps / 1000).toFixed(1)} Mbps (auto)</dd></div>
                <div><dt className="text-gray-500">Quality target</dt><dd className="text-gray-200 font-medium">≈ CRF {getQualityLevel(settings.quality).crfEquivalent}</dd></div>
                <div><dt className="text-gray-500">Keyframe interval</dt><dd className="text-gray-200 font-medium">{MASTER_RENDER_PROFILE.keyframeIntervalSeconds} s</dd></div>
                <div><dt className="text-gray-500">Audio codec</dt><dd className="text-gray-200 font-medium">{settings.format === "webm" ? "Opus" : "AAC"} · 48 kHz · stereo</dd></div>
                <div><dt className="text-gray-500">Audio bitrate</dt><dd className="text-gray-200 font-medium">{currentAudioKbps} kbps</dd></div>
                <div><dt className="text-gray-500">Total frames</dt><dd className="text-gray-200 font-medium">{currentFrames.toLocaleString()} ({Math.round(totalDuration)}s × {effectiveFps})</dd></div>
                <div><dt className="text-gray-500">Container</dt><dd className="text-gray-200 font-medium">{settings.format.toUpperCase()}{settings.format === "mp4" ? " · fast-start" : ""}</dd></div>
                <div><dt className="text-gray-500">Mastering</dt><dd className="text-gray-200 font-medium">{settings.audioMastering === "automatic" ? "Automatic" : "Manual"}</dd></div>
              </dl>
            )}
          </div>


          {/* ---------- THE VAULT -------------------------------------------
              Finished renders wait here until they are downloaded. The slot
              frees itself the moment a download lands, and only the newest
              few renders are kept, so this can never grow without bound. */}
          <div className="bg-gray-800/50 border border-hairline rounded-xl p-4 shadow-lg">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg text-sm shrink-0" aria-hidden="true"><Icon glyph="🗄️" /></span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    The Vault
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900 border border-hairline text-gray-300">
                      {vaultRenders.length}/{MAX_VAULT_RENDERS} slots
                    </span>
                  </h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {vaultRenders.length === 0
                      ? `Finished videos wait here so nothing is lost. Download one and its slot clears itself (up to ${MAX_VAULT_RENDERS}).`
                      : "Download a video and it leaves the vault automatically. The oldest is dropped when all slots are full."}
                  </p>
                </div>
              </div>
              {job.active && (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-950/90 text-indigo-200">
                  <Icon glyph="⏳" /> Rendering {Math.round(job.progress * 100)}%
                </span>
              )}
            </div>

            {job.active && !isRendering && (
              <p className="mt-2 text-[11px] text-indigo-300 leading-relaxed">
                A render is running in the background ({Math.round(job.progress * 100)}% · {job.stage}).
                Keep working — it will drop into the vault the moment it finishes.
              </p>
            )}
            {job.error && (
              <p className="mt-2 text-[11px] text-rose-300 leading-relaxed">Last render failed: {job.error}</p>
            )}
            {vaultMessage && (
              <p className="mt-2 text-[11px] text-emerald-300 leading-relaxed">{vaultMessage}</p>
            )}
            {vaultError && (
              <p role="alert" className="mt-2 text-[11px] text-rose-300 leading-relaxed">
                <Icon glyph="⚠" /> {vaultError}
              </p>
            )}

            {vaultRenders.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {vaultRenders.map((row) => (
                  <li key={row.id} className="bg-gray-900/70 border border-hairline rounded-lg p-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-white truncate">{row.title}</p>
                        <p className="text-[10px] text-gray-400">
                          {row.label} · {formatVaultTime(row.durationSec)} · {formatVaultSize(row.sizeBytes)} ·{" "}
                          {new Date(row.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setVaultPreviewId(vaultPreviewId === row.id ? null : row.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-hairline transition-colors"
                        >
                          {iconify(vaultPreviewId === row.id ? "▾ Hide" : "▶ Preview")}
                        </button>
                        <button
                          onClick={() => void downloadVaultRender(row)}
                          disabled={vaultBusyId !== null}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white transition-colors"
                        >
                          {iconify(vaultBusyId === row.id ? "Saving…" : "⬇ Download")}
                        </button>
                        <button
                          onClick={() => void removeVaultRender(row)}
                          title="Remove from the vault"
                          className="px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-gray-800 hover:bg-rose-900/60 text-gray-400 hover:text-rose-200 border border-hairline transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {vaultPreviewId === row.id && vaultPreviewUrl && (
                      <video
                        src={vaultPreviewUrl}
                        controls
                        playsInline
                        // Watch only: the browser's own Download / "Save video
                        // as…" would hand out a copy that is never counted.
                        controlsList="nodownload"
                        onContextMenu={(event) => event.preventDefault()}
                        className="mt-2 w-full rounded-lg bg-black max-h-[320px]"
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-gray-500">
                Empty for now. Every finished render lands here automatically.
              </p>
            )}
          </div>
          <div className="bg-gray-800/50 border border-hairline rounded-xl overflow-hidden shadow-2xl">
            {/* Viewport: Live Render Canvas, with the finished player overlaid.
                The canvas STAYS MOUNTED even while a finished video is being
                previewed — the multi-platform queue renders several masters
                back-to-back, and unmounting the canvas between them is what
                made every master after the first fail with "canvas not
                available". */}
            <div className={`relative ${aspectClass || "aspect-video"} bg-black flex items-center justify-center overflow-hidden mx-auto`}>
              <canvas
                ref={canvasRef}
                className={`w-full h-full object-contain bg-black ${
                  isRendering ? "opacity-100" : "opacity-40"
                } ${renderedUrl && !isRendering ? "invisible" : ""}`}
              />
              {renderedUrl && !isRendering && (
                <video
                  src={renderedUrl}
                  controls
                  autoPlay={false}
                  preload="metadata"
                  // Watch only: the browser's own Download / "Save video as…"
                  // would hand out a copy that is never counted. Downloads
                  // happen in the Vault, where each one counts.
                  controlsList="nodownload"
                  onContextMenu={(event) => event.preventDefault()}
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              )}
              {!isRendering && !renderedUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/50 backdrop-blur-[2px]">
                  <div className="w-16 h-16 rounded-full bg-indigo-600/90 text-white flex items-center justify-center text-3xl shadow-lg mb-3">
                    ⚡
                  </div>
                  <h4 className="text-lg font-bold text-white mb-1">
                    Ready to Render
                  </h4>
                  <p className="text-xs text-gray-300 max-w-sm">
                    Click "Start Video Render" to compile audio narration, camera motion, cinematic filters, overlays, and crisp watermark into a polished video file.
                  </p>
                </div>
              )}

              {/* Rendering Overlay */}
              {isRendering && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                  <div className="relative mb-4">
                    <svg className="animate-spin h-14 w-14 text-indigo-500" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                      {Math.round(renderProgress * 100)}%
                    </span>
                  </div>

                  <h4 className="text-base font-semibold text-white mb-2">
                    Rendering Video in {resLabel}
                  </h4>
                  <div className="mb-2 grid w-full max-w-md grid-cols-4 gap-1" aria-label="Render stages">
                    {[
                      { label: "Prepare", at: 0 },
                      { label: "Audio mix", at: 0.32 },
                      { label: "Frames", at: 0.35 },
                      { label: "Package", at: 0.86 },
                    ].map((stage, index) => {
                      const active = renderProgress >= stage.at;
                      const complete = index < 3 && renderProgress >= [0.32, 0.35, 0.86][index];
                      return (
                        <div
                          key={stage.label}
                          className={`rounded-md border px-1.5 py-1 text-[9px] font-bold ${
                            complete
                              ? "border-emerald-700/70 bg-emerald-950/70 text-emerald-300"
                              : active
                                ? "border-indigo-500/80 bg-indigo-950/80 text-indigo-200"
                                : "border-hairline bg-gray-900/80 text-gray-500"
                          }`}
                        >
                          {complete ? "✓ " : `${index + 1}. `}{stage.label}
                        </div>
                      );
                    })}
                  </div>
                  <div className={`mb-2 px-2.5 py-1 rounded-full border text-[10px] font-bold ${
                    renderEngine === "frame-exact"
                      ? "bg-emerald-950 border-emerald-600 text-emerald-300"
                      : renderEngine === "failed"
                      ? "bg-rose-950 border-rose-600 text-rose-300"
                      : "bg-indigo-950 border-indigo-600 text-indigo-300"
                  }`}>
                    {iconify(
                      renderEngine === "frame-exact"
                        ? "✓ FINISHING THE VIDEO"
                        : renderEngine === "failed"
                        ? "✕ THIS BROWSER COULD NOT FINISH THE VIDEO"
                        : "PREPARING THE VIDEO…",
                    )}
                  </div>
                  <p className="text-xs text-indigo-300 font-medium mb-3">{renderStage}</p>

                  <div className="w-full max-w-md bg-gray-800 rounded-full h-2 overflow-hidden border border-hairline">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-150"
                      style={{ width: `${Math.round(renderProgress * 100)}%` }}
                    />
                  </div>

                  {/* Long-render safety dashboard: visible proof of what the
                      engine is doing instead of one opaque percentage at 94%. */}
                  <div className="mt-4 w-full max-w-xl rounded-xl border border-hairline bg-gray-950/80 p-3 text-left shadow-2xl">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Elapsed</p>
                        <p className="text-[11px] font-bold text-white">{formatMs(renderHealth.elapsedMs)}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Approx. left</p>
                        <p className="text-[11px] font-bold text-white">
                          {renderProgress > 0.03 && renderProgress < 0.99
                            ? formatMs((renderHealth.elapsedMs / renderProgress) * (1 - renderProgress))
                            : "Calculating…"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Frames</p>
                        <p className="text-[11px] font-bold text-white">
                          {renderHealth.totalFrames > 0
                            ? `${renderHealth.framesDone.toLocaleString()} / ${renderHealth.totalFrames.toLocaleString()}`
                            : "Preparing…"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-gray-500">Output written</p>
                        <p className="text-[11px] font-bold text-white">{formatStorageBytes(renderHealth.outputBytes)}</p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span
                        title={renderHealth.outputStorageDetail}
                        className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                          renderHealth.outputStorage === "disk"
                            ? "border-emerald-600/70 bg-emerald-950/80 text-emerald-200"
                            : renderHealth.outputStorage === "memory"
                              ? "border-amber-600/70 bg-amber-950/80 text-amber-200"
                              : "border-indigo-600/70 bg-indigo-950/80 text-indigo-200"
                        }`}
                      >
                        {renderHealth.outputStorage === "disk"
                          ? "✓ OUTPUT STREAMING TO DISK"
                          : renderHealth.outputStorage === "memory"
                            ? "⚠ MEMORY OUTPUT FALLBACK"
                            : "… CHECKING OUTPUT STORAGE"}
                      </span>
                      <span className="rounded-full border border-emerald-700/60 bg-emerald-950/60 px-2 py-1 text-[9px] font-bold text-emerald-200">
                        ✓ 3-SCENE ASSET WINDOW
                      </span>
                      <span className="rounded-full border border-emerald-700/60 bg-emerald-950/60 px-2 py-1 text-[9px] font-bold text-emerald-200">
                        ✓ PACKED AUDIO ANALYSIS
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                        renderHealth.wakeLock === "active"
                          ? "border-emerald-700/60 bg-emerald-950/60 text-emerald-200"
                          : "border-hairline bg-gray-900 text-gray-400"
                      }`}>
                        {renderHealth.wakeLock === "active" ? "✓ DEVICE KEPT AWAKE" : "BROWSER MANAGES WAKE"}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                        renderHealth.offCadenceFrames === 0
                          ? "border-emerald-700/60 bg-emerald-950/60 text-emerald-200"
                          : "border-rose-700/70 bg-rose-950/80 text-rose-200"
                      }`}>
                        {renderHealth.offCadenceFrames === 0
                          ? "✓ EVERY FRAME ON ITS OWN CLOCK TICK"
                          : `⚠ ${renderHealth.offCadenceFrames} FRAMES OFF-CLOCK`}
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] leading-relaxed text-gray-300">
                      {renderHealth.motionCheck}
                    </p>
                    <p className="mt-2 text-[9px] leading-relaxed text-gray-400">
                      {renderHealth.tabHidden
                        ? "This tab is in the background. Message-channel yielding keeps the encode moving without timer throttling."
                        : renderHealth.outputStorageDetail}
                      {renderHealth.queuedOutputBytes > 0
                        ? ` · ${formatStorageBytes(renderHealth.queuedOutputBytes)} waiting for disk`
                        : ""}
                    </p>
                  </div>

                </div>
              )}
            </div>

            {/* Controls / Progress / Download Area */}
            <div className="p-4 space-y-4">
              {renderError && failureReport ? (
                /* Never a bare "Rendering failed" — and never the encoder's
                   own words either. Plain sentences, the automatic retry, and
                   a short support code for the console/support channel; the
                   raw log is logged, not printed at the customer. */
                <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl space-y-2">
                  <p className="text-red-200 text-xs font-bold flex items-center gap-2">
                    <Icon glyph="⚠" /> {failureReport.title}
                  </p>
                  <p className="text-red-300/90 text-[11px] leading-relaxed">{failureReport.explanation}</p>
                  <p className="text-red-300/70 text-[11px] leading-relaxed">{failureReport.retryHint}</p>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {failureReport.canAutoRetry && (
                      <button
                        type="button"
                        onClick={retryWithFallback}
                        disabled={isRendering}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
                      >
                        <Icon glyph="🔄" /> Try again
                      </button>
                    )}
                    <span
                      title="Quote this if you contact support — it identifies the exact failure in our logs."
                      className="text-[10px] font-mono text-red-400/60 select-all"
                    >
                      {failureReport.code}
                    </span>
                  </div>
                </div>
              ) : renderError ? (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-red-300 text-xs flex items-center gap-2">
                  <Icon glyph="⚠" />
                  <span>{renderError}</span>
                </div>
              ) : null}

              {exportFormatNote && !renderError && (
                /* The only format message a customer ever sees: what the file
                   they are about to download actually is, in one sentence. */
                <div className="p-3 bg-gray-900/80 border border-hairline rounded-lg flex items-start gap-2">
                  <Icon glyph="🎬" />
                  <p className="text-[11px] leading-relaxed text-gray-300 flex-1">{exportFormatNote}</p>
                  <button
                    type="button"
                    onClick={() => setExportFormatNote(null)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {fallbackNotes.length > 0 && !renderError && (
                /* An automatic retry is never silent — but the customer gets
                   one plain sentence, not the list of encoder changes. The
                   detail is logged to the console for support. */
                <div className="p-3 bg-indigo-950/50 border border-indigo-800/70 rounded-lg flex items-start gap-2">
                  <Icon glyph="🔄" />
                  <p className="text-indigo-200 text-[11px] leading-relaxed flex-1">
                    Scenering adjusted the export automatically so the video could finish.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFallbackNotes([])}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {imageFallbackCount > 0 && (
                <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-amber-300 text-xs flex items-start gap-2">
                  <Icon glyph="🖼" />
                  <span>
                    {imageFallbackCount} scene image{imageFallbackCount === 1 ? "" : "s"} could not be loaded and rendered as
                    placeholder card{imageFallbackCount === 1 ? "" : "s"}. Re-search those scenes in the Scenes step to get
                    real photos into the export.
                  </span>
                </div>
              )}

              {/* There is no switch any more, and no second renderer to switch
                  to. Every frame is drawn from the timeline and encoded on its
                  own timestamp; a browser that cannot do that is told so
                  rather than given a real-time recorder whose motion depends
                  on how busy the machine is. */}
              {!isRendering && !renderedUrl && (
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/70">
                  <p className="text-[11px] font-bold text-emerald-200">Frame-exact rendering, always</p>
                  <p className="text-[10px] text-emerald-300/75 leading-relaxed">
                    {/* One engine, one container: H.264 + AAC MP4 at the frame rate chosen in Setup.
                        Nothing is substituted and nothing is renamed. */}
                    Every frame is drawn from the timeline and encoded on its own timestamp, then the
                    finished MP4 is read back and checked — container, frame count, constant frame rate
                    and audio length — before it is offered for download.
                  </p>
                </div>
              )}

              {offlineFailureReason && !isRendering && (
                <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-800/70">
                  <p className="text-[11px] font-bold text-amber-200">Frame-exact diagnostic</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-300 break-words">{offlineFailureReason}</p>
                </div>
              )}

              {/* An unreadable clip soundtrack is a real problem with the
                  finished file, so it stands here with the other pre-render
                  warnings rather than sitting in the console. */}
              {clipAudioNotice && (
                <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-800/70">
                  <p className="text-[11px] font-bold text-amber-200">Original sound</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-300 break-words">{clipAudioNotice}</p>
                </div>
              )}

              {/* What this download will go without.
                  Standing on the page BEFORE the button, not sprung at the
                  end of a ten-minute encode: a VIP effect stays in the
                  project and in the preview, and is simply not written into
                  the file. Saying which ones, by name, is the difference
                  between a limit and a trick. */}
              {vipFindings.length > 0 && !isRendering && (
                <div className="p-3 rounded-xl border border-amber-700/60 bg-amber-950/25 space-y-2">
                  <p className="flex items-center gap-2 text-[11px] font-bold text-amber-200">
                    <span className="vip-flame is-compact">
                      <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
                    </span>
                    <span>
                      {vipFindings.length} VIP {vipFindings.length === 1 ? "choice" : "choices"} in this video
                    </span>
                  </p>
                  <ul className="space-y-1">
                    {vipFindings.map((finding) => (
                      <li key={finding.id} className="text-[10px] leading-relaxed text-amber-100/85">
                        <span className="font-semibold">{finding.label}</span>
                        <span className="text-amber-300/70"> — {finding.detail}</span>
                        <span className={`ml-1 font-semibold ${finding.leaveOut ? "text-amber-300" : "text-rose-300"}`}>
                          {finding.leaveOut ? "Left out of the download." : "Must be changed first."}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-amber-300/70 leading-relaxed">
                    They stay in your project and in the preview. {vipBlocking.length === 0
                      ? "The downloaded file is rendered without them."
                      : "The download cannot start until the ones marked above are changed."}
                  </p>
                  <button
                    type="button"
                    onClick={openMembershipPlans}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-amber-50 text-[10px] font-bold transition-colors"
                  >
                    Include them — see VIP plans
                  </button>
                </div>
              )}

              {/* Primary Action Button: Render or Re-Render */}
              {!renderedUrl ? (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={toggleRender}
                    disabled={isPreparingRender || isCancelling || (!isRendering && scenesWithImages.length === 0)}
                    aria-pressed={isRendering || isPreparingRender}
                    aria-label={isRendering ? (isCancelling ? "Cancelling video render" : "Cancel video render") : isPreparingRender ? "Preparing video render" : "Start video render"}
                    className={`t-btn-hero w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 text-sm ${
                      isRendering
                        ? "bg-rose-700 hover:bg-rose-600"
                        : isPreparingRender
                          ? "bg-amber-700"
                          : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      {isRendering ? (
                        <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </>
                      )}
                    </svg>
                    <span>
                      {isRendering
                        ? isCancelling ? "Cancelling Render…" : "Cancel Render"
                        : isPreparingRender
                          ? "Preparing Render…"
                          : settings.quality === "draft"
                            ? `Quick Preview Render (${getDimensions("720p").width} × ${getDimensions("720p").height})`
                            : `Start Video Render (${resLabel.split(" ")[0]})`}
                    </span>
                  </button>
                  <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                    {getQualityLevel(settings.quality).name} quality · {effectiveFps} FPS constant · {settings.format === "webm" ? "VP9 WebM" : "H.264 · AAC · MP4 · web optimized"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-green-950/50 border border-green-800/80 rounded-xl text-green-300 text-xs flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2 font-medium flex-wrap">
                      <Icon glyph="✅" /> Video rendered successfully! Format: {renderedContainer.toUpperCase()} · {exportValidation ? exportValidation.summary : resLabel}
                      <span className={`ml-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                        renderEngine === "frame-exact"
                          ? "bg-emerald-900 border-emerald-600 text-emerald-100"
                          : "bg-amber-900 border-amber-600 text-amber-100"
                      }`}>
                        {renderEngine === "frame-exact" ? "FRAME-EXACT WEBCODECS" : "RENDER INCOMPLETE"}
                      </span>
                      {outputAudit && (
                        <span
                          title={outputAudit.problems.join(" ")}
                          className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                            outputAudit.ok
                              ? "border-emerald-500/70 bg-emerald-950/80 text-emerald-100"
                              : "border-amber-500/70 bg-amber-950/90 text-amber-100"
                          }`}
                        >
                          {outputAudit.ok
                            ? `MP4 VERIFIED · ${outputAudit.video?.sampleCount ?? 0} FRAMES · ${(outputAudit.video?.frameRate ?? 0).toFixed(0)} FPS CFR`
                            : "MP4 CHECK FOUND A PROBLEM"}
                        </span>
                      )}
                      {exportValidation?.ok && (
                        <span className="px-2 py-0.5 rounded-full border border-teal-500/70 bg-teal-950/80 text-teal-100 text-[9px] font-bold">
                          VERIFIED OUTPUT
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={toggleRender}
                      disabled={isPreparingRender || isCancelling}
                      aria-pressed={isRendering || isPreparingRender}
                      aria-label={isRendering ? (isCancelling ? "Cancelling video render" : "Cancel video render") : isPreparingRender ? "Preparing video render" : "Re-render video"}
                      className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${
                        isRendering
                          ? "bg-rose-700 hover:bg-rose-600 border-rose-500 text-white"
                          : isPreparingRender
                            ? "bg-amber-700 border-amber-500 text-white"
                            : "bg-gray-800 hover:bg-gray-700 border-hairline text-gray-200"
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <Icon glyph={isRendering ? "■" : isPreparingRender ? "…" : "🔄"} /> {isRendering ? (isCancelling ? "Cancelling…" : "Cancel Render") : isPreparingRender ? "Preparing Render…" : "Re-render"}
                    </button>
                  </div>

                  {/* Said once more after the fact, so the file in the Vault
                      is never a mystery: this is what is not in it. */}
                  {vipOmittedLast.length > 0 && (
                    <div className="p-3 rounded-xl border border-amber-700/60 bg-amber-950/25">
                      <p className="flex items-center gap-2 text-[11px] font-bold text-amber-200">
                        <span className="vip-flame is-compact">
                          <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
                        </span>
                        <span>Rendered without {vipOmittedLast.length} VIP {vipOmittedLast.length === 1 ? "choice" : "choices"}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-amber-100/80 leading-relaxed">
                        {vipOmittedLast.map((finding) => finding.label).join(" · ")} — still in your project and in the
                        preview, and included in every download on SceneFlow and SceneForge.
                      </p>
                    </div>
                  )}

                  {/* No download button here, on purpose: the Vault above is the
                      ONE place a finished video is downloaded, because every
                      download counts against the plan (downloadVaultRender →
                      recordVideoDownload). */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-[10px] text-gray-400 leading-relaxed flex-1 min-w-[200px]">
                      <Icon glyph="🗄" /> This render is also parked in <span className="font-semibold text-gray-300">The Vault</span> above —
                      every finished video waits there until you download it, so nothing gets lost between renders.
                    </p>
                  </div>

                  {/* The finished file, read back the way a player reads it.
                      This is the answer to "is it really the MP4 I asked for,
                      with smooth, even motion?" — from the bytes, not from
                      what the encoder was asked to do. */}
                  {outputAudit && (
                    <div
                      className={`p-3 rounded-xl border space-y-1.5 ${
                        outputAudit.ok
                          ? "bg-emerald-950/40 border-emerald-800/70"
                          : "bg-amber-950/40 border-amber-700/70"
                      }`}
                    >
                      <p className={`text-[11px] font-bold ${outputAudit.ok ? "text-emerald-200" : "text-amber-200"}`}>
                        <Icon glyph={outputAudit.ok ? "✅" : "⚠"} /> {describeAudit(outputAudit)}
                      </p>
                      <p className="text-[10px] leading-relaxed text-gray-300">
                        Container {outputAudit.brand ? `“${outputAudit.brand}”` : "unrecognised"} ·{" "}
                        {outputAudit.video
                          ? `${outputAudit.video.sampleCount.toLocaleString()} frames at ${
                              outputAudit.video.frameRate
                                ? `${outputAudit.video.frameRate.toFixed(2)} fps constant frame rate`
                                : "variable frame timing"
                            }${outputAudit.video.codecDetail ? ` · ${outputAudit.video.codecDetail}` : ""}`
                          : "no video track"}{" "}
                        · index at the {outputAudit.fastStart ? "front" : "end"}
                      </p>
                      {motionAudit && (
                        <p className={`text-[10px] leading-relaxed ${motionAudit.repeated > 0 ? "text-amber-200/90" : "text-gray-400"}`}>
                          {motionAudit.summary}
                        </p>
                      )}
                      {outputAudit.problems.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {outputAudit.problems.map((problem, index) => (
                            <li key={index} className="text-[10px] leading-relaxed text-amber-100/90">
                              • {problem}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* How long the render took, on screen rather than hidden
                      in the browser console. Nobody should need developer
                      tools to answer "why was that slow", and the one button
                      copies the whole thing for pasting into a bug report. */}
                  {renderTiming && (
                    <div className="p-3 bg-gray-900/70 border border-hairline rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-[11px] font-bold text-gray-200">
                          <Icon glyph="⏱" /> How long this render took
                        </p>
                        <button
                          type="button"
                          onClick={() => void copyTimingReport()}
                          className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] border border-hairline transition-colors"
                        >
                          {timingCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <pre className="text-[10px] leading-relaxed text-gray-300 font-mono whitespace-pre overflow-x-auto m-0">
{renderTiming}
                      </pre>
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        Each line is one part of the job and how much of the total it used.
                      </p>
                    </div>
                  )}

                  {/* One render at a time, by design: another platform =
                      back to Setup, pick that destination, render again. */}
                  <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-[11px] text-indigo-200 leading-relaxed">
                    <span className="font-bold">Need this video for another platform?</span>{" "}
                    Go back to <span className="font-semibold">Project Setup</span>, pick the new destination
                    (say, TikTok for a vertical cut), and render again — this finished video stays safe in the
                    Vault while the next one renders.
                    {onOpenSetup && (
                      <button
                        type="button"
                        onClick={onOpenSetup}
                        className="ml-2 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold transition-colors"
                      >
                        Open Project Setup →
                      </button>
                    )}
                  </div>
                  {renderedContainer !== "mp4" && (
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      This browser records WebM instead of MP4 (Firefox is the usual case) — the file plays
                      everywhere and every platform and editor accepts or converts it.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Video Attribution & Credits Section */}
      <div className="bg-gray-900/90 border border-hairline rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-sm" aria-hidden="true"><Icon glyph="📜" /></span>
              <h3 className="text-base font-bold text-white">
                Video Description Attribution & License Credits
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                Royalty-Free Compliant
              </span>
            </div>
            <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
              Copy or download this attribution document to paste into your YouTube, TikTok, Vimeo, or Instagram video description to credit the free audio sounds and 3D graphics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAttributionPreview(!showAttributionPreview)}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-hairline transition-colors flex items-center gap-1.5 shadow"
            >
              <Icon glyph="👁" />
              <span>{showAttributionPreview ? "Hide Credits" : "View Credits"}</span>
            </button>

            <button
              type="button"
              onClick={downloadAttributionDoc}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-hairline transition-colors flex items-center gap-1.5 shadow"
            >
              <Icon glyph="⬇" />
              <span>Download (.txt)</span>
            </button>

            <button
              type="button"
              onClick={copyAttributionDoc}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 ${
                copiedAttribution
                  ? "bg-emerald-600 text-white animate-pulse"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              <span>{iconify(copiedAttribution ? "✅" : "📋")}</span>
              <span>{copiedAttribution ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* Live Document Preview Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-mono text-[11px] text-indigo-300">credits_attribution.txt</span>
            <button
              type="button"
              onClick={() => setShowAttributionPreview(!showAttributionPreview)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {showAttributionPreview ? "Collapse Document" : "Expand Document"}
            </button>
          </div>

          {showAttributionPreview && (
            <div className="relative">
              <pre className="w-full bg-black/80 border border-hairline rounded-xl p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-64 scrollbar-thin select-all leading-relaxed">
                {getAttributionText()}
              </pre>
              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  onClick={copyAttributionDoc}
                  className="px-2.5 py-1 rounded bg-gray-800/90 hover:bg-gray-700 border border-hairline text-gray-200 text-[10px] font-medium transition-colors"
                >
                  {iconify(copiedAttribution ? "✓ Copied" : "Copy")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The warning at the moment of pressing Render.
          A final download is minutes of work and a weekly allowance, so the
          last word before it starts belongs to the creator: here is what is
          VIP, here is what will happen, carry on or go and change it. */}
      {vipPrompt && (
        <div
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vip-render-warning-title"
        >
          <div className="w-full max-w-lg my-auto rounded-2xl border border-amber-700/70 bg-gray-950 shadow-2xl">
            <div className="p-5 border-b border-hairline flex items-start gap-3">
              <span className="vip-flame mt-0.5">
                <span className="vip-flame-mark" aria-hidden="true">✦</span>VIP
              </span>
              <div>
                <h3 id="vip-render-warning-title" className="text-base font-bold text-white">
                  {vipBlocking.length > 0
                    ? "This download needs a change first"
                    : "Your download will go without these"}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Everything here works in the preview and stays in your project. It is the final file that
                  {" "}{vipBlocking.length > 0 ? "cannot carry it" : "goes without it"}.
                </p>
              </div>
            </div>

            {/* The overlay itself is the scrolling layer (one page per
                modal); this list flows inside it. */}
            <ul className="p-5 space-y-2.5">
              {vipFindings.map((finding) => (
                <li key={finding.id} className="rounded-xl border border-hairline bg-gray-900/70 p-3">
                  <p className="text-xs font-bold text-gray-100">{finding.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{finding.detail}</p>
                  <p className={`text-[10px] font-bold mt-1.5 ${finding.leaveOut ? "text-amber-300" : "text-rose-300"}`}>
                    {finding.leaveOut ? "Will not be rendered into the file." : "Change it before downloading."}
                  </p>
                  {finding.fixIn && onNavigateToStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setVipPrompt(null);
                        onNavigateToStep(finding.fixIn === "voiceover" ? "voiceover" : "captions");
                      }}
                      className="mt-2 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-[10px] font-semibold transition-colors"
                    >
                      Go to the {finding.fixIn === "voiceover" ? "Voiceover" : "Captions"} step
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="p-5 border-t border-hairline flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVipPrompt(null)}
                className="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openMembershipPlans}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-amber-50 text-xs font-bold transition-colors"
              >
                Include them — see VIP plans
              </button>
              {vipBlocking.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const pending = vipPrompt;
                    setVipPrompt(null);
                    void handleStartRender(pending?.format, pending?.plan, true);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                >
                  Render without them
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
